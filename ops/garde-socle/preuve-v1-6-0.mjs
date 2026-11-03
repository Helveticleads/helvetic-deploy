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
 *   6. Sur un site du parc, la garde refuse au pied et au contact un `tel:`
 *      hors `telephone()`, une icone de telephone sur un lien qui n'appelle
 *      pas et un horaire d'appel ; sans drapeau `ligne` (batiment), elle se
 *      tait. L'ancienne garde ne voyait aucun des trois.
 *   7. Le drapeau `ligne` est obligatoire sur un paquet du parc ; un creneau
 *      de rappel propose comme option d'un champ est permis, le meme horaire
 *      ecrit dans le texte reste refuse.
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

/* 6. Le pied de page et la page contact d'un site du parc. */
function gardeSite(version, fichiers) {
  const site = path.join(tmp, `parc-${Math.random().toString(36).slice(2)}`);
  for (const [f, contenu] of Object.entries(fichiers)) {
    fs.mkdirSync(path.dirname(path.join(site, f)), { recursive: true });
    fs.writeFileSync(path.join(site, f), contenu);
  }
  fs.mkdirSync(path.join(site, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(site, "scripts/socle-manifeste.json"), JSON.stringify({ fichiers: [] }));
  fs.copyFileSync(path.join(version, "ops/garde-socle/verifier.mjs"), path.join(site, "scripts/garde-socle.mjs"));
  const r = spawnSync("node", ["scripts/garde-socle.mjs"], { cwd: site, encoding: "utf8" });
  return `${r.stdout}${r.stderr}`.split("\n").filter((l) => l.includes("pied/contact") || l.includes("drapeau ligne"));
}
const CONFIG_PARC = 'export const SITE_CONFIG = { name: "Site", phone: "", ligne: false };';
const PIED_FAUTIF = `import { Phone, Mail } from "lucide-react";
import { phoneHref } from "@/data/config";
export function Footer() {
  return (
    <footer>
      <a href="/#formulaire" className="flex"><Phone className="h-4 w-4" /> Rappel</a>
      <a href={phoneHref() ?? undefined}>Appeler</a>
      <p>Lundi au vendredi, 8:00 - 18:00</p>
    </footer>
  );
}`;
const CONTACT_FAUTIF = `export default function Contact() {
  return <a href={\`tel:\${"021 000 00 00"}\`}>Appeler</a>;
}`;
const PIED_PROPRE = `import { Phone as IconeTel } from "lucide-react";
import { telephone } from "@/data/navigation";
import { HorairesIntervention } from "@/components/socle/HorairesIntervention";
export function Footer() {
  const tel = telephone();
  return (
    <footer>
      {tel && (
        <a href={tel} className="flex"><IconeTel className="h-4 w-4" /> Appeler</a>
      )}
      <HorairesIntervention />
      <p>Intervention : lundi au samedi, 7h30 - 20h00</p>
      <p>Premier entretien d'1h à 1h30</p>
    </footer>
  );
}`;
const fautif = { "src/data/config.ts": CONFIG_PARC, "src/components/layout/Footer.tsx": PIED_FAUTIF, "src/pages/Contact.tsx": CONTACT_FAUTIF };
const vu = gardeSite(actuel, fautif);
constat(vu.some((l) => /Footer.tsx passe par phoneHref/.test(l)) && vu.some((l) => /Contact.tsx ecrit un lien tel:/.test(l)),
  "garde, parc : tel: hors telephone() refuse, au pied et au contact");
constat(vu.some((l) => /ligne 6 : icone Phone sur un lien qui n'appelle pas/.test(l)), "garde, parc : icone de telephone sur un lien vers le formulaire, refusee");
constat(vu.some((l) => /ligne 8 : horaire d'appel/.test(l)), "garde, parc : horaire d'appel non etiquete, refuse");
const propre = gardeSite(actuel, { "src/data/config.ts": CONFIG_PARC, "src/components/layout/Footer.tsx": PIED_PROPRE, "src/pages/Contact.tsx": "export default () => null;" });
constat(propre.length === 0, `garde, parc : telephone(), icone sur le lien tel, horaire etiquete : accepte (${propre.length} defaut)`);
const batiment = gardeSite(actuel, { ...fautif, "src/data/config.ts": 'export const SITE_CONFIG = { name: "Site", phone: "" };' });
constat(batiment.length === 0, "garde, batiment (sans drapeau ligne) : mesure eteinte, rien ne change");
const vieuxVu = gardeSite(ancien, fautif);
constat(vieuxVu.length === 0, `contre-epreuve ${refAncienne} : l'ancienne garde laisse passer les trois defauts du pied et du contact`);

/* 7. Drapeau obligatoire au parc, creneaux de rappel d'un champ. */
const PAQUET = (nom) => JSON.stringify({ name: `@workspace/${nom}` });
const CONFIG_SANS = 'export const SITE_CONFIG = { name: "Site", phone: "" };';
const parcSans = gardeSite(actuel, { "package.json": PAQUET("helvetique-jardin"), "src/data/config.ts": CONFIG_SANS });
constat(parcSans.some((l) => /site du parc \(@workspace\/helvetique-jardin\) sans drapeau ligne/.test(l)), "garde : paquet du parc sans drapeau ligne, refuse");
const parcAvec = gardeSite(actuel, { "package.json": PAQUET("helvetique-jardin"), "src/data/config.ts": CONFIG_PARC });
constat(parcAvec.length === 0, "garde : paquet du parc avec ligne: false, accepte");
const batSans = gardeSite(actuel, { "package.json": PAQUET("helvetique-plomberie"), "src/data/config.ts": CONFIG_SANS, "src/components/layout/Footer.tsx": PIED_FAUTIF });
constat(batSans.length === 0, "garde : paquet du batiment sans drapeau, mesure eteinte");
constat(gardeSite(ancien, { "package.json": PAQUET("helvetique-jardin"), "src/data/config.ts": CONFIG_SANS }).length === 0,
  `contre-epreuve ${refAncienne} : l'ancienne garde accepte un paquet du parc sans drapeau`);
const CRENEAUX = `export default function Contact() {
  return (
    <form>
      <select name="creneau"><option value="matin">Matin (8h-12h)</option></select>
      <SelectItem value="soir">Soir (17h–19h)</SelectItem>
    </form>
  );
}`;
const TEXTE_HORAIRE = "export default function Contact() {\n  return <p>Rappel le matin (8h-12h)</p>;\n}";
const avecCreneaux = { "package.json": PAQUET("helvetique-jardin"), "src/data/config.ts": CONFIG_PARC, "src/pages/Contact.tsx": CRENEAUX };
constat(gardeSite(actuel, avecCreneaux).length === 0, "garde : creneaux de rappel en options d'un champ, acceptes");
constat(gardeSite(actuel, { ...avecCreneaux, "src/pages/Contact.tsx": TEXTE_HORAIRE }).some((l) => /ligne 2 : horaire d'appel/.test(l)),
  "garde : le meme creneau ecrit dans le texte, refuse");
const avantCreneaux = extraire("f4ea14f");
constat(gardeSite(avantCreneaux, avecCreneaux).length === 2, "contre-epreuve f4ea14f : la mesure 7 d'avant refusait les deux options");
constat(gardeSite(ancien, { ...avecCreneaux, "src/pages/Contact.tsx": TEXTE_HORAIRE }).length === 0,
  `contre-epreuve ${refAncienne} : l'ancienne garde laisse passer l'horaire ecrit`);

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.0 tiennent, contre-epreuves comprises.");
