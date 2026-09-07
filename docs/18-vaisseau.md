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

## Ce qui manque

- **La courbe exacte est une reconstruction.** Le build donne les seuils, pas
  la fonction qui les relie. La mienne est linéaire entre le seuil léger et la
  mort instantanée, avec un facteur de sévérité au passage du seuil moyen.
- **Les dégâts localisés.** `_damageLocationMask`, `_genericPartImpactModifier`
  et `_enginePartImpactModifier` (tous à 0 dans le build) prévoient des dégâts
  par pièce, et `_disableDamagedThrusters` la perte de réacteurs.
- **Pas de destruction.** À 0 % d'intégrité le vaisseau continue de voler.
- **Pas de sélection de cible** par l'interface : le pilote automatique
  s'engage par programme, faute de carte.
