// Fluides : l'ocean de Giant's Deep, et tout ce qui freine.
//
// Le jeu pose des `SphereOceanFluidVolume` et des `SimpleFluidVolume`, et un
// `SimpleFluidDetector` sur ce qui les traverse. Le detecteur applique un
// `_dragCoefficient` — 10 pour les fragments de croute de Brittle Hollow, qui
// n'en voient jamais l'effet faute de fluide sur cette planete.
//
// Cote portage, `SphereOceanFluidVolume` figurait dans les classes lues par
// l'extracteur du systeme solaire mais n'etait jamais emis : Giant's Deep
// n'avait donc pas d'ocean.
//
// Modele : trainee LINEAIRE et poussee d'Archimede, toutes deux en
// acceleration — comme la gravite du jeu, qui ne manipule jamais de masses.
//
//   a_trainee  = -c * v          c = _dragCoefficient
//   a_poussee  = -g * b          b = rapport de densite, 1 = flottaison neutre
//
// La trainee lineaire donne une vitesse limite de chute exacte, g/c, ce qui se
// verifie sans navigateur (tests/09-jeu.mjs) — et c'est bien ce qu'on ressent
// en tombant dans une mer : une vitesse qui se fige.

// Valeurs de REPLI, pour un volume dont le build ne dit ni l'un ni l'autre.
// Zero de poussee signifie qu'on coule : le portage n'invente pas de flottaison
// que la scene ne decrit pas.
export const DRAG_FALLBACK = 1;
export const BUOYANCY_FALLBACK = 0;

/**
 * Volumes de fluide, reunis des deux sources : l'ocean vient de
 * `solar_system.json` (c'est un objet a l'echelle d'un corps), les volumes
 * locaux de `gameplay.json`.
 */
export function fluidVolumes(solar = {}, gameplay = {}) {
  const out = [];
  for (const f of solar.fluids || []) {
    if (!f.radius) continue;
    out.push({
      name: f.name, position: f.position, radius: f.radius,
      drag: f.dragCoefficient ?? DRAG_FALLBACK,
      buoyancy: f.density ?? BUOYANCY_FALLBACK,
      ocean: true, body: f.body || null,
    });
  }
  for (const v of (gameplay.placed || {}).SimpleFluidVolume || []) {
    const fields = v.fields || {};
    const r = fields._radius ?? (v.volume && v.volume.radius) ?? 0;
    if (!r) continue;
    out.push({
      name: v.name, position: v.position, radius: r,
      drag: fields._dragCoefficient ?? DRAG_FALLBACK,
      buoyancy: fields._density ?? fields._buoyancy ?? BUOYANCY_FALLBACK,
      ocean: false, body: null,
    });
  }
  return out;
}

/**
 * Acceleration produite par un fluide sur un corps qui s'y deplace.
 *
 * @param vel     vitesse du corps, {x, y, z}
 * @param gravity acceleration de gravite subie, {x, y, z} — la poussee s'y
 *                oppose exactement, c'est ce qui fait flotter
 * @param fluid   volume, avec `drag` et `buoyancy`
 */
export function fluidAcceleration(vel, gravity, fluid, submerged = 1) {
  const s = Math.max(0, Math.min(1, submerged));
  const c = (fluid.drag ?? DRAG_FALLBACK) * s;
  const b = (fluid.buoyancy ?? BUOYANCY_FALLBACK) * s;
  return {
    x: -vel.x * c - (gravity ? gravity.x * b : 0),
    y: -vel.y * c - (gravity ? gravity.y * b : 0),
    z: -vel.z * c - (gravity ? gravity.z * b : 0),
  };
}

/** Vitesse limite de chute dans un fluide : la trainee equilibre la gravite. */
export function terminalSpeed(g, fluid) {
  const c = fluid.drag ?? DRAG_FALLBACK;
  const b = fluid.buoyancy ?? BUOYANCY_FALLBACK;
  return c > 0 ? (g * (1 - b)) / c : Infinity;
}

export class FluidField {
  constructor(volumes = []) {
    this.volumes = volumes;
    this.inside = new Map();   // etiquette -> volume, pour l'affichage
  }

  get count() { return this.volumes.length; }

  /**
   * Volume contenant un point.
   *
   * @param p           position dans le repere courant, {x, y, z}
   * @param frameOffset decalage monde -> repere
   */
  at(p, frameOffset) {
    const o = frameOffset || [0, 0, 0];
    for (const v of this.volumes) {
      const d = Math.hypot(v.position[0] - o[0] - p.x,
                           v.position[1] - o[1] - p.y,
                           v.position[2] - o[2] - p.z);
      if (d < v.radius) return v;
    }
    return null;
  }

  /**
   * Acceleration subie par un corps mobile, et le fluide qui la produit.
   *
   * Separee de son application parce que le joueur, sous Havok, ne se pilote
   * pas par sa vitesse mais par des forces : c'est lui qui decide quoi en
   * faire.
   *
   * @param obj   porte `pos` et `vel` en {x, y, z}
   * @param field champ de gravite dominant au point, ou null
   * @returns {fluid, a} — `fluid` vaut null hors de tout volume
   */
  accelerationFor(obj, field, frameOffset, label = null) {
    const v = this.at(obj.pos, frameOffset);
    if (label !== null) {
      if (v) this.inside.set(label, v); else this.inside.delete(label);
    }
    if (!v) return { fluid: null, a: null };
    const g = field
      ? { x: field.dir.x * field.magnitude, y: field.dir.y * field.magnitude,
          z: field.dir.z * field.magnitude }
      : null;
    return { fluid: v, a: fluidAcceleration(obj.vel, g, v) };
  }

  /**
   * Freine et fait flotter un corps qui s'integre par sa vitesse — le
   * vaisseau, une sonde.
   *
   * @returns le fluide traverse, ou null
   */
  apply(dt, obj, field, frameOffset, label = null) {
    const { fluid, a } = this.accelerationFor(obj, field, frameOffset, label);
    if (!fluid || dt <= 0) return fluid;
    obj.vel.x += a.x * dt;
    obj.vel.y += a.y * dt;
    obj.vel.z += a.z * dt;
    return fluid;
  }
}
