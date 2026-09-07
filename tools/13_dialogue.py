#!/usr/bin/env python3
"""Convertit les arbres de dialogue XML en JSON, et les relie aux personnages.

Schema releve sur les 73 TextAsset :

    <dialogueTree>            racine, 25 fichiers
      <branch id="..">        noeud a options (13 fichiers)
        <talk>                replique
        <options>
          <option goto="..">  choix du joueur, saut vers une branche
      <convo id="..">         noeud simple, sans options (12 fichiers)
        <talk>
    <OWConversation>          variante avec <characters> (1 fichier)

Les 47 autres TextAsset ne sont pas des dialogues : ce sont les textes bruts
des objets lisibles.

Le texte est du contenu narratif du jeu : la sortie va dans data/, non
versionne. Cet outil n'extrait que la structure et le texte tel quel, sans
transformation.

Usage: python3 tools/13_dialogue.py [racine] -o data/dialogue
"""
import sys, os, json, argparse, collections
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir, read_lenient, world_transform, safe_name, finite
from lib_typetree import TreeCache


def text_of(el):
    """Texte d'un noeud, espaces normalises."""
    return " ".join((el.text or "").split()) or None


def parse_branch(el):
    """Analyse un <branch> ou un <convo> : meme forme, le second sans options."""
    node = {"id": el.get("id"), "eventbased": el.get("eventbased") == "true",
            "kind": el.tag.lower(), "talk": [], "options": []}
    for child in el:
        tag = child.tag.lower()
        if tag == "talk":
            t = text_of(child)
            if t:
                node["talk"].append(t)
        elif tag == "options":
            for opt in child:
                node["options"].append({
                    "text": text_of(opt),
                    "goto": opt.get("goto"),
                })
        elif tag == "option":
            node["options"].append({"text": text_of(child), "goto": child.get("goto")})
    return node


def parse_tree(xml):
    """Retourne {start, branches:{id:branch}, characters:[...]} ou None."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None

    branches, characters, start = {}, [], None

    def walk(el):
        nonlocal start
        tag = el.tag.lower()
        if tag in ("branch", "convo"):
            b = parse_branch(el)
            if b["id"]:
                branches[b["id"]] = b
            if el.get("start") == "true" and start is None:
                start = b["id"]
            return
        if tag == "character":
            n = el.get("name")
            if n:
                characters.append(n)
        for child in el:
            walk(child)

    walk(root)
    if start is None and branches:
        start = next(iter(branches))
    return {"start": start, "branches": branches, "characters": characters}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/dialogue")
    args = ap.parse_args()

    data = data_dir(args.root)
    trees_gen = TreeCache(os.path.join(data, "Managed"), UNITY_VERSION)
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    print("Chargement du build...")
    env = UnityPy.load(data)

    # tous les TextAsset, par path_id
    raw = {}
    for o in env.objects:
        if o.type.name != "TextAsset":
            continue
        try:
            d = o.read(check_read=False)
            s = d.m_Script
            raw[o.path_id] = (d.m_Name, s if isinstance(s, str) else s.decode("utf8", "replace"))
        except Exception:
            pass

    # arbres analysables
    parsed, stats = {}, collections.Counter()
    for pid, (name, xml) in raw.items():
        t = parse_tree(xml)
        if t and t["branches"]:
            parsed[pid] = {"name": name, **t}
            stats["arbres"] += 1
            stats["branches"] += len(t["branches"])
            stats["repliques"] += sum(len(b["talk"]) for b in t["branches"].values())
            stats["options"] += sum(len(b["options"]) for b in t["branches"].values())
        else:
            stats["non analysable"] += 1

    # composants Conversation : position, personnage, arbre associe
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

    cache, convos = {}, []
    for o in objs:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            base = o.read(check_read=False)
            if base.m_Script.read().m_ClassName != "Conversation":
                continue
            nodes = trees_gen.get("Conversation")
            v = o.read_typetree(nodes, check_read=False)
        except Exception:
            continue
        gid = getattr(getattr(base, "m_GameObject", None), "path_id", 0)
        ref = (v.get("_activeDialogueTree") or {}).get("m_PathID")
        t = tr.get(gid)
        convos.append({
            "name": getattr(go.get(gid), "m_Name", None),
            "character": v.get("_characterName") or None,
            "isMuseumSign": bool(v.get("_isMuseumSign")),
            "position": [round(x, 3) for x in world_transform(t, cache, ("go", gid))[0]] if t else [0, 0, 0],
            "tree": ref if ref in parsed else None,
        })
    stats["conversations"] = len(convos)
    stats["conversations liees"] = sum(1 for c in convos if c["tree"])

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "dialogue.json"), "w") as fh:
        json.dump(finite({"unity": UNITY_VERSION,
                          "trees": {str(k): v for k, v in parsed.items()},
                          "conversations": convos}), fh, indent=1, allow_nan=False)

    print(f"\n-> {args.out}/dialogue.json")
    for k, v in stats.most_common():
        print(f"  {k:22s} {v}")


if __name__ == "__main__":
    main()
