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

// @lit GUIMode, PromptManager, PlayerResourceGUI, HUDCameraScript
// Les quatre modes d'affichage, le catalogue d'invites et les jauges.

export const HUD_EVENTS = {
  changeGUIMode: "ChangeGUIMode",
  addScreenPrompt: "AddScreenPrompt",
  removeScreenPrompt: "RemoveScreenPrompt",
};

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
 * Le panneau des jauges tel que la scene le pose (`panneauRessources`, dans
 * pipeline/extract/interface.js) : repli mesure, pour une extraction qui ne
 * l'a pas encore.
 */
export const PANNEAU_REPLI = {
  position: [0.16, 0.084, 0.13578], scale: [0.04, 0.03], mirrorX: true, fov: 80,
  couleurs: {
    ResourcesHUD: [0, 0, 0, 1],
    HUDLayer1OuterBars: [1, 1, 1, 1],
    HUDPlayerHealth: [1, 1, 1, 0.498],
    HUDLayer2OxyBar: [0.2314, 0.7765, 0.3412, 0.1765],
    HUDLayer2FuelBar: [0.9137, 0.7725, 0.3412, 0.1765],
  },
};

/** Un `_Color` d'Unity en couleur CSS. */
export function couleurCSS([r, g, b, a = 1]) {
  const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${+a.toFixed(3)})`;
}

/** `MinimapHUD`, repli mesure : sous les jauges, a droite. */
export const MINIMAP_REPLI = {
  position: [0.162, -0.075, 0.13578], scale: [0.04, 0.04], mirrorX: true, fov: 80,
};

/**
 * Le rectangle d'ecran du panneau, en fractions de la largeur et de la
 * hauteur, pour un rapport largeur / hauteur donne.
 *
 * Le panneau est le carre local [-1, 1]² de `ResourcesHUD`, projete par la
 * camera du HUD (perspective, champ VERTICAL `fov`) : il vit a une profondeur
 * fixe, sa taille a l'ecran suit donc la hauteur, et sa place horizontale
 * suit le rapport. Mesure dans l'alpha en 1280 x 720 : jauges de y 35 a 158,
 * oxygene centre vers x 1 072, silhouette vers 1 208 — et la projection rend
 * 39 a 152, 1 072 et 1 208 (docs/132).
 */
export function rectPanneau(panel = PANNEAU_REPLI, aspect = 16 / 9) {
  const [x, y, z] = panel.position;
  const t = Math.tan((panel.fov * Math.PI) / 360);
  const nx = (v) => v / (z * t * aspect), ny = (v) => v / (z * t);
  const [sx, sy] = panel.scale;
  return {
    left: (1 + nx(x - sx)) / 2,
    width: (nx(x + sx) - nx(x - sx)) / 2,
    top: (1 - ny(y + sy)) / 2,
    height: (ny(y + sy) - ny(y - sy)) / 2,
    mirrorX: !!panel.mirrorX,
  };
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
    const couleurs = { ...PANNEAU_REPLI.couleurs,
                       ...((this.r.panel && this.r.panel.couleurs) || {}) };
    const plein = (src, cls) => {
      const img = el(cls, "img");
      img.src = DIR + src;
      this.box.appendChild(img);
      return img;
    };

    // LE PANNEAU EST UNE PILE DE QUADS, pas trois images decoupees
    // (docs/132). Du fond vers l'avant :
    //
    //   ResourcesHUD         ResourceBar_Layer01, teinte NOIR : des lignes de
    //                        balayage sombres sous les jauges et la silhouette
    //   HUDLayer2*Bar        deux aplats sans texture, vert et ambre a 0,18
    //   HUDLayer1OuterBars   ResourceBar_Layer1 en blanc : les deux cadres
    //   HUDPlayerHealth      la silhouette, blanche a 0,5
    //
    // Le portage decoupait les cadres dans la planche et les serrait a la
    // largeur des remplissages, remplissait d'un degrade et posait la
    // silhouette presque opaque : des jauges vides, etroites, et une
    // silhouette claire la ou l'alpha la montre sombre.
    if (t.layer0) {
      this.fond = plein(t.layer0, "ow-res-plein");
      // `c = tex x _Color` : le noir garde l'alpha de la texture.
      this.fond.style.filter = "brightness(0)";
    }
    const bar = (nom) => {
      const wrap = el("ow-bar");
      const fill = el("ow-bar-fill");
      fill.style.background = couleurCSS(couleurs[nom]);
      wrap.appendChild(fill);
      this.box.appendChild(wrap);
      return { wrap, fill };
    };
    this.oxygen = bar("HUDLayer2OxyBar");
    this.fuel = bar("HUDLayer2FuelBar");
    if (t.layer1) this.cadres = plein(t.layer1, "ow-res-plein");

    this.health = el("ow-health", "img");
    this.health.src = DIR + t.health[3];
    this.health.style.opacity = String(couleurs.HUDPlayerHealth[3]);
    this.box.appendChild(this.health);

    this.vignette = el("ow-vignette", "img");
    this.vignette.src = DIR + t.vignette;
    this.vignette.style.opacity = "0";

    this.warnings = el("ow-warn");

    root.appendChild(this.box);
    root.appendChild(this.vignette);
    root.appendChild(this.warnings);
    this.place();
    // Le panneau suit le rapport de la fenetre : sa place horizontale en
    // depend, sa taille non.
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", () => this.place());
    }
  }

  /**
   * Repartit les trois elements dans l'espace local du panneau, x et y en
   * [-1, 1], et pose le panneau la ou la camera du HUD le voit. `ResourcesHUD`
   * est tourne d'un demi-tour : son x local part vers la GAUCHE de l'ecran,
   * et l'oxygene (x = 0,577) se retrouve a gauche de la silhouette.
   */
  place() {
    const L = this.r.layout;
    const R = rectPanneau(this.r.panel || PANNEAU_REPLI,
                          (window.innerWidth || 16) / (window.innerHeight || 9));
    const sens = R.mirrorX ? -1 : 1;
    const pct = (v) => `${(v + 1) * 50}%`;
    // Les variables CSS, et non le style du panneau : la mise en page tactile
    // garde la sienne (style.css).
    const st = this.box.style;
    st.setProperty("--res-left", `${R.left * 100}%`);
    st.setProperty("--res-top", `${R.top * 100}%`);
    st.setProperty("--res-width", `${R.width * 100}%`);
    st.setProperty("--res-height", `${R.height * 100}%`);
    const gauche = (e) => pct(sens * e.x - e.halfWidth);
    const set = (node, e, top, height) => {
      node.style.left = gauche(e);
      node.style.width = `${e.halfWidth * 100}%`;
      node.style.bottom = top;
      node.style.height = height;
    };
    set(this.health, L.health, pct(-L.health.halfHeight), `${L.health.halfHeight * 100}%`);
    for (const [k, e] of [["oxygen", L.oxygen], ["fuel", L.fuel]]) {
      const n = this[k].wrap;
      n.style.left = gauche(e);
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
    // `MasterAlarm` : sous trente pour cent de coque, le vaisseau crie. Le
    // portage affichait un chiffre et rien d'autre (docs/52-casque.md).
    if (this.alarm) warn.push("hull breach");
    // Et la notification en cours, qui s'efface toute seule.
    if (this.notice) warn.push(this.notice);
    if (this.tracker) warn.push(this.tracker);
    this.warnings.textContent = warn.join("\n");

    // OnInstantDamage fixe la vignette a plein puis la laisse s'effacer en une
    // seconde ; l'exposition la maintient a plein tant qu'elle dure
    const a = this.exposed ? 1 : Math.max(0, (this.vignetteUntil - now) / this.r.vignetteFade);
    this.vignette.style.opacity = String(a);
  }

  /**
   * `ReferenceFrameTracker` : la lecture de la cible visee — distance et
   * vitesse d'approche, sur deux lignes, a cote des jauges.
   */
  setTracker(texte) { this.tracker = texte || null; }

  /** `MasterAlarm.TurnOnAlarm` / `TurnOffAlarm`, vus de l'ecran. */
  setAlarm(on) { this.alarm = !!on; }

  /** La notification en cours, ou null. */
  setNotice(texte) { this.notice = texte || null; }

  /** Encaisse un coup : la vignette rouge s'allume puis s'estompe. */
  damage(now) { this.vignetteUntil = now + this.r.vignetteFade; }

  setExposed(on) { this.exposed = !!on; }

  /**
   * `HUDCameraScript` : les jauges sont DESSINEES SUR LA VISIERE.
   *
   * Trois evenements les commandent, et le portage n'en avait aucun :
   *
   *   OnRemoveSuit           _isHUDOn = false, _HUDElements.SetActive(false)
   *   OnHelmetHUDActivated   _isHUDOn = true,  _HUDElements.SetActive(true)
   *   OnChangeGUIMode        le mode cache les efface, en sortir les rend
   *                          a `_isHUDOn` — pas a « visibles »
   *
   * Les deux premiers passent par `GUIMode.IsHiddenMode()` avant d'agir : on
   * n'allume pas des jauges dans un mode qui les cache. Sans combinaison, au
   * village, il n'y a donc PAS d'oxygene ni de carburant a l'ecran — ce qui
   * est la moindre des choses pour un affichage pose sur un casque qu'on ne
   * porte pas.
   *
   * La vignette rouge et les avertissements suivent : ils sont dans le meme
   * `_HUDElements`.
   */
  setHelmetOn(on) {
    const montre = !!on;
    this.box.hidden = !montre;
    this.vignette.hidden = !montre;
    this.warnings.hidden = !montre;
    this.helmetOn = montre;
  }
}

/**
 * Invites contextuelles.
 *
 * @lit PromptManager
 *
 * `PromptManager` tient TROIS listes, et le deuxieme argument
 * d'`AddScreenPrompt` decide laquelle : 0 en bas, 1 au centre, 2 a gauche. Les
 * invites de gauche glissent depuis 400 px a leur apparition, sur une demi-
 * seconde (docs/28-hud.md).
 *
 * LE BAS N'ARBITRE RIEN, et ce portage l'arbitrait. Le build tient
 * `_highestLeftPriority` et `_highestCenterPriority` — recalcules par
 * `AddScreenPrompt` et `RemoveScreenPrompt` a chaque entree et chaque sortie —
 * et il n'existe AUCUN `_highestBottomPriority`. La zone du bas montre donc
 * tout ce qu'on lui donne ; c'est celle des codes de lancement, qu'aucune
 * autre invite ne doit pouvoir chasser.
 *
 * DEUX ALIGNEMENTS, PAS TROIS. `SetAlignment(1)` pour le bas et le centre,
 * `SetAlignment(0)` pour la gauche : la colonne de gauche est ferree a gauche,
 * les deux autres sont centrees.
 *
 * `UpdatePromptDimensions` et `CalculatePromptDimensions` mesurent la PLUS
 * LARGE invite du bas et de la gauche — la colonne prend la largeur de son
 * plus large element, et pas celle du texte courant. Le centre n'en a pas
 * besoin : il n'a qu'une invite a la fois, posee a
 * `_centerPromptScreenPosition`. Ici c'est la mise en page qui s'en charge,
 * et les proportions sont celles du catalogue.
 */
/**
 * `GetHighestPriority(liste)`, et ce qu'on en garde.
 *
 * Le build recalcule ce maximum a chaque ajout et chaque retrait, et n'affiche
 * que les invites qui l'atteignent. C'est ce qui evite que « Parler » et
 * « Embarquer » s'affichent ensemble.
 */
export function maxPriority(list) {
  const top = (list || []).reduce((m, p) => Math.max(m, (p && p.priority) || 0), 0);
  return (list || []).filter((p) => (p.priority || 0) >= top);
}

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
    // Le bas ne garde pas que le maximum : il n'a pas de priorite la plus
    // haute a tenir, et tout ce qu'on lui donne s'affiche.
    const keep = zone === "bottom" ? list : maxPriority(list);

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

/**
 * `ReferenceFrameTracker.OnGUI`, peint : un canevas plein ecran qui execute
 * les commandes de `commandesSuivi` (tracker.js). `GUI.color` teinte les
 * icones blanches : on les peint en `multiply` sur un calque, puis on les
 * pose avec l'alpha de la couleur.
 */
export class SuiviHUD {
  constructor(root, conf) {
    this.c = (conf && conf.suivi) || null;
    this.boutons = (conf && conf.prompts && conf.prompts.buttons) || {};
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ow-suivi";
    root.appendChild(this.canvas);
    this.g = this.canvas.getContext("2d");
    const img = (f) => { if (!f) return null; const i = new Image(); i.src = DIR + f; return i; };
    this.cercle = img(this.c && this.c.cercle);
    this.fleche = img(this.c && this.c.fleche);
    this.lb = img(this.boutons.LeftBumper || this.boutons.LB);
    this.teinte = document.createElement("canvas");
    this.lecture = "";
  }

  /** Une icone blanche, teintee et posee. */
  icone(img, x, y, l, h, couleur, rotation = 0) {
    if (!img || !img.complete || !img.naturalWidth) return;
    const t = this.teinte, tg = t.getContext("2d");
    t.width = Math.max(1, Math.ceil(l)); t.height = Math.max(1, Math.ceil(h));
    tg.clearRect(0, 0, t.width, t.height);
    tg.drawImage(img, 0, 0, t.width, t.height);
    tg.globalCompositeOperation = "source-atop";
    tg.fillStyle = `rgb(${couleur.slice(0, 3).map((v) => Math.round(v * 255)).join(",")})`;
    tg.fillRect(0, 0, t.width, t.height);
    tg.globalCompositeOperation = "multiply";
    tg.drawImage(img, 0, 0, t.width, t.height);
    tg.globalCompositeOperation = "source-over";
    const g = this.g;
    g.save();
    g.globalAlpha = couleur[3];
    if (rotation) {
      g.translate(x, y); g.rotate(rotation * Math.PI / 180);
      g.drawImage(t, -l / 2, -h / 2, l, h);
    } else g.drawImage(t, x, y, l, h);
    g.restore();
  }

  /** @param commandes celles de `commandesSuivi` ; `lecture` le texte a deux lignes */
  draw(commandes, lecture = "") {
    const cv = this.canvas, W = cv.clientWidth | 0, H = cv.clientHeight | 0;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = this.g;
    g.clearRect(0, 0, W, H);
    const rgba = (c) => `rgba(${c.slice(0, 3).map((v) => Math.round(v * 255)).join(",")},${c[3]})`;
    for (const k of commandes || []) {
      if (k.type === "crochets") this.icone(this.cercle, k.x, k.y, k.l, k.h, k.couleur);
      else if (k.type === "fleche") this.icone(this.fleche, k.x, k.y, k.l, k.h, k.couleur, k.rotation);
      else if (k.type === "invite") {
        // `GUIContent(icone LB, " Set Target")`, style de 20 : l'icone a la
        // hauteur de la ligne, puis le texte.
        const taille = (this.c && this.c.policeInvite) || 20;
        g.save();
        g.globalAlpha = k.couleur[3];
        if (this.lb && this.lb.complete && this.lb.naturalWidth) {
          g.drawImage(this.lb, k.x, k.y, taille * 1.2, taille * 1.2);
        }
        g.fillStyle = rgba([...k.couleur.slice(0, 3), 1]);
        g.font = `${taille}px "OW Dialogue", sans-serif`;
        g.textBaseline = "top";
        g.fillText((this.c && this.c.invite) || " Set Target", k.x + taille * 1.2, k.y + 2);
        g.restore();
      } else if (k.type === "lecture" && lecture) {
        const taille = (this.c && this.c.policeLecture) || 18;
        const lignes = lecture.split("\n");
        g.save();
        g.fillStyle = rgba(k.couleur);
        g.font = `${taille}px "OW Dialogue", sans-serif`;
        g.textBaseline = "top";
        const hLigne = taille * 1.15;
        lignes.forEach((l, i) => g.fillText(l, k.x, k.y - hLigne * lignes.length / 2 + i * hLigne));
        g.restore();
      }
    }
  }
}

export class GuiMode {
  constructor() { this.index = 0; }
  get mode() { return GUI_MODES[this.index]; }
  cycle() { this.index = (this.index + 1) % GUI_MODES.length; return this.mode; }
  get full() { return this.index === 0; }
  get debug() { return this.index === 1; }
  get capture() { return this.index === 2; }
  get hidden() { return this.index === 3; }
}

// @lit AutopilotGUI
/**
 * Messages du pilote automatique.
 *
 * `AutopilotGUI` affiche un seul message a la fois, centre, en corps 24, a
 * 200 pixels sous le haut de l'ecran plus sa propre hauteur. Les messages d'etat
 * restent tant que la phase dure ; ceux de fin durent 3 secondes.
 *
 * Les textes sont ceux du jeu, la faute de casse comprise — « autopilot
 * ABORTED », en capitales, est bien ce que le build affiche.
 *
 * `AutopilotGUI.DisplayMessage(texte, couleur, duree)` porte les trois colonnes
 * de ce tableau, et rien de plus :
 *
 *     _readoutStyle.normal.textColor = couleur;
 *     _readoutContent.text = texte;
 *     _displayDuration = duree;  _initDisplayTime = Time.time;
 *     _readoutDimensions = _readoutStyle.CalcSize(_readoutContent);
 *
 * Deux choses s'y lisent. La duree INFINIE des quatre messages d'etat n'est pas
 * une facon de dire « tant que la phase dure » : `Update` les repose a chaque
 * image tant que leur drapeau tient, et ne les efface JAMAIS de lui-meme. Le
 * bandeau ne s'eteint donc que par un message de FIN — celui-la dure trois
 * secondes, puis `_doDisplayReadout` tombe. C'est pourquoi il y a six issues
 * et pas une : sans elles, le dernier « stage 2 » resterait a l'ecran.
 *
 * Et la LARGEUR est mesuree a la pose, pas au rendu : `CalcSize` une fois par
 * message. Le bandeau est centre sur cette largeur-la.
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

/**
 * `IconGenerator.GenerateCrosshair(w, h, couleur, epaisseur)`, que
 * `DebugHUD.Awake` appelle avec (13, 13, blanc a 50 %, 1).
 *
 * Un pixel est colore si sa COLONNE ou sa LIGNE tombe dans la bande
 * `] w/2 - epaisseur, w/2 ]` — division entiere : 13 / 2 = 6. Une croix d'un
 * pixel, donc, de treize de cote. Le portage n'avait aucun reticule :
 * l'alpha n'affiche pourtant rien d'autre en jeu (docs/132).
 *
 * @returns un tableau de booleens, ligne par ligne
 */
export const CROSSHAIR = { width: 13, height: 13, color: [1, 1, 1, 0.5], thickness: 1 };

export function crosshairPixels(w = 13, h = 13, t = 1) {
  const out = [];
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      out.push((i <= cx && i > cx - t) || (j <= cy && j > cy - t));
    }
  }
  return out;
}

/**
 * `LaunchCodePromptController` : l'invite du bas, et combien de temps elle
 * reste. Cinq secondes, jamais plus.
 *
 *   OnLearnLaunchCodes           « Launch Codes Aquired », cinq secondes
 *   Awake, si GetLoopCount() == 2  « Launch Codes Remembered », cinq secondes
 *                                  apres le reveil, puis cinq secondes
 *
 * La DEUXIEME boucle seulement, et pas les suivantes. Le portage la montrait
 * EN PERMANENCE des qu'on connaissait les codes : au clavier, sur le meme
 * parcours, l'alpha n'affiche rien et le portage portait le bandeau tout le
 * long (docs/132).
 */
export const DUREE_INVITE_CODES = 5;

export class InviteCodes {
  constructor() {
    this.texte = null;          // 0 « Aquired », 1 « Remembered », ou null
    this.depuis = -Infinity;
    this.attendre = false;
    this.reveil = 0;
  }

  /** `Awake`, a chaque boucle. `boucle` compte comme le build : 1 d'abord. */
  debutBoucle(boucle, now) {
    this.texte = null;
    this.attendre = boucle === 2;
    this.reveil = now;
  }

  /** `OnLearnLaunchCodes`. */
  apprend(now) {
    this.texte = 0;
    this.depuis = now;
  }

  /** @returns l'indice du texte a montrer, ou null */
  update(now) {
    if (this.attendre) {
      if (now > this.reveil + DUREE_INVITE_CODES) {
        this.texte = 1;
        this.depuis = now;
        this.attendre = false;
      }
    } else if (this.texte !== null && now > this.depuis + DUREE_INVITE_CODES) {
      this.texte = null;
    }
    return this.texte;
  }
}

