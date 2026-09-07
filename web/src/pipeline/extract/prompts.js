// Catalogue des invites a l'ecran, lu dans le code IL.
//
// Les invites ne vivent pas dans les assets : une quarantaine de classes
// construisent leurs ScreenPrompt en dur, chacune declarant son texte, sa
// priorite et sa zone d'ecran. Le pipeline Python les lisait dans la source
// decompilee par ILSpy, ce qui suppose un SDK .NET installe -- impossible dans
// un navigateur.
//
// On lit donc directement les corps de methode. Le texte est declare a la
// construction et la zone d'ecran a l'inscription, dans deux methodes
// differentes de la meme classe : on les rapproche par le nom du champ, seul
// lien entre les deux, exactement comme le faisait la lecture par expressions
// regulieres.

import { TABLE } from "../dotnet/pe.js";
import { methodBody, decodeIL, userString, methodTarget, fieldName,
         intConstant, methodsOf } from "../dotnet/il.js";
import { parseType } from "../dotnet/signature.js";

const OP_LDSTR = 0x72, OP_NEWOBJ = 0x73, OP_STFLD = 0x7d, OP_LDFLD = 0x7b;
const OP_CALL = 0x28, OP_CALLVIRT = 0x6f;

/** Valeurs litterales d'une enumeration, par valeur. */
function enumConstants(asm, typeName) {
  const out = new Map();
  let typeIndex = 0;
  for (let i = 1; i <= asm.rows(TABLE.TypeDef); i++) {
    if (asm.str(asm.row(TABLE.TypeDef, i)[1]) === typeName) { typeIndex = i; break; }
  }
  if (!typeIndex) return out;

  const row = asm.row(TABLE.TypeDef, typeIndex);
  const next = asm.row(TABLE.TypeDef, typeIndex + 1);
  const from = row[4];
  const to = next ? next[4] : asm.rows(TABLE.Field) + 1;

  // Constant relie une valeur a son champ ; l'index de champ est encode dans
  // le parent, avec le tag 0 pour Field.
  const byField = new Map();
  for (let i = 1; i <= asm.rows(0x0b); i++) {
    const c = asm.row(0x0b, i);
    const parent = asm.decodeCoded("HasConstant", c[1]);
    if (parent.table === TABLE.Field) byField.set(parent.index, asm.blob(c[2]));
  }

  for (let f = from; f < to; f++) {
    const field = asm.row(TABLE.Field, f);
    if (!field) continue;
    const name = asm.str(field[1]);
    if (name === "value__") continue;
    const blob = byField.get(f);
    if (!blob || blob.length < 4) continue;
    const value = new DataView(blob.buffer, blob.byteOffset).getInt32(0, true);
    out.set(value, name);
  }
  return out;
}

/** Nombre de parametres d'un constructeur, depuis sa signature. */
function paramTypes(asm, token) {
  const table = token >>> 24, index = token & 0x00ffffff;
  let blob = null;
  if (table === 0x06) blob = asm.blob(asm.row(TABLE.MethodDef, index)[4]);
  else if (table === 0x0a) blob = asm.blob(asm.row(TABLE.MemberRef, index)[2]);
  if (!blob || !blob.length) return [];
  const ref = { p: 0 };
  ref.p++;                                    // conventions d'appel
  const count = blob[ref.p++];
  parseType(blob, ref);                       // type de retour
  const out = [];
  for (let i = 0; i < count; i++) out.push(parseType(blob, ref));
  return out;
}

/**
 * @param {Assembly} asm  Assembly-CSharp
 * @returns {Array<object>} une entree par ScreenPrompt construit
 */
