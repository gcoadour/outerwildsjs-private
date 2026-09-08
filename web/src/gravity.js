// Modele de gravite reproduit depuis GravityWell (10 instances dans level0).
//
// Le jeu n'utilise PAS une gravitation a N corps : chaque corps porte un champ
// analytique, et un detecteur (SingleFieldDetector) retient le champ dominant.
// C'est ce qui rend les orbites stables sans integration numerique.
//
// Le champ se decoupe en quatre zones concentriques :
//
//   d > upperSurfaceRadius   falloff        a = g * (R_sup / d)^exposant
//   d > lowerSurfaceRadius   coquille       a = g                        (constant)
//   d > cutoffRadius         rampe interne  a = g * (d - cut)/(R_inf - cut)
//   sinon                    coeur creux    a = 0
//
// Deux pieges releves en comparant avec le build :
//   - cutoffRadius est un rayon INTERNE, pas une portee maximale. Le champ
//     n'a aucune coupure externe.
//   - la plupart des corps utilisent un falloff LINEAIRE (exposant 1), pas en
//     1/r^2. Seuls le soleil et une lune sont en inverse du carre.

// FalloffType { linear, inverseSquared, constant } -> exposant applique
const FALLOFF_EXPONENT = { 0: 1, 1: 2, 2: 0 };

/** Acceleration produite par un corps a une distance donnee de son centre. */
export function fieldStrength(body, distance) {
  const g = body.gravity;
  if (!g || !g.surfaceAcceleration) return 0;

  const a = g.surfaceAcceleration;
  const upper = g.upperSurfaceRadius || 0;
  const lower = g.lowerSurfaceRadius || 0;
  // le jeu borne le rayon interne au rayon de surface inferieur
  const cutoff = Math.min(g.cutoffRadius || 0, lower);

  if (distance > upper) {
    const exp = FALLOFF_EXPONENT[g.falloffType] ?? 1;
    // continuite assuree en d = upper
    return upper > 0 ? a * Math.pow(upper / distance, exp) : 0;
  }
  if (distance > lower) return a;
  if (distance > cutoff) {
    const span = lower - cutoff;
    return span > 0 ? a * ((distance - cutoff) / span) : a;
  }
  return 0;
}

// --- champs de force directionnels ------------------------------------------
//
// Il y en a 34 dans level0, contre 10 GravityWell : ce sont les gravites
// LOCALES — un couloir, une passerelle, la trainee d'un des porteurs de la
// croute de Brittle Hollow (`GravityTrail`). Le portage ne connaissait que le
// champ radial dominant.
//
// Ce qui vient du build : leur position, leur orientation, leur volume (le
// collider pose a cote, un ForceVolume d'Unity n'etant qu'un declencheur) et
// leurs champs. Ce qui n'en vient pas et se dit ici : quel champ porte
// l'intensite, et quel axe porte la direction. On cherche donc par NOM, sur un
// motif large, et un champ dont on ne sait pas lire l'intensite est compte puis
// laisse de cote plutot qu'invente.

const AXIS = { 0: [1, 0, 0], 1: [0, 1, 0], 2: [0, 0, 1],
               3: [-1, 0, 0], 4: [0, -1, 0], 5: [0, 0, -1] };

function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

/** Conjugue d'un quaternion unitaire : la rotation inverse. */
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];

/** Intensite d'un champ, cherchee par nom dans ses champs serialises. */
function magnitudeOf(fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (typeof v === "number" && v !== 0 &&
        /magnitude|accel|force|strength|gravity/i.test(k)) return Math.abs(v);
  }
  return null;
}

/**
 * Direction d'un champ, dans le repere monde.
 *
 * Un vecteur explicite l'emporte ; sinon un axe designe par un entier (la
 * convention d'Unity pour un `Direction` serialise) ; sinon le BAS local de
 * l'objet, qui est la lecture la plus naturelle d'une gravite locale — on se
 * tient debout dans le volume.
 */
function directionOf(fields, rotation) {
  const q = rotation && rotation.length === 4 ? rotation : [0, 0, 0, 1];
  for (const [k, v] of Object.entries(fields || {})) {
    if (!/direction|axis|vector/i.test(k)) continue;
    const a = Array.isArray(v) ? v
      : (v && typeof v === "object" && "x" in v ? [v.x, v.y, v.z] : null);
    if (a) {
      const L = Math.hypot(a[0], a[1], a[2]);
      if (L > 1e-6) return qrot(q, [a[0] / L, a[1] / L, a[2] / L]);
    }
    if (typeof v === "number" && AXIS[v]) return qrot(q, AXIS[v]);
  }
  return qrot(q, [0, -1, 0]);
}

