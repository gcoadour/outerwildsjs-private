#!/usr/bin/env node
// Les lois que le moteur a ecrites et qu'il n'appelle pas.
//
// Trois denominateurs, trois questions differentes :
//
//   recensement.mjs   ce que le build INSTALLE, et ce qu'on en lit
//   evenements.mjs    ce que le build ANNONCE, et ce qu'on en nomme
//   lois.mjs          ce que le portage a ECRIT, et ce qu'il APPELLE
//
// Le troisieme est le seul qui ne regarde pas le build. Il est ne d'une
// decouverte desagreable : `web/src/attachments.js` — six classes, trente-cinq
// instances, une page de documentation, quarante verifications — n'est importe
// par AUCUN module du moteur. Il est ecrit, il est eprouve, il est documente
// comme fait, et il ne s'execute jamais ([`docs/68`](../docs/68-lois.md)).
//
// Un test ne suffit pas a le voir : `tests/09-jeu.mjs` importe le module et le
// fait tourner, donc tout passe. C'est precisement le piege — une loi eprouvee
// a l'air vivante.
//
//   node scripts/lois.mjs [--json]
//
// Ce compte n'a pas besoin du build : il ne lit que le depot.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function lister(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) lister(p, out);
    else if (e.endsWith(".js") || e.endsWith(".mjs")) out.push(p);
  }
  return out;
}

/**
 * Le texte sans ses commentaires.
 *
 * Meme raison qu'au recensement : une fonction CITEE dans un commentaire n'est
 * pas une fonction appelee, et c'est l'erreur que docs/47 a payee.
 */
function sansCommentaires(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const compte = (t, nom) => (t.match(new RegExp(`\\b${nom}\\b`, "g")) || []).length;

export function lois() {
  const src = lister(join(ROOT, "web/src"));
  const moteur = src.filter((f) => !f.includes("/pipeline/"));
  const tests = lister(join(ROOT, "tests"));
  const outils = lister(join(ROOT, "scripts"));
  const txt = new Map([...src, ...tests, ...outils]
    .map((f) => [f, sansCommentaires(readFileSync(f, "utf8"))]));

  const out = [];
  for (const f of moteur) {
    const brut = readFileSync(f, "utf8");
    const noms = new Set();
    for (const m of brut.matchAll(/^export (?:async )?function (\w+)/gm)) noms.add(m[1]);
    for (const m of brut.matchAll(/^export class (\w+)/gm)) noms.add(m[1]);
    for (const nom of noms) {
      // Appelee ailleurs dans le moteur ou le pipeline ?
      if (src.some((g) => g !== f && compte(txt.get(g), nom) > 0)) continue;
      // Appelee dans son PROPRE fichier, au-dela de sa definition ? Une
      // fonction interne exportee pour les tests est legitime.
      if (compte(txt.get(f), nom) > 1) continue;
      out.push({
        fichier: relative(ROOT, f),
        nom,
        eprouvee: tests.some((g) => compte(txt.get(g), nom) > 0),
      });
    }
  }
  return out.sort((a, b) => a.fichier.localeCompare(b.fichier)
                         || a.nom.localeCompare(b.nom));
}

if (process.argv[1] && process.argv[1].endsWith("lois.mjs")) {
  const rows = lois();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const parFichier = new Map();
    for (const r of rows) {
      if (!parFichier.has(r.fichier)) parFichier.set(r.fichier, []);
      parFichier.get(r.fichier).push(r);
    }
    console.log(`${rows.length} lois du moteur que RIEN n'appelle,`
      + ` dans ${parFichier.size} modules\n`);
    for (const [f, l] of parFichier) {
      console.log(`  ${f}`);
      for (const r of l) {
        console.log(`      ${r.nom.padEnd(26)}`
          + (r.eprouvee ? "eprouvee" : "meme pas eprouvee"));
      }
    }
  }
}
