// Prototype Babylon.js : systeme solaire de l'alpha, aux positions reelles.
//
// Ce que ce prototype demontre :
//   - la gravite par champs dominants (modele GravityWell), pas une gravitation
//     a N corps ;
//   - le floating origin ancre sur le corps dominant, sans lequel le monde
//     tremble a 100 000 unites ;
//   - la geometrie reelle du jeu et ses colliders trimesh sous Havok ;
//   - les constantes de deplacement telles qu'extraites du build.
//
// Tout est degradable : sans glTF on retombe sur des spheres, sans Havok sur
// une collision analytique.

import { loadSolarSystem, playerConstants } from "./config.js";
import { buildBodies, syncBodies } from "./bodies.js";
import { Player } from "./player.js";
import { FloatingOrigin } from "./origin.js";
import { GeometryStore, bootFiles, BODY_TO_FILE, EXTRA_VOLUMES, syncGeometry,
         entryForBody, findBodyNode, meshesForBody } from "./geometry.js";
import { buildOrbits, advance, currentPosition, period,
         frameVelocity } from "./orbits.js";
import { loadGameplay } from "./config.js";
import { Resources, oxygenZones, inOxygenZone,
         oxygenDetector } from "./resources.js";
import { loadInterface, ResourceHUD, Prompts, GuiMode,
         AutopilotReadout } from "./hud.js";
import { Minimap } from "./minimap.js";
import { Settings, SettingsUI } from "./settings.js";
import { shipRecords, ShipComputer, Flashlight, Marshmallow,
         heatSources, heatAt, remoteConsoles, RemoteConsoles } from "./consoles.js";
import { fogVolumes, FogField, QuantumFog, fogCloaks, FogCloaks,
         fogLights, FogLightIcons } from "./fog.js";
import { crustCarriers, Crust } from "./crust.js";
import { Interactables } from "./interact.js";
import { Ship, shipSpawn } from "./ship.js";
import { startPose, walkToShip, horizonBasis, EYE_HEIGHT } from "./start.js";
import { loadAudioMap, AudioField, AudioMixer, signalStrength } from "./audio.js";
import { loadParticleMap, ParticleField } from "./particles.js";
import { makeAtmosphere, makeSun, updateMaterials } from "./materials.js";
import { TimeLoop } from "./timeloop.js";
import { SunStage, SupernovaView } from "./supernova.js";
import { PlayerDeathHandler, FlashbackOverlay, deathCamera,
         DEATH_SOUNDS } from "./death.js";
import { MeshLOD, Evictor, lodThresholds, colliderLODs, ColliderLODs } from "./lod.js";
import { loadDialogue, DialogueSystem } from "./dialogue.js";
import { QuantumMoon, quantumHosts, bodyOccluder,
         alignToObserver } from "./quantum.js";
import { BlackHole, DebrisField } from "./blackhole.js";
import { Anglerfish, Thorns, NoiseField, Corruption } from "./bramble.js";
import { Sectors, sectorMap, ambientIntensity } from "./sectors.js";
import { Autopilot } from "./autopilot.js";
import { SolarMap } from "./map.js";
import { applyGameShaders, updateGameShaders } from "./shaders/index.js";
import { SECTORS, PlayerData, selectTree, convoControllers } from "./playerdata.js";
import { Telescope, ProbeLauncher, ProbeCamera } from "./tools.js";
import { DialogueUI } from "./dialogueui.js";
import { initPhysics, buildColliders, disposeColliders,
         createPlayerBody, teleportBody } from "./physics.js";
import { TouchControls, touchAvailable, bindMapGestures } from "./touch.js";
import { GamepadControls, padAvailable } from "./gamepad.js";
import { SpinField, sunElevation } from "./spin.js";
import { directionalFields, polarFields } from "./gravity.js";
import { fluidVolumes, fluidDetectors, FluidField } from "./fluids.js";
import { loadLighting, LightField } from "./lights.js";
import { loadSky, Sky } from "./sky.js";
import { loadTextureAnimators, TextureScrollers } from "./texanim.js";
import { SandLevels, sandColumns, sandFunnels } from "./sand.js";

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

