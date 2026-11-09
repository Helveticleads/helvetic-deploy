#!/usr/bin/env node
/**
 * PREUVE : seule la DEMANDE est gratuite, jamais le devis (Frederic, 09.11, v1.6.4).
 *
 *   1. Le menu et la barre du bas disent, par defaut, « Demande gratuite »
 *      (court) et « Demande gratuite et sans engagement » (long) en FR,
 *      « Kostenlose Anfrage » et « Kostenlose und unverbindliche Anfrage » en DE.
 *      Contre-epreuve : la ref ancienne disait « Devis gratuit ».
 *   2. La garde refuse, dans les fichiers du socle (zones libres comprises),
 *      « devis gratuit », « Kostenloses Angebot » et « kostenloser
 *      Kostenvoranschlag », sans casse ; les libelles neutres passent.
 *      Contre-epreuve : l'ancienne garde les laissait passer.
 *   3. Le bouton du formulaire d'accueil dit « Envoyer ma demande ».
 *   4. Aucun fichier du socle ne promet un devis gratuit.
 *
 * Aucun reseau hors npm, aucun site reel : des doublures et des dossiers jetables.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-4.mjs [ref-ancienne]   (defaut : v1.6.3)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.6.3";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-4-")));
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

/** Rend un composant du socle, avec les modules propres au site remplaces par des doublures. */
async function rendre(version, composant, nomExport, config) {
  const src = path.join(version, "socle/batiment/src");
  const DOUBLURES = {
    "@/components/Logo": `export const Logo = () => "Logo";`,
    "@/components/socle/CanalWhatsapp": `export const CanalWhatsapp = () => null;`,
    "@/components/socle/reserve-widget.css": ``,
    "@/routes": `export const NotFound = () => null; export const pagesForRoute = (h) => h === "/inconnu" ? [NotFound] : [() => null];`,
    "@/data/config": `export const SITE_CONFIG = ${JSON.stringify(config)};
      export const phoneHref = () => null;
      export const phoneMention = () => null;`,
    "@/lib/utils": `export const cn = (...c) => c.filter(Boolean).join(" ");`,
    wouter: `import { createElement } from "react";
      export const useLocation = () => ["/", () => {}];
      export const Link = ({ children, href, ...p }) => createElement("a", { href, ...p }, children);`,
    "lucide-react": `import { createElement } from "react";
      const I = (n) => () => createElement("svg", { "data-icone": n });
      export const Menu = I("menu"), Phone = I("phone"), X = I("x"), FileText = I("filetext");`,
  };
  const sortie = await esbuild.build({
    stdin: {
      contents: `import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { ${nomExport} } from ${JSON.stringify(path.join(src, composant))};
        globalThis.__html = renderToStaticMarkup(createElement(${nomExport}));`,
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
          b.onLoad({ filter: /.*/, namespace: "doublure" }, (a) => ({ contents: DOUBLURES[a.path], loader: "tsx", resolveDir: tmp }));
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

/* 1. Les libelles, au mot pres, dans le noeud de texte du lien de contact. */
const LIBELLES = {
  fr: { court: "Demande gratuite", long: "Demande gratuite et sans engagement", ancien: "Devis gratuit" },
  de: { court: "Kostenlose Anfrage", long: "Kostenlose und unverbindliche Anfrage", ancien: "Offerte anfragen" },
};
const noeuds = (html, texte) => html.split(`>${texte}<`).length - 1;
for (const langue of ["fr", "de"]) {
  const config = { name: "Site", phone: "", ...(langue === "de" ? { langue: "de" } : {}) };
  const l = LIBELLES[langue];
  const h = await rendre(actuel, "components/layout/Header.tsx", "Header", config);
  constat(noeuds(h, l.court) === 1 && noeuds(h, l.long) === 1, `en-tete ${langue} : bouton « ${l.court} » (court), menu « ${l.long} » (long)`);
  const s = await rendre(actuel, "components/layout/StickyMobileCTA.tsx", "StickyMobileCTA", config);
  constat(s.includes(`</svg> ${l.court}</a>`), `barre du bas ${langue} : « ${l.court} » (court)`);
  const hv = await rendre(ancien, "components/layout/Header.tsx", "Header", config);
  const sv = await rendre(ancien, "components/layout/StickyMobileCTA.tsx", "StickyMobileCTA", config);
  constat(noeuds(hv, l.ancien) === 1 && sv.includes(`</svg> ${l.ancien}</a>`) && !h.includes(l.ancien) && !s.includes(l.ancien),
    `contre-epreuve ${refAncienne} ${langue} : l'ancien rendu disait « ${l.ancien} »`);
}

/* 2. La garde, sur un site doublure dont navigation.ts porte un libelle de site. */
const NAV = fs.readFileSync(path.join(actuel, "socle/batiment/src/data/navigation.ts"), "utf8");
const VIDE = "const BOUTON: { devis?: string; devisLong?: string } = {};";
function garde(version, devis) {
  const site = path.join(tmp, `site-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(path.join(site, "src/data"), { recursive: true });
  fs.mkdirSync(path.join(site, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(site, "src/data/navigation.ts"),
    devis === null ? NAV : NAV.replace(VIDE, `const BOUTON: { devis?: string; devisLong?: string } = { devis: ${JSON.stringify(devis)}, devisLong: ${JSON.stringify(devis)} };`));
  fs.writeFileSync(path.join(site, "scripts/socle-manifeste.json"), JSON.stringify({ fichiers: [{ chemin: "src/data/navigation.ts", empreinte: "x" }] }));
  const r = spawnSync("node", [path.join(version, "ops/garde-socle/verifier.mjs"), site], { encoding: "utf8" });
  return `${r.stdout}${r.stderr}`.split("\n").filter((ligne) => ligne.includes("gratuite:"));
}
constat(NAV.includes(VIDE), "navigation.ts du socle : zone du libelle vide par defaut");
constat(garde(actuel, null).length === 0, "garde : navigation.ts du socle, libelles neutres : aucun defaut de gratuite");
for (const [devis, motif] of [
  ["Devis gratuit", "Devis gratuit"],
  ["DEMANDER UN DEVIS GRATUIT", "DEVIS GRATUIT"],
  ["Devis gratuits", "Devis gratuits"],
  ["Kostenloses Angebot anfragen", "Kostenloses Angebot"],
  ["Jetzt kostenloser Kostenvoranschlag", "kostenloser Kostenvoranschlag"],
  ["Einen kostenlosen Kostenvoranschlag anfordern", "kostenlosen Kostenvoranschlag"],
]) {
  const r = garde(actuel, devis);
  constat(r.length === 2 && r.every((ligne) => ligne.includes("src/data/navigation.ts") && ligne.includes(`« ${motif} »`)), `garde : « ${devis} » dans la zone du site : rouge`);
  constat(garde(ancien, devis).length === 0, `contre-epreuve ${refAncienne} : l'ancienne garde laissait passer « ${devis} »`);
}
for (const neutre of ["Demande gratuite", "Demande gratuite et sans engagement", "Kostenlose Anfrage", "Kostenlose und unverbindliche Anfrage", "Offerte anfragen", "Prendre rendez-vous"]) {
  constat(garde(actuel, neutre).length === 0, `garde : « ${neutre} » : vert`);
}

/* 3. Le bouton d'envoi du formulaire d'accueil (fichier optionnel du socle) : « Envoyer ma demande » (Frederic, 09.11). */
const BOUTON_HERO = '<Check className="h-4 w-4" /> ';
const hero = fs.readFileSync(path.join(actuel, "socle/batiment/src/components/HeroForm.tsx"), "utf8");
const heroAncien = fs.readFileSync(path.join(ancien, "socle/batiment/src/components/HeroForm.tsx"), "utf8");
constat(hero.split(`${BOUTON_HERO}Envoyer ma demande\n`).length === 2 && !/gratuit/i.test(hero), "HeroForm : bouton « Envoyer ma demande », aucune autre mention de gratuite");
constat(heroAncien.includes(`${BOUTON_HERO}Recevoir mon devis gratuit`), `contre-epreuve ${refAncienne} : le bouton disait « Recevoir mon devis gratuit »`);
const lignesDiff = hero.split("\n").filter((l, i) => l !== heroAncien.split("\n")[i]);
constat(hero.split("\n").length === heroAncien.split("\n").length && lignesDiff.length === 1 && lignesDiff[0].includes("Envoyer ma demande"), "HeroForm : rien d'autre ne change (une seule ligne differente)");

/* 4. Aucun fichier du socle ne promet un devis gratuit. */
const { devisGratuits } = await import(pathToFileURL(path.join(actuel, "ops/garde-socle/verifier.mjs")).href);
const manifeste = JSON.parse(fs.readFileSync(path.join(actuel, "socle/batiment/MANIFESTE.json"), "utf8"));
for (const entree of manifeste.fichiers) {
  const trouves = devisGratuits(fs.readFileSync(path.join(actuel, "socle/batiment", entree.source), "utf8"));
  constat(trouves.length === 0, `socle ${entree.source} : ${trouves.length ? trouves.map((t) => `ligne ${t.ligne} « ${t.texte} »`).join(", ") : "aucun devis gratuit"}`);
}
constat(manifeste.version >= 8, `manifeste : version ${manifeste.version} (attendu 8 ou plus, la v1.6.4 l'a porte a 8)`);

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.4 tiennent, contre-epreuves comprises.");
