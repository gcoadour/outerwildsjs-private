// @lit PlayerAttachPoint
//
// S'asseoir. Les quatre `PlayerAttachPoint` du build sont les quatre endroits
// ou le jeu prend le joueur en charge : le poste de pilotage, l'ordinateur de
// bord, le vaisseau miniature de l'observatoire, et l'ascenseur de la tour.
//
// Le portage ne s'asseyait nulle part. `ship.boarded` basculait a l'appui, et
// se relever teleportait le joueur quatre unites au-dessus du vaisseau. Ce
// n'est pas ce que le jeu fait, et l'ecart se voit surtout sur le TEMPS : on
// ne s'assied pas d'un coup.
//
//   duree du demi-tour = angle(avant du joueur, avant du point) / _rotationRate
//
// Une DUREE tiree d'une distance angulaire et d'une vitesse, puis un
// `SmoothStep` par-dessus. Arriver au poste de pilotage en lui tournant le dos
// prend donc 1,8 s (180° a 100°/s) et arriver de face n'en prend aucune. Le
// meme calcul commande le recentrage de la camera (`SnapToDegrees`), et la
// tour utilisait deja cette forme pour son ascenseur (docs/51).
//
// LES TROIS PROFILS POSES DANS LA SCENE. Le constructeur met les trois
// drapeaux a vrai ; les instances les contredisent, et c'est la scene qui
// gagne :
//
//   FlightConsole, ShipComputer   tourner verrouille, rotation suivie, camera recentree
//   AttachPoint (vaisseau modele) tourner verrouille, et RIEN d'autre
//   AttachPoint (ascenseur)       RIEN du tout — on monte, et on regarde ou l'on veut
//
// Le quatrieme est le plus parlant : monter dans l'ascenseur de la tour de
// lancement ne vous prend pas la tete. On est porte, pas assis.
//
// EN SE LEVANT, ON EMPORTE LA VITESSE DU POINT :
//
//   playerOWRigidbody.SetVelocity(attachedOWRigidbody.GetPointVelocity(point))
//
// Sans cette ligne, quitter le poste de pilotage d'un vaisseau qui file a 200
// u/s vous laisse sur place, et le vaisseau part sans vous. C'est la ligne qui
// fait qu'on peut se lever en vol.
//
// LA LUNETTE SUSPEND L'ASSISE. `OnEnterTelescopeView` met `_matchRotation` de
// cote, le passe a faux et DEVERROUILLE le deplacement ; en sortant, il le
// restaure et rappelle `InitAttachment` — donc une nouvelle duree, tiree de
// l'angle ou l'on se trouve alors. Regarder dans la lunette et en sortir ne
// vous replace pas d'un coup : cela recommence le demi-tour.

import { angleBetween, qmul, qconj, qrot } from "./decor.js";
import { smoothStep } from "./tower.js";

/** Constructeur de `PlayerAttachPoint`. La scene contredit les trois drapeaux. */
export const ATTACHE = {
  lockPlayerTurning: true,
  matchRotation: true,
  centerCamera: true,
  rotationRate: 100,
  translationRate: 2,
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const IDENTITE = [0, 0, 0, 1];

/**
 * `Vector3.Angle(joueur.forward, point.forward) / _rotationRate`.
 *
 * Une duree, pas une vitesse : c'est ce qui fait qu'un demi-tour prend deux
 * fois plus longtemps qu'un quart de tour, et qu'arriver de face est instantane.
 */
export function turnDuration(avantJoueur, avantPoint, rotationRate = ATTACHE.rotationRate) {
  if (!(rotationRate > 0)) return 0;
  return angleBetween(avantJoueur, avantPoint) / rotationRate;
}

/**
 * Ou en est le demi-tour, entre 0 et 1.
 *
 * `_turnDuration <= 0` vaut 1 tout de suite, et c'est le cas d'un joueur qui
 * arrive deja aligne : le build teste `ble.un`, donc NaN passe aussi par la.
 */
export function turnFraction(ecoule, duree) {
  if (!(duree > 0)) return 1;
  return smoothStep(ecoule / duree);
}

/**
 * `Vector3.Lerp(depuis, cible, Time.deltaTime * _translationRate)`.
 *
 * Une interpolation par image, donc dependante de la cadence : a 60 images le
 * glissement est deux fois plus fin qu'a 30, et l'approche n'a pas tout a fait
 * la meme forme. C'est ce que le build fait, et le reproduire est le but ;
 * c'est note ici pour que personne ne le « corrige » en exponentielle.
 */
export function slideFraction(dt, translationRate = ATTACHE.translationRate) {
  return clamp01(dt * translationRate);
}

/**
 * `Mathf.Sqrt((degX - x)^2 + (degY - y)^2) / rate` : la duree du recentrage.
 *
 * `CenterCamera(rate)` est `SnapToDegrees(0, 0, rate)`, et le taux passe est
 * `_rotationRate` — le meme 100 que le demi-tour du corps. Camera et corps
 * arrivent donc ensemble quand ils partent du meme ecart.
 */
export function snapDuration(degresX, degresY, cibleX, cibleY, rate) {
  if (!(rate > 0)) return 0;
  return Math.hypot(degresX - cibleX, degresY - cibleY) / rate;
}

/** Interpolation lineaire d'un couple de degres, sous un `SmoothStep`. */
export function snapDegrees(depart, cible, ecoule, duree) {
  const f = turnFraction(ecoule, duree);
  return [depart[0] + (cible[0] - depart[0]) * f,
          depart[1] + (cible[1] - depart[1]) * f];
}

/** `Quaternion.Slerp`, en [x, y, z, w]. */
export function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let c = b;
  // Le chemin court : deux quaternions opposes decrivent la meme orientation,
  // et sans ce retournement le slerp prend le tour du monde.
  if (d < 0) { d = -d; c = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) {
    const o = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t,
               a[2] + (c[2] - a[2]) * t, a[3] + (c[3] - a[3]) * t];
    const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
    return [o[0] / l, o[1] / l, o[2] / l, o[3] / l];
  }
  const th = Math.acos(d), s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [a[0] * ka + c[0] * kb, a[1] * ka + c[1] * kb,
          a[2] * ka + c[2] * kb, a[3] * ka + c[3] * kb];
}

