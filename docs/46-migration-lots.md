# Les lots de la migration, écrits

[`44-reste-a-migrer.md`](44-reste-a-migrer.md) avait fait la liste de ce que
l'alpha pose et que le portage ne lisait pas, rangée en neuf familles, avec un
ordre conseillé et un coût par lot. Cette page raconte ce qu'a donné leur
écriture — six lots sur neuf — et surtout **ce que la mesure a démenti en
chemin**.

Le compte de départ : **109 classes et 413 instances sans aucun lecteur**. Le
compte d'arrivée, recensement refait sur le build par la méthode de
[`45`](45-recensement-mesure.md) :

| | avant | après |
|---|---|---|
| classes posées dans `level0` | 275 | 275 |
| nommées quelque part dans `web/src/` | 114 | **172** |
| lues par un motif du moteur | 44 classes, 96 instances | 44 classes, 96 instances |
| **sans aucun lecteur** | **109 classes, 413 instances** | **59 classes, 94 instances** |

Les 94 instances restantes sont détaillées en fin de page : elles ne sont plus
une famille, mais une queue.

## La méthode : lire l'IL, sans SDK

[`44`](44-reste-a-migrer.md) demandait, pour chaque lot, « lire l'IL des classes
avant de l'estimer ». Le dépôt avait déjà de quoi le faire :
[`pipeline/dotnet/il.js`](../web/src/pipeline/dotnet/il.js), écrit pour lire le
catalogue des invites à l'écran, décode les corps de méthode sans ILSpy ni
`.NET`. Un désassembleur de service de soixante lignes, monté dessus, a servi
pour les six lots — un fichier jetable, mais la brique, elle, est au dépôt.

Une leçon en est sortie tout de suite, et elle vaut d'être écrite parce qu'elle
a failli coûter un lot entier :

> **Les blocs d'un `switch` ne sont pas dans l'ordre des cas.**
> `ThrusterParticlesBehavior.FixedUpdate` aiguille dix valeurs d'énumération
> vers six méthodes. Lu de haut en bas, l'IL dit « `Left_Thruster` s'allume sur
> la poussée arrière » — ce qui est absurde et aurait été écrit tel quel. La
> **table de saut** du `switch`, décodée, dit l'inverse : `4 → ThrustLeft`,
> `6 → ThrustBackward`. Le compilateur avait simplement rangé les blocs dans un
> autre ordre.

## Lot 3 — la vie du décor

Donné premier dans l'ordre conseillé, « immédiat, et partout ». Il l'est.

**Quinze panneaux** (`FaceActiveCamera`) se tournent maintenant vers la caméra.
Deux régimes, et c'est `_useLookAt` qui les sépare : cinq objets regardent
franchement la caméra — ce sont les plans de substitution des planètes
lointaines, ceux du lot 8 —, les dix autres amènent leur `_localFacingVector`
sur la direction de la caméra par la plus courte rotation. Quatre d'entre eux
portent un `_localRotationAxis` non nul, et ce sont les quatre villageois : le
panneau tourne autour de son mât, il ne se couche pas. La loi tient dans
`projectOut()` et `fromToRotation()`, toutes deux vérifiées sans navigateur.

**Huit personnages** (`FacePlayerWhenTalking`) se tournent vers le joueur
pendant qu'on leur parle, d'un dixième d'angle par image, et s'arrêtent sous un
degré. Le composant est éteint hors conversation et se rallume à chaque
ouverture : on reprend ce cycle, faute de quoi un personnage déjà tourné ne se
retournerait plus jamais.

> **Le nom ne suffisait pas.** Les quatorze zones de conversation s'appellent
> presque toutes `ConversationZone` ; le personnage est leur **parent**, et
> c'est lui qui porte le composant. L'extraction des dialogues émet donc
> désormais `speaker`, le nom de ce parent — et les huit visages y retombent
> exactement.

