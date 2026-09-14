// Minicarte du secteur.
//
// `Minimap` n'est pas une carte 2D mais un GLOBE : les marqueurs sont poses sur
// une sphere, dans le repere du secteur majeur actif —
//
//   position locale = InverseTransformPoint(monde).normalized x 0,51
//
// — et une camera dediee se place a distance fixe dans la direction du marqueur
// du joueur, en le regardant. Elle montre donc toujours l'hemisphere ou l'on se
// trouve, joueur au centre.
//
// Le portage en fait une projection orthographique 2D de ce meme hemisphere :
// c'est la meme image, sans seconde camera ni cible de rendu.
//
// Les traces sont cent particules par piste, une nouvelle posee des que la
// direction du joueur a bouge de plus de 5 degres, en anneau — d'ou une trace
// de longueur constante quelle que soit la vitesse.
//
// CE QUI L'ALLUME. Le portage interrogeait la distance au corps dominant
// (« moins de deux rayons de surface ») : une invention. Le build ne connait
// que des DECLENCHEURS. `SectorDetector` tient la liste des secteurs majeurs
// dont on touche la sphere, en retient le plus proche par le centre, et
// `Minimap.AttemptActivation` n'allume que si ce secteur-la existe, qu'on est
// hors du vaisseau, et qu'il declare `GetUseMinimap()`.
//
// Trois des dix secteurs majeurs ne sont pas des `PlanetoidSector` : Dark
// Bramble, l'epave et la lune quantique. La minicarte s'y eteint — les trois
// endroits, exactement, ou l'on ne sait plus ou l'on est. La liste et la regle
// de classe sont dans `sectors.js` (`majorSectors`), leur mesure dans
// docs/82-secteur-majeur.md.

export const MARKER_RADIUS = 0.51;
export const TRAIL_COUNT = 100;
export const TRAIL_ANGLE = 5;      // degres entre deux points de trace

// Ce que `Minimap` et `MinimapHUD` se disent par GlobalMessenger. Les nommer
// ici, c'est ce que compte `scripts/evenements.mjs`.
export const MINIMAP_EVENTS = {
  on: "MinimapEnabled",
  off: "MinimapDisabled",
  acquire: "AquireMinimap",   // orthographe du build, faute comprise
};

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angleDeg = (a, b) =>
  Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180 / Math.PI;

/**
 * `Minimap.GetLocalMapPosition` : la direction, ramenee au globe.
 *
 * Le facteur 0,51 n'est pas decoratif — c'est la ou les marqueurs vivent, et
 * c'est entre DEUX positions ainsi normalisees que le build mesure les
 * 5 degres de la trace.
 */
