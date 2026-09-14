# La sphère de l'observatoire : armée quand on ne sait pas, elle ne tire que quand on sait

`ResetSimulationTrigger` est posé une fois dans la scène, sur l'observatoire de
Timber Hearth : une sphère de **5,196** unités. Son IL tient en trois morceaux,
et chacun pris seul paraît incohérent :

```
Awake                  : collider DESACTIVE
OnStartOfTimeLoop(n)   : si n == 1 ET qu'on IGNORE les codes -> collider active
OnTriggerEnter(joueur) : si on CONNAIT les codes -> TimeLoop.ResetSimulation()
```

Armée quand on ne sait pas, elle ne tire que quand on sait. Lus ensemble, les
trois disent une seule chose : **au premier tour d'une partie neuve, la sphère
attend à l'observatoire qu'on soit allé apprendre les codes de lancement** — et
le pas qui vous y ramène remet la simulation à zéro.

C'est le geste qui fait *commencer* la partie. Et il ne vient pas seul :

| mécanique | ce qu'elle suspend | jusqu'à |
|---|---|---|
| `PlayerData.IsInvulnerable` ([`81`](81-invulnerable.md)) | les dégâts | qu'on monte dans le vaisseau |
| `TimeLoop._preventSupernova` ([`88`](88-boucle.md)) | la fin des temps | qu'on connaisse les codes |
| `ResetSimulationTrigger` (ici) | la simulation elle-même | qu'on revienne avec les codes |

Trois composants, trois fichiers, trois lots — et une seule idée : **l'alpha
refuse de commencer avant que le joueur ait fait le geste qui commence**. Aucune
des trois n'était portée, et aucune ne se voyait depuis les deux autres.

## Ce que `ResetSimulation` fait, et ce que le portage en fait

```
TimeLoop.ResetSimulation :
    _preventSupernova = false
    _startTimeLoopOnReload = false
    FireEvent("ResetSimulation")
    Application.LoadLevel(1)
```

Le rechargement remet `Time.timeSinceLevelLoad` à zéro — c'est ainsi que le
compte à rebours repart — et, `_startTimeLoopOnReload` étant faux, le `Start`
suivant annonce `ResumeSimulation` au lieu de `StartOfTimeLoop`. **C'est la
seule occasion, dans toute la partie, où `ResumeSimulation` part** : la branche
existait dans `timeloop.js` sans que rien ne puisse l'atteindre.

Ce portage ne recharge pas de scène. Il enchaîne les deux : `resetSimulation()`
puis `resume()`, et le dit sur place.

## Deux méthodes de moins dans le compte des lois

`.resetSimulation` et `.resume` figuraient parmi les trente-deux méthodes que
[`docs/90`](90-methodes.md) venait de trouver sans appelant. Elles étaient de la
troisième famille — « une transition du build sans déclencheur dans le
portage » — et le déclencheur manquant était cette sphère. Le compte tombe à
**trente**.

C'est exactement le rendement qu'on espère de ce dénominateur : la loi était
juste, il n'y avait qu'à trouver ce qui l'appelle, et le chercher a fait
découvrir une mécanique entière.

## Gardé par

- `tests/09-jeu.mjs` — les quatre cas d'armement (deuxième tour, premier tour
  avec les codes, premier tour sans, état de naissance), les trois cas de tir,
  et le fait qu'elle ne tire qu'une fois.
- `tests/05-extract.mjs` — une seule sphère, de rayon 5,196, sur Timber Hearth.
- `tools/15_verify.py --profil` — la sphère est montée avec sa forme, et son
  armement s'accorde au tour et aux codes du profil.
