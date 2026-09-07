// Graphe de scene complet : hierarchie, transforms locales, composants.
// Portage de tools/05_dump_scene.py.

import { round } from "./context.js";

export function extractScene(ctx, { onProgress } = {}) {
  const env = ctx.env;
  const file = env.get(ctx.sceneFile);

  // Composants par GameObject.
  const comps = new Map();
  let done = 0;
  for (const [gid, go] of ctx.gameObjects) {
    const list = [];
    for (const c of go.m_Component || []) {
      const target = c.component && env.deref(c.component, file);
      if (!target) continue;
      const entry = { type: target.type };
      if (target.type === "MonoBehaviour") {
        const sn = env.scriptName(target);
        if (sn) entry.script = sn;
        const h = env.monoHeader(target);
        entry.enabled = !!h.m_Enabled;
      }
      list.push(entry);
    }
    comps.set(gid, list);
    if (onProgress && ++done % 1000 === 0) onProgress(done, ctx.gameObjects.size);
  }

  // Noeuds, indexes par path_id de Transform.
  const nodes = new Map();
  const childrenOf = new Map();
  const roots = [];
  const transformIds = new Set(ctx.transformId.values());

  for (const [gid, t] of ctx.transformOf) {
    const tid = ctx.transformId.get(gid);
    const go = ctx.gameObjects.get(gid);
    nodes.set(tid, {
      name: go ? go.m_Name : "<?>",
      active: go ? !!go.m_IsActive : true,
      layer: go ? go.m_Layer : 0,
      tag: go ? go.m_Tag : 0,
      t: [round(t.m_LocalPosition.x, 6), round(t.m_LocalPosition.y, 6), round(t.m_LocalPosition.z, 6)],
      r: [round(t.m_LocalRotation.x, 6), round(t.m_LocalRotation.y, 6),
          round(t.m_LocalRotation.z, 6), round(t.m_LocalRotation.w, 6)],
      s: [round(t.m_LocalScale.x, 6), round(t.m_LocalScale.y, 6), round(t.m_LocalScale.z, 6)],
      components: comps.get(gid) || [],
      children: [],
    });
    const father = t.m_Father ? t.m_Father.pathId : 0;
    if (father && transformIds.has(father)) {
      if (!childrenOf.has(father)) childrenOf.set(father, []);
      childrenOf.get(father).push(tid);
    } else {
      roots.push(tid);
    }
  }

  // Attache les enfants. Iteratif : 7 688 noeuds passent, mais une scene plus
  // profonde ferait deborder la pile en recursif.
  const attach = (tid) => {
    const stack = [tid];
    while (stack.length) {
      const cur = stack.pop();
      const kids = (childrenOf.get(cur) || []).sort((a, b) => a - b);
      nodes.get(cur).children = kids.map((k) => nodes.get(k));
      for (const k of kids) stack.push(k);
    }
    return nodes.get(tid);
  };

  const tree = roots.sort((a, b) => a - b).map(attach);
  const componentCount = [...comps.values()].reduce((a, l) => a + l.length, 0);
  return { source: ctx.sceneFile, unity: file.unityVersion,
           node_count: nodes.size, component_count: componentCount, roots: tree };
}
