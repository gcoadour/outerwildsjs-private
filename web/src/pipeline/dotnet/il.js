// Parcours du code IL des methodes d'un assembly.
//
// Le catalogue des invites a l'ecran vit dans le CODE, pas dans les assets :
// une quarantaine de classes construisent leurs ScreenPrompt en dur, chacune
// declarant son texte, sa priorite et sa zone d'ecran. Le pipeline Python les
// lisait dans la source decompilee par ILSpy, ce qui suppose un SDK .NET.
//
// Ici on lit directement les corps de methode. Il ne s'agit pas de decompiler :
// on repere quelques instructions -- ldstr, newobj, stfld, call -- et on les
// rapproche. C'est plus etroit qu'un decompilateur, et cela suffit.

import { TABLE } from "./pe.js";

const DEC_UTF16 = new TextDecoder("utf-16le");

// Taille de l'operande, par code d'operation. Necessaire pour avancer d'une
// instruction a la suivante sans se desynchroniser.
const OPERAND = new Int8Array(256).fill(-1);
const OPERAND_FE = new Int8Array(32).fill(-1);

function setRange(table, from, to, size) {
  for (let i = from; i <= to; i++) table[i] = size;
}

setRange(OPERAND, 0x00, 0x0d, 0);       // nop..stloc.3
setRange(OPERAND, 0x0e, 0x13, 1);       // ldarg.s..stloc.s
setRange(OPERAND, 0x14, 0x1e, 0);       // ldnull..ldc.i4.8
OPERAND[0x1f] = 1;                      // ldc.i4.s
OPERAND[0x20] = 4;                      // ldc.i4
OPERAND[0x21] = 8;                      // ldc.i8
OPERAND[0x22] = 4;                      // ldc.r4
OPERAND[0x23] = 8;                      // ldc.r8
setRange(OPERAND, 0x25, 0x26, 0);       // dup, pop
setRange(OPERAND, 0x27, 0x29, 4);       // jmp, call, calli
OPERAND[0x2a] = 0;                      // ret
setRange(OPERAND, 0x2b, 0x37, 1);       // br.s..blt.un.s
setRange(OPERAND, 0x38, 0x44, 4);       // br..blt.un
OPERAND[0x45] = 4;                      // switch : suivi de n cibles
setRange(OPERAND, 0x46, 0x6e, 0);       // ldind..conv
OPERAND[0x6f] = 4;                      // callvirt
setRange(OPERAND, 0x70, 0x75, 4);       // cpobj..isinst
setRange(OPERAND, 0x76, 0x78, 0);
setRange(OPERAND, 0x79, 0x79, 4);       // unbox
OPERAND[0x7a] = 0;                      // throw
setRange(OPERAND, 0x7b, 0x81, 4);       // ldfld..stobj
setRange(OPERAND, 0x82, 0x8b, 0);       // conv.ovf.*
setRange(OPERAND, 0x8c, 0x8d, 4);       // box, newarr
OPERAND[0x8e] = 0;                      // ldlen
OPERAND[0x8f] = 4;                      // ldelema
setRange(OPERAND, 0x90, 0xa2, 0);       // ldelem.*, stelem.*
setRange(OPERAND, 0xa3, 0xa5, 4);       // ldelem, stelem, unbox.any
setRange(OPERAND, 0xa6, 0xc1, 0);
OPERAND[0xc2] = 4;                      // refanyval
OPERAND[0xc3] = 0;                      // ckfinite
setRange(OPERAND, 0xc4, 0xc5, 0);
OPERAND[0xc6] = 4;                      // mkrefany
setRange(OPERAND, 0xc7, 0xcf, 0);
OPERAND[0xd0] = 4;                      // ldtoken
setRange(OPERAND, 0xd1, 0xdc, 0);
OPERAND[0xdd] = 4;                      // leave
OPERAND[0xde] = 1;                      // leave.s
setRange(OPERAND, 0xdf, 0xe0, 0);       // stind.i, conv.u

setRange(OPERAND_FE, 0x00, 0x05, 0);    // arglist..clt.un
setRange(OPERAND_FE, 0x06, 0x07, 4);    // ldftn, ldvirtftn
setRange(OPERAND_FE, 0x09, 0x0e, 2);    // ldarg..stloc
OPERAND_FE[0x0f] = 0;                   // localloc
OPERAND_FE[0x11] = 0;                   // endfilter
OPERAND_FE[0x12] = 1;                   // unaligned.
setRange(OPERAND_FE, 0x13, 0x14, 0);    // volatile., tail.
setRange(OPERAND_FE, 0x15, 0x16, 4);    // initobj, constrained.
setRange(OPERAND_FE, 0x17, 0x18, 0);    // cpblk, initblk
OPERAND_FE[0x19] = 1;                   // no.
OPERAND_FE[0x1a] = 0;                   // rethrow
OPERAND_FE[0x1c] = 4;                   // sizeof
setRange(OPERAND_FE, 0x1d, 0x1e, 0);    // refanytype, readonly.

/** Corps IL d'une methode, ou null si elle n'en a pas (abstraite, externe). */
export function methodBody(asm, methodIndex) {
  const row = asm.row(TABLE.MethodDef, methodIndex);
  if (!row || !row[0]) return null;
  let at;
  try { at = asm.rva(row[0]); } catch { return null; }
  const b0 = asm.u8[at];
  if ((b0 & 3) === 2) {
    const size = b0 >> 2;                          // entete court
    return asm.u8.subarray(at + 1, at + 1 + size);
  }
  const view = new DataView(asm.u8.buffer, asm.u8.byteOffset);
  const flags = view.getUint16(at, true);
  const headerSize = (flags >> 12) * 4;
  const codeSize = view.getUint32(at + 4, true);
  return asm.u8.subarray(at + headerSize, at + headerSize + codeSize);
}

