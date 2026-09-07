// « DistortionShader » et « FireBall » — distorsion multiplicative.
//
// Les deux partagent le meme etat de rendu : Blend DstColor Zero, soit une
// fusion MULTIPLICATIVE, en file Transparent. Leurs proprietes (_BumpMap,
// _BumpAmt, et _MainTex/_MyTexture pour FireBall) trahissent la technique
// Unity classique : capturer le fond, le decaler selon une carte de normales,
// et le recomposer — l'effet de chaleur ou de refraction.
//
// APPROXIMATION ASSUMEE : capturer le fond demande un rendu dans une texture
// intermediaire. On rend ici la modulation multiplicative pilotee par la carte
// de normales, animee, sans le decalage du fond. On obtient un voile ondulant
// credible, pas une vraie refraction.

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
uniform sampler2D bumpMap;
uniform vec3 cameraPos;
uniform float bumpAmt;
uniform float time;
uniform float hasBump;
uniform vec3 tint;
void main() {
  vec2 uv = vUV + vec2(time * 0.03, time * 0.017);
  vec3 b = hasBump > 0.5 ? texture2D(bumpMap, uv).rgb * 2.0 - 1.0 : vec3(0.0, 0.0, 1.0);
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPos - vWorldPos);
  // la distorsion se voit surtout en incidence rasante
  float edge = 1.0 - abs(dot(n, v));
  float d = 1.0 - clamp(length(b.xy) * bumpAmt * edge, 0.0, 0.75);
  gl_FragColor = vec4(tint * d, 1.0);
}`;

export function makeDistortion(BABYLON, scene, bumpTexture = null,
                               amount = 1.0, tint = [1, 1, 1]) {
  const mat = new BABYLON.ShaderMaterial("distortion", scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    { attributes: ["position", "normal", "uv"],
      uniforms: ["world", "worldViewProjection", "cameraPos", "bumpAmt",
                 "time", "hasBump", "tint"],
      samplers: ["bumpMap"] });
  mat.setFloat("bumpAmt", amount);
  mat.setFloat("time", 0);
  mat.setFloat("hasBump", bumpTexture ? 1 : 0);
  mat.setVector3("tint", new BABYLON.Vector3(...tint));
  if (bumpTexture) mat.setTexture("bumpMap", bumpTexture);
  // Blend DstColor Zero : multiplication du fond
  mat.alphaMode = BABYLON.Engine.ALPHA_MULTIPLY;
  mat.alpha = 0.999;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  return mat;
}
