// Manette.
//
// Le build decrit une manette entiere (`XboxInput`), l'extracteur d'invites
// retient deja LE BOUTON ATTENDU par chaque invite, et les 16 textures d'icones
// sont extraites avec leur nommage particulier (`RightTrigger` -> `RT.png`).
// Le portage n'en lisait aucune : c'etait le dernier grand pan d'entree decrit
// par le build et jamais ouvert.
//
// Comme la couche tactile, cette couche NE CREE AUCUNE COMMANDE. Elle produit
// les memes axes et les memes codes clavier, de sorte que rien en aval ne sait
// d'ou vient l'ordre — c'est ce qui a rendu le tactile indolore, et c'est le
// chemin le plus court ici aussi.
//
// La disposition suit celle d'une manette standard, telle que la Gamepad API la
// normalise (`mapping === "standard"`) : c'est la meme que celle qu'`XboxInput`
// nomme, aux noms pres.

/** Zone morte des manches. Un manche pose ne tient pas immobile. */
export const PAD_DEAD_ZONE = 0.18;
/** Deflexion a partir de laquelle une gachette compte comme appuyee. */
export const TRIGGER_AT = 0.5;
/** Vitesse de rotation a fond de manche, en pixels de souris par seconde. */
export const PAD_LOOK_RATE = 900;
/** Part lineaire de la courbe de regard ; le reste est cubique, comme au doigt. */
export const PAD_LOOK_LINEAR = 0.25;

/**
 * Les numeros d'`InputManager` vers ceux de la Gamepad API.
 *
 * Le build numerote a la maniere d'Unity sous Windows ; le navigateur numerote
 * a la maniere du « standard mapping ». Les deux coincident jusqu'a cinq et
 * DIVERGENT ensuite : ce que Unity appelle 6 et 7 (Back et Start) est 8 et 9
 * dans le navigateur, ou 6 et 7 sont les gachettes. Prendre les numeros du
 * build tels quels mettait donc la carte sur la gachette gauche.
 *
 * Les deux gachettes sont des AXES pour Unity (8 et 9) et des BOUTONS a valeur
 * pour le navigateur (6 et 7) ; la croix directionnelle est un axe pour Unity
 * (6) et quatre boutons pour le navigateur (12 a 15).
 */
export const UNITY_VERS_NAVIGATEUR = {
  boutons: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 8, 7: 9, 8: 10, 9: 11 },
  // axe Unity -> { axe navigateur } ou { bouton navigateur, comme axe }
  axes: { 0: { axis: 0 }, 1: { axis: 1 }, 3: { axis: 2 }, 4: { axis: 3 },
          8: { trigger: 6 }, 9: { trigger: 7 },
          6: { dpad: [14, 15] } },
};

/**
 * Boutons de la manette -> codes clavier du jeu.
 *
 * Chaque ligne vient de l'`InputManager` (`docs/61-commandes.md`), traduite par
 * la table ci-dessus, et le code clavier est celui que le meme canal porte —
 * de sorte que rien en aval ne sait d'ou vient l'ordre. Le portage avait ecrit
 * cette table de memoire, et **quatre lignes sur six etaient fausses** : B
 * interagissait la ou le build annule, X allumait la lampe la ou le build
 * interagit, Y ouvrait la lunette la ou le build prend la vue arriere, LB
 * ouvrait l'ordinateur de bord la ou le build vise un referentiel.
 *
 * Le nom du build est donne en regard : c'est lui que porte l'invite a l'ecran
 * (`ScreenPrompt`), et donc l'icone deja affichee par `hud.js`.
 */
export const PAD_BUTTONS = {
  0: { code: "Space", build: "AButton", canal: "Jump" },
  1: { code: "KeyQ", build: "BButton", canal: "Cancel" },
  2: { code: "KeyE", build: "XButton", canal: "Interact" },
  3: { code: "KeyR", build: "YButton", canal: "Alt Probe" },
  // Les numeros de souris sont ceux du DOM, pas ceux d'Unity : le clic droit
  // y est le 2 (voir `codeUnity` dans `input.js`).
  4: { code: "Mouse0", build: "LeftBumper", canal: "Lock On" },
  5: { code: "Mouse2", build: "RightBumper", canal: "Probe" },
  8: { code: "Enter", build: "Back", canal: "Map" },
  9: { code: "Escape", build: "Start", canal: "Pause" },
  10: { code: "AltLeft", build: "LeftStickButton", canal: "Swap Roll/Yaw" },
  11: { code: "Mouse1", build: "RightStickButton", canal: "Telescope" },
  // La croix directionnelle porte la lampe (`Flashlight`, axe 6) ; le haut et
  // le bas restent au portage, pour l'ordinateur de bord.
  12: { code: "ArrowUp", build: "DPadUp" },
  13: { code: "ArrowDown", build: "DPadDown" },
  14: { code: "KeyF", build: "DPadLeft", canal: "Flashlight" },
  15: { code: "KeyF", build: "DPadRight", canal: "Flashlight" },
};

/** Gachettes, qui ne sont pas des boutons mais des axes tenus. */
export const LEFT_TRIGGER = 6, RIGHT_TRIGGER = 7;

/** Zone morte appliquee a un axe, avec reprise a zero a sa sortie. */
export function deadZone(v, dead = PAD_DEAD_ZONE) {
  const a = Math.abs(v);
  if (a <= dead) return 0;
  return Math.sign(v) * ((a - dead) / (1 - dead));
}

