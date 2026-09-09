// Reencodage des clips WAV en Opus, au moment de l'extraction.
//
// Quinze fichiers WAV, 48 kHz 16 bits, pesent 15 Mo sur les 66,1 Mo du
// demarrage (docs/27-poids.md). La chaine d'outils du depot n'a pas d'encodeur
// Vorbis — mais le NAVIGATEUR en a un : `AudioEncoder` (WebCodecs) encode en
// Opus, dans le Worker, une fois pour toutes. C'est le pipeline navigateur qui
// rend cette piste possible ; le pipeline Python ne pouvait pas la prendre.
//
// Deux moities, et une seule des deux est verifiable sous Node :
//
//   - l'ENCODEUR sort des paquets Opus nus. Il demande WebCodecs, donc un
//     navigateur, et n'est pas couvert par les tests ;
//   - le MULTIPLEXEUR les emballe en Ogg, qui est le format qu'une balise
//     <audio> sait lire. C'est de la manipulation d'octets pure, verifiee par
//     tests/10-opus.mjs contre les valeurs de la RFC 3533 et de la RFC 7845.
//
// Repli partout : sans WebCodecs, sans encodeur Opus, ou sur la moindre erreur,
// le WAV d'origine est ecrit tel quel. La page doit rester extractible sur un
// navigateur qui n'a pas l'API.

/** Debit vise, en bits par seconde. 64 kbit/s en stereo est transparent a l'oreille. */
export const OPUS_BITRATE = 64000;
/**
 * Retard d'amorcage de l'encodeur, en echantillons a 48 kHz. 312 est la valeur
 * de libopus (6,5 ms) ; c'est celle qu'annonce l'en-tete quand l'encodeur ne
 * publie pas la sienne.
 */
export const DEFAULT_PRE_SKIP = 312;

// --- WAV --------------------------------------------------------------------

/**
 * Lit un WAV PCM entier. Les clips du build sont en 16 bits, mais 8, 24 et 32
 * bits sont acceptes : le cout est de trois lignes et l'inverse serait un
 * echec silencieux le jour ou l'un d'eux change.
 *
 * @returns {{channels: Float32Array[], sampleRate: number}} ou null
 */
export function parseWav(bytes) {
  if (!bytes || bytes.length < 44) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let fmt = null, dataOffset = -1, dataLength = 0;
  let p = 12;
  while (p + 8 <= bytes.length) {
    const id = tag(p);
    const size = dv.getUint32(p + 4, true);
    const body = p + 8;
    if (id === "fmt ") {
      fmt = { format: dv.getUint16(body, true),
              channels: dv.getUint16(body + 2, true),
              sampleRate: dv.getUint32(body + 4, true),
              bits: dv.getUint16(body + 14, true) };
    } else if (id === "data") {
      dataOffset = body;
      dataLength = Math.min(size, bytes.length - body);
    }
    // les morceaux sont alignes sur deux octets
    p = body + size + (size & 1);
  }
  if (!fmt || dataOffset < 0 || !fmt.channels || !fmt.sampleRate) return null;
  // 1 = PCM entier, 3 = PCM flottant
  if (fmt.format !== 1 && fmt.format !== 3) return null;

  const bytesPerSample = fmt.bits >> 3;
  if (!bytesPerSample) return null;
  const frames = Math.floor(dataLength / (bytesPerSample * fmt.channels));
  const channels = [];
  for (let c = 0; c < fmt.channels; c++) channels.push(new Float32Array(frames));

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const o = dataOffset + (i * fmt.channels + c) * bytesPerSample;
      let v = 0;
      if (fmt.format === 3) v = bytesPerSample === 8 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
      else if (fmt.bits === 8) v = (bytes[o] - 128) / 128;         // 8 bits : non signe
      else if (fmt.bits === 16) v = dv.getInt16(o, true) / 32768;
      else if (fmt.bits === 24) {
        const u = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
        v = ((u << 8) >> 8) / 8388608;
      } else if (fmt.bits === 32) v = dv.getInt32(o, true) / 2147483648;
      channels[c][i] = v;
    }
  }
  return { channels, sampleRate: fmt.sampleRate };
}

