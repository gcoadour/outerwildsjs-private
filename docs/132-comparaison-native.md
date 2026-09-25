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
