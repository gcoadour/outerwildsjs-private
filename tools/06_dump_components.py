#!/usr/bin/env python3
"""Extrait les VALEURS des champs serialises de tous les MonoBehaviour.

C'est la sortie la plus precieuse pour une reimplementation : elle contient les
donnees de gameplay reglees a la main (poussee des reacteurs, rayons et masses
des corps, parametres d'orbite, volumes de gravite, declencheurs...).

Usage: python3 tools/06_dump_components.py [racine] -f level0 -o data/components/level0.json
"""
import sys, os, json, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir
from lib_typetree import TreeCache


def jsonable(v, depth=0):
    """Rend lisible en JSON : PPtr -> reference, objets UnityPy -> dict."""
    if depth > 12:
        return "<...>"
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    if isinstance(v, (bytes, bytearray)):
        return {"__bytes__": len(v)}
    if isinstance(v, dict):
        if set(v) == {"m_FileID", "m_PathID"}:
            return None if v["m_PathID"] == 0 else {"$ref": v["m_PathID"], "file": v["m_FileID"]}
        return {k: jsonable(x, depth + 1) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [jsonable(x, depth + 1) for x in v]
    return str(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-f", "--file", default="level0")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    data = data_dir(a.root)
    managed = os.path.join(data, "Managed")
    print("Generation des type trees depuis les assemblies (backend AssetRipper)...")
    trees = TreeCache(managed, UNITY_VERSION)

    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    print("Chargement du build...")
    env = UnityPy.load(data)

    out_objs = []
    stats = collections.Counter()
    missing = collections.Counter()
    errors = collections.Counter()

    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        if a.file and os.path.basename(o.assets_file.name) != a.file:
            continue
        try:
            base = o.read(check_read=False)
            cls = base.m_Script.read().m_ClassName
        except Exception as e:
            errors[f"script:{type(e).__name__}"] += 1
            continue

        nodes = trees.get(cls)
        if not nodes:
            missing[cls] += 1
            continue
        try:
            vals = o.read_typetree(nodes, check_read=False)
        except Exception as e:
            errors[f"{cls}:{type(e).__name__}"] += 1
            continue

        fields = {k: jsonable(v) for k, v in vals.items() if not k.startswith("m_")}
        out_objs.append({
            "path_id": o.path_id,
            "script": cls,
            "game_object": getattr(getattr(base, "m_GameObject", None), "path_id", 0),
            "fields": fields,
        })
        stats[cls] += 1

    out = a.out or f"data/components/{a.file}.json"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w") as fh:
        json.dump({"source": a.file, "unity": UNITY_VERSION,
                   "count": len(out_objs), "components": out_objs}, fh, indent=1)

    total = len(out_objs) + sum(missing.values()) + sum(errors.values())
    print(f"\n{len(out_objs)}/{total} MonoBehaviour lus avec valeurs -> {out}")
    print(f"{len(stats)} classes distinctes")
    if missing:
        print(f"sans type tree : {sum(missing.values())} ({len(missing)} classes) "
              f"{[c for c, _ in missing.most_common(6)]}")
    if errors:
        print(f"erreurs : {sum(errors.values())} {[k for k, _ in errors.most_common(6)]}")
    print("\nTop classes :")
    for k, v in stats.most_common(15):
        print(f"  {k:32s} {v}")


if __name__ == "__main__":
    main()
