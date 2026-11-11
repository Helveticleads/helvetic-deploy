#!/usr/bin/env node
/**
 * PREUVE : les quatre defauts de la garde v1.6.1 (bat-37), corriges en v1.6.2.
 *
 *   a. L'exception « über das Formular erreichbar » se declenche (la limite de
 *      mot ne voyait pas « ü ») ; elle n'est pas elargie.
 *   b. Sur un site DE, le telephone DE L'ENTREPRISE est refuse dans le texte,
 *      le titre, les metas et la FAQ JSON-LD, par tournures rouges nommees
 *      (« telefonisch erreichbar », « per / am Telefon », « unsere
 *      Telefonnummer », « Tel. » et un numero, « Hotline »...). Le numero du
 *      client, « keine Telefonnummer », « Telefonie » passent (09.11).
 *   c. « rufen Sie ... an » est vu dans toute la phrase, plus seulement a trois
 *      mots ; la fin de phrase ou de bloc l'arrete ; « Rückruf » n'est pas pris.
 *   Q2 a Q4 (Frederic, 09.11) : « Anruf » et « erreichbar » lus aussi dans la
 *      FAQ JSON-LD ; composes en -telefon refuses, libelles de champ permis ;
 *      seule l'invitation a appeler est refusee (« Die Fachleute rufen Sie an »
 *      est permis).
 *   d. UNE seule plage horaire, lun-ven 10h-19h, au pied, sur la page contact
 *      et dans le JSON-LD, en FR et en DE ; « nach Absprache » n'en est pas une.
 *
 * Chaque mutation est ROUGE avec la garde actuelle, la version correcte VERTE ;
 * contre-epreuve : la garde de la ref ancienne laissait passer la mutation.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-2.mjs [ref-ancienne]   (defaut : v1.6.1)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.6.1";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-2-")));
let echecs = 0;
const constat = (ok, texte) => {
  console.log(`${ok ? "OK  " : "ECHEC"} ${texte}`);
  if (!ok) echecs += 1;
};

const actuel = path.join(racine, "ops/garde-socle/verifier.mjs");
const ancien = path.join(tmp, "verifier-ancien.mjs");
fs.writeFileSync(ancien, execFileSync("git", ["-C", racine, "show", `${refAncienne}:ops/garde-socle/verifier.mjs`]));

const BUILD = "vite build && node ./scripts/prerender-content.mjs && node ./scripts/garde-socle.mjs --pages dist/public";
const CONFIG = (champs) => `export const SITE_CONFIG = { name: "Site", slashFinal: true, ${champs} };`;
const NUMERO = "021 000 00 00";
const HEURES = "Lun-ven 10 h - 19 h";

function site(langue, pages) {
  const d = path.join(tmp, `site-${Math.random().toString(36).slice(2)}`);
  const fichiers = {
    "package.json": JSON.stringify({ name: `@workspace/helvetic-exemple-${langue}`, scripts: { build: BUILD } }),
    "src/data/config.ts": langue === "de" ? CONFIG('phone: "", phoneMention: "", langue: "de"') : CONFIG(`phone: "${NUMERO}", phoneMention: "${HEURES}"`),
    ...Object.fromEntries(Object.entries(pages).map(([p, h]) => [`dist/public/${p}`, h])),
  };
  for (const [f, contenu] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), contenu);
  }
  return d;
}
function garde(verifier, d) {
  const r = spawnSync("node", [verifier, d, "--pages", "dist/public"], { encoding: "utf8" });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

const LD = (objet) => `<script type="application/ld+json">${JSON.stringify(objet)}</script>`;
const FAQ = (reponse) => LD({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Wie melde ich mich?", acceptedAnswer: { "@type": "Answer", text: reponse } }] });
const PAGE_DE = ({ head = "", contenu = "", pied = "Fuss" } = {}) =>
  `<html lang="de"><head><title>Helvetic Exemple</title>${head}</head><body><header>Kopf</header><main>${contenu}</main><footer>${pied}</footer></body></html>`;
const ENTETE_FR = `<header><a href="tel:+41210000000">${NUMERO}</a><span>${HEURES}</span></header>`;
const BARRE_FR = `<div class="fixed inset-x-0 bottom-0 z-40 border-t"><p><a href="tel:+41210000000">${NUMERO}</a><span> · ${HEURES}</span></p></div><span class="sr-only">x</span>`;
const PAGE_FR = ({ head = "", contenu = "Accueil", pied = "pied" } = {}) =>
  `<html lang="fr"><head>${head}</head><body>${ENTETE_FR}<main>${contenu}</main><footer>${pied}</footer>${BARRE_FR}</body></html>`;
const CONTACT_FR = (extra = "") => PAGE_FR({ contenu: `<p>Téléphone : ${NUMERO}, ${HEURES}</p>${extra}` });

/*
 * [defaut, cle attendue dans la sortie, langue, pages mutees (ROUGES), pages correctes (VERTES)]
 */
