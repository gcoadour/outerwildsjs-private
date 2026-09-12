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
//   milieu     v_milieu = flux de la loi du volume + omega x r
//   trainee    v = v_milieu + (v - v_milieu) x max(0, 1 - k dt)
//   poussee    a = -g x (rho - 1)        vers le haut si le fluide est dense
//
// Et « le flux » n'est pas une chose : le build a QUATRE `GetPointFluidVelocity`
// (docs/39-fluides.md). Trois d'entre elles calculent leur direction a partir
// du point, et ne serialisent donc rien — c'est pourquoi les six bases de
// tornade portaient `_flowSpeed` 100 et ne poussaient rien, et pourquoi l'ocean
// de Giant's Deep, qui REPOUSSE a 250 u/s, ne repoussait pas.
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
        law: lawOf(cls),
        flowType: NUM(f._flowType) ?? 0,
        flowSpeed: NUM(f._flowSpeed) ?? 0,
        flowDir: vec3(f._localLinearFlow),
        angularSpeed: NUM(f._angularSpeed) ?? 0,
        spinAxis: vec3(f._localRotationAxis),
        // L'ocean : palier de densite sous `_innerRadius`, repulsion entre les
        // deux rayons, courant tangentiel en surface.
        innerRadius: NUM(f._innerRadius),
        outerRadius: NUM(f._outerRadius),
        maxRepelSpeed: NUM(f._maxRepelSpeed) ?? 0,
        currentSpeed: NUM(f._currentSpeed) ?? 0,
        repelCurve: sampleCurve(f._repelCurve),
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
      deepDensity: NUM(b.deepDensity), law: lawOf(b.kind || ""),
      flowType: 0, flowSpeed: 0, flowDir: null,
      angularSpeed: 0, spinAxis: null,
      innerRadius: NUM(b.innerRadius), outerRadius: NUM(b.outerRadius),
      maxRepelSpeed: 0, currentSpeed: 0, repelCurve: null,
      priority: NUM(b.priority) ?? 0,
      ocean: true,
    }));
  }
  return dedupe(out);
}

/**
 * La loi de vitesse d'un volume se lit dans SA CLASSE, pas dans ses champs.
 *
 * Quatre classes de `FluidVolume` redefinissent `GetPointFluidVelocity`, et
 * chacune calcule une direction que le volume ne serialise pas : c'est
 * pourquoi les six bases de tornade portaient `_flowSpeed` 100 sans aucun
 * `_localLinearFlow`, et pourquoi le portage les rendait immobiles. Les corps
 * de methode sont lisibles dans `Assembly-CSharp.dll` — voir
 * `docs/39-fluides.md` pour leur transcription.
 */
export function lawOf(cls) {
  if (/tornadobase/i.test(cls)) return "tornadoBase";
  if (/tractorbeam/i.test(cls)) return "tractor";
  if (/sphereocean/i.test(cls)) return "ocean";
  return "simple";
}

/**
 * Echantillonne une `AnimationCurve` en `n` points reguliers de 0 a 1.
 *
 * Meme convention que les courbes d'attenuation audio : le moteur n'a pas
 * besoin des tangentes, seulement de la valeur a un parametre donne.
 */
export function sampleCurve(ac, n = 9) {
  const keys = (ac && (ac.m_Curve || ac.curve || ac)) || null;
  if (!Array.isArray(keys) || keys.length < 2) return null;
  const pts = keys
    .filter((k) => k && typeof k.time === "number" && typeof k.value === "number")
    .map((k) => [k.time, k.value])
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = pts[0][0] + (i / (n - 1)) * (pts[pts.length - 1][0] - pts[0][0]);
    let v = pts[pts.length - 1][1];
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1];
      if (a[0] <= t && t <= b[0]) {
        v = a[1] + (b[1] - a[1]) * ((t - a[0]) / ((b[0] - a[0]) || 1));
        break;
      }
    }
    out.push(v);
  }
  return out;
}