/** Courbe de regard : lineaire pres du centre, cubique au bord. */
export function padLookCurve(mag) {
  return mag * (PAD_LOOK_LINEAR + (1 - PAD_LOOK_LINEAR) * mag * mag);
}

const value = (b) => (typeof b === "number" ? b : (b && b.value) || 0);
const pressed = (b) => (typeof b === "number" ? b > TRIGGER_AT : !!(b && b.pressed));

/**
 * Etat de jeu d'une manette : les memes axes que la couche tactile, plus le
 * regard, qui se compte en vitesse.
 */
export function padState(gp, dead = PAD_DEAD_ZONE) {
  const zero = { forward: 0, right: 0, up: false, down: false, jump: false,
                 boost: false, roll: 0, lookX: 0, lookY: 0 };
  if (!gp || !gp.axes) return zero;
  const ax = gp.axes, btn = gp.buttons || [];
  const lx = deadZone(ax[0] || 0, dead), ly = deadZone(ax[1] || 0, dead);
  const rx = deadZone(ax[2] || 0, dead), ry = deadZone(ax[3] || 0, dead);
  const rmag = Math.min(1, Math.hypot(rx, ry));
  const k = rmag > 0 ? padLookCurve(rmag) / rmag : 0;
  return {
    forward: -ly,          // manche pousse vers l'avant : on avance
    right: lx,
    // `Move Up` est l'axe 9 d'Unity — la gachette DROITE — et `Move Down`
    // l'axe 8, la gauche. Le portage montait au bouton A, qui est le saut.
    up: value(btn[RIGHT_TRIGGER]) > TRIGGER_AT,
    down: value(btn[LEFT_TRIGGER]) > TRIGGER_AT,
    jump: pressed(btn[0]),
    boost: false,          // le build n'a pas d'accelerateur
    // Roulis : le build n'a pas d'axe pour lui non plus. Il partage le lacet,
    // et le clic du manche gauche (`Swap Roll/Yaw`) aiguille — voir `look()`
    // dans `main.js`. Le cinquieme axe, quand la manette en a un, sert quand
    // meme : c'est une torsion, et elle ne coute rien.
    roll: deadZone(ax[4] || 0, dead),
    lookX: rx * k,
    lookY: ry * k,
  };
}

/**
 * Codes des boutons qui viennent d'etre enfonces.
 *
 * On ne retient que les FRONTS : les commandes du jeu (`command()`) sont des
 * bascules, et un bouton tenu ouvrirait puis fermerait la carte a chaque image.
 */
export function padEdges(gp, previous = null) {
  const now = new Set(), codes = [];
  if (!gp || !gp.buttons) return { codes, state: now };
  for (const [i, spec] of Object.entries(PAD_BUTTONS)) {
    const b = gp.buttons[Number(i)];
    if (!pressed(b)) continue;
    now.add(spec.code);
    if (!previous || !previous.has(spec.code)) codes.push(spec.code);
  }
  return { codes, state: now };
}

/** Une manette est-elle branchee ? */
export function padAvailable() {
  try {
    if (!navigator.getGamepads) return false;
    return [...navigator.getGamepads()].some((g) => g && g.connected);
  } catch (e) {
    return false;
  }
}

export class GamepadControls {
  /**
   * @param opts { onKey(code), onLook(dx, dy), onHold(codes) }
   *
   * `onHold` est neuf, et indispensable depuis que les commandes du build sont
   * lues : trois canaux sont des boutons de SOURIS et deux sont des modificateurs
   * TENUS (`Swap Roll/Yaw`, `Probe`). Un front ne suffit plus — il faut l'etat.
   */
  constructor(opts = {}) {
    this.onKey = opts.onKey || (() => {});
    this.onLook = opts.onLook || (() => {});
    this.onHold = opts.onHold || (() => {});
    this.axes = { forward: 0, right: 0, up: false, down: false, jump: false,
                  boost: false, roll: 0 };
    this.held = null;
    this.connected = false;
    this.index = null;
  }

  /** La manette du moment : la premiere branchee, celle qu'on tient. */
  pad() {
    try {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
      const gp = pads.find((g) => g && g.connected);
      this.index = gp ? gp.index : null;
      return gp || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Une image de manette. A appeler dans la boucle : contrairement au clavier
   * et au doigt, la Gamepad API ne pousse aucun evenement — elle se lit.
   */
  poll(dt) {
    const gp = this.pad();
    this.connected = !!gp;
    if (!gp) {
      this.axes.forward = 0; this.axes.right = 0;
      this.axes.up = false; this.axes.down = false; this.axes.jump = false;
      this.axes.boost = false; this.axes.roll = 0;
      this.held = null;
      this.onHold(new Set());
      return this.axes;
    }
    const s = padState(gp);
    this.axes.forward = s.forward;
    this.axes.right = s.right;
    this.axes.up = s.up;
    this.axes.down = s.down;
    this.axes.jump = s.jump;
    this.axes.boost = s.boost;
    this.axes.roll = s.roll;
    const { codes, state } = padEdges(gp, this.held);
    this.held = state;
    this.onHold(state);
    for (const c of codes) this.onKey(c);
    if (s.lookX || s.lookY) {
      const step = PAD_LOOK_RATE * Math.min(dt, 0.05);
      this.onLook(s.lookX * step, s.lookY * step);
    }
    return this.axes;
  }
}
