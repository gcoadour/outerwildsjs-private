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
// Et surtout : 18 shaders du jeu ne sont affectes a aucun MATERIAU de la scene
// (HeatDistortion, TwirlEffect, BillboardTree, MotionBlur, FisheyeShader...),
// tandis que CrackShader, RimShader et IzzySunShader ne servent qu'une ou deux
// fois. Les reecrire tous aurait ete du travail perdu.
//
// « Aucun materiau » n'est PAS « jamais utilise », et cette ligne a longtemps
// dit le second : TwirlEffect, MotionBlur et FisheyeShader sont des EFFETS
// D'IMAGE, poses sur des cameras, ou aucun materiau ne les porte. Pire, les
// nommer ici suffisait a les faire compter « lus » par le recensement, qui ne
// retirait pas les commentaires : la pile d'effets entiere de la camera du
// joueur est restee invisible aussi longtemps que cette phrase. Voir
// docs/47-effets-image.md.
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
    if (BABYLON.Texture) {
      tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    }
  }
  if ("useAlphaFromAlbedoTexture" in mat) mat.useAlphaFromAlbedoTexture = true;
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
  if (tex) {
    tex.hasAlpha = true;
    if (BABYLON.Texture) {
      tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    }
  }
  if ("useAlphaFromAlbedoTexture" in mat) mat.useAlphaFromAlbedoTexture = true;
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
function applyAlphaBlend(BABYLON, mat, { cullOff = true } = {}) {
  const tex = mat.albedoTexture || mat.diffuseTexture;
  if (tex) {
    tex.hasAlpha = true;
    if (BABYLON.Texture) {
      tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    }
  }
  if ("useAlphaFromAlbedoTexture" in mat) mat.useAlphaFromAlbedoTexture = true;
  if ("emissiveColor" in mat) mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
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
 * LES SHADERS « LEGACY » D'UNITY 4 ECLAIRENT EN ESPACE GAMMA.
 *
 * `Diffuse`, `Bumped Diffuse`, `Specular`… : la couleur de la texture, telle
 * qu'elle est stockee, multipliee par la somme des lumieres — et par deux.
 * Le chargeur glTF de Babylon rend des materiaux PBR, qui decodent la texture
 * en lineaire, divisent par pi, puis reencodent. Mesure dans Chromium, pour
 * une couleur 0,5 sous une lumiere d'intensite 1 : le PBR rend 0,43, le
 * materiau standard 0,50 — le calcul d'Unity. Le PBR APLATIT : il eclaircit
 * la penombre et eteint ce qui est eclaire, et le reveil de Timber Hearth,
 * de nuit, y ressemblait a un soir terne (docs/132).
 *
 * On convertit donc chaque materiau PBR du glTF en `StandardMaterial`, sans
 * rien perdre de ce que l'exporteur y a mis : texture et couleur, carte de
 * normales, alpha, emissif, et le nom du shader d'origine, que
 * `applyGameShaders` lit ensuite.
 */
export function toLegacyMaterials(BABYLON, scene, meshes) {
  const faits = new Map();
  let n = 0;
  for (const m of meshes || []) {
    const pbr = m.material;
    if (!pbr || pbr.getClassName() !== "PBRMaterial") continue;
    let std = faits.get(pbr);
    if (!std) {
      std = new BABYLON.StandardMaterial(pbr.name, scene);
      std.metadata = pbr.metadata;
      if (pbr.albedoTexture) std.diffuseTexture = pbr.albedoTexture;
      if (pbr.albedoColor) std.diffuseColor = pbr.albedoColor.clone();
      if (pbr.bumpTexture) {
        std.bumpTexture = pbr.bumpTexture;
        std.invertNormalMapX = pbr.invertNormalMapX;
        std.invertNormalMapY = pbr.invertNormalMapY;
      }
      if (pbr.emissiveTexture) std.emissiveTexture = pbr.emissiveTexture;
      if (pbr.emissiveColor) std.emissiveColor = pbr.emissiveColor.clone();
      std.alpha = pbr.alpha;
      std.backFaceCulling = pbr.backFaceCulling;
      std.twoSidedLighting = pbr.twoSidedLighting;
      std.transparencyMode = pbr.transparencyMode;
      if ("alphaCutOff" in pbr) std.alphaCutOff = pbr.alphaCutOff;
      if (pbr.albedoTexture && pbr.albedoTexture.hasAlpha) {
        std.useAlphaFromDiffuseTexture = true;
      }
      // Seuls les shaders `Specular` ont un reflet : `_SpecColor` gris a 50 %
      // et `_Shininess` 0,078 — un exposant de 10 — par defaut dans Unity 4.
      const shader = unityShaderOf(pbr) || "";
      if (/Specular/i.test(shader)) {
        std.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        std.specularPower = 10;
      } else {
        std.specularColor = new BABYLON.Color3(0, 0, 0);
      }
      std.maxSimultaneousLights = pbr.maxSimultaneousLights;
      faits.set(pbr, std);
    }
    m.material = std;
    n++;
  }
  for (const pbr of faits.keys()) {
    // Les textures sont partagees : on ne libere que le materiau.
    try { pbr.dispose(false, false); } catch (e) { /* deja libere */ }
  }
  return n;
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
    const base = name.split("/").pop();

    if (base === "diamond shader" || name === "diamond shader") {
      if (!cache.has(base)) cache.set(base, makeDiamond(BABYLON, scene));
      mesh.material = cache.get(base);
      bump("diamond shader");
    } else if (base === "V-Fog" || /V-Fog/.test(name)) {
      if (!cache.has("V-Fog")) {
        const tex = mat.albedoTexture || mat.diffuseTexture || null;
        cache.set("V-Fog", makeVFog(BABYLON, scene, tex));
      }
      mesh.material = cache.get("V-Fog");
      bump("V-Fog");
    } else if (/DoubleSidedCutout|AlphaCutoff/.test(name)) {
      applyCutout(BABYLON, mat);
      bump(name);
    } else if (base === "SelfIlluminAlpha" || /SelfIlluminAlpha/.test(name)) {
      applyLitAlpha(BABYLON, mat);
      bump("SelfIlluminAlpha");
    } else if (/SelfIllumin/.test(name)) {
      applySelfIllum(BABYLON, mat);
      bump(name);
    } else if (base === "Atmosphere" || /Atmosphere/.test(name)) {
      applyAlphaBlend(BABYLON, mat, { cullOff: true });
      bump("Atmosphere");
    } else if (/^Particle ?Add|ParticleAdditive/.test(base) || /^Particle ?Add|ParticleAdditive/.test(name)) {
      applyParticleAdditive(BABYLON, mat);
      bump(name);
    } else if (base === "RimShader" || /RimShader/.test(name)) {
      if (!cache.has("RimShader")) {
        cache.set("RimShader", makeRim(BABYLON, scene,
          mat.albedoTexture || mat.diffuseTexture || null));
      }
      mesh.material = cache.get("RimShader");
      bump("RimShader");
    } else if (base === "DistortionShader" || base === "FireBall" || /DistortionShader|FireBall/.test(name)) {
      const key = base === "FireBall" || /FireBall/.test(name) ? "FireBall" : "DistortionShader";
      if (!cache.has(key)) {
        cache.set(key, makeDistortion(BABYLON, scene,
          mat.bumpTexture || null, key === "FireBall" ? 1.4 : 1.0,
          key === "FireBall" ? [1.0, 0.72, 0.45] : [1, 1, 1]));
      }
      mesh.material = cache.get(key);
      bump(key);
    } else if (base === "CrackShader" || /CrackShader/.test(name)) {
      // surcouche transparente double face, file Transparent : meme traitement
      // que l'emissif, la texture portant les fissures lumineuses
      applySelfIllum(BABYLON, mat);
      bump("CrackShader");
    }
  }
  return counts;
}

