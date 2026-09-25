// Reglages.
//
// `SettingsMenu` propose sept options. Cinq portent sur quelque chose que ce
// portage possede, une ferme le menu, et la derniere — « Exit to Main Menu » —
// est verrouillee faute de menu principal, comme le jeu la verrouille lui-meme
// au niveau 0.
//
// Les valeurs viennent d'`Axis` et de `SettingsSave` :
//
//   facteur d'inversion   1 par defaut, bascule a -1
//   sensibilite           5 par defaut, entier de 1 a 10, EN ANNEAU
//   axe = brut x inversion x sensibilite / 5
//
// L'anneau compte : depasser 10 ramene a 1, pas a 10. Et 5 est le neutre, ce
// que la division par 5 rend explicite.
//
// Les reglages ont leur PROPRE sauvegarde dans le jeu (`SettingsSave`, distincte
// de la sauvegarde de partie) : effacer sa partie ne remet pas la sensibilite a
// zero. Le portage garde cette separation, et la boucle temporelle non plus n'y
// touche pas.
//
// @lit SettingsMenuTrigger
//
// `SettingsMenuTrigger.Update` tient DEJA dans le portage, et ne s'y voyait
// pas : le canal `Pause` bascule le menu, et `Time.timeScale` passe a zero —
// ici, le `dt` de la boucle vaut zero tant que le menu est ouvert. La classe
// etait donc lue sans etre nommee, ce que le recensement ne peut pas deviner
// (docs/65-onde.md).

// @lit SettingsMenu, Menu, LoadTimeTracker
// @autrement LoadTimeTracker : mesure du temps de chargement des scenes Unity
// Les sept options de `SettingsMenu`, et ce que chacune commande.
//
// `SettingsMenu.UpdateOptionText` ecrit les sept libelles, et `Open` / `Close`
// ne font presque rien d'autre que ce que le portage faisait deja :
//
//     Open(parent)    if (loadedLevel != 0) Time.timeScale = 0;  base.Open(parent)
//     Close()         if (loadedLevel != 0) { Screen.showCursor = false;
//                                             Screen.lockCursor = true;
//                                             Time.timeScale = 1; }  base.Close()
//
// LA PAUSE ETAIT PORTEE ; LE CURSEUR NON. Fermer le menu REPREND la souris, et
// c'est le pendant d'une regle qu'on ne trouve pas dans `SettingsMenu` mais
// dans `Menu.Update` : le curseur n'apparait pas a l'ouverture, il apparait
// quand la souris BOUGE (voir `MenuInput` ci-dessous).

export const MENU_EVENTS = {
  loadFromMenu: "LoadFromMenu",
};

const KEY = "outerwilds.settings";

/**
 * Les constantes de `Menu` — la classe de base, que `SettingsMenu` etend et
 * dont le portage n'avait porte que la navigation.
 */
export const MENU = {
  // `Menu.SELECT_DELAY`. Toutes les cadences du menu valent 0,2 s.
  selectDelay: 0.2,
  // DEUX SEUILS, et ils different : 0,2 sur `moveZ` pour NAVIGUER, 0,5 sur
  // `moveX` pour CHANGER une valeur. Changer demande donc un geste plus franc
  // que parcourir — on ne modifie pas un reglage en effleurant le manche.
  moveThreshold: 0.2,
  toggleThreshold: 0.5,
  // `Vector3.Distance(Input.mousePosition, _lastMousePos) > 0.1f` : le menu
  // passe a la souris des qu'elle bouge d'un dixieme de pixel.
  mouseWake: 0.1,
};

/**
 * `Menu.Update`, sa cadence et ses trois facons de valider.
 *
 * QUATRE HORLOGES, PAS UNE. `_lastAxisUpTime`, `_lastAxisDownTime`,
 * `_lastAxisLeftTime` et `_lastAxisRightTime` sont des champs distincts :
 * monter puis descendre dans la foulee ne coute rien, tandis que monter deux
 * fois demande 0,2 s. C'est ce qui rend un aller-retour vif et une repetition
 * reguliere, et une seule horloge partagee l'aurait rate.
 *
 * ET ELLES COMPTENT EN TEMPS REEL. `Time.realtimeSinceStartup`, pas
 * `Time.time` : `Open` vient de poser `timeScale = 0`, et un menu cadence sur
 * l'horloge du jeu serait fige avec lui. Le portage mesurait l'appui clavier,
 * dont la repetition automatique du navigateur tourne a trente millisecondes —
 * six fois trop vite.
 */
