// Physique Havok : colliders trimesh sur la geometrie reelle.
//
// La gravite du moteur est mise a ZERO : le jeu n'a pas de gravite uniforme,
// chaque corps porte un champ et le plus fort l'emporte (voir gravity.js). On
// applique donc l'acceleration nous-memes, en force, a chaque pas.
//
// Les colliders ne sont construits que pour le corps dominant, et reconstruits
// au changement de corps. C'est ce que permet l'ancrage du floating origin sur
// le corps : tant qu'on reste dessus, les colliders statiques ne bougent pas.

export async function initPhysics(BABYLON, scene) {
  if (typeof HavokPhysics === "undefined") {
    console.warn("Havok absent : repli sur la collision analytique");
    return null;
  }
  try {
    const hk = await HavokPhysics({ locateFile: () => "vendor/HavokPhysics.wasm" });
    const plugin = new BABYLON.HavokPlugin(true, hk);
    // gravite globale nulle : les champs sont appliques a la main
    scene.enablePhysics(BABYLON.Vector3.Zero(), plugin);
    return plugin;
  } catch (e) {
    console.warn("Havok indisponible :", e.message);
    return null;
  }
}

/**
 * Construit des colliders trimesh statiques sur un lot de maillages.
 * Les maillages minuscules sont ignores : ils coutent un collider chacun pour
 * un apport nul sur les appuis du joueur.
 */
export function buildColliders(BABYLON, scene, meshes, opts = {}) {
  const { maxCount = 1200, minVertices = 12 } = opts;
  const aggregates = [];
  let skipped = 0;
  for (const m of meshes) {
    if (aggregates.length >= maxCount) break;
    if (m.getTotalVertices() < minVertices) { skipped++; continue; }
    try {
      m.computeWorldMatrix(true);
      aggregates.push(new BABYLON.PhysicsAggregate(
        m, BABYLON.PhysicsShapeType.MESH, { mass: 0 }, scene));
    } catch (e) {
      skipped++;
    }
  }
  return { aggregates, skipped };
}

export function disposeColliders(set) {
  if (!set) return;
  for (const a of set.aggregates) {
    try { a.dispose(); } catch (e) { /* deja libere */ }
  }
}

/**
 * Corps du joueur : une SPHERE, pas une capsule. Une capsule devrait etre
 * maintenue verticale en permanence, or la verticale change de direction d'un
 * corps a l'autre. Une sphere n'a pas d'orientation a defendre ; un fort
 * amortissement angulaire l'empeche de rouler.
 */
export function createPlayerBody(BABYLON, scene, renderPos, radius = 0.6) {
  const mesh = BABYLON.MeshBuilder.CreateSphere(
    "playerBody", { diameter: radius * 2, segments: 8 }, scene);
  mesh.isVisible = false;
  mesh.position.set(renderPos.x, renderPos.y, renderPos.z);
  const agg = new BABYLON.PhysicsAggregate(
    mesh, BABYLON.PhysicsShapeType.SPHERE,
    { mass: 70, restitution: 0, friction: 0.9 }, scene);
  agg.body.setLinearDamping(0.1);
  agg.body.setAngularDamping(20);
  return agg;
}

/** Teleporte le corps du joueur (utilise au rechangement d'ancre d'origine). */
export function teleportBody(BABYLON, agg, renderPos, keepVelocity = true) {
  const v = keepVelocity ? agg.body.getLinearVelocity() : BABYLON.Vector3.Zero();
  agg.transformNode.position.set(renderPos.x, renderPos.y, renderPos.z);
  agg.body.disablePreStep = false;
  agg.body.setLinearVelocity(v);
  agg.body.setAngularVelocity(BABYLON.Vector3.Zero());
}