**Dix buses** (`ThrusterParticlesBehavior`) n'émettent plus qu'à la commande :
chacune lit une composante de l'accélération locale, avec un seuil de 1. Les
systèmes de particules correspondants existaient déjà, à portée, et
fonctionnaient en permanence.

**Dix-huit bouffées d'étincelles** (`RandomParticleBursts`) ne sont **pas**
portées, et c'est la mesure qui le décide : le composant tire un délai entre une
et trois secondes puis appelle `Play()`, mais son `Awake` pose d'abord
`particleSystem.loop = _looping` — et `_looping` vaut **vrai** sur les dix-huit
instances. Un système qui boucle joue en continu : le tirage n'a aucun effet
visible dans l'alpha. La mécanique est écrite, filtrée sur le drapeau, et la
liste des systèmes concernés est donc vide. Un invariant garde les dix-huit.

**Six passages anciens** (`AncientTeleporter`) partent tout seuls, et c'est le
seul élément du lot qui change la topologie du monde :

```
alignement   angle(vers l'arrivée, mon axe Y) < _alignmentWindow / 2
occlusion    180 - angle(moi vu du soleil, l'arrivée vue du soleil)
             > _solarOcclusionWindow / 2      (le soleil n'est pas entre nous)
délai        cinq secondes depuis le dernier départ
```

Les trois conditions ensemble, et les positions sont celles du moment : ce sont
les orbites des jumelles qui ouvrent puis ferment la fenêtre. Deux des six
visent un `_alternateViewTarget` différent de leur arrivée, et c'est sur lui
que l'alignement se mesure.

## Lot 1 — les référentiels déclarés

Le portage choisissait son ancre par la **gravité dominante**. Le build la
**déclare**, par volume : neuf `MajorReferenceFrameVolume` (un par corps
principal, de 167 à 1 500 unités de rayon) et cinq `ReferenceFrameVolume`, dont
le soleil (2 000), **le vaisseau (30)** et les trois nœuds du satellite cassé
(3 chacun).

Ces deux derniers sont exactement le cas que la gravité ne sait pas traiter — un
vaisseau posé dans un hangar, un morceau de satellite lâché dans une grotte — et
ils donnent la règle d'arbitrage : **le plus petit volume contenant le point
gagne**, parce que le volume du vaisseau vit dans celui de Timber Hearth. « Le
premier trouvé » aurait rendu l'ordre d'extraction significatif, ce qu'il n'est
pas.

Le moteur interroge donc les volumes d'abord, et ne retombe sur la gravité que
là où le build n'a rien dit — ce qui est le cas de l'essentiel de l'espace : les
quatorze sphères ne couvrent pas le système.

