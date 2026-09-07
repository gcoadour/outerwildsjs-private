// Decodage des Texture2D vers du RGBA 8 bits.
//
// Formats presents dans le build : Alpha8, ARGB4444, RGB24, ARGB32, RGB565,
// DXT1 et DXT5. Les deux derniers couvrent 338 des 399 textures.
//
// Unity range les lignes de bas en haut (convention OpenGL) : la sortie est
// retournee verticalement, sinon toutes les textures sont a l'envers.

export const TEXTURE_FORMATS = {
  1: "Alpha8", 2: "ARGB4444", 3: "RGB24", 4: "RGBA32", 5: "ARGB32",
  7: "RGB565", 10: "DXT1", 12: "DXT5", 13: "RGBA4444", 14: "BGRA32",
};

/** Etend 5 ou 6 bits sur 8 en repliquant les bits de poids fort. */
const e5 = (v) => (v << 3) | (v >> 2);
const e6 = (v) => (v << 2) | (v >> 4);

function decodeDXT(src, width, height, dxt5) {
  const out = new Uint8Array(width * height * 4);
  const blocksX = Math.max(1, (width + 3) >> 2);
  const blocksY = Math.max(1, (height + 3) >> 2);
  const stride = dxt5 ? 16 : 8;
  const r = new Uint8Array(4), g = new Uint8Array(4), b = new Uint8Array(4);
  const alpha = new Uint8Array(8);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let p = (by * blocksX + bx) * stride;
      if (p + stride > src.length) break;

      let alphaBits0 = 0, alphaBits1 = 0;
      if (dxt5) {
        alpha[0] = src[p]; alpha[1] = src[p + 1];
        if (alpha[0] > alpha[1]) {
          for (let i = 1; i < 7; i++) {
            alpha[i + 1] = ((7 - i) * alpha[0] + i * alpha[1]) / 7;
          }
        } else {
          for (let i = 1; i < 5; i++) {
            alpha[i + 1] = ((5 - i) * alpha[0] + i * alpha[1]) / 5;
          }
          alpha[6] = 0; alpha[7] = 255;
        }
        alphaBits0 = src[p + 2] | (src[p + 3] << 8) | (src[p + 4] << 16);
        alphaBits1 = src[p + 5] | (src[p + 6] << 8) | (src[p + 7] << 16);
        p += 8;
      }

      const c0 = src[p] | (src[p + 1] << 8);
      const c1 = src[p + 2] | (src[p + 3] << 8);
      r[0] = e5(c0 >> 11); g[0] = e6((c0 >> 5) & 63); b[0] = e5(c0 & 31);
      r[1] = e5(c1 >> 11); g[1] = e6((c1 >> 5) & 63); b[1] = e5(c1 & 31);
      // En DXT1, c0 <= c1 signale un bloc a trois couleurs et une transparence.
      const punchThrough = !dxt5 && c0 <= c1;
      if (punchThrough) {
        r[2] = (r[0] + r[1]) >> 1; g[2] = (g[0] + g[1]) >> 1; b[2] = (b[0] + b[1]) >> 1;
        r[3] = 0; g[3] = 0; b[3] = 0;
      } else {
        r[2] = (2 * r[0] + r[1]) / 3; g[2] = (2 * g[0] + g[1]) / 3; b[2] = (2 * b[0] + b[1]) / 3;
        r[3] = (r[0] + 2 * r[1]) / 3; g[3] = (g[0] + 2 * g[1]) / 3; b[3] = (b[0] + 2 * b[1]) / 3;
      }
      const bits = src[p + 4] | (src[p + 5] << 8) | (src[p + 6] << 16) | (src[p + 7] << 24);

      for (let y = 0; y < 4; y++) {
        const py = by * 4 + y;
        if (py >= height) break;
        for (let x = 0; x < 4; x++) {
          const px = bx * 4 + x;
          if (px >= width) continue;
          const i = y * 4 + x;
          const ci = (bits >>> (i * 2)) & 3;
          const o = (py * width + px) * 4;
          out[o] = r[ci]; out[o + 1] = g[ci]; out[o + 2] = b[ci];
          if (dxt5) {
            const ai = i < 8 ? (alphaBits0 >>> (i * 3)) & 7 : (alphaBits1 >>> ((i - 8) * 3)) & 7;
            out[o + 3] = alpha[ai];
          } else {
            out[o + 3] = punchThrough && ci === 3 ? 0 : 255;
          }
        }
      }
    }
  }
  return out;
}

