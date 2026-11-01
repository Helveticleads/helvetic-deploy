#!/usr/bin/env node
/**
 * GARDE DE CONFORMITE DU SOCLE BATIMENT.
 *
 * Elle repond a une seule question : la copie d'un site a-t-elle DERIVE du
 * gabarit de reference ?
 *
 * === CE QU'ELLE COMPARE, ET CE QU'ELLE LAISSE LIBRE ===
 *
 * Elle compare le TEXTE des fichiers du socle, apres avoir retire :
 *   - les ZONES LIBRES, delimitees dans le gabarit lui-meme par
 *       /* socle:libre:debut <raison> *\/  …  /* socle:libre:fin *\/
 *     (les libelles de langue, par exemple) ;
 *   - les fins de ligne et les espaces de fin de ligne.
 *
 * Elle ne compare NI les jetons de style NI les valeurs de configuration :
 * ils ne sont pas dans les fichiers du socle. La palette et la typographie de
 * chaque site vivent dans son `index.css` et dans sa configuration Tailwind,
 * que le socle ne touche pas. C'est ce qui rend l'anti-harmonisation de la
 * charte compatible avec un gabarit commun.
 *
 * === DEUX NIVEAUX, ET POURQUOI ===
 *
 * 1. DANS LE BUILD DU SITE. Le site porte sa copie du socle, la copie de cette
 *    garde (`scripts/garde-socle.mjs`) et le manifeste des empreintes
 *    (`scripts/socle-manifeste.json`). La garde recalcule l'empreinte de
 *    chaque copie et la compare au manifeste. Elle tourne hors ligne, a chaque
 *    build, et attrape la derive ordinaire : quelqu'un a modifie l'en-tete
 *    d'un site sans passer par le socle.
 *
 * 2. DANS LA CI, EN OPTION. Appelee avec `--reference <dossier>`, elle compare
 *    la copie du site aux fichiers REELS du socle, tires de helvetic-deploy au
 *    SHA du workflow. C'est le niveau qui attrape le cas ou quelqu'un a
 *    modifie la copie ET le manifeste du meme geste.
 *
 * === LES MESURES D'EFFET ===
 *
 * Comparer du texte ne prouve pas qu'un site se comporte bien. La garde pose
 * donc aussi quelques questions sur l'EFFET, qui ne dependent d'aucune
 * reference (voir `ops/GARDES-PAR-NOM.md`) :
 *   - chaque gabarit de page passe par `Layout`, la page introuvable comprise ;
 *   - le numero du site est vide ou au format suisse, et jamais le faux
 *     numero de demonstration ;
 *   - le consentement part de la case, jamais ecrit en dur ;
 *   - tout fichier qui construit une charge de lead monte le bloc de
 *     consentement ;
 *   - la politique de securite du contenu porte les deux origines du widget ;
 *   - le prerendu rend la page introuvable au lieu de recopier la coquille.
 *
 * Usage :
 *   node scripts/garde-socle.mjs                      (depuis le dossier du site)
 *   node ops/garde-socle/verifier.mjs <site> --reference socle/batiment
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEBUT_LIBRE = /\/\*\s*socle:libre:debut[^\n]*\*\//;
const FIN_LIBRE = /\/\*\s*socle:libre:fin\s*\*\//;
const DEBUT_LIBRE_DIESE = /^#\s*socle:libre:debut/;
const FIN_LIBRE_DIESE = /^#\s*socle:libre:fin/;

/** Retire les zones libres, les fins de ligne et les espaces de fin de ligne. */
export function normaliser(texte) {
  const lignes = texte.replace(/\r\n/g, "\n").split("\n");
  const gardees = [];
  let dansLibre = false;
  for (const ligne of lignes) {
    if (!dansLibre && (DEBUT_LIBRE.test(ligne) || DEBUT_LIBRE_DIESE.test(ligne))) {
      dansLibre = true;
      gardees.push("<<socle:libre>>");
      continue;
    }
    if (dansLibre) {
      if (FIN_LIBRE.test(ligne) || FIN_LIBRE_DIESE.test(ligne)) dansLibre = false;
      continue;
    }
    gardees.push(ligne.replace(/[ \t]+$/, ""));
  }
  if (dansLibre) {
    throw new Error("zone libre ouverte et jamais refermee");
  }
  while (gardees.length && gardees[gardees.length - 1] === "") gardees.pop();
  return gardees.join("\n");
}

export function empreinte(texte) {
  return crypto.createHash("sha256").update(normaliser(texte), "utf8").digest("hex");
}

