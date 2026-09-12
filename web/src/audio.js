// Audio spatial.
//
// Les clips et la carte des sources viennent de tools/10_audio.py, dans data/
// (non versionne). Chaque source porte sa piste de mixage (Ambience, Music,
// Signal...), son volume et une portee.
//
// API : AudioEngineV2, pas BABYLON.Sound. Depuis Babylon 8 le moteur audio
// herite n'est plus cree par le moteur de rendu — BABYLON.Engine.audioEngine
// est absent — et BABYLON.Sound ne telecharge alors AUCUN fichier, sans lever
// la moindre erreur. Le symptome est des sources creees et un silence total.
// On passe donc par CreateAudioEngineAsync / CreateSoundAsync.
//
// Deux contraintes du navigateur :
//   - l'audio reste bloque tant que l'utilisateur n'a pas interagi ; le moteur
//     n'est deverrouille qu'au premier clic ;
//   - instancier 92 sources d'un coup est inutile. Une source n'est creee que
//     lorsque l'auditeur entre dans sa portee, et liberee en sortant.

const NEAR = 1.4;          // marge d'instanciation, en multiple de la portee
const LOOPED = new Set(["Ambience", "Music", "Signal"]);

/**
 * Pistes de l'AudioMixer. Le jeu en tient six, chacune avec son volume et ses
 * fondus : `MixEndTimes` fait tomber la musique et l'ambiance a zero quand la
 * supernova arrive, `MixDeath` isole la piste de mort.
 */
export const TRACKS = ["Undefined", "Default", "Music", "Ambience",
                       "EndTimes", "Signal", "Death"];

export class AudioMixer {
  constructor() {
    this.volumes = {};
    this.fades = {};
    for (const t of TRACKS) this.volumes[t] = 1;
  }

  /** AudioTrack.FadeTo : interpolation lineaire sur la duree donnee. */
  mix(track, target, duration = 1) {
    this.fades[track] = { from: this.volumes[track] ?? 1, to: target,
                          duration: Math.max(1e-3, duration), t: 0 };
  }

  /** Toutes les pistes sauf une. */
  isolate(track, target, duration = 1) {
    for (const t of TRACKS) if (t !== track) this.mix(t, target, duration);
  }

  mixEndTimes(duration = 1) {
    this.mix("Music", 0, duration);
    this.mix("Ambience", 0, duration);
  }

  mixDeath(duration = 1) { this.isolate("Death", 0, duration); }

  reset() {
    this.fades = {};
    for (const t of TRACKS) this.volumes[t] = 1;
  }

  update(dt) {
    for (const [t, f] of Object.entries(this.fades)) {
      f.t += dt;
      const u = Math.min(1, f.t / f.duration);
      this.volumes[t] = f.from + (f.to - f.from) * u;
      if (u >= 1) delete this.fades[t];
    }
  }

  volume(track) { return this.volumes[track] ?? 1; }
}

/**
 * Emetteurs de signal.
 *
 * Correction d'une note anterieure : `_hotspotRadius` et `_falloffRadius` ne
 * sont **pas** des portees dans le monde. Ce sont des distances **en pixels a
 * l'ecran**, mesurees a travers la lunette :
 *
 *   d = distance en pixels entre le centre de l'ecran et le point projete
 *   s = clamp01(1 - (d - hotspot) / (falloff - hotspot))^2
 *   panLevel = 1 - s          la source cesse d'etre spatialisee
 *   telescope.AddSignalStrength(s)
 *
 * Autrement dit, un signal se trouve en **visant a la lunette**, et le volume
 * de la lunette est la somme des forces de tous les emetteurs vises. C'est un
 * mecanisme de jeu entier, pas une attenuation.
 */
export function signalStrength(dPixels, hotspot, falloff) {
  const s = Math.max(0, Math.min(1, 1 - (dPixels - hotspot) / (falloff - hotspot)));
  return s * s;
}

/** `_lowPassCutoff` d'un AudioTransmitter, en hertz. */
export const TRANSMITTER_LOWPASS = 1000;
/** Bande passante d'un signal parfaitement cadre : plus de filtre du tout. */
export const OPEN_BAND = 20000;

/**
 * Frequence de coupure d'un emetteur, selon la force du signal recu.
 *
 * Ce qui vient du build : le filtre, et sa valeur de 1 000 Hz. Ce qui n'en
 * vient pas : la facon dont il s'ouvre. Le rapprochement avec `panLevel`, qui
 * suit `1 - force`, dit que le signal se degage a mesure qu'on le cadre ; la
 * progression retenue ici est GEOMETRIQUE, parce qu'une octave se parcourt en
 * multipliant et non en ajoutant — a mi-course l'oreille entend bien le milieu.
 */