// --- Ogg --------------------------------------------------------------------

// CRC d'Ogg (RFC 3533) : polynome 0x04c11db7, SANS reflexion ni inversion
// finale — ce n'est PAS le CRC-32 de zip, et les confondre produit un fichier
// que tout lecteur refuse en silence.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let k = 0; k < 8; k++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    t[i] = r >>> 0;
  }
  return t;
})();

export function oggCrc(bytes) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

/**
 * Une page Ogg.
 *
 * @param segments  tableau de longueurs de lacing (0 a 255), 255 au plus
 * @param payload   octets, de longueur egale a la somme des lacing
 * @param headerType 1 continuation, 2 debut de flux, 4 fin de flux
 */
export function oggPage(segments, payload, { granule, serial, seq, headerType = 0 }) {
  const page = new Uint8Array(27 + segments.length + payload.length);
  const dv = new DataView(page.buffer);
  page[0] = 0x4f; page[1] = 0x67; page[2] = 0x67; page[3] = 0x53;   // "OggS"
  page[4] = 0;                                                     // version
  page[5] = headerType;
  // granulepos est un entier 64 bits : on l'ecrit en deux moities, faute de
  // BigInt utile ici (les clips ne depassent pas quelques minutes).
  dv.setUint32(6, granule >>> 0, true);
  dv.setUint32(10, Math.floor(granule / 4294967296), true);
  dv.setUint32(14, serial >>> 0, true);
  dv.setUint32(18, seq >>> 0, true);
  dv.setUint32(22, 0, true);                                       // CRC, calcule apres
  page[26] = segments.length;
  page.set(segments, 27);
  page.set(payload, 27 + segments.length);
  dv.setUint32(22, oggCrc(page), true);
  return page;
}

/** Decoupe un paquet en valeurs de lacing : des 255, puis le reste. */
export function lacing(length) {
  const out = [];
  let n = length;
  while (n >= 255) { out.push(255); n -= 255; }
  out.push(n);
  return out;
}

/** En-tete d'identification OpusHead (RFC 7845). */
export function opusHead(channels, preSkip, sampleRate) {
  const h = new Uint8Array(19);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);   // "OpusHead"
  h[8] = 1;                                    // version
  h[9] = channels;
  new DataView(h.buffer).setUint16(10, preSkip, true);
  new DataView(h.buffer).setUint32(12, sampleRate, true);
  new DataView(h.buffer).setInt16(16, 0, true);  // gain
  h[18] = 0;                                     // famille de mappage
  return h;
}

/** En-tete de commentaires OpusTags, sans commentaire. */
export function opusTags(vendor = "outerwildsjs") {
  const v = new TextEncoder().encode(vendor);
  const t = new Uint8Array(8 + 4 + v.length + 4);
  t.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);   // "OpusTags"
  const dv = new DataView(t.buffer);
  dv.setUint32(8, v.length, true);
  t.set(v, 12);
  dv.setUint32(12 + v.length, 0, true);          // zero commentaire
  return t;
}

/**
 * Emballe des paquets Opus en flux Ogg.
 *
 * @param packets   [{data: Uint8Array, samples: number}] — `samples` a 48 kHz
 * @param channels  nombre de canaux
 * @param preSkip   retard d'amorcage, en echantillons a 48 kHz
 * @param sampleRate frequence d'ORIGINE, informative dans l'en-tete
 * @param serial    numero de flux ; fixe par defaut pour que la sortie soit
 *                  reproductible d'une extraction a l'autre
 */
