// Lecture d'un objet guidee par un type tree.
//
// Le meme lecteur sert aux arbres regeneres depuis les assemblies et, le cas
// echeant, a ceux embarques dans un fichier. Les noeuds sont une liste plate
// portant un m_Level, comme le format Unity d'origine.

const ALIGN = 0x4000;

const PRIM = {
  bool: (r) => r.bool(),
  char: (r) => r.u16(),
  SInt8: (r) => r.i8(),
  UInt8: (r) => r.u8v(),
  SInt16: (r) => r.i16(),
  UInt16: (r) => r.u16(),
  SInt32: (r) => r.i32(),
  int: (r) => r.i32(),
  UInt32: (r) => r.u32(),
  "unsigned int": (r) => r.u32(),
  "Type*": (r) => r.i32(),
  SInt64: (r) => r.i64(),
  UInt64: (r) => r.u64(),
  "unsigned long long": (r) => r.u64(),
  "long long": (r) => r.i64(),
  float: (r) => r.f32(),
  double: (r) => r.f64(),
};

/** Reconstruit l'arbre a partir des niveaux. */
export function buildTree(nodes) {
  const root = { ...nodes[0], children: [] };
  const stack = [root];
  for (let i = 1; i < nodes.length; i++) {
    const n = { ...nodes[i], children: [] };
    while (stack.length > n.m_Level) stack.pop();
    const parent = stack[stack.length - 1];
    if (!parent) throw new Error(`type tree incoherent au noeud ${i} (${n.m_Name})`);
    parent.children.push(n);
    stack.push(n);
  }
  return root;
}

function readNode(r, node, file) {
  const type = node.m_Type;
  let value;

  if (PRIM[type]) {
    value = PRIM[type](r);
  } else if (type === "string") {
    value = r.string();
  } else if (type.startsWith("PPtr<")) {
    const fileId = r.i32();
    const pathId = file && file.version >= 14 ? r.i64() : r.i32();
    value = pathId === 0 ? null : { fileId, pathId };
  } else if (node.children.length && node.children[0].m_Type === "Array") {
    value = readArray(r, node.children[0], file);
  } else if (type === "Array") {
    value = readArray(r, node, file);
  } else {
    value = {};
    for (const c of node.children) value[c.m_Name] = readNode(r, c, file);
  }

  if (node.m_MetaFlag & ALIGN) r.align(4);
  return value;
}

function readArray(r, arrayNode, file) {
  const sizeNode = arrayNode.children[0];
  const dataNode = arrayNode.children[1];
  const n = readNode(r, sizeNode, file);
  if (n < 0 || n > 50_000_000) throw new RangeError(`taille de tableau invalide: ${n}`);
  // Un tableau d'octets se lit d'un bloc : c'est le cas courant et le plus lourd.
  let out;
  if (dataNode && (dataNode.m_Type === "UInt8" || dataNode.m_Type === "SInt8")
      && !dataNode.children.length) {
    out = r.bytes(n).slice();
  } else {
    out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = readNode(r, dataNode, file);
  }
  if (arrayNode.m_MetaFlag & ALIGN) r.align(4);
  return out;
}

/**
 * Lit un objet avec l'arbre fourni.
 * @returns {{value: object, consumed: number}}
 */
export function readTypeTree(reader, nodes, file) {
  const root = Array.isArray(nodes) ? buildTree(nodes) : nodes;
  const value = {};
  for (const c of root.children) value[c.m_Name] = readNode(reader, c, file);
  return { value, consumed: reader.pos };
}
