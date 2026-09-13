# La queue du recensement — et un test qui gardait une erreur

Après les six lots de [`46`](46-migration-lots.md) et les deux pages de rendu
([`47`](47-effets-image.md), [`48`](48-ciel-mesure.md)), ce qui restait n'était
plus une famille mais une **queue** : la moitié des entrées à une seule
instance. Cette page en prend la tête — six classes, 64 instances — et raconte
ce qu'elles ont donné.

Elle contient la plus mauvaise nouvelle de la série : **un test du dépôt gardait
une lecture fausse**, et l'aurait refusée si on avait voulu la corriger.

## La lecture à l'envers

[`18-vaisseau.md`](18-vaisseau.md) et `shipdamage.js` disaient ceci, en toutes
lettres et en gras :

> MESURÉ PLUTÔT QUE SUPPOSÉ : dans ce build, les trois premiers valent **ZÉRO**.
> Un masque nul ne désigne aucune position (…) : avec les valeurs de l'alpha, le
> vaisseau n'a **PAS** de dégâts localisés.

La mesure était juste — `_damageLocationMask` vaut bien 0 — et la conclusion
fausse. L'IL d'`OnImpact` dit ce qu'on en fait :

```
mask |= composant._alertLocation;        // il s'ACCUMULE
si mask a change -> DamageAlert(mask)    // et il part au HUD
```

C'est une **sortie**, pas une entrée. Zéro est l'état d'un vaisseau intact, pas
un interrupteur éteint. Le portage avait donc débranché une mécanique qui
tourne, en lisant un résultat pour une permission.

Et un test en gardait la trace :

```js
check("aucune piece touchee avec les valeurs du build", r.part, 0);
```

Un invariant qui nomme une conclusion plutôt qu'une mesure devient un
**verrou** : celui-ci aurait fait échouer la correction, et poussé à conclure
que c'était la correction qui avait tort. La leçon est en fin de page.

## Le modèle de dégâts, mesuré

Tout, dans `OnImpact` :

| | |
|---|---|
| son | clip moyen au-delà de 30 u/s, léger au-delà de 15, en son flottant 0,1 (10 à 80) |
| la pièce touchée | **la plus proche du point d'impact**, jamais celle qu'une normale désigne |
| combien | **trois pièces abîmées au plus**. Au-delà, la force se partage entre les trois, sans nouvelle victime |
| la force | `100 × (\|v\| − seuil) / (_instantDeathSpeed − seuil)`, retirée de l'intégrité **et** cumulée |
| l'alerte | `mask \|= _alertLocation`, et le HUD la reçoit |
| la réparation | le `RepairVolume` de la pièce s'active — et se **désactive** si le joueur est dans le vaisseau |
| mourir, 1 | `\|v\| > _instantDeathSpeed` (300) |
| mourir, 2 | `\|somme des _totalDamage\| > _shipTotalHealth` (100) |

**Les cinq positions.** `DamageAlertLocation`, lue dans la table Constant :
`Front 1, Top 2, Back 4, Left 8, Right 16`. Ce sont des **drapeaux**, et il n'y
en a que **cinq**. Les six du portage — avec un « bas » à 32 — étaient
inventées, et leurs valeurs ne correspondaient à rien.

**Les dix réacteurs.** `EngineComponent` ×10, chacun sur une `ThrusterLocation`
distincte (`Left`, `FrontLeft`, `TopLeft`, `BottomLeft`, `BackLeft`, et les cinq
de droite), avec `_alertLocation` = Left pour les cinq de gauche et Right pour
les cinq de droite. Sans exception, et un invariant le garde. Leur
`_impactThreshold` vaut **zéro** : n'importe quel choc abîme le réacteur le plus
proche.

C'était le chaînon que `shipdamage.js` annonçait manquant, dans son propre
commentaire : « la correspondance volume → pièce passe par `EngineComponent`,
qui n'est pas lu ».

**Ce qui reste éteint, et pour de bon.** `_genericPartImpactModifier` et
`_enginePartImpactModifier` valent zéro, et **aucune méthode de la classe ne les
emploie**. `_disableDamagedThrusters` vaut faux : dans cette alpha, une pièce
morte ne coupe aucun propulseur. Le mécanisme est porté quand même, et il
s'allume si le drapeau change.

## La carte : treize marqueurs, et leurs vrais noms

Le portage déduisait le type d'un marqueur de la gravité du corps, et affichait
son nom **interne**. Le build les déclare, tous les treize :

```
Comet_Body         ->  The Nomad            VolcanicMoon_Body ->  Devil's Furnace
Moon_Body          ->  Lunar Lookout        FocalBody         ->  Hourglass Twins
OribitingIsland    ->  Giant's Landing      Player_Body       ->  You Are Here
```

« Giant's Landing » n'est même pas un corps : c'est une **île**. Aucune
déduction par gravité ne pouvait la trouver.

Les distances d'affichage viennent de la **table de saut** d'`Awake` — pas de
l'ordre des blocs, qui dit autre chose ([`46`](46-migration-lots.md)) : une
planète à 50 000, une lune à **5 000** seulement, le soleil toujours, ce qui
appartient au joueur en vert à 50 000.

