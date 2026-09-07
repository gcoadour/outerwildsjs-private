// Carte du systeme solaire.
//
// Constantes de MapController : distance de zoom par defaut 40 000, minimum
// 10 000. Types de marqueurs de MapMarker : Default, Planet, Moon, Sun, Player,
// Probe, Ship.
//
// Vue de dessus en projection orthographique sur le plan XZ, ce qui suffit ici :
// toutes les orbites du systeme sont pratiquement coplanaires.

export const ZOOM_DEFAULT = 40000;
export const ZOOM_MIN = 10000;
// MapMarker et IconGenerator.GenerateSquareBracket
export const MARKER_ICON = 20;
export const MARKER_LINE = 1;
export const BRACKET_RATIO = 0.25;
export const MARKER_FONT = 14;
export const MARKER_MIN_SCREEN = 10;
// _maxDisplayDistance par type de marqueur : le soleil est toujours visible,
// une lune ne s'affiche qu'a 5 000 unites
export const MARKER_MAX_DISTANCE = {
  Default: 5000, Planet: 50000, Moon: 5000, Sun: 1e10,
  Player: Infinity, Probe: 50000, Ship: 50000,
};

// MapMarker n'emploie que deux couleurs : le blanc par defaut, et le VERT pour
// ce qui appartient au joueur — lui-meme, son vaisseau, sa sonde. La palette
// coloree que j'avais inventee etait plus lisible mais n'etait pas la sienne.
const COLORS = {
  Sun: "#ffffff", Planet: "#ffffff", Moon: "#ffffff", Default: "#ffffff",
  Player: "#00ff00", Ship: "#00ff00", Probe: "#00ff00",
};

function markerType(body) {
  const g = body.gravity || {};
  if ((g.surfaceAcceleration || 0) >= 50) return "Sun";
  if ((g.upperSurfaceRadius || 0) >= 200) return "Planet";
  return "Moon";
}

export class SolarMap {
  constructor(canvas, bodies, playerData = null, sectorOf = {}) {
    this.canvas = canvas;
    this.bodies = bodies;
    this.playerData = playerData;
    this.sectorOf = sectorOf;
    this.zoom = ZOOM_DEFAULT;
    // MapController : le « pan » n'est pas une rotation mais un DECALAGE du
    // point vise, en x et z, a la vitesse de la distance de zoom par seconde.
    // La camera regarde toujours droit vers le bas — il n'y a pas de rotation
    // libre dans cette alpha.
    this.focal = [0, 0];
    this.open = false;
    this.selected = null;
    this.hits = [];      // zones cliquables, recalculees a chaque rendu
  }

  toggle() { this.open = !this.open; this.canvas.hidden = !this.open; }

