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

function lister(dir, out = [], exts = [".js", ".mjs"]) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) lister(p, out, exts);
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
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

/**
 * Le texte sans ses lignes d'`import`.
 *
 * UN IMPORT N'EST PAS UN APPEL. Importer un nom et ne jamais s'en servir est
 * exactement la forme de dette que ce compte cherche, et sans ce retrait il
 * suffisait d'ajouter le nom a une liste d'import pour le declarer vivant.
 * C'est la meme erreur que le commentaire-qui-lit de docs/47, d'une syntaxe de
 * plus ([`docs/71`](../docs/71-quantique.md)).
 */
function sansImports(t) {
  return t.replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?/gm, " ")
          .replace(/^\s*import\s+["'][^"']+["'];?/gm, " ");
}

// Ce qui, indente de deux espaces et suivi d'une parenthese, n'est pas une
// methode : les mots-cles du langage.
const MOTS_CLES = new Set(["constructor", "if", "for", "while", "switch", "catch",
                           "return", "typeof", "new", "delete", "throw", "else",
                           "do", "try", "yield", "await", "in", "of", "case",
                           "void", "function", "with"]);

const compte = (t, nom) => (t.match(new RegExp(`\\b${nom}\\b`, "g")) || []).length;

/**
 * Les lois marquees `// @mesure` : des ETALONS, pas des mecanismes.
 *
 * Toutes les lois de ce depot ne sont pas faites pour tourner. `jumpHeight`
 * rend `v^2 / 2g` et son commentaire le dit depuis toujours — « pour
 * l'invariant » ; `terminalSpeed` et `terminalAngularSpeed` sont les regimes
 * vers lesquels deux integrations convergent. Rien ne les appelle parce que
 * rien ne DOIT les appeler : elles servent a verifier le moteur de l'exterieur,
 * pas a le faire avancer.
 *
 * Sans cette marque, ce compte pousse a leur ecrire un appelant pour le
 * plaisir du chiffre — c'est-a-dire a fabriquer exactement la dette qu'il
 * cherche. Le marqueur se pose sur la LIGNE au-dessus de l'export, comme
 * `// @lit` ([`docs/74`](../docs/74-etalons.md)).
 */
function etalons(brut) {
  const out = new Set();
  for (const m of brut.matchAll(/\/\/\s*@mesure[^\n]*\n\s*export\s+(?:async\s+)?(?:function|class|const)\s+(\w+)/g)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Les lois marquees `// @vide` : portees, gardees, et sans entree.
 *
 * Le troisieme cas legitime, et le depot l'a nomme trois fois en prose avant
 * de le nommer ici : les dix-huit bouffees de docs/46, `inheritedAcceleration`
 * de docs/68, la lampe des objets quantiques de docs/71. La mecanique est
 * ecrite d'apres l'IL, elle est eprouvee — et la liste de ce a quoi elle
 * s'applique est VIDE dans ce build.
 *
 * Ce n'est pas du travail a faire, c'est une mesure : c'est le build qui le
 * dit, pas le portage qui renonce. Le marqueur exige une raison sur la meme
 * ligne, pour qu'il ne devienne pas un moyen commode de faire baisser un
 * chiffre.
 */
function vides(brut) {
  const out = new Map();
  for (const m of brut.matchAll(/\/\/\s*@vide\s+([^\n]+)\n\s*export\s+(?:async\s+)?(?:function|class|const)\s+(\w+)/g)) {
    if (m[1].trim().length >= 10) out.set(m[2], m[1].trim());
  }
  return out;
}

export function lois() {
  const src = lister(join(ROOT, "web/src"));
  const moteur = src.filter((f) => !f.includes("/pipeline/"));
  const tests = lister(join(ROOT, "tests"));
  const outils = lister(join(ROOT, "scripts"));
  // Les PAGES appellent, elles aussi. `index.html` importe `initGate` et
  // l'appelle en trois lignes ; ce compte le declarait mort parce qu'il ne
  // regardait que des `.js`. Un appelant qui n'a pas la bonne extension est un
  // appelant quand meme, et c'est la quatrieme fois que ce depot se ment sur
  // ce qu'il mesure ([`docs/69`](../docs/69-assise.md)).
  const pages = lister(join(ROOT, "web"), [], [".html"]);
  const txt = new Map([...src, ...tests, ...outils, ...pages]
    .map((f) => [f, sansImports(sansCommentaires(readFileSync(f, "utf8")))]));

  const out = [];
  for (const f of moteur) {
    const brut = readFileSync(f, "utf8");
    const mesures = etalons(brut);
    const sansEntree = vides(brut);
    const noms = new Set();
    for (const m of brut.matchAll(/^export (?:async )?function (\w+)/gm)) noms.add(m[1]);
    for (const m of brut.matchAll(/^export class (\w+)/gm)) noms.add(m[1]);
    // LES METHODES AUSSI. Ce compte ne voyait que les exports, et
    // `Ship.padLanding` a donc dormi un lot entier : ecrite, commentee,
    // eprouvee par un test, appelee par personne — et invisible ici parce
    // qu'elle etait une methode ([`docs/89`](../docs/89-pose.md)).
    //
    // On ne les cherche que DANS le corps d'une classe exportee, delimite par
    // l'accolade fermante en colonne zero : un `return (` indente de deux
    // espaces au milieu d'une fonction libre ressemble sinon a une methode, et
    // le premier essai a rendu treize `.return`. Un compte qui se trompe sur ce
    // qu'il compte est pire que pas de compte.
    //
    // On les appelle par un POINT, ce qui les distingue de leur definition. Les
    // accesseurs comptent pareil : `get x()` se lit `.x`.
    const methodes = new Set();
    const propre = sansCommentaires(brut);
    for (const tete of propre.matchAll(/^export class \w+[^\n]*\{$/gm)) {
      const debut = tete.index + tete[0].length;
      const fin = propre.indexOf("\n}", debut);
      const corps = propre.slice(debut, fin < 0 ? undefined : fin);
      for (const m of corps.matchAll(
        /^  (?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(\w+)\s*\(/gm)) {
        if (MOTS_CLES.has(m[1])) continue;
        methodes.add(m[1]);
      }
    }
    for (const nom of methodes) {
      if (mesures.has(nom) || sansEntree.has(nom)) continue;
      // Un appel de methode porte un point : `x.nom(`. La definition, non.
      const appelee = [...src, ...pages].some(
        (g) => (txt.get(g).match(new RegExp(`\\.${nom}\\b`, "g")) || []).length > 0);
      if (appelee) continue;
      out.push({
        fichier: relative(ROOT, f),
        nom: `.${nom}`,
        eprouvee: tests.some((g) => compte(txt.get(g), nom) > 0),
      });
    }
    for (const nom of noms) {
      // Un etalon n'a pas a etre appele : c'est sa raison d'etre.
      if (mesures.has(nom)) continue;
      // Une loi sans entree n'a personne a qui s'appliquer, et le dit.
      if (sansEntree.has(nom)) continue;
      // Appelee ailleurs dans le moteur, le pipeline, ou une page ?
      if ([...src, ...pages].some((g) => g !== f && compte(txt.get(g), nom) > 0)) continue;
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
