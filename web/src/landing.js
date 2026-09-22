// Le mode atterrissage : la camera qui regarde le sol, et la poussee qui
// refuse de vous mettre en orbite.
//
// Deux mecaniques distinctes que le build nomme presque pareil, et qu'il faut
// tenir separees :
//
//   LA VUE d'atterrissage (`EnterLandingView` / `ExitLandingView`) : une
//   camera sous le vaisseau, le regard qui bascule, et les commandes qui
//   changent — le manche ROULE au lieu de lacer, et le roulis est INVERSE.
//
//   LE MODE atterrissage (`EnterLandingMode` / `ExitLandingMode`) : tant qu'on
//   est dans la vue ET assez pres d'un referentiel qui autorise l'alignement,
//   la poussee est ecretee en tangentiel. On ne peut plus se mettre en orbite
//   par accident en essayant de se poser.
//
// La premiere est une affaire de camera, la seconde de physique, et le build
// les fait vivre dans deux composants (`FlightConsole`, `ShipThrusterController`).
//
// @lit FlightConsole
// @lit ShipThrusterController

import { fieldStrength } from "./gravity.js";

export const ATTERRISSAGE = {
  // `Time.time > _initLandingCamTime + 0.45` : la bascule n'est pas immediate,
  // et c'est ce delai qui donne son poids au changement de vue.
  transition: 0.45,
  // `SnapToDegrees(0, -70, 140)` : lacet zero, tangage -70 — on regarde le sol,
  // pas l'horizon — a cent quarante degres par seconde.
  snapYaw: 0,
  snapPitch: -70,
  snapDegrees: 140,
  // Au-dela de vingt unites de vitesse RELATIVE au referentiel, ouvrir la vue
  // declenche l'egalisation automatique. Le jeu ne vous laisse pas passer en
  // vue d'atterrissage a pleine vitesse sans rien faire.
  matchSpeed: 20,
};

/**
 * `ShipThrusterController.Update` : le mode roulis, en une ligne.
 *
 *   isRollMode = GetButton(swapRollAndYaw) ? !rollByDefault : rollByDefault
 *
 * Le portage n'avait que la moitie gauche : la touche alt donnait le roulis,
 * toujours. En vue d'atterrissage le build INVERSE le defaut — le manche roule,
 * et c'est la touche alt qui rend le lacet.
 */
export function rollMode(swapHeld, rollByDefault = false) {
  return swapHeld ? !rollByDefault : !!rollByDefault;
}

/**
 * `ShipThrusterController.ResetRollSettings` : les trois champs du roulis
 * remis a plat.
 *
 *   _rollByDefault = false; _flipRollFactor = 1; _isRollMode = false;
 *
 * Le build ne l'appelle QU'A UN endroit, et c'est la ou on ne l'attend pas :
 * `FlightConsole.OnPressInteract`, en S'ASSEYANT. Rien ne remet le roulis en
 * place en se LEVANT.
 *
 * La raison tient dans `ExitFlightConsole`, qui ne touche pas au roulis :
 * `InvertRoll` et `SetRollByDefault` ne sont appeles que dans la branche de la
 * touche d'atterrissage. Se lever en vue d'atterrissage laisse donc le manche
 * inverse et le roulis par defaut — pour toujours, si on ne se rasseyait pas.
 * La remise a plat au moment de s'asseoir est le filet.
 */

/**
 * `ShipThrusterController.ReadTranslationalInput` — ce qui en est porte, et ou.
 *
 * Quatre lois y vivent, et le portage les applique chacune la ou elle sert :
 *
 *   - POSE, on ne peut que monter : `input.x = input.z = 0`, et
 *     `input.y = Clamp01(input.y)` — on ne s'enfonce pas dans la piste ;
 *   - l'ALLUMAGE, `_isIgniting` / `_ignitionDuration`, qui rend une seconde de
 *     poussee sans acceleration et annule si on relache (`Ship.ignition`,
 *     docs/66) ;
 *   - la LIMITE DE SECTEUR, `Min(GetThrustLimit(), maxThrust) / maxThrust`
 *     applique a l'entree entiere (`sectorThrustLimit`, `Ship.effectiveThrust`) ;
 *   - l'ECRETAGE ORBITAL, `_limitOrbitSpeed`, porte par `limitOrbitThrust`
 *     ci-dessous.
 */

