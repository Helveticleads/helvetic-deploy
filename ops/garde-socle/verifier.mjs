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
 *   - tout `<form` passe par `submitLead` ;
 *   - la politique de securite du contenu porte les deux origines du widget ;
 *   - le prerendu rend la page introuvable au lieu de recopier la coquille ;
 *   - sur un site du parc (drapeau `ligne` declare), le pied et le contact
 *     passent par `telephone()`, sans icone de telephone hors d'un lien
 *     qui appelle, sans horaire d'appel.
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
  /*
   * 1. UN en-tete, et un seul, atteint chaque route, la page introuvable
   *    comprise.
   *
   * Deux charpentes existent dans le parc, et les deux sont bonnes : soit
   * chaque gabarit de page passe par `Layout`, soit la coquille de
   * l'application en monte un au dessus du routeur. Exiger la premiere seule
   * serait une garde PAR NOM : ce qui compte est l'effet, pas l'endroit ou le
   * composant est ecrit. Ce qui n'est jamais bon, c'est DEUX en-tetes sur la
   * meme page.
   */
  const pages = listerFichiers(path.join(site, "src/pages"), (n) => n.endsWith(".tsx"));
  const coquille = ["src/App.tsx", "src/main.tsx", "src/entry-server.tsx"]
    .map((f) => path.join(site, f))
    .filter((f) => fs.existsSync(f))
    .map((f) => lire(f))
    .join("\n");
  const chromeGlobale = /<Layout[\s>]/.test(coquille) || /<Header[\s>]/.test(coquille);
  if (pages.length === 0) {
    defauts.push("effet:aucun gabarit de page trouve sous src/pages");
  } else if (chromeGlobale) {
    const enDouble = pages
      .filter((p) => /<Layout[\s>]|<Header[\s>]/.test(lire(p)))
      .map((p) => path.basename(p));
    if (enDouble.length > 0) {
      defauts.push(
        `effet:la coquille de l'application monte deja un en-tete, et ces gabarits en montent un second : ${enDouble.join(", ")}`,
      );
    }
  } else {
    const sansLayout = pages
      .filter((p) => !/<Layout[\s>]/.test(lire(p)))
      .map((p) => path.basename(p));
    if (sansLayout.length > 0) {
      defauts.push(
        `effet:gabarits de page sans Layout, donc sans en-tete ni pied : ${sansLayout.join(", ")}`,
      );
    }
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

  /*
   * 1 bis. La barre ne porte pas plus de SIX entrees.
   *
   * Decision de Frederic du 02.11 : l'en-tete ne garde que les sections
   * communes du parc. La limite est tenue d'abord par la FORME du gabarit,
   * qui declare six emplacements et rien de plus, et donc par l'empreinte de
   * `src/data/navigation.ts`. Cette mesure est la seconde serrure : elle
   * compte les chemins declares HORS zones libres, c'est a dire dans la
   * partie commune, et refuse qu'on en ajoute un septieme emplacement. Les
   * sections propres au site vivent dans la zone libre, pour le menu du
   * telephone, et ne comptent pas ici.
   */
  const fNav = path.join(site, "src/data/navigation.ts");
  if (!fs.existsSync(fNav)) {
    defauts.push("effet:src/data/navigation.ts absent");
  } else {
    const commun = normaliser(lire(fNav));
    const chemins = [...commun.matchAll(/href:\s*(?:"([^"]+)"|CHEMINS\.(\w+))/g)].map((m) => m[1] ?? m[2]);
    const EMPLACEMENTS_MAX = 6;
    const CANDIDATS_MAX = EMPLACEMENTS_MAX + 1; /* le journal : /blog ou /conseils */
    if (chemins.length > CANDIDATS_MAX) {
      defauts.push(
        `effet:la barre declare ${chemins.length} chemins dans sa partie commune, ${CANDIDATS_MAX} au plus : ${chemins.join(", ")}`,
      );
    }

    /*
     * 1 ter. Depuis la v1.6.0, les emplacements sont une zone libre : un site
     * du parc nomme ses sections. La limite de six reste IMPOSEE : on compte
     * les emplacements declares dans la zone, c'est a dire les tableaux du
     * premier niveau de `EMPLACEMENTS`.
     */
    const brut = lire(fNav);
    const zone = brut.match(/socle:libre:debut sections[^\n]*\n([\s\S]*?)socle:libre:fin/);
    if (zone) {
      const decl = zone[1].slice(zone[1].indexOf("= [") + 3);
      let profondeur = 0;
      let emplacements = 0;
      for (const c of decl) {
        if (c === "[") { if (profondeur === 0) emplacements += 1; profondeur += 1; }
        else if (c === "]") { if (profondeur === 0) break; profondeur -= 1; }
      }
      if (emplacements > EMPLACEMENTS_MAX) {
        defauts.push(
          `effet:la barre declare ${emplacements} emplacements dans sa zone libre, ${EMPLACEMENTS_MAX} au plus`,
        );
      }
    }
  }

  /*
   * 4 bis. Et ils verifient le nom AVANT d'envoyer.
   *
   * `normalizeLegacyLeadBody` exige 2 caracteres : sans cette garde, la charge
   * repart en 400 depuis /api/leads et le lead est perdu, le visiteur ne voyant
   * qu'un message generique. On mesure la garde COTE CODE, pas l'attribut
   * `required` du champ : `required` ne couvre pas un envoi declenche par le
   * code, et il se retire d'une ligne dans la page.
   */
  const verifieLeNom = (texte) =>
    /\b\w*(nom|name)\w*\.trim\(\)\.length\s*<\s*2/i.test(texte) ||
    /\b(nom|name)\s*:\s*z\.string\(\)[^\n]*\.min\(\s*2/.test(texte);
  const sansNom = sources
    .filter((p) => /construireCharge\s*\(/.test(lire(p)))
    .filter((p) => !verifieLeNom(lire(p)))
    .map((p) => path.relative(site, p));
  if (sansNom.length > 0) {
    defauts.push(
      `effet:formulaires qui envoient un lead sans verifier le nom : ${sansNom.join(", ")}`,
    );
  }

  /*
   * 4 ter. Personne n'envoie un lead en contournant le contrat.
   *
   * `submitLead` prend une charge construite par `construireCharge` : c'est la
   * que le consentement, le piege et la langue entrent dans la charge. Un
   * formulaire qui appelle `submitLead` avec un objet ecrit a la main envoie
   * une charge de l'ancien contrat, sans rien de tout cela, et le build reste
   * vert : rien d'autre ne le verrait, puisque les mesures ci-dessus ne
   * regardent que les fichiers qui appellent deja `construireCharge`.
   */
  const sansContrat = sources
    .filter((p) => /\bsubmitLead\s*\(/.test(lire(p)))
    .filter((p) => !/construireCharge\s*\(/.test(lire(p)))
    .map((p) => path.relative(site, p));
  if (sansContrat.length > 0) {
    defauts.push(
      `effet:formulaires qui appellent submitLead sans passer par construireCharge : ${sansContrat.join(", ")}`,
    );
  }

  /*
   * 4 quater. Un formulaire qui n'envoie rien.
   *
   * Les mesures ci-dessus ne regardent que les fichiers qui appellent deja
   * `construireCharge` ou `submitLead` : un `<form` qui remercie le visiteur
   * sans rien envoyer les traverse toutes, et le lead est perdu. Vecu sur
   * /kontakt de helvetic-daemmung.ch. Le defaut est mesure fichier par fichier :
   * le `<form` et son `submitLead` vivent dans le meme composant.
   */
  const sansEnvoi = sources
    .filter((p) => /<form\b/.test(lire(p)))
    .filter((p) => !/\bsubmitLead\s*\(/.test(lire(p)))
    .map((p) => path.relative(site, p));
  if (sansEnvoi.length > 0) {
    defauts.push(
      `effet:formulaires qui ne passent pas par submitLead, donc qui n'envoient rien : ${sansEnvoi.join(", ")}`,
    );
  }

  mesurePiedContact(site, defauts);

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

/*
 * 7. Le pied de page et la page contact d'un site du PARC.
 *
 * Decision de Frederic du 03.11 : le pied et le contact appartiennent au
 * site, mais ils passent par `telephone()` a la pose, et la garde verifie :
 *   - aucun `tel:` sans numero : le lien vient de `telephone()`, jamais de
 *     `phoneHref()` ni d'un `tel:` construit a la main ;
 *   - aucune icone de telephone sur un lien qui n'appelle pas ;
 *   - aucun horaire d'appel. Un horaire d'intervention etiquete reste permis :
 *     `<HorairesIntervention />`, ou une ligne qui porte « intervention » /
 *     « Einsatz ».
 *
 * La mesure s'allume quand `src/data/config.ts` declare le drapeau `ligne`.
 * Decision de Frederic du 03.11 : le drapeau est OBLIGATOIRE a chaque pose du
 * parc (`ligne: true` ou `ligne: false`). Un site du parc qui ne le declare pas
 * est refuse. Il est reconnu au nom de son `package.json` (`PAQUETS_PARC`) OU
 * au domaine de sa configuration (`DOMAINES_PARC`, decision du 03.11) : un
 * paquet renomme ne s'echappe pas.
 * Les 29 sites du batiment ne sont pas dans la liste et ne le declarent pas :
 * la mesure s'y tait, leur rendu ne change pas.
 *
 * Un creneau de rappel propose comme OPTION d'un champ de formulaire
 * (`<option>`, `<SelectItem>`) est un choix du visiteur, pas un horaire
 * d'appel : il est permis (decision du 03.11). Le meme horaire ecrit dans le
 * texte reste refuse.
 * Le pied est tout composant dont le nom dit « footer » ou qui monte
 * `<footer` ; le contact, toute page dont le nom dit « contact » ou « kontakt ».
 */
const ICONE_TEL = /Phone/;
const HEURE = [
  /\b([01]?\d|2[0-3])\s?[h:]\s?[0-5]\d\b/,
  /\b([01]?\d|2[0-3])(\.[0-5]\d)?\s?Uhr\b/,
  /\b([01]?\d|2[0-3])\s?h\s?(-|–|à|a)\s?([01]?\d|2[0-3])\s?h/,
  /Anrufzeiten|Telefonzeiten|Öffnungszeiten|Oeffnungszeiten|[Hh]oraires? d['’](appel|ouverture)/,
  /\.(openingHours|businessHours|hours|horaires|oeffnungszeiten)\b/,
];
const ETIQUETTE_INTERVENTION = /[Ii]ntervention|Einsatz|HorairesIntervention/;
const OPTION_DE_CHAMP = /<(option|SelectItem)\b[^>]*>[^<]*<\/(option|SelectItem)>/g;
const SITES_PARC = [
  "helvetic-garten", "helvetic-hochzeit", "helvetic-pool", "helvetic-reinigung", "helvetic-vermoegen",
  "helvetic-whirlpool", "helvetique-demenagements", "helvetique-dentaire", "helvetique-elagage",
  "helvetique-evenementiel", "helvetique-jardin", "helvetique-mariage", "helvetique-nettoyage",
  "helvetique-patrimoine", "helvetique-piscine", "helvetique-spa",
];
/* Deux reperes pour les memes 16 sites : le nom du paquet, et le domaine
   declare dans `src/data/config.ts` (`domain: "..."`). Un seul suffit. */
export const PAQUETS_PARC = new Set(SITES_PARC.map((n) => `@workspace/${n}`));
export const DOMAINES_PARC = new Set(SITES_PARC.map((n) => `${n}.ch`));
/* Une duree (« un entretien d'1h a 1h30 ») n'est pas un horaire. */
const DUREE = /d['’]\s?\d{1,2}\s?h\d{0,2}\s?(à|a|-|–)\s?\d{1,2}\s?h\d{0,2}/g;

export function mesurePiedContact(site, defauts) {
  const fConfig = path.join(site, "src/data/config.ts");
  const fPaquet = path.join(site, "package.json");
  let nom = null;
  try {
    nom = JSON.parse(lire(fPaquet)).name ?? null;
  } catch {
    /* sans package.json lisible, le site n'est pas reconnu comme du parc */
  }
  const config = fs.existsSync(fConfig) ? lire(fConfig) : "";
  const domaine = (config.match(/\bdomain:\s*["']([^"']+)["']/) ?? [])[1]?.trim().toLowerCase().replace(/^www\./, "") ?? null;
  const drapeau = /\bligne\s*:/.test(config);
  if (!drapeau) {
    if (PAQUETS_PARC.has(nom) || DOMAINES_PARC.has(domaine)) {
      defauts.push(`effet:site du parc (${PAQUETS_PARC.has(nom) ? nom : domaine}) sans drapeau ligne dans src/data/config.ts : declarer ligne: true ou ligne: false`);
    } else {
      return;
    }
  }

  const fichiers = [];
  (function parcourir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") parcourir(p);
      } else if (e.name.endsWith(".tsx")) {
        const rel = path.relative(site, p);
        const pied = /footer/i.test(e.name) || (rel.includes("components") && /<footer\b/.test(lire(p)));
        const contact = rel.split(path.sep).includes("pages") && /contact|kontakt/i.test(e.name);
        if (pied || contact) fichiers.push(p);
      }
    }
  })(path.join(site, "src"));

  for (const p of fichiers) {
    const rel = path.relative(site, p);
    const texte = lire(p);

    if (/\bphoneHref\s*\(/.test(texte)) {
      defauts.push(`effet:pied/contact ${rel} passe par phoneHref() au lieu de telephone()`);
    }
    if (/tel:/.test(texte)) {
      defauts.push(`effet:pied/contact ${rel} ecrit un lien tel: a la main : il doit venir de telephone()`);
    }

    const icones = [...texte.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g)]
      .flatMap((m) => m[1].split(","))
      .map((s) => s.trim().split(/\s+as\s+/))
      .filter(([nom]) => ICONE_TEL.test(nom))
      .map(([nom, alias]) => alias ?? nom);
    for (const icone of icones) {
      for (const m of texte.matchAll(new RegExp(`<${icone}\\b`, "g"))) {
        const avant = texte.slice(0, m.index);
        const ouverture = Math.max(avant.lastIndexOf("<a "), avant.lastIndexOf("<a\n"), avant.lastIndexOf("<Link"));
        const fermee = ouverture < 0 || /<\/a>|<\/Link>/.test(avant.slice(ouverture));
        const balise = ouverture < 0 ? "" : avant.slice(ouverture, avant.indexOf(">", ouverture) + 1);
        if (fermee || !/telephone\s*\(|\btel\w*\b/i.test(balise.replace(/className="[^"]*"/g, ""))) {
          const ligne = avant.split("\n").length;
          defauts.push(`effet:pied/contact ${rel} ligne ${ligne} : icone ${icone} sur un lien qui n'appelle pas`);
        }
      }
    }

    texte.split("\n").forEach((l, i) => {
      if (ETIQUETTE_INTERVENTION.test(l)) return;
      const sansDuree = l.replace(DUREE, "").replace(OPTION_DE_CHAMP, "");
      if (HEURE.some((r) => r.test(sansDuree))) {
        defauts.push(`effet:pied/contact ${rel} ligne ${i + 1} : horaire d'appel « ${l.trim().slice(0, 60)} »`);
      }
    });
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
      /* Un fichier optionnel absent n'est pas un defaut : le contrat qu'il
         porte est garde par les mesures d'effet, qui ne dependent d'aucun
         gabarit. Present, il doit etre conforme. */
      if (entree.optionnel) continue;
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
