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

export async function loadAudioMap() {
  try {
    const res = await fetch("../data/audio/sources.json", { cache: "no-store" });
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
      if (snd && this.sources[i].playOnAwake) this._play(snd);
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
      if (mixer && this.live.has(i)) {
        const snd = this.live.get(i);
        if (snd) {
          try { snd.volume = (s.volume ?? 1) * mixer.volume(s.track); }
          catch (e) { /* certaines versions n'exposent pas le setter */ }
        }
      }
    }
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

  _spawn(i, s, p) {
    this.pending.add(i);
    const opts = {
      loop: LOOPED.has(s.track),
      volume: s.volume,
      spatialEnabled: !!s.spatial,
      spatialDistanceModel: "linear",
      spatialMaxDistance: s.range || 60,
    };
    this.B.CreateSoundAsync(s.name || `src${i}`, `../data/audio/${s.file}`, opts)
      .then((snd) => {
        this.pending.delete(i);
        if (snd && snd.spatial) {
          snd.spatial.position = new this.B.Vector3(p[0], p[1], p[2]);
        }
        this.live.set(i, snd);
        if (this.unlocked && (s.playOnAwake || LOOPED.has(s.track))) this._play(snd);
      })
      .catch(() => { this.pending.delete(i); this.failed++; });
  }

  _despawn(i) {
    const snd = this.live.get(i);
    if (snd) {
      try { snd.stop(); } catch (e) { /* deja arrete */ }
      try { snd.dispose(); } catch (e) { /* deja libere */ }
    }
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
