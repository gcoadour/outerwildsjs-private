// @lit OWInput
//
// Ce qui se commande, et QUAND.
//
// docs/61 a lu les vingt-deux canaux de l'`InputManager` : quelle touche fait
// quoi. Il manquait l'autre moitie, et c'est celle qui se sent en jouant :
// `OWInput` tient un ENSEMBLE de canaux actifs, et l'echange en entier a
// chaque changement de mode.
//
//   GetAxis(canal)    ->  _activeInputs.Contains(canal) ? valeur : 0
//   GetButton(canal)  ->  _activeInputs.Contains(canal) ? tenu   : false
//
// Rien de plus. Un canal absent du jeu courant ne rend pas « rien ne s'est
// passe » : il rend zero, comme si la touche n'existait pas. Le portage lisait
// les vingt-deux canaux en permanence, ce qui n'est vrai dans AUCUN mode du
// jeu — pas meme a pied.
//
// CE QUE LES ENSEMBLES DISENT DU JEU. Ils se lisent comme une specification,
// et plusieurs lignes sont des surprises :
//
//   a pied      pas d'autopilote, pas de camera d'atterrissage, pas de zoom
//   au poste    pas de saut, PAS DE LAMPE, pas d'alt-sonde
//   a la lunette  on ne MARCHE PLUS : ni moveX, ni moveZ, ni saut
//   a la carte  on ne marche pas non plus, et on n'interagit pas
//   en dialogue DEUX canaux : avancer le texte, choisir la reponse
//   dans un menu UN canal : celui qui referme le menu
//   mort        AUCUN — `OnPlayerDeath` pose un ensemble vide
//
// LA PILE N'EN EST PAS UNE. `_lastInputs` est une case, pas une pile : entrer
// dans un mode qui sauvegarde ECRASE la sauvegarde precedente. Ouvrir la carte
// depuis la lunette, puis le menu, puis refermer les deux ne rend pas la
// lunette — cela rend la carte. C'est le build, ce n'est pas joli, et c'est
// reproduit tel quel : un portage qui « corrige » cela ne se commande plus
// pareil.
//
// DEUX MODES NE SAUVEGARDENT PAS. Le poste de pilotage et la console du
// vaisseau miniature posent leur ensemble directement, et leur sortie repose
// celui du personnage — sauf, pour le poste, si la lunette est ouverte :
// `OnExitFlightConsole` teste `_usingTelescope` et ne touche a rien alors.

/**
 * Les alias de mode, et le canal du build qu'ils designent.
 *
 * Chaque classe `*Input` du build n'est qu'une table d'alias : `ShipInput.roll`
 * et `JetpackInput.yaw` pointent tous deux sur le canal `Yaw`, et c'est de la
 * que vient le partage roulis/lacet de docs/61 — deux noms, un canal.
 */
export const ALIAS = {
  jump: "Jump", moveX: "Move X", moveZ: "Move Z",
  turn: "Yaw", lookX: "Yaw", lookY: "Pitch",
  yaw: "Yaw", pitch: "Pitch", roll: "Yaw",
  thrustX: "Move X", thrustZ: "Move Z",
  thrustUp: "Move Up", thrustDown: "Move Down",
  trackX: "Move X", trackY: "Move Z", altTrackX: "Yaw", altTrackY: "Pitch",
  horizontal: "Move X", vertical: "Move Z",
  chooseResponse: "Move Z",
  interact: "Interact", advanceText: "Interact", select: "Interact",
  cancel: "Cancel",
  toggleSettings: "Pause", toggleMap: "Map", toggleFlashlight: "Flashlight",
  toggleTelescope: "Telescope", toggleLandingCam: "Landing Camera",
  targetReferenceFrame: "Lock On", matchVelocity: "Match Velocity",
  flyToReferenceFrame: "Autopilot",
  launchProbe: "Probe", takeSnapshot: "Probe", retrieveProbe: "Probe",
  reverseSnapshot: "Alt Probe",
  zoomIn: "Zoom In", zoomOut: "Zoom Out",
  swapRollAndYaw: "Swap Roll/Yaw",
};

