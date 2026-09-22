// Dialogues et memoire entre boucles.
//
// Les arbres viennent de tools/13_dialogue.py. Deux formes coexistent dans le
// build : <branch> avec options de reponse, et <convo> sans options. Les 47
// autres TextAsset ne sont pas des dialogues mais les textes bruts des objets
// lisibles.
//
// La MEMOIRE est le vrai sujet. Dans Outer Wilds, ce qui traverse la boucle
// n'est pas un etat sauvegarde mais la connaissance du joueur. On enregistre
// donc les noeuds vus, et cet ensemble survit a la supernova comme au
// rechargement de la page.

// LES OBJETS LISIBLES PASSENT PAR ICI, et c'est le build qui le dit :
// `ReadableObject.OnPressInteract` ne fait pas autre chose qu'une conversation,
// il construit la MEME boite —
//
//   DialogueBox(_displayText, String.Empty, 0, String.Empty, true)
//   _dialogueGUI.ShowDialogueBox(box)
//   _lockOnTargeting.LockOn(_attentionPoint, 2f, false, 1f)
//   _isBeingRead = true; GlobalMessenger.AddListener("ExitDialogueMode", ...)
//
// — avec `_isMuseumSign` a VRAI, donc sans nom de personnage et sans options,
// et avec les limites de decoupage du panneau (70 x 5). Les trente-quatre
// textes etaient extraits depuis longtemps et n'etaient affiches nulle part :
// appuyer sur un panneau ne faisait rien (docs/105-lire.md).

// LES CINQ METHODES DE `Conversation`, ET OU CHACUNE EST REFAITE. Le quatrieme
// denominateur les nommait sans que rien ne les cite, et deux d'entre elles
// etaient bel et bien portees — sous un autre nom, ce qui est exactement le cas
// que ce compte ne sait pas voir tout seul (docs/103-refait.md).
//
//   ReadXML, ProcessXMLDialogues   le pipeline les fait une fois pour toutes,
//                                  hors ligne : `data/dialogue/dialogue.json`
//                                  porte deja les arbres decoupes
//   StartRemoteConversation        les controleurs de personnage, qui posent
//                                  l'arbre avant l'ouverture (docs/13)
//   StartConversation              `open()`, plus le verrouillage de camera
//                                  que `main.js` pose a 3 degres par degre
//                                  d'ecart (docs/105-lire.md)
//   selectOption                   `choose()` : l'attribut `goto` de l'option
//                                  nomme l'arbre suivant, et `_prevConvoNo`
//                                  est ce que ce portage appelle `branchId`
//
// `OnExitDialogueMode` remet `_prevConvoNo` a "1" : on ne reprend JAMAIS une
// conversation la ou on l'a laissee, on la recommence. `open()` repart de
// `tree.start`, ce qui dit la meme chose.

// @lit Conversation, CharacterDialogueTree, ReadableObject
// Les quatorze conversations du build, leurs arbres, et les objets lisibles.

import { paginate, LAYOUT } from "./dialogueui.js";

export const CONVERSATION_EVENTS = {
  enter: "EnterConversation",
  exit: "ExitConversation",
};

const STORAGE_KEY = "outerwildsjs.knowledge";

