#!/usr/bin/env python3
"""Exporte un sous-arbre de la scene en glTF 2.0 (.gltf + .bin).

Le glTF transporte maillages, hierarchie et materiaux dans un format que
Babylon.js et three.js chargent nativement, la ou l'OBJ perd la hierarchie.

Les maillages Unity 4 stockent leurs sommets dans des flux entrelaces
(m_VertexData, 6 canaux), decodes ici par MeshHandler : squelettes, poids d'os
et animations compris, clips Mecanim inclus (voir lib_muscle.py).

Usage:
  python3 tools/08_export_gltf.py --root TimberHearth_Pivot -o data/gltf/timberhearth.gltf
  python3 tools/08_export_gltf.py --root Sun_Body --root Comet_Pivot   # un fichier par racine
  python3 tools/08_export_gltf.py --list          # racines exportables
"""
import sys, os, json, math, struct, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy
import UnityPy
from PIL import Image
from UnityPy.helpers.MeshHelper import MeshHandler
from lib_ow import UNITY_VERSION, data_dir, read_lenient, safe_name
from lib_muscle import avatar_tos, decode_clip


def decode_mesh(mesh):
    """Decode un maillage Unity 4 directement, skinning compris.

    Les sommets vivent dans des flux entrelaces (m_VertexData). L'export OBJ de
    UnityPy sait les decoder mais perd les poids d'os ; MeshHandler donne les
    memes donnees plus m_BoneWeights et m_BoneIndices.

    Conversion de repere : Unity est en main gauche, glTF en main droite, d'ou
    l'inversion de Z sur positions et normales, et l'inversion de l'ordre des
    sommets de chaque triangle.
    """
    h = MeshHandler(mesh)
    h.process()
    verts = h.m_Vertices or []
    if not verts:
        raise ValueError("aucun sommet")
    nrms = h.m_Normals or []
    uvs = h.m_UV0 or []
    bw = h.m_BoneWeights or []
    bi = h.m_BoneIndices or []

    pos = [(v[0], v[1], -v[2]) for v in verts]
    nrm = [(n[0], n[1], -n[2]) for n in nrms] if nrms else [(0.0, 1.0, 0.0)] * len(pos)
    uv = [(u[0], 1.0 - u[1]) for u in uvs] if uvs else [(0.0, 0.0)] * len(pos)

    idx = []
    for sub in h.get_triangles():
        for t in sub:
            if len(t) >= 3:
                # l'inversion de Z change l'orientation : on retourne le triangle
                idx.extend((t[0], t[2], t[1]))

    skin = None
    if bw and bi and len(bw) == len(pos):
        skin = {"weights": [tuple(float(x) for x in w[:4]) for w in bw],
                "joints": [tuple(int(x) for x in j[:4]) for j in bi]}
    return pos, nrm, uv, idx, skin


def flip_vec3(v):
    """Vector3f Unity -> triplet glTF (inversion de Z)."""
    return [float(v.x), float(v.y), -float(v.z)]


def flip_quat(q):
    """Quaternion Unity -> glTF. L'inversion de Z donne (-x, -y, z, w)."""
    return [-float(q.x), -float(q.y), float(q.z), float(q.w)]


def flip_vec3_t(v):
    """Idem flip_vec3 pour un triplet brut (les clips Mecanim en fournissent)."""
    return [float(v[0]), float(v[1]), -float(v[2])]


def flip_quat_t(q):
    """Idem flip_quat pour un quadruplet brut."""
    return [-float(q[0]), -float(q[1]), float(q[2]), float(q[3])]


def controller_default_clip(ctrl):
    """Index, dans m_AnimationClips, du clip joue par defaut par un controleur.

    La machine a etats d'Unity 4 vit dans m_Controller.m_StateMachineArray.
    m_DefaultState y designe un etat, et l'ordre des etats suit celui de
    m_AnimationClips (verifie sur les huit controleurs du build : les hachages
    m_ClipID se succedent dans le meme ordre). Sans cela, les villageois qui
    observent les etoiles joueraient l'inactivite par defaut.
    """
    ctl = getattr(ctrl, "m_Controller", None)
    machines = getattr(ctl, "m_StateMachineArray", None) or []
    if not machines:
        return None
    which = 0
    layers = getattr(ctl, "m_LayerArray", None) or []
    if layers:
        first = getattr(layers[0], "data", layers[0])
        which = int(getattr(first, "m_StateMachineIndex", 0) or 0)
    if which >= len(machines):
        return None
    sm = getattr(machines[which], "data", machines[which])
    idx = getattr(sm, "m_DefaultState", None)
    return int(idx) if idx is not None else None


