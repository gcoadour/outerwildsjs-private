// Rotation propre des corps.
//
// Le build la donne deux fois, et le portage n'en lisait ni l'une ni l'autre :
//
//   RotateTransform (65 dans level0)   _localAxis, _degreesPerSecond
//   InitialMotion   (14)               _rotationAxis, _initAngularSpeed
//
// L'extracteur ecrivait deja `spin` et `orbit.spinAxis` / `orbit.spinSpeed`
// dans solar_system.json ; aucun module ne les ouvrait. Les planetes etaient
// donc figees : pas de cycle jour/nuit, un soleil cloue au meme point du ciel,
// et la regle « face nuit » de la lampe qui ne basculait jamais.
//
// LA ROTATION S'APPLIQUE AU REPERE ANCRE, PAS A LA GEOMETRIE.
//
// C'est le meme raisonnement que pour le floating origin (voir origin.js) : le
// corps dominant est immobile dans son propre repere, et le faire tourner
// revient a faire tourner le reste du monde autour de lui. Le ciel tourne, le
// sol ne bouge pas — et les colliders statiques de Havok, poses une fois sur le
// corps ancre, restent exactement ou ils sont. Faire tourner la geometrie
// obligerait a les reconstruire a chaque image.
//
// Ce qui tourne, alors : les autres corps, donc l'etoile, donc la lumiere, donc
// l'ombre portee sur le sol. Ce qui ne tourne pas : ce qui est POSE sur le
// corps ancre — sources audio, volumes, objets interactifs — et c'est juste,
// puisque cela tourne avec lui.

// Une approximation assumee : `_localAxis` est, comme son nom le dit, un axe
// LOCAL. On l'emploie tel quel comme axe monde. Les corps du systeme n'ont pas
// de rotation propre a leur transform — leur repere local et le repere monde
// coincident — et l'axe releve est de toute facon presque toujours l'axe Y.
// Le jour ou un corps arriverait incline, il faudrait composer sa rotation.

/** Sous laquelle une rotation ne se distingue plus d'un corps fixe. */
export const MIN_RATE = 1e-6;

/**
 * Axe et vitesse de rotation propre d'un corps, en radians par seconde.
 *
 * Les deux sources n'ont pas la meme unite : `RotateTransform` compte en
 * degres par seconde, `InitialMotion` en radians par seconde (0,02 a 0,05 dans
 * le build, voir docs/04-gravite.md). La premiere prime quand elle existe :
 * c'est un composant dont le seul role est de faire tourner l'objet.
 */
export function bodySpin(body) {
  if (!body) return null;
  const norm = (v) => {
    if (!Array.isArray(v) || v.length < 3) return null;
    const L = Math.hypot(v[0], v[1], v[2]);
    return L > 1e-9 ? [v[0] / L, v[1] / L, v[2] / L] : null;
  };
  const rt = body.spin;
  if (rt && Number.isFinite(rt.degreesPerSecond)) {
    const axis = norm(rt.axis) || [0, 1, 0];
    const rate = rt.degreesPerSecond * Math.PI / 180;
    if (Math.abs(rate) > MIN_RATE) return { axis, rate, source: "RotateTransform" };
  }
  const im = body.orbit;
  if (im && Number.isFinite(im.spinSpeed)) {
    const axis = norm(im.spinAxis) || [0, 1, 0];
    if (Math.abs(im.spinSpeed) > MIN_RATE) {
      return { axis, rate: im.spinSpeed, source: "InitialMotion" };
    }
  }
  return null;
}

/** Periode de rotation en secondes, ou null pour un corps fixe. */
export function spinPeriod(body) {
  const s = bodySpin(body);
  return s ? Math.abs(2 * Math.PI / s.rate) : null;
}

/** Rotation d'un vecteur autour d'un axe unitaire (formule de Rodrigues). */
export function rotateAbout(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const [kx, ky, kz] = axis;
  const kv = [ky * v[2] - kz * v[1], kz * v[0] - kx * v[2], kx * v[1] - ky * v[0]];
  const kd = kx * v[0] + ky * v[1] + kz * v[2];
  return [v[0] * c + kv[0] * s + kx * kd * (1 - c),
          v[1] * c + kv[1] * s + ky * kd * (1 - c),
          v[2] * c + kv[2] * s + kz * kd * (1 - c)];
}

