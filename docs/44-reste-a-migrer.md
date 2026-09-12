# Ce qui reste à migrer de l'alpha d'origine

La référence est le build que la page rejoue : l'**alpha ouverte 1.2**, telle
que la servait la page de téléchargements d'`outerwilds.com` dans l'instantané
Wayback du **15 août 2015** (`20150815180605`) — celui-là même que
[`tools/01_fetch.sh`](../tools/01_fetch.sh) va chercher. La page offrait trois
plateformes (`Linux`, `PC`, `Mac`) du **même** contenu ; le dépôt travaille sur
`OuterWilds_Alpha_1_2_Linux.zip` (289 268 118 octets, SHA-256
`5c7defad…80f05a`, Unity 4.1.2f1).

Cette page dit **ce que l'alpha pose et que le portage ne lit pas**, famille par
famille, dans un ordre prêt à écrire. Elle ne refait ni l'inventaire d'état
([`08-reste-a-faire.md`](08-reste-a-faire.md)) ni l'audit chiffré
([`36-audit.md`](36-audit.md)).

> **Cette page a été réécrite sur la mesure.** Sa première version travaillait
> *sans le build*, par recoupement entre les noms cités dans `docs/` et ceux que
> `web/src/` nomme, et annonçait ses angles morts. Le recensement refait sur le
> build ([`45-recensement-mesure.md`](45-recensement-mesure.md)) les a chiffrés :
> le recoupement voyait 38 classes, il y en a **117**. Les chiffres ci-dessous
> sont ceux du build, et trois des lots ont depuis été écrits.

## Le compte, mesuré

| | |
|---|---|
| classes distinctes posées dans `level0` | 275 |
| nommées quelque part dans `web/src/` | 114 |
| lues par **motif** plutôt que par nom | 44 classes, 96 instances |
| **sans aucun lecteur** | **109 classes, 413 instances** |

Les 44 classes lues par motif ne sont pas un manque : `OxygenVolume` répond à
`/oxygen/i`, `TornadoBaseFluidVolume` à `/tornadobase/i`, et le compte les
retirait à tort de la liste tant qu'il n'était pas mesuré.

Le chiffre était de 117 classes et 485 instances avant les trois lots de
[`45`](45-recensement-mesure.md) — le sable des jumelles, les volumes de
destruction et de réparation, les zones d'ambiance.

## Ce qui reste, par famille

### 1. Les référentiels hérités — 12 classes, 106 instances

La famille la plus lourde, et la moins comprise.

| classe | n | ce qu'elle dit |
|---|---|---|
| `AttachOnAwake` | 34 | s'attache à un porteur au réveil, dans un rayon (`_checkRadius`, 1 pour 30 d'entre elles) |
| `MatchInitialMotion` | 27 | hérite du mouvement du porteur ; 5 ignorent sa rotation |
| `InertiaTensorCalibrator` | 14 | corrige son tenseur d'inertie |
| `FieldInheritor` | 9 | hérite du champ de gravité |
| `MajorReferenceFrameVolume` | 9 | référentiel majeur, avec `_autopilotArrivalDistance` (1 000 ou 2 500) et `_autoAlignmentDistance` (0 à 1 000) |
| `ReferenceFrameVolume` | 5 | référentiel, 2 primaires sur 5 |
| et 6 autres | 8 | `MatchTransform`, `AlignPlayerWithField`, `CenterOfTheUniverse`, `InitialVelocity`, `Locator`, `ReferenceFrameTracker` |

Le portage reporte déjà positions **et** vitesses au changement d'ancre
([`37-corrections.md`](37-corrections.md)), mais il choisit son ancre par la
gravité dominante ; le build, lui, la **déclare** par volume. Les deux ne
coïncident pas partout — un vaisseau posé dans un hangar, un objet lâché dans
une grotte.

Les distances d'arrivée du pilote automatique sont un gain immédiat : elles
sont dans `MajorReferenceFrameVolume`, et `18-vaisseau.md` les code en dur.

**Où** : `origin.js`, `orbits.js`, `main.js`, `autopilot.js`.
**À lire d'abord** : l'IL d'`AttachOnAwake` et de `MatchInitialMotion` — le
champ qui désigne le porteur, et si le mouvement hérité inclut la rotation.

### 2. Les décalcomanies — 3 classes, 98 instances

