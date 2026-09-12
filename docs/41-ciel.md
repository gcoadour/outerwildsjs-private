# Le ciel : ce que la première image montrait, et pourquoi

C'est la première fois que le portage est **regardé** — lancé dans un Chromium
réel, avec le build de l'alpha fourni à la page, et photographié.
[`38-depart.md`](38-depart.md) posait le joueur au bon endroit ; cette page dit
ce qu'il voyait de là, et pourquoi ce n'était pas le jeu.

La capture d'origine, citée par [`38`](38-depart.md), montre *« une scène
sombre, une charpente de bois tout près, des nuages éclairés et la lune dans un
ciel noir »*. Le portage montrait un **lavis rose uniforme**, puis, une fois la
transparence rétablie, un **plein jour cyan aveuglant** — sur une scène dont son
propre affichage annonce « nuit ».

Il avait raison de l'annoncer : mesuré dans le moteur, le sinus de la hauteur du
soleil au point d'apparition vaut **−0,976**. Le soleil est à 77 degrés **sous**
l'horizon. C'est la nuit noire, et le portage peignait midi.

## Ce que le build pose, et que rien ne lisait

Trois classes, toutes sur Timber Hearth, aucune extraite :

| classe | nombre | ce qu'elle fait |
|---|---|---|
| `SkyBehavior` | 1 | la voûte `SkyShell`, sphère de rayon 250,749 |
| `CloudTextureController` | 24 | un nuage, et **sa** texture parmi dix |
| `DistantStarController` | 1 | le champ d'étoiles, un système de particules |

Les 24 nuages partagent un seul matériau, `CloudMat`, dont la texture
sérialisée est `cloud_01`. Le composant remplace cette texture **à
l'exécution**, par instance. Sans lui, les vingt-quatre nuages du ciel portent
le même visage au lieu de dix : `cloud_01` à `cloud_06`, `whisp_01` à
`whisp_04`.

Tout cela sort désormais dans `data/sky.json`.

## Les trois causes du plein jour

### 1. Les coques d'atmosphère du portage, vues de l'intérieur

`makeAtmosphere` crée une sphère par corps, avec un terme de Fresnel qui allume
le limbe. Elle est faite pour être vue **de l'extérieur** — ses faces arrière
sont éliminées exprès, et le commentaire du code le dit déjà.

Vue de l'intérieur, il ne reste que l'hémisphère opposé, dont les normales
fuient le regard : le voile sature sur tout l'écran. C'était la couche la plus
lumineuse des trois, et elle n'existe pas dans le jeu — le build a `SkyShell`,
pas de coque inventée.

Elle s'efface désormais dès que la caméra entre dedans.

### 2. Les nuages étaient rendus en **additif**

Le portage classait `SelfIlluminAlpha` parmi les émissifs additifs, en notant
qu'il retenait « l'additive, dominante ici ». Ce n'était fondé sur rien, et le
ShaderLab du build dit le contraire pour les **quatre** shaders de la famille
(`Custom/SelfIlluminAlpha`, `Custom/CrackShader`, `Self-Illumin/Transparent`,
`Self-Illumin/Transparent-1`) :

```
ZWrite Off · Cull Off · AlphaTest Greater 0
Blend SrcAlpha OneMinusSrcAlpha
LIGHTMODE = ForwardBase
```

Pas un seul n'est additif. Et tous sont **éclairés**.

Vingt-huit nuages additifs sur un ciel noir s'additionnent jusqu'au blanc.
Rendus en fondu alpha et éclairés, ils redeviennent ce qu'ils sont : des masses
grises distinctes.

Le nom trompe, d'ailleurs : `Custom/SelfIlluminAlpha` déclare
`_MainTex ("Base (RGB) Trans (A)")`. Son alpha est la **transparence**, pas une
carte d'illumination — il n'y a aucun canal d'émission à lire. Et sa passe
porte `lightStrength`, défaut 2.

### 3. La voûte elle-même était **opaque**

`Custom/Atmosphere` ne laisse aucune place au doute :

```
Tags { "QUEUE"="Transparent" "RenderType"="Transparent" }
ZWrite Off
Blend SrcAlpha OneMinusSrcAlpha
SetTexture [_MainTex] { combine texture }
```

