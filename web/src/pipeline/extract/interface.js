// Interface de jeu : jauges de ressources, invites a l'ecran, polices, icones.
// Portage de tools/14_interface.py.
//
// Les donnees ne vivent pas au meme endroit que le reste : les TEXTURES sont
// dans le build, les MESURES et les TEXTES sont dans le code. Le pipeline
// Python lisait le code decompile par ILSpy ; ici le catalogue des invites est
// lu directement dans l'IL (voir prompts.js), et le reste est mesure a la main
// dans le code du jeu -- ces constantes sont donc ecrites telles quelles.

import { decodeTexture2D } from "../unity/texture.js";
import { scanPrompts } from "./prompts.js";

// Textures du HUD, telles que PlayerResourceGUI et ScreenPrompt les chargent.
const TEXTURES = [
  "ResourceBar_Layer1",         // cadres vides, marques « O2 » et « FUEL »
  "ResourceBar_Layer01",        // remplissage des deux jauges
  "ResourceBar_Layer2_HP25", "ResourceBar_Layer2_HP50",
  "ResourceBar_Layer2_HP75", "ResourceBar_Layer2_HP100",
  "TutorialTextBG",             // fond des invites
  "redVignette",                // bordure rouge quand on encaisse
  // Icones des FogLight, dessinees a la position projetee de la lumiere. Deux
  // sont des reperes, la troisieme est un leurre d'anglerfish — savoir laquelle
  // s'affiche est tout l'enjeu.
  "AnglerfishLure", "EscapePodBeacon", "WoodsmanBeacon",
  "LocationText_BG",            // fond du menu des reglages
  // `Flashback._finalImage` : l'image posee sur le plan porte-photo pendant les
  // huit dixiemes de seconde ou le blanc monte. Le portage faisait un fondu au
  // blanc nu, faute de l'avoir extraite (docs/98-flashback.md).
  "FinalFlashbackImage",
  // `DialogueGUI.ShowDialogueBox` et ses deux mises en page : le fond court
  // sans options, le fond large avec, le bandeau du nom (qui sert aussi de
  // curseur d'option), le bouton « Next / Close », l'icone du curseur, et la
  // barre des panneaux de musee (docs/132).
  // `SatelliteSnapshotController` : l'ecran de l'observatoire montre sa carte
  // postale au repos (`_splashTexture`), le schema du satellite une fois la
  // console prise (`_diagramTexture`). Aucun materiau ne les porte : seul le
  // script les pose, et elles n'etaient donc jamais extraites (docs/132).
  "PostcardsFromSpacePSD", "SatelliteDiagramPSD",
  // `ReferenceFrameTracker` : le cercle des crochets et la fleche de derive,
  // chargees par `Resources.Load` et donc portees par aucun materiau.
  "RFCircleIcon", "RFArrowIcon",
  // `HUDDamageDisplay` : le vaisseau (et son avertissement) et les voyants.
  "Ship_Damage_Icon", "Ship_Damage_New",
  "Short_Dialog_BG", "Dialog_Choice_BG", "NPC_Name_BG",
  "Short_Dialog_Btn", "White_Dialog_Btn", "LocationText_Bar",
];

// Polices du jeu, par role.
//   OWUtilities.GetDialogueFont()  -> Gill Sans MT       dialogues et invites
//   OWUtilities.GetHelmetFont()    -> digital-7          casque, alertes
//   GetPromptGUIStyleCharacterName -> Gill Sans MT Bold  noms de personnages
//   GUIText du menu                -> Gill Sans MT Menu  reglages
const FONTS = {
  dialogue: "Gill Sans MT",
  helmet: "digital-7",
  characterName: "Gill Sans MT Bold",
  menu: "Gill Sans MT Menu",
};

// Icones de manette, telles que XboxInput les charge. Le nom du fichier ne suit
// pas toujours celui de l'enumeration : gachettes et bumpers sont ranges sous
// leur abreviation, ce que seul le code dit.
const XBOX_BUTTONS = {
  RightStick: "RightStick", X: "X", Y: "Y", A: "A", B: "B",
  RightTrigger: "RT", LeftTrigger: "LT", Triggers: "Triggers",
  LeftStick: "LeftStick", RightStickClick: "RightStickClick",
  LeftStickClick: "LeftStickClick", Start: "Start", Select: "Select",
  RightBumper: "RB", LeftBumper: "LB", DPadUp: "DPadUp",
};

