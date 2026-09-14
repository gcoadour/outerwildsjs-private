// Carte du systeme solaire.
//
// Constantes de MapController : distance de zoom par defaut 40 000, minimum
// 10 000. Types de marqueurs de MapMarker : Default, Planet, Moon, Sun, Player,
// Probe, Ship.
//
// Vue de dessus en projection orthographique sur le plan XZ, ce qui suffit ici :
// toutes les orbites du systeme sont pratiquement coplanaires.

// @lit MapMarker, MapController
// Les marqueurs declares et le zoom de la carte.

export const ZOOM_DEFAULT = 40000;
export const ZOOM_MIN = 10000;
// MapMarker et IconGenerator.GenerateSquareBracket
export const MARKER_ICON = 20;
export const MARKER_LINE = 1;
export const BRACKET_RATIO = 0.25;
export const MARKER_FONT = 14;
export const MARKER_MIN_SCREEN = 10;
// MapMarker n'emploie que deux couleurs : le blanc par defaut, et le VERT pour
// ce qui appartient au joueur — lui-meme, son vaisseau, sa sonde. La palette
// coloree que j'avais inventee etait plus lisible mais n'etait pas la sienne.
const COLORS = {
  Sun: "#ffffff", Planet: "#ffffff", Moon: "#ffffff", Default: "#ffffff",
  Player: "#00ff00", Ship: "#00ff00", Probe: "#00ff00",
};

// `MarkerType`, lu dans la table Constant de l'assembly.
export const MARKER_TYPES = ["Default", "Planet", "Moon", "Sun", "Player", "Probe", "Ship"];

// _maxDisplayDistance par type de marqueur, lu dans la TABLE DE SAUT de
// `MapMarker.Awake` — et non dans l'ordre des blocs, qui dit autre chose
// (docs/46). Le soleil est toujours visible, une lune seulement a 5 000.
//
// Le cas du joueur n'est pas une distance mais une sortie anticipee : son
// `LateUpdate` rend avant tous les tests des que le marqueur est devant la
// camera. `Infinity` est la facon d'ecrire cela ici.
export const MARKER_MAX_DISTANCE = {
  Default: 5000, Planet: 50000, Moon: 5000, Sun: 1e10,
  Player: Infinity, Probe: 50000, Ship: 50000,
};

/**
 * Les marqueurs que le build POSE, avec leurs vrais noms de jeu.
 *
 * Le portage deduisait le type de la gravite du corps et affichait le nom
 * interne : `Comet_Body` la ou le jeu ecrit « The Nomad », `VolcanicMoon_Body`
 * pour « Devil's Furnace », `Moon_Body` pour « Lunar Lookout ». Les treize
 * marqueurs sont declares, et l'un d'eux — « Giant's Landing » — n'est meme pas
 * un corps : c'est une ILE, que la deduction par gravite ne pouvait pas trouver.
 */
export function mapMarkers(gameplay) {
  return ((gameplay.placed || {}).MapMarker || []).map((c) => {
    const f = c.fields || {};
    const type = MARKER_TYPES[f._markerType ?? 0] || "Default";
    return {
      name: c.name,
      body: c.body || null,
      label: f._label || c.name,
      type,
      maxDistance: MARKER_MAX_DISTANCE[type] ?? 5000,
      // `Awake` ne pose que DEUX couleurs : le blanc du constructeur, et le
      // vert pour ce qui appartient au joueur — lui, sa sonde, son vaisseau.
      color: COLORS[type] || COLORS.Default,
    };
  });
}

/**
 * `MapMarker.LateUpdate`, dans l'ordre ou il decide.
 *
 * Les trois regles que le portage n'avait pas, et qui se voient toutes :
 *
 *   - un marqueur a moins de DIX pixels du joueur est masque — sans quoi, au
 *     zoom maximal, tout s'empile sur le point vise ;
 *   - un marqueur a moins de dix pixels du VAISSEAU l'est aussi. Le portage ne
 *     testait que le joueur, et le nom de la planete se posait sur le vaisseau ;
 *   - le marqueur du joueur, lui, sort avant tous les tests : il ne se masque
 *     jamais derriere quoi que ce soit.
 *
 * @param screen        [x, y, distance] du marqueur
 * @param playerScreen  [x, y] du joueur, ou null
 * @param shipScreen    [x, y] du vaisseau, ou null
 * @param derelict      le joueur est dans la zone brouillee
 */
