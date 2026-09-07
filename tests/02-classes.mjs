// Verifie les dispositions des classes moteur : lire un objet doit consommer
// exactement byteSize octets. C'est la seule preuve solide, sans type tree.
import { SerializedFile } from "../web/src/pipeline/unity/serialized.js";
import { readGameObject, readTransform, readMonoScript, readMonoBehaviourHeader,
         readTextAsset } from "../web/src/pipeline/unity/classes.js";
import { BUILD, DATA_FILES, haveBuild, load, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

const EXACT = { GameObject: readGameObject, Transform: readTransform,
                MonoScript: readMonoScript, TextAsset: readTextAsset };

const stats = {};
const samples = {};
for (const name of DATA_FILES) {
  const f = new SerializedFile(name, load(name));
  for (const o of f.objects) {
    const fn = EXACT[o.type];
    if (!fn) continue;
    const s = (stats[o.type] ||= { total: 0, exact: 0, error: 0 });
    s.total++;
    try {
      const r = f.reader(o);
      const v = fn(r, f);
      if (r.pos === o.byteSize) s.exact++;
      else s.error++;
      samples[o.type] ||= v;
    } catch (e) {
      s.error++;
      samples[o.type + "_err"] ||= e.message;
    }
  }
}
for (const [type, s] of Object.entries(stats)) {
  check(`${type} lus exactement (${s.total} objets)`, s.exact, s.total);
  if (s.error) console.log(`     premiere erreur: ${samples[type + "_err"] || "taille consommee != byteSize"}`);
}

// L'entete MonoBehaviour ne consomme pas tout l'objet (les champs du script
// suivent) : on verifie seulement qu'elle ne deborde pas.
let mbTotal = 0, mbOk = 0, mbNoScript = 0;
for (const name of DATA_FILES) {
  const f = new SerializedFile(name, load(name));
  for (const o of f.objects) {
    if (o.type !== "MonoBehaviour") continue;
    mbTotal++;
    try {
      const r = f.reader(o);
      const h = readMonoBehaviourHeader(r, f);
      if (r.pos <= o.byteSize) mbOk++;
      if (!h.m_Script) mbNoScript++;
    } catch { /* compte comme echec */ }
  }
}
check("entetes MonoBehaviour lues", mbOk, mbTotal);
// Un MonoBehaviour de resources.assets a un m_Script nul : c'est le contenu du
// build, pas un defaut de lecture.
check("MonoBehaviour sans script", mbNoScript, 1);
console.log("\nexemples:", JSON.stringify({
  GameObject: samples.GameObject && samples.GameObject.m_Name,
  Transform: samples.Transform && samples.Transform.m_LocalPosition,
  MonoScript: samples.MonoScript && samples.MonoScript.m_ClassName,
  TextAsset: samples.TextAsset && samples.TextAsset.m_Name,
}));
report();
