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
   * v1.6.5 (Frederic, 11.11 ; CONTRAT-FORMULAIRE-BATIMENT-04-11.md) : toujours
   * « formulaire », pose par submitLead quelle que soit la valeur de l'appelant.
   * Le type du formulaire voyage dans `form_type`.
   */
  source?: "hero" | "contact" | "formulaire";
  /** v1.6.5 : identifiant unique de l'envoi (UUID v4), repris par lead_submit. Pose par submitLead. */
  event_id?: string;
  /** v1.6.5 : URL absolue de la page du formulaire, sans parametres ni ancre. Posee par submitLead. */
  origine_demande?: string;
  /** v1.6.5 : instant ISO 8601 ou la case de consentement a ete cochee. Pose par submitLead. */
  consentement_at?: string;
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

export type LeadResult = { lead_id?: string | number; ok?: boolean; success?: boolean; deja_recu?: boolean; channels?: string[]; event_id: string };

/*
 * v1.6.5 (Frederic, 11.11 ; contrat de reference :
 * _a-transmettre-crm/CONTRAT-FORMULAIRE-BATIMENT-04-11.md). Chaque envoi porte :
 *   - `event_id` : un identifiant unique engendre a l'envoi, aussi en-tete
 *     `Idempotency-Key`, et repris par l'evenement Umami `lead_submit` ;
 *   - `origine_demande` : l'URL de la page, sans parametres (suivi compris) ni ancre ;
 *   - `consentement_at` : l'instant ou la case a ete cochee (BlocConsentement) ;
 *   - `source` : « formulaire ».
 * « merci » ne vient que d'un succes EXPLICITE : reponse 2xx ET corps attendu
 * (`ok`, `success`, `lead_id` ou `deja_recu`). Sinon une erreur claire, dans la
 * langue du site ; la saisie reste dans le formulaire, qui n'est pas vide.
 * `lead_submit` part APRES la reponse, seulement sur un succes, avec le meme
 * `event_id`, et jamais pour un doublon (`deja_recu`). Aucune cle ni aucun
 * secret ici : `site_key` et la cle de service sont l'affaire du relais serveur.
 */
const MESSAGES = {
  fr: {
    reseau: "Connexion impossible : votre demande n'est pas partie. Vos informations sont conservées, merci de réessayer dans un instant.",
    echec: "Votre demande n'a pas pu être enregistrée. Vos informations sont conservées, merci de réessayer dans un instant.",
  },
  de: {
    reseau: "Keine Verbindung: Ihre Anfrage wurde nicht gesendet. Ihre Angaben bleiben erhalten, bitte versuchen Sie es in einem Moment erneut.",
    echec: "Ihre Anfrage konnte nicht gespeichert werden. Ihre Angaben bleiben erhalten, bitte versuchen Sie es in einem Moment erneut.",
  },
};

/** Un identifiant unique (UUID v4) pour cet envoi. */
export function nouvelEventId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const o = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(o);
  else for (let i = 0; i < 16; i += 1) o[i] = Math.floor(Math.random() * 256);
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** L'URL absolue de la page, sans parametres ni ancre (aucun identifiant de campagne). */
export function origineDemande(): string {
  if (typeof window === "undefined") return "";
  try {
    const u = new URL(window.location.href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "";
  }
}

/** Le corps d'un succes explicite. */
function estSucces(corps: unknown): corps is Omit<LeadResult, "event_id"> {
  if (!corps || typeof corps !== "object") return false;
  const c = corps as Record<string, unknown>;
  return c.ok === true || c.success === true || c.deja_recu === true || (c.lead_id !== undefined && c.lead_id !== null && c.lead_id !== "");
}

/** L'evenement Umami de conversion, apres un succes. */
function signalerLeadSubmit(eventId: string): void {
  try {
    const umami = (globalThis as { umami?: { track?: (n: string, d?: Record<string, unknown>) => void } }).umami;
    if (umami && typeof umami.track === "function") umami.track("lead_submit", { event_id: eventId });
  } catch {
    /* le suivi ne doit jamais casser l'envoi */
  }
}

export async function submitLead(payload: LeadPayload): Promise<LeadResult> {
  const langue = payload.site_language === "de" ? "de" : "fr";
  const eventId = nouvelEventId();
  const instant = (globalThis as { __socleConsentementAt?: string | null }).__socleConsentementAt;
  const charge: LeadPayload = {
    ...payload,
    source: "formulaire",
    event_id: eventId,
    origine_demande: origineDemande(),
    /* l'instant de la case ; a defaut (case cochee sans passer par onChange), l'instant de l'envoi */
    consentement_at: payload.consent ? instant || new Date().toISOString() : undefined,
  };
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/leads`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "idempotency-key": eventId },
      body: JSON.stringify(charge),
    });
  } catch {
    throw new Error(MESSAGES[langue].reseau);
  }

  let corps: unknown = null;
  try {
    corps = await response.json();
  } catch {
    corps = null;
  }
  const succes = response.ok && estSucces(corps);
  if (!succes) throw new Error(MESSAGES[langue].echec);

  const resultat = { ...(corps as Omit<LeadResult, "event_id">), event_id: eventId };
  if (resultat.deja_recu !== true) signalerLeadSubmit(eventId);
  return resultat;
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
    source: "formulaire",
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