/** Les dix ensembles d'`OWInput`, dans leurs alias de mode. */
export const ENSEMBLES = {
  personnage: ["jump", "moveX", "moveZ", "turn", "targetReferenceFrame",
               "matchVelocity", "toggleTelescope", "launchProbe", "takeSnapshot",
               "retrieveProbe", "reverseSnapshot", "interact", "cancel",
               "toggleSettings", "lookY", "toggleFlashlight", "toggleMap",
               "swapRollAndYaw", "thrustX", "thrustZ", "thrustUp", "thrustDown",
               "yaw", "pitch", "roll"],
  dialogue: ["advanceText", "chooseResponse"],
  ordinateur: ["select", "cancel", "horizontal", "vertical"],
  carte: ["toggleMap", "trackX", "trackY", "altTrackX", "altTrackY",
          "zoomIn", "zoomOut", "targetReferenceFrame"],
  lunette: ["toggleTelescope", "zoomIn", "zoomOut", "lookY", "turn",
            "targetReferenceFrame", "yaw", "pitch", "roll"],
  vaisseau: ["interact", "cancel", "toggleSettings", "targetReferenceFrame",
             "matchVelocity", "flyToReferenceFrame", "toggleTelescope",
             "toggleMap", "launchProbe", "takeSnapshot", "retrieveProbe",
             "thrustX", "thrustZ", "thrustUp", "thrustDown", "pitch", "yaw",
             "roll", "swapRollAndYaw", "toggleLandingCam"],
  atterrissage: ["interact", "cancel", "targetReferenceFrame", "matchVelocity",
                 "thrustX", "thrustZ", "thrustUp", "thrustDown", "pitch", "yaw",
                 "roll", "swapRollAndYaw", "toggleLandingCam"],
  modele: ["interact", "cancel", "thrustX", "thrustZ", "thrustUp", "thrustDown",
           "pitch", "yaw", "roll"],
  menu: ["toggleSettings"],
  satellite: ["cancel", "takeSnapshot", "reverseSnapshot"],
};

/** Un ensemble de mode, resolu en canaux du build (donc dedoublonne). */
export function canaux(mode) {
  const l = ENSEMBLES[mode];
  if (!l) return new Set();
  return new Set(l.map((a) => ALIAS[a]).filter(Boolean));
}

/**
 * Les modes qui SAUVEGARDENT l'ensemble courant avant de poser le leur.
 *
 * Les autres — le poste de pilotage et la console du modele reduit — posent
 * directement, et leur sortie est ecrite en dur. La difference n'est pas
 * decorative : c'est elle qui fait que sortir du poste alors que la lunette est
 * ouverte ne rend PAS les commandes du personnage.
 */
export const SAUVEGARDENT = new Set(["carte", "dialogue", "menu", "lunette",
                                     "ordinateur", "atterrissage", "satellite"]);

/** Les cinq canaux qu'aucun mode du jeu ne rend inaccessibles nulle part. */
export const AJOUTS_HORS_MODE = new Set(["Ship Computer", "Marshmallow",
                                         "Stick", "Display Mode",
                                         "Recenter Map"]);

/**
 * Ce que le build ANNONCE quand un mode change.
 *
 * `OWInput.AddListeners` abonne dix-neuf chaines de `GlobalMessenger`, une par
 * transition, et chacune porte le nom de la methode qui la traite
 * (`OnEnterMapView`, `OnExitTelescopeView`…) : la correspondance n'est pas
 * devinee, elle est ecrite deux fois dans l'assembly.
 *
 * Le portage tenait deja les dix ensembles et leurs transitions, mais sous ses
 * propres noms : il faisait la bonne chose sans jamais dire celle du jeu. La
 * table est ici pour que le vocabulaire soit celui du build — et pour qu'un
 * lecteur qui cherche `EnterFlightConsole` le trouve.
 *
 * `EnterLandingMode` / `ExitLandingMode` n'y sont PAS : ces deux-la ne parlent
 * pas des commandes mais de la poussee (`ShipThrusterController`).
 */
