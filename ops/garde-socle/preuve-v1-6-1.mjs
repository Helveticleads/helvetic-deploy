#!/usr/bin/env node
/**
 * PREUVE : la regle du telephone du batiment (Frederic, 05.11.2026), v1.6.1.
 *
 *   1. La barre collante du bas ECRIT le numero et ses horaires d'appel des que
 *      le numero est renseigne ; vide, ou `ligne: false`, rien de telephonique.
 *      L'ancienne barre n'ecrivait que « Appeler ».
 *   2. La garde des pages construites (`--pages`) : sur un site FR, une page
 *      conforme passe, et CHAQUE mutation la rend rouge (numero ou horaires
 *      absents de l'en-tete, de la barre du bas, du contenu de la page
 *      contact ; barre du bas absente). Sur un site DE, une page conforme
 *      passe, et chaque mutation la rend rouge (lien `tel:`, icone de
 *      telephone, « Anrufen », « erreichbar » au sens du telephone) ; une
 *      exception nommee reste permise.
 *   3. La garde de la source : un build qui ne lance pas la garde des pages,
 *      ou qui la lance avant le prerendu, est refuse ; un site DE qui declare
 *      un numero aussi. Un site du parc n'est pas concerne. L'ancienne garde
 *      (v1.6.0) ne voyait aucun des trois.
 *
 * Aucun reseau hors npm, aucun site reel : des doublures et des dossiers jetables.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-1.mjs [ref-ancienne]   (defaut : v1.6.0)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.6.0";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-1-")));
let echecs = 0;
const constat = (ok, texte) => {
  console.log(`${ok ? "OK  " : "ECHEC"} ${texte}`);
  if (!ok) echecs += 1;
};

execFileSync(
  "npm",
  ["i", "--prefix", tmp, "--no-audit", "--no-fund", "--silent", "esbuild@0.21.5", "react@18.3.1", "react-dom@18.3.1"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
const require = createRequire(path.join(tmp, "x.js"));
const esbuild = require("esbuild");

/** Une version du socle, extraite telle quelle dans un dossier jetable. */
function extraire(ref) {
  const d = path.join(tmp, ref.replace(/\W/g, "_"));
  fs.mkdirSync(d, { recursive: true });
  if (ref === "ACTUEL") {
    fs.cpSync(path.join(racine, "socle"), path.join(d, "socle"), { recursive: true });
    fs.cpSync(path.join(racine, "ops"), path.join(d, "ops"), { recursive: true });
  } else {
    const tar = execFileSync("git", ["-C", racine, "archive", ref, "socle", "ops/garde-socle"]);
    execFileSync("tar", ["-x", "-C", d], { input: tar });
  }
  return d;
}
const actuel = extraire("ACTUEL");
const ancien = extraire(refAncienne);

