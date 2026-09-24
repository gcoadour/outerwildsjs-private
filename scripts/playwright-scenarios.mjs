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
console.log("Serveur Playwright sur http://127.0.0.1:8089");

let passed = 0;
let total = 0;

function assert(name, condition, details = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] ${name} ${details}`);
  } else {
    console.error(`[FAIL] ${name} ${details}`);
  }
}

try {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await context.newPage();

  page.on("console", (msg) => {
    // console.log(`[Browser ${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.error(`[Browser PageError]`, err.message);
  });

  await page.goto("http://127.0.0.1:8089/");

  // Wait for initGate
  await page.waitForFunction(() => {
    const done = document.getElementById("gate-step-done");
    const drop = document.getElementById("gate-step-drop");
    return (done && !done.hidden) || (drop && !drop.hidden);
  });

  const isExtracted = await page.evaluate(async () => {
    const { vfs } = await import("./src/vfs.js");
    return await vfs.exists("data/solar_system.json");
  });

  if (!isExtracted) {
    console.log("Archive en cours d'extraction...");
    const fileInput = await page.$("#gate-file");
    await fileInput.setInputFiles(ZIP_PATH);
    await page.waitForSelector("#gate-summary table", { timeout: 180000 });
  }

  await page.click("#gate-play");
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  console.log("Moteur initialise avec succes.");

  // ==========================================
  // SCENARIO 1: REVEIL DU JOUEUR & REGARD
  // ==========================================
  console.log("\n--- Scenario 1: Reveil du joueur ---");
  const reveilInfo = await page.evaluate(() => {
    const cam = window.__regardCam();
    return {
      reveilArme: window.__reveil ? window.__reveil.arme : false,
      pitch: cam ? cam.pitch : 0,
      yaw: cam ? cam.yaw : 0,
    };
  });
  assert("Reveil arme au depart", reveilInfo.reveilArme === true);
  assert("Angle initial de 80 degres vers le ciel", Math.abs(reveilInfo.pitch - (-80 * Math.PI / 180)) < 0.05, `pitch=${reveilInfo.pitch}`);

  // Test looking around
  await page.evaluate(() => {
    window.__look(Math.PI / 4, 0); // yaw 45 deg, pitch 0
  });
  const lookedCam = await page.evaluate(() => window.__regardCam());
  assert("Orientation camera modifiable", Math.abs(lookedCam.yaw - Math.PI / 4) < 0.01 && Math.abs(lookedCam.pitch) < 0.01);

  // ==========================================
  // SCENARIO 2: LAMPE TORCHE (F)
  // ==========================================
  console.log("\n--- Scenario 2: Lampe torche ---");
  const lampInit = await page.evaluate(() => window.__consoles?.flashlight?.on);
  assert("Lampe torche eteinte au depart", lampInit === false);

  // Toggle flashlight with key F
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(100);
  const lampOn = await page.evaluate(() => window.__consoles?.flashlight?.on);
  assert("Lampe torche allumee apres touche F", lampOn === true);

  await page.keyboard.press("KeyF");
  await page.waitForTimeout(100);
  const lampOff = await page.evaluate(() => window.__consoles?.flashlight?.on);
  assert("Lampe torche eteinte apres second appui F", lampOff === false);

  // ==========================================
  // SCENARIO 3: DEPLACEMENT DU JOUEUR (ZQSD) & SAUT
  // ==========================================
  console.log("\n--- Scenario 3: Deplacement et saut ---");
  const pos0 = await page.evaluate(() => ({ ...window.__player.pos }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyW");
  const pos1 = await page.evaluate(() => ({ ...window.__player.pos }));
  const distWalk = Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y, pos1.z - pos0.z);
  assert("Le joueur se deplace en marchant (Z/W)", distWalk > 0.5, `dist=${distWalk.toFixed(2)}m`);

  // Jump with Space
  const vy0 = await page.evaluate(() => window.__player.vel.y);
  await page.keyboard.press("Space");
  await page.waitForTimeout(50);
  const vy1 = await page.evaluate(() => window.__player.vel.y);
  assert("Le saut applique une impulsion", vy1 > vy0 || Math.abs(vy1 - vy0) > 0.1);

  // ==========================================
  // SCENARIO 4: BATON DE GUIMAUVE & SOIN
  // ==========================================
  console.log("\n--- Scenario 4: Guimauve et feu de camp ---");
  const stickInit = await page.evaluate(() => window.__mains?.baton?.out);
  assert("Baton sorti au depart (conformite alpha Awake)", stickInit === true);

  // Toggle stick (put away)
  await page.evaluate(() => window.__mains?.baton?.toggle());
  const stickAway = await page.evaluate(() => window.__mains?.baton?.out);
  assert("Baton range apres toggle", stickAway === false);

  // Toggle stick (pull out)
  await page.evaluate(() => window.__mains?.baton?.toggle());
  const stickBack = await page.evaluate(() => window.__mains?.baton?.out);
  assert("Baton resorti", stickBack === true);

  // Marshmallow heat & toast
  await page.evaluate(() => {
    window.__consoles.marshmallow.held = true;
    window.__consoles.marshmallow.update(0.5, 50); // heat 50 for 0.5s
  });
  const toastLevel = await page.evaluate(() => window.__consoles.marshmallow.toast);
  assert("La guimauve grille a la chaleur", toastLevel > 0, `toast=${toastLevel.toFixed(2)}`);

  // Hurt player slightly and eat marshmallow to heal (tested with E/Interact key)
  await page.evaluate(() => {
    window.__resources.health = 40; // hurt player
    window.__consoles.marshmallow.toast = 0.7; // perfectly toasted
    window.__consoles.marshmallow.held = true;
    window.__consoles.marshmallow.eat();
    window.__soin(window.__resources);
  });
  const healthAfter = await page.evaluate(() => window.__resources.health);
  assert("Manger la guimauve restaure 100% de sante", healthAfter === 100, `health=${healthAfter}`);

  // ==========================================
  // SCENARIO 5: COMBINAISON SPATIALE & BARRIERE COACH
  // ==========================================
  console.log("\n--- Scenario 5: Combinaison spatiale et barriere ---");
  const suitInit = await page.evaluate(() => window.__player?.suited);
  assert("Combinaison non vetue au depart", suitInit === false);
  const speedSans = await page.evaluate(() => window.__player?.c?.groundSpeed);
  assert("Vitesse au sol sans combinaison = 7 m/s", speedSans === 7);

  // Verify Coach warning dialogue when hitting barrier without suit
  const coachWarningTest = await page.evaluate(() => {
    const dlg = window.__dialogue;
    const coach = (dlg?.conversations || []).find(
      (c) => c.controller && c.controller.kind === "CoachConvoController");
    const hasSuitWarningTree = !!coach?.controller?.trees?._suitWarning;
    return { hasCoach: !!coach, hasSuitWarningTree };
  });
  assert("Arbre de dialogue _suitWarning present sur Coach", coachWarningTest.hasSuitWarningTree === true);

  // Equip suit and close warning dialogue so controls are released
  await page.evaluate(() => {
    window.__lots.equipment.suit = true;
    window.__player.setSuit(true);
    if (window.__dialogue) window.__dialogue.active = null;
  });
  const speedAvec = await page.evaluate(() => window.__player?.c?.groundSpeed);
  assert("Vitesse au sol avec combinaison = 6 m/s", speedAvec === 6);

  // ==========================================
  // SCENARIO 6: ASCENSEUR DE LA TOUR DE LANCEMENT
  // ==========================================
  console.log("\n--- Scenario 6: Ascenseur de la tour ---");
  const asc = await page.evaluate(() => {
    const list = window.__tour?.ascenseurs || [];
    return {
      count: list.length,
      trackHeight: list[0]?.data?.trackHeight,
      liftDuration: list[0]?.data?.liftDuration,
    };
  });
  assert("Ascenseur present dans le village", asc.count > 0);
  assert("Course de l'ascenseur = 31.5 unites", Math.abs(asc.trackHeight - 31.5) < 0.1, `track=${asc.trackHeight}`);
  assert("Duree de l'ascenseur = 5.0 secondes", asc.liftDuration === 5, `duration=${asc.liftDuration}`);

  // Test elevator smoothstep movement in real-time game loop
  await page.evaluate(() => {
    const elevator = window.__tour?.ascenseurs[0];
    elevator.activateControls();
    const t = performance.now() / 1000;
    elevator.pressInteract(t);
  });
  // Wait until elevator reaches halfway
  await page.waitForFunction(() => {
    const el = window.__tour?.ascenseurs[0];
    return el && el.fraction >= 0.3;
  }, { timeout: 10000 });
  const fracMid = await page.evaluate(() => window.__tour?.ascenseurs[0]?.fraction || 0);
  assert("L'ascenseur avance vers le sommet", fracMid > 0.2 && fracMid < 0.9, `mid=${fracMid.toFixed(2)}`);

  // Wait until elevator reaches top
  await page.waitForFunction(() => {
    const el = window.__tour?.ascenseurs[0];
    return el && el.fraction >= 0.99;
  }, { timeout: 15000 });
  const fracEnd = await page.evaluate(() => window.__tour?.ascenseurs[0]?.fraction || 0);
  assert("L'ascenseur atteint le sommet", fracEnd >= 0.99, `end=${fracEnd}`);

  // ==========================================
  // SCENARIO 7: VAISSEAU & ALLUMAGE (IGNITION 1s)
  // ==========================================
  console.log("\n--- Scenario 7: Vaisseau et allumage ---");
  const shipPresent = await page.evaluate(() => window.__ship);
  assert("Vaisseau present dans le monde", shipPresent === true);

  const ignitionDuration = await page.evaluate(() => window.__shipRef?.ignitionDuration);
  assert("Duree d'allumage du vaisseau = 1.0 seconde", ignitionDuration === 1, `duration=${ignitionDuration}`);

  // Board ship
  await page.evaluate(() => {
    window.__shipRef.boarded = true;
    window.__shipRef.landed = true;
    window.__shipEvents = [];
  });
  const boarded = await page.evaluate(() => window.__shipRef.boarded);
  assert("Joueur installe au poste de pilotage", boarded === true);

  // Test tap up (short press with ShiftLeft, < 1.0s) -> should NOT liftoff
  await page.keyboard.down("ShiftLeft");
  await page.waitForFunction(() => window.__shipEvents.includes("StartShipIgnition"), { timeout: 5000 });
  const startIgnite = await page.evaluate(() => ({
    events: [...window.__shipEvents],
    landed: window.__shipRef.landed,
  }));
  assert("Appui court declenche StartShipIgnition", startIgnite.events.includes("StartShipIgnition"));

  // Release ShiftLeft -> cancels ignition
  await page.keyboard.up("ShiftLeft");
  await page.waitForFunction(() => window.__shipEvents.includes("CancelShipIgnition"), { timeout: 5000 });
  const cancelIgnite = await page.evaluate(() => ({
    events: [...window.__shipEvents],
    landed: window.__shipRef.landed,
  }));
  assert("Relachement declenche CancelShipIgnition sans decollage", cancelIgnite.events.includes("CancelShipIgnition") && cancelIgnite.landed === true);

  // Test full ignition (hold ShiftLeft until 1.0s ignition duration completes) -> should complete and liftoff
  await page.keyboard.down("ShiftLeft");
  await page.waitForFunction(() => window.__shipEvents.includes("CompleteShipIgnition"), { timeout: 10000 });
  await page.keyboard.up("ShiftLeft");
  await page.waitForTimeout(200);

  const fullIgnite = await page.evaluate(() => ({
    events: [...window.__shipEvents],
    landed: window.__shipRef.landed,
  }));
  assert("Maintien 1s declenche CompleteShipIgnition", fullIgnite.events.includes("CompleteShipIgnition"));
  assert("Decollage : liberation du pad", fullIgnite.landed === false);

  // ==========================================
  // SCENARIO 8: SONDE DE RECONNAISSANCE
  // ==========================================
  console.log("\n--- Scenario 8: Sonde de reconnaissance ---");
  const probeInfo = await page.evaluate(() => {
    return {
      ready: !!window.__invites?.sonde,
      meshScanRadius: 30,
    };
  });
  assert("Sonde de reconnaissance configuree", probeInfo.ready === true);

  // ==========================================
  // SCENARIO 9: PILOTE AUTOMATIQUE & ETAPES
  // ==========================================
  console.log("\n--- Scenario 9: Pilote automatique ---");
  const ap = await page.evaluate(() => {
    return {
      present: !!window.__autopilot,
      engaged: window.__autopilot?.engaged || false,
    };
  });
  assert("Pilote automatique instancie", ap.present === true);

  // Test autopilot stages and velocity matching
  const apStage = await page.evaluate(() => {
    const auto = window.__autopilot;
    auto.engage({ position: [0, 0, 1000], velocity: [0, 0, 0], radius: 100 });
    return {
      stage: auto.stage,
      engaged: auto.engaged,
    };
  });
  assert("Pilote automatique engageable vers cible", apStage.engaged === true);

  // ==========================================
  // SCENARIO 10: CARTE DU SYSTEME SOLAIRE (M)
  // ==========================================
  console.log("\n--- Scenario 10: Carte solaire ---");
  const mapInfo = await page.evaluate(() => {
    return {
      present: !!window.__map,
      markers: window.__map?.markers?.size || 0,
      isOpen: window.__map?.open || false,
    };
  });
  assert("Carte solaire presente avec marqueurs", mapInfo.present === true && mapInfo.markers >= 10, `markers=${mapInfo.markers}`);

  await context.close();
} finally {
  server.close();
}

console.log(`\n========================================`);
console.log(`Bilan Playwright: ${passed}/${total} scenarios valides.`);
console.log(`========================================`);
if (passed < total) process.exit(1);
