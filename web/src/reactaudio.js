// Le son d'evenement : le jeu repond a ce qu'on fait.
//
// Le portage jouait des sources PLACEES — un son est quelque part, on l'entend
// en s'en approchant. Le build joue en plus des sons declenches par l'action :
// seize classes, dix-huit instances, et une couche entiere sans lecteur
// (docs/44-reste-a-migrer.md §5). Un jeu ou marcher ne fait aucun bruit n'est
// pas un jeu qu'on a joue.
//
// Les lois ci-dessous sont lues dans l'IL. Les seuils de `PlayerMovementAudio`
// ne sont serialises sur AUCUNE instance : ils viennent du constructeur, comme
// les trois secondes de `RepairVolume`, et c'est ce repli-la que l'invariant
// garde — sans quoi une extraction qui cesserait de lire les champs passerait
// en silence.
//
//   PlayerMovementAudio   marche au-dela de 0,5 u/s, course au-dela de 4,5 ;
//                         intervalle = clamp(2 / vitesse, 0,4 s, 1,5 s) ;
//                         hauteur tiree dans 1 +/- 0,4 ; volume 0,5 ;
//                         six pas de marche, six de course, trois de saut
//   TurbulenceAudio       demarre hors du liquide (densite < 5) au-dela de
//                         20 u/s ; volume vise = (v - 20) / (40 - 20), ramene
//                         a 0 sous la limite ou dans le liquide, approche par
//                         Lerp(courant, vise, 0,05) et coupe a zero
//   ThrusterAudio         poussee : fondu d'entree 0,05 s, de sortie 0,10 s ;
//                         rotation : un tir toutes les 0,2 s au plus, l'un des
//                         quatre clips, a 0,2 de volume
//   TravelMusicController joue quand le joueur est au poste de pilotage ET
//                         dans le vide ; fondus de 5 s aux deux bouts
//   EndOfTimeMusicController  sous 90 secondes restantes, fondu d'entree de
//                         2 s ; a l'explosion, fondu de sortie de 2 s
//
// La musique de voyage et celle de la fin des temps sont les deux declencheurs
// que docs/43-pnj-son-decollage.md avait releves et laisses ouverts.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Ce que le constructeur de `PlayerMovementAudio` pose, et que rien n'ecrase. */
export const FOOTSTEP = {
  walkThreshold: 0.5,
  runThreshold: 4.5,
  volume: 0.5,
  pitchVariation: 0.4,
  // clamp(2 / vitesse, min, max) : un pas toutes les 1,5 s a la limite de la
  // marche, un toutes les 0,4 s des qu'on court vite.
  numerator: 2,
  minInterval: 0.4,
  maxInterval: 1.5,
};

/** Intervalle entre deux pas, a cette vitesse au sol. */
export function footstepInterval(speed) {
  return clamp(FOOTSTEP.numerator / (speed || 1e-9),
               FOOTSTEP.minInterval, FOOTSTEP.maxInterval);
}

/**
 * Les pas.
 *
 * Etat pur : on la nourrit de la vitesse relative au sol et d'un pas de temps,
 * elle rend « walk », « run » ou rien. C'est la meme forme que le reste du
 * portage — la logique se teste sans navigateur, le son se joue ailleurs.
 */
export class Footsteps {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.since = Infinity;   // au premier pas, on ne fait pas attendre
    this.steps = 0;
  }

  /**
   * @param speed vitesse RELATIVE AU SOL : un joueur immobile dans un vaisseau
   *              qui file a 300 u/s ne fait pas de bruit de pas.
   * @returns {{kind:string, pitch:number, volume:number}|null}
   */
  update(dt, speed, grounded = true) {
    this.since += dt;
    if (!grounded || speed <= FOOTSTEP.walkThreshold) return null;
    if (this.since < footstepInterval(speed)) return null;
    this.since = 0;
    this.steps++;
    const p = FOOTSTEP.pitchVariation;
    return {
      kind: speed > FOOTSTEP.runThreshold ? "run" : "walk",
      pitch: 1 - p + 2 * p * this.rng(),
      volume: FOOTSTEP.volume,
    };
  }
}

/** Reglages de `TurbulenceAudio`, tels que l'instance les porte. */
export const TURBULENCE = { maxDensity: 5, lower: 20, upper: 40, ease: 0.05 };

/**
 * Volume VISE par le vent de course.
 *
 * Deux fois zero, et ce n'est pas la meme chose : sous la vitesse limite on ne
 * siffle pas, et dans un liquide plus dense que 5 on ne siffle pas non plus —
 * le bruit d'atmosphere n'a rien a faire sous l'eau.
 */
export function turbulenceTarget(speed, density, cfg = TURBULENCE) {
  if (density > cfg.maxDensity || speed < cfg.lower) return 0;
  return clamp((speed - cfg.lower) / (cfg.upper - cfg.lower), 0, 1);
}

/** Le vent de course, avec son approche paresseuse et sa coupure. */
export class Turbulence {
  constructor(cfg = TURBULENCE) {
    this.cfg = cfg;
    this.volume = 0;
    this.playing = false;
  }

  update(dt, speed, density) {
    // Le demarrage a sa propre condition, et elle est plus stricte que la
    // condition de volume : il faut etre HORS du liquide et au-dela de la
    // vitesse limite. Une fois lance, seul le volume decide.
    if (!this.playing) {
      if (density < this.cfg.maxDensity && speed >= this.cfg.lower) {
        this.playing = true;
        this.volume = 0;
      }
      return this.volume;
    }
    const target = turbulenceTarget(speed, density, this.cfg);
    // Lerp par image dans le build ; on garde le meme pas par image, borne
    // pour qu'une image longue ne depasse pas la cible.
    this.volume += (target - this.volume) * clamp(this.cfg.ease * (dt * 60), 0, 1);
    if (this.volume < 1e-3 && target === 0) { this.volume = 0; this.playing = false; }
    return this.volume;
  }
}

