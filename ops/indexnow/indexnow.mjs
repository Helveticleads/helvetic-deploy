#!/usr/bin/env node
/**
 * IndexNow dans la chaine de deploiement (decision de Frederic du 11.11).
 *
 * Deux commandes, appelees par deploy-infomaniak.yml :
 *   cle <domaine>
 *       Ecrit la cle du domaine sur la sortie : HMAC-SHA256(INDEXNOW_SECRET,
 *       domaine) en hexadecimal, 32 caracteres. Aucune liste de domaines dans
 *       le depot (il est public). Code 3 si le secret est absent : IndexNow saute.
 *       Le workflow masque la cle (::add-mask::) avant tout usage.
 *   envoyer --domaine D --nouveau <sitemap.xml du build> --avant <dossier>
 *       Apres un deploiement reussi : compare le sitemap servi avant la bascule
 *       (<dossier>/sitemap.xml) au sitemap du build, et signale a IndexNow les
 *       adresses ajoutees, modifiees (lastmod) ou retirees. Au premier passage
 *       (aucun sitemap avant, ou la release servie ne portait pas le fichier cle,
 *       marque par <dossier>/cle-presente absent) : tout le sitemap.
 *       Plafond 10 000 adresses par envoi (limite d'IndexNow).
 *
 * JAMAIS BLOQUANT : toute erreur devient un avertissement journalise, code 0.
 * JAMAIS DEPUIS UNE PR : GITHUB_EVENT_NAME pull_request* refuse l'envoi, et
 * l'adresse reelle d'IndexNow n'est appelee que si INDEXNOW_DEPLOIEMENT_REEL=1
 * (pose par la seule etape de deploiement). Les preuves passent par
 * INDEXNOW_ENDPOINT et INDEXNOW_BASE_SITE vers un serveur local.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENDPOINT_REEL = "https://api.indexnow.org/indexnow";
export const PLAFOND = 10000;

export const normaliserDomaine = (d) => String(d || "").trim().toLowerCase().replace(/^www\./, "");

/** Cle du site, stable pour un meme secret et un meme domaine ; null sans secret. */
export function cleDuDomaine(domaine, secret = process.env.INDEXNOW_SECRET) {
  const d = normaliserDomaine(domaine);
  if (!secret || !d) return null;
  return crypto.createHmac("sha256", secret).update(d).digest("hex").slice(0, 32);
}

const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decoder = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITES[e]).trim();

/** <urlset> -> Map(loc -> lastmod|null). null si ce n'est pas un urlset lisible. */
export function lireSitemap(xml) {
  if (typeof xml !== "string" || !/<urlset[\s>]/.test(xml)) return null;
  const out = new Map();
  for (const [, bloc] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(bloc)?.[1];
    if (!loc) continue;
    out.set(decoder(loc), /<lastmod>([^<]+)<\/lastmod>/.exec(bloc)?.[1]?.trim() ?? null);
  }
  return out;
}

/** Adresses a signaler : ajoutees, modifiees, retirees ; tout si avant est null. */
export function differences(avant, apres) {
  if (!avant) return { premier: true, ajoutees: [...apres.keys()], modifiees: [], retirees: [] };
  const ajoutees = [], modifiees = [], retirees = [];
  for (const [loc, lm] of apres) {
    if (!avant.has(loc)) ajoutees.push(loc);
    else if (avant.get(loc) !== lm) modifiees.push(loc);
  }
  for (const loc of avant.keys()) if (!apres.has(loc)) retirees.push(loc);
  return { premier: false, ajoutees, modifiees, retirees };
}

const duDomaine = (u, domaine) => {
  try { const x = new URL(u); return x.protocol === "https:" && normaliserDomaine(x.hostname) === domaine; } catch { return false; }
};

/** Liste finale : adresses du domaine seulement, dedoublonnees, plafonnees. */
export function lot(diff, domaine, plafond = PLAFOND) {
  const d = normaliserDomaine(domaine);
  const toutes = [...new Set([...diff.ajoutees, ...diff.modifiees, ...diff.retirees])];
  const du = toutes.filter((u) => duDomaine(u, d));
  return { urlList: du.slice(0, plafond), horsDomaine: toutes.length - du.length, tronquees: Math.max(0, du.length - plafond) };
}

