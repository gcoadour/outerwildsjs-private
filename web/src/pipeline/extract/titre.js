// L'ecran-titre, lu dans `mainData` — le niveau 0 du jeu.
//
// Le portage demarrait directement dans la partie : `docs/28-hud.md` et
// `docs/99` notaient l'absence de menu principal, et `SettingsMenu`
// verrouillait sa septieme option « faute de menu principal ». Or tout est la,
// dans le premier fichier du build : une scene entiere, faite pour ce seul
// ecran — une petite planete, vingt pins, le feu de camp et ses fumees, le
// Voyageur a la flute et l'Archeologue au banjo, le vaisseau pose, une camera
// qui tourne, et cinq `GUIText`.
//
// Ce module ne rend que ce que la scene POSE. La geometrie sort par
// l'exporteur glTF commun, les lumieres, les particules et les sons par les
// extracteurs du monde, appeles sur ce contexte (worker.js).
//
// Deux classes moteur de plus ont ete necessaires : `GUIText` (132) et
// `GUITexture` (131), absentes de `unity41-types.json` parce qu'aucun objet de
// `level0` ne les porte (tools/16_unity_types.py).

import { decodeTexture2D } from "../unity/texture.js";
import { hsvToHex } from "./interface.js";
import { round } from "./context.js";

/**
 * `TextAnchor` d'Unity : ou le point d'ancrage se trouve dans le rectangle du
 * texte. Le menu-titre est en `LowerLeft` (6), les reglages en `MiddleCenter`.
 */
export const TEXT_ANCHOR = ["UpperLeft", "UpperCenter", "UpperRight",
                            "MiddleLeft", "MiddleCenter", "MiddleRight",
                            "LowerLeft", "LowerCenter", "LowerRight"];

/**
 * `Skybox` (ressources par defaut d'Unity 4) : six faces, et UN piege de
 * nommage. `_LeftTex` est la face +X, `_RightTex` la face -X — et le
 * materiau du build les nourrit de `..._right1` et `..._left2`, ce qui
 * remet les images a l'endroit. On garde donc les PROPRIETES, pas les noms
 * des images.
 */
const SKY_FACES = { _RightTex: "nx", _LeftTex: "px", _UpTex: "py",
                    _DownTex: "ny", _FrontTex: "pz", _BackTex: "nz" };


/** Rotation d'un vecteur par un quaternion (x, y, z, w). */
function qrot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y,
          iy * w + iw * -y + iz * -x - ix * -z,
          iz * w + iw * -z + ix * -y - iy * -x];
}

/**
 * @param ctx        ExtractContext sur `mainData`
 * @param emitImage  (nom, image RGBA) -> nom de fichier ecrit
 */
