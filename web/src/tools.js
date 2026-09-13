// Outils du joueur : telescope et lanceur de sonde.
//
// Les deux sont portes par la camera du joueur dans la scene, pas poses dans le
// monde : ce sont des instruments qu'on utilise, pas des lieux a visiter.
//
// Telescope, lu dans l'IL et non plus devine : on entre a 33,33 degres
// ((_maxFOV - _minFOV) / 1,5), on zoome A LA MAIN entre 10 et 60 a cinquante
// degres par seconde, et on ressort au champ de la camera — 70. Le portage
// ramenait toujours au plus etroit depuis 60, ce qui faisait deux erreurs a la
// fois : un grossissement de sept au lieu de deux, et un champ de repos de 60
// au lieu de 70 sur TOUTE la partie, telescope range.
// Le lanceur de sonde a quitte ce fichier : il vit dans `probe.js` avec le
// reste du prefabrique. La phrase qui tenait ici — « ProbeLauncher n'expose
// aucune valeur numerique » — etait vraie de la SCENE et fausse du jeu : les
// quatre nombres sont dans son constructeur, que personne n'avait ouvert
// (docs/60-sonde.md).
//
// Nuance de fidelite : rien dans le build n'accorde KnowsHowTelescopeWorks.
// Le drapeau existe et n'est jamais ecrit. Le relier a l'usage du telescope est
// donc MON ajout, pas un comportement extrait.

import { effetsSecondaires } from "./postfx.js";

// `Telescope`, serialise sur PlayerCamera : `_minFOV` 10, `_maxFOV` 60,
// `_zoomInSeconds` 2. Le constructeur, lui, pose 15 / 60 / 2 — c'est
// l'instance qui gagne.
//
// `restFOV` n'est PAS un champ du telescope : c'est le champ de vision de la
// camera elle-meme (70 degres), celui que `SnapToInitFieldOfView` retrouve en
// sortant. Il est ici parce que le telescope en a besoin, et il se sait repli
// quand `data/camera.json` n'a pas ete lu.
//
// `nearNormal` / `nearTelescope` : `EnterTelescope` recule le plan proche de
// 0,05 a 0,5 et `ExitTelescope` le ramene. A 10 degres de champ, un plan proche
// a 5 cm ruine la precision de profondeur sur tout le lointain — c'est la
// raison d'etre de ces deux lignes, et c'est visible.
export const TELESCOPE = {
  minFOV: 10, maxFOV: 60, zoomSeconds: 2, restFOV: 70,
  nearNormal: 0.05, nearTelescope: 0.5,
  zoomRate: 50,          // degres par seconde, a la commande
};

export class Telescope {
  constructor(cfg = TELESCOPE) {
    this.cfg = { ...TELESCOPE, ...cfg };
    this.active = false;
    // Le champ vise, en DEGRES. Le portage tenait un `zoom` de 0 a 1 et
    // ramenait toujours au meme etroit ; le build, lui, tient un angle que la
    // commande fait varier, et qui part d'une valeur bien plus large.
    this.targetFOV = this.cfg.restFOV;
    this.fov = this.cfg.restFOV;
    // Telescope.Update : le volume de la lunette EST la somme des forces de
    // signal des emetteurs vises, remise a zero a chaque image.
    this.signalStrength = 0;
  }

  addSignalStrength(s) { this.signalStrength += s; }

  /**
   * `EnterTelescope` ne va pas au plus etroit : il vise
   * `(_maxFOV - _minFOV) / 1,5`, soit 33,33 degres pour 60 et 10. C'est un
   * grossissement de deux, pas de sept — et de la on zoome A LA MAIN.
   */
  get entryFOV() { return (this.cfg.maxFOV - this.cfg.minFOV) / 1.5; }

  toggle() {
    this.active = !this.active;
    this.targetFOV = this.active ? this.entryFOV : this.cfg.restFOV;
    return this.active;
  }

  /** Le plan proche recule pendant qu'on vise : 0,05 devient 0,5. */
  get nearClip() { return this.active ? this.cfg.nearTelescope : this.cfg.nearNormal; }

