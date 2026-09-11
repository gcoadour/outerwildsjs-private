// Export d'un sous-arbre de la scene en glTF 2.0.
// Portage de tools/08_export_gltf.py.
//
// Le Python deleguait le decodage des sommets a UnityPy ; ici il est fait par
// unity/mesh.js, verifie contre UnityPy au sommet pres.
//
// Conversion de repere Unity (main gauche) -> glTF (main droite), telle que la
// decrit docs/05-gltf.md : z -> -z sur les positions, normales et translations,
// quaternion (x,y,z,w) -> (-x,-y,z,w), ordre des triangles inverse, et v -> 1-v
// sur les UV.

import { decodeMesh } from "../unity/mesh.js";
import { decodeTexture2D, resizeRGBA } from "../unity/texture.js";
import { avatarTOS, decodeClip } from "../unity/muscle.js";
import { texturePtr } from "./materials.js";

const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126, UNSIGNED_INT = 5125, UNSIGNED_SHORT = 5123;

/** Racines exportees par defaut : les corps du systeme solaire. */
export const DEFAULT_ROOTS = [
  "Sun_Body", "HourglassTwins_Pivot", "TimberHearth_Pivot", "BrittleHollow_Pivot",
  "GiantsDeep_Pivot", "DarkBramble_Pivot", "QuantumMoon_Body", "Comet_Pivot",
  "WhiteHole_Body",
];

class GltfBuilder {
  constructor() {
    this.chunks = [];
    this.length = 0;
    this.bufferViews = [];
    this.accessors = [];
    this.meshes = [];
    this.nodes = [];
    this.images = [];
    this.textures = [];
    this.materials = [];
    this.skins = [];
    this.animations = [];
    this.textureByPid = new Map();
    this.materialByPid = new Map();
  }

  _view(data, target) {
    while (this.length % 4) { this.chunks.push(new Uint8Array(1)); this.length++; }
    const bytes = data instanceof Uint8Array
      ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const entry = { buffer: 0, byteOffset: this.length, byteLength: bytes.length };
    if (target) entry.target = target;
    this.chunks.push(bytes);
    this.length += bytes.length;
    this.bufferViews.push(entry);
    return this.bufferViews.length - 1;
  }

