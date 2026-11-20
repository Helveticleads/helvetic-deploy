# IndexNow dans la chaine de deploiement

Decisions de Frederic des 11 et 12.11 : prevenir Bing (et Yandex, Seznam, Naver) des adresses creees, modifiees ou retirees. Google ne se sert pas d'IndexNow.

## Fonctionnement (deploy-infomaniak.yml, aucune recopie dans les sites)

1. `IndexNow script` : checkout clairseme de `ops/indexnow` au SHA du workflow.
2. `IndexNow fichier cle et sitemap servi`, avant le rsync : ecrit `/<cle>.txt` dans `dist/public`, lit par ssh le `sitemap.xml` de la release servie, et note si elle portait deja le fichier cle.
3. `IndexNow signaler les adresses changees`, apres la bascule et les gardes post-deploiement : compare les deux sitemaps (ajoutees, `lastmod` change, retirees), puis envoie un POST JSON a `https://api.indexnow.org/indexnow` (`host`, `key`, `keyLocation`, `urlList`). Au premier passage, c'est-a-dire sans sitemap servi ou sans fichier cle servi, tout le sitemap part. Le plafond est de 10 000 adresses. Avant l'envoi, le script verifie que `https://<domaine>/<cle>.txt` sert bien la cle.

Garanties :

- **Jamais rouge.** Les trois etapes sont `continue-on-error: true` et le script sort toujours en 0. Un echec devient `::warning:: INDEXNOW_AVERTISSEMENT ...`.
- **Jamais depuis une PR.** Les etapes sont exclues pour `pull_request*` et le script refuse lui aussi. L'adresse reelle n'est appelee qu'avec `INDEXNOW_SECRET` et `INDEXNOW_DEPLOIEMENT_REEL=1`, que pose la seule etape d'envoi. Rien ne part pendant une preuve de sabotage.

## Cle : calculee, aucune liste

La cle du site est `HMAC-SHA256(INDEXNOW_SECRET, domaine)` en hexadecimal, tronquee a 32 caracteres. `INDEXNOW_SECRET` est un secret d'organisation qui arrive au workflow par `secrets: inherit`.

- Le meme domaine donne la meme cle a chaque deploiement. Pour une rotation, il suffit de changer le secret.
- Il y a une cle par site, sans liste dans ce depot, qui est public. Rien ne relie les domaines entre eux.
- La cle est masquee (`::add-mask::`) avant tout usage, et elle n'est jamais ecrite dans un journal.
- Tout appelant a IndexNow par defaut. Si le secret est absent, c'est `INDEXNOW_SKIP`, jamais rouge.

## Limite connue

Si au moins 2 adresses portent toutes le meme `<lastmod>`, c'est une date de build et non la date du contenu. Les modifiees sont alors ignorees : seules les ajoutees et les retirees partent, avec la notice `INDEXNOW_LASTMOD_UNIFORME`. Le premier passage envoie toujours tout le sitemap.

Sans `<lastmod>` dans le sitemap, seules les adresses ajoutees et retirees sont signalees, pas les modifiees.

## Hors helvetic-deploy

Pour les sites qui ne passent pas par ce workflow (rsync manuels), il faut deux gestes :

1. Poser `/<cle>.txt` a la racine publiee (`INDEXNOW_SECRET=... node ops/indexnow/indexnow.mjs cle <domaine>`, sans afficher la valeur).
2. Lancer `node ops/indexnow/indexnow.mjs envoyer --domaine D --nouveau <sitemap.xml> --avant <dossier>` avec `INDEXNOW_SECRET` et `INDEXNOW_DEPLOIEMENT_REEL=1`, apres une mise en ligne reussie.

## Preuve

`node ops/indexnow/preuve-indexnow.mjs` fait un envoi simule vers un serveur local, sans aucune requete vers indexnow.org. La CI la lance avec `preuve-indexnow.yml`.
