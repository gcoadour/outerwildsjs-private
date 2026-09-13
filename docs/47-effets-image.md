# Les effets d'image, et le commentaire qui les cachait

Le portage n'avait **aucun** effet d'image. Le build en pose **vingt-quatre**,
sur **quinze caméras**. Six sont sur la seule caméra du joueur.

Cette page raconte ce qu'ils sont, et surtout **pourquoi personne ne les avait
vus** — parce que la cause n'est pas un oubli, c'est une méthode qui se mentait
à elle-même.

## Comment on ne voit pas une couche de rendu entière

[`45-recensement-mesure.md`](45-recensement-mesure.md) avait posé la bonne
méthode : demander au build la liste des composants qu'il pose, et regarder
lesquels `web/src/` nomme. [`46`](46-migration-lots.md) l'a rejouée et comptait
**59 classes sans lecteur**. `TwirlEffect`, `MotionBlur` et `Fisheye` n'y
figuraient pas : elles étaient comptées **lues**.

Elles le sont, en effet — dans cette ligne de
[`shaders/index.js`](../web/src/shaders/index.js) :

```
// Et surtout : 18 shaders du jeu ne sont JAMAIS utilises dans la scene
// (HeatDistortion, TwirlEffect, BillboardTree, MotionBlur, FisheyeShader...),
```

Un **commentaire**. Qui, de surcroît, dit une chose fausse d'une façon
instructive : ces shaders ne sont affectés à aucun *matériau*, ce qui est vrai
et mesuré — mais ce sont des **effets d'image**, portés par des caméras, et
aucun matériau ne les porte jamais. La phrase mesurait la bonne chose et en
concluait la mauvaise ; puis elle a suffi à faire compter les classes pour lues.

Deux corrections en sont sorties, et ce sont elles l'acquis de la page :

- `scripts/recensement.mjs` **retire les commentaires** avant de compter. Une
  classe dont quelqu'un a parlé n'est pas une classe que le moteur lit.
- il sépare ce que **le moteur** lit de ce que **seul le pipeline** extrait —
  la nature de manque qu'avait rencontrée [`35-monde.md`](35-monde.md), et qui
  ne se voit pas si l'on compte `web/src/` d'un bloc.

Le compte honnête, après ces deux corrections :

| | avant | après |
|---|---|---|
| classes posées dans `level0` | 275 | 275 |
| lues par le moteur | — | **103** (695 instances) |
| lues par un motif | 44 | 63 (172 instances) |
| **extraites, et que rien ne lit** | — | **32** (343 instances) |
| **sans aucun lecteur** | 59 (94 inst.) | **77** (180 instances) |

Les 59 n'étaient pas un mensonge : c'était le même comptage, avec les
commentaires dedans. Le chiffre a **monté** en devenant juste, et c'est le
genre de mouvement qu'il faut accepter d'un recensement.

> **Le recensement est désormais au dépôt** (`scripts/recensement.mjs`), avec
> le désassembleur d'IL (`scripts/il.mjs`) et le lecteur de composants
> (`scripts/composants.mjs`) que [`46`](46-migration-lots.md) avait écrits puis
> jetés. Les jeter était l'erreur : chaque lot suivant les remonte.

## Ce que la scène déclare, caméra par caméra

```
PlayerCamera      Bloom + Glow + Vignetting + Grayscale + Twirl + Tonemapping
FlashbackCamera   MotionBlur + Glow + SunShafts + Fisheye + Twirl
MapCamera         Bloom (simple, seuil 0,5) + Tonemapping
LandingCam        NoiseAndGrain + deux Tonemapping
SatelliteCamera   Grayscale + NoiseEffect
MovingCamera      MotionBlur                       (l'ordinateur de bord)
LODCam_* x5       LODCameraSnapshot                (les impostures de planète)
```

**Quatre des six effets du joueur sont éteints au réveil.** `Awake` les coupe,
et ils ne servent qu'aux événements. C'est pourquoi rien, dans une capture au
repos, ne trahissait leur absence : au repos, le joueur ne voit que le bloom.

