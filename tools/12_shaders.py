#!/usr/bin/env python3
"""Exporte les sources ShaderLab et les classe.

Sur ce build Unity 4, 121 shaders sur 122 gardent leur source ShaderLab
lisible : c'est de la traduction, pas de la retro-ingenierie de bytecode.

Mais l'immense majorite sont des shaders Unity STANDARD, embarques par le
moteur. Les reecrire n'aurait aucun sens : un materiau Babylon equivalent fait
le travail. Seuls les shaders ecrits par l'equipe meritent une reecriture.

Le tri se fait sur deux signaux : le nom (familles Unity connues) et la taille
(un shader standard embarque des centaines de variantes compilees et pese des
centaines de Ko ; un shader ecrit a la main est petit).

Les sources sortent dans data/shaders/, non versionne : c'est du code du jeu.
Le rapport de classification, lui, n'est que des metadonnees.

Usage: python3 tools/12_shaders.py [racine] -o data/shaders
"""
import sys, os, re, json, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir, safe_name, finite

# familles de shaders livrees avec Unity 4
BUILTIN_PATTERNS = [
    r"^(Diffuse|Bumped|Specular|Transparent|Unlit|VertexLit|Skybox|Decal)",
    r"^(Particle|Particles)", r"^(Alpha|AlphaTest|Illumin|Reflect|Self-Illumin)",
    r"^(Normal-|Mobile/|Legacy|Nature/|FX/|Toon/|Sprites|UI/|Hidden/)",
    r"^(Internal-|Camera-|Shadow-)", r"WavingGrass", r"^Blend$",
    r"(DepthOfField|SunShafts|Tonemapper|NoiseAndGrain|GlowEffect|"
    r"ChromaticAberration|HollywoodFlares|BloomAndLensFlares)",
    r"^(FirstPass|AddPass)$",
]
BUILTIN = re.compile("|".join(BUILTIN_PATTERNS), re.I)

# gros = beaucoup de variantes compilees = shader du moteur
SIZE_HINT = 120_000


def classify(name, size):
    """Le NOM prime sur la taille.

    Une premiere version reclassait en "Unity probable" tout shader de plus de
    120 Ko. C'etait faux : IzzySunShader (154 Ko), CrackShader (195 Ko) et
    RimShader (321 Ko) sont manifestement ecrits par l'equipe, mais pesent
    lourd parce qu'ils embarquent eux aussi de nombreuses variantes compilees.
    La taille n'est donc qu'un indice, pas un verdict.
    """
    if BUILTIN.search(name or ""):
        return "unity"
    return "jeu"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/shaders")
    ap.add_argument("--report", default="data/shaders/report.json")
    args = ap.parse_args()

    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    print("Chargement du build...")
    env = UnityPy.load(data_dir(args.root))
    os.makedirs(args.out, exist_ok=True)

    rows, stats = [], collections.Counter()
    for o in env.objects:
        if o.type.name != "Shader":
            continue
        try:
            d = o.read(check_read=False)
            src = getattr(d, "m_Script", None)
            if isinstance(src, (bytes, bytearray)):
                src = src.decode("utf8", "replace")
            src = src or ""
        except Exception:
            stats["illisible"] += 1
            continue

        name = d.m_Name or f"shader_{o.path_id}"
        kind = classify(name, len(src))
        has_source = len(src) > 200 and ("SubShader" in src or "Properties" in src)

        if has_source:
            fn = f"{safe_name(d, 'shader_%d' % o.path_id)}_{o.path_id}.shader"
            with open(os.path.join(args.out, fn), "w", encoding="utf8") as fh:
                fh.write(src)
            stats["sources ecrites"] += 1
        else:
            fn = None
            stats["sans source"] += 1

        rows.append({"name": name, "bytes": len(src), "kind": kind,
                     "gros": len(src) >= SIZE_HINT,
                     "subshaders": src.count("SubShader"),
                     "passes": src.count("Pass {") + src.count("Pass{"),
                     "file": fn})
        stats[kind] += 1

    rows.sort(key=lambda r: (r["kind"] != "jeu", r["bytes"]))
    os.makedirs(os.path.dirname(args.report) or ".", exist_ok=True)
    with open(args.report, "w") as fh:
        json.dump(finite({"unity": UNITY_VERSION, "shaders": rows}), fh,
                  indent=1, allow_nan=False)

    print(f"\n-> {args.out}/  et  {args.report}")
    for k, v in stats.most_common():
        print(f"  {k:18s} {v}")
    jeu = [r for r in rows if r["kind"] == "jeu"]
    print(f"\n{len(jeu)} shaders classes comme ecrits par l'equipe :")
    for r in jeu:
        print(f"   {r['bytes']:7d} o  {r['passes']} passe(s)  {r['name']}")


if __name__ == "__main__":
    main()
