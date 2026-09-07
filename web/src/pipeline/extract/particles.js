// Systemes de particules et leurs textures.
// Portage de tools/11_particles.py.
//
// Un ParticleSystem Unity 4 est une structure a modules : InitialModule (duree
// de vie, vitesse, taille, couleur, capacite), EmissionModule (taux),
// ShapeModule (forme d'emission), plus des modules secondaires.

import { unpackColor32 } from "../unity/texture.js";
import { texturePtr, blendMode, TextureExporter } from "./materials.js";
import { round } from "./context.js";

// ParticleSystemShapeType (Unity 4).
const SHAPES = { 0: "sphere", 1: "sphereShell", 2: "hemisphere", 3: "hemisphereShell",
                 4: "cone", 5: "box", 6: "mesh", 7: "coneShell", 8: "coneVolume" };

/** Scalaire d'une MinMaxCurve ; les courbes variables sont approximees. */
function curve(c, def = 1) {
  if (!c || typeof c.scalar !== "number") return def;
  return c.scalar;
}

/**
 * Echantillonne une MinMaxCurve sur la duree de vie, en 0 a 1.
 * Retourne null si la courbe est plate : inutile de transporter une courbe qui
 * ne courbe pas.
 */
function curvePoints(mmc, n = 5) {
  if (!mmc) return null;
  const ac = mmc.maxCurve || mmc.minCurve;
  const keys = (ac && ac.m_Curve) || [];
  if (keys.length < 2) return null;
  const scalar = typeof mmc.scalar === "number" ? mmc.scalar : 1;
  const pts = keys.map((k) => [k.time, k.value]).sort((a, b) => a[0] - b[0]);
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const span = (t1 - t0) || 1;

  const at = (u) => {
    const t = t0 + u * span;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a[0] <= t && t <= b[0]) {
        const w = (t - a[0]) / ((b[0] - a[0]) || 1);
        return a[1] + (b[1] - a[1]) * w;
      }
    }
    return pts[pts.length - 1][1];
  };

  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push([round(u, 4), round(at(u) * scalar, 5)]);
  }
  const vals = out.map(([, v]) => v);
  return Math.max(...vals) - Math.min(...vals) < 1e-6 ? null : out;
}

/**
 * Degrade d'un MinMaxGradient, en [temps, [r, v, b, a]].
 *
 * GradientNEW range huit cles de couleur et huit cles d'alpha, chacune avec son
 * propre temps sur 16 bits. Les deux series sont independantes : on prend
 * l'union de leurs temps et on interpole ce qui manque, sinon un fondu de
 * sortie tombe au mauvais moment.
 */
function gradientKeys(g) {
  const grad = (g && (g.maxGradient || g.minGradient)) || null;
  if (!grad) return null;
  const nc = grad.m_NumColorKeys | 0, na = grad.m_NumAlphaKeys | 0;
  if (nc < 1 && na < 1) return null;
  const keys = Array.from({ length: 8 }, (_, i) => grad[`key${i}`]);

  const series = (count, prefix, pick) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = grad[`${prefix}${i}`];
      if (t === undefined || !keys[i]) continue;
      out.push([t / 65535, pick(unpackColor32(keys[i]))]);
    }
    return out.length ? out : [[0, pick(unpackColor32(keys[0]))]];
  };

  const cols = series(nc, "ctime", (c) => [c[0], c[1], c[2]]);
  const alphas = series(na, "atime", (c) => c[3]);

  const sample = (seq, t) => {
    if (t <= seq[0][0]) return seq[0][1];
    if (t >= seq[seq.length - 1][0]) return seq[seq.length - 1][1];
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i + 1];
      if (a[0] <= t && t <= b[0]) {
        const w = (t - a[0]) / ((b[0] - a[0]) || 1);
        return Array.isArray(a[1])
          ? a[1].map((v, j) => v + (b[1][j] - v) * w)
          : a[1] + (b[1] - a[1]) * w;
      }
    }
    return seq[seq.length - 1][1];
  };

  const times = [...new Set([...cols.map((c) => c[0]), ...alphas.map((a) => a[0])])].sort((a, b) => a - b);
  const out = times.map((t) => {
    const rgb = sample(cols, t);
    return [round(t, 4), [round(rgb[0], 4), round(rgb[1], 4), round(rgb[2], 4),
                          round(sample(alphas, t), 4)]];
  });
  return out.length > 1 ? out : null;
}

