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
  if (best) best.alignDir = best.dir;
  const o = (opts && opts.framePos) || [0, 0, 0];
  const w = [point.x + o[0], point.y + o[1], point.z + o[2]];
  const f = localField(opts, w);
  // Le corps reste celui du champ radial : c'est lui qui donne l'ancre du
  // repere, le rayon de surface et le nom affiche. Seules la direction et
  // l'intensite viennent du volume. Hors de toute influence radiale on ne
  // fabrique pas de corps : le reste du moteur en attend un.
  if (f && best) {
    return { body: best.body, magnitude: f.magnitude, distance: best.distance,
             dir: { x: f.direction[0], y: f.direction[1], z: f.direction[2] },
             // `_affectsAlignment` est faux sur un champ sur 34 : celui-la
             // pousse sans retourner ce qu'il tient, et la verticale reste
             // celle de la planete. Il etait lu et jamais consulte.
             alignDir: f.affectsAlignment === false ? best.dir
               : { x: f.direction[0], y: f.direction[1], z: f.direction[2] },
             directional: f };
  }
  return best;
}

/**
 * Le champ local qui l'emporte en un point monde : directionnel ou polaire.
 *
 * Les deux familles se comparent sur le meme pied — priorite d'abord,
 * intensite ensuite — parce que le detecteur du jeu n'en connait qu'une
 * notion : le champ actif.
 */
function localField(opts, world) {
  const dirs = (opts && opts.directional) || [];
  const pol = (opts && opts.polar) || [];
  let best = dirs.length ? strongestDirectional(dirs, world) : null;
  if (!pol.length) return best;
  const p = strongestPolar(pol, world);
  if (!p) return best;
  if (!best) return p;
  const a = p.priority ?? 0, b = best.priority ?? 0;
  return (a > b || (a === b && p.magnitude > best.magnitude)) ? p : best;
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
/** Un Vector3 serialise : le build l'ecrit {x, y, z}, les fixtures en tableau. */
function vec3(v) {
  if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number")) {
    return v.slice();
  }
  if (v && typeof v === "object" &&
      ["x", "y", "z"].every((k) => typeof v[k] === "number")) {
    return [v.x, v.y, v.z];
  }
  return null;
}

