// Lecture des fichiers serialises Unity (format 9, Unity 4.1.2f1).
//
// Le build de l'alpha est *stripped* : `typeCount` vaut 0, aucun type tree n'est
// embarque. Les structures des classes moteur sont donc decrites en dur dans
// classes.js, et celles des MonoBehaviour sont regenerees depuis les assemblies
// (voir ../dotnet/). La lecture de type trees embarques reste implementee ici :
// elle sert de garde-fou si un jour on pointe l'outil sur un autre build.

import { BinaryReader } from "./binary.js";
import { CLASS_NAMES } from "./classids.js";
import { toSource } from "./source.js";

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
   * @param {Uint8Array|{length:number, read:Function}} input  octets ou source
   */
  constructor(name, input) {
    this.name = name;
    this.source = toSource(input);

    // Seuls l'entete et les metadonnees sont lus ici ; les octets des objets
    // restent dans la source. Sur sharedassets1.assets cela fait 48 Ko au lieu
    // de 410 Mo.
    const head = this.source.read(0, Math.min(64, this.source.length));
    const probe = new BinaryReader(head, 0, false);
    const metadataSize = probe.u32();
    const fileSize = probe.u32();
    probe.u32();
    const dataOffset = probe.u32();
    const u8 = this.source.read(0, Math.max(dataOffset, metadataSize + 64));

    // L'entete est gros-boutiste, quelle que soit la plateforme.
    const h = new BinaryReader(u8, 0, false);
    this.metadataSize = h.u32();
    this.fileSize = h.u32();
    this.version = h.u32();
    this.dataOffset = h.u32();

    if (this.version < 9) {
      throw new Error(`format serialise ${this.version} non gere (attendu >= 9)`);
    }
    if (this.fileSize !== this.source.length) {
      // Tronque ou concatene : mieux vaut le dire tout de suite que lire du vide.
      throw new Error(`${name}: taille incoherente, entete ${this.fileSize}, fichier ${this.source.length}`);
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
    this.resS = null;              // renseigne par UnityEnv si le .resS existe
  }

  /**
   * Octets d'un flux de ressources voisin (.resS), ou vivent les gros blocs :
   * 10 des 142 clips audio du build sont dans sharedassets1.assets.resS.
   */
  resource(offset, size) {
    const res = this.resS;
    if (!res || offset < 0 || offset + size > res.length) return null;
    return res.read(offset, size);
  }

  /** Octets bruts d'un objet, lus a la demande. */
  data(obj) {
    return this.source.read(obj.byteStart, obj.byteSize);
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
