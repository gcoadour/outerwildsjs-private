# Carte du système solaire

`web/src/map.js`. Touche **M**.

## Les données

`MapController` donne les distances de zoom : **40 000** par défaut, minimum
**10 000**. `MapMarker` définit sept types de marqueurs — `Default`, `Planet`,
`Moon`, `Sun`, `Player`, `Probe`, `Ship` — et 13 instances sont posées dans la
scène.

## Le rendu

Vue de dessus en projection orthographique sur le plan XZ. C'est suffisant ici :
toutes les orbites du système sont pratiquement coplanaires — les positions
extraites ont un Y quasi nul sur tous les corps.

La carte trace un cercle d'orbite par corps, un marqueur dimensionné sur le
rayon de surface réel et coloré par type, plus le joueur et le vaisseau.

## Vérifié

| point | résultat |
|---|---|
| ouverture par **M** | 10 corps, 10 marqueurs |
| zoom borné | 10 000 à 120 000 |
| clic sur un marqueur | sélection **et** engagement du pilote automatique |

Le clic ferme la boucle laissée ouverte par `docs/18-vaisseau.md` : le pilote
automatique se déclenchait par programme, faute de moyen de choisir une cible.

## Le déplacement du point visé

**Correction.** J'avais noté qu'il manquait « la rotation libre de la carte ».
En relisant `MapController.Update`, il n'y en a pas : la caméra est ramenée à
chaque image vers le bas — `FromToRotation(forward, Vector3.down)` — et son axe
haut vers `Vector3.forward`. `_rotationRate` ne règle que la vitesse à laquelle
elle s'y installe. **La carte de cette alpha est figée de dessus**, comme la
mienne l'était.

Ce qui manquait réellement est le **déplacement du point visé**, et sa loi est
particulière :

```
_focalOffset.x += axe × _zoomDistance × dt
```

Le déplacement est **proportionnel à la distance de zoom**, ce qui garde une
vitesse constante *à l'écran* quel que soit le niveau de zoom — dézoomer ne rend
pas la carte lente à parcourir. Le portage l'applique en glissant à la souris,
en convertissant les pixels parcourus en fraction d'écran, et **C** recentre.

Le jeu n'attend d'ailleurs le déplacement qu'à mi-transition (`t >= 0.5`), le
temps que le zoom d'entrée se fasse.

## Les marqueurs

**`MapMarker` n'utilise aucune texture.** Son icône est *dessinée* :
`IconGenerator.GenerateSquareBracket(20, 20, blanc)` produit quatre coins en
crochet, d'un pixel de trait, chacun couvrant un quart du côté. Il n'y avait donc
rien à exporter — seulement à redessiner, ce que fait le portage au canevas.

Le reste des règles est aussi net :

| | |
|---|---|
| couleurs | **deux seulement** : blanc par défaut, **vert** pour ce qui appartient au joueur (lui, son vaisseau, sa sonde) |
| libellé | corps **14**, précédé d'une espace |
| distance d'affichage | Soleil toujours ; planète et sonde et vaisseau 50 000 ; lune et défaut 5 000 |
| masquage | à moins de **10 pixels** du centre de l'écran |

La palette colorée que j'avais inventée — soleil orangé, planètes bleutées — était
plus lisible, mais ce n'est pas la sienne. Elle est remplacée par les deux
couleurs du jeu. Le masquage à 10 pixels du centre explique aussi pourquoi le
Soleil disparaît quand la carte est centrée sur lui : c'est voulu, cela évite
d'empiler les marqueurs sur le point visé.

## Ce qui manque

- ~~**Les libellés se chevauchent**~~ — corrigé : ceux qui se gênent sont
  empilés vers le bas, du plus proche au plus loin. Décaler vaut mieux que
  masquer, un nom absent coûtant plus qu'un nom déplacé.

- **Pas de sonde** (`Probe`), ce système n'étant pas porté.
- ~~**`_maxDisplayDistance`** n'est pas appliqué~~ — **appliqué** : une lune
  disparaît de la carte au-delà de 5 000 unités, une planète de 50 000, et le
  Soleil reste toujours visible. La carte se vide donc à mesure qu'on s'éloigne,
  comme dans le jeu.
