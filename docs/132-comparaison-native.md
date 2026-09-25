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
