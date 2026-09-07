// Construction des corps celestes dans la scene Babylon.

/**
 * Cree une sphere par corps, dimensionnee sur son rayon de surface reel.
 * Les positions restent en coordonnees monde ; le placement de rendu est
 * recalcule a chaque recentrage du floating origin.
 */
export function buildBodies(BABYLON, scene, bodies) {
  const palette = [
    [1.0, 0.85, 0.45], [0.45, 0.62, 0.42], [0.55, 0.48, 0.58],
    [0.35, 0.55, 0.75], [0.70, 0.45, 0.35], [0.60, 0.60, 0.65],
    [0.50, 0.70, 0.65], [0.75, 0.60, 0.40], [0.45, 0.45, 0.70],
    [0.65, 0.55, 0.50],
  ];

  return bodies.map((b, i) => {
    const r = b.gravity.upperSurfaceRadius || 100;
    const mesh = BABYLON.MeshBuilder.CreateSphere(
      b.name, { diameter: r * 2, segments: 24 }, scene);

    const mat = new BABYLON.StandardMaterial(b.name + "_mat", scene);
    const c = palette[i % palette.length];
    const isStar = (b.gravity.surfaceAcceleration || 0) >= 50;
    mat.diffuseColor = new BABYLON.Color3(c[0], c[1], c[2]);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    if (isStar) mat.emissiveColor = new BABYLON.Color3(c[0], c[1] * 0.8, c[2] * 0.4);
    mesh.material = mat;

    return { data: b, mesh, radius: r, isStar };
  });
}

/**
 * Repositionne les spheres de substitution.
 * `data.position` est deja exprimee dans le repere du corps ancre (voir
 * reframe() dans main.js) : il n'y a plus de decalage a soustraire.
 */
export function syncBodies(BABYLON, entries) {
  for (const e of entries) {
    const p = e.data.position;
    e.mesh.position.set(p[0], p[1], p[2]);
  }
}
