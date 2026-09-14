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
// Et une QUATRIEME, ajoutee apres coup, qui a couvert un systeme entier : ce
// recensement ne lisait que `level0`, et l'alpha pose des composants dans
// `sharedassets1.assets`, `resources.assets` et `mainData`. La sonde y est en
// entier — dix noeuds, huit classes — et docs/08 avait conclu de son absence
// de `level0` que « le modele de sonde » manquait au BUILD. C'est la meme
// erreur que docs/47 et docs/50, commise sur le denominateur cette fois : on
// mesurait bien, sur la mauvaise moitie du jeu (docs/60-sonde.md).
//
//   OW_BUILD=/chemin/vers/..._Data node scripts/recensement.mjs [--json]

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, haveBuild, BUILD } from "../tests/run.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "web/src");

/**
 * Les classes qu'un module declare lire, par un marqueur `@lit`.
 *
 * Le recensement compte des NOMS, et ce depot traduit : `sky.js` porte
 * `SkyBehavior` sous `lookAtSun()`, `CloudTextureController` sous
 * `attachClouds()`, et aucun des deux noms n'y figure. Compter ces classes
 * absentes serait faux ; les compter presentes parce qu'un commentaire les
 * cite le serait aussi — c'est exactement l'erreur que docs/47 a corrigee.
 *
 * D'ou un marqueur, et non de la prose :
 *
 *     // @lit SkyBehavior, CloudTextureController, DistantStarController
 *
 * Il se grep, il ne s'ecrit pas par accident, et il oblige a nommer ce qu'on
 * pretend lire. Un module qui triche se voit : la classe est dans le marqueur
 * et nulle part dans le code.
 */
function declarees(texte) {
  const out = [];
  for (const m of texte.matchAll(/@lit\s+([A-Za-z0-9_,\s]+)/g)) {
    for (const n of m[1].split(/[,\s]+/)) if (n) out.push(n);
  }
  return out;
}

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
        const brut = readFileSync(p, "utf8");
        out.push({ path: relative(ROOT, p), text: sansCommentaires(brut),
                   declare: new Set(declarees(brut)) });
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
    let re;
    try { re = new RegExp(m[1], m[2].replace(/[gy]/g, "")); } catch { continue; }
    // Un motif qui attrape TOUT n'attrape rien.
    //
    // `geometry.js` lit les marqueurs d'un nom de clip par `/^[~!]*/`, qui
    // reussit sur n'importe quelle chaine — y compris vide. Compte comme
    // lecteur, il faisait passer le recensement a 100 % du jour au lendemain :
    // quinze classes sans lecteur devenaient zero, sans qu'une ligne de moteur
    // ait ete ecrite pour elles. C'est la meme faute que le commentaire de
    // docs/47 et la traduction de docs/50, commise une troisieme fois — par
    // l'outil, et en sa faveur.
    //
    // Le test est double : un motif ne doit reconnaitre ni la chaine vide, ni
    // un nom de classe qui n'existe pas.
    if (re.test("") || re.test("ZzQxKw_aucune_classe_9")) continue;
    out.push(re);
  }
  return out;
}

// Les memes assemblies que tests/05 : sans elles, aucun MonoBehaviour n'a
// d'arbre de type, et le recensement ne voit aucune classe.
const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];

/**
 * Les autres fichiers serialises du build. `level0` est la scene du systeme
 * solaire ; le reste porte les PREFABRIQUES (que le jeu instancie a
 * l'execution) et la scene de demarrage.
 */
