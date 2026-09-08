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
import { extractLights } from "../web/src/pipeline/extract/lights.js";
import { BUILD, DATA_FILES, haveBuild, load, loadEnv, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];
const u = new TypeUniverse();
for (const a of ASSEMBLIES) u.add(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`))));
const env = await loadEnv();

// Les classes moteur sont injectees comme dans le Worker : sans elles, ni les
// AudioSource ni les Light ne se lisent.
const engineTypes = JSON.parse(readFileSync(
  new URL("../web/src/pipeline/unity/unity41-types.json", import.meta.url), "utf8"));

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

// --- portees audio ---------------------------------------------------------
//
// Elles doivent venir de la SOURCE (MinDistance / MaxDistance), pas d'une
// valeur choisie par piste : aucune ne doit plus valoir exactement 60, 150 ou
// 300 par construction.
console.time("audio");
const audio = extractAudio(ctx, () => {});
console.timeEnd("audio");
const ranges = audio.sources.map((s) => s.range);
const parDefaut = new Set([60, 150, 300]);
check("portees audio lues sur la source",
      ranges.some((r) => !parDefaut.has(r)), true);
check("aucune portee de repli", audio.stats["portee de repli"] ?? 0, 0);
check("min et max distance releves",
      audio.sources.every((s) => s.minDistance !== null), true);
check("des sources restent spatiales", audio.sources.some((s) => s.spatial), true);
check("la spatialisation ne retombe pas sur la piste",
      audio.stats["spatialisation retombee sur la piste"] ?? 0, 0);
console.log("     portees distinctes:", new Set(ranges).size,
            "| modes de rolloff:", [...new Set(audio.sources.map((s) => s.rolloff))].join(","));

// --- lumieres placees ------------------------------------------------------
console.time("lumieres");
const lights = extractLights(ctx);
console.timeEnd("lumieres");
check("lumieres extraites", lights.lights.length > 0, true);
console.log("     lumieres par type:", JSON.stringify(lights.stats),
            "| brouillard:", JSON.stringify(lights.render && lights.render.fog));

// Le JSON doit etre serialisable : ni NaN ni Infinity, que le pipeline Python
// filtrait explicitement (plusieurs champs du jeu en contiennent).
for (const [label, obj] of [["scene", scene], ["composants", comps],
                            ["solaire", solar], ["gameplay", gp],
                            ["audio", audio], ["lumieres", lights]]) {
  let ok = true;
  try { JSON.stringify(obj); } catch { ok = false; }
  check(`${label} serialisable en JSON`, ok, true);
}
report();
