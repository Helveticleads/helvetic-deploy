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
 * deploiement reel, cle calculee (stable, distincte par domaine, masquee),
 * secret absent = SKIP, aucune liste ni aucun domaine du reseau dans le depot,
 * et forme des etapes du workflow. Domaines d'exemple seulement.
 *
 * Usage : node ops/indexnow/preuve-indexnow.mjs
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleDuDomaine, differences, envoyer, lastmodUniforme, lireSitemap, lot, PLAFOND } from "./indexnow.mjs";

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
const D = "exemple.ch";
const SECRET = "secret-de-preuve-sans-valeur";
const CLE = cleDuDomaine(D, SECRET);
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
const ENV = { INDEXNOW_ENDPOINT: `${LOCAL}/indexnow`, INDEXNOW_BASE_SITE: LOCAL, GITHUB_EVENT_NAME: "workflow_dispatch", INDEXNOW_SECRET: SECRET };

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
const lignes = x.out.split("\n");
constat(lignes[0] === `::add-mask::${CLE}` && lignes.slice(1).every((l) => !l.includes(CLE)), "cle masquee (::add-mask::) avant toute autre ligne, et absente du reste du journal");

/* 4. Premier passage : release servie sans fichier cle, ou sans sitemap */
etat.recus = [];
await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES, clePresente: false }), env: ENV }));
await capture(() => envoyer({ ...cas({ apres: APRES }), env: ENV }));
constat(etat.recus.length === 2 && etat.recus.every((r) => r.corps.urlList.length === 4), "premier passage (cle absente avant, ou sitemap absent) : tout le sitemap");

/* 5. Rien a signaler : aucun POST */
etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: APRES, apres: APRES }), env: ENV }));
constat(x.r === "rien" && etat.recus.length === 0, "sitemaps identiques : aucun envoi");

/* 5 bis. Lastmod uniforme (date du build) : modifiees ignorees */
const UNI = (d, pages) => SM(pages.map((p) => [U(p), d]));
const envoyees = () => etat.recus.flatMap((r) => r.corps.urlList);
const NOTICE = /::notice title=IndexNow::INDEXNOW_LASTMOD_UNIFORME/;
etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: UNI("2026-11-11", ["/", "/a/"]), apres: UNI("2026-11-12", ["/", "/a/", "/neuf/"]) }), env: ENV }));
constat(x.r === "ok" && JSON.stringify(envoyees()) === JSON.stringify([U("/neuf/")]) && NOTICE.test(x.out), "lastmod uniforme sur 3 adresses dont 1 ajoutee : 1 envoyee, notice INDEXNOW_LASTMOD_UNIFORME");
constat(x.out.split("\n").filter((l) => NOTICE.test(l)).every((l) => !l.includes(D) && !l.includes(CLE)), "notice sans domaine ni cle");
etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: UNI("2026-11-11", ["/", "/a/", "/b/"]), apres: UNI("2026-11-12", ["/", "/a/", "/b/"]) }), env: ENV }));
constat(x.r === "rien" && etat.recus.length === 0 && NOTICE.test(x.out), "lastmod uniforme sans changement d'adresse : 0 envoi");
etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: UNI("2026-11-11", ["/", "/a/"]), apres: UNI("2026-11-12", ["/", "/a/"]).replace("2026-11-12", "2026-11-01") }), env: ENV }));
constat(x.r === "ok" && envoyees().length === 2 && !NOTICE.test(x.out), "lastmod varies : les modifiees partent, pas de notice");
etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: UNI("2026-11-11", ["/", "/a/"]), apres: UNI("2026-11-12", ["/", "/a/", "/neuf/"]), clePresente: false }), env: ENV }));
constat(x.r === "ok" && envoyees().length === 3 && !NOTICE.test(x.out), "premier passage : tout le sitemap malgre un lastmod uniforme");
etat.recus = [];
x = await capture(() => envoyer({ ...cas({ avant: SM([[U("/"), null], [U("/a/"), null]]), apres: SM([[U("/"), null], [U("/a/"), null], [U("/neuf/"), null]]) }), env: ENV }));
constat(x.r === "ok" && JSON.stringify(envoyees()) === JSON.stringify([U("/neuf/")]) && !NOTICE.test(x.out), "sans lastmod : ajoutees et retirees seulement, comportement inchange");
constat(!lastmodUniforme(lireSitemap(UNI("2026-11-12", ["/"]))), "une seule adresse : pas de lastmod uniforme");

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
/* 8. Secret absent : SKIP, code 0 */
for (const s of [undefined, ""]) {
  x = await capture(() => envoyer({ ...cas({ avant: AVANT, apres: APRES }), env: { ...ENV, INDEXNOW_SECRET: s } }));
  constat(x.r === "skip" && /INDEXNOW_SKIP secret/.test(x.out), `secret ${s === undefined ? "absent" : "vide"} : INDEXNOW_SKIP`);
}
const { INDEXNOW_SECRET: _s, ...sansSecret } = ENV;
c = await cli(sansSecret, cas({ avant: AVANT, apres: APRES }));
constat(c.code === 0 && /INDEXNOW_SKIP/.test(c.o), "secret absent (CLI envoyer) : code 0, SKIP");
const cleCli = (env, d) => new Promise((ok) => { const p = spawn("node", [path.join(ici, "indexnow.mjs"), "cle", d], { env: { PATH: process.env.PATH, ...env } }); let o = ""; p.stdout.on("data", (b) => (o += b)); p.on("close", (code) => ok({ code, o })); });
const k0 = await cleCli({}, D);
constat(k0.code === 3 && k0.o === "", "secret absent (CLI cle) : code 3, rien sur la sortie, l'etape saute");