  /** Zoom borne, comme dans le jeu. */
  setZoom(z) { this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_DEFAULT * 3, z)); }

  /**
   * Icone d'un `MapMarker`.
   *
   * Ce n'est pas une texture mais un DESSIN :
   * `IconGenerator.GenerateSquareBracket(20, 20, blanc)` produit quatre coins
   * en crochet, d'un pixel de trait, chacun couvrant un quart du cote. Le
   * redessiner ici coute moins qu'exporter seize variantes de couleur.
   */
  bracket(ctx, x, y, color, size = MARKER_ICON, ratio = BRACKET_RATIO) {
    const half = size / 2;
    const arm = size * ratio;
    ctx.strokeStyle = color;
    ctx.lineWidth = MARKER_LINE;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px0 = x + sx * half, py0 = y + sy * half;
      ctx.moveTo(px0, py0); ctx.lineTo(px0 - sx * arm, py0);
      ctx.moveTo(px0, py0); ctx.lineTo(px0, py0 - sy * arm);
    }
    ctx.stroke();
  }

  /**
   * Deplace le point vise. Le jeu applique `axe x distance x dt` : le
   * deplacement est donc proportionnel au zoom, ce qui garde une vitesse
   * constante A L'ECRAN quel que soit le niveau de zoom.
   */
  pan(ax, az, dt) {
    this.focal[0] += Math.max(-1, Math.min(1, ax)) * this.zoom * dt;
    this.focal[1] += Math.max(-1, Math.min(1, az)) * this.zoom * dt;
  }

  recenter() { this.focal[0] = 0; this.focal[1] = 0; }

  /** Corps sous le curseur, en coordonnees canvas. */
  pick(x, y) {
    for (const h of this.hits) {
      if (Math.hypot(x - h.x, y - h.y) < Math.max(h.r, 10)) return h.body;
    }
    return null;
  }

  /**
   * @param playerPos position du joueur dans le repere courant
   * @param shipPos   position du vaisseau, ou null
   */
  draw(playerPos, shipPos) {
    this.player = playerPos || null;
    if (!this.open) return;
    const c = this.canvas, ctx = c.getContext("2d");
    const w = c.width = c.clientWidth, h = c.height = c.clientHeight;
    const scale = Math.min(w, h) / (this.zoom * 2);
    const cx = w / 2, cy = h / 2;
    // le decalage du point vise recentre toute la projection
    const px = (p) => [cx + (p[0] - this.focal[0]) * scale,
                       cy + (p[2] - this.focal[1]) * scale];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(6,9,16,.92)";
    ctx.fillRect(0, 0, w, h);

    // orbites : un cercle par corps, centre sur l'origine du repere
    ctx.strokeStyle = "rgba(120,140,170,.22)";
    for (const b of this.bodies) {
      const r = Math.hypot(b.position[0], b.position[2]) * scale;
      if (r < 4 || r > Math.max(w, h)) continue;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }

    this.hits = [];
    const placedLabels = [];
    for (const b of this.bodies) {
      const t = markerType(b);
      const [x, y] = px(b.position);
      const r = Math.max(3, ((b.gravity || {}).upperSurfaceRadius || 100) * scale);
      // un corps jamais approche reste en creux : la carte se remplit a mesure
      const sec = this.sectorOf[b.name];
      const known = !this.playerData || !sec || this.playerData.hasExplored(sec);
      // _maxDisplayDistance : une lune ne s'affiche qu'a 5 000 unites, une
      // planete a 50 000, le soleil toujours
      if (this.player) {
        const dd = Math.hypot(b.position[0] - this.player.x,
                              b.position[1] - this.player.y,
                              b.position[2] - this.player.z);
        if (dd > (MARKER_MAX_DISTANCE[t] ?? 5000)) continue;
      }
      const color = COLORS[t] || COLORS.Default;
      ctx.globalAlpha = known ? 1 : 0.28;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // MapMarker : le crochet encadre le corps. Il disparait a moins de dix
      // pixels du centre de l'ecran — c'est ce qui evite d'empiler tous les
      // marqueurs sur le point vise.
      if (Math.hypot(x - cx, y - cy) >= MARKER_MIN_SCREEN) {
        this.bracket(ctx, x, y, color, Math.max(MARKER_ICON, r * 2 + 6));
      }
      if (this.selected === b) {
        ctx.strokeStyle = "#ffd9a0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = color;
      // MapMarker._markerStyle : corps 14, libelle precede d'une espace
      ctx.font = `${MARKER_FONT}px "OW Dialogue", ui-monospace, monospace`;
      // Chevauchement des libelles : au zoom maximal, les corps interieurs se
      // resserrent au centre et leurs noms se superposaient. On empile ceux qui
      // se genent, du plus proche au plus loin, plutot que de les masquer — un
      // nom absent vaut moins qu'un nom decale.
      const label = " " + (known
        ? (b.bodyName || b.name || "").replace(/^GravityWell_/, "") : "inconnu");
      const lx = x + Math.max(MARKER_ICON, r * 2 + 6) / 2;
      let ly = y + 4;
      const lw = ctx.measureText(label).width;
      let guard = 0;
      while (guard++ < 12 && placedLabels.some(
          (p) => Math.abs(p.y - ly) < MARKER_FONT && lx < p.x + p.w && p.x < lx + lw)) {
        ly += MARKER_FONT + 2;
      }
      placedLabels.push({ x: lx, y: ly, w: lw });
      ctx.fillText(label, lx, ly);
      ctx.globalAlpha = 1;
      this.hits.push({ body: b, x, y, r });
    }

    // joueur et vaisseau
    const mark = (p, color, label) => {
      if (!p) return;
      const [x, y] = px([p.x, p.y, p.z]);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(label, x + 7, y + 3);
    };
    mark(playerPos, COLORS.Player, "vous");
    mark(shipPos, COLORS.Ship, "vaisseau");

    ctx.fillStyle = "rgba(160,175,195,.8)";
    ctx.fillText(`portee ${Math.round(this.zoom)} u — molette : zoom, ` +
                 `glisser : deplacer, clic : cible, C : recentrer`, 12, 20);
  }
}
