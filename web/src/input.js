// Les commandes du jeu — celles du build, pas celles du portage.
//
// Le portage avait choisi ses touches, et personne n'avait regarde celles de
// l'alpha : elles sont dans l'`InputManager`, un reglage de projet range dans
// `mainData`, et ni ce fichier ni la classe 13 n'etaient lus
// ([`docs/61`](../../docs/61-commandes.md)).
//
// Vingt-deux canaux (`InputChannels`), chacun decline en trois axes selon la
// source — clavier/souris, manette PC, manette Mac. Les classes `*Input` les
// assemblent ensuite en jeux de commandes par mode de jeu : `GroundInput`,
// `JetpackInput`, `ShipInput`, `MapInput`… Un meme canal sert donc plusieurs
// actions, et c'est voulu :
//
//   Probe            lancer, photographier et rappeler la sonde
//   Move Up          monter au sac dorsal, ET zoomer a la lunette
//   Alt Probe        la photo arriere, ET la camera d'atterrissage
//   Interact         parler, ET declencher le pilote automatique
//   Jump             sauter, ET accorder sa vitesse au referentiel
//
// Ce qui suit ne touche ni au DOM ni a Babylon : `tests/09-jeu.mjs` l'eprouve
// sans navigateur.
//
// @lit InputChannels, InputCommand, InputChannel, InputInitializer, OWInput
// @lit GroundInput, JetpackInput, ShipInput, MapInput, PlayerCameraInput
// @lit TelescopeInput, InterfaceInput, ProbeInput, ReferenceFrameInput
// @lit ConversationInput, ComputerInput, SatelliteInput, XboxInput
// @lit DebugInputManager, DebugHUD, DebugBreakAllChildren, TapeMeasure
// @autrement DebugInputManager : touches de debogage Unity non utilisees en production
// @autrement DebugHUD : affichage de debogage Unity non utilise en production
// @autrement DebugBreakAllChildren : utilitaire de debogage Unity pour casser les hierarchies
// @autrement TapeMeasure : outil de mesure de distance dans la scene de developpement

/**
 * Le repli : les liaisons du build, telles que `data/input.json` les rend.
 *
 * Elles sont ecrites ici parce que la page doit rester jouable sans le build,
 * et non parce qu'on les a devinees — chacune est verifiee par
 * `tests/05-extract.mjs` contre l'`InputManager`. Le jour ou l'une des deux
 * bouge sans l'autre, le test le dit.
 */
export const COMMANDES = {
  "Move X": { keys: ["a", "d", "j", "l"], neg: ["a", "j"], pos: ["d", "l"], pad: { axis: 0 } },
  "Move Z": { neg: ["s", "k"], pos: ["w", "i"], pad: { axis: 1, invert: true } },
  "Move Up": { pos: ["left shift", "right shift"], pad: { axis: 9 } },
  "Move Down": { pos: ["left ctrl", "right ctrl"], pad: { axis: 8 } },
  Yaw: { mouse: 0, pad: { axis: 3 } },
  Pitch: { mouse: 1, pad: { axis: 4, invert: true } },
  "Zoom In": { pos: ["left shift", "right shift"], pad: { axis: 9 } },
  "Zoom Out": { pos: ["left ctrl", "right ctrl"], pad: { axis: 8 } },
  Interact: { pos: ["e", "u"], pad: { button: 2 } },
  Cancel: { pos: ["q", "o"], pad: { button: 1 } },
  Jump: { pos: ["space"], pad: { button: 0 } },
  Flashlight: { pos: ["f", "h"], pad: { axis: 6 } },
  Telescope: { pos: ["mouse 2"], pad: { button: 9 } },
  "Lock On": { pos: ["mouse 0"], pad: { button: 4 } },
  Probe: { pos: ["mouse 1"], pad: { button: 5 } },
  "Alt Probe": { pos: ["r", "y"], pad: { button: 3 } },
  "Match Velocity": { pos: ["space"], pad: { button: 0 } },
  Autopilot: { pos: ["e", "u"], pad: { button: 2 } },
  "Landing Camera": { pos: ["r", "y"], pad: { button: 3 } },
  "Swap Roll/Yaw": { pos: ["left alt", "right alt"], pad: { button: 8 } },
  Map: { pos: ["enter", "return"], pad: { button: 6 } },
  Pause: { pos: ["escape"], pad: { button: 7 } },
};

