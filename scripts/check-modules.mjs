#!/usr/bin/env node
// Charge chaque module du pipeline pour verifier qu'il s'analyse et que ses
// imports resolvent.
//
// Seul le pipeline est couvert. Les modules du moteur (main.js et ce qu'il
// entraine) touchent au DOM des leur chargement : sous Node ils echouent par
// construction, ce qui ne dit rien de leur validite. Ils sont couverts par
// l'ouverture reelle de la page.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BROWSER_ONLY = /navigator|document|self is not defined|OffscreenCanvas|Worker|DecompressionStream/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Une erreur d'API navigateur peut survenir apres la resolution de l'import :
// sans ce filet, elle termine le processus au lieu d'etre classee.
process.on("unhandledRejection", (e) => {
  if (!BROWSER_ONLY.test(String(e && e.message))) throw e;
});

const files = [...walk("web/src/pipeline"), "web/src/vfs.js"];
let failures = 0;
for (const f of files) {
  try {
    await import(pathToFileURL(f).href);
  } catch (e) {
    if (BROWSER_ONLY.test(e.message)) continue;
    console.error(`FAIL ${f}\n     ${e.message}`);
    failures++;
  }
}
console.log(`${files.length - failures}/${files.length} modules charges.`);
if (failures) process.exit(1);
