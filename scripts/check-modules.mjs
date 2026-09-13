#!/usr/bin/env node
// Charge chaque module du pipeline pour verifier qu'il s'analyse et que ses
// imports resolvent.
//
// Les modules du MOTEUR (main.js et ce qu'il entraine) touchent au DOM des leur
// chargement : sous Node ils echouent par construction, ce qui ne dit rien de
// leur validite. On ne les charge donc pas — on les COMPILE, ce qui attrape ce
// qui les concerne vraiment ici : une faute de syntaxe, un import en double, une
// accolade oubliee.
//
// Sans cette seconde passe, une faute de syntaxe dans `main.js` ne faisait
// echouer ni les tests (qui ne l'importent pas) ni ce script (qui l'ignorait) :
// elle attendait l'ouverture de la page, c'est-a-dire un navigateur.

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

// `vm.SourceTextModule` demande --experimental-vm-modules. Plutot que d'exiger
// le drapeau de l'appelant — l'integration continue lance ce script tel quel —
// on se relance une fois avec. `node --check`, lui, ne convient pas : sur un
// fichier `.js` sans package.json il rend 0 sur du code manifestement casse.
if (!vm.SourceTextModule && !process.env.OW_RELANCE) {
  const r = spawnSync(process.execPath,
    ["--experimental-vm-modules", "--no-warnings", ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, OW_RELANCE: "1" } });
  process.exit(r.status ?? 1);
}

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
console.log(`${files.length - failures}/${files.length} modules du pipeline charges.`);

// --- le moteur : compile, pas charge ---------------------------------------
const engine = walk("web/src").filter((f) => !f.includes("/pipeline/"));
let broken = 0;
for (const f of engine) {
  try {
    if (vm.SourceTextModule) new vm.SourceTextModule(readFileSync(f, "utf8"), { identifier: f });
  } catch (e) {
    console.error(`FAIL ${f}\n     ${e.message}`);
    broken++;
  }
}
console.log(`${engine.length - broken}/${engine.length} modules du moteur compiles.`);
if (failures || broken) process.exit(1);