async function boot() {
  const BABYLON = window.BABYLON;
  const data = await loadSolarSystem();
  // charge avant le calcul du point d'apparition, qui s'appuie dessus
  const gameplay = await loadGameplay();
  const resources = new Resources(
    (gameplay.singletons.PlayerResources || {}).fields || {});
  const interactables = new Interactables(gameplay);
  const bodies = data.bodies;
  if (!bodies.length) { setStatus("Aucun corps a afficher."); return; }

  const canvas = document.getElementById("view");
  // audioEngine: true est indispensable — depuis Babylon 8 le moteur audio
  // herite n'est plus cree automatiquement, et BABYLON.Sound ne telecharge
  // alors aucun fichier, sans lever d'erreur.
  const engine = new BABYLON.Engine(canvas, true,
    { stencil: true, audioEngine: true }, true);
  const scene = new BABYLON.Scene(canvas ? engine : engine);
  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.05, 1);

  // Le monde s'etendant sur ~100 000 unites, un depth buffer logarithmique
  // evite le z-fighting entre le proche et le lointain.
  const camera = new BABYLON.FreeCamera("cam", BABYLON.Vector3.Zero(), scene);
  camera.minZ = 0.1;
  camera.maxZ = 200000;
  // Calque des billes de sonde : visible du joueur, pas de la sonde elle-meme.
  camera.layerMask = 0x2FFFFFFF;
  scene.activeCamera = camera;

  // Une lumiere ponctuelle s'attenuerait a 8 500 unites du soleil. Pour une
  // etoile aussi lointaine, une directionnelle reorientee chaque frame donne
  // le bon eclairage sans probleme de portee.
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(0, -1, 0), scene);
  sun.intensity = 1.15;
  // L'ambiance n'est pas une constante : chaque secteur porte sa propre portee
  // d'eclairage ambiant (`_ambientLightRange`), de 750 sur Giant's Deep a 0 sur
  // la comete. On garde la lumiere sous la main pour la suivre.
  const ambient = new BABYLON.HemisphericLight("amb", new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity = 0.1;

  const entries = buildBodies(BABYLON, scene, bodies);
  const origin = new FloatingOrigin(500);

  // Orbites : positions d'origine conservees, l'etat orbital vit dans `orbits`.
  for (const b of bodies) b.position0 = (b.bodyPosition || b.position).slice();
  const orbits = buildOrbits(bodies);
  let anchorBody = null;
  const sub3 = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];

  // Rotation propre : elle s'applique au REPERE, pas a la geometrie (voir
  // spin.js). Le sol du corps ancre ne bouge donc pas — ses colliders restent
  // valides — et c'est le reste du monde, etoile comprise, qui tourne autour.
  // C'est de la que vient le cycle jour/nuit, absent jusqu'ici.
  const spins = new SpinField(bodies);
  window.__spin = spins;

  /** Exprime toutes les positions dans le repere du corps ancre. */
  function reframe(anchor) {
    const ap = currentPosition(orbits, anchor);
    for (const b of bodies) {
      const rel = sub3(currentPosition(orbits, b), ap);
      b.position = b === anchor ? rel : spins.toFrame(anchor, rel);
    }
    return ap;
  }

  // Depart : au point d'apparition du joueur, celui que le build pose.
  //
  // L'ordre compte. On se place D'ABORD dans le repere du corps, sinon la
  // position d'apparition serait calculee en coordonnees monde et le joueur se
  // retrouverait a des milliers d'unites de la planete.
  const home = bodies.find((b) => /home|planet|timber/i.test(b.name)) || bodies[1] || bodies[0];
  anchorBody = home;
  reframe(anchorBody);   // a partir d'ici, home.position vaut (0, 0, 0)

  const star0 = bodies.find((b) => (b.gravity.surfaceAcceleration || 0) >= 50);

  // Le jeu fait apparaitre le joueur au village et le vaisseau sur son aire,
  // 471 u plus loin (docs/38-depart.md). Le portage apparaissait CONTRE le
  // vaisseau, 40 u trop haut et face a une direction quelconque : trois ecarts
  // que `startPose` ferme, en lisant le `SpawnPoint` du joueur, sa hauteur et
  // sa rotation.
  const pose = startPose(gameplay, home);
  const walk = walkToShip(gameplay, home);
  let startPos = null, yaw0 = 0;
  if (pose) {
    startPos = pose.position;
    yaw0 = pose.yaw;
    console.log(`depart : ${pose.name} a ${pose.radius.toFixed(0)} u du centre` +
      (pose.oriented ? `, regard ${(yaw0 * 180 / Math.PI).toFixed(0)} degres` :
                       ", sans orientation extraite") +
      (walk != null ? `, vaisseau a ${walk.toFixed(0)} u` : ""));
  } else {
    // Repli, sans le build : la face eclairee du corps habitable. Ce n'est plus
    // le depart du jeu, mais la page doit rester ouvrable sans lui.
    let up0 = [0, 1, 0];
    if (star0) {
      const d = star0.position;           // deja relatif au corps ancre
      const L = Math.hypot(...d) || 1;
      const s0 = d.map((v) => v / L);
      // 45 degres a cote du point subsolaire : a la verticale exacte l'eclairage
      // est plat et sature, en biais le relief se lit.
      const ref = Math.abs(s0[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let t = [s0[1] * ref[2] - s0[2] * ref[1],
               s0[2] * ref[0] - s0[0] * ref[2],
               s0[0] * ref[1] - s0[1] * ref[0]];
      const tl0 = Math.hypot(...t) || 1;
      t = t.map((v) => v / tl0);
      const k = Math.SQRT1_2;
      up0 = s0.map((v, i) => v * k + t[i] * k);
    }
    console.warn("depart : aucun SpawnPoint de joueur, repli sur la face eclairee");
    // Faute de sol connu, on part de haut et on tombe : c'est ce que faisait le
    // moteur partout avant, et cela ne vaut plus que pour ce repli.
    const hr = (home.gravity.upperSurfaceRadius || 100) + 40;
    startPos = [up0[0] * hr, up0[1] * hr, up0[2] * hr];
  }
  const player = new Player(playerConstants(data, gameplay), startPos);

  // le conteneur amene le contenu du glTF dans le repere du corps ancre :
  // decalage constant, egal a la position INITIALE de ce corps
  origin.offset.x = home.position0[0];
  origin.offset.y = home.position0[1];
  origin.offset.z = home.position0[2];
  origin.anchorName = home.name;
  syncBodies(BABYLON, entries);
  engine.runRenderLoop(() => scene.render());
  addEventListener("resize", () => engine.resize());

  // --- geometrie reelle et physique ---
  const dialogue = new DialogueSystem(await loadDialogue());
  const pdata = new PlayerData();
  window.__pdata = pdata;

  // Nom de secteur (Sector.SectorName) correspondant a un corps.
  const SECTOR_OF = {
    GravityWell_HomePlanet: "TimberHearth", GravityWell_Moon: "TimberHearth",
    GravityWell_BrittleHollow: "BrittleHollow",
    GravityWell_VolcanicMoon: "BrittleHollow",
    GravityWell_GasGiant: "GiantsDeep", GravityWell_Quantum: "QuantumMoon",
    GravityWell_Comet: "Nomad", GravityWell_Sun: "Sun",
    GravityWell_Buried: "HourglassTwins", GravityWell_Revealed: "HourglassTwins",
    GravityWell_DarkBramble: "DarkBramble",
  };

  const audioMap = await loadAudioMap();
  const audio = new AudioField(BABYLON, audioMap);
  if (audioMap.length) await audio.init();

  const particleMap = await loadParticleMap();
  const particles = new ParticleField(BABYLON, scene, particleMap);

  // --- ce que le build portait et que rien ne lisait ---
  //
  // Cinq familles de donnees deja extraites, restees sans lecteur : les
  // lumieres posees, les reglages de rendu, les champs de force directionnels,
  // les volumes de fluide et les zones d'oxygene. Voir docs/34-actions.md.
  const lighting = await loadLighting();
  // Le ciel du build : la voute tourne vers l'etoile, et c'est elle qui
  // fait le jour et la nuit (docs/41-ciel.md).
  const sky = new Sky(await loadSky());
  window.__sky = sky;
  // 44 surfaces defilantes que rien ne lisait (docs/42-lumieres.md).
  const scrollers = new TextureScrollers(await loadTextureAnimators());
  window.__texanim = scrollers;
  // Le sable des jumelles : deux spheres qu'on met a l'echelle et un entonnoir,
  // menes par la minute de boucle. Rien de tout cela n'etait lu
  // (docs/45-recensement-mesure.md).
  const sand = new SandLevels(sandColumns(gameplay), sandFunnels(gameplay));
  window.__sand = sand;
  const placedLights = new LightField(BABYLON, scene, lighting.lights || []);
  // 34 DirectionalForceField contre 10 GravityWell : ce sont les gravites
  // locales, et elles ne s'ajoutent pas au champ radial — elles le remplacent
  // dans leur volume, comme SingleFieldDetector le veut.
  const dirFields = directionalFields(gameplay);
  // `PolarForceField` : un seul volume, d'acceleration -10, radiale a un axe.
  // Il etait extrait et jamais lu (docs/36-audit.md §2.9).
  const polFields = polarFields(gameplay);
  // Giant's Deep a enfin un ocean qui porte, des tornades qui poussent, et une
  // trainee lue sur les detecteurs plutot qu'une constante uniforme.
  const fluids = new FluidField(fluidVolumes(gameplay, data), fluidDetectors(gameplay));
  // Seul le vaisseau rechargeait l'oxygene ; on regarde maintenant ce que la
  // scene propose. Liste vide = l'alpha n'en pose aucune, ce qui est une
  // reponse et non un oubli.
  const oxygen = oxygenZones(gameplay);
  // `OxygenDetector` : une capsule r=0,5 h=2 portee par le joueur. Elle etait
  // extraite et jamais lue, et le test de zone restait ponctuel.
  const oxyDet = oxygenDetector(gameplay);
  const heat = heatSources(gameplay);
  const controllers = convoControllers(gameplay);
  window.__world = { lighting: placedLights, dirFields, polFields, fluids, oxygen,
                     heat, controllers };
  console.log(`monde : ${(lighting.lights || []).length} lumieres, ` +
    `${dirFields.length} champs directionnels, ${polFields.length} champs polaires, ` +
    `${fluids.count} fluides, ` +
    `${oxygen.length} zones d'oxygene, ${heat.length} sources de chaleur`);

  // Geometrie a la demande. Seuls le corps de depart et le soleil sont
  // telecharges avant la premiere image ; les autres arrivent quand on s'en
  // approche (voir sectors.js). Un corps pas encore la montre sa sphere de
  // substitution, exactement comme un corps sans geometrie exportee.
  let shaderCounts = {};
  const store = new GeometryStore(BABYLON, scene, (entry) => {
    // tout ce qui, avant, se faisait une fois pour toutes au demarrage
    const counts = applyGameShaders(BABYLON, scene, entry.meshes);
    for (const [k, v] of Object.entries(counts)) {
      shaderCounts[k] = (shaderCounts[k] || 0) + v;
    }
    syncGeometry([entry], origin);
    if (sky.attach(entry.meshes)) console.log(`ciel : voute rattachee`);
    const nScroll = scrollers.attach(entry.meshes);
    if (nScroll) console.log(`textures defilantes : ${nScroll} rattachees`);
    const nSand = sand.attach(entry.meshes);
    if (nSand) console.log(`sable : ${nSand} colonnes rattachees sur ${sand.total}`);
    window.__shaders = shaderCounts;
    console.log(`geometrie chargee : ${entry.file} (${entry.meshes.length} maillages)`);
  });
  const geo = store.entries;
  await store.load(bootFiles(home.name));

  // Shaders maison : coques atmospheriques et surface stellaire.
  const mats = { atmospheres: [], sun: null };
  for (const e of entries) {
    const a = makeAtmosphere(BABYLON, scene, e.data, e.radius);
    if (a) mats.atmospheres.push({ ...a, entry: e });
  }
  const starEntry = entries.find((e) => e.isStar);
  if (starEntry) mats.sun = makeSun(BABYLON, scene, starEntry.mesh);
  // Mise en scene de la fin des temps : progression, contraction, explosion,
  // onde de choc. La vue ne se monte qu'au moment ou elle sert.
  const sunStage = new SunStage((star0 && star0.gravity.upperSurfaceRadius) || 2000);
  const supernovaView = starEntry
    ? new SupernovaView(BABYLON, scene, starEntry.mesh) : null;
  window.__supernova = { stage: sunStage, view: supernovaView };

  // le soleil garde sa sphere : le shader maison la rend mieux que sa
  // geometrie d'origine, qui ne compte que deux maillages
  if (geo.length) {
    for (const e of entries) {
      if (!e.isStar && entryForBody(geo, e.data.name)) e.mesh.isVisible = false;
    }
  }
  const plugin = geo.length ? await initPhysics(BABYLON, scene) : null;

  let colliders = null, colliderFile = null, playerAgg = null;
  // Les 21 `ChildColliderLOD` : ce qui n'est pas a portee n'a pas de collider.
  // `LODGroup` ne valait pas la regeneration annoncee — il y en a deux, et les
  // cinq `CreateLODGroup` sont vides (docs/36-audit.md §2.8).
  const colLOD = new ColliderLODs(colliderLODs(gameplay));
  let colLODAt = 0;   // date de la derniere reconstruction due au LOD
  Object.defineProperty(window.__world, "colliderLOD", {   // sonde de verification
    get: () => ({ groupes: colLOD.count, eveilles: colLOD.awake.size }),
  });

  function bodyIsAnchorable(b) {
    return !!entryForBody(geo, b.name) || !geo.length;
  }

  /**
   * Colliders du corps ancre uniquement. On restreint au sous-arbre du corps :
   * un fichier de pivot contient aussi ses lunes, qui elles se deplacent sur
   * leur orbite et rendraient leurs colliders faux.
   */
  function rebuildColliders(body, force = false) {
    const entry = entryForBody(geo, body.name);
    const key = entry ? entry.file + "/" + body.bodyName : null;
    // `force` : le corps n'a pas change, mais l'ensemble des groupes de
    // colliders eveilles, si. Sans lui la reconstruction demandee par le
    // niveau de detail sortait ici sans rien faire.
    if (!entry || (!force && key === colliderFile)) return;
    disposeColliders(colliders);
    const t0 = performance.now();
    colliders = buildColliders(BABYLON, scene,
      meshesForBody(entry, body.bodyName, ["Ship_Body"]),
      { asleep: colLOD.asleep() });
    colliderFile = key;
    // sonde de verification : ce qui est solide, et ce que le build laisse
    // traverser (docs/40-solide.md)
    window.__colliders = { poses: colliders.aggregates.length,
                           ignores: colliders.skipped, endormis: colliders.dormants,
                           traversables: colliders.traversables, fichier: key };
    console.log(`colliders : ${colliders.aggregates.length} sur ${key} ` +
      `(${colliders.skipped} ignores, ${colliders.dormants} endormis, ` +
      `${colliders.traversables} traversables) en ` +
      `${(performance.now() - t0).toFixed(0)} ms`);
  }

  if (plugin) {
    rebuildColliders(home);
    // le repere de travail est celui du corps ancre : player.pos s'y exprime
    // deja, aucun decalage a appliquer
    playerAgg = createPlayerBody(BABYLON, scene, player.pos);
    player.usePhysics(BABYLON, scene, playerAgg);
    window.__physics = true;
  }
  // --- vaisseau ---
  let ship = null;
  let shipStart = [0, 0, 0];
  {
    const entry = entryForBody(geo, home.name);
    const node = entry ? findBodyNode(entry, "Ship_Body") : null;
    const spawnWorld = shipSpawn(gameplay, home.position0);
    if (spawnWorld) {
      const local = [spawnWorld[0] - home.position0[0],
                     spawnWorld[1] - home.position0[1],
                     spawnWorld[2] - home.position0[2]];
      shipStart = local.slice();
      ship = new Ship((gameplay.singletons.ShipThrusterModel || {}).fields || {},
                      node, local,
                      (gameplay.singletons.ShipDamageController || {}).fields || {});
      // Le vaisseau porte desormais son orientation : sans la poser une
      // premiere fois, son « haut » serait celui du repere de travail et non
      // la verticale locale, et sa poussee verticale partirait de travers.
      {
        const l = Math.hypot(...local) || 1;
        ship.orientTo([local[0] / l, local[1] / l, local[2] / l], null);
      }
      // Terrain reel : Havok sait ou est le sol, et le vaisseau se posait
      // jusqu'ici sur une sphere de rayon `upperSurfaceRadius` — donc au-dessus
      // des vallees (docs/36-audit.md §1.2). La sonde n'existe que lorsque la
      // physique est la ; sinon la sphere analytique reste le modele.
      if (plugin) {
        ship.probe = (pos, up, reach) => {
          const eng = scene.getPhysicsEngine();
          if (!eng || !eng.raycast) return null;
          const from = new BABYLON.Vector3(pos.x + up[0] * reach,
                                           pos.y + up[1] * reach,
                                           pos.z + up[2] * reach);
          const to = new BABYLON.Vector3(pos.x - up[0] * reach,
                                         pos.y - up[1] * reach,
                                         pos.z - up[2] * reach);
          try {
            const hit = eng.raycast(from, to);
            if (!hit || !hit.hasHit) return null;
            const q = hit.hitPointWorld || hit.hitPoint;
            if (!q) return null;
            const d = (q.x - pos.x) * up[0] + (q.y - pos.y) * up[1] + (q.z - pos.z) * up[2];
            const n = hit.hitNormalWorld || hit.hitNormal;
            return { distance: -d, point: [q.x + up[0] * ship.radius,
                                           q.y + up[1] * ship.radius,
                                           q.z + up[2] * ship.radius],
                     normal: n ? [n.x, n.y, n.z] : null };
          } catch (e) { return null; }
        };
      }
      ship.sync(BABYLON);
      // le vaisseau ne doit jamais s'effacer par niveau de detail : c'est
      // l'objet qu'on cherche des yeux depuis le sol
      if (node && node.getChildMeshes) {
        for (const m of node.getChildMeshes(false)) MeshLOD.pin(m);
      }
    }
  }
  // --- lune quantique ---
  const qHosts = quantumHosts(gameplay);
  const qBody = bodies.find((b) => /quantum/i.test(b.name));
  const quantum = qHosts.length && qBody ? new QuantumMoon(qHosts, bodies) : null;
  // Occlusion : tout corps du systeme sauf la lune elle-meme peut la masquer.
  const qOccluder = bodyOccluder(bodies, qBody);
  window.__quantum = quantum;

  // --- interface de jeu : jauges et invites ---
  const iface = await loadInterface();
  const uiRoot = document.getElementById("ui");
  const resHUD = iface && uiRoot ? new ResourceHUD(uiRoot, iface) : null;
  const prompts = iface && uiRoot ? new Prompts(uiRoot, iface) : null;
  let lastHealth = resources.health;
  window.__ui = { resHUD, prompts, iface };
  window.__resources = resources;   // sonde de verification

  // Modes d'affichage, messages du pilote automatique et minicarte.
  // borne de casteurs d'ombre par lot : une planete entiere serait injouable
  const SHADOW_CASTERS = 120;
  const AUTOPILOT_KEYS = new Set(["alignement", "vol", "approche", "egalisation"]);
  const guiMode = new GuiMode();
  const readout = uiRoot ? new AutopilotReadout(uiRoot) : null;
  const minimap = new Minimap(document.getElementById("minimap"));
  let lastPhase = "repos";
  let endTimesCued = false;
  let deathCued = null;
  // Face nuit du corps ancre : elle n'existe que depuis que les corps tournent.
  let night = false;
  // Reglages : leur sauvegarde est distincte de celle de la partie, comme
  // SettingsSave l'est de PlayerData dans le jeu.
  const settings = new Settings(iface || {});
  const settingsUI = uiRoot
    ? new SettingsUI(uiRoot, settings, "data/interface/",
                     { onPick: () => applySettings() }) : null;
  // --- consoles et objets de bord ---
  const computer = new ShipComputer(shipRecords(gameplay), SECTORS, pdata);
  const flashlight = new Flashlight(BABYLON, scene);
  const marshmallow = new Marshmallow();
  const computerEl = document.getElementById("computer");
  // --- mixage par piste et emetteurs de signal ---
  const mixer = new AudioMixer();
  const transmitters = ((gameplay.placed || {}).AudioTransmitter || []).map((t) => ({
    name: t.name,
    position: t.position,
    hotspot: (t.fields || {})._hotspotRadius ?? 1,
    falloff: (t.fields || {})._falloffRadius ?? 100,
    // Sources audio du meme GameObject : l'emetteur porte les rayons, la source
    // porte le son. C'est par elles que passe la coupure passe-bas.
    sources: audio.indicesNamed(t.name),
  }));
  let mixedEndTimes = false, mixedDeath = false;
  window.__audioMix = { mixer, transmitters };

  window.__consoles = { computer, flashlight, marshmallow };

  window.__gui = { guiMode, readout, minimap, settings, applySettings };

  // Ombres et luminosite : les deux seules options qui touchent au rendu.
  let shadowGen = null;
  function applySettings() {
    const v = settings.values;
    // TonemappingManager : _isTonemappingActive vaut FAUX par defaut, donc
    // « Normal » est l'etat de depart et « Bright » active le tonemapping.
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = v.brightness;
    ip.exposure = v.brightness ? 1.3 : 1.0;
    // QualitySettings.shadowDistance : le jeu ne fait qu'annuler la distance,
    // il ne demonte pas la passe d'ombres. On construit donc le generateur une
    // seule fois, a la premiere activation, puis on l'allume ou on l'eteint.
    scene.shadowsEnabled = v.shadows;
    if (v.shadows && !shadowGen) {
      try {
        shadowGen = new BABYLON.ShadowGenerator(1024, sun);
        shadowGen.usePoissonSampling = true;
        for (const e of geo) {
          for (const m of e.meshes.slice(0, SHADOW_CASTERS)) {
            shadowGen.addShadowCaster(m);
            m.receiveShadows = true;
          }
        }
      } catch (e) {
        console.warn("ombres indisponibles :", e.message);
        settings.values.shadows = false;
      }
    }
  }
  applySettings();

  // Invite du catalogue du jeu, par « Classe.champ ». Les textes ne sont pas
  // reecrits ici : ils viennent tels quels de data/interface/interface.json.
  const P = (key, text) => {
    const p = prompts && prompts.get(key);
    if (!p) return null;
    return { text: text || p.text, priority: p.priority, button: p.button };
  };

  // --- brouillards : volumes spheriques et coque quantique ---
  // Couleur et mode de brouillard viennent des RenderSettings de la scene, plus
  // des constantes recopiees a la main dans fog.js.
  const fog = new FogField(fogVolumes(gameplay), lighting.settings);
  const qFogConf = ((gameplay.placed || {}).QuantumFogBoundary || [])[0] || null;
  const qFog = qFogConf ? new QuantumFog(qFogConf) : null;
  // La coque quantique est un OBJET, pas du brouillard de rendu : c'est ce qui
  // lui permet d'etre franchement opaque puis de s'ouvrir d'un coup. Elle suit
  // la camera, comme la QuantumFogSphere suit le corps du joueur.
  let qShell = null;
  if (qFog) {
    qShell = BABYLON.MeshBuilder.CreateSphere("quantumFog", { diameter: 60, segments: 16 }, scene);
    const m = new BABYLON.StandardMaterial("quantumFogMat", scene);
    m.emissiveColor = new BABYLON.Color3(0.55, 0.58, 0.66);
    m.diffuseColor = new BABYLON.Color3(0, 0, 0);
    m.disableLighting = true;
    m.backFaceCulling = false;   // on la regarde de l'interieur
    m.alpha = 0;
    qShell.material = m;
    qShell.infiniteDistance = false;
    qShell.isPickable = false;
    qShell.renderingGroupId = 1;
    qShell.setEnabled(false);
  }
  // Masquage et lumieres : les deux conséquences de jeu du brouillard de
  // Dark Bramble. Sans elles on voit les anglerfish de loin, et il n'y a rien
  // pour se reperer dedans.
  const cloaks = new FogCloaks(fogCloaks(gameplay), (name, worldPos) => {
    const e = geo.find((x) => x.file === "darkbramble_pivot.gltf");
    if (!e || !e.all) return null;
    const same = e.all.filter((n) => n.name === name);
    if (same.length <= 1) return same;
    // Quatre GameObjects partagent le nom « AnglerFish » : on les départage par
    // la position. Le conteneur remet deja la geometrie dans le repere du jeu
    // et se pose a -origin.offset, donc la position monde d'un noeud vaut sa
    // position absolue plus ce decalage.
    let best = null, bestD = Infinity;
    for (const n of same) {
      n.computeWorldMatrix(true);
      const t = n.getWorldMatrix().getTranslation();
      const d = Math.hypot(t.x + origin.offset.x - worldPos[0],
                           t.y + origin.offset.y - worldPos[1],
                           t.z + origin.offset.z - worldPos[2]);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best ? [best] : same;
  });
  const lights = uiRoot
    ? new FogLightIcons(BABYLON, scene, uiRoot, fogLights(gameplay)) : null;
  window.__fog = { fog, qFog, cloaks, lights };

  // --- trou noir de Brittle Hollow ---
  const bhBody = bodies.find((b) => /brittlehollow/i.test(b.name));
  const whiteVol = ((gameplay.placed || {}).WhiteHoleVolume || [])[0];
  const blackHole = (bhBody && whiteVol)
    ? new BlackHole(bhBody, whiteVol.position,
                    (whiteVol.fields || {})._radius || 50) : null;
  window.__blackhole = blackHole;

  // Champ de debris du trou blanc : ce que le trou noir avale ressort la-bas,
  // un morceau apres l'autre, dans une sphere de 750 unites.
  const debris = whiteVol
    ? new DebrisField((whiteVol.fields || {})._debrisRadius || 750) : null;
  const debrisMeshes = [];
  let debrisBase = null;
  window.__debris = debris;

  function syncDebris(dt, framePos) {
    if (!debris) return;
    const fresh = debris.update(dt);
    if (fresh.length && !debrisBase) {
      debrisBase = BABYLON.MeshBuilder.CreateSphere("debris",
        { diameter: 24, segments: 6 }, scene);
      const m = new BABYLON.StandardMaterial("debrisMat", scene);
      m.diffuseColor = new BABYLON.Color3(0.32, 0.28, 0.30);
      m.specularColor = new BABYLON.Color3(0, 0, 0);
      debrisBase.material = m;
      debrisBase.isPickable = false;
      MeshLOD.pin(debrisBase);
    }
    for (const item of fresh) {
      // Le maillage de base EST le premier morceau, les suivants en sont des
      // instances : un seul appel de rendu pour les 122, et pas de maillage
      // source eteint dont les instances dependraient.
      const inst = debrisMeshes.length
        ? debrisBase.createInstance(`debris_${item.seed}`) : debrisBase;
      inst.isPickable = false;
      debrisMeshes.push({ inst, item });
    }
    if (!debrisMeshes.length) return;
    const base = whiteVol.position;
    for (const { inst, item } of debrisMeshes) {
      inst.position.set(base[0] - framePos[0] + item.position[0],
                        base[1] - framePos[1] + item.position[1],
                        base[2] - framePos[2] + item.position[2]);
    }
  }

  // --- croute de Brittle Hollow : les fragments tombent pour de bon ---
  const crust = bhBody
    ? new Crust(crustCarriers(gameplay),
                bhBody.gravity.surfaceAcceleration || 12,
                bhBody.gravity.upperSurfaceRadius || 200)
    : null;
  window.__crust = crust;

  // --- secteurs : bascule geometrie complete / sphere de substitution ---
  const sectors = geo.length
    ? new Sectors(sectorMap(gameplay), bodies, (b) => entryForBody(geo, b.name),
                  (b) => BODY_TO_FILE[b.name] || null, (f) => store.request(f),
                  EXTRA_VOLUMES, (f) => geo.find((e) => e.file === f) || null)
    : null;
  let sectorState = { actifs: 0, total: 0, secteur: null };
  window.__sectors = sectors;
  window.__geo = store;

  // --- niveau de detail par maillage, et eviction ---
  //
  // Le premier eteint ce qui est trop petit a l'ecran, le second rend la
  // memoire d'un corps qu'on a quitte pour de bon. Sans le second, traverser le
  // systeme finissait par tout charger et le gain du demarrage se reperdait.
  //
  // Les seuils viennent du build quand il en donne : un LODGroup ne simplifie
  // rien a la volee, il designe le moment ou l'on passe d'un maillage a l'autre,
  // et ce moment s'exprime dans l'unite que le module calcule deja. Ce qui n'a
  // pas de seuil lisible garde le seuil general.
  const lodMap = lodThresholds(gameplay);
  const meshLOD = new MeshLOD(undefined, undefined, lodMap);
  const evictor = new Evictor(45, bootFiles(home.name));
  window.__lod = { meshLOD, evictor, seuils: lodMap.size };
  if (lodMap.size) console.log(`niveaux de detail du build : ${lodMap.size} seuils`);

  /** Un lot qu'on ne peut pas liberer sans casser ce qui s'y accroche. */
  function evictionGuard(entry) {
    if (anchorBody && BODY_TO_FILE[anchorBody.name] === entry.file) return true;
    if (colliderFile && colliderFile.startsWith(entry.file + "/")) return true;
    // les fragments de croute deja resolus pointent vers des noeuds de ce lot
    if (crust && crust.resolved && bhBody &&
        BODY_TO_FILE[bhBody.name] === entry.file) return true;
    return false;
  }

  function evictFile(file) {
    return store.evict(file, (entry) => {
      if (evictionGuard(entry)) return true;
      // un casteur d'ombre libere sans etre retire du generateur laisse une
      // reference morte dans la passe d'ombres
      if (shadowGen) {
        for (const m of entry.meshes) {
          try { shadowGen.removeShadowCaster(m); } catch (e) { /* jamais ajoute */ }
        }
      }
      return false;
    });
  }

  // --- Dark Bramble ---
  const fish = ((gameplay.placed || {}).AnglerfishController || [])
    .map((f) => new Anglerfish(f.position));
  const thorns = new Thorns(((gameplay.placed || {}).BrambleManager || []).length || 10);
  // Le bruit n'est plus deduit des commandes du joueur : c'est un champ, nourri
  // par le joueur ET par les sources audio en train de jouer. On peut donc se
  // trahir en laissant tourner un poste, ou s'en servir comme leurre.
  const noise = new NoiseField();
  // Le seuil de decoupe qui gagne la matiere au fil de la boucle.
  const corruption = new Corruption(((gameplay.placed || {}).CorruptionAnimator || []),
    (name) => {
      const e = geo.find((x) => x.file === "darkbramble_pivot.gltf");
      return e && e.all ? e.all.filter((n) => n.name === name) : null;
    });
  // Zones d'epave : elles suspendent la mise a jour du brouillard.
  const derelicts = ((gameplay.placed || {}).DerelictCloaker || []).map((d) => ({
    name: d.name, position: d.position,
    radius: (d.volume && d.volume.radius) || (d.fields || {})._radius || 500,
  }));
  window.__bramble = { fish, thorns, noise, corruption, derelicts };

  // --- boucle temporelle ---
  const loop = new TimeLoop();
  // le compteur persiste doit etre RESTAURE au demarrage : sans cela, la
  // premiere synchronisation ecrasait la valeur sauvegardee par un zero
  loop.loopCount = pdata.loopCount || 0;
  const spawn0 = { x: player.pos.x, y: player.pos.y, z: player.pos.z };

  // Mort et flashback : une seule porte d'entree pour toutes les causes.
  const death = new PlayerDeathHandler();
  const flashOverlay = uiRoot ? new FlashbackOverlay(uiRoot) : null;
  window.__death = death;

  function respawn() {
    loop.restart();
    // Les controleurs de conversation remettent leurs drapeaux a faux au
    // debut d'une boucle (`OnStartOfTimeLoop`) : le Conservateur refait ses
    // observations, le scientifique reparle de son grand jour. Ce que le
    // joueur SAIT, lui, ne s'efface pas.
    dialogue.resetLoop();
    death.revive();
    resources.oxygen = resources.maxOxygen;
    resources.fuel = resources.maxFuel;
    resources.health = resources.maxHealth;
    resources.suit = resources.maxSuit;
    resources.dead = false;
    player.pos.x = spawn0.x; player.pos.y = spawn0.y; player.pos.z = spawn0.z;
    player.vel.x = player.vel.y = player.vel.z = 0;
    // Une boucle qui recommence remet TOUT a l'etat de depart, le regard
    // compris : sinon on rouvre les yeux dans la direction ou l'on est mort.
    yaw = yaw0; pitch = 0;
    if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos, false);
    if (ship) {
      ship.boarded = false;
      ship.vel.x = ship.vel.y = ship.vel.z = 0;
      // le vaisseau repart entier : la boucle remet le monde a son etat de
      // depart, coque comprise
      ship.damage.reset();
      ship.pos.x = shipStart[0]; ship.pos.y = shipStart[1]; ship.pos.z = shipStart[2];
    }
    if (starEntry) starEntry.mesh.scaling.setAll(1);
  }
  window.__loop = loop;
  window.__dialogue = dialogue;

  // Les codes de lancement, au moment ou le build les donne.
  //
  // Deux corrections, et c'est ce qui debloque le decollage :
  //
  //   - LE MOMENT. `CuratorConvoController.OnEndConversation` accorde les
  //     codes ; le portage les accordait a l'OUVERTURE, donc sans avoir
  //     ecoute. Ils passent maintenant par `dialogue.onEnd`.
  //   - QUI. Le portage testait le nom du personnage contre
  //     `/curator|scientist/`, ce qui donnait aussi les codes en parlant au
  //     scientifique — qui ne les donne pas. Seule la CLASSE du controleur
  //     fait foi, et elle est desormais posee sur la conversation par
  //     l'extracteur.
  //
  // Le `LaunchTerminal` du jeu ne fait qu'ecouter l'evenement pour se
  // deverrouiller : la connaissance est bien ce qui ouvre le vaisseau.
  dialogue.onEnd = (convo) => {
    const kind = convo && convo.controller && convo.controller.kind;
    if (kind !== "CuratorConvoController") return;
    if (pdata.learn("knowsLaunchCodes")) console.log("codes de lancement appris");
  };
  window.__respawn = respawn;

  // Portee d'embarquement, mesuree depuis le CENTRE du vaisseau, dont la coque
  // s'etend sur une dizaine d'unites. Le sas n'a pas d'interactif extrait : ce
  // rayon large est un repli assume, pas une valeur du build. Il ne raccourcit
  // plus le depart, qui se fait desormais au village, 471 u plus loin.
  const SHIP_REACH = 40;
  // outils portes par le joueur (dans la scene, ils sont sur la camera)
  const telescope = new Telescope();
  const probes = new ProbeLauncher();
  // La sonde est un appareil photo qu'on jette : sa camera embarquee occupe un
  // coin de l'ecran tant qu'elle vole.
  const probeCam = new ProbeCamera(BABYLON, scene, camera, uiRoot);
  // Les consoles a camera deportee — piloter le vaisseau depuis l'observatoire,
  // regarder par le satellite — reutilisent cette meme vue : c'est le moyen qui
  // leur manquait, et il existe depuis que la sonde a un oeil.
  const consoles = new RemoteConsoles(remoteConsoles(gameplay));
  window.__tools = { telescope, probes, probeCam, consoles };
  // Les options de dialogue sont touchables : au clavier on les choisit au
  // chiffre ou au curseur, au doigt on les vise directement.
  const dlgUI = new DialogueUI(document.getElementById("dialogue"), {
    onChoose: (i) => { optionPressed = i + 1; },
    onNext: () => { interactPressed = true; },
  });

  // Rendu des sondes : une petite sphere emissive par sonde en vol, reutilisee
  // d'une sonde a l'autre plutot que recreee.
  const PROBE_LAYER = 0x20000000;
  const probeMeshes = [];
  const probeMat = new BABYLON.StandardMaterial("probeMat", scene);
  probeMat.emissiveColor = new BABYLON.Color3(0.6, 0.9, 1.0);
  probeMat.disableLighting = true;
  function syncProbes() {
    for (let i = 0; i < probes.probes.length; i++) {
      if (!probeMeshes[i]) {
        const m = BABYLON.MeshBuilder.CreateSphere(`probe${i}`,
          { diameter: 0.6, segments: 6 }, scene);
        m.material = probeMat;
        m.isPickable = false;
        // La sonde ne se filme pas elle-meme : sa bille est sur un calque que
        // la camera embarquee ne regarde pas, sans quoi elle remplirait
        // l'image — elle est a 30 cm de l'objectif.
        m.layerMask = PROBE_LAYER;
        probeMeshes.push(m);
      }
      const p = probes.probes[i].pos;
      probeMeshes[i].position.set(p[0], p[1], p[2]);
      probeMeshes[i].setEnabled(true);
    }
    for (let i = probes.probes.length; i < probeMeshes.length; i++) {
      probeMeshes[i].setEnabled(false);
    }
  }
  const autopilot = ship ? new Autopilot(ship) : null;
  const solarMap = new SolarMap(document.getElementById("map"), bodies,
                                pdata, SECTOR_OF);
  window.__map = solarMap;
  window.__autopilot = autopilot;
  window.__ship = !!ship;
  window.__shipRef = ship;   // sonde de verification
  window.__particles = { field: particles, total: particleMap.length, live: () => particles.count,
                        active: () => particles.particles, failed: () => particles.failed };
  window.__audio = { total: audioMap.length, live: () => audio.count,
                     playing: () => audio.playing, failed: () => audio.failed };
  // point d'entree de verification : oriente la camera sans passer par le
  // verrouillage de souris, pour les captures automatisees
  window.__look = (y, p) => { yaw = y; pitch = p; };
  window.__ready = true;
  window.__bodies = bodies;   // sonde de verification
  window.__player = player;   // sonde de verification : marche, saut, sac dorsal
  // Sonde de verification du depart : le pose lu dans le build, la marche
  // jusqu'au vaisseau, et l'ecart des yeux au joueur — qui ne se mesure qu'une
  // fois la camera placee, donc dans le navigateur (docs/38-depart.md).
  window.__start = { pose, walk, eye: () => ({
    x: camera.position.x - player.pos.x,
    y: camera.position.y - player.pos.y,
    z: camera.position.z - player.pos.z }) };

  // --- entrees ---
  // Le lacet part de l'orientation du point d'apparition : c'est elle qui
  // decide de la premiere image du jeu.
  let yaw = yaw0, pitch = 0;
  const keys = Object.create(null);
  addEventListener("keydown", (e) => { keys[e.code] = true; });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  let interactPressed = false, optionPressed = 0, probeFired = false;

  /**
   * Une commande, designee par son code clavier.
   *
   * Les boutons tactiles passent par ici avec le meme code que la touche
   * correspondante : il n'y a donc qu'un seul jeu de commandes, et rien en
   * aval ne sait d'ou vient l'ordre.
   */
  function command(code) {
    if (code === "KeyE") interactPressed = true;
    const m = /^Digit([1-9])$/.exec(code);
    if (m) optionPressed = parseInt(m[1], 10);
    if (code === "KeyM") solarMap.toggle();
    if (code === "KeyC" && solarMap.open) solarMap.recenter();
    // La lampe : le jeu la met sur la croix directionnelle, ici sur L.
    if (code === "KeyL") flashlight.toggle();
    // L'ordinateur de bord ne se consulte qu'a l'interieur du vaisseau ; ce
    // portage n'a pas d'interieur, on l'ouvre donc depuis le poste de pilotage.
    if (code === "KeyN" && ship && ship.boarded) {
      computer.open = !computer.open;
    }
    if (computer.open) {
      if (code === "ArrowLeft") computer.move(-1);
      if (code === "ArrowRight") computer.move(1);
      if (code === "Enter" || code === "Space") computer.select();
      if (code === "Backspace" || code === "Escape") computer.cancel();
    }
    if (code === "KeyT") telescope.toggle();
    if (code === "KeyF") probeFired = true;
    // Consoles a camera deportee : on les prend en main a portee de la main,
    // et on les lache de la meme touche.
    if (code === "KeyR" && consoles.count) {
      const c = consoles.toggle([player.pos.x + framePos[0],
                                 player.pos.y + framePos[1],
                                 player.pos.z + framePos[2]]);
      console.log(c ? `console prise : ${c.name}` : "console lachee");
    }
    // La guimauve se mange quand elle est assez grillee (0,6).
    if (code === "KeyB" && marshmallow.eat()) {
      console.log(`guimauve mangee (${marshmallow.eaten})`);
    }
    // GUIMode fait tourner ses quatre modes sur une touche de debogage
    if (code === "KeyG") console.log("mode d'affichage :", guiMode.cycle());
    // Le menu des reglages, comme dans le jeu, met le temps en pause
    if (code === "Escape" && settingsUI) {
      settings.open = !settings.open;
      settingsUI.render();
    }
    if (settings.open && settingsUI) {
      if (code === "ArrowUp") settings.move(-1);
      if (code === "ArrowDown") settings.move(1);
      if (code === "ArrowLeft") settings.toggle(-1);
      if (code === "ArrowRight") settings.toggle(1);
      if (code === "Enter" || code === "Space") settings.toggle(0);
      applySettings();
      settingsUI.render();
    }
    if (dialogue.active) {
      const n = (dialogue.view && dialogue.view.options.length) || 0;
      if (code === "ArrowUp") dlgUI.moveCursor(-1, n);
      if (code === "ArrowDown") dlgUI.moveCursor(1, n);
      if (code === "Enter" && n) optionPressed = dlgUI.cursor + 1;
    }
  }
  addEventListener("keydown", (e) => command(e.code));

  /**
   * Deplacement du regard, en pixels.
   *
   * `Axis` : brut x facteur d'inversion x sensibilite / 5. La sensibilite 5
   * laisse donc la valeur d'origine inchangee. Le gain sert au doigt, qui
   * parcourt moins de pixels qu'une souris.
   *
   * Le facteur maison de 0,0022 par pixel est remplace par `_turnRate` (160
   * degres par seconde) rapporte a la LARGEUR DE L'ECRAN : parcourir l'ecran
   * entier tourne donc de `_turnRate` degres, et la sensibilite ne depend plus
   * de la definition. `_telescopeTurnScalar` (0,5) ralentit de moitie a la
   * lunette — le portage n'avait pas ce ralenti (docs/36-audit.md §1.1).
   */
  const TURN = (player.c.turnRate ?? 160) * Math.PI / 180;
  function look(dx, dy, gain = 1) {
    const f = settings.lookFactor();
    const w = Math.max(320, (window.innerWidth || 1280));
    const k = (TURN / w) * (telescope && telescope.active
      ? (player.c.telescopeTurnScalar ?? 0.5) : (player.c.suitTurnScalar ?? 1));
    yaw += dx * k * gain * Math.abs(f);
    pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * k * gain * f));
  }

  // --- commandes tactiles ---
  //
  // Elles ne s'installent que sur un ecran tactile, et ne remplacent rien :
  // le clavier continue de repondre, ce qui laisse les deux utilisables sur
  // une machine qui a les deux.
  const touch = new TouchControls(
    document.getElementById("touch"), document.getElementById("touchui"),
    { onKey: command, onLook: (dx, dy) => look(dx, dy, 1) });
  if (touchAvailable()) touch.enable();

  // --- manette ---
  //
  // Meme principe que le tactile, et pour la meme raison : elle ne cree aucune
  // commande, elle produit les memes axes et les memes codes. Le build decrit
  // une manette entiere (`XboxInput`) et les invites portent deja le bouton
  // attendu, avec son icone — c'etait la derniere entree decrite et jamais lue.
  const pad = new GamepadControls({ onKey: command,
                                    onLook: (dx, dy) => look(dx, dy, 1) });
  window.__pad = pad;
  addEventListener("gamepadconnected", (e) => {
    console.log("manette branchee :", e.gamepad && e.gamepad.id);
  });
  if (padAvailable()) console.log("manette detectee au demarrage");
  // En paysage de telephone, le coin bas-droit revient aux boutons d'action :
  // la vue de sonde passe a gauche, sous les jauges.
  if (touch.enabled) probeCam.setViewport(0.02, 0.42, 0.26, 0.3);
  window.__touch = touch;   // sonde de verification
  // La carte capte glisser, pincer, taper et la molette quand elle est
  // ouverte. Les trois premiers sont des evenements de POINTEUR : le meme code
  // sert la souris et le doigt (voir web/src/touch.js).
  bindMapGestures(solarMap.canvas, solarMap,
                  (b) => { if (autopilot) autopilot.engage(b); });
  solarMap.canvas.addEventListener("wheel", (e) => {
    e.preventDefault(); solarMap.setZoom(solarMap.zoom * (e.deltaY > 0 ? 1.15 : 0.87));
  }, { passive: false });

  canvas.addEventListener("click", () => {
    // Le verrouillage de souris n'a pas de sens au doigt, et le demander
    // ferait echouer la promesse a chaque tape.
    if (!touch.enabled) canvas.requestPointerLock();
  });
  // le navigateur bloque l'audio tant qu'aucun geste utilisateur n'a eu lieu ;
  // au doigt, ce geste n'atteint jamais le canvas, qui est sous la couche
  // tactile — on l'ecoute donc au niveau de la fenetre
  addEventListener("pointerdown", () => { if (!audio.unlocked) audio.unlock(); });
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    look(e.movementX, e.movementY);
  });

  // --- boucle ---
  //
  // Position monde de l'origine du repere courant, tenue a jour a chaque image :
  // les commandes en ont besoin hors de la boucle (les consoles, par exemple,
  // sont posees en coordonnees monde).
  let framePos = [0, 0, 0];
  scene.registerBeforeRender(() => {
    // SettingsMenu.Open met Time.timeScale a 0 : le menu fige la partie
    const dt = (settings && settings.open) ? 0
      : Math.min(engine.getDeltaTime() / 1000, 0.05);
    const now = performance.now() / 1000;

    // repere camera aligne sur la verticale locale du champ dominant
    const f = player.field;
    // `_affectsAlignment` : un champ directionnel sur 34 pousse SANS retourner
    // ce qu'il tient. `alignDir` porte donc la verticale a suivre, qui n'est
    // pas toujours la direction de la force (docs/36-audit.md §2.9).
    const ad = f ? (f.alignDir || f.dir) : null;
    const up = ad ? new BABYLON.Vector3(-ad.x, -ad.y, -ad.z)
                  : new BABYLON.Vector3(0, 1, 0);
    // Le repere d'horizon vit dans start.js : le lacet lu sur le SpawnPoint et
    // le lacet de la camera doivent se mesurer dans le MEME repere, sinon
    // l'orientation du build arrive juste et la tete est tournee de travers.
    const hb = horizonBasis([up.x, up.y, up.z]);
    const east = new BABYLON.Vector3(hb.east[0], hb.east[1], hb.east[2]);
    const north = new BABYLON.Vector3(hb.north[0], hb.north[1], hb.north[2]);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = north.scale(cy * cp).add(east.scale(sy * cp)).add(up.scale(-sp));
    const right = north.scale(-sy).add(east.scale(cy));

    // Un mort ne pilote plus : PlayerDeathHandler coupe les commandes le temps
    // de la sequence. Sans cela on continuait a marcher pendant son propre
    // flashback.
    //
    // Hors sequence, clavier et doigt s'additionnent : le manche virtuel est
    // analogique, la touche vaut 1, et la somme est bornee comme un axe l'est.
    //
    // La manette se LIT : contrairement au clavier et au doigt, la Gamepad API
    // ne pousse aucun evenement. Elle s'ajoute aux deux autres, bornee de la
    // meme facon — les trois peuvent servir sur la meme machine.
    const ax = touch.axes;
    const gp = pad.poll(dt);
    const axis = (v) => Math.max(-1, Math.min(1, v));
    //
    // L'accelerateur (« boost ») du portage — x3 au joueur, x2 au vaisseau —
    // n'a AUCUNE source dans le build : il est supprime. La touche reste lue,
    // mais elle ne multiplie plus rien ; elle sert au bruit qu'on fait, ce qui
    // est un choix assume de ce portage. En echange, le roulis apparait : la
    // manette et le clavier le prevoyaient, le vaisseau n'avait pas d'axe.
    const input = death.dead
      ? { forward: 0, right: 0, up: false, roll: 0, loud: false } : {
        forward: axis((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + ax.forward + gp.forward),
        right: axis((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + ax.right + gp.right),
        up: keys.Space || ax.up || gp.up,
        // Q et Z : E sert deja a interagir, et le roulis a besoin d'une paire
        // libre. La manette prend le cinquieme axe quand elle en a un.
        roll: axis((keys.KeyZ ? 1 : 0) - (keys.KeyQ ? 1 : 0) + (gp.roll || 0)),
        loud: keys.ShiftLeft || keys.ShiftRight || ax.boost || gp.boost,
      };
    // 1. avance des orbites et des rotations propres, puis re-expression dans
    //    le repere du corps ancre — qui tourne desormais avec lui
    advance(orbits, dt);
    spins.advance(dt);
    const anchorPos = reframe(anchorBody);
    framePos = anchorPos;

    // vitesse de chute AVANT le pas : apres, le contact l'a deja annulee et
    // l'impact serait toujours nul
    const wasGrounded = player.grounded;
    const fallSpeed = -(player.vel.x * up.x + player.vel.y * up.y + player.vel.z * up.z);

    // Le monde tel que la physique le voit : les champs directionnels, qui
    // priment sur le champ radial dans leur volume, et les fluides, qui
    // freinent ce qui les traverse.
    const world = { directional: dirFields, polar: polFields,
                    framePos: anchorPos, fluids,
                    // Coriolis et centrifuge du repere ancre, qui TOURNE avec
                    // son corps : sans eux le sol ne defile pas sous un
                    // stationnaire (docs/36-audit.md §1.2).
                    inertial: (p, v) => spins.inertial(anchorBody, p, v) };
    fluids.begin();
    player.update(dt, bodies, input, { fwd, right, up }, origin, world);
    if (player.fluid) fluids.current = player.fluid.volume;

    // 2. changement de corps dominant : on change de repere. La position du
    //    joueur, exprimee dans l'ancien repere, doit etre reportee dans le
    //    nouveau avant tout le reste.
    const fb = player.field && player.field.body;
    if (fb && fb !== anchorBody && bodyIsAnchorable(fb)) {
      const newPos = currentPosition(orbits, fb);
      const shift = sub3(anchorPos, newPos);
      // Les VITESSES aussi changent de repere, et c'est ce qui manquait.
      //
      // La boucle recalait les positions et laissait les vitesses telles
      // quelles : on arrivait donc TOUJOURS a l'arret relatif de sa cible.
      // Entre Timber Hearth et sa lune les deux referentiels different
      // d'environ sqrt(mu) = sqrt(12 x 250) ~ 55 u/s, et annuler cet ecart est
      // justement la quatrieme phase de l'Autopilot — dans le jeu, la
      // difficulte centrale du vol (docs/36-audit.md §2.4).
      const dv = sub3(frameVelocity(orbits, anchorBody), frameVelocity(orbits, fb));
      player.pos.x += shift[0]; player.pos.y += shift[1]; player.pos.z += shift[2];
      player.vel.x += dv[0]; player.vel.y += dv[1]; player.vel.z += dv[2];
      // Tout ce qui vit dans le repere courant doit suivre, pas seulement le
      // joueur. Le vaisseau restait en arriere au changement de corps dominant :
      // on volait vers une planete et il se retrouvait a des milliers d'unites,
      // le temps que le pilote automatique le ramene. Les sondes en vol ont le
      // meme probleme, en plus court.
      if (ship) {
        ship.pos.x += shift[0]; ship.pos.y += shift[1]; ship.pos.z += shift[2];
        ship.vel.x += dv[0]; ship.vel.y += dv[1]; ship.vel.z += dv[2];
      }
      for (const p of probes.probes) {
        p.pos[0] += shift[0]; p.pos[1] += shift[1]; p.pos[2] += shift[2];
        if (p.vel) { p.vel[0] += dv[0]; p.vel[1] += dv[1]; p.vel[2] += dv[2]; }
      }
      console.log(`repere : ${anchorBody.name} -> ${fb.name}, ` +
        `ecart de vitesse ${Math.hypot(...dv).toFixed(1)} u/s`);
      anchorBody = fb;
      reframe(anchorBody);
      origin.offset.x = fb.position0[0];
      origin.offset.y = fb.position0[1];
      origin.offset.z = fb.position0[2];
      origin.anchorName = fb.name;
      if (geo.length) syncGeometry(geo, origin);
      if (plugin) {
        rebuildColliders(fb);
        if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos);
      }
    }

    // 2 bis. groupes de colliders : ce qui n'est plus a portee s'endort, et ce
    //    qui revient se reveille. Reconstruire coute pres d'une seconde, on ne
    //    le fait donc qu'au changement REEL de l'ensemble, et au plus une fois
    //    toutes les deux secondes.
    if (plugin && colLOD.count) {
      const w = (v) => [v.x + anchorPos[0], v.y + anchorPos[1], v.z + anchorPos[2]];
      colLOD.update({
        player: w(player.pos),
        ship: ship ? w(ship.pos) : null,
        probe: probes.probes.length ? [probes.probes[0].pos[0] + anchorPos[0],
                                       probes.probes[0].pos[1] + anchorPos[1],
                                       probes.probes[0].pos[2] + anchorPos[2]] : null,
      });
      if (colLOD.changed && now - colLODAt > 2) {
        colLODAt = now;
        rebuildColliders(anchorBody, true);
        if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos);
      }
    }

    // 3. les corps non ancres suivent leur orbite ; le corps ancre ne bouge
    //    pas dans son propre repere, ce qui garde ses colliders valides
    syncBodies(BABYLON, entries);
    if (geo.length) {
      for (const b of bodies) {
        if (b === anchorBody || !b.bodyName) continue;
        const e = entryForBody(geo, b.name);
        const node = e && findBodyNode(e, b.bodyName);
        if (node) node.setAbsolutePosition(
          new BABYLON.Vector3(b.position[0], b.position[1], b.position[2]));
      }
    }

    // Les yeux sont au-dessus du joueur, et « au-dessus » est la verticale
    // LOCALE : le decalage etait applique sur Y du repere de travail, ce qui
    // ne vaut qu'au pole nord du corps ancre. Ailleurs il portait la camera
    // de cote, et sous l'equateur sud, sous les pieds du joueur.
    camera.position.set(player.pos.x + up.x * EYE_HEIGHT,
                        player.pos.y + up.y * EYE_HEIGHT,
                        player.pos.z + up.z * EYE_HEIGHT);
    camera.upVector = up;
    camera.setTarget(camera.position.add(fwd));

    // le soleil eclaire depuis sa position monde, geometrie visible ou non
    const star = entries.find((e) => e.isStar);
    if (star) {
      const p = star.data.position;
      const d = camera.position.subtract(new BABYLON.Vector3(p[0], p[1], p[2]));
      if (d.lengthSquared() > 0) sun.direction = d.normalize();
    }

    // --- vaisseau, ressources, interaction ---
    let focus = null;
    if (ship) {
      if (autopilot && autopilot.engaged) autopilot.update(dt);
      ship.update(dt, bodies, input, { fwd, right, up }, world);
      ship.sync(BABYLON);
      if (ship.boarded) {
        // Le joueur voyage avec le vaisseau, et desormais dans SON repere : le
        // poste de pilotage est trois unites au-dessus du plancher, donc le
        // long de l'axe propre du vaisseau et non d'un « haut » de camera.
        const a = ship.axes;
        player.pos.x = ship.pos.x + a.up[0] * 3;
        player.pos.y = ship.pos.y + a.up[1] * 3;
        player.pos.z = ship.pos.z + a.up[2] * 3;
        player.vel.x = ship.vel.x; player.vel.y = ship.vel.y; player.vel.z = ship.vel.z;
        if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos, false);
      }
      if (interactPressed && !dialogue.active) {
        if (ship.boarded) {
          ship.boarded = false;
          const a = ship.axes;
          player.pos.x += a.up[0] * 4; player.pos.y += a.up[1] * 4;
          player.pos.z += a.up[2] * 4;
        } else if (ship.distanceTo(player.pos) < SHIP_REACH &&
                   pdata.knowsLaunchCodes) {
          ship.boarded = true;
        }
      }
    }
    // --- dialogue ---
    const convo = (!ship || !ship.boarded)
      ? dialogue.nearest(player.pos, anchorPos) : null;
    if (interactPressed) {
      if (dialogue.active) dialogue.advance();
      else if (convo) {
        // L'arbre se choisit a l'ouverture, comme le fait
        // `OnStartConversation` — et il depend de l'etat de la BOUCLE autant
        // que des connaissances, d'ou `dialogue.stateOf`.
        dialogue.open({ ...convo,
                        tree: selectTree(pdata, convo, dialogue.trees, controllers,
                                         dialogue.stateOf(convo)) });
      }
    }
    if (dialogue.active && optionPressed > 0) dialogue.choose(optionPressed - 1);
    optionPressed = 0;

    if (!ship || !ship.boarded) {
      focus = interactables.focus(player.pos, anchorPos, fwd);
    }
    // L'oxygene ne se recharge plus seulement dans le vaisseau : les zones que
    // la scene pose comptent aussi. Sans aucune zone, on retrouve exactement le
    // comportement d'avant.
    const playerW = [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                     player.pos.z + anchorPos[2]];
    const zone = oxygen.length
      ? inOxygenZone(oxygen, playerW, oxyDet ? oxyDet.reach : 0) : null;
    // Le carburant etait consomme EN MARCHANT : `thrusting` valait vrai des
    // qu'une touche de deplacement etait tenue. Seul le sac dorsal brule
    // (docs/36-audit.md §1.1) — et il ne brule pas quand on pilote.
    resources.update(dt, {
      inSupply: !!(ship && ship.boarded) || !!zone,
      thrusting: !!player.jetpack && !(ship && ship.boarded),
    });
    interactPressed = false;

    if (resHUD) {
      // la vignette rouge s'allume sur toute perte de sante, quelle qu'en soit
      // la cause : impact, asphyxie, onde de choc
      if (resources.health < lastHealth - 0.01) resHUD.damage(now);
      lastHealth = resources.health;
      resHUD.setExposed(resources.oxygen <= 0 && !resources.dead);
      resHUD.update({
        oxygen: resources.oxygen / resources.maxOxygen,
        fuel: resources.fuel / resources.maxFuel,
        health: resources.health / resources.maxHealth,
      }, now);
    }
    // --- messages du pilote automatique ---
    if (readout && autopilot) {
      if (autopilot.phase !== lastPhase) {
        if (autopilot.phase === "repos" && lastPhase !== "repos") {
          // le jeu distingue l'abandon de l'arrivee ; ici la cible atteinte
          // remet la phase au repos, l'abandon aussi
          readout.show(!autopilot.arrived ? "abandon"
            : (autopilot.arrivalError > 50 ? "arriveCourt" : "arrive"), now);
        } else if (AUTOPILOT_KEYS.has(autopilot.phase)) {
          readout.show(autopilot.phase, now);
        }
        lastPhase = autopilot.phase;
      }
      readout.update(now, !guiMode.hidden && !guiMode.capture);
    }

    // --- minicarte : hors du vaisseau, dans un secteur qui la porte ---
    if (minimap) {
      // Minimap.AttemptActivation : hors du vaisseau, et seulement si le
      // secteur majeur actif declare l'utiliser. Les sept secteurs du build ont
      // tous _useMinimap a vrai, mais c'est bien le drapeau qui decide.
      const body = player.field && player.field.body;
      const sec = sectorState.secteur;
      const near = body && player.field.distance <
        (body.gravity.upperSurfaceRadius || 200) * 2;
      minimap.setEnabled(!!near && !!(sec ? sec.useMinimap : true) &&
                         !(ship && ship.boarded) && !guiMode.hidden);
      if (minimap.on) {
        minimap.update(body.position, player.pos, {
          ship: ship && !ship.boarded ? [ship.pos.x, ship.pos.y, ship.pos.z] : null,
          probe: probes.probes.length ? probes.probes[probes.probes.length - 1].pos : null,
        });
      }
    }

    if (prompts) {
      // Au centre : l'objet vise. InteractVolume construit son invite avec le
      // texte de la scene, d'ou le passage explicite.
      //
      // Une console a camera deportee se prend en main de la meme facon qu'un
      // interactif : elle emprunte donc la meme invite, avec son nom.
      const nearConsole = (!focus && !consoles.active && consoles.count)
        ? consoles.nearest(playerW) : null;
      const centre = focus ? P("InteractVolume._screenPrompt",
                               focus.prompt || focus.name)
        : nearConsole ? P("InteractVolume._screenPrompt", `${nearConsole.name} (R)`)
        : null;
      prompts.set("center", (centre && !guiMode.hidden) ? [centre] : [], now);

      // A gauche : ce que la situation permet. Les priorites du jeu font le
      // tri — celles de la carte valent 2, celles du telescope 1, le reste 0 —
      // et seule la plus haute reste affichee.
      const left = [];
      if (solarMap && solarMap.open) {
        left.push(P("MapController._closePrompt"), P("MapController._zoomPrompt"),
                  P("MapController._panPrompt"));
      } else if (telescope.active) {
        left.push(P("TelescopeGUI._exitTelescopePrompt"), P("TelescopeGUI._zoomPrompt"));
      } else if (ship && ship.boarded) {
        left.push(P("ShipPromptController._exitPrompt"),
                  P("ShipPromptController._ignitionPrompt"),
                  P("ShipPromptController._mapPrompt"),
                  P("ShipPromptController._autopilotPrompt"));
      } else {
        left.push(P("JetpackPromptController._upThrustPrompt"),
                  P("JetpackPromptController._horizontalThrustPrompt"));
        left.push(P("ProbePromptController._launchPrompt"));
      }
      // GUIMode : le mode capture n'affiche ni le bas ni la gauche, le mode
      // masque n'affiche rien
      prompts.set("left", guiMode.full || guiMode.debug ? left.filter(Boolean) : [], now);

      // En bas : les codes de lancement, dont le texte change d'une boucle a
      // l'autre — « Aquired » la premiere fois (la faute est celle du jeu),
      // « Remembered » ensuite.
      const codes = prompts.get("LaunchCodePromptController._codePrompt");
      prompts.set("bottom",
        (pdata.knowsLaunchCodes && codes)
          ? [{ text: codes.texts[loop.loopCount > 0 ? 1 : 0], priority: 0 }]
          : [], now);
    }

    const hud2 = document.getElementById("hud2");
    if (hud2) {
      const bits = [`boucle ${loop.loopCount} — ${loop.label}` +
                    (death.dead ? ` — mort : ${death.label} (${death.state.phase})` : ""),
                    resources.summary()];
      if (particleMap.length) bits.push(
        `particules ${particles.count} (${particles.particles})`);
      if (audioMap.length) bits.push(
        `audio ${audio.playing}/${audio.count}` + (audio.unlocked ? "" : " (clic pour activer)"));
      if (ship && (ship.integrity < 100 || ship.destroyed)) bits.push(
        ship.damage.summary +
        (ship.lastImpact ? ` (impact ${ship.lastImpact} u/s)` : ""));
      if (autopilot && autopilot.engaged) bits.push(`pilote auto : ${autopilot.phase}`);
      if (ship) bits.push(ship.boarded
        ? `vaisseau : ${ship.speed.toFixed(0)} u/s — E pour sortir`
        : (ship.distanceTo(player.pos) < SHIP_REACH ? "E pour embarquer"
           : `vaisseau a ${ship.distanceTo(player.pos).toFixed(0)} u`));
      bits.push(`memoire ${dialogue.known}/${dialogue.total} · ${pdata.summary}`);
      if (ship && !ship.boarded && !pdata.knowsLaunchCodes &&
          ship.distanceTo(player.pos) < SHIP_REACH) {
        bits.push("vaisseau verrouillé — parler au conservateur");
      }
      if (telescope.active) bits.push(`télescope ×${telescope.magnification.toFixed(0)}`);
      if (probes.active) bits.push(`${probes.active} sonde(s)`);
      if (sectors) bits.push(
        `secteurs ${sectorState.actifs}/${sectorState.total}` +
        (sectorState.secteur ? ` — ${sectorState.secteur.name}` : "") +
        (ship && ship.thrustLimit != null ? ` (poussee ≤ ${ship.thrustLimit})` : ""));
      if (meshLOD.hidden > 0) bits.push(`LOD ${meshLOD.hidden} maillages eteints` +
        (meshLOD.fromBuild ? ` (${meshLOD.fromBuild} sur seuil du build)` : ""));
      if (evictor.evicted > 0) bits.push(`${evictor.evicted} corps libere(s)`);
      // Ce que le build portait et que rien ne lisait, rendu visible : sans
      // cela, on ne saurait pas dire si l'absence vient du portage ou de l'alpha.
      if (spins.count) bits.push(night ? "nuit" : "jour");
      if (placedLights.total) bits.push(
        `lumieres ${placedLights.count}/${placedLights.total}`);
      if (player.field && player.field.directional) bits.push(
        `champ dirige : ${player.field.directional.name}`);
      if (player.fluid) bits.push(
        `dans ${player.fluid.volume.name} (${player.fluid.depth.toFixed(0)} u)`);
      if (zone) bits.push(`oxygene : ${zone.name}`);
      if (consoles.active) bits.push(`console : ${consoles.active.name} — R pour lacher`);
      if (marshmallow.toast > 0) bits.push(
        `guimauve ${(marshmallow.toast * 100).toFixed(0)} %` +
        (marshmallow.edible ? " — B pour manger" : ""));
      if (pad.connected) bits.push("manette");
      // la geometrie arrive en cours de partie : le dire plutot que de laisser
      // croire a une sphere de substitution definitive
      if (store.busy) bits.push(`chargement ${store.entries.length + store.busy} corps…`);
      const chasing = fish.filter((f) => f.state !== "repos").length;
      if (chasing) bits.push(`anglerfish : ${chasing} en alerte`);
      if (blackHole && blackHole.transits) bits.push(`trou noir : ${blackHole.transits} transit(s)`);
      if (debris && (debris.grown || debris.pending)) bits.push(
        `debris : ${debris.grown} ressorti(s), ${debris.pending} en file`);
      if (quantum) bits.push(
        `lune quantique : ${quantum.hostName}` +
        (quantum.observed ? " (observee)" : ` (${quantum.collapses} sauts)`));
      if (convo && !dialogue.active) bits.push(`E pour parler a ${convo.character || convo.name}`);
      if (focus) bits.push(focus.kind === "readable"
        ? `${focus.name} — texte disponible` : (focus.prompt || focus.name));
      hud2.textContent = bits.join("   ·   ");
      solarMap.draw(player.pos, ship ? ship.pos : null);
    }
    {
      const v = dialogue.view;
      const sign = !!(dialogue.active && dialogue.active.convo &&
                      dialogue.active.convo.isMuseumSign);
      dlgUI.render(v, sign);
    }

    // --- secteurs ---
    if (sectors) {
      sectorState = sectors.update(player.pos, anchorPos);
      // hors geometrie active, la sphere de substitution reprend la main
      for (const e of entries) {
        if (e.isStar) continue;
        const ent = entryForBody(geo, e.data.name);
        e.mesh.isVisible = !ent || !sectors.active.has(ent.file);
      }
      // La limite de poussee du secteur s'applique enfin au vaisseau : 20
      // partout, 200 sur la premiere jumelle, illimitee sur Giant's Deep.
      if (ship) ship.thrustLimit = sectors.thrustLimit;
      // L'eclairage ambiant suit `_ambientLightRange`, mesure depuis le centre
      // du secteur courant.
      const sec = sectorState.secteur;
      if (sec) {
        const d = Math.hypot(sec.position[0] - anchorPos[0] - player.pos.x,
                             sec.position[1] - anchorPos[1] - player.pos.y,
                             sec.position[2] - anchorPos[2] - player.pos.z);
        ambient.intensity = ambientIntensity(d, sec.lightRange);
      } else {
        ambient.intensity = ambientIntensity(0, 0);
      }

      // niveau de detail par maillage, sur les lots effectivement affiches
      meshLOD.update(geo, camera.position, (f) => sectors.active.has(f));

      // eviction : ce qui est hors de portee depuis assez longtemps est rendu
      for (const e of geo) evictor.see(e.file, sectors.inRange.has(e.file));
      const freed = evictor.update(dt, evictFile);
      for (const f of freed) console.log("geometrie liberee :", f);
    }

    // --- Dark Bramble : les predateurs suivent le bruit ---
    //
    // Les predateurs sont poses en coordonnees MONDE, comme tout ce qui vient
    // de gameplay.json ; le joueur, lui, vit dans le repere du corps ancre. On
    // leur passe donc sa position monde. Sans cette conversion, la distance
    // etait fausse du decalage du repere — plusieurs milliers d'unites — et
    // aucun predateur ne se reveillait jamais.
    //
    // Le bruit n'est plus un booleen tire des commandes : c'est un champ. Le
    // joueur y met ce qu'il fait, et le champ audio ce qui joue reellement — un
    // predateur va donc vers ce qu'il entend, pas vers le joueur par principe.
    const noisy = !!(input.forward || input.right || input.up || player.grounded === false);
    const playerWorld = { x: player.pos.x + anchorPos[0],
                          y: player.pos.y + anchorPos[1],
                          z: player.pos.z + anchorPos[2] };
    noise.clear();
    if (noisy) {
      noise.add([playerWorld.x, playerWorld.y, playerWorld.z],
                (player.jetpack || input.loud) ? 1 : 0.7);
    }
    if (audioMap.length) {
      for (const e of audio.emitters()) noise.add(e.position, e.level, e.radius);
    }
    for (const f of fish) f.update(dt, playerWorld, noise);
    thorns.update(loop.fraction);
    // Le seuil de decoupe des materiaux corrompus suit la fraction de boucle.
    if (corruption.items.length) corruption.update(loop.fraction);
    // Zone d'epave : la mise a jour du brouillard y est suspendue.
    if (derelicts.length) {
      const inside = derelicts.some((d) => Math.hypot(
        d.position[0] - playerWorld.x, d.position[1] - playerWorld.y,
        d.position[2] - playerWorld.z) < d.radius);
      if (fog.setSuspended(inside)) {
        console.log(inside ? "EnterDerelictZone" : "ExitDerelictZone");
      }
    }

    // --- trou noir : capture puis ejection au trou blanc ---
    if (blackHole) {
      const t = blackHole.capture(player.pos, anchorPos);
      if (t) {
        player.pos.x = t.position[0]; player.pos.y = t.position[1]; player.pos.z = t.position[2];
        player.vel.x = t.velocity[0]; player.vel.y = t.velocity[1]; player.vel.z = t.velocity[2];
        if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos, false);
      }
    }

    // --- croute de Brittle Hollow ---
    //
    // Les fragments sont integres dans le repere LOCAL du conteneur glTF, ou la
    // planete ne bouge pas : pas de conversion de repere a chaque pas, et le
    // decalage du floating origin reste porte par le conteneur.
    if (crust) {
      const e = entryForBody(geo, bhBody.name);
      if (e && !crust.resolved) {
        crust.resolve((carrier) => {
          const node = e.nodes.get(carrier);
          return node && node.getChildren ? node.getChildren() : null;
        });
      }
      if (crust.resolved) {
        const body = findBodyNode(e, bhBody.bodyName);
        if (body) {
          const inv = e.container.getWorldMatrix().clone().invert();
          body.computeWorldMatrix(true);
          const c = BABYLON.Vector3.TransformCoordinates(
            body.getWorldMatrix().getTranslation(), inv);
          crust.update(dt, loop.fraction, [c.x, c.y, c.z], (f) => {
            f.node.computeWorldMatrix(true);
            const local = BABYLON.Vector3.TransformCoordinates(
              f.node.getWorldMatrix().getTranslation(), inv);
            // le fragment quitte son porteur et devient un corps libre, comme
            // DetachableFragment.Detach qui le reparente a la racine
            f.node.setParent(e.container);
            f.node.position.copyFrom(local);
            return {
              pos: [local.x, local.y, local.z],
              vel: [0, 0, 0],   // _escapeFromParentSpeed vaut 0 dans le build
              apply: (p) => f.node.position.set(p[0], p[1], p[2]),
              remove: () => {
                f.node.setEnabled(false);
                // avale par le trou noir : il prend la file du trou blanc
                if (debris) debris.swallow(f.node.name);
              },
            };
          });
        }
      }
      blackHole.fragmentsDetached = crust.detached;
    }
    syncDebris(dt, anchorPos);

    // --- outils du joueur ---
    camera.fov = telescope.update(dt);
    if (telescope.active && pdata.learn("knowsHowTelescopeWorks")) {
      console.log("usage du telescope appris");
    }
    if (probeFired) {
      probes.launch(player.pos, fwd);
      // ProbeLauncher accorde ce savoir dans le build
      if (pdata.learn("knowsHowProbesWork")) console.log("fonctionnement des sondes appris");
      probeFired = false;
    }
    probes.update(dt, player.field);
    syncProbes();
    // La vue deportee est la meme, avec une autre cible : une console prise en
    // main passe devant la sonde, qui n'est pas ce qu'on regarde a ce
    // moment-la.
    const remoteView = consoles.view(anchorPos,
      { ship, body: player.field && player.field.body });
    probeCam.update(guiMode.hidden ? null : (remoteView || probes.last));

    // --- connaissances : l'exploration s'enregistre en approchant d'un corps ---
    if (player.field) {
      const sec = SECTOR_OF[player.field.body.name];
      const near = player.field.distance <
        (player.field.body.gravity.upperSurfaceRadius || 200) * 3;
      if (sec && near && pdata.saveExploredPlanet(sec)) {
        console.log("secteur explore :", sec);
      }
    }
    if (loop.loopCount > pdata.loopCount) pdata.setLoopCount(loop.loopCount);

    // --- emetteurs de signal ---
    //
    // Un signal se trouve en VISANT A LA LUNETTE : les rayons de l'emetteur
    // sont des distances en pixels a l'ecran, pas des portees dans le monde.
    // Le volume de la lunette est la somme des forces des emetteurs vises.
    telescope.signalStrength = 0;
    if (transmitters.length) {
      const eng = engine;
      const w = eng.getRenderWidth(), h = eng.getRenderHeight();
      const centre = [w / 2, h / 2];
      for (const t of transmitters) {
        let s = 0;
        if (telescope.active) {
          const p = new BABYLON.Vector3(t.position[0] - anchorPos[0],
                                        t.position[1] - anchorPos[1],
                                        t.position[2] - anchorPos[2]);
          if (BABYLON.Vector3.TransformCoordinates(p, scene.getViewMatrix()).z > 0) {
            const sp = BABYLON.Vector3.Project(p, BABYLON.Matrix.Identity(),
                                               scene.getTransformMatrix(),
                                               camera.viewport.toGlobal(w, h));
            const d = Math.hypot(sp.x - centre[0], sp.y - centre[1]);
            s = signalStrength(d, t.hotspot, t.falloff);
            telescope.addSignalStrength(s);
          }
        }
        // Coupure passe-bas : un signal qu'on n'a pas cadre reste etouffe a
        // 1 000 Hz, et se degage a mesure qu'on le vise. C'est le dernier
        // morceau des emetteurs qui manquait — la boucle tourne meme lunette
        // baissee, sans quoi le filtre ne serait jamais pose.
        for (const i of t.sources || []) audio.lowPassFor(i, s);
      }
    }

    // --- mixage par piste ---
    //
    // MixEndTimes fait tomber musique et ambiance a zero quand la supernova
    // arrive ; MixDeath isole la piste de mort.
    mixer.update(dt);
    if (loop.supernova && !mixedEndTimes) { mixer.mixEndTimes(3); mixedEndTimes = true; }
    if (loop.dead && !mixedDeath) { mixer.mixDeath(1); mixedDeath = true; }
    if (!loop.supernova && !loop.dead && (mixedEndTimes || mixedDeath)) {
      mixer.reset(); mixedEndTimes = false; mixedDeath = false;
    }

    // --- lampe, ordinateur de bord, guimauve ---
    //
    // La lampe s'eteint d'elle-meme dans le vaisseau, la carte ou une
    // conversation : le jeu appelle TurnOff sur chacun de ces evenements.
    if (ship && ship.boarded) flashlight.forceOff();
    if (solarMap.open || dialogue.active) flashlight.forceOff();
    flashlight.update(camera, fwd,
      sectorState.secteur ? sectorState.secteur.lightRange || null : null);
    // Face nuit : la hauteur du soleil au-dessus de l'horizon local. Elle n'a
    // de sens que depuis que les corps tournent sur eux-memes — sur une planete
    // figee, la face nuit ne le devenait jamais.
    if (star0) night = sunElevation(star0.position, [up.x, up.y, up.z]) < 0;
    // La guimauve ne cuit plus sur commande mais au-dessus des braises : la
    // chaleur vient du HeatSource le plus proche.
    if (heat.length) {
      const h = heatAt(heat, [playerWorld.x, playerWorld.y, playerWorld.z]);
      marshmallow.held = h > 0 || marshmallow.toast > 0;
      marshmallow.update(dt, h);
    }
    if (!(ship && ship.boarded)) computer.open = false;
    if (computerEl) {
      computerEl.hidden = !computer.open || guiMode.hidden;
      if (computer.open) {
        const d = computer.display();
        computerEl.textContent = "";
        const nm = document.createElement("div");
        nm.className = "ow-computer-name";
        nm.textContent = d.name;
        const ds = document.createElement("div");
        ds.className = "ow-computer-desc";
        ds.textContent = d.description;
        computerEl.appendChild(nm);
        computerEl.appendChild(ds);
      }
    }

    // Etat de l'interface tactile : un menu ouvert sort la croix et suspend le
    // pilotage, la carte laisse ses gestes au canvas.
    touch.setContext({ menu: settings.open || computer.open, map: solarMap.open });
    // Le mode « masque » de GUIMode ne cache pas que les invites : il rend
    // l'ecran entier au jeu, bandeau d'etat compris. Le dialogue vit dans le
    // meme bandeau et n'est pas concerne : c'est une conversation en cours,
    // pas un affichage de mise au point.
    document.body.classList.toggle("gui-hidden", guiMode.hidden);

    // --- brouillards ---
    // anchorPos, pas origin.offset : le decalage du floating origin est fige sur
    // la position INITIALE du corps ancre, alors que les volumes de brouillard
    // sont fixes dans le monde et que le corps ancre, lui, orbite.
    fog.update(camera.position, anchorPos, now);
    fog.apply(BABYLON, scene, camera);
    cloaks.update(camera.position, anchorPos, fog.inBramble, fog.density);
    if (lights) lights.update(camera, anchorPos, dt, fog.inBramble);

    // --- lune quantique : elle se deplace des qu'on cesse de la regarder ---
    if (quantum && qBody) {
      // Le test de visibilite tient compte des occlusions : une lune cachee
      // derriere une planete n'est pas observee, et rien n'empeche alors le
      // saut. Avant, il suffisait de la garder dans le champ de vision, mur ou
      // pas mur, pour la verrouiller.
      quantum.update(player.pos, fwd, { occluded: qOccluder });
      qBody.position = quantum.position.slice();
      const qe = entries.find((e) => e.data === qBody);
      if (qe) qe.mesh.position.set(...qBody.position);
      const qgeo = entryForBody(geo, qBody.name);
      if (qFog && qShell) {
        const d = Math.hypot(qBody.position[0] - player.pos.x,
                             qBody.position[1] - player.pos.y,
                             qBody.position[2] - player.pos.z);
        const st = qFog.update(d, dt);
        qShell.position.copyFrom(camera.position);
        qShell.material.alpha = st.alpha;
        qShell.setEnabled(st.alpha > 0.002);
        // Franchir le rayon interieur vers l'exterieur force l'effondrement :
        // c'est la sortie du brouillard qui declenche le saut, pas le regard.
        if (st.exited && quantum.relocate) quantum.relocate();
      }
      const qnode = qgeo && findBodyNode(qgeo, qBody.bodyName);
      if (qnode) {
        qnode.setAbsolutePosition(new BABYLON.Vector3(...qBody.position));
        // `AlignQuantumMoon` : quel que soit l'hote autour duquel elle vient de
        // s'effondrer, c'est la meme face qu'on voit. Sans lui, la lune changeait
        // de planete ET d'aspect a chaque saut.
        const q = alignToObserver(qBody.position, camera.position);
        if (!qnode.rotationQuaternion) {
          qnode.rotationQuaternion = new BABYLON.Quaternion(q[0], q[1], q[2], q[3]);
        } else {
          qnode.rotationQuaternion.set(q[0], q[1], q[2], q[3]);
        }
      }
    }

    // --- boucle temporelle ---
    const starBody = bodies.find((b) => (b.gravity.surfaceAcceleration || 0) >= 50);
    const sunDist = starBody
      ? Math.hypot(player.pos.x - starBody.position[0],
                   player.pos.y - starBody.position[1],
                   player.pos.z - starBody.position[2])
      : null;
    loop.update(dt, sunDist);
    // La musique de fin est une piste declenchee : elle ne se telecharge qu'au
    // moment ou la supernova la demande, pas au demarrage.
    if (loop.supernova && !endTimesCued) {
      endTimesCued = audio.cue("EndTimes") > 0;
    }
    // --- les causes de mort ---
    //
    // Elles passent toutes par le meme handler, qui ne retient que la
    // premiere : mourir asphyxie pendant que l'onde de choc arrive reste une
    // seule mort, avec une seule cause affichee.
    if (resources.dead) death.kill("asphyxie");
    if (loop.dead) death.kill(loop.deathCause || "supernova");
    // Devore : un predateur de Dark Bramble qui atteint sa proie.
    if (fish.some((f) => f.caught)) death.kill("digestion");
    // Incineration : entrer dans l'etoile. Le corps est la, son rayon aussi ;
    // rien n'empechait d'y voler jusqu'ici.
    if (starBody && sunDist != null &&
        sunDist < (starBody.gravity.upperSurfaceRadius || 0)) {
      death.kill("incineration");
    }
    // Le vaisseau detruit tue son pilote. Hors du vaisseau, il tombe.
    if (ship && ship.destroyed && ship.boarded) death.kill("impact");
    // Impact : la chute. `Resources.applyImpact` portait les seuils du build
    // (20 et 40 u/s) sans que rien ne l'appelle jamais.
    if (player.grounded && !wasGrounded && fallSpeed > resources.minImpact) {
      const lost = resources.applyImpact(fallSpeed);
      if (lost > 0 && resHUD) resHUD.damage(now);
      if (resources.dead) death.kill("impact");
    }

    if (death.dead) {
      if (!loop.dead) loop.kill(death.cause);
      // Le son de la mort : la source dont le nom parle de cette cause, ou la
      // piste Death a defaut. `PlayerDeathHandler` en joue un dans le jeu.
      if (deathCued !== death.cause) {
        deathCued = death.cause;
        const pat = DEATH_SOUNDS[death.cause];
        const n = (pat ? audio.cueMatching(pat) : 0) || audio.cue("Death");
        if (n) console.log(`son de mort demande (${death.cause}) : ${n} source(s)`);
      }
      // la sequence de flashback tient l'ecran, puis la boucle repart
      if (death.update(dt)) respawn();
    } else if (deathCued) {
      deathCued = null;
    }
    if (flashOverlay) flashOverlay.update(death.state);
    // La camera bascule et descend pendant la sequence : on mourait jusqu'ici
    // sans que l'image bouge d'un pixel.
    if (death.dead) {
      const m = deathCamera(death.state);
      if (m.drop || m.roll) {
        camera.position.addInPlace(up.scale(-m.drop));
        const tilt = fwd.scale(Math.cos(m.pitch)).add(up.scale(-Math.sin(m.pitch)));
        camera.setTarget(camera.position.add(tilt));
        // le roulis se lit sur la verticale de la camera, pas sur sa cible
        const axis = tilt.normalizeToNew();
        camera.upVector = BABYLON.Vector3.TransformCoordinates(
          up, BABYLON.Matrix.RotationAxis(axis, m.roll));
      }
    }

    // --- le spectacle de la supernova ---
    const sunState = sunStage.update(loop);
    if (starEntry) starEntry.mesh.scaling.setAll(sunState.scale);
    if (supernovaView && starBody) supernovaView.update(sunState, starBody.position);

    // Coques atmospheriques : elles suivent leur corps, et s'effacent quand on
    // entre dedans.
    //
    // Ce halo de limbe est fait pour etre vu DE L'EXTERIEUR : c'est un terme de
    // Fresnel sur une sphere, dont les faces arriere sont eliminees justement
    // pour cela. Vu de l'interieur, il ne reste que l'hemisphere oppose, dont
    // les normales fuient le regard — et le voile sature sur tout l'ecran.
    //
    // Sur Timber Hearth, cela repeignait en plein jour une scene de depart dont
    // le soleil est a 77 degres sous l'horizon, par-dessus la vraie voute que
    // le build livre pourtant (docs/41-ciel.md). Le jeu, lui, n'a pas de coque
    // inventee : il a `SkyShell`.
    for (const a of mats.atmospheres) {
      const p = a.entry.data.position;
      a.mesh.position.set(p[0], p[1], p[2]);
      const dx = camera.position.x - p[0], dy = camera.position.y - p[1],
            dz = camera.position.z - p[2];
      const rayon = a.mesh.getBoundingInfo().boundingSphere.radius
        * (a.mesh.scaling ? a.mesh.scaling.x : 1);
      a.mesh.setEnabled(Math.hypot(dx, dy, dz) > rayon);
    }
    updateMaterials(BABYLON, mats, camera.position, sun.direction,
                    performance.now() / 1000, loop.fraction);
    updateGameShaders(BABYLON, scene, camera.position, performance.now() / 1000,
                      sun.direction);
    // Le ciel du build : ce qu'il calcule, on le calcule. Ce qu'il n'applique
    // pas, on ne l'applique pas non plus (docs/41-ciel.md).
    if (sky.ready) sky.update(player.pos);
    if (scrollers.count) scrollers.update(dt);
    // Le sable suit la boucle et rien d'autre : il repart de son niveau initial
    // a chaque redemarrage, comme dans le jeu.
    if (sand.count) sand.update(loop.elapsed);

    // sources audio dans la portee de l'auditeur, creees et liberees a la volee
    if (audioMap.length) audio.update(player.pos, anchorPos, mixer);
    // Lumieres posees dans la scene : instanciees a la volee dans leur budget,
    // comme l'audio et les particules. Deux lumieres inventees ne tenaient pas
    // lieu d'eclairage pour un systeme solaire entier.
    placedLights.update(player.pos, anchorPos);
    // Ce qui fait VIVRE ces lumieres : 15 `NightLight`, 15 `PulsingLight` et
    // 9 `LightFlicker` que le portage ne lisait pas. Un feu de camp qui ne
    // vacille pas se remarque (docs/42-lumieres.md).
    placedLights.setNight(night, performance.now() / 1000);
    placedLights.animate(performance.now() / 1000);
    // le champ dominant du joueur tient lieu de `Physics.gravity` pour le
    // `gravityModifier` des systemes de particules
    if (particleMap.length) particles.update(player.pos, anchorPos, player.field);

    const speed = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
    setStatus(
      `${f ? f.body.name : "espace profond"} — altitude ${
        f ? (f.distance - (f.body.gravity.upperSurfaceRadius || 0)).toFixed(0) : "—"
      } u — g ${f ? f.magnitude.toFixed(1) : "0"} — vitesse ${speed.toFixed(1)} u/s` +
      (player.grounded ? " — au sol" : "") +
      (plugin ? ` — Havok ${colliders ? colliders.aggregates.length : 0} colliders`
              : geo.length ? " — collision analytique" : "") +
      (anchorBody && period(orbits, anchorBody)
        ? ` — orbite ${(period(orbits, anchorBody) / 60).toFixed(1)} min` : "") +
      (data.synthetic ? "  [systeme de substitution]" : "")
    );
  });
}

export const ready = boot();
ready.catch((e) => {
  setStatus("Erreur : " + e.message);
  console.error(e);
});
