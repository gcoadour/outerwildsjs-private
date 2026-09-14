#!/usr/bin/env node
// Ce que le jeu ANNONCE, et ce que le portage en nomme.
//
// `scripts/recensement.mjs` compte des CLASSES posees dans la scene. C'est un
// bon denominateur pour « ce que le build installe », et un mauvais pour « ce
// que le build fait » : une classe peut etre lue et son comportement a moitie
// porte, sans qu'aucun compte ne bouge.
//
// Les evenements globaux sont l'autre bout. `GlobalMessenger.FireEvent("X")`
// et `AddListener("X", ...)` tissent tout le jeu — entrer dans un secteur,
// s'asseoir au poste de pilotage, allumer la lampe, lancer une sonde — et ce
// sont des CHAINES. On peut donc les compter, et compter celles que le portage
// nomme quelque part.
//
//   OW_BUILD=/chemin/vers/..._Data node scripts/evenements.mjs [--json]
//
// Attention a ce que ce compte VEUT DIRE. Un evenement que le portage ne nomme
// pas n'est pas forcement absent : `SettingsMenuTrigger` faisait exactement ce
// que le build fait, sans qu'aucune de ses chaines n'apparaisse
// ([`docs/65`](../docs/65-onde.md)). C'est une liste de PISTES, comme le
// recensement en a ete une — et elle se lit une par une, pas en pourcentage.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assemblies } from "./il.mjs";
import { TABLE } from "../web/src/pipeline/dotnet/pe.js";
import { methodBody, decodeIL, userString, methodTarget, methodsOf }
  from "../web/src/pipeline/dotnet/il.js";
import { haveBuild, BUILD } from "../tests/run.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "web/src");

/**
 * Les evenements de l'assembly, par nom.
 *
 * La reconnaissance est directe : un `ldstr` suivi d'un appel dont le nom
 * contient `FireEvent` ou `AddListener`. Elle rate les evenements dont le nom
 * serait calcule — il n'y en a pas — et elle attrape le dernier `ldstr` vu,
 * ce qui suffit parce que ces appels prennent leur chaine juste avant.
 */
export function evenements() {
  const emis = new Map(), ecoutes = new Map();
  for (const { asm } of assemblies()) {
    const n = asm.rows(TABLE.TypeDef);
    for (let i = 1; i <= n; i++) {
      const cls = asm.str(asm.row(TABLE.TypeDef, i)[1]);
      for (const m of methodsOf(asm, i)) {
        let code;
        try { code = methodBody(asm, m.index); } catch { continue; }
        if (!code) continue;
        let dernier = null;
        for (const inst of decodeIL(code)) {
          if (inst.op === 0x72) { dernier = userString(asm, inst.operand); continue; }
          if (inst.op !== 0x28 && inst.op !== 0x6f) continue;
          const t = methodTarget(asm, inst.operand);
          if (!t || !dernier) continue;
          const ou = /FireEvent/.test(t.name) ? emis
            : /AddListener/.test(t.name) ? ecoutes : null;
          if (!ou) continue;
          if (!ou.has(dernier)) ou.set(dernier, new Set());
          ou.get(dernier).add(`${cls}.${m.name}`);
        }
      }
    }
  }
  return { emis, ecoutes };
}

/**
 * Le texte de tout `web/src/`, d'un bloc, SANS ses commentaires.
 *
 * Sans ce retrait, ce compte se ment de la meme facon que le recensement des
 * classes s'est menti ([`docs/47`](../docs/47-effets-image.md)) : citer
 * `AttachPlayerToPoint` en prose au-dessus d'une classe suffisait a le declarer
 * nomme. Un evenement CITE n'est pas un evenement nomme, et cette fonction
 * etait ecrite sans la lecon que le depot avait deja payee deux fois
 * ([`docs/69`](../docs/69-assise.md)).
 */
function sources() {
  let texte = "";
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".js")) {
        texte += readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
      }
    }
  })(SRC);
  return texte;
}

export function comparer() {
  const { emis, ecoutes } = evenements();
  const texte = sources();
  const tous = [...new Set([...emis.keys(), ...ecoutes.keys()])].sort();
  return tous.map((nom) => ({
    nom,
    nomme: texte.includes(nom),
    emis: [...(emis.get(nom) || [])],
    ecoutes: [...(ecoutes.get(nom) || [])],
  }));
}

if (!haveBuild()) {
  console.log("ignore : OW_BUILD ne pointe pas sur un build extrait.");
} else if (process.argv[1] && process.argv[1].endsWith("evenements.mjs")) {
  const rows = comparer();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const absents = rows.filter((r) => !r.nomme);
    console.log(`build            ${BUILD}`);
    console.log(`evenements       ${rows.length}`);
    console.log(`nommes           ${rows.length - absents.length}`);
    console.log(`NON NOMMES       ${absents.length}\n`);
    for (const r of absents) {
      console.log(`  ${r.nom.padEnd(32)} emis: ${(r.emis[0] || "—").padEnd(44)}`
        + ` ecoute: ${r.ecoutes[0] || "—"}`);
    }
  }
}
