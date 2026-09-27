// Les touches de mise au point du build : elles sont dans l'alpha, et actives.
//
// @lit DebugInputManager, DebugKeyCode, DebugBreakAllChildren
//
// `DebugInputManager` est POSE dans la scene (sur `SolarSystemRoot`), et ses
// touches ne sont pas derriere un drapeau de developpement : qui joue a l'alpha
// peut appuyer sur F12 et voir le soleil exploser. Le portage n'en avait
// aucune, et donnait au mode d'affichage (`GUIMode`) une touche a lui, `g`, la
// ou le build le fait tourner sur F1.
//
// `DebugKeyCode..cctor` les range toutes, en `KeyCode` d'Unity :
//
//   F1   cycleGUIMode          GUIMode.Update : mode d'affichage suivant
//   F2   suitUp                "SuitUp", "AquireProbe", "AquireMinimap"
//   F3   learnLaunchCodes      PlayerData.LearnLaunchCodes
//   F5   fireAllTeleporters    "FireAllTeleporters" : chaque AncientTeleporter
//                              tire (`OnFireAllTeleporters` -> `FireTeleporter`)
//   F6   rapidSandTransfer     "DebugSandTransfer" (0,01) : le sable coule
//   =    timeLapse             Time.timeScale = 3 tant qu'on tient
//   F9   resetSimulation       lue par PERSONNE dans ce build
//   F10  destroyAllBreakable   DebugBreakAllChildren : AddDamage a chaque fragment
//   F11  triggerEndTimes       TimeLoop.SetSecondsRemaining(92)
//   F12  triggerSupernova      "TriggerSupernova"
//   1-8, 0                     PlayerSpawner.Update : les sauts
//
// LES SAUTS NE PORTENT QUE LE VAISSEAU. `Warp` retient le point et
// `FixedUpdate` ne l'applique que si `_isPlayerInShip` : il pose alors le
// VAISSEAU sur le point (position, rotation, vitesse du point). A pied, un
// chiffre ne fait rien. Et `GetSpawnPoint` ne rend qu'un point dont
// `IsShipSpawn` vaut `_isPlayerInShip` : dans le vaisseau, seuls les six
// points de vaisseau repondent (comete, jumelles, Timber Hearth, Brittle
// Hollow, Giant's Deep, Dark Bramble — 1 a 6) ; 0, 7 et 8 visent le
// vaisseau, la lune quantique et le belvedere, qui n'en ont pas.

/** `DebugKeyCode`, en `code` du navigateur. */
export const TOUCHES_DEBUG = {
  cycleGUIMode: "F1", suitUp: "F2", learnLaunchCodes: "F3",
  fireAllTeleporters: "F5", rapidSandTransfer: "F6", timeLapse: "Equal",
  resetSimulation: "F9", destroyAllBreakable: "F10",
  triggerEndTimes: "F11", triggerSupernova: "F12",
  cometWarp: "Digit1", hourglassTwinsWarp: "Digit2", homePlanetWarp: "Digit3",
  brittleHollowWarp: "Digit4", gasGiantWarp: "Digit5", darkBrambleWarp: "Digit6",
  quantumWarp: "Digit7", moonWarp: "Digit8", shipWarp: "Digit0",
};

/** `SpawnLocation` de chaque saut (`PlayerSpawner.Update`). */
export const LIEU_DU_SAUT = {
  cometWarp: 0, hourglassTwinsWarp: 1, homePlanetWarp: 2, brittleHollowWarp: 3,
  gasGiantWarp: 4, darkBrambleWarp: 5, shipWarp: 8, quantumWarp: 9, moonWarp: 10,
};

/** `Time.timeScale` tant que `timeLapse` est tenue. */
export const ACCELERATION = 3;
/** `SetSecondsRemaining(92)` : la fin des temps, et sa musique. */
export const SECONDES_FIN = 92;
/** `FireEvent<float>("DebugSandTransfer", 0.01f)`, en minutes. */
export const TRANSFERT_SABLE = 0.01;

/** Le nom de la touche de mise au point, ou null. */
export function toucheDebug(code) {
  for (const [nom, c] of Object.entries(TOUCHES_DEBUG)) if (c === code) return nom;
  return null;
}

/**
 * `SandLevelController.OnDebugSandTransfer(minutes)` :
 *
 *     if (Time.time / 60 < _startAfterMinutes) _startAfterMinutes = Time.time / 60;
 *     _endAfterMinutes = _startAfterMinutes + minutes;
 *
 * Le sable qui n'avait pas commence commence maintenant, et tout le transfert
 * tient en six dixiemes de seconde.
 */
export function transfertSable(colonne, minutes, duree = TRANSFERT_SABLE) {
  if (minutes < colonne.startMinutes) colonne.startMinutes = minutes;
  colonne.endMinutes = colonne.startMinutes + duree;
  return colonne;
}

/**
 * `PlayerSpawner.GetSpawnPoint(lieu)` : le PREMIER point de la liste pour ce
 * lieu dont `IsShipSpawn` vaut `dansVaisseau`, ou null.
 */
export function pointDeSaut(points, lieu, dansVaisseau) {
  for (const p of points || []) {
    const f = p.fields || {};
    if ((f._spawnLocation ?? -1) === lieu && !!f._isShipSpawn === !!dansVaisseau) return p;
  }
  return null;
}
