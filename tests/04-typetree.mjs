// Verifie la regeneration des type trees depuis les assemblies : lire un
// MonoBehaviour avec l'arbre genere doit consommer exactement ses byteSize
// octets. Le pipeline Python obtenait 1 364/1 390 (98,1 %).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UnityEnv } from "../web/src/pipeline/unity/env.js";
import { readTypeTree } from "../web/src/pipeline/unity/typetree.js";
import { TypeUniverse, monoBehaviourTree } from "../web/src/pipeline/dotnet/typetree.js";
import { BUILD, DATA_FILES, haveBuild, load, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];
const u = new TypeUniverse();
for (const a of ASSEMBLIES) {
  u.add(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`))));
}

const env = new UnityEnv();
for (const n of DATA_FILES) env.add(n, load(n));

const trees = new Map();
function treeFor(cls) {
  if (!trees.has(cls)) trees.set(cls, monoBehaviourTree(u, cls));
  return trees.get(cls);
}

let total = 0, exact = 0, noTree = 0, short = 0, over = 0, err = 0;
const bad = new Map();
for (const o of env.objects({ type: "MonoBehaviour", file: "level0" })) {
  total++;
  const cls = env.scriptName(o);
  const nodes = cls && treeFor(cls);
  if (!nodes) { noTree++; bad.set(`sans arbre:${cls}`, (bad.get(`sans arbre:${cls}`) || 0) + 1); continue; }
  try {
    const r = o.file.reader(o);
    readTypeTree(r, nodes, o.file);
    if (r.pos === o.byteSize) exact++;
    else {
      const k = `${cls} ${r.pos > o.byteSize ? "deborde" : "incomplet"}`;
      bad.set(k, (bad.get(k) || 0) + 1);
      if (r.pos > o.byteSize) over++; else short++;
    }
  } catch (e) {
    err++;
    const k = `${cls} ${e.constructor.name}`;
    bad.set(k, (bad.get(k) || 0) + 1);
  }
}

console.log(`total ${total} | exacts ${exact} | sans arbre ${noTree} | incomplets ${short} | debordent ${over} | erreurs ${err}`);
if (bad.size) {
  console.log("problemes les plus frequents :");
  for (const [k, v] of [...bad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`   ${v.toString().padStart(4)}  ${k}`);
  }
}
check("MonoBehaviour de level0 lus au bit pres", exact, 1390);
console.log(`     soit ${(100 * exact / total).toFixed(1)} % (pipeline Python : 98,1 %)`);

// Meme controle sur les cinq fichiers : rien ne doit deborder nulle part.
let allTotal = 0, allExact = 0, allOther = 0;
for (const o of env.objects({ type: "MonoBehaviour" })) {
  allTotal++;
  const cls = env.scriptName(o);
  const nodes = cls && treeFor(cls);
  if (!nodes) { allOther++; continue; }
  try {
    const r = o.file.reader(o);
    readTypeTree(r, nodes, o.file);
    if (r.pos === o.byteSize) allExact++; else allOther++;
  } catch { allOther++; }
}
// L'unique MonoBehaviour sans script (resources.assets) n'a pas d'arbre.
check("MonoBehaviour du build entier lus au bit pres", allExact, allTotal - 1);

// Controle de valeur : la gravite de Timber Hearth doit etre celle du jeu.
let gw = null;
for (const o of env.objects({ type: "MonoBehaviour", file: "level0" })) {
  if (env.scriptName(o) !== "GravityWell") continue;
  const v = readTypeTree(o.file.reader(o), treeFor("GravityWell"), o.file).value;
  if (v._surfaceAcceleration > 11 && v._surfaceAcceleration < 13) { gw = v; break; }
}
check("un GravityWell a un rayon de surface plausible",
      !!gw && gw._upperSurfaceRadius > 0 && gw._upperSurfaceRadius < 10000, true);
if (gw) console.log(`     exemple: g=${gw._surfaceAcceleration} r=${gw._upperSurfaceRadius} falloff=${gw._falloffType}`);
report();
