"""Decodage des clips Mecanim d'Unity 4 (m_MuscleClip).

Un AnimationClip dont m_AnimationType vaut 2 (« Generic », le Mecanim non
humanoide) laisse m_PositionCurves, m_RotationCurves et m_ScaleCurves vides :
toutes les courbes vivent dans m_MuscleClip, une structure ClipMuscleConstant
que UnityPy sait lire mais pas interpreter. Sans ce module, les neuf clips
Mecanim du build (les villageois, l'astronome, la meduse, l'anglerfish) sortent
en pose de repos.

Le format, verifie sur les neuf clips du build :

  m_MuscleClip.m_Clip.data
    ├─ m_StreamedClip   flux d'entiers 32 bits, le seul utilise ici
    ├─ m_DenseClip      echantillons a pas fixe (vide dans ce build)
    ├─ m_ConstantClip   valeurs constantes (vide dans ce build)
    └─ m_Binding.data.m_ValueArray   une entree par courbe scalaire

Le flux se lit par images :

  [temps: float] [nb de cles: uint] puis, par cle,
  [indice de courbe: uint] [4 coefficients: float]

Les coefficients decrivent le polynome cubique du segment ; le quatrieme est la
valeur au temps de l'image, c'est celui qu'on echantillonne. La premiere image
porte le temps -FLT_MAX et la derniere +inf : ce sont des sentinelles, pas des
donnees.

Chaque entree de m_ValueArray porte deux hachages CRC32 : m_ID designe l'os
(a resoudre via la table m_TOS d'un Avatar) et m_TypeID l'attribut anime.
Dix m_TypeID couvrent tout le build, groupes en 3 + 4 + 3 :

    position   4174552735, 2413145609, 383582131        -> x, y, z
    rotation   2211994246, 4108282384, 1842756522, 325535511 -> x, y, z, w
    echelle    1512518241, 757072631, 3022607181        -> x, y, z

L'ordre des composantes suit l'ordre d'apparition dans m_ValueArray. Il a ete
valide de deux facons : les quaternions ainsi reassembles ont une norme de
1.00000, et les positions decodees a t=0 retombent sur les m_LocalPosition des
os dans la scene a la quatrieme decimale.

Les valeurs restent dans le repere Unity (main gauche) ; la conversion vers
glTF appartient a l'appelant.
"""
import math
import struct

POSITION_ATTRS = (4174552735, 2413145609, 383582131)
ROTATION_ATTRS = (2211994246, 4108282384, 1842756522, 325535511)
SCALE_ATTRS = (1512518241, 757072631, 3022607181)

_KIND = {}
for _h in POSITION_ATTRS:
    _KIND[_h] = ("translation", 3)
for _h in ROTATION_ATTRS:
    _KIND[_h] = ("rotation", 4)
for _h in SCALE_ATTRS:
    _KIND[_h] = ("scale", 3)


def _u2f(u):
    """Reinterprete un uint32 en float32 : le flux stocke les deux melanges."""
    return struct.unpack("<f", struct.pack("<I", u & 0xFFFFFFFF))[0]


def avatar_tos(objects):
    """Table hachage -> nom d'os, fusionnee sur tous les Avatar du build.

    Les cles sont des CRC32 du nom du GameObject (verifie : zlib.crc32(nom)),
    donc deux avatars qui partagent un os partagent aussi la cle. La fusion est
    sans ambiguite et evite d'avoir a retrouver l'Avatar de chaque clip.
    """
    tos = {}
    for o in objects:
        if o.type.name != "Avatar":
            continue
        try:
            table = o.read(check_read=False).m_TOS
        except Exception:
            continue
        for key, value in (table or []):
            tos.setdefault(key, value)
    return tos


def _next_in_slope(dx, coeff, value, next_value):
    """Pente d'ENTREE de la cle suivante, deduite du polynome du segment.

    Unity ne range pas les deux pentes : il range le cubique du segment, dont
    coeff[2] est la pente de sortie. La pente d'entree de la cle suivante s'en
    deduit en derivant le polynome a son extremite.

    Un segment dont les trois premiers coefficients sont nuls est CONSTANT :
    le polynome se reduit a coeff[3]. Unity y range une pente infinie pour
    signaler un palier, mais la tangente de Hermite correcte y est 0 — la valeur
    ne bouge pas, sa derivee est nulle. C'est ce que glTF attend, et c'est le
    cas le plus frequent : un os qui ne bouge pas d'une cle a l'autre.
    """
    if coeff[0] == 0.0 and coeff[1] == 0.0 and coeff[2] == 0.0:
        return 0.0
    dx = max(dx, 1e-4)
    dy = next_value - value
    d1 = coeff[2] * dx
    return (3.0 * dy - d1 - d1 - coeff[1] * dx * dx) / dx


def _streamed_curves(streamed, tangents=False):
    """{indice de courbe: [(temps, valeur)]} pour le flux entrelace.

    Avec `tangents`, chaque cle devient (temps, valeur, entree, sortie) : la
    pente de sortie est coeff[2], la pente d'entree se deduit du segment
    precedent.
    """
    raw = getattr(streamed, "data", None) or []
    curves = {}
    i, n = 0, len(raw)
    while i + 1 < n:
        time = _u2f(raw[i]); i += 1
        count = raw[i]; i += 1
        end = i + count * 5
        if end > n:
            break
        keep = math.isfinite(time)   # ecarte les images sentinelles
        while i < end:
            index = raw[i]
            coeff = [_u2f(raw[i + 1 + j]) for j in range(4)]
            i += 5
            if keep:
                curves.setdefault(index, []).append((time, coeff[3], coeff))
    if not tangents:
        return {k: [(t, v) for t, v, _ in ks] for k, ks in curves.items()}

    out = {}
    for k, ks in curves.items():
        keys = []
        for j, (t, v, coeff) in enumerate(ks):
            out_slope = coeff[2]
            if j + 1 < len(ks):
                nt, nv, _ = ks[j + 1]
                nxt_in = _next_in_slope(nt - t, coeff, v, nv)
            else:
                nxt_in = 0.0
            keys.append([t, v, 0.0, out_slope, nxt_in])
        # la pente d'entree d'une cle est celle que lui legue le segment d'avant
        for j in range(1, len(keys)):
            keys[j][2] = keys[j - 1][4]
        if keys:
            keys[0][2] = keys[0][3]
        out[k] = [(t, v, i_, o) for t, v, i_, o, _ in keys]
    return out


