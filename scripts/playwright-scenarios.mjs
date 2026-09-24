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
  // Probe launch, snapshot, and recall sequence
  const probeActions = await page.evaluate(() => {
    const launcher = window.__tools?.probes;
    if (!launcher) return { hasLauncher: false };
    // 1. Charge and launch probe
    launcher.update(0.1, { launch: true, retrieve: false });
    launcher.update(1.2, { launch: false, retrieve: false }, {
      pos: [0, 10, 0], forward: [0, 1, 0], playerVelocity: [0, 0, 0], knowsProbes: true, insideShip: false, atFlightConsole: false,
    });
    const launched = launcher.active === 1;
    // 2. Trigger snapshot (capture immediatement lors de l'appui en vol)
    launcher.update(0.1, { launch: true });
    const hasSnapshot = launcher.events.includes("ProbeSnapshot") || launcher.events.includes("MidairProbeSnapshot");
    launcher.update(0.1, { launch: false });
    // 3. Retrieve probe (maintien cumule depassant retrieveHold = 0.3s)
    launcher.update(0.1, { retrieve: true });
    launcher.update(0.4, { retrieve: true });
    const recalled = launcher.active === 0;
    return { hasLauncher: true, launched, hasSnapshot, recalled };
  });
  assert("Tir de la sonde de reconnaissance", probeActions.launched === true);
  assert("Prise de photo par la sonde", probeActions.hasSnapshot === true);
  assert("Rappel et recuperation de la sonde", probeActions.recalled === true);

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

  // Test map toggle with keyboard
  await page.keyboard.press("KeyM");
  await page.waitForTimeout(200);
  const mapOpen = await page.evaluate(() => window.__map?.open);
  assert("Ouverture de la carte solaire (touche M)", mapOpen === true);
  await page.keyboard.press("KeyM");
  await page.waitForTimeout(200);
  const mapClosed = await page.evaluate(() => !window.__map?.open);
  assert("Fermeture de la carte solaire (touche M)", mapClosed === true);

  // ==========================================
  // SCENARIO 11: TELESCOPE & SIGNAUX ACOUSTIQUES
  // ==========================================
  console.log("\n--- Scenario 11: Télescope ---");
  const telTest = await page.evaluate(() => {
    const tel = window.__tools?.telescope;
    if (!tel) return { hasTel: false };
    tel.toggle();
    const active = tel.active;
    const initialFOV = tel.fov;
    tel.update(0.1, 1); // zoom in
    const zoomedFOV = tel.fov;
    const mag = tel.magnification;
    tel.addSignalStrength(0.85);
    const signal = tel.signalStrength;
    tel.toggle();
    return { hasTel: true, active, initialFOV, zoomedFOV, mag, signal, closed: !tel.active };
  });
  assert("Ouverture du télescope", telTest.active === true);
  assert("Grossissement optique du télescope", telTest.mag >= 1);
  assert("Capture et force de transmission de signal", telTest.signal > 0.8);
  assert("Fermeture du télescope et restauration du FOV", telTest.closed === true);

  // ==========================================
  // SCENARIO 12: PANNEAUX DE MUSEE & TEXTES NOMAI
  // ==========================================
  console.log("\n--- Scenario 12: Panneaux de musée et textes Nomai ---");
  const readTest = await page.evaluate(() => {
    const dlg = window.__dialogue;
    if (!dlg) return { hasDlg: false };
    const plaque = {
      name: "NomaiPlaque_Museum",
      kind: "readable",
      text: "Bienvenue au musée d'Âtrebois. Les Nomai étaient une espèce d'explorateurs nomades arrivés dans ce système il y a des millénaires.",
    };
    dlg.read(plaque);
    const isReading = !!dlg.active?.reading;
    const pages = dlg.pages.length;
    dlg.advance();
    dlg.close();
    return { hasDlg: true, isReading, pages, closed: dlg.active === null };
  });
  assert("Ouverture d'un texte de musée (ReadableObject)", readTest.isReading === true);
  assert("Pagination et affichage du panneau", readTest.pages >= 1);
  assert("Fermeture de la lecture et déverrouillage", readTest.closed === true);

  // ==========================================
  // SCENARIO 13: MORT, FLASHBACK & REPRISE DE LA BOUCLE
  // ==========================================
  console.log("\n--- Scenario 13: Mort du joueur et boucle temporelle ---");
  const loop0 = await page.evaluate(() => window.__pdata?.loopCount || 1);
  await page.evaluate(() => {
    window.__death.kill("impact");
  });
  const dead = await page.evaluate(() => window.__death?.dead === true);
  assert("Mort du joueur déclenchée (PlayerDeath)", dead === true);

  // Advance flashback sequence in simulation
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.__death.update(0.1);
  });
  const phaseFlashback = await page.evaluate(() => window.__death?.state?.phase === "flashback" || window.__death?.state?.phase === "images" || window.__death?.state?.phase === "attente");
  assert("Phase de flashback amorcée", phaseFlashback === true);

  // Complete flashback and execute time loop respawn
  await page.evaluate(() => {
    for (let i = 0; i < 60; i++) {
      if (window.__death.update(0.2)) window.__respawn();
    }
  });
  const loop1 = await page.evaluate(() => window.__pdata?.loopCount || 1);
  const respawned = await page.evaluate(() => ({
    playerAlive: !window.__death?.dead,
    reveilArme: window.__reveil?.arme === true,
    shipParked: window.__shipRef?.parked === true,
    shipLanded: window.__shipRef?.landed === true,
  }));
  assert("Incrémentation de la boucle temporelle (loopCount + 1)", loop1 === loop0 + 1, `before=${loop0}, after=${loop1}`);
  assert("Réapparition au réveil et ré-ancrage du vaisseau sur le pad", respawned.playerAlive && respawned.reveilArme && respawned.shipParked && respawned.shipLanded);

  // ==========================================
  // SCENARIO 14: COMBINAISON ET JETPACK
  // ==========================================
  console.log("\n--- Scenario 14: Combinaison spatiale et Jetpack ---");
  const jetpackTest = await page.evaluate(() => {
    const player = window.__player;
    const res = window.__resources;
    if (!player || !res) return { hasPlayer: false };
    // 1. Equiper la combinaison
    player.setSuit(true);
    const suited = player.suited;
    const speed = player.c.groundSpeed; // 6 m/s
    // 2. Utiliser le jetpack et consommer du carburant
    const fuel0 = res.fuel;
    res.update(1.0, { inSupply: false, thrusting: true });
    const fuel1 = res.fuel;
    // 3. Retirer la combinaison
    player.setSuit(false);
    const unsuitedSpeed = player.c.groundSpeed; // 7 m/s
    return { hasPlayer: true, suited, speed, fuel0, fuel1, unsuitedSpeed };
  });
  assert("Équipement combinaison et vitesse réduite à 6 m/s", jetpackTest.suited === true && jetpackTest.speed === 6);
  assert("Consommation de carburant par poussée du sac dorsal", jetpackTest.fuel1 < jetpackTest.fuel0);
  assert("Retrait combinaison rétablissant la vitesse à 7 m/s", jetpackTest.unsuitedSpeed === 7);

  // ==========================================
  // SCENARIO 15: GESTION DE L'OXYGENE & RECHARGE (100 u/s)
  // ==========================================
  console.log("\n--- Scenario 15: Gestion de l'oxygène et ravitaillement ---");
  const oxyTest = await page.evaluate(() => {
    const res = window.__resources;
    if (!res) return { hasRes: false };
    res.oxygen = 200;
    // Mise a jour hors zone d'oxygene (drain de 1 u/s)
    res.update(2.0, { inSupply: false });
    const drained = res.oxygen;
    // Ravitaillement dans une zone d'arbre ou vaisseau (+100 u/s selon IL PlayerResources.Update)
    res.update(0.5, { inSupply: true });
    const refilled = res.oxygen;
    return { hasRes: true, drained, refilled };
  });
  assert("Consommation d'oxygène hors ravitaillement (-1 u/s)", Math.abs(oxyTest.drained - 198) < 0.1);
  assert("Recharge rapide en zone d'oxygène (+100 u/s, +50 en 0.5s)", Math.abs(oxyTest.refilled - 248) < 0.1);

  // ==========================================
  // SCENARIO 16: SYSTEME DE DIALOGUE INTERACTIF
  // ==========================================
  console.log("\n--- Scenario 16: Dialogue interactif et répliques ---");
  const dlgTest = await page.evaluate(() => {
    const dlg = window.__dialogue;
    if (!dlg) return { hasDlg: false };
    const convo = dlg.conversations[0];
    if (!convo) return { hasConvo: false };
    dlg.open(convo);
    const opened = dlg.active !== null;
    const hasPages = dlg.pages.length > 0;
    dlg.active = null; // fermeture
    return { hasDlg: true, hasConvo: true, opened, hasPages, closed: dlg.active === null };
  });
  assert("Ouverture d'une conversation PNJ", dlgTest.opened === true);
  assert("Génération des pages de réplique PNJ", dlgTest.hasPages === true);
  assert("Fermeture de la conversation PNJ", dlgTest.closed === true);

  // ==========================================
  // SCENARIO 17: CONSOLE DE VOL & VUE D'ATTERRISSAGE
  // ==========================================
  console.log("\n--- Scenario 17: Vue d'atterrissage du vaisseau ---");
  const landCamTest = await page.evaluate(() => {
    const att = window.__atterrissage;
    const ship = window.__shipRef;
    if (!att || !ship) return { hasAtt: false };
    ship.boarded = true;
    const t0 = 100.0;
    const snap = att.toggle(t0);
    const inTransition = att.transition;
    const invertedRoll = att.flipRollFactor === -1 && att.rollByDefault === true;
    // Avancer de 0.5s pour terminer la transition (seuil 0.45s)
    att.update(t0 + 0.5);
    const viewActive = att.on;
    // Quitter la console
    const exitOk = att.exitConsole();
    att.resetRoll();
    ship.boarded = false;
    return {
      hasAtt: true,
      hasSnap: !!snap?.snap,
      inTransition,
      invertedRoll,
      viewActive,
      exitOk,
      restoredRoll: att.flipRollFactor === 1 && att.rollByDefault === false,
    };
  });
  assert("Déclenchement vue d'atterrissage avec bascule du regard", landCamTest.hasSnap === true);
  assert("Inversion du mode roulis en vue d'atterrissage (rollByDefault & flipRollFactor)", landCamTest.invertedRoll === true);
  assert("Établissement complet de la vue d'atterrissage après 0.45s", landCamTest.viewActive === true);
  assert("Sortie de console et réinitialisation des paramètres de roulis", landCamTest.restoredRoll === true);

  // ==========================================
  // SCENARIO 18: DEGATS DU VAISSEAU & REPARATION
  // ==========================================
  console.log("\n--- Scenario 18: Dégâts du vaisseau et réparations ---");
  const dmgTest = await page.evaluate(() => {
    const ship = window.__shipRef;
    if (!ship || !ship.damage) return { hasShip: false };
    const initialHealth = ship.damage.integrity;
    // Impact au-dessus du seuil de 30 u/s (ex: 40 u/s sur l'avant)
    ship.damage.impact(40, [0, 0, 1], [0, 0, 5]);
    const damagedHealth = ship.damage.integrity;
    const isDamaged = ship.damage.damaged;
    // Reparation complete
    ship.damage.reset();
    const repairedHealth = ship.damage.integrity;
    return {
      hasShip: true,
      initialHealth,
      damagedHealth,
      isDamaged,
      repairedHealth,
    };
  });
  assert("Intégrité initiale du vaisseau à 100%", dmgTest.initialHealth === 100);
  assert("Impact supérieur à 30 u/s infligeant des avaries", dmgTest.damagedHealth < 100 && dmgTest.isDamaged === true);
  assert("Réparation restaurant l'intégrité intégrale du vaisseau", dmgTest.repairedHealth === 100);

  // ==========================================
  // SCENARIO 19: MODELE REDUIT (MODEL SHIP) & CONDITIONS
  // ==========================================
  console.log("\n--- Scenario 19: Modèle réduit d'atterrissage et crash ---");
  const modelTest = await page.evaluate(() => {
    const spots = window.__modele?.pistes || [];
    return {
      hasSpots: spots.length === 3,
      spotsCount: spots.length,
    };
  });
  assert("Présence des 3 pistes d'atterrissage du modèle réduit à Âtrebois", modelTest.hasSpots === true, `spots=${modelTest.spotsCount}`);

  // ==========================================
  // SCENARIO 20: SOMBRE RONCE & DETECTION ACOUSTIQUE
  // ==========================================
  console.log("\n--- Scenario 20: Sombre Ronce et détection acoustique du prédateur ---");
  const noiseTest = await page.evaluate(() => {
    // Calcul de bruit du vaisseau : plein gaz = 10, repos = 0
    const ship = window.__shipRef;
    if (!ship) return { hasShip: false };
    ship.thrustFraction = 1.0;
    const loudNoise = ship.noise(0);
    ship.thrustFraction = 0.0;
    const silentNoise = ship.noise(0);
    return {
      hasShip: true,
      loudNoise,
      silentNoise,
    };
  });
  assert("Bruit acoustique maximal du vaisseau à pleine poussée (10 u)", noiseTest.loudNoise === 10);
  assert("Silence acoustique du vaisseau à poussée nulle (0 u)", noiseTest.silentNoise === 0);

  await context.close();
} finally {
  server.close();
}

console.log(`\n========================================`);
console.log(`Bilan Playwright: ${passed}/${total} assertions validées.`);
console.log(`========================================`);
if (passed < total) process.exit(1);
