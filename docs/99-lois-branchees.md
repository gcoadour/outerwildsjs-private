# Les vingt lois branchées, et ce qu'elles avaient à dire

[`90-methodes.md`](90-methodes.md) a ouvert le compte des **méthodes** que rien
n'appelle : trente-cinq d'un coup, dont vingt restaient au début de cette série.
Les voici toutes fermées. Ce qui vaut d'être écrit n'est pas le zéro — c'est ce
que chacune disait, et le fait qu'aucune des quatre issues n'ait été la même.

| issue | combien | ce que cela voulait dire |
|---|---|---|
| **branchée** : l'appelant manquait | 12 | la loi était juste, le geste qui l'appelle n'était pas écrit |
| **corrigée** : l'appelant calculait autre chose | 3 | la loi était juste, et l'appelant passait à côté |
| **supprimée** : une meilleure loi l'avait remplacée | 3 | la version courte est restée à côté de la longue, avec l'air d'être juste |
| **marquée `@vide`** : rien à quoi l'appliquer | 1 | le build le dit, pas le portage qui renonce |
| **mesurée** : lue par le contrôle navigateur | 4 | un accesseur écrit pour l'écran, et jamais affiché |

Les trois premières séries sont dans [`97`](97-assise-instantanee.md) et
[`98`](98-flashback.md). Cette page raconte la dernière, et la façon dont le
compte lui-même a dû changer pour l'accepter.

## 1. Le mauvais éclair aux passages de Dark Bramble

`DerelictWarp` ne fait pas clignoter l'écran. Ses deux déclencheurs appellent le
**brouillard** :

```
OnTriggerEnter : _fogDetector.StartFogFlash(0.5f, _warpDuration * 0.5f,
                                                  _warpDuration * 0.5f)
OnTriggerExit  : _fogDetector.StartFogFlash(0.5f, 0f, _warpDuration * 0.5f)
```

Avec `_warpDuration` à 6 : trois secondes pour monter, trois pour redescendre —
et le déplacement tombe **exactement au sommet**, puisque `Update` déplace le
corps à la moitié de la durée. Sur une sortie, la montée est nulle : le
brouillard est déjà dense au moment où l'on bascule.

Le portage jouait à la place `fx.teleport` — l'éclair **bleu** de
`AncientTeleporter.FireTeleporter`, qui appartient à une tout autre mécanique et
vient avec son propre son. Le commentaire de `decor.js` décrivait pourtant la
bonne chose depuis [`73`](73-passages.md) :

> On ne disparaît pas à l'instant où l'on touche le volume — on s'enfonce, le
> brouillard monte, et on est ailleurs.

L'enfoncement était porté ; le brouillard qui monte ne l'était pas.

Une conséquence de forme : l'éclair part à l'**entrée**, trois secondes avant le
départ. Il ne pouvait donc pas être la valeur de retour d'`update()`, qui ne
rend que le départ. `DerelictWarps` les dépose dans une file, comme il dépose
déjà ses annonces.

## 2. La salle s'éteint quand on prend le projecteur

`FadeLight.FadeIntensity` n'a qu'**un seul appelant dans tout le build**, et
c'est le projecteur de l'observatoire :

```
OnPressInteract : _fadeLight.FadeIntensity(0f, 2f)
Update, sur cancel : _fadeLight.FadeIntensity(_initLightIntensity, 2f)
```

On éteint la pièce pour regarder la projection, et on la rallume en sortant.
Deux secondes dans les deux sens. Le portage a les deux consoles déportées
depuis [`30`](30-consoles.md) et n'éteignait rien.

`FadeLight` est posé sur une « Point light » et **ne porte aucun champ** : c'est
donc par sa **position** qu'on retrouve la lumière qu'il commande — le même
recours que pour les vingt-quatre nuages, tous nommés `PieceOfRing`
([`48`](48-ciel-mesure.md)), et pour la même raison : le nom ne désigne rien.

## 3. Trois lois supprimées, et pourquoi c'est la bonne issue

Une loi morte n'est pas toujours un appelant qui manque. Trois fois ici, c'était
une **version antérieure restée à côté de celle qui l'a remplacée** :

- **`Flashlight.promptVisible`** ([`97`](97-assise-instantanee.md)) : quatre
  conditions devinées, là où `CheckPromptStatus` en a sept et où
  `flashlightPromptVisible` les porte toutes depuis [`67`](67-annonces.md).
