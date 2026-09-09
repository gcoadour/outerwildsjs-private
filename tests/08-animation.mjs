// Verifie le decodage des clips d'animation et leur export en glTF.
//
// La premiere moitie ne demande pas le build : elle eprouve le decodeur de
// m_MuscleClip sur un flux fabrique ici, dont on connait la reponse. La seconde
// exporte les sous-arbres du build, sans les maillages -- les animations n'en
// dependent pas, et s'en passer ramene le test a quelques secondes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeClip, ATTRIBUTE_HASHES } from "../web/src/pipeline/unity/muscle.js";
import { TypeUniverse } from "../web/src/pipeline/dotnet/typetree.js";
import { ExtractContext } from "../web/src/pipeline/extract/context.js";
import { exportSubtree, findRoots } from "../web/src/pipeline/extract/gltf.js";
import { BUILD, haveBuild, loadEnv, check, report } from "./run.mjs";

// --- 1. le flux entrelace, sur des donnees fabriquees -----------------------

// Les hachages viennent du decodeur lui-meme : le test verifie son
// interpretation du flux, pas une copie de sa table.
const { POSITION_ATTRS: POSITION, ROTATION_ATTRS: ROTATION } = ATTRIBUTE_HASHES;

const U32 = new Uint32Array(1);
const F32 = new Float32Array(U32.buffer);
const f2u = (f) => { F32[0] = f; return U32[0]; };

/** Flux Mecanim : [temps][nb de cles] puis [indice][4 coefficients] par cle. */
function stream(frames) {
  const raw = [];
  for (const [time, keys] of frames) {
    raw.push(f2u(time), keys.length);
    for (const [index, coeff] of keys) raw.push(index, ...coeff.map(f2u));
  }
  return raw;
}

// Un os, sept courbes : position x, y, z puis rotation x, y, z, w. Les images
// de tete et de queue sont les sentinelles qu'Unity ajoute autour du clip.
const value = (c, t) => c / 10 + t;                 // valeur attendue
const frames = [[-Infinity, [[0, [0, 0, 0, 42]]]]];
for (const t of [0, 0.5, 1]) {
  frames.push([t, [0, 1, 2, 3, 4, 5, 6].map((c) => [c, [1, 2, 3, value(c, t)]])]);
}
frames.push([Infinity, [[0, [0, 0, 0, -42]]]]);

const clip = { m_MuscleClip: { m_StartTime: 0, m_StopTime: 1, m_Clip: { data: {
  m_StreamedClip: { data: stream(frames), curveCount: 7 },
  m_Binding: { data: { m_ValueArray: [...POSITION, ...ROTATION]
    .map((h) => ({ m_ID: 7, m_TypeID: h })) } } } } } };

const bones = decodeClip(clip, new Map([[7, "Bone_JNT"]]), { tangents: true });
check("os resolus", bones.size, 1);
const attrs = bones.get("Bone_JNT") || {};
check("attributs decodes", Object.keys(attrs).sort().join(","), "rotation,translation");

const tr = attrs.translation;
check("cles de position (sentinelles ecartees)", tr.keys.length, 3);
check("temps des cles", tr.keys.map(([t]) => t).join(" "), "0 0.5 1");
// Le quatrieme coefficient est la valeur au temps de l'image.
check("valeur de position a t=0.5",
      tr.keys[1][1].map((v) => v.toFixed(2)).join(" "), "0.50 0.60 0.70");
check("rotation reassemblee en 4 composantes", attrs.rotation.keys[0][1].length, 4);
// La pente de sortie rangee par Unity est le troisieme coefficient.
check("pente de sortie", tr.out[0].every((s) => Math.abs(s - 3) < 1e-6), true);
check("tangentes presentes des deux cotes",
      tr.in.length === tr.keys.length && tr.out.length === tr.keys.length, true);

// Sans tangentes, chaque cle se reduit a (temps, composantes).
const plain = decodeClip(clip, new Map([[7, "Bone_JNT"]]));
check("mode sans tangentes", Array.isArray(plain.get("Bone_JNT").translation), true);

// Un flux dense ne range pas de tangentes : la courbe doit retomber en
// lineaire plutot que d'inventer des pentes.
const dense = { m_MuscleClip: { m_StartTime: 0, m_StopTime: 1, m_Clip: { data: {
  m_StreamedClip: { data: [], curveCount: 0 },
  m_DenseClip: { m_SampleArray: [0, 1, 2, 3, 4, 5, 6, 7, 8], m_CurveCount: 3,
                 m_SampleRate: 10, m_BeginTime: 0 },
  m_Binding: { data: { m_ValueArray: POSITION.map((h) => ({ m_ID: 7, m_TypeID: h })) } },
} } } };
const denseBones = decodeClip(dense, new Map([[7, "Bone_JNT"]]), { tangents: true });
check("flux dense : interpolation lineaire",
      Array.isArray(denseBones.get("Bone_JNT").translation), true);

