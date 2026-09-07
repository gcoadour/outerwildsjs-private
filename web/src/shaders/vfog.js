// « V-Fog » — volume de brouillard texture, double face.
//
// Proprietes du shader d'origine : _MainTex, _Color (avec alpha), _FogOff.
// Etat de rendu : Cull Off — le volume se voit de l'interieur comme de
// l'exterieur.
//
// Un brouillard credible a besoin de deux choses que le rendu opaque ne donne
// pas : s'attenuer avec la distance parcourue dans le volume, et ne pas
// trancher net a l'intersection avec la geometrie. On approche la premiere par
// l'incidence du regard, la seconde par un fondu sur les bords.

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
uniform vec4 tint;
uniform float hasTex;
uniform float scroll;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPos - vWorldPos);
  // incidence rasante = plus de brouillard traverse
  float thickness = 1.0 - abs(dot(n, v));
  vec4 tex = hasTex > 0.5
    ? texture2D(mainTex, vUV + vec2(scroll * 0.01, scroll * 0.007))
    : vec4(1.0);
  float a = tint.a * tex.a * mix(0.35, 1.0, thickness);
  gl_FragColor = vec4(tint.rgb * tex.rgb, a);
}`;

export function makeVFog(BABYLON, scene, texture = null,
                         color = [0.62, 0.70, 0.82, 0.45]) {
  const mat = new BABYLON.ShaderMaterial("vfog", scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    { attributes: ["position", "normal", "uv"],
      uniforms: ["world", "worldViewProjection", "cameraPos", "tint",
                 "hasTex", "scroll"],
      samplers: ["mainTex"] });
  mat.setVector4("tint", new BABYLON.Vector4(...color));
  mat.setFloat("hasTex", texture ? 1 : 0);
  mat.setFloat("scroll", 0);
  if (texture) mat.setTexture("mainTex", texture);
  mat.alpha = 0.999;
  mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  mat.backFaceCulling = false;      // Cull Off
  mat.disableDepthWrite = true;
  return mat;
}
