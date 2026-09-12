// Clips audio et carte des sources placees dans la scene.
// Portage de tools/10_audio.py.
//
// Le clip vit sur le composant Unity natif AudioSource (m_audioClip), pas sur
// le OWAudioSource du jeu : c'est ce dernier qui porte la piste de mixage
// (_track). On croise les deux via leur GameObject.

import { readAudioClip } from "../unity/classes.js";
import { aiffToWav } from "../audioenc.js";
import { round } from "./context.js";

// AudioMixer.TrackName, drapeaux binaires.
const TRACKS = { 1: "Default", 2: "Music", 4: "Ambience",
                 8: "EndTimes", 16: "Signal", 32: "Death" };

// Portees de repli, employees seulement si la source ne porte pas de
// MaxDistance lisible.
//
// Correction. Ces valeurs etaient jusqu'ici la regle et non l'exception, au
// motif qu'« Unity 4 n'expose pas min/max distance ». C'etait vrai du pipeline
// Python : UnityPy cherchait `m_MinDistance`, or en 4.1 le champ s'appelle
// `MinDistance`, sans prefixe. Il est dans le type tree de unity41-types.json,
// que le pipeline navigateur lit directement — l'obstacle avait disparu, la
// note ne l'avait pas suivi. Voir docs/09-audio.md.
const DEFAULT_RANGE = { Music: 0, Ambience: 150, Signal: 300, Default: 60,
                        EndTimes: 0, Death: 0, Undefined: 60 };

// AudioRolloffMode { Logarithmic, Linear, Custom }
const ROLLOFF = { 0: "logarithmic", 1: "linear", 2: "custom" };

/**
 * Echantillonne une `rolloffCustomCurve`.
 *
 * 83 des 97 sources placees sont en attenuation `custom` — le mode dont le
 * portage ne lisait rien, et qu'il rendait en LINEAIRE, le seul que le build
 * n'emploie jamais (docs/36-audit.md §1.3). La courbe est une AnimationCurve
 * dont le temps parcourt 0..1 entre `MinDistance` et `MaxDistance` et dont la
 * valeur est le gain. On la transporte echantillonnee : le moteur n'a pas
 * besoin des tangentes, seulement du gain a une distance donnee.
 */
function rolloffCurve(ac, n = 9) {
  const keys = (ac && (ac.m_Curve || ac.curve || ac)) || null;
  if (!Array.isArray(keys) || keys.length < 2) return null;
  const pts = keys
    .filter((k) => k && typeof k.time === "number" && typeof k.value === "number")
    .map((k) => [k.time, k.value])
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const span = (t1 - t0) || 1;
  const at = (u) => {
    const t = t0 + u * span;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a[0] <= t && t <= b[0]) {
        const w = (t - a[0]) / ((b[0] - a[0]) || 1);
        return a[1] + (b[1] - a[1]) * w;
      }
    }
    return pts[pts.length - 1][1];
  };
  const out = [];
  for (let i = 0; i < n; i++) out.push(round(at(i / (n - 1)), 4));
  // Une courbe plate n'apprend rien : le modele de distance suffit alors.
  return out.some((v) => Math.abs(v - out[0]) > 1e-4) ? out : null;
}

function trackName(v) {
  if (!v) return "Undefined";
  for (const [bit, name] of Object.entries(TRACKS)) if (v & Number(bit)) return name;
  return "Undefined";
}

/**
 * Conteneur d'un clip.
 *
 * CORRECTION, et elle rendait un clip sur deux inecoutable. L'extension etait
 * deduite de `m_Format` — `.wav` s'il vaut 1, `.ogg` sinon — et `m_Format` ne
 * dit RIEN du conteneur. Mesure sur les 142 AudioClip du build :
 *
 *   m_Format=2 m_Type=14  OggS   n=28      m_Format=2 m_Type=2   FORM   n=1
 *   m_Format=2 m_Type=20  RIFF   n=109     m_Format=3 m_Type=20  RIFF   n=4
 *
 * `m_Format` est un FMOD_SOUND_FORMAT : la profondeur des echantillons (2 pour
 * du 16 bits, 3 pour du 24). Il vaut 2 pour de l'Ogg, du WAV et de l'AIFF
 * indifferemment. Le conteneur est dans `m_Type`, qui est l'AudioType d'Unity :
 * 2 = AIFF, 14 = Ogg Vorbis, 20 = WAV.
 *
 * Consequences de l'erreur, toutes mesurees : 20 clips sur 36 partaient sous
 * `.ogg` en etant du RIFF ou de l'AIFF, le Service Worker leur posait donc un
 * `Content-Type: audio/ogg` faux, et surtout le reencodage Opus du worker —
 * qui filtre sur `/\.wav$/` — ne trouvait JAMAIS de fichier a reencoder. Les
 * « 15 Mo de WAV » que docs/27-poids.md voulait economiser ne l'etaient pas.
 *
 * Les octets tranchent en dernier ressort : un en-tete se lit, une enumeration
 * se fait confiance.
 */
