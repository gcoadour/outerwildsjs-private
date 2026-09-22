# Recensement complet et événements globaux : 100 % des composants et événements raccordés

Ce document consigne la clôture intégrale du recensement (`scripts/recensement.mjs`), la couverture de l'ensemble des événements globaux (`scripts/evenements.mjs`), et l'alignement strict des méthodes (`scripts/refait.mjs`) sans aucune loi orpheline (`scripts/lois.mjs`).

---

## 1. Clôture intégrale du recensement (295 classes, 1 451 instances)

L'audit `OW_BUILD=... node scripts/recensement.mjs` vérifie désormais chaque composant MonoBehaviour et classe posée dans `level0` ainsi que dans les fichiers annexes (`sharedassets1.assets`, `resources.assets`, `mainData`, `sharedassets0.assets`).

```
build            work/game/OuterWilds_Alpha_1_2_Data
fichiers         level0 + sharedassets1.assets + resources.assets + mainData + sharedassets0.assets
classes posees        295   (1451 instances)
  dans level0         275   (1390 instances)
  AILLEURS             37   (61 instances)
lues par le moteur    241   (1295 instances)
lues par motif         54   (156 instances)
EXTRAITES, NON LUES     0   (0 instances)
SANS LECTEUR            0   (0 instances)
```

Toutes les classes autrefois orphelines sont soit prises en charge directement par le moteur, soit explicitement qualifiées :
- `InertiaTensorCalibrator` (×14) : annoté `@lit` et `@autrement` dans `orbits.js` (les tenseurs d'inertie sont calculés nativement par le solveur Havok).
- `InterferenceVolume` (×1) : annoté `@lit` et `@autrement` dans `volumes.js` (inerte dans l'alpha car aucun `InterferenceDetector` n'est instancié).
- `Detonator` (×1) : annoté `@lit` et `@autrement` dans `supernova.js` (composant Unity 4 remplacé par la mise en scène Babylon).
- `Locator` (×1) : annoté `@lit` et `@autrement` dans `main.js` (singleton global de localisation remplacé par l'état et le contexte du moteur web).
- `LoadTimeTracker` (×2) : annoté `@lit` et `@autrement` dans `settings.js`.
- `ClearAlphaChannel` (×2) et `DepthOfFieldScatter` (×1) : annotés `@lit` et `@autrement` dans `cameraeffects.js`.
- `DebugInputManager`, `DebugHUD`, `DebugBreakAllChildren`, `TapeMeasure` : annotés `@lit` et `@autrement` dans `input.js`.

---

## 2. Intégration des 124 événements globaux (0 non nommés)

L'audit `OW_BUILD=... node scripts/evenements.mjs` scanne les chaînes passées à `GlobalMessenger.FireEvent` et `AddListener` dans les assemblies IL du build. Les 17 événements restants ont tous été intégrés sous forme de dictionnaires d'événements et reliés aux systèmes correspondants :

```
build            work/game/OuterWilds_Alpha_1_2_Data
evenements       124
nommes           124
NON NOMMES       0
```

1. **Tour et codes de lancement** (`web/src/tower.js`) :
   - `ActivateLaunchTower`
   - `LearnLaunchCodes`
2. **Conversation et dialogues** (`web/src/dialogue.js`) :
   - `EnterConversation`
   - `ExitConversation`
3. **Ordinateur de bord et guimauve** (`web/src/consoles.js`) :
   - `ComputerUpdated`
   - `EatMarshmallow`
   - `StartTutorial`
4. **Sable et téléportation du centre** (`web/src/sand.js` & `web/src/decor.js`) :
   - `DebugSandTransfer`
   - `EnterTimeLoopCentral`
   - `ExitTimeLoopCentral`
   - `FireAllTeleporters`
5. **Combinaison et équipement** (`web/src/gear.js`) :
   - `AquireProbe`
   - `TriggerSuitWarning`
6. **Sonde et télescope** (`web/src/probe.js` & `web/src/tools.js`) :
   - `StartProbeTutorial`
   - `CompleteShipProbeTutorial`
   - `CompleteTelescopeTutorial`
7. **Menu et observatoire** (`web/src/settings.js` & `web/src/interact.js`) :
   - `LoadFromMenu`
   - `TriggerObservatoryMap`

---

## 3. Méthodes du build et appelants (`refait.mjs` et `lois.mjs`)

- `scripts/refait.mjs` : **176/176 méthodes du build nommées par le portage** (0 écart).
- `scripts/lois.mjs` : **0 lois du moteur que rien n'appelle** (0 orpheline).
- `web/src/main.js` : raccordement de `sonsUI.blackHoleWarp()` lors de l'aspiration par le trou noir.

---

## Gardé par

- `tests/09-jeu.mjs` : 2 342 / 2 342 vérifications passées.
- `tests/05-extract.mjs` : 473 / 473 vérifications passées.
- `scripts/check-modules.mjs` : 39 modules pipeline, 75 modules moteur validés.
- `scripts/check-no-assets.mjs` : 288 fichiers vérifiés, aucun asset binaire sous git.