export function writeOggOpus(packets, { channels = 2, preSkip = DEFAULT_PRE_SKIP,
                                        sampleRate = 48000, serial = 0x4f57_4a53 } = {}) {
  const pages = [];
  let seq = 0;
  // Les deux en-tetes occupent chacun leur page, comme l'exige la RFC 7845.
  const head = opusHead(channels, preSkip, sampleRate);
  pages.push(oggPage(lacing(head.length), head,
                     { granule: 0, serial, seq: seq++, headerType: 2 }));
  const tags = opusTags();
  pages.push(oggPage(lacing(tags.length), tags,
                     { granule: 0, serial, seq: seq++ }));

  // Puis les paquets audio, groupes tant qu'une page peut les porter : au plus
  // 255 valeurs de lacing, et une page ne doit pas devenir enorme.
  let granule = preSkip;
  let segs = [], body = [], bodyLen = 0;
  const flush = (last) => {
    if (!segs.length) return;
    const payload = new Uint8Array(bodyLen);
    let o = 0;
    for (const b of body) { payload.set(b, o); o += b.length; }
    pages.push(oggPage(segs, payload,
      { granule, serial, seq: seq++, headerType: last ? 4 : 0 }));
    segs = []; body = []; bodyLen = 0;
  };

  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    const l = lacing(p.data.length);
    if (segs.length + l.length > 255) flush(false);
    segs = segs.concat(l);
    body.push(p.data);
    bodyLen += p.data.length;
    granule += p.samples;
  }
  flush(true);

  const total = pages.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of pages) { out.set(p, o); o += p.length; }
  return out;
}

// --- encodage ---------------------------------------------------------------

/** WebCodecs sait-il encoder de l'Opus ici ? */
export async function opusAvailable() {
  if (typeof AudioEncoder === "undefined" || !AudioEncoder.isConfigSupported) return false;
  try {
    const r = await AudioEncoder.isConfigSupported(
      { codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: OPUS_BITRATE });
    return !!(r && r.supported);
  } catch {
    return false;
  }
}

/**
 * Reencode un WAV en Ogg Opus. Retourne null des que quoi que ce soit manque —
 * l'appelant ecrit alors le WAV d'origine.
 *
 * Opus ne travaille qu'a 8, 12, 16, 24 ou 48 kHz ; les quinze clips du build
 * sont a 48 kHz. Un autre taux est refuse plutot que reechantillonne : mieux
 * vaut un WAV lourd qu'un son transpose.
 */
export async function wavToOpus(bytes, { bitrate = OPUS_BITRATE } = {}) {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;
  const wav = parseWav(bytes);
  if (!wav) return null;
  const rate = wav.sampleRate;
  if (![8000, 12000, 16000, 24000, 48000].includes(rate)) return null;
  const channels = wav.channels.length;
  const frames = wav.channels[0].length;
  if (!channels || !frames) return null;

  const packets = [];
  let preSkip = DEFAULT_PRE_SKIP;
  let failed = false;

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      // Chrome publie l'OpusHead qu'il a construit : son pre-skip vaut mieux
      // que la valeur par defaut.
      const desc = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (desc) {
        const d = new Uint8Array(desc.buffer || desc);
        if (d.length >= 12) preSkip = d[10] | (d[11] << 8);
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      // duree en microsecondes -> echantillons a 48 kHz
      packets.push({ data, samples: Math.round((chunk.duration || 20000) * 48 / 1000) });
    },
    error: () => { failed = true; },
  });

  try {
    encoder.configure({ codec: "opus", sampleRate: rate,
                        numberOfChannels: channels, bitrate });
    // Par blocs d'une seconde : un AudioData portant un clip entier ferait un
    // pic de memoire pour rien, et l'encodeur decoupe lui-meme en trames.
    const block = rate;
    for (let start = 0; start < frames && !failed; start += block) {
      const n = Math.min(block, frames - start);
      const planar = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) {
        planar.set(wav.channels[c].subarray(start, start + n), c * n);
      }
      const audio = new AudioData({
        format: "f32-planar", sampleRate: rate, numberOfFrames: n,
        numberOfChannels: channels, timestamp: Math.round(start / rate * 1e6),
        data: planar,
      });
      encoder.encode(audio);
      audio.close();
    }
    await encoder.flush();
    encoder.close();
  } catch {
    try { encoder.close(); } catch { /* deja ferme */ }
    return null;
  }
  if (failed || !packets.length) return null;
  return writeOggOpus(packets, { channels, preSkip, sampleRate: rate });
}
