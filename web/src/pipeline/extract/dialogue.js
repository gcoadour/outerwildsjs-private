// Arbres de dialogue XML -> JSON, relies aux personnages qui les portent.
// Portage de tools/13_dialogue.py.
//
// Schema releve sur les 73 TextAsset du build :
//   <dialogueTree>          racine
//     <branch id="..">      noeud a options
//       <talk>              replique
//       <options><option goto=".."> choix du joueur
//     <convo id="..">       noeud simple, sans options
//   <OWConversation>        variante avec <characters>
// Les 47 autres TextAsset sont les textes bruts des objets lisibles.

import { parseXML } from "./xml.js";
import { round, refKey } from "./context.js";

const textOf = (el) => el.text.split(/\s+/).filter(Boolean).join(" ") || null;

function parseBranch(el) {
  const node = { id: el.attrs.id || null,
                 eventbased: el.attrs.eventbased === "true",
                 kind: el.tag.toLowerCase(), talk: [], options: [] };
  for (const child of el.children) {
    const tag = child.tag.toLowerCase();
    if (tag === "talk") {
      const t = textOf(child);
      if (t) node.talk.push(t);
    } else if (tag === "options") {
      for (const opt of child.children) {
        node.options.push({ text: textOf(opt), goto: opt.attrs.goto || null });
      }
    } else if (tag === "option") {
      node.options.push({ text: textOf(child), goto: child.attrs.goto || null });
    }
  }
  return node;
}

export function parseDialogueTree(xml) {
  const root = parseXML(xml);
  if (!root) return null;
  const branches = {};
  const characters = [];
  let start = null;

  const walk = (el) => {
    const tag = el.tag.toLowerCase();
    if (tag === "branch" || tag === "convo") {
      const b = parseBranch(el);
      if (b.id) branches[b.id] = b;
      if (el.attrs.start === "true" && start === null) start = b.id;
      return;
    }
    if (tag === "character" && el.attrs.name) characters.push(el.attrs.name);
    for (const c of el.children) walk(c);
  };
  walk(root);

  if (start === null) start = Object.keys(branches)[0] ?? null;
  return { start, branches, characters };
}

export function extractDialogue(ctx) {
  const trees = {};
  const stats = { arbres: 0, branches: 0, repliques: 0, options: 0, "non analysable": 0 };

  for (const o of ctx.env.objects({ type: "TextAsset" })) {
    const v = ctx.env.read(o);
    if (!v) continue;
    const xml = new TextDecoder("utf-8").decode(v.m_Script);
    const t = parseDialogueTree(xml);
    if (t && Object.keys(t.branches).length) {
      // Indexe par `fichier:path_id` : un path_id nu se repete d'un fichier a
      // l'autre, et deux arbres homonymes se seraient ecrases (§2.7).
      trees[refKey(o)] = { name: v.m_Name, ...t };
      stats.arbres++;
      for (const b of Object.values(t.branches)) {
        stats.branches++;
        stats.repliques += b.talk.length;
        stats.options += b.options.length;
      }
    } else {
      stats["non analysable"]++;
    }
  }

  // Controleurs de personnage, indexes par GameObject.
  //
  // Pourquoi cet index, et pourquoi PAR GAMEOBJECT. Le Conservateur — celui-la
  // meme qui accorde les codes de lancement — a un `_activeDialogueTree` NUL
  // dans la scene, et ce n'est pas un oubli du build : `CuratorConvoController`
  // pose l'arbre a l'execution, dans `OnStartConversation`, en choisissant
  // entre `_preFlightObservations` et `_goodLuck`. Le portage exigeait un arbre
  // deja pose ; il rendait donc le Conservateur INACCESSIBLE, et avec lui le
  // decollage, puisque les codes s'obtiennent en lui parlant.
  //
  // Le lien se fait par GameObject parce que c'est le seul qui soit exact :
  // `Awake` fait `GetComponent<Conversation>()`, donc le controleur et la
  // conversation sont sur le MEME objet. Les rapprocher par le nom ne pouvait
  // pas marcher — les quatorze zones du build s'appellent toutes
  // `ConversationZone`, et le premier trouve gagnait.
  const controllers = new Map();
  for (const { obj, cls } of ctx.behaviours((c) => /convocontroller|convotrigger/i.test(c))) {
    const f = ctx.scriptFields(obj);
    if (!f) continue;
    const gid = ctx.ownerId(obj);
    const owned = {};
    for (const [k, v] of Object.entries(f)) {
      if (!v || typeof v !== "object" || !("pathId" in v)) continue;
      // INVARIANT, le meme qu'ailleurs : n'est retenu comme arbre que ce qui
      // EST un arbre. `SecondLoopConvoTrigger._rocketScientistConversation`
      // vise un composant Conversation, pas un texte.
      const ref = ctx.refOf(v);
      if (ref !== null && trees[ref]) owned[k] = ref;
    }
    if (Object.keys(owned).length) controllers.set(gid, { kind: cls, trees: owned });
  }

  const conversations = [];
  for (const { obj } of ctx.behaviours(["Conversation"])) {
    const f = ctx.scriptFields(obj);
    if (!f) continue;
    const gid = ctx.ownerId(obj);
    // Le pointeur suit son `fileId` : sans cela il visait l'objet de meme
    // path_id dans le fichier de la scene, ce qui n'est pas un arbre.
    const ref = f._activeDialogueTree ? ctx.refOf(f._activeDialogueTree) : null;
    const ctrl = controllers.get(gid) || null;
    conversations.push({
      name: ctx.name(gid),
      character: f._characterName || null,
      isMuseumSign: !!f._isMuseumSign,
      position: ctx.world(gid)[0].map((v) => round(v, 3)),
      tree: ref !== null && trees[ref] ? ref : null,
      controller: ctrl,
    });
  }
  stats.conversations = conversations.length;
  stats["conversations liees"] = conversations.filter((c) => c.tree).length;
  stats["conversations a controleur"] = conversations.filter((c) => c.controller).length;
  // Ce qu'on veut vraiment savoir : combien de conversations sont ATTEIGNABLES,
  // arbre pose dans la scene ou arbre pose par leur controleur.
  stats["conversations jouables"] =
    conversations.filter((c) => c.tree || c.controller).length;

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, trees, conversations, stats };
}
