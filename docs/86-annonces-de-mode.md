# Faire la bonne chose sans jamais dire celle du jeu

`web/src/modes.js` ([`docs/70`](70-modes.md)) reproduit fidèlement `OWInput` :
les dix ensembles de canaux, la case de sauvegarde qui n'est pas une pile, les
deux modes qui ne sauvegardent pas, l'ensemble vide de la mort. Tout y est —
sous les noms du portage. `modes.entre("carte")`, `modes.sort("vaisseau")`.

Le build, lui, ne parle pas de « carte » ni de « vaisseau ». Il parle de
**dix-neuf chaînes**, abonnées d'un bloc dans `OWInput.AddListeners`, et chacune
porte le nom de la méthode qui la traite :

```
EnterSatelliteCameraMode   ->  OnEnterSatelliteCameraMode  ->  _satelliteCamInputs
EnterLandingView           ->  OnEnterLandingView          ->  _landingCamInputs
EnterMenuMode              ->  OnEnterMenuMode             ->  _menuInputs
EnterShipComputer          ->  OnEnterShipComputer         ->  _shipComputerInputs
EnterDialogueMode          ->  OnEnterDialogueMode         ->  _dialogueBoxInputs
EnterMapView               ->  OnEnterMapView              ->  _mapInputs
EnterFlightConsole         ->  OnEnterFlightConsole        ->  _shipInputs
EnterRemoteFlightConsole   ->  OnEnterRemoteFlightConsole  ->  _modelShipInputs
EnterTelescopeView         ->  OnEnterTelescopeView        ->  _telescopeInputs
PlayerDeath                ->  OnPlayerDeath               ->  (vide)
```

(plus les neuf `Exit*` correspondants.) **La correspondance est écrite deux fois
dans l'assembly** — une fois dans la table d'abonnement, une fois dans le nom de
la méthode — et une troisième dans le champ qu'elle pose. Rien n'est deviné.

## Pourquoi ce n'est pas qu'un compte

Un événement non nommé n'est pas un manque : c'est ce que
[`docs/65`](65-onde.md) avait établi, et c'était exactement le cas ici — dix-huit
chaînes absentes de `web/src/` pour une mécanique **entièrement** portée. Le
dénominateur des annonces disait « il reste à lire » là où il n'y avait qu'à
nommer.

Mais nommer n'est pas cosmétique. `Modes.annonce("EnterMapView")` est une entrée
plus sûre que `modes.entre("carte")` : le sens de la transition vient de la
table, pas de l'appelant, et un nom inconnu ne fait rien plutôt que d'entrer
dans un mode inventé. Et surtout, quelqu'un qui cherche `EnterFlightConsole`
dans ce dépôt le trouve désormais — c'est la seule façon de relier ce qu'on lit
dans l'IL à ce qu'on a écrit.

## Ce qui reste attaché à ce fil

`EnterLandingMode` / `ExitLandingMode` ne sont **pas** dans la table : ces
deux-là ne parlent pas des commandes mais de la poussée. `FlightConsole`
les émet quand la caméra d'atterrissage est active et que
`GetAllowLandingMode()` est vrai — un référentiel qui autorise l'alignement
automatique, le vaisseau non posé, et une distance sous
`GetAutoAlignmentDistance()` (que le portage extrait déjà, sous le nom
`alignment`).

Ce qu'ils déclenchent est une vraie mécanique, mesurée et pas portée :
`ShipThrusterController` pose `_limitOrbitSpeed`, et la poussée est alors
**écrêtée en tangentiel** :

```
tangentielle   = v_rel - projection(v_rel, radial)
a_tangentielle = a_monde - projection(a_monde, radial)
prevue         = tangentielle + a_tangentielle * dt
si |prevue| > sqrt(g(d) * d) :     # ReferenceFrame.GetOrbitSpeed
    prevue         = normalisee(prevue) * sqrt(g(d) * d)
    a_tangentielle = (prevue - tangentielle) / dt
```

En mode atterrissage, **on ne peut pas accélérer latéralement au-delà de la
vitesse orbitale circulaire locale**. C'est ce qui rend un atterrissage
manœuvrable au lieu d'une mise en orbite involontaire.

Le portage n'a pas de caméra d'atterrissage, donc pas de mode atterrissage, donc
pas d'endroit où appeler cette loi — et une loi sans appelant est précisément ce
que `scripts/lois.mjs` interdit. Elle est donc écrite **ici**, mesurée, et pas
dans `web/src/` : c'est le prochain lot, et il commence par la caméra.

## Gardé par

- `tests/09-jeu.mjs` — dix-neuf annonces, neuf modes dans les deux sens, chaque
  annonce vise un ensemble qui existe, et le refus de sortir du poste sous la
  lunette se comporte pareil par annonce et à la main.
- `tools/15_verify.py --profil` — monter au poste de pilotage annonce
  `EnterFlightConsole`, et l'autopilote répond.
