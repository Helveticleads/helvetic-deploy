#!/usr/bin/env node
/**
 * PREUVE : la case de consentement NEUTRE de la v1.6.3 (Frederic, 04.11 et 09.11).
 *
 *   1. BlocConsentement rend, au mot pres, le texte decide en FR et en DE, le
 *      lien de confidentialite du site portant les derniers mots. L'ancien
 *      texte (ref ancienne) nommait le professionnel et la transmission.
 *   2. La garde des pages refuse dans la case « Fachbetrieb », « weitergegeben »,
 *      « transmis », « professionnel », « partenaire », et une case sans lien
 *      vers la confidentialite ; le texte neutre passe. Contre-epreuve : la
 *      garde de la ref ancienne laissait passer l'ancien texte.
 *
 * Aucun reseau hors npm, aucun site reel : des doublures et des dossiers jetables.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-3.mjs [ref-ancienne]   (defaut : v1.6.2)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.6.2";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-3-")));
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

const LIENS = {
  /* v1.6.5 (11.11) : les liens internes portent le « / » final, comme les sites apres la recopie. */
  fr: '<a href="/politique-de-confidentialite/">politique de confidentialité</a>',
  de: '<a href="/datenschutz/">Datenschutzerklärung</a>',
};

/** Rend BlocConsentement d'une version, avec le lien de confidentialite du site. */
async function rendre(version, langue) {
  const fichier = path.join(version, "socle/batiment/src/components/socle/BlocConsentement.tsx");
  const sortie = await esbuild.build({
    stdin: {
      contents: `import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { BlocConsentement } from ${JSON.stringify(fichier)};
        const lien = createElement("a", { href: ${JSON.stringify(langue === "fr" ? "/politique-de-confidentialite/" : "/datenschutz/")} }, ${JSON.stringify(langue === "fr" ? "politique de confidentialité" : "Datenschutzerklärung")});
        globalThis.__html = renderToStaticMarkup(createElement(BlocConsentement, { consent: false, onConsent() {}, piege: "", onPiege() {}, langue: ${JSON.stringify(langue)}, lienConfidentialite: lien }));`,
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
  });
  const f = path.join(tmp, `rendu-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(f, sortie.outputFiles[0].text);
  delete globalThis.__html;
  require(f);
  return globalThis.__html;
}
const span = (html) => (html.match(/<span id="socle-consent-aide"[^>]*>[\s\S]*?<\/span>/) ?? [""])[0];

/*
 * 1. Le texte decide, au mot pres. On compare le balisage rendu tel quel au
 * balisage attendu (aucun nettoyage du HTML) : la phrase, puis le lien du site
 * qui porte les derniers mots, puis le point.
 */
const ATTENDU = {
  fr: `<span id="socle-consent-aide">J’accepte que mes données soient utilisées pour traiter ma demande. En savoir plus dans la ${LIENS.fr}.</span>`,
  de: `<span id="socle-consent-aide">Ich bin einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage verwendet werden. Mehr dazu in der ${LIENS.de}.</span>`,
};
const rendus = {};
for (const langue of ["fr", "de"]) {
  rendus[langue] = await rendre(actuel, langue);
  constat(span(rendus[langue]) === ATTENDU[langue], `texte ${langue} au mot pres, lien du site compris`);
  constat(/<a href="[^"]+">[^<]+<\/a>\.<\/span>/.test(span(rendus[langue])), `texte ${langue} : le lien porte les derniers mots`);
  const vieux = span(await rendre(ancien, langue));
  constat(vieux !== ATTENDU[langue] && /Fachbetrieb|professionnel/.test(vieux), `contre-epreuve ${refAncienne} ${langue} : l'ancien texte nommait le professionnel`);
}

/* 2. La garde des pages. */
const CONFIG = { fr: 'export const SITE_CONFIG = { name: "Site", slashFinal: true, phone: "", phoneMention: "" };', de: 'export const SITE_CONFIG = { name: "Site", slashFinal: true, phone: "", phoneMention: "", langue: "de" };' };
function garde(verifier, langue, bloc) {
  const d = path.join(tmp, `site-${Math.random().toString(36).slice(2)}`);
  const page = `<html><head><title>Site</title></head><body><header>Kopf</header><main><form>${bloc}<button>OK</button></form></main><footer>Fuss</footer></body></html>`;
  const fichiers = {
    "package.json": JSON.stringify({ name: "@workspace/site-exemple", scripts: { build: "vite build && node ./scripts/prerender-content.mjs && node ./scripts/garde-socle.mjs --pages dist/public" } }),
    "src/data/config.ts": CONFIG[langue],
    "dist/public/index.html": page,
  };
  for (const [f, c] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
    fs.writeFileSync(path.join(d, f), c);
  }
  const r = spawnSync("node", [path.join(verifier, "ops/garde-socle/verifier.mjs"), d, "--pages", "dist/public"], { encoding: "utf8" });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}
const NOMME = "consentement:case de consentement qui nomme la transmission";
const SANS_LIEN = "consentement:case de consentement sans lien vers la politique de confidentialite";
for (const langue of ["fr", "de"]) {
  const r = garde(actuel, langue, rendus[langue]);
  constat(r.code === 0, `garde ${langue} : texte neutre du socle : vert`);
  const vieuxBloc = await rendre(ancien, langue);
  const v = garde(actuel, langue, vieuxBloc);
  constat(v.code === 1 && v.sortie.includes(NOMME), `garde ${langue} : ancien texte du socle (${refAncienne}) : rouge`);
  const c = garde(ancien, langue, vieuxBloc);
  constat(!c.sortie.includes(NOMME), `contre-epreuve ${refAncienne} ${langue} : l'ancienne garde laissait passer l'ancien texte`);
  const sansLien = rendus[langue].replace(LIENS[langue], langue === "fr" ? "politique de confidentialité" : "Datenschutzerklärung");
  const s = garde(actuel, langue, sansLien);
  constat(s.code === 1 && s.sortie.includes(SANS_LIEN), `garde ${langue} : case sans lien de confidentialite : rouge`);
}
const MOTS = [
  ["de", "Fachbetrieb", "Ich bin einverstanden, dass ein Fachbetrieb meine Angaben erhält."],
  ["de", "weitergegeben", "Ich bin einverstanden, dass meine Angaben weitergegeben werden."],
  ["fr", "transmis", "J’accepte que mes données soient transmises."],
  ["fr", "professionnel", "J’accepte d’être rappelé par un professionnel."],
  ["fr", "partenaire", "J’accepte que mes données aillent à un partenaire."],
  ["de", "weitergeleitet", "Ich bin einverstanden, dass meine Anfrage weitergeleitet wird."],
  ["fr", "transmettre", "J’accepte de transmettre mes données."],
  ["fr", "transmet", "J’accepte que le site transmet mes données."],
  ["fr", "transmission", "J’accepte la transmission de mes données."],
  ["fr", "transmise", "J’accepte que ma demande soit transmise."],
];
for (const [langue, mot, phrase] of MOTS) {
  const bloc = `<label><input type="checkbox" required><span id="socle-consent-aide">${phrase} ${LIENS[langue]}.</span></label>`;
  const r = garde(actuel, langue, bloc);
  constat(r.code === 1 && r.sortie.includes(NOMME), `garde ${langue} : « ${mot} » dans la case : rouge`);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.3 tiennent, contre-epreuves comprises.");
