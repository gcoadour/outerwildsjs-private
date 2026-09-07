#!/usr/bin/env node
// Garde-fou : aucun contenu d'Outer Wilds ne doit entrer au depot.
//
// Le depot ne porte que l'outillage. Les binaires, assets et sources
// decompilees du jeu sont la propriete de Mobius Digital et d'Alex Beachum ;
// la page GitHub Pages ne les sert pas, elle les reconstruit chez la personne
// qui fournit sa copie. Ce controle echoue si un fichier suspect apparait.

import { execSync } from "node:child_process";
import { statSync } from "node:fs";

// Extensions qui ne peuvent venir que du jeu ou d'une extraction.
const FORBIDDEN_EXT = [
  ".assets", ".ress", ".resS", ".dll", ".zip", ".unity3d", ".bundle",
  ".obj", ".fbx", ".gltf", ".glb", ".shader",
  ".ogg", ".wav", ".mp3", ".ttf", ".otf",
  ".png", ".jpg", ".jpeg", ".tga", ".dds", ".webp",
];

// Chemins ou un fichier du jeu atterrirait.
const FORBIDDEN_DIR = ["data/", "work/", "web/vendor/"];

// Fichiers nommement autorises : ce sont des metadonnees de format Unity,
// publiees par le projet TypeTreeDumps d'AssetRipper, et non du contenu du jeu.
const ALLOWED = new Set([
  "web/src/pipeline/unity/unity41-types.json",
]);

// Un fichier volumineux au depot est suspect en soi, quelle que soit son
// extension : le pipeline ne produit que du texte et des scripts.
const MAX_BYTES = 512 * 1024;

const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n").filter(Boolean);

const problems = [];
for (const f of files) {
  if (ALLOWED.has(f)) continue;
  const lower = f.toLowerCase();
  if (FORBIDDEN_EXT.some((e) => lower.endsWith(e.toLowerCase()))) {
    problems.push(`${f} : extension interdite au depot`);
    continue;
  }
  if (FORBIDDEN_DIR.some((d) => f.startsWith(d))) {
    problems.push(`${f} : ce chemin recoit du contenu extrait, il doit rester ignore`);
    continue;
  }
  const size = statSync(f).size;
  if (size > MAX_BYTES) {
    problems.push(`${f} : ${(size / 1024).toFixed(0)} Ko, au-dela des ${MAX_BYTES / 1024} Ko autorises`);
  }
}

if (problems.length) {
  console.error("Contenu interdit au depot :\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${problems.length} fichier(s) en cause.`);
  process.exit(1);
}
console.log(`${files.length} fichiers verifies, aucun contenu du jeu au depot.`);
