# Animations

Suite de `docs/21-skinning.md` : le squelette était là, restaient les
mouvements.

## Deux familles de clips, une seule convertible

Les 16 `AnimationClip` du build se lisent tous sans erreur, mais ils se
répartissent en deux formats incompatibles :

| `m_AnimationType` | famille | clips | courbes lisibles |
|---|---|---|---|
| **1** | legacy | 6 | **oui** — position, rotation, échelle |
| **2** | Mecanim | 10 | **non** — courbes vides |

Pour un clip Mecanim, `m_PositionCurves`, `m_RotationCurves` et
`m_ScaleCurves` sont **vides** : tout vit dans `m_MuscleClip`, un flux
compressé propre au système humanoïde d'Unity. Le décoder est un chantier de
rétro-ingénierie à part entière.

Les clips convertibles portent des courbes explicites — jusqu'à 78 courbes de
rotation, 68 de position et 72 d'échelle pour l'un d'eux, échantillonnées à
30 Hz, avec temps, valeur et tangentes par clé.

## La conversion

Une courbe Unity est repérée par un **chemin de hiérarchie** relatif à l'objet
animé (`Bras/AvantBras/Main`). Il faut donc le résoudre en descendant par les
noms depuis la racine animée, puis le traduire en index de nœud glTF.

La conversion de repère est la même que partout ailleurs : `z → −z` sur les
positions, `(x, y, z, w) → (−x, −y, z, w)` sur les quaternions. Les échelles ne
changent pas.

## Résultat

**6 animations, 1 094 canaux** sur trois corps :

| corps | animations | canaux | clips Mecanim ignorés |
|---|---|---|---|
| Brittle Hollow | 2 | 436 | 0 |
| Giant's Deep | 2 | 378 | 5 |
| Dark Bramble | 2 | 280 | 8 |
| Timber Hearth | 0 | 0 | **17** |

Timber Hearth est le cas révélateur : ses 17 clips sont **tous** en Mecanim.
Ce sont précisément les animations de personnages — les villageois, leurs
occupations. Les clips convertibles sont plutôt des mouvements d'objets.

Chargement vérifié dans Babylon : 6 groupes d'animation, 140 à 218 cibles
chacun, tous en lecture.

## Une leçon de méthode

Le premier export a produit zéro animation, et il a fallu trois diagnostics
successifs pour comprendre pourquoi — dont deux erreurs de ma part avant
d'atteindre la vraie cause :

1. le bloc d'animation était placé **avant** l'émission des nœuds, donc
   travaillait sur un index vide ;
2. mon diagnostic était lui-même mal placé et mesurait le même vide ;
3. la vraie cause n'est apparue qu'en comptant : 17 clips lus, **0 courbe**.

Les clips Mecanim sont désormais **comptés explicitement** plutôt qu'ignorés en
silence — un `continue` muet aurait laissé croire à un bug pour toujours.

## Ce qui manque

- **Les 9 clips Mecanim**, soit l'essentiel des animations de personnages.
  Décoder `m_MuscleClip` est le seul chemin, et c'est un travail à part.
- ~~**Les `AnimatorController`** ne sont pas traduits en machine à états~~ —
  **il n'y a rien à traduire**, voir plus bas.
- ~~**Les tangentes sont ignorées**~~ — portées depuis, voir plus bas.
- **Les `Avatar`** (10) et la retargetisation ne sont pas exploités.

## Les tangentes, portées

L'interpolation était linéaire, là où Unity utilise des courbes de Hermite. Les
deux familles de clips rangent leurs tangentes différemment :

- un clip **legacy** range directement `inSlope` et `outSlope` par clé ;
- un clip **Mecanim** range le cubique du segment, dont `coeff[2]` est la pente
  de sortie. La pente d'entrée de la clé suivante s'en déduit en dérivant le
  polynôme à son extrémité :

  ```
  entrée(suivante) = (3·Δv − 2·pente_sortie·Δt − coeff[1]·Δt²) / Δt
  ```

Les tangentes d'Unity et celles de glTF sont dans la **même unité** — une
dérivée par unité de temps — et se transportent donc telles quelles, sans mise à
l'échelle par le pas de temps. C'est le piège classique de `CUBICSPLINE` : la
formule d'interpolation de glTF multiplie elle-même par Δt.

### Le palier infini

Premier essai : **0 canal sur 2 011** convertible. Unity range une pente
**infinie** sur les segments dont les trois premiers coefficients sont nuls, pour
signaler un palier. Or ces segments sont les plus fréquents — un os qui ne bouge
pas d'une clé à l'autre — et un seul suffisait à disqualifier toute la courbe.

La tangente de Hermite correcte y est **0** : la valeur ne bouge pas, sa dérivée
est nulle. Avec cette lecture, **2 011 canaux sur 2 011** passent en cubique.

### Résultat

**4 022 canaux, tous en `CUBICSPLINE`** sur Timber Hearth, pour 0,4 Mo de plus
(14,1 → 14,5 Mo). Vérifié dans Babylon : les 4 022 sont chargés avec leurs
tangentes — 1 515 positions, 1 509 rotations, 998 échelles — et le poignet d'un
villageois décrit une amplitude bornée de 0,18 unité sur deux secondes, sans
valeur non finie.

La conversion de repère s'applique aux tangentes comme aux valeurs : ce sont des
dérivées, donc une transformation linéaire des composantes les transforme de la
même façon.

Le portage retombe en `LINEAR` si une tangente manque ou n'est pas finie —
mieux vaut une interpolation assumée qu'une tangente inventée.

## Les machines à états sont vides

J'ai porté « seulement l'état par défaut » en le présentant comme une limite.
En comptant, ce n'en est pas une : **les huit `AnimatorController` du build
totalisent 11 états et zéro transition.**

| contrôleur | états | transitions | `AnyState` |
|---|---|---|---|
| `Astronomer_Drums`, `FrontierVillager`, `VillagerChild`, `VillagerChild_Telescope`, `Jellyfish` | 1 | 0 | 0 |
| `Villager`, `StargazingVillager`, `Anglerfish` | 2 | 0 | 0 |

Les trois contrôleurs à deux états n'ont **aucun moyen d'aller de l'un à
l'autre** : le second état est inatteignable. Porter les transitions
n'ajouterait donc rien — il n'y a pas de machine à états dans cette alpha, il y
a un état par défaut et, parfois, un second qui n'a jamais été câblé.

C'est le même genre de constat que pour l'espace replié de Dark Bramble ou les
savoirs sans source : le manque vient du build, pas du portage.

> **Suite.** Les clips Mecanim sont décodés depuis :
> [`docs/26-muscleclip.md`](26-muscleclip.md). Deux affirmations de cette page
> y sont corrigées — le partage est de 7 clips legacy pour 9 Mecanim, et
> `m_AnimationType == 2` désigne le Mecanim *générique*, pas l'humanoïde. Les
> `Avatar` servent bien, mais pour leur table de noms, pas pour retargeter.