/** Animation de planche de sprites (UVModule). */
function uvAnimation(m) {
  if (!m || !m.enabled) return null;
  return { tilesX: m.tilesX || 1, tilesY: m.tilesY || 1,
           // Unity 4.1 ne serialise pas d'images par seconde : 30 est la
           // cadence par defaut du moteur, et cycles porte le reste.
           fps: 30, cycles: round(m.cycles || 1, 3) };
}

export function extractParticles(ctx, emitImage, { maxTexture = 256 } = {}) {
  const sceneFile = ctx.env.get(ctx.sceneFile);
  const textures = new TextureExporter(ctx, emitImage,
                                       { maxSide: maxTexture, prefix: "ptex" });

  // Materiau du rendu de particules, par GameObject.
  const matOf = new Map();
  for (const o of ctx.env.objects({ type: "ParticleSystemRenderer", file: ctx.sceneFile })) {
    const r = ctx.readEngine(o);
    const ms = (r && r.m_Materials) || [];
    if (ms.length && r.m_GameObject) matOf.set(r.m_GameObject.pathId, ms[0]);
  }

  const materialFor = (gid) => {
    const ptr = matOf.get(gid);
    if (!ptr) return { texture: null, blend: "add" };
    const matObj = ctx.env.deref(ptr, sceneFile);
    const mat = matObj && ctx.readEngine(matObj);
    if (!mat) return { texture: null, blend: "add" };
    const blend = blendMode(ctx, mat, matObj.file);
    const tex = textures.export(texturePtr(mat, "_MainTex"), matObj.file);
    return { texture: tex, blend };
  };

  const systems = [];
  const stats = {};
  const bump = (k) => { stats[k] = (stats[k] || 0) + 1; };

  for (const o of ctx.env.objects({ type: "ParticleSystem", file: ctx.sceneFile })) {
    const d = ctx.readEngine(o);
    if (!d) { bump("illisible"); continue; }
    const gid = d.m_GameObject ? d.m_GameObject.pathId : 0;
    const init = d.InitialModule, emis = d.EmissionModule, shape = d.ShapeModule;
    const { texture, blend } = materialFor(gid);

    systems.push({
      name: ctx.name(gid),
      position: ctx.world(gid)[0].map((v) => round(v, 3)),
      looping: !!d.looping,
      playOnAwake: !!d.playOnAwake,
      duration: round(d.lengthInSec ?? 5, 3),
      speedScale: round(d.speed ?? 1, 3),
      capacity: init ? (init.maxNumParticles || 1000) : 1000,
      lifetime: round(init ? curve(init.startLifetime, 1) : 1, 4),
      startSpeed: round(init ? curve(init.startSpeed, 1) : 1, 4),
      size: round(init ? curve(init.startSize, 1) : 1, 4),
      color: init ? unpackColor32(init.startColor
        && (init.startColor.maxColor || init.startColor.minColor)).map((v) => round(v, 4))
        : [1, 1, 1, 1],
      gravityModifier: round(init ? (init.gravityModifier || 0) : 0, 4),
      rate: round(emis ? curve(emis.rate, 10) : 10, 3),
      shape: shape ? {
        type: SHAPES[shape.type] || "sphere",
        radius: round(shape.radius ?? 1, 4),
        angle: round(shape.angle ?? 0, 4),
        randomDirection: !!shape.randomDirection,
      } : null,
      // Modules secondaires. Mesure d'usage sur les systemes du build :
      // ColorModule et SizeModule dominent, RotationModule et UVModule suivent,
      // et force, collision, vitesse par vitesse et sous-emetteurs ne servent
      // jamais. On ne transporte donc que ces quatre-la.
      colorOverLife: d.ColorModule && d.ColorModule.enabled
        ? gradientKeys(d.ColorModule.gradient) : null,
      sizeOverLife: d.SizeModule && d.SizeModule.enabled
        ? curvePoints(d.SizeModule.curve) : null,
      rotationSpeed: d.RotationModule && d.RotationModule.enabled
        ? round(curve(d.RotationModule.curve, 0), 5) : null,
      sheet: uvAnimation(d.UVModule),
      texture: texture ? texture.file : null,
      textureSize: texture ? texture.size : null,
      blend,
    });
    bump("systemes");
  }

  stats.textures = textures.count;
  return { unity: sceneFile.unityVersion, systems, stats };
}
