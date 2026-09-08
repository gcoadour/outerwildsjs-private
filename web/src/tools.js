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

  /** La derniere sonde lancee, celle que la camera embarquee suit. */
  get last() { return this.probes.length ? this.probes[this.probes.length - 1] : null; }
}

/**
 * Camera embarquee de la sonde.
 *
 * `ProbeLauncher` en porte une dans le jeu : la sonde est un appareil photo
 * qu'on jette, et c'est par son oeil qu'on voit ce qu'il y a au fond d'un
 * gouffre. Ici c'est une seconde camera, dessinee dans un coin de l'ecran tant
 * qu'une sonde vole, et rangee des qu'il n'y en a plus.
 *
 * Une seule chose merite attention : Babylon ne dessine plusieurs cameras que
 * par `activeCameras`. Y laisser la camera du joueur seule quand la sonde
 * disparait est indispensable — une liste vide donne un ecran noir.
 */
export class ProbeCamera {
  constructor(BABYLON, scene, mainCamera, root = null) {
    this.B = BABYLON;
    this.scene = scene;
    this.main = mainCamera;
    this.cam = new BABYLON.FreeCamera("probeCam", BABYLON.Vector3.Zero(), scene);
    this.cam.minZ = 0.5;
    this.cam.maxZ = 200000;
    this.cam.fov = 1.0;                 // grand angle : c'est un objectif jete
    this.cam.viewport = new BABYLON.Viewport(0.755, 0.03, 0.23, 0.23);
    this.on = false;
    // Cadre : le vide d'un cote et le vide de l'autre se ressemblent trop pour
    // qu'on voie ou commence l'image de la sonde. Le cadre est en HTML, cale
    // sur les memes fractions que le viewport de Babylon — dont l'origine est
    // en BAS a gauche, d'ou le `bottom`.
    this.frame = null;
    if (root) {
      const el = document.createElement("div");
      el.className = "ow-probeview";
      el.hidden = true;
      root.appendChild(el);
      this.frame = el;
    }
  }

  /**
   * Deplace la vue de sonde. Cadre et viewport vont ENSEMBLE : bouger l'un
   * sans l'autre decalerait l'image de son cadre. Les fractions sont celles de
   * Babylon, dont l'origine est en bas a gauche — d'ou le `bottom` du cadre.
   *
   * Sert au paysage de telephone, ou le coin bas-droit revient aux boutons.
   */
  setViewport(x, y, w, h) {
    this.cam.viewport = new this.B.Viewport(x, y, w, h);
    if (!this.frame) return;
    const st = this.frame.style;
    st.left = `${x * 100}%`;
    st.right = "auto";
    st.bottom = `${y * 100}%`;
    st.top = "auto";
    st.width = `${w * 100}%`;
    st.height = `${h * 100}%`;
  }

  /** @param probe sonde a suivre, ou null */
  update(probe) {
    const want = !!probe;
    if (want) {
      this.cam.position.set(probe.pos[0], probe.pos[1], probe.pos[2]);
      const v = probe.vel, L = Math.hypot(v[0], v[1], v[2]) || 1;
      this.cam.setTarget(new this.B.Vector3(
        probe.pos[0] + v[0] / L, probe.pos[1] + v[1] / L, probe.pos[2] + v[2] / L));
    }
    if (want === this.on) return this.on;
    this.on = want;
    this.main.viewport = new this.B.Viewport(0, 0, 1, 1);
    this.scene.activeCameras = want ? [this.main, this.cam] : [this.main];
    if (this.frame) this.frame.hidden = !want;
    return this.on;
  }
}
