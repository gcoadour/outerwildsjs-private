// Encodage des images decodees, dans le Worker.
//
// OffscreenCanvas evite d'ecrire un encodeur PNG : le navigateur en a un.
// Les textures d'Unity sortent toutes en RGBA, meme sans transparence reelle.
// Quand le canal alpha est entierement opaque, le JPEG divise le poids par un
// ordre de grandeur ; le PNG n'est garde que pour ce qui est vraiment
// transparent. Sans ce tri, les textures du build pesent des centaines de Mo.

/** Vrai si le canal alpha est partout opaque. */
export function isOpaque(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return false;
  return true;
}

/**
 * Extension finale d'une image, decidee sans encoder.
 *
 * Les extracteurs sont synchrones et nomment leurs fichiers eux-memes, alors
 * que l'encodage ne l'est pas. Trancher ici permet au nom rendu au moment de
 * l'appel d'etre deja le bon : un glTF ne peut pas renvoyer vers un .png qui
 * sera finalement ecrit en .jpg.
 */
export function imageExtension(img, { forcePng = false } = {}) {
  return !forcePng && isOpaque(img.rgba) ? ".jpg" : ".png";
}

/**
 * @param {{width, height, rgba}} img
 * @returns {Promise<{blob: Blob, extension: string}>}
 */
export async function encodeImage(img, { quality = 0.85, forcePng = false } = {}) {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.rgba.buffer, img.rgba.byteOffset,
                                                       img.rgba.length),
                                 img.width, img.height), 0, 0);
  const opaque = imageExtension(img, { forcePng }) === ".jpg";
  const blob = await canvas.convertToBlob(opaque
    ? { type: "image/jpeg", quality }
    : { type: "image/png" });
  return { blob, extension: opaque ? ".jpg" : ".png" };
}
