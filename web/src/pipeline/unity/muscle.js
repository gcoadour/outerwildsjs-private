// Decodage des clips Mecanim d'Unity 4 (m_MuscleClip).
// Portage de tools/lib_muscle.py.
//
// Un AnimationClip dont m_AnimationType vaut 2 (« Generic », le Mecanim non
// humanoide) laisse m_PositionCurves, m_RotationCurves et m_ScaleCurves vides :
// toutes les courbes vivent dans m_MuscleClip. Sans ce module, les neuf clips
// Mecanim du build -- les villageois, l'astronome, la meduse, l'anglerfish --
// sortent en pose de repos.
//
// Le format, tel que le decrit docs/26-muscleclip.md :
//
//   m_MuscleClip.m_Clip.data
//     ├─ m_StreamedClip   flux d'entiers 32 bits, le seul utilise ici
//     ├─ m_DenseClip      echantillons a pas fixe (vide dans ce build)
//     ├─ m_ConstantClip   valeurs constantes (absent du format 4.1)
//     └─ m_Binding.data.m_ValueArray   une entree par courbe scalaire
//
// Le flux se lit par images :
//
//   [temps: float] [nb de cles: uint] puis, par cle,
//   [indice de courbe: uint] [4 coefficients: float]
//
// Les coefficients decrivent le polynome cubique du segment ; le quatrieme est
// la valeur au temps de l'image, c'est celui qu'on echantillonne. Les images
// d'encadrement portent un temps non fini : ce sont des sentinelles, pas des
// donnees.
//
// Les valeurs restent dans le repere Unity (main gauche) ; la conversion vers
// glTF appartient a l'appelant.

const POSITION_ATTRS = [4174552735, 2413145609, 383582131];
const ROTATION_ATTRS = [2211994246, 4108282384, 1842756522, 325535511];
const SCALE_ATTRS = [1512518241, 757072631, 3022607181];

/** m_TypeID -> attribut anime et nombre de composantes. */
const KIND = new Map();
for (const h of POSITION_ATTRS) KIND.set(h, ["translation", 3]);
for (const h of ROTATION_ATTRS) KIND.set(h, ["rotation", 4]);
for (const h of SCALE_ATTRS) KIND.set(h, ["scale", 3]);

const U32 = new Uint32Array(1);
const F32 = new Float32Array(U32.buffer);

/** Reinterprete un uint32 en float32 : le flux stocke les deux melanges. */
function u2f(u) {
  U32[0] = u >>> 0;
  return F32[0];
}

const TOS_CACHE = new WeakMap();

/**
 * Table hachage -> nom d'os, fusionnee sur tous les Avatar du monde.
 *
 * Les cles sont des CRC32 du nom du GameObject, donc deux avatars qui partagent
 * un os partagent aussi la cle : la fusion est sans ambiguite et evite d'avoir a
 * retrouver l'Avatar de chaque clip. Les Avatar vivent dans sharedassets0/1,
 * jamais dans level0 : construire la table sur la seule scene la rend vide,
 * donc zero os resolu, donc zero animation, et sans la moindre erreur.
 *
 * La table est memoisee par contexte : les neuf sous-arbres exportes la
 * demandent chacun, et la reconstruire ferait relire les dix Avatar du build.
 */
export function avatarTOS(ctx) {
  const cached = TOS_CACHE.get(ctx);
  if (cached) return cached;
  const tos = new Map();
  for (const o of ctx.env.objects({ type: "Avatar" })) {
    const v = ctx.readEngine(o);
    for (const pair of (v && v.m_TOS) || []) {
      if (pair && !tos.has(pair.first)) tos.set(pair.first, pair.second);
    }
  }
  TOS_CACHE.set(ctx, tos);
  return tos;
}