const ANRUF = "« Anruf, anrufen, rufen Sie an » sur un site DE";
const TELEFON = "« Telefon, telefonisch » sur un site DE";
const ERREICHBAR = "« erreichbar » au sens du telephone";
const PLAGE = "plage horaire autre que";
const CAS = [
  ["a", "über das Formular erreichbar", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Die Glaserei ist über das Formular erreichbar.</p>" }) }],
  ["a", "über das Formular, sans elargir (telefonisch erreichbar reste rouge)", ERREICHBAR, "de", { "index.html": PAGE_DE({ contenu: "<p>Über das Formular und telefonisch erreichbar.</p>" }) }, null],
  /* b, decision du 09.11 : seul le telephone de l'entreprise est rouge, dans le texte, les metas et la FAQ JSON-LD. */
  ["b", "Wir sind telefonisch erreichbar.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Wir sind telefonisch erreichbar.</p>" }) }, null],
  ["b", "Wir beraten Sie telefonisch.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Wir beraten Sie telefonisch.</p>" }) }, null],
  ["b", "Sie können uns telefonisch kontaktieren.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Sie können uns telefonisch kontaktieren.</p>" }) }, null],
  ["b", "Kostenlose telefonische Beratung.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Kostenlose telefonische Beratung.</p>" }) }, null],
  ["b", "Ihre telefonische Anfrage wird bearbeitet.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Ihre telefonische Anfrage wird bearbeitet.</p>" }) }, null],
  ["b", "Offerte per Telefon anfragen.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Offerte per Telefon anfragen.</p>" }) }, null],
  ["b", "Wir beraten Sie gerne am Telefon.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Wir beraten Sie gerne am Telefon.</p>" }) }, null],
  ["b", "Unsere Telefonnummer finden Sie unten.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Unsere Telefonnummer finden Sie unten.</p>" }) }, null],
  ["b", "Unser Telefon ist werktags besetzt.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Unser Telefon ist werktags besetzt.</p>" }) }, null],
  ["b", "Telefon: 044 123 45 67", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Telefon: 044 123 45 67</p>" }) }, null],
  ["b", "Tel. 044 123 45 67", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Tel. 044 123 45 67</p>" }) }, null],
  ["b", "Hotline Mo-Fr", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Hotline Mo-Fr</p>" }) }, null],
  ["b", "Kostenlose Telefonberatung.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Kostenlose Telefonberatung.</p>" }) }, null],
  ["b", "Servicetelefon für Notfälle.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Servicetelefon für Notfälle.</p>" }) }, null],
  ["b", "Melden Sie sich per Mobiltelefon.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Melden Sie sich per Mobiltelefon.</p>" }) }, null],
  ["b", "Unser Mobiltelefon ist immer an.", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Unser Mobiltelefon ist immer an.</p>" }) }, null],
  ["b", "« per Telefon » dans le titre", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "x" }).replace("<title>Helvetic Exemple</title>", "<title>Offerte per Telefon</title>") }, { "index.html": PAGE_DE({ contenu: "x" }) }],
  ["b", "« am Telefon » dans la meta description", TELEFON, "de", { "index.html": PAGE_DE({ head: '<meta name="description" content="Offerte am Telefon anfragen">' }) }, { "index.html": PAGE_DE({ head: '<meta name="description" content="Offerte per Formular anfragen">' }) }],
  ["b", "« Hotline 24/7 » dans og:description", TELEFON, "de", { "index.html": PAGE_DE({ head: '<meta property="og:description" content="Hotline 24/7 für Notfälle">' }) }, { "index.html": PAGE_DE({ head: '<meta property="og:site_name" content="Helvetic Exemple">' }) }],
  ["b", "« telefonisch erreichbar » dans la FAQ JSON-LD", TELEFON, "de", { "index.html": PAGE_DE({ head: FAQ("Wir sind telefonisch erreichbar.") }) }, { "index.html": PAGE_DE({ head: FAQ("Per Formular, wir melden uns.") }) }],
  ["b", "vert (dachdecker, daemmung) : Vollständiger Name * Telefon * E-Mail", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Vollständiger Name * Telefon * E-Mail</p>", head: FAQ("Vollständiger Name * Telefon * E-Mail") }) }],
  ["b", "vert (Datenschutz, 10 sites DE) : Erhobene Daten: Vor- und Nachname, Telefonnummer, optional E-Mail-Adresse.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Erhobene Daten: Vor- und Nachname, Telefonnummer, optional E-Mail-Adresse.</p>", head: FAQ("Erhobene Daten: Vor- und Nachname, Telefonnummer, optional E-Mail-Adresse.") }) }],
  ["b", "vert (Impressum) : Es wird keine öffentliche Telefonnummer angegeben.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Es wird keine öffentliche Telefonnummer angegeben.</p>", head: FAQ("Es wird keine öffentliche Telefonnummer angegeben.") }) }],
  ["b", "vert (elektriker, heizung FAQ) : Keine direkte Telefonnummer, das Formular priorisiert.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Keine direkte Telefonnummer, das Formular priorisiert.</p>", head: FAQ("Keine direkte Telefonnummer, das Formular priorisiert.") }) }],
  ["b", "vert (malerei) : Hinterlassen Sie Ihre Telefonnummer für einen Rückruf.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Hinterlassen Sie Ihre Telefonnummer für einen Rückruf.</p>", head: FAQ("Hinterlassen Sie Ihre Telefonnummer für einen Rückruf.") }) }],
  ["b", "vert (sanitaer) : Geben Sie Ihre Telefonnummer im Formular an.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Geben Sie Ihre Telefonnummer im Formular an.</p>", head: FAQ("Geben Sie Ihre Telefonnummer im Formular an.") }) }],
  ["b", "vert (glaserei) : Name und Telefonnummer der Person, die Auskunft gibt.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Name und Telefonnummer der Person, die Auskunft gibt.</p>", head: FAQ("Name und Telefonnummer der Person, die Auskunft gibt.") }) }],
  ["b", "vert (elektriker) : Arbeiten Bildschirm, Telefonie, konzentrierte Tätigkeit.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Arbeiten Bildschirm, Telefonie, konzentrierte Tätigkeit.</p>", head: FAQ("Arbeiten Bildschirm, Telefonie, konzentrierte Tätigkeit.") }) }],
  ["b", "vert (schluesseldienst) : Prüfen Sie, ob Schlüssel und Telefon wieder greifbar sind.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Prüfen Sie, ob Schlüssel und Telefon wieder greifbar sind.</p>", head: FAQ("Prüfen Sie, ob Schlüssel und Telefon wieder greifbar sind.") }) }],
  ["b", "vert (glaserei, rohrreinigung) : Vorname Nachname Telefon E-Mail (optional)", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Vorname Nachname Telefon E-Mail (optional)</p>", head: FAQ("Vorname Nachname Telefon E-Mail (optional)") }) }],
  ["b", "vert (kaminfeger) : Notieren Sie eine Telefonnummer für Rückfragen.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Notieren Sie eine Telefonnummer für Rückfragen.</p>", head: FAQ("Notieren Sie eine Telefonnummer für Rückfragen.") }) }],
  ["b", "vert (Q3) : Bitte Mobiltelefon bereithalten.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Bitte Mobiltelefon bereithalten.</p>", head: FAQ("Bitte Mobiltelefon bereithalten.") }) }],
  ["b", "Rückruf, ruft Sie zurück, champ Telefonnummer : permis", null, "de", null, { "index.html": PAGE_DE({ contenu: '<p>Rückruf anfordern. Ein Fachbetrieb ruft Sie zurück.</p><form><label for="t">Telefonnummer für den Rückruf</label><input id="t" type="tel"></form>' }) }],
  ["c", "rufen Sie ... an, 6 mots entre", ANRUF, "de", { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie bei einem Rohrbruch bitte sofort direkt an.</p>" }) }, { "index.html": PAGE_DE({ contenu: "<p>Melden Sie bei einem Rohrbruch bitte sofort das Formular.</p>" }) }],
  ["c", "la fin de phrase arrete (rufen Sie ... . ... an)", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie zurück? Nein. Wir melden uns an Werktagen.</p>" }) }],
  ["c", "la fin de bloc arrete", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie uns zurück</p><p>an Werktagen bis 19 Uhr</p>" }) }],
  ["c", "Rückruf n'est pas pris", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Rückruf anfordern, wir rufen Sie an.</p>" }) }],
  ["d", "DE, pied « Bürozeiten: Mo-Fr 8-17 Uhr »", PLAGE, "de", { "index.html": PAGE_DE({ pied: "Bürozeiten: Mo-Fr 8-17 Uhr" }) }, { "index.html": PAGE_DE({ pied: "Einsatz: Mo-Fr 10–19 Uhr · Notfall nach Absprache" }) }],
  ["d", "DE, pied « 7 bis 21.30 Uhr »", PLAGE, "de", { "index.html": PAGE_DE({ pied: "Formular (7 Tage, 7 bis 21.30 Uhr)" }) }, { "index.html": PAGE_DE({ pied: "Formular, Mo-Fr 10–19 Uhr" }) }],
  ["d", "DE, contact, une seconde plage « Sa 9-12 Uhr »", PLAGE, "de", { "kontakt/index.html": PAGE_DE({ contenu: "<p>Mo-Fr 10–19 Uhr, Sa 9-12 Uhr</p>" }) }, { "kontakt/index.html": PAGE_DE({ contenu: "<p>Mo-Fr 10–19 Uhr</p>" }) }],
  ["d", "DE, JSON-LD openingHours", PLAGE, "de", { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHours: "Mo-Sa 08:00-18:00" }) }) }, { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHours: "Mo-Fr 10:00-19:00" }) }) }],
  ["d", "DE, JSON-LD openingHoursSpecification", PLAGE, "de",
    { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "10:00", closes: "19:00" }] }) }) },
    { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "10:00", closes: "19:00" }] }) }) }],
  ["d", "FR, pied « Horaires : Lu–Di : 7h–20h »", PLAGE, "fr", { "index.html": PAGE_FR({ pied: "Horaires : Lu–Di : 7h–20h" }), "contact/index.html": CONTACT_FR() }, { "index.html": PAGE_FR({ pied: "Intervention : lun-ven 10h-19h" }), "contact/index.html": CONTACT_FR() }],
  /* Q2 a Q4 (Frederic, 09.11), sans contre-epreuve : la ref ancienne n'a pas ces regles. */
  ["Q2", "« Rufen Sie uns an » dans la FAQ JSON-LD", "(FAQ JSON-LD)", "de", { "index.html": PAGE_DE({ head: FAQ("Rufen Sie uns an.") }) }, { "index.html": PAGE_DE({ head: FAQ("Senden Sie uns eine Anfrage.") }) }, { contre: false }],
  ["Q2", "« Anruf » dans la FAQ JSON-LD", "(FAQ JSON-LD)", "de", { "index.html": PAGE_DE({ head: FAQ("Ein Anruf genügt.") }) }, null, { contre: false }],
  ["Q2", "« erreichbar » dans la FAQ JSON-LD", "« erreichbar » au sens du telephone sur un site DE (FAQ JSON-LD)", "de", { "index.html": PAGE_DE({ head: FAQ("Wir sind Mo-Fr erreichbar.") }) }, { "index.html": PAGE_DE({ head: FAQ("Wir sind per Formular erreichbar. Die Glaserei ist über das Formular erreichbar.") }) }, { contre: false }],
  ["Q4", "« Rufen Sie uns jederzeit an »", ANRUF, "de", { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie uns jederzeit an.</p>" }) }, { "index.html": PAGE_DE({ contenu: "<p>Die Fachleute rufen Sie an. Wir rufen Sie an. Der Fachbetrieb ruft Sie zurück.</p>" }) }, { contre: false, contreVert: true }],
  ["Q4", "« Bei Fragen: Rufen Sie bitte direkt an »", ANRUF, "de", { "index.html": PAGE_DE({ contenu: "<p>Bei Fragen: Rufen Sie bitte direkt an.</p>" }) }, null, { contre: false }],
  /* Hotline (Frederic, 09.11) : seulement celle de l'entreprise. */
  ["Hotline", "rouge : Unsere Hotline hilft weiter.", "sur un site DE", "de", { "index.html": PAGE_DE({ contenu: "<p>Unsere Hotline hilft weiter.</p>" }) }, null, { contre: false }],
  ["Hotline", "rouge : Hotline: 044 123 45 67", "sur un site DE", "de", { "index.html": PAGE_DE({ contenu: "<p>Hotline: 044 123 45 67</p>" }) }, null, { contre: false }],
  ["Hotline", "rouge : Kostenlose Telefonberatung für Hausbesitzer.", "sur un site DE", "de", { "index.html": PAGE_DE({ contenu: "<p>Kostenlose Telefonberatung für Hausbesitzer.</p>" }) }, null, { contre: false }],
  ["Hotline", "rouge : Rufen Sie unsere Hotline an.", "sur un site DE", "de", { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie unsere Hotline an.</p>" }) }, null, { contre: false }],
  ["Hotline", "vert : Kessel-Diagnose ohne Teilewechsel: Ursache zuerst und Hersteller-Hotline-Abstimmung Sicherheit.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Kessel-Diagnose ohne Teilewechsel: Ursache zuerst und Hersteller-Hotline-Abstimmung Sicherheit.</p>", head: FAQ("Kessel-Diagnose ohne Teilewechsel: Ursache zuerst und Hersteller-Hotline-Abstimmung Sicherheit.") }) }],
  ["Hotline", "vert : Termin mitgeteilt, transparent inklusive Verwaltungs-Hotline, Einsatz in der Deutschschweiz.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Termin mitgeteilt, transparent inklusive Verwaltungs-Hotline, Einsatz in der Deutschschweiz.</p>", head: FAQ("Termin mitgeteilt, transparent inklusive Verwaltungs-Hotline, Einsatz in der Deutschschweiz.") }) }],
  ["Hotline", "vert : Lokale Beratung, kein Callcenter-Pingpong zwischen Hotlines.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Lokale Beratung, kein Callcenter-Pingpong zwischen Hotlines.</p>", head: FAQ("Lokale Beratung, kein Callcenter-Pingpong zwischen Hotlines.") }) }],
  ["Hotline", "vert : Keine Anfrage zwischen Hotlines für Gas, WP oder FBH.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Keine Anfrage zwischen Hotlines für Gas, WP oder FBH.</p>", head: FAQ("Keine Anfrage zwischen Hotlines für Gas, WP oder FBH.") }) }],
  ["Hotline", "vert : Wir klären das mit der Hotline des Herstellers.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Wir klären das mit der Hotline des Herstellers.</p>", head: FAQ("Wir klären das mit der Hotline des Herstellers.") }) }],
  ["Hotline", "vert : Es gibt keine Telefonberatung, nur das Formular.", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Es gibt keine Telefonberatung, nur das Formular.</p>", head: FAQ("Es gibt keine Telefonberatung, nur das Formular.") }) }],
  /* d ajuste (Frederic, 09.11) : les plages d'intervention, de majoration, de tarif, le formulaire 24 h/24, les creneaux ne sont pas des horaires d'appel. */
  ["d", "vert (pied, terrassement) : Intervention Lun-Ven 7h–20h · Sam 8h–12h", null, "fr", null, { "index.html": PAGE_FR({ pied: "Intervention Lun-Ven 7h–20h · Sam 8h–12h" }), "contact/index.html": CONTACT_FR("<p>Intervention Lun-Ven 7h–20h · Sam 8h–12h</p>") }],
  ["d", "vert (pied, plomberie) : Les interventions de nuit (22h-7h) et les week-ends comportent une majoration.", null, "fr", null, { "index.html": PAGE_FR({ pied: "Les interventions de nuit (22h-7h) et les week-ends comportent une majoration." }), "contact/index.html": CONTACT_FR("<p>Les interventions de nuit (22h-7h) et les week-ends comportent une majoration.</p>") }],
  ["d", "vert (pied, plomberie) : Intervention sur créneaux de 2 heures (ex: 9h-11h, 14h-16h).", null, "fr", null, { "index.html": PAGE_FR({ pied: "Intervention sur créneaux de 2 heures (ex: 9h-11h, 14h-16h)." }), "contact/index.html": CONTACT_FR("<p>Intervention sur créneaux de 2 heures (ex: 9h-11h, 14h-16h).</p>") }],
  ["d", "vert (pied, serrurerie) : Formulaire 24 h/24, traitement ouvrable.", null, "fr", null, { "index.html": PAGE_FR({ pied: "Formulaire 24 h/24, traitement ouvrable." }), "contact/index.html": CONTACT_FR("<p>Formulaire 24 h/24, traitement ouvrable.</p>") }],
  ["d", "vert (pied, assainissement) : Majoration soir et week-end : 18h-22h, tarif affiché.", null, "fr", null, { "index.html": PAGE_FR({ pied: "Majoration soir et week-end : 18h-22h, tarif affiché." }), "contact/index.html": CONTACT_FR("<p>Majoration soir et week-end : 18h-22h, tarif affiché.</p>") }],
  ["d", "vert (pied, schluesseldienst) : Tagstarife gelten von 7 bis 22 Uhr; für Nacht- und Feiertagseinsätze kann ein Zuschlag anfallen.", null, "de", null, { "index.html": PAGE_DE({ pied: "Tagstarife gelten von 7 bis 22 Uhr; für Nacht- und Feiertagseinsätze kann ein Zuschlag anfallen." }) }],
  ["d", "vert (pied, rohrreinigung) : Zuschläge für Abend und Wochenende (18–22 Uhr) erscheinen als eigene Positionen.", null, "de", null, { "index.html": PAGE_DE({ pied: "Zuschläge für Abend und Wochenende (18–22 Uhr) erscheinen als eigene Positionen." }) }],
  ["d", "vert (pied, DE) : Einsatzzeiten: Mo-Sa 7-20 Uhr · Anfragen Mo-Fr 10–19 Uhr", null, "de", null, { "index.html": PAGE_DE({ pied: "Einsatzzeiten: Mo-Sa 7-20 Uhr · Anfragen Mo-Fr 10–19 Uhr" }) }],
  ["d", "rouge : « Lun-Ven 7h–20h » sans libellé Intervention au pied", PLAGE, "fr", { "index.html": PAGE_FR({ pied: "Lun-Ven 7h–20h · Sam 8h–12h" }), "contact/index.html": CONTACT_FR() }, null, { contre: false }],
  ["d", "rouge : plage d'appel fausse à côté d'une plage d'intervention (FR)", PLAGE, "fr", { "index.html": PAGE_FR({ pied: "Intervention Lun-Ven 7h–20h · Appels : Lun-Ven 8h–18h" }), "contact/index.html": CONTACT_FR() }, null, { contre: false }],
  ["d", "rouge : plage d'appel fausse à côté d'une plage d'intervention (DE)", PLAGE, "de", { "index.html": PAGE_DE({ pied: "Einsatz Mo-Sa 7-20 Uhr. Erreichbar Mo-Fr 8-17 Uhr" }) }, null, { contre: false }],
  ["d", "FR, contact, une seconde plage « samedi 8h-12h »", PLAGE, "fr", { "index.html": PAGE_FR(), "contact/index.html": CONTACT_FR("<p>Samedi 8h-12h</p>") }, { "index.html": PAGE_FR(), "contact/index.html": CONTACT_FR() }],
];

for (const [defaut, libelle, cle, langue, rouge, vert, { contre = true, contreVert = false } = {}] of CAS) {
  if (rouge) {
    const d = site(langue, rouge);
    const r = garde(actuel, d);
    constat(r.code === 1 && r.sortie.includes(cle), `${defaut}) mutation « ${libelle} » : rouge`);
    if (contre) {
      const v = garde(ancien, d);
      constat(!v.sortie.includes(cle) || (defaut === "a" && v.code === 1), `${defaut}) contre-epreuve ${refAncienne} : « ${libelle} » ${defaut === "a" ? "deja rouge" : "passait"}`);
    }
  }
  if (vert) {
    const d = site(langue, vert);
    const r = garde(actuel, d);
    constat(r.code === 0, `${defaut}) version correcte « ${libelle} » : verte`);
    if (defaut === "a" || contreVert) {
      const v = garde(ancien, d);
      constat(v.code === 1, `${defaut}) contre-epreuve ${refAncienne} : « ${libelle} » etait rouge`);
    }
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.2 tiennent, contre-epreuves comprises.");
