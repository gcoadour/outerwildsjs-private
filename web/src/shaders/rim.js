// « RimShader » — eclairage de bord.
//
// Proprietes declarees : _MainTex, _DiffuseColor, _SpecularColor, _Glossiness,
// _RimColor, _RimPower. Rendu opaque, file Geometry.
//
// Technique classique : un terme de Fresnel ajoute au diffus fait ressortir la
// silhouette. _RimPower controle la nettete du liseré. Implementation
// originale, dictee par les proprietes du materiau d'origine.

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
uniform vec3 sunDir;
uniform vec3 diffuseColor;
uniform vec3 rimColor;
uniform float rimPower;
uniform float hasTex;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPos - vWorldPos);
  vec3 l = -normalize(sunDir);
  vec3 base = hasTex > 0.5 ? texture2D(mainTex, vUV).rgb : vec3(1.0);
  float diff = max(dot(n, l), 0.0) * 0.85 + 0.15;
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), rimPower);
  gl_FragColor = vec4(base * diffuseColor * diff + rimColor * rim, 1.0);
}`;

export function makeRim(BABYLON, scene, texture = null,
                        diffuse = [0.8, 0.82, 0.86],
                        rim = [0.45, 0.68, 0.95], power = 3.0) {
  const mat = new BABYLON.ShaderMaterial("rim", scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    { attributes: ["position", "normal", "uv"],
      uniforms: ["world", "worldViewProjection", "cameraPos", "sunDir",
                 "diffuseColor", "rimColor", "rimPower", "hasTex"],
      samplers: ["mainTex"] });
  mat.setVector3("diffuseColor", new BABYLON.Vector3(...diffuse));
  mat.setVector3("rimColor", new BABYLON.Vector3(...rim));
  mat.setFloat("rimPower", power);
  mat.setFloat("hasTex", texture ? 1 : 0);
  if (texture) mat.setTexture("mainTex", texture);
  return mat;
}
