#!/usr/bin/env node
/**
 * Fabrique `socle/batiment/MANIFESTE.json` a partir des fichiers du socle.
 *
 * Le manifeste porte, pour chaque fichier : sa place dans le socle (`source`),
 * sa place dans un site (`chemin`), et l'empreinte de son contenu NORMALISE,
 * zones libres retirees. C'est cette empreinte que la garde recalcule dans le
 * build de chaque site, hors ligne.
 *
 * A relancer APRES toute modification d'un fichier du socle :
 *   node ops/garde-socle/manifeste.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { empreinte } from "./verifier.mjs";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const socle = path.join(racine, "socle/batiment");

/** Les fichiers du socle, et leur place dans un site du batiment. */
const FICHIERS = [
  { source: "src/components/layout/Header.tsx", chemin: "src/components/layout/Header.tsx" },
  { source: "src/components/layout/StickyMobileCTA.tsx", chemin: "src/components/layout/StickyMobileCTA.tsx" },
  { source: "src/components/socle/CanalWhatsapp.tsx", chemin: "src/components/socle/CanalWhatsapp.tsx" },
  { source: "src/components/socle/BlocConsentement.tsx", chemin: "src/components/socle/BlocConsentement.tsx" },
  { source: "src/data/navigation.ts", chemin: "src/data/navigation.ts" },
  { source: "src/lib/api.ts", chemin: "src/lib/api.ts" },
  { source: "scripts/socle-404.mjs", chemin: "scripts/socle-404.mjs" },
  { source: "deploy/csp-batiment.conf", chemin: "deploy/csp-batiment.conf" },
  { source: "../../ops/garde-socle/verifier.mjs", chemin: "scripts/garde-socle.mjs" },
];

const fichiers = FICHIERS.map((f) => {
  const p = path.join(socle, f.source);
  if (!fs.existsSync(p)) {
    console.error(`manifeste : fichier du socle introuvable : ${f.source}`);
    process.exit(1);
  }
  return { ...f, empreinte: empreinte(fs.readFileSync(p, "utf8")) };
});

const manifeste = {
  socle: "batiment",
  version: 1,
  note:
    "Empreintes du contenu normalise (zones libres retirees). " +
    "Refaire avec: node ops/garde-socle/manifeste.mjs",
  fichiers,
};

const sortie = path.join(socle, "MANIFESTE.json");
fs.writeFileSync(sortie, `${JSON.stringify(manifeste, null, 2)}\n`, "utf8");
console.log(`MANIFESTE.json ecrit : ${fichiers.length} fichiers`);