/**
 * Les decalcomanies : un materiau, pas une mecanique.
 *
 * Trois classes, 98 instances (`DS_DecalProjector` x38, `DS_Decals` x30,
 * `DS_DecalsMeshRenderer` x30) — un systeme tiers dont la geometrie est DEJA
 * exportee : ce sont les trente « Decals Mesh Renderer » que docs/40-solide.md
 * a rendus traversables. Elles etaient donc dans la scene depuis le debut,
 * plaquees comme des maillages ordinaires, sans le decalage de profondeur ni le
 * melange que le systeme prevoit — ce qui se voit en rasant une paroi : la
 * fresque clignote contre le mur, et son fond noir la cache.
 *
 * Deux reglages suffisent, et c'est tout ce que le lot coute :
 *
 *   zOffset    -2, le decalage de profondeur des decalcomanies de Babylon : la
 *              decalcomanie gagne le depart contre la paroi qu'elle epouse
 *   alpha      melange plutot qu'opaque, avec la couche alpha de la texture ;
 *              `_meshOffset` vaut 0 sur les 38 projecteurs, le build ne decale
 *              donc RIEN geometriquement — tout se joue au rendu.
 */
export const DECAL_ZOFFSET = -2;

/** Un maillage est-il une decalcomanie ? Par son nom, ou celui d'un parent. */
export function isDecalMesh(mesh, names) {
  for (let n = mesh; n; n = n.parent) {
    if (n.name && names.has(n.name)) return true;
  }
  return false;
}

export function applyDecals(BABYLON, meshes, names) {
  const want = names instanceof Set ? names : new Set(names || []);
  if (!want.size) return 0;
  let n = 0;
  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat || !isDecalMesh(mesh, want)) continue;
    mat.zOffset = DECAL_ZOFFSET;
    const tex = mat.albedoTexture || mat.diffuseTexture || null;
    if (tex) tex.hasAlpha = true;
    if ("useAlphaFromAlbedoTexture" in mat) mat.useAlphaFromAlbedoTexture = true;
    if ("transparencyMode" in mat && BABYLON.Material) {
      mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    }
    // Une decalcomanie n'ecrit pas dans le tampon de profondeur : elle est SUR
    // la paroi, pas devant elle. Sans cela, deux decalcomanies qui se
    // chevauchent — les cinq fresques du musee — se decoupent l'une l'autre au
    // lieu de se melanger.
    mat.disableDepthWrite = true;
    n++;
  }
  return n;
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
