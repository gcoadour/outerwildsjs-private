# S'asseoir — et le compte qui se mentait à moitié

Trois dénominateurs, et [`68`](68-lois.md) en a ouvert le troisième : **ce que
le portage a écrit, et ce qu'il appelle**. Trente-trois lois restaient sans
appelant. Quatre d'entre elles tenaient ensemble, et elles disaient toutes la
même chose : *le portage ne s'assied nulle part*.

```
attachPoints      les quatre PlayerAttachPoint
interactZones     les sept zones d'interaction — écrites DEUX fois
lockOnTargets     les deux verrouillages de caméra
CameraLock        leur mécanique
```

## Les quatre endroits où le jeu prend le joueur en charge

Les quatre `PlayerAttachPoint` tombent **exactement** sur quatre zones
d'interaction, et la liste se lit toute seule :

| point | invite | verrouille | suit | recentre |
|---|---|---|---|---|
| `FlightConsole` | **Buckle Up** | oui | oui | oui |
| `ShipComputer` | **Boot Up** | oui | oui | oui |
| `AttachPoint` (observatoire) | **Fly Model Ship** | oui | non | non |
| `AttachPoint` (tour) | **Activate Lift** | **non** | non | non |

Le constructeur met les trois drapeaux à vrai ; la scène les contredit, et
c'est elle qui gagne — encore une fois ([`49`](49-queue.md)). Le quatrième est
le plus parlant : monter dans l'ascenseur de la tour de lancement ne vous prend
**rien**. On est porté, et on regarde où l'on veut. C'est ce que veut dire un
ascenseur, et la scène le dit en trois faux.

## S'asseoir prend du temps, et ce temps est une division

```
_turnDuration = Vector3.Angle(joueur.forward, point.forward) / _rotationRate
```

`_rotationRate` vaut 100 — des **degrés par seconde**. Ce n'est donc pas une
durée fixe : c'est une distance angulaire divisée par une vitesse.

> Arriver au poste de pilotage **en lui tournant le dos** prend 1,8 s.
> Arriver **de face** n'en prend aucune.

Puis un `SmoothStep` par-dessus, et un `Slerp` de la rotation locale vers
l'identité. Le portage, lui, basculait `ship.boarded` et collait le joueur trois
unités au-dessus du plancher, à l'image. Une seconde d'écart, comme l'allumage
([`66`](66-allumage.md)) — et la même leçon : **le poids d'un geste est dans sa
durée.**

La caméra suit la même forme, et c'est le même taux :

```
CenterCamera(rate)  ≡  SnapToDegrees(0, 0, rate)
_snapDuration = Sqrt(dx² + dy²) / rate
```

Corps et regard partent donc ensemble et arrivent ensemble. Ce n'est pas une
coïncidence d'implémentation, c'est le même nombre passé aux deux.

## Se lever emporte la vitesse du siège

```
playerOWRigidbody.SetVelocity(attachedOWRigidbody.GetPointVelocity(point))
```

Une ligne, et sans elle rien de ce jeu ne marche : quitter le poste d'un
vaisseau qui file à deux cents unités par seconde vous laisserait **sur place**,
à regarder partir votre vaisseau. C'est la ligne qui rend le fait de se lever en
vol possible — et le portage remettait le joueur quatre unités plus haut, sans
vitesse.

## La lunette suspend l'assise, et en sortir recommence

`OnEnterTelescopeView` met `_matchRotation` de côté, le passe à faux et
**déverrouille** le déplacement. `OnExitTelescopeView` le restaure et rappelle
`InitAttachment` — donc **une nouvelle durée**, tirée de l'angle où l'on se
trouve alors.

Sortir de la lunette ne vous replace pas d'un coup : cela refait le demi-tour,
depuis là.

## `CameraLock` était une paraphrase

La classe existait. Elle interpolait un `progress` de 0 à 1 à `_followRate`, ce
qui a l'air raisonnable — et n'est **rien** de ce que le build fait.

```
versLa   = cible.TransformPoint(_localOffset) - joueur.position
aplati   = versLa - Project(versLa, joueur.up)
angle    = Angle(joueur.forward, aplati) * Sign(Dot(aplati, joueur.right))
joueur.rotation = AngleAxis(angle * _followRate * dt, joueur.up) * rotation
```

