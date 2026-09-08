# Le jeu et le portage, face à face : le plan d'action

[`08-reste-a-faire.md`](08-reste-a-faire.md) dit **où en est** le portage.
Cette page-ci dit **quoi faire**, et dans quel ordre.

## Méthode, et ce qu'elle vaut

La comparaison ne repose pas sur une impression du jeu final : elle confronte
trois sources, toutes internes au dépôt.

1. Ce que les mesures du build disent du jeu — les 33 pages de `docs/`, où
   chaque constante est relevée et sourcée.
2. Ce que les extracteurs sortent réellement — `tools/*.py` et
   `web/src/pipeline/extract/*`, plus les structures de
   `web/src/pipeline/unity/unity41-types.json`.
3. Ce que le moteur en fait — `web/src/*.js`.

Le troisième point est celui qui rapporte le plus, et c'est nouveau : plusieurs
écarts ne viennent pas de ce qui manque au build, mais de **données déjà
extraites que personne ne lit**. Elles ne coûtent rien à brancher, et elles
remplacent une valeur inventée par une valeur mesurée.

Aucun chiffre n'a été remesuré ici — la session n'a pas le build. Chaque action
pointe donc le fichier et la page sur lesquels elle s'appuie, pour qu'on puisse
la contredire.

## Le tableau de bord

| domaine | verdict |
|---|---|
| lecture du build, type trees, oracle `byteSize` | **conforme**, et au-delà du pipeline Python (1 390 / 1 390) |
| gravité, orbites, référentiels, floating origin | **conforme** au modèle du jeu |
| géométrie, matériaux, skinning, animations | **conforme**, aux clips Mecanim près, décodés depuis |
| mécaniques de lieu (quantique, trou noir, Bramble, croûte) | **conformes** dans leur logique, incomplètes dans leur mise en scène |
| boucle, mort, ressources, vaisseau, connaissance | **conformes** |
| **monde physique** : rotation propre, champs directionnels, fluides | **écart** — rien de tout cela n'est appliqué |
| **éclairage et son placés** : `Light`, portées d'`AudioSource` | **écart** — les valeurs du build sont là et ne sont pas lues |
| niveau de détail, colliders | **écart assumé** — deux niveaux, un bloc de colliders |
| interface, invites, jauges, carte, réglages | **conformes**, aux quelques champs listés plus bas près |
| commandes | **écart** — clavier et tactile, pas de manette, alors que le build en décrit une |
| ce que l'alpha ne contient pas | **hors d'atteinte**, voir [`08`](08-reste-a-faire.md) §1 |

## 1. Les données du build qu'on n'écoute pas

Le meilleur rapport entre effort et fidélité. Rien à inventer : la valeur est
dans le build, souvent déjà extraite, et une constante choisie à la main la
remplace aujourd'hui.

### A1 — Faire tourner les corps sur eux-mêmes

- **Le jeu** : 65 `RotateTransform` dans `level0`, et un `InitialMotion` qui
  porte `_rotationAxis` / `_initAngularSpeed`, relevés entre 0,02 et 0,05 rad/s
  ([`04-gravite.md`](04-gravite.md)).
- **Le portage** : `pipeline/extract/solar.js` écrit `spin` et
  `orbit.spinAxis` / `orbit.spinSpeed` dans `solar_system.json`, et **aucun
  module du moteur ne les lit**. Les planètes sont figées : pas de cycle
  jour/nuit, un soleil cloué au même point du ciel, et une lampe dont la règle
  « face nuit » ne bascule jamais.
- **Faire** : appliquer la rotation au **repère ancré** plutôt qu'à la
  géométrie. Le corps dominant est immobile dans son propre repère ; le faire
  tourner revient à faire tourner le reste du monde autour de lui, ce qui
  laisse les colliders statiques de Havok exactement où ils sont — c'est la
  même raison qui a fait ancrer l'origine sur le corps dominant
  ([`06-orbites.md`](06-orbites.md)). Le ciel tourne, le sol ne bouge pas.
- **Vérifier** : la cinématique dans `tests/09-jeu.mjs` (période, axe, stabilité
  du sol) ; l'azimut du soleil vu du sol, mesuré à deux instants, dans
  `tools/15_verify.py`.

### A2 — Lire les vraies portées audio

- **Le jeu** : chaque `AudioSource` porte `MinDistance`, `MaxDistance`,
  `rolloffMode`, `Pan2D`, `DopplerLevel`.