/**
 * Pente d'ENTREE de la cle suivante, deduite du polynome du segment.
 *
 * Unity ne range pas les deux pentes : il range le cubique du segment, dont
 * coeff[2] est la pente de sortie. La pente d'entree de la cle suivante s'en
 * deduit en derivant le polynome a son extremite.
 *
 * Un segment dont les trois premiers coefficients sont nuls est CONSTANT : le
 * polynome se reduit a coeff[3]. Unity y range une pente infinie pour signaler
 * un palier, mais la tangente de Hermite correcte y est 0 -- la valeur ne bouge
 * pas, sa derivee est nulle. C'est ce que glTF attend, et c'est le cas le plus
 * frequent : un os qui ne bouge pas d'une cle a l'autre.
 */
function nextInSlope(dx, coeff, value, nextValue) {
  if (coeff[0] === 0 && coeff[1] === 0 && coeff[2] === 0) return 0;
  const d = Math.max(dx, 1e-4);
  const dy = nextValue - value;
  const d1 = coeff[2] * d;
  return (3 * dy - d1 - d1 - coeff[1] * d * d) / d;
}

/**
 * Courbes du flux entrelace : Map<indice de courbe, cles>.
 *
 * Sans `tangents`, une cle est [temps, valeur] ; avec, elle devient
 * [temps, valeur, pente d'entree, pente de sortie] -- la pente de sortie est
 * coeff[2], la pente d'entree se deduit du segment precedent.
 */
function streamedCurves(streamed, tangents) {
  const raw = (streamed && streamed.data) || [];
  const curves = new Map();
  const n = raw.length;
  let i = 0;
  while (i + 1 < n) {
    const time = u2f(raw[i]); i++;
    const count = raw[i] >>> 0; i++;
    const end = i + count * 5;
    if (end > n) break;
    const keep = Number.isFinite(time);   // ecarte les images sentinelles
    while (i < end) {
      const index = raw[i] >>> 0;
      const coeff = [u2f(raw[i + 1]), u2f(raw[i + 2]), u2f(raw[i + 3]), u2f(raw[i + 4])];
      i += 5;
      if (!keep) continue;
      if (!curves.has(index)) curves.set(index, []);
      curves.get(index).push([time, coeff[3], coeff]);
    }
  }
  if (!tangents) {
    for (const [k, keys] of curves) curves.set(k, keys.map(([t, v]) => [t, v]));
    return curves;
  }

  const out = new Map();
  for (const [k, keys] of curves) {
    const built = keys.map(([t, v, coeff], j) => {
      const next = keys[j + 1];
      const carried = next ? nextInSlope(next[0] - t, coeff, v, next[1]) : 0;
      return [t, v, 0, coeff[2], carried];
    });
    // la pente d'entree d'une cle est celle que lui legue le segment d'avant
    for (let j = 1; j < built.length; j++) built[j][2] = built[j - 1][4];
    if (built.length) built[0][2] = built[0][3];
    out.set(k, built.map(([t, v, inS, outS]) => [t, v, inS, outS]));
  }
  return out;
}

/** Courbes a pas fixe, indexees a partir de `base`. */
function denseCurves(dense, base, into) {
  const samples = (dense && dense.m_SampleArray) || [];
  const count = Number((dense && dense.m_CurveCount) || 0);
  if (!samples.length || count <= 0) return;
  const rate = Number(dense.m_SampleRate || 0) || 30;
  const begin = Number(dense.m_BeginTime || 0);
  const frames = Math.floor(samples.length / count);
  for (let c = 0; c < count; c++) {
    const keys = new Array(frames);
    for (let f = 0; f < frames; f++) keys[f] = [begin + f / rate, samples[f * count + c]];
    into.set(base + c, keys);
  }
}

/**
 * Courbes constantes : deux cles suffisent a couvrir le clip.
 *
 * Le type tree d'Unity 4.1 n'a pas de m_ConstantClip -- le cas est traite parce
 * que rien ne garantit qu'une autre version fasse pareil.
 */
function constantCurves(constant, base, start, stop, into) {
  const values = (constant && constant.data) || [];
  values.forEach((v, c) => into.set(base + c, [[start, v], [stop, v]]));
}

