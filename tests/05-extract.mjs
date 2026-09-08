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
const audio = extractAudio(ctx, (name, bytes) => audioFiles.push({ name, bytes }),
                           { maxClips: 0 });
console.timeEnd("audio");
// A2 : MinDistance / MaxDistance existent bien en 4.1 sans le prefixe m_.
// Une portee de repli signale une source dont le champ n'a pas ete lu.
check("aucune portee audio de repli", audio.stats["portee de repli"] ?? 0, 0);
const ranges = new Set((audio.sources || []).map((s) => s.range));
console.log("     portees distinctes:", ranges.size,
            "| rolloff:", new Set(audio.sources.map((s) => s.rolloff)).size, "modes");

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
