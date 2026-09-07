# Le poids au démarrage

Tout le reste du portage fonctionnait ; ceci l'empêchait d'être une page web.

Mesure de départ, sur une session Playwright réelle, en comptant les octets qui
passent par le réseau (les URL `blob:` que Babylon fabrique en interne sont
exclues, elles ne coûtent rien) :

| | requêtes | poids | prêt en |
|---|---|---|---|
| **avant** | 302 | **199,6 Mo** | 18,6 s |
| **après** | 154 | **60,0 Mo** | 7,9 s |

Soit **−70 %** avant la première image.

> **Correction, mesurée plus tard par `tools/15_verify.py`.** Ces 60,0 Mo sont
> ce qui a fini de se télécharger **à l'instant où la page se déclare prête**.
> En laissant tourner trois secondes de plus, le total montait à **79,3 Mo** :
> l'audio continuait d'arriver. La différence tenait à six sources non
> spatiales — des morceaux de musique — pour 15,1 Mo. Le vrai chiffre est donc
> celui de la section suivante, **66,1 Mo**, une fois ces morceaux différés.
>
> C'est exactement ce que le filet de vérification est censé attraper : une
> mesure prise au bon moment mais trop tôt. Deux corrections indépendantes y mènent,
et la seconde a révélé un défaut de rendu.

## 1. Charger la géométrie à la demande

Les huit fichiers glTF partaient au démarrage. Or `sectors.js` savait déjà que
**3 corps sur 12** seulement sont actifs quand on est au sol : il ne s'en
servait que pour *éteindre* le rendu, jamais pour éviter le téléchargement.

`GeometryStore` (dans `geometry.js`) branche le chargement sur cette même mesure
de distance. Deux fichiers partent avant la première image — celui du corps de
départ et celui du soleil, qui pèse 0,2 Mo et éclaire tout — et les autres
arrivent quand on s'en approche. Un corps pas encore chargé se comporte
exactement comme un corps sans géométrie exportée : sa sphère de substitution
prend la main, ce que la boucle de rendu faisait déjà.

`entries` reste **le même tableau** du début à la fin de la partie ; il se
remplit au fil des chargements. `entryForBody`, `syncGeometry` et les secteurs
n'ont pas changé.

### La marge de préchargement est absolue, pas proportionnelle

Premier essai : demander la géométrie à 20 fois le rayon d'horizon, l'afficher à
8 fois. Résultat, Giant's Deep se téléchargeait au démarrage — son horizon vaut
500, donc 20 fois couvrait 10 000 unités, et Timber Hearth n'en est qu'à 8 039.
Le rayon de demande couvrait presque tout le système.

Ce qui compte n'est pas la taille du corps mais le **temps de vol** : la marge
est passée à 3 000 unités fixes, soit huit secondes à 375 u/s, la pointe du
pilote automatique.

### Deux volumes n'ont pas de puits de gravité

Dark Bramble et la dimension derelicte n'apparaissent pas dans
`solar_system.json` : ni gravité, ni orbite, seulement une position fixe lue
dans la scène (`(0, 0, −20000)` et `(0, −10000, 0)`). Les secteurs ne les
auraient donc jamais vus passer, et leur géométrie aurait disparu sans bruit.
`EXTRA_VOLUMES` les traite par la même règle de distance.

C'est le genre de régression qu'un chargement paresseux introduit en silence :
avant, tout était chargé, donc tout était visible, y compris ce que rien ne
référençait.

## 2. Les cartes de normales n'étaient pas des cartes de normales

Sur les 102 Mo de textures, **90 étaient en PNG**. La règle de l'exporteur
paraissait pourtant saine : si le canal alpha n'est pas entièrement opaque, la
texture est transparente, donc PNG ; sinon JPEG.

Sauf que **83 de ces 104 PNG étaient des cartes de normales**, et leur alpha
n'est pas de la transparence.

Unity range ses normales en **DXT5nm** : la composante X va dans le canal alpha,
Y dans le vert, et le RVB n'est qu'un gris qui ne porte rien. Trois mesures le
montrent sans ambiguïté, sur `AncientStatue_Normal` :

