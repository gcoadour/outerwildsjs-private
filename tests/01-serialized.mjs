import { SerializedFile } from "../web/src/pipeline/unity/serialized.js";
import { BUILD, DATA_FILES, haveBuild, load, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

// Comptes attendus, releves dans docs/01-build.md.
const EXPECTED = { mainData: 989, level0: 24032, "resources.assets": 174,
                   "sharedassets0.assets": 621, "sharedassets1.assets": 2390 };
let total = 0;
for (const name of DATA_FILES) {
  const f = new SerializedFile(name, load(name));
  check(`${name} objets`, f.objects.length, EXPECTED[name]);
  check(`${name} version unity`, f.unityVersion, "4.1.2f1");
  total += f.objects.length;
  if (name === "level0") {
    const c = f.countByType();
    console.log("     level0 top types:",
      [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([k, v]) => `${k}=${v}`).join(" "));
    console.log("     externals:", f.externals.join(", ") || "(aucun)");
  }
}
// 989+24032+174+621+2390 = 28206. docs/01-build.md annoncait 28286 : erreur d'addition,
// corrigee dans la doc — chaque compte par fichier, lui, correspond.
check("total objets du build", total, 28206);
report();