/**
 * Ce que le portage ajoute, faute d'equivalent dans le build.
 *
 * Cinq choses seulement, et elles sont nommees ici plutot que dispersees
 * dans `main.js` : l'ordinateur de bord se consulte a l'interieur du vaisseau,
 * que ce portage n'a pas ; la guimauve se mange au feu de camp ; sortir le
 * baton est appele par le tutoriel, qui n'est pas porte ; le mode d'affichage
 * est un outil de mise au point ; recentrer la carte n'a pas de canal parce que
 * le build recentre autrement. Aucune n'est dans l'alpha, et on ne pretend pas
 * le contraire.
 */
export const AJOUTS = {
  "Ship Computer": { pos: ["n"] },
  Marshmallow: { pos: ["b"] },
  // Sortir ou ranger le baton a guimauve. `ToggleStick` n'a pas de canal dans
  // l'alpha, et docs/64 en concluait que le tutoriel du feu de camp, non porte,
  // etait le seul appelant.
  //
  // C'ETAIT FAUX. `RoastPromptEvent` est une zone d'INTERACTION, pas un
  // tutoriel : on appuie pres du feu, le baton sort ; on s'eloigne, il se
  // range (docs/80-invites.md). Cette touche est donc un raccourci du portage
  // et non un manque du build — elle reste parce qu'elle est commode, et parce
  // que le baton se range aussi tout seul quand on a mange.
  Stick: { pos: ["v"] },
  "Display Mode": { pos: ["g"] },
  "Recenter Map": { pos: ["c"] },
};

/**
 * Le nom Unity d'une touche vers le `code` du navigateur.
 *
 * Unity nomme les touches par leur CARACTERE (« a », « space », « left
 * shift ») ; le navigateur les nomme par leur PLACE (`KeyA`, `Space`,
 * `ShiftLeft`). Les deux se correspondent exactement pour ce dont le jeu se
 * sert, et la place vaut mieux que le caractere : elle survit a un clavier
 * azerty, ou `KeyA` reste sous l'index gauche.
 *
 * @returns un `code` de clavier, `{ mouse: n }`, `{ pad: n }`, ou null
 */
export function codeUnity(nom) {
  const n = String(nom || "").trim().toLowerCase();
  if (!n) return null;
  let m = /^mouse (\d+)$/.exec(n);
  // Unity et le DOM ne numerotent PAS les boutons de souris pareil : Unity
  // compte gauche, DROIT, milieu ; le navigateur compte gauche, MILIEU, droit.
  // Prendre le numero tel quel mettait la sonde sur la molette et la lunette
  // sur le clic droit — et c'est le controle en navigateur qui l'a dit, parce
  // qu'aucun test sans navigateur n'appuie sur un vrai bouton.
  if (m) return { mouse: { 0: 0, 1: 2, 2: 1 }[Number(m[1])] ?? Number(m[1]) };
  m = /^joystick button (\d+)$/.exec(n);
  if (m) return { pad: Number(m[1]) };
  if (/^[a-z]$/.test(n)) return `Key${n.toUpperCase()}`;
  if (/^[0-9]$/.test(n)) return `Digit${n}`;
  const table = {
    space: "Space", escape: "Escape", tab: "Tab", backspace: "Backspace",
    // « return » est la grande touche, « enter » celle du pave numerique.
    // Unity les distingue et le build lie les DEUX au canal `Map`.
    return: "Enter", enter: "NumpadEnter",
    "left shift": "ShiftLeft", "right shift": "ShiftRight",
    "left ctrl": "ControlLeft", "right ctrl": "ControlRight",
    "left alt": "AltLeft", "right alt": "AltRight",
    up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
  };
  return table[n] || null;
}

/** Les liaisons d'un canal, rangees par nature. */
function ranger(noms) {
  const out = { codes: [], mouse: [], pad: [] };
  for (const nom of noms || []) {
    const c = codeUnity(nom);
    if (!c) continue;
    if (typeof c === "string") out.codes.push(c);
    else if (c.mouse !== undefined) out.mouse.push(c.mouse);
    else out.pad.push(c.pad);
  }
  return out;
}

/**
 * Les canaux du build, lisibles par le moteur.
 *
 * `data/input.json` quand il est la, la table de repli sinon — et le repli se
 * sait repli, comme `config.js`.
 */