export function extractTitre(ctx, emitImage) {
  const byName = new Map();
  for (const [gid, go] of ctx.gameObjects) {
    if (!byName.has(go.m_Name)) byName.set(go.m_Name, gid);
  }
  const engine = (type) => {
    const out = [];
    for (const o of ctx.env.objects({ type, file: ctx.sceneFile })) {
      const v = ctx.readEngine(o);
      if (v) out.push({ o, v, gid: v.m_GameObject ? v.m_GameObject.pathId : 0 });
    }
    return out;
  };
  const image = (ptr, file, nom) => {
    const t = ptr && ptr.pathId ? ctx.env.deref(ptr, file) : null;
    const img = t ? decodeTexture2D(ctx.readEngine(t)) : null;
    return img ? emitImage(`${nom}.png`, img) : null;
  };

  // --- la camera : ou elle est, ce qu'elle voit ---
  const cam = engine("Camera")[0] || null;
  let camera = null;
  if (cam) {
    const [p, r] = ctx.world(cam.gid);
    const c = cam.v;
    camera = {
      name: ctx.name(cam.gid),
      position: p.map((x) => round(x, 4)), rotation: r.map((x) => round(x, 6)),
      // `field of view` est VERTICAL dans Unity, comme par defaut dans Babylon.
      fov: round(c["field of view"], 4),
      near: round(c["near clip plane"], 4), far: round(c["far clip plane"], 2),
      // `m_ClearFlags` 1 : la voute (Skybox). La couleur ne sert qu'en repli.
      clear: c.m_ClearFlags === 1 ? "skybox" : "color",
      background: [c.m_BackGroundColor.r, c.m_BackGroundColor.g,
                   c.m_BackGroundColor.b].map((x) => round(x, 4)),
      hdr: !!c.m_HDR,
    };
  }

  // --- ce qui tourne : `RotateTransform`, deux instances ---
  //
  // L'axe est LOCAL ; on le rend aussi dans le monde, a l'instant zero. C'est
  // ce qui permet au moteur de composer les deux rotations : `Root` tourne a
  // +1 degre par seconde, `PlanetPivot` a -1 autour de SON Y — qui, le pivot
  // etant retourne de 180 degres sur X, est le -Y du monde. La planete tourne
  // donc a DEUX degres par seconde dans le monde, la camera a un.
  const rotations = [];
  for (const { obj, cls } of ctx.behaviours(["RotateTransform"])) {
    const f = ctx.scriptFields(obj);
    if (!f) continue;
    const gid = ctx.ownerId(obj);
    const [p, r] = ctx.world(gid);
    const axe = [f._localAxis.x, f._localAxis.y, f._localAxis.z];
    rotations.push({
      name: ctx.name(gid),
      localAxis: axe,
      worldAxis: qrot(r, axe).map((x) => round(x, 6)),
      position: p.map((x) => round(x, 4)),
      degreesPerSecond: f._degreesPerSecond,
      random: !!f._randomizeRotationRate,
      ancestors: ctx.ancestors(gid),
    });
    void cls;
  }

  // --- le menu : `TitleScreenMenu` et ses cinq `GUIText` ---
  const guiText = new Map();
  for (const { o, v, gid } of engine("GUIText")) {
    guiText.set(o.pathId, {
      name: ctx.name(gid),
      text: v.m_Text,
      anchor: TEXT_ANCHOR[v.m_Anchor] || "UpperLeft",
      alignment: ["left", "center", "right"][v.m_Alignment] || "left",
      pixelOffset: [round(v.m_PixelOffset.x, 3), round(v.m_PixelOffset.y, 3)],
      fontSize: v.m_FontSize,
      // Un GUIText se place par la POSITION de son transform, en coordonnees
      // d'ecran normalisees (0 en bas a gauche, 1 en haut a droite).
      position: ctx.world(gid)[0].slice(0, 2).map((x) => round(x, 5)),
    });
  }
  let menu = null;
  for (const { obj } of ctx.behaviours(["TitleScreenMenu"])) {
    const f = ctx.scriptFields(obj);
    if (!f) continue;
    const options = (f._menuOptions || []).map((ptr) => {
      const t = ptr && ctx.env.deref(ptr, ctx.sceneObj);
      return t ? guiText.get(t.pathId) || null : null;
    });
    menu = {
      options,
      // `Menu.UpdateColor`, `TitleScreenMenu.TriggerLoad` : quatre couleurs,
      // une seule teinte pour le menu (40, l'ambre) et une autre pour
      // « Loading... » (104, un vert).
      colors: {
        locked: hsvToHex(40, 0.4, 0.15),
        selected: hsvToHex(40, 0.5, 0.7),
        normal: hsvToHex(40, 0.5, 0.3),
        loading: hsvToHex(104, 0.7, 0.7),
      },
      loadingText: "Loading...",
      // `TriggerLoad` : `_musicSource.FadeOut(0.5f)`.
      musicFade: 0.5,
    };
  }

  // --- le logo : une `GUITexture` teintee ---
  //
  // Une GUITexture a l'echelle nulle n'a de taille que son `m_PixelInset` :
  // c'est un rectangle en PIXELS, pose a partir du point d'ecran qu'est sa
  // position. `m_Color` a 0,5 est le neutre : la teinte vaut donc deux fois
  // la couleur, et le blanc du logo devient le vert du jeu.
  let logo = null;
  for (const { o, v, gid } of engine("GUITexture")) {
    if (ctx.name(gid) !== "OWLogo") continue;
    logo = {
      texture: image(v.m_Texture, o.file, "logo"),
      color: [v.m_Color.r, v.m_Color.g, v.m_Color.b, v.m_Color.a].map((x) => round(x, 5)),
      pixelInset: [v.m_PixelInset.x, v.m_PixelInset.y,
                   v.m_PixelInset.width, v.m_PixelInset.height].map((x) => round(x, 3)),
      position: ctx.world(gid)[0].slice(0, 2).map((x) => round(x, 5)),
    };
  }

  // --- la voute : le `RenderSettings` de la scene ---
  let skybox = null;
  const rs = engine("RenderSettings")[0];
  if (rs && rs.v.m_SkyboxMaterial) {
    const mo = ctx.env.deref(rs.v.m_SkyboxMaterial, rs.o.file);
    const m = mo ? ctx.readEngine(mo) : null;
    if (m) {
      const faces = {};
      for (const { first, second } of m.m_SavedProperties.m_TexEnvs) {
        const face = SKY_FACES[first.name];
        if (face && second.m_Texture) faces[face] = image(second.m_Texture, mo.file, `sky_${face}`);
      }
      const tint = (m.m_SavedProperties.m_Colors.find((c) => c.first.name === "_Tint") || {}).second;
      skybox = {
        material: m.m_Name, faces,
        // `RenderFX/Skybox` : couleur = texture x _Tint x 2.
        tint: tint ? [tint.r, tint.g, tint.b].map((x) => round(x, 5)) : [0.5, 0.5, 0.5],
      };
    }
  }

  return {
    source: "mainData",
    camera, rotations, menu, logo, skybox,
    ambient: rs ? [rs.v.m_AmbientLight.r, rs.v.m_AmbientLight.g,
                   rs.v.m_AmbientLight.b].map((x) => round(x, 5)) : [0, 0, 0],
    roots: ["Root"].filter((n) => byName.has(n)),
  };
}
