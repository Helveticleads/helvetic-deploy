/*
 * SOCLE BATIMENT : la case de consentement et le piege anti-robot.
 *
 * Les deux vivent ensemble parce qu'ils partent ensemble dans la charge, et
 * parce qu'un formulaire du batiment ne doit jamais avoir l'un sans l'autre.
 *
 * === LA CASE ===
 *
 * Une VRAIE case, cochee par le visiteur, `required`, dont la valeur part
 * dans `consent` de la charge. Jamais `consent: true` ecrit dans le code :
 * un consentement affirme par le code n'est pas un consentement. La charte
 * editoriale la rend obligatoire sur tous les formulaires.
 *
 * Le texte est NEUTRE (Frederic, 04.11 et 09.11, v1.6.3) : il ne dit pas a qui
 * la demande est transmise ; la transmission a un professionnel s'explique dans
 * la politique de confidentialite du site, dont le lien porte les derniers mots
 * (« politique de confidentialité », « Datenschutzerklärung »).
 *
 * === LE PIEGE ===
 *
 * Un champ `website` que le visiteur ne voit pas et ne peut pas atteindre au
 * clavier (`tabIndex={-1}`, `aria-hidden`, hors flux visuel). Un robot qui
 * remplit tout le remplit aussi. La route d'envoi le teste AVANT toute
 * validation : non vide, elle rend 201 et jette le lead en silence.
 *
 * Il est posé hors écran et non en `display: none` : un champ caché par CSS
 * est ignoré par une partie des robots, et refusé par certains navigateurs à
 * l'autofocus. Il ne porte pas d'étiquette visible, mais il garde un `label`
 * pour les outils qui en exigent un.
 *
 * Verifie par la garde de conformite (ops/garde-socle).
 */
import type { ReactNode } from "react";

export type LangueSocle = "fr" | "de";

type Textes = {
  consentDebut: string;
  consentLien: string;
  consentFin: string;
  piegeLabel: string;
  erreurConsent: string;
};

const TEXTES: Record<LangueSocle, Textes> = {
  fr: {
    consentDebut:
      "J’accepte que mes données soient utilisées pour traiter ma demande. En savoir plus dans la ",
    consentLien: "politique de confidentialité",
    consentFin: ".",
    piegeLabel: "Ne pas remplir",
    erreurConsent:
      "Merci d'accepter le traitement de vos données afin de pouvoir vous répondre.",
  },
  de: {
    consentDebut:
      "Ich bin einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage verwendet werden. Mehr dazu in der ",
    consentLien: "Datenschutzerklärung",
    consentFin: ".",
    piegeLabel: "Nicht ausfüllen",
    erreurConsent:
      "Bitte stimmen Sie der Bearbeitung Ihrer Daten zu, damit wir Ihnen antworten können.",
  },
};

/** Le message d'erreur a afficher quand la case n'est pas cochee. */
export function messageConsentManquant(langue: LangueSocle = "fr"): string {
  return TEXTES[langue].erreurConsent;
}

export function BlocConsentement({
  consent,
  onConsent,
  piege,
  onPiege,
  langue = "fr",
  lienConfidentialite,
  idSuffixe = "",
}: {
  consent: boolean;
  onConsent: (v: boolean) => void;
  piege: string;
  onPiege: (v: string) => void;
  langue?: LangueSocle;
  /** Le lien vers la page de confidentialite du site, rendu par l'appelant. */
  lienConfidentialite: ReactNode;
  /** Suffixe d'identifiant, quand deux formulaires coexistent sur une page. */
  idSuffixe?: string;
}) {
  const t = TEXTES[langue];
  const idAide = `socle-consent-aide${idSuffixe}`;
  const idPiege = `socle-piege${idSuffixe}`;

  return (
    <>
      <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => {
            /* v1.6.5 (Frederic, 11.11) : l'instant ou la case est cochee, lu par submitLead (consentement_at). */
            (globalThis as { __socleConsentementAt?: string | null }).__socleConsentementAt = e.target.checked ? new Date().toISOString() : null;
            onConsent(e.target.checked);
          }}
          aria-describedby={idAide}
          className="mt-0.5 h-[1.15rem] w-[1.15rem] shrink-0 accent-accent"
        />
        <span id={idAide}>
          {t.consentDebut}
          {lienConfidentialite}
          {t.consentFin}
        </span>
      </label>

      {/*
        Piege anti-robot. Hors ecran, hors tabulation, hors arbre
        d'accessibilite. Un visiteur ne le remplit jamais.
      */}
      <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor={idPiege}>{t.piegeLabel}</label>
        <input
          id={idPiege}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={piege}
          onChange={(e) => onPiege(e.target.value)}
        />
      </div>
    </>
  );
}