  /**
   * @param {number} dt
   * @param {number} zoom  -1 (elargir) a +1 (resserrer), la commande du joueur
   * @returns le champ de vision en radians, a appliquer a la camera
   */
  update(dt, zoom = 0) {
    if (this.active && zoom) {
      this.targetFOV = Math.min(this.cfg.maxFOV,
        Math.max(this.cfg.minFOV, this.targetFOV - zoom * dt * this.cfg.zoomRate));
    }
    // `SnapToFieldOfView(cible, _zoomInSeconds)` : on rejoint la cible en deux
    // secondes, a l'entree comme a la sortie. Entre-temps la commande deplace
    // la cible, et le suivi la rattrape.
    const rate = 1 / (this.cfg.zoomSeconds || 2);
    const ecart = this.targetFOV - this.fov;
    const pas = Math.max(Math.abs(this.cfg.restFOV - this.cfg.minFOV), 1) * rate * dt;
    this.fov += Math.sign(ecart) * Math.min(Math.abs(ecart), pas);
    return this.fov * Math.PI / 180;
  }

  get magnification() { return this.cfg.restFOV / this.cfg.minFOV; }
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
  /**
   * @param reglages  ce que `data/camera.json` dit de `LandingCam` : champ de
   *                  100 degres, plan proche a 0,5, et un `NoiseAndGrain` de
   *                  force 4. Le champ etait un radian ecrit a la main (57
   *                  degres) : « grand angle » etait la bonne intention et pas
   *                  le bon nombre.
   */
  constructor(BABYLON, scene, mainCamera, root = null, reglages = null) {
    this.B = BABYLON;
    this.scene = scene;
    this.main = mainCamera;
    this.cam = new BABYLON.FreeCamera("probeCam", BABYLON.Vector3.Zero(), scene);
    this.cam.minZ = 0.5;
    this.cam.maxZ = 200000;
    this.cam.fov = ((reglages && reglages.fov) || 100) * Math.PI / 180;
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
    // Le grain de la pellicule. Il est pose une fois : `NoiseAndGrain` n'a pas
    // de controleur, ses reglages ne bougent jamais.
    this.grain = reglages && reglages.grain
      ? effetsSecondaires(BABYLON, this.cam, scene.getEngine(), "grain", reglages)
      : null;
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

  /**
   * @param probe sonde a suivre, ou null
   * @param rear  vue ARRIERE (`RearCamera`, tournee de 180 degres)
   *
   * Le prefabrique porte DEUX cameras, et la seconde n'est pas un luxe : une
   * fois plantee, la sonde a le NEZ DANS la paroi — `AttachToObject` aligne son
   * avant sur `-normale`, comme une flechette. La camera avant filme donc la
   * roche, et c'est la camera arriere qui montre quelque chose. Le portage n'en
   * dessine qu'une, et bascule sur la commande `altProbe`.
   */
  update(probe, rear = false) {
    const want = !!probe;
    if (want) {
      this.cam.position.set(probe.pos[0], probe.pos[1], probe.pos[2]);
      // En vol la sonde regarde ou elle va ; posee, sa vitesse est nulle et
      // c'est son orientation qui vaut, celle que l'ancrage lui a donnee.
      const v = probe.forward && probe.anchored ? probe.forward
        : (probe.vel && Math.hypot(...probe.vel) > 1e-6 ? probe.vel : probe.forward)
          || [0, 0, 1];
      const s = rear ? -1 : 1;
      const L = Math.hypot(v[0], v[1], v[2]) || 1;
      this.cam.setTarget(new this.B.Vector3(
        probe.pos[0] + s * v[0] / L, probe.pos[1] + s * v[1] / L,
        probe.pos[2] + s * v[2] / L));
    }
    if (want === this.on) return this.on;
    this.on = want;
    this.main.viewport = new this.B.Viewport(0, 0, 1, 1);
    this.scene.activeCameras = want ? [this.main, this.cam] : [this.main];
    if (this.frame) this.frame.hidden = !want;
    return this.on;
  }
}
