// Commandes tactiles et jeu en paysage.
//
// Rien dans le build ne decrit un ecran tactile : le jeu de 2013 est fait pour
// le clavier et la manette, et cette couche est donc ENTIEREMENT du portage.
// Elle n'ajoute aucune commande : elle produit les memes entrees que le
// clavier, de sorte que rien en aval ne sait qu'un doigt existe.
//
//   manche gauche    remplit input.forward et input.right, en analogique
//   zone droite      le meme deplacement qu'une souris capturee
//   boutons          le code clavier de l'action (KeyE, KeyM, KeyT, ...)
//   tape breve       KeyE, l'action principale du jeu
//   pincement        le zoom de la carte, borne comme celui de la molette
//
// Le manche est FLOTTANT : il apparait la ou le pouce se pose, plutot qu'a une
// place fixe. Sur un ecran sans relief, viser une croix invisible ne marche
// pas ; se poser n'importe ou dans sa moitie d'ecran, si.

// Rayon du manche, en pixels : au-dela, l'axe sature a 1.
export const STICK_RADIUS = 54;
// Zone morte, en fraction du rayon. PlayerCharacterController n'en a pas — le
// clavier est tout ou rien — mais un pouce pose ne tient pas immobile.
export const DEAD_ZONE = 0.16;
// Ce qui separe une tape d'un glissement : au-dela, c'est un regard.
export const TAP_MS = 300, TAP_PX = 14;
// Un doigt parcourt moins de pixels qu'une souris : le regard est amplifie
// d'autant, avant l'inversion et la sensibilite des reglages.
export const LOOK_GAIN = 1.7;

/**
 * Capture d'un pointeur, sans consequence si elle echoue.
 *
 * `setPointerCapture` leve des que le pointeur n'est plus actif — un doigt
 * releve entre l'evenement et son traitement, ou une source synthetique. Sans
 * ce filet, l'exception interromprait le gestionnaire et l'axe resterait a
 * zero.
 */
function capture(el, id) {
  try { el.setPointerCapture(id); } catch (e) { /* pointeur deja parti */ }
}

/**
 * Ce navigateur est-il pilote au doigt ?
 *
 * `?touch=1` et `?touch=0` forcent la reponse : c'est ce qui permet d'ouvrir la
 * disposition tactile sur un poste de bureau pour la verifier.
 */
export function touchAvailable() {
  const forced = new URLSearchParams(location.search).get("touch");
  if (forced === "1") return true;
  if (forced === "0") return false;
  return (navigator.maxTouchPoints || 0) > 0 &&
         matchMedia("(pointer: coarse)").matches;
}

/**
 * Passe en plein ecran et verrouille le paysage.
 *
 * Les deux demandes exigent un geste de l'utilisateur et echouent souvent —
 * iOS n'expose pas le verrouillage d'orientation, et le plein ecran est refuse
 * hors clic. L'echec est sans consequence : la page reste jouable, et le
 * bandeau « tournez l'appareil » prend le relais.
 */
export async function goLandscape(el = document.documentElement) {
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) { /* refus : sans gravite */ }
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch (e) { /* non expose, ou refus : sans gravite */ }
}

// Boutons d'action, dans l'ordre ou ils apparaissent.
//
// `hold` : maintenu, comme Espace — il remplit un axe directement, et son
// `code` n'est la que pour dire quelle touche il double.
// `toggle` : maintenu mais latche, parce qu'un pouce ne peut pas a la fois
// tenir « accelerer » et viser.
// Les autres envoient leur code une fois, comme une frappe.
const ACTIONS = [
  { key: "up", code: "Space", label: "▲", title: "Monter", hold: true, cls: "tc-up" },
  { key: "boost", code: "ShiftLeft", label: "»", title: "Accelerer", toggle: true, cls: "tc-boost" },
  { key: "interact", code: "KeyE", label: "E", title: "Interagir, parler", cls: "tc-act" },
];

