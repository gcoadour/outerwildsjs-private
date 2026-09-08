// Reencodage des clips WAV en Opus, dans le worker, au moment de l'extraction.
//
// Quinze clips du build sont stockes decodes : 15 Mo de WAV 48 kHz 16 bits sur
// les 66 du demarrage (docs/27-poids.md). La chaine d'outils Python n'a pas
// d'encodeur Vorbis, ce qui a longtemps clos la question — mais le NAVIGATEUR
// en a un : `AudioEncoder` (WebCodecs) encode en Opus, et c'est justement le
// pipeline navigateur qui rend cette piste possible.
//
// L'encodage a lieu UNE FOIS, a l'extraction, pas au chargement de la page.
//
// WebCodecs rend des paquets Opus nus, sans conteneur : aucun navigateur ne
// sait les jouer tels quels. On les emballe donc en Ogg, dont le format est
// public et court : des pages, une table de segments, un CRC. Les deux entetes
// (`OpusHead`, `OpusTags`) sont ceux de la RFC 7845.
//
// Tout est facultatif : sans `AudioEncoder`, ou au moindre accroc, le WAV
// d'origine est conserve. Un clip qui pese est preferable a un clip muet.

/** Debit vise, en bits par seconde. */
export const OPUS_BITRATE = 96000;
/** Opus travaille a 48 kHz ; les clips du build y sont deja. */
export const OPUS_RATE = 48000;
/**
 * Retard d'encodage annonce dans l'entete, en echantillons a 48 kHz.
 * 3 840 (80 ms) est la valeur usuelle des encodeurs a trame de 20 ms.
 */
export const PRE_SKIP = 3840;

// --- lecture d'un WAV -------------------------------------------------------

/**
 * Decoupe un fichier RIFF/WAVE en canaux flottants.
 *
 * Le build ne produit que du PCM entier 8 ou 16 bits ; le flottant est accepte
 * au cas ou, tout le reste est refuse plutot que mal lu.
 */
export function parseWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let fmt = null, data = null;
  let p = 12;
  while (p + 8 <= bytes.length) {
    const id = tag(p);
    const size = dv.getUint32(p + 4, true);
    const body = p + 8;
    if (id === "fmt ") {
      fmt = { format: dv.getUint16(body, true), channels: dv.getUint16(body + 2, true),
              rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    } else if (id === "data") {
      data = { offset: body, size: Math.min(size, bytes.length - body) };
    }
    p = body + size + (size & 1);   // les morceaux sont alignes sur 2 octets
  }
  if (!fmt || !data || !fmt.channels || !fmt.rate) return null;

  const ch = fmt.channels;
  const bps = fmt.bits >> 3;
  if (!bps) return null;
  const frames = Math.floor(data.size / (bps * ch));
  const out = [];
  for (let c = 0; c < ch; c++) out.push(new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const o = data.offset + (i * ch + c) * bps;
      let v;
      if (fmt.format === 3 && bps === 4) v = dv.getFloat32(o, true);
      else if (bps === 2) v = dv.getInt16(o, true) / 32768;
      else if (bps === 1) v = (bytes[o] - 128) / 128;
      else return null;
      out[c][i] = v;
    }
  }
  return { rate: fmt.rate, channels: ch, frames, data: out };
}

/** Canaux separes -> flux entrelace, la disposition que WebCodecs attend. */
export function interleave(channels, frames) {
  const ch = channels.length;
  const out = new Float32Array(frames * ch);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) out[i * ch + c] = channels[c][i];
  }
  return out;
}

// --- conteneur Ogg ----------------------------------------------------------

// CRC-32 d'Ogg : polynome 0x04c11db7, sans reflexion, initial 0, sans ou final.
// Ce n'est PAS le CRC de zlib, qui est reflechi : s'y tromper produit un
// fichier que rien ne lit, sans autre symptome qu'un silence.
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
 * @param packets  paquets a placer, chacun decoupe en segments de 255 octets
 * @param flags    1 continuation, 2 debut de flux, 4 fin de flux
 */
export function oggPage(packets, { serial, sequence, granule, flags = 0 }) {
  const laces = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) { laces.push(255); n -= 255; }
    laces.push(n);
  }
  if (laces.length > 255) throw new Error("page Ogg saturee");
  const bodyLength = packets.reduce((s, p) => s + p.length, 0);
  const page = new Uint8Array(27 + laces.length + bodyLength);
  const dv = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);   // "OggS"
  page[4] = 0;
  page[5] = flags;
  // position granulaire : nombre d'echantillons a 48 kHz rendus a la fin de la
  // page. Elle tient sur 64 bits, ecrite en deux mots de 32.
  dv.setUint32(6, granule >>> 0, true);
  dv.setUint32(10, Math.floor(granule / 4294967296) >>> 0, true);
  dv.setUint32(14, serial >>> 0, true);
  dv.setUint32(18, sequence >>> 0, true);
  dv.setUint32(22, 0, true);               // CRC, calcule page entiere a zero
  page[26] = laces.length;
  page.set(laces, 27);
  let o = 27 + laces.length;
  for (const p of packets) { page.set(p, o); o += p.length; }
  dv.setUint32(22, oggCrc(page), true);
  return page;
}