export class MenuInput {
  constructor(cfg = MENU) {
    this.cfg = cfg;
    // -Infini : le premier geste passe toujours.
    this.horloges = { haut: -Infinity, bas: -Infinity,
                      gauche: -Infinity, droite: -Infinity };
    // `_mouseActive = Screen.showCursor` a l'ouverture : faux, puisque le jeu
    // tourne souris prise. Le survol ne choisit donc rien tant qu'on n'a pas
    // bouge la souris au moins une fois.
    this.mouseActive = false;
  }

  /**
   * @param now     secondes de temps REEL (que la pause ne fige pas)
   * @param moveZ   axe avant/arriere, brut
   * @param moveX   axe gauche/droite, brut
   * @param verrouillee l'option courante est-elle verrouillee
   * @returns { move: -1|0|1, toggle: -1|0|1 }
   */
  axes(now, moveZ = 0, moveX = 0, verrouillee = false) {
    const c = this.cfg;
    let move = 0;
    // `Menu.Update` teste le HAUT d'abord, et n'essaie le bas que si le haut
    // n'a rien donne : les deux ne partent jamais ensemble.
    if (moveZ > c.moveThreshold) {
      if (now > this.horloges.haut + c.selectDelay) {
        move = -1; this.horloges.haut = now;
      }
    } else if (moveZ < -c.moveThreshold) {
      if (now > this.horloges.bas + c.selectDelay) {
        move = 1; this.horloges.bas = now;
      }
    }
    // UNE OPTION VERROUILLEE N'ACCEPTE RIEN. Le bloc entier de validation est
    // saute — on peut la survoler, pas l'actionner.
    let toggle = 0;
    if (!verrouillee) {
      if (moveX > c.toggleThreshold) {
        if (now > this.horloges.droite + c.selectDelay) {
          toggle = 1; this.horloges.droite = now;
        }
      } else if (moveX < -c.toggleThreshold) {
        if (now > this.horloges.gauche + c.selectDelay) {
          toggle = -1; this.horloges.gauche = now;
        }
      }
    }
    return { move, toggle };
  }

  /**
   * La souris qui se reveille : au-dela d'un dixieme de pixel, le curseur
   * reparait et le verrou tombe.
   *
   *   if (Distance(mousePosition, _lastMousePos) > 0.1f) {
   *       Screen.lockCursor = false; Screen.showCursor = true;
   *       _mouseActive = true; }
   *
   * Rien ne la rendort : `_mouseActive` ne retombe qu'a la prochaine
   * ouverture, ou `Menu.Open` le relit sur `Screen.showCursor` — que `Close`
   * vient de remettre a faux.
   */
  souris(distance) {
    if (!(distance > this.cfg.mouseWake)) return false;
    const reveil = !this.mouseActive;
    this.mouseActive = true;
    return reveil;
  }

  /** `Menu.Open` : `_mouseActive = Screen.showCursor`. */
  reouvre(curseurVisible = false) {
    this.mouseActive = !!curseurVisible;
  }
}

