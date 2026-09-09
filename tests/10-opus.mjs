// Multiplexage Ogg Opus, et lecture des WAV du build.
//
// L'ENCODAGE demande WebCodecs, donc un navigateur : il n'est pas teste ici.
// L'emballage, lui, est de la manipulation d'octets pure, et c'est la ou l'on
// se trompe — le CRC d'Ogg n'est pas celui de zip, et un fichier au CRC faux
// est refuse en silence par tous les lecteurs.
//
// Les valeurs attendues viennent des specifications : RFC 3533 pour la page
// Ogg, RFC 7845 pour les en-tetes Opus.

import { check, report } from "./run.mjs";
import { parseWav, oggCrc, oggPage, lacing, opusHead, opusTags,
         writeOggOpus, DEFAULT_PRE_SKIP } from "../web/src/pipeline/opus.js";

const str = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const u32 = (b, o) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true);
const u16 = (b, o) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(o, true);

// --- lacing ---------------------------------------------------------------
check("paquet court : une valeur", lacing(100).join(), "100");
// 255 signifie « la suite dans le segment suivant » : un paquet de 255 octets
// exige donc un segment vide derriere lui, sans quoi il serait lu comme 255 et
// tronque au paquet suivant.
check("paquet de 255 : un zero derriere", lacing(255).join(), "255,0");
check("paquet long", lacing(600).join(), "255,255,90");
check("paquet vide", lacing(0).join(), "0");

// --- CRC ------------------------------------------------------------------
//
// Vecteur de reference : le CRC d'Ogg est le CRC-32 « brut » (polynome
// 0x04c11db7, sans reflexion des bits ni inversion finale). Sur l'octet 0x00
// il vaut 0 ; sur "123456789" il vaut 0x89a1897f, ce qui le distingue sans
// ambiguite du CRC-32 de zip (0xcbf43926).
check("CRC d'un octet nul", oggCrc(new Uint8Array([0])), 0);
check("CRC de la chaine de reference",
      oggCrc(new TextEncoder().encode("123456789")).toString(16), "89a1897f");

// --- une page -------------------------------------------------------------
{
  const payload = new Uint8Array([1, 2, 3, 4]);
  const page = oggPage(lacing(payload.length), payload,
                       { granule: 1234, serial: 7, seq: 3, headerType: 2 });
  check("signature de page", str(page, 0, 4), "OggS");
  check("version", page[4], 0);
  check("type d'en-tete", page[5], 2);
  check("granulepos", u32(page, 6), 1234);
  check("numero de flux", u32(page, 14), 7);
  check("numero de page", u32(page, 18), 3);
  check("un segment", page[26], 1);
  check("taille totale", page.length, 27 + 1 + 4);

  // Le CRC est calcule sur la page ENTIERE, son propre champ mis a zero. Le
  // relire en remettant ce champ a zero doit redonner la meme valeur : c'est
  // exactement ce que fait un lecteur.
  const crc = u32(page, 22);
  const copy = page.slice();
  copy.set([0, 0, 0, 0], 22);
  check("CRC verifiable", oggCrc(copy), crc);
  check("CRC non nul", crc !== 0, true);
}

// --- en-tetes Opus ---------------------------------------------------------
{
  const h = opusHead(2, 312, 48000);
  check("magie OpusHead", str(h, 0, 8), "OpusHead");
  check("version de l'en-tete", h[8], 1);
  check("canaux", h[9], 2);
  check("pre-skip", u16(h, 10), 312);
  check("frequence d'origine", u32(h, 12), 48000);
  check("famille de mappage", h[18], 0);
  check("taille de l'en-tete", h.length, 19);

  const t = opusTags();
  check("magie OpusTags", str(t, 0, 8), "OpusTags");
  check("aucun commentaire", u32(t, t.length - 4), 0);
}

// --- un flux entier --------------------------------------------------------
{
  const packet = (n, len) => ({ data: new Uint8Array(len).fill(n), samples: 960 });
  const ogg = writeOggOpus([packet(1, 40), packet(2, 40), packet(3, 40)],
                           { channels: 2 });
  check("le flux commence par une page", str(ogg, 0, 4), "OggS");
  check("la premiere page porte le drapeau de debut", ogg[5], 2);
  check("elle porte l'en-tete d'identification", str(ogg, 28, 8), "OpusHead");

  // Compte des pages : deux d'en-tete, une d'audio.
  let pages = 0, last = -1;
  for (let i = 0; i + 4 <= ogg.length; i++) {
    if (str(ogg, i, 4) === "OggS") { pages++; last = i; }
  }
  check("trois pages", pages, 3);
  check("la derniere porte le drapeau de fin", ogg[last + 5], 4);
  // granulepos final : le pre-skip plus trois trames de 20 ms a 48 kHz
  check("granulepos final", u32(ogg, last + 6), DEFAULT_PRE_SKIP + 3 * 960);

  // Chaque page doit valider son propre CRC.
  let ok = true;
  const starts = [];
  for (let i = 0; i + 4 <= ogg.length; i++) if (str(ogg, i, 4) === "OggS") starts.push(i);
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k], to = k + 1 < starts.length ? starts[k + 1] : ogg.length;
    const page = ogg.slice(from, to);
    const crc = u32(page, 22);
    page.set([0, 0, 0, 0], 22);
    if (oggCrc(page) !== crc) ok = false;
  }
  check("toutes les pages valident leur CRC", ok, true);

  // Un flux d'un seul paquet reste valide : la page de fin est aussi la
  // premiere page audio.
  const court = writeOggOpus([packet(1, 10)], { channels: 1 });
  check("flux d'un seul paquet", str(court, 0, 4), "OggS");
}

// --- lecture d'un WAV ------------------------------------------------------
//
// Un WAV fabrique : le meme principe que pour les clips d'animation et les
// courbes de particules, un flux qu'on ecrit soi-meme pour eprouver le lecteur
// sans le jeu.
{
  const frames = 4, channels = 2, rate = 48000;
  const data = new Uint8Array(44 + frames * channels * 2);
  const dv = new DataView(data.buffer);
  const put = (o, s) => { for (let i = 0; i < s.length; i++) data[o + i] = s.charCodeAt(i); };
  put(0, "RIFF"); dv.setUint32(4, data.length - 8, true); put(8, "WAVE");
  put(12, "fmt "); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);            // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);           // bits
  put(36, "data"); dv.setUint32(40, frames * channels * 2, true);
  const ech = [0, 16384, -16384, 32767];
  for (let i = 0; i < frames; i++) {
    dv.setInt16(44 + i * 4, ech[i], true);        // gauche
    dv.setInt16(44 + i * 4 + 2, -ech[i], true);   // droite
  }

  const wav = parseWav(data);
  check("WAV lu", !!wav, true);
  check("deux canaux", wav.channels.length, 2);
  check("frequence", wav.sampleRate, 48000);
  check("images", wav.channels[0].length, 4);
  check("echantillon a mi-echelle",
        Math.round(wav.channels[0][1] * 1000) / 1000, 0.5);
  check("le canal droit est l'oppose",
        Math.round(wav.channels[1][1] * 1000) / 1000, -0.5);
  check("ce qui n'est pas un WAV est refuse",
        parseWav(new TextEncoder().encode("pas un fichier audio du tout")), null);
  check("un fichier tronque aussi", parseWav(new Uint8Array(8)), null);
}

report();
