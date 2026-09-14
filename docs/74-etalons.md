# Les étalons, les lois vides, et la queue

`lois.mjs` comptait 23 lois sans appelant après [`73`](73-passages.md). Il en
compte **6**. Une partie a été branchée ; le reste a révélé que **le compte
posait une mauvaise question**.

## Toutes les lois ne sont pas faites pour tourner

```js
/** Hauteur d'un saut, pour l'invariant : v² / 2g. */
export function jumpHeight(jumpSpeed, gravity) { … }
```

Le commentaire le dit depuis toujours : **pour l'invariant**. `jumpHeight`,
`terminalSpeed` et `terminalAngularSpeed` sont des **étalons** — les régimes
vers lesquels trois intégrations convergent. Rien ne les appelle parce que rien
ne *doit* les appeler : elles servent à vérifier le moteur **de l'extérieur**,
pas à le faire avancer.

Sans marque, ce compte pousse à leur écrire un appelant pour le plaisir du
chiffre — c'est-à-dire à **fabriquer exactement la dette qu'il cherche**. Elles
portent maintenant `// @mesure`, sur la ligne au-dessus de l'export, comme
`// @lit`.

## Et toutes n'ont pas quelqu'un à qui s'appliquer

Le dépôt a nommé ce cas **trois fois en prose** avant de le nommer dans l'outil :
les dix-huit bouffées de [`46`](46-migration-lots.md), `inheritedAcceleration`
de [`68`](68-lois.md), la lampe des objets quantiques de [`71`](71-quantique.md).

La mécanique est écrite d'après l'IL, elle est éprouvée, et **la liste de ce à
quoi elle s'applique est vide dans ce build**. Ce n'est pas du travail à faire :
c'est une mesure, et c'est le build qui la donne.

`// @vide <raison>` — et le marqueur **exige** une raison d'au moins dix
caractères, pour qu'il ne devienne pas un moyen commode de faire baisser un
chiffre.

> Un compte qui ne distingue pas « pas fait » de « rien à faire » finit par
> mesurer l'obéissance plutôt que le travail.

## Ce qui a été branché

**Les phares du vaisseau.** Le portage n'en avait **aucun**. Six cents unités
partout, `min(limite du secteur, 600)` dans un secteur majeur — et la dimension
abandonnée les bride à **cent**. Piloter dedans se fait donc à la lueur du
tableau de bord, et c'est une des rares choses que le build dit explicitement
d'un lieu.

**La carte suivait une moitié de sa règle.** `markerVisible` portait
`MapMarker.LateUpdate` en entier ; le code de dessin en tenait la moitié à la
main — la distance maximale, et le dixième de pixel autour du joueur. Il lui
manquait :

- le **vaisseau** : un marqueur à moins de dix pixels de lui se masque aussi, et
  sans cela le nom de la planète se pose sur le vaisseau ;
- le marqueur du **joueur**, qui sort avant tous les tests et ne se masque
  jamais ;
- la **zone brouillée**, qui efface tout. On n'a pas de carte dans l'épave, et
  c'est ce qui la rend difficile à quitter.

Le test du dixième de pixel se faisait aussi autour du **centre de l'écran** —
or la carte se déplace, et le joueur n'y est pas toujours au milieu.

**La tempête suit l'entonnoir.** `funnelActive` dit entre quelles minutes de la
boucle l'entonnoir de sable existe. La tempête de [`72`](72-poussiere.md) se
levait sur la seule géométrie du volume, qui, elle, ne bouge pas : traverser
l'endroit où l'entonnoir *sera* levait une tempête. Et s'il se retire pendant
qu'on est dedans, elle tombe.

**`matchedVelocity`**, enfin, était recopiée à la main à son unique point
d'appel.

## Deux lois supprimées plutôt que branchées

`segmentHitsSphere` était la forme **booléenne** d'un test dont `occludes` porte
la forme complète — une sphère lancée, et une profondeur minimale dans
l'obstacle. Une moitié de loi, doublée par la loi entière.

`colliderLODNames` rendait les noms des 21 `ChildColliderLOD`. `colliderLODs`
rend la même liste **avec ce qui la rend utile** : la portée, et qui réveille le
groupe. Le filtre que son commentaire décrivait n'est pas ce que le portage
fait — il construit tout et endort ce qui est loin.

Les trois vérifications de chacune ont été **déplacées** sur la loi vivante,
pas supprimées : ce qui était mesuré l'est toujours.

## Ce qui reste, nommé

Six lois, et chacune est du travail identifié :

| | |
|---|---|
| `ancientProbeAcceleration` | la sonde ancienne : **une** instance dans la scène, que l'extracteur ne collecte pas encore |
| `probePrompts` | les quatre invites de sonde, et leur **angle de regard** |
| `radiationEmitters`, `radiationAt` | huit feux de camp et l'étoile ; le portage chauffe par ses `HeatSource`, et la duplication est connue |
| `zoomArrowFraction` | la flèche du zoom sur sa réglette |
| `selfDestructed` | dix instances, toutes dans des préfabriqués |

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 578** vérifications (+21) |
| sur le build | 371 vérifications |
| en navigateur, avec le build | **228** contrôles (+3) |
| en navigateur, sans le build | 13 contrôles |
| lois sans appelant | **17 → 6**, et les six sont nommées |

## La leçon

> Un outil de mesure qui ne peut dire que « oui » ou « non » finit par obtenir
> des « oui » qui ne valent rien.

`lois.mjs` a trouvé un module mort ([`68`](68-lois.md)), s'est trompé sur les
pages ([`69`](69-assise.md)), a confondu import et appel ([`71`](71-quantique.md))
— et posait, depuis le début, une question trop simple. Les trois corrections
l'ont rendu plus sévère ; celle-ci le rend plus **juste**, ce qui n'est pas la
même chose.
