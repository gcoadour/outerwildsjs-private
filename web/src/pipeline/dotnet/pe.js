// Lecture des metadonnees .NET (ECMA-335) d'un assembly managé.
//
// Pourquoi : le build ne contient aucun type tree, donc les champs des
// MonoBehaviour sont des octets opaques. Le pipeline Python regenerait ces type
// trees via le backend .NET d'AssetRipper — impossible dans un navigateur. On
// lit donc directement Assembly-CSharp.dll : PE -> entete CLI -> flux de
// metadonnees -> tables. C'est de la lecture de format documente, sans
// execution de code managé.

import { BinaryReader } from "../unity/binary.js";

// --- index codes : (nb de bits de tag, tables visees dans l'ordre des tags) ---
const CODED = {
  TypeDefOrRef: [2, [2, 1, 0x1b]],
  HasConstant: [2, [4, 8, 0x17]],
  HasCustomAttribute: [5, [6, 4, 1, 2, 8, 9, 0x0a, 0, 0x0e, 0x17, 0x14, 0x11,
                           0x1a, 0x1b, 0x20, 0x23, 0x26, 0x27, 0x28, 0x2a, 0x2c, 0x2b]],
  HasFieldMarshal: [1, [4, 8]],
  HasDeclSecurity: [2, [2, 6, 0x20]],
  MemberRefParent: [3, [2, 1, 0x1a, 6, 0x1b]],
  HasSemantics: [1, [0x14, 0x17]],
  MethodDefOrRef: [1, [6, 0x0a]],
  MemberForwarded: [1, [4, 6]],
  Implementation: [2, [0x26, 0x23, 0x27]],
  CustomAttributeType: [3, [-1, -1, 6, 0x0a, -1]],
  ResolutionScope: [2, [0, 0x1a, 0x23, 1]],
  TypeOrMethodDef: [1, [2, 6]],
};

// Schema des tables. 's'/'g'/'b' = index de tas, '2'/'4' = entier, sinon nom
// d'index code ou numero de table simple (ex. 'T4' = index dans Field).
const TABLES = {
  0x00: ["2", "s", "g", "g", "g"],
  0x01: ["ResolutionScope", "s", "s"],
  0x02: ["4", "s", "s", "TypeDefOrRef", "T4", "T6"],
  0x03: ["T4"],
  0x04: ["2", "s", "b"],
  0x05: ["T6"],
  0x06: ["4", "2", "2", "s", "b", "T8"],
  0x07: ["T8"],
  0x08: ["2", "2", "s"],
  0x09: ["T2", "TypeDefOrRef"],
  0x0a: ["MemberRefParent", "s", "b"],
  0x0b: ["2", "HasConstant", "b"],
  0x0c: ["HasCustomAttribute", "CustomAttributeType", "b"],
  0x0d: ["HasFieldMarshal", "b"],
  0x0e: ["2", "HasDeclSecurity", "b"],
  0x0f: ["2", "4", "T2"],
  0x10: ["4", "T4"],
  0x11: ["b"],
  0x12: ["T2", "T20"],
  0x13: ["T20"],
  0x14: ["2", "s", "TypeDefOrRef"],
  0x15: ["T2", "T23"],
  0x16: ["T23"],
  0x17: ["2", "s", "b"],
  0x18: ["2", "T6", "HasSemantics"],
  0x19: ["T2", "MethodDefOrRef", "MethodDefOrRef"],
  0x1a: ["s"],
  0x1b: ["b"],
  0x1c: ["2", "MemberForwarded", "s", "T26"],
  0x1d: ["4", "T4"],
  0x1e: ["4", "4"],
  0x1f: ["4"],
  0x20: ["4", "2", "2", "2", "2", "4", "b", "s", "s"],
  0x21: ["4"],
  0x22: ["4", "4", "4"],
  0x23: ["2", "2", "2", "2", "4", "b", "s", "s", "b"],
  0x24: ["4", "T35"],
  0x25: ["4", "4", "4", "T35"],
  0x26: ["4", "s", "b"],
  0x27: ["4", "4", "s", "s", "Implementation"],
  0x28: ["4", "4", "s", "Implementation"],
  0x29: ["T2", "T2"],
  0x2a: ["2", "2", "TypeOrMethodDef", "s"],
  0x2b: ["MethodDefOrRef", "b"],
  0x2c: ["T42", "TypeDefOrRef"],
};