/** Rend la barre du bas, avec les modules propres au site remplaces par des doublures. */
async function rendreBarre(version, config) {
  const src = path.join(version, "socle/batiment/src");
  const DOUBLURES = {
    "@/components/socle/CanalWhatsapp": `export const CanalWhatsapp = () => null;`,
    "@/routes": `export const NotFound = () => null; export const pagesForRoute = () => [() => null];`,
    "@/data/config": `export const SITE_CONFIG = ${JSON.stringify(config)};
      export const phoneHref = () => SITE_CONFIG.phone ? "tel:+41" + SITE_CONFIG.phone.replace(/\\D/g, "").slice(1) : null;
      export const phoneMention = () => SITE_CONFIG.phone ? SITE_CONFIG.phoneMention || null : null;`,
    wouter: `import { createElement } from "react";
      export const Link = ({ children, href, ...p }) => createElement("a", { href, ...p }, children);`,
    "lucide-react": `import { createElement } from "react";
      const I = (n) => (p) => createElement("svg", { "data-icone": n, className: "lucide lucide-" + n });
      export const Phone = I("phone"), FileText = I("filetext");`,
  };
  const sortie = await esbuild.build({
    stdin: {
      contents: `import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { StickyMobileCTA } from ${JSON.stringify(path.join(src, "components/layout/StickyMobileCTA.tsx"))};
        globalThis.__html = renderToStaticMarkup(createElement(StickyMobileCTA));`,
      loader: "tsx",
      resolveDir: tmp,
    },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    nodePaths: [path.join(tmp, "node_modules")],
    logLevel: "silent",
    plugins: [
      {
        name: "doublures",
        setup(b) {
          b.onResolve({ filter: /^(@\/|wouter$|lucide-react$)/ }, (a) => {
            if (a.path === "@/data/navigation") return { path: path.join(src, "data/navigation.ts") };
            if (a.path in DOUBLURES) return { path: a.path, namespace: "doublure" };
            return undefined;
          });
          b.onLoad({ filter: /.*/, namespace: "doublure" }, (a) => ({
            contents: DOUBLURES[a.path],
            loader: "tsx",
            resolveDir: tmp,
          }));
        },
      },
    ],
  });
  const f = path.join(tmp, `rendu-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(f, sortie.outputFiles[0].text);
  delete globalThis.__html;
  require(f);
  return globalThis.__html;
}

const NUMERO = "021 000 00 00";
const HEURES = "Lun-ven 10 h - 19 h";

/* 1. La barre du bas. */
const fr = await rendreBarre(actuel, { name: "Site", phone: NUMERO, phoneMention: HEURES });
constat(fr.includes(`>${NUMERO}</a>`) && fr.includes(HEURES), "barre du bas, FR, numero renseigne : numero ecrit et horaires d'appel");
const de = await rendreBarre(actuel, { name: "Site", phone: "", phoneMention: "", langue: "de" });
constat(!/tel:|lucide-phone|\d{3} \d{2} \d{2}/.test(de), "barre du bas, DE, sans numero : ni lien tel:, ni icone, ni numero");
const coupe = await rendreBarre(actuel, { name: "Site", phone: NUMERO, phoneMention: HEURES, ligne: false });
constat(!/tel:|lucide-phone/.test(coupe) && !coupe.includes(NUMERO) && !coupe.includes(HEURES), "barre du bas, ligne: false : rien de telephonique");
const vieille = await rendreBarre(ancien, { name: "Site", phone: NUMERO, phoneMention: HEURES });
constat(!vieille.includes(`>${NUMERO}</a>`) && !vieille.includes(HEURES), `contre-epreuve ${refAncienne} : la barre du bas n'ecrivait ni le numero ni les horaires`);

/* 2. La garde des pages construites. */
const BUILD_BON = "node ./scripts/garde-socle.mjs && vite build && node ./scripts/prerender-content.mjs && node ./scripts/garde-socle.mjs --pages dist/public";
const PAQUET = (nom, build = BUILD_BON) => JSON.stringify({ name: `@workspace/${nom}`, scripts: { build } });
const CONFIG = (champs) => `export const SITE_CONFIG = { name: "Site", ${champs} };`;

function site(fichiers) {
  const d = path.join(tmp, `site-${Math.random().toString(36).slice(2)}`);
  for (const [f, contenu] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), contenu);
  }
  return d;
}
function gardePages(version, fichiers) {
  const d = site(fichiers);
  const r = spawnSync("node", [path.join(version, "ops/garde-socle/verifier.mjs"), d, "--pages", "dist/public"], { encoding: "utf8" });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}
function gardeSource(version, fichiers) {
  const d = site({ ...fichiers, "scripts/socle-manifeste.json": JSON.stringify({ fichiers: [] }) });
  const r = spawnSync("node", [path.join(version, "ops/garde-socle/verifier.mjs"), d], { encoding: "utf8" });
  return `${r.stdout}${r.stderr}`.split("\n").filter((l) => /regle du batiment|garde des pages/.test(l));
}

const ENTETE_FR = `<header><a href="tel:+41210000000">${NUMERO}</a><span>${HEURES}</span></header>`;
const BARRE_FR = `<div class="fixed inset-x-0 bottom-0 z-40 border-t"><p><a href="tel:+41210000000">${NUMERO}</a><span> · ${HEURES}</span></p><a href="tel:+41210000000">Appeler</a></div><span class="sr-only">x</span>`;
const PAGE = (entete, contenu, barre) => `<html lang="fr"><body>${entete}<main>${contenu}</main><footer>pied</footer>${barre}</body></html>`;
const SITE_FR = (pages) => ({
  "package.json": PAQUET("helvetique-exemple"),
  "src/data/config.ts": CONFIG(`phone: "${NUMERO}", phoneMention: "${HEURES}"`),
  ...Object.fromEntries(Object.entries(pages).map(([p, h]) => [`dist/public/${p}`, h])),
});
const CONTACT_BON = `<p>Telephone : ${NUMERO}, ${HEURES}</p>`;
const FR_BON = { "index.html": PAGE(ENTETE_FR, "Accueil", BARRE_FR), "contact/index.html": PAGE(ENTETE_FR, CONTACT_BON, BARRE_FR) };