def curve_keys(curve):
    """(temps, valeur, pente d'entree, pente de sortie) d'une AnimationCurve.

    Les clips legacy rangent directement les deux tangentes de Hermite, la ou
    Mecanim range le cubique du segment. Elles sont dans la meme unite que
    celles de glTF — une derivee par unite de temps — et se transportent donc
    telles quelles.
    """
    keys = getattr(getattr(curve, "curve", None), "m_Curve", None) or []
    out = [(float(k.time), k.value,
            getattr(k, "inSlope", None), getattr(k, "outSlope", None))
           for k in keys]
    out.sort(key=lambda x: x[0])
    return out


def flip_bindpose(m):
    """Matrice de pose de repos, convertie et mise en colonnes pour glTF.

    L'inversion de l'axe Z se propage a une matrice par conjugaison : avec
    S = diag(1, 1, -1, 1), la matrice devient S.M.S, ce qui revient a changer le
    signe des elements dont exactement un indice vaut 2.
    """
    rows = [[float(getattr(m, f"e{r}{c}", 1.0 if r == c else 0.0))
             for c in range(4)] for r in range(4)]
    sgn = (1.0, 1.0, -1.0, 1.0)
    conj = [[rows[r][c] * sgn[r] * sgn[c] for c in range(4)] for r in range(4)]
    # glTF attend l'ordre colonne par colonne
    return [conj[r][c] for c in range(4) for r in range(4)]


def parse_obj(text):
    """OBJ -> (positions, normals, uvs, indices), sommets dedupliques."""
    vs, vns, vts, faces = [], [], [], []
    for line in text.splitlines():
        if not line or line[0] == "#":
            continue
        p = line.split()
        if not p:
            continue
        if p[0] == "v" and len(p) >= 4:
            vs.append((float(p[1]), float(p[2]), float(p[3])))
        elif p[0] == "vn" and len(p) >= 4:
            vns.append((float(p[1]), float(p[2]), float(p[3])))
        elif p[0] == "vt" and len(p) >= 3:
            vts.append((float(p[1]), float(p[2])))
        elif p[0] == "f" and len(p) >= 4:
            faces.append(p[1:4])

    pos, nrm, uv, idx, seen = [], [], [], [], {}
    for f in faces:
        tri = []
        for tok in f:
            if tok not in seen:
                a = tok.split("/")
                vi = int(a[0]) - 1
                ti = int(a[1]) - 1 if len(a) > 1 and a[1] else -1
                ni = int(a[2]) - 1 if len(a) > 2 and a[2] else -1
                v = vs[vi] if 0 <= vi < len(vs) else (0.0, 0.0, 0.0)
                n = vns[ni] if 0 <= ni < len(vns) else (0.0, 1.0, 0.0)
                t = vts[ti] if 0 <= ti < len(vts) else (0.0, 0.0)
                # Unity est main gauche, glTF main droite : on inverse Z
                pos.append((v[0], v[1], -v[2]))
                nrm.append((n[0], n[1], -n[2]))
                uv.append((t[0], 1.0 - t[1]))
                seen[tok] = len(pos) - 1
            tri.append(seen[tok])
        # l'inversion de Z change l'orientation : on inverse l'ordre des sommets
        idx.extend((tri[0], tri[2], tri[1]))
    return pos, nrm, uv, idx


