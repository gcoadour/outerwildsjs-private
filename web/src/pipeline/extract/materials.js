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
