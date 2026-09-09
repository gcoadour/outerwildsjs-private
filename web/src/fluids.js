// Fluides : l'ocean de Giant's Deep, les tornades, l'atmosphere, le rayon
// tracteur — et tout ce qui pousse ou freine ce qui les traverse.
//
// Trois corrections mesurees sur le build (docs/36-audit.md §1.2) :
//
//   - la TRAINEE n'est pas portee par le volume mais par le DETECTEUR :
//     `SimpleFluidDetector._dragFactor` vaut 0,5 ou 1, `ShipFluidDetector`
//     vaut 1. Le volume, lui, porte un `_dragCoefficient` quand il en a un
//     (10 pour les fragments de croute). Les deux se multiplient ;
//   - la DENSITE est presente PARTOUT, contrairement a ce qui etait ecrit ici :
//     atmosphere 1,2, tornade 2, ocean 10 avec `_deepDensity` 100, rayon
//     tracteur 500. Rien ne flottait parce que le lecteur retombait sur 0 ;
//   - le COURANT existe : les huit `TornadoFluidVolume` portent
//     `_flowSpeed` 300 le long de `_localLinearFlow` (0,1,0) et tournent a
//     `_angularSpeed` 10. C'est ce qui projette le vaisseau hors de
//     l'atmosphere de Giant's Deep, et c'est le contenu jouable de la planete.
//
// Trois effets, donc, et non plus un seul :
//
//   milieu     v_milieu = flux lineaire + omega x r
//   trainee    v = v_milieu + (v - v_milieu) x max(0, 1 - k dt)
//   poussee    a = -g x (rho - 1)        vers le haut si le fluide est dense
//
// La poussee suit la convention d'un corps de densite 1 : un fluide de densite
// 1,2 (l'atmosphere) allege de 20 %, l'ocean a 10 pousse vers le haut a neuf
// fois la pesanteur locale. C'est bien ce que decrit le build ; l'ancien
// `density ?? 0` ne faisait que masquer la lecture manquante.

import { rotateByQuaternion, distanceToAxis } from "./gravity.js";

/** Coefficient de trainee employe quand le volume n'en porte pas. */
export const DEFAULT_DRAG = 1;

const NUM = (v) => (typeof v === "number" && isFinite(v) ? v : null);

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

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : null;
}

/**
 * Detecteurs de fluide.
 *
 * C'est le mobile qui porte son coefficient, pas le milieu : un `_dragFactor`
 * de 0,5 dit que cet objet-la freine deux fois moins que la reference. Les
 * lire evite le `DEFAULT_DRAG = 1` uniforme que le portage appliquait a tout.
 */
export function fluidDetectors(gameplay = {}) {
  const out = [];
  for (const [cls, list] of Object.entries(gameplay.placed || {})) {
    if (!/fluiddetector/i.test(cls)) continue;
    for (const e of list) {
      const f = e.fields || {};
      const factor = NUM(f._dragFactor) ?? NUM(f._dragCoefficient);
      if (factor === null) continue;
      out.push({ name: e.name || null, kind: cls, factor });
    }
  }
  return out;
}

/**
 * Facteur de trainee du detecteur pose sur un objet donne.
 *
 * On cherche d'abord la classe (`ShipFluidDetector` pour le vaisseau), puis le
 * nom du porteur. Faute des deux, 1 : la valeur que portent la plupart des
 * detecteurs du build.
 */
export function dragFactorFor(detectors, who) {
  if (!detectors || !detectors.length || !who) return 1;
  // Comparaison de sous-chaine, pas d'expression reguliere : `who` est un nom
  // d'objet, et un nom du build n'a pas a etre un motif valide.
  const q = String(who).toLowerCase();
  const has = (s) => !!s && s.toLowerCase().includes(q);
  const hit = detectors.find((d) => has(d.kind)) ||
              detectors.find((d) => has(d.name));
  return hit ? hit.factor : 1;
}

/**
 * Volumes de fluide, en coordonnees monde.
 *
 * Ils arrivent de deux endroits : `gameplay.json`, ou l'extracteur les ramasse
 * avec leur collider ET leurs champs, et `solar_system.json`, ou un ocean
 * spherique est pose sur son corps. Le meme ocean sortait donc DEUX FOIS —
 * une fois avec sa densite, une fois sans — et les deux s'annulaient : le
 * doublon sans densite gagnait une image sur deux. On dedoublonne desormais
 * sur le nom et la position, en gardant la version qui porte le plus.
 */
