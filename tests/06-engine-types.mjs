// Verifie les structures moteur d'unity41-types.json contre le build : lire un
// objet doit consommer exactement ses byteSize octets. C'est le meme oracle que
// pour les classes ecrites a la main, applique a tout le reste du moteur.
import { readFileSync } from "node:fs";
import { UnityEnv } from "../web/src/pipeline/unity/env.js";
import { readTypeTree } from "../web/src/pipeline/unity/typetree.js";
import { readAudioClip } from "../web/src/pipeline/unity/classes.js";
import { BUILD, DATA_FILES, haveBuild, load, loadEnv, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

const TYPES = JSON.parse(readFileSync(
  new URL("../web/src/pipeline/unity/unity41-types.json", import.meta.url), "utf8"));
const env = await loadEnv();

const stats = new Map();
for (const o of env.objects()) {
  const nodes = TYPES.classes[o.type];
  // MonoBehaviour a un arbre par script, AudioClip un lecteur dedie (flux .resS).
  if (!nodes || o.type === "MonoBehaviour" || o.type === "AudioClip") continue;
  const s = stats.get(o.type) || { total: 0, exact: 0, bad: 0, why: null };
  s.total++;
  try {
    const r = o.file.reader(o);
    readTypeTree(r, nodes, o.file);
    if (r.pos === o.byteSize) s.exact++;
    else { s.bad++; s.why ||= `consomme ${r.pos} au lieu de ${o.byteSize}`; }
  } catch (e) { s.bad++; s.why ||= e.message; }
  stats.set(o.type, s);
}

let allExact = 0, allTotal = 0;
for (const [type, s] of [...stats.entries()].sort((a, b) => b[1].total - a[1].total)) {
  allTotal += s.total; allExact += s.exact;
  const flag = s.bad ? "FAIL" : "ok  ";
  console.log(`${flag} ${type.padEnd(24)} ${s.exact}/${s.total}${s.bad ? `  (${s.why})` : ""}`);
}
check("objets moteur lus au bit pres", allExact, allTotal);

// AudioClip : lecteur dedie, verifie de la meme facon.
let clipTotal = 0, clipExact = 0, streamed = 0;
for (const o of env.objects({ type: "AudioClip" })) {
  clipTotal++;
  try {
    const r = o.file.reader(o);
    const c = readAudioClip(r, o.file);
    if (c.data === null) streamed++;
    if (r.pos === o.byteSize) clipExact++;
  } catch { /* compte comme echec */ }
}
check("AudioClip lus au bit pres", clipExact, clipTotal);
console.log(`     dont ${streamed} avec leurs octets dans le .resS`);
report();
