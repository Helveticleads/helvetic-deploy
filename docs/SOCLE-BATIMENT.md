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

**La regle du telephone du batiment** (Frederic, 05.11.2026, v1.6.1). Elle se
lit sur les PAGES CONSTRUITES, par la garde lancee en fin de build
(`node ./scripts/garde-socle.mjs --pages dist/public`, mesure 8) :

| Ce qu'il faut | Verifie par |
|---|---|
| Site FR, numero renseigne : le numero ET les horaires d'appel « Lun-ven 10h-19h » (`phoneMention`) dans l'en-tete de chaque page | garde des pages |
| ... et dans la barre collante du bas, qui ECRIT le numero et ses horaires au-dessus des boutons | garde des pages ; empreinte de `StickyMobileCTA.tsx` ; `preuve-v1-6-1.mjs` |
| ... et dans le CONTENU de la page contact (`contact/index.html`), qui appartient au site | garde des pages |
| Site DE (`langue: "de"`) : `phone: ""` | garde socle, mesure d'effet |
| Site DE : aucun lien `tel:`, aucune icone de telephone, aucun « Anruf », « Anrufe », « anrufen », compose en -anruf, « rufen Sie ... an », aucun « erreichbar » au sens de joignable par telephone, sur aucune page. Exception nommee : le libelle du champ « Telefonnummer » du formulaire (le numero du client) | garde des pages |
| Les usages de « erreichbar » sans rapport avec le telephone (« gut erreichbar mit dem ÖV ») : exceptions NOMMEES une par une dans `EXCEPTIONS_ERREICHBAR` de `ops/garde-socle/verifier.mjs`, chacune avec son sens et un exemple | garde des pages ; `preuve-v1-6-1.mjs` |
| Site DE (v1.6.2, decision du 09.11) : aucun telephone DE L'ENTREPRISE dans le texte, le titre, les metas (description, `og:*`, `twitter:*`) ni le texte FAQ du JSON-LD. Tournures rouges nommees (`TOURNURES_TELEFON`) : « telefonisch » comme canal (« telefonisch erreichbar / beraten / kontaktieren », « telefonische Beratung / Anfrage »), « per / am Telefon », « unsere Telefonnummer », « unser Telefon », « Telefon: » ou « Tel. » suivi d'un numero, « Hotline », « Telefonberatung », « Servicetelefon » seulement de l'entreprise : « unsere Hotline », suivie d'un numero ou d'un horaire, ou offerte au visiteur (« kostenlose Telefonberatung », « Hotline 24/7 ») ; une hotline d'un tiers (« Hersteller-Hotline », « Verwaltungs-Hotline ») ou niee (« zwischen Hotlines », « keine Telefonberatung ») passe (composes en mobil-, festnetz- compris). Tout autre « Telefon... » passe : le champ et le texte d'aide ou le client donne son numero, « Telefonnummer » dans les donnees collectees, « keine Telefonnummer », « Telefonie » | garde des pages ; `preuve-v1-6-2.mjs` |
| Site DE (v1.6.2) : « rufen Sie ... an » est vu dans toute la phrase (jusqu'au prochain `.`, `!`, `?` ou fin de bloc HTML) ; « Rückruf », « ruft Sie zurück » restent permis | garde des pages ; `preuve-v1-6-2.mjs` |
| FR et DE (v1.6.2) : UNE seule plage horaire, du lundi au vendredi de 10 h a 19 h, au pied de chaque page, dans le contenu de la page contact et dans le JSON-LD (`openingHours`, `openingHoursSpecification`) ; abreviations comprises (« Lun-ven 10h-19h », « Mo-Fr 10–19 Uhr », « Mo-Fr 10:00-19:00 ») ; « nach Absprache » n'est pas une plage. Ne sont PAS des horaires d'appel (decision du 09.11, `EXCEPTIONS_PLAGES`, chacune avec sa source) : une plage etiquetee « Intervention », « Einsatz », « Einsatzzeiten » (libelle le plus proche, dans le meme bloc), une plage dans une phrase de majoration ou de tarif, « 24 h/24 » du formulaire, les creneaux d'intervention donnes en exemple. Une plage d'appel fausse reste rouge, meme a cote d'une plage d'intervention | garde des pages ; `preuve-v1-6-2.mjs` |
| Le build du site lance la garde des pages, apres le prerendu | garde socle, mesure d'effet |

Les sites du parc ne sont pas concernes : leur regle est le drapeau `ligne`
(`docs/SOCLE-PARC.md`).

Dans la CI, rien de plus a ajouter : `deploy-infomaniak.yml` lance le MEME
build du site (`pnpm --filter ${{ inputs.artifact }} run build`, etape « Build
front prerendu »), donc la garde des pages, AVANT la cle SSH et tout `rsync`.
Une page fautive arrete le job a cette etape. La garde CI de niveau reference
(`garde_socle: true`) verifie en plus que le build du site lance bien la garde
des pages.

Decisions de Frederic du 05.11 : « Anruf » est interdit comme « anrufen » ; le rappel DU CLIENT par
l'entreprise est permis (« Rückruf », « zurückrufen », « ruft Sie zurück », le
consentement du socle) ; les
tournures « nach Absprache erreichbar », « Erreichbarkeit » demandee dans un
formulaire, « der Fachbetrieb gut erreichbar », « Sind Sie fur ... erreichbar? »
se REFORMULENT dans le contenu (aucune exception) ; « per Formular erreichbar »
reste une exception ; la regle ne vaut que pour les 29 sites du batiment.

