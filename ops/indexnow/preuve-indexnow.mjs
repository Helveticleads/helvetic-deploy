#!/usr/bin/env node
/**
 * PREUVE : IndexNow dans la chaine de deploiement.
 *
 * Aucune requete vers api.indexnow.org : fetch est surveille pendant toute la
 * preuve et toute adresse indexnow.org fait echouer la preuve. Les envois
 * vont a un serveur local qui enregistre ce qu'il recoit.
 *
 * Etablit : diff de sitemaps (ajoutees, modifiees, retirees, premier passage),
 * plafond 10 000, filtre du domaine, corps JSON du POST, fichier cle verifie
 * avant l'envoi, echec non bloquant (code 0), refus depuis une PR et hors
 * deploiement reel, table des cles, et forme des etapes du workflow.
 *
 * Usage : node ops/indexnow/preuve-indexnow.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleDuDomaine, differences, envoyer, lireSitemap, lot, PLAFOND } from "./indexnow.mjs";

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, "../..");
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preuve-indexnow-")));
let echecs = 0;
const constat = (ok, texte) => { console.log(`${ok ? "OK  " : "ECHEC"} ${texte}`); if (!ok) echecs += 1; };

/* Garde-fou : aucune requete vers indexnow.org depuis ce processus. */
const fetchReel = globalThis.fetch;
const versIndexnow = [];
const hoteIndexnow = (u) => { try { const h = new URL(String(u)).hostname; return h === "indexnow.org" || h.endsWith(".indexnow.org"); } catch { return false; } };
globalThis.fetch = (u, o) => { if (hoteIndexnow(u)) { versIndexnow.push(String(u)); return Promise.reject(new Error("interdit en preuve")); } return fetchReel(u, o); };

/* Serveur local : /indexnow (POST) et /<cle>.txt. */
const D = "helvetic-dachdecker.ch";
const CLE = cleDuDomaine(D);
const etat = { recus: [], codePost: 200, cleServie: CLE };
const serveur = http.createServer((req, res) => {
  let corps = "";
  req.on("data", (c) => (corps += c));
  req.on("end", () => {
    if (req.method === "POST" && req.url === "/indexnow") { etat.recus.push({ type: req.headers["content-type"], corps: JSON.parse(corps) }); res.writeHead(etat.codePost); return res.end(); }
    if (req.url === `/${CLE}.txt` && etat.cleServie !== null) { res.writeHead(200); return res.end(etat.cleServie); }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => serveur.listen(0, "127.0.0.1", r));
const LOCAL = `http://127.0.0.1:${serveur.address().port}`;
const ENV = { INDEXNOW_ENDPOINT: `${LOCAL}/indexnow`, INDEXNOW_BASE_SITE: LOCAL, GITHUB_EVENT_NAME: "workflow_dispatch" };

const U = (p) => `https://${D}${p}`;
const SM = (entrees) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entrees.map(([l, m]) => `<url><loc>${l}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}</url>`).join("")}</urlset>`;
function cas({ avant, apres, clePresente = true }) {
  const d = fs.mkdtempSync(path.join(tmp, "c-"));
  fs.mkdirSync(path.join(d, "avant"));
  if (avant !== undefined) fs.writeFileSync(path.join(d, "avant/sitemap.xml"), avant);
  if (clePresente) fs.writeFileSync(path.join(d, "avant/cle-presente"), "");
  fs.writeFileSync(path.join(d, "sitemap.xml"), apres);
  return { domaine: D, nouveau: path.join(d, "sitemap.xml"), avant: path.join(d, "avant") };
}
const capture = async (f) => { const l = console.log, out = []; console.log = (...a) => out.push(a.join(" ")); try { return { r: await f(), out: out.join("\n") }; } finally { console.log = l; } };

/* 1. Diff de sitemaps */
const AVANT = SM([[U("/"), "2026-11-01"], [U("/a/"), "2026-11-01"], [U("/b/"), null], [U("/vieux/"), null]]);
const APRES = SM([[U("/"), "2026-11-01"], [U("/a/"), "2026-11-12"], [U("/b/"), null], [U("/neuf/"), null]]);
const diff = differences(lireSitemap(AVANT), lireSitemap(APRES));
constat(JSON.stringify([diff.ajoutees, diff.modifiees, diff.retirees]) === JSON.stringify([[U("/neuf/")], [U("/a/")], [U("/vieux/")]]),
  "diff : /neuf/ ajoutee, /a/ modifiee (lastmod), /vieux/ retiree, / et /b/ inchangees");
constat(differences(null, lireSitemap(APRES)).ajoutees.length === 4, "diff sans sitemap avant : tout le sitemap");
constat(lireSitemap("<sitemapindex></sitemapindex>") === null && lireSitemap(null) === null, "sitemap illisible ou sitemapindex : null, pas d'exception");
constat(lireSitemap(SM([[`${U("/x/")}?a=1&amp;b=2`, null]])).has(`${U("/x/")}?a=1&b=2`), "entites XML decodees dans <loc>");
constat(lireSitemap(SM([[`${U("/y/")}?q=&amp;lt;`, null]])).has(`${U("/y/")}?q=&lt;`), "entites decodees une seule fois (&amp;lt; donne &lt;)");

/* 2. Plafond et filtre du domaine */
const beaucoup = { premier: true, ajoutees: Array.from({ length: 12000 }, (_, i) => U(`/p${i}/`)), modifiees: [], retirees: [] };
const l1 = lot(beaucoup, D);
constat(l1.urlList.length === PLAFOND && PLAFOND === 10000 && l1.tronquees === 2000, "plafond : 12 000 adresses -> 10 000 envoyees, 2 000 signalees tronquees");
const l2 = lot({ ajoutees: [U("/a/"), "https://autre.ch/a/", `http://${D}/b/`, `https://www.${D}/c/`, U("/a/")], modifiees: [], retirees: [] }, D);
constat(JSON.stringify(l2.urlList) === JSON.stringify([U("/a/"), `https://www.${D}/c/`]) && l2.horsDomaine === 2, "filtre : autre domaine et http ecartes, doublon retire");

/* 3. Envoi simule : corps du POST */
let x = await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES }), env: ENV }));
const r0 = etat.recus[0];
constat(x.r === "ok" && etat.recus.length === 1 && /application\/json/.test(r0.type) && r0.corps.host === D && r0.corps.key === CLE
  && r0.corps.keyLocation === `https://${D}/${CLE}.txt` && JSON.stringify(r0.corps.urlList) === JSON.stringify([U("/neuf/"), U("/a/"), U("/vieux/")]),
  "envoi simule : POST JSON host, key, keyLocation, urlList = ajoutee + modifiee + retiree");
