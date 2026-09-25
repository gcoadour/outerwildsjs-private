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

// @lit TornadoPivotController, MatchTransform, DisposableContainer
// @lit AncientTeleporter, AncientTeleportReceiver
// Les pivots qui basculent, les suiveurs, et les conteneurs d'editeur qu'on
// ne porte pas — comptes pour que la question ne se repose plus.

import { insideVolume } from "./gravity.js";

export const TELEPORT_EVENTS = {
  enterCentral: "EnterTimeLoopCentral",
  exitCentral: "ExitTimeLoopCentral",
  teleportPlayer: "TeleportPlayer",
  fireAllTeleporters: "FireAllTeleporters",
};

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

/**
 * ET LE DEPART N'EST PAS L'ARRIVEE : une demi-seconde les separe.
 *
 *     AncientTeleporter.FireTeleporter()
 *         _teleportParticles.Play();
 *         audio.PlayOneShot(_teleportSound);
 *         _receiver.TeleportBody(_playerBody, 0.5f);
 *         FireEvent("TeleportPlayer");
 *         _lastFireTime = Time.time;
 *
 *     AncientTeleportReceiver.TeleportBody(corps, delai)
 *         if (delai > 0f) { _incomingBody = corps; _teleportTime = Time.time;
 *                           _teleportDelay = delai; enabled = true; }
 *         else            RelocateBody(corps);
 *
 * Les particules et le son partent TOUT DE SUITE, le corps une demi-seconde
 * plus tard. Le portage faisait tout dans la meme image : on entendait le
 * passage au moment ou l'on etait deja de l'autre cote.
 *
 * Le zero de `TeleportBody` est la porte de service, et elle sert :
 * `TimeLoopTeleportReceiver.RelocateBody` appelle directement la relocalisation
 * — le retour au debut de boucle est instantane, lui, et annonce en plus
 * `EnterTimeLoopCentral` (docs/121-avis.md).
 */
export const TELEPORT_DELAY = 0.5;

/**
 * Les six passages, avec leur arrivee resolue.
 *
 * `_receiver` est resolu par `ownerInfo`, qui rend un nom, une position et un
 * corps — mais PAS de rotation. Or `RelocateBody` pose la rotation du
 * recepteur sur ce qui arrive. On rejoint donc le recepteur POSE, qui la porte
 * depuis que `WANT_ROTATION` le compte (docs/111-passages.md).
 */
