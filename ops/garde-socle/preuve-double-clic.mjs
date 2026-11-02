#!/usr/bin/env node
/**
 * PREUVE : un double clic n'avance le formulaire d'accueil du socle que d'une
 * etape, et la contre-epreuve montre que l'ancien gabarit sautait des etapes.
 *
 * Le gabarit n'a pas de paquet a lui : la preuve le monte dans jsdom, avec les
 * modules propres aux sites remplaces par des doublures, dont un `submitLead`
 * qui ne fait que compter. Rien n'est envoye.
 *
 * Usage :
 *   node ops/garde-socle/preuve-double-clic.mjs [ref-ancienne]   (defaut : v1.3.0)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.3.0";
const FICHIER = "socle/batiment/src/components/HeroForm.tsx";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preuve-double-clic-"));

execFileSync(
  "npm",
  ["i", "--prefix", tmp, "--no-audit", "--no-fund", "--silent", "esbuild@0.21.5", "react@18.3.1", "react-dom@18.3.1", "jsdom@24.1.3"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
const require = createRequire(path.join(tmp, "x.js"));
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");

const ancien = path.join(tmp, "HeroForm-ancien.tsx");
fs.writeFileSync(ancien, execFileSync("git", ["-C", racine, "show", `${refAncienne}:${FICHIER}`]));

const DOUBLURES = {
  "@/components/Icon": `export const Icon = () => null;`,
  "@/data/config": `export const SITE_CONFIG = { responseText: "Reponse" };`,
  "@/lib/utils": `export const cn = (...c) => c.filter(Boolean).join(" ");`,
  "@/lib/api": `export const construireCharge = (c) => c; export const submitLead = async () => { window.__envois += 1; };`,
  "@/data/heroFormConfig": `const o = [{ value: "a", label: "Choix A" }, { value: "b", label: "Choix B" }];
    export const FORM_STEPS = [
      { kind: "choice", key: "besoin", title: "Besoin", options: o },
      { kind: "choice", key: "surface", title: "Surface", options: o },
      { kind: "choice", key: "profil", title: "Profil", options: o },
      { kind: "zone", key: "zone", title: "Zone" },
      { kind: "choice", key: "travaux", title: "Travaux", options: o },
      { kind: "contact", title: "Contact" },
    ];`,
  wouter: `export const useLocation = () => ["/", () => {}]; export const Link = ({ children }) => children;`,
  "lucide-react": `const I = () => null; export { I as ArrowLeft, I as ArrowRight, I as Check, I as Loader2, I as ShieldCheck };`,
};

async function construire(source) {
  const sortie = await esbuild.build({
    stdin: {
      contents: `import { createElement } from "react";
        import { createRoot } from "react-dom/client";
        import { HeroForm } from ${JSON.stringify(source)};
        createRoot(document.getElementById("racine")).render(createElement(HeroForm));`,
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
          b.onResolve({ filter: /^(@\/|wouter$|lucide-react$)/ }, (a) => {
            if (a.path in DOUBLURES) return { path: a.path, namespace: "doublure" };
            return { path: path.join(racine, "socle/batiment/src", a.path.slice(2) + ".tsx") };
          });
          b.onLoad({ filter: /.*/, namespace: "doublure" }, (a) => ({ contents: DOUBLURES[a.path], loader: "jsx", resolveDir: tmp }));
        },
      },
    ],
  });
  return sortie.outputFiles[0].text;
}

/** `ecart` : 0, les deux clics partent ensemble ; sinon le second tombe `ecart` ms plus tard. */
async function parcourir(code, ecart) {
  const dom = new JSDOM(`<!doctype html><div id="racine"></div>`, { runScripts: "outside-only", pretendToBeVisual: true });
  const { window: w } = dom;
  w.__envois = 0;
  w.eval(code);
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  await attendre(50);
  const numero = () => Number((w.document.body.textContent.match(/(\d+)\/\d+/) ?? [])[1]);
  const boutons = () => [...w.document.querySelectorAll("button")].filter((b) => b.textContent.trim() && !/Retour/.test(b.textContent) && !b.closest("form"));
  const journal = [];
  for (let i = 0; i < 10 && !w.document.querySelector("form"); i += 1) {
    const avant = numero();
    const champ = w.document.querySelector('input[type="text"]');
    if (champ) {
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(champ, "Lausanne");
      champ.dispatchEvent(new w.Event("input", { bubbles: true }));
      await attendre(20);
    }
    const b = boutons()[0];
    b.click();
    if (ecart === 0) b.click();
    else {
      await attendre(ecart);
      boutons()[0]?.click();
    }
    await attendre(450);
    journal.push(`${avant}>${numero()}`);
  }
  const cb = w.document.querySelector('form input[type="checkbox"][required]');
  const etat = { journal, case: Boolean(cb), cochee: cb?.checked, envois: w.__envois };
  /* Le retour aussi : d'une etape, et le verrou relache ensuite. */
  const retour = [...w.document.querySelectorAll("button")].find((b) => /Retour/.test(b.textContent));
  if (retour) {
    const avant = numero();
    retour.click();
    retour.click();
    await attendre(450);
    etat.retour = `${avant}>${numero()}`;
  }
  dom.window.close();
  return etat;
}

const sansSaut = (e) => e.journal.every((p) => { const [a, b] = p.split(">").map(Number); return b === a + 1; });

let echec = 0;
const codeNeuf = await construire(path.join(racine, FICHIER));
const codeAncien = await construire(ancien);
for (const ecart of [0, 80]) {
  const neuf = await parcourir(codeNeuf, ecart);
  const vieux = await parcourir(codeAncien, ecart);
  console.log(`ecart ${ecart} ms, neuf   :`, JSON.stringify(neuf));
  console.log(`ecart ${ecart} ms, ancien :`, JSON.stringify(vieux));
  if (!sansSaut(neuf) || !neuf.case || neuf.cochee !== false || neuf.envois !== 0 || neuf.retour !== "6>5") {
    console.error(`PREUVE_ECHEC le gabarit saute encore des etapes ou perd la case (ecart ${ecart})`);
    echec = 1;
  }
  if (sansSaut(vieux)) {
    console.error(`PREUVE_ECHEC contre-epreuve muette : l'ancien gabarit ne saute rien (ecart ${ecart})`);
    echec = 1;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (echec) process.exit(1);
console.log("PREUVE_OK un seul avancement par etape, contre-epreuve sur", refAncienne);
