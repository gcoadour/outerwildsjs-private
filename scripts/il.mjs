#!/usr/bin/env node
// Desassembleur de service : lire l'IL d'une classe du build, sans SDK .NET.
//
// docs/46-migration-lots.md a ecrit six lots avec un outil de ce genre, monte
// sur pipeline/dotnet/il.js puis jete. Le jeter etait une erreur : chaque lot
// suivant le remonte. Le voici, gardé — et avec la lecon de docs/46 cablee
// dedans, celle qui avait failli couter un lot entier :
//
//   > les blocs d'un `switch` ne sont pas dans l'ordre des cas.
//
// `decodeIL` saute la table de saut d'un `switch` sans la rendre. On la relit
// donc ici, et `--switch` l'affiche : lue de haut en bas, une methode qui
// aiguille dix valeurs d'enumeration donne une reponse fausse et plausible.
//
//   node scripts/il.mjs <Classe>                 methodes et champs
//   node scripts/il.mjs <Classe>.<Methode>       le corps, instruction par instruction
//   node scripts/il.mjs --grep <motif>           les classes dont le nom colle

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Assembly, TABLE } from "../web/src/pipeline/dotnet/pe.js";
import { methodBody, decodeIL, userString, methodTarget, fieldName, intConstant,
         methodsOf } from "../web/src/pipeline/dotnet/il.js";
import { BUILD, haveBuild } from "../tests/run.mjs";

// Les codes d'operation qu'on rencontre reellement en lisant du C# compile.
// Sans eux la sortie est illisible : une soustraction s'ecrit `op_59`, et une
// formule de six lignes demande une table sous les yeux pour se lire.
const NOM = {
  0x00: "nop", 0x01: "break", 0x02: "ldarg.0", 0x03: "ldarg.1", 0x04: "ldarg.2", 0x05: "ldarg.3",
  0x06: "ldloc.0", 0x07: "ldloc.1", 0x08: "ldloc.2", 0x09: "ldloc.3",
  0x0a: "stloc.0", 0x0b: "stloc.1", 0x0c: "stloc.2", 0x0d: "stloc.3",
  0x0e: "ldarg.s", 0x0f: "ldarga.s", 0x10: "starg.s",
  0x11: "ldloc.s", 0x12: "ldloca.s", 0x13: "stloc.s",
  0x14: "ldnull", 0x25: "dup", 0x26: "pop", 0x2a: "ret", 0x7a: "throw",
  0x58: "add", 0x59: "sub", 0x5a: "mul", 0x5b: "div", 0x5d: "rem",
  0x5f: "and", 0x60: "or", 0x61: "xor", 0x62: "shl", 0x63: "shr", 0x65: "neg", 0x66: "not",
  0x8c: "box", 0x74: "castclass", 0x75: "isinst", 0x71: "ldobj", 0x79: "unbox",
  0x8e: "ldlen", 0x9a: "ldelem.ref", 0xa2: "stelem.ref",
  0xfe01: "ceq", 0xfe02: "cgt", 0xfe04: "clt", 0xfe06: "ldftn", 0xfe09: "ldarg", 0xfe0c: "ldloc",
};

// Les branchements, par nom : lire `br(39)` ne dit pas si l'on saute sur faux
// ou sur vrai, et c'est exactement ce qu'on cherche a savoir.
const BRANCHE = {
  0x2b: "br", 0x2c: "brfalse", 0x2d: "brtrue", 0x2e: "beq", 0x2f: "bge", 0x30: "bgt",
  0x31: "ble", 0x32: "blt", 0x33: "bne.un", 0x34: "bge.un", 0x35: "bgt.un", 0x36: "ble.un", 0x37: "blt.un",
  0x38: "br", 0x39: "brfalse", 0x3a: "brtrue", 0x3b: "beq", 0x3c: "bge", 0x3d: "bgt",
  0x3e: "ble", 0x3f: "blt", 0x40: "bne.un", 0x41: "bge.un", 0x42: "bgt.un", 0x43: "ble.un", 0x44: "blt.un",
};

const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "DecalSystem.Runtime", "Assembly-UnityScript",
                    "Assembly-UnityScript-firstpass"];

