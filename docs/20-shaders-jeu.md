# Shaders du jeu — premier lot

Suite de `docs/11-shaders.md`, qui classait les 122 shaders. Ici on les
applique. `web/src/shaders/`.

## La mesure d'usage a renversé mes priorités

J'avais annoncé que `CrackShader`, `RimShader`, `HeatDistortion`,
`DistortionShader`, `V-Fog` et `FireBall` « portaient l'identité visuelle des
lieux ». **C'était faux.** Le comptage des affectations de rendu le montre — sur
2 705 affectations dans la scène :

| affectations | matériaux | shader |
|---|---|---|
| 62 | 1 | **diamond shader** |
| 45 | 8 | **DoubleSidedCutoutBumpedDiffuse** |
| 34 | 3 | **SelfIlluminAlpha** |
| 28 | 20 | **SelfIlluminatedTransparent** |
| 18 | 1 | V-Fog |
| 12 | 2 | DoubleSidedCutoutDiffuse |
| 2 | 1 | RimShader |
| 2 | 1 | DistortionShader |
| 1 | 1 | CrackShader, IzzySunShader, Atmosphere |

Et **18 shaders du jeu ne sont jamais utilisés** dans la scène :
`HeatDistortion`, `TwirlEffect`, `BillboardTree`, `MotionBlur`, `FisheyeShader`,
`GrayscaleEffect`, `LensFlareCreate`, `SeparableBlur`… Les réécrire aurait été
du travail perdu.

Cinq familles couvrent donc l'essentiel du poids visuel, au lieu de 37 shaders.

## L'architecture

L'exporteur inscrit le nom du shader Unity dans les extras du matériau glTF.
Le moteur JS lit `extras.unityShader` et applique l'équivalent. Le choix est
donc **piloté par les données**, pas codé en dur.

Quand une configuration de matériau standard rend fidèlement l'effet, elle est
préférée au GLSL maison.

## Les implémentations

**`diamond shader`** — GLSL maison. Ses états de rendu disent tout :
`Blend One One`, `Cull Front`, `ZWrite Off`. Éliminer les faces *avant* et
composer en additif revient à regarder l'intérieur du volume : le halo
s'intensifie là où la géométrie est épaisse. Un cristal éclairé de l'intérieur.

**`V-Fog`** — GLSL maison. Volume texturé double face, atténué par l'incidence
du regard.

**`DoubleSidedCutout*`** — configuration standard : double face, seuil alpha à
0,5, éclairage bilatéral. C'est la végétation.

**`SelfIllumin*`** — configuration standard : émissif non éclairé, double face,
sans écriture de profondeur, fusion additive.

## Vérifié

**200 affectations traitées, 0 erreur** : 88 `DoubleSidedCutoutDiffuse`,
45 `DoubleSidedCutoutBumpedDiffuse`, 31 `diamond shader`, 28 `SelfIlluminAlpha`,
8 `SelfIlluminatedTransparent`, et 169 maillages passés en double face.

Dark Bramble et la dimension abandonnée ont été exportés au passage : les
prédateurs avaient été portés sans leur décor.

## Le cas V-Fog

`V-Fog` reste à zéro, et l'enquête donne une réponse inattendue : il n'existe
**qu'un seul matériau** de ce nom, appliqué à 18 rendus dont **14 sont des
`SkinnedMeshRenderer`** — le rig d'un personnage : son corps, son marteau, sa
brosse, sa loupe. Les 7 autres sont dans `mainData`, un fichier de scène jamais
exporté.

Le shader nommé « V-Fog » ne sert donc pas à faire du brouillard. Son absence
découle de deux limites déjà connues — le skinning non transporté et `mainData`
hors périmètre — et non d'un défaut du dispatcher.

## Second lot — le reliquat

Les quatre derniers ont suivi, portant le total à **203 affectations, 0
erreur** :

**`RimShader`** — GLSL maison. Ses propriétés (`_RimColor`, `_RimPower`,
`_DiffuseColor`, `_SpecularColor`, `_Glossiness`) décrivent un éclairage de
bord : un terme de Fresnel ajouté au diffus fait ressortir la silhouette.

**`CrackShader`** — surcouche transparente double face en file Transparent,
traitée comme l'émissif : c'est la texture qui porte les fissures lumineuses.

**`DistortionShader` et `FireBall`** — les deux partagent `Blend DstColor Zero`,
soit une fusion **multiplicative**, avec `_BumpMap` et `_BumpAmt`. C'est la
technique Unity classique : capturer le fond, le décaler selon une carte de
normales, le recomposer.

> **Approximation assumée.** Capturer le fond demande un rendu dans une texture
> intermédiaire. J'implémente la modulation multiplicative pilotée par la carte
> de normales, animée et accentuée en incidence rasante — un voile ondulant
> crédible, pas une vraie réfraction.

`IzzySunShader` et `Atmosphere` restent couverts par les shaders maison écrits
plus tôt (`docs/11-shaders.md`).

## Bilan

Tous les shaders du jeu effectivement utilisés dans la scène sont désormais
traités. Les 18 jamais utilisés sont laissés de côté délibérément.