  /** Attribut de sommets : Float32Array deja aplatie. */
  addAttribute(flat, dim, target = ARRAY_BUFFER) {
    const count = flat.length / dim;
    const min = new Array(dim).fill(Infinity);
    const max = new Array(dim).fill(-Infinity);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < dim; c++) {
        const v = flat[i * dim + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    const view = this._view(flat, target);
    this.accessors.push({ bufferView: view, componentType: FLOAT, count,
                          type: { 1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4", 16: "MAT4" }[dim],
                          min, max });
    return this.accessors.length - 1;
  }

  addIndices(idx) {
    const view = this._view(idx, ELEMENT_ARRAY_BUFFER);
    let min = Infinity, max = -Infinity;
    for (const v of idx) { if (v < min) min = v; if (v > max) max = v; }
    this.accessors.push({ bufferView: view, componentType: UNSIGNED_INT,
                          count: idx.length, type: "SCALAR", min: [min], max: [max] });
    return this.accessors.length - 1;
  }

  addJoints(joints) {
    const view = this._view(joints, ARRAY_BUFFER);
    this.accessors.push({ bufferView: view, componentType: UNSIGNED_SHORT,
                          count: joints.length / 4, type: "VEC4" });
    return this.accessors.length - 1;
  }

  addMatrices(mats) {
    const view = this._view(mats);
    this.accessors.push({ bufferView: view, componentType: FLOAT,
                          count: mats.length / 16, type: "MAT4" });
    return this.accessors.length - 1;
  }

  /** Temps d'echantillonnage d'une animation : glTF exige leurs bornes. */
  addTimes(times) {
    const flat = Float32Array.from(times);
    let min = Infinity, max = -Infinity;
    for (const t of flat) { if (t < min) min = t; if (t > max) max = t; }
    const view = this._view(flat);
    this.accessors.push({ bufferView: view, componentType: FLOAT, count: flat.length,
                          type: "SCALAR", min: [min], max: [max] });
    return this.accessors.length - 1;
  }

  /** Valeurs d'une animation : VEC3 pour position et echelle, VEC4 pour rotation. */
  addValues(values, dim) {
    const flat = new Float32Array(values.length * dim);
    values.forEach((v, i) => { for (let c = 0; c < dim; c++) flat[i * dim + c] = v[c]; });
    const view = this._view(flat);
    this.accessors.push({ bufferView: view, componentType: FLOAT, count: values.length,
                          type: dim === 4 ? "VEC4" : "VEC3" });
    return this.accessors.length - 1;
  }

  buffer() {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const c of this.chunks) { out.set(c, at); at += c.length; }
    return out;
  }
}

/** Le mode de transparence se lit dans le nom du shader Unity. */
function alphaMode(shaderName) {
  const n = (shaderName || "").toLowerCase();
  if (n.includes("cutout")) return "MASK";
  if (n.includes("alpha") || n.includes("transparent")) return "BLEND";
  return "OPAQUE";
}

/**
 * Vrai si l'image est une normale au format DXT5nm d'Unity : X dans le canal
 * alpha, Y dans le vert, et un RVB gris qui ne porte rien. La signature est
 * donc un RVB quasi identique d'un canal a l'autre et un alpha qui varie.
 */
function isDXT5nm(img) {
  const { rgba } = img;
  const n = rgba.length / 4;
  const step = Math.max(1, Math.floor(n / 4096));   // echantillonnage
  let sumRG = 0, sumRB = 0, sumA = 0, sumA2 = 0, k = 0;
  for (let i = 0; i < n; i += step) {
    const o = i * 4;
    sumRG += Math.abs(rgba[o] - rgba[o + 1]);
    sumRB += Math.abs(rgba[o] - rgba[o + 2]);
    sumA += rgba[o + 3];
    sumA2 += rgba[o + 3] * rgba[o + 3];
    k++;
  }
  if (!k) return false;
  const grey = sumRG / k < 12 && sumRB / k < 12;
  const variance = sumA2 / k - (sumA / k) ** 2;
  return grey && variance > 9;
}

/**
 * DXT5nm -> normale tangente RVB, telle que glTF l'attend. Sans cette
 * conversion le moteur lit le gris du RVB comme un vecteur, et obtient
 * (y, y, y), qui ne veut rien dire. Z se reconstruit par la contrainte de norme,
 * comme le fait le shader Unity.
 */
function unswizzleNormal(img) {
  const { width, height, rgba } = img;
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const x = rgba[o + 3] / 127.5 - 1;
    const y = rgba[o + 1] / 127.5 - 1;
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    out[o] = Math.min(255, Math.max(0, (x + 1) * 127.5));
    out[o + 1] = Math.min(255, Math.max(0, (y + 1) * 127.5));
    out[o + 2] = Math.min(255, Math.max(0, (z + 1) * 127.5));
    out[o + 3] = 255;
  }
  return { width, height, rgba: out, format: "normal" };
}

// --- animations -------------------------------------------------------------
//
// La conversion de repere est la meme que pour les noeuds, mais les valeurs
// arrivent sous deux formes : structures {x, y, z[, w]} pour les clips legacy,
// tableaux nus pour les clips Mecanim decodes par unity/muscle.js.

const vec3 = (v) => (Array.isArray(v) ? [v[0], v[1], -v[2]] : [v.x, v.y, -v.z]);
const quat = (q) => (Array.isArray(q) ? [-q[0], -q[1], q[2], q[3]] : [-q.x, -q.y, q.z, q.w]);
const scale3 = (v) => (Array.isArray(v) ? [v[0], v[1], v[2]] : [v.x, v.y, v.z]);

const CURVE_KINDS = [
  ["m_PositionCurves", "translation", vec3, 3],
  ["m_RotationCurves", "rotation", quat, 4],
  ["m_ScaleCurves", "scale", scale3, 3],
];

