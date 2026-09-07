#!/usr/bin/env node
// Lance les tests. La plupart lisent un build extrait, pointe par OW_BUILD ;
// sans lui ils s'annoncent ignores plutot que d'echouer, pour que l'integration
// continue reste verte sans jamais avoir a heberger le jeu.
//
// Chaque fichier decide lui-meme de ce qu'il peut verifier sans le build : le
// decodage des clips d'animation, par exemple, s'eprouve sur un flux fabrique.
// Ils sont donc tous lances, build ou pas.

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const BUILD = process.env.OW_BUILD;
if (!BUILD || !existsSync(join(BUILD, "level0"))) {
  console.log("OW_BUILD ne pointe pas sur un build extrait : tout ce qui le demande sera ignore.");
  console.log("Pour tout lancer : OW_BUILD=/chemin/vers/OuterWilds_Alpha_1_2_Data node scripts/run-tests.mjs\n");
}

const tests = readdirSync("tests").filter((f) => /^\d+-.*\.mjs$/.test(f)).sort();
let failed = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, ["--max-old-space-size=6000", join("tests", t)],
                      { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
console.log(`\n${tests.length - failed}/${tests.length} fichiers de test passes.`);
process.exit(failed ? 1 : 0);
