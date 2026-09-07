#!/usr/bin/env python3
"""Consolide les donnees du systeme solaire en un seul JSON exploitable.

Croise le graphe de scene et les valeurs de composants pour produire, par corps :
position monde, rayons, gravite de surface, masse, rotation propre et orbite.
C'est la source de verite du moteur JS.

Usage: python3 tools/07_solar_system.py [racine] -o data/solar_system.json
"""
import sys, os, json, math, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import UnityPy
from lib_ow import UNITY_VERSION, data_dir, read_lenient, world_transform, finite
from lib_typetree import TreeCache

# classes portant l'information physique d'un corps
BODY_CLASSES = ("GravityWell", "PlanetoidSector", "SphereOceanFluidVolume",
                "FogVolume", "WhiteHoleVolume", "QuantumOrbit", "RotateTransform",
                "OWRigidbody", "AlignWithTargetBody", "InitialMotion")




def vec3(v, d=(0.0, 0.0, 0.0)):
    if v is None:
        return d
    return (float(getattr(v, "x", d[0])), float(getattr(v, "y", d[1])), float(getattr(v, "z", d[2])))


def quat(v):
    if v is None:
        return (0.0, 0.0, 0.0, 1.0)
    return (float(getattr(v, "x", 0)), float(getattr(v, "y", 0)),
            float(getattr(v, "z", 0)), float(getattr(v, "w", 1)))



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default="work/game")
    ap.add_argument("-o", "--out", default="data/solar_system.json")
    a = ap.parse_args()

    data = data_dir(a.root)
    trees = TreeCache(os.path.join(data, "Managed"), UNITY_VERSION)
    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    print("Chargement du build...")
    env = UnityPy.load(data)

    # index GameObject path_id -> (nom, transform, composants lus)
    print("Indexation des GameObject de level0...")
    objs = [o for o in env.objects if os.path.basename(o.assets_file.name) == "level0"]
    go_by_id, tr_by_go = {}, {}
    for o in objs:
        if o.type.name == "GameObject":
            try:
                go_by_id[o.path_id] = o.read(check_read=False)
            except Exception:
                pass
        elif o.type.name == "Transform":
            try:
                t = o.read(check_read=False)
                t.object_reader = o
                tr_by_go[getattr(t.m_GameObject, "path_id", 0)] = t
            except Exception:
                pass

    # composants interessants, par GameObject
    print("Lecture des composants physiques...")
    comps = collections.defaultdict(dict)
    for o in objs:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            base = o.read(check_read=False)
            cls = base.m_Script.read().m_ClassName
        except Exception:
            continue
        if cls not in BODY_CLASSES:
            continue
        nodes = trees.get(cls)
        if not nodes:
            continue
        try:
            v = o.read_typetree(nodes, check_read=False)
        except Exception:
            continue
        gid = getattr(getattr(base, "m_GameObject", None), "path_id", 0)
        comps[gid][cls] = {k: x for k, x in v.items() if not k.startswith("m_")}

    # Un GravityWell est un ENFANT du corps : le corps est le premier ancetre
    # portant un OWRigidbody. C'est lui qui porte l'InitialMotion, donc l'orbite.
    parent_of = {}
    for gid, tr in tr_by_go.items():
        f = getattr(getattr(tr, "m_Father", None), "path_id", 0)
        if f:
            try:
                parent_of[gid] = getattr(read_lenient(
                    getattr(tr, "m_Father")).m_GameObject, "path_id", 0)
            except Exception:
                pass

    def owning_body(gid):
        """Remonte jusqu'au premier ancetre (ou soi-meme) portant un OWRigidbody."""
        seen = 0
        cur = gid
        while cur and seen < 32:
            if "OWRigidbody" in comps.get(cur, {}):
                return cur
            cur = parent_of.get(cur, 0)
            seen += 1
        return gid

    # OWRigidbody -> nom, pour resoudre les references _primaryBody
    rb_owner = {}
    for o in objs:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            base = o.read(check_read=False)
            if base.m_Script.read().m_ClassName != "OWRigidbody":
                continue
            g_ = getattr(base.m_GameObject, "path_id", 0)
            go_ = go_by_id.get(g_)
            if go_ is not None:
                rb_owner[o.path_id] = go_.m_Name
        except Exception:
            pass

    cache = {}
    bodies = []
    for gid, cs in comps.items():
        if "GravityWell" not in cs and "PlanetoidSector" not in cs:
            continue
        go = go_by_id.get(gid)
        tr = tr_by_go.get(gid)
        if go is None or tr is None:
            continue
        pos, rot, scl = world_transform(tr, cache)
        gw = cs.get("GravityWell", {})
        ps = cs.get("PlanetoidSector", {})
        rt = cs.get("RotateTransform", {})
        owner_gid = owning_body(gid)
        owner = go_by_id.get(owner_gid)
        im = comps.get(owner_gid, {}).get("InitialMotion", {})
        entry = {
            "name": go.m_Name,
            "position": [round(v, 3) for v in pos],
            "rotation": [round(v, 6) for v in rot],
            "scale": [round(v, 4) for v in scl],
            # Modele GravityWell. cutoffRadius est un rayon INTERNE (coeur sans
            # gravite), pas une portee maximale : le champ n'a pas de coupure
            # externe. falloffType : 0=lineaire, 1=inverse du carre, 2=constant.
            "gravity": {
                "surfaceAcceleration": gw.get("_surfaceAcceleration"),
                "upperSurfaceRadius": gw.get("_upperSurfaceRadius"),
                "lowerSurfaceRadius": gw.get("_lowerSurfaceRadius"),
                "cutoffRadius": gw.get("_cutoffRadius"),
                "alignmentRadius": gw.get("_alignmentRadius"),
                "falloffType": gw.get("_falloffType"),
                "forceScaleFactor": gw.get("_forceScaleFactor"),
                "setMass": gw.get("_setMass"),
            } if gw else None,
            "horizonRadius": ps.get("_horizonRadius"),
            "spin": {
                "axis": rt.get("_localAxis"),
                "degreesPerSecond": rt.get("_degreesPerSecond"),
            } if rt else None,
            "hasRigidbody": "OWRigidbody" in cs,
            # corps proprietaire : le GravityWell est un enfant, c'est l'ancetre
            # portant l'OWRigidbody qui porte l'orbite
            "bodyName": getattr(owner, "m_Name", None) if owner else None,
            "bodyPosition": ([round(v, 3) for v in world_transform(
                tr_by_go[owner_gid], cache)[0]] if owner_gid in tr_by_go else None),
            # Orbite : InitialMotion donne une vitesse initiale, il n'y a pas de
            # rotation de pivot. Voir docs/04-gravite.md.
            "orbit": {
                # Les valeurs sont ici brutes (contrairement a 06 qui les
                # normalise) : un PPtr s'y lit m_PathID, pas $ref.
                "primary": rb_owner.get(
                    (im.get("_primaryBody") or {}).get("m_PathID"), None),
                "orbitAngle": im.get("_orbitAngle"),
                "impulseScalar": im.get("_orbitImpulseScalar"),
                "initLinearDirection": im.get("_initLinearDirection"),
                "initLinearSpeed": im.get("_initLinearSpeed"),
                "spinAxis": im.get("_rotationAxis"),
                "spinSpeed": im.get("_initAngularSpeed"),
            } if im else None,
        }
        bodies.append(entry)

    bodies.sort(key=lambda b: math.dist((0, 0, 0), b["position"]))

    # constantes de vol et de deplacement
    consts = {}
    for o in objs:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            cls = o.read(check_read=False).m_Script.read().m_ClassName
        except Exception:
            continue
        if cls not in ("ThrusterModel", "PlayerCharacterController"):
            continue
        nodes = trees.get(cls)
        if not nodes:
            continue
        try:
            v = o.read_typetree(nodes, check_read=False)
            consts[cls] = {k: x for k, x in v.items() if not k.startswith("m_")}
        except Exception:
            pass


    out = finite({"unity": UNITY_VERSION, "source": "level0",
                  "bodies": bodies, "constants": consts})
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(out, fh, indent=1, allow_nan=False)

    print(f"\n{len(bodies)} corps -> {a.out}\n")
    print(f"{'corps':26s} {'distance':>10s} {'g surface':>10s} {'r surface':>10s}")
    for b in bodies:
        g = b["gravity"] or {}
        d = math.dist((0, 0, 0), b["position"])
        print(f"  {b['name']:24s} {d:10.0f} {str(g.get('surfaceAcceleration')):>10s} "
              f"{str(g.get('upperSurfaceRadius')):>10s}")


if __name__ == "__main__":
    main()
