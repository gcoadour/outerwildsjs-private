#!/usr/bin/env python3
"""Exporte les systemes de particules et leurs textures.

Un ParticleSystem Unity est une structure a modules. UnityPy les expose tous
sur Unity 4 : InitialModule (duree de vie, vitesse, taille, couleur, capacite),
EmissionModule (taux), ShapeModule (forme d'emission).

Les valeurs sont des MinMaxCurve : on ne retient que le scalaire, suffisant
pour les courbes constantes, qui sont la majorite ici.

Usage: python3 tools/11_particles.py [racine] -o data/particles
"""
import sys, os, json, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import (UNITY_VERSION, data_dir, read_lenient, world_transform,
                    safe_name, finite)

# ParticleSystemShapeType (Unity 4)
SHAPES = {0: "sphere", 1: "sphereShell", 2: "hemisphere", 3: "hemisphereShell",
          4: "cone", 5: "box", 6: "mesh", 7: "coneShell", 8: "coneVolume"}


def curve(c, default=1.0):
    """Scalaire d'une MinMaxCurve. Les courbes variables sont approximees."""
    if c is None:
        return default
    v = getattr(c, "scalar", None)
    return float(v) if v is not None else default


def curve_points(mmc, n=5, default=None):
    """Echantillonne une MinMaxCurve sur la duree de vie, en 0 a 1.

    Unity range ces courbes en cles de Hermite ; on n'en garde que les valeurs,
    echantillonnees regulierement et multipliees par le scalaire du module, ce
    qui suffit pour un degrade Babylon. Retourne None si la courbe est plate :
    inutile de transporter une courbe qui ne courbe pas.
    """
    if mmc is None:
        return default
    ac = getattr(mmc, "maxCurve", None) or getattr(mmc, "minCurve", None)
    keys = getattr(ac, "m_Curve", None) or []
    if len(keys) < 2:
        return default
    scalar = float(getattr(mmc, "scalar", 1.0) or 1.0)
    pts = sorted(((float(k.time), float(k.value)) for k in keys), key=lambda p: p[0])
    t0, t1 = pts[0][0], pts[-1][0]
    span = (t1 - t0) or 1.0

    def at(u):
        t = t0 + u * span
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            if a[0] <= t <= b[0]:
                w = (t - a[0]) / ((b[0] - a[0]) or 1.0)
                return a[1] + (b[1] - a[1]) * w
        return pts[-1][1]

    out = [[round(i / (n - 1), 4), round(at(i / (n - 1)) * scalar, 5)]
           for i in range(n)]
    if max(v for _, v in out) - min(v for _, v in out) < 1e-6:
        return default
    return out


def gradient_keys(g):
    """Degrade d'un MinMaxGradient, en [temps, [r, v, b, a]].

    GradientNEW range huit cles de couleur et huit cles d'alpha, chacune avec
    son propre temps sur 16 bits (0 a 65535). Les deux series sont
    independantes : on prend l'union de leurs temps et on interpole ce qui
    manque, sinon un fondu de sortie tombe au mauvais moment.
    """
    grad = getattr(g, "maxGradient", None) or getattr(g, "minGradient", None)
    if grad is None:
        return None
    nc = int(getattr(grad, "m_NumColorKeys", 0) or 0)
    na = int(getattr(grad, "m_NumAlphaKeys", 0) or 0)
    if nc < 1 and na < 1:
        return None
    keys = [getattr(grad, f"key{i}", None) for i in range(8)]

    def series(count, prefix, pick):
        out = []
        for i in range(count):
            t = getattr(grad, f"{prefix}{i}", None)
            k = keys[i]
            if t is None or k is None:
                continue
            out.append((float(t) / 65535.0, pick(k)))
        return out or [(0.0, pick(keys[0]) if keys[0] else 1.0)]

    cols = series(nc, "ctime", lambda k: [float(getattr(k, c, 1.0)) for c in "rgb"])
    alphas = series(na, "atime", lambda k: float(getattr(k, "a", 1.0)))

    def sample(seq, t):
        if t <= seq[0][0]:
            return seq[0][1]
        if t >= seq[-1][0]:
            return seq[-1][1]
        for i in range(len(seq) - 1):
            a, b = seq[i], seq[i + 1]
            if a[0] <= t <= b[0]:
                w = (t - a[0]) / ((b[0] - a[0]) or 1.0)
                if isinstance(a[1], list):
                    return [a[1][j] + (b[1][j] - a[1][j]) * w for j in range(3)]
                return a[1] + (b[1] - a[1]) * w
        return seq[-1][1]

    times = sorted({t for t, _ in cols} | {t for t, _ in alphas})
    out = []
    for t in times:
        rgb = sample(cols, t)
        out.append([round(t, 4), [round(rgb[0], 4), round(rgb[1], 4),
                                  round(rgb[2], 4), round(sample(alphas, t), 4)]])
    return out if len(out) > 1 else None


