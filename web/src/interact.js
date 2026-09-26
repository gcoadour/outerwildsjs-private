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

import { zoneFaced, interactZones } from "./gear.js";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Rotation d'un vecteur par un quaternion [x, y, z, w]. */
function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

/**
 * Le `PlayerDetector` : la capsule posee sur `Player_Body`, rayon 0,5, hauteur
 * 2, centree. C'est ELLE qui entre dans une `InteractZone` (`OnTriggerEnter`,
 * `collider.tag == "PlayerDetector"`) — pas l'oeil, pas les pieds.
 */
export const DETECTEUR = { rayon: 0.5, hauteur: 2 };

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Les points les plus proches de deux segments, et leur distance. */
function distSegments(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot3(d1, d1), e = dot3(d2, d2), f = dot3(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return Math.hypot(...r);
  if (a <= 1e-9) { t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = dot3(d1, r);
    if (e <= 1e-9) { s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = dot3(d1, d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return Math.hypot(...sub(add(p1, mul(d1, s)), add(p2, mul(d2, t))));
}

/**
 * Le joueur est-il DANS le volume d'une zone ? C'est `_isPlayerInsideVolume`
 * d'`InteractZone` : la capsule du `PlayerDetector` touche le declencheur.
 *
 * @param pos, rot, vol  la zone : position, rotation, collider extrait
 * @param joueur         centre de `Player_Body`
 * @param haut           verticale du joueur (axe de sa capsule)
 */
export function joueurDansVolume(pos, rot, vol, joueur, haut = null, det = DETECTEUR) {
  if (!vol) return false;
  const q = rot || [0, 0, 0, 1];
  const c = vol.center ? add(pos, qrot(q, vol.center)) : pos;
  const n = haut ? Math.hypot(...haut) || 1 : 1;
  const u = haut ? mul(haut, 1 / n) : [0, 0, 0];
  const demiDet = Math.max(0, det.hauteur / 2 - det.rayon);
  const a0 = add(joueur, mul(u, -demiDet)), a1 = add(joueur, mul(u, demiDet));
  if (vol.shape === "sphere") {
    return distSegments(a0, a1, c, c) <= (vol.radius || 0) + det.rayon;
  }
  if (vol.shape === "capsule") {
    const axe = [0, 0, 0]; axe[vol.axis ?? 1] = 1;
    const ax = qrot(q, axe);
    const demi = Math.max(0, (vol.height || 0) / 2 - (vol.radius || 0));
    return distSegments(a0, a1, add(c, mul(ax, -demi)), add(c, mul(ax, demi)))
      <= (vol.radius || 0) + det.rayon;
  }
  if (vol.shape === "box" && vol.size) {
    const inv = [-q[0], -q[1], -q[2], q[3]];
    for (let i = 0; i <= 8; i++) {
      const l = qrot(inv, sub(add(a0, mul(sub(a1, a0), i / 8)), c));
      const ex = l.map((v, k) => Math.max(0, Math.abs(v) - vol.size[k] / 2));
      if (Math.hypot(...ex) <= det.rayon) return true;
    }
    return false;
  }
  return false;
}

/**
 * La portee du rayon de `FirstPersonManipulator.LateUpdate` :
 *
 *     Physics.Raycast(camera.position, camera.forward, out hit, 10,
 *                     OWLayerMask.GetInteractMask())
 *     hit.collider.GetComponent<InteractReceiver>().Observe(hit)
 *
 * puis `Observe` n'accepte que si `hit.distance <= _interactRange` (2 ou 3).
 * On parle donc a quelqu'un en le REGARDANT, a deux pas de sa capsule. Le
 * portage ouvrait une conversation a six metres du centre, ou que l'on
 * regarde (docs/132).
 */
export const RAYON_VISEE = 10;

/**
 * Distance le long d'un rayon jusqu'au volume d'un collider, ou null.
 *
 * @param o      origine du rayon
 * @param d      direction unitaire
 * @param pos    position du GameObject (meme repere que o)
 * @param rot    son orientation [x, y, z, w], ou null
 * @param vol    `{ shape, radius, height, axis, size, center }` de l'extracteur
 */
export function rayonVolume(o, d, pos, rot, vol) {
  if (!vol) return null;
  const q = rot || [0, 0, 0, 1];
  const c0 = vol.center || [0, 0, 0];
  const cr = qrot(q, c0);
  const c = [pos[0] + cr[0], pos[1] + cr[1], pos[2] + cr[2]];
  const sphere = (cc, r) => {
    const m = sub(o, cc);
    const b = m[0] * d[0] + m[1] * d[1] + m[2] * d[2];
    const k = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] - r * r;
    if (k > 0 && b > 0) return null;
    const disc = b * b - k;
    if (disc < 0) return null;
    return Math.max(0, -b - Math.sqrt(disc));
  };
  if (vol.shape === "sphere" && vol.radius > 0) return sphere(c, vol.radius);
  if (vol.shape === "capsule" && vol.radius > 0) {
    // Le segment de la capsule, le long de son axe local tourne.
    const ax = [0, 0, 0]; ax[vol.axis ?? 1] = 1;
    const a = qrot(q, ax);
    const demi = Math.max(0, (vol.height || 0) / 2 - vol.radius);
    // Echantillonnage du segment par spheres : exact aux extremites, et a
    // moins d'un centieme d'unite ailleurs pour les capsules du build.
    let best = null;
    const n = Math.max(1, Math.ceil(demi / (vol.radius * 0.1)));
    for (let i = 0; i <= 2 * n; i++) {
      const t = -demi + (demi * i) / n;
      const h = sphere([c[0] + a[0] * t, c[1] + a[1] * t, c[2] + a[2] * t], vol.radius);
      if (h != null && (best == null || h < best)) best = h;
    }
    return best;
  }
  if (vol.shape === "box" && vol.size) {
    // Boite orientee : le rayon ramene dans son repere, puis les dalles.
    const inv = [-q[0], -q[1], -q[2], q[3]];
    const lo = qrot(inv, sub(o, c)), ld = qrot(inv, d);
    let t0 = -Infinity, t1 = Infinity;
    for (let k = 0; k < 3; k++) {
      const h = vol.size[k] / 2;
      if (Math.abs(ld[k]) < 1e-12) { if (Math.abs(lo[k]) > h) return null; continue; }
      let a1 = (-h - lo[k]) / ld[k], a2 = (h - lo[k]) / ld[k];
      if (a1 > a2) [a1, a2] = [a2, a1];
      t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
      if (t0 > t1) return null;
    }
    if (t1 < 0) return null;
    return Math.max(0, t0);
  }
  return null;
}

export const OBSERVATORY_EVENTS = {
  triggerMap: "TriggerObservatoryMap",
};

// @lit ObservatoryMap
export class Interactables {
  /**
   * @param gameplay data/gameplay.json
   * @param toFrame  fonction position monde -> repere courant
   */
  constructor(gameplay) {
    const placed = (gameplay && gameplay.placed) || {};
    this.items = [];
    for (const x of placed.ObservatoryMap || []) {
      this.items.push({
        kind: "observatoryMap", name: x.name, world: x.position,
        range: 3, prompt: " View Solar System",
        body: x.body || null,
      });
    }
    // LA BORNE SE VISE. Son `InteractReceiver` (sphere de 0,42, portee 2) est
    // celui que le build interroge ; le portage lui ajoutait un objet « borne »
    // pris a 2,5 unites de proximite, et la touche l'actionnait sans qu'on la
    // regarde. Il ne reste qu'en repli, faute de recepteur (docs/132).
    const recepteurs = new Set((placed.InteractReceiver || []).map((x) => x.name));
    for (const x of placed.LaunchTerminal || []) {
      if (recepteurs.has(x.name)) continue;
      this.items.push({
        kind: "terminal", name: x.name, world: x.position,
        range: 2.5, prompt: null,
        body: x.body || null,
        volume: x.volume || null,
        rotation: x.rotation || null,
      });
    }
    const bornes = new Set((placed.LaunchTerminal || []).map((x) => x.name));
    for (const x of placed.InteractReceiver || []) {
      this.items.push({
        kind: "interact", name: x.name, world: x.position,
        terminal: bornes.has(x.name),
        range: (x.fields && x.fields._interactRange) || 2,
        prompt: (x.fields && x.fields._prompt) || null,
        body: x.body || null,
        // Le collider que vise le rayon (extraction recente seulement).
        volume: x.volume || null,
        rotation: x.rotation || null,
      });
    }
    for (const x of placed.ReadableObject || []) {
      // `_attentionPoint` : ce que le joueur se tourne pour regarder pendant
      // qu'il lit, et ce n'est PAS toujours le panneau. Le point d'attention de
      // la vitrine des billes est `Ball_Body`, la bille elle-meme, un metre
      // plus haut que le volume de lecture. Dix-neuf des trente-quatre en
      // declarent un ; les quinze autres se regardent eux-memes.
      const att = (x.targets && x.targets._attentionPoint) || null;
      this.items.push({
        kind: "readable", name: x.name, world: x.position,
        range: 3, prompt: null, text: x.text || null,
        attention: att ? { position: att.position, body: att.body } : null,
        body: x.body || null,
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
    //
    // La LECTURE de ces zones vit dans `gear.js`, avec le reste du lot. Elle y
    // etait deja, exportee et eprouvee, et ce module en tenait une SECONDE
    // copie ecrite a la main. Deux lectures du meme champ divergent tot ou
    // tard ; celle-ci n'avait pas d'appelant du tout (docs/69-assise.md).
    for (const z of interactZones({ placed })) {
      this.items.push({
        kind: "zone", name: z.name, world: z.position, body: z.body,
        range: (z.volume && z.volume.radius) || 2,
        prompt: z.prompt || null,
        resetOnLoseFocus: z.resetOnLoseFocus,
        viewingWindow: z.viewingWindow,
        rotation: z.rotation,
        // Le declencheur ou il faut ENTRER (`_isPlayerInsideVolume`).
        volume: z.volume || null,
      });
    }
  }

  /**
   * Cible visee : l'objet le plus proche dans sa portee, devant le joueur.
   * @param origin position du joueur dans le repere courant
   * @param frameOffset decalage monde -> repere (positions des objets)
   * @param fwd direction du regard
   */
  focus(origin, frameOffset, fwd, shiftOf = null, oeil = null, haut = null) {
    let best = null, bestD = Infinity;
    // LA VISEE D'ABORD. Un `InteractReceiver` dont on connait le collider se
    // vise comme dans le build : le premier touche par le rayon de l'oeil,
    // a dix unites au plus, et a sa propre portee du point touche.
    if (oeil) {
      const n = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
      const dir = [fwd.x / n, fwd.y / n, fwd.z / n];
      const o = [oeil.x, oeil.y, oeil.z];
      let vise = null, viseD = RAYON_VISEE;
      for (const it of this.items) {
        if (it.disabled || it.kind !== "interact" || !it.volume) continue;
        const shift = shiftOf ? shiftOf(it) : null;
        const w = shift ? [it.world[0] + shift[0], it.world[1] + shift[1],
                           it.world[2] + shift[2]] : it.world;
        const h = rayonVolume(o, dir, sub(w, frameOffset), it.rotation, it.volume);
        if (h != null && h <= viseD) { vise = it; viseD = h; }
      }
      if (vise && viseD <= vise.range) return vise;
    }
    for (const it of this.items) {
      if (it.disabled) continue;
      // Ce qui se vise ne se prend pas par proximite.
      if (oeil && it.kind === "interact" && it.volume) continue;
      // Les positions extraites sont celles de la scene AU REPOS ; `shiftOf`
      // rend le deplacement du corps porteur depuis. Sans lui, une zone posee
      // dans le vaisseau reste sur l'aire de lancement quand le vaisseau part.
      const shift = shiftOf ? shiftOf(it) : null;
      const w = shift ? [it.world[0] + shift[0], it.world[1] + shift[1],
                         it.world[2] + shift[2]] : it.world;
      const p = sub(w, frameOffset);
      const d = [p[0] - origin.x, p[1] - origin.y, p[2] - origin.z];
      const dist = Math.hypot(...d);
      // UNE ZONE NE SE VISE PAS, ON Y ENTRE. `InteractZone.UpdateFocus` :
      // pas de focus hors du volume (`_isPlayerInsideVolume`), puis l'angle
      // entre l'avant de la CAMERA et l'avant de la ZONE, compare a
      // `_viewingWindow` tel quel. Le portage prenait la zone a portee, devant
      // soi, et mesurait la direction zone -> joueur contre une demi-fenetre.
      if (it.kind === "zone") {
        const dedans = it.volume
          ? joueurDansVolume(p, it.rotation, it.volume, [origin.x, origin.y, origin.z], haut)
          : dist <= it.range;
        if (!dedans || dist > bestD) continue;
        if (it.viewingWindow != null && it.rotation) {
          const n = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
          if (!zoneFaced(it, [fwd.x / n, fwd.y / n, fwd.z / n],
                         qrot(it.rotation, [0, 0, 1]))) continue;
        }
        best = it; bestD = dist;
        continue;
      }
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
