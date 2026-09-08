// Commandes tactiles et jeu en paysage.
//
// Rien dans le build ne decrit un ecran tactile : le jeu de 2013 est fait pour
// le clavier et la manette, et cette couche est donc ENTIEREMENT du portage.
// Elle n'ajoute aucune commande : elle produit les memes entrees que le
// clavier, de sorte que rien en aval ne sait qu'un doigt existe.
//
// La disposition est celle des FPS sur telephone : DEUX MANCHES, un par pouce.
//
//   manche gauche    deplacement, en analogique — input.forward et input.right
//   manche droit     regard, en VITESSE : la deflexion tenue donne des pixels
//                    de souris par seconde, le glissement garde son effet direct
//   boutons          le code clavier de l'action (KeyE, KeyM, KeyT, ...)
//   tape breve       KeyE, l'action principale du jeu
//   pincement        le zoom de la carte, borne comme celui de la molette
//
// Les deux manches sont FLOTTANTS : ils apparaissent la ou le pouce se pose,
// plutot qu'a une place fixe. Sur un ecran sans relief, viser une croix
// invisible ne marche pas ; se poser n'importe ou dans sa moitie d'ecran, si.
// Une empreinte pale rappelle malgre tout ou chaque pouce est attendu.

// Rayon d'un manche, en pixels : au-dela, l'axe sature a 1.
export const STICK_RADIUS = 54;
// Zone morte du manche de deplacement, en fraction du rayon.
// PlayerCharacterController n'en a pas — le clavier est tout ou rien — mais un
// pouce pose ne tient pas immobile.
export const DEAD_ZONE = 0.16;
// Zone morte du manche de regard. Elle est plus large : une camera qui derive
// sous un pouce immobile est bien plus penible qu'un pas parasite.
export const LOOK_DEAD_ZONE = 0.22;
// Cran de course : manche pousse a fond, et vers l'avant. C'est le « pousser
// pour sprinter » des FPS mobiles, qui evite de tenir Maj d'un autre doigt.
// Le cone vaut le cosinus du demi-angle admis, soit 45 degres de part et
// d'autre de l'avant.
export const SPRINT_AT = 0.95, SPRINT_CONE = 0.7;
// Ce qui separe une tape d'un glissement : au-dela, c'est un regard.
export const TAP_MS = 300, TAP_PX = 14;
// Un doigt parcourt moins de pixels qu'une souris : le glissement est amplifie
// d'autant, avant l'inversion et la sensibilite des reglages.
export const LOOK_GAIN = 1.7;
// Vitesse de rotation a fond de manche, en pixels de souris par seconde. Avec
// la formule de `look()` (0,0022 radian par pixel), 900 donne pres de deux
// radians par seconde, soit 113 degres — l'ordre de grandeur d'un FPS mobile.
export const LOOK_RATE = 900;
// Courbe de reponse du manche de regard : part lineaire, le reste en cube. Une
// reponse droite oblige a choisir entre viser fin et se retourner vite ; la
// courbe donne les deux, precise pres du centre et rapide au bord.
export const LOOK_LINEAR = 0.25;
// Un onglet revenu au premier plan rend un `dt` enorme : la camera ferait un
// bond. Le pas de la boucle est borne comme celui du moteur.
export const LOOK_MAX_DT = 0.05;

/**
 * Etat d'un manche, a partir de l'ecart entre le pouce et son origine.
 *
 * Au sortir de la zone morte l'amplitude repart de zero, sinon le premier
 * pixel utile vaudrait deja la zone morte et le demarrage serait brusque.
 *
 * @returns {{x:number, y:number, ux:number, uy:number, mag:number}} composantes
 *   deja multipliees par l'amplitude, direction unitaire, et amplitude.
 */
export function stickVector(dx, dy, radius = STICK_RADIUS, dead = DEAD_ZONE) {
  const d = Math.hypot(dx, dy);
  const m = Math.min(1, d / radius);
  const mag = m <= dead ? 0 : (m - dead) / (1 - dead);
  const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
  return { x: ux * mag, y: uy * mag, ux, uy, mag };
}

/** Amplitude du regard apres courbe : lineaire pres du centre, cubique au bord. */
export function lookCurve(mag) {
  return mag * (LOOK_LINEAR + (1 - LOOK_LINEAR) * mag * mag);
}

/** Le manche de deplacement est-il pousse a fond vers l'avant ? */
export function sprinting(v) {
  return v.mag >= SPRINT_AT && -v.uy >= SPRINT_CONE;
}

/**
 * Comment le manche droit tourne la camera.
 *
 * Par defaut les deux se cumulent : le glissement donne la reponse immediate
 * d'un balayage, la deflexion tenue fait continuer le mouvement. `?look=stick`
 * ne garde que la vitesse (double manche strict), `?look=swipe` que le
 * glissement (la disposition d'avant).
 */
