// Les commandes du jeu, lues dans `mainData` : ce sur quoi on appuie.
//
// Aucun composant ne les porte. Elles sont dans l'`InputManager`, un des
// dix-neuf reglages de projet que Unity 4 range dans `mainData` — et le
// portage ne lisait ni ce fichier-la pour ses reglages, ni la classe 13 dont
// `unity41-types.json` n'avait pas la structure. Les touches du jeu etaient
// donc, depuis le debut, celles que le portage avait choisies.
//
// L'`InputManager` decrit des AXES, pas des actions. Le jeu, lui, nomme
// vingt-deux CANAUX (`InputChannels`) et decline chacun en trois axes selon la
// plateforme : `Probe_PC`, `Probe_Mac`, `Probe_Key`. Le suffixe dit la source,
// pas le systeme d'exploitation :
//
//   _Key    clavier et souris
//   _PC     manette, numerotation Windows/Linux
//   _Mac    manette, numerotation OS X (les boutons y sont decales)
//
// On regroupe donc par canal, et on rend pour chacun ce sur quoi il repond.
//
// @lit InputManager, TimeManager, TagManager, InputChannels, InputInitializer

import { round } from "./context.js";

/**
 * Un axe Unity : `type` dit ce qu'on lit.
 *
 *   0  des BOUTONS (`negativeButton` / `positiveButton` et leurs suppleants)
 *   1  le DEPLACEMENT de la souris, sur l'axe `axis`
 *   2  un axe de MANETTE, `axis` etant son numero
 */
const TYPE_BOUTON = 0, TYPE_SOURIS = 1, TYPE_MANETTE = 2;

/** Le nom d'un axe, sans son suffixe de plateforme. */
function canalDe(nom) {
  const m = /^(.*)_(PC|Mac|Key)$/.exec(String(nom));
  return m ? { canal: m[1], source: m[2] } : { canal: String(nom), source: "?" };
}

/** Ce qu'un axe declare, reduit a l'essentiel. */
function liaison(a) {
  if (a.type === TYPE_MANETTE) {
    return { kind: "padAxis", axis: a.axis, invert: !!a.invert,
             dead: round(a.dead, 4) };
  }
  if (a.type === TYPE_SOURIS) {
    return { kind: "mouseMove", axis: a.axis, invert: !!a.invert,
             sensitivity: round(a.sensitivity, 4) };
  }
  const boutons = { neg: [], pos: [] };
  for (const [cle, champ] of [["neg", "negativeButton"], ["pos", "positiveButton"],
                              ["neg", "altNegativeButton"], ["pos", "altPositiveButton"]]) {
    const v = a[champ];
    if (v) boutons[cle].push(v);
  }
  return { kind: "buttons", neg: boutons.neg, pos: boutons.pos,
           snap: !!a.snap, invert: !!a.invert,
           gravity: round(a.gravity, 3), sensitivity: round(a.sensitivity, 3) };
}

/**
 * Les vingt-deux canaux, chacun avec ses trois sources.
 *
 * `Probe` en est le meilleur exemple : `mouse 1` au clavier, `joystick button
 * 5` sur manette PC, `joystick button 14` sur Mac. Trois axes, un canal, un
 * geste.
 */
export function extractInput(ctx) {
  const out = { channels: {}, axisCount: 0, tags: [], layers: {},
                fixedTimestep: null, maxTimestep: null, gravity: null,
                solverIterations: null };
  for (const o of ctx.env.objects({ type: "InputManager", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v || !v.m_Axes) continue;
    out.axisCount = v.m_Axes.length;
    for (const a of v.m_Axes) {
      const { canal, source } = canalDe(a.m_Name);
      if (!out.channels[canal]) out.channels[canal] = {};
      out.channels[canal][source] = liaison(a);
    }
  }
  // `Fixed Timestep` : le pas de physique du jeu. Le portage integre a l'image
  // et non a pas fixe, mais le nombre reste la reference — c'est la duree que
  // `FixedUpdate` vaut, et donc l'unite de tout ce qui s'y compte.
  for (const o of ctx.env.objects({ type: "TimeManager", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v) continue;
    out.fixedTimestep = round(v["Fixed Timestep"], 6);
    out.maxTimestep = round(v["Maximum Allowed Timestep"], 6);
  }
  for (const o of ctx.env.objects({ type: "PhysicsManager", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v) continue;
    // Zero, et ce n'est pas un oubli : Outer Wilds n'utilise pas la gravite de
    // Unity. Chaque corps porte son champ (`gravity.js`).
    out.gravity = v.m_Gravity ? [v.m_Gravity.x, v.m_Gravity.y, v.m_Gravity.z] : null;
    out.solverIterations = v.m_SolverIterationCount ?? null;
  }
  // Les balises et les calques. `OWUtilities.FindWithRequiredTag("Player")`,
  // `LayerMask.NameToLayer("BasicEffectVolume")`, le collider marque
  // `ProbeDetector` que l'ancrage epargne : tous ces noms sont ici, et nulle
  // part ailleurs.
  for (const o of ctx.env.objects({ type: "TagManager", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v) continue;
    out.tags = (v.tags || []).filter(Boolean);
    for (const [k, nom] of Object.entries(v)) {
      const m = /^(?:User|Builtin) Layer (\d+)$/.exec(k);
      if (m && nom) out.layers[m[1]] = nom;
    }
  }
  return out;
}
