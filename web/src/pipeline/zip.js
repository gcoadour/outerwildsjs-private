// Lecture d'archive ZIP par flux, sans dependance.
//
// L'archive de l'alpha pese 290 Mo. La lire en entier en memoire, puis en
// garder le contenu decompresse, depasse ce qu'un onglet accepte. On ne lit
// donc que le repertoire central, puis chaque entree voulue est extraite en
// flux via DecompressionStream, que le navigateur fournit nativement.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

const DEC = new TextDecoder("utf-8");

/**
 * Lit le repertoire central d'une archive.
 * @param {Blob} blob
 * @returns {Promise<Array<{name, method, compressedSize, size, headerOffset}>>}
 */
export async function readZipDirectory(blob) {
  // Le commentaire final peut faire 64 Ko : on cherche la signature dans la
  // queue plutot que de supposer qu'elle est aux 22 derniers octets.
  const tailLength = Math.min(blob.size, 66_000);
  const tail = new Uint8Array(await blob.slice(blob.size - tailLength).arrayBuffer());
  const view = new DataView(tail.buffer);

  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("archive ZIP invalide : fin de repertoire introuvable");

  const entryCount = view.getUint16(eocd + 10, true);
  const dirSize = view.getUint32(eocd + 12, true);
  const dirOffset = view.getUint32(eocd + 16, true);
  if (dirOffset === 0xffffffff) {
    throw new Error("archive ZIP64 non geree (le build de l'alpha n'en est pas une)");
  }

  const dir = new Uint8Array(await blob.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const dv = new DataView(dir.buffer);
  const entries = [];
  let p = 0;
  for (let i = 0; i < entryCount && p + 46 <= dir.length; i++) {
    if (dv.getUint32(p, true) !== CENTRAL_SIGNATURE) break;
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    const headerOffset = dv.getUint32(p + 42, true);
    const name = DEC.decode(dir.subarray(p + 46, p + 46 + nameLength));
    entries.push({ name, method, compressedSize, size, headerOffset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Flux des octets decompresses d'une entree.
 * @returns {Promise<ReadableStream<Uint8Array>>}
 */
export async function openZipEntry(blob, entry) {
  // L'entete local redonne les longueurs de nom et d'extra, qui peuvent
  // differer de celles du repertoire central : c'est lui qui situe les donnees.
  const head = new DataView(await blob.slice(entry.headerOffset, entry.headerOffset + 30).arrayBuffer());
  const nameLength = head.getUint16(26, true);
  const extraLength = head.getUint16(28, true);
  const start = entry.headerOffset + 30 + nameLength + extraLength;
  const slice = blob.slice(start, start + entry.compressedSize);

  if (entry.method === 0) return slice.stream();
  if (entry.method !== 8) {
    throw new Error(`methode de compression ${entry.method} non geree pour ${entry.name}`);
  }
  return slice.stream().pipeThrough(new DecompressionStream("deflate-raw"));
}

/** Extrait une entree vers un flux d'ecriture, en signalant la progression. */
export async function extractZipEntry(blob, entry, writable, onChunk) {
  const reader = (await openZipEntry(blob, entry)).getReader();
  const writer = writable.getWriter();
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value);
      written += value.length;
      if (onChunk) onChunk(value.length, written);
    }
  } finally {
    await writer.close();
    reader.releaseLock();
  }
  return written;
}
