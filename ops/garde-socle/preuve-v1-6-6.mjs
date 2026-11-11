#!/usr/bin/env node
/**
 * PREUVE : v1.6.6 (Frederic, 11.11).
 *
 *   1. La forme des adresses est un REGLAGE ECRIT du site, `slashFinal` de
 *      `SITE_CONFIG` (src/data/config.ts). `lienCanonique()` et la passe
 *      `scripts/socle-liens.mjs` le lisent : true ajoute le « / » final, false
 *      l'ote ; rien n'est decide a la place du site. Reglage absent : la passe
 *      s'arrete, la garde de la source et celle des pages sont rouges, en
 *      disant quoi ecrire.
 *   2. Garde des pages : chaque lien interne, la balise canonical et chaque
 *      <loc> du sitemap ont la forme du reglage ; les fichiers restent hors
 *      regle. Contre-epreuve : la v1.6.5 imposait le « / » a tous, et rendait
 *      rouge un site sans « / » coherent (regression des 9 sites).
 *   3. Trou de la garde des numeros : « 044 555 66 77. » et « 044 555 66 77, »
 *      sont reconnus ; « 044 555 66 77.5 » ne l'est pas.
 *
 * Aucun reseau hors npm, aucun site reel : des doublures et des dossiers jetables.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-6.mjs [ref-ancienne]   (defaut : v1.6.5)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.6.5";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-6-")));
let echecs = 0;
const constat = (ok, texte) => {
  console.log(`${ok ? "OK  " : "ECHEC"} ${texte}`);
  if (!ok) echecs += 1;
};

const ancienneGarde = path.join(tmp, "ancienne-verifier.mjs");
fs.writeFileSync(ancienneGarde, execFileSync("git", ["-C", racine, "show", `${refAncienne}:ops/garde-socle/verifier.mjs`]));
const garde = path.join(racine, "ops/garde-socle/verifier.mjs");
const passe = path.join(racine, "socle/batiment/scripts/socle-liens.mjs");

/* 1 a. lienCanonique, rendu par le socle, selon le reglage. */
execFileSync("npm", ["i", "--prefix", tmp, "--no-audit", "--no-fund", "--silent", "esbuild@0.21.5"], { stdio: ["ignore", "ignore", "inherit"] });
const esbuild = createRequire(path.join(tmp, "x.js"))("esbuild");
async function navigation(reglage) {
  const config = reglage === undefined ? '{ name: "Site", phone: "" }' : `{ name: "Site", phone: "", slashFinal: ${reglage} }`;
  const sortie = await esbuild.build({
    entryPoints: [path.join(racine, "socle/batiment/src/data/navigation.ts")], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    plugins: [{ name: "doublures", setup(b) {
      b.onResolve({ filter: /^@\/(routes|data\/config)$/ }, (x) => ({ path: x.path, namespace: "doublure" }));
      b.onLoad({ filter: /.*/, namespace: "doublure" }, (x) => ({ loader: "js", contents: x.path === "@/routes"
        ? "export const NotFound = () => null; export const pagesForRoute = () => [() => null];"
        : `export const SITE_CONFIG = ${config}; export const phoneHref = () => null;` }));
    } }],
  });
  const f = path.join(tmp, `nav-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(f, sortie.outputFiles[0].text);
  return import(pathToFileURL(f).href);
}
const CAS = [
  ["/services", "/services/", "/services"],
  ["/services/", "/services/", "/services"],
  ["/services/peinture#prix", "/services/peinture/#prix", "/services/peinture#prix"],
  ["/villes/?canton=vs", "/villes/?canton=vs", "/villes?canton=vs"],
  ["/", "/", "/"],
  ["/sitemap.xml", "/sitemap.xml", "/sitemap.xml"],
  ["/favicon.svg", "/favicon.svg", "/favicon.svg"],
  ["/images/photo.webp", "/images/photo.webp", "/images/photo.webp"],
  ["#formulaire", "#formulaire", "#formulaire"],
  ["https://www.admin.ch/gov", "https://www.admin.ch/gov", "https://www.admin.ch/gov"],
  ["mailto:info@exemple.ch", "mailto:info@exemple.ch", "mailto:info@exemple.ch"],
];
const navVrai = await navigation(true);
const navFaux = await navigation(false);
const navSans = await navigation(undefined);
for (const [href, vrai, faux] of CAS) {
  constat(navVrai.lienCanonique(href) === vrai && navFaux.lienCanonique(href) === faux,
    `lienCanonique « ${href} » : slashFinal true « ${navVrai.lienCanonique(href)} », false « ${navFaux.lienCanonique(href)} »`);
}
constat(CAS.every(([h]) => navSans.lienCanonique(h) === h), "lienCanonique sans reglage : le lien reste tel qu'il est ecrit (rien n'est decide)");
constat(navFaux.urlCanonique("/services/", "https://helvetique-exemple.ch") === "/services" && navVrai.urlCanonique("/services", "https://helvetique-exemple.ch") === "/services/",
  "historique (urlCanonique) : meme reglage que les liens");

/* 1 b. La passe, sur un dossier construit, selon le reglage. */
const { hrefCanonique } = await import(pathToFileURL(passe).href);
for (const [href, vrai, faux] of CAS) {
  constat(hrefCanonique(href, "helvetique-exemple.ch", true) === vrai && hrefCanonique(href, "helvetique-exemple.ch", false) === faux, `passe « ${href} » : true « ${vrai} », false « ${faux} »`);
}
constat(hrefCanonique("https://helvetique-exemple.ch/services/", "helvetique-exemple.ch", false) === "https://helvetique-exemple.ch/services"
  && hrefCanonique("https://helvetic-rohrreinigung.ch/staedte/", "helvetique-exemple.ch", false) === "https://helvetic-rohrreinigung.ch/staedte/", "passe : href absolu du site ote son « / », autre domaine du parc intact");

const NUM = "021 000 00 00";
const H = "Lun-ven 10 h - 19 h";
const ENTETE = `<header><a href="tel:+41210000000">${NUM}</a><span>${H}</span></header>`;
const BARRE = `<div class="fixed inset-x-0 bottom-0 z-40 border-t"><p><a href="tel:+41210000000">${NUM}</a><span> · ${H}</span></p></div>`;
const PAGE = (main, canonical) => `<html lang="fr"><head>${canonical ? `<link rel="canonical" href="${canonical}">` : ""}<link rel="icon" href="/favicon.svg"></head><body>${ENTETE}<main>${main}</main><footer>pied</footer>${BARRE}</body></html>`;
const SITEMAP = (locs) => `<?xml version="1.0"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;
function site(reglage, { liens = [], canonical, locs = [] }) {
  const d = fs.mkdtempSync(path.join(tmp, "s-"));
  const config = `export const SITE_CONFIG = { name: "Site", phone: "${NUM}", phoneMention: "${H}", domainBare: "helvetique-exemple.ch"${reglage === undefined ? "" : `, slashFinal: ${reglage}`} };`;
  const main = liens.map((h) => `<a href="${h}">x</a>`).join(" ");
  const fichiers = {
    "package.json": JSON.stringify({ name: "@workspace/helvetique-preuve", scripts: { build: "vite build && node ./scripts/prerender-content.mjs && node ./scripts/socle-liens.mjs dist/public && node ./scripts/garde-socle.mjs --pages dist/public" } }),
    "src/data/config.ts": config,
    "dist/public/index.html": PAGE(main, canonical),
    "dist/public/contact/index.html": PAGE(`<p>Téléphone : ${NUM}, ${H}</p>`, null),
    "dist/public/sitemap.xml": SITEMAP(locs),
  };
  for (const [f, c] of Object.entries(fichiers)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); }
  return d;
}
const pages = (verifier, d) => { const r = spawnSync("node", [verifier, d, "--pages", "dist/public"], { encoding: "utf8" }); return { vert: r.status === 0, sortie: `${r.stdout}${r.stderr}` }; };
const passer = (d) => spawnSync("node", [passe, "dist/public"], { cwd: d, encoding: "utf8" });

/* La passe : reglage absent, elle s'arrete en disant quoi ecrire. */
{
  const d = site(undefined, { liens: ["/services"] });
  const r = passer(d);
  constat(r.status === 1 && /slashFinal absent/.test(r.stderr) && /slashFinal: true,/.test(r.stderr) && /slashFinal: false,/.test(r.stderr), "passe sans reglage : arret, message qui dit quoi ecrire");
  const f = site(false, { liens: ["/services/", "https://helvetique-exemple.ch/villes/#carte", "/favicon.svg"] });
  const p = passer(f);
  const html = fs.readFileSync(path.join(f, "dist/public/index.html"), "utf8");
  constat(p.status === 0 && html.includes('href="/services"') && html.includes('href="https://helvetique-exemple.ch/villes#carte"') && html.includes('href="/favicon.svg"') && /slashFinal: false/.test(p.stdout),
    "passe slashFinal: false : « / » ote, ancre gardee, fichier intact");
}

/* 2. La garde des pages. */
const FORME_SANS = { liens: ["/services", "/villes/sion?x=1", "https://helvetique-exemple.ch/contact", "/favicon.svg", "/sitemap.xml", "/images/a.webp", "/", "#f", "https://helvetic-rohrreinigung.ch/staedte/"], canonical: "https://helvetique-exemple.ch/services", locs: ["https://helvetique-exemple.ch/", "https://helvetique-exemple.ch/services", "https://helvetique-exemple.ch/villes/sion"] };
const FORME_AVEC = { liens: ["/services/", "/villes/sion/?x=1", "https://helvetique-exemple.ch/contact/", "/favicon.svg", "/"], canonical: "https://helvetique-exemple.ch/services/", locs: ["https://helvetique-exemple.ch/", "https://helvetique-exemple.ch/services/"] };
constat(pages(garde, site(false, FORME_SANS)).vert, "garde des pages, slashFinal: false, site sans « / » coherent : vert (carrelage)");
constat(pages(garde, site(true, FORME_AVEC)).vert, "garde des pages, slashFinal: true, site avec « / » coherent : vert (ramonage)");
constat(!pages(ancienneGarde, site(false, FORME_SANS)).vert, `contre-epreuve ${refAncienne} : un site sans « / » coherent etait ROUGE (la regression des 9 sites)`);
for (const [libelle, reglage, entree, cle, extrait] of [
  ["lien « /services/ » sur un site sans « / »", false, { ...FORME_SANS, liens: ["/services/"] }, "lien interne vers une adresse qui redirige (avec « / » final)", "/services/"],
  ["lien « /services » sur un site avec « / »", true, { ...FORME_AVEC, liens: ["/services"] }, "lien interne vers une adresse qui redirige (sans « / » final)", "/services"],
  ["canonical « /services/ » sur un site sans « / »", false, { ...FORME_SANS, canonical: "https://helvetique-exemple.ch/services/" }, "balise canonical qui n'a pas la forme du reglage slashFinal: false", "/services/"],
  ["canonical « /services » sur un site avec « / »", true, { ...FORME_AVEC, canonical: "https://helvetique-exemple.ch/services" }, "balise canonical qui n'a pas la forme du reglage slashFinal: true", "/services"],
  ["<loc> « /services/ » d'un sitemap sans « / »", false, { ...FORME_SANS, locs: ["https://helvetique-exemple.ch/services/"] }, "adresse du sitemap qui n'a pas la forme du reglage slashFinal: false", "/services/"],
  ["<loc> « /services » d'un sitemap avec « / »", true, { ...FORME_AVEC, locs: ["https://helvetique-exemple.ch/services"] }, "adresse du sitemap qui n'a pas la forme du reglage slashFinal: true", "/services"],
  ["le site sans « / » mesure avec la MAUVAISE valeur (true)", true, FORME_SANS, "lien interne vers une adresse qui redirige (sans « / » final)", "/services"],
  ["le site avec « / » mesure avec la MAUVAISE valeur (false)", false, FORME_AVEC, "lien interne vers une adresse qui redirige (avec « / » final)", "/services/"],
  ["reglage absent", undefined, FORME_SANS, "reglage slashFinal absent de src/data/config.ts", "slashFinal: true,"],
]) {
  const r = pages(garde, site(reglage, entree));
  const l = r.sortie.split("\n"); const i = l.findIndex((x) => x.includes(`liens:${cle}`));
  constat(!r.vert && i >= 0 && l.slice(i, i + 3).join(" ").includes(extrait), `garde des pages : ${libelle} : rouge, page et lien nommes`);
}

/* La garde de la source : le reglage est exige, et ecrit true ou false. */
function source(verifier, ligne) {
  const d = fs.mkdtempSync(path.join(tmp, "src-"));
  fs.mkdirSync(path.join(d, "src/data"), { recursive: true }); fs.mkdirSync(path.join(d, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "@workspace/helvetique-preuve", scripts: { build: "x" } }));
  fs.writeFileSync(path.join(d, "src/data/config.ts"), `export const SITE_CONFIG = { name: "Site", phone: "", phoneMention: ""${ligne} };`);
  fs.writeFileSync(path.join(d, "scripts/socle-manifeste.json"), JSON.stringify({ fichiers: [] }));
  const r = spawnSync("node", [verifier, d], { encoding: "utf8" });
  return `${r.stdout}${r.stderr}`.split("\n").filter((x) => x.includes("slashFinal"));
}
constat(source(garde, "").some((x) => x.includes("ne declare pas slashFinal") && x.includes("`slashFinal: true,`") && x.includes("`slashFinal: false,`")), "garde de la source : reglage absent : rouge, message qui dit quoi ecrire");
constat(source(garde, ', slashFinal: "non"').some((x) => x.includes("ni true ni false")), "garde de la source : slashFinal: \"non\" : rouge (mal type)");
constat(source(garde, ", slashFinal: process.env.X").some((x) => x.includes("ni true ni false")), "garde de la source : valeur calculee : rouge (le reglage s'ecrit en dur)");
constat(source(garde, ", slashFinal: true").length === 0 && source(garde, ", slashFinal: false").length === 0, "garde de la source : true et false : vert");
constat(source(ancienneGarde, "").length === 0, `contre-epreuve ${refAncienne} : un site sans reglage passait`);

