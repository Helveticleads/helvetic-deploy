#!/usr/bin/env node
/**
 * PREUVE : la garde refuse un `<form` qui ne passe pas par `submitLead`, et la
 * contre-epreuve montre que la garde d'avant le laissait passer.
 *
 * Usage :
 *   node ops/garde-socle/preuve-formulaire-envoi.mjs [ref-ancienne]   (defaut : v1.3.0)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifier } from "./verifier.mjs";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.3.0";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "preuve-formulaire-"));
const ancienne = path.join(tmp, "verifier-ancien.mjs");
fs.writeFileSync(ancienne, execFileSync("git", ["-C", racine, "show", `${refAncienne}:ops/garde-socle/verifier.mjs`]));
const { verifier: verifierAncien } = await import(ancienne);

function site(nom, contenu) {
  const dir = path.join(tmp, nom);
  fs.mkdirSync(path.join(dir, "src/pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/pages/Kontakt.tsx"), contenu);
  return dir;
}
const MUET = `export default () => <form onSubmit={() => setLocation("/danke")}><button /></form>;`;
const ENVOIE = `export default () => <form onSubmit={() => submitLead(construireCharge({}))}><button /></form>;`;
const SANS_FORM = `export default () => <p>Kontakt</p>;`;

const manifeste = { fichiers: [] };
const signale = (v, dir) => v({ site: dir, manifeste }).defauts.some((d) => d.includes("ne passent pas par submitLead") && d.includes("Kontakt.tsx"));
const cas = [
  ["form muet, garde neuve", signale(verifier, site("a", MUET)), true],
  ["form muet, garde ancienne", signale(verifierAncien, site("b", MUET)), false],
  ["form qui envoie, garde neuve", signale(verifier, site("c", ENVOIE)), false],
  ["sans form, garde neuve", signale(verifier, site("d", SANS_FORM)), false],
];
fs.rmSync(tmp, { recursive: true, force: true });
let echec = 0;
for (const [nom, obtenu, attendu] of cas) {
  console.log(`${obtenu === attendu ? "ok" : "ECHEC"} ${nom} : signale=${obtenu}`);
  if (obtenu !== attendu) echec = 1;
}
if (echec) process.exit(1);
console.log("PREUVE_OK un formulaire qui n'envoie rien est refuse, contre-epreuve sur", refAncienne);