export function lookMode() {
  const m = new URLSearchParams(location.search).get("look");
  if (m === "stick") return { swipe: false, rate: LOOK_RATE };
  if (m === "swipe") return { swipe: true, rate: 0 };
  return { swipe: true, rate: LOOK_RATE };
}

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
// tenir « accelerer » et viser. Le cran de course du manche gauche l'allume
// aussi, le temps qu'il dure.
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

/**
 * Un manche flottant : sa base, son bouton, et le pointeur qui le tient.
 *
 * Les deux manches sont le meme objet a deux reglages pres — c'est ce qui rend
 * le manche droit possible sans ecrire une seconde fois la meme geometrie.
 */
class Stick {
  constructor(root, cls, opts = {}) {
    this.radius = opts.radius || STICK_RADIUS;
    this.dead = opts.dead === undefined ? DEAD_ZONE : opts.dead;
    this.id = null;
    this.vec = stickVector(0, 0, this.radius, this.dead);
    this.el = document.createElement("div");
    this.el.className = "tc-stick " + cls;
    this.el.hidden = true;
    this.knob = document.createElement("div");
    this.knob.className = "tc-knob";
    this.el.appendChild(this.knob);
    root.appendChild(this.el);
  }

  get active() { return this.id !== null; }

  /** @returns vrai si ce pointeur prend le manche, faux s'il est deja pris. */
  down(e) {
    if (this.id !== null) return false;   // un seul pouce par manche
    this.id = e.pointerId;
    this.origin = [e.clientX, e.clientY];
    this.el.hidden = false;
    this.el.style.left = `${e.clientX}px`;
    this.el.style.top = `${e.clientY}px`;
    this.move(e);
    return true;
  }

