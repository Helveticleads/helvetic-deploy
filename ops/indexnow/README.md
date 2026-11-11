# IndexNow dans la chaine de deploiement

Decision de Frederic du 11.11 : prevenir Bing (et Yandex, Seznam, Naver) des adresses creees, modifiees ou retirees. Google ne se sert pas d'IndexNow.

## Fonctionnement (deploy-infomaniak.yml, aucune recopie dans les sites)

1. `IndexNow script` : checkout clairseme de `ops/indexnow` au SHA du workflow.
2. `IndexNow fichier cle et sitemap servi`, avant le rsync : ecrit `/<cle>.txt` dans `dist/public`, lit par ssh le `sitemap.xml` de la release servie, et note si elle portait deja le fichier cle.
3. `IndexNow signaler les adresses changees`, apres la bascule et les gardes post-deploiement : compare les deux sitemaps (ajoutees, `lastmod` change, retirees), puis envoie un POST JSON a `https://api.indexnow.org/indexnow` (`host`, `key`, `keyLocation`, `urlList`). Au premier passage, c'est-a-dire sans sitemap servi ou sans fichier cle servi, tout le sitemap part. Le plafond est de 10 000 adresses. Avant l'envoi, le script verifie que `https://<domaine>/<cle>.txt` sert bien la cle.

Garanties :

- **Jamais rouge.** Les trois etapes sont `continue-on-error: true` et le script sort toujours en 0. Un echec devient `::warning:: INDEXNOW_AVERTISSEMENT ...`.
- **Jamais depuis une PR.** Les etapes sont exclues pour `pull_request*` et le script refuse lui aussi. L'adresse reelle n'est appelee qu'avec `INDEXNOW_DEPLOIEMENT_REEL=1`, que pose la seule etape d'envoi. Rien ne part pendant une preuve de sabotage.

## Cles : `cles.json`

Il y a une cle par site (32 hex aleatoires), stockee ici et hors des depots de sites. La cle n'est pas un secret. Elle est distincte par site pour deux raisons :

- une cle commune poserait le meme fichier sur tous les domaines, donc une empreinte qui relie le reseau ;
- une cle a changer ne touche qu'un site.

Un domaine absent de la table n'a rien : c'est `INDEXNOW_SKIP`. Pour ajouter un site, il suffit d'une ligne dans la table.

## Limite connue

Sans `<lastmod>` dans le sitemap, seules les adresses ajoutees et retirees sont signalees, pas les modifiees.

## Hors helvetic-deploy

Pour les sites qui ne passent pas par ce workflow (rsync manuels), il faut deux gestes :

1. Poser `/<cle>.txt` a la racine publiee.
2. Lancer `node ops/indexnow/indexnow.mjs envoyer --domaine D --nouveau <sitemap.xml> --avant <dossier>` avec `INDEXNOW_DEPLOIEMENT_REEL=1`, apres une mise en ligne reussie.

## Preuve

`node ops/indexnow/preuve-indexnow.mjs` fait un envoi simule vers un serveur local, sans aucune requete vers indexnow.org. La CI la lance avec `preuve-indexnow.yml`.