// --- 2. l'export glTF, sur un monde fabrique --------------------------------
//
// L'exporteur n'a besoin que d'une poignee de services du contexte : de quoi
// lui presenter trois objets et deux clips sans ouvrir le build.

const FILE = { name: "level0", version: 9 };
const ptr = (pathId) => ({ fileId: 0, pathId });

/** Transform : rotation, position, echelle locales, et enfants. */
function transform(children = []) {
  return { m_LocalPosition: { x: 0, y: 1, z: 2 },
           m_LocalRotation: { x: 0, y: 0, z: 0, w: 1 },
           m_LocalScale: { x: 1, y: 1, z: 1 },
           m_Children: children.map(ptr) };
}

// Trois GameObjects : la racine animee, l'os vise par le clip Mecanim, et
// l'extremite visee par le chemin du clip legacy.
const NAMES = new Map([[1, "Villager"], [2, "Bone_JNT"], [3, "Tip"]]);
const values = new Map();
const objects = [];
const add = (type, pathId, value) => {
  const o = { type, pathId, file: FILE };
  objects.push(o);
  values.set(o, value);
  return o;
};

// Le clip Mecanim reprend le flux de la premiere partie ; le clip legacy range
// ses cles telles quelles, tangentes comprises.
add("AnimationClip", 101, { m_Name: "Stargazing", m_AnimationType: 2, ...clip });
const key = (time, v, s) => ({ time, value: v, inSlope: s, outSlope: s });
add("AnimationClip", 102, {
  m_Name: "Default Idle", m_AnimationType: 1,
  m_PositionCurves: [{ path: "Bone_JNT/Tip", curve: { m_Curve: [
    key(0, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }),
    key(1, { x: 0, y: 2, z: 3 }, { x: 0, y: 1, z: 1 })] } }],
  m_RotationCurves: [{ path: "", curve: { m_Curve: [
    key(0, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0, w: 0 }),
    key(1, { x: 0, y: 1, z: 0, w: 0 }, { x: 0, y: 0, z: 0, w: 0 })] } }],
});
// Un controleur dont l'etat par defaut est le second : le premier clip sortira
// prefixe « ~ », comme un etat que rien ne demarre.
add("AnimatorController", 200, {
  m_AnimationClips: [ptr(101), ptr(102)],
  m_Controller: { m_StateMachineArray: [{ data: { m_DefaultState: 1 } }],
                  m_HumanLayerArray: [{ data: { m_StateMachineIndex: 0 } }] },
});
add("Animator", 300, { m_GameObject: ptr(1), m_Controller: ptr(200) });
add("Avatar", 400, { m_TOS: [{ first: 7, second: "Bone_JNT" }] });

const fake = {
  sceneFile: "level0",
  env: {
    get: () => FILE,
    *objects({ type = null } = {}) {
      for (const o of objects) if (!type || o.type === type) yield o;
    },
    deref: (p) => (p ? objects.find((o) => o.pathId === p.pathId) || null : null),
  },
  readEngine: (o) => values.get(o) || null,
  transformOf: new Map([[1, transform([12])], [2, transform([13])], [3, transform()]]),
  transformId: new Map([[1, 11], [2, 12], [3, 13]]),
  name: (gid) => NAMES.get(gid) || null,
};

const out = exportSubtree(fake, 1, "villager", { emitImage: () => null });
check("noeuds exportes", out.gltf.nodes.length, 3);
check("animations exportees", out.stats.animations, 2);
check("os Mecanim non resolus (monde fabrique)", out.stats.unresolvedBones, 0);
const byName = new Map(out.gltf.animations.map((a) => [a.name, a]));
check("clip par defaut du controleur", byName.has("Villager|Default Idle"), true);
check("clip non demarre, prefixe", byName.has("~Villager|Stargazing"), true);

// Le clip Mecanim vise l'os par son nom, resolu via la table de l'Avatar.
const mecanim = byName.get("~Villager|Stargazing");
const boneNode = out.gltf.nodes.findIndex((n) => n.name === "Bone_JNT");
check("canaux du clip Mecanim", mecanim.channels.length, 2);
check("canaux Mecanim vises sur l'os",
      mecanim.channels.every((c) => c.target.node === boneNode), true);
check("interpolation cubique",
      mecanim.samplers.every((s) => s.interpolation === "CUBICSPLINE"), true);
check("trois elements par cle en CUBICSPLINE",
      mecanim.samplers.every((s) => out.gltf.accessors[s.output].count
                                 === out.gltf.accessors[s.input].count * 3), true);

// Le clip legacy resout son chemin de hierarchie, et la conversion de repere
// change le signe de Z -- sur les valeurs comme sur les tangentes.
const legacy = byName.get("Villager|Default Idle");
const tipNode = out.gltf.nodes.findIndex((n) => n.name === "Tip");
const posChannel = legacy.channels.find((c) => c.target.path === "translation");
check("chemin de hierarchie resolu", posChannel.target.node, tipNode);
const posAcc = out.gltf.accessors[legacy.samplers[posChannel.sampler].output];
const posView = out.gltf.bufferViews[posAcc.bufferView];
const pos = new Float32Array(out.bin.buffer, out.bin.byteOffset + posView.byteOffset,
                             posAcc.count * 3);
