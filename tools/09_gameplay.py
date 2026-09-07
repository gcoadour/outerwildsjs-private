#!/usr/bin/env python3
"""Extrait les donnees de gameplay restantes : vaisseau, ressources du joueur,
objets interactifs, textes lisibles, secteurs.

Complete 07_solar_system.py, qui ne couvre que les corps celestes.

Les textes (invites d'interaction, objets lisibles, dialogues) sont du contenu
narratif du jeu : ils sortent dans data/, qui n'est pas versionne.

Usage: python3 tools/09_gameplay.py [racine] -o data/gameplay.json
"""
import sys, os, json, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir, read_lenient, world_transform, finite
from lib_typetree import TreeCache

SINGLETONS = ["PlayerResources", "JetpackThrusterModel", "ShipThrusterModel",
              "ThrusterModel", "ShipDamageController", "PlayerCharacterController",
              "Autopilot", "ShipBody", "PlayerBody"]
PLACED = ["InteractReceiver", "ReadableObject", "PlanetoidSector",
          "OWAudioSource", "Conversation", "AudioTransmitter", "SpawnPoint",
          "QuantumMoon", "QuantumOrbit", "QuantumFogBoundary", "FogVolume",
          "FogLight", "MakeChildrenBreakable", "SectorData",
          "DetachableFragment", "BlackHoleVolume", "WhiteHoleVolume",
          "BrambleManager", "AnglerfishController", "FogCloak"]


def vec(v):
    if v is None:
        return None
    return [round(float(getattr(v, k, 0.0)), 4) for k in "xyz"]


def plain(v, depth=0, names=None):
    """Valeurs serialisables ; les PPtr deviennent une simple reference.

    Quand la table `names` est fournie, un PPtr qui pointe vers un objet nomme
    emporte aussi son nom. Un identifiant nu ne dit rien a la lecture : c'est
    ainsi qu'on apprend qu'un FogLight affiche « AnglerfishLure » plutot que
    « EscapePodBeacon », ce qui est toute la difference entre un phare et un
    piege.
    """
    if depth > 8:
        return None
    if isinstance(v, (str, bool, int)) or v is None:
        return v
    if isinstance(v, float):
        return v if v == v and abs(v) != float("inf") else None
    if isinstance(v, dict):
        if set(v) >= {"m_FileID", "m_PathID"}:
            pid = v["m_PathID"]
            if not pid:
                return None
            ref = {"$ref": pid}
            nm = (names or {}).get(pid)
            if nm:
                ref["name"] = nm
            return ref
        return {k: plain(x, depth + 1, names) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [plain(x, depth + 1, names) for x in v]
    return str(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/gameplay.json")
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

    # position monde : rotations et echelles parentes comprises
    cache = {}
    def world(gid):
        t = tr.get(gid)
        if t is None:
            return [0.0, 0.0, 0.0]
        p = world_transform(t, cache, ("go", gid))[0]
        return [round(v, 4) for v in p]

    # textes des TextAsset, pour les objets lisibles
    texts = {}
    for o in env.objects:
        if o.type.name != "TextAsset":
            continue
        try:
            d = o.read(check_read=False)
            raw = d.m_Script
            texts[o.path_id] = raw if isinstance(raw, str) else raw.decode("utf8", "replace")
        except Exception: pass

    # Noms des assets referencables : textures, maillages, materiaux. Sert a
    # rendre lisibles les PPtr des champs serialises (voir plain()).
    asset_names = {}
    for o in env.objects:
        if o.type.name not in ("Texture2D", "Mesh", "Material", "AudioClip"):
            continue
        try:
            asset_names[o.path_id] = o.read(check_read=False).m_Name
        except Exception:
            pass

    # OWRigidbody -> nom du GameObject, pour resoudre les references entre
    # composants (_attachedBody d'une orbite quantique, par exemple)
    rb_owner = {}
    for o in objs:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            base = o.read(check_read=False)
            if base.m_Script.read().m_ClassName != "OWRigidbody":
                continue
            g_ = getattr(base.m_GameObject, "path_id", 0)
            if g_ in go:
                rb_owner[o.path_id] = go[g_].m_Name
        except Exception:
            pass

    singles, placed = {}, collections.defaultdict(list)
    for o in objs:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            base = o.read(check_read=False)
            cls = base.m_Script.read().m_ClassName
        except Exception:
            continue
        if cls not in SINGLETONS and cls not in PLACED:
            continue
        nodes = trees.get(cls)
        if not nodes:
            continue
        try:
            v = o.read_typetree(nodes, check_read=False)
        except Exception:
            continue
        fields = {k: plain(x, 0, asset_names)
                  for k, x in v.items() if not k.startswith("m_")}
        gid = getattr(getattr(base, "m_GameObject", None), "path_id", 0)
        name = getattr(go.get(gid), "m_Name", None)

        if cls in SINGLETONS and cls not in singles:
            singles[cls] = {"name": name, "position": world(gid), "fields": fields}
        if cls in PLACED:
            entry = {"name": name, "position": world(gid), "fields": fields}
            # references vers un corps : on remplace le pointeur par son nom
            for k, v in list(fields.items()):
                if isinstance(v, dict) and "$ref" in v and v["$ref"] in rb_owner:
                    entry.setdefault("refs", {})[k] = rb_owner[v["$ref"]]
            # texte des objets lisibles, resolu depuis le TextAsset
            if cls == "ReadableObject":
                ref = (fields.get("_displayTextAsset") or {})
                if isinstance(ref, dict) and ref.get("$ref") in texts:
                    entry["text"] = texts[ref["$ref"]]
                elif fields.get("_displayText"):
                    entry["text"] = fields["_displayText"]
            # Les fiches de l'ordinateur de bord : sept notices, une par lieu,
            # qui ne se lisent qu'apres avoir explore l'endroit.
            if cls == "SectorData":
                ref = (fields.get("_description") or {})
                if isinstance(ref, dict) and ref.get("$ref") in texts:
                    entry["text"] = texts[ref["$ref"]]
            placed[cls].append(entry)

    out = {"unity": UNITY_VERSION,
           "singletons": singles,
           "placed": {k: v for k, v in placed.items()}}
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w") as fh:
        json.dump(finite(out), fh, indent=1, allow_nan=False)

    print(f"\n-> {args.out}")
    print(f"{len(singles)} systemes uniques : {', '.join(sorted(singles))}")
    for k, v in sorted(placed.items()):
        extra = ""
        if k == "ReadableObject":
            extra = f", {sum(1 for x in v if x.get('text'))} avec texte"
        print(f"  {k:20s} {len(v):4d} places{extra}")


if __name__ == "__main__":
    main()
