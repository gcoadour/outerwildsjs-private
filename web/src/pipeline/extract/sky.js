// Le ciel : la voute, les nuages, le champ d'etoiles.
//
// Trois classes du build que rien ne lisait, et un premier plan qui ne
// ressemblait pas au jeu (docs/41-ciel.md). Elles sont toutes les trois sur
// Timber Hearth, et ce sont elles qui font la premiere image de la partie.
//
// `SkyBehavior` — la voute. Son `Update` tient en deux gestes :
//
//     _relativeBody.transform.LookAt(_sunBody.transform.position)
//     si le joueur est dans l'atmosphere :
//         _currentSkyAlpha = SkyAlphaCurve.Evaluate(distance / _skyRadius)
//
// La voute TOURNE donc pour faire face au soleil, et c'est de la que vient la
// difference entre le jour et la nuit : la texture `atmosphere_blue` est un
// degrade, et on en voit la face claire ou la face sombre selon l'heure. Le
// portage la posait immobile, et montrait donc un plein jour permanent — sur
// une scene que son propre affichage annonce comme nocturne.
//
// `_skyRadius` n'est pas serialise : c'est le 320 du constructeur.
//
// `CloudTextureController` — 24 nuages, un `_cloudTex` chacun, pose SUR le
// materiau partage a l'execution. Les 24 partagent `CloudMat`, dont la texture
// serialisee est `cloud_01` : sans ce composant, les 24 nuages portent le meme
// visage au lieu de dix.
//
// `DistantStarController` — le champ d'etoiles, un systeme de particules suivi
// par la camera.

import { round } from "./context.js";

/** Rayon de ciel par defaut : le `_skyRadius` du constructeur de SkyBehavior. */
export const SKY_RADIUS = 320;

/** Echantillonne une AnimationCurve en `n` points reguliers, de 0 a 1. */
function sampleCurve(ac, n = 9) {
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
    out.push(round(v, 4));
  }
  return out;
}

/** La courbe d'alpha de la voute est imbriquee dans une structure nommee. */
function alphaCurveOf(fields) {
  const c = fields && fields.SkyAlphaCurve;
  if (!c) return null;
  return sampleCurve(c.alphaByPlayerPosition || c.m_Curve || c);
}

export function extractSky(ctx) {
  let shell = null;
  const clouds = [];
  const stars = [];

  for (const { obj, cls } of ctx.behaviours(
    (c) => /skybehavior|cloudtexturecontroller|distantstarcontroller/i.test(c))) {
    const raw = ctx.scriptFields(obj);
    if (!raw) continue;
    const f = ctx.plain(raw);
    const gid = ctx.ownerId(obj);
    const name = ctx.name(gid);
    const position = ctx.worldPosition(gid);

    if (/skybehavior/i.test(cls)) {
      const vol = ctx.volumeOf(gid);
      shell = {
        name, position,
        radius: vol && typeof vol.radius === "number" ? round(vol.radius, 3) : null,
        skyRadius: typeof f._skyRadius === "number" ? f._skyRadius : SKY_RADIUS,
        alphaCurve: alphaCurveOf(f),
        endColor: f._endMaterialColor
          ? [round(f._endMaterialColor.r ?? 0, 4), round(f._endMaterialColor.g ?? 0, 4),
             round(f._endMaterialColor.b ?? 0, 4), round(f._endMaterialColor.a ?? 0, 4)]
          : null,
      };
    } else if (/cloudtexture/i.test(cls)) {
      clouds.push({
        name, position,
        // Le PPtr de `_cloudTex` porte le nom de sa cible : c'est lui qui
        // distingue les dix visages des nuages.
        texture: (f._cloudTex && f._cloudTex.name) || null,
        alpha: typeof f._startAlpha === "number" ? f._startAlpha : 1,
      });
    } else {
      stars.push({
        name, position,
        interval: typeof f._starsUpdateIntervalInSeconds === "number"
          ? f._starsUpdateIntervalInSeconds : 0,
      });
    }
  }

  const textures = [...new Set(clouds.map((c) => c.texture).filter(Boolean))].sort();
  return {
    shell, clouds, stars,
    stats: { voute: shell ? 1 : 0, nuages: clouds.length,
             "textures de nuage": textures.length, "champs d'etoiles": stars.length },
    textures,
  };
}
