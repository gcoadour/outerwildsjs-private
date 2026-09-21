# Le prédateur ne va pas droit sur vous — et c'est tout ce qui vous sauve

Le portage déplaçait l'anglerfish **droit vers sa cible**, à une vitesse qui
montait de deux unités par seconde :

```js
this.speed += Math.sign(want - this.speed) *
              Math.min(Math.abs(want - this.speed), this.cfg.acceleration * dt);
const v = [target[0] - this.position[0], ...];
this.position[i] += (v[i] / L) * this.speed * dt;
```

Deux erreurs, et chacune inverse une sensation :

| | le portage | le build |
|---|---|---|
| direction | droit sur la proie — un missile | il **oriente son avant** d'un dixième par pas, et avance dessus |
| montée en vitesse | 2 u/s², donc **21 s** pour atteindre 42 | 2 u/s **par pas de physique**, donc **0,42 s** |

Un prédateur qui vise juste et met vingt et une secondes à démarrer est
exactement l'inverse de celui du jeu : lent à arriver, impossible à semer.

## 1. Il tourne d'un dixième par pas

```
UpdateMovement()
    Vector3 w = OWPhysics.FromToAngularVelocity(transform.forward, vers);
    _anglerBody.SetAngularVelocity(Vector3.zero);
    _anglerBody.AddAngularVelocityChange(w * 0.1f);
    float v = Mathf.Min(bramble.GetRelativeVelocity(angler).magnitude + _acceleration,
                        vitesseMax);
    _anglerBody.SetVelocity(transform.forward * v + bramble.GetVelocity());
```

`SetAngularVelocity(zero)` puis `AddAngularVelocityChange(w * 0.1f)` : rien ne
s'accumule, et appliquer cette vitesse angulaire pendant un pas tourne d'un
**dixième** du chemin restant. Puis il avance **le long de son avant**, pas vers
sa cible.

C'est ce qui le fait dépasser, virer large, repasser. Et c'est ce qui permet de
l'esquiver — le test le mesure : lancé à pleine vitesse sur une proie de côté,
il s'en éloigne à plus de vingt-cinq unités après l'avoir traversée.

## 2. L'angle vient d'un arcsinus, et il a donc un angle mort

```
OWPhysics.FromToAngularVelocity(de, vers)
    Vector3 c = Cross(de.normalized, vers.normalized);
    float angle = Mathf.Asin(c.magnitude);
    return c.normalized * angle / Time.fixedDeltaTime;
```

`Asin(|cross|)`, pas `Acos(dot)`. L'angle **plafonne à quatre-vingt-dix degrés
et redescend au-delà** :

| cible à | angle rendu |
|---|---|
| 45° | 45° |
| 90° | 90° |
| 135° | **45°** |
| 180° (pile derrière) | **0°** |

Une proie exactement dans son dos ne le fait **pas se retourner**. Ce n'est pas
une approximation de lecture, c'est ce que le build calcule — et c'est un angle
mort qui se joue.

## 3. Il accélère en une demi-seconde

`Mathf.Min(magnitude + _acceleration, vitesseMax)` — **sans** `deltaTime`. Deux
unités par seconde ajoutées toutes les vingt millisecondes, soit cent unités par
seconde carrée. Les quarante-deux de la poursuite sont atteintes en **vingt et
un pas**, 0,42 s.

Les deux constantes du build sont par pas ; ce portage les ramène au temps
écoulé, comme `approach` le fait pour la marche ([`36`](36-audit.md) §2.5), ce
qui garde le comportement exact à cinquante hertz sans dépendre de la cadence
d'images.

## 4. Au repos, il ne rentre pas chez lui

```
FixedUpdate()
    if (_currentState != Lurking) UpdateMovement();
    else {
        _anglerBody.SetVelocity(_brambleBody.GetVelocity());
        _anglerBody.SetAngularVelocity(_anglerBody.GetAngularVelocity() * 0.95f);
    }
```

Il s'arrête **net** — sa vitesse devient celle de Dark Bramble — et seule sa
rotation s'éteint, de cinq pour cent par pas. Il attend sur place, là où il a
perdu sa proie. Le portage le ramenait à son point de départ.

## 5. Se faire dévorer ne se défait pas

Le drapeau `caught` était recalculé à chaque image. Tant que le prédateur
*visait* sa proie, il restait dessus et le drapeau tenait. Depuis qu'il la
**dépasse**, il la traverse en une image et s'en éloigne — et la prise
s'annulait toute seule à l'image d'après.

Dans le build, la bouche est un volume de collision : y entrer tue. Le drapeau
se verrouille donc, et seule une nouvelle boucle le rend.

> Une correction peut casser un invariant qui gardait une conséquence de
> l'erreur. Ici « il finit par attraper » ne mesurait pas la prise, il mesurait
> que le prédateur **restait collé** à sa proie — ce qu'il ne fait pas.

## Gardé par

- `tests/09-jeu.mjs` — les quatre angles de l'arcsinus, **l'angle mort à 180°**,
  le dixième par pas, les vingt et un pas de la montée en vitesse (et les vingt
  et une secondes qu'aurait données l'autre lecture), le dépassement mesuré, le
  repos sur place avec sa rotation à 0,95, et la prise qui tient.
