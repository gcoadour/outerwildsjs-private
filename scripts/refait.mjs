#!/usr/bin/env node
// Ce que le build FAIT dans une classe qu'on lit, et ce qu'on en refait.
//
// Le quatrieme denominateur, et il est ne d'une limite que les trois autres
// ont chacun rencontree :
//
//   recensement.mjs   ce que le build INSTALLE — une classe lue peut l'etre
//                     a moitie, et le compte ne bouge pas
//   evenements.mjs    ce que le build ANNONCE — tout ne passe pas par un
//                     evenement, et beaucoup de lois n'en emettent aucun
//   lois.mjs          ce que le portage APPELLE — il ne voit que ce qui est
//                     deja ecrit, jamais ce qui ne l'est pas
//
// Celui-ci part de l'autre bout : pour chaque classe que le portage declare
// lire (`// @lit X`), il liste les METHODES que le build lui donne, et regarde
// si le module qui la declare les NOMME.
//
// Il est ne d'un cas precis. `PlayerJetpackController` est marquee `@lit`
// depuis longtemps, et le portage en tenait les trois constantes de poussee.
// Il lui manquait les deux verrous de `ReadTranslationalInput` — sauter ne
// decolle pas, la panne seche a une hysteresis — et aucun des trois comptes
// precedents ne pouvait le dire ([`docs/101`](../docs/101-sac-dorsal.md)).
//
//   OW_BUILD=/chemin/vers/..._Data node scripts/refait.mjs [--json] [--tout]
//
// CE QUE CE COMPTE VEUT DIRE, ET CE QU'IL NE VEUT PAS.
//
// Il compte des NOMS, comme `evenements.mjs`, et il faut le lire comme lui :
// une LISTE DE PISTES, une par une, et jamais en pourcentage. Une methode peut
// etre refaite sans que son nom paraisse — le portage ecrit en francais — et
// une methode nommee dans un commentaire peut n'etre refaite nulle part.
//
// La convention du depot le rend malgre tout utile : un portage qui refait une
// methode du build la CITE, au-dessus du code qui la refait. C'est l'usage
// depuis les premiers lots, et c'est ce que ce compte exploite. Il compte donc
// les commentaires — a l'inverse de `recensement.mjs`, qui les retire —, et la
// raison de cette difference est ecrite ici pour qu'elle ne s'oublie pas.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assemblies } from "./il.mjs";
import { TABLE } from "../web/src/pipeline/dotnet/pe.js";
import { methodsOf } from "../web/src/pipeline/dotnet/il.js";
import { haveBuild } from "../tests/run.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Ce qu'Unity appelle tout seul : ce n'est pas une loi du jeu. */
const CYCLE = new Set([".ctor", ".cctor", "Awake", "Start", "OnDestroy",
  "OnEnable", "OnDisable", "OnGUI", "Update", "FixedUpdate", "LateUpdate",
  "OnDrawGizmos", "OnDrawGizmosSelected", "OnApplicationQuit"]);

/**
 * Le bruit, et pourquoi chaque famille en est.
 *
 *   add_X / remove_X  la plomberie d'un `event` C#, pas une loi
 *   On<Evenement>     `evenements.mjs` les compte deja, et mieux : il sait qui
 *                     emet et qui ecoute
 *   Get/Is/Has/Can    des accesseurs ; ce qui compte est ce qu'ils lisent, et
 *                     ce quelque chose est un champ, pas une methode
 *   Draw/Gizmo/Debug  de la mise au point du studio
 */
function bruit(m) {
  return /^(add_|remove_)/.test(m)
      || /^On[A-Z]/.test(m)
      || /^(Get|Set|Is|Has|Can|Allow)[A-Z]/.test(m)
      || /(Gizmo|Debug|Draw)/.test(m);
}

/**
 * L'echappatoire, et la seule : `// @autrement <Classe> : <raison>`.
 *
 * Une classe du build peut etre lue sans que ses methodes aient a etre
 * refaites — parce que le portage fait la meme chose par un autre chemin, et
 * que ce chemin est un choix assume. `OWRigidbody` en est le cas d'ecole :
 * vingt-neuf methodes qui transmettent a un `Rigidbody` de PhysX, la ou ce
 * portage a Havok. Les refaire une par une serait reecrire un moteur physique
 * pour faire baisser un chiffre.
 *
 * La raison est OBLIGATOIRE et sur la meme ligne, comme pour `@vide`
 * ([`docs/74`](../docs/74-etalons.md)) : sans elle, le marqueur devient un
 * moyen commode de ne plus rien mesurer.
 */
