# Les deux versions côte à côte : l'alpha native et le portage

Jusqu'ici, la comparaison avec l'alpha passait par ses **données** — l'IL, les
champs sérialisés, les comptes d'objets. Ce lot lance **l'exécutable
lui-même**, dans le conteneur, et le met à côté du portage qui tourne dans
Chromium. Ce qu'on voit à l'écran et ce que le jeu fait en temps réel se
comparent enfin directement.

## Faire tourner l'alpha

Le build Linux est un ELF **32 bits** (Unity 4.1.2f1). Il faut les
bibliothèques i386 et un serveur X virtuel ; le rendu passe par llvmpipe
(Mesa, logiciel) — lent, mais complet, ombres comprises.

```bash
dpkg --add-architecture i386 && apt-get update
apt-get install libc6:i386 libstdc++6:i386 libgl1:i386 libgl1-mesa-dri:i386 \
  libglu1-mesa:i386 libx11-6:i386 libxext6:i386 libxcursor1:i386 \
  libxrandr2:i386 libxi6:i386 libasound2t64:i386 xvfb xdotool imagemagick
tools/01_fetch.sh Linux
scripts/alpha.sh start               # :99, 1280 x 720
scripts/alpha.sh shot work/a.png     # capture
scripts/alpha.sh key e               # une touche, par xdotool
scripts/alpha.sh stop
```

Le portage, lui, se capture par `scripts/pw-titre.mjs` (écran-titre, horloge
calée) et se pilote par `scripts/playwright-scenarios.mjs`, qui partagent
désormais `scripts/pw-commun.mjs` : serveur statique, Chromium du conteneur,
SwiftShader autorisé, **préchauffage des shaders** et traversée du titre.

## Ce que la mise côte à côte a trouvé

Aucun de ces écarts ne se voyait dans les données : il fallait faire tourner
les deux.

### 1. Le jeu ralentissait sous 20 images par seconde

Le `TimeManager` du build borne `Time.deltaTime` à **1 s** (`Maximum Allowed
Timestep`) ; le portage bornait l'image à **0,05 s**. Sans GPU, à trois images
par seconde, une demi-seconde de marche avançait le joueur de **0,39 m** au lieu
de 3,5 ; la boucle de vingt minutes en aurait duré plus de deux heures ; et sur
un téléphone à 15 images par seconde, elle durait 27 minutes.

Havok, pire, avançait sur une **autre** horloge : Babylon lui passait le delta
réel, pendant que `applyForce` payait l'impulsion au pas **fixe** de 1/60 — la
gravité faiblissait d'autant que la cadence tombait.

`decoupeImage` (input.js) découpe maintenant chaque image en sous-pas d'au plus
0,05 s, bornés à la seconde du build, et **Havok avance avec chacun d'eux**, au
même pas que la force qu'on lui a posée. À 60 images par seconde : un seul
sous-pas, rien ne change. Un appui reste un **front** : il appartient au
premier sous-pas, comme `GetButtonDown` n'est vrai que dans un `Update`.

### 2. Tous les shaders échouaient, à chaque image

Le chargeur glTF de Babylon relève `maxSimultaneousLights` de **tous** les
matériaux au nombre de lumières de la scène : quinze dès que la guimauve et le
thermomètre apportent les leurs. Chaque lumière coûte un bloc d'uniformes ; la
carte en permet 14 (SwiftShader), 12 sous ANGLE/Direct3D 11. Chaque shader
échouait, retombait sur son repli, et **recommençait** à l'image suivante :
7 s par image, 0,14 image par seconde. `lightCap` (lights.js) lit la limite du
GPU et plafonne ; les lumières tenues passent devant celles du décor.

### 3. Une touche relâchée restait tenue une image de plus

Le report des relâchements en fin d'image est là pour qu'une frappe plus courte
qu'une image ne se perde pas. Il s'appliquait à **tout** relâchement : une
touche lâchée entre deux images restait tenue pendant toute l'image suivante.
Unity rend `GetKey` faux dès l'`Update` qui suit. À 60 images par seconde,
17 ms ; sans GPU, près d'une seconde — un appui court sur la poussée du
vaisseau **achevait l'allumage** au lieu de l'annuler. On ne reporte plus que
ce qui a été enfoncé depuis la dernière image.

### 4. L'écran-titre manquait

Voir [`131`](131-ecran-titre.md), et les trois corrections qu'il a entraînées
pour tout le jeu : la courbe de taille des particules (qui **multiplie** dans
Unity), leur préchauffage, et la voûte qui sortait du plan lointain.

### 5. Deux tests gardaient la cadence, pas le jeu

Le saut se mesurait 50 ms après l'appui, la guimauve en supposant qu'elle
n'avait pas encore grillé. Avec un temps qui suit enfin l'horloge, les deux
tombaient — et le jeu avait raison : le saut monte bien à 6 m/s, et la
guimauve, bâton sorti près du feu au réveil, grille toute seule. Les tests
relèvent maintenant la vitesse à **chaque pas du joueur**, et partent d'une
guimauve neuve.

### 6. Douze sons 2D posés dans le décor

`AudioClip.m_3D` dit si un clip se place dans l'espace. Douze sources de
`level0` portent un clip **2D** — les musiques du village, du voyage, des
Anciens et de la fin des temps, « Into the Unknown », les ambiances de jour et
de nuit, le souffle du casque, le grésillement de la lunette, `chomp`, le son
de la carte — et l'extracteur ignorait ce drapeau. Les pistes Music et
Ambience étant jouées d'office, **la musique de voyage et les ambiances du
village se lançaient dès qu'on passait à moins de 700 unités de leur point
d'origine**, spatialisées, en doublon des zones d'ambiance qui les jouent déjà.
Une source n'est plus spatiale que si son clip l'est, et elle attend alors
qu'un contrôleur la demande.

Deux de ces sons n'avaient d'ailleurs **aucun** contrôleur dans le portage :

- le **souffle du casque** (`SpacesuitAudioController`) : monte en 5 s quand on
  quitte l'oxygène (`OnExitOxygen` → `FadeIn(5)`), retombe en 5 s quand on y
  rentre — `SuitAmbience` ;
- le **grésillement de la lunette** (`Telescope`) : lancé à `EnterTelescope`,
  réglé chaque image sur `_signalStrength`, coupé à `ExitTelescope`.

### 7. Ce que la vérification complète a dit ensuite

`tools/15_verify.py` a été lancé sur ce lot **et** sur le commit de départ,
chacun dans son profil : 395/405 contre 402/408. Les écarts se rangent en
trois familles.

**Deux régressions de ce lot, corrigées.**

