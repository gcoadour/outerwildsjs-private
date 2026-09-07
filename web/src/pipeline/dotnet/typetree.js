// Reconstruction des type trees des MonoBehaviour depuis les assemblies.
//
// Les regles de serialisation d'Unity sont deterministes : champs publics ou
// [SerializeField], dans l'ordre de declaration, classes de base d'abord, avec
// un alignement sur 4 apres tout champ de moins de 4 octets. Il suffit donc de
// lire les metadonnees .NET pour retrouver la disposition exacte des octets.
//
// La verification est la meme que pour les classes moteur : lire un objet avec
// l'arbre genere doit consommer exactement ses byteSize octets.

import { Assembly, TABLE } from "./pe.js";
import { parseFieldSignature, parseType } from "./signature.js";

const ALIGN = 0x4000;

// --- attributs de champ et de type (ECMA-335 II.23.1) ---
const F_STATIC = 0x0010, F_INITONLY = 0x0020, F_LITERAL = 0x0040,
      F_NOTSERIALIZED = 0x0080, F_ACCESS_MASK = 0x0007, F_PUBLIC = 0x0006;
const T_SERIALIZABLE = 0x2000;

// Primitives de moins de 4 octets : Unity aligne apres.
const NARROW = new Set(["bool", "SInt8", "UInt8", "SInt16", "UInt16"]);

/**
 * Structures Unity serialisees en ligne, decrites en dur : elles vivent dans
 * UnityEngine.dll, dont les champs prives ne portent pas les memes noms que la
 * forme serialisee. Les emettre a la main est plus sur que les deduire.
 */
const BUILTIN = {
  "UnityEngine.Vector2": [["float", "x"], ["float", "y"]],
  "UnityEngine.Vector3": [["float", "x"], ["float", "y"], ["float", "z"]],
  "UnityEngine.Vector4": [["float", "x"], ["float", "y"], ["float", "z"], ["float", "w"]],
  "UnityEngine.Quaternion": [["float", "x"], ["float", "y"], ["float", "z"], ["float", "w"]],
  "UnityEngine.Color": [["float", "r"], ["float", "g"], ["float", "b"], ["float", "a"]],
  "UnityEngine.Color32": [["unsigned int", "rgba"]],
  "UnityEngine.Rect": [["float", "x"], ["float", "y"], ["float", "width"], ["float", "height"]],
  "UnityEngine.LayerMask": [["int", "m_Bits"]],
  "UnityEngine.RectOffset": [["int", "m_Left"], ["int", "m_Right"],
                             ["int", "m_Top"], ["int", "m_Bottom"]],
  "UnityEngine.Matrix4x4": Array.from({ length: 16 },
    (_, i) => ["float", `e${Math.floor(i / 4)}${i % 4}`]),
};

/** Structures dont l'emission demande plus qu'une liste plate de champs. */
const BUILTIN_COMPLEX = new Set(["UnityEngine.Bounds", "UnityEngine.AnimationCurve",
                                 "UnityEngine.GUIStyle"]);

/**
 * Emet un GUIStyle. Sa forme serialisee ne se deduit pas de ses champs C# —
 * en Unity 4 l'objet a un pendant natif — donc elle est ecrite a la main.
 * Verifiee sur le seul GUIStyle serialise du build, dans TelescopeGUI : la
 * structure y occupe exactement 312 octets.
 *
 * Detail qui compte : les booleens vont par paires, tassees, avec un seul
 * alignement apres chaque paire. Aligner apres chaque booleen ajouterait
 * 8 octets et decalerait tout ce qui suit.
 */
function emitGUIStyle(nodes, level, name) {
  nodes.push(level, "GUIStyle", name);
  const L = level + 1;
  nodes.push(L, "string", "m_Name", true);
  for (const st of ["m_Normal", "m_Hover", "m_Active", "m_Focused",
                    "m_OnNormal", "m_OnHover", "m_OnActive", "m_OnFocused"]) {
    nodes.push(L, "GUIStyleState", st);
    nodes.push(L + 1, "PPtr<Texture2D>", "m_Background");
    nodes.push(L + 1, "ColorRGBA", "m_TextColor");
    for (const c of ["r", "g", "b", "a"]) nodes.push(L + 2, "float", c);
  }
  for (const ro of ["m_Border", "m_Margin", "m_Padding", "m_Overflow"]) {
    nodes.push(L, "RectOffset", ro);
    for (const c of ["m_Left", "m_Right", "m_Top", "m_Bottom"]) {
      nodes.push(L + 1, "int", c);
    }
  }
  nodes.push(L, "PPtr<Font>", "m_Font");
  for (const i of ["m_FontSize", "m_FontStyle", "m_Alignment"]) nodes.push(L, "int", i);
  nodes.push(L, "bool", "m_WordWrap");
  nodes.push(L, "bool", "m_RichText", true);
  nodes.push(L, "int", "m_TextClipping");
  nodes.push(L, "int", "m_ImagePosition");
  nodes.push(L, "Vector2f", "m_ContentOffset");
  nodes.push(L + 1, "float", "x");
  nodes.push(L + 1, "float", "y");
  nodes.push(L, "float", "m_FixedWidth");
  nodes.push(L, "float", "m_FixedHeight");
  nodes.push(L, "bool", "m_StretchWidth");
  nodes.push(L, "bool", "m_StretchHeight", true);
}