Et trois règles de `LateUpdate` que le portage n'avait pas :

- un marqueur à moins de **dix pixels du joueur** est masqué ;
- à moins de dix pixels du **vaisseau** aussi — le portage ne testait que le
  joueur, et le nom de la planète se posait sur le vaisseau ;
- celui du joueur, lui, **sort avant tous les tests** : il ne se masque jamais
  derrière quoi que ce soit.

## Les tornades penchent

`TornadoPivotController` n'a qu'un champ, `_speed`, et il **n'est sérialisé sur
aucune des six instances** : `Awake` le tire entre 1 et 2 degrés par seconde,
puis fait tourner le pivot d'un angle tiré entre 0 et 360 autour de son axe Y.
Ensuite, à chaque pas :

```
rotation = AngleAxis(_speed × dt, transform.right) × rotation
```

Autour de l'axe **X**, pas de l'axe Y : la tornade ne tourne pas sur elle-même,
elle **bascule**. Ce qui tourne sur soi est la colonne d'air, et sa poussée est
lue depuis [`39-fluides.md`](39-fluides.md).

Les deux tirages sont reproduits : six tornades qui penchent toutes pareil se
verraient. Et comme cinq des six s'appellent `UpTornado_Pivot`, le rattachement
se fait **par position**, comme les nuages de [`48`](48-ciel-mesure.md).

## Ce qu'on mesure pour pouvoir dire non

Deux classes entrent au dépôt **pour être fermées**, chiffres en main.

**`DisposableContainer` ×18.** Leur `Start` tient en une ligne :
`Destroy(gameObject)`. Et les dix-huit ne portent qu'un `Transform` :
`TimberHearth_Pivot`, `Islands`, `Zones`, `ShipContainer`… Ce sont des nœuds de
**rangement d'éditeur**. `Awake` court avant `Start` : ce qui devait être
rattaché ailleurs l'a déjà été, et le conteneur vide se supprime. Ce portage
construit sa géométrie depuis les sous-arbres glTF racinés par nom de corps ;
ces conteneurs n'y apparaissent pas.

**`InertiaTensorCalibrator` ×14.** Il recentre périodiquement la rotation du
tenseur d'inertie d'un `Rigidbody`. Ce portage n'a pas de tenseur d'inertie : sa
rotation de vaisseau est un modèle à lui ([`18`](18-vaisseau.md)). Extrait,
compté, non porté.

Les compter n'est pas un geste vide : sans ce compte, la question se repose à
chaque recensement, et 32 instances restent dans la colonne « à faire » d'une
liste qui n'a rien à faire d'elles.

## Le compte

| | après [`47`](47-effets-image.md) | ici |
|---|---|---|
| lues par le moteur | 103 (695 inst.) | **116** (758) |
| lues par un motif | 63 (172) | 62 (170) |
| extraites, non lues | 32 (343) | 35 (362) |
| **sans aucun lecteur** | **77** (180) | **62** (100) |

`node scripts/recensement.mjs` en redonne la liste à jour.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : les cinq positions
en drapeaux et le choc par en dessous qui compte pour l'arrière ; le masque qui
part de zéro **et s'accumule**, la pièce qui prend sa part et qu'elle n'est pas
nulle ; trois pièces abîmées au plus, la quatrième qui ne prend rien, une déjà
touchée qui peut l'être encore ; la pièce choisie par proximité **et non par la
normale** ; les deux morts — le choc unique et l'usure cumulée — et la coque qui
tient encore quand la pièce est morte ; la réparation qui retire la position de
l'alerte. Pour la carte : les cinq marqueurs et leurs noms, les trois distances,
les deux règles des dix pixels, le joueur qui ne se masque jamais, la zone
brouillée qui masque tout. Pour les tornades : les deux tirages, le rattachement
par position, et la bascule qui déplace l'axe avant.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : treize
marqueurs portant tous un nom de jeu ; dix réacteurs, cinq à gauche et cinq à
droite, chacun sur une buse distincte, **aucun** avec un seuil d'impact ; le
masque à zéro, les seuils 15 et 30, la mort instantanée à 300, et les
propulseurs qui ne se coupent pas ; six pivots dont **aucun** ne sérialise sa
vitesse ; trois suiveurs dont un sans cible ; dix-huit conteneurs jetables et
quatorze calibrateurs d'inertie.

## La leçon

La série en avait six. Celle-ci porte sur les invariants eux-mêmes :

> **un test doit garder une mesure, pas une conclusion.**

`check("aucune piece touchee avec les valeurs du build", r.part, 0)` gardait un
raisonnement — « masque nul donc pas de dégâts localisés » — sous les dehors
d'une mesure. Le chiffre 0 venait bien du build ; le *sens* qu'on lui donnait
venait de nous. Un invariant de cette forme ne protège plus le portage : il
protège l'erreur, et il se défendra contre sa correction.

Les invariants posés ici disent, autant qu'ils le peuvent, ce que le build
**contient** — `_damageLocationMask` vaut zéro, `_impactThreshold` vaut zéro sur
les dix — et laissent le code dire ce qu'il en **fait**.