check("valeur de position convertie", `${pos[3]} ${pos[4]} ${pos[5]}`, "0 0 -1");
check("tangente de position convertie", `${pos[15]} ${pos[16]} ${pos[17]}`, "0 1 -1");

// --- 3. l'export du build ---------------------------------------------------

if (!haveBuild()) {
  console.log(`\nbuild absent (${BUILD}) — la seconde moitie du test est ignoree`);
  report();
  process.exit();
}

const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];
const u = new TypeUniverse();
for (const a of ASSEMBLIES) {
  u.add(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`))));
}
const env = await loadEnv();
// Les structures des classes moteur (unity41-types.json) sont INDISPENSABLES :
// `Animator`, `Animation` et `AnimatorController` en font partie. Sans elles,
// readEngine retombe sur les quelques lecteurs ecrits en dur et rend null pour
// tous les trois — le test mesurait alors un pipeline ampute, et comptait zero
// animation sur un build qui en porte.
const engineTypes = JSON.parse(readFileSync(
  "web/src/pipeline/unity/unity41-types.json", "utf8"));
const ctx = new ExtractContext(env, u, "level0", engineTypes);

let animations = 0, channels = 0, cubic = 0, linear = 0, unresolved = 0;
let quaternions = 0, worstNorm = 0, badTimes = 0, badTargets = 0, badCubic = 0;

console.time("animations");
for (const root of findRoots(ctx)) {
  // maxMeshes: 0 -- les animations ne dependent pas de la geometrie, et s'en
  // passer evite de decoder 1 569 maillages pour verifier des courbes.
  const res = exportSubtree(ctx, root.gid, root.name.toLowerCase(),
                            { emitImage: () => null, maxMeshes: 0 });
  if (!res) continue;
  const { gltf, stats } = res;
  animations += stats.animations;
  channels += stats.channels;
  cubic += stats.cubic;
  linear += stats.linear;
  unresolved += stats.unresolvedBones;
  if (stats.animations) {
    console.log(`     ${root.name.padEnd(22)} ${String(stats.animations).padStart(3)} animations,`
      + ` ${String(stats.channels).padStart(5)} canaux`
      + ` (${stats.cubic} cubiques, ${stats.linear} lineaires,`
      + ` ${stats.mecanimClips} clips Mecanim, ${stats.unresolvedBones} os non resolus)`);
  }

  // Chaque canal doit viser un noeud du fichier, et chaque echantillonneur
  // porter autant de valeurs que de temps -- trois fois plus en CUBICSPLINE,
  // ou chaque cle emporte ses deux tangentes.
  for (const anim of gltf.animations || []) {
    for (const ch of anim.channels) {
      if (!(ch.target.node >= 0 && ch.target.node < gltf.nodes.length)) badTargets++;
    }
    for (const s of anim.samplers) {
      const times = gltf.accessors[s.input], values = gltf.accessors[s.output];
      const factor = s.interpolation === "CUBICSPLINE" ? 3 : 1;
      if (values.count !== times.count * factor) badCubic++;
      if (!(times.min[0] <= times.max[0]) || !Number.isFinite(times.min[0])) badTimes++;
    }
    // Norme des quaternions : un mauvais appariement des composantes entre os
    // voisins la casserait. Les tangentes, elles, ne sont pas unitaires.
    for (const ch of anim.channels) {
      if (ch.target.path !== "rotation") continue;
      const s = anim.samplers[ch.sampler];
      const acc = gltf.accessors[s.output];
      const view = gltf.bufferViews[acc.bufferView];
      const f = new Float32Array(res.bin.buffer, res.bin.byteOffset + view.byteOffset,
                                 acc.count * 4);
      const stride = s.interpolation === "CUBICSPLINE" ? 3 : 1;
      const start = s.interpolation === "CUBICSPLINE" ? 1 : 0;
      for (let i = start; i < acc.count; i += stride) {
        const o = i * 4;
        const n = Math.hypot(f[o], f[o + 1], f[o + 2], f[o + 3]);
        quaternions++;
        worstNorm = Math.max(worstNorm, Math.abs(n - 1));
      }
    }
  }
}
console.timeEnd("animations");

console.log(`     total : ${animations} animations, ${channels} canaux`
  + ` (${cubic} cubiques, ${linear} lineaires), ${quaternions} quaternions`);
check("animations exportees", animations > 0, true);
check("canaux exportes", channels > 0, true);
check("os Mecanim non resolus", unresolved, 0);
check("canaux vises hors du fichier", badTargets, 0);
check("echantillonneurs mal dimensionnes", badCubic, 0);
check("temps d'echantillonnage valides", badTimes, 0);
check("quaternions unitaires a 1e-3", worstNorm < 1e-3, true);
report();
