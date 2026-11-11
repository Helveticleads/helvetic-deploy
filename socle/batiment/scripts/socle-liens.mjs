#!/usr/bin/env node
/**
 * SOCLE BATIMENT : la passe des liens internes, apres le prerendu.
 *
 * Decision de Frederic (11.11) : chaque lien interne d'une page servie pointe
 * DIRECTEMENT vers l'adresse canonique, celle des sitemaps et des balises
 * canonical, sans passer par une redirection 301. v1.6.6 : la FORME de cette
 * adresse est le reglage ecrit du site, `slashFinal` de `src/data/config.ts`
 * (true : « /services/ » ; false : « /services »). La passe le lit, ne decide
 * rien, et s'arrete s'il manque. Le socle corrige ses propres liens au rendu
 * (`lienCanonique()` de `src/data/navigation.ts`) ; cette passe corrige TOUS
 * les autres, ceux que chaque site ecrit lui-meme (pied, fil d'Ariane, pages,
 * donnees, articles).
 *
 * Elle lit le HTML produit (`dist/public` par defaut) et ne reecrit QUE la
 * valeur de l'attribut `href` des balises `<a>` : aucun autre octet ne change.
 * Interne : un chemin « /... », ou une adresse du domaine du site (`domainBare:`
 * de `src/data/config.ts`). Le « / » s'ajoute ou s'ote au chemin selon le
 * reglage ; l'ancre et les parametres sont gardes apres lui. Restent tels quels : la racine, un fichier
 * (.xml, .pdf, .txt, image...), un lien externe (un autre domaine du parc
 * compris), `//...`, mailto:, tel:, une ancre ou des parametres seuls. Elle ne
 * touche ni aux balises canonical ni aux sitemaps, ni au texte, ni aux routes.
 *
 * Place dans le build du site : juste apres `scripts/prerender-content.mjs`,
 * avant la garde des pages, qui prouve le resultat (`liens:`). La garde de la
 * source verifie que le build l'appelle a cette place.
 *
 * Usage (depuis le dossier du site) :
 *   node ./scripts/socle-liens.mjs dist/public
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FICHIER = /\.[a-z0-9]{2,5}$/i;

/** Le domaine du site, lu dans sa configuration : `domainBare: "..."` (les 29 sites), sinon `domain: "..."` ; sans protocole, sans www. */
export function domaineDuSite(site) {
  const f = path.join(site, "src/data/config.ts");
  const config = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  return (config.match(/\bdomainBare:\s*["']([^"']+)["']/) ?? config.match(/\bdomain:\s*["']([^"']+)["']/) ?? [])[1]?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "") ?? null;
}

/*
 * v1.6.6 (Frederic, 11.11) : la forme est le REGLAGE `slashFinal` du site, dans
 * `SITE_CONFIG` de `src/data/config.ts`, ecrit en dur : `slashFinal: true,` ou
 * `slashFinal: false,`. Absent ou mal ecrit : la passe s'arrete et dit quoi ecrire.
 */
export function reglageSlash(site) {
  const f = path.join(site, "src/data/config.ts");
  const config = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  const m = config.match(/\bslashFinal\s*:\s*(true|false)\b/);
  return m ? m[1] === "true" : null;
}
export const MESSAGE_REGLAGE = "ecrire dans SITE_CONFIG de src/data/config.ts `slashFinal: true,` si le canonical et le sitemap du site sont avec « / » final, ou `slashFinal: false,` s'ils sont sans";

/** La valeur d'un href a la forme du reglage si c'est un lien interne ; sinon telle quelle. */
export function hrefCanonique(href, domaine, slash = true) {
  let prefixe = "";
  let reste = href;
  if (domaine) {
    const m = href.match(new RegExp(`^https?://(?:www\\.)?${domaine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[/?#]|$)`, "i"));
    if (m) {
      prefixe = m[0];
      reste = href.slice(m[0].length);
      if (reste === "") return href; /* la racine, ecrite sans « / » : laissee */
    }
  }
  if (!reste.startsWith("/") || reste.startsWith("//")) return href;
  const i = reste.search(/[?#]/);
  const chemin = i < 0 ? reste : reste.slice(0, i);
  const suite = i < 0 ? "" : reste.slice(i);
  if (chemin === "/" || FICHIER.test(chemin)) return href;
  if (slash) return chemin.endsWith("/") ? href : `${prefixe}${chemin}/${suite}`;
  return chemin.endsWith("/") ? `${prefixe}${chemin.replace(/\/+$/, "") || "/"}${suite}` : href;
}

/** Reecrit les href des <a> d'une page ; rend le HTML et le nombre de liens corriges. */
export function passerPage(html, domaine, slash = true) {
  let n = 0;
  const sortie = html.replace(/(<a\b[^>]*?\bhref=")([^"]*)(")/gi, (tout, avant, valeur, apres) => {
    const neuf = hrefCanonique(valeur, domaine, slash);
    if (neuf === valeur) return tout;
    n += 1;
    return `${avant}${neuf}${apres}`;
  });
  return { html: sortie, corriges: n };
}

function pagesHtml(dir) {
  const out = [];
  (function parcourir(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (e.name.endsWith(".html")) out.push(p);
    }
  })(dir);
  return out.sort();
}

function principal() {
  const site = process.cwd();
  const dossier = path.resolve(site, process.argv[2] ?? "dist/public");
  if (!fs.existsSync(dossier)) {
    console.error(`socle-liens : ${dossier} introuvable : lancer la passe apres le prerendu`);
    process.exit(1);
  }
  const domaine = domaineDuSite(site);
  const slash = reglageSlash(site);
  if (slash === null) {
    console.error(`socle-liens : reglage slashFinal absent ou mal ecrit : ${MESSAGE_REGLAGE}`);
    process.exit(1);
  }
  let liens = 0;
  let touchees = 0;
  const pages = pagesHtml(dossier);
  for (const p of pages) {
    const avant = fs.readFileSync(p, "utf8");
    const { html, corriges } = passerPage(avant, domaine, slash);
    if (corriges > 0) {
      fs.writeFileSync(p, html);
      liens += corriges;
      touchees += 1;
    }
  }
  console.log(`SOCLE_LIENS_OK ${liens} lien(s) interne(s) mis a l'adresse canonique sur ${touchees} page(s) (${pages.length} page(s) lues${domaine ? `, domaine ${domaine}` : ""}, slashFinal: ${slash})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  principal();
}