export function scanPrompts(asm) {
  const buttons = enumConstants(asm, "XboxButton");
  const positions = enumConstants(asm, "PromptPosition");
  const out = [];

  for (let t = 1; t <= asm.rows(TABLE.TypeDef); t++) {
    const typeRow = asm.row(TABLE.TypeDef, t);
    const owner = asm.str(typeRow[1]);
    const constructed = [];       // champ -> entree
    const placement = new Map();  // champ -> {position, visible}
    const runtime = new Map();    // champ -> textes poses plus tard

    for (const m of methodsOf(asm, t)) {
      const body = methodBody(asm, m.index);
      if (!body) continue;
      const il = decodeIL(body);

      for (let i = 0; i < il.length; i++) {
        const ins = il[i];

        // --- construction : new ScreenPrompt(...) ---
        if (ins.op === OP_NEWOBJ) {
          const target = methodTarget(asm, ins.operand);
          if (!target || target.declaring !== "ScreenPrompt") continue;
          const params = paramTypes(asm, ins.operand);

          // Les arguments sont empiles juste avant : on remonte en collectant
          // autant de valeurs que la signature en attend.
          let text = null, dynamic = null, button = null, priority = 0;
          const ints = [];
          for (let j = i - 1, taken = 0; j >= 0 && taken < params.length; j--) {
            const prev = il[j];
            if (prev.op === OP_LDSTR) { text = userString(asm, prev.operand); taken++; continue; }
            const k = intConstant(prev);
            if (k !== null) { ints.unshift(k); taken++; continue; }
            if (prev.op === OP_LDFLD) { dynamic = fieldName(asm, prev.operand); taken++; continue; }
            if (prev.op === 0x02 || prev.op === 0x14) continue;   // ldarg.0, ldnull
            break;
          }
          // Une signature commencant par une valeur d'enumeration porte le
          // bouton de manette ; le dernier entier restant est la priorite.
          const hasButton = params.length && params[0].kind === "valuetype";
          if (hasButton && ints.length) button = buttons.get(ints.shift()) ?? null;
          if (ints.length) priority = ints[ints.length - 1];

          // Le champ affecte suit immediatement.
          let field = null;
          for (let j = i + 1; j < il.length && j < i + 4; j++) {
            if (il[j].op === OP_STFLD) { field = fieldName(asm, il[j].operand); break; }
          }
          constructed.push({
            owner, field,
            // Le jeu prefixe le texte d'une espace pour degager l'icone.
            text: (text || "").trim(),
            button, priority, position: null, visible: true,
            ...(dynamic ? { text: null, dynamic } : {}),
          });
          continue;
        }

        // --- inscription : AddScreenPrompt(_champ, PromptPosition.X) ---
        if (ins.op === OP_CALL || ins.op === OP_CALLVIRT) {
          const target = methodTarget(asm, ins.operand);
          if (!target) continue;

          if (target.name === "AddScreenPrompt") {
            let field = null;
            const ints = [];
            for (let j = i - 1; j >= 0 && j > i - 10; j--) {
              const prev = il[j];
              const k = intConstant(prev);
              if (k !== null) { ints.unshift(k); continue; }
              if (prev.op === OP_LDFLD) { field = fieldName(asm, prev.operand); break; }
            }
            if (field) {
              placement.set(field, {
                position: positions.get(ints[0]) ?? null,
                visible: ints.length < 2 ? true : ints[1] !== 0,
              });
            }
            continue;
          }

          // Certaines invites naissent vides et recoivent leur texte a
          // l'execution : sans cette passe leur entree serait une chaine vide.
          if (target.name === "SetText") {
            let text = null, field = null;
            for (let j = i - 1; j >= 0 && j > i - 6; j--) {
              if (il[j].op === OP_LDSTR && text === null) { text = userString(asm, il[j].operand); continue; }
              if (il[j].op === OP_LDFLD) { field = fieldName(asm, il[j].operand); break; }
            }
            if (field && text) {
              if (!runtime.has(field)) runtime.set(field, []);
              runtime.get(field).push(text);
            }
          }
        }
      }
    }

    for (const entry of constructed) {
      const place = placement.get(entry.field);
      if (place) { entry.position = place.position; entry.visible = place.visible; }
      const later = runtime.get(entry.field);
      if (later && later.length) {
        entry.texts = later;
        if (!entry.text) entry.text = later[0];
      }
      out.push(entry);
    }
  }
  return out;
}