/* 9. Cle calculee */
const attendu = crypto.createHmac("sha256", SECRET).update(D).digest("hex").slice(0, 32);
constat(CLE === attendu && /^[0-9a-f]{32}$/.test(CLE), "cle = HMAC-SHA256(secret, domaine) en hex, 32 caracteres");
constat(cleDuDomaine(D, SECRET) === CLE && cleDuDomaine(`www.${D.toUpperCase()}`, SECRET) === CLE, "cle stable d'un appel a l'autre, quel que soit www. ou la casse");
const k1 = await cleCli({ INDEXNOW_SECRET: SECRET }, D), k2 = await cleCli({ INDEXNOW_SECRET: SECRET }, D);
constat(k1.code === 0 && k1.o === CLE && k2.o === CLE, "cle stable d'un processus a l'autre (deux deploiements)");
const autres = ["exemple.org", "autre-exemple.ch", "exemple.com"].map((d) => cleDuDomaine(d, SECRET));
constat(new Set([CLE, ...autres]).size === 4, "cle differente par domaine");
constat(cleDuDomaine(D, "autre-secret") !== CLE, "rotation : un autre secret donne une autre cle");

/* 10. Aucune liste ni aucun domaine du reseau dans le depot public */
constat(!fs.existsSync(path.join(ici, "cles.json")), "plus aucun cles.json");
const nouveaux = fs.readdirSync(ici).map((f) => [f, fs.readFileSync(path.join(ici, f), "utf8")]);
const reseau = /helvetic(?:que)?-[a-z-]+\.(?:ch|com)/i;
constat(nouveaux.every(([, t]) => !reseau.test(t)), `aucun domaine du reseau dans ops/indexnow (${nouveaux.length} fichiers)`);

/* 9. Forme des etapes du workflow */
const wf = fs.readFileSync(path.join(racine, ".github/workflows/deploy-infomaniak.yml"), "utf8");
const blocs = wf.split(/\n(?= {6}- name: )/).filter((b) => /^ {6}- name: IndexNow/.test(b));
const nom = (b) => /- name: (.+)/.exec(b)[1];
constat(blocs.every((b) => !reseau.test(b)), "workflow : aucun domaine du reseau dans les etapes IndexNow");
const prep = blocs.find((b) => /fichier cle/.test(b));
constat(prep.indexOf('echo "::add-mask::$CLE"') > 0 && prep.indexOf('echo "::add-mask::$CLE"') < prep.indexOf(`printf '%s' "$CLE"`) && !/CLE_POSEE \$/.test(prep),
  "workflow : cle masquee avant tout usage, nom du fichier cle jamais journalise");
constat(blocs.filter((b) => /INDEXNOW_SECRET: \$\{\{ secrets\.INDEXNOW_SECRET \}\}/.test(b)).length === 2, "workflow : le secret n'atteint que les deux etapes qui calculent la cle");
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