export function teleporters(gameplay) {
  const recepteurs = (gameplay.placed || {}).AncientTeleportReceiver || [];
  const poseDe = (info) => {
    if (!info) return null;
    // Par le nom quand il suffit, par la position sinon : deux recepteurs
    // peuvent porter le meme nom, aucun ne partage un point de l'espace.
    let best = null, bestD = 1;
    for (const r of recepteurs) {
      const d = Math.hypot(r.position[0] - info.position[0],
                           r.position[1] - info.position[1],
                           r.position[2] - info.position[2]);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best && best.rotation ? best.rotation : null;
  };
  return ((gameplay.placed || {}).AncientTeleporter || []).map((c) => {
    const f = c.fields || {};
    const t = c.targets || {};
    return {
      name: c.name, body: c.body || null,
      position: c.position, rotation: c.rotation || null, volume: c.volume || null,
      receiver: t._receiver || null,
      // La pose du recepteur : c'est elle qu'on prend en arrivant.
      receiverRotation: poseDe(t._receiver),
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
    // Ce qui vient de PARTIR — particules et son — et qui n'est pas encore
    // arrive. `update` le rend en arrivant, une demi-seconde plus tard.
    this.depart = null;
    this.enVol = null;
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
    this.depart = null;
    // Le corps EN VOL arrive quand son delai est ecoule, et il arrive avant
    // qu'un nouveau depart ne soit examine.
    if (this.enVol) {
      this.enVol.reste -= dt;
      if (this.enVol.reste <= 0) {
        this.lastFired = this.enVol.record;
        this.enVol = null;
        return this.lastFired;
      }
    }
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
      const record = { teleporter: t, carries, arrival: w.receiver || w.target,
                       // `SetRotation(transform.rotation)` : l'avant et le
                       // haut du recepteur, si la scene les donne.
                       forward: w.receiverForward || null,
                       up: w.receiverUp || null };
      // `FireTeleporter` joue les particules et le son ICI, et confie le corps
      // au recepteur avec un delai d'une demi-seconde.
      this.depart = record;
      this.enVol = { record, reste: TELEPORT_DELAY };
      return null;
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

/**
 * Les trois passages, et ce qu'ils font au corps qui les traverse.
 *
 * @lit DerelictWarp
 *
 * LE RESEAU. Trois volumes, et un seul aller-retour :
 *
 *   DarkBrambleShortcut   sur Timber Hearth, sphere de 50  -> Dark Bramble
 *   WarpVolume            sur Dark Bramble, sphere de 60   -> l'epave
 *   WarpVolume            sur l'epave, sphere de 550, SUR LA SORTIE -> Dark Bramble
 *
 * Le premier est INACTIF dans la scene (`m_IsActive` a 0) et rien ne le
 * rallume : le moteur ne le recoit pas (`actifsSeulement`, docs/132), et la
 * partie n'a que les deux autres — comme l'alpha.
 *
 * Le troisieme porte `_warpOnExit` : on ne quitte pas la dimension de l'epave
 * en entrant quelque part, mais en SORTANT de sa sphere. C'est ce qui la rend
 * close — elle n'a pas de porte, elle a un bord.
 *
 * LE DELAI. `_warpDuration` vaut 6 dans le constructeur, et `Update` deplace le
 * corps a la MOITIE : trois secondes apres etre entre, au milieu de l'eclair de
 * brouillard que `StartFogFlash` allume. On ne disparait pas a l'instant ou l'on
 * touche le volume — on s'enfonce, le brouillard monte, et on est ailleurs.
 *
 * Une sortie, elle, est immediate : `OnTriggerExit` deplace sans attendre.
 *
 * LA SECONDE D'APRES-ARRIVEE. Les deux declencheurs refusent d'agir tant que
 * `Time.time <= _arrivalTime + 1`. Sans cela, arriver DANS le volume jumeau
 * renverrait aussitot d'ou l'on vient, sans fin.
 *
 * ET ON ARRIVE EN MOUVEMENT : dix unites par seconde le long de l'axe qui va du
 * point d'arrivee au centre du passage — vers le centre quand on entre dans
 * l'epave, en s'en eloignant sinon. On ne se materialise pas immobile.
 *
 * DEUX ARGUMENTS MORTS DANS LE BUILD. `WarpBody` calcule une rotation
 * (`FromToRotation`) et une vitesse projetee, les passe a `ReceiveWarpedBody`…
 * qui ne lit ni l'une ni l'autre. Le portage ne les reproduit donc pas, et le
 * dit ici : c'est une mesure sur l'IL, pas un raccourci.
 */
export const WARP = { duration: 6, arrivalGuard: 1, exitSpeed: 10 };

/**
 * L'ECLAIR DE BROUILLARD, et ses deux formes.
 *
 * `DerelictWarp` ne fait pas clignoter l'ecran : il epaissit le BROUILLARD.
 * Les deux appels sont ecrits a cote du deplacement, et le portage n'avait ni
 * l'un ni l'autre — il jouait a la place l'eclair bleu du teleporteur ancien,
 * qui appartient a une tout autre mecanique.
 *
 *   OnTriggerEnter : StartFogFlash(0.5f, _warpDuration * 0.5f, _warpDuration * 0.5f)
 *   OnTriggerExit  : StartFogFlash(0.5f, 0f, _warpDuration * 0.5f)
 *
 * Soit, avec `_warpDuration` a 6 : trois secondes pour monter, trois pour
 * redescendre — et le deplacement tombe EXACTEMENT au sommet. Sur une sortie,
 * la montee est nulle : le brouillard est deja dense a l'instant ou l'on
 * bascule, et il se dissipe en trois secondes de l'autre cote.
 */
export function fogFlashOf(cfg = WARP, onExit = false) {
  const moitie = cfg.duration * 0.5;
  return { peak: 0.5, fadeIn: onExit ? 0 : moitie, fadeOut: moitie };
}

export class DerelictWarps {
  constructor(list = [], cfg = WARP) {
    this.warps = list.map((w) => ({ data: w, arrivedAt: -Infinity, since: null }));
    this.cfg = cfg;
    this.events = [];
    // Les eclairs de brouillard demandes depuis le dernier drainage. Ils ne
    // partent pas au meme instant que le deplacement — celui d'une ENTREE part
    // trois secondes avant — et ils ne peuvent donc pas etre la valeur de
    // retour d'`update`.
    this.flashes = [];
    // Le jumeau, par nom ET par corps : deux `WarpVolume` portent le meme nom.
    for (const w of this.warps) {
      const s = w.data.sister;
      w.jumeau = s
        ? this.warps.find((o) => o.data.name === s.name && o.data.body === s.body)
        : null;
    }
  }

  get count() { return this.warps.length; }

  /** Le passage le plus proche dont le volume contient le point, ou null. */
  at(worldPoint, shiftOf = null) {
    for (const w of this.warps) {
      if (!w.data.volume) continue;
      const d = shiftOf ? (shiftOf(w.data) || [0, 0, 0]) : [0, 0, 0];
      const p = [worldPoint[0] - d[0], worldPoint[1] - d[1], worldPoint[2] - d[2]];
      if (insideVolume(w.data, p)) return w;
    }
    return null;
  }

  /**
   * @returns {{warp, arrival:number[], velocity:number[]}|null} le depart,
   *   quand il a lieu — donc trois secondes apres l'entree, ou tout de suite
   *   sur une sortie.
   */
  update(dt, now, worldPoint, shiftOf = null) {
    const dedans = this.at(worldPoint, shiftOf);
    for (const w of this.warps) {
      const ici = w === dedans;
      const garde = now <= w.arrivedAt + this.cfg.arrivalGuard;
      if (w.data.onExit) {
        // Sur la SORTIE : c'est le passage de dedans a dehors qui compte.
        if (w.etait && !ici && !garde) {
          w.etait = ici;
          // `OnTriggerExit` : pas de montee, le brouillard est deja la.
          this.flashes.push(fogFlashOf(this.cfg, true));
          return this.partir(w, now, shiftOf);
        }
        w.etait = ici;
        continue;
      }
      w.etait = ici;
      if (ici && w.since === null && !garde) {
        w.since = now;
        // `OnTriggerEnter` allume l'eclair A L'ENTREE, pas au depart : c'est
        // lui qui fait les trois secondes d'enfoncement.
        this.flashes.push(fogFlashOf(this.cfg, false));
      }
      if (!ici) w.since = null;
      if (w.since !== null && now - w.since >= this.cfg.duration / 2) {
        w.since = null;
        return this.partir(w, now, shiftOf);
      }
    }
    return null;
  }

  /** Le jumeau recoit : `ReceiveWarpedBody`. */
  partir(w, now, shiftOf = null) {
    const j = w.jumeau;
    if (!j) return null;
    const d = shiftOf ? (shiftOf(j.data) || [0, 0, 0]) : [0, 0, 0];
    const centre = [j.data.position[0] + d[0], j.data.position[1] + d[1],
                    j.data.position[2] + d[2]];
    const local = qrot(j.data.rotation || [0, 0, 0, 1], j.data.arrivalLocal || [0, 0, 0]);
    const arrival = [centre[0] + local[0], centre[1] + local[1], centre[2] + local[2]];
    const vers = normalize([centre[0] - arrival[0], centre[1] - arrival[1],
                            centre[2] - arrival[2]]);
    const signe = j.data.onExit ? 1 : -1;
    j.arrivedAt = now;
    j.since = null;
    j.etait = true;
    this.events.push(j.data.onExit ? "EnterDerelictZone" : "ExitDerelictZone");
    return {
      warp: w.data, receiver: j.data, arrival,
      velocity: [vers[0] * this.cfg.exitSpeed * signe,
                 vers[1] * this.cfg.exitSpeed * signe,
                 vers[2] * this.cfg.exitSpeed * signe],
    };
  }

  drain() { const e = this.events; this.events = []; return e; }

  /** Les eclairs de brouillard demandes depuis le dernier appel. */
  drainFlashes() { const f = this.flashes; this.flashes = []; return f; }
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

/**
 * Le pivot des tornades : une lente culbute.
 *
 * `TornadoPivotController` n'a qu'un champ, `_speed`, et il n'est **serialise
 * sur aucune des six instances** : `Awake` le TIRE entre 1 et 2 degres par
 * seconde, puis fait tourner le pivot d'un angle tire entre 0 et 360 autour de
 * son axe Y local. Ensuite, chaque pas de physique :
 *
 *     rotation = AngleAxis(_speed x dt, transform.right) x rotation
 *
 * Autour de l'axe X, pas de l'axe Y : la tornade ne tourne pas sur elle-meme,
 * elle BASCULE lentement. Ce qui tourne sur soi est la colonne d'air, et sa
 * poussee est lue depuis longtemps (docs/39-fluides.md) — ce pivot-ci est ce
 * qui la fait pencher et derivera.
 *
 * Les deux tirages sont ceux du build, et c'est pourquoi ce module les fait
 * aussi : une culbute identique sur les six tornades se verrait.
 */
export function tornadoPivots(gameplay, random = Math.random) {
  return ((gameplay.placed || {}).TornadoPivotController || []).map((c) => ({
    name: c.name,
    position: c.position,
    body: c.body || null,
    // Random.Range(1f, 2f) : degres par seconde.
    speed: 1 + random(),
    // Random.Range(0f, 360f) autour de l'axe Y local, une fois, au reveil.
    initialSpin: random() * 360,
  }));
}

/**
 * Les trois `MatchTransform` : un objet qui suit un autre transform.
 *
 * `Update` copie la position et/ou la rotation de `_targetTransform`, selon
 * deux booleens. Trois instances, et l'une des trois — la fumee du feu de camp
 * — a une cible NULLE : elle ne suit rien, et c'est une propriete du build, pas
 * un defaut d'extraction. On la rend avec `target: null` plutot que de la
 * taire.
 */
export function matchTransforms(gameplay) {
  return ((gameplay.placed || {}).MatchTransform || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      position: c.position,
      target: (f._targetTransform && f._targetTransform.$ref) || null,
      matchPosition: f._matchPosition !== false,
      matchRotation: !!f._matchRotation,
    };
  });
}

/**
 * Les dix-huit `DisposableContainer`, et ce qu'il faut en faire : RIEN.
 *
 * Leur `Start` tient en une ligne — `Destroy(gameObject)` — et les dix-huit
 * portent uniquement un `Transform` : `TimberHearth_Pivot`, `Islands`, `Zones`,
 * `ShipContainer`... Ce sont des noeuds de RANGEMENT d'editeur. `Awake` court
 * avant `Start` ; ce qui devait etre rattache ailleurs (`AttachOnAwake`,
 * `MatchInitialMotion`) l'a deja ete, et le conteneur vide se supprime.
 *
 * Ce portage construit sa geometrie depuis les sous-arbres glTF racines par nom
 * de corps : ces conteneurs n'y apparaissent pas. La fonction existe pour que
 * le compte soit fait et que la question ne se repose pas — un invariant garde
 * les dix-huit et le fait qu'aucun ne porte de rendu.
 */
export function disposableContainers(gameplay) {
  return ((gameplay.placed || {}).DisposableContainer || []).map((c) => ({
    name: c.name, position: c.position,
  }));
}

/**
 * Les six pivots, rattaches et mis a culbuter.
 *
 * Rattachement PAR POSITION, comme les nuages (docs/48) et pour la meme
 * raison : cinq des six s'appellent `UpTornado_Pivot`. Le nom ne les distingue
 * pas, leur place si.
 *
 * La classe ne connait ni Babylon ni le DOM : elle lit et tourne des noeuds, et
 * se teste donc avec de faux noeuds.
 */
export class TornadoPivots {
  constructor(pivots = []) {
    this.pivots = pivots;
    this.live = [];      // { noeud, pivot }
  }

  get total() { return this.pivots.length; }
  get count() { return this.live.length; }

  attach(nodes, tolerance = 1) {
    if (!nodes || !nodes.length) return 0;
    const pris = new Set();
    for (const p of this.pivots) {
      if (this.live.some((x) => x.pivot === p)) continue;
      let best = null, bestD = Infinity;
      for (const n of nodes) {
        if (n.name !== p.name || pris.has(n)) continue;
        const q = n.getAbsolutePosition ? n.getAbsolutePosition() : n.position;
        if (!q) continue;
        const d = Math.hypot(q.x - p.position[0], q.y - p.position[1], q.z - p.position[2]);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (!best || bestD > tolerance) continue;
      pris.add(best);
      // Le tirage du reveil : un angle quelconque autour de l'axe Y local.
      this.live.push({ noeud: best, pivot: p, angle: p.initialSpin, pose: false });
    }
    return this.live.length;
  }

  /**
   * Avance la culbute. L'axe est le X LOCAL du pivot — `transform.right` —, et
   * la rotation se compose A GAUCHE de celle du noeud : c'est une rotation
   * exprimee dans le repere du parent, pas dans celui du pivot.
   */
  update(dt) {
    for (const l of this.live) {
      if (!l.noeud.rotationQuaternion) {
        if (l.noeud.rotation && l.noeud.rotation.toQuaternion) {
          l.noeud.rotationQuaternion = l.noeud.rotation.toQuaternion();
        } else continue;
      }
      const q = l.noeud.rotationQuaternion;
      let cur = [q.x, q.y, q.z, q.w];
      if (!l.pose) {
        // Le tirage initial, une seule fois, autour de l'axe Y du pivot.
        const up = qrot(cur, [0, 1, 0]);
        cur = qmul(axisAngle(up, l.pivot.initialSpin), cur);
        l.pose = true;
      }
      const right = qrot(cur, [1, 0, 0]);
      cur = qmul(axisAngle(right, l.pivot.speed * dt), cur);
      q.set ? q.set(cur[0], cur[1], cur[2], cur[3])
            : Object.assign(q, { x: cur[0], y: cur[1], z: cur[2], w: cur[3] });
    }
    return this.live.length;
  }
}

/** `Quaternion.AngleAxis(degres, axe)`, en [x, y, z, w]. */
export function axisAngle(axis, degrees) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const h = (degrees * Math.PI / 180) / 2;
  const s = Math.sin(h) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

// --- les meteores de Brittle Hollow (docs/68-lois.md) -------------------------
//
// `meteorLaunchers` etait ecrit, eprouve, et appele par PERSONNE. Quatre
// lanceurs, un meteore toutes les cinq a vingt secondes, entre cent et deux
// cents d'elan, et cinquante de degats au contact — c'est ce qui creuse Brittle
// Hollow pendant qu'on la visite.
//
// @lit MeteorLauncher, TouchExplosive, IgnoreInitialCollisions

/**
 * Ce que le prefabrique `MoltenMeteor` porte, mesure dans
 * `sharedassets1.assets` (docs/60-sonde.md) : `TouchExplosive._contactDamage`
 * vaut CINQUANTE — le constructeur en pose vingt, et l'instance le dement — et
 * `IgnoreInitialCollisions._ignoreDuration` une demi-seconde, le temps que le
 * meteore quitte son lanceur.
 */
export const METEOR = { damage: 50, ignoreSeconds: 0.5, life: 60 };

/**
 * Un lanceur, et son horloge.
 *
 * `Update` : quand `Time.time > _lastLaunchTime + _launchDelay`, on lance et on
 * TIRE UN NOUVEAU DELAI entre `_minInterval` et `_maxInterval`. Le delai n'est
 * donc pas une periode : deux lanceurs ne se synchronisent jamais, et le meme
 * lanceur ne bat pas deux fois pareil.
 *
 * `LaunchMeteor` fait ensuite trois choses, et les deux premieres se tiennent :
 *
 *     GameObject m = Instantiate(_meteorPrefab, transform.position,
 *                                transform.rotation);
 *     m.transform.parent = transform.root;          // la RACINE, pas le lanceur
 *     if (_targetBody != null && _targetBody.GetGravityField() != null)
 *         m.GetSingleFieldDetector().SetDetectableField(champ, true);
 *     if (_launchParticles != null) _launchParticles.Play();
 *
 * LE METEORE EST RATTACHE A LA RACINE, pas au lanceur : il part avec la pose
 * du lanceur et ne le suit plus. Sans cela, un lanceur qui tourne avec sa
 * planete emporterait ses propres meteores.
 *
 * ET IL NE SENT QU'UN SEUL CHAMP. `SingleFieldDetector.SetDetectableField`
 * remplace le detecteur dominant par un detecteur a un corps : le meteore
 * tombe vers la cible, et sur ELLE seule, meme en passant a portee d'un autre
 * corps. C'est l'unique endroit du build ou la regle du champ dominant
 * ([`04`](../../docs/04-gravite.md)) est mise de cote, et c'est ce qui rend la
 * pluie de meteores dirigee plutot qu'erratique (docs/121-avis.md).
 */
export class MeteorLaunchers {
  /** @param rng tirage dans [0, 1[, injecte pour que le test soit reproductible */
  constructor(list = [], rng = Math.random) {
    this.rng = rng;
    this.launchers = list.map((d) => ({
      data: d, last: 0,
      delay: d.minInterval + rng() * (d.maxInterval - d.minInterval),
    }));
    this.meteors = [];
    this.launched = 0;
  }

  /** @returns les meteores nes de ce pas */
  update(dt, now, cfg = METEOR) {
    const nes = [];
    for (const l of this.launchers) {
      if (now <= l.last + l.delay) continue;
      l.last = now;
      l.delay = l.data.minInterval + this.rng() * (l.data.maxInterval - l.data.minInterval);
      const v = l.data.minSpeed + this.rng() * (l.data.maxSpeed - l.data.minSpeed);
      const d = l.data.direction;
      const n = Math.hypot(d[0], d[1], d[2]) || 1;
      const m = {
        from: l.data.name,
        pos: [...l.data.position],
        vel: [d[0] / n * v, d[1] / n * v, d[2] / n * v],
        radius: l.data.radius, age: 0, damage: cfg.damage,
      };
      this.meteors.push(m);
      nes.push(m);
      this.launched += 1;
    }
    return nes;
  }

  /**
   * Avance les meteores. Le champ dominant les infléchit, comme la sonde — ils
   * retombent donc sur la planete qui les a craches.
   *
   * Les positions sont celles des LANCEURS, donc du monde : l'appelant convertit
   * pour lire le champ et pour tester les contacts.
   *
   * @param field le champ subi : un champ tel quel, ou une FONCTION de la
   *   position du meteore. Le portage passait celui du JOUEUR a tous les
   *   meteores — un caillou au-dessus de Brittle Hollow tombait donc vers ce
   *   que le joueur, ailleurs, avait sous les pieds.
   *
   *   `_targetBody` est nul sur les quatre lanceurs, donc
   *   `SingleFieldDetector.SetDetectableField` n'est JAMAIS appele dans ce
   *   build : un meteore y garde le detecteur ordinaire, celui du champ
   *   dominant. C'est donc bien la regle commune qui s'applique, et il faut
   *   la lire AU METEORE (docs/121-avis.md).
   */
  step(dt, field = null, cfg = METEOR) {
    for (const m of this.meteors) {
      const f = typeof field === "function" ? field(m.pos) : field;
      if (f) {
        m.vel[0] += f.dir.x * f.magnitude * dt;
        m.vel[1] += f.dir.y * f.magnitude * dt;
        m.vel[2] += f.dir.z * f.magnitude * dt;
      }
      m.pos[0] += m.vel[0] * dt;
      m.pos[1] += m.vel[1] * dt;
      m.pos[2] += m.vel[2] * dt;
      m.age += dt;
    }
    this.meteors = this.meteors.filter((m) => m.age < cfg.life);
    return this.meteors;
  }

  /**
   * Qui se prend un meteore ?
   *
   * `IgnoreInitialCollisions` epargne la premiere demi-seconde : sans elle le
   * meteore explose sur son propre lanceur.
   */
  hits(point, rayon = 1, cfg = METEOR) {
    for (const m of this.meteors) {
      if (m.age < cfg.ignoreSeconds) continue;
      const d = Math.hypot(m.pos[0] - point[0], m.pos[1] - point[1], m.pos[2] - point[2]);
      if (d <= m.radius + rayon) return m;
    }
    return null;
  }

  /** Retire un meteore qui a touche : il explose et disparait. */
  consume(m) { this.meteors = this.meteors.filter((x) => x !== m); }
}
