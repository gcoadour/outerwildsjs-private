// Fait naitre le joueur de l'alpha DANS la cabine du vaisseau, pour la
// comparer au portage.
//
//   OW_BUILD=... node scripts/alpha-cabine.mjs <level0 d'origine> <level0 de sortie>
//
// Marcher jusqu'au vaisseau au clavier, a une ou deux images par seconde sous
// Xvfb, est trop imprecis (docs/132), et les sauts de mise au point ne
// deplacent que le vaisseau, joueur deja dedans. Il reste la scene.
//
// `PlayerSpawner.OnStartOfTimeLoop` pose le joueur sur `GetSpawnPoint(2)` —
// le 2 est en dur, `_debugSpawnLocation` n'est lu par personne — soit le
// premier point du lieu 2 (Timber Hearth) qui n'est pas un point de vaisseau.
// La scene en pose un DANS le vaisseau, au lieu 8 (`SpawnPoint` sous
// `Ship_Body`). On echange donc deux `_spawnLocation` : celui de la cabine
// passe a 2, celui du village a 6 (la lune de Giant's Deep, que personne ne
// demande). Deux entiers de quatre octets, a leur place : aucun objet ne
// bouge, et le fichier garde sa taille.
//
// `_spawnLocation` est l'entier a huit octets de la fin de l'objet (suivi de
// `_isShipSpawn`, un booleen aligne) ; on verifie la valeur attendue avant
// d'ecrire, et on refuse sinon. La copie est LOCALE : `scripts/alpha.sh`
// remet l'originale a l'arret. Rien du build n'entre au depot.

import { readFileSync, writeFileSync } from "node:fs";
import { contexte } from "./composants.mjs";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error("usage : OW_BUILD=... node scripts/alpha-cabine.mjs <level0> <sortie>");
  process.exit(1);
}

const ctx = await contexte();
const cibles = [];
for (const { obj } of ctx.behaviours(["SpawnPoint"])) {
  const f = ctx.plain(ctx.scriptFields(obj));
  const corps = ctx.bodyOf(ctx.ownerId(obj));
  if (f._isShipSpawn) continue;
  if (corps === "Ship_Body" && f._spawnLocation === 8) cibles.push({ obj, avant: 8, apres: 2 });
  if (corps === "TimberHearth_Body" && f._spawnLocation === 2) cibles.push({ obj, avant: 2, apres: 6 });
}
if (cibles.length !== 2) {
  console.error(`attendu deux points (cabine, village), trouve ${cibles.length}`);
  process.exit(1);
}
const buf = readFileSync(src);
for (const { obj, avant, apres } of cibles) {
  const at = obj.byteStart + obj.byteSize - 8;
  const v = buf.readInt32LE(at);
  if (v !== avant) {
    console.error(`${obj.pathId} : ${v} a l'octet ${at}, ${avant} attendu — rien n'est ecrit`);
    process.exit(1);
  }
  buf.writeInt32LE(apres, at);
}
// ALPHA_POSTE=1 : le point de la cabine passe DEVANT le poste, regard vers
// l'avant du vaisseau. Le point du build est sous la trappe, et marcher
// jusqu'au siege a une ou deux images par seconde echoue une fois sur deux
// (docs/132) ; d'ici, un appui sur E suffit a s'asseoir. `Transform` d'Unity
// 4.1 : PPtr du GameObject (8 octets), rotation (4 flottants), position (3).
// Le parent, `Volumes`, est a l'identite : les valeurs sont celles du
// vaisseau. On relit l'ancienne position avant d'ecrire.
if (process.env.ALPHA_POSTE) {
  const cabine = cibles.find((c) => c.avant === 8);
  const gid = ctx.ownerId(cabine.obj);
  let fait = false;
  for (const o of ctx.env.objects({ type: "Transform", file: ctx.sceneFile })) {
    const v = ctx.env.read(o);
    if (!v.m_GameObject || v.m_GameObject.pathId !== gid) continue;
    const z0 = buf.readFloatLE(o.byteStart + 32);
    if (Math.abs(z0 - 3.9589) > 1e-3) {
      console.error(`Transform ${o.pathId} : z ${z0}, 3,9589 attendu — rien n'est ecrit`);
      process.exit(1);
    }
    [0, 0, 0, 1].forEach((x, i) => buf.writeFloatLE(x, o.byteStart + 8 + 4 * i));
    [0, 0.5, 3.0].forEach((x, i) => buf.writeFloatLE(x, o.byteStart + 24 + 4 * i));
    fait = true;
  }
  if (!fait) { console.error("Transform du point de la cabine introuvable"); process.exit(1); }
}
writeFileSync(dst, buf);
console.log(`${dst} : le joueur nait dans la cabine (points ${cibles.map((c) => c.obj.pathId).join(", ")})`);
