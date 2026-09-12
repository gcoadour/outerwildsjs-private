// La vie du decor : ce qui bouge tout seul, et que rien ne lisait.
//
// Vingt-deux classes, 83 instances (docs/44-reste-a-migrer.md §3). Le lot etait
// donne premier dans l'ordre conseille — « immediat, et partout » — parce que
// trois de ses effets se voient a la seconde ou l'on entre dans une scene : les
// quinze panneaux vus de biais, les huit personnages a qui l'on parle dans le
// dos, et dix reacteurs qui ne repondent pas a la commande.
//
// Tout ce qui suit est lu dans l'IL, pas suppose.
//
// FaceActiveCamera (x15). Deux regimes, separes par `_useLookAt` :
//
//   _useLookAt        l'objet regarde la camera, franchement (les cinq plans
//                     de substitution des planetes lointaines)
//   sinon             `_localFacingVector` est amene sur la direction de la
//                     camera par la plus courte rotation, et si
//                     `_localRotationAxis` n'est pas nul on ANNULE d'abord la
//                     composante de cette direction le long de l'axe : le
//                     panneau tourne autour de son mat, il ne se couche pas.
//
// FacePlayerWhenTalking (x8). Le composant est ETEINT hors conversation et
// s'allume a `OnStartConversation`. Il projette la direction du joueur sur le
// plan horizontal du personnage (`transform.up` retire), prend l'angle signe
// avec son avant, et tourne par `Slerp(..., 0,1)` a chaque image — puis
// s'eteint des que l'angle passe sous un degre. Un personnage ne pivote donc
// pas d'un bloc : il se tourne, et s'arrete.
//
// ThrusterParticlesBehavior (x10). Chaque buse porte une valeur de l'enum
// `Thruster` et regarde UNE composante de l'acceleration locale du modele de
// poussee, avec un seuil de 1 :
//
//   0,1 Down_*      accel.y < -1        4 Left_      accel.x < -1
//   2,3 Forward_*   accel.z > +1        5 Right_     accel.x > +1
//   6,7 Backward_*  accel.z < -1        8,9 Up_*     accel.y > +1
//
// La table de saut du `switch` a ete DECODEE, pas devinee : les blocs de code
// ne sont pas dans l'ordre des cas, et lire l'IL de haut en bas donnait
// « Left_Thruster joue sur la poussee arriere ».
//
// AncientTeleporter (x6). Le seul du lot a changer la topologie du monde. Il
// part tout seul quand trois conditions tiennent en meme temps :
//
//   alignement   angle(vers l'arrivee, mon axe Y) < _alignmentWindow / 2
//   occlusion    180 - angle(moi vu du soleil, l'arrivee vue du soleil)
//                > _solarOcclusionWindow / 2, c'est-a-dire : le soleil n'est
//                PAS entre les deux
//   delai        cinq secondes depuis le dernier depart
//
// Quatre des six visent leur arrivee directement ; deux passent par
// `_alternateViewTarget`, et c'est cette cible-la qui compte pour l'alignement.

import { insideVolume } from "./gravity.js";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Vecteur unitaire, ou le vecteur nul s'il ne l'est pas. */
export function normalize(v) {
  const l = len(v);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
}

/**
 * Composante d'un vecteur retiree le long d'un axe — `Vector3.Project` en
 * negatif.
 *
 * Unity rend le vecteur nul quand l'axe l'est, et c'est ce qui fait marcher
 * `FaceActiveCamera` sans branche : un `_localRotationAxis` nul laisse le
 * vecteur intact, et l'objet regarde librement la camera.
 */
export function projectOut(v, axis) {
  const l2 = dot(axis, axis);
  if (l2 < 1e-12) return v.slice();
  const k = dot(v, axis) / l2;
  return [v[0] - axis[0] * k, v[1] - axis[1] * k, v[2] - axis[2] * k];
}

/**
 * Quaternion de la plus courte rotation qui amene `from` sur `to`
 * (`Quaternion.FromToRotation`), en [x, y, z, w].
 *
 * Le cas oppose (produit scalaire proche de -1) n'a pas d'axe naturel : on en
 * prend un perpendiculaire quelconque, ce que fait Unity aussi. Sans ce cas,
 * un panneau exactement dos a la camera produisait un quaternion nul et
 * gardait son orientation.
 */
