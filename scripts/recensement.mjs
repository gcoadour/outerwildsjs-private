#!/usr/bin/env node
// Le recensement : ce que l'alpha pose dans `level0`, et ce que le portage lit.
//
// docs/45-recensement-mesure.md a etabli la methode et docs/44 demandait de la
// rendre rejouable : la voici. Trois questions, dans cet ordre, parce que les
// deux premieres se repondent a tort sans la troisieme.
//
//   1. quelles classes le build pose-t-il, et combien de fois ?
//   2. lesquelles `web/src/` nomme-t-il, texto ?
//   3. lesquelles un MOTIF du moteur attrape-t-il sans les nommer ?
//
// La troisieme est celle qui a failli couter le recensement : `OxygenVolume`
// n'apparait nulle part dans `web/src/`, et pourtant il est lu — par `/oxygen/i`.
// Compter sans elle donnait 44 classes absentes de trop.
//
//   OW_BUILD=/chemin/vers/..._Data node scripts/recensement.mjs [--json]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, haveBuild, BUILD } from "../tests/run.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "web/src");

/**
 * Le texte d'un module, ses COMMENTAIRES retires.
 *
 * Sans cela le recensement se ment a lui-meme, et il l'a fait : `TwirlEffect`,
 * `MotionBlur` et `Fisheye` n'existent dans `web/src/` que dans une ligne de
 * commentaire de `shaders/index.js` qui les cite en exemple, et le compte les
 * donnait pour lus. Une classe nommee dans un commentaire est une classe dont
 * quelqu'un a parle, pas une classe que le moteur lit.
 *
 * Le decoupage est naif — une chaine contenant `//` perd sa fin — et c'est sans
 * consequence ici : on n'y cherche que des noms de classe.
 */
function sansCommentaires(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Tous les .js sous web/src/, avec leur texte. */
function sources() {
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".js")) {
        out.push({ path: relative(ROOT, p), text: sansCommentaires(readFileSync(p, "utf8")) });
      }
    }
  })(SRC);
  return out;
}

/**
 * Les expressions regulieres litterales ecrites dans un fichier source.
 *
 * On les relit au lieu de les deviner : un moteur qui attrape une famille par
 * `/tornadobase/i` ne nomme aucune de ses classes, et aucune liste ecrite a la
 * main ne resterait juste. Le decoupage est volontairement naif — un `/` de
 * division mal pris donne au pire un motif qui ne compile pas, et on l'ignore.
 */
function patterns(text) {
  const out = [];
  for (const m of text.matchAll(/\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+)\/([gimsuy]*)/g)) {
    // Un commentaire `// ...` ouvre un faux motif a chaque ligne : on le saute.
    if (m[1].startsWith("/") || m[1].startsWith("*")) continue;
    try { out.push(new RegExp(m[1], m[2].replace(/[gy]/g, ""))); } catch { /* pas un motif */ }
  }
  return out;
}

// Les memes assemblies que tests/05 : sans elles, aucun MonoBehaviour n'a
// d'arbre de type, et le recensement ne voit aucune classe.
const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];

export async function recenser() {
  const env = await loadEnv();
  const { TypeUniverse } = await import("../web/src/pipeline/dotnet/typetree.js");
  const { ExtractContext } = await import("../web/src/pipeline/extract/context.js");
  const engineTypes = JSON.parse(readFileSync(join(SRC, "pipeline/unity/unity41-types.json"), "utf8"));
  const universe = new TypeUniverse();
  for (const a of ASSEMBLIES) {
    universe.add(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`))));
  }
  const ctx = new ExtractContext(env, universe, "level0", engineTypes);

  // 1. ce que le build pose
  const poses = new Map();
  for (const { cls } of ctx.behaviours()) poses.set(cls, (poses.get(cls) || 0) + 1);

  // 2. et 3. ce que le portage en lit
  const files = sources();
  const moteur = files.filter((f) => !f.path.includes("/pipeline/"));
  const motifs = moteur.flatMap((f) => patterns(f.text).map((re) => ({ re, path: f.path })));

  const rows = [];
  for (const [cls, n] of [...poses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const nomme = files.filter((f) => f.text.includes(cls)).map((f) => f.path);
    // La distinction qui compte, et que le compte brut de docs/45 melangeait :
    // une classe que SEUL le pipeline nomme est extraite et lue par personne.
    // C'est la nature de manque que docs/35-monde.md a rencontree, et elle ne
    // se voit pas si l'on compte `web/src/` d'un bloc.
    const parLeMoteur = nomme.filter((p) => !p.includes("/pipeline/"));
    const parMotif = parLeMoteur.length ? [] : motifs.filter((m) => m.re.test(cls)).map((m) => m.path);
    rows.push({ cls, n, nomme, parLeMoteur, parMotif });
  }
  return rows;
}

function principal() {
  return recenser().then((rows) => {
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    const classes = rows.length;
    const instances = rows.reduce((s, r) => s + r.n, 0);
    const parMoteur = rows.filter((r) => r.parLeMoteur.length);
    const motif = rows.filter((r) => !r.parLeMoteur.length && r.parMotif.length);
    const pipeline = rows.filter((r) => !r.parLeMoteur.length && !r.parMotif.length && r.nomme.length);
    const orphelines = rows.filter((r) => !r.nomme.length && !r.parMotif.length);
    const som = (a) => a.reduce((s, r) => s + r.n, 0);
    const ligne = (t, a) => console.log(`${t.padEnd(22)}${String(a.length).padStart(3)}   (${som(a)} instances)`);

    console.log(`build            ${BUILD}`);
    ligne("classes posees", rows);
    ligne("lues par le moteur", parMoteur);
    ligne("lues par motif", motif);
    ligne("EXTRAITES, NON LUES", pipeline);
    ligne("SANS LECTEUR", orphelines);
    console.log("\nextraites et que rien ne lit :");
    for (const r of pipeline) console.log(`  ${String(r.n).padStart(3)}  ${r.cls}`);
    console.log("\nsans aucun lecteur :");
    for (const r of orphelines) console.log(`  ${String(r.n).padStart(3)}  ${r.cls}`);
  });
}

if (!haveBuild()) {
  console.log("ignore : OW_BUILD ne pointe pas sur un build extrait.");
} else if (process.argv[1] && process.argv[1].endsWith("recensement.mjs")) {
  await principal();
}