/**
 * `ShipThrusterController.ReadRotationalInput` — ce qui en est porte, et ou.
 *
 * Trois choses y sont dites, et elles vivent chacune la ou le portage les
 * applique plutot qu'ensemble ici : le modele de rotation du portage n'est pas
 * celui du build (tangage et lacet y suivent le REGARD, par un couple vers la
 * direction visee, la ou le build lit deux axes), et rassembler les trois dans
 * une fonction que personne n'appelle aurait fait une loi morte de plus.
 *
 *   - POSE, on ne tourne plus du tout : `Ship.rotate` coupe le couple et
 *     laisse la trainee finir le travail.
 *   - lacet et roulis ne s'additionnent jamais : `rollMode` ci-dessus decide,
 *     et `main.js` aiguille le meme mouvement vers l'un OU l'autre.
 *   - le roulis passe par `_flipRollFactor`, -1 en vue d'atterrissage :
 *     `LandingView.flipRollFactor` le porte, `main.js` le multiplie.
 */

/**
 * `ReferenceFrame.GetOrbitSpeed(d)` : la vitesse d'une orbite circulaire.
 *
 *   sqrt(g(d) * d)
 *
 * Le build la calcule sur le champ ANALYTIQUE du corps, pas sur une masse : le
 * portage a deja `fieldStrength`, et les deux donnent le meme nombre.
 */
