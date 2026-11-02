/*
 * SOCLE BATIMENT : l'EN-TETE commun.
 *
 * Ce qui est COMMUN, et que la garde de conformite verifie :
 * la structure, le comportement en largeur, les seuils, les reperes
 * d'accessibilite. Ce qui reste PROPRE A CHAQUE SITE : la palette et la
 * typographie, parce qu'elles passent par les jetons Tailwind du site
 * (`bg-card`, `text-accent`, `border-border`, `font-display`), dont chaque
 * site definit les valeurs dans son `index.css`. Le gabarit ne fixe aucune
 * couleur en dur.
 *
 * === LE NUMERO TIENT A UNE SEULE VALEUR ===
 *
 * `SITE_CONFIG.phone`. Vide, il ne laisse AUCUN TROU : `phoneHref()` rend
 * `null`, et chaque emplacement d'appel rend `null` a son tour. Renseigne, il
 * apparait partout ou la regle le place, sans autre geste :
 *   1. l'en-tete, colonne de droite, a partir de `xl` ;
 *   2. le bouton « Appeler » de l'en-tete sous `xl` ;
 *   3. le panneau de menu replie ;
 *   4. la barre collante du bas sur mobile (StickyMobileCTA) ;
 *   5. le pied de page ;
 *   6. la page contact ;
 *   7. le JSON-LD (`telephone`), dont le `@type` reste gele.
 *
 * === LA PLACE ===
 *
 * Trois seuils, et aucune plage de largeur sans appel :
 *   - sous `lg` : logo, « Appeler », « Menu ». La barre d'entrees est repliee.
 *   - de `lg` a `xl` : la barre d'entrees parait, « Appeler » reste.
 *   - a partir de `xl` : le numero et sa mention prennent la place
 *     d'« Appeler ». Numero et mention sont DEUX elements EMPILES, pas un
 *     seul lien : empiles, ils occupent la largeur du PLUS LARGE des deux et
 *     non leur somme, ce qui rend la mention gratuite horizontalement.
 *
 * Le logo est l'element qui CEDE : il porte `min-w-0` et jamais `shrink-0`.
 * Si le logo et le groupe d'actions refusaient tous deux de retrecir, leur
 * somme sortirait de la marge droite sous 390 px SANS que rien ne defile,
 * et aucune mesure de debordement ne le signalerait.
 *
 * === LE REPERE DE PAGE ===
 *
 * `aria-current="page"` sur le lien de la page servie, et pas seulement une
 * couleur : un lecteur d'ecran annonce « page actuelle » la ou un visiteur
 * voyant lit un contraste. La comparaison normalise la barre oblique finale,
 * parce que `/villes` et `/villes/` sont la meme page et que seule la seconde
 * forme est servie par le plan du site.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Phone, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { CanalWhatsapp } from "@/components/socle/CanalWhatsapp";
import { NAV, NAV_TELEPHONE } from "@/data/navigation";
import { SITE_CONFIG, phoneHref, phoneMention } from "@/data/config";
import { cn } from "@/lib/utils";

/*
 * Le bouton de devis est ECRIT ICI, et non pris au composant Button du site.
 * Les deux familles du parc n'ont pas le meme Button : celle des sites Claude
 * Code prend `href`, `variant` et `size` ; celle des sites Replit est un
 * bouton shadcn, avec `asChild` et d'autres variantes. Le socle ne peut pas
 * dependre de l'une des deux.
 *
 * Les classes sont celles que rendait `variant="primary"` : le dessin ne
 * change pas d'un pixel sur les sites qui avaient deja le socle. Le survol
 * retombe sur la couleur d'accent quand le site ne declare pas de couleur de
 * survol, ce qui est le cas de toute la famille Replit.
 */
const BOUTON_DEVIS =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all" +
  " focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" +
  " focus-visible:ring-offset-2 bg-accent text-accent-foreground shadow-sm" +
  " hover:bg-[var(--color-accent-hover,var(--color-accent))]";

const BOUTON_DEVIS_MD = "px-5 py-2.5 text-sm";
const BOUTON_DEVIS_LG = "px-6 py-3.5 text-base";

/** `/villes/` et `/villes` sont la meme page. */
function normaliserChemin(chemin: string): string {
  const sansParam = chemin.split("?")[0] || "/";
  if (sansParam === "/") return "/";
  return sansParam.replace(/\/+$/, "");
}

