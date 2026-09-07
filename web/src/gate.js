// Ecran d'accueil : demande le fichier de l'alpha, puis lance le pipeline.
//
// Rien n'est televerse. Le fichier est lu dans l'onglet, decompresse dans un
// Web Worker, et tout ce qui en sort reste dans le stockage prive de l'origine.
// Aucune ressource du jeu n'est servie par cette page : elles n'y sont pas.

import { vfs } from "./vfs.js";

const $ = (id) => document.getElementById(id);

const PHASES = {
  archive: "Extraction de l'archive",
  chargement: "Ouverture des fichiers du build",
  assemblies: "Regeneration des type trees",
  indexation: "Indexation de la scene",
  scene: "Graphe de scene",
  composants: "Champs des composants",
  systeme: "Systeme solaire",
  gameplay: "Vaisseau et interactifs",
  dialogue: "Dialogues",
  audio: "Audio",
  shaders: "Shaders",
  particules: "Particules",
  interface: "Interface",
  geometrie: "Geometrie des corps",
  fini: "Termine",
};

function human(bytes) {
  const units = ["o", "Ko", "Mo", "Go"];
  let v = bytes, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i ? 1 : 0)} ${units[i]}`;
}

/** Le pipeline a-t-il deja tourne dans ce navigateur ? */
async function alreadyExtracted() {
  return vfs.exists("data/solar_system.json");
}

function setProgress(phase, message, ratio) {
  $("gate-phase").textContent = PHASES[phase] || phase;
  $("gate-detail").textContent = message || "";
  const bar = $("gate-bar");
  if (ratio === null || ratio === undefined) {
    bar.removeAttribute("value");
  } else {
    bar.value = Math.max(0, Math.min(1, ratio));
  }
}

function showSummary(summary, seconds) {
  const rows = Object.entries(summary)
    .map(([k, v]) => `<tr><td>${v.toLocaleString("fr")}</td><td>${k}</td></tr>`).join("");
  $("gate-summary").innerHTML = `<table>${rows}</table>
    <p class="muted">Extraction terminee en ${seconds} s.</p>`;
}

/**
 * Charge Babylon.js. La copie locale de web/vendor/ est preferee ; le CDN ne
 * sert que de repli, car il n'est pas toujours joignable. Le deploiement
 * GitHub Pages depose vendor/ a la publication, pour que la page ne depende
 * d'aucun tiers a l'execution.
 */
function loadScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error(src));
    document.head.appendChild(s);
  });
}

async function loadBabylon() {
  await loadScript("vendor/babylon.js")
    .catch(() => loadScript("https://cdn.babylonjs.com/babylon.js"));
  // Le chargeur glTF est optionnel : sans lui le moteur tourne avec les
  // spheres de substitution.
  await loadScript("vendor/babylonjs.loaders.min.js")
    .catch(() => loadScript("https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"))
    .catch(() => console.warn("chargeur glTF indisponible"));
  // Havok est optionnel : sans lui la collision reste analytique.
  await loadScript("vendor/HavokPhysics_umd.js")
    .catch(() => console.warn("Havok indisponible"));
}

async function startEngine() {
  $("gate-play").disabled = true;
  $("gate-play").textContent = "Chargement du moteur…";
  try {
    await loadBabylon();
  } catch (e) {
    fail(`Babylon.js n'a pas pu etre charge (${e.message}).`);
    $("gate-play").disabled = false;
    $("gate-play").textContent = "Entrer dans le systeme";
    return;
  }
  $("gate").hidden = true;
  document.body.classList.add("playing");
  await import("./main.js");
}

function runPipeline(file, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pipeline/worker.js", import.meta.url),
                              { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") setProgress(m.phase, m.message, m.ratio);
      else if (m.type === "done") { worker.terminate(); resolve(m); }
      else if (m.type === "error") { worker.terminate(); reject(new Error(m.message)); }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || "erreur du Worker")); };
    worker.postMessage({ file, options });
  });
}

function fail(message) {
  $("gate-step-drop").hidden = false;
  $("gate-step-work").hidden = true;
  $("gate-error").hidden = false;
  $("gate-error").textContent = message;
}

async function handleFile(file) {
  if (!file) return;
  $("gate-error").hidden = true;
  $("gate-step-drop").hidden = true;
  $("gate-step-work").hidden = false;
  setProgress("archive", `Lecture de ${file.name} (${human(file.size)})`, null);

  try {
    const options = { geometry: $("opt-geometry").checked,
                      maxTexture: Number($("opt-texture").value) || 512 };
    const result = await runPipeline(file, options);
    showSummary(result.summary, result.seconds);
    $("gate-step-work").hidden = true;
    $("gate-step-done").hidden = false;
  } catch (e) {
    fail(e.message);
  }
}

async function checkSupport() {
  const missing = [];
  if (!navigator.storage || !navigator.storage.getDirectory) missing.push("stockage prive de l'origine");
  if (typeof DecompressionStream === "undefined") missing.push("DecompressionStream");
  if (typeof OffscreenCanvas === "undefined") missing.push("OffscreenCanvas");
  if (!navigator.serviceWorker) missing.push("Service Worker");
  return missing;
}

export async function initGate() {
  const missing = await checkSupport();
  if (missing.length) {
    $("gate-step-drop").hidden = true;
    $("gate-error").hidden = false;
    $("gate-error").textContent =
      `Ce navigateur ne fournit pas : ${missing.join(", ")}. `
      + "Un navigateur recent de bureau est necessaire.";
    return;
  }

  // Le Service Worker sert les fichiers extraits sous data/. Sans lui, les
  // chemins relatifs des glTF vers leur .bin et leurs textures ne resolvent pas.
  try {
    await navigator.serviceWorker.register(new URL("./sw.js", document.baseURI));
    await navigator.serviceWorker.ready;
  } catch (e) {
    $("gate-error").hidden = false;
    $("gate-error").textContent =
      `Le Service Worker n'a pas pu demarrer (${e.message}). `
      + "La page doit etre servie en HTTPS ou depuis localhost.";
    return;
  }

  const input = $("gate-file");
  const drop = $("gate-drop");
  input.addEventListener("change", () => handleFile(input.files[0]));
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    handleFile(e.dataTransfer.files[0]);
  });

  $("gate-play").addEventListener("click", startEngine);
  $("gate-reset").addEventListener("click", async () => {
    await vfs.clear();
    location.reload();
  });

  if (await alreadyExtracted()) {
    $("gate-step-drop").hidden = true;
    $("gate-step-done").hidden = false;
    $("gate-summary").innerHTML =
      `<p>Une extraction est deja presente dans ce navigateur (${human(await vfs.size())}).</p>`;
  }
}
