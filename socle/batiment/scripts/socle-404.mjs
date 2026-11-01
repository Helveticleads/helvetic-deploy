/**
 * SOCLE BATIMENT : la page 404, avec son en-tete et son pied de page.
 *
 * Decision de Frederic du 01.11 : la 404 recoit l'en-tete et le pied de page
 * sur les 27 sites.
 *
 * AVANT : `write404Html` recopiait la coquille Vite et n'y changeait que le
 * titre. Le fichier servi faisait environ 1,3 Ko, sans en-tete ni pied : le
 * visiteur voyait une page nue le temps que le navigateur execute le script,
 * et un visiteur sans script ne voyait jamais rien. Mesure du 01.11 sur
 * helvetique-carrelage.ch : 404 servie, 1312 octets, aucun element `<header>`.
 *
 * APRES : la 404 est RENDUE comme les autres pages, par le meme `render` du
 * bundle SSR. Le routeur du site rend sa page NotFound pour un chemin qu'il ne
 * connait pas, et cette page passe par `Layout`, donc par l'en-tete et le pied.
 *
 * Elle n'entre dans AUCUN inventaire : le fichier ecrit est `404.html` a la
 * racine du bati, pas un `index.html` dans un dossier. La garde d'egalite du
 * plan du site ne la voit donc pas, et le chemin de rendu n'est jamais servi.
 *
 * Verifie par la garde de conformite (ops/garde-socle).
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Chemin de rendu de la 404. Il ne doit correspondre a aucune route du site :
 * le routeur rend alors sa page NotFound. Il n'est jamais servi ni indexe.
 */
export const CHEMIN_RENDU_404 = "/__socle-404";

/**
 * @param {object} opts
 * @param {(url: string) => Promise<{head?: string, appHtml?: string}>} opts.render  le `render` du bundle SSR
 * @param {(p: {headTags: string, bodyHtml: string, staticHead: string, clientScripts: string}) => string} opts.assemblePage
 * @param {string} opts.staticHead
 * @param {string} opts.clientScripts
 * @param {string} opts.distRoot    dossier du bati (dist/public)
 * @param {string} opts.siteName    nom commercial du site
 * @param {string} [opts.lang]      langue du document (defaut "fr")
 * @returns {Promise<{octets: number, aEnTete: boolean}>}
 */
export async function rendre404(opts) {
  const { render, assemblePage, staticHead, clientScripts, distRoot, siteName } = opts;
  const lang = opts.lang ?? "fr";

  const rendu = await Promise.resolve(render(CHEMIN_RENDU_404));
  const bodyHtml = rendu?.appHtml ?? "";
  const headTags = rendu?.head ?? "";

  if (!bodyHtml.trim()) {
    throw new Error(
      "socle-404 : le rendu de la page introuvable est vide. " +
        "Verifier que le routeur du site rend sa page NotFound pour un chemin inconnu.",
    );
  }

  let html = assemblePage({
    headTags: headTags || `<title>Page introuvable | ${siteName}</title>`,
    bodyHtml,
    staticHead,
    clientScripts,
  });

  html = html
    .replace(/<html lang="[^"]*"/i, `<html lang="${lang}"`)
    /* Une page introuvable n'a ni adresse canonique, ni donnees structurees. */
    .replace(/\s*<link rel="canonical"[^>]*>/gi, "")
    .replace(/\s*<meta property="og:url"[^>]*>/gi, "")
    .replace(
      /\s*<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      "",
    );

  if (!/name="robots"[^>]*noindex/i.test(html)) {
    html = html.replace(
      "</head>",
      '  <meta name="robots" content="noindex, nofollow" />\n  </head>',
    );
  }

  const sortie = path.join(distRoot, "404.html");
  fs.writeFileSync(sortie, html, "utf8");

  const aEnTete = /<header[\s>]/i.test(html);
  if (!aEnTete) {
    throw new Error(
      "socle-404 : la page introuvable a ete rendue sans element <header>. " +
        "Verifier que la page NotFound du site passe par Layout.",
    );
  }

  return { octets: Buffer.byteLength(html, "utf8"), aEnTete };
}
