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

const KEY = "outerwilds.settings";

export class Settings {
  constructor(conf) {
    const c = (conf && conf.settings) || {};
    this.options = c.options || [];
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
    this.load();
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

  flightFactor() {
    return this.values.flightSensitivity / this.bounds.neutral;
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
      case "back": this.open = false; return "back";
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
        this.s.toggle(0);
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