export function fromToRotation(from, to) {
  const a = normalize(from), b = normalize(to);
  if (!len(a) || !len(b)) return [0, 0, 0, 1];
  const d = dot(a, b);
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) {
    const axis = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const p = normalize([a[1] * axis[2] - a[2] * axis[1],
                         a[2] * axis[0] - a[0] * axis[2],
                         a[0] * axis[1] - a[1] * axis[0]]);
    return [p[0], p[1], p[2], 0];
  }
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
             a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const n = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / n, c[1] / n, c[2] / n, w / n];
}

/** Angle non signe entre deux directions, en degres (`Vector3.Angle`). */
export function angleBetween(a, b) {
  const u = normalize(a), v = normalize(b);
  if (!len(u) || !len(v)) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180 / Math.PI;
}

/**
 * Angle signe de `from` vers `to` autour de `up`, en degres.
 *
 * C'est ce que mesure `FacePlayerWhenTalking` : le signe dit de quel cote le
 * personnage doit tourner, et sa valeur absolue quand s'arreter.
 */
export function signedAngleAround(up, from, to) {
  const n = normalize(up);
  const a = normalize(projectOut(from, n)), b = normalize(projectOut(to, n));
  if (!len(a) || !len(b)) return 0;
  const angle = angleBetween(a, b);
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                 a[0] * b[1] - a[1] * b[0]];
  return dot(cross, n) < 0 ? -angle : angle;
}

// --- les visages qui se tournent -------------------------------------------

/** Ce que le build interpole par image, et le degre sous lequel il s'arrete. */
export const FACE_SLERP = 0.1;
export const FACE_DONE_DEGREES = 1;

/**
 * Un pas de rotation vers le joueur.
 *
 * @returns {{angle:number, step:number, done:boolean}} l'angle restant,
 *          l'angle a appliquer cette image, et si le personnage a fini.
 */
export function facePlayerStep(up, forward, toPlayer, slerp = FACE_SLERP) {
  const angle = signedAngleAround(up, forward, toPlayer);
  return { angle, step: angle * slerp,
           done: Math.abs(angle) < FACE_DONE_DEGREES };
}

/** Les huit personnages qui se tournent quand on leur parle. */
export function talkingFaces(gameplay) {
  return ((gameplay.placed || {}).FacePlayerWhenTalking || []).map((c) => ({
    name: c.name, body: c.body || null, position: c.position,
  }));
}

/** Les quinze panneaux, avec leur regime et leurs deux vecteurs locaux. */
export function billboards(gameplay) {
  return ((gameplay.placed || {}).FaceActiveCamera || []).map((c) => {
    const f = c.fields || {};
    const v = (x, d) => (x ? [x.x, x.y, x.z] : d);
    return {
      name: c.name, body: c.body || null, position: c.position,
      facing: v(f._localFacingVector, [0, 0, 1]),
      axis: v(f._localRotationAxis, [0, 0, 0]),
      lookAt: !!f._useLookAt,
    };
  });
}

// --- les buses du vaisseau -------------------------------------------------

/**
 * Les dix buses, par valeur de l'enum `Thruster`.
 *
 * `axis` est la composante lue de l'acceleration locale, `sign` le sens
 * qu'elle doit avoir pour que la buse s'allume. Le seuil est 1, partout.
 */
export const THRUSTER_NOZZLES = [
  { name: "Down_LeftThruster", axis: 1, sign: -1 },
  { name: "Down_RightThruster", axis: 1, sign: -1 },
  { name: "Forward_LeftThruster", axis: 2, sign: 1 },
  { name: "Forward_RightThruster", axis: 2, sign: 1 },
  { name: "Left_Thruster", axis: 0, sign: -1 },
  { name: "Right_Thruster", axis: 0, sign: 1 },
  { name: "Backward_LeftThruster", axis: 2, sign: -1 },
  { name: "Backward_RightThruster", axis: 2, sign: -1 },
  { name: "Up_LeftThruster", axis: 1, sign: 1 },
  { name: "Up_RightThruster", axis: 1, sign: 1 },
];

export const THRUSTER_THRESHOLD = 1;

/** Une buse s'allume-t-elle, pour cette acceleration locale ? */
export function nozzleFires(thruster, localAccel) {
  const n = THRUSTER_NOZZLES[thruster];
  if (!n || !localAccel) return false;
  const a = localAccel[n.axis] || 0;
  return n.sign > 0 ? a > THRUSTER_THRESHOLD : a < -THRUSTER_THRESHOLD;
}

