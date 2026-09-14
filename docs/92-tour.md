# La tour de lancement : trois objets, et il en manquait deux

`docs/51-tour.md` avait porté la cabine : sa course de **31,5** unités en
**cinq** secondes, son `SmoothStep`, ses deux clips (`elevatorstart`,
`elevatorstop`), son point d'accrochage. Tout y était, et rien ne bougeait —
`activateControls`, `deactivateControls`, `pressInteract` et `returnToStart`
étaient quatre méthodes écrites, éprouvées, appelées par personne. Quatre des
trente que [`docs/90`](90-methodes.md) venait de trouver.

Ce qui manquait n'était pas dans la cabine. C'était dans `LaunchZone`, à côté :

| objet | forme | ce qu'il fait |
|---|---|---|
| `LaunchTerminal` | sphère 0,42 | la borne qu'on presse |
| `ElevatorController` | sphère **10** | le déclencheur d'en haut |
| `Elevator` | la cabine | ce que le portage avait déjà |

## La chaîne, en entier

```
LaunchTerminal.OnPressInteract :
    si KnowsLaunchCodes() : PlayAffirmativeUISound ; ActivateLaunchTower ;
                            le volume d'interaction se DESACTIVE
    sinon                 : PlayNegativeUISound ; l'interaction se remet a zero

LaunchElevatorController.Start                 : elevator.DeactivateControls()
LaunchElevatorController.OnActivateLaunchTower : elevator.ActivateControls()
LaunchElevatorController.OnTriggerEnter(joueur):
    si elevator.GetTrackPositionFraction() > 0.9 : elevator.ReturnToStart()

Elevator.OnPressInteract : AttachPlayer() PUIS on bascule de bout en bout
```

Quatre choses qui ne se devinaient pas :

**La cabine naît fermée, et c'est le contrôleur qui la ferme.** `Start` appelle
`DeactivateControls` — une ligne, et c'est elle qui fait que la tour n'est pas
ouverte d'emblée. Le constructeur du portage naissait verrouillé de lui-même ;
c'est maintenant le build qui le décide, comme il se doit.

**La borne ne sert qu'une fois.** Le volume d'interaction se désactive après
l'activation. Sans les codes, en revanche, elle se remet à disposition : on peut
revenir.

**Le seuil de 0,9 n'est pas décoratif.** La sphère du contrôleur fait dix
unités, la course trente et une : au pied de la tour on est *dedans*. Sans le
seuil, la cabine repartirait vers le bas dès qu'on s'en approche. C'est le même
genre de garde que le « on ne tire que quand on sait » de la sphère de
l'observatoire ([`docs/91`](91-remise-a-zero.md)).

**`ReturnToStart` ne bascule pas le sens.** `OnPressInteract` fait
`_goingToTheEnd = !_goingToTheEnd` ; `ReturnToStart` pose la cible sans toucher
au drapeau. Conséquence : renvoyée d'en haut par le déclencheur, la cabine
remonte à la pression suivante — elle ne redescend pas. Un portage qui aurait
écrit `returnToStart` comme « aller à zéro » aurait inversé la commande une fois
sur deux.

**`Elevator.OnPressInteract` fait deux choses.** Il accroche le joueur *et* il
lance la cabine. Le portage n'en faisait que la première depuis
[`docs/55`](55-attaches.md) : on montait dans un ascenseur qui restait à quai.

## Le compte

Trente méthodes sans appelant avant ce lot, **vingt-six** après. Les quatre
étaient de la deuxième famille de [`docs/90`](90-methodes.md) — « une transition
du build sans déclencheur dans le portage » — et le déclencheur manquant tenait
en deux objets de la scène qui n'étaient pas extraits.

## Gardé par

- `tests/09-jeu.mjs` — la borne et le déclencheur avec leurs formes, la cabine
  verrouillée qui ne répond pas, la course de cinq secondes, le seuil de 0,9, le
  renvoi d'en haut, et **la pression suivante qui remonte**.
- `tests/05-extract.mjs` — un `LaunchTerminal` de 0,42 et un
  `LaunchElevatorController` de 10 dans la scène.
- `tools/15_verify.py --profil` — la cabine naît verrouillée, la borne refuse
  sans les codes, actionne avec, et la cabine répond ensuite.