## Les lois du contrôleur, lues dans l'IL

`PlayerCameraEffectController` ne sérialise **aucun** champ : ses trois
constantes viennent du constructeur, et un invariant garde cette absence — comme
pour les seuils de la marche ([`46`](46-migration-lots.md)).

```
WAKE_DURATION     3 s     le fondu blanc du réveil, à chaque boucle
_initTwirlAngle   220°     l'angle où commence le tourbillon du trou noir
_twirlDuration    2 s     et le temps qu'il met à rejoindre 360°
```

| événement | ce que l'écran fait |
|---|---|
| début de boucle | glow **blanc** à 3, qui retombe au noir en 3 s |
| mort, asphyxie | fondu au noir en **5 s** |
| mort, énergie / supernova | éclair **rouge** `(255, 100, 100)` à l'intensité 3, 3 s |
| mort, impact / défaut | fondu en **0,3 s** |
| trou noir | l'image se visse de **220 à 360°** en 2 s |
| passage ancien | éclair **bleu** `(100, 100, 255)`, 0,5 s pour venir, 2 s pour partir |
| immersion | le glow se rallume aux valeurs que `Awake` avait retenues |

Deux détails de forme portent tout le ressenti :

**L'adoucissement n'est pas symétrique.** Une *montée* d'intensité suit `t⁴` —
rien, rien, rien, puis tout ; une *descente* suit `1 − (t−1)⁴` — tout, puis une
longue traîne. C'est ce qui fait qu'un éclair frappe et s'éteint lentement,
plutôt que de pulser.

**Le fondu de mort monte quatre choses ensemble**, et pas à la même vitesse :

```
opacité du noir      t²
gris                 t x 2
vignette, intensité  t⁵ x 1000
vignette, chromatie  t x 100
vignette, flou       t x 1000
```

Le cinquième de puissance garde la vignette presque invisible jusqu'au bout,
puis la referme d'un coup : à 80 % du chemin elle vaut encore 328 sur 1 000.

> **La mort ne demande pas le flashback au moment où l'on meurt** mais à la fin
> de l'effet. Les cinq secondes d'asphyxie passent donc **avant** que les images
> ne commencent.

## Trois écarts que la mesure a sortis en passant

Chercher les effets a fait ouvrir la caméra elle-même, et elle portait des
nombres que personne n'avait lus.

**Le champ de vision.** `PlayerCamera` voit à **70 degrés**. Le portage ne
réglait rien, et Babylon pose 0,8 radian — 45,8 degrés. Pire : le télescope
écrivait `camera.fov` à **chaque image**, y compris rangé, donc la partie se
jouait en réalité à **60 degrés**. Un cadrage faux de dix degrés sur toute la
partie, qu'aucune capture ne pouvait trahir faute de point de comparaison.

**Le télescope, quatre erreurs à la fois.** Relu dans l'IL :

| | le portage | le build |
|---|---|---|
| champ au repos | 60 (`_maxFOV`) | **70**, celui de la caméra (`SnapToInitFieldOfView`) |
| à l'entrée | glisse vers 10 | **33,33** = `(_maxFOV − _minFOV) / 1,5` |
| le zoom | automatique, jusqu'au minimum | **à la main**, 50 °/s, borné 10–60 |
| plan proche | 0,1, fixe | **0,05**, qui recule à **0,5** en visant |

Le grossissement passe donc de sept à **deux** à l'entrée, et le joueur fait le
reste lui-même. Le plan proche n'est pas un détail : à dix degrés de champ, un
plan proche à cinq centimètres ruine la précision de profondeur sur tout le
lointain.

**La caméra de la sonde.** Le portage lui donnait `fov = 1.0` radian avec le
commentaire « grand angle : c'est un objectif jeté ». La bonne intention et le
mauvais nombre : `LandingCam` voit à **100 degrés**, et porte un
`NoiseAndGrain` de force 4.

## Ce qui est rendu, et ce qui ne l'est pas

