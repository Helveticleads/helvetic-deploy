/*
 * SOCLE BATIMENT : l'envoi du lead, contrat unique du reseau.
 *
 * Repris de helvetique-terrassement.ch, decision de Frederic du 01.11 : UN
 * SEUL contrat sur les 27 sites.
 *
 * Chemin du lead, et il n'y en a qu'un :
 *   formulaire  ->  POST /api/leads sur l'ORIGINE DU SITE
 *               ->  e-mail vers contact@<domaine>
 *               ->  lecture IMAP par le CRM
 *
 * Le chemin est RELATIF : la requete part sur l'origine du site, servie par
 * l'api-server depose a cote. `VITE_API_BASE_URL` reste surchargeable pour un
 * environnement ou l'API est ailleurs, mais la valeur normale est vide.
 *
 * Le POST direct vers `crm.premiumhelveticleads.ch/api/leads/track` est le
 * chemin ABANDONNE du reseau : il repond bien 201, mais court-circuite l'envoi
 * e-mail et n'enregistre pas le consentement. Ne pas y revenir.
 *
 * Contrat : `normalizeLegacyLeadBody` (@workspace/lead-core), forme dite
 * « jardin », partagee par les sites du reseau.
 *
 * Verifie par la garde de conformite (ops/garde-socle).
 */
import { SITE_CONFIG } from "@/data/config";

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export type LeadPayload = {
  /* Champs de la forme reseau */
  site_language: "fr" | "de";
  source_site: string;
  source_page: string;
  form_type: "hero" | "contact";
  /**
   * Double `form_type`. `resolveFormType` lit `form_type ?? type_formulaire ??
   * form ?? source` : envoyer les deux rend la charge independante de la
   * version d'api-server deployee.
   */
  source: "hero" | "contact";
  /** Nom complet. Le normaliseur exige au moins 2 caracteres. */
  name: string;
  phone: string;
  email?: string;
  city?: string;
  service?: string;
  urgency?: string;
  message?: string;
  step_answers?: Record<string, string>;
  callback_requested?: boolean;
  /**
   * Consentement du visiteur. VALEUR RELEVEE SUR LA CASE, jamais ecrite en
   * dur : un consentement affirme par le code n'est pas un consentement.
   */
  consent: boolean;
  /**
   * Piege anti-robot. La route le teste AVANT toute validation : s'il est non
   * vide, elle repond 201 et jette le lead en silence. Un visiteur ne le voit
   * pas et ne peut pas l'atteindre au clavier, donc il reste vide.
   */
  website: string;
  /*
   * Alias francais, lus nativement par le normaliseur (`raw.nom`,
   * `raw.telephone`). Redondants avec name/phone, mais ils rendent la charge
   * valable quelle que soit la version d'api-server deployee.
   */
  nom?: string;
  telephone?: string;
};

export type LeadResult = { lead_id?: string; ok?: boolean; channels?: string[] };

export async function submitLead(payload: LeadPayload): Promise<LeadResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Connexion impossible, vérifiez votre réseau ou réessayez dans un instant.",
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { error?: string; message?: string };
      detail = data.message || data.error || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Envoi impossible (${response.status}). Merci de réessayer.`);
  }

  try {
    return (await response.json()) as LeadResult;
  } catch {
    return {};
  }
}

/** Construit la charge au format reseau a partir des champs collectes. */
export function construireCharge(opts: {
  formType: "hero" | "contact";
  prenom?: string;
  nom: string;
  telephone: string;
  email?: string;
  message?: string;
  /** Ville ou NPA saisi via l'auto-completion. */
  ville?: string;
  /** Type de projet, ou sujet de la page contact. */
  service?: string;
  /** Echeance annoncee par le visiteur. */
  echeance?: string;
  rappelSouhaite?: boolean;
  /** Valeur de la case de consentement. */
  consent: boolean;
  /** Valeur du champ piege. Vide chez un visiteur. */
  piege?: string;
  stepAnswers?: Record<string, string>;
  langue?: "fr" | "de";
}): LeadPayload {
  const nomComplet = [opts.prenom, opts.nom].filter(Boolean).join(" ").trim();
  return {
    site_language: opts.langue ?? "fr",
    source_site: SITE_CONFIG.domainBare,
    source_page: typeof window !== "undefined" ? window.location.pathname : "/",
    form_type: opts.formType,
    source: opts.formType,
    name: nomComplet,
    phone: opts.telephone,
    email: opts.email,
    city: opts.ville,
    service: opts.service,
    urgency: opts.echeance,
    message: opts.message,
    step_answers: opts.stepAnswers,
    callback_requested: opts.rappelSouhaite,
    consent: opts.consent,
    website: opts.piege ?? "",
    nom: nomComplet,
    telephone: opts.telephone,
  };
}
