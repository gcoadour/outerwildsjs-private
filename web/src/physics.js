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
/**
 * Un maillage descend-il d'un noeud endormi ?
 *
 * Les 21 `ChildColliderLOD` du build disent quels sous-arbres n'ont pas a
 * exister en collision quand personne n'est a portee. C'est la ou tombent les
 * 441 colliders de Timber Hearth (docs/36-audit.md §2.8).
 */
export function underAsleep(mesh, asleep) {
  if (!asleep || !asleep.size) return false;
  for (let n = mesh; n; n = n.parent) {
    if (n.name && asleep.has(n.name)) return true;
  }
  return false;
}

/**
 * Le build dit ce qui est solide, et le portage le prenait pour acquis.
 *
 * Un maillage rendu n'est pas un maillage de collision : sur 2 219 objets qui
 * portent un maillage dans `level0`, **1 885 seulement portent un collider**.
 * Les 725 autres — branches, cristaux, decalcomanies, symboles flottants, les
 * 24 nuages de Timber Hearth et la voute `SkyShell` — se traversent, et c'est
 * voulu. L'exportateur glTF marque donc chaque noeud concerne
 * (`extras.noCollide`), et ils n'entrent plus en collision.
 *
 * Deux consequences : on ne se pose plus sur un nuage ni sur l'interieur de la
 * voute celeste, et le budget de colliders cesse d'etre mange par du decor.
 */
/**
 * Le maillage n'a pas de renderer allume dans le build (`extras.hidden`) : il
 * existe pour la collision ou pour le jeu, pas pour l'oeil.
 */
export function hiddenMesh(mesh) {
  const m = mesh && mesh.metadata;
  const e = m && m.gltf && m.gltf.extras;
  return !!(e && e.hidden);
}

/** Le GameObject est inactif dans la scene (`extras.inactive`, docs/132). */
export function inactiveNode(node) {
  const m = node && node.metadata;
  const e = m && m.gltf && m.gltf.extras;
  return !!(e && e.inactive);
}

/** Vrai si le noeud ou l'un de ses ancetres est inactif. */
export function underInactive(node) {
  for (let n = node; n; n = n.parent) if (inactiveNode(n)) return true;
  return false;
}

/**
 * Eteint, dans un lot importe, les GameObjects inactifs du build : un cratere
 * d'origine superpose au vrai, des arbres de test, des maquettes grises. Leur
 * descendance s'eteint avec eux, par la hierarchie.
 */
export function disableInactive(res) {
  let n = 0;
  for (const x of [...(res.transformNodes || []), ...(res.meshes || [])]) {
    if (inactiveNode(x)) { x.setEnabled(false); n++; }
  }
  return n;
}

/**
 * Les `extras` d'un noeud a plusieurs primitives, rendus a ses primitives.
 *
 * L'exporteur ecrit un primitive par sous-maillage (173 renderers en ont
 * plusieurs). Babylon fait alors du noeud un parent et de chaque primitive un
 * maillage enfant, `<nom>_primitive<i>` — et laisse les `extras` au parent :
 * calque, renderer eteint, collision, ombres se perdaient. On ne les recopie
 * que du parent DIRECT et que sur ses propres primitives : un enfant qui est
 * un autre noeud garde les siens.
 */
export function propagerExtras(meshes) {
  let n = 0;
  for (const m of meshes || []) {
    if (!m || (m.metadata && m.metadata.gltf && m.metadata.gltf.extras)) continue;
    const p = m.parent;
    const ex = p && p.metadata && p.metadata.gltf && p.metadata.gltf.extras;
    const suffixe = ex && typeof m.name === "string" && m.name.startsWith(`${p.name}_primitive`)
      ? m.name.slice(p.name.length + "_primitive".length) : null;
    if (!suffixe || !/^\d+$/.test(suffixe)) continue;
    m.metadata = { ...(m.metadata || {}), gltf: { ...((m.metadata && m.metadata.gltf) || {}), extras: ex } };
    n++;
  }
  return n;
}

/** Masque, dans un lot importe, ce que le build ne dessine pas. */
export function hideUnrendered(meshes) {
  let n = 0;
  // `__lodPinned` : le LOD (lod.js) rallume tout ce qui grandit a l'ecran, et
  // la sphere du feu de camp, a quatre metres, grandissait assez.
  for (const m of meshes || []) {
    if (hiddenMesh(m)) { m.isVisible = false; m.__lodPinned = true; n++; }
  }
  return n;
}

/** Le renderer de ce maillage est-il eteint dans la scene (`m_Enabled` a 0) ? */
export function rendererOff(mesh) {
  const m = mesh && mesh.metadata;
  const e = m && m.gltf && m.gltf.extras;
  return !!(e && e.rendererOff);
}

/**
 * Ce maillage porte-t-il, recoit-il l'ombre (`m_CastShadows`,
 * `m_ReceiveShadows`) ? Un maillage sans extras fait les deux, comme un
 * renderer d'Unity par defaut.
 */
export function ombresDuRenderer(mesh) {
  const m = mesh && mesh.metadata;
  const e = (m && m.gltf && m.gltf.extras) || {};
  return { porte: !e.noCastShadows, recoit: !e.noReceiveShadows };
}

/**
 * Cache ce que le build pose avec un renderer eteint.
 *
 * Distinct de `hideUnrendered` : un renderer eteint se RALLUME (`Renderer
 * .enabled`, a la longue-vue, au rayon tracteur, aux paupieres qui clignent),
 * et les objets tenus en main que le moteur allume lui-meme ne passent pas
 * par ici — seulement le decor charge par `geometry.js`.
 */
export function hideDisabledRenderers(meshes) {
  let n = 0;
  for (const m of meshes || []) {
    if (rendererOff(m)) { m.isVisible = false; m.__lodPinned = true; n++; }
  }
  return n;
}

export function noCollide(mesh) {
  const m = mesh && mesh.metadata;
  const e = m && m.gltf && m.gltf.extras;
  return !!(e && e.noCollide);
}

export function buildColliders(BABYLON, scene, meshes, opts = {}) {
  const { maxCount = 1200, minVertices = 12, asleep = null } = opts;
  const aggregates = [];
  let skipped = 0;
  let dormants = 0;
  let traversables = 0;
  let inactifs = 0;
  for (const m of meshes) {
    if (aggregates.length >= maxCount) break;
    if (noCollide(m)) { traversables++; continue; }
    // Un collider sur un GameObject inactif n'existe pas pour PhysX : on ne se
    // heurte pas au cratere d'origine que la scene garde eteint (docs/132).
    if (underInactive(m)) { inactifs++; continue; }
    if (underAsleep(m, asleep)) { dormants++; continue; }
    if (m.getTotalVertices() < minVertices) { skipped++; continue; }
    try {
      m.computeWorldMatrix(true);
      aggregates.push(new BABYLON.PhysicsAggregate(
        m, BABYLON.PhysicsShapeType.MESH, { mass: 0 }, scene));
    } catch (e) {
      skipped++;
    }
  }
  return { aggregates, skipped, dormants, traversables, inactifs };
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
