// Verifie le lecteur d'archive sur l'archive reelle de l'alpha. Node fournit
// Blob et DecompressionStream, donc exactement les memes primitives que le
// navigateur : ce test couvre le code qui tourne dans l'onglet.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readZipDirectory, openZipEntry } from "../web/src/pipeline/zip.js";
import { BUILD, check, report } from "./run.mjs";

const ZIP = process.env.OW_ZIP || "/home/user/work/downloads/OuterWilds_Alpha_1_2_Linux.zip";
if (!existsSync(ZIP)) {
  console.log(`archive absente (${ZIP}) — test ignore`);
  process.exit(0);
}

const blob = new Blob([readFileSync(ZIP)]);
const entries = await readZipDirectory(blob);
console.log(`${entries.length} entrees dans l'archive`);

const level0 = entries.find((e) => /_Data\/level0$/.test(e.name));
check("level0 present dans l'archive", !!level0, true);
check("taille annoncee de level0", level0.size, 24014656);

// Decompresser et comparer l'empreinte au fichier extrait par unzip : c'est la
// preuve que le chemin navigateur produit exactement les memes octets.
const stream = await openZipEntry(blob, level0);
const hash = createHash("sha256");
let total = 0;
const reader = stream.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  hash.update(value);
  total += value.length;
}
check("octets decompresses", total, level0.size);

if (existsSync(`${BUILD}/level0`)) {
  const expected = createHash("sha256").update(readFileSync(`${BUILD}/level0`)).digest("hex");
  check("empreinte identique a l'extraction par unzip", hash.digest("hex"), expected);
} else {
  console.log("build extrait absent : comparaison d'empreinte ignoree");
}
report();
