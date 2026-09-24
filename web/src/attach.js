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
import { horizonBasis } from "./start.js";

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
 * Un vecteur, qu'il vienne du portage ou de Babylon.
 *
 * Ce module vit du cote « logique pure » : il indexe `v[0]`, `v[1]`, `v[2]`.
 * Le moteur, lui, tient l'avant du joueur dans un `BABYLON.Vector3`, et le lui
 * passait tel quel. `v[0]` valait alors `undefined`, `Math.hypot` rendait NaN,
 * `normalize` retombait sur le vecteur nul, l'angle valait zero — et la duree
 * du demi-tour avec lui. **On s'asseyait d'un coup**, a tous les points
 * d'accrochage, depuis toujours, pendant que les controles mesuraient 1,8 s en
 * appelant la loi a la main avec un tableau (docs/97).
 *
 * Trois appelants faisaient la faute ; la garder au bord du module la rend
 * impossible a refaire par un quatrieme.
 */
function vec3(v) {
  if (!v) return null;
  if (Array.isArray(v)) return v;
  if (typeof v.x === "number") return [v.x, v.y, v.z];
  return v;
}

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
    this.localPosition = toLocal(f, vec3(joueur.position));
    // La rotation du joueur DANS le repere du point : c'est d'elle que part le
    // slerp vers l'identite, c'est-a-dire vers « aligne sur le point ».
    this.initLocalRotation = qmul(qconj(f.rotation), joueur.rotation || IDENTITE);
    // Gardee, et pas seulement consommee : c'est la seule trace de ce sur quoi
    // la duree a ete calculee, et donc la seule chose qu'un controle en
    // NAVIGATEUR peut interroger apres un vrai embarquement. Le defaut qui a
    // dormi ici — un `Vector3` la ou le module attend un tableau — ne se voit
    // pas dans `turnDuration`, qui vaut alors zero comme un joueur deja aligne.
    this.initForward = vec3(joueur.forward)
      || qrot(joueur.rotation || IDENTITE, [0, 0, 1]);
    this.turnDuration = turnDuration(this.initForward, this.forward(),
                                     this.rotationRate);
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
      const pos = (p.live && p.live.position) || p.position;
      const d = (pos[0] - position[0]) ** 2
              + (pos[1] - position[1]) ** 2
              + (pos[2] - position[2]) ** 2;
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

// --- perdre la gravite (docs/79-alignement.md) ------------------------------
//
// @lit AlignPlayerWithField
//
// Quitter un champ de gravite n'est pas seulement cesser de tomber : le jeu
// vous RETOURNE, et vous prend les commandes du regard pendant qu'il le fait.
//
//   BreakAlignment:
//       CenterCamera(50)                          la camera revient au centre
//       InitDiscreteRotation(corps, camera, 50)   le CORPS va ou le regard etait
//       FireEvent("BreakPlayerFieldAlignment")    -> _isInputLocked = true
//
//   InitAlignment:
//       FireEvent("InitPlayerFieldAlignment")     -> _isInputLocked = false
//                                                    StopSnapping()
//
// CINQUANTE DEGRES PAR SECONDE, et non les cent du point d'accrochage
// (docs/69). Se relever d'un siege est vif ; perdre le sol sous ses pieds est
// lent, et cette lenteur est le seul moment du jeu ou l'on ne commande plus
// rien. Un demi-tour complet dure 3,6 s.
//
// LA DUREE EST ENCORE UN ANGLE DIVISE PAR UN TAUX — la troisieme fois dans ce
// build, apres le demi-tour du siege et le recentrage de la camera. C'est une
// habitude de ce studio, et elle se reconnait maintenant a vue.
//
// CE QUE CE PORTAGE N'A PAS. Le build tourne le CORPS vers l'orientation de la
// CAMERA ; ici les deux n'en font qu'un — le regard EST l'orientation du
// joueur, tenu en lacet et tangage. La rotation discrete n'a donc rien a
// tourner, et ce qui reste est ce qui se sent : les commandes verrouillees et
// la camera qui revient au centre. C'est dit ici plutot que passe sous silence.