- **`BlackHole.crustProgress`** : il estimait les fragments détachés à *un quart
  des maillages, au prorata de la boucle*. `crust.js` lit les vrais depuis
  [`15`](15-trounoir.md) — 122 fragments, 72 qui tombent, 50 qui se brisent,
  soit 59 % et non 25. Les deux modèles se **contredisaient**, et la boucle
  lisait le bon.
- **`SpinField.toWorld`** : l'inverse de `toFrame`. La raison de sa mort est
  dans la convention elle-même — **tout vit dans le repère ancré**. `reframe` y
  met les corps, le joueur y marche, Havok y pose ses colliders, et rien n'en
  sort jamais. Un inverse sans sortie répond à une question que ce portage ne
  pose pas.

Le danger de ces trois-là est le même, et il mérite d'être nommé : **une loi
morte a l'air juste**. Elle est écrite, commentée, souvent éprouvée. Celle du
trou noir était fausse de plus du double, et rien ne l'aurait jamais dit.

> Ce qu'une suppression doit rendre : `toWorld` attestait que `toFrame` est une
> **rotation** et dans le bon sens. Le test ne s'appuie plus sur l'inverse mais
> sur la chose elle-même — un quart de tour envoie l'axe X sur `+Z`, un demi-tour
> sur `-X`, et la norme ne bouge pas. On ne supprime pas une garantie avec le
> code qui la portait.

## 4. `@vide` : le scanner de la sonde n'a rien à scanner

`ProbeScanner` est bien posé, sur le préfabriqué de la sonde
(`ScanVolume`, `sharedassets1.assets`). Mais :

- **zéro `PointOfInterest`** dans les cinq fichiers sérialisés ;
- `ProbeScanner.GetClosestPOI` n'est appelé par personne ;
- `PointOfInterest.CaughtOnCamera` a un **corps vide**.

C'est le troisième cas légitime de [`74`](74-etalons.md), et il se marque :
`// @vide aucun PointOfInterest n'est pose dans ce build`.

## 5. Deux branchements qui tenaient en une ligne

- **`Evictor.keep`.** Son constructeur dit « fichiers à ne jamais libérer :
  corps ancré, corps de départ », et on ne lui donnait que le second. Le corps
  ancré était donc compté comme absent, proposé à la libération toutes les
  quarante-cinq secondes, et sauvé à chaque fois par le garde-fou d'`evictFile`
  — qui remettait le compteur à zéro pour recommencer. Le protéger, c'est le
  dire **une fois** au lieu de le refuser sans fin.
- **`FloatingOrigin.toRender`.** Le calcul était recopié à la main à son seul
  endroit utile, écrit à l'envers et par composante.

## 6. La nouvelle partie, et pourquoi c'est un ajout

`PlayerData.wipe` porte `CreateNewPlayerSave`. Dans le build, on ne l'atteint
que par le **menu-titre** : `TitleScreenMenu.ToggleOption` a cinq options, et
son `switch` se lit d'un coup :

| option | ce qu'elle fait |
|---|---|
| 0 | `TriggerLoad(true, false)` — nouvelle partie |
| 1 | `TriggerLoad(false, false)` — continuer |
| 2 | `TriggerLoad(true, true)` — nouvelle partie, **et** les cinq savoirs accordés |
| 3 | ouvre le menu des réglages |
| 4 | `Application.Quit` |

Le portage n'a pas de menu-titre — `SettingsMenu` verrouille sa propre
« Exit to Main Menu » pour exactement cette raison, et le dit depuis
[`30`](30-consoles.md). Le seul menu qu'il ait est celui des réglages.

C'est donc un **ajout**, nommé comme tel, avec une adaptation elle aussi
déclarée : il demande **deux validations** là où le build n'en demande aucune.
Une nouvelle partie qui se choisit depuis un écran-titre et une nouvelle partie
à une touche d'une partie en cours ne sont pas la même chose.

## 7. Les quatre accesseurs, et où ils devaient être lus

`fog.lit`, `lod.waiting`, `sky.cloudCount`, `sky.cloudsAttached` : la famille
que [`90`](90-methodes.md) appelait « une mesure que le moteur tient et que rien
ne lit ». Leur place n'est ni dans un test — `lois.mjs` ne compte pas les tests
comme appelants, et c'est exprès — ni dans une ligne de mise au point. C'est
`tools/15_verify.py` qui les lit maintenant, et chacun garde une chose que rien
ne gardait :

