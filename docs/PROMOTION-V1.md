# Promotion du pointeur `v1`

## Modèle

| Ref | Nature | Qui la déplace |
|-----|--------|----------------|
| `v1.N.0` (ex. `v1.0.0`) | **Immuable** — SHA figé, trace | Créée une fois, jamais déplacée |
| `v1` | **Mobile** — pointeur délibéré | Un humain, par geste explicite |

Les appelants référencent `…/deploy-*.yml@v1` (et `verifier-cibles.yml@v1` le cas échéant).
Ils ne pointent **jamais** sur `v1.N.0` ni sur `main`.

## Preuve d'un workflow réutilisable
Un workflow réutilisable **ne se teste pas chez lui**. Les variables de
contexte (`github.workflow_sha` vs `job.workflow_sha`, dépôt courant, etc.)
n'ont pas la même valeur selon qu'il tourne pour lui-même ou pour un
appelant. Toute preuve d'un câblage (checkout d'un script, secret hérité,
ref résolue) doit venir d'un dépôt appelant réel, épinglé temporairement
sur la ref sous test si besoin.

## Checkout des scripts du dépôt deploy
Dans un workflow réutilisable, tout `actions/checkout` qui tire un script de
**ce** dépôt (`ops/verrou-hote`, `ops/garde-sitemap`, …) doit utiliser
`job.workflow_repository` et `job.workflow_sha` — jamais le nom du propriétaire
en dur, et jamais l'absence de `ref` (qui prendrait `main` flottant). Un
appelant épinglé sur `@v1` doit exécuter la garde **et** le verrou du même SHA.
Mesuré : sans `ref`, « Scripts verrou hôte » prenait `main` alors que
`uses: …@v1` servait la garde de `v1`.

`github.repository` / `github.sha` désignent l'appelant : les utiliser ici
reproduit l'échec `not our ref` (run 39195484929).

## Visibilité publique (contrainte de migration)
Ce dépôt est **public** pour que les appelants checkoutent ses scripts avec le
jeton par défaut, sans secret hérité. Le rendre privé dans une organisation
casse les deux checkout (garde + verrou) chez tous les appelants, sauf à
introduire un PAT/org secret hérité — ce qui a déjà figé le parc du 1er au 16
octobre 2026. Options à trancher avant transfert : rester public, ou secret
d'organisation hérité avec preuve depuis un appelant.



Un tag couvre **tout** le dépôt : `deploy-infomaniak`, `verifier-cibles` — même SHA.

## Protection du tag `v1*`

Ruleset GitHub **proteger-tags-v1** (cible `tag`, motif `refs/tags/v1*`) :
interdiction de mise à jour et de suppression, sauf contournement du rôle
**Admin** du dépôt. Un `--force` au hasard est refusé ; le déplacement reste un
geste délibéré du propriétaire.

Voir : https://github.com/Helveticleads/helvetic-deploy/rules/25349145

## Qui décide, sur quelle preuve

Frédéric décide. Un CI vert de helvetic-deploy ne suffit pas : il ne bâtit
aucun site.

Avant de déplacer `v1` :

1. Le changement est sur `main`, actionlint / preuves du dépôt verts.
2. **Épreuve** sur les sites dont le `build` lit l’historique git, **plus** un
   site dont le `build` ne le lit pas (témoin négatif : le clone complet ne
   casse rien ailleurs). Pas de déploiement, pas de bascule de `current`.
3. **GO explicite** de Frédéric entre l’épreuve et le déplacement du pointeur.

## Promouvoir une nouvelle version vers le parc

1. Fusionner sur `main` le changement voulu — **sans** déplacer `v1`.
2. Vérifier CI sur `main` (actionlint, preuves locales pertinentes).
3. Éprouver (sites à historique + témoin négatif). Obtenir le GO.
4. Créer le tag immuable au SHA de `main` :
   ```bash
   git fetch origin main
   git tag -a v1.N.0 origin/main -m "helvetic-deploy v1.N.0 — <motif>"
   git push origin v1.N.0
   ```
5. Sonde KPI : lire l’écart `main` ↔ `v1` (doit montrer les commits à promouvoir).
6. Déplacer le pointeur mobile (`--force-with-lease`, contournement Admin) :
   ```bash
   git ls-remote origin refs/tags/v1 'refs/tags/v1^{}'   # avant : l'objet etiquette, puis son commit
   git fetch origin --tags --force
   git rev-parse 'v1^{commit}' 'v1.N.0^{commit}'
   git tag -d v1
   git tag -a v1 'v1.N.0^{commit}' -m "helvetic-deploy v1 -> v1.N.0 (<motif>)"
   git push --force-with-lease=refs/tags/v1:<objet etiquette lu par ls-remote> origin refs/tags/v1
   git ls-remote origin refs/tags/v1 'refs/tags/v1^{}'   # apres : le commit doit etre celui de v1.N.0
   ```
   **Le bail porte sur l'OBJET ETIQUETTE de `refs/tags/v1`**, relu par
   `git ls-remote origin refs/tags/v1` juste avant le push, JAMAIS sur le SHA du
   commit. `v1` est une etiquette annotee : la reference distante porte l'objet
   etiquette, et un bail pose sur le commit est refuse (« stale info », vecu le
   05.11.2026 : bail sur le commit `1e4339a` au lieu de l'objet `f3f0f04`).
   Verification avant et apres par `ls-remote` et `rev-parse ^{commit}`.
   Un bail refuse : STOP, relire, et ne JAMAIS passer a `--force` sans le GO
   explicite de Frederic, dans la fenetre de l'exception ci-dessous.

   **Exception écrite (Frédéric, 05.11.2026), à reprendre telle quelle par les
   sessions :** Exception à « jamais de force push » accordée par Frédéric pour
   la SEULE étiquette refs/tags/v1, et SEULEMENT pendant la fenêtre où il a levé
   la protection proteger-tags-v1 ; vérification juste avant et juste après ; la
   règle reste absolue pour toutes les branches et toutes les autres étiquettes.
7. Vérifier la sonde : `v1` = `v1.N.0` = `main` (écart = 0 commits).
8. Optionnel — un dépôt témoin : run Deploy, confirmer `uses: …@v1` au SHA attendu.

## Revenir en arrière

1. Identifier le SHA sûr (souvent `v1.(N-1).0`).
2. Recréer `v1` sur ce SHA (même contournement Admin, même procédure).
3. Ne **pas** supprimer les tags `v1.N.0` (trace).
4. Les runs en cours qui avaient déjà résolu `@v1` gardent l’ancien SHA jusqu’au prochain déclenchement.

## Quelle version sert le parc

À tout moment : le SHA de `v1`. Les tags `v1.N.0` nomment les versions figées.
L’écart `v1..main` (sonde `sonde-epingle`) mesure le gel : s’il croît sans
promotion, le parc a cessé de bouger — ce n’est pas un silence sain.

## Ce que ce modèle n’est pas

- Ce n’est **pas** `@main` : `main` bouge à chaque fusion ; `v1` seulement par geste.
- Ce n’est **pas** N PR site par promotion : une seule opération de tag.

## Organisation cible (préparation)
Nom tranché : `premium-helvetic-leads` (nom commercial, pas l'entité juridique).
Ne rien transférer tant que les quatre sites nuisibles neufs ne servent pas leur
contenu. Pilote hors prod : `FR-helvetique-ia.ch` ou `FR-helvetique-web.ch`,
pas un des quatre. Ordre : pilote → préparer les `uses:` → transférer
`helvetic-deploy` → fusionner les `uses:` → reste du parc.
