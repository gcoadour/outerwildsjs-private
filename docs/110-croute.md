# Un morceau de croûte ne tombe pas droit

`DetachableFragment` est marquée `@lit` depuis [`46`](46-migration-lots.md), et
le portage en tenait la sélection, la fraction détachable, la chute et la
capture par le trou noir. Il lâchait les morceaux **immobiles** :

```js
vel: [0, 0, 0],   // _escapeFromParentSpeed vaut 0 dans le build
```

Le commentaire était juste, et la conclusion fausse : `_escapeFromParentSpeed`
vaut bien zéro, mais ce n'est pas la seule vitesse que `Detach` donne.

```
DetachableFragment.Detach()
    parent.rigidbody.mass -= _mass;
    self.rigidbody.mass    = _mass;
    Vector3 fuite = _escapeFromParentSpeed
                  * (self.worldCoM - parent.worldCoM).normalized;
    self.SetVelocity(parent.GetPointVelocity(self.worldCoM) + fuite);
    self.SetAngularVelocity(parent.GetAngularVelocity());
```

**`GetPointVelocity(p)`**, d'un corps qui tourne, vaut `ω × (p − centre)`. Le
morceau part donc avec la vitesse que la rotation de la planète lui donnait
juste avant de lâcher — et il s'écarte en spirale au lieu de tomber droit.

## L'unique instance, et ses deux champs nuls

| champ | valeur |
|---|---|
| `_mass` | 100 |
| `_dragFactor` | **0** |
| `_escapeFromParentSpeed` | **0** |
| `_fieldDetection` | 2 (`ParentOnly`) |

Deux des quatre paramètres d'`Init` sont nuls : rien n'éjecte le morceau, rien
ne le freine. Ce qui reste est exactement ce qui manquait.

Le transfert de masse n'a pas d'équivalent ici : ce portage n'a pas de
`Rigidbody` pour la planète, et sa gravité vient d'un champ analytique que cent
unités de moins ne changent pas. C'est dit plutôt que passé sous silence.

> Un champ à zéro ne veut pas dire « rien ne se passe ». Il veut dire « pas
> *ça* ». La ligne d'à côté, elle, faisait quelque chose.

## Gardé par

- `tests/09-jeu.mjs` — la rotation solide : dix unités du centre donnent dix
  unités par seconde, vingt en donnent vingt, un point **sur l'axe** ne part
  pas, un corps fixe lâche ses morceaux immobiles, et la vitesse se mesure
  depuis le centre du corps et non depuis l'origine.
