import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WEB_DIR = path.resolve("web");
const ZIP_PATH = path.resolve("work/downloads/OuterWilds_Alpha_1_2_Linux.zip");
const USER_DATA_DIR = path.resolve("work/pw-profile");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Create static server
const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, "http://localhost").pathname;
  let filePath = path.join(WEB_DIR, urlPath === "/" ? "index.html" : urlPath);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
    return;
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Service-Worker-Allowed": "/",
  });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(8089, "127.0.0.1", resolve));
console.log("Static server running on http://127.0.0.1:8089");

try {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    // Un conteneur fournit souvent un Chromium deja installe dont la version
    // ne suit pas celle du paquet playwright : on le prend s'il est la.
    executablePath: process.env.PW_CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    console.log(`[Browser ${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.error(`[Browser PageError]`, err);
  });

  await page.goto("http://127.0.0.1:8089/");
  console.log("Page loaded!");

  // Wait for initGate to finish its initial check
  await page.waitForFunction(() => {
    const done = document.getElementById("gate-step-done");
    const summary = document.getElementById("gate-summary");
    const drop = document.getElementById("gate-step-drop");
    const err = document.getElementById("gate-error");
    if (err && !err.hidden) throw new Error(err.textContent);
    return (done && !done.hidden) || (drop && !drop.hidden);
  });

  // Check if already extracted
  const isExtracted = await page.evaluate(async () => {
    const { vfs } = await import("./src/vfs.js");
    return await vfs.exists("data/solar_system.json");
  });

  if (isExtracted) {
    console.log("Already extracted! Waiting for play button...");
    await page.waitForSelector("#gate-step-done:not([hidden])");
  } else {
    console.log("Dropping zip file for extraction...");
    const fileInput = await page.$("#gate-file");
    await fileInput.setInputFiles(ZIP_PATH);
    console.log("File uploaded. Waiting for extraction to complete...");

    // Wait for step-done with table summary to appear
    await page.waitForSelector("#gate-summary table", { timeout: 180000 });
    console.log("Extraction completed successfully!");
  }

  // Click play button
  console.log("Clicking play button...");
  await page.click("#gate-play");

  // Wait for game to initialize (window.__ready === true)
  console.log("Waiting for window.__ready...");
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  console.log("Game initialized! window.__ready is true!");

  // Inspect state
  const state = await page.evaluate(() => {
    return {
      playerPos: window.__player ? [window.__player.pos.x, window.__player.pos.y, window.__player.pos.z] : null,
      bodiesCount: window.__bodies ? window.__bodies.length : 0,
      shipReady: window.__ship,
      reveilActive: window.__reveil ? window.__reveil.active : null,
    };
  });
  console.log("Game state:", JSON.stringify(state, null, 2));

  await context.close();
} finally {
  server.close();
}
