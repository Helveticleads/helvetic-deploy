#!/usr/bin/env node
/**
 * PREUVE : les 4 trous de la garde des pages trouves par AUDIT BATIMENT
 * (REVERIF-SOCLE-V1-6-2-09-11.md, tests-audit-garde-1.mjs et -2.mjs), fermes
 * par la v1.6.5 (decision de Frederic du 09.11).
 *
 *   1. DE : un numero suisse ecrit dans le texte, seul ou apres « Telefonnummer: » : rouge.
 *   2. FR : la plage « Lu, Di : 7h, 20h » (tirets devenus virgules) au pied : rouge.
 *   3. FR et DE : les plages du corps des pages (<main>) sont lues ; ouverture ou
 *      joignabilite : rouge ; intervention, durees, chantier, exceptions deja
 *      nommees, exemples des guides : vert.
 *   4. DE : « Rufen Sie die Polizei (117), dann uns. » : rouge ; sans « dann uns » : vert.
 *
 * Chaque cas rouge est rouge pour SA regle (cle du defaut), et la garde de la ref
 * ancienne le laissait passer (contre-epreuve). Aucun reseau, aucun site reel.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-5.mjs [ref-ancienne]   (defaut : v1.6.4)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.6.4";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-5-")));
let echecs = 0;
const constat = (ok, texte) => {
  console.log(`${ok ? "OK  " : "ECHEC"} ${texte}`);
  if (!ok) echecs += 1;
};

const ancienne = path.join(tmp, "ancienne-verifier.mjs");
fs.writeFileSync(ancienne, execFileSync("git", ["-C", racine, "show", `${refAncienne}:ops/garde-socle/verifier.mjs`]));
const actuelle = path.join(racine, "ops/garde-socle/verifier.mjs");

const BUILD = "vite build && node ./scripts/prerender-content.mjs && node ./scripts/garde-socle.mjs --pages dist/public";
const NUM = "021 000 00 00";
const H = "Lun-ven 10 h - 19 h";
function site(langue, pages) {
  const d = fs.mkdtempSync(path.join(tmp, "s-"));
  const fichiers = {
    "package.json": JSON.stringify({ name: `@workspace/helvetic-preuve-${langue}`, scripts: { build: BUILD } }),
    "src/data/config.ts": langue === "de"
      ? 'export const SITE_CONFIG = { name: "Site", phone: "", phoneMention: "", langue: "de" };'
      : `export const SITE_CONFIG = { name: "Site", phone: "${NUM}", phoneMention: "${H}" };`,
    ...Object.fromEntries(Object.entries(pages).map(([p, h]) => [`dist/public/${p}`, h])),
  };
  for (const [f, c] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), c);
  }
  return d;
}
const DE = (main, pied = "Fuss") => `<html lang="de"><head><title>Site</title></head><body><header>Kopf</header><main>${main}</main><footer>${pied}</footer></body></html>`;
const ENTETE = `<header><a href="tel:+41210000000">${NUM}</a><span>${H}</span></header>`;
const BARRE = `<div class="fixed inset-x-0 bottom-0 z-40 border-t"><p><a href="tel:+41210000000">${NUM}</a><span> · ${H}</span></p></div>`;
const FR = (main, pied = "pied") => `<html lang="fr"><head></head><body>${ENTETE}<main>${main}</main><footer>${pied}</footer>${BARRE}</body></html>`;
const CONTACT_FR = FR(`<p>Téléphone : ${NUM}, ${H}</p>`);
const siteFr = (main, pied) => ({ "index.html": FR(main, pied), "contact/index.html": CONTACT_FR });
const siteDe = (main, pied) => ({ "index.html": DE(main, pied) });

function garde(verifier, langue, pages) {
  const r = spawnSync("node", [verifier, site(langue, pages), "--pages", "dist/public"], { encoding: "utf8" });
  return { vert: r.status === 0 && /GARDE_SOCLE_PAGES_OK/.test(r.stdout), sortie: `${r.stdout}${r.stderr}` };
}

const NUMERO = "numero de telephone ecrit sur un site DE";
const TELEFON = "« Telefon, telefonisch »";
const ANRUF = "« Anruf, anrufen, rufen Sie an »";
const PLAGE_PIED = "plage horaire autre que lun-ven 10h-19h (pied)";
const PLAGE_CORPS = "plage horaire autre que lun-ven 10h-19h (corps)";

/* [trou, libelle, langue, pages, cle attendue (null = vert), l'ancienne garde laissait passer] */
const ROUGES = [
  [1, "DE numero seul « 044 555 66 77 »", "de", siteDe("<p>044 555 66 77</p>"), NUMERO, "044 555 66 77"],
  [1, "DE « Telefonnummer: 044 555 66 77 »", "de", siteDe("<p>Telefonnummer: 044 555 66 77</p>"), NUMERO, "Telefonnummer: 044 555 66 77"],
  [1, "DE « +41 44 555 66 77 »", "de", siteDe("<p>Notfall: +41 44 555 66 77</p>"), NUMERO, "+41 44 555 66 77"],
  [1, "DE « 0800 123 456 »", "de", siteDe("<p>Gratisnummer 0800 123 456</p>"), NUMERO, "0800 123 456"],
  [2, "FR pied « Lu, Di : 7h, 20h » (forme reelle de vitrerie)", "fr", siteFr("Accueil", "Lu, Di : 7h, 20h · Urgences sur rendez-vous"), PLAGE_PIED, "Lu, Di : 7h, 20h"],
  [3, "FR corps « ouverts du lundi au samedi de 8h à 18h »", "fr", siteFr("<p>Nous sommes ouverts du lundi au samedi de 8h à 18h.</p>"), PLAGE_CORPS, "8h à 18h"],
  [3, "DE corps « Eine Fachperson ruft Sie zurück (7 Tage, 7 bis 21.30 Uhr) »", "de", siteDe("<p>Eine Fachperson ruft Sie zurück (7 Tage, 7 bis 21.30 Uhr).</p>"), PLAGE_CORPS, "7 bis 21.30 Uhr"],
  [3, "DE corps « Öffnungszeiten: Mo-Sa 8-18 Uhr »", "de", siteDe("<p>Öffnungszeiten: Mo-Sa 8-18 Uhr</p>"), PLAGE_CORPS, "Mo-Sa 8-18 Uhr"],
  [3, "DE corps « Wir sind 7 Tage, 7 bis 21.30 Uhr erreichbar » (seule ou joignabilite)", "de", siteDe("<p>Wir sind 7 Tage, 7 bis 21.30 Uhr für Sie da.</p>"), PLAGE_CORPS, "7 bis 21.30 Uhr"],
  [3, "FR corps intervention ET joignabilite « Intervention et permanence téléphonique de 7h à 20h »", "fr", siteFr("<p>Intervention et permanence téléphonique de 7h à 20h.</p>"), PLAGE_CORPS, "7h à 20h"],
  [4, "DE « Rufen Sie die Polizei (117), dann uns. »", "de", siteDe("<p>Rufen Sie die Polizei (117), dann uns.</p>"), ANRUF, "dann uns"],
];
for (const [trou, libelle, langue, pages, cle, extrait] of ROUGES) {
  const r = garde(actuelle, langue, pages);
  const lignes = r.sortie.split("\n");
  const i = lignes.findIndex((l) => l.includes(cle));
  constat(!r.vert && i >= 0 && lignes.slice(i, i + 3).join(" ").includes(extrait), `trou ${trou} : ${libelle} : rouge (${cle})`);
  const a = garde(ancienne, langue, pages);
  constat(a.vert, `contre-epreuve ${refAncienne} : trou ${trou} : ${libelle} : la garde le laissait passer`);
}