- **Le portage** : `pipeline/extract/audio.js` invente une portée **par piste**
  (`DEFAULT_RANGE` : 300 pour Signal, 150 pour Ambience, 60 sinon), au motif que
  « Unity 4 n'expose pas min/max distance ». C'était vrai **du pipeline
  Python** : UnityPy cherchait `m_MinDistance`, or en 4.1 le champ s'appelle
  `MinDistance`, sans préfixe — et il est présent noir sur blanc dans le type
  tree de `unity41-types.json`, que le pipeline navigateur lit directement.
  L'obstacle a disparu avec UnityPy et la note ne l'a pas suivi
  ([`09-audio.md`](09-audio.md)).
- **Second défaut, de la même famille** : pour les neuf émetteurs, la portée
  spatiale vaut `transmitter.falloff`, c'est-à-dire un rayon **en pixels
  d'écran** — la page 09 corrige justement cette confusion pour la mécanique du
  télescope, mais l'extracteur continue d'en faire des unités de monde
  (`HarmonicaSignal` : 400 px devenus 400 u).
- **Faire** : lire `MinDistance` / `MaxDistance` / `rolloffMode` par source et
  les poser sur `spatialMaxDistance` ; ne garder les rayons en pixels que pour
  `signalStrength`, où ils ont un sens.
- **Vérifier** : dans `tests/05-extract.mjs`, la distribution des portées lues
  (aucune ne doit plus valoir exactement 60, 150 ou 300 par construction) ; à
  l'oreille ensuite, mais l'oreille jugera enfin des valeurs du jeu.

### A3 — Poser les lumières de la scène

- **Le jeu** : des composants `Light` placés — le type tree est dans
  `unity41-types.json`, avec type, couleur, intensité, portée, angle de spot.
  Le feu de camp, les intérieurs, les balises de Dark Bramble en ont.
- **Le portage** : `main.js` crée **une** directionnelle pour le soleil et
  **une** hémisphérique d'ambiance. Aucune lumière du build n'est extraite.
- **Faire** : un extracteur `lights` sur le modèle de l'audio et des particules,
  puis une instanciation à la volée avec budget (les lumières temps réel sont
  chères, et `sectors.js` sait déjà qui est à portée).
- **Vérifier** : le compte extrait ; puis, dans `tools/15_verify.py`, le nombre
  de lumières vivantes au sol sur Timber Hearth et la stabilité du temps par
  image.

### A4 — Lire les `RenderSettings` plutôt que les recopier

- **Le portage** : `fog.js` porte en dur le gris `(0,5 ; 0,5 ; 0,5)` et
  `m_FogMode = 3` relevés à la main ([`29-brouillards.md`](29-brouillards.md)).