export function assemblies() {
  const out = [];
  for (const a of ASSEMBLIES) {
    try {
      out.push({ name: a, asm: new Assembly(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`)))) });
    } catch { /* absent de ce build */ }
  }
  return out;
}

/** Retrouve un type par nom, dans n'importe laquelle des assemblies. */
export function findType(name) {
  for (const { name: an, asm } of assemblies()) {
    const n = asm.rows(TABLE.TypeDef);
    for (let i = 1; i <= n; i++) {
      const row = asm.row(TABLE.TypeDef, i);
      if (asm.str(row[1]) === name) return { asm, index: i, assembly: an, row };
    }
  }
  return null;
}

/** Les champs declares par un type (sans ceux de ses bases). */
export function fieldsOf(asm, typeIndex) {
  const row = asm.row(TABLE.TypeDef, typeIndex);
  const next = asm.row(TABLE.TypeDef, typeIndex + 1);
  const from = row[4];
  const to = next ? next[4] : asm.rows(TABLE.Field) + 1;
  const out = [];
  for (let i = from; i < to; i++) {
    const f = asm.row(TABLE.Field, i);
    if (f) out.push(asm.str(f[1]));
  }
  return out;
}

/**
 * Les valeurs d'une enumeration, lues dans la table Constant.
 *
 * Elles ne sont NULLE PART dans les assets : une valeur d'enumeration est un
 * entier serialise, et son nom vit dans le code. docs/32-mort.md a longtemps
 * ecrit que la liste de `DeathType` « vit dans l'assembly, pas dans les assets »
 * et s'est arretee la. Elle y est, et la voici.
 */
export function enumValues(name) {
  const t = findType(name);
  if (!t) return null;
  const { asm, index } = t;
  const row = asm.row(TABLE.TypeDef, index);
  const next = asm.row(TABLE.TypeDef, index + 1);
  const from = row[4];
  const to = next ? next[4] : asm.rows(TABLE.Field) + 1;
  // La table Constant relie un champ a sa valeur litterale. On l'indexe une
  // fois : elle n'est pas triee dans l'ordre des champs.
  const par = new Map();
  const n = asm.rows(0x0b);
  for (let i = 1; i <= n; i++) {
    const c = asm.row(0x0b, i);
    const p = asm.decodeCoded("HasConstant", c[1]);
    if (p.table === TABLE.Field) par.set(p.index, { type: c[0] & 0xff, blob: asm.blob(c[2]) });
  }
  const out = [];
  for (let i = from; i < to; i++) {
    const f = asm.row(TABLE.Field, i);
    if (!f) continue;
    const c = par.get(i);
    if (!c) continue;                    // le champ d'instance `value__`
    const v = new DataView(c.blob.buffer, c.blob.byteOffset, c.blob.byteLength);
    // ELEMENT_TYPE : 0x08 = i4, 0x09 = u4, 0x06 = i2, 0x05 = u1, 0x04 = i1
    const val = c.type === 0x08 || c.type === 0x09 ? v.getInt32(0, true)
      : c.type === 0x06 || c.type === 0x07 ? v.getInt16(0, true)
      : c.blob[0];
    out.push({ nom: asm.str(f[1]), valeur: val });
  }
  return out.sort((a, b) => a.valeur - b.valeur);
}

/**
 * La table de saut d'un `switch`, que decodeIL ne rend pas.
 *
 * Elle est la seule facon de savoir quel bloc traite quel cas : le compilateur
 * range les blocs dans l'ordre qui l'arrange, pas dans celui des valeurs.
 * @returns Map<offset du switch, cibles absolues>
 */
export function switchTargets(code) {
  const view = new DataView(code.buffer, code.byteOffset, code.byteLength);
  const out = new Map();
  for (const inst of decodeIL(code)) {
    if (inst.op !== 0x45) continue;
    const n = view.getUint32(inst.offset + 1, true);
    const base = inst.offset + 5 + 4 * n;
    const cibles = [];
    for (let i = 0; i < n; i++) cibles.push(base + view.getInt32(inst.offset + 5 + 4 * i, true));
    out.set(inst.offset, cibles);
  }
  return out;
}

/** Rend une methode lisible : un texte par instruction. */
export function disassemble(asm, methodIndex) {
  const code = methodBody(asm, methodIndex);
  if (!code) return [];
  const sauts = switchTargets(code);
  const out = [];
  for (const inst of decodeIL(code)) {
    const { offset, op, operand } = inst;
    let txt;
    if (op === 0x72) txt = `ldstr   ${JSON.stringify(userString(asm, operand))}`;
    else if (op === 0x28 || op === 0x6f || op === 0x73) {
      const t = methodTarget(asm, operand);
      const quoi = op === 0x73 ? "newobj " : op === 0x28 ? "call   " : "callvrt";
      txt = `${quoi} ${t ? `${t.declaring}::${t.name}` : `#${operand}`}`;
    } else if (op === 0x7b || op === 0x7d || op === 0x7e || op === 0x80) {
      const quoi = { 0x7b: "ldfld  ", 0x7d: "stfld  ", 0x7e: "ldsfld ", 0x80: "stsfld " }[op];
      txt = `${quoi} ${fieldName(asm, operand) || `#${operand}`}`;
    } else if (op === 0x22) txt = `ldc.r4  ${new DataView(code.buffer, code.byteOffset).getFloat32(offset + 1, true)}`;
    else if (op === 0x23) txt = `ldc.r8  ${new DataView(code.buffer, code.byteOffset).getFloat64(offset + 1, true)}`;
    else if (op === 0x45) txt = `switch  -> ${sauts.get(offset).map((o) => `IL_${o.toString(16).padStart(4, "0")}`).join(" ")}`;
    else if (intConstant(inst) !== null) txt = `ldc.i4  ${intConstant(inst)}`;
    else if (op >= 0x2b && op <= 0x44) {
      const taille = op <= 0x37 ? 1 : 4;
      txt = `${BRANCHE[op].padEnd(7)} IL_${(offset + 1 + taille + operand).toString(16).padStart(4, "0")}`;
    } else if (NOM[op]) txt = `${NOM[op]}${operand !== null ? `  ${operand}` : ""}`;
    else txt = `op_${op.toString(16)}${operand !== null ? ` ${operand}` : ""}`;
    out.push(`IL_${offset.toString(16).padStart(4, "0")}  ${txt}`);
  }
  return out;
}

function principal() {
  const args = process.argv.slice(2);
  if (args[0] === "--enum") {
    const vals = enumValues(args[1]);
    if (!vals) { console.log(`enumeration introuvable : ${args[1]}`); return; }
    for (const v of vals) console.log(`${String(v.valeur).padStart(4)}  ${v.nom}`);
    return;
  }
  if (args[0] === "--string") {
    const query = (args[1] || "").toLowerCase();
    for (const { name: an, asm } of assemblies()) {
      const n = asm.rows(TABLE.TypeDef);
      for (let i = 1; i <= n; i++) {
        const clsName = asm.str(asm.row(TABLE.TypeDef, i)[1]);
        const methods = methodsOf(asm, i);
        for (const m of methods) {
          const body = methodBody(asm, m.index);
          if (!body) continue;
          const instrs = decodeIL(body);
          for (const ins of instrs) {
            if (ins.op === 0x72 && ins.operand) {
              const s = userString(asm, ins.operand);
              if (s && s.toLowerCase().includes(query)) {
                console.log(`${clsName}.${m.name}: "${s}"`);
              }
            }
          }
        }
      }
    }
    return;
  }
  if (args[0] === "--grep") {
    const re = new RegExp(args[1], "i");
    for (const { name: an, asm } of assemblies()) {
      const n = asm.rows(TABLE.TypeDef);
      for (let i = 1; i <= n; i++) {
        const nom = asm.str(asm.row(TABLE.TypeDef, i)[1]);
        if (re.test(nom)) console.log(`${an.padEnd(30)} ${nom}`);
      }
    }
    return;
  }
  const [cible] = args;
  if (!cible) { console.log("usage: node scripts/il.mjs <Classe>[.<Methode>]"); return; }
  // `Classe..ctor` : on coupe au PREMIER point, sinon le constructeur est perdu.
  const coupe = cible.indexOf(".");
  const cls = coupe < 0 ? cible : cible.slice(0, coupe);
  const meth = coupe < 0 ? null : cible.slice(coupe + 1);
  const t = findType(cls);
  if (!t) { console.log(`classe introuvable : ${cls}`); return; }
  const methodes = methodsOf(t.asm, t.index);
  if (!meth) {
    console.log(`${cls}   (${t.assembly})`);
    console.log(`champs   ${fieldsOf(t.asm, t.index).join(", ")}`);
    console.log(`methodes ${methodes.map((m) => m.name).join(", ")}`);
    return;
  }
  for (const m of methodes.filter((m) => m.name === meth)) {
    console.log(`--- ${cls}.${m.name} ---`);
    for (const l of disassemble(t.asm, m.index)) console.log(l);
  }
}

if (!haveBuild()) console.log("ignore : OW_BUILD ne pointe pas sur un build extrait.");
else if (process.argv[1] && process.argv[1].endsWith("il.mjs")) principal();