export class TypeUniverse {
  constructor() {
    this.assemblies = new Map();     // nom court -> Assembly
    this.index = new Map();          // nom court -> Map("ns.Nom" -> numero de TypeDef)
    this.fieldAttrs = new Map();     // "asm#champ" -> Set de noms d'attributs
  }

  /** Ajoute un assembly. `name` est le nom court, sans .dll. */
  add(name, u8) {
    const short = name.replace(/\.dll$/i, "");
    const asm = new Assembly(short, u8);
    this.assemblies.set(short, asm);

    const idx = new Map();
    for (let i = 1; i <= asm.rows(TABLE.TypeDef); i++) {
      const r = asm.row(TABLE.TypeDef, i);
      idx.set(this._full(asm.str(r[2]), asm.str(r[1])), i);
    }
    this.index.set(short, idx);
    this._indexFieldAttributes(asm, short);
    return asm;
  }

  _full(ns, name) { return ns ? `${ns}.${name}` : name; }

  /** Recense les attributs poses sur les champs ([SerializeField], surtout). */
  _indexFieldAttributes(asm, short) {
    for (let i = 1; i <= asm.rows(TABLE.CustomAttribute); i++) {
      const r = asm.row(TABLE.CustomAttribute, i);
      const parent = asm.decodeCoded("HasCustomAttribute", r[0]);
      if (parent.table !== TABLE.Field) continue;
      const type = asm.decodeCoded("CustomAttributeType", r[1]);
      let attrName = null;
      if (type.table === TABLE.MemberRef) {
        const mr = asm.row(TABLE.MemberRef, type.index);
        const cls = asm.decodeCoded("MemberRefParent", mr[0]);
        if (cls.table === TABLE.TypeRef) {
          const tr = asm.row(TABLE.TypeRef, cls.index);
          attrName = asm.str(tr[1]);
        } else if (cls.table === TABLE.TypeDef) {
          const td = asm.row(TABLE.TypeDef, cls.index);
          attrName = asm.str(td[1]);
        }
      }
      if (!attrName) continue;
      const key = `${short}#${parent.index}`;
      if (!this.fieldAttrs.has(key)) this.fieldAttrs.set(key, new Set());
      this.fieldAttrs.get(key).add(attrName);
    }
  }

  /** Assembly cible d'un TypeRef, via son ResolutionScope. */
  _refAssembly(asm, scopeValue) {
    const s = asm.decodeCoded("ResolutionScope", scopeValue);
    if (s.table === TABLE.AssemblyRef) {
      const r = asm.row(TABLE.AssemblyRef, s.index);
      return this.assemblies.get(asm.str(r[6])) || null;
    }
    if (s.table === TABLE.TypeRef) {
      // Type imbrique : on remonte au type englobant.
      const r = asm.row(TABLE.TypeRef, s.index);
      return this._refAssembly(asm, r[0]);
    }
    return asm;   // Module / ModuleRef : le meme assembly
  }

  /** Resout un index code TypeDefOrRef en {asm, index, name, ns} ou null. */
  resolve(asm, table, index) {
    if (table === TABLE.TypeDef) {
      const r = asm.row(TABLE.TypeDef, index);
      if (!r) return null;
      return { asm, index, name: asm.str(r[1]), ns: asm.str(r[2]), row: r };
    }
    if (table === TABLE.TypeRef) {
      const r = asm.row(TABLE.TypeRef, index);
      if (!r) return null;
      const name = asm.str(r[1]), ns = asm.str(r[2]);
      const target = this._refAssembly(asm, r[0]);
      if (target) {
        const i = this.index.get(target.name).get(this._full(ns, name));
        if (i) return this.resolve(target, TABLE.TypeDef, i);
      }
      // Type d'un assembly non charge (UnityEngine, mscorlib) : le nom suffit.
      return { asm: null, index: 0, name, ns, row: null };
    }
    if (table === TABLE.TypeSpec) {
      // Base generique, ex. DecalProjectorComponent : Base<T>. Sans ce cas, la
      // chaine d'heritage s'arrete la et tous les champs herites disparaissent
      // du type tree — 83 MonoBehaviour du build en dependent.
      const r = asm.row(TABLE.TypeSpec, index);
      if (!r) return null;
      const ty = parseType(asm.blob(r[0]), { p: 0 });
      if (ty.ref) return this.resolve(asm, ty.ref.table, ty.ref.index);
      return null;
    }
    return null;
  }

