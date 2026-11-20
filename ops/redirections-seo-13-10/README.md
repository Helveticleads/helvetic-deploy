# Redirections SEO 13-10, a poser sur les hotes

Deux blocs nginx prepares par CORRECTIFS SEO 13-10 apres la chute Google du
13.10. Ils ne changent **que** des redirections : aucune page servie, aucun
certificat, aucun DNS, aucun pare-feu, aucun autre site de l'hote.

| Hote | Site | Ce qui est pose | Etat |
| --- | --- | --- | --- |
| Hetzner | helvetic-rohrreinigung.ch | 457 anciennes adresses de communes en noindex envoyees en **une seule** 301 vers une page en index, et le slug Legacy `/einsatz/rohrreinigung-Werktage` recible sur `/anliegen/rohrreinigung-24h/` | pose le 20.11 a 16:56 UTC, VERDICT REUSSI, preuve servie faite |
| Infomaniak DE | helvetic-pool.ch | `www.helvetic-pool.ch` en une seule 301 vers la forme sans www | script pret (`www-vers-apex.sh`) |
| Hetzner | helvetic-rohrreinigung.ch | `www.helvetic-rohrreinigung.ch`, meme chose, meme script | script pret, apres pool |

## Hetzner, helvetic-rohrreinigung.ch

`hetzner-rohrreinigung-anciennes-adresses.sh`, lu sur l'hote le 20.11 avant
d'etre ecrit : vhost reel `/etc/nginx/sites-enabled/helvetic-rohrreinigung.ch.conf`
(un fichier, pas un lien vers `sites-available`), snippets G1 et Legacy inclus
une fois chacun, nginx 1.24.0.

Source de verite des deux fichiers a poser : le depot du site,
`Helveticleads/DE-helvetic-rohrreinigung.ch`, sur `main` apres la fusion de la
#60 (`480a4ac`), dans `_DOCS/curation-suivi/`. Le script refuse de travailler
si leur sha256 n'est pas exactement celui qu'il porte en dur. Les copies de
`fixtures/` servent aux preuves et gardent la trace de ce qui a ete pose.

### Deux modes

```sh
bash hetzner-rohrreinigung-anciennes-adresses.sh --verifier   # lecture seule
bash hetzner-rohrreinigung-anciennes-adresses.sh --poser
```

`--verifier` fait toutes les gardes et la mesure d'avant, puis s'arrete sans
avoir rien ecrit ni recharge. C'est la repetition de la pose.

### Les six gardes, avant la moindre ecriture

0. root (et l'hote, pas une machine d'essai) ;
1. l'hote n'est pas occupe (`rsync`, `apt-get`, `dpkg`, `certbot`) ;
2. le verrou de deploiement n'est pas pris ;
3. `nginx -t` est deja vert avant la pose ;
4. le vhost est la, le snippet G1 et le snippet Legacy sont inclus une fois
   chacun, la ligne du nouveau snippet n'y est pas encore, et l'ancien snippet
   G1 version auto n'est pas inclus en plus ;
5. les deux fichiers a poser ont le sha256 attendu et le bon nombre de regles ;
6. **aucun doublon** : les 457 + 4 adresses a poser sont comparees a toutes
   celles que le vhost definit deja, y compris par ses includes. Un meme
   `location =` defini deux fois fait echouer `nginx -t` ; la garde le voit
   avant d'ecrire. Mesure du 20.11 : 21 adresses deja definies, 461 a poser,
   0 doublon.

### Ce que la pose fait, dans cet ordre

1. sauvegarde horodatee `/root/nginx-avant-redirections-<site>-<horo>.tar.gz`
   de `sites-enabled` et `snippets`, plus une copie du vhost et du snippet
   Legacy dans `/root` ;
2. pose des deux snippets ;
3. **une** ligne `include` ajoutee dans le vhost, a cote de celle du G1, donc
   avant `location /` et son `try_files`. Le script refuse si le vhost gagne
   autre chose qu'une ligne, et affiche le diff ;