/** Les dix buses posees, avec la valeur d'enum de chacune. */
export function thrusterNozzles(gameplay) {
  return ((gameplay.placed || {}).ThrusterParticlesBehavior || []).map((c) => ({
    name: c.name, body: c.body || null,
    thruster: (c.fields || {})._thruster ?? 0,
  }));
}

// --- ce qui part a intervalle irregulier ------------------------------------

/**
 * Minuterie a intervalle tire au sort, partagee par `RandomParticleBursts`
 * (x18, 1 a 3 s) et `MeteorLauncher` (x4, 5 a 20 s, un a 15 a 20).
 *
 * Le tirage est injecte pour que l'invariant puisse le figer : le build prend
 * `Random.Range`, ce qui n'est pas verifiable, mais la MECANIQUE — un delai
 * tire a chaque declenchement, jamais deux fois le meme — l'est.
 */
export class RandomTimer {
  constructor(min, max, rng = Math.random) {
    this.min = min;
    this.max = max;
    this.rng = rng;
    this.elapsed = 0;
    this.delay = min + (max - min) * rng();
  }

  /** @returns {boolean} vrai l'image ou le delai echoit. */
  update(dt) {
    this.elapsed += dt;
    if (this.elapsed < this.delay) return false;
    this.elapsed = 0;
    this.delay = this.min + (this.max - this.min) * this.rng();
    return true;
  }
}

/** Les dix-huit bouffees de particules, avec leurs deux delais. */
export function particleBursts(gameplay) {
  return ((gameplay.placed || {}).RandomParticleBursts || []).map((c) => {
    const f = c.fields || {};
    return { name: c.name, body: c.body || null, position: c.position,
             min: f._minDelay ?? 1, max: f._maxDelay ?? 3,
             looping: f._looping !== false };
  });
}

/** Les quatre lanceurs de meteores de la lune volcanique. */
export function meteorLaunchers(gameplay) {
  return ((gameplay.placed || {}).MeteorLauncher || []).map((c) => {
    const f = c.fields || {};
    const d = f._launchDirection || { x: 0, y: 1, z: 0 };
    return {
      name: c.name, body: c.body || null, position: c.position,
      minSpeed: f._minLaunchSpeed ?? 50, maxSpeed: f._maxLaunchSpeed ?? 150,
      minInterval: f._minInterval ?? 5, maxInterval: f._maxInterval ?? 20,
      direction: [d.x, d.y, d.z], radius: f._projectileRadius ?? 10,
      emitSeconds: f._particleEmitDuration ?? 3,
    };
  });
}

// --- les six passages anciens ----------------------------------------------

/** Le delai minimal entre deux departs, lu dans l'IL. */
export const TELEPORT_COOLDOWN = 5;

/** Les six passages, avec leur arrivee resolue. */
export function teleporters(gameplay) {
  return ((gameplay.placed || {}).AncientTeleporter || []).map((c) => {
    const f = c.fields || {};
    const t = c.targets || {};
    return {
      name: c.name, body: c.body || null,
      position: c.position, rotation: c.rotation || null, volume: c.volume || null,
      receiver: t._receiver || null,
      // La cible de VUE n'est pas toujours l'arrivee : deux passages visent un
      // troisieme objet, et c'est sur lui que l'alignement se mesure.
      viewTarget: t._alternateViewTarget || t._receiver || null,
      alignmentWindow: f._alignmentWindow ?? 5,
      occlusionWindow: f._solarOcclusionWindow ?? 20,
    };
  });
}

/**
 * Le passage part-il ?
 *
 * @param alignAngle      angle entre la cible de vue et l'axe Y du passage
 * @param occlusionAngle  180 - angle(moi, l'arrivee) vus du soleil
 * @param since           secondes depuis le dernier depart
 */
export function teleporterFires(t, alignAngle, occlusionAngle, since) {
  return occlusionAngle > t.occlusionWindow / 2
      && alignAngle < t.alignmentWindow / 2
      && since > TELEPORT_COOLDOWN;
}

/**
 * Les six passages, suivis image par image.
 *
 * Les positions passees sont des positions MONDE : les jumelles orbitent et
 * tournent, et c'est precisement ce qui ouvre puis ferme les fenetres
 * d'alignement — un passage qui ne part jamais est un passage mal place.
 */
export class Teleporters {
  constructor(list = []) {
    this.list = list;
    this.since = list.map(() => TELEPORT_COOLDOWN);
    this.lastFired = null;
  }

  get count() { return this.list.length; }

