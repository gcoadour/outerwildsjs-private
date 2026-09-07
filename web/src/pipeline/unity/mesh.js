// Decodage des maillages Unity 4.
//
// m_Vertices est vide sur ce build : les sommets vivent dans m_VertexData, un
// tampon entrelace decrit par des descripteurs de canaux et de flux. Les 1 569
// maillages du build ont m_MeshCompression a 0 et six canaux dont quatre
// utilises (position, normale, UV0, tangente), en un seul flux de 48 octets par
// sommet. Le chemin compresse (m_CompressedMesh) reste donc non implemente, et
// signale explicitement plutot que de rendre un maillage faux.

// Ordre des canaux dans un VertexData Unity 4.
export const CHANNEL = { POSITION: 0, NORMAL: 1, COLOR: 2, UV0: 3, UV1: 4, TANGENT: 5 };

/** Taille d'une composante, par format de canal. */
const FORMAT_SIZE = { 0: 4, 1: 2, 2: 1 };   // float32, float16, octet normalise

function readHalf(view, off, le) {
  const h = view.getUint16(off, le);
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

function readComponent(view, off, format, le) {
  if (format === 0) return view.getFloat32(off, le);
  if (format === 1) return readHalf(view, off, le);
  if (format === 2) return view.getUint8(off) / 255;
  return 0;
}

/**
 * Decode un Mesh lu par type tree.
 * @returns {{name, vertexCount, positions, normals, uv0, tangents, indices, subMeshes}}
 */
export function decodeMesh(mesh, littleEndian = true) {
  if (mesh.m_MeshCompression) {
    throw new Error(`maillage compresse (m_MeshCompression=${mesh.m_MeshCompression}) non gere`);
  }
  const vd = mesh.m_VertexData;
  const count = vd.m_VertexCount >>> 0;
  const buf = vd.m_DataSize;
  if (!count || !buf || !buf.length) {
    return { name: mesh.m_Name, vertexCount: 0, positions: null, normals: null,
             uv0: null, tangents: null, indices: new Uint16Array(0), subMeshes: [] };
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const out = { name: mesh.m_Name, vertexCount: count, positions: null,
                normals: null, uv0: null, tangents: null };

  vd.m_Channels.forEach((ch, index) => {
    if (!ch.dimension) return;                       // canal absent
    const stream = vd.m_Streams[ch.stream];
    if (!stream || !stream.stride) return;
    const size = FORMAT_SIZE[ch.format] || 4;
    const dst = new Float32Array(count * ch.dimension);
    for (let v = 0; v < count; v++) {
      const base = stream.offset + v * stream.stride + ch.offset;
      for (let c = 0; c < ch.dimension; c++) {
        const at = base + c * size;
        dst[v * ch.dimension + c] = at + size <= buf.length
          ? readComponent(view, at, ch.format, littleEndian) : 0;
      }
    }
    if (index === CHANNEL.POSITION) out.positions = dst;
    else if (index === CHANNEL.NORMAL) out.normals = dst;
    else if (index === CHANNEL.UV0) out.uv0 = dst;
    else if (index === CHANNEL.TANGENT) out.tangents = dst;
  });

  // Indices : toujours sur 16 bits en Unity 4.
  const ib = mesh.m_IndexBuffer;
  const indices = new Uint16Array(ib.length >> 1);
  const ibView = new DataView(ib.buffer, ib.byteOffset, ib.byteLength);
  for (let i = 0; i < indices.length; i++) indices[i] = ibView.getUint16(i * 2, littleEndian);

  out.indices = indices;
  out.subMeshes = (mesh.m_SubMeshes || []).map((s) => ({
    firstIndex: s.firstByte >>> 1,
    indexCount: s.indexCount >>> 0,
    firstVertex: s.firstVertex >>> 0,
    vertexCount: s.vertexCount >>> 0,
    topology: s.topology,
  }));
  return out;
}
