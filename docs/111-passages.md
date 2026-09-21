# On n'arrive pas quelque part, on y arrive *avec* quelque chose

Les six passages anciens étaient portés : leur fenêtre d'alignement, leur
fenêtre d'occlusion solaire, leur temps de recharge, leur éclair bleu. Arriver
ne posait qu'une chose — la **position** :

```js
player.pos.x = parti.arrival[0] - anchorPos[0];
...
```

`RelocateBody` en pose **trois** :

```
AncientTeleportReceiver.RelocateBody(body)
    body.SetVelocity(_attachedBody.GetPointVelocity(transform.position));
    body.SetPosition(transform.position);
    body.SetRotation(transform.rotation);
```

## 1. La vitesse est celle du point d'arrivée

`GetPointVelocity(p)` du corps auquel le récepteur est **attaché** : on arrive
avec la vitesse que ce point-là a, sur *sa* planète.

Sans elle, on débarque sur une autre planète en gardant la vitesse de celle
qu'on quitte. Les corps du système vont à des centaines d'unités par seconde
les uns par rapport aux autres : on arrive donc à pied sur Brittle Hollow avec
la vitesse orbitale de Timber Hearth, et on part immédiatement à la dérive.

C'est le même `GetPointVelocity` que la croûte qui se détache
([`110`](110-croute.md)) — le build s'en sert partout où un corps change de
parent, et c'est à chaque fois la même omission qui guette : **on pense à
placer, on oublie que placer n'est pas poser**.

## 2. Le regard est celui du récepteur

`SetRotation(transform.rotation)` : on ne débarque pas dans la direction où
l'on marchait, on débarque tourné vers ce que le récepteur regarde. C'est du
cadrage — le jeu vous montre où vous êtes arrivé.

### Ce qu'il a fallu extraire

`_receiver` est résolu par `ownerInfo`, qui rend un nom, une position et un
corps — **pas de rotation**. Le récepteur posé, lui, la porte, à condition que
l'extraction la demande : `AncientTeleportReceiver` rejoint donc
`SpawnPoint`, `ShipBody` et `WhiteHoleVolume` dans `WANT_ROTATION`.

Les deux sont ensuite joints **par la position** : deux récepteurs peuvent
porter le même nom, aucun ne partage un point de l'espace.

### Quatre sur six, et les deux autres

| | |
|---|---|
| `AncientTeleportReceiver` posés | **3**, tous avec leur orientation |
| passages qui y aboutissent | **4** |
| les deux autres | visent `TeleportReceiver_TimeLoop` |

Ces deux-là ne sont pas un oubli : leur arrivée est le récepteur de la **boucle
temporelle**, une autre classe et un autre mécanisme. L'invariant le nomme,
plutôt que de compter quatre sur six et de laisser croire à un trou.

## Gardé par

- `tests/05-extract.mjs` — les trois récepteurs et leurs trois orientations,
  les quatre passages qui arrivent orientés, et le fait que les deux autres
  visent nommément le récepteur de la boucle.