constat(/INDEXNOW_OK HTTP 200 adresses=3/.test(x.out), "journal : INDEXNOW_OK HTTP 200 adresses=3");

/* 4. Premier passage : release servie sans fichier cle, ou sans sitemap */
etat.recus = [];
await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES, clePresente: false }), env: ENV }));
await capture(() => envoyer({ ...cas({ apres: APRES }), env: ENV }));
constat(etat.recus.length === 2 && etat.recus.every((r) => r.corps.urlList.length === 4), "premier passage (cle absente avant, ou sitemap absent) : tout le sitemap");

/* 5. Rien a signaler : aucun POST */
etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: APRES, apres: APRES }), env: ENV }));
constat(x.r === "rien" && etat.recus.length === 0, "sitemaps identiques : aucun envoi");

/* 6. Echecs non bloquants */
etat.codePost = 500; etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES }), env: ENV }));
constat(x.r === "avertissement" && /::warning title=IndexNow::INDEXNOW_AVERTISSEMENT reponse HTTP 500/.test(x.out), "HTTP 500 d'IndexNow : avertissement journalise");
etat.codePost = 200; etat.cleServie = "autre-chose"; etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES }), env: ENV }));
constat(x.r === "avertissement" && etat.recus.length === 0 && /fichier cle non servi/.test(x.out), "fichier cle non servi tel quel : avertissement, aucun POST");
etat.cleServie = CLE;
const cli = (env, c) => new Promise((ok) => {
  const p = spawn("node", [path.join(ici, "indexnow.mjs"), "envoyer", "--domaine", c.domaine, "--nouveau", c.nouveau, "--avant", c.avant], { env: { PATH: process.env.PATH, ...env } });
  let o = ""; p.stdout.on("data", (d) => (o += d)); p.stderr.on("data", (d) => (o += d)); p.on("close", (code) => ok({ code, o }));
});
const ferme = await new Promise((ok) => { const s = http.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
let c = await cli({ ...ENV, INDEXNOW_ENDPOINT: `http://127.0.0.1:${ferme}/indexnow` }, cas({ avant: AVANT, apres: APRES }));
constat(c.code === 0 && /INDEXNOW_AVERTISSEMENT envoi echoue/.test(c.o), "IndexNow injoignable (CLI) : code 0, avertissement");
etat.codePost = 500;
c = await cli(ENV, cas({ avant: AVANT, apres: APRES }));
constat(c.code === 0 && /HTTP 500/.test(c.o), "HTTP 500 (CLI) : code 0");
etat.codePost = 200;
c = await cli(ENV, { domaine: D, nouveau: path.join(tmp, "absent.xml"), avant: path.join(tmp, "absent") });
constat(c.code === 0 && /sitemap du build illisible/.test(c.o), "sitemap du build absent (CLI) : code 0, avertissement");

/* 7. Jamais depuis une PR, jamais hors deploiement reel */
etat.recus = [];
for (const ev of ["pull_request", "pull_request_target"]) {
  x = await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES }), env: { ...ENV, GITHUB_EVENT_NAME: ev } }));
  constat(x.r === "refus" && etat.recus.length === 0, `evenement ${ev} : refus, aucun envoi`);
}
x = await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES }), env: { GITHUB_EVENT_NAME: "workflow_dispatch", INDEXNOW_BASE_SITE: LOCAL } }));
constat(x.r === "refus" && versIndexnow.length === 0, "adresse reelle sans INDEXNOW_DEPLOIEMENT_REEL=1 : refus avant tout appel");
x = await capture(() => envoyer({ domaine: "exemple-inconnu.ch", nouveau: "x", avant: "x", env: ENV }));
constat(x.r === "skip", "domaine absent de cles.json : rien n'est fait");