def _dense_curves(dense, base):
    """Courbes a pas fixe, indexees a partir de `base`."""
    samples = getattr(dense, "m_SampleArray", None) or []
    count = int(getattr(dense, "m_CurveCount", 0) or 0)
    if not samples or count <= 0:
        return {}
    rate = float(getattr(dense, "m_SampleRate", 0) or 0) or 30.0
    begin = float(getattr(dense, "m_BeginTime", 0) or 0)
    frames = len(samples) // count
    curves = {}
    for c in range(count):
        curves[base + c] = [(begin + f / rate, float(samples[f * count + c]))
                            for f in range(frames)]
    return curves


def _constant_curves(constant, base, start, stop):
    """Courbes constantes : deux cles suffisent a couvrir le clip."""
    values = getattr(constant, "data", None) or []
    return {base + c: [(start, float(v)), (stop, float(v))]
            for c, v in enumerate(values)}


def _sample(keys, t):
    """Valeur d'une courbe scalaire au temps t, par interpolation lineaire."""
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    lo, hi = 0, len(keys) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if keys[mid][0] <= t:
            lo = mid
        else:
            hi = mid
    t0, v0 = keys[lo]
    t1, v1 = keys[hi]
    if t1 == t0:
        return v1
    return v0 + (v1 - v0) * (t - t0) / (t1 - t0)


def decode_clip(clip, tos, tangents=False):
    """Courbes d'un clip Mecanim, en repere Unity.

    Retourne {nom d'os: {"translation"|"rotation"|"scale": [(temps, tuple)]}}.
    Les composantes d'un meme attribut n'ont pas forcement les memes temps de
    cle : on prend l'union des temps et on interpole les composantes manquantes,
    seule facon d'obtenir les vecteurs que glTF exige.

    Avec `tangents`, chaque attribut devient
    {"keys": [(temps, tuple)], "in": [tuple], "out": [tuple]} — mais SEULEMENT
    si toutes ses composantes partagent exactement les memes temps de cle. Sinon
    interpoler une valeur manquante obligerait a inventer sa tangente, et le
    resultat serait pire qu'une interpolation lineaire assumee.
    """
    muscle = getattr(clip, "m_MuscleClip", None)
    if muscle is None:
        return {}
    holder = getattr(muscle, "m_Clip", None)
    inner = getattr(holder, "data", None) if holder is not None else None
    if inner is None:
        return {}
    binding = getattr(inner, "m_Binding", None)
    values = getattr(getattr(binding, "data", None), "m_ValueArray", None) or []
    if not values:
        return {}

    streamed = getattr(inner, "m_StreamedClip", None)
    dense = getattr(inner, "m_DenseClip", None)
    constant = getattr(inner, "m_ConstantClip", None)

    curves = {}
    n_streamed = 0
    if streamed is not None:
        curves.update(_streamed_curves(streamed, tangents))
        n_streamed = int(getattr(streamed, "curveCount", 0) or 0)
    n_dense = 0
    if dense is not None:
        curves.update(_dense_curves(dense, n_streamed))
        n_dense = int(getattr(dense, "m_CurveCount", 0) or 0)
    if constant is not None:
        start = float(getattr(muscle, "m_StartTime", 0.0) or 0.0)
        stop = float(getattr(muscle, "m_StopTime", 0.0) or 0.0)
        curves.update(_constant_curves(constant, n_streamed + n_dense, start, stop))
    if not curves:
        return {}

    # une entree de m_ValueArray = une composante ; on les regroupe par
    # (os, attribut) dans leur ordre d'apparition, qui donne x, y, z[, w]
    slots = {}
    for i, v in enumerate(values):
        kind = _KIND.get(getattr(v, "m_TypeID", None))
        if kind is None:
            continue
        name = tos.get(getattr(v, "m_ID", None))
        if name is None:
            continue
        path, dim = kind
        comps = slots.setdefault((name, path, dim), [])
        if len(comps) < dim:
            comps.append(curves.get(i))

    out = {}
    for (name, path, dim), comps in slots.items():
        if len(comps) != dim or any(c is None for c in comps):
            continue
        times = sorted({k[0] for c in comps for k in c})
        if len(times) < 2:
            continue
        plain = [(t, tuple(_sample([(k[0], k[1]) for k in c], t) for c in comps))
                 for t in times]
        if not tangents:
            out.setdefault(name, {})[path] = plain
            continue
        aligned = all(len(c) == len(times) and
                      all(abs(c[i][0] - times[i]) < 1e-6 for i in range(len(times)))
                      for c in comps)
        finite = all(math.isfinite(k[2]) and math.isfinite(k[3])
                     for c in comps for k in c)
        if aligned and finite:
            out.setdefault(name, {})[path] = {
                "keys": plain,
                "in": [tuple(c[i][2] for c in comps) for i in range(len(times))],
                "out": [tuple(c[i][3] for c in comps) for i in range(len(times))],
            }
        else:
            out.setdefault(name, {})[path] = plain
    return out
