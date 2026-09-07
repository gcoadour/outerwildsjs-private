# Le modèle de gravité

Reconstitué à partir de `GravityWell` (10 instances dans `level0`). C'est le
système qui conditionne tout portage : s'y tromper fait diverger les orbites.

## Ce n'est pas une gravitation à N corps

Chaque corps porte un champ **analytique**, et `SingleFieldDetector` retient le
champ **dominant** en un point donné — les champs ne se combinent pas.

Réimplémenter une gravitation newtonienne à N corps donnerait un système qui
dérive en quelques minutes. C'est le piège principal.

> **Correction.** Une version antérieure de ce document affirmait que les
> orbites étaient imposées par la rotation des objets `*_Pivot`. C'est faux :
> ces pivots ne portent qu'un `DisposableContainer`, un simple regroupement,
> et aucune rotation. Les orbites sont réellement simulées — voir plus bas.

## Les quatre zones

Pour une distance `d` au centre du corps :

| Condition | Accélération |
|---|---|
| `d > upperSurfaceRadius` | `g · (R_sup / d) ^ exposant` |
| `d > lowerSurfaceRadius` | `g` (constante dans la coquille) |
| `d > cutoffRadius` | `g · (d − cutoff) / (R_inf − cutoff)` |
| sinon | `0` |

Deux pièges, découverts en confrontant les valeurs extraites au comportement
observé :

**`cutoffRadius` est un rayon interne, pas une portée maximale.** Le jeu le
borne à `min(cutoffRadius, lowerSurfaceRadius)` et s'en sert comme limite basse
d'une rampe linéaire vers le centre. Il n'y a **aucune coupure externe** : le
champ s'étend indéfiniment. L'interpréter comme une portée annule toute la
gravité — les valeurs typiques sont de 0 à 0,1.

**Le falloff est majoritairement linéaire.** `FalloffType` vaut
`{ linear, inverseSquared, constant }`, soit les exposants 1, 2 et 0. Sur les
10 corps, **8 utilisent l'exposant 1**. Seuls le soleil et une lune sont en
inverse du carré. Supposer du 1/r² partout fausse la portée des champs.

Le paramètre est choisi pour assurer la continuité en `d = R_sup`, ce qui permet
d'écrire directement `g · (R_sup / d) ^ exposant` sans passer par la masse.

## Valeurs extraites

| Corps | g surface | R_sup | R_inf | falloff |
|---|---|---|---|---|
| Sun | 100 | 2000 | ~0 | inverse du carré |
| GasGiant | 30 | 750 | 750 | linéaire |
| HomePlanet | 12 | 250 | 200 | linéaire |
| BrittleHollow | 12 | 350 | 0 | linéaire |
| Buried / Revealed | 10 | 200 | 60 / ~0 | linéaire |
| Quantum | 7 | 110 | 0 | linéaire |
| Moon | 5 | 100 | 0 | inverse du carré |
| VolcanicMoon | 5 | 130 | 100 | linéaire |
| Comet | 5 | 110 | 75 | linéaire |

Un `R_inf` nul ou proche de zéro décrit un corps plein ; un `R_inf` égal au
`R_sup` (GasGiant) une coquille sans intérieur jouable. Brittle Hollow, creuse,
se traite via sa rampe interne.

## Implémentation

`web/src/gravity.js` — `fieldStrength()` pour les quatre zones,
`dominantField()` pour la sélection du champ, alignement compris.

## Les orbites

Elles sont **simulées**, pas scriptées. Chaque corps orbitant porte un
`InitialMotion` (14 instances) qui, au démarrage, lui donne une vitesse ; il
suit ensuite le champ de son primaire.

### Le paramètre gravitationnel

L'exposant de falloff vaut 1 pour `linear`, 2 sinon, et le paramètre
gravitationnel en découle :

```
μ = surfaceAcceleration × upperSurfaceRadius ^ exposant
```

C'est ce qui assure la continuité du champ en `d = upperSurfaceRadius`, et ce
qui permet d'écrire l'accélération externe comme `g · (R_sup / d) ^ exposant`
sans jamais manipuler de masse.

### La vitesse orbitale

Pour un satellite à distance `r` de son primaire :

```
v = √( a(r) × r )        perpendiculaire au rayon
```

La direction est `normalize(cross(r, up))`, puis tournée de `_orbitAngle` autour
du rayon — c'est ce qui incline le plan orbital.

Conséquence intéressante du falloff linéaire, qui concerne 8 corps sur 10 :
`a = μ/r`, donc **`v = √μ`, constante quelle que soit la distance**. Seuls le
soleil et une lune, en inverse du carré, donnent le `v = √(μ/r)` keplérien
habituel.

### Paramètres par corps

`InitialMotion` porte, outre le primaire : `_orbitAngle` (position de départ et
inclinaison), `_orbitImpulseScalar` (multiplicateur de la vitesse, 1 partout),
`_initLinearDirection` et `_initLinearSpeed` (vitesse ajoutée, non orbitale), et
`_rotationAxis` / `_initAngularSpeed` pour la rotation propre du corps.

Les vitesses initiales relevées vont de 0,02 à 0,05 rad/s pour la rotation
propre, et jusqu'à 31,65 u/s en vitesse linéaire ajoutée.