// --- SE REDRESSER PREND DU TEMPS (docs/106-redressement.md) -----------------
//
// @lit AlignWithDirection, AlignWithField
//
// `AlignWithDirection` n'etait lue nulle part, et elle porte la loi du
// mouvement : a quelle VITESSE le corps du joueur bascule vers un nouveau bas.
// Le portage prenait le bas du champ dominant tel quel, a chaque image. Changer
// de champ — se poser, passer d'une planete a sa lune, entrer dans une grotte —
// faisait donc basculer le monde d'un coup.
//
//   _currentDirection   = transform.TransformDirection(_localAlignmentAxis);
//   _alignmentDirection = GetAlignmentDirection();
//   _degreesToTarget    = Vector3.Angle(_currentDirection, _alignmentDirection);
//   if (_degreesToTarget == 0) _degreesToTarget = 0.0001f;
//   switch (_interpolationMode) {
//       1: _adjustedSlerpRate = _interpolationRate * fixedDeltaTime;
//       2: _adjustedSlerpRate = _interpolationRate / _degreesToTarget * fixedDeltaTime;
//       3: _adjustedSlerpRate = _interpolationRate / Pow(_degreesToTarget, 2) * fixedDeltaTime;
//   }
//   _adjustedSlerpRate = Mathf.Clamp01(_adjustedSlerpRate);
//   rigidbody.rotation = Slerp(identity, FromToRotation(courant, cible),
//                              _adjustedSlerpRate) * GetRotation();
//
// LE MODE 2 EST UNE VITESSE CONSTANTE, et il faut le calculer pour le voir. Le
// taux est une FRACTION du chemin restant ; diviser par l'ecart restant annule
// donc l'ecart : `rate * ecart = _interpolationRate * dt`. A cinquante hertz,
// c'est 2 degres par pas de physique quelle que soit la distance — soit
// **cent degres par seconde**, et 1,8 s pour un demi-tour complet.
//
// Sous deux degres, le taux depasse 1 et `Clamp01` le ramene : les deux
// derniers degres se franchissent d'un coup. Ce n'est pas une approximation,
// c'est la fin de l'interpolation.
//
// Le joueur porte `_localAlignmentAxis = (0, -1, 0)` : ce qu'on aligne est son
// BAS, sur la direction de l'acceleration. Et `_fieldStrengthThreshold` vaut 0,
// donc la moindre gravite suffit a se redresser (`CheckAlignmentRequirements`
// teste `magnitude > seuil`, strictement).

/** L'instance posee sur `Player_Body`, et elle est seule. */
export const ALIGN = { mode: 2, rate: 100, localAxis: [0, -1, 0],
                       usePhysics: false, fieldStrengthThreshold: 0,
                       steadyDegrees: 1 };

/**
 * `_adjustedSlerpRate` : la fraction du chemin restant parcourue CETTE image.
 *
 * Le `0.0001` du build n'est pas une precaution contre la division par zero —
 * il la remplace par un taux enorme, que `Clamp01` ramene a 1. Un corps deja
 * aligne le reste.
 */
export function slerpRate(degresRestants, dt, cfg = ALIGN) {
  const d = degresRestants === 0 ? 1e-4 : degresRestants;
  let r;
  if (cfg.mode === 1) r = cfg.rate * dt;
  else if (cfg.mode === 2) r = cfg.rate / d * dt;
  else if (cfg.mode === 3) r = cfg.rate / (d * d) * dt;
  else r = 1;
  return Math.min(1, Math.max(0, r));
}