- R, G et B ne diffèrent que de 9 à 11 niveaux — du bruit de compression. G et A
  diffèrent de 190.
- Lus tels quels comme un vecteur RVB, **2 pixels sur 784** tombent sur une
  normale unitaire.
- Avec X pris dans l'alpha et Y dans le vert, **784 sur 784** tiennent dans le
  disque unité.

Autrement dit le moteur lisait `(y, y, y)` comme une normale. Ce n'était pas
seulement lourd : c'était faux. Le rendu en portait la trace — un bruit noir et
vert sur les vêtements des villageois, un visage marbré, une écorce grattée.

La conversion reconstruit Z par la contrainte de norme, comme le fait le shader
Unity, et sort une normale tangente RVB que glTF attend. Elle n'a alors plus
d'alpha du tout, donc plus de raison d'être en PNG.

### Pourquoi JPEG 4:4:4 et pourquoi 92

Le sous-échantillonnage de chrominance mélangerait les composantes de la normale
entre elles : les normales partent en **4:4:4**. Et à une qualité plus élevée
que les textures de couleur, mesure à l'appui sur six normales, en erreur
angulaire par rapport à la référence désentrelacée :

| qualité | erreur moyenne | 99ᵉ centile |
|---|---|---|
| 92 | **1,24°** | 5,68° |
| 85 | 1,55° | 8,07° |

Le PNG en RVB ne faisait économiser que 22 %, contre 3,8 fois pour le JPEG 92.

### Résultat

| | fichiers | poids |
|---|---|---|
| PNG avant | 104 | 90 Mo |
| PNG après | 43 | 22 Mo |
| JPEG avant | 97 | 13 Mo |
| JPEG après | 157 | 30 Mo |
| **total** | | **102 Mo → 51 Mo** |

`numpy` entre dans la chaîne d'outils pour cette conversion — Pillow seul
n'offre pas de racine carrée par pixel. Il est ajouté à `tools/00_setup.sh`.

## 3. La musique se téléchargeait pour rien

Une source **non spatiale** est « toujours à portée » : le test de distance ne
s'y applique pas. Les six du build tombaient donc dans la case « à charger tout
de suite », soit **15,1 Mo**.

Or elles ont toutes `playOnAwake` à **faux**. Ce sont des morceaux déclenchés par
événement — dont « End Times », la musique de la supernova, qu'on ne peut pas
entendre avant la vingtième minute. Rien ne les jouait au démarrage, et tout se
téléchargeait quand même.

Le piège était dans le nom : le portage testait `LOOPED.has(track)`, qui dit
**comment** jouer une piste, pas s'il faut la charger. Les six sont bien en
boucle, et toutes à `playOnAwake` faux.

Elles sont désormais demandées à l'usage — `audio.cue("EndTimes")` au moment où
la supernova se déclenche — et le démarrage tombe de **79,3 à 66,1 Mo**.

## Ce qui reste

- **15 Mo de WAV non compressés** (15 fichiers, 48 kHz 16 bits) : ce sont les
  échantillons qu'Unity stockait déjà décodés. Les réencoder demanderait un
  encodeur Vorbis, absent de la chaîne d'outils ; les rééchantillonner à
  24 kHz les diviserait par deux, au prix d'une perte que je ne peux pas juger
  à l'oreille ici.
- **Les textures partagées se retéléchargent.** 27 URL sont demandées jusqu'à
  cinq fois, faute d'en-têtes de cache sur le serveur de développement
  (`python3 -m http.server` n'en envoie aucun). Un hébergement réel les
  mettrait en cache ; la mesure ci-dessus est donc le pire cas.
- **Aucun LOD par maillage.** Un corps est chargé entier ou pas du tout ; le
  jeu, lui, a des `LODGroup` par objet.
- **Babylon pèse 11,1 Mo** des 60, soit près d'un cinquième. Une compilation sur
  mesure ne garderait que les modules utilisés.
- **La géométrie n'est jamais déchargée.** Traverser tout le système finit par
  tout charger ; il n'y a pas d'éviction.
