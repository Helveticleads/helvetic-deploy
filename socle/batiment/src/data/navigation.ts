/*
 * SOCLE BATIMENT : les entrees du menu.
 *
 * Le gabarit n'ecrit AUCUN menu en dur. Il declare SIX EMPLACEMENTS communs,
 * puis il DEMANDE AU SITE lesquels existent : `pagesForRoute` est le routeur du
 * site, et il rend `[NotFound]` pour un chemin qu'il ne connait pas. Un
 * emplacement sans route disparait donc tout seul.
 *
 * SIX AU PLUS DANS LA BARRE. Decision de Frederic du 02.11.2026 : l'en-tete ne
 * garde que les sections communes du parc. Mesure du meme jour sur un menu de
 * neuf entrees : a 1024 px, la navigation recouvre le logo. Ce qui n'entre pas
 * dans la barre n'est pas perdu pour autant, il reste dans le menu du
 * telephone, par `NAV_TELEPHONE`, et dans le pied de page du site.
 *
 * Verifie par la garde de conformite (ops/garde-socle) : ce fichier doit etre
 * identique a la reference, zones libres mises a part. La limite de six est
 * donc tenue par l'empreinte, et non par la bonne volonte de chaque site.
 */
import { NotFound, pagesForRoute } from "@/routes";
import { SITE_CONFIG, phoneHref } from "@/data/config";

export type EntreeMenu = { libelle: string; href: string };

/*
 * La zone libre porte DEUX choses, et rien d'autre :
 *
 *   LIBELLES : les sept mots de la langue du site. Les CLES ne changent pas,
 *              le reste du fichier les lit. Un site allemand traduit les
 *              valeurs, jamais les cles.
 *   EN_PLUS  : les sections propres au site, qui ne sont PAS dans la barre
 *              mais paraissent dans le menu du telephone. Vide par defaut.
 */
/* socle:libre:debut libelles de langue, et sections propres au site */
const LIBELLES = {
  services: "Services",
  villes: "Villes",
  tarifs: "Tarifs",
  journal: "Blog",
  conseils: "Conseils",
  faq: "FAQ",
  contact: "Contact",
};

const EN_PLUS: EntreeMenu[] = [];
/* socle:libre:fin */

/*
 * La langue et les chemins viennent de la configuration du site. Un site
 * francais ne declare rien : les valeurs ci-dessous sont les siennes. Un site
 * allemand declare `langue: "de"` et `chemins`, parce que ses routes s'appellent
 * /leistungen ou /kontakt : sans cela, sa barre resterait presque vide.
 */
type CleChemin = keyof typeof LIBELLES;
const SITE = SITE_CONFIG as typeof SITE_CONFIG & {
  langue?: "fr" | "de";
  chemins?: Partial<Record<CleChemin, string>>;
  ligne?: boolean;
  /** v1.6.6 : forme des adresses du site (voir lienCanonique). */
  slashFinal?: boolean;
};

/*
 * LE DRAPEAU `ligne`. Un site qui n'a pas de ligne joignable declare
 * `ligne: false` dans sa configuration : le numero n'est alors rendu NULLE
 * PART, meme s'il reste ecrit dans `SITE_CONFIG.phone`, et avec lui l'icone de
 * telephone et le bouton « Appeler ». Regle de Frederic du 03.11.2026 : aucune
 * icone de telephone sans lien `tel:`, aucun horaire d'appel sans ligne. Un
 * site qui ne declare rien garde son rendu : la valeur par defaut est vraie.
 */
export function telephone(): string | null {
  return SITE.ligne === false ? null : phoneHref();
}

const CHEMINS: Record<CleChemin, string> = Object.assign(
  {
    services: "/services",
    villes: "/villes",
    tarifs: "/tarifs",
    journal: "/blog",
    conseils: "/conseils",
    faq: "/faq",
    contact: "/contact",
  },
  SITE.chemins,
);

/** Le bouton de devis de l'en-tete et de la barre du bas. */
export const CHEMIN_CONTACT = CHEMINS.contact;

/*
 * v1.6.6 (Frederic, 11.11) : un lien interne pointe DIRECTEMENT vers l'adresse
 * canonique du site, celle de son canonical et de son sitemap. Sa FORME est un
 * REGLAGE ECRIT dans la configuration du site, `slashFinal` de `SITE_CONFIG` :
 *   - `slashFinal: true`  : adresses avec « / » final (« /services/ ») ;
 *   - `slashFinal: false` : adresses sans « / » final (« /services »).
 * Le socle ne decide rien : il lit le reglage. Reglage absent (la garde l'exige
 * a la source et sur les pages), le lien reste tel qu'il est ecrit. Les chemins
 * du site (`CHEMINS`, `NAV`, `CHEMIN_CONTACT`) restent ses routes, ecrites sans
 * « / ». Restent tels quels : la racine, un lien externe ou `//`, un fichier
 * (.xml, .pdf, image...) ; l'ancre et les parametres sont gardes apres le chemin.
 * (v1.6.5 posait le « / » partout : regression sur les 9 sites sans « / ».)
 */
