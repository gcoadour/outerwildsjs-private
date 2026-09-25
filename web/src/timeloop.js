// Boucle temporelle.
//
// @lit TimeLoop
// @lit SupernovaVolume
//
// Trois nombres avaient ete ecrits de memoire, et deux etaient faux
// (docs/88-boucle.md) :
//
//   - la duree de boucle vaut **18** minutes, pas 20 : `TimeLoop` est pose sur
//     `SolarSystemRoot` avec `_loopDurationInMinutes = 18`, et le portage
//     l'avait devinee au lieu de la lire ;
//   - l'onde de choc n'est pas LINEAIRE. `SupernovaVolume.Update` pose
//
//         t = (now - _initSupernovaTime) / 15
//         localScale = one * 2 * 30000 * pow(t, 3)
//
//     soit, pour une sphere de rayon 0,5, un rayon de 30 000 x (t/15)^3. Les
//     deux courbes se rejoignent a quinze secondes et nulle part ailleurs : a
//     mi-chemin, la vraie onde est a 3 750 unites quand la lineaire est a
//     15 000. On a quelques secondes de calme trompeur, puis tout arrive d'un
//     coup — et c'est la toute la sensation de la fin des temps ;
//   - la musique de fin a 90 secondes restantes, elle, etait juste.
//
// Et le chronometre de l'onde part de `SunExploded`, PAS de `TriggerSupernova`.
// Entre les deux, l'etoile s'effondre : `SupernovaVolume` joue son
// `_coreCollapse` au premier evenement et son `_solarExplosion` au second.

/** Repli explicite : la valeur MESUREE dans la scene, si l'extraction manque. */
export const LOOP_MINUTES = 18;
export const SHOCKWAVE_SECONDS = 15;         // duree de la course de l'onde
export const SHOCKWAVE_RADIUS = 30000;       // rayon atteint au bout des 15 s
export const END_MUSIC_AT = 90;              // secondes restantes

/**
 * `SupernovaVolume.Update` : le rayon de l'onde, t secondes apres l'explosion.
 *
 * Cubique, pas lineaire. Ecrit a part pour etre eprouve seul.
 */
export function shockwaveRadius(elapsed) {
  if (!(elapsed > 0)) return 0;
  const t = Math.min(1, elapsed / SHOCKWAVE_SECONDS);
  return SHOCKWAVE_RADIUS * t * t * t;
}

/**
 * L'effondrement de l'etoile, entre `TriggerSupernova` et `SunExploded`.
 *
 * Le portage faisait partir les deux annonces ensemble, « faute de connaitre
 * la duree de l'effondrement », et contractait l'etoile pendant les douze
 * DERNIERES secondes de la boucle, avant meme l'annonce. L'IL la donne :
 *
 *   Start              : _endScale = localScale x 0,03, et l'ecoute
 *                        de `TriggerSupernova` (que `OnDestroy` retire)
 *   OnTriggerSupernova : _superNovaTriggered = vrai
 *   Update             : localScale = Lerp(localScale, _endScale, 3 x dt)
 *                        si x < 150 : echelle nulle, Detonator.Explode,
 *                        `SunExploded`
 *
 * La surface est a 4 000 : a soixante images par seconde, elle passe sous 150
 * en 1,6 s. `ShrinkSunBehavior` fait de meme pour la couronne (362,2) a
 * `deltaTime` seul, et s'arrete sous 50 — en 2,2 s. Le pas est celui de
 * l'image, comme dans le build : l'effondrement depend de la cadence, et
 * `Vector3.Lerp` borne son facteur a 1.
 */
// @lit SunExplosionBehavior
// @lit ShrinkSunBehavior
export const EFFONDREMENT_SURFACE = { taux: 0.03, vitesse: 3, seuil: 150, echelle: 4000 };
export const EFFONDREMENT_COURONNE = { taux: 0.03, vitesse: 1, seuil: 50, echelle: 362.2121 };

export class Effondrement {
  /** @param p `{ taux, vitesse, seuil, echelle }` ; `echelle` vient du build */
  constructor(p = EFFONDREMENT_SURFACE) {
    this.p = p;
    this.echelle = p.echelle;
    this.fin = p.echelle * p.taux;
    this.fini = false;
  }

  /** L'echelle rapportee a celle du depart : 1, puis vers 0,03, puis 0. */
  get fraction() { return this.echelle / this.p.echelle; }

