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
 * Choix d'un arbre de dialogue selon les connaissances, comme le font les
 * controleurs du jeu.
 *
 * La conversation DESIGNE ses arbres : un champ par situation, chacun pointant
 * vers son TextAsset (`trees` dans dialogue.json). C'est cette reference qui
 * fait foi. Le choix par NOM d'arbre, qui servait a tout, ne reste qu'en repli
 * pour une conversation dont on n'a pas su lire les pointeurs — deviner un
 * fichier par une bribe de son nom est le genre de raccourci qui marche jusqu'a
 * ce qu'un fichier soit renomme.
 */
export function selectTree(data, convo, trees) {
  const named = (frag) => {
    // d'abord le champ de la conversation dont le NOM contient la bribe : c'est
    // la reference directe, pas une ressemblance de fichier
    for (const [field, id] of Object.entries(convo.trees || {})) {
      if (field.toLowerCase().includes(frag) && trees[id]) return id;
    }
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