  /**
   * @param at    position monde du joueur, ou null s'il n'est nulle part
   * @param sun   position monde de l'etoile
   * @param world (t) -> { self, up, target, receiver } positions monde du moment
   * @returns {object|null} le passage qui vient de partir, avec son arrivee
   */
  update(dt, at, sun, world) {
    this.lastFired = null;
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      this.since[i] += dt;
      const w = world(t);
      if (!w || !w.self || !w.target) continue;
      const align = angleBetween(sub(w.target, w.self), w.up || [0, 1, 0]);
      const occ = 180 - angleBetween(sub(w.self, sun), sub(w.target, sun));
      if (!teleporterFires(t, align, occ, this.since[i])) continue;
      this.since[i] = 0;
      // Le depart a lieu meme sans personne dedans — le build le declenche sur
      // la geometrie du systeme, pas sur la presence. Ce qui change, c'est
      // qu'il emporte ou non le joueur.
      const carries = !!(at && t.volume && insideVolume(t, at));
      this.lastFired = { teleporter: t, carries, arrival: w.receiver || w.target };
      return this.lastFired;
    }
    return null;
  }
}

/** Les trois passages de Dark Bramble (`DerelictWarp`), et leur jumeau. */
export function warps(gameplay) {
  return ((gameplay.placed || {}).DerelictWarp || []).map((c) => {
    const f = c.fields || {};
    const p = f._localArrivalPos || { x: 0, y: 0, z: 0 };
    return {
      name: c.name, body: c.body || null, position: c.position,
      rotation: c.rotation || null, volume: c.volume || null,
      sister: (c.targets || {})._sisterWarp || null,
      onExit: !!f._warpOnExit,
      arrivalLocal: [p.x, p.y, p.z],
    };
  });
}

// --- le rattachement a la geometrie chargee --------------------------------

/** Produit de deux quaternions [x, y, z, w], dans l'ordre d'Unity : a puis b. */
export function qmul(b, a) {
  return [b[3] * a[0] + b[0] * a[3] + b[1] * a[2] - b[2] * a[1],
          b[3] * a[1] - b[0] * a[2] + b[1] * a[3] + b[2] * a[0],
          b[3] * a[2] + b[0] * a[1] - b[1] * a[0] + b[2] * a[3],
          b[3] * a[3] - b[0] * a[0] - b[1] * a[1] - b[2] * a[2]];
}

/**
 * `Quaternion.LookRotation` : l'axe Z sur `forward`, l'axe Y au plus pres de
 * `up`. Rendu en [x, y, z, w].
 *
 * Passe par la matrice de base plutot que par deux rotations enchainees : le
 * roulis est alors pose une fois, et non deduit d'un ordre d'application.
 */
export function lookRotation(forward, up = [0, 1, 0]) {
  const f = normalize(forward);
  if (!len(f)) return [0, 0, 0, 1];
  let r = normalize([up[1] * f[2] - up[2] * f[1],
                     up[2] * f[0] - up[0] * f[2],
                     up[0] * f[1] - up[1] * f[0]]);
  if (!len(r)) r = Math.abs(f[1]) < 0.9 ? normalize([f[2], 0, -f[0]]) : [1, 0, 0];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2],
             f[0] * r[1] - f[1] * r[0]];
  const m = [r, u, f];                       // colonnes X, Y, Z de la base
  const tr = m[0][0] + m[1][1] + m[2][2];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [(m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s,
            (m[0][1] - m[1][0]) / s, 0.25 * s];
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    return [0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s,
            (m[1][2] - m[2][1]) / s];
  }
  if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    return [(m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s,
            (m[2][0] - m[0][2]) / s];
  }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
  return [(m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s,
          (m[0][1] - m[1][0]) / s];
}

/** Inverse d'un quaternion unitaire. */
export function qconj(q) { return [-q[0], -q[1], -q[2], q[3]]; }

/** Rotation d'un vecteur par un quaternion. */
export function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

/**
 * Le decor vivant, rattache a la geometrie a mesure qu'elle arrive.
 *
 * Meme rattachement PAR NOM que le sable et les textures qui defilent
 * (`sand.js`, `texanim.js`), et pour la meme raison : la position extraite est
 * celle de la scene au repos, et tout orbite. On ne travaille ici que sur des
 * noeuds — lus, tournes — sans jamais importer Babylon : la classe se teste
 * donc avec de faux noeuds, et c'est ce que fait tests/09-jeu.mjs.
 */
