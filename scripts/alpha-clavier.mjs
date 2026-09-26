// Donne des touches au regard de l'alpha, pour la comparer au clavier seul.
//
//   node scripts/alpha-clavier.mjs <mainData d'origine> <mainData de sortie>
//
// Sous Xvfb, toute entree de souris envoie la camera de l'alpha en NaN : le
// regard n'y avait donc AUCUN canal, et la tour, le terminal, le vaisseau et la
// carte restaient hors d'atteinte (docs/132). Les axes `Yaw_Key` et
// `Pitch_Key` de l'`InputManager` sont de genre `mouseMove` ; on les recrit en
// axes a boutons — fleches gauche/droite et bas/haut — et on donne une touche de
// secours aux deux canaux qui n'etaient que des clics (`Telescope_Key` : t,
// `Lock On_Key` : g).
//
// Un axe a boutons vaut -1, 0 ou 1 : tenu, il donne exactement ce que donne un
// manche a fond, soit `_turnRate` et `_sensitivityY` degres par seconde. C'est
// ce qui rend la comparaison mesurable : le portage recoit le meme 1 par sa
// manette (regard.js).
//
// La copie patchee est LOCALE : `scripts/alpha.sh start` la pose le temps du
// chargement puis remet l'originale. Rien du build n'entre au depot.
//
// Le fichier serialise est recrit a l'economie : l'`InputManager` modifie est
// AJOUTE en fin de fichier, et seule son entree de la table des objets change
// (debut et taille), avec la taille du fichier dans l'en-tete. Aucun autre
// objet ne bouge.

import { readFileSync, writeFileSync } from "node:fs";
import { BinaryReader } from "../web/src/pipeline/unity/binary.js";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error("usage : node scripts/alpha-clavier.mjs <mainData> <sortie>");
  process.exit(1);
}

const VEUT = {
  "Yaw_Key": ["left", "right", "", ""],
  "Pitch_Key": ["down", "up", "", ""],
  "Telescope_Key": ["", "mouse 2", "", "t"],
  "Lock On_Key": ["", "mouse 0", "", "g"],
};

const buf = readFileSync(src);
const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
// L'en-tete est gros-boutiste ; la suite suit l'octet d'ordre.
const h = new BinaryReader(u8, 0, false);
h.u32(); h.u32();
const version = h.u32(), dataOffset = h.u32();
const le = h.u8v() === 0; h.bytes(3);
const r = new BinaryReader(u8, h.pos, le);
r.cstring(); r.i32();
if (version >= 13) r.bool();
if (r.i32() !== 0) throw new Error("type trees embarques : format non prevu");
const bigId = version >= 7 && version < 14 ? r.i32() : 0;
const n = r.i32();
let im = null;
for (let i = 0; i < n; i++) {
  const at = r.pos;
  if (bigId) r.i64(); else r.i32();
  const start = r.i32(), size = r.i32();
  r.i32();
  const classId = r.i16(); r.i16();
  if (classId === 13) im = { at: at + (bigId ? 8 : 4), start: start + dataOffset, size };
}
if (!im) throw new Error("pas d'InputManager");

// `InputAxis` d'Unity 4 (unity41-types.json) : sept chaines, trois flottants,
// deux booleens dans un mot aligne, trois entiers.
const data = buf.subarray(im.start, im.start + im.size);
let p = 0;
const i32 = () => { const v = data.readInt32LE(p); p += 4; return v; };
const chaine = () => { const l = i32(); const s = data.toString("latin1", p, p + l); p = (p + l + 3) & ~3; return s; };
const count = i32();
const axes = [];
for (let i = 0; i < count; i++) {
  const debut = p;
  const nom = chaine();
  const desc = chaine(), descNeg = chaine();
  for (let k = 0; k < 4; k++) chaine();
  p += 12 + 4 + 12;
  axes.push({ nom, desc, descNeg, debut, fin: p });
}
const enc = (s) => {
  const b = Buffer.from(s, "latin1");
  const o = Buffer.alloc((4 + b.length + 3) & ~3);
  o.writeInt32LE(b.length, 0); b.copy(o, 4);
  return o;
};
const boutons = (a, [neg, pos, altNeg, altPos]) => {
  const f = Buffer.alloc(12);
  f.writeFloatLE(1000, 0);       // gravity : retour a zero immediat
  f.writeFloatLE(0.001, 4);      // dead
  f.writeFloatLE(1000, 8);       // sensitivity : a fond immediatement
  const drapeaux = Buffer.from([1, 0, 0, 0]);   // snap, invert
  const t = Buffer.alloc(12);    // type 0 (touche), axe 0, manette 0
  return Buffer.concat([enc(a.nom), enc(a.desc), enc(a.descNeg), enc(neg), enc(pos),
                        enc(altNeg), enc(altPos), f, drapeaux, t]);
};
const morceaux = [data.subarray(0, 4)];
for (const a of axes) morceaux.push(VEUT[a.nom] ? boutons(a, VEUT[a.nom]) : data.subarray(a.debut, a.fin));
morceaux.push(data.subarray(p));
const neuf = Buffer.concat(morceaux);

const debut = (buf.length + 7) & ~7;
const out = Buffer.alloc(debut + neuf.length);
buf.copy(out, 0);
neuf.copy(out, debut);
out.writeUInt32BE(out.length, 4);
const ecrit = (v, o) => (le ? out.writeInt32LE(v, o) : out.writeInt32BE(v, o));
ecrit(debut - dataOffset, im.at);
ecrit(neuf.length, im.at + 4);
writeFileSync(dst, out);
const touches = axes.filter((a) => VEUT[a.nom]).map((a) => a.nom);
console.log(`${dst} : ${touches.join(", ")} au clavier (InputManager ${im.size} -> ${neuf.length} octets)`);
