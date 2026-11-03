# Socle du parc (v1.6.0)

Decision de Frederic du 03.11.2026 : on etend le socle du batiment au parc,
au lieu d'en ecrire un second. La v1.6.0 ajoute ce qu'il faut aux sites du
parc, sans changer le rendu d'un seul site du batiment. La liste de
`docs/SOCLE-BATIMENT.md` reste la reference ; ce document dit ce qui s'ajoute.

ia, web et monjardiniersuisse restent hors empreinte. Le chat vient apres le
batiment.

---

## 1. Ce que la v1.6.0 ajoute

| Ajout | Ou | Valeur par defaut | Verifie par |
|---|---|---|---|
| Le drapeau `ligne` | `SITE_CONFIG.ligne`, lu par `telephone()` dans `src/data/navigation.ts` | absent, donc vrai : rendu inchange | `preuve-v1-6-0.mjs` |
| Le libelle du bouton de devis | zone libre « libelle du bouton de devis » de `src/data/navigation.ts` | vide : « Devis gratuit » / « Offerte anfragen » | `preuve-v1-6-0.mjs` |
| Les sections de l'en-tete | zone libre « sections de l'en-tete, six emplacements au plus » | les six emplacements du batiment | garde socle, mesure 1 ter ; le module refuse de se charger au dela de six |
| L'horaire d'intervention | `src/components/socle/HorairesIntervention.tsx`, valeur `SITE_CONFIG.horairesIntervention` | absent : rien n'est rendu | garde socle, empreinte ; `preuve-v1-6-0.mjs` |
| La greffe par nom | `ops/garde-socle/poser.mjs` | sans objet | `preuve-v1-6-0.mjs` |
| Le pied et le contact du parc | garde socle, mesure 7 | eteinte sans drapeau `ligne` : batiment inchange | `preuve-v1-6-0.mjs` |

**Le drapeau `ligne`.** Regle du 03.11 : aucune icone de telephone sans lien
`tel:`, aucun horaire d'appel sans ligne. Avec `ligne: false`, l'en-tete, le
menu replie et la barre collante du bas ne rendent ni numero, ni bouton
« Appeler », ni icone, meme si `SITE_CONFIG.phone` est encore ecrit. Le pied
et la page contact appartiennent au site : ils doivent passer par
`telephone()` au lieu de `phoneHref()` (geste du site, voir § 3).

**Le pied et le contact du parc (mesure 7).** Decision de Frederic du 03.11 :
la garde les verifie. Elle s'allume des que `src/data/config.ts` declare
`ligne` (chaque site du parc le declare a la pose, `true` ou `false`) et
refuse, dans tout composant « footer » ou qui monte `<footer`, et dans toute
page « contact » / « kontakt » :
1. un `tel:` ecrit a la main ou un appel a `phoneHref()` : le lien vient de
   `telephone()`, donc jamais de `tel:` sans numero ;
2. une icone de telephone (`lucide-react`, nom qui contient `Phone`) hors d'un
   lien dont le `href` vient de `telephone()` ;
3. un horaire d'appel : heure (« 8:00 », « 8h30 », « 7 Uhr », « 8h-12h »),
   « Öffnungszeiten », « horaires d'ouverture », ou un champ `.hours` /
   `.openingHours` rendu. Une ligne etiquetee « Intervention » / « Einsatz »,
   ou `<HorairesIntervention />`, reste permise ; une duree (« d'1h a 1h30 »)
   n'est pas un horaire.

Les 29 sites du batiment ne declarent pas `ligne` : la mesure s'y tait, leur
rendu ne change pas (contre-epreuve sur les 29).

**Le plafond de six.** Il reste IMPOSE. Les emplacements sont devenus une zone
libre pour qu'un site nomme les siens (« Prestations », « Lieux »), mais :
1. `navigation.ts` jette une erreur au chargement si la zone declare plus de
   six emplacements, ou si la barre en porte plus de six : le prerendu echoue ;
2. la garde compte les emplacements de la zone (mesure 1 ter) et refuse le
   septieme ;
3. la constante `SIX` et ces deux controles sont HORS zone, donc tenus par
   l'empreinte.

**L'horaire.** Un horaire d'intervention est permis s'il est etiquete :
`HorairesIntervention` pose toujours « Intervention : » ou « Einsatz : »
devant la valeur. C'est le seul chemin du socle qui rend un horaire.

**La greffe par nom.** Quand le gabarit gagne une zone, la copie d'un site n'a
pas le meme compte. `poser.mjs` greffe alors par NOM de zone : les zones du
site restent les siennes, les zones nouvelles prennent la valeur par defaut,
qui ne change aucun rendu. Une zone du site que le gabarit ne connait pas, ou
un nom en double, reste un refus. Sans cela, reposer la v1.6.0 sur les 29 sites
du batiment aurait ete refuse partout (`navigation.ts` passe de 1 a 3 zones).

**La barre haute** des cinq sites du lot 1 n'entre PAS au socle (decision du
03.11) : un seul en-tete, celui du batiment.

