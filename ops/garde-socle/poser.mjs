#!/usr/bin/env node
/**
 * Pose le socle batiment sur un site : copie les fichiers du manifeste a leur
 * place, et depose dans le site la garde et le manifeste des empreintes, pour
 * qu'il puisse se verifier hors ligne.
 *
 * Il ne touche a RIEN d'autre. Les quatre gestes qui restent a la main sont
 * ceux qui modifient des fichiers que le socle ne possede pas ; le script les
 * rappelle a la fin, et la garde les verifie ensuite par ses mesures d'effet.
 *
 * Usage :
 *   node ops/garde-socle/poser.mjs <chemin du paquet du site>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const socle = path.join(racine, "socle/batiment");

const cible = process.argv[2];
if (!cible) {
  console.error("Usage : node ops/garde-socle/poser.mjs <chemin du paquet du site>");
  process.exit(1);
}
const site = path.resolve(cible);
if (!fs.existsSync(path.join(site, "package.json"))) {
  console.error(`poser : ${site} ne ressemble pas a un paquet de site (package.json absent)`);
  process.exit(1);
}

const manifeste = JSON.parse(fs.readFileSync(path.join(socle, "MANIFESTE.json"), "utf8"));

/*
 * Les zones libres appartiennent au SITE, pas au gabarit. Reposer le socle sur
 * un site qui a rempli ses zones les ecraserait en silence, et le build
 * resterait vert : la garde retire justement ces zones avant de comparer. Le
 * script les GREFFE donc du site vers le gabarit, zone par zone, dans l'ordre.
 *
 * Quand le compte de zones differe entre le site et le gabarit, le fichier
 * n'est PAS ecrit : il n'y a aucune facon sure de deviner ce qui va ou. Le
 * script le dit et sort en erreur.
 */
const DEBUT_LIBRE = /\/\*\s*socle:libre:debut[^\n]*\*\//;
const FIN_LIBRE = /\/\*\s*socle:libre:fin\s*\*\//;
const DEBUT_LIBRE_DIESE = /^#\s*socle:libre:debut/;
const FIN_LIBRE_DIESE = /^#\s*socle:libre:fin/;

/** Les zones libres d'un texte, marqueurs compris, dans l'ordre. */
function zonesLibres(texte) {
  const lignes = texte.replace(/\r\n/g, "\n").split("\n");
  const zones = [];
  let courante = null;
  for (const ligne of lignes) {
    if (!courante && (DEBUT_LIBRE.test(ligne) || DEBUT_LIBRE_DIESE.test(ligne))) {
      courante = [ligne];
      continue;
    }
    if (courante) {
      courante.push(ligne);
      if (FIN_LIBRE.test(ligne) || FIN_LIBRE_DIESE.test(ligne)) {
        zones.push(courante.join("\n"));
        courante = null;
      }
    }
  }
  if (courante) throw new Error("zone libre ouverte et jamais refermee");
  return zones;
}

/** Le gabarit, avec les zones libres du site a la place des siennes. */
function greffer(gabarit, existant) {
  const duGabarit = zonesLibres(gabarit);
  const duSite = zonesLibres(existant);
  if (duGabarit.length === 0) return { texte: gabarit, greffes: 0 };
  if (duGabarit.length !== duSite.length) {
    return { ecart: `${duSite.length} zone(s) libre(s) dans le site, ${duGabarit.length} dans le gabarit` };
  }
  let sortie = "";
  let curseur = 0;
  for (let i = 0; i < duGabarit.length; i += 1) {
    const ou = gabarit.indexOf(duGabarit[i], curseur);
    sortie += gabarit.slice(curseur, ou) + duSite[i];
    curseur = ou + duGabarit[i].length;
  }
  return { texte: sortie + gabarit.slice(curseur), greffes: duGabarit.length };
}

let poses = 0;
const refuses = [];
for (const entree of manifeste.fichiers) {
  const source = path.join(socle, entree.source);
  const destination = path.join(site, entree.chemin);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const gabarit = fs.readFileSync(source, "utf8");
  if (entree.optionnel && !fs.existsSync(destination)) {
    console.log(`  saute ${entree.chemin} (optionnel, absent de ce site)`);
    continue;
  }
  if (!fs.existsSync(destination)) {
    fs.writeFileSync(destination, gabarit, "utf8");
    poses += 1;
    console.log(`  pose ${entree.chemin}`);
    continue;
  }
  const bilan = greffer(gabarit, fs.readFileSync(destination, "utf8"));
  if (bilan.ecart) {
    refuses.push(`${entree.chemin} : ${bilan.ecart}`);
    console.log(`  REFUSE ${entree.chemin} (${bilan.ecart})`);
    continue;
  }
  fs.writeFileSync(destination, bilan.texte, "utf8");
  poses += 1;
  console.log(
    bilan.greffes > 0
      ? `  pose ${entree.chemin} (${bilan.greffes} zone(s) libre(s) du site gardee(s))`
      : `  pose ${entree.chemin}`,
  );
}

fs.mkdirSync(path.join(site, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(site, "scripts/socle-manifeste.json"),
  `${JSON.stringify(manifeste, null, 2)}\n`,
  "utf8",
);
console.log("  pose scripts/socle-manifeste.json");

console.log(`\n${poses} fichiers poses sur ${path.basename(site)}.`);
console.log("\nIl reste quatre gestes a la main, sur des fichiers que le socle ne possede pas :");
console.log("  1. ajouter phoneMention a src/data/config.ts ;");
console.log("  2. monter BlocConsentement dans les formulaires du site ;");
console.log("  3. remplacer l'ecriture de la 404 par rendre404 dans scripts/prerender-content.mjs ;");
console.log("  4. ajouter `node ./scripts/garde-socle.mjs` en tete du script build.");
console.log("\nPuis : node scripts/garde-socle.mjs depuis le site.");

if (refuses.length > 0) {
  console.error("\nFICHIERS NON ECRITS, a reprendre a la main :");
  for (const r of refuses) console.error(`  - ${r}`);
  console.error(
    "\nLe gabarit et la copie du site n'ont pas le meme nombre de zones libres.\n" +
      "Ouvrir les deux, reporter le contenu des zones du site dans le gabarit, puis relancer.",
  );
  process.exit(1);
}
