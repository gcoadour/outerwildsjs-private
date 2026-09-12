// Pilote automatique et modele de degats du vaisseau.
//
// L'Autopilot du jeu procede en quatre phases, lisibles a ses drapeaux :
// alignement sur la destination, vol, approche, puis egalisation de vitesse
// avec le referentiel d'arrivee. On reprend cette decomposition.
//
// Degats (ShipDamageController) :
//   impact leger    au-dela de 15 u/s
//   impact moyen    au-dela de 30 u/s
//   integrite       100
//   mort instantanee a 300 u/s

export const DAMAGE = {
  light: 15, medium: 30, total: 100, instantDeath: 300,
};

export const PHASES = ["repos", "alignement", "vol", "approche", "egalisation"];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

import { autopilotDistances, ARRIVAL_FALLBACK } from "./frames.js";

export class Autopilot {
  /**
   * @param frames volumes de referentiel declares (`frames.js`). Ce sont eux
   *        qui portent les distances d'arrivee et d'alignement du build ; sans
   *        eux, on retombe sur la regle d'avant, `rayon de surface x 1,5`.
   */
  constructor(ship, frames = []) {
    this.ship = ship;
    this.frames = frames;
    this.arrival = 0;
    this.alignment = 0;
    this.declared = false;
    this.target = null;        // corps vise
    this.phase = "repos";
    // AutopilotGUI distingue l'arrivee de l'abandon, et l'arrivee courte de
    // l'arrivee juste : l'ecart de plus de 50 unites donne « undershot target »
    this.arrived = false;
    this.arrivalError = 0;
    this.arrivalError = null;
  }

  engage(body) {
    if (!body) return false;
    this.target = body;
    this.arrived = false;
    this.phase = "alignement";
    this.arrivalError = null;
    // Les deux distances viennent du `MajorReferenceFrameVolume` du corps vise
    // (docs/46, lot 1) : 1 000 partout, 2 500 pour Giant's Deep et Dark
    // Bramble, et un alignement de 0 a 1 000 — zero pour Dark Bramble, ou l'on
    // ne s'aligne sur rien.
    const surface = (body.gravity && body.gravity.upperSurfaceRadius) || 100;
    const d = autopilotDistances(this.frames, body.bodyName || body.name, surface);
    this.arrival = d.arrival;
    this.alignment = d.alignment;
    this.declared = d.declared;
    return true;
  }

  abort() { this.target = null; this.phase = "repos"; }

  get engaged() { return this.phase !== "repos"; }

  /**
   * Distance a laquelle on cesse d'accelerer pour freiner : le vaisseau doit
   * pouvoir annuler sa vitesse avec sa poussee avant d'arriver.
   */
  brakingDistance(speed) {
    const a = this.ship.thrust || 50;
    return (speed * speed) / (2 * a);
  }

  update(dt) {
    if (!this.target) return this.phase;
    const s = this.ship;
    const toward = sub(this.target.position, [s.pos.x, s.pos.y, s.pos.z]);
    const d = len(toward);
    const dir = norm(toward);
    const speed = s.speed;
    const surface = (this.target.gravity && this.target.gravity.upperSurfaceRadius) || 100;
    const arrival = this.arrival || surface * ARRIVAL_FALLBACK;

    if (d <= arrival) {
      // egalisation : on annule la vitesse relative au corps vise
      this.phase = "egalisation";
      const k = Math.min(1, (s.thrust * dt) / (speed || 1));
      s.vel.x -= s.vel.x * k; s.vel.y -= s.vel.y * k; s.vel.z -= s.vel.z * k;
      if (speed < 1) {
        this.arrivalError = Math.round(d - surface);
        this.arrived = true;
        this.abort();
      }
      return this.phase;
    }

    const braking = this.brakingDistance(speed);
    if (d < braking + arrival) this.phase = "approche";
    else if (this.phase === "alignement" && speed > 1) this.phase = "vol";
    else if (this.phase !== "vol") this.phase = "alignement";

    // en approche on pousse a rebours, sinon vers la cible
    const sign = this.phase === "approche" ? -1 : 1;
    const t = s.thrust * dt * sign;
    s.vel.x += dir[0] * t; s.vel.y += dir[1] * t; s.vel.z += dir[2] * t;
    return this.phase;
  }
}

/** Degats d'impact du vaisseau. Retourne les points perdus. */
export function impactDamage(speed) {
  if (speed >= DAMAGE.instantDeath) return DAMAGE.total;
  if (speed < DAMAGE.light) return 0;
  // progression lineaire entre le seuil leger et le seuil de mort instantanee
  const t = (speed - DAMAGE.light) / (DAMAGE.instantDeath - DAMAGE.light);
  const severity = speed >= DAMAGE.medium ? 1 : 0.4;
  return Math.min(DAMAGE.total, DAMAGE.total * t * severity * 3);
}
