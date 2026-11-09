/*
 * SOCLE BATIMENT : la barre collante du bas, sur mobile.
 *
 * Meme regle que l'en-tete : tout tient a `SITE_CONFIG.phone`. Vide, le
 * bouton « Appeler » n'existe pas et « Demande gratuite » prend toute la
 * largeur : AUCUN TROU, aucune moitie vide. Renseigne, les deux boutons se
 * partagent la rangee.
 *
 * Elle est cachee a partir de `lg`, la ou la barre d'en-tete porte deja le
 * numero ou le bouton « Appeler ».
 *
 * Regle du telephone du batiment (Frederic, 05.11.2026) : des que le numero
 * est renseigne, il est ECRIT en clair au-dessus des boutons, avec sa mention
 * (les horaires d'appel, « Lun-ven 10 h - 19 h »). Vide, ou `ligne: false`,
 * rien de telephonique n'est rendu.
 */
import { Link } from "wouter";
import { FileText, Phone } from "lucide-react";
import { CanalWhatsapp } from "@/components/socle/CanalWhatsapp";
import { SITE_CONFIG, phoneMention } from "@/data/config";
import { CHEMIN_CONTACT, TEXTES, telephone } from "@/data/navigation";

export function StickyMobileCTA() {
  const tel = telephone();
  const mention = phoneMention();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
      {tel ? (
        <p className="mb-2 text-center text-xs leading-tight">
          <a href={tel} className="font-semibold hover:underline">
            {SITE_CONFIG.phone}
          </a>
          {mention ? <span className="text-muted-foreground"> · {mention}</span> : null}
        </p>
      ) : null}
      <div className="flex gap-2">
        {tel ? (
          <a
            href={tel}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold"
          >
            <Phone className="h-4 w-4" aria-hidden="true" /> {TEXTES.appeler}
          </a>
        ) : null}
        <CanalWhatsapp
          variante="icone"
          className="inline-flex h-[2.9rem] w-[2.9rem] shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white"
        />
        <Link
          href={CHEMIN_CONTACT}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-accent-foreground"
        >
          <FileText className="h-4 w-4" aria-hidden="true" /> {TEXTES.devis}
        </Link>
      </div>
      <span className="sr-only">{SITE_CONFIG.responseText}</span>
    </div>
  );
}
