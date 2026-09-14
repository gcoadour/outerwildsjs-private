# Le suivi de référentiel — et un palier que le build n'atteint jamais

Les deux dernières pièces visibles de la queue, et elles disent la même chose de
deux façons : **ce qui compte dans l'espace n'est pas où l'on est, c'est comment
on se déplace par rapport à quelque chose.**

## La lecture de la cible

`ReferenceFrameTracker.UpdateRelativeMotion` :

```
v      = −vitesseRelative          ← le build INVERSE d'abord
d      = monCentre − positionDuRéférentiel
proj   = Project(v, d)
zSpeed = |proj| × −signe(d · proj)
xy     = v − proj
xyOffset = xy × |d| × 0,005
```

Le build commence par **inverser notre vitesse** : il raisonne sur le mouvement
apparent de la cible, pas sur le nôtre. Le signe de `zSpeed` en sort donc
**négatif en approche**, ce qui surprend jusqu'à ce qu'on se souvienne de
l'inversion du début.

La couleur du cercle suit, en HSV : **teinte 0 (rouge)** sous −1, **teinte 140
(vert)** au-dessus de +1, et **blanc** (saturation 0) entre les deux. Se
rapprocher est rouge.

Le décalage des flèches grandit avec la **distance** : de loin, une petite
dérive se voit autant que de près une grande.

Et la lecture passe en kilomètres **au-delà de cinq mille mètres** — pas de
mille. Un seuil inhabituel, et mesuré.

## Le palier inatteignable

L'IL de la tolérance de « trajectoire directe », lu dans l'ordre des **sauts** :

```
t = 1
si dist ≤ 100  → aller au test suivant
sinon            t = 10, et FIN
si dist ≤ 1000 → FIN
sinon            t = 100
```

Le dernier `sinon` demande `dist ≤ 100` **et** `dist > 1000`. Il est
**inatteignable**. Le palier à 100 est du code mort, et la tolérance réelle ne
connaît que deux valeurs : **1** sous cent unités, **10** au-delà.

> **J'avais d'abord écrit les trois paliers « évidents »** — 1, 10, 100 aux
> seuils 100 et 1 000 — parce que c'est manifestement ce que l'auteur voulait.
> C'est l'invariant qui a refusé, et il avait raison : on porte ce que le build
> **fait**.

C'est le cinquième morceau de code mort de cette série, après `_currentSkyAlpha`
([`41`](41-ciel.md)), `_startAlpha` des nuages ([`48`](48-ciel-mesure.md)), les
modificateurs de dégâts ([`49`](49-queue.md)) et le `SubModule` vide de
`DistantStars` ([`57`](57-particules.md)).

## La poussière de vitesse

`MotionParticleBehavior.Update`, avec `s` la norme de la vitesse relative :

| | |
|---|---|
| émission | seulement si un référentiel est **visé**, et hors carte |
| vitesse | `s` |
| taille | `s × 0,1` |
| durée de vie | `clamp(8 − s × 0,1, 0,7, 8)` |
| débit | `clamp(s × 0,1, 1, 100)` |
| alpha | **0 sous 30 u/s**, sinon `clamp(s × 0,01, 0, 0,2)` |

Deux choses valent d'être relevées.

**La poussière n'apparaît qu'au-delà de trente unités par seconde.** En dessous,
l'espace reste vide — et c'est ce qui donne son prix à la vitesse.

**La durée de vie diminue pendant que le débit augmente.** Plus on va vite, plus
il y a de traits, et plus ils sont courts. Le système **regarde** la direction du
mouvement (`LookAt`) : les traits sont alignés sur le déplacement, pas semés au
hasard.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : la vitesse négative
en approche et positive en fuite, le rouge, le vert et le blanc entre les deux ;
les deux paliers de tolérance **et** le troisième qui est prévu sans être
atteint ; le décalage des flèches qui suit la distance **et le signe de la
vitesse inversée** ; les mètres sous cinq mille et les kilomètres au-delà ; pas
de poussière sans cible ni sur la carte, rien de visible sous trente unités par
seconde, l'opacité qui plafonne, la durée de vie qui diminue quand le débit
augmente, et son plancher.

## Trois pièces de plus, et une correction

