// Interface de jeu : jauges de ressources et invites a l'ecran.
//
// Les donnees viennent de data/interface/interface.json, produit par
// tools/14_interface.py, qui rassemble ce que le build eparpille : les textures
// du HUD d'un cote, les mesures et les quarante-six invites du code de l'autre.
//
// Ce qui est authentique et ce qui ne l'est pas, pour qu'on ne s'y trompe pas :
//
//   authentique   les textures, la geometrie RELATIVE des trois elements
//                 (positions et echelles lues sous ResourcesHUD dans la scene),
//                 la formule d'animation des jauges, les quatre paliers de
//                 sante, le seuil d'alerte, les textes et priorites des invites,
//                 leurs trois zones d'ecran et le glissement de 400 px en 0,5 s
//
//   invente       la POSITION A L'ECRAN du panneau de ressources. Le jeu dessine
//                 ces trois elements comme des quads 3D dans le casque, vus par
//                 une HUDCamera dediee ; leur etendue a l'ecran depend de cette
//                 camera, que ce portage ne reproduit pas.

const DIR = "data/interface/";

export async function loadInterface() {
  try {
    const res = await fetch(DIR + "interface.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("interface.json absent :", e.message);
    return null;
  }
}

/**
 * Jauges d'oxygene, de carburant et de sante.
 *
 * PlayerResourceGUI ne dessine pas ces jauges en 2D : il met a l'echelle et
 * repositionne trois objets 3D. On reprend ses deux formules telles quelles,
 * pour une demi-hauteur de quad de 0,61 :
 *
 *   demi-hauteur = 0,61 x fraction        position y = -0,6 + 0,58 x fraction
 *
 * d'ou un bas de jauge a -0,6 - 0,03 x fraction, c'est-a-dire fixe a la
 * precision pres, et un haut qui monte a +0,59 quand la jauge est pleine.
 */
export class ResourceHUD {
  constructor(root, conf) {
    this.conf = conf;
    this.r = conf.resources;
    this.stage = -1;
    this.vignetteUntil = 0;
    this.build(root);
  }

  build(root) {
    const el = (cls, tag = "div") => {
      const d = document.createElement(tag);
      d.className = cls;
      return d;
    };
    this.box = el("ow-res");
    const t = this.r.textures;

    // Chaque jauge est un cadre decoupe dans la planche du jeu, et un
    // remplissage qu'on rogne par le bas.
    const bar = (key, frame) => {
      const wrap = el("ow-bar");
      // Le jeu MET A L'ECHELLE le quad de remplissage, il ne le rogne pas
      // (localScale.y = 0,61 x fraction) : le degrade s'etire donc avec la
      // jauge au lieu d'etre revele par le bas.
      const fill = el("ow-bar-fill", "img");
      fill.src = DIR + t.fill;
      const img = el("ow-bar-frame", "img");
      img.src = DIR + frame;
      wrap.appendChild(fill);
      wrap.appendChild(img);
      this.box.appendChild(wrap);
      return { wrap, fill };
    };

    this.health = el("ow-health", "img");
    this.health.src = DIR + t.health[3];
    this.box.appendChild(this.health);
    this.oxygen = bar("oxygen", t.frameOxygen);
    this.fuel = bar("fuel", t.frameFuel);

    this.vignette = el("ow-vignette", "img");
    this.vignette.src = DIR + t.vignette;
    this.vignette.style.opacity = "0";

    this.warnings = el("ow-warn");

    root.appendChild(this.box);
    root.appendChild(this.vignette);
    root.appendChild(this.warnings);
    this.place();
  }

  /** Repartit les trois elements dans l'espace local du panneau, x et y en [-1, 1]. */
  place() {
    const L = this.r.layout;
    const pct = (v) => `${(v + 1) * 50}%`;
    const set = (node, e, top, height) => {
      node.style.left = pct(e.x - e.halfWidth);
      node.style.width = `${e.halfWidth * 100}%`;
      node.style.bottom = top;
      node.style.height = height;
    };
    set(this.health, L.health, pct(-L.health.halfHeight), `${L.health.halfHeight * 100}%`);
    for (const [k, e] of [["oxygen", L.oxygen], ["fuel", L.fuel]]) {
      const n = this[k].wrap;
      n.style.left = pct(e.x - e.halfWidth);
      n.style.width = `${e.halfWidth * 100}%`;
      n.style.bottom = pct(this.r.barBaseY);
      n.style.height = `${e.halfHeight * 2 * 50}%`;
    }
  }

  /**
   * @param res  { oxygen, fuel, health } en fractions de 0 a 1
   * @param now  temps de jeu, pour l'estompage de la vignette
   */
  update(res, now) {
    for (const k of ["oxygen", "fuel"]) {
      const f = Math.max(0, Math.min(1, res[k]));
      // la jauge grandit vers le haut depuis un bas fixe
      this[k].fill.style.height = `${f * 100}%`;
    }
    const h = Math.max(0, Math.min(1, res.health));
    const stages = this.r.healthStages;
    let s = 0;
    while (s < stages.length - 1 && h > stages[s]) s += 1;
    if (s !== this.stage) {
      this.health.src = DIR + this.r.textures.health[s];
      this.stage = s;
    }

    // L'ordre est celui du jeu, pas l'ordre d'ecriture : PlayerResourceGUI pose
    // les trois etiquettes a -25, 0 et +25 du centre, et l'axe y de GUI descend.
    // L'oxygene est donc la plus haute, le carburant la plus basse.
    const low = this.r.lowThreshold;
    const warn = [];
    if (res.oxygen < low) warn.push("low oxygen");
    if (res.health < low) warn.push("low health");
    if (res.fuel < low) warn.push("low fuel");
    this.warnings.textContent = warn.join("\n");

    // OnInstantDamage fixe la vignette a plein puis la laisse s'effacer en une
    // seconde ; l'exposition la maintient a plein tant qu'elle dure
    const a = this.exposed ? 1 : Math.max(0, (this.vignetteUntil - now) / this.r.vignetteFade);
    this.vignette.style.opacity = String(a);
  }

  /** Encaisse un coup : la vignette rouge s'allume puis s'estompe. */
  damage(now) { this.vignetteUntil = now + this.r.vignetteFade; }

  setExposed(on) { this.exposed = !!on; }
}

/**
 * Invites contextuelles.
 *
 * PromptManager tient trois listes. Au centre et a gauche, seules les invites
 * de priorite maximale restent visibles : c'est ce qui evite que « Parler » et
 * « Embarquer » s'affichent ensemble. Les invites de gauche glissent depuis
 * 400 px a leur apparition, sur une demi-seconde.
 */
export class Prompts {
  constructor(root, conf) {
    this.c = conf.prompts;
    this.zones = {};
    this.shown = new Map();   // cle -> instant d'apparition, pour le glissement
    for (const z of ["center", "bottom", "left"]) {
      const d = document.createElement("div");
      d.className = "ow-prompts ow-prompts-" + z;
      root.appendChild(d);
      this.zones[z] = d;
    }
    this.catalogue = new Map();
    for (const p of this.c.catalogue) {
      if (p.text) this.catalogue.set(`${p.owner}.${p.field}`, p);
    }
  }

  /** Invite du catalogue, par « Classe.champ ». */
  get(key) { return this.catalogue.get(key) || null; }

  /**
   * Remplace le contenu d'une zone.
   * @param items  [{ text, priority }] ; seules les priorites maximales restent
   */
  set(zone, items, now) {
    const node = this.zones[zone];
    if (!node) return;
    const list = (items || []).filter((p) => p && p.text);
    const top = list.reduce((m, p) => Math.max(m, p.priority || 0), 0);
    const keep = list.filter((p) => (p.priority || 0) >= top);

    const seen = new Set();
    node.textContent = "";
    for (const p of keep) {
      const key = zone + "|" + p.text;
      seen.add(key);
      if (!this.shown.has(key)) this.shown.set(key, now);
      const d = document.createElement("div");
      d.className = "ow-prompt";
      // ScreenPrompt pose l'icone de manette DANS le contenu, avant le texte,
      // et prefixe celui-ci d'une espace pour l'en degager. Le portage se joue
      // au clavier, mais l'icone dit quel bouton le jeu attendait.
      const icon = p.button && this.c.buttons && this.c.buttons[p.button];
      if (icon) {
        const img = document.createElement("img");
        img.className = "ow-prompt-btn";
        img.src = DIR + icon;
        d.appendChild(img);
      }
      d.appendChild(document.createTextNode(" " + p.text));
      if (zone === "left") {
        const k = 1 - Math.min(1, (now - this.shown.get(key)) / this.c.slideDuration);
        d.style.transform = `translateX(${-k * this.c.slideDistance}px)`;
      }
      node.appendChild(d);
    }
    for (const k of [...this.shown.keys()]) {
      if (k.startsWith(zone + "|") && !seen.has(k)) this.shown.delete(k);
    }
  }
}

/**
 * Modes d'affichage.
 *
 * `GUIMode` fait tourner quatre modes sur une touche de debogage : complet,
 * debogage, capture, masque. Ils ne changent pas ce qui est calcule, seulement
 * ce qui est dessine — `PromptManager` ne dessine ni le bas ni la gauche en mode
 * capture, et rien du tout en mode masque, et `AutopilotGUI` se tait dans les
 * deux.
 */
export const GUI_MODES = ["complet", "debogage", "capture", "masque"];

export class GuiMode {
  constructor() { this.index = 0; }
  get mode() { return GUI_MODES[this.index]; }
  cycle() { this.index = (this.index + 1) % GUI_MODES.length; return this.mode; }
  get full() { return this.index === 0; }
  get debug() { return this.index === 1; }
  get capture() { return this.index === 2; }
  get hidden() { return this.index === 3; }
}

/**
 * Messages du pilote automatique.
 *
 * `AutopilotGUI` affiche un seul message a la fois, centre, en corps 24, a
 * 200 pixels sous le haut de l'ecran plus sa propre hauteur. Les messages d'etat
 * restent tant que la phase dure ; ceux de fin durent 3 secondes.
 *
 * Les textes sont ceux du jeu, la faute de casse comprise — « autopilot
 * ABORTED », en capitales, est bien ce que le build affiche.
 */
export const AUTOPILOT_MESSAGES = {
  alignement: ["stage 1: aligning flight path", "#00ff00", Infinity],
  vol: ["stage 2: accelerating towards destination", "#00ff00", Infinity],
  approche: ["stage 3: firing retro-rockets", "#00ff00", Infinity],
  egalisation: ["matching target velocity", "#00ff00", Infinity],
  arrive: ["autopilot complete", "#00ff00", 3],
  arriveCourt: ["autopilot complete - undershot target", "#00ff00", 3],
  abandon: ["autopilot ABORTED", "#ff0000", 3],
  abandonVitesse: ["velocity match ABORTED", "#ff0000", 3],
  tropPres: ["too close to target", "#ff0000", 3],
  vitesseAtteinte: ["velocity match complete", "#00ff00", 3],
};

export class AutopilotReadout {
  constructor(root) {
    this.el = document.createElement("div");
    this.el.className = "ow-autopilot";
    this.el.hidden = true;
    root.appendChild(this.el);
    this.until = 0;
  }

  /** Affiche un message du catalogue, par sa cle. */
  show(key, now) {
    const m = AUTOPILOT_MESSAGES[key];
    if (!m) return;
    this.el.textContent = m[0];
    this.el.style.color = m[1];
    this.until = m[2] === Infinity ? Infinity : now + m[2];
  }

  update(now, visible = true) {
    this.el.hidden = !visible || now > this.until;
  }

  clear() { this.until = 0; }
}
