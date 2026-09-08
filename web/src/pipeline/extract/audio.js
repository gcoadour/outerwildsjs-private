// Clips audio et carte des sources placees dans la scene.
// Portage de tools/10_audio.py.
//
// Le clip vit sur le composant Unity natif AudioSource (m_audioClip), pas sur
// le OWAudioSource du jeu : c'est ce dernier qui porte la piste de mixage
// (_track). On croise les deux via leur GameObject.

import { readAudioClip } from "../unity/classes.js";
import { round } from "./context.js";

// AudioMixer.TrackName, drapeaux binaires.
const TRACKS = { 1: "Default", 2: "Music", 4: "Ambience",
                 8: "EndTimes", 16: "Signal", 32: "Death" };

// Portees de REPLI, gardees pour le seul cas ou la source est illisible.
//
// Elles ont longtemps servi a TOUTES les sources, au motif que « Unity 4
// n'expose pas min/max distance ». C'etait vrai du pipeline Python : UnityPy
// cherchait `m_MinDistance`, or en 4.1 le champ s'appelle `MinDistance`, sans
// prefixe. Il est bien dans le type tree d'unity41-types.json, que ce pipeline
// lit directement — l'obstacle avait disparu, la note ne l'avait pas suivi.
const FALLBACK_RANGE = { Music: 0, Ambience: 150, Signal: 300, Default: 60,
                         EndTimes: 0, Death: 0, Undefined: 60 };

// AudioRolloffMode d'Unity 4.
const ROLLOFF = { 0: "logarithmic", 1: "linear", 2: "custom" };

function trackName(v) {
  if (!v) return "Undefined";
  for (const [bit, name] of Object.entries(TRACKS)) if (v & Number(bit)) return name;
  return "Undefined";
}

/** Extension deduite du format Unity ; le build n'utilise que de l'Ogg Vorbis. */
function clipExtension(format) {
  return format === 1 ? ".wav" : ".ogg";
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

  for (const o of ctx.env.objects({ type: "AudioSource", file: ctx.sceneFile })) {
    const src = ctx.readEngine(o);
    if (!src) { bump("source illisible"); continue; }
    const ptr = src.m_audioClip;
    if (!ptr || !ptr.pathId) { bump("sans clip"); continue; }

    const pid = ptr.pathId;
    if (!clipFiles.has(pid)) {
      clipFiles.set(pid, null);
      if (clipFiles.size <= maxClips) {
        const target = ctx.env.deref(ptr, o.file);
        if (target) {
          try {
            const clip = readAudioClip(target.file.reader(target), target.file);
            const bytes = clip.data !== null ? clip.data
              : target.file.resource(clip.offset, clip.size);
            if (bytes && bytes.length) {
              const safe = (clip.m_Name || `clip_${pid}`).replace(/[^\w.\- ]/g, "_").trim();
              const name = `${safe}_${pid}${clipExtension(clip.m_Format)}`;
              emit(name, bytes);
              clipFiles.set(pid, name);
              bump("clips exportes");
            } else bump("clip vide");
          } catch { bump("clip illisible"); }
        }
      }
    }
    const file = clipFiles.get(pid);
    if (!file) continue;

    const gid = src.m_GameObject ? src.m_GameObject.pathId : 0;
    const track = trackOf.get(gid) || "Undefined";
    const tx = transmitterOf.get(gid) || null;

    // Portee spatiale : celle de la SOURCE. Les rayons d'un AudioTransmitter
    // ne servent plus ici — ce sont des distances en pixels a l'ecran, lues a
    // travers la lunette, et les prendre pour des unites de monde faisait de
    // 400 px un rayon de 400 u (voir docs/09-audio.md et web/src/audio.js).
    const min = Number.isFinite(src.MinDistance) ? round(src.MinDistance, 3) : null;
    const max = Number.isFinite(src.MaxDistance) ? round(src.MaxDistance, 3) : null;
    // `Pan2D` est le nom serialise de `panLevel` : 0 rend la source purement
    // 2D, 1 la rend pleinement spatiale.
    const pan = Number.isFinite(src.Pan2D) ? round(src.Pan2D, 3) : null;
    const range = max !== null ? max : (FALLBACK_RANGE[track] ?? 60);
    if (max === null) bump("portee de repli");

    sources.push({
      name: ctx.name(gid),
      file,
      position: ctx.world(gid)[0].map((v) => round(v, 3)),
      volume: round(src.m_Volume ?? 1, 3),
      pitch: round(src.m_Pitch ?? 1, 3),
      playOnAwake: !!src.m_PlayOnAwake,
      track,
      range,
      minDistance: min,
      rolloff: ROLLOFF[src.rolloffMode] ?? null,
      panLevel: pan,
      doppler: Number.isFinite(src.DopplerLevel) ? round(src.DopplerLevel, 3) : null,
      spatial: range > 0 && (pan === null || pan > 0),
      transmitter: tx,
    });
    bump("sources placees");
  }

  // Repli : si la lecture de `Pan2D` rendait TOUTES les sources plates, le
  // portage perdrait son audio spatial d'un coup. On retombe alors sur la
  // piste, comme avant — et on le dit dans les statistiques plutot que de le
  // laisser passer pour une mesure.
  if (sources.length && !sources.some((s) => s.spatial)) {
    for (const s of sources) s.spatial = (FALLBACK_RANGE[s.track] ?? 60) > 0;
    bump("spatialisation retombee sur la piste");
  }

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, sources, stats };
}
