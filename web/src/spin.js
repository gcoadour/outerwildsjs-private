// Rotation propre des corps.
//
// Le build la decrit deux fois, et pas au meme endroit :
//
//   - `InitialMotion._rotationAxis` / `_initAngularSpeed` donne au corps sa
//     vitesse angulaire de depart, en RADIANS par seconde (0,02 a 0,05 selon
//     les corps, voir docs/04-gravite.md) — soit un jour de deux a cinq
//     minutes, ce qu'on attend d'une boucle de vingt ;
//   - `RotateTransform._localAxis` / `_degreesPerSecond` fait tourner un
//     Transform, en degres par seconde. Il y en a 65 dans level0, la plupart
//     sur des accessoires ; quand un corps porte les deux, c'est l'InitialMotion
//     qui decrit le corps lui-meme.
//
// L'axe est exprime dans le repere PROPRE du corps : il faut le tourner par
// l'orientation monde du corps pour l'exprimer dans le repere de travail, d'ou
// `bodyRotation` dans solar_system.json.
//
// On applique cette rotation au REPERE ANCRE, pas a la geometrie. Le corps
// dominant est immobile dans son propre repere ; le faire tourner revient a
// faire tourner le reste du monde autour de lui, ce qui laisse les colliders
// statiques de Havok exactement ou ils sont — la meme raison qui a fait ancrer
// l'origine sur le corps dominant (voir origin.js). Le ciel tourne, le sol ne
// bouge pas.
//
// Deux consequences assumees :
//
//   - la geometrie des AUTRES corps ne tourne pas sur elle-meme. Des qu'on
//     s'en approche assez pour le voir, leur champ devient dominant et c'est
//     leur repere qui tourne : la rotation manquante est toujours celle d'un
//     corps trop loin pour qu'elle se voie ;
//   - les forces d'inertie (Coriolis, centrifuge) ne sont pas ajoutees. A
//     omega = 0,03 rad/s et 250 u de rayon, la centrifuge vaut 0,22 u/s^2
//     contre 12 de gravite, soit 2 % — et le jeu, qui attache le joueur au
//     corps, ne les modelise pas davantage.

const DEG = Math.PI / 180;

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : null;
};

/** Rotation d'un vecteur par un quaternion (x, y, z, w). */
export function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

/** Rotation d'un vecteur autour d'un axe unitaire, formule de Rodrigues. */
export function rotateAbout(v, k, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const kv = [k[1] * v[2] - k[2] * v[1],
              k[2] * v[0] - k[0] * v[2],
              k[0] * v[1] - k[1] * v[0]];
  const kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
          v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
          v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

const vec = (v) => (Array.isArray(v) ? v
  : (v && typeof v === "object" ? [v.x || 0, v.y || 0, v.z || 0] : null));

/**
 * Axe (dans le repere de travail) et vitesse en rad/s de la rotation propre
 * d'un corps, ou null s'il n'en a pas.
 */
export function spinOf(body) {
  if (!body) return null;
  const q = body.bodyRotation || body.rotation || null;
  const local = (v) => {
    const a = norm3(vec(v) || [0, 0, 0]);
    return a && q ? norm3(qrot(q, a)) : a;
  };

  const im = body.orbit || null;
  if (im && im.spinSpeed) {
    const axis = local(im.spinAxis) || [0, 1, 0];
    return { axis, rate: im.spinSpeed, source: "InitialMotion" };
  }
  const rt = body.spin || null;
  if (rt && rt.degreesPerSecond) {
    const axis = local(rt.axis) || [0, 1, 0];
    return { axis, rate: rt.degreesPerSecond * DEG, source: "RotateTransform" };
  }
  return null;
}

/** Duree du jour d'un corps, en secondes, ou null s'il ne tourne pas. */
export function dayLength(body) {
  const s = spinOf(body);
  return s && s.rate ? Math.abs(2 * Math.PI / s.rate) : null;
}

/**
 * Angles de rotation cumules, un par corps.
 *
 * L'angle est le seul etat : il n'y a rien a integrer, la vitesse angulaire est
 * constante — comme les orbites circulaires, la rotation propre est resolue
 * exactement, donc sans derive quel que soit le temps ecoule.
 */
export class SpinField {
  constructor(bodies = []) {
    this.spins = new Map();
    this.angles = new Map();
    this.elapsed = 0;
    for (const b of bodies) {
      const s = spinOf(b);
      if (!s) continue;
      this.spins.set(b, s);
      this.angles.set(b, 0);
    }
  }

  get count() { return this.spins.size; }

  advance(dt) {
    this.elapsed += dt;
    for (const [b, s] of this.spins) {
      // borne a un tour : sans cela l'angle grandit sans fin et sa precision
      // se degrade a mesure que la partie dure
      const a = (this.angles.get(b) + s.rate * dt) % (2 * Math.PI);
      this.angles.set(b, a);
    }
  }

  spin(body) { return this.spins.get(body) || null; }
  angle(body) { return this.angles.get(body) || 0; }

  /**
   * Exprime dans le repere co-rotatif d'un corps un vecteur donne relativement
   * a ce corps dans le repere monde. C'est une rotation de -angle : le monde
   * tourne en sens inverse du corps.
   */
  intoFrame(body, rel) {
    const s = this.spins.get(body);
    if (!s) return rel;
    return rotateAbout(rel, s.axis, -this.angles.get(body));
  }
}
