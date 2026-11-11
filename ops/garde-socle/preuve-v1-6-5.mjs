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
 *   5. (Frederic, 11.11) Les liens internes du socle pointent vers l'adresse
 *      canonique, avec « / » final ; la garde des pages refuse un lien interne
 *      sans « / » (adresse qui redirige), FR et DE.
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
import { createRequire } from "node:module";
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

/* 5. Les liens internes avec « / » final (Frederic, 11.11). */
const LIENS = "lien interne vers une adresse qui redirige (sans « / » final)";
const CONFIG_DOMAINE = (langue) => langue === "de"
  ? 'export const SITE_CONFIG = { name: "Site", phone: "", phoneMention: "", langue: "de", domain: "helvetic-exemple.ch" };'
  : `export const SITE_CONFIG = { name: "Site", phone: "${NUM}", phoneMention: "${H}", domain: "helvetique-exemple.ch" };`;
function gardeLiens(verifier, langue, main) {
  const pages = langue === "de" ? siteDe(main) : siteFr(main);
  const d = site(langue, pages);
  fs.writeFileSync(path.join(d, "src/data/config.ts"), CONFIG_DOMAINE(langue));
  const r = spawnSync("node", [verifier, d, "--pages", "dist/public"], { encoding: "utf8" });
  return { vert: r.status === 0 && /GARDE_SOCLE_PAGES_OK/.test(r.stdout), sortie: `${r.stdout}${r.stderr}` };
}
for (const [langue, href, libelle] of [
  ["de", "/staedte", "chemin sans « / »"],
  ["de", "/leistungen/rohrreinigung#ablauf", "chemin sans « / », ancre"],
  ["de", "https://helvetic-exemple.ch/kontakt", "adresse absolue du site, sans « / »"],
  ["fr", "/villes", "chemin sans « / »"],
  ["fr", "/services/depannage?ville=sion", "chemin sans « / », parametres"],
]) {
  const r = gardeLiens(actuelle, langue, `<p><a href="${href}">Lien</a></p>`);
  const i = r.sortie.split("\n").findIndex((l) => l.includes(`liens:${LIENS}`));
  constat(!r.vert && i >= 0, `liens ${langue} : « ${href} » (${libelle}) : rouge`);
  constat(gardeLiens(ancienne, langue, `<p><a href="${href}">Lien</a></p>`).vert, `contre-epreuve ${refAncienne} : liens ${langue} : « ${href} » passait`);
}
for (const [langue, href, libelle] of [
  ["de", "/staedte/", "chemin avec « / »"],
  ["de", "/leistungen/rohrreinigung/#ablauf", "ancre apres le « / »"],
  ["de", "https://helvetic-exemple.ch/kontakt/", "adresse absolue avec « / »"],
  ["de", "/", "racine"],
  ["de", "/sitemap.xml", "fichier .xml"],
  ["de", "/merkblatt.pdf", "fichier .pdf"],
  ["de", "#formular", "ancre seule"],
  ["de", "https://www.admin.ch/gov", "lien externe"],
  ["fr", "/villes/?canton=vs", "parametres apres le « / »"],
  ["fr", "/images/photo.webp", "image"],
  ["fr", "mailto:contact@exemple.ch", "mailto:"],
]) {
  const r = gardeLiens(actuelle, langue, `<p><a href="${href}">Lien</a></p>`);
  constat(r.vert, `liens ${langue} : « ${href} » (${libelle}) : vert${r.vert ? "" : ` (${r.sortie.split("\n").filter((l) => l.includes("- ")).join(" / ").slice(0, 160)})`}`);
}