- *Une pichenette tenait une seconde.* Une frappe plus courte qu'une image
  restait tenue jusqu'à la fin de l'image ; or une image couvre maintenant
  jusqu'à une seconde de jeu, en sous-pas. Un clic de 120 ms sur une sonde en
  vol passait le seuil de rappel (0,3 s) et **rappelait** la sonde au lieu de
  la photographier — puis le clic suivant en relançait une. Deux corrections :
  une frappe vaut désormais **un** sous-pas (les relâchements retenus
  s'appliquent après le premier) ; et surtout, les minuteries de
  `ProbeLauncher` — un `Update` — se lisent sur **l'horloge de l'image**
  (`Time.time`, avancée une fois avant les sous-pas) et non sur celle des
  sous-pas. Dans le build, le bouton est lu une fois par image et le délai
  de 0,3 s se compare d'une image à l'autre : un appui qui ne tient qu'une
  image ne rappelle jamais rien, si longue soit-elle. (L'assise par E
  échouait en cascade : la vue de sonde restait ouverte.)
- *Un vaisseau inamovible.* Le drapeau `parked`, qui tient le vaisseau au repos
  sur sa piste surélevée jusqu'à l'allumage, le tenait contre tout — lancé à
  40 u/s, il ne bougeait pas. Il ne tient plus que sous `LANDED_SPEED`
  (5 u/s), la vitesse où les capteurs de piste cessent de le compter posé.
  Sur le commit de départ, ce contrôle passait **par accident** : le vaisseau
  y dérivait déjà à 23 u/s au démarrage, ce que les pas de temps de ce lot ont
  réglé (« au démarrage, le vaisseau est posé » échouait là-bas, passe ici).

**Quatre attentes périmées, préexistantes**, que le départ échouait aussi :

- « émetteurs de son d'événement » : 22 à l'origine, 39 depuis que les docs
  124, 128 et 129 ont étendu `EVENT_AUDIO` sans relever ce compte ;
- « huit feux de camp » comptait les **neuf** émetteurs de rayonnement ; les
  feux sont ceux de `radiationType` 1, et il y en a bien huit ;
- le cran de course tactile et les boutons Monter/Descendre : masqués sans
  combinaison depuis la doc 126 — le sac dorsal y est inerte. Le contrôle
  mesure maintenant les deux états.

## Le réveil, côte à côte

L'alpha tourne aussi **en jeu** sous Xvfb, à condition de lui laisser le
processeur : en 640 × 360, le niveau 1 se charge en 19 s et le réveil se
déroule. (Lancée pendant que Chromium compilait ses shaders, elle émettait
9 000 « Invalid parameter because it was infinity or nan » et restait noire :
un artefact de la machine saturée, pas du jeu.) `scripts/pw-jeu.mjs` capture
le même moment dans le portage.

La première comparaison était sans appel : l'alpha s'ouvre de nuit, le feu de
camp éclaire le Voyageur et le pied de la tour ; le portage montrait un soir
terne et uniforme, du rose dans le décor, deux sphères blanches devant la
caméra, pas de flammes, un bandeau de texte en bas de l'écran. Huit causes, et
une seule tenait à un réglage.

1. **Le bandeau d'état et l'aide des touches** sont des outils du portage :
   l'alpha n'affiche en jeu que son réticule, une croix de treize pixels
   blanche à 50 % (`IconGenerator.GenerateCrosshair`, appelé par
   `DebugHUD.Awake`). Le bandeau est masqué (F3, `?debug` ou le mode de
   débogage de `GUIMode` le rendent) ; le réticule est porté.
2. **Les maillages sans renderer.** Un `MeshFilter` ne dessine rien : vingt-deux
   objets n'ont pas de renderer — les huit `RadiationEmitter` des feux, le
   `HeatDetector` de la guimauve… L'exporteur les marque `hidden`.
3. **Les GameObjects inactifs.** Personne ne lisait `m_IsActive` : 1 648 objets
   de `level0` sont inactifs, avec 955 maillages — un cratère d'origine
   superposé au vrai, des maquettes grises (le « rose »), des arbres de test —,
   29 systèmes de particules, cinq sources, trois lumières dont un second
   soleil, et une trentaine de scripts dont un volume mortel. `ctx.actif(gid)`
   les désigne ; le glTF éteint leurs nœuds, les colliders les ignorent, et le
   moteur retire leurs composants (`actifsSeulement`), sauf ceux que le build
   rallume par `SetActive` — le nouvel `il.mjs --appel` le dit.
4. **Ce qui orbite.** Lumières, particules et sources étaient posées à leur
   position monde de l'instant zéro ; Timber Hearth orbite à plus de 200 u/s.
   Dès la première seconde, le feu laissait sa lumière et sa flamme derrière
   lui. Elles portent maintenant leur corps, et le décalage déjà écrit pour
   les volumes (`decalageDuCorps`, docs/46) s'y applique.
5. **L'orientation des particules.** Un système Unity émet le long de son +Z ;
   le portage émettait le long du Y du monde, et la flamme s'étalait sur le
   sol. Un émetteur orienté (`emitterRotation`) la redresse.
6. **Les calques.** Le calque 15 s'appelle `IgnoreSun` et porte 766
   renderers ; les deux `surfacelighter` de l'étoile n'éclairent que sa
   surface. Chaque maillage reçoit le bit de son calque, chaque lumière son
   `m_CullingMask` ; le soleil directionnel du portage prend le masque de
   `SunLight`, qu'il remplace.
7. **L'atténuation et l'ambiance.** Unity 4 atténue une lumière ponctuelle sur
   sa portée, `2 / (1 + 25 (d/r)²)` ; le PBR de Babylon en 1/d², ce qui éteint
   tout au-delà d'un mètre. Et l'ambiance du build est un bleu de nuit de
   valeur 0,06 (doublée par Unity), noire hors des secteurs ; le portage
   visait 0,35 et 0,1 partout, un choix de jouabilité qui s'écartait de
   l'alpha.
8. **L'espace gamma.** Les shaders « legacy » d'Unity 4 multiplient la
   couleur de la texture, telle quelle, par la lumière. Le PBR de Babylon
   décode en linéaire, divise par π et réencode : mesuré, 0,43 là où Unity
   rend 0,50, et une image aplatie — la pénombre trop claire, le lumineux
   éteint. Les matériaux glTF sont convertis en `StandardMaterial`
   (`toLegacyMaterials`), qui calcule comme Unity, et son atténuation reçoit
   la même correction.

## Le ciel de nuit, côte à côte

Le réveil corrigé, restait le ciel. L'alpha, en levant les yeux : la lune
presque pleine, Giant's Deep en disque sombre cerclé de bleu-vert, une poussière
d'étoiles d'un pixel, des nuages à peine visibles. Le portage : du noir, un
cercle vert pâle, rien d'autre. Une caméra de test pointée sur la lune et sur
Giant's Deep les montrait noires toutes les deux — et un rayon lancé vers la
planète touchait d'abord `SkyShell`, à 121 unités. Dix causes, en cascade.

1. **La voûte bouchait le ciel.** Depuis la conversion en `StandardMaterial`,
   `applyAlphaBlend` posait `useAlphaFromAlbedoTexture` — une propriété du PBR
   — et coupait l'éclairage avec un émissif noir : la voûte était opaque et
   noire. `alphaDeTexture` et `sansEclairage` (shaders/index.js) valent pour les
   deux familles de matériaux.
2. **Et elle regardait à l'envers.** Visible, elle était bleue de jour en
   pleine nuit : le disque clair (`-Z` local) visait exactement l'anti-soleil
   (produit scalaire −1). `readBasis` lisait la matrice monde du parent au
   rattachement, avant que Babylon y ait composé le demi-tour du conteneur
   glTF ; le repère est maintenant recalculé, et relu à chaque image.
3. **Il manquait une voûte.** Le `RenderSettings` de `level0` pose un matériau
   `Skybox`, `PlainStarscape_BiggerStars` : six faces d'étoiles fines. Le
   portage effaçait l'écran d'un bleu nuit de sa façon. L'extracteur du ciel
   sort ces faces (`extractSkybox`, partagé avec l'écran-titre) et le moteur
   les pose derrière tout (`creerVoute`, etoiles.js).
4. **Des étoiles en confettis.** `DistantStars` : mille particules de 200 à 400
   unités à 30 000, texture `Default-Particle`, en additif. Le portage dessinait
   des carrés pleins de trois pixels. Mesurées sur l'alpha, ce sont des points
   d'un pixel à 0,2–0,3 de gris : sous quatre pixels, chaque étoile est rendue
   en point d'un pixel qui garde l'énergie du sprite (aire × moyenne mesurée de
   la texture) ; au-dessus — à la longue-vue —, en sprite texturé.
5. **Les planètes de loin étaient des sphères de couleur inventée.** Le
   portage chargeait la géométrie par secteur et montrait, hors de portée, une
   sphère tirée d'une palette arbitraire — Giant's Deep en lavande. L'alpha
   ne diffuse rien : `level0` est chargé en entier. Les huit lots pèsent
   47 Mo de tampons, pas les 200 que le code craignait ; ils sont tous chargés
   derrière l'écran-titre, et `Sectors.lointain` les laisse affichés hors de
   portée, le niveau de détail par maillage éteignant ce qui est petit à
   l'écran.
6. **Le chargement d'un lot défaisait les autres.** `Sky.attach` et
   `attachClouds` remettaient la voûte et les nuages à rien quand un lot ne
   les portait pas : tant que Timber Hearth était le dernier arrivé, cela ne
   se voyait pas.
7. **Le soleil est une ponctuelle.** `SunLight` : portée 20 000, intensité 3,
   atténuation d'Unity, et **pas d'ombres** (`m_Shadows` à 0). Le portage le
   remplaçait par une directionnelle d'intensité 1,15 partout — la force du
   soleil à la distance de Timber Hearth — munie d'un générateur d'ombres de
   son cru. À 16 458 unités, Giant's Deep reçoit vingt fois moins : l'alpha
   la montre presque noire (≈ 25/255), et Dark Bramble et la comète, au-delà
   de la portée, ne sont pas éclairées du tout.
8. **Le liseré de Giant's Deep était inventé.** `rim.js` se disait
   « implémentation originale » ; le programme de fragment du build dit
   `albedo × (2 N·L × lumière + ambiante) + spéculaire + _RimColor × (1 − N·V)^_RimPower`.
   Les propriétés de `TornadoGiantOuterSurface` passent par les extras glTF
   (`unityProps`). Et la couche externe, `TornadoClouds`, est un additif teinté
   par `_TintColor` — un bleu-vert à 5 % que le portage ignorait : la planète
   sortait blanche.
9. **Les nuages.** `SelfIlluminAlpha` a bien une émission,
   `albedo × lightStrength` (2 sur `CloudMat`), et ne découpe que l'alpha nul
   (`AlphaTest Greater 0`) ; le portage coupait à 0,4 et reposait chaque
   texture de nuage en émissive. Surtout, les quatre anneaux porteurs
   (`CloudRingBot`…) ont leur renderer **éteint** : l'exporteur ne regardait
   que l'existence d'un renderer, pas `m_Enabled`, et 42 maillages éteints
   du build se dessinaient — dont ces anneaux, qui voilaient la nuit d'un gris
   uni. Ils portent maintenant `rendererOff`.
10. **Le masque de la caméra.** La `PlayerCamera` ne dessine pas le calque 23
    (`HeadsUpDisplay`) ni le 24 ; le portage dessinait tout. Il prend le masque
    du build (`masqueCamera`).

Ce qui reste : la lune n'est pas au même endroit du ciel dans les deux
captures — une question de phase orbitale au moment de la prise de vue, que
le minutage du réveil doit trancher — et l'émetteur `Explosion_Fiery_Med`,
visible au même endroit dans les deux, est orangé dans le portage et rose
dans l'alpha.

Le vérificateur suit le build sur ce que `actifsSeulement` a retiré :
`DarkBrambleShortcut` est inactif et aucun `SetActive` ne le rallume — l'alpha
n'a pas de raccourci depuis Timber Hearth ; `KillVolume`, `OribitingIsland`,
deux émetteurs de signal et un lisible sont inactifs aussi. Les deux icônes
clignotantes de l'ordinateur de bord, elles, sont rallumées par
`ShipComputer` (`RALLUMES`).

## Les particules : qui les joue, et de quelle couleur

La tache orange au-dessus de la tour, dans le ciel du portage, était
`Explosion_Fiery_Med` — l'explosion du vaisseau, qui brûlait dès le réveil.
Le build pose `playOnAwake` à faux sur **53 des 135 systèmes** : buses,
éruptions, passages, explosions, étoiles qui se dispersent. C'est un script qui
les joue (`il.mjs --appel "ParticleSystem::Play"` en nomme dix-sept), et le
portage les démarrait tous. `ParticleField.spawn` respecte maintenant le
drapeau, et cinq déclencheurs du build sont portés :

| script du build | systèmes | dans le portage |
|---|---|---|
| `ShipDamageController.ExplodeShip` | `Explosion_Fiery_Med` | à la destruction de la coque, éteint à sa remise en état |
| `ModelShipCrashBehavior.OnImpact` | `Explosion_Fiery_Small` | au crash de la maquette |
| `AncientTeleporter.FireTeleporter` | `TeleportParticles` (le plus proche) | au départ d'un passage |
| `MeteorLauncher.LaunchMeteor` / `Update` | `EruptionParticles` (le plus proche) | au tir, arrêté après `_particleEmitDuration` |
| `DissipatingParticlesBehavior.OnSunExploded` | `DissapatingStars`, `DissapatingParticles` | à l'explosion de l'étoile |

Les buses (`ThrusterParticlesBehavior`) et les étincelles
(`RandomParticleBursts`) l'étaient déjà. Restent sans déclencheur la tempête de
sable (`ScreenEffectController.OnEnterSandstorm`) et l'entonnoir
(`SandFunnelController.ActivateFunnel`).

Et la **teinte** : les shaders `Particles/*` rendent `2 × _TintColor × couleur ×
texture`. L'extracteur ne lisait que la texture ; la teinte des flammes du
build vaut 0,22 — le portage les montrait deux fois trop vives —, celle des
nuages de Giant's Deep un bleu-vert à 5 %.

## Le réveil, horodaté

`scripts/alpha-reveil.sh` lance l'alpha, valide « New Expedition » et capture
l'écran toutes les demi-secondes en notant l'instant. Deux pièges pour y
arriver, consignés dans les scripts :

- la fenêtre s'appelle « Outer Wilds », avec une espace ;
- **il ne faut pas lui donner le focus** (`windowfocus`) : focalisée, l'alpha
  verrouille le curseur en jeu, lit un premier delta de souris démesuré et la
  caméra part en NaN — écran noir et des milliers de « Invalid parameter
  because it was infinity or nan ». Ce n'était pas la charge du processeur,
  comme on l'avait cru. La touche s'envoie à la fenêtre, puis se **tient** :
  à quelques images par seconde, un appui instantané tombe entre deux
  `Input.GetKeyDown`.

Ce que dit la séquence : environ seize secondes de chargement, deux secondes
d'éblouissement blanc qui se dissipe, puis le ciel. La lune entre par le haut à
droite et glisse vers le centre ; le recentrage descend sur le feu entre la
sixième et la septième seconde, ce que le portage fait aussi
(`PlayerSpawner`, docs/108). Côte à côte au même instant, Giant's Deep, la
tour et le feu tombent aux mêmes endroits de l'image.

Ce que la séquence a encore corrigé : **la flamme**. Le feu de camp émet dans
une boîte de 0,8 d'arête (`boxX`, `boxY`, `boxZ`) ; l'extracteur n'en gardait
que le « rayon », et le portage émettait dans un cube de deux unités. Ses
soixante particules par seconde s'éparpillaient en taches rouges au lieu de
s'empiler, en additif, en une langue orange.

**Fermé depuis** (« Le cratère de Timber Hearth », plus bas). Ce qu'on en
disait alors : l'alpha voit les bûches de plus près que le portage,
alors que les positions du build (point d'apparition, caméra à 0,9 au-dessus
du centre du corps et 0,15 devant, feu) placent l'œil à 4,5 m de la flamme, et
le portage à 4,7 m. L'écart vient sans doute de ce que la physique fait du
corps dans les premières images — la capsule de l'alpha est posée par son
centre sur le point d'apparition, et `MatchInitialMotion` ne lui donne que le
mouvement de translation de la planète —, et reste à mesurer. Ce n'est pas une
glissade à l'arrêt : la capsule porte `Character`, sans frottement, mais
`CharacterMovementModel` change de matériau physique selon qu'on est debout,
en course ou en l'air. `PhysicMaterial` (classe 134) se lit maintenant au bit
près. L'éblouissement
blanc, lui, n'est ni le tonemapping (éteint par `TonemappingManager`) ni le
flashback : c'est le `StartOfTimeLoop` de `PlayerCameraEffectController`,
glow blanc à 3 en teinte 0-255, que le portage normalisait et lançait à
l'instant zéro — attribué et corrigé dans « La fin des temps, côte à côte ».

Et le cercle en haut à gauche de l'écran, absent de l'alpha : le marqueur de
la sonde, créé `hidden` mais dont la classe pose `display: flex` — une règle
d'auteur l'emporte sur l'attribut. `#ui [hidden]` rend la main à l'attribut,
et le vérificateur contrôle qu'aucun élément caché de l'interface ne se
dessine.

### La lumière qui reste, mesurée

`PlayerSettings` (classe 129, lue au bit près) tranche une question que la
conversion en `StandardMaterial` supposait : le projet est en **gamma**
(`m_ActiveColorSpace` 0), et le chemin de rendu par défaut est le **Deferred
Lighting** (`m_RenderingPath` 2). L'éclairage s'additionne donc bien comme
le calcule le matériau standard.

Il reste un écart, mesuré sur la scène fixe du réveil, recentrée : la tour
sort à (48, 33, 17) dans l'alpha et à (37, 21, 8) dans le portage, un surplus
presque neutre d'une dizaine de niveaux. Ce n'est pas le glow (le portage a
le réveil du build, glow blanc à 3 qui retombe, puis `Awake` l'éteint), et
doubler l'ambiance du secteur n'en rend que le tiers, sans la bonne teinte.
Le passage du forward au Deferred Lighting d'Unity 4 (tampon de lumière,
encodage, ambiance ajoutée en passe finale) est la piste. Le shader interne
n'est pas hors d'atteinte : `Resources/unity default resources` garde
`Internal-PrePassLighting` en assembleur ARB lisible, et c'est lui qui a
tranché l'écart de l'écran-titre (section suivante).

## Les ombres de l'écran-titre

L'écran-titre du portage sortait plus sombre que celui de l'alpha. Calé sur
le même instant de rotation (`pw-titre.mjs … 18`, meilleure corrélation
géométrique, r = 0,935), l'image entière n'est en fait qu'à 10 % de l'alpha
(9,4 / 12,5 / 5,9 contre 8,5 / 11,3 / 5,2) : l'écart est tout entier sur le
**sol**, deux fois plus sombre (4,0 / 3,5 / 1,9 contre 2,1 / 1,6 / 0,7, sur
(420, 150)–(640, 340)). Sans ombres, le sol passe à 6,1 / 4,3 / 1,7 : trop
clair. C'étaient donc les ombres.

Les deux ponctuelles du titre en portent (`m_Shadows.m_Type` 2, force 1,
biais 0,05) ; la caméra est en Deferred Lighting, seul chemin d'Unity 4 où
une ponctuelle projette. Le programme de fragment de la variante
`POINT SHADOWS_CUBE` dit la règle :

```
MUL R2.w, R2, c[7]                 # d × _LightPositionRange.w (1 / portée)
MAD R3.x, -R2.w, c[14], R3         # stocké − 0,97 × d / portée
CMP R2.w, R3.x, c[8].x, R2         # < 0 : _LightShadowData.x (1 − force)
```

Le biais est **multiplicatif** — trois pour cent de la distance —, là où
celui de Babylon s'ajoute à la profondeur stockée ; la variante
`SHADOWS_SOFT` ne fait que quatre échantillons décalés de 1/128 d'unité, le
même texel à plusieurs mètres. Le portage prenait un biais additif de 0,0005
et quatre échantillons de Poisson : le sol s'ombrait lui-même.

`patchOmbresUnity` (`lights.js`) remplace le test cubique de Babylon par
`0.97 × depth > shadow`, et `ombreUnity` règle le générateur en conséquence :
un échantillon, aucun biais additif, profondeur de 0 à la portée, obscurité
`1 − force`. L'extraction lit maintenant `m_Shadows` entier (`ombre`) et les
drapeaux `m_CastShadows` / `m_ReceiveShadows` de chaque renderer : au titre,
les dix-huit maillages `branches` des pins ne reçoivent pas d'ombre.

Le sol remonte à 2,7 / 2,1 / 0,9, et surtout l'ombre prend la forme de celle
de l'alpha : les troncs et la barrière y découpent des bandes, au lieu d'un
voile uniforme. L'écart restant vient du cadrage (l'alpha, à cet instant,
montre le pin de gauche plus grand) et du pin éclairé en bleu par la lune,
plus clair dans l'alpha. Invariants : `tests/05-extract.mjs` (les deux
lumières, force 1 ; `CoreLight` à 0,7 ; dix-huit `branches`),
`tests/09-jeu.mjs` (le patch ne touche que le test cubique, le générateur).

