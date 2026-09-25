// Lecture des materiaux : texture principale et mode de fusion.
// Partage par l'extracteur de particules et l'export glTF.

import { decodeTexture2D, resizeRGBA } from "../unity/texture.js";

/** PPtr de la texture d'un canal donne d'un materiau. */
export function texturePtr(material, channel = "_MainTex") {
  const envs = material && material.m_SavedProperties
    && material.m_SavedProperties.m_TexEnvs;
  if (!Array.isArray(envs)) return null;
  for (const entry of envs) {
    const name = entry.first && entry.first.name;
    if (name === channel) return (entry.second && entry.second.m_Texture) || null;
  }
  return null;
}

/**
 * La repetition et le decalage d'une texture (`m_Scale`, `m_Offset`), rendus
 * en `KHR_texture_transform` pour un glTF dont les UV sont retournees
 * (`v' = 1 - v`, voir gltf.js). Unity echantillonne `uv x s + o` ; dans le
 * repere retourne cela devient `v' x s + (1 - s - o)`.
 *
 * 54 materiaux du build repetent leur texture — le sol de Timber Hearth
 * cinquante fois, sa roche vingt. Sans cette transformation, tout le terrain
 * etait etire en aplats sans grain (docs/132).
 *
 * @returns l'extension, ou null quand la texture n'est ni repetee ni decalee
 */
export function textureTransform(material, channel = "_MainTex") {
  const envs = material && material.m_SavedProperties
    && material.m_SavedProperties.m_TexEnvs;
  if (!Array.isArray(envs)) return null;
  const e = envs.find((x) => x.first && x.first.name === channel);
  const st = e && e.second;
  if (!st || !st.m_Scale) return null;
  const sx = st.m_Scale.x ?? 1, sy = st.m_Scale.y ?? 1;
  const ox = (st.m_Offset && st.m_Offset.x) || 0, oy = (st.m_Offset && st.m_Offset.y) || 0;
  if (sx === 1 && sy === 1 && !ox && !oy) return null;
  return { scale: [sx, sy], offset: [ox, 1 - sy - oy] };
}

/**
 * Mode de fusion, lu dans le NOM du shader : "Particles/Additive" est additif,
 * "Alpha Blended" ne l'est pas. Tout forcer en additif sature l'image.
 */
export function blendMode(ctx, material, fromFile) {
  const ptr = material && material.m_Shader;
  const shader = ptr ? ctx.readEngine(ctx.env.deref(ptr, fromFile)) : null;
  const name = ((shader && shader.m_Name) || "").toLowerCase();
  if (name.includes("alpha blend") || name.includes("alphablend")
      || name.includes("premultiply")) return "alpha";
  if (name.includes("multiply")) return "multiply";
  return "add";
}

/**
 * Cache d'export de textures : decode, reduit, et confie l'encodage a l'hote
 * (OffscreenCanvas dans le Worker, autre chose sous Node).
 */
export class TextureExporter {
  constructor(ctx, emitImage, { maxSide = 256, prefix = "tex" } = {}) {
    this.ctx = ctx;
    this.emitImage = emitImage;
    this.maxSide = maxSide;
    this.prefix = prefix;
    this.cache = new Map();     // path_id -> {file, size} ou null
    this.count = 0;
  }

  /** @returns {{file:string, size:[number,number]}|null} */
  export(ptr, fromFile) {
    if (!ptr || !ptr.pathId) return null;
    if (this.cache.has(ptr.pathId)) return this.cache.get(ptr.pathId);
    this.cache.set(ptr.pathId, null);

    const target = this.ctx.env.deref(ptr, fromFile);
    if (!target || target.type !== "Texture2D") return null;
    const tex = this.ctx.readEngine(target);
    if (!tex) return null;
    let img = decodeTexture2D(tex);
    if (!img) return null;
    img = resizeRGBA(img, this.maxSide);

    const safe = (tex.m_Name || `${this.prefix}_${ptr.pathId}`).replace(/[^\w.\- ]/g, "_").trim();
    const wanted = `${safe || this.prefix}_${ptr.pathId}.png`;
    // L'hote peut changer l'extension a l'ecriture (JPEG pour une texture
    // opaque) : c'est le nom qu'il rend qui fait foi.
    const file = this.emitImage(wanted, img) || wanted;
    const entry = { file, size: [img.width, img.height] };
    this.cache.set(ptr.pathId, entry);
    this.count++;
    return entry;
  }
}