function decodeUncompressed(src, width, height, format) {
  const n = width * height;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    switch (format) {
      case 1: {                                     // Alpha8
        // RGB blanc, deliberement : UnityPy rend (0,0,0,a). Ces textures sont
        // des masques, multiplies par une teinte a l'affichage — du noir
        // eteindrait la particule ou le halo de la lampe.
        out[o] = out[o + 1] = out[o + 2] = 255;
        out[o + 3] = src[i];
        break;
      }
      case 2: {                                     // ARGB4444
        const v = src[i * 2] | (src[i * 2 + 1] << 8);
        const q = (c) => (c << 4) | c;
        out[o] = q((v >> 8) & 15); out[o + 1] = q((v >> 4) & 15);
        out[o + 2] = q(v & 15); out[o + 3] = q((v >> 12) & 15);
        break;
      }
      case 3: {                                     // RGB24
        out[o] = src[i * 3]; out[o + 1] = src[i * 3 + 1];
        out[o + 2] = src[i * 3 + 2]; out[o + 3] = 255;
        break;
      }
      case 4: {                                     // RGBA32
        out[o] = src[i * 4]; out[o + 1] = src[i * 4 + 1];
        out[o + 2] = src[i * 4 + 2]; out[o + 3] = src[i * 4 + 3];
        break;
      }
      case 5: {                                     // ARGB32
        out[o + 3] = src[i * 4]; out[o] = src[i * 4 + 1];
        out[o + 1] = src[i * 4 + 2]; out[o + 2] = src[i * 4 + 3];
        break;
      }
      case 7: {                                     // RGB565
        const v = src[i * 2] | (src[i * 2 + 1] << 8);
        out[o] = e5(v >> 11); out[o + 1] = e6((v >> 5) & 63);
        out[o + 2] = e5(v & 31); out[o + 3] = 255;
        break;
      }
      case 13: {                                    // RGBA4444
        const v = src[i * 2] | (src[i * 2 + 1] << 8);
        const q = (c) => (c << 4) | c;
        out[o] = q((v >> 12) & 15); out[o + 1] = q((v >> 8) & 15);
        out[o + 2] = q((v >> 4) & 15); out[o + 3] = q(v & 15);
        break;
      }
      case 14: {                                    // BGRA32
        out[o] = src[i * 4 + 2]; out[o + 1] = src[i * 4 + 1];
        out[o + 2] = src[i * 4]; out[o + 3] = src[i * 4 + 3];
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

/** Retourne l'image verticalement, sur place. */
function flipY(rgba, width, height) {
  const row = width * 4;
  const tmp = new Uint8Array(row);
  for (let y = 0; y < (height >> 1); y++) {
    const a = y * row, b = (height - 1 - y) * row;
    tmp.set(rgba.subarray(a, a + row));
    rgba.copyWithin(a, b, b + row);
    rgba.set(tmp, b);
  }
  return rgba;
}

/**
 * Decode le premier niveau de mipmap d'une Texture2D lue par type tree.
 * @returns {{width:number, height:number, rgba:Uint8Array}|null}
 */
export function decodeTexture2D(tex) {
  const width = tex.m_Width | 0, height = tex.m_Height | 0;
  const data = tex["image data"];
  if (!width || !height || !data || !data.length) return null;
  const format = tex.m_TextureFormat;

  let rgba;
  if (format === 10 || format === 12) {
    rgba = decodeDXT(data, width, height, format === 12);
  } else {
    rgba = decodeUncompressed(data, width, height, format);
  }
  if (!rgba) return null;
  return { width, height, rgba: flipY(rgba, width, height),
           format: TEXTURE_FORMATS[format] || `format ${format}` };
}

/** Reduction par moyenne de blocs, pour plafonner le poids des textures. */
export function resizeRGBA(img, maxSide) {
  const { width, height, rgba } = img;
  const side = Math.max(width, height);
  if (side <= maxSide) return img;
  const w = Math.max(1, Math.round(width * maxSide / side));
  const h = Math.max(1, Math.round(height * maxSide / side));
  const out = new Uint8Array(w * h * 4);
  const sx = width / w, sy = height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(height, Math.ceil((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(width, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * width + xx) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, rgba: out, format: img.format };
}

/** Deballe un ColorRGBA 32 bits d'Unity en composantes 0-1. */
export function unpackColor32(c) {
  if (!c) return [1, 1, 1, 1];
  if (typeof c.r === "number") return [c.r, c.g, c.b, c.a];
  const v = c.rgba >>> 0;
  return [(v & 255) / 255, ((v >> 8) & 255) / 255,
          ((v >> 16) & 255) / 255, ((v >>> 24) & 255) / 255];
}