## La marche, côte à côte

Même manœuvre des deux côtés : après le recentrage, `W` tenu deux secondes,
puis un saut. Le portage parcourt 13,9 m (la vitesse au sol du build est de
7 u/s) et s'arrête, comme l'alpha, devant la même touffe d'herbe au pied de
la paroi ; le saut découvre le même bâtiment.

Mais la paroi était un **aplat brun**. `HP_RockyMat` répète sa texture vingt
fois (`m_Scale` de `_MainTex`), `HP_GrassMat`, le sol de Timber Hearth,
cinquante : 54 matériaux du build répètent ou décalent leur texture, et le
glTF n'en disait rien. L'exporteur écrit maintenant `KHR_texture_transform`
sur la texture de base et la carte de normales (`textureTransform`, dans le
repère aux UV retournées : décalage `1 − s − o`), que le chargeur de Babylon
lit.

## Parler, en regardant

Dans l'alpha, un pas de côté pour mettre le réticule sur le Rocket Scientist,
près du feu, puis la touche E : rien. Ni invite, ni conversation. Dans le
portage non plus — mais pour une autre raison, et c'est elle qui comptait.

`FirstPersonManipulator.LateUpdate` lance un rayon de **dix unités** depuis
la caméra, sur le masque d'interaction ; le collider touché passe son
`RaycastHit` à `InteractReceiver.Observe`, qui n'accepte que si
`hit.distance <= _interactRange` — **deux unités** pour les personnages, dont
la capsule fait 0,5 de rayon. On parle à quelqu'un en le regardant, à deux pas.
L'alpha refusait parce qu'on était à quatre mètres.