/** Valeur d'une courbe echantillonnee, en un parametre de 0 a 1. */
export function curveAt(curve, u) {
  if (!curve || !curve.length) return 0;
  const x = Math.max(0, Math.min(1, u)) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(x));
  return curve[i] + (curve[i + 1] - curve[i]) * (x - i);
}

function makeVolume(v) {
  const dir = v.flowDir ? normalize(v.flowDir) : null;
  const axis = v.spinAxis ? normalize(v.spinAxis) : null;
  // Une direction absente n'annule le flux QUE pour la loi lineaire : les
  // autres lois deduisent la leur de la position du point.
  const linear = (v.law || "simple") === "simple" && (v.flowType || 0) === 0;
  return {
    ...v,
    law: v.law || "simple",
    flowType: v.flowType || 0,
    flowDir: dir,
    flowSpeed: linear && !dir ? 0 : v.flowSpeed,
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

/** Ce qu'une description apporte : densite, repulsion, courant, rotation. */
function richness(v) {
  return (v.density > 0 ? 8 : 0) + (v.repelCurve ? 4 : 0) +
         (v.flowSpeed ? 2 : 0) + (v.angularSpeed ? 1 : 0);
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
 *
 * Le build ne fait pas croitre l'une vers l'autre — `GetPointDensity` est un
 * PALIER : sous `_innerRadius` (440 sur un rayon de 498), la densite saute
 * d'un coup a 100. La rampe qui etait ecrite ici n'atteignait les 100 qu'au
 * CENTRE de la planete, et laissait donc descendre a une densite d'une
 * vingtaine la ou le jeu en oppose cent. Faute de rayon interne, on garde la
 * rampe : c'est une interpolation prudente, pas une mesure.
 */
export function densityAt(volume, depth) {
  const d0 = volume.density || 0;
  if (volume.deepDensity == null) return d0;
  if (volume.innerRadius != null) {
    // `depth` se compte depuis la surface du COLLIDER (498), pas depuis
    // `_outerRadius` (500) : c'est donc ce rayon-la qui convertit le seuil.
    return depth > (volume.radius || 0) - volume.innerRadius ? volume.deepDensity : d0;
  }
  const span = volume.radius || 1;
  const u = Math.max(0, Math.min(1, depth / span));
  return d0 + (volume.deepDensity - d0) * u;
}

/** Axe du repere du volume, ramene en coordonnees monde. */
function axisOf(volume, local) {
  return volume.rotation ? rotateByQuaternion(volume.rotation, local) : local.slice();
}

/** Vecteur du centre du volume vers un point monde. */
function offset(volume, world) {
  return [world[0] - volume.position[0], world[1] - volume.position[1],
          world[2] - volume.position[2]];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];

/**
 * Vitesse lineaire du milieu, selon la loi de la classe du volume.
 *
 * Transcription des quatre `GetPointFluidVelocity` du build. Le portage n'en
 * connaissait qu'une — le flux lineaire — et lisait donc `_flowSpeed` 100 sur
 * les six bases de tornade et 10 sur le rayon tracteur sans rien en faire,
 * faute d'une direction serialisee. Les trois autres lois DEDUISENT leur
 * direction du point ou l'on se trouve.
 */
function flowVelocity(volume, world) {
  const speed = volume.flowSpeed || 0;
  const law = volume.law || "simple";

  if (law === "ocean") return oceanVelocity(volume, world);

  if (law === "tractor") {
    // `up * _flowSpeed`, plus un rappel lateral vers l'axe du faisceau. Le
    // facteur 5 est celui du build, et il ne porte que sur `right`.
    const up = axisOf(volume, [0, 1, 0]);
    const right = axisOf(volume, [1, 0, 0]);
    const toAxis = offset(volume, world).map((x) => -x);
    const k = dot(toAxis, right) * 5;
    return [up[0] * speed + right[0] * k,
            up[1] * speed + right[1] * k,
            up[2] * speed + right[2] * k];
  }

  if (law === "tornadoBase") {
    // La base aspire vers l'AXE, pas vers le centre : on retranche la part du
    // vecteur qui suit `up`, et il reste la composante horizontale.
    if (!speed) return null;
    const d = offset(volume, world);
    const up = axisOf(volume, [0, 1, 0]);
    const along = dot(d, up);
    const radial = [d[0] - up[0] * along, d[1] - up[1] * along, d[2] - up[2] * along];
    const n = normalize(radial);
    if (!n) return null;
    // `_flowType` 0 aspire, 1 repousse — cinq bases aspirent, une repousse.
    const s = (volume.flowType || 0) === 0 ? -speed : speed;
    return [n[0] * s, n[1] * s, n[2] * s];
  }

  if (!speed) return null;
  if ((volume.flowType || 0) === 0) {
    // Flux lineaire, exprime dans le repere local du volume.
    if (!volume.flowDir) return null;
    const v = [volume.flowDir[0] * speed, volume.flowDir[1] * speed,
               volume.flowDir[2] * speed];
    return volume.rotation ? rotateByQuaternion(volume.rotation, v) : v;
  }
  // `_flowType` 1 et 2 : radial rentrant et radial sortant, depuis le centre.
  const n = normalize(offset(volume, world));
  if (!n) return null;
  const s = volume.flowType === 1 ? -speed : speed;
  return [n[0] * s, n[1] * s, n[2] * s];
}

/**
 * L'ocean de Giant's Deep : il REPOUSSE, et il porte un courant.
 *
 * Entre `_outerRadius` (500) et `_innerRadius` (440), une courbe donne la part
 * de `_maxRepelSpeed` (250 u/s) qui pousse vers le haut — c'est ce qui rend le
 * fond inatteignable en nageant, et c'est la raison d'etre de la tornade
 * inversee. Sous le rayon interne, plus rien ne pousse : on est arrive.
 * Le courant, lui, est tangentiel (`d x up`) et s'eteint avec la profondeur.
 */
function oceanVelocity(volume, world) {
  const outer = volume.outerRadius ?? volume.radius;
  const inner = volume.innerRadius;
  if (inner == null || !(outer > inner)) return null;
  const d = offset(volume, world);
  const len = Math.hypot(d[0], d[1], d[2]);
  const t = Math.max(0, (outer - len) / (outer - inner));
  if (t > 1) return null;                 // sous le rayon interne : le coeur
  const v = [0, 0, 0];
  const n = normalize(d);
  if (n && volume.maxRepelSpeed) {
    const push = curveAt(volume.repelCurve, t) * volume.maxRepelSpeed;
    v[0] += n[0] * push; v[1] += n[1] * push; v[2] += n[2] * push;
  }
  if (volume.currentSpeed) {
    const tangent = normalize(cross(d, axisOf(volume, [0, 1, 0])));
    if (tangent) {
      const c = volume.currentSpeed * (1 - t);
      v[0] += tangent[0] * c; v[1] += tangent[1] * c; v[2] += tangent[2] * c;
    }
  }
  return v;
}

/**
 * Vitesse du milieu en un point monde : le flux de la loi du volume, plus la
 * rotation propre autour de son axe. La rotation est exprimee dans le repere
 * LOCAL du volume — un cyclone pose de biais tourne autour de son axe a lui.
 */
export function mediumVelocity(volume, world) {
  const flow = flowVelocity(volume, world);
  const spin = volume.angularSpeed && volume.spinAxis;
  if (!flow && !spin) return null;
  const v = flow ? flow.slice() : [0, 0, 0];
  if (spin) {
    const p = localPoint(volume, world);
    const a = volume.spinAxis;
    let w = [(a[1] * p[2] - a[2] * p[1]) * volume.angularSpeed,
             (a[2] * p[0] - a[0] * p[2]) * volume.angularSpeed,
             (a[0] * p[1] - a[1] * p[0]) * volume.angularSpeed];
    if (volume.rotation) w = rotateByQuaternion(volume.rotation, w);
    v[0] += w[0]; v[1] += w[1]; v[2] += w[2];
  }
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
