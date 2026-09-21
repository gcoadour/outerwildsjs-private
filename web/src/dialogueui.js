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
//
// CE QUI MANQUAIT, ET QUI SE COMPTAIT EN APPUIS. Ces quatre nombres ne bornent
// pas une ligne, ils DECOUPENT le texte : `CalculateDisplayableDialogues`
// remplit `_displayableDialogues`, et chaque unite demande un appui de plus.
// Ce module gardait les quatre nombres et coupait a la premiere page, avec un
// « … » pour dire ce qu'il jetait. Vingt-deux des trente-quatre objets
// lisibles du build depassent une page ; la moitie de leur texte n'etait
// affichable nulle part (docs/105-lire.md).
//
// `forceNewLineCharacter` vaut 64, soit `@`, et le build en fait DEUX choses :
// il termine la ligne, et il termine la PAGE (`_countlines == maxLinesToDisplay
// || chars[i] == forceNewLineCharacter`). Vingt-deux des trente-quatre textes
// en portent au moins un, toujours entoure d'espaces.
//
// LES SEPT AUTRES METHODES, ET CE QU'ON EN FAIT. `ShowDialogueBox` annonce
// `EnterDialogueMode` a la premiere boite et se referme aussitot si le texte
// est vide ; `ExitDialogueMode` annonce `ExitDialogueMode` et rearme ce
// premier. Les deux annonces sont lues ailleurs (`modes.js`, `reactaudio.js`),
// et l'etat de mode se deduit ici de `dialogue.active` plutot que d'un drapeau.
//
// `setNoOptionsDimensions`, `setOptionsDimensions`, `DisplayGUIElements`,
// `ShowBox` et `DisplayText` sont de l'IMGUI : elles posent des rectangles a la
// main, image par image, avec des ancres calculees sur la resolution. Ce
// portage en garde les PROPORTIONS — c'est la table ci-dessus — et laisse le
// navigateur poser les rectangles. Redessiner cinq methodes d'IMGUI pour
// obtenir ce qu'une feuille de style fait mieux serait refaire un moteur
// d'interface pour faire baisser un chiffre.
//
// CE QUE CE PORTAGE NE PEUT PAS TENIR : le build coupe aussi la ligne quand sa
// LARGEUR RENDUE atteint celle de la boite (`_promptStyle.CalcSize`). Cette
// mesure-la depend des metriques d'une police qu'Unity choisit lui-meme — le
// champ `_font` est nul — et de la resolution. Le decoupage se fait donc ici au
// compte de caracteres, et la boite du navigateur replie le reste en CSS.

// @lit DialogueGUI
// Proportions, curseur et limites de `DialogueGUI`, rapportees a sa hauteur.

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
  // `forceNewLineCharacter = 64` dans le constructeur.
  forceNewLine: "@",
  nextLabel: "Next",
};

/**
 * `CalculateDisplayableDialogues` : le texte en PAGES, pas en une seule.
 *
 *     _dialogueToDisplay = Regex.Replace(_dialogueToDisplay, "\r\n?|\n", " ");
 *     _dialogueToDisplay = _dialogueToDisplay.Trim();
 *     ... pour chaque espace, on regarde le mot suivant en entier ...
 *         si _countChars >= maxCharsPerLine || largeur rendue >= largeur boite
 *             on retire l'espace, on passe a la ligne, _countChars = 0
 *     si _countlines == maxLinesToDisplay || c == forceNewLineCharacter
 *         _displayableDialogues[_numDisplayableUnits++] = ce qu'on a
 *
 * Trois choses s'y lisent, et la premiere est la seule qui compte vraiment :
 *
 *   - le texte est **un paragraphe**. Les retours a la ligne d'origine sont
 *     remplaces par des espaces avant toute mise en page, ce qui veut dire que
 *     les `\r\n` des panneaux ne sont PAS des sauts de ligne a l'affichage ;
 *   - la coupure se fait **a un espace**, jamais au milieu d'un mot : le build
 *     regarde le mot suivant en entier avant de decider ;
 *   - `@` termine la ligne ET la page.
 *
 * @returns {Array<Array<string>>} les pages, chacune une liste de lignes
 */
export function paginate(text, charsPerLine, maxLines) {
  const plat = String(text || "").replace(/\r\n?|\n/g, " ").trim();
  const pages = [];
  let lignes = [];
  let cur = "";
  const finPage = () => {
    if (cur) { lignes.push(cur); cur = ""; }
    if (lignes.length) pages.push(lignes);
    lignes = [];
  };
  for (const bloc of plat.split(LAYOUT.forceNewLine)) {
    for (const mot of bloc.split(/\s+/).filter(Boolean)) {
      if (cur && cur.length + 1 + mot.length > charsPerLine) {
        lignes.push(cur);
        cur = "";
        if (lignes.length >= maxLines) finPage();
      }
      cur = cur ? `${cur} ${mot}` : mot;
    }
    finPage();
  }
  return pages;
}

export class DialogueUI {
  /** @param opts { onChoose(index), onNext(), reserveOf() } — le choix au doigt */
  constructor(root, opts = {}) {
    this.root = root;
    this.scale = 1;
    this.cursor = 0;
    // Place prise a droite par un amas de boutons qui recouvre la boite. Le
    // losange d'action tactile est plus haut qu'elle (z-index 8 contre 6) : ce
    // qui passe dessous ne se touche pas, et c'est le « Next » qui y tombait.
    //
    // C'est une FONCTION et non un nombre : la place se mesure sur la couche
    // au moment ou l'on redimensionne, elle ne s'ecrit pas ici. Nulle au
    // clavier, ou rien ne recouvre rien.
    this.reserveOf = opts.reserveOf || null;
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
   * Trois bornes s'y ajoutent, pour l'ecran large et bas d'un telephone tenu en
   * paysage : la boite ne depasse jamais la largeur disponible, elle s'arrete
   * avant ce qui la recouvre (`reserveOf`), et le corps de police ne descend pas
   * sous `MIN_FONT`.
   */
  resize() {
    const byHeight = Math.min(1, innerHeight / REF_H) * 1.35;
    const reserve = this.reserveOf ? this.reserveOf() : 0;
    const byWidth = (innerWidth - 32 - reserve) / LAYOUT.box[0];
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
    // Le decoupage vient du systeme de dialogue, qui en tient l'INDEX : le
    // nombre de pages est le nombre d'appuis qu'il reste, et cela ne peut pas
    // vivre dans une couche qui se contente de dessiner.
    const lines = view.lines || [];
    // `_isMuseumSign` change les limites de decoupage — c'est fait en amont —
    // et le FOND de la boite : un panneau n'a pas de nom de personnage.
    this.box.classList.toggle("dlg-sign", !!isSign);
    // Un texte long se lit en plusieurs fois : le compteur dit lequel des deux,
    // et le « Next » ne ment donc plus sur ce qui suit.
    const rang = view.pageCount > 1 ? `  ${view.pageIndex + 1}/${view.pageCount}`
      : (view.lineCount > 1 ? `  ${view.lineIndex + 1}/${view.lineCount}` : "");
    this.name.textContent = view.character + rang;
    this.text.textContent = lines.join("\n");

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