[`postfx.js`](../web/src/postfx.js) écrit cinq effets en GLSL — glow, vignette,
gris, tourbillon, bloom — plus le grain et la pellicule des caméras secondaires.
Ce ne sont **pas** des transpositions des shaders d'Unity : ceux-ci sont dans le
build, et les rejouer demanderait un traducteur de ShaderLab que ce portage n'a
pas. On refait l'effet, en le réglant sur les nombres du build.

L'ordre de la chaîne, lui, est mesuré : Unity appelle `OnRenderImage` dans
l'ordre des composants, et sur `PlayerCamera` le bloom passe **en dernier** —
après le tourbillon. Ce qui se voit en tombant dans le trou noir : l'image se
visse, et le halo se visse avec elle. `attachPostProcess` sans rang ajoute à la
fin, ce qui aurait mis un fondu au noir **avant** le bloom — et un noir suivi
d'un bloom rend un écran gris.

Restent dehors, et dits :

- **les halos de lentille** : `lensflares` vaut **faux** sur les deux
  `BloomAndLensFlares` du build. Le composant est là, le jeu ne s'en sert pas.
  Un invariant garde ce zéro, pour que personne ne les porte un jour pour rien.
- **`MotionBlur`** (ordinateur de bord, flashback) : le vrai effet accumule
  l'image précédente, ce qui demande un tampon que ce module ne tient pas.
- **`SunShafts`** et **`Fisheye`** : ils ne sont que sur la caméra du flashback,
  et ce portage ne rejoue pas d'images de flashback
  ([`32-mort.md`](32-mort.md)) — il en rejoue le **rythme**.
- **le plan lointain** : le build coupe à 50 000 unités et remplit au-delà avec
  les impostures de `LODCameraSnapshot`. Le portage garde 200 000 parce qu'il
  n'a pas d'impostures : couper effacerait les planètes lointaines au lieu de
  les remplacer. C'est le seul des deux plans qui soit un choix.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : les quatre effets
éteints au réveil et les réglages d'immersion retenus par `Awake` ; les trois
secondes du réveil et son départ du blanc ; l'adoucissement en `t⁴` dans un sens
et `1 − (t−1)⁴` dans l'autre ; les trois traitements des cinq causes de mort, la
courbe en `t⁵` de la vignette et le flashback demandé **après** l'effet ; les
220 degrés du tourbillon et son retour à zéro ; le glow qui retrouve sa teinte
d'origine sous l'eau et non celle qu'un éclair a laissée ; les réglages qui se
savent replis. Pour le télescope : le champ de repos, l'entrée à 33,33, la
commande à 50 °/s et ses deux bornes, le plan proche qui recule, le retour au
champ de la caméra.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : quinze
caméras et vingt-quatre effets, toutes lisibles ; les six effets du joueur, son
champ de 70, ses plans à 0,05 et 50 000, son HDR ; le seuil de bloom à 0,8 chez
le joueur et 0,5 sur la carte, additif chez les deux ; deux blooms dont **aucun**
n'allume ses halos ; les deux `Tonemapping` de la caméra d'atterrissage et son
champ de 100 ; le satellite monochrome ; cinq impostures, toutes à une image par
seconde ; et le contrôleur qui ne sérialise **aucun** champ.

## La leçon

La série en avait cinq. Celle-ci porte sur l'outil de mesure lui-même :

> avant de conclure qu'une chose manque au build, vérifier qu'on la lit
> ([`34`](34-actions.md)) — avant de conclure qu'on la lit, la mesurer
> ([`36`](36-audit.md)) — avant de conclure qu'on la joue, la jouer
> ([`43`](43-pnj-son-decollage.md)) — avant de chercher ce qui manque, demander
> la liste ([`45`](45-recensement-mesure.md)) — avant de lire l'ordre du code,
> aller chercher la structure qu'il référence ([`46`](46-migration-lots.md)).

Et maintenant : **une liste se mesure elle aussi**. Celle-ci comptait un
commentaire pour un lecteur, et une couche de rendu entière est restée invisible
aussi longtemps qu'une phrase de vingt mots l'a nommée en passant.