  /** @returns vrai a l'image ou l'echelle passe sous le seuil */
  update(dt) {
    if (this.fini) return false;
    const t = Math.min(1, Math.max(0, dt * this.p.vitesse));
    this.echelle += (this.fin - this.echelle) * t;
    if (this.echelle < this.p.seuil) {
      this.echelle = 0;
      this.fini = true;
      return true;
    }
    return false;
  }
}

/**
 * Les deux effondrements, a l'echelle que la scene leur donne.
 *
 * L'echelle de depart est lue dans `level0` (`localScale` du GameObject) ; le
 * taux, la vitesse et le seuil sont des constantes d'IL.
 */
export function effondrementsDuBuild(gameplay) {
  const p = (gameplay && gameplay.placed) || {};
  const lire = (cls, repli) => {
    const e = (p[cls] || [])[0];
    return e && e.localScale > 0 ? { ...repli, echelle: e.localScale } : repli;
  };
  return { surface: lire("SunExplosionBehavior", EFFONDREMENT_SURFACE),
           corona: lire("ShrinkSunBehavior", EFFONDREMENT_COURONNE) };
}

/**
 * La sphere de l'observatoire qui remet la simulation a zero.
 *
 * @lit ResetSimulationTrigger
 *
 * Une sphere de 5,2 posee a l'observatoire de Timber Hearth, et deux lignes
 * d'IL qui disent une chose etrange tant qu'on ne les lit pas ensemble :
 *
 *   Awake                      : collider DESACTIVE
 *   OnStartOfTimeLoop(n)       : si n == 1 ET qu'on ignore les codes ->
 *                                collider active
 *   OnTriggerEnter(joueur)     : si on CONNAIT les codes -> ResetSimulation()
 *
 * Armee quand on ne sait pas, elle ne tire que quand on sait. Autrement dit :
 * elle attend, au premier tour d'une partie neuve, qu'on soit alle apprendre
 * les codes de lancement — et le pas qui vous ramene a l'observatoire remet la
 * simulation a zero. C'est le geste qui fait COMMENCER la partie, et il tient
 * avec l'invulnerabilite du premier tour (docs/81) et la fin des temps
 * suspendue (docs/88) : trois mecaniques pour une seule idee.
 *
 * Le build recharge la scene ; ce portage n'a pas de rechargement, et enchaine
 * donc `ResetSimulation` et le `ResumeSimulation` qui aurait suivi.
 */
export class ResetTrigger {
  constructor(volume = null) {
    this.volume = volume;
    // `Awake` : le collider nait desactive.
    this.armed = false;
    this.fired = false;
  }

  /** `OnStartOfTimeLoop` : l'arme, et seulement au premier tour sans codes. */
  startOfTimeLoop(loopCount, knowsLaunchCodes) {
    if (loopCount === 1 && !knowsLaunchCodes) this.armed = true;
    return this.armed;
  }

  /**
   * `OnTriggerEnter` : dedans, avec les codes.
   * @returns vrai si la simulation doit etre remise a zero
   */
  enter(inside, knowsLaunchCodes) {
    if (!this.armed || !inside || !knowsLaunchCodes) return false;
    this.armed = false;
    this.fired = true;
    return true;
  }
}

export class TimeLoop {
  constructor(minutes = LOOP_MINUTES) {
    this.duration = minutes * 60;
    // Les annonces du build, dans l'ordre ou elles partent.
    this.events = [];
    this.timeScale = 1;          // accelere la boucle pour les verifications
    this.loopCount = 0;
    // TimeLoop.GetPreventSupernova : le jeu sait suspendre la fin des temps.
    // Le compte a rebours continue, mais l'etoile n'explose pas — c'est ce qui
    // permet une scene qui doit se jouer jusqu'au bout.
    this.preventSupernova = false;
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.triggerAt = null;       // `TriggerSupernova`, en temps de boucle
    this.effondrement = null;    // la surface qui s'effondre, entre les deux
    this.couronne = null;        // et la couronne, qui la suit
    this.supernovaAt = null;     // `SunExploded` : l'onde part de la
    this.dead = false;
    this.deathCause = null;
  }

  /**
   * `TimeLoop.Start`.
   *
   * Il ne se contente pas d'annoncer : il RECALCULE `_preventSupernova` a
   * partir des codes de lancement. Tant qu'on ne les connait pas, l'etoile
   * n'explose pas — le compte a rebours tourne, mais la fin des temps attend
   * que la partie ait commence. C'est la meme idee que l'invulnerabilite du
   * premier tour (docs/81), et le portage n'en avait ni l'une ni l'autre.
   */
  start(knowsLaunchCodes = true) {
    this.events.push("StartOfTimeLoop");
    this.preventSupernova = !knowsLaunchCodes;
  }

