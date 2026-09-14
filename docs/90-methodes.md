# Le dénominateur qui ne voyait pas les méthodes

`scripts/lois.mjs` compte ce que le portage a écrit et n'appelle pas. Il a été
tenu à zéro pendant huit lots. Il comptait les **fonctions exportées** et les
**classes exportées** — et rien d'autre.

[`docs/89`](89-pose.md) l'a pris en défaut : `Ship.padLanding` était écrite,
commentée, éprouvée par un test, et appelée par personne pendant un lot entier.
Elle était une **méthode**, donc invisible. Ce n'est pas le compte qui était
faux, c'est ce qu'il comptait — la quatrième fois que ce dépôt se ment sur ce
qu'il mesure ([`docs/47`](47-effets-image.md), [`docs/69`](69-assise.md),
[`docs/71`](71-quantique.md), [`docs/74`](74-etalons.md)).

## Ce qu'il fallait pour les voir

Une méthode se reconnaît à son indentation de deux espaces suivie d'une
parenthèse — et le premier essai a rendu **treize `.return`** : un `return (`
au milieu d'une fonction libre a exactement cette forme. Il a fallu délimiter le
corps de chaque classe exportée par son accolade fermante en colonne zéro, et
écarter les mots-clés du langage.

> Un compte qui se trompe sur ce qu'il compte est pire que pas de compte.

L'appel, lui, se reconnaît à un **point** : `x.nom(` a un point, la définition
n'en a pas. Les accesseurs comptent pareil — `get x()` se lit `.x`.

## Ce qu'il trouve

**Trente-cinq méthodes que rien n'appelle, dans vingt-trois modules.**
Vingt-deux d'entre elles sont *éprouvées* — un test les fait tourner, et c'est
précisément le piège que `lois.mjs` existe pour déjouer : une loi éprouvée a
l'air vivante.

Elles se rangent en familles, et c'est cette forme qui dit quoi en faire :

| famille | exemples | ce que c'est |
|---|---|---|
| un accesseur qu'on a écrit pour l'écran et jamais affiché | `.burnt`, `.crustProgress`, `.chargeFraction`, `.cloudCount`, `.totalShatterable` | une mesure que le moteur tient et que rien ne lit |
| une transition du build sans déclencheur dans le portage | `.enterTelescope`, `.exitTelescope`, `.resume`, `.resetSimulation`, `.die` | la loi est là, le geste qui l'appelle manque |
| une commande d'interface sans bouton | `.disable`, `.deactivateControls`, `.padAxis`, `.padButton` | le portage l'a écrite en écrivant son voisin |
| un raccourci de calcul dont l'appelant a été réécrit | `.toWorld`, `.toRender`, `.keep`, `.fadeIntensity` | l'appelant a changé, la méthode est restée |

Aucune de ces quatre familles n'est du travail perdu : ce sont des **lois déjà
lues dans l'IL**, écrites correctement, et qu'il ne reste qu'à brancher. C'est
la situation la plus confortable qu'un portage puisse trouver — et la plus
facile à ne jamais voir.

## Le compte remonte, et c'est le but

`lois.mjs` affichait 0. Il affiche 35. Le dépôt n'a pas régressé d'une ligne :
l'outil a cessé de regarder ailleurs. C'est le même mouvement qu'à chacune des
fois précédentes — le compte monte quand l'outil devient honnête, et c'est à ce
moment-là qu'il recommence à servir.

Les deux échappatoires restent les mêmes et valent pour les méthodes :
`// @mesure` pour un étalon, `// @vide <raison>` pour une loi dont la liste
d'entrées est vide dans ce build. Ni l'une ni l'autre ne s'applique à ces
trente-cinq-là : elles attendent un appelant.
