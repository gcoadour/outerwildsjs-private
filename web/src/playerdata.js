// Connaissances du joueur.
//
// Le modele vient de PlayerData, dont l'API donne le vocabulaire exact :
//
//   HasExploredPlanet(SectorName) / SaveExploredPlanet(...)
//   LearnTargeting()   / KnowsTargeting()
//   LearnLaunchCodes() / KnowsLaunchCodes()
//   KnowsHowProbesWork() / KnowsHowShipProbesWork() / KnowsHowTelescopeWorks()
//   HasCompletedTraining()
//   SaveLoopCount(n)   / LoadLoopCount()
//
// Et surtout, le mecanisme de deblocage n'est PAS au niveau des branches de
// dialogue — les 20 attributs eventbased du build valent tous "false". Il est
// au niveau des ARBRES : chaque controleur de personnage echange l'arbre entier
// selon ces drapeaux. CoachConvoController teste HasCompletedTraining puis
// KnowsLaunchCodes ; CuratorConvoController appelle LearnLaunchCodes ;
// SecondLoopConvoTrigger teste le numero de boucle.
//
// C'est ce qui donne son sens a la boucle : la connaissance survit, le monde
// non.

const KEY = "outerwildsjs.playerdata";

// Sector.SectorName, tel qu'enumere dans le build
export const SECTORS = ["Unnamed", "Nomad", "HourglassTwins", "TimberHearth",
                        "BrittleHollow", "GiantsDeep", "DarkBramble",
                        "QuantumMoon", "Sun"];

const FLAGS = ["knowsTargeting", "knowsLaunchCodes", "knowsHowProbesWork",
               "knowsHowShipProbesWork", "knowsHowTelescopeWorks",
               "hasCompletedTraining"];

export class PlayerData {
  constructor() {
    this.explored = new Set();
    this.loopCount = 0;
    for (const f of FLAGS) this[f] = false;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      for (const f of FLAGS) if (raw[f]) this[f] = true;
      for (const s of raw.explored || []) this.explored.add(s);
      this.loopCount = raw.loopCount || 0;
    } catch (e) { /* stockage indisponible */ }
  }

  save() {
    try {
      const out = { explored: [...this.explored], loopCount: this.loopCount };
      for (const f of FLAGS) out[f] = this[f];
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch (e) { /* quota ou mode prive */ }
  }

  /** Efface tout : la seule chose que la boucle ne doit PAS faire. */
  wipe() {
    this.explored.clear();
    this.loopCount = 0;
    for (const f of FLAGS) this[f] = false;
    this.save();
  }

  // --- exploration ---

  hasExplored(sector) { return this.explored.has(sector); }

  /** Appele quand le joueur entre dans un secteur. Retourne true si nouveau. */
  saveExploredPlanet(sector) {
    if (!sector || sector === "Unnamed" || this.explored.has(sector)) return false;
    this.explored.add(sector);
    this.save();
    return true;
  }

  // --- connaissances nommees ---

  learn(flag) {
    if (!FLAGS.includes(flag) || this[flag]) return false;
    this[flag] = true;
    this.save();
    return true;
  }

  knows(flag) { return !!this[flag]; }

  setLoopCount(n) { this.loopCount = n; this.save(); }

  get summary() {
    const known = FLAGS.filter((f) => this[f]).length;
    return `${this.explored.size}/${SECTORS.length - 1} explorés · ` +
           `${known}/${FLAGS.length} savoirs`;
  }
}

/**
 * Controleurs de conversation poses dans la scene.
 *
 * `CoachConvoController`, `CuratorConvoController`, `SecondLoopConvoTrigger` :
 * chacun porte, EN REFERENCE DIRECTE, les arbres qu'il echange selon les
 * drapeaux. L'extracteur resout ces references (`entry.trees`, nom de champ ->
 * identifiant du TextAsset) ; il n'y a donc plus a deviner l'arbre par son nom.
 */
export function convoControllers(gameplay = {}) {
  const out = [];
  for (const [cls, list] of Object.entries(gameplay.placed || {})) {
    if (!/convocontroller|convotrigger/i.test(cls)) continue;
    for (const e of list) {
      if (!e.trees || !Object.keys(e.trees).length) continue;
      out.push({ name: e.name, kind: cls, position: e.position, trees: e.trees });
    }
  }
  return out;
}

/**
 * Regles d'echange d'arbre, LUES DANS L'IL des controleurs du build.
 *
 * L'ancienne version cherchait un CHAMP par expression reguliere
 * (`/withcodes|hascodes/`) apres avoir retrouve le controleur PAR SON NOM. Les
 * deux moities etaient fausses :
 *
 *   - les quatorze zones de conversation du build s'appellent toutes
 *     `ConversationZone`, donc `find(c => c.name === convo.name)` ramenait
 *     toujours la premiere — le Conservateur heritait des arbres du formateur ;
 *   - le nom du champ n'a pas a etre devine : le controleur porte ses arbres en
 *     reference directe, et sa CLASSE dit laquelle choisir.
 *
 * Chaque regle ci-dessous est la transcription d'une methode reelle. Ce qui
 * n'est pas dans le build n'est pas invente : `_crashCount` et `_landCount`
 * comptent les essais du vaisseau miniature, qui n'est pas porte, et restent
 * donc a zero — la regle est ecrite quand meme, pour qu'elle soit juste le jour
 * ou il le sera.
 *
 * `state` est l'etat de la BOUCLE courante, pas une connaissance : le jeu
 * remet `_hasGivenLaunchCodes` et `_triggerSecondConvo` a faux a chaque
 * redemarrage, la ou `PlayerData` survit.
 */