export const TABLE = {
  Module: 0x00, TypeRef: 0x01, TypeDef: 0x02, Field: 0x04, MethodDef: 0x06,
  Param: 0x08, MemberRef: 0x0a, CustomAttribute: 0x0c, TypeSpec: 0x1b,
  Assembly: 0x20, AssemblyRef: 0x23, NestedClass: 0x29, GenericParam: 0x2a,
};

const DEC_UTF8 = new TextDecoder("utf-8");

/** Entier compresse des blobs de signature (II.23.2). */
export function readCompressed(u8, posRef) {
  const b0 = u8[posRef.p++];
  if ((b0 & 0x80) === 0) return b0;
  if ((b0 & 0xc0) === 0x80) return ((b0 & 0x3f) << 8) | u8[posRef.p++];
  return ((b0 & 0x1f) << 24) | (u8[posRef.p++] << 16) | (u8[posRef.p++] << 8) | u8[posRef.p++];
}

export class Assembly {
  constructor(name, u8) {
    this.name = name;
    this.u8 = u8;
    this._parsePE();
    this._parseMetadata();
    this._parseTables();
  }

  // --- PE ---------------------------------------------------------------
  _parsePE() {
    const r = new BinaryReader(this.u8, 0, true);
    if (r.u16() !== 0x5a4d) throw new Error(`${this.name}: signature MZ absente`);
    r.seek(0x3c);
    const peOff = r.i32();
    r.seek(peOff);
    if (r.u32() !== 0x00004550) throw new Error(`${this.name}: signature PE absente`);
    r.u16();                                  // machine
    const sectionCount = r.u16();
    r.bytes(12);
    const optSize = r.u16();
    r.u16();                                  // characteristics
    const optStart = r.pos;
    const magic = r.u16();
    const pe32plus = magic === 0x20b;
    // Repertoire de donnees 14 = entete CLI.
    r.seek(optStart + (pe32plus ? 112 : 96) + 14 * 8);
    const cliRva = r.u32();
    r.u32();

    r.seek(optStart + optSize);
    this.sections = [];
    for (let i = 0; i < sectionCount; i++) {
      const name = DEC_UTF8.decode(r.bytes(8)).replace(/\0+$/, "");
      const virtualSize = r.u32(), virtualAddress = r.u32();
      const rawSize = r.u32(), rawPointer = r.u32();
      r.bytes(16);
      this.sections.push({ name, virtualSize, virtualAddress, rawSize, rawPointer });
    }

    const cli = new BinaryReader(this.u8, this.rva(cliRva), true);
    cli.bytes(8);                              // cb + versions runtime
    this.metadataRva = cli.u32();
    this.metadataSize = cli.u32();
  }

