// Lumieres placees dans la scene, et reglages de rendu.
//
// Aucun equivalent Python : le pipeline d'origine n'exportait pas les `Light`,
// et le portage s'en tirait avec DEUX lumieres inventees — une directionnelle
// pour le soleil, une hemispherique d'ambiance — pour tout un systeme solaire.
// Le feu de camp, les interieurs et les balises de Dark Bramble en portent de
// vraies, avec leur couleur, leur intensite, leur portee et leur angle de spot.
//
// `Light` et `RenderSettings` sont des classes MOTEUR : leur structure est dans
// unity41-types.json, il n'y a donc rien a regenerer depuis les assemblies.
//
// La couleur d'Unity est en espace LINEAIRE quand le projet l'est ; ce build ne
// l'est pas (Unity 4.1 n'a pas de rendu lineaire par defaut), on la sort donc
// telle quelle et c'est le moteur qui decide quoi en faire.

import { round, qrot } from "./context.js";

// LightType d'Unity 4.
const LIGHT_TYPE = { 0: "spot", 1: "directional", 2: "point", 3: "area" };
// FogMode d'Unity 4 : 1 lineaire, 2 exponentiel, 3 exponentiel au carre.
const FOG_MODE = { 1: "linear", 2: "exp", 3: "exp2" };

const rgb = (c) => (c ? [round(c.r ?? 0, 4), round(c.g ?? 0, 4), round(c.b ?? 0, 4)] : null);

/**
 * @param {ExtractContext} ctx
 * @param {{ maxLights?: number }} options  garde-fou : une scene qui en
 *        porterait des milliers ne doit pas gonfler le JSON de demarrage.
 */
export function extractLights(ctx, { maxLights = 2000 } = {}) {
  const lights = [];
  const stats = {};
  const bump = (k) => { stats[k] = (stats[k] || 0) + 1; };

  for (const o of ctx.env.objects({ type: "Light", file: ctx.sceneFile })) {
    if (lights.length >= maxLights) { bump("au-dela du plafond"); continue; }
    const l = ctx.readEngine(o);
    if (!l) { bump("illisible"); continue; }
    const gid = l.m_GameObject ? l.m_GameObject.pathId : 0;
    if (!ctx.transformOf.has(gid)) { bump("sans transform"); continue; }

    const [pos, rot] = ctx.world(gid);
    const type = LIGHT_TYPE[l.m_Type] ?? String(l.m_Type);
    lights.push({
      name: ctx.name(gid),
      type,
      // Une lumiere Unity eclaire dans le +Z LOCAL de son GameObject : la
      // direction est donc son axe avant, tourne par l'orientation monde.
      // Elle ne sert qu'aux spots et aux directionnelles.
      position: pos.map((v) => round(v, 3)),
      direction: qrot(rot, [0, 0, 1]).map((v) => round(v, 5)),
      color: rgb(l.m_Color),
      intensity: round(l.m_Intensity ?? 1, 4),
      range: round(l.m_Range ?? 0, 3),
      spotAngle: round(l.m_SpotAngle ?? 0, 3),
      // m_Enabled est le drapeau du COMPOSANT : une lumiere eteinte dans la
      // scene est allumee par un script, pas au chargement.
      enabled: !!l.m_Enabled,
      shadows: (l.m_Shadows && l.m_Shadows.m_Type) || 0,
      cullingMask: (l.m_CullingMask && l.m_CullingMask.m_Bits) ?? -1,
    });
    bump(type);
  }

  // --- RenderSettings ---
  //
  // Le portage portait ces valeurs en dur, relevees a la main : gris moyen et
  // exponentiel au carre. Une valeur juste et une valeur recopiee se
  // ressemblent jusqu'au jour ou l'une des deux change.
  let render = null;
  for (const o of ctx.env.objects({ type: "RenderSettings", file: ctx.sceneFile })) {
    const r = ctx.readEngine(o);
    if (!r) continue;
    render = {
      fog: {
        enabled: !!r.m_Fog,
        color: rgb(r.m_FogColor),
        mode: FOG_MODE[r.m_FogMode] ?? String(r.m_FogMode),
        density: round(r.m_FogDensity ?? 0, 6),
        linearStart: round(r.m_LinearFogStart ?? 0, 3),
        linearEnd: round(r.m_LinearFogEnd ?? 0, 3),
      },
      ambient: rgb(r.m_AmbientLight),
      haloStrength: round(r.m_HaloStrength ?? 0, 4),
      flareStrength: round(r.m_FlareStrength ?? 0, 4),
    };
    break;
  }

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion,
           source: ctx.sceneFile, lights, render, stats };
}
