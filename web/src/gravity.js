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
 */
export function dominantField(bodies, point) {
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
  return best;
}
