// Source d'octets d'un fichier du build.
//
// Le build extrait pese environ 540 Mo, dont 410 pour sharedassets1.assets.
// Tout garder en memoire ferait echouer l'onglet sur bien des machines. Les
// fichiers serialises n'ont pourtant besoin en permanence que de leur entete :
// 47 Ko pour sharedassets1. Le reste se lit a la demande.
//
// Deux implementations : en memoire (tests, petits fichiers) et adossee a un
// FileSystemSyncAccessHandle, disponible dans un Web Worker, qui lit dans le
// stockage prive de l'origine sans charger le fichier.

export class MemorySource {
  constructor(u8) { this.u8 = u8; }
  get length() { return this.u8.length; }
  read(offset, length) { return this.u8.subarray(offset, offset + length); }
  close() {}
}

export class SyncFileSource {
  /** @param {FileSystemSyncAccessHandle} handle */
  constructor(handle) {
    this.handle = handle;
    this.size = handle.getSize();
  }
  get length() { return this.size; }
  read(offset, length) {
    const n = Math.max(0, Math.min(length, this.size - offset));
    const out = new Uint8Array(n);
    if (n) this.handle.read(out, { at: offset });
    return out;
  }
  close() { try { this.handle.close(); } catch { /* deja ferme */ } }
}

/** Accepte indifferemment une source ou des octets bruts. */
export function toSource(x) {
  if (x && typeof x.read === "function") return x;
  return new MemorySource(x);
}
