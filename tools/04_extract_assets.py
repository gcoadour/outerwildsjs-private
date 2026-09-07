#!/usr/bin/env python3
"""Extrait les assets exploitables du build : textures, meshes, audio, textes, shaders.

  textures -> PNG          meshes -> OBJ
  audio    -> .ogg/.wav    TextAsset -> fichier brut
  Material / Shader / AnimationClip -> listing JSON

Usage: python3 tools/04_extract_assets.py [racine] -o data/assets --types Texture2D,Mesh
"""
import sys, os, json, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir, safe_name

DEFAULT_TYPES = "Texture2D,Mesh,AudioClip,TextAsset,Font,Material,Shader"


def uniq(path):
    """Evite d'ecraser deux assets homonymes."""
    if not os.path.exists(path):
        return path
    stem, ext = os.path.splitext(path)
    i = 1
    while os.path.exists(f"{stem}_{i}{ext}"):
        i += 1
    return f"{stem}_{i}{ext}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/assets")
    ap.add_argument("--types", default=DEFAULT_TYPES)
    a = ap.parse_args()

    wanted = set(a.types.split(","))
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    env = UnityPy.load(data_dir(a.root))

    stats, errors, manifest = collections.Counter(), collections.Counter(), []

    for obj in env.objects:
        t = obj.type.name
        if t not in wanted:
            continue
        try:
            d = obj.read()
            name = safe_name(d, f"{t}_{obj.path_id}")
            outdir = os.path.join(a.out, t)
            os.makedirs(outdir, exist_ok=True)
            dest = None

            if t == "Texture2D":
                dest = uniq(os.path.join(outdir, name + ".png"))
                d.image.save(dest)
            elif t == "Mesh":
                dest = uniq(os.path.join(outdir, name + ".obj"))
                with open(dest, "w", encoding="utf8", newline="") as fh:
                    fh.write(d.export())
            elif t == "AudioClip":
                for fname, raw in d.samples.items():
                    dest = uniq(os.path.join(outdir, safe_name(d, name) + os.path.splitext(fname)[1]))
                    with open(dest, "wb") as fh:
                        fh.write(raw)
            elif t == "TextAsset":
                dest = uniq(os.path.join(outdir, name + ".txt"))
                raw = d.m_Script
                with open(dest, "wb") as fh:
                    fh.write(raw.encode("utf8", "surrogateescape") if isinstance(raw, str) else raw)
            elif t == "Font":
                dest = uniq(os.path.join(outdir, name + ".ttf"))
                with open(dest, "wb") as fh:
                    fh.write(d.m_FontData or b"")
            else:
                # Material / Shader : on ne sort que les metadonnees
                dest = None

            stats[t] += 1
            manifest.append({"type": t, "name": name, "path_id": obj.path_id,
                             "file": os.path.basename(obj.assets_file.name),
                             "out": os.path.relpath(dest, a.out) if dest else None})
        except Exception as e:
            errors[f"{t}:{type(e).__name__}"] += 1

    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)

    print("Extraits :")
    for k, v in stats.most_common():
        print(f"  {k:14s} {v}")
    if errors:
        print("Echecs :")
        for k, v in errors.most_common(10):
            print(f"  {k:40s} {v}")
    print(f"-> {a.out}/manifest.json ({len(manifest)} entrees)")


if __name__ == "__main__":
    main()
