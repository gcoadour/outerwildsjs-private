#!/usr/bin/env python3
"""Genere les structures des classes moteur Unity 4.1 utilisees par le pipeline.

Ce que produit cet outil n'est PAS du contenu du jeu : ce sont les definitions
de format d'Unity 4.1.2f1 -- l'ordre, le type et l'alignement des champs des
classes du moteur -- telles que publiees par le projet TypeTreeDumps
d'AssetRipper et redistribuees dans UnityPy. Le fichier obtenu est donc
versionne, contrairement a tout ce qui sort du build.

Il evite au pipeline navigateur de deviner ces dispositions : sans lui il
faudrait ecrire a la main la structure de Mesh, Texture2D ou AudioClip.

Usage: python3 tools/16_unity_types.py -o web/src/pipeline/unity/unity41-types.json
"""
import argparse
import json

from UnityPy.helpers import Tpk
from UnityPy.helpers.UnityVersion import UnityVersion

UNITY_VERSION = "4.1.2f1"

# Classes dont le pipeline a besoin. En ajouter une ne coute qu'un identifiant.
CLASSES = {
    1: "GameObject", 4: "Transform", 20: "Camera", 21: "Material",
    23: "MeshRenderer", 25: "Renderer", 26: "ParticleRenderer", 28: "Texture2D",
    33: "MeshFilter", 43: "Mesh", 48: "Shader", 49: "TextAsset",
    54: "Rigidbody", 64: "MeshCollider", 65: "BoxCollider", 74: "AnimationClip",
    81: "AudioListener", 82: "AudioSource", 83: "AudioClip", 89: "Cubemap",
    90: "Avatar", 91: "AnimatorController", 95: "Animator",
    96: "TrailRenderer", 104: "RenderSettings", 108: "Light",
    111: "Animation", 114: "MonoBehaviour", 115: "MonoScript", 119: "Projector",
    120: "LineRenderer", 128: "Font", 135: "SphereCollider",
    136: "CapsuleCollider", 137: "SkinnedMeshRenderer", 198: "ParticleSystem",
    199: "ParticleSystemRenderer", 212: "SpriteRenderer", 213: "Sprite",
}


def flatten(node, level, out):
    out.append({"m_Level": level, "m_Type": node.m_Type,
                "m_Name": node.m_Name, "m_MetaFlag": node.m_MetaFlag})
    for child in (node.m_Children or []):
        flatten(child, level + 1, out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out",
                    default="web/src/pipeline/unity/unity41-types.json")
    a = ap.parse_args()

    version = UnityVersion.from_str(UNITY_VERSION)
    trees, missing = {}, []
    for class_id, name in sorted(CLASSES.items()):
        try:
            node = Tpk.get_typetree_node(class_id, version)
        except Exception:
            missing.append(name)
            continue
        trees[name] = flatten(node, 0, [])

    with open(a.out, "w") as fh:
        json.dump({"unity": UNITY_VERSION, "source": "TypeTreeDumps (AssetRipper), via UnityPy",
                   "classes": trees}, fh, separators=(",", ":"), sort_keys=True)

    total = sum(len(v) for v in trees.values())
    print(f"{len(trees)} classes, {total} noeuds -> {a.out}")
    if missing:
        print("absentes de la version :", ", ".join(missing))


if __name__ == "__main__":
    main()