function lire(p) {
  return fs.readFileSync(p, "utf8");
}

function listerFichiers(dir, filtre) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && filtre(e.name))
    .map((e) => path.join(dir, e.name));
}

function premiereLigneDifferente(attendu, obtenu) {
  const a = attendu.split("\n");
  const b = obtenu.split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return {
        ligne: i + 1,
        attendu: a[i] === undefined ? "(fin du fichier)" : a[i].trim().slice(0, 120),
        obtenu: b[i] === undefined ? "(fin du fichier)" : b[i].trim().slice(0, 120),
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Mesures d'effet                                                     */
/* ------------------------------------------------------------------ */

const FAUX_NUMERO = "079 123 45 67";

function mesuresEffet(site, defauts) {
  /* 1. Chaque gabarit de page passe par Layout, la 404 comprise. */
  const pages = listerFichiers(path.join(site, "src/pages"), (n) => n.endsWith(".tsx"));
  const sansLayout = pages.filter((p) => !/<Layout[\s>]/.test(lire(p))).map((p) => path.basename(p));
  if (pages.length === 0) {
    defauts.push("effet:aucun gabarit de page trouve sous src/pages");
  } else if (sansLayout.length > 0) {
    defauts.push(
      `effet:gabarits de page sans Layout, donc sans en-tete ni pied : ${sansLayout.join(", ")}`,
    );
  }

  /* 2. Le numero : vide, ou format suisse. Jamais le faux numero. */
  const fConfig = path.join(site, "src/data/config.ts");
  if (!fs.existsSync(fConfig)) {
    defauts.push("effet:src/data/config.ts absent");
  } else {
    const config = lire(fConfig);
    const m = config.match(/\bphone:\s*"([^"]*)"/);
    if (!m) {
      defauts.push("effet:src/data/config.ts ne declare pas de champ phone");
    } else {
      const valeur = m[1].trim();
      if (valeur && !/^\+41(\s\d{2}){1}(\s\d{3})(\s\d{2}){2}$/.test(valeur) && !/^0\d{2}( \d{3})( \d{2}){2}$/.test(valeur)) {
        defauts.push(
          `effet:le numero "${valeur}" n'est ni vide ni au format suisse attendu ("+41 XX XXX XX XX" ou "0XX XXX XX XX")`,
        );
      }
    }
    if (!/\bphoneMention\b/.test(config)) {
      defauts.push(
        "effet:src/data/config.ts ne declare pas phoneMention, la mention posee a cote du numero",
      );
    }
  }

  /* Le faux numero de demonstration ne doit vivre nulle part dans la source. */
  const fauxTrouves = [];
  (function parcourir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
        parcourir(p);
      } else if (/\.(tsx?|mjs|json|css|html)$/.test(e.name)) {
        if (lire(p).includes(FAUX_NUMERO)) fauxTrouves.push(path.relative(site, p));
      }
    }
  })(path.join(site, "src"));
  if (fauxTrouves.length > 0) {
    defauts.push(`effet:faux numero de demonstration "${FAUX_NUMERO}" present dans ${fauxTrouves.join(", ")}`);
  }

  /* 3. Le consentement part de la case, jamais ecrit en dur. */
  const fApi = path.join(site, "src/lib/api.ts");
  if (!fs.existsSync(fApi)) {
    defauts.push("effet:src/lib/api.ts absent");
  } else {
    const api = lire(fApi);
    if (/consent:\s*true\b/.test(api)) {
      defauts.push(
        "effet:src/lib/api.ts ecrit consent: true en dur. Un consentement affirme par le code n'est pas un consentement",
      );
    }
    if (!/\bwebsite:\s*opts\.piege/.test(api)) {
      defauts.push("effet:src/lib/api.ts ne transmet pas la valeur du champ piege dans website");
    }
  }

  /* 4. Tout fichier qui construit une charge monte le bloc de consentement. */
  const sources = [];
  (function parcourir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        parcourir(p);
      } else if (e.name.endsWith(".tsx")) {
        sources.push(p);
      }
    }
  })(path.join(site, "src"));
  const sansBloc = sources
    .filter((p) => /construireCharge\s*\(/.test(lire(p)))
    .filter((p) => !/<BlocConsentement\b/.test(lire(p)))
    .map((p) => path.relative(site, p));
  if (sansBloc.length > 0) {
    defauts.push(
      `effet:formulaires qui envoient un lead sans monter BlocConsentement : ${sansBloc.join(", ")}`,
    );
  }

  /* 5. La politique de securite du contenu porte les deux origines du widget. */
  const fCsp = path.join(site, "deploy/csp-batiment.conf");
  if (!fs.existsSync(fCsp)) {
    defauts.push("effet:deploy/csp-batiment.conf absent");
  } else {
    const csp = lire(fCsp);
    if (!csp.includes("https://widget.premiumhelveticleads.ch")) {
      defauts.push("effet:la politique n'autorise pas widget.premiumhelveticleads.ch en script-src");
    }
    if (!csp.includes("https://comms.premiumhelveticleads.ch")) {
      defauts.push("effet:la politique n'autorise pas comms.premiumhelveticleads.ch en connect-src");
    }
    if (!/Content-Security-Policy-Report-Only/.test(csp)) {
      defauts.push("effet:la politique n'est pas en rapport seul (Report-Only)");
    }
  }

  /* 6. Le prerendu rend la page introuvable au lieu de recopier la coquille. */
  const fPre = path.join(site, "scripts/prerender-content.mjs");
  if (!fs.existsSync(fPre)) {
    defauts.push("effet:scripts/prerender-content.mjs absent");
  } else {
    const pre = lire(fPre);
    if (!/rendre404\s*\(/.test(pre)) {
      defauts.push(
        "effet:scripts/prerender-content.mjs n'appelle pas rendre404 : la page introuvable serait servie sans en-tete ni pied",
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

export function verifier({ site, manifeste, reference }) {
  const defauts = [];
  const vus = [];

  for (const entree of manifeste.fichiers) {
    const copie = path.join(site, entree.chemin);
    if (!fs.existsSync(copie)) {
      defauts.push(`absent:${entree.chemin} (fichier du socle manquant dans ce site)`);
      continue;
    }
    const texteCopie = lire(copie);

    if (reference) {
      const ref = path.join(reference, entree.source);
      if (!fs.existsSync(ref)) {
        defauts.push(`reference:${entree.source} introuvable sous ${reference}`);
        continue;
      }
      const attendu = normaliser(lire(ref));
      const obtenu = normaliser(texteCopie);
      if (attendu !== obtenu) {
        const d = premiereLigneDifferente(attendu, obtenu);
        defauts.push(
          `derive:${entree.chemin} ligne ${d.ligne}\n      attendu : ${d.attendu}\n      trouve  : ${d.obtenu}`,
        );
        continue;
      }
    } else {
      const obtenue = empreinte(texteCopie);
      if (obtenue !== entree.empreinte) {
        defauts.push(
          `derive:${entree.chemin} ne correspond plus au gabarit de reference.\n` +
            `      empreinte attendue ${entree.empreinte.slice(0, 16)}, trouvee ${obtenue.slice(0, 16)}.\n` +
            "      Reprendre le fichier depuis socle/batiment de helvetic-deploy, ou corriger le socle puis recopier.",
        );
        continue;
      }
    }
    vus.push(entree.chemin);
  }

  mesuresEffet(site, defauts);

  return { defauts, vus };
}

function principal() {
  const args = process.argv.slice(2);
  let site = ".";
  let reference = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--reference") {
      reference = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith("--")) {
      site = args[i];
    }
  }
  site = path.resolve(site);

  const cheminManifeste = fs.existsSync(path.join(site, "scripts/socle-manifeste.json"))
    ? path.join(site, "scripts/socle-manifeste.json")
    : reference
      ? path.join(reference, "MANIFESTE.json")
      : null;

  if (!cheminManifeste || !fs.existsSync(cheminManifeste)) {
    console.error(
      "garde-socle : manifeste introuvable. Attendu scripts/socle-manifeste.json dans le site, " +
        "ou MANIFESTE.json sous --reference.",
    );
    process.exit(1);
  }

  const manifeste = JSON.parse(lire(cheminManifeste));
  const { defauts, vus } = verifier({ site, manifeste, reference });

  if (defauts.length > 0) {
    console.error(`GARDE_SOCLE_FAIL ${defauts.length} defaut(s) sur ${path.basename(site)} :`);
    for (const d of defauts) console.error(`  - ${d}`);
    console.error(
      "\nMode d'emploi de la recopie : docs/SOCLE-BATIMENT.md du depot helvetic-deploy.",
    );
    process.exit(1);
  }

  console.log(
    `GARDE_SOCLE_OK ${vus.length} fichier(s) du socle conformes${reference ? " (compares a la reference)" : " (empreintes)"}, mesures d'effet passees`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal();
}