let r = gardePages(actuel, SITE_FR(FR_BON));
constat(r.code === 0 && /GARDE_SOCLE_PAGES_OK/.test(r.sortie), "pages FR conformes : vert");
const mutationsFr = [
  ["en-tete sans le numero", { "index.html": PAGE(ENTETE_FR.replace(`>${NUMERO}<`, "><"), "Accueil", BARRE_FR) }],
  ["en-tete sans les horaires d'appel", { "index.html": PAGE(ENTETE_FR.replace(HEURES, ""), "Accueil", BARRE_FR) }],
  ["barre collante du bas absente", { "index.html": PAGE(ENTETE_FR, "Accueil", "") }],
  ["barre collante du bas sans le numero", { "index.html": PAGE(ENTETE_FR, "Accueil", BARRE_FR.replace(`>${NUMERO}<`, "><")) }],
  ["barre collante du bas sans les horaires d'appel", { "index.html": PAGE(ENTETE_FR, "Accueil", BARRE_FR.replace(HEURES, "")) }],
  ["page contact sans le numero dans son contenu", { "contact/index.html": PAGE(ENTETE_FR, `<p>${HEURES}</p>`, BARRE_FR) }],
  ["page contact sans les horaires d'appel dans son contenu", { "contact/index.html": PAGE(ENTETE_FR, `<p>${NUMERO}</p>`, BARRE_FR) }],
];
for (const [defaut, change] of mutationsFr) {
  r = gardePages(actuel, SITE_FR({ ...FR_BON, ...change }));
  constat(r.code === 1 && r.sortie.includes(defaut), `mutation FR « ${defaut} » : rouge`);
}
r = gardePages(actuel, { ...SITE_FR({ "index.html": PAGE("<header>x</header>", "Accueil", "") }), "src/data/config.ts": CONFIG('phone: "", phoneMention: ""') });
constat(r.code === 0, "pages FR, numero vide : rien n'est exige");

