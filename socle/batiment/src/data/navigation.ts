/*
 * SOCLE BATIMENT : les entrees du menu.
 *
 * Le gabarit n'ecrit AUCUN menu en dur. Il declare l'ordre commun des sections,
 * puis il DEMANDE AU SITE lesquelles existent : `pagesForRoute` est le routeur
 * du site, et il rend `[NotFound]` pour un chemin qu'il ne connait pas. Une
 * section sans route disparait donc du menu toute seule, sans qu'on touche au
 * gabarit.
 *
 * Verifie par la garde de conformite (ops/garde-socle) : ce fichier doit etre
 * identique a la reference, zones libres mises a part.
 */
import { NotFound, pagesForRoute } from "@/routes";

export type EntreeMenu = { libelle: string; href: string };

/*
 * L'ORDRE est commun a tous les sites du batiment. Les LIBELLES sont ceux qui
 * sont deja servis par les sites du lot 1 : rien n'est invente ici, la charte
 * editoriale ne fixe aucune voix pour le batiment (CHARTE v3.2, par. 3).
 */
/* socle:libre:debut libelles de langue, a traduire pour un site DE */
const SECTIONS: EntreeMenu[] = [
  { libelle: "Services", href: "/services" },
  { libelle: "Villes", href: "/villes" },
  { libelle: "Tarifs", href: "/tarifs" },
  { libelle: "Blog", href: "/blog" },
  { libelle: "FAQ", href: "/faq" },
  { libelle: "Contact", href: "/contact" },
];
/* socle:libre:fin */

/** Une section existe si le routeur du site rend autre chose que la page 404. */
function routeExiste(href: string): boolean {
  const pages = pagesForRoute(href);
  if (pages.length === 0) return href === "/";
  return pages[0] !== NotFound;
}

export const NAV: EntreeMenu[] = SECTIONS.filter((s) => routeExiste(s.href));