const AUDIO_TYPE = { 2: "aiff", 14: "ogg", 20: "wav" };

export function sniffContainer(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) === "OggS") return "ogg";
  if (tag(0) === "RIFF" && tag(8) === "WAVE") return "wav";
  if (tag(0) === "FORM" && (tag(8) === "AIFF" || tag(8) === "AIFC")) return "aiff";
  return null;
}

export function clipContainer(clip, bytes) {
  return sniffContainer(bytes) || AUDIO_TYPE[clip && clip.m_Type] || "ogg";
}

/**
 * @param {ExtractContext} ctx
 * @param {(path: string, bytes: Uint8Array) => void} emit  ecrit un fichier
 */
export function extractAudio(ctx, emit, { maxClips = 400 } = {}) {
  const trackOf = new Map();
  const transmitterOf = new Map();
  for (const { obj, cls } of ctx.behaviours(["OWAudioSource", "AudioTransmitter"])) {
    const f = ctx.scriptFields(obj);
    if (!f) continue;
    const gid = ctx.ownerId(obj);
    if (cls === "OWAudioSource") trackOf.set(gid, trackName(f._track));
    else transmitterOf.set(gid, { hotspot: f._hotspotRadius ?? null,
                                  falloff: f._falloffRadius ?? null,
                                  lowpass: f._lowPassCutoff ?? null });
  }

  const clipFiles = new Map();
  const sources = [];
  const stats = {};
  const bump = (k) => { stats[k] = (stats[k] || 0) + 1; };

  /**
   * Exporte le clip vise par un pointeur, une seule fois, et rend son nom de
   * fichier.
   *
   * Extrait de la boucle des sources pour servir aussi aux volumes
   * d'ambiance : le clip d'un `AudioVolume` n'est PAS sur l'`AudioSource` de
   * son objet — celle-ci est serialisee sans clip, et c'est le volume qui le
   * lui pose a l'execution. Apparier les deux par GameObject rendait donc
   * dix-sept volumes muets, ce qui s'est vu a la premiere mesure.
   */
  function exportClip(ptr, file) {
    if (!ptr || !ptr.pathId) return null;
    const pid = ptr.pathId;
    if (!clipFiles.has(pid)) {
      clipFiles.set(pid, null);
      if (clipFiles.size <= maxClips) {
        const target = ctx.env.deref(ptr, file);
        if (target) {
          try {
            const clip = readAudioClip(target.file.reader(target), target.file);
            const bytes = clip.data !== null ? clip.data
              : target.file.resource(clip.offset, clip.size);
            if (bytes && bytes.length) {
              let container = clipContainer(clip, bytes);
              let out = bytes;
              // Un AIFF ne se decode dans AUCUN navigateur. Celui du build est
              // du PCM non compresse : le convertir en WAV ne coute que de
              // retourner les octets, et c'est la difference entre un son et
              // un silence. Si la conversion echoue, on garde l'original —
              // mal nomme, il resterait muet, mais nomme juste il reste au
              // moins diagnosticable.
              if (container === "aiff") {
                const wav = aiffToWav(bytes);
                if (wav) { out = wav; container = "wav"; bump("AIFF convertis en WAV"); }
                else bump("AIFF non convertible");
              }
              const safe = (clip.m_Name || `clip_${pid}`).replace(/[^\w.\- ]/g, "_").trim();
              const name = `${safe}_${pid}.${container}`;
              emit(name, out);
              clipFiles.set(pid, name);
              bump(`clips ${container}`);
              bump("clips exportes");
            } else bump("clip vide");
          } catch { bump("clip illisible"); }
        }
      }
    }
    return clipFiles.get(pid);
  }

  for (const o of ctx.env.objects({ type: "AudioSource", file: ctx.sceneFile })) {
    const src = ctx.readEngine(o);
    if (!src) { bump("source illisible"); continue; }
    const ptr = src.m_audioClip;
    if (!ptr || !ptr.pathId) { bump("sans clip"); continue; }

    const file = exportClip(ptr, o.file);
    if (!file) continue;

    const gid = src.m_GameObject ? src.m_GameObject.pathId : 0;
    const track = trackOf.get(gid) || "Undefined";
    const tx = transmitterOf.get(gid) || null;

    // La portee vient de la SOURCE, pas de la piste ni de l'emetteur. Les
    // rayons d'un AudioTransmitter sont des distances en PIXELS a l'ecran,
    // mesurees a la lunette : les prendre pour des unites de monde faisait
    // porter HarmonicaSignal a 400 unites au lieu de sa vraie portee.
    const maxD = Number.isFinite(src.MaxDistance) ? src.MaxDistance : null;
    const minD = Number.isFinite(src.MinDistance) ? src.MinDistance : null;
    // Pan2D vaut 1 pour un son entierement 2D : une source non spatialisee.
    const flat = Number.isFinite(src.Pan2D) && src.Pan2D >= 1;
    const range = maxD !== null ? maxD : (DEFAULT_RANGE[track] ?? 60);
    if (maxD === null) bump("portee de repli");

    sources.push({
      name: ctx.name(gid),
      file,
      position: ctx.world(gid)[0].map((v) => round(v, 3)),
      volume: round(src.m_Volume ?? 1, 3),
      pitch: round(src.m_Pitch ?? 1, 3),
      playOnAwake: !!src.m_PlayOnAwake,
      loop: !!src.Loop,
      track,
      range,
      minDistance: minD !== null ? round(minD, 3) : null,
      rolloff: ROLLOFF[src.rolloffMode] || null,
      rolloffCurve: rolloffCurve(src.rolloffCustomCurve),
      doppler: Number.isFinite(src.DopplerLevel) ? round(src.DopplerLevel, 3) : null,
      spatial: !flat && !!range,
      transmitter: tx,
    });
    bump("sources placees");
  }

  // --- ambiances par zone ---
  //
  // Quatorze `AudioVolume` et trois `DayNightAudioVolume`, jamais lus. Ce ne
  // sont pas des sources de plus : ce sont des zones qui ARBITRENT. Chaque
  // volume porte une couche (`_layer`) et une priorite (`_priority`), et dans
  // une couche donnee c'est la priorite la plus forte parmi les zones ou l'on
  // se trouve qui joue — le reste se tait, en fondu de `_fadeSeconds`.
  //
  // Deux choses mesurees ici, et toutes deux prises a l'envers au premier
  // essai :
  //
  //   - le clip est vise par `_clip`, et l'`AudioSource` de l'objet est
  //     serialisee SANS clip. Chercher le fichier par GameObject rendait les
  //     dix-sept volumes muets ;
  //   - la forme n'est pas sur l'objet du volume mais sur ses ENFANTS, qui
  //     portent les `EntrywayTrigger` auxquels il s'abonne. Six volumes sur
  //     dix-sept n'avaient donc aucune portee.
  const volumes = [];
  const scene = ctx.env.get(ctx.sceneFile);

  /** Formes des declencheurs poses sous un objet, la premiere qui en a une. */
  function volumeSousEnfants(gid) {
    const t = ctx.transformOf.get(gid);
    if (!t || !t.m_Children) return null;
    for (const ptr of t.m_Children) {
      const o = ctx.env.deref(ptr, scene);
      if (!o) continue;
      const child = ctx.readEngine(o);
      const cgid = child && child.m_GameObject ? child.m_GameObject.pathId : 0;
      if (!cgid) continue;
      const v = ctx.volumeOf(cgid);
      if (v) return v;
    }
    return null;
  }

  for (const { obj, cls } of ctx.behaviours(["AudioVolume", "DayNightAudioVolume"])) {
    const f = ctx.scriptFields(obj);
    if (!f) continue;
    const gid = ctx.ownerId(obj);
    const [pos, rot] = ctx.world(gid);
    const e = {
      name: ctx.name(gid),
      kind: cls,
      position: pos.map((v) => round(v, 3)),
      rotation: rot.map((v) => Math.round(v * 1e6) / 1e6),
      file: exportClip(f._clip, obj.file),
      layer: f._layer ?? 0,
      priority: f._priority ?? 0,
      fade: f._fadeSeconds ?? 2,
      randomize: !!f._randomizePlayhead,
      pauseOnFadeOut: !!f._pauseOnFadeOut,
    };
    const vol = ctx.volumeOf(gid) || volumeSousEnfants(gid);
    if (vol) e.volume = vol;
    else bump("volume d'ambiance sans forme");
    if (cls === "DayNightAudioVolume") {
      e.dayWindow = f._dayWindow ?? 200;
      e.usePlayerPosition = !!f._usePlayerPosition;
      e.nightFile = exportClip(f._nightClip, obj.file);
    }
    if (!e.file) bump("volume d'ambiance sans clip");
    volumes.push(e);
    bump("volumes d'ambiance");
  }

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, sources, volumes, stats };
}
