#!/usr/bin/env node
/**
 * PREUVE : les quatre defauts de la garde v1.6.1 (bat-37), corriges en v1.6.2.
 *
 *   a. L'exception « über das Formular erreichbar » se declenche (la limite de
 *      mot ne voyait pas « ü ») ; elle n'est pas elargie.
 *   b. « Telefon », « telefonisch », « am / per Telefon » sont refuses sur un
 *      site DE dans le texte, le titre, les metas (description, og:*) et la
 *      FAQ JSON-LD. « Rückruf », « ruft Sie zurück » et le libelle du champ
 *      « Telefonnummer » restent permis.
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
const CONFIG = (champs) => `export const SITE_CONFIG = { name: "Site", ${champs} };`;
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
  ["b", "Telefon dans le texte", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Fragen beantworten wir am Telefon.</p>" }) }, { "index.html": PAGE_DE({ contenu: "<p>Fragen beantworten wir per Formular.</p>" }) }],
  ["b", "telefonisch dans le texte", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Beratung telefonisch oder vor Ort.</p>" }) }, { "index.html": PAGE_DE({ contenu: "<p>Beratung vor Ort.</p>" }) }],
  ["b", "per Telefon dans le titre", TELEFON, "de", { "index.html": PAGE_DE({ head: "", contenu: "x" }).replace("<title>Helvetic Exemple</title>", "<title>Offerte per Telefon</title>") }, { "index.html": PAGE_DE({ contenu: "x" }) }],
  ["b", "Telefon dans la meta description", TELEFON, "de", { "index.html": PAGE_DE({ head: '<meta name="description" content="Offerte am Telefon anfragen">' }) }, { "index.html": PAGE_DE({ head: '<meta name="description" content="Offerte per Formular anfragen">' }) }],
  ["b", "Telefon dans og:site_name", TELEFON, "de", { "index.html": PAGE_DE({ head: '<meta property="og:site_name" content="Telefon-Service">' }) }, { "index.html": PAGE_DE({ head: '<meta property="og:site_name" content="Helvetic Exemple">' }) }],
  ["b", "telefonisch dans la FAQ JSON-LD", TELEFON, "de", { "index.html": PAGE_DE({ head: FAQ("Telefonisch oder per Formular.") }) }, { "index.html": PAGE_DE({ head: FAQ("Per Formular, wir melden uns.") }) }],
  ["b", "Rückruf, ruft Sie zurück, champ Telefonnummer : permis", null, "de", null, { "index.html": PAGE_DE({ contenu: '<p>Rückruf anfordern. Ein Fachbetrieb ruft Sie zurück.</p><form><label for="t">Telefonnummer für den Rückruf</label><input id="t" type="tel"></form>' }) }],
  ["c", "rufen Sie ... an, 6 mots entre", ANRUF, "de", { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie bei einem Rohrbruch bitte sofort direkt an.</p>" }) }, { "index.html": PAGE_DE({ contenu: "<p>Melden Sie bei einem Rohrbruch bitte sofort das Formular.</p>" }) }],
  ["c", "la fin de phrase arrete (rufen Sie ... . ... an)", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie zurück? Nein. Wir melden uns an Werktagen.</p>" }) }],
  ["c", "la fin de bloc arrete", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie uns zurück</p><p>an Werktagen bis 19 Uhr</p>" }) }],
  ["c", "Rückruf n'est pas pris", null, "de", null, { "index.html": PAGE_DE({ contenu: "<p>Rückruf anfordern, wir rufen Sie an.</p>" }) }],
  ["d", "DE, pied « Mo-Fr 8-17 Uhr »", PLAGE, "de", { "index.html": PAGE_DE({ pied: "Einsatz: Mo-Fr 8-17 Uhr" }) }, { "index.html": PAGE_DE({ pied: "Einsatz: Mo-Fr 10–19 Uhr · Notfall nach Absprache" }) }],
  ["d", "DE, pied « 7 bis 21.30 Uhr »", PLAGE, "de", { "index.html": PAGE_DE({ pied: "Formular (7 Tage, 7 bis 21.30 Uhr)" }) }, { "index.html": PAGE_DE({ pied: "Formular, Mo-Fr 10–19 Uhr" }) }],
  ["d", "DE, contact, une seconde plage « Sa 9-12 Uhr »", PLAGE, "de", { "kontakt/index.html": PAGE_DE({ contenu: "<p>Mo-Fr 10–19 Uhr, Sa 9-12 Uhr</p>" }) }, { "kontakt/index.html": PAGE_DE({ contenu: "<p>Mo-Fr 10–19 Uhr</p>" }) }],
  ["d", "DE, JSON-LD openingHours", PLAGE, "de", { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHours: "Mo-Sa 08:00-18:00" }) }) }, { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHours: "Mo-Fr 10:00-19:00" }) }) }],
  ["d", "DE, JSON-LD openingHoursSpecification", PLAGE, "de",
    { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "10:00", closes: "19:00" }] }) }) },
    { "index.html": PAGE_DE({ head: LD({ "@type": "LocalBusiness", openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "10:00", closes: "19:00" }] }) }) }],
  ["d", "FR, pied « Lu–Di : 7h–20h »", PLAGE, "fr", { "index.html": PAGE_FR({ pied: "Intervention : Lu–Di : 7h–20h" }), "contact/index.html": CONTACT_FR() }, { "index.html": PAGE_FR({ pied: "Intervention : lun-ven 10h-19h" }), "contact/index.html": CONTACT_FR() }],
  /* Q2 a Q4 (Frederic, 09.11), sans contre-epreuve : la ref ancienne n'a pas ces regles. */
  ["Q2", "« Rufen Sie uns an » dans la FAQ JSON-LD", "(FAQ JSON-LD)", "de", { "index.html": PAGE_DE({ head: FAQ("Rufen Sie uns an.") }) }, { "index.html": PAGE_DE({ head: FAQ("Senden Sie uns eine Anfrage.") }) }, { contre: false }],
  ["Q2", "« Anruf » dans la FAQ JSON-LD", "(FAQ JSON-LD)", "de", { "index.html": PAGE_DE({ head: FAQ("Ein Anruf genügt.") }) }, null, { contre: false }],
  ["Q2", "« erreichbar » dans la FAQ JSON-LD", "« erreichbar » au sens du telephone sur un site DE (FAQ JSON-LD)", "de", { "index.html": PAGE_DE({ head: FAQ("Wir sind Mo-Fr erreichbar.") }) }, { "index.html": PAGE_DE({ head: FAQ("Wir sind per Formular erreichbar. Die Glaserei ist über das Formular erreichbar.") }) }, { contre: false }],
  ["Q3", "« Mobiltelefon » dans le texte", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Bitte Mobiltelefon bereithalten.</p>" }) }, { "index.html": PAGE_DE({ contenu: '<form><label for="m">Mobiltelefonnummer</label><input id="m" type="tel" placeholder="Ihre Telefonnummer"><label for="t">Ihre Telefonnummer</label><input id="t"></form>' }) }, { contre: false }],
  ["Q3", "« Festnetztelefon » dans le texte", TELEFON, "de", { "index.html": PAGE_DE({ contenu: "<p>Per Festnetztelefon melden.</p>" }) }, null, { contre: false }],
  ["Q4", "« Rufen Sie uns jederzeit an »", ANRUF, "de", { "index.html": PAGE_DE({ contenu: "<p>Rufen Sie uns jederzeit an.</p>" }) }, { "index.html": PAGE_DE({ contenu: "<p>Die Fachleute rufen Sie an. Wir rufen Sie an. Der Fachbetrieb ruft Sie zurück.</p>" }) }, { contre: false, contreVert: true }],
  ["Q4", "« Bei Fragen: Rufen Sie bitte direkt an »", ANRUF, "de", { "index.html": PAGE_DE({ contenu: "<p>Bei Fragen: Rufen Sie bitte direkt an.</p>" }) }, null, { contre: false }],
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
