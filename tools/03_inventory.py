#!/usr/bin/env python3
"""Inventaire du build : compte les objets par type et par fichier.

Usage: python3 tools/03_inventory.py [racine_du_build] [-o sortie.json]
"""
import sys, os, json, collections, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, DATA_FILES, data_dir


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/inventory.json")
    a = ap.parse_args()

    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    data = data_dir(a.root)
    report, grand = {}, collections.Counter()

    for f in DATA_FILES:
        path = os.path.join(data, f)
        if not os.path.exists(path):
            continue
        env = UnityPy.load(path)
        c = collections.Counter(o.type.name for o in env.objects)
        grand.update(c)
        report[f] = {"total": sum(c.values()), "by_type": dict(c.most_common())}
        print(f"{f:24s} {sum(c.values()):6d} objets")

    report["_total"] = {"total": sum(grand.values()), "by_type": dict(grand.most_common())}
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(report, fh, indent=2)
    print(f"\n{sum(grand.values())} objets au total -> {a.out}")
    for k, v in grand.most_common(15):
        print(f"  {k:26s} {v}")


if __name__ == "__main__":
    main()
