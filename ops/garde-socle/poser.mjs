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

let poses = 0;
for (const entree of manifeste.fichiers) {
  const source = path.join(socle, entree.source);
  const destination = path.join(site, entree.chemin);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  poses += 1;
  console.log(`  pose ${entree.chemin}`);
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
