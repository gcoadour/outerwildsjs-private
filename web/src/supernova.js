// Le spectacle de la supernova.
//
// Le build nomme quatre comportements pour la fin des temps :
//
//   SunSurfaceProgressionBehavior   la surface se degrade au fil de la boucle
//   SunCoronaProgressBehavior       la couronne suit la meme progression
//   ShrinkSunBehavior               l'etoile se CONTRACTE juste avant d'exploser
//   SunExplosionBehavior            puis l'explosion et son onde
//
// Ce qui vient du build : ces quatre etapes, leur ordre, et la seule valeur
// numerique que l'alpha donne pour la fin des temps — l'onde de choc parcourt
// 30 000 unites en 15 secondes, soit 2 000 u/s (`SunSphereOfDeathBehavior`).
//
// Ce qui n'en vient PAS : les durees et les echelles de la mise en scene. Les
// comportements portent leurs courbes dans des composants d'animation que ce
// portage ne lit pas. Les valeurs de `SUN_SHOW` sont donc les miennes, choisies
// pour que l'enchainement se lise a l'ecran ; elles sont ici en clair pour
// qu'on ne les prenne pas pour des mesures.

export const SUN_SHOW = {
  shrinkSeconds: 12,     // duree de la contraction avant l'explosion
  shrinkTo: 0.62,        // echelle atteinte au creux de la contraction
  growth: 0.35,          // gonflement de la surface sur toute la boucle
  flashSeconds: 0.8,     // eclair blanc au declenchement
  coronaBase: 1.18,      // echelle de la couronne au repos
  coronaGrowth: 0.45,    // ce qu'elle gagne sur la boucle
  maxScale: 40,          // borne : au-dela, l'etoile deborde la scene utile
};

/**
 * Etat de l'etoile a un instant de la boucle.
 *
 * Une seule fonction rend les quatre comportements, parce qu'ils decrivent
 * quatre morceaux d'une meme courbe : progression, contraction, explosion,
 * onde. La separer en quatre objets aurait recopie la structure du jeu sans
 * rien apporter — ils partagent tous la meme horloge.
 */
export class SunStage {
  /**
   * @param radius rayon de surface de l'etoile, en unites de jeu
   */
  constructor(radius, cfg = SUN_SHOW) {
    this.radius = radius || 2000;
    this.cfg = cfg;
    this.state = this.update({ fraction: 0, secondsRemaining: Infinity,
                               supernova: false, shockwaveRadius: 0 });
  }

  /**
   * @param loop TimeLoop (ou tout objet portant fraction, secondsRemaining,
   *             supernova et shockwaveRadius)
   * @returns {phase, scale, corona:{scale, alpha}, flash, shock:{radius, alpha}}
   */
  update(loop) {
    const c = this.cfg;
    const frac = Math.min(1, Math.max(0, loop.fraction || 0));

    // 1. progression de surface : l'etoile enfle et s'agite tout au long
    let scale = 1 + frac * c.growth;
    let phase = "progression";

    // 2. contraction : ShrinkSunBehavior reprend la main sur la fin
    const left = loop.secondsRemaining;
    if (!loop.supernova && left != null && left < c.shrinkSeconds) {
      const k = 1 - Math.max(0, left) / c.shrinkSeconds;   // 0 -> 1
      const peak = 1 + c.growth;
      // courbe en cosinus : la contraction part doucement et s'acheve net,
      // ce qui donne l'aspiration qui precede l'explosion
      const e = (1 - Math.cos(k * Math.PI)) / 2;
      scale = peak + (c.shrinkTo - peak) * e;
      phase = "contraction";
    }

    // 3. explosion : l'etoile suit son onde de choc
    let flash = 0;
    const shock = { radius: 0, alpha: 0 };
    if (loop.supernova) {
      phase = "explosion";
      const r = loop.shockwaveRadius || 0;
      scale = Math.min(c.maxScale, c.shrinkTo + r / this.radius);
      const since = r / 2000;            // secondes ecoulees depuis l'explosion
      flash = Math.max(0, 1 - since / c.flashSeconds);
      shock.radius = r;
      // l'onde palit en s'etendant : elle reste lisible une quinzaine de
      // secondes, le temps qu'elle mette a atteindre les corps exterieurs
      shock.alpha = Math.max(0, 1 - r / 30000) * 0.55;
    }

    this.state = {
      phase,
      scale,
      corona: {
        scale: (c.coronaBase + frac * c.coronaGrowth) * scale,
        alpha: 0.12 + frac * 0.45 + flash * 0.4,
      },
      flash,
      shock,
    };
    return this.state;
  }
}