/* 3. Le trou des numeros. */
const { NUMERO_SUISSE } = await import(pathToFileURL(garde).href);
const { NUMERO_SUISSE: ANCIEN } = await import(pathToFileURL(ancienneGarde).href);
const trouve = (re, t) => [...t.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0].trim());
for (const [texte, attendu] of [["Appelez le 044 555 66 77.", "044 555 66 77"], ["Rufen: 044 555 66 77, bitte.", "044 555 66 77"], ["Notfall 044 555 66 77", "044 555 66 77"], ["Wert 044 555 66 77.5 Punkte", null], ["Code 044 555 66 77,5", null], ["+41 44 555 66 77.", "+41 44 555 66 77"]]) {
  const t = trouve(NUMERO_SUISSE, texte);
  constat(attendu ? t.length === 1 && t[0] === attendu : t.length === 0, `numero : « ${texte} » : ${attendu ? "reconnu" : "pas un numero"} (${JSON.stringify(t)})`);
}
constat(trouve(ANCIEN, "Appelez le 044 555 66 77.").length === 0 && trouve(ANCIEN, "Rufen: 044 555 66 77, bitte.").length === 0, `contre-epreuve ${refAncienne} : « 044 555 66 77. » et « 044 555 66 77, » passaient`);
{
  const d = fs.mkdtempSync(path.join(tmp, "de-"));
  const DE = (main) => `<html lang="de"><head><title>S</title></head><body><header>Kopf</header><main>${main}</main><footer>Fuss</footer></body></html>`;
  for (const [f, c] of Object.entries({ "package.json": JSON.stringify({ name: "@workspace/helvetic-preuve-de", scripts: { build: "x" } }), "src/data/config.ts": 'export const SITE_CONFIG = { name: "Site", phone: "", phoneMention: "", langue: "de", slashFinal: true };', "dist/public/index.html": DE("<p>Notfall? 044 555 66 77.</p>") })) {
    fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c);
  }
  const r = pages(garde, d);
  constat(!r.vert && r.sortie.includes("numero de telephone ecrit sur un site DE"), "garde des pages DE : « 044 555 66 77. » en fin de phrase : rouge");
  constat(pages(ancienneGarde, d).sortie.includes("numero de telephone ecrit") === false, `contre-epreuve ${refAncienne} : il passait`);
}

const man = JSON.parse(fs.readFileSync(path.join(racine, "socle/batiment/MANIFESTE.json"), "utf8"));
constat(man.version === 10, `manifeste : version ${man.version} (attendu 10)`);

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.6 tiennent, contre-epreuves comprises.");
