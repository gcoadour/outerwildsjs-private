#!/usr/bin/env node
// L'autre moitie de la lecture : ce que la SCENE pose, la ou scripts/il.mjs dit
// ce que le CODE fait.
//
// Les deux sont necessaires et ni l'un ni l'autre ne suffit. docs/46 en a fait
// deux fois l'experience : `RandomParticleBursts` tire un delai au hasard —
// c'est le code — mais ses dix-huit instances portent `_looping = true`, et le
// tirage n'a donc aucun effet visible. Le code seul faisait ecrire une
// mecanique morte ; la scene seule ne disait pas ce que le champ commande.
//
//   node scripts/composants.mjs <Classe> [<Classe>...]
//   node scripts/composants.mjs --regex <motif>
//   node scripts/composants.mjs --scene mainData --regex .
//
// `--scene` lit une autre scene que `level0` : l'ecran-titre, par exemple, vit
// dans `mainData` (le niveau 0 du jeu), avec les reglages du projet.

import { readFileSync } from "node:fs";
import { BUILD, haveBuild, loadEnv } from "../tests/run.mjs";
import { join } from "node:path";

export async function contexte(scene = "level0") {
  const { TypeUniverse } = await import("../web/src/pipeline/dotnet/typetree.js");
  const { ExtractContext } = await import("../web/src/pipeline/extract/context.js");
  const env = await loadEnv();
  const u = new TypeUniverse();
  for (const a of ["Assembly-CSharp", "Assembly-CSharp-firstpass", "Assembly-UnityScript",
                   "Assembly-UnityScript-firstpass", "DecalSystem.Runtime", "UnityEngine", "mscorlib"]) {
    u.add(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`))));
  }
  const engineTypes = JSON.parse(readFileSync("web/src/pipeline/unity/unity41-types.json", "utf8"));
  return new ExtractContext(env, u, scene, engineTypes);
}

/** Les instances d'une ou plusieurs classes, champs et porteur compris. */
export async function instances(filtre, scene = "level0") {
  const ctx = await contexte(scene);
  const out = [];
  for (const { obj, cls } of ctx.behaviours(filtre)) {
    const gid = ctx.ownerId(obj);
    out.push({
      cls,
      chemin: ctx.path ? ctx.path(gid) : (ctx.gameObjects.get(gid) || {}).m_Name,
      nom: (ctx.gameObjects.get(gid) || {}).m_Name,
      gid,
      champs: ctx.scriptFields(obj),
    });
  }
  return { ctx, out };
}

if (!haveBuild()) console.log("ignore : OW_BUILD ne pointe pas sur un build extrait.");
else if (process.argv[1] && process.argv[1].endsWith("composants.mjs")) {
  let args = process.argv.slice(2);
  let scene = "level0";
  const is = args.indexOf("--scene");
  if (is >= 0) { scene = args[is + 1]; args = args.filter((_, i) => i !== is && i !== is + 1); }
  const filtre = args[0] === "--regex"
    ? ((cls) => new RegExp(args[1], "i").test(cls))
    : args;
  const { ctx, out } = await instances(filtre, scene);
  for (const i of out) {
    console.log(`\n=== ${i.cls}  sur "${i.nom}" (go ${i.gid})`);
    console.log(JSON.stringify(ctx.plain(i.champs), null, 2));
  }
  console.log(`\n${out.length} instance(s).`);
}