const FICHIER = /\.[a-z0-9]{2,5}$/i;
export function lienCanonique(href: string): string {
  const slash = SITE.slashFinal;
  if (slash !== true && slash !== false) return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const i = href.search(/[?#]/);
  const chemin = i < 0 ? href : href.slice(0, i);
  const suite = i < 0 ? "" : href.slice(i);
  if (chemin === "/" || FICHIER.test(chemin)) return href;
  if (slash) return chemin.endsWith("/") ? href : `${chemin}/${suite}`;
  return chemin.endsWith("/") ? `${chemin.replace(/\/+$/, "") || "/"}${suite}` : href;
}

/*
 * v1.6.5, point 7 (Frederic, 11.11) : les liens APRES l'execution du
 * JavaScript. La passe du build (`scripts/socle-liens.mjs`) corrige le HTML
 * servi ; mais le code du site rend ses liens sans « / », et une navigation
 * sans rechargement les remet dans la page affichee, que Google lit aussi.
 * Ce module, charge par l'en-tete sur chaque page, tient la regle au centre :
 *   1. l'historique du navigateur (`pushState`, `replaceState`) recoit
 *      l'adresse canonique (forme du reglage `slashFinal`) : l'adresse affichee,
 *      le rechargement, le partage et la page vue d'Umami la portent. Son enveloppe reste la
 *      premiere appelee meme si Umami pose la sienne apres (accesseur) ;
 *   2. un observateur du document remet le « / » a tout lien interne qui
 *      apparait ou change apres l'hydratation (v1.6.6 : la forme du reglage) (React ne relit pas un attribut
 *      dont la valeur ne change pas dans son code).
 * Meme regle que `lienCanonique` : racine, fichiers, liens externes,
 * mailto:, tel:, ancres seules intacts. Rien ne tourne au prerendu (pas de
 * `window`) ni avant l'hydratation : le HTML servi porte deja le « / ».
 */
export function urlCanonique(url: string, origine: string): string {
  if (url.startsWith("#") || url.startsWith("?")) return url;
  let u: URL;
  try {
    u = new URL(url, `${origine}/`);
  } catch {
    return url;
  }
  if (u.origin !== origine || !/^https?:$/.test(u.protocol)) return url;
  const relatif = `${u.pathname}${u.search}${u.hash}`;
  const canon = lienCanonique(relatif);
  if (canon === relatif) return url;
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") ? `${u.origin}${canon}` : canon;
}

type FenetreSocle = Window & typeof globalThis & { __socleLiensCanoniques?: boolean };

export function installerLiensCanoniques(w: FenetreSocle | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!w || !w.document || !w.history || w.__socleLiensCanoniques) return false;
  w.__socleLiensCanoniques = true;
  const origine = w.location.origin;
  const histoire = w.history;
  for (const nom of ["pushState", "replaceState"] as const) {
    const natif = histoire[nom];
    let interieur: History[typeof nom] = natif;
    let dedans = false;
    const enveloppe = function (this: History, donnees: unknown, titre: string, url?: string | URL | null) {
      if (dedans) return natif.call(histoire, donnees, titre, url);
      dedans = true;
      try {
        const neuve = url == null ? url : urlCanonique(String(url), origine);
        return interieur.call(histoire, donnees, titre, neuve);
      } finally {
        dedans = false;
      }
    } as History[typeof nom];
    Object.defineProperty(histoire, nom, {
      configurable: true,
      get: () => enveloppe,
      set: (v: History[typeof nom]) => {
        if (v !== enveloppe) interieur = v;
      },
    });
  }
  const corriger = (a: Element) => {
    const h = a.getAttribute("href");
    if (!h) return;
    const n = urlCanonique(h, origine);
    if (n !== h) a.setAttribute("href", n);
  };
  const tout = (racine: ParentNode) => racine.querySelectorAll("a[href]").forEach(corriger);
  const demarrer = () => {
    tout(w.document);
    new w.MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.target instanceof w.Element && m.target.tagName === "A") corriger(m.target);
        m.addedNodes.forEach((n) => {
          if (!(n instanceof w.Element)) return;
          if (n.tagName === "A") corriger(n);
          tout(n);
        });
      }
    }).observe(w.document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
  };
  /* Apres l'hydratation : au premier repos du navigateur, sinon apres le chargement. */
  const plusTard = (f: () => void) => (typeof w.requestIdleCallback === "function" ? w.requestIdleCallback(f, { timeout: 2000 }) : w.setTimeout(f, 0));
  if (w.document.readyState === "complete") plusTard(demarrer);
  else w.addEventListener("load", () => plusTard(demarrer), { once: true });
  return true;
}
installerLiensCanoniques();