/**
 * L'angle accumule par chaque corps depuis le debut de la partie.
 *
 * Un seul compteur par corps, avance une fois par image : le ciel vu depuis
 * n'importe quel corps se deduit ensuite sans etat supplementaire.
 */
export class SpinField {
  constructor(bodies = []) {
    this.angles = new Map();
    this.spins = new Map();
    for (const b of bodies) {
      const s = bodySpin(b);
      if (s) { this.spins.set(b, s); this.angles.set(b, 0); }
    }
  }

  /** Nombre de corps qui tournent reellement sur eux-memes. */
  get count() { return this.spins.size; }

  advance(dt) {
    for (const [b, s] of this.spins) {
      // borne a [0, 2pi[ : sans cela l'angle finit par manger sa precision
      const a = (this.angles.get(b) + s.rate * dt) % (2 * Math.PI);
      this.angles.set(b, a);
    }
  }

  /** Angle de rotation propre d'un corps, en radians. */
  angle(body) { return this.angles.get(body) || 0; }

  spin(body) { return this.spins.get(body) || null; }

  /**
   * Exprime un vecteur du monde dans le repere TOURNANT du corps ancre.
   *
   * C'est une rotation d'angle oppose : l'observateur tourne avec le corps, le
   * monde lui parait tourner en sens inverse.
   */
  toFrame(body, vec) {
    const s = this.spins.get(body);
    if (!s) return vec;
    return rotateAbout(vec, s.axis, -this.angles.get(body));
  }

  /** L'inverse : du repere tournant vers le monde. */
  toWorld(body, vec) {
    const s = this.spins.get(body);
    if (!s) return vec;
    return rotateAbout(vec, s.axis, this.angles.get(body));
  }

  /** Vecteur rotation du repere ancre sur ce corps, ou null. */
  omega(body) {
    const s = this.spins.get(body);
    return s ? [s.axis[0] * s.rate, s.axis[1] * s.rate, s.axis[2] * s.rate] : null;
  }

  /**
   * Acceleration d'inertie subie dans le repere tournant du corps ancre.
   *
   * Le repere de travail TOURNE avec le corps ancre — c'est ce qui garde ses
   * colliders immobiles — mais rien n'en tirait les consequences : en vol
   * stationnaire au-dessus de Timber Hearth, le sol ne defilait pas
   * (docs/36-audit.md §1.2). A 0,05 rad/s et 250 unites, il devrait passer a
   * 12,5 u/s.
   *
   *   a = -2 omega x v  -  omega x (omega x r)
   *
   * Le premier terme est Coriolis, le second la force centrifuge. Les deux
   * s'expriment dans le repere tournant, ou vivent deja `pos` et `vel`.
   */
  inertial(body, pos, vel) {
    const w = this.omega(body);
    if (!w) return null;
    const r = [pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2]];
    const v = [vel.x ?? vel[0], vel.y ?? vel[1], vel.z ?? vel[2]];
    const cor = cross(w, v);
    const cen = cross(w, cross(w, r));
    return [-2 * cor[0] - cen[0], -2 * cor[1] - cen[1], -2 * cor[2] - cen[2]];
  }
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];

/**
 * Hauteur du soleil au-dessus de l'horizon local, en radians.
 *
 * Sert a decider s'il fait nuit — la lampe frontale du jeu ne propose son
 * invite que dans le noir, ce qui n'avait aucun sens sur une planete figee.
 * Negatif : le soleil est sous l'horizon.
 */
export function sunElevation(sunPos, up) {
  const L = Math.hypot(sunPos[0], sunPos[1], sunPos[2]) || 1;
  const d = (sunPos[0] * up[0] + sunPos[1] * up[1] + sunPos[2] * up[2]) / L;
  return Math.asin(Math.max(-1, Math.min(1, d)));
}
