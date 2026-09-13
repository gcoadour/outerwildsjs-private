// On allume en REGARDANT.
//
// @lit GazeSwitch, GazeWebAnimator, EnergyGate, SwitchableDevice
// L'interrupteur du regard, sa toile, et la porte d'energie qu'il ouvre. Trois
// classes enchainees, aucune lue jusqu'ici.
//
// Une mecanique entiere du build que le portage n'avait pas, et dont rien ne
// signalait l'absence : il n'y a pas d'invite a l'ecran, pas de touche a
// presser. Une sphere de six unites de rayon, posee sur `Twin01_Body` — l'une
// des jumelles, et non Dark Bramble comme le lieu le laissait croire — et
// dedans une toile. On s'approche, on la FIXE trois secondes, et la porte
// d'energie, dix-neuf unites plus loin, s'efface.
//
// LA LOI, lue dans `GazeSwitch.Update` :
//
//     d        = ma position - celle de la camera
//     angle    = angle(d, l'avant de la camera)
//     fDist    = clamp01((rayon - |d|) / (rayon - distActivation))
//     fAngle   = 1 - clamp01((angle - angleActivation) / (60 - angleActivation))
//     regard   = fDist x fAngle
//
//     regard >= 1 ? charge += dt : charge -= dt,  borne a [0, secondes]
//     charge atteint le plein  -> SwitchOn(), et on attend la decharge
//     charge redescend sous la MOITIE -> on peut rallumer
//
// `regard >= 1` demande les DEUX facteurs pleins : etre a moins de quatre
// unites ET regarder a moins de dix degres. Les deux fractions ne servent donc
// pas a declencher — elles servent a ANIMER, et c'est la toile qui les lit.
//
// Les constantes viennent du constructeur (10 degres, 3 secondes, 4 unites) ;
// seul le rayon vient de la scene, par le collider — six unites. Un invariant
// garde cette repartition.
//
// LA TOILE, `GazeWebAnimator.Update` — deux anneaux qui tournent en sens
// inverse, de plus en plus vite, au CUBE des deux fractions :
//
//     exterieur  +(300 x regard^3 + 300 x charge^3) degres/s
//     interieur  -(600 x charge^3) degres/s
//
// Le cube est ce qui rend le geste : presque rien tant qu'on n'est pas
// exactement dessus, puis un emballement. Charge pleine, la toile s'efface en
// deux secondes et le composant s'eteint.
//
// LA PORTE, `EnergyGate` — `SwitchOn` appelle `ToggleGate(false)`, ce qui
// coupe ses colliders et fait fondre son `_TintColor` vers alpha 0 en une
// seconde. La porte ne s'ouvre pas : elle DISPARAIT.

/** Constantes du constructeur de `GazeSwitch`. Le rayon, lui, vient du collider. */
export const GAZE = { angle: 10, seconds: 3, activationDist: 4, maxAngle: 60 };
/** Vitesses de la toile, en degres par seconde a fraction pleine. */
export const WEB = { outer: 300, inner: 600, fade: 2 };
/** Duree du fondu de la porte d'energie. */
export const GATE_FADE = 1;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Les interrupteurs du regard poses dans la scene. */
export function gazeSwitches(gameplay) {
  return ((gameplay.placed || {}).GazeSwitch || []).map((c) => {
    const f = c.fields || {};
    const v = c.volume || null;
    return {
      name: c.name,
      position: c.position,
      body: c.body || null,
      angle: f._angleOfActivation ?? GAZE.angle,
      seconds: f._secondsToCharge ?? GAZE.seconds,
      // `_activationDist` n'est serialise sur aucune instance : il vient du
      // constructeur, comme les seuils de la marche (docs/46).
      activationDist: f._activationDist ?? GAZE.activationDist,
      // `_volumeRadius` vient du collider, lu dans `Awake`.
      radius: v && typeof v.radius === "number" ? v.radius : null,
      device: (f._switchableDevice && f._switchableDevice.$ref) || null,
    };
  });
}

/** Les portes d'energie posees dans la scene. */
export function energyGates(gameplay) {
  return ((gameplay.placed || {}).EnergyGate || []).map((c) => ({
    name: c.name, position: c.position, body: c.body || null,
  }));
}