export class Commandes {
  /** @param data  le contenu de `data/input.json`, ou null */
  constructor(data = null) {
    this.fallback = !data || !data.channels;
    this.canaux = new Map();
    const source = this.fallback ? null : data.channels;
    for (const [nom, def] of Object.entries(COMMANDES)) {
      // La liaison de manette est NORMALISEE des la table : sans quoi le repli
      // ecrit `{axis: 9}` la ou le build donne `{axis: 9, invert: false}`, et
      // l'invariant de `tests/05-extract.mjs` qui compare les deux tombe sur
      // une difference de forme plutot que de fond.
      const normPad = (p) => (!p ? null
        : p.axis !== undefined ? { axis: p.axis, invert: !!p.invert }
        : { button: p.button });
      let neg = def.neg || [], pos = def.pos || [], pad = normPad(def.pad);
      // Ce que le regard lit de l'axe : la sensibilite de la souris (`Yaw_Key`,
      // 0,1 par pixel) et la zone morte du manche (`Yaw_PC`, 0,25).
      let souris = null, zoneMorte = null;
      if (source && source[nom]) {
        const k = source[nom].Key, pc = source[nom].PC;
        if (k && k.kind === "mouseMove") souris = k.sensitivity ?? null;
        if (pc && pc.kind === "padAxis") zoneMorte = pc.dead ?? null;
        if (k && k.kind === "buttons") { neg = k.neg; pos = k.pos; }
        if (pc && pc.kind === "padAxis") pad = normPad({ axis: pc.axis, invert: pc.invert });
        else if (pc && pc.kind === "buttons") {
          const b = ranger(pc.pos).pad;
          if (b.length) pad = { button: b[0] };
        }
      }
      this.canaux.set(nom, { nom, neg: ranger(neg), pos: ranger(pos), pad,
                             mouseLook: def.mouse ?? null, souris, zoneMorte });
    }
    for (const [nom, def] of Object.entries(AJOUTS)) {
      this.canaux.set(nom, { nom, neg: ranger([]), pos: ranger(def.pos),
                             pad: null, mouseLook: null, ajout: true });
    }
    // Sans jeu de commandes pose, tout se lit : c'est l'etat du portage avant
    // docs/70, et le repli de tout ce qui construit un `Commandes` pour une
    // mesure isolee.
    this.modes = null;
    this.fixedTimestep = (data && data.fixedTimestep) || 0.016;
    // `Maximum Allowed Timestep` : 1 s dans ce build. Voir `decoupeImage`.
    this.maxTimestep = (data && data.maxTimestep) || 1;
    this.tags = (data && data.tags) || [];
    this.layers = (data && data.layers) || {};
  }

  get(nom) { return this.canaux.get(nom) || null; }

  /**
   * Le jeu de commandes actif, ou null pour tout lire.
   *
   * `OWInput.GetAxis` ne fait qu'une chose de plus que lire la touche :
   * `_activeInputs.Contains(canal)`. Le filtre vit donc ICI, au meme endroit
   * que dans le build, plutot qu'a chacun des soixante appels de `main.js` —
   * un filtre qu'on peut oublier a un endroit n'est pas un filtre
   * (docs/70-modes.md).
   */
  setModes(modes) { this.modes = modes || null; return this; }

  /** Le canal est-il lisible dans le mode courant ? */
  permis(nom) { return !this.modes || this.modes.permet(nom); }

  /**
   * Le canal est-il tenu ?
   *
   * @param etat  { keys, mouse, pad } — `keys[code]`, `mouse[bouton]`,
   *              `pad(bouton)`. Chacun est facultatif.
   */
  held(nom, etat = {}) {
    const c = this.get(nom);
    if (!c || !this.permis(nom)) return false;
    const k = etat.keys || {}, s = etat.mouse || {}, p = etat.pad || null;
    for (const code of c.pos.codes) if (k[code]) return true;
    for (const b of c.pos.mouse) if (s[b]) return true;
    for (const b of c.pos.pad) if (p && p(b)) return true;
    if (p && c.pad && c.pad.button !== undefined && p(c.pad.button)) return true;
    return false;
  }

  /**
   * L'axe d'un canal a boutons : −1, 0 ou +1.
   *
   * Les axes du build ont `gravity` et `sensitivity` a 1000 avec `snap` : au
   * clavier ils atteignent leur borne en une milliseconde, et une valeur
   * intermediaire ne se voit pas. On rend donc l'entier, et la manette apporte
   * l'analogique par son propre axe.
   */
  axis(nom, etat = {}) {
    const c = this.get(nom);
    if (!c || !this.permis(nom)) return 0;
    const k = etat.keys || {}, s = etat.mouse || {};
    let v = 0;
    for (const code of c.pos.codes) if (k[code]) v += 1;
    for (const b of c.pos.mouse) if (s[b]) v += 1;
    for (const code of c.neg.codes) if (k[code]) v -= 1;
    for (const b of c.neg.mouse) if (s[b]) v -= 1;
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  }

