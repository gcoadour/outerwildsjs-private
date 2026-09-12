# Ce qui reste à migrer de l'alpha d'origine

La référence est le build que la page rejoue : l'**alpha ouverte 1.2**, telle
que la servait la page de téléchargements d'`outerwilds.com` dans l'instantané
Wayback du **15 août 2015** (`20150815180605`) — celui-là même que
[`tools/01_fetch.sh`](../tools/01_fetch.sh) va chercher. La page offrait trois
plateformes (`Linux`, `PC`, `Mac`) du **même** contenu ; le dépôt travaille sur
`OuterWilds_Alpha_1_2_Linux.zip` (289 268 118 octets, SHA-256
`5c7defad…80f05a`, Unity 4.1.2f1), et le SHA-256 tranche entre les deux sources
de téléchargement.

Cette page ne refait pas l'inventaire d'état — c'est
[`08-reste-a-faire.md`](08-reste-a-faire.md) — ni l'audit chiffré —
c'est [`36-audit.md`](36-audit.md). Elle répond à une question plus étroite :
**qu'est-ce que l'alpha contient et que le portage ne lit toujours pas**, et
dans quel ordre s'y prendre.

## Méthode, et ce qu'elle ne voit pas

Cette passe s'est faite **sans le build sous la main**. Deux sources, donc :

1. les mesures déjà consignées dans `docs/`, qui sont des relevés sur le build
   et non des impressions ;
2. un **recoupement mécanique** entre les noms de classes cités dans `docs/` et
   ceux que `web/src/` nomme, reproductible :

```bash
# les classes citées dans les notes, et jamais nommées par le portage
grep -rhoE '`[A-Z][A-Za-z0-9_]{5,}`' docs/ | tr -d '`' | sort -u |
  while read -r n; do grep -rqF "$n" web/src/ || echo "$n"; done
