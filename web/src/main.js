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
import { GeometryStore, bootFiles, BODY_TO_FILE, BODY_FILES, EXTRA_VOLUMES, syncGeometry,
         entryForBody, findBodyNode, meshesForBody } from "./geometry.js";
import { buildOrbits, advance, currentPosition, period,
         frameVelocity } from "./orbits.js";
import { loadGameplay, loadPrefabs } from "./config.js";
import { Resources, oxygenZones, inOxygenZone,
         oxygenDetector } from "./resources.js";
import { loadInterface, ResourceHUD, Prompts, GuiMode,
         AutopilotReadout, CROSSHAIR, crosshairPixels, InviteCodes } from "./hud.js";
import { Minimap } from "./minimap.js";
import { sunlessZones, darkZones, entrywayTriggers, attachEntryways,
         ZonePresence, zonesAround, EffectZones } from "./entryways.js";
import { Settings, SettingsUI, MenuInput } from "./settings.js";
import { loadTitre, TitleScreen, SKIP_INTRO_FLAGS } from "./titre.js";
import { shipRecords, ShipComputer, Flashlight, Marshmallow,
         heatAt, remoteConsoles, RemoteConsoles,
         eatMarshmallowHeals, flashlightPromptVisible,
         jetpackPrompts } from "./consoles.js";
import { fogVolumes, FogField, QuantumFog, fogCloaks, FogCloaks,
         fogLights, FogLightIcons } from "./fog.js";
import { crustCarriers, Crust, detachVelocity } from "./crust.js";
import { Interactables, OBSERVATORY_EVENTS } from "./interact.js";
import { Ship, shipSpawn, quatMul, quatRotate } from "./ship.js";
import { startPose, walkToShip, horizonBasis, yawFor, EYE_HEIGHT,
         REVEIL, Reveil } from "./start.js";
import { loadAudioMap, AudioField, AudioMixer, signalStrength,
         audioShells, AudioShells } from "./audio.js";
import { loadParticleMap, ParticleField } from "./particles.js";
import { makeAtmosphere, makeSun, updateMaterials } from "./materials.js";
import { TimeLoop, ResetTrigger, effondrementsDuBuild } from "./timeloop.js";
import { SunStage, SupernovaView } from "./supernova.js";
import { PlayerDeathHandler, FlashbackOverlay, deathCamera, SnapshotTimer,
         FLASHBACK, DEATH_SOUNDS } from "./death.js";
import { MeshLOD, Evictor, lodThresholds, colliderLODs, ColliderLODs } from "./lod.js";
import { loadDialogue, DialogueSystem } from "./dialogue.js";
import { QuantumMoon, quantumHosts, bodyOccluder,
         alignToObserver } from "./quantum.js";
import { QuantumObject as ObjetQuantique, planarQuantumObjects, quantumStatues,
         statueParts, planarCandidate, slopeOK,
         QUANTIQUE } from "./quantumobj.js";
import { BlackHole, DebrisField, WHITE_HOLE, leashBrake,
         growSteps } from "./blackhole.js";
import { Anglerfish, Thorns, NoiseField, Corruption, shipOnlyMusicState } from "./bramble.js";
import { Sectors, sectorMap, ambientIntensity, ambientLight, majorSectors,
         activeMajorSector, sectorThrustLimit } from "./sectors.js";
import { Autopilot, relativeDelta, matchVelocityStep } from "./autopilot.js";
import { SolarMap, mapMarkers, AccesCarte, VueCarte, MAP as REGLES_CARTE, qRot, qMul } from "./map.js";
import { shipComponents, ALERT_ORDER } from "./shipdamage.js";
import { gazeSwitches, energyGates, GazeSwitch, EnergyGate,
         webSpeeds, webAlpha, webAnimators } from "./gaze.js";
import { elevators, Elevator, LaunchTerminal, launchTerminals,
         elevatorControllers, RETURN_ABOVE, landingPadSensors,
         museumEntryways } from "./tower.js";
import { Helmet, MasterAlarm, DamageDisplay, Notifications, helmetSettings,
         roastPrompts, roastBroken, shipProximity,
         RoastPrompt } from "./helmet.js";
import { playerNoise, NOISE, CompressionSensor, INTERACT_RANGE,
         PlayerState, PLAYER_FALLBACK } from "./player.js";
import { applyGameShaders, updateGameShaders, toLegacyMaterials, gltfEnGamma } from "./shaders/index.js";
import { EchangeSoleil, imposteursDuBuild, poseImposteur } from "./imposteur.js";
import { reparationVisee } from "./volumes.js";
import { SECTORS, PlayerData, selectTree, convoControllers } from "./playerdata.js";
import { Telescope, ProbeCamera, SoundWave, WAVE, TELESCOPE_MIX,
         telescopeScale, zoomArrowFraction } from "./tools.js";
// La sonde entiere vient du prefabrique `sharedassets1.assets:2295`, que le
// recensement ne voyait pas : il ne lisait que `level0` (docs/60-sonde.md).
import { ProbeLauncher, SONDE, snapshotSize, probeIcon, probeLabelPos,
         probeReadout, selfDestructed } from "./probe.js";
import { DialogueUI } from "./dialogueui.js";
import { initPhysics, buildColliders, disposeColliders,
         createPlayerBody, teleportBody, hideUnrendered, propagerExtras, hiddenMesh,
         disableInactive, underInactive, ombresDuRenderer } from "./physics.js";
import { TouchControls, touchAvailable, bindMapGestures } from "./touch.js";
import { GamepadControls, padAvailable, padDisagreements } from "./gamepad.js";
// Les commandes du BUILD, lues dans `mainData` (docs/61-commandes.md).
import { loadCommandes, decoupeImage } from "./input.js";
import { Modes, annonceDe } from "./modes.js";
import { LandingView, rollMode, ATTERRISSAGE } from "./landing.js";
import { MODELE, ModelLandingSpot, RocketKid, crashes,
         modelLandingSpots, modelShipBody, rocketKids, estEnfant,
         poussesModele, voleModele, invitesConsoleModele,
         detecteurModele, graviteModele } from "./modelship.js";
import { SpinField, sunElevation, spinPeriod, bodySpin } from "./spin.js";
import { directionalFields, polarFields, insideVolume,
         dominantField, rotateByQuaternion } from "./gravity.js";
// @autrement Tonemapping : quatre methodes de courbe et de cible de rendu,
// c'est-a-dire l'implementation d'un shader d'Unity 4. Babylon a la sienne, et
// c'est elle qu'on regle (docs/103-refait.md).
// @lit Locator
// @autrement Locator : singleton d'acces global aux composants remplace par le contexte du moteur web
// @lit TonemappingManager, Tonemapping, DS_Decals, DS_DecalsMeshRenderer, DS_DecalProjector
// Le tonemapping est pilote par le reglage « luminosite », qui reproduit le
// `_isTonemappingActive` faux par defaut du manager ; les decalcomanies passent
// par `applyDecals` (docs/46-migration-lots.md, lot 2).
//
// `DS_Decals.AddDecalsMeshRendererComponentToGameObject(go)` tient en une
// ligne — `return go.AddComponent<DS_DecalsMeshRenderer>()` — et c'est une
// fabrique d'EDITEUR : rien dans la scene ne l'appelle, les
// `DS_DecalsMeshRenderer` y sont deja poses. Une piste qui se ferme a la
// lecture (docs/121-avis.md).

import { fluidVolumes, fluidDetectors, FluidField } from "./fluids.js";
import { CameraEffects, loadCameras, reglagesDuJoueur,
         reglagesDe } from "./cameraeffects.js";
import { PostFX, effetsSecondaires } from "./postfx.js";
import { planetImposters, Imposter, IMPOSTER_SIZE } from "./imposters.js";
import { LockOn, aimedFrame, canFlyTo,
         ancientProbeAcceleration } from "./tracker.js";
// Six classes du build, ecrites et jamais appelees jusqu'ici : le module
// existait, ses quarante verifications passaient, et aucun module du moteur ne
// l'importait (docs/68-lois.md).
import { alignedBodies, alignmentDirection, fieldInheritors, blinkingRenderers,
         Blinker, brokenNodes, waterEffects, hatchControllers,
         Hatch } from "./attachments.js";
// Ce que le joueur TIENT : le baton a guimauve et la lunette pendent sous
// `PlayerCamera` dans le build, et l'export ne partait que des corps celestes
// (docs/64-mains.md).
import { MarshmallowStick as BatonGuimauve, thermTime,
         STICK_LIGHTS } from "./held.js";
import { relativeMotion, trackerReadout, motionDust,
         shipNozzles, modelShipNozzles } from "./tracker.js";
import { loadLighting, LightField, ambientTarget, ambientStep, FadeLight,
         SATELLITE_FADE, shiplightRange, SHIPLIGHT_RANGE, lightCap,
         patchAttenuationUnity, patchCookieUnity, falloffUnity, layerMaskFor, applyLayers,
         masqueCamera, CALQUE_SONDE } from "./lights.js";
import { loadSky, Sky, StarField } from "./sky.js";
import { champEtoiles, creerVoute } from "./etoiles.js";
import { loadTextureAnimators, TextureScrollers } from "./texanim.js";
import { SandLevels, sandColumns, sandFunnels, markCrushing,
         funnelActive } from "./sand.js";
import { destructionVolumes, repairVolumes, destroyedBy, deathCause,
         deathTypeOf, Repair } from "./volumes.js";
import { loadAmbience, ambienceZones, AmbienceMixer, isDay } from "./ambience.js";
// Les six lots de docs/44-reste-a-migrer.md, dans l'ordre conseille par la page.
import { referenceFrames, DeclaredFrames, restingPoint,
         autopilotDistances, attachTarget,
         matchInitialVelocity } from "./frames.js";
import { billboards, talkingFaces, DecorField, teleporters, Teleporters,
         warps, DerelictWarps,
         meteorLaunchers, MeteorLaunchers, METEOR,
         tornadoPivots, TornadoPivots, matchTransforms, disposableContainers,
         nozzleFires, thrusterNozzles, particleBursts, RandomTimer,
         qrot as qrotDecor, lookRotation } from "./decor.js";
import { hazardVolumes, Hazards, zeroGFields, strongestZeroG,
         sandstormVolumes,
         childTriggers, Sandstorm, radiationEmitters, probePrompts,
         promptFaced } from "./volumes.js";
import { gearPickups, suitVolumes, suitVolumeStep, Equipment, suitBarrierPush,
         ZeroGTraining, attachPoints, lockOnTargets, CameraLock,
         LOCK_ON } from "./gear.js";
import { AttachPoints, snapDuration, snapDegrees, turnFraction,
         FieldAlignment, FIELD_ALIGN,
         UpAligner, steadyPitch, steadyLook } from "./attach.js";
import { loadEventAudio, eventAudio, Footsteps, Turbulence, ThrusterSound,
         TravelMusic, EndOfTimeMusic, END_OF_TIME, THRUSTER_AUDIO,
         UISounds, jumpSound, shipTurbulence, SuitAmbience } from "./reactaudio.js";
import { applyDecals } from "./shaders/index.js";

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

/**
 * `SettingsMenu.ToggleOption`, septieme option en partie : `LoadLevel(0)`.
 *
 * Recharger la page EST recharger le niveau 0 : tout ce qui doit survivre —
 * la sauvegarde, les reglages — est deja dans le stockage du navigateur. La
 * marque de session dit a la page de repartir droit sur l'ecran-titre, sans
 * repasser par l'accueil (gate.js).
 */
function retourAuTitre() {
  try { sessionStorage.setItem("outerwildsjs.titre", "1"); } catch (e) { /* */ }
  location.reload();
}

/**
 * L'ecran-titre, jusqu'au choix du joueur.
 *
 * @returns { ecran, choix } — ou null sans donnees de titre
 */
async function ecranTitre(BABYLON, engine, cmds) {
  const donnees = await loadTitre();
  if (!donnees || !donnees.menu) return null;
  const ecran = new TitleScreen(BABYLON, engine, donnees, {
    cmds,
    // `PlayerData.LoadLoopCount` : ce que dit le DISQUE, avant tout choix.
    loopCount: new PlayerData().loopCount,
  });
  window.__titre = ecran;
  ecran.scene.registerBeforeRender(() => ecran.avancer());
  engine.runRenderLoop(ecran.rendu);
  ecran.jouerMusique();
  ecran.chargerGeometrie(ParticleField, applyGameShaders, toLegacyMaterials);

  // Les reglages ouverts DEPUIS le titre : le meme `SettingsMenu`, au niveau 0.
  const iface = await loadInterface();
  const uiRoot = document.getElementById("ui");
  const reglages = new Settings(iface || {}, { niveau: 0 });
  const retour = () => { if (!reglages.open) ecran.rouvrir(); };
  const reglagesUI = uiRoot
    ? new SettingsUI(uiRoot, reglages, "data/interface/", { onPick: () => retour() })
    : null;
  const menuInput = new MenuInput();
  ecran.onSettings = () => {
    reglages.ouvre();
    menuInput.reouvre(true);
    if (reglagesUI) reglagesUI.render();
  };
  const clavier = (e) => {
    if (!reglages.open) return;
    const canal = (nom) => {
      const c = cmds.get(nom);
      return c ? { pos: c.pos.codes.includes(e.code), neg: c.neg.codes.includes(e.code) } : {};
    };
    if (canal("Cancel").pos || e.code === "Escape") {
      // `Menu.Update` : `cancel` ferme, et rouvre le parent.
      reglages.ferme();
    } else {
      const z = canal("Move Z"), x = canal("Move X");
      const dz = z.pos || e.code === "ArrowUp" ? 1 : z.neg || e.code === "ArrowDown" ? -1 : 0;
      const dx = x.pos || e.code === "ArrowRight" ? 1 : x.neg || e.code === "ArrowLeft" ? -1 : 0;
      const verrou = !!(reglages.options[reglages.index] || {}).locked;
      const g = menuInput.axes(performance.now() / 1000, dz, dx, verrou);
      if (g.move) reglages.move(g.move);
      if (g.toggle) reglages.toggle(g.toggle);
      if (!e.repeat && (canal("Interact").pos || canal("Jump").pos)) reglages.toggle(0);
    }
    if (reglagesUI) reglagesUI.render();
    retour();
  };
  addEventListener("keydown", clavier);

  const choix = await ecran.choix;
  removeEventListener("keydown", clavier);
  if (reglagesUI) reglagesUI.el.remove();
  if (choix.quit) {
    // `Application.Quit` : une page ne se ferme pas elle-meme. On revient a
    // l'accueil, qui est ce qu'il y a « hors du jeu » ici.
    location.reload();
    return new Promise(() => {});
  }
  return { ecran, choix };
}

async function boot() {
  const BABYLON = window.BABYLON;
  const canvas = document.getElementById("view");
  // audioEngine: true est indispensable — depuis Babylon 8 le moteur audio
  // herite n'est plus cree automatiquement, et BABYLON.Sound ne telecharge
  // alors aucun fichier, sans lever d'erreur.
  const engine = new BABYLON.Engine(canvas, true,
    { stencil: true, audioEngine: true }, true);
  addEventListener("resize", () => engine.resize());
  // Avant tout chargement de glTF, titre compris : les textures en gamma.
  gltfEnGamma(BABYLON);
  // Les liaisons de touches du jeu. Absentes, la table mesuree de `input.js`
  // prend le relais — et elle se sait repli, comme `config.js`.
  const cmds = await loadCommandes();
  // LE NIVEAU 0 AVANT LE NIVEAU 1. L'ecran-titre tourne, on choisit, et la
  // partie se charge DERRIERE lui — `LoadLevelAsync` — pendant que « Loading... »
  // reste affiche (docs/131-ecran-titre.md). Sans `data/titre/`, on entre droit
  // dans la partie, comme le portage l'a toujours fait.
  const titre = await ecranTitre(BABYLON, engine, cmds);
  const data = await loadSolarSystem();
  // charge avant le calcul du point d'apparition, qui s'appuie dessus
  const gameplay = await loadGameplay();
  // §P Les prefabriques, et les dix delais de `SelfDestruct` qu'ils portent.
  const prefabs = await loadPrefabs();
  // `DistantSupernova` : cinq secondes, et c'est le build qui le dit.
  const dureeSupernova = (prefabs.selfDestruct || {}).DistantSupernova ?? 1;
  const resources = new Resources(
    (gameplay.singletons.PlayerResources || {}).fields || {});
  const interactables = new Interactables(gameplay);
  window.__interactables = interactables;   // sonde : les trente-quatre lisibles
  // Les recepteurs se visent au rayon quand l'extraction porte leurs colliders.
  const visesParRayon = interactables.items.some((it) => it.kind === "interact" && it.volume);
  // Sonde de verification : ce que le rayon vise, et ou est un recepteur dans
  // le repere courant (le corps porteur tourne et se deplace).
  const sondeInteraction = { vise: null, repere: null };
  window.__interaction = sondeInteraction;
  const bodies = data.bodies;
  if (!bodies.length) { setStatus("Aucun corps a afficher."); return; }

  const scene = new BABYLON.Scene(canvas ? engine : engine);
  // `renderPriority` ne trie les lumieres d'un maillage que si la scene le
  // demande. Sans cela, l'ordre est celui de CREATION : les lumieres tenues
  // passaient devant par chance, et le soleil de substitution, cree apres les
  // lampes du village, tombait hors des sept que prend un materiau (docs/132).
  scene.requireLightSorting = true;
  // L'attenuation des lumieres ponctuelles d'Unity 4, avant tout shader.
  patchAttenuationUnity(BABYLON);
  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.05, 1);

  // Le plafond de lumieres par materiau, lu sur le processeur graphique : le
  // chargeur glTF le releve a chaque chargement, on le ramene a chaque image
  // ou le nombre de materiaux a bouge (lights.js, `lightCap`).
  {
    const gl = engine._gl;
    const plafond = lightCap(gl && gl.getParameter
      ? Math.min(gl.getParameter(gl.MAX_VERTEX_UNIFORM_BLOCKS),
                 gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_BLOCKS)) : 0);
    // Chaque image : le chargeur ecrit la valeur a la FIN d'un chargement, pas
    // quand le materiau apparait, et 170 comparaisons ne coutent rien.
    scene.onBeforeRenderObservable.add(() => {
      for (const m of scene.materials) {
        if (m.maxSimultaneousLights > plafond) m.maxSimultaneousLights = plafond;
      }
    });
  }

  // LE GROUPE DE RENDU 1 N'EST PAS UN CALQUE « APRES L'OPAQUE ».
  //
  // Babylon EFFACE le tampon de profondeur avant chaque groupe non vide —
  // `RenderingManager.AUTOCLEAR` vaut vrai, et chacun des quatre groupes part
  // avec `{autoClear: true, depth: true, stencil: true}`. Le groupe 1 ne dit
  // donc pas « apres l'opaque » mais « par-dessus tout, quoi qu'il y ait
  // devant ». Les quatre coques du portage y sont posees — la couronne de
  // l'etoile et l'onde de choc (supernova.js), les coques atmospheriques
  // (materials.js), la coque quantique — et toutes les quatre traversaient ce
  // qui les occultait.
  //
  // CE QUE CELA DONNAIT A L'ECRAN, et des la premiere image d'une boucle et non
  // a la supernova : `SunCoronaProgressBehavior` part a 0,12 d'alpha et non a
  // zero, la couronne est donc montee au demarrage, large de 1,18 rayon solaire
  // et additive. Une planete placee entre l'oeil et l'etoile recevait le soleil
  // PAR-DESSUS elle. Mesure au centre du disque occulte, dans le navigateur :
  // (69, 40, 19) — l'orange de la couronne — la ou la nuit de la planete donne
  // (7, 6, 7). Le soleil se voyait au travers des planetes, en transparence.
  //
  // On garde le groupe, qui dit bien l'ordre voulu, et on lui retire le seul
  // effacement dont personne ne voulait. Rien d'autre ne change : le melange
  // alpha suffit deja a faire passer ces coques apres l'opaque, c'est la file
  // transparente du groupe qui s'en charge — et elle, elle teste la profondeur.
  scene.setRenderingAutoClearDepthStencil(1, false);

  // PAS de tampon de profondeur logarithmique, et ce n'est pas un oubli : une
  // ligne le promettait ici depuis le premier commit alors que rien n'a jamais
  // pose `useLogarithmicDepth`. La mesure dit qu'il ne manque pas. Sur 24 bits
  // avec le plan proche ci-dessous, la profondeur se resout a ~1,2e-6 x z^2 —
  // 120 unites a 10 000, 750 a 25 000 — tandis que le corps le plus proche de
  // l'etoile laisse 6 600 unites entre lui et sa surface : il faudrait regarder
  // le systeme de 74 000 unites pour que les deux tombent dans le meme cran, et
  // la planete y ferait un pixel. Le soleil qui traversait les planetes ne
  // venait pas de la profondeur, mais du groupe de rendu ci-dessus.
  const camera = new BABYLON.FreeCamera("cam", BABYLON.Vector3.Zero(), scene);
  // `PlayerCamera` : plan proche a 0,05, plan lointain a 50 000. On garde le
  // proche du build et NON son lointain : le build n'affiche au-dela que des
  // impostures rafraichies par `LODCameraSnapshot`, que ce portage ne fait pas
  // — couper a 50 000 effacerait donc les planetes lointaines au lieu de les
  // remplacer. Le lointain est le seul des deux qui soit un choix.
  camera.minZ = 0.05;
  camera.maxZ = 200000;
  // Le champ de vision du build, et non celui de Babylon. `PlayerCamera` voit a
  // 70 degres ; la valeur par defaut de Babylon est 0,8 radian, soit 45,8. Rien
  // ne le reglait, et une scene cadree a 46 degres au lieu de 70 ne ressemble
  // simplement pas au jeu — c'est le genre d'ecart qu'une capture ne trahit
  // pas, faute de point de comparaison dans l'image.
  const camerasDuBuild = await loadCameras();
  // §K Le jeu de commandes actif. `OWInput` en echange l'ensemble a chaque
  // changement de mode, et tout ce qui lit une touche passe par lui
  // (docs/70-modes.md).
  const modes = new Modes();
  cmds.setModes(modes);
  window.__modes = modes;
  window.__cmds = cmds;
  window.__commandes = cmds;
  const reglagesCam = reglagesDuJoueur(camerasDuBuild);
  camera.fov = (reglagesCam.fov || 70) * Math.PI / 180;
  // Le masque de la `PlayerCamera` du build : tout sauf `HeadsUpDisplay` (23),
  // que la camera du casque dessine seule, et deux calques de volumes. Il
  // contient le bit 29, celui des billes de sonde : visibles du joueur, pas de
  // la sonde elle-meme. Sans lui, les objets du calque 23 flottaient dans le
  // decor (docs/132).
  camera.layerMask = masqueCamera(reglagesCam.cullingMask);
  scene.activeCamera = camera;

  // LE SOLEIL EST UNE PONCTUELLE. `SunLight` : posee sur l'etoile, portee
  // 20 000, intensite 3, et l'attenuation d'Unity 4 (lights.js). Le portage
  // tenait une directionnelle d'intensite 1,15 partout — la force du soleil a
  // la distance de Timber Hearth, appliquee a tout le systeme. Or a 16 458
  // unites, Giant's Deep n'en recoit que le vingtieme : l'alpha la montre
  // presque noire, auréolée de son seul liseré, et Dark Bramble et la comete,
  // au-dela de la portee, ne sont pas eclaires du tout (docs/132). Les
  // reglages definitifs viennent du build plus bas, une fois `lighting` lu.
  const sun = new BABYLON.PointLight("sun", new BABYLON.Vector3(0, 0, 0), scene);
  sun.range = 20000;
  sun.intensity = 3;
  // La direction de la lumiere au point de vue, que lisent les materiaux du
  // jeu (atmospheres, liseres) : de l'etoile vers la camera.
  const sunDir = new BABYLON.Vector3(0, -1, 0);
  // L'ambiance n'est pas une constante : chaque secteur porte sa propre portee
  // d'eclairage ambiant (`_ambientLightRange`), de 750 sur Giant's Deep a 0 sur
  // la comete. On garde la lumiere sous la main pour la suivre.
  const ambient = new BABYLON.HemisphericLight("amb", new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity = 0;
  ambient.specular = new BABYLON.Color3(0, 0, 0);

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

  /**
   * La vitesse avec laquelle un corps se reveille : `MatchInitialMotion`.
   *
   * `AttachOnAwake` decide du porteur en posant une petite sphere et en
   * regardant ce qu'elle touche ; `attachTarget` pose la meme question au
   * systeme charge. Le rayon de controle vaut 1 sur trente des trente-quatre
   * instances du build, mais le point de depart du joueur est a hauteur d'oeil
   * au-dessus du sol : on elargit a la hauteur d'oeil, faute de collider.
   *
   * @param point position, dans le repere ANCRE
   */
  function vitesseDeDepart(point, ignoreAngular = false) {
    const monde = [point[0] + framePos[0], point[1] + framePos[1],
                   point[2] + framePos[2]];
    const porteur = attachTarget(monde, EYE_HEIGHT + 2, bodies);
    if (!porteur) return [0, 0, 0];
    const s = spins.spin(porteur);
    // Dans le repere ancre, la vitesse du porteur est nulle quand c'est lui
    // l'ancre. Le terme tangentiel, lui, ne l'est jamais : l'ancre ne tourne
    // pas avec la planete (docs/73-passages.md).
    const v = porteur === anchorBody ? [0, 0, 0]
      : [porteur.velocity ? porteur.velocity[0] : 0,
         porteur.velocity ? porteur.velocity[1] : 0,
         porteur.velocity ? porteur.velocity[2] : 0];
    return matchInitialVelocity(
      { velocity: v, position: porteur.position,
        angularVelocity: s ? [s.axis[0] * s.rate, s.axis[1] * s.rate,
                              s.axis[2] * s.rate] : null },
      monde, { ignoreAngular });
  }

  /** Exprime toutes les positions dans le repere du corps ancre. */
  function reframe(anchor) {
    const ap = currentPosition(orbits, anchor);
    for (const b of bodies) {
      const rel = sub3(currentPosition(orbits, b), ap);
      b.position = b === anchor ? rel : spins.toFrame(anchor, rel);
    }
    return ap;
  }

  /**
   * Deplacement d'un corps depuis sa position de REPOS.
   *
   * Les positions extraites sont celles de la scene a l'arret ; les corps
   * orbitent. Comparer un point du moment a une position de repos derive donc
   * de tout le chemin parcouru — pour Timber Hearth, les six cents unites du
   * volume de referentiel sont avalees en une douzaine de secondes, et le
   * volume cesse de contenir sa propre planete. Mesure dans un vrai Chromium,
   * profil rempli : `__lots.etat.referentiel` valait `null` a la surface.
   *
   * L'objet extrait porte desormais le NOM de son corps porteur, ce qui rend
   * la correction possible : elle n'existait pas avant que l'extracteur emette
   * `body` (docs/46).
   */
  const corpsParNom = new Map();
  function decalageDuCorps(bodyName, framePos) {
    if (!bodyName) return null;
    // Le vaisseau n'est pas un corps du systeme : il n'a ni orbite ni entree
    // dans `bodies`, et il se deplace bien plus que les planetes. Ce qu'il
    // porte — le paquetage de la cabine, les commandes, la trappe — se ramene
    // donc a SA position du moment, lue sur le corps simule.
    if (bodyName === "Ship_Body") {
      if (!ship || !shipRest) return null;
      return [ship.pos.x + framePos[0] - shipRest[0],
              ship.pos.y + framePos[1] - shipRest[1],
              ship.pos.z + framePos[2] - shipRest[2]];
    }
    if (!corpsParNom.size) {
      for (const b of bodies) if (b.bodyName) corpsParNom.set(b.bodyName, b);
    }
    const b = corpsParNom.get(bodyName);
    if (!b || !b.position0) return null;
    return [b.position[0] + framePos[0] - b.position0[0],
            b.position[1] + framePos[1] - b.position0[1],
            b.position[2] + framePos[2] - b.position0[2]];
  }

  /**
   * Le CENTRE d'un corps, dans la meme convention monde que les zones.
   *
   * Le decalage ci-dessus ramene une position au repos a l'instant present ;
   * applique a `position0`, il rend simplement `position + framePos`. Le jour
   * et la nuit se lisent sur cet axe-la (`DayNightAudioVolume.IsDay`), et sur
   * lui seul : sans le centre de la planete, il n'y a pas de « dessous ».
   */
  function centreDuCorps(bodyName, framePos) {
    if (!bodyName) return null;
    if (!corpsParNom.size) {
      for (const b of bodies) if (b.bodyName) corpsParNom.set(b.bodyName, b);
    }
    const b = corpsParNom.get(bodyName);
    if (!b || !b.position) return null;
    return [b.position[0] + framePos[0], b.position[1] + framePos[1],
            b.position[2] + framePos[2]];
  }

  // Position du vaisseau dans la scene AU REPOS, pour ramener ce qu'il porte.
  const shipRest = ((gameplay.singletons || {}).ShipBody || {}).position || null;
  const shipRestRot = ((gameplay.singletons || {}).ShipBody || {}).rotation || null;

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
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.warn("Contexte WebGL perdu");
  }, false);
  canvas.addEventListener("webglcontextrestored", () => {
    console.warn("Contexte WebGL restaure");
  }, false);
  engine.runRenderLoop(() => {
    // Tant que la partie se charge, c'est l'ecran-titre qu'on voit.
    if (titre && !titre.ecran.fini) return;
    try {
      scene.render();
    } catch (e) {
      console.warn("Erreur render loop interceptee :", e);
    }
  });

  // --- geometrie reelle et physique ---
  const dialogue = new DialogueSystem(await loadDialogue());
  const pdata = new PlayerData();
  // `TriggerLoad(newSave, skipIntro)` : New Expedition et Skip Intro repartent
  // d'une sauvegarde neuve ; Resume Expedition garde celle du disque.
  if (titre && titre.choix.newSave) {
    pdata.nouvelleSauvegarde(titre.choix.skipIntro, SKIP_INTRO_FLAGS);
  }
  window.__pdata = pdata;
  window.__dialogue = dialogue;
  // §V La boucle qui commence est la suivante : `OnStartOfTimeLoop` la recoit
  // deja incrementee dans le build. Au tout premier demarrage, `loopCount`
  // vaut zero et la boucle qui s'ouvre est donc la premiere.
  pdata.startOfTimeLoop(pdata.loopCount + 1);
  resources.invulnerable = pdata.isInvulnerable;
  if (resources.invulnerable) {
    console.log("premier tour : les degats ne portent pas tant qu'on n'a pas "
      + "les codes, et jusqu'a ce qu'on monte dans le vaisseau");
  }

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
  // Dix-sept zones d'ambiance : ce ne sont pas des sources de plus, ce sont des
  // couches qui s'arbitrent par priorite (web/src/ambience.js).
  const ambience = new AmbienceMixer(
    ambienceZones({ volumes: await loadAmbience() }, entrywayTriggers(gameplay)));
  window.__ambience = ambience;

  const particleMap = await loadParticleMap();
  const particles = new ParticleField(BABYLON, scene, particleMap);
  // Les eruptions en cours (`MeteorLauncher`), et l'etat de l'explosion du
  // vaisseau : ce qui joue des particules sur evenement.
  let eruptions = [];
  let navireExplose = false;

  // --- ce que le build portait et que rien ne lisait ---
  //
  // Cinq familles de donnees deja extraites, restees sans lecteur : les
  // lumieres posees, les reglages de rendu, les champs de force directionnels,
  // les volumes de fluide et les zones d'oxygene. Voir docs/34-actions.md.
  const lighting = await loadLighting();
  // Le cookie des spots d'Unity, avant que le premier spot ne compile.
  patchCookieUnity(BABYLON, lighting.cookieSpot);
  // Le ciel du build : la voute tourne vers l'etoile, et c'est elle qui
  // fait le jour et la nuit (docs/41-ciel.md).
  const skyData = await loadSky();
  const sky = new Sky(skyData);
  // Le champ d'etoiles : mille points sur une coquille de 30 000 unites, colles
  // sur la camera, et qui s'eteignent un a un pendant que la boucle passe.
  const starField = new StarField(skyData);
  let starPCS = null, starFlash = [];
  if (starField.ready) {
    // Un nuage de points plutot qu'un systeme de particules : les etoiles ne
    // naissent ni ne meurent — le build MET SON SYSTEME EN PAUSE des la
    // premiere image — et un nuage se met a jour par indice, ce dont
    // l'extinction a besoin. Chaque point est un sprite a la taille MONDE du
    // build, texture comprise (etoiles.js).
    const sys = particleMap.find((s) => s.name === "DistantStars");
    starPCS = champEtoiles(BABYLON, scene, starField,
      sys && sys.texture ? `data/particles/${sys.texture}` : null);
    console.log(`ciel : ${starField.count} etoiles`);
  }
  // La voute de fond : `PlainStarscape_BiggerStars`, le materiau `Skybox` du
  // `RenderSettings` de `level0`. Elle porte les etoiles fines qu'on voit
  // derriere tout le reste ; le portage effacait l'ecran d'un bleu nuit de sa
  // facon (docs/132). Un demi-tour sur Y, comme la geometrie (geometry.js) :
  // le monde du portage est celui d'Unity tourne de 180 degres.
  let voute = null;
  try {
    voute = skyData && creerVoute(BABYLON, scene, skyData.skybox, "data/sky/",
                                  camera.maxZ);
    if (voute) voute.rotation.y = Math.PI;
  } catch (e) {
    console.warn("voute indisponible :", e.message);
  }
  window.__sky = sky;
  window.__voute = voute;
  // 44 surfaces defilantes que rien ne lisait (docs/42-lumieres.md).
  const scrollers = new TextureScrollers(await loadTextureAnimators());
  window.__texanim = scrollers;
  // Le sable des jumelles : deux spheres qu'on met a l'echelle et un entonnoir,
  // menes par la minute de boucle. Rien de tout cela n'etait lu
  // (docs/45-recensement-mesure.md).
  // Le seul `Surface` du build qui declare ecraser est le collider de
  // `RisingSand` : c'est lui qui porte la mort par compression (docs/53).
  const sand = new SandLevels(markCrushing(sandColumns(gameplay), gameplay),
                              sandFunnels(gameplay));
  window.__sand = sand;
  // Six volumes de destruction et dix-huit de reparation, poses dans la scene
  // et jamais lus : c'est le jeu qui dit ou l'on meurt, pas un seuil du portage.
  const destructions = destructionVolumes(gameplay);
  const repairs = repairVolumes(gameplay).map((v) => new Repair(v));
  // Quinze des dix-huit sont les avaries du VAISSEAU ; les trois autres sont
  // les noeuds du satellite casse, et c'est l'entrainement en apesanteur. Le
  // corps porteur les separe (docs/46, lot 7) — avant, la reparation du
  // vaisseau piochait indifferemment dans les dix-huit.
  const shipRepairs = repairs.filter((r) => r.volume.body === "Ship_Body");
  window.__volumes = { destructions, repairs };
  // --- ce que docs/44-reste-a-migrer.md listait, lot par lot ---
  //
  // Six familles de plus, lues dans le build et branchees ici. Aucune n'ajoute
  // de donnee : toutes etaient DANS `level0` depuis le premier jour, sans
  // lecteur (docs/46-migration-lots.md).
  //
  // §1 les referentiels DECLARES : quatorze volumes disent a quel corps on se
  // rapporte, la ou le portage le deduisait de la gravite dominante.
  const declared = new DeclaredFrames(referenceFrames(gameplay));
  // §3 la vie du decor : quinze panneaux, huit visages, six passages anciens.
  const decor = new DecorField(billboards(gameplay), talkingFaces(gameplay));
  // Les six pivots de tornade : une culbute de 1 a 2 degres par seconde, tiree
  // au reveil comme dans le build — six tornades qui penchent toutes pareil se
  // verraient. Ce qui TOURNE, la colonne d'air, est lu depuis docs/39.
  const tornades = new TornadoPivots(tornadoPivots(gameplay));
  // Les trois suiveurs, et les dix-huit conteneurs d'editeur qu'on ne porte
  // pas : comptes ici pour que la question ne se repose plus (docs/49).
  const suiveurs = matchTransforms(gameplay);
  const conteneurs = disposableContainers(gameplay);
  window.__queue = { tornades, suiveurs, conteneurs };
  // On allume en REGARDANT (docs/50-regard.md) : trois secondes de regard fixe,
  // a moins de quatre unites et dix degres, et la porte d'energie s'efface.
  const regards = gazeSwitches(gameplay).map((d) => new GazeSwitch(d));
  // §M LA TOILE. `GazeWebAnimator` fait tourner deux anneaux en sens INVERSE,
  // au cube des fractions : la toile s'anime a mesure qu'on la fixe, et
  // s'efface en deux secondes une fois la charge pleine. Le portage avait la
  // loi, ecrite et eprouvee (docs/50) — et il ne faisait tourner personne.
  const toiles = webAnimators(gameplay);

  // §N LES COQUILLES SONORES. Deux dans le build, concentriques sur Giant's
  // Deep : l'ocean a 498 unites, la membrane corrosive a 205. Chacune etouffe
  // la source posee sur le MEME objet — `GetComponent`, pas une recherche — et
  // c'est la position qui les apparie ici, faute d'un autre lien.
  const coquilles = audioMap.length
    ? new AudioShells(audioShells(gameplay), audioMap) : null;
  if (coquilles) {
    console.log(`${coquilles.count} coquilles sonores, `
      + `${coquilles.paired} appariees a leur source`);
  }
  window.__coquilles = coquilles;

  // §M LA TEMPETE DE SABLE. `SandstormVolume` n'a pas de collider a lui : sa
  // forme est celle de ses ENFANTS — quatre capsules qui se chevauchent le long
  // de l'entonnoir de sable entre les jumelles. C'est exactement ce pour quoi
  // `CompoundTriggerVolume` existe : quatre formes, UNE entree, UNE sortie.
  //
  // `ScreenEffectController` joue ses particules tant que le compte est
  // positif ; le portage n'avait ni le compte ni les particules.
  const tempetes = sandstormVolumes(gameplay);
  const tempete = new Sandstorm(tempetes,
    tempetes.length ? childTriggers(gameplay, tempetes[0].body) : []);
  window.__tempete = tempete;
  let psSable = null;
  function systemeSable() {
    if (psSable !== null) return psSable;
    try {
      const ps = new BABYLON.ParticleSystem("sandstorm", 600, scene);
      const t = new BABYLON.DynamicTexture("sandTex", 8, scene, false);
      const c2 = t.getContext();
      c2.fillStyle = "#d9b477";
      c2.beginPath(); c2.arc(4, 4, 3, 0, 6.284); c2.fill();
      t.update();
      ps.particleTexture = t;
      ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
      ps.emitter = camera;
      ps.minEmitBox = new BABYLON.Vector3(-8, -8, -8);
      ps.maxEmitBox = new BABYLON.Vector3(8, 8, 8);
      ps.minLifeTime = 0.4; ps.maxLifeTime = 1.2;
      ps.minSize = 0.05; ps.maxSize = 0.25;
      ps.minEmitPower = 4; ps.maxEmitPower = 14;
      ps.color1 = new BABYLON.Color4(0.85, 0.72, 0.47, 0.5);
      ps.color2 = new BABYLON.Color4(0.72, 0.6, 0.4, 0.35);
      ps.colorDead = new BABYLON.Color4(0.7, 0.6, 0.4, 0);
      ps.emitRate = 0;
      ps.start();
      psSable = ps;
    } catch (e) { psSable = false; }
    return psSable;
  }

  // §M LA POUSSIERE DE VITESSE, et son rendu.
  //
  // `MotionDust` est un systeme de particules pose SUR la camera : il ne seme
  // rien sous trente unites par seconde, et au-dela le debit monte pendant que
  // la duree de vie diminue. Les traits sont alignes sur le deplacement — le
  // build fait un `LookAt` sur la direction du mouvement.
  //
  // La texture est fabriquee ici plutot que lue dans `data/` : ce lot ne
  // dispose pas de celle du build, et un point blanc etire suffit a porter la
  // loi, qui est une loi de DEBIT et de DUREE, pas de dessin.
  let poussiere = { emitting: false };
  let psPoussiere = null;
  function systemePoussiere() {
    if (psPoussiere !== null) return psPoussiere;
    try {
      const ps = new BABYLON.ParticleSystem("motionDust", 400, scene);
      const dt2 = new BABYLON.DynamicTexture("dustTex", 8, scene, false);
      const ctx = dt2.getContext();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(3, 0, 2, 8);
      dt2.update();
      ps.particleTexture = dt2;
      ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
      ps.emitter = camera;
      // Une boite autour du joueur : le build seme dans un volume qui suit la
      // camera, et non depuis un point.
      ps.minEmitBox = new BABYLON.Vector3(-20, -20, -20);
      ps.maxEmitBox = new BABYLON.Vector3(20, 20, 20);
      ps.start();
      psPoussiere = ps;
    } catch (e) {
      psPoussiere = false;   // pas de particules : on n'y revient pas
    }
    return psPoussiere;
  }
  const portes = energyGates(gameplay).map((d) => new EnergyGate(d));
  window.__regard = { regards, portes, toiles };
  // La tour de lancement : le terminal refuse tant qu'on ne sait pas les
  // codes, puis l'ascenseur monte de 31,5 unites en cinq secondes
  // (docs/51-tour.md).
  // `LaunchElevatorController.Start` ferme les commandes de la cabine — une
  // ligne, et c'est elle qui fait que la tour n'est pas ouverte d'emblee. Le
  // constructeur du portage naissait deja verrouille ; on le dit quand meme,
  // parce que c'est le build qui le decide et non le portage.
  const ascenseurs = elevators(gameplay).map((d) => {
    const a = new Elevator(d);
    a.deactivateControls();
    return a;
  });
  const terminal = new LaunchTerminal();
  // La borne de lancement et le declencheur d'en haut : sans eux, les commandes
  // de la cabine ne s'ouvrent jamais (docs/92-tour.md).
  const bornesTour = launchTerminals(gameplay);
  const declencheursTour = elevatorControllers(gameplay);
  const capteursPad = landingPadSensors(gameplay);
  const museeEntrees = museumEntryways(gameplay);
  window.__tour = { ascenseurs, terminal, bornesTour, declencheursTour,
                    capteursPad, museeEntrees };
  // Le casque qui traine derriere le regard, l'alarme a trente pour cent, les
  // voyants qui clignotent, les notifications qui s'effacent, et les huit
  // invites de la guimauve (docs/52-casque.md).
  const casque = new Helmet(helmetSettings(gameplay).lag);
  const alarme = new MasterAlarm();
  const voyants = new DamageDisplay();
  const notifications = new Notifications();
  const invitesGuimauve = roastPrompts(gameplay);
  // Chacune tient son etat : appuyer une fois sort le baton, s'eloigner le range.
  const invitesRoast = invitesGuimauve.map((d) => ({ data: d, etat: new RoastPrompt(d) }));
  // §Q La zone de proximite du vaisseau : treize unites, et les voyants
  // d'avarie ne parlent que dedans.
  const zonesVaisseau = shipProximity(gameplay);
  let presDuVaisseau = true;
  window.__proximite = { zones: zonesVaisseau, get pres() { return presDuVaisseau; } };
  // Une seule annonce par eloignement, pas une par image.
  let grillageRompu = false;
  // Les six buses du vaisseau miniature : homonymes, donc pilotees par POSITION.
  const busesModele = modelShipNozzles(gameplay);

  // §S LE VAISSEAU MINIATURE VOLE. Ce n'est pas un decor : c'est un petit jeu
  // complet, avec sa console, ses trois pistes, son seuil de crash et quelqu'un
  // qui commente. Le portage le laissait pose (docs/78-modele.md).
  const modele = modelShipBody(gameplay);
  const pistesModele = modelLandingSpots(gameplay).map((d) => ({
    data: d, etat: new ModelLandingSpot(),
  }));
  const enfant = rocketKids(gameplay)[0] || null;
  const compteurEnfant = new RocketKid();
  const cfgModele = poussesModele(gameplay);
  const detModele = detecteurModele(gameplay);
  // Ce que la souris a donne au modele depuis la derniere image : `ShipInput`
  // lit `Pitch` et `Yaw` — l'axe du roulis est celui du lacet — et la
  // console garde le regard verrouille sur le modele.
  const sourisModele = { dx: 0, dy: 0 };
  if (modele) {
    modele.pos = modele.position.slice();
    modele.vel = [0, 0, 0];
    // L'orientation de repos est celle de `RocketSpawn`, la pose du modele
    // dans la scene : `RespawnModelShip` la rend a chaque remise en place.
    modele.quat = (modele.rotation || [0, 0, 0, 1]).slice();
    modele.reposQuat = modele.quat.slice();
    modele.omega = [0, 0, 0];
    modele.pose = true;
    modele.repos = modele.position.slice();
    modele.node = undefined;
  }
  // LE MODELE VIT DANS LE REPERE DE TRAVAIL, comme le joueur. Sa position etait
  // tenue en coordonnees « monde » de repos, sans suivre Timber Hearth : pose,
  // il derivait a la vitesse orbitale de la planete (11 a 35 u/s mesures), et
  // les rayons du sol partaient d'ailleurs. Son socle est ou le corps porteur
  // l'a mene — le decalage de ce corps depuis la scene, ramene au repere.
  const porteurModele = (modele && corpsDuSysteme(modele.body)) ? modele.body
    : ((pistesModele[0] && pistesModele[0].data.body) || "TimberHearth_Body");
  function reposModeleCadre(origine) {
    const dec = decalageDuCorps(porteurModele, origine) || [0, 0, 0];
    return modele.repos.map((x, i) => x + dec[i] - origine[i]);
  }
  function corpsDuSysteme(nom) { return !!nom && bodies.some((b) => b.bodyName === nom); }
  window.__modele = { vaisseau: modele, pistes: pistesModele,
                      enfant: compteurEnfant, arbres: enfant };
  window.__casque = { casque, alarme, voyants, notifications, invitesGuimauve };
  // Ce que le joueur porte en plus de son corps (docs/53-joueur.md) : l'etat,
  // le bruit qu'il fait, et le capteur qui le tue s'il reste coince.
  const etatJoueur = new PlayerState();
  const compression = new CompressionSensor();
  let dernierLancement = -100;      // `_initLaunchTime`, du constructeur
  window.__joueur = { etatJoueur, compression, portee: INTERACT_RANGE };
  const decalNames = new Set([
    ...((gameplay.placed || {}).DS_DecalsMeshRenderer || []).map((c) => c.name),
    ...((gameplay.placed || {}).DS_Decals || []).map((c) => c.name)]);
  const nozzles = thrusterNozzles(gameplay);
  // Les dix-huit bouffees d'etincelles, et ce que la mesure en dit.
  //
  // `RandomParticleBursts` tire un delai entre une et trois secondes et appelle
  // `Play()` a chaque echeance. Mais son `Awake` pose d'abord
  // `particleSystem.loop = _looping` — et `_looping` vaut VRAI sur les dix-huit
  // instances. Un systeme qui boucle joue en continu : le tirage n'a donc
  // aucun effet visible dans l'alpha, et le porter serait porter du bruit.
  //
  // La mecanique est ecrite quand meme, et filtre sur le drapeau : la liste est
  // vide ici, et elle le dit (docs/46, lot 3).
  const bursts = particleBursts(gameplay).filter((b) => !b.looping)
    .map((b) => ({ b, t: new RandomTimer(b.min, b.max) }));
  const passages = new Teleporters(teleporters(gameplay));
  // §N LES TROIS PASSAGES DE DARK BRAMBLE. Un raccourci depuis Timber Hearth,
  // une porte vers l'epave, et un BORD pour en sortir : la dimension de l'epave
  // n'a pas de porte de sortie, on la quitte en sortant de sa sphere.
  const epaves = new DerelictWarps(warps(gameplay));
  window.__epaves = epaves;
  // §4 les volumes de jeu : ce qui blesse, ce qui fait flotter, ce qui limite.
  const hazards = new Hazards(hazardVolumes(gameplay));
  const zeroGVolumes = zeroGFields(gameplay);
  // La chambre en apesanteur du village n'a pas de forme : elle a une porte.
  const presencesZeroG = zeroGVolumes.map((z) => new ZonePresence(z));
  // Les secteurs MAJEURS, avec leur declencheur : c'est eux que la minicarte
  // interroge, et eux seuls qui repondent a `GetUseMinimap`.
  const majSecteurs = majorSectors(gameplay);
  // Les zones sans soleil et leurs portes : `DarkZone` n'etait pas elles.
  const zonesSansSoleil = new EffectZones(sunlessZones(gameplay));
  // Et la zone sombre, qui est un SEUIL elle aussi : le portage la testait par
  // contenance, et l'invite de lampe clignotait le temps de l'embrasure.
  const zonesSombres = new EffectZones(darkZones(gameplay),
                                       ["EnterDarkZone", "ExitDarkZone"]);
  // Le secteur majeur actif de l'image courante, pour les controles navigateur.
  let secteurMajeur = null;
  // §7 l'equipement se RAMASSE : le portage le donnait d'emblee.
  const pickups = gearPickups(gameplay);
  const suits = suitVolumes(gameplay);
  const equipment = new Equipment();
  const training = new ZeroGTraining(repairs);
  // §5 le son d'evenement : marcher, pousser, voyager, finir.
  const events = eventAudio(await loadEventAudio());
  // §R LES HUIT SONS D'INTERFACE. Le portage n'en jouait aucun : avancer un
  // dialogue, le finir, viser un referentiel, le relacher, allumer sa lampe —
  // tout cela se faisait en silence (docs/77-sons.md).
  const sonsUI = new UISounds(events);
  window.__sonsUI = sonsUI;
  /** Joue un son d'interface s'il existe. */
  function bipUI(nom) {
    const s = sonsUI.fire(nom);
    if (s) audio.playOneShot(s.file, { volume: s.volume });
    return !!s;
  }
  const footsteps = new Footsteps();
  const turbulence = new Turbulence();
  const thrusterSound = new ThrusterSound();
  const travelMusic = new TravelMusic();
  const souffleCasque = new SuitAmbience();
  const endMusic = new EndOfTimeMusic();
  const turbShip = shipTurbulence(events);
  let shipWindLevel = 0;
  let shipRattleLevel = 0;
  let dbMusicLevel = 0;
  let supernovaCollapsePlayed = false;
  let supernovaExplosionPlayed = false;
  // --- ce qui suit un autre corps, et ce qui clignote (docs/55, cable en 68) ---
  const alignes = alignedBodies(gameplay);
  const heritiers = fieldInheritors(gameplay);
  const clignotants = blinkingRenderers(gameplay).map((d) => ({
    data: d, blinker: new Blinker(d), node: null,
  }));
  const noeudsCasses = brokenNodes(gameplay);
  const remous = waterEffects(gameplay);
  // La trappe : une seule dans le build, sur « HatchControls ». Elle s'ouvre a
  // l'appui et se referme toute seule QUAND ON EST ENTRE (docs/116-trappe.md).
  const trappeData = hatchControllers(gameplay);
  const trappe = new Hatch(trappeData[0] || {});
  let noeudTrappeOn = true;     // etat pose sur le collider, pour n'y toucher
  let trappeSansNoeud = false;  // qu'aux transitions
  console.log(`attaches : ${alignes.length} alignements, ${heritiers.length} heritiers,`
    + ` ${clignotants.length} clignotants, ${noeudsCasses.length} noeuds casses,`
    + ` ${remous.length} volumes d'eclaboussure`);
  window.__attaches = { alignes, heritiers, clignotants, noeudsCasses, remous,
                        trappe };

  // Les meteores de Brittle Hollow : quatre lanceurs, un tir toutes les cinq a
  // vingt secondes, cinquante de degats au contact (docs/68-lois.md).
  const meteores = new MeteorLaunchers(meteorLaunchers(gameplay));
  const meteorMat = new BABYLON.StandardMaterial("meteorMat", scene);
  meteorMat.emissiveColor = new BABYLON.Color3(1, 0.45, 0.12);
  meteorMat.disableLighting = true;
  const meteorMeshes = [];
  console.log(`meteores : ${meteores.launchers.length} lanceurs`);
  window.__meteores = meteores;

  window.__lots = { declared, decor, passages, hazards, zeroGVolumes,
                    majSecteurs, zonesSansSoleil, zonesSombres,
                    presencesZeroG, pickups, suits, equipment, training, events,
                    // `champsParSeuils` est declare plus BAS : un getter evite
                    // la zone morte temporelle, le piege recurrent de ce
                    // fichier (docs/85-chambre.md).
                    get champsParSeuils() { return champsParSeuils; },
                    get etat() {
                      return { referentiel: declared.current && declared.current.body,
                               secteurMajeur: secteurMajeur && secteurMajeur.name,
                               secteurAmbiant: secteurMajeur ? secteurMajeur.ambient : null,
                               sansSoleil: zonesSansSoleil.count,
                               minicarteDuSecteur: !!(secteurMajeur &&
                                                      secteurMajeur.useMinimap),
                               equipement: { combinaison: equipment.suit,
                                             sonde: equipment.probe,
                                             minicarte: equipment.minimap },
                               entrainement: `${training.repaired}/${training.total}` };
                    } };
  console.log(`lots : ${declared.count} referentiels declares, ` +
    `${decor.total} decors vivants, ${passages.count} passages, ` +
    `${hazards.count} volumes qui blessent, ${pickups.length} objets a ramasser, ` +
    `${events.count} emetteurs de son d'evenement`);

  // `SunLight` est le soleil du build : une ponctuelle de portee 20 000 posee
  // sur l'etoile. Le portage le tient par sa lumiere `sun`, qu'il deplace avec
  // l'etoile ; le garder aussi parmi les lumieres posees compterait le soleil
  // deux fois. `sun` en prend la portee, la force, la couleur et le MASQUE : le
  // calque `IgnoreSun` reste dans l'ombre (docs/132).
  const soleilDuBuild = (lighting.lights || []).find((l) => l.name === "SunLight");
  if (soleilDuBuild) {
    sun.includeOnlyWithLayerMask = layerMaskFor(soleilDuBuild.cullingMask);
    if (soleilDuBuild.range > 0) sun.range = soleilDuBuild.range;
    if (typeof soleilDuBuild.intensity === "number") sun.intensity = soleilDuBuild.intensity;
    if (soleilDuBuild.color) sun.diffuse = new BABYLON.Color3(...soleilDuBuild.color.slice(0, 3));
  }
  // Les spots de l'imposteur ne passent pas par le budget de `LightField`,
  // qui ne garde que les lumieres proches du joueur : ils sont a cinq cents
  // unites, et ils eclairent toute la planete (imposteur.js).
  const imposteurs = imposteursDuBuild(lighting.lights);
  const placedLights = new LightField(BABYLON, scene,
    (lighting.lights || []).filter((l) => l !== soleilDuBuild && !imposteurs.includes(l)));
  // Le pas du spot ombre de l'imposteur, en unites : 0,06 degre vu du centre,
  // soit un trentieme de seconde de la course de l'etoile.
  const PAS_OMBRE_IMPOSTEUR = 0.5;
  const spotsImposteurs = new Map();
  for (const l of imposteurs) {
    const node = placedLights.createNode(l);
    if (!node) continue;
    node.includeOnlyWithLayerMask = layerMaskFor(l.cullingMask);
    // Le Deferred Lighting d'Unity rend TOUTES les lumieres ; un materiau de
    // Babylon n'en prend que sept, les premieres par `renderPriority`. Le
    // soleil de substitution passait onzieme sur le terminal de lancement, et
    // midi restait la nuit (docs/132) : il passe devant.
    node.renderPriority = 3;
    node.setEnabled(false);
    spotsImposteurs.set(`${l.body}/${l.name}`, { l, node, groupe: null });
  }
  // La couronne de Timber Hearth : huit spots sans ombre, qui ne tiennent pas
  // dans le budget d'un materiau (`lightCap` : dix sous SwiftShader, huit sous
  // ANGLE) a cote du spot central, du feu et de l'ambiance. L'eclairage
  // « clusterise » de Babylon les range dans UNE lumiere, et passe par le meme
  // `computeSpotLighting` — donc par l'attenuation d'Unity. Sans son support
  // (flottants de rendu absents), les spots restent separes et le budget
  // garde les plus prioritaires.
  if (BABYLON.ClusteredLightContainer) {
    const parCorps = new Map();
    for (const e of spotsImposteurs.values()) {
      if (e.l.shadows > 0) continue;
      if (!parCorps.has(e.l.body)) parCorps.set(e.l.body, []);
      parCorps.get(e.l.body).push(e);
    }
    for (const [corps, liste] of parCorps) {
      if (liste.length < 2) continue;
      try {
        for (const e of liste) e.node.setEnabled(true);
        if (!liste.every((e) => BABYLON.ClusteredLightContainer.IsLightSupported(e.node))) {
          for (const e of liste) e.node.setEnabled(false);
          continue;
        }
        const c = new BABYLON.ClusteredLightContainer(`couronne_${corps}`,
          liste.map((e) => e.node), scene);
        c.includeOnlyWithLayerMask = layerMaskFor(liste[0].l.cullingMask);
        c.renderPriority = 3;
        c.setEnabled(false);
        for (const e of liste) e.groupe = c;
      } catch (err) {
        console.warn("couronne de l'imposteur :", err && err.message);
      }
    }
  }
  // L'alarme generale nait ETEINTE : `MasterAlarm` n'appelle `PulsingLight
  // .Enable` que sous trente pour cent de coque, et une lumiere que rien n'a
  // allumee ne bat pas (docs/116-trappe.md).
  placedLights.allume("MasterAlarm", false);
  // 34 DirectionalForceField contre 10 GravityWell : ce sont les gravites
  // locales, et elles ne s'ajoutent pas au champ radial — elles le remplacent
  // dans leur volume, comme SingleFieldDetector le veut.
  const dirFields = directionalFields(gameplay);
  // Le seul champ directionnel commande par des SEUILS : la station meteo de
  // Brittle Hollow. Il n'a pas de collider, et le portage l'ecartait donc.
  //
  // On lui greffe ses portes SUR PLACE : `attachEntryways` rend des copies, et
  // c'est l'objet de `dirFields` que `strongestDirectional` lira.
  const champsParSeuils = [];
  for (const f of dirFields) {
    if (!f.byEntryways) continue;
    f.entryways = attachEntryways([f], entrywayTriggers(gameplay))[0].entryways;
    champsParSeuils.push(new ZonePresence(f));
  }
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
  // §P LA CHALEUR DES FEUX DE CAMP. `heatSources` cherchait des classes dont le
  // NOM contient « heat », et il n'y en a aucune dans ce build : la liste etait
  // VIDE, et la guimauve ne chauffait jamais (docs/75-chaleur.md).
  //
  // La chaleur est ailleurs, et nommee : huit `RadiationEmitter` de type 1,
  // magnitude 100, avec une courbe qui tient jusqu'a dix unites et tombe a zero
  // a quarante-cinq.
  // §P Les quatre invites de sonde et l'invite de lunette, avec leur regard.
  let invitesSonde = probePrompts(gameplay);
  let inviteSondeVisible = false;
  // `DestroyAllProbePromptTriggers` : une fois lancee depuis une invite, les
  // quatre disparaissent pour de bon. Le tutoriel ne se rejoue pas.
  let invitesDetruites = false;
  window.__invites = { sonde: invitesSonde, detruites: false };
  // §P LA SONDE ANCIENNE. Une seule instance, et son `FixedUpdate` tient en une
  // ligne : `AddLocalAcceleration(forward * 50)`. Elle ne vise rien, ne
  // s'arrete pas, et n'a pas de carburant — elle part, et c'est tout.
  //
  // Elle est posee pres de Giant's Deep, tournee vers l'exterieur du systeme.
  const sondeAncienne = ((gameplay.placed || {}).AncientProbeController || [])[0]
    ? (() => {
        const c = gameplay.placed.AncientProbeController[0];
        return { name: c.name, pos: c.position.slice(),
                 rotation: c.rotation || [0, 0, 0, 1],
                 vel: [0, 0, 0], node: undefined };
      })()
    : null;
  window.__sondeAncienne = sondeAncienne;
  const heat = radiationEmitters(gameplay);
  console.log(`${heat.filter((e) => e.type === 1).length} sources de chaleur (feux de camp)`);
  // Sonde de verification : la chaleur EXISTE, et sur un feu elle vaut cent.
  window.__chaleur = { sources: heat,
                       sur: heat.length ? heatAt(heat, heat[0].position) : 0 };
  const controllers = convoControllers(gameplay);
  window.__world = { lighting: placedLights, dirFields, polFields, fluids, oxygen,
                     heat, controllers };
  console.log(`monde : ${(lighting.lights || []).length} lumieres, ` +
    `${dirFields.length} champs directionnels, ${polFields.length} champs polaires, ` +
    `${fluids.count} fluides, ` +
    `${oxygen.length} zones d'oxygene, ${heat.filter(e => e.type === 1).length} sources de chaleur`);

  // Les impostures de planete (docs/56-impostures.md). Les trois plans cables
  // sont dans la geometrie et leur renderer est ACTIF : sans ce lecteur, le
  // portage colle trois quads plats par-dessus les vraies planetes.
  //
  // Elles se declarent ICI, avant le magasin de geometrie, et pas ou elles se
  // lisent : le rappel de chargement les nomme, et il s'execute des le premier
  // glTF — bien avant la ligne qui les creait cinq cents lignes plus bas. Le
  // `const` etait donc dans sa zone morte, et CHAQUE lot de geometrie mourait
  // sur `Cannot access 'impostures' before initialization`, en silence : le
  // magasin attrape l'erreur et se contente d'un « glTF absent ou illisible ».
  // Les shaders du jeu, le rattachement de la voute et celui du decor vivant ne
  // s'appliquaient donc JAMAIS. Deux controles de `15_verify.py` le disaient —
  // « affectations de shaders 0 », « decors vivants rattaches 0 » — et personne
  // n'avait relie les deux zeros a la ligne d'avertissement qui les precede.
  const impostures = planetImposters(camerasDuBuild).map((d) => new Imposter(d));
  const impostersVifs = [];      // { imposture, plan, texture, cam }
  window.__impostures = { impostures, vifs: impostersVifs };

  // Geometrie a la demande. Seuls le corps de depart et le soleil sont
  // telecharges avant la premiere image ; les autres arrivent quand on s'en
  // approche (voir sectors.js). Un corps pas encore la montre sa sphere de
  // substitution, exactement comme un corps sans geometrie exportee.
  let shaderCounts = {};
  // `SunlightSwapper` : l'echange de calques de Timber Hearth et de Brittle
  // Hollow, et les spots de leur soleil de substitution (imposteur.js).
  const echanges = new Map([...new Set(imposteurs.map((l) => l.body))]
    .map((c) => [c, new EchangeSoleil(c)]));
  window.__imposteur = { echanges, ombres: new Map() };
  const store = new GeometryStore(BABYLON, scene, (entry) => {
    // `GetComponentsInChildren<Transform>` : ce qui est SOUS le corps, et pas
    // son voisin de lot (Attlerock partage le fichier de Timber Hearth).
    for (const [corps, ech] of echanges) {
      const racine = (entry.meshes || []).map((m) => m.parent).concat(entry.root ? [entry.root] : [])
        .flatMap((n) => { const out = []; for (let x = n; x; x = x.parent) out.push(x); return out; })
        .find((n) => n && n.name === corps);
      const noeud = racine || scene.getTransformNodeByName(corps) || scene.getMeshByName(corps);
      if (!noeud) continue;
      const sous = (entry.meshes || []).filter((m) => m !== noeud && m.isDescendantOf && m.isDescendantOf(noeud));
      if (sous.length) ech.ajouter(sous);
    }
    // tout ce qui, avant, se faisait une fois pour toutes au demarrage
    const counts = applyGameShaders(BABYLON, scene, entry.meshes);
    for (const [k, v] of Object.entries(counts)) {
      shaderCounts[k] = (shaderCounts[k] || 0) + v;
    }
    syncGeometry([entry], origin);
    if (sky.attach(entry.meshes)) {
      // Le repere du parent se relit a chaque image (plus bas) : le conteneur
      // se retourne apres le rattachement, et le corps tourne sur lui-meme.
      sky.readBasis(sky.shell, BABYLON);
      if (sky.shell) sky.shell.isPickable = false;
      console.log(`ciel : voute rattachee`);
    }
    // Les trois plans d'imposture : on les rattache par nom, et on leur donne
    // une VRAIE texture de rendu plutot que le `*LODMaterial` de remplissage
    // que le glTF leur a laisse.
    for (const imp of impostures) {
      if (!imp.data.wired || impostersVifs.some((v) => v.imposture === imp)) continue;
      const plan = entry.meshes.find((m) => m.name === imp.data.plane);
      if (!plan) continue;
      // Une camera par imposture, qui ne rend QUE sur commande : c'est ce que
      // fait `Awake` en eteignant la sienne.
      const cam = new BABYLON.FreeCamera(`imposteur_${imp.data.plane}`,
                                         BABYLON.Vector3.Zero(), scene);
      cam.minZ = 1;
      cam.maxZ = 200000;
      cam.fov = 60 * Math.PI / 180;
      const texture = new BABYLON.RenderTargetTexture(`imposteur_${imp.data.plane}`,
        IMPOSTER_SIZE, scene, false);
      // `refreshRate = 0` : Babylon ne rafraichit plus tout seul, et c'est nous
      // qui declenchons — une fois par seconde, comme `_snapshotInterval`.
      texture.refreshRate = 0;
      texture.activeCamera = cam;
      scene.customRenderTargets.push(texture);
      if (plan.material) {
        const m = plan.material.clone(`${plan.material.name}_imposteur`);
        if (m) {
          m.diffuseTexture = texture;
          if ("emissiveTexture" in m) m.emissiveTexture = texture;
          plan.material = m;
        }
      }
      impostersVifs.push({ imposture: imp, plan, texture, cam });
      console.log(`imposture : ${imp.data.plane} <- ${imp.data.planet}`);
    }

    // Les nuages : dix visages sur vingt-quatre maillages homonymes.
    //
    // `CloudTextureController.Awake` ecrit `renderer.material.mainTexture`, et
    // `renderer.material` — au singulier, pas `sharedMaterial` — INSTANCIE le
    // materiau. Chaque nuage a donc le sien, ce qu'on reproduit en clonant :
    // poser la texture sur le materiau partage les repeindrait tous les 24 de
    // la meme facon, ce qui est exactement le defaut qu'on corrige.
    const nNuages = sky.attachClouds(entry.meshes);
    if (nNuages) {
      let peints = 0;
      for (const { noeud, nuage } of sky.clouds) {
        if (!nuage.image || !noeud.material) continue;
        const mat = noeud.material.clone(`${noeud.material.name}_${nuage.texture}`);
        if (!mat) continue;
        const tex = new BABYLON.Texture(`data/sky/${nuage.image}`, scene);
        tex.hasAlpha = true;
        mat.diffuseTexture = tex;
        if ("albedoTexture" in mat) mat.albedoTexture = tex;
        // Seulement si le materiau en avait une : `SelfIlluminAlpha` est
        // ECLAIRE (shaders/index.js), et une texture emissive sur chaque nuage
        // les faisait briller en pleine nuit (docs/132).
        if (mat.emissiveTexture) mat.emissiveTexture = tex;
        noeud.material = mat;
        peints += 1;
      }
      console.log(`ciel : ${nNuages} nuages rattaches, ${peints} repeints`);
    }
    const nScroll = scrollers.attach(entry.meshes);
    if (nScroll) console.log(`textures defilantes : ${nScroll} rattachees`);
    const nSand = sand.attach(entry.meshes);
    if (nSand) console.log(`sable : ${nSand} colonnes rattachees sur ${sand.total}`);
    // Le decor vivant et les decalcomanies se rattachent au meme moment, et par
    // le meme chemin : ce qui arrive avec la geometrie porte les noms du build.
    const nTornades = tornades.attach(entry.meshes);
    if (nTornades) console.log(`tornades : ${nTornades} pivots sur ${tornades.total}`);
    const nDecor = decor.attach(entry.meshes);
    if (nDecor) console.log(`decor : ${nDecor} panneaux et visages sur ${decor.total}`);
    const nDecals = applyDecals(BABYLON, entry.meshes, decalNames);
    if (nDecals) console.log(`decalcomanies : ${nDecals} maillages poses sur la paroi`);
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
  const fissuresPieces = [];
  {
    const entry = entryForBody(geo, home.name);
    const node = entry ? findBodyNode(entry, "Ship_Body") : null;
    if (node) {
      // Detacher le vaisseau de sa hierarchie parente pour eliminer les rotations heritees
      node.parent = null;
      if (node.getChildMeshes) {
        for (const m of node.getChildMeshes(false)) {
          // Rallumer la coque, pas ce que le build tient eteint.
          m.setEnabled(!underInactive(m));
          m.isVisible = !hiddenMesh(m);
          MeshLOD.pin(m);
        }
      }
      MeshLOD.pin(node);
      // LES FISSURES DE LA COQUE. Chaque piece porte sa decalcomanie
      // (`_damageDecal`, le premier `DS_Decals` sous elle) : `Awake` l'ETEINT,
      // `ApplyDamageForce` la rallume, `OnCompleteRepair` l'eteint. Le portage
      // dessinait les quinze sur un vaisseau intact (docs/132).
      for (const n of node.getDescendants(false)) {
        const e = n.metadata && n.metadata.gltf && n.metadata.gltf.extras;
        if (!e || e.piece == null) continue;
        const pile = [n];
        let fissure = null;
        while (pile.length && !fissure) {
          const x = pile.shift();
          if (x.name === "Decals") fissure = x;
          else pile.unshift(...x.getChildren());
        }
        if (fissure) { fissure.setEnabled(false); fissuresPieces.push({ id: e.piece, noeud: fissure }); }
      }
    }
    const spawnWorld = shipSpawn(gameplay, home.position0);
    if (spawnWorld) {
      const local = [spawnWorld[0] - home.position0[0],
                     spawnWorld[1] - home.position0[1],
                     spawnWorld[2] - home.position0[2]];
      shipStart = local.slice();
      ship = new Ship((gameplay.singletons.ShipThrusterModel || {}).fields || {},
                      node, local,
                      (gameplay.singletons.ShipDamageController || {}).fields || {},
                      // Les quinze pieces, dans le repere du vaisseau : le
                      // build choisit la plus proche du point d'impact, et non
                      // celle que designe une normale.
                      shipComponents(gameplay, shipRest, shipRestRot));
      // Les trois capteurs de pad, en offsets du repere du vaisseau. L'origine
      // est la position de REPOS de `Ship_Body`, pas le point d'apparition :
      // s'en tromper mettait les jambes a 171 unites de la coque.
      if (ship.setPadSensors(capteursPad, shipRest, shipRestRot)) {
        console.log(`vaisseau : ${capteursPad.length} capteurs de pad`);
      }
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

  // §L CE QUI BOUGE QUAND ON NE LE REGARDE PAS (docs/71-quantique.md).
  //
  // La lune quantique n'est pas seule : `QuantumObject` est une classe de base,
  // et le build en pose deux descendances que le portage n'EXTRAYAIT meme pas.
  // Cinq objets sur la lune — trois pins, une cabane, un panneau — et une tete
  // ancienne en vitrine au musee.
  //
  // Les cinq ne sont poses par aucun composant : `MakeChildrenPlanarQuantum`
  // prend ses ENFANTS au reveil et se detruit. Ce que ce composant fait n'est
  // pas dans ses champs, il n'en a aucun.
  const objetsQ = planarQuantumObjects(gameplay).map((d) => new ObjetQuantique(d));
  const statuesQ = quantumStatues(gameplay);
  window.__quantiques = { objets: objetsQ, statues: statuesQ };

  /**
   * Le noeud d'un nom donne le plus proche d'une position.
   *
   * Trois `Pine_Thick` portent le MEME nom sur la lune : `nodes.get(nom)` en
   * rend un, et toujours le meme. C'est la position qui les distingue, comme
   * pour les dix visages de nuage (docs/48) et les six buses du modele reduit.
   *
   * Le repere ANCRE se passe en parametre : il est recalcule a chaque image et
   * n'existe pas ici. Le lire de cette portee-la leve, et une exception dans la
   * boucle de rendu ne se voit pas (docs/71-quantique.md).
   */
  function noeudLePlusProche(entry, nom, monde, anchorPos) {
    if (!entry || !entry.nodes) return null;
    let best = null, bestD = Infinity;
    for (const [n, node] of entry.nodes) {
      if (n !== nom) continue;
      const p = node.getAbsolutePosition
        ? node.getAbsolutePosition() : node.position;
      const d = (p.x + anchorPos[0] - monde[0]) ** 2
              + (p.y + anchorPos[1] - monde[1]) ** 2
              + (p.z + anchorPos[2] - monde[2]) ** 2;
      if (d < bestD) { best = node; bestD = d; }
    }
    return best;
  }

  /**
   * Une place tiree pour un objet quantique de la lune, ou null.
   *
   * Le build tire un point dans un disque de cent unites, le fait TOMBER sur le
   * terrain par un rayon de deux cents, et refuse une pente de plus de
   * quarante-cinq degres. Ce portage n'a pas toujours le terrain de la lune
   * sous la main — elle n'est chargee qu'a portee — et retombe alors sur la
   * SPHERE de rayon egal a la hauteur d'origine de l'objet : sur un corps de
   * vingt unites de rayon, les deux se confondent a un cheveu pres, et la loi
   * de la pente n'a rien a mordre.
   *
   * La condition qui compte, elle, est portee dans les deux cas : une place
   * VISIBLE est refusee.
   */
  /**
   * L'objet est-il dans le tronc de la camera active ?
   *
   * LE PIEGE. `QuantumObject.CheckVisibility` demande a Unity de tester des
   * `Bounds` contre les plans du tronc ; Babylon, lui, ne sait tester que ce
   * qui est CULLABLE — un maillage. Un `TransformNode` n'a pas d'`isInFrustum`,
   * et `camera.isInFrustum(noeud)` leve donc a chaque image. Une exception dans
   * la boucle de rendu ne se voit pas : tout ce qui suit dans l'image ne tourne
   * simplement plus, et le symptome apparait trente controles plus loin, sur un
   * `window.__visee` qui n'a jamais ete pose.
   *
   * `--repli` ne pouvait pas l'attraper : ce code ne tourne qu'avec le build.
   */
  function dansLeChamp(noeud) {
    if (!noeud || !camera.isInFrustum) return false;
    if (typeof noeud.isInFrustum === "function") {
      try { return !!camera.isInFrustum(noeud); } catch (e) { /* pas cullable */ }
    }
    const mailles = noeud.getChildMeshes ? noeud.getChildMeshes(false) : [];
    for (const m of mailles) {
      if (typeof m.isInFrustum !== "function") continue;
      try { if (camera.isInFrustum(m)) return true; } catch (e) { /* idem */ }
    }
    if (mailles.length) return false;
    // Sans rien de cullable, on juge sur le POINT : c'est ce que fait le tronc,
    // en moins fin, et cela suffit pour un objet de quelques unites.
    const p = noeud.getAbsolutePosition ? noeud.getAbsolutePosition() : null;
    if (!p) return false;
    const v = p.subtract(camera.position);
    const l = v.length();
    if (!l) return true;
    const cos = BABYLON.Vector3.Dot(v.scale(1 / l), camera.getForwardRay().direction);
    return cos > Math.cos(camera.fov);
  }

  function tirerPlaceQuantique(o, anchorPos) {
    const lune = bodies.find((b) => /quantum/i.test(b.name));
    if (!lune || !o.node) return null;
    const r = Math.hypot(o.local[0], o.local[1], o.local[2]) || 20;
    let p = null;
    // Le chemin du build : un point dans le disque de cent unites, un rayon
    // vers le bas, et la pente qui refuse.
    const eng = scene.getPhysicsEngine();
    if (eng && eng.raycast) {
      const loc = planarCandidate();
      // Le disque du build est pose dans le plan du parent ; ici le parent est
      // la lune, et son « haut » local est la verticale du point de depart.
      const base = [o.local[0], o.local[1], o.local[2]];
      const lh = Math.hypot(base[0], base[1], base[2]) || 1;
      const haut = [base[0] / lh, base[1] / lh, base[2] / lh];
      const e1 = Math.abs(haut[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const cr = [e1[1] * haut[2] - e1[2] * haut[1],
                  e1[2] * haut[0] - e1[0] * haut[2],
                  e1[0] * haut[1] - e1[1] * haut[0]];
      const lc = Math.hypot(cr[0], cr[1], cr[2]) || 1;
      const ax = [cr[0] / lc, cr[1] / lc, cr[2] / lc];
      const az = [haut[1] * ax[2] - haut[2] * ax[1],
                  haut[2] * ax[0] - haut[0] * ax[2],
                  haut[0] * ax[1] - haut[1] * ax[0]];
      const depart = [0, 1, 2].map((i) =>
        lune.position[i] + haut[i] * (r + loc[1]) + ax[i] * loc[0] + az[i] * loc[2]);
      try {
        const a0 = new BABYLON.Vector3(depart[0] - anchorPos[0],
                                       depart[1] - anchorPos[1],
                                       depart[2] - anchorPos[2]);
        const b0 = new BABYLON.Vector3(
          a0.x - haut[0] * QUANTIQUE.raycastDist,
          a0.y - haut[1] * QUANTIQUE.raycastDist,
          a0.z - haut[2] * QUANTIQUE.raycastDist);
        const hit = eng.raycast(a0, b0);
        if (hit && hit.hasHit) {
          const n = hit.hitNormalWorld || hit.hitNormal;
          // La pente decide : au-dela de quarante-cinq degres, on retire.
          if (!n || slopeOK([n.x, n.y, n.z], haut)) {
            const q = hit.hitPointWorld || hit.hitPoint;
            p = [q.x + anchorPos[0], q.y + anchorPos[1], q.z + anchorPos[2]];
          } else return null;
        }
      } catch (e) { p = null; }
    }
    if (!p) {
      // Sans collider sous la main — la lune n'est chargee qu'a portee — on
      // retombe sur la SPHERE de rayon egal a la hauteur d'origine. Sur un
      // corps de vingt unites, les deux se confondent a un cheveu pres, et la
      // loi de la pente n'a rien a mordre.
      const u = Math.random() * 2 - 1, a = Math.random() * 2 * Math.PI;
      const sn = Math.sqrt(Math.max(0, 1 - u * u));
      const dir = [sn * Math.cos(a), u, sn * Math.sin(a)];
      p = [lune.position[0] + dir[0] * r, lune.position[1] + dir[1] * r,
           lune.position[2] + dir[2] * r];
    }
    // La place est-elle visible ? On deplace le noeud pour le demander a
    // Babylon, et on le remet si la reponse est oui.
    const avant = o.node.getAbsolutePosition().clone();
    o.node.setAbsolutePosition(new BABYLON.Vector3(
      p[0] - anchorPos[0], p[1] - anchorPos[1], p[2] - anchorPos[2]));
    const vue = dansLeChamp(o.node);
    if (vue) { o.node.setAbsolutePosition(avant); return null; }
    return p;
  }

  // --- interface de jeu : jauges et invites ---
  const iface = await loadInterface();
  const uiRoot = document.getElementById("ui");
  const resHUD = iface && uiRoot ? new ResourceHUD(uiRoot, iface) : null;
  const prompts = iface && uiRoot ? new Prompts(uiRoot, iface) : null;
  window.__prompts = prompts;   // sonde : les trois zones et leur arbitrage
  let lastHealth = resources.health;
  window.__ui = { resHUD, prompts, iface };
  window.__resources = resources;   // sonde de verification

  // Modes d'affichage, messages du pilote automatique et minicarte.
  const AUTOPILOT_KEYS = new Set(["alignement", "vol", "approche", "egalisation"]);
  const guiMode = new GuiMode();
  // Le reticule de `DebugHUD` : une croix de treize pixels, blanche a 50 %,
  // au centre exact de l'ecran, que seul le mode cache efface.
  const reticule = (() => {
    const c = document.createElement("canvas");
    c.id = "reticule";
    c.width = CROSSHAIR.width; c.height = CROSSHAIR.height;
    const g = c.getContext("2d");
    const img = g.createImageData(c.width, c.height);
    const px = crosshairPixels(c.width, c.height, CROSSHAIR.thickness);
    const [r, v, b, a] = CROSSHAIR.color;
    // `SetPixel(i, j)` : i est la colonne, j la ligne, comptee depuis le BAS.
    for (let i = 0; i < c.width; i++) {
      for (let j = 0; j < c.height; j++) {
        if (!px[i * c.height + j]) continue;
        const k = ((c.height - 1 - j) * c.width + i) * 4;
        img.data.set([r * 255, v * 255, b * 255, a * 255], k);
      }
    }
    g.putImageData(img, 0, 0);
    document.body.appendChild(c);
    return c;
  })();
  const readout = uiRoot ? new AutopilotReadout(uiRoot) : null;
  const minimap = new Minimap(document.getElementById("minimap"));
  let lastPhase = "repos";
  // La cible de l'egalisation du sac dorsal, tant qu'elle dure.
  let egalisationJoueur = null;
  let endTimesCued = false;
  let deathCued = null;
  // Face nuit du corps ancre : elle n'existe que depuis que les corps tournent.
  let night = false;
  // Reglages : leur sauvegarde est distincte de celle de la partie, comme
  // SettingsSave l'est de PlayerData dans le jeu.
  const settings = new Settings(iface || {});
  // `Menu.SELECT_DELAY` : le menu a sa propre cadence, et elle compte en temps
  // REEL — `Open` vient de figer l'horloge du jeu (docs/115-menu.md).
  const menuInput = new MenuInput();
  const settingsUI = uiRoot
    ? new SettingsUI(uiRoot, settings, "data/interface/",
                     { onPick: (r) => { applySettings(); if (r === "exit") retourAuTitre(); } })
    : null;
  // --- consoles et objets de bord ---
  const computer = new ShipComputer(shipRecords(gameplay), SECTORS, pdata);
  const flashlight = new Flashlight(BABYLON, scene,
    (lighting.lights || []).find((l) => l.name === "Flashlight" && l.body === "Player_Body") || null);
  const marshmallow = new Marshmallow();
  // L'etat du baton : sorti ou range, ce qui se joue, ou en est l'aiguille.
  const baton = new BatonGuimauve();
  // Les deux objets tenus, une fois charges : { racine, groupes, lumieres }.
  const enMain = new Map();

  /**
   * Charge un objet tenu et l'accroche a la camera.
   *
   * Sa transformation LOCALE dans le glTF est deja celle qui le place devant
   * l'oeil — c'est celle qu'il avait sous `PlayerCamera` — donc on ne la touche
   * pas. Seule la rotation de repere du chargeur est reprise, comme pour les
   * corps celestes (`geometry.js`).
   */
  async function chargerEnMain(fichier, nom) {
    try {
      const res = await BABYLON.SceneLoader.ImportMeshAsync(
        "", "data/gltf/", fichier, scene);
      propagerExtras(res.meshes);
      hideUnrendered(res.meshes);
      disableInactive(res);
      toLegacyMaterials(BABYLON, scene, res.meshes);
      falloffUnity(res.meshes);
      applyLayers(res.meshes);
      const racine = new BABYLON.TransformNode(`main_${nom}`, scene);
      racine.parent = camera;
      racine.rotation.y = Math.PI;
      for (const m of res.meshes) if (!m.parent) m.parent = racine;
      const groupes = res.animationGroups || [];
      for (const g of groupes) g.stop();
      // Le glTF n'emporte pas de lumieres : l'exporteur n'ecrit que de la
      // geometrie. Les deux du baton sont posees ici, aux valeurs du
      // prefabrique, et elles partent eteintes comme dans le build.
      const lumieres = (res.lights || []).slice();
      if (nom === "marshmallowstick") {
        for (const d of STICK_LIGHTS) {
          const l = new BABYLON.PointLight(
            `main_${d.name}`,
            new BABYLON.Vector3(d.position[0], d.position[1], -d.position[2]), scene);
          l.range = d.range;
          l.intensity = d.intensity;
          l.parent = racine;
          lumieres.push(l);
        }
      }
      // Sous le plafond de lumieres, Babylon garde les premieres de la scene :
      // les lumieres tenues passent devant celles du decor, qu'on voit de loin.
      for (const l of lumieres) { l.setEnabled(false); l.renderPriority = 1; }
      const parNom = new Map();
      for (const g of groupes) parNom.set(g.name.replace(/^[~!]+/, "").split("|").pop(), g);
      enMain.set(nom, { racine, groupes, parNom, lumieres, meshes: res.meshes });
      console.log(`en main : ${nom} (${res.meshes.length} maillages,`
        + ` ${groupes.length} clips)`);
      return true;
    } catch (e) {
      // Sans le build, ces fichiers n'existent pas : la page reste jouable.
      return false;
    }
  }

  /**
   * Le baton, image par image : le clip qui doit tourner, les lumieres, et la
   * POSE du thermometre.
   *
   * `Therm` ne se joue pas : `MarshmallowStick.Update` lui met une vitesse de
   * zero et choisit son instant a la main. Ici on met le groupe en pause a
   * l'image voulue, ce qui est la meme chose dite avec l'API de Babylon.
   */
  function syncBaton(objet, etat, chaleur) {
    for (const l of objet.lumieres) l.setEnabled(etat.lights);
    // On ne CACHE pas le baton quand il se range : `PutBack` le sort du champ
    // tout seul, et l'effacer d'un coup couperait l'animation qu'on vient
    // d'ajouter. Le build n'eteint que le rendu de la guimauve et de sa flamme
    // (`Marshmallow.SetRenderer`), et c'est ce qu'on fait ici.
    //
    // Et les deux ne s'eteignent pas ensemble, ce que le portage melangeait :
    // `_mallowRenderer.enabled = _isOut` suit le baton, tandis que
    // `_pSys.renderer.enabled = (r < 0,25 && _isOut)` suit la COULEUR. La
    // flamme n'est donc pas « le baton sorti », c'est « la guimauve a pris
    // feu » — et rien ne la montrait.
    const pose = etat.out && etat.flame && !marshmallow.gone;
    const teinte = marshmallow.color();
    for (const m of objet.meshes) {
      if (/flame/i.test(m.name)) m.setEnabled(pose && marshmallow.aflame);
      else if (/marshmallowmodel/i.test(m.name)) {
        m.setEnabled(pose);
        // `_mallowRenderer.material.color = new Color(r, g, b, 1)` : elle
        // FONCE a mesure qu'elle cuit, et c'est la seule chose qui previent
        // avant qu'elle ne prenne feu. Le portage calculait la couleur et ne
        // la posait nulle part.
        if (m.material && m.material.diffuseColor) {
          m.material.diffuseColor.set(teinte[0], teinte[1], teinte[2]);
        } else if (m.material && m.material.albedoColor) {
          m.material.albedoColor.set(teinte[0], teinte[1], teinte[2]);
        }
      }
    }
    const voulu = etat.clip;
    for (const [nom, g] of objet.parNom) {
      if (nom === "Therm") continue;
      if (nom === voulu) { if (!g.isPlaying) g.play(nom === "idle"); }
      else if (g.isPlaying) g.stop();
    }
    const therm = objet.parNom.get("Therm");
    if (therm && etat.canTherm) {
      const duree = (therm.to - therm.from) / 60 || 1;
      const image = therm.from + thermTime(chaleur, duree) * 60;
      // `goToFrame` reveille le groupe : ne l'appeler que si l'aiguille bouge
      // VRAIMENT. Sans ce garde, on repositionne quatre clips a chaque image
      // pour une chaleur qui ne change pas, et un rendu logiciel le sent.
      if (objet.thermFrame === undefined || Math.abs(objet.thermFrame - image) > 0.01) {
        objet.thermFrame = image;
        if (!therm.isStarted) therm.play(false);
        therm.pause();
        therm.goToFrame(image);
      }
    } else if (therm && therm.isPlaying) { therm.stop(); objet.thermFrame = undefined; }
  }
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
  // Sondes de verification : deux regles que le navigateur mesure a part, la
  // ou elles sont ecrites (docs/67-annonces.md).
  window.__soin = eatMarshmallowHeals;
  window.__mur = suitBarrierPush;
  window.__mains = { baton, enMain };
  // Le chargement ne bloque pas le demarrage : ces deux objets pesent quelques
  // dizaines de kilo-octets, et la page doit s'ouvrir sans eux.
  chargerEnMain("marshmallowstick.gltf", "marshmallowstick");
  chargerEnMain("telescopegui.gltf", "telescopegui");

  window.__gui = { guiMode, readout, minimap, settings, applySettings };

  // Ombres et luminosite : les deux seules options qui touchent au rendu.
  let shadowGen = null;
  function applySettings() {
    const v = settings.values;
    // `TonemappingManager.ToggleTonemapping` et `UpdateTonemapping` :
    //
    //     ToggleTonemapping()   _isTonemappingActive = !_isTonemappingActive;
    //                           UpdateTonemapping();
    //     UpdateTonemapping()   foreach (t in _childTonemappers)
    //                               t.enabled = _isTonemappingActive;
    //
    // `_isTonemappingActive` est STATIQUE : un seul booleen pour tout le jeu,
    // et `UpdateTonemapping` le repousse sur TOUS les tonemappers enfants d'un
    // coup — c'est-a-dire sur chaque camera. C'est exactement la portee de
    // `scene.imageProcessingConfiguration`, qui vaut pour la scene entiere :
    // le portage fait la meme chose par un seul objet la ou le build en
    // parcourt une liste.
    //
    // Il vaut FAUX par defaut, donc « Normal » est l'etat de depart et
    // « Bright » allume le tonemapping.
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = v.brightness;
    ip.exposure = v.brightness ? 1.3 : 1.0;
    // QualitySettings.shadowDistance : le jeu ne fait qu'annuler la distance,
    // il ne demonte pas la passe d'ombres. Et le soleil n'en a pas : `SunLight`
    // porte `m_Shadows` a 0. Le portage lui avait donne un generateur d'ombres
    // de son cru ; l'option ne fait plus que ce que fait celle du build.
    scene.shadowsEnabled = v.shadows;
  }
  applySettings();

  // Invite du catalogue du jeu, par « Classe.champ ». Les textes ne sont pas
  // reecrits ici : ils viennent tels quels de data/interface/interface.json.
  // Les invites dont le texte est un CHAMP et non un litteral echappent au
  // catalogue, qui ne lit que des `ldstr`. La premiere d'entre elles est celle
  // de tout interactif : `InteractVolume.Awake` fait `new ScreenPrompt(
  // XboxButton.X, _prompt)`, et `_prompt` vaut « Talk » sur les quatorze
  // zones de conversation. Sans elle, viser Slate n'affichait RIEN, la ou
  // l'alpha montre « (X) Talk » sous le reticule (docs/132).
  const HORS_CATALOGUE = {
    "InteractVolume._screenPrompt": { priority: 0, button: "X" },
  };
  const P = (key, text) => {
    const p = (prompts && prompts.get(key)) || HORS_CATALOGUE[key] || null;
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
    // La cible, une fois, dans le repere de RENDU : `FloatingOrigin.toRender`
    // dit exactement cela, et le calcul etait recopie a la main ici — la
    // soustraction du decalage, ecrite a l'envers et par composante.
    const vise = origin.toRender(worldPos);
    let best = null, bestD = Infinity;
    for (const n of same) {
      n.computeWorldMatrix(true);
      const t = n.getWorldMatrix().getTranslation();
      const d = Math.hypot(t.x - vise.x, t.y - vise.y, t.z - vise.z);
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

  // §X LE CHAMP DE DEBRIS, RELU (docs/102-trou-blanc.md). Ce que le trou noir
  // avale ne se disperse pas dans une sphere : il SORT du trou blanc, un
  // morceau par seconde au plus, apres avoir grandi d'un dixieme a sa taille
  // pleine, et s'en eloigne jusqu'a ce que sa laisse le retienne.
  const debris = whiteVol ? new DebrisField() : null;
  // L'avant et le haut du trou blanc : c'est autour d'eux que tout se decide.
  // `WANT_ROTATION` les donne depuis ce lot ; sans eux, on retombe sur la
  // verticale du monde, et le portage n'avait que cela.
  const trouBlancAxes = (() => {
    const r = whiteVol && whiteVol.rotation;
    return r ? { fwd: qrotDecor(r, [0, 0, 1]), up: qrotDecor(r, [0, 1, 0]) }
             : { fwd: [0, 1, 0], up: [0, 0, 1] };
  })();
  const debrisMeshes = [];
  let debrisBase = null;
  // Le maillage du morceau qui grandit encore : il n'est pas dans la liste des
  // partis, et il occupe la bouche du trou blanc pendant sa croissance.
  let debrisPousse = null;
  let debrisMat = null;
  window.__debris = debris;
  window.__trouBlancFwd = trouBlancAxes.fwd;   // sonde de verification
  if (debris) {
    console.log(`trou blanc : sortie a ${WHITE_HOLE.radius} u, cone `
      + `${WHITE_HOLE.coneFloorDeg}-${WHITE_HOLE.exitConeDeg / 2} deg, `
      + `${growSteps()} pas de croissance`);
  }

  function syncDebris(dt, framePos) {
    if (!debris) return;
    // `Physics.CheckSphere(position, _radius)` : rien ne sort dans une sortie
    // occupee. Ici l'occupant qui compte est le dernier morceau parti, tant
    // qu'il n'a pas quitte la sphere — c'est ce que le build mesure aussi.
    const libre = !debrisMeshes.some(({ item }) => item.pos
      && Math.hypot(item.pos[0], item.pos[1], item.pos[2]) < WHITE_HOLE.radius);
    const fresh = debris.update(dt, libre);
    if (!debrisMat && (fresh.length || debris.growing)) {
      debrisMat = new BABYLON.StandardMaterial("debrisMat", scene);
      debrisMat.diffuseColor = new BABYLON.Color3(0.32, 0.28, 0.30);
      debrisMat.specularColor = new BABYLON.Color3(0, 0, 0);
    }
    if (fresh.length && !debrisBase) {
      debrisBase = BABYLON.MeshBuilder.CreateSphere("debris",
        { diameter: 24, segments: 6 }, scene);
      debrisBase.material = debrisMat;
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
      // Il part de la bouche du trou blanc, a vingt unites par seconde, dans
      // le cone de quinze a trente degres autour de son avant.
      const l = debris.launch(item, trouBlancAxes.fwd, trouBlancAxes.up);
      item.pos = [0, 0, 0];
      item.vel = l.velocity;
      debrisMeshes.push({ inst, item });
    }
    // §X LE MORCEAU QUI GRANDIT SE VOIT. Il passe presque une seconde a la
    // bouche du trou blanc, d'un dixieme de sa taille a sa taille pleine : le
    // cacher jusqu'au depart, c'est perdre la seule chose que ce mecanisme
    // donne a regarder. Il a donc son maillage a lui, cree quand il entre et
    // rendu a la file quand il part.
    if (debris.growing) {
      if (!debrisPousse) {
        // Un maillage a lui, et non une instance : les instances dependent
        // d'un maillage source allume, et le morceau qui grandit peut etre le
        // tout premier — il n'y a alors pas encore de source.
        debrisPousse = BABYLON.MeshBuilder.CreateSphere("debris_pousse",
          { diameter: 24, segments: 6 }, scene);
        debrisPousse.isPickable = false;
        debrisPousse.material = debrisMat;
        MeshLOD.pin(debrisPousse);
      }
      debrisPousse.scaling.setAll(debris.scale);
      debrisPousse.position.set(whiteVol.position[0] - framePos[0],
                                whiteVol.position[1] - framePos[1],
                                whiteVol.position[2] - framePos[2]);
    } else if (debrisPousse) {
      debrisPousse.dispose();
      debrisPousse = null;
    }
    if (!debrisMeshes.length) return;
    const base = whiteVol.position;
    for (const { inst, item } of debrisMeshes) {
      if (item.pos) {
        // `DebrisLeash.FixedUpdate` : rien ne freine en deca de 80 % de la
        // laisse, puis le carre de la fraction restante s'oppose a la vitesse
        // RELATIVE. Le trou blanc est l'ancre, et dans ce repere il est fixe.
        const d = Math.hypot(item.pos[0], item.pos[1], item.pos[2]);
        const k = leashBrake(d, item.leash);
        if (k > 0) {
          item.vel[0] -= item.vel[0] * k * dt;
          item.vel[1] -= item.vel[1] * k * dt;
          item.vel[2] -= item.vel[2] * k * dt;
        }
        item.pos[0] += item.vel[0] * dt;
        item.pos[1] += item.vel[1] * dt;
        item.pos[2] += item.vel[2] * dt;
      }
      const p = item.pos || [0, 0, 0];
      inst.position.set(base[0] - framePos[0] + p[0],
                        base[1] - framePos[1] + p[1],
                        base[2] - framePos[2] + p[2]);
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
  // `TimeLoop._loopDurationInMinutes` : 18, lu dans la scene et non devine
  // (docs/88-boucle.md). Le repli explicite porte la meme valeur.
  const loop = new TimeLoop(
    ((gameplay.singletons || {}).TimeLoop || {}).fields
      ?._loopDurationInMinutes ?? undefined);
  // L'effondrement de l'etoile a l'echelle de la scene : c'est elle qui fixe
  // le temps entre `TriggerSupernova` et `SunExploded` (docs/132).
  Object.assign(loop, effondrementsDuBuild(gameplay));
  // `TimeLoop.Start` : la statique `_startTimeLoopOnReload` nait a VRAI, donc
  // le tout premier chargement annonce deja `StartOfTimeLoop` et calcule la
  // prevention. Sur une partie neuve, l'etoile n'explose donc pas tant qu'on
  // n'a pas appris les codes de lancement — le compte a rebours tourne, la fin
  // des temps attend (docs/88-boucle.md).
  loop.start(pdata.knows("knowsLaunchCodes"));
  // La sphere de l'observatoire : armee au premier tour d'une partie neuve,
  // elle attend qu'on ait appris les codes (docs/91-remise-a-zero.md).
  const remiseAZero = new ResetTrigger(
    ((gameplay.placed || {}).ResetSimulationTrigger || [])[0] || null);
  remiseAZero.startOfTimeLoop(loop.loopCount + 1, pdata.knows("knowsLaunchCodes"));
  window.__remiseAZero = remiseAZero;
  if (loop.preventSupernova) console.log("fin des temps suspendue : codes inconnus");
  // le compteur persiste doit etre RESTAURE au demarrage : sans cela, la
  // premiere synchronisation ecrasait la valeur sauvegardee par un zero
  loop.loopCount = pdata.loopCount || 0;
  const inviteCodes = new InviteCodes();
  inviteCodes.debutBoucle(loop.loopCount + 1, performance.now() / 1000);
  const spawn0 = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
  // §N La PREMIERE image aussi : le joueur se reveille sur un sol qui tourne,
  // et `MatchInitialMotion` lui en donne la vitesse. Sans cela le tout premier
  // instant de la partie est un glissement.
  //
  // POSE A LA PREMIERE IMAGE, ET NON ICI. `vitesseDeDepart` lit `framePos`, qui
  // est declare avec la boucle — l'appeler depuis `boot()` leve une erreur de
  // zone morte temporelle, et une erreur dans `boot()` ne laisse pas de page.
  // C'est la troisieme fois que ce depot y tombe (docs/62, docs/56, ici) : un
  // `const` est declare avec ce qu'il decrit, pas avec ce qui le lit — et une
  // fonction qui le lit a le droit d'etre ecrite avant, pas d'etre APPELEE
  // avant.
  let departAFaire = true;
  // Le joueur est-il dans la zone brouillee de l'epave ? La carte s'y efface.
  let dansEpave = false;
  // §T PERDRE LA GRAVITE. Quitter un champ n'est pas seulement cesser de
  // tomber : le jeu vous retourne, et vous prend les commandes du regard
  // pendant qu'il le fait — a cinquante degres par seconde, moitie moins vite
  // que le demi-tour d'un siege (docs/79-alignement.md).
  const alignement = new FieldAlignment();
  // Le redressement du corps vers le bas du champ : cent degres par seconde,
  // et le tangage compense tant qu'il dure (docs/106-redressement.md).
  const redressement = new UpAligner();
  window.__redressement = redressement;
  window.__alignement = alignement;
  // Sonde de verification : la loi des invites de sac, telle qu'elle est.
  window.__jetpackPrompts = jetpackPrompts;
  // Le plein d'oxygene ne s'annonce qu'une fois par remplissage.
  let refaitLePlein = false;
  // L'avertissement du sac dorsal, une fois au passage a sec.
  let sacASec = false;
  // `_isTrainingMode` : a portee d'un noeud du satellite casse.
  let entrainementEnCours = false;
  // `_midairSnapshotCount` : les photos prises EN VOL depuis le tir.
  let photosEnVol = 0;

  // Les effets d'image du joueur (docs/47-effets-image.md). `fx` tient l'etat,
  // `postfx` le rend. Les deux sont separes parce que l'etat s'eprouve sans
  // navigateur et que le rendu ne s'eprouve pas du tout.

  const fx = new CameraEffects(reglagesCam);
  const postfx = new PostFX(BABYLON, camera, engine, reglagesCam);
  window.__fx = { fx, postfx, reglagesCam };
  // Ce que le build fait avec `GUI.DrawTexture` dans `OnGUI` : un rectangle
  // noir plein ecran, dont l'opacite est `_fadeFraction`. Ici un div, parce
  // qu'il doit passer PAR-DESSUS le HUD comme `GUI.depth = -1` le demande.
  const fadeOverlay = uiRoot ? (() => {
    const d = document.createElement("div");
    d.className = "fade-ecran";
    uiRoot.appendChild(d);
    return d;
  })() : null;
  let fxMort = false, fxEau = false;
  // `StartOfTimeLoop` part aussi au PREMIER chargement : le reveil de la
  // partie eblouit comme celui qui suit une mort.
  let fxReveil = false;

  // Mort et flashback : une seule porte d'entree pour toutes les causes.
  const death = new PlayerDeathHandler();
  // Le flashback attend `TriggerFlashback`, que la fin de l'effet de mort annonce.
  death.attendreEffet = true;
  const flashOverlay = uiRoot ? new FlashbackOverlay(uiRoot) : null;

  // §R LA MEMOIRE DU FLASHBACK (docs/98-flashback.md).
  //
  // `Flashback.TakeSnapshot` photographie la camera du joueur dans une
  // `RenderTexture` de 256 par 256, toutes les cinq secondes, et la mort rejoue
  // ces photos A REBOURS. `death.js` a longtemps affirme le contraire — « le
  // build ne porte pas de memoire a rejouer » — et c'est la plus visible des
  // choses que le portage ne faisait pas.
  //
  // Une photo de 256 par 256 coute 256 Ko toutes les cinq secondes : a
  // l'echelle de la boucle, deux cent seize photos et cinquante megaoctets. Le build en garde autant, et sans plafond : mourir tard donne
  // un long flashback, c'est le principe.
  const pellicule = { timer: new SnapshotTimer(), photos: [],
                      enCours: false, t0: performance.now() / 1000 };
  // `_finalImage` — `FinalFlashbackImage` —, posee sur le plan pendant que le
  // blanc monte. Sans le build, elle manque et le fondu reste nu : c'est un
  // repli, pas une panne.
  if (flashOverlay) {
    const finale = new Image();
    finale.onload = () => flashOverlay.setFinalImage(finale);
    finale.src = "data/interface/FinalFlashbackImage.png";
  }
  death.snapshotCount = () => pellicule.photos.length;
  window.__death = death;
  window.__pellicule = pellicule;

  /**
   * Une photo : l'image que le joueur vient de VOIR, prise juste apres son
   * rendu.
   *
   * Le portage rendait une seconde fois la scene dans une `RenderTargetTexture`
   * de 256 par 256 : sous SwiftShader comme ailleurs, elle sortait NOIRE — le
   * flashback de l'alpha montre le feu, la tour, le ciel, celui du portage
   * montrait des rectangles noirs (docs/132). Le build rend la camera du
   * joueur, effets d'image compris, dans une `RenderTexture` carree ; une
   * camera Unity rendue dans une cible carree garde son champ VERTICAL, et
   * c'est donc le carre central de l'image affichee. On le copie dans le
   * `onAfterRender` : a ce moment le tampon de dessin est encore lisible,
   * sans `preserveDrawingBuffer`.
   */
  function photographier() {
    if (pellicule.enCours) return;
    pellicule.enCours = true;
    const obs = scene.onAfterRenderObservable.addOnce(() => {
      try {
        const src = engine.getRenderingCanvas();
        const n = FLASHBACK.snapshotSize;
        const w = src.width, h = src.height, cote = Math.min(w, h);
        const toile = new OffscreenCanvas(n, n);
        toile.getContext("2d").drawImage(src, (w - cote) / 2, (h - cote) / 2,
                                         cote, cote, 0, 0, n, n);
        pellicule.photos.push(toile.transferToImageBitmap());
      } catch (e) {
        // Un contexte perdu, une copie refusee : la partie continue.
      } finally {
        pellicule.enCours = false;
      }
    });
    if (!obs) pellicule.enCours = false;
  }

  function respawn() {
    // `TimeLoop.Start` recalcule `_preventSupernova` : tant qu'on ne connait
    // pas les codes de lancement, l'etoile n'explose pas.
    loop.restart(pdata.knows("knowsLaunchCodes"));
    pdata.setLoopCount(loop.loopCount);
    // Le ciel se remplit de nouveau : la boucle recommence pour lui aussi.
    starField.reset();
    if (starPCS) {
      const [cr, cg, cb] = starField.color;
      for (const p of starPCS.particles) p.color.set(cr, cg, cb, 1);
      starFlash = [];
      starPCS.setParticles();
    }
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
    // §V L'INVULNERABILITE DU PREMIER TOUR. `OnStartOfTimeLoop` la recalcule a
    // chaque boucle : vraie a la PREMIERE, tant qu'on ne connait pas les codes
    // de lancement (docs/81-invulnerable.md).
    pdata.startOfTimeLoop(pdata.loopCount);
    resources.invulnerable = pdata.isInvulnerable;
    if (resources.invulnerable) console.log("premier tour : les degats ne portent pas");
    player.pos.x = spawn0.x; player.pos.y = spawn0.y; player.pos.z = spawn0.z;
    // §N ON PART AVEC LE SOL. `MatchInitialMotion` est pose sur vingt-sept
    // corps, `Player_Body` et `Ship_Body` compris : un corps qui se reveille
    // prend la vitesse de son PORTEUR, terme tangentiel inclus.
    //
    //     v = v_porteur + omega x (p - centre_du_porteur)
    //
    // Le portage remettait zero. Dans le repere ancre, la vitesse du porteur
    // est deja nulle — c'est lui l'ancre — mais le terme tangentiel ne l'est
    // pas : l'ancre ne tourne pas avec la planete. Debarquer immobile sur un
    // sol qui defile est precisement ce que cette classe evite.
    const vDepart = vitesseDeDepart([spawn0.x, spawn0.y, spawn0.z]);
    player.vel.x = vDepart[0]; player.vel.y = vDepart[1]; player.vel.z = vDepart[2];
    // Une boucle qui recommence remet TOUT a l'etat de depart, le regard
    // compris : sinon on rouvre les yeux dans la direction ou l'on est mort.
    // Et l'on rouvre les yeux sur le ciel, comme au premier tour :
    // `OnStartOfTimeLoop` rappelle `SpawnPlayer` a chaque boucle.
    yaw = yaw0; pitch = -REVEIL.degreesY * Math.PI / 180;
    reveil.start();
    chargeA = performance.now() / 1000;
    recentrage = null;
    if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos, false);
    if (ship) {
      ship.boarded = false;
      ship.vel.x = ship.vel.y = ship.vel.z = 0;
      // le vaisseau repart entier : la boucle remet le monde a son etat de
      // depart, coque comprise
      ship.damage.reset();
      ship.pos.x = shipStart[0]; ship.pos.y = shipStart[1]; ship.pos.z = shipStart[2];
      ship.parked = true;
      ship.landed = true;
      ship.groundBody = "TimberHearth";
      ship.onPad = false;
      ship.igniting = false;
      ship.ignitionTime = 0;
    }
    if (starEntry) starEntry.mesh.scaling.setAll(1);
    // La boucle rend le monde a son etat de depart : la musique de la fin des
    // temps se tait, les reparations sont a refaire — celles du vaisseau comme
    // les trois noeuds du satellite — et l'entrainement se rejoue.
    endMusic.reset();
    const sw = sonsUI.supernovaWave();
    if (sw) audio.loopAt(sw.file, 0);
    supernovaCollapsePlayed = false;
    supernovaExplosionPlayed = false;
    for (const r of repairs) r.reset();
    training.reset();
    // Une boucle EST un rechargement de scene : `_isFirstFrame` redevient vrai,
    // et le joueur se reveille aligne. Sans cela, la premiere seconde et demie
    // d'une nouvelle boucle serait passee a se redresser depuis l'orientation
    // du mort (docs/106-redressement.md).
    alignement.reset();
    redressement.reset();
    // Les predateurs aussi : la prise ne se defait pas d'elle-meme, et une
    // boucle qui recommence doit rendre la proie a la vie.
    for (const f of fish) f.reset();
    // La pellicule aussi : `Flashback.Start` recree `_snapshotRenders` a chaque
    // chargement de scene, et la boucle EST un rechargement de scene. Le
    // flashback d'une boucle ne montre que cette boucle-la — sans quoi il
    // grandirait sans fin, et montrerait une vie qu'on a deja oubliee.
    for (const b of pellicule.photos) { try { b.close(); } catch (e) { /* deja fermee */ } }
    pellicule.photos.length = 0;
    pellicule.timer.reset();
    pellicule.t0 = performance.now() / 1000;
    // L'equipement suit le MONDE, pas la connaissance : ce qu'on sait survit a
    // la boucle (`PlayerData`), ce qu'on porte non. Le paquetage est a nouveau
    // dans la cabine au debut de chaque boucle, et se ramasse a nouveau.
    equipment.suit = false;
    player.setSuit(false);
    equipment.probe = false;
    equipment.minimap = false;
    equipment.taken.clear();
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
    if (pdata.learn("knowsLaunchCodes")) {
      // `LaunchTerminal.OnLearnLaunchCodes` : c'est la connaissance qui pose
      // l'invite, et non l'inverse.
      console.log(`codes de lancement appris — terminal :${terminal.learnCodes()}`);
      inviteCodes.apprend(performance.now() / 1000);
    }
  };
  window.__respawn = respawn;

  // Portee d'embarquement, mesuree depuis le CENTRE du vaisseau, dont la coque
  // s'etend sur une dizaine d'unites. Le sas n'a pas d'interactif extrait : ce
  // rayon large est un repli assume, pas une valeur du build. Il ne raccourcit
  // plus le depart, qui se fait desormais au village, 471 u plus loin.
  const SHIP_REACH = 40;

  // §O LES PHARES DU VAISSEAU. Le portage n'en avait aucun : `shiplightRange`
  // etait ecrite, eprouvee, et appelee par personne.
  //
  // Six cents unites partout, et `min(limite du secteur, 600)` dans un secteur
  // majeur : la dimension abandonnee les bride a CENT. Piloter dedans se fait
  // donc a la lueur du tableau de bord, et c'est une des rares choses que le
  // build dit explicitement d'un lieu.
  const phares = new BABYLON.SpotLight("shiplight", BABYLON.Vector3.Zero(),
    new BABYLON.Vector3(0, 0, 1), Math.PI / 2.6, 2, scene);
  phares.range = SHIPLIGHT_RANGE;
  phares.intensity = 1.1;
  phares.setEnabled(false);
  window.__phares = phares;
  // Portee de ramassage. Le `GearPickup` du build n'a pas de forme a lui : sa
  // zone d'interaction est un objet ENFANT (`InteractVolume`, une capsule de
  // rayon 1 et de hauteur 3), comme la forme des zones d'ambiance vit sur les
  // enfants de la zone. Trois unites est donc la hauteur de cette capsule, pas
  // un nombre choisi.
  const GEAR_REACH = 3;

  // §J S'ASSEOIR (docs/69-assise.md).
  //
  // Les quatre `PlayerAttachPoint` du build sont les quatre endroits ou le jeu
  // prend le joueur en charge, et ils tombent exactement sur quatre zones
  // d'interaction : « Buckle Up » au poste de pilotage, « Boot Up » a
  // l'ordinateur de bord, « Fly Model Ship » a l'observatoire, « Activate
  // Lift » au pied de la tour. Le portage n'en lisait aucun : `attachPoints`
  // etait ecrit, eprouve, et appele par personne.
  const pointsAttache = new AttachPoints(attachPoints(gameplay));
  const siegePilotage = pointsAttache.points.find((p) => p.name === "FlightConsole")
                     || null;
  // Le verrouillage de camera : deux instances posees, dont celle des commandes
  // du projecteur de l'observatoire. La classe a ete RELUE dans l'IL a cette
  // occasion — celle du portage etait une paraphrase que rien n'appelait.
  const verrouCamera = new CameraLock();
  // Ce que le verrou vise EN CE MOMENT. Le build n'a qu'un
  // `PlayerLockOnTargeting` sur le corps du joueur : un seul verrou a la fois,
  // et `LockOn` ecrase simplement le precedent.
  let verrouCible = null;
  const ciblesVerrou = lockOnTargets(gameplay);
  window.__assise = { points: pointsAttache, verrou: verrouCamera,
                      cibles: ciblesVerrou };
  const zoneAscenseur = interactables.items.find((it) => it.prompt === "Activate Lift"
    || (it.kind === "zone" && it.name === "AttachPoint" && it.body === "TimberHearth_Body")) || null;
  const terminalItem = interactables.items.find((it) => it.kind === "terminal" || it.name === "LaunchTerminal") || null;
  const elAttach = pointsAttache.points.find((p) => p.name === "AttachPoint" && p.body === "TimberHearth_Body") || null;
  const zoneAscRestPos = zoneAscenseur ? [...zoneAscenseur.world] : [1.6731, -38.8395, -8720.9674];
  const elAttachRestPos = elAttach ? [...elAttach.position] : [1.6731, -38.8395, -8720.9674];
  const zoneGearUp = interactables.items.find((it) => it.prompt === "Gear Up") || null;

  /**
   * Le repere du poste de pilotage, en coordonnees monde, cette image.
   *
   * `ship.quat` part de l'identite sur la scene AU REPOS : la pose du siege
   * s'obtient donc en tournant son ecart au centre du vaisseau par ce
   * quaternion, et en composant les deux orientations.
   *
   * Le repere ancre se passe en PARAMETRE : il est recalcule a chaque image, et
   * cette fonction vit hors de la boucle. Elle le lisait de la portee de
   * `boot()`, ou il n'existe pas — une faute qui ne se declenchait qu'en
   * MONTANT dans le vaisseau, ce qu'aucun controle ne fait (docs/71).
   */
  function siegeVivant(anchorPos) {
    if (!ship || !shipRest || !siegePilotage) return null;
    const d = [siegePilotage.position[0] - shipRest[0],
               siegePilotage.position[1] - shipRest[1],
               siegePilotage.position[2] - shipRest[2]];
    const r = quatRotate(ship.quat, d);
    return {
      position: [ship.pos.x + anchorPos[0] + r[0],
                 ship.pos.y + anchorPos[1] + r[1],
                 ship.pos.z + anchorPos[2] + r[2]],
      rotation: quatMul(ship.quat, siegePilotage.rotation),
    };
  }
  // outils portes par le joueur (dans la scene, ils sont sur la camera)
  // Le champ de repos du telescope n'est pas un champ du telescope : c'est
  // celui de la camera, que `SnapToInitFieldOfView` retrouve en sortant.
  const telescope = new Telescope({ restFOV: reglagesCam.fov || 70 });
  // L'onde de la lunette : cinq cents points, un par image, dans une boite du
  // coin de l'ecran (docs/65-onde.md). Le trace est un canvas HTML plutot
  // qu'un `GL.LINES` : ce que le build dessine avec `OnPostRender` est une
  // polyligne, et un canvas en fait autant sans toucher au rendu 3D.
  const onde = new SoundWave();
  const ondeEl = uiRoot ? document.createElement("canvas") : null;
  if (ondeEl) {
    ondeEl.className = "ow-soundwave";
    ondeEl.width = WAVE.points;
    ondeEl.height = 64;
    ondeEl.hidden = true;
    uiRoot.appendChild(ondeEl);
  }
  const ondeCtx = ondeEl ? ondeEl.getContext("2d") : null;
  // §P La reglette de zoom de la lunette : une barre, une fleche, et la hauteur
  // de la fleche dit le champ. `zoomArrowFraction` etait ecrite et eprouvee.
  const zoomEl = uiRoot ? document.createElement("div") : null;
  if (zoomEl) {
    zoomEl.className = "ow-zoom";
    zoomEl.hidden = true;
    zoomEl.innerHTML = '<i></i>';
    uiRoot.appendChild(zoomEl);
  }

  // §L LE MARQUEUR DE SONDE (docs/71-quantique.md).
  //
  // `probeIcon`, `probeReadout` et `probeLabelPos` etaient ecrites, eprouvees,
  // documentees (docs/60) — et IMPORTEES par `main.js`, ce qui leur donnait
  // l'air branchees. `lois.mjs` les declarait vivantes pour cette seule raison,
  // jusqu'a ce qu'il cesse de compter un import pour un appel.
  //
  // Le marqueur dit trois choses : ou est la sonde a l'ecran, a quelle
  // distance, et dans quel etat — danger, ancree, ou simple reperage.
  const marqueurEl = uiRoot ? document.createElement("div") : null;
  if (marqueurEl) {
    marqueurEl.className = "ow-probe-marker";
    marqueurEl.hidden = true;
    uiRoot.appendChild(marqueurEl);
  }
  // La taille du marqueur suit celle de la vignette : c'est la meme loi de
  // distance, et le build les dimensionne ensemble.
  const MARQUEUR = { width: 40, height: 40 };
  /**
   * Un point de plus, et le trace.
   *
   * L'echantillon vient d'une sinusoide et non du clip `ProbeLoop` que le
   * build echantillonne : le portage joue ses sons par des elements `<audio>`
   * et n'a donc pas leurs octets sous la main. C'est la seule liberte de ce
   * lot, et la loi qui compte — un point par image, `(echantillon x force + 1)
   * / 2` — est celle du build.
   */
  function traceOnde(force, t) {
    onde.push(Math.sin(t * 37) * 0.8 + Math.sin(t * 11.3) * 0.2, force);
    if (!ondeCtx) return;
    const pts = onde.ordered();
    ondeCtx.clearRect(0, 0, ondeEl.width, ondeEl.height);
    ondeCtx.strokeStyle = "rgba(159, 214, 196, .85)";
    ondeCtx.lineWidth = 1;
    ondeCtx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const y = (1 - pts[i]) * ondeEl.height;
      if (i === 0) ondeCtx.moveTo(i, y); else ondeCtx.lineTo(i, y);
    }
    ondeCtx.stroke();
  }
  const probes = new ProbeLauncher();
  // La sonde est un appareil photo qu'on jette : sa camera embarquee occupe un
  // coin de l'ecran tant qu'elle vole.
  // `LandingCam` du build : champ de 100 degres, plan proche a 0,5, et un
  // `NoiseAndGrain` de force 4 par-dessus. C'est une camera d'appareil jete,
  // et elle en a le grain.
  const probeCam = new ProbeCamera(BABYLON, scene, camera, uiRoot,
                                   reglagesDe(camerasDuBuild, "LandingCam"));
  // Les consoles a camera deportee — piloter le vaisseau depuis l'observatoire,
  // regarder par le satellite — reutilisent cette meme vue : c'est le moyen qui
  // leur manquait, et il existe depuis que la sonde a un oeil.
  const consoles = new RemoteConsoles(remoteConsoles(gameplay));
  // §S LA SALLE S'ETEINT QUAND ON PREND LE PROJECTEUR.
  //
  // `SatelliteSnapshotController.OnPressInteract` fait fondre une lumiere a
  // ZERO en deux secondes (`_fadeLight.FadeIntensity(0f, 2f)`), et sa sortie la
  // ramene a son intensite d'origine, en deux secondes aussi. C'est ce qui rend
  // l'ecran lisible : on eteint la piece pour regarder la projection.
  //
  // `FadeLight` est pose sur une « Point light » et n'a aucun champ : c'est
  // donc par sa POSITION qu'on retrouve la lumiere qu'il commande, comme les
  // nuages du ciel (docs/48) et pour la meme raison — le nom ne designe rien.
  const fadeData = ((gameplay.placed || {}).FadeLight || [])[0] || null;
  let fadeLight = null, fadeCible = null;
  if (fadeData && fadeData.position) {
    let best = null, bestD = 4;
    for (const l of (lighting.lights || [])) {
      if (!l.position) continue;
      const d = Math.hypot(l.position[0] - fadeData.position[0],
                           l.position[1] - fadeData.position[1],
                           l.position[2] - fadeData.position[2]);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (best) {
      fadeCible = best;
      fadeLight = new FadeLight(best.intensity ?? 1);
      console.log(`lumiere du projecteur : ${best.name} a ${bestD.toFixed(2)} u`);
    } else {
      console.warn("FadeLight : aucune lumiere a sa position");
    }
  }
  window.__tools = { telescope, probes, probeCam, consoles, fadeLight };
  // Les options de dialogue sont touchables : au clavier on les choisit au
  // chiffre ou au curseur, au doigt on les vise directement.
  const dlgUI = new DialogueUI(document.getElementById("dialogue"), {
    onChoose: (i) => { optionPressed = i + 1; },
    onNext: () => { interactPressed = true; },
    // Au doigt, le losange d'action tient le coin bas-droit et passe PAR-DESSUS
    // la boite (z-index 8 contre 6) : ce qu'elle glisse dessous ne se touche
    // pas. La place se mesure sur la couche elle-meme plutot que de s'ecrire
    // ici — elle change avec la taille des boutons et avec l'encoche.
    reserveOf: () => {
      const face = document.querySelector("#touchui .tc-face");
      if (!face || !face.offsetParent) return 0;
      return Math.max(0, Math.round(innerWidth - face.getBoundingClientRect().left - 10));
    },
  });

  // Rendu de la sonde : une bille emissive — le prefabrique porte un
  // `ProbeMesh`, mais la geometrie de la sonde n'est pas dans `level0` et le
  // portage ne charge que ce qui y est. Elle n'est jamais recreee : il n'y en a
  // qu'UNE, et c'est le fait de jeu de docs/60.
  const PROBE_LAYER = CALQUE_SONDE;
  const probeMat = new BABYLON.StandardMaterial("probeMat", scene);
  probeMat.emissiveColor = new BABYLON.Color3(0.6, 0.9, 1.0);
  probeMat.disableLighting = true;
  const probeMesh = BABYLON.MeshBuilder.CreateSphere("probe",
    { diameter: 2 * SONDE.colliderRadius, segments: 6 }, scene);
  probeMesh.material = probeMat;
  probeMesh.isPickable = false;
  // La sonde ne se filme pas elle-meme : sa bille est sur un calque que la
  // camera embarquee ne regarde pas, sans quoi elle remplirait l'image — elle
  // est a 30 cm de l'objectif.
  probeMesh.layerMask = PROBE_LAYER;
  probeMesh.setEnabled(false);
  // `ProbeLantern` : eteinte en vol, elle monte de zero a cinquante en deux
  // secondes une fois la sonde plantee. C'est une lumiere ponctuelle du
  // prefabrique, pas un projecteur — celui-la est sur les cameras.
  const probeLantern = new BABYLON.PointLight("probeLantern",
    BABYLON.Vector3.Zero(), scene);
  probeLantern.range = 0;
  probeLantern.intensity = 0;
  function syncProbes() {
    const p = probes.last;
    probeMesh.setEnabled(!!p);
    if (p) probeMesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    const portee = p ? p.lantern : 0;
    probeLantern.range = portee;
    probeLantern.intensity = portee > 0 ? 1 : 0;
    if (p && portee > 0) probeLantern.position.set(p.pos[0], p.pos[1], p.pos[2]);
  }
  // Le pilote automatique arrive aux distances du BUILD, et non a « rayon de
  // surface x 1,5 » : elles sont dans les neuf `MajorReferenceFrameVolume`
  // (docs/46, lot 1).
  const autopilot = ship ? new Autopilot(ship, declared.frames) : null;
  // Les treize marqueurs que le build pose, avec leurs vrais noms de jeu.
  const marqueurs = mapMarkers(gameplay);
  const accesCarte = new AccesCarte();
  // `MapCamera` : la carte est une CAMERA qui s'eleve de l'oeil du joueur
  // (map.js, `VueCarte`). Le portage la tient avec la camera du joueur, dont
  // il retient les reglages le temps de la carte — c'est aussi ce que fait le
  // build pour le son, en passant l'ecoute a la camera de la carte.
  const vueCarte = new VueCarte();
  const camCarteBuild = ((camerasDuBuild && camerasDuBuild.cameras) || [])
    .find((c) => (c.roles || []).includes("carte")) || null;
  const reglagesCarte = {
    fov: ((camCarteBuild && camCarteBuild.fov) || REGLES_CARTE.fov) * Math.PI / 180,
    far: (camCarteBuild && camCarteBuild.far) || REGLES_CARTE.far,
    masque: masqueCamera(camCarteBuild ? camCarteBuild.cullingMask : null),
  };
  let cameraAvantCarte = null;
  // Le monde vu du repere de travail, qui tourne avec le corps ancre : le bas
  // de la carte est `Vector3.down` du MONDE (spin.js).
  const versRepereCarte = (v) => (anchorBody ? spins.toFrame(anchorBody, v) : v);
  const depuisRepereCarte = (v) => (anchorBody ? spins.fromFrame(anchorBody, v) : v);
  const etoileCarte = () => bodies.find((b) => ((b.gravity || {}).surfaceAcceleration || 0) >= 50) || null;
  /**
   * `EnterMapView`. Le cadrage joueur-cible se mesure dans le repere, puis se
   * ramene aux axes du monde : `_focalOffset` y vit, le deplacement aussi.
   */
  function ouvrirCarte({ observatoire = false } = {}) {
    const now = performance.now() / 1000;
    const etoile = etoileCarte();
    const sp = etoile ? etoile.position : [0, 0, 0];
    const rel = (p) => depuisRepereCarte([p[0] - sp[0], p[1] - sp[1], p[2] - sp[2]]);
    const cible = observatoire ? null : solarMap.selected;
    const r = solarMap.enterMapView(rel([player.pos.x, player.pos.y, player.pos.z]),
                                    cible ? rel(cible.position) : null, now,
                                    REGLES_CARTE.fov, [0, 0, 0],
                                    observatoire ? REGLES_CARTE.observatoryZoomDuration
                                                 : REGLES_CARTE.zoomDuration);
    const regard = new BABYLON.Quaternion();
    camera.getWorldMatrix().decompose(undefined, regard);
    vueCarte.entrer({ now, zoomDuration: r.zoomDuration,
                      rotationRate: observatoire ? REGLES_CARTE.observatoryRotationRate
                                                 : REGLES_CARTE.rotationRate,
                      doRotation: observatoire,
                      regard: [regard.x, regard.y, regard.z, regard.w],
                      versRepere: versRepereCarte });
    if (!cameraAvantCarte) {
      cameraAvantCarte = { fov: camera.fov, minZ: camera.minZ, maxZ: camera.maxZ,
                           layerMask: camera.layerMask };
    }
    return r;
  }
  /** `ExitMapView` : la camera du joueur retrouve ses reglages. */
  function fermerCarte() {
    if (solarMap.open) solarMap.exitMapView();
    accesCarte.sortie();
    vueCarte.sortir();
    solarMap.panLocked = false;
    if (cameraAvantCarte) {
      camera.rotationQuaternion = null;
      Object.assign(camera, cameraAvantCarte);
      cameraAvantCarte = null;
    }
  }
  window.__vueCarte = vueCarte;
  const solarMap = new SolarMap(document.getElementById("map"), bodies,
                                pdata, SECTOR_OF, marqueurs);
  // §V LES ORBITES ONT UNE COULEUR CHACUNE (docs/100-carte.md). `MapOpenGL`
  // porte cinq pointeurs de corps et cinq couleurs, plus celle de la comete ;
  // le portage tracait tout d'un meme gris invente, au centre de l'ECRAN et
  // non du Soleil.
  {
    const mog = (gameplay.singletons || {}).MapOpenGL || null;
    const lues = solarMap.readOrbitColors(mog);
    console.log(`carte : ${lues.length} orbites colorees`
      + (mog ? " (lues dans le build)" : " (repli)"));
  }
  // La liste des corps visables : construite UNE fois, rafraichie en place.
  // Elle se declare ICI, avec les corps, et non pres de son lecteur — c'est la
  // deuxieme zone morte de ce fichier en deux lots (voir `impostures`), et le
  // symptome est le meme : une erreur au premier usage, muette jusque-la.
  const visables = [];
  for (const b of bodies) {
    // La sphere de visee du corps : le « RFVolume » du calque 19 (tracker.js).
    const sphere = ((gameplay.placed || {}).ReferenceFrameSphere || [])
      .find((x) => x.body && x.body === b.bodyName);
    visables.push({ body: b, name: b.name,
                    position: [b.position0[0], b.position0[1], b.position0[2]],
                    radius: (b.gravity && b.gravity.upperSurfaceRadius) || 0,
                    rf: sphere && sphere.volume ? sphere.volume.radius : 0 });
  }
  if (marqueurs.length) console.log(`carte : ${marqueurs.length} marqueurs declares`);
  window.__dlgUI = dlgUI;   // sonde de verification : le dialogue au doigt
  window.__map = solarMap;
  window.__accesCarte = accesCarte;
  window.__autopilot = autopilot;
  window.__ship = !!ship;
  window.__shipRef = ship;   // sonde de verification
  window.__shipEvents = [];
  window.__death = death;
  window.__loop = loop;
  window.__respawn = respawn;
  window.__particles = { field: particles, total: particleMap.length, live: () => particles.count,
                        active: () => particles.particles, failed: () => particles.failed };
  window.__audio = { total: audioMap.length, live: () => audio.count,
                     playing: () => audio.playing, failed: () => audio.failed,
                     ambience };
  // point d'entree de verification : oriente la camera sans passer par le
  // verrouillage de souris, pour les captures automatisees
  window.__look = (y, p) => { yaw = y; pitch = p; };
  // Sonde : le regard courant. PAS `__regard`, qui est deja pris par les
  // toiles et les regards poses dans la scene — une collision de nom qui a
  // fait tomber un controle sans rapport.
  window.__regardCam = () => ({ yaw, pitch });
  // Tout le systeme, derriere le titre qui tourne encore : l'alpha charge
  // `level0` en entier avant de l'activer, et ses planetes se voient de loin
  // telles qu'elles sont (la vue lointaine de `Sectors`). Quarante-sept Mo de
  // geometrie mesures pour les huit lots, pas les deux cents que ce code
  // craignait.
  if (sectors) {
    sectors.lointain = true;
    await Promise.all(BODY_FILES.map((f) => store.request(f)));
  }
  // Le niveau 1 est pret : `AsyncOperation.allowSceneActivation`. Le titre
  // s'efface, la partie prend l'ecran.
  if (titre) {
    engine.stopRenderLoop(titre.ecran.rendu);
    titre.ecran.dispose();
  }
  window.__ready = true;
  window.__bodies = bodies;   // sonde de verification
  window.__player = player;   // sonde de verification : marche, saut, sac dorsal
  // Sonde de verification du depart : le pose lu dans le build, la marche
  // jusqu'au vaisseau, et l'ecart des yeux au joueur — qui ne se mesure qu'une
  // fois la camera placee, donc dans le navigateur (docs/38-depart.md).
  window.__start = { pose, walk, v0: null, eye: () => ({
    x: camera.position.x - player.pos.x,
    y: camera.position.y - player.pos.y,
    z: camera.position.z - player.pos.z }) };

  // --- entrees ---
  // Le lacet part de l'orientation du point d'apparition : c'est elle qui
  // decide de la premiere image du jeu.
  // `SpawnPlayer` : on ouvre les yeux QUATRE-VINGTS DEGRES au-dessus de
  // l'horizon. Le tangage de ce portage compte positif vers le BAS, d'ou le
  // signe (docs/108-reveil.md).
  let yaw = yaw0, pitch = -REVEIL.degreesY * Math.PI / 180;
  const reveil = new Reveil();
  reveil.start();
  // `Time.timeSinceLevelLoad` : la boucle EST un rechargement de scene, ce que
  // ce portage tient deja pour la pellicule du flashback.
  let chargeA = performance.now() / 1000;
  window.__reveil = reveil;
  // `CenterCamera` : le recentrage n'est pas un saut, c'est une DUREE tiree
  // d'une distance angulaire — `Sqrt(dx^2 + dy^2) / rate` — puis un SmoothStep
  // par-dessus (docs/69-assise.md). Le meme calcul que le demi-tour du corps,
  // au meme taux : les deux arrivent ensemble.
  let recentrage = null;
  // Le lacet d'ou part le demi-tour du siege. Garde separement parce que la
  // fraction s'applique a l'ECART, et qu'un ecart se mesure depuis un depart.
  let lacetSiege = null;
  // Le champ que le verrouillage demande, ou null. Il ne s'ecrit pas ici :
  // la lunette a le dernier mot sur `camera.fov`, et les deux ne se melangent
  // pas plus dans le build que dans le portage.
  let verrouFOV = null;
  // Le roulis vient du MEME mouvement de souris que le lacet, aiguille par la
  // touche alt (`Swap Roll/Yaw`). Il s'accumule ici et se consomme a l'image.
  let rollInput = 0;
  const keys = Object.create(null);
  // Un relachement attend la FIN de l'image.
  //
  // `OWInput` interroge Unity, qui latche `GetButtonDown` et `GetButtonUp` : un
  // appui plus court qu'une image y est vu quand meme. Un objet `keys` lu a
  // chaque image, lui, perd la frappe entiere si l'appui et le relachement
  // tombent entre deux images — et la sonde, qui se charge en TENANT, ne
  // partait jamais sur une pichenette. C'est `15_verify.py` qui l'a montre :
  // `keyboard.press()` fait les deux dans la meme milliseconde.
  const relachements = [];
  // Les boutons de la SOURIS sont des commandes a part entiere dans l'alpha :
  // `Lock On` est le clic gauche, `Probe` le droit, `Telescope` le milieu. Le
  // portage n'en lisait aucun, et avait mis ces trois actions sur des lettres.
  //
  // Ce sont des evenements POINTEUR et non des evenements souris, et la
  // difference n'est pas cosmetique : Babylon appelle `preventDefault()` sur
  // `pointerdown` pour son propre pilotage de camera, et un `preventDefault`
  // sur un evenement pointeur SUPPRIME les evenements souris de compatibilite
  // qui devaient suivre. Un `mousedown` pose sur la fenetre ne se declenchait
  // donc jamais — les mouvements passaient, les boutons non, et rien ne le
  // disait. C'est `15_verify.py` qui l'a trouve : la sonde ne partait pas.
  const souris = Object.create(null);
  const relachementsSouris = [];
  // UN RELACHEMENT N'ATTEND QUE SI L'APPUI N'A PAS ETE VU.
  //
  // Le report en fin d'image est la pour une frappe plus courte qu'une image :
  // sans lui, elle serait perdue. Mais il s'appliquait a TOUT relachement, et
  // une touche lachee entre deux images restait tenue pendant toute l'image
  // suivante. Unity rend `GetKey` faux des l'`Update` qui suit. A 60 images par
  // seconde, 17 ms ; sans GPU, pres d'une seconde : un appui court sur la
  // poussee du vaisseau finissait l'allumage (1 s) au lieu de l'annuler. On ne
  // reporte donc que ce qui a ete enfonce DEPUIS la derniere image.
  const neufs = new Set(), neufsSouris = new Set();
  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    souris[e.button] = true;
    neufsSouris.add(e.button);
  });
  addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") return;
    if (neufsSouris.has(e.button)) relachementsSouris.push(e.button);
    else souris[e.button] = false;
  });
  // Le clic droit ouvre le menu contextuel du navigateur, et c'est le bouton de
  // la sonde : sans cette ligne, lancer une sonde ouvre un menu — et le menu
  // avale le relachement, donc la sonde ne part jamais. On le refuse partout et
  // pas seulement sous verrou de souris : la page entiere est le jeu.
  addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    neufs.add(e.code);
    // Relachee puis renfoncee avant l'image : le relachement retenu ne vaut
    // plus, sinon la fin d'image lacherait une touche qu'on tient.
    const i = relachements.indexOf(e.code);
    if (i >= 0) relachements.splice(i, 1);
  });
  addEventListener("keyup", (e) => {
    if (neufs.has(e.code)) relachements.push(e.code);
    else keys[e.code] = false;
  });
  window.__keys = keys;
  window.__souris = souris;
  /** A appeler en fin d'image : applique les relachements retenus. */
  function appliquerRelachements() {
    while (relachements.length) keys[relachements.pop()] = false;
    while (relachementsSouris.length) souris[relachementsSouris.pop()] = false;
    // Tout ce qui est enfonce a maintenant ete vu par une image.
    neufs.clear();
    neufsSouris.clear();
  }
  let interactPressed = false, optionPressed = 0;
  // La sonde ne se declenche plus a l'appui : elle se CHARGE tant qu'on tient,
  // et le meme bouton la rappelle quand elle est posee. C'est l'etat MAINTENU
  // qui compte, donc `keys`, et non un drapeau leve par `command()`.
  let probeRefusee = false;
  // Les trois fronts de vol : viser, s'accorder, piloter. Ils sont poses par
  // `command()` et consommes par la boucle, comme `interactPressed`.
  let lockPressed = false, matchPressed = false, autoPressed = false;
  // La bascule de lunette de cette image : +1 on entre, -1 on sort, 0 rien.
  // `PlayerAttachPoint.OnExitTelescopeView` rejoue `InitAttachment`, qui veut
  // la pose du joueur — donc la boucle, pas le gestionnaire de touche.
  let lunetteBascule = 0;
  // La guimauve mangee dans cette image : le baton s'en sert pour se ranger.
  let mangeCetteImage = false;
  // Pour ne pas repeter l'annonce du mur a chaque image ou l'on s'y appuie.
  let murAnnonce = false;
  const lockOn = new LockOn();
  // La vue d'atterrissage : une camera, un regard, et des commandes qui
  // changent de main (docs/87-atterrissage.md).
  const atterrissage = new LandingView();
  window.__atterrissage = atterrissage;
  // Le regard vise par la bascule, en radians, ou null. Le build appelle
  // `SnapToDegrees(0, -70, 140)` : lacet ZERO, tangage -70, a 140 degres par
  // seconde. Ici le lacet du portage est absolu et non relatif au vaisseau — le
  // remettre a zero ferait pivoter la vue au hasard — donc seul le TANGAGE est
  // vise, et c'est lui qui porte le sens du geste : on regarde le sol.
  let snapRegard = null;
  // `ShipThrusterController._landingRF` : le referentiel du mode atterrissage.
  let atterrissageCorps = null;
  /** Vitesse du vaisseau relative au referentiel vise, ou null. */
  function viseeVitesseRelative() {
    if (!ship || !lockOn.current) return null;
    const v = lockOn.current.body.velocity || [0, 0, 0];
    return Math.hypot(ship.vel.x - v[0], ship.vel.y - v[1], ship.vel.z - v[2]);
  }
  // Avancement de la reparation en cours, pour l'invite a l'ecran.
  let repairFraction = 0;
  // La reparation visee, et l'instant ou elle s'est achevee (`_repairedTime`).
  let reparationVisee_ = null, reparationFinie = -Infinity;
  const hudReparation = (() => {
    const root = document.getElementById("ui");
    if (!root) return null;
    const d = document.createElement("div");
    d.className = "ow-reparation";
    d.hidden = true;
    root.appendChild(d);
    return d;
  })();

  /**
   * Une commande, designee par son code clavier — ou par « Mouse0 » a
   * « Mouse2 », parce que trois des canaux du build sont des boutons de
   * souris.
   *
   * Les boutons tactiles et ceux de la manette passent par ici avec le meme
   * code : il n'y a donc qu'un seul jeu de commandes, et rien en aval ne sait
   * d'ou vient l'ordre.
   *
   * Le test ne porte plus sur la touche mais sur le CANAL : `est("Telescope")`
   * plutot que `code === "KeyT"`. Les touches viennent alors de
   * `data/input.json`, et les changer ne demande pas de toucher a ce fichier.
   */
  function command(code) {
    const est = (canal) => {
      const c = cmds.get(canal);
      if (!c) return false;
      const m = /^Mouse(\d+)$/.exec(String(code));
      if (m) return c.pos.mouse.includes(Number(m[1]));
      return c.pos.codes.includes(code) || c.neg.codes.includes(code);
    };
    if (est("Interact")) interactPressed = true;
    // `Lock On` (clic gauche), `Match Velocity` (espace) et `Autopilot` (E)
    // sont les trois canaux de vol. Les deux derniers partagent leur touche
    // avec le saut et l'interaction : c'est le MODE qui tranche dans le build,
    // et ici la condition (en vol, une cible) qui joue le meme role.
    if (est("Lock On")) lockPressed = true;
    if (est("Match Velocity")) matchPressed = true;
    if (est("Autopilot")) autoPressed = true;
    const m = /^Digit([1-9])$/.exec(code);
    if (m) optionPressed = parseInt(m[1], 10);
    // `EnterMapView` / `ExitMapView` : ouvrir avec une cible visee vous CADRE
    // tous les deux, et le son d'ouverture a dix secondes de garde
    // (docs/117-carte.md).
    // La touche ne repond que si `MapController` est allume : combinaison sur
    // le dos, ou carte ouverte depuis l'observatoire (map.js, `AccesCarte`).
    if ((est("Map") || code === "KeyM") && accesCarte.actif) {
      if (solarMap.open) fermerCarte();
      else {
        const r = ouvrirCarte();
        // Le son d'ouverture est celui de la source du `MapController`, pas un
        // clip d'interface : s'il n'est pas extrait, la garde de dix secondes
        // reste vraie et rien ne joue.
        if (r.sonne) {
          const s = sonsUI.mapZoom();
          if (s) audio.playOneShot(s.file, { volume: s.volume });
        }
      }
    }
    if (est("Recenter Map") && solarMap.open) solarMap.recenter();
    // La lampe : `Flashlight`, la touche F du build — et la croix
    // directionnelle a la manette (axe 6).
    if (est("Flashlight")) {
      // `UIAudioController` ecoute `TurnOnFlashlight` ET `TurnOffFlashlight`,
      // et joue `_switch01` dans les deux cas : un interrupteur fait le meme
      // bruit a l'aller et au retour.
      bipUI(flashlight.toggle() ? "TurnOnFlashlight" : "TurnOffFlashlight");
    }
    // L'ordinateur de bord ne se consulte qu'a l'interieur du vaisseau ; ce
    // portage n'a pas d'interieur, on l'ouvre donc depuis le poste de pilotage.
    // Le build n'a pas de canal pour lui : c'est un ajout, et `AJOUTS` le dit.
    if (est("Ship Computer") && ship && ship.boarded) {
      const openAvant = computer.open;
      computer.open = !computer.open;
      if (!openAvant && computer.open) {
        const s = sonsUI.shipComputerBoot();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
      }
    }
    if (computer.open) {
      if (code === "ArrowLeft") { computer.move(-1); bipUI("AdvanceText"); }
      if (code === "ArrowRight") { computer.move(1); bipUI("AdvanceText"); }
      if (code === "Enter" || code === "Space") {
        const cur = computer.current;
        computer.select();
        if (cur && cur.revealed) bipUI("PlayAffirmativeUISound");
        else bipUI("PlayNegativeUISound");
      }
      if (code === "Backspace" || est("Cancel")) computer.cancel();
    }
    if (consoles.active && consoles.active.flight && est("Cancel")) {
      const socle = reposModeleCadre(framePos);
      const d = Math.hypot(modele.pos[0] - socle[0], modele.pos[1] - socle[1],
                           modele.pos[2] - socle[2]);
      if (d > 1) {
        // `RespawnModelShip` : position, ROTATION de `_respawnPoint`, vitesse
        // du point porteur (nulle dans le repere de Timber Hearth), rotation
        // arretee.
        modele.pos = socle;
        modele.vel = [0, 0, 0];
        modele.quat = modele.reposQuat.slice();
        modele.omega = [0, 0, 0];
        modele.pose = true;
        const s = sonsUI.modelShipRespawn();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
        console.log("annonce : RespawnModelShip");
      } else {
        consoles.toggle([player.pos.x + framePos[0],
                         player.pos.y + framePos[1],
                         player.pos.z + framePos[2]]);
      }
    }
    // §Q LA LUNETTE FAIT TAIRE LE MONDE, et l'assise la laisse regarder.
    //
    // `Telescope.EnterTelescope` ne fait pas que changer le champ de vision :
    // sa PREMIERE ligne est `GetAudioMixer().IsolateTrack(Signal, 0.2f, 1f)`.
    // Toutes les pistes sauf celle des signaux tombent a un cinquieme en une
    // seconde — c'est ainsi qu'on entend un emetteur : le reste se tait.
    // `ExitTelescope` les rend, a un, en une seconde aussi.
    //
    // Et `AttachPlayer` s'abonne a `EnterTelescopeView` / `ExitTelescopeView`
    // tant qu'on est accroche, `DetachPlayer` s'en desabonne : le point
    // d'accrochage suspend son suivi de rotation le temps qu'on vise, puis
    // rejoue `InitAttachment` — le demi-tour RECOMMENCE depuis l'angle ou l'on
    // ressort, et non depuis celui ou l'on s'etait assis. Sans cela, ranger la
    // lunette ramenait le regard d'un coup.
    if (est("Telescope")) {
      const ouverte = telescope.toggle();
      mixer.isolate("Signal", ouverte ? TELESCOPE_MIX : 1, 1);
      // La sortie de lunette a besoin de la pose du joueur, que seule la boucle
      // connait : on note la transition, elle la joue.
      lunetteBascule = ouverte ? 1 : -1;
    }
    // Consoles a camera deportee : `Landing Camera`, la meme touche que la
    // photo arriere de la sonde — le build les separe par jeu de commandes,
    // pas par touche.
    // `FlightConsole.Update` : au poste de pilotage, `toggleLandingCam` ouvre
    // la VUE d'atterrissage. Ailleurs le portage garde ce canal pour les
    // consoles deportees, qui n'ont pas d'autre touche ici.
    if (est("Landing Camera") && ship && ship.boarded) {
      const t = atterrissage.toggle(performance.now() / 1000,
                                    viseeVitesseRelative());
      if (t && t.snap) {
        // Le regard bascule des l'APPUI, la camera 0,45 s plus tard : on voit
        // le sol arriver avant d'y etre.
        snapRegard = t.snap[1] * Math.PI / 180;
      }
      // `CenterCamera(140)` : en ressortir recentre, au meme rythme.
      if (t && t.centre) snapRegard = 0;
      // `Autopilot.InitMatchVelocity` : au-dela de vingt unites de vitesse
      // RELATIVE, le jeu ne vous laisse pas basculer en vue d'atterrissage sans
      // rien faire. Il n'y POSE pas la vitesse : il engage l'asservissement,
      // qui met |Δv| / poussee a la ramener (docs/107-pilote.md).
      if (t && t.match && lockOn.current && autopilot) {
        autopilot.matchVelocity(lockOn.current.body);
        console.log("vue d'atterrissage : egalisation automatique");
      }
    } else if (est("Landing Camera") && consoles.count) {
      const c = consoles.toggle([player.pos.x + framePos[0],
                                 player.pos.y + framePos[1],
                                 player.pos.z + framePos[2]]);
      // §S La salle s'eteint pendant qu'on regarde la projection, et se
      // rallume quand on lache. Deux secondes dans les deux sens.
      if (fadeLight && fadeCible) {
        const t = performance.now() / 1000;
        const vise = (c && !c.flight) ? 0 : (fadeCible.intensity ?? 1);
        fadeLight.fadeIntensity(vise, SATELLITE_FADE, t);
      }
      console.log(c ? `console prise : ${c.name}` : "console lachee");
    }
    // La guimauve se mange quand elle est assez grillee (0,6).
    // Dans le build, c'est OWInput.interact (E) qui la mange ; le portage avait
    // ajoute la touche B. Les deux sont permises.
    if ((est("Marshmallow") || (est("Interact") && marshmallow.edible)) && marshmallow.eat()) {
      mangeCetteImage = true;
      const sonMastication = sonsUI.eatMarshmallow();
      if (sonMastication) audio.playOneShot(sonMastication.file, { volume: sonMastication.volume });
      // `PlayerResources.OnEatMarshmallow` : la sante repart au MAXIMUM. Deux
      // lignes d'IL, et le soin du jeu — le portage comptait les guimauves
      // sans rien en faire (docs/67-annonces.md).
      const soigne = eatMarshmallowHeals(resources);
      console.log(`guimauve mangee (${marshmallow.eaten})`
        + (soigne > 0 ? `, +${soigne.toFixed(0)} de sante` : ""));
    }
    // Sortir ou ranger le baton : `ToggleStick`. Le build n'a pas de canal pour
    // lui — c'est le tutoriel du feu de camp qui l'appelle — et le portage lui
    // donne la meme touche que manger, en appui long ? Non : une touche a part,
    // et `AJOUTS` la nomme.
    if (est("Stick")) {
      console.log(baton.toggle() ? "baton sorti" : "baton range");
    }
    // GUIMode fait tourner ses quatre modes sur une touche de debogage
    if (est("Display Mode")) console.log("mode d'affichage :", guiMode.cycle());
    // Le menu des reglages, comme dans le jeu, met le temps en pause.
    // `Menu.Update` : `cancel` FERME, et c'est la meme sortie que l'option
    // « Back ». Ouvrir releve `EnterMenuMode`, fermer `ExitMenuMode`, et
    // fermer REPREND LA SOURIS — `Screen.lockCursor = true` (docs/115-menu.md).
    if (est("Pause") && settingsUI) {
      // Les annonces que rendent `ouvre` et `ferme` ne sont PAS rejouees ici :
      // le bloc des modes les leve deja en lisant l'etat (§K), et les dire
      // deux fois en ferait deux transitions. Ce qui compte ici est l'autre
      // moitie de `SettingsMenu.Close`, celle que le bloc des modes ne peut
      // pas faire : la souris.
      if (settings.open) settings.ferme(); else settings.ouvre();
      if (settings.open) {
        // `Menu.Open` : `_mouseActive = Screen.showCursor`. Dans un navigateur,
        // le curseur est visible precisement quand il n'est pas verrouille.
        menuInput.reouvre(!document.pointerLockElement);
      } else reprendSouris();
      settingsUI.render();
    }
    if (settings.open && settingsUI) {
      // Les fleches sont la lecture clavier de `moveZ` et `moveX` : elles
      // passent par la MEME cadence que le manche, sans quoi la repetition
      // automatique du navigateur parcourt les sept options en deux dixiemes
      // de seconde.
      const tReel = performance.now() / 1000;
      const verrou = !!(settings.options[settings.index] || {}).locked;
      // Les touches du build d'abord : `Menu.Update` lit `moveZ` et `moveX`,
      // soit W/S et I/K, A/D et J/L. Le portage ne lisait que les fleches,
      // qu'aucun canal ne lie — dans l'alpha, S descend d'une ligne ; ici,
      // rien (docs/132). Les fleches restent : ce sont les codes que la croix
      // de la manette et le pave tactile envoient.
      const signe = (canal) => {
        const c = cmds.get(canal);
        if (!c) return 0;
        return c.pos.codes.includes(code) ? 1 : c.neg.codes.includes(code) ? -1 : 0;
      };
      const z = code === "ArrowUp" ? 1 : code === "ArrowDown" ? -1 : signe("Move Z");
      const x = code === "ArrowRight" ? 1 : code === "ArrowLeft" ? -1 : signe("Move X");
      const g = menuInput.axes(tReel, z, x, verrou);
      if (g.move) settings.move(g.move);
      if (g.toggle) settings.toggle(g.toggle);
      // `interact`, `jump` ou le bouton gauche : trois entrees pour la meme
      // validation. Le portage n'avait que la barre d'espace et Entree, qui
      // n'est nulle part dans le build.
      //
      // Le menu MANGE l'interaction : le build y arrive par les modes, dont
      // l'ensemble « menu » ne contient pas `Interact`. Sans cette ligne,
      // valider une option ferait en plus s'asseoir ou se lever.
      interactPressed = false;
      if (code === "Enter" || code === "Space" || code === "KeyE") {
        // `TriggerLoad(true, ...)` : une nouvelle partie EFFACE la sauvegarde,
        // puis recharge la scene. Ici la scene ne se recharge pas — on la
        // remet a son etat de depart, ce que la boucle sait deja faire — mais
        // `PlayerData` repart bien de zero, savoirs et exploration compris.
        const choisi = settings.toggle(0);
        if (choisi === "exit") retourAuTitre();
      }
      applySettings();
      settingsUI.render();
    }
    if (dialogue.active) {
      // `ConversationInput.chooseResponse` est l'axe `moveZ` : W monte d'une
      // option, S descend, un cran par appui (`_cursorLocationChanged`). Le
      // portage ne lisait que les fleches ; elles restent, pour la croix de
      // la manette. Le choix, lui, passe par `advanceText`, la touche
      // d'interaction (plus bas) ; Entree reste un raccourci.
      const n = (dialogue.view && dialogue.view.options.length) || 0;
      const cz = cmds.get("Move Z");
      const z = code === "ArrowUp" ? 1 : code === "ArrowDown" ? -1
        : !cz ? 0 : cz.pos.codes.includes(code) ? 1 : cz.neg.codes.includes(code) ? -1 : 0;
      if (z > 0) dlgUI.moveCursor(-1, n);
      if (z < 0) dlgUI.moveCursor(1, n);
      if (code === "Enter" && n) optionPressed = dlgUI.cursor + 1;
    }
  }
  addEventListener("keydown", (e) => command(e.code));
  // Trois canaux du build sont des boutons de souris — `Lock On` a gauche,
  // `Probe` a droite, `Telescope` au milieu — et le portage n'en lisait aucun.
  addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") command(`Mouse${e.button}`);
  });

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
    // §T `_isInputLocked` : pendant que le jeu vous retourne, il vous prend les
    // commandes du regard. C'est le seul moment ou elles ne repondent plus, et
    // c'est ce qui donne son poids a la perte du sol.
    if (alignement.locked) return;
    // La bascule de la vue d'atterrissage prend le tangage le temps du
    // mouvement : `SnapToDegrees` ne se laisse pas interrompre.
    if (snapRegard !== null) return;
    // DEUX SENSIBILITES, et le portage n'en appliquait qu'une. Le menu du build
    // en pose deux — `lookSensitivity` et `flightSensitivity` — et le second
    // n'avait aucun effet : on reglait la sensibilite de vol, et rien ne
    // changeait. Aux commandes du vaisseau, c'est elle qui vaut
    // (docs/93-commandes.md).
    const f = (ship && ship.boarded) ? settings.flightFactor()
                                     : settings.lookFactor();
    const w = Math.max(320, (window.innerWidth || 1280));
    const k = (TURN / w) * (telescope && telescope.active
      ? (player.c.telescopeTurnScalar ?? 0.5) : (player.c.suitTurnScalar ?? 1));
    // `Swap Roll/Yaw` : le build n'a pas d'axe de roulis. `JetpackInput.roll` et
    // `JetpackInput.yaw` sont construits sur le MEME canal (`yaw`), et la touche
    // alt choisit lequel des deux recoit le mouvement. Le portage avait invente
    // une paire Q/Z — or Q est le canal `Cancel` du build.
    // `ShipThrusterController.Update` :
    //   isRollMode = GetButton(swap) ? !rollByDefault : rollByDefault
    // En vue d'atterrissage le defaut s'inverse — le manche ROULE, et c'est la
    // touche alt qui rend le lacet (docs/87-atterrissage.md).
    // Aux commandes du modele reduit, la souris le fait tourner lui : le
    // regard reste verrouille sur lui (`LockOn`, docs/78).
    if (consoles.active && consoles.active.flight && modele) {
      sourisModele.dx += dx;
      sourisModele.dy += dy;
      return;
    }
    const roulisDefaut = !!(ship && ship.boarded && atterrissage.rollByDefault);
    if (rollMode(!!(cmds && cmds.held("Swap Roll/Yaw", { keys })), roulisDefaut)) {
      // `_flipRollFactor` vaut -1 en vue d'atterrissage : le roulis s'inverse.
      rollInput += dx * k * gain * Math.abs(f) * atterrissage.flipRollFactor;
      return;
    }
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
  if (touchAvailable()) {
    touch.enable();
    touch.setContext({ menu: false, map: false, suit: equipment.suit });
  }

  // --- manette ---
  //
  // Meme principe que le tactile, et pour la meme raison : elle ne cree aucune
  // commande, elle produit les memes axes et les memes codes. Le build decrit
  // une manette entiere (`XboxInput`) et les invites portent deja le bouton
  // attendu, avec son icone — c'etait la derniere entree decrite et jamais lue.
  // Les boutons TENUS de la manette : ils rejoignent l'etat du clavier et de la
  // souris, de sorte que `cmds.held(...)` reponde pareil d'ou que vienne
  // l'ordre. Sans cela, la gachette de sonde ne pourrait pas se charger.
  const padHeld = new Set();
  const pad = new GamepadControls({
    onKey: command,
    onLook: (dx, dy) => look(dx, dy, 1),
    onHold: (codes) => { padHeld.clear(); for (const c of codes) padHeld.add(c); },
  });
  window.__pad = pad;
  addEventListener("gamepadconnected", (e) => {
    console.log("manette branchee :", e.gamepad && e.gamepad.id);
  });
  if (padAvailable()) console.log("manette detectee au demarrage");
  // LES DEUX TABLES DOIVENT DIRE LA MEME CHOSE. `input.js` porte la liaison
  // `pad` de chaque canal en numeros d'Unity, `gamepad.js` la sienne en numeros
  // du navigateur : deux tables ecrites a la main depuis le meme
  // `InputManager`, et rien ne les obligeait a rester d'accord. Le portage s'y
  // est deja trompe sur quatre lignes de six (docs/61). Le desaccord se dit au
  // demarrage plutot que de se sentir a la manette (docs/94-manette.md).
  {
    const desaccords = padDisagreements(cmds);
    window.__padAccord = desaccords;
    if (desaccords.length) {
      console.warn("manette : les deux tables ne s'accordent pas", desaccords);
    }
  }
  // En paysage de telephone, le coin bas-droit revient aux boutons d'action :
  // la vue de sonde passe a gauche, sous les jauges.
  if (touch.enabled) probeCam.setViewport(0.02, 0.42, 0.26, 0.3);
  // La couche existe enfin : la boite de dialogue peut mesurer la place que le
  // losange d'action lui prend. Sans ce rappel, elle garde l'echelle calculee
  // dans son constructeur, ou `#touchui` etait encore vide.
  if (touch.enabled) dlgUI.resize();
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
    // La promesse peut echouer — un navigateur sans verrou de souris, une
    // page qui n'a pas le focus, un Chromium sans tete. Sans ce `catch`, elle
    // remonte en erreur non attrapee, et `15_verify.py` la compte comme telle.
    // Menu ouvert, on ne reprend PAS la souris : le build la relache justement
    // pour qu'on puisse viser une option, et `Close` la reprendra.
    if (!touch.enabled && !(settings && settings.open)) {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  });
  // le navigateur bloque l'audio tant qu'aucun geste utilisateur n'a eu lieu ;
  // au doigt, ce geste n'atteint jamais le canvas, qui est sous la couche
  // tactile — on l'ecoute donc au niveau de la fenetre
  addEventListener("pointerdown", () => { if (!audio.unlocked) audio.unlock(); });
  /**
   * `SettingsMenu.Close` : `Screen.showCursor = false; Screen.lockCursor = true`.
   *
   * Fermer le menu REPREND la souris. Le portage la laissait ou elle etait :
   * une fois le curseur sorti pour cliquer une option, on retournait au jeu
   * sans regard a la souris, et il fallait recliquer sur la page.
   */
  function reprendSouris() {
    if (touch.enabled) return;
    if (document.pointerLockElement === canvas) return;
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  addEventListener("mousemove", (e) => {
    // `Menu.Update` : au-dela d'un dixieme de pixel, le menu passe a la souris
    // — le verrou tombe et le curseur reparait. Le curseur n'apparait donc PAS
    // a l'ouverture : il apparait au premier geste (docs/115-menu.md).
    if (settings && settings.open) {
      const d = Math.hypot(e.movementX || 0, e.movementY || 0);
      if (menuInput.souris(d) && document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      return;
    }
    if (document.pointerLockElement !== canvas) return;
    look(e.movementX, e.movementY);
  });

  // --- boucle ---
  //
  // Position monde de l'origine du repere courant, tenue a jour a chaque image :
  // les commandes en ont besoin hors de la boucle (les consoles, par exemple,
  // sont posees en coordonnees monde).
  let framePos = [0, 0, 0];
  // UNE IMAGE, CE SONT PLUSIEURS PAS (input.js, `decoupeImage`).
  //
  // Le temps d'une image est decoupe en sous-pas d'au plus 0,05 s, borne a la
  // seconde du `TimeManager` du build, et Havok avance AVEC chacun d'eux.
  // Babylon le faisait avancer seul, une fois par image, du delta reel — mais
  // `applyForce` y devient une impulsion de `force * getTimeStep()`, le pas
  // FIXE de 1/60 : sous 60 images par seconde la gravite faiblissait d'autant,
  // pendant que le monde, lui, avancait du temps reel. Les deux horloges ne
  // s'accordaient qu'a 60 images par seconde.
  let horlogeImage = 0;
  const physique = plugin ? scene.getPhysicsEngine() : null;
  if (physique) scene.physicsEnabled = false;
  scene.registerBeforeRender(() => {
    // SettingsMenu.Open met Time.timeScale a 0 : le menu fige la partie
    const { n, h } = decoupeImage(
      (settings && settings.open) ? 0 : engine.getDeltaTime() / 1000,
      cmds.maxTimestep);
    const now = performance.now() / 1000;
    // `Time.time` : l'horloge de l'image, avancee une fois pour toutes AVANT
    // les sous-pas. Les minuteries des scripts `Update` s'y lisent.
    horlogeImage += n * h;
    for (let i = 0; i < n; i++) {
      if (physique && h > 0) {
        // La force posee au pas precedent se paie sur CE pas : meme duree.
        plugin.setTimeStep(h);
        physique._step(h);
      }
      pasDeJeu(h, now);
      // Un appui est un FRONT : il appartient au premier sous-pas de l'image,
      // comme `GetButtonDown` n'est vrai que dans un seul `Update`.
      interactPressed = false;
      // Et une frappe plus courte qu'une image vaut UN pas, pas l'image
      // entiere : relachee apres le premier sous-pas. Tenue jusqu'a la fin de
      // l'image, une pichenette de 120 ms durait une seconde de jeu sans GPU,
      // passait le seuil de rappel de la sonde (0,3 s) et la rappelait au
      // lieu de la photographier.
      appliquerRelachements();
    }
  });

  function pasDeJeu(dt, now) {

    // §T L'alignement sur le champ : on le perd, on le retrouve.
    {
      // L'ecart entre « le corps » et « le regard » se passe sous la forme du
      // build — deux poses — et c'est le TANGAGE qui les separe ici : la pose
      // alignee sur l'horizon, et la meme plus le tangage. Le lacet, lui, ne
      // compte pas : le corps le suit deja.
      const demiP = pitch / 2;
      const t = alignement.update(!!player.field, now,
                                  [[0, 0, 0, 1],
                                   [Math.sin(demiP), 0, 0, Math.cos(demiP)]]);
      if (t === "break") {
        console.log("annonce : BreakPlayerFieldAlignment");
        // `CenterCamera(50)` — et non les cent du siege.
        recentrage = { debut: now, depart: [pitch * 180 / Math.PI, 0],
                       duree: snapDuration(pitch * 180 / Math.PI, 0, 0, 0,
                                           FIELD_ALIGN.rate) };
      } else if (t === "init") {
        console.log("annonce : InitPlayerFieldAlignment");
        // `StopSnapping()` : retrouver le sol rend les commandes TOUT DE
        // SUITE, et interrompt le recentrage en cours.
        recentrage = null;
        // `InitAlignment` pose aussi `_keepCameraSteady = true` : le regard va
        // rendre au tangage tout ce que le corps prend, jusqu'a un degre pres.
        redressement.init();
      }
    }

    // §N La vitesse de depart, une seule fois, quand le repere existe.
    if (departAFaire) {
      departAFaire = false;
      const v0 = vitesseDeDepart([player.pos.x, player.pos.y, player.pos.z]);
      player.vel.x = v0[0]; player.vel.y = v0[1]; player.vel.z = v0[2];
      // La vitesse DE DEPART, gardee telle quelle. Le controle navigateur
      // lisait `player.vel` en cours de route et appelait cela « la vitesse
      // initiale » : ce qu'il mesurait alors n'etait plus le depart mais ce
      // que le joueur avait fait depuis (docs/111-passages.md).
      window.__start.v0 = v0.slice();
      const jour = anchorBody ? spinPeriod(anchorBody) : null;
      if (jour) {
        console.log(`${anchorBody.name} : un tour en ${Math.round(jour)} s, `
          + `sol a ${Math.hypot(v0[0], v0[1], v0[2]).toFixed(2)} u/s au depart`);
      }
    }

    // repere camera aligne sur la verticale locale du champ dominant
    const f = player.field;
    // `_affectsAlignment` : un champ directionnel sur 34 pousse SANS retourner
    // ce qu'il tient. `alignDir` porte donc la verticale a suivre, qui n'est
    // pas toujours la direction de la force (docs/36-audit.md §2.9).
    const ad = f ? (f.alignDir || f.dir) : null;
    // §M SE REDRESSER PREND 1,8 s POUR UN DEMI-TOUR. `AlignWithDirection` n'etait
    // lue nulle part : le portage prenait le bas du champ dominant tel quel, a
    // chaque image, et changer de champ faisait basculer le monde d'un coup. Le
    // build y met cent degres par seconde, et retire du TANGAGE tout ce que le
    // corps prend tant que l'ecart depasse un degre (docs/106-redressement.md).
    // SANS CHAMP, ON NE SEME RIEN. `_doAlignment` est faux tant qu'aucun champ
    // n'est detecte, et le corps garde alors son orientation. Semer la
    // verticale du monde en attendant ferait converger le premier champ trouve
    // depuis `(0, 1, 0)` — 1,8 s pendant lesquelles le regard pose au point
    // d'apparition ne designe pas ce qu'il designait. Six controles de la sonde
    // l'ont dit, et son tir depend justement du regard (docs/106).
    const upVoulu = ad ? [-ad.x, -ad.y, -ad.z] : null;
    const upAvant = redressement.up;
    const pas = redressement.update(upVoulu, dt);
    const u0 = pas.up || [0, 1, 0];
    const up = new BABYLON.Vector3(u0[0], u0[1], u0[2]);
    if (redressement.steady && upAvant && pas.tourne > 0) {
      // Le regard reste ou il etait : on reconstruit l'avant MONDE dans le
      // repere d'avant le pas, et on redit les deux angles dans celui d'apres.
      // Le build n'ecrit qu'un `AddDegreesY` parce que son cap vit sur le
      // `Rigidbody` ; ici le lacet se mesure sur un repere re-derive du haut,
      // donc ne corriger que le tangage laisserait la vue deriver.
      const hbA = horizonBasis(upAvant);
      const cyA = Math.cos(yaw), syA = Math.sin(yaw);
      const cpA = Math.cos(pitch), spA = Math.sin(pitch);
      const f0 = [hbA.north[0] * cyA * cpA + hbA.east[0] * syA * cpA + upAvant[0] * -spA,
                  hbA.north[1] * cyA * cpA + hbA.east[1] * syA * cpA + upAvant[1] * -spA,
                  hbA.north[2] * cyA * cpA + hbA.east[2] * syA * cpA + upAvant[2] * -spA];
      const vu = steadyLook(f0, pas.up);
      if (vu.yaw !== null) yaw = vu.yaw;
      pitch = vu.pitch;
    }
    // Le repere d'horizon vit dans start.js : le lacet lu sur le SpawnPoint et
    // le lacet de la camera doivent se mesurer dans le MEME repere, sinon
    // l'orientation du build arrive juste et la tete est tournee de travers.
    const hb = horizonBasis([up.x, up.y, up.z]);
    // Sonde : tourner le regard vers un point du repere, dans ce meme repere
    // d'horizon (les controles de la visee s'en servent).
    sondeInteraction.viser = (cible) => {
      const d = [cible[0] - camera.position.x, cible[1] - camera.position.y,
                 cible[2] - camera.position.z];
      const n = Math.hypot(d[0], d[1], d[2]) || 1;
      const y = yawFor(d, [up.x, up.y, up.z]);
      if (y !== null) yaw = y;
      pitch = -Math.asin(Math.max(-1, Math.min(1, (d[0] * up.x + d[1] * up.y + d[2] * up.z) / n)));
    };
    const east = new BABYLON.Vector3(hb.east[0], hb.east[1], hb.east[2]);
    const north = new BABYLON.Vector3(hb.north[0], hb.north[1], hb.north[2]);
    // `CenterCamera(_rotationRate)` : le regard revient au centre du siege sur
    // une DUREE, pas d'un coup. Le build recentre les deux degres ; ici le
    // lacet du corps est deja repris par `_matchRotation`, et il ne reste que
    // le tangage — le seul des deux que le portage tienne separement.
    // §O LE REVEIL. Sept secondes le regard au ciel, puis la camera redescend
    // seule a cinquante degres par seconde — sauf si le joueur a deja regarde
    // plus bas que quarante-cinq degres, auquel cas on lui laisse la tete.
    {
      const degresY = -pitch * 180 / Math.PI;   // convention du build : + vers le haut
      if (reveil.update(now - chargeA, degresY) === "centre") {
        recentrage = { debut: now, depart: [pitch * 180 / Math.PI, 0],
                       duree: snapDuration(pitch * 180 / Math.PI, 0, 0, 0,
                                           REVEIL.rate) };
        console.log("reveil : la camera se recentre");
      }
    }
    if (recentrage) {
      const ecoule = now - recentrage.debut;
      // `UpdateSnapping` interpole les DEUX degres sous un meme SmoothStep. Le
      // couple est garde tel quel — le lacet en second, toujours nul ici —
      // pour que la loi reste celle du build et non une moitie de loi.
      const d = snapDegrees(recentrage.depart, [0, 0], ecoule, recentrage.duree);
      pitch = d[0] * Math.PI / 180;
      if (turnFraction(ecoule, recentrage.duree) >= 1) recentrage = null;
    }
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = north.scale(cy * cp).add(east.scale(sy * cp)).add(up.scale(-sp));
    const right = north.scale(-sy).add(east.scale(cy));

    // §K CE QUI SE COMMANDE, ET QUAND (docs/70-modes.md).
    //
    // `OWInput` echange un ENSEMBLE de canaux actifs a chaque changement de
    // mode, et `GetAxis` rend zero pour tout canal absent. Le portage lisait
    // les vingt-deux canaux en permanence — ce qui n'est vrai dans aucun mode
    // du jeu, pas meme a pied.
    //
    // Les transitions se lisent sur l'ETAT plutot que sur les appels : chaque
    // bascule de mode a deja son booleen ici, et les guetter est exact la ou
    // brancher soixante appels aurait laisse des trous. Les sorties passent
    // d'abord, dans l'ordre inverse des entrees, pour que la case de
    // sauvegarde d'`OWInput` se vide dans le bon ordre.
    {
      const etats = [
        ["menu", !!(settings && settings.open)],
        ["dialogue", !!dialogue.active],
        ["carte", !!solarMap.open],
        ["lunette", !!(telescope && telescope.active)],
        // Les deux consoles deportees du build ne donnent PAS le meme jeu de
        // commandes : `RemoteFlightConsole` pose celui du vaisseau miniature
        // (huit canaux, pas de sonde ni de carte), la console du satellite en
        // pose trois — annuler, photographier, photographier en arriere.
        //
        // `EnterLandingView`, la caméra d'atterrissage du vaisseau, n'a pas
        // d'equivalent ici : ce portage n'a pas de vue d'atterrissage separee,
        // et son canal « Landing Camera » bascule les consoles deportees. Son
        // ensemble est donc lu, garde, et sans appelant — dit plutot qu'omis.
        ["satellite", !!(consoles.active && !consoles.active.flight)],
        ["modele", !!(consoles.active && consoles.active.flight)],
        ["ordinateur", !!computer.open],
        ["vaisseau", !!(ship && ship.boarded)],
      ];
      // Les transitions passent par l'ANNONCE du build quand il y en a une :
      // `EnterMapView`, `ExitFlightConsole`… Le portage faisait deja la bonne
      // chose sous ses propres noms ; il la dit maintenant dans celui du jeu.
      const bascule = (nom, sens) => {
        const dit = annonceDe(nom, sens);
        if (dit) modes.annonce(dit);
        else if (sens === "entre") modes.entre(nom);
        else modes.sort(nom);
      };
      for (let i = etats.length - 1; i >= 0; i--) {
        const [nom, on] = etats[i];
        if (!on && modes.dedans.has(nom)) { modes.dedans.delete(nom); bascule(nom, "sort"); }
      }
      for (const [nom, on] of etats) {
        if (on && !modes.dedans.has(nom)) { modes.dedans.add(nom); bascule(nom, "entre"); }
      }
      // `OnPlayerDeath` pose un ensemble VIDE : un mort ne commande rien du
      // tout, pas meme d'ouvrir le menu. Le portage coupait deja le
      // deplacement ; il laissait la lampe, la carte et la sonde.
      // --- la vue d'atterrissage : son delai, son regard, son mode ---
      //
      // `UpdateLandingMode` : la camera ne bascule que 0,45 s apres l'appui, et
      // c'est alors que `EnterLandingView` part. Le MODE, lui, demande en plus
      // un referentiel vise, assez proche, et un vaisseau pas pose.
      if (atterrissage.update(now)) modes.annonce("EnterLandingView");
      if (snapRegard !== null) {
        const pas = (ATTERRISSAGE.snapDegrees * Math.PI / 180) * dt;
        const ecart = snapRegard - pitch;
        if (Math.abs(ecart) <= pas) { pitch = snapRegard; snapRegard = null; }
        else pitch += Math.sign(ecart) * pas;
      }
      const cibleAtt = lockOn.current ? lockOn.current.body : null;
      const dAtt = cibleAtt
        ? Math.hypot(cibleAtt.position[0] - ship.pos.x,
                     cibleAtt.position[1] - ship.pos.y,
                     cibleAtt.position[2] - ship.pos.z)
        : Infinity;
      const cadreAtt = cibleAtt
        ? autopilotDistances(declared.frames, cibleAtt.name,
                             (cibleAtt.gravity && cibleAtt.gravity.upperSurfaceRadius) || 0)
        : null;
      // `GetAllowLandingMode` s'ouvre sur `if (!enabled)` : hors du poste, le
      // mode ne s'etablit pas. Et `UpdateLandingMode` ne TOURNE pas hors du
      // poste non plus — `ExitFlightConsole` coupe le composant —, si bien que
      // `ExitLandingMode` n'est annonce qu'en se rasseyant. Le retard est du
      // build ; l'appel est donc garde par `boarded`, pas seulement l'etat.
      const modeAtt = (ship && ship.boarded)
        ? atterrissage.updateMode({ frame: cadreAtt, auPoste: true,
                                    landed: !!(ship && ship.onPad),
                                    distance: dAtt })
        : null;
      if (modeAtt) {
        // `ShipThrusterController.OnEnterLandingMode` retient le referentiel ;
        // c'est lui qui sert d'axe radial a l'ecretage.
        atterrissageCorps = modeAtt === "enter" ? cibleAtt : null;
        console.log(modeAtt === "enter"
          ? `mode atterrissage : ${cibleAtt.name}` : "mode atterrissage quitte");
      }
      if (death.dead && !modes.mort) {
        modes.annonce("PlayerDeath");
        // `MapController.OnPlayerDeath` : la carte se ferme et s'eteint.
        fermerCarte();
        accesCarte.mort();
      }
      else if (!death.dead && modes.mort) { modes.init(); modes.dedans.clear(); }
    }

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
    //
    // Les canaux sont ceux du build : `Move X` (a/d), `Move Z` (w/s),
    // `Move Up` (majuscule) et `Move Down` (controle) pour le sac dorsal,
    // `Jump` (espace) pour le saut. Le portage mettait le saut ET la poussee
    // verticale sur l'espace, n'avait pas de descente, et donnait la majuscule
    // a un accelerateur que le build n'a pas.
    // L'etat des commandes, toutes sources confondues. Sans manette tenue on
    // passe les objets tels quels — c'est le cas courant, et il ne copie rien.
    let etatCmd = { keys, mouse: souris };
    if (padHeld.size) {
      etatCmd = { keys: { ...keys }, mouse: { ...souris } };
      for (const c of padHeld) {
        const mm = /^Mouse(\d+)$/.exec(c);
        if (mm) etatCmd.mouse[Number(mm[1])] = true;
        else etatCmd.keys[c] = true;
      }
    }
    const roulis = rollInput;
    rollInput = 0;
    const input = (death.dead || dialogue.active)
      ? { forward: 0, right: 0, up: false, down: false, jump: false,
          roll: 0, loud: false } : {
        forward: axis(cmds.axis("Move Z", etatCmd) + ax.forward + gp.forward),
        right: axis(cmds.axis("Move X", etatCmd) + ax.right + gp.right),
        up: cmds.held("Move Up", etatCmd) || ax.up || gp.up,
        down: cmds.held("Move Down", etatCmd) || ax.down || gp.down,
        jump: cmds.held("Jump", etatCmd) || ax.jump || gp.jump,
        // Le roulis n'a pas d'axe propre : c'est le lacet, aiguille par alt.
        roll: axis(roulis * 4 + (gp.roll || 0)),
        // « loud » n'est plus une touche : le build n'a pas d'accelerateur, et
        // le bruit se mesure a la poussee. On le garde a faux, et le calcul de
        // bruit prend la fraction reelle.
        loud: false,
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
    // §4 L'APESANTEUR DECLAREE. Quatre volumes la posent ; dans le leur, le
    // champ radial ne s'applique plus. Le point est ramene au repos du corps
    // porteur, comme tous les volumes extraits.
    const monde3 = [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                    player.pos.z + anchorPos[2]];
    const decale = (v) => decalageDuCorps(v.body, anchorPos);
    const zeroG = presencesZeroG.length
      ? strongestZeroG(zonesAround(presencesZeroG, monde3, decale))
      : null;
    // Les champs par seuils : on les marque presents pour l'image, et
    // `strongestDirectional` les compte alors sans test de forme.
    if (champsParSeuils.length) {
      const dedans = new Set(zonesAround(champsParSeuils, monde3, decale));
      for (const p of champsParSeuils) p.zone.present = dedans.has(p.zone);
    }
    const world = { directional: dirFields, polar: polFields,
                    framePos: anchorPos, fluids, zeroG,
                    // Les champs sont au repos de leur corps : on y ramene le
                    // point, comme pour les zones (docs/132).
                    shiftOf: decale,
                    // Le referentiel du mode atterrissage, s'il y en a un :
                    // c'est lui qui donne l'axe radial de l'ecretage.
                    landing: atterrissageCorps
                      ? { body: atterrissageCorps,
                          velocity: atterrissageCorps.velocity || [0, 0, 0] }
                      : null,
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
    //
    //    LE BUILD DECLARE SON REFERENTIEL, et c'est lui qui decide en premier
    //    (docs/46, lot 1) : quatorze volumes le posent, et le plus petit
    //    contenant le joueur gagne. La gravite dominante reste la reponse par
    //    defaut — les volumes ne couvrent pas tout l'espace — mais la ou le
    //    build a parle, on l'ecoute : c'est ce qui separe « pose dans un
    //    hangar » de « pres d'une planete ».
    declared.update([player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                     player.pos.z + anchorPos[2]],
                    (fr) => decalageDuCorps(fr.body, anchorPos));
    const fb = declared.anchorBody(bodies, bodyIsAnchorable)
            || (player.field && player.field.body);
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
      if (probes.last) {
        const p = probes.last;
        p.pos[0] += shift[0]; p.pos[1] += shift[1]; p.pos[2] += shift[2];
        if (p.vel) { p.vel[0] += dv[0]; p.vel[1] += dv[1]; p.vel[2] += dv[2]; }
        // Une sonde POSEE garde sa position d'impact : elle doit suivre le
        // changement d'ancre comme le reste, sinon elle saute de son mur.
        if (p.localImpact && !p.attachedTo) {
          p.localImpact[0] += shift[0]; p.localImpact[1] += shift[1];
          p.localImpact[2] += shift[2];
        }
      }
      console.log(`repere : ${anchorBody.name} -> ${fb.name}, ` +
        `ecart de vitesse ${Math.hypot(...dv).toFixed(1)} u/s`);
      // §T LE CORPS ANCRE NE SE LIBERE PAS. `Evictor` a un ensemble de
      // fichiers proteges depuis sa premiere ligne — « corps ancre, corps de
      // depart » dit son constructeur — et on ne lui donnait que le second :
      // `keep()` et `release()` n'etaient appeles nulle part. Le corps ancre
      // etait donc compte comme absent, propose a la liberation toutes les
      // quarante-cinq secondes, et sauve a chaque fois par le garde-fou de
      // `evictFile` — qui remettait le compteur a zero pour recommencer.
      // Le protege, c'est le dire une fois au lieu de le refuser sans fin.
      const ancien = BODY_TO_FILE[anchorBody.name];
      const nouveau = BODY_TO_FILE[fb.name];
      if (ancien && ancien !== nouveau) evictor.release(ancien);
      if (nouveau) evictor.keep(nouveau);
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
        probe: probes.last ? [probes.last.pos[0] + anchorPos[0],
                              probes.last.pos[1] + anchorPos[1],
                              probes.last.pos[2] + anchorPos[2]] : null,
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
    if (vueCarte.open) {
      // `MapController.LateUpdate` : la camera monte de l'oeil vers la vue
      // plongeante. Le haut de la camera est pose a chaque image : Babylon ne
      // le retourne avec la rotation que quand sa composante z change.
      const etoile = etoileCarte();
      const e = vueCarte.etape(performance.now() / 1000,
                               [player.pos.x, player.pos.y, player.pos.z],
                               etoile ? etoile.position : [0, 0, 0],
                               solarMap.zoom, solarMap.focal, versRepereCarte);
      solarMap.panLocked = e.t < 0.5;
      camera.position.set(e.position[0], e.position[1], e.position[2]);
      if (!camera.rotationQuaternion) camera.rotationQuaternion = new BABYLON.Quaternion();
      camera.rotationQuaternion.set(e.rotation[0], e.rotation[1], e.rotation[2], e.rotation[3]);
      const h = qRot(e.rotation, [0, 1, 0]);
      camera.upVector = new BABYLON.Vector3(h[0], h[1], h[2]);
      camera.minZ = e.near;
      camera.maxZ = reglagesCarte.far;
      camera.fov = reglagesCarte.fov;
      camera.layerMask = reglagesCarte.masque;
    } else {
      camera.position.set(player.pos.x + up.x * EYE_HEIGHT,
                          player.pos.y + up.y * EYE_HEIGHT,
                          player.pos.z + up.z * EYE_HEIGHT);
      camera.upVector = up;
      camera.setTarget(camera.position.add(fwd));
    }

    // le soleil eclaire depuis sa position monde, geometrie visible ou non
    const star = entries.find((e) => e.isStar);
    if (star) {
      const p = star.data.position;
      const d = camera.position.subtract(new BABYLON.Vector3(p[0], p[1], p[2]));
      if (d.lengthSquared() > 0) sunDir.copyFrom(d.normalize());
      sun.position.set(p[0], p[1], p[2]);
    }

    // --- vaisseau, ressources, interaction ---
    //
    // §R L'AIR, CALCULE ICI ET NON PLUS BAS. `RepairAudioController` interroge
    // le detecteur d'oxygene pour choisir son clip, et la reparation a lieu
    // AVANT le bloc qui calculait la zone : le lire de la aurait leve une
    // erreur de zone morte temporelle, la quatrieme de ce depot
    // (docs/77-sons.md). On calcule donc la zone une fois, ici, et le bloc
    // d'en dessous la reutilise.
    const zoneOxygene = oxygen.length
      ? inOxygenZone(oxygen, [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                              player.pos.z + anchorPos[2]],
                     oxyDet ? oxyDet.reach : 0)
      : null;
    let focus = null;
    if (ship) {
      if (autopilot && autopilot.engaged) {
        // La distance de freinage du build compte la GRAVITE le long de l'axe
        // d'approche : tomber vers la cible allonge le freinage. Seul le moteur
        // connait le champ au vaisseau, d'ou ce passage (docs/107-pilote.md).
        const c = ship.field;
        autopilot.update(dt, {
          gravite: c ? [c.dir.x * c.magnitude, c.dir.y * c.magnitude,
                        c.dir.z * c.magnitude] : [0, 0, 0],
          vitesseCible: (autopilot.target && autopilot.target.velocity) || [0, 0, 0],
        });
      }
      ship.update(dt, bodies, input, { fwd, right, up }, world);
      // L'allumage : un vaisseau pose ne decolle pas a l'appui, il s'allume une
      // seconde durant, et relacher annule (docs/66-allumage.md). Les trois
      // evenements du build sont ecoutes par `ShipThrusterAudio` ; ici ils
      // s'entendent par la meme voie que les autres sons d'evenement.
      for (const e of ship.events) {
        window.__shipEvents.push(e);
        if (e === "StartShipIgnition") {
          console.log("allumage du vaisseau");
          const s = sonsUI.shipIgnition();
          if (s) audio.loopAt(s.file, 1);
        }
        if (e === "CancelShipIgnition") {
          console.log("allumage interrompu");
          const s = sonsUI.shipIgnition();
          if (s) audio.loopAt(s.file, 0);
        }
        if (e === "CompleteShipIgnition") {
          console.log("decollage");
          const s = sonsUI.shipIgnition();
          if (s) audio.loopAt(s.file, 0);
        }
      }
      ship.sync(BABYLON);
      if (ship.lastLandingEvent === "ShipTouchdown") {
        const s = sonsUI.touchdown();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
        ship.lastLandingEvent = null;
      }
      if (ship.lastHit && ship.lastHit.damage > 0) {
        const s = sonsUI.shipImpact(ship.lastHit.damage);
        if (s) audio.playOneShot(s.file, { volume: s.volume });
        ship.lastHit = null;
      }
      if (ship.justExploded) {
        const s = sonsUI.shipExplosion();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
        ship.justExploded = false;
      }
      if (ship.boarded) {
        // Le joueur voyage avec le vaisseau — et depuis docs/69, il s'ASSIED :
        // le poste de pilotage est un `PlayerAttachPoint`, et le portage se
        // contentait de coller le joueur trois unites au-dessus du plancher.
        //
        // Le siege prend le repere VIVANT de la coque : sa pose au repos ne dit
        // rien de l'assiette du moment, et un siege qui ne tourne pas avec son
        // vaisseau est un siege dont on tombe des le premier tonneau.
        const cible = siegeVivant(anchorPos);
        if (cible && siegePilotage) {
          siegePilotage.follow(cible);
          const etat = pointsAttache.update(dt, now);
          if (etat) {
            player.pos.x = etat.position[0] - anchorPos[0];
            player.pos.y = etat.position[1] - anchorPos[1];
            player.pos.z = etat.position[2] - anchorPos[2];
            // `_matchRotation` : le corps pivote vers l'avant du siege, sur la
            // duree tiree de l'angle de depart. Le portage tient le regard en
            // deux scalaires plutot qu'en quaternion : c'est donc le LACET que
            // l'on mene, et l'azimut du siege se lit dans le repere d'horizon
            // du moment — celui-la meme qui sert au point d'apparition.
            if (etat.rotation && lacetSiege !== null) {
              const vise = yawFor(qrotDecor(etat.rotation, [0, 0, 1]),
                                  [up.x, up.y, up.z]);
              if (vise !== null) {
                // Par le plus court chemin : sans ce repli dans [-pi, pi], un
                // siege a l'ouest se rejoint par l'est, en frolant le tour.
                let ecart = vise - lacetSiege;
                while (ecart > Math.PI) ecart -= 2 * Math.PI;
                while (ecart < -Math.PI) ecart += 2 * Math.PI;
                yaw = lacetSiege + ecart
                    * turnFraction(now - siegePilotage.since,
                                   siegePilotage.turnDuration);
              }
            }
          }
        } else {
          const a = ship.axes;
          player.pos.x = ship.pos.x + a.up[0] * 3;
          player.pos.y = ship.pos.y + a.up[1] * 3;
          player.pos.z = ship.pos.z + a.up[2] * 3;
        }
        player.vel.x = ship.vel.x; player.vel.y = ship.vel.y; player.vel.z = ship.vel.z;
        if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos, false);
      }
      // Une fissure par piece touchee, tant qu'elle n'est pas reparee.
      if (fissuresPieces.length && ship.damage) {
        for (const f of fissuresPieces) {
          if (f.piece === undefined) f.piece = ship.damage.composants.find((c) => c.id === f.id) || null;
          const voir = !!f.piece && f.piece.totalDamage > 0;
          if (f.noeud.isEnabled(false) !== voir) f.noeud.setEnabled(voir);
        }
        window.__fissures = fissuresPieces.filter((f) => f.noeud.isEnabled(false)).length;
      }
      // --- reparation, DEHORS ---
      //
      // `RepairVolume` : chaque volume est l'enfant de la piece qu'il repare,
      // s'allume quand elle prend un coup (`Activate`), et s'eteint quand on
      // entre dans le vaisseau (`OnEnterShip` : `Disable`). On repare donc en
      // faisant le TOUR de la coque, en visant la piece a trois unites, touche
      // tenue trois secondes. Le portage reparait depuis le poste de pilotage,
      // la piece la plus abimee d'abord — l'inverse (docs/132).
      repairFraction = 0;
      reparationVisee_ = null;
      if (shipRepairs.length && ship.damage && shipRest) {
        const avarie = ship.damage;
        const ax = ship.axes;
        const actifs = [];
        for (const r of shipRepairs) {
          // LA piece du volume, par son identifiant : quinze pieces portent le
          // meme nom. Sans identifiant (ancienne extraction), la premiere de
          // la position.
          const part = r.piece !== undefined ? r.piece
            : (r.piece = avarie.composants.find((c) => r.volume.pieceId != null
                ? c.id === r.volume.pieceId : c.location === r.volume.location) || null);
          if (!part) continue;
          // `ApplyDamageForce` : `_repairVolume.ResetVolume()` — un nouveau
          // coup remet l'avancement a zero.
          if (part.totalDamage > (r.dommageVu ?? 0)) r.reset();
          r.dommageVu = part.totalDamage;
          // Le volume est allume tant que sa piece est dans `_damagedParts`.
          if (!avarie.estEndommagee(part) || ship.boarded) continue;
          if (!r.offset) {
            let d = [r.volume.position[0] - shipRest[0], r.volume.position[1] - shipRest[1],
                     r.volume.position[2] - shipRest[2]];
            if (shipRestRot) {
              const q = shipRestRot;
              d = rotateByQuaternion([-q[0], -q[1], -q[2], q[3]], d);
            }
            r.offset = d;
          }
          const o = r.offset;
          actifs.push({ repair: r, rayon: r.volume.rayon, distance: r.volume.distance,
                        centre: [0, 1, 2].map((i) => [ship.pos.x, ship.pos.y, ship.pos.z][i]
                          + o[0] * ax.right[i] + o[1] * ax.up[i] + o[2] * ax.fwd[i]) });
        }
        window.__reparations = { actifs, shipRepairs };
        const avantCam = camera.getDirection(BABYLON.Axis.Z);
        const vise = actifs.length && !dialogue.active
          ? reparationVisee(actifs, [camera.position.x, camera.position.y, camera.position.z],
                            [avantCam.x, avantCam.y, avantCam.z]) : null;
        for (const v of actifs) if (v !== vise && v.repair.holding) {
          v.repair.release();
          const s = sonsUI.stopRepair();
          if (s) audio.playOneShot(s.file, { volume: 0 });
          console.log("annonce : StopRepairing");
        }
        if (vise) {
          const en_cours = vise.repair;
          reparationVisee_ = vise;
          // La touche est a la reparation : on n'embarque pas en visant une
          // piece, meme a portee de la trappe.
          interactPressed = false;
          const tenaitAvant = en_cours.holding;
          if (cmds.held("Interact", etatCmd)) en_cours.press(); else en_cours.release();
          // §R ON NE REPARE PAS PAREIL DANS LE VIDE. `RepairAudioController`
          // choisit entre `_repairLoop` et `_spaceRepairLoop` selon que le
          // detecteur d'oxygene trouve quelque chose (docs/77-sons.md).
          if (en_cours.holding !== tenaitAvant) {
            const air = !!zoneOxygene;
            const s = en_cours.holding ? sonsUI.startRepair(air) : sonsUI.stopRepair();
            if (s) audio.playOneShot(s.file, { volume: en_cours.holding ? 0.6 : 0 });
            console.log(`annonce : ${en_cours.holding ? "StartRepairing" : "StopRepairing"}`);
          }
          if (en_cours.update(dt)) {
            // `OnCompleteRepair` : la piece du volume, et elle seule.
            const piece = avarie.repair(en_cours.piece);
            if (piece) console.log(`reparation : ${piece} remise en etat`);
            const fin = sonsUI.finishRepair(!!zoneOxygene);
            if (fin) audio.playOneShot(fin.file, { volume: fin.volume });
            console.log("annonce : FinishRepairing");
            reparationFinie = now;
          }
          repairFraction = en_cours.fraction;
        }
      }
      if (hudReparation) {
        // `RepairVolume.OnGUI` : « NN% », au style des invites, cinquante
        // pixels au-dessus du centre — tant qu'on vise et jusqu'a trois
        // secondes apres la fin.
        const montre = !!reparationVisee_ && !guiMode.hidden
          && (reparationVisee_.repair.fraction < 1 || now < reparationFinie + 3);
        hudReparation.hidden = !montre;
        if (montre) hudReparation.textContent = `${Math.round(reparationVisee_.repair.fraction * 100)}%`;
      }
      if (interactPressed && !dialogue.active) {
        if (ship.boarded) {
          ship.boarded = false;
          const sonDeboucle = sonsUI.unbuckle();
          if (sonDeboucle) audio.playOneShot(sonDeboucle.file, { volume: sonDeboucle.volume });
          // `ExitFlightConsole` : la vue d'atterrissage tombe en se levant, et
          // une bascule en cours est annulee. Le regard se recentre comme le
          // fait `CenterCamera(140)`, au meme rythme que le reste.
          // Les annonces RESTENT dans `atterrissage.events` : c'est la trace
          // que le reste du portage et les controles navigateur lisent, comme
          // pour l'entree. Seul le tour de la sortie part vers les modes.
          const avantSortie = atterrissage.events.length;
          if (atterrissage.exitConsole()) snapRegard = 0;
          for (const e of atterrissage.events.slice(avantSortie)) modes.annonce(e);
          // ON SE LEVE AVEC LA VITESSE DU SIEGE, jamais avec zero :
          // `SetVelocity(attachedOWRigidbody.GetPointVelocity(point))`. Sans
          // cette ligne, quitter le poste d'un vaisseau qui file a deux cents
          // unites par seconde vous laisse sur place, et le vaisseau part sans
          // vous. C'est elle qui rend le fait de se lever en vol possible.
          const leve = pointsAttache.detach([ship.vel.x, ship.vel.y, ship.vel.z]);
          if (leve) {
            player.vel.x = leve.velocity[0];
            player.vel.y = leve.velocity[1];
            player.vel.z = leve.velocity[2];
          }
          if (siegePilotage) siegePilotage.follow(null);
          lacetSiege = null;
          const a = ship.axes;
          player.pos.x += a.up[0] * 4; player.pos.y += a.up[1] * 4;
          player.pos.z += a.up[2] * 4;
        } else if (ship.distanceTo(player.pos) < SHIP_REACH &&
                   pdata.knowsLaunchCodes) {
          ship.boarded = true;
          const sonBoucle = sonsUI.buckleUp();
          if (sonBoucle) audio.playOneShot(sonBoucle.file, { volume: sonBoucle.volume });
          // `OnPressInteract` appelle `ResetRollSettings` : c'est le SEUL
          // endroit du build qui remet le roulis a plat, et il fallait bien
          // qu'il y en ait un — se lever en vue d'atterrissage laisse le
          // manche inverse.
          atterrissage.resetRoll();
          // `OnEnterShip` : la protection du premier tour s'arrete la. Le jeu
          // decide qu'une fois aux commandes, on joue pour de bon.
          if (pdata.enterShip()) {
            resources.invulnerable = false;
            console.log("annonce : EnterShip — les degats portent desormais");
          }
          // PlayerResources.OnEnterShip : la sante est integralement restauree
          resources.health = resources.maxHealth;
          resources.dead = false;
          // S'asseoir prend du TEMPS : la duree du demi-tour est l'angle entre
          // l'avant du joueur et celui du siege, divise par cent degres par
          // seconde. Arriver en tournant le dos au poste demande donc 1,8 s,
          // et arriver de face n'en demande aucune.
          const cible = siegeVivant(anchorPos);
          if (cible && siegePilotage) {
            siegePilotage.follow(cible);
            lacetSiege = yaw;
            const demande = pointsAttache.attach(siegePilotage, {
              position: [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                         player.pos.z + anchorPos[2]],
              forward: [fwd.x, fwd.y, fwd.z],
              rotation: lookRotation(fwd, up),
            }, now);
            // `_centerCamera` : le regard revient au centre du siege, a la
            // meme vitesse que le corps — les deux arrivent ensemble.
            if (demande && demande.centerCamera) {
              recentrage = { debut: now,
                             duree: snapDuration(pitch * 180 / Math.PI, 0, 0, 0,
                                                 demande.rate),
                             depart: [pitch * 180 / Math.PI, 0] };
            }
          }
        }
      }
    }
    const playerW = [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                     player.pos.z + anchorPos[2]];
    sondeInteraction.repere = (it) => {
      const sh = decalageDuCorps(it.body, anchorPos) || [0, 0, 0];
      return [it.world[0] + sh[0] - anchorPos[0], it.world[1] + sh[1] - anchorPos[1],
              it.world[2] + sh[2] - anchorPos[2]];
    };
    // --- dialogue ---
    //
    // On parle a qui l'on REGARDE : le rayon de `FirstPersonManipulator`
    // touche la capsule du personnage, et `Observe` exige deux unites au plus
    // du point touche (interact.js, `RAYON_VISEE`). Le portage ouvrait la
    // conversation la plus proche a six metres, de dos s'il le fallait —
    // l'alpha, elle, ne repond qu'au regard (docs/132). La proximite reste le
    // repli d'une extraction qui n'a pas les colliders des recepteurs.
    const decalConvo = (b) => decalageDuCorps(typeof b === "string" ? b : (b && b.body) || "TimberHearth_Body", anchorPos);
    let convo = null;
    if (!ship || !ship.boarded) {
      if (visesParRayon) {
        const vise = interactables.focus(player.pos, anchorPos, fwd,
                                         (it) => decalageDuCorps(it.body, anchorPos), camera.position);
        sondeInteraction.vise = vise;
        if (vise && vise.kind === "interact") {
          convo = (dialogue.conversations || []).find((c) => c.position
            && Math.hypot(c.position[0] - vise.world[0], c.position[1] - vise.world[1],
                          c.position[2] - vise.world[2]) < 0.05) || null;
        }
      } else {
        convo = dialogue.nearest(playerW, decalConvo);
      }
    }
    if (interactPressed) {
      if (dialogue.active && dialogue.view && dialogue.view.options.length) {
        // `DialogueGUI.Update` : devant des options, `advanceText` CHOISIT
        // celle du curseur (`OnDialogueInput(_optionNo + 1)`). Le portage
        // appelait `advance()`, qui ne fait rien devant des options : la
        // conversation restait bloquee sur la touche du jeu (docs/132).
        optionPressed = dlgUI.cursor + 1;
        bipUI("AdvanceText");
        interactPressed = false;
      } else if (dialogue.active) {
        const avant = dialogue.active;
        dialogue.advance();
        // Deux clips differents : avancer CLIQUE, finir a son propre son.
        bipUI(dialogue.active ? "AdvanceText" : "ExitDialogueMode");
        if (!dialogue.active && avant) { /* la conversation s'est fermee */ }
        interactPressed = false;
      }
      else if (convo) {
        // L'arbre se choisit a l'ouverture, comme le fait
        // `OnStartConversation` — et il depend de l'etat de la BOUCLE autant
        // que des connaissances, d'ou `dialogue.stateOf`.
        //
        // §S L'ENFANT AUX FUSEES choisit le sien autrement : il COMPTE. Cinq
        // crashs lui valent un reproche, un atterrissage un compliment — et
        // les crashs passent avant, donc se planter cinq fois puis reussir une
        // fois vous vaut le reproche (docs/78-modele.md).
        let arbre = null;
        if (estEnfant(convo, enfant)) {
          const choix = compteurEnfant.tree();
          if (choix && enfant.trees[choix]) {
            arbre = enfant.trees[choix];
            console.log(`enfant aux fusees : ${choix}`);
          }
        }
        if (dialogue.open({ ...convo,
                        tree: arbre || selectTree(pdata, convo, dialogue.trees,
                                                  controllers,
                                                  dialogue.stateOf(convo)) })) {
          interactPressed = false;
        }
      }
    }
    if (dialogue.active && optionPressed > 0) dialogue.choose(optionPressed - 1);
    optionPressed = 0;

    if (!ship || !ship.boarded) {
      // Les objets suivent leur corps : un paquetage pose dans la cabine part
      // avec le vaisseau, et une zone du village tourne avec sa planete.
      focus = interactables.focus(player.pos, anchorPos, fwd,
                                  (it) => decalageDuCorps(it.body, anchorPos),
                                  visesParRayon ? camera.position : null);
    }
    // L'oxygene ne se recharge plus seulement dans le vaisseau : les zones que
    // la scene pose comptent aussi. Sans aucune zone, on retrouve exactement le
    // comportement d'avant.

    // LE SECTEUR MAJEUR ACTIF, une fois pour l'image.
    //
    // `SectorDetector` est le carrefour du build : la minicarte, la limite de
    // poussee, l'eclairage ambiant, la portee de la lampe et celle des phares
    // lui demandent tous la meme chose. Le portage posait cinq questions
    // differentes — une distance ici, un « plus petit volume » la, un
    // `horizon x 1,5` ailleurs. Il n'y en a qu'une : quels declencheurs touche-t-on
    // (docs/82-secteur-majeur.md).
    const secteurDe = (w) => (majSecteurs.length
      ? activeMajorSector(majSecteurs, w, (x) => decalageDuCorps(x.body, anchorPos))
      : null);
    const secMaj = secteurDe(playerW);
    secteurMajeur = secMaj;
    // `OnOccupantEnterSector(Player)` / `OnOccupantExitSector(Player)`.
    for (const [corps, ech] of echanges) ech.poser(!!(secMaj && secMaj.body === corps));
    // LES SEUILS : on n'y est pas « dedans », on les a franchis dans un sens.
    //
    // Les deux comptes se tiennent ici parce que l'invite de lampe, plus haut
    // dans l'image, demande la zone sombre : la calculer plus bas la laissait
    // dans sa zone morte temporelle, et le portage avait mis a la place
    // `sectorState.secteur.sunless` — un champ qu'aucune extraction ne pose.
    // La condition ne s'est jamais verifiee une seule fois.
    zonesSansSoleil.update(playerW, (x) => decalageDuCorps(x.body, anchorPos));
    zonesSombres.update(playerW, (x) => decalageDuCorps(x.body, anchorPos));
    // `ResetSimulationTrigger.OnTriggerEnter` : entrer dans la sphere de
    // l'observatoire une fois les codes appris remet la simulation a zero.
    if (remiseAZero.armed && remiseAZero.volume) {
      const dec = decalageDuCorps(remiseAZero.volume.body, anchorPos);
      if (remiseAZero.enter(insideVolume(remiseAZero.volume,
                                         restingPoint(playerW, dec)),
                            pdata.knows("knowsLaunchCodes"))) {
        loop.resetSimulation();
        // Le build recharge la scene, et `TimeLoop.Start` annonce alors
        // `ResumeSimulation` parce que `_startTimeLoopOnReload` vient d'etre
        // remis a faux. Ce portage ne recharge rien : il enchaine.
        loop.resume();
        console.log("simulation remise a zero : la partie commence");
      }
    }

    // §J LES DEUX POINTS D'ACCROCHAGE DE TIMBER HEARTH.
    //
    // « Fly Model Ship » a l'observatoire, « Activate Lift » au pied de la
    // tour : deux zones d'interaction posees exactement sur un
    // `PlayerAttachPoint`, et le portage ne s'y accrochait pas.
    //
    // Le second est le plus parlant du lot : il ne verrouille rien, ne recentre
    // rien, ne suit aucune rotation. On est PORTE, et on regarde ou l'on veut —
    // c'est ce que veut dire monter dans un ascenseur, et c'est exactement ce
    // que la scene dit de ce point-la.
    // §Q L'ASSISE PENDANT LA LUNETTE. `AttachPlayer` s'abonne a
    // `EnterTelescopeView` / `ExitTelescopeView` et `DetachPlayer` s'en
    // desabonne : le point n'ecoute que tant qu'on y est assis. A l'entree il
    // relache son suivi de rotation — on vise ou l'on veut ; a la sortie il
    // rejoue `InitAttachment`, et le demi-tour REPART de l'angle ou l'on
    // ressort. Le portage ramenait le regard d'un coup, ou pas du tout.
    if (lunetteBascule) {
      const assis = pointsAttache.current;
      if (assis) {
        if (lunetteBascule > 0) assis.enterTelescope();
        else {
          const r = assis.exitTelescope(
            { position: playerW, forward: [fwd.x, fwd.y, fwd.z],
              rotation: lookRotation(fwd, up) },
            now, decalageDuCorps(assis.body, anchorPos));
          if (r && r.centerCamera) {
            recentrage = { debut: now, depart: [pitch * 180 / Math.PI, 0],
                           duree: snapDuration(pitch * 180 / Math.PI, 0, 0, 0,
                                               r.rate) };
          }
        }
      }
      lunetteBascule = 0;
    }
    if (!ship || !ship.boarded) {
      const assis = pointsAttache.current;
      if (assis && assis !== siegePilotage) {
        const etat = pointsAttache.update(dt, now,
                                          decalageDuCorps(assis.body, anchorPos));
        if (etat) {
          player.pos.x = etat.position[0] - anchorPos[0];
          player.pos.y = etat.position[1] - anchorPos[1];
          player.pos.z = etat.position[2] - anchorPos[2];
          player.vel.x = player.vel.y = player.vel.z = 0;
          if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos, false);
        }
        if (interactPressed && !dialogue.active) {
          // On se leve avec la vitesse du point. Une planete qui tourne en
          // porte une, et c'est elle qu'on emporte — pas zero.
          pointsAttache.detach([0, 0, 0]);
          interactPressed = false;
        }
      } else if (interactPressed && !dialogue.active && focus
                 && (focus.kind === "zone" || focus.kind === "interact" || focus.kind === "terminal" || focus.kind === "observatoryMap")) {
        // La borne de lancement : actionne la tour ou refuse selon les codes
        if (focus.kind === "terminal") {
          const r = terminal.pressInteract(pdata.knows("knowsLaunchCodes"));
          if (r === "activate") {
            for (const a of ascenseurs) a.activateControls();
            bipUI("PlayAffirmativeUISound");
            console.log("tour de lancement actionnee");
            interactPressed = false;
          } else if (r === "refuse") {
            bipUI("PlayNegativeUISound");
            console.log("tour de lancement : codes inconnus");
            interactPressed = false;
          }
        } else if (focus.kind === "observatoryMap") {
          // La maquette du systeme solaire a l'observatoire ouvre la carte
          events.fire(OBSERVATORY_EVENTS.triggerMap);
          // `OnTriggerObservatoryMap` : allume la carte, et `EnterMapView`
          // SANS cadrer de cible — l'observatoire montre le systeme entier.
          // (L'appel visait une methode `ouvre` que `SolarMap` n'a jamais eue.)
          accesCarte.depuisObservatoire();
          if (!solarMap.open) ouvrirCarte({ observatoire: true });
          interactPressed = false;
        } else if (/satellite/i.test(focus.prompt || "") || focus.name === "ProjectorControls") {
          // La console de projection du satellite
          const c = consoles.toggle([player.pos.x + framePos[0],
                                     player.pos.y + framePos[1],
                                     player.pos.z + framePos[2]]);
          if (fadeLight && fadeCible) {
            const t = performance.now() / 1000;
            const vise = (c && !c.flight) ? 0 : (fadeCible.intensity ?? 1);
            fadeLight.fadeIntensity(vise, SATELLITE_FADE, t);
          }
          console.log(c ? `console prise : ${c.name}` : "console lachee");
          interactPressed = false;
        } else if (/hatch/i.test(focus.prompt || "") && trappe.pressInteract()) {
          // `HatchController.OnPressInteract` : la zone « Open Hatch » ne pose
          // pas de point d'accrochage, elle RETIRE un collider. C'est la seule
          // des sept zones qui fasse autre chose que s'asseoir.
          for (const c of trappe.drain()) {
            const clip = (events.of("HatchController") || { clips: {} })
              .clips._openHatchClip;
            if (clip) audio.playOneShot(clip);
            console.log(`trappe ouverte (${c})`);
          }
          interactPressed = false;
        }
        const point = pointsAttache.at(focus.world, 2);
        if (point && point !== siegePilotage) {
          lacetSiege = yaw;
          const demande = pointsAttache.attach(point, {
            position: playerW, forward: [fwd.x, fwd.y, fwd.z],
            rotation: lookRotation(fwd, up),
          }, now, decalageDuCorps(point.body, anchorPos));
          if (demande && demande.centerCamera) {
            recentrage = { debut: now, depart: [pitch * 180 / Math.PI, 0],
                           duree: snapDuration(pitch * 180 / Math.PI, 0, 0, 0,
                                               demande.rate) };
          }
          console.log(`accroche : ${focus.prompt || point.name}`);
          // `Elevator.OnPressInteract` fait DEUX choses : il accroche le
          // joueur, et il lance la cabine. Le portage n'en faisait que la
          // premiere, et l'ascenseur restait a quai avec quelqu'un dedans.
          for (const a of ascenseurs) {
            const dec2 = decalageDuCorps(a.data.body, anchorPos) || [0, 0, 0];
            const dd = Math.hypot(a.data.position[0] + dec2[0] - playerW[0],
                                  a.data.position[1] + dec2[1] - playerW[1],
                                  a.data.position[2] - a.height + dec2[2] - playerW[2]);
            if (dd < 12 && a.pressInteract(now)) {
              if (a.data.startClip) audio.playOneShot(a.data.startClip);
              console.log(a.goingToTheEnd ? "ascenseur : en haut" : "ascenseur : en bas");
            }
          }
          interactPressed = false;
        }
      } else if (interactPressed && !dialogue.active && focus
                 && focus.kind === "readable" && focus.text) {
        // §L ON LIT. `ReadableObject.OnPressInteract` ouvre la MEME boite de
        // dialogue, en panneau de musee, et le texte des trente-quatre objets
        // etait extrait depuis longtemps sans que rien ne l'affiche
        // (docs/105-lire.md).
        if (dialogue.read(focus)) {
          bipUI("AdvanceText");
          console.log(`lecture : ${focus.name}`);
          interactPressed = false;
        }
      }
    }
    // Les annonces du build, drainees comme celles du vaisseau.
    for (const e of pointsAttache.drain()) console.log(`annonce : ${e}`);

    // §J LE VERROUILLAGE DE CAMERA, ET SES CINQ APPELANTS. Le corps tourne en
    // LACET seulement, a une vitesse proportionnelle a l'ecart : l'approche est
    // exponentielle, sans a-coup a la fin, et le tangage reste a la main
    // pendant ce temps (docs/69-assise.md pour la loi).
    //
    // Ce que ce portage n'avait pas : le build appelle `LockOn` a CINQ
    // endroits, et chacun donne ses propres nombres — c'est ce qui fait qu'on
    // pivote lentement vers un panneau et brusquement vers le vaisseau modele.
    //
    //   Conversation.StartConversation            3, zoom,    1
    //   ReadableObject.OnPressInteract            2, SANS,    1
    //   ShipComputer.EnterShipComputer            1, zoom,    8
    //   RemoteFlightConsole.OnPressInteract       5, zoom,    1
    //   SatelliteSnapshotController.OnPressInteract 1, SANS,  1
    //
    // Et la CIBLE n'est pas l'objet avec lequel on interagit : c'est un
    // transform serialise a cote (`_attentionPoint`, `_modelShipBody`,
    // `_projectionScreen`). Le portage visait le composant `PlayerLockOnTargeting`
    // lui-meme, qui est pose sur le joueur et sur les commandes du projecteur —
    // donc jamais sur ce qu'on regarde (docs/105-lire.md).
    {
      const lu = dialogue.active && dialogue.active.reading;
      const parle = dialogue.active && dialogue.active.convo;
      let surCible = null, reglage = null;
      if (lu) {
        // `_attentionPoint` quand il y en a un, l'objet lui-meme sinon : quinze
        // des trente-quatre n'en declarent pas.
        surCible = lu.attention || { position: lu.world, body: lu.body };
        reglage = { offset: [0, 0, 0], followRate: 2, useZoom: false, zoomSpeed: 1 };
      } else if (parle) {
        // L'offset (0, 0.5, 0) est LOCAL a l'interlocuteur. Sur un sol partage,
        // il est parallele au haut du joueur — et `lockYawError` projette
        // justement cette composante-la hors du lacet. Il ne change donc que la
        // distance, donc le champ de vision, qui a moins de dix unites ne bouge
        // pas non plus.
        surCible = { position: parle.position, body: parle.body };
        reglage = { offset: [0, 0.5, 0], followRate: 3, useZoom: true, zoomSpeed: 1 };
      } else if (consoles.active) {
        const c = consoles.active;
        // La console de vol regarde le VAISSEAU MODELE, le satellite son ECRAN.
        const cible = c.flight ? (c.targets && c.targets._modelShipBody)
                               : (c.targets && c.targets._projectionScreen);
        surCible = cible ? { position: cible.position, body: cible.body }
                         : { position: c.position, body: c.body || null };
        // `LockOn(_modelShipBody.transform)` : le regard SUIT le modele, pas son
        // socle. Sa position du repere, rendue dans la convention « repos +
        // decalage du porteur » que le verrou relit a chaque image.
        if (c.flight && modele && modele.pos) {
          const dec = decalageDuCorps(porteurModele, framePos) || [0, 0, 0];
          surCible = { position: modele.pos.map((x, i) => x + framePos[i] - dec[i]),
                       body: porteurModele };
        }
        reglage = c.flight
          ? { offset: [0, 0, 0], followRate: 5, useZoom: true, zoomSpeed: 1 }
          : { offset: [0, 0, 0], followRate: 1, useZoom: false, zoomSpeed: 1 };
      }
      // `LockOn` est un EVENEMENT, pas un etat : on ne le rappelle qu'au
      // changement de cible, d'ou la cle. La position, elle, se relit a chaque
      // image — un interlocuteur pose sur une planete tourne avec elle.
      const cle = lu ? `lu:${lu.name}:${lu.world.join()}`
        : parle ? `parle:${parle.index}`
        : consoles.active ? `console:${consoles.active.name}` : null;
      if (cle && verrouCible !== cle) {
        verrouCamera.lockOn(surCible, reglage);
        verrouCible = cle;
      } else if (!cle && verrouCamera.locked) {
        verrouCamera.breakLock();
        verrouCible = null;
      }
      if (verrouCamera.locked) {
        const dec = decalageDuCorps(surCible.body, anchorPos) || [0, 0, 0];
        const versLa = [surCible.position[0] + dec[0] - playerW[0],
                        surCible.position[1] + dec[1] - playerW[1],
                        surCible.position[2] + dec[2] - playerW[2]];
        const r = verrouCamera.update(dt, versLa, [fwd.x, fwd.y, fwd.z],
                                      [up.x, up.y, up.z],
                                      [right.x, right.y, right.z],
                                      Math.hypot(versLa[0], versLa[1], versLa[2]),
                                      reglagesCam.fov || 70);
        if (r) { yaw += r.yaw * Math.PI / 180; verrouFOV = r.fov; }
      } else verrouFOV = null;
    }

    const zone = zoneOxygene;
    // Le carburant etait consomme EN MARCHANT : `thrusting` valait vrai des
    // qu'une touche de deplacement etait tenue. Seul le sac dorsal brule
    // (docs/36-audit.md §1.1) — et il ne brule pas quand on pilote.
    {
      // §R `RefillOxygen` : le plein s'entend, et UNE SEULE FOIS — sur la
      // transition, pas a chaque image passee dans la zone.
      const avant = resources.oxygen;
      resources.update(dt, {
        inSupply: !!(ship && ship.boarded) || !!zone,
        thrusting: !!player.jetpack && !(ship && ship.boarded),
      });
      if (resources.oxygen > avant && !refaitLePlein) {
        refaitLePlein = true;
        const s = sonsUI.refillOxygen();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
        console.log("annonce : RefillOxygen");
      } else if (resources.oxygen <= avant) refaitLePlein = false;
    }

    // --- les lots de docs/44, image par image ---------------------------
    //
    // §4 CE QUI BLESSE. L'unique `HazardVolume` du build est la colonne de
    // sable entre les jumelles : vingt points par seconde, et rien au premier
    // contact. Le portage n'avait aucune regle la : on la traversait.
    {
      const perdu = hazards.update(dt, playerW, (v) => decalageDuCorps(v.body, anchorPos));
      if (perdu > 0) resources.hurt(perdu);
    }
    // §7 L'EQUIPEMENT SE RAMASSE. Le paquetage du vaisseau donne les trois,
    // la combinaison de la grotte ne donne qu'elle. On appuie dessus, une fois.
    if (interactPressed && !dialogue.active && !(ship && ship.boarded)) {
      for (const p of pickups) {
        const q = restingPoint(playerW, decalageDuCorps(p.body, anchorPos));
        const d = Math.hypot(q[0] - p.position[0], q[1] - p.position[1],
                             q[2] - p.position[2]);
        if (d > GEAR_REACH) continue;
        const gagne = equipment.pickUp(p);
        if (gagne.length) {
          console.log(`equipement : ${gagne.join(", ")}`);
          const son = (events.of("PlayerAudioEffects") || { clips: {} }).clips._suitUpSound;
          if (son) audio.playOneShot(son);
          interactPressed = false;
        }
        break;
      }
    }
    // Le mur qui RECLAME la combinaison : `SuitBarrier` allume un collider tant
    // qu'on n'en porte pas, et `InvisibleWall` n'a aucun maillage — donc aucun
    // collider dans le portage. On repousse a la main (docs/67-annonces.md).
    if (suits.length) {
      const poussee = suitBarrierPush(suits, playerW, equipment,
        (v) => decalageDuCorps(v.body, anchorPos));
      if (poussee) {
        player.pos.x += poussee[0];
        player.pos.y += poussee[1];
        player.pos.z += poussee[2];
        if (!murAnnonce) {
          console.log("il faut la combinaison pour aller par la");
          murAnnonce = true;
          // TriggerSuitWarning : Coach avertit le joueur s'il tente de franchir sans combinaison
          if (dialogue && !dialogue.active) {
            const coachConvo = (dialogue.conversations || []).find(
              (c) => c.controller && c.controller.kind === "CoachConvoController");
            if (coachConvo && coachConvo.controller && coachConvo.controller.trees
                && coachConvo.controller.trees._suitWarning) {
              dialogue.open({ ...coachConvo, tree: coachConvo.controller.trees._suitWarning });
            }
          }
        }
      } else murAnnonce = false;
    }
    // La combinaison se REND : le volume de retour n'existe que si on l'a.
    if (suits.length && suitVolumeStep(suits, playerW, equipment,
          (v) => decalageDuCorps(v.body, anchorPos)) === "removed") {
      const son = (events.of("PlayerAudioEffects") || { clips: {} }).clips._removeSuitSound;
      if (son) audio.playOneShot(son);
      console.log("equipement : combinaison rendue");
    }
    // L'entrainement en apesanteur : les trois noeuds du satellite casse.
    if (training.total && !(ship && ship.boarded)) {
      // §U `OnEnterZeroGTraining` / `OnExitZeroGTraining` : etre A PORTEE d'un
      // noeud, c'est etre en mode entrainement — et c'est ce mode, et lui
      // seul, qui fait venir les trois invites de poussee.
      const noeud = training.nodes.find((r) => !r.done &&
        r.inRange(restingPoint(playerW, decalageDuCorps(r.volume.body, anchorPos))));
      const dedans = !!noeud || training.nodes.some((r) =>
        r.inRange(restingPoint(playerW, decalageDuCorps(r.volume.body, anchorPos))));
      if (dedans !== entrainementEnCours) {
        entrainementEnCours = dedans;
        console.log(`annonce : ${dedans ? "EnterZeroGTraining" : "ExitZeroGTraining"}`);
      }
      if (noeud) {
        if (cmds.held("Interact", etatCmd)) noeud.press(); else noeud.release();
        noeud.update(dt);
      }
      if (training.update()) {
        const son = (events.of("ZeroGTrainingManager") || { clips: {} })
          .clips._systemsBackOnlineClip;
        if (son) audio.playOneShot(son);
        // §V `CompleteZeroGTraining` : `PlayerData` le retient — et le remet a
        // faux au debut de chaque boucle, contrairement aux autres savoirs qui
        // sont ecrits sur le disque. Reparer le satellite ne se retient que
        // pour le tour en cours.
        pdata.completedZeroGTraining = true;
        pdata.learn("hasCompletedTraining");
        console.log("annonce : CompleteZeroGTraining — systemes du satellite retablis");
      }
    }

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
      // SIX ISSUES, ET LE PORTAGE N'EN DISAIT QUE TROIS. `AutopilotGUI` a un
      // message par facon de s'arreter — abandon en vol, abandon d'egalisation,
      // cible trop proche, egalisation reussie, arrivee juste, arrivee courte —
      // et le portage rendait « autopilot ABORTED » pour toutes celles qui ne
      // venaient pas d'un vol abouti. Le pilote dit maintenant lui-meme
      // laquelle (docs/118-messages.md).
      if (autopilot.fin) {
        readout.show(autopilot.fin, now);
        autopilot.fin = null;
        lastPhase = autopilot.phase;
      } else if (autopilot.phase !== lastPhase) {
        if (AUTOPILOT_KEYS.has(autopilot.phase)) readout.show(autopilot.phase, now);
        lastPhase = autopilot.phase;
      }
      readout.update(now, !guiMode.hidden && !guiMode.capture);
      // `DebugHUD.OnGUI` : le reticule, sauf en mode cache ; et apres la mort,
      // `DisableGUI` eteint le composant jusqu'au rechargement du niveau.
      reticule.hidden = guiMode.hidden || death.dead;
      // Le texte de mise au point n'apparait qu'en mode `IsDebugMode`.
      document.body.classList.toggle("gui-debug", guiMode.debug);
    }

    // --- minicarte : le declencheur du secteur majeur, et rien d'autre ---
    if (minimap) {
      // Le portage demandait « suis-je a moins de deux rayons de surface du
      // corps dominant ». Le build ne pose jamais cette question : il tient une
      // LISTE de secteurs majeurs dont on touche la sphere de declenchement, en
      // retient le plus proche par le centre (`CalculateActiveMajorSector`), et
      // `AttemptActivation` interroge SA CLASSE. D'ou l'ecart qu'aucune
      // distance n'aurait donne : la minicarte s'eteint sur la lune quantique,
      // dont le secteur est un `MajorSector` nu (docs/82-minicarte.md).
      if (secMaj !== minimap.sector) minimap.switchMajorSector(secMaj);
      const enCabine = !!(ship && ship.boarded);
      if (enCabine !== minimap.insideShip) {
        if (enCabine) minimap.enterShip(); else minimap.exitShip();
      }
      // `Minimap` dit si la carte existe, `MinimapHUD` si on la voit : deux
      // composants dans le build, deux appels ici.
      minimap.showHUD(minimap.allowVisibility({ helmetHUD: !guiMode.hidden && !vueCarte.open,
                                                hasMinimap: equipment.minimap }));
      if (minimap.on && secMaj) {
        // Tout se compare AU REPOS du secteur : c'est le seul repere ou sa
        // position extraite ait un sens, et c'est ce que fait
        // `InverseTransformPoint` sur un secteur enfant de sa planete.
        const dec = decalageDuCorps(secMaj.body, anchorPos);
        const repos = (w) => restingPoint(w, dec);
        const monde = (x, y, z) =>
          [x + anchorPos[0], y + anchorPos[1], z + anchorPos[2]];
        const shipW = ship && !ship.boarded
          ? monde(ship.pos.x, ship.pos.y, ship.pos.z) : null;
        const probeW = probes.last
          ? monde(probes.last.pos[0], probes.last.pos[1], probes.last.pos[2]) : null;
        minimap.update(secMaj.position, repos(playerW), {
          ship: shipW ? repos(shipW) : null,
          shipSector: shipW ? secteurDe(shipW) : null,
          probe: probeW ? repos(probeW) : null,
          probeSector: probeW ? secteurDe(probeW) : null,
        });
      }
    }

    // §P Dans quelle invite de sonde est-on, et la regarde-t-on ?
    if (invitesSonde.length) {
      inviteSondeVisible = false;
      for (const inv of invitesSonde) {
        if (!inv.volume) continue;
        const dec = decalageDuCorps(inv.body, anchorPos) || [0, 0, 0];
        const p = [playerW[0] - dec[0], playerW[1] - dec[1], playerW[2] - dec[2]];
        if (!insideVolume(inv, p)) continue;
        // La direction de regard est LOCALE : elle se tourne par l'orientation
        // du declencheur pour valoir quelque chose en monde.
        const monde = inv.gaze
          ? qrotDecor(inv.rotation || [0, 0, 0, 1], inv.gaze) : null;
        if (promptFaced(inv, [fwd.x, fwd.y, fwd.z], monde)) {
          inviteSondeVisible = true;
          break;
        }
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
      // §PNJ UN PERSONNAGE A PORTEE S'ANNONCE AU CENTRE, comme un objet vise.
      // Il ne se disait qu'en fin du bandeau d'etat — lequel, au doigt, tient
      // sur une ligne coupee aux 60 % de l'ecran : l'invite « parler a » y
      // tombait toujours hors champ, et rien ne disait donc qu'il y avait
      // quelqu'un a qui parler (docs/95-pnj-au-doigt.md).
      //
      // L'invite empruntee est celle de l'interaction, avec son icone et sa
      // priorite ; le MOT, lui, est du portage — `Conversation` ne construit
      // pas de `ScreenPrompt` dans l'alpha, et on ne pretend pas le contraire.
      // `UpdatePromptDisplay` : l'invite ne s'affiche que tant qu'on n'a PAS
      // interagi (`!_hasInteracted`). Une conversation ouverte la retire ; le
      // portage la laissait sous le reticule pendant tout le dialogue.
      const centre = (focus && dialogue.active) ? null
        // `InteractReceiver.Init("Repair", ...)` : l'invite du volume vise.
        : reparationVisee_ ? P("InteractVolume._screenPrompt", "Repair")
        : focus ? P("InteractVolume._screenPrompt",
                    focus.prompt || focus.name)
        : (convo && !dialogue.active)
          ? P("InteractVolume._screenPrompt",
              `Parler a ${convo.character || convo.name}`)
        : nearConsole ? P("InteractVolume._screenPrompt", `${nearConsole.name} (R)`)
        : null;
      prompts.set("center", (centre && !guiMode.hidden) ? [centre] : [], now);

      // A gauche : ce que la situation permet. Les priorites du jeu font le
      // tri — celles de la carte valent 2, celles du telescope 1, le reste 0 —
      // et seule la plus haute reste affichee.
      const left = [];
      if (solarMap && solarMap.open) {
        // `AddScreenPrompt` quand t atteint 1 : pas pendant la montee.
        if (vueCarte.promptsShown || !vueCarte.open) {
          left.push(P("MapController._closePrompt"), P("MapController._zoomPrompt"),
                    P("MapController._panPrompt"));
        }
      } else if (consoles.active && consoles.active.flight && modele) {
        // `RemoteFlightConsole.Update` : « Reset » quand le modele n'est plus a
        // sa place, sinon « Exit » et les trois poussees. Priorite 1.
        const socle = reposModeleCadre(anchorPos);
        const d = Math.hypot(modele.pos[0] - socle[0], modele.pos[1] - socle[1],
                             modele.pos[2] - socle[2]);
        for (const k of invitesConsoleModele(d)) left.push(P(`RemoteFlightConsole.${k}`));
      } else if (telescope.active) {
        left.push(P("TelescopeGUI._exitTelescopePrompt"), P("TelescopeGUI._zoomPrompt"));
      } else if (ship && ship.boarded) {
        left.push(P("ShipPromptController._exitPrompt"),
                  P("ShipPromptController._ignitionPrompt"),
                  P("ShipPromptController._mapPrompt"),
                  P("ShipPromptController._autopilotPrompt"));
      } else {
        // §U LES INVITES DU SAC DORSAL N'EXISTENT QU'EN APESANTEUR, et les
        // trois poussees qu'a l'ENTRAINEMENT. Le portage les affichait des
        // qu'on n'etait pas dans le vaisseau — c'est-a-dire presque toujours,
        // et donc pour rien (docs/80-invites.md).
        {
          const jp = jetpackPrompts({
            inField: !!player.field, mapView: solarMap.open,
            autopilotAllowed: true, targeted: !!lockOn.current,
            localSpeed: Math.hypot(player.vel.x, player.vel.y, player.vel.z),
            training: entrainementEnCours,
          });
          if (jp.thrust) {
            left.push(P("JetpackPromptController._upThrustPrompt"),
                      P("JetpackPromptController._downThrustPrompt"),
                      P("JetpackPromptController._horizontalThrustPrompt"));
          }
          // L'accord de vitesse est SEUL quand il vient : le jeu ne propose
          // qu'une chose a la fois.
          if (jp.matchVelocity) {
            left.push(P("JetpackPromptController._matchVelocityPrompt"));
          }
        }
        // §P L'INVITE DE SONDE NE S'AFFICHE PAS PARTOUT. Les quatre
        // `ProbePromptTrigger` du build sont poses sur la premiere jumelle, et
        // chacun porte une DIRECTION DE REGARD : l'invite ne vient pas parce
        // qu'on est la, mais parce qu'on regarde quelque part — le fond du
        // canyon, le camp vu d'en haut. Le portage l'affichait en permanence,
        // ce qui est la meme chose que ne rien dire (docs/75-chaleur.md).
        // Une fois les quatre detruites, l'invite ne revient JAMAIS. Sans
        // declencheur pose — un build sans ces donnees — on retombe sur
        // l'affichage permanent du portage.
        if (!invitesDetruites && (invitesSonde.length === 0 || inviteSondeVisible)) {
          left.push(P("ProbePromptController._launchPrompt"));
        }
        // `Flashlight.CheckPromptStatus` : SEPT conditions, toutes
        // necessaires, et la derniere est un OU — une zone sombre, ou la face
        // nuit. Le portage n'affichait pas cette invite du tout
        // (docs/67-annonces.md).
        if (flashlightPromptVisible({
          on: flashlight.on, suit: equipment.suit,
          inShip: !!(ship && ship.boarded), inMapView: solarMap.open,
          // `_satelliteCamMode` n'etait pas une valeur inconnue, elle etait a
          // deux lignes de la : la console du satellite EST l'une des deux
          // consoles deportees, et c'est celle qui n'est pas la console de vol.
          attached: !!consoles.active,
          satelliteCam: !!(consoles.active && !consoles.active.flight),
          inDarkZone: zonesSombres.sunless,
          onDaySide: !night,
        })) {
          // Le texte, lui, n'est pas extractible : `_flashlightPrompt` est un
          // `ScreenPrompt` serialise sur l'instance, et le portage ne sait pas
          // lire ce type-la — `composants.mjs` rend un objet vide pour tout le
          // composant. La REGLE vient du build, le mot est du portage, et
          // c'est dit ici plutot que passe sous silence.
          left.push({ text: "Lampe (F)", priority: 0, button: null });
        }
      }
      // GUIMode : le mode capture n'affiche ni le bas ni la gauche, le mode
      // masque n'affiche rien
      prompts.set("left", guiMode.full || guiMode.debug ? left.filter(Boolean) : [], now);

      // En bas : les codes de lancement, dont le texte change d'une boucle a
      // l'autre — « Aquired » la premiere fois (la faute est celle du jeu),
      // « Remembered » ensuite.
      // Cinq secondes apres l'avoir appris, ou au reveil de la deuxieme
      // boucle — pas en permanence (hud.js, `InviteCodes`).
      const codes = prompts.get("LaunchCodePromptController._codePrompt");
      const quelCode = inviteCodes.update(now);
      prompts.set("bottom",
        (quelCode !== null && codes) ? [{ text: codes.texts[quelCode], priority: 0 }] : [], now);
    }

    const hud2 = document.getElementById("hud2");
    if (hud2) {
      const bits = [`boucle ${loop.loopCount} — ${loop.label}` +
                    (death.dead ? ` — mort : ${death.label} (${death.state.phase})` : ""),
                    equipment.suit ? resources.summary() : "sans combinaison"];
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
      // La reparation : ce qui est en cours, et l'invite quand il y a a faire.
      if (ship && ship.boarded && ship.damage &&
          ship.damage.damaged) {
        bits.push(repairFraction > 0
          ? `réparation ${(repairFraction * 100).toFixed(0)} %`
          : "H pour réparer");
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
      if (marshmallow.gone) bits.push("guimauve perdue");
      else if (marshmallow.toast > 0) bits.push(
        `guimauve ${(marshmallow.toast * 100).toFixed(0)} %` +
        (marshmallow.aflame ? " — elle brûle !" : "") +
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
        ? `E pour lire ${focus.name}` : (focus.prompt || focus.name));
      hud2.textContent = bits.join("   ·   ");
      if (vueCarte.open) {
        // `WorldToScreenPoint` de la camera de la carte, sa pose de l'image.
        const tm = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
        const vp = new BABYLON.Viewport(0, 0, solarMap.canvas.clientWidth,
                                        solarMap.canvas.clientHeight);
        const avant = camera.getDirection(BABYLON.Axis.Z);
        const projeter = (p) => {
          const v = new BABYLON.Vector3(p[0], p[1], p[2]);
          const e = BABYLON.Vector3.Project(v, BABYLON.Matrix.IdentityReadOnly, tm, vp);
          return [e.x, e.y, BABYLON.Vector3.Dot(v.subtract(camera.position), avant)];
        };
        solarMap.drawProjete(projeter, player.pos, ship ? ship.pos : null, dansEpave);
      } else {
        solarMap.draw(player.pos, ship ? ship.pos : null, dansEpave);
      }
    }
    {
      // `_isMuseumSign` vient maintenant de la vue : un objet lisible le porte
      // toujours (`DialogueBox(..., true)`), une conversation selon sa zone.
      const v = dialogue.view;
      dlgUI.render(v);
    }

    // --- secteurs ---
    if (sectors) {
      sectorState = sectors.update(player.pos, anchorPos);
      // hors geometrie active, la sphere de substitution reprend la main
      for (const e of entries) {
        if (e.isStar) continue;
        const ent = entryForBody(geo, e.data.name);
        e.mesh.isVisible = !ent || (!sectors.lointain && !sectors.active.has(ent.file));
      }
      // La limite de poussee du secteur s'applique enfin au vaisseau : 20
      // partout, 200 sur la premiere jumelle, illimitee sur Giant's Deep.
      //
      // `SectorDetector.GetThrustLimit` prend le MINIMUM sur toute la liste des
      // secteurs touches, pas sur le seul secteur actif : l'epave est dans Dark
      // Bramble, et la plus basse des deux limites tient quel que soit celui
      // des deux qui est actif. Le portage minait deux listes differentes avec
      // deux regles differentes pour arriver a peu pres la.
      const limite = sectorThrustLimit(majSecteurs, playerW,
                                       (x) => decalageDuCorps(x.body, anchorPos));
      if (ship) ship.thrustLimit = limite;
      // Les phares suivent la coque et s'eteignent des qu'on la quitte.
      if (ship) {
        const allumes = !!ship.boarded;
        phares.setEnabled(allumes);
        if (allumes) {
          const a = ship.axes;
          phares.position.set(ship.pos.x + a.fwd[0] * 2,
                              ship.pos.y + a.fwd[1] * 2,
                              ship.pos.z + a.fwd[2] * 2);
          phares.direction.set(a.fwd[0], a.fwd[1], a.fwd[2]);
          // `SectorDetector.GetShiplightRangeLimit` : le secteur ACTIF, et lui
          // seul. Giant's Deep bride les phares a 200, l'epave a 100.
          phares.range = shiplightRange(
            secMaj ? secMaj.shiplightLimit : null, !!secMaj);
        }
      }
      // L'eclairage ambiant suit `_ambientLightRange`, mesure depuis le centre
      // du secteur courant.
      //
      // `AmbientLightManager.Update` part du NOIR et ne prend l'ambiance du
      // secteur qu'a trois conditions : aucune zone sans soleil, un secteur
      // majeur actif, et la carte fermee. Puis il y FOND, a `deltaTime` du
      // chemin restant — une grotte s'assombrit, elle ne s'eteint pas.
      //
      // `_distanceToMajorSector` se mesure jusqu'au centre du secteur ACTIF, au
      // repos : c'est la seule distance que `GetAmbientLight` regarde.
      let vise = 0;
      if (secMaj) {
        const dec = decalageDuCorps(secMaj.body, anchorPos);
        const p = restingPoint(playerW, dec);
        const d = Math.hypot(p[0] - secMaj.position[0], p[1] - secMaj.position[1],
                             p[2] - secMaj.position[2]);
        vise = ambientIntensity(d, secMaj.lightRange, secMaj.ambient);
      } else {
        vise = ambientIntensity(0, 0, 0);
      }
      ambient.intensity = ambientStep(ambient.intensity,
        ambientTarget(vise, { sunless: zonesSansSoleil.sunless,
                              inMajorSector: !!secMaj,
                              onMapCamera: !!solarMap.open }), dt);
      // La TEINTE du secteur, que le portage ne lisait pas : `_ambientLight`
      // est un choix de couleur, pas un nombre. Bleu de nuit sur les mondes
      // rocheux, vert sur Giant's Deep et Dark Bramble.
      // Sa valeur aussi : 0,0588, doublee — un bleu tres sombre, que le
      // soleil et les feux dominent. Et uniforme : l'ambiance d'Unity n'a ni
      // ciel ni sol, d'ou le sol de l'hemisphere pose a la meme couleur.
      const teinte = ambientLight(secMaj ? secMaj.ambient : 0);
      ambient.diffuse.set(teinte[0], teinte[1], teinte[2]);
      ambient.groundColor.set(teinte[0], teinte[1], teinte[2]);

      // niveau de detail par maillage, sur les lots effectivement affiches
      meshLOD.update(geo, camera.position,
                     (f) => sectors.lointain || sectors.active.has(f));

      // eviction : ce qui est hors de portee depuis assez longtemps est rendu
      // En vue lointaine, rien ne se libere : ce qu'on voit au loin reste la.
      for (const e of geo) evictor.see(e.file, sectors.lointain || sectors.inRange.has(e.file));
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
    // `PlayerNoiseMaker.Update` : le bruit est PROPORTIONNEL a la poussee, et
    // lancer une sonde fait un COUP de cinq qui retombe en une seconde. Le
    // portage rendait un booleen a 1 ou 0,7 et ignorait la sonde — on pouvait
    // en lancer une au nez d'un predateur sans qu'il l'entende.
    // `ThrusterModel.GetThrustFraction`, et non plus trois paliers inventes :
    // c'est la NORME de l'entree bornee axe par axe, que `player.js` pose a
    // chaque image. Elle monte a racine(3) sur une poussee en diagonale, ce
    // que le seuil de dix du `NoiseSensor` attend (docs/119-bruit.md).
    const fractionPoussee = player.thrustFraction || 0;
    const playerWorld = { x: player.pos.x + anchorPos[0],
                          y: player.pos.y + anchorPos[1],
                          z: player.pos.z + anchorPos[2] };
    noise.clear();
    const bruit = playerNoise(fractionPoussee, now, dernierLancement);
    if (bruit > 0) {
      // Deux echelles, et les deux servent : `level` (0 a 1) pour comparer les
      // sources entre elles, `volume` — celle du build — pour le seuil de dix.
      // Le rayon est infini : `ListenForNoises` ne connait pas de portee, il
      // ne connait qu'un rayon de CIBLE. Au-dela, c'est le volume qui decide.
      noise.add([playerWorld.x, playerWorld.y, playerWorld.z],
                Math.min(1, bruit / NOISE.thrust), Infinity, bruit);
    }
    // `ShipNoiseMaker` : le vaisseau fait son propre bruit (poussee et choc violent)
    if (ship && ship.boarded) {
      const bruitShip = ship.noise(now);
      if (bruitShip > 0) {
        const sp = [ship.pos.x + anchorPos[0], ship.pos.y + anchorPos[1], ship.pos.z + anchorPos[2]];
        noise.add(sp, Math.min(1, bruitShip / 10), Infinity, bruitShip);
      }
    }
    if (audioMap.length) {
      for (const e of audio.emitters()) noise.add(e.position, e.level, e.radius);
    }
    for (const f of fish) {
      f.update(dt, playerWorld, noise);
      if (f.stateChanged) {
        if (f.state === "repos") {
          const sl = sonsUI.anglerLurking();
          if (sl) audio.loopAt(sl.file, sl.volume);
          const sc = sonsUI.anglerChase();
          if (sc) audio.loopAt(sc.file, 0);
        } else if (f.state === "inspecte") {
          const s = sonsUI.anglerDisturbance();
          if (s) audio.playOneShot(s.file, { volume: s.volume });
          const sl = sonsUI.anglerLurking();
          if (sl) audio.loopAt(sl.file, 0);
          const sc = sonsUI.anglerChase();
          if (sc) audio.loopAt(sc.file, 0);
        } else if (f.state === "poursuit") {
          const s = sonsUI.anglerTarget();
          if (s) audio.playOneShot(s.file, { volume: s.volume });
          const sl = sonsUI.anglerLurking();
          if (sl) audio.loopAt(sl.file, 0);
          const sc = sonsUI.anglerChase();
          if (sc) audio.loopAt(sc.file, sc.volume);
        }
      }
      if (f.caught && !death.dead) {
        const s = sonsUI.anglerCrunch();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
        death.kill("digestion");
      }
    }
    thorns.update(loop.fraction);
    // Le seuil de decoupe des materiaux corrompus suit la fraction de boucle.
    if (corruption.items.length) corruption.update(loop.fraction);
    // Zone d'epave : la mise a jour du brouillard y est suspendue.
    if (derelicts.length) {
      const inside = derelicts.some((d) => Math.hypot(
        d.position[0] - playerWorld.x, d.position[1] - playerWorld.y,
        d.position[2] - playerWorld.z) < d.radius);
      // `MapMarker.LateUpdate` efface TOUS les marqueurs dans la zone
      // brouillee : on n'a pas de carte dans l'epave, et c'est ce qui la rend
      // difficile a quitter.
      dansEpave = inside;
      if (fog.setSuspended(inside)) {
        console.log(inside ? "EnterDerelictZone" : "ExitDerelictZone");
      }
    }
    // `ShipOnlyMusicVolume` : musique de l'espace dans Dark Bramble (clip 2249),
    // active uniquement quand le joueur est a la fois dans le volume et dans le vaisseau.
    const dbBody = bodies.find((b) => /bramble/i.test(b.name));
    const inDarkBramble = dansEpave || (dbBody && Math.hypot(
      dbBody.position[0] - playerWorld.x,
      dbBody.position[1] - playerWorld.y,
      dbBody.position[2] - playerWorld.z) < 1200);
    const playDbMusic = shipOnlyMusicState(inDarkBramble, !!(ship && ship.boarded));
    if (playDbMusic) {
      dbMusicLevel = Math.min(0.6, dbMusicLevel + dt / 5.0);
    } else {
      dbMusicLevel = Math.max(0, dbMusicLevel - dt / 5.0);
    }
    audio.loopAt("OW Space - Into The Unknown 100912 AP_2249.ogg", dbMusicLevel);

    // --- trou noir : capture puis ejection au trou blanc ---
    if (blackHole) {
      // `ForceWarp` sort DROIT DEVANT le trou blanc : son avant, et non une
      // verticale quelconque. Le portage tirait au hasard dans un cone qui,
      // lui, n'appartient qu'aux debris (docs/102-trou-blanc.md).
      const t = blackHole.capture(player.pos, anchorPos, trouBlancAxes.fwd);
      if (t) {
        // `OnPlayerEnterBlackHole` : l'image se visse de 220 a 360 degres en
        // deux secondes. C'est ce qui fait qu'on ne voit pas la coupure.
        fx.enterBlackHole(now);
        sonsUI.blackHoleWarp();
        player.pos.x = t.position[0]; player.pos.y = t.position[1]; player.pos.z = t.position[2];
        player.vel.x = t.velocity[0]; player.vel.y = t.velocity[1]; player.vel.z = t.velocity[2];
        // `ReceiveWarpedPlayer` aligne l'avant de la camera sur celui du trou
        // blanc AVANT de deplacer le corps : on ressort en regardant la ou
        // l'on part, et non dans la direction ou l'on tombait.
        const lacet = BlackHole.lookTowardExit(t.forward, [up.x, up.y, up.z]);
        if (lacet !== null) yaw = lacet;
        if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos, false);
      }
    }

    // --- croute de Brittle Hollow ---
    //
    // Les fragments sont integres dans le repere LOCAL du conteneur glTF, ou la
    // planete ne bouge pas : pas de conversion de repere a chaque pas, et le
    // decalage du floating origin reste porte par le conteneur.
    // --- les meteores ---
    //
    // Ils partent de leur lanceur, retombent avec le champ dominant, et
    // blessent au contact passe la demi-seconde d'immunite du prefabrique.
    if (meteores.launchers.length) {
      // `LaunchMeteor` joue `_launchParticles` ; `Update` les arrete
      // `_particleEmitDuration` secondes plus tard.
      const nes = meteores.update(dt, now);
      for (const m of nes) {
        const l = meteores.launchers.find((x) => x.data.name === m.from && x.last === now);
        if (!l) continue;
        if (particles.jouerPres("EruptionParticles", l.data.position, 40)) {
          eruptions.push({ position: l.data.position, fin: now + (l.data.emitSeconds || 3) });
        }
      }
      eruptions = eruptions.filter((e) => {
        if (now < e.fin) return true;
        particles.arreterPres("EruptionParticles", e.position, 40);
        return false;
      });
      // Le champ dominant AU METEORE, et non celui du joueur : un caillou
      // au-dessus de Brittle Hollow retombe vers Brittle Hollow, meme quand le
      // joueur est ailleurs (docs/121-avis.md).
      meteores.step(dt, (p) => dominantField(bodies, { x: p[0] - anchorPos[0],
                                                       y: p[1] - anchorPos[1],
                                                       z: p[2] - anchorPos[2] }));
      // Les meteores vivent en coordonnees MONDE, comme leurs lanceurs ; le
      // joueur vit dans le repere courant. Le contact se testait entre les
      // deux, et ne pouvait donc jamais se produire (docs/121-avis.md).
      const touche = meteores.hits([player.pos.x + anchorPos[0],
                                    player.pos.y + anchorPos[1],
                                    player.pos.z + anchorPos[2]], 1);
      if (touche) {
        meteores.consume(touche);
        resources.damage(touche.damage);
        console.log(`meteore : ${touche.damage} de degats`);
      }
      for (let i = 0; i < meteores.meteors.length; i++) {
        if (!meteorMeshes[i]) {
          const m = BABYLON.MeshBuilder.CreateSphere(`meteor${i}`,
            { diameter: 2 * METEOR.damage / 25, segments: 6 }, scene);
          m.material = meteorMat;
          m.isPickable = false;
          meteorMeshes.push(m);
        }
        // La scene est dans le repere courant ; le meteore est en monde.
        const q = meteores.meteors[i].pos;
        meteorMeshes[i].position.set(q[0] - anchorPos[0], q[1] - anchorPos[1],
                                     q[2] - anchorPos[2]);
        meteorMeshes[i].setEnabled(true);
      }
      for (let i = meteores.meteors.length; i < meteorMeshes.length; i++) {
        meteorMeshes[i].setEnabled(false);
      }
    }

    // --- ce qui clignote, ce qui s'aligne, ce qui est repare ---
    //
    // Trois lois de `attachments.js`, ecrites pour docs/55 et jamais appelees.
    // Elles se rattachent par NOM au maillage charge, comme les nuages et les
    // pivots de tornade — et comme eux, un nom peut manquer : un objet non
    // rattache reste simplement sans effet.
    for (const c of clignotants) {
      if (!c.node) {
        for (const e of geo) {
          const n = e.nodes.get(c.data.name);
          if (n) { c.node = n; c.blinker.activate(now); break; }
        }
        if (!c.node) continue;
      }
      c.node.setEnabled(c.blinker.update(now));
    }
    for (const a of alignes) {
      if (a.node === undefined) {
        a.node = null;
        for (const e of geo) { const n = e.nodes.get(a.name); if (n) { a.node = n; break; } }
      }
      if (!a.node || !a.target) continue;
      const cible = bodies.find((b) => b.name === a.target || b.bodyName === a.target);
      if (!cible) continue;
      // `AlignWithTargetBody` : le HAUT vise le corps designe, et non la
      // verticale de la gravite dominante.
      const p0 = a.node.getAbsolutePosition();
      const dir = alignmentDirection([p0.x, p0.y, p0.z], cible.position);
      const haut = new BABYLON.Vector3(-dir[0], -dir[1], -dir[2]);
      a.node.rotationQuaternion = BABYLON.Quaternion.FromLookDirectionLH(
        BABYLON.Vector3.Cross(haut, BABYLON.Axis.X).normalize(), haut);
    }
    // `BrokenNode.OnCompleteRepair` : le materiau change, et la reparation SE
    // VOIT. Le portage n'a pas les materiaux du build sous la main pour ces
    // trois noeuds ; il pose la couleur que le nom du materiau annonce.
    if (training.total) {
      for (const r of training.nodes) {
        if (!r.done || r.peint) continue;
        for (const e of geo) {
          const n = e.nodes.get(r.name);
          if (!n) continue;
          for (const m of (n.getChildMeshes ? n.getChildMeshes() : [])) {
            if (m.material && m.material.emissiveColor) {
              m.material = m.material.clone(`${m.material.name}_repare`);
              m.material.emissiveColor = new BABYLON.Color3(0.2, 0.9, 0.35);
            }
          }
          r.peint = true;
          break;
        }
      }
    }

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
              // `Detach` : il part avec la VITESSE DU POINT d'ou il se detache.
              // `_escapeFromParentSpeed` vaut 0 sur l'unique instance, donc
              // rien ne l'ejecte — mais la rotation de la planete, elle, lui
              // donne une vitesse, et il ne tombe pas droit (docs/110).
              vel: detachVelocity([local.x, local.y, local.z],
                                  [c.x, c.y, c.z], bodySpin(bhBody)),
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
    //
    // Le telescope se zoome A LA MAIN (`OWInput.GetAxis(zoomIn/zoomOut)`, 50
    // degres par seconde) entre 10 et 60 degres, et il ENTRE a 33,33 — pas au
    // plus etroit, comme le portage le faisait. Les touches sont celles du
    // build : `Zoom In` et `Zoom Out` sont majuscule et controle, les MEMES
    // que la montee et la descente au sac dorsal. Le portage avait pris R et F
    // « faute d'en avoir une paire libre plus naturelle » — la paire existait.
    const zoomAxe = telescope.active
      ? ((cmds.held("Zoom In", etatCmd) ? 1 : 0)
         - (cmds.held("Zoom Out", etatCmd) ? 1 : 0)) : 0;
    // Carte ouverte, c'est `MapCamera` qui fixe champ et plan proche.
    const fovLunette = telescope.update(dt, zoomAxe);
    if (!vueCarte.open) camera.fov = fovLunette;
    // Le zoom du verrouillage, quand la lunette ne sert pas : `Lerp` vers le
    // champ vise a `_zoomSpeed * deltaTime` par image — le meme glissement par
    // image que l'assise, et la meme dependance a la cadence.
    if (verrouFOV !== null && !telescope.active && !vueCarte.open) {
      const vise = verrouFOV * Math.PI / 180;
      camera.fov += (vise - camera.fov) * Math.min(1, LOCK_ON.zoomSpeed * dt);
    }
    // `EnterTelescope` / `ExitTelescope` deplacent le plan proche de 0,05 a
    // 0,5 : a dix degres de champ, un plan proche a cinq centimetres ruine la
    // precision de profondeur sur tout le lointain.
    if (!vueCarte.open) camera.minZ = telescope.nearClip;
    // La lunette a un corps et un verre dans le build : on les montre quand
    // elle sert, et le portage ne montrait rien. `TelescopeGUI.LateUpdate` la
    // fait GROSSIR avec le champ — quatre fois plus grande a soixante degres
    // qu'a quinze — et elle se retracte a mesure qu'on resserre.
    {
      const lunette = enMain.get("telescopegui");
      if (lunette) {
        for (const m of lunette.meshes) m.setEnabled(telescope.active);
        const k = telescopeScale(telescope.fov);
        lunette.racine.scaling.set(k, k, k);
      }
    }
    if (ondeEl) ondeEl.hidden = !telescope.active || guiMode.hidden;
    // §P LA REGLETTE DE ZOOM. `TelescopeGUI` pose une fleche sur une reglette,
    // dont la hauteur dit le champ courant entre le minimum et le maximum. Le
    // portage montrait la lunette et son onde, et pas ou l'on en etait du zoom.
    if (zoomEl) {
      const montre = telescope.active && !guiMode.hidden;
      zoomEl.hidden = !montre;
      if (montre) {
        zoomEl.style.setProperty("--fleche",
          `${(zoomArrowFraction(telescope.fov) * 100).toFixed(1)}%`);
      }
    }

    // §L LE MARQUEUR DE SONDE. `WorldToScreenPoint` a son origine en BAS a
    // gauche, `GUI` en haut : d'ou la soustraction a la hauteur, et les trente
    // pixels qui remontent l'etiquette au-dessus du point (docs/60).
    if (marqueurEl) {
      const s = probes.last;
      let pose = null;
      if (s && !guiMode.hidden) {
        const v = BABYLON.Vector3.Project(
          new BABYLON.Vector3(s.pos[0], s.pos[1], s.pos[2]),
          BABYLON.Matrix.Identity(),
          scene.getTransformMatrix(),
          camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
        // `Project` rend deja l'origine en haut a gauche et `z` la profondeur
        // normalisee : on repasse en convention `WorldToScreenPoint` pour que
        // la loi du build s'applique telle qu'elle est ecrite.
        const h = engine.getRenderHeight();
        const devant = v.z > 0 && v.z < 1;
        pose = devant
          ? probeLabelPos({ x: v.x, y: h - v.y, z: 1 }, h, MARQUEUR) : null;
      }
      if (!pose) marqueurEl.hidden = true;
      else {
        const d = Math.hypot(s.pos[0] - player.pos.x, s.pos[1] - player.pos.y,
                             s.pos[2] - player.pos.z);
        const icone = probeIcon(s.damagePerSecond || 0,
                                s.lastContact ?? null, s.anchored);
        marqueurEl.hidden = false;
        marqueurEl.dataset.icon = icone;
        marqueurEl.style.left = `${Math.round(pose.x)}px`;
        marqueurEl.style.top = `${Math.round(pose.y)}px`;
        marqueurEl.textContent = probeReadout(d, null, s.probeInfos || []);
      }
    }
    if (telescope.active && pdata.learn("knowsHowTelescopeWorks")) {
      console.log("usage du telescope appris");
    }
    // La sonde : un seul bouton, comme dans le build — `launchProbe`,
    // `takeSnapshot` et `retrieveProbe` sont trois statiques d'`OWInput`
    // construites sur le MEME canal (`InputChannels.probe`). Quand la lunette
    // est ouverte, la touche porte le zoom : les deux ne peuvent pas servir
    // ensemble, et le build non plus ne les melange pas (`_telescopeInputs`
    // n'a pas la sonde).
    const probeHeld = (cmds.held("Probe", etatCmd) || !!ax.probe)
      && !telescope.active;
    // La sonde se RAMASSE (docs/46, lot 7) : `ExpeditionGear` la debloque, dans
    // la cabine du vaisseau. Sans elle, la touche ne lance rien — c'est la
    // progression du build, et le portage donnait tout au premier instant.
    if (probeHeld && !equipment.probe && !probes.last) {
      if (!probeRefusee) console.log("sonde : elle se ramasse d'abord, dans la cabine du vaisseau");
      probeRefusee = true;
    } else if (!probeHeld) {
      probeRefusee = false;
    }
    // Le poste de pilotage est le seul « dedans » que ce portage ait : il n'a
    // pas d'interieur de vaisseau. `IsInsideShip() && !AtFlightConsole()`
    // refuse le tir ; ici les deux vont donc ensemble, et le refus ne se
    // declenche jamais. On le cable quand meme, plutot que de le supprimer :
    // c'est la ligne du build, et l'interieur viendra.
    etatJoueur.insideShip = etatJoueur.atFlightConsole = !!(ship && ship.boarded);
    // Le lancer de rayon de la sonde : la fenetre de tir, puis l'ancrage.
    // Havok travaille dans le repere ancre, comme `player.pos` — les deux
    // parlent le meme espace, et rien n'a besoin d'etre reporte.
    const rayonSonde = plugin ? (depuis, dir, portee) => {
      const eng = scene.getPhysicsEngine();
      if (!eng || !eng.raycast) return null;
      try {
        const a = new BABYLON.Vector3(depuis[0], depuis[1], depuis[2]);
        const b = new BABYLON.Vector3(depuis[0] + dir[0] * portee,
                                      depuis[1] + dir[1] * portee,
                                      depuis[2] + dir[2] * portee);
        const hit = eng.raycast(a, b);
        if (!hit || !hit.hasHit) return null;
        const q = hit.hitPointWorld || hit.hitPoint;
        const n = hit.hitNormalWorld || hit.hitNormal;
        if (!q) return null;
        return { point: [q.x, q.y, q.z],
                 normal: n ? [n.x, n.y, n.z] : null,
                 // Tout ce que le portage pose est statique du point de vue de
                 // Havok : le decor bouge par le repere, pas par un corps. Le
                 // capteur haute vitesse est donc le seul a s'en servir.
                 dynamic: false };
    } catch (e) { return null; }
    } : null;
    const champ = player.field;
    probes.update(dt,
      { launch: probeHeld && !!equipment.probe, retrieve: probeHeld,
        alt: cmds.held("Alt Probe", etatCmd) && !consoles.count },
      { pos: [player.pos.x, player.pos.y, player.pos.z],
        forward: [fwd.x, fwd.y, fwd.z],
        playerForward: [fwd.x, fwd.y, fwd.z],
        playerUp: [up.x, up.y, up.z],
        playerVelocity: [player.vel.x, player.vel.y, player.vel.z],
        playerPos: [player.pos.x, player.pos.y, player.pos.z],
        knowsProbes: pdata.knows("knowsHowProbesWork"),
        horloge: horlogeImage,
        insideShip: etatJoueur.insideShip,
        atFlightConsole: etatJoueur.atFlightConsole,
        raycast: rayonSonde,
        field: champ,
        wellCenter: champ ? champ.body.position : null,
        sectorCenter: champ ? champ.body.position : null,
        sectorRadius: champ ? (champ.body.gravity.upperSurfaceRadius || 0) : 0,
        sectorVelocity: [0, 0, 0] });
    for (const e of probes.events) {
      if (e === "LaunchProbe") {
        // `PlayerNoiseMaker.OnLaunchProbe` : le lancement fait du BRUIT, cinq
        // d'un coup, qui retombe en une seconde.
        dernierLancement = now;
        const high = probes.events.includes("ProbeLaunch_HighPower");
        const s = sonsUI.probeLaunch(high);
        if (s) audio.playOneShot(s.file, { volume: s.volume });
        // §Q `DestroyAllProbePromptTriggers` : lancer une sonde depuis une
        // invite les DETRUIT TOUTES — pas seulement celle-la. Les quatre
        // invites sont un tutoriel a usage unique : une fois qu'on a compris,
        // le jeu ne le redit jamais. Le portage les aurait remontrees a chaque
        // passage (docs/76-proximite.md).
        if (invitesSonde.length && inviteSondeVisible) {
          invitesSonde = [];
          invitesDetruites = true;
          inviteSondeVisible = false;
          window.__invites.sonde = invitesSonde;
          window.__invites.detruites = true;
          console.log("annonce : DestroyAllProbePromptTriggers");
        }
      }
      if (e === "RetrieveProbe") {
        const s = sonsUI.probeRetrieve();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
      }
      if (e === "ProbeSnapshot") {
        const s = sonsUI.cameraShutter();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
      }
      // §V LE TUTORIEL DE LA SONDE NE S'ACQUIERT PAS AU LANCEMENT.
      //
      // `ProbePromptController.OnProbeDestroyed` : le savoir vient quand la
      // sonde est DETRUITE, et seulement si l'on a pris PLUS DE DEUX photos en
      // vol d'ici la. Trois photos en l'air, puis la sonde qui meurt — voila ce
      // que « comprendre les sondes » veut dire pour ce jeu.
      //
      // Le portage l'accordait au premier tir, ce qui est exactement le
      // contraire : il suffisait d'appuyer une fois (docs/81-invulnerable.md).
      if (e === "MidairProbeSnapshot") photosEnVol++;
      if (e === "ProbeDestroyed" || e === "RetrieveProbe") {
        if (photosEnVol > 2 && pdata.learn("knowsHowProbesWork")) {
          console.log("annonce : CompleteProbeTutorial — fonctionnement des sondes appris");
        }
        photosEnVol = 0;
      }
      if (e === "ProbeLaunchAborted") {
        // `NotificationManager.OnProbeLaunchAborted` : l'avis une seconde et
        // demie, PUIS le son negatif. Le portage se contentait d'une ligne de
        // journal (docs/121-avis.md).
        notifications.annonce("ProbeLaunchAborted", now);
        bipUI("PlayNegativeUISound");
        console.log("tir de sonde refuse : pas de fenetre");
      }
      if (e === "ProbeSnapshot" && probes.lastSnapshot) {
        console.log(`photo de sonde : ${probes.lastSnapshot.size} px`
          + (probes.lastSnapshot.rear ? " (arriere)" : ""));
      }
    }
    syncProbes();
    // La vue deportee est la meme, avec une autre cible : une console prise en
    // main passe devant la sonde, qui n'est pas ce qu'on regarde a ce
    // moment-la.
    const remoteView = consoles.view(anchorPos,
      { ship, body: player.field && player.field.body });
    // La touche `altProbe` (R dans le build) montre l'arriere : c'est la seule
    // vue utile une fois la sonde plantee.
    probeCam.update(guiMode.hidden ? null : (remoteView || probes.last),
                    !remoteView && cmds.held("Alt Probe", etatCmd) && !consoles.count);

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
    // L'onde se trace APRES la somme des emetteurs, et non avant : c'est
    // l'ordre de `Telescope.Update`, qui lit `_signalStrength`, dessine, puis
    // remet a zero. Tracer plus haut dans la boucle rendrait l'image d'avant.
    if (telescope.active) traceOnde(telescope.signalStrength, now);

    // --- mixage par piste ---
    //
    // MixEndTimes fait tomber musique et ambiance a zero quand la fin des temps
    // commence ; MixDeath isole la piste de mort.
    //
    // Le declencheur etait faux de quatre-vingt-dix secondes. Le portage mixait
    // a `loop.supernova`, c'est-a-dire a l'instant ou l'etoile explose ;
    // `EndOfTimeMusicController.Update` le fait a `GetSecondsRemaining() < 90`,
    // et il le fait ENSEMBLE avec l'entree de sa propre musique — le silence de
    // la musique de voyage et de l'ambiance est ce sur quoi celle de la fin des
    // temps se pose. Mixer a l'explosion, c'etait jouer les deux par-dessus
    // pendant une minute et demie, puis faire le silence une fois tout fini.
    //
    // La duree, elle, est dans l'IL a cote du seuil : `MixEndTimes(5)`, et non
    // trois. `END_OF_TIME.mix` la portait deja sans que personne l'appelle.
    mixer.update(dt);
    if (loop.endMusic && !mixedEndTimes) {
      mixer.mixEndTimes(END_OF_TIME.mix); mixedEndTimes = true;
    }
    if (loop.dead && !mixedDeath) { mixer.mixDeath(1); mixedDeath = true; }
    if (!loop.endMusic && !loop.dead && (mixedEndTimes || mixedDeath)) {
      mixer.reset(); mixedEndTimes = false; mixedDeath = false;
    }

    // --- lampe, ordinateur de bord, guimauve ---
    //
    // La lampe s'eteint d'elle-meme dans le vaisseau, la carte ou une
    // conversation : le jeu appelle TurnOff sur chacun de ces evenements.
    if (ship && ship.boarded) flashlight.forceOff();
    if (solarMap.open || dialogue.active) flashlight.forceOff();
    // `SectorDetector.GetFlashlightRangeLimit` lit `_flashlightRangeLimit` sur
    // le secteur actif. Le portage lui passait `_ambientLightRange`, qui est
    // une autre grandeur pour un autre usage : la lampe se trouvait bridee a
    // 250 sur Timber Hearth et a 750 sur Giant's Deep, alors qu'AUCUN des dix
    // secteurs ne la bride (les dix `_flashlightRangeLimit` sont nuls).
    flashlight.update(camera, fwd, secMaj ? secMaj.flashlightLimit : null);
    // Face nuit : la hauteur du soleil au-dessus de l'horizon local. Elle n'a
    // de sens que depuis que les corps tournent sur eux-memes — sur une planete
    // figee, la face nuit ne le devenait jamais.
    if (star0) night = sunElevation(star0.position, [up.x, up.y, up.z]) < 0;
    // La guimauve ne cuit plus sur commande mais au-dessus des braises : la
    // chaleur vient du HeatSource le plus proche.
    let chaleurBaton = 0;
    if (heat.length) {
      const h = heatAt(heat, [playerWorld.x, playerWorld.y, playerWorld.z],
                       (x) => decalageDuCorps(x.body, anchorPos));
      chaleurBaton = h;
      marshmallow.held = h > 0 || marshmallow.toast > 0;
      marshmallow.update(dt, h);
    }
    // §M ON NE GRILLE PAS DE LOIN. `RoastPromptEvent` coupe le grillage des
    // qu'on s'eloigne de plus de quatre unites du feu — c'est ce qui empeche de
    // partir la guimauve a la main et de la voir cuire en marchant. Les huit
    // invites du build portent la distance, et toutes la meme.
    // §U LE BATON SORT EN APPUYANT PRES DU FEU. `RoastPromptEvent` annonce
    // `BeginRoasting`, que `MarshmallowStick` ecoute pour le sortir ; s'eloigner
    // annonce `StopRoasting` et le range. Le portage avait une touche a lui
    // (docs/64), faute d'avoir vu le declencheur (docs/80-invites.md).
    if (invitesGuimauve.length) {
      const pw = [playerWorld.x, playerWorld.y, playerWorld.z];
      for (const inv of invitesRoast) {
        const dec = decalageDuCorps(inv.data.body, anchorPos) || [0, 0, 0];
        const d = Math.hypot(pw[0] - inv.data.position[0] - dec[0],
                             pw[1] - inv.data.position[1] - dec[1],
                             pw[2] - inv.data.position[2] - dec[2]);
        if (interactPressed && !dialogue.active && d <= inv.data.distance) {
          if (inv.etat.press() && !baton.out) {
            baton.toggle();
            console.log("annonce : BeginRoasting");
          }
          interactPressed = false;
        }
        if (inv.etat.update(d)) {
          // `OnStopRoasting` ne range le baton QUE s'il est sorti.
          if (baton.out) baton.toggle();
          console.log("annonce : StopRoasting");
        }
      }
    }
    if (invitesGuimauve.length && marshmallow.toast > 0) {
      const pw = [playerWorld.x, playerWorld.y, playerWorld.z];
      let proche = null, best = Infinity;
      for (const inv of invitesGuimauve) {
        const dec = decalageDuCorps(inv.body, anchorPos) || [0, 0, 0];
        const d = Math.hypot(inv.position[0] + dec[0] - pw[0],
                             inv.position[1] + dec[1] - pw[1],
                             inv.position[2] + dec[2] - pw[2]);
        if (d < best) { best = d; proche = inv; }
      }
      if (roastBroken(best, proche)) {
        marshmallow.held = false;
        chaleurBaton = 0;
        if (!grillageRompu) {
          grillageRompu = true;
          console.log("grillage interrompu : trop loin du feu");
        }
      } else grillageRompu = false;
    }
    // Le baton a guimauve, tel que le build le joue : deux clips a la queue au
    // reveil, `PutBack` quand on a mange, et le thermometre SCRUBBE sur la
    // chaleur — vitesse zero, pose choisie a la main (docs/64-mains.md).
    {
      const objet = enMain.get("marshmallowstick");
      const enCours = objet
        ? objet.groupes.some((g) => g.isPlaying && !g.name.includes("Therm")) : false;
      baton.update(dt, { eaten: mangeCetteImage, heat: chaleurBaton,
                         playing: enCours });
      mangeCetteImage = false;
      if (objet) syncBaton(objet, baton, chaleurBaton);
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
    // pilotage, la carte laisse ses gestes au canvas, la combinaison affiche le jetpack.
    touch.setContext({ menu: settings.open || computer.open, map: solarMap.open, suit: equipment.suit });
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

    // --- §L ce qui bouge quand on ne le regarde pas ---
    //
    // La regle est la meme pour les cinq objets de la lune et pour la statue du
    // musee, et elle tient en une ligne : l'objet s'effondre a l'INSTANT ou il
    // sort du champ de la camera active. Pas pendant qu'on le regarde, pas
    // pendant qu'on ne le regarde pas — sur la transition.
    //
    // Et chaque place tiree est refusee si elle est VISIBLE : un objet
    // quantique ne se materialise jamais sous vos yeux. C'est ce refus qui
    // rend la mecanique credible, et c'est lui qu'un portage presse oublierait.
    if (objetsQ.length && geo.length) {
      for (const o of objetsQ) {
        if (o.node === undefined) {
          o.node = null;
          // Trois `Pine_Thick` homonymes : on rattache par POSITION, comme les
          // dix visages de nuage et les six buses du modele reduit.
          for (const e of geo) {
            const n = noeudLePlusProche(e, o.name, o.position, anchorPos);
            if (n) { o.node = n; break; }
          }
        }
        if (!o.node) continue;
        // `Start` appelle `Collapse()` UNE FOIS : les cinq ne sont jamais la ou
        // la scene les pose. Ce n'est pas un hasard de partie, c'est la
        // premiere image qu'on a d'eux.
        if (!o.brouille) {
          o.brouille = true;
          o.collapse(() => tirerPlaceQuantique(o, anchorPos));
        }
        const visible = dansLeChamp(o.node);
        o.update(visible, () => tirerPlaceQuantique(o, anchorPos));
        const p = o.position;
        o.node.setAbsolutePosition(
          new BABYLON.Vector3(p[0] - anchorPos[0], p[1] - anchorPos[1],
                              p[2] - anchorPos[2]));
      }
    }
    // La statue ne se DEPLACE pas : chacun de ses morceaux a une chance sur
    // cinq d'etre encore la. Detourner les yeux d'une tete ancienne en
    // vitrine, et n'en retrouver qu'un cinquieme.
    for (const st of statuesQ) {
      if (st.noeuds === undefined) {
        st.noeuds = [];
        for (const nom of st.parts) {
          for (const e of geo) {
            const n = e.nodes.get(nom);
            if (n) { st.noeuds.push(n); break; }
          }
        }
        st.etat = new ObjetQuantique({ name: st.name, position: st.position });
      }
      if (!st.noeuds.length) continue;
      const visible = st.noeuds.some((n) => dansLeChamp(n));
      if (st.etat.update(visible)) {
        const tirage = statueParts(st.parts);
        for (let i = 0; i < st.noeuds.length; i++) {
          st.noeuds[i].setEnabled(tirage[i] ? tirage[i].visible : true);
        }
      }
    }

    // --- les effets d'image ---
    //
    // On branche les evenements sur les TRANSITIONS plutot que sur les appels :
    // `death.kill()` est appele sept fois dans cette boucle et ne retient que
    // la premiere cause, et un volume mortel qu'on ne quitte pas le rappelle a
    // chaque image. Guetter le passage de vivant a mort ne se trompe pas.
    if (!fxReveil) {
      fxReveil = true;
      fx.startOfTimeLoop(now);
    }
    if (death.dead && !fxMort) {
      fxMort = true;
      fx.playerDeath(deathTypeOf(death.cause), now);
      // `PlayerState` ecoute `"PlayerDeath"` et pose `_isDead`. Le portage
      // tenait les trois autres etats — dans le vaisseau, a proximite, au poste
      // — et laissait celui-la a faux pour toujours. C'est le seul des quatre
      // qui ne se defait pas seul, et le seul que rien ne posait.
      etatJoueur.die();
      const sMort = sonsUI.death(death.cause);
      if (sMort) {
        audio.playOneShot(sMort.file, { volume: sMort.volume });
        mixer.mixDeath(sMort.fade);
        mixedDeath = true;
      }
    } else if (!death.dead && fxMort) {
      fxMort = false;
      // Le reveil : le glow blanc a 3 qui retombe au noir en trois secondes.
      fx.startOfTimeLoop(now);
      // `LaunchCodePromptController.Awake` : la scene est rechargee.
      inviteCodes.debutBoucle(loop.loopCount + 1, now);
      etatJoueur.dead = false;
    }
    // L'immersion : `OnEnterWaterZone` / `OnExitWaterZone`. Le portage sait
    // deja quand le joueur est dans un fluide ; il ne s'en servait pas pour
    // l'image. Seuls les liquides comptent — la densite d'un fluide d'AIR est
    // sous 5, comme pour le vent de course (docs/46, lot 5).
    const sousLEau = !!(player.fluid && (player.fluid.density ?? 0) >= 5);
    if (sousLEau !== fxEau) {
      fxEau = sousLEau;
      if (sousLEau) {
        fx.enterWater();
        const s = sonsUI.enterWater();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
      } else {
        fx.exitWater();
        const s = sonsUI.exitWater();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
      }
    }
    fx.update(now);
    postfx.appliquer(fx);
    if (fadeOverlay) fadeOverlay.style.opacity = String(fx.fadeFraction);

    // --- boucle temporelle ---
    const starBody = bodies.find((b) => (b.gravity.surfaceAcceleration || 0) >= 50);
    const sunDist = starBody
      ? Math.hypot(player.pos.x - starBody.position[0],
                   player.pos.y - starBody.position[1],
                   player.pos.z - starBody.position[2])
      : null;
    loop.update(dt, sunDist);
    // La musique de fin est une piste declenchee : elle ne se telecharge qu'au
    // moment ou la fin des temps la demande, pas au demarrage. Le moment est
    // celui du controleur — quatre-vingt-dix secondes restantes, et pas dans
    // une boucle protegee —, ce qui laisse une minute et demie pour la charger
    // avant qu'on l'entende.
    if (loop.endMusic && !endTimesCued) {
      endTimesCued = audio.cue("EndTimes") > 0;
    }
    // --- les causes de mort ---
    //
    // Elles passent toutes par le meme handler, qui ne retient que la
    // premiere : mourir asphyxie pendant que l'onde de choc arrive reste une
    // seule mort, avec une seule cause affichee.
    // `PlayerCompressionSensor` : coince contre une surface qui ecrase pendant
    // cinq pas de physique — un dixieme de seconde —, on meurt broye. Le
    // portage n'avait pas cette mort ; la surface qui ecrase est ici celle d'un
    // volume de destruction que l'on touche sans pouvoir en sortir.
    // Etre SOUS la surface du sable montant, c'est y avoir ete pousse : hors
    // d'un coincement, sa montee vous repousse. C'est exactement la situation
    // que `PlayerCompressionSensor` guette.
    const avale = sand.count
      ? sand.swallows([player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                       player.pos.z + anchorPos[2]])
      : null;
    if (compression.update(dt, !!avale, !!player.attached)) {
      death.kill("ecrasement");
    }
    if (resources.dead) death.kill("asphyxie");
    if (loop.dead) death.kill(loop.deathCause || "supernova");
    // Devore : un predateur de Dark Bramble qui atteint sa proie.
    if (fish.some((f) => f.caught)) death.kill("digestion");
    // Les volumes de destruction du build, d'abord : la cause de mort est un
    // champ du volume (`_deathType`), et les quatre machoires ne mordent que le
    // joueur et le vaisseau. Le seuil analytique ci-dessous reste le filet.
    if (destructions.length) {
      // Un point MONDE, et chaque volume ramene au mouvement de son corps :
      // la position dans le repere ancre tombait dans la sphere de 2 000
      // unites du soleil des la premiere image (docs/46).
      const mortel = destroyedBy(destructions, playerW,
                                 ship && ship.boarded ? "ship" : "player",
                                 (v) => decalageDuCorps(v.body, anchorPos));
      if (mortel) death.kill(deathCause(mortel.deathType));
    }
    // Incineration : entrer dans l'etoile. Le corps est la, son rayon aussi ;
    // rien n'empechait d'y voler jusqu'ici.
    if (starBody && sunDist != null &&
        sunDist < (starBody.gravity.upperSurfaceRadius || 0)) {
      death.kill("incineration");
    }
    // Le vaisseau detruit tue son pilote. Hors du vaisseau, il tombe.
    if (ship && ship.destroyed && ship.boarded) death.kill("impact");
    // `ShipDamageController.ExplodeShip` joue l'explosion — un systeme en
    // boucle, qui brule tant que la coque est detruite.
    if (ship && !!ship.destroyed !== navireExplose) {
      navireExplose = !!ship.destroyed;
      if (navireExplose) particles.pulse(new Set(["Explosion_Fiery_Med"]));
      else particles.arreter(new Set(["Explosion_Fiery_Med"]));
    }
    // Impact : PlayerImpactAudio (au-dela de 3 u/s) et Resources.applyImpact (au-dela de 20 u/s)
    if (player.grounded && !wasGrounded && fallSpeed > 3) {
      const sonImp = sonsUI.playerImpact(fallSpeed, true);
      if (sonImp) audio.playOneShot(sonImp.file, { volume: sonImp.volume });
      if (fallSpeed > resources.minImpact) {
        const lost = resources.applyImpact(fallSpeed);
        if (lost > 0 && resHUD) resHUD.damage(now);
        if (resources.dead) death.kill("impact");
      }
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
      // `TriggerFlashback` : la fin de l'effet de mort, pas la mort.
      if (fx.flashbackDemande) {
        fx.flashbackDemande = false;
        death.declencherFlashback();
      }
      const phaseAvant = death.state.phase;
      if (death.update(dt)) respawn();
      if (phaseAvant === "attente" && death.state.phase !== "attente") {
        const s = sonsUI.flashback();
        if (s) audio.playOneShot(s.file, { volume: s.volume });
      }
    } else if (deathCued) {
      deathCued = null;
    }
    // §R LA PHOTO DES CINQ SECONDES. `Flashback.Update` la prend tant qu'on
    // n'est pas mort et que la partie a plus de trois secondes ; c'est
    // `PlayerState.IsDead()` qui l'arrete, l'etat qu'on vient de brancher.
    // Elle est prise APRES le rendu de l'image, pour photographier ce que le
    // joueur vient de voir et non l'image d'avant.
    if (pellicule.timer.due(performance.now() / 1000 - pellicule.t0,
                            etatJoueur.dead)) {
      photographier();
    }
    if (flashOverlay) flashOverlay.update(death.state, pellicule.photos);
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
    if (!supernovaCollapsePlayed && sunState.phase === "contraction") {
      supernovaCollapsePlayed = true;
      const s = sonsUI.supernovaCollapse();
      if (s) audio.playOneShot(s.file, { volume: s.volume });
    }
    if (!supernovaExplosionPlayed && loop.supernova) {
      supernovaExplosionPlayed = true;
      // `DissipatingParticlesBehavior.OnSunExploded` : les etoiles et la
      // poussiere de l'etoile se dispersent.
      particles.pulse(new Set(["DissapatingStars", "DissapatingParticles"]));
      const se = sonsUI.supernovaExplosion();
      if (se) audio.playOneShot(se.file, { volume: se.volume });
      const sw = sonsUI.supernovaWave();
      if (sw) audio.loopAt(sw.file, sw.volume);
    }
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
    updateMaterials(BABYLON, mats, camera.position, sunDir,
                    performance.now() / 1000, loop.fraction);
    {
      const k = sun.intensity, a = ambient.intensity;
      updateGameShaders(BABYLON, scene, camera.position, performance.now() / 1000, {
        position: sun.position,
        couleur: new BABYLON.Vector3(sun.diffuse.r * k, sun.diffuse.g * k, sun.diffuse.b * k),
        portee: sun.range,
        ambiante: new BABYLON.Vector3(ambient.diffuse.r * a, ambient.diffuse.g * a,
                                      ambient.diffuse.b * a),
      });
    }
    // Le ciel du build : ce qu'il calcule, on le calcule. Ce qu'il n'applique
    // pas, on ne l'applique pas non plus (docs/41-ciel.md).
    //
    // `SkyBehavior.Update` fait tourner la voute vers le soleil a chaque image,
    // et c'est de la que vient le jour et la nuit : la texture est un disque
    // bleu centre sur l'axe que le `LookAt` amene sur l'etoile. Face au soleil
    // on voit le disque, dos a lui son bord transparent.
    // Le champ d'etoiles : colle sur la camera, et qui se vide.
    if (starPCS) {
      const m = starPCS.mesh;
      m.position.copyFrom(camera.position);
      // `Update` n'eteint rien tant que la supernova est suspendue.
      const neufs = starField.update(loop.fraction, loop.preventSupernova);
      for (const i of neufs) starFlash.push({ i, t: now });
      if (neufs.length || starFlash.length) {
        // Le build pose une `DistantSupernova` a la place de chaque etoile
        // franchie. Mille prefabs de particules seraient hors de portee ici :
        // on garde le GESTE — l'etoile brille puis s'eteint — sur une seconde,
        // et on le dit plutot que de le laisser croire porte.
        const [cr, cg, cb] = starField.color;
        starFlash = starFlash.filter(({ i, t }) => {
          const depuis = now - t;
          const p = starPCS.particles[i];
          if (!p) return false;
          // §P LA DUREE EST CELLE DU BUILD. `SelfDestruct` la porte sur le
          // prefabrique : `DistantSupernova` vit CINQ secondes, pas une. Le
          // portage avait choisi une seconde faute de l'avoir sous la main —
          // et elle etait dans `data/prefabs.json` depuis docs/60.
          if (selfDestructed(depuis, dureeSupernova)) {
            p.color.set(0, 0, 0, 0);
            return false;
          }
          const u = depuis / dureeSupernova;
          const k = u < 0.15 ? 1 + u * 20 : (1 - (u - 0.15) / 0.85) * 4;
          p.color.set(cr * k, cg * k, cb * k, 1);
          return true;
        });
        starPCS.setParticles();
      }
    }

    if (sky.ready) {
      sky.update(player.pos);
      const star = entries.find((e) => e.isStar);
      if (star && sky.shell) {
        const c = sky.shell.getAbsolutePosition();
        const p = star.data.position;
        const v = [p[0] - c.x, p[1] - c.y, p[2] - c.z];
        const n = Math.hypot(v[0], v[1], v[2]);
        if (n > 0) {
          sky.readBasis(sky.shell, BABYLON);
          const q = sky.lookAtSun([v[0] / n, v[1] / n, v[2] / n]);
          if (!sky.shell.rotationQuaternion) {
            sky.shell.rotationQuaternion = new BABYLON.Quaternion(q[0], q[1], q[2], q[3]);
          } else sky.shell.rotationQuaternion.set(q[0], q[1], q[2], q[3]);
        }
      }
    }
    if (scrollers.count) scrollers.update(dt);
    // Le sable suit la boucle et rien d'autre : il repart de son niveau initial
    // a chaque redemarrage, comme dans le jeu.
    if (sand.count) sand.update(loop.elapsed);

    // Les impostures : un rendu par seconde, et le plan s'efface des que la
    // vraie geometrie du corps est chargee — le build n'a pas ce test parce
    // qu'il n'a jamais les deux, ce portage peut les avoir.
    for (const v of impostersVifs) {
      const reel = !!entryForBody(geo, v.imposture.data.planet);
      v.plan.setEnabled(v.imposture.visible(reel));
      if (reel || !v.imposture.due(now)) continue;
      // `TakeSnapshot` : derriere le plan, a la distance de la planete, et on
      // regarde le plan. La distance se mesure une fois, comme dans `Start`.
      const p = v.plan.getAbsolutePosition();
      const avant = v.plan.getDirection(new BABYLON.Vector3(0, 0, 1));
      if (v.distance == null) {
        const e = entryForBody(geo, v.imposture.data.planet);
        const c = e ? e.data.position : null;
        v.distance = c ? Math.hypot(p.x - c[0], p.y - c[1], p.z - c[2]) : 1000;
      }
      const q = v.imposture.cameraPosition([p.x, p.y, p.z],
                                           [avant.x, avant.y, avant.z], v.distance);
      v.cam.position.set(q[0], q[1], q[2]);
      v.cam.setTarget(p);
      v.texture.refreshRate = 1;   // un rendu, puis Babylon repasse a zero
      v.texture.resetRefreshCounter();
      v.texture.refreshRate = 0;
    }

    // L'interrupteur du regard. La position de l'interrupteur BOUGE — il est
    // pose sur une jumelle, qui orbite — donc on la ramene au repere courant a
    // chaque image plutot que de la lire une fois.
    if (regards.length) {
      const oeil = [camera.position.x, camera.position.y, camera.position.z];
      const vue = camera.getDirection
        ? camera.getDirection(new BABYLON.Vector3(0, 0, 1)) : null;
      if (vue) {
        for (const g of regards) {
          const dec = decalageDuCorps(g.data.body, anchorPos);
          g.update(dt, oeil, [vue.x, vue.y, vue.z],
                   [g.data.position[0] - dec[0], g.data.position[1] - dec[1],
                    g.data.position[2] - dec[2]]);
          if (g.switched) {
            console.log(`regard : ${g.data.name} allume ${g.data.device}`);
            for (const p of portes) p.switchOn(now);
          }
        }
      }
    }
    // §M LA TOILE QUI TOURNE. Deux anneaux en sens inverse, au CUBE des
    // fractions — donc presque immobiles au debut du regard, et emportes a la
    // fin. C'est cette acceleration qui fait qu'on sent la charge monter.
    for (const t of toiles) {
      if (t.noeuds === undefined) {
        t.noeuds = { inner: null, outer: null };
        for (const e of geo) {
          if (!t.noeuds.inner && t.inner) t.noeuds.inner = e.nodes.get(t.inner) || null;
          if (!t.noeuds.outer && t.outer) t.noeuds.outer = e.nodes.get(t.outer) || null;
        }
        t.pleinDepuis = null;
      }
      const g = regards.find((r) => r.data.name === t.gazeSwitch) || regards[0];
      if (!g || (!t.noeuds.inner && !t.noeuds.outer)) continue;
      // `GazeWebAnimator.Update` appelle `GetChargeFraction()`, qui vaut
      // `_charge / _secondsToCharge`. Le portage lui passait `charge` — des
      // SECONDES, de zero a trois. Au cube, la toile tournait donc jusqu'a
      // vingt-sept fois trop vite : seize mille degres par seconde sur l'anneau
      // interieur, la ou le build en veut six cents.
      const v = webSpeeds(g.gazeFraction || 0, g.chargeFraction || 0);
      // Les vitesses sont en degres par seconde, et l'axe est celui de la
      // toile : son avant local, donc l'axe Z du noeud.
      for (const [k, n] of [["inner", t.noeuds.inner], ["outer", t.noeuds.outer]]) {
        if (!n) continue;
        n.rotate(BABYLON.Axis.Z, v[k] * dt * Math.PI / 180, BABYLON.Space.LOCAL);
      }
      // `webAlpha` : une fois la charge pleine, la toile s'efface en deux
      // secondes et le composant s'eteint. Le build ne la remontre jamais.
      // La meme erreur d'unite decidait du fondu : `_isFading` se pose quand
      // `GetChargeFraction() >= 1`, donc au bout des trois secondes, et le
      // portage l'y mettait des la premiere — la toile s'effacait au tiers du
      // regard, bien avant que la porte ne s'ouvre.
      if ((g.chargeFraction || 0) >= 1 && t.pleinDepuis === null) t.pleinDepuis = now;
      if (t.pleinDepuis !== null) {
        const a = webAlpha(now - t.pleinDepuis);
        for (const n of [t.noeuds.inner, t.noeuds.outer]) {
          if (!n) continue;
          for (const m of (n.getChildMeshes ? n.getChildMeshes() : [])) {
            if (m.material) { m.material.alpha = a; m.visibility = a; }
          }
          if (a <= 0) n.setEnabled(false);
        }
      }
    }
    // §M LE RENDU DE LA POUSSIERE. La loi a decide au bloc du suivi ; ici on ne
    // fait que la poser sur le systeme.
    {
      const ps = systemePoussiere();
      if (ps) {
        const d = poussiere;
        if (!d.emitting || d.alpha <= 0) ps.emitRate = 0;
        else {
          ps.emitRate = d.rate;
          ps.minLifeTime = ps.maxLifeTime = d.lifetime;
          ps.minSize = ps.maxSize = Math.max(0.05, d.size * 0.02);
          ps.minEmitPower = ps.maxEmitPower = d.startSpeed;
          const a = d.alpha;
          ps.color1 = new BABYLON.Color4(0.8, 0.9, 1, a);
          ps.color2 = new BABYLON.Color4(0.8, 0.9, 1, a * 0.6);
          ps.colorDead = new BABYLON.Color4(0.8, 0.9, 1, 0);
          // Les traits regardent le deplacement : la direction d'emission est
          // l'oppose de la vitesse, vue depuis la camera qui avance.
          const v = [player.vel.x, player.vel.y, player.vel.z];
          const l = Math.hypot(v[0], v[1], v[2]) || 1;
          ps.direction1 = new BABYLON.Vector3(-v[0] / l, -v[1] / l, -v[2] / l);
          ps.direction2 = ps.direction1;
        }
      }
    }
    // §M LA TEMPETE. Une entree, une sortie, quel que soit le nombre de
    // cylindres traverses — c'est tout l'interet du volume compose : sans le
    // compte, passer d'un cylindre au suivant emettrait une sortie puis une
    // entree, et l'ecran clignoterait.
    {
      // L'entonnoir pousse et se retire au fil de la boucle : la tempete
      // n'existe qu'entre les deux, et son volume, lui, ne bouge pas.
      const vivant = sand.funnels.length
        ? sand.funnels.some((f) => funnelActive(loop.elapsed, f)) : true;
      const ev = tempete.update([playerWorld.x, playerWorld.y, playerWorld.z],
                                (c) => decalageDuCorps(c.body, anchorPos), vivant);
      if (ev === "enter") console.log("annonce : EnterSandstorm");
      if (ev === "exit") console.log("annonce : ExitSandstorm");
      const ps = systemeSable();
      if (ps) ps.emitRate = tempete.active ? 400 : 0;
    }
    // §P La sonde ancienne avance, et rien ne l'arrete. L'acceleration est
    // LOCALE — l'avant de la sonde — et le champ dominant s'y ajoute comme
    // pour tout le reste : elle tombe aussi.
    if (sondeAncienne) {
      const av = qrotDecor(sondeAncienne.rotation, [0, 0, 1]);
      const a = ancientProbeAcceleration(av);
      const g = dominantField(bodies, {
        x: sondeAncienne.pos[0] - anchorPos[0],
        y: sondeAncienne.pos[1] - anchorPos[1],
        z: sondeAncienne.pos[2] - anchorPos[2] });
      for (let i = 0; i < 3; i++) {
        const gi = g ? [g.dir.x, g.dir.y, g.dir.z][i] * g.magnitude : 0;
        sondeAncienne.vel[i] += (a[i] + gi) * dt;
        sondeAncienne.pos[i] += sondeAncienne.vel[i] * dt;
      }
      if (sondeAncienne.node === undefined) {
        sondeAncienne.node = null;
        for (const e of geo) {
          const n = e.nodes.get(sondeAncienne.name);
          if (n) { sondeAncienne.node = n; break; }
        }
      }
      if (sondeAncienne.node) {
        sondeAncienne.node.setAbsolutePosition(new BABYLON.Vector3(
          sondeAncienne.pos[0] - anchorPos[0], sondeAncienne.pos[1] - anchorPos[1],
          sondeAncienne.pos[2] - anchorPos[2]));
      }
    }
    for (const p of portes) {
      p.update(now);
      if (p.noeud === undefined) {
        p.noeud = null;
        for (const e of geo) {
          const n = e.nodes.get(p.data.name);
          if (n) { p.noeud = n; break; }
        }
      }
      if (p.noeud) {
        for (const m of (p.noeud.getChildMeshes ? p.noeud.getChildMeshes() : [])) {
          // L'alpha de la porte s'effondre en une seconde et on l'applique aux materiaux
          if (m.material) {
            m.material.alpha = p.alpha;
            m.visibility = p.alpha;
          }
          // La solidite se coupe instantanement. Si c'est un collider cache, on le coupe.
          // Si la physique est sur un maillage visuel, on filtre la collision pour ne pas le cacher avant la fin du fondu.
          if (m.name.toLowerCase().includes("collider")) {
            m.setEnabled(p.solid);
          } else if (!p.solid && m.physicsBody) {
            m.physicsBody.shape.filterMembershipMask = 0;
          }
        }
        // Une fois completement invisible, on peut couper tout le noeud (comme pour la toile).
        if (p.alpha <= 0) p.noeud.setEnabled(false);
      }
    }
    // Le casque suit le regard avec un vingtieme de retard, et seulement quand
    // on le porte. `pitch` est le tangage en angles d'Euler d'Unity : la bande
    // [70, 280] est celle qu'on ne peut pas atteindre, et le suivi vertical y
    // est bride.
    player.setSuit(equipment.suit);
    accesCarte.porte(!!equipment.suit);
    if (equipment.suit && !casque.worn && casque.state !== 0) casque.suitUp();
    if (!equipment.suit && casque.worn) casque.removeSuit();
    // §U LES JAUGES SONT SUR LA VISIERE. `HUDCameraScript` les eteint a
    // `RemoveSuit` et les rallume a `HelmetHUDActivated` — l'annonce que
    // `HUDHelmet.Update` fait partir quand le casque a fini de se poser. Le
    // portage affichait l'oxygene et le carburant en permanence, casque ote,
    // au village, ou il n'y a rien a afficher. Et le mode d'affichage les
    // efface sans effacer l'etat : en sortir les rend a ce qu'elles etaient.
    // `HUDCameraScript.OnSwitchActiveCamera` : si la camera active n'est pas
    // `MainCamera` — la carte —, la camera du casque s'eteint, et avec elle
    // jauges, silhouette de la combinaison et minicarte.
    if (resHUD) resHUD.setHelmetOn(casque.worn && !guiMode.hidden && !vueCarte.open);
    {
      const euler = ((-pitch * 180 / Math.PI) % 360 + 360) % 360;
      casque.update(dt, input.right || 0, 0, euler);
    }
    // L'alarme generale : sous trente pour cent de coque, et pas avant.
    if (ship) {
      const frac = ship.damage.shipTotalHealth > 0
        ? ship.damage.integrity / ship.damage.shipTotalHealth : 1;
      const crie = alarme.update(frac);
      if (resHUD) resHUD.setAlarm(crie);
      // `TurnOnAlarm` appelle `PulsingLight.Enable` sur son propre objet : la
      // cabine BAT au rouge, a huit — le `_pulseRate` le plus rapide du build.
      // Et `TurnOffAlarm` l'eteint : le portage la faisait battre en
      // permanence, faute de savoir qu'une lumiere pulsante peut etre coupee.
      if (alarme.turnedOn || alarme.turnedOff) {
        placedLights.allume("MasterAlarm", alarme.on);
      }
      // `PlaySuitWarningSound` vient de `PlayerResourceGUI.Update` : c'est
      // l'avertissement du SAC DORSAL, pas celui de la coque. Il ne se joue
      // qu'au passage sous le seuil.
      const sec = resources.fuel <= 0;
      if (sec && !sacASec) bipUI("PlaySuitWarningSound");
      sacASec = sec;
      // §W LA PANNE SECHE A UNE HYSTERESIS. `PlayerJetpackController.Update`
      // pose `_isFuelDepleted` des que la fraction touche zero, et ne le
      // retire qu'au-DESSUS de cinq pour cent : une goutte ne suffit pas a
      // repartir. Il abandonne aussi le pilote automatique a cet instant, ce
      // que le portage ne faisait pas — on se laissait guider vers une cible
      // sans avoir de quoi freiner.
      if (player.gate.fuel(resources.fuel / resources.maxFuel)) {
        if (autopilot && autopilot.engaged) autopilot.abort();
        console.log("panne seche : le sac dorsal se coupe");
      }
      // La zone suit le vaisseau : elle est posee SUR lui, et il vole.
      presDuVaisseau = zonesVaisseau.length === 0 || !!ship.boarded
        || zonesVaisseau.some((z) => z.volume && Math.hypot(
             playerWorld.x - ship.pos.x - anchorPos[0],
             playerWorld.y - ship.pos.y - anchorPos[1],
             playerWorld.z - ship.pos.z - anchorPos[2]) <= z.volume.radius);
      // `HatchController.OnEntry` / `OnExit` : le declencheur de la trappe est
      // BIEN PLUS PETIT que la zone de proximite — c'est l'interieur du
      // vaisseau, pas ses treize unites alentour. Entrer referme la trappe et
      // annonce `EnterShip` ; sortir n'annonce que `ExitShip`, et la laisse
      // ouverte (docs/116-trappe.md).
      if (trappe.data.volume) {
        const dec = decalageDuCorps(trappe.data.body, anchorPos) || [0, 0, 0];
        const d = Math.hypot(
          playerWorld.x - trappe.data.position[0] - dec[0],
          playerWorld.y - trappe.data.position[1] - dec[1],
          playerWorld.z - trappe.data.position[2] - dec[2]);
        const franchi = trappe.setInside(d <= trappe.data.volume.radius);
        // `_hatchObject.SetActive` : ouvrir RETIRE le collider, il n'y a pas
        // d'animation. On le cherche dans le modele du vaisseau sous le nom
        // que la scene donne (`Hatch_Collider`) ; s'il n'y est pas, la trappe
        // reste sonore et le dire ici vaut mieux que de faire semblant.
        if (trappe.data.hatchObject && ship.node && trappe.collider !== noeudTrappeOn) {
          const n = ship.node.getChildren
            ? ship.node.getChildren((m) => m.name === trappe.data.hatchObject, false)[0]
            : null;
          if (n && n.setEnabled) n.setEnabled(trappe.collider);
          noeudTrappeOn = trappe.collider;
          if (!n && !trappeSansNoeud) {
            trappeSansNoeud = true;
            console.log(`trappe : aucun noeud « ${trappe.data.hatchObject} »`
              + " dans le modele — l'ouverture ne retire aucun collider");
          }
        }
        if (franchi) {
          const clip = (events.of("HatchController") || { clips: {} })
            .clips._closeHatchClip;
          if (franchi === "entre" && clip) audio.playOneShot(clip);
          trappe.drain();
          for (const e of trappe.events.splice(0)) {
            console.log(`annonce : ${e}`);
          }
        }
      }
      // Les voyants suivent le MASQUE, pas les pieces mortes. `OnDamageShip`
      // reçoit `_damageLocationMask` — la sortie qui s'accumule (docs/49) — et
      // allume un voyant par position TOUCHEE. Le portage n'allumait rien tant
      // qu'une piece n'etait pas detruite, c'est-a-dire presque jamais : un
      // voyant d'avarie sert justement a prevenir AVANT.
      //
      // `ShipDamage.alerted` disait cette liste depuis le lot de docs/49, et
      // personne ne la lui demandait.
      const touchees = ship.damage.alerted;
      voyants.update(now, ship.damage.damaged,
                     ALERT_ORDER.map((k) => touchees.includes(k)),
                     presDuVaisseau);
    }
    const avis = notifications.update(now);
    if (resHUD) resHUD.setNotice(avis);
    // `ReferenceFrameTracker` : quand une cible est visee sur la carte, on lit
    // sa distance et sa vitesse d'approche. Le portage selectionnait une cible
    // et n'en disait rien (docs/58-suivi.md).
    if (resHUD) {
      const cible = solarMap.selected;
      if (cible && !solarMap.open) {
        const moi = [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                     player.pos.z + anchorPos[2]];
        const vRel = [player.vel.x, player.vel.y, player.vel.z];
        const m = relativeMotion(vRel, moi, cible.position);
        resHUD.setTracker(trackerReadout(m.distance, m.zSpeed));
        // §M LA POUSSIERE DE VITESSE. `MotionDust` ne seme RIEN sous trente
        // unites par seconde : en dessous, l'espace reste vide, et c'est ce qui
        // donne son prix a la vitesse. Au-dessus, le debit monte pendant que la
        // duree de vie DIMINUE — plus on va vite, plus il y a de traits, et
        // plus ils sont courts (docs/58).
        //
        // La loi etait ecrite, eprouvee, et seulement IMPORTEE (docs/71).
        poussiere = motionDust(Math.hypot(vRel[0], vRel[1], vRel[2]),
                               { targeting: true, mapView: solarMap.open });
        window.__suivi = m;
      } else { resHUD.setTracker(null); poussiere = motionDust(0, { targeting: false }); }
    }

    // --- viser un referentiel, et s'y accorder (docs/62-visee.md) ---
    //
    // `ReferenceFrameTracker` : la cible se REGARDE. Le portage ne la
    // choisissait que dans la carte, et les trois canaux de vol du build ne
    // pilotaient rien une fois lus.
    {
      const moi = [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                   player.pos.z + anchorPos[2]];
      // Les positions se rafraichissent EN PLACE, dans une liste construite une
      // fois. Les recreer a chaque image donnait des objets tout neufs, et
      // `LockOn` compare par identite — comme le build compare deux
      // `ReferenceFrame` : re-viser la meme cible ne la relachait donc jamais,
      // parce que ce n'etait jamais « la meme ».
      //
      // Et ce sont les positions COURANTES : `position0` est celle de l'instant
      // zero, et la visee comparait le regard a des planetes restees ou elles
      // etaient au reveil. La regle du « mieux centre du ciel entier » le
      // cachait ; celle du build, qui exige de traverser la sphere de visee,
      // l'a montre (docs/132).
      for (const v of visables) {
        v.position[0] = v.body.position[0] + anchorPos[0];
        v.position[1] = v.body.position[1] + anchorPos[1];
        v.position[2] = v.body.position[2] + anchorPos[2];
      }
      const vise = solarMap.open ? null : aimedFrame(visables, moi, [fwd.x, fwd.y, fwd.z]);
      const avant = lockOn.current;
      lockOn.update(dt, lockPressed, vise);
      lockPressed = false;
      if (lockOn.current !== avant) {
        // La carte et la visee tiennent la MEME cible : viser du regard et
        // choisir sur la carte sont deux gestes pour une seule chose.
        solarMap.selected = lockOn.current ? lockOn.current.body : null;
        // `_targetReferenceFrame` et `_untargetReferenceFrame` sont DEUX clips :
        // verrouiller et lacher ne s'entendent pas pareil.
        bipUI(lockOn.current ? "TargetReferenceFrame" : "UntargetReferenceFrame");
        console.log(lockOn.current
          ? `referentiel vise : ${lockOn.current.name}`
          : "referentiel abandonne");
      }
      // `PlayerJetpackController.Update` : accorder sa vitesse demande une
      // cible, du carburant, et le canal `Match Velocity` — l'espace, celui du
      // saut. Au sol on saute ; en vol, on s'accorde.
      // `canThrust` : du carburant ET vivant. Le portage ne testait que le
      // carburant, et un mort accordait encore sa vitesse.
      if (matchPressed && lockOn.current && !player.grounded
          && resources.canThrust) {
        const t = lockOn.current.body;
        const v = frameVelocity(orbits, t);
        if (v) {
          // `Autopilot.InitMatchVelocity`, par la POUSSEE : le meme
          // asservissement que le vaisseau, avec la poussee du sac dorsal. Le
          // portage posait la vitesse, ce qui escamotait la seconde ou l'on
          // sent le sac travailler (docs/107-pilote.md).
          egalisationJoueur = t;
          console.log(`vitesse accordee a ${t.name}`);
        }
      }
      matchPressed = false;
      // L'ASSERVISSEMENT DU SAC DORSAL, image par image. Il s'arrete tout seul
      // quand il reste moins d'un centieme d'unite par seconde, et le premier
      // geste qui reprend la main l'annule — comme le build coupe
      // `_isMatchingVelocity` des qu'on pousse.
      if (egalisationJoueur) {
        const v = frameVelocity(orbits, egalisationJoueur);
        const stop = !v || player.grounded || !resources.canThrust
          || player.jetpack || lockOn.current === null;
        if (stop) { egalisationJoueur = null; }
        else {
          const rel = relativeDelta(v, [player.vel.x, player.vel.y, player.vel.z]);
          const poussee = PLAYER_FALLBACK.maxTranslationalThrust;
          const pas = matchVelocityStep(rel, poussee, dt);
          const k = poussee * dt;
          player.vel.x += pas.input[0] * k;
          player.vel.y += pas.input[1] * k;
          player.vel.z += pas.input[2] * k;
          if (pas.done) {
            egalisationJoueur = null;
            console.log("vitesse accordee");
          }
        }
      }
      // `Autopilot.InitFlyToDestination` REFUSE si l'on est deja arrive : le
      // portage engageait toujours, et le pilote partait pour zero unite.
      if (autoPressed && autopilot && lockOn.current) {
        const t = lockOn.current.body;
        const d = Math.hypot(t.position[0] - player.pos.x,
                             t.position[1] - player.pos.y,
                             t.position[2] - player.pos.z);
        const { arrival } = autopilotDistances(
          declared.frames, t.name, (t.gravity && t.gravity.upperSurfaceRadius) || 0);
        // Le refus est maintenant celui d'`InitFlyToDestination` lui-meme : il
        // pose « too close to target », que rien n'affichait jusqu'ici.
        if (canFlyTo(d, arrival)) {
          autopilot.engage(t, [player.pos.x, player.pos.y, player.pos.z]);
        } else {
          autopilot.fin = "tropPres";
          console.log(`pilote auto : deja arrive (${Math.round(d)} u)`);
        }
      }
      autoPressed = false;
      window.__visee = lockOn;
    }

    // --- LA TOUR DE LANCEMENT, de bout en bout (docs/92-tour.md) ---
    //
    // Mise a jour dynamique de l'invite de la borne et du verrou de combinaison
    if (terminalItem) {
      if (terminal.used) {
        terminalItem.disabled = true;
      } else if (pdata.knows("knowsLaunchCodes")) {
        terminalItem.prompt = " Enter Launch Codes";
        terminalItem.disabled = false;
      } else {
        terminalItem.prompt = null;
        terminalItem.disabled = false;
      }
    }
    if (zoneGearUp) {
      zoneGearUp.disabled = equipment.suit;
    }

    // `LaunchTerminal.OnPressInteract` : avec les codes, un son affirmatif et
    // `ActivateLaunchTower` ; sans, un son negatif et la borne se remet a
    // disposition. Elle ne sert qu'UNE fois — le build desactive son volume
    // d'interaction.
    if (interactPressed && !dialogue.active && !(ship && ship.boarded)) {
      for (const b of bornesTour) {
        const q = restingPoint(playerW, decalageDuCorps(b.body, anchorPos));
        const d = Math.hypot(q[0] - b.position[0], q[1] - b.position[1],
                             q[2] - b.position[2]);
        if (d > GEAR_REACH) continue;
        const r = terminal.pressInteract(pdata.knows("knowsLaunchCodes"));
        if (r === "activate") {
          // `LaunchElevatorController.OnActivateLaunchTower`.
          for (const a of ascenseurs) a.activateControls();
          bipUI("PlayAffirmativeUISound");
          console.log("tour de lancement actionnee");
          interactPressed = false;
        } else if (r === "refuse") {
          bipUI("PlayNegativeUISound");
          console.log("tour de lancement : codes inconnus");
          interactPressed = false;
        }
        break;
      }
    }
    // `LaunchElevatorController.OnTriggerEnter` : entrer dans la sphere de dix
    // unites alors que la cabine est en haut la renvoie en bas. Le seuil de 0,9
    // est ce qui empeche qu'elle reparte des qu'on approche du pied de la tour.
    for (const dcl of declencheursTour) {
      if (!dcl.volume) continue;
      const dec = decalageDuCorps(dcl.body, anchorPos);
      if (!insideVolume(dcl, restingPoint(playerW, dec))) continue;
      for (const a of ascenseurs) {
        if (a.fraction > RETURN_ABOVE && !a.moving) {
          a.returnToStart(now);
          if (a.data.startClip) audio.playOneShot(a.data.startClip);
        }
      }
    }
    // L'ascenseur de la tour : il ne s'ouvre qu'une fois la tour actionnee.
    for (const a of ascenseurs) {
      if (a.node === undefined) {
        a.node = null;
        for (const e of geo) {
          const n = e.nodes.get("Elevator");
          if (n) { a.node = n; break; }
        }
      }
      a.update(now);
      if (a.node) {
        a.node.position.y = a.height;
      }
      if (zoneAscenseur) {
        zoneAscenseur.disabled = !a.unlocked;
        zoneAscenseur.world[0] = zoneAscRestPos[0];
        zoneAscenseur.world[1] = zoneAscRestPos[1];
        zoneAscenseur.world[2] = zoneAscRestPos[2] - a.height;
      }
      if (elAttach) {
        const decTH = decalageDuCorps(a.data.body, anchorPos) || [0, 0, 0];
        elAttach.follow({
          position: [elAttachRestPos[0] + decTH[0], elAttachRestPos[1] + decTH[1], elAttachRestPos[2] - a.height + decTH[2]],
          rotation: elAttach.rotation,
        });
      }
      if (a.arrived) {
        if (pointsAttache.current === elAttach) {
          pointsAttache.detach([0, 0, 0]);
        }
        if (a.data.stopClip) audio.playOneShot(a.data.stopClip);
      }
    }

    // §S LE VAISSEAU MINIATURE VOLE.
    //
    // Il se pilote depuis la console deportee de l'observatoire, avec les huit
    // canaux que `_modelShipInputs` autorise (docs/70) : les deux axes de
    // poussee, la montee, la descente, le tangage, le lacet — et rien d'autre,
    // ni sonde ni carte.
    //
    // La poussee est celle du VRAI vaisseau, faute d'un modele a lui : le
    // build n'en pose aucun sur `ModelShip_Body`, et c'est dit ici plutot que
    // presente comme mesure.
    let pousseeModele = [0, 0, 0];
    if (modele) {
      const auxCommandes = !!(consoles.active && consoles.active.flight);
      // `ModelShipController` : translation (Move X, Move Up - Move Down,
      // Move Z) et rotation (-Pitch, 0, -Yaw) — la souris, a la sensibilite
      // 0,1 de l'`InputManager` : un axe de souris est un DEPLACEMENT par
      // image, pas une position.
      let entree = { translation: [0, 0, 0], rotation: [0, 0, 0] };
      if (auxCommandes) {
        const mu = (cmds.held("Move Up", etatCmd) ? 1 : 0)
                 - (cmds.held("Move Down", etatCmd) ? 1 : 0);
        const sens = 0.1;
        const tangage = -sourisModele.dy * sens, roulis = sourisModele.dx * sens;
        entree = {
          translation: [cmds.axis("Move X", etatCmd), mu, cmds.axis("Move Z", etatCmd)],
          rotation: [-tangage, 0, -roulis],
        };
      }
      sourisModele.dx = 0; sourisModele.dy = 0;
      pousseeModele = voleModele(modele, entree, dt, cfgModele);
      // SUR SON SUPPORT. Dans le build, le modele est un `Rigidbody` pose sur
      // son socle : il n'en bouge que pousse. Le portage le laissait tomber des
      // le chargement — le socle n'a pas de collider pour lui — et il filait a
      // travers le cratere avant qu'on ait touche a la console.
      const pousse = entree.translation.some((v) => v !== 0);
      if (modele.pose && !pousse) {
        modele.pos = reposModeleCadre(anchorPos);
        modele.vel = [0, 0, 0];
        modele.omega = [0, 0, 0];
        modele.quat = modele.reposQuat.slice();
      } else {
        modele.pose = false;
        // Ce que son `Detector` lui fait sentir : `CraterField`, a 0,8, et
        // rien d'autre. Sans detecteur extrait, le champ dominant comme avant.
        const champDet = detModele && detModele.champ
          ? dirFields.find((f) => f.name === detModele.champ) : null;
        const g = champDet ? null : dominantField(bodies, {
          x: modele.pos[0], y: modele.pos[1], z: modele.pos[2] },
          { directional: dirFields, polar: polFields, framePos: anchorPos,
            shiftOf: (v) => decalageDuCorps(v.body, anchorPos) });
        const grav = champDet ? graviteModele(champDet, detModele.facteur)
          : (g ? [g.dir.x * g.magnitude, g.dir.y * g.magnitude, g.dir.z * g.magnitude] : [0, 0, 0]);
        const avant = modele.vel.slice();
        const depart = modele.pos.slice();
        for (let i = 0; i < 3; i++) {
          modele.vel[i] += (pousseeModele[i] + grav[i]) * dt;
          modele.pos[i] += modele.vel[i] * dt;
        }
        // LE SOL. Le terrain de Havok d'abord : un rayon le long du trajet de
        // l'image, prolonge d'une demi-unite — la taille du modele. La sphere
        // de la surface haute reste le repli sans physique ; elle posait le
        // modele au-dessus du fond du cratere.
        let contact = null;
        const eng = scene.getPhysicsEngine && scene.getPhysicsEngine();
        const pas = [modele.pos[0] - depart[0], modele.pos[1] - depart[1], modele.pos[2] - depart[2]];
        const long = Math.hypot(pas[0], pas[1], pas[2]);
        if (eng && eng.raycast && long > 1e-6) {
          const u = pas.map((v) => v / long);
          const de = new BABYLON.Vector3(depart[0], depart[1], depart[2]);
          const a = de.add(new BABYLON.Vector3(u[0], u[1], u[2]).scale(long + 0.5));
          try {
            const hit = eng.raycast(de, a);
            const q = hit && hit.hasHit ? (hit.hitPointWorld || hit.hitPoint) : null;
            if (q) {
              contact = [q.x - u[0] * 0.5, q.y - u[1] * 0.5, q.z - u[2] * 0.5];
            }
          } catch (e) { contact = null; }
        }
        const gSol = g || (anchorBody && anchorBody.gravity ? { body: anchorBody } : null);
        if (!contact && gSol && gSol.body && gSol.body.gravity && !eng) {
          const r = (gSol.body.gravity.upperSurfaceRadius || 0) + 0.6;
          const d = [modele.pos[0] - gSol.body.position[0], modele.pos[1] - gSol.body.position[1],
                     modele.pos[2] - gSol.body.position[2]];
          const l = Math.hypot(d[0], d[1], d[2]) || 1;
          if (l < r) contact = d.map((v, i) => gSol.body.position[i] + v / l * r);
        }
        if (contact) {
          const impact = Math.hypot(avant[0], avant[1], avant[2]);
          modele.pos = contact;
          modele.vel = [0, 0, 0];
          // Le sol arrete aussi la rotation : le modele ne roule pas.
          modele.omega = [0, 0, 0];
          // `OnImpact` ne fait rien sous DIX : un contact doux n'est pas un
          // crash, et c'est ce qui rend l'atterrissage possible.
          if (crashes(impact)) {
            compteurEnfant.crashed();
            console.log(`annonce : CrashedModelShip (${impact.toFixed(1)} u/s)`);
            // `ModelShipCrashBehavior.OnImpact` : `_explosionParticles.Play()`.
            particles.pulse(new Set(["Explosion_Fiery_Small"]));
            const sc = sonsUI.modelShipCrash();
            if (sc) audio.playOneShot(sc.file, { volume: sc.volume });
            else if (modele.crashSound) audio.playOneShot(modele.crashSound);
            // Et il RESTE ou il est tombe : `OnImpact` ne le deplace pas. C'est
            // la console qui le remet en place, par « Reset » (`Cancel`). Le
            // portage le ramenait tout seul a son support.
          }
        }
      }
      // LES TROIS PISTES. Pose ne suffit pas : il faut etre IMMOBILE — 0,1 u/s
      // et 0,01 rad/s — pendant deux dixiemes de seconde.
      for (const p of pistesModele) {
        const dec = decalageDuCorps(p.data.body, anchorPos) || [0, 0, 0];
        const d = Math.hypot(modele.pos[0] + anchorPos[0] - p.data.position[0] - dec[0],
                             modele.pos[1] + anchorPos[1] - p.data.position[1] - dec[1],
                             modele.pos[2] + anchorPos[2] - p.data.position[2] - dec[2]);
        p.etat.setInside(d < 3);
        // La vitesse est relative a la PLANETE : sur un sol qui tourne, un
        // modele immobile dans le monde ne l'est pas pour la piste.
        if (p.etat.update(now, Math.hypot(...modele.vel), Math.hypot(...modele.omega))) {
          compteurEnfant.landed();
          console.log("annonce : LandedModelShip");
        }
      }
      if (modele.node === undefined) {
        modele.node = null;
        for (const e of geo) {
          const n = e.nodes.get(modele.name);
          if (n) { modele.node = n; break; }
        }
      }
      if (modele.node) {
        // La pose : celle de repos, tournee de ce que le modele a tourne depuis
        // (Delta = q . q_repos^-1), autour de son origine, puis portee a sa
        // position. On passe par les matrices — la racine du glTF est en
        // miroir, et une rotation de parent ne s'y inverse pas en quaternion.
        const n = modele.node;
        if (!modele.W0) modele.W0 = n.computeWorldMatrix(true).clone();
        const W0 = modele.W0, t0 = W0.getTranslation();
        const [qx, qy, qz, qw] = modele.reposQuat;
        const delta = qMul(modele.quat, [-qx, -qy, -qz, qw]);
        const R = new BABYLON.Matrix();
        BABYLON.Matrix.FromQuaternionToRef(new BABYLON.Quaternion(...delta), R);
        const W = W0.multiply(BABYLON.Matrix.Translation(-t0.x, -t0.y, -t0.z))
          .multiply(R)
          .multiply(BABYLON.Matrix.Translation(modele.pos[0], modele.pos[1], modele.pos[2]));
        const parent = n.parent;
        const local = parent
          ? W.multiply(parent.computeWorldMatrix(true).clone().invert()) : W;
        const sc = new BABYLON.Vector3(), rq = new BABYLON.Quaternion(), tr = new BABYLON.Vector3();
        local.decompose(sc, rq, tr);
        n.scaling.copyFrom(sc);
        n.rotationQuaternion = rq;
        n.position.copyFrom(tr);
      }
    }
    // Les six buses du vaisseau MINIATURE — celui de l'observatoire, pas celui
    // du joueur : le champ `body` dit `ModelShip_Body`. La buse allumee est
    // celle qui POUSSE, donc l'opposee au mouvement demande — et elle a enfin
    // une entree a lire.
    if (busesModele.length && particles.live && particles.live.size) {
      const etats = shipNozzles(pousseeModele);
      const parPosition = new Map();
      for (const b of busesModele) parPosition.set(b.position.join(","), etats[b.direction]);
      particles.gateAt(parPosition);
    }

    // Les pivots de tornade culbutent, lentement et chacun a son rythme.
    if (tornades.count) tornades.update(dt);

    // §3 LE DECOR VIVANT. Les panneaux se tournent vers la camera — autour de
    // leur mat quand ils en ont un — et les personnages se tournent vers le
    // joueur pendant qu'on leur parle, d'un dixieme d'angle par image.
    if (decor.count) {
      const cam = [camera.position.x, camera.position.y, camera.position.z];
      // A QUI l'on parle : le personnage est le parent de la zone de
      // conversation, et c'est lui qui porte le `FacePlayerWhenTalking`.
      decor.update(cam, cam, dialogue.active && dialogue.active.convo
        ? (dialogue.active.convo.speaker || null) : null);
    }
    // §3 LES PASSAGES ANCIENS. Ils partent tout seuls quand l'alignement et le
    // soleil le permettent, que quelqu'un soit dedans ou non — et emportent le
    // joueur s'il s'y trouve. Les positions sont celles du moment : c'est
    // l'orbite des jumelles qui ouvre puis ferme la fenetre.
    if (passages.count && starBody) {
      const sunW = [starBody.position[0] + anchorPos[0],
                    starBody.position[1] + anchorPos[1],
                    starBody.position[2] + anchorPos[2]];
      // Chaque bout suit SON corps : le passage est sur une jumelle, son
      // arrivee sur une autre planete, et c'est justement leur mouvement
      // relatif qui ouvre la fenetre d'alignement.
      const aujourdhui = (e) => {
        const d = decalageDuCorps(e.body, anchorPos);
        return d ? [e.position[0] + d[0], e.position[1] + d[1], e.position[2] + d[2]]
                 : e.position;
      };
      const parti = passages.update(dt, playerW, sunW, (t) => {
        if (!t.receiver) return null;
        const up = t.rotation ? qrotDecor(t.rotation, [0, 1, 0]) : [0, 1, 0];
        return { self: aujourdhui(t), up,
                 target: aujourdhui(t.viewTarget || t.receiver),
                 receiver: aujourdhui(t.receiver),
                 // `RelocateBody` pose la rotation du recepteur : on arrive
                 // tourne vers ce qu'il regarde (docs/111-passages.md).
                 receiverForward: t.receiverRotation
                   ? qrotDecor(t.receiverRotation, [0, 0, 1]) : null,
                 receiverUp: t.receiverRotation
                   ? qrotDecor(t.receiverRotation, [0, 1, 0]) : null };
      });
      // `FireTeleporter` joue les particules et le son A L'APPUI, et confie le
      // corps au recepteur pour une demi-seconde. Le portage faisait tout dans
      // la meme image : on entendait le passage en etant deja arrive
      // (docs/121-avis.md).
      if (passages.depart) {
        const son = (events.of("AncientTeleporter") || { clips: {} }).clips._teleportSound;
        if (son) audio.playOneShot(son);
        // ... et `_teleportParticles.Play()`, celles de CE passage.
        particles.jouerPres("TeleportParticles", passages.depart.teleporter.position, 60);
        console.log(`passage : ${passages.depart.teleporter.name} part`);
      }
      if (parti) {
        if (parti.carries) {
          // On arrive AU point d'arrivee, exprime dans le repere courant.
          player.pos.x = parti.arrival[0] - anchorPos[0];
          player.pos.y = parti.arrival[1] - anchorPos[1];
          player.pos.z = parti.arrival[2] - anchorPos[2];
          // §P `RelocateBody` FAIT TROIS CHOSES, et le portage n'en faisait
          // qu'une. La position, oui — mais aussi :
          //
          //   body.SetVelocity(_attachedBody.GetPointVelocity(transform.position));
          //   body.SetRotation(transform.rotation);
          //
          // La VITESSE est celle du point d'arrivee sur SON corps. Sans elle on
          // debarque sur une autre planete avec la vitesse de celle qu'on
          // quitte, et on part a la derive (docs/111-passages.md).
          const vArrivee = vitesseDeDepart([player.pos.x, player.pos.y, player.pos.z]);
          player.vel.x = vArrivee[0];
          player.vel.y = vArrivee[1];
          player.vel.z = vArrivee[2];
          // Et le REGARD est celui du recepteur : on arrive tourne vers ce
          // qu'il regarde, pas dans la direction ou l'on marchait.
          if (parti.forward) {
            const hautArrivee = parti.up || [0, 1, 0];
            const l = yawFor(parti.forward, hautArrivee);
            if (l !== null) yaw = l;
            pitch = 0;
          }
          if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos);
          // `OnTeleportPlayer` : eclair BLEU, une demi-seconde pour venir et
          // deux pour repartir. Le passage etait instantane et muet a l'image.
          fx.teleport(now);
          console.log(`passage : ${parti.teleporter.name} -> ${parti.arrival}`);
        }
      }
    }
    // §N LES PASSAGES DE DARK BRAMBLE. Trois secondes apres etre entre, pas a
    // l'instant : `_warpDuration` vaut 6 et `Update` deplace le corps a la
    // MOITIE, au milieu de l'eclair de brouillard. On s'enfonce, le brouillard
    // monte, et on est ailleurs.
    if (epaves.count) {
      const saut = epaves.update(dt, now,
        [playerWorld.x, playerWorld.y, playerWorld.z],
        (w) => decalageDuCorps(w.body, anchorPos));
      if (saut) {
        player.pos.x = saut.arrival[0] - anchorPos[0];
        player.pos.y = saut.arrival[1] - anchorPos[1];
        player.pos.z = saut.arrival[2] - anchorPos[2];
        // ET ON ARRIVE EN MOUVEMENT : dix unites par seconde le long de l'axe
        // du point d'arrivee vers le centre du passage. On ne se materialise
        // pas immobile.
        player.vel.x = saut.velocity[0];
        player.vel.y = saut.velocity[1];
        player.vel.z = saut.velocity[2];
        if (playerAgg) teleportBody(BABYLON, playerAgg, player.pos);
        console.log(`epave : ${saut.warp.name} -> ${saut.receiver.name}`);
      }
      // L'ECLAIR DE BROUILLARD, et pas l'eclair bleu. Le portage jouait ici
      // `fx.teleport` — l'effet d'`AncientTeleporter.FireTeleporter`, une tout
      // autre mecanique. `DerelictWarp` appelle `FogDetector.StartFogFlash`, et
      // l'appelle A L'ENTREE : le brouillard monte trois secondes, le
      // deplacement tombe au sommet, et il redescend de l'autre cote. C'est ce
      // que le commentaire du portage decrivait — « on s'enfonce, le brouillard
      // monte, et on est ailleurs » — sans que rien ne le fasse.
      for (const f of epaves.drainFlashes()) {
        fog.startFlash(f.peak, f.fadeIn, f.fadeOut, now);
      }
      for (const e of epaves.drain()) console.log(`annonce : ${e}`);
    }
    // §5 LE SON D'EVENEMENT. Marcher, souffler, pousser, voyager, finir.
    if (events.count) {
      // Les pas se comptent sur la vitesse AU SOL : dans un vaisseau qui file,
      // on ne fait pas de bruit de pas.
      const auSol = player.grounded && !(ship && ship.boarded);
      const vitesse = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
      // `OnJump` passe AVANT le pas : sauter coupe `grounded`, et le pas de
      // l'image ne partira donc pas de toute facon.
      const pas = player.jumped ? jumpSound()
        : footsteps.update(dt, auSol ? vitesse : 0, auSol);
      if (pas) {
        const famille = events.family("PlayerMovementAudio",
                                      pas.kind === "run" ? "_run"
                                        : pas.kind === "jump" ? "_jump" : "_walk");
        if (famille.length) {
          audio.playOneShot(famille[Math.floor(Math.random() * famille.length)],
                            { volume: pas.volume, pitch: pas.pitch });
        }
      }
      // Le vent de course : dans l'air, au-dela de vingt unites par seconde.
      const dens = player.fluid ? (player.fluid.density ?? 0) : 0;
      const vent = turbulence.update(dt, vitesse, dens);
      const clipVent = (events.of("TurbulenceAudio") || { clips: {} }).clips._turbulenceClip;
      if (clipVent) audio.loopAt(clipVent, vent);
      // Les propulseurs : fondu court a l'allumage, un peu plus long a l'arret.
      // (le detail des buses est plus bas, avec les particules)
      const shipEnVol = !!(ship && ship.boarded);
      // Turbulence atmospherique du vaisseau (ShipTurbulenceAudio) :
      // ShipRattleAudio (vibrations de la coque) et TurbulenceAudio (vent).
      if (turbShip) {
        if (!shipEnVol) {
          if (shipWindLevel > 0 && turbShip.wind && turbShip.wind.clip) {
            audio.loopAt(turbShip.wind.clip, 0);
            shipWindLevel = 0;
          }
          if (shipRattleLevel > 0 && turbShip.rattle && turbShip.rattle.clip) {
            audio.loopAt(turbShip.rattle.clip, 0);
            shipRattleLevel = 0;
          }
        } else {
          const vitShip = Math.hypot(ship.vel.x, ship.vel.y, ship.vel.z);
          const densShip = player.fluid ? (player.fluid.density ?? 0) : 0;
          if (turbShip.wind && turbShip.wind.clip) {
            const cible = (densShip <= turbShip.wind.maxDensity && vitShip >= turbShip.wind.lower)
              ? Math.min(1, Math.max(0, (vitShip - turbShip.wind.lower) / (turbShip.wind.upper - turbShip.wind.lower)))
              : 0;
            shipWindLevel += (cible - shipWindLevel) * Math.min(1, Math.max(0, turbShip.wind.ease * (dt * 60)));
            if (shipWindLevel < 1e-3 && cible === 0) shipWindLevel = 0;
            audio.loopAt(turbShip.wind.clip, shipWindLevel);
          }
          if (turbShip.rattle && turbShip.rattle.clip) {
            const cible = (densShip <= turbShip.rattle.maxDensity && vitShip >= turbShip.rattle.lower)
              ? Math.min(1, Math.max(0, (vitShip - turbShip.rattle.lower) / (turbShip.rattle.upper - turbShip.rattle.lower)))
              : 0;
            shipRattleLevel += (cible - shipRattleLevel) * Math.min(1, Math.max(0, turbShip.rattle.ease * (dt * 60)));
            if (shipRattleLevel < 1e-3 && cible === 0) shipRattleLevel = 0;
            audio.loopAt(turbShip.rattle.clip, shipRattleLevel);
          }
        }
      }
      const pousseeShip = shipEnVol
        ? Math.hypot(input.forward || 0, input.right || 0, input.up || 0)
        : 0;
      const pousse = shipEnVol ? (pousseeShip > 0) : !!player.jetpack;
      const tourne = !!(shipEnVol && input.roll);
      const niveau = thrusterSound.update(dt, pousse, tourne);
      const thShip = events.of("ShipThrusterAudio") || events.of("ThrusterAudio", "Ship_Body");
      const thPlayer = events.of("ThrusterAudio", "Player_Body");
      const th = shipEnVol ? thShip : thPlayer;
      const thAutre = shipEnVol ? thPlayer : thShip;
      if (thAutre && thAutre.clips) {
        if (thAutre.clips._translationalClip) audio.loopAt(thAutre.clips._translationalClip, 0);
        if (thAutre.clips._highPowerThrusterClip) audio.loopAt(thAutre.clips._highPowerThrusterClip, 0);
      }
      if (th && th.clips) {
        if (shipEnVol && th.clips._highPowerThrusterClip) {
          const high = pousseeShip > 0.8;
          audio.loopAt(th.clips._highPowerThrusterClip, high ? niveau : 0);
          if (th.clips._translationalClip) audio.loopAt(th.clips._translationalClip, high ? 0 : niveau);
        } else if (th.clips._translationalClip) {
          audio.loopAt(th.clips._translationalClip, niveau);
        }
        if (thrusterSound.fired !== null) {
          const rot = (shipEnVol && events.of("ShipThrusterAudio"))
            ? events.family("ShipThrusterAudio", "_rotationalThrust")
            : events.family("ThrusterAudio", "_rotationalThrust", shipEnVol ? "Ship_Body" : "Player_Body");
          const f = rot[thrusterSound.fired % (rot.length || 1)];
          const vol = th.params?._rotationalThrustVolume ?? THRUSTER_AUDIO.rotationalVolume;
          if (f) audio.playOneShot(f, { volume: vol });
        }
      }
    }
    // §3 LES DIX BUSES. Chacune porte une valeur de l'enum `Thruster` et
    // regarde UNE composante de l'acceleration locale, avec un seuil de 1 :
    // une buse qui ne repond pas a la commande se remarque des qu'on decolle.
    if (nozzles.length && particles.live && particles.live.size) {
      const t = ship && ship.boarded ? ship.effectiveThrust : 0;
      const local = t
        ? [(input.right || 0) * t, (input.up ? 1 : 0) * t, (input.forward || 0) * t]
        : [0, 0, 0];
      const etats = new Map();
      for (const b of nozzles) etats.set(b.name, nozzleFires(b.thruster, local));
      particles.gate(etats);
    }
    // §3 LES BOUFFEES D'ETINCELLES : on relance, on n'arrete jamais — un
    // systeme qui ne boucle pas va au bout de sa vie tout seul.
    if (bursts.length && particles.live && particles.live.size) {
      const partent = new Set();
      for (const x of bursts) if (x.t.update(dt)) partent.add(x.b.name);
      if (partent.size) particles.pulse(partent);
    }
    // §5 LES DEUX MUSIQUES QUE docs/43 AVAIT LAISSEES OUVERTES. Celle du
    // voyage joue au poste de pilotage ET dans le vide ; celle de la fin des
    // temps entre sous quatre-vingt-dix secondes et sort a l'explosion. Leurs
    // clips sont ceux des sources posees sur les deux controleurs.
    if (audioMap.length) {
      const clipDe = (nom) => {
        const src = audioMap.find((x) => x.name === nom);
        return src ? src.file : null;
      };
      const dansLeVide = !player.field || !bodyIsAnchorable(player.field.body)
        || (player.field.magnitude ?? 0) <= 0;
      const vVoyage = travelMusic.update(dt, !!(ship && ship.boarded), dansLeVide);
      const cVoyage = clipDe("TravelMusicController");
      if (cVoyage) audio.loopAt(cVoyage, vVoyage * mixer.volume("Music"));
      const vFin = endMusic.update(dt, loop.secondsRemaining,
                                   { prevented: loop.preventSupernova,
                                     exploded: loop.supernova });
      const cFin = clipDe("EndOfTimeMusicController");
      if (cFin) audio.loopAt(cFin, vFin * mixer.volume("Music"));
      // Le souffle du casque hors de l'oxygene, et le gresillement de la
      // lunette au volume du signal (`Telescope.Update` :
      // `audio.volume = _signalStrength`, joue a `EnterTelescope`, coupe a
      // `ExitTelescope`). Deux sources 2D que rien ne jouait (docs/132).
      const sCasque = audioMap.find((x) => x.name === "SpacesuitAudio");
      if (sCasque) {
        const dansOxygene = !!(ship && ship.boarded) || !!zoneOxygene;
        audio.loopAt(sCasque.file, souffleCasque.update(dt, dansOxygene)
          * (sCasque.volume ?? 1) * mixer.volume(sCasque.track));
      }
      const sLunette = audioMap.find((x) => x.name === "PlayerCamera");
      if (sLunette) {
        audio.loopAt(sLunette.file, telescope.active
          ? Math.min(1, telescope.signalStrength) * (sLunette.volume ?? 1) : 0);
      }
    }
    // sources audio dans la portee de l'auditeur, creees et liberees a la volee
    if (audioMap.length) {
      // §N LES COQUILLES SONORES. Le build teste le tag `PlayerCameraDetector` :
      // c'est l'OREILLE qu'on guette, pas le corps. Entrer la tete dans l'ocean
      // de Giant's Deep COUPE le bruit de l'ocean — on l'entend du dessus, et
      // plus une fois dedans, ou le son d'immersion prend le relais.
      const gains = coquilles
        ? coquilles.update(dt, [camera.position.x + anchorPos[0],
                                camera.position.y + anchorPos[1],
                                camera.position.z + anchorPos[2]],
                           (sh) => decalageDuCorps(sh.body, anchorPos))
        : null;
      audio.update(player.pos, anchorPos, mixer, gains,
                   (x) => decalageDuCorps(x.body, anchorPos));
    }
    // Les ambiances suivent la position MONDE de l'auditeur, dans la meme
    // convention que les sources placees : position dans le repere ancre, plus
    // la position monde de l'ancre.
    if (ambience.count) {
      const auditeur = [player.pos.x + anchorPos[0], player.pos.y + anchorPos[1],
                        player.pos.z + anchorPos[2]];
      // `IsDay` se lit sur trois positions, et le melangeur n'en connait
      // aucune : c'est ici qu'on les resout. `_usePlayerPosition` decide de
      // laquelle sert de point du jour — celle du joueur pour le vent, celle
      // du volume pour les deux zones du village, qui basculent donc a l'heure
      // DU VILLAGE et non a celle de l'auditeur.
      const soleil = star0
        ? [star0.position[0] + anchorPos[0], star0.position[1] + anchorPos[1],
           star0.position[2] + anchorPos[2]]
        : null;
      const jourDe = soleil ? (z) => {
        const centre = centreDuCorps(z.body, anchorPos);
        if (!centre) return !night;
        let point = auditeur;
        if (!z.usePlayerPosition) {
          const d = decalageDuCorps(z.body, anchorPos);
          if (d) point = [z.position[0] + d[0], z.position[1] + d[1],
                          z.position[2] + d[2]];
        }
        return isDay(z.dayWindow || 200, centre, point, soleil);
      } : null;
      audio.setLayers(ambience.update(dt, auditeur,
        { night, jourDe,
          shiftOf: (x) => decalageDuCorps(x.body, anchorPos) }), mixer);
    }
    // Lumieres posees dans la scene : instanciees a la volee dans leur budget,
    // comme l'audio et les particules. Deux lumieres inventees ne tenaient pas
    // lieu d'eclairage pour un systeme solaire entier.
    // §S Le fondu de la lumiere du projecteur, avant que le champ de lumieres
    // ne repose les intensites : `FadeLight.Update` interpole entre l'intensite
    // COURANTE au moment de l'appel et la cible, jamais depuis l'origine — deux
    // fondus qui se chevauchent partent donc de la ou l'on en etait.
    if (fadeLight && fadeCible) {
      fadeCible.intensity = fadeLight.update(performance.now() / 1000);
    }
    placedLights.update(player.pos, anchorPos, (x) => decalageDuCorps(x.body, anchorPos));
    // `LookAtSun` : les spots de l'imposteur suivent l'etoile, a leur distance
    // du centre, tournes vers lui ; et ils portent des ombres (`m_Shadows`
    // doux, force 1) — c'est la planete qui eteint sa face nuit. Ils ne
    // servent que dans le secteur de leur corps : ailleurs, rien n'est au
    // calque `UseSunImposter`.
    {
      const etoile = bodies.find((b) => (b.gravity.surfaceAcceleration || 0) >= 50);
      let bascule = false;
      for (const { l, node, groupe } of spotsImposteurs.values()) {
        const ech = echanges.get(l.body);
        const actif = !!(ech && ech.dedans);
        const interrupteur = groupe || node;
        if (interrupteur.isEnabled() !== actif) { interrupteur.setEnabled(actif); bascule = true; }
        const corps = bodies.find((b) => b.bodyName === l.body);
        if (!actif || !corps || !etoile) continue;
        const pose = poseImposteur(corps.position, etoile.position, l.pivot);
        if (!pose) continue;
        const ombres = window.__imposteur.ombres;
        // La carte d'ombre et la lumiere qui la lit doivent avoir la MEME pose.
        // Une carte refaite toutes les six images suffisait a soixante images
        // par seconde ; a deux (SwiftShader), six images font trois secondes,
        // le spot avait tourne de cinq degres et le sol s'ombrait lui-meme en
        // entier (docs/132). Le spot ne bouge donc que par pas : quand il s'est
        // deplace de plus d'une demi-unite, dans le monde OU par rapport au
        // relief qui tourne, on le repose et la carte se refait avec lui.
        const gen = ombres.get(l.name);
        if (gen) {
          const P = new BABYLON.Vector3(...pose.position);
          const ref = ech.meshes.length ? ech.meshes[0].mesh : null;
          const loc = ref ? BABYLON.Vector3.TransformCoordinates(P, ref.getWorldMatrix().clone().invert()) : P;
          const avant = gen.__pose;
          if (avant && BABYLON.Vector3.Distance(avant.monde, P) < PAS_OMBRE_IMPOSTEUR &&
              BABYLON.Vector3.Distance(avant.local, loc) < PAS_OMBRE_IMPOSTEUR) continue;
          gen.__pose = { monde: P, local: loc };
          gen.getShadowMap().resetRefreshCounter();
        }
        node.position.set(...pose.position);
        if (node.direction) node.direction.set(...pose.direction);
        // Seul le spot central porte des ombres ; la couronne n'en a pas.
        if (l.shadows > 0 && ech.meshes.length && BABYLON.ShadowGenerator && !ombres.has(l.name)) {
          try {
            // La profondeur de la carte ne couvre que le CORPS : de la face
            // eclairee a la face nuit, soit la distance du spot au centre plus
            // ou moins le rayon. Etalee de 1 a 600, elle rendait le relief en
            // marches d'escalier noires.
            const R = ((corps.gravity && corps.gravity.upperSurfaceRadius) || 200) * 1.3;
            const distance = Math.hypot(...l.pivot.position);
            node.shadowMinZ = Math.max(1, distance - R);
            node.shadowMaxZ = distance + R;
            // `m_Resolution` 3 : « tres haute », 2 048 pour un spot dans Unity 4.
            const g = new BABYLON.ShadowGenerator(2048, node);
            g.bias = 0.002;
            g.normalBias = 0.01;
            if ("usePercentageCloserFiltering" in g) g.usePercentageCloserFiltering = true;
            g.setDarkness(1 - ((l.ombre && l.ombre.force) ?? 1));
            // Rendue une fois, puis refaite a chaque pas du spot (ci-dessus).
            g.getShadowMap().refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
            // PORTER, renderer par renderer (`m_CastShadows`). RECEVOIR, tous :
            // la camera du jeu est en Deferred Lighting, ou Unity 4 ne lit pas
            // `m_ReceiveShadows`. Honorer le drapeau laissait les pins en plein
            // soleil a midi — 77 contre 43 dans l'alpha ; ombres, 48 (docs/132).
            for (const { mesh } of ech.meshes) {
              if (!mesh.getTotalVertices || mesh.getTotalVertices() === 0) continue;
              const o = ombresDuRenderer(mesh);
              if (o.porte) g.addShadowCaster(mesh, false);
              mesh.receiveShadows = true;
            }
            ombres.set(l.name, g);
          } catch (e) { ombres.set(l.name, null); }
        }
      }
      // Rallumee, une lumiere se range en QUEUE de la liste de chaque maillage
      // (`_resyncLightSource`), quelle que soit sa priorite : on refait les
      // listes dans l'ordre trie de la scene, une fois pour toute la couronne.
      if (bascule) for (const m of scene.meshes) if (m._resyncLightSources) m._resyncLightSources();
    }
    // Ce qui fait VIVRE ces lumieres : 15 `NightLight`, 15 `PulsingLight` et
    // 9 `LightFlicker` que le portage ne lisait pas. Un feu de camp qui ne
    // vacille pas se remarque (docs/42-lumieres.md).
    placedLights.setNight(night, performance.now() / 1000);
    placedLights.animate(performance.now() / 1000);
    // le champ dominant du joueur tient lieu de `Physics.gravity` pour le
    // `gravityModifier` des systemes de particules
    if (particleMap.length) {
      particles.update(player.pos, anchorPos, player.field,
                       (x) => decalageDuCorps(x.body, anchorPos));
    }

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
  }
}

export const ready = boot();
ready.catch((e) => {
  setStatus("Erreur : " + e.message);
  console.error(e);
});