/** Valeur d'une courbe scalaire au temps t, par interpolation lineaire. */
function sample(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid][0] <= t) lo = mid; else hi = mid;
  }
  const [t0, v0] = keys[lo], [t1, v1] = keys[hi];
  if (t1 === t0) return v1;
  return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
}

/**
 * Courbes d'un clip Mecanim, en repere Unity.
 *
 * Retourne une Map nom d'os -> { translation|rotation|scale: attribut }. Les
 * composantes d'un meme attribut n'ont pas forcement les memes temps de cle : on
 * prend l'union des temps et on interpole les composantes manquantes, seule
 * facon d'obtenir les vecteurs que glTF exige.
 *
 * Sans `tangents`, un attribut est la liste [temps, composantes]. Avec, il
 * devient { keys, in, out } -- mais SEULEMENT si toutes ses composantes
 * partagent exactement les memes temps de cle. Sinon interpoler une valeur
 * manquante obligerait a inventer sa tangente, et le resultat serait pire
 * qu'une interpolation lineaire assumee.
 */
export function decodeClip(clip, tos, { tangents = false } = {}) {
  const out = new Map();
  const muscle = clip && clip.m_MuscleClip;
  const inner = muscle && muscle.m_Clip && muscle.m_Clip.data;
  if (!inner) return out;
  const binding = inner.m_Binding && inner.m_Binding.data;
  const values = (binding && binding.m_ValueArray) || [];
  if (!values.length) return out;

  const curves = streamedCurves(inner.m_StreamedClip, tangents);
  const nStreamed = Number((inner.m_StreamedClip && inner.m_StreamedClip.curveCount) || 0);
  denseCurves(inner.m_DenseClip, nStreamed, curves);
  const nDense = Number((inner.m_DenseClip && inner.m_DenseClip.m_CurveCount) || 0);
  if (inner.m_ConstantClip) {
    constantCurves(inner.m_ConstantClip, nStreamed + nDense,
                   Number(muscle.m_StartTime || 0), Number(muscle.m_StopTime || 0), curves);
  }
  if (!curves.size) return out;

  // une entree de m_ValueArray = une composante ; on les regroupe par
  // (os, attribut) dans leur ordre d'apparition, qui donne x, y, z[, w]
  const slots = new Map();
  values.forEach((v, i) => {
    const kind = v && KIND.get(v.m_TypeID);
    if (!kind) return;
    const name = v && tos.get(v.m_ID);
    if (name === undefined) return;
    const [path, dim] = kind;
    const key = `${name}\u0000${path}`;
    let slot = slots.get(key);
    if (!slot) { slot = { name, path, dim, comps: [] }; slots.set(key, slot); }
    if (slot.comps.length < dim) slot.comps.push(curves.get(i) || null);
  });

  for (const { name, path, dim, comps } of slots.values()) {
    if (comps.length !== dim || comps.some((c) => c === null)) continue;
    const times = [...new Set(comps.flatMap((c) => c.map((k) => k[0])))].sort((a, b) => a - b);
    if (times.length < 2) continue;
    const keys = times.map((t) => [t, comps.map((c) => sample(c, t))]);
    let attr = keys;
    if (tangents) {
      const aligned = comps.every((c) => c.length === times.length
        && times.every((t, i) => Math.abs(c[i][0] - t) < 1e-6));
      // Une cle sans tangentes vient du flux dense ou constant, qui n'en range
      // pas : la courbe part alors en lineaire, comme une tangente infinie.
      const finite = comps.every((c) => c.every((k) => Number.isFinite(k[2]) && Number.isFinite(k[3])));
      if (aligned && finite) {
        attr = {
          keys,
          in: times.map((_, i) => comps.map((c) => c[i][2])),
          out: times.map((_, i) => comps.map((c) => c[i][3])),
        };
      }
    }
    if (!out.has(name)) out.set(name, {});
    out.get(name)[path] = attr;
  }
  return out;
}

export const ATTRIBUTE_HASHES = { POSITION_ATTRS, ROTATION_ATTRS, SCALE_ATTRS };
