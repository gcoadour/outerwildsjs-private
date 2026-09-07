// Environnement de lecture : les cinq fichiers du build charges ensemble.
//
// Indispensable, car les PPtr traversent les fichiers : un MonoBehaviour de
// level0 pointe vers son MonoScript dans sharedassets0.assets, et ses meshes
// dans sharedassets1.assets. Charger un fichier seul rend ces liens illisibles.

import { SerializedFile } from "./serialized.js";
import { READERS, readMonoBehaviourHeader } from "./classes.js";

/** Nom de fichier nu, quel que soit le separateur employe dans l'entete. */
function basename(p) {
  return p.replace(/\\/g, "/").split("/").pop().toLowerCase();
}

export class UnityEnv {
  constructor() {
    this.files = new Map();       // nom en minuscules -> SerializedFile
    this.cache = new Map();       // "fichier:path_id" -> objet lu
    this.resources = new Map();   // nom en minuscules -> octets d'un .resS
  }

  /** Ajoute un fichier serialise au monde. */
  add(name, u8) {
    const f = new SerializedFile(name, u8);
    f.resS = this.resources.get(`${basename(name)}.ress`) || null;
    this.files.set(basename(name), f);
    return f;
  }

  /**
   * Ajoute un flux de ressources (.resS). A appeler avant add() du fichier
   * correspondant, ou dans n'importe quel ordre : le rattachement est refait.
   */
  addResource(name, u8) {
    this.resources.set(basename(name), u8);
    for (const [n, f] of this.files) {
      if (`${n}.ress` === basename(name)) f.resS = u8;
    }
  }

  get(name) { return this.files.get(basename(name)); }

  /** Tous les objets, ou ceux d'un type et/ou d'un fichier donnes. */
  *objects({ type = null, file = null } = {}) {
    for (const f of this.files.values()) {
      if (file && basename(f.name) !== basename(file)) continue;
      for (const o of f.objects) {
        if (type && o.type !== type) continue;
        yield o;
      }
    }
  }

  /**
   * Resout un PPtr vers son descripteur d'objet.
   * fileId 0 designe le fichier courant, sinon l'externe fileId-1.
   */
  deref(ptr, from) {
    if (!ptr || !ptr.pathId) return null;
    let target = from;
    if (ptr.fileId > 0) {
      const ext = from.externals[ptr.fileId - 1];
      if (!ext) return null;
      target = this.files.get(basename(ext));
      // "library/unity default resources" n'est pas livre avec le jeu :
      // les pointeurs qui y menent restent non resolus, c'est attendu.
      if (!target) return null;
    }
    return target.byPathId.get(ptr.pathId) || null;
  }

  /** Lit un objet avec le lecteur de sa classe, en memoisant. */
  read(obj) {
    if (!obj) return null;
    const key = `${obj.file.name}:${obj.pathId}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const fn = READERS[obj.type];
    let value = null;
    if (fn) {
      try {
        value = fn(obj.file.reader(obj), obj.file);
      } catch {
        value = null;   // objet illisible : on continue, le pipeline le compte
      }
    }
    this.cache.set(key, value);
    return value;
  }

  /** Lit la cible d'un PPtr en une etape. */
  readPtr(ptr, from) { return this.read(this.deref(ptr, from)); }

  /** Nom de la classe C# derriere un MonoBehaviour, via son m_Script. */
  scriptName(obj) {
    const h = this.read(obj);
    if (!h || !h.m_Script) return null;
    const ms = this.readPtr(h.m_Script, obj.file);
    return ms ? (ms.m_ClassName || ms.m_Name) : null;
  }

  /** Entete d'un MonoBehaviour sans passer par le cache typé. */
  monoHeader(obj) {
    return readMonoBehaviourHeader(obj.file.reader(obj), obj.file);
  }

  countByType() {
    const c = new Map();
    for (const f of this.files.values()) {
      for (const [k, v] of f.countByType()) c.set(k, (c.get(k) || 0) + v);
    }
    return c;
  }
}
