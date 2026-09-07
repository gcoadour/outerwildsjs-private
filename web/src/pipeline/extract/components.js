// Valeurs des champs serialises de tous les MonoBehaviour de la scene.
// Portage de tools/06_dump_components.py.

export function extractComponents(ctx, { onProgress } = {}) {
  const out = [];
  const missing = new Map();
  const errors = new Map();
  let seen = 0;

  for (const { obj, cls } of ctx.behaviours()) {
    seen++;
    const nodes = ctx.tree(cls);
    if (!nodes) { missing.set(cls, (missing.get(cls) || 0) + 1); continue; }
    const fields = ctx.scriptFields(obj);
    if (!fields) { errors.set(cls, (errors.get(cls) || 0) + 1); continue; }
    out.push({
      path_id: obj.pathId,
      script: cls,
      game_object: ctx.ownerId(obj),
      fields: ctx.plain(fields),
    });
    if (onProgress && seen % 200 === 0) onProgress(seen);
  }

  return {
    source: ctx.sceneFile,
    unity: ctx.env.get(ctx.sceneFile).unityVersion,
    count: out.length,
    read: out.length,
    total: seen,
    missing: Object.fromEntries(missing),
    errors: Object.fromEntries(errors),
    components: out,
  };
}
