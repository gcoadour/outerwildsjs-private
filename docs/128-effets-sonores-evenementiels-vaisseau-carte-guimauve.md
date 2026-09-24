# Retours sensoriels et sonores événementiels : vaisseau, carte et guimauve

Ce document consigne l'extraction, la restitution et le raccordement de six retours acoustiques et physiques majeurs de l'alpha d'Outer Wilds (Unity 4.1 Linux v1.2), assurant une fidélité sensorielle totale pour le cockpit, les impacts et les interactions du joueur.

---

## 1. Contexte et constats

Lors de l'exploration approfondie des comportements et des retours de jeu, plusieurs actions clés demeuraient muettes ou dépourvues de leur boucle de retour tactile :
1. **La dégustation de la guimauve** : après avoir grillé la guimauve au feu de camp, la commande d'interaction soignait bien le joueur, mais sans aucun son de mastication.
2. **L'ouverture de la carte du système solaire** : la carte implémentait déjà la géométrie de cadrage et la garde temporelle de dix secondes, mais la tonalité caractéristique de zoom restait inaudible car la méthode recherchait un clip inexistant sur le script plutôt que l'AudioSource du composant.
3. **L'atterrissage sur les plateformes de lancement** : le toucher des jambes du train d'atterrissage n'émettait aucun choc d'amortissement.
4. **L'assise au poste de pilotage du vaisseau** : s'attacher au siège ou se lever en vol ne déclenchait pas les bruits mécaniques de harnais.
5. **Les impacts et l'explosion de la coque** : les collisions contre le relief ou l'explosion finale par rupture structurelle manquaient de retours acoustiques.

---

## 2. Analyse du bytecode IL et composants Unity 4

L'inspection systématique du bytecode dans `Assembly-CSharp.dll` et des GameObjects de `level0` et `sharedassets1.assets` a révélé les composants et méthodes responsables de ces retours :

### 2.1. Dégustation de la guimauve (`Marshmallow.Update`)
Dans l'IL de `Marshmallow.Update` :
```text
IL_0219  ldsfld   interact
IL_021e  call     OWInput::GetButtonDown
IL_0223  brfalse  IL_0255
IL_0228  ldstr    "EatMarshmallow"
IL_022d  call     GlobalMessenger::FireEvent
IL_0232  ldarg.0
IL_0233  call     Component::get_audio
IL_0238  callvrt  AudioSource::Play
```
Le GameObject `Marshmallow` (ID 3628) porte une `AudioSource` liée au clip `chomp_2234.ogg`.

### 2.2. Ouverture de la carte du système (`MapController.EnterMapView`)
Dans `MapController.EnterMapView` :
```text
IL_0020  call     Time::get_time
IL_0025  ldarg.0
IL_0026  ldfld    _lastPlayAudioTime
IL_002b  ldc.r4   10
IL_0030  add
IL_0031  ble.un   IL_004c
IL_0036  ldarg.0
IL_0037  call     Time::get_time
IL_003c  stfld    _lastPlayAudioTime
IL_0041  ldarg.0
IL_0042  call     Component::get_audio
IL_0047  callvrt  AudioSource::Play
```
L'AudioSource de `MapCamera` joue `MapZoomOut_Tone_2265.wav`.

### 2.3. Atterrissage sur plateforme (`LandingPadSensor.OnTriggerEnter`)
```text
IL_0030  call     Time::get_timeSinceLevelLoad
IL_0035  ldc.r4   1
IL_003a  ble.un   IL_0050
IL_003f  ldarg.0
IL_0040  call     Component::get_audio
IL_0045  ldarg.0
IL_0046  ldfld    _touchdownSound
IL_004b  callvrt  AudioSource::PlayOneShot
```
Le clip sérialisé est `podland_thud_hiss_2194.wav`.

### 2.4. Harnais du poste de pilotage (`FlightConsole`)
- `FlightConsole.OnPressInteract` : enfile le harnais (`_buckleUpSound`, `sharedassets1.assets:2159` - `BuckleUp_Beefy_2159.wav`).
- `FlightConsole.ExitFlightConsole` : détache le harnais (`_unbuckleSound`, `sharedassets1.assets:2214` - `Unbuckle_Beefy_2214.wav`).

### 2.5. Chocs et destruction du vaisseau (`ShipDamageController`)
- `OnImpact` déclenche `_lightImpactClip` (`HullImpact_Light2_2137.wav`) pour les chocs $\ge 15$ u/s, et `_mediumImpactClip` (`HullImpact_Medium2_2151.wav`) pour les chocs $\ge 30$ u/s.
- `ExplodeShip` déclenche l'AudioSource du GameObject `ShipExplosion` (`HullImpact_Explosion_Fiery_2213.wav`).

---

## 3. Implémentation

1. **Extraction de `EVENT_AUDIO` (`web/src/pipeline/extract/audio.js`)** :
   - Ajout de `FlightConsole` et `ShipDamageController` dans `EVENT_AUDIO`.
   - Les 4 nouveaux clips WAV sont extraits, portant le total de clips exportés à 114 (23 OGG, 91 WAV).
2. **Accès unifié aux sources placées dans `eventAudio` (`web/src/reactaudio.js`)** :
   - Sauvegarde de `sources` dans `eventAudio(audio)`.
   - Ajout de la méthode `source(name)` permettant de résoudre immédiatement les clips d'AudioSources placées (`Marshmallow`, `MapCamera`, `ShipExplosion`).
3. **Enrichissement de `UISounds` (`web/src/reactaudio.js`)** :
   - `eatMarshmallow()`
   - `mapZoom()`
   - `touchdown()`
   - `shipImpact(level)` (paliers 1 et 2)
   - `shipExplosion()`
   - `buckleUp()`
   - `unbuckle()`
4. **Cinématique du vaisseau (`web/src/ship.js` et `web/src/shipdamage.js`)** :
   - `Ship.updateLanding` alimente `ship.lastLandingEvent` (émettant `ShipTouchdown`).
   - `ShipDamage.impact` calcule `justExploded` et le propage à `ship.justExploded`.
5. **Câblage de la boucle principale (`web/src/main.js`)** :
   - Déclenchement de `sonsUI.mapZoom()` lors de l'ouverture de la carte (`r.sonne`).
   - Déclenchement de `sonsUI.eatMarshmallow()` lors de la dégustation au feu de camp.
   - Déclenchement de `sonsUI.buckleUp()` et `sonsUI.unbuckle()` lors de l'entrée/sortie du poste de pilotage.
   - Déclenchement de `sonsUI.touchdown()`, `sonsUI.shipImpact(...)` et `sonsUI.shipExplosion()` lors des phases de vol et de collision du vaisseau.

---

## 4. Résultats des tests

- `tests/09-jeu.mjs` : 2 385 / 2 385 vérifications passées (15 nouveaux contrôles unitaires).
- `tests/05-extract.mjs` : 477 / 477 vérifications passées (compte exact de 114 clips et 26 émetteurs événementiels).
- `scripts/lois.mjs` : 0 loi non appelée dans 0 module.
- `scripts/refait.mjs` : 179 / 179 méthodes nommées par le portage.
- `scripts/check-no-assets.mjs` : 293 fichiers vérifiés, aucun asset volumineux stocké dans git.