export class Settings {
  /**
   * @param niveau  `Application.loadedLevel` : 0 a l'ecran-titre, 1 en partie.
   *                La septieme option en depend (voir `label` et `toggle`).
   */
  constructor(conf, { niveau = 1 } = {}) {
    const c = (conf && conf.settings) || {};
    this.niveau = niveau;
    // `SettingsMenu.UpdateOptionText` et `ToggleOption`, septieme option :
    //
    //     loadedLevel != 0   « Exit to Main Menu » ; valider fait
    //                        Time.timeScale = 1 puis LoadLevel(0)
    //     loadedLevel == 0   String.Empty ; valider ne fait rien
    //
    // Elle n'est donc verrouillee NULLE PART : le portage la verrouillait
    // « faute de menu principal », et il en a un desormais
    // (docs/131-ecran-titre.md). Une extraction ancienne la marque encore
    // verrouillee ; on relit la regle ici plutot que la donnee.
    this.options = (c.options || []).map((o) => (o.key === "exit"
      ? { ...o, locked: false, label: niveau === 0 ? "" : "Exit to Main Menu" } : o));
    this.colors = c.colors || {};
    this.bounds = c.sensitivity || { default: 5, min: 1, max: 10, neutral: 5 };
    const d = this.bounds.default;
    this.values = {
      invertY: (c.inversion || {}).default === -1,
      lookSensitivity: d,
      flightSensitivity: d,
      brightness: false,
      shadows: true,
    };
    this.layoutConf = c.layout || null;
    this.index = 0;
    this.open = false;
    // LA NOUVELLE PARTIE, ET POURQUOI ELLE EST ICI.
    //
    // `PlayerData.CreateNewPlayerSave` efface la sauvegarde. Dans le build, on
    // ne l'atteint que par le menu-titre : `TitleScreenMenu.ToggleOption`
    // appelle `TriggerLoad(true, false)` sur sa premiere option et
    // `TriggerLoad(true, true)` sur sa troisieme, qui accorde en plus les cinq
    // savoirs. Le portage n'a pas de menu-titre — `SettingsMenu` verrouille sa
    // propre « Exit to Main Menu » pour cette raison — et le seul menu qu'il
    // ait est celui-ci.
    //
    // C'est donc un AJOUT, et il est nomme comme tel. Il demande DEUX
    // validations, ce que le build ne fait pas : la ou une nouvelle partie se
    // choisit depuis un ecran-titre, elle est ici a une touche d'une partie en
    // cours, et effacer sa progression ne se defait pas.
    // Au titre, la nouvelle partie est la premiere ligne du menu-titre : l'ajout
    // n'y a pas lieu d'etre.
    if (niveau !== 0 && !this.options.some((o) => o.key === "newGame")) {
      this.options = [...this.options, { key: "newGame", label: "%s",
                                         states: ["Nouvelle partie",
                                                  "Nouvelle partie : confirmer"],
                                         ajout: true }];
    }
    this.confirmNewGame = false;
    this.load();
  }

  /**
   * `SettingsMenu.Open` puis `Menu.Open(null)`.
   *
   * La pause est ailleurs — le `dt` de la boucle vaut zero tant que
   * `this.open` est vrai —, et ce qui manquait est l'annonce : `Menu.Open`
   * leve `EnterMenuMode` quand il n'a pas de menu parent, ce qui est le cas
   * du seul menu de ce portage.
   *
   * @returns les annonces du build
   */
  ouvre() {
    this.open = true;
    this.confirmNewGame = false;
    return ["EnterMenuMode"];
  }

