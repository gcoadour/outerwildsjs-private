// La tour de lancement, les pads d'atterrissage, et l'entree du musee.
//
// @lit Elevator, LaunchElevatorController, LaunchTerminal, LandingPadManager
// @lit LandingPadSensor, MuseumEntryway, EntrywayTrigger
// Quatre mecaniques du depart de partie, toutes posees dans le build et
// aucune lue (docs/51-tour.md).
//
// LA TOUR. Le portage accordait les codes de lancement au bon moment
// (docs/43) et s'arretait la : on rejoignait le vaisseau a pied. Le build pose
// un terminal, une tour et un ascenseur, et les enchaine :
//
//   apprendre les codes -> le terminal s'annonce (« Enter Launch Codes »)
//   l'actionner         -> ActivateLaunchTower -> l'ascenseur s'ouvre
//   l'actionner         -> il monte, 31,5 unites en 5 secondes
//
// Le terminal n'est pas un verrou de plus : il REFUSE, avec un son negatif, et
// se remet en etat. Ce qui ouvre le vaisseau reste la connaissance.
//
// L'ASCENSEUR, `Elevator.Update`, et deux details qui font tout :
//
//     u = SmoothStep(0, 1, (t - depart) / duree)
//     position = Lerp(depart, cible, u)
//     volume du son = clamp01(u x 10)
//
// `SmoothStep` et non une rampe : il part et s'arrete en douceur, ce qui est
// ce qu'on attend d'une cabine. Et le son monte en un DIXIEME du trajet, pas
// sur toute sa duree. Arrive, il detache le joueur, coupe la boucle, joue
// `elevatorstop` et rallume sa lampe.
//
// `_trackHeight` et `_liftDuration` viennent de la scene — 31,5 et 5 — et NON
// du constructeur, qui pose 10 et 3. C'est le seul endroit de cette serie ou
// la scene contredit le constructeur, et c'est elle qui gagne.
//
// LES PADS. `LandingPadManager.Update` teste trois capteurs a la fois :
//
//     pose  <=>  les trois touchent, ET tous les trois le MEME corps
//
// Un seul contact ne suffit pas, et trois contacts sur deux corps differents
// non plus — un vaisseau a cheval sur un rebord n'est pas pose. Le portage
// declarait « pose » des le premier contact de son rayon vers le bas.
//
// L'ENTREE DU MUSEE. `MuseumEntryway` ecoute `ResumeSimulation` et rejoue son
// evenement d'entree pour le joueur : au sortir d'une pause, on est reconnu
// comme etant dedans. Sans cela, revenir d'un menu vous laisse dehors alors
// que vous n'avez pas bouge.

/** Constructeur d'`Elevator`. La scene, elle, pose 31,5 et 5. */
export const ELEVATOR = { trackHeight: 10, liftDuration: 3 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** `Mathf.SmoothStep(0, 1, t)` : 3t² − 2t³, borne. */
export function smoothStep(t) {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/** Les ascenseurs poses dans la scene. */
export function elevators(gameplay) {
  return ((gameplay.placed || {}).Elevator || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      position: c.position,
      body: c.body || null,
      // La scene contredit le constructeur, et c'est elle qui gagne.
      trackHeight: f._trackHeight ?? ELEVATOR.trackHeight,
      liftDuration: f._liftDuration ?? ELEVATOR.liftDuration,
      startClip: (f._elevatorStartClip && f._elevatorStartClip.name) || null,
      stopClip: (f._elevatorStopClip && f._elevatorStopClip.name) || null,
    };
  });
}

/**
 * Un ascenseur, en une fraction de course.
 *
 * Ne connait ni Babylon ni le DOM : il rend une fraction de 0 (en bas) a 1 (en
 * haut) et un volume sonore, et le moteur en fait une position.
 */
export class Elevator {
  constructor(data) {
    this.data = data;
    this.unlocked = false;        // `ActivateControls`
    this.fraction = 0;            // `GetTrackPositionFraction`
    this.goingToTheEnd = false;
    this.moving = false;
    this.t0 = 0;
    this.from = 0;
    this.to = 0;
    this.volume = 0;
    this.arrived = false;         // vient-il d'arriver, pour le son d'arret
  }

  /** L'evenement `ActivateLaunchTower` ouvre les commandes. */
  activateControls() { this.unlocked = true; }
  deactivateControls() { this.unlocked = false; }

  /** Presser la commande : on bascule de bout en bout. */
  pressInteract(t = 0) {
    if (!this.unlocked) return false;
    this.goingToTheEnd = !this.goingToTheEnd;
    this._start(this.goingToTheEnd ? 1 : 0, t);
    return true;
  }

  /** `ReturnToStart` : sans basculer le sens, on redescend. */
  returnToStart(t = 0) {
    this.goingToTheEnd = false;
    this._start(0, t);
  }

  _start(cible, t) {
    this.from = this.fraction;
    this.to = cible;
    this.t0 = t;
    this.moving = true;
    this.arrived = false;
  }