  /** Le numero d'axe de manette d'un canal, ou null. */
  padAxis(nom) {
    const c = this.get(nom);
    return c && c.pad && c.pad.axis !== undefined ? c.pad : null;
  }

  /** Le numero de bouton de manette d'un canal, ou null. */
  padButton(nom) {
    const c = this.get(nom);
    return c && c.pad && c.pad.button !== undefined ? c.pad.button : null;
  }

  /**
   * De quoi ecrire une invite : « clic droit », « Maj », « E »…
   *
   * Le build affiche l'icone de manette (`ScreenPrompt`) ; au clavier il n'y a
   * rien a copier, et ce libelle est donc du portage. Il rend la PREMIERE
   * liaison, celle qu'on montre a quelqu'un qui apprend.
   */
  label(nom) {
    const c = this.get(nom);
    if (!c) return "";
    if (c.pos.mouse.length) {
      // Numerotation du DOM : 0 gauche, 1 milieu, 2 droit.
      return { 0: "clic gauche", 1: "clic milieu", 2: "clic droit" }[c.pos.mouse[0]]
        || `souris ${c.pos.mouse[0]}`;
    }
    const code = c.pos.codes[0];
    if (!code) return "";
    const jolis = { Space: "Espace", Escape: "Echap", Enter: "Entree",
                    ShiftLeft: "Maj", ShiftRight: "Maj droite",
                    ControlLeft: "Ctrl", ControlRight: "Ctrl droite",
                    AltLeft: "Alt", AltRight: "Alt droite" };
    if (jolis[code]) return jolis[code];
    const m = /^Key([A-Z])$/.exec(code);
    return m ? m[1] : code;
  }
}

/**
 * Charge `data/input.json`. Absent, on retombe sur la table mesuree.
 *
 * Meme forme que les autres chargeurs du moteur : le Service Worker sert le
 * fichier depuis l'OPFS quand l'extraction a eu lieu, et rend 404 sinon.
 */
/**
 * Le pas de plus long qu'une integration a l'image supporte sans diverger :
 * c'etait le plafond du portage, et il le reste, mais pour un SOUS-pas.
 */
export const SOUS_PAS_MAX = 0.05;

/**
 * Le temps d'une image, decoupe comme Unity le fait avancer.
 *
 * Le build pose `Maximum Allowed Timestep` a 1 s dans son `TimeManager` :
 * `Time.deltaTime` suit l'horloge tant qu'une image dure moins d'une seconde,
 * et `FixedUpdate` rattrape par autant de pas fixes qu'il faut. Le portage,
 * lui, plafonnait l'image a 0,05 s : sous 20 images par seconde, le JEU
 * RALENTISSAIT. Mesure dans Chromium sans GPU (3 images par seconde) : une
 * demi-seconde de marche avancait le joueur de 0,39 m au lieu de 3,5, et la
 * boucle de vingt minutes en aurait dure plus de deux heures. Sur un
 * telephone a 15 images par seconde, elle durait 27 minutes.
 *
 * On garde le plafond de 0,05 s — mais pour chaque SOUS-pas, et l'image en
 * enchaine autant qu'il faut pour couvrir son temps reel, borne a la seconde
 * du build. A 60 images par seconde, un seul sous-pas : rien ne change.
 *
 * @returns {{ n: number, h: number }} n sous-pas de h secondes chacun
 */
export function decoupeImage(delta, maxTimestep = 1, sousPas = SOUS_PAS_MAX) {
  const t = Math.min(Math.max(0, delta || 0), maxTimestep > 0 ? maxTimestep : 1);
  if (t === 0) return { n: 1, h: 0 };
  const n = Math.max(1, Math.ceil(t / sousPas - 1e-9));
  return { n, h: t / n };
}

export async function loadCommandes(fetcher = fetch) {
  try {
    const r = await fetcher("data/input.json");
    if (!r || !r.ok) return new Commandes(null);
    return new Commandes(await r.json());
  } catch (e) {
    return new Commandes(null);
  }
}
