# Ce que les fluides font vraiment, lu dans le code du build

Le portage ne connaissait qu'**une** loi de vitesse de fluide : un flux
linéaire, le long d'un `_localLinearFlow` sérialisé. Le build en a **quatre**,
et trois d'entre elles calculent leur direction à partir du point où l'on se
trouve — elles ne sérialisent donc rien qu'un lecteur naïf puisse trouver.

D'où un symptôme qui n'avait pas de cause visible : six volumes portaient
`_flowSpeed` 100, un autre 10, et **aucun ne poussait rien**. Les champs
étaient extraits, lus, rangés — puis annulés par un `flowSpeed: dir ? v.flowSpeed : 0`
qui, faute de direction, concluait à l'absence de courant.

## La méthode : lire l'IL, pas la supposer

`Assembly-CSharp.dll` est dans le build, et
[`pipeline/dotnet/il.js`](../web/src/pipeline/dotnet/il.js) sait déjà parcourir
les corps de méthode — il le fait pour le catalogue des invites à l'écran. Il
suffit de lui demander les quatre `GetPointFluidVelocity`. Ce n'est pas une
décompilation : on lit `ldfld`, `call`, `ldc.r4` et les branchements, et on les
rapproche. C'est étroit, et c'est suffisant pour transcrire une formule.

Aucun `.dll` n'entre au dépôt, et aucune source décompilée non plus : la lecture
se fait sur la copie locale du build, dans `work/`, qui est ignoré.

## Les quatre lois

Toutes partent de la même première ligne — le fluide est solidaire du corps qui
le porte :

```
v = _attachedBody.GetPointVelocity(point)
```

Le portage ancre déjà son repère sur le corps dominant, où ce terme est nul : il
n'est pas transcrit, et c'est un écart assumé, pas un oubli.

### `SimpleFluidVolume` — trois cas selon `_flowType`

```
_flowType == 0   v += transform.TransformDirection(_localLinearFlow.normalized * _flowSpeed)
_flowType == 1   d = point - transform.position ; v -= d.normalized * _flowSpeed
_flowType == 2   d = point - transform.position ; v += d.normalized * _flowSpeed
```

C'est la seule des quatre que le portage connaissait, et seulement dans son
premier cas. Aucun volume du build n'emploie les deux autres ; ils sont portés
quand même, parce qu'ils ne coûtent rien et que la classe les a.

`TornadoFluidVolume` en hérite et n'ajoute qu'une rotation :

```
GetPointFluidAngularVelocity() = transform.TransformDirection(_localRotationAxis).normalized * _angularSpeed
```

### `TornadoBaseFluidVolume` — l'aspiration, six volumes à 100 u/s

```
d = point - transform.position
d -= Vector3.Project(d, transform.up)        // on ne garde que l'horizontale
_flowType == 0   v -= d.normalized * _flowSpeed      // aspire vers l'axe
_flowType == 1   v += d.normalized * _flowSpeed      // repousse
```

La base d'une tornade n'est pas une colonne, c'est une **prise** : une sphère de
65 à 80 unités de rayon qui tire horizontalement vers l'axe, à 100 u/s. C'est
elle qui vous amène jusqu'à la colonne ; la colonne fait le reste. Cinq des six
aspirent, une repousse — celle de la tornade inversée.

Deux détails que la formule impose et qu'une sphère naïve raterait : la traction
est **perpendiculaire à l'axe**, donc sans composante verticale quelle que soit
la hauteur ; et **sur l'axe même**, le vecteur radial est nul et il n'y a
aucune direction — le build ne normalise pas un vecteur nul, il obtient
`Vector3.zero`.

### `TractorBeamFluid` — un seul volume

```
v += transform.up * _flowSpeed                                       // 10 u/s
v += Vector3.Project(transform.position - point, transform.right) * 5
```

Une portance le long du faisceau, et un rappel latéral vers son axe à cinq fois
l'écart. Le rappel ne porte que sur `right`, pas sur les deux axes
perpendiculaires : c'est ce que fait l'alpha, transcrit tel quel.

