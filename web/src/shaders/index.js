// Correspondance shader Unity -> materiau Babylon.
//
// L'exporteur inscrit le nom du shader d'origine dans les extras du materiau
// glTF (extras.unityShader). Le moteur JS s'en sert pour appliquer l'equivalent.
//
// Priorites etablies par MESURE de l'usage reel, et non a l'intuition. Sur
// 2 705 affectations de rendu dans la scene :
//
//   diamond shader                  62   (1 seul materiau, tres reutilise)
//   DoubleSidedCutoutBumpedDiffuse  45   vegetation
//   SelfIlluminAlpha                34
//   SelfIlluminatedTransparent      28   (20 materiaux)
//   V-Fog                           18
//   DoubleSidedCutoutDiffuse        12
//
// Et surtout : 18 shaders du jeu ne sont JAMAIS utilises dans la scene
// (HeatDistortion, TwirlEffect, BillboardTree, MotionBlur, FisheyeShader...),
// tandis que CrackShader, RimShader et IzzySunShader ne servent qu'une ou deux
// fois. Les reecrire tous aurait ete du travail perdu.
//
// Quand une configuration de materiau standard rend fidelement l'effet, on la
// prefere a du GLSL maison : moins de code pour le meme resultat.

import { makeDiamond } from "./diamond.js";
import { makeVFog } from "./vfog.js";
import { makeRim } from "./rim.js";
import { makeDistortion } from "./distortion.js";

/** Nom du shader Unity d'origine d'un materiau, ou null. */
export function unityShaderOf(material) {
  const m = material && material.metadata;
  const e = m && m.gltf && m.gltf.extras;
  return (e && e.unityShader) || null;
}

/**
 * Decoupe alpha double face : la vegetation. Le shader d'origine declare
 * _Cutoff, _BumpMap et Cull Off.
 */
function applyCutout(BABYLON, mat) {
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  if ("transparencyMode" in mat) {
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
  }
  if ("alphaCutOff" in mat) mat.alphaCutOff = 0.5;
  return mat;
}

/**
 * Emissif transparent : `Self-Illumin/Transparent` et sa variante d'interface.
 *
 * MESURE, et non plus supposition. Le ShaderLab du build dit, pour les QUATRE
 * shaders transparents de cette famille :
 *
 *   ZWrite Off · Cull Off · AlphaTest Greater 0
 *   Blend SrcAlpha OneMinusSrcAlpha
 *   LIGHTMODE = ForwardBase
 *
 * Pas un seul n'est additif. Le portage retenait l'additive « dominante ici »,
 * ce qui n'etait fonde sur rien, et le resultat se voyait a l'ecran : les 28
 * nuages de Timber Hearth s'AJOUTAIENT les uns aux autres sur un ciel noir et
 * le repeignaient en plein jour (docs/41-ciel.md).
 *
 * L'emissif reste ici, parce que `Self-Illumin` tire bien une illumination de
 * son alpha. Ce qui change, c'est la fusion.
 */
function applySelfIllum(BABYLON, mat) {
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  const tex = mat.albedoTexture || mat.diffuseTexture;
  if (tex) {
    if ("emissiveTexture" in mat) mat.emissiveTexture = tex;
    tex.hasAlpha = true;
  }
  if ("emissiveColor" in mat) {
    mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  }
  if ("disableLighting" in mat) mat.disableLighting = true;
  if ("unlit" in mat) mat.unlit = true;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  if ("transparencyMode" in mat) {
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHATESTANDBLEND;
  }
  return mat;
}

/**
 * `Custom/SelfIlluminAlpha` : les nuages, et 28 maillages sur Timber Hearth.
 *
 * Son nom trompe. Sa propriete est `_MainTex ("Base (RGB) Trans (A)")` : l'alpha
 * y est la TRANSPARENCE, pas une carte d'illumination — il n'y a pas de canal
 * d'emission a lire. Et sa passe est `ForwardBase`, avec `lightStrength`
 * (defaut 2) : ces maillages sont ECLAIRES.
 *
 * Les rendre non eclaires et emissifs en blanc, c'etait les allumer a fond
 * quelle que soit l'heure. Sur une scene de depart dont le soleil est a 77
 * degres SOUS l'horizon, les nuages brillaient donc comme en plein midi.
 */
function applyLitAlpha(BABYLON, mat) {
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  mat.disableDepthWrite = true;
  const tex = mat.albedoTexture || mat.diffuseTexture;
  if (tex) tex.hasAlpha = true;
  if ("emissiveColor" in mat) mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
  if ("disableLighting" in mat) mat.disableLighting = false;
  if ("unlit" in mat) mat.unlit = false;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  if ("transparencyMode" in mat) {
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHATESTANDBLEND;
  }
  return mat;
}