/**
 * Decode les instructions d'un corps IL.
 * @returns {Array<{offset:number, op:number, operand:number|null}>}
 */
export function decodeIL(code) {
  const out = [];
  const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
  let p = 0;
  while (p < code.length) {
    const offset = p;
    let op = code[p++];
    let size;
    if (op === 0xfe) {
      const sub = code[p++];
      op = 0xfe00 | sub;
      size = sub < OPERAND_FE.length ? OPERAND_FE[sub] : -1;
    } else {
      size = OPERAND[op];
    }
    if (size < 0) break;                           // code inconnu : on s'arrete
    let operand = null;
    if ((op & 0xff00) === 0) {
      if (op === 0x45) {                           // switch
        const n = view.getUint32(p, true);
        p += 4 + 4 * n;
        out.push({ offset, op, operand: n });
        continue;
      }
    }
    if (size === 1) operand = view.getInt8(p);
    else if (size === 2) operand = view.getUint16(p, true);
    else if (size === 4) operand = view.getUint32(p, true);
    else if (size === 8) operand = null;           // constantes 64 bits inutiles ici
    p += size;
    out.push({ offset, op, operand });
  }
  return out;
}

/** Chaine du tas #US, designee par un jeton ldstr. */
export function userString(asm, token) {
  const us = asm.streams["#US"];
  if (!us) return null;
  let p = token & 0x00ffffff;
  if (p >= us.length) return null;
  // Longueur compressee, puis des caracteres UTF-16 et un octet final.
  let len = us[p++];
  if ((len & 0x80) !== 0) {
    if ((len & 0xc0) === 0x80) len = ((len & 0x3f) << 8) | us[p++];
    else len = ((len & 0x1f) << 24) | (us[p++] << 16) | (us[p++] << 8) | us[p++];
  }
  if (len < 1) return "";
  return DEC_UTF16.decode(us.subarray(p, p + len - 1));
}

/** Nom simple et type declarant d'un jeton de methode (MethodDef ou MemberRef). */
export function methodTarget(asm, token) {
  const table = token >>> 24;
  const index = token & 0x00ffffff;
  if (table === 0x06) {                            // MethodDef : meme assembly
    const row = asm.row(TABLE.MethodDef, index);
    if (!row) return null;
    return { name: asm.str(row[3]), declaring: declaringTypeOf(asm, index) };
  }
  if (table === 0x0a) {                            // MemberRef
    const row = asm.row(TABLE.MemberRef, index);
    if (!row) return null;
    const parent = asm.decodeCoded("MemberRefParent", row[0]);
    let declaring = null;
    if (parent.table === TABLE.TypeRef) {
      const tr = asm.row(TABLE.TypeRef, parent.index);
      declaring = tr ? asm.str(tr[1]) : null;
    } else if (parent.table === TABLE.TypeDef) {
      const td = asm.row(TABLE.TypeDef, parent.index);
      declaring = td ? asm.str(td[1]) : null;
    }
    return { name: asm.str(row[1]), declaring };
  }
  return null;
}

/** Type declarant d'une MethodDef, par recherche dans les plages de TypeDef. */
function declaringTypeOf(asm, methodIndex) {
  if (!asm._methodOwner) {
    const owner = new Map();
    const n = asm.rows(TABLE.TypeDef);
    for (let i = 1; i <= n; i++) {
      const row = asm.row(TABLE.TypeDef, i);
      const next = asm.row(TABLE.TypeDef, i + 1);
      const from = row[5];
      const to = next ? next[5] : asm.rows(TABLE.MethodDef) + 1;
      for (let m = from; m < to; m++) owner.set(m, asm.str(row[1]));
    }
    asm._methodOwner = owner;
  }
  return asm._methodOwner.get(methodIndex) || null;
}

/** Nom d'un champ designe par un jeton stfld / ldfld. */
export function fieldName(asm, token) {
  const table = token >>> 24;
  const index = token & 0x00ffffff;
  if (table === 0x04) {
    const row = asm.row(TABLE.Field, index);
    return row ? asm.str(row[1]) : null;
  }
  if (table === 0x0a) {
    const row = asm.row(TABLE.MemberRef, index);
    return row ? asm.str(row[1]) : null;
  }
  return null;
}

/** Valeur d'une instruction de constante entiere, ou null. */
export function intConstant(inst) {
  const { op, operand } = inst;
  if (op === 0x15) return -1;                      // ldc.i4.m1
  if (op >= 0x16 && op <= 0x1e) return op - 0x16;  // ldc.i4.0 .. ldc.i4.8
  if (op === 0x1f || op === 0x20) return operand;  // ldc.i4.s, ldc.i4
  return null;
}

/** Methodes d'un type, par nom. */
export function methodsOf(asm, typeIndex) {
  const row = asm.row(TABLE.TypeDef, typeIndex);
  const next = asm.row(TABLE.TypeDef, typeIndex + 1);
  const from = row[5];
  const to = next ? next[5] : asm.rows(TABLE.MethodDef) + 1;
  const out = [];
  for (let i = from; i < to; i++) {
    const m = asm.row(TABLE.MethodDef, i);
    if (m) out.push({ index: i, name: asm.str(m[3]) });
  }
  return out;
}
