// Trou noir de Brittle Hollow et trou blanc.
//
// Constantes relevees dans le build :
//   BlackHoleVolume   collider declencheur de rayon 40, au centre de la planete
//   WhiteHoleVolume   rayon 50, cone de sortie 60 degres, rayon de debris 750
//   MakeChildrenBreakable  integrite 100, fraction detachable 0,25, masse 100,
//                          coefficient de trainee 10
//   DetachableFragment     masse 100
//
// La croute de Brittle Hollow s'effondre au fil de la boucle : les fragments
// tombent dans le trou noir et ressortent au trou blanc, a l'autre bout du
// systeme. Le joueur subit le meme sort.

export const CAPTURE_RADIUS = 40;
export const EXIT_CONE_DEG = 60;
export const DETACHABLE_FRACTION = 0.25;
/** `_debrisRadius` du WhiteHoleVolume : l'etendue ou ressort ce qui est tombe. */
export const DEBRIS_RADIUS = 750;

const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export class BlackHole {
  /**
   * @param holeBody   corps portant le trou noir (Brittle Hollow)
   * @param whiteWorld position monde du trou blanc
   * @param whiteRadius rayon de sortie
   */
  constructor(holeBody, whiteWorld, whiteRadius = 50) {
    this.holeBody = holeBody;
    this.whiteWorld = whiteWorld;
    this.whiteRadius = whiteRadius;
    this.transits = 0;
    this.lastTransit = null;
    this.fragmentsDetached = 0;
  }

  /** Position du trou noir dans le repere courant : le centre de son corps. */
  get position() { return this.holeBody ? this.holeBody.position : null; }

  /** Position de sortie, dans le repere courant. */
  exitPosition(frameOffset) {
    return [this.whiteWorld[0] - frameOffset[0],
            this.whiteWorld[1] - frameOffset[1],
            this.whiteWorld[2] - frameOffset[2]];
  }

  /**
   * Teste la capture et, le cas echeant, ejecte au trou blanc dans un cone de
   * 60 degres autour de la verticale locale de sortie.
   * @returns {position, velocity} si transit, sinon null
   */
  capture(pos, frameOffset) {
    const c = this.position;
    if (!c) return null;
    const d = [pos.x - c[0], pos.y - c[1], pos.z - c[2]];
    if (len(d) > CAPTURE_RADIUS) return null;

    const exit = this.exitPosition(frameOffset);
    // direction de sortie tiree dans le cone
    const half = (EXIT_CONE_DEG / 2) * Math.PI / 180;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * half;
    const up = [0, 1, 0];
    const dir = norm([
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi) * up[1],
      Math.sin(phi) * Math.sin(theta),
    ]);
    const r = this.whiteRadius * 1.2;
    this.transits += 1;
    this.lastTransit = { from: [...d], at: Date.now() };
    return {
      position: [exit[0] + dir[0] * r, exit[1] + dir[1] * r, exit[2] + dir[2] * r],
      velocity: [dir[0] * 30, dir[1] * 30, dir[2] * 30],
    };
  }

  /**
   * Effondrement progressif de la croute, indexe sur la fraction de boucle
   * comme le fait le jeu pour Dark Bramble.
   * @param total nombre de fragments candidats
   */
  crustProgress(loopFraction, total) {
    const detachable = Math.floor(total * DETACHABLE_FRACTION);
    this.fragmentsDetached = Math.floor(detachable * Math.min(1, loopFraction));
    return this.fragmentsDetached;
  }
}

/**
 * Champ de debris du trou blanc.
 *
 * Le WhiteHoleVolume porte deux choses que le portage laissait de cote : un
 * `_debrisRadius` de 750, et une file d'attente de croissance (`_growQueue`)
 * par laquelle ce qui est tombe dans le trou noir REVIENT — pas d'un coup,
 * mais un morceau apres l'autre.
 *
 * Ce qui vient du build : le rayon de 750, et le fait que la sortie soit mise
 * en file plutot qu'immediate. Ce qui n'en vient pas : la cadence, que le nom
 * `_growQueue` ne chiffre pas. Deux secondes par morceau donnent une croute qui
 * met une boucle a ressortir, ce qui est l'echelle de temps du jeu.
 *
 * Le placement est tire d'une graine, donc reproductible : la meme croute
 * ressort au meme endroit d'une session a l'autre, sans quoi rien ne serait
 * verifiable.
 */
export class DebrisField {
  constructor(radius = DEBRIS_RADIUS, everySeconds = 2) {
    this.radius = radius;
    this.every = everySeconds;
    this.queue = [];
    this.items = [];
    this.t = 0;
  }

  /** Un morceau tombe dans le trou noir : il prend la file. */
  swallow(seed) { this.queue.push(String(seed)); return this.queue.length; }

  /** Position stable dans la sphere de debris, tiree du nom du morceau. */
  place(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const a = ((h >>> 0) % 10000) / 10000 * Math.PI * 2;
    const b = ((h >>> 8) % 10000) / 10000 * Math.PI - Math.PI / 2;
    // racine cubique : sans elle, tout s'agglutine sur la coquille exterieure
    const r = this.radius * Math.cbrt(((h >>> 16) % 10000) / 10000);
    return [r * Math.cos(b) * Math.cos(a), r * Math.sin(b), r * Math.cos(b) * Math.sin(a)];
  }

  /** @returns les morceaux ressortis a cette image */
  update(dt) {
    const out = [];
    if (!this.queue.length) { this.t = 0; return out; }
    this.t += dt;
    while (this.t >= this.every && this.queue.length) {
      this.t -= this.every;
      const seed = this.queue.shift();
      const item = { seed, position: this.place(seed) };
      this.items.push(item);
      out.push(item);
    }
    return out;
  }

  get pending() { return this.queue.length; }
  get grown() { return this.items.length; }
}
