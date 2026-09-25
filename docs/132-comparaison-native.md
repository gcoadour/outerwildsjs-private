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

## Ce qui reste ouvert

- **Douze sources jouent un clip 2D** (`m_3D = false`) — les musiques du
  village et du voyage, les ambiances de jour et de nuit, `chomp`,
  `radio_static` — et l'extracteur audio ignore ce drapeau : elles sont
  atténuées par la distance là où Unity les joue partout. À traiter source par
  source, en regardant ce qui les pilote.
