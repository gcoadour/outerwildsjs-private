// Interface de dialogue.
//
// Proportions et limites tirees de DialogueGUI, rapportees a sa hauteur de
// reference de 1080 :
//
//   fond du dialogue      1200 x 300      nom du personnage   641 x 35
//   zone de texte          641 x 176      zone d'options      504 x 140
//   curseur d'option       504 x 35       bouton de choix     140 x 35
//   corps de police         30
//
//   retour a la ligne : 50 caracteres et 4 lignes pour un personnage,
//                       70 caracteres et 5 lignes pour un panneau de musee
//
// A noter : _countChars sert au retour a la ligne, pas a une revelation
// progressive. Le jeu n'affiche pas le texte caractere par caractere, et je
// n'ajoute donc pas cet effet.

const REF_H = 1080;
// Plancher de lisibilite. En paysage de telephone, la hauteur d'ecran vaut le
// tiers de la reference : les proportions du jeu, appliquees telles quelles,
// donneraient un corps de 7 pixels. On borne donc l'echelle par la LARGEUR
// disponible, et le corps par ce plancher.
const MIN_FONT = 12;
export const LAYOUT = {
  fontSize: 30,
  box: [1200, 300], name: [641, 35], text: [641, 176],
  options: [504, 140], cursor: [504, 35], choice: [140, 35],
  charsPerLine: { character: 50, museumSign: 70 },
  maxLines: { character: 4, museumSign: 5 },
  nextLabel: "Next",
};

/** Retour a la ligne au nombre de caracteres, comme le fait le jeu. */
export function wrap(text, charsPerLine, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > charsPerLine) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return { lines: lines.slice(0, maxLines), overflow: lines.length > maxLines };
}

export class DialogueUI {
  /** @param opts { onChoose(index), onNext() } — le choix au doigt */
  constructor(root, opts = {}) {
    this.root = root;
    this.scale = 1;
    this.cursor = 0;
    this.onChoose = opts.onChoose || null;
    this.onNext = opts.onNext || null;
    this.build();
    addEventListener("resize", () => this.resize());
    this.resize();
  }

  build() {
    const el = (cls) => {
      const d = document.createElement("div");
      d.className = cls;
      return d;
    };
    this.box = el("dlg-box");
    this.name = el("dlg-name");
    this.text = el("dlg-text");
    this.opts = el("dlg-options");
    this.next = el("dlg-next");
    this.next.textContent = LAYOUT.nextLabel;
    // « Next » est aussi un bouton : au doigt, il n'y a pas de touche E.
    this.next.addEventListener("click", () => { if (this.onNext) this.onNext(); });
    this.box.append(this.name, this.text, this.opts, this.next);
    this.root.append(this.box);
    this.root.hidden = true;
  }

  /**
   * Les proportions du jeu sont conservees, mises a l'echelle de la fenetre.
   *
   * Deux bornes s'y ajoutent, pour l'ecran large et bas d'un telephone tenu en
   * paysage : la boite ne depasse jamais la largeur disponible, et le corps de
   * police ne descend pas sous `MIN_FONT`.
   */
  resize() {
    const byHeight = Math.min(1, innerHeight / REF_H) * 1.35;
    const byWidth = (innerWidth - 32) / LAYOUT.box[0];
    this.scale = Math.min(byHeight, byWidth);
    const px = (v) => `${Math.round(v * this.scale)}px`;
    this.box.style.width = px(LAYOUT.box[0]);
    this.box.style.minHeight = px(LAYOUT.box[1] * 0.55);
    this.name.style.width = px(LAYOUT.name[0]);
    this.text.style.width = px(LAYOUT.text[0]);
    this.text.style.minHeight = px(LAYOUT.text[1] * 0.5);
    this.opts.style.width = px(LAYOUT.options[0]);
    this.box.style.fontSize =
      `${Math.max(MIN_FONT, Math.round(LAYOUT.fontSize * 0.52 * this.scale))}px`;
  }

  hide() { this.root.hidden = true; }

  /**
   * @param view etat courant du dialogue
   * @param isSign panneau de musee : lignes plus longues
   */
  render(view, isSign = false) {
    if (!view) { this.hide(); return; }
    this.root.hidden = false;
    const kind = isSign ? "museumSign" : "character";
    const { lines, overflow } = wrap(view.line,
      LAYOUT.charsPerLine[kind], LAYOUT.maxLines[kind]);

    this.name.textContent = view.character +
      (view.lineCount > 1 ? `  ${view.lineIndex + 1}/${view.lineCount}` : "");
    this.text.textContent = lines.join("\n") + (overflow ? " …" : "");

    this.opts.textContent = "";
    if (view.options.length) {
      this.cursor = Math.min(this.cursor, view.options.length - 1);
      view.options.forEach((o, i) => {
        const line = document.createElement("div");
        line.className = "dlg-option" + (i === this.cursor ? " dlg-sel" : "");
        line.textContent = `${i + 1}. ${o.text || "…"}`;
        // viser l'option directement : c'est le seul choix possible au doigt
        line.addEventListener("click", () => {
          this.cursor = i;
          if (this.onChoose) this.onChoose(i);
        });
        this.opts.append(line);
      });
      this.next.hidden = true;
    } else {
      this.next.hidden = false;
    }
  }

  moveCursor(delta, count) {
    if (!count) return;
    this.cursor = (this.cursor + delta + count) % count;
  }
}
