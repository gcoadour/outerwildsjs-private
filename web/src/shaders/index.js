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
 * Emissif transparent : AlphaTest Greater, Cull Off, ZWrite Off, et une fusion
 * additive ou alpha selon la passe. On retient l'additive, dominante ici.
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
    } else if (/SelfIllumin/.test(name)) {
      applySelfIllum(BABYLON, mat);
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
