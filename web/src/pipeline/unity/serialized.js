// Lecture des fichiers serialises Unity (format 9, Unity 4.1.2f1).
//
// Le build de l'alpha est *stripped* : `typeCount` vaut 0, aucun type tree n'est
// embarque. Les structures des classes moteur sont donc decrites en dur dans
// classes.js, et celles des MonoBehaviour sont regenerees depuis les assemblies
// (voir ../dotnet/). La lecture de type trees embarques reste implementee ici :
// elle sert de garde-fou si un jour on pointe l'outil sur un autre build.

import { BinaryReader } from "./binary.js";
import { CLASS_NAMES } from "./classids.js";

/** Un noeud de type tree, au meme format que celui produit par le generateur. */
function readTypeTreeNodeOld(r, nodes, level) {
  const type = r.cstring();
  const name = r.cstring();
  const size = r.i32();
  const index = r.i32();
  const isArray = r.i32();
  const version = r.i32();
  const metaFlag = r.i32();
  nodes.push({ m_Level: level, m_Type: type, m_Name: name, m_ByteSize: size,
               m_Index: index, m_IsArray: isArray, m_Version: version, m_MetaFlag: metaFlag });
  const childCount = r.i32();
  for (let i = 0; i < childCount; i++) readTypeTreeNodeOld(r, nodes, level + 1);
  return nodes;
}

export class SerializedFile {
  /**
   * @param {string} name  nom du fichier (level0, sharedassets1.assets, ...)
   * @param {Uint8Array} u8  contenu complet
   */
  constructor(name, u8) {
    this.name = name;
    this.u8 = u8;

    // L'entete est gros-boutiste, quelle que soit la plateforme.
    const h = new BinaryReader(u8, 0, false);
    this.metadataSize = h.u32();
    this.fileSize = h.u32();
    this.version = h.u32();
    this.dataOffset = h.u32();

    if (this.version < 9) {
      throw new Error(`format serialise ${this.version} non gere (attendu >= 9)`);
    }
    if (this.fileSize !== u8.length) {
      // Tronque ou concatene : mieux vaut le dire tout de suite que lire du vide.
      throw new Error(`taille incoherente: entete ${this.fileSize}, fichier ${u8.length}`);
    }

    const endianness = h.u8v();   // 0 = petit-boutiste
    h.bytes(3);                   // reserve
    this.littleEndian = endianness === 0;

    const r = new BinaryReader(u8, h.pos, this.littleEndian);
    this.unityVersion = r.cstring();
    this.targetPlatform = r.i32();
    this.hasTypeTree = this.version >= 13 ? r.bool() : true;

    // --- types ---
    this.types = new Map();       // classID -> noeuds de type tree
    const typeCount = r.i32();
    for (let i = 0; i < typeCount; i++) {
      const classId = r.i32();
      if (this.hasTypeTree) this.types.set(classId, readTypeTreeNodeOld(r, [], 0));
    }

    // --- objets ---
    this.bigIdEnabled = this.version >= 7 && this.version < 14 ? r.i32() : 0;
    const objectCount = r.i32();
    this.objects = new Array(objectCount);
    for (let i = 0; i < objectCount; i++) {
      const pathId = this.bigIdEnabled ? r.i64() : r.i32();
      const byteStart = r.i32();
      const byteSize = r.i32();
      const typeId = r.i32();
      const classId = r.i16();
      const isDestroyed = r.i16();
      this.objects[i] = {
        pathId, byteStart: byteStart + this.dataOffset, byteSize,
        typeId, classId, isDestroyed,
        type: CLASS_NAMES[classId] || `Class${classId}`,
        file: this,
      };
    }

    // --- fichiers externes referenses par les PPtr ---
    this.externals = [];
    const externalCount = r.i32();
    for (let i = 0; i < externalCount; i++) {
      if (this.version >= 6) r.cstring();          // champ vide
      if (this.version >= 5) { r.bytes(16); r.i32(); }  // guid + type
      this.externals.push(r.cstring());
    }

    this.byPathId = new Map(this.objects.map((o) => [o.pathId, o]));
  }

  /** Octets bruts d'un objet. */
  data(obj) {
    return this.u8.subarray(obj.byteStart, obj.byteStart + obj.byteSize);
  }

  /** Lecteur positionne sur un objet. */
  reader(obj) {
    return new BinaryReader(this.data(obj), 0, this.littleEndian);
  }

  /** Comptage par type, pour l'inventaire. */
  countByType() {
    const c = new Map();
    for (const o of this.objects) c.set(o.type, (c.get(o.type) || 0) + 1);
    return c;
  }
}
