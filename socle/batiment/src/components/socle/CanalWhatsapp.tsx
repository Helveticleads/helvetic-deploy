/*
 * SOCLE BATIMENT : l'emplacement WhatsApp.
 *
 * Regle du 27.10, reprise des sites nuisibles (@workspace/canaux) :
 *   - le lien est PUBLIE PAR COMMS et lu a l'execution, jamais construit ici ;
 *   - il n'est JAMAIS ecrit dans le HTML servi : null au rendu serveur et au
 *     premier chargement. Rallumer la ligne cote COMMS suffit, sans nouvelle
 *     mise en ligne du site ;
 *   - JAMAIS le numero en clair : le texte visible ne porte pas de numero ;
 *   - canal eteint : aucun bouton, aucun libelle, AUCUN ESPACE RESERVE.
 *     Le composant rend `null`, il ne rend pas un vide.
 *
 * Aujourd'hui le canal est eteint sur les 27 sites du batiment : ce composant
 * ne rend rien tant que COMMS ne publie pas le lien.
 */
import { useCallback, useSyncExternalStore } from "react";

const EVENEMENT = "canaux:maj";

type EtatCanal = { actif: boolean; href: string | null };

declare global {
  interface Window {
    __canaux_whatsapp?: EtatCanal;
  }
}

function souscrire(rappel: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENEMENT, rappel);
  return () => window.removeEventListener(EVENEMENT, rappel);
}

function instantane(): string | null {
  if (typeof window === "undefined") return null;
  const etat = window.__canaux_whatsapp;
  if (!etat || !etat.actif) return null;
  return etat.href ?? null;
}

/** Lien WhatsApp publie par COMMS. `null` tant qu'il est inconnu. */
export function useWhatsappHref(): string | null {
  return useSyncExternalStore(
    useCallback(souscrire, []),
    instantane,
    () => null,
  );
}

function Glyphe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export type VarianteCanal = "icone" | "plein";

/**
 * Bouton WhatsApp. Rend `null` quand le canal est eteint : pas de bouton,
 * pas de place reservee.
 *
 * @param libelle Texte visible de la variante « plein ». Jamais un numero.
 */
export function CanalWhatsapp({
  variante,
  libelle,
  className,
}: {
  variante: VarianteCanal;
  libelle?: string;
  className?: string;
}) {
  const href = useWhatsappHref();
  if (!href) return null;

  if (variante === "icone") {
    return (
      <a
        href={href}
        rel="noopener"
        aria-label="WhatsApp"
        className={
          className ??
          "inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366] text-white transition-colors hover:bg-[#1ebe57]"
        }
      >
        <Glyphe className="h-5 w-5" />
      </a>
    );
  }

  return (
    <a
      href={href}
      rel="noopener"
      className={
        className ??
        "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#128C7E] text-base font-semibold text-white"
      }
    >
      <Glyphe className="h-5 w-5" />
      {libelle ?? "WhatsApp"}
    </a>
  );
}
