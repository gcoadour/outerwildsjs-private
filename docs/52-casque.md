# Le casque, l'alarme et les voyants — le lot qu'on avait eu raison de reporter, et tort de fermer

[`44-reste-a-migrer.md`](44-reste-a-migrer.md) classait l'interface en lot 6 et
la donnait « à lire pour **comparer**, pas forcément pour porter ».
[`46`](46-migration-lots.md) a tranché dans ce sens :

> Le portage a son propre HUD ([`28-hud.md`](28-hud.md)) : remplacer un HUD qui
> marche par une transposition n'est pas un gain.

C'était juste — pour la **mise en page**. Ça ne l'était pas pour quatre classes
de ce lot, parce qu'aucune des quatre n'est une question de disposition. Le
casque qui traîne derrière le regard, l'alarme à trente pour cent, les voyants
qui clignotent à la demi-seconde, la notification qui s'efface : ce sont des
**comportements**, et le portage n'en avait aucun.

La leçon est petite mais nette : *« on a son propre X »* répond à *« faut-il
reprendre la forme de X ? »*, et pas à *« que fait X ? »*.

## Le casque traîne

```
dx = clamp(axeRotation, −1, 1) × −0,005
dy = clamp(axeRegard,   −1, 1) × −0,005      (bridé aux extrêmes)
x ← Lerp(x, dx, lag)        y ← Lerp(y, défaut + dy, lag)
```

Cinq millièmes, **en sens inverse** du mouvement, rejoints d'un `lag` par image.
C'est exactement ce qui donne l'impression de *porter* quelque chose : le verre
a de l'inertie, et il rattrape la tête.

> **La scène contredit le constructeur, une seconde fois.** `_helmetLagSpeed`
> vaut 0,1 dans le constructeur et **0,05** sur l'instance. Le casque traîne
> donc deux fois plus que le code seul ne le laisse croire — et c'est l'instance
> qui gagne, comme la course de l'ascenseur ([`51`](51-tour.md)).

L'axe vertical est bridé dans la bande d'angles `[70, 280]`. En angles d'Euler
d'Unity, regarder vers le bas va de 0 à 90 et vers le haut de 270 à 360 : cette
bande est celle qu'on **ne peut pas atteindre**, et la tester revient à couper
le suivi aux extrêmes de tangage.

Quatre états, dans l'ordre du build : on l'enfile (il **descend** sur la tête,
cible −0,6, il s'arrête à zéro et annonce `HelmetHUDActivated`), on le retire
(il remonte vers 2), porté, rangé.

## L'alarme

`MasterAlarm.Update` tient en une ligne : sous **trente pour cent** de coque,
elle part ; au-dessus, elle se coupe. Le portage affichait un chiffre, et rien
ne criait.

## Les voyants clignotent ensemble

`HUDDamageDisplay.Update` : le premier voyant est allumé **en continu** dès le
moindre dégât ; les suivants **clignotent** à la demi-seconde, un par pièce
abîmée — et le clignotement est **global**, tous en phase. Un tableau de bord où
chaque voyant bat à son rythme serait un sapin de Noël.

## Les notifications, et la guimauve

`NotificationManager` n'en tient **qu'une** : une nouvelle remplace la
précédente, et elle s'efface au bout de sa durée.

`RoastPromptEvent` ×8 — les huit feux de camp. Une fois qu'on grille, s'éloigner
de plus de **quatre unités** coupe le grillage et remet l'interaction en état.
Les huit sérialisent la distance, toutes à la même valeur que le constructeur.
C'est le cas ordinaire, et il valait d'être **vérifié** plutôt que supposé : les
deux pages précédentes avaient trouvé deux contre-exemples.

## Le compte

| | [`51`](51-tour.md) | ici |
|---|---|---|
| lues par le moteur | 137 | **142** |
| **sans aucun lecteur** | 47 (62 inst.) | **41** (49) |

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : les deux valeurs de
lag et laquelle gagne, le repli qui se sait repli ; le casque posé à zéro, le
premier pas qui ne fait qu'un vingtième du chemin, le sens **inverse** du
regard, la cible rejointe, et la bande morte où le suivi vertical est coupé ;
les trente pour cent et les deux transitions annoncées une seule fois ; le
voyant général continu, les autres en phase, une pièce saine qui ne clignote
jamais ; la notification unique que la suivante remplace, et son effacement ;
les quatre unités de la guimauve.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : huit invites,
toutes à quatre unités ; un casque à 0,05 et non 0,1 ; une alarme, posée sur le
vaisseau ; un afficheur de dégâts, un gestionnaire de notifications, un bâton à
guimauve.

## Ce qui reste dehors, et pourquoi

Le reste du lot 6 est bien ce que [`46`](46-migration-lots.md) disait : de la
mise en page. `CustomAspectRatio` ×3 force des proportions d'écran sur trois
caméras secondaires ; `MinimapHUD`, `ObservatoryMap` et `MapOpenGL` sont les
dispositions de la minicarte et de la carte, que le portage a déjà à lui
([`19-carte.md`](19-carte.md), [`28-hud.md`](28-hud.md)) ; `HUDCameraScript` et
`DebugHUD` sont respectivement un réglage de caméra d'interface et un outil de
studio.
