# Socle batiment

Decision de Frederic du 01.11.2026 : un gabarit de reference, recopie dans
chaque site, et une garde de conformite qui refuse toute copie qui a derive.
Les palettes et les typographies de chaque site restent les siennes : seuls la
structure et le comportement sont communs.

La decision du 21.10 (DECISION-SOCLE-COMMUN-QUATRE-SITES) le dit autrement :
**le vrai livrable, c'est la liste.** Elle est ci-dessous.

---

## 1. La liste : ce qu'un site du batiment doit avoir

Chaque ligne est verifiee, et la colonne dit par quoi. « garde socle » renvoie
a `ops/garde-socle/verifier.mjs`, qui tourne dans le build de chaque site.

### 1.1 L'en-tete

| Ce qu'il faut | Verifie par |
|---|---|
| `src/components/layout/Header.tsx` identique au gabarit, zones libres mises a part | garde socle, empreinte |
| La barre est collante (`sticky top-0`) et marque la page servie par `aria-current="page"` | garde socle, empreinte |
| Le logo CEDE en largeur : `min-w-0`, jamais `shrink-0` | garde socle, empreinte |
| Les entrees du menu viennent des ROUTES du site, jamais ecrites en dur dans le gabarit | garde socle, empreinte de `src/data/navigation.ts` |
| La barre ne porte que les SIX sections communes : Services, Villes, Tarifs, le journal (Blog ou Conseils), FAQ, Contact | forme du gabarit, et garde socle, mesure d'effet |
| Ce qui n'est pas dans la barre reste dans le menu du telephone (`NAV_TELEPHONE`) et dans le pied | forme du gabarit |
| Le panneau replie est TOUJOURS rendu, seulement masque : aucune page ne perd son lien entrant | garde socle, empreinte |
| Le numero et sa mention sont deux elements EMPILES, visibles a partir de `xl` | garde socle, empreinte |
| Le menu parait a partir de `lg` | garde socle, empreinte |
| Un bouton « Appeler » sous `xl` : aucune plage de largeur sans appel | garde socle, empreinte |
| Un bouton de devis, toujours present | garde socle, empreinte |
| Le panneau replie se referme a la navigation et sur Echap | garde socle, empreinte |
| L'emplacement WhatsApp existe, dynamique, eteint, et ne laisse AUCUN vide | garde socle, empreinte de `CanalWhatsapp.tsx` |
| Le panneau replie ouvert pose `data-hc-nav-open` sur `<html>` : le chat se retire, il ne passe plus par-dessus le menu | garde socle, empreinte ; `preuve-widget.mjs` |
| Sous 1024 px, les conteneurs de `main` et du pied (`.container`, `mx-auto px-4`, ou marques `data-hc-reserve` par le site) s'arretent avant le bouton du chat (`--hc-widget-reserve`, publiee par le chargeur) | garde socle, empreinte de `reserve-widget.css`, importee par l'en-tete ; `preuve-widget.mjs` |

### 1.2 Le numero

| Ce qu'il faut | Verifie par |
|---|---|
| UNE SEULE valeur de configuration : `SITE_CONFIG.phone` dans `src/data/config.ts` | garde socle, mesure d'effet |
| Une mention a cote du numero : `SITE_CONFIG.phoneMention`, vide par defaut | garde socle, mesure d'effet |
| Vide, le numero ne laisse AUCUN trou : `phoneHref()` rend `null`, chaque emplacement rend `null` | garde socle, empreinte des gabarits |
| Le numero est vide, ou au format suisse | garde socle, mesure d'effet |
| Le faux numero `079 123 45 67` n'existe nulle part dans la source | garde socle, mesure d'effet |
| Renseigne, il parait dans l'en-tete, le bouton « Appeler », le menu replie, la barre collante du bas, le pied, la page contact et le `telephone` du JSON-LD | garde socle, empreinte des gabarits |
| Le `@type` du JSON-LD reste gele | charte editoriale, revue humaine |

### 1.3 Le formulaire