  move(e) {
    if (e.pointerId !== this.id) return false;
    const dx = e.clientX - this.origin[0], dy = e.clientY - this.origin[1];
    // Le bouton s'arrete au bord, l'axe sature : le pouce peut partir plus
    // loin sans que rien ne saute quand il revient.
    const d = Math.hypot(dx, dy), k = d > this.radius ? this.radius / d : 1;
    this.knob.style.transform =
      `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    this.vec = stickVector(dx, dy, this.radius, this.dead);
    return true;
  }

  up(e) {
    if (e.pointerId !== this.id) return false;
    this.clear();
    return true;
  }

  clear() {
    this.id = null;
    this.vec = stickVector(0, 0, this.radius, this.dead);
    this.el.hidden = true;
    this.knob.style.transform = "translate(-50%, -50%)";
  }
}

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
    this.held = { up: false, boost: false };
    this.sprint = false;
    this.context = { menu: false, map: false };
    this.buttons = [];
    this.raf = null;
    const mode = opts.look || lookMode();
    this.swipe = mode.swipe;
    this.rate = mode.rate;
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
    this.startLoop();
    return this;
  }

  /** Remet tous les axes a zero : plus aucun doigt n'est considere pose. */
  reset() {
    if (this.moveStick) this.moveStick.clear();
    if (this.lookStick) this.lookStick.clear();
    this.axes.forward = 0;
    this.axes.right = 0;
    this.held.up = false;
    this.held.boost = false;
    this.sprint = false;
    this.axes.up = false;
    this.axes.boost = false;
    for (const b of this.buttons) b.classList.remove("tc-on");
    this.liveZones();
  }

  /**
   * Depose la couche et rend la page au clavier. Symetrique d'`enable()` :
   * c'est ce qui permet a un controle de verification de l'installer, de
   * l'eprouver, puis de laisser la page comme il l'a trouvee.
   */
  disable() {
    if (!this.enabled) return this;
    this.reset();
    this.stopLoop();
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
    this.moveZone = null;
    this.lookZone = null;
    this.moveStick = null;
    this.lookStick = null;
    this.boostBtn = null;
    this.context = { menu: false, map: false };
    return this;
  }

  // --- zones de pilotage ---

  buildZones() {
    const zone = (cls) => {
      const d = document.createElement("div");
      d.className = "tc-zone " + cls;
      // Empreinte du manche : la ou le pouce est attendu, tant qu'il n'est pas
      // pose. Le manche reste flottant ; ceci ne fait que le dire.
      const home = document.createElement("div");
      home.className = "tc-home";
      d.appendChild(home);
      this.zonesRoot.appendChild(d);
      return d;
    };
    this.moveZone = zone("tc-zone-move");
    this.lookZone = zone("tc-zone-look");

    this.moveStick = new Stick(this.zonesRoot, "tc-stick-move");
    this.lookStick = new Stick(this.zonesRoot, "tc-stick-look",
                               { dead: LOOK_DEAD_ZONE });

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

  /** Empreintes visibles tant que le manche correspondant est libre. */
  liveZones() {
    if (this.moveZone) {
      this.moveZone.classList.toggle("tc-live", !!(this.moveStick || {}).active);
    }
    if (this.lookZone) {
      this.lookZone.classList.toggle("tc-live", !!(this.lookStick || {}).active);
    }
  }

  // --- manche gauche : deplacement ---

  stickDown(e) {
    if (!this.moveStick.down(e)) return;
    this.liveZones();
    this.applyMove();
  }

  stickMove(e) {
    if (!this.moveStick.move(e)) return;
    this.applyMove();
  }

  stickUp(e) {
    if (!this.moveStick.up(e)) return;
    this.applyMove();
    this.liveZones();
  }

  /** Porte l'etat du manche gauche dans les axes, cran de course compris. */
  applyMove() {
    const v = this.moveStick.vec;
    this.axes.right = v.x;
    this.axes.forward = -v.y;          // vers le haut de l'ecran, on avance
    this.sprint = sprinting(v);
    this.syncHold();
  }

  clearStick() {
    this.moveStick.clear();
    this.applyMove();
    this.liveZones();
  }

  // --- manche droit : regard ---

  lookDown(e) {
    if (!this.lookStick.down(e)) return;
    this.last = [e.clientX, e.clientY];
    this.lookStart = [e.clientX, e.clientY, performance.now()];
    this.travel = 0;
    this.liveZones();
  }

  lookMove(e) {
    if (e.pointerId !== this.lookStick.id) return;
    const dx = e.clientX - this.last[0], dy = e.clientY - this.last[1];
    this.last = [e.clientX, e.clientY];
    this.travel += Math.abs(dx) + Math.abs(dy);
    this.lookStick.move(e);
    // Le glissement garde son effet immediat : c'est lui qui permet de viser
    // au pixel, la ou la vitesse du manche sert a se retourner.
    if (this.swipe) this.onLook(dx * LOOK_GAIN, dy * LOOK_GAIN);
  }

  lookUp(e) {
    if (!this.lookStick.up(e)) return;
    this.liveZones();
    // Tape breve et immobile : c'est l'action principale, celle que le jeu
    // met sur E — parler, interagir, faire defiler un dialogue.
    const dt = performance.now() - this.lookStart[2];
    if (this.travel < TAP_PX && dt < TAP_MS) this.onKey("KeyE");
  }

  /**
   * Rotation continue due au manche droit, pour un pas de `dt` secondes.
   *
   * Le regard du jeu se pilote en pixels de souris : la vitesse est donc
   * exprimee dans la meme unite, et rien en aval ne change.
   */
  applyLookRate(dt) {
    const v = this.lookStick && this.lookStick.vec;
    if (!this.rate || !v || !v.mag) return;
    const s = this.rate * lookCurve(v.mag) * dt;
    this.onLook(v.ux * s, v.uy * s);
  }

  /**
   * Boucle du regard. Un manche tenu doit tourner la camera meme quand le
   * doigt ne bouge plus : c'est une VITESSE, donc il faut un battement, et
   * `pointermove` n'en est pas un.
   */
  startLoop() {
    if (this.raf !== null || typeof requestAnimationFrame !== "function") return;
    this.tickAt = performance.now();
    const step = () => {
      this.raf = requestAnimationFrame(step);
      const now = performance.now();
      const dt = Math.min((now - this.tickAt) / 1000, LOOK_MAX_DT);
      this.tickAt = now;
      this.applyLookRate(dt);
    };
    this.raf = requestAnimationFrame(step);
  }

  stopLoop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
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

    for (const a of ACTIONS) {
      const b = this.button(actions, a);
      if (a.key === "boost") this.boostBtn = b;
    }
    for (const t of TOGGLES) this.button(toggles, { ...t, cls: "tc-tog" });
    for (const m of MENU) this.button(this.menuGroup, { ...m, cls: "tc-key " + m.cls });
    for (const m of MAP_KEYS) this.button(this.mapGroup, { ...m, cls: "tc-key " + m.cls });
    this.uiRoot.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /**
   * Axes maintenus : le bouton et le cran de course disent la meme chose, et
   * l'un ne doit pas effacer l'autre. Le bouton « accelerer » s'allume donc
   * aussi quand c'est le manche qui l'a demande.
   */
  syncHold() {
    this.axes.up = this.held.up;
    this.axes.boost = this.held.boost || this.sprint;
    if (this.boostBtn) this.boostBtn.classList.toggle("tc-on", this.axes.boost);
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
      if (spec.hold) { this.held[spec.key] = true; b.classList.add("tc-on"); this.syncHold(); }
      else if (spec.toggle) {
        this.held[spec.key] = !this.held[spec.key];
        this.syncHold();
        b.classList.toggle("tc-on", this.axes[spec.key]);
      } else {
        b.classList.add("tc-on");
        this.onKey(spec.code);
      }
    });
    const up = () => {
      if (spec.hold) { this.held[spec.key] = false; this.syncHold(); b.classList.remove("tc-on"); }
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
      // Le manche droit est lache aussi : sans cela sa vitesse continuerait de
      // tourner la camera derriere le menu.
      this.lookStick.clear();
      this.liveZones();
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
