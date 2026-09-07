// Decodage des signatures de champ (ECMA-335 II.23.2.4).
// Une signature de champ est FIELD (0x06) suivi du type du champ.

import { readCompressed } from "./pe.js";

// Types elementaires utiles ; les autres sont signales comme non geres.
// `char` est absent volontairement : Unity 4 ne le serialise pas. L'inclure
// decale de 4 octets la lecture de DialogueGUI, dont le champ
// forceNewLineCharacter est un char qui n'apparait pas dans les donnees.
const PRIMITIVES = {
  0x02: "bool", 0x04: "SInt8", 0x05: "UInt8", 0x06: "SInt16",
  0x07: "UInt16", 0x08: "int", 0x09: "unsigned int", 0x0a: "SInt64",
  0x0b: "UInt64", 0x0c: "float", 0x0d: "double",
};

const ET_STRING = 0x0e, ET_PTR = 0x0f, ET_BYREF = 0x10, ET_VALUETYPE = 0x11,
      ET_CLASS = 0x12, ET_VAR = 0x13, ET_ARRAY = 0x14, ET_GENERICINST = 0x15,
      ET_OBJECT = 0x1c, ET_SZARRAY = 0x1d, ET_MVAR = 0x1e,
      ET_CMOD_REQD = 0x1f, ET_CMOD_OPT = 0x20, ET_I = 0x18, ET_U = 0x19;

/** Decode un index code TypeDefOrRef tel qu'il apparait dans une signature. */
function typeDefOrRef(token) {
  const tag = token & 3;
  return { table: [0x02, 0x01, 0x1b][tag], index: token >>> 2 };
}

/**
 * Lit un type. Retourne un descripteur, ou {kind:"unsupported"} pour tout ce
 * qu'Unity ne serialise de toute facon pas (pointeurs, generiques ouverts...).
 */
export function parseType(u8, ref) {
  if (ref.p >= u8.length) return { kind: "unsupported", why: "signature tronquee" };
  const et = u8[ref.p++];
  if (PRIMITIVES[et]) return { kind: "prim", name: PRIMITIVES[et] };
  switch (et) {
    case ET_STRING:
      return { kind: "string" };
    case ET_VALUETYPE:
    case ET_CLASS:
      return { kind: et === ET_VALUETYPE ? "valuetype" : "class",
               ref: typeDefOrRef(readCompressed(u8, ref)) };
    case ET_SZARRAY:
      return { kind: "array", elem: parseType(u8, ref) };
    case ET_GENERICINST: {
      u8[ref.p++];                                    // CLASS ou VALUETYPE
      const base = typeDefOrRef(readCompressed(u8, ref));
      const n = readCompressed(u8, ref);
      const args = [];
      for (let i = 0; i < n; i++) args.push(parseType(u8, ref));
      return { kind: "generic", ref: base, args };
    }
    case ET_CMOD_REQD:
    case ET_CMOD_OPT:
      readCompressed(u8, ref);                        // modificateur ignore
      return parseType(u8, ref);
    case ET_PTR: case ET_BYREF: case ET_VAR: case ET_MVAR:
    case ET_ARRAY: case ET_OBJECT: case ET_I: case ET_U:
      return { kind: "unsupported", why: `element 0x${et.toString(16)}` };
    default:
      return { kind: "unsupported", why: `element 0x${et.toString(16)}` };
  }
}

/** Type d'un champ, depuis le blob de sa signature. */
export function parseFieldSignature(blob) {
  const ref = { p: 0 };
  if (blob.length === 0) return { kind: "unsupported", why: "blob vide" };
  if (blob[ref.p] === 0x06) ref.p++;                  // marqueur FIELD
  return parseType(blob, ref);
}
