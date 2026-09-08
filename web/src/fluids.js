// Fluides : l'ocean de Giant's Deep, et ce qui freine dedans.
//
// Le build porte `SphereOceanFluidVolume` et `SimpleFluidVolume` dans la scene,
// et `SimpleFluidDetector` applique un `_dragCoefficient` — 10 pour les
// fragments de croute de Brittle Hollow, qui n'en voyaient jamais l'effet faute
// de fluide sur cette planete.
//
// Cote portage, le defaut etait discret : `SphereOceanFluidVolume` figurait
// bien dans les classes lues par l'extracteur du systeme solaire, mais la
// boucle n'ecrivait un corps que s'il portait un `GravityWell` ou un
// `PlanetoidSector`. Le volume etait donc lu puis jete, et Giant's Deep n'avait
// pas d'ocean : on tombait au travers de la geante gazeuse sans rien sentir.
//
// Deux effets, et un seul coefficient :
//
//   trainee    v *= max(0, 1 - k dt)     convention des rigidbody d'Unity
//   poussee    a = -g x (rho - 1)        vers le haut si le corps flotte
//
// La trainee est celle d'Unity parce que c'est elle que `_dragCoefficient`
// designe. La poussee, elle, n'est PAS dans le build : `SimpleFluidVolume` ne
// porte pas de densite. Elle est ici un choix de ce portage, mise a zero par
// defaut — un fluide freine, il ne fait flotter que si on le lui demande.

/** Coefficient de trainee employe quand le volume n'en porte pas. */
export const DEFAULT_DRAG = 1;

const NUM = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/**
 * Volumes de fluide, en coordonnees monde.
 *
 * Ils arrivent de deux endroits : `gameplay.json`, ou l'extracteur les ramasse
 * avec leur collider, et `solar_system.json`, ou un ocean spherique est pose
 * sur son corps. Les deux formes se resument a un centre et un rayon.
 */
export function fluidVolumes(gameplay = {}, solar = {}) {
  const out = [];
  const placed = gameplay.placed || {};
  for (const [cls, list] of Object.entries(placed)) {
    if (!/fluid|ocean/i.test(cls)) continue;
    for (const v of list) {
      const f = v.fields || {};
      const radius = NUM(f._radius) ?? NUM(f._fluidRadius) ??
                     (v.volume ? NUM(v.volume.radius) : null);
      if (!radius) continue;   // sans rayon, pas de volume : on ne l'invente pas
      out.push({
        name: v.name,
        kind: cls,
        position: v.position,
        radius,
        // Le detecteur porte le coefficient, le volume porte le type. Faute du
        // premier, la valeur de repli vaut pour tous.
        drag: NUM(f._dragCoefficient) ?? NUM(f._drag) ?? DEFAULT_DRAG,
        density: NUM(f._density) ?? 0,
        ocean: /ocean/i.test(cls),
      });
    }
  }
  // L'ocean d'un corps : meme centre que lui, rayon de sa surface.
  for (const b of (solar.fluids || [])) {
    out.push({ name: b.name, kind: b.kind || "SphereOceanFluidVolume",
               position: b.position, radius: b.radius,
               drag: b.drag ?? DEFAULT_DRAG, density: b.density ?? 0, ocean: true });
  }
  return out;
}

/**
 * Profondeur d'immersion d'un point, en unites (0 hors du fluide).
 *
 * Un volume spherique est plein : plus on descend vers le centre, plus on est
 * profond. C'est ce qui permet a la poussee de croitre en s'enfoncant.
 */
export function depthIn(volume, world) {
  const d = Math.hypot(world[0] - volume.position[0],
                       world[1] - volume.position[1],
                       world[2] - volume.position[2]);
  return d < volume.radius ? volume.radius - d : 0;
}

/**
 * Le fluide qui porte un point, ou null.
 *
 * Comme pour la gravite, on CHOISIT plutot que de sommer : deux fluides
 * imbriques ne se cumulent pas, le plus profond l'emporte.
 */
export function fluidAt(volumes, world) {
  let best = null, bestDepth = 0;
  for (const v of volumes) {
    const depth = depthIn(v, world);
    if (depth > bestDepth) { bestDepth = depth; best = { volume: v, depth }; }
  }
  return best;
}

/**
 * Vitesse apres un pas de trainee. `SimpleFluidDetector` applique le
 * coefficient a la maniere d'un rigidbody Unity : la vitesse est multipliee par
 * `1 - k dt`, bornee a zero. La vitesse limite de chute vaut donc `g / k`.
 */
export function applyDrag(vel, drag, dt) {
  const k = Math.max(0, 1 - drag * dt);
  return { x: vel.x * k, y: vel.y * k, z: vel.z * k };
}

/** Vitesse limite de chute dans un fluide, pour une gravite donnee. */
export function terminalSpeed(gravity, drag) {
  return drag > 0 ? gravity / drag : Infinity;
}

/**
 * Le champ de fluides, tel que le moteur s'en sert.
 *
 * Un seul objet pour le joueur, le vaisseau, les sondes et les fragments : tous
 * appellent `apply` avec leur position monde et leur vitesse.
 */
export class FluidField {
  constructor(volumes = []) {
    this.volumes = volumes;
    this.submerged = 0;      // corps dans un fluide a la derniere image
    this.current = null;     // fluide portant le joueur, pour l'affichage
  }

  get count() { return this.volumes.length; }

  /**
   * Freine un mobile et le pousse vers le haut s'il flotte.
   *
   * @param world  position monde du mobile
   * @param vel    vitesse, modifiee sur place
   * @param field  champ de gravite dominant, pour orienter la poussee
   * @returns le fluide traverse, ou null
   */
  apply(world, vel, dt, field = null) {
    const hit = fluidAt(this.volumes, world);
    if (!hit) return null;
    this.submerged += 1;
    const v = applyDrag(vel, hit.volume.drag, dt);
    vel.x = v.x; vel.y = v.y; vel.z = v.z;
    // Poussee d'Archimede : opposee a la gravite, proportionnelle a la densite
    // du fluide. A densite nulle — le cas de tous les volumes du build — il ne
    // reste que la trainee.
    if (field && hit.volume.density > 0) {
      const a = field.magnitude * hit.volume.density * dt;
      vel.x -= field.dir.x * a;
      vel.y -= field.dir.y * a;
      vel.z -= field.dir.z * a;
    }
    return hit;
  }

  /** Remet a zero le compteur d'immersions de l'image. */
  begin() { this.submerged = 0; this.current = null; }
}
