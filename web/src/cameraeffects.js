// Les effets d'image du joueur : `PlayerCameraEffectController`, loi par loi.
//
// Le portage n'avait AUCUN effet d'image. Le build en pose six sur la seule
// camera du joueur, et quatre d'entre eux sont eteints au reveil : ils ne
// servent qu'aux evenements. C'est donc une couche qui ne se voit jamais sur
// une capture au repos, et qui manque a chaque fois qu'il se passe quelque
// chose — mourir, tomber dans le trou noir, se teleporter, plonger.
//
// Ce module ne touche ni a Babylon ni au DOM : il tient l'ETAT des effets, que
// `postfx.js` applique. C'est ce qui le rend eprouvable sans navigateur, et
// c'est ou vivent les lois ci-dessous, toutes lues dans l'IL du build.
//
// Les trois constantes du constructeur — elles ne sont serialisees sur aucune
// instance, et un invariant garde cette absence :
//
//   WAKE_DURATION      3 s    le fondu blanc du reveil, a chaque boucle
//   _initTwirlAngle    220°   l'angle ou commence le tourbillon du trou noir
//   _twirlDuration     2 s    et le temps qu'il met a rejoindre 360°
//
// Une remarque sur les couleurs : le build ecrit `Color(255, 100, 100)` la ou
// Unity attend des composantes entre 0 et 1. Ce n'est pas une erreur de
// lecture — c'est un debordement VOULU, qui sature l'ecran. On garde les
// nombres tels quels, et c'est le rendu qui les borne.

// @autrement GlowEffect : les six methodes sont les passes d'un flou additif a
// N iterations. Le portage porte la GRANDEUR — `blurIterations`, de 2 a 32 — et
// la rend avec ce que le navigateur a, sans refaire les passes (docs/103).
// @lit PlayerCameraEffectController, GlowEffect, Vignetting, GrayscaleEffect, TwirlEffect
// L'etat des six effets d'image de la camera du joueur (docs/47).

export const WAKE_DURATION = 3;
export const TWIRL_START_ANGLE = 220;
export const TWIRL_DURATION = 2;

