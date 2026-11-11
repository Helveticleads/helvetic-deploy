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
    for (const d of mesureEnvoiLead(api)) defauts.push(`effet:src/lib/api.ts ${d}`);
  }

  /*
   * 3 bis. v1.6.5 (Frederic, 11.11) : `lead_submit` ne part que de submitLead,
   * apres la reponse du serveur. Un `lead_submit` ecrit ailleurs dans le code
   * du site (page de remerciement, dataLayer, constante...) est refuse.
   */
  /*
   * 3 ter. v1.6.5, point 7 (Frederic, 11.11) : la tenue des liens canoniques
   * apres l'execution du JavaScript vit dans src/data/navigation.ts (empreinte)
   * et s'installe a son chargement. Le site ne la contourne pas : il ne
   * reecrit pas l'historique du navigateur et ne la desactive pas.
   */
  const fNavLiens = path.join(site, "src/data/navigation.ts");
  if (fs.existsSync(fNavLiens) && !/^installerLiensCanoniques\(\);$/m.test(lire(fNavLiens))) {
    defauts.push("effet:src/data/navigation.ts n'installe pas la tenue des liens canoniques (installerLiensCanoniques())");
  }
  const contournements = fichiersContournementLiens(site);
  if (contournements.length > 0) {
    defauts.push(`effet:le site contourne la tenue des liens canoniques (historique reecrit ou mecanisme desactive) : ${contournements.join(", ")}`);
  }

  const horsSocle = fichiersLeadSubmit(site);
  if (horsSocle.length > 0) {
    defauts.push(`effet:lead_submit envoye hors de submitLead (page de remerciement ou autre) : ${horsSocle.join(", ")} ; il part desormais de src/lib/api.ts apres la reponse du serveur`);
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
  mesureTelephoneSource(site, defauts);

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

/*
 * 8. La regle du telephone du BATIMENT (Frederic, 05.11.2026).
 *
 *   - site FR : des que le numero est renseigne, le numero ET les horaires
 *     d'appel « Lun-ven 10h-19h » sont affiches dans l'en-tete, dans la barre
 *     collante du bas et sur la page contact ;
 *   - site DE (`langue: "de"`) : aucun numero, aucun lien `tel:`, aucune icone
 *     de telephone, aucun « Anruf » / « anrufen » / « rufen Sie an », aucun « erreichbar » au sens de
 *     joignable par telephone. Horaires d'intervention seulement.
 *
 * La regle se lit sur les PAGES CONSTRUITES : c'est la que le visiteur la voit,
 * et c'est la seule facon de couvrir le contenu propre a chaque site. Deux
 * moitiés :
 *   - dans la source (cette mesure) : le site DE ne declare aucun numero, et le
 *     build du site lance la garde des pages (`garde-socle.mjs --pages
 *     dist/public`) APRES le prerendu ;
 *   - dans les pages (`mesureTelephonePages`, mode `--pages`).
 * Les sites du parc ne sont pas concernes : leur regle est le drapeau `ligne`.
 */
const HORAIRES_APPEL = /lun\w*\.?\s*(-|–|à|a|au)\s*ven\w*\.?\s*10\s*h(00)?\s*(-|–|à|a)\s*19\s*h/i;
/*
 * Tout ce qui invite le client a APPELER l'entreprise (Frederic, 05.11) :
 * « anrufen », « Anruf », « Anrufe », les composes en -anruf (« Kundenanruf »),
 * et l'imperatif separe « rufen Sie (uns, jetzt...) an ». Le rappel DU CLIENT
 * par l'entreprise reste permis : « Rückruf », « zurückrufen », « ruft Sie
 * zurück », « Wir rufen Sie an » ne sont pas pris.
 */
/*
 * v1.6.2 (Frederic, 09.11) : seule l'INVITATION a appeler est refusee :
 * l'imperatif « Rufen Sie (uns) ... an » en debut de phrase ou de bloc (apres
 * . ! ? : ¦ ou une puce), et « rufen Sie uns ... an » ou qu'il soit. « Die
 * Fachleute rufen Sie an », « Wir rufen Sie an », « ruft Sie zurück » : le
 * professionnel rappelle le client, permis.
 */
/*
 * v1.6.5 (trou 4 de l'audit, decision de Frederic du 09.11 ; source :
 * _audit-batiment-04-11/CORRECTIFS/SOCLE-V1-6-2/REVERIF/REVERIF-SOCLE-V1-6-2-09-11.md,
 * tests-audit-garde-1.mjs) : l'invitation IMPLICITE a nous appeler, sans « an » :
 * « Rufen Sie die Polizei (117), dann uns. » ; l'imperatif « Rufen Sie » en
 * debut de phrase, puis « dann / danach / anschliessend / und / oder / sowie
 * uns » dans la meme phrase. « Rufen Sie die Polizei (117). » seul passe.
 */
const ANRUF = /anruf\p{L}*|(?:^|(?<=[.!?:¦•·]\s*)|(?<=(?:^|\s)[-*–]\s+))rufen\s+Sie(?!\p{L})[^.!?¦]*?(?<!\p{L})an(?!\p{L})|(?<!\p{L})rufen\s+Sie\s+uns(?!\p{L})[^.!?¦]*?(?<!\p{L})an(?!\p{L})|(?:^|(?<=[.!?:¦•·]\s*)|(?<=(?:^|\s)[-*–]\s+))rufen\s+Sie(?!\p{L})[^.!?¦]*?(?<!\p{L})(?:dann|danach|anschliessend|und|oder|sowie)\s+uns(?!\p{L})/iu;
/*
 * v1.6.2 (bat-37 b, decision de Frederic du 09.11) : SEUL le telephone de
 * l'entreprise est refuse, ce qui invite le visiteur a appeler, sur un site DE,
 * dans le texte, les metas et la FAQ JSON-LD. Une liste de tournures ROUGES
 * nommees ; un « Telefon... » hors de ces tournures passe (le champ du client,
 * « Telefonnummer » dans les donnees collectees, « keine Telefonnummer »,
 * « Ihre Telefonnummer für den Rückruf », « Telefonie »...).
 */
const TEL = "(?:mobil|festnetz)?telefon";
export const TOURNURES_TELEFON = [
  ["telefonisch comme canal", `(?<!\\p{L})telefonisch(?:e[nrms]?)?\\s+(?:erreichbar|berat\\p{L}*|Beratung|kontaktier\\p{L}*|Kontakt\\p{L}*|Anfrage\\p{L}*|anfragen|melden|erreichen|Auskunft)(?!\\p{L})`],
  ["canal puis telefonisch", `(?<!\\p{L})(?:berat\\p{L}*|Beratung|erreichbar|kontaktier\\p{L}*|erreichen)\\s+(?:\\p{L}+\\s+){0,2}?telefonisch(?!\\p{L})`],
  ["per / am Telefon", `(?<!\\p{L})(?:per|am|via|übers)\\s+${TEL}(?!\\p{L})`],
  ["notre telephone", `(?<!\\p{L})unser(?:e[mnrs]?)?\\s+(?:${TEL}\\p{L}*|Hotline|Servicetelefon\\p{L}*)(?!\\p{L})`],
  ["Telefon: ou Tel. suivi d'un numero", `(?<!\\p{L})(?:${TEL}|Tel\\.?)\\s*:?\\s*\\+?\\d`],
  /*
   * Hotline, Telefonberatung, Servicetelefon (Frederic, 09.11) : seulement
   * celle de l'entreprise, suivie d'un numero ou d'un horaire, ou offerte au
   * visiteur. Une hotline d'un tiers (« Hersteller-Hotline », « Verwaltungs-
   * Hotline », « Hotline des Herstellers ») ou niee (« keine Telefonberatung »,
   * « zwischen Hotlines ») passe.
   */
  ["Hotline suivie d'un numero ou d'un horaire", `(?<![\\p{L}-])(?:Hotline|Telefonberatung|Servicetelefon)\\s*:?\\s*(?:\\+?\\d|Mo|Lu)(?!\\p{L}{3})`],
  ["Hotline offerte au visiteur", `(?<!\\p{L})(?:kostenlos\\p{L}*|gratis|unverbindlich\\p{L}*|persönlich\\p{L}*|direkt\\p{L}*)\\s+(?:Hotline|Telefonberatung|Servicetelefon)(?![\\p{L}-])|(?<![\\p{L}-])(?:Hotline|Telefonberatung|Servicetelefon)\\s+für\\s+(?:Kunden|Sie|Ihre?\\p{L}*|Notfälle)(?!\\p{L})`],
];
const TELEFON = new RegExp(TOURNURES_TELEFON.map(([, m]) => `(?:${m})`).join("|"), "iu");
/*
 * v1.6.5 (trou 1 de l'audit, decision de Frederic du 09.11 ; source :
 * _audit-batiment-04-11/CORRECTIFS/SOCLE-V1-6-2/REVERIF/REVERIF-SOCLE-V1-6-2-09-11.md,
 * tests-audit-garde-1.mjs et -2.mjs) : un numero suisse ECRIT dans le texte d'un
 * site DE, seul (« 044 555 66 77 ») ou apres « Telefonnummer: ». Formes :
 * 0XX XXX XX XX, +41 XX XXX XX XX, 0041..., 0800 XXX XXX, espaces facultatifs.
 * Le champ du client (« Telefon * », « Telefonnummer » comme libelle) ne porte
 * pas de numero : il passe.
 */
export const NUMERO_SUISSE = /(?<![\d.,:/+-])(?:(?:\+|00)41\s?|0)(?:\d{2}\s?\d{3}\s?\d{2}\s?\d{2}|8\d{2}\s?\d{3}\s?\d{3})(?![\d.,])/gu;
/*
 * Exception nommee (Frederic, 05.11) : le champ du formulaire qui demande le
 * numero DU CLIENT pour le rappeler. C'est son numero, pas le notre : le
 * `<label>` qui porte « Telefonnummer » sort du texte lu par la regle Anruf.
 */
export const EXCEPTION_ANRUF = {
  sens: "le libelle du champ Telefonnummer du formulaire, le numero du client",
  exemple: "Telefonnummer (für den Anruf zurück)",
};

function sansChampTelefonnummer(html) {
  let out = "";
  let i = 0;
  for (;;) {
    const debut = html.indexOf("<label", i);
    if (debut < 0) break;
    const fin = html.indexOf("</label>", debut);
    if (fin < 0) break;
    const bloc = html.slice(debut, fin + 8);
    out += html.slice(i, debut) + (/Telefonnummer/i.test(bloc) ? " " : bloc);
    i = fin + 8;
  }
  return out + html.slice(i);
}
const ERREICHBAR = /erreichbar\w*/gi;
/*
 * « erreichbar » sans rapport avec le telephone : exceptions nommees UNE PAR
 * UNE (decision du 05.11). Chacune dit le sens, et ne couvre que sa tournure.
 */
export const EXCEPTIONS_ERREICHBAR = [
  {
    sens: "un organe ou un endroit accessible a la main (vanne, regard, ouverture)",
    motif: /\b(Hauptschalter|Absperrventile?|Absperrungen|Wartungsöffnungen|Feuerstätte|Abdeckung|Kanten|Scharnierbereiche|Technikräumen|Grundstücksnetz|Zugang|Abläufe|Dachraum|Eingänge|Route)\b[^.?!]{0,60}?\berreichbar(?!keit)/gi,
    exemple: "Hauptschalter aus, wenn gefahrlos erreichbar, sonst warten.",
  },
  {
    sens: "une partie accessible, adjectif devant le nom (zone, conduite, siphon)",
    motif: /\berreichbar(e|en|er)\s+(Bereich\w*|Abschnitte|Untergrund|Siphon|Ablauf|Gegenstände)\b/gi,
    exemple: "Der Fachbetrieb repariert erreichbare Abschnitte.",
  },
  {
    sens: "a portee de la main, ou hors de portee",
    motif: /\b(von aussen|vom Boden aus|für Kinder und Haustiere)\s+erreichbar\b/gi,
    exemple: "Die Kasse ist von aussen erreichbar.",
  },
  {
    sens: "un lieu atteint par la route ou le rail",
    motif: /\b(per Standseilbahn|mit dem Auto|mit dem ÖV|mit dem öffentlichen Verkehr|zu Fuss)\s+erreichbar(e|en|er)?\b|\bnach Erreichbarkeit\.\s*(Bitte\s+)?(Lage|Zufahrt)\b/gi,
    exemple: "Ja, nach Erreichbarkeit. Zufahrt bitte im Formular nennen.",
  },
  {
    sens: "un resultat atteignable (une valeur, un delai, une epaisseur)",
    motif: /\b\d+\s*(bis\s*\d+\s*)?(dB|Jahre)\s+erreichbar\b|\bDämmschicht\s+erreichbar\b|\bStichtag\s+erreichbar\b|\bmit Hausmitteln nicht erreichbar\b|\berreichbar(e|er)\s+(Slot|Entscheidungsstruktur)\b/gi,
    exemple: "Eine Reduktion um 10 bis 40 dB erreichbar.",
  },
  {
    sens: "des documents ou un endroit a atteindre",
    motif: /\bErreichbarkeit (von Unterlagen|der Stelle)\b/gi,
    exemple: "Nutzung eines Raums oder die Erreichbarkeit von Unterlagen.",
  },
  {
    sens: "joignable PAR LE FORMULAIRE, le canal est nomme dans la tournure",
    motif: /(?<!\p{L})(per|über das)\s+Formular\s+erreichbar(?!keit)(?!\p{L})|(?<!\p{L})Erreichbarkeit per Formular(?!\p{L})/giu,
    exemple: "Kostenloser KV, per Formular erreichbar.",
  },
];

/** Vrai si une exception nommee couvre l'occurrence placee a `position` du contexte. */
function exceptionCouvre(contexte, position) {
  return EXCEPTIONS_ERREICHBAR.some((x) =>
    [...contexte.matchAll(new RegExp(x.motif.source, x.motif.flags.includes("g") ? x.motif.flags : `${x.motif.flags}g`))].some((m) => m.index <= position && position < m.index + m[0].length),
  );
}

function estDuParc(site) {
  let nom = null;
  try {
    nom = JSON.parse(lire(path.join(site, "package.json"))).name ?? null;
  } catch {
    /* sans package.json lisible, le site n'est pas reconnu comme du parc */
  }
  const fConfig = path.join(site, "src/data/config.ts");
  const config = fs.existsSync(fConfig) ? lire(fConfig) : "";
  const domaine = (config.match(/\bdomain:\s*["']([^"']+)["']/) ?? [])[1]?.trim().toLowerCase().replace(/^www\./, "") ?? null;
  return PAQUETS_PARC.has(nom) || DOMAINES_PARC.has(domaine);
}

/** Ce que la regle du telephone attend du site, lu dans sa configuration. */
export function regleTelephone(site) {
  const fConfig = path.join(site, "src/data/config.ts");
  const config = fs.existsSync(fConfig) ? lire(fConfig) : "";
  const langue = /\blangue:\s*["']de["']/.test(config) ? "de" : "fr";
  const numero = ((config.match(/\bphone:\s*"([^"]*)"/) ?? [])[1] ?? "").trim();
  const ligne = !/\bligne\s*:\s*false\b/.test(config);
  return { langue, numero, ligne, parc: estDuParc(site) };
}

export function mesureTelephoneSource(site, defauts) {
  const regle = regleTelephone(site);
  if (regle.parc) return;
  if (regle.langue === "de" && regle.numero) {
    defauts.push(`effet:site DE avec un numero ("${regle.numero}") : la regle du batiment n'en veut aucun, phone: ""`);
  }
  let build = "";
  try {
    build = JSON.parse(lire(path.join(site, "package.json"))).scripts?.build ?? "";
  } catch {
    /* sans package.json lisible, le defaut est dit juste en dessous */
  }
  const etapes = build.split("&&").map((s) => s.trim());
  const iPages = etapes.findIndex((s) => /garde-socle\.mjs\s+--pages\b/.test(s));
  const iPrerendu = etapes.findIndex((s) => /prerender/.test(s));
  if (iPages < 0) {
    defauts.push("effet:le build du site ne lance pas la garde des pages construites : ajouter `node ./scripts/garde-socle.mjs --pages dist/public` en fin de script build");
  } else if (iPrerendu >= 0 && iPages < iPrerendu) {
    defauts.push("effet:la garde des pages construites tourne avant le prerendu : la placer apres");
  }
  /*
   * v1.6.5 (Frederic, 11.11) : la passe des liens internes tourne APRES le
   * prerendu et AVANT la garde des pages, qui prouve son resultat. Un site qui
   * ne l'appelle pas est rouge ici, et rouge aussi a la garde des pages
   * (`liens:`) : l'oubli ne passe pas.
   */
  const iLiens = etapes.findIndex((s) => /(?:^|[\s/])socle-liens\.mjs(?:\s|$)/.test(s));
  if (iLiens < 0) {
    defauts.push("effet:le build du site ne lance pas la passe des liens internes : ajouter `node ./scripts/socle-liens.mjs dist/public` juste apres le prerendu, avant la garde des pages");
  } else if ((iPrerendu >= 0 && iLiens < iPrerendu) || (iPages >= 0 && iLiens > iPages)) {
    defauts.push("effet:la passe des liens internes doit tourner apres le prerendu et avant la garde des pages");
  }
}

/* Les elements de bloc : leur fin coupe une phrase (« rufen Sie ... an », v1.6.2). */
const BLOC_HTML = /<\/?(p|div|li|ul|ol|h[1-6]|td|th|tr|table|section|article|header|footer|nav|main|aside|form|label|button|dt|dd|dl|br|summary|details|blockquote|figcaption)\b[^>]*>/gi;

function texteVisible(html, { blocs = false } = {}) {
  const metas = [...html.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"[^>]*>/gi)]
    .filter((m) => /(name|property)="(description|og:[\w:]+|twitter:[\w:]+)"/i.test(m[0]))
    .map((m) => m[1]);
  let corps = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  if (blocs) corps = corps.replace(BLOC_HTML, " ¦ ");
  corps = corps.replace(/<[^>]+>/g, " ");
  return [corps, ...metas]
    .join(blocs ? " ¦ " : " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ");
}

/** Les objets JSON-LD d'une page (illisibles : ignores). */
function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* un JSON-LD illisible n'est pas lu ici */
    }
  }
  return out;
}

function parcourirLd(noeud, visite) {
  if (Array.isArray(noeud)) noeud.forEach((n) => parcourirLd(n, visite));
  else if (noeud && typeof noeud === "object") {
    visite(noeud);
    Object.values(noeud).forEach((n) => parcourirLd(n, visite));
  }
}

const typesLd = (n) => [n["@type"]].flat().map(String);

/** Le texte des questions et reponses FAQ du JSON-LD. */
function texteFaqLd(html) {
  const morceaux = [];
  for (const ld of jsonLd(html)) {
    parcourirLd(ld, (n) => {
      if (typesLd(n).some((t) => t === "Question" || t === "Answer")) {
        for (const k of ["name", "text"]) if (typeof n[k] === "string") morceaux.push(n[k]);
      }
    });
  }
  return morceaux.map((t) => texteVisible(t, { blocs: true })).join(" ¦ ");
}

/*
 * v1.6.2 (bat-37 d) : UNE seule plage horaire affichee, en FR et en DE, au
 * pied, sur la page contact et dans le JSON-LD : celle qui est servie depuis le
 * 09.11, du lundi au vendredi de 10 h a 19 h (« Lun-ven 10h-19h »,
 * « Mo-Fr 10–19 Uhr », JSON-LD « Mo-Fr 10:00-19:00 »). « nach Absprache »
 * n'est pas une plage horaire.
 */
const JOURS = {
  fr: [["lundi", "lun", "lu"], ["mardi", "mar", "ma"], ["mercredi", "mer", "me"], ["jeudi", "jeu", "je"], ["vendredi", "ven", "ve"], ["samedi", "sam", "sa"], ["dimanche", "dim", "di"]],
  de: [["montag", "mo"], ["dienstag", "di"], ["mittwoch", "mi"], ["donnerstag", "do"], ["freitag", "fr"], ["samstag", "sa"], ["sonntag", "so"]],
  en: [["monday", "mo"], ["tuesday", "tu"], ["wednesday", "we"], ["thursday", "th"], ["friday", "fr"], ["saturday", "sa"], ["sunday", "su"]],
};
const SEP = "(?:-|–|—|à|a|au|bis)";
const HEURE_PLAGE = "(\\d{1,2})(?:\\s*(h)\\s*(\\d{2})?|:(\\d{2})|\\.(\\d{2}))?";

function motifPlage(langue) {
  const jour = `(${JOURS[langue].flat().sort((a, b) => b.length - a.length).join("|")})`;
  return new RegExp(
    `(?:(?<!\\p{L})${jour}\\.?(?:\\s*${SEP}\\s*${jour}\\.?)?(?!\\p{L})\\s*[:,]?\\s*(?:von|de|dès)?\\s*)?(?<![\\d.:])${HEURE_PLAGE}\\s*${SEP}\\s*${HEURE_PLAGE}(\\s*Uhr)?(?![\\d])`,
    "giu",
  );
}

/*
 * v1.6.5 (trou 2 de l'audit, decision de Frederic du 09.11 ; source :
 * REVERIF-SOCLE-V1-6-2-09-11.md, tests-audit-garde-1.mjs et -2.mjs, forme reelle
 * du pied de FR-helvetique-vitrerie.ch avant le 08.11) : en FR, une plage dont
 * les tirets sont devenus des virgules, « Lu, Di : 7h, 20h » : deux jours, deux
 * points, deux heures marquees « h ».
 */
function motifPlageVirgule() {
  const jour = `(${JOURS.fr.flat().sort((a, b) => b.length - a.length).join("|")})`;
  return new RegExp(`(?<!\\p{L})${jour}\\.?\\s*,\\s*${jour}\\.?\\s*:\\s*(\\d{1,2})\\s*h\\s*(\\d{2})?\\s*,\\s*(\\d{1,2})\\s*h\\s*(\\d{2})?(?!\\d)`, "giu");
}

function numeroJour(langue, mot) {
  const i = JOURS[langue].findIndex((noms) => noms.includes(mot?.toLowerCase()));
  return i < 0 ? null : i + 1;
}

/*
 * Plages qui ne sont PAS des horaires d'appel (Frederic, 09.11) : exceptions
 * nommees UNE PAR UNE, chacune avec sa source. Une plage d'appel fausse reste
 * rouge, meme a cote d'une plage d'intervention.
 */
const SOURCE_RELEVES = "_audit-batiment-04-11/CORRECTIFS/SOCLE";
export const EXCEPTIONS_PLAGES = [
  {
    sens: "plage d'intervention ou de chantier etiquetee (« Intervention », « Einsatz », « Einsatzzeiten ») : le libelle est le dernier avant la plage, dans le meme bloc, seules d'autres plages s'intercalent",
    source: `${SOURCE_RELEVES}/RESTES-TELEPHONE-05-11.md, FR-helvetique-terrassement.ch (garde le 05.11) ; RELEVE-PLAGES-DE-08-11.md ; REFORMULATIONS-RESTES-05-11.md, « 08.11 plages DE »`,
    portee: "etiquette",
    motif: /(?<!\p{L})(?:Interventions?|Horaires d'intervention|Einsatz(?:zeiten|zeit)?|Einsätze|Termine?)$/iu,
    exemple: "Intervention Lun-Ven 7h–20h · Sam 8h–12h ; v1.6.5 : « Termine », et « Einsatzzeiten: 7 Tage, 7 bis 21.30 Uhr » (decision de Frederic du 09.11, precision a l'audit)",
  },
  {
    sens: "plage dans une phrase ou un tableau de majoration ou de tarif",
    source: `${SOURCE_RELEVES}/REFORMULATIONS-RESTES-05-11.md, « Cas gardés » (majoration, schluesseldienst « Tagstarife ») ; RESTES-TELEPHONE-05-11.md, FR-helvetique-plomberie.ch (nuit 22h-7h, majoration)`,
    portee: "phrase",
    motif: /(?<!\p{L})(?:\p{L}*zuschl[aä]g\p{L}*|\p{L}*tarif\p{L}*|majoration\p{L}*|major[ée]\p{L}*|Aufpreis\p{L}*)/iu,
    exemple: "Tagstarife gelten von 7 bis 22 Uhr ; für Nachteinsätze kann ein Zuschlag anfallen.",
  },
  {
    sens: "« 24 h/24 » ou « 24/7 » qui porte sur le formulaire",
    source: `${SOURCE_RELEVES}/RESTES-TELEPHONE-05-11.md, FR-helvetique-serrurerie.ch (« Formulaire 24 h/24 », garde)`,
    portee: "phrase",
    motif: /(?<!\p{L})(?:Formulaire|Formular)(?!\p{L})[^.!?¦]*?24\s*(?:h\s*\/\s*24|\/\s*7)/iu,
    exemple: "Formulaire 24 h/24, traitement ouvrable",
  },
  {
    sens: "creneaux d'intervention donnes en exemple",
    source: `${SOURCE_RELEVES}/RESTES-TELEPHONE-05-11.md, FR-helvetique-plomberie.ch (« créneaux de 2 heures … (ex: 9h-11h, 14h-16h) », garde)`,
    portee: "phrase",
    motif: /(?<!\p{L})(?:cr[ée]neaux?|Zeitfenster)(?!\p{L})/iu,
    exemple: "Intervention sur créneaux de 2 heures (ex: 9h-11h, 14h-16h).",
  },
  /*
   * v1.6.5 (trou 3 de l'audit) : les plages du CORPS des pages (<main>) sont
   * lues. Decision de Frederic (09.11) : une plage d'ouverture ou de
   * joignabilite est rouge ; une plage liee a l'INTERVENTION reste verte, comme
   * les durees et les contraintes de chantier. Ces trois exceptions ne valent
   * que dans le corps.
   */
  {
    sens: "plage liee a l'intervention dans la phrase (« Intervention », « Einsatz », « Einsatzzeiten », « Termine »), sans mot de joignabilite dans la meme phrase",
    source: "decision de Frederic du 09.11 (prompt v1.6.5, point c ; REVERIF-SOCLE-V1-6-2-09-11.md, « Précision de Frédéric ») ; decision du 03-04.11 pour les sites DE sans telephone",
    portee: "phrase",
    zones: ["corps"],
    motif: /(?<!\p{L})(?:Interventions?|Einsatz\p{L}*|Einsätze|Termine?)(?!\p{L})/iu,
    sauf: /(?<!\p{L})(?:joignables?|ouverts?|ouvertes?|ouverture|appel\p{L}*|appele[rz]|t[ée]l[ée]phon\p{L}*|permanence|erreichbar\p{L}*|Erreichbarkeit|ge[öo]ffnet|Öffnungszeit\p{L}*|Anruf\p{L}*|anrufen|Telefon\p{L}*|Rückruf\p{L}*|zurück\p{L}*|Hotline|Bürozeit\p{L}*|Sprechzeit\p{L}*)(?!\p{L})/iu,
    exemple: "Einsatzzeiten: 7 Tage, 7 bis 21.30 Uhr.",
  },
  {
    sens: "une duree, pas une heure du jour : une borne au-dela de 24, ou un mot de duree dans la phrase",
    source: "decision de Frederic du 09.11 (prompt v1.6.5, point c : « les durées » restent vertes)",
    portee: "phrase",
    zones: ["corps"],
    motif: /(?<!\p{L})(?:dur[ée]es?|durent|dure|comptez|compter|pr[ée]voy?ez|pr[ée]voir|pendant|environ|d[ée]lai\p{L}*|s[ée]chage|Dauer|dauer[nt]?|innerhalb|binnen|ca\.|etwa|rund|Trocknung\p{L}*)(?!\p{L})/iu,
    exemple: "Comptez 2 à 4 h de séchage ; réponse sous 24 à 48 h.",
  },
  {
    sens: "en-tete d'un tableau de tarifs jour / nuit : la plage entre parentheses apres « Tag » ou « jour », et dans la meme rangee « Nacht », « Feiertag », « Wochenende », « nuit », « week-end », « dimanche » ou « férié »",
    source: "faux positif de la contre-epreuve locale du 11.11, DE-helvetic-schluesseldienst.ch (« Situation | Tag (07–22 Uhr) | Nacht / Feiertag | Hinweis ») ; decision de Frederic : majorations et tarifs restent verts",
    portee: "phrase",
    zones: ["corps"],
    motif: /(?<!\p{L})(?:Tag|Tagsüber|jour|journée)\s*\([^)]*\d[^)]*\)[^¦.!?]*?(?<!\p{L})(?:Nacht|Feiertag\p{L}*|Wochenende|nuit|week-end|dimanche|férié\p{L}*)(?!\p{L})/iu,
    sauf: /(?<!\p{L})(?:erreichbar\p{L}*|Erreichbarkeit|ge[öo]ffnet|Öffnungszeit\p{L}*|joignables?|ouverts?|ouverture|appel\p{L}*|Anruf\p{L}*|anrufen|Telefon\p{L}*|t[ée]l[ée]phon\p{L}*|für\s+Sie\s+da|disponibles?|à\s+votre\s+(?:service|écoute))(?!\p{L})/iu,
    exemple: "Situation | Tag (07–22 Uhr) | Nacht / Feiertag | Hinweis",
  },
  {
    sens: "une contrainte de chantier ou de bruit",
    source: "decision de Frederic du 09.11 (prompt v1.6.5, point c : « Montage vor 7 Uhr oder nach 22 Uhr nur nach Absprache »)",
    portee: "phrase",
    zones: ["corps"],
    motif: /(?<!\p{L})(?:chantiers?|Baustelle\p{L}*|Bauarbeit\p{L}*|Montage\p{L}*|Lärm\p{L}*|Ruhezeit\p{L}*|Nachtruhe|Mittagsruhe|bruit\p{L}*|nuisances?)(?!\p{L})/iu,
    exemple: "Montage von 7 bis 12 Uhr, Lärm nur werktags.",
  },
];