const VERTS = [
  [1, "DE champ « Telefon * » et consentement", "de", siteDe("<p>Vorname * Telefon * E-Mail. Ihre Telefonnummer wird nur für den Rückruf verwendet.</p>")],
  [1, "DE libelle de champ « Telefonnummer »", "de", siteDe("<form><label>Telefonnummer <input></label></form>")],
  [1, "DE numeros courts (Polizei 117, PLZ 8001, Preis CHF 1'250)", "de", siteDe("<p>Polizei 117, Feuerwehr 118. 8001 Zürich. Ab CHF 1'250.</p>")],
  [2, "FR pied « Lun-ven 10h-19h »", "fr", siteFr("Accueil", "Lun-ven 10h-19h")],
  [3, "DE corps « Einsatzzeiten: 7 Tage, 7 bis 21.30 Uhr » (precision de Frederic)", "de", siteDe("<p>Einsatzzeiten: 7 Tage, 7 bis 21.30 Uhr.</p>")],
  [3, "DE corps « Einsätze an 7 Tagen von 7 bis 21.30 Uhr »", "de", siteDe("<p>Einsätze an 7 Tagen von 7 bis 21.30 Uhr.</p>")],
  [3, "DE corps « Termine Mo-Sa 8-18 Uhr »", "de", siteDe("<p>Termine Mo-Sa 8-18 Uhr</p>")],
  [3, "FR corps « Intervention Lun-Ven 7h–20h · Sam 8h–12h »", "fr", siteFr("<p>Intervention Lun-Ven 7h–20h · Sam 8h–12h</p>")],
  [3, "FR corps « Nos interventions ont lieu de 7h à 20h »", "fr", siteFr("<p>Nos interventions ont lieu de 7h à 20h.</p>")],
  [3, "FR corps majoration « Majoration de nuit (22h-7h) »", "fr", siteFr("<p>Majoration de nuit (22h-7h).</p>")],
  [3, "FR corps « Formulaire 24 h/24 »", "fr", siteFr("<p>Formulaire 24 h/24, traitement ouvrable.</p>")],
  [3, "FR corps creneaux « (ex: 9h-11h, 14h-16h) »", "fr", siteFr("<p>Intervention sur créneaux de 2 heures (ex: 9h-11h, 14h-16h).</p>")],
  [3, "DE corps exemple de guide « seit 06.30 Uhr »", "de", siteDe("<p>Die Heizung läuft seit 06.30 Uhr nicht.</p>")],
  [3, "FR corps exemple de guide « mardi, entre 19 h et 21 h »", "fr", siteFr("<p>Le bruit revient le mardi, entre 19 h et 21 h.</p>")],
  [3, "DE corps chantier « Montage vor 7 Uhr oder nach 22 Uhr nur nach Absprache »", "de", siteDe("<p>Montage vor 7 Uhr oder nach 22 Uhr nur nach Absprache.</p>")],
  [3, "DE corps chantier « Bauarbeiten von 7 bis 12 Uhr, Mittagsruhe »", "de", siteDe("<p>Bauarbeiten von 7 bis 12 Uhr, danach Mittagsruhe.</p>")],
  [3, "FR corps durees « Comptez 2 à 4 h » et « sous 24 à 48 h »", "fr", siteFr("<p>Comptez 2 à 4 h de séchage. Réponse sous 24 à 48 h.</p>")],
  [3, "DE corps « Antwort Mo-Fr 10–19 Uhr » (la plage d'appel)", "de", siteDe("<p>Antwort Mo-Fr 10–19 Uhr.</p>")],
  [3, "DE corps « Eine Fachperson aus Ihrer Region ruft Sie zurück (Mo-Fr, 10–19 Uhr) »", "de", siteDe("<p>Eine Fachperson aus Ihrer Region ruft Sie zurück (Mo-Fr, 10–19 Uhr).</p>")],
  [4, "DE « Rufen Sie die Polizei (117). »", "de", siteDe("<p>Rufen Sie die Polizei (117).</p>")],
  [4, "DE « Die Fachperson ruft Sie zurück, dann klären Sie alles. »", "de", siteDe("<p>Die Fachperson ruft Sie zurück, dann klären Sie alles.</p>")],
];
for (const [trou, libelle, langue, pages] of VERTS) {
  const r = garde(actuelle, langue, pages);
  constat(r.vert, `trou ${trou} : ${libelle} : vert${r.vert ? "" : ` (${r.sortie.split("\n").filter((l) => l.includes("- ")).join(" / ").slice(0, 160)})`}`);
}

