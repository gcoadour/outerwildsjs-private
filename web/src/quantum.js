// Lune quantique.
//
// Constantes relevees dans le build :
//   _maxQuantumLockRange = 2000   au-dela, l'observation ne verrouille plus
//   _minQuantumLockRange = 150    en deca, elle est verrouillee quoi qu'il arrive
//   _sphereCheckRadius   = 150    rayon du test de visibilite
//   _isLightSensitive    = false  dans cette alpha, la lumiere n'intervient pas
//
// Quatre QuantumOrbit sont posees sur quatre corps hotes, chacune avec son
// rayon : Brittle Hollow 1400, Twin01 1700, Timber Hearth 1100, Giant's Deep
// 1500. La lune se trouve autour de l'un d'eux, et change d'hote des qu'on
// cesse de la regarder.

export const LOCK_MAX = 2000;
export const LOCK_MIN = 150;

/** Hotes possibles, lus depuis data/gameplay.json. */
export function quantumHosts(gameplay) {
  return ((gameplay.placed && gameplay.placed.QuantumOrbit) || [])
    .map((o) => ({ host: o.name, radius: (o.fields || {})._orbitRadius || 1000 }))
    .filter((o) => o.radius > 0);
}

export class QuantumMoon {
  /**
   * @param hosts  [{host, radius}]
   * @param bodies corps du systeme, pour retrouver un hote par son bodyName
   */
  constructor(hosts, bodies) {
    this.hosts = hosts;
    this.bodies = bodies;
    this.index = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.collapses = 0;
    this.observed = false;
    this.position = [0, 0, 0];
    this.relocate(0);
  }

  hostBody(i) {
    const h = this.hosts[i];
    return h ? this.bodies.find((b) => b.bodyName === h.host) : null;
  }

  /** Choisit un nouvel hote et une nouvelle position sur son orbite. */
  relocate(forceIndex = null) {
    if (!this.hosts.length) return;
    if (forceIndex === null) {
      let n = this.index;
      // un effondrement doit changer quelque chose de visible
      if (this.hosts.length > 1) {
        while (n === this.index) n = Math.floor(Math.random() * this.hosts.length);
      }
      this.index = n;
      this.collapses += 1;
    } else {
      this.index = forceIndex;
    }
    this.angle = Math.random() * Math.PI * 2;
    this.sync();
  }

  sync() {
    const h = this.hosts[this.index];
    const b = this.hostBody(this.index);
    if (!h || !b) return;
    // orbite dans le plan horizontal de l'hote, suffisant ici
    this.position = [
      b.position[0] + Math.cos(this.angle) * h.radius,
      b.position[1],
      b.position[2] + Math.sin(this.angle) * h.radius,
    ];
  }

  /**
   * Un observateur verrouille la lune s'il la regarde et qu'il est a portee.
   * En deca de LOCK_MIN elle est verrouillee quoi qu'il arrive : on ne peut pas
   * la faire disparaitre en se collant contre elle en fermant les yeux.
   */
  isObserved(eye, forward, halfFov = 0.62) {
    const d = [this.position[0] - eye.x, this.position[1] - eye.y,
               this.position[2] - eye.z];
    const dist = Math.hypot(...d) || 1e-6;
    if (dist < LOCK_MIN) return true;
    if (dist > LOCK_MAX) return false;
    const dot = (d[0] * forward.x + d[1] * forward.y + d[2] * forward.z) / dist;
    return dot > Math.cos(halfFov);
  }

  /** Suit son hote, et s'effondre ailleurs des qu'on cesse de la regarder. */
  update(eye, forward) {
    this.sync();
    const now = this.isObserved(eye, forward);
    if (this.observed && !now) this.relocate();
    this.observed = now;
    return this.observed;
  }

  get hostName() {
    const h = this.hosts[this.index];
    return h ? h.host : null;
  }
}