/**
 * Index, dans m_AnimationClips, du clip joue par defaut par un controleur.
 *
 * La machine a etats d'Unity 4 vit dans m_Controller.m_StateMachineArray.
 * m_DefaultState y designe un etat, et l'ordre des etats suit celui de
 * m_AnimationClips (verifie sur les huit controleurs du build : les hachages
 * m_ClipID se succedent dans le meme ordre). Sans cela, les villageois qui
 * observent les etoiles joueraient l'inactivite par defaut.
 *
 * Le tableau des couches s'appelle m_HumanLayerArray en 4.1 et m_LayerArray
 * plus tard ; les deux noms sont lus, et un index hors bornes retombe sur la
 * premiere machine plutot que de renoncer.
 */
export function controllerDefaultClip(ctrl) {
  const ctl = ctrl && ctrl.m_Controller;
  const machines = (ctl && ctl.m_StateMachineArray) || [];
  if (!machines.length) return null;
  const layers = (ctl.m_HumanLayerArray || ctl.m_LayerArray || []);
  const first = layers.length ? (layers[0] && layers[0].data) || layers[0] : null;
  let which = first ? Number(first.m_StateMachineIndex || 0) : 0;
  if (!(which >= 0 && which < machines.length)) which = 0;
  const sm = (machines[which] && machines[which].data) || machines[which];
  const idx = sm && sm.m_DefaultState;
  return idx === undefined || idx === null ? null : Number(idx);
}

/**
 * (temps, valeur, pente d'entree, pente de sortie) d'une AnimationCurve.
 *
 * Les clips legacy rangent directement les deux tangentes de Hermite, la ou
 * Mecanim range le cubique du segment. Elles sont dans la meme unite que celles
 * de glTF -- une derivee par unite de temps -- et se transportent telles quelles.
 */
function curveKeys(c) {
  const keys = (c && c.curve && c.curve.m_Curve) || [];
  return keys
    .map((k) => [k.time, k.value, k.inSlope, k.outSlope])
    .sort((a, b) => a[0] - b[0]);
}

