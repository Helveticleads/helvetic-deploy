#!/usr/bin/env node
/**
 * PREUVE : v1.6.7 (trou releve par AUDIT, decision de Frederic du 11.11).
 *
 * La garde des pages controle les <link rel="alternate" hreflang> :
 *   - MEME domaine : comme le canonical, forme du reglage slashFinal ET page
 *     presente dans le build ; la balise de la langue de la page egale le
 *     canonical ; aucun parametre ;
 *   - AUTRE domaine (jumeau FR/DE) : absolue, https, sans parametre (son etat
 *     reel se mesure en ligne, pas au build) ;
 *   - meme hreflang deux fois sur une page : rouge.
 * Cas reel (en ligne le 11.11) : helvetic-rohrreinigung.ch/kantone/, canonical
 * /kantone/, de-CH et x-default vers /kantone (sans « / »).
 * Contre-epreuve : la v1.6.6 laissait passer chaque cas fautif.
 *
 * Aucun reseau, aucun site reel : des dossiers jetables.
 *
 * Usage :
 *   node ops/garde-socle/preuve-v1-6-7.mjs [ref-ancienne]   (defaut : v1.6.6)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const refAncienne = process.argv[2] ?? "v1.6.6";
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-v1-6-7-")));
let echecs = 0;
const constat = (ok, texte) => {
  console.log(`${ok ? "OK  " : "ECHEC"} ${texte}`);
  if (!ok) echecs += 1;
};
const ancienneGarde = path.join(tmp, "ancienne-verifier.mjs");
fs.writeFileSync(ancienneGarde, execFileSync("git", ["-C", racine, "show", `${refAncienne}:ops/garde-socle/verifier.mjs`]));
const garde = path.join(racine, "ops/garde-socle/verifier.mjs");

const D = "https://helvetique-exemple.ch";
const JUMEAU = "https://helvetic-beispiel.ch";
const NUM = "021 000 00 00";
const H = "Lun-ven 10 h - 19 h";
const ENTETE = `<header><a href="tel:+41210000000">${NUM}</a><span>${H}</span></header>`;
const BARRE = `<div class="fixed inset-x-0 bottom-0 z-40 border-t"><p><a href="tel:+41210000000">${NUM}</a><span> · ${H}</span></p></div>`;
const lien = (l, h) => `<link rel="alternate" hrefLang="${l}" href="${h}"/>`;
const PAGE = (canonical, alternates) => `<html lang="fr"><head><link rel="canonical" href="${canonical}"/>${alternates.map(([l, h]) => lien(l, h)).join("")}</head><body>${ENTETE}<main><p>x</p></main><footer>pied</footer>${BARRE}</body></html>`;

/* Un mini-site : accueil, /services, /contact ; la page /services porte les hreflang donnes. */
function site(slash, alternates, canonicalServices) {
  const d = fs.mkdtempSync(path.join(tmp, "s-"));
  const f = (c) => (slash ? `${c}/` : c);
  const fichiers = {
    "src/data/config.ts": `export const SITE_CONFIG = { name: "Site", phone: "${NUM}", phoneMention: "${H}", domainBare: "helvetique-exemple.ch", slashFinal: ${slash} };`,
    "dist/public/index.html": PAGE(`${D}/`, [["fr-CH", `${D}/`], ["de-CH", `${JUMEAU}/`], ["x-default", `${D}/`]]),
    "dist/public/services/index.html": PAGE(canonicalServices ?? `${D}${f("/services")}`, alternates),
    "dist/public/contact/index.html": PAGE(`${D}${f("/contact")}`, []).replace("<p>x</p>", `<p>Téléphone : ${NUM}, ${H}</p>`),
    "dist/public/sitemap.xml": `<?xml version="1.0"?><urlset><url><loc>${D}/</loc></url><url><loc>${D}${f("/services")}</loc></url></urlset>`,
  };
  for (const [n, c] of Object.entries(fichiers)) { fs.mkdirSync(path.dirname(path.join(d, n)), { recursive: true }); fs.writeFileSync(path.join(d, n), c); }
  return d;
}
const pages = (verifier, d) => { const r = spawnSync("node", [verifier, d, "--pages", "dist/public"], { encoding: "utf8" }); return { vert: r.status === 0, sortie: `${r.stdout}${r.stderr}` }; };
const bon = (slash) => {
  const s = slash ? "/services/" : "/services";
  return [["fr-CH", `${D}${s}`], ["de-CH", `${JUMEAU}/leistungen${slash ? "/" : ""}`], ["x-default", `${D}${s}`]];
};

/* 1. La bonne forme, dans les deux reglages : vert. */
for (const slash of [true, false]) {
  const r = pages(garde, site(slash, bon(slash)));
  constat(r.vert, `slashFinal: ${slash}, hreflang a la bonne forme (meme domaine = canonical, jumeau absolu https) : vert`);
  if (!r.vert) console.log(r.sortie);
}