export function fluidVolumes(gameplay = {}, solar = {}) {
  const out = [];
  const placed = gameplay.placed || {};
  for (const [cls, list] of Object.entries(placed)) {
    // `...FluidDetector` repond aussi a /fluid/ : c'est un mobile, pas un milieu.
    if (!/fluid|ocean/i.test(cls) || /detector/i.test(cls)) continue;
    for (const v of list) {
      const f = v.fields || {};
      const shape = v.volume || null;
      const radius = NUM(f._radius) ?? NUM(f._fluidRadius) ??
                     (shape ? NUM(shape.radius) : null);
      if (!radius) continue;   // sans rayon, pas de volume : on ne l'invente pas
      out.push(makeVolume({
        name: v.name, kind: cls, position: v.position, rotation: v.rotation || null,
        volume: shape, radius,
        drag: NUM(f._dragCoefficient) ?? NUM(f._drag) ?? DEFAULT_DRAG,
        density: NUM(f._density) ?? 0,
        deepDensity: NUM(f._deepDensity),
        flowSpeed: NUM(f._flowSpeed) ?? 0,
        flowDir: vec3(f._localLinearFlow),
        angularSpeed: NUM(f._angularSpeed) ?? 0,
        spinAxis: vec3(f._localRotationAxis),
        priority: NUM(f._priority) ?? 0,
        ocean: /ocean/i.test(cls),
      }));
    }
  }
  // L'ocean d'un corps : meme centre que lui, rayon de sa surface.
  for (const b of (solar.fluids || [])) {
    out.push(makeVolume({
      name: b.name, kind: b.kind || "SphereOceanFluidVolume",
      position: b.position, rotation: null, volume: null, radius: b.radius,
      drag: b.drag ?? DEFAULT_DRAG, density: b.density ?? 0,
      deepDensity: NUM(b.deepDensity), flowSpeed: 0, flowDir: null,
      angularSpeed: 0, spinAxis: null, priority: NUM(b.priority) ?? 0,
      ocean: true,
    }));
  }
  return dedupe(out);
}

function makeVolume(v) {
  const dir = v.flowDir ? normalize(v.flowDir) : null;
  const axis = v.spinAxis ? normalize(v.spinAxis) : null;
  return {
    ...v,
    flowDir: dir,
    flowSpeed: dir ? v.flowSpeed : 0,
    spinAxis: axis,
    angularSpeed: axis ? v.angularSpeed : 0,
    deepDensity: v.deepDensity ?? null,
  };
}

/**
 * Deux descriptions du meme milieu n'en font qu'une.
 *
 * L'ocean de Giant's Deep sortait a la fois de `gameplay` (rayon 498, densite
 * 10) et de `solar.fluids` (rayon 500, densite 0). Selon celui que `fluidAt`
 * retenait, on flottait ou on coulait. Meme nom et centres a moins d'un rayon
 * de pourcent : c'est le meme volume, et on garde celui qui porte une densite.
 */
export function dedupe(volumes) {
  const out = [];
  for (const v of volumes) {
    const twin = out.find((w) => same(w, v));
    if (!twin) { out.push(v); continue; }
    if (richness(v) > richness(twin)) out[out.indexOf(twin)] = v;
  }
  return out;
}

function same(a, b) {
  if ((a.name || "") !== (b.name || "")) return false;
  const tol = Math.max(a.radius, b.radius) * 0.05;
  return Math.hypot(a.position[0] - b.position[0],
                    a.position[1] - b.position[1],
                    a.position[2] - b.position[2]) <= tol &&
         Math.abs(a.radius - b.radius) <= tol;
}

/** Ce qu'une description apporte : densite, courant, rotation. */
function richness(v) {
  return (v.density > 0 ? 4 : 0) + (v.flowSpeed ? 2 : 0) + (v.angularSpeed ? 1 : 0);
}

/**
 * Profondeur d'immersion d'un point, en unites (0 hors du fluide).
 *
 * Un volume est plein : plus on s'enfonce vers son coeur, plus on est profond.
 * C'est ce qui permet a la poussee de croitre en descendant, et c'est aussi ce
 * qui departage deux volumes imbriques. Les tornades sont des CAPSULES
 * (r=40, h=305) : les traiter comme des spheres de rayon 40 aurait laisse
 * 225 unites de colonne hors du volume.
 */
export function depthIn(volume, world) {
  const p = localPoint(volume, world);
  const s = volume.volume;
  if (s && s.shape === "capsule") {
    const d = distanceToAxis(p, s);
    return d < s.radius ? s.radius - d : 0;
  }
  if (s && s.shape === "box" && s.size) {
    const m = [s.size[0] / 2 - Math.abs(p[0]), s.size[1] / 2 - Math.abs(p[1]),
               s.size[2] / 2 - Math.abs(p[2])];
    const min = Math.min(m[0], m[1], m[2]);
    return min > 0 ? min : 0;
  }
  const r = (s && s.shape === "sphere" && s.radius) || volume.radius;
  const d = Math.hypot(p[0], p[1], p[2]);
  return d < r ? r - d : 0;
}