export class DecorField {
  constructor(panels = [], faces = []) {
    this.panels = panels;
    this.faces = faces;
    this.livePanels = [];   // { noeud, panneau }
    this.liveFaces = [];    // { noeud, personnage, actif }
  }

  get total() { return this.panels.length + this.faces.length; }
  get count() { return this.livePanels.length + this.liveFaces.length; }

  attach(nodes) {
    if (!nodes || !nodes.length) return 0;
    let n = 0;
    const take = (list, live, key) => {
      for (const item of list) {
        if (live.some((x) => x[key] === item)) continue;
        const node = nodes.find((m) => m.name === item.name);
        if (!node) continue;
        live.push({ noeud: node, [key]: item });
        n += 1;
      }
    };
    take(this.panels, this.livePanels, "panneau");
    take(this.faces, this.liveFaces, "personnage");
    return n;
  }

  /** Rotation MONDE d'un noeud, ramenee en rotation locale avant d'etre posee. */
  _setWorld(node, world) {
    const parent = node.parent;
    const pabs = parent && parent.absoluteRotationQuaternion;
    const local = pabs ? qmul(qconj([pabs.x, pabs.y, pabs.z, pabs.w]), world) : world;
    // Un noeud importe peut porter des angles d'Euler plutot qu'un quaternion :
    // on le convertit une fois, sinon le panneau ne tournerait jamais et rien
    // ne le dirait.
    if (!node.rotationQuaternion) {
      if (node.rotation && node.rotation.toQuaternion) {
        node.rotationQuaternion = node.rotation.toQuaternion();
      } else return;
    }
    node.rotationQuaternion.set
      ? node.rotationQuaternion.set(local[0], local[1], local[2], local[3])
      : Object.assign(node.rotationQuaternion,
          { x: local[0], y: local[1], z: local[2], w: local[3] });
  }

  _worldOf(node) {
    const q = node.absoluteRotationQuaternion || node.rotationQuaternion;
    return q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1];
  }

  _positionOf(node) {
    const p = node.getAbsolutePosition ? node.getAbsolutePosition() : node.position;
    return p ? [p.x, p.y, p.z] : [0, 0, 0];
  }

  /**
   * @param camera   position de la camera dans le repere de rendu
   * @param player   position du joueur, meme repere
   * @param talkingTo nom du personnage a qui l'on parle, ou null
   */
  update(camera, player, talkingTo = null) {
    for (const { noeud, panneau } of this.livePanels) {
      const rot = this._worldOf(noeud);
      const pos = this._positionOf(noeud);
      const toCam = sub(camera, pos);
      if (panneau.lookAt) {
        // `LookAt` d'Unity : l'axe Z regarde la cible, le haut du monde sert de
        // reference de roulis. On le calcule plutot que d'appeler le service du
        // moteur, pour que la classe reste sans dependance — et parce que la
        // convention d'axes entre Unity et le glTF exporte est justement ce qui
        // a fait echouer deux orientations de la voute celeste
        // (docs/41-ciel.md) : ici, au moins, elle est ecrite.
        this._setWorld(noeud, lookRotation(toCam, [0, 1, 0]));
        continue;
      }
      const facingWorld = qrot(rot, panneau.facing);
      const axisWorld = qrot(rot, panneau.axis);
      const target = projectOut(toCam, axisWorld);
      if (!len(target)) continue;
      this._setWorld(noeud, qmul(fromToRotation(facingWorld, target), rot));
    }

    for (const f of this.liveFaces) {
      const parle = talkingTo && f.personnage.name === talkingTo;
      // Le composant est ETEINT hors conversation, et se rallume au debut de
      // chaque conversation : on reprend le meme cycle, faute de quoi un
      // personnage deja tourne ne se retournerait plus jamais.
      if (parle && !f.actif) { f.actif = true; f.fini = false; }
      if (!parle) { f.actif = false; continue; }
      if (f.fini) continue;
      const rot = this._worldOf(f.noeud);
      const pos = this._positionOf(f.noeud);
      const up = qrot(rot, [0, 1, 0]);
      const forward = qrot(rot, [0, 0, 1]);
      const { step, done } = facePlayerStep(up, forward, sub(player, pos));
      if (done) { f.fini = true; continue; }
      const a = step * Math.PI / 360;   // demi-angle, en radians
      const s = Math.sin(a), u = normalize(up);
      this._setWorld(f.noeud,
        qmul([u[0] * s, u[1] * s, u[2] * s, Math.cos(a)], rot));
    }
  }
}