export function markerVisible(marker, screen, playerScreen, shipScreen, derelict = false) {
  if (derelict) return false;
  const [x, y, z] = screen;
  if (marker.type === "Player") return z > 0;
  const loinDuJoueur = playerScreen
    ? Math.hypot(x - playerScreen[0], y - playerScreen[1]) : Infinity;
  if (marker.type === "Ship") {
    if (z > 0 && z < marker.maxDistance && loinDuJoueur > MARKER_MIN_SCREEN) return true;
  }
  if (shipScreen
      && Math.hypot(x - shipScreen[0], y - shipScreen[1]) < MARKER_MIN_SCREEN) return false;
  if (z < 0 || z > marker.maxDistance) return false;
  return loinDuJoueur >= MARKER_MIN_SCREEN;
}

function markerType(body) {
  const g = body.gravity || {};
  if ((g.surfaceAcceleration || 0) >= 50) return "Sun";
  if ((g.upperSurfaceRadius || 0) >= 200) return "Planet";
  return "Moon";
}

export class SolarMap {
  constructor(canvas, bodies, playerData = null, sectorOf = {}, markers = []) {
    this.canvas = canvas;
    this.bodies = bodies;
    this.playerData = playerData;
    this.sectorOf = sectorOf;
    // Les marqueurs declares, indexes par corps porteur. Ce que le build dit
    // l'emporte sur ce que la gravite laisse deviner ; la deduction reste le
    // repli, pour un corps qu'aucun marqueur ne nomme.
    this.markers = new Map();
    for (const m of markers) if (m.body) this.markers.set(m.body, m);
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
  draw(playerPos, shipPos, derelict = false) {
    this.player = playerPos || null;
    this.derelict = !!derelict;
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
    // Le joueur et le vaisseau a l'ecran : `markerVisible` compare des PIXELS,
    // pas des unites — c'est ce qui fait qu'un marqueur se masque au zoom et
    // reapparait quand on s'ecarte.
    const ecranJoueur = playerPos ? px([playerPos.x, playerPos.y, playerPos.z]) : null;
    const ecranVaisseau = shipPos ? px([shipPos.x, shipPos.y, shipPos.z]) : null;
    for (const b of this.bodies) {
      const declare = this.markers.get(b.name) || this.markers.get(b.bodyName);
      const t = declare ? declare.type : markerType(b);
      const [x, y] = px(b.position);
      const r = Math.max(3, ((b.gravity || {}).upperSurfaceRadius || 100) * scale);
      // un corps jamais approche reste en creux : la carte se remplit a mesure
      const sec = this.sectorOf[b.name];
      const known = !this.playerData || !sec || this.playerData.hasExplored(sec);
      // `MapMarker.LateUpdate`, et non une regle du portage : la LOI vit dans
      // `markerVisible`, juste au-dessus, et elle etait ecrite, eprouvee — et
      // appelee par personne. Ce code en tenait une moitie a la main : la
      // distance maximale, et le dixieme de pixel autour du joueur. Il lui
      // manquait le VAISSEAU, le marqueur du joueur qui ne se masque jamais,
      // et la zone brouillee qui efface tout (docs/74-etalons.md).
      const dd = this.player
        ? Math.hypot(b.position[0] - this.player.x, b.position[1] - this.player.y,
                     b.position[2] - this.player.z)
        : 0;
      const dec = { type: t, maxDistance: MARKER_MAX_DISTANCE[t] ?? 5000 };
      if (!markerVisible(dec, [x, y, dd], ecranJoueur, ecranVaisseau,
                         this.derelict)) continue;
      const color = COLORS[t] || COLORS.Default;
      ctx.globalAlpha = known ? 1 : 0.28;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // MapMarker : le crochet encadre le corps. Le test du dixieme de pixel a
      // deja eu lieu — c'est `markerVisible` qui le porte maintenant, et il le
      // fait autour du JOUEUR, pas du centre de l'ecran : la carte se deplace,
      // et le joueur n'est pas toujours au milieu.
      this.bracket(ctx, x, y, color, Math.max(MARKER_ICON, r * 2 + 6));
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
      // Le nom du JEU quand le build en donne un : « The Nomad » plutot que
      // `Comet_Body`, « Devil's Furnace » plutot que `VolcanicMoon_Body`.
      const label = " " + (known
        ? (declare ? declare.label
                   : (b.bodyName || b.name || "").replace(/^GravityWell_/, ""))
        : "inconnu");
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