export function transmitterCutoff(strength, muffled = TRANSMITTER_LOWPASS,
                                  open = OPEN_BAND) {
  const s = Math.max(0, Math.min(1, strength));
  return muffled * Math.pow(open / muffled, s);
}

/**
 * Modele d'attenuation d'une source.
 *
 * Mesure sur le build : 83 sources sur 97 sont en `custom`, 14 en
 * `logarithmic`, AUCUNE en lineaire. Le portage ecrivait
 * `rolloff === "logarithmic" ? "inverse" : "linear"` : il rendait donc les 83
 * dans le seul mode que le build n'emploie jamais. Une courbe personnalisee
 * d'Unity part presque toujours d'une decroissance rapide — `inverse` en est
 * bien plus proche que `linear`.
 */
export function rolloffModel(rolloff) {
  return rolloff === "linear" ? "linear" : "inverse";
}

/**
 * Gain lu sur la courbe d'attenuation echantillonnee.
 *
 * `curve` est la table de `rolloffCustomCurve`, N valeurs regulierement
 * espacees entre `MinDistance` et `MaxDistance`. En deca du minimum le son est
 * a plein volume, au-dela du maximum on garde la derniere valeur — c'est ce
 * que fait Unity, qui ne coupe pas mais plafonne.
 *
 * A verifier sur un build : l'axe des temps de la courbe pourrait aussi bien
 * parcourir 0..`MaxDistance` que `MinDistance`..`MaxDistance`. C'est la
 * seconde lecture qui est retenue, celle que decrit docs/36-audit.md §2.6 ;
 * le controle est dans `tools/15_verify.py`, pas ici, parce qu'il demande le
 * gain REELLEMENT rendu.
 */
export function curveGain(curve, distance, minD = 1, maxD = 60) {
  if (!curve || curve.length < 2) return 1;
  const span = Math.max(1e-6, maxD - minD);
  const u = Math.max(0, Math.min(1, (distance - minD) / span));
  const x = u * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(x));
  const w = x - i;
  return curve[i] + (curve[i + 1] - curve[i]) * w;
}