Le portage, lui, ouvrait la conversation la plus proche à six mètres du centre
de la zone, de dos s'il le fallait, et prenait les autres récepteurs par
proximité dans un cône. L'extracteur sort maintenant le collider des
`InteractReceiver` (`volume`, `rotation`), `rayonVolume` (interact.js) touche
sphère, capsule et boîte orientée, et le focus d'un récepteur vise depuis
l'œil. Mesuré dans la page : placé à 2,2 m, la conversation ne s'ouvre que
dans une direction sur trente-deux, celle du personnage ; à 4,5 m, jamais. La
proximité reste le repli d'une extraction ancienne, sans colliders.

Le vérificateur le garde par trois essais, le regard tourné par la sonde
`__interaction.viser` dans le repère d'horizon de la caméra : face au Rocket
Scientist à 2,2 m, on lui parle ; dos tourné, non ; à 4,5 m, non plus. (Un
premier contrôle balayait le lacet par pas fixes : selon l'état laissé par les
contrôles précédents, le pas enjambait la capsule, et il mesurait le pas plutôt
que la règle.)

## Viser un référentiel : le vide relâche

Le vérificateur échouait une fois sur deux sur « un second clic la relâche » :
le second clic ne relâchait pas, il **re-visait** un autre corps. Ce n'était
pas du minutage. `ReferenceFrameTracker.UpdateTargeting`, lu dans l'IL :

```
possible = rayon de 1 000 sur le masque physique -> son référentiel
sinon      RaycastAll de 100 000 sur le CALQUE ReferenceFrameVolume (19),
           et parmi les sphères TOUCHÉES, la mieux centrée
au clic :  possible nul ou identique -> Untarget ; sinon -> Target
```

Le portage prenait au second temps le corps le mieux centré du ciel entier,
qu'on le regarde ou non : viser le vide gardait toujours une cible, et la
dérive du regard sur une planète qui tourne suffisait à en changer entre deux
clics. Le calque 19 porte onze sphères « RFVolume », une par corps — 600 pour
Timber Hearth, 1 000 pour Giant's Deep, 1 500 pour Dark Bramble, 167,3 pour
l'Attlerock —, dont six n'ont même pas le composant `ReferenceFrameVolume` :
c'est le calque que le rayon interroge, pas la classe. L'extracteur les sort
(`ReferenceFrameSphere`), et `aimedFrame` n'accepte plus au second temps
qu'une sphère que le rayon traverse, en partant de dehors — un rayon d'Unity
ne touche pas le collider dont il part.

Et cette règle en a découvert une autre, plus grave : les positions que la
visée comparait au regard étaient celles de **l'instant zéro** (`position0`).
Au bout d'une minute d'orbite, on visait des planètes restées où elles étaient
au réveil ; le « mieux centré du ciel entier » masquait l'erreur. La visée lit
maintenant les positions courantes, et le vérificateur regarde un corps avant
de cliquer — viser le vide ne vise plus rien.

### Ce que l'outillage ne permet pas

Sous Xvfb, **la souris de l'alpha est inutilisable** : dès que la fenêtre a
le focus — au chargement ou en pleine partie —, le premier mouvement de souris
envoie la caméra en NaN. On ne tourne donc pas la tête de l'alpha ; on vise en
se déplaçant, par pas chassés et pas en avant tenus au clavier. C'est lent,
mais cela suffit, y compris pour viser une capsule de cinquante centimètres :
une fois le cadrage du réveil connu (section « Le cratère »), Slate se vise
en contournant le feu par la droite. Voir « Parler, côte à côte, pour de
bon » plus bas.

## Le menu de pause, côte à côte

`Escape` en pleine partie, des deux côtés, puis `S`. Trois écarts :

- **`S` ne faisait rien.** `Menu.Update` lit `moveZ` et `moveX`, soit W/S et
  I/K, A/D et J/L ; le portage ne lisait que les flèches, qu'aucun canal ne
  lie dans le build — l'écran-titre, lui, lisait déjà les bons canaux. Les
  touches des canaux passent maintenant par la même cadence (`MenuInput`,
  0,2 s) ; les flèches restent, parce que ce sont les codes qu'envoient la
  croix de la manette et le pavé tactile.
- **Une huitième ligne, « Nouvelle partie ».** Un ajout du portage, en deux
  validations, « faute de menu-titre ». Le menu-titre existe (docs/131) : elle
  est retirée, et le menu a les sept lignes de l'alpha.
- **La taille.** L'alpha pose son texte en pixels fixes, corps 40 : en
  640 × 360, le menu sort de l'écran par le bas. Le portage le met à
  l'échelle de la place disponible sur un écran bas — c'est ce qui le rend
  utilisable sur un téléphone en paysage. L'écart est assumé, et il ne joue
  que sous 720 pixels de haut environ.

## La lampe et le pas de côté

`F` au réveil, puis `D` : deux écarts encore.

**La lampe.** Le portage tenait un cône de 56° à 1,4, choisis à l'œil, au bord
net. La scène pose `Flashlight` sur `Player_Body` : projecteur de **80°**,
intensité 1, blanc. Et Unity atténue un projecteur par sa texture de spot par
défaut, qui s'éteint vers le bord du cône ; Babylon coupe net après
`cos^exposant`. Un exposant de onze ramène le bord à 5 % et la mi-course à la
moitié : le disque dur devient le halo de l'alpha.

**Le pas.** Le pas de côté du portage allait bien plus loin que celui de
l'alpha. `CharacterMovementModel.UpdateMovement`, lu dans l'IL, en dit plus
que ce que le portage en avait tiré :

```
vitesse = _groundSpeed ; si (commande.z < 0) vitesse = _strafeSpeed
cible   = (commande.x × _strafeSpeed, 0, commande.z × vitesse)   -- non bornée
écart   = cible − vitesse   (repère du joueur, y à zéro)
si |écart| > _tumbleThreshold (15, constructeur) : culbute
écart.x, écart.z bornés à ±_groundAcceleration ; AddVelocityChange(écart)
matériau : en course frottement 0 ; DEBOUT frottement 1 (au maximum) ; en l'air 0
```

Quatre corrections : on **recule à 5**, pas à 7 ; la diagonale n'est pas
bornée (8,6, comme le jeu) ; `_groundAcceleration` est une **borne par pas
fixe et par axe**, pas une fraction de l'écart — quatorze pas, 0,28 s, pour
atteindre 7 — ; et debout, le matériau frotte, ce qui arrête en 0,59 m sur
Timber Hearth (`pasAuSol`). La glissade après une touche lâchée, que
l'alpha montrait et que le portage n'avait pas, en vient.

## La fin des temps, côte à côte

Une nouvelle expédition n'explose jamais : `TimeLoop.Start` suspend la
supernova tant qu'on ignore les codes de lancement, et seul « Skip Intro »
les donne d'emblée (`PlayerData.CreateNewPlayerSave(true)`). Les deux
versions passent donc le titre par « Skip Intro » — `CHOIX=s` pour
`scripts/alpha-reveil.sh`, `demarrer(page, { avant: 2 })` pour le
portage — et la boucle de l'alpha dure **dix-huit** minutes, pas vingt.

### L'effondrement, lu dans l'IL

Le portage faisait partir `TriggerSupernova` et `SunExploded` ensemble,
« faute de connaître la durée de l'effondrement », et contractait l'étoile
pendant les **douze dernières secondes** de la boucle, avant même l'annonce,
vers 62 % de sa taille — des valeurs déclarées « les miennes ». Il la faisait
aussi enfler de 35 % au fil de la boucle. L'IL dit autre chose :

- `SunSurfaceProgressionBehavior` et `SunCoronaProgressBehavior` ne touchent
  qu'à la **couleur** (`SunColorCurve`) : l'étoile ne grossit pas.
- `SunExplosionBehavior.Start` vise `localScale × 0,03` ; à partir de
  `TriggerSupernova`, `Update` fait `Lerp(localScale, fin, 3 × deltaTime)`
  et, sous 150 en x, met l'échelle à zéro, fait exploser le `Detonator` et
  annonce `SunExploded`. La surface est à 4 000 dans `level0` : l'explosion
  vient **1,58 s** après l'annonce à soixante images par seconde (1,4 s à
  dix — la cadence compte, comme dans le build).
- `ShrinkSunBehavior` fait de même pour la couronne (362,2), à `deltaTime`
  seul, et l'éteint sous 50 : 2,18 s.
- `SunSphereOfDeathBehavior.OnSunExploded` prend l'heure : l'onde part de
  l'explosion, pas de l'annonce, et son rayon vaut `D × (t / T)³`
  (30 000 u, 15 s), ce que le portage faisait déjà.

`Effondrement` (`timeloop.js`) rejoue cette loi image par image ; l'échelle
de départ est lue dans la scène (`localScale`, extrait pour ces deux
classes), les constantes sont celles de l'IL. `SunStage` suit
l'effondrement au lieu de sa courbe en cosinus, et, l'explosion passée, ne
montre plus que la sphère de mort au rayon de l'onde.

