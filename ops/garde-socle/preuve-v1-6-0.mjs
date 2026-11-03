#!/usr/bin/env node
/**
 * PREUVE : ce que la v1.6.0 ajoute au socle, chaque point avec sa
 * contre-epreuve sur l'ancienne version.
 *
 *   1. `ligne: false` : un numero ecrit dans la configuration n'est rendu NULLE
 *      PART, ni lien `tel:` ni icone. L'ancien en-tete le rendait.
 *   2. Le libelle du bouton est propre au site, et vide il ne change rien.
 *   3. L'horaire d'intervention est toujours rendu AVEC son etiquette.
 *   4. Les sections de l'en-tete sont une zone libre, mais la garde refuse un
 *      septieme emplacement. L'ancienne mesure ne le voyait pas.
 *   5. Reposer le gabarit sur une copie qui n'a pas les zones nouvelles garde
 *      les zones du site et prend les valeurs par defaut. L'ancien `poser.mjs`
 *      refusait le fichier.
 *
 * Aucun reseau hors npm, aucun site reel : des doublures et des dossiers jetables.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-0.mjs [ref-ancienne]   (defaut : v1.5.0)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.5.0";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-0-"));
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

/** Rend un composant du socle, avec les modules propres au site remplaces par des doublures. */
async function rendre(version, composant, nomExport, config) {
  const src = path.join(version, "socle/batiment/src");
  const DOUBLURES = {
    "@/components/Logo": `export const Logo = () => "Logo";`,
    "@/components/socle/CanalWhatsapp": `export const CanalWhatsapp = () => null;`,
    "@/components/socle/reserve-widget.css": ``,
    "@/routes": `export const NotFound = () => null; export const pagesForRoute = (h) => h === "/inconnu" ? [NotFound] : [() => null];`,
    "@/data/config": `export const SITE_CONFIG = ${JSON.stringify(config)};
      export const phoneHref = () => SITE_CONFIG.phone ? "tel:+41" + SITE_CONFIG.phone.replace(/\\D/g, "").slice(1) : null;
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

const NUMERO = { name: "Site", phone: "021 000 00 00" };
const telIcone = (html) => ({ tel: (html.match(/href="tel:/g) ?? []).length, icone: html.includes('data-icone="phone"') });

/* 1. Le drapeau `ligne`. */
for (const [composant, nom] of [["components/layout/Header.tsx", "Header"], ["components/layout/StickyMobileCTA.tsx", "StickyMobileCTA"]]) {
  const sans = telIcone(await rendre(actuel, composant, nom, { ...NUMERO, ligne: false }));
  constat(sans.tel === 0 && !sans.icone, `${nom}, ligne: false : ${sans.tel} lien tel:, icone ${sans.icone ? "presente" : "absente"}`);
  const avec = telIcone(await rendre(actuel, composant, nom, NUMERO));
  constat(avec.tel > 0 && avec.icone, `${nom}, sans drapeau : ${avec.tel} lien(s) tel:, rendu d'avant garde`);
  const vieux = telIcone(await rendre(ancien, composant, nom, { ...NUMERO, ligne: false }));
  constat(vieux.tel > 0, `contre-epreuve ${refAncienne}, ${nom}, ligne: false : ${vieux.tel} lien(s) tel:, le drapeau etait ignore`);
}

/* 2. Le libelle du bouton : vide, rien ne change. */
const hActuel = await rendre(actuel, "components/layout/Header.tsx", "Header", { name: "Site", phone: "" });
const hAncien = await rendre(ancien, "components/layout/Header.tsx", "Header", { name: "Site", phone: "" });
constat(hActuel === hAncien, `en-tete sans numero, zones par defaut : HTML identique a ${refAncienne}`);
const hNum = await rendre(actuel, "components/layout/Header.tsx", "Header", NUMERO);
const hNumAncien = await rendre(ancien, "components/layout/Header.tsx", "Header", NUMERO);
constat(hNum === hNumAncien, `en-tete avec numero, zones par defaut : HTML identique a ${refAncienne}`);
const nav = path.join(actuel, "socle/batiment/src/data/navigation.ts");
const navDefaut = fs.readFileSync(nav, "utf8");
fs.writeFileSync(nav, navDefaut.replace("const BOUTON: { devis?: string; devisLong?: string } = {};",
  'const BOUTON: { devis?: string; devisLong?: string } = { devis: "Prendre rendez-vous", devisLong: "Prendre rendez-vous" };'));
const hRdv = await rendre(actuel, "components/layout/Header.tsx", "Header", { name: "Site", phone: "" });
constat(!hRdv.includes("Devis gratuit") && (hRdv.match(/Prendre rendez-vous/g) ?? []).length === 2, "libelle du site : « Prendre rendez-vous » sur les deux boutons");
fs.writeFileSync(nav, navDefaut);

/* 3. L'horaire d'intervention, toujours etiquete. */
const hor = await rendre(actuel, "components/socle/HorairesIntervention.tsx", "HorairesIntervention", { name: "S", horairesIntervention: "lundi au samedi, 7h30 a 20h" });
constat(hor === "<p>Intervention : lundi au samedi, 7h30 a 20h</p>", `horaire rendu : ${hor}`);
const horVide = await rendre(actuel, "components/socle/HorairesIntervention.tsx", "HorairesIntervention", { name: "S" });
constat(horVide === "", "horaire absent : rien n'est rendu");
constat(!fs.existsSync(path.join(ancien, "socle/batiment/src/components/socle/HorairesIntervention.tsx")), `contre-epreuve ${refAncienne} : aucun chemin etiquete pour un horaire`);

/* 4. Sept emplacements dans la zone des sections. */
const SEPTIEME = "  [{ libelle: LIBELLES.contact, href: CHEMINS.contact }],\n];";
const septNav = navDefaut.replace(SEPTIEME, `  [{ libelle: LIBELLES.contact, href: CHEMINS.contact }],\n  [{ libelle: "Lieux", href: "/lieux" }],\n];`);
function garde(version, contenuNav) {
  const site = path.join(tmp, `site-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(path.join(site, "src/data"), { recursive: true });
  fs.writeFileSync(path.join(site, "package.json"), "{}");
  fs.writeFileSync(path.join(site, "src/data/navigation.ts"), contenuNav);
  const manifeste = JSON.parse(fs.readFileSync(path.join(version, "socle/batiment/MANIFESTE.json"), "utf8"));
  manifeste.fichiers = manifeste.fichiers.filter((f) => f.chemin === "src/data/navigation.ts");
  fs.mkdirSync(path.join(site, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(site, "scripts/socle-manifeste.json"), JSON.stringify(manifeste));
  fs.copyFileSync(path.join(version, "ops/garde-socle/verifier.mjs"), path.join(site, "scripts/garde-socle.mjs"));
  const r = spawnSync("node", ["scripts/garde-socle.mjs"], { cwd: site, encoding: "utf8" });
  return `${r.stdout}${r.stderr}`;
}
constat(/7 emplacements dans sa zone libre/.test(garde(actuel, septNav)), "garde : sept emplacements dans la zone, refuse");
constat(!/emplacements dans sa zone libre/.test(garde(actuel, navDefaut)), "garde : six emplacements, accepte");
const vieilleGarde = garde(ancien, septNav);
constat(!/emplacements|chemins dans sa partie commune/.test(vieilleGarde), `contre-epreuve ${refAncienne} : la mesure de la barre ne voit pas le septieme emplacement d'une zone`);

/* 5. Reposer le gabarit sur une copie qui n'a qu'une zone. */
function poser(version) {
  const site = path.join(tmp, `pose-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(path.join(site, "src/data"), { recursive: true });
  fs.writeFileSync(path.join(site, "package.json"), "{}");
  const vieux = execFileSync("git", ["-C", racine, "show", `${refAncienne}:socle/batiment/src/data/navigation.ts`], { encoding: "utf8" });
  fs.writeFileSync(path.join(site, "src/data/navigation.ts"), vieux.replace('services: "Services",', 'services: "Leistungen",'));
  const script = path.join(version, "ops/garde-socle/poser.mjs");
  if (version !== actuel) fs.cpSync(path.join(actuel, "socle"), path.join(version, "socle"), { recursive: true });
  const r = spawnSync("node", [script, site], { encoding: "utf8" });
  return { code: r.status, nav: fs.readFileSync(path.join(site, "src/data/navigation.ts"), "utf8") };
}
const pose = poser(actuel);
constat(pose.code === 0 && pose.nav.includes('services: "Leistungen"') && pose.nav.includes("const BOUTON") && pose.nav.includes("const SIX = 6"),
  "poser : zone du site gardee, deux zones nouvelles prises au gabarit");
const vieillePose = poser(ancien);
constat(vieillePose.code !== 0, `contre-epreuve ${refAncienne} : l'ancien poser.mjs refuse le fichier (code ${vieillePose.code})`);

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.0 tiennent, contre-epreuves comprises.");