/*
 * Le libelle du bouton de devis, propre au site. Vide, le bouton dit « Demande
 * gratuite » ou « Kostenlose Anfrage » (seule la demande est gratuite, jamais
 * le devis : Frederic, 09.11). Un site de rendez-vous ecrit ici
 * `{ devis: "Prendre rendez-vous", devisLong: "Prendre rendez-vous" }`.
 */
/* socle:libre:debut libelle du bouton de devis */
const BOUTON: { devis?: string; devisLong?: string } = {};
/* socle:libre:fin */

/** Les textes des gabarits, par langue. Le site n'ecrit que le libelle du bouton. */
const TEXTES_LANGUE = {
  fr: {
    accueil: "Accueil",
    navigation: "Navigation principale",
    navigationRepliee: "Navigation repliee",
    appeler: "Appeler",
    devis: "Demande gratuite",
    devisLong: "Demande gratuite et sans engagement",
    fermerMenu: "Fermer le menu",
    ouvrirMenu: "Ouvrir le menu",
    whatsapp: "Ecrire sur WhatsApp",
    intervention: "Intervention",
  },
  de: {
    accueil: "Startseite",
    navigation: "Hauptnavigation",
    navigationRepliee: "Mobile Navigation",
    appeler: "Anrufen",
    devis: "Kostenlose Anfrage",
    devisLong: "Kostenlose und unverbindliche Anfrage",
    fermerMenu: "Menü schliessen",
    ouvrirMenu: "Menü öffnen",
    whatsapp: "Auf WhatsApp schreiben",
    intervention: "Einsatz",
  },
}[SITE.langue ?? "fr"];

export const TEXTES = { ...TEXTES_LANGUE, ...BOUTON };

/** Une section existe si le routeur du site rend autre chose que la page 404. */
function routeExiste(href: string): boolean {
  const pages = pagesForRoute(href);
  if (pages.length === 0) return href === "/";
  return pages[0] !== NotFound;
}

/** Six emplacements au plus : la limite est ICI, hors de toute zone libre. */
const SIX = 6;

/*
 * Les emplacements de la barre, dans l'ordre. C'est une zone libre : un site
 * du parc nomme ses propres sections (« Prestations », « Lieux »), mais il n'en
 * declare jamais plus de SIX. La garde compte les emplacements de cette zone,
 * et le module refuse de se charger au dela, donc le build echoue.
 *
 * Le quatrieme emplacement est tenu par le journal du site, qu'il s'appelle
 * `/blog` ou `/conseils`. Un site qui sert les deux n'en montre qu'un dans la
 * barre : l'autre descend dans le menu du telephone, comme le reste.
 */
/* socle:libre:debut sections de l'en-tete, six emplacements au plus */
const EMPLACEMENTS: EntreeMenu[][] = [
  [{ libelle: LIBELLES.services, href: CHEMINS.services }],
  [{ libelle: LIBELLES.villes, href: CHEMINS.villes }],
  [{ libelle: LIBELLES.tarifs, href: CHEMINS.tarifs }],
  [
    { libelle: LIBELLES.journal, href: CHEMINS.journal },
    { libelle: LIBELLES.conseils, href: CHEMINS.conseils },
  ],
  [{ libelle: LIBELLES.faq, href: CHEMINS.faq }],
  [{ libelle: LIBELLES.contact, href: CHEMINS.contact }],
];
/* socle:libre:fin */

if (EMPLACEMENTS.length > SIX) {
  throw new Error(`socle: l'en-tete n'accepte que ${SIX} emplacements, ${EMPLACEMENTS.length} declares`);
}

/** Le premier candidat d'un emplacement que le site sert vraiment. */
function tenuPar(candidats: EntreeMenu[]): EntreeMenu | null {
  return candidats.find((c) => routeExiste(c.href)) ?? null;
}

/** La barre : six entrees au plus, et c'est une limite dure. */
export const NAV: EntreeMenu[] = EMPLACEMENTS.map(tenuPar).filter(
  (e): e is EntreeMenu => e !== null,
);

if (NAV.length > SIX) {
  throw new Error(`socle: l'en-tete n'accepte que ${SIX} entrees, ${NAV.length} trouvees`);
}

/*
 * Le menu du telephone : la barre, puis ce que le site a en propre. C'est ce
 * qui garantit qu'aucune page ne perd son lien entrant quand elle quitte la
 * barre, puisque le panneau est rendu dans le HTML de chaque page.
 */
export const NAV_TELEPHONE: EntreeMenu[] = [
  ...NAV,
  ...EN_PLUS.filter((e) => routeExiste(e.href) && !NAV.some((n) => n.href === e.href)),
];
