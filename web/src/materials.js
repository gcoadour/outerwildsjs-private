// Shaders maison.
//
// Sur les 122 shaders du build, 121 gardent leur source ShaderLab lisible et
// 37 sont ecrits par l'equipe (voir tools/12_shaders.py et data/shaders/).
// Les 85 autres sont des shaders Unity standard : un materiau Babylon
// equivalent fait le travail, les reecrire n'aurait aucun sens.
//
// Ce fichier ne transpose aucun shader du jeu. Ce sont des implementations
// originales de techniques classiques — terme de Fresnel pour le limbe
// atmospherique, bruit procedural anime pour la surface stellaire — visant un
// resultat comparable.

const ATMO_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// Le limbe s'allume la ou la normale est perpendiculaire au regard (Fresnel),
// et la face jour est plus lumineuse que la face nuit.
const ATMO_FRAGMENT = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
uniform vec3 cameraPos;
uniform vec3 sunDir;      // du soleil vers la scene
uniform vec3 tint;
uniform float intensity;
uniform float power;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPos - vWorldPos);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), power);
  float day = clamp(dot(n, -normalize(sunDir)) * 0.5 + 0.5, 0.0, 1.0);
  float a = fres * intensity * mix(0.25, 1.0, day);
  gl_FragColor = vec4(tint * a, a);
}`;

const SUN_VERTEX = ATMO_VERTEX;

// Bruit de valeur sur trois octaves, anime : donne une surface qui bouillonne
// sans texture. Le limbe est assombri pour suggerer le volume.
const SUN_FRAGMENT = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
uniform vec3 cameraPos;
uniform float time;
uniform vec3 coreColor;
uniform vec3 edgeColor;
uniform float loopFraction;   // 0 au debut de la boucle, 1 a la supernova

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i), n100 = hash(i + vec3(1,0,0));
  float n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
  float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1));
  float n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 p = n * 3.0 + vec3(0.0, time * 0.05, 0.0);
  float f = noise(p) * 0.55 + noise(p * 2.3) * 0.3 + noise(p * 5.1) * 0.15;
  vec3 v = normalize(cameraPos - vWorldPos);
  float limb = pow(clamp(dot(n, v), 0.0, 1.0), 0.6);
  // l'etoile rougit et s'agite a mesure que la boucle avance
  vec3 late = vec3(1.0, 0.30, 0.08);
  vec3 base = mix(mix(edgeColor, coreColor, f), late, loopFraction * 0.75);
  vec3 col = base * mix(0.55, 1.0, limb) * (1.0 + loopFraction * 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Coque atmospherique autour d'un corps. Ce n'est pas une donnee extraite :
 * le build ne porte pas de couleur d'atmosphere exploitable (le _ambientLight
 * des PlanetoidSector est un indice, pas une teinte). Ces teintes sont donc un
 * choix, pas une mesure.
 */
const TINTS = {
  GravityWell_HomePlanet: [0.45, 0.68, 1.0],
  GravityWell_GasGiant: [0.35, 0.75, 0.7],
  GravityWell_BrittleHollow: [0.55, 0.45, 0.75],
  GravityWell_Quantum: [0.7, 0.75, 0.85],
  GravityWell_Comet: [0.6, 0.8, 0.95],
};

export function makeAtmosphere(BABYLON, scene, body, radius) {
  const tint = TINTS[body.name];
  if (!tint) return null;
  const mesh = BABYLON.MeshBuilder.CreateSphere(
    `atmo_${body.name}`, { diameter: radius * 2.14, segments: 32 }, scene);
  const mat = new BABYLON.ShaderMaterial(`atmoMat_${body.name}`, scene,
    { vertexSource: ATMO_VERTEX, fragmentSource: ATMO_FRAGMENT },
    { attributes: ["position", "normal"],
      uniforms: ["world", "worldViewProjection", "cameraPos", "sunDir",
                 "tint", "intensity", "power"] });
  mat.setVector3("tint", new BABYLON.Vector3(...tint));
  mat.setFloat("intensity", 0.75);
  mat.setFloat("power", 3.0);
  mat.alpha = 0.999;
  mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
  // Les faces arriere DOIVENT etre eliminees. Sans cela leurs normales
  // s'opposent au regard, dot(n,v) est negatif, le clamp le ramene a 0 et le
  // terme de Fresnel sature a 1 sur tout le disque : la planete disparait sous
  // un voile uniforme au lieu de recevoir un halo de limbe.
  mat.backFaceCulling = true;
  mat.needDepthPrePass = false;
  mat.disableDepthWrite = true;
  mesh.material = mat;
  mesh.isPickable = false;
  // rendu apres l'opaque, sinon la coque masque la planete
  mesh.renderingGroupId = 1;
  return { mesh, mat };
}

export function makeSun(BABYLON, scene, mesh) {
  const mat = new BABYLON.ShaderMaterial("sunMat", scene,
    { vertexSource: SUN_VERTEX, fragmentSource: SUN_FRAGMENT },
    { attributes: ["position", "normal"],
      uniforms: ["world", "worldViewProjection", "cameraPos", "time",
                 "coreColor", "edgeColor", "loopFraction"] });
  mat.setVector3("coreColor", new BABYLON.Vector3(1.0, 0.93, 0.72));
  mat.setVector3("edgeColor", new BABYLON.Vector3(0.95, 0.45, 0.12));
  mat.setFloat("time", 0);
  mat.setFloat("loopFraction", 0);
  mat.backFaceCulling = true;
  mesh.material = mat;
  return mat;
}

/** Uniformes dependant de la camera, a rafraichir chaque frame. */
export function updateMaterials(BABYLON, mats, cameraPos, sunDir, timeSec,
                                loopFraction = 0) {
  const cp = new BABYLON.Vector3(cameraPos.x, cameraPos.y, cameraPos.z);
  for (const m of mats.atmospheres) {
    m.mat.setVector3("cameraPos", cp);
    m.mat.setVector3("sunDir", sunDir);
  }
  if (mats.sun) {
    mats.sun.setVector3("cameraPos", cp);
    mats.sun.setFloat("time", timeSec);
    mats.sun.setFloat("loopFraction", loopFraction);
  }
}