## 2. La version

`MANIFESTE.json` passe en version 4. Douze fichiers : les onze de la v1.5.0 et
`src/components/socle/HorairesIntervention.tsx`.

## 3. Les sites du parc en monorepo : les raccords

Le socle importe cinq modules que le SITE possede. Les sites du batiment les
ont tous ; ceux du parc non. Releve du 03.11 :

| Site | Paquet | Raccords a ecrire avant la pose |
|---|---|---|
| garten | `artifacts/helvetic-garten` | `data/config.ts`, `components/Logo` |
| hochzeit | `artifacts/helvetic-hochzeit` | `pagesForRoute` et `NotFound` dans `routes`, `SITE_CONFIG`, `phoneHref`, `phoneMention`, `components/Logo` |
| pool | `artifacts/helvetic-pool` | `data/config.ts` |
| reinigung | `artifacts/helvetic-reinigung` | `SITE_CONFIG`, `phoneHref`, `phoneMention` |
| vermoegen | `artifacts/helvetic-vermoegen` | `pagesForRoute` et `NotFound`, `data/config.ts`, `components/Logo` ; chemins sous `/de` |
| whirlpool | `artifacts/helvetic-whirlpool` | `phoneHref`, `phoneMention`, `components/Logo` |
| demenagements | `artifacts/helvetique-demenagements` | `data/config.ts`, `components/Logo` |
| dentaire | `artifacts/helvetique-dentaire` | `pagesForRoute` et `NotFound`, `data/config.ts`, `components/Logo` |
| elagage | `artifacts/helvetique-elagage` | `pagesForRoute` et `NotFound`, `data/config.ts`, `components/Logo` |
| evenementiel | `artifacts/helvetique-evenementiel` | `pagesForRoute` et `NotFound`, `data/config.ts`, `components/Logo` |
| jardin | `artifacts/helvetique-jardin` | `data/config.ts`, `components/Logo` |
| mariage | `artifacts/helvetique-mariage` | `SITE_CONFIG`, `phoneHref`, `phoneMention` |
| nettoyage | `artifacts/helvetique-nettoyage` | `SITE_CONFIG`, `phoneHref`, `phoneMention`, `components/Logo` |
| patrimoine | `artifacts/helvetique-patrimoine` | `data/config.ts`, `components/Logo` |
| piscine | `artifacts/helvetique-piscine` | `data/config.ts`, `components/Logo` |
| spa | `artifacts/helvetique-spa` | `phoneHref`, `phoneMention`, `components/Logo` |

Les modules : `@/data/config` (`SITE_CONFIG`, `phoneHref`, `phoneMention`),
`@/components/Logo`, `@/routes` (`pagesForRoute`, `NotFound`), `@/lib/utils`
(`cn`), et les paquets `wouter` et `lucide-react` (presents partout). Ce sont
des fichiers du site, hors empreinte : chaque pose les ecrit dans la meme PR,
puis passe `garde_socle: true` avec `garde_socle_chemin` sur le paquet. Les
sites du parc sans numero declarent `phone: ""` et `ligne: false`.

## 4. Ce que demanderait la publication

1. **Epreuve** : la PR de la v1.6.0 en brouillon, CI verte (`preuves-socle`,
   dont `preuve-v1-6-0.mjs` et sa contre-epreuve sur v1.5.0), et la
   contre-epreuve sur les 29 sites du batiment refaite sur leur `main` du jour
   de la publication (certains auront change en recopiant la v1.5.0).
2. **Revue et fusion** de la PR par Frederic, puis tag `v1.6.0` sur le commit
   fusionne.
3. **Exception du ruleset**, posee par Frederic seul, le temps de deplacer
   `v1` sur `v1.6.0`, puis retiree (liste vide), comme pour la v1.5.0.
4. **Recopie** : des que `v1` pointe sur la v1.6.0, la garde de la CI compare
   chaque site du batiment au socle du workflow, donc les 29 passent ROUGES a
   leur prochain build tant qu'ils ne sont pas reposes (§ 2.2 de
   SOCLE-BATIMENT.md : c'est voulu). Le batiment se recopie donc d'abord :
   `poser.mjs`, greffe par nom, aucun changement de rendu (contre-epreuve).
   Ensuite le parc, un site a la fois par hebergeur, pilotes jardin (lot 1)
   et pool (lot 3), chacun avec ses raccords et ses six entrees validees.
   Ordre decide par Frederic le 03.11 : le batiment d'abord, et seulement
   APRES la fin de la recopie de la v1.5.0 ; publier la v1.6.0 ; reposer les
   29 sites du batiment sans changement de rendu ; puis le parc site par
   site, pilotes jardin et pool.