export function exportSubtree(ctx, rootGid, label, {
  emitImage, maxTexture = 1024, maxMeshes = 4000, textureDir = "textures",
} = {}) {
  const env = ctx.env;
  const sceneFile = env.get(ctx.sceneFile);
  const g = new GltfBuilder();
  const stats = { nodes: 0, meshes: 0, skipped: 0, skins: 0, incompleteSkins: 0,
                  animations: 0, channels: 0, cubic: 0, linear: 0,
                  mecanimClips: 0, emptyMecanimClips: 0, unresolvedBones: 0,
                  unresolvedPaths: 0, compressedClips: 0, noCollide: 0 };

  // --- index par GameObject : maillage, materiau, squelette ---
  const meshOf = new Map(), matOf = new Map(), skinOf = new Map();
  for (const o of env.objects({ type: "MeshFilter", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (v && v.m_GameObject && v.m_Mesh) meshOf.set(v.m_GameObject.pathId, v.m_Mesh);
  }

  // --- ce qui se heurte, et ce qui ne se heurte pas ---
  //
  // Le portage fabriquait un collider trimesh pour CHAQUE maillage rendu. Le
  // build, lui, dit lesquels en ont un : 1 885 objets portent un collider pour
  // 2 219 qui portent un maillage. Les 725 autres — 79 branches, 40 symboles
  // flottants, 39 cristaux, 30 decalcomanies, les 24 nuages, la voute celeste
  // — n'en ont AUCUN, et les traverser fait partie du jeu.
  //
  // C'etait deux defauts pour le prix d'un. On se heurtait a un decor qui n'est
  // pas solide : la voute `SkyShell` est une sphere de rayon 250,7 autour de
  // Timber Hearth, et le joueur qui tombait de 40 unites se posait dessus — ce
  // « il se stabilise a 249 u » que docs/07-gameplay.md notait sans l'expliquer.
  // Et le budget de 1 200 colliders se remplissait d'un tiers de decor, qui
  // pouvait en evincer du vrai terrain.
  //
  // Un collider DECLENCHEUR ne rend rien solide : il signale qu'on entre, et
  // c'est tout. `m_IsTrigger` est serialise, et 194 des 1 885 colliders de
  // `level0` le portent — la voute celeste, les volumes de fluide, les zones
  // d'oxygene. Les compter comme solides, c'etait rendre une atmosphere
  // infranchissable.
  const colliderGids = new Set();
  for (const type of ["MeshCollider", "SphereCollider", "BoxCollider",
                      "CapsuleCollider", "WheelCollider"]) {
    for (const o of env.objects({ type, file: ctx.sceneFile })) {
      const v = ctx.readEngine(o);
      if (!v || !v.m_GameObject) continue;
      if (v.m_IsTrigger === 1 || v.m_IsTrigger === true) continue;
      colliderGids.add(v.m_GameObject.pathId);
    }
  }
  for (const type of ["MeshRenderer", "SkinnedMeshRenderer"]) {
    for (const o of env.objects({ type, file: ctx.sceneFile })) {
      const v = ctx.readEngine(o);
      if (!v || !v.m_GameObject) continue;
      const gid = v.m_GameObject.pathId;
      if (v.m_Materials && v.m_Materials.length) matOf.set(gid, v.m_Materials[0]);
      if (type === "SkinnedMeshRenderer") {
        skinOf.set(gid, v);
        if (v.m_Mesh) meshOf.set(gid, v.m_Mesh);
      }
    }
  }

  // --- clips par GameObject ---
  //
  // Un objet porte souvent plusieurs clips alors qu'un seul demarre : on marque
  // celui qui joue par defaut ; les autres sortent quand meme, mais prefixes,
  // pour que le moteur ne les superpose pas sur les memes os.
  const animOf = new Map();
  for (const type of ["Animation", "Animator"]) {
    for (const o of env.objects({ type, file: ctx.sceneFile })) {
      const d = ctx.readEngine(o);
      if (!d || !d.m_GameObject) continue;
      const refs = [];
      // composant Animation : m_Animation designe le clip par defaut ; a
      // defaut, on retient le premier de m_Animations
      const listed = (d.m_Animations || []).filter((v) => v && v.pathId);
      let main = d.m_Animation && d.m_Animation.pathId ? d.m_Animation.pathId : 0;
      if (!main && listed.length) main = listed[0].pathId;
      for (const v of listed) {
        refs.push({ ptr: v, from: o.file, isDefault: v.pathId === main });
      }
      if (main && !refs.some((r) => r.ptr.pathId === main)) {
        refs.push({ ptr: d.m_Animation, from: o.file, isDefault: true });
      }
      // composant Animator : les clips sont listes par son controleur, dont
      // l'etat par defaut designe celui qui demarre
      if (d.m_Controller && d.m_Controller.pathId) {
        const cobj = env.deref(d.m_Controller, o.file);
        const ctrl = cobj && ctx.readEngine(cobj);
        const clips = ((ctrl && ctrl.m_AnimationClips) || []).filter((v) => v && v.pathId);
        const def = ctrl ? controllerDefaultClip(ctrl) : null;
        clips.forEach((v, i) => refs.push({ ptr: v, from: cobj.file,
                                            isDefault: def === null || i === def }));
      }
      // Un composant Animation reference son clip par defaut ET le liste dans
      // m_Animations : sans ce dedoublonnage, le clip sort deux fois.
      const gid = d.m_GameObject.pathId;
      if (!animOf.has(gid)) animOf.set(gid, new Map());
      const seen = animOf.get(gid);
      for (const r of refs) {
        const prev = seen.get(r.ptr.pathId);
        if (prev) prev.isDefault = prev.isDefault || r.isDefault;
        else seen.set(r.ptr.pathId, { ...r });
      }
    }
  }

  // --- enfants, par path_id de Transform ---
  const childrenOf = new Map();
  for (const [gid, t] of ctx.transformOf) {
    const tid = ctx.transformId.get(gid);
    for (const c of t.m_Children || []) {
      if (!childrenOf.has(tid)) childrenOf.set(tid, []);
      childrenOf.get(tid).push(c.pathId);
    }
  }
  const gidOfTransform = new Map();
  for (const [gid, tid] of ctx.transformId) gidOfTransform.set(tid, gid);

  // --- textures ---
  const putTexture = (ptr, fromFile, normal) => {
    if (!ptr || !ptr.pathId) return null;
    const key = `${ptr.pathId}:${normal ? "n" : "c"}`;
    if (g.textureByPid.has(key)) return g.textureByPid.get(key);
    g.textureByPid.set(key, null);

    const target = env.deref(ptr, fromFile);
    if (!target || target.type !== "Texture2D") return null;
    const tex = ctx.readEngine(target);
    let img = tex && decodeTexture2D(tex);
    if (!img) return null;
    img = resizeRGBA(img, maxTexture);
    if (normal && isDXT5nm(img)) img = unswizzleNormal(img);

    const safe = (tex.m_Name || `tex_${ptr.pathId}`).replace(/[^\w.\- ]/g, "_").trim();
    const wanted = `${textureDir}/${safe || "tex"}_${ptr.pathId}${normal ? "_n" : ""}.png`;
    // Le nom rendu par l'hote fait foi : une texture opaque part en JPEG, et le
    // glTF doit renvoyer vers le fichier reellement ecrit.
    const uri = emitImage(wanted, img) || wanted;
    g.images.push({ uri });
    g.textures.push({ source: g.images.length - 1, sampler: 0 });
    g.textureByPid.set(key, g.textures.length - 1);
    return g.textures.length - 1;
  };

  const putMaterial = (ptr) => {
    if (!ptr || !ptr.pathId) return null;
    if (g.materialByPid.has(ptr.pathId)) return g.materialByPid.get(ptr.pathId);
    g.materialByPid.set(ptr.pathId, null);

    const matObj = env.deref(ptr, sceneFile);
    const mat = matObj && ctx.readEngine(matObj);
    if (!mat) return null;

    const base = putTexture(texturePtr(mat, "_MainTex"), matObj.file, false);
    const normal = putTexture(texturePtr(mat, "_BumpMap"), matObj.file, true);

    let factor = [1, 1, 1, 1];
    const colors = (mat.m_SavedProperties && mat.m_SavedProperties.m_Colors) || [];
    for (const c of colors) {
      if (c.first && c.first.name === "_Color" && c.second) {
        factor = [c.second.r ?? 1, c.second.g ?? 1, c.second.b ?? 1, c.second.a ?? 1];
      }
    }
    const shaderObj = mat.m_Shader && env.deref(mat.m_Shader, matObj.file);
    const shaderName = shaderObj ? (ctx.readEngine(shaderObj) || {}).m_Name || "" : "";

    const pbr = { baseColorFactor: factor, metallicFactor: 0, roughnessFactor: 0.85 };
    if (base !== null) pbr.baseColorTexture = { index: base };
    const entry = {
      name: mat.m_Name || "material",
      pbrMetallicRoughness: pbr,
      alphaMode: alphaMode(shaderName),
      // Le nom du shader Unity permet au moteur JS de choisir le materiau
      // equivalent (voir web/src/shaders/).
      extras: { unityShader: shaderName },
    };
    if (normal !== null) entry.normalTexture = { index: normal };
    if (entry.alphaMode === "MASK") entry.alphaCutoff = 0.5;

    g.materials.push(entry);
    g.materialByPid.set(ptr.pathId, g.materials.length - 1);
    return g.materials.length - 1;
  };

  // --- maillages ---
  const meshCache = new Map();
  const emitMesh = (ptr, materialIndex, wantSkin) => {
    if (!ptr || !ptr.pathId) return null;
    // Un meme maillage peut etre instancie avec des materiaux differents : la
    // cle de cache doit donc inclure le materiau.
    const key = `${ptr.pathId}:${materialIndex}:${wantSkin ? 1 : 0}`;
    if (meshCache.has(key)) return meshCache.get(key);
    if (stats.meshes >= maxMeshes) return null;
    meshCache.set(key, null);

    const target = env.deref(ptr, sceneFile);
    const raw = target && ctx.readEngine(target);
    if (!raw) { stats.skipped++; return null; }
    let d;
    try { d = decodeMesh(raw); } catch { stats.skipped++; return null; }
    if (!d.vertexCount || !d.positions || !d.indices.length) { stats.skipped++; return null; }

    const n = d.vertexCount;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = d.positions[i * 3];
      pos[i * 3 + 1] = d.positions[i * 3 + 1];
      pos[i * 3 + 2] = -d.positions[i * 3 + 2];
    }
    const attributes = { POSITION: g.addAttribute(pos, 3) };

    if (d.normals && d.normals.length >= n * 3) {
      const nrm = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        nrm[i * 3] = d.normals[i * 3];
        nrm[i * 3 + 1] = d.normals[i * 3 + 1];
        nrm[i * 3 + 2] = -d.normals[i * 3 + 2];
      }
      attributes.NORMAL = g.addAttribute(nrm, 3);
    }
    if (d.uv0 && d.uv0.length >= n * 2) {
      const uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        uv[i * 2] = d.uv0[i * 2];
        uv[i * 2 + 1] = 1 - d.uv0[i * 2 + 1];
      }
      attributes.TEXCOORD_0 = g.addAttribute(uv, 2);
    }

    const skin = raw.m_Skin || [];
    if (wantSkin && skin.length === n) {
      const joints = new Uint16Array(n * 4);
      const weights = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const b = skin[i];
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += b[`weight[${k}]`] || 0;
        if (!sum) sum = 1;
        for (let k = 0; k < 4; k++) {
          joints[i * 4 + k] = Math.max(0, b[`boneIndex[${k}]`] || 0);
          weights[i * 4 + k] = (b[`weight[${k}]`] || 0) / sum;
        }
      }
      attributes.JOINTS_0 = g.addJoints(joints);
      attributes.WEIGHTS_0 = g.addAttribute(weights, 4);
    }

    // Inversion de l'ordre des triangles : l'inversion de Z change l'orientation.
    const tri = Math.floor(d.indices.length / 3);
    const idx = new Uint32Array(tri * 3);
    for (let i = 0; i < tri; i++) {
      idx[i * 3] = d.indices[i * 3 + 2];
      idx[i * 3 + 1] = d.indices[i * 3 + 1];
      idx[i * 3 + 2] = d.indices[i * 3];
    }

    const prim = { attributes, indices: g.addIndices(idx) };
    if (materialIndex !== null && materialIndex !== undefined) prim.material = materialIndex;
    g.meshes.push({ name: raw.m_Name || "mesh", primitives: [prim] });
    meshCache.set(key, g.meshes.length - 1);
    stats.meshes++;
    return g.meshes.length - 1;
  };

  // --- noeuds ---
  const nodeIndex = new Map();
  const skinnedNodes = [];
  const animatedRoots = [];   // [transform, GameObject] portant des clips

  const emitNode = (tid, depth = 0) => {
    const gid = gidOfTransform.get(tid);
    const t = ctx.transformOf.get(gid);
    if (!t || depth > 128) return null;
    const lp = t.m_LocalPosition, lr = t.m_LocalRotation, ls = t.m_LocalScale;
    const node = {
      name: ctx.name(gid) || "node",
      translation: [lp.x, lp.y, -lp.z],
      rotation: [-lr.x, -lr.y, lr.z, lr.w],
      scale: [ls.x, ls.y, ls.z],
    };
    if (meshOf.has(gid)) {
      const materialIndex = matOf.has(gid) ? putMaterial(matOf.get(gid)) : null;
      const mi = emitMesh(meshOf.get(gid), materialIndex, skinOf.has(gid));
      if (mi !== null) {
        node.mesh = mi;
        if (skinOf.has(gid)) skinnedNodes.push([g.nodes.length, gid]);
        // Ce que le build ne rend pas solide ne doit pas le devenir ici.
        if (!colliderGids.has(gid)) {
          node.extras = { ...(node.extras || {}), noCollide: true };
          stats.noCollide++;
        }
      }
    }
    if (animOf.has(gid)) animatedRoots.push([tid, gid]);
    const kids = (childrenOf.get(tid) || [])
      .map((c) => emitNode(c, depth + 1)).filter((k) => k !== null);
    if (kids.length) node.children = kids;
    g.nodes.push(node);
    nodeIndex.set(tid, g.nodes.length - 1);
    stats.nodes++;
    return g.nodes.length - 1;
  };

  const rootTid = ctx.transformId.get(rootGid);
  if (rootTid === undefined) return null;
  const top = emitNode(rootTid);

  // --- squelettes ---
  // Les os sont des Transform : chacun doit avoir ete emis comme noeud, ce qui
  // n'est vrai que s'il appartient au sous-arbre exporte. Un squelette dont un
  // os manque est ignore plutot que fausse.
  for (const [nodeIdx, gid] of skinnedNodes) {
    const r = skinOf.get(gid);
    const bones = (r && r.m_Bones) || [];
    const joints = [];
    let complete = bones.length > 0;
    for (const b of bones) {
      const j = nodeIndex.get(b.pathId);
      if (j === undefined) { complete = false; break; }
      joints.push(j);
    }
    if (!complete) { stats.incompleteSkins++; continue; }

    const skin = { joints };
    const meshObj = r.m_Mesh && env.deref(r.m_Mesh, sceneFile);
    const mesh = meshObj && ctx.readEngine(meshObj);
    const poses = (mesh && mesh.m_BindPose) || [];
    if (poses.length === joints.length) {
      const mats = new Float32Array(poses.length * 16);
      poses.forEach((m, i) => {
        // Conversion de repere sur une matrice inverse de pose : les termes
        // melangeant Z aux autres axes changent de signe.
        const v = [m["e00"], m["e10"], m["e20"], m["e30"],
                   m["e01"], m["e11"], m["e21"], m["e31"],
                   m["e02"], m["e12"], m["e22"], m["e32"],
                   m["e03"], m["e13"], m["e23"], m["e33"]];
        const flip = [1, 1, -1, 1, 1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1];
        for (let k = 0; k < 16; k++) mats[i * 16 + k] = (v[k] ?? 0) * flip[k];
      });
      skin.inverseBindMatrices = g.addMatrices(mats);
    }
    g.skins.push(skin);
    g.nodes[nodeIdx].skin = g.skins.length - 1;
    stats.skins++;
  }

  // --- animations ---
  //
  // Une courbe legacy est reperee par un CHEMIN de hierarchie relatif a l'objet
  // anime (« Bras/AvantBras/Main ») : il se resout en descendant par les noms,
  // puis se traduit en index de noeud glTF.
  const resolvePath = (rootTid, path) => {
    let cur = rootTid;
    for (const part of (path || "").split("/").filter(Boolean)) {
      let next = null;
      for (const c of childrenOf.get(cur) || []) {
        if (ctx.name(gidOfTransform.get(c)) === part) { next = c; break; }
      }
      if (next === null) return null;
      cur = next;
    }
    const idx = nodeIndex.get(cur);
    return idx === undefined ? null : idx;
  };

  // Un clip Mecanim ne designe pas ses cibles par un chemin mais par le CRC32
  // du nom de l'os : on indexe donc les noms du sous-arbre anime.
  const nameCache = new Map();
  const namesIn = (rootTid) => {
    if (nameCache.has(rootTid)) return nameCache.get(rootTid);
    const found = new Map();
    const stack = [rootTid];
    while (stack.length) {
      const cur = stack.pop();
      const idx = nodeIndex.get(cur);
      const nm = ctx.name(gidOfTransform.get(cur));
      if (idx !== undefined && nm !== null && !found.has(nm)) found.set(nm, idx);
      stack.push(...(childrenOf.get(cur) || []));
    }
    nameCache.set(rootTid, found);
    return found;
  };

  const addSampler = (samplers, channels, times, values, dim, cubic, node, path) => {
    samplers.push({ input: g.addTimes(times), output: g.addValues(values, dim),
                    interpolation: cubic ? "CUBICSPLINE" : "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
    stats[cubic ? "cubic" : "linear"]++;
  };

  /** Canaux d'un clip Mecanim decode par unity/muscle.js. */
  const mecanimChannels = (clip, rootTid, channels, samplers) => {
    const bones = decodeClip(clip, avatarTOS(ctx), { tangents: true });
    if (!bones.size) { stats.emptyMecanimClips++; return; }
    stats.mecanimClips++;
    const names = namesIn(rootTid);
    for (const [bone, attrs] of bones) {
      const node = names.get(bone);
      if (node === undefined) { stats.unresolvedBones++; continue; }
      for (const [path, attr] of Object.entries(attrs)) {
        const rot = path === "rotation";
        const conv = rot ? quat : (path === "scale" ? scale3 : vec3);
        const dim = rot ? 4 : 3;
        const cubic = !Array.isArray(attr);
        const keys = cubic ? attr.keys : attr;
        let values;
        if (cubic) {
          // glTF CUBICSPLINE : trois elements par cle, dans l'ordre tangente
          // d'entree, valeur, tangente de sortie. Les tangentes d'Unity comme
          // celles de glTF sont des derivees par unite de TEMPS : elles se
          // transportent telles quelles, sans mise a l'echelle par le pas.
          values = [];
          keys.forEach(([, v], i) => {
            values.push(conv(attr.in[i]), conv(v), conv(attr.out[i]));
          });
        } else {
          values = keys.map(([, v]) => conv(v));
        }
        addSampler(samplers, channels, keys.map(([t]) => t), values, dim, cubic, node, path);
      }
    }
  };

  for (const [rootTid, gid] of animatedRoots) {
    for (const ref of (animOf.get(gid) || new Map()).values()) {
      const clipObj = env.deref(ref.ptr, ref.from);
      const clip = clipObj && ctx.readEngine(clipObj);
      if (!clip) continue;
      if (clip.m_Compressed) { stats.compressedClips++; continue; }
      const channels = [], samplers = [];
      // Deux familles coexistent. m_AnimationType == 1 designe les clips
      // « legacy », dont les courbes sont lisibles telles quelles.
      // m_AnimationType == 2 designe Mecanim : ces trois listes sont vides et
      // tout vit dans m_MuscleClip, que unity/muscle.js sait decoder.
      const curveCount = CURVE_KINDS.reduce((s, [k]) => s + ((clip[k] || []).length), 0);
      if (curveCount === 0) mecanimChannels(clip, rootTid, channels, samplers);

      // la boucle suivante ne fait rien sur un clip Mecanim : ses trois listes
      // de courbes sont vides
      for (const [field, path, conv, dim] of CURVE_KINDS) {
        for (const c of clip[field] || []) {
          const node = resolvePath(rootTid, c.path);
          if (node === null) { stats.unresolvedPaths++; continue; }
          const keys = curveKeys(c);
          if (keys.length < 2) continue;
          // cubique si les deux tangentes sont la et finies, sinon lineaire :
          // mieux vaut une interpolation assumee qu'une tangente inventee
          const hasSlopes = keys.every((k) => k[2] !== undefined && k[2] !== null
                                           && k[3] !== undefined && k[3] !== null);
          const tang = hasSlopes ? keys.map((k) => [conv(k[2]), conv(k[3])]) : null;
          const cubic = !!tang && tang.every(([a, b]) => [...a, ...b].every(Number.isFinite));
          const values = cubic
            ? keys.flatMap((k, i) => [tang[i][0], conv(k[1]), tang[i][1]])
            : keys.map((k) => conv(k[1]));
          addSampler(samplers, channels, keys.map((k) => k[0]), values, dim, cubic, node, path);
        }
      }

      if (channels.length) {
        // « Objet|Clip » pour le clip par defaut, prefixe « ~ » pour les autres :
        // le moteur ne demarre que les premiers, sans quoi deux clips se
        // disputeraient les memes os (voir web/src/geometry.js).
        const nm = `${ctx.name(gid) || "node"}|${clip.m_Name || "clip"}`;
        g.animations.push({ name: ref.isDefault ? nm : `~${nm}`, samplers, channels });
        stats.animations++;
        stats.channels += channels.length;
      }
    }
  }

  const bin = g.buffer();
  const gltf = {
    asset: { version: "2.0", generator: `outerwildsjs (navigateur) — ${label}` },
    scene: 0,
    scenes: [{ nodes: [top] }],
    nodes: g.nodes,
    meshes: g.meshes,
    accessors: g.accessors,
    bufferViews: g.bufferViews,
    buffers: [{ byteLength: bin.length, uri: `${label}.bin` }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  };
  if (g.materials.length) { gltf.materials = g.materials; gltf.textures = g.textures; gltf.images = g.images; }
  if (g.skins.length) gltf.skins = g.skins;
  if (g.animations.length) gltf.animations = g.animations;

  return { gltf, bin, stats };
}

/** GameObject des racines exportables, par nom. */
export function findRoots(ctx, names = DEFAULT_ROOTS) {
  const wanted = new Set(names);
  const out = [];
  for (const [gid, go] of ctx.gameObjects) {
    if (wanted.has(go.m_Name) && ctx.transformId.has(gid)) out.push({ gid, name: go.m_Name });
  }
  return out;
}
