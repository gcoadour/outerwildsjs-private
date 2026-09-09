# Le jeu et le portage, face à face : le plan d'action

[`08-reste-a-faire.md`](08-reste-a-faire.md) dit **où en est** le portage.
Cette page-ci disait **quoi faire**, et dans quel ordre. Les dix-huit actions
sont faites : chacune garde ci-dessous son constat d'origine, suivi de ce qui a
été porté, de ce qui vient du build et de ce qui a dû être choisi.

## Méthode, et ce qu'elle vaut

La comparaison ne repose pas sur une impression du jeu final : elle confronte
trois sources, toutes internes au dépôt.

1. Ce que les mesures du build disent du jeu — les 33 pages de `docs/`, où
   chaque constante est relevée et sourcée.
2. Ce que les extracteurs sortent réellement — `tools/*.py` et
   `web/src/pipeline/extract/*`, plus les structures de
   `web/src/pipeline/unity/unity41-types.json`.
3. Ce que le moteur en fait — `web/src/*.js`.

Le troisième point est celui qui a le plus rapporté, et c'était nouveau :
plusieurs écarts ne venaient pas de ce qui manque au build, mais de **données
déjà extraites que personne ne lisait**. Elles ne coûtaient rien à brancher, et
elles remplacent une valeur inventée par une valeur mesurée.

Aucun chiffre n'a été remesuré ici — la session n'avait pas le build. Chaque
action pointe donc le fichier et la page sur lesquels elle s'appuie, pour qu'on
puisse la contredire ; et **ce qui a été porté sans mesure est dit comme tel**,
action par action. Les invariants qui se vérifient sous Node sont dans
`tests/09-jeu.mjs` et `tests/10-opus.mjs`, ceux qui demandent un navigateur dans
`tools/15_verify.py`, ceux qui demandent le build dans `tests/05-extract.mjs`.

## Le tableau de bord

| domaine | verdict |
|---|---|
| lecture du build, type trees, oracle `byteSize` | **conforme**, et au-delà du pipeline Python (1 390 / 1 390) |
| gravité, orbites, référentiels, floating origin | **conforme** au modèle du jeu |
| géométrie, matériaux, skinning, animations | **conforme**, aux clips Mecanim près, décodés depuis |
| mécaniques de lieu (quantique, trou noir, Bramble, croûte) | **conformes** dans leur logique, incomplètes dans leur mise en scène |
| boucle, mort, ressources, vaisseau, connaissance | **conformes** |
| **monde physique** : rotation propre, champs directionnels, fluides | **porté** — A1, A6, A7 |
| **éclairage et son placés** : `Light`, portées d'`AudioSource` | **porté** — A2, A3, A4 |
| niveau de détail, colliders | **porté** — les seuils du build, A8 |
| interface, invites, jauges, carte, réglages | **conformes** |
| commandes | **portées** — clavier, tactile et manette par le même chemin, A10 |
| ce que l'alpha ne contient pas | **hors d'atteinte**, voir [`08`](08-reste-a-faire.md) §1 |

## 1. Les données du build qu'on n'écoutait pas

Le meilleur rapport entre effort et fidélité. Rien à inventer : la valeur est
dans le build, souvent déjà extraite, et une constante choisie à la main la
remplaçait.

### A1 — Faire tourner les corps sur eux-mêmes

- **Le jeu** : 65 `RotateTransform` dans `level0`, et un `InitialMotion` qui
  porte `_rotationAxis` / `_initAngularSpeed`, relevés entre 0,02 et 0,05 rad/s
  ([`04-gravite.md`](04-gravite.md)).
- **Le portage** : `pipeline/extract/solar.js` écrivait `spin` et
  `orbit.spinAxis` / `orbit.spinSpeed` dans `solar_system.json`, et **aucun
  module du moteur ne les lisait**. Les planètes étaient figées : pas de cycle
  jour/nuit, un soleil cloué au même point du ciel, et une lampe dont la règle
  « face nuit » ne basculait jamais.
- **Fait** : `web/src/spin.js`. La rotation s'applique au **repère ancré**, pas
  à la géométrie : le corps dominant est immobile dans son propre repère, le
  faire tourner revient à faire tourner le reste du monde autour de lui, et les
  colliders statiques de Havok ne bougent pas d'un pouce — la même raison qui a
  fait ancrer l'origine sur le corps dominant ([`06-orbites.md`](06-orbites.md)).
  Le ciel tourne, le sol ne bouge pas. L'axe, donné dans le repère propre du
  corps, est ramené dans le repère de travail par `bodyRotation`, ajouté à
  l'extracteur pour l'occasion.
