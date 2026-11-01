# ops/garde-socle

La garde de conformite du socle batiment, et ses deux outils.

| Fichier | Ce qu'il fait |
|---|---|
| `verifier.mjs` | la garde. Compare la copie d'un site au gabarit, et pose les mesures d'effet. C'est ce fichier qui est copie dans chaque site sous `scripts/garde-socle.mjs`. |
| `manifeste.mjs` | refait `socle/batiment/MANIFESTE.json`, les empreintes du contenu normalise. A relancer apres toute modification du socle. |
| `poser.mjs` | copie le socle sur un site, et y depose la garde et le manifeste. |
| `preuve-opt-in.mjs` | prouve que l'entree `garde_socle` de `deploy-infomaniak.yml` ne change rien pour les appelants qui ne la passent pas. |

## Ce qu'elle mesure

Deux choses de nature differente, et il faut les distinguer.

**Le texte.** Les fichiers du socle doivent etre identiques a la reference,
zones libres retirees. C'est une garde PAR NOM au sens de `GARDES-PAR-NOM.md` :
elle exige une forme. C'est assume, parce que la decision du 01.11 est
justement « gabarit recopie avec garde de conformite » : ce qui est garde,
c'est que la copie n'a pas derive.

**L'effet.** Comparer du texte ne prouve pas qu'un site se comporte bien. La
garde pose donc six questions qui ne dependent d'aucune reference :

1. chaque gabarit de page passe par `Layout`, la page introuvable comprise ;
2. le numero du site est vide ou au format suisse, et le faux numero de
   demonstration n'existe nulle part ;
3. `consent: true` n'est pas ecrit en dur, et le champ piege part dans la charge ;
4. tout fichier qui construit une charge de lead monte le bloc de consentement ;
5. la politique de securite du contenu est en rapport seul et porte les deux
   origines du widget ;
6. le prerendu rend la page introuvable au lieu de recopier la coquille.

## Les deux niveaux

```
node scripts/garde-socle.mjs                       # dans le build du site, hors ligne
node ops/garde-socle/verifier.mjs <site> \
     --reference socle/batiment                    # dans la CI, contre la reference reelle
```

Le premier compare des empreintes portees par le site lui meme : il attrape la
derive ordinaire. Le second compare aux fichiers reels du socle tires au SHA du
workflow : il attrape le cas ou quelqu'un a modifie la copie ET le manifeste du
meme geste.

Mode d'emploi complet et liste de ce qu'un site doit avoir :
`docs/SOCLE-BATIMENT.md`.