/*
 * v1.6.3 (Frederic, 04.11 et 09.11) : le texte de la case de consentement est
 * NEUTRE. Il ne nomme ni le professionnel ni la transmission, qui s'expliquent
 * dans la politique de confidentialite ; il porte le lien vers cette page. Lu
 * sur les pages construites, dans le texte rendu par BlocConsentement
 * (`<span id="socle-consent-aide...">`), en FR et en DE.
 */
const CONSENT_INTERDIT = /(?<!\p{L})(?:Fachbetrieb\p{L}*|weitergegeben|weitergeleitet|transmis\p{L}*|transmet\p{L}*|professionnel\p{L}*|partenaire\p{L}*)(?!\p{L})/giu;
const LIEN_CONFIDENTIALITE = /<a\b[^>]*\bhref="[^"]*(?:datenschutz|confidentialit|privacy|protection-des-donnees)[^"]*"/i;

/** Les textes de la case de consentement d'une page construite. */
export function textesConsentement(html) {
  return [...html.matchAll(/<span\b[^>]*\bid="socle-consent-aide[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => m[1]);
}

/** L'exception nommee qui couvre la plage placee de `debut` a `fin` du texte, ou null. */
function exceptionPlage(texte, debut, fin, langue, zone) {
  const ouvre = Math.max(texte.lastIndexOf("¦", debut), -1) + 1;
  const ferme = (() => { const j = texte.indexOf("¦", fin); return j < 0 ? texte.length : j; })();
  const bloc = texte.slice(ouvre, ferme);
  const avantBloc = texte.slice(ouvre, debut);
  const phraseDebut = Math.max(...[".", "!", "?"].map((c) => avantBloc.lastIndexOf(c)), -1) + 1;
  const apres = texte.slice(fin, ferme);
  const phraseFin = (() => { const k = apres.search(/[.!?]/); return k < 0 ? apres.length : k; })();
  const phrase = texte.slice(ouvre + phraseDebut, fin + phraseFin);
  /* L'etiquette : retirer les plages et les separateurs qui precedent, le libelle doit etre en bout. */
  const separateurs = /(?:[\s·•,;:|/]|\bet\b|\bund\b|\bsowie\b)+$/giu;
  /* v1.6.5 : un qualificatif de jours entre le libelle et la plage (« Einsatzzeiten: 7 Tage, 7 bis 21.30 Uhr »). */
  const tete = avantBloc.replace(motifPlage(langue), " ").replace(separateurs, "").replace(/(?<!\p{L})(?:\d\s*Tage|täglich|tous les jours|7\s*j(?:ours)?\s*\/\s*7|7\/7)$/iu, "").replace(separateurs, "").trimEnd();
  return EXCEPTIONS_PLAGES.find((x) =>
    (!x.zones || x.zones.includes(zone)) &&
    (x.portee === "etiquette" ? x.motif.test(tete) : x.motif.test(phrase) && !(x.sauf && x.sauf.test(phrase)))) ?? null;
}

/** Les plages horaires d'un texte, chacune dite conforme ou non. */
export function plagesHoraires(texte, langue, zone = null) {
  const out = [];
  if (langue === "fr") {
    for (const m of texte.matchAll(motifPlageVirgule())) {
      const [, j1, j2, h1, m1, h2, m2] = m;
      const conforme = numeroJour("fr", j1) === 1 && numeroJour("fr", j2) === 5 && Number(h1) * 60 + Number(m1 || 0) === 600 && Number(h2) * 60 + Number(m2 || 0) === 1140;
      const exception = conforme ? null : exceptionPlage(texte, m.index, m.index + m[0].length, langue, zone);
      out.push({ texte: m[0].trim(), conforme: conforme || Boolean(exception), exception: exception?.sens ?? null });
    }
  }
  for (const m of texte.matchAll(motifPlage(langue))) {
    const [, j1, j2, h1, h1h, h1m, h1c, h1p, h2, h2h, h2m, h2c, h2p, uhr] = m;
    const marque = h1h || h2h || h1c || h2c || ((h1p || h2p) && uhr) || uhr;
    if (!marque) continue; /* « 2-3 », un code postal ou un prix : pas une heure */
    if ((h1p || h2p) && !uhr) continue;
    const debut = Number(h1) * 60 + Number(h1m || h1c || h1p || 0);
    const fin = Number(h2) * 60 + Number(h2m || h2c || h2p || 0);
    const d1 = j1 ? numeroJour(langue, j1) : null;
    const d2 = j2 ? numeroJour(langue, j2) : null;
    const jours = !j1 || (d1 === 1 && d2 === 5);
    const conforme = jours && debut === 600 && fin === 1140;
    /* v1.6.5 : dans le corps, une borne au-dela de 24 h est une duree (« 24 à 48 h »), pas une heure. */
    /*
     * v1.6.5 (faux positifs de la contre-epreuve locale du 11.11 : pastilles de duree « 1–2 h »
     * de DE-helvetic-kaminfeger.ch, « 3–6 h » de DE-helvetic-schluesseldienst.ch) : dans le corps,
     * sans jour, sans minutes, sans « Uhr », une plage est une duree si sa borne haute vaut 4 h au
     * plus (une ouverture ne finit pas entre minuit et 4 h), ou si elle est SEULE dans son bloc avec
     * 6 h d'ecart au plus. « Ouvert de 2 h à 6 h. » ou « 8–18 h » seul restent rouges.
     * Les deux regles se lisent en minutes (borne haute 4 h, ecart 6 h).
     */
    const ouvreBloc = texte.lastIndexOf("¦", m.index) + 1;
    const fermeBloc = (() => { const j = texte.indexOf("¦", m.index + m[0].length); return j < 0 ? texte.length : j; })();
    const seule = texte.slice(ouvreBloc, fermeBloc).replace(m[0], "").replace(/[\s·•,;:()]/g, "") === "";
    /* minutes en « h 30 » admises (FR-helvetique-chauffage.ch, « 1 h à 1 h 30 » d'un tableau de durees) ; jamais « 08:00 » ni « 7.30 ». */
    const courte = !j1 && !uhr && !h1c && !h1p && !h2c && !h2p && debut < fin && (fin <= 240 || (seule && !h1m && !h2m && fin - debut <= 360));
    const duree = zone === "corps" && (Number(h1) > 24 || Number(h2) > 24 || courte);
    const exception = conforme || duree ? null : exceptionPlage(texte, m.index, m.index + m[0].length, langue, zone);
    if (duree) { out.push({ texte: m[0].trim(), conforme: true, exception: "une duree, pas une heure du jour" }); continue; }
    out.push({ texte: m[0].trim(), conforme: conforme || Boolean(exception), exception: exception?.sens ?? null });
  }
  return out;
}

/** Les heures d'ouverture du JSON-LD, en texte « Mo-Fr 10:00-19:00 ». */
function plagesLd(html) {
  const out = [];
  const nomJour = (d) => String(d).replace(/^https?:\/\/schema\.org\//, "").slice(0, 2);
  for (const ld of jsonLd(html)) {
    parcourirLd(ld, (n) => {
      for (const h of [n.openingHours].flat()) if (typeof h === "string") out.push(...plagesHoraires(h, "en"));
      if (typesLd(n).includes("OpeningHoursSpecification") && n.opens && n.closes) {
        const jours = [n.dayOfWeek].flat().filter(Boolean).map(nomJour);
        const texte = `${jours.length ? `${jours[0]}-${jours[jours.length - 1]} ` : ""}${n.opens}-${n.closes}`;
        const p = plagesHoraires(texte, "en");
        const ok = jours.length === 5 && ["Mo", "Tu", "We", "Th", "Fr"].every((j) => jours.includes(j));
        out.push(...p.map((x) => ({ ...x, conforme: x.conforme && (jours.length === 0 || ok) })));
      }
    });
  }
  return out;
}

function bloc(html, debut, fin) {
  const i = html.indexOf(debut);
  if (i < 0) return null;
  const j = html.indexOf(fin, i);
  return html.slice(i, j < 0 ? html.length : j + fin.length);
}

/* La barre collante du bas : la classe de sa racine, tenue par l'empreinte. */
const RACINE_BARRE_BAS = "fixed inset-x-0 bottom-0 z-40";

function barreBas(html) {
  const i = html.indexOf(RACINE_BARRE_BAS);
  if (i < 0) return null;
  const j = html.indexOf("sr-only", i);
  return html.slice(i, j < 0 ? html.length : j);
}

function pagesHtml(dir) {
  const out = [];
  (function parcourir(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (e.name.endsWith(".html")) out.push(p);
    }
  })(dir);
  return out.sort();
}

/*
 * v1.6.5 (Frederic, 11.11) : un lien interne d'une page servie pointe vers
 * l'adresse canonique, avec « / » final. L'adresse sans « / » repond par une
 * redirection 301 (mesure en ligne du 11.11, 5 sites, un seul saut). Interne :
 * un chemin « /... » ou une adresse du domaine du site (`domain:` de la
 * configuration). Restent hors regle : la racine, un fichier (.xml, .pdf,
 * image...), une ancre ou des parametres seuls, un lien externe, mailto: et tel:.
 */
const FICHIER_LIEN = /\.[a-z0-9]{2,5}$/i;
export function lienSansSlash(href, domaine) {
  let h = href.trim().replace(/&amp;/g, "&");
  if (domaine) h = h.replace(new RegExp(`^https?://(?:www\\.)?${domaine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[/?#]|$)`, "i"), "");
  if (!h.startsWith("/") || h.startsWith("//")) return null;
  const chemin = h.split(/[?#]/)[0];
  if (chemin === "/" || chemin.endsWith("/") || FICHIER_LIEN.test(chemin)) return null;
  return chemin;
}

export function mesureTelephonePages(site, dossierPages, defauts) {
  const regle = regleTelephone(site);
  if (regle.parc) return;
  if (!fs.existsSync(dossierPages)) {
    defauts.push(`pages:${dossierPages} introuvable : lancer la garde des pages apres le build`);
    return;
  }
  const constats = new Map();
  const noter = (cle, page, detail) => {
    if (!constats.has(cle)) constats.set(cle, []);
    constats.get(cle).push(detail ? `${page} « ${detail} »` : page);
  };
  const numeroNormal = regle.numero.replace(/\s+/g, " ");
  const pages = pagesHtml(dossierPages);
  const fConfig = path.join(site, "src/data/config.ts");
  const texteConfig = fs.existsSync(fConfig) ? lire(fConfig) : "";
  /* `domainBare: "..."` sur les 29 sites (11.11), sinon `domain: "..."`. */
  const domaine = (texteConfig.match(/\bdomainBare:\s*["']([^"']+)["']/) ?? texteConfig.match(/\bdomain:\s*["']([^"']+)["']/) ?? [])[1]?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "") ?? null;

  for (const p of pages) {
    const page = path.relative(dossierPages, p);
    const html = lire(p);

    /* v1.6.3 : la case de consentement, neutre et avec le lien de confidentialite. */
    for (const bloc of textesConsentement(html)) {
      const texte = texteVisible(bloc);
      for (const m of texte.matchAll(CONSENT_INTERDIT)) noter("case de consentement qui nomme la transmission (texte neutre attendu)", page, m[0]);
      if (!LIEN_CONFIDENTIALITE.test(bloc)) noter("case de consentement sans lien vers la politique de confidentialite", page);
    }

    /* v1.6.5 : les liens internes, vers l'adresse canonique avec « / » final. */
    const sansSlash = [...html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"/gi)].map((m) => lienSansSlash(m[1], domaine)).filter(Boolean);
    if (sansSlash.length) {
      const distincts = [...new Set(sansSlash)];
      noter("lien interne vers une adresse qui redirige (sans « / » final)", page, `${sansSlash.length} lien(s), ${distincts.length} adresse(s) : ${distincts.slice(0, 3).join(" ")}${distincts.length > 3 ? " ..." : ""}`);
    }

    /* d) une seule plage horaire, FR et DE : pied, page contact, JSON-LD ; v1.6.5 (trou 3) : corps des pages (<main>). */
    const zones = [["pied", bloc(html, "<footer", "</footer>")]];
    if (/^(contact|kontakt)[\\/]index\.html$/.test(page)) {
      const i = html.indexOf("</header>");
      const j = html.indexOf("<footer", i);
      zones.push(["contact", i < 0 ? html : html.slice(i, j < 0 ? html.length : j)]);
    } else {
      /*
       * v1.6.5 (faux positif de la contre-epreuve locale du 11.11, DE-helvetic-glaserei.ch,
       * en-tete « Einsatz | Tag (07–20 Uhr) | Nacht / Wochenende | Hinweis ») : dans le corps,
       * une rangee de tableau se lit comme UNE phrase, ses cellules reunies ; les exceptions
       * nommees (intervention, tarif, majoration) s'y appliquent comme a une phrase.
       */
      const corpsHtml = bloc(html, "<main", "</main>");
      zones.push(["corps", corpsHtml && corpsHtml.replace(/<\/t[hd]>\s*<t[hd]\b[^>]*>/gi, " · ")]);
    }
    for (const [zone, contenu] of zones) {
      if (!contenu) continue;
      for (const x of plagesHoraires(texteVisible(contenu, { blocs: true }), regle.langue, zone)) {
        if (!x.conforme) noter(`plage horaire autre que lun-ven 10h-19h (${zone})`, page, x.texte);
      }
    }
    for (const x of plagesLd(html)) {
      if (!x.conforme) noter("plage horaire autre que Mo-Fr 10:00-19:00 (JSON-LD)", page, x.texte);
    }

    if (regle.langue === "de") {
      if (/href="tel:/i.test(html)) noter("lien tel: sur un site DE", page);
      if (/class="[^"]*\blucide-phone/i.test(html)) noter("icone de telephone sur un site DE", page);
      const texte = texteVisible(html);
      const texteSansChamp = texteVisible(sansChampTelefonnummer(html), { blocs: true });
      for (const a of texteSansChamp.matchAll(new RegExp(ANRUF.source, "giu"))) {
        noter("« Anruf, anrufen, rufen Sie an » sur un site DE", page, texteSansChamp.slice(Math.max(0, a.index - 50), a.index + a[0].length + 30).replace(/¦/g, "").replace(/\s+/g, " ").trim());
      }
      const faq = texteFaqLd(html);
      for (const a of faq.matchAll(new RegExp(ANRUF.source, "giu"))) {
        noter("« Anruf, anrufen, rufen Sie an » sur un site DE (FAQ JSON-LD)", page, faq.slice(Math.max(0, a.index - 50), a.index + a[0].length + 30).replace(/¦/g, "").replace(/\s+/g, " ").trim());
      }
      for (const m of faq.matchAll(ERREICHBAR)) {
        const debut = Math.max(0, m.index - 80);
        const contexte = faq.slice(debut, m.index + m[0].length + 40);
        if (exceptionCouvre(contexte, m.index - debut)) continue;
        noter("« erreichbar » au sens du telephone sur un site DE (FAQ JSON-LD)", page, contexte.replace(/¦/g, "").replace(/\s+/g, " ").trim());
      }
      const texteTelefon = `${texteSansChamp} ¦ ${faq}`;
      for (const t of texteTelefon.matchAll(new RegExp(TELEFON.source, "giu"))) {
        noter("« Telefon, telefonisch » sur un site DE (texte, metas ou FAQ JSON-LD)", page, texteTelefon.slice(Math.max(0, t.index - 50), t.index + 40).replace(/¦/g, "").replace(/\s+/g, " ").trim());
      }
      for (const m of texte.matchAll(ERREICHBAR)) {
        const debut = Math.max(0, m.index - 80);
        const contexte = texte.slice(debut, m.index + m[0].length + 40);
        if (exceptionCouvre(contexte, m.index - debut)) continue;
        noter("« erreichbar » au sens du telephone sur un site DE (ou exception a nommer)", page, contexte.trim());
      }
      for (const n of texteTelefon.matchAll(NUMERO_SUISSE)) {
        noter("numero de telephone ecrit sur un site DE (texte, metas ou FAQ JSON-LD)", page, texteTelefon.slice(Math.max(0, n.index - 30), n.index + n[0].length + 10).replace(/¦/g, "").replace(/\s+/g, " ").trim());
      }
      continue;
    }

    if (!regle.numero || !regle.ligne) continue;
    const entete = bloc(html, "<header", "</header>");
    if (!entete) continue; /* une page sans en-tete n'est pas une page du site (verification Bing, etc.) */
    const tEntete = texteVisible(entete);
    if (!tEntete.includes(numeroNormal)) noter("en-tete sans le numero", page);
    if (!HORAIRES_APPEL.test(tEntete)) noter("en-tete sans les horaires d'appel", page);
    const barre = barreBas(html);
    if (!barre) noter("barre collante du bas absente", page);
    else {
      const tBarre = texteVisible(barre);
      if (!tBarre.includes(numeroNormal)) noter("barre collante du bas sans le numero", page);
      if (!HORAIRES_APPEL.test(tBarre)) noter("barre collante du bas sans les horaires d'appel", page);
    }
    if (/^(contact|kontakt)[\\/]index\.html$/.test(page)) {
      const i = html.indexOf("</header>");
      const j = html.indexOf("<footer", i);
      const tContenu = texteVisible(html.slice(i, j < 0 ? html.length : j));
      if (!tContenu.includes(numeroNormal)) noter("page contact sans le numero dans son contenu", page);
      if (!HORAIRES_APPEL.test(tContenu)) noter("page contact sans les horaires d'appel dans son contenu", page);
    }
  }

  if (regle.langue === "fr" && regle.numero && regle.ligne && !pages.some((p) => /^(contact|kontakt)[\\/]index\.html$/.test(path.relative(dossierPages, p)))) {
    noter("page contact introuvable (contact/index.html)", "-");
  }

  const tout = process.env.GARDE_SOCLE_TOUT === "1";
  for (const [cle, liste] of constats) {
    defauts.push(`${cle.startsWith("case de consentement") ? "consentement" : cle.startsWith("lien interne") ? "liens" : "telephone"}:${cle} : ${liste.length} page(s)\n      ${liste.slice(0, tout ? liste.length : 8).join("\n      ")}${!tout && liste.length > 8 ? `\n      (+${liste.length - 8}, tout voir : GARDE_SOCLE_TOUT=1)` : ""}`);
  }
  return pages.length;
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

/*
 * Seule la DEMANDE est gratuite, jamais le devis (Frederic, 09.11, v1.6.4).
 * Aucun fichier du socle, zones libres comprises, ne promet la gratuite du
 * devis : « devis » suivi de « gratuit(s) », « kostenlos… » suivi de
 * « Angebot(e) » ou de « Kostenvoranschlag », sans casse (motif ci-dessous).
 * v1.6.5 (Frederic, 11.11, par CORRECTIFS BATIMENT) : aussi « kostenlos… »
 * suivi de « Offerte(n) », dans un bouton ou un libelle du socle.
 * « Demande gratuite » et « Kostenlose Anfrage » passent.
 */
const DEVIS_GRATUIT = /(?<!\p{L})(?:devis\s+gratuits?|kostenlos\p{L}*\s+(?:Angebot\p{L}*|Kostenvoranschl\p{L}*|Offerte\p{L}*))(?!\p{L})/giu;
export function devisGratuits(texte) {
  const trouves = [];
  for (const m of texte.matchAll(DEVIS_GRATUIT)) {
    trouves.push({ ligne: texte.slice(0, m.index).split("\n").length, texte: m[0] });
  }
  return trouves;
}

/*
 * v1.6.5 (Frederic, 11.11 ; CONTRAT-FORMULAIRE-BATIMENT-04-11.md) : l'envoi du
 * lead porte event_id (aussi en-tete Idempotency-Key), origine_demande,
 * consentement_at et source « formulaire » ; lead_submit part APRES la
 * reponse, seulement sur un succes explicite. Lu dans src/lib/api.ts.
 */
export function mesureEnvoiLead(api) {
  const d = [];
  const i = api.indexOf("export async function submitLead");
  const corps = i < 0 ? "" : api.slice(i, api.indexOf("\n}\n", i) + 2);
  if (!corps) return ["n'a pas de fonction submitLead"];
  /* Les champs sont cherches dans l'objet ENVOYE (`const charge = { ... };`), pas ailleurs dans la fonction. */
  const iCharge = corps.indexOf("const charge");
  const charge = iCharge < 0 ? "" : corps.slice(iCharge, corps.indexOf("\n  };", iCharge));
  for (const [champ, motif, ou] of [
    ["event_id", /\bevent_id:\s*eventId\b/, charge],
    ["origine_demande", /\borigine_demande:\s*origineDemande\(\)/, charge],
    ["consentement_at", /\bconsentement_at:\s*payload\.consent\b/, charge],
    ["source « formulaire »", /\bsource:\s*"formulaire"/, charge],
    ["en-tete Idempotency-Key", /"idempotency-key":\s*eventId\b/i, corps],
  ]) {
    if (!motif.test(ou)) d.push(`n'envoie pas ${champ}`);
  }
  if (!/body:\s*JSON\.stringify\(\s*charge\s*\)/.test(corps)) d.push("n'envoie pas l'objet charge (body: JSON.stringify(charge))");
  const iFetch = corps.indexOf("await fetch(");
  const iSucces = corps.search(/if\s*\(\s*!\s*succes\s*\)\s*throw\b/);
  const iSignal = corps.indexOf("signalerLeadSubmit(");
  if (iFetch < 0 || iSucces < 0 || iSignal < 0 || !(iFetch < iSucces && iSucces < iSignal)) {
    d.push("n'envoie pas lead_submit APRES la reponse et seulement sur un succes");
  }
  const sansSignal = api.replace(/function signalerLeadSubmit[\s\S]*?\n}\n/, "");
  if (/["'`]lead_submit["'`]/.test(sansSignal.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"))) {
    d.push("envoie lead_submit ailleurs que dans signalerLeadSubmit");
  }
  if (!/response\.ok\s*&&\s*estSucces\(/.test(corps)) d.push("ne tient pas un succes pour EXPLICITE (2xx et corps attendu)");
  /* v1.6.5 (Frederic, 11.11) : UN essai de plus, sur 502, 503, 504 ou reseau coupe seulement, apres 2 s, meme charge. */
  if (!/export const ESSAI_STATUTS = \[502, 503, 504\];/.test(api)) d.push("ne limite pas le nouvel essai a 502, 503 et 504");
  if (!/export const ESSAI_ATTENTE_MS = 2000;/.test(api)) d.push("n'attend pas 2 secondes avant le nouvel essai");
  if ((corps.match(/await envoyer\(\)/g) ?? []).length !== 2 || !/r === null \|\| ESSAI_STATUTS\.includes\(r\.status\)/.test(corps)) {
    d.push("ne fait pas UN seul nouvel essai, sur reseau coupe ou 502, 503, 504");
  }
  if ((corps.match(/JSON\.stringify\(\s*charge\s*\)/g) ?? []).length !== 1) d.push("ne renvoie pas la meme charge (meme event_id) au nouvel essai");
  return d;
}

/** Les fichiers du site, hors socle, qui envoient lead_submit (commentaires retires ; une mention en texte, `<code>lead_submit</code>`, passe). */
export function fichiersLeadSubmit(site) {
  const socle = new Set(["src/lib/api.ts"]);
  const out = [];
  (function parcourir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        parcourir(p);
      } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
        const rel = path.relative(site, p);
        if (socle.has(rel)) continue;
        const code = lire(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        if (/["'`]lead_submit["'`]/.test(code)) out.push(rel);
      }
    }
  })(path.join(site, "src"));
  for (const f of ["index.html"]) {
    const p = path.join(site, f);
    if (fs.existsSync(p) && /["'`]lead_submit["'`]|data-umami-event=["']lead_submit/.test(lire(p))) out.push(f);
  }
  return out;
}

/** Les fichiers du site, hors socle, qui reecrivent l'historique du navigateur ou desactivent la tenue des liens canoniques (commentaires retires). */
export function fichiersContournementLiens(site) {
  const out = [];
  const motif = /\bhistory\.(?:pushState|replaceState)\s*=(?!=)|defineProperty\(\s*(?:window\.)?history\b|__socleLiensCanoniques/;
  (function parcourir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "__tests__") continue;
        parcourir(p);
      } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
        const rel = path.relative(site, p);
        if (rel === "src/data/navigation.ts") continue;
        const code = lire(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        if (motif.test(code)) out.push(rel);
      }
    }
  })(path.join(site, "src"));
  return out;
}

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
    for (const g of devisGratuits(texteCopie)) {
      defauts.push(`gratuite:${entree.chemin} ligne ${g.ligne} : « ${g.texte} » (seule la demande est gratuite, jamais le devis)`);
    }

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
  let dossierPages = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--reference") {
      reference = args[i + 1];
      i += 1;
    } else if (args[i] === "--pages") {
      dossierPages = args[i + 1];
      i += 1;
    } else if (!args[i].startsWith("--")) {
      site = args[i];
    }
  }
  site = path.resolve(site);

  /* Mode des pages construites : seulement la regle du telephone (mesure 8). */
  if (dossierPages) {
    const defauts = [];
    const n = mesureTelephonePages(site, path.resolve(site, dossierPages), defauts);
    if (defauts.length > 0) {
      console.error(`GARDE_SOCLE_PAGES_FAIL ${defauts.length} defaut(s) sur ${path.basename(site)} :`);
      for (const d of defauts) console.error(`  - ${d}`);
      console.error("\nRegle du telephone du batiment : docs/SOCLE-BATIMENT.md, § 1.2, du depot helvetic-deploy.");
      process.exit(1);
    }
    console.log(`GARDE_SOCLE_PAGES_OK regle du telephone tenue sur ${n ?? 0} page(s)`);
    return;
  }

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
