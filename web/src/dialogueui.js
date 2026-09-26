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

/**
 * La mise en page de `DialogueGUI`, en pixels d'ecran, telle que l'IL la pose.
 *
 * Ce module ne gardait que des PROPORTIONS et laissait une feuille de style
 * poser une boite sombre centree, avec « Rocket Scientist 1/2 » et un
 * « Next » en toutes lettres. Cote a cote avec l'alpha (docs/132), rien ne
 * ressemblait : l'IMGUI du build n'a pas de boite pleine, il pose des
 * TEXTURES a des ancres calculees sur l'ecran, en pixels fixes, corps 30 :
 *
 *   ShowDialogueBox   _heightDiff = 1080 - 769,6
 *                     fond long  (W/2 - 600 ; H - 300 - (_heightDiff - 300))
 *                     fond court (W/2 - 450 ; meme hauteur)
 *                     panneau    (W/2 - 480 ; H - 300 - (1080 - 769,5 - 300))
 *   setNoOptionsDimensions   `Short_Dialog_BG` 900 x 300 ; texte a (61,3 ; 96),
 *                     nom a (61,3 ; 61,5), bouton a (732,3 ; 204)
 *   setOptionsDimensions     `Dialog_Choice_BG` 1200 x 300 ; texte a (13 ;
 *                     95,9), nom a (13 ; 59,5), options a (720,2 ; 94,5),
 *                     curseur a (681,8 ; 94,5 + 35 x rang)
 *   DisplayGUIElements  texte d'un personnage ALIGNE A DROITE dans 641 x 176,
 *                     nom aligne a droite sur `NPC_Name_BG` a sa taille,
 *                     curseur `NPC_Name_BG` + icone `White_Dialog_Btn` 35 x 35
 *
 * Le seul ecart assume est l'echelle : a 640 x 360, l'alpha pose son fond a
 * x = -130 et le texte sort de l'ecran par la gauche. Le portage garde la
 * geometrie du jeu jusqu'a 1 280 pixels de large, et la reduit en dessous —
 * la meme regle que le menu de pause (docs/132).
 *
 * @param W, H     taille de l'ecran en pixels CSS
 * @param v        la vue du dialogue (`DialogueSystem.view`)
 * @param mesure   (texte, gras) -> largeur en pixels a corps 30
 * @returns        l'echelle et les rectangles, en pixels « du jeu »
 */
export const GEOMETRIE = {
  resRef: 1080, optionsBG: [360.5, 769.6], locationBG: [480.5, 769.5],
  fondLong: [1200, 300], fondCourt: [900, 300], fondPanneau: [960, 300],
  texte: [641, 176], nom: [641, 35], choix: [140, 35], options: [504.135, 140],
  ligne: 35, corps: 30, largeurPleine: 1280,
  court: { texte: [61.295, 95.994], nom: [61.295, 61.494], choix: [732.295, 203.994] },
  long: { texte: [13, 95.9], nom: [13, 59.5], options: [720.224, 94.487],
          curseur: [681.774, 94.487] },
  panneau: { texte: [58.902, 41], taille: [840.7, 215.5], barre: [59.704, 225.301],
             tailleBarre: [762, 49], etiquette: [825.704, 232.301], tailleEtiquette: [104, 35] },
};

