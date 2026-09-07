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

// Decoupes mesurees sur les textures, par balayage du canal alpha.
//
// ResourceBar_Layer1 (512x256) porte les DEUX cadres cote a cote, separes par
// un creux vertical vide : a gauche celui marque « O2 », a droite « FUEL ».
// ResourceBar_Layer01 porte les degrades de remplissage, a des positions qui
// ne correspondent pas a celles des cadres : les deux textures habillent des
// quads 3D distincts du casque, chacun avec sa propre transformation, et rien
// ne les aligne dans l'espace de la texture. On decoupe donc chaque element
// pour le reposer soi-meme.
const CROPS = {
  "bar_frame_oxygen.png": ["ResourceBar_Layer1", [63, 43, 153, 217]],
  "bar_frame_fuel.png": ["ResourceBar_Layer1", [176, 43, 265, 217]],
  "bar_fill.png": ["ResourceBar_Layer01", [57, 41, 272, 220]],
};

/** Meme conversion que ColorHSV.ToColorRGB : teinte en degres, s et v en 0-1. */
function hsvToHex(h, s, v) {
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
      layout: {
        oxygen: { x: 0.577, halfWidth: 0.12, halfHeight: 0.61 },
        fuel: { x: 0.135, halfWidth: 0.12, halfHeight: 0.61 },
        health: { x: -0.5, halfWidth: 0.5, halfHeight: 0.64 },
      },
      textures: {
        frameOxygen: cropped["bar_frame_oxygen.png"] || null,
        frameFuel: cropped["bar_frame_fuel.png"] || null,
        fill: cropped["bar_fill.png"] || null,
        vignette: written.redVignette || null,
        health: ["ResourceBar_Layer2_HP25", "ResourceBar_Layer2_HP50",
                 "ResourceBar_Layer2_HP75", "ResourceBar_Layer2_HP100"]
          .map((n) => written[n]).filter(Boolean),
      },
    },
    fonts,
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
        // Verrouillee au menu principal dans le jeu ; ce portage n'en a pas,
        // elle l'est donc toujours.
        { key: "exit", label: "Exit to Main Menu", locked: true },
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
    beacons: {
      AnglerfishLure: written.AnglerfishLure || null,
      EscapePodBeacon: written.EscapePodBeacon || null,
      WoodsmanBeacon: written.WoodsmanBeacon || null,
    },
    missingTextures: missing,
  };
}