- **Assumé** : la géométrie des *autres* corps ne tourne pas sur elle-même. Dès
  qu'on s'en approche assez pour le voir, leur champ devient dominant et c'est
  leur repère qui tourne. Les forces d'inertie ne sont pas ajoutées : à
  0,03 rad/s et 250 u, la centrifuge vaut 2 % de la gravité, et le jeu, qui
  attache le joueur au corps, ne les modélise pas davantage.
- **Vérifié** : la cinématique dans `tests/09-jeu.mjs` (période, axe, retour du
  ciel après un tour complet, sol immobile) ; l'azimut du soleil mesuré **à deux
  instants** dans `tools/15_verify.py`, qui contrôle qu'il défile exactement à
  la vitesse de rotation du corps, et en sens inverse.

### A2 — Lire les vraies portées audio

- **Le jeu** : chaque `AudioSource` porte `MinDistance`, `MaxDistance`,
  `rolloffMode`, `Pan2D`, `DopplerLevel`.
- **Le portage** : `pipeline/extract/audio.js` inventait une portée **par
  piste** (`DEFAULT_RANGE` : 300 pour Signal, 150 pour Ambience, 60 sinon), au
  motif que « Unity 4 n'expose pas min/max distance ». C'était vrai **du
  pipeline Python** : UnityPy cherchait `m_MinDistance`, or en 4.1 le champ
  s'appelle `MinDistance`, sans préfixe — et il est présent noir sur blanc dans
  le type tree de `unity41-types.json`, que le pipeline navigateur lit
  directement. L'obstacle avait disparu avec UnityPy et la note ne l'avait pas
  suivi ([`09-audio.md`](09-audio.md)).
- **Second défaut, de la même famille** : pour les neuf émetteurs, la portée
  spatiale valait `transmitter.falloff`, c'est-à-dire un rayon **en pixels
  d'écran** — la page 09 corrige justement cette confusion pour la mécanique du
  télescope, mais l'extracteur continuait d'en faire des unités de monde
  (`HarmonicaSignal` : 400 px devenus 400 u).
- **Fait** : les trois champs sont lus par source et posés sur
  `spatialMaxDistance` / `spatialMinDistance` ; `rolloffMode` choisit le modèle
  de distance de WebAudio (le logarithmique d'Unity est son « inverse »). Les
  rayons en pixels ne servent plus qu'à `signalStrength`, où ils ont un sens.
- **Assumé** : `Pan2D` est lu comme le `panLevel` d'Unity (0 rend la source
  plate, 1 la rend pleinement spatiale). La lecture inverse existe ; pour qu'une
  erreur de ce genre ne fasse pas perdre l'audio spatial d'un coup, l'extracteur
  retombe sur la piste **si aucune source ne ressort spatiale**, et l'inscrit
  dans ses statistiques plutôt que de le laisser passer pour une mesure.
- **Vérifié** : `tests/05-extract.mjs` contrôle qu'aucune portée ne vaut plus
  exactement 60, 150 ou 300 par construction, qu'aucune portée de repli n'a
  servi, et que la spatialisation n'est pas retombée sur la piste.

### A3 — Poser les lumières de la scène

- **Le jeu** : des composants `Light` placés — le type tree est dans
  `unity41-types.json`, avec type, couleur, intensité, portée, angle de spot.
  Le feu de camp, les intérieurs, les balises de Dark Bramble en ont.
- **Le portage** : `main.js` créait **une** directionnelle pour le soleil et
  **une** hémisphérique d'ambiance. Aucune lumière du build n'était extraite.
- **Fait** : `pipeline/extract/lights.js` sort `data/lights.json` ;
  `web/src/scenelights.js` instancie à la volée, dans un budget de huit, les
  lumières dont la portée atteint la caméra — la plus proche l'emporte, c'est
  elle qui éclaire le sol sous les pieds.