export function dispositionDialogue(W, H, v, mesure = (t) => t.length * 14, doigt = null) {
  const G = GEOMETRIE;
  // Au doigt (`doigt` : { reserve, cible }), deux entorses et pas une de plus :
  // le fond s'arrete avant le losange d'action qui le recouvrirait, et une
  // option comme le bouton font au moins la taille d'un doigt (docs/95).
  let s = Math.min(1, W / G.largeurPleine);
  if (doigt && doigt.reserve > 0) s = Math.min(s, Math.max(0.2, (W / 2 - doigt.reserve - 10) / 600));
  const ligne = doigt ? Math.max(G.ligne, (doigt.cible || 44) / s) : G.ligne;
  const w = W / s, h = H / s;
  const heightDiff = G.resRef - G.optionsBG[1];
  const bas = h - G.fondLong[1] - (heightDiff - G.fondLong[1]);
  const out = { echelle: s, largeur: w, hauteur: h, ligne };
  if (!v) return out;
  if (v.sign) {
    const fx = w / 2 - G.fondPanneau[0] / 2;
    const fy = h - G.fondPanneau[1] - (G.resRef - G.locationBG[1] - G.fondPanneau[1]);
    const P = G.panneau;
    out.fond = { tex: "LocationText_BG", x: fx, y: fy, w: G.fondPanneau[0], h: G.fondPanneau[1] };
    out.texte = { x: fx + P.texte[0], y: fy + P.texte[1], w: P.taille[0], h: P.taille[1], align: "left" };
    out.barre = { tex: "LocationText_Bar", x: fx + P.barre[0], y: fy + P.barre[1],
                  w: P.tailleBarre[0], h: P.tailleBarre[1] };
    out.etiquette = { x: fx + P.etiquette[0], y: fy + P.etiquette[1], w: P.tailleEtiquette[0],
                      h: P.tailleEtiquette[1], texte: v.atEnd ? "Close" : "Next" };
    return out;
  }
  const avecOptions = v.options && v.options.length > 0;
  if (avecOptions) {
    const fx = w / 2 - G.fondLong[0] / 2, L = G.long;
    out.fond = { tex: "Dialog_Choice_BG", x: fx, y: bas, w: G.fondLong[0], h: G.fondLong[1] };
    out.texte = { x: fx + L.texte[0], y: bas + L.texte[1], w: G.texte[0], h: G.texte[1], align: "right" };
    out.nom = { x: fx + L.nom[0], y: bas + L.nom[1], w: G.nom[0], h: G.nom[1] };
    out.options = { x: fx + L.options[0], y: bas + L.options[1], w: G.options[0],
                    h: Math.max(G.options[1], ligne * v.options.length) };
    const rang = Math.max(0, Math.min(v.options.length - 1, v.curseur || 0));
    // La largeur du curseur est celle de l'option LA PLUS LONGUE en caracteres
    // (`_longestOption`), mesuree dans le style du texte, plus l'ecart entre
    // l'ancre du curseur et celle des options.
    let longue = "";
    for (const o of v.options) if ((o.text || "").length > longue.length) longue = o.text || "";
    const ecart = L.options[0] - L.curseur[0];
    out.curseur = { tex: "NPC_Name_BG", x: fx + L.curseur[0], y: bas + L.curseur[1] + ligne * rang,
                    w: mesure(longue, false) + ecart, h: G.ligne };
    out.icone = { tex: "White_Dialog_Btn", x: out.curseur.x, y: out.curseur.y, w: 35, h: 35 };
  } else {
    const fx = w / 2 - G.fondCourt[0] / 2, C = G.court;
    out.fond = { tex: "Short_Dialog_BG", x: fx, y: bas, w: G.fondCourt[0], h: G.fondCourt[1] };
    out.texte = { x: fx + C.texte[0], y: bas + C.texte[1], w: G.texte[0], h: G.texte[1], align: "right" };
    out.nom = { x: fx + C.nom[0], y: bas + C.nom[1], w: G.nom[0], h: G.nom[1] };
    out.choix = { tex: "Short_Dialog_Btn", x: fx + C.choix[0], y: bas + C.choix[1],
                  w: G.choix[0], h: Math.max(G.choix[1], doigt ? 40 / s : 0),
                  texte: v.atEnd ? "Close" : "Next" };
  }
  // Le bandeau du nom est a la TAILLE DU NOM, cale a droite de sa zone.
  const ln = mesure(v.character || "", true);
  out.bandeau = { tex: "NPC_Name_BG", x: out.nom.x + G.nom[0] - ln, y: out.nom.y, w: ln, h: G.nom[1] };
  return out;
}

export class DialogueUI {
  /** @param opts { onChoose(index), onNext(), reserveOf() } — le choix au doigt */
  constructor(root, opts = {}) {
    this.root = root;
    this.cursor = 0;
    this.reserveOf = opts.reserveOf || null;
    this.onChoose = opts.onChoose || null;
    this.onNext = opts.onNext || null;
    this.dir = opts.dir || "data/interface/";
    this.build();
  }