/**
 * Rendu de l'etoile mourante : une couronne additive autour de la surface, une
 * coque d'onde de choc, et l'eclair.
 *
 * Le rendu est monte a la demande : tant que la boucle n'approche pas de sa
 * fin, ces trois objets n'existent pas.
 */
export class SupernovaView {
  constructor(BABYLON, scene, starMesh) {
    this.B = BABYLON;
    this.scene = scene;
    this.star = starMesh;
    this.corona = null;
    this.shell = null;
  }

  _build() {
    const B = this.B;
    const radius = (this.star.getBoundingInfo().boundingSphere.radius) || 1;

    this.corona = B.MeshBuilder.CreateSphere("sunCorona",
      { diameter: radius * 2, segments: 24 }, this.scene);
    const cm = new B.StandardMaterial("sunCoronaMat", this.scene);
    cm.emissiveColor = new B.Color3(1.0, 0.55, 0.2);
    cm.diffuseColor = new B.Color3(0, 0, 0);
    cm.disableLighting = true;
    cm.alphaMode = B.Engine.ALPHA_ADD;
    cm.backFaceCulling = false;
    cm.disableDepthWrite = true;
    this.corona.material = cm;
    this.corona.isPickable = false;
    this.corona.renderingGroupId = 1;

    // L'onde de choc est une coque qu'on regarde de l'INTERIEUR pendant les
    // quinze secondes ou elle traverse le systeme : faces arriere conservees,
    // et pas d'ecriture de profondeur, sinon elle efface tout ce qu'elle
    // englobe.
    this.shell = B.MeshBuilder.CreateSphere("shockwave",
      { diameter: 2, segments: 32 }, this.scene);
    const sm = new B.StandardMaterial("shockwaveMat", this.scene);
    sm.emissiveColor = new B.Color3(1.0, 0.85, 0.6);
    sm.diffuseColor = new B.Color3(0, 0, 0);
    sm.disableLighting = true;
    sm.alphaMode = B.Engine.ALPHA_ADD;
    sm.backFaceCulling = false;
    sm.disableDepthWrite = true;
    sm.wireframe = true;    // une coque pleine masquerait le systeme entier
    this.shell.material = sm;
    this.shell.isPickable = false;
    this.shell.renderingGroupId = 1;
  }

  /**
   * @param state  sortie de SunStage.update()
   * @param center position de l'etoile dans le repere courant
   */
  update(state, center) {
    const visible = state.corona.alpha > 0.02 || state.shock.alpha > 0.002;
    if (!visible && !this.corona) return;
    if (!this.corona) this._build();

    this.corona.setEnabled(state.corona.alpha > 0.02);
    this.corona.position.set(center[0], center[1], center[2]);
    this.corona.scaling.setAll(state.corona.scale);
    this.corona.material.alpha = Math.min(1, state.corona.alpha);

    const on = state.shock.alpha > 0.002 && state.shock.radius > 1;
    this.shell.setEnabled(on);
    if (on) {
      this.shell.position.set(center[0], center[1], center[2]);
      this.shell.scaling.setAll(state.shock.radius);
      this.shell.material.alpha = state.shock.alpha;
    }
  }
}