// Plus de decoupes. ResourceBar_Layer1 (les deux cadres) et
// ResourceBar_Layer01 (des lignes de balayage) semblaient ne pas s'aligner, et
// l'on decoupait chaque element pour le reposer soi-meme. Ils s'alignent : le
// premier habille `HUDLayer1OuterBars`, le second `ResourcesHUD` lui-meme, et
// les deux quads couvrent le MEME carre, a la meme place et a la meme echelle.
// Layer01 n'est pas un degrade de remplissage mais le FOND, teinte en noir ;
// les remplissages sont des aplats sans texture (docs/132).
const CROPS = {};

/** Meme conversion que ColorHSV.ToColorRGB : teinte en degres, s et v en 0-1. */
export function hsvToHex(h, s, v) {
  const i = Math.floor((h % 360) / 60);
  const f = (h % 360) / 60 - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
  return "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0").toUpperCase()).join("");
}

/** Decoupe une image RGBA. */
function crop(img, [x0, y0, x1, y1]) {
  const w = Math.max(1, Math.min(img.width, x1) - x0);
  const h = Math.max(1, Math.min(img.height, y1) - y0);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * img.width + x0) * 4;
    out.set(img.rgba.subarray(from, from + w * 4), y * w * 4);
  }
  return { width: w, height: h, rgba: out, format: img.format };
}

/**
 * Les `TextMesh` de la scene : le texte ecrit DANS le monde.
 *
 * Neuf dans `level0`, et le portage n'en lisait aucun : l'ecran de
 * l'ordinateur de bord (`NameText`, `DescriptionText`), son avis « database
 * updated », les cinq notifications du casque — dont « Launch Window
 * Obstructed », que le portage recrivait en capitales de son invention.
 *
 * La classe 102 n'est pas dans `unity41-types.json` ; sa structure d'Unity 4
 * est courte et se lit a la main :
 *
 *   m_GameObject PPtr, m_Text string, m_OffsetZ, m_CharacterSize,
 *   m_LineSpacing (float), m_Anchor, m_Alignment (int16), m_TabSize (float),
 *   m_FontSize, m_FontStyle (int32), m_RichText (bool, aligne), m_Font PPtr
 *
 * L'oracle est le meme qu'ailleurs : la lecture doit consommer exactement
 * `byteSize` octets, sinon l'objet est ecarte plutot que mal lu. La couleur
 * n'est pas un champ de la classe en 4.1 — elle vient du materiau de police.
 */
export function textesDeScene(ctx) {
  const out = [];
  for (const o of ctx.env.objects({ file: ctx.sceneFile, type: "TextMesh" })) {
    try {
      const r = o.file.reader(o);
      const debut = r.pos;
      const go = { fileId: r.i32(), pathId: r.i32() };
      const t = {
        text: r.string(), offsetZ: r.f32(), characterSize: r.f32(), lineSpacing: r.f32(),
        anchor: r.i16(), alignment: r.i16(), tabSize: r.f32(),
        fontSize: r.i32(), fontStyle: r.i32(),
      };
      t.richText = r.i32() !== 0;
      const police = { fileId: r.i32(), pathId: r.i32() };
      if (r.pos - debut !== o.byteSize) continue;
      const cible = ctx.env.deref(police, o.file);
      const chaine = ctx.ancestors(go.pathId);
      out.push({ name: ctx.name(go.pathId), parent: chaine[chaine.length - 1] || null,
                 path: [...chaine, ctx.name(go.pathId)].join("/"),
                 ...t, font: cible ? ctx.assetName(cible) : null });
    } catch (e) { /* objet illisible : ecarte */ }
  }
  return out;
}