export const EVENEMENTS = {
  EnterSatelliteCameraMode: ["satellite", "entre"],
  ExitSatelliteCameraMode: ["satellite", "sort"],
  EnterLandingView: ["atterrissage", "entre"],
  ExitLandingView: ["atterrissage", "sort"],
  EnterMenuMode: ["menu", "entre"],
  ExitMenuMode: ["menu", "sort"],
  EnterShipComputer: ["ordinateur", "entre"],
  ExitShipComputer: ["ordinateur", "sort"],
  EnterDialogueMode: ["dialogue", "entre"],
  ExitDialogueMode: ["dialogue", "sort"],
  EnterMapView: ["carte", "entre"],
  ExitMapView: ["carte", "sort"],
  EnterFlightConsole: ["vaisseau", "entre"],
  ExitFlightConsole: ["vaisseau", "sort"],
  EnterRemoteFlightConsole: ["modele", "entre"],
  ExitRemoteFlightConsole: ["modele", "sort"],
  EnterTelescopeView: ["lunette", "entre"],
  ExitTelescopeView: ["lunette", "sort"],
  PlayerDeath: ["mort", "meurt"],
};

/** L'annonce qui correspond a une transition du portage, ou null. */
export function annonceDe(mode, sens) {
  for (const [nom, [m, s]] of Object.entries(EVENEMENTS)) {
    if (m === mode && s === sens) return nom;
  }
  return null;
}

/**
 * `OWInput` : l'ensemble actif, et sa case de sauvegarde.
 *
 * Les cinq canaux que le portage ajoute (docs/61) ne sont dans aucun ensemble
 * du build, et le seraient a tort dans aucun : ils passent toujours, et c'est
 * dit ici plutot que dilue dans les appels.
 */
export class Modes {
  constructor() {
    this.actif = canaux("personnage");
    this.dernier = new Set();
    this.mode = "personnage";
    this.lunetteOuverte = false;
    this.mort = false;
    // Les modes dans lesquels on se trouve, pour que l'appelant lise des
    // TRANSITIONS et non des appels. Le build n'en a pas besoin : ses
    // evenements sont deja des transitions.
    this.dedans = new Set();
 
    // Les annonces du build, dans l'ordre ou elles seraient parties.
    this.events = [];
  }

  /**
   * Une annonce du build, telle qu'elle arrive sur `GlobalMessenger`.
   *
   * C'est l'entree que le jeu utilise, et elle est plus sure que `entre`/`sort`
   * appeles a la main : un nom inconnu ne fait rien, et le sens vient de la
   * table plutot que de l'appelant.
   */
  annonce(evenement) {
    const e = EVENEMENTS[evenement];
    if (!e) return false;
    const [mode, sens] = e;
    if (sens === "meurt") { this.meurt(); this.events.push(evenement); return true; }
    const fait = sens === "entre" ? this.entre(mode) : this.sort(mode);
    if (fait) this.events.push(evenement);
    return fait;
  }

  /** `_activeInputs.Contains` — la seule question que pose `GetAxis`. */
  permet(canal) {
    if (AJOUTS_HORS_MODE.has(canal)) return true;
    return this.actif.has(canal);
  }

  /** Entree dans un mode. */
  entre(mode) {
    if (!ENSEMBLES[mode]) return false;
    if (SAUVEGARDENT.has(mode)) this.dernier = new Set(this.actif);
    if (mode === "lunette") this.lunetteOuverte = true;
    this.actif = canaux(mode);
    this.mode = mode;
    return true;
  }

  /**
   * Sortie d'un mode.
   *
   * Le poste de pilotage et le modele reduit reposent le personnage ; le reste
   * repose la case. Sortir du poste pendant que la lunette est ouverte ne
   * touche a RIEN — sans ce test, refermer la lunette apres avoir quitte le
   * poste rendrait deux fois les commandes du personnage, et la premiere fois
   * trop tot.
   */
  sort(mode) {
    if (mode === "vaisseau") {
      if (this.lunetteOuverte) return false;
      this.actif = canaux("personnage");
      this.mode = "personnage";
      return true;
    }
    if (mode === "modele") {
      this.actif = canaux("personnage");
      this.mode = "personnage";
      return true;
    }
    if (mode === "lunette") this.lunetteOuverte = false;
    this.actif = new Set(this.dernier);
    this.mode = "rendu";
    return true;
  }

  /** `OnPlayerDeath` : l'ensemble vide. Un mort ne commande rien du tout. */
  meurt() { this.actif = new Set(); this.mode = "mort"; this.mort = true; }

  /** `Init` : on repart du personnage, lunette refermee. */
  init() {
    this.actif = canaux("personnage");
    this.dernier = new Set();
    this.mode = "personnage";
    this.lunetteOuverte = false;
    this.mort = false;
  }
}