| Ce qu'il faut | Verifie par |
|---|---|
| `src/lib/api.ts` identique au gabarit : contrat B, dit « jardin » | garde socle, empreinte |
| Une VRAIE case de consentement, `required`, dont la valeur part dans `consent` | garde socle, empreinte de `BlocConsentement.tsx` |
| `consent: true` n'est JAMAIS ecrit en dur | garde socle, mesure d'effet |
| Un piege anti-robot rendu, hors ecran et hors tabulation, dont la valeur part dans `website` | garde socle, empreinte et mesure d'effet |
| Tout fichier qui appelle `construireCharge` monte `BlocConsentement` | garde socle, mesure d'effet |
| Tout fichier qui appelle `construireCharge` verifie le nom avant d'envoyer | garde socle, mesure d'effet |
| Personne n'appelle `submitLead` sans passer par `construireCharge` | garde socle, mesure d'effet |
| Tout `<form` passe par `submitLead` : aucun formulaire ne remercie sans envoyer | garde socle, mesure d'effet |
| L'envoi va sur `/api/leads` a l'origine du site, jamais sur `/api/leads/track` du CRM | garde socle, empreinte |
| Messages en francais et en allemand | garde socle, empreinte de `BlocConsentement.tsx` |

### 1.4 La page introuvable

| Ce qu'il faut | Verifie par |
|---|---|
| UN en-tete, et un seul, atteint chaque route | garde socle, mesure d'effet |
| soit chaque gabarit passe par `Layout`, soit la coquille en monte un au dessus du routeur | garde socle, mesure d'effet |
| et alors aucun gabarit n'en monte un SECOND | garde socle, mesure d'effet |
| Le prerendu REND la page introuvable au lieu de recopier la coquille Vite | garde socle, mesure d'effet |
| La 404 rendue porte un element `<header>` | `socle-404.mjs` refuse le build sinon |
| La 404 ne porte ni adresse canonique ni donnees structurees, et porte `noindex` | `socle-404.mjs` |
| La 404 n'entre dans aucun inventaire : elle s'ecrit en `404.html`, pas en `index.html` | `socle-404.mjs`, et la garde d'egalite du plan du site |

### 1.5 La politique de securite du contenu

| Ce qu'il faut | Verifie par |
|---|---|
| `deploy/csp-batiment.conf` identique au gabarit | garde socle, empreinte |
| En rapport seul (Report-Only) | garde socle, mesure d'effet |
| `widget.premiumhelveticleads.ch` autorise en `script-src` | garde socle, mesure d'effet |
| `comms.premiumhelveticleads.ch` autorise en `connect-src` | garde socle, mesure d'effet |
| Posee sur le vhost nginx du site | geste d'exploitation, hors de ce depot |

### 1.6 Le build

| Ce qu'il faut | Verifie par |
|---|---|
| `scripts/garde-socle.mjs` et `scripts/socle-manifeste.json` presents | le build echoue sinon |
| La garde de conformite tourne dans `pnpm build`, AVANT le reste | `package.json` du site |
| Les gardes deja en place du site restent vertes | leur propre execution |

### 1.7 Ce qui n'est PAS dans le socle, et pourquoi

- la palette, la typographie, les ombres et les rayons : jetons du site, dans
  son `index.css` et sa configuration Tailwind. C'est l'anti-harmonisation
  voulue par la charte ;
- le logo, les illustrations, les icones de marque ;
- le contenu : services, villes, problemes, intentions, articles ;
- les libelles de langue du menu : zone libre dans `src/data/navigation.ts` ;
- la VALEUR du numero : elle est propre au site, et reste vide tant que la
  ligne n'est pas achetee et joignable.

---

## 2. Mode d'emploi de la recopie

### 2.1 Poser le socle sur un site qui ne l'a pas

Depuis la racine du depot du site, avec `helvetic-deploy` clone a cote :

```
node <helvetic-deploy>/ops/garde-socle/poser.mjs <chemin du paquet du site>
```

Le script copie les fichiers du manifeste a leur place, ecrit
`scripts/socle-manifeste.json`, et dit ce qu'il reste a faire a la main :

1. ajouter `phoneMention` a `src/data/config.ts` ;
2. brancher `BlocConsentement` dans les formulaires du site ;
3. remplacer l'appel a l'ancienne ecriture de la 404 par `rendre404` dans
   `scripts/prerender-content.mjs` ;
4. ajouter la garde en tete de `pnpm build`.

Ces quatre gestes sont propres au site parce qu'ils touchent des fichiers que
le socle ne possede pas. La garde les verifie ensuite par ses mesures d'effet.

### 2.2 Changer le socle

1. modifier le fichier sous `socle/batiment/` ;
2. `node ops/garde-socle/manifeste.mjs` pour refaire les empreintes ;
3. recopier dans chaque site concerne (`poser.mjs`) ;
4. `node ops/garde-socle/preuve-opt-in.mjs` si le workflow a bouge.