export function autrement(txt) {
  const out = new Map();
  for (const m of txt.matchAll(/\/\/\s*@autrement\s+(\w+)\s*:\s*([^\n]+)/g)) {
    if (m[2].trim().length >= 10) out.set(m[1], m[2].trim());
  }
  return out;
}

function lister(dir, out = [], exts = [".js"]) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!p.includes("/pipeline")) lister(p, out, exts); }
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

/** Les methodes de chaque classe de l'assembly, bruit retire. */
export function methodesDuBuild() {
  const out = new Map();
  for (const { asm } of assemblies()) {
    const n = asm.rows(TABLE.TypeDef);
    for (let i = 1; i <= n; i++) {
      const cls = asm.str(asm.row(TABLE.TypeDef, i)[1]);
      const ms = [...new Set([...methodsOf(asm, i)].map((m) => m.name))]
        .filter((m) => !CYCLE.has(m) && !bruit(m));
      if (ms.length) out.set(cls, ms);
    }
  }
  return out;
}

/**
 * Les classes declarees lues, et ce qu'on en nomme.
 *
 * Une classe peut etre declaree par PLUSIEURS modules — `PlayerState` l'est
 * par `player.js`, et `OWInput` par `input.js` comme par `modes.js`. On les
 * reunit : ce qui compte est que le PORTAGE le nomme, pas lequel de ses
 * fichiers le fait.
 */
export function refait() {
  const build = methodesDuBuild();
  const parClasse = new Map();
  const ecartees = new Map();
  for (const f of lister(join(ROOT, "web/src"))) {
    const txt = readFileSync(f, "utf8");
    for (const [cls, raison] of autrement(txt)) ecartees.set(cls, raison);
    for (const m of txt.matchAll(/\/\/\s*@lit\s+([^\n]+)/g)) {
      for (const nom of m[1].split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!build.has(nom)) continue;
        if (!parClasse.has(nom)) {
          parClasse.set(nom, { cls: nom, methodes: build.get(nom),
                               fichiers: [], textes: [] });
        }
        const e = parClasse.get(nom);
        e.fichiers.push(relative(ROOT, f));
        e.textes.push(txt);
      }
    }
  }
  const rows = [];
  for (const e of parClasse.values()) {
    if (ecartees.has(e.cls)) continue;
    const nomme = e.methodes.filter(
      (x) => e.textes.some((t) => new RegExp(`\\b${x}\\b`).test(t)));
    rows.push({
      classe: e.cls,
      fichiers: [...new Set(e.fichiers)],
      total: e.methodes.length,
      nommees: nomme.length,
      manquantes: e.methodes.filter((x) => !nomme.includes(x)),
    });
  }
  // Le plus gros ecart en tete : c'est la lecture utile.
  return rows.sort((a, b) => (b.total - b.nommees) - (a.total - a.nommees)
                          || a.classe.localeCompare(b.classe));
}

if (!haveBuild()) {
  console.log("ignore : OW_BUILD ne pointe pas sur un build extrait.");
} else if (process.argv[1] && process.argv[1].endsWith("refait.mjs")) {
  const rows = refait();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const total = rows.reduce((a, r) => a + r.total, 0);
    const vues = rows.reduce((a, r) => a + r.nommees, 0);
    console.log(`${rows.length} classes declarees lues (@lit)`);
    console.log(`${vues}/${total} methodes du build nommees par le portage`);
    console.log("\nles ecarts, du plus large au plus etroit :\n");
    const montre = process.argv.includes("--tout") ? rows : rows.slice(0, 20);
    for (const r of montre) {
      if (r.total === r.nommees) continue;
      console.log(`${String(r.nommees).padStart(2)}/${String(r.total).padEnd(3)}`
        + ` ${r.classe.padEnd(28)} ${r.fichiers.join(" ")}`);
      console.log(`         ${r.manquantes.join(", ")}`);
    }
    if (!process.argv.includes("--tout") && rows.length > 20) {
      console.log(`\n... et ${rows.length - 20} autres (--tout pour tout voir)`);
    }
  }
}
