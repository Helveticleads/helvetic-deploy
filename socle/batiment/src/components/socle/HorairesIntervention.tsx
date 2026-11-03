/*
 * SOCLE : l'horaire d'INTERVENTION du metier.
 *
 * Regle de Frederic du 03.11.2026 : un horaire d'appel ne s'affiche jamais
 * sans ligne ; un horaire d'intervention est permis, s'il est ETIQUETE comme
 * tel. Ce composant est le seul chemin du socle qui rend un horaire, et il
 * pose toujours l'etiquette (« Intervention » ou « Einsatz ») devant.
 *
 * La valeur est propre au site : `SITE_CONFIG.horairesIntervention`, par
 * exemple « lundi au samedi, 7h30 a 20h ». Vide ou absente, rien n'est rendu,
 * sans trou.
 */
import { SITE_CONFIG } from "@/data/config";
import { TEXTES } from "@/data/navigation";

export function HorairesIntervention({ className }: { className?: string }) {
  const horaires = (SITE_CONFIG as { horairesIntervention?: string }).horairesIntervention;
  if (!horaires) return null;
  return (
    <p className={className}>
      {TEXTES.intervention} : {horaires}
    </p>
  );
}
