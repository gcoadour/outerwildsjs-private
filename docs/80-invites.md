# Les invites qui ne devaient pas être là

Le portage poussait les invites du sac dorsal **dès qu'on n'était pas dans le
vaisseau** — c'est-à-dire presque toujours, et donc pour rien. Le build les
distribue avec beaucoup plus de parcimonie, et chaque condition dit quelque
chose.

## Elles n'existent qu'en apesanteur

```
OnBreakPlayerFieldAlignment → le composant s'ALLUME, ses 4 invites sont posées
OnInitPlayerFieldAlignment  → il s'éteint, elles sont retirées
```

Poser le pied sur une planète les fait disparaître **toutes**. C'est la suite
directe de [`79`](79-alignement.md) : les deux mêmes annonces, et un second
écouteur qu'on ne trouve qu'en les suivant.

## Les trois poussées ne viennent qu'à l'entraînement

```
Update:
    tout caché
    si caméra de carte            → rien
    sinon si autopilote ET |v| > 1 → accord de vitesse, SEUL
    sinon si entraînement ET aucun référentiel visé → les trois poussées
```

`_isTrainingMode` est posé par `OnEnterZeroGTraining`. Ce sont les invites du
**satellite cassé**, pas celles du vol libre : une fois qu'on a appris, le jeu
ne les remontre plus.

Et il ne les montre pas non plus **tant qu'on vise un référentiel** — parce que
viser veut dire qu'on sait déjà où l'on va.

> **L'accord de vitesse exclut les autres.** Quand il s'affiche, il est seul. Le
> jeu ne propose qu'une chose à la fois, et c'est la plus utile des quatre à ce
> moment-là.

Il demande une cible visée **et** plus d'**une** unité par seconde de vitesse
relative. En dessous, il n'y a rien à accorder.

## Le bâton sort en appuyant près du feu

`RoastPromptEvent.OnPressInteract` annonce `BeginRoasting` — que
`MarshmallowStick` écoute pour **sortir** le bâton — puis se met à surveiller la
distance. Dès qu'on dépasse `_roastDistance`, il annonce `StopRoasting`, et le
bâton se range.

Le portage avait une touche à lui ([`64`](64-mains.md)), en le disant
honnêtement : « `ToggleStick` n'a pas de canal dans l'alpha, c'est le tutoriel
qui l'appelle, et le tutoriel n'est pas porté ». Le déclencheur, lui, était là —
ce n'est pas un tutoriel, c'est une zone d'interaction.

L'état `_checkDist` compte : tant qu'il est faux, appuyer **annonce** ; une fois
vrai, appuyer ne re-annonce plus. **On ne ressort pas un bâton déjà sorti.** Et
`OnStopRoasting` ne le range que s'il est sorti.

> Ce lot retire une touche que le portage avait inventée. C'est la première fois
> — les cinq ajouts de [`61`](61-commandes.md) étaient tous justifiés par une
> absence, et l'une des cinq n'en était pas une.

## Et un contrôle gardait le bug

`tools/15_verify.py` demandait « **au moins deux invites à l'écran** ». Il
passait — parce que le portage affichait les invites du sac dorsal en
permanence.

Les pieds au sol, dans un champ de gravité, sans rien à interagir, le build n'en
montre **aucune**. Zéro est la bonne réponse, et le contrôle est tombé dès que
le portage s'est mis à dire vrai.

> C'est la leçon de [`49`](49-queue.md), une seconde fois : **un invariant garde
> une mesure, pas une conclusion.** La conclusion cachée ici était « il devrait
> toujours y avoir des invites », et elle s'est défendue contre sa propre
> correction.

Il garde maintenant deux choses, toutes deux mesurées : **zéro** invite de sac
dorsal les pieds au sol, et les **trois** que la carte pose quand on l'ouvre —
c'est là que la couche d'invites se vérifie, puisque c'est là que le build en
pose.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 700** vérifications (+19) |
| sur le build | 395 vérifications |
| en navigateur, avec le build | **261** contrôles (+6) |
| en navigateur, sans le build | 13 contrôles |
| annonces nommées | 36 → **40** |

## La leçon

> Une invite permanente n'est pas une aide, c'est du bruit.

Les quatre invites du sac dorsal sont, dans le build, encadrées par **trois**
conditions et deux événements. Le portage en avait fait un affichage
inconditionnel — ce qui coûte zéro ligne et annule tout le travail que le
studio y avait mis.