/** Point monde ramene dans le repere local du volume, centre du collider compris. */
function localPoint(volume, world) {
  let d = [world[0] - volume.position[0], world[1] - volume.position[1],
           world[2] - volume.position[2]];
  if (volume.rotation) {
    const q = volume.rotation;
    d = rotateByQuaternion([-q[0], -q[1], -q[2], q[3]], d);
  }
  const c = (volume.volume && volume.volume.center) || [0, 0, 0];
  return [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
}

/**
 * Le fluide qui porte un point, ou null.
 *
 * Comme pour la gravite, on CHOISIT plutot que de sommer. `_priority` tranche
 * d'abord — l'interieur du vaisseau est a 100, le centre d'une tornade a 5,
 * l'ocean a 1 — et la profondeur ne departage qu'a priorite egale.
 */
export function fluidAt(volumes, world) {
  let best = null;
  for (const v of volumes) {
    const depth = depthIn(v, world);
    if (depth <= 0) continue;
    if (!best) { best = { volume: v, depth }; continue; }
    const p = v.priority ?? 0, bp = best.volume.priority ?? 0;
    if (p > bp || (p === bp && depth > best.depth)) best = { volume: v, depth };
  }
  return best;
}

/**
 * Densite au point d'immersion.
 *
 * L'ocean porte `_density` 10 en surface et `_deepDensity` 100 : c'est ce qui
 * rend le fond infranchissable sans etre un mur.
 */
export function densityAt(volume, depth) {
  const d0 = volume.density || 0;
  if (volume.deepDensity == null) return d0;
  const span = volume.radius || 1;
  const u = Math.max(0, Math.min(1, depth / span));
  return d0 + (volume.deepDensity - d0) * u;
}

/**
 * Vitesse du milieu en un point monde : flux lineaire, plus la rotation propre
 * du volume autour de son axe. Les deux sont exprimes dans le repere LOCAL du
 * volume — un cyclone pose de biais tourne autour de son axe a lui.
 */
export function mediumVelocity(volume, world) {
  if (!volume.flowSpeed && !volume.angularSpeed) return null;
  let v = [0, 0, 0];
  if (volume.flowSpeed && volume.flowDir) {
    v = [volume.flowDir[0] * volume.flowSpeed,
         volume.flowDir[1] * volume.flowSpeed,
         volume.flowDir[2] * volume.flowSpeed];
  }
  if (volume.angularSpeed && volume.spinAxis) {
    const p = localPoint(volume, world);
    const a = volume.spinAxis;
    v[0] += (a[1] * p[2] - a[2] * p[1]) * volume.angularSpeed;
    v[1] += (a[2] * p[0] - a[0] * p[2]) * volume.angularSpeed;
    v[2] += (a[0] * p[1] - a[1] * p[0]) * volume.angularSpeed;
  }
  if (volume.rotation) v = rotateByQuaternion(volume.rotation, v);
  return v;
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
 * appellent `apply` avec leur position monde, leur vitesse et le facteur de
 * trainee de LEUR detecteur.
 */
export class FluidField {
  constructor(volumes = [], detectors = []) {
    this.volumes = volumes;
    this.detectors = detectors;
    this.submerged = 0;      // corps dans un fluide a la derniere image
    this.current = null;     // fluide portant le joueur, pour l'affichage
  }

  get count() { return this.volumes.length; }

  /** Facteur de trainee d'un mobile, lu sur son detecteur. */
  dragFactor(who) { return dragFactorFor(this.detectors, who); }

  /**
   * Entraine, freine et fait flotter un mobile.
   *
   * @param world  position monde du mobile
   * @param vel    vitesse, modifiee sur place
   * @param field  champ de gravite dominant, pour orienter la poussee
   * @param opts.dragFactor  coefficient du detecteur du mobile (defaut 1)
   * @returns le fluide traverse, ou null
   */
  apply(world, vel, dt, field = null, opts = {}) {
    const hit = fluidAt(this.volumes, world);
    if (!hit) return null;
    this.submerged += 1;
    const vol = hit.volume;
    const factor = opts.dragFactor ?? 1;

    // La trainee s'applique a la vitesse RELATIVE au milieu, sinon un courant
    // ne pousse rien : une tornade a 300 u/s ne faisait que freiner.
    const vm = mediumVelocity(vol, world);
    const rel = vm ? { x: vel.x - vm[0], y: vel.y - vm[1], z: vel.z - vm[2] }
                   : { x: vel.x, y: vel.y, z: vel.z };
    const d = applyDrag(rel, vol.drag * factor, dt);
    vel.x = d.x + (vm ? vm[0] : 0);
    vel.y = d.y + (vm ? vm[1] : 0);
    vel.z = d.z + (vm ? vm[2] : 0);

    // Poussee d'Archimede : opposee a la gravite, nulle a densite 1 — un corps
    // aussi dense que son milieu ne monte ni ne descend.
    const rho = densityAt(vol, hit.depth);
    if (field && rho) {
      const a = field.magnitude * (rho - 1) * dt;
      vel.x -= field.dir.x * a;
      vel.y -= field.dir.y * a;
      vel.z -= field.dir.z * a;
    }
    return hit;
  }

  /** Remet a zero le compteur d'immersions de l'image. */
  begin() { this.submerged = 0; this.current = null; }
}