/* 2. Chaque cas fautif : rouge, page et balise nommees ; la v1.6.6 le laissait passer. */
const CAS = [
  ["hreflang sans « / » avec slashFinal: true (cas reel rohrreinigung /kantone/)", true,
    [["fr-CH", `${D}/services`], ["de-CH", `${JUMEAU}/leistungen/`], ["x-default", `${D}/services`]], "hreflang qui n'a pas la forme du reglage slashFinal: true", "fr-CH https://helvetique-exemple.ch/services"],
  ["hreflang avec « / » avec slashFinal: false", false,
    [["fr-CH", `${D}/services/`], ["de-CH", `${JUMEAU}/leistungen`], ["x-default", `${D}/services`]], "hreflang qui n'a pas la forme du reglage slashFinal: false", "fr-CH https://helvetique-exemple.ch/services/"],
  ["x-default seul sans « / » avec slashFinal: true", true,
    [["fr-CH", `${D}/services/`], ["x-default", `${D}/services`]], "hreflang qui n'a pas la forme du reglage slashFinal: true", "x-default https://helvetique-exemple.ch/services"],
  ["chemin inexistant dans le build (ancienne adresse), slashFinal: true", true,
    [["fr-CH", `${D}/services/`], ["x-default", `${D}/zones/`]], "hreflang vers une page absente du build", "x-default https://helvetique-exemple.ch/zones/"],
  ["chemin inexistant dans le build, slashFinal: false", false,
    [["fr-CH", `${D}/services`], ["x-default", `${D}/zones`]], "hreflang vers une page absente du build", "x-default https://helvetique-exemple.ch/zones"],
  ["balise de la langue de la page vers une AUTRE page du build", true,
    [["fr-CH", `${D}/contact/`], ["x-default", `${D}/services/`]], "hreflang de la langue de la page different du canonical", "fr-CH https://helvetique-exemple.ch/contact/"],
  ["balise de la langue de la page vers une autre page, slashFinal: false", false,
    [["fr-CH", `${D}/contact`], ["x-default", `${D}/services`]], "hreflang de la langue de la page different du canonical", "fr-CH https://helvetique-exemple.ch/contact"],
  ["hreflang en double (fr-CH deux fois)", true,
    [["fr-CH", `${D}/services/`], ["fr-CH", `${D}/services/`], ["x-default", `${D}/services/`]], "hreflang en double sur la page", "fr-ch x2"],
  ["hreflang en double, casse differente, slashFinal: false", false,
    [["de-CH", `${JUMEAU}/leistungen`], ["de-ch", `${JUMEAU}/leistungen`], ["fr-CH", `${D}/services`]], "hreflang en double sur la page", "de-ch x2"],
  ["hreflang relatif (non absolu)", true,
    [["fr-CH", "/services/"], ["x-default", `${D}/services/`]], "hreflang dont l'adresse n'est pas absolue en https", "fr-CH /services/"],
  ["jumeau en http", true,
    [["fr-CH", `${D}/services/`], ["de-CH", "http://helvetic-beispiel.ch/leistungen/"]], "hreflang dont l'adresse n'est pas absolue en https", "de-CH http://helvetic-beispiel.ch/leistungen/"],
  ["jumeau avec parametre", false,
    [["fr-CH", `${D}/services`], ["de-CH", `${JUMEAU}/leistungen?lang=de`]], "hreflang vers un autre domaine avec parametre", "de-CH https://helvetic-beispiel.ch/leistungen?lang=de"],
  ["meme domaine avec parametre", true,
    [["fr-CH", `${D}/services/`], ["x-default", `${D}/services/?ref=x`]], "hreflang avec parametre ou ancre", "x-default https://helvetique-exemple.ch/services/?ref=x"],
];
for (const [libelle, slash, alternates, cle, extrait] of CAS) {
  const d = site(slash, alternates);
  const r = pages(garde, d);
  const l = r.sortie.split("\n"); const i = l.findIndex((x) => x.includes(`liens:${cle}`));
  const nomme = i >= 0 && l.slice(i, i + 3).join(" ").includes("services/index.html") && l.slice(i, i + 3).join(" ").includes(extrait);
  constat(!r.vert && nomme, `${libelle} : rouge, page et balise nommees`);
  if (!(!r.vert && nomme)) console.log(r.sortie);
  constat(pages(ancienneGarde, d).vert, `  contre-epreuve ${refAncienne} : il passait`);
}

/* 3. Le reglage inverse rend rouge un site coherent (la garde lit bien le reglage). */
for (const slash of [true, false]) {
  const d = site(slash, bon(slash));
  fs.writeFileSync(path.join(d, "src/data/config.ts"), fs.readFileSync(path.join(d, "src/data/config.ts"), "utf8").replace(`slashFinal: ${slash}`, `slashFinal: ${!slash}`));
  constat(/liens:hreflang qui n'a pas la forme du reglage/.test(pages(garde, d).sortie), `site coherent en slashFinal: ${slash}, garde avec la valeur inverse : hreflang rouge`);
}

const man = JSON.parse(fs.readFileSync(path.join(racine, "socle/batiment/MANIFESTE.json"), "utf8"));
constat(man.version === 11, `manifeste : version ${man.version} (attendu 11)`);

fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) {
  console.error(`\n${echecs} constat(s) en echec`);
  process.exit(1);
}
console.log("\nToutes les preuves de la v1.6.7 tiennent, contre-epreuves comprises.");