/** DeathType, lu dans la table Constant de l'assembly (scripts/il.mjs --enum). */
export const DEATH_TYPE = { Default: 0, Impact: 1, Asphyxiation: 2, Energy: 3, Supernova: 4 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

/** Reglages de la camera du joueur, tels que la scene les serialise. */
export const REGLAGES_JOUEUR = {
  glow: { intensity: 1.09, iterations: 1, blurSpread: 0.5, tint: [0.3216, 0.6588, 1, 0] },
  vignette: { intensity: 0.375, chromaticAberration: 0.2, blur: 0.1, blurSpread: 1.5 },
  bloom: { intensity: 1, threshold: 0.8, iterations: 2, blurSpread: 1.5, blend: "add", hdr: 1 },
  twirl: { radius: [1.5, 1.5], center: [0.5, 0.5] },
  fov: 70,
};

/**
 * Les reglages de la camera du joueur, lus dans `data/camera.json`.
 *
 * Le repli n'est pas une invention : ce sont les memes nombres, releves sur le
 * build et ecrits en dur, pour que la page reste ouvrable sans extraction. Il
 * se sait repli (`declared: false`), comme les distances du pilote automatique.
 */
export async function loadCameras() {
  try {
    const res = await fetch("data/camera.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("data/camera.json absent :", e.message);
    return { count: 0, effectCount: 0, cameras: [] };
  }
}

/** Extrait de `data/camera.json` ce qui regle la camera du joueur. */
export function reglagesDuJoueur(camera) {
  const cams = (camera && camera.cameras) || [];
  const c = cams.find((x) => (x.roles || []).includes("joueur"));
  if (!c) return { ...REGLAGES_JOUEUR, declared: false };
  const un = (k) => (c.effects && c.effects[k] && c.effects[k][0]) || null;
  const glow = un("GlowEffect");
  const vig = un("Vignetting");
  const bloom = un("BloomAndLensFlares");
  const twirl = un("TwirlEffect");
  return {
    declared: true,
    glow: glow ? { ...glow, tint: glow.tint || REGLAGES_JOUEUR.glow.tint } : REGLAGES_JOUEUR.glow,
    vignette: vig || REGLAGES_JOUEUR.vignette,
    bloom: bloom || REGLAGES_JOUEUR.bloom,
    twirl: twirl || REGLAGES_JOUEUR.twirl,
    fov: c.fov ?? REGLAGES_JOUEUR.fov,
  };
}

/** Les reglages d'une camera secondaire, par son nom dans le build. */
export function reglagesDe(camera, nom) {
  const c = ((camera && camera.cameras) || []).find((x) => x.name === nom);
  if (!c) return null;
  const un = (k) => (c.effects && c.effects[k] && c.effects[k][0]) || null;
  return {
    fov: c.fov ?? null,
    noise: un("NoiseEffect"),
    grain: un("NoiseAndGrain"),
    motionBlur: un("MotionBlur"),
    grayscale: un("GrayscaleEffect"),
  };
}

export class CameraEffects {
  /**
   * @param {object} reglages  ce que le build serialise sur la camera du joueur ;
   *                           `data/camera.json` le fournit, REGLAGES_JOUEUR est
   *                           le repli quand l'extraction n'a pas tourne.
   */
  constructor(reglages = REGLAGES_JOUEUR) {
    this.reglages = reglages;

    // Awake : les quatre sont eteints, et c'est pour cela qu'on ne les voit
    // jamais tant qu'il ne se passe rien.
    this.glow = { enabled: false, intensity: 0, iterations: 1, blurSpread: 0.5, tint: [0, 0, 0] };
    this.grayscale = { enabled: false, amount: 0 };
    this.vignette = { enabled: false, intensity: 0, chromaticAberration: 0, blur: 0, blurSpread: 1.5 };
    this.twirl = { enabled: false, angle: 0 };
    this.fadeFraction = 0;       // l'opacite du noir que `OnGUI` pose par-dessus

    // Awake retient les reglages du glow POUR L'IMMERSION, puis les ecrase a
    // la premiere occasion. Sans cette copie, ressortir de l'eau apres une mort
    // rendrait un glow noir : la valeur d'origine aurait ete perdue.
    const g = reglages.glow || REGLAGES_JOUEUR.glow;
    this.sousLEau = {
      intensity: g.intensity,
      iterations: g.iterations,
      tint: (g.tint || [0, 0, 0]).slice(0, 3),
    };

    this._flash = null;
    this._fade = null;
    this._twirl = null;
    this._mort = null;
    this.flashbackDemande = false;   // ce que le build annonce par "TriggerFlashback"
  }

  // --- les evenements du build ---------------------------------------------

  /**
   * Le reveil, a chaque debut de boucle : glow blanc a 3, qui retombe au noir
   * en trois secondes. C'est l'ouverture des yeux.
   *
   * On remet aussi a zero ce qu'une mort avait laisse allume. Le jeu n'en a pas
   * besoin — il RECHARGE la scene — mais ce portage, lui, garde ses objets : la
   * remise a zero est le prix de ne pas recharger.
   */
  startOfTimeLoop() {
    this.grayscale = { enabled: false, amount: 0 };
    this.vignette = { ...this.vignette, enabled: false, intensity: 0, chromaticAberration: 0, blur: 0 };
    this.twirl = { enabled: false, angle: 0 };
    this.fadeFraction = 0;
    this._fade = this._twirl = this._mort = null;
    this.flashbackDemande = false;

    this.glow.intensity = 3;
    this.glow.tint = [255, 255, 255];
    this.flashScreen(1, [0, 0, 0], WAKE_DURATION, 0);
  }

  /**
   * La mort, et ce que l'ecran en fait — trois traitements pour cinq causes.
   *
   *   Asphyxiation  cinq secondes de fondu : on s'endort
   *   Energy, Supernova  trois secondes d'eclair ROUGE : on brule
   *   Default, Impact    trois dixiemes de fondu : c'est brutal et c'est fini
   */
  playerDeath(deathType, t) {
    this._mort = { t0: t, duree: 0 };
    if (deathType === DEATH_TYPE.Asphyxiation) {
      this._mort.duree = 5;
      this.fadeOut(5, t);
    } else if (deathType === DEATH_TYPE.Energy || deathType === DEATH_TYPE.Supernova) {
      this._mort.duree = 3;
      this.glow.intensity = 1;
      this.glow.tint = [0, 0, 0];
      this.flashScreen(3, [255, 100, 100], 3, 0, t);
    } else {
      this._mort.duree = 0.3;
      this.fadeOut(0.3, t);
    }
  }

  /** Le trou noir : l'image se visse de 220 a 360 degres en deux secondes. */
  enterBlackHole(t) {
    this.twirl = { enabled: true, angle: TWIRL_START_ANGLE };
    this._twirl = { t0: t };
  }

  /** Un passage ancien : eclair BLEU, une demi-seconde pour venir, deux pour partir. */
  teleport(t) {
    this.glow.intensity = 1;
    this.glow.tint = [0, 0, 0];
    this.flashScreen(3, [100, 100, 255], 0.5, 2, t);
  }

  /** Sous l'eau, le glow se rallume aux valeurs que `Awake` avait retenues. */
  enterWater() {
    this.glow.enabled = true;
    this.glow.intensity = this.sousLEau.intensity;
    this.glow.iterations = this.sousLEau.iterations;
    this.glow.tint = this.sousLEau.tint.slice();
  }

  exitWater() { this.glow.enabled = false; }

  // --- les deux mecaniques -------------------------------------------------

  /** Fondu au noir, avec gris et vignette qui se referment avec lui. */
  fadeOut(duree, t = 0) {
    this._fade = { t0: t, duree };
    this.grayscale = { enabled: true, amount: 0 };
    this.vignette.enabled = true;
  }

  /**
   * Un eclair de couleur : le glow monte vers une teinte, puis redescend.
   *
   * L'adoucissement n'est pas le meme dans les deux sens, et c'est ce qui donne
   * sa brutalite a l'eclair : `t⁴` quand on MONTE en intensite (rien, rien,
   * rien, tout), `1 − (t−1)⁴` quand on descend (tout, puis une longue traine).
   */
  flashScreen(intensite, couleur, intro, outro, t = 0) {
    this.glow.enabled = true;
    this.glow.iterations = 10;
    this._flash = {
      t0: t,
      intensite0: this.glow.intensity,
      couleur0: this.glow.tint.slice(0, 3),
      intensite, couleur: couleur.slice(0, 3), intro, outro,
    };
  }

  // --- l'horloge -----------------------------------------------------------

  update(t) {
    if (this._twirl) {
      const s = (t - this._twirl.t0) / TWIRL_DURATION;
      this.twirl.angle = (360 - TWIRL_START_ANGLE) * s + TWIRL_START_ANGLE;
      if (this.twirl.angle >= 360) {
        this.twirl.angle = 0;
        this.twirl.enabled = false;
        this._twirl = null;
      }
    }

    if (this._flash) {
      const f = this._flash;
      let s = clamp01(f.intro > 0 ? (t - f.t0) / f.intro : 1);
      s = f.intensite > f.intensite0 ? s ** 4 : 1 - (s - 1) ** 4;
      this.glow.tint = [0, 1, 2].map((i) => lerp(f.couleur0[i], f.couleur[i], s));
      this.glow.intensity = lerp(f.intensite0, f.intensite, s);
      if (s >= 1) {
        if (f.outro > 0) this.flashScreen(1, [0, 0, 0], f.outro, 0, t);
        else { this._flash = null; this.glow.enabled = false; }
      }
    }

    if (this._fade) {
      const s = clamp01((t - this._fade.t0) / this._fade.duree);
      this.fadeFraction = s * s;
      this.grayscale.amount = s * 2;
      // Le cinquieme de puissance garde la vignette invisible presque jusqu'au
      // bout, puis la referme d'un coup : a s = 0,8 elle vaut encore 328 sur
      // 1 000, a s = 0,95 elle vaut 774.
      this.vignette.intensity = s ** 5 * 1000;
      this.vignette.chromaticAberration = s * 100;
      this.vignette.blur = s * 1000;
      if (s >= 1) this._fade = null;
    }

    // La fin de l'effet de mort est ce qui demande le flashback — et non
    // l'instant de la mort. Les cinq secondes d'asphyxie passent donc AVANT
    // que les images ne commencent.
    if (this._mort && t > this._mort.t0 + this._mort.duree) {
      this._mort = null;
      this.flashbackDemande = true;
    }
    return this;
  }
}
