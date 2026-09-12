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
                    branchId: tree.start, line: 0 };
    this.learn(this.active.treeId, tree.start);
    return true;
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
    return a ? a.tree.branches[a.branchId] : null;
  }

  /** Etat affichable : personnage, replique courante, options. */
  get view() {
    const a = this.active, b = this.branch;
    if (!a || !b) return null;
    const talk = b.talk || [];
    return {
      character: a.convo.character || a.convo.name || "?",
      line: talk[a.line] || null,
      lineIndex: a.line, lineCount: talk.length,
      options: a.line >= talk.length - 1 ? (b.options || []) : [],
      atEnd: a.line >= talk.length - 1,
    };
  }

  /** Avance d'une replique ; ferme si la branche se termine sans option. */
  advance() {
    const a = this.active, b = this.branch;
    if (!a || !b) return;
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
