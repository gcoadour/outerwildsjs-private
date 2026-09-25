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

// @lit PlayerMovementAudio, PlayerSubmergeAudio, ThrusterAudio, ShipThrusterAudio, PlayerImpactAudio, TurbulenceAudio, SpacesuitAudioController, RepairAudioController, UIAudioController, FlashbackAudioController, TravelMusicController, EndOfTimeMusicController, PlayerAudioEffects, PlayerDeathAudio, ShipTurbulenceAudio, ProbeLauncher, ModelShipCrashBehavior, RemoteFlightConsole, SatelliteSnapshotController, ShipComputer, AnglerfishAudioController, SupernovaVolume
// Le son d'evenement : seize classes, et une couche entiere qui manquait
// (docs/46-migration-lots.md, lot 5).

export const AUDIO_EVENTS = {
  playerEnterBlackHole: "PlayerEnterBlackHole",
  suitUp: "SuitUp",
  removeSuit: "RemoveSuit",
};

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
 *
 * `PlayRandomWalkClip` et `PlayRandomRunClip` sont `Random.Range(0, 6)` sur
 * six champs numerotes, et rien d'autre : c'est `main.js` qui tire le fichier
 * dans la famille que `kind` designe. Le VOLUME leur est passe
 * (`_footstepVolume`), la HAUTEUR non — `Update` la pose sur la source juste
 * avant l'appel, et c'est pourquoi elle sort d'ici plutot que de la.
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

/**
 * `PlayerMovementAudio.OnJump` — et il n'obeit a AUCUNE des deux regles ci-dessus.
 *
 *     audio.pitch = 1f;
 *     int i = Random.Range(0, 3);
 *     audio.PlayOneShot(_jumpN);        // sans volume
 *
 * La hauteur est REMISE A UN — un saut ne se desaccorde pas comme un pas —, et
 * le clip part a plein volume, la ou un pas sort a `_footstepVolume` (0,5).
 * Trois clips, pas six.
 *
 * Ce port n'avait aucun son de saut. `CharacterMovementModel.OnJump` est
 * l'evenement auquel `Awake` s'abonne : c'est le SAUT, pas le decollage du sac
 * dorsal, qui le declenche.
 */
