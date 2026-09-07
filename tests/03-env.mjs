// Verifie la resolution des PPtr entre fichiers : c'est elle qui donne le nom
// du script C# attache a chaque MonoBehaviour.
import { UnityEnv } from "../web/src/pipeline/unity/env.js";
import { BUILD, DATA_FILES, haveBuild, load, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

const env = new UnityEnv();
for (const n of DATA_FILES) env.add(n, load(n));

let named = 0, total = 0;
const classes = new Map();
for (const o of env.objects({ type: "MonoBehaviour", file: "level0" })) {
  total++;
  const n = env.scriptName(o);
  if (n) { named++; classes.set(n, (classes.get(n) || 0) + 1); }
}
check("MonoBehaviour de level0", total, 1390);
check("scripts C# resolus", named, 1390);
console.log(`     ${classes.size} classes distinctes, top:`,
  [...classes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => `${k}=${v}`).join(" "));
report();