def uv_animation(m):
    """Animation de planche de sprites (UVModule)."""
    if m is None or not getattr(m, "enabled", False):
        return None
    return {
        "tilesX": int(getattr(m, "tilesX", 1) or 1),
        "tilesY": int(getattr(m, "tilesY", 1) or 1),
        "fps": round(float(getattr(m, "fps", 30.0) or 30.0), 3),
        "cycles": round(float(getattr(m, "cycles", 1.0) or 1.0), 3),
    }


def color(g):
    """Couleur maximale d'une MinMaxGradient, en RGBA 0-1."""
    if g is None:
        return [1.0, 1.0, 1.0, 1.0]
    c = getattr(g, "maxColor", None) or getattr(g, "minColor", None)
    if c is None:
        return [1.0, 1.0, 1.0, 1.0]
    return [round(float(getattr(c, k, 1.0)), 4) for k in ("r", "g", "b", "a")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/particles")
    ap.add_argument("--max-texture", type=int, default=256)
    args = ap.parse_args()

    data = data_dir(args.root)
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

    # materiau du rendu de particules, par GameObject
    mat_of = {}
    for o in objs:
        if o.type.name != "ParticleSystemRenderer":
            continue
        try:
            r = o.read(check_read=False)
            ms = getattr(r, "m_Materials", None) or []
            if ms:
                mat_of[r.m_GameObject.path_id] = ms[0]
        except Exception:
            pass

    os.makedirs(args.out, exist_ok=True)
    tex_cache, systems, stats = {}, [], collections.Counter()

    def material_for(gid):
        """(texture PNG, mode de fusion) du materiau de particules.

        Le mode de fusion se lit dans le nom du shader Unity : les shaders
        "Particles/Additive" (et VertexLit Blended) sont additifs, les
        "Alpha Blended" ne le sont pas. Tout forcer en additif sature l'image.
        """
        ptr = mat_of.get(gid)
        if not ptr:
            return None, "add"
        blend = "add"
        try:
            mat = read_lenient(ptr)
            try:
                sn = (read_lenient(mat.m_Shader).m_Name or "").lower()
                if "alpha blend" in sn or "alphablend" in sn or "premultiply" in sn:
                    blend = "alpha"
                elif "multiply" in sn:
                    blend = "multiply"
            except Exception:
                pass
            sp = getattr(mat, "m_SavedProperties", None)
            envs = getattr(sp, "m_TexEnvs", None) if sp else None
            items = envs.items() if hasattr(envs, "items") else (envs or [])
            tex_ptr = None
            for k, v in items:
                if (getattr(k, "name", str(k))) == "_MainTex":
                    tex_ptr = getattr(v, "m_Texture", None)
                    break
            if not (tex_ptr and getattr(tex_ptr, "path_id", 0)):
                return None, blend
            tid = tex_ptr.path_id
            if tid in tex_cache:
                return tex_cache[tid], blend
            tex = read_lenient(tex_ptr)
            img = tex.image
            if img is None:
                raise ValueError("pas d'image")
            if img.width > args.max_texture or img.height > args.max_texture:
                r = args.max_texture / max(img.width, img.height)
                img = img.resize((max(1, int(img.width * r)), max(1, int(img.height * r))))
            name = f"{safe_name(tex, 'ptex_%d' % tid)}_{tid}.png"
            img.save(os.path.join(args.out, name))
            # la taille sert a decouper les planches de sprites : la lire ici
            # evite au moteur de dependre du chargement de la texture
            tex_cache[tid] = (name, [img.width, img.height])
            stats["textures"] += 1
            return tex_cache[tid], blend
        except Exception:
            return None, blend

    cache = {}
    blends = collections.Counter()
    for o in objs:
        if o.type.name != "ParticleSystem":
            continue
        try:
            d = o.read(check_read=False)
        except Exception:
            stats["illisible"] += 1
            continue
        gid = getattr(getattr(d, "m_GameObject", None), "path_id", 0)
        init = getattr(d, "InitialModule", None)
        emis = getattr(d, "EmissionModule", None)
        shape = getattr(d, "ShapeModule", None)
        t = tr.get(gid)
        pos = [round(v, 3) for v in world_transform(t, cache, ("go", gid))[0]] if t else [0, 0, 0]

        systems.append({
            "name": getattr(go.get(gid), "m_Name", None),
            "position": pos,
            "looping": bool(getattr(d, "looping", True)),
            "playOnAwake": bool(getattr(d, "playOnAwake", True)),
            "duration": round(float(getattr(d, "lengthInSec", 5.0) or 5.0), 3),
            "speedScale": round(float(getattr(d, "speed", 1.0) or 1.0), 3),
            "capacity": int(getattr(init, "maxNumParticles", 1000) or 1000) if init else 1000,
            "lifetime": round(curve(getattr(init, "startLifetime", None), 1.0), 4) if init else 1.0,
            "startSpeed": round(curve(getattr(init, "startSpeed", None), 1.0), 4) if init else 1.0,
            "size": round(curve(getattr(init, "startSize", None), 1.0), 4) if init else 1.0,
            "color": color(getattr(init, "startColor", None)) if init else [1, 1, 1, 1],
            "gravityModifier": round(float(getattr(init, "gravityModifier", 0.0) or 0.0), 4) if init else 0.0,
            "rate": round(curve(getattr(emis, "rate", None), 10.0), 3) if emis else 10.0,
            "shape": {
                "type": SHAPES.get(getattr(shape, "type", 0), "sphere"),
                "radius": round(float(getattr(shape, "radius", 1.0) or 1.0), 4),
                "angle": round(float(getattr(shape, "angle", 0.0) or 0.0), 4),
                "randomDirection": bool(getattr(shape, "randomDirection", False)),
            } if shape else None,
            # Modules secondaires. Mesure d'usage sur les 135 systemes :
            #   ColorModule 110, SizeModule 80, RotationModule 28, UVModule 13,
            #   et 0 pour force, collision, vitesse par vitesse, sous-emetteurs.
            # On ne transporte donc que ces quatre-la, comme on n'avait porte
            # que les shaders effectivement utilises.
            "colorOverLife": gradient_keys(getattr(
                getattr(d, "ColorModule", None), "gradient", None))
                if getattr(getattr(d, "ColorModule", None), "enabled", False) else None,
            "sizeOverLife": curve_points(getattr(
                getattr(d, "SizeModule", None), "curve", None))
                if getattr(getattr(d, "SizeModule", None), "enabled", False) else None,
            "rotationSpeed": (round(float(getattr(getattr(
                getattr(d, "RotationModule", None), "curve", None), "scalar", 0.0) or 0.0), 5)
                if getattr(getattr(d, "RotationModule", None), "enabled", False) else None),
            "sheet": uv_animation(getattr(d, "UVModule", None)),
            "texture": None, "blend": "add",
        })
        tex, blend = material_for(gid)
        systems[-1]["texture"] = tex[0] if tex else None
        systems[-1]["textureSize"] = tex[1] if tex else None
        systems[-1]["blend"] = blend
        blends[blend] += 1
        stats["systemes"] += 1

    with open(os.path.join(args.out, "systems.json"), "w") as fh:
        json.dump(finite({"unity": UNITY_VERSION, "systems": systems}), fh,
                  indent=1, allow_nan=False)

    print(f"\n-> {args.out}/systems.json")
    for k, v in stats.most_common():
        print(f"  {k:14s} {v}")
    print("  avec texture :", sum(1 for s in systems if s["texture"]))
    print("  formes       :", dict(collections.Counter(
        (s["shape"] or {}).get("type") for s in systems)))
    print("  fusion       :", dict(blends))
    for key, label in (("colorOverLife", "degrades de couleur"),
                       ("sizeOverLife", "courbes de taille"),
                       ("rotationSpeed", "rotations"),
                       ("sheet", "planches de sprites")):
        print(f"  {label:20s} {sum(1 for s in systems if s.get(key))}")


if __name__ == "__main__":
    main()