**Les six buses du vaisseau… miniature.** `ThrusterParticleController` allume la
buse **opposée** au mouvement — une accélération vers la droite allume celle de
gauche, parce que c'est elle qui pousse. Écrit à l'envers, les flammes sortent
du côté où le vaisseau va, et c'est le même piège que
[`46`](46-migration-lots.md) avait relevé sur les dix buses du sac dorsal.

Mais le porteur est `ModelShip_Body` : c'est le petit vaisseau télécommandé de
l'observatoire, pas celui du joueur. Je l'avais écrit « du vaisseau » à vue du
nom de la classe ; c'est le champ `body` de l'extraction qui l'a corrigé — comme
il avait corrigé « dans Dark Bramble » pour l'interrupteur du regard
([`50`](50-regard.md)).

Et comme le vaisseau miniature **n'est pas porté** — `playerdata.js` le disait
déjà à propos de ses compteurs d'essais — les six buses restent éteintes. La loi
est écrite et éprouvée, sa liste d'entrées est vide, et on le dit : c'est le même
choix que pour les dix-huit bouffées de [`46`](46-migration-lots.md).

> **Plus vrai depuis [`78`](78-modele.md).** Le modèle réduit vole : la console
> déportée existe, son jeu de commandes aussi ([`70`](70-modes.md)), et les six
> buses ont une entrée à lire. La phrase ci-dessus était juste **au moment où
> elle a été écrite**, et elle est devenue fausse sans que rien ne bouge dans le
> fichier qui la portait. C'est le risque des justifications : elles
> vieillissent en silence.

> Les six systèmes s'appellent **tous** `Thruster_Small`. Troisième endroit du
> portage où le nom du build ne suffit pas, après les nuages
> ([`48`](48-ciel-mesure.md)) et les pivots de tornade ([`49`](49-queue.md)) —
> d'où un pilotage par **position**.

**Le volume composé.** `CompoundTriggerVolume` tient un **compte par collider**
à travers tous ses enfants :

```
entrée dans un enfant   si le collider n'est pas suivi → OnEntry, puis +1
sortie d'un enfant      −1 ; si le compte tombe à zéro → OnExit
```

Une forme faite de plusieurs cylindres qui se chevauchent — l'entonnoir de
sable — ou de plusieurs boîtes — la tempête de sable — émet donc **une** entrée
et **une** sortie, quel que soit le nombre d'enfants traversés. Sans ce compte,
passer d'un cylindre au suivant émettrait une sortie puis une entrée, et tout ce
qui écoute clignoterait.

**La sonde ancienne** pousse à **cinquante** d'accélération locale vers l'avant,
à chaque pas, sans viser ni s'arrêter.

## Le compte

| | instances |
|---|---|
| posées dans `level0` | **1 390** |
| **lues, en tout** | **1 356 — 97,6 %** |
| extraites, non lues | 20 |
| sans aucun lecteur | 14 |

Les **34** qui restent, une par une :

| | n | pourquoi pas |
|---|---|---|
| `InertiaTensorCalibrator` | 14 | ce portage n'a pas de tenseur d'inertie ([`49`](49-queue.md)) |
| outils de studio | 7 | `DebugBreakAllChildren` ×2, `DebugHUD`, `DebugInputManager`, `LoadTimeTracker`, `TapeMeasure`, `ResetSimulationTrigger` |
| mise en page | 7 | `CustomAspectRatio` ×3, `HUDCameraScript`, `MapOpenGL`, `MinimapHUD`, `ObservatoryMap` — le portage a les siennes ([`52`](52-casque.md)) |
| infrastructure | 3 | `InputInitializer`, `Locator`, `LODBiasManager` — des singletons de câblage, sans comportement propre |
| `Detonator` | 1 | une bibliothèque d'explosion tierce ; le portage a sa supernova ([`32`](32-mort.md)) |
| `DrawSoundWave` | 1 | l'onde du télescope : 500 points, décalage (0,4 ; −0,3). Dessin pur, non porté |

C'est le fond du tonneau, et il est nommé.

## La leçon

> « jamais » est un chiffre, donc il se mesure ([`57`](57-particules.md)) — et
> **ce que l'auteur voulait n'est pas ce que le build fait**.

Les trois paliers 1 / 10 / 100 sont si manifestement l'intention qu'on les écrit
sans y penser. Le build en exécute deux. Porter l'intention plutôt que le
comportement aurait donné un indicateur qui tolère cent unités de dérive là où le
jeu en tolère dix — et personne ne l'aurait jamais su, parce que le résultat
aurait été *raisonnable*.