export async function loadAudioMap() {
  try {
    const res = await fetch("data/audio/sources.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return (await res.json()).sources || [];
  } catch (e) {
    console.warn("data/audio/sources.json absent :", e.message);
    return [];
  }
}

export class AudioField {
  constructor(BABYLON, sources) {
    this.B = BABYLON;
    this.sources = sources;
    this.engine = null;
    this.live = new Map();
    this.asked = new Set();   // sources non spatiales explicitement demandees     // index -> son
    this.pending = new Set();  // creations en cours, pour eviter les doublons
    this.unlocked = false;
    this.failed = 0;
    this.filters = new Map();  // index -> BiquadFilterNode insere
    this.filterState = null;   // "ok" | "absent", decide au premier essai
  }

  async init() {
    if (!this.B.CreateAudioEngineAsync) {
      console.warn("API audio v2 absente de cette version de Babylon");
      return false;
    }
    try {
      this.engine = await this.B.CreateAudioEngineAsync();
      return true;
    } catch (e) {
      console.warn("moteur audio indisponible :", e.message);
      return false;
    }
  }

  /**
   * Une source creee doit-elle jouer ?
   *
   * Une seule reponse, posee ici, parce que la poser a deux endroits est
   * exactement ce qui a rendu la musique muette : `_spawn` lancait
   * `playOnAwake || LOOPED.has(track)`, et `unlock` ne relancait que
   * `playOnAwake`. Une source creee AVANT le premier clic — et tout ce qui est
   * a portee au demarrage l'est — restait donc silencieuse pour de bon.
   *
   * Ce sont les cinq sources de musique du build qui en faisaient les frais :
   * toutes a `playOnAwake` faux, toutes en boucle, toutes a portee du village
   * des la premiere image.
   */
  _shouldPlay(s) {
    return !!(s && (s.playOnAwake || LOOPED.has(s.track)));
  }

  /** Le navigateur exige un geste utilisateur avant toute lecture. */
  async unlock() {
    if (!this.engine || this.unlocked) return;
    try { await this.engine.unlockAsync(); } catch (e) { /* deja debloque */ }
    this.unlocked = true;
    for (const [i, snd] of this.live) {
      if (snd && this._shouldPlay(this.sources[i])) this._play(snd);
    }
  }

  _play(snd) {
    try { snd.play(); } catch (e) { this.failed++; }
  }

  /**
   * @param listener position de l'auditeur dans le repere courant
   * @param toFrame  decalage monde -> repere (position du corps ancre)
   */
  /**
   * @param mixer AudioMixer, dont le volume de piste multiplie celui de chaque
   *              source : c'est ainsi que la supernova coupe musique et ambiance
   */
  update(listener, toFrame, mixer = null) {
    if (!this.engine) return;
    if (this.engine.listener) {
      try {
        this.engine.listener.position =
          new this.B.Vector3(listener.x, listener.y, listener.z);
      } catch (e) { /* certaines versions n'exposent pas le setter */ }
    }

    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      const p = [s.position[0] - toFrame[0],
                 s.position[1] - toFrame[1],
                 s.position[2] - toFrame[2]];
      const d = Math.hypot(p[0] - listener.x, p[1] - listener.y, p[2] - listener.z);
      // Une source non spatiale est « toujours a portee ». Mais les six du
      // build sont des morceaux de musique declenches par evenement, tous a
      // playOnAwake false : les charger au demarrage coutait 15,1 Mo pour du
      // son que rien ne joue. On attend donc qu'on les demande.
      // `LOOPED` dit comment jouer, pas s'il faut charger : les six sources non
      // spatiales sont bien en boucle, mais toutes a playOnAwake false.
      const wanted = !s.spatial
        ? (s.playOnAwake || this.asked.has(i))
        : d < (s.range || 60) * NEAR;

      if (wanted) {
        if (this.live.has(i)) {
          const snd = this.live.get(i);
          if (snd && snd.spatial) {
            snd.spatial.position = new this.B.Vector3(p[0], p[1], p[2]);
          }
        } else if (!this.pending.has(i)) {
          this._spawn(i, s, p);
        }
      } else if (this.live.has(i)) {
        this._despawn(i);
      }
      // Volume rendu : celui de la source, module par la piste et, quand la
      // source porte une `rolloffCustomCurve`, par le gain de cette courbe a
      // la distance courante. WebAudio ne connait que trois modeles de
      // distance ; la courbe se rend donc a la main.
      if ((mixer || s.rolloffCurve) && this.live.has(i)) {
        const snd = this.live.get(i);
        if (snd) {
          let v = s.volume ?? 1;
          if (mixer) v *= mixer.volume(s.track);
          if (s.rolloffCurve) {
            v *= curveGain(s.rolloffCurve, d, s.minDistance ?? 1, s.range || 60);
          }
          try { snd.volume = v; }
          catch (e) { /* certaines versions n'exposent pas le setter */ }
        }
      }
    }
  }

  /**
   * Les sources qui jouent VRAIMENT, en coordonnees monde.
   *
   * C'est ce qui manquait au `NoiseSensor` des predateurs de Dark Bramble : le
   * bruit y etait deduit des commandes du joueur, alors que le champ audio sait
   * exactement ce qui sonne et a quelle distance ca porte.
   */
  emitters() {
    const out = [];
    for (const [i, snd] of this.live) {
      const s = this.sources[i];
      if (!s || !s.spatial) continue;
      // SoundState.Started vaut 3 ; une source creee mais muette ne fait pas
      // de bruit, et ne doit donc rien attirer.
      if (snd && snd.state !== 3) continue;
      out.push({ position: s.position, level: Math.min(1, s.volume ?? 1),
                 radius: s.range || 60, name: s.name });
    }
    return out;
  }

  /**
   * Demande une piste declenchee par evenement — musique, fin des temps.
   * Elle ne se telecharge qu'a ce moment.
   */
  cue(track) {
    let n = 0;
    for (let i = 0; i < this.sources.length; i++) {
      if (this.sources[i].track === track) { this.asked.add(i); n += 1; }
    }
    return n;
  }

  /**
   * Demande les sources dont le NOM correspond a un motif.
   *
   * Le jeu joue un son par cause de mort ; la table qui relie l'un a l'autre
   * vit dans l'assembly, pas dans les assets. Le nom de la source, lui, est la.
   */
  cueMatching(pattern) {
    let n = 0;
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      if (s.name && pattern.test(s.name)) { this.asked.add(i); n += 1; }
    }
    return n;
  }

  _spawn(i, s, p) {
    this.pending.add(i);
    // Le modele d'attenuation vient de la source : `rolloffMode` vaut
    // Logarithmic ou Linear dans le build, et WebAudio nomme le premier
    // « inverse ». Le rayon interieur est `MinDistance` — en deca, le son est
    // a plein volume ; c'est lui qui distingue une source de proximite d'une
    // ambiance qui remplit une vallee.
    const opts = {
      loop: s.loop ?? LOOPED.has(s.track),
      volume: s.volume,
      spatialEnabled: !!s.spatial,
      spatialDistanceModel: rolloffModel(s.rolloff),
      spatialMinDistance: s.minDistance ?? 1,
      spatialMaxDistance: s.range || 60,
    };
    // Une source qui porte sa propre courbe ne doit pas etre attenuee DEUX
    // fois : on met le facteur du modele a zero — `inverse` vaut alors 1
    // partout — et c'est `update` qui applique le gain de la courbe.
    if (s.rolloffCurve) opts.spatialRolloffFactor = 0;
    this.B.CreateSoundAsync(s.name || `src${i}`, `data/audio/${s.file}`, opts)
      .then((snd) => {
        this.pending.delete(i);
        if (snd && snd.spatial) {
          snd.spatial.position = new this.B.Vector3(p[0], p[1], p[2]);
        }
        this.live.set(i, snd);
        if (this.unlocked && this._shouldPlay(s)) this._play(snd);
      })
      .catch(() => { this.pending.delete(i); this.failed++; });
  }

  /**
   * Insere un passe-bas sur la sortie d'une source.
   *
   * Babylon ne publie pas de filtre : son graphe audio est prive. Mais il est
   * fait de vrais noeuds WebAudio, et le dernier de la chaine d'une source est
   * un `GainNode` relie au bus de sortie. On s'intercale entre les deux.
   *
   * Toute la manoeuvre est defensive : on ne coupe l'arete existante qu'APRES
   * avoir branche le filtre sur la destination, et le moindre accroc annule
   * tout. Une version de Babylon qui changerait sa structure interne ferait
   * donc perdre le filtre, jamais le son.
   */
  _insertFilter(snd) {
    try {
      const out = snd && snd._subGraph && snd._subGraph._outNode;
      const dest = snd && snd.outBus && snd.outBus._inNode;
      if (!out || !dest || typeof out.connect !== "function" ||
          typeof dest.connect !== "function") return null;
      const ctx = out.context;
      if (!ctx || typeof ctx.createBiquadFilter !== "function") return null;

      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = OPEN_BAND;
      f.connect(dest);
      try {
        out.disconnect(dest);
      } catch (e) {
        // l'arete attendue n'existe pas : on defait plutot que de doubler le
        // signal en ajoutant un second chemin
        f.disconnect();
        return null;
      }
      out.connect(f);
      this.filterState = "ok";
      return f;
    } catch (e) {
      this.filterState = "absent";
      return null;
    }
  }

  /**
   * Coupure passe-bas d'une source, en hertz. Sans graphe atteignable, la
   * demande est ignoree — le son reste tel quel, jamais coupe.
   */
  setLowPass(i, hz) {
    if (this.filterState === "absent") return false;
    const snd = this.live.get(i);
    if (!snd) return false;
    let f = this.filters.get(i);
    if (!f) {
      f = this._insertFilter(snd);
      if (!f) { this.filterState = this.filterState || "absent"; return false; }
      this.filters.set(i, f);
    }
    f.frequency.value = Math.max(40, Math.min(OPEN_BAND, hz));
    return true;
  }

  /**
   * Indices des sources d'un emetteur.
   *
   * L'extracteur pose `transmitter` sur la source quand elle partage son
   * GameObject avec un AudioTransmitter : c'est ce lien-la qui fait foi, le nom
   * ne servant qu'a designer lequel.
   */
  indicesNamed(name) {
    const out = [];
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      if (s.name === name && (s.transmitter || s.track === "Signal")) out.push(i);
    }
    return out;
  }

  /**
   * Applique la coupure correspondant a une force de signal, en prenant le
   * `_lowPassCutoff` de l'emetteur lui-meme quand l'extracteur l'a releve.
   */
  lowPassFor(i, strength) {
    const s = this.sources[i];
    const muffled = (s && s.transmitter && s.transmitter.lowpass) || TRANSMITTER_LOWPASS;
    return this.setLowPass(i, transmitterCutoff(strength, muffled));
  }

  _despawn(i) {
    const snd = this.live.get(i);
    if (snd) {
      try { snd.stop(); } catch (e) { /* deja arrete */ }
      try { snd.dispose(); } catch (e) { /* deja libere */ }
    }
    const f = this.filters.get(i);
    if (f) { try { f.disconnect(); } catch (e) { /* deja detache */ } }
    this.filters.delete(i);
    this.live.delete(i);
  }

  get count() { return this.live.size; }
  get playing() {
    let n = 0;
    for (const snd of this.live.values()) {
      // SoundState.Started vaut 3
      if (snd && snd.state === 3) n++;
    }
    return n;
  }
}