  /**
   * `SettingsMenu.Close` : le curseur REPRIS, puis `Menu.Close` et son annonce.
   *
   * L'appelant doit reverrouiller la souris — c'est la moitie du travail de
   * cette methode dans le build, et la seule qu'un module sans DOM ne peut pas
   * faire lui-meme.
   */
  ferme() {
    this.open = false;
    this.confirmNewGame = false;
    return ["ExitMenuMode"];
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      for (const k of Object.keys(this.values)) {
        if (raw[k] !== undefined) this.values[k] = raw[k];
      }
    } catch (e) { /* stockage indisponible */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); }
    catch (e) { /* quota ou mode prive */ }
  }

  /** Facteur applique a un axe : inversion x sensibilite / 5. */
  lookFactor() {
    return (this.values.invertY ? -1 : 1) *
           this.values.lookSensitivity / this.bounds.neutral;
  }

  /**
   * L'autre sensibilite, celle des commandes de VOL.
   *
   * L'inversion s'y applique aussi : le menu du build ne pose qu'un seul
   * `invertY`, et il vaut pour les deux. La rendre ici plutot qu'a l'appel
   * evite que les deux facteurs divergent — c'est ce qui les rend comparables.
   */
  flightFactor() {
    return (this.values.invertY ? -1 : 1) *
           this.values.flightSensitivity / this.bounds.neutral;
  }

  /** Sensibilite suivante, en anneau : 10 puis 1. */
  step(v, dir) {
    const { min, max } = this.bounds;
    let n = v + (dir >= 0 ? 1 : -1);
    if (n > max) n = min;
    if (n < min) n = max;
    return n;
  }

  move(delta) {
    // Quitter la ligne desarme la confirmation : on ne laisse pas une
    // « Nouvelle partie » armee derriere soi.
    this.confirmNewGame = false;
    const n = this.options.length;
    if (!n) return;
    let i = this.index;
    do {
      i = (i + delta + n) % n;
    } while (this.options[i].locked && i !== this.index);
    this.index = i;
  }

  /** @param dir 0 = valider, -1/+1 = changer la valeur */
  toggle(dir = 0) {
    const o = this.options[this.index];
    if (!o || o.locked) return null;
    switch (o.key) {
      // `Back` appelle `Close()`, qui reprend la souris et releve la pause :
      // la sortie par l'option et la sortie par `cancel` sont le meme chemin.
      case "back": this.ferme(); return "back";
      case "newGame":
        if (!this.confirmNewGame) { this.confirmNewGame = true; return null; }
        this.ferme();
        return "newGame";
      // `if (dir == 0 && loadedLevel != 0) { timeScale = 1; LoadLevel(0); }`
      case "exit":
        if (dir !== 0 || this.niveau === 0) return null;
        this.ferme();
        return "exit";
      case "invertY": this.values.invertY = !this.values.invertY; break;
      case "lookSensitivity":
      case "flightSensitivity":
        this.values[o.key] = this.step(this.values[o.key], dir);
        break;
      case "brightness": this.values.brightness = !this.values.brightness; break;
      case "shadows": this.values.shadows = !this.values.shadows; break;
      default: return null;
    }
    this.save();
    return o.key;
  }

  /** Libelle d'une option, au format du jeu. */
  label(o) {
    if (!o.label.includes("%")) return o.label;
    if (o.states) {
      const on = o.key === "invertY" ? this.values.invertY
        : o.key === "brightness" ? this.values.brightness
          : o.key === "newGame" ? this.confirmNewGame
            : this.values.shadows;
      return o.label.replace("%s", o.states[on ? 1 : 0]);
    }
    return o.label.replace("%d", String(this.values[o.key]));
  }
}

/**
 * Rendu du menu, a la disposition du build.
 *
 * La racine du menu est en coordonnees d'ecran (0,5 ; 0,8) — centree
 * horizontalement, aux quatre cinquiemes de la hauteur. Les options n'ont PAS
 * de position propre : leur transformation est a l'origine et c'est leur
 * `GUIText` qui porte un decalage en pixels, de -70 pour la premiere a -370 pour
 * la septieme, par pas de 50. Le titre « Settings » est a l'origine, en corps
 * 42 ; les options en corps 30.
 *
 * Le fond est une `GUITexture` (`LocationText_BG`) posee a (0 ; -0,26) de la
 * racine, aux dimensions (0,36 ; 0,81) de l'ecran, en gris a 50 %.
 */
export class SettingsUI {
  /** @param opts { onPick() } — appele apres un choix a la souris ou au doigt */
  constructor(root, settings, dir = "data/interface/", opts = {}) {
    this.s = settings;
    this.dir = dir;
    this.onPick = opts.onPick || null;
    this.el = document.createElement("div");
    this.el.className = "ow-settings";
    this.el.hidden = true;
    root.appendChild(this.el);
    this.build();
    addEventListener("resize", () => this.place());
  }

  get layout() {
    return (this.s.layoutConf) || {
      anchor: [0.5, 0.8], firstOffset: -70, step: -50, fontSize: 30,
      title: { text: "Settings", fontSize: 42, offset: [0, 0] },
    };
  }

