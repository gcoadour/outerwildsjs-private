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

// --- l'onde du telescope (docs/65-onde.md) ------------------------------------
//
// `DrawSoundWave` etait la derniere classe de la scene sans lecteur qui fasse
// quelque chose de visible. C'est un oscilloscope : cinq cents points, une
// boite dans le coin de l'ecran, et UN point ecrit par image.
//
// @lit DrawSoundWave, TelescopeGUI, SettingsMenuTrigger

/**
 * Les nombres du trace, tous du constructeur ou d'`Awake`.
 *
 * La boite est en coordonnees de VIEWPORT, origine en bas a gauche : elle
 * occupe le cinquieme central en largeur, un dixieme en hauteur, un peu
 * au-dessus du milieu.
 */
export const WAVE = {
  points: 500,
  // `_xOffset` / `_yOffset` du constructeur. Ils ne servent pas au trace lui-
  // meme — les quatre sommets ci-dessous le posent — et on les garde parce
  // qu'ils sont mesures.
  xOffset: 0.4, yOffset: -0.3,
  // `_beginTopVertex` … `_endBottomVertex`, d'`Awake`.
  x0: 0.4, y0: 0.15, x1: 0.6, y1: 0.25,
};

/** La duree de reference du trace : `_numPoints` images. */
export const WAVE_POINTS = WAVE.points;

/**
 * L'onde : un tampon circulaire de cinq cents valeurs, une par image.
 *
 * `SetPoints` boucle sur UN seul echantillon — la boucle est ecrite pour deux
 * et s'arrete a un (`blt 1`), ce qui est sans doute un reste — et pose
 *
 *     (echantillon x force + 1) / 2
 *
 * Force nulle, la valeur vaut donc 0,5 partout : une ligne plate au milieu de
 * la boite, ce qui est exactement ce qu'on veut voir quand la lunette ne capte
 * rien. C'est aussi pourquoi `InitializePoints` remplit de 0,5.
 *
 * Le curseur DESCEND : le point neuf s'ecrit a droite et l'onde defile vers la
 * gauche.
 */
export class SoundWave {
  constructor(n = WAVE.points) {
    this.n = n;
    this.points = new Array(n).fill(0.5);
    this.cursor = n - 1;
  }

  /**
   * @param sample   l'echantillon du clip, entre -1 et 1
   * @param strength la force de signal de l'image, remise a zero apres
   */
  push(sample, strength) {
    const v = (sample * strength + 1) * 0.5;
    this.points[this.cursor] = v;
    this.cursor = (this.cursor - 1 + this.n) % this.n;
    return v;
  }

  /**
   * Les points du plus ancien au plus recent, prets a tracer.
   *
   * Le curseur DESCEND — c'est `_currentPoint--` du build — donc le point neuf
   * est celui qui vient JUSTE APRES lui dans le tampon, et le plus ancien est
   * celui qu'on va ecrire. On remonte donc a l'envers.
   */
  ordered() {
    const out = new Array(this.n);
    for (let i = 0; i < this.n; i++) {
      out[i] = this.points[(this.cursor + this.n - i) % this.n];
    }
    return out;
  }
}

/**
 * `TelescopeGUI.LateUpdate` : la lunette GROSSIT quand on desserre le zoom.
 *
 *     echelle = echelle_initiale x champ / _minFOV
 *
 * `_minFOV` vaut 15 sur `TelescopeGUI` et 10 sur `Telescope` — deux composants,
 * deux valeurs, et c'est celle de l'interface qui commande l'echelle. A 60
 * degres la lunette est donc quatre fois plus grande qu'a 15, et elle se
 * retracte a mesure qu'on resserre. Le portage ne la faisait pas bouger, mais
 * il ne la dessinait pas non plus (docs/64-mains.md).
 */
export const TELESCOPE_GUI = { minFOV: 15, maxFOV: 60 };

export function telescopeScale(fov, base = 1, cfg = TELESCOPE_GUI) {
  return base * fov / cfg.minFOV;
}

/**
 * La position de la fleche du zoom sur sa reglette, de 0 (en bas) a 1 (en haut).
 *
 *     y = (hauteur_reglette - hauteur_fleche / 2) x _zoomDistance
 *     y x= (champ - _minFOV) / _maxFOV
 *
 * On rend la seconde ligne seule, normalisee : la premiere n'est que la mise a
 * l'echelle en pixels de l'image, et le portage n'a pas ces images.
 */
export function zoomArrowFraction(fov, cfg = TELESCOPE_GUI) {
  const f = (fov - cfg.minFOV) / cfg.maxFOV;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}
