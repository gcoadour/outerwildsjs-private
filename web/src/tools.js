// Outils du joueur : telescope et lanceur de sonde.
//
// Les deux sont portes par la camera du joueur dans la scene, pas poses dans le
// monde : ce sont des instruments qu'on utilise, pas des lieux a visiter.
//
// Telescope, valeurs du build : champ de vision de 10 a 60 degres, zoom en 2 s.
// ProbeLauncher n'expose aucune valeur numerique ; c'est lui qui accorde
// KnowsHowProbesWork dans le jeu.
//
// Nuance de fidelite : rien dans le build n'accorde KnowsHowTelescopeWorks.
// Le drapeau existe et n'est jamais ecrit. Le relier a l'usage du telescope est
// donc MON ajout, pas un comportement extrait.

export const TELESCOPE = { minFOV: 10, maxFOV: 60, zoomSeconds: 2 };

export class Telescope {
  constructor(cfg = TELESCOPE) {
    this.cfg = cfg;
    this.active = false;
    this.zoom = 0;          // 0 = champ large, 1 = champ etroit
    // Telescope.Update : le volume de la lunette EST la somme des forces de
    // signal des emetteurs vises, remise a zero a chaque image.
    this.signalStrength = 0;
  }

  addSignalStrength(s) { this.signalStrength += s; }

  toggle() { this.active = !this.active; return this.active; }

  /** @returns le champ de vision en radians, a appliquer a la camera */
  update(dt) {
    const target = this.active ? 1 : 0;
    const rate = 1 / (this.cfg.zoomSeconds || 2);
    this.zoom += Math.sign(target - this.zoom) *
                 Math.min(Math.abs(target - this.zoom), rate * dt);
    const deg = this.cfg.maxFOV + (this.cfg.minFOV - this.cfg.maxFOV) * this.zoom;
    return deg * Math.PI / 180;
  }

  get magnification() { return this.cfg.maxFOV / this.cfg.minFOV; }
}

export class ProbeLauncher {
  constructor(speed = 200, lifetime = 20) {
    this.speed = speed;
    this.lifetime = lifetime;
    this.probes = [];
    this.launched = 0;
  }

  /** Lance une sonde depuis une position, dans une direction. */
  launch(pos, dir) {
    this.probes.push({
      pos: [pos.x, pos.y, pos.z],
      vel: [dir.x * this.speed, dir.y * this.speed, dir.z * this.speed],
      age: 0,
    });
    this.launched += 1;
    return this.probes[this.probes.length - 1];
  }

  /** Avance les sondes ; le champ dominant les infléchit comme le joueur. */
  update(dt, field) {
    for (const p of this.probes) {
      if (field) {
        p.vel[0] += field.dir.x * field.magnitude * dt;
        p.vel[1] += field.dir.y * field.magnitude * dt;
        p.vel[2] += field.dir.z * field.magnitude * dt;
      }
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
      p.age += dt;
    }
    this.probes = this.probes.filter((p) => p.age < this.lifetime);
    return this.probes.length;
  }

  get active() { return this.probes.length; }
}
