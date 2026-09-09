// Verifie les extracteurs contre les chiffres du pipeline Python (README.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UnityEnv } from "../web/src/pipeline/unity/env.js";
import { TypeUniverse } from "../web/src/pipeline/dotnet/typetree.js";
import { ExtractContext } from "../web/src/pipeline/extract/context.js";
import { extractScene } from "../web/src/pipeline/extract/scene.js";
import { extractComponents } from "../web/src/pipeline/extract/components.js";
import { extractSolarSystem } from "../web/src/pipeline/extract/solar.js";
import { extractGameplay } from "../web/src/pipeline/extract/gameplay.js";
import { extractAudio } from "../web/src/pipeline/extract/audio.js";
import { extractLighting } from "../web/src/pipeline/extract/lighting.js";
import { BUILD, DATA_FILES, haveBuild, load, loadEnv, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];
const u = new TypeUniverse();
for (const a of ASSEMBLIES) u.add(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`))));
const env = await loadEnv();

// Structures des classes moteur : le Worker les recupere par fetch, les tests
// par le disque. Sans elles, ni les AudioSource ni les Light ne se lisent.
const engineTypes = JSON.parse(readFileSync(
  "web/src/pipeline/unity/unity41-types.json", "utf8"));

console.time("indexation");
const ctx = new ExtractContext(env, u, "level0", engineTypes);
console.timeEnd("indexation");

console.time("scene");
const scene = extractScene(ctx);
console.timeEnd("scene");
check("noeuds de scene", scene.node_count, 7688);
check("composants recenses", scene.component_count, 16271);

console.time("composants");
const comps = extractComponents(ctx);
console.timeEnd("composants");
check("MonoBehaviour avec valeurs", comps.count, 1390);

console.time("systeme solaire");
const solar = extractSolarSystem(ctx);
console.timeEnd("systeme solaire");
check("corps du systeme solaire", solar.bodies.length, 17);
const withGravity = solar.bodies.filter((b) => b.gravity && b.gravity.surfaceAcceleration);
console.log("     corps avec gravite:", withGravity.length);
for (const b of solar.bodies.slice(0, 6)) {
  const g = b.gravity || {};
  console.log(`       ${(b.name || "?").padEnd(24)} d=${Math.hypot(...b.position).toFixed(0).padStart(7)} g=${g.surfaceAcceleration ?? "-"} r=${g.upperSurfaceRadius ?? "-"}`);
}

console.time("gameplay");
const gp = extractGameplay(ctx);
console.timeEnd("gameplay");
const n = (k) => (gp.placed[k] || []).length;
check("objets interactifs", n("InteractReceiver"), 39);
check("objets lisibles", n("ReadableObject"), 34);
check("points d'apparition", n("SpawnPoint"), 16);
const withText = (gp.placed.ReadableObject || []).filter((x) => x.text).length;
console.log("     lisibles avec texte:", withText, "| systemes uniques:", Object.keys(gp.singletons).length);

// --- ce que le build portait et que le portage ne lisait pas ---
//
// Voir docs/34-actions.md. Ces extracteurs sont neufs : on releve ici ce qu'ils
// sortent, et on garde en invariant ce qui ne peut pas etre autrement.

console.time("audio");
const audioFiles = [];
// `maxClips` doit rester HAUT. Une source n'est retenue que si le nom de son
// clip a ete enregistre, et ce nom ne l'est qu'au moment de l'export : avec
// maxClips a 0, la carte des sources sortait VIDE, et l'invariant « aucune
// portee de repli » passait sur une liste vide sans rien verifier. Les octets,
// eux, sont jetes ici — ce qu'on mesure, c'est la carte.
const audio = extractAudio(ctx, (name, bytes) => audioFiles.push({ name, bytes }),
                           { maxClips: 400 });
console.timeEnd("audio");
// A2 : MinDistance / MaxDistance existent bien en 4.1 sans le prefixe m_.
// Une portee de repli signale une source dont le champ n'a pas ete lu.
check("des sources audio sont placees", audio.sources.length > 0, true);
check("aucune portee audio de repli", audio.stats["portee de repli"] ?? 0, 0);
const ranges = new Set((audio.sources || []).map((s) => s.range));
// Les portees du build ne ressemblent pas aux replis par piste (60/150/300) :
// elles vont de 10 a 4 000. Une distribution qui s'y reduirait signalerait un
// retour en arriere.
check("les portees ne sont pas les trois valeurs inventees", ranges.size > 3, true);
const rolloffs = audio.sources.reduce((a, s) => (a[s.rolloff] = (a[s.rolloff] || 0) + 1, a), {});
console.log("     sources:", audio.sources.length,
            "| portees distinctes:", ranges.size,
            `[${[...ranges].sort((a, b) => a - b).join(", ")}]`,
            "| rolloff:", JSON.stringify(rolloffs));

console.time("lumieres");
const lighting = extractLighting(ctx);
console.timeEnd("lumieres");
// A3/A4 : le moteur n'avait que deux lumieres inventees, et fog.js portait des
// RenderSettings recopies a la main.
check("des lumieres sont posees dans la scene", lighting.lights.length > 0, true);
check("les RenderSettings de la scene sont lus", !!lighting.settings, true);
console.log("     lumieres:", JSON.stringify(lighting.stats.types),
            "| brouillard:", lighting.settings && lighting.settings.fogMode,
            JSON.stringify(lighting.settings && lighting.settings.fogColor));

// A6/A7/A8/A11 : les familles ramassees par motif. Un compte nul n'est pas une
// erreur — c'est la reponse a « l'alpha en pose-t-elle ? », qui n'avait jamais
// ete posee.
for (const [k, v] of Object.entries(gp.stats.decouvertes || {})) {
  console.log(`     decouvert: ${k} x${v}`);
}
console.log("     champs directionnels:", n("DirectionalForceField"),
            "| fluides (solaire):", (solar.fluids || []).length,
            "| ChildColliderLOD:", n("ChildColliderLOD"));
const volumes = (gp.placed.DirectionalForceField || []).filter((e) => e.volume).length;
console.log("     champs avec volume mesure:", volumes,
            "/", n("DirectionalForceField"));

// --- ce que l'audit a mesure, garde en invariant ---
//
// docs/36-audit.md. Chaque ligne ci-dessous chiffre une affirmation du portage
// que la mesure a dementie : elles ne peuvent plus redevenir fausses en
// silence.

// §1.2 : « la poussee d'Archimede n'est pas dans le build ». TOUS les volumes
// portent une densite, de 0,2 a 500.
const milieux = [];
for (const [cls, list] of Object.entries(gp.placed)) {
  if (!/fluid|ocean/i.test(cls) || /detector/i.test(cls)) continue;
  for (const e of list) milieux.push({ cls, e });
}
check("le build pose des volumes de fluide", milieux.length > 0, true);
check("tous portent une densite",
      milieux.filter(({ e }) => typeof (e.fields || {})._density === "number").length,
      milieux.length);

// §1.2 : les tornades de Giant's Deep portent un COURANT, et c'est le contenu
// jouable de la planete. Le portage les lisait comme de simples volumes.
const courants = milieux.filter(({ e }) => (e.fields || {})._flowSpeed);
console.log("     fluides:", milieux.length, "| avec courant:", courants.length,
            "| densites:", JSON.stringify([...new Set(milieux
              .map(({ e }) => (e.fields || {})._density))].sort((a, b) => a - b)));
check("des volumes portent un courant", courants.length > 0, true);
check("... et ce sont des capsules, pas des spheres",
      courants.every(({ e }) => !e.volume || e.volume.shape === "capsule"), true);

// §2.3 : la trainee est portee par le DETECTEUR, pas par le volume.
const detecteurs = Object.entries(gp.placed)
  .filter(([cls]) => /fluiddetector/i.test(cls))
  .flatMap(([cls, l]) => l.map((e) => ({ cls, e })));
check("les detecteurs de fluide sont extraits", detecteurs.length > 0, true);
check("... et portent leur facteur de trainee",
      detecteurs.some(({ e }) => typeof (e.fields || {})._dragFactor === "number"), true);

// §2.9 : `PolarForceField` etait extrait et jamais lu.
const polaires = Object.entries(gp.placed)
  .filter(([cls]) => /polar.*forcefield/i.test(cls))
  .flatMap(([, l]) => l);
console.log("     champs polaires:", polaires.length,
            polaires.map((e) => (e.fields || {})._acceleration).join(", "));

// §1.3 : 83 sources sur 97 sont en attenuation `custom`, 14 en `logarithmic`,
// AUCUNE en lineaire — le seul mode dans lequel le portage les rendait.
check("aucune source n'est en attenuation lineaire", rolloffs.linear ?? 0, 0);
check("l'attenuation `custom` est majoritaire",
      (rolloffs.custom ?? 0) > (rolloffs.logarithmic ?? 0), true);
const courbes = audio.sources.filter((x) => x.rolloffCurve).length;
console.log("     sources avec courbe echantillonnee:", courbes,
            "/", (rolloffs.custom ?? 0));

// §2.7 : l'objet vise par un controleur de dialogue est un ARBRE, jamais un
// Transform. Le `fileId` etait perdu au dereferencement, et les pointeurs se
// resolvaient en os de squelette (`anglerfish_rig:UpTail4`).
check("aucun pointeur de controleur ne vise autre chose qu'un texte",
      gp.stats["references non textuelles"] ?? null, null);
const ctrls = Object.entries(gp.placed)
  .filter(([cls]) => /convocontroller|convotrigger/i.test(cls))
  .flatMap(([cls, l]) => l.map((e) => ({ cls, e })));
console.log("     controleurs de dialogue:", ctrls.length,
            "| avec arbres:", ctrls.filter(({ e }) => e.trees).length);

// A9 : mainData n'etait jamais extrait — l'ExtractContext etait construit sur
// level0 seul, et ses 989 objets ne sortaient pas.
console.time("mainData");
const mctx = new ExtractContext(env, u, "mainData", engineTypes);
const mscene = extractScene(mctx);
console.timeEnd("mainData");
check("mainData contient des objets", mscene.node_count > 0, true);
console.log("     mainData:", mscene.node_count, "noeuds,",
            mscene.component_count, "composants");

// Le JSON doit etre serialisable : ni NaN ni Infinity, que le pipeline Python
// filtrait explicitement (plusieurs champs du jeu en contiennent).
for (const [label, obj] of [["scene", scene], ["composants", comps],
                            ["solaire", solar], ["gameplay", gp],
                            ["audio", audio], ["lumieres", lighting],
                            ["mainData", mscene]]) {
  let ok = true;
  try { JSON.stringify(obj); } catch { ok = false; }
  check(`${label} serialisable en JSON`, ok, true);
}
report();