4. `nginx -t` ; recharge **seulement** s'il est vert ;
5. preuves servies depuis l'hote (sans sortir sur Internet) : les neuf
   accueils du serveur repondent comme avant, les 457 adresses font une seule
   301 vers la cible voulue, les dix cibles distinctes repondent 200 et en
   index, le slug Legacy vise `/anliegen/rohrreinigung-24h/`, la page de la
   commune reste servie en `noindex, follow`, cinq exemples affiches.

A la moindre anomalie : retour arriere depuis la sauvegarde, `nginx -t`,
rechargement, et `VERDICT : ECART` en derniere ligne. Sinon
`VERDICT : REUSSI`.

### Les copies ne sont pas dans sites-enabled

`include /etc/nginx/sites-enabled/*;` prend **tous** les fichiers du dossier.
Une sauvegarde `vhost.conf.bak-...` posee a cote serait donc chargee, et
nginx -t echouerait sur des `server` et des `location` en double. Les copies
vont dans `/root`.

## Les preuves

`bash ops/redirections-seo-13-10/preuves.sh` fait tourner le script sur un
faux `/etc/nginx` dans un dossier temporaire, avec des bouchons a la place de
`nginx`, `systemctl`, `pgrep` et `curl`. Aucun hote n'est joint. Le prefixe de
racine vient de `REDIR_RACINE_ESSAI`, vide en production.

Neuf cas : pose normale, empreinte differente, adresse deja definie, ligne
include deja presente, `nginx -t` rouge apres la pose, une adresse qui ne fait
pas la 301, mode verification, verrou pris, hote occupe. Pour chaque ECART,
les preuves verifient que le vhost et le snippet Legacy sont revenus a leur
etat d'avant, octet pour octet.

## Le www vers la forme sans www

`www-vers-apex.sh --verifier|--poser <domaine>`, pour `helvetic-pool.ch`
(Infomaniak DE) et `helvetic-rohrreinigung.ch` (Hetzner). Il met le vhost a la
forme que quatre sites d'Infomaniak DE servent deja (bettwanzen, nagetiere,
schaedlingsprofi, wespen-hornissen) :

1. le bloc 443 du site perd le `www` de son `server_name` ;
2. un bloc 443 neuf ne porte que le `www` et renvoie 301 vers l'apex. Il
   reprend **mot pour mot** les lignes `listen`, `ssl_*` et `include` du bloc
   du site : aucune valeur de certificat n'est recopiee a la main ;
3. le bloc 80 ecrit par certbot (deux `if ($host = ...)` vers `https://$host`,
   puis `return 404`) devient un seul `return 301` vers l'apex. C'est ce qui
   supprime la chaine `http://www` vers `https://www` vers l'apex.

`ipv6only=on` et `default_server` sont **retires** de la copie : ce sont des
options de la socket, pas du site, et nginx refuse de les voir deux fois pour
la meme adresse. Sur l'hote Hetzner un seul vhost porte `ipv6only=on`, et c'est
justement celui de rohrreinigung : copier la ligne telle quelle aurait fait
echouer `nginx -t` sur `duplicate listen options`. Le cas I des preuves le
verifie.

Le bloc 80 etant reecrit en entier, le script refuse de travailler s'il y
trouve une seule ligne qu'il ne reconnait pas (cas B). Il refuse aussi si le
certificat ne couvre pas le www (cas D), si un bloc `www` existe deja (cas C),
ou si le www redirige deja.

Les preuves apres rechargement : **tous** les noms de l'hote, apex et www, sont
mesures avant et apres, et seul le www du domaine traite doit avoir change ;
le www fait une seule 301 vers l'apex pour l'accueil, pour une page profonde
lue dans le sitemap servi, pour une adresse avec parametres, et en http ;
l'apex et sa page profonde repondent toujours 200.

`bash ops/redirections-seo-13-10/preuves-www.sh` : neuf cas, sur les **deux**
vhosts reels. Le bouchon `curl` y est un petit nginx de papier qui lit les
blocs `server` du faux `/etc/nginx` et repond comme le vrai le ferait, si bien
que les preuves du script sont vraiment exercees, pas seulement ses gardes.