export function localMapPosition(center, point) {
  const d = norm([point[0] - center[0], point[1] - center[1], point[2] - center[2]]);
  return [d[0] * MARKER_RADIUS, d[1] * MARKER_RADIUS, d[2] * MARKER_RADIUS];
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    // `Behaviour.enabled` du composant : ce que `MinimapEnabled` annonce.
    this.on = false;
    // `MinimapHUD` : l'element d'ecran, qui n'est pas le composant.
    this.shown = false;
    this.insideShip = false;
    this.sector = null;
    // Ce que GlobalMessenger aurait porte, dans l'ordre. Un test le lit.
    this.events = [];
    this.trail = [];        // positions du joueur sur le globe, en anneau
    this.trailIndex = -1;
    this.last = null;
    this.probeTrail = [];
    this.probeIndex = -1;
    this.lastProbe = null;
  }

  /**
   * `Minimap.TurnOn` : garde de bord montant, et l'evenement part avec.
   * @returns {boolean} vrai si l'etat a change
   */
  turnOn() {
    if (this.on) return false;
    this.on = true;
    this.reset();
    this.events.push(MINIMAP_EVENTS.on);
    return true;
  }

  /** `Minimap.TurnOff`. */
  turnOff() {
    if (!this.on) return false;
    this.on = false;
    this.events.push(MINIMAP_EVENTS.off);
    return true;
  }

  /**
   * `Minimap.AttemptActivation` : elle ALLUME, et ne peut pas eteindre.
   *
   * D'ou une bizarrerie qu'un `setEnabled(condition)` par image effacerait :
   * passer d'un secteur qui porte la minicarte a un secteur qui ne la porte
   * pas la laisse ALLUMEE. Seuls le vaisseau et le vide l'eteignent.
   */
  attemptActivation() {
    if (this.insideShip) return false;
    if (!this.sector) return false;
    if (!this.sector.useMinimap) return false;
    return this.turnOn();
  }

  /** `Minimap.OnEnterShip` / `OnExitShip`, sur les evenements du build. */
  enterShip() { this.insideShip = true; this.turnOff(); }
  exitShip() { this.insideShip = false; this.attemptActivation(); }

  /** `Minimap.OnPlayerSwitchMajorSector` : la trace repart de zero a chaque fois. */
  switchMajorSector(sector) {
    this.sector = sector || null;
    this.reset();
    if (sector) this.attemptActivation();
    else this.turnOff();
  }

  /**
   * `MinimapHUD.AllowVisibility` : le casque, le paquetage, et l'etat.
   *
   * Trois conditions, trois sources differentes — et c'est bien pour ca que le
   * build les tient dans deux composants : `Minimap` decide si la carte
   * EXISTE, `MinimapHUD` si on la VOIT.
   */
  allowVisibility({ helmetHUD = true, hasMinimap = false } = {}) {
    return !!(helmetHUD && hasMinimap && this.on);
  }

  /** Applique la visibilite de l'element d'ecran. */
  showHUD(v) {
    v = !!v;
    if (v === this.shown) return;
    this.shown = v;
    if (this.canvas) this.canvas.hidden = !v;
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
   * @param center   centre du secteur actif, dans le repere de repos
   * @param player   position du joueur, dans le MEME repere
   * @param others   { ship, probe, shipSector, probeSector }
   *
   * `Minimap.Update` ne pose le marqueur du vaisseau ou de la sonde que si son
   * secteur majeur actif est CELUI DU JOUEUR ; sinon il le remet a
   * `Vector3.zero`, c'est-a-dire au centre du globe, derriere le marqueur du
   * joueur. On rend null : a l'ecran, c'est la meme absence — mais la
   * condition, elle, est celle du build, et le portage n'en avait aucune.
   */
  update(center, player, others = {}) {
    if (!this.on) return;
    const pd = localMapPosition(center, player);
    this.sample(this.trail, "trailIndex", "last", pd);
    const memeSecteur = (s) => s === this.sector;
    const probeDir = (others.probe && memeSecteur(others.probeSector))
      ? localMapPosition(center, others.probe) : null;
    // La trace de la sonde est relevee HORS du test `IsInsideShip` dans le
    // build : c'est la trace du JOUEUR qui s'interrompt en cabine, pas la
    // sienne. Ici la minicarte est deja eteinte dans le vaisseau, donc les
    // deux se taisent — mais l'asymetrie est dans le code lu.
    if (probeDir) this.sample(this.probeTrail, "probeIndex", "lastProbe", probeDir);
    const shipDir = (others.ship && memeSecteur(others.shipSector))
      ? localMapPosition(center, others.ship) : null;
    this.draw(pd, shipDir, probeDir);
  }

  /**
   * Projection orthographique de l'hemisphere centre sur le joueur : la camera
   * du jeu regarde le marqueur du joueur depuis l'exterieur, ce qui revient a
   * projeter sur le plan perpendiculaire a sa direction.
   */
  draw(pd, shipDir, probeDir) {
    const cv = this.canvas;
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d");
    const w = cv.width, h = cv.height;
    const R = Math.min(w, h) * 0.44;
    ctx.clearRect(0, 0, w, h);
    if (!pd) return;
    pd = norm(pd);

    // repere de l'ecran : pd vers l'observateur, deux axes perpendiculaires
    const up = Math.abs(pd[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const right = norm([up[1] * pd[2] - up[2] * pd[1],
                        up[2] * pd[0] - up[0] * pd[2],
                        up[0] * pd[1] - up[1] * pd[0]]);
    const top = [pd[1] * right[2] - pd[2] * right[1],
                 pd[2] * right[0] - pd[0] * right[2],
                 pd[0] * right[1] - pd[1] * right[0]];
    const project = (d0) => {
      const d = norm(d0);
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
