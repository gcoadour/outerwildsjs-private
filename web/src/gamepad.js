// Manette.
//
// Le build en decrit une entiere : `XboxInput`, l'enumeration `XboxButton`, et
// chaque invite a l'ecran retient LE BOUTON qu'elle attend — c'est ce que lit
// `pipeline/extract/prompts.js`, et ce sont les 16 textures d'icones extraites
// (`RightTrigger` sort en `RT.png`) que `hud.js` affiche deja dans l'invite.
// Il ne manquait que l'entree elle-meme.
//
// Elle se branche exactement comme la couche tactile : elle NE CREE AUCUNE
// COMMANDE. Elle produit les memes axes analogiques et les memes codes de
// touche, si bien que rien en aval ne sait d'ou vient l'ordre — ni le clavier,
// ni le doigt, ni la manette (voir docs/33-mobile.md).
//
// Ce qui vient du build et ce qui n'en vient pas :
//
//   - l'icone affichee dans une invite vient du build, bouton par bouton ;
//   - la correspondance entre un bouton et une touche de CE portage est un
//     choix : le jeu d'origine n'a pas de clavier a la place duquel se mettre.
//     Elle suit les invites la ou elles nomment un bouton (A pour interagir,
//     les gachettes pour la poussee), le reste est range par voisinage.
//
// La disposition standard du navigateur (`gamepad.mapping === "standard"`) est
// la seule sur laquelle les indices ci-dessous ont un sens ; une manette qui ne
// s'y conforme pas est ignoree plutot que mal lue.

import { stickVector, lookCurve, sprinting, DEAD_ZONE, LOOK_DEAD_ZONE,
         LOOK_RATE, LOOK_MAX_DT } from "./touch.js";

// Indices de la disposition standard, et le bouton du jeu qu'ils portent.
export const BUTTONS = {
  0: { xbox: "A", code: "KeyE" },            // interagir, parler, valider
  1: { xbox: "B", code: "Backspace" },       // revenir, annuler
  2: { xbox: "X", code: "KeyF" },            // lancer une sonde
  3: { xbox: "Y", code: "KeyT" },            // lunette
  4: { xbox: "LeftBumper", code: "KeyN" },   // ordinateur de bord
  5: { xbox: "RightBumper", code: "KeyM" },  // carte du systeme
  8: { xbox: "Back", code: "KeyG" },         // mode d'affichage
  9: { xbox: "Start", code: "Escape" },      // menu
  10: { xbox: "LeftStickButton", code: "KeyC" },   // recentrer la carte
  11: { xbox: "RightStickButton", code: "KeyL" },  // lampe
  12: { xbox: "DPadUp", code: "ArrowUp" },
  13: { xbox: "DPadDown", code: "ArrowDown" },
  14: { xbox: "DPadLeft", code: "ArrowLeft" },
  15: { xbox: "DPadRight", code: "ArrowRight" },
};

// Gachettes : elles sont TENUES, pas pressees. RT monte, LT accelere — les
// deux invites de reacteur du jeu (`_upThrustPrompt`, `_horizontalThrustPrompt`)
// nomment les gachettes.
export const TRIGGER_UP = 7, TRIGGER_BOOST = 6;
// Une gachette analogique n'est jamais tout a fait relachee.
export const TRIGGER_AT = 0.35;

/** Axes de deplacement d'une manette, zone morte comprise. */
export function moveAxes(axes = []) {
  const v = stickVector(axes[0] || 0, axes[1] || 0, 1, DEAD_ZONE);
  // vers le haut du manche, on avance : l'axe Y du navigateur descend
  return { forward: -v.y, right: v.x, sprint: sprinting(v) };
}

/**
 * Rotation demandee par le manche droit, en pixels de souris.
 *
 * Meme courbe et meme vitesse que le manche droit tactile : ce qui est bon au
 * pouce l'est au pouce, quel que soit le support.
 */
export function lookDelta(axes = [], dt) {
  const step = Math.min(dt, LOOK_MAX_DT);
  const v = stickVector(axes[2] || 0, axes[3] || 0, 1, LOOK_DEAD_ZONE);
  if (!v.mag) return { dx: 0, dy: 0 };
  const k = lookCurve(v.mag) * LOOK_RATE * step;
  return { dx: v.ux * k, dy: v.uy * k };
}

/** Le bouton de manette qui porte une touche, pour l'afficher dans une invite. */
export function buttonFor(code) {
  for (const b of Object.values(BUTTONS)) if (b.code === code) return b.xbox;
  if (code === "Space") return "RightTrigger";
  if (code === "ShiftLeft") return "LeftTrigger";
  return null;
}

export class GamepadControls {
  /** @param opts { onKey(code), onLook(dx, dy) } — les memes que le tactile. */
  constructor(opts = {}) {
    this.onKey = opts.onKey || (() => {});
    this.onLook = opts.onLook || (() => {});
    this.axes = { forward: 0, right: 0, up: false, boost: false };
    this.held = new Set();      // boutons deja enfonces a l'image precedente
    this.connected = false;
    this.id = null;
  }

  /** Manette branchee et conforme a la disposition standard, ou null. */
  pad() {
    const list = (typeof navigator !== "undefined" && navigator.getGamepads)
      ? navigator.getGamepads() : [];
    for (const g of list) {
      if (g && g.connected && g.mapping === "standard") return g;
    }
    return null;
  }

  /**
   * Un pas de lecture. A appeler une fois par image : l'API ne pousse aucun
   * evenement, elle se lit.
   */
  update(dt) {
    const g = this.pad();
    if (!g) {
      if (this.connected) this.reset();
      return false;
    }
    if (!this.connected) { this.connected = true; this.id = g.id; }

    const mv = moveAxes(g.axes);
    this.axes.forward = mv.forward;
    this.axes.right = mv.right;

    const pressed = (i) => {
      const b = g.buttons[i];
      return !!b && (typeof b === "object" ? (b.pressed || b.value > TRIGGER_AT)
                                           : b > TRIGGER_AT);
    };
    this.axes.up = pressed(TRIGGER_UP);
    // Le cran de course du manche vaut la gachette : pousser a fond accelere,
    // exactement comme au pouce.
    this.axes.boost = pressed(TRIGGER_BOOST) || mv.sprint;

    // Front montant seulement : une commande de menu tenue ne doit pas defiler
    // a la vitesse des images.
    for (const [i, b] of Object.entries(BUTTONS)) {
      const on = pressed(Number(i));
      if (on && !this.held.has(i)) this.onKey(b.code);
      if (on) this.held.add(i); else this.held.delete(i);
    }

    const { dx, dy } = lookDelta(g.axes, dt);
    if (dx || dy) this.onLook(dx, dy);
    return true;
  }

  reset() {
    this.connected = false;
    this.id = null;
    this.held.clear();
    this.axes.forward = 0;
    this.axes.right = 0;
    this.axes.up = false;
    this.axes.boost = false;
  }
}