Un socle modifie sans recopie rend les sites ROUGES au prochain build : c'est
voulu. La garde dit quel fichier et quelle ligne.

**La cle `version` de `MANIFESTE.json` augmente de 1 a chaque version publiee.**
Decision de Frederic du 02.11.2026. Elle vaut 2 avec la v1.4.0, 3 avec la v1.5.0. Elle s'ecrit dans
`ops/garde-socle/manifeste.mjs`, avant le tag. Un site non concerne par une
version garde la valeur de sa derniere recopie : la garde ne lit pas cette cle.

### 2.2 bis Reposer le socle sur un site qui a rempli ses zones libres

`poser.mjs` GREFFE les zones libres du site dans le gabarit qu'il pose : ce
qu'un site a ecrit dans ses zones lui reste, meme apres une modification du
socle. Il le dit a chaque fichier concerne :

```
  pose src/components/HeroForm.tsx (3 zone(s) libre(s) du site gardee(s))
```

Sans cette greffe, reposer le socle ecraserait en silence le choix de commune
d'un site, ses cles d'etapes et ses verifications propres, et le build
resterait VERT : la garde retire justement ces zones avant de comparer. Le cas
s'est produit une fois, sur terrassement, le 02.11.

Quand le gabarit gagne ou perd une zone libre, le compte ne correspond plus.
`poser.mjs` n'ecrit alors PAS le fichier, le nomme, et sort en erreur : il n'y
a aucune facon sure de deviner quelle zone du site va dans quelle zone du
gabarit. Le report se fait a la main, une fois, puis la greffe reprend.

### 2.3 Les zones libres

Un fichier du socle peut contenir des zones que chaque site a le droit de
changer. Elles sont delimitees DANS le gabarit :

```
/* socle:libre:debut libelles de langue, a traduire pour un site DE */
...
/* socle:libre:fin */
```

La garde retire ces zones avant de comparer. Une zone ouverte et jamais
refermee fait echouer la garde.

### 2.4 La garde dans la CI, en option

`deploy-infomaniak.yml` accepte deux entrees nouvelles, toutes deux
optionnelles :

| Entree | Type | Defaut |
|---|---|---|
| `garde_socle` | boolean | `false` |
| `garde_socle_chemin` | string | `""` |

Quand `garde_socle` vaut `true`, deux etapes de plus tirent `socle/batiment`
et `ops/garde-socle` du depot du workflow, AU SHA DU WORKFLOW, et comparent la
copie du site aux fichiers reels. C'est le seul niveau qui attrape le cas ou
quelqu'un a modifie la copie ET le manifeste du meme geste.

Quand l'entree est absente ou fausse, les deux etapes sont sautees et le job
est exactement celui d'avant. `node ops/garde-socle/preuve-opt-in.mjs` le
verifie et l'affiche. Les appelants pointent de toute facon sur `@v1`, un
pointeur que seul un geste humain deplace : tant que `v1` n'est pas promu,
rien de ce qui est ecrit ici n'atteint un seul site.

---

## 3. Tranche, et ce qui reste a trancher

- **La mention posee a cote du numero : RIEN.** Decision de Frederic du
  02.11.2026 : le numero paraitra seul. `phoneMention` reste donc vide sur les
  27 sites. Le champ est garde parce qu'il coute zero pixel quand il est vide,
  et parce qu'il evite qu'un site reinvente sa propre ligne de mention : le
  gabarit ne rend AUCUN element quand la valeur est vide, donc aucun trou, et
  la seule facon d'afficher un texte a cote du numero reste cette valeur unique.
  Les heures de `SITE_CONFIG.hours` sont celles du metier, pas celles de la
  ligne : elles n'ont jamais leur place ici.
- **Le seuil `xl` du numero.** Il est pose a 1280 px par le gabarit. Les
  captures du lot 1 le montrent tenir a 1280 et a 1024 ; il n'a pas ete mesure
  sur un site dont le menu serait plus long.
- **Les sites allemands.** Leur `SITE_CONFIG` declare `langue: "de"` et `chemins`
  (`{ services: "/leistungen", contact: "/kontakt", ... }`). La barre et les
  boutons lisent ces chemins, et les textes des gabarits sortent de `TEXTES` dans
  `src/data/navigation.ts`. Un site francais ne declare rien : ses valeurs sont les
  valeurs par defaut, et son rendu ne change pas. Les libelles du menu restent
  dans la zone libre. Bouton allemand : « Offerte anfragen », « Kostenloses
  Angebot anfragen », deux libelles deja servis par le parc.