// Bascules, en haut : les memes que les touches du clavier.
const TOGGLES = [
  { code: "KeyM", label: "carte" },
  { code: "KeyT", label: "lunette" },
  { code: "KeyF", label: "sonde" },
  { code: "KeyL", label: "lampe" },
  { code: "KeyN", label: "bord" },
  { code: "KeyG", label: "vue" },
  { code: "Escape", label: "menu" },
];

// Croix de menu : ce que le clavier fait avec ses fleches. Elle ne sort que
// quand un menu est ouvert — reglages, ordinateur de bord, carte.
const MENU = [
  { code: "ArrowUp", label: "▲", cls: "tc-m-up" },
  { code: "ArrowDown", label: "▼", cls: "tc-m-down" },
  { code: "ArrowLeft", label: "◀", cls: "tc-m-left" },
  { code: "ArrowRight", label: "▶", cls: "tc-m-right" },
  { code: "Enter", label: "✓", cls: "tc-m-ok" },
  { code: "Escape", label: "✕", cls: "tc-m-back" },
];

const MAP_KEYS = [
  { code: "KeyC", label: "centrer", cls: "tc-m-ok" },
  { code: "KeyM", label: "fermer", cls: "tc-m-back" },
];

export class TouchControls {
  /**
   * @param zones  couche des zones de pilotage, SOUS l'interface
   * @param ui     couche des boutons, AU-DESSUS de tout
   * @param opts   { onKey(code), onLook(dx, dy) }
   */
  constructor(zones, ui, opts = {}) {
    this.zonesRoot = zones;
    this.uiRoot = ui;
    this.onKey = opts.onKey || (() => {});
    this.onLook = opts.onLook || (() => {});
    this.enabled = false;
    this.axes = { forward: 0, right: 0, up: false, boost: false };
    this.stickId = null;
    this.lookId = null;
    this.context = { menu: false, map: false };
    this.buttons = [];
    // Un doigt qui quitte la page laisserait sinon son axe colle. Les deux
    // ecoutes vivent avec l'objet, pas avec la couche : les reinstaller a
    // chaque `enable()` les empilerait.
    addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
  }

  /** Construit la couche et l'active. Sans appel, la page reste au clavier. */
  enable() {
    if (this.enabled || !this.zonesRoot || !this.uiRoot) return this;
    this.enabled = true;
    document.body.classList.add("touch");
    this.buildZones();
    this.buildButtons();
    this.zonesRoot.hidden = false;
    this.uiRoot.hidden = false;
    return this;
  }

  /** Remet tous les axes a zero : plus aucun doigt n'est considere pose. */
  reset() {
    this.stickId = null;
    this.lookId = null;
    this.axes.forward = 0;
    this.axes.right = 0;
    this.axes.up = false;
    this.axes.boost = false;
    if (this.knob) this.knob.style.transform = "translate(-50%, -50%)";
    if (this.stick) this.stick.hidden = true;
    for (const b of this.buttons) b.classList.remove("tc-on");
  }

  /**
   * Depose la couche et rend la page au clavier. Symetrique d'`enable()` :
   * c'est ce qui permet a un controle de verification de l'installer, de
   * l'eprouver, puis de laisser la page comme il l'a trouvee.
   */
  disable() {
    if (!this.enabled) return this;
    this.reset();
    this.enabled = false;
    document.body.classList.remove("touch");
    this.zonesRoot.textContent = "";
    this.uiRoot.textContent = "";
    this.zonesRoot.hidden = true;
    this.uiRoot.hidden = true;
    this.zonesRoot.classList.remove("tc-idle");
    this.uiRoot.classList.remove("tc-modal");
    document.body.classList.remove("tc-modal");
    this.buttons = [];
    this.stick = null;
    this.knob = null;
    this.context = { menu: false, map: false };
    return this;
  }

  // --- zones de pilotage ---