```

**Trois angles morts, nommés d'avance.** Le recoupement ne voit que ce que les
notes citent : une classe du build que personne n'a jamais écrite nulle part
lui est invisible — seul le recensement de [`42-lumieres.md`](42-lumieres.md),
qui demande le build, couvre les **170** classes sans lecteur. Il compte à tort
comme absentes les classes lues **par motif** (`OxygenVolume` par `/oxygen/i`,
`TornadoBaseFluidVolume` par `/tornadobase/i`, `TractorBeamFluid` par
`/tractorbeam/i`, `TimeLoopVolume` et `PineGroveVolume` par leur volume). Et il
ne dit rien des **champs** non lus d'une classe par ailleurs lue : c'est
exactement le défaut qu'avait trouvé [`36-audit.md`](36-audit.md) avec
`_fieldMagnitude`, et aucune méthode par nom ne l'attrape.

Ce qui suit est donc une **borne**, honnête dans les deux sens : elle liste des
choses qui sont peut-être déjà couvertes par motif, et elle en manque
certainement d'autres.

## Trois résultats avant les lots

### 1. Toutes les sorties du pipeline ont un lecteur

Les quatorze fichiers que les extracteurs écrivent sous `data/` sont tous
ouverts par un module du moteur — `solar_system`, `gameplay`, `lighting`,
`sky`, `texanim`, `particles`, `audio/sources`, `dialogue`, `interface`,
`shaders/report`, `scene/level0`, `scene/maindata`, les glTF. La famille de
manques qu'avait révélée [`34-actions.md`](34-actions.md) — *extrait, et
personne ne le lit* — est **fermée à l'échelle du fichier**.

### 2. Sauf un, et c'est le plus gros

`data/components/level0.json` porte **1 390 `MonoBehaviour` avec la valeur de
leurs champs**. C'est la sortie la plus riche du pipeline, et **aucun module du
moteur ne l'ouvre**. Ce n'est pas un oubli : c'est une conséquence de
l'architecture. Chaque système du moteur lit un fichier *taillé pour lui*
(`lighting.json`, `texanim.json`, `sky.json`…), produit par un extracteur qui
sait quelles classes l'intéressent. La liste de ces classes est en dur dans les
extracteurs — `PLACED` et `SINGLETONS` dans
[`pipeline/extract/gameplay.js`](../web/src/pipeline/extract/gameplay.js) en
nomment 35.

**Conséquence directe sur le coût de tout ce qui suit** : aujourd'hui, porter
un composant demande *deux* écritures — une passe d'extraction qui le
sélectionne et le met en forme, puis un lecteur dans le moteur. C'est ce qui
rend le lot 0 rentable avant les autres.

### 3. Trente-huit classes de jeu, au moins 378 composants posés

Après avoir retiré du recoupement ce qui n'est pas une classe de jeu
(exceptions Python, extensions glTF, noms d'objets, de sprites, d'avatars ou
d'arbres de dialogue), il reste **38 classes** que l'alpha pose dans `level0` et
que le portage ne nomme nulle part, plus **quatre modules de particules**. Pour
les 29 dont [`42-lumieres.md`](42-lumieres.md) a relevé le compte, cela fait
**378 composants** sans lecteur. Elles se rangent en six familles, et c'est
l'ordre des lots.

---

## Lot 0 — un lecteur générique de composants

**Pourquoi d'abord.** Tant qu'il n'existe pas, chaque lot ci-dessous paie une
passe d'extraction avant d'écrire sa loi. Après lui, il ne paie que sa loi.

- Ajouter `web/src/components.js` : charge `data/components/level0.json`,
  indexe par `script` et par `game_object`, expose `byClass(nom)` et
  `fieldsOf(pathId)`. Le fichier est déjà écrit à chaque extraction.
- Vérifier d'abord son **poids** : 1 390 composants avec leurs champs, c'est le
  genre de fichier qui pèse sur la première image que
  [`27-poids.md`](27-poids.md) surveille. S'il dépasse le budget, le charger à
  la demande (après la première image) plutôt qu'au démarrage, comme les
  secteurs.
- Le repli est le même que partout : fichier absent → index vide, et chaque
  lecteur garde son comportement actuel.

**Invariant** (`tests/05-extract.mjs`, avec le build) : chaque composant de
`level0.json` porte un `script`, un `game_object` résolu et des `fields` non
vides ; l'index en rend le même nombre que le fichier.

---

## Lot 1 — les référentiels hérités (89 instances)

La famille la plus lourde encore ouverte, et
[`42-lumieres.md`](42-lumieres.md) la désignait déjà.

| classe | instances | ce qu'elle dit |
|---|---|---|
| `AttachOnAwake` | 34 | l'objet s'attache à un porteur au réveil |
| `MatchInitialMotion` | 27 | il hérite du mouvement de ce porteur |
| `InertiaTensorCalibrator` | 14 | il corrige son tenseur d'inertie |
| `MajorReferenceFrameVolume` | 9 | volume de référentiel majeur |
| `ReferenceFrameVolume` | 5 | volume de référentiel |
| `ReferenceFrameTracker` | — | le suivi côté joueur |

**Ce que le portage fait déjà** : `frameVelocity()` reporte positions **et**
vitesses au changement d'ancre ([`37-corrections.md`](37-corrections.md)). Ce
qu'il ne fait pas : lire **quel** objet hérite de **quel** porteur. Le portage
ancre sur le corps dominant par la gravité ; le build, lui, le *déclare* par
volume, et les deux ne coïncident pas partout — un vaisseau posé dans un
hangar, un objet lâché dans une grotte.

**À faire.** Lire `AttachOnAwake` et `MatchInitialMotion` dans l'IL
d'`Assembly-CSharp.dll` (`pipeline/dotnet/`, méthode de
[`39-fluides.md`](39-fluides.md)) : le champ qui désigne le porteur, et si le
mouvement hérité est la vitesse seule ou aussi la rotation. Puis arbitrer les
volumes de référentiel par leur portée, en priorité sur le champ dominant, comme
les champs directionnels le sont déjà sur le champ radial.

**Fichiers** : `origin.js`, `orbits.js`, `main.js` (le basculement d'ancre).
**Invariant** (`tests/09-jeu.mjs`) : un objet dans un volume de référentiel
déclaré garde une vitesse relative nulle à son porteur, même quand le corps
dominant par la gravité est un autre.

---

## Lot 2 — la musique est événementielle, le portage la joue à la distance

[`43-pnj-son-decollage.md`](43-pnj-son-decollage.md) l'a relevé au passage et
laissé ouvert : **aucune piste de musique du build n'est `playOnAwake`**.

| classe | instances | déclencheur mesuré |
|---|---|---|
| `TravelMusicController` | — | le joueur est dans le vide (`OnEnterTheVoid`) et hors du poste de pilotage |
| `ShipOnlyMusicVolume` | — | le joueur est dans le volume **et** dans le vaisseau |
| `EndOfTimeMusicController` | — | `TimeLoop.GetSecondsRemaining()`, puis `MixEndTimes` et fondu |
| `AudioVolume` | 14 | ambiance sonore par zone |

Le portage les déclenche par proximité de leur source : le résultat s'en
approche, la mécanique n'est pas la même — et la différence s'entend quand on
décolle, parce que la musique de voyage devrait partir à la sortie de
l'atmosphère et non à un rayon.

**À faire.** Trois conditions à transcrire (les trois sont des états que le
moteur possède déjà : `player.inVoid`, `ship.boarded`, `timeloop.remaining`) et
un type de volume à lire, `AudioVolume`, avec son clip et sa piste de mixage.
**Fichiers** : `audio.js`, `timeloop.js`. **Invariant** (`tests/09-jeu.mjs`) :
la piste de voyage part quand et seulement quand les deux conditions sont
vraies ; la piste de fin des temps suit le compte à rebours.

---

## Lot 3 — les volumes de jeu qu'on traverse sans effet (67 instances)

| classe | instances | ce qu'elle devrait faire |
|---|---|---|
| `RepairVolume` | 18 | réparer le vaisseau — l'intégrité est portée, rien ne la rend |
| `EntrywayTrigger` | 18 | entrer / sortir d'un volume (sas, grotte, intérieur) |
| `RadiationEmitter` | 9 | rayonnement : des dégâts continus dans un rayon |
| `InteractZone` | 7 | interaction par zone, distincte des 39 `InteractReceiver` portés |
| `DestructionVolume` | 6 | détruire ce qui entre (le soleil, le trou noir) |
| `SunlessZone` | 5 | éclairage : la zone n'est pas éclairée par l'étoile |
| `ZeroGField` | 4 | apesanteur déclarée, indépendante de la gravité calculée |

`RepairVolume` et `DestructionVolume` sont les deux qui changent une partie :
sans le premier, une coque abîmée le reste jusqu'à la fin de la boucle ; sans le
second, la mort est décidée par des seuils du portage plutôt que par les volumes
du jeu ([`32-mort.md`](32-mort.md) en liste cinq causes, aucune n'est un
volume).

**À faire.** Ces sept classes portent des champs simples (rayon ou collider,
taux, cible). Le collider se lit déjà — `40-solide.md` a établi comment. La loi
de chacune se lit dans l'IL, en une méthode `Update` ou `OnTriggerStay`.
**Fichiers** : `shipdamage.js` (réparation), `death.js` (destruction),
`resources.js` (rayonnement), `interact.js`, `lights.js` (zones sans soleil),
`gravity.js` (apesanteur). **Invariant** (`tests/09-jeu.mjs`) : intégrité qui
remonte dans un volume de réparation et pas ailleurs ; santé qui baisse à
l'entrée d'un émetteur, au taux du build ; mort à l'entrée d'un volume de
destruction.

---

## Lot 4 — la vie du décor (75 instances)

| classe | instances | effet |
|---|---|---|
| `RandomParticleBursts` | 18 | bouffées de particules aléatoires |
| `FaceActiveCamera` | 15 | panneaux qui doivent regarder la caméra — sans quoi ils restent de biais |
| `ThrusterParticlesBehavior` | 10 | les réacteurs du vaisseau réagissent à la poussée |
| `FacePlayerWhenTalking` | 8 | le villageois se tourne vers le joueur pendant le dialogue |
| `AncientTeleporter` | 6 | téléporteurs |
| `TornadoPivotController` | 6 | la tornade tourne autour de son pivot |
| `JellyfishController` | 5 | faune de Giant's Deep |
| `MeteorLauncher` | 4 | météores lancés depuis la lune volcanique |
| `SupernovaLight` | 3 | la lumière de la fin des temps |

Trois d'entre elles se voient tout de suite : `FaceActiveCamera` (15 panneaux de
biais), `FacePlayerWhenTalking` (on parle à un dos) et
`ThrusterParticlesBehavior` (les réacteurs ne répondent pas à la commande).
`AncientTeleporter` est le seul de ce lot à changer la **topologie** du monde :
six points de passage qu'on ne peut pas emprunter.

**Fichiers** : `particles.js`, `geometry.js` (orientation), `dialogueui.js`,
`ship.js`, `bodies.js`. **Invariant** : pour les trois orientations, un test
d'angle dans `tests/09-jeu.mjs` ; pour les téléporteurs, la paire d'extrémités
relevée à l'extraction.

---

## Lot 5 — les pièces du vaisseau ont un lecteur, pas une forme

`EngineComponent` × 10. Le portage suit déjà l'état des pièces et coupe les
propulseurs ([`18-vaisseau.md`](18-vaisseau.md)) ; ce qui manque est le lien
entre une pièce morte et **ce qu'on en voit** — c'est le
`_vanishEffectPrefab` que [`08-reste-a-faire.md`](08-reste-a-faire.md) §3 tient
ouvert. Lire les dix composants donne la correspondance pièce → sous-arbre de la
coque, et rend l'avarie visible.

---

## Lot 6 — le ciel, et les impostures de planète

Le seul lot où le portage a résolu le problème **autrement** que le jeu, et
assume de le refaire.

- **`LODCameraSnapshot` × 5**, `_snapshotInterval` 1 : le jeu affiche un système
  entier parce que les planètes lointaines sont des **textures rafraîchies une
  fois par seconde**. Le portage emploie des sphères de substitution et des
  secteurs — légitime, mais le ciel n'y ressemble pas. À reprendre seulement si
  le budget de rendu le demande ([`36-audit.md`](36-audit.md) §2.8).
- **`SkyBehavior.LookAt`** : c'est cette rotation qui fait le jour et la nuit.
  La convention d'axes entre le `LookAt` d'Unity et l'export glTF, qui inverse
  Z, reste à établir — deux orientations essayées, toutes deux fausses
  ([`41-ciel.md`](41-ciel.md)).
- **Les dix textures de nuage** sont extraites et nommées par nuage ; il reste à
  les exporter comme images et à les poser sur 24 maillages qui portent tous le
  même nom.
- **`DistantStarController`** est extrait, son système de particules ne l'est
  pas : le champ d'étoiles est une implémentation du portage.

---

## Lot 7 — les textures qui défilent, les dix-sept qui manquent

Porté à 27 rattachements sur 44 ([`42-lumieres.md`](42-lumieres.md)). Restent
**17 surfaces** dont le nom ne se retrouve pas dans la géométrie exportée
(15 `nurbsToPoly…`, un `surface`, un `Core`) — trois sont sur des corps non
chargés, quatorze sont un point ouvert — et **4 des 27 rattachées** n'ont pas de
texture diffuse à faire défiler. Et quatre instances (`middle`, `inner`,
`outer`, `pCylinder1`) ont deux variantes pour six instances : un rythme peut
échoir à la mauvaise couche des anneaux. L'appariement par nom est ce qui reste
quand la position ne sert à rien ; le lever demande de remonter au `PPtr` du
renderer plutôt qu'au nom.

---

## Lot 8 — les décalcomanies (98 instances)

`DS_DecalProjector` 38, `DS_DecalsMeshRenderer` 30, `DS_Decals` 30. Un système
**tiers** (Decal System), dont la géométrie est déjà exportée : ce sont les 30
*Decals Mesh Renderer* que [`40-solide.md`](40-solide.md) a rendus traversables.
Elles sont donc dans la scène, plaquées comme des maillages ordinaires, sans le
décalage de profondeur ni le mélange que le système prévoit — ce qui se voit en
rasant une paroi. Le coût est un matériau, pas une mécanique : c'est le lot au
meilleur rapport effet / lignes une fois le lot 0 posé.

---

## Lot 9 — les petites lectures, et les dettes de mesure

- **Quatre modules de particules** employés par le build et non extraits :
  `VelocityModule`, `ClampVelocityModule`, `RotationBySpeedModule` (1 instance
  chacun) et `SubModule` (2). Les six autres modules absents du portage sont
  employés **zéro** fois ([`10-particules.md`](10-particules.md)) : il n'y a
  rien à y gagner.
- **`ZeroGTrainingManager`** : l'entraînement en apesanteur. `_crashCount` et
  `_landCount` du `RocketKidConvoController` restent à zéro faute du vaisseau
  miniature ([`43`](43-pnj-son-decollage.md) §1) — c'est la même zone du jeu.
- **`MultiFieldDetector`** (11) et **`FieldInheritor`** (9) : la gravité du
  portage choisit *un* champ dominant ; ces onze détecteurs en cumulent
  plusieurs. À mesurer avant de conclure — le modèle dominant est le bon pour
  `SingleFieldDetector`, qui est le cas courant.
- **`ProbePromptController_Old`** : le suffixe dit ce qu'il est, à ne porter que
  si le neuf manque.
- **`GrayscaleEffect`, `SeparableBlur`, `LensFlareCreate`** : des effets d'image
  Unity que le classement des shaders relève et que le portage ne rend pas.
- **`tumbleThreshold`** est encore un repli assumé, jamais relevé sur le build
  ([`36-audit.md`](36-audit.md) §3).
- **Le gain de l'encodage Opus** n'a toujours pas été mesuré dans un
  navigateur, maintenant que la passe s'exécute pour de bon.
- **Les 11,1 Mo de Babylon** restent un choix de projet, pas une optimisation.

---

## Ce qui ne se migrera pas

Inchangé, et détaillé par [`08-reste-a-faire.md`](08-reste-a-faire.md) §1 :
l'espace replié de Dark Bramble (aucun volume de distorsion ; le conteneur
s'appelle `DarkBramble_TestBed`), quatre des cinq savoirs, le déblocage par
branche de dialogue (les 20 attributs `eventbased` valent `"false"`), les
machines à états d'animation (11 états, **zéro** transition), les dégâts
localisés du vaisseau (masque et modificateurs à 0), les éclats de fracture
(`if (_debrisShardPrefab != null) { }` est un bloc vide), le modèle de sonde,
les images du flashback, la courbe de dégâts d'impact. Ces choses ne sont pas
dans l'alpha ; les porter serait les **inventer**, et le dépôt ne le fait que
quand il le dit.

De même, ce qui demande **un œil et une oreille** — équilibrage des volumes
audio et des particules, rendu des atmosphères et des brouillards, et une
partie jouée — ne se referme pas par du code.

---

## Ordre conseillé, et pourquoi

| ordre | lot | effet ressenti | coût |
|---|---|---|---|
| 1 | **0 — lecteur générique** | nul en soi | faible, et il paie les suivants |
| 2 | **3 — volumes de jeu** | réparer, mourir où le jeu le décide | moyen |
| 3 | **2 — musique événementielle** | le jeu a une bande-son quand il faut | faible |
| 4 | **4 — vie du décor** | on parle à un visage, les réacteurs répondent | moyen |
| 5 | **1 — référentiels hérités** | on ne dérive plus dans un hangar | élevé |
| 6 | **8 — décalcomanies** | les parois cessent d'être plates | faible |
| 7 | **5 — pièces du vaisseau** | l'avarie se voit | faible |
| 8 | **7 — textures défilantes** | 17 surfaces figées de plus qui bougent | moyen |
| 9 | **6 — ciel et impostures** | le ciel ressemble au jeu | élevé |
| 10 | **9 — petites lectures** | justesse | faible, en continu |

Le lot 1 est classé cinquième alors qu'il est le plus nombreux : c'est celui
dont on ne sait pas encore ce qu'il change, faute d'avoir lu les deux `Update`
qui le portent. **Le lire avant de le chiffrer** est la règle que les cinq
dernières pages ont posée.

## Quand le build est de nouveau là

Trois choses à faire dans l'ordre, et aucune ne demande d'écrire du moteur :

1. **Refaire le recensement** de [`42-lumieres.md`](42-lumieres.md) et le
   diffuser contre `web/src/` : il donne les 170 classes sans lecteur, là où
   cette page-ci n'en voit que 38.
2. **Relever les comptes** des neuf classes dont cette page écrit « — » :
   `TravelMusicController`, `ShipOnlyMusicVolume`, `EndOfTimeMusicController`,
   `ReferenceFrameTracker`, `AlignPlayerWithField`, `CharacterMovementModel`,
   `FlashbackCamera`, `ZeroGTrainingManager`, `ProbePromptController_Old`.
3. **Lire l'IL** des classes du lot à venir avant de l'estimer, et poser ses
   formules en invariants de `tests/09-jeu.mjs` avant d'écrire le lecteur — dans
   cet ordre, qui est celui qui a marché pour les fluides, les lumières et les
   textures défilantes.
