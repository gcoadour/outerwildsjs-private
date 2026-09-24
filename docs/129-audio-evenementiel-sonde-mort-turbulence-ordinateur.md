# Retours sonores et capteurs : mort, sonde, modèle, turbulence et supernova

Ce document détaille l'analyse, l'extraction et l'intégration des retours audio et des capteurs sensoriels associés à la sonde de reconnaissance, à la mort du joueur, à la turbulence atmosphérique du vaisseau, au modèle réduit, à l'ordinateur de bord, à la supernova et aux prédateurs de Sombre Ronce dans l'alpha d'Outer Wilds (Unity 4.1 Linux v1.2).

---

## 1. Contexte et constats

L'exploration du comportement du jeu original a mis en lumière plusieurs familles d'événements sensoriels dont la logique physique ou acoustique était incomplète dans le portage :

1. **La mort du joueur (`PlayerDeathAudio`)** : le joueur mourait avec une transition d'écran, mais sans le sifflement d'asphyxie ni le choc d'agonie avec coupure sélective du mixeur audio (`AudioMixer.MixDeath`).
2. **Le lanceur et la caméra de sonde (`ProbeLauncher`, `ProbeCamera`)** : les tirs à basse et haute puissance, le rappel mécanique de la sonde et le déclencheur de l'obturateur photographique n'émettaient aucun son.
3. **La turbulence et les vibrations du vaisseau (`ShipTurbulenceAudio`)** : en vol atmosphérique dense, la coque du vaisseau restait silencieuse au lieu de vibrer et de siffler au-delà des vitesses limites.
4. **L'ordinateur de bord (`ShipComputer`)** : l'accès au terminal du vaisseau manquait de son bip de démarrage rétro.
5. **Le vaisseau modèle réduit (`ModelShipCrashBehavior`, `RemoteFlightConsole`)** : la destruction lors d'un impact violent et la réapparition sur son socle ne déclenchaient ni détonation ni carillon de réinitialisation.
6. **L'explosion de la supernova (`SupernovaVolume`)** : l'effondrement du noyau solaire lors des quinze dernières secondes, l'explosion majeure et l'onde de choc n'étaient pas couplés aux clips sérialisés du volume.
7. **Les réactions acoustiques du cœlacanthe (`AnglerfishAudioController`)** : les grondements de trouble, le cri de ciblage, la boucle de poursuite et la boucle d'attente n'étaient pas synchronisés avec les transitions d'état du prédateur.
8. **Le bruit acoustique du vaisseau (`ShipNoiseMaker`)** : le vaisseau n'émettait aucun bruit capté par les créatures de Sombre Ronce lors des accélérations ou des chocs.
9. **La musique exclusive au vaisseau (`ShipOnlyMusicVolume`)** : la piste d'ambiance spatiale de Sombre Ronce ne tenait pas compte de la condition conjointe de présence dans le volume et de pilotage du vaisseau.

---

## 2. Analyse du bytecode IL et décompilation

L'inspection systématique du bytecode dans `Assembly-CSharp.dll` a permis d'extraire la logique exacte de chaque contrôleur :

### 2.1. Mort du joueur (`PlayerDeathAudio.OnPlayerDeath`)
```text
IL_0000:  ldc.r4   0.2
IL_0005:  stloc.0  // fade
IL_0006:  ldarg.1  // deathType
IL_0007:  ldc.i4.2 // Asphyxiation
IL_0008:  bne.un   IL_0035
IL_000d:  ldarg.0
IL_0014:  ldfld    PlayerDeathAudio::_asphyxiationClip
IL_0019:  callvrt  AudioSource::PlayOneShot
IL_001e:  ldarg.0
IL_001f:  ldfld    PlayerDeathAudio::_asphyxiationClip
IL_0024:  callvrt  AudioClip::get_length
IL_0029:  ldc.r4   0.5
IL_002e:  mul
IL_002f:  stloc.0  // fade = length * 0.5 (~1.5s)
...
IL_006a:  call     Locator::GetAudioMixer
IL_006f:  ldloc.0
IL_0070:  callvrt  AudioMixer::MixDeath
```
- Pour `DeathType.Asphyxiation` (2) : joue `Asphyxiation_Long_2150.wav` et applique un fondu de 1,5 seconde sur le mixeur.
- Pour `DeathType.Energy` (3) ou `Supernova` (4) : joue `InstantDeath2_Long_Ringing_2187.wav` avec un fondu de 0,2 seconde.
- Pour les autres causes (impact, écrasement, digestion) : joue `InstantDeath2_Long_Ringing_2187.wav` avec un fondu de 0,2 seconde.