  buildZones() {
    const zone = (cls) => {
      const d = document.createElement("div");
      d.className = "tc-zone " + cls;
      this.zonesRoot.appendChild(d);
      return d;
    };
    this.moveZone = zone("tc-zone-move");
    this.lookZone = zone("tc-zone-look");

    this.stick = document.createElement("div");
    this.stick.className = "tc-stick";
    this.stick.hidden = true;
    this.knob = document.createElement("div");
    this.knob.className = "tc-knob";
    this.stick.appendChild(this.knob);
    this.zonesRoot.appendChild(this.stick);

    this.bind(this.moveZone, "move");
    this.bind(this.lookZone, "look");
    this.zonesRoot.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  bind(el, kind) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      capture(el, e.pointerId);
      if (kind === "move") this.stickDown(e);
      else this.lookDown(e);
    });
    el.addEventListener("pointermove", (e) => {
      if (kind === "move") this.stickMove(e);
      else this.lookMove(e);
    });
    const end = (e) => {
      if (kind === "move") this.stickUp(e);
      else this.lookUp(e);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  stickDown(e) {
    if (this.stickId !== null) return;      // un seul manche a la fois
    this.stickId = e.pointerId;
    this.origin = [e.clientX, e.clientY];
    this.stick.hidden = false;
    this.stick.style.left = `${e.clientX}px`;
    this.stick.style.top = `${e.clientY}px`;
    this.stickMove(e);
  }

  stickMove(e) {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.origin[0], dy = e.clientY - this.origin[1];
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) { dx *= STICK_RADIUS / d; dy *= STICK_RADIUS / d; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Au sortir de la zone morte l'axe repart de zero, sinon le premier pixel
    // utile vaudrait deja 0,16 et le demarrage serait brusque.
    const mag = Math.min(1, d / STICK_RADIUS);
    const k = mag <= DEAD_ZONE ? 0 : (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
    const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
    this.axes.right = ux * k;
    this.axes.forward = -uy * k;      // vers le haut de l'ecran, on avance
  }

  stickUp(e) {
    if (e.pointerId !== this.stickId) return;
    this.clearStick();
  }

  clearStick() {
    this.stickId = null;
    this.axes.forward = 0;
    this.axes.right = 0;
    this.stick.hidden = true;
    this.knob.style.transform = "translate(-50%, -50%)";
  }

  lookDown(e) {
    if (this.lookId !== null) return;
    this.lookId = e.pointerId;
    this.last = [e.clientX, e.clientY];
    this.lookStart = [e.clientX, e.clientY, performance.now()];
    this.travel = 0;
  }

  lookMove(e) {
    if (e.pointerId !== this.lookId) return;
    const dx = e.clientX - this.last[0], dy = e.clientY - this.last[1];
    this.last = [e.clientX, e.clientY];
    this.travel += Math.abs(dx) + Math.abs(dy);
    this.onLook(dx * LOOK_GAIN, dy * LOOK_GAIN);
  }

  lookUp(e) {
    if (e.pointerId !== this.lookId) return;
    this.lookId = null;
    // Tape breve et immobile : c'est l'action principale, celle que le jeu
    // met sur E — parler, interagir, faire defiler un dialogue.
    const dt = performance.now() - this.lookStart[2];
    if (this.travel < TAP_PX && dt < TAP_MS) this.onKey("KeyE");
  }

  // --- boutons ---

  buildButtons() {
    const group = (cls) => {
      const d = document.createElement("div");
      d.className = "tc-group " + cls;
      this.uiRoot.appendChild(d);
      return d;
    };
    const actions = group("tc-actions");
    const toggles = group("tc-toggles");
    this.menuGroup = group("tc-menu");
    this.mapGroup = group("tc-mapkeys");
    this.menuGroup.hidden = true;
    this.mapGroup.hidden = true;

    for (const a of ACTIONS) this.button(actions, a);
    for (const t of TOGGLES) this.button(toggles, { ...t, cls: "tc-tog" });
    for (const m of MENU) this.button(this.menuGroup, { ...m, cls: "tc-key " + m.cls });
    for (const m of MAP_KEYS) this.button(this.mapGroup, { ...m, cls: "tc-key " + m.cls });
    this.uiRoot.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  button(parent, spec) {
    const b = document.createElement("button");
    b.className = "tc-btn " + (spec.cls || "");
    b.type = "button";
    b.textContent = spec.label;
    if (spec.title) b.title = spec.title;
    b.setAttribute("aria-label", spec.title || spec.label);
    parent.appendChild(b);
    this.buttons.push(b);

    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      capture(b, e.pointerId);
      if (spec.hold) { this.axes[spec.key] = true; b.classList.add("tc-on"); }
      else if (spec.toggle) {
        this.axes[spec.key] = !this.axes[spec.key];
        b.classList.toggle("tc-on", this.axes[spec.key]);
      } else {
        b.classList.add("tc-on");
        this.onKey(spec.code);
      }
    });
    const up = () => {
      if (spec.hold) { this.axes[spec.key] = false; b.classList.remove("tc-on"); }
      else if (!spec.toggle) b.classList.remove("tc-on");
    };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("pointerleave", up);
    return b;
  }

  /**
   * Etat de l'interface : un menu ouvert sort la croix et suspend le pilotage,
   * la carte sort ses deux touches et laisse le canvas prendre les gestes.
   */
  setContext(ctx) {
    if (!this.enabled) return;
    const menu = !!ctx.menu, map = !!ctx.map;
    if (menu === this.context.menu && map === this.context.map) return;
    this.context = { menu, map };
    this.menuGroup.hidden = !menu;
    this.mapGroup.hidden = !map;
    // Zones coupees dans un menu : sinon le pouce qui vise une option fait
    // aussi tourner la tete du joueur derriere.
    this.zonesRoot.classList.toggle("tc-idle", menu || map);
    // Un menu ouvert range le reste : les boutons de pilotage n'y servent a
    // rien, et la croix se poserait sur le bandeau d'etat.
    this.uiRoot.classList.toggle("tc-modal", menu || map);
    document.body.classList.toggle("tc-modal", menu || map);
    if (menu || map) {
      this.clearStick();
      this.lookId = null;
    }
  }
}