class Gltf:
    def __init__(self):
        self.buf = bytearray()
        self.views, self.accessors, self.meshes, self.nodes = [], [], [], []
        self.images, self.textures, self.materials = [], [], []
        self.skins = []
        self.animations = []
        self._tex_by_pid = {}      # path_id Texture2D -> index glTF
        self._mat_by_pid = {}      # path_id Material  -> index glTF

    def _pad(self):
        while len(self.buf) % 4:
            self.buf.append(0)

    def _view(self, data, target):
        self._pad()
        off = len(self.buf)
        self.buf.extend(data)
        entry = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target is not None:
            entry["target"] = target
        self.views.append(entry)
        return len(self.views) - 1

    def add_attr(self, values, dim):
        flat = [c for v in values for c in v]
        view = self._view(struct.pack(f"<{len(flat)}f", *flat), 34962)
        mins = [min(v[i] for v in values) for i in range(dim)]
        maxs = [max(v[i] for v in values) for i in range(dim)]
        self.accessors.append({
            "bufferView": view, "componentType": 5126, "count": len(values),
            "type": {2: "VEC2", 3: "VEC3"}[dim], "min": mins, "max": maxs})
        return len(self.accessors) - 1

    def add_joints(self, joints):
        """JOINTS_0 : quatre indices d'os par sommet, en entiers courts."""
        flat = [c for v in joints for c in v]
        view = self._view(struct.pack(f"<{len(flat)}H", *flat), 34962)
        self.accessors.append({"bufferView": view, "componentType": 5123,
                               "count": len(joints), "type": "VEC4"})
        return len(self.accessors) - 1

    def add_weights(self, weights):
        """WEIGHTS_0 : quatre poids par sommet, normalises."""
        norm = []
        for w in weights:
            s = sum(w) or 1.0
            norm.append(tuple(x / s for x in w))
        flat = [c for v in norm for c in v]
        view = self._view(struct.pack(f"<{len(flat)}f", *flat), 34962)
        self.accessors.append({"bufferView": view, "componentType": 5126,
                               "count": len(norm), "type": "VEC4"})
        return len(self.accessors) - 1

    def add_times(self, times):
        """Temps d'echantillonnage d'une animation."""
        view = self._view(struct.pack(f"<{len(times)}f", *times), None)
        self.accessors.append({"bufferView": view, "componentType": 5126,
                               "count": len(times), "type": "SCALAR",
                               "min": [min(times)], "max": [max(times)]})
        return len(self.accessors) - 1

    def add_values(self, values, dim):
        """Valeurs d'une animation : VEC3 pour position et echelle, VEC4 pour rotation."""
        flat = [c for v in values for c in v]
        view = self._view(struct.pack(f"<{len(flat)}f", *flat), None)
        self.accessors.append({"bufferView": view, "componentType": 5126,
                               "count": len(values),
                               "type": {3: "VEC3", 4: "VEC4"}[dim]})
        return len(self.accessors) - 1

    def add_matrices(self, mats):
        """Matrices inverses de pose de repos, hors tampon de sommets."""
        flat = [c for m in mats for c in m]
        view = self._view(struct.pack(f"<{len(flat)}f", *flat), None)
        self.accessors.append({"bufferView": view, "componentType": 5126,
                               "count": len(mats), "type": "MAT4"})
        return len(self.accessors) - 1

    def add_indices(self, idx):
        view = self._view(struct.pack(f"<{len(idx)}I", *idx), 34963)
        self.accessors.append({"bufferView": view, "componentType": 5125,
                               "count": len(idx), "type": "SCALAR",
                               "min": [min(idx)], "max": [max(idx)]})
        return len(self.accessors) - 1


def prop_map(entries):
    """m_TexEnvs / m_Colors arrivent en liste de couples (FastPropertyName, valeur)."""
    out = {}
    if not entries:
        return out
    items = entries.items() if hasattr(entries, "items") else entries
    for k, v in items:
        name = getattr(k, "name", None) or str(k)
        out[name] = v
    return out


def alpha_mode(shader_name):
    """Le mode de transparence se lit dans le nom du shader Unity."""
    n = (shader_name or "").lower()
    if "cutout" in n:
        return "MASK"
    if "alpha" in n or "transparent" in n:
        return "BLEND"
    return "OPAQUE"


def is_dxt5nm(img):
    """Vrai si l'image est une normale au format DXT5nm d'Unity.

    Unity range ses cartes de normales en DXT5nm : la composante X va dans le
    canal alpha, Y dans le vert, et le RVB est un gris qui ne porte rien. La
    signature est donc : RVB quasi identique d'un canal a l'autre, et un alpha
    qui, lui, varie. Mesure sur les 83 normales du build : R et B different d'au
    plus 9 niveaux (bruit de compression), tandis que G et A different de 190.
    """
    if img.mode not in ("RGBA", "LA"):
        return False
    a = numpy.asarray(img.convert("RGBA"), dtype=numpy.int16)
    grey = (abs(a[..., 0] - a[..., 1]).mean() < 12 and
            abs(a[..., 0] - a[..., 2]).mean() < 12)
    return bool(grey and a[..., 3].std() > 3)


def unswizzle_normal(img):
    """DXT5nm -> normale tangente RVB, telle que glTF l'attend.

    Sans cette conversion, le moteur lit le gris du RVB comme un vecteur : il
    obtient (y, y, y), qui ne veut rien dire. Verification : interpretes tels
    quels, 2 pixels sur 784 tombent sur une normale unitaire ; avec X pris dans
    l'alpha et Y dans le vert, 784 sur 784 tiennent dans le disque unite.

    Z se reconstruit par la contrainte de norme, comme le fait le shader Unity.
    """
    a = numpy.asarray(img.convert("RGBA"), dtype=numpy.float32)
    x = a[..., 3] / 127.5 - 1.0
    y = a[..., 1] / 127.5 - 1.0
    z = numpy.sqrt(numpy.clip(1.0 - x * x - y * y, 0.0, 1.0))
    out = numpy.stack([(x + 1) * 127.5, (y + 1) * 127.5, (z + 1) * 127.5], -1)
    return Image.fromarray(numpy.clip(out, 0, 255).astype(numpy.uint8), "RGB")