### Mesuré côte à côte

`CHOIX=s scripts/alpha-reveil.sh 25 130 0.5 1075 work/alpha-fin` puis
`node scripts/pw-fin.mjs work/web-fin/ 1080 36 0.5` (la boucle du portage est
avancée à 1 080 s plutôt qu'attendue). Luminance moyenne de l'image :

| étape | alpha | portage |
|---|---|---|
| de l'annonce à la mort (onde à Timber Hearth) | ≈ 11,5 s (1,6 + 9,9) | 11,4 s |
| effet de mort : l'écran monte au blanc | 39 → 255, ≈ 1,5 s | 15 → 123 → 249 |
| noir, puis photos à rebours sur fond noir | ≈ 3 s de noir | `attente` 3 s, noir |
| blanc final, puis réveil ébloui | 255 → 175 → 23 → 11 | 255 → 210 → 27 → 11 |

Cinq écarts corrigés en chemin, tous visibles sur la planche :

- **L'éclair de mort ne blanchissait pas.** `FlashScreen(3, (255, 100, 100))`
  : le build écrit des composantes de 0 à 255 là où Unity attend 0 à 1, et le
  `GlowEffect` multiplie son halo par elles — le moindre pixel non noir
  sature. Le rendu du portage divisait par 255 et bornait l'intensité à 2
  (`multiplicateurGlow`, `cameraeffects.js`).
- **Le réveil n'éblouissait pas**, pour deux raisons : la même
  normalisation, et `startOfTimeLoop()` qui lançait son éclair à l'instant
  zéro, de sorte qu'il se croyait fini à la première image. C'est
  l'« éblouissement blanc non attribué » du réveil horodaté : c'est le
  `StartOfTimeLoop` du build, glow blanc à 3 qui retombe en trois secondes.
  Il part désormais aussi au premier chargement.
- **Le flashback partait à la mort.** `PlayerCameraEffectController.Update`
  n'annonce `TriggerFlashback` qu'à la fin de l'effet de mort (0,3, 3 ou
  5 s selon la cause). Le portage calculait cet instant (`flashbackDemande`)
  et ne le lisait nulle part ; `PlayerDeathHandler.attendreEffet` le fait
  attendre, en phase `effet`.
- **La scène restait visible autour des photos.** La caméra du flashback
  efface en noir (`clearFlags` 2) ; le calque du portage a maintenant son
  fond noir.
- **Les photos étaient noires.** La `RenderTargetTexture` de 256 × 256
  rendait du noir ; la photo est maintenant copiée de l'image affichée, dans
  le `onAfterRender`, en carré central — ce que donne une caméra d'Unity
  rendue dans une cible carrée, qui garde son champ vertical.

La durée du défilement, elle, ne se compare pas sur cette capture : elle
dépend du nombre de photos, deux cent seize après dix-huit minutes dans
l'alpha (≈ 17 s), cinq dans le portage avancé à la fin de la boucle. La loi
est celle de `OnTriggerFlashback` depuis [`98`](98-flashback.md).

## Le cratère de Timber Hearth

L'écart de cadrage au réveil — l'alpha voit le feu et Slate une fois et demie
plus grands — n'était ni une distance ni un champ de vision. Le terminal de
lancement, à dix mètres, a la même taille dans les deux images, et l'écart
angulaire entre lui et le feu est le même (18,5° contre 16,5°) : tout est
décalé d'environ quatorze degrés, le portage regarde vers le sol.

Le « haut » du point d'apparition vaut exactement (0, 0, −1), à 11,7° de la
verticale du lieu. C'est celui de **`CraterField`**, un
`DirectionalForceField` sphérique de 111 unités posé sur Timber Hearth
(12 u/s², bas (0, 0, 1) une fois la rotation de la planète appliquée) : le
village est dans un cratère dont la gravité est **droite**, pas radiale.
Le portage lisait ce champ, mais le testait à sa place **de départ** alors
que la planète orbite à une cinquantaine d'unités par seconde : le joueur en
sortait avant la fin du réveil, le champ radial (7,8 u/s²) reprenait la
main, le corps se redressait de 11,7° de trop — et glissait d'un mètre en
vingt secondes sur une pente qui n'en était pas une.

Les champs directionnels et polaires se testent maintenant au repos de leur
corps (`shiftOf`, le même décalage que les zones). Le joueur ne dérive plus,
et le cadrage du réveil est celui de l'alpha : le feu, Slate, la tour et le
terminal tombent aux mêmes endroits de l'image. Le vaisseau posé et le
modèle réduit, dans le même cratère, suivent le même champ. Invariant :
`tests/09-jeu.mjs` (un champ sur une planète qui a avancé de 600 unités
contient toujours son village, et donne le bas).

Le vérificateur y a gagné une correction de mesure : sous 12 u/s², le saut
ne tient que 0,5 s en l'air, et une image rendue sous SwiftShader peut
couvrir plusieurs sous-pas — le saut monte et retombe entre deux images.
Le contrôle lit donc la vitesse que `tryJump` donne au corps : 6 u/s, celle
du build.

### La lumière qui reste, remesurée sur un cadrage commun

Le cadrage du réveil étant maintenant le même, l'écart de lumière se mesure
objet par objet (alpha / portage, moyenne RVB) :

| zone | alpha | portage |
|---|---|---|
| terminal de lancement (9 m du feu) | 61 / 49 / 31 | 26 / 19 / 12 |
| Slate (3,7 m du feu) | 104 / 49 / 16 | 44 / 22 / 9 |
| tour | 50 / 34 / 17 | 38 / 22 / 9 |
| sol près du feu | 9 / 7 / 3 | 10 / 5 / 3 |

Ce que la mesure écarte, une piste après l'autre :

- **ni cuisson ni sondes** : les 2 261 renderers de `level0` ont tous
  `m_LightmapIndex` 255, et aucun n'utilise de sonde de lumière ;
- **ni facteur caché dans le shader** : la passe finale de `Bumped Diffuse`
  en Deferred Lighting vaut `albedo × _Color × (tampon de lumière + terme de
  sommet)`, et la passe de lumière ponctuelle `N·L × atténuation ×
  _LightColor` (lues en assembleur ARB dans `unity default resources`) ;
- **ni gamma ni traitement d'image** : basculer `gammaSpace` sur les 249
  textures, ou couper le traitement d'image de Babylon, ne bouge rien ;
- **ni cartes de normales ni normales du personnage** : les retirer ne change
  rien, et une lumière posée sur la caméra éclaire bien Slate de face ;
- **ni le vacillement** : `LightFlicker` est la même loi des deux côtés.

Ce qui reste : le feu seul, figé à 2 au lieu de 0,93, porte le terminal de
7 à 40 ; il en faudrait près de quatre fois plus pour rejoindre l'alpha,
alors que le sol près du feu est, lui, déjà aussi clair. L'écart n'est donc
pas un facteur global sur la lumière. Une anomalie à creuser : la boîte
englobante du villageois reste dans la pose de liaison, à plusieurs
centaines d'unités de son corps.

## Parler, côte à côte, pour de bon

Au clavier seul, l'alpha finit par montrer Slate sous le réticule : l'invite
**« ⓧ Talk »** apparaît au centre, E ouvre la conversation. La même séquence
dans le portage (`node scripts/pw-dialogue.mjs <dossier> 1280 720`) a sorti
quatre écarts, et le premier était grave.

