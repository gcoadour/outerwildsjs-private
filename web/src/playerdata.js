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
 * Regles d'echange d'arbre, dans l'ordre ou le jeu les teste.
 *
 * Le motif designe le CHAMP du controleur, pas le nom de l'arbre : c'est la
 * difference entre lire la reference et chercher un titre qui lui ressemble.
 */
const TREE_RULES = [
  { when: (d) => !d.hasCompletedTraining, field: /training|untrained/i,
    who: /coach/i },
  { when: (d) => d.knowsLaunchCodes, field: /withcodes|hascodes/i, who: /coach/i },
  { when: () => true, field: /withoutcodes|nocodes/i, who: /coach/i },
  { when: (d) => d.knowsLaunchCodes, field: /goodluck|after|post|launch/i,
    who: /curator/i },
  { when: () => true, field: /preflight|before|initial/i, who: /curator/i },
  { when: (d) => d.loopCount >= 2, field: /farewell|second|loop/i, who: /./ },
];

/** Arbre porte par le controleur d'une conversation, ou null. */
export function treeFromController(data, convo, controllers = []) {
  if (!controllers.length) return null;
  const who = convo.character || convo.name || "";
  let ctrl = controllers.find((c) => c.name && c.name === convo.name);
  if (!ctrl && convo.position) {
    // meme personnage, autre GameObject : on prend le controleur pose sur lui
    let bestD = 12;
    for (const c of controllers) {
      if (!c.position) continue;
      const d = Math.hypot(c.position[0] - convo.position[0],
                           c.position[1] - convo.position[1],
                           c.position[2] - convo.position[2]);
      if (d < bestD) { bestD = d; ctrl = c; }
    }
  }
  if (!ctrl) return null;
  for (const rule of TREE_RULES) {
    if (!rule.who.test(who) && !rule.who.test(ctrl.kind)) continue;
    if (!rule.when(data)) continue;
    const hit = Object.entries(ctrl.trees).find(([k]) => rule.field.test(k));
    if (hit) return String(hit[1]);
  }
  return null;
}

/**
 * Choix d'un arbre de dialogue selon les connaissances, comme le font les
 * controleurs du jeu.
 *
 * La reference directe prime ; la recherche par nom d'arbre ne reste que
 * comme repli, pour un build ou le controleur ne porterait pas ses arbres.
 */
export function selectTree(data, convo, trees, controllers = []) {
  const direct = treeFromController(data, convo, controllers);
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
