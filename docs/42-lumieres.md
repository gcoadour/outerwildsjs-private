# Le recensement, et les lumières qui vivent

Les pages précédentes cherchaient les écarts **par système** : les fluides, la
collision, le ciel. Chaque fois, la découverte était la même — une donnée du
build que rien ne lisait — et chaque fois elle venait d'un soupçon, pas d'une
méthode.

Cette page pose la méthode. On demande au build **la liste complète** des
composants qu'il pose dans `level0`, et on regarde lesquels le portage nomme.

## Le recensement

`level0` pose **275 classes distinctes** de `MonoBehaviour`. Le portage en
nomme **105**. Les 170 autres n'apparaissent nulle part dans `web/src/`.

Le compte est une borne haute : certaines classes sont lues par **motif** et
non par nom — `TornadoBaseFluidVolume` répond à `/tornadobase/i`,
`OxygenVolume` à `/oxygen/i` — et figurent donc à tort dans les absents. La
liste reste un point de départ honnête, et elle se relit chaque fois qu'on
ajoute un lecteur.

Les quarante plus nombreux :

| classe | instances | |
|---|---|---|
| `DS_DecalProjector` | 38 | décalcomanies |
| `AttachOnAwake` | 34 | héritage de référentiel |
| `DS_DecalsMeshRenderer` | 30 | décalcomanies |
| `DS_Decals` | 30 | décalcomanies |
| `TextureAnimator` | 27 | **textures animées** |
| `MatchInitialMotion` | 27 | héritage de mouvement |
| `RepairVolume` | 18 | réparation du vaisseau |
| `RandomParticleBursts` | 18 | particules |
| `EntrywayTrigger` | 18 | entrée/sortie de volume |
| `PulsingLight` | 15 | **lumière qui bat** |
| `NightLight` | 15 | **lumière de nuit** |
| `FaceActiveCamera` | 15 | panneaux face caméra |
| `InertiaTensorCalibrator` | 14 | inertie |
| `AudioVolume` | 14 | ambiance sonore par zone |
| `MultiFieldDetector` | 11 | gravité |
| `ThrusterParticlesBehavior` | 10 | réacteurs |
| `TextureAnimatorMultipleMats` | 10 | **textures animées** |
| `EngineComponent` | 10 | pièces du vaisseau |
| `RadiationEmitter` | 9 | rayonnement |
| `MajorReferenceFrameVolume` | 9 | référentiels |
| `LightFlicker` | 9 | **lumière qui vacille** |
| `FieldInheritor` | 9 | gravité |
| `FacePlayerWhenTalking` | 8 | dialogue |
| `InteractZone` | 7 | interaction |
| `TornadoPivotController` | 6 | tornades |
| `DestructionVolume` | 6 | destruction |
| `AncientTeleporter` | 6 | téléporteurs |
| `SunlessZone` | 5 | éclairage |
| `ReferenceFrameVolume` | 5 | référentiels |
| `LODCameraSnapshot` | 5 | impostures de planète |
| `JellyfishController` | 5 | faune |
| `ZeroGField` | 4 | apesanteur |
| `MeteorLauncher` | 4 | météores |
| `SupernovaLight` | 3 | fin des temps |

Trois familles sautent aux yeux : les **référentiels** (`AttachOnAwake`,
`MatchInitialMotion`, `ReferenceFrameVolume`, `MajorReferenceFrameVolume`,
`FieldInheritor` — 84 instances), les **textures animées** (`TextureAnimator`
et ses trois variantes — 44 instances), et les **lumières vivantes** (39).

C'est par les lumières que cette page continue, parce qu'elles sont les plus
petites et qu'on venait d'établir qu'il fait nuit au départ
([`41-ciel.md`](41-ciel.md)).

## Les trois `Update`, transcrits

Lus dans l'IL d'`Assembly-CSharp.dll`, comme les lois de fluide
([`39-fluides.md`](39-fluides.md)).

### `PulsingLight` — 15 lumières

```
intensite = sin((t + _timeOffset) x _pulseRate) x _intensityFluctuation + intensite initiale
portee    = sin((t + _timeOffset) x _pulseRate) x _rangeFluctuation     + portee initiale
```

C'est une **addition**, pas un facteur : une fluctuation de 0,3 fait varier de
plus ou moins 0,3 quelle que soit l'intensité de départ. Et `_timeOffset`
existe pour que deux lampes voisines ne battent pas ensemble.

### `LightFlicker` — 9 lumières

```
si |intensite - cible| < 0,01 :  cible = Random.Range(-1, 1) x range + intensite initiale
intensite = Lerp(intensite, cible, rate)
```

Défauts du constructeur : `range` 0,1, `rate` 0,2. Le `rate` est un pas **par
image** et non par seconde ; il est transcrit tel quel — le vacillement d'un feu
n'a pas de vitesse juste, seulement une allure.

### `NightLight` — 15 lumières

```
Awake :      _nightIntensity = light.intensity      // la valeur sérialisée est celle de la NUIT
OnSunrise :  cible = _nightIntensity x _dayIntensityMultiplier   // 0,5 par défaut
OnSunset :   cible = _nightIntensity
Update :     intensite = Lerp(depart, cible, clamp01((t - debut) / 5))
```

Le détail qui compte : **l'intensité sérialisée est celle de la nuit**. Une
lecture naïve la prendrait pour l'intensité nominale et allumerait ces quinze
lampes à plein en plein jour. Le fondu dure cinq secondes, codées en dur.

Le portage possède déjà le signal qu'il faut : `night` vient de la hauteur du
soleil au-dessus de l'horizon local, depuis que les corps tournent sur eux-mêmes
([`35-monde.md`](35-monde.md)).

## Ce que cela change, et ce que cela ne change pas

Au départ de la partie il fait nuit : les quinze `NightLight` étaient donc
déjà, par accident, à la bonne intensité. Ce qui change vraiment, c'est **le
jour** — elles y descendent désormais à la moitié — et les vingt-quatre lampes
qui battent ou vacillent, qui étaient figées.

Ce n'est pas un grand effet. C'est un effet **juste**, et il ne coûte que ce
que coûte la lecture d'un champ déjà extrait.

## Ce qui reste, dans l'ordre où le recensement le pose

- **Les référentiels** (84 instances) sont la famille la plus lourde encore
  ouverte. `MatchInitialMotion` et `AttachOnAwake` disent qu'un objet hérite du
  mouvement de son porteur ; le portage reporte désormais les vitesses au
  changement d'ancre ([`37-corrections.md`](37-corrections.md)), mais ne lit pas
  ces composants-là.
- **Les textures animées** (44 instances) : quatre variantes d'un même
  mécanisme, et rien ne les lit.
- **Les décalcomanies** (98 instances de trois classes `DS_*`) : un système
  tiers, dont la géométrie est déjà exportée — ce sont les 30 `Decals Mesh
  Renderer` que [`40-solide.md`](40-solide.md) a rendus traversables.
- **`FaceActiveCamera`** (15) : des panneaux qui doivent regarder la caméra et
  qui, faute de ce composant, restent de biais.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : les trois formules,
sommet et creux de la sinusoïde, le tirage d'une nouvelle cible seulement une
fois l'ancienne atteinte, le fondu de cinq secondes et ses deux extrémités.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : **15
`NightLight`, 15 `PulsingLight`, 9 `LightFlicker`**, chacune portant
respectivement une intensité de nuit non nulle et un rythme non nul.