/**
 * Ou le casque pose ses jauges a l'ecran : `ResourcesHUD`, sous le casque,
 * sous la camera du HUD.
 *
 * Le portage les avait posees en bas a droite, a la main, et dans l'ordre de
 * l'espace local : sante a gauche, oxygene a droite. L'alpha les montre EN
 * HAUT a droite, oxygene a gauche et silhouette a droite (docs/132). Les deux
 * ecarts sont dans la scene : `ResourcesHUD` est a (0,16 ; 0,084 ; 0,544) sous
 * `HUDHelmetHighPoly`, lui-meme a z = -0,408 — 0,136 devant la camera du HUD,
 * au-dessus et a droite de l'axe —, et il est TOURNE d'un demi-tour autour de
 * y (quaternion (0, 1, 0, 0)) : son x local part vers la gauche de l'ecran.
 * La camera du HUD voit a 80 degres verticaux.
 *
 * `MinimapHUD`, le globe de la minicarte, est pose de la meme facon, SOUS les
 * jauges : (0,162 ; -0,075), echelle 0,04 — en bas a droite, un carre d'un
 * bon tiers de la hauteur. Le portage le mettait en haut a droite, a 168 px.
 *
 * On rend ce qu'il faut pour projeter : la position du panneau dans le repere
 * de la camera, son echelle, le miroir, et le champ. Rien si la chaine manque.
 */
export function panneauRessources(ctx, nomPanneau = "ResourcesHUD") {
  const parent = (gid) => {
    const t = ctx.transformOf.get(gid);
    const pt = t && t.m_Father ? ctx.env.read(ctx.env.deref(t.m_Father, ctx.sceneObj)) : null;
    return pt && pt.m_GameObject ? pt.m_GameObject.pathId : 0;
  };
  const nom = (gid) => (ctx.gameObjects.get(gid) || {}).m_Name;
  let panneau = 0;
  for (const [gid, go] of ctx.gameObjects) {
    if (go.m_Name === nomPanneau && nom(parent(gid)) === "HUDHelmetHighPoly") { panneau = gid; break; }
  }
  if (!panneau) return null;
  const casque = parent(panneau), camera = parent(casque);
  if (nom(camera) !== "HUDCamera") return null;
  let fov = null;
  for (const o of ctx.componentsOf(camera, ["Camera"])) fov = ctx.readEngine(o)["field of view"];
  const tp = ctx.transformOf.get(panneau), tc = ctx.transformOf.get(casque);
  const v = (a) => [a.x, a.y, a.z];
  const p = v(tp.m_LocalPosition), c = v(tc.m_LocalPosition), q = tp.m_LocalRotation;
  // Le casque n'est ni tourne ni mis a l'echelle : la position s'ajoute.
  // Le demi-tour autour de y retourne x (et z, sans effet sur un quad).
  const miroir = Math.abs(Math.abs(q.y) - 1) < 1e-3;
  // Les `_Color` des quads du panneau, par nom d'objet : le fond noir
  // (`HUDLayer0Mat`), les cadres, la silhouette a demi transparente, et les
  // deux remplissages, des aplats sans texture a 0,18 d'opacite.
  const couleurs = {};
  const sous = (gid) => { for (let g = gid; g; g = parent(g)) if (g === panneau) return true; return false; };
  for (const [gid, go] of ctx.gameObjects) {
    if (!sous(gid)) continue;
    for (const o of ctx.componentsOf(gid, ["MeshRenderer"])) {
      const r = ctx.readEngine(o);
      const m = (r.m_Materials || [])[0];
      const mo = m && ctx.env.deref(m, ctx.env.get(ctx.sceneFile));
      const mat = mo && ctx.readEngine(mo);
      for (const k of (mat && mat.m_SavedProperties && mat.m_SavedProperties.m_Colors) || []) {
        if (k.first && k.first.name === "_Color" && k.second) {
          const { r: cr, g: cg, b: cb, a: ca } = k.second;
          couleurs[go.m_Name] = [cr, cg, cb, ca];
        }
      }
    }
  }
  // Les enfants directs, dans l'ordre de la scene (`m_Children`) — c'est
  // celui de `GetComponentsInChildren`, qui range les voyants de degats — avec
  // leur place et leur echelle dans le repere du panneau.
  const enfants = [];
  for (const ch of tp.m_Children || []) {
    const o = ctx.env.read(ctx.env.deref(ch, ctx.sceneObj));
    if (!o || !o.m_GameObject) continue;
    const t = ctx.transformOf.get(o.m_GameObject.pathId);
    enfants.push({ nom: nom(o.m_GameObject.pathId),
                   position: [t.m_LocalPosition.x, t.m_LocalPosition.y],
                   scale: [t.m_LocalScale.x, t.m_LocalScale.y] });
  }
  return {
    position: [p[0] + c[0], p[1] + c[1], p[2] + c[2]],
    scale: [tp.m_LocalScale.x, tp.m_LocalScale.y],
    mirrorX: miroir,
    fov,
    couleurs,
    enfants,
  };
}