`DS_DecalProjector` 38, `DS_Decals` 30, `DS_DecalsMeshRenderer` 30. Un système
tiers, dont la géométrie est **déjà exportée** : ce sont les 30 *Decals Mesh
Renderer* que [`40-solide.md`](40-solide.md) a rendus traversables. Elles sont
donc dans la scène, plaquées comme des maillages ordinaires, sans le décalage de
profondeur ni le mélange que le système prévoit — ce qui se voit en rasant une
paroi. Le coût est un matériau, pas une mécanique.

### 3. La vie du décor — 22 classes, 83 instances

| classe | n | effet |
|---|---|---|
| `RandomParticleBursts` | 18 | bouffées de particules |
| `FaceActiveCamera` | 15 | panneaux face caméra — 5 en `_useLookAt`, les autres par axe déclaré |
| `ThrusterParticlesBehavior` | 10 | les réacteurs répondent à la commande |
| `FacePlayerWhenTalking` | 8 | on parle à un visage, pas à un dos |
| `AncientTeleporter` | 6 | six passages, avec `_alignmentWindow` et `_solarOcclusionWindow` |
| `AncientTeleportReceiver` | 3 | leurs points d'arrivée |
| `MeteorLauncher` | 4 | météores de la lune volcanique |
| et 15 autres | 19 | `Elevator`, `HatchController`, `LaunchElevatorController`, `Detonator`, `DerelictWarp`, `BlinkingRenderer`, `FadeLight`, `Vignetting`… |

Trois se voient tout de suite : les quinze panneaux de biais, les huit dos, et
des réacteurs qui ne réagissent pas. `AncientTeleporter` est le seul du lot à
changer la **topologie** du monde.

### 4. Les volumes et zones de jeu — 18 classes, 34 instances

`InteractZone` 7, `ChildTriggerVolume` 4, `ProbePromptTrigger` 4, `ZeroGField` 4,
`ZeroGSector` 2, puis un chacun : `SuitBarrier`, `SuitRemovalVolume`,
`HazardVolume`, `DarkZone`, `EnergyGate`, `InterferenceVolume`,
`WaterEffectVolume`, `SandstormVolume`, `MajorSector`, `CompoundTriggerVolume`,
`TelescopePromptTrigger`, `SettingsMenuTrigger`, `ResetSimulationTrigger`.

`SuitBarrier` et `SuitRemovalVolume` sont la mécanique de la combinaison — à
lire avec `GearPickup` (§7).

### 5. Le son réactif — 16 classes, 18 instances

Le portage joue des sources **placées** ; le build joue en plus des sons
**d'événement**, et c'est une couche entière qui manque :
`PlayerMovementAudio`, `PlayerSubmergeAudio`, `PlayerNoiseMaker`,
`ThrusterAudio` ×2, `TurbulenceAudio`, `SpacesuitAudioController`,
`RepairAudioController`, `UIAudioController`, `FlashbackAudioController`,
`PlayerAudioEffects`, `FadeInAudioOnAwake`, `AudioShell` ×2, `NoiseEffect`,
`DrawSoundWave`.

Restent aussi les deux déclencheurs de musique que [`43`](43-pnj-son-decollage.md)
avait relevés et que le lot 3 n'a pas pris : `TravelMusicController` (le joueur
est dans le vide et hors du poste de pilotage) et `EndOfTimeMusicController`
(`TimeLoop.GetSecondsRemaining()`, puis fondu).

### 6. L'interface — 13 classes, 22 instances

`RoastPromptEvent` 8 (la guimauve), `CustomAspectRatio` 3, puis `HUDHelmet`,
`HUDDamageDisplay`, `HUDCameraScript`, `MinimapHUD`, `MasterAlarm`,
`NotificationManager`, `ObservatoryMap`, `MapOpenGL`, `MarshmallowStick`,
`TapeMeasure`, `DebugHUD`.

Le portage a son propre HUD ([`28-hud.md`](28-hud.md)) : ce lot est à lire pour
**comparer**, pas forcément pour porter.

### 7. Le joueur et le vaisseau — 11 classes, 18 instances

`PlayerAttachPoint` 4, `LandingPadSensor` 3, `GearPickup` 2,
`PlayerLockOnTargeting` 2, puis `PlayerState`, `PlayerSpawner`,
`PlayerJetpackController`, `PlayerCompressionSensor`, `FirstPersonManipulator`,
`SurfaceSensor`, `AncientProbeController`.

Deux corrections de [`08`](08-reste-a-faire.md) §1 sont ici :

- **le ciblage et l'entraînement existent.** `PlayerLockOnTargeting` est posé
  deux fois, dont une sur `Player_Body`, et `ZeroGTrainingManager` porte deux
  références résolues ;