/** Monde -> repere local du point. */
export function toLocal(point, monde) {
  const q = qconj(point.rotation || IDENTITE);
  const d = [monde[0] - point.position[0], monde[1] - point.position[1],
             monde[2] - point.position[2]];
  return qrot(q, d);
}

/** Repere local du point -> monde. */
export function toWorld(point, local) {
  const v = qrot(point.rotation || IDENTITE, local);
  return [point.position[0] + v[0], point.position[1] + v[1],
          point.position[2] + v[2]];
}

/**
 * Un point d'accrochage, avec son etat.
 *
 * Le point est donne a chaque image plutot que garde : il bouge avec son corps
 * porteur — le vaisseau vole, l'ascenseur monte — et le portage n'a pas de
 * hierarchie de transformations a reparenter comme Unity. Le reparentage du
 * build est ici un changement de REPERE, refait a chaque image.
 */
export class AttachPoint {
  constructor(data = {}) {
    this.name = data.name || "AttachPoint";
    this.body = data.body || null;
    this.position = data.position || [0, 0, 0];
    this.rotation = data.rotation || IDENTITE;
    this.lockPlayerTurning = data.lockTurning !== false;
    this.matchRotation = !!data.matchRotation;
    this.centerCamera = !!data.centerCamera;
    this.rotationRate = data.rotationRate ?? ATTACHE.rotationRate;
    this.translationRate = data.translationRate ?? ATTACHE.translationRate;
    this.attachOffset = data.attachOffset || [0, 0, 0];

    this.attached = false;
    this.since = 0;
    this.turnDuration = 0;
    this.localPosition = [0, 0, 0];
    this.initLocalRotation = IDENTITE;
    this.savedMatchRotation = this.matchRotation;
    this.inTelescope = false;
    this.live = null;
    this.events = [];
  }

  /**
   * Le repere du point, tel qu'il est CETTE image.
   *
   * `shift` suffit pour ce qui ne fait que se deplacer — une planete emporte
   * ses zones sans les tourner a l'echelle d'une image. Le vaisseau, lui,
   * TOURNE, et sa rotation au repos ne dit rien de son assiette du moment :
   * un siege qui ne tourne pas avec sa coque est un siege dont on tombe. Pour
   * ceux-la, `follow()` remplace le repere entier.
   */
  frame(shift = null) {
    if (this.live) return this.live;
    if (!shift) return { position: this.position, rotation: this.rotation };
    return { position: [this.position[0] + shift[0], this.position[1] + shift[1],
                        this.position[2] + shift[2]], rotation: this.rotation };
  }

  /** Donne au point le repere vivant de son porteur, ou `null` pour revenir. */
  follow(frame) { this.live = frame || null; return this; }

  /** L'avant du point : son axe Z, tourne par son orientation du moment. */
  forward() { return qrot(this.frame().rotation, [0, 0, 1]); }

  /**
   * `InitAttachment`. Rejoue tel quel a la sortie de la lunette, ce qui
   * redemarre le demi-tour depuis l'angle courant.
   *
   * @returns {{centerCamera:boolean, rate:number, lock:boolean}} ce que le
   *   point demande a la camera et au modele de deplacement.
   */
  init(joueur, now = 0, shift = null) {
    const f = this.frame(shift);
    this.attached = true;
    this.since = now;
    this.localPosition = toLocal(f, joueur.position);
    // La rotation du joueur DANS le repere du point : c'est d'elle que part le
    // slerp vers l'identite, c'est-a-dire vers « aligne sur le point ».
    this.initLocalRotation = qmul(qconj(f.rotation), joueur.rotation || IDENTITE);
    this.turnDuration = turnDuration(joueur.forward || qrot(joueur.rotation || IDENTITE,
                                                            [0, 0, 1]),
                                     this.forward(), this.rotationRate);
    return { centerCamera: this.centerCamera, rate: this.rotationRate,
             lock: this.lockPlayerTurning };
  }

