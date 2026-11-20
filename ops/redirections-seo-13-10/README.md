# Redirections SEO 13-10, a poser sur les hotes

Deux blocs nginx prepares par CORRECTIFS SEO 13-10 apres la chute Google du
13.10. Ils ne changent **que** des redirections : aucune page servie, aucun
certificat, aucun DNS, aucun pare-feu, aucun autre site de l'hote.

| Hote | Site | Ce qui est pose | Etat |
| --- | --- | --- | --- |
| Hetzner | helvetic-rohrreinigung.ch | 457 anciennes adresses de communes en noindex envoyees en **une seule** 301 vers une page en index, et le slug Legacy `/einsatz/rohrreinigung-Werktage` recible sur `/anliegen/rohrreinigung-24h/` | script pret, pose par Frederic |
| Infomaniak DE | helvetic-pool.ch | `www.helvetic-pool.ch` en une seule 301 vers la forme sans www | a venir dans la meme branche |

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