/** Fondus et cadences de `ThrusterAudio`. */
export const THRUSTER_AUDIO = {
  fadeIn: 0.05, fadeOut: 0.1, rotationalVolume: 0.2, rotationalInterval: 0.2,
  rotationalClips: 4,
};

/** Le bruit des propulseurs : un fondu pour la poussee, un tir pour la rotation. */
export class ThrusterSound {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.level = 0;          // 0 muet, 1 plein
    this.sinceRotation = THRUSTER_AUDIO.rotationalInterval;
    this.fired = null;       // index du clip tire cette image, ou null
  }

  update(dt, thrusting, rotating) {
    const target = thrusting ? 1 : 0;
    const seconds = thrusting ? THRUSTER_AUDIO.fadeIn : THRUSTER_AUDIO.fadeOut;
    const step = seconds > 0 ? dt / seconds : 1;
    this.level = target > this.level ? Math.min(target, this.level + step)
                                     : Math.max(target, this.level - step);
    this.sinceRotation += dt;
    this.fired = null;
    if (rotating && this.sinceRotation >= THRUSTER_AUDIO.rotationalInterval) {
      this.sinceRotation = 0;
      this.fired = Math.min(THRUSTER_AUDIO.rotationalClips - 1,
                            Math.floor(this.rng() * THRUSTER_AUDIO.rotationalClips));
    }
    return this.level;
  }
}

/** Duree des fondus de la musique de voyage, lue dans le constructeur. */
export const TRAVEL_FADE = 5;

/**
 * La musique de voyage : au poste de pilotage ET dans le vide.
 *
 * Les deux conditions ensemble, et c'est tout le sens du morceau : il ne joue
 * ni quand on marche dans l'espace, ni quand on pilote au ras du sol.
 */
export class TravelMusic {
  constructor(fade = TRAVEL_FADE) {
    this.fade = fade;
    this.traveling = false;
    this.volume = 0;
  }

  update(dt, atConsole, inSpace) {
    this.traveling = !!(atConsole && inSpace);
    const step = this.fade > 0 ? dt / this.fade : 1;
    this.volume = this.traveling ? Math.min(1, this.volume + step)
                                 : Math.max(0, this.volume - step);
    return this.volume;
  }
}

/** Les trois nombres de `EndOfTimeMusicController`. */
export const END_OF_TIME = { secondsRemaining: 90, fadeIn: 2, fadeOut: 2, mix: 5 };

/**
 * La musique de la fin des temps : sous quatre-vingt-dix secondes.
 *
 * Elle ne repart pas si la supernova est empechee, et elle s'efface quand
 * l'etoile explose — ce qui arrive quatre-vingt-dix secondes plus tard.
 */
export class EndOfTimeMusic {
  constructor(cfg = END_OF_TIME) {
    this.cfg = cfg;
    this.started = false;
    this.exploded = false;
    this.volume = 0;
  }

  /** Le redemarrage de la boucle rend la musique a son silence. */
  reset() { this.started = false; this.exploded = false; this.volume = 0; }

  update(dt, secondsRemaining, { prevented = false, exploded = false } = {}) {
    if (exploded) this.exploded = true;
    if (!this.started && !prevented && !this.exploded
        && secondsRemaining < this.cfg.secondsRemaining) {
      this.started = true;
    }
    const seconds = this.exploded ? this.cfg.fadeOut : this.cfg.fadeIn;
    const step = seconds > 0 ? dt / seconds : 1;
    const target = this.started && !this.exploded ? 1 : 0;
    this.volume = target > this.volume ? Math.min(target, this.volume + step)
                                       : Math.max(target, this.volume - step);
    return this.volume;
  }
}

/**
 * Charge les sons d'evenement, qui vivent dans le meme fichier que les sources
 * et les zones : ils partagent leurs clips, et l'exporter deux fois serait le
 * telecharger deux fois.
 */
export async function loadEventAudio() {
  try {
    const res = await fetch("data/audio/sources.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("sons d'evenement absents :", e.message);
    return { events: [] };
  }
}

/**
 * Les clips d'evenement, tels que l'extraction les emet.
 *
 * Rend un index par script : `clips("PlayerMovementAudio").walk` donne les six
 * fichiers de pas dans l'ordre de leurs champs. Un script pose deux fois — les
 * deux `ThrusterAudio`, celui du joueur et celui du vaisseau miniature — est
 * departage par le nom du corps porteur.
 */
export function eventAudio(audio) {
  const events = (audio && audio.events) || [];
  const byScript = new Map();
  for (const e of events) {
    if (!byScript.has(e.script)) byScript.set(e.script, []);
    byScript.get(e.script).push(e);
  }
  return {
    all: events,
    get count() { return events.length; },
    /** Les instances d'un script, la premiere d'abord. */
    of(script, body = null) {
      const list = byScript.get(script) || [];
      if (!body) return list[0] || null;
      return list.find((e) => e.body === body) || list[0] || null;
    },
    /**
     * Les fichiers d'une famille de champs, dans l'ordre : `_walk1`, `_walk2`…
     * L'ordre des numeros est celui du build, et il compte : le tirage se fait
     * dessus.
     */
    family(script, prefix, body = null) {
      const e = this.of(script, body);
      if (!e) return [];
      return Object.keys(e.clips)
        .filter((k) => k.toLowerCase().startsWith(prefix.toLowerCase()))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
        .map((k) => e.clips[k]);
    },
  };
}
