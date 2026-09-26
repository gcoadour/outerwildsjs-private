// Le spectacle de la supernova.
//
// Le build nomme quatre comportements pour la fin des temps :
//
//   SunSurfaceProgressionBehavior   la surface se degrade au fil de la boucle
//   SunCoronaProgressBehavior       la couronne suit la meme progression
//   ShrinkSunBehavior               l'etoile se CONTRACTE juste avant d'exploser
//   SunExplosionBehavior            puis l'explosion et son onde
//
// Ce qui vient du build : ces quatre etapes, leur ordre, et leurs lois. Les
// deux premieres ne touchent qu'a la COULEUR (`SunColorCurve`) : l'etoile ne
// grossit pas au fil de la boucle, et le gonflement de 35 % que le portage lui
// donnait etait de lui. Les deux dernieres sont des effondrements lus dans
// l'IL (`Effondrement`, timeloop.js) : la surface tombe vers 3 % de son
// echelle et explose sous 150, en 1,6 s ; la couronne la suit et disparait
// sous 50. L'onde de choc part a l'explosion, pas au declenchement
// (docs/132).
//
// Ce qui n'en vient PAS : l'eclair et la coque d'onde, la mise en scene
// Babylon de ce que fait le `Detonator` d'Unity 4.

// @lit Detonator
// @autrement Detonator : le composant Detonator d'Unity 4 est remplace par la mise en scene Babylon de SunStage
export const SUN_SHOW = {
  flashSeconds: 0.8,     // eclair blanc a l'explosion
  coronaBase: 1.18,      // echelle de la couronne autour de la surface
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

    // 1. progression : la couleur seule, que le shader du soleil suit
    let scale = 1;
    let corona = 1;
    let phase = "progression";

    // 2. contraction : de `TriggerSupernova` a `SunExploded`, l'echelle est
    // celle de l'effondrement du build, image par image
    if (loop.collapsing) {
      phase = "contraction";
      scale = loop.effondrement ? loop.effondrement.fraction : 1;
    }
    if (loop.couronne) corona = loop.couronne.fraction;

    // 3. explosion : la surface a disparu (`localScale` nul, `Destroy`) ; ce
    // qu'on voit grandir est la sphere de mort, au rayon de l'onde
    let flash = 0;
    const shock = { radius: 0, alpha: 0 };
    if (loop.supernova) {
      phase = "explosion";
      const r = loop.shockwaveRadius || 0;
      scale = Math.min(c.maxScale, r / this.radius);
      // Temps ecoule depuis l'explosion : le temps reel de boucle donne l'eclair
      // bref de 0,8 s ; repli sur la distance si seul le rayon est fourni.
      const since = (loop.elapsed != null && loop.supernovaAt != null)
        ? Math.max(0, loop.elapsed - loop.supernovaAt)
        : r / 2000;
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
        scale: c.coronaBase * corona,
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
    // Le groupe 1 pour passer apres l'opaque — et main.js lui retire
    // l'effacement de profondeur que Babylon y met, sans quoi cette couronne se
    // peint par-dessus la planete qui occulte l'etoile.
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

    this.corona.setEnabled(state.corona.alpha > 0.02 && state.corona.scale > 0);
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
