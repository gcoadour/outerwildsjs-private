// Minicarte du secteur.
//
// `Minimap` n'est pas une carte 2D mais un GLOBE : les marqueurs sont posés sur
// une sphère, dans le repère du secteur majeur actif —
//
//   position locale = InverseTransformPoint(monde).normalized × 0,51
//
// — et une caméra dédiée se place a distance fixe dans la direction du marqueur
// du joueur, en le regardant. Elle montre donc toujours l'hémisphère où l'on se
// trouve, joueur au centre.
//
// Le portage en fait une projection orthographique 2D de ce meme hemisphere :
// c'est la meme image, sans seconde camera ni cible de rendu.
//
// Les traces sont cent particules par piste, une nouvelle posee des que la
// direction du joueur a bouge de plus de 5 degres, en anneau — d'ou une trace
// de longueur constante quelle que soit la vitesse.
//
// La minicarte ne s'allume que hors du vaisseau, et seulement dans un secteur
// majeur qui la declare (`GetUseMinimap`).

export const MARKER_RADIUS = 0.51;
export const TRAIL_COUNT = 100;
export const TRAIL_ANGLE = 5;      // degres entre deux points de trace

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angleDeg = (a, b) =>
  Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180 / Math.PI;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.on = false;
    this.trail = [];        // directions du joueur, en anneau
    this.trailIndex = -1;
    this.last = null;
    this.probeTrail = [];
    this.probeIndex = -1;
    this.lastProbe = null;
  }

  setEnabled(on) {
    if (on === this.on) return;
    this.on = on;
    this.canvas.hidden = !on;
    if (!on) this.reset();
  }

  reset() {
    this.trail = []; this.trailIndex = -1; this.last = null;
    this.probeTrail = []; this.probeIndex = -1; this.lastProbe = null;
  }

  /** Ajoute un point de trace si la direction a bouge d'au moins 5 degres. */
  sample(ring, indexKey, lastKey, dir) {
    if (!dir) return;
    if (this[lastKey] && angleDeg(this[lastKey], dir) <= TRAIL_ANGLE) return;
    this[lastKey] = dir;
    this[indexKey] = (this[indexKey] + 1) % TRAIL_COUNT;
    ring[this[indexKey]] = dir;
  }

  /**
   * @param center   centre du corps, dans le repere courant
   * @param player   position du joueur
   * @param others   { ship, probe } positions, ou null
   */
  update(center, player, others = {}) {
    if (!this.on) return;
    const dir = (p) => (p ? norm([p[0] - center[0], p[1] - center[1], p[2] - center[2]]) : null);
    const pd = dir([player.x, player.y, player.z]);
    this.sample(this.trail, "trailIndex", "last", pd);
    const probeDir = dir(others.probe);
    if (probeDir) this.sample(this.probeTrail, "probeIndex", "lastProbe", probeDir);
    this.draw(pd, dir(others.ship), probeDir);
  }

  /**
   * Projection orthographique de l'hemisphere centre sur le joueur : la camera
   * du jeu regarde le marqueur du joueur depuis l'exterieur, ce qui revient a
   * projeter sur le plan perpendiculaire a sa direction.
   */
  draw(pd, shipDir, probeDir) {
    const cv = this.canvas;
    const ctx = cv.getContext("2d");
    const w = cv.width, h = cv.height;
    const R = Math.min(w, h) * 0.44;
    ctx.clearRect(0, 0, w, h);
    if (!pd) return;

    // repere de l'ecran : pd vers l'observateur, deux axes perpendiculaires
    const up = Math.abs(pd[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const right = norm([up[1] * pd[2] - up[2] * pd[1],
                        up[2] * pd[0] - up[0] * pd[2],
                        up[0] * pd[1] - up[1] * pd[0]]);
    const top = [pd[1] * right[2] - pd[2] * right[1],
                 pd[2] * right[0] - pd[0] * right[2],
                 pd[0] * right[1] - pd[1] * right[0]];
    const project = (d) => {
      const z = dot(d, pd);
      if (z <= 0) return null;                 // face cachee du globe
      return [w / 2 + dot(d, right) * R, h / 2 - dot(d, top) * R, z];
    };

    ctx.fillStyle = "rgba(10, 16, 26, .78)";
    ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(230, 216, 184, .45)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2); ctx.stroke();

    const trail = (ring, color) => {
      ctx.fillStyle = color;
      for (const d of ring) {
        const p = d && project(d);
        if (!p) continue;
        ctx.globalAlpha = 0.25 + 0.45 * p[2];
        ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    };
    trail(this.trail, "#9fd6c4");
    trail(this.probeTrail, "#7fa8ff");

    const marker = (d, color, r) => {
      const p = d && project(d);
      if (!p) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
    };
    marker(shipDir, "#ffd9a0", 3.5);
    marker(probeDir, "#7fa8ff", 2.5);
    // le joueur est au centre par construction : la camera le regarde
    marker(pd, "#ffffff", 3);
  }
}