export function extractInterface(ctx, emitImage, emitFile, assembly) {
  // Textures et polices du build, par nom.
  const textureByName = new Map();
  for (const o of ctx.env.objects({ type: "Texture2D" })) {
    const name = ctx.assetName(o);
    if (name && !textureByName.has(name)) textureByName.set(name, o);
  }

  const decoded = new Map();
  const decode = (name) => {
    if (decoded.has(name)) return decoded.get(name);
    const o = textureByName.get(name);
    const img = o ? decodeTexture2D(ctx.readEngine(o)) : null;
    decoded.set(name, img);
    return img;
  };

  const written = {};
  const missing = [];
  for (const name of TEXTURES) {
    const img = decode(name);
    if (!img) { missing.push(name); continue; }
    written[name] = emitImage(`${name}.png`, img);
  }

  const cropped = {};
  for (const [target, [source, box]] of Object.entries(CROPS)) {
    const img = decode(source);
    if (!img) continue;
    cropped[target] = emitImage(target, crop(img, box));
  }

  const buttons = {};
  for (const [enumName, file] of Object.entries(XBOX_BUTTONS)) {
    const img = decode(file);
    if (img) buttons[enumName] = emitImage(`${file}.png`, img);
  }

  // Polices : m_FontData porte le TTF tel quel.
  const fonts = {};
  const fontByName = new Map();
  for (const o of ctx.env.objects({ type: "Font" })) {
    const f = ctx.readEngine(o);
    if (f && f.m_Name) fontByName.set(f.m_Name, f);
  }
  for (const [role, name] of Object.entries(FONTS)) {
    const f = fontByName.get(name);
    const data = f && f.m_FontData;
    if (data && data.length) {
      const file = `${name.replace(/[^\w.\- ]/g, "_")}.ttf`;
      emitFile(file, data);
      fonts[role] = file;
    }
  }

  const prompts = assembly ? scanPrompts(assembly) : [];

  return {
    unity: ctx.env.get(ctx.sceneFile).unityVersion,
    source: "PlayerResourceGUI, PromptManager, ScreenPrompt, OWUtilities",
    // PlayerResourceGUI.Update : les jauges sont des objets 3D du casque, mis a
    // l'echelle en Y par la fraction et repositionnes avec elle.
    resources: {
      barBaseY: -0.6,
      barSpanY: 0.58,
      healthStages: [0.25, 0.5, 0.75, 1.0],
      lowThreshold: 0.2,
      vignetteFade: 1.0,
      labelFontSize: 20,
      labelColor: "#FF0000",
      labelOffsetX: 50,
      labelOffsetY: { fuel: 25, health: 0, oxygen: -25 },
      // Geometrie relative des trois elements, lue dans la scene sous
      // ResourcesHUD/HUDLayer1OuterBars. Les quads font 2 unites de cote :
      // c'est la seule lecture qui rende le bas des jauges FIXE quand elles se
      // vident (-0.6 - 0.03 f, contre -0.6 + 0.275 f pour un quad unitaire).
      panel: panneauRessources(ctx),
      layout: {
        oxygen: { x: 0.577, halfWidth: 0.12, halfHeight: 0.61 },
        fuel: { x: 0.135, halfWidth: 0.12, halfHeight: 0.61 },
        health: { x: -0.5, halfWidth: 0.5, halfHeight: 0.64 },
      },
      textures: {
        // Le panneau entier, comme dans le jeu : le fond (`ResourcesHUD`,
        // teinte en noir) et les deux cadres (`HUDLayer1OuterBars`).
        layer0: written.ResourceBar_Layer01 || null,
        layer1: written.ResourceBar_Layer1 || null,
        vignette: written.redVignette || null,
        health: ["ResourceBar_Layer2_HP25", "ResourceBar_Layer2_HP50",
                 "ResourceBar_Layer2_HP75", "ResourceBar_Layer2_HP100"]
          .map((n) => written[n]).filter(Boolean),
      },
    },
    fonts,
    // Le globe de la minicarte, sur la visiere comme les jauges.
    minimapPanel: panneauRessources(ctx, "MinimapHUD"),
    // Le tableau des avaries, entre les jauges et la minicarte.
    degats: {
      panel: panneauRessources(ctx, "ShipDamageHUD"),
      icone: written.Ship_Damage_Icon || null, voyant: written.Ship_Damage_New || null,
    },
    // Le texte pose dans le monde (`TextMesh`).
    textes: textesDeScene(ctx),
    // L'ecran de la console du satellite : carte postale au repos, schema une
    // fois la console prise.
    satellite: {
      splash: written.PostcardsFromSpacePSD || null,
      diagram: written.SatelliteDiagramPSD || null,
    },
    // SettingsMenu.UpdateOptionText et Axis. La sensibilite est un entier de 1 a
    // 10 qui BOUCLE (11 ramene a 1), 5 etant le neutre : l'axe vaut
    // brut x inversion x sensibilite / 5.
    settings: {
      sensitivity: { default: 5, min: 1, max: 10, neutral: 5 },
      inversion: { default: 1 },
      // Disposition reelle, lue dans la scene. La racine du menu est en
      // coordonnees d'ecran (0,5 ; 0,8) ; les options n'ont pas de position
      // propre mais un DECALAGE EN PIXELS porte par leur GUIText.
      layout: {
        anchor: [0.5, 0.8],
        title: { text: "Settings", fontSize: 42, offset: [0, 0] },
        firstOffset: -70,
        step: -50,
        fontSize: 30,
        background: {
          texture: written.LocationText_BG || null,
          offset: [0.0, -0.26],
          size: [0.36, 0.81],
          color: [0.5, 0.5, 0.5, 0.5],
        },
      },
      colors: {
        locked: hsvToHex(40.0, 0.4, 0.15),
        selected: hsvToHex(40.0, 0.5, 0.7),
        normal: hsvToHex(40.0, 0.5, 0.3),
      },
      options: [
        { key: "back", label: "Back" },
        { key: "invertY", label: "Y-Axis: %s", states: ["Not Inverted", "Inverted"] },
        { key: "lookSensitivity", label: "Look Sensitivity: %d" },
        { key: "flightSensitivity", label: "Flight Sensitivity: %d" },
        { key: "brightness", label: "Screen Brightness: %s", states: ["Normal", "Bright"] },
        { key: "shadows", label: "Shadows: %s", states: ["Off", "On"] },
        // Vide au menu-titre, « Exit to Main Menu » en partie : le moteur en
        // decide selon le niveau (settings.js).
        { key: "exit", label: "Exit to Main Menu" },
      ],
    },
    // MapMarker : l'icone n'est pas une texture mais un dessin —
    // IconGenerator.GenerateSquareBracket(20, 20, blanc), quatre coins en
    // crochet, trait de 1 pixel, quart de cote.
    mapMarkers: {
      iconSize: 20, lineWidth: 1, bracketRatio: 0.25, fontSize: 14,
      minScreenDistance: 10,
      types: {
        Default: { color: "#FFFFFF", maxDistance: 5000 },
        Planet: { color: "#FFFFFF", maxDistance: 50000 },
        Moon: { color: "#FFFFFF", maxDistance: 5000 },
        Sun: { color: "#FFFFFF", maxDistance: 1e10 },
        Player: { color: "#00FF00", maxDistance: 0 },
        Probe: { color: "#00FF00", maxDistance: 50000 },
        Ship: { color: "#00FF00", maxDistance: 50000 },
      },
    },
    // PromptManager.Update et ScreenPrompt.DrawPrompt
    prompts: {
      fontSize: 30,
      color: hsvToHex(42.0, 0.2, 0.9),
      background: written.TutorialTextBG || null,
      boxScale: [1.1, 1.2],
      spacing: 5,
      bottomMargin: 100,
      leftMargin: 50,
      centerOffsetY: 50,
      slideDistance: 400,
      slideDuration: 0.5,
      buttons,
      catalogue: prompts,
    },
    // `ReferenceFrameTracker` : icones, et les deux tailles de police de
    // `GetPromptGUIStyle` (20 pour « Set Target », 18 pour la lecture).
    suivi: {
      cercle: written.RFCircleIcon || null, fleche: written.RFArrowIcon || null,
      tailles: { cercle: [100, 100], fleche: [128, 128] },
      invite: " Set Target", policeInvite: 20, policeLecture: 18,
    },
    beacons: {
      AnglerfishLure: written.AnglerfishLure || null,
      EscapePodBeacon: written.EscapePodBeacon || null,
      WoodsmanBeacon: written.WoodsmanBeacon || null,
    },
    missingTextures: missing,
  };
}
