# Trou noir de Brittle Hollow

Deuxième mécanique spéciale portée. `web/src/blackhole.js`.

## Les données

| constante | valeur | source |
|---|---|---|
| rayon de capture | **40** | collider déclencheur de `BlackHoleVolume` |
| rayon du trou blanc | 50 | `WhiteHoleVolume._radius` |
| cône de sortie | **60°** | `_exitConeAngle` |
| rayon de débris | 750 | `_debrisRadius` |
| masse d'un fragment | 100 | `MakeChildrenBreakable._mass` |
| fragments de croûte | **122** | enfants des six porteurs |
| dont détachables | **72** | tirage par `_fractionDetachable` |

Le trou noir est au centre de Brittle Hollow ; le trou blanc à
`(−23000, 0, 0)`, à l'autre bout du système. Tomber dans l'un ressort par
l'autre.

Le rayon de capture ne figurait dans aucun champ sérialisé : il fallait aller
le lire sur le `SphereCollider` déclencheur du volume.

## Vérifié

| situation | résultat |
|---|---|
| joueur à 60 u du centre | pas de capture *(au-delà de 40)* |
| joueur à 20 u | capture |
| position de sortie | 60 u du trou blanc, soit rayon × 1,2 |
| angle d'éjection | 19°, dans le demi-cône de 30° |
| croûte à 10 %, 30 %, 60 %, 100 % de boucle | 7, 21, 43, **72** fragments détachés |
| fragments avalés en fin de boucle | 6 |

### Correction : la croûte comptait 122 fragments, pas 100

La version précédente de cette page annonçait « sur 100 fragments candidats, 25
se détachent ». **Les deux nombres étaient faux**, et pour deux raisons
différentes :

- le **100** venait de `_integrity`, qui est une intégrité, pas un compte ;
- le **0,25** venait de `TowerShards`, le plus petit des six porteurs de
  `MakeChildrenBreakable` — il n'a que deux enfants.

Le vrai découpage, compté sur les enfants pourvus d'un `MeshCollider` non
déclencheur :

| porteur | enfants | `_fractionDetachable` | intégrité |
|---|---|---|---|
| `SurfaceShards` | **96** | 0,50 | 100 |
| `TheNarrows` | 8 | 1,00 | 50 |
| `GravityTrail` | 7 | 1,00 | 50 |
| `StalactiteTrail` | 6 | 1,00 | 200 |
| `BridgeShards` | 3 | 1,00 | 100 |
| `TowerShards` | 2 | 0,25 | 100 |
| **total** | **122** | | |

Soit **72 fragments détachables** en moyenne — et 72 exactement dans le portage,
qui tire au sort de façon reproductible plutôt qu'avec `Random.Range`, sans quoi
la croûte se recomposerait autrement à chaque mort.

### Les fragments tombent, maintenant

Un fragment détaché prend la masse 100 et `_fieldDetection = ParentOnly` : il ne
subit **que** la gravité de son corps parent, et tombe donc droit vers le centre
de Brittle Hollow — c'est-à-dire vers le trou noir, qui l'avale à 40 unités.
Sur une boucle complète, 6 y passent.

L'intégration se fait dans le repère **local du conteneur glTF**, où la planète
ne bouge pas : aucune conversion de repère à chaque pas, et le décalage du
floating origin reste porté par le conteneur.

Ce que le build ne donne pas, en revanche, c'est le **calendrier**. Rien dans
l'alpha ne fait s'effondrer la croûte toute seule : `BreakableFragment.AddDamage`
attend un impact, et le trou noir n'endommage rien. La progression au fil de la
boucle est un choix de ce portage, par analogie avec la croissance des ronces de
Dark Bramble. Les fragments, leurs propriétés et leur chute, eux, sont ceux du
jeu.

## Ce qui manque

- **Pas de collision entre fragments**, ni avec le joueur : ils sont intégrés
  hors de Havok, comme les sondes.
- **La traînée n'est pas appliquée.** `_dragCoefficient = 10` est passé à un
  `SimpleFluidDetector`, qui ne freine que dans un fluide ; Brittle Hollow n'en
  a aucun, la valeur reste donc sans effet — ce que le portage reproduit en ne
  freinant pas.
- Le **rendu de la fracture** : `ShatterableFragment` est porté au sens où les
  50 fragments non détachables disparaissent au même rythme que les 72 autres
  tombent — 72 + 50 = les 122 de la croûte, vérifié — mais sans l'effet
  d'explosion. À noter : la branche « éclats de débris » de `Shatter()` est un
  **bloc vide** dans cette alpha (`if (_debrisShardPrefab != null) { }`), il n'y
  a donc rien de plus à porter de ce côté-là.
- ~~**Pas de champ de débris**~~ — **porté**. `_debrisRadius = 750` et la file
  d'attente de croissance (`_growQueue`) disent ensemble que ce qui tombe dans
  le trou noir **ressort au trou blanc**, un morceau après l'autre et non d'un
  coup. Chaque fragment avalé prend la file, et son emplacement dans la sphère
  de 750 unités est tiré de son nom — donc le même d'une session à l'autre,
  sans quoi rien ne serait vérifiable. La cadence, elle, n'est pas dans le
  build : deux secondes par morceau, ce qui met une boucle à faire ressortir
  une croûte entière.
- **Pas d'effet visuel** : ni disparition, ni distorsion. Le
  `_vanishEffectPrefab` référencé n'est pas porté.
- **Le vaisseau n'est pas concerné.** `_onlyAffectsPlayerAndShip` vaut `false`
  dans le build, donc tout devrait être capturé, y compris les fragments.