export const AUTRES_FICHIERS = ["sharedassets1.assets", "resources.assets",
                                "mainData", "sharedassets0.assets"];

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

  // 1. ce que le build pose — dans `level0`, et AILLEURS
  const poses = new Map();
  for (const { cls } of ctx.behaviours()) poses.set(cls, (poses.get(cls) || 0) + 1);
  const ailleurs = new Map();          // classe -> Map(fichier -> n)
  for (const f of AUTRES_FICHIERS) {
    for (const o of env.objects({ type: "MonoBehaviour", file: f })) {
      const cls = ctx.scriptName(o);
      if (!cls) continue;
      if (!ailleurs.has(cls)) ailleurs.set(cls, new Map());
      const m = ailleurs.get(cls);
      m.set(f, (m.get(f) || 0) + 1);
    }
  }

  // 2. et 3. ce que le portage en lit
  const files = sources();
  const moteur = files.filter((f) => !f.path.includes("/pipeline/"));
  const motifs = moteur.flatMap((f) => patterns(f.text).map((re) => ({ re, path: f.path })));

  const rows = [];
  for (const [cls, n] of [...poses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const nomme = files.filter((f) => f.text.includes(cls) || f.declare.has(cls))
                       .map((f) => f.path);
    // La distinction qui compte, et que le compte brut de docs/45 melangeait :
    // une classe que SEUL le pipeline nomme est extraite et lue par personne.
    // C'est la nature de manque que docs/35-monde.md a rencontree, et elle ne
    // se voit pas si l'on compte `web/src/` d'un bloc.
    const parLeMoteur = files
      .filter((f) => !f.path.includes("/pipeline/")
                     && (f.text.includes(cls) || f.declare.has(cls)))
      .map((f) => f.path);
    const parMotif = parLeMoteur.length ? [] : motifs.filter((m) => m.re.test(cls)).map((m) => m.path);
    rows.push({ cls, n, nomme, parLeMoteur, parMotif, level0: n, ailleurs: 0, ou: [] });
  }
  // Les classes posees HORS de `level0`. Celles qui y sont aussi enrichissent
  // leur ligne ; les autres en ouvrent une, et c'est la moitie du jeu que le
  // compte ignorait.
  const parNom = new Map(rows.map((r) => [r.cls, r]));
  for (const [cls, m] of [...ailleurs].sort((a, b) => a[0].localeCompare(b[0]))) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    let r = parNom.get(cls);
    if (!r) {
      const nomme = files.filter((f) => f.text.includes(cls) || f.declare.has(cls))
                         .map((f) => f.path);
      const parLeMoteur = moteur
        .filter((f) => f.text.includes(cls) || f.declare.has(cls)).map((f) => f.path);
      const parMotif = parLeMoteur.length ? []
        : motifs.filter((x) => x.re.test(cls)).map((x) => x.path);
      r = { cls, n: 0, nomme, parLeMoteur, parMotif, level0: 0, ailleurs: 0, ou: [] };
      rows.push(r);
      parNom.set(cls, r);
    }
    r.ailleurs = total;
    r.ou = [...m.keys()];
  }
  return rows;
}

function principal() {
  return recenser().then((toutes) => {
    let rows = toutes;
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    const dansLevel0 = rows.filter((r) => r.level0 > 0);
    rows = process.argv.includes("--level0") ? dansLevel0 : rows;
    const parMoteur = rows.filter((r) => r.parLeMoteur.length);
    const motif = rows.filter((r) => !r.parLeMoteur.length && r.parMotif.length);
    const pipeline = rows.filter((r) => !r.parLeMoteur.length && !r.parMotif.length && r.nomme.length);
    const orphelines = rows.filter((r) => !r.nomme.length && !r.parMotif.length);
    const som = (a, k = null) => a.reduce(
      (s, r) => s + (k ? r[k] : r.n + r.ailleurs), 0);
    const ligne = (t, a, k = null) => console.log(
      `${t.padEnd(22)}${String(a.length).padStart(3)}   (${som(a, k)} instances)`);

    console.log(`build            ${BUILD}`);
    console.log(`fichiers         level0 + ${AUTRES_FICHIERS.join(" + ")}`);
    ligne("classes posees", rows);
    // Les deux lignes qui suivent comptent des INSTANCES par fichier, pas des
    // classes : une classe posee des deux cotes est sur les deux lignes, et la
    // somme des deux colonnes fait bien le total.
    ligne("  dans level0", dansLevel0, "level0");
    ligne("  AILLEURS", rows.filter((r) => r.ailleurs > 0), "ailleurs");
    ligne("lues par le moteur", parMoteur);
    ligne("lues par motif", motif);
    ligne("EXTRAITES, NON LUES", pipeline);
    ligne("SANS LECTEUR", orphelines);
    console.log("\nextraites et que rien ne lit :");
    for (const r of pipeline) console.log(`  ${String(r.n).padStart(3)}  ${r.cls}`);
    console.log("\nsans aucun lecteur :");
    for (const r of orphelines) {
      console.log(`  ${String(r.n + r.ailleurs).padStart(3)}  ${r.cls.padEnd(30)}`
        + (r.ou.length ? r.ou.join(",") : "level0"));
    }
  });
}

if (!haveBuild()) {
  console.log("ignore : OW_BUILD ne pointe pas sur un build extrait.");
} else if (process.argv[1] && process.argv[1].endsWith("recensement.mjs")) {
  await principal();
}