def write_texture(img, out_dir, tex_dir, stem, max_size, quality,
                  normal=False, normal_quality=92):
    """Ecrit une texture en limitant son poids.

    Les textures Unity sortent systematiquement en RGBA, meme sans
    transparence reelle. On teste le canal alpha : s'il est entierement opaque,
    on passe en RGB et en JPEG, ce qui divise le poids par un ordre de grandeur.
    Le PNG n'est conserve que pour les textures reellement transparentes.

    Les cartes de normales sont le piege : leur alpha varie, donc ce test les
    prenait pour des textures transparentes et les gardait en PNG — 80 des
    90 Mo de PNG du build. Or cet alpha n'est pas de la transparence mais la
    composante X. Une fois desentrelacees, elles n'ont plus d'alpha du tout.

    Elles partent en JPEG 4:4:4 (sans sous-echantillonnage de chrominance, qui
    melangerait les composantes entre elles) et a une qualite plus elevee que
    les textures de couleur : mesure sur six normales, l'erreur angulaire est de
    1,2 degre en moyenne et 5,7 au 99e centile a qualite 92, contre 1,6 et 8,1 a
    qualite 85.
    """
    if normal and is_dxt5nm(img):
        # avant le redimensionnement : Z se deduit de X et Y, mieux vaut le
        # calculer sur les valeurs d'origine puis interpoler le resultat
        img = unswizzle_normal(img)

    if max_size and (img.width > max_size or img.height > max_size):
        ratio = max_size / max(img.width, img.height)
        img = img.resize((max(1, int(img.width * ratio)),
                          max(1, int(img.height * ratio))))

    has_alpha = False
    if img.mode in ("RGBA", "LA"):
        alpha = img.getchannel("A")
        has_alpha = alpha.getextrema()[0] < 255

    if has_alpha:
        name = stem + ".png"
        img.save(os.path.join(out_dir, tex_dir, name), optimize=True)
    else:
        name = stem + ".jpg"
        img.convert("RGB").save(
            os.path.join(out_dir, tex_dir, name),
            quality=normal_quality if normal else quality,
            subsampling=0 if normal else 2, optimize=True)
    return name