  /**
   * `AttachPlayer`. Le meme `InitAttachment`, plus l'annonce.
   *
   * L'annonce se depose dans `this.events`, comme le vaisseau depose les
   * siennes : le portage n'a pas de `GlobalMessenger`, et la boucle draine.
   *
   * Le build passe a l'evenement le corps porteur ET le point exprime dans le
   * repere de CE porteur (`attachedOWRigidbody.InverseTransformPoint`). Ces
   * deux-la sont deja sur l'objet — `body` et `position`, cette derniere au
   * repos, donc dans un repere qui suit le porteur a une constante pres
   * (docs/46).
   */
  attach(joueur, now = 0, shift = null) {
    const r = this.init(joueur, now, shift);
    this.events.push("AttachPlayerToPoint");
    return r;
  }

  /**
   * `DetachPlayer`. Rend la vitesse a emporter : celle DU POINT, pas zero.
   *
   * @returns {{velocity:number[], unlock:boolean}}
   */
  detach(pointVelocity = [0, 0, 0]) {
    this.attached = false;
    this.inTelescope = false;
    this.events.push("DetachPlayerFromPoint");
    return { velocity: [pointVelocity[0], pointVelocity[1], pointVelocity[2]],
             unlock: true };
  }

  /**
   * `Update`, tant que l'on est accroche.
   *
   * @returns la position et l'orientation du joueur, ou null s'il est libre.
   */
  update(dt, now = 0, shift = null) {
    if (!this.attached) return null;
    const f = this.frame(shift);
    const t = slideFraction(dt, this.translationRate);
    const depuis = toWorld(f, this.localPosition);
    const cible = toWorld(f, this.attachOffset);
    const position = [depuis[0] + (cible[0] - depuis[0]) * t,
                      depuis[1] + (cible[1] - depuis[1]) * t,
                      depuis[2] + (cible[2] - depuis[2]) * t];
    // Le build remesure la position locale APRES avoir deplace le joueur : le
    // glissement repart donc de la, et non du point de depart d'origine.
    this.localPosition = toLocal(f, position);
    let rotation = null;
    if (this.matchRotation) {
      const local = qslerp(this.initLocalRotation, IDENTITE,
                           turnFraction(now - this.since, this.turnDuration));
      rotation = qmul(f.rotation, local);
    }
    return { position, rotation };
  }

  /** `OnEnterTelescopeView` : l'assise se suspend, le deplacement se libere. */
  enterTelescope() {
    if (this.inTelescope) return false;
    this.inTelescope = true;
    this.savedMatchRotation = this.matchRotation;
    this.matchRotation = false;
    return true;
  }

  /** `OnExitTelescopeView` : et le demi-tour RECOMMENCE, depuis ici. */
  exitTelescope(joueur, now = 0, shift = null) {
    if (!this.inTelescope) return null;
    this.inTelescope = false;
    this.matchRotation = this.savedMatchRotation;
    return this.init(joueur, now, shift);
  }
}

/**
 * Les points d'accrochage poses, et celui ou l'on est.
 *
 * Un seul a la fois : le build n'a pas de garde-fou pour cela, mais il n'a
 * jamais deux zones d'interaction assez proches pour que la question se pose.
 */
export class AttachPoints {
  constructor(data = []) {
    this.points = data.map((d) => new AttachPoint(d));
    this.current = null;
  }

  get count() { return this.points.length; }
  get attached() { return this.current !== null; }

  /** Le point pose a cette position, a la tolerance de la scene pres. */
  at(position, tolerance = 0.5) {
    let best = null, bestD = tolerance * tolerance;
    for (const p of this.points) {
      const d = (p.position[0] - position[0]) ** 2
              + (p.position[1] - position[1]) ** 2
              + (p.position[2] - position[2]) ** 2;
      if (d <= bestD) { best = p; bestD = d; }
    }
    return best;
  }

  attach(point, joueur, now = 0, shift = null) {
    if (!point) return null;
    if (this.current && this.current !== point) this.detach();
    this.current = point;
    return point.attach(joueur, now, shift);
  }

  detach(pointVelocity = [0, 0, 0]) {
    if (!this.current) return null;
    const r = this.current.detach(pointVelocity);
    this.current = null;
    return r;
  }

  /** Les annonces deposees depuis le dernier drainage, tous points confondus. */
  drain() {
    const out = [];
    for (const p of this.points) {
      if (p.events.length) { out.push(...p.events); p.events.length = 0; }
    }
    return out;
  }

  update(dt, now = 0, shift = null) {
    return this.current ? this.current.update(dt, now, shift) : null;
  }
}
