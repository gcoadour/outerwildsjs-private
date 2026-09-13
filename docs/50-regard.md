# On allume en regardant — et un recensement qui compte enfin juste

Deux choses dans cette page, et la seconde explique pourquoi la première avait
pu rester invisible si longtemps.

## Le recensement sait maintenant qu'on traduit

[`47`](47-effets-image.md) avait corrigé le recensement une première fois : il
comptait les mentions en **commentaire** comme des lecteurs, et une couche de
rendu entière s'était cachée derrière une phrase. Le compte honnête était passé
de 59 à 77 classes sans lecteur.

Il avait alors l'erreur inverse. Ce dépôt **traduit** : `sky.js` porte
`SkyBehavior` sous `lookAtSun()` et `CloudTextureController` sous
`attachClouds()`, et aucun de ces noms n'y figure. Compter ces classes absentes
est faux ; les compter présentes parce qu'un commentaire les cite l'est aussi.

D'où un marqueur, et non de la prose :

```js
// @lit SkyBehavior, CloudTextureController, DistantStarController
```

Il se grep, il ne s'écrit pas par accident, et il oblige à **nommer** ce qu'on
prétend lire. Un module qui triche se voit : la classe est dans le marqueur et
nulle part dans le code. Onze modules en portent un.

| | [`47`](47-effets-image.md) | [`49`](49-queue.md) | ici |
|---|---|---|---|
| lues par le moteur | 103 | 116 | **131** |
| **sans aucun lecteur** | 77 (180 inst.) | 62 (100) | **51** (66) |

Le chiffre a monté en devenant juste, puis il descend parce qu'on travaille. Les
deux mouvements comptent.

## Ce que le recensement a fait remonter

`GazeSwitch`, `GazeWebAnimator`, `EnergyGate` — trois classes enchaînées, une
instance chacune, et **une mécanique entière** que le portage n'avait pas.

Rien ne signalait son absence. Il n'y a pas d'invite à l'écran, pas de touche à
presser, pas de son : une sphère de six unités de rayon, posée sur
`Twin01_Body` — l'une des jumelles, et non Dark Bramble comme le lieu le
laissait croire — et dedans une toile. On s'approche, on la **fixe** trois
secondes, et la porte d'énergie, dix-neuf unités plus loin, s'efface.

> **Le lieu ne dit pas le corps.** J'avais écrit « dans Dark Bramble » dans le
> commentaire du module, à vue de la position `(-3 839, -86, 3 416)`. Le champ
> `body` de l'extraction dit `Twin01_Body`. C'est le même genre d'erreur que la
> convention d'axes déduite d'une capture d'écran ([`48`](48-ciel-mesure.md)) :
> plausible, et fausse.

### La loi du regard

```
d       = ma position − celle de la caméra
angle   = angle(d, l'avant de la caméra)
fDist   = clamp01((rayon − |d|) / (rayon − distActivation))
fAngle  = 1 − clamp01((angle − angleActivation) / (60 − angleActivation))
regard  = fDist × fAngle

regard ≥ 1 ? charge += dt : charge −= dt,   borné à [0, secondes]
charge pleine           → SwitchOn(), et on attend la décharge
charge sous la MOITIÉ   → on peut rallumer
```

`regard ≥ 1` demande les **deux** facteurs pleins : être à moins de quatre
unités **et** regarder à moins de dix degrés. Les deux fractions ne servent donc
pas à déclencher — elles servent à **animer**, et c'est la toile qui les lit.

La répartition des constantes est celle qu'on retrouve partout dans ce build :
`_angleOfActivation` (10) et `_secondsToCharge` (3) sont sérialisés,
`_activationDist` (4) vient du **constructeur**, et `_volumeRadius` (6) du
**collider**, lu dans `Awake`. Un invariant garde les trois provenances — et
refuse que la troisième se lise dans la scène.

### La toile, au cube

```
anneau extérieur   +(300 × regard³ + 300 × charge³) degrés/s
anneau intérieur   −(600 × charge³)               degrés/s
```

Le cube est ce qui fait le geste : presque rien tant qu'on n'est pas exactement
dessus, puis un emballement. À demi-regard, la toile tourne à **un huitième** de
sa vitesse. Charge pleine, elle s'efface en deux secondes et s'éteint.

### La porte ne s'ouvre pas

`EnergyGate.SwitchOn` appelle `ToggleGate(false)`, ce qui coupe **tous ses
colliders d'un coup** — y compris le `convex` de ses `MeshCollider` — puis fait
fondre son `_TintColor` vers alpha 0 en une seconde. On traverse avant de ne
plus la voir.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : le rayon qui vient
du collider et la distance d'activation du constructeur ; les deux facteurs
qu'il faut pleins — près mais de biais ne charge pas, droit mais loin non plus ;
les trois secondes, le déclenchement unique, et la moitié qu'il faut repasser
pour rallumer ; le cube des deux vitesses de toile et leurs sens opposés, les
deux secondes d'effacement ; la porte qui cesse de bloquer **avant** de cesser
de se voir.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : un seul
interrupteur, posé sur `Twin01_Body`, son rayon de six, ses dix degrés, ses
trois secondes — et sa distance d'activation **absente** de la scène ; une
toile, une porte.

## La leçon

> un test doit garder une mesure, pas une conclusion ([`49`](49-queue.md)) — et
> **l'outil qui compte ce qui manque se mesure comme le reste**.

Deux fois de suite, le recensement s'est trompé dans les deux sens : il comptait
un commentaire pour un lecteur, puis une traduction pour une absence. À chaque
fois, le nombre de « classes sans lecteur » était faux — une fois trop bas, une
fois trop haut — et à chaque fois il avait l'air d'une mesure.

Un outil de mesure n'est pas au-dessus de la mesure. Celui-ci porte maintenant
ses deux corrections, et la seconde l'oblige à se faire déclarer ce qu'il ne
peut pas deviner.
