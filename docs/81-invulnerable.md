# On ne peut pas mourir avant d'être monté dans le vaisseau

```
PlayerData.OnStartOfTimeLoop(n):
    _completedZeroGTraining = false
    _isInvulnerable = false
    si n == 1 ET !KnowsLaunchCodes()  →  _isInvulnerable = true

PlayerData.OnEnterShip:
    _isInvulnerable = false
```

**Pendant la première boucle, tant qu'on ne connaît pas les codes de lancement,
les dégâts ne portent pas.** Et la protection s'arrête à l'instant où l'on monte
dans le vaisseau — le jeu décide qu'une fois aux commandes, on joue pour de bon.

C'est une mécanique entière, invisible, et le portage ne l'avait pas du tout.

## Elle ne protège que des dégâts

Deux méthodes la lisent, et deux seulement :

```
PlayerResources.ApplyInstantDamage:  si !IsInvulnerable → retirer les points
PlayerResources.Update:              si !IsInvulnerable → retirer dégâts/seconde
```

`PlayerDeathHandler.OnTriggerPlayerDeath` **ne la consulte pas**. Tomber dans
l'étoile, se faire écraser par le sable montant, entrer dans un volume de
destruction : tout cela tue quand même, protection ou non.

> Et l'événement de dégât **part de toute façon** : `OnInstantDamage.Invoke` est
> en dehors du test. L'écran clignote, le son se joue, et seuls les points de vie
> ne bougent pas. On *voit* qu'on est touché — on ne meurt simplement pas.

C'est ce qui distingue une protection d'un mode invincible : le joueur apprend
quand même ce qui fait mal.

## Trois photos en l'air, et une sonde qui meurt

```
ProbePromptController.OnProbeDestroyed:
    si !KnowsHowProbesWork ET _midairSnapshotCount > 2
        → FireEvent("CompleteProbeTutorial")

PlayerData.OnCompleteProbeTutorial:
    knowsProbes = true, et on ÉCRIT sur le disque
```

Le savoir ne vient **pas au lancement**. Il vient quand la sonde est **détruite**,
et seulement si l'on a pris **plus de deux** photos en vol d'ici là.

Trois photos en l'air, puis la sonde qui meurt : voilà ce que « comprendre les
sondes » veut dire pour ce jeu. Le portage l'accordait au premier tir — il
suffisait d'appuyer une fois.

## Un savoir qui ne se garde pas

`CompleteZeroGTraining` pose `_completedZeroGTraining`, **un champ statique**, et
`OnStartOfTimeLoop` le remet à faux. Contrairement à `knowsProbes` et
`knowsTelescope`, qui sont écrits sur le disque, celui-là **ne survit pas à la
boucle**.

Réparer le satellite ne se retient que pour le tour en cours. C'est cohérent
avec le reste : la boucle remet le monde à son état de départ, et le satellite
est du monde.

## Un savoir qui n'a pas de source

`CompleteTelescopeTutorial` est **écouté** par `PlayerData` et **émis par
personne**. `CompleteShipProbeTutorial` vient d'un `ProbePromptController_Old`.

[`08`](08-reste-a-faire.md) disait « quatre des cinq savoirs : un seul a une
source vivante ». C'était **trop sévère** : deux en ont une, et elles sont
branchées ici. Le télescope, lui, n'en a effectivement aucune.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 713** vérifications (+13) |
| sur le build | 395 vérifications |
| en navigateur, avec le build | **267** contrôles (+6) |
| en navigateur, sans le build | 13 contrôles |
| annonces nommées | 40 → **43** |

## La leçon

> Les mécaniques qu'on ne voit pas sont celles qu'un portage oublie, et elles
> sont souvent celles qui rendent un jeu jouable.

Rien à l'écran ne dit qu'on est protégé. Rien ne le dit non plus quand la
protection s'arrête. C'est exactement pour cela qu'elle marche — et exactement
pour cela qu'elle ne manquait à personne.