export function Header() {
  const [ouvert, setOuvert] = useState(false);
  const [emplacement] = useLocation();
  const courant = normaliserChemin(emplacement);
  const tel = phoneHref();
  const mention = phoneMention();

  /** Changer de page referme le panneau : il survivait a sa propre navigation. */
  useEffect(() => setOuvert(false), [emplacement]);

  /** Echap referme le panneau. */
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [ouvert]);

  /** Rubrique courante : la page elle meme, ou une de ses pages filles. */
  const marque = (href: string) => {
    const base = normaliserChemin(href);
    return courant === base || courant.startsWith(`${base}/`);
  };
  const marqueExact = (href: string) => normaliserChemin(href) === courant;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-3 md:h-20">
        <Link
          href="/"
          className="flex min-w-0 items-center"
          aria-label={`Accueil ${SITE_CONFIG.name}`}
        >
          <Logo />
        </Link>

        <nav
          className="hidden items-center gap-6 lg:flex"
          aria-label="Navigation principale"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={marqueExact(item.href) ? "page" : undefined}
              className={cn(
                "link-underline whitespace-nowrap text-sm font-medium",
                marque(item.href) ? "text-accent" : "text-foreground/80 hover:text-foreground",
              )}
            >
              {item.libelle}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          {/*
            Le numero et sa mention : DEUX elements empiles, sans cadre.
            `tel` nul, le bloc entier disparait, sans espace reserve.
          */}
          {tel ? (
            <div className="hidden flex-col items-end leading-tight xl:flex">
              <a href={tel} className="text-sm font-semibold hover:underline">
                {SITE_CONFIG.phone}
              </a>
              {mention ? (
                <span className="text-[0.68rem] text-muted-foreground">{mention}</span>
              ) : null}
            </div>
          ) : null}

          <CanalWhatsapp variante="icone" className={cn(
              "hidden h-10 w-10 items-center justify-center rounded-xl bg-[#25D366] text-white transition-colors hover:bg-[#1ebe57]",
              "lg:inline-flex",
            )} />

          {/* Sous `xl`, l'appel garde un bouton : aucune plage de largeur sans appel. */}
          {tel ? (
            <a
              href={tel}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold xl:hidden"
            >
              <Phone className="h-4 w-4" aria-hidden="true" /> Appeler
            </a>
          ) : null}

          <Link
            href="/contact"
            className={cn(BOUTON_DEVIS, BOUTON_DEVIS_MD, "hidden lg:inline-flex")}
          >
            Devis gratuit
          </Link>

          <button
            type="button"
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted",
              "lg:hidden",
            )}
            aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={ouvert}
            aria-controls="menu-site"
            onClick={() => setOuvert((v) => !v)}
          >
            {ouvert ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/*
        * Le panneau est TOUJOURS rendu, et seulement masque quand il est
        * ferme. C'est ce qui garde dans le HTML de chaque page les liens des
        * sections qui ne sont pas dans la barre : sans cela, les pages qui ont
        * quitte la barre le 02.11 perdaient leur lien entrant sur tout le
        * site. Masque, il n'occupe aucune place.
        */}
      <div
        id="menu-site"
        hidden={!ouvert}
        className="border-t border-border bg-card lg:hidden"
      >
        <nav className="container flex flex-col py-3" aria-label="Navigation repliee">
          {tel ? (
            <p className="pb-3 text-sm">
              <a href={tel} className="font-semibold hover:underline">
                {SITE_CONFIG.phone}
              </a>
              {mention ? (
                <>
                  <br />
                  <span className="text-muted-foreground">{mention}</span>
                </>
              ) : null}
            </p>
          ) : null}

          {NAV_TELEPHONE.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOuvert(false)}
              aria-current={marqueExact(item.href) ? "page" : undefined}
              className="border-b border-border/60 py-3 text-base font-medium last:border-0 aria-[current=page]:text-accent"
            >
              {item.libelle}
            </Link>
          ))}

          <CanalWhatsapp variante="plein" libelle="Ecrire sur WhatsApp" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#128C7E] text-base font-semibold text-white" />

          <Link href="/contact" className={cn(BOUTON_DEVIS, BOUTON_DEVIS_LG, "mt-4 w-full")}>
            Demander un devis gratuit
          </Link>
        </nav>
      </div>
    </header>
  );
}
