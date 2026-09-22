# Le prédateur n'écoute pas ce qu'on croyait : deux seuils, et le plus fort bruit possible vaut exactement dix

`NoiseSensor.ListenForNoises` tient en huit lignes, et le portage en avait
inventé une neuvième à la place des deux vraies.

```
foreach (NoiseMaker n in _noiseMakerList) {
    float vol = n.GetVolume();
    if (vol <= 0f) continue;
    float d = Vector3.Distance(transform.position, n.transform.position);
    if (d < _detectAsTargetRadius) { DetectTarget(n.GetAttachedBody()); return; }
    else if (vol > 10f)            { DetectDisturbance(n.transform.position); return; }
}
```

## 1. Deux seuils, et ils ne sont pas de la même espèce

| | test | ce qui suit |
|---|---|---|
| **cible** | `d < _detectAsTargetRadius` (**200**, sérialisé sur les quatre capteurs) | on vous **poursuit**, vous, le corps |
| **trouble** | `vol > 10f` (**en dur** dans la méthode) | on vient voir **l'endroit** |

**Sous deux cents unités, le volume n'entre pas dans la comparaison.** Pousser
une seconde à un dixième suffit à faire de vous une cible. Le portage exigeait
qu'on soit la source la plus forte.

**Au-delà, la distance n'entre plus du tout.** Un bruit assez fort s'entend de
n'importe où dans le système — mais il ne vaut qu'un trouble : le prédateur va
voir la position, il ne vous suit pas. Le portage n'entendait *rien* au-delà de
deux cents, quelle que soit la force.

## 2. Ce que le portage avait écrit à la place

```js
// une source lointaine s'entend moins qu'une source proche de meme force
const heard = s.level * (1 - d / range);
if (!best || heard > best.heard) best = { ...s, distance: d, heard };
```

Une atténuation par la distance, une comparaison entre sources, et le
maximum retenu — trois lois, dont aucune n'est dans le build. `ListenForNoises`
ne compare rien et n'atténue rien : il **rend à la première source qui
qualifie**. C'est l'ordre d'inscription qui décide.

Et l'invariant qui la gardait — *« la plus proche à force égale l'emporte »* —
était exactement le cas que [`CLAUDE.md`](../CLAUDE.md) nomme : un test qui garde
un **raisonnement** sous les dehors d'un chiffre.

## 3. Dix, c'est précisément le plafond du joueur

```
PlayerNoiseMaker.Update()
    _netVolume  = 0;
    _netVolume += _thrusterModel.GetThrustFraction() * _thrustVolume;      // 5
    _netVolume += (1 - Clamp01((Time.time - _initLaunchTime) / 1f))
                  * _launchVolume;                                          // 5
```

Cinq pour la poussée, cinq pour la sonde, qui retombe en une seconde. Le total
« évident » est donc **dix**, et le seuil est `> 10` — strictement. La branche
du trouble semble morte.

**Elle ne l'est pas, et c'est `GetThrustFraction` qui le dit :**

```
GetThrustFraction()   return _localAcceleration.magnitude / _maxTranslationalThrust;

FireTranslationalThrusters()
    _localAcceleration = _translationalInput * _maxTranslationalThrust;
    _localAcceleration.x = Mathf.Clamp(_localAcceleration.x, -max, max);
    _localAcceleration.y = Mathf.Clamp(_localAcceleration.y, -max, max);
    _localAcceleration.z = Mathf.Clamp(_localAcceleration.z, -max, max);
```

**Chaque axe est borné séparément, pas leur norme.** Pousser sur les trois à la
fois donne `√3 = 1,732`, donc un bruit de poussée de **8,66**. La fraction
dépasse un, et le portage la bornait à un — ce qui rendait le seuil de dix
inatteignable par construction.

Ce qu'il faut donc pour être entendu de l'autre bout du système :

| | volume | > 10 ? |
|---|---|---|
| poussée sur un axe | 5 | non |
| poussée en diagonale pleine | 8,66 | non |
| poussée sur un axe + sonde fraîche | 10 | **non** (`>`, pas `>=`) |
| diagonale pleine + sonde fraîche | jusqu'à 13,66 | **oui**, pendant 0,73 s |

`5f − t > 1` en fraction de poussée `f` et secondes `t` depuis le lancement :
avec `f = 1,732`, la fenêtre dure **0,73 seconde**. Avec `f = 1`, elle est vide.

> La seule façon de se faire entendre de loin est de lancer sa sonde **en
> poussant sur plus d'un axe à la fois**. Rien d'autre n'y arrive, et personne
> ne l'aurait deviné : il a fallu lire la borne par axe pour que le seuil de
> dix cesse d'être décoratif.

## 4. Trois autres classes fermées

- **`CenterOfTheUniverse.RecenterUniverseAroundPlayer`** retranche la position
  de `_centerBody` à chacun de ses enfants directs. Malgré son nom, **le centre
  n'est pas le joueur** — c'est le corps désigné, ce qu'`origin.js` dit depuis
  toujours et que la méthode confirme mot pour mot.

- **`PlayerCharacterController.StickToSurface`** ne colle que si
  `_jetpackModel.GetLocalAcceleration().y <= 0` : **pousser vers le haut
  relâche l'adhérence**, et rien d'autre ne la relâche. C'est ce qui rend le
  décollage possible sans sauter.

- **`ProbeHorizonTracker.TrackHorizon`** s'active et range deux références.
  Une piste qui se ferme à la lecture.

## Gardé par

- `tests/09-jeu.mjs` — le silence, la **première** source inscrite qui l'emporte
  (et non la plus proche), le moindre bruit qui fait de vous une cible sous deux
  cents, cinq d'assez loin qui ne s'entend pas, dix et demi qui s'entend de cinq
  mille, **dix pile qui ne passe pas**, et les quatre combinaisons de volume du
  joueur — dont la seule qui franchit le seuil.
