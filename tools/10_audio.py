#!/usr/bin/env python3
"""Exporte les clips audio et la carte des sources placees dans la scene.

Le clip vit sur le composant Unity natif AudioSource (m_audioClip), pas sur le
OWAudioSource du jeu : c'est ce dernier qui porte la piste de mixage (_track).
On croise les deux via leur GameObject.

Les distances d'attenuation ne sont pas exposees par UnityPy sur Unity 4. On
applique donc des portees par defaut selon la piste, sauf pour les sources
couplees a un AudioTransmitter, qui porte ses vrais rayons.

Usage: python3 tools/10_audio.py [racine] -o data/audio
"""
import sys, os, json, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir, read_lenient, world_transform, finite, safe_name
from lib_typetree import TreeCache

# AudioMixer.TrackName, drapeaux binaires
TRACKS = {0: "Undefined", 1: "Default", 2: "Music", 4: "Ambience",
          8: "EndTimes", 16: "Signal", 32: "Death"}

# portees par defaut, faute de min/max distance lisibles sur Unity 4
DEFAULT_RANGE = {"Music": 0,          # 0 = non spatialise
                 "Ambience": 150.0,
                 "Signal": 300.0,
                 "Default": 60.0,
                 "EndTimes": 0,
                 "Death": 0,
                 "Undefined": 60.0}


def track_name(v):
    if not v:
        return "Undefined"
    for bit, name in TRACKS.items():
        if bit and (v & bit):
            return name
    return "Undefined"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/audio")
    ap.add_argument("--max-clips", type=int, default=400)
    args = ap.parse_args()

    data = data_dir(args.root)
    trees = TreeCache(os.path.join(data, "Managed"), UNITY_VERSION)
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    print("Chargement du build...")
    env = UnityPy.load(data)
    objs = [o for o in env.objects if os.path.basename(o.assets_file.name) == "level0"]

    go, tr = {}, {}
    for o in objs:
        if o.type.name == "GameObject":
            try: go[o.path_id] = o.read(check_read=False)
            except Exception: pass
        elif o.type.name == "Transform":
            try:
                t = o.read(check_read=False)
                tr[getattr(t.m_GameObject, "path_id", 0)] = t
            except Exception: pass

    # OWAudioSource et AudioTransmitter, par GameObject
    track_of, transmitter_of = {}, {}
    for o in objs:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            base = o.read(check_read=False)
            cls = base.m_Script.read().m_ClassName
        except Exception:
            continue
        if cls not in ("OWAudioSource", "AudioTransmitter"):
            continue
        nodes = trees.get(cls)
        if not nodes:
            continue
        try:
            v = o.read_typetree(nodes, check_read=False)
        except Exception:
            continue
        gid = getattr(getattr(base, "m_GameObject", None), "path_id", 0)
        if cls == "OWAudioSource":
            track_of[gid] = track_name(v.get("_track"))
        else:
            transmitter_of[gid] = {
                "hotspot": v.get("_hotspotRadius"),
                "falloff": v.get("_falloffRadius"),
                "lowpass": v.get("_lowPassCutoff"),
            }

    os.makedirs(args.out, exist_ok=True)
    clip_files, cache = {}, {}
    sources, stats = [], collections.Counter()

    for o in objs:
        if o.type.name != "AudioSource":
            continue
        try:
            d = o.read(check_read=False)
        except Exception:
            stats["source illisible"] += 1
            continue
        ptr = getattr(d, "m_audioClip", None)
        if not (ptr and getattr(ptr, "path_id", 0)):
            stats["sans clip"] += 1
            continue

        pid = ptr.path_id
        if pid not in clip_files:
            if len(clip_files) >= args.max_clips:
                clip_files[pid] = None
            else:
                try:
                    clip = read_lenient(ptr)
                    written = None
                    for fname, raw in (clip.samples or {}).items():
                        ext = os.path.splitext(fname)[1] or ".ogg"
                        name = safe_name(clip, f"clip_{pid}") + f"_{pid}{ext}"
                        with open(os.path.join(args.out, name), "wb") as fh:
                            fh.write(raw)
                        written = name
                        break
                    clip_files[pid] = written
                    if written: stats["clips exportes"] += 1
                    else: stats["clip vide"] += 1
                except Exception:
                    clip_files[pid] = None
                    stats["clip illisible"] += 1
        if not clip_files[pid]:
            continue

        gid = getattr(getattr(d, "m_GameObject", None), "path_id", 0)
        t = tr.get(gid)
        pos = [round(v, 3) for v in world_transform(t, cache, ("go", gid))[0]] if t else [0, 0, 0]
        track = track_of.get(gid, "Undefined")
        tx = transmitter_of.get(gid)
        rng = tx["falloff"] if (tx and tx.get("falloff")) else DEFAULT_RANGE.get(track, 60.0)

        sources.append({
            "name": getattr(go.get(gid), "m_Name", None),
            "file": clip_files[pid],
            "position": pos,
            "volume": round(float(getattr(d, "m_Volume", 1.0) or 1.0), 3),
            "pitch": round(float(getattr(d, "m_Pitch", 1.0) or 1.0), 3),
            "playOnAwake": bool(getattr(d, "m_PlayOnAwake", False)),
            "track": track,
            "range": rng,
            "spatial": bool(rng),
            "transmitter": tx,
        })
        stats["sources placees"] += 1

    with open(os.path.join(args.out, "sources.json"), "w") as fh:
        json.dump(finite({"unity": UNITY_VERSION, "sources": sources}), fh,
                  indent=1, allow_nan=False)

    print(f"\n-> {args.out}/sources.json")
    for k, v in stats.most_common():
        print(f"  {k:22s} {v}")
    per = collections.Counter(s["track"] for s in sources)
    print("  par piste :", dict(per))


if __name__ == "__main__":
    main()
