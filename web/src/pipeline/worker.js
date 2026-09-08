// Pipeline complet, dans un Web Worker.
//
// Recoit l'archive de l'alpha choisie par la personne qui visite la page,
// extrait les fichiers necessaires dans le stockage prive de l'origine, puis
// rejoue toute la chaine d'analyse : lecture des fichiers serialises,
// regeneration des type trees depuis les assemblies, et ecriture des donnees
// que le moteur consomme.
//
// Rien ne sort du navigateur : aucune requete reseau n'est faite ici.

import { readZipDirectory, extractZipEntry } from "./zip.js";
import { UnityEnv } from "./unity/env.js";
import { SyncFileSource } from "./unity/source.js";
import { TypeUniverse } from "./dotnet/typetree.js";
import { ExtractContext } from "./extract/context.js";
import { extractScene } from "./extract/scene.js";
import { extractComponents } from "./extract/components.js";
import { extractSolarSystem } from "./extract/solar.js";
import { extractGameplay } from "./extract/gameplay.js";
import { extractDialogue } from "./extract/dialogue.js";
import { extractAudio } from "./extract/audio.js";
import { extractShaders } from "./extract/shaders.js";
import { extractParticles } from "./extract/particles.js";
import { extractInterface } from "./extract/interface.js";
import { extractLighting } from "./extract/lighting.js";
import { exportSubtree, findRoots } from "./extract/gltf.js";
import { encodeImage, imageExtension } from "./imaging.js";
import { encodeOpus, opusAvailable } from "./audioenc.js";

const ROOT = "outerwilds";

// Fichiers du build dont le pipeline a besoin. Le reste de l'archive -- le
// lanceur natif, le runtime Mono, les assemblies systeme -- est ignore.
const DATA_FILES = ["mainData", "level0", "resources.assets",
                    "sharedassets0.assets", "sharedassets1.assets"];
const RESOURCE_FILES = ["sharedassets1.assets.resS"];
const BUILTIN_RESOURCES = "unity default resources";
const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];

let progressPhase = "";
function post(type, payload) { self.postMessage({ type, ...payload }); }
function phase(name, message) {
  progressPhase = name;
  post("progress", { phase: name, message, ratio: null });
}
function step(message, ratio) {
  post("progress", { phase: progressPhase, message, ratio });
}

// --- stockage ---------------------------------------------------------------

async function dirFor(path, { create = true } = {}) {
  const base = await navigator.storage.getDirectory();
  let dir = await base.getDirectoryHandle(ROOT, { create });
  for (const p of path.split("/").filter(Boolean)) {
    dir = await dir.getDirectoryHandle(p, { create });
  }
  return dir;
}

async function fileHandle(path, { create = true } = {}) {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop();
  const dir = await dirFor(parts.join("/"), { create });
  return dir.getFileHandle(name, { create });
}

async function writeFile(path, data) {
  const handle = await fileHandle(path);
  const w = await handle.createWritable();
  await w.write(data);
  await w.close();
}

async function removeAll() {
  const base = await navigator.storage.getDirectory();
  try { await base.removeEntry(ROOT, { recursive: true }); } catch { /* rien */ }
}

// --- extraction de l'archive ------------------------------------------------

/** Repere le dossier *_Data et retient les entrees utiles. */
function selectEntries(entries) {
  const level0 = entries.find((e) => /(^|\/)[^/]*_Data\/level0$/.test(e.name));
  if (!level0) {
    throw new Error("Ce fichier ne ressemble pas au build de l'alpha : "
      + "aucun dossier *_Data contenant level0 n'y figure.");
  }
  const prefix = level0.name.slice(0, level0.name.lastIndexOf("/") + 1);
  const wanted = [];
  for (const e of entries) {
    if (!e.name.startsWith(prefix) || e.name.endsWith("/")) continue;
    const rel = e.name.slice(prefix.length);
    if (DATA_FILES.includes(rel) || RESOURCE_FILES.includes(rel)) {
      wanted.push({ entry: e, target: `game/${rel}` });
    } else if (rel === `Resources/${BUILTIN_RESOURCES}`) {
      wanted.push({ entry: e, target: `game/${BUILTIN_RESOURCES}` });
    } else if (rel.startsWith("Managed/") && rel.endsWith(".dll")
               && ASSEMBLIES.includes(rel.slice(8, -4))) {
      wanted.push({ entry: e, target: `game/managed/${rel.slice(8)}` });
    }
  }
  const missing = DATA_FILES.filter(
    (f) => !wanted.some((w) => w.target === `game/${f}`));
  if (missing.length) {
    throw new Error(`Fichiers absents de l'archive : ${missing.join(", ")}`);
  }
  return wanted;
}