function opusHead(channels, rate) {
  const b = new Uint8Array(19);
  const dv = new DataView(b.buffer);
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);   // "OpusHead"
  b[8] = 1;                     // version
  b[9] = channels;
  dv.setUint16(10, PRE_SKIP, true);
  dv.setUint32(12, rate, true);  // frequence d'origine, informative
  dv.setUint16(16, 0, true);     // gain
  b[18] = 0;                     // famille de mappage : mono ou stereo
  return b;
}

function opusTags(vendor = "outerwilds.js") {
  const v = new TextEncoder().encode(vendor);
  const b = new Uint8Array(8 + 4 + v.length + 4);
  const dv = new DataView(b.buffer);
  b.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);   // "OpusTags"
  dv.setUint32(8, v.length, true);
  b.set(v, 12);
  dv.setUint32(12 + v.length, 0, true);   // aucun commentaire
  return b;
}

/**
 * Emballe des paquets Opus en flux Ogg.
 *
 * @param packets  [{data, frames}] frames comptees a 48 kHz
 */
export function muxOggOpus(packets, channels, rate = OPUS_RATE, serial = 0x4f57534a) {
  const pages = [];
  let seq = 0;
  pages.push(oggPage([opusHead(channels, rate)],
                     { serial, sequence: seq++, granule: 0, flags: 2 }));
  pages.push(oggPage([opusTags()], { serial, sequence: seq++, granule: 0 }));

  let granule = 0;
  let batch = [], batchBytes = 0;
  const flush = (last) => {
    if (!batch.length) return;
    pages.push(oggPage(batch, { serial, sequence: seq++, granule,
                                flags: last ? 4 : 0 }));
    batch = []; batchBytes = 0;
  };
  for (let i = 0; i < packets.length; i++) {
    const p = packets[i];
    granule += p.frames;
    batch.push(p.data);
    batchBytes += p.data.length;
    // une page reste petite : 255 segments au plus, et on s'arrete bien avant
    if (batch.length >= 50 || batchBytes > 48000) flush(false);
  }
  flush(true);
  if (!pages.length) return null;
  const total = pages.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of pages) { out.set(p, o); o += p.length; }
  return out;
}

// --- encodage ---------------------------------------------------------------

/** WebCodecs est-il utilisable ici ? */
export function opusAvailable() {
  return typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined";
}

/**
 * Encode un WAV en Ogg Opus. Retourne null si l'encodage n'est pas possible —
 * l'appelant garde alors le WAV.
 */
export async function encodeOpus(wavBytes, { bitrate = OPUS_BITRATE } = {}) {
  if (!opusAvailable()) return null;
  const wav = parseWav(wavBytes);
  // Opus n'accepte que quelques frequences, et le mappage au-dela de deux
  // canaux demanderait une table : hors de ce cadre, on garde le WAV.
  if (!wav || wav.channels > 2 || !wav.frames) return null;
  if (![8000, 12000, 16000, 24000, 48000].includes(wav.rate)) return null;

  const config = { codec: "opus", sampleRate: wav.rate,
                   numberOfChannels: wav.channels, bitrate };
  try {
    if (AudioEncoder.isConfigSupported) {
      const s = await AudioEncoder.isConfigSupported(config);
      if (!s || !s.supported) return null;
    }
  } catch (e) {
    return null;
  }

  const packets = [];
  let failed = false;
  const done = new Promise((resolve) => {
    const encoder = new AudioEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        // La duree d'un paquet est en microsecondes ; la position granulaire
        // se compte, elle, en echantillons a 48 kHz.
        const frames = Math.round((chunk.duration || 20000) * 48000 / 1e6);
        packets.push({ data, frames });
      },
      error: () => { failed = true; resolve(); },
    });
    encoder.configure(config);
    // Un seul AudioData : l'encodeur decoupe lui-meme en trames.
    const chunkFrames = wav.rate;   // une seconde a la fois, pour ne pas
    let sent = 0;                   // garder tout le clip en flottants
    (async () => {
      try {
        while (sent < wav.frames) {
          const n = Math.min(chunkFrames, wav.frames - sent);
          const slice = wav.data.map((c) => c.subarray(sent, sent + n));
          const audio = new AudioData({
            format: "f32", sampleRate: wav.rate, numberOfFrames: n,
            numberOfChannels: wav.channels,
            timestamp: Math.round(sent / wav.rate * 1e6),
            data: interleave(slice, n),
          });
          encoder.encode(audio);
          audio.close();
          sent += n;
        }
        await encoder.flush();
        encoder.close();
      } catch (e) {
        failed = true;
      }
      resolve();
    })();
  });

  await done;
  if (failed || !packets.length) return null;
  try {
    return muxOggOpus(packets, wav.channels, wav.rate);
  } catch (e) {
    return null;
  }
}
