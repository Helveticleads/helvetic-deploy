/*
 * SOCLE BATIMENT : le formulaire d'accueil, en etapes.
 *
 * Les ETAPES viennent du site (`@/data/heroFormConfig`) : elles sont propres
 * au metier. Ce qui est commun, et que la garde de conformite verifie : la
 * charge envoyee, la case de consentement, le piege anti-robot, et le fait que
 * le consentement parte de la case et non du code.
 *
 * Le dessin passe par les jetons du site (`bg-card`, `text-accent`,
 * `border-border`, `font-display`) : chaque site garde sa palette et sa
 * typographie.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import { Icon } from "@/components/Icon";
import { BlocConsentement, messageConsentManquant } from "@/components/socle/BlocConsentement";
import { FORM_STEPS } from "@/data/heroFormConfig";
import { construireCharge, submitLead } from "@/lib/api";
import { SITE_CONFIG } from "@/data/config";
import { cn } from "@/lib/utils";

/* socle:libre:debut cles d'etapes propres au metier du site */
type Answers = Partial<Record<"besoin" | "surface" | "profil" | "travaux" | "zone", string>>;

/** Range les reponses d'etapes dans la charge du reseau. */
function chargeDuMetier(answers: Answers) {
  return {
    service: answers.besoin,
    ville: answers.zone,
    echeance: answers.travaux,
    stepAnswers: {
      type_de_surface: answers.surface ?? "",
      profil: answers.profil ?? "",
    },
  };
}
/* socle:libre:fin */

