/*
 * SOCLE BATIMENT : la barre collante du bas, sur mobile.
 *
 * Meme regle que l'en-tete : tout tient a `SITE_CONFIG.phone`. Vide, le
 * bouton « Appeler » n'existe pas et « Devis gratuit » prend toute la
 * largeur : AUCUN TROU, aucune moitie vide. Renseigne, les deux boutons se
 * partagent la rangee.
 *
 * Elle est cachee a partir de `lg`, la ou la barre d'en-tete porte deja le
 * numero ou le bouton « Appeler ».
 */
import { Link } from "wouter";
import { FileText, Phone } from "lucide-react";
import { CanalWhatsapp } from "@/components/socle/CanalWhatsapp";
import { SITE_CONFIG, phoneHref } from "@/data/config";

export function StickyMobileCTA() {
  const tel = phoneHref();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
      <div className="flex gap-2">
        {tel ? (
          <a
            href={tel}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold"
          >
            <Phone className="h-4 w-4" aria-hidden="true" /> Appeler
          </a>
        ) : null}
        <CanalWhatsapp
          variante="icone"
          className="inline-flex h-[2.9rem] w-[2.9rem] shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white"
        />
        <Link
          href="/contact"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground"
        >
          <FileText className="h-4 w-4" aria-hidden="true" /> Devis gratuit
        </Link>
      </div>
      <span className="sr-only">{SITE_CONFIG.responseText}</span>
    </div>
  );
}
