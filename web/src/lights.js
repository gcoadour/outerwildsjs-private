// Lumieres de la scene.
//
// Le moteur n'en avait que deux — une directionnelle pour l'etoile, une
// hemispherique d'ambiance — pour tout un systeme solaire. Le build en pose
// beaucoup plus, avec leur type, leur couleur, leur intensite et leur portee :
// le feu de camp, les interieurs, les balises de Dark Bramble.
//
// Une lumiere temps reel est chere, et il y en a trop pour toutes les allumer.
// C'est la meme reponse que pour l'audio et les particules : on instancie a la
// volee, dans un budget, celles dont on est assez pres pour qu'elles comptent.
// Le choix des elues est de la logique pure, donc verifiable sans navigateur.

/** Lumieres allumees simultanement. Au-dela, le temps par image s'effondre. */
export const LIGHT_BUDGET = 8;
/** Multiple de la portee au-dela duquel une lumiere ne sert plus a rien. */
export const LIGHT_REACH = 1.25;

export async function loadLighting() {
  try {
    const res = await fetch("data/lighting.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("data/lighting.json absent :", e.message);
    return { settings: null, lights: [] };
  }
}

/**
 * Les lumieres a allumer, de la plus proche a la plus lointaine.
 *
 * Une lumiere cuite dans les lightmaps (`m_Lightmapping = 2`) n'eclaire rien a
 * l'execution : elle est ecartee d'emblee, sans quoi elle occuperait le budget
 * sans rien apporter. Une directionnelle n'a pas de portee et reste candidate
 * partout.
 */
export function pickLights(lights, listener, budget = LIGHT_BUDGET,
                           reach = LIGHT_REACH) {
  const near = [];
  for (const l of lights) {
    if (l.enabled === false || l.lightmapping === 2) continue;
    if (!(l.intensity > 0)) continue;
    const d = Math.hypot(l.position[0] - listener[0],
                         l.position[1] - listener[1],
                         l.position[2] - listener[2]);
    if (l.type === "directional") { near.push({ light: l, distance: 0 }); continue; }
    if (!(l.range > 0) || d > l.range * reach) continue;
    near.push({ light: l, distance: d });
  }
  // A budget egal, la plus proche gagne : c'est celle dont l'absence se voit.
  near.sort((a, b) => a.distance - b.distance);
  return near.slice(0, budget);
}

/** Champ de lumieres : instancie et libere selon le budget. */
export class LightField {
  constructor(BABYLON, scene, lights = [], budget = LIGHT_BUDGET) {
    this.B = BABYLON;
    this.scene = scene;
    this.lights = lights;
    this.budget = budget;
    this.live = new Map();     // lumiere -> objet Babylon
    this.failed = 0;
  }

  get count() { return this.live.size; }
  get total() { return this.lights.length; }

  /**
   * @param listener position de l'auditeur dans le repere courant
   * @param toFrame  decalage monde -> repere (position du corps ancre)
   */
  update(listener, toFrame = [0, 0, 0]) {
    if (!this.lights.length) return 0;
    const world = [listener.x + toFrame[0], listener.y + toFrame[1],
                   listener.z + toFrame[2]];
    const want = new Set();
    for (const { light } of pickLights(this.lights, world, this.budget)) {
      want.add(light);
      let node = this.live.get(light);
      if (!node) {
        node = this.create(light);
        if (!node) continue;
        this.live.set(light, node);
      }
      const p = [light.position[0] - toFrame[0], light.position[1] - toFrame[1],
                 light.position[2] - toFrame[2]];
      if (node.position) node.position.set(p[0], p[1], p[2]);
    }
    for (const [light, node] of [...this.live]) {
      if (want.has(light)) continue;
      try { node.dispose(); } catch (e) { /* deja liberee */ }
      this.live.delete(light);
    }
    return this.live.size;
  }

  create(l) {
    const B = this.B, V = B.Vector3;
    try {
      const p = new V(l.position[0], l.position[1], l.position[2]);
      const d = new V(l.direction[0], l.direction[1], l.direction[2]);
      let node;
      if (l.type === "spot") {
        // m_SpotAngle est l'angle TOTAL du cone, en degres ; Babylon attend
        // l'angle total en radians, et l'exposant de decroissance a part.
        node = new B.SpotLight(`ow_${l.name}`, p, d,
                               (l.spotAngle || 45) * Math.PI / 180, 2, this.scene);
      } else if (l.type === "directional") {
        node = new B.DirectionalLight(`ow_${l.name}`, d, this.scene);
      } else {
        node = new B.PointLight(`ow_${l.name}`, p, this.scene);
      }
      node.intensity = l.intensity ?? 1;
      if (l.range > 0) node.range = l.range;
      if (l.color) node.diffuse = new B.Color3(l.color[0], l.color[1], l.color[2]);
      return node;
    } catch (e) {
      this.failed += 1;
      return null;
    }
  }
}
