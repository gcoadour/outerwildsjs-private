// Banc d'essai du pipeline, execute sous Node sur un build extrait localement.
// Le build n'est jamais versionne : ce script ne tourne que si OW_BUILD pointe
// sur un dossier *_Data existant.
import { readFileSync, existsSync, openSync, readSync, closeSync,
         statSync as nodeStatSync } from "node:fs";
import { join } from "node:path";

export const BUILD = process.env.OW_BUILD
  || "/home/user/work/game/OuterWilds_Alpha_1_2_Data";

export const DATA_FILES = ["mainData", "level0", "resources.assets",
                           "sharedassets0.assets", "sharedassets1.assets"];
// level0 pointe vers "library/unity default resources" : sans ce fichier, les
// renvois vers les shaders et polices integres d'Unity restent non resolus.
export const EXTRA_FILES = ["Resources/unity default resources"];
export const RESOURCE_FILES = ["sharedassets1.assets.resS"];

/** Charge un monde Unity complet depuis le build local. */
export async function loadEnv() {
  const { UnityEnv } = await import("../web/src/pipeline/unity/env.js");
  const env = new UnityEnv();
  for (const r of RESOURCE_FILES) {
    if (existsSync(join(BUILD, r))) env.addResource(r, new FdSource(join(BUILD, r)));
  }
  for (const n of [...DATA_FILES, ...EXTRA_FILES]) {
    if (existsSync(join(BUILD, n))) env.add(n, new FdSource(join(BUILD, n)));
  }
  return env;
}

export function haveBuild() { return existsSync(join(BUILD, "level0")); }
export function load(name) { return new Uint8Array(readFileSync(join(BUILD, name))); }

/**
 * Source d'octets adossee au disque, equivalent Node du
 * FileSystemSyncAccessHandle utilise dans le Worker. Les tests passent par elle
 * pour eprouver le chemin paresseux, celui qui tourne reellement dans le
 * navigateur, plutot qu'un chargement integral que le navigateur ne fera jamais.
 */
export class FdSource {
  constructor(path) {
    this.fd = openSync(path, "r");
    this.size = nodeStatSync(path).size;
  }
  get length() { return this.size; }
  read(offset, length) {
    const n = Math.max(0, Math.min(length, this.size - offset));
    const out = new Uint8Array(n);
    if (n) readSync(this.fd, out, 0, n, offset);
    return out;
  }
  close() { closeSync(this.fd); }
}



let failures = 0, checks = 0;
export function check(label, actual, expected) {
  checks++;
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${actual}${ok ? "" : ` (attendu ${expected})`}`);
}
export function report() {
  console.log(`\n${checks - failures}/${checks} verifications passees`);
  if (failures) process.exitCode = 1;
}
