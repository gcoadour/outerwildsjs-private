// Lumieres posees dans la scene, et reglages de rendu.
//
// Deux manques de la meme famille, et la meme cause : la valeur etait dans le
// build, personne ne l'ouvrait.
//
//   - le moteur creait UNE directionnelle pour le soleil et UNE hemispherique
//     d'ambiance, pour tout un systeme solaire. Le feu de camp, les interieurs
//     et les balises de Dark Bramble portent pourtant de vrais composants
//     `Light`, avec leur type, leur couleur, leur intensite et leur portee.
//   - `fog.js` portait en dur le gris (0,5 ; 0,5 ; 0,5) et `m_FogMode = 3`,
//     releves a la main dans les `RenderSettings`. Une valeur juste et une
//     valeur recopiee se ressemblent jusqu'au jour ou l'une des deux change.
//
// Les deux classes sont des classes MOTEUR : leur structure est dans
// unity41-types.json, il n'y a donc rien a regenerer depuis les assemblies.

import { round } from "./context.js";

// LightType { Spot, Directional, Point, Area }
const LIGHT_TYPES = ["spot", "directional", "point", "area"];
// FogMode { Linear = 1, Exponential = 2, ExponentialSquared = 3 }
const FOG_MODES = { 1: "linear", 2: "exp", 3: "exp2" };

const color = (c) => (c ? [round(c.r, 4), round(c.g, 4), round(c.b, 4)] : null);

/** Direction pointee par une lumiere : son axe Z local, tourne par le monde. */
function forward(rot) {
  const [x, y, z, w] = rot;
  return [round(2 * (x * z + w * y), 5),
          round(2 * (y * z - w * x), 5),
          round(1 - 2 * (x * x + y * y), 5)];
}

/**
 * Les trois comportements qui font VIVRE une lumiere, lus dans l'IL du build.
 *
 * Le portage lisait la lumiere et pas ce qui l'anime : 15 `NightLight`,
 * 15 `PulsingLight` et 9 `LightFlicker` posaient donc une intensite fixe. Un
 * feu de camp qui ne vacille pas se remarque (docs/42-lumieres.md).
 *
 *   NightLight   l'intensite serialisee est celle de la NUIT ; au lever du
 *                soleil elle fond vers `_dayIntensityMultiplier` (0,5) en 5 s
 *   PulsingLight intensite = sin((t + _timeOffset) x _pulseRate) x
 *                            _intensityFluctuation + intensite initiale
 *                (et de meme pour la portee, avec `_rangeFluctuation`)
 *   LightFlicker quand on a rejoint la cible, on en tire une autre au hasard
 *                dans +/- `range` autour de l'initiale, et on y va par un
 *                `Lerp` de `rate`
 */
const BEHAVIOURS = {
  NightLight: ["_dayIntensityMultiplier"],
  PulsingLight: ["_pulseRate", "_timeOffset", "_intensityFluctuation", "_rangeFluctuation"],
  LightFlicker: ["range", "rate"],
};

function lightBehaviours(ctx) {
  const byOwner = new Map();
  for (const { obj, cls } of ctx.behaviours((c) => c in BEHAVIOURS)) {
    const gid = ctx.ownerId(obj);
    if (!gid) continue;
    const f = ctx.plain(ctx.scriptFields(obj) || {});
    const kept = {};
    for (const k of BEHAVIOURS[cls]) if (typeof f[k] === "number") kept[k] = round(f[k], 5);
    const list = byOwner.get(gid) || [];
    list.push({ kind: cls, fields: kept });
    byOwner.set(gid, list);
  }
  return byOwner;
}

function pivotLocal(ctx, pivots, gid) {
  if (!pivots.has(parentDe(ctx, gid))) return null;
  const t = ctx.transformOf.get(gid);
  const p = t.m_LocalPosition, q = t.m_LocalRotation;
  return {
    position: [p.x, p.y, p.z].map((x) => round(x, 3)),
    direction: forward([q.x, q.y, q.z, q.w]),
  };
}

/**
 * Le profil RADIAL du cookie par defaut des spots d'Unity 4 : la texture
 * `Soft` (128 x 128, Alpha8) de `unity default resources`.
 *
 * Un spot d'Unity 4 n'a pas d'exposant : sans cookie a lui, il multiplie son
 * attenuation par `Soft`, projetee sur le cone — le bord du disque est le bord
 * du cone. Le profil est plat jusqu'aux six dixiemes du rayon, puis tombe a
 * zero. Babylon, lui, prend cos^2 de l'angle, encore 0,54 au bord d'un cone de
 * 85 degres : la couronne de l'imposteur eclairait trop tout ce qu'elle ne
 * visait pas (docs/132). On garde 33 echantillons, du centre (r = 0) au bord
 * (r = 1), sur la ligne mediane ; la texture est de revolution.
 */
function profilCookie(ctx) {
  let objets;
  try { objets = [...ctx.env.objects({ type: "Texture2D", file: "unity default resources" })]; }
  catch { return null; }
  for (const o of objets) {
    const v = ctx.readEngine(o);
    if (!v || v.m_Name !== "Soft" || v.m_TextureFormat !== 1) continue;
    const W = v.m_Width | 0, H = v.m_Height | 0, d = v["image data"];
    if (!W || !H || !d || d.length < W * H) return null;
    const cy = H >> 1, cx = W >> 1, out = [];
    for (let i = 0; i <= 32; i++) {
      const x = Math.min(W - 1, cx + Math.round((i * cx) / 32));
      out.push(round(d[cy * W + x] / 255, 4));
    }
    return out;
  }
  return null;
}