/**
 * Un interrupteur du regard, vivant.
 *
 * Ne touche ni a Babylon ni au DOM : il rend des FRACTIONS, et l'affichage en
 * fait ce qu'il veut.
 */
export class GazeSwitch {
  constructor(data, cfg = GAZE) {
    this.data = data;
    this.cfg = cfg;
    this.radius = data.radius ?? 6;
    this.charge = 0;
    this.gazeFraction = 0;
    this.waitForDischarge = false;
    this.switched = false;        // a-t-il declenche depuis la derniere image
    this.on = false;              // l'appareil est-il allume
  }

  get chargeFraction() { return this.data.seconds > 0 ? this.charge / this.data.seconds : 0; }

  /**
   * @param dt
   * @param camPos      position de la camera, dans le meme repere que `position`
   * @param camForward  direction du regard, normalisee
   * @param position    position de l'interrupteur (elle bouge : tout orbite)
   */
  update(dt, camPos, camForward, position = this.data.position) {
    this.switched = false;
    const d = [position[0] - camPos[0], position[1] - camPos[1], position[2] - camPos[2]];
    const dist = Math.hypot(d[0], d[1], d[2]) || 1e-9;
    const cos = (d[0] * camForward[0] + d[1] * camForward[1] + d[2] * camForward[2]) / dist;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;

    const denomD = (this.radius - this.data.activationDist) || 1;
    const fDist = clamp01((this.radius - dist) / denomD);
    const denomA = (this.cfg.maxAngle - this.data.angle) || 1;
    const fAngle = 1 - clamp01((angle - this.data.angle) / denomA);
    this.gazeFraction = fDist * fAngle;

    this.charge += this.gazeFraction >= 1 ? dt : -dt;
    this.charge = Math.max(0, Math.min(this.data.seconds, this.charge));

    if (!this.waitForDischarge && this.charge >= this.data.seconds) {
      this.waitForDischarge = true;
      this.switched = true;
      this.on = true;
    } else if (this.charge < this.data.seconds * 0.5) {
      this.waitForDischarge = false;
    }
    return this;
  }

  reset() {
    this.charge = 0;
    this.gazeFraction = 0;
    this.waitForDischarge = false;
    this.switched = false;
    this.on = false;
  }
}

/**
 * La toile : deux anneaux qui tournent en sens inverse, au CUBE des fractions.
 *
 * Rend des vitesses en degres par seconde plutot que de tourner quoi que ce
 * soit : c'est ce qui permet de l'eprouver sans navigateur.
 */
export function webSpeeds(gazeFraction, chargeFraction, cfg = WEB) {
  return {
    outer: cfg.outer * gazeFraction ** 3 + cfg.outer * chargeFraction ** 3,
    inner: -cfg.inner * chargeFraction ** 3,
  };
}

/**
 * L'effacement de la toile une fois la charge pleine : deux secondes, lineaire,
 * et le composant s'eteint quand l'alpha touche zero.
 */
export function webAlpha(secondsSinceFull, initAlpha = 1, cfg = WEB) {
  return Math.max(0, (1 - secondsSinceFull / cfg.fade) * initAlpha);
}

/**
 * La porte d'energie : ses colliders se coupent d'un coup, son alpha fond en
 * une seconde. Elle ne s'ouvre pas, elle disparait.
 */
export class EnergyGate {
  constructor(data, alpha = 1) {
    this.data = data;
    this.alpha = alpha;
    this.initAlpha = alpha;
    this.targetAlpha = alpha;
    this.solid = true;
    this.t0 = null;
  }

  /** `ToggleGate(on)` : les colliders suivent l'etat, l'alpha le rejoint. */
  toggle(on, t = 0) {
    this.solid = !!on;
    this.initAlpha = this.alpha;
    this.targetAlpha = on ? 1 : 0;
    this.t0 = t;
  }

  switchOn(t = 0) { this.toggle(false, t); }

  update(t) {
    if (this.t0 === null) return this.alpha;
    const u = clamp01((t - this.t0) / GATE_FADE);
    this.alpha = this.initAlpha + (this.targetAlpha - this.initAlpha) * u;
    if (u >= 1) this.t0 = null;
    return this.alpha;
  }
}
