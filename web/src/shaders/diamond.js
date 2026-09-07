// « diamond shader » — halo interne additif.
//
// Le shader d'origine est le plus utilise du jeu apres les shaders Unity :
// 62 affectations pour un seul materiau. Ses etats de rendu disent tout :
//
//   Blend One One    fusion additive
//   Cull Front       les faces AVANT sont eliminees : on voit l'interieur
//   ZWrite Off       n'ecrit pas dans le tampon de profondeur
//
// Voir l'interieur d'un volume en additif donne un halo qui s'intensifie la ou
// la geometrie est epaisse — l'aspect d'un cristal eclaire de l'interieur.
// L'implementation ci-dessous est la mienne ; seuls les etats de rendu et la
// propriete _Color viennent du build.

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 wp = world * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(world) * normal);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// Les faces avant etant eliminees, la normale vue pointe a l'oppose du regard.
// Son produit scalaire avec la direction de vue mesure l'epaisseur traversee :
// fort de face, faible sur les bords.
const FRAGMENT = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vNormal;
uniform vec3 cameraPos;
uniform vec3 tint;
uniform float intensity;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPos - vWorldPos);
  float depth = clamp(-dot(n, v), 0.0, 1.0);
  float glow = pow(depth, 1.6) * intensity;
  gl_FragColor = vec4(tint * glow, glow);
}`;

export function makeDiamond(BABYLON, scene, baseColor = [0.55, 0.78, 0.95]) {
  const mat = new BABYLON.ShaderMaterial("diamond", scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    { attributes: ["position", "normal"],
      uniforms: ["world", "worldViewProjection", "cameraPos", "tint", "intensity"] });
  mat.setVector3("tint", new BABYLON.Vector3(...baseColor));
  mat.setFloat("intensity", 0.85);
  mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
  mat.alpha = 0.999;
  // Cull Front d'Unity : on ne garde que les faces arriere
  mat.sideOrientation = BABYLON.Material.ClockWiseSideOrientation;
  mat.backFaceCulling = true;
  mat.disableDepthWrite = true;
  return mat;
}