- aucune icône de brouillard allumée au village ;
- le lot protégé de l'éviction n'accumule **jamais** d'absence ;
- les vingt-quatre nuages du build sont **tous** rattachés.

## 8. Le compte a dû changer pour accepter la réponse

`// @mesure` et `// @vide` ne se posaient qu'au-dessus d'un **export**. Depuis
[`90`](90-methodes.md), le compte voit aussi les **méthodes** — mais ses deux
échappatoires, elles, ne les voyaient pas. Une méthode marquée restait donc dans
la liste, et le marqueur mentait.

C'est la même leçon qu'à chaque fois : **les échappatoires d'un compte doivent
couvrir tout ce que le compte couvre.** Sans quoi la seule issue qui reste est
d'écrire un appelant pour le plaisir du chiffre — c'est-à-dire de fabriquer
exactement la dette que le compte cherche.

## 9. Et les jauges, qui sont sur la visière

Ce n'est pas une loi de `lois.mjs` — c'est une classe que le recensement range
depuis longtemps dans « extraites, et que rien ne lit ». En la lisant enfin :

```
HUDCameraScript.OnRemoveSuit          _isHUDOn = false ; _HUDElements.SetActive(false)
HUDCameraScript.OnHelmetHUDActivated  _isHUDOn = true  ; _HUDElements.SetActive(true)
HUDCameraScript.OnChangeGUIMode       le mode caché les efface ; en sortir les rend
                                      à `_isHUDOn`, pas à « visibles »
```

Les jauges d'oxygène et de carburant sont **dessinées sur la visière**. Sans
combinaison — au village, tout le début de la partie — il n'y en a pas.
Le portage les affichait en permanence, casque ôté.

Les deux premiers passent par `GUIMode.IsHiddenMode()` **avant** d'agir : on
n'allume pas des jauges dans un mode qui les cache. Et le troisième restaure
`_isHUDOn` plutôt que « visible », ce qui n'est pas la même chose — sortir du
mode caché sans combinaison ne doit rien rallumer.

## 10. Deux classes lues, et rien à en tirer

Le même passage a tranché deux autres lignes de cette liste, et la réponse est
là aussi une mesure plutôt qu'un renoncement :

- **`LODBiasManager`** (×1) tient une seule ligne :
  `QualitySettings.lodBias = activeCamera.fieldOfView / _normalFOV`. Il
  **annule le zoom de la lunette** pour le niveau de détail : à dix degrés de
  champ, le biais vaut `10/70`, ce qui compense presque exactement le `1/tan`
  que le calcul d'Unity fait entrer. Le portage mesure une hauteur relative
  `rayon / distance`, **sans terme de champ de vision** — donc constante au
  zoom. Le résultat net est le même, et le porter reviendrait à ajouter le
  facteur puis à le retirer.
- **`InertiaTensorCalibrator`** (×14) réaffirme, toutes les cinq à dix secondes,
  la rotation du tenseur d'inertie relevée au démarrage. C'est un contournement
  de PhysX, pas une règle de jeu : Havok ne dérive pas ainsi, et le portage
  n'expose aucune rotation de tenseur. La page [`46`](46-migration-lots.md) le
  disait « satisfait par construction » ; c'est désormais lu plutôt que supposé.

## Où en sont les trois dénominateurs

| | |
|---|---|
| `recensement.mjs` — ce que le build **installe** | 11 classes / 14 instances sans lecteur, sur 295 / 1 451 |
| `evenements.mjs` — ce que le build **annonce** | 79 des 124 nommés |
| `lois.mjs` — ce que le portage **appelle** | **0** |

Le troisième est à zéro pour la deuxième fois de son histoire. La première fois,
il n'y était que parce qu'il regardait ailleurs ([`90`](90-methodes.md)). Celle-ci
se mesure autrement : vingt lois sont passées par les quatre issues ci-dessus, et
douze d'entre elles ont changé quelque chose à ce qu'on voit ou à ce qu'on entend.

> Et la suite est écrite dans la même page : un compte à zéro finit par cesser de
> dire quelque chose. Quand ce sera le cas, il faudra en ouvrir un quatrième —
> comme [`66`](66-allumage.md) l'a fait après le recensement, et
> [`68`](68-lois.md) après les événements.
