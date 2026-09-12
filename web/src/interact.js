// Objets interactifs et textes lisibles.
//
// InteractReceiver (39 instances) porte une invite et une portee (2 ou 3 u).
// ReadableObject (34 instances) porte un texte, resolu depuis son TextAsset.
//
// Les textes sont du contenu narratif du jeu : ils viennent de data/, qui n'est
// pas versionne, et sont charges a l'execution.
//
// S'y ajoutent les sept `InteractZone` du build (docs/46, lot 4) : ce sont
// elles qui annoncent « Gear Up », « Buckle Up » ou « Open Hatch », et rien ne
// les lisait. La loi de leur fenetre de vue vit dans `gear.js`, avec le reste
// de ce lot-la.

import { zoneFaced } from "./gear.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Rotation d'un vecteur par un quaternion [x, y, z, w]. */
function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

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
    // Les sept `InteractZone` : une invite, et une FENETRE DE VUE.
    //
    // Elles ne sont pas des `InteractReceiver` — ce sont les zones du vaisseau
    // et du village, « Gear Up », « Buckle Up », « Open Hatch » — et rien ne
    // les lisait. Sans elles, l'objet a ramasser du lot 7 ne s'annonce pas : on
    // passe devant sans savoir qu'il y a quelque chose a prendre.
    //
    // `_viewingWindow` est l'angle, en degres, autour de l'avant de la zone :
    // 60 pour la trappe, 90 pour les commandes, 360 pour ce qui se prend de
    // n'importe ou. Il vaut un demi-angle une fois compare (docs/46, lot 4).
    for (const x of placed.InteractZone || []) {
      const f = x.fields || {};
      this.items.push({
        kind: "zone", name: x.name, world: x.position, body: x.body || null,
        range: (x.volume && x.volume.radius) || 2,
        prompt: f._prompt || null,
        viewingWindow: f._viewingWindow ?? 360,
        rotation: x.rotation || null,
      });
    }
  }

  /**
   * Cible visee : l'objet le plus proche dans sa portee, devant le joueur.
   * @param origin position du joueur dans le repere courant
   * @param frameOffset decalage monde -> repere (positions des objets)
   * @param fwd direction du regard
   */
  focus(origin, frameOffset, fwd, shiftOf = null) {
    let best = null, bestD = Infinity;
    for (const it of this.items) {
      // Les positions extraites sont celles de la scene AU REPOS ; `shiftOf`
      // rend le deplacement du corps porteur depuis. Sans lui, une zone posee
      // dans le vaisseau reste sur l'aire de lancement quand le vaisseau part.
      const shift = shiftOf ? shiftOf(it) : null;
      const w = shift ? [it.world[0] + shift[0], it.world[1] + shift[1],
                         it.world[2] + shift[2]] : it.world;
      const p = sub(w, frameOffset);
      const d = [p[0] - origin.x, p[1] - origin.y, p[2] - origin.z];
      const dist = Math.hypot(...d);
      if (dist > it.range + 1.5 || dist > bestD) continue;
      // devant le joueur : produit scalaire positif
      if (dist > 0.001) {
        const dot = (d[0] * fwd.x + d[1] * fwd.y + d[2] * fwd.z) / dist;
        if (dot < 0.3) continue;
        // Une zone d'interaction ajoute sa propre fenetre, et ce n'est PAS
        // l'angle du regard : le build mesure l'angle entre l'AVANT DE LA ZONE
        // et la direction du joueur. Une trappe a 60 degres s'ouvre depuis le
        // devant de la trappe, quel que soit l'endroit ou l'on regarde.
        if (it.viewingWindow != null && it.rotation
            && !zoneFaced(it, [-d[0] / dist, -d[1] / dist, -d[2] / dist],
                          qrot(it.rotation, [0, 0, 1]))) continue;
      }
      best = it; bestD = dist;
    }
    return best;
  }
}
