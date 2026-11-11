#!/usr/bin/env node
/**
 * PREUVE : l'en-tete du socle signale son menu ouvert au chat, et le socle
 * consomme la place publiee par le chargeur. La contre-epreuve montre que
 * l'ancien gabarit ne faisait ni l'un ni l'autre.
 *
 * L'en-tete est monte dans jsdom, avec les modules propres aux sites remplaces
 * par des doublures. Aucun reseau, aucun chargeur reel.
 *
 * Usage :
 *   node ops/garde-socle/preuve-widget.mjs [ref-ancienne]   (defaut : v1.4.0)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.4.0";
const FICHIER = "socle/batiment/src/components/layout/Header.tsx";
const CSS = "socle/batiment/src/components/socle/reserve-widget.css";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preuve-widget-"));

execFileSync(
  "npm",
  ["i", "--prefix", tmp, "--no-audit", "--no-fund", "--silent", "esbuild@0.21.5", "react@18.3.1", "react-dom@18.3.1", "jsdom@24.1.3"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
const require = createRequire(path.join(tmp, "x.js"));
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");

const ancien = path.join(tmp, "Header-ancien.tsx");
fs.writeFileSync(ancien, execFileSync("git", ["-C", racine, "show", `${refAncienne}:${FICHIER}`]));

const DOUBLURES = {
  "@/components/Logo": `export const Logo = () => "Logo";`,
  "@/components/socle/CanalWhatsapp": `export const CanalWhatsapp = () => null;`,
  "@/components/socle/reserve-widget.css": ``,
  "@/data/navigation": `export const CHEMIN_CONTACT = "/contact";
    export const NAV = [{ libelle: "Services", href: "/services" }];
    export const NAV_TELEPHONE = NAV;
    export const telephone = () => null;
    export const lienCanonique = (h) => h;
    export const TEXTES = { accueil: "Accueil", navigation: "Navigation", navigationRepliee: "Repliee", appeler: "Appeler",
      devis: "Devis gratuit", devisLong: "Demander un devis", fermerMenu: "Fermer le menu", ouvrirMenu: "Ouvrir le menu", whatsapp: "WhatsApp" };`,
  "@/data/config": `export const SITE_CONFIG = { name: "Site", phone: "" }; export const phoneHref = () => null; export const phoneMention = () => null;`,
  "@/lib/utils": `export const cn = (...c) => c.filter(Boolean).join(" ");`,
  wouter: `export const useLocation = () => ["/", () => {}]; export const Link = ({ children, href, ...p }) => { const { createElement } = require("react"); return createElement("a", { href, ...p }, children); };`,
  "lucide-react": `const I = () => null; export { I as Menu, I as Phone, I as X };`,
};

async function construire(source) {
  const sortie = await esbuild.build({
    stdin: {
      contents: `import { createElement } from "react";
        import { createRoot } from "react-dom/client";
        import { Header } from ${JSON.stringify(source)};
        createRoot(document.getElementById("racine")).render(createElement(Header));`,
      loader: "tsx",
      resolveDir: tmp,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    nodePaths: [path.join(tmp, "node_modules")],
    plugins: [
      {
        name: "doublures",
        setup(b) {
          b.onResolve({ filter: /^(@\/|wouter$|lucide-react$)/ }, (a) => ({ path: a.path, namespace: "doublure" }));
          b.onLoad({ filter: /.*/, namespace: "doublure" }, (a) => {
            if (!(a.path in DOUBLURES)) throw new Error(`doublure manquante : ${a.path}`);
            return { contents: DOUBLURES[a.path], loader: "jsx", resolveDir: tmp };
          });
        },
      },
    ],
  });
  return sortie.outputFiles[0].text;
}

/** Ouvre le menu, le referme par le bouton, le rouvre, le referme par Echap. */
async function parcourir(code) {
  const dom = new JSDOM(`<!doctype html><div id="racine"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  const { window: w } = dom;
  w.require = require;
  w.eval(code);
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const pose = () => w.document.documentElement.hasAttribute("data-hc-nav-open");
  const bouton = () => [...w.document.querySelectorAll("button")].find((b) => /menu/i.test(b.getAttribute("aria-label") ?? ""));
  await attendre(50);
  const etat = { fermeAuDepart: !pose() };
  bouton().click();
  await attendre(50);
  etat.ouvert = pose();
  bouton().click();
  await attendre(50);
  etat.refermeParBouton = !pose();
  bouton().click();
  await attendre(50);
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  await attendre(50);
  etat.refermeParEchap = !pose();
  dom.window.close();
  return etat;
}

let echec = 0;
const neuf = await parcourir(await construire(path.join(racine, FICHIER)));
const vieux = await parcourir(await construire(ancien));
console.log("en-tete neuf   :", JSON.stringify(neuf));
console.log("en-tete ancien :", JSON.stringify(vieux));
if (!(neuf.fermeAuDepart && neuf.ouvert && neuf.refermeParBouton && neuf.refermeParEchap)) {
  console.log("ECHEC l'en-tete neuf ne signale pas son menu ouvert, ou ne le retire pas");
  echec = 1;
}
if (vieux.ouvert) {
  console.log("ECHEC contre-epreuve : l'ancien en-tete posait deja l'attribut, la preuve ne prouve rien");
  echec = 1;
}

/* La place du bouton : la regle existe, l'en-tete l'importe, et elle ne vaut que sous 1024 px. */
const css = fs.readFileSync(path.join(racine, CSS), "utf8");
const header = fs.readFileSync(path.join(racine, FICHIER), "utf8");
const cssOk =
  /var\(--hc-widget-reserve/.test(css) && /@media\s*\(max-width:\s*1023px\)/.test(css) && /import\s+"@\/components\/socle\/reserve-widget\.css"/.test(header);
let cssAncien = false;
try {
  execFileSync("git", ["-C", racine, "cat-file", "-e", `${refAncienne}:${CSS}`], { stdio: "ignore" });
  cssAncien = true;
} catch {
  /* absente de l'ancienne version : c'est la contre-epreuve attendue */
}
console.log(`reserve : regle et import ${cssOk ? "presents" : "ABSENTS"}, dans ${refAncienne} ${cssAncien ? "DEJA LA" : "absente"}`);
if (!cssOk || cssAncien) echec = 1;

fs.rmSync(tmp, { recursive: true, force: true });
if (echec) process.exit(1);
console.log("PREUVE_OK le menu ouvert retire le chat, la place du bouton est reservee, contre-epreuve sur", refAncienne);
