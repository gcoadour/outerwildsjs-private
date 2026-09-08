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

/**
 * Champ dominant en un point : reproduit SingleFieldDetector, qui ne combine
 * pas les champs mais choisit le plus fort. Retourne aussi la direction (vers
 * le centre du corps) pour l'alignement du joueur.
 *
 * @param opts.directional champs directionnels (voir plus bas). Ils ne
 *        s'additionnent pas au champ radial : a l'interieur de leur volume, ils
 *        le REMPLACENT — c'est bien le role d'un detecteur qui choisit.
 * @param opts.framePos position monde de l'origine du repere courant. Les corps
 *        y sont deja exprimes, les champs directionnels viennent du monde.
 */
export function dominantField(bodies, point, opts = null) {
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
  const dirs = opts && opts.directional;
  if (dirs && dirs.length) {
    const o = (opts && opts.framePos) || [0, 0, 0];
    const w = [point.x + o[0], point.y + o[1], point.z + o[2]];
    const f = strongestDirectional(dirs, w);
    // Le corps reste celui du champ radial : c'est lui qui donne l'ancre du
    // repere, le rayon de surface et le nom affiche. Seules la direction et
    // l'intensite viennent du volume. Hors de toute influence radiale on ne
    // fabrique pas de corps : le reste du moteur en attend un.
    if (f && best) {
      return { body: best.body, magnitude: f.magnitude, distance: best.distance,
               dir: { x: f.direction[0], y: f.direction[1], z: f.direction[2] },
               directional: f };
    }
  }
  return best;
}

/**
 * Champs de force directionnels.
 *
 * Le build en compte **34**, contre 10 `GravityWell` (docs/02-architecture.md) :
 * ce sont les gravites locales — un couloir, une passerelle, et l'un des
 * porteurs de la croute de Brittle Hollow s'appelle `GravityTrail`.
 *
 * Le composant ne porte pas sa portee : elle est dans le collider pose a cote,
 * que l'extracteur mesure desormais (`entry.volume`). Sans volume lisible, sans
 * intensite lisible, le champ est ECARTE plutot que devine — le champ radial
 * reprend alors la main, ce qui est le comportement d'avant.
 */
export function directionalFields(gameplay) {
  const out = [];
  for (const e of ((gameplay.placed || {}).DirectionalForceField || [])) {
    const f = e.fields || {};
    let magnitude = null, direction = null, axisIndex = null;
    for (const [k, v] of Object.entries(f)) {
      if (typeof v === "number" && magnitude === null &&
          /magnitude|acceleration|force|strength|gravity/i.test(k)) magnitude = v;
      if (Array.isArray(v) && v.length === 3 && direction === null &&
          /direction|axis|vector/i.test(k)) direction = v;
      if (typeof v === "number" && axisIndex === null && direction === null &&
          /direction|axis/i.test(k)) axisIndex = v;
    }
    if (!magnitude || !e.volume) continue;
    // Axe nomme par un enum : Unity range les six directions dans cet ordre.
    const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let d = direction || AXES[axisIndex] || [0, -1, 0];
    const L = Math.hypot(d[0], d[1], d[2]) || 1;
    d = [d[0] / L, d[1] / L, d[2] / L];
    if (e.rotation) d = rotateByQuaternion(e.rotation, d);
    out.push({
      name: e.name,
      position: e.position,
      direction: d,
      magnitude: Math.abs(magnitude),
      volume: e.volume,
    });
  }
  return out;
}

/** Rotation d'un vecteur par un quaternion [x, y, z, w]. */
export function rotateByQuaternion(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

/** Le point est-il dans le volume du champ ? */
export function insideVolume(field, worldPoint) {
  const v = field.volume;
  if (!v) return false;
  const c = v.center || [0, 0, 0];
  const p = [worldPoint[0] - field.position[0] - c[0],
             worldPoint[1] - field.position[1] - c[1],
             worldPoint[2] - field.position[2] - c[2]];
  if (v.shape === "box" && v.size) {
    return Math.abs(p[0]) <= v.size[0] / 2 && Math.abs(p[1]) <= v.size[1] / 2 &&
           Math.abs(p[2]) <= v.size[2] / 2;
  }
  return v.radius > 0 && Math.hypot(p[0], p[1], p[2]) <= v.radius;
}

/** Le plus fort des champs directionnels contenant le point, ou null. */
export function strongestDirectional(fields, worldPoint) {
  let best = null;
  for (const f of fields) {
    if (!insideVolume(f, worldPoint)) continue;
    if (!best || f.magnitude > best.magnitude) best = f;
  }
  return best;
}