/** Angle non signe entre deux directions, en degres — `Vector3.Angle`. */
function angleDeg(a, b) {
  const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
  if (!la || !lb) return 0;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

/**
 * Un pas de l'interpolation : la direction courante vers la cible.
 *
 * `Slerp(identity, FromToRotation(a, b), t)` applique a `a` n'est rien d'autre
 * que l'interpolation spherique de `a` vers `b` a la fraction `t`. On la fait
 * donc directement, sans passer par un quaternion qu'on jetterait aussitot.
 */
export function alignStep(courant, cible, dt, cfg = ALIGN) {
  const ecart = angleDeg(courant, cible);
  const t = slerpRate(ecart, dt, cfg);
  const lc = Math.hypot(...courant), lb = Math.hypot(...cible);
  if (!lc || !lb) return { direction: [...courant], degres: ecart, taux: t };
  const a = courant.map((v) => v / lc), b = cible.map((v) => v / lb);
  const cos = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const theta = Math.acos(cos);
  // Colineaires : rien a interpoler. Opposes : `FromToRotation` choisit un axe
  // perpendiculaire quelconque, et ce portage en fait autant.
  if (theta < 1e-6) return { direction: b, degres: ecart, taux: t };
  let out;
  if (Math.PI - theta < 1e-6) {
    const ref = Math.abs(a[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const n = [a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2],
               a[0] * ref[1] - a[1] * ref[0]];
    const ln = Math.hypot(...n);
    const u = n.map((v) => v / ln);
    const ang = Math.PI * t, s = Math.sin(ang), co = Math.cos(ang);
    const d = u[0] * a[0] + u[1] * a[1] + u[2] * a[2];
    out = [a[0] * co + (u[1] * a[2] - u[2] * a[1]) * s + u[0] * d * (1 - co),
           a[1] * co + (u[2] * a[0] - u[0] * a[2]) * s + u[1] * d * (1 - co),
           a[2] * co + (u[0] * a[1] - u[1] * a[0]) * s + u[2] * d * (1 - co)];
  } else {
    const s = Math.sin(theta);
    const k1 = Math.sin((1 - t) * theta) / s, k2 = Math.sin(t * theta) / s;
    out = [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  }
  const l = Math.hypot(...out) || 1;
  return { direction: out.map((v) => v / l), degres: ecart, taux: t };
}

/**
 * `KeepCameraSteady` : le tangage rend ce que le corps prend.
 *
 *   Vector3 plat = _alignmentDirection - Project(_alignmentDirection, transform.right);
 *   float deg = -Vector3.Angle(transform.TransformDirection(_localAlignmentAxis), plat)
 *             * Mathf.Sign(Vector3.Dot(transform.forward, _alignmentDirection));
 *   _playerCameraController.AddDegreesY(deg * _adjustedSlerpRate);
 *
 * `InitAlignment` allume ce drapeau a CHAQUE entree dans un champ, et
 * `FixedUpdate` l'eteint des que l'ecart passe sous un degre. Pendant tout le
 * redressement, la part de TANGAGE du mouvement est retiree du regard : le
 * corps pivote sous vous, la vue ne bouge pas. Sans cela, se poser fait
 * basculer l'horizon — ce qui est, au sens propre, le contraire de ce que le
 * jeu fait.
 *
 * Le lacet et le roulis, eux, ne sont PAS compenses : seule la composante
 * autour de l'axe droit de la camera l'est, et c'est ce que dit la projection.
 *
 * C'est la transcription litterale, et elle sert d'etalon a `steadyLook` — qui
 * est ce que ce portage applique, pour une raison ecrite la-bas.
 *
 * @returns {number} les degres de tangage a RETIRER, signes
 */
// @mesure
export function steadyPitch(upAvant, upApres, droite) {
  const plat = (v) => {
    const d = v[0] * droite[0] + v[1] * droite[1] + v[2] * droite[2];
    return [v[0] - droite[0] * d, v[1] - droite[1] * d, v[2] - droite[2] * d];
  };
  const a = plat(upAvant), b = plat(upApres);
  const la = Math.hypot(...a), lb = Math.hypot(...b);
  if (!la || !lb) return 0;
  const ang = angleDeg(a, b);
  // Le signe vient du sens de rotation autour de l'axe droit.
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
             a[0] * b[1] - a[1] * b[0]];
  const s = n[0] * droite[0] + n[1] * droite[1] + n[2] * droite[2];
  return s < 0 ? -ang : ang;
}

/**
 * Ce que ce portage applique : le regard ne bouge PAS, et les deux angles avec.
 *
 * POURQUOI PAS `steadyPitch` TEL QUEL. Le build n'ecrit qu'un `AddDegreesY`
 * parce que son CAP vit sur le `Rigidbody` : redresser le corps autour de son
 * axe droit ne change pas la reference a laquelle le lacet se mesure. Ici, le
 * lacet se mesure sur un repere d'horizon RE-DERIVE du haut a chaque image
 * (`horizonBasis`) — donc bouger le haut bouge aussi la reference du lacet, et
 * ne corriger que le tangage laisse la vue deriver. Mesure : pour huit degres
 * de redressement, 8,7 degres de derive sans rien, 3,4 avec le seul tangage.
 *
 * Les deux lois coincident quand le repere ne tourne pas — c'est le cas a
 * lacet nul, et le test le garde. Ce qui est reproduit est l'EFFET, qui est la
 * loi : pendant que le corps se redresse, la vue reste ou elle etait.
 *
 * @param fwdMonde l'avant AVANT le pas, en coordonnees monde
 * @param upApres  le haut APRES le pas
 * @returns {{yaw:number, pitch:number}} les angles a poser, en RADIANS
 */
export function steadyLook(fwdMonde, upApres) {
  const { up: u, east, north } = horizonBasis(upApres);
  const l = Math.hypot(...fwdMonde) || 1;
  const f = fwdMonde.map((v) => v / l);
  const k = f[0] * u[0] + f[1] * u[1] + f[2] * u[2];
  // `fwd = north*cy*cp + east*sy*cp - up*sp` : le tangage se lit sur la
  // composante verticale, le lacet sur ce qu'il en reste.
  const pitch = Math.asin(Math.max(-1, Math.min(1, -k)));
  const plat = [f[0] - u[0] * k, f[1] - u[1] * k, f[2] - u[2] * k];
  const lp = Math.hypot(...plat);
  // Regard exactement vertical : aucun azimut. On garde le lacet d'avant,
  // comme `yawFor` rend null dans ce cas.
  if (lp < 1e-9) return { yaw: null, pitch };
  const p = plat.map((v) => v / lp);
  const cy = p[0] * north[0] + p[1] * north[1] + p[2] * north[2];
  const sy = p[0] * east[0] + p[1] * east[1] + p[2] * east[2];
  return { yaw: Math.atan2(sy, cy), pitch };
}

/**
 * Le HAUT du joueur, qui rejoint celui du champ a cent degres par seconde.
 *
 * Etat pur : on lui donne le haut voulu et un pas de temps, il rend le haut a
 * appliquer. `steady` dit si le redressement est encore en cours, donc si le
 * tangage doit etre compense.
 */
export class UpAligner {
  constructor(cfg = ALIGN) {
    this.cfg = cfg;
    this.up = null;
    this.degres = 0;
    this.steady = false;    // `_keepCameraSteady`
  }

  /** `InitAlignment` : entrer dans un champ rallume la compensation. */
  init() { this.steady = true; }

  /**
   * @param cible le haut voulu, unitaire
   * @returns {{up:Array, tourne:number}} le haut a appliquer, et de combien de
   *   degres il a tourne cette image
   */
  update(cible, dt) {
    // Pas de champ : `_doAlignment` est faux, le corps garde son orientation.
    // Et tant qu'on n'a JAMAIS eu de champ, on ne se donne pas de haut : semer
    // une verticale du monde ferait converger le premier champ trouve depuis
    // elle, au lieu d'y etre deja.
    if (!cible) return { up: this.up, tourne: 0 };
    // La toute premiere image ne s'interpole pas : `_isFirstFrame` aligne le
    // joueur d'office, sans quoi une partie commencerait couche.
    if (!this.up) { this.up = [...cible]; this.degres = 0; this.steady = false;
                    return { up: this.up, tourne: 0 }; }
    const avant = this.up;
    const pas = alignStep(avant, cible, dt, this.cfg);
    this.degres = pas.degres;
    this.up = pas.direction;
    // `if (_degreesToTarget < 1f) _keepCameraSteady = false;` — le test porte
    // sur l'ecart AVANT le pas, comme dans le build.
    if (this.steady && pas.degres < this.cfg.steadyDegrees) this.steady = false;
    return { up: this.up, tourne: angleDeg(avant, this.up) };
  }

  reset() { this.up = null; this.degres = 0; this.steady = false; }
}

/** `BreakAlignment` passe 50 a `CenterCamera` et a `InitDiscreteRotation`. */
export const FIELD_ALIGN = { rate: 50 };

/**
 * `InitDiscreteRotation` : la duree est `Quaternion.Angle(from, to) / rate`.
 *
 * `Quaternion.Angle` rend l'angle du plus court chemin, en degres — d'ou le
 * facteur deux et la valeur absolue du produit scalaire.
 */
export function discreteRotationDuration(from, to, rate = FIELD_ALIGN.rate) {
  if (!(rate > 0)) return 0;
  const d = Math.abs(from[0] * to[0] + from[1] * to[1] + from[2] * to[2]
                   + from[3] * to[3]);
  const angle = 2 * Math.acos(Math.max(0, Math.min(1, d))) * 180 / Math.PI;
  return angle / rate;
}

/**
 * `AlignPlayerWithField.UpdateDiscreteRotation` — l'autre moitie, et elle est
 * refaite ailleurs.
 *
 *     t = (Time.time - _initDiscreteRotationTime) / _discreteRotationDuration;
 *     t = Mathf.SmoothStep(0f, 1f, t);
 *     _lastBetweenRotation = _betweenRotation;
 *     _betweenRotation = Quaternion.Slerp(_fromRotation, _toRotation, t);
 *     _owRigidbody.AddRotation(_betweenRotation * Inverse(_lastBetweenRotation));
 *     if (t >= 1f) _doDiscreteRotation = false;
 *
 * DEUX CHOSES, ET LES DEUX VIVENT DEJA DANS CE PORTAGE.
 *
 * L'adoucissement est un `SmoothStep`, pas une rampe : la rotation part
 * doucement et s'arrete doucement, sur la duree que `discreteRotationDuration`
 * ci-dessus calcule. C'est exactement `snapDegrees`, qui interpole les deux
 * degres du recentrage sous le meme `SmoothStep` — et c'est par la que
 * `main.js` mene ce mouvement.
 *
 * Et la rotation est AJOUTEE, jamais posee : `AddRotation(courante x
 * inverse(precedente))` n'applique que le PAS de l'image, si bien que ce que
 * le joueur fait tourner pendant ce temps n'est pas efface. Ce portage
 * re-derive son repere du haut a chaque image et rend le regard par
 * `steadyLook` : meme resultat, par l'autre bout (docs/106-redressement.md).
 */

/**
 * L'alignement du joueur sur son champ, et ce qu'il fait aux commandes.
 *
 * `CheckAlignmentRequirements` rend VRAI a la toute premiere image, quoi qu'il
 * arrive : le joueur est aligne des le reveil, avant meme qu'un champ ait pu
 * etre trouve. Sans cela, la premiere image d'une partie est une chute libre.
 */
export class FieldAlignment {
  constructor(cfg = FIELD_ALIGN) {
    this.cfg = cfg;
    this.aligned = true;      // `_isFirstFrame` rend vrai la premiere fois
    this.firstFrame = true;
    this.locked = false;
    this.since = 0;
    this.duration = 0;
  }

  /**
   * @param ecart soit un angle en degres, soit DEUX quaternions `[de, vers]` —
   *   la forme du build, qui divise `Quaternion.Angle(de, vers)` par le taux.
   *
   * Dans ce portage, « de » est la pose alignee sur l'horizon et « vers » la
   * meme plus le tangage : le regard EST l'orientation, et leur ecart est donc
   * exactement le tangage (docs/79-alignement.md).
   *
   * @returns {"init"|"break"|null} la transition, s'il y en a une.
   */
  update(dansUnChamp, now = 0, ecart = 0) {
    const angleDegres = Array.isArray(ecart)
      ? discreteRotationDuration(ecart[0], ecart[1], 1) : ecart;
    if (this.firstFrame) { this.firstFrame = false; dansUnChamp = true; }
    const veut = !!dansUnChamp;
    if (veut === this.aligned) {
      // La rotation discrete se termine toute seule, et rend les commandes.
      if (this.locked && now - this.since >= this.duration) this.locked = false;
      return null;
    }
    this.aligned = veut;
    if (veut) {
      // `OnInitPlayerFieldAlignment` : `_isInputLocked = false`, et le
      // recentrage en cours s'ARRETE (`StopSnapping`) — retrouver le sol rend
      // les commandes tout de suite, sans attendre la fin du mouvement.
      this.locked = false;
      this.duration = 0;
      return "init";
    }
    this.locked = true;
    this.since = now;
    this.duration = angleDegres / this.cfg.rate;
    return "break";
  }

  reset() {
    this.aligned = true; this.firstFrame = true; this.locked = false;
    this.since = 0; this.duration = 0;
  }
}