const SITE_DE = (contenu) => ({
  "package.json": PAQUET("helvetic-exemple"),
  "src/data/config.ts": CONFIG('phone: "", phoneMention: "", langue: "de"'),
  "dist/public/index.html": `<html lang="de"><body><header>Kopf</header><main>${contenu}</main><footer>Fuss</footer></body></html>`,
});
r = gardePages(actuel, SITE_DE("<p>Einsatz: Mo-Fr 7-18 Uhr. Offerte anfragen.</p>"));
constat(r.code === 0, "pages DE conformes (horaire d'intervention) : vert");
const ANRUF = "« Anruf, anrufen, rufen Sie an » sur un site DE";
const ERREICHBAR_TEL = "« erreichbar » au sens du telephone";
const mutationsDe = [
  ["lien tel:", "lien tel: sur un site DE", '<a href="tel:+41210000000">Ruf</a>'],
  ["icone de telephone", "icone de telephone sur un site DE", '<svg class="lucide lucide-phone h-4 w-4"></svg>'],
  ["anrufen", ANRUF, "<p>Jetzt anrufen</p>"],
  ["Anruf", ANRUF, "<p>Vom ersten Anruf bis zur Lösung.</p>"],
  ["Anrufe", ANRUF, "<p>Anrufe werden beantwortet.</p>"],
  ["Kundenanruf", ANRUF, "<p>Jeder Kundenanruf zählt.</p>"],
  ["rufen Sie uns an", ANRUF, "<p>Rufen Sie uns an.</p>"],
  ["telefonisch erreichbar", ERREICHBAR_TEL, "<p>Wir sind telefonisch erreichbar.</p>"],
  ["Erreichbar Mo-Fr", ERREICHBAR_TEL, "<p>Erreichbar Mo-Fr 8-17 Uhr</p>"],
  /* Decision du 05.11 : ces tournures se reformulent, aucune exception ne les couvre. */
  ["nach Absprache erreichbar", ERREICHBAR_TEL, "<p>Termine nach Absprache erreichbar</p>"],
  ["Erreichbarkeit demandee dans un formulaire", ERREICHBAR_TEL, "<p>Formular mit Adresse, Zugang und Erreichbarkeit.</p>"],
  ["Fachbetrieb gut erreichbar", ERREICHBAR_TEL, "<p>In Bern ist der Fachbetrieb gut erreichbar.</p>"],
  ["Sind Sie fur ... erreichbar?", ERREICHBAR_TEL, "<p>Sind Sie für Gewerbehallen im Talboden erreichbar?</p>"],
];
for (const [libelle, defaut, html] of mutationsDe) {
  r = gardePages(actuel, SITE_DE(html));
  constat(r.code === 1 && r.sortie.includes(defaut), `mutation DE « ${libelle} » : rouge`);
}
/* Le rappel DU CLIENT par l'entreprise reste permis (Frederic, 05.11), consentement du socle compris. */
const RAPPEL_CLIENT = [
  ["Rückruf anfordern", "<p>Rückruf anfordern</p>"],
  ["consentement du socle", "<label><input type=\"checkbox\"> Ich bin damit einverstanden, dass meine Anfrage an einen Fachbetrieb aus meiner Region weitergegeben wird und dieser mich dazu zurückruft. Meine Daten werden gemäss der Datenschutzerklärung bearbeitet.</label>"],
  ["ruft Sie zurück", "<p>Ein Fachbetrieb aus Ihrer Region ruft Sie zurück.</p>"],
];
for (const [libelle, html] of RAPPEL_CLIENT) {
  r = gardePages(actuel, SITE_DE(html));
  constat(r.code === 0, `rappel du client « ${libelle} » : permis`);
}
const CHAMP_CLIENT = '<form><label for="tel">Telefonnummer (für den Anruf zurück)</label><input id="tel" type="tel" name="telefon"></form>';
r = gardePages(actuel, SITE_DE(CHAMP_CLIENT));
constat(r.code === 0, "exception nommee : le champ Telefonnummer du formulaire (le numero DU CLIENT) : permis");
r = gardePages(actuel, SITE_DE(`${CHAMP_CLIENT}<p>Für den Anruf zurück: Formular.</p>`));
constat(r.code === 1 && r.sortie.includes(ANRUF), "le meme Anruf hors du champ Telefonnummer : rouge");
const { EXCEPTIONS_ERREICHBAR } = await import(path.join(actuel, "ops/garde-socle/verifier.mjs"));
for (const x of EXCEPTIONS_ERREICHBAR) {
  r = gardePages(actuel, SITE_DE(`<p>${x.exemple}</p>`));
  constat(r.code === 0, `exception nommee « ${x.exemple} » (${x.sens}) : permise`);
}

/* 3. La garde de la source. */
const DE_NUMERO = { "package.json": PAQUET("helvetic-exemple"), "src/data/config.ts": CONFIG(`phone: "${NUMERO}", langue: "de"`) };
const SANS_PAGES = { "package.json": PAQUET("helvetique-exemple", "vite build && node ./scripts/prerender-content.mjs"), "src/data/config.ts": CONFIG(`phone: "${NUMERO}"`) };
const AVANT_PRERENDU = { "package.json": PAQUET("helvetique-exemple", "node ./scripts/garde-socle.mjs --pages dist/public && node ./scripts/prerender-content.mjs"), "src/data/config.ts": CONFIG(`phone: "${NUMERO}"`) };
constat(gardeSource(actuel, DE_NUMERO).some((l) => /site DE avec un numero/.test(l)), "source : site DE avec un numero : refuse");
constat(gardeSource(actuel, SANS_PAGES).some((l) => /ne lance pas la garde des pages/.test(l)), "source : build sans la garde des pages : refuse");
constat(gardeSource(actuel, AVANT_PRERENDU).some((l) => /avant le prerendu/.test(l)), "source : garde des pages avant le prerendu : refuse");
constat(gardeSource(actuel, { ...SITE_FR({}), "src/data/config.ts": CONFIG(`phone: "${NUMERO}", phoneMention: "${HEURES}"`) }).length === 0, "source : build conforme : accepte");
constat(gardeSource(actuel, { ...SANS_PAGES, "package.json": PAQUET("helvetique-jardin", "vite build") }).length === 0, "source : site du parc : mesure eteinte");
constat(gardeSource(ancien, DE_NUMERO).length === 0 && gardeSource(ancien, SANS_PAGES).length === 0,
  `contre-epreuve ${refAncienne} : l'ancienne garde laissait passer le numero DE et le build sans garde des pages`);

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.1 tiennent, contre-epreuves comprises.");
