# La sonde — et la moitié du jeu que le recensement ne lisait pas

[`59-etat.md`](59-etat.md) refermait la série sur un chiffre : **1 356 des 1 390
instances de `level0` sont lues, 97,6 %**, et les 34 restantes nommées une par
une. La conclusion était : « c'est le fond du tonneau, et il est nommé ».

Le fond du tonneau était le bon. Le tonneau, non.

`scripts/recensement.mjs` ne lisait que `level0`. L'alpha range dans
`sharedassets1.assets` et `resources.assets` **tout ce qu'elle instancie en
cours de partie** — et la sonde y est en entier : dix nœuds, huit classes, deux
caméras, une lanterne, un volume de scan.

> [`08-reste-a-faire.md`](08-reste-a-faire.md) §1 comptait « le modèle de
> sonde » parmi **ce que l'alpha n'a pas**, avec pour preuve : « `_probePrefab`
> n'est pas résolu ». Il l'est. `fileId=1 pathId=2295` →
> `sharedassets1.assets:2295`, un `GameObject` complet, résolu du premier coup
> dès qu'on le lui demande.

C'est la même erreur que [`47`](47-effets-image.md) (un commentaire n'est pas un
lecteur) et [`50`](50-regard.md) (une traduction n'est pas une absence), commise
cette fois **sur le dénominateur** : on mesurait bien, sur la mauvaise moitié du
jeu.

## Le compte, refait sur tous les fichiers

```
OW_BUILD=… node scripts/recensement.mjs
```

| | classes | instances |
|---|---|---|
| posées, **tous fichiers** | **295** | **1 451** |
| dont dans `level0` | 275 | 1 390 |
| dont **ailleurs** | 37 | **61** |
| lues par le moteur | 208 | 1 238 |
| lues par un motif | 67 | 175 |
| **lues, en tout** | **275** | **1 413 — 97,4 %** |
| extraites, non lues | 5 | 20 |
| sans aucun lecteur | 15 | 18 |

Le pourcentage a **baissé** en devenant juste — 97,6 % sur la mauvaise moitié,
97,4 % sur les deux. C'est la troisième fois que ce recensement se corrige à la
baisse, et la troisième fois que la correction vaut mieux que le chiffre.

Les vingt classes posées hors de `level0` :

| | où | |
|---|---|---|
| les huit de la sonde | `sharedassets1` | `ProbeAnchor`, `ProbeCollider`, `ProbeLantern`, `ProbeScanner`, `ProbeHorizonTracker`, `ProbeCamera`, `ProbeGUI`, `ProbeDestructionMessenger` |
| ses six détecteurs | `sharedassets1` | `AlignWithFluid`, `AsymmetricFluidDetector`, `GuidanceFluidDetector`, `InterferenceDetector`, `HighSpeedCollisionSensor`, `ProbeInfo` |
| dix `SelfDestruct` | les deux | chacun son délai, de 1 à 8 secondes |
| le météore | `sharedassets1` | `TouchExplosive`, `IgnoreInitialCollisions` |
| `HideInMapView` | `resources` | sur `DistantSupernova` |
| `TitleScreenMenu`, `DepthOfFieldScatter` | `mainData` | l'écran-titre |

## La sonde, comme le build la lance

Tout ce qui suit est lu dans l'IL de `ProbeLauncher` et les composants du
préfabriqué. Rien n'est deviné.

### Un bouton, trois gestes

`OWInput` construit **`launchProbe`, `takeSnapshot` et `retrieveProbe` sur le
même canal** — `InputChannels.probe`, le bouton droit de la souris.
`reverseSnapshot` est le seul séparé (`altProbe`, la touche R). L'interaction
entière tient donc sur un bouton :

| état | appui | maintien | relâchement |
|---|---|---|---|
| pas de sonde | commence la charge | charge | **lance** |
| sonde en vol | **photo** | rappel en cours | — |
| sonde plantée | — | **rappel à 0,3 s** | **photo** |

Les trois ne se marchent pas dessus parce qu'à trois dixièmes la sonde n'existe
plus : le relâchement qui suivrait un rappel n'a plus d'appareil à déclencher.

### La charge

```
charge = clamp01((tenu − 0,15) / (1 − 0,15))
vitesse = 40 + charge × 60
```

En deçà de **0,15 s**, la charge vaut *exactement* zéro — et c'est le seul cas
qui déclenche l'autre calcul.

### La pichenette vise une orbite

```
v = sqrt(g · r) × 1,1                      la vitesse circulaire, +10 %
si l'on vise en l'air : v /= cos(angle)    plafonné au double
puis v = min(v, 100)
```

`g` est la norme du champ à l'endroit de la sonde, `r` la distance au centre du
puits. **Une pichenette près d'un gros corps part donc plus vite qu'une charge
moyenne.** Ce n'est pas une incohérence : c'est le geste que le jeu récompense —
jeter la sonde en orbite d'un coup de poignet, et la regarder faire le tour.

### La fenêtre de tir, et ses deux cents mètres

`CheckLaunchWindow` lance un rayon droit devant. S'il touche quelque chose, le
tir est **refusé** (`ProbeLaunchAborted`). La longueur du rayon :

| | |
|---|---|
| `PlayerData.KnowsHowProbesWork` | **5 m** |
| tant qu'on l'ignore | **200 m** |

Le nombre surprend jusqu'à ce qu'on voie à quoi il sert : la première sonde de
la partie est celle qui **apprend le geste**, et le jeu refuse de la laisser
partir dans un mur où elle ne montrerait rien. Debout sur Timber Hearth, à
regarder le sol, la première touche ne fait rien — et c'est voulu.

> Ce comportement a immédiatement fait échouer `15_verify.py`, qui appuyait sur
> la touche et attendait une caméra. Le contrôle avait raison de tomber : il
> décrivait le portage, pas le jeu.

Dans le vaisseau, le tir n'est permis **qu'au poste de pilotage**.

### Le suivi d'horizon

Sur un tir tendu — charge < 0,5, inclinaison entre −10° et +55°, hors du poste,
dans un secteur qui a un rayon d'horizon — la sonde arme un
`ProbeHorizonTracker`. Il vise le **point de tangence** :

```
θ = asin(R / d)          d = distance au centre du secteur, R = rayon d'horizon
cible = (d normalisé × d·cos θ) tourné de θ autour de (d × v)
```

et y va par slerp de 0,1 à chaque pas de physique. Au-delà de `R + 200`, ou en
deçà de `R`, il ne corrige rien. C'est un **pivot de caméra** : il ne touche pas
à la trajectoire, et le portage a failli en faire une force.

### L'ancrage

Deux détections, parce que le build en a deux :

- `OnCollisionEnter` — le collider continu de Unity balaie le **déplacement**.
- `OnImpendingCollision` — `HighSpeedCollisionSensor` regarde **cent mètres
  droit devant** et demande : « ce pas de physique nous ferait-il dépasser le
  point touché ? ». Sur un décor statique, la sonde se pose alors à
  `point − avant × 0,15` — sans ce retrait elle se planterait *dans* la paroi.

Puis, dans l'ordre : le corps devient cinématique, ses colliders passent en
déclencheurs (sauf ceux marqués `ProbeDetector`), les projecteurs s'éteignent,
la boucle de vol s'efface en une demi-seconde, la position d'impact est retenue
en **local** — c'est elle qui fait suivre la sonde quand le corps tourne — et
l'avant est aligné sur **`−normale`** : la sonde plante son **nez dans la
surface**, comme une fléchette.

> D'où les deux caméras. Une fois plantée, la caméra avant filme la roche. La
> caméra arrière, tournée de 180°, est la seule qui montre quelque chose — et
> c'est exactement pourquoi `reverseSnapshot` existe. Le portage ne dessine
> qu'une vue et bascule sur la même commande.

### Le collider qui attend deux dixièmes

`ProbeCollider` naît **désactivé**. À `0,2 s` il s'allume, demande à la physique
d'ignorer le collider du joueur, émet `IgnoreProbeCollider`, et se désactive
lui-même. Sans ce délai, la sonde percute celui qui vient de la lancer.

### La lanterne

`Light.range` du préfabriqué vaut **50** — et ce n'est pas la portée, c'est le
**maximum**. À l'ancrage la lumière s'allume à zéro et monte :

```
portée = 50 × clamp01((t − t_ancrage) / 2)
```

Deux secondes pour éclairer la grotte où l'on vient de jeter la sonde.

### La photo

La définition **fond avec la distance** :

```
taille = 512 − 448 × clamp01((distance − 200) / 800)
```

512 pixels à deux cents mètres, **64 à mille**. Une sonde lointaine ne renvoie
qu'une vignette, et c'est le jeu qui le dit.

### Le marqueur

`ProbeGUI` pose une icône sur l'écran, à la position de la sonde, trente pixels
au-dessus :

| | |
|---|---|
| en vol | `probeLocator` |
| plantée | `probeAnchorIcon` |
| dans un danger | `probeDangerIcon`, et le compteur Geiger tourne |

Le texte est `" 42m"`, puis une ligne par renseignement, et
`"\n Crust Integrity: 87%"` quand la sonde est plantée sur un fragment
cassable. Un dégât de contact tient l'icône rouge **une seconde** — le drapeau
ne retombe pas à la fin du dégât mais à la fin de la seconde.

## Les nombres du préfabriqué

Ils ne sont **pas** dans les MonoBehaviour. `composants.mjs` montre une sonde
vide — quatre pointeurs de son et rien d'autre — parce que la portée de la
lanterne est `Light.range`, le rayon de scan celui d'un `SphereCollider`, et le
champ des caméras `Camera."field of view"`. Un extracteur qui ne lirait que les
scripts conclurait, une troisième fois, que la sonde n'existe pas.

| | |
|---|---|
| `Lantern` | lumière **ponctuelle**, portée 50, éteinte |
| `ForwardCamera` | champ 90°, projecteur spot 600 / 0,7, cookie `Flashlight` |
| `RearCamera` | champ 90°, projecteur spot 600 / **0,5**, tournée de 180° |
| `Collider` | sphère 0,45 |
| `Detectors` | sphère 0,75 |
| `ScanVolume` | sphère **30** |
| `SurveyorProbe` | masse 0,0001, sans gravité, collision **continue** |
| `ProbeAudioLoop` | `alien_geiger_counter`, en boucle, rolloff personnalisé |
| `MapMarker` | `"Probe"`, type 5 — **le quatorzième marqueur du build** |

## Ce que la mesure a corrigé au passage

**Deux contrôles du navigateur étaient rouges depuis un moment, et personne ne
l'avait vu.** `15_verify.py` disait « affectations de shaders **0** » et
« décors vivants rattachés **0** », deux `at_least` dont l'échec ne dit pas
pourquoi. La cause était trois lignes plus haut dans le journal :

```
glTF absent ou illisible: sun_body.gltf Cannot access 'impostures' before initialization
```

`main.js` déclarait `const impostures` **cinq cents lignes après** le rappel de
chargement qui les nomme. Le `const` était donc dans sa zone morte, et **chaque
lot de géométrie mourait dessus** — en silence, parce que le magasin attrape
l'erreur et se contente d'un avertissement. Les shaders du jeu, le rattachement
de la voûte, les décalcomanies et le décor vivant ne s'appliquaient **jamais**.

> Une erreur attrapée et journalisée est une erreur invisible. Les deux zéros
> étaient dans le rapport depuis [`56`](56-impostures.md) — le lot qui a
> introduit la ligne — et les deux `ECHEC` se lisaient comme « pas encore fait »
> plutôt que « cassé ».

**Une frappe plus courte qu'une image était perdue.** Le moteur lit un objet
`keys` à chaque image ; Unity, lui, latche `GetButtonDown` et `GetButtonUp`. Un
appui et un relâchement tombant entre deux images ne laissaient donc aucune
trace — et la sonde, qui se charge en *tenant*, ne partait jamais sur une
pichenette. Les relâchements sont maintenant retenus jusqu'à la fin de l'image.

**Un test gardait une conclusion, encore.** `tests/05-extract.mjs` écrivait, à
propos des trois préfabriqués d'éclaboussure : « c'est le même cas que
`_probePrefab` ». Les éclaboussures sont bien vides — c'est mesuré. La sonde ne
l'était pas, et personne ne l'avait mesurée. Deux champs ne sont pas le même cas
parce qu'ils sont vides tous les deux.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 134** vérifications (`tests/09-jeu.mjs` +79) |
| sur le build | **325** vérifications (`tests/05-extract.mjs` +22) |
| en navigateur, sans le build | 13 contrôles |
| en navigateur, avec le build | **118** contrôles (+6) |
| le pipeline se charge | 38 modules |
| le moteur se **compile** | 67 modules |

Les six contrôles neufs du navigateur suivent le geste entier : sans la sonde
rien ne part, une fois ramassée elle part, il n'y en a qu'**une**, un second
appui ne fait rien, un maintien la rappelle, la vue se referme.

> Le maintien ne se mesure pas en millisecondes de montre : le seuil est de
> trois dixièmes de temps **simulé**, et une image plafonne à 0,05. Sous
> swiftshader, où une image peut durer une seconde, trois dixièmes de jeu
> demandent plusieurs secondes de montre. Le contrôle attend donc l'état plutôt
> qu'un délai ; le chiffre, lui, est gardé par `tests/09-jeu.mjs`.

## Les outils

`scripts/recensement.mjs` lit désormais les cinq fichiers, et distingue les
instances de `level0` de celles d'ailleurs. `--level0` retrouve l'ancien compte,
pour comparer.

`tools/16_unity_types.py` sort quatre classes de plus, et c'est le lot suivant
qui les demande : `TimeManager` (le pas de physique fixe), **`InputManager` (les
liaisons de touches du jeu)**, `PhysicsManager`, `TagManager` (les noms de
balises et de calques que `LayerMask.NameToLayer` cherche partout dans l'IL).
Elles sont toutes les quatre dans `mainData`, et c'est encore pour cela qu'on ne
les lisait pas.

## La leçon

> Avant de conclure qu'une chose manque au build, vérifier qu'on la lit
> ([`34`](34-actions.md)). Avant de conclure qu'on la lit, la mesurer
> ([`36`](36-audit.md)). Avant de chercher ce qui manque, demander la liste
> ([`45`](45-recensement-mesure.md)).
>
> **Et avant de croire la liste : vérifier qu'elle couvre le jeu entier.**

Un dénominateur faux ne se dénonce pas. Il rend un pourcentage qui monte, une
liste qui rétrécit, et une page qui conclut « c'est le fond du tonneau ». Les
trois étaient vrais. Ils portaient sur `level0`.
