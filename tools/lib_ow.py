"""Utilitaires communs pour l'analyse du build Outer Wilds Alpha 1.2 (Unity 4.1.2f1)."""
import os
import UnityPy

UNITY_VERSION = "4.1.2f1"
DATA_FILES = ["mainData", "level0", "resources.assets",
              "sharedassets0.assets", "sharedassets1.assets"]


def data_dir(root):
    """Retourne le dossier *_Data du build extrait."""
    for dirpath, dirnames, _ in os.walk(root):
        for d in dirnames:
            if d.endswith("_Data"):
                return os.path.join(dirpath, d)
    raise SystemExit(f"Aucun dossier *_Data trouve sous {root}. Lancer d'abord tools/01_fetch.sh")


def load_all(data):
    """Charge l'ensemble des fichiers du build dans un seul environnement.

    Indispensable : les PPtr entre fichiers (ex. MonoBehaviour -> MonoScript de
    sharedassets0) ne se resolvent que si tout est charge ensemble.
    """
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    return UnityPy.load(*[os.path.join(data, f) for f in DATA_FILES])


def script_name(mono_behaviour_data):
    """Nom de la classe C# derriere un MonoBehaviour, via son PPtr m_Script."""
    try:
        s = mono_behaviour_data.m_Script.read()
        return s.m_ClassName or s.m_Name
    except Exception:
        return None


def safe_name(obj, default="unnamed"):
    n = getattr(obj, "m_Name", None) or default
    return "".join(c if c.isalnum() or c in "._- " else "_" for c in n).strip() or default


def read_lenient(ptr):
    """Lit l'objet cible d'un PPtr en tolerant l'absence de type tree.

    Le build est strippe : la plupart des MonoBehaviour contiennent plus
    d'octets que la structure de base connue de UnityPy, qui leve alors une
    ValueError. On deref d'abord pour obtenir l'ObjectReader et desactiver la
    verification de lecture complete. PPtr.read() lui-meme n'accepte aucun
    argument, d'ou ce detour.
    """
    try:
        return ptr.deref().read(check_read=False)
    except Exception:
        return ptr.read()


# --- transformations monde -------------------------------------------------
#
# Sommer les translations locales ne suffit pas : il faut composer rotations et
# echelles des parents. Sans cela un objet pose a la surface d'une planete
# tombe a l'interieur de celle-ci.

def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx + ax*bw + ay*bz - az*by,
            aw*by - ax*bz + ay*bw + az*bx,
            aw*bz + ax*by - ay*bx + az*bw,
            aw*bw - ax*bx - ay*by - az*bz)


def qrot(q, v):
    x, y, z, w = q; vx, vy, vz = v
    tx = 2*(y*vz - z*vy); ty = 2*(z*vx - x*vz); tz = 2*(x*vy - y*vx)
    return (vx + w*tx + y*tz - z*ty,
            vy + w*ty + z*tx - x*tz,
            vz + w*tz + x*ty - y*tx)


def _v3(v, d=(0.0, 0.0, 0.0)):
    if v is None:
        return d
    return (float(getattr(v, "x", d[0])), float(getattr(v, "y", d[1])),
            float(getattr(v, "z", d[2])))


def _q(v):
    if v is None:
        return (0.0, 0.0, 0.0, 1.0)
    return (float(getattr(v, "x", 0)), float(getattr(v, "y", 0)),
            float(getattr(v, "z", 0)), float(getattr(v, "w", 1)))


def world_transform(tr, cache, key=None):
    """(position, rotation, echelle) monde d'un Transform UnityPy."""
    if key is None:
        key = id(tr)
    if key in cache:
        return cache[key]
    lp, lr = _v3(getattr(tr, "m_LocalPosition", None)), _q(getattr(tr, "m_LocalRotation", None))
    ls = _v3(getattr(tr, "m_LocalScale", None), (1.0, 1.0, 1.0))
    father = getattr(tr, "m_Father", None)
    if father is None or getattr(father, "path_id", 0) == 0:
        res = (lp, lr, ls)
    else:
        try:
            pt = read_lenient(father)
            pp, pr, ps = world_transform(pt, cache, getattr(father, "path_id", None))
            scaled = (lp[0]*ps[0], lp[1]*ps[1], lp[2]*ps[2])
            rp = qrot(pr, scaled)
            res = ((pp[0]+rp[0], pp[1]+rp[1], pp[2]+rp[2]),
                   qmul(pr, lr), (ps[0]*ls[0], ps[1]*ls[1], ps[2]*ls[2]))
        except Exception:
            res = (lp, lr, ls)
    cache[key] = res
    return res


def finite(v):
    """Remplace les valeurs non finies par None, recursivement.

    JSON n'admet ni Infinity ni NaN, et plusieurs champs du jeu en contiennent
    (par ex. _tumbleThreshold ou une limite de poussee non bornee). Sans ce
    filtre, json.dump(allow_nan=False) echoue en fin d'export, apres tout le
    travail.
    """
    import math
    if isinstance(v, float):
        return v if math.isfinite(v) else None
    if isinstance(v, dict):
        return {k: finite(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [finite(x) for x in v]
    return v
