# Mécanique de la tour de lancement, ascenseur et interactions de début de partie

Ce document détaille l'audit complet du code C# décompilé de l'alpha 1.2 d'Outer Wilds (`work/game/OuterWilds_Alpha_1_2_Data`), les causes profondes des blocages d'interaction avec l'ascenseur, les boutons et les terminaux, ainsi que les correctifs appliqués pour garantir une parité exacte de gameplay.

---

## 1. Diagnostic de l'ascenseur de la tour de lancement

### Symptômes initiaux
- Impossibilité d'interagir avec la cabine d'ascenseur ou la borne de lancement.
- L'invite « Activate Lift » apparaissait même avant d'avoir appris ou saisi les codes de lancement, mais l'activation restait inopérante.
- Même si la cabine calculait sa course (`fraction` de 0 à 1 et `height` de 0 à 31,5 unités), son maillage 3D dans Babylon.js restait figé en bas de la tour.
- Le joueur attaché au point d'accrochage (`AttachPoint`) ne s'élevait pas avec la cabine car sa position restait ancrée aux coordonnées de repos du pied de la tour.
- Une fois en haut de la tour (si l'on y montait par jetpack), aucune invite « Activate Lift » n'apparaissait pour redescendre, le test de distance échouant à plus de 31 unités.
- Aucun son de démarrage (`elevatorstart`), de boucle (`elevatorloop`) ni d'arrêt (`elevatorstop`) n'était joué.

### Analyse comparative du code C# Unity (`Elevator.cs` & `LaunchElevatorController.cs`)
1. **Verrouillage initial des commandes (`DeactivateControls`)** :
   Dans Unity, `LaunchElevatorController.Start()` appelle `_launchElevator.DeactivateControls()`, qui exécute :
   ```csharp
   _interactVolume.collider.enabled = false;
   ```
   Tant que la tour n'est pas activée par la saisie des codes au terminal, le collider du volume d'interaction est éteint : le joueur ne peut ni viser, ni voir d'invite, ni interagir avec l'ascenseur.
2. **Actionnement de la tour (`OnActivateLaunchTower`)** :
   Lorsque le joueur actionne `LaunchTerminal` en connaissant les codes de lancement (`PlayerData.KnowsLaunchCodes()`), le terminal émet `ActivateLaunchTower`. `LaunchElevatorController.OnActivateLaunchTower()` appelle `_launchElevator.ActivateControls()`, qui rétablit `_interactVolume.collider.enabled = true`.
3. **Hiérarchie de scène et déplacement de la cabine** :
   Dans la hiérarchie Unity d'Âtrebois (`TimberHearth_Body/CraterZone/LaunchZone/ElevatorController`) :
   - Le nœud parent est `Elevator` (portant le script `Elevator.cs`).
   - Ses enfants directs sont `elevator` (le maillage de la cabine), `ElevatorLight` (la source lumineuse) et `AttachPoint` (portant `PlayerAttachPoint` et `InteractZone`).
   - Dans `Elevator.Update()`, la position locale du transform d'`Elevator` est interpolée via `Mathf.SmoothStep` le long de l'axe vertical local par `_trackHeight` (31,5 unités). Tous les nœuds enfants (maillage, lumière, point d'attache et zone d'interaction) se déplacent solidairement avec le parent.
4. **Arrivée en fin de course** :
   Lorsque `fraction >= 1.0` :
   - `_attachPoint.DetachPlayer()` libère immédiatement le joueur.
   - `_interactVolume.ResetInteraction()` réinitialise l'interaction.
   - `audio.Stop()` coupe la boucle sonore et `audio.PlayOneShot(_elevatorStopClip)` joue le son d'arrivée.
5. **Rappel automatique depuis le bas (`LaunchElevatorController.OnTriggerEnter`)** :
   Le contrôleur d'ascenseur possède un `SphereCollider` de 10 unités au pied de la tour. Si le joueur y pénètre alors que `fraction > 0.9` et que l'ascenseur est à l'arrêt, `ReturnToStart()` est appelé pour faire redescendre la cabine automatiquement.

---

## 2. Correctifs apportés au moteur Web

### A. Raccordement du maillage Babylon.js
Dans `web/src/main.js`, chaque instance d'ascenseur retrouve son nœud Babylon `Elevator` dans les entrées géométriques (`geo`) :
```javascript
for (const a of ascenseurs) {
  if (a.node === undefined) {
    a.node = null;
    for (const e of geo) {
      const n = e.nodes.get("Elevator");
      if (n) { a.node = n; break; }
    }
  }
  a.update(now);
  if (a.node) {
    a.node.position.y = a.height;
  }
}
```
L'élévation en translation locale `y` déplace simultanément le maillage de la cabine et ses composants enfants.

### B. Suivi dynamique du point d'accrochage (`AttachPoint`)
Dans `web/src/attach.js`, la méthode `AttachPoints.at(position, tolerance)` a été corrigée pour évaluer la position vivante (`p.live.position`) du point plutôt que sa seule coordonnée de repos :
```javascript
at(position, tolerance = 0.5) {
  let best = null, bestD = tolerance * tolerance;
  for (const p of this.points) {
    const pos = (p.live && p.live.position) || p.position;
    const d = (pos[0] - position[0]) ** 2
            + (pos[1] - position[1]) ** 2
            + (pos[2] - position[2]) ** 2;
    if (d <= bestD) { best = p; bestD = d; }
  }
  return best;
}
```
Dans `web/src/main.js`, à chaque trame, `elAttach.follow(...)` reçoit la coordonnée monde exacte de la cabine en tenant compte du déplacement le long de l'axe vertical d'Âtrebois (`- a.height` sur l'axe Z) et du décalage de corps flottant (`decalageDuCorps`). À l'arrivée en bout de course (`a.arrived`), le joueur est détaché automatiquement et `elevatorstop` retentit.

### C. Zone d'interaction et invite dynamique
Dans `web/src/interact.js`, `Interactables.focus` prend désormais en compte la propriété `disabled` des éléments.
Dans `web/src/main.js` :
- Tant que l'ascenseur est verrouillé (`!a.unlocked`), `zoneAscenseur.disabled = true`, masquant l'invite « Activate Lift ».
- Dès l'ouverture des commandes, `zoneAscenseur.disabled = false` et `zoneAscenseur.world` suit en direct l'altitude de la cabine :
  ```javascript
  zoneAscenseur.world[2] = zoneAscRestPos[2] - a.height;
  ```
  Cela permet au joueur d'interagir avec l'ascenseur aussi bien au rez-de-chaussée qu'au sommet de la tour de lancement, restaurant les allers-retours complets.

---

## 3. Autres interactions et parité de gameplay

### A. Borne de lancement (`LaunchTerminal`)
- `LaunchTerminal` a été intégré au catalogue d'objets interactifs (`Interactables`) dans `web/src/interact.js`.
- Tant que le joueur n'a pas appris les codes de lancement auprès de Cornière (Hornfels), l'interaction produit un son de refus (`PlayNegativeUISound`) et la borne reste à disposition.
- Dès que les codes sont connus (`pdata.knows("knowsLaunchCodes")`), l'invite centrale affiche « Enter Launch Codes ». L'appui émet un bip d'affirmation (`PlayAffirmativeUISound`), déclenche l'événement `ActivateLaunchTower`, déverrouille l'ascenseur et désactive la borne.

### B. Carte de l'observatoire (`ObservatoryMap`)
- L'objet `ObservatoryMap` (« View Solar System ») était présent dans le catalogue mais son interaction était ignorée lors de l'appui.
- Son traitement a été raccordé dans `main.js` : l'appui déclenche `TriggerObservatoryMap` et ouvre la carte du système solaire en mode observatoire, conformément à `MapController.OnTriggerObservatoryMap()`.

### C. Projection du satellite (`ProjectorControls`)
- La console de contrôle du projecteur à l'observatoire (« Establish Satellite Link ») est désormais prise en charge lors d'une interaction directe (touche E ou appui tactile), basculant sur la vue satellite tout en appliquant le fondu de lumière ambiante de deux secondes (`SATELLITE_FADE`).

### D. Enfilage de combinaison (`Gear Up`)
- L'invite « Gear Up » de la cabine du vaisseau est automatiquement masquée une fois la combinaison enfilée (`zoneGearUp.disabled = equipment.suit`), évitant les invites superflues.

---

## 4. Vérification et conformité

Toutes les vérifications automatisées du projet ont été exécutées avec succès :
- `node scripts/check-modules.mjs` : 39/39 modules pipeline, 75/75 modules moteur validés.
- `node scripts/lois.mjs` : 0 loi orpheline (100 % des lois moteur sont appelées).
- `node scripts/check-no-assets.mjs` : 292 fichiers vérifiés, 0 asset volumineux ou binaire interdit.
- `node scripts/run-tests.mjs` : 2 370/2 370 tests réussis à travers les 9 suites unitaires.
- `tests/05-extract.mjs` : 475/475 tests d'extraction conformes au build d'origine.
