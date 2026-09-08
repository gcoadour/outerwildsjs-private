# Pilote automatique et dégâts du vaisseau

`web/src/autopilot.js`.

## Le pilote automatique

L'`Autopilot` du jeu procède en quatre phases, lisibles à ses drapeaux :
alignement sur la destination, vol, approche, puis égalisation de vitesse avec
le référentiel d'arrivée. Le portage reprend cette décomposition.

La distance de freinage est calculée pour que le vaisseau puisse annuler sa
vitesse avec sa seule poussée avant d'arriver : `v² / 2a`, avec la poussée
réelle de 50.

### Vérifié, trajet vers la lune depuis 3 000 u

| phase | distance | vitesse |
|---|---|---|
| alignement | 3 000 | 2,5 |
| vol | 3 000 | 5,0 |
| **approche** | 1 547 | **375,0** |
| égalisation | 150 | 0,0 |
| arrivé | 150 | erreur **50 u** |

Le basculement en approche à 1 547 u est exactement le point où la distance de
freinage rejoint la distance restante. Le vaisseau atteint 375 u/s en pointe
puis s'arrête net à la surface.

## Les dégâts

Seuils de `ShipDamageController` : impact léger au-delà de **15 u/s**, moyen
au-delà de **30**, intégrité totale **100**, mort instantanée à **300**.

| vitesse d'impact | points perdus |
|---|---|
| 10 u/s | 0 |
| 15 u/s | 0 *(seuil)* |
| 20 u/s | 2,1 |
| 40 u/s | 26,3 |
| 100 u/s | 89,5 |
| 300 u/s | **100** *(destruction)* |

Les dégâts s'appliquent sur la composante **normale** à la surface : raser le
sol à grande vitesse ne coûte rien, c'est la chute qui compte.

## Les dégâts localisés : mesurés plutôt que supposés

`ShipDamageController` porte quatre champs pour des dégâts par pièce, et
`web/src/shipdamage.js` les câble tous les quatre :

| champ | valeur dans le build | effet |
|---|---|---|
| `_damageLocationMask` | **0** | quelles positions peuvent être touchées |
| `_genericPartImpactModifier` | **0** | part des dégâts reportée sur une pièce |
| `_enginePartImpactModifier` | **0** | la même chose pour les réacteurs |
| `_disableDamagedThrusters` | **faux** | une pièce morte coupe son propulseur |

**Le constat vaut le port : avec les valeurs de l'alpha, le vaisseau n'a pas de
dégâts localisés.** Un masque nul ne désigne aucune position, un modificateur
nul ne reporte rien. Seule l'intégrité globale bouge. Ce n'est pas un manque du
portage, c'est l'état du jeu à cette date — la mécanique est câblée, les
réglages ne l'allument pas.

Le mécanisme est porté quand même, et il s'allume dès qu'un masque est déclaré.
Vérifié dans `tests/09-jeu.mjs` : avec masque complet et modificateur 0,5, un
impact à 40 u/s coûte 26,3 points à la coque et 13,2 à la pièce touchée, la
position étant déduite de la normale d'impact exprimée dans le repère du
vaisseau — atterrir dur touche le train d'atterrissage, pas le cockpit.

## La destruction

À 0 % d'intégrité, le vaisseau est **détruit** : plus aucune poussée, et son
pilote meurt avec lui (cause « impact », voir [`32-mort.md`](32-mort.md)). La
boucle le rend entier, comme le reste du monde.

## La limite de poussée du secteur

`PlanetoidSector._thrustLimit` est enfin **appliquée** : 20 partout, 200 sur la
première jumelle, illimitée sur Giant's Deep (voir
[`17-secteurs.md`](17-secteurs.md)). Elle borne la poussée sans jamais
l'augmenter — une limite de 200 sur un moteur qui pousse à 50 ne change rien.

## Ce qui manque

- **La courbe exacte est une reconstruction.** Le build donne les seuils, pas
  la fonction qui les relie. La mienne est linéaire entre le seuil léger et la
  mort instantanée, avec un facteur de sévérité au passage du seuil moyen.
- **Les pièces n'ont pas de géométrie propre** : une pièce morte se lit dans
  l'état du vaisseau, elle ne se voit pas sur sa coque.
- **La sélection de cible** passe par la carte du système (voir
  [`19-carte.md`](19-carte.md)) : cliquer un corps engage le pilote automatique.
  Ce manque-là est comblé.
