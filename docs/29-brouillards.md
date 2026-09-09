# Les brouillards

Dernier manque visuel des mécaniques déjà portées : Dark Bramble et la lune
quantique fonctionnaient, mais sans leur brouillard.

Le jeu en a **deux**, et il ne les traite pas pareil.

## 1. `FogVolume` + `FogDetector` : du brouillard de rendu

Chaque volume est une sphère qui donne une densité selon la distance ; le
détecteur **somme** les densités de tous les volumes où l'on se trouve, plafonne
le total, et alimente le brouillard exponentiel au carré du moteur.

La décroissance est **cubique**, pas linéaire :

```
t       = 1 − clamp01((distance − rayonIntérieur) / (rayonExtérieur − rayonIntérieur))
densité = densitéExtérieure + (densitéIntérieure − densitéExtérieure) × t³
```

C'est ce cube qui donne l'impression d'un mur plutôt que d'un dégradé : la
densité reste ténue presque jusqu'au rayon intérieur, puis monte d'un coup. Sur
Dark Bramble, mesuré dans le portage :

| distance | 1500 | 1400 | 1350 | 1300 | 1250 | 1200 | 0 |
|---|---|---|---|---|---|---|---|
| densité | 0 | 0 | 0,00016 | 0,00125 | 0,00422 | **0,01** | 0,01 |

À mi-chemin entre les deux rayons, la densité vaut exactement un huitième du
maximum — soit t³ pour t = 0,5.

### Les deux volumes du build

`FogVolume` n'était pas dans la liste de `09_gameplay.py` ; il y est maintenant.
Il n'y en a que deux dans toute la scène :

| position monde | rayons | densité extérieure → intérieure | |
|---|---|---|---|
| (0, 0, 20000) | 1200 → 1400 | 0 → 0,01 | Dark Bramble (`_isBrambleFog`) |
| (0, −10000, 0) | 400 → 500 | 0,01 → 0,005 | dimension derelicte |

Le second **décroît** vers le centre : on traverse un mur pour entrer dans une
poche dégagée. C'est l'inverse du premier, et c'est délibéré.

### Ce que le brouillard entraîne

`FogDetector` plafonne la somme à **0,5**, et bascule le moteur en
`FogMode.ExponentialSquared`. La couleur ne vient pas du code mais des
`RenderSettings` de la scène : un gris moyen `(0,5, 0,5, 0,5)`, avec
`m_FogMode = 3` qui confirme l'exponentiel au carré.

Et `PlayerCameraController.LateUpdate` resserre le plan lointain à **2400**
quand la densité atteint 0,01 — vérifié dans le portage : la caméra passe de
200 000 à 2400 au franchissement du seuil, et revient ensuite.

Le jeu sait aussi provoquer un **éclair** de brouillard (`StartFogFlash`) :
montée cubique puis descente cubique, ajoutées à la densité courante. C'est
porté, et c'est ce qui a servi à vérifier le rendu sans faire les 20 000 unités
jusqu'à Dark Bramble.

## 2. `QuantumFogBoundary` : une coque, pas du brouillard

La lune quantique ne se cache pas derrière du brouillard de rendu mais derrière
un **objet** : une sphère autour du joueur dont seule l'alpha du `_TintColor`
varie. C'est ce qui lui permet d'être franchement opaque, là où un brouillard
exponentiel laisserait toujours deviner quelque chose.

Valeurs lues dans la scène — rayon intérieur **100**, extérieur **110**,
épaisseur de transition **30** :

| distance à la lune | 200 | 145 | 130 | 110 | 100 | 90 | 80 | 70 |
|---|---|---|---|---|---|---|---|---|
| alpha | 0 | 0 | 0,33 | **1** | **1** | 0,67 | 0,33 | 0 |

Opaque dans la coquille de 100 à 110, elle se fond de part et d'autre sur 30
unités. On traverse donc un mur blanc puis on débouche dans le dégagé, la lune
apparaissant d'un coup.

Le franchissement compte aussi pour la mécanique : sortir de la coquille vers
l'extérieur **force l'effondrement** de la lune. Ce n'est donc pas seulement le
regard qui la fait sauter, comme le portage le supposait jusqu'ici — c'est
aussi le fait de quitter son brouillard.

