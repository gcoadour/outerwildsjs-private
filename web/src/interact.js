// Objets interactifs et textes lisibles.
//
// InteractReceiver (39 instances) porte une invite et une portee (2 ou 3 u).
// ReadableObject (34 instances) porte un texte, resolu depuis son TextAsset.
//
// Les textes sont du contenu narratif du jeu : ils viennent de data/, qui n'est
// pas versionne, et sont charges a l'execution.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export class Interactables {
  /**
   * @param gameplay data/gameplay.json
   * @param toFrame  fonction position monde -> repere courant
   */
  constructor(gameplay) {
    const placed = (gameplay && gameplay.placed) || {};
    this.items = [];
    for (const x of placed.InteractReceiver || []) {
      this.items.push({
        kind: "interact", name: x.name, world: x.position,
        range: (x.fields && x.fields._interactRange) || 2,
        prompt: (x.fields && x.fields._prompt) || null,
      });
    }
    for (const x of placed.ReadableObject || []) {
      this.items.push({
        kind: "readable", name: x.name, world: x.position,
        range: 3, prompt: null, text: x.text || null,
      });
    }
  }

  /**
   * Cible visee : l'objet le plus proche dans sa portee, devant le joueur.
   * @param origin position du joueur dans le repere courant
   * @param frameOffset decalage monde -> repere (positions des objets)
   * @param fwd direction du regard
   */
  focus(origin, frameOffset, fwd) {
    let best = null, bestD = Infinity;
    for (const it of this.items) {
      const p = sub(it.world, frameOffset);
      const d = [p[0] - origin.x, p[1] - origin.y, p[2] - origin.z];
      const dist = Math.hypot(...d);
      if (dist > it.range + 1.5 || dist > bestD) continue;
      // devant le joueur : produit scalaire positif
      if (dist > 0.001) {
        const dot = (d[0] * fwd.x + d[1] * fwd.y + d[2] * fwd.z) / dist;
        if (dot < 0.3) continue;
      }
      best = it; bestD = dist;
    }
    return best;
  }
}