### 1.3 Le formulaire

| Ce qu'il faut | Verifie par |
|---|---|
| `src/lib/api.ts` identique au gabarit : contrat B, dit « jardin » | garde socle, empreinte |
| La case de consentement est NEUTRE (v1.6.3, Frederic 04.11 et 09.11) : « J’accepte que mes données soient utilisées pour traiter ma demande. En savoir plus dans la politique de confidentialité. » / « Ich bin einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage verwendet werden. Mehr dazu in der Datenschutzerklärung. », le lien de confidentialite du site portant les derniers mots ; elle ne nomme ni le professionnel ni la transmission, qui s'expliquent dans la politique de confidentialite | garde socle, empreinte de `BlocConsentement.tsx` ; garde des pages ; `preuve-v1-6-3.mjs` |
| Seule la DEMANDE est gratuite, jamais le devis (v1.6.4, Frederic 09.11) : le menu et la barre du bas disent « Demande gratuite » (court : bouton de l'en-tete, barre du bas) et « Demande gratuite et sans engagement » (long : menu deroule) ; en DE « Kostenlose Anfrage » et « Kostenlose und unverbindliche Anfrage ». Le bouton du formulaire d'accueil (`HeroForm.tsx`) dit « Envoyer ma demande ». Aucun fichier du socle, zones libres comprises, ne dit « devis » suivi de « gratuit », ni « kostenlos… » suivi de « Angebot » ou « Kostenvoranschlag » | garde socle, defaut `gratuite:` ; `preuve-v1-6-4.mjs` |
| Les 4 trous de la garde des pages trouves par AUDIT BATIMENT (v1.6.5, Frederic 09.11 ; `REVERIF-SOCLE-V1-6-2-09-11.md`) : DE, un numero suisse ecrit dans le texte, seul ou apres « Telefonnummer: », est rouge (le champ du client reste vert) ; FR, la plage « Lu, Di : 7h, 20h » est rouge ; FR et DE, les plages du CORPS des pages (`<main>`) sont lues, une plage d'ouverture ou de joignabilite est rouge, une plage liee a l'intervention (« Intervention », « Einsatz », « Einsatzzeiten », « Termine »), une duree, une contrainte de chantier et les exceptions deja nommees restent vertes ; DE, « Rufen Sie die Polizei (117), dann uns. » est rouge | garde des pages ; `preuve-v1-6-5.mjs` |
| Les liens internes pointent vers l'adresse CANONIQUE, avec « / » final (v1.6.5, Frederic 11.11) : le socle ajoute le « / » au rendu (`lienCanonique()` de `navigation.ts`, en-tete, menu, barre du bas, HeroForm) ; les chemins `CHEMINS`, `NAV`, `CHEMIN_CONTACT` restent ecrits sans « / », ce sont aussi les routes. La racine, les fichiers, les liens externes restent tels quels ; l'ancre et les parametres sont gardes apres le « / ». Les liens que le site ecrit lui-meme passent par la PASSE CENTRALE `scripts/socle-liens.mjs` (fichier du socle), appelee dans le build juste apres le prerendu et avant la garde des pages (sixieme geste de `poser.mjs`) : elle ne reecrit que la valeur `href` des `<a>` internes (chemin « /... » ou domaine `domainBare` du site). La garde de la source refuse un build qui ne l'appelle pas, ou pas a cette place. Une page servie qui porte un lien interne sans « / » (adresse qui redirige) est rouge. Aussi rouge dans un fichier du socle : « kostenlos… » suivi de « Offerte » | garde des pages, defaut `liens:` ; garde socle, defaut `gratuite:` ; `preuve-v1-6-5.mjs` |
| L'envoi du lead (v1.6.5, Frederic 11.11 ; `CONTRAT-FORMULAIRE-BATIMENT-04-11.md`) : `submitLead` de `src/lib/api.ts` ajoute `event_id` (UUID v4, aussi en-tete `Idempotency-Key`), `origine_demande` (URL absolue sans parametres ni ancre), `consentement_at` (instant de la case, releve par `BlocConsentement`) et `source: "formulaire"`. « merci » seulement sur un succes explicite (2xx ET `ok`, `success`, `lead_id` ou `deja_recu`) ; sinon une erreur claire dans la langue du site, la saisie gardee. Sur 502, 503, 504 ou reseau coupe : UN nouvel essai apres 2 secondes, meme charge et meme `event_id` ; jamais sur 400, 429 ni 500 ; si le second echoue, le message donne le numero que le site affiche (sa configuration ; aucun sur un site DE ni avec `ligne: false`). `lead_submit` part APRES la reponse, seulement sur un succes, avec le meme `event_id`, jamais pour un doublon ; plus jamais de la page de remerciement. Aucune cle ni secret dans le socle | garde socle, empreinte de `api.ts` ; mesures d'effet `mesureEnvoiLead`, `lead_submit` hors de submitLead ; `preuve-v1-6-5.mjs` |
| Les liens restent canoniques APRES l'execution du JavaScript (v1.6.5, Frederic 11.11) : `installerLiensCanoniques()` de `src/data/navigation.ts`, installe au chargement de l'en-tete, enveloppe `history.pushState` et `replaceState` (l'adresse affichee, le rechargement, le partage et la page vue d'Umami portent le « / » ; l'enveloppe reste la premiere appelee meme si Umami pose la sienne apres) et observe le document pour remettre le « / » a tout lien interne ajoute ou change apres l'hydratation. Meme regle que `lienCanonique`. Le site ne reecrit pas l'historique et ne desactive pas le mecanisme | garde socle, empreinte de `navigation.ts` ; mesures d'effet ; `preuve-v1-6-5.mjs` ; mesure en navigateur sur les sites construits |
| La FORME des adresses est un reglage ECRIT du site (v1.6.6, Frederic 11.11) : `slashFinal: true` (canonical et sitemap avec « / » final) ou `slashFinal: false` (sans), dans `SITE_CONFIG` de `src/data/config.ts`. `lienCanonique()`, l'historique et la passe `socle-liens.mjs` le lisent et ne decident rien ; aucune adresse ne change pour Google, ce sont les liens qui s'alignent. Reglage absent ou mal ecrit : rouge a la source, arret de la passe, rouge aux pages. Sur les pages produites, chaque lien interne, la balise canonical et chaque `<loc>` du sitemap ont la forme du reglage ; fichiers hors regle | garde socle (effet), garde des pages `liens:` ; `preuve-v1-6-6.mjs` |
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
- les libelles de langue du menu, le libelle du bouton de devis et les
  sections de l'en-tete (six emplacements au plus, impose) : zones libres dans
  `src/data/navigation.ts`, depuis la v1.6.0 pour les deux dernieres
  (voir `docs/SOCLE-PARC.md`) ;
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
4. ajouter la garde en tete de `pnpm build` ;
5. depuis la v1.6.1 : ajouter `&& node ./scripts/garde-socle.mjs --pages dist/public`
   en FIN de `pnpm build`, apres le prerendu (regle du telephone, § 1.2).

Ces cinq gestes sont propres au site parce qu'ils touchent des fichiers que
le socle ne possede pas. La garde les verifie ensuite par ses mesures d'effet.

### 2.2 Changer le socle

1. modifier le fichier sous `socle/batiment/` ;
2. `node ops/garde-socle/manifeste.mjs` pour refaire les empreintes ;
3. recopier dans chaque site concerne (`poser.mjs`) ;
4. `node ops/garde-socle/preuve-opt-in.mjs` si le workflow a bouge.

Un socle modifie sans recopie rend les sites ROUGES au prochain build : c'est
voulu. La garde dit quel fichier et quelle ligne.

**La cle `version` de `MANIFESTE.json` augmente de 1 a chaque version publiee.**
Decision de Frederic du 02.11.2026. Elle vaut 2 avec la v1.4.0, 3 avec la v1.5.0, 4 avec la v1.6.0, 5 avec la v1.6.1, 6 avec la v1.6.2, 7 avec la v1.6.3, 8 avec la v1.6.4, 9 avec la v1.6.5, 10 avec la v1.6.6. Elle s'ecrit dans
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

Quand le gabarit GAGNE une zone libre (v1.6.0), `poser.mjs` greffe par NOM :
les zones du site restent, les nouvelles prennent la valeur par defaut. Quand
le site porte une zone que le gabarit ne connait pas, le compte ne correspond
plus. `poser.mjs` n'ecrit alors PAS le fichier, le nomme, et sort en erreur : il n'y
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

## Reglage slashFinal (v1.6.6) : la ligne a ecrire dans chaque site

Decision de Frederic du 11.11 : chaque site garde la forme de son canonical et de son sitemap ; ce sont les liens qui s'alignent. La forme s'ecrit dans le site, une fois, et la garde la controle.

Ou : `src/data/config.ts`, dans l'objet `SITE_CONFIG`, juste sous la ligne `domainBare: "...",`, avec la meme indentation. La valeur s'ecrit en dur (`true` ou `false`, jamais calculee).

Mesure en ligne du 11.11 (canonical de /services ou /leistungen, `<loc>` du sitemap, redirection) : 20 sites avec « / », 9 sans.

| Site | Paquet | Ligne a ajouter |
| --- | --- | --- |
| DE-helvetic-dachdecker.ch | `artifacts/helvetique-toiture` | `slashFinal: true,` |
| DE-helvetic-daemmung.ch | `artifacts/helvetic-daemmung` | `slashFinal: true,` |
| DE-helvetic-elektriker.ch | `artifacts/helvetic-elektriker` | `slashFinal: true,` |
| DE-helvetic-glaserei.ch | `artifacts/helvetic-glaserei` | `slashFinal: true,` |
| DE-helvetic-heizung.ch | `artifacts/helvetic-heizung` | `slashFinal: true,` |
| DE-helvetic-kaminfeger.ch | `artifacts/helvetic-kaminfeger` | `slashFinal: true,` |
| DE-helvetic-malerei.ch | `artifacts/helvetic-malerei` | `slashFinal: true,` |
| DE-helvetic-rohrreinigung.ch | `artifacts/helvetique-assainissement` | `slashFinal: true,` |
| DE-helvetic-sanitaer.ch | `artifacts/helvetisch-sanitaer` | `slashFinal: true,` |
| DE-helvetic-schluesseldienst.ch | `artifacts/helvetic-schluesseldienst` | `slashFinal: true,` |
| FR-helvetique-assainissement.ch | `artifacts/helvetique-assainissement` | `slashFinal: true,` |
| FR-helvetique-carrelage.ch | `artifacts/helvetique-carrelage` | `slashFinal: false,` |
| FR-helvetique-chauffage.ch | `artifacts/helvetique-chauffage` | `slashFinal: true,` |
| FR-helvetique-electricite.ch | `artifacts/helvetique-electricite` | `slashFinal: true,` |
| FR-helvetique-ferronnerie.ch | `artifacts/helvetique-ferronnerie` | `slashFinal: false,` |
| FR-helvetique-isolation.ch | `artifacts/helvetique-isolation` | `slashFinal: true,` |
| FR-helvetique-maconnerie.ch | `artifacts/helvetique-maconnerie` | `slashFinal: false,` |
| FR-helvetique-menuiserie.ch | `artifacts/helvetique-menuiserie` | `slashFinal: false,` |
| FR-helvetique-panneau-solaire.ch | `artifacts/helvetique-panneau-solaire` | `slashFinal: false,` |
| FR-helvetique-peinture.ch | `artifacts/helvetique-peinture` | `slashFinal: true,` |
| FR-helvetique-plaquiste.ch | `artifacts/helvetique-plaquiste` | `slashFinal: false,` |
| FR-helvetique-plomberie.ch | `artifacts/helvetique-plomberie` | `slashFinal: true,` |
| FR-helvetique-ramonage.ch | `artifacts/helvetique-ramonage` | `slashFinal: true,` |
| FR-helvetique-renovation-exterieure.ch | `artifacts/helvetique-renovation-exterieure` | `slashFinal: false,` |
| FR-helvetique-renovation-interieure.ch | `artifacts/helvetique-renovation-interieure` | `slashFinal: false,` |
| FR-helvetique-serrurerie.ch | `artifacts/helvetique-serrurerie` | `slashFinal: true,` |
| FR-helvetique-terrassement.ch | `artifacts/helvetique-terrassement` | `slashFinal: false,` |
| FR-helvetique-toiture.ch | `artifacts/helvetique-toiture` | `slashFinal: true,` |
| FR-helvetique-vitrerie.ch | `artifacts/helvetique-vitrerie` | `slashFinal: true,` |

Preuve par site, apres la recopie : `GARDE_SOCLE_OK` (la garde de la source refuse un site sans la ligne) ; au build, `SOCLE_LIENS_OK ... slashFinal: <valeur>)` puis `GARDE_SOCLE_PAGES_OK`. Une mauvaise valeur rend la garde des pages rouge sur les liens, le canonical et le sitemap.

