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

export function exportSubtree(ctx, rootGid, label, {
  emitImage, maxTexture = 1024, maxMeshes = 4000, textureDir = "textures",
} = {}) {
  const env = ctx.env;
  const sceneFile = env.get(ctx.sceneFile);
  const g = new GltfBuilder();
  const stats = { nodes: 0, meshes: 0, skipped: 0, skins: 0, incompleteSkins: 0 };

  // --- index par GameObject : maillage, materiau, squelette ---
  const meshOf = new Map(), matOf = new Map(), skinOf = new Map();
  for (const o of env.objects({ type: "MeshFilter", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (v && v.m_GameObject && v.m_Mesh) meshOf.set(v.m_GameObject.pathId, v.m_Mesh);
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
    const file = `${safe || "tex"}_${ptr.pathId}${normal ? "_n" : ""}.png`;
    emitImage(`${textureDir}/${file}`, img);
    g.images.push({ uri: `${textureDir}/${file}` });
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
      }
    }
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