/** Champs directionnels lus depuis gameplay.json, en coordonnees monde. */
export function directionalFields(gameplay) {
  const out = [];
  for (const e of ((gameplay || {}).placed || {}).DirectionalForceField || []) {
    const mag = magnitudeOf(e.fields);
    out.push({
      name: e.name,
      position: e.position,
      rotation: e.rotation || [0, 0, 0, 1],
      volume: e.volume || null,
      dir: directionOf(e.fields, e.rotation),
      magnitude: mag,
      // sans intensite lisible ni volume, il n'y a rien a appliquer : le champ
      // est garde dans la liste pour etre compte, pas pour agir
      usable: mag !== null && !!e.volume,
    });
  }
  return out;
}

/** Le point est-il dans le volume d'un champ ? Coordonnees monde. */
export function insideVolume(f, wx, wy, wz) {
  const v = f.volume;
  if (!v) return false;
  const c = v.center || [0, 0, 0];
  // le centre du collider est exprime dans le repere de l'objet
  const cw = qrot(f.rotation, c);
  const rel = [wx - f.position[0] - cw[0], wy - f.position[1] - cw[1],
               wz - f.position[2] - cw[2]];
  if (v.shape === "sphere") return Math.hypot(...rel) < v.radius;
  const local = qrot(qinv(f.rotation), rel);
  if (v.shape === "box") {
    return Math.abs(local[0]) < v.size[0] / 2 &&
           Math.abs(local[1]) < v.size[1] / 2 &&
           Math.abs(local[2]) < v.size[2] / 2;
  }
  // capsule : l'axe 0/1/2 designe X, Y ou Z
  const ax = v.axis === 0 ? 0 : v.axis === 2 ? 2 : 1;
  const half = Math.max(0, v.height / 2 - v.radius);
  const along = Math.max(-half, Math.min(half, local[ax]));
  const d = [local[0], local[1], local[2]];
  d[ax] -= along;
  return Math.hypot(...d) < v.radius;
}

/**
 * Les champs directionnels, avec le decalage du repere de travail.
 *
 * `SingleFieldDetector` ne combine pas les champs, il CHOISIT : dans son
 * volume, le champ directionnel l'emporte sur le champ radial.
 */
export class DirectionalFields {
  constructor(fields = []) {
    this.fields = fields;
    this.offset = [0, 0, 0];
    this.current = null;
  }

  get count() { return this.fields.length; }
  get usable() { return this.fields.filter((f) => f.usable).length; }

  /** @param offset decalage monde -> repere courant */
  setFrame(offset) { this.offset = offset || [0, 0, 0]; }

  /** @param point position dans le repere courant */
  at(point) {
    const wx = point.x + this.offset[0];
    const wy = point.y + this.offset[1];
    const wz = point.z + this.offset[2];
    for (const f of this.fields) {
      if (!f.usable) continue;
      if (insideVolume(f, wx, wy, wz)) { this.current = f; return f; }
    }
    this.current = null;
    return null;
  }
}

/**
 * Champ dominant en un point : reproduit SingleFieldDetector, qui ne combine
 * pas les champs mais choisit le plus fort. Retourne aussi la direction (vers
 * le centre du corps) pour l'alignement du joueur.
 *
 * @param directional DirectionalFields, ou null. Dans le volume de l'un d'eux,
 *        c'est LUI qui donne direction et intensite ; le corps, la distance et
 *        le rayon restent ceux du champ radial, parce que tout le reste du
 *        portage — ancrage, altitude, secteur — s'y accroche.
 */
export function dominantField(bodies, point, directional = null) {
  let best = null, bestMag = 0;
  for (const b of bodies) {
    if (!b.gravity || !b.gravity.surfaceAcceleration) continue;
    const dx = b.position[0] - point.x;
    const dy = b.position[1] - point.y;
    const dz = b.position[2] - point.z;
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    const mag = fieldStrength(b, d);
    if (mag > bestMag) {
      bestMag = mag;
      best = { body: b, magnitude: mag, distance: d, dir: { x: dx / d, y: dy / d, z: dz / d } };
    }
  }
  if (!best || !directional) return best;
  const f = directional.at(point);
  if (!f) return best;
  return { ...best, magnitude: f.magnitude,
           dir: { x: f.dir[0], y: f.dir[1], z: f.dir[2] },
           directional: f.name };
}