export const CONVO_RULES = {
  // OnStartConversation : HasCompletedTraining ? (KnowsLaunchCodes ? ... ) : ...
  CoachConvoController: (d) =>
    !d.hasCompletedTraining ? "_beforeTraining"
      : d.knowsLaunchCodes ? "_afterTrainingWithCodes" : "_afterTrainingWithoutCodes",

  // OnStartConversation : _hasGivenLaunchCodes ? _goodLuck : _preFlightObservations
  // et OnEndConversation accorde les codes. Une fois qu'on lui a parle, il
  // souhaite bonne route ; la boucle suivante, il recommence ses observations.
  CuratorConvoController: (d, s) => (s.ended ? "_goodLuck" : "_preFlightObservations"),

  // OnStartOfTimeLoop pose _bigDay ; OnEndConversation bascule sur _secondConvo.
  RocketScientistConvoController: (d, s) => (s.ended ? "_secondConvo" : "_bigDay"),

  // _crashCount >= 5 -> _tooManyCrashes (et le compteur repart a zero) ;
  // _landCount > 0 -> _successfulLanding ; sinon _introduction.
  RocketKidConvoController: (d, s) =>
    (s.crashes || 0) >= 5 ? "_tooManyCrashes"
      : (s.landings || 0) > 0 ? "_successfulLanding" : "_introduction",

  // OnTriggerEnter : sort si GetLoopCount() < 2 ; sinon la conversation demarre
  // sur _2ndLoop et l'arbre SUIVANT devient _farewell.
  SecondLoopConvoTrigger: (d, s) =>
    d.loopCount < 2 ? null : (s.ended ? "_farewell" : "_2ndLoop"),
};

/** Etat de boucle vide, pour une conversation qu'on n'a pas encore tenue. */
export const NO_CONVO_STATE = { ended: 0, crashes: 0, landings: 0 };

/**
 * Arbre porte par le controleur d'une conversation, ou null.
 *
 * Le lien conversation -> controleur est desormais pose par l'extracteur, par
 * GameObject : `Awake` fait `GetComponent<Conversation>()`, les deux sont donc
 * sur le meme objet et il n'y a plus rien a rapprocher a l'execution. La
 * recherche par position ne reste que pour une extraction ancienne, qui ne
 * porterait pas encore `convo.controller`.
 */
export function treeFromController(data, convo, controllers = [],
                                   state = NO_CONVO_STATE) {
  let ctrl = convo && convo.controller;
  if (!ctrl && convo && convo.position && controllers.length) {
    let bestD = 12;
    for (const c of controllers) {
      if (!c.position) continue;
      const d = Math.hypot(c.position[0] - convo.position[0],
                           c.position[1] - convo.position[1],
                           c.position[2] - convo.position[2]);
      if (d < bestD) { bestD = d; ctrl = c; }
    }
  }
  if (!ctrl || !ctrl.trees) return null;
  const rule = CONVO_RULES[ctrl.kind];
  const field = rule ? rule(data, state) : null;
  if (field && ctrl.trees[field]) return String(ctrl.trees[field]);
  // Classe inconnue, ou arbre absent de ce controleur : plutot qu'un silence,
  // le premier arbre qu'il porte. Un personnage qui dit la mauvaise chose reste
  // preferable a un personnage muet.
  const first = Object.values(ctrl.trees)[0];
  return first != null ? String(first) : null;
}

/**
 * Choix d'un arbre de dialogue selon les connaissances, comme le font les
 * controleurs du jeu.
 *
 * La reference directe prime ; la recherche par nom d'arbre ne reste que
 * comme repli, pour un build ou le controleur ne porterait pas ses arbres.
 */
export function selectTree(data, convo, trees, controllers = [],
                           state = NO_CONVO_STATE) {
  const direct = treeFromController(data, convo, controllers, state);
  if (direct && trees[direct]) return direct;
  const named = (frag) => {
    for (const [id, t] of Object.entries(trees)) {
      if (t.name && t.name.toLowerCase().includes(frag)) return id;
    }
    return null;
  };
  // le formateur : avant l'entrainement, apres, puis avec les codes
  if (/coach/i.test(convo.character || convo.name || "")) {
    if (!data.hasCompletedTraining) return named("before") || convo.tree;
    return (data.knowsLaunchCodes ? named("withcodes") : named("withoutcodes"))
           || convo.tree;
  }
  // le conservateur : observations avant vol, puis souhaits de bonne route
  if (/curator/i.test(convo.character || convo.name || "")) {
    return (data.knowsLaunchCodes ? named("goodluck") : named("preflight"))
           || convo.tree;
  }
  // a partir de la deuxieme boucle, certains personnages font leurs adieux
  if (data.loopCount >= 2) {
    const farewell = named("farewell");
    if (farewell && /scientist|rocket/i.test(convo.character || convo.name || "")) {
      return farewell;
    }
  }
  return convo.tree;
}