export function HeroForm({
  defaultZone,
  className,
}: {
  defaultZone?: string;
  className?: string;
}) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(defaultZone ? { zone: defaultZone } : {});
  const [contact, setContact] = useState({
    prenom: "",
    nom: "",
    telephone: "",
    email: "",
    message: "",
    rappel: false,
    consent: false,
    piege: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = FORM_STEPS[step];
  const total = FORM_STEPS.length;
  const progress = Math.round(((step + (current.kind === "contact" ? 1 : 0)) / total) * 100);

  /* Pendant la transition, l'ancienne etape reste cliquable : un seul avancement par etape. */
  const enTransition = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { enTransition.current = false; }, 300);
    return () => clearTimeout(t);
  }, [step]);

  function next() {
    if (enTransition.current || step >= total - 1) return;
    enTransition.current = true;
    setStep((s) => Math.min(s + 1, total - 1));
  }
  function back() {
    if (enTransition.current || step <= 0) return;
    enTransition.current = true;
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }
  function choose(key: keyof Answers, value: string) {
    if (enTransition.current) return;
    setAnswers((a) => ({ ...a, [key]: value }));
    next();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    /*
     * Le normaliseur du reseau (`normalizeLegacyLeadBody`) exige un nom d'au
     * moins 2 caracteres : sans lui, la charge repart en 400 depuis /api/leads
     * et le lead est PERDU, le visiteur ne voyant qu'un message generique. Le
     * champ n'est pas `required` dans le gabarit : la garde est donc ici, cote
     * code. Releve sur helvetique-terrassement.ch, d'ou vient le contrat B.
     */
    if (contact.nom.trim().length < 2) {
      setError("Merci d'indiquer votre nom : il est nécessaire pour traiter la demande.");
      return;
    }
    if (!contact.telephone.trim()) {
      setError("Merci d'indiquer un numéro de téléphone pour vous recontacter.");
      return;
    }
    /* socle:libre:debut verifications du site, en plus des communes ci-dessus */
    /* socle:libre:fin */
    if (!contact.consent) {
      setError(messageConsentManquant("fr"));
      return;
    }
    setSubmitting(true);
    const charge = construireCharge({
      formType: "hero",
      prenom: contact.prenom || undefined,
      nom: contact.nom.trim(),
      telephone: contact.telephone.trim(),
      email: contact.email || undefined,
      message: contact.message || undefined,
      rappelSouhaite: contact.rappel,
      consent: contact.consent,
      piege: contact.piege,
      ...chargeDuMetier(answers),
    });
    try {
      await submitLead(charge);
      setLocation("/merci");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue. Merci de réessayer.");
      setSubmitting(false);
    }
  }

  return (
    <div className={cn("bg-card rounded-2xl shadow-xl border border-border p-5 sm:p-6", className)}>
      {/* En-tête + progression */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-foreground">Votre projet en {total} étapes</p>
        <span className="text-xs text-muted-foreground">
          {Math.min(step + 1, total)}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-5">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${Math.max(progress, 8)}%` }}
        />
      </div>

      <div key={step} className="animate-fadein">
        <h2 className="font-display text-xl sm:text-2xl font-semibold mb-1">{current.title}</h2>
        {"subtitle" in current && current.subtitle && (
          <p className="text-sm text-muted-foreground mb-4">{current.subtitle}</p>
        )}

        {current.kind === "choice" && (
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            {current.options.map((opt) => {
              const active = answers[current.key] === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => choose(current.key, opt.value)}
                  className={cn(
                    "flex items-center gap-2.5 text-left rounded-xl border p-3 text-sm font-medium transition-all hover:border-accent hover:bg-muted/60",
                    active ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border",
                  )}
                >
                  {opt.icon && (
                    <span className="shrink-0 grid place-items-center h-8 w-8 rounded-lg bg-secondary/10 text-secondary">
                      <Icon name={opt.icon} className="h-4 w-4" />
                    </span>
                  )}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {current.kind === "zone" && (
          <div className="mt-3">
            {/* socle:libre:debut saisie de la ville : un site peut avoir son propre choix de commune */}
            <input
              type="text"
              autoFocus
              value={answers.zone ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, zone: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && answers.zone && next()}
              placeholder="Ex. Lausanne, Sion, Fribourg…"
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            />
            {/* socle:libre:fin */}
            <button
              type="button"
              onClick={next}
              disabled={!answers.zone}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-50"
            >
              Continuer <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {current.kind === "contact" && (
          <form onSubmit={handleSubmit} className="relative mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Prénom"
                value={contact.prenom}
                onChange={(e) => setContact({ ...contact, prenom: e.target.value })}
                className="rounded-xl border border-input bg-card px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              />
              <input
                type="text"
                placeholder="Nom"
                value={contact.nom}
                onChange={(e) => setContact({ ...contact, nom: e.target.value })}
                className="rounded-xl border border-input bg-card px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
              />
            </div>
            <input
              type="tel"
              required
              placeholder="Votre numéro de téléphone"
              value={contact.telephone}
              onChange={(e) => setContact({ ...contact, telephone: e.target.value })}
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            />
            <input
              type="email"
              placeholder="E-mail (optionnel)"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            />
            <textarea
              placeholder="Décrivez votre projet (optionnel)"
              rows={3}
              value={contact.message}
              onChange={(e) => setContact({ ...contact, message: e.target.value })}
              className="w-full rounded-xl border border-input bg-card px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={contact.rappel}
                onChange={(e) => setContact({ ...contact, rappel: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Je souhaite être rappelé(e)
            </label>

            <BlocConsentement
              consent={contact.consent}
              onConsent={(v) => setContact({ ...contact, consent: v })}
              piege={contact.piege}
              onPiege={(v) => setContact({ ...contact, piege: v })}
              idSuffixe="-hero"
              lienConfidentialite={
                <Link href="/politique-confidentialite/" className="link-underline text-secondary">
                  politique de confidentialité
                </Link>
              }
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground py-3.5 font-bold transition-all hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Envoi…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Envoyer ma demande
                </>
              )}
            </button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              {SITE_CONFIG.responseText}. Vos données ne sont jamais revendues.
            </p>
          </form>
        )}
      </div>

      {step > 0 && (
        <button
          type="button"
          onClick={back}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
      )}
    </div>
  );
}
