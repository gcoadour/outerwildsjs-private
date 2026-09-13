// Ce que le build pose HORS de `level0` : les prefabriques.
//
// `level0` est la scene du systeme solaire, et le portage n'avait jamais lu
// que celle-la. L'alpha range ailleurs tout ce qu'elle INSTANCIE en cours de
// partie — `sharedassets1.assets` et `resources.assets` — et c'est vingt
// classes, dont les huit de la sonde. docs/08 avait conclu de l'absence de la
// sonde dans `level0` que « `_probePrefab` n'est pas resolu » ; il l'est,
// depuis toujours, vers `sharedassets1.assets:2295`.
//
// Ce que cet extracteur sort tient en quatre familles :
//
//   probe            le prefabrique de sonde, ses dix noeuds et leurs nombres
//   selfDestruct     dix effets qui se detruisent seuls, chacun a son delai
//   hideInMapView    ce qui disparait quand on ouvre la carte
//   touchExplosive   ce qui explose au contact, et ce que ca coute
//
// Les nombres du prefabrique ne sont PAS dans les MonoBehaviour : la portee de
// la lanterne est `Light.range`, le rayon de scan est celui du
// `SphereCollider`, et le champ des cameras est `Camera.field of view`. Un
// extracteur qui ne lirait que les scripts sortirait une sonde vide — c'est
// exactement ce que `composants.mjs` montre, et ce qui avait fait croire que
// la sonde n'existait pas.

import { round } from "./context.js";

/** Le nom du GameObject racine du prefabrique de sonde. */
const PROBE_ROOT = "SurveyorProbe";

/** Descend l'arbre d'un GameObject et rend les identifiants, nom compris. */
function subtree(ctx, gid, out = []) {
  out.push(gid);
  const tr = ctx.transformOf.get(gid);
  for (const ch of (tr && tr.m_Children) || []) {
    const t = ctx.env.deref(ch, ctx.sceneObj);
    if (!t) continue;
    const v = ctx.env.read(t);
    if (v && v.m_GameObject) subtree(ctx, v.m_GameObject.pathId, out);
  }
  return out;
}

/** Le premier composant moteur d'un type, lu, ou null. */
function engine(ctx, gid, type) {
  for (const o of ctx.componentsOf(gid, [type])) {
    const v = ctx.readEngine(o);
    if (v) return v;
  }
  return null;
}

/**
 * Le prefabrique de sonde : un noeud par ligne, avec ce que chacun porte.
 *
 * Le decoupage suit l'arbre du build plutot qu'un format invente : c'est lui
 * qui explique pourquoi il y a deux cameras (l'avant regarde la roche une fois
 * la sonde plantee) et pourquoi la lanterne est une lumiere PONCTUELLE quand
 * les cameras portent des projecteurs.
 */
function extractProbe(ctx) {
  let racine = null;
  for (const [gid, go] of ctx.gameObjects) {
    if (go.m_Name === PROBE_ROOT) { racine = gid; break; }
  }
  if (racine === null) return null;

  const out = { root: PROBE_ROOT, nodes: {} };
  for (const gid of subtree(ctx, racine)) {
    const nom = ctx.name(gid);
    const n = {};
    const light = engine(ctx, gid, "Light");
    if (light) {
      n.light = { type: light.m_Type, range: round(light.m_Range, 3),
                  intensity: round(light.m_Intensity, 3),
                  spotAngle: round(light.m_SpotAngle, 3),
                  enabled: !!light.m_Enabled };
    }
    const cam = engine(ctx, gid, "Camera");
    if (cam) {
      n.camera = { fov: round(cam["field of view"], 3),
                   near: round(cam["near clip plane"], 4),
                   far: round(cam["far clip plane"], 1),
                   enabled: !!cam.m_Enabled };
    }
    const vol = ctx.volumeOf(gid);
    if (vol) n.volume = vol;
    const rb = engine(ctx, gid, "Rigidbody");
    if (rb) n.mass = round(rb.m_Mass, 6);
    const src = engine(ctx, gid, "AudioSource");
    if (src) {
      n.audio = { clip: ctx.assetNames.get(ctx.refOf(src.m_audioClip)) || null,
                  volume: round(src.m_Volume, 3), loop: !!src.Loop,
                  playOnAwake: !!src.m_PlayOnAwake,
                  minDistance: round(src.MinDistance, 2),
                  maxDistance: round(src.MaxDistance, 2) };
    }
    const scripts = {};
    for (const o of ctx.componentsOf(gid, ["MonoBehaviour"])) {
      const cls = ctx.scriptName(o);
      if (!cls) continue;
      const f = ctx.scriptFields(o);
      scripts[cls] = f ? ctx.plain(f) : {};
    }
    if (Object.keys(scripts).length) n.scripts = scripts;
    if (Object.keys(n).length) out.nodes[nom] = n;
  }
  return out;
}

/**
 * Les classes posees hors de `level0` qu'on ramasse par leur nom de GameObject.
 *
 * `SelfDestruct` porte un delai par effet — une seconde pour une explosion,
 * huit pour l'extinction des etoiles lointaines — et le portage detruisait ses
 * effets a son propre rythme.
 */
export function extractPrefabs(ctx) {
  const out = { probe: extractProbe(ctx), selfDestruct: {}, hideInMapView: [],
                touchExplosive: {}, ignoreInitialCollisions: {} };
  for (const { obj, cls } of ctx.behaviours(["SelfDestruct", "HideInMapView",
                                             "TouchExplosive",
                                             "IgnoreInitialCollisions"])) {
    const nom = ctx.name(ctx.ownerId(obj));
    const f = ctx.scriptFields(obj);
    const v = f ? ctx.plain(f) : {};
    if (cls === "SelfDestruct") {
      // Le constructeur pose une seconde ; l'instance gagne, et neuf des dix
      // en portent une autre — de deux secondes pour un geyser a huit pour
      // l'extinction des etoiles lointaines.
      out.selfDestruct[nom] = round(v._secondsUntilSelfDestruct ?? 1, 3);
    } else if (cls === "HideInMapView") {
      if (!out.hideInMapView.includes(nom)) out.hideInMapView.push(nom);
    } else if (cls === "TouchExplosive") {
      // `_contactDamage` vaut 20 au constructeur et 50 sur le meteore : la
      // seule instance du build dement sa propre valeur par defaut.
      out.touchExplosive[nom] = {
        damage: round(v._contactDamage ?? 20, 3),
        explosion: (v.explosionPrefab && v.explosionPrefab.name) || null,
      };
    } else if (cls === "IgnoreInitialCollisions") {
      out.ignoreInitialCollisions[nom] = round(v._ignoreDuration ?? 0, 3);
    }
  }
  return out;
}

/** Fusionne les prefabriques de plusieurs fichiers en un seul objet. */
export function mergePrefabs(parts) {
  const out = { probe: null, selfDestruct: {}, hideInMapView: [],
                touchExplosive: {}, ignoreInitialCollisions: {} };
  for (const p of parts) {
    if (!p) continue;
    if (p.probe) out.probe = p.probe;
    Object.assign(out.selfDestruct, p.selfDestruct);
    Object.assign(out.touchExplosive, p.touchExplosive);
    Object.assign(out.ignoreInitialCollisions, p.ignoreInitialCollisions);
    for (const n of p.hideInMapView) if (!out.hideInMapView.includes(n)) out.hideInMapView.push(n);
  }
  return out;
}