  /** Adresse virtuelle -> decalage dans le fichier. */
  rva(v) {
    for (const s of this.sections) {
      if (v >= s.virtualAddress && v < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)) {
        return s.rawPointer + (v - s.virtualAddress);
      }
    }
    throw new Error(`${this.name}: RVA ${v} hors sections`);
  }

  // --- flux de metadonnees ----------------------------------------------
  _parseMetadata() {
    const base = this.rva(this.metadataRva);
    const r = new BinaryReader(this.u8, base, true);
    if (r.u32() !== 0x424a5342) throw new Error(`${this.name}: signature BSJB absente`);
    r.bytes(8);                                // versions + reserve
    const verLen = r.i32();
    this.runtimeVersion = DEC_UTF8.decode(r.bytes(verLen)).replace(/\0+$/, "");
    r.u16();                                   // flags
    const streamCount = r.u16();

    this.streams = {};
    for (let i = 0; i < streamCount; i++) {
      const off = r.u32(), size = r.u32();
      const name = r.cstring();
      r.pos = base + Math.ceil((r.pos - base) / 4) * 4;   // les entetes de flux sont alignes sur 4
      this.streams[name] = this.u8.subarray(base + off, base + off + size);
    }
    this.strings = this.streams["#Strings"];
    this.blobs = this.streams["#Blob"];
    this.guids = this.streams["#GUID"];
  }

  /** Chaine du tas #Strings. */
  str(idx) {
    if (!this.strings || idx >= this.strings.length) return "";
    let end = idx;
    while (end < this.strings.length && this.strings[end] !== 0) end++;
    return DEC_UTF8.decode(this.strings.subarray(idx, end));
  }

  /** Blob du tas #Blob (longueur compressee en tete). */
  blob(idx) {
    if (!this.blobs || idx >= this.blobs.length) return new Uint8Array(0);
    const ref = { p: idx };
    const len = readCompressed(this.blobs, ref);
    return this.blobs.subarray(ref.p, ref.p + len);
  }

  // --- tables -----------------------------------------------------------
  _parseTables() {
    const t = this.streams["#~"] || this.streams["#-"];
    if (!t) throw new Error(`${this.name}: flux de tables absent`);
    const r = new BinaryReader(t, 0, true);
    r.bytes(4);
    r.u8v(); r.u8v();
    const heapSizes = r.u8v();
    r.u8v();
    const valid = r.u64();
    r.u64();                                   // sorted
    this.strIdxSize = (heapSizes & 1) ? 4 : 2;
    this.guidIdxSize = (heapSizes & 2) ? 4 : 2;
    this.blobIdxSize = (heapSizes & 4) ? 4 : 2;

    this.rowCounts = {};
    const present = [];
    for (let i = 0; i < 64; i++) {
      // valid a ete ramene en Number : il tient, aucune table au-dela de 0x2c.
      if (Math.floor(valid / Math.pow(2, i)) % 2 === 1) present.push(i);
    }
    for (const i of present) this.rowCounts[i] = r.u32();

    // Taille d'une colonne, une fois les comptes de lignes connus.
    const colSize = (c) => {
      if (c === "2") return 2;
      if (c === "4") return 4;
      if (c === "s") return this.strIdxSize;
      if (c === "g") return this.guidIdxSize;
      if (c === "b") return this.blobIdxSize;
      if (c[0] === "T") return (this.rowCounts[Number(c.slice(1))] || 0) < 65536 ? 2 : 4;
      const [bits, tables] = CODED[c];
      const max = Math.max(...tables.map((x) => (x < 0 ? 0 : this.rowCounts[x] || 0)));
      return max < (1 << (16 - bits)) ? 2 : 4;
    };

    this.tables = {};
    for (const i of present) {
      const schema = TABLES[i];
      const rows = this.rowCounts[i];
      if (!schema) {
        // Table inconnue : impossible de deviner sa largeur, donc de continuer.
        throw new Error(`${this.name}: table 0x${i.toString(16)} non decrite`);
      }
      const sizes = schema.map(colSize);
      const stride = sizes.reduce((a, b) => a + b, 0);
      this.tables[i] = { start: r.pos, rows, schema, sizes, stride, data: t };
      r.pos += stride * rows;
    }
  }

  /** Ligne d'une table, colonnes brutes (index 1..rows). */
  row(table, index) {
    const t = this.tables[table];
    if (!t || index < 1 || index > t.rows) return null;
    const r = new BinaryReader(t.data, t.start + (index - 1) * t.stride, true);
    return t.sizes.map((s) => (s === 2 ? r.u16() : r.u32()));
  }

  rows(table) { return this.tables[table] ? this.tables[table].rows : 0; }

  /** Decode un index code en {table, index}. */
  decodeCoded(kind, value) {
    const [bits, tables] = CODED[kind];
    const tag = value & ((1 << bits) - 1);
    return { table: tables[tag], index: value >>> bits };
  }
}