  /** Type de base d'un TypeDef. */
  baseOf(t) {
    if (!t || !t.row || !t.asm) return null;
    const extends_ = t.row[3];
    if (!extends_) return null;
    const d = t.asm.decodeCoded("TypeDefOrRef", extends_);
    return this.resolve(t.asm, d.table, d.index);
  }

  fullName(t) { return this._full(t.ns, t.name); }

  /** Vrai si le type derive de UnityEngine.Object (donc serialise en PPtr). */
  isUnityObject(t) {
    for (let cur = t, depth = 0; cur && depth < 32; cur = this.baseOf(cur), depth++) {
      if (cur.ns === "UnityEngine" && cur.name === "Object") return true;
    }
    return false;
  }

  isEnum(t) {
    const b = this.baseOf(t);
    return !!b && b.ns === "System" && b.name === "Enum";
  }

  /** Type sous-jacent d'une enumeration (son champ d'instance). */
  enumUnderlying(t) {
    for (const f of this.declaredFields(t)) {
      if (!(f.flags & F_STATIC)) {
        const ty = parseFieldSignature(t.asm.blob(f.signature));
        if (ty.kind === "prim") return ty.name;
      }
    }
    return "int";
  }

  /** Champs declares par un TypeDef (hors heritage), dans l'ordre du fichier. */
  declaredFields(t) {
    if (!t || !t.asm || !t.row) return [];
    const asm = t.asm;
    const start = t.row[4];
    const next = asm.row(TABLE.TypeDef, t.index + 1);
    const end = next ? next[4] : asm.rows(TABLE.Field) + 1;
    const out = [];
    for (let i = start; i < end; i++) {
      const r = asm.row(TABLE.Field, i);
      if (!r) break;
      out.push({ index: i, flags: r[0], name: asm.str(r[1]), signature: r[2],
                 attrs: this.fieldAttrs.get(`${asm.name}#${i}`) || null });
    }
    return out;
  }

  /** Un champ est-il serialise par Unity ? */
  isSerialized(f) {
    if (f.flags & (F_STATIC | F_LITERAL | F_NOTSERIALIZED | F_INITONLY)) return false;
    const isPublic = (f.flags & F_ACCESS_MASK) === F_PUBLIC;
    return isPublic || (f.attrs && f.attrs.has("SerializeField"));
  }

  /** Chaine d'heritage, de la classe la plus haute a la classe elle-meme. */
  ancestry(t, stopAt) {
    const chain = [];
    for (let cur = t, depth = 0; cur && depth < 32; cur = this.baseOf(cur), depth++) {
      if (stopAt(cur)) break;
      chain.push(cur);
    }
    return chain.reverse();
  }
}

/** Accumulateur de noeuds de type tree. */
class Nodes {
  constructor() { this.out = []; }
  push(level, type, name, align = false) {
    this.out.push({ m_Level: level, m_Type: type, m_Name: name, m_MetaFlag: align ? ALIGN : 0 });
  }
}

/**
 * Emet les noeuds d'un champ. Retourne false si le type n'est pas serialisable
 * par Unity : le champ est alors simplement absent des octets, comme chez Unity.
 *
 * @param inArray  vrai pour l'element d'un tableau : Unity y tasse les types
 *                 courts et n'aligne qu'apres le tableau entier.
 */