### 2.2. Turbulence atmosphérique du vaisseau (`ShipTurbulenceAudio`)
`ShipTurbulenceAudio` hérite de `TurbulenceAudio`. Il est activé lors de `OnEnterShip` et coupé lors de `OnExitShip`.
Deux composants coexistent sur `Ship_Body` :
1. `ShipRattleAudio` (vibrations de structure) : clip `Spaceship_RattleLoop_2147.wav`, seuils [40, 60] u/s, `_easeRate` = 0,1, densité maximale = 5.
2. `TurbulenceAudio` (vent atmosphérique) : clip `Atmosphere_High_Ship_2256.wav`, seuils [20, 80] u/s, `_easeRate` = 0,05, densité maximale = 5.

Dans `TurbulenceAudio.Update` :
- Si la vitesse est inférieure à `_lowerSpeedLimit` ou la densité supérieure à `_maxDensity`, le volume cible est 0.
- Sinon, le volume cible vaut `clamp01((speed - lower) / (upper - lower))`.
- Le volume évolue par interpolation linéaire paresseuse (`Mathf.Lerp(volume, target, easeRate)`).

### 2.3. Lanceur et caméra de sonde (`ProbeLauncher`, `ProbeCamera`)
- `ProbeLauncher.LaunchProbe` :
  - Si `_launchCharge <= 0.6` : joue `ProbeLaunch_LowPower_2139.wav`.
  - Si `_launchCharge > 0.6` : joue `ProbeLaunch_HighPower_2258.wav`.
- `ProbeLauncher.Update` :
  - Si la commande de rappel est maintenue 0,3 seconde, joue `ProbeRetrieval_2235.wav`.
- `ProbeCamera.Update` et `SatelliteSnapshotController.RenderSnapshot` :
  - Lors de la prise de vue, joue `cameraShutter01_2236.wav`.

### 2.4. Ordinateur de bord (`ShipComputer`)
- `ShipComputer.EnterShipComputer` : joue `Computer_Interface_Retro_2261.wav`.
- Sélections dans les sous-menus : bip affirmatif si le secteur est exploré, bip négatif sinon.

### 2.5. Modèle réduit (`ModelShipCrashBehavior`, `RemoteFlightConsole`)
- `ModelShipCrashBehavior.OnImpact` : déclenche `ModelShipCrash_Explosion_2185.wav` dès que la vitesse d'impact dépasse 10 u/s.
- `RemoteFlightConsole.RespawnModelShip` : joue `ModelShipRespawn_2188.wav` à volume 0,5 lorsque le joueur appuie sur Annuler alors que le modèle s'est éloigné de plus d'un mètre de son socle.

### 2.6. Supernova (`SupernovaVolume`)
- `OnTriggerSupernova` (contraction et effondrement du noyau solaire) : joue `Supernova_Start2_Longer_2206.wav`.
- `OnSunExploded` (déflagration) : joue `Supernova_Explosion3_2145.wav` et lance en boucle l'onde d'énergie `Supernova_Wave4_2209.wav`.

### 2.7. Prédateur de Sombre Ronce (`AnglerfishAudioController`)
- État `Lurking` (repos) : joue en boucle `Angler_Lurking_Loop_2267.wav`.
- État `Investigating` (trouble détecté) : coupe la boucle et joue `Angler_Growl_01_2276.wav`.
- État `Chasing` (cible détectée) : joue `Angler_Bellow_02_2282.wav` et maintient la boucle haletante `Angler_Chasing_Loop_2269.wav`.
- Capture du joueur : joue `Angler_Crunch_01_2271.wav`.

### 2.8. Bruiteur du vaisseau (`ShipNoiseMaker`)
`ShipNoiseMaker.Update` et `OnImpact` calculent le niveau acoustique perçu par les capteurs :
$$\text{bruit} = \text{poussée} \times 10 + \text{impact} \times \left(1 - \text{clamp01}\left(\frac{\Delta t}{1}\right)\right)$$
pour tout impact supérieur à 10 u/s.