Non éclairé, fondu par l'alpha de sa texture. Le portage le rendait opaque : la
voûte bouchait le ciel d'un lavis uni, et il ne restait ni nuit, ni étoiles, ni
lune. La texture `atmosphere_blue` est en DXT5 et son alpha court de 0 à 255 —
il y avait bien un dégradé à montrer, personne ne le regardait.

Deux autres shaders sortent de la même mesure et étaient rendus opaques :
`Particles/Additive` et `Particles/~Additive-Multiply`, tous deux en
`Blend SrcAlpha One`, `ZWrite Off`, `Cull Off`.

## Ce que la texture du ciel apprend

`atmosphere_blue` n'est pas un dégradé de ciel : c'est un **disque bleu radial
sur fond transparent**, clair au centre, éteint au bord.

Cela explique le mécanisme du jour et de la nuit dans l'alpha. `SkyBehavior`
tourne la voûte vers le soleil à chaque image :

```
_relativeBody.transform.LookAt(_sunBody.transform.position);
```

Face au soleil, on voit le disque — le bleu du jour. De dos, on ne voit que son
bord transparent, et le ciel est noir. Tout tient dans cette rotation.

## Ce qui reste ouvert, et pourquoi

**La rotation de la voûte n'est pas portée.** Deux orientations ont été
essayées et photographiées :

- viser le soleil directement : le disque reste au zénith, plein jour permanent ;
- viser le point opposé : une **gerbe de rayons cyan** au pôle de la sphère UV.

Le second résultat est instructif : il dit que le disque est posé sur un **pôle**
de la sphère, et que le pôle opposé est la singularité de son paramétrage. Le
`LookAt` d'Unity aligne l'axe **+Z**, c'est-à-dire l'équateur, pas un pôle —
donc ni « viser le soleil » ni « viser à l'opposé » n'est ce que fait le jeu.
La convention d'axes entre ce `LookAt` et l'export glTF, qui inverse Z
(`translation: [x, y, -z]`, `rotation: [-x, -y, z, w]`), reste à établir.

Poser une rotation fausse serait pire que n'en poser aucune : la voûte reste
donc immobile, et le zénith reste clair. La vue d'horizon, elle, est désormais
nocturne.

**L'opacité de la voûte est du code mort dans l'alpha.** `SkyBehavior` calcule
`_currentSkyAlpha` et le range dans `_endMaterialColor.a` — et **rien**, dans
toute la classe, ne reporte cette couleur sur le rendu. La courbe est extraite
et `skyAlpha()` la calcule, mais le moteur ne l'applique pas, exactement comme
les modificateurs de dégâts du vaisseau : câblés, éteints parce que le build les
éteint.

**Les dix textures de nuage ne sont pas encore appliquées.** Elles sont
extraites et nommées par nuage ; il reste à les exporter comme images et à les
poser par instance, ce qui suppose de distinguer 24 maillages qui portent tous
le nom `PieceOfRing`.

**Le champ d'étoiles n'est pas rendu.** `DistantStarController` est extrait ;
son système de particules ne l'est pas.

## Une leçon de méthode

Le premier essai d'isolement — masquer une couche, regarder — n'a rien donné :
les images étaient identiques. La cause n'était pas dans la scène mais dans
l'outil. `MeshLOD` réécrit `isVisible` à **chaque image** ; masquer par
`isVisible` ne survit pas à la frame suivante. Il faut `setEnabled(false)`.

Deux heures de fausses pistes tiennent dans cette phrase, et elle mérite d'être
ici : dans ce moteur, **ce qui se mesure à l'écran doit se mesurer avec une
prise que la boucle de rendu ne reprend pas**.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : la courbe d'alpha
et ses valeurs aux rayons remarquables, le rattachement de la voûte par son
nom, l'absence de voûte inventée quand les données manquent.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : une voûte de
rayon 250,749, un rayon de ciel de 320 venu du constructeur, une courbe de 9
points de 1 à 0, **24 nuages portant 10 textures distinctes**, un champ
d'étoiles.
