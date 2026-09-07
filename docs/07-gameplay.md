# Systèmes de gameplay portés

`tools/09_gameplay.py` extrait ce que `07_solar_system.py` ne couvrait pas :
9 systèmes uniques, 39 objets interactifs, 34 objets lisibles, 102 sources
audio, 16 points d'apparition, 14 conversations, 7 secteurs.

Les textes (invites, objets lisibles, dialogues) sont du contenu narratif du
jeu : ils sortent dans `data/`, non versionné, et sont chargés à l'exécution.

## Ressources — `web/src/resources.js`

Constantes réelles de `PlayerResources` :

| grandeur | valeur |
|---|---|
| oxygène | 400 s |
| carburant | 15, recharge 0,75/s |
| santé | 100 |
| intégrité de combinaison | 100 |
| dégâts d'impact | nuls sous 20 u/s, mortels à 40 |

L'oxygène se vide à 1/s hors zone d'oxygène, et se recharge dans le vaisseau.
Sans oxygène, la santé tombe.

## Vaisseau — `web/src/ship.js`

Constantes de `ShipThrusterModel` : poussée **50**, poussée rotationnelle **2**,
traînée angulaire **0,92** — contre **7** pour le sac dorsal
(`JetpackThrusterModel`, avec 12 en poussée verticale de surface). Le vaisseau
est donc sept fois plus puissant et bien plus lourd à tourner.

Sa géométrie était déjà dans `timberhearth_pivot.gltf`, sous
`TimberHearth_Body/ShipContainer/Ship_Body`.

### Les positions enregistrées ne sont pas les positions de départ

La position enregistrée du vaisseau le place à 172 unités du centre de Timber
Hearth, sous la surface. Ce n'est pas une erreur d'extraction : le jeu place
vaisseau et joueur **à l'exécution**, via des composants `SpawnPoint`
(16 instances, un jeu par planète). C'est `SpawnPoint_Ship` qui fait foi.

Le prototype fait apparaître le joueur à 9 unités du vaisseau. Dans le jeu on
démarre au village et on marche jusqu'au vaisseau — ici c'est un raccourci
assumé, les deux points d'apparition étant distants de 471 u.

### Colliders

Le sous-arbre `Ship_Body` est **exclu** des colliders de la planète : le
vaisseau se déplace, et des colliders statiques posés dessus seraient faux dès
le premier mouvement. Le compte passe de 400 à 350.

## Interaction — `web/src/interact.js`

`InteractReceiver` porte une invite et une portée (2 u pour 28 objets, 3 u pour
11). `ReadableObject` porte un texte, résolu depuis son `TextAsset` — les 34 en
ont un. La cible visée est l'objet le plus proche dans sa portée et devant le
regard.

## Le calcul de position monde, corrigé

`09_gameplay.py` sommait au départ les translations locales sans appliquer les
rotations et échelles parentes. Un objet posé à la surface d'une planète tombait
alors à l'intérieur. Le calcul correct, qui compose les quaternions, vivait déjà
dans `07_solar_system.py` : il est désormais dans `lib_ow.py` et partagé par les
deux outils.

## Vérification de la géométrie de collision

Doute levé par la mesure : le joueur se stabilise à 249 u du centre alors que
les points d'apparition sont à 131–168, ce qui laissait craindre qu'il repose
sur une coque d'atmosphère. Répartition radiale réelle des 445 maillages sous
`TimberHearth_Body` :

| rayon | maillages |
|---|---|
| 0–50 | 5 |
| 50–100 | 2 |
| 100–150 | 140 |
| 150–200 | 273 |
| 200–250 | 25 |

Le terrain s'étale bien de 100 à 250 u, et les objets les plus éloignés
(218–238) sont des `PieceOfRing`, de la géométrie solide. Aucune coque parasite.