/* Le rendu du socle : en-tete et barre du bas, FR et DE, tous les liens internes avec « / ». */
execFileSync("npm", ["i", "--prefix", tmp, "--no-audit", "--no-fund", "--silent", "esbuild@0.21.5", "react@18.3.1", "react-dom@18.3.1"], { stdio: ["ignore", "ignore", "inherit"] });
const require = createRequire(path.join(tmp, "x.js"));
const esbuild = require("esbuild");
function extraire(ref) {
  const d = path.join(tmp, `socle-${ref.replace(/\W/g, "_")}`);
  fs.mkdirSync(d, { recursive: true });
  if (ref === "ACTUEL") fs.cpSync(path.join(racine, "socle"), path.join(d, "socle"), { recursive: true });
  else execFileSync("tar", ["-x", "-C", d], { input: execFileSync("git", ["-C", racine, "archive", ref, "socle"]) });
  return d;
}
async function rendre(version, composant, nomExport, config) {
  const src = path.join(version, "socle/batiment/src");
  const DOUBLURES = {
    "@/components/Logo": `export const Logo = () => "Logo";`,
    "@/components/socle/CanalWhatsapp": `export const CanalWhatsapp = () => null;`,
    "@/components/socle/reserve-widget.css": ``,
    "@/routes": `export const NotFound = () => null; export const pagesForRoute = (h) => h === "/inconnu" ? [NotFound] : [() => null];`,
    "@/data/config": `export const SITE_CONFIG = ${JSON.stringify(config)}; export const phoneHref = () => null; export const phoneMention = () => null;`,
    "@/lib/utils": `export const cn = (...c) => c.filter(Boolean).join(" ");`,
    wouter: `import { createElement } from "react"; export const useLocation = () => ["/", () => {}]; export const Link = ({ children, href, ...p }) => createElement("a", { href, ...p }, children);`,
    "lucide-react": `import { createElement } from "react"; const I = (n) => () => createElement("svg", { "data-icone": n }); export const Menu = I("menu"), Phone = I("phone"), X = I("x"), FileText = I("filetext");`,
  };
  const sortie = await esbuild.build({
    stdin: { contents: `import { createElement } from "react"; import { renderToStaticMarkup } from "react-dom/server"; import { ${nomExport} } from ${JSON.stringify(path.join(src, composant))}; globalThis.__html = renderToStaticMarkup(createElement(${nomExport}));`, loader: "tsx", resolveDir: tmp },
    bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic", nodePaths: [path.join(tmp, "node_modules")], logLevel: "silent",
    plugins: [{ name: "doublures", setup(b) {
      b.onResolve({ filter: /^(@\/|wouter$|lucide-react$)/ }, (a) => (a.path === "@/data/navigation" ? { path: path.join(src, "data/navigation.ts") } : a.path in DOUBLURES ? { path: a.path, namespace: "doublure" } : undefined));
      b.onLoad({ filter: /.*/, namespace: "doublure" }, (a) => ({ contents: DOUBLURES[a.path], loader: "tsx", resolveDir: tmp }));
    } }],
  });
  const f = path.join(tmp, `rendu-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(f, sortie.outputFiles[0].text);
  delete globalThis.__html;
  require(f);
  return globalThis.__html;
}
const socleActuel = extraire("ACTUEL");
const socleAncien = extraire(refAncienne);
const internes = (html) => [...html.matchAll(/<a\b[^>]*?\bhref="(\/[^"]*)"/g)].map((m) => m[1]).filter((h) => h !== "/");
for (const langue of ["fr", "de"]) {
  const config = { name: "Site", phone: "", ...(langue === "de" ? { langue: "de", chemins: { services: "/leistungen", villes: "/staedte", contact: "/kontakt" } } : {}) };
  const contact = langue === "de" ? "/kontakt/" : "/contact/";
  for (const [composant, nom] of [["components/layout/Header.tsx", "Header"], ["components/layout/StickyMobileCTA.tsx", "StickyMobileCTA"]]) {
    const liens = internes(await rendre(socleActuel, composant, nom, config));
    constat(liens.length > 0 && liens.every((h) => h.endsWith("/")) && liens.includes(contact), `${nom} ${langue} : ${liens.length} lien(s) interne(s), tous avec « / » (${[...new Set(liens)].join(" ")})`);
    const vieux = internes(await rendre(socleAncien, composant, nom, config));
    constat(vieux.some((h) => !h.endsWith("/")), `contre-epreuve ${refAncienne} : ${nom} ${langue} : liens sans « / » (${[...new Set(vieux)].join(" ")})`);
    const g = gardeLiens(actuelle, langue, await rendre(socleActuel, composant, nom, config));
    constat(!g.sortie.includes(`liens:${LIENS}`), `garde des liens sur le rendu ${nom} ${langue} de la v1.6.5 : aucun defaut`);
  }
}
/*
 * 8. Point 6 (Frederic, 11.11 ; CONTRAT-FORMULAIRE-BATIMENT-04-11.md) : l'envoi
 * du lead, BOUCHONNE (aucun reseau) : champs, succes explicite, lead_submit
 * apres la reponse, message d'erreur dans la langue du site.
 */
async function chargerApi(version) {
  const fichier = path.join(version, "socle/batiment/src/lib/api.ts");
  const sortie = await esbuild.build({
    entryPoints: [fichier], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    define: { "import.meta.env": "{}" },
    plugins: [{ name: "config", setup(b) {
      b.onResolve({ filter: /^@\/data\/config$/ }, () => ({ path: "config", namespace: "doublure" }));
      b.onLoad({ filter: /.*/, namespace: "doublure" }, () => ({ contents: 'export const SITE_CONFIG = { domainBare: "helvetique-exemple.ch" };', loader: "js" }));
    } }],
  });
  const f = path.join(tmp, `api-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(f, sortie.outputFiles[0].text);
  return import(`file://${f}`);
}
const apiActuel = await chargerApi(socleActuel);
const apiAncien = await chargerApi(socleAncien);
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function envoyer(api, { reponse, langue = "fr", consentAt = "2026-11-11T08:00:00.000Z", jette = false, source }) {
  const journal = [];
  globalThis.window = { location: { href: "https://helvetique-exemple.ch/villes/sion/?utm_source=ads&gclid=abc#formulaire" } };
  globalThis.__socleConsentementAt = consentAt;
  globalThis.umami = { track: (nom, donnees) => journal.push(["track", nom, donnees]) };
  globalThis.fetch = async (url, opts) => {
    journal.push(["fetch", url, opts]);
    await new Promise((r) => setTimeout(r, 15));
    if (jette) throw new TypeError("Failed to fetch");
    journal.push(["reponse", reponse.status]);
    return { ok: reponse.status >= 200 && reponse.status < 300, status: reponse.status, json: async () => { if (reponse.corps === undefined) throw new SyntaxError("pas du JSON"); return reponse.corps; } };
  };
  const charge = api.construireCharge({ formType: "contact", nom: "Alex Dupraz", telephone: "0791112233", consent: true, piege: "", langue });
  if (source) charge.source = source;
  let resultat = null, erreur = null;
  try { resultat = await api.submitLead(charge); } catch (e) { erreur = e.message; }
  const envoi = journal.find((j) => j[0] === "fetch");
  const corps = envoi ? JSON.parse(envoi[2].body) : null;
  delete globalThis.window; delete globalThis.__socleConsentementAt; delete globalThis.umami; delete globalThis.fetch;
  return { journal, corps, entetes: envoi?.[2].headers ?? {}, resultat, erreur, tracks: journal.filter((j) => j[0] === "track") };
}
{
  const r = await envoyer(apiActuel, { reponse: { status: 201, corps: { lead_id: 812 } }, source: "contact" });
  constat(UUID4.test(r.corps?.event_id ?? ""), `envoi : event_id UUID v4 (${r.corps?.event_id})`);
  constat(r.entetes["idempotency-key"] === r.corps.event_id, "envoi : en-tete Idempotency-Key = event_id");
  constat(r.corps.origine_demande === "https://helvetique-exemple.ch/villes/sion/", `envoi : origine_demande sans parametres de suivi ni ancre (${r.corps.origine_demande})`);
  constat(r.corps.consentement_at === "2026-11-11T08:00:00.000Z", "envoi : consentement_at = instant de la case cochee");
  constat(r.corps.source === "formulaire" && r.corps.form_type === "contact", "envoi : source « formulaire » (meme si l'appelant ecrit « contact »), form_type garde");
  constat(r.corps.consent === true && r.corps.website === "" && r.corps.name === "Alex Dupraz", "envoi : consent, piege et nom inchanges");
  const iReponse = r.journal.findIndex((j) => j[0] === "reponse");
  const iTrack = r.journal.findIndex((j) => j[0] === "track");
  constat(r.tracks.length === 1 && r.tracks[0][1] === "lead_submit" && iTrack > iReponse && r.tracks[0][2].event_id === r.corps.event_id, "succes 201 : un seul lead_submit, APRES la reponse, avec le meme event_id");
  constat(r.erreur === null && r.resultat.event_id === r.corps.event_id && r.resultat.lead_id === 812, "succes 201 : resolu (le site affiche merci)");
  const r2 = await envoyer(apiActuel, { reponse: { status: 201, corps: { lead_id: 813 } } });
  constat(r2.corps.event_id !== r.corps.event_id, "deux envois : deux event_id differents");
}
{
  const r = await envoyer(apiActuel, { reponse: { status: 200, corps: { ok: true, lead_id: 812, deja_recu: true } } });
  constat(r.erreur === null && r.tracks.length === 0, "doublon 200 deja_recu : resolu, AUCUN lead_submit");
}
for (const [libelle, reponse, langue, attendu] of [
  ["2xx au corps vide {}", { status: 201, corps: {} }, "fr", "Votre demande n'a pas pu être enregistrée."],
  ["2xx sans JSON", { status: 200, corps: undefined }, "fr", "Votre demande n'a pas pu être enregistrée."],
  ["500", { status: 500, corps: { ok: true } }, "fr", "Votre demande n'a pas pu être enregistrée."],
  ["400 telephone_requis, site DE", { status: 400, corps: { error: "telephone_requis" } }, "de", "Ihre Anfrage konnte nicht gespeichert werden."],
  ["429, site DE", { status: 429, corps: undefined }, "de", "Ihre Anfrage konnte nicht gespeichert werden."],
]) {
  const r = await envoyer(apiActuel, { reponse, langue });
  constat(r.erreur?.startsWith(attendu) && /conservées|bleiben erhalten/.test(r.erreur) && r.tracks.length === 0, `echec ${libelle} : erreur claire (« ${r.erreur} »), aucun lead_submit, pas de merci`);
}
for (const langue of ["fr", "de"]) {
  const r = await envoyer(apiActuel, { reponse: { status: 201, corps: { lead_id: 1 } }, langue, jette: true });
  constat(r.erreur?.startsWith(langue === "fr" ? "Connexion impossible" : "Keine Verbindung") && r.tracks.length === 0, `reseau coupe ${langue} : « ${r.erreur} », aucun lead_submit`);
}
{
  const r = await envoyer(apiActuel, { reponse: { status: 201, corps: { lead_id: 1 } }, consentAt: null });
  constat(!Number.isNaN(Date.parse(r.corps.consentement_at)), "case cochee sans instant releve : consentement_at = instant de l'envoi");
  const v = await envoyer(apiAncien, { reponse: { status: 201, corps: { lead_id: 1 } } });
  constat(!v.corps.event_id && !v.corps.origine_demande && !v.corps.consentement_at && v.corps.source !== "formulaire" && v.tracks.length === 0, `contre-epreuve ${refAncienne} : ni event_id, ni origine_demande, ni consentement_at, ni source « formulaire », ni lead_submit`);
  const w = await envoyer(apiAncien, { reponse: { status: 201, corps: {} } });
  constat(w.erreur === null, `contre-epreuve ${refAncienne} : un 2xx au corps vide valait succes (merci)`);
}
const bloc = fs.readFileSync(path.join(socleActuel, "socle/batiment/src/components/socle/BlocConsentement.tsx"), "utf8");
constat(/__socleConsentementAt = e\.target\.checked \? new Date\(\)\.toISOString\(\) : null;\s*onConsent\(e\.target\.checked\)/.test(bloc), "BlocConsentement : l'instant de la case est releve au clic, puis onConsent");
const apiSocle = fs.readFileSync(path.join(socleActuel, "socle/batiment/src/lib/api.ts"), "utf8");
constat(!/site_key|X-Service-Key|service[_-]?key|token|secret/i.test(apiSocle.replace(/\/\*[\s\S]*?\*\//g, "")), "api.ts : aucune cle ni aucun secret dans le code (site_key et cle de service : relais serveur)");
/* La garde du point 6. */
const { mesureEnvoiLead } = await import(`file://${actuelle}`);
constat(mesureEnvoiLead(apiSocle).length === 0, "garde : api.ts du socle : aucun defaut d'envoi");
for (const [libelle, muter, attendu] of [
  ["sans event_id", (s) => s.replace("event_id: eventId,", ""), "n'envoie pas event_id"],
  ["sans origine_demande", (s) => s.replace("origine_demande: origineDemande(),", ""), "n'envoie pas origine_demande"],
  ["sans consentement_at", (s) => s.replace(/consentement_at: payload\.consent[^\n]*\n/, "\n"), "n'envoie pas consentement_at"],
  ["source « hero »", (s) => s.replace('    source: "formulaire",\n    event_id', '    source: "hero",\n    event_id'), "n'envoie pas source « formulaire »"],
  ["lead_submit avant la reponse", (s) => s.replace("  let response: Response;", "  signalerLeadSubmit(eventId);\n  let response: Response;"), "n'envoie pas lead_submit APRES la reponse"],
  ["lead_submit ecrit dans submitLead", (s) => s.replace("  return resultat;", '  (globalThis as any).umami?.track("lead_submit");\n  return resultat;'), "ailleurs que dans signalerLeadSubmit"],
  ["succes sur un simple 2xx", (s) => s.replace("response.ok && estSucces(corps)", "response.ok"), "EXPLICITE"],
]) {
  const m = muter(apiSocle);
  constat(m !== apiSocle && mesureEnvoiLead(m).some((x) => x.includes(attendu)), `garde : api.ts ${libelle} : rouge`);
}
function gardeEffet(verifier, fichiers) {
  const d = fs.mkdtempSync(path.join(tmp, "eff-"));
  const tout = { "package.json": JSON.stringify({ name: "@workspace/helvetic-preuve-de", scripts: { build: "vite build && node ./scripts/prerender-content.mjs && node ./scripts/socle-liens.mjs dist/public && node ./scripts/garde-socle.mjs --pages dist/public" } }), "src/data/config.ts": CONFIG_DOMAINE("de"), "src/lib/api.ts": apiSocle, "scripts/socle-manifeste.json": JSON.stringify({ fichiers: [] }), ...fichiers };
  for (const [k, v] of Object.entries(tout)) { fs.mkdirSync(path.dirname(path.join(d, k)), { recursive: true }); fs.writeFileSync(path.join(d, k), v); }
  const r = spawnSync("node", [verifier, d], { encoding: "utf8" });
  return `${r.stdout}${r.stderr}`.split("\n").filter((l) => l.includes("lead_submit") || l.includes("src/lib/api.ts n"));
}
for (const [libelle, fichiers, rouge] of [
  ["page Danke qui envoie lead_submit a l'affichage", { "src/pages/Danke.tsx": 'useEffect(() => { window.umami?.track?.("lead_submit"); }, []);' }, true],
  ["page merci, dataLayer", { "src/pages/Merci.tsx": 'w.dataLayer.push({ event: "lead_submit" });' }, true],
  ["constante d'evenements", { "src/data/analytics.ts": 'export const EVENTS = { leadSubmit: "lead_submit" };' }, true],
  ["index.html, data-umami-event", { "index.html": '<button data-umami-event="lead_submit">x</button>' }, true],
  ["mention en texte, page de confidentialite", { "src/pages/Datenschutz.tsx": "<li><code>lead_submit</code> : Anfrage gesendet</li>" }, false],
  ["commentaire", { "src/lib/x.ts": "// lead_submit part de submitLead\n/* \"lead_submit\" */ export const a = 1;" }, false],
  ["fichier de test", { "src/lib/x.test.mjs": 'assert(estNouveau("lead_submit"));' }, false],
]) {
  const l = gardeEffet(actuelle, fichiers);
  constat(rouge ? l.some((x) => x.includes("lead_submit envoye hors de submitLead")) : l.length === 0, `garde : ${libelle} : ${rouge ? "rouge" : "vert"}`);
  if (rouge) constat(gardeEffet(ancienne, fichiers).length === 0, `contre-epreuve ${refAncienne} : ${libelle} : passait`);
}

/* 7. La passe centrale des liens, apres le prerendu (Frederic, 11.11). */
const passe = await import(`file://${path.join(racine, "socle/batiment/scripts/socle-liens.mjs")}`);
for (const [domaine, avant, apres, libelle] of [
  ["helvetic-exemple.ch", "/staedte", "/staedte/", "DE chemin"],
  ["helvetic-exemple.ch", "/leistungen/rohrreinigung#ablauf", "/leistungen/rohrreinigung/#ablauf", "DE ancre gardee apres le « / »"],
  ["helvetique-exemple.ch", "/services/depannage?ville=sion&amp;x=1", "/services/depannage/?ville=sion&amp;x=1", "FR parametres gardes"],
  ["helvetique-exemple.ch", "/villes/zürich", "/villes/zürich/", "FR chemin avec accent"],
  ["helvetic-exemple.ch", "https://helvetic-exemple.ch/kontakt", "https://helvetic-exemple.ch/kontakt/", "href absolu du domaine"],
  ["helvetic-exemple.ch", "https://www.helvetic-exemple.ch/kontakt?a=1", "https://www.helvetic-exemple.ch/kontakt/?a=1", "href absolu du domaine, www"],
  ["helvetic-exemple.ch", "/", "/", "racine"],
  ["helvetic-exemple.ch", "https://helvetic-exemple.ch", "https://helvetic-exemple.ch", "racine absolue"],
  ["helvetic-exemple.ch", "/staedte/", "/staedte/", "deja avec « / »"],
  ["helvetic-exemple.ch", "/sitemap.xml", "/sitemap.xml", "fichier .xml"],
  ["helvetic-exemple.ch", "/merkblatt.pdf", "/merkblatt.pdf", "fichier .pdf"],
  ["helvetic-exemple.ch", "/robots.txt", "/robots.txt", "fichier .txt"],
  ["helvetique-exemple.ch", "/images/photo.webp", "/images/photo.webp", "image"],
  ["helvetic-exemple.ch", "#formular", "#formular", "ancre seule"],
  ["helvetic-exemple.ch", "?seite=2", "?seite=2", "parametres seuls"],
  ["helvetic-exemple.ch", "https://www.admin.ch/gov", "https://www.admin.ch/gov", "lien externe"],
  ["helvetic-exemple.ch", "https://helvetic-rohrreinigung.ch/staedte", "https://helvetic-rohrreinigung.ch/staedte", "autre domaine du parc, non touche"],
  ["helvetic-exemple.ch", "https://helvetic-exemple.ch.evil.test/x", "https://helvetic-exemple.ch.evil.test/x", "domaine qui commence pareil, non touche"],
  ["helvetic-exemple.ch", "//cdn.exemple.ch/x", "//cdn.exemple.ch/x", "lien //"],
  ["helvetic-exemple.ch", "mailto:info@exemple.ch", "mailto:info@exemple.ch", "mailto:"],
  ["helvetic-exemple.ch", "tel:+41000000000", "tel:+41000000000", "tel:"],
]) {
  const obtenu = passe.hrefCanonique(avant, domaine);
  constat(obtenu === apres, `passe : ${libelle} : « ${avant} » donne « ${obtenu} »`);
}
const PAGE = '<html><head><link rel="canonical" href="https://helvetic-exemple.ch/staedte/"><link rel="stylesheet" href="/assets/a.css"></head><body><main><p>Siehe /staedte und /kontakt.</p><a class="x" href="/staedte" data-a="1">Städte</a><a href="https://helvetic-rohrreinigung.ch/staedte">Andere</a><a\nhref="/kontakt#f">K</a><area href="/x"></main></body></html>';
const { html: passee, corriges } = passe.passerPage(PAGE, "helvetic-exemple.ch");
const ATTENDUE = PAGE.replace('<a class="x" href="/staedte"', '<a class="x" href="/staedte/"').replace('href="/kontakt#f"', 'href="/kontakt/#f"');
constat(corriges === 2 && passee === ATTENDUE, `passe : seules les valeurs href des <a> internes changent (${corriges} corriges), canonical, feuille de style, texte, autre domaine et <area> intacts, octet pour octet`);
constat(passe.passerPage(passee, "helvetic-exemple.ch").corriges === 0, "passe : deux passages = un seul (idempotente)");
/* La passe sur un dossier construit, puis la garde des pages : verte ; sans la passe : rouge. */
{
  const d = site("de", { "index.html": DE('<p><a href="/staedte">S</a> <a href="https://helvetic-exemple.ch/kontakt?x=1">K</a></p>'), "staedte/index.html": DE('<a href="/leistungen/rohrreinigung">R</a>') });
  fs.writeFileSync(path.join(d, "src/data/config.ts"), CONFIG_DOMAINE("de"));
  const avantPasse = spawnSync("node", [actuelle, d, "--pages", "dist/public"], { encoding: "utf8" });
  constat(avantPasse.status === 1 && `${avantPasse.stdout}${avantPasse.stderr}`.includes(`liens:${LIENS} : 2 page(s)`), "sans la passe : garde des pages rouge (liens:, 2 pages)");
  const r = spawnSync("node", [path.join(racine, "socle/batiment/scripts/socle-liens.mjs"), "dist/public"], { cwd: d, encoding: "utf8" });
  constat(r.status === 0 && /SOCLE_LIENS_OK 3 lien\(s\) interne\(s\) mis a l'adresse canonique sur 2 page\(s\) \(2 page\(s\) lues, domaine helvetic-exemple\.ch\)/.test(r.stdout), `passe sur le dossier construit : ${r.stdout.trim()}`);
  const apresPasse = spawnSync("node", [actuelle, d, "--pages", "dist/public"], { encoding: "utf8" });
  constat(apresPasse.status === 0, "apres la passe : garde des pages verte");
}
/* La garde de la source : le build doit appeler la passe, apres le prerendu, avant la garde des pages. */
function gardeSource(verifier, build) {
  const d = fs.mkdtempSync(path.join(tmp, "src-"));
  fs.mkdirSync(path.join(d, "src/data"), { recursive: true });
  fs.mkdirSync(path.join(d, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "@workspace/helvetic-preuve-de", scripts: { build } }));
  fs.writeFileSync(path.join(d, "src/data/config.ts"), CONFIG_DOMAINE("de"));
  fs.writeFileSync(path.join(d, "scripts/socle-manifeste.json"), JSON.stringify({ fichiers: [] }));
  const r = spawnSync("node", [verifier, d], { encoding: "utf8" });
  return `${r.stdout}${r.stderr}`.split("\n").filter((l) => l.includes("passe des liens"));
}
const PRERENDU = "vite build && node ./scripts/prerender-content.mjs";
const PAGES = "node ./scripts/garde-socle.mjs --pages dist/public";
constat(gardeSource(actuelle, `${PRERENDU} && ${PAGES}`).some((l) => l.includes("ne lance pas la passe des liens")), "garde de la source : build sans la passe : rouge");
constat(gardeSource(actuelle, `node ./scripts/socle-liens.mjs dist/public && ${PRERENDU} && ${PAGES}`).some((l) => l.includes("apres le prerendu et avant la garde des pages")), "garde de la source : passe avant le prerendu : rouge");
constat(gardeSource(actuelle, `${PRERENDU} && ${PAGES} && node ./scripts/socle-liens.mjs dist/public`).some((l) => l.includes("apres le prerendu et avant la garde des pages")), "garde de la source : passe apres la garde des pages : rouge");
constat(gardeSource(actuelle, `${PRERENDU} && node ./scripts/socle-liens.mjs dist/public && ${PAGES}`).length === 0, "garde de la source : passe a sa place : aucun defaut");
constat(gardeSource(ancienne, `${PRERENDU} && ${PAGES}`).length === 0, `contre-epreuve ${refAncienne} : un build sans la passe passait`);
/* Le domaine lu comme sur les 29 sites : `domain: brand.domain` (non litteral), `domainBare: "..."`. */
{
  const d = site("fr", { "index.html": FR('<a href="https://helvetique-exemple.ch/villes">V</a>') });
  fs.writeFileSync(path.join(d, "src/data/config.ts"), `export const SITE_CONFIG = { name: "Site", phone: "${NUM}", phoneMention: "${H}", domain: brand.domain, domainBare: "helvetique-exemple.ch" };`);
  const g = spawnSync("node", [actuelle, d, "--pages", "dist/public"], { encoding: "utf8" });
  constat(`${g.stdout}${g.stderr}`.includes(`liens:${LIENS}`), "domainBare : href absolu du domaine sans « / » : garde rouge");
  const r = spawnSync("node", [path.join(racine, "socle/batiment/scripts/socle-liens.mjs"), "dist/public"], { cwd: d, encoding: "utf8" });
  const html = fs.readFileSync(path.join(d, "dist/public/index.html"), "utf8");
  constat(r.stdout.includes("domaine helvetique-exemple.ch") && html.includes('href="https://helvetique-exemple.ch/villes/"'), "domainBare : la passe corrige le href absolu du domaine");
}
const man = JSON.parse(fs.readFileSync(path.join(racine, "socle/batiment/MANIFESTE.json"), "utf8"));
constat(man.fichiers.some((e) => e.chemin === "scripts/socle-liens.mjs" && !e.optionnel), "manifeste : scripts/socle-liens.mjs, fichier du socle obligatoire");

/* 6. (Frederic, 11.11, par CORRECTIFS BATIMENT) « kostenlose Offerte » dans un bouton ou un libelle du socle : rouge. */
const { devisGratuits } = await import(`file://${actuelle}`);
const { devisGratuits: devisGratuitsAncien } = await import(`file://${ancienne}`);
for (const [texte, rouge, nouveau] of [
  ["<Button>Kostenlose Offerte anfordern</Button>", true, true],
  ['aria-label="Jetzt kostenlose Offerten vergleichen"', true, true],
  ["devis: \"Kostenloser Offerte\"", true, true],
  ["<Check /> Recevoir mon devis gratuit", true, false],
  ["devis: \"Kostenloses Angebot anfragen\"", true, false],
  ["devis: \"Demande gratuite\"", false, false],
  ["devis: \"Kostenlose Anfrage\"", false, false],
  ["devis: \"Offerte anfragen\"", false, false],
]) {
  constat((devisGratuits(texte).length > 0) === rouge, `garde du socle : « ${texte} » : ${rouge ? "rouge" : "vert"}`);
  if (nouveau) constat(devisGratuitsAncien(texte).length === 0, `contre-epreuve ${refAncienne} : « ${texte} » passait`);
}
const fichiersSocle = JSON.parse(fs.readFileSync(path.join(racine, "socle/batiment/MANIFESTE.json"), "utf8")).fichiers;
const restes = fichiersSocle.flatMap((e) => devisGratuits(fs.readFileSync(path.join(racine, "socle/batiment", e.source), "utf8")).map((g) => `${e.source}:${g.ligne}`));
constat(restes.length === 0, `aucun fichier du socle ne promet un devis gratuit ni une offre gratuite${restes.length ? ` (${restes.join(", ")})` : ""}`);

const hero = fs.readFileSync(path.join(socleActuel, "socle/batiment/src/components/HeroForm.tsx"), "utf8");
constat(hero.includes('<Link href="/politique-confidentialite/"') && !/href="\/[^"]*[^/"]"/.test(hero), "HeroForm : lien de confidentialite avec « / », aucun lien interne sans « / »");

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.5 tiennent, contre-epreuves comprises.");
