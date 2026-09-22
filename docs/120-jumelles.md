# Le sablier ne coulait pas : les jumelles tournent l'une autour de l'autre, et trois mesures le disent

`InitialMotion.CalculateInitVelocity` commence par un terme qui n'a rien
d'orbital, et c'est celui-là que le portage n'avait pas.

```
Vector3 v = _initLinearDirection.normalized * _initLinearSpeed;
if (_primaryBody != null && _primaryBody.GetInitialMotion() != null)
    v += _primaryBody.GetInitialMotion().CalculateInitVelocity();   // RECURSIF
if (_primaryBody != null)
    v += OWPhysics.CalculateOrbitVelocity(_primaryBody, _satelliteBody, _orbitAngle)
         * _orbitImpulseScalar;
return v;
```

Sur les quatorze `InitialMotion` de la scène, **trois n'ont que le premier
terme** — aucun primaire, et une vitesse linéaire de **31,65** :

| corps | `_initLinearDirection` | `_initLinearSpeed` | primaire |
|---|---|---|---|
| `Twin01_Body` | (1, 0, 0) | 31,65 | **null** |
| `Twin02_Body` | (−1, 0, 0) | 31,65 | **null** |
| `SandFunnel_Body` | (−1, 0, 0) | 31,65 | **null** |

Le portage rendait statique tout corps sans primaire. **Les deux jumelles du
sablier ne bougeaient donc pas, et la colonne de sable entre elles non plus.**

## Trois mesures, et elles disent la même chose

Ce n'est pas une déduction : trois relevés indépendants concordent.

**1. La hiérarchie.** Les trois corps pendent sous `FocalBody` :

```
Twin01_Body     -> SolarSystemRoot / HourglassTwins_Pivot / FocalBody
Twin02_Body     -> SolarSystemRoot / HourglassTwins_Pivot / FocalBody
SandFunnel_Body -> SolarSystemRoot / HourglassTwins_Pivot / FocalBody
```

`FocalBody` porte, lui, un `_primaryBody` : c'est **le barycentre qui orbite le
Soleil**, et les jumelles se meuvent dans son repère.

**2. Le chiffre.** Les jumelles sont à **500** unités l'une de l'autre, donc à
250 du barycentre. Le champ de la voisine à 500 unités vaut **4,000** (`10 ×
200 / 500`, falloff linéaire). La vitesse d'une orbite mutuelle circulaire est
donc :

```
v = sqrt(g × r) = sqrt(4 × 250) = 31,62
```

Le build pose **31,65**. Un millième d'écart. Ce n'est pas un réglage de
gameplay, c'est une orbite calculée.

**3. La géométrie.** Prise telle quelle, la direction (1, 0, 0) est **radiale** :
les jumelles sont écartées le long de (−1, 0, −1)/√2 dans le repère du
barycentre, et elles se percuteraient. Mais `_initLinearDirection` est dans le
**repère du corps**, et les trois portent la même rotation — 225 degrés autour
de Y. Tournée, la direction devient (−0,7071, 0, +0,7071) : le produit scalaire
avec l'écart tombe à **zéro à la quinzième décimale**.

> Aucune des trois mesures ne suffit seule. La hiérarchie dit *où* lire le
> mouvement, le chiffre dit *que* c'est une orbite, la géométrie dit *dans quel
> repère*. Ensemble, elles ne laissent qu'une lecture.

## Ce que le portage a dû changer pour le tenir

**Un corps sans gravité reste un corps.** L'extraction n'écrivait un corps que
s'il portait un `GravityWell` ou un `PlanetoidSector`. `FocalBody` n'a ni l'un
ni l'autre — juste un `OWRigidbody` et une `InitialMotion`. Il manquait donc à
`solar_system.json`, et les jumelles n'avaient pas de repère où tourner. Même
trou que les volumes de fluide de Giant's Deep, et il se bouche de la même
façon : une seconde passe, après coup, qui n'écrit que ce que la première n'a
pas vu. **17 corps → 23.**

Un effet de bord le confirme : `MapOpenGL` porte **cinq** pointeurs de corps et
cinq couleurs d'orbite, et `FocalBody` est l'un des cinq
([`100`](100-carte.md)). La carte cherchait donc une couleur pour un corps qui
n'était pas dans sa liste — **l'orbite des jumelles ne se dessinait pas**. Le
build nommait ce corps à deux endroits ; l'extraction n'en sortait aucun.

**L'accélération vient des frères, pas du Soleil.** Au niveau des jumelles, le
champ du Soleil vaut **15,96** contre **4,00** pour la voisine : la règle du
champ dominant, appliquée en monde, les ferait tomber droit dans le Soleil —
elles n'ont aucune vitesse orbitale solaire, puisque `_primaryBody` est nul.
Ce qui s'intègre est donc l'**écart au barycentre**, et le seul champ qui le
change est celui des corps qui partagent ce barycentre. La part solaire est
commune aux deux et déjà portée par l'orbite de `FocalBody`.

**Un corps a plusieurs entrées.** Un puits de gravité et un secteur sont des
*enfants* du corps, et chacun donne une ligne dans `solar_system.json`. Sans
filtre, une jumelle s'attirerait elle-même à distance nulle. L'exclusion se
fait donc sur le nom du corps, pas sur l'entrée.

## Le résultat, mesuré

Quatre révolutions simulées, soit deux cents secondes :

| | |
|---|---|
| écart minimum | **500,0** |
| écart maximum | **500,9** |
| période | **49,73 s** (théorie : `2π × 250 / 31,62` = 49,68 s) |

## Gardé par

- `tests/05-extract.mjs` — les 23 corps et les 13 sans gravité, les jumelles
  sous `FocalBody` sans primaire, leurs 31,65 opposés, l'état « libre » du
  portage, et **l'écart qui tient à une unité près après quatre révolutions**.
  C'est un invariant qui garde une mesure : si le repère, la rotation ou le
  champ des frères se défont, l'écart s'ouvre et le test le dit.