/* 8. Table des cles */
const table = JSON.parse(fs.readFileSync(path.join(ici, "cles.json"), "utf8"));
const v = Object.values(table);
constat(v.length >= 58 && new Set(v).size === v.length && v.every((k) => /^[0-9a-f]{32}$/.test(k)), `cles.json : ${v.length} domaines, une cle distincte par site, 32 hex`);
constat(cleDuDomaine(`www.${D.toUpperCase()}`) === CLE, "cle trouvee quel que soit www. ou la casse");

/* 9. Forme des etapes du workflow */
const wf = fs.readFileSync(path.join(racine, ".github/workflows/deploy-infomaniak.yml"), "utf8");
const blocs = wf.split(/\n(?= {6}- name: )/).filter((b) => /^ {6}- name: IndexNow/.test(b));
const nom = (b) => /- name: (.+)/.exec(b)[1];
constat(blocs.length === 3 && blocs.every((b) => /\n {8}continue-on-error: true\n/.test(b) && /startsWith\(github\.event_name, 'pull_request'\)/.test(b)),
  "workflow : 3 etapes IndexNow, toutes continue-on-error et exclues pour pull_request");
const envoi = blocs.find((b) => /envoyer/.test(b));
constat(/if: \$\{\{ success\(\) && !startsWith\(github\.event_name, 'pull_request'\) && inputs\.preuve_sabotage_retire == '' \}\}/.test(envoi) && /INDEXNOW_DEPLOIEMENT_REEL: "1"/.test(envoi),
  "workflow : envoi apres succes seulement, hors preuve de sabotage, seul porteur de INDEXNOW_DEPLOIEMENT_REEL");
const pos = (n) => wf.indexOf(`- name: ${n}`);
constat(pos(nom(blocs[1])) < pos("Deploiement atomique gaté") && pos("Deploiement atomique gaté") < pos(nom(envoi)),
  "workflow : fichier cle pose avant le rsync, envoi apres la bascule");
constat((wf.match(/INDEXNOW_DEPLOIEMENT_REEL/g) || []).length === 1, "workflow : INDEXNOW_DEPLOIEMENT_REEL n'apparait qu'une fois");

constat(versIndexnow.length === 0, "aucune requete vers indexnow.org pendant toute la preuve");
serveur.close();
fs.rmSync(tmp, { recursive: true, force: true });
if (echecs > 0) { console.error(`\n${echecs} constat(s) en echec`); process.exit(1); }
console.log("\nPREUVE_INDEXNOW_OK");