Ce n'est pas la caméra qui tourne, c'est le **corps**, en lacet seulement. Le
tangage reste à la main : on peut lever les yeux pendant que le corps s'aligne.
Et la vitesse est proportionnelle à l'écart, donc l'approche est exponentielle —
jamais tout à fait arrivée, et sans à-coup à la fin.

Le zoom n'est pas une interpolation non plus, c'est une **hyperbole** :

| distance | champ de vision |
|---|---|
| ≤ 10 | le champ initial (70°) |
| 20 | 25° |
| ≥ 25 | **20°**, le plancher |

`max(500 / d, 20)`. À vingt-cinq unités on est déjà au plancher : le
verrouillage est une longue-vue autant qu'une visée.

> **Une loi que rien n'appelle n'est pas seulement inutile : elle n'est pas non
> plus vérifiée.** Trois invariants gardaient ce `progress`, verts depuis
> toujours. Ils gardaient une invention. C'est la règle de `CLAUDE.md` — *un
> invariant garde une mesure, pas une conclusion* — sous une forme de plus :
> ici, il ne gardait même pas une conclusion, il gardait une supposition que
> rien ne pouvait contredire.

## Et la même zone lue deux fois

`interactZones` vivait dans `gear.js`, exportée, éprouvée, sans appelant — et
`interact.js` relisait les **mêmes champs** à la main, dix lignes plus bas dans
le dépôt. Deux lectures du même champ divergent tôt ou tard ; celle-ci n'avait
simplement jamais servi. Le module lit maintenant la loi au lieu de la
réécrire.

## Le compte des annonces se mentait de moitié

`scripts/evenements.mjs` date de [`66`](66-allumage.md). Il comparait les 124
chaînes du build au texte de `web/src/`… **sans retirer les commentaires**.

```
avec les commentaires   32 événements « nommés »
sans                    16
```

**La moitié.** `SuitUp`, `RemoveSuit`, `EatMarshmallow`, `TeleportPlayer`,
`StartOfTimeLoop`, `TriggerFlashback` et dix autres n'étaient nommés que dans la
prose qui les explique.

C'est **exactement** l'erreur de [`47`](47-effets-image.md), payée une
quatrième fois — et cette fois dans l'outil écrit pour échapper à l'angle mort
du premier dénominateur.

| | |
|---|---|
| [`47`](47-effets-image.md) | un **commentaire** faisait passer pour lu ce qui ne l'était pas |
| [`65`](65-onde.md) | du **code** faisait sans être nommé, et le compte ne le voyait pas |
| [`68`](68-lois.md) | une **loi éprouvée** avait l'air vivante, et rien ne l'appelait |
| ici | le **compteur** écrit pour éviter le premier piège y est tombé |

`recensement.mjs` retirait les commentaires. `lois.mjs` aussi — il est né avec
la leçon. `evenements.mjs`, écrit entre les deux, ne l'avait pas. La leçon
n'était pas dans la tête de qui l'écrivait ; elle était dans deux autres
fichiers.

### Et un appelant qui n'avait pas la bonne extension

`lois.mjs` déclarait `initGate` mort. `index.html` l'importe et l'appelle en
trois lignes — mais l'outil ne listait que des `.js`. Il lit les pages
maintenant.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 371** vérifications (+58) |
| sur le build | 360 vérifications |
| en navigateur, avec le build | **174** contrôles (+11) |
| en navigateur, sans le build | 13 contrôles |
| lois sans appelant | **33 → 26** |
| annonces nommées | **32 → 16** (le compte, pas le portage) |

Deux exports de `geometry.js` ont été retirés plutôt que branchés :
`loadGeometry` se disait « conservé pour `gltf-viewer.html` », et cette page ne
l'importe pas ; `measureCenter` n'avait aucune justification. Du travail fait
qui ne sert à rien, et qui a l'air d'un actif ([`68`](68-lois.md)).

## La leçon

> Un outil de mesure est du code comme un autre. **Il se trompe, et il se
> trompe en votre faveur.**

Les trois dénominateurs de ce dépôt se sont chacun menti une fois, et chaque
fois dans le sens qui flatte : une classe citée comptait pour lue, un événement
cité comptait pour nommé, une loi éprouvée comptait pour vivante. Le chiffre qui
monte tout seul est le seul qu'il faut aller regarder ([`50`](50-regard.md)).