export function orbitSpeed(body, distance) {
  if (!body || !(distance > 0)) return 0;
  return Math.sqrt(fieldStrength(body, distance) * distance);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norme = (a) => Math.hypot(a[0], a[1], a[2]);

/** Projection de `v` sur `axe` (Vector3.Project). */
export function project(v, axe) {
  const l2 = dot(axe, axe);
  if (!(l2 > 0)) return [0, 0, 0];
  return mul(axe, dot(v, axe) / l2);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];

/**
 * `Quaternion.FromToRotation(de, vers) * v` : la rotation du plus court chemin,
 * appliquee a un vecteur (Rodrigues, sans quaternion).
 *
 * Le cas a 180 degres n'a pas d'axe unique — deux perpendiculaires donnent deux
 * resultats differents. Unity en choisit un, nous aussi, et le vaisseau qui
 * pointe exactement a l'oppose du centre pendant un ecretage n'existe pas dans
 * une partie : c'est une defense, pas une correspondance.
 */
export function rotateFromTo(v, de, vers) {
  const nd = norme(de), nv = norme(vers);
  if (!(nd > 0) || !(nv > 0)) return v.slice();
  const a = mul(de, 1 / nd), b = mul(vers, 1 / nv);
  const k = cross(a, b);
  const s = norme(k), c = dot(a, b);
  if (!(s > 1e-9)) {
    if (c > 0) return v.slice();
    // Demi-tour autour d'une perpendiculaire : v -> 2(u.v)u - v.
    const ref = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const p = cross(a, ref);
    const u180 = mul(p, 1 / norme(p));
    return sub(mul(u180, 2 * dot(u180, v)), v);
  }
  const u = mul(k, 1 / s);
  return add(add(mul(v, c), mul(cross(u, v), s)),
             mul(u, dot(u, v) * (1 - c)));
}

/**
 * L'ecretage de `_limitOrbitSpeed`, a la lettre.
 *
 * On decompose la vitesse RELATIVE au referentiel et la poussee en une part
 * radiale et une part tangentielle ; si la tangentielle prevue pour la fin de
 * l'image depasse la vitesse orbitale locale, on la ramene dessus et on en
 * rededuit la poussee tangentielle. La part RADIALE n'est jamais touchee : on
 * peut toujours monter et descendre a pleine puissance.
 *
 * C'est ce qui rend un atterrissage manoeuvrable. Sans lui, chaque correction
 * laterale ajoute de la vitesse orbitale, et on rate le sol en tournant autour.
 *
 * Une ligne du build manquait, et elle ne se lit pas comme une optimisation :
 *
 *   thrust = FromToRotation(-ship.up, d) * ship.TransformDirection(input * max)
 *
 * La poussee est REDRESSEE avant d'etre decomposee — le bas du vaisseau est
 * amene sur le radial —, et la sortie ne defait jamais cette rotation. Quand
 * l'ecretage mord sur un vaisseau incline, la poussee ne part donc pas ou le
 * nez regarde : elle part dans le repere du sol. C'est ce qui fait qu'un
 * atterrissage de travers se redresse tout seul au lieu de deriver, et ca ne
 * coute rien tant que l'alignement automatique tient le vaisseau droit.
 *
 * @param accel   poussee en monde, deja en unites d'acceleration
 * @param velRel  vitesse du vaisseau MOINS celle du referentiel
 * @param radial  du vaisseau vers le centre du referentiel
 * @param vOrbite `orbitSpeed(corps, |radial|)`
 * @param bas     le bas du vaisseau (`-transform.up`), ou null pour ne pas
 *                redresser — le repli, quand l'appelant n'a pas d'assiette
 */
export function limitOrbitThrust(accel, velRel, radial, vOrbite, dt, bas = null) {
  if (!(dt > 0) || !(vOrbite > 0) || !(norme(accel) > 0)) return accel;
  const pousse = bas ? rotateFromTo(accel, bas, radial) : accel;
  const tangentielle = sub(velRel, project(velRel, radial));
  const aRadiale = project(pousse, radial);
  const aTangente = sub(pousse, aRadiale);
  const prevue = add(tangentielle, mul(aTangente, dt));
  const v = norme(prevue);
  // Sous la vitesse orbitale, le build ne REECRIT PAS l'entree : la poussee
  // sort telle qu'elle est entree, redressement compris.
  if (!(v > vOrbite)) return accel;
  const bornee = mul(prevue, vOrbite / v);
  return add(aRadiale, mul(sub(bornee, tangentielle), 1 / dt));
}

/**
 * `FlightConsole.GetAllowLandingMode`.
 *
 * Quatre conditions, toutes necessaires. La premiere se lisait mal : la
 * methode s'ouvre sur `if (!enabled) return false`, et `enabled` est ici celui
 * de la CONSOLE — le joueur assis au poste. Debout, le mode d'atterrissage ne
 * peut pas s'etablir, meme en orbite basse. Viennent ensuite un referentiel
 * qui autorise l'alignement automatique, le vaisseau PAS pose, et la distance
 * sous `GetAutoAlignmentDistance()` — que le portage extrait deja sous le nom
 * `alignment` (docs/frames).
 */
export function allowLandingMode({ frame = null, landed = false,
                                   distance = Infinity, auPoste = true } = {}) {
  if (!auPoste) return false;
  if (!frame || landed) return false;
  if (frame.alignment == null) return false;
  return distance < frame.alignment;
}

/**
 * La vue d'atterrissage : sa bascule, son delai, et ses annonces.
 *
 * `_doLandingCamTransition` est une case, pas une file : tant qu'elle est
 * levee, la touche ne repond plus. C'est ce qui empeche d'entrer et de sortir
 * plus vite que la camera ne bascule.
 */
export class LandingView {
  constructor(cfg = ATTERRISSAGE) {
    this.cfg = cfg;
    this.on = false;
    this.transition = false;
    this.since = 0;
    // `_flipRollFactor` : -1 en vue, +1 dehors, et `InvertRoll` alterne.
    this.flipRollFactor = 1;
    this.rollByDefault = false;
    this.events = [];
    // Le mode (la physique) est distinct de la vue (la camera).
    this.mode = false;
  }

  /**
   * @param relSpeed vitesse relative au referentiel vise, ou null
   * @returns ce que l'appelant doit faire du REGARD, et s'il faut egaliser.
   *
   * Attention a l'ordre du build : le regard bascule a l'APPUI, la camera
   * 0,45 s plus tard. On voit donc le sol arriver avant d'y etre.
   */
  toggle(now, relSpeed = null) {
    if (this.transition) return null;
    // `InvertRoll` puis `SetRollByDefault(_doLandingCamTransition)` : dans les
    // DEUX sens, et c'est l'etat de la transition qui decide du defaut.
    if (this.on) {
      this.on = false;
      this.flipRollFactor *= -1;
      this.rollByDefault = false;
      this.events.push("SwitchActiveCamera", "ExitLandingView");
      return { sortie: true, centre: true, match: false };
    }
    this.transition = true;
    this.since = now;
    this.flipRollFactor *= -1;
    this.rollByDefault = true;
    return { sortie: false, snap: [this.cfg.snapYaw, this.cfg.snapPitch],
             match: relSpeed != null && relSpeed > this.cfg.matchSpeed };
  }

  /** @returns vrai a l'image ou la camera bascule enfin. */
  update(now) {
    if (!this.transition) return false;
    if (now - this.since <= this.cfg.transition) return false;
    this.transition = false;
    this.on = true;
    this.events.push("SwitchActiveCamera", "EnterLandingView");
    return true;
  }

  /**
   * `FlightConsole.ExitFlightConsole` — ce que se lever fait de la vue.
   *
   *   if (!_playerCam.enabled) ExitLandingView();
   *   _doLandingCamTransition = false;
   *
   * Deux cas, et le second est celui qu'on n'ecrit pas spontanement :
   *
   *   - la camera d'atterrissage EST passee : on repasse par `ExitLandingView`,
   *     avec son recentrage et ses deux annonces ;
   *   - elle ne l'est pas ENCORE : la transition est simplement ANNULEE, sans
   *     annonce. La vue n'a jamais eu lieu.
   *
   * Et ce qu'il ne fait PAS, dans les deux cas : le roulis. `InvertRoll` et
   * `SetRollByDefault` ne vivent que dans la branche de la touche
   * (`FlightConsole.Update`), jamais dans `ExitLandingView`. Se lever en vue
   * d'atterrissage laisse donc `_flipRollFactor` a -1 et `_rollByDefault` a
   * vrai — c'est exactement le trou que `ResetRollSettings` bouche, en se
   * rasseyant et nulle part ailleurs.
   *
   * `ExitLandingMode` ne part pas non plus : `enabled = false` arrete `Update`,
   * donc `UpdateLandingMode`, et `_isLandingMode` reste vrai jusqu'a ce qu'on
   * se rasseye. L'appelant ne doit donc PAS appeler `updateMode` hors du
   * poste ; l'annonce arrive en retard, et c'est ce que le build fait.
   *
   * @returns vrai si la vue etait etablie (et donc si le regard se recentre)
   */
  exitConsole() {
    const etablie = this.on;
    if (etablie) {
      this.on = false;
      this.events.push("SwitchActiveCamera", "ExitLandingView");
    }
    this.transition = false;
    return etablie;
  }

  /**
   * `ShipThrusterController.ResetRollSettings`, appele par
   * `FlightConsole.OnPressInteract` : en s'asseyant, et la seulement.
   */
  resetRoll() {
    this.rollByDefault = false;
    this.flipRollFactor = 1;
  }

  /**
   * Le MODE, qui n'est pas la vue : il demande en plus d'etre assez pres.
   * @returns {"enter"|"exit"|null}
   */
  updateMode(conditions) {
    const veut = this.on && allowLandingMode(conditions);
    if (veut === this.mode) return null;
    this.mode = veut;
    this.events.push(veut ? "EnterLandingMode" : "ExitLandingMode");
    return veut ? "enter" : "exit";
  }
}