- **Assumé** : les directionnelles du build ne sont pas instanciées (le portage
  en a déjà une, orientée sur l'étoile), ni les `area` (Unity ne les calcule
  qu'en lightmap), ni celles dont le composant est désactivé dans la scène —
  c'est un script qui les allume.
- **Vérifié** : le compte extrait et sa répartition par type dans
  `tests/05-extract.mjs`.

### A4 — Lire les `RenderSettings` plutôt que les recopier

- **Le portage** : `fog.js` portait en dur le gris `(0,5 ; 0,5 ; 0,5)` et
  `m_FogMode = 3` relevés à la main ([`29-brouillards.md`](29-brouillards.md)).
- **Fait** : couleur de brouillard, mode, bornes du mode linéaire et couleur
  d'ambiance sortent avec les lumières ; `FogField` les prend en paramètre et
  l'hémisphérique prend la couleur d'ambiance mesurée. Les valeurs relevées à la
  main restent, mais comme **repli explicite**. Une valeur juste et une valeur
  recopiée se ressemblent jusqu'au jour où l'une des deux change.

### A5 — Le `_checkDepth` de la lune quantique

`quantum.js` exportait `CHECK_RADIUS = 150` et `CHECK_DEPTH = 100` et
**n'utilisait ni l'un ni l'autre** : le test d'occlusion était binaire, là où le
jeu lance une sphère sur une profondeur ([`14-quantique.md`](14-quantique.md)).

- **Fait** : `bodyOccluder` épaissit le segment du rayon de la sphère — un corps
  qui frôle la ligne de vue à moins de 150 unités masque, comme le ferait un
  balayage — et le borne de `_checkDepth` du côté de la lune. Tout reste
  analytique, donc sans coût.
- **Assumé** : où commence exactement le balayage du jeu n'est pas mesuré. Avec
  les valeurs du build la sphère (150) est plus large que la profondeur (100),
  si bien que sa calotte recouvre la troncature : le bornage ne change quelque
  chose que pour un obstacle plus petit que le rayon de balayage. C'est ce que
  disent les valeurs mesurées, pas un choix du portage.

### A6 — Les champs de force directionnels

- **Le jeu** : **34 `DirectionalForceField`**, contre 10 `GravityWell`
  ([`02-architecture.md`](02-architecture.md)). Ce sont les gravités locales —
  et l'un des porteurs de la croûte de Brittle Hollow s'appelle `GravityTrail`
  ([`15-trounoir.md`](15-trounoir.md)).
- **Le portage** : `gravity.js` ne connaissait que le champ radial dominant.
- **Fait** : ils sont extraits avec **le collider qui leur sert de volume** — un
  `ForceVolume` d'Unity n'est qu'un déclencheur, sa portée n'est pas dans ses
  champs mais dans le collider posé à côté, d'où `volumeOf` dans le contexte
  d'extraction. Dans leur volume, c'est le champ directionnel qui donne
  direction et intensité : `SingleFieldDetector` ne combine pas, il **choisit**.
  Le corps, la distance et le rayon restent ceux du champ radial, parce que tout
  le reste du portage — ancrage, altitude, secteur — s'y accroche.
- **Assumé** : quel champ porte l'intensité et quel axe porte la direction n'est
  pas connu du dépôt. On cherche par nom sur un motif large ; à défaut de
  vecteur ou d'axe sérialisé, la direction est le **bas local** de l'objet. Un
  champ dont l'intensité ne se lit pas est **compté puis laissé de côté**,
  jamais inventé.
- **Vérifié** : sélection, volumes sphère et boîte, et priorité dans le volume,
  dans `tests/09-jeu.mjs`.

### A7 — Les fluides, et l'océan de Giant's Deep

- **Le jeu** : `SphereOceanFluidVolume` et `SimpleFluidVolume` sont dans la
  scène ([`03-typetrees.md`](03-typetrees.md)), et `SimpleFluidDetector`
  applique un `_dragCoefficient` — 10 pour les fragments de croûte, qui n'en
  voient jamais l'effet faute de fluide sur Brittle Hollow.
- **Le portage** : `SphereOceanFluidVolume` figurait dans `BODY_CLASSES` de
  `extract/solar.js` mais **n'était jamais émis** : la boucle n'écrivait un
  corps que s'il portait un `GravityWell` ou un `PlanetoidSector`. Giant's Deep
  n'avait donc pas d'océan, et rien ne freinait dans un fluide.
- **Fait** : les volumes sortent dans `solar_system.json` (`fluids`), rayon lu
  dans les champs ou dans le collider. `web/src/fluids.js` applique une traînée
  **linéaire** et une poussée d'Archimède, toutes deux en accélération comme la
  gravité du jeu, au joueur, au vaisseau et aux sondes. La traînée linéaire
  donne une vitesse limite de chute exacte, `g/c`, qui se vérifie sans
  navigateur.
- **Assumé** : sans coefficient ni densité mesurés, la traînée vaut 1 et la
  poussée 0 — on coule. Le portage n'invente pas une flottaison que la scène ne
  décrit pas. Les fragments de croûte gardent leur `_dragCoefficient` sans
  fluide où l'exercer : c'est un manque de l'alpha, pas du portage.

### A8 — Les niveaux de détail sont dans le build, pas à générer

- **Le jeu** : `LODGroup`, `LODLayer`, 5 `CreateLODGroup`, 21
  `ChildColliderLOD` ([`17-secteurs.md`](17-secteurs.md)).
- **Le portage** : `lod.js` faisait deux niveaux, présent ou absent, sur un
  seuil choisi (0,0022 de hauteur d'écran).
- **Le point à retenir** : un `LODGroup` **ne simplifie rien à la volée**, il
  désigne des maillages déjà simplifiés, présents dans le build. Il n'y avait
  donc rien à générer — seulement à exporter les niveaux et à lire les seuils,
  qui sont exprimés dans l'unité que `lod.js` calcule déjà.
- **Fait** : `LODGroup` (classe 205) ajouté aux classes moteur lues, et
  l'exporteur glTF pose sur chaque nœud, dans ses `extras`, le niveau auquel il
  appartient et les deux bornes entre lesquelles il est visible. Un maillage qui
  en porte suit la règle du jeu : un seul niveau affiché à la fois, et sous le
  dernier seuil le groupe entier disparaît. Le seuil unique reste pour tout le
  reste, qui n'appartient à aucun groupe. Les **colliders ne sont plus posés que
  sur le niveau le plus fin** : les niveaux grossiers portent la même forme, les
  doubler ne fait que du travail pour Havok — c'est ce que font les 21
  `ChildColliderLOD`.
- **Vérifié** : les bornes dans `tests/09-jeu.mjs` ; en navigateur, que deux
  niveaux du même groupe ne soient **jamais allumés ensemble**.

### A9 — `mainData` n'était jamais extrait

`pipeline/worker.js` chargeait bien les cinq fichiers, mais l'`ExtractContext`
était construit sur `level0` seul. Les **989 objets** de `mainData` — scène de
démarrage et managers — ne sortaient donc jamais, ce qui explique au passage les
7 rendus `V-Fog` restés introuvables ([`20-shaders-jeu.md`](20-shaders-jeu.md))
et l'absence de menu principal ([`28-hud.md`](28-hud.md)).

- **Fait** : graphe de scène, valeurs des composants et **inventaire des
  classes** sortent aussi pour `mainData`. On inventorie avant de décider quoi
  en porter : ce qui mérite de l'être se décide en lisant ce qui en sort, pas en
  le devinant.

## 2. Les systèmes du jeu sans équivalent

Ici il fallait écrire du code de jeu, mais les données existaient.

### A10 — La manette

Le build décrit une manette entière (`XboxInput`), l'extracteur d'invites
retient déjà **le bouton attendu par chaque invite** (`extract/prompts.js`), et
les **16 textures d'icônes** sont extraites, avec leur nommage particulier
(`RightTrigger` → `RT.png`) ([`28-hud.md`](28-hud.md)). L'icône était même déjà
affichée dans l'invite : il ne manquait que l'entrée.

- **Fait** : `web/src/gamepad.js` branche la Gamepad API exactement comme la
  couche tactile — elle « ne crée aucune commande », elle produit les mêmes axes
  et les mêmes codes ([`33-mobile.md`](33-mobile.md)), si bien que rien en aval
  ne sait d'où vient l'ordre. Même courbe de regard et même vitesse qu'au pouce,
  front montant sur les boutons pour qu'un menu ne défile pas à la vitesse des
  images.
- **Assumé** : la correspondance entre un bouton et une touche de **ce** portage
  est un choix — le jeu d'origine n'a pas de clavier à la place duquel se
  mettre. Elle suit les invites là où elles nomment un bouton (A pour interagir,
  les gâchettes pour la poussée), le reste est rangé par voisinage.
- **Vérifié** : les axes et le front montant dans `tests/09-jeu.mjs` ; en
  navigateur, une manette fabriquée remplace `navigator.getGamepads` le temps du
  contrôle.

### A11 — Les zones d'oxygène

`main.js` passait `inSupply: ship.boarded` : **seul le vaisseau rechargeait**.

- **Fait** : plutôt que de parier sur un nom de composant que le dépôt ne
  connaît pas, l'extracteur ramasse **toute classe de la scène dont le nom parle
  d'oxygène**, avec le collider qui lui sert de volume ; le moteur prend ce qui
  en sort. Si rien n'en sort, le manque est celui de l'alpha, et l'inventaire de
  A9 permet de le dire — c'est la question que cette action posait.

### A12 — Les caméras déportées

`RemoteFlightConsole` et `SatelliteSnapshotController` supposent une caméra
ailleurs que sur le joueur ([`30-consoles.md`](30-consoles.md)) — et ce moyen
existe désormais : la caméra embarquée de la sonde
([`25-interface.md`](25-interface.md)).

- **Fait** : `ProbeCamera` prend un **point de vue** (`pos` + `dir`) au lieu
  d'une sonde ; une sonde en est un cas particulier, qui regarde dans le sens de
  son vol. Les deux consoles s'en servent, et leur invite — déjà au catalogue —
  s'affiche à portée, désignée par sa classe puisque le nom du champ qui la
  porte n'a jamais été relevé.
- **Assumé** : le cadrage. La console de vol regarde le vaisseau de haut, le
  satellite regarde le corps qu'il survole.

### A13 — Le brouillard, ses habitants et ses zones

- **`CorruptionAnimator`** (10) pilote un seuil de découpe de matériau sur la
  fraction de boucle ([`16-bramble.md`](16-bramble.md)) : **fait**, le seuil est
  posé sur les matériaux des ronces, que le répartiteur de shaders sait déjà
  traiter en `alphaCutOff`. Les bornes sont lues dans les champs quand ils les
  portent, 0 → 1 sinon.
- **`DerelictCloaker`** (2) et les événements `EnterDerelictZone` /
  `ExitDerelictZone` : **fait**, entrer dans la zone **suspend** la mise à jour
  du brouillard, qui garde sa dernière densité au lieu de retomber à zéro
  ([`29-brouillards.md`](29-brouillards.md)).
- **`AlignQuantumMoon`** : **fait**, la lune se tourne vers le joueur. C'est ce
  qui fait qu'on lui voit toujours la même face — et qu'on ne s'aperçoit pas
  qu'elle n'en a qu'une.

### A14 — Le bruit qui attire les prédateurs

Le `NoiseSensor` était nourri par les **commandes du joueur**, pas par les
sources sonores réellement en train de jouer ([`16-bramble.md`](16-bramble.md)).
Or `audio.js` sait exactement lesquelles vivent et à quelle distance.

- **Fait** : le champ audio publie un niveau de bruit, calculé sur les sources
  spatiales effectivement instanciées et leur distance à l'auditeur ; les
  prédateurs l'entendent. Le jour où l'on peut se trahir en laissant tourner un
  poste de radio, la zone change de nature.

### A15 — Les petites règles restées de côté

Chacune tient en quelques lignes, toutes sont mesurées :

| règle | source | ce qui a été fait |
|---|---|---|
| `MapMarker._maxDisplayDistance` non appliqué | [`19-carte.md`](19-carte.md) | lu **marqueur par marqueur**, la table par type ne sert plus que de repli |
| minicarte allumée par proximité | [`28-hud.md`](28-hud.md) | c'est le drapeau `_useMinimap` du secteur majeur qui décide, la distance n'entre plus en jeu |
| panneau de musée et personnage confondus | [`25-interface.md`](25-interface.md) | la mise en forme élargie était déjà branchée sur `isMuseumSign` : rien à changer |
| arbre de dialogue choisi par **nom** | [`23-connaissance.md`](23-connaissance.md) | la `Conversation` désigne ses arbres, un champ par situation ; c'est cette référence qui fait foi, le nom ne reste qu'en repli |
| guimauve grillée sur commande | [`30-consoles.md`](30-consoles.md) | c'est la proximité d'un `HeatSource` qui la cuit, avec le collider pour portée |
| mort : ni son par cause, ni mouvement de caméra | [`32-mort.md`](32-mort.md) | un clip de la piste `Death` est demandé par cause, et la vue s'affaisse, roule et recule pendant l'attente |

## 3. Le poids et la tenue

### A16 — Les 15 Mo de WAV

Quinze fichiers, 48 kHz 16 bits, sur les 66,1 Mo du démarrage
([`27-poids.md`](27-poids.md)). La chaîne d'outils n'a pas d'encodeur Vorbis —
mais le navigateur en a un.

- **Fait** : `AudioEncoder` (WebCodecs) encode en Opus dans le worker, **au
  moment de l'extraction**, une fois pour toutes, avec repli sur le WAV là où
  l'API manque. C'est le pipeline navigateur qui rend cette piste possible.
- L'encodeur sort des paquets nus : le **multiplexeur Ogg** qui les emballe est
  écrit dans `pipeline/opus.js`. C'est de la manipulation d'octets pure, et
  c'est là qu'on se trompe — le CRC d'Ogg n'est pas celui de zip, et un fichier
  au CRC faux est refusé en silence par tous les lecteurs. `tests/10-opus.mjs`
  le vérifie contre les RFC 3533 et 7845, en relisant chaque page comme le ferait
  un lecteur.
- **Assumé** : un clip dont la fréquence n'est pas une de celles d'Opus est
  refusé plutôt que rééchantillonné. Mieux vaut un WAV lourd qu'un son transposé.

### A17 — Babylon pèse 11,1 Mo

Près d'un cinquième du démarrage, pour un moteur dont on n'utilise qu'une part.
Une compilation sur mesure les réduirait — au prix d'une étape de construction,
que le dépôt n'a pas aujourd'hui (« aucune dépendance npm »). À peser comme un
choix de projet, pas seulement comme une optimisation.

- **Fait, faute de trancher** : de quoi peser sur des chiffres justes. Le poids
  réseau se mesure désormais en **deux parts** — moteur et données extraites —
  qui se réduisent par des moyens sans rapport ; et `web/fetch-deps.sh` affiche
  le poids **compressé** à côté du poids brut, puisque c'est celui-là qui passe
  sur le réseau et que tout hébergeur statique compresse. Peser une étape de
  construction contre un chiffre qui n'est celui de personne ne mène nulle part.

### A18 — Le cache des textures partagées

27 URL demandées jusqu'à cinq fois faute d'en-têtes de cache
([`27-poids.md`](27-poids.md)).

- **Fait** : le Service Worker pose un `Cache-Control` et garde un cache
  mémoire. Une réponse fabriquée par un Service Worker n'entre jamais dans le
  cache HTTP du navigateur, mais le cache **mémoire** du moteur de rendu, lui,
  honore l'en-tête — et `no-store` lui interdisait justement de dédupliquer. La
  page prévient d'une nouvelle extraction, sans quoi un fichier réécrit
  resterait masqué par sa version précédente.

## 4. Ce qui demande un jugement humain

Aucune de ces lignes ne se ferme par du code, et aucune ne doit disparaître de
la liste pour autant ([`08-reste-a-faire.md`](08-reste-a-faire.md) §2) :
l'équilibrage des volumes — que A2 rend enfin discutable sur des valeurs du
jeu —, l'échelle des particules, le rendu des atmosphères, de la surface
stellaire, des brouillards et de l'explosion, **une partie jouée**, et une
partie jouée **au pouce, sur un vrai téléphone**
([`33-mobile.md`](33-mobile.md)) — et désormais **à la manette**.

## 5. Ce qui ne se comblera pas

L'espace replié de Dark Bramble, quatre des cinq savoirs, les branches
`eventbased`, les machines à états d'animation, les dégâts localisés réglés à
zéro, les éclats de fracture, le modèle de sonde, les images du flashback, la
courbe de dégâts d'impact. Ce sont des manques **de l'alpha**, démontrés un par
un dans [`08-reste-a-faire.md`](08-reste-a-faire.md) §1. Les porter reviendrait
à écrire le jeu, pas à le porter — et la règle du dépôt est de le dire plutôt
que d'inventer.

## Ce qu'il reste à faire de cette page

Rien à porter : les dix-huit actions sont faites. Ce qui reste tient en deux
lignes, et aucune des deux ne s'écrit.

1. **Relire les chiffres avec le build sous la main.** Cette session ne l'avait
   pas : rien n'a été remesuré, et plusieurs actions portent une lecture qu'un
   seul passage de `tests/05-extract.mjs` confirmera ou démentira — la
   spatialisation des sources, l'intensité des champs directionnels, la portée
   des zones d'oxygène. Chaque endroit où le portage a choisi faute de mesure
   est signalé ci-dessus par « assumé » ; ce sont ceux-là qu'il faut aller voir
   en premier.
2. **Jouer.** Le reste est du jugement, et il est en §4.