- **Slate récitait le texte d'un autre.** `convo.name === enfant.name` : les
  quatorze zones s'appellent toutes `ConversationZone`, et chaque
  conversation passait pour celle de l'enfant aux fusées. Slate disait
  `Hobbyist_Intro` (« tu voulais t'entraîner à atterrir ? ») au lieu de
  `BigDay`. L'enfant se reconnaît maintenant à son contrôleur
  (`estEnfant`).
- **Les réponses étaient vides, les enchaînements coupés.**
  `Conversation.ProcessXMLDialogues`, lu dans ILSpy : un nœud affiche son
  PREMIER enfant (`FirstChild.InnerText`) ; une réplique peut porter un
  `goto` — quinze le font — qui mène au nœud suivant après « Next » ; le
  texte d'une option est son `<talk>` imbriqué, et les trente-six options du
  build en ont un ; `selectOption` choisit par `id` ; une conversation
  commence toujours au nœud 1. Le portage lisait le texte propre des
  options (vide, affiché « … ») et fermait la conversation au bout d'une
  réplique qui enchaînait.
- **L'interface n'était pas celle du jeu.** `DialogueGUI` est un IMGUI : des
  textures posées à des ancres calculées sur l'écran, en pixels, corps 30 —
  `Short_Dialog_BG` sans réponses, `Dialog_Choice_BG` avec, le nom aligné à
  droite sur `NPC_Name_BG`, le texte d'un personnage aligné à droite, le
  curseur `NPC_Name_BG` + `White_Dialog_Btn` qui descend de 35 pixels par
  option, le bouton `Short_Dialog_Btn` « Next » ou « Close ».
  `dispositionDialogue` (`dialogueui.js`) refait ces ancres ; sur la capture
  de l'alpha à 640 × 360, le nom finit à x = 572, les options commencent à
  440 et l'icône du curseur à 402, et ce sont les invariants de
  `tests/09-jeu.mjs`. Seul écart assumé : sous 1 280 pixels de large la
  scène se réduit, là où l'alpha sort de l'écran par la gauche.
- **Les commandes.** `chooseResponse` est l'axe `moveZ` (W/S) et
  `advanceText` la touche d'interaction : E choisit l'option sous le
  curseur, qui ne boucle pas et repart de la première à chaque boîte. Le
  portage ne lisait que les flèches et Entrée, et E restait sans effet
  devant des réponses. L'invite « Talk » manquait aussi : son texte est un
  champ (`InteractVolume._prompt`), pas un littéral, et le catalogue des
  invites ne lit que des littéraux ; elle disparaît maintenant pendant la
  conversation (`_hasInteracted`), comme dans l'alpha.

La séquence est désormais la même des deux côtés : « Hey, you ready to get
this thing off the ground? » (Next), « So how are you feeling? » et ses trois
réponses, « All systems go! » choisi à E, « I'm glad you're excited… »
(Next), « Anyway, you just need those launch codes… » (Close), et l'invite
revient.

## La lumière du réveil, expliquée

Deux causes, trouvées une fois le cadrage commun, et qui se compensaient en
partie — c'est ce qui les rendait si difficiles à isoler.

### Les textures des glTF étaient décodées en linéaire

Le chargeur glTF de Babylon crée ses textures de couleur en **tampon sRGB**
(`useSRGBBuffers`) : le processeur graphique les convertit en linéaire à
chaque lecture. C'est juste pour du PBR ; c'est faux pour les
`StandardMaterial` de `toLegacyMaterials`, qui calculent en gamma comme les
shaders d'Unity 4. Une demi-teinte à 0,5 arrivait à 0,21. Basculer
`gammaSpace` ne changeait rien — le format interne était déjà choisi — et
c'est pour cela que les essais précédents (« ni gamma ni traitement
d'image ») concluaient à tort. `gltfEnGamma` coupe l'option sur le
chargeur avant tout import, titre compris.

L'écran-titre, qui n'avait que cette cause, tombe juste : image entière
9,8 / 12,6 / 5,8 contre 9,4 / 12,5 / 5,9 dans l'alpha, à la même seconde de
rotation.

### Le soleil de Timber Hearth est un imposteur

Corriger les textures rendait la tour, le sol et les arbres **trop** clairs.
Isolée lumière par lumière, la tour du portage recevait 43 du feu, 11 de
l'ambiance et **32 du soleil** — alors que le soleil est à trente-cinq degrés
sous l'horizon. `SunLight` est une ponctuelle sans ombre : elle éclaire tout
ce qui se tourne vers elle, face nuit comprise. Dans l'alpha, la tour vaut
50, soit le feu et l'ambiance seuls.

Le build a un composant pour cela, que le portage ne lisait pas :
`SunlightSwapper`, posé sur `TimberHearth_Body` et `BrittleHollow_Body`.
Quand le joueur entre dans le secteur majeur, tout ce qui est au calque
`Default` sous le corps passe à `UseSunImposter` (12), que le masque de
`SunLight` exclut ; en sortant, l'inverse. La planète est alors éclairée par
les spots de `SunImposterPivot`, que `LookAtSun` tourne vers l'étoile à
chaque image — `SunImposter_Center` à 491,3 unités du centre, intensité 8,
cône de 45 degrés, **avec des ombres** : c'est la planète qui éteint sa face
nuit. `imposteur.js` refait l'échange de calques et la pose des spots ; le
relief du corps porte l'ombre (carte de 2 048, plans serrés sur le corps, rafraîchie toutes les six
images, l'étoile ne tournant que de deux degrés par seconde).

Mesure au réveil, alpha / portage :

| zone | alpha | portage |
|---|---|---|
| terminal de lancement | 61 / 49 / 31 | 61 / 49 / 36 |
| Slate | 113 / 55 / 18 | 99 / 49 / 17 |
| tour | 50 / 34 / 17 | 50 / 36 / 21 |
| sol, arbres | 9 / 7 / 3 ; 10 / 7 / 5 | 18 / 11 / 6 ; 17 / 14 / 7 |

Il reste le sol et les feuillages lointains, un peu plus clairs dans le
portage — le terrain répète sa texture cinquante fois, et le feuillage a son
propre shader (`DoubleSidedCutoutBumpedDiffuse`) — mais la lumière du
village, elle, est celle de l'alpha. Le soleil suit aussi le même horaire des
deux côtés : nuit au réveil, plein jour vers quatre-vingt-dix secondes,
nuit de nouveau vers cent trente-cinq.

### Un renderer, plusieurs matériaux

Le sol du cratère sortait couleur roche. Dans le build, 173 renderers portent
**plusieurs** matériaux, un par sous-maillage — `craterGeo` en a deux, la roche
et l'herbe — et l'export glTF n'en gardait que le premier, appliqué à tout le
maillage. `gltf.js` émet désormais une primitive par sous-maillage, chacune
avec son matériau ; Babylon en fait des enfants `<nom>_primitive<i>`, auxquels
`propagerExtras` recopie les drapeaux du parent (ombres portées et reçues,
rendu ou non) avant que `hideUnrendered` ne les lise.

### Le spot de l'imposteur, vivant et bien classé

Deux raisons faisaient que le spot `SunImposter_Center` n'éclairait pas, alors
que l'échange de calques était fait. Il passait par le budget de `LightField`,
qui garde les lumières proches du joueur, et il n'y survivait pas : il est
désormais créé à part, comme l'imposteur de Brittle Hollow. Et Babylon ne trie
les lumières d'un maillage que si `scene.requireLightSorting` est posé : le
spot, rallumé en entrant dans le secteur, était ajouté en fin de liste, onzième
pour sept emplacements. Le tri est posé, et la liste de chaque maillage est
refaite à chaque bascule.

### Le plein jour : la couronne du pivot, le cookie, la fin de portée

Au réveil, la lumière était juste ; à midi, le village restait deux fois trop
sombre (sol 53 contre 86). Quatre causes, trouvées l'une après l'autre en
isolant chaque lumière sur la même image.

**La couronne.** Mesuré au point près, le spot central frappait le terminal et
la tour par la tranche (N·L de 0,1 : le soleil est au zénith), là où l'alpha
les éclaire de face. Le spot central n'est pas seul : `SunImposterPivot` porte
**huit autres spots**, en couronne — TopLight, LeftLight … BottomRightLight, à
391 unités de l'axe et 371 en avant, inclinés de trente degrés vers lui,
intensité 5,25, cône de 85 degrés, sans ombre. L'extraction les exportait à
leur pose monde du fichier, et le portage n'en faisait rien. Elle garde
désormais, pour toute lumière enfant d'un `LookAtSun`, sa pose **locale**
(`pivot`) ; `imposteur.js` la recompose dans le repère de `LookAt(soleil)`,
haut du monde conservé comme le fait Unity. Neuf spots de plus ne tiennent pas
dans le budget d'un matériau Babylon (dix lumières sous SwiftShader, huit sous
ANGLE) : la couronne est rangée dans un `ClusteredLightContainer`, qui compte
pour une seule lumière et passe par le même `computeSpotLighting`.

**La carte d'ombre en retard.** La couronne branchée, le spot central
n'apportait plus rien au sol : zone d'ombre et zone éclairée valaient
pareil. Sa carte d'ombre était refaite toutes les six images — assez à
soixante images par seconde, mais le Chromium de mesure en fait deux : six
images, trois secondes, cinq degrés de course de l'étoile, et le sol
s'ombrait lui-même en entier. Le spot ne bouge plus que **par pas** : quand
il s'est déplacé d'une demi-unité, dans le monde ou par rapport au relief,
on le repose et la carte se refait avec lui. Carte et lumière ont toujours la
même pose, à toute cadence.

**Le cookie.** Un spot d'Unity 4 n'a pas d'exposant : il multiplie son
atténuation par la texture `Soft` de `unity default resources` (128 × 128,
Alpha8), projetée sur le cône — plate jusqu'aux six dixièmes du rayon, nulle
au bord. Babylon prend cos² de l'angle. L'extraction relève le profil radial
de `Soft` (33 échantillons) et `patchCookieUnity` le met à la place, lu en
`tan(angle) / tan(demi-cône)`, la projection d'Unity.

**La fin de portée.** Restait la couronne deux fois trop forte, et le spot
central une fois et demie trop faible — l'alpha le dit dans ses propres
ombres : au sol, à 81 s, 88 au soleil et 42 à l'ombre du spot central. Le
village est à 73 % de la portée du spot central et à 92 % de celle de la
couronne. La table d'atténuation d'Unity n'est pas `1 / (1 + 25 x²)` jusqu'au
bout : de 0,8 à 1, elle est multipliée par une rampe linéaire en carré de la
distance, `(1 − x²) / 0,36`, jusqu'à zéro. Le portage ne l'avait pas, et
c'était aussi ce qui éclairait trop, la nuit, les arbres à la limite des
lampes du village.

