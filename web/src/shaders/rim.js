// « RimShader » (`Shader "RimLighting"`) — la surface de Giant's Deep.
//
// Ce module etait une « implementation originale, dictee par les proprietes
// du materiau » : un Fresnel generique, des couleurs par defaut choisies a
// l'oeil, un diffus plancher a 0,15. Cote a cote avec l'alpha (docs/132), la
// planete sortait gris clair la ou le jeu la montre presque noire, cerclee
// d'un liseré bleu-vert.
//
// Le programme de fragment du build, lu dans `level0` (passe ForwardBase,
// espace tangent : la normale y vaut (0, 0, 1)) :
//
//   albedo = _MainTex x _DiffuseColor
//   spec   = max(N.H, 0) ^ (128 x _Glossiness)
//   diffus = 2 x N.L x lumiere
//   couleur = albedo x (diffus + ambiante)
//           + diffus x (2 x spec x luminance(lumiere)) x _SpecularColor
//           + _RimColor x (1 - N.V) ^ _RimPower
//
// Le soleil du build est une PONCTUELLE (`SunLight`, portee 20 000) : Unity
// la rend dans la passe additive, ou la lumiere est attenuee par
// 1 / (1 + 25 (d/r)^2). A 16 458 unites, Giant's Deep n'en recoit que 0,17 ;
// le liseré, lui, ne depend d'aucune lumiere, et c'est lui qu'on voit.

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUV;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(world) * normal);
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUV;
uniform sampler2D mainTex;
uniform vec3 cameraPos;
uniform vec3 sunPos;
uniform vec3 sunColor;
uniform float sunRange;
uniform vec3 ambient;
uniform vec3 diffuseColor;
uniform vec3 rimColor;
uniform float rimPower;
uniform float glossiness;
uniform vec3 specularColor;
uniform float hasTex;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPos - vWorldPos);
  vec3 dl = sunPos - vWorldPos;
  vec3 l = normalize(dl);
  float x2 = dot(dl, dl) / (sunRange * sunRange);
  float att = x2 < 1.0 ? 1.0 / (1.0 + 25.0 * x2) : 0.0;
  vec3 lumiere = sunColor * att;
  // _MainTex vaut « black » par defaut : sans texture, pas d'albedo.
  vec3 albedo = (hasTex > 0.5 ? texture2D(mainTex, vUV).rgb : vec3(0.0)) * diffuseColor;
  float ndl = max(dot(n, l), 0.0);
  vec3 diffus = 2.0 * ndl * lumiere;
  float spec = pow(max(dot(n, normalize(v + l)), 0.0), 128.0 * glossiness);
  float lum = dot(vec3(0.2199707, 0.70703125, 0.070983887), lumiere);
  vec3 speculaire = diffus * (2.0 * spec * lum) * specularColor;
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), rimPower);
  gl_FragColor = vec4(albedo * (diffus + ambient) + speculaire + rimColor * rim, 1.0);
}`;

/** Les valeurs par defaut du ShaderLab, quand le materiau n'en dit rien. */
export const RIM_DEFAUTS = {
  _DiffuseColor: [1, 0, 0], _RimColor: [0, 0.118881, 1], _RimPower: 1.70777,
  _Glossiness: 0.430052, _SpecularColor: [0.300699, 1, 0],
};

/**
 * @param props  `{ couleurs, nombres }` du materiau, exportes dans les extras
 *               glTF (`unityProps`) ; les defauts du ShaderLab sinon
 */
export function makeRim(BABYLON, scene, texture = null, props = null) {
  const c = (props && props.couleurs) || {};
  const f = (props && props.nombres) || {};
  const col = (k) => (c[k] || RIM_DEFAUTS[k]).slice(0, 3);
  const num = (k) => (typeof f[k] === "number" ? f[k] : RIM_DEFAUTS[k]);
  const mat = new BABYLON.ShaderMaterial("rim", scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    { attributes: ["position", "normal", "uv"],
      uniforms: ["world", "worldViewProjection", "cameraPos", "sunPos", "sunColor",
                 "sunRange", "ambient", "diffuseColor", "rimColor", "rimPower",
                 "glossiness", "specularColor", "hasTex"],
      samplers: ["mainTex"] });
  mat.setVector3("diffuseColor", new BABYLON.Vector3(...col("_DiffuseColor")));
  mat.setVector3("rimColor", new BABYLON.Vector3(...col("_RimColor")));
  mat.setVector3("specularColor", new BABYLON.Vector3(...col("_SpecularColor")));
  mat.setFloat("rimPower", num("_RimPower"));
  mat.setFloat("glossiness", num("_Glossiness"));
  mat.setFloat("hasTex", texture ? 1 : 0);
  // Tant que personne n'a donne le soleil : pas de lumiere, le liseré seul.
  mat.setVector3("sunPos", new BABYLON.Vector3(0, 0, 0));
  mat.setVector3("sunColor", new BABYLON.Vector3(0, 0, 0));
  mat.setFloat("sunRange", 1);
  mat.setVector3("ambient", new BABYLON.Vector3(0, 0, 0));
  if (texture) mat.setTexture("mainTex", texture);
  return mat;
}