const avertir = (m) => console.log(`::warning title=IndexNow::INDEXNOW_AVERTISSEMENT ${m}`);
const lireSi = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };

export async function envoyer({ domaine, nouveau, avant, env = process.env, delai = 20000 }) {
  const d = normaliserDomaine(domaine);
  if (/^pull_request/.test(env.GITHUB_EVENT_NAME ?? "")) return console.log("INDEXNOW_REFUS evenement pull_request : aucun envoi depuis une PR"), "refus";
  const endpoint = env.INDEXNOW_ENDPOINT || ENDPOINT_REEL;
  if (endpoint === ENDPOINT_REEL && env.INDEXNOW_DEPLOIEMENT_REEL !== "1") return console.log("INDEXNOW_REFUS hors deploiement reel : aucun envoi"), "refus";
  const cle = cleDuDomaine(d, env.INDEXNOW_SECRET);
  if (!cle) return console.log("INDEXNOW_SKIP secret INDEXNOW_SECRET absent : rien n'est fait"), "skip";
  console.log(`::add-mask::${cle}`);
  const apres = lireSitemap(lireSi(nouveau));
  if (!apres) return avertir(`sitemap du build illisible ou non urlset : ${nouveau}`), "avertissement";
  const premierPassage = !fs.existsSync(path.join(avant, "cle-presente"));
  const diff = differences(premierPassage ? null : lireSitemap(lireSi(path.join(avant, "sitemap.xml"))), apres);
  const { urlList, horsDomaine, tronquees } = lot(diff, d);
  console.log(`INDEXNOW_DIFF premier=${diff.premier} ajoutees=${diff.ajoutees.length} modifiees=${diff.modifiees.length} retirees=${diff.retirees.length} hors_domaine=${horsDomaine} envoyees=${urlList.length} tronquees=${tronquees}`);
  if (tronquees) avertir(`plafond ${PLAFOND} atteint, ${tronquees} adresse(s) non envoyee(s)`);
  if (urlList.length === 0) return console.log("INDEXNOW_RIEN aucune adresse a signaler"), "rien";
  const base = env.INDEXNOW_BASE_SITE || `https://${d}`;
  const keyLocation = `https://${d}/${cle}.txt`;
  try {
    const r = await fetch(`${base}/${cle}.txt`, { signal: AbortSignal.timeout(delai), headers: { "Cache-Control": "no-store" } });
    const t = r.ok ? (await r.text()).trim() : "";
    if (t !== cle) return avertir(`fichier cle non servi tel quel (HTTP ${r.status}) : envoi annule`), "avertissement";
  } catch (e) {
    return avertir(`fichier cle injoignable : ${e.message}`), "avertissement";
  }
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: d, key: cle, keyLocation, urlList }),
      signal: AbortSignal.timeout(delai),
    });
    if (r.status === 200 || r.status === 202) return console.log(`INDEXNOW_OK HTTP ${r.status} adresses=${urlList.length}`), "ok";
    return avertir(`reponse HTTP ${r.status} d'IndexNow, adresses=${urlList.length}`), "avertissement";
  } catch (e) {
    return avertir(`envoi echoue : ${e.message}`), "avertissement";
  }
}

function options(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
  return o;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...reste] = process.argv.slice(2);
  if (cmd === "cle") {
    const cle = (() => { try { return cleDuDomaine(reste[0]); } catch { return null; } })();
    if (!cle) process.exit(3);
    process.stdout.write(cle);
  } else if (cmd === "envoyer") {
    try { await envoyer(options(reste)); } catch (e) { avertir(`erreur inattendue : ${e.message}`); }
    process.exit(0);
  } else {
    console.error("usage : indexnow.mjs cle <domaine> | envoyer --domaine D --nouveau F --avant DIR");
    process.exit(2);
  }
}
