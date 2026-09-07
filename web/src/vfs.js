// Stockage local des fichiers produits par le pipeline.
//
// Tout ce que le pipeline sort vient du fichier de l'alpha fourni par la
// personne qui visite la page : rien n'est televerse, rien ne quitte le
// navigateur. Le stockage prive de l'origine (OPFS) sert de disque ; il survit
// au rechargement, ce qui evite de refaire une extraction de plusieurs minutes.

const ROOT = "outerwilds";

async function rootDir() {
  if (!navigator.storage || !navigator.storage.getDirectory) {
    throw new Error("Le stockage prive de l'origine n'est pas disponible dans ce navigateur.");
  }
  const base = await navigator.storage.getDirectory();
  return base.getDirectoryHandle(ROOT, { create: true });
}

/** Descend (et cree au besoin) le repertoire d'un chemin, retourne [dir, nom]. */
async function resolve(path, { create = false } = {}) {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop();
  let dir = await rootDir();
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return [dir, name];
}

export const vfs = {
  async write(path, data) {
    const [dir, name] = await resolve(path, { create: true });
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  },

  async writeJSON(path, value) {
    await vfs.write(path, JSON.stringify(value));
  },

  async file(path) {
    try {
      const [dir, name] = await resolve(path);
      const handle = await dir.getFileHandle(name);
      return await handle.getFile();
    } catch {
      return null;
    }
  },

  async exists(path) { return (await vfs.file(path)) !== null; },

  async readJSON(path) {
    const f = await vfs.file(path);
    return f ? JSON.parse(await f.text()) : null;
  },

  async readText(path) {
    const f = await vfs.file(path);
    return f ? f.text() : null;
  },

  /** Efface tout le contenu extrait. */
  async clear() {
    if (!navigator.storage || !navigator.storage.getDirectory) return;
    const base = await navigator.storage.getDirectory();
    try {
      await base.removeEntry(ROOT, { recursive: true });
    } catch { /* rien a effacer */ }
  },

  /** Taille totale occupee, en octets. */
  async size() {
    let total = 0;
    const walk = async (dir) => {
      for await (const [, handle] of dir.entries()) {
        if (handle.kind === "file") total += (await handle.getFile()).size;
        else await walk(handle);
      }
    };
    try { await walk(await rootDir()); } catch { /* rien */ }
    return total;
  },
};
