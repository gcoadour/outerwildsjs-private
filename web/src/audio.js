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
 * AudioRolloffMode d'Unity -> modele de distance WebAudio.
 *
 * Une courbe personnalisee (`custom`) n'a pas d'equivalent : on retombe sur le
 * lineaire, qui est la plus proche des deux du point de vue de la portee — au
 * moins le son s'eteint bien a MaxDistance.
 */
const DISTANCE_MODEL = { logarithmic: "inverse", linear: "linear", custom: "linear" };

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
    this.noise = 0;            // niveau de bruit du champ, 0 a 1
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

  /** Le navigateur exige un geste utilisateur avant toute lecture. */
  async unlock() {
    if (!this.engine || this.unlocked) return;
    try { await this.engine.unlockAsync(); } catch (e) { /* deja debloque */ }
    this.unlocked = true;
    for (const [i, snd] of this.live) {
      if (snd && (this.sources[i].playOnAwake || this.asked.has(i))) this._play(snd);
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
    // Niveau de bruit du champ, recalcule a chaque passe (voir `noise`).
    let noise = 0;
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
      if (mixer && this.live.has(i)) {
        const snd = this.live.get(i);
        if (snd) {
          try { snd.volume = (s.volume ?? 1) * mixer.volume(s.track); }
          catch (e) { /* certaines versions n'exposent pas le setter */ }
        }
      }
      // Ce qui joue VRAIMENT, et a quelle distance : c'est le bruit que la
      // zone fait, et que les predateurs de Dark Bramble devraient entendre.
      if (wanted && this.live.has(i) && s.spatial) {
        const range = s.range || 60;
        if (d < range) noise = Math.max(noise, (s.volume ?? 1) * (1 - d / range));
      }
    }
    this.noise = noise;
  }

  /**
   * Niveau de bruit du champ, de 0 a 1.
   *
   * Le `NoiseSensor` du jeu ecoute le monde ; le portage le nourrissait des
   * COMMANDES du joueur — avancer, pousser les reacteurs — c'est-a-dire de son
   * intention, pas du son. Le champ audio, lui, sait exactement quelles sources
   * vivent et a quelle distance. Le jour ou l'on peut se trahir en laissant
   * tourner un poste de radio, la zone change de nature.
   */
  get noiseLevel() { return this.noise || 0; }

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
   * Demande le son de mort correspondant a une cause.
   *
   * La piste `Death` du mixeur existe dans le build ; ce qui n'y est pas, c'est
   * le lien entre une cause et un clip. On cherche donc d'abord un clip de
   * cette piste dont le NOM parle de la cause, et l'on retombe sur n'importe
   * quel clip de la piste — mourir en silence est le seul resultat qu'on ne
   * veuille pas.
   *
   * @param pattern expression a chercher dans le nom, ou null
   * @returns l'indice demande, ou -1
   */
  cueDeath(pattern = null) {
    let fallback = -1;
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      if (s.track !== "Death") continue;
      if (pattern && pattern.test(s.name || s.file || "")) {
        this.asked.add(i);
        return i;
      }
      if (fallback < 0) fallback = i;
    }
    if (fallback >= 0) this.asked.add(fallback);
    return fallback;
  }

  _spawn(i, s, p) {
    this.pending.add(i);
    const opts = {
      loop: LOOPED.has(s.track),
      volume: s.volume,
      spatialEnabled: !!s.spatial,
      // Le modele vient de `rolloffMode` : le logarithmique d'Unity est le
      // modele « inverse » de WebAudio, ou le son garde sa pleine intensite
      // jusqu'a MinDistance puis decroit. Sans rolloff lu, on garde le lineaire
      // qui servait a tout le monde.
      spatialDistanceModel: DISTANCE_MODEL[s.rolloff] || "linear",
      spatialMinDistance: s.minDistance ?? 1,
      spatialMaxDistance: s.range || 60,
    };
    this.B.CreateSoundAsync(s.name || `src${i}`, `data/audio/${s.file}`, opts)
      .then((snd) => {
        this.pending.delete(i);
        if (snd && snd.spatial) {
          snd.spatial.position = new this.B.Vector3(p[0], p[1], p[2]);
        }
        this.live.set(i, snd);
        // Une piste DEMANDEE doit jouer. Sans `this.asked`, une source
        // declenchee par evenement — la musique de fin des temps, le son de
        // mort — se telechargeait a la demande puis restait muette : ni
        // `playOnAwake`, ni une piste en boucle, donc aucune raison de partir.
        if (this.unlocked &&
            (s.playOnAwake || LOOPED.has(s.track) || this.asked.has(i))) {
          this._play(snd);
        }
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