### 2.9. Musique spatiale conditionnelle (`ShipOnlyMusicVolume`)
Deux zones sphériques (`MusicVolume` sur `DerelictDimension_Body` de rayon 600, et `MusicZone` sur `DarkBramble_Body` de rayon 1200) jouent `OW Space - Into The Unknown 100912 AP_2249.ogg` en fondu de 5 secondes, uniquement lorsque le joueur se trouve à la fois dans le volume et aux commandes du vaisseau.

---

## 3. Implémentation

1. **Extraction de `EVENT_AUDIO` (`web/src/pipeline/extract/audio.js`)** :
   - Ajout des 9 classes : `"PlayerDeathAudio"`, `"ShipTurbulenceAudio"`, `"ProbeLauncher"`, `"ModelShipCrashBehavior"`, `"RemoteFlightConsole"`, `"SatelliteSnapshotController"`, `"ShipComputer"`, `"AnglerfishAudioController"`, `"SupernovaVolume"`.
   - Exportation de 19 nouveaux clips WAV (total porté à 133 clips : 23 OGG, 110 WAV) et 39 émetteurs d'événements audio.
2. **Méthodes sensorielles et retours (`web/src/reactaudio.js`)** :
   - Méthodes ajoutées à `UISounds` :
     - `death(cause)`
     - `probeLaunch(highPower)`
     - `probeRetrieve()`
     - `cameraShutter()`
     - `probeDiscovery()` (annotée `// @vide` car `_discoverySound` est nul dans level0 et `CaughtOnCamera` non activé)
     - `shipComputerBoot()`
     - `modelShipCrash()`
     - `modelShipRespawn()`
     - `supernovaCollapse()`, `supernovaExplosion()`, `supernovaWave()`
     - `anglerLurking()`, `anglerDisturbance()`, `anglerTarget()`, `anglerChase()`, `anglerCrunch()`
   - Fonction exportée `shipTurbulence(events)` résolvant les paramètres et clips de `ShipRattleAudio` et `TurbulenceAudio`.
3. **Modélisation du vaisseau et de Sombre Ronce (`web/src/ship.js`, `web/src/bramble.js`)** :
   - Déclaration `@lit ShipNoiseMaker`, `NoiseSensor`, `AnglerfishController`, `AnglerfishAudioController`, `ShipOnlyMusicVolume`.
   - Implémentation de `shipNoise(...)` et intégration dans la classe `Ship` avec suivi des impacts et de la poussée.
   - Implémentation de `shipOnlyMusicState(inVolume, inShip)`.
   - Suivi des transitions d'état dans `Anglerfish` via `stateChanged`.
4. **Intégration dans la boucle principale (`web/src/main.js`)** :
   - Déclenchement de `sonsUI.death(...)` et mixage `mixer.mixDeath(...)` lors de la mort du joueur.
   - Déclenchement de `sonsUI.modelShipCrash()` lors du crash du modèle réduit.
   - Mise à jour et bouclage audio des turbulences de coque et de vent (`shipWindLevel`, `shipRattleLevel`).
   - Déclenchement de `sonsUI.supernovaCollapse()`, `sonsUI.supernovaExplosion()` et boucle d'onde `sonsUI.supernovaWave()`.
   - Réinitialisation complète de l'audio de la supernova et arrêt des boucles lors du réveil (`respawn()`).
   - Synchronisation des cris et boucles du cœlacanthe lors des changements d'état (`repos`, `inspecte`, `poursuit`).
   - Fondu progressif de la musique spatiale dans Sombre Ronce (`dbMusicLevel`).
   - Sons de tir et rappel de la sonde, obturateur photographique et démarrage de l'ordinateur de bord.

---

## 4. Vérification et couverture des tests

- **Tests d'extraction (`tests/05-extract.mjs`)** : 484/484 tests réussis, vérifiant la présence et la conformité des 9 nouvelles classes, des 133 clips et des 39 émetteurs.
- **Tests unitaires de jeu (`tests/09-jeu.mjs`)** : 2424/2424 tests réussis, incluant la Section 8 complète validant tous les retours sensoriels, calculs de turbulence, bruit de coque et musique exclusive.
- **Lois du moteur (`scripts/lois.mjs`)** : 0 loi non appelée (100% de lois vivantes).
- **Couverture des méthodes du build (`scripts/refait.mjs`)** : 181/181 méthodes nommées (100%).
- **Intégrité des dépôts (`scripts/check-no-assets.mjs`)** : 0 asset binaire interdit au dépôt.
- **Compilation ES Modules (`scripts/check-modules.mjs`)** : 39/39 modules de pipeline et 75/75 modules moteur validés.
