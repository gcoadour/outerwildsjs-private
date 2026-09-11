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

export function extractLighting(ctx) {
  const lights = [];
  const stats = { lues: 0, "sans GameObject": 0, illisibles: 0 };
  const behaviours = lightBehaviours(ctx);

  for (const o of ctx.env.objects({ type: "Light", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v) { stats.illisibles += 1; continue; }
    const gid = v.m_GameObject ? v.m_GameObject.pathId : 0;
    if (!gid || !ctx.transformOf.has(gid)) { stats["sans GameObject"] += 1; continue; }
    const [pos, rot] = ctx.world(gid);
    lights.push({
      name: ctx.name(gid),
      type: LIGHT_TYPES[v.m_Type] || "point",
      enabled: v.m_Enabled !== 0,
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
      // Ce qui l'anime, s'il y a lieu : pulsation, vacillement, jour et nuit.
      behaviours: behaviours.get(gid) || null,
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

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, settings, lights, stats };
}
