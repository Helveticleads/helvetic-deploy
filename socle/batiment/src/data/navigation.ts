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
import { SITE_CONFIG } from "@/data/config";

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
};

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

/** Les textes des gabarits, par langue. Le site n'en ecrit aucun. */
export const TEXTES = {
  fr: {
    accueil: "Accueil",
    navigation: "Navigation principale",
    navigationRepliee: "Navigation repliee",
    appeler: "Appeler",
    devis: "Devis gratuit",
    devisLong: "Demander un devis gratuit",
    fermerMenu: "Fermer le menu",
    ouvrirMenu: "Ouvrir le menu",
    whatsapp: "Ecrire sur WhatsApp",
  },
  de: {
    accueil: "Startseite",
    navigation: "Hauptnavigation",
    navigationRepliee: "Mobile Navigation",
    appeler: "Anrufen",
    devis: "Offerte anfragen",
    devisLong: "Kostenloses Angebot anfragen",
    fermerMenu: "Menü schliessen",
    ouvrirMenu: "Menü öffnen",
    whatsapp: "Auf WhatsApp schreiben",
  },
}[SITE.langue ?? "fr"];

/** Une section existe si le routeur du site rend autre chose que la page 404. */
function routeExiste(href: string): boolean {
  const pages = pagesForRoute(href);
  if (pages.length === 0) return href === "/";
  return pages[0] !== NotFound;
}

/*
 * Le quatrieme emplacement est tenu par le journal du site, qu'il s'appelle
 * `/blog` ou `/conseils`. Un site qui sert les deux n'en montre qu'un dans la
 * barre : l'autre descend dans le menu du telephone, comme le reste.
 */
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

/** Le premier candidat d'un emplacement que le site sert vraiment. */
function tenuPar(candidats: EntreeMenu[]): EntreeMenu | null {
  return candidats.find((c) => routeExiste(c.href)) ?? null;
}

/** La barre : six entrees au plus, et c'est une limite dure. */
export const NAV: EntreeMenu[] = EMPLACEMENTS.map(tenuPar).filter(
  (e): e is EntreeMenu => e !== null,
);

if (NAV.length > EMPLACEMENTS.length) {
  throw new Error(
    `socle: l'en-tete n'accepte que ${EMPLACEMENTS.length} entrees, ${NAV.length} trouvees`,
  );
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