def export_material(g, mat_ptr, tex_dir, out_dir, max_size=1024, quality=85,
                    normal_quality=92):
    """Materiau Unity -> materiau glTF, textures ecrites a cote du .gltf."""
    pid = getattr(mat_ptr, "path_id", 0)
    if not pid:
        return None
    if pid in g._mat_by_pid:
        return g._mat_by_pid[pid]
    try:
        mat = read_lenient(mat_ptr)
    except Exception:
        g._mat_by_pid[pid] = None
        return None

    sp = getattr(mat, "m_SavedProperties", None)
    texenvs = prop_map(getattr(sp, "m_TexEnvs", None)) if sp else {}
    colors = prop_map(getattr(sp, "m_Colors", None)) if sp else {}

    def put_texture(prop, normal=False):
        env = texenvs.get(prop)
        ptr = getattr(env, "m_Texture", None) if env else None
        tpid = getattr(ptr, "path_id", 0)
        if not tpid:
            return None
        if tpid in g._tex_by_pid:
            return g._tex_by_pid[tpid]
        try:
            tex = read_lenient(ptr)
            img = tex.image
            if img is None:
                raise ValueError("pas d'image")
            os.makedirs(os.path.join(out_dir, tex_dir), exist_ok=True)
            stem = f"{safe_name(tex, 'tex_%d' % tpid)}_{tpid}"
            name = write_texture(img, out_dir, tex_dir, stem, max_size, quality,
                                 normal=normal, normal_quality=normal_quality)
        except Exception:
            g._tex_by_pid[tpid] = None
            return None
        g.images.append({"uri": f"{tex_dir}/{name}"})
        g.textures.append({"source": len(g.images) - 1, "sampler": 0})
        g._tex_by_pid[tpid] = len(g.textures) - 1
        return g._tex_by_pid[tpid]

    base = put_texture("_MainTex")
    normal = put_texture("_BumpMap", normal=True)

    col = colors.get("_Color")
    factor = [1.0, 1.0, 1.0, 1.0]
    if col is not None:
        factor = [float(getattr(col, c, 1.0)) for c in ("r", "g", "b", "a")]

    shader = ""
    try:
        shader = read_lenient(mat.m_Shader).m_Name
    except Exception:
        pass

    pbr = {"baseColorFactor": factor, "metallicFactor": 0.0, "roughnessFactor": 0.85}
    if base is not None:
        pbr["baseColorTexture"] = {"index": base}
    entry = {"name": getattr(mat, "m_Name", "material"),
             "pbrMetallicRoughness": pbr,
             "alphaMode": alpha_mode(shader),
             # le nom du shader Unity permet au moteur JS de choisir le
             # materiau equivalent (voir web/src/shaders/)
             "extras": {"unityShader": shader}}
    if normal is not None:
        entry["normalTexture"] = {"index": normal}
    if entry["alphaMode"] == "MASK":
        entry["alphaCutoff"] = 0.5

    g.materials.append(entry)
    g._mat_by_pid[pid] = len(g.materials) - 1
    return g._mat_by_pid[pid]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root_dir", nargs="?", default="work/game")
    ap.add_argument("--root", action="append", default=[],
                    help="nom du GameObject racine a exporter (repetable)")
    ap.add_argument("--list", action="store_true", help="liste les racines disponibles")
    ap.add_argument("--max-meshes", type=int, default=4000)
    ap.add_argument("--max-texture", type=int, default=1024,
                    help="cote maximal des textures en pixels (0 = pas de limite)")
    ap.add_argument("--texture-quality", type=int, default=85,
                    help="qualite JPEG des textures opaques")
    ap.add_argument("--normal-quality", type=int, default=92,
                    help="qualite JPEG des cartes de normales (4:4:4)")
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    UnityPy.config.FALLBACK_UNITY_VERSION = UNITY_VERSION
    data = data_dir(a.root_dir)
    print("Chargement du build...")
    env = UnityPy.load(data)

    objs = [o for o in env.objects if os.path.basename(o.assets_file.name) == "level0"]
    transforms, go_of, mesh_of = {}, {}, {}
    for o in objs:
        if o.type.name != "Transform":
            continue
        try:
            t = o.read(check_read=False)
        except Exception:
            continue
        transforms[o.path_id] = t
        try:
            go = t.m_GameObject.read()
            go_of[o.path_id] = go
        except Exception:
            pass

    children = {pid: [] for pid in transforms}
    roots = []
    for pid, t in transforms.items():
        f = getattr(getattr(t, "m_Father", None), "path_id", 0)
        (children[f].append(pid) if f in children else roots.append(pid))

    def name_of(pid):
        go = go_of.get(pid)
        return getattr(go, "m_Name", "node") if go else "node"

    if a.list:
        def top(pid, depth=0):
            print("  " * depth + f"- {name_of(pid)} ({len(children[pid])} enf.)")
            if depth < 1:
                for c in children[pid]:
                    top(c, depth + 1)
        for r in roots:
            top(r)
        return

    # maillages par GameObject, via MeshFilter
    for o in objs:
        if o.type.name != "MeshFilter":
            continue
        try:
            mf = o.read(check_read=False)
            mesh_of[mf.m_GameObject.path_id] = mf.m_Mesh
        except Exception:
            pass

    # maillages skinnes : le maillage vit sur le renderer, pas sur un MeshFilter
    skin_of = {}
    for o in objs:
        if o.type.name != "SkinnedMeshRenderer":
            continue
        try:
            r = o.read(check_read=False)
            m = getattr(r, "m_Mesh", None)
            if not (m and getattr(m, "path_id", 0)):
                continue
            gid = r.m_GameObject.path_id
            mesh_of.setdefault(gid, m)
            skin_of[gid] = r
        except Exception:
            pass

    # racines animees : les clips sont soit listes directement sur un
    # composant Animation, soit atteints via le controleur d'un Animator
    anim_of = collections.defaultdict(list)
    for o in objs:
        if o.type.name not in ("Animation", "Animator"):
            continue
        try:
            d = o.read(check_read=False)
            gid = d.m_GameObject.path_id
        except Exception:
            continue
        # Un objet porte souvent plusieurs clips alors qu'un seul demarre. On
        # marque donc celui qui joue par defaut ; les autres sortent quand meme
        # mais prefixes, pour que le moteur ne les superpose pas.
        refs = []
        # composant Animation : m_Animation designe le clip par defaut ; a
        # defaut, on retient le premier de m_Animations
        main = getattr(getattr(d, "m_Animation", None), "path_id", 0)
        listed = [v for v in (getattr(d, "m_Animations", None) or [])
                  if getattr(v, "path_id", 0)]
        if not main and listed:
            main = listed[0].path_id
        for v in listed:
            refs.append((v, v.path_id == main))
        if main and not any(r.path_id == main for r, _ in refs):
            refs.append((d.m_Animation, True))
        ctrl = getattr(d, "m_Controller", None)
        if ctrl is not None and getattr(ctrl, "path_id", 0):
            try:
                c = read_lenient(ctrl)
                clips = [v for v in (getattr(c, "m_AnimationClips", None) or [])
                         if getattr(v, "path_id", 0)]
                default = controller_default_clip(c)
                for i, v in enumerate(clips):
                    refs.append((v, default is None or i == default))
            except Exception:
                pass
        seen = {}
        for r, is_default in refs:
            seen[r.path_id] = (r, seen.get(r.path_id, (None, False))[1] or is_default)
        anim_of[gid].extend(seen.values())

    # materiaux par GameObject, via MeshRenderer / SkinnedMeshRenderer
    mat_of = {}
    for o in objs:
        if o.type.name not in ("MeshRenderer", "SkinnedMeshRenderer"):
            continue
        try:
            r = o.read(check_read=False)
            ms = getattr(r, "m_Materials", None) or []
            if ms:
                # une seule primitive par maillage (les sous-maillages sont
                # fusionnes a la lecture de l'OBJ) : on garde le premier materiau
                mat_of[r.m_GameObject.path_id] = ms[0]
        except Exception:
            pass

    # Table hachage -> nom d'os des Avatar : indispensable pour rattacher les
    # courbes d'un clip Mecanim, qui ne designent leurs cibles que par un CRC32.
    # Elle se lit sur l'environnement entier, pas sur `objs` : les Avatar vivent
    # dans sharedassets0/1, jamais dans level0.
    tos = avatar_tos(env.objects)

    targets = a.root or [name_of(p) for p in roots]
    for target in targets:
        match = [p for p in transforms if name_of(p) == target]
        if not match:
            print(f"  racine '{target}' introuvable, ignoree")
            continue
        export_subtree(match[0], target, transforms, children, go_of, mesh_of,
                       mat_of, skin_of, anim_of, name_of, tos, a)


