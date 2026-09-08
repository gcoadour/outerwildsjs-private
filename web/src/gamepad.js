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
 * Boutons de la manette -> codes clavier du jeu.
 *
 * Le nom du build est donne en regard : c'est lui que porte l'invite a l'ecran
 * (`ScreenPrompt`), et donc l'icone deja affichee par `hud.js`.
 */
export const PAD_BUTTONS = {
  0: { code: "Space", build: "AButton" },        // A : pousser vers le haut
  1: { code: "KeyE", build: "BButton" },         // B : interagir, parler
  2: { code: "KeyL", build: "XButton" },         // X : lampe
  3: { code: "KeyT", build: "YButton" },         // Y : telescope
  4: { code: "KeyN", build: "LeftBumper" },      // LB : ordinateur de bord
  5: { code: "KeyF", build: "RightBumper" },     // RB : sonde
  8: { code: "KeyM", build: "Back" },            // Back : carte
  9: { code: "Escape", build: "Start" },         // Start : reglages
  10: { code: "KeyC", build: "LeftStickButton" },
  12: { code: "ArrowUp", build: "DPadUp" },
  13: { code: "ArrowDown", build: "DPadDown" },
  14: { code: "ArrowLeft", build: "DPadLeft" },
  15: { code: "ArrowRight", build: "DPadRight" },
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
  const zero = { forward: 0, right: 0, up: false, boost: false, lookX: 0, lookY: 0 };
  if (!gp || !gp.axes) return zero;
  const ax = gp.axes, btn = gp.buttons || [];
  const lx = deadZone(ax[0] || 0, dead), ly = deadZone(ax[1] || 0, dead);
  const rx = deadZone(ax[2] || 0, dead), ry = deadZone(ax[3] || 0, dead);
  const rmag = Math.min(1, Math.hypot(rx, ry));
  const k = rmag > 0 ? padLookCurve(rmag) / rmag : 0;
  return {
    forward: -ly,          // manche pousse vers l'avant : on avance
    right: lx,
    up: pressed(btn[0]) || value(btn[LEFT_TRIGGER]) > TRIGGER_AT,
    boost: value(btn[RIGHT_TRIGGER]) > TRIGGER_AT || pressed(btn[10]),
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
  /** @param opts { onKey(code), onLook(dx, dy) } — les memes qu'au doigt */
  constructor(opts = {}) {
    this.onKey = opts.onKey || (() => {});
    this.onLook = opts.onLook || (() => {});
    this.axes = { forward: 0, right: 0, up: false, boost: false };
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
      this.axes.up = false; this.axes.boost = false;
      this.held = null;
      return this.axes;
    }
    const s = padState(gp);
    this.axes.forward = s.forward;
    this.axes.right = s.right;
    this.axes.up = s.up;
    this.axes.boost = s.boost;
    const { codes, state } = padEdges(gp, this.held);
    this.held = state;
    for (const c of codes) this.onKey(c);
    if (s.lookX || s.lookY) {
      const step = PAD_LOOK_RATE * Math.min(dt, 0.05);
      this.onLook(s.lookX * step, s.lookY * step);
    }
    return this.axes;
  }
}