  update(t) {
    this.arrived = false;
    if (!this.moving) { this.volume = 0; return this.fraction; }
    const duree = this.data.liftDuration || 1;
    const u = smoothStep((t - this.t0) / duree);
    this.fraction = this.from + (this.to - this.from) * u;
    // Le son monte en un DIXIEME du trajet, pas sur toute sa duree.
    this.volume = clamp01(u * 10);
    if (u >= 1) {
      this.moving = false;
      this.arrived = true;
      this.volume = 0;
    }
    return this.fraction;
  }

  /** La hauteur au-dessus du depart, en unites du monde. */
  get height() { return this.fraction * (this.data.trackHeight || 0); }
}

/**
 * Le terminal de lancement.
 *
 * Il ne verrouille rien : il REFUSE. Tant qu'on ne connait pas les codes, il
 * repond par un son negatif et se remet en etat ; une fois qu'on les connait,
 * il s'annonce et actionne la tour — une seule fois.
 */
export class LaunchTerminal {
  constructor(prompt = " Enter Launch Codes") {
    this.prompt = prompt;
    this.announced = false;
    this.used = false;
  }

  /** `OnLearnLaunchCodes` : c'est la connaissance qui pose l'invite. */
  learnCodes() { this.announced = true; return this.prompt; }

  /** @returns "activate" | "refuse" | null si le terminal est deja servi */
  pressInteract(knowsCodes) {
    if (this.used) return null;
    if (!knowsCodes) return "refuse";
    this.used = true;
    return "activate";
  }

  reset() { this.announced = false; this.used = false; }
}

/** Les capteurs de pad poses dans la scene. */
export function landingPadSensors(gameplay) {
  return ((gameplay.placed || {}).LandingPadSensor || []).map((c) => ({
    name: c.name,
    position: c.position,
    body: c.body || null,
    volume: c.volume || null,
    touchdownSound: ((c.fields || {})._touchdownSound || {}).name || null,
  }));
}

/**
 * `LandingPadManager.Update`, tel quel.
 *
 * @param contacts un corps par capteur, `null` quand le capteur ne touche rien
 * @returns le corps sur lequel on est pose, ou null
 *
 * Les trois doivent toucher, et toucher le MEME. Un vaisseau a cheval sur un
 * rebord n'est pas pose — c'est la difference entre « quelque chose est sous
 * moi » et « je suis pose ».
 */
export const LANDED_SPEED = 5;   // vitesse relative au-dela de laquelle on glisse

export function landedOn(contacts, relSpeed = 0) {
  if (!contacts || !contacts.length) return null;
  let corps = null;
  for (const c of contacts) {
    if (!c) return null;
    if (corps === null) corps = c;
    else if (corps !== c) return null;
  }
  // La TROISIEME condition, qui manquait : le build compare la vitesse du
  // vaisseau a celle du point de contact, et au-dela de cinq unites on n'est
  // pas pose — on GLISSE. La nuance compte depuis que « pose » coupe toute
  // rotation (docs/89-pose.md) : sans elle, un vaisseau qui derape sur une
  // piste perdait ses commandes.
  if (relSpeed > LANDED_SPEED) return null;
  return corps;
}

/**
 * `LandingPadManager.Update` : les deux annonces du toucher et du decollage.
 *
 * Elles ne sont ecoutees par personne dans l'assembly — et c'est justement ce
 * qui les rend interessantes a poser : le build les emet quand meme, et un
 * portage qui les emet aussi pourra les brancher sans rien rouvrir.
 */
export class LandingPads {
  constructor() {
    this.landed = false;
    this.body = null;
    this.events = [];
  }

  /** @returns {"ShipTouchdown"|"ShipTakeoff"|null} */
  update(contacts, relSpeed = 0) {
    const corps = landedOn(contacts, relSpeed);
    const pose = corps !== null;
    this.body = corps;
    if (pose === this.landed) return null;
    this.landed = pose;
    const e = pose ? "ShipTouchdown" : "ShipTakeoff";
    this.events.push(e);
    return e;
  }
}

/**
 * `MuseumEntryway` : au sortir d'une pause, l'entree se rejoue.
 *
 * Le portage fige la partie dans le menu des reglages (`Time.timeScale = 0`) et
 * la reprend telle quelle. Le build, lui, refait passer le joueur par la porte
 * — sans quoi on ressort d'un menu en etant compte dehors alors qu'on n'a pas
 * bouge.
 */
export function museumEntryways(gameplay) {
  return ((gameplay.placed || {}).MuseumEntryway || []).map((c) => {
    const d = (c.fields || {})._localExitDirection || { x: 0, y: 0, z: 1 };
    return {
      name: c.name,
      position: c.position,
      body: c.body || null,
      volume: c.volume || null,
      exitDirection: [d.x ?? 0, d.y ?? 0, d.z ?? 0],
    };
  });
}