export async function loadDialogue() {
  try {
    const res = await fetch("data/dialogue/dialogue.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("data/dialogue/dialogue.json absent :", e.message);
    return { trees: {}, conversations: [] };
  }
}

export class DialogueSystem {
  constructor(data) {
    this.trees = data.trees || {};
    this.conversations = data.conversations || [];
    // Identite stable d'une conversation : son rang. Le NOM n'en est pas une —
    // les quatorze zones du build s'appellent toutes `ConversationZone`.
    this.conversations.forEach((c, i) => { c.index = i; });
    this.active = null;      // { convo, tree, branchId, line }
    this.knowledge = new Set();
    // Etat de la BOUCLE courante, par conversation. Il ne se sauvegarde pas :
    // le jeu remet `_hasGivenLaunchCodes` et `_triggerSecondConvo` a faux a
    // chaque redemarrage, quand la connaissance, elle, survit.
    this.loopState = new Map();
    // Appele quand une conversation se termine, avec la conversation tenue.
    // C'est le moment ou le build accorde les codes de lancement.
    this.onEnd = null;
    this.load();
  }

  /** Etat de boucle d'une conversation : combien de fois on l'a menee a son terme. */
  stateOf(convo) {
    const k = convo && convo.index != null ? convo.index : -1;
    let st = this.loopState.get(k);
    if (!st) { st = { ended: 0, crashes: 0, landings: 0 }; this.loopState.set(k, st); }
    return st;
  }

  /** Nouvelle boucle : le monde oublie, la connaissance non. */
  resetLoop() { this.loopState.clear(); }

  // --- memoire persistante ---

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) for (const k of JSON.parse(raw)) this.knowledge.add(k);
    } catch (e) { /* stockage indisponible : la memoire ne survit qu'a la session */ }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.knowledge]));
    } catch (e) { /* quota ou mode prive */ }
  }

  learn(treeId, branchId) {
    const key = `${treeId}#${branchId}`;
    if (this.knowledge.has(key)) return false;
    this.knowledge.add(key);
    this.save();
    return true;
  }

  get known() { return this.knowledge.size; }

  /** Nombre total de noeuds decouvrables, pour situer la progression. */
  get total() {
    let n = 0;
    for (const t of Object.values(this.trees)) n += Object.keys(t.branches || {}).length;
    return n;
  }

  // --- interaction ---

  /** Conversation la plus proche du joueur, dans le repere courant. */
  nearest(pos, frameOffset, maxDist = 6) {
    let best = null, bestD = maxDist;
    for (const c of this.conversations) {
      // Une conversation SANS arbre pose dans la scene reste jouable si un
      // controleur en pose un a l'execution : c'est le cas du Conservateur,
      // dont `_activeDialogueTree` est nul et dont `CuratorConvoController`
      // choisit l'arbre au demarrage. L'ecarter ici le rendait muet, et avec
      // lui les codes de lancement qu'il est le seul a donner.
      if (!c.tree && !(c.controller && c.controller.trees)) continue;
      const d = Math.hypot(c.position[0] - frameOffset[0] - pos.x,
                           c.position[1] - frameOffset[1] - pos.y,
                           c.position[2] - frameOffset[2] - pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  open(convo) {
    const tree = this.trees[String(convo.tree)];
    if (!tree) return false;
    this.active = { convo, treeId: String(convo.tree), tree,
                    branchId: tree.start, line: 0, page: 0 };
    this.learn(this.active.treeId, tree.start);
    return true;
  }

  /**
   * Ouvre un objet lisible : le meme dialogue, en panneau.
   *
   * `_isBeingRead` garde le build d'un second appui pendant la lecture ; ici
   * c'est `this.active` qui le fait, puisque rien d'autre ne peut s'ouvrir tant
   * qu'une conversation est en cours.
   */
  read(item) {
    if (!item || !item.text) return false;
    this.active = { reading: item, page: 0 };
    return true;
  }

  /**
   * Les pages de ce qui s'affiche a cet instant.
   *
   * Le decoupage se refait quand la REPLIQUE change, et le rang de page repart
   * alors a zero : c'est ce que fait `ShowDialogueBox`, qui recalcule tout a
   * chaque boite. Le cache n'est pas une optimisation — il est ce qui rend le
   * rang de page stable d'une image a l'autre.
   */
  get pages() {
    const a = this.active;
    if (!a) return [];
    const sign = !!(a.reading || (a.convo && a.convo.isMuseumSign));
    const kind = sign ? "museumSign" : "character";
    const b = a.reading ? null : this.branch;
    const txt = a.reading ? a.reading.text : ((b && b.talk) || [])[a.line] || "";
    const cle = `${a.reading ? "lu" : a.branchId}#${a.line}`;
    if (a.cle !== cle) {
      a.cle = cle;
      a.pages = paginate(txt, LAYOUT.charsPerLine[kind], LAYOUT.maxLines[kind]);
      a.page = 0;
    }
    return a.pages;
  }

  /**
   * Fin d'une conversation.
   *
   * Le moment compte : `CuratorConvoController.OnEndConversation` accorde les
   * codes de lancement, pas `OnStartConversation`. Les accorder a l'ouverture
   * revenait a les donner sans avoir ecoute.
   */
  close() {
    const convo = this.active && this.active.convo;
    this.active = null;
    if (!convo) return;
    this.stateOf(convo).ended += 1;
    if (this.onEnd) this.onEnd(convo);
  }

  get branch() {
    const a = this.active;
    // Un objet lisible n'a pas d'arbre : il n'a qu'un texte, et `DialogueBox`
    // recoit une chaine vide la ou une conversation passe ses options.
    if (!a || !a.tree) return null;
    return a.tree.branches[a.branchId];
  }

  /** Etat affichable : personnage, page courante, options. */
  get view() {
    const a = this.active;
    if (!a) return null;
    const pages = this.pages;
    const derniere = a.page >= pages.length - 1;
    const commun = { lines: pages[a.page] || [],
                     pageIndex: a.page, pageCount: pages.length };
    if (a.reading) {
      // Un panneau n'a ni nom ni options : `DialogueBox` recoit `String.Empty`
      // pour les deux. Le nom de l'objet sert de titre, faute de mieux.
      return { ...commun, character: a.reading.name || "", sign: true,
               lineIndex: 0, lineCount: 1, options: [], atEnd: derniere };
    }
    const b = this.branch;
    if (!b) return null;
    const talk = b.talk || [];
    const finReplique = a.line >= talk.length - 1;
    return {
      ...commun,
      character: a.convo.character || a.convo.name || "?",
      sign: !!a.convo.isMuseumSign,
      lineIndex: a.line, lineCount: talk.length,
      // Les options ne s'offrent qu'a la DERNIERE page de la derniere
      // replique : tant qu'il reste du texte, il n'y a rien a choisir.
      options: derniere && finReplique ? (b.options || []) : [],
      atEnd: derniere && finReplique,
    };
  }

  /**
   * Avance d'une page, puis d'une replique ; ferme au bout.
   *
   * La page passe AVANT la replique, sans quoi la moitie d'un long texte ne
   * s'afficherait jamais — ce qui etait le cas de vingt-deux des
   * trente-quatre objets lisibles.
   */
  advance() {
    const a = this.active;
    if (!a) return;
    if (a.page < this.pages.length - 1) { a.page += 1; return; }
    if (a.reading) { this.close(); return; }
    const b = this.branch;
    if (!b) return;
    if (a.line < (b.talk || []).length - 1) { a.line += 1; return; }
    if (!(b.options || []).length) this.close();
  }

  /** Suit une option ; un goto absent termine la conversation. */
  choose(i) {
    const a = this.active, b = this.branch;
    if (!a || !b) return;
    const opt = (b.options || [])[i];
    if (!opt) return;
    const next = opt.goto && a.tree.branches[opt.goto];
    if (!next) { this.close(); return; }
    a.branchId = opt.goto;
    a.line = 0;
    this.learn(a.treeId, opt.goto);
  }
}