- **la combinaison, la sonde et la minicarte se ramassent.** Les deux
  `GearPickup` — `ExpeditionGear` et `SpaceSuit` — disent chacun lequel des
  trois il débloque. Le portage les donne d'emblée.

### 8. Le reste — 11 classes, 30 instances

`RadiationEmitter` 9, `TornadoPivotController` 6, `LODCameraSnapshot` 5,
`BrokenNode` 3, `MuseumEntryway`, `LandingPadManager`, `DayNightTracker`,
`GazeSwitch`, `GazeWebAnimator`, `InputInitializer`, `ZeroGTrainingManager`.

`LODCameraSnapshot` reste le point de rendu ouvert : le jeu affiche un système
entier parce que les planètes lointaines sont des textures rafraîchies une fois
par seconde. Le portage résout le même problème autrement — sphères et secteurs
— et l'assume ([`36`](36-audit.md) §2.8).

### 9. Ce qu'il ne faut pas porter — 3 classes, 4 instances

`DebugBreakAllChildren` ×2, `DebugInputManager`, `LoadTimeTracker`, plus
`TapeMeasure` et `ResetSimulationTrigger` cités plus haut : des outils de mise
au point du studio. Ils figurent ici pour que personne n'y passe une heure.

## Ce qui reste ouvert ailleurs

- **Le ciel** : la convention d'axes de `SkyBehavior.LookAt`, les dix textures
  de nuage à poser sur 24 maillages homonymes, le système de particules du
  `DistantStarController` ([`41-ciel.md`](41-ciel.md)).
- **Les textures qui défilent** : 17 des 44 ne se retrouvent pas dans la
  géométrie exportée sous leur nom ([`42`](42-lumieres.md)).
- **Quatre modules de particules** employés par le build et non extraits —
  `VelocityModule`, `ClampVelocityModule`, `RotationBySpeedModule` (1 chacun) et
  `SubModule` (2). Les six autres sont employés **zéro** fois
  ([`10-particules.md`](10-particules.md)) : rien à y gagner.
- **Les dettes de mesure** : `tumbleThreshold` toujours un repli assumé, le gain
  de l'encodage Opus jamais mesuré dans un navigateur, les 11,1 Mo de Babylon.

## Ce qui ne se migrera pas

Inchangé, et détaillé par [`08-reste-a-faire.md`](08-reste-a-faire.md) §1 —
**moins les deux lignes que cette page vient de reprendre** : l'espace replié de
Dark Bramble (aucun volume de distorsion), quatre des cinq savoirs, le déblocage
par branche de dialogue (les 20 attributs `eventbased` valent `"false"`), les
machines à états d'animation (11 états, zéro transition), les dégâts localisés
du vaisseau (masque et modificateurs à 0), les éclats de fracture, le modèle de
sonde, les images du flashback, la courbe de dégâts d'impact.

De même, ce qui demande **un œil et une oreille** — équilibrage des volumes
audio et des particules, rendu des atmosphères et des brouillards, et une partie
jouée — ne se referme pas par du code.

## Ordre conseillé

| ordre | lot | effet ressenti | coût |
|---|---|---|---|
| 1 | **3 — vie du décor** (visages, panneaux, réacteurs) | immédiat, et partout | faible |
| 2 | **1 — référentiels** (à commencer par les distances du pilote auto) | on ne dérive plus dans un hangar | élevé |
| 3 | **5 — son réactif** (pas, combinaison, réacteurs) | le jeu répond à ce qu'on fait | moyen |
| 4 | **7 — ramassage de l'équipement** | la progression retrouve ses étapes | faible |
| 5 | **2 — décalcomanies** | les parois cessent d'être plates | faible |
| 6 | **4 — volumes de jeu** (combinaison, hasards) | des règles là où il n'y en a pas | moyen |
| 7 | **8 — impostures de planète** | le ciel ressemble au jeu | élevé |
| 8 | **6 — interface** | à comparer avant de porter | variable |

## La méthode, pour la prochaine fois

1. **Refaire le recensement** (il tient en une trentaine de lignes, voir
   [`45`](45-recensement-mesure.md)) et le diffuser contre `web/src/`, motifs
   compris.
2. **Lire l'IL** des classes du lot avant de l'estimer.
3. **Poser les formules en invariants** de `tests/09-jeu.mjs` *avant* d'écrire le
   lecteur, et les comptes dans `tests/05-extract.mjs` — c'est un de ces
   invariants qui a refusé un chiffre faux dans la série précédente.