export function jumpSound() {
  return { kind: "jump", pitch: 1, volume: 1 };
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
 * `SpacesuitAudioController` : le souffle du casque, hors de l'oxygene.
 *
 *     Start           loop = true ; panLevel = 0 (2D) ; Stop() ; volume local 0
 *     OnExitOxygen    FadeIn(5)       le souffle monte en cinq secondes
 *     OnEnterOxygen   FadeOut(5)      et retombe de meme
 *
 * Le portage ne jouait que le clip du plein (`_refillOxygenClip`) : la source
 * elle-meme — `SpacesuitAmbience`, posee sur `Player_Body/Audio` — n'etait
 * lancee que si l'on passait a moins de 700 unites de l'endroit ou le joueur
 * se tenait au chargement, comme un son pose dans le decor (docs/132).
 */
export const SUIT_AMBIENCE_FADE = 5;

export class SuitAmbience {
  constructor(fade = SUIT_AMBIENCE_FADE) {
    this.fade = fade;
    this.level = 0;     // `SetLocalVolume(0)` au `Start`
  }

  /** @returns le volume local, de 0 a 1 */
  update(dt, inOxygen) {
    const cible = inOxygen ? 0 : 1;
    const pas = this.fade > 0 ? dt / this.fade : 1;
    if (this.level < cible) this.level = Math.min(cible, this.level + pas);
    else if (this.level > cible) this.level = Math.max(cible, this.level - pas);
    return this.level;
  }
}

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
  const sources = (audio && audio.sources) || [];
  const byScript = new Map();
  for (const e of events) {
    if (!byScript.has(e.script)) byScript.set(e.script, []);
    byScript.get(e.script).push(e);
  }
  return {
    all: events,
    sources,
    get count() { return events.length; },
    /** Les instances d'un script, la premiere d'abord. */
    of(script, body = null) {
      const list = byScript.get(script) || [];
      if (!body) return list[0] || null;
      return list.find((e) => e.body === body) || list[0] || null;
    },
    /** Fichier d'une source placee resolu par son nom d'objet. */
    source(name) {
      const s = sources.find((x) => x.name === name);
      return (s && s.file) || null;
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

// --- ce que l'interface fait entendre (docs/77-sons.md) --------------------
//
// @lit UIAudioController, RepairAudioController, SpacesuitAudioController
//
// Huit sons d'interface, tous joues en `PlayOneShot(clip, 0.5)` — le meme
// demi-volume partout, ce qui est une decision et pas un hasard : ces sons ne
// doivent jamais couvrir le monde.
//
// Le portage n'en jouait AUCUN. Avancer un dialogue, le finir, viser un
// referentiel, le relacher, allumer sa lampe : tout cela se faisait en silence,
// et le silence d'une interface se remarque moins qu'un son manquant dans le
// monde — c'est pour cela que ce lot est arrive tard.
//
// DEUX SONS POUR VISER, ET DEUX POUR L'ETEINDRE. `_targetReferenceFrame` et
// `_untargetReferenceFrame` sont deux clips differents : verrouiller et lacher
// ne s'entendent pas pareil. La lampe, elle, partage `_switch01` dans les deux
// sens — un interrupteur fait le meme bruit a l'aller et au retour.

/** `PlayOneShot(clip, 0.5)` : le demi-volume de toute l'interface. */
export const UI_VOLUME = 0.5;

/** L'evenement du build, et le champ de clip qu'il joue. */
export const UI_SOUNDS = {
  AdvanceText: "_advanceTextClip",
  ExitDialogueMode: "_finishTextClip",
  PlayAffirmativeUISound: "_affirmative01",
  PlayNegativeUISound: "_negative01",
  PlaySuitWarningSound: "_jetpackWarning",
  TargetReferenceFrame: "_targetReferenceFrame",
  UntargetReferenceFrame: "_untargetReferenceFrame",
  TurnOnFlashlight: "_switch01",
  TurnOffFlashlight: "_switch01",
};

/** `OWAudioSource.FadeIn/FadeOut(0.2)` de la boucle de reparation. */
export const REPAIR_FADE = 0.2;

/**
 * Les sons d'interface, et ceux de la reparation.
 *
 * ON NE REPARE PAS PAREIL DANS LE VIDE. `RepairAudioController` choisit entre
 * `_repairLoop` et `_spaceRepairLoop` — puis entre `_repairFinish` et
 * `_spaceRepairFinish` — selon que le detecteur d'oxygene trouve quelque chose.
 * Reparer sa coque en apesanteur, sans air, ne fait pas le meme bruit que la
 * reparer posee au village, et le build a enregistre les deux.
 */
export class UISounds {
  constructor(events = null) {
    this.events = events;
    this.loop = null;      // le clip de boucle en cours, ou null
  }

  clipRegex(script, regex, body = null) {
    if (!this.events) return null;
    const e = this.events.of(script, body);
    if (!e || !e.clips) return null;
    const key = Object.keys(e.clips).find(k => regex.test(k));
    return key ? e.clips[key] : null;
  }

  /** Le fichier d'un champ de clip sur un script donne, ou null. */
  clip(script, champ, body = null) {
    if (!this.events) return null;
    const e = this.events.of(script, body);
    return (e && e.clips && e.clips[champ]) || null;
  }

  /**
   * @returns {{file:string, volume:number}|null} le coup a jouer, ou null
   */
  fire(evenement) {
    const champ = UI_SOUNDS[evenement];
    if (!champ) return null;
    const f = this.clip("UIAudioController", champ);
    return f ? { file: f, volume: UI_VOLUME } : null;
  }

  /**
   * La boucle de reparation : elle MONTE, elle ne claque pas.
   *
   * @param oxygene le detecteur d'oxygene trouve-t-il quelque chose
   * @returns {{file:string, fade:number}|null}
   */
  startRepair(oxygene) {
    const f = this.clip("RepairAudioController",
                        oxygene ? "_repairLoop" : "_spaceRepairLoop");
    this.loop = f || null;
    return f ? { file: f, fade: REPAIR_FADE } : null;
  }

  stopRepair() {
    const f = this.loop;
    this.loop = null;
    return f ? { file: f, fade: REPAIR_FADE } : null;
  }

  /** La fin : la boucle s'ARRETE net, et un coup la remplace. */
  finishRepair(oxygene) {
    this.loop = null;
    const f = this.clip("RepairAudioController",
                        oxygene ? "_repairFinish" : "_spaceRepairFinish");
    return f ? { file: f, volume: 1 } : null;
  }

  /** `OnRefillOxygen` : le plein d'oxygene s'entend, et a plein volume. */
  refillOxygen() {
    const f = this.clip("SpacesuitAudioController", "_refillOxygenClip");
    return f ? { file: f, volume: 1 } : null;
  }

  /** L'entree dans l'eau : clip deduit par son nom de champ. */
  enterWater() {
    const f = this.clipRegex("PlayerSubmergeAudio", /submerge/i);
    return f ? { file: f, volume: 1 } : null;
  }

  /** La sortie de l'eau. */
  exitWater() {
    const f = this.clipRegex("PlayerSubmergeAudio", /emerge/i);
    return f ? { file: f, volume: 1 } : null;
  }

  /** Le son de la sequence de mort (flashback). */
  flashback() {
    const f = this.clipRegex("FlashbackAudioController", /.*/);
    return f ? { file: f, volume: 1 } : null;
  }

  /** Le son d'enfilage de la combinaison (PlayerAudioEffects._suitUpSound). */
  suitUp() {
    const f = this.clip("PlayerAudioEffects", "_suitUpSound");
    return f ? { file: f, volume: 0.7 } : null;
  }

  /** Le son de retrait de la combinaison (PlayerAudioEffects._removeSuitSound). */
  removeSuit() {
    const f = this.clip("PlayerAudioEffects", "_removeSuitSound") || this.clip("PlayerAudioEffects", "_suitUpSound");
    return f ? { file: f, volume: 0.7 } : null;
  }

  /** Le son d'aspiration dans le trou noir (PlayerAudioEffects._blackHoleWarp). */
  blackHoleWarp() {
    const f = this.clip("PlayerAudioEffects", "_blackHoleWarp");
    return f ? { file: f, volume: 0.5 } : null;
  }

  /**
   * Son d'allumage du vaisseau (ShipThrusterAudio._ignitionClip).
   * Relie a ShipThrusterAudio.PlayThrusters et ShipThrusterAudio.StopThrusters.
   */
  shipIgnition() {
    const f = this.clip("ShipThrusterAudio", "_ignitionClip");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Son d'impact du joueur (PlayerImpactAudio). */
  playerImpact(speed, isFeetLanding = false, alea = Math.random) {
    const champ = playerImpactSound(speed, isFeetLanding, alea);
    if (!champ) return null;
    const f = this.clip("PlayerImpactAudio", champ);
    return f ? { file: f, volume: Math.min(1, Math.max(0.2, speed / 30)) } : null;
  }

  /** Son de degustation de guimauve (Marshmallow: chomp). */
  eatMarshmallow() {
    const f = (this.events && this.events.source && this.events.source("Marshmallow"))
           || this.clip("Marshmallow", "_eatClip");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Son d'ouverture de la carte du systeme (MapCamera: MapZoomOut_Tone). */
  mapZoom() {
    const f = (this.events && this.events.source && this.events.source("MapCamera"))
           || this.clip("MapController", "_mapClip");
    return f ? { file: f, volume: 0.8 } : null;
  }

  /** Son d'atterrissage sur un pad (LandingPadSensor._touchdownSound). */
  touchdown() {
    const f = this.clip("LandingPadSensor", "_touchdownSound");
    return f ? { file: f, volume: 0.8 } : null;
  }

  /**
   * Son d'impact de la coque du vaisseau (ShipDamageController).
   * Niveau 1: choc leger (_lightImpactClip), niveau 2: choc moyen (_mediumImpactClip).
   */
  shipImpact(level) {
    if (level === 2) {
      const f = this.clip("ShipDamageController", "_mediumImpactClip");
      return f ? { file: f, volume: 0.9 } : null;
    }
    if (level === 1) {
      const f = this.clip("ShipDamageController", "_lightImpactClip");
      return f ? { file: f, volume: 0.7 } : null;
    }
    return null;
  }

  /** Son d'explosion du vaisseau (ShipExplosion: HullImpact_Explosion_Fiery). */
  shipExplosion() {
    const f = (this.events && this.events.source && this.events.source("ShipExplosion"));
    return f ? { file: f, volume: 1 } : null;
  }

  /** Son d'attache au poste de pilotage (FlightConsole._buckleUpSound). */
  buckleUp() {
    const f = this.clip("FlightConsole", "_buckleUpSound");
    return f ? { file: f, volume: 0.85 } : null;
  }

  /** Son de detachement du poste de pilotage (FlightConsole._unbuckleSound). */
  unbuckle() {
    const f = this.clip("FlightConsole", "_unbuckleSound");
    return f ? { file: f, volume: 0.85 } : null;
  }

  /**
   * Son de mort du joueur (PlayerDeathAudio.OnPlayerDeath).
   * Asphyxie : clip long _asphyxiationClip, fondu a mi-chemin (1,5 s).
   * Autres causes : clip _instantDeathClip ou _energyDeathClip, fondu 0,2 s.
   */
  death(cause) {
    if (cause === "asphyxie") {
      const f = this.clip("PlayerDeathAudio", "_asphyxiationClip");
      return f ? { file: f, volume: 1, fade: 1.5 } : null;
    }
    const f = this.clip("PlayerDeathAudio", "_instantDeathClip")
           || this.clip("PlayerDeathAudio", "_energyDeathClip");
    return f ? { file: f, volume: 1, fade: 0.2 } : null;
  }

  /**
   * Son de tir de la sonde (ProbeLauncher.LaunchProbe).
   * Basse puissance : _slowLaunchSound. Haute puissance : _fastLaunchSound.
   */
  probeLaunch(highPower = false) {
    const f = this.clip("ProbeLauncher", highPower ? "_fastLaunchSound" : "_slowLaunchSound");
    return f ? { file: f, volume: 0.9 } : null;
  }

  /** Son de rappel de la sonde (ProbeLauncher.Update : _retrievalSound). */
  probeRetrieve() {
    const f = this.clip("ProbeLauncher", "_retrievalSound");
    return f ? { file: f, volume: 0.85 } : null;
  }

  /**
   * Son de declencheur photo (SatelliteSnapshotController.RenderSnapshot, ProbeCamera.Update).
   */
  cameraShutter() {
    const f = this.clip("ProbeCamera", "_snapshotSound")
           || this.clip("SatelliteSnapshotController", "_snapshotSound");
    return f ? { file: f, volume: 0.8 } : null;
  }

  // @vide ProbeCamera._discoverySound est nul dans level0 et PointOfInterest.CaughtOnCamera est un bouchon vide
  probeDiscovery() {
    const f = this.clip("ProbeCamera", "_discoverySound");
    return f ? { file: f, volume: 0.8 } : null;
  }

  /** Son de demarrage de l'ordinateur de bord (ShipComputer.EnterShipComputer : _bootClip). */
  shipComputerBoot() {
    const f = this.clip("ShipComputer", "_bootClip");
    return f ? { file: f, volume: 0.85 } : null;
  }

  /** Son de crash du vaisseau miniature (ModelShipCrashBehavior.OnImpact : _crashSound). */
  modelShipCrash() {
    const f = this.clip("ModelShipCrashBehavior", "_crashSound");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Son de reinitialisation du modele (RemoteFlightConsole.RespawnModelShip : _respawnAudioClip). */
  modelShipRespawn() {
    const f = this.clip("RemoteFlightConsole", "_respawnAudioClip");
    return f ? { file: f, volume: 0.5 } : null;
  }

  /** Son d'effondrement du noyau solaire (SupernovaVolume.OnTriggerSupernova : _coreCollapse). */
  supernovaCollapse() {
    const f = this.clip("SupernovaVolume", "_coreCollapse");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Son d'explosion solaire (SupernovaVolume.OnSunExploded : _solarExplosion). */
  supernovaExplosion() {
    const f = this.clip("SupernovaVolume", "_solarExplosion");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Onde de choc de supernova (SupernovaVolume.OnSunExploded : _energyWave). */
  supernovaWave() {
    const f = this.clip("SupernovaVolume", "_energyWave");
    return f ? { file: f, volume: 0.9 } : null;
  }

  /** Boucle de sommeil/attente du cœlacanthe (AnglerfishAudioController.Awake : _lurkingLoop). */
  anglerLurking() {
    const f = this.clip("AnglerfishAudioController", "_lurkingLoop");
    return f ? { file: f, volume: 0.9 } : null;
  }

  /** Cri de trouble du coelacanthe (AnglerfishAudioController.OnChangeAnglerState : _detectDisturbance). */
  anglerDisturbance() {
    const f = this.clip("AnglerfishAudioController", "_detectDisturbance");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Cri de cible detectee (AnglerfishAudioController.OnChangeAnglerState : _detectTarget). */
  anglerTarget() {
    const f = this.clip("AnglerfishAudioController", "_detectTarget");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Boucle de poursuite haletante (AnglerfishAudioController.OnChangeAnglerState : _chasingLoop). */
  anglerChase() {
    const f = this.clip("AnglerfishAudioController", "_chasingLoop");
    return f ? { file: f, volume: 1 } : null;
  }

  /** Morsure croquante du predateur (AnglerfishAudioController._crunchSound). */
  anglerCrunch() {
    const f = this.clip("AnglerfishAudioController", "_crunchSound");
    return f ? { file: f, volume: 1 } : null;
  }
}

/**
 * Reglages des deux composantes de ShipTurbulenceAudio :
 * - ShipRattleAudio : vibration metallique de la coque
 * - TurbulenceAudio sur Ship_Body : vent atmospherique autour du vaisseau
 */
export function shipTurbulence(ev) {
  if (!ev) return null;
  const all = ev.all || [];
  const rattle = all.find((e) => e.script === "ShipTurbulenceAudio" && e.name === "ShipRattleAudio");
  const wind = all.find((e) => e.script === "ShipTurbulenceAudio" && e.name === "TurbulenceAudio");
  return {
    rattle: rattle ? {
      clip: rattle.clips._turbulenceClip,
      lower: rattle.params._lowerSpeedLimit ?? 40,
      upper: rattle.params._upperSpeedLimit ?? 60,
      ease: rattle.params._easeRate ?? 0.1,
      maxDensity: rattle.params._maxDensity ?? 5,
    } : null,
    wind: wind ? {
      clip: wind.clips._turbulenceClip,
      lower: wind.params._lowerSpeedLimit ?? 20,
      upper: wind.params._upperSpeedLimit ?? 80,
      ease: wind.params._easeRate ?? 0.05,
      maxDensity: wind.params._maxDensity ?? 5,
    } : null,
  };
}

export const IMPACT_AUDIO = {
  minSpeed: 3,
  landingSpeed: 20,
  mediumSpeed: 30,
};

/**
 * Selection de clip d'impact selon la vitesse et l'axe (PlayerImpactAudio.OnImpact).
 */
export function playerImpactSound(speed, isFeetLanding = false, alea = Math.random) {
  if (speed <= IMPACT_AUDIO.minSpeed) return null;
  const idx = Math.min(2, Math.floor(alea() * 3)) + 1;
  if (speed <= IMPACT_AUDIO.landingSpeed) {
    return isFeetLanding ? `_landingImpact${idx}` : `_lightImpact${idx}`;
  }
  if (speed <= IMPACT_AUDIO.mediumSpeed) {
    return `_mediumImpact${idx}`;
  }
  return "_heavyImpact";
}