function emitField(u, nodes, level, name, ty, inArray = false, depth = 0) {
  if (depth > 8) return false;                 // Unity limite l'imbrication

  if (ty.kind === "prim") {
    nodes.push(level, ty.name, name, !inArray && NARROW.has(ty.name));
    return true;
  }
  if (ty.kind === "string") {
    nodes.push(level, "string", name, true);
    return true;
  }
  if (ty.kind === "array") {
    // Unity ne serialise ni tableau de tableaux ni tableau de chaines imbrique.
    if (ty.elem.kind === "array" || ty.elem.kind === "generic") return false;
    const probe = new Nodes();
    if (!emitField(u, probe, level + 2, "data", ty.elem, true, depth + 1)) return false;
    nodes.push(level, "vector", name);
    nodes.push(level + 1, "Array", "Array", true);
    nodes.push(level + 2, "int", "size");
    nodes.out.push(...probe.out);
    return true;
  }
  if (ty.kind === "generic") {
    const t = u.resolve(ty.refAsm, ty.ref.table, ty.ref.index);
    if (!t || u.fullName(t) !== "System.Collections.Generic.List`1") return false;
    return emitField(u, nodes, level, name,
                     { kind: "array", elem: ty.args[0] }, inArray, depth);
  }
  if (ty.kind === "class" || ty.kind === "valuetype") {
    const t = u.resolve(ty.refAsm, ty.ref.table, ty.ref.index);
    if (!t) return false;
    const full = u.fullName(t);

    if (BUILTIN[full]) {
      nodes.push(level, t.name, name);
      for (const [ft, fn] of BUILTIN[full]) nodes.push(level + 1, ft, fn, NARROW.has(ft));
      return true;
    }
    if (full === "UnityEngine.Bounds") {
      nodes.push(level, "AABB", name);
      for (const part of ["m_Center", "m_Extent"]) {
        nodes.push(level + 1, "Vector3f", part);
        for (const axis of ["x", "y", "z"]) nodes.push(level + 2, "float", axis);
      }
      return true;
    }
    if (full === "UnityEngine.AnimationCurve") {
      nodes.push(level, "AnimationCurve", name);
      nodes.push(level + 1, "vector", "m_Curve");
      nodes.push(level + 2, "Array", "Array", true);
      nodes.push(level + 3, "int", "size");
      nodes.push(level + 3, "Keyframe", "data");
      for (const f of ["time", "value", "inSlope", "outSlope"]) {
        nodes.push(level + 4, "float", f);
      }
      nodes.push(level + 1, "int", "m_PreInfinity");
      nodes.push(level + 1, "int", "m_PostInfinity");
      return true;
    }
    if (full === "UnityEngine.GUIStyle") {
      emitGUIStyle(nodes, level, name);
      return true;
    }
    if (BUILTIN_COMPLEX.has(full)) return false;

    if (!t.asm) return false;                  // type d'un assembly non charge
    if (u.isEnum(t)) {
      const under = u.enumUnderlying(t);
      nodes.push(level, under, name, !inArray && NARROW.has(under));
      return true;
    }
    if (u.isUnityObject(t)) {
      nodes.push(level, `PPtr<${t.name}>`, name);
      return true;
    }
    if (!(t.row[0] & T_SERIALIZABLE)) return false;

    // Classe ou structure [Serializable] : serialisee en ligne.
    const probe = new Nodes();
    emitClassFields(u, probe, level + 1, t, depth + 1);
    nodes.push(level, t.name, name);
    nodes.out.push(...probe.out);
    return true;
  }
  return false;
}

/** Champs serialises d'un type, classes de base d'abord. */
function emitClassFields(u, nodes, level, t, depth = 0) {
  const chain = u.ancestry(t, (c) => !c.asm || c.ns === "System"
    || (c.ns === "UnityEngine" && ["MonoBehaviour", "Behaviour", "Component",
                                   "Object", "ScriptableObject"].includes(c.name)));
  for (const cls of chain) {
    for (const f of u.declaredFields(cls)) {
      if (!u.isSerialized(f)) continue;
      const ty = parseFieldSignature(cls.asm.blob(f.signature));
      ty.refAsm = cls.asm;
      if (ty.args) for (const a of ty.args) a.refAsm = cls.asm;
      if (ty.elem) ty.elem.refAsm = cls.asm;
      emitField(u, nodes, level, f.name, ty, false, depth);
    }
  }
}

/**
 * Type tree complet d'une classe MonoBehaviour : l'entete commune, puis les
 * champs du script. Retourne null si la classe est introuvable.
 */
export function monoBehaviourTree(u, className) {
  let found = null;
  for (const [short, idx] of u.index) {
    for (const [full, i] of idx) {
      if (full === className || full.endsWith(`.${className}`)) {
        const t = u.resolve(u.assemblies.get(short), TABLE.TypeDef, i);
        if (t && !u.isEnum(t)) { found = t; break; }
      }
    }
    if (found) break;
  }
  if (!found) return null;

  const nodes = new Nodes();
  nodes.push(0, "MonoBehaviour", "Base");
  nodes.push(1, "PPtr<GameObject>", "m_GameObject");
  nodes.push(1, "bool", "m_Enabled", true);
  nodes.push(1, "PPtr<MonoScript>", "m_Script");
  nodes.push(1, "string", "m_Name");
  emitClassFields(u, nodes, 1, found);
  return nodes.out;
}