async function extractArchive(blob) {
  phase("archive", "Lecture du repertoire de l'archive…");
  const entries = await readZipDirectory(blob);
  const wanted = selectEntries(entries);
  const total = wanted.reduce((s, w) => s + w.entry.size, 0);

  let done = 0;
  for (const { entry, target } of wanted) {
    const handle = await fileHandle(target);
    const writable = await handle.createWritable();
    await extractZipEntry(blob, entry, writable, (n) => {
      done += n;
      // Un rapport par bloc saturerait le fil principal : on n'en emet qu'un
      // par mega-octet environ.
      if (done % (1 << 20) < n) {
        step(`Extraction ${target.replace("game/", "")}`, done / total);
      }
    });
  }
  step("Archive extraite", 1);
  return wanted.map((w) => w.target);
}

// --- pipeline ---------------------------------------------------------------

async function openSource(path) {
  const handle = await fileHandle(path, { create: false });
  return new SyncFileSource(await handle.createSyncAccessHandle());
}

async function readWhole(path) {
  const handle = await fileHandle(path, { create: false });
  return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

async function run(blob, options) {
  const started = Date.now();
  await removeAll();
  await extractArchive(blob);

  phase("chargement", "Ouverture des fichiers du build…");
  const env = new UnityEnv();
  const sources = [];
  for (const r of RESOURCE_FILES) {
    try {
      const s = await openSource(`game/${r}`);
      sources.push(s);
      env.addResource(r, s);
    } catch { /* le .resS peut manquer : 132 des 142 clips sont en ligne */ }
  }
  for (const f of [...DATA_FILES, BUILTIN_RESOURCES]) {
    try {
      const s = await openSource(`game/${f}`);
      sources.push(s);
      env.add(f, s);
    } catch (e) {
      if (DATA_FILES.includes(f)) throw e;
      // Les ressources integrees d'Unity sont facultatives.
    }
  }

  phase("assemblies", "Lecture des assemblies et regeneration des type trees…");
  const universe = new TypeUniverse();
  for (const a of ASSEMBLIES) {
    try {
      universe.add(a, await readWhole(`game/managed/${a}.dll`));
    } catch { /* assembly absent : les classes qu'il porte resteront illisibles */ }
  }

  const typesResponse = await fetch(new URL("./unity/unity41-types.json", import.meta.url));
  const engineTypes = await typesResponse.json();

  phase("indexation", "Indexation de la scene…");
  const ctx = new ExtractContext(env, universe, "level0", engineTypes);
  step(`${ctx.gameObjects.size} objets de scene indexes`, 1);

  const summary = {};

  // File d'images : les extracteurs sont synchrones, l'encodage ne l'est pas.
  // On vide la file entre deux etapes pour ne pas garder tous les pixels.
  let queue = [];
  const emitImage = (name, img) => {
    const finalName = name.replace(/\.png$/, imageExtension(img));
    queue.push({ name: finalName, img });
    return finalName;
  };
  const drainImages = async (dir) => {
    const pending = queue;
    queue = [];
    let i = 0;
    for (const { name, img } of pending) {
      const { blob: encoded } = await encodeImage(img);
      await writeFile(`${dir}/${name}`, encoded);
      if (++i % 8 === 0) step(`Encodage des images (${i}/${pending.length})`, i / pending.length);
    }
    return pending.length;
  };

  phase("scene", "Graphe de scene…");
  const scene = extractScene(ctx, { onProgress: (d, t) => step(`${d}/${t} objets`, d / t) });
  await writeFile("data/scene/level0.json", JSON.stringify(scene));
  summary.noeuds = scene.node_count;
  summary.composants = scene.component_count;

  phase("composants", "Valeurs des champs des MonoBehaviour…");
  const comps = extractComponents(ctx, { onProgress: (n) => step(`${n} composants`, null) });
  await writeFile("data/components/level0.json", JSON.stringify(comps));
  summary["monobehaviour lus"] = comps.count;

  phase("systeme", "Systeme solaire…");
  const solar = extractSolarSystem(ctx);
  await writeFile("data/solar_system.json", JSON.stringify(solar));
  summary.corps = solar.bodies.length;

  phase("gameplay", "Vaisseau, ressources, interactifs…");
  const gameplay = extractGameplay(ctx);
  await writeFile("data/gameplay.json", JSON.stringify(gameplay));
  summary.interactifs = (gameplay.placed.InteractReceiver || []).length;

  phase("dialogue", "Arbres de dialogue…");
  const dialogue = extractDialogue(ctx);
  await writeFile("data/dialogue/dialogue.json", JSON.stringify(dialogue));
  summary.dialogues = Object.keys(dialogue.trees).length;

  phase("audio", "Clips et sources audio…");
  const audioFiles = [];
  const audio = extractAudio(ctx, (name, bytes) => audioFiles.push({ name, bytes }));
  // Les quinze clips que le build stocke DECODES pesent 15 Mo de WAV. On les
  // reencode ici, une fois pour toutes, avec l'encodeur Opus du navigateur ;
  // sans lui, ou au moindre accroc, le WAV part tel quel.
  const renamed = new Map();
  let opusGain = 0, opusCount = 0;
  const canOpus = opusAvailable();
  let n = 0;
  for (const { name, bytes } of audioFiles) {
    let out = name, data = bytes;
    if (canOpus && /\.wav$/i.test(name)) {
      step(`Reencodage Opus (${++n}/${audioFiles.length})`, n / audioFiles.length);
      const opus = await encodeOpus(bytes);
      if (opus && opus.length < bytes.length) {
        out = name.replace(/\.wav$/i, ".ogg");
        data = opus;
        opusGain += bytes.length - opus.length;
        opusCount += 1;
        renamed.set(name, out);
      }
    }
    await writeFile(`data/audio/${out}`, data);
  }
  for (const s of audio.sources) if (renamed.has(s.file)) s.file = renamed.get(s.file);
  await writeFile("data/audio/sources.json", JSON.stringify(audio));
  summary["clips audio"] = audioFiles.length;
  summary["sources audio"] = audio.sources.length;
  if (opusCount) {
    summary["clips en Opus"] = opusCount;
    summary["Mo economises"] = Math.round(opusGain / (1 << 20) * 10) / 10;
  }

  phase("lumieres", "Lumieres posees et reglages de rendu…");
  const lighting = extractLighting(ctx);
  await writeFile("data/lighting.json", JSON.stringify(lighting));
  summary.lumieres = lighting.lights.length;

  phase("shaders", "Sources ShaderLab…");
  const shaderFiles = [];
  const shaders = extractShaders(ctx, (name, src) => shaderFiles.push({ name, src }));
  for (const { name, src } of shaderFiles) await writeFile(`data/shaders/${name}`, src);
  await writeFile("data/shaders/report.json", JSON.stringify(shaders));
  summary.shaders = shaderFiles.length;

  phase("particules", "Systemes de particules…");
  const particles = extractParticles(ctx, emitImage);
  await drainImages("data/particles");
  await writeFile("data/particles/systems.json", JSON.stringify(particles));
  summary.particules = particles.systems.length;

  phase("interface", "Jauges, invites, polices…");
  const uiFiles = [];
  const ui = extractInterface(ctx, emitImage, (name, bytes) => uiFiles.push({ name, bytes }),
                              universe.assemblies.get("Assembly-CSharp"));
  await drainImages("data/interface");
  for (const { name, bytes } of uiFiles) await writeFile(`data/interface/${name}`, bytes);
  await writeFile("data/interface/interface.json", JSON.stringify(ui));
  summary["invites a l'ecran"] = ui.prompts.catalogue.length;
  summary["polices"] = Object.keys(ui.fonts).length;

  // mainData : la scene de demarrage et les managers.
  //
  // Le worker chargeait bien les cinq fichiers, mais l'ExtractContext etait
  // construit sur `level0` seul : les 989 objets de mainData ne sortaient
  // jamais. C'est ce qui explique les rendus V-Fog restes introuvables
  // (docs/20-shaders-jeu.md) et l'absence de menu principal (docs/28-hud.md).
  // On l'inventorie donc, avant de decider quoi en porter.
  phase("maindata", "Scene de demarrage (mainData)…");
  try {
    const mctx = new ExtractContext(env, universe, "mainData", engineTypes);
    const mscene = extractScene(mctx);
    await writeFile("data/scene/maindata.json", JSON.stringify(mscene));
    const mcomps = extractComponents(mctx);
    await writeFile("data/components/maindata.json", JSON.stringify(mcomps));
    summary["objets de mainData"] = mscene.node_count;
    summary["monobehaviour de mainData"] = mcomps.count;
  } catch (e) {
    // Un fichier de demarrage illisible ne doit pas emporter l'extraction du
    // monde jouable, qui est deja ecrite a ce stade.
    console.warn("mainData non extrait :", e && e.message);
    summary["objets de mainData"] = 0;
  }

  if (options.geometry !== false) {
    phase("geometrie", "Export glTF des corps celestes…");
    const roots = findRoots(ctx);
    let i = 0, animations = 0, channels = 0;
    for (const root of roots) {
      const label = root.name.toLowerCase();
      step(`${root.name} (${++i}/${roots.length})`, i / roots.length);
      const res = exportSubtree(ctx, root.gid, label, {
        emitImage, maxTexture: options.maxTexture || 512,
      });
      if (!res) continue;
      await writeFile(`data/gltf/${label}.gltf`, JSON.stringify(res.gltf));
      await writeFile(`data/gltf/${label}.bin`, res.bin);
      await drainImages("data/gltf");
      animations += res.stats.animations;
      channels += res.stats.channels;
    }
    summary["corps en glTF"] = roots.length;
    summary.animations = animations;
    summary["canaux d'animation"] = channels;
  }

  for (const s of sources) s.close();

  phase("fini", "Termine");
  post("done", { summary, seconds: Math.round((Date.now() - started) / 1000) });
}

self.onmessage = async (e) => {
  const { file, options = {} } = e.data;
  try {
    await run(file, options);
  } catch (err) {
    post("error", { message: err && err.message ? err.message : String(err) });
  }
};
