// Textures qui defilent : le sable des Hourglass Twins, les cascades, les
// ecrans.
//
// Quarante-quatre instances dans `level0`, reparties sur quatre classes, et le
// portage n'en lisait aucune (docs/42-lumieres.md). Les quatre appliquent
// pourtant la MEME loi, lue dans l'IL :
//
//     offset += _rate x material.mainTextureScale.y x deltaTime
//     material.SetTextureOffset(slot, _direction x offset)
//     si offset > 1 : offset = 0 ; si offset < 0 : offset = 1
//
// `Awake` tire l'offset de depart au hasard (`Random.value`), pour que deux
// surfaces voisines ne defilent pas en phase.
//
//   TextureAnimator              27, sur `_MainTex`
//   TextureAnimatorMultipleMats  10, sur un materiau designe
//   NormalTexAnimator             4, sur trois canaux, chacun son rythme
//   OffsetTextureAnimate          3
//
// Le nom du champ `_sandMaterial` dans `TextureAnimator` dit d'ou vient la
// classe : c'est la colonne de sable qui coule d'une jumelle a l'autre.

import { round } from "./context.js";

/** Les quatre classes, et le nom de leurs champs. */
const CLASSES = {
  TextureAnimator: [["main", "_direction", "_rate"]],
  TextureAnimatorMultipleMats: [["main", "_direction", "_rate"]],
  OffsetTextureAnimate: [["main", "_direction", "_rate"]],
  NormalTexAnimator: [["main", "_MainTexDirection", "_MainTexRate"],
                      ["normal", "_NormalTexDirection", "_NormalTexRate"]],
};

/** Un Vector2 serialise ; le defaut du build est `Vector2.up`. */
function vec2(v) {
  if (Array.isArray(v) && v.length >= 2) return [round(v[0], 5), round(v[1], 5)];
  if (v && typeof v === "object" && typeof v.x === "number" && typeof v.y === "number") {
    return [round(v.x, 5), round(v.y, 5)];
  }
  return [0, 1];
}

export function extractTextureAnimators(ctx) {
  const scrollers = [];
  const stats = {};

  for (const { obj, cls } of ctx.behaviours((c) => c in CLASSES)) {
    const f = ctx.plain(ctx.scriptFields(obj) || {});
    const gid = ctx.ownerId(obj);
    const canaux = {};
    for (const [slot, dirKey, rateKey] of CLASSES[cls]) {
      // 0,05 est le defaut du constructeur, partage par les quatre classes.
      const rate = typeof f[rateKey] === "number" ? round(f[rateKey], 5) : 0.05;
      if (!rate) continue;
      canaux[slot] = { direction: vec2(f[dirKey]), rate };
    }
    if (!Object.keys(canaux).length) continue;
    scrollers.push({
      name: ctx.name(gid), kind: cls,
      position: ctx.worldPosition(gid), channels: canaux,
    });
    stats[cls] = (stats[cls] || 0) + 1;
  }

  return { scrollers, stats };
}