Hors du volume, l'alpha ne se coupe pas : elle descend à 0,5 par seconde.

## Vérification

Le modèle est vérifié **numériquement**, pas en image : atteindre Dark Bramble
demande un vol de 20 000 unités, et la face nuit de Timber Hearth n'offre rien à
embrumer. Ce qui est mesuré dans le navigateur, à zéro erreur :

- la courbe de densité ci-dessus, qui suit la formule du jeu à la cinquième
  décimale ;
- le passage de `scene.fogMode` en `FOGMODE_EXP2` dès que la densité dépasse 0 ;
- le plan lointain qui tombe à 2400 au seuil de 0,01 puis remonte ;
- la courbe d'alpha de la coque quantique, et sa sphère effectivement rendue.

## Un piège de repère

Les volumes sont **fixes dans le monde**, alors que la caméra vit dans le repère
du corps ancré. La conversion doit donc passer par la position **courante** de ce
corps (`anchorPos`), pas par `origin.offset`, qui est figé sur sa position
initiale : le corps ancré orbite, et l'écart aurait dérivé au fil de la boucle.
C'est la même convention que l'audio et les dialogues.

## 3. Ce que le brouillard cache, et ce qui s'y allume

Le brouillard n'est pas qu'un effet : deux composants s'appuient dessus, et sans
eux Dark Bramble n'a aucune tension.

### `FogCloak` — sept objets invisibles hors du brouillard

Les rendus de l'objet sont **désactivés au démarrage** et ne se rallument qu'à
l'entrée dans le brouillard. Sept objets sont concernés : les **quatre
anglerfish**, l'épave du bûcheron, la capsule de sauvetage et un astéroïde.
Sans cela, on voit les prédateurs venir de loin.

Le détail qui compte est `GetAllowChangeState` : un objet ne change d'état que
si l'on est **assez loin** — au-delà de 100 unités dans le brouillard, de 300 en
dehors. Rien n'apparaît ni ne disparaît sous les yeux du joueur ; tant que la
condition n'est pas remplie, le composant reste actif et réessaie à l'image
suivante.

Vérifié : les sept se résolvent dans la géométrie et démarrent masqués, dont les
quatre anglerfish distincts — ils portent tous le même nom de GameObject, on les
départage par leur position.

### `FogLight` — les six lumières, dont quatre sont des pièges

`FogLight` ne dessine pas une lumière mais une **icône à l'écran**, à la
position projetée de l'objet, et seulement tant qu'on est dans le brouillard.
C'est le seul repère de navigation de la zone. Le build en compte six :

| icône | nombre | ce que c'est |
|---|---|---|
| `AnglerfishLure` | **4** | les leurres des prédateurs |
| `EscapePodBeacon` | 1 | la balise de la capsule de sauvetage |
| `WoodsmanBeacon` | 1 | la balise de l'épave du bûcheron |

Quatre lumières sur six sont des pièges, et rien ne les distingue de loin. C'est
tout le principe de la zone, et il tient dans cette répartition.

L'alpha monte et descend à 1 par seconde, plafonnée à **0,8**, selon la ligne de
vue. Le test d'occlusion ne part pas de la lumière mais d'un point avancé de
`_lineOfSightOffset` vers la caméra (10 unités, 50 pour la capsule) et s'arrête
10 unités avant elle : une lumière posée contre une paroi ne se masque pas
elle-même.

Un écart assumé : le portage échelonne ce test sur cinq images, une lumière à la
fois, plutôt que de lancer six rayons par image dans une scène de plusieurs
centaines de maillages. Le fondu, lui, reste continu.

## Ce qui reste
- ~~**`DerelictCloaker`** (2) et les événements `EnterDerelictZone` /
  `ExitDerelictZone`~~ — **portés** : entrer dans la zone **suspend** la mise à
  jour du brouillard, qui garde sa dernière densité au lieu de retomber à zéro.
  C'est ce qui laisse le brouillard sur l'écran alors qu'on vient d'entrer dans
  une poche dégagée. Le rayon vient du collider de la zone.
- La coque quantique est une sphère unie ; le jeu utilise un matériau à
  `_TintColor` dont la texture n'est pas reprise.