- **Faire** : les extraire (couleur de brouillard, mode, couleur d'ambiance) —
  la classe est dans `unity41-types.json`. Une valeur juste et une valeur
  recopiée se ressemblent jusqu'au jour où l'une des deux change.

### A5 — Le `_checkDepth` de la lune quantique

`quantum.js` exporte `CHECK_RADIUS = 150` et `CHECK_DEPTH = 100` et **n'utilise
ni l'un ni l'autre** : le test d'occlusion est binaire, là où le jeu lance une
sphère sur une profondeur ([`14-quantique.md`](14-quantique.md)). Épaissir le
segment du rayon de la sphère et borner la profondeur reste analytique, donc
sans coût.

### A6 — Les champs de force directionnels

- **Le jeu** : **34 `DirectionalForceField`**, contre 10 `GravityWell`
  ([`02-architecture.md`](02-architecture.md)). Ce sont les gravités locales —
  et l'un des porteurs de la croûte de Brittle Hollow s'appelle `GravityTrail`
  ([`15-trounoir.md`](15-trounoir.md)).
- **Le portage** : `gravity.js` ne connaît que le champ radial dominant.
- **Faire** : les ajouter aux classes extraites (`PLACED` dans les deux
  extracteurs de gameplay), puis leur donner la priorité sur le champ radial à
  l'intérieur de leur volume — c'est le rôle de `SingleFieldDetector`, qui ne
  combine pas mais **choisit**.
- **Vérifier** : 34 champs extraits ; un test de sélection dans
  `tests/09-jeu.mjs` (dans le volume, c'est le directionnel qui gagne).

### A7 — Les fluides, et l'océan de Giant's Deep

- **Le jeu** : `SphereOceanFluidVolume` et `SimpleFluidVolume` sont dans la
  scène ([`03-typetrees.md`](03-typetrees.md)), et `SimpleFluidDetector`
  applique un `_dragCoefficient` — 10 pour les fragments de croûte, qui n'en
  voient jamais l'effet faute de fluide sur Brittle Hollow.
- **Le portage** : `SphereOceanFluidVolume` figure dans `BODY_CLASSES` de
  `extract/solar.js` mais **n'est jamais émis** : la boucle n'écrit un corps que
  s'il porte un `GravityWell` ou un `PlanetoidSector`. Giant's Deep n'a donc pas
  d'océan, et rien ne freine dans un fluide.
- **Faire** : émettre les volumes, puis appliquer traînée et poussée d'Archimède
  au joueur, au vaisseau, à la sonde et aux fragments.
- **Vérifier** : le rayon du volume contre celui du corps ; une vitesse limite
  de chute dans le fluide, dans `tests/09-jeu.mjs`.

### A8 — Les niveaux de détail sont dans le build, pas à générer

- **Le jeu** : `LODGroup`, `LODLayer`, 5 `CreateLODGroup`, 21
  `ChildColliderLOD` ([`17-secteurs.md`](17-secteurs.md)).
- **Le portage** : `lod.js` fait deux niveaux, présent ou absent, sur un seuil
  choisi (0,0022 de hauteur d'écran), et `08-reste-a-faire.md` classe la suite
  en « techniquement ouvert » au motif que simplifier un maillage coûterait plus
  que le gain.
- **Le point à retenir** : un `LODGroup` **ne simplifie rien à la volée**, il
  désigne des maillages déjà simplifiés, présents dans le build. Il n'y a donc
  rien à générer — seulement à exporter les niveaux et à lire les seuils, qui
  sont exprimés dans l'unité que `lod.js` calcule déjà.
- **Faire** : extraire les groupes et la liste de rendus de chaque niveau ;
  exporter les maillages de tous les niveaux ; remplacer le seuil unique par
  ceux du build. Puis les 21 `ChildColliderLOD`, qui feront tomber les 441
  colliders et les 898 ms de construction de Timber Hearth.
- **Vérifier** : nombre de groupes et de niveaux ; poids du lot Timber Hearth
  avant/après ; temps de construction des colliders.

### A9 — `mainData` n'est jamais extrait

`pipeline/worker.js` charge bien les cinq fichiers, mais l'`ExtractContext` est
construit sur `level0` seul. Les **989 objets** de `mainData` — scène de
démarrage et managers — ne sortent donc jamais, ce qui explique au passage les
7 rendus `V-Fog` restés introuvables ([`20-shaders-jeu.md`](20-shaders-jeu.md))
et l'absence de menu principal ([`28-hud.md`](28-hud.md)). **Faire** : passer
les extracteurs de scène et de composants sur `mainData`, puis inventorier avant
de décider quoi en porter.

## 2. Les systèmes du jeu sans équivalent

Ici il faut écrire du code de jeu, mais les données existent.

### A10 — La manette

Le build décrit une manette entière (`XboxInput`), l'extracteur d'invites
retient déjà **le bouton attendu par chaque invite**
(`extract/prompts.js`), et les **16 textures d'icônes** sont extraites, avec
leur nommage particulier (`RightTrigger` → `RT.png`)
([`28-hud.md`](28-hud.md)). Le portage n'en lit aucune.
**Faire** : la Gamepad API branchée exactement comme la couche tactile — elle
« ne crée aucune commande », elle produit les mêmes axes et les mêmes codes
([`33-mobile.md`](33-mobile.md)) — et l'icône affichée dans l'invite.
C'est le chemin le plus court vers un vrai portage des commandes.

### A11 — Les zones d'oxygène

`main.js` passe `inSupply: ship.boarded` : **seul le vaisseau recharge**.
**Faire** : chercher dans la scène le composant qui fournit l'oxygène (arbres,
volumes) ; le brancher s'il existe, l'inscrire dans
[`08`](08-reste-a-faire.md) §1 s'il n'existe pas. Tant que la question n'est pas
tranchée, on ne sait pas si c'est un manque du portage ou de l'alpha.

### A12 — Les caméras déportées

`RemoteFlightConsole` et `SatelliteSnapshotController` supposent une caméra
ailleurs que sur le joueur ([`30-consoles.md`](30-consoles.md)) — et ce moyen
existe désormais : la caméra embarquée de la sonde
([`25-interface.md`](25-interface.md)). **Faire** : réutiliser `ProbeCamera`
pour les deux consoles ; leurs invites sont déjà au catalogue.

### A13 — Le brouillard, ses habitants et ses zones

- **`CorruptionAnimator`** (10) pilote un seuil de découpe de matériau sur la
  fraction de boucle ([`16-bramble.md`](16-bramble.md)) : le champ se lit, le
  répartiteur de shaders sait déjà appliquer un seuil.
- **`DerelictCloaker`** (2) et les événements `EnterDerelictZone` /
  `ExitDerelictZone`, qui suspendent la mise à jour du brouillard
  ([`29-brouillards.md`](29-brouillards.md)).
- **`AlignQuantumMoon`**, qui oriente la lune vers le joueur.

### A14 — Le bruit qui attire les prédateurs

Le `NoiseSensor` est nourri par les **commandes du joueur**, pas par les sources
sonores réellement en train de jouer ([`16-bramble.md`](16-bramble.md)). Or
`audio.js` sait exactement lesquelles vivent et à quelle distance. **Faire** :
publier un niveau de bruit depuis le champ audio et le donner aux prédateurs.
Le jour où l'on peut se trahir en laissant tourner un poste de radio, la zone
change de nature.

### A15 — Les petites règles restées de côté

Chacune tient en quelques lignes, toutes sont mesurées :

| règle | source |
|---|---|
| `MapMarker._maxDisplayDistance` non appliqué : tout reste visible | [`19-carte.md`](19-carte.md) |
| minicarte allumée par proximité, au lieu du drapeau `GetUseMinimap` du secteur majeur | [`28-hud.md`](28-hud.md) |
| rien ne distingue un panneau de musée d'un personnage, alors que la mise en forme élargie existe | [`25-interface.md`](25-interface.md) |
| arbre de dialogue choisi par **nom** au lieu de la référence directe portée par `Conversation` | [`23-connaissance.md`](23-connaissance.md) |
| guimauve grillée sur commande, pas par proximité d'un `HeatSource` | [`30-consoles.md`](30-consoles.md) |
| mort : ni son par cause, ni mouvement de caméra pendant la séquence | [`32-mort.md`](32-mort.md) |

## 3. Le poids et la tenue

### A16 — Les 15 Mo de WAV

Quinze fichiers, 48 kHz 16 bits, sur les 66,1 Mo du démarrage
([`27-poids.md`](27-poids.md)). La chaîne d'outils n'a pas d'encodeur Vorbis —
mais le navigateur en a un : `AudioEncoder` (WebCodecs) encode en Opus dans le
worker, **au moment de l'extraction**, une fois pour toutes, avec repli sur le
WAV là où l'API manque. C'est le pipeline navigateur qui rend cette piste
possible, et elle n'a pas été essayée.

### A17 — Babylon pèse 11,1 Mo

Près d'un cinquième du démarrage, pour un moteur dont on n'utilise qu'une part.
Une compilation sur mesure les réduirait — au prix d'une étape de construction,
que le dépôt n'a pas aujourd'hui (« aucune dépendance npm »). À peser comme un
choix de projet, pas seulement comme une optimisation.

### A18 — Le cache des textures partagées

27 URL demandées jusqu'à cinq fois faute d'en-têtes de cache
([`27-poids.md`](27-poids.md)). Le Service Worker sert déjà `data/…` : qu'il
pose un `Cache-Control` et garde un cache mémoire, et la mesure cesse d'être un
pire cas.

## 4. Ce qui demande un jugement humain

Aucune de ces lignes ne se ferme par du code, et aucune ne doit disparaître de
la liste pour autant ([`08-reste-a-faire.md`](08-reste-a-faire.md) §2) :
l'équilibrage des volumes — que A2 rendra enfin discutable sur des valeurs du
jeu —, l'échelle des particules, le rendu des atmosphères, de la surface
stellaire, des brouillards et de l'explosion, **une partie jouée**, et une
partie jouée **au pouce, sur un vrai téléphone**
([`33-mobile.md`](33-mobile.md)).

## 5. Ce qui ne se comblera pas

L'espace replié de Dark Bramble, quatre des cinq savoirs, les branches
`eventbased`, les machines à états d'animation, les dégâts localisés réglés à
zéro, les éclats de fracture, le modèle de sonde, les images du flashback, la
courbe de dégâts d'impact. Ce sont des manques **de l'alpha**, démontrés un par
un dans [`08-reste-a-faire.md`](08-reste-a-faire.md) §1. Les porter reviendrait
à écrire le jeu, pas à le porter — et la règle du dépôt est de le dire plutôt
que d'inventer.

## Par où commencer

Cinq actions, dans cet ordre, parce qu'elles changent ce qu'on voit et ce qu'on
entend pour un coût connu, et que chacune remplace une valeur inventée par une
valeur du build :

1. **A1**, la rotation propre des corps — c'est le plus gros écart de monde
   encore ouvert, et le repère ancré est déjà le bon endroit pour le porter.
2. **A2**, les portées audio réelles — l'obstacle qui les bloquait a disparu
   avec UnityPy.
3. **A3**, les lumières de la scène — deux lumières inventées pour tout un
   système solaire.
4. **A7**, les fluides — sans eux, Giant's Deep n'est pas Giant's Deep.
5. **A8**, les niveaux de détail du build — le seul gain de poids qui ne coûte
   aucune fidélité.

Puis **A10**, la manette, qui est le dernier grand pan d'entrée décrit par le
build et jamais lu.
