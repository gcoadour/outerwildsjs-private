// Ce que les scripts Playwright du depot partagent : le serveur statique qui
// sert web/ tel qu'il sera publie, et le lancement de Chromium sur le profil
// qui garde l'extraction (le stockage prive de l'origine vit dans le profil,
// et le port fait partie de l'origine : on ne le change pas d'un script a
// l'autre).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export const WEB_DIR = path.resolve("web");
export const ZIP_PATH = path.resolve("work/downloads/OuterWilds_Alpha_1_2_Linux.zip");
export const USER_DATA_DIR = path.resolve("work/pw-profile");
export const PORT = 8089;

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png",
  ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export async function serveur() {
  const server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, "http://localhost").pathname;
    const filePath = path.join(WEB_DIR, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(WEB_DIR) || !fs.existsSync(filePath)
        || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Service-Worker-Allowed": "/",
    });
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  return server;
}

// Un conteneur fournit souvent un Chromium deja installe dont la version ne
// suit pas celle du paquet playwright : on le prend s'il est la. Sans GPU, le
// WebGL passe par SwiftShader, qu'il faut autoriser explicitement.
export async function navigateur({ largeur = 1280, hauteur = 720 } = {}) {
  const exe = process.env.PW_CHROMIUM
    || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    executablePath: exe,
    viewport: { width: largeur, height: hauteur },
    args: ["--no-sandbox", "--disable-setuid-sandbox",
           "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
           "--autoplay-policy=no-user-gesture-required"],
  });
}

/** Ouvre la page, fournit le build s'il le faut, et attend le moteur. */
export async function demarrer(page, { avant = null } = {}) {
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => {
    const done = document.getElementById("gate-step-done");
    const drop = document.getElementById("gate-step-drop");
    return (done && !done.hidden) || (drop && !drop.hidden);
  });
  const extrait = await page.evaluate(async () => {
    const { vfs } = await import("./src/vfs.js");
    return vfs.exists("data/solar_system.json");
  });
  if (!extrait) {
    await (await page.$("#gate-file")).setInputFiles(ZIP_PATH);
    await page.waitForSelector("#gate-summary table", { timeout: 300000 });
  }
  await page.click("#gate-play");
  await traverserTitre(page, "KeyE", avant);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
}

/**
 * Attend que la compilation des shaders soit passee.
 *
 * Sans GPU, SwiftShader compile les 220 effets de la scene pendant la premiere
 * minute, a raison de plusieurs secondes par image : un scenario qui tient une
 * touche une demi-seconde tombe alors ENTRE deux images, et ne mesure rien. On
 * attend que quelques images de suite passent sous le seuil.
 */
export async function prechauffer(page, { seuilMs = 1000, suite = 5, maxMs = 240000 } = {}) {
  return page.evaluate(async ({ seuilMs, suite, maxMs }) => {
    const sc = BABYLON.EngineStore.LastCreatedScene;
    const t0 = performance.now();
    let bonnes = 0, prec = performance.now();
    await new Promise((fini) => {
      const obs = sc.onAfterRenderObservable.add(() => {
        const t = performance.now();
        bonnes = (t - prec < seuilMs) ? bonnes + 1 : 0;
        prec = t;
        if (bonnes >= suite || t - t0 > maxMs) {
          sc.onAfterRenderObservable.remove(obs);
          fini();
        }
      });
    });
    return { ms: performance.now() - t0, stable: bonnes >= suite };
  }, { seuilMs, suite, maxMs });
}

/**
 * Traverse l'ecran-titre comme un joueur : « New Expedition » est la ligne
 * choisie a l'ouverture, et `Interact` (E) la valide. Sans titre extrait, le
 * moteur part droit dans la partie et il n'y a rien a faire.
 */
export async function traverserTitre(page, touche = "KeyE", avant = null) {
  await page.waitForFunction(() => window.__titre || window.__ready === true, null,
                             { timeout: 120000 });
  if (await page.evaluate(() => window.__ready === true)) return false;
  // Les touches a passer avant de valider (`KeyS` : « Skip Intro »), espacees
  // de plus que la cadence du menu (0,2 s).
  // Le menu lit l'AXE tenu, image par image : un appui instantane tombe entre
  // deux images sous SwiftShader, et un appui tenu peut sauter deux lignes. On
  // vise donc une LIGNE (`avant` : son numero), en tenant S ou W jusqu'a ce
  // que le curseur bouge, et on corrige si l'on a depasse.
  if (typeof avant === "number") {
    for (let essai = 0; essai < 12; essai++) {
      const i0 = await page.evaluate(() => window.__titre.menu.index);
      if (i0 === avant) break;
      const k = i0 < avant ? "KeyS" : "KeyW";
      await page.keyboard.down(k);
      await page.waitForFunction((i) => window.__titre.menu.index !== i, i0,
                                 { timeout: 20000, polling: 16 }).catch(() => {});
      await page.keyboard.up(k);
      await page.waitForTimeout(400);
    }
    console.log("titre : ligne", await page.evaluate(() => window.__titre.menu.index));
  }
  await page.keyboard.press(touche);
  return true;
}