def export_subtree(root_pid, label, transforms, children, go_of, mesh_of, mat_of,
                   skin_of, anim_of, name_of, tos, a):
    """Ecrit un .gltf + .bin pour un sous-arbre."""
    g = Gltf()
    mesh_cache = {}
    node_index = {}       # transform path_id -> index de noeud glTF
    skinned_nodes = []    # (index de noeud, GameObject) a relier a un skin
    animated_roots = []   # (transform, GameObject) portant des clips
    stats = collections.Counter({"nodes": 0, "meshes": 0, "skipped": 0})

    def emit_mesh(ptr, material_index, want_skin=False):
        # un meme maillage peut etre instancie avec des materiaux differents :
        # la cle de cache doit donc inclure le materiau
        pid = getattr(ptr, "path_id", 0)
        if not pid:
            return None
        key = (pid, material_index, want_skin)
        if key in mesh_cache:
            return mesh_cache[key]
        if stats["meshes"] >= a.max_meshes:
            return None
        try:
            m = read_lenient(ptr)
            pos, nrm, uv, idx, skin = decode_mesh(m)
            if not pos or not idx:
                raise ValueError("maillage vide")
        except Exception:
            stats["skipped"] += 1
            mesh_cache[key] = None
            return None
        attrs = {"POSITION": g.add_attr(pos, 3),
                 "NORMAL": g.add_attr(nrm, 3),
                 "TEXCOORD_0": g.add_attr(uv, 2)}
        if skin and want_skin:
            attrs["JOINTS_0"] = g.add_joints(skin["joints"])
            attrs["WEIGHTS_0"] = g.add_weights(skin["weights"])
            stats["maillages skinnes"] += 1
        prim = {"attributes": attrs, "indices": g.add_indices(idx)}
        if material_index is not None:
            prim["material"] = material_index
        g.meshes.append({"name": getattr(m, "m_Name", "mesh"), "primitives": [prim]})
        mesh_cache[key] = len(g.meshes) - 1
        stats["meshes"] += 1
        return mesh_cache[key]

    def emit_node(pid):
        t = transforms[pid]
        lp, lr, ls = t.m_LocalPosition, t.m_LocalRotation, t.m_LocalScale
        node = {
            "name": name_of(pid),
            # inversion de Z : la translation suit, le quaternion devient (-x,-y,z,w)
            "translation": [float(lp.x), float(lp.y), -float(lp.z)],
            "rotation": [-float(lr.x), -float(lr.y), float(lr.z), float(lr.w)],
            "scale": [float(ls.x), float(ls.y), float(ls.z)],
        }
        gid = getattr(getattr(t, "m_GameObject", None), "path_id", 0)
        if gid in anim_of:
            animated_roots.append((pid, gid))
        if gid in mesh_of:
            mat_idx = None
            if gid in mat_of:
                mat_idx = export_material(g, mat_of[gid], tex_dir, out_dir,
                                          a.max_texture, a.texture_quality,
                                          a.normal_quality)
            mi = emit_mesh(mesh_of[gid], mat_idx, gid in skin_of)
            if mi is not None:
                node["mesh"] = mi
                if gid in skin_of:
                    skinned_nodes.append((len(g.nodes), gid))
        kids = [emit_node(c) for c in children.get(pid, [])]
        kids = [k for k in kids if k is not None]
        if kids:
            node["children"] = kids
        g.nodes.append(node)
        node_index[pid] = len(g.nodes) - 1
        stats["nodes"] += 1
        return len(g.nodes) - 1

    out = a.out or f"data/gltf/{label.lower()}.gltf"
    out_dir = os.path.dirname(out) or "."
    tex_dir = "textures"
    os.makedirs(out_dir, exist_ok=True)

    top = emit_node(root_pid)

    # Squelettes. Les os sont des Transform ; il faut donc que chacun ait ete
    # emis comme noeud, ce qui n'est vrai que s'il appartient au sous-arbre
    # exporte. Un squelette dont un os manque est ignore plutot que fausse.
    for node_idx, gid in skinned_nodes:
        r = skin_of.get(gid)
        if r is None:
            continue
        try:
            bones = [b.path_id for b in (r.m_Bones or [])]
            joints = [node_index[b] for b in bones]
        except (KeyError, AttributeError):
            stats["squelettes incomplets"] += 1
            continue
        if not joints:
            continue
        try:
            mesh = read_lenient(r.m_Mesh)
            poses = [flip_bindpose(m) for m in (mesh.m_BindPose or [])]
        except Exception:
            poses = []
        skin = {"joints": joints}
        if len(poses) == len(joints):
            skin["inverseBindMatrices"] = g.add_matrices(poses)
        g.skins.append(skin)
        g.nodes[node_idx]["skin"] = len(g.skins) - 1
        stats["squelettes"] += 1

    # --- animations ---
    #
    # Une courbe Unity est reperee par un CHEMIN de hierarchie relatif a l'objet
    # anime ("Bras/AvantBras/Main"). Il faut donc le resoudre en descendant par
    # les noms, puis le traduire en index de noeud glTF.
    def resolve_path(root_tr, path):
        cur = root_tr
        if path:
            for part in path.split("/"):
                nxt = None
                for c in children.get(cur, []):
                    if name_of(c) == part:
                        nxt = c
                        break
                if nxt is None:
                    return None
                cur = nxt
        return node_index.get(cur)

    # Un clip Mecanim ne designe pas ses cibles par un chemin mais par le CRC32
    # du nom de l'os. On indexe donc les noms du sous-arbre anime.
    name_cache = {}

    def names_in(root_tr):
        if root_tr in name_cache:
            return name_cache[root_tr]
        found, stack = {}, [root_tr]
        while stack:
            cur = stack.pop()
            if cur in node_index:
                found.setdefault(name_of(cur), node_index[cur])
            stack.extend(children.get(cur, []))
        name_cache[root_tr] = found
        return found

    def mecanim_channels(clip, root_tr, channels, samplers):
        """Ajoute les canaux d'un clip Mecanim decode par lib_muscle."""
        bones = decode_clip(clip, tos, tangents=True)
        if not bones:
            stats["clips mecanim vides"] += 1
            return
        stats["clips mecanim lus"] += 1
        names = names_in(root_tr)
        for bone, attrs in bones.items():
            node = names.get(bone)
            if node is None:
                stats["os mecanim non resolus"] += 1
                continue
            for path_name, attr in attrs.items():
                rot = path_name == "rotation"
                conv = flip_quat_t if rot else flip_vec3_t
                dim = 4 if rot else 3
                cubic = isinstance(attr, dict)
                keys = attr["keys"] if cubic else attr
                if cubic:
                    # glTF CUBICSPLINE : trois elements par cle, dans l'ordre
                    # tangente d'entree, valeur, tangente de sortie. Les
                    # tangentes d'Unity comme celles de glTF sont des derivees
                    # par unite de TEMPS : elles se transportent telles quelles,
                    # sans mise a l'echelle par le pas de temps.
                    values = []
                    for i, (_, v) in enumerate(keys):
                        values.append(conv(attr["in"][i]))
                        values.append(conv(v))
                        values.append(conv(attr["out"][i]))
                else:
                    values = [conv(v) for _, v in keys]
                samplers.append({"input": g.add_times([t for t, _ in keys]),
                                 "output": g.add_values(values, dim),
                                 "interpolation": "CUBICSPLINE" if cubic else "LINEAR"})
                channels.append({"sampler": len(samplers) - 1,
                                 "target": {"node": node, "path": path_name}})
                stats["cubique" if cubic else "lineaire"] += 1

    for root_tr, gid in animated_roots:
        for ref, is_default in anim_of.get(gid, []):
            try:
                clip = read_lenient(ref)
            except Exception:
                stats["clips illisibles"] += 1
                continue
            if getattr(clip, "m_Compressed", False):
                stats["clips compresses"] += 1
                continue
            # Deux familles coexistent. m_AnimationType == 1 designe les clips
            # « legacy », dont les courbes sont lisibles telles quelles.
            # m_AnimationType == 2 designe Mecanim : ces trois listes sont vides
            # et tout vit dans m_MuscleClip, que lib_muscle sait decoder.
            n_curves = sum(len(getattr(clip, k, None) or [])
                           for k in ("m_PositionCurves", "m_RotationCurves",
                                     "m_ScaleCurves"))
            channels, samplers = [], []
            if n_curves == 0:
                mecanim_channels(clip, root_tr, channels, samplers)
            else:
                stats["clips lus"] += 1
            # la boucle suivante ne fait rien sur un clip Mecanim : ses trois
            # listes de courbes sont vides
            for curves, path_name, conv, dim in (
                    (getattr(clip, "m_PositionCurves", None), "translation", flip_vec3, 3),
                    (getattr(clip, "m_RotationCurves", None), "rotation", flip_quat, 4),
                    (getattr(clip, "m_ScaleCurves", None), "scale",
                     lambda v: [float(v.x), float(v.y), float(v.z)], 3)):
                for c in (curves or []):
                    node = resolve_path(root_tr, getattr(c, "path", "") or "")
                    if node is None:
                        stats["courbes non resolues"] += 1
                        continue
                    keys = curve_keys(c)
                    if len(keys) < 2:
                        continue
                    # cubique si les deux tangentes sont la et finies, sinon
                    # lineaire : mieux vaut une interpolation assumee qu'une
                    # tangente inventee
                    try:
                        values = [conv(v) for _, v, _, _ in keys]
                    except Exception:
                        continue
                    cubic = all(k[2] is not None and k[3] is not None for k in keys)
                    if cubic:
                        try:
                            tang = [(conv(k[2]), conv(k[3])) for k in keys]
                            cubic = all(math.isfinite(x) for a, b in tang
                                        for x in (*a, *b))
                        except Exception:
                            cubic = False
                    if cubic:
                        values = [c for i, v in enumerate(values)
                                  for c in (tang[i][0], v, tang[i][1])]
                    samplers.append({"input": g.add_times([t for t, _, _, _ in keys]),
                                     "output": g.add_values(values, dim),
                                     "interpolation": "CUBICSPLINE" if cubic else "LINEAR"})
                    channels.append({"sampler": len(samplers) - 1,
                                     "target": {"node": node, "path": path_name}})
                    stats["cubique" if cubic else "lineaire"] += 1
            if channels:
                # « Objet|Clip » pour le clip par defaut, prefixe « ~ » pour les
                # autres : le moteur web ne demarre que les premiers, sans quoi
                # deux clips se disputeraient les memes os.
                label_anim = f"{name_of(root_tr)}|{getattr(clip, 'm_Name', 'clip')}"
                g.animations.append({"name": label_anim if is_default else "~" + label_anim,
                                     "samplers": samplers, "channels": channels})
                stats["animations"] += 1
                stats["canaux"] += len(channels)


    binname = os.path.splitext(os.path.basename(out))[0] + ".bin"
    with open(os.path.join(os.path.dirname(out) or ".", binname), "wb") as fh:
        fh.write(g.buf)

    doc = {
        "asset": {"version": "2.0", "generator": "outerwildsjs/08_export_gltf"},
        "scene": 0,
        "scenes": [{"nodes": [top]}],
        "nodes": g.nodes,
        "meshes": g.meshes,
        "materials": g.materials or [
            {"name": "default",
             "pbrMetallicRoughness": {"baseColorFactor": [0.75, 0.75, 0.78, 1.0],
                                      "metallicFactor": 0.0, "roughnessFactor": 0.9}}],
        "accessors": g.accessors,
        "bufferViews": g.views,
        "buffers": [{"uri": binname, "byteLength": len(g.buf)}],
    }
    if g.skins:
        doc["skins"] = g.skins
    if g.animations:
        doc["animations"] = g.animations
    if g.images:
        doc["images"] = g.images
        doc["textures"] = g.textures
        # 10497 = repeat ; le filtrage lineaire avec mipmaps convient partout ici
        doc["samplers"] = [{"magFilter": 9729, "minFilter": 9987,
                            "wrapS": 10497, "wrapT": 10497}]
    with open(out, "w") as fh:
        json.dump(doc, fh)

    print(f"  {label:24s} {stats['nodes']:5d} noeuds, {stats['meshes']:4d} maillages "
          f"({stats['skipped']} ignores), {len(g.materials):3d} materiaux, "
          f"{len(g.images):3d} textures, {stats['squelettes']:3d} squelettes "
          f"({stats['maillages skinnes']} maillages skinnes), "
          f"{stats['animations']:3d} animations ({stats['canaux']} canaux, "
          f"{stats['cubique']} cubiques, {stats['lineaire']} lineaires, "
          f"{stats['os mecanim non resolus']} os non resolus), "
          f"{len(g.buf)/1e6:5.1f} Mo -> {out}")


if __name__ == "__main__":
    main()