**Les distances du pilote automatique** étaient le gain immédiat annoncé, et
elles l'étaient : `surface × 1,5` est remplacé par les deux champs du volume
majeur, `_autopilotArrivalDistance` (1 000 partout, 2 500 pour Giant's Deep et
Dark Bramble) et `_autoAlignmentDistance` (0 à 1 000 — **zéro** pour Dark
Bramble : on ne s'aligne pas sur une ronce). Le repli reste l'ancienne règle
pour un corps sans volume majeur, et il se sait repli (`declared: false`).

> **Ce que le portage satisfaisait déjà, par construction.** Les 34
> `AttachOnAwake` et 27 `MatchInitialMotion` attachent un objet au corps sous
> lui et lui donnent sa vitesse au réveil. Dans ce portage, le décor est un
> **enfant** du glTF de son corps : il hérite du mouvement par la hiérarchie,
> sans une ligne de code. Les deux lois sont posées et gardées quand même —
> `v = v_porteur + ω × r`, et la sphère de contrôle d'une unité — parce que ce
> qui bouge seul ne passe pas par la hiérarchie, et qu'un invariant vaut mieux
> qu'une coïncidence.

## Lot 5 — le son d'événement

Le portage jouait des sources **placées** : un son est quelque part, on l'entend
en s'en approchant. Le build joue en plus des sons **déclenchés par l'action**.
C'était une couche entière sans lecteur, et le plus visible de ses effets est
qu'en marchant, on ne faisait aucun bruit.

Les lois, lues dans l'IL :

| | |
|---|---|
| pas | marche au-delà de 0,5 u/s, course au-delà de 4,5 ; un pas toutes les `clamp(2 / vitesse, 0,4 s, 1,5 s)` ; hauteur tirée dans 1 ± 0,4 |
| vent de course | démarre **hors** du liquide (densité < 5) au-delà de 20 u/s ; volume visé `(v − 20) / (40 − 20)`, approché par `Lerp(…, 0,05)` et coupé à zéro |
| propulseurs | fondu d'entrée 0,05 s, de sortie 0,10 s ; rotation : un tir toutes les 0,2 s au plus, l'un des quatre clips, à 0,2 de volume |
| musique de voyage | au poste de pilotage **et** dans le vide, fondus de 5 s |
| fin des temps | sous 90 secondes restantes, fondu d'entrée de 2 s ; sortie de 2 s à l'explosion |

Les deux dernières sont les déclencheurs que
[`43-pnj-son-decollage.md`](43-pnj-son-decollage.md) avait relevés et laissés
ouverts.

> **Les seuils de la marche ne sont sérialisés sur aucune instance.** Ils
> viennent du constructeur, comme les trois secondes de `RepairVolume`
> ([`45`](45-recensement-mesure.md)). L'invariant garde donc le repli, et refuse
> de le lire dans la scène : sans cela, une extraction qui cesserait de lire les
> champs passerait en silence.

> **Le compte de clips passe de 48 à 97** — 23 Ogg, 74 WAV. Ces clips-là ne sont
> sur aucune `AudioSource` : ce sont des **champs de script**, joués en
> `PlayOneShot`. Six pas de marche, six de course, trois de saut, quatre
> propulseurs de rotation, huit sons d'interface… L'extraction suit maintenant
> chaque pointeur qui vise un `AudioClip`, sans qu'aucune liste ne nomme les
> champs : c'est la seule façon de ne pas en oublier un.

## Lot 7 — l'équipement se ramasse

Deux `GearPickup` posent la progression du début de partie, et le portage
donnait tout d'emblée :

| | débloque |
|---|---|
| `Ship_Body/Cabin/ExpeditionGear` | combinaison + **sonde** + **minicarte** |
| `ZeroGZone/CaveEntrance/SpaceSuit` | combinaison seule |

On appuie dessus, trois événements partent (`SuitUp`, `AquireProbe`,
`AquireMinimap`), et l'objet ferme son volume d'interaction. La sonde et la
minicarte du portage sont désormais **derrière ce ramassage** : la touche ne
lance rien tant qu'on n'est pas allé les chercher dans la cabine. La
combinaison, elle, est lue et rendue — `SuitRemovalVolume` n'existe que si on en
porte une, `SuitBarrier` rend son mur solide quand on n'en porte pas — mais elle
ne conditionne pas encore l'oxygène : c'est un choix, et il est écrit dans le
code.

Au redémarrage de la boucle, l'équipement repart à zéro : ce qu'on **sait**
survit à la boucle (`PlayerData`), ce qu'on **porte** appartient au monde, et le
monde se remet à son état de départ.

> **L'entraînement en apesanteur existe, et il était sous le nez.**
> [`45`](45-recensement-mesure.md) comptait dix-huit volumes de réparation,
> « quinze à portée 3 et trois à portée 5 », sans savoir ce qu'étaient les
> trois. Le **corps porteur**, désormais extrait, le dit : `BrokenSatellite_Body`.
> Ce sont les trois nœuds cassés du satellite que `ZeroGTrainingManager` suit, et
> qui jouent « SystemBackOnline » une fois les trois réparés. Accessoirement, la
> réparation du vaisseau piochait jusqu'ici indifféremment dans les dix-huit.

## Lot 2 — les décalcomanies

Le moins cher des lots, et [`44`](44-reste-a-migrer.md) l'avait dit : « le coût
est un matériau, pas une mécanique ». La géométrie des trente *Decals Mesh
Renderer* est exportée depuis [`40-solide.md`](40-solide.md), qui les avait
rendues traversables. Elles étaient donc dans la scène depuis le début, plaquées
comme des maillages ordinaires. Deux réglages suffisent : un décalage de
profondeur (`zOffset = -2`) pour que la fresque gagne le départ contre la paroi
qu'elle épouse, et un mélange alpha sans écriture de profondeur pour que deux
décalcomanies qui se chevauchent — les cinq fresques du musée — se mélangent au
lieu de se découper.

Les 38 projecteurs portent `_meshOffset = 0` : le build ne décale rien
géométriquement, tout se joue au rendu. C'est ce que dit l'invariant.

## Lot 4 — les volumes de jeu

Des règles là où le portage en avait inventé, ou n'en avait aucune.

- **`HazardVolume`** — un seul dans l'alpha, et c'est le bon : la colonne de
  sable entre les jumelles, 20 points par seconde, zéro au premier contact. On
  la traversait sans dommage.
- **`ZeroGField`** ×4 — l'apesanteur **déclarée**, avec sa priorité
  d'écrasement. L'un des quatre n'a aucun collider : sa forme vient de ses
  déclencheurs d'entrée (`_useEntrywayTriggers`), comme la forme des zones
  d'ambiance vit sur leurs enfants. C'est une propriété du build, pas un défaut
  d'extraction.
- **`ZeroGSector` ×2 et `MajorSector`** — des réglages de jeu attachés à un
  lieu : poussée limitée à 20, lumière ambiante jusqu'à 1 200 unités dans Dark
  Bramble, phares du vaisseau limités à 100 dans la dimension abandonnée.
  `_flashlightRangeLimit` est nul partout : la lampe du joueur garde sa portée.
- **`InteractZone` ×7** — l'invite **et sa fenêtre de vue** : 60 degrés pour la
  trappe, 90 pour les commandes, 360 pour ce qui se prend de n'importe où. La
  fenêtre n'est pas celle du regard mais celle de la **zone** : on ouvre une
  trappe en étant devant elle. Une invite « Open Hatch » qui s'affiche dans le
  dos de la trappe est exactement ce que ce champ évite.
- **`ProbePromptTrigger` ×4** — l'invite ne s'affiche pas parce qu'on est là,
  mais parce qu'on **regarde** quelque part, à 45 degrés près.
- **`InteractZone` ×7** — les invites entrent dans le même catalogue que les
  interactifs (`interact.js`), ce qui les affiche enfin : sans elles, l'objet à
  ramasser du lot 7 ne s'annonçait pas, et on passait devant sans savoir qu'il y
  avait quelque chose à prendre.
- **`MeteorLauncher` ×4** — extraits avec leurs six nombres (vitesse 100 à 200,
  intervalle 5 à 20 s, rayon 10), mais **non instanciés** : le portage n'a pas
  de projectile, et `_meteorPrefab` est un objet d'un autre fichier. Dit ici
  pour que le prochain ne cherche pas le lecteur.
- **`RadiationEmitter` ×9** — huit feux de camp (courbe : 1 à dix unités, 0 à
  quarante-cinq) et l'étoile (sphère de 30 000, plancher de 10 % en surface).
  Extraits et gardés ; la chaleur branchée reste celle du portage, qui ramasse
  les `HeatSource` par motif. La duplication est connue, et dite.

## Ce qui n'a pas été porté, et pourquoi

- **Lot 6, l'interface** (13 classes, 22 instances). [`44`](44-reste-a-migrer.md)
  le donnait « à lire pour comparer, pas forcément pour porter » : le portage a
  son propre HUD ([`28-hud.md`](28-hud.md)), et remplacer un HUD qui marche par
  une transposition n'est pas un gain. Les classes restent dans la queue.
- **Lot 8, les impostures de planète** (`LODCameraSnapshot` ×5). Le principe —
  une planète lointaine est une texture rafraîchie une fois par seconde —
  demande un second rendu de la scène par planète. Le portage résout le même
  problème par des sphères et des secteurs, et l'assume depuis
  [`36`](36-audit.md) §2.8. Une chose a quand même changé : leurs cinq plans
  **se tournent maintenant vers la caméra**, par le lot 3, puisque c'est un
  `FaceActiveCamera` qui les porte.
- **Lot 9, les outils du studio** (`DebugInputManager`, `TapeMeasure`,
  `LoadTimeTracker`…). La page le disait : ils figurent là pour que personne n'y
  passe une heure.

## Ce qui reste : 59 classes, 94 instances

Ce n'est plus une famille, c'est une queue — la moitié des entrées est à une
seule instance. Les plus lourdes :

| classe | n | ce que c'est |
|---|---|---|
| `InertiaTensorCalibrator` | 14 | corrige un tenseur d'inertie ; ce portage n'en a pas |
| `RoastPromptEvent` | 8 | les invites de la guimauve — lot 6 |
| `TornadoPivotController` | 6 | le pivot des tornades, dont la poussée est déjà lue |
| `ChildTriggerVolume` | 4 | les cylindres de l'entonnoir, déjà lus par leur volume |
| `MatchTransform` | 3 | trois objets qui suivent un autre transform |
| `CustomAspectRatio` | 3 | lot 6 |

Et une trentaine de singletons, dont cinq sont des outils de mise au point.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : l'arbitrage du plus
petit volume de référentiel, les deux distances du pilote automatique et leur
repli, `v = v_porteur + ω × r`, la sphère de contrôle d'`AttachOnAwake` ; la
rotation la plus courte et l'axe qui retient un panneau, l'angle signé et le
dixième par image d'un personnage qui se tourne, `LookRotation`, les dix buses et
leur seuil de 1, les trois conditions d'un passage ancien, la minuterie à délai
tiré ; la cadence et le choix des pas, les deux zéros du vent de course, les
fondus des propulseurs et des deux musiques ; le ramassage à usage unique, le
volume qui rend la combinaison, la fenêtre de vue d'une zone, les trois nœuds de
l'entraînement ; le premier contact d'un volume qui blesse, l'apesanteur par
priorité, le secteur le plus petit, la courbe d'un émetteur.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : quatorze
volumes de référentiel dont neuf majeurs, tous primaires et tous sphériques ;
deux distances d'arrivée seulement ; le vaisseau à trente unités ; 38
projecteurs de décalcomanie à `meshOffset` nul et trente maillages homonymes sur
des corps différents ; quinze panneaux dont cinq en `LookAt` et quatre à axe ;
huit visages qui ont tous une conversation à leur nom ; dix buses, une par
valeur d'énumération ; six passages qui connaissent tous leur arrivée ; 97 clips
en 23 Ogg et 74 WAV, 22 émetteurs de son d'événement, et les seuils de pas
**absents** de la scène ; deux objets à ramasser et leurs trois drapeaux ; trois
nœuds de réparation sur le satellite cassé.

## La leçon, encore une

La série en avait quatre :

> avant de conclure qu'une chose manque au build, vérifier qu'on la lit
> ([`34`](34-actions.md)) — avant de conclure qu'on la lit, la mesurer
> ([`36`](36-audit.md)) — avant de conclure qu'on la joue, la jouer
> ([`43`](43-pnj-son-decollage.md)) — avant de chercher ce qui manque, demander
> la liste ([`45`](45-recensement-mesure.md)).

Celle-ci porte sur la lecture elle-même : **l'ordre du code n'est pas l'ordre de
l'exécution**. Une table de saut, un événement, un composant éteint au réveil et
rallumé par un autre — trois fois dans ces six lots, lire l'IL de haut en bas
donnait une réponse fausse et plausible. Ce qui a tranché, chaque fois, c'est
d'aller chercher la structure que le code référence plutôt que celle qu'il
affiche.