/**
 * `Custom/Atmosphere` : la voute celeste, et rien d'autre ne s'en approche.
 *
 * Le ShaderLab du build ne laisse aucune place au doute :
 *
 *   Tags { "QUEUE"="Transparent" "RenderType"="Transparent" }
 *   ZWrite Off
 *   Blend SrcAlpha OneMinusSrcAlpha
 *   SetTexture [_MainTex] { combine texture }
 *
 * Non eclaire, fondu par l'alpha de SA texture, sans ecriture de profondeur.
 * Le portage le rendait opaque et eclaire : `SkyShell`, sphere de rayon 250,7
 * autour de Timber Hearth, bouchait donc le ciel d'un lavis uni, et il ne
 * restait ni nuit, ni etoiles, ni lune (docs/41-ciel.md). La texture
 * `atmosphere_blue` est en DXT5 et son alpha va de 0 a 255 : il y avait bien
 * un degrade a montrer, personne ne le regardait.
 */
function applyAlphaBlend(BABYLON, mat, { cullOff = false } = {}) {
  const tex = mat.albedoTexture || mat.diffuseTexture;
  if (tex) {
    tex.hasAlpha = true;
    if ("emissiveTexture" in mat) mat.emissiveTexture = tex;
  }
  if ("emissiveColor" in mat) mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  if ("disableLighting" in mat) mat.disableLighting = true;
  if ("unlit" in mat) mat.unlit = true;
  if (cullOff) mat.backFaceCulling = false;
  mat.disableDepthWrite = true;                    // ZWrite Off
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;    // SrcAlpha OneMinusSrcAlpha
  if ("transparencyMode" in mat) {
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  }
  return mat;
}

/**
 * Les additifs de particules : `Blend SrcAlpha One`, `ZWrite Off`, `Cull Off`.
 *
 * `Particles/Additive`, `MyShaders/ParticleAdditive_minus1` et leurs voisins.
 * `~Additive-Multiply` melange en `DstColor One`, que Babylon n'expose pas tel
 * quel ; il est rendu en additif, ce qui est proche et ne concerne qu'un seul
 * maillage de la scene.
 */
function applyParticleAdditive(BABYLON, mat) {
  const tex = mat.albedoTexture || mat.diffuseTexture;
  if (tex) tex.hasAlpha = true;
  if ("emissiveTexture" in mat && tex) mat.emissiveTexture = tex;
  if ("emissiveColor" in mat) mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
  if ("disableLighting" in mat) mat.disableLighting = true;
  if ("unlit" in mat) mat.unlit = true;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
  return mat;
}

/**
 * Remplace ou reconfigure les materiaux d'une scene selon leur shader d'origine.
 * @returns compte par shader traite
 */
export function applyGameShaders(BABYLON, scene, meshes) {
  const counts = {};
  const cache = new Map();
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };

  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat) continue;
    const name = unityShaderOf(mat);
    if (!name) continue;

    if (name === "diamond shader") {
      if (!cache.has(name)) cache.set(name, makeDiamond(BABYLON, scene));
      mesh.material = cache.get(name);
      bump(name);
    } else if (name === "V-Fog") {
      if (!cache.has(name)) {
        const tex = mat.albedoTexture || mat.diffuseTexture || null;
        cache.set(name, makeVFog(BABYLON, scene, tex));
      }
      mesh.material = cache.get(name);
      bump(name);
    } else if (/DoubleSidedCutout|AlphaCutoff/.test(name)) {
      applyCutout(BABYLON, mat);
      bump(name);
    } else if (name === "SelfIlluminAlpha") {
      applyLitAlpha(BABYLON, mat);
      bump(name);
    } else if (/SelfIllumin/.test(name)) {
      applySelfIllum(BABYLON, mat);
      bump(name);
    } else if (name === "Atmosphere") {
      applyAlphaBlend(BABYLON, mat);
      bump(name);
    } else if (/^Particle ?Add|ParticleAdditive/.test(name)) {
      applyParticleAdditive(BABYLON, mat);
      bump(name);
    } else if (name === "RimShader") {
      if (!cache.has(name)) {
        cache.set(name, makeRim(BABYLON, scene,
          mat.albedoTexture || mat.diffuseTexture || null));
      }
      mesh.material = cache.get(name);
      bump(name);
    } else if (name === "DistortionShader" || name === "FireBall") {
      const key = name;
      if (!cache.has(key)) {
        cache.set(key, makeDistortion(BABYLON, scene,
          mat.bumpTexture || null, name === "FireBall" ? 1.4 : 1.0,
          name === "FireBall" ? [1.0, 0.72, 0.45] : [1, 1, 1]));
      }
      mesh.material = cache.get(key);
      bump(name);
    } else if (name === "CrackShader") {
      // surcouche transparente double face, file Transparent : meme traitement
      // que l'emissif, la texture portant les fissures lumineuses
      applySelfIllum(BABYLON, mat);
      bump(name);
    }
  }
  return counts;
}

/** Uniformes dependant de la camera pour les materiaux maison. */
export function updateGameShaders(BABYLON, scene, cameraPos, timeSec, sunDir = null) {
  for (const m of scene.materials) {
    if (!m.setVector3) continue;
    if (["diamond", "vfog", "rim", "distortion"].includes(m.name)) {
      m.setVector3("cameraPos",
        new BABYLON.Vector3(cameraPos.x, cameraPos.y, cameraPos.z));
      if (m.name === "vfog") m.setFloat("scroll", timeSec);
      if (m.name === "distortion") m.setFloat("time", timeSec);
      if (m.name === "rim" && sunDir) m.setVector3("sunDir", sunDir);
    }
  }
}