### `SphereOceanFluidVolume` — l'océan repousse

C'est la loi la plus lourde de conséquences, et elle manquait entièrement.

```
GetPointDensity(point)
    d = point - transform.position
    return |d| < _innerRadius ? _deepDensity : _density

GetPointFluidVelocity(point)
    d = point - transform.position
    t = max(0, (_outerRadius - |d|) / (_outerRadius - _innerRadius))
    if (t > 1) return v                                  // sous le rayon interne
    v += d.normalized * _repelCurve.Evaluate(t) * _maxRepelSpeed
    v += Vector3.Cross(d, transform.up).normalized * _currentSpeed * (1 - t)
```

Valeurs relevées sur le volume de Giant's Deep :

| champ | valeur |
|---|---|
| `_outerRadius` | 500 |
| `_innerRadius` | 440 |
| `_density` | 10 |
| `_deepDensity` | 100 |
| `_maxRepelSpeed` | 250 |
| `_currentSpeed` | 10 |
| rayon du collider | 498 |

Ce que cela donne, mesuré sur le build après portage :

| distance au centre | profondeur | vitesse du milieu | densité |
|---|---|---|---|
| 500 | 0 | 0 | 10 |
| 490 | 8 | 25,0 | 10 |
| 470 | 28 | 99,8 | 10 |
| 450 | 48 | 199,9 | 10 |
| 441 | 57 | 245,0 | 10 |
| **439** | 59 | **0** | **100** |
| 400 | 98 | 0 | 100 |

L'océan **vous rejette**, de plus en plus fort à mesure qu'on descend, jusqu'à
250 u/s à soixante unités sous la surface. Puis, d'un coup, plus rien : sous le
rayon interne on est arrivé, et la densité saute à 100. Le cœur de Giant's Deep
n'est donc pas atteignable en nageant — c'est un choix de conception, et c'est
la raison d'être de la tornade inversée, qui est le seul moyen de franchir les
soixante unités de répulsion.

## Deux corrections qui en découlent

**La densité de l'océan est un palier, pas une rampe.** Le portage
interpolait `_density` vers `_deepDensity` sur tout le rayon : on n'atteignait
les 100 qu'au centre de la planète, et à soixante unités sous la surface le jeu
oppose 100 là où le portage opposait une vingtaine. `GetPointDensity` est un
`if`, pas une interpolation.

**Une direction absente n'annule plus le flux.** `makeVolume` ne remet
`flowSpeed` à zéro que pour la loi linéaire, la seule qui ait besoin d'une
direction sérialisée.

## Ce qui reste ouvert

- Un `SimpleFluidVolume` nommé `FluidVolume` porte `_flowSpeed` 70 et
  `_localLinearFlow` (0,0,1) **sans aucun collider**. Sans volume, on ne sait
  pas où il agit, et le portage l'écarte plutôt que d'inventer une portée.
  `Ship_Body` est dans le même cas et n'en a pas besoin : l'intérieur du
  vaisseau passe par `ship.boarded`.
- Le terme `_attachedBody.GetPointVelocity(point)` n'est pas transcrit, le
  repère ancré le rendant nul. Il cesserait de l'être si le portage rendait un
  jour deux corps en mouvement relatif dans le même repère.
- La rotation des tornades reste portée comme une **vitesse de milieu**
  (ω × r) et non comme un couple appliqué au mobile, ce que fait le build. Le
  tourbillon visible est le même ; la nuance porterait sur la rotation propre
  de l'objet emporté.

## Invariants posés

Dans [`tests/09-jeu.mjs`](../tests/09-jeu.mjs), sans le build : les quatre lois,
l'aspiration horizontale et sa nullité sur l'axe, le rappel du faisceau, la
rampe de répulsion et le palier de densité.

Dans [`tests/05-extract.mjs`](../tests/05-extract.mjs), sur le build : les
formes réelles des volumes à courant (11 capsules, 6 sphères), les quatre
constantes de l'océan, et surtout — **aucun volume portant un `_flowSpeed` ne
reste immobile**. C'est celui-là qui aurait vu le défaut.