/**
 * Les GameObject qui portent un `LookAtSun` : leurs enfants tournent avec eux.
 *
 * `SunImposterPivot` ne porte pas que `SunImposter_Center`. Huit autres spots
 * y sont accroches en couronne — TopLight, LeftLight, ... BottomRightLight,
 * a 391 unites de l'axe et 371 en avant, inclines de trente degres vers lui,
 * intensite 5,25 et cone de 85 degres. Exportes a leur pose MONDE du fichier,
 * ils restaient la ou `LookAtSun` les avait laisses a l'enregistrement, et le
 * portage n'en faisait rien : le plein jour du village sortait deux fois trop
 * sombre (docs/132). On garde donc, pour ces lumieres-la, leur pose LOCALE.
 */
function pivotsDuSoleil(ctx) {
  const ids = new Set();
  for (const { obj } of ctx.behaviours((c) => c === "LookAtSun")) {
    const gid = ctx.ownerId(obj);
    if (gid) ids.add(gid);
  }
  return ids;
}

/** Le GameObject parent d'un GameObject, ou 0. */
function parentDe(ctx, gid) {
  const t = ctx.transformOf.get(gid);
  const par = t && t.m_Father ? ctx.env.deref(t.m_Father, ctx.env.get(ctx.sceneFile)) : null;
  const pt = par ? ctx.env.read(par) : null;
  return pt && pt.m_GameObject ? pt.m_GameObject.pathId : 0;
}

export function extractLighting(ctx) {
  const lights = [];
  const stats = { lues: 0, "sans GameObject": 0, illisibles: 0 };
  const behaviours = lightBehaviours(ctx);
  const pivots = pivotsDuSoleil(ctx);

  for (const o of ctx.env.objects({ type: "Light", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v) { stats.illisibles += 1; continue; }
    const gid = v.m_GameObject ? v.m_GameObject.pathId : 0;
    if (!gid || !ctx.transformOf.has(gid)) { stats["sans GameObject"] += 1; continue; }
    const [pos, rot] = ctx.world(gid);
    lights.push({
      name: ctx.name(gid),
      // Le corps qui la porte : elle orbite avec lui (docs/132).
      body: ctx.bodyOf(gid),
      type: LIGHT_TYPES[v.m_Type] || "point",
      // Eteinte si le composant l'est, OU si son GameObject est inactif :
      // `SecondSun` et une `Directional light` de test eclairaient la nuit
      // de Timber Hearth (docs/132).
      enabled: v.m_Enabled !== 0 && ctx.actif(gid),
      // Les calques qu'elle eclaire, bit par bit. Le soleil saute `IgnoreSun`
      // (15), les `surfacelighter` n'eclairent que la surface de l'etoile.
      cullingMask: v.m_CullingMask ? (v.m_CullingMask.m_Bits >>> 0) : 0xFFFFFFFF,
      position: pos.map((x) => round(x, 3)),
      direction: forward(rot),
      color: color(v.m_Color),
      intensity: round(v.m_Intensity ?? 1, 4),
      range: round(v.m_Range ?? 0, 3),
      spotAngle: round(v.m_SpotAngle ?? 0, 3),
      // m_Lightmapping : 1 = RealtimeOnly, 2 = BakedOnly. Une lumiere cuite
      // dans les lightmaps n'a rien a eclairer a l'execution.
      lightmapping: v.m_Lightmapping ?? null,
      shadows: v.m_Shadows ? (v.m_Shadows.m_Type ?? 0) : 0,
      // La FORCE de l'ombre, que le portage ne lisait pas : a 1 par defaut,
      // une ombre de Babylon est noire, et le sol du titre sortait trois fois
      // trop sombre (docs/132). Le biais et la resolution suivent.
      ombre: v.m_Shadows && (v.m_Shadows.m_Type ?? 0) > 0
        ? { force: round(v.m_Shadows.m_Strength ?? 1, 4), biais: round(v.m_Shadows.m_Bias ?? 0, 4),
            resolution: v.m_Shadows.m_Resolution ?? -1, douceur: round(v.m_Shadows.m_Softness ?? 0, 4) }
        : null,
      // Ce qui l'anime, s'il y a lieu : pulsation, vacillement, jour et nuit.
      behaviours: behaviours.get(gid) || null,
      // Sous un pivot `LookAtSun` : la pose dans le repere du pivot, que le
      // moteur recompose a chaque image (imposteur.js).
      pivot: pivotLocal(ctx, pivots, gid),
    });
    stats.lues += 1;
  }

  // Un seul RenderSettings par scene ; on prend le premier lisible.
  let settings = null;
  for (const o of ctx.env.objects({ type: "RenderSettings", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v) continue;
    settings = {
      fog: !!v.m_Fog,
      fogColor: color(v.m_FogColor),
      fogMode: FOG_MODES[v.m_FogMode] || null,
      fogDensity: round(v.m_FogDensity ?? 0, 6),
      fogStart: round(v.m_LinearFogStart ?? 0, 3),
      fogEnd: round(v.m_LinearFogEnd ?? 0, 3),
      ambient: color(v.m_AmbientLight),
      haloStrength: round(v.m_HaloStrength ?? 0, 4),
      flareStrength: round(v.m_FlareStrength ?? 0, 4),
    };
    break;
  }

  const byType = {};
  for (const l of lights) byType[l.type] = (byType[l.type] || 0) + 1;
  stats.types = byType;
  const byBehaviour = {};
  for (const l of lights) {
    for (const b of (l.behaviours || [])) {
      byBehaviour[b.kind] = (byBehaviour[b.kind] || 0) + 1;
    }
  }
  stats.comportements = byBehaviour;

  return { cookieSpot: profilCookie(ctx), unity: ctx.env.get(ctx.sceneFile).unityVersion, settings, lights, stats };
}