  build() {
    const L = this.layout;
    if (L.background) {
      this.bg = document.createElement("img");
      this.bg.className = "ow-settings-bg";
      this.bg.src = this.dir + L.background.texture;
      this.el.appendChild(this.bg);
    }
    this.title = document.createElement("div");
    this.title.className = "ow-setting ow-settings-title";
    this.title.textContent = (L.title || {}).text || "Settings";
    this.el.appendChild(this.title);
    this.rows = this.s.options.map((o, i) => {
      const d = document.createElement("div");
      d.className = "ow-setting";
      // Le jeu ne connait que le curseur ; viser une ligne revient a s'y
      // placer puis a valider, ce que la souris comme le doigt savent faire.
      d.addEventListener("click", () => {
        if (o.locked) return;
        this.s.index = i;
        const r = this.s.toggle(0);
        if (this.onPick) this.onPick(r);
        this.render();
      });
      // `Menu.Update` : `GetMouseButtonDown(1)` appelle `ToggleOption(-1)`.
      // Le bouton DROIT recule la valeur — c'est la seule facon de baisser une
      // sensibilite a la souris, et le portage n'avait que la montee.
      d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (o.locked) return;
        this.s.index = i;
        this.s.toggle(-1);
        if (this.onPick) this.onPick();
        this.render();
      });
      this.el.appendChild(d);
      return d;
    });
    this.place();
  }

  /** Pose les elements aux decalages du build, en pixels d'ecran. */
  place() {
    const L = this.layout;
    this.el.style.left = `${L.anchor[0] * 100}%`;
    this.el.style.top = `${(1 - L.anchor[1]) * 100}%`;
    const t = (L.title || {});
    this.title.style.fontSize = `${t.fontSize || 42}px`;
    this.title.style.top = `${-((t.offset || [0, 0])[1])}px`;
    this.rows.forEach((d, i) => {
      d.style.fontSize = `${L.fontSize}px`;
      // le decalage du jeu est en coordonnees ou y monte : on l'inverse
      d.style.top = `${-(L.firstOffset + i * L.step)}px`;
    });
    if (this.bg && L.background) {
      const w = innerWidth, h = innerHeight;
      this.bg.style.width = `${L.background.size[0] * w}px`;
      this.bg.style.height = `${L.background.size[1] * h}px`;
      this.bg.style.top = `${-L.background.offset[1] * h}px`;
    }
    // Le menu s'etale sur quelque 400 pixels sous son ancre. Sur un ecran bas
    // — un telephone tenu en paysage — il sortirait par le bas : on le met
    // alors a l'echelle de la place disponible, sans toucher a ses
    // proportions. L'origine est le point d'ancrage, qui reste centre.
    const span = Math.abs(L.firstOffset + (this.rows.length - 1) * L.step) + 60;
    const room = innerHeight * L.anchor[1];
    const k = Math.min(1, room / span);
    this.el.style.transformOrigin = "0 0";
    this.el.style.transform = k < 1 ? `scale(${k.toFixed(3)})` : "";
  }

  /**
   * `Menu.UpdateColor` et `Menu.Suspend(true)`, qui sont la meme image.
   *
   *     UpdateColor()   pour chaque option :
   *         verrouillee     HSV(40, 0,40, 0,15)
   *         selectionnee    HSV(40, 0,50, 0,70)
   *         sinon           HSV(40, 0,50, 0,30)
   *     Suspend(hide)   enabled = false; si hide, chaque GUIText s'eteint
   *
   * Une seule TEINTE pour les trois etats — 40 degres, l'ambre du jeu —, et
   * c'est la VALEUR qui distingue : 0,15 pour une option morte, 0,30 pour une
   * option vivante, 0,70 pour celle qu'on vise. La saturation ne bouge qu'a
   * l'etat verrouille, et de peu. `interface.js` les calcule deja depuis ces
   * trois triplets ; elles ne sont pas ecrites en dur ici.
   *
   * `Suspend` est ce que fait la premiere ligne : le menu ferme cache ses
   * elements plutot que de les detruire — c'est pourquoi `Open` les rallume un
   * a un plutot que de les recreer.
   */
  render() {
    const s = this.s;
    this.el.hidden = !s.open;
    if (!s.open) return;
    this.title.style.color = s.colors.normal;
    s.options.forEach((o, i) => {
      const d = this.rows[i];
      d.textContent = s.label(o);
      d.style.color = o.locked ? s.colors.locked
        : (i === s.index ? s.colors.selected : s.colors.normal);
    });
  }
}
