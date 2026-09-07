#!/usr/bin/env python3
"""Exporte le graphe de scene complet (hierarchie + transforms + composants) en JSON.

C'est la sortie la plus utile pour une reimplementation : elle donne la
disposition reelle du systeme solaire, la hierarchie des Sector, et quel script
C# est attache a quel GameObject.

Usage: python3 tools/05_dump_scene.py [racine] -f level0 -o data/scene/level0.json
"""
import sys, os, json, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir, script_name, read_lenient


def vec(v, keys):
    if v is None:
        return None
    return [round(float(getattr(v, k, 0.0)), 6) for k in keys]


def build(env, only_file=None):
    """Indexe transforms et gameobjects, puis reconstruit l'arbre."""
    transforms, gos = {}, {}
    for o in env.objects:
        if only_file and os.path.basename(o.assets_file.name) != only_file:
            continue
        if o.type.name in ("Transform", "RectTransform"):
            transforms[o.path_id] = o
        elif o.type.name == "GameObject":
            gos[o.path_id] = o

    # composants par GameObject
    comps = collections.defaultdict(list)
    for pid, o in gos.items():
        try:
            d = o.read(check_read=False)
        except Exception:
            continue
        for c in getattr(d, "m_Component", []) or []:
            ptr = c[1] if isinstance(c, (list, tuple)) else getattr(c, "component", c)
            try:
                cd = read_lenient(ptr)
                tname = ptr.type.name if hasattr(ptr, "type") else type(cd).__name__
            except Exception:
                continue
            entry = {"type": tname}
            if tname == "MonoBehaviour":
                sn = script_name(cd)
                if sn:
                    entry["script"] = sn
                entry["enabled"] = bool(getattr(cd, "m_Enabled", 1))
            comps[pid].append(entry)

    # noeuds
    nodes, children_of, roots = {}, collections.defaultdict(list), []
    for pid, o in transforms.items():
        try:
            t = o.read(check_read=False)
        except Exception:
            continue
        go_ptr = getattr(t, "m_GameObject", None)
        go_id = getattr(go_ptr, "path_id", 0)
        try:
            go = go_ptr.read()
            name, active, layer, tag = (go.m_Name, bool(getattr(go, "m_IsActive", 1)),
                                        getattr(go, "m_Layer", 0), getattr(go, "m_TagLabel", "") or getattr(go, "m_Tag", 0))
        except Exception:
            name, active, layer, tag = "<?>", True, 0, 0

        nodes[pid] = {
            "name": name, "active": active, "layer": layer, "tag": tag,
            "t": vec(getattr(t, "m_LocalPosition", None), "xyz"),
            "r": vec(getattr(t, "m_LocalRotation", None), "xyzw"),
            "s": vec(getattr(t, "m_LocalScale", None), "xyz"),
            "components": comps.get(go_id, []),
            "children": [],
        }
        father = getattr(getattr(t, "m_Father", None), "path_id", 0)
        if father and father in transforms:
            children_of[father].append(pid)
        else:
            roots.append(pid)

    def attach(pid, depth=0):
        n = nodes[pid]
        if depth < 200:
            n["children"] = [attach(c) for c in sorted(children_of.get(pid, []))]
        return n

    return [attach(r) for r in sorted(roots)], nodes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-f", "--file", default="level0", help="fichier scene a exporter")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    data = data_dir(a.root)
    # tout charger : les PPtr MonoBehaviour -> MonoScript pointent vers sharedassets0
    print("Chargement du build complet (resolution des PPtr inter-fichiers)...")
    env = UnityPy.load(data)

    print(f"Reconstruction du graphe de {a.file}...")
    roots, nodes = build(env, only_file=a.file)

    out = a.out or f"data/scene/{a.file}.json"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w") as fh:
        json.dump({"source": a.file, "unity": UNITY_VERSION,
                   "node_count": len(nodes), "roots": roots}, fh, indent=1)

    scripts = collections.Counter(
        c["script"] for n in nodes.values() for c in n["components"] if c.get("script"))
    print(f"{len(nodes)} noeuds, {len(roots)} racines -> {out}")
    print(f"{len(scripts)} scripts C# distincts attaches. Top 20 :")
    for k, v in scripts.most_common(20):
        print(f"  {k:34s} {v}")


if __name__ == "__main__":
    main()
