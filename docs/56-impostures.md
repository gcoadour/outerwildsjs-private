# Les impostures de planète — le dernier point de rendu, et ce qu'il cachait

C'était la dernière ligne ouverte de [`08-reste-a-faire.md`](08-reste-a-faire.md)
§3, et elle disait ceci depuis [`36-audit.md`](36-audit.md) :

> le jeu affiche un système entier parce que les planètes lointaines sont des
> textures rafraîchies une fois par seconde. Le portage résout le même problème
> autrement — sphères et secteurs — ce qui est légitime, mais le ciel n'y
> ressemble pas.

[`44`](44-reste-a-migrer.md) l'avait chiffrée « coût élevé » et
[`46`](46-migration-lots.md) l'avait laissée de côté. La mesure, faite
maintenant, dit autre chose — et découvre au passage un **défaut visible** que
personne n'avait relié à cette page.

## Sur cinq caméras, deux n'ont pas de plan

```
LODCam_BrittleHollow  → LODPlane_BrittleHollow,  BrittleHollow_Body    câblé
LODCam_DarkBramble    → LODPlane_DB,             DarkBramble_Body      câblé
LODCam_TimberHearth   → LODPlane_TimberHearth,   HomePlanet_graybox    GRAYBOX
GasGiantCam           → aucun plan,              GiantsDeep_Body       mort
HourglassCam          → aucun plan,              aucune planète        mort
```

Deux caméras sur cinq n'ont **pas de plan**, et une troisième vise une **boîte
grise**. Le système n'est pas une technique aboutie qu'il faudrait rattraper :
c'est un **chantier de l'alpha**, à moitié câblé, et deux de ses cinq caméras
sont du décor.

Ce n'est pas une excuse pour ne rien faire — c'est une mesure, et elle change ce
qu'il y a à faire.

## Le défaut visible que cela cachait

Les trois plans câblés sont dans la géométrie exportée, **leur renderer est
actif**, et ils se tournent vers la caméra depuis [`46`](46-migration-lots.md)
(lot 3, `FaceActiveCamera` ×5). Ils sont posés **à la position de leur
planète** :

```
LODPlane_TimberHearth   (0, 0, −8593)      ← là où est Timber Hearth
LODPlane_BrittleHollow  (11691, 0, 0)
LODPlane_DB             (0, 0, 19999)
```

Le portage collait donc **trois quads plats, texturés d'un `*LODMaterial` de
remplissage, par-dessus les vraies planètes**. Une page qui parlait de
performance cachait un défaut de rendu.

C'est le même motif que [`47`](47-effets-image.md) : une conclusion raisonnable
— « le portage résout ce problème autrement » — avait clos la question, et la
question avait deux moitiés.

## Ce qui est porté

Les trois impostures câblées, avec leur loi :

| | |
|---|---|
| `Awake` | texture de rendu **256×256**, posée sur le `_MainTex` du plan ; la caméra est **éteinte** et ne rend que sur commande |
| `Start` | `distance = \|planète − caméra\|`, mesurée **une** fois |
| `Update` | toutes les `_snapshotInterval` (1 s), à partir de `_firstSnapshotTime` |
| `TakeSnapshot` | caméra = `plan.position + plan.avant × distance`, `LookAt(plan)`, puis un rendu |

La caméra se met donc **derrière** le plan, à la distance de la planète, et
regarde vers lui : ce qu'elle capture est la planète qui se trouve au-delà.

**Les premiers rendus sont décalés** — 1 ; 1,3 ; 1,6 — pour que les trois ne
rendent pas la même image. Et `_nextSnapshotTime += _snapshotInterval` : une
image sautée ne **décale** pas les suivantes, ce qui préserve l'étalement.

## Une règle que le build n'a pas

Le plan ne se montre que si la vraie géométrie du corps **n'est pas** chargée.

Le build n'a pas ce test, et n'en a pas besoin : sa planète lointaine n'est pas
en mémoire, il n'a jamais les deux. Ce portage charge la géométrie **par
secteur** et peut parfaitement avoir l'imposture et la planète sous les yeux —
auquel cas l'imposture est un quad plat collé sur une vraie planète.

C'est une ligne ajoutée, elle n'est pas dans le build, et elle est dite.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : deux impostures
câblées sur trois et celle qui vise une boîte grise ; les 256 pixels ; les
premiers rendus décalés ; rien avant l'heure, un rendu à l'heure et pas deux de
suite, puis un par seconde ; le rythme qui reprend **sans dérive** après une
longue absence et rattrape image par image ; le plan qui s'efface quand la vraie
planète est là ; la caméra derrière le plan.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : cinq caméras,
toutes à une image par seconde ; **deux sans aucun plan**, **une sans planète**,
**une visant une boîte grise** ; trois premiers rendus distincts ; et les trois
plans câblés nommés.

## La leçon

> une constante qui se répète n'est pas forcément une constante
> ([`55`](55-attaches.md)) — et **une décision d'architecture n'exempte pas de
> regarder**.

« Le portage résout ce problème autrement » était vrai, bien argumenté, et
tenait depuis [`36`](36-audit.md). Il restait que trois objets du build, que
cette décision rendait inutiles, **étaient quand même dans la scène et quand
même affichés**. Décider de ne pas porter un système ne fait pas disparaître ses
objets : il faut encore aller voir ce qu'ils deviennent.
