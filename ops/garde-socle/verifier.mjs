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
const ANRUF = /anruf\p{L}*|(?<!(?<!\p{L})(wir|er|sie|der|die|das|ein|eine|man)\s)(?<!\p{L})rufen\s+Sie(?!\p{L})[^.!?¦]*?(?<!\p{L})an(?!\p{L})/iu;
/*
 * v1.6.2 (bat-37 b) : « Telefon », « telefonisch », « am / per Telefon »,
 * « Telefonat »... sur un site DE, dans le texte, les metas et la FAQ JSON-LD.
 * Le libelle du champ « Telefonnummer » sort du texte lu (EXCEPTION_ANRUF).
 */
const TELEFON = /(?<!\p{L})telefon\p{L}*/iu;
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

function numeroJour(langue, mot) {
  const i = JOURS[langue].findIndex((noms) => noms.includes(mot?.toLowerCase()));
  return i < 0 ? null : i + 1;
}

/** Les plages horaires d'un texte, chacune dite conforme ou non. */
export function plagesHoraires(texte, langue) {
  const out = [];
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
    out.push({ texte: m[0].trim(), conforme: jours && debut === 600 && fin === 1140 });
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

  for (const p of pages) {
    const page = path.relative(dossierPages, p);
    const html = lire(p);

    /* d) une seule plage horaire, FR et DE : pied, page contact, JSON-LD. */
    const zones = [["pied", bloc(html, "<footer", "</footer>")]];
    if (/^(contact|kontakt)[\\/]index\.html$/.test(page)) {
      const i = html.indexOf("</header>");
      const j = html.indexOf("<footer", i);
      zones.push(["contact", i < 0 ? html : html.slice(i, j < 0 ? html.length : j)]);
    }
    for (const [zone, contenu] of zones) {
      if (!contenu) continue;
      for (const x of plagesHoraires(texteVisible(contenu), regle.langue)) {
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
      const texteTelefon = `${texteSansChamp} ¦ ${texteFaqLd(html)}`;
      for (const t of texteTelefon.matchAll(new RegExp(TELEFON.source, "giu"))) {
        noter("« Telefon, telefonisch » sur un site DE (texte, metas ou FAQ JSON-LD)", page, texteTelefon.slice(Math.max(0, t.index - 50), t.index + 40).replace(/¦/g, "").replace(/\s+/g, " ").trim());
      }
      for (const m of texte.matchAll(ERREICHBAR)) {
        const debut = Math.max(0, m.index - 80);
        const contexte = texte.slice(debut, m.index + m[0].length + 40);
        if (exceptionCouvre(contexte, m.index - debut)) continue;
        noter("« erreichbar » au sens du telephone sur un site DE (ou exception a nommer)", page, contexte.trim());
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
    defauts.push(`telephone:${cle} : ${liste.length} page(s)\n      ${liste.slice(0, tout ? liste.length : 8).join("\n      ")}${!tout && liste.length > 8 ? `\n      (+${liste.length - 8}, tout voir : GARDE_SOCLE_TOUT=1)` : ""}`);
  }
  return pages.length;
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