export function directionalFields(gameplay) {
  const out = [];
  for (const e of ((gameplay.placed || {}).DirectionalForceField || [])) {
    const f = e.fields || {};

    // Les champs PORTENT leur nom : `_fieldMagnitude` est l'intensite,
    // `_forceScaleFactor` un multiplicateur, `_fieldDirection` la direction
    // locale. On les lit d'abord, et la recherche par motif ne sert plus que
    // de repli pour une variante qui les nommerait autrement.
    //
    // Le piege corrige ici : `_forceScaleFactor` repond a /force/i, et sortait
    // donc GAGNANT de la recherche par motif, qui prenait le premier champ
    // rencontre. Les 34 champs du build le portent a 1, quand
    // `_fieldMagnitude` vaut 10 sur 29 d'entre eux : toutes les gravites
    // locales etaient dix fois trop faibles, et le champ radial de la planete
    // (12) les ecrasait au lieu de leur ceder la place.
    let magnitude = typeof f._fieldMagnitude === "number" ? f._fieldMagnitude : null;
    let direction = vec3(f._fieldDirection);
    let axisIndex = null;
    if (magnitude === null || direction === null) {
      for (const [k, v] of Object.entries(f)) {
        // un facteur d'echelle n'est pas une intensite, quel que soit son nom
        if (typeof v === "number" && magnitude === null &&
            !/scale|factor|priority/i.test(k) &&
            /magnitude|acceleration|force|strength|gravity/i.test(k)) magnitude = v;
        const w = vec3(v);
        if (w && direction === null && /direction|axis|vector/i.test(k)) direction = w;
        if (typeof v === "number" && axisIndex === null && direction === null &&
            /direction|axis/i.test(k)) axisIndex = v;
      }
    }
    // `_forceScaleFactor` multiplie l'intensite, il ne la remplace pas.
    const scale = typeof f._forceScaleFactor === "number" ? f._forceScaleFactor : 1;
    if (magnitude !== null) magnitude *= scale;

    if (!magnitude || !e.volume) continue;
    // Axe nomme par un enum : Unity range les six directions dans cet ordre.
    const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let d = direction || AXES[axisIndex] || [0, -1, 0];
    let L = Math.hypot(d[0], d[1], d[2]);
    // Un champ dont la direction est nulle ne designe rien : le build en pose
    // un. On l'ecarte plutot que de lui inventer un bas.
    if (!(L > 1e-6)) continue;
    d = [d[0] / L, d[1] / L, d[2] / L];
    if (e.rotation) d = rotateByQuaternion(e.rotation, d);
    out.push({
      name: e.name,
      position: e.position,
      rotation: e.rotation || null,
      direction: d,
      magnitude: Math.abs(magnitude),
      // `_overridePriority` departage les volumes qui se recouvrent : le build
      // le fait varier de 0 a 5. Sans lui, deux champs superposes se
      // departageaient a l'intensite, ce qui n'est pas la regle du jeu.
      priority: typeof f._overridePriority === "number" ? f._overridePriority : 0,
      // `_affectsAlignment` dit si le champ REORIENTE ce qu'il tient (33 sur
      // 34 le font). Lu ici, il reste a en tenir compte a l'alignement.
      affectsAlignment: f._affectsAlignment !== false,
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

/**
 * Le point est-il dans le volume du champ ?
 *
 * Le centre du collider et les demi-cotes d'une boite sont donnes dans le
 * repere LOCAL de l'objet : il faut donc y ramener le point avant de comparer,
 * sinon un couloir pose de biais est teste comme s'il etait aligne sur les axes
 * du monde.
 */
export function insideVolume(field, worldPoint) {
  const v = field.volume;
  if (!v) return false;
  const p = localPoint(field, worldPoint);
  if (v.shape === "box" && v.size) {
    return Math.abs(p[0]) <= v.size[0] / 2 && Math.abs(p[1]) <= v.size[1] / 2 &&
           Math.abs(p[2]) <= v.size[2] / 2;
  }
  // Une capsule n'est pas une sphere : la traiter comme telle raccourcissait
  // les colonnes des tornades de 305 unites a 80.
  if (v.shape === "capsule" && v.radius > 0) {
    return distanceToAxis(p, v) <= v.radius;
  }
  return v.radius > 0 && Math.hypot(p[0], p[1], p[2]) <= v.radius;
}

/**
 * Distance d'un point LOCAL au segment d'axe d'une capsule.
 *
 * Le point le plus proche est sur l'AXE — il faut donc annuler les deux autres
 * composantes, pas seulement borner celle de l'axe : ne borner que l'axe donne
 * toujours une distance nulle, et la capsule engloutirait tout l'espace.
 */
export function distanceToAxis(p, v) {
  const i = v.axis === 0 ? 0 : (v.axis === 2 ? 2 : 1);
  const half = Math.max(0, (v.height || 0) / 2 - v.radius);
  const q = [0, 0, 0];
  q[i] = Math.max(-half, Math.min(half, p[i]));
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Point monde ramene dans le repere local d'un volume pose et oriente. */
export function localPoint(field, worldPoint) {
  const c = (field.volume && field.volume.center) || [0, 0, 0];
  let d = [worldPoint[0] - field.position[0],
           worldPoint[1] - field.position[1],
           worldPoint[2] - field.position[2]];
  if (field.rotation) {
    const q = field.rotation;
    d = rotateByQuaternion([-q[0], -q[1], -q[2], q[3]], d);
  }
  return [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
}

/**
 * Le champ directionnel qui l'emporte en un point, ou null.
 *
 * La priorite passe AVANT l'intensite : `_overridePriority` est le champ que
 * le jeu consulte quand deux volumes se recouvrent, et il va de 0 a 5 dans le
 * build. A priorite egale, l'intensite departage.
 */
export function strongestDirectional(fields, worldPoint) {
  let best = null;
  for (const f of fields) {
    if (!insideVolume(f, worldPoint)) continue;
    if (!best) { best = f; continue; }
    const p = f.priority ?? 0, bp = best.priority ?? 0;
    if (p > bp || (p === bp && f.magnitude > best.magnitude)) best = f;
  }
  return best;
}

/**
 * Champs polaires (`PolarForceField`).
 *
 * Le build en pose UN, d'acceleration -10 : une force RADIALE a un axe, pas a
 * un point. Le signe negatif attire vers l'axe, le positif en ecarte — c'est
 * ainsi qu'un puits cylindrique tient ce qui le traverse. Il n'etait pas lu.
 *
 * L'axe est local : il faut la rotation du volume pour l'orienter, exactement
 * comme pour la direction d'un champ directionnel.
 */
export function polarFields(gameplay) {
  const out = [];
  for (const [cls, list] of Object.entries((gameplay && gameplay.placed) || {})) {
    if (!/polar.*forcefield|forcefield.*polar/i.test(cls)) continue;
    for (const e of list) {
      const f = e.fields || {};
      const acc = typeof f._acceleration === "number" ? f._acceleration
        : (typeof f._fieldMagnitude === "number" ? f._fieldMagnitude : null);
      if (!acc || !e.volume) continue;
      let axis = vec3(f._localAxis) || vec3(f._axis) || [0, 1, 0];
      const L = Math.hypot(axis[0], axis[1], axis[2]);
      if (!(L > 1e-6)) continue;
      axis = [axis[0] / L, axis[1] / L, axis[2] / L];
      out.push({
        name: e.name, kind: cls, position: e.position, rotation: e.rotation || null,
        axis, acceleration: acc, magnitude: Math.abs(acc),
        priority: typeof f._overridePriority === "number" ? f._overridePriority : 0,
        // Un champ polaire ne designe pas un « bas » constant : on ne s'aligne
        // pas dessus a moins que le build ne le demande explicitement.
        affectsAlignment: f._affectsAlignment === true,
        volume: e.volume,
      });
    }
  }
  return out;
}

/**
 * Direction d'un champ polaire en un point : la perpendiculaire a l'axe, vers
 * l'axe quand l'acceleration est negative. Sur l'axe meme, il n'y a pas de
 * direction — le champ ne s'applique alors pas.
 */
export function polarDirection(field, worldPoint) {
  const p = localPoint(field, worldPoint);
  const a = field.axis;
  const along = p[0] * a[0] + p[1] * a[1] + p[2] * a[2];
  let r = [p[0] - a[0] * along, p[1] - a[1] * along, p[2] - a[2] * along];
  const L = Math.hypot(r[0], r[1], r[2]);
  if (!(L > 1e-6)) return null;
  const s = Math.sign(field.acceleration) / L;
  r = [r[0] * s, r[1] * s, r[2] * s];
  return field.rotation ? rotateByQuaternion(field.rotation, r) : r;
}

/** Le champ polaire qui l'emporte en un point, direction comprise. */
export function strongestPolar(fields, worldPoint) {
  let best = null;
  for (const f of fields) {
    if (!insideVolume(f, worldPoint)) continue;
    const dir = polarDirection(f, worldPoint);
    if (!dir) continue;
    const cand = { ...f, direction: dir };
    if (!best) { best = cand; continue; }
    const p = cand.priority ?? 0, bp = best.priority ?? 0;
    if (p > bp || (p === bp && cand.magnitude > best.magnitude)) best = cand;
  }
  return best;
}