Même cadrage, même instant de boucle, alpha / portage (terminal, tour, sol
éclairé, sol à droite — où tombe l'ombre de 81 s —, arbres) :

| instant | terminal | tour | sol | sol à droite | arbres |
|---|---|---|---|---|---|
| 20 s | 45 / 55 | 36 / 44 | 9 / 12 | 4 / 6 | 5 / 16 |
| 60 s | 79 / 85 | 59 / 63 | 50 / 49 | 46 / 46 | 45 / 43 |
| 81 s | 98 / 89 | 63 / 67 | 88 / 90 | 42 / 46 | 45 / 52 |
| 93 s | 103 / 88 | 68 / 65 | 89 / 90 | 87 / 88 | 43 / 51 |
| 103 s | 87 / 92 | 68 / 70 | 56 / 56 | 59 / 67 | 51 / 49 |
| 120 s | 70 / 83 | 50 / 58 | 40 / 44 | 34 / 38 | 33 / 28 |

À 20 s, le terminal de l'alpha oscille de 45 à 58 avec le vacillement du feu
(moyenne 51). L'écran-titre, qui ne vit que de ponctuelles, n'en sort que plus
juste : image entière 9,4 / 12,4 / 5,8 contre 9,4 / 12,5 / 5,9.

### La flamme du feu, et le piège des deux images par seconde

Capturée par le Chromium de mesure, la flamme du feu de camp sortait rose
(bleu 70 à 110 sur les pixels les plus clairs, contre 20 à 40 dans l'alpha).
La texture (`fire3`, DXT1 orange) et le dégradé de vie (bleu, orange, rouge
sombre) étaient pourtant ceux du build. C'est la cadence : à deux images par
seconde, trente particules naissent à la fois, toutes au même âge, et la
flamme n'est plus qu'un échantillon de trois âges. En forçant un pas de
1/60 s (`scene.getAnimationRatio = () => 1`, une minute et demie pour
atteindre le régime), la flamme est orange-jaune à la base et rouge au-dessus,
comme dans l'alpha (bleu 56 contre 19 à 32) ; il reste un cœur un peu plus
jaune. Toute comparaison de particules se fait à ce pas-là.

## La tour et la carte, au clavier seul

L'alpha, sous Xvfb, ne se pilote qu'au clavier : toute entrée de souris
envoie sa caméra en NaN (écran noir), y compris un déplacement relatif de
trois pixels. On ne peut donc ni lever ni baisser le regard.

**Le terminal de lancement est hors d'atteinte ainsi, dans les deux
versions.** Son volume d'interaction est une sphère de 0,42 posée à 1,44 au
centre du pupitre ; l'œil est à 2,2 au-dessus des pieds. Centré sur le pupitre
à moins d'un mètre, le rayon du regard passe au-dessus. C'est la géométrie du
build, que le portage reprend : il faut baisser les yeux. La chaîne tour,
ascenseur, vaisseau ne se compare donc pas au clavier.

**La carte, si — et l'alpha refuse de l'ouvrir.** Au feu de camp, Entrée ne
fait rien. `MapController` est **éteint** dans la scène (`m_Enabled` 0),
`Awake` le laisse éteint, et c'est son `LateUpdate` qui lit la touche :
seuls `OnSuitUp` et `OnTriggerObservatoryMap` l'allument ; `OnRemoveSuit`, la
mort, et la sortie d'une carte d'observatoire sans combinaison l'éteignent.
Le portage ouvrait la carte partout. `AccesCarte` (map.js) refait la règle ;
le contrôle navigateur vérifie qu'Entrée n'ouvre rien sans combinaison, et
que l'ôter l'éteint.

Au passage, la maquette de l'observatoire appelait `solarMap.ouvre()`, une
méthode que `SolarMap` n'a jamais eue : l'interaction levait une erreur. Elle
ouvre désormais la carte comme `OnTriggerObservatoryMap`, sans cadrer de
cible — le système entier.

### La carte est une caméra

Dans le build, la carte n'est pas un dessin : c'est `MapCamera` (champ de 60,
plan lointain à 100 000) qui s'élève de l'œil du joueur jusqu'à la vue
plongeante, en `SmoothStep` sur deux secondes (dix depuis l'observatoire, 0,6
avec une cible), plan proche de 0,1 à 5,1. Le portage ouvrait d'un coup un
calque opaque, dessiné à plat par-dessus la scène. Relu dans l'IL
(`MapController.LateUpdate`, `MapOpenGL.OnPostRender`, `MapMarker`), il
manquait bien plus que l'animation :

- **le centre** : `_focalOffset` est un décalage depuis le **Soleil**. Le
  portage tenait un point absolu de son repère flottant, ancré sur le corps
  du joueur : sans cible, la carte se centrait sur Timber Hearth ;
- **le cadrage d'une cible** se calcule avec le champ de `MapCamera` (60) et
  non celui du joueur (70) : 48 497 unités de hauteur à 40 000 de distance,
  pas 39 988 ;
- **la durée** à la touche est de deux secondes (`EnterMapView(2f, …)`) ; le
  portage écrivait 1, sans la jouer ;
- **les orbites** sont des cercles d'écran : centrés sur le Soleil **projeté**,
  de rayon la distance **à l'écran** du corps au Soleil. Pendant la montée,
  ils ne suivent pas encore le plan du système — c'est l'alpha ;
- **l'ellipse de la comète** se dessine dix degrés par image, à chaque
  ouverture ;
- **les marqueurs** se testent sur la **profondeur caméra** (`_screenPos.z`),
  pas sur la distance au joueur, et portent les noms du build — « You Are
  Here », « Ship » — là où le portage écrivait « vous » et « vaisseau » ;
- **le casque s'éteint** : `HUDCameraScript.OnSwitchActiveCamera` coupe la
  caméra du casque dès que la caméra active n'est plus `MainCamera`. Jauges,
  silhouette de la combinaison et minicarte disparaissent ; les invites et
  les marqueurs, dessinés par `OnGUI`, restent ;
- **les invites** « Close Map », « Zoom In/Out », « Pan View » n'arrivent
  qu'en fin de montée, et le déplacement n'est permis qu'à mi-course.

La carte du portage est désormais la caméra du joueur, pilotée par
`VueCarte` (map.js) le temps de la carte, puis rendue à ses réglages. Un
piège : le repère de travail **tourne** avec le corps ancré (spin.js). Le bas
de la carte est `Vector3.down` du monde, et le décalage du point visé vit
dans les axes du monde ; l'inverse de `toFrame`, retiré faute d'appelant, est
revenu pour cela.

L'alpha ne s'est pas laissée photographier carte ouverte : il lui faut la
combinaison, qui est dans le vaisseau, derrière le terminal que le clavier
seul n'atteint pas. La carte du portage est donc refaite sur l'IL, sans
image de l'alpha pour la juger.

## Le vaisseau miniature, relu dans l'IL

Le modèle réduit de l'observatoire se pilote depuis une console
(`RemoteFlightConsole`). L'alpha ne l'atteint pas au clavier seul — la console
est au fond de l'observatoire —, mais sa lecture a suffi à trouver cinq écarts,
dont deux visibles dès le chargement.

- **Il quittait son socle au chargement.** Sa position était tenue en
  coordonnées de repos, sans suivre Timber Hearth qui orbite : posé, il
  dérivait à la vitesse orbitale de la planète (11 à 35 u/s mesurés), et
  sortait de l'observatoire avant qu'on ait touché à quoi que ce soit. Il vit
  désormais dans le repère de travail, comme le joueur, et reste sur son
  socle tant qu'on ne le pousse pas.
- **Ses propulseurs sont les siens.** Le seul `ThrusterModel` simple du build
  est le sien : 12 u/s² de poussée, 5 rad/s² de rotation, amortissement 0,96.
  Le portage prenait 0,4 fois la poussée du vrai vaisseau, « faute d'un modèle
  à lui ». Il pousse le long de **ses** axes — l'orientation de repos n'était
  pas extraite — et tourne à la souris (`Pitch`, et le roulis sur l'axe du
  lacet, à la sensibilité 0,1 de l'`InputManager`).
- **Sa gravité est à 0,8.** Son enfant `Detector` porte un
  `SingleFieldDetector` qui ne voit qu'un champ, `CraterField`, à 0,8 de sa
  force. 9,6 sous 12 de poussée : il décolle. Avec le champ dominant à pleine
  force, la poussée l'équilibrait exactement et il ne quittait pas le sol.
- **Un crash ne le remet pas en place.** `ModelShipCrashBehavior.OnImpact`
  joue l'explosion et annonce `CrashedModelShip`, rien de plus ; le portage
  le ramenait tout seul sur son socle. C'est la console qui le fait :
  « Reset » (`Cancel`) quand il est à plus d'une unité de `RocketSpawn` — et
  `RespawnModelShip` lui rend aussi sa rotation.
- **Les invites de la console** manquaient : « Exit », « Upwards Thrust »,
  « Downwards Thrust », « Horizontal Thrust » à sa place, « Reset » ailleurs.

Le sol, enfin, est celui de Havok — un rayon le long du trajet de chaque
image — et non plus la sphère de la surface haute, qui le posait au-dessus du
fond du cratère. Mesuré dans Chromium : 2,4 u/s² de montée, cinq unités de
hauteur en deux secondes, la chute, le crash compté par l'enfant, et le
modèle qui reste où il est tombé.

## Un même parcours au clavier, dans les deux versions

Au clavier seul, on ne tourne pas, mais on avance, recule et se déporte. Même
départ (« Skip Intro », boucle à 38 s), mêmes touches, mêmes durées — reculer
2 s, droite 2 s, avancer 2,5 s, gauche 2,5 s —, une image après chacune
(`work/alpha-route.sh`, `work/pw-route.mjs`, hors dépôt). Deux écarts.

**Le joueur ne gravissait pas la paroi du cratère.** À droite du feu, le sol
monte à 45 puis 55 degrés. L'alpha y grimpe — l'image suivante voit le
terminal d'en haut — ; le portage glissait le long de la paroi à 1,6 u/s.
Le corps physique du joueur avait un frottement de 0,9 en permanence. Le
build en change à chaque pas : `CharacterMovementModel.Awake` crée trois
matériaux, et en course comme en l'air le frottement est **nul**, combiné au
**minimum** — nul contre tout. Poussé à l'horizontale à 25 u/s² (0,5 par pas
de 0,02 s) contre une pente sans frottement, le corps se redresse en montée,
plus vite que les 9,8 u/s² de pesanteur le long de la pente. Le frottement
debout (1, au maximum) était déjà tenu à part (`pasAuSol`) ; le `Rigidbody`
du joueur n'a pas non plus de traînée. Après correction, les deux parcours
finissent au même endroit : face au rocher, puis contre le pilier de la tour.

**« Launch Codes Aquired » restait à l'écran.** L'alpha n'affiche rien sur
ce parcours ; le portage portait le bandeau du bas du début à la fin.
`LaunchCodePromptController` ne le montre que **cinq secondes** : après
`LearnLaunchCodes`, ou — « Launch Codes Remembered » — cinq secondes après le
réveil de la **deuxième** boucle, et d'aucune autre. Le portage le montrait
tant qu'on connaissait les codes (`InviteCodes`, hud.js).

### La nuit des pins, et midi

Sur le même parcours, de nuit, les pins du camp sortaient verts dans le
portage et noirs dans l'alpha (arbres 16 contre 5 à vingt secondes). Isolée
lumière par lumière — en bloquant l'intensité de chaque lumière, la boucle
de jeu la réécrivant à chaque image —, l'ambiance donnait 4,6 : l'alpha
entier. Le reste venait du feu et des lampes, huit, sur des feuilles qui lui
tournent le dos.

Les deux shaders de la végétation (`DoubleSidedCutoutDiffuse`,
`DoubleSidedCutoutBumpedDiffuse`) sont en `Cull Off`, et **aucun shader du
build ne lit `VFACE`** : la face arrière est éclairée avec la normale de la
face avant. Babylon, avec `twoSidedLighting`, retourne la normale et éclaire
les deux faces. Coupée, la nuit tombe à 7 contre 5.

Midi, alors, montait à 77 contre 43. La même famille de shaders couvre aussi
l'ascenseur, les passerelles, les colonnes — la tour — ; et la végétation
n'était pas ombrée. `m_ReceiveShadows` est faux sur ses renderers, et le
portage l'honorait depuis peu. Or la caméra du jeu est en **Deferred
Lighting**, où Unity 4 ne lit pas ce drapeau : tout ce qui passe par le
tampon de lumière reçoit l'ombre. Les pins ombrés, midi tombe à 44 contre 43.
L'écran-titre, dont la caméra est aussi en différé, suit la même règle.

| instant | terminal | tour | sol | sol à droite | arbres |
|---|---|---|---|---|---|
| 20 s | 45 / 49 | 36 / 39 | 9 / 11 | 4 / 6 | 5 / 7 |
| 60 s | 79 / 79 | 59 / 59 | 50 / 47 | 46 / 44 | 45 / 44 |
| 81 s | 98 / 89 | 63 / 65 | 88 / 89 | 42 / 45 | 45 / 48 |
| 93 s | 103 / 89 | 68 / 66 | 89 / 90 | 87 / 89 | 43 / 44 |
| 103 s | 87 / 86 | 68 / 66 | 56 / 55 | 59 / 67 | 51 / 53 |
| 120 s | 70 / 70 | 50 / 51 | 40 / 42 | 34 / 38 | 33 / 36 |

## La réparation se fait dehors

`RepairVolume`, relu dans l'IL, contredit le portage de bout en bout. Le
portage réparait **depuis le poste de pilotage**, touche tenue, la pièce la
plus abîmée d'abord. Dans le build :

- chaque volume est l'**enfant** de la pièce qu'il répare
  (`ShipComponent.Awake`, `GetRequiredComponentInChildren`) — dix réacteurs
  et cinq pièces de coque, quinze volumes, chacun sphère d'un mètre ;
- il ne s'allume que quand **sa** pièce prend un coup (`Activate`,
  `ResetVolume` : l'avancement repart de zéro à chaque nouveau coup) ;
- il s'**éteint quand on entre dans le vaisseau** (`OnEnterShip` :
  `_interactReceiver.Disable()`) : on répare en faisant le tour de la coque ;
- on le **vise**, à trois unités (`InteractReceiver.Init("Repair", …,
  _repairDistance)`), touche tenue trois secondes ; « NN% » s'affiche au
  style des invites, cinquante pixels au-dessus du centre ;
- l'achever répare **sa** pièce, et elle seule (`OnCompleteRepair`).

Le portage suit désormais ces règles. L'extraction rattache chaque volume à sa
pièce par l'identifiant du GameObject — les quinze s'appellent toutes
`DamageSiteContainer` — et la position du volume suit la pose du vaisseau.
Mesuré dans Chromium : le joueur posé devant le nez vise l'avant, « 40% »,
« 57% », « 97% », et l'avant revient à neuf, la gauche restant abîmée.

### Les dégâts vivent sur les pièces, pas sur les positions

Le portage ramenait les dégâts à cinq positions — avant, arrière, haut,
gauche, droite — et ne lisait, pour choisir la pièce touchée, que les dix
réacteurs : un choc sur le nez allait au réacteur le plus proche. Le build
prend les **quinze** (`GetComponentsInChildren<ShipComponent>`), et les
positions ne sont que ce que le casque en montre. Relu dans l'IL
d'`OnImpact` et d'`OnCompleteRepair`, trois conséquences de jeu :

- **la pièce retouchée compte double.** `_damagedParts` est une liste où la
  pièce entre à chaque coup, sans `Contains`, et `RecalculateShipDamge` somme
  sur la liste. Deux chocs à 100 u/s sur le même réacteur (25,9 chacun) font
  un cumul de 2 × 51,9 = 103,7 : le vaisseau explose au **deuxième** choc. Le
  portage, qui sommait les pièces, attendait le quatrième ;
- **le partage se fait par entrée.** Au-delà de trois entrées, un choc se
  répartit `v / n` sur chacune, et une pièce présente deux fois prend deux
  parts ;
- **le voyant tombe avec la dernière pièce.** Réparer un réacteur de gauche
  laisse l'alerte « gauche » allumée tant qu'un autre l'est encore ; et une
  buse coupée (`DisableThruster`) ne se rallume pas à la réparation —
  `EnableThruster` n'est appelé nulle part. `_disableDamagedThrusters` vaut
  faux dans ce build : aucune buse ne se coupe, mais la poussée passe par
  les deux buses de chaque sens, pour moitié chacune, comme
  `FireTranslationalThrusters`.

Mesuré dans Chromium : un choc sur le nez et un autre sur le réacteur
`Left` allument **deux** volumes, celui de l'avant et celui de ce réacteur —
le portage par position en allumait six.

### Les fissures de la coque

Chaque pièce porte une décalcomanie de fissure — `_damageDecal`, le premier
`DS_Decals` sous elle — que `ShipComponent.Awake` **éteint**, que
`ApplyDamageForce` rallume et qu'`OnCompleteRepair` éteint de nouveau. Les
quinze GameObject sont actifs dans la scène : c'est le script qui les cache.
Le portage, qui dessinait la scène telle quelle, montrait **quatorze
fissures sur un vaisseau intact** (la quinzième est sous un nœud inactif).

L'exportateur marque désormais le nœud de chaque pièce de son identifiant
(`extras.piece`, le même que `gameplay.json`), et le moteur y trouve la
fissure. Mesuré dans Chromium : aucune sur la coque intacte, deux après un
choc sur le nez et un sur le réacteur `Left`, aucune après la boucle.

## Le regard aux flèches, et la vitesse du build

Toute la chaîne tour, terminal, vaisseau, carte restait hors d'atteinte de
l'alpha au clavier : son regard n'a que la souris, et la souris l'envoie en
NaN sous Xvfb. Or ce qui lie la souris au regard est une **donnée** : les axes
`Yaw_Key` et `Pitch_Key` de l'`InputManager`, de genre `mouseMove`.
`scripts/alpha-clavier.mjs` en fait une copie **locale** où ces deux axes sont
des axes à boutons — flèches gauche/droite et bas/haut —, et où la lunette et
le verrou, qui n'étaient que des clics, reçoivent `t` et `g`.
`ALPHA_CLAVIER=1 scripts/alpha.sh start` pose la copie le temps du chargement,
puis remet l'original. L'`InputManager` modifié est ajouté en fin de fichier ;
seule son entrée de table change.

Un axe à boutons vaut −1, 0 ou 1 : tenu, il vaut un manche à fond. Et c'est
une mesure. Tenir la flèche droite **2,25 s fait un tour complet** dans
l'alpha, 1,125 s un demi-tour : 160 degrés par seconde, le `_turnRate` de
`PlayerCharacterController`.

Le portage, lui, ne suivait pas le build sur ce point, ni au manche ni à la
souris :

- **au manche**, « 900 pixels de souris par seconde », une zone morte de
  0,18 et une courbe cubique. Le build n'a ni courbe ni pixels :
  `Input.GetAxis` rend la déflexion, zone morte de **0,25** passée, et
  `PlayerCharacterController.FixedUpdate` tourne de
  `axe × _turnRate × fixedDeltaTime` — 160 degrés par seconde à fond, 80 à
  mi-course. Le tangage court à `_sensitivityY`, **120** degrés par seconde,
  dans `PlayerCameraController.UpdateInput` ;
- **à la souris**, `_turnRate` degrés pour une largeur d'écran. Dans le build,
  un pixel vaut 0,1 d'axe (la `sensitivity` de l'axe `mouseMove`), puis la même
  vitesse × la durée de l'image : 0,27 degré de lacet et 0,2 de tangage par
  pixel à 60 images par seconde, et davantage quand l'image ralentit — le
  build est ainsi, le portage aussi désormais ;
- **la borne** du tangage était 86 degrés ; `_maxDegreesY` vaut **80** ;
- le zoom ralentit les deux par le rapport des champs, et la lunette de
  moitié (`_telescopeTurnScalar`, `_telescopeSensitivityScalar`).

`regard.js` porte ces règles, à pied. Le chemin en pixels reste celui des
commandes du vaisseau, du roulis et du modèle réduit, qui n'ont pas été
relues. Mesuré dans Chromium, manette simulée : 160 degrés par seconde à
fond, 80 à mi-course, 60 de tangage à mi-course.