  /** `TimeLoop.RestartTimeLoop`, puis un nouveau `Start`. */
  restart(knowsLaunchCodes = true) {
    this.loopCount += 1;
    this.reset();
    this.events.push("RestartTimeLoop");
    this.start(knowsLaunchCodes);
  }

  /**
   * `TimeLoop.Start` quand `_startTimeLoopOnReload` est faux : on REPREND.
   *
   * Ce cas n'arrive qu'apres un `ResetSimulation`, qui remet le drapeau a faux
   * — la statique, elle, nait a VRAI. Le tout premier chargement d'une partie
   * passe donc par `Start`, pas par `resume`, et c'est ce qui donne a la
   * premiere boucle sa protection.
   */
  resume() { this.events.push("ResumeSimulation"); }

  /** `TimeLoop.ResetSimulation` : on repart de zero, boucle comprise. */
  resetSimulation() {
    this.preventSupernova = false;
    this.loopCount = 0;
    this.reset();
    this.events.push("ResetSimulation");
  }

  get secondsRemaining() { return Math.max(0, this.duration - this.elapsed); }
  get fraction() { return Math.min(1, this.elapsed / this.duration); }
  get supernova() { return this.supernovaAt !== null; }
  /** Entre `TriggerSupernova` et `SunExploded` : l'etoile s'effondre. */
  get collapsing() { return this.triggerAt !== null && this.supernovaAt === null; }
  /**
   * `EndOfTimeMusicController.Update`, dans l'ordre exact ou il teste.
   *
   * Il commence par `GetPreventSupernova` et s'arrete la si c'est vrai : la
   * boucle protegee — celle ou l'on n'a pas les codes — n'a PAS de musique de
   * fin des temps, et le portage l'ignorait. Le reste est le seuil de
   * quatre-vingt-dix secondes, borne stricte (`bge.un` saute a l'egalite).
   */
  get endMusic() {
    return !this.preventSupernova && this.secondsRemaining < END_MUSIC_AT;
  }

  /** Rayon atteint par l'onde de choc depuis le centre de l'etoile. */
  get shockwaveRadius() {
    if (!this.supernova) return 0;
    return shockwaveRadius(this.elapsed - this.supernovaAt);
  }

  /**
   * @param sunDistance distance du joueur au centre de l'etoile
   * @returns "supernova" au moment ou l'onde rattrape le joueur, sinon null
   */
  update(dt, sunDistance) {
    if (this.dead) return null;
    this.elapsed += dt * this.timeScale;

    // `TimeLoop.Update` : l'annonce part UNE fois, et le composant se coupe.
    if (this.triggerAt === null && this.elapsed >= this.duration && !this.preventSupernova) {
      this.triggerAt = this.elapsed;
      this.effondrement = new Effondrement(this.surface || EFFONDREMENT_SURFACE);
      this.couronne = new Effondrement(this.corona || EFFONDREMENT_COURONNE);
      this.events.push("TriggerSupernova");
    }
    // `ShrinkSunBehavior.Update` : la couronne, a son propre pas, qui survit
    // a l'explosion de la surface d'une demi-seconde.
    if (this.couronne) this.couronne.update(dt * this.timeScale);
    // `SunExplosionBehavior.Update` : la surface s'effondre au pas de l'image,
    // et c'est son passage sous le seuil qui annonce `SunExploded` — lui qui
    // lance l'onde (`SunSphereOfDeathBehavior.OnSunExploded`).
    if (this.collapsing && this.effondrement.update(dt * this.timeScale)) {
      this.supernovaAt = this.elapsed;
      this.events.push("SunExploded");
    }
    if (this.supernova && sunDistance != null &&
        this.shockwaveRadius >= sunDistance) {
      this.dead = true;
      this.deathCause = "supernova";
      return "supernova";
    }
    return null;
  }

  kill(cause) {
    if (this.dead) return;
    this.dead = true;
    this.deathCause = cause;
  }

  /** mm:ss, ou l'etat de supernova. */
  get label() {
    if (this.supernova) {
      return `SUPERNOVA — onde a ${Math.round(this.shockwaveRadius)} u`;
    }
    const s = Math.floor(this.secondsRemaining);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
}