  build() {
    const div = (cls) => { const d = document.createElement("div"); d.className = cls; return d; };
    const img = (cls) => { const i = document.createElement("img"); i.className = cls; i.alt = ""; return i; };
    this.scene = div("dlg-imgui");
    this.fond = img("dlg-tex dlg-fond");
    this.bandeau = img("dlg-tex");
    this.barre = img("dlg-tex");
    this.curseur = img("dlg-tex");
    this.icone = img("dlg-tex");
    this.nom = div("dlg-nom");
    this.texte = div("dlg-texte");
    this.options = div("dlg-opts");
    this.choix = div("dlg-choix");
    this.choixIcone = img("dlg-choix-icone");
    this.choixTexte = document.createElement("span");
    this.choix.append(this.choixIcone, this.choixTexte);
    // « Next » est aussi un bouton : au doigt, il n'y a pas de touche E.
    this.choix.addEventListener("click", () => { if (this.onNext) this.onNext(); });
    this.scene.append(this.fond, this.barre, this.bandeau, this.nom, this.texte,
                      this.curseur, this.icone, this.options, this.choix);
    this.root.append(this.scene);
    this.root.hidden = true;
    const c = document.createElement("canvas");
    this.ctx = c.getContext("2d");
  }

  /** `GUIStyle.CalcSize` : la largeur d'un texte a corps 30, dans sa police. */
  mesure(texte, gras) {
    this.ctx.font = `30px "${gras ? "OW Name" : "OW Dialogue"}", sans-serif`;
    return Math.ceil(this.ctx.measureText(texte || "").width);
  }

  hide() { this.root.hidden = true; }

  /**
   * @param view etat courant du dialogue
   */
  render(view) {
    if (!view) { this.hide(); return; }
    this.root.hidden = false;
    const W = this.root.clientWidth || innerWidth, H = this.root.clientHeight || innerHeight;
    // `ShowDialogueBox` remet `_optionNo` a zero : chaque nouvelle boite
    // repart de la premiere option.
    const cle = `${view.character}|${view.lineIndex}|${view.pageIndex}|${(view.lines || []).join(" ")}`;
    if (cle !== this.cle) { this.cle = cle; this.cursor = 0; }
    if (view.options.length) this.cursor = Math.min(this.cursor, view.options.length - 1);
    const toucher = document.body.classList.contains("touch");
    const d = dispositionDialogue(W, H, { ...view, curseur: this.cursor },
                                  (t, g) => this.mesure(t, g),
                                  toucher ? { reserve: this.reserveOf ? this.reserveOf() : 0, cible: 44 } : null);
    this.scene.classList.toggle("dlg-sign", !!view.sign);
    this.scene.style.setProperty("--ligne", `${d.ligne}px`);
    this.scene.style.width = `${d.largeur}px`;
    this.scene.style.height = `${d.hauteur}px`;
    this.scene.style.transform = `scale(${d.echelle})`;
    const pose = (el, r, tex = true) => {
      el.hidden = !r;
      if (!r) return;
      Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      if (tex && r.tex) {
        const src = `${this.dir}${r.tex}.png`;
        if (el.getAttribute("src") !== src) el.src = src;
      }
    };
    pose(this.fond, d.fond);
    pose(this.bandeau, d.bandeau);
    pose(this.barre, d.barre);
    pose(this.curseur, d.curseur);
    pose(this.icone, d.icone);
    pose(this.nom, d.nom, false);
    this.nom.textContent = d.nom ? view.character : "";
    pose(this.texte, d.texte, false);
    this.texte.style.textAlign = d.texte ? d.texte.align : "right";
    this.texte.textContent = (view.lines || []).join("\n");
    pose(this.options, d.options, false);
    this.options.textContent = "";
    for (const [i, o] of (d.options ? view.options : []).entries()) {
      const ligne = document.createElement("div");
      ligne.className = "dlg-opt" + (i === this.cursor ? " dlg-sel" : "");
      ligne.textContent = o.text || "";
      // viser l'option directement : c'est le seul choix possible au doigt
      ligne.addEventListener("click", () => { this.cursor = i; if (this.onChoose) this.onChoose(i); });
      this.options.append(ligne);
    }
    const bouton = d.choix || d.etiquette || null;
    pose(this.choix, bouton, false);
    if (bouton) {
      this.choixTexte.textContent = bouton.texte;
      this.choixIcone.hidden = !bouton.tex;
      if (bouton.tex) this.choixIcone.src = `${this.dir}${bouton.tex}.png`;
    }
  }

  moveCursor(delta, count) {
    if (!count) return;
    // `DialogueGUI.Update` BORNE le curseur, il ne boucle pas : descendre sous
    // la derniere option y reste, monter au-dessus de la premiere aussi.
    this.cursor = Math.max(0, Math.min(count - 1, this.cursor + delta));
  }
}