/**
 * Gestes de la carte du systeme : glisser pour deplacer le point vise, pincer
 * pour zoomer, taper pour choisir une cible.
 *
 * Ces evenements sont des `PointerEvent` : le meme code sert la souris et le
 * doigt, et remplace les anciens gestionnaires de souris.
 *
 * @param onPick appele avec le corps choisi, s'il y en a un
 */
export function bindMapGestures(canvas, map, onPick) {
  const pts = new Map();
  let travel = 0, spread = 0;

  const gap = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener("pointerdown", (e) => {
    capture(canvas, e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    travel = 0;
    spread = pts.size === 2 ? gap() : 0;
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    travel += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) {
      // MapController deplace le point vise de axe x distance de zoom x dt :
      // convertir les pixels parcourus en fraction d'ecran donne la meme
      // vitesse APPARENTE quel que soit le zoom.
      const w = canvas.width || 1;
      map.pan(-dx / w * 2, -dy / w * 2, 1);
    } else if (pts.size === 2) {
      const d = gap();
      // ecarter les doigts rapproche la camera : le zoom est une DISTANCE
      if (spread > 0 && d > 0) map.setZoom(map.zoom * (spread / d));
      spread = d;
    }
  });

  const end = (e) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    spread = 0;
    if (!p) return;
    // Une tape, c'est un pointeur pose et releve sans avoir glisse — la duree
    // n'entre pas en compte, un clic de souris peut trainer. Le pincement, lui,
    // deplace bien assez pour ne jamais passer pour une tape.
    if (travel < TAP_PX && !pts.size) {
      const r = canvas.getBoundingClientRect();
      const b = map.pick(e.clientX - r.left, e.clientY - r.top);
      if (b) { map.selected = b; if (onPick) onPick(b); }
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}
