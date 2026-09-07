# Architecture du code de jeu

Notes d'analyse rédigées à partir de la structure du build. Elles décrivent
l'organisation des systèmes, pas leur code.

## Une seule scène, deux familles de racines

`level0` compte 7 688 nœuds répartis sous **4 racines** :

| Racine | Rôle |
|---|---|
| `GlobalManagers` | services globaux, dont l'audio |
| `SettingsMenu` | interface d'options (GUI immédiat, style Unity 4) |
| `FlashbackCamera` | caméra dédiée aux séquences de flashback |
| `SolarSystemRoot` | **tout le contenu jouable** |

## Pivots et corps

Sous `SolarSystemRoot`, deux conventions de nommage cohabitent et disent
beaucoup de la conception :

- Les objets `*_Pivot` (`TimberHearth_Pivot`, `BrittleHollow_Pivot`,
  `GiantsDeep_Pivot`, `HourglassTwins_Pivot`, `DarkBramble_Pivot`,
  `Comet_Pivot`) sont à l'origine et portent **uniquement** un
  `DisposableContainer`. Ce sont de simples regroupements pour le nettoyage,
  pas des moteurs d'orbite : ils ne portent aucune rotation.
- Les objets `*_Body` (`Sun_Body`, `QuantumMoon_Body`, `WhiteHole_Body`,
  `DerelictDimension_Body`, `Player_Body`) sont positionnés en dur et portent un
  `OWRigidbody`. Ce sont des corps physiques à part entière.

Quelques positions initiales, à l'échelle du monde :

```
Sun_Body                 (0, 0, 0)
Player_Body              (-1.4, -26.5, -8127.9)
QuantumMoon_Body         (-9130.0, 0, -5374.9)
WhiteHole_Body           (-23000, 0, 0)
DerelictDimension_Body   (0, -10000, 0)
MapCamera                (0, 15000, -20.1)
```

Le système tient donc dans un rayon de l'ordre de 25 000 unités, et la
« dimension du vaisseau abandonné » est simplement rangée 10 000 unités sous le
soleil — hors de portée, plutôt que dans une scène séparée.

## Les systèmes structurants

Le classement des 275 classes attachées dans la scène, par nombre d'instances,
révèle les piliers du moteur maison :

| Classe | Instances | Rôle apparent |
|---|---|---|
| `OWAudioSource` | 102 | surcouche audio maison |
| `RotateTransform` | 65 | rotations (orbites, rotations propres) |
| `OWRigidbody` | 41 | corps physique maison |
| `InteractReceiver` | 39 | cibles d'interaction du joueur |
| `AttachOnAwake` | 34 | rattachement à un référentiel au réveil |
| `DirectionalForceField` | 34 | champs de gravité |
| `ReadableObject` | 34 | textes lisibles in-game |
| `MatchInitialMotion` | 27 | héritage de la vitesse du parent |
| `SingleFieldDetector` | 19 | détection du champ gravitationnel dominant |

### Référentiels

Le cœur du jeu est un système de **référentiels relatifs** :
`ReferenceFrameTracker`, `Sector`, `AttachOnAwake`, `MatchInitialMotion`,
`AlignWithTargetBody`. Tout se déplaçant en permanence, rien n'est exprimé en
coordonnées absolues : un objet posé sur une planète hérite de son mouvement.
`MatchInitialMotion` (27 instances) est la brique qui évite qu'un objet lâché
soit instantanément distancé par la planète.

C'est le point le plus délicat à réimplémenter, et celui qui détermine toute
l'architecture d'un portage : le choix de représentation des vitesses relatives
doit précéder l'écriture du moteur physique.

### Gravité et orbites

`DirectionalForceField` (34) et `SingleFieldDetector` (19) indiquent une gravité
par **volumes de champ** plutôt que par attraction newtonienne universelle :
chaque corps porte un champ, et un détecteur choisit celui qui domine.

Les orbites, elles, sont **réellement simulées**. Chaque corps porte un
`InitialMotion` (14 instances) qui lui donne au démarrage une vitesse orbitale
calculée à partir du paramètre gravitationnel de son primaire ; il suit ensuite
le champ. Voir `docs/04-gravite.md`.

### Physique du joueur et du vaisseau

`CharacterMovementModel`, `PlayerCharacterController`, `AlignPlayerWithField`
d'un côté ; `ThrusterModel`, `Autopilot`, `FlightConsole`, `ShipDamageController`
de l'autre. `ThrusterModel` expose notamment poussée translationnelle maximale,
poussée rotationnelle maximale et traînée angulaire — les constantes de
maniabilité du vaisseau, récupérables via `tools/06_dump_components.py`.

### Narration

`DialogueGUI` est la plus grosse classe du jeu (~580 lignes), devant
`Conversation` et `FacePlayerWhenTalking`. Les dialogues eux-mêmes sont stockés
en `TextAsset` XML (73 dans le build), extractibles séparément — la logique et
le contenu sont donc bien découplés.

### Sondes et cartes

`Minimap`, `MapController`, `MapMarker`, `AutopilotGUI`,
`ProbePromptController_Old`. Le suffixe `_Old` sur cette dernière est un
marqueur de code mort laissé dans le build.

## Pour un portage JS

Ordre de dépendance suggéré, du plus contraignant au plus périphérique :

1. **Référentiels et mouvement relatif** — conditionne tout le reste.
2. **Champs de gravité par volumes** — reprendre le modèle par champs, pas une
   gravitation à N corps, sinon les orbites divergent.
3. **Orbites par vitesse initiale** — un corps reçoit `√(a(r)·r)`
   perpendiculairement à son rayon, puis suit le champ.
4. **Contrôleur joueur puis vaisseau**, en réutilisant les constantes extraites.
5. **Secteurs** (`Sector`) — activation/désactivation par zone, à traiter comme
   du budget de rendu.
6. Interaction, dialogue, carte.
