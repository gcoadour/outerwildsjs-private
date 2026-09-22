# Six façons de s'arrêter, trois messages : le bandeau du pilote automatique

[`107`](107-pilote.md) avait remis les quatre messages d'**état** à l'endroit.
Restait la moitié qu'on ne voit qu'en s'arrêtant.

## Le catalogue est complet, l'aiguillage ne l'était pas

`AutopilotGUI` a **dix** messages. Quatre disent ce que le pilote fait, six
disent comment il s'est arrêté :

| événement | texte | couleur | durée |
|---|---|---|---|
| `Update`, matching + flying | `stage 3: firing retro-rockets` | vert | ∞ |
| `Update`, matching seul | `matching target velocity` | vert | ∞ |
| `Update`, liningUp | `stage 1: aligning flight path` | vert | ∞ |
| `Update`, approaching | `stage 2: accelerating towards destination` | vert | ∞ |
| `OnAbortAutopilot`, en vol | `autopilot ABORTED` | **rouge** | 3 s |
| `OnAbortAutopilot`, égalisation | `velocity match ABORTED` | **rouge** | 3 s |
| `OnAlreadyAtDestination` | `too close to target` | **rouge** | 3 s |
| `OnMatchedVelocity` | `velocity match complete` | vert | 3 s |
| `OnArriveAtDestination`, `> 50` | `autopilot complete - undershot target` | vert | 3 s |
| `OnArriveAtDestination`, sinon | `autopilot complete` | vert | 3 s |

Le portage portait le tableau entier, exact, textes et couleurs compris — et
n'en affichait que **trois**. Tout arrêt qui ne venait pas d'un vol abouti
rendait « autopilot ABORTED ». Accorder sa vitesse avec succès affichait donc un
message d'échec en rouge, et « too close to target » figurait au catalogue sans
que rien ne pût l'afficher.

## Ce que chaque issue dit, et qu'on ne devine pas

**`OnAbortAutopilot` lit `IsFlyingToDestination` AVANT que les drapeaux ne
tombent.** Abandonner un vol et abandonner une simple égalisation sont deux
messages différents ; les lire après `Abort()` les aurait confondus, puisque
`Abort` remet les quatre drapeaux à faux d'un coup.

**`OnArriveAtDestination(float écart)` ne nomme que le manque.**

```
if (écart >  50f) "autopilot complete - undershot target"
else if (écart < -50f) "autopilot complete"
else                   "autopilot complete"
```

Les deux dernières branches sont identiques : **le dépassement n'a pas de mot**.
Le build distingue explicitement les trois cas, puis en dit deux pareil. C'est
écrit, c'est reproduit, et c'est dit.

**`OnAlreadyAtDestination` vient d'un refus, pas d'un arrêt.**

```
InitFlyToDestination(frame)
    if (!frame.GetAllowAutopilot()) return false;                    // MUET
    if (|cible - moi| < frame.GetAutopilotArrivalDistance()) {
        OnAlreadyAtDestination(); enabled = false; return false; }   // « too close »
```

Deux refus, et ils ne se ressemblent pas : un référentiel qui n'autorise pas le
pilote **ne dit rien du tout**, tandis qu'une cible trop proche s'annonce en
rouge. Le portage refusait déjà — il ne le disait pas.

## Pourquoi il FAUT six issues

`DisplayMessage(texte, couleur, durée)` pose `_displayDuration` et
`_initDisplayTime`, et `Update` en déduit `_doDisplayReadout`. Les quatre
messages d'état ont une durée **infinie**, et `Update` les repose à chaque image
tant que leur drapeau tient — mais ne les efface **jamais** de lui-même.

Le bandeau ne s'éteint donc que par un message de fin, qui dure trois secondes
puis disparaît. Sans les six, le dernier « stage 2 » resterait à l'écran pour
toujours. Les issues ne sont pas de la décoration : elles sont ce qui ferme le
bandeau.

> Une durée infinie n'est pas « tant que la phase dure ». C'est « jusqu'à ce que
> quelqu'un d'autre écrive ». La différence ne se voit qu'en cherchant qui efface.

## Trois autres classes fermées au passage

- **`PlayerSpawner.Warp`** ne téléporte rien : elle lève `_doWarp`, que
  `FixedUpdate` consomme. C'est la règle d'Unity pour un corps physique, et le
  même report vaut pour les huit touches de débogage d'`Update`.
  **`FindPlanetSpawns`** explique pourquoi `_spawnList` est vide dans la scène :
  la liste est cherchée au réveil, pas sérialisée. Ce module lit les seize
  `SpawnPoint` posés, ce qui est la même liste par l'autre bout.

- **`QuantumObject.CheckVisibility`** est un test de **tronc sur une AABB**, et
  rien d'autre : `TestPlanesAABB(CalculateFrustumPlanes(_activeCam),
  _worldBounds)`. Pas de rayon, pas d'occlusion. Un objet quantique caché
  derrière une planète, un mur ou votre propre vaisseau compte comme **regardé**
  tant qu'il tombe dans le tronc. Se cacher les yeux ne suffit pas ; il faut
  tourner la tête. Et `UpdateBounds` repart de zéro à chaque image pour
  encapsuler tous les rendus enfants : une statue en pièces est « vue » bien
  avant que ses pièces le soient.

- **`AlignPlayerWithField.UpdateDiscreteRotation`** adoucit par un `SmoothStep`
  — pas une rampe — et applique la rotation en **delta** (`AddRotation(courante
  × inverse(précédente))`), si bien que ce que le joueur fait tourner pendant ce
  temps n'est pas effacé. Les deux vivent déjà dans ce portage, par l'autre
  bout : `snapDegrees` porte le même `SmoothStep`, et le repère re-dérivé du
  haut plus `steadyLook` rendent le regard ([`106`](106-redressement.md)).

## Gardé par

- `tests/09-jeu.mjs` — les quatre issues que le portage peut atteindre :
  abandonner un vol, abandonner une égalisation, refuser une cible trop proche
  (et ne pas s'engager), et une égalisation aboutie qui **n'est pas** une
  arrivée.