/* Les cas de l'audit deja corriges en v1.6.2 restent tels quels. */
const TENUS = [
  ["DE « Für Rückfragen erreichen Sie uns telefonisch. »", "de", siteDe("<p>Für Rückfragen erreichen Sie uns telefonisch.</p>"), false],
  ["DE « Rufen Sie uns für eine schnelle, kostenlose Einschätzung an. »", "de", siteDe("<p>Rufen Sie uns für eine schnelle, kostenlose Einschätzung an.</p>"), false],
  ["DE « Fragen? Wir sind über das Formular erreichbar. »", "de", siteDe("<p>Fragen? Wir sind über das Formular erreichbar.</p>"), true],
  ["DE lien tel:", "de", siteDe('<a href="tel:+41445556677">Jetzt Kontakt</a>'), false],
  ["DE pied « Mo-Sa 7–21.30 Uhr »", "de", siteDe("x", "Mo-Sa 7–21.30 Uhr"), false],
  ["DE pied « 7 Tage, 7 bis 21.30 Uhr »", "de", siteDe("x", "7 Tage, 7 bis 21.30 Uhr"), false],
  ["DE kontakt « Erreichbarkeit: 7 Tage, 7 bis 21.30 Uhr »", "de", { "index.html": DE("x"), "kontakt/index.html": DE("<p>Erreichbarkeit: 7 Tage, 7 bis 21.30 Uhr</p>") }, false],
  ["FR contact « Lundi : Vendredi, 8h–18h »", "fr", { "index.html": FR("Accueil"), "contact/index.html": FR(`<p>Téléphone : ${NUM}, ${H}</p><p>Lundi : Vendredi, 8h–18h</p>`) }, false],
  ["FR pied « Lun-sam 8h-18h »", "fr", siteFr("Accueil", "Lun-sam 8h-18h"), false],
  ["FR JSON-LD « Mo-Sa 08:00-18:00 »", "fr", { "index.html": FR("Accueil").replace("<head></head>", '<head><script type="application/ld+json">{"@type":"LocalBusiness","openingHours":"Mo-Sa 08:00-18:00"}</script></head>'), "contact/index.html": CONTACT_FR }, false],
];
for (const [libelle, langue, pages, vert] of TENUS) {
  constat(garde(actuelle, langue, pages).vert === vert, `audit, deja tenu : ${libelle} : ${vert ? "vert" : "rouge"}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.5 tiennent, contre-epreuves comprises.");
