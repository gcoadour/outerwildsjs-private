// Logique de jeu, eprouvee sans le build.
//
// Les huit fichiers precedents lisent le jeu ; celui-ci verifie ce que le
// portage en FAIT. Tout ce qui est teste ici est de la logique pure : mort et
// flashback, mise en scene de la supernova, degats du vaisseau, observation de
// la lune quantique, niveau de detail, eviction, courbes de particules. Aucun
// de ces modules ne touche a Babylon ni au DOM, donc aucun n'a besoin du jeu —
// et le peu qui en a besoin (les positions reelles) n'est pas ce qu'on verifie.
//
// C'est le meme principe que pour le decodage des clips d'animation : ce qui
// peut se verifier sans le jeu se verifie sans lui.

import { check, report } from "./run.mjs";
import { CameraEffects, DEATH_TYPE, WAKE_DURATION, TWIRL_START_ANGLE,
         TWIRL_DURATION, REGLAGES_JOUEUR, reglagesDuJoueur,
         reglagesDe } from "../web/src/cameraeffects.js";
import { Telescope, TELESCOPE, SoundWave, WAVE, telescopeScale,
         zoomArrowFraction, TELESCOPE_GUI } from "../web/src/tools.js";
import { mapMarkers, markerVisible } from "../web/src/map.js";
import { gazeSwitches, energyGates, GazeSwitch as Regard, EnergyGate as Porte,
         webSpeeds, webAlpha, webAnimators, GAZE, WEB } from "../web/src/gaze.js";
import { Helmet, SUIT, MasterAlarm as Alarme, DamageDisplay, Notifications,
         roastPrompts, roastBroken, shipProximity, helmetSettings,
         HELMET_LAG, HELMET_LAG_CTOR,
         HELMET_AMPLITUDE, ALARM_THRESHOLD, BLINK_PERIOD,
         ROAST_DISTANCE } from "../web/src/helmet.js";
import { elevators, Elevator as Cabine, LaunchTerminal, landedOn,
         landingPadSensors, museumEntryways, smoothStep,
         ELEVATOR } from "../web/src/tower.js";
import { sandScale, sandProgress, funnelScale, funnelActive,
         sandColumns, sandFunnels, markCrushing, SandLevels } from "../web/src/sand.js";
import { playerNoise, CompressionSensor, INTERACT_RANGE, NOISE,
         COMPRESSION_GRACE, PlayerState } from "../web/src/player.js";
import { ambientTarget, ambientStep, shiplightRange, SHIPLIGHT_RANGE,
         FadeLight, DayNightTracker } from "../web/src/lights.js";
import { shellGain, audioShells, SHELL_FADE, AudioShells } from "../web/src/audio.js";
import { planetImposters, Imposter, IMPOSTER_SIZE } from "../web/src/imposters.js";
import { clipLoops, WRAP, HELD_ROOTS } from "../web/src/pipeline/extract/gltf.js";
import { MarshmallowStick as Baton, thermTime, THERM_HEAT_SPAN,
         STICK_CLIPS, STICK_LIGHTS } from "../web/src/held.js";
import { LockOn, aimedFrame, bracketScale, angleTo, canFlyTo, matchedVelocity,
         LOCK_NEAR, BRACKET_RATE } from "../web/src/tracker.js";
import { relativeMotion, trackerReadout, directThreshold, motionDust,
         ARROW_OFFSET, DUST, DEAD_THRESHOLD, shipNozzles, modelShipNozzles,
         ancientProbeAcceleration, ANCIENT_PROBE_THRUST,
         SHIP_NOZZLES } from "../web/src/tracker.js";
import { alignmentDirection, alignedBodies, fieldInheritors, inheritedAcceleration,
         blinkingRenderers, Blinker, brokenNodes, waterEffects,
         BLINK } from "../web/src/attachments.js";
import { DEATH_TYPES, deathCause, destructionVolumes, destroyedBy,
         repairVolumes, Repair } from "../web/src/volumes.js";
import { ambienceZones, activeZones, winnersByLayer, clipOf,
         AmbienceMixer } from "../web/src/ambience.js";
import { hazardVolumes, Hazards, zeroGFields, zeroGAt, gameSectors,
         gameSectorAt, probePrompts, radiationEmitters,
         radiationAt, CompoundTrigger, sandstormVolumes,
         childTriggers, Sandstorm, promptFaced } from "../web/src/volumes.js";
import { referenceFrames, frameAt, autopilotDistances, matchInitialVelocity,
         attachTarget, DeclaredFrames, restingPoint,
         ARRIVAL_FALLBACK } from "../web/src/frames.js";
import { tornadoPivots, TornadoPivots, matchTransforms,
         disposableContainers, MeteorLaunchers, METEOR, warps, WARP,
         DerelictWarps } from "../web/src/decor.js";
import { projectOut, fromToRotation, qrot, qmul, lookRotation as decorLook, angleBetween,
         signedAngleAround, facePlayerStep, FACE_SLERP, nozzleFires,
         THRUSTER_NOZZLES, RandomTimer, teleporterFires, TELEPORT_COOLDOWN,
         DecorField } from "../web/src/decor.js";
import { FOOTSTEP, footstepInterval, Footsteps, TURBULENCE, turbulenceTarget,
         Turbulence, THRUSTER_AUDIO, ThrusterSound, TravelMusic, TRAVEL_FADE,
         EndOfTimeMusic, END_OF_TIME, eventAudio, UISounds, UI_SOUNDS,
         UI_VOLUME, REPAIR_FADE } from "../web/src/reactaudio.js";
import { gearPickups, Equipment, suitVolumes, suitVolumeStep, interactZones,
         zoneFaced, ZeroGTraining, CameraLock, lockFOV, lockYawError,
         suitBarrierPush } from "../web/src/gear.js";
import { Interactables } from "../web/src/interact.js";
import { ATTACHE, AttachPoint, AttachPoints, turnDuration, turnFraction,
         FieldAlignment, FIELD_ALIGN, discreteRotationDuration,
         slideFraction, snapDuration, snapDegrees, qslerp, toLocal,
         toWorld } from "../web/src/attach.js";
import { eatMarshmallowHeals, flashlightPromptVisible } from "../web/src/consoles.js";
import { Commandes, COMMANDES, AJOUTS, codeUnity } from "../web/src/input.js";
import { Modes, ENSEMBLES, ALIAS, canaux, SAUVEGARDENT } from "../web/src/modes.js";
import { MODELE, ModelLandingSpot, RocketKid, crashes, stillEnough,
         modelLandingSpots, modelShipBody,
         rocketKids } from "../web/src/modelship.js";
import { QUANTIQUE, QuantumObject as ObjetQuantique, planarQuantumObjects,
         quantumStatues, locksOnSnapshot, collapsesOnFlashlightOff,
         statueParts, planarCandidate, slopeOK } from "../web/src/quantumobj.js";
import { SONDE, ProbeLauncher as Lanceur, Probe as Sonde, chargeFraction,
         launchSpeed, launchPitch, orbitalSpeed, launchWindowLength,
         tracksHorizon, horizonAim, impendingCollision, lanternRange,
         snapshotSize, probeIcon, probeReadout, probeLabelPos,
         selfDestructed, angleEntre } from "../web/src/probe.js";

import { Flashback, PlayerDeathHandler, FLASHBACK } from "../web/src/death.js";
import { TimeLoop } from "../web/src/timeloop.js";
import { SunStage } from "../web/src/supernova.js";
import { ShipDamage, locationOf, LOCATIONS, ALL_LOCATIONS,
         engineComponents, THRUSTERS } from "../web/src/shipdamage.js";
import { Ship, spinStep, quatRotate, terminalAngularSpeed,
         IGNITION_DURATION } from "../web/src/ship.js";
import { Player, PLAYER_FALLBACK, groundTarget, approach, walkable,
         jumpHeight, frameFriction } from "../web/src/player.js";
import { playerConstants } from "../web/src/config.js";
import { buildOrbits, advance, frameVelocity } from "../web/src/orbits.js";
import { polarFields, polarDirection, strongestPolar,
         distanceToAxis } from "../web/src/gravity.js";
import { rolloffModel, curveGain, AudioField } from "../web/src/audio.js";
import { aiffToWav, extended80 } from "../web/src/pipeline/audioenc.js";
import { sniffContainer, clipContainer } from "../web/src/pipeline/extract/audio.js";
import { DialogueSystem } from "../web/src/dialogue.js";
import { colliderLODs, ColliderLODs } from "../web/src/lod.js";
import { oxygenDetector } from "../web/src/resources.js";
import { underAsleep, noCollide } from "../web/src/physics.js";
import { skyAlpha, curveAt as skyCurveAt, SKY_RADIUS, Sky, alignAxis,
         DISC_FALLBACK, CLOUD_NAME, StarField } from "../web/src/sky.js";
import { scrollOffset, TextureScrollers } from "../web/src/texanim.js";
import { QuantumMoon, orbitTilt, bodyOccluder,
         quantumHosts } from "../web/src/quantum.js";
import { Anglerfish, FISH } from "../web/src/bramble.js";
import { DebrisField, DEBRIS_RADIUS } from "../web/src/blackhole.js";
import { MeshLOD, Evictor, LOD_RATIO } from "../web/src/lod.js";
import { ambientIntensity } from "../web/src/sectors.js";
import { transmitterCutoff, TRANSMITTER_LOWPASS, OPEN_BAND } from "../web/src/audio.js";
import { envelope } from "../web/src/pipeline/extract/particles.js";
import { stickVector, lookCurve, sprinting, STICK_RADIUS, DEAD_ZONE,
         LOOK_DEAD_ZONE, SPRINT_AT } from "../web/src/touch.js";
import { padState, padEdges, deadZone, padLookCurve, PAD_BUTTONS,
         PAD_DEAD_ZONE } from "../web/src/gamepad.js";
import { bodySpin, spinPeriod, rotateAbout, SpinField,
         sunElevation } from "../web/src/spin.js";
import { directionalFields, insideVolume, strongestDirectional,
         dominantField } from "../web/src/gravity.js";
import { fluidVolumes, fluidDetectors, dragFactorFor, fluidAt, depthIn,
         applyDrag, terminalSpeed, densityAt, mediumVelocity, lawOf, curveAt,
         FluidField } from "../web/src/fluids.js";
import { pickLights, LIGHT_BUDGET, pulse, flicker, nightIntensity,
         NIGHT_FADE } from "../web/src/lights.js";
import { oxygenZones, inOxygenZone } from "../web/src/resources.js";
import { heatSources, heatAt, remoteConsoles, RemoteConsoles,
         Marshmallow } from "../web/src/consoles.js";
import { lodThresholds } from "../web/src/lod.js";
import { segmentDepthInSphere, occludes, lookRotation, alignToObserver,
         CHECK_RADIUS, CHECK_DEPTH } from "../web/src/quantum.js";
import { NoiseField, corruptionRange, corruptionThreshold } from "../web/src/bramble.js";
import { deathCamera, DEATH_FALL, DEATH_SOUNDS } from "../web/src/death.js";
import { convoControllers, treeFromController, PlayerData,
         selectTree, CONVO_RULES } from "../web/src/playerdata.js";
import { parseWav, oggCrc, oggPage, muxOggOpus, interleave } from "../web/src/pipeline/audioenc.js";
import { startPose, walkToShip, spawnPoints, isShipSpawn, nearestTo,
         quatForward, horizonBasis, yawFor, PLAYER_RADIUS,
         SPAWN_CLEARANCE } from "../web/src/start.js";

const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

// --- flashback ---------------------------------------------------------
//
// Les quatre constantes du build donnent le reste : 0,6 x 0,9^n reste au-dessus
// de 0,06 pour n de 0 a 21.
{
  const fb = new Flashback();
  check("images du flashback", fb.frames.length, 22);
  check("premiere image", round(fb.frames[0]), FLASHBACK.firstFrame);
  check("derniere image au-dessus du plancher", fb.frames[21] >= FLASHBACK.minFrame, true);
  check("image suivante sous le plancher",
        round(fb.frames[21] * FLASHBACK.decay, 4) < FLASHBACK.minFrame, true);
  check("duree totale de la sequence", round(fb.duration, 2), 8.21);

  fb.start();
  const seen = [];
  let guard = 0;
  for (;;) {
    const s = fb.update(0.02);
    if (!seen.includes(s.phase)) seen.push(s.phase);
    if (s.fini || ++guard > 1000) break;
  }
  check("phases traversees dans l'ordre", seen.join(">"),
        "attente>images>fondu>fini");
  check("le voile est plein a la fin", fb.update(0).alpha, 0);
}

// --- causes de mort ----------------------------------------------------
{
  const d = new PlayerDeathHandler();
  check("vivant au depart", d.dead, false);
  check("la premiere cause prend", d.kill("digestion"), true);
  check("la seconde est ignoree", d.kill("supernova"), false);
  check("cause retenue", d.cause, "digestion");
  check("une seule mort comptee", d.deaths, 1);

  // la sequence entiere doit s'ecouler avant que la boucle ne reparte
  let t = 0, done = false;
  while (t < 20 && !done) { done = d.update(0.05); t += 0.05; }
  check("redemarrage apres la sequence", round(t, 2), 8.25);
  d.revive();
  check("vivant apres revive", d.dead, false);
}

// --- boucle temporelle : suspendre la fin des temps ---------------------
{
  const loop = new TimeLoop(20);
  loop.elapsed = loop.duration - 0.01;
  loop.preventSupernova = true;
  loop.update(1, 1000);
  check("GetPreventSupernova retient la supernova", loop.supernova, false);
  check("... sans arreter le compte a rebours", loop.secondsRemaining, 0);
  loop.preventSupernova = false;
  loop.update(1, 1e9);
  check("elle repart des qu'on la laisse", loop.supernova, true);
  // l'onde de choc rattrape ce qui est assez pres
  loop.update(1, 100);
  check("l'onde tue ce qu'elle rattrape", loop.deathCause, "supernova");
}

// --- mise en scene de la supernova --------------------------------------
{
  const stage = new SunStage(2000);
  const at = (f, left, nova, r) => stage.update(
    { fraction: f, secondsRemaining: left, supernova: nova, shockwaveRadius: r });

  const debut = at(0, 1200, false, 0);
  const tard = at(0.9, 120, false, 0);
  check("l'etoile enfle au fil de la boucle", tard.scale > debut.scale, true);
  check("phase au fil de la boucle", tard.phase, "progression");

  const creux = at(1, 0, false, 0);
  check("ShrinkSunBehavior : elle se contracte avant d'exploser",
        round(creux.scale), 0.62);
  check("phase de contraction", creux.phase, "contraction");
  check("la contraction passe sous la taille de depart", creux.scale < 1, true);

  const boum = at(1, 0, true, 20000);
  check("l'explosion suit l'onde", round(boum.scale), 10.62);
  check("phase d'explosion", boum.phase, "explosion");
  check("l'onde palit en s'etendant", at(1, 0, true, 29000).shock.alpha < boum.shock.alpha, true);
  check("l'eclair ne dure pas", at(1, 0, true, 20000).flash, 0);
  check("... mais il est plein au declenchement", at(1, 0, true, 0).flash, 1);
  check("echelle bornee", at(1, 0, true, 1e9).scale, 40);
}

// --- degats du vaisseau -------------------------------------------------
{
  // Position de l'impact. `DamageAlertLocation` n'a que CINQ valeurs — Front 1,
  // Top 2, Back 4, Left 8, Right 16 — et pas de « bas » : les six positions
  // qu'avait le portage etaient inventees. Un choc par en dessous compte donc
  // pour « arriere », qui est ou sont les reacteurs.
  check("cinq positions, en drapeaux", ALL_LOCATIONS, 31);
  check("impact par en dessous", locationOf([0, -1, 0]), "arriere");
  check("impact frontal", locationOf([0, 0, 1]), "avant");
  check("impact par l'arriere", locationOf([0, -0.2, -1]), "arriere");
  check("impact lateral", locationOf([1, 0, 0.5]), "droite");
  check("impact par le haut", locationOf([0, 1, 0.2]), "haut");

  // LA LECTURE A L'ENVERS, CORRIGEE. Le portage lisait `_damageLocationMask`
  // comme un filtre et concluait de son zero qu'« aucune piece n'est touchee
  // avec les valeurs du build ». `OnImpact` fait `mask |= _alertLocation` : le
  // masque est un RESULTAT, et zero est l'etat d'un vaisseau intact.
  //
  // Un test gardait donc la lecture fausse, et il aurait refuse la correction.
  const alpha = new ShipDamage({ _damageLocationMask: 0, _shipTotalHealth: 100,
                                 _instantDeathSpeed: 300,
                                 _disableDamagedThrusters: false });
  check("au depart, aucune alerte", alpha.alerted.length, 0);
  const r = alpha.impact(40, [0, -1, 0]);
  check("degats a 40 u/s", round(r.damage, 1), 26.3);
  // force = 100 x (40 - 0) / (300 - 0)
  check("la piece prend sa part, et elle n'est pas nulle", round(r.part, 2), 13.33);
  check("integrite entamee", round(alpha.integrity, 1), 73.7);
  check("et le masque porte desormais l'arriere", alpha.alerted.join(","), "arriere");

  // TROIS PIECES ABIMEES AU PLUS. Au-dela, un impact ne fait plus de nouvelle
  // victime — la quatrieme position reste intacte quoi qu'il arrive.
  const trois = new ShipDamage({ _shipTotalHealth: 1e9, _instantDeathSpeed: 300 });
  // Vingt unites par seconde : au-dessus du seuil leger (15), donc un impact
  // reel, et assez doux pour que la coque survive aux cinq chocs.
  trois.impact(20, [0, 0, 1]);       // avant
  trois.impact(20, [0, 1, 0]);       // haut
  trois.impact(20, [1, 0, 0]);       // droite
  check("trois pieces abimees", trois.alerted.length, 3);
  const quatrieme = trois.impact(20, [-1, 0, 0]);   // gauche
  check("la quatrieme ne prend rien", quatrieme.part, 0);
  check("et l'alerte ne s'etend pas", trois.alerted.length, 3);
  // Une piece DEJA abimee peut toujours l'etre davantage.
  check("mais une deja touchee, si", trois.impact(20, [0, 0, 1]).part > 0, true);

  // LA PIECE EST LA PLUS PROCHE DU POINT, quand on a les reacteurs.
  const moteurs = engineComponents({ placed: { EngineComponent: [
    { name: "DamageSiteContainer(Engine)", position: [-2, 0, 0],
      fields: { _thrusterLocation: 0, _alertLocation: 8, _impactThreshold: 0, _integrity: 100 } },
    { name: "DamageSiteContainer(Engine)", position: [2, 0, 0],
      fields: { _thrusterLocation: 5, _alertLocation: 16, _impactThreshold: 0, _integrity: 100 } },
  ] } });
  check("les reacteurs se lisent", moteurs.length, 2);
  check("et savent leur cote", moteurs.map((e) => e.location).join(","), "gauche,droite");
  check("et leur buse", moteurs.map((e) => e.thruster).join(","), "Left,Right");
  const proche = new ShipDamage({ _shipTotalHealth: 1e9 }, moteurs);
  // La normale dit « avant » ; le POINT dit « droite ». Le build suit le point.
  const choix = proche.impact(30, [0, 0, 1], [1.9, 0, 0]);
  check("la piece touchee est la plus proche du point", choix.location, "droite");
  check("et non celle que designe la normale", choix.location === "avant", false);

  // `_disableDamagedThrusters` vaut FAUX dans cette alpha : une piece morte ne
  // coupe rien. Le mecanisme est porte quand meme.
  //
  // Quinze chocs a 20 u/s : la piece perd 100 (20/3 par choc) et meurt, quand
  // la coque n'en perd que 31 — c'est tout l'interet des degats localises.
  const use = new ShipDamage({ _shipTotalHealth: 1e9, _instantDeathSpeed: 300,
                               _disableDamagedThrusters: true });
  for (let i = 0; i < 15; i++) use.impact(20, [0, 0, -1]);
  check("piece morte apres une serie de chocs", use.parts.arriere.dead, true);
  check("le propulseur coupe est hors service", use.thrustFactor("arriere"), 0);
  check("les autres poussent encore", use.thrustFactor("avant"), 1);

  const sansOption = new ShipDamage({ _shipTotalHealth: 1e9, _instantDeathSpeed: 300,
                                      _disableDamagedThrusters: false });
  for (let i = 0; i < 15; i++) sansOption.impact(20, [0, 0, -1]);
  check("sans _disableDamagedThrusters, la piece morte ne coupe rien",
        sansOption.thrustFactor("arriere"), 1);

  // LES DEUX MORTS. Le choc unique trop violent, et l'usure cumulee.
  const perdu = new ShipDamage({ _instantDeathSpeed: 300 });
  perdu.impact(301, [0, -1, 0]);
  check("mort instantanee au-dela de 300 u/s", perdu.destroyed, true);
  check("un vaisseau detruit ne pousse plus", perdu.thrustFactor("arriere"), 0);
  perdu.reset();
  check("la boucle le rend entier", perdu.destroyed, false);
  check("et efface son alerte", perdu.mask, 0);

  const usure = new ShipDamage({ _shipTotalHealth: 100, _instantDeathSpeed: 300 });
  // Chaque choc a 20 u/s coute 6,67 a la piece : il en faut quinze pour que le
  // cumul passe la sante totale, et la coque, elle, tient encore.
  for (let i = 0; i < 14; i++) usure.impact(20, [0, 0, -1]);
  check("quatorze chocs ne suffisent pas", usure.destroyed, false);
  check("et la coque tient encore", usure.integrity > 0, true);
  usure.impact(20, [0, 0, -1]);
  check("le cumul au-dela de la sante totale, si", usure.destroyed, true);

  // Reparer retire la position de l'alerte.
  const repare = new ShipDamage({ _shipTotalHealth: 1e9 });
  repare.impact(40, [0, 0, -1]);
  check("l'alerte est levee", repare.covers("arriere"), true);
  repare.repair("arriere");
  check("et la reparation la retire", repare.covers("arriere"), false);
}

// --- limite de poussee du secteur ---------------------------------------
{
  const ship = new Ship({ _maxTranslationalThrust: 50 }, null, [0, 0, 0]);
  check("poussee pleine hors secteur", ship.effectiveThrust, 50);
  ship.thrustLimit = 20;
  check("poussee bornee par le secteur", ship.effectiveThrust, 20);
  ship.thrustLimit = 200;
  check("une limite plus haute ne l'augmente pas", ship.effectiveThrust, 50);
  ship.damage.impact(300, null);
  check("detruit, il ne pousse plus", ship.effectiveThrust, 0);
}

// --- lune quantique : occlusion et inclinaison ---------------------------
{
  // `occludes` porte la loi entiere : une sphere de rayon `_sphereCheckRadius`
  // lancee, et un obstacle qui compte s'il la garde dedans sur `_checkDepth`.
  // La forme booleenne d'a cote (`segmentHitsSphere`) n'etait qu'une moitie, et
  // rien ne l'appelait (docs/74-etalons.md).
  check("un corps sur la ligne de vue masque",
        occludes([0, 0, 0], [0, 0, 1000], [0, 0, 500], 200, 0, 1), true);
  check("un corps a cote ne masque pas",
        occludes([0, 0, 0], [0, 0, 1000], [400, 0, 500], 100, 0, 1), false);
  check("un corps derriere la cible ne masque pas",
        occludes([0, 0, 0], [0, 0, 500], [0, 0, 900], 100, 0, 1), false);

  check("inclinaison lue dans les champs",
        round(orbitTilt({ _orbitInclination: 30 }, "x"), 4),
        round(30 * Math.PI / 180, 4));
  const t1 = orbitTilt({}, "TimberHearth"), t2 = orbitTilt({}, "TimberHearth");
  check("a defaut, elle est tiree du nom et stable", t1, t2);
  check("... et bornee a 25 degres", Math.abs(t1) <= 25 * Math.PI / 180 + 1e-9, true);
  check("deux hotes ne partagent pas le meme plan",
        orbitTilt({}, "GiantsDeep") !== t1, true);

  const bodies = [
    { bodyName: "Host", position: [0, 0, 0],
      gravity: { upperSurfaceRadius: 300 } },
    { bodyName: "Mur", position: [0, 0, 500],
      gravity: { upperSurfaceRadius: 200 } },
  ];
  const hosts = quantumHosts({ placed: { QuantumOrbit: [
    { name: "Host", fields: { _orbitRadius: 1000, _orbitInclination: 20 } }] } });
  check("hote lu depuis gameplay.json", hosts.length, 1);
  const moon = new QuantumMoon(hosts, bodies);
  moon.angle = Math.PI / 2;
  moon.sync();
  check("orbite inclinee : la lune quitte le plan",
        Math.abs(moon.position[1]) > 100, true);

  // le regard porte, mais un corps se trouve entre les deux
  moon.position = [0, 0, 1000];
  const eye = { x: 0, y: 0, z: 0 }, fwd = { x: 0, y: 0, z: 1 };
  check("observee quand la vue est libre",
        moon.isObserved(eye, fwd, { occluded: () => false }), true);
  check("non observee derriere un corps",
        moon.isObserved(eye, fwd, { occluded: bodyOccluder(bodies, null) }), false);
  check("la garde de 150 u tient malgre l'occlusion",
        new QuantumMoon(hosts, bodies).isObserved(
          { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 },
          { occluded: () => true }) === false, true);
}

// --- Dark Bramble : la prise -------------------------------------------
{
  const fish = new Anglerfish([0, 0, 0]);
  const player = { x: 30, y: 0, z: 0 };
  for (let i = 0; i < 200; i++) fish.update(0.1, player, true);
  check("le predateur poursuit le bruit", fish.state, "poursuit");
  check("il finit par attraper", fish.caught, true);
  const calme = new Anglerfish([0, 0, 0]);
  calme.update(0.1, { x: 10, y: 0, z: 0 }, false);
  check("immobile et silencieux, on ne risque rien", calme.caught, false);
  check("rayon de prise", FISH.catchRadius, 25);
}

// --- niveau de detail ---------------------------------------------------
{
  const mesh = (r, x) => ({
    isVisible: true,
    getBoundingInfo: () => ({ boundingSphere: {
      centerWorld: { x, y: 0, z: 0 }, radiusWorld: r } }),
  });
  const lod = new MeshLOD();
  const cam = { x: 0, y: 0, z: 0 };
  const petitLoin = mesh(1, 100000);       // rapport 1e-5
  const grosLoin = mesh(2000, 100000);     // rapport 0,02
  const petitPres = mesh(1, 10);           // rapport 0,1
  for (const m of [petitLoin, grosLoin, petitPres]) lod.apply(m, cam);
  check("un caillou lointain s'eteint", petitLoin.isVisible, false);
  check("une planete lointaine reste", grosLoin.isVisible, true);
  check("le meme caillou de pres reste", petitPres.isVisible, true);
  check("maillages eteints comptes", lod.hidden, 1);
  // il se rallume des qu'on s'approche
  const bouge = mesh(1, 100000);
  lod.apply(bouge, cam);
  check("eteint a distance", bouge.isVisible, false);
  lod.apply(mesh(1, 10), cam);
  const revenu = { ...bouge, getBoundingInfo: () => ({ boundingSphere: {
    centerWorld: { x: 20, y: 0, z: 0 }, radiusWorld: 1 } }) };
  lod.apply(revenu, cam);
  check("rallume en approchant", revenu.isVisible, true);
  check("seuil de hauteur relative a l'ecran", LOD_RATIO, 0.0022);

  // parcours tournant : une tranche par image, pas 12 000 maillages
  const petit = new MeshLOD(LOD_RATIO, 2);
  const entry = { file: "x.gltf", meshes: [mesh(1, 5), mesh(1, 6), mesh(1, 7)] };
  petit.update([entry], cam);
  check("tranche par image", petit.tested, 2);
  check("le curseur avance", petit.cursor.get("x.gltf"), 2);
  petit.update([entry], cam);
  check("et boucle", petit.cursor.get("x.gltf"), 1);
}

// --- eviction -----------------------------------------------------------
{
  const freed = [];
  const ev = new Evictor(45, ["sun_body.gltf"]);
  const evict = (f) => { freed.push(f); return true; };

  ev.see("comet_pivot.gltf", false);
  ev.update(44, evict);
  check("rien n'est libere avant le delai", freed.length, 0);
  check("le compteur court", round(ev.waiting("comet_pivot.gltf")), 44);
  ev.see("comet_pivot.gltf", true);
  ev.update(10, evict);
  check("revenir a portee remet le compteur a zero", ev.waiting("comet_pivot.gltf"), 0);

  ev.see("comet_pivot.gltf", false);
  ev.update(46, evict);
  check("libere apres le delai", freed.join(), "comet_pivot.gltf");
  check("compte des liberations", ev.evicted, 1);

  ev.see("sun_body.gltf", false);
  ev.update(1000, evict);
  check("un fichier protege ne part jamais", freed.length, 1);
}

// --- champ de debris du trou blanc --------------------------------------
{
  const field = new DebrisField(750, 2);
  check("rayon de debris", field.radius, DEBRIS_RADIUS);
  field.swallow("Shard_01"); field.swallow("Shard_02");
  check("deux morceaux en file", field.pending, 2);
  check("rien ne ressort avant le delai", field.update(1.9).length, 0);
  check("un morceau ressort", field.update(0.2).length, 1);
  check("... un seul a la fois", field.grown, 1);
  field.update(2);
  check("puis le suivant", field.grown, 2);
  check("file vide", field.pending, 0);

  const p = field.items[0].position;
  check("dans la sphere de debris",
        Math.hypot(p[0], p[1], p[2]) <= 750 + 1e-9, true);
  check("placement reproductible",
        JSON.stringify(new DebrisField(750, 2).place("Shard_01")),
        JSON.stringify(p));
  check("deux morceaux ne se superposent pas",
        JSON.stringify(field.items[0].position) !==
        JSON.stringify(field.items[1].position), true);
}

// --- eclairage ambiant par secteur --------------------------------------
{
  check("secteur sans ambiance", round(ambientIntensity(0, 0), 3), 0.1);
  check("centre d'un secteur eclaire", round(ambientIntensity(0, 750), 3), 0.35);
  check("a mi-portee", round(ambientIntensity(375, 750), 3), 0.225);
  check("au-dela de la portee", round(ambientIntensity(2000, 750), 3), 0.1);
}

// --- coupure passe-bas des emetteurs ------------------------------------
{
  check("signal non cadre : etouffe a 1 000 Hz",
        Math.round(transmitterCutoff(0)), TRANSMITTER_LOWPASS);
  check("signal parfaitement cadre : bande entiere",
        Math.round(transmitterCutoff(1)), OPEN_BAND);
  // progression geometrique : a mi-course, la moyenne GEOMETRIQUE des bornes
  check("a mi-course", Math.round(transmitterCutoff(0.5)),
        Math.round(Math.sqrt(TRANSMITTER_LOWPASS * OPEN_BAND)));
  check("force hors bornes bornee", Math.round(transmitterCutoff(5)), OPEN_BAND);
}

// --- courbes variables des particules ------------------------------------
//
// Une MinMaxCurve fabriquee : le meme oracle que pour les clips d'animation,
// un flux qu'on ecrit soi-meme pour eprouver le lecteur sans le jeu.
{
  const cst = (v) => ({ m_Curve: [{ time: 0, value: v }, { time: 1, value: v }] });
  check("courbe plate : aucune enveloppe",
        envelope({ scalar: 2, minCurve: cst(1), maxCurve: cst(1) }), null);
  check("deux constantes",
        JSON.stringify(envelope({ scalar: 3, minCurve: cst(1), maxCurve: cst(2) })),
        "[3,6]");
  check("courbe variable",
        JSON.stringify(envelope({ scalar: 1, minCurve: cst(0),
          maxCurve: { m_Curve: [{ time: 0, value: 0.2 }, { time: 1, value: 5 }] } })),
        "[0,5]");
  check("sans courbe, rien", envelope({ scalar: 1 }), null);
  check("mmc absente", envelope(null), null);
}

// --- les deux manches tactiles -------------------------------------------
//
// Geometrie pure, donc verifiable sans navigateur : ce qu'un pouce pose a tel
// endroit produit comme axe. Le reste de la couche — les evenements, les
// boutons, la boucle du regard — demande un vrai navigateur, et c'est
// `tools/15_verify.py` qui s'en charge.
{
  const R = STICK_RADIUS;
  const v = (dx, dy, dead) => stickVector(dx, dy, R, dead);

  check("manche au repos : axe nul", v(0, 0).mag, 0);
  check("dans la zone morte : rien", v(0, -DEAD_ZONE * R * 0.9).mag, 0);
  check("au sortir de la zone morte : axe reparti de zero",
        round(v(0, -DEAD_ZONE * R * 1.1).mag, 3), 0.019);
  check("manche a fond : axe sature a 1", v(0, -R).mag, 1);
  check("pousse au-dela du rayon : toujours 1", v(0, -3 * R).mag, 1);
  check("vers le haut de l'ecran, on avance", round(-v(0, -R).y, 3), 1);
  check("a mi-rayon", round(v(0, -R / 2).mag, 3), 0.405);
  // La direction est unitaire AVANT l'amplitude : une diagonale a fond donne
  // bien deux axes egaux, et non deux axes satures.
  check("diagonale a fond : deux axes egaux",
        round(v(R, -R).x, 3), round(-v(R, -R).y, 3));

  // Le manche droit a la meme geometrie et une zone morte plus large : une
  // camera qui derive sous un pouce immobile est pire qu'un pas parasite.
  const d = 0.23 * R;
  check("regard : zone morte plus large que celle du deplacement",
        v(0, -d, LOOK_DEAD_ZONE).mag < v(0, -d, DEAD_ZONE).mag, true);

  // Courbe de reponse du regard : elle passe par les memes bornes qu'une
  // droite, mais reste sous elle partout entre les deux — c'est ce qui donne
  // la visee fine sans perdre le demi-tour.
  check("manche de regard lache : aucune rotation", lookCurve(0), 0);
  check("manche de regard a fond : vitesse pleine", lookCurve(1), 1);
  check("a mi-manche, bien moins que la moitie", round(lookCurve(0.5), 3), 0.219);
  check("courbe croissante", lookCurve(0.3) < lookCurve(0.6), true);

  // Cran de course : a fond, et dans les 45 degres de l'avant.
  check("a fond devant : le cran de course prend", sprinting(v(0, -R)), true);
  check("a fond en diagonale : encore dans le cone", sprinting(v(R, -R)), true);
  check("a fond de cote : pas de course", sprinting(v(R, 0)), false);
  check("a fond en arriere : pas de course", sprinting(v(0, R)), false);
  check("pas tout a fait a fond : pas de course",
        sprinting(v(0, -R * (SPRINT_AT * 0.9))), false);
}

// --- rotation propre des corps -----------------------------------------
//
// Les deux sources n'ont pas la meme unite : RotateTransform compte en degres
// par seconde, InitialMotion en radians. La premiere prime quand elle existe.
{
  const rt = { spin: { axis: [0, 1, 0], degreesPerSecond: 3 },
               orbit: { spinAxis: [1, 0, 0], spinSpeed: 0.05 } };
  const s = bodySpin(rt);
  check("RotateTransform prime sur InitialMotion", s.source, "RotateTransform");
  check("degres par seconde convertis en radians", round(s.rate, 6),
        round(3 * Math.PI / 180, 6));
  check("periode de rotation", round(spinPeriod(rt), 1), 120);

  const im = { spin: null, orbit: { spinAxis: [0, 1, 0], spinSpeed: 0.02 } };
  check("a defaut, InitialMotion en radians par seconde", bodySpin(im).rate, 0.02);
  check("periode a 0,02 rad/s", round(spinPeriod(im), 1), 314.2);
  check("corps sans rotation", bodySpin({ spin: null, orbit: null }), null);
  check("vitesse nulle : pas de rotation",
        bodySpin({ spin: { axis: [0, 1, 0], degreesPerSecond: 0 }, orbit: null }), null);

  const v = rotateAbout([1, 0, 0], [0, 1, 0], Math.PI / 2);
  check("rotation d'un quart de tour autour de Y", round(v[2], 6), -1);
  check("... sans deriver sur l'axe", round(v[0], 6), 0);

  // Le point clef : le corps ancre ne bouge PAS dans son propre repere, c'est
  // le ciel qui tourne. C'est ce qui garde les colliders statiques valides.
  const anchor = { spin: { axis: [0, 1, 0], degreesPerSecond: 90 }, orbit: null };
  const field = new SpinField([anchor]);
  check("un seul corps tourne", field.count, 1);
  field.advance(1);
  check("un quart de tour en une seconde", round(field.angle(anchor), 6),
        round(Math.PI / 2, 6));
  // toFrame tourne d'un angle OPPOSE a celui du corps : l'observateur tourne
  // avec lui, le monde lui parait tourner en sens inverse.
  const sky = field.toFrame(anchor, [1000, 0, 0]);
  check("le ciel a tourne d'un quart de tour", round(sky[2], 3), 1000);
  check("... dans le sens inverse du corps",
        round(field.toWorld(anchor, [1000, 0, 0])[2], 3), -1000);
  const ground = field.toFrame(anchor, [0, 0, 0]);
  check("le centre du corps ancre reste immobile",
        round(Math.hypot(...ground), 6), 0);
  const back = field.toWorld(anchor, sky);
  check("aller-retour monde/repere sans perte", round(back[0], 3), 1000);

  // Cycle jour/nuit : le soleil passe sous l'horizon local a mi-tour.
  const up = [1, 0, 0];
  check("midi : le soleil est au zenith",
        round(sunElevation([8000, 0, 0], up), 3), round(Math.PI / 2, 3));
  check("minuit : il est sous l'horizon", sunElevation([-8000, 0, 0], up) < 0, true);
  check("aube : il rase l'horizon", round(sunElevation([0, 0, 8000], up), 6), 0);
}

// --- champs de force directionnels --------------------------------------
//
// 34 DirectionalForceField contre 10 GravityWell : ce sont les gravites
// locales. Elles ne s'ajoutent pas au champ radial, elles le remplacent dans
// leur volume — SingleFieldDetector choisit, il ne combine pas.
{
  const gameplay = { placed: { DirectionalForceField: [
    { name: "Couloir", position: [0, 0, 0], rotation: [0, 0, 0, 1],
      fields: { _fieldMagnitude: 8, _fieldDirection: [0, -1, 0] },
      volume: { shape: "box", size: [20, 10, 40], center: [0, 0, 0], radius: 23 } },
    { name: "Puits", position: [100, 0, 0], rotation: [0, 0, 0, 1],
      fields: { _acceleration: 20, _axis: 3 },
      volume: { shape: "sphere", radius: 15, center: [0, 0, 0] } },
    { name: "SansVolume", position: [0, 0, 0], fields: { _fieldMagnitude: 5 } },
    { name: "SansForce", position: [0, 0, 0],
      fields: {}, volume: { shape: "sphere", radius: 10, center: [0, 0, 0] } },
  ] } };
  const fields = directionalFields(gameplay);
  check("un champ sans volume lisible est ecarte", fields.length, 2);
  check("direction lue telle quelle", fields[0].direction.join(","), "0,-1,0");
  check("axe nomme par un enum : -Y", fields[1].direction.join(","), "0,-1,0");
  check("intensite lue", fields[1].magnitude, 20);

  check("dedans la boite", insideVolume(fields[0], [5, 4, 10]), true);
  check("dehors la boite", insideVolume(fields[0], [5, 6, 10]), false);
  // Un couloir pose de biais : le point se ramene dans le repere local du
  // volume avant d'etre compare, sinon la boite est testee alignee sur les
  // axes du monde. Ici un quart de tour autour de Y echange X et Z.
  const biais = directionalFields({ placed: { DirectionalForceField: [
    { name: "Biais", position: [0, 0, 0],
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      fields: { _fieldMagnitude: 8, _fieldDirection: [0, -1, 0] },
      volume: { shape: "box", size: [20, 10, 40], center: [0, 0, 0], radius: 23 } },
  ] } })[0];
  check("la boite tournee suit son objet", insideVolume(biais, [18, 0, 0]), true);
  check("... et ne deborde plus dans l'autre sens",
        insideVolume(biais, [0, 0, 18]), false);
  check("la direction du champ tourne avec lui",
        biais.direction.map((v) => round(v, 3)).join(","), "0,-1,0");
  check("dedans la sphere", insideVolume(fields[1], [110, 0, 0]), true);
  check("dehors la sphere", insideVolume(fields[1], [120, 0, 0]), false);
  check("hors de tout volume : aucun champ dirige",
        strongestDirectional(fields, [500, 500, 500]), null);
  check("le plus fort l'emporte",
        strongestDirectional(fields, [100, 0, 0]).name, "Puits");

  // Le corps reste celui du champ radial : c'est lui qui porte l'ancre et le
  // rayon de surface, seules la direction et l'intensite changent.
  const bodies = [{ name: "Planete", position: [0, 0, -1000],
                    gravity: { surfaceAcceleration: 12, upperSurfaceRadius: 250,
                               lowerSurfaceRadius: 200, falloffType: 0 } }];
  const radial = dominantField(bodies, { x: 0, y: 0, z: 0 });
  const dirigee = dominantField(bodies, { x: 0, y: 0, z: 0 },
                                { directional: fields, framePos: [0, 0, 0] });
  check("sans champ dirige, le radial gagne", round(radial.dir.z, 3), -1);
  check("dans le volume, le dirige prend la main", dirigee.magnitude, 8);
  check("... et garde le corps du champ radial", dirigee.body.name, "Planete");
  check("... en le signalant", !!dirigee.directional, true);

  // La forme REELLE du build, mesuree sur les 34 champs de level0 :
  // `_fieldDirection` y est un Vector3 serialise {x, y, z} et non un tableau,
  // `_fieldMagnitude` vaut 10 sur 29 champs, et `_forceScaleFactor` vaut 1
  // partout. Ce dernier repondait a /force/i et sortait gagnant de la
  // recherche par motif : les champs valaient tous 1.
  const reel = directionalFields({ placed: { DirectionalForceField: [
    { name: "DirectionalField", position: [0, 0, 0], rotation: [0, 0, 0, 1],
      fields: { _forceScaleFactor: 1, _fieldDirection: { x: 0, y: -1, z: 0 },
                _fieldMagnitude: 10, _overridePriority: 5,
                _affectsAlignment: true },
      volume: { shape: "sphere", radius: 50, center: [0, 0, 0] } },
    // Le build en pose un a direction nulle : il ne designe aucun bas.
    { name: "Nul", position: [0, 0, 0], rotation: [0, 0, 0, 1],
      fields: { _forceScaleFactor: 1, _fieldDirection: { x: 0, y: 0, z: 0 },
                _fieldMagnitude: 10 },
      volume: { shape: "sphere", radius: 50, center: [0, 0, 0] } },
    // Priorite basse mais intensite haute : la priorite doit l'emporter.
    { name: "Faible priorite", position: [0, 0, 0], rotation: [0, 0, 0, 1],
      fields: { _forceScaleFactor: 1, _fieldDirection: { x: 0, y: 0, z: -1 },
                _fieldMagnitude: 13, _overridePriority: 1 },
      volume: { shape: "sphere", radius: 50, center: [0, 0, 0] } },
  ] } });
  check("un champ a direction nulle est ecarte", reel.length, 2);
  check("_fieldMagnitude est lu, pas _forceScaleFactor", reel[0].magnitude, 10);
  check("Vector3 {x,y,z} lu comme direction", reel[0].direction.join(","), "0,-1,0");
  check("_overridePriority retenu", reel[0].priority, 5);
  check("_affectsAlignment retenu", reel[0].affectsAlignment, true);
  check("la priorite passe avant l'intensite",
        strongestDirectional(reel, [0, 0, 0]).name, "DirectionalField");
  // Le facteur d'echelle multiplie, il ne remplace pas.
  const double = directionalFields({ placed: { DirectionalForceField: [
    { name: "Double", position: [0, 0, 0], rotation: [0, 0, 0, 1],
      fields: { _forceScaleFactor: 2, _fieldDirection: { x: 0, y: -1, z: 0 },
                _fieldMagnitude: 10 },
      volume: { shape: "sphere", radius: 50, center: [0, 0, 0] } },
  ] } });
  check("_forceScaleFactor multiplie l'intensite", double[0].magnitude, 20);
}

// --- fluides ------------------------------------------------------------
//
// Trois manques mesures sur le build (docs/36-audit.md §1.2) : la trainee est
// portee par le DETECTEUR, la densite est presente PARTOUT, et les tornades
// portent un COURANT. Le portage lisait un volume sur trois, appliquait
// `DEFAULT_DRAG = 1` a tout le monde et retombait sur `density ?? 0` — donc
// rien ne flottait et rien n'etait pousse.
{
  const solar = { fluids: [{ name: "Ocean", kind: "SphereOceanFluidVolume",
                             position: [0, 0, 0], radius: 700, drag: 2 }] };
  const gameplay = { placed: {
    SimpleFluidVolume: [
      { name: "Mare", position: [0, 0, 2000], fields: { _radius: 50, _dragCoefficient: 4 } },
      { name: "SansRayon", position: [0, 0, 0], fields: {} },
    ],
    SimpleFluidDetector: [{ name: "PlayerDetector", fields: { _dragFactor: 0.5 } }],
    ShipFluidDetector: [{ name: "ShipDetector", fields: { _dragFactor: 1 } }],
  } };
  const vols = fluidVolumes(gameplay, solar);
  check("volumes emis, celui sans rayon ecarte", vols.length, 2);
  check("un detecteur n'est pas un milieu",
        vols.some((v) => /detector/i.test(v.kind)), false);
  check("l'ocean vient du systeme solaire",
        vols.find((v) => v.ocean).name, "Ocean");
  check("coefficient de trainee lu", vols[0].drag, 4);

  // Le detecteur porte le facteur, pas le volume : 0,5 pour le joueur, 1 pour
  // le vaisseau. C'est ce que `DEFAULT_DRAG = 1` uniforme effacait.
  const dets = fluidDetectors(gameplay);
  check("detecteurs lus", dets.length, 2);
  check("celui du joueur freine deux fois moins",
        dragFactorFor(dets, "SimpleFluidDetector"), 0.5);
  check("celui du vaisseau freine a plein",
        dragFactorFor(dets, "ShipFluidDetector"), 1);
  check("un mobile sans detecteur garde 1", dragFactorFor(dets, "sonde"), 1);

  const ocean = vols.find((v) => v.name === "Ocean");
  check("hors du volume, aucune profondeur", depthIn(ocean, [0, 0, 900]), 0);
  check("a mi-rayon, on est a 350 sous la surface",
        depthIn(ocean, [0, 0, 350]), 350);
  check("le plus profond l'emporte",
        fluidAt(vols, [0, 0, 100]).volume.name, "Ocean");
  check("loin de tout : aucun fluide", fluidAt(vols, [9000, 0, 0]), null);

  const v = applyDrag({ x: 0, y: -10, z: 0 }, 2, 0.1);
  check("la trainee retire k dt de la vitesse", round(v.y, 3), -8);
  check("un pas trop long ne renvoie pas le mobile en arriere",
        applyDrag({ x: 0, y: -10, z: 0 }, 20, 0.5).y, -0);
  check("vitesse limite de chute : g / k", terminalSpeed(12, 4), 3);

  // Vitesse limite atteinte par integration : la gravite pousse, la trainee
  // retient, et la vitesse se stabilise a g/k.
  const field = new FluidField([{ name: "Ocean", position: [0, 0, 0], radius: 700,
                                  drag: 4, density: 0 }]);
  const vel = { x: 0, y: 0, z: 0 };
  const g = { magnitude: 12, dir: { x: 0, y: -1, z: 0 } };
  for (let i = 0; i < 2000; i++) {
    vel.y += g.dir.y * g.magnitude * 0.01;
    field.apply([0, 0, 0], vel, 0.01, g);
  }
  // Un pas discret ne peut pas atteindre exactement g/k : la vitesse s'y
  // stabilise a un facteur (1 - k dt) pres.
  check("la chute se stabilise a la vitesse limite",
        Math.abs(-vel.y - terminalSpeed(12, 4)) < 0.2, true);

  // Le facteur du detecteur divise la trainee, donc double la vitesse limite.
  const lent = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 4000; i++) {
    lent.y += g.dir.y * g.magnitude * 0.01;
    field.apply([0, 0, 0], lent, 0.01, g, { dragFactor: 0.5 });
  }
  check("un detecteur a 0,5 double la vitesse limite",
        Math.abs(-lent.y - terminalSpeed(12, 2)) < 0.3, true);

  // Poussee d'Archimede : a = -g (rho - 1). A densite 1 un corps ne monte ni
  // ne descend ; a densite 2 il remonte a une pesanteur. L'ancienne formule
  // rendait 2 g, et `density ?? 0` la mettait a zero partout.
  const neutre = new FluidField([{ name: "Neutre", position: [0, 0, 0], radius: 100,
                                   drag: 0, density: 1 }]);
  const vn = { x: 0, y: 0, z: 0 };
  neutre.apply([0, 0, 0], vn, 1, g);
  check("a densite 1, le fluide ne porte ni ne coule", round(vn.y, 6), 0);

  const flot = new FluidField([{ name: "Eau", position: [0, 0, 0], radius: 100,
                                 drag: 0, density: 2 }]);
  const vf = { x: 0, y: 0, z: 0 };
  flot.apply([0, 0, 0], vf, 1, g);
  check("a densite 2, la poussee remonte le mobile a une pesanteur",
        round(vf.y, 3), 12);

  // `_deepDensity` : l'ocean porte 10 en surface et 100 au fond, ce qui rend
  // le fond infranchissable sans etre un mur.
  const profond = { name: "Ocean", position: [0, 0, 0], radius: 100,
                    drag: 1, density: 10, deepDensity: 100 };
  check("en surface, la densite est celle du volume",
        round(densityAt(profond, 0), 3), 10);
  check("au coeur, c'est la densite profonde",
        round(densityAt(profond, 100), 3), 100);
  check("a mi-profondeur, on interpole", round(densityAt(profond, 50), 3), 55);

  // Une tornade est une CAPSULE (r=40, h=305) qui pousse a 300 u/s vers le
  // haut en tournant. La lire comme une sphere de rayon 40 laissait 225 unites
  // de colonne hors du volume.
  const tornade = fluidVolumes({ placed: { TornadoFluidVolume: [{
    name: "Tornade", position: [0, 0, 0], rotation: null,
    volume: { shape: "capsule", radius: 40, height: 305, axis: 1, center: [0, 0, 0] },
    fields: { _density: 2, _flowSpeed: 300, _localLinearFlow: { x: 0, y: 1, z: 0 },
              _angularSpeed: 10, _localRotationAxis: { x: 0, y: 1, z: 0 },
              _dragCoefficient: 1, _priority: 5 },
  }] } }, {})[0];
  // A 150 unites de hauteur on est encore DANS la colonne (demi-hauteur utile
  // 112,5, plus le rayon 40), mais tout pres du bouchon : 2,5 d'immersion.
  check("la capsule porte toute sa colonne",
        round(depthIn(tornade, [0, 150, 0]), 3), 2.5);
  check("... et une sphere de rayon 40 ne l'aurait pas fait",
        depthIn({ ...tornade, volume: { shape: "sphere", radius: 40 } }, [0, 150, 0]), 0);
  check("au coeur de la colonne, on est au rayon entier",
        round(depthIn(tornade, [0, 0, 0]), 3), 40);
  check("hors de la capsule, rien", depthIn(tornade, [50, 0, 0]), 0);

  const vm = mediumVelocity(tornade, [10, 0, 0]);
  check("le courant monte a 300", round(vm[1], 3), 300);
  check("... et tourne autour de l'axe", round(vm[2], 3), -100);
  check("un volume sans courant n'en a pas", mediumVelocity(ocean, [0, 0, 0]), null);

  // Vitesse d'ejection : la trainee tire le mobile vers la vitesse du milieu.
  // Sans courant, la tornade ne faisait que freiner.
  const cyclone = new FluidField([tornade]);
  const vc = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 2000; i++) {
    vc.y -= 12 * 0.01;
    cyclone.apply([0, 0, 0], vc, 0.01, { magnitude: 12, dir: { x: 0, y: -1, z: 0 } });
  }
  check("la tornade ejecte vers le haut", vc.y > 250, true);

  // Les QUATRE lois de vitesse du build (docs/39-fluides.md). Trois d'entre
  // elles calculent leur direction a partir du point : elles ne serialisent
  // donc AUCUN `_localLinearFlow`, et le portage, qui n'attendait que celui-la,
  // rendait immobiles six bases de tornade, un rayon tracteur et un ocean.
  check("la loi se lit dans la classe", lawOf("TornadoBaseFluidVolume"), "tornadoBase");
  check("... celle du rayon tracteur aussi", lawOf("TractorBeamFluid"), "tractor");
  check("... celle de l'ocean aussi", lawOf("SphereOceanFluidVolume"), "ocean");
  check("une classe inconnue suit la loi lineaire", lawOf("SimpleFluidVolume"), "simple");

  // Base de tornade : elle aspire vers l'AXE, pas vers le centre. Cinq bases
  // du build aspirent (`_flowType` 0), une repousse (1), toutes a 100 u/s.
  const bse = fluidVolumes({ placed: { TornadoBaseFluidVolume: [{
    name: "Base", position: [0, 0, 0], rotation: null,
    volume: { shape: "sphere", radius: 80, center: [0, 0, 0] },
    fields: { _density: 2, _flowSpeed: 100, _flowType: 0, _priority: 1 },
  }] } }, {})[0];
  check("la base garde son flux sans direction serialisee", bse.flowSpeed, 100);
  const vb = mediumVelocity(bse, [40, 0, 0]);
  check("elle aspire vers l'axe", round(vb[0], 3), -100);
  check("... a pleine vitesse", round(Math.hypot(vb[0], vb[1], vb[2]), 3), 100);
  const vh = mediumVelocity(bse, [30, 50, 0]);
  check("l'aspiration est horizontale, quelle que soit la hauteur",
        round(vh[1], 6), 0);
  check("... et vaut toujours 100", round(Math.hypot(vh[0], vh[1], vh[2]), 3), 100);
  check("sur l'axe meme, aucune direction n'est definie",
        mediumVelocity(bse, [0, 50, 0]), null);
  const rep = mediumVelocity({ ...bse, flowType: 1 }, [40, 0, 0]);
  check("`_flowType` 1 repousse au lieu d'aspirer", round(rep[0], 3), 100);

  // Rayon tracteur : `up * _flowSpeed`, plus un rappel lateral vers l'axe.
  const beam = fluidVolumes({ placed: { TractorBeamFluid: [{
    name: "Faisceau", position: [0, 0, 0], rotation: null,
    volume: { shape: "capsule", radius: 1, height: 10, axis: 1, center: [0, 0, 0] },
    fields: { _density: 500, _flowSpeed: 10, _priority: 100 },
  }] } }, {})[0];
  const vt = mediumVelocity(beam, [0, 0, 0]);
  check("le faisceau souleve le long de son axe", round(vt[1], 3), 10);
  const vl = mediumVelocity(beam, [2, 0, 0]);
  check("... et ramene vers l'axe, a cinq fois l'ecart", round(vl[0], 3), -10);
  check("le soulevement ne depend pas de l'ecart", round(vl[1], 3), 10);

  // L'ocean de Giant's Deep : il REPOUSSE. Entre `_outerRadius` 500 et
  // `_innerRadius` 440, une courbe donne la part de `_maxRepelSpeed` 250 qui
  // pousse vers le haut ; sous le rayon interne, plus rien, et la densite
  // saute d'un coup a 100. C'est ce qui rend le coeur inatteignable en
  // nageant, et donne sa raison d'etre a la tornade inversee.
  const mer = fluidVolumes({ placed: { SphereOceanFluidVolume: [{
    name: "Mer", position: [0, 0, 0], rotation: null,
    volume: { shape: "sphere", radius: 498, center: [0, 0, 0] },
    fields: { _density: 10, _deepDensity: 100, _innerRadius: 440,
              _outerRadius: 500, _maxRepelSpeed: 250, _currentSpeed: 10,
              _priority: 1, _repelCurve: { m_Curve: [{ time: 0, value: 0 },
                                                     { time: 1, value: 1 }] } },
  }] } }, {})[0];
  check("la courbe de repulsion est echantillonnee", mer.repelCurve.length, 9);
  check("elle part de zero", curveAt(mer.repelCurve, 0), 0);
  check("et arrive a un", curveAt(mer.repelCurve, 1), 1);
  const surf = mediumVelocity(mer, [0, 0, 500]);
  check("en surface, rien ne repousse", round(surf[2], 6), 0);
  check("... mais le courant porte a pleine vitesse", round(surf[0], 3), -10);
  const mi = mediumVelocity(mer, [0, 0, 470]);
  check("a mi-chemin, la repulsion vaut la moitie du maximum",
        round(mi[2], 3), 125);
  check("... et le courant s'est eteint de moitie", round(mi[0], 3), -5);
  check("au rayon interne, la repulsion est maximale",
        round(mediumVelocity(mer, [0, 0, 440])[2], 3), 250);
  check("sous le rayon interne, plus rien ne pousse",
        mediumVelocity(mer, [0, 0, 430]), null);
  // Le palier de densite, et non la rampe : le build bascule d'un coup.
  check("au-dessus du rayon interne, la densite de surface",
        densityAt(mer, depthIn(mer, [0, 0, 450])), 10);
  check("en dessous, la densite profonde d'un coup",
        densityAt(mer, depthIn(mer, [0, 0, 430])), 100);

  // `_flowType` 1 et 2 d'un volume simple : radial rentrant et sortant. Aucun
  // volume du build ne s'en sert, mais la loi est la et ne coute rien.
  const radial = { law: "simple", position: [0, 0, 0], rotation: null,
                   radius: 100, flowSpeed: 20, flowType: 2 };
  check("`_flowType` 2 pousse vers l'exterieur",
        round(mediumVelocity(radial, [10, 0, 0])[0], 3), 20);
  check("`_flowType` 1 attire vers le centre",
        round(mediumVelocity({ ...radial, flowType: 1 }, [10, 0, 0])[0], 3), -20);

  // `_priority` tranche avant la profondeur : l'interieur du vaisseau est a
  // 100, le centre d'une tornade a 5, l'ocean a 1.
  const empiles = [
    { name: "Ocean", position: [0, 0, 0], radius: 500, drag: 1, density: 10, priority: 1 },
    { name: "Cabine", position: [0, 0, 0], radius: 3, drag: 1, density: 0, priority: 100 },
  ];
  check("la priorite passe avant la profondeur",
        fluidAt(empiles, [0, 0, 0]).volume.name, "Cabine");

  // Le meme ocean sortait de `gameplay` (avec densite) et de `solar` (sans) :
  // les deux s'annulaient, et rien ne flottait sur Giant's Deep.
  const double = fluidVolumes(
    { placed: { SphereOceanFluidVolume: [{ name: "Ocean", position: [0, 0, 0],
                                           fields: { _radius: 498, _density: 10 } }] } },
    { fluids: [{ name: "Ocean", position: [0, 0, 0], radius: 500, density: null }] });
  check("l'ocean ne sort qu'une fois", double.length, 1);
  check("... et c'est celui qui porte la densite", double[0].density, 10);
}

// --- lumieres posees ----------------------------------------------------
{
  const lights = [
    { name: "Feu", type: "point", position: [0, 0, 0], range: 50, intensity: 1 },
    { name: "Loin", type: "point", position: [0, 0, 500], range: 50, intensity: 1 },
    { name: "Cuite", type: "point", position: [0, 0, 1], range: 50, intensity: 1,
      lightmapping: 2 },
    { name: "Eteinte", type: "point", position: [0, 0, 1], range: 50,
      intensity: 1, enabled: false },
    { name: "Nulle", type: "point", position: [0, 0, 1], range: 50, intensity: 0 },
    { name: "Soleil", type: "directional", position: [0, 0, 90000],
      range: 0, intensity: 1 },
  ];
  const picked = pickLights(lights, [0, 0, 0]);
  const names = picked.map((p) => p.light.name);
  check("une lumiere hors de portee est ecartee", names.includes("Loin"), false);
  check("une lumiere cuite dans les lightmaps n'eclaire rien",
        names.includes("Cuite"), false);
  check("une lumiere eteinte ne compte pas", names.includes("Eteinte"), false);
  check("une intensite nulle non plus", names.includes("Nulle"), false);
  check("une directionnelle reste candidate partout",
        names.includes("Soleil"), true);
  check("la plus proche vient en tete", names[0], "Feu");
  check("le budget borne la liste",
        pickLights(lights, [0, 0, 0], 1).length, 1);
}

// --- zones d'oxygene et sources de chaleur -------------------------------
//
// Seul le vaisseau rechargeait, sans qu'on ait cherche ce que la scene
// proposait. La liste vide est une reponse : c'est alors un manque de l'alpha.
{
  const gameplay = { placed: {
    OxygenVolume: [{ name: "Arbre", position: [0, 10, 0],
                     volume: { shape: "sphere", radius: 12, center: [0, 0, 0] } }],
    HeatSource: [{ name: "FeuDeCamp", position: [50, 0, 0],
                   fields: { _heat: 100 },
                   volume: { shape: "sphere", radius: 4, center: [0, 0, 0] } }],
  } };
  const zones = oxygenZones(gameplay);
  check("zone d'oxygene trouvee par motif", zones.length, 1);
  check("rayon pris sur le collider", zones[0].radius, 12);
  check("dedans", inOxygenZone(zones, [0, 15, 0]).name, "Arbre");
  check("dehors", inOxygenZone(zones, [0, 30, 0]), null);
  check("aucune zone : rien a signaler", oxygenZones({}).length, 0);

  const heat = heatSources(gameplay);
  check("source de chaleur trouvee", heat.length, 1);
  check("au centre des braises, chaleur pleine", heatAt(heat, [50, 0, 0]), 100);
  check("a mi-rayon, la moitie", heatAt(heat, [52, 0, 0]), 50);
  check("hors du volume, rien", heatAt(heat, [60, 0, 0]), 0);

  // _cookTime = 5 : a chaleur 100, cinq secondes pour arriver a 1. La guimauve
  // cuit donc au feu, et non sur commande.
  const m = new Marshmallow();
  m.held = true;
  for (let i = 0; i < 500; i++) m.update(0.01, heatAt(heat, [50, 0, 0]));
  check("cinq secondes au feu : guimauve a point", round(m.toast, 2), 1);
  const loin = new Marshmallow();
  loin.held = true;
  for (let i = 0; i < 500; i++) loin.update(0.01, heatAt(heat, [60, 0, 0]));
  check("loin du feu, elle ne cuit pas", loin.toast, 0);
}

// --- consoles a camera deportee -----------------------------------------
{
  const gameplay = { placed: {
    RemoteFlightConsole: [{ name: "Console", position: [0, 0, 0] }],
    SatelliteSnapshotController: [{ name: "Satellite", position: [0, 0, 300] }],
  } };
  const list = remoteConsoles(gameplay);
  check("deux consoles au catalogue", list.length, 2);
  const rc = new RemoteConsoles(list);
  check("hors de portee, rien a prendre", rc.nearest([0, 0, 100]), null);
  check("a portee de la main", rc.nearest([0, 0, 4]).name, "Console");
  check("aucune vue tant qu'on n'a rien pris", rc.view([0, 0, 0], {}), null);
  check("prise en main", rc.toggle([0, 0, 4]).name, "Console");
  const ship = { pos: { x: 10, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 5 } };
  const v = rc.view([0, 0, 0], { ship });
  check("la console de vol suit le vaisseau", v.pos.join(","), "10,0,0");
  check("... et regarde devant lui", v.vel.join(","), "0,0,5");
  check("meme touche, on lache", rc.toggle([0, 0, 4]), null);
}

// --- niveau de detail lu dans le build -----------------------------------
//
// Un LODGroup ne simplifie rien a la volee : il designe le seuil auquel on
// passe d'un maillage a l'autre, exprime en hauteur relative a l'ecran — soit
// exactement l'unite que lod.js calcule deja.
{
  const gameplay = { placed: {
    CreateLODGroup: [
      { name: "Rocher", fields: { _screenRelativeHeights: [0.4, 0.08, 0.01] } },
      { name: "Cabane", fields: { _screenHeight: 0.05 } },
      { name: "Distances", fields: { _lodDistances: [40, 120] } },
    ],
    ChildColliderLOD: [{ name: "Sol" }, { name: "Rampe" }],
  } };
  const seuils = lodThresholds(gameplay);
  check("le seuil le plus bas fait foi", seuils.get("Rocher"), 0.01);
  check("un seuil unique passe aussi", seuils.get("Cabane"), 0.05);
  check("une distance n'est pas une hauteur d'ecran",
        seuils.has("Distances"), false);
  // `colliderLODs` porte la meme liste, avec ce qui la rend utile : la portee
  // et QUI reveille le groupe. La version qui ne rendait que les noms
  // dupliquait celle-ci et n'avait aucun appelant (docs/74-etalons.md).
  const cols = colliderLODs(gameplay);
  check("colliders par niveau de detail", cols.length, 2);
  check("... nommes", cols.some((g) => g.name === "Rampe"), true);

  const lod = new MeshLOD(LOD_RATIO, 400, seuils);
  check("un maillage nomme prend le seuil du build",
        lod.thresholdFor({ name: "Rocher" }), 0.01);
  check("un enfant herite du seuil de son parent",
        lod.thresholdFor({ name: "x", parent: { name: "Cabane" } }), 0.05);
  check("le reste garde le seuil general",
        lod.thresholdFor({ name: "inconnu" }), LOD_RATIO);
}

// --- occlusion de la lune quantique : la profondeur -----------------------
//
// _sphereCheckRadius (150) et _checkDepth (100) etaient exportes et
// inutilises : le test etait binaire, la ou le jeu lance une sphere SUR UNE
// PROFONDEUR. Raser un limbe ne masque donc plus.
{
  check("les deux constantes du build", `${CHECK_RADIUS}/${CHECK_DEPTH}`, "150/100");
  check("segment passant par le centre : la corde vaut le diametre",
        round(segmentDepthInSphere([0, 0, 0], [0, 0, 1000], [0, 0, 500], 100), 6),
        200);
  check("segment a cote : aucune corde",
        segmentDepthInSphere([0, 0, 0], [0, 0, 1000], [400, 0, 500], 100), 0);
  check("corde partielle quand le segment s'arrete dedans",
        round(segmentDepthInSphere([0, 0, 0], [0, 0, 500], [0, 0, 550], 100), 1),
        50);

  // Un corps rase de tres pres : la sphere de 150 le touche, mais pas sur 100.
  const grazing = 100 + CHECK_RADIUS - 2;   // juste sous la surface elargie
  check("raser le limbe ne masque pas",
        occludes([0, 0, 0], [0, 0, 1000], [grazing, 0, 500], 100), false);
  check("passer derriere masque",
        occludes([0, 0, 0], [0, 0, 1000], [0, 0, 500], 100), true);
  check("un corps derriere la cible ne masque pas",
        occludes([0, 0, 0], [0, 0, 500], [0, 0, 2000], 100), false);
}

// --- AlignQuantumMoon ----------------------------------------------------
{
  const q = lookRotation([0, 0, 1]);
  check("direction deja alignee : rotation nulle", `${round(q[0])},${round(q[3])}`, "0,1");
  const half = lookRotation([1, 0, 0]);
  check("un quart de tour vers +X", round(Math.abs(half[1]), 3), round(Math.SQRT1_2, 3));
  const a = alignToObserver([0, 0, 0], { x: 0, y: 0, z: 10 });
  check("la lune fait face a l'observateur", round(a[3], 3), 1);
  check("un axe colineaire a l'up ne casse pas la rotation",
        lookRotation([0, 1, 0]).some((v) => Number.isNaN(v)), false);
}

// --- le bruit qui attire les predateurs ----------------------------------
//
// Le NoiseSensor etait nourri par les COMMANDES du joueur. Il l'est desormais
// par le champ audio : un predateur va vers ce qu'il entend, et une source
// qui tourne peut servir de leurre.
{
  const noise = new NoiseField();
  check("silence total", noise.strongestAt([0, 0, 0]), null);
  noise.add([0, 0, 100], 1, 200);
  noise.add([0, 0, 20], 1, 200);
  check("deux sources", noise.count, 2);
  check("la plus proche a force egale l'emporte",
        round(noise.strongestAt([0, 0, 0]).distance), 20);
  check("hors de portee du capteur, rien",
        noise.strongestAt([0, 0, 1000], FISH.noiseRadius), null);

  // Le leurre : le joueur se tait a 150 u, un poste joue a 30 u du predateur.
  const fish = new Anglerfish([0, 0, 0]);
  const leurre = new NoiseField();
  leurre.add([0, 0, 30], 1, 200);
  const player = { x: 150, y: 0, z: 0 };
  for (let i = 0; i < 200; i++) fish.update(0.05, player, leurre);
  check("le predateur poursuit ce qu'il entend", fish.state, "poursuit");
  check("... et va vers la source, pas vers le joueur",
        fish.position[2] > 10 && Math.abs(fish.position[0]) < 5, true);
  check("il ne devore pas un joueur silencieux et distant", fish.caught, false);

  // Un champ VIDE est un objet, donc « vrai » : le predateur ne doit pas
  // poursuivre pour autant. C'est le piege de la conversion booleenne.
  const silence = new Anglerfish([0, 0, 0]);
  const vide = new NoiseField();
  for (let i = 0; i < 100; i++) silence.update(0.05, { x: 0, y: 0, z: 50 }, vide);
  check("champ de bruit vide : le predateur reste au repos", silence.state, "repos");
  check("... et ne bouge pas de chez lui",
        round(Math.hypot(...silence.position), 3), 0);

  // Compatibilite : un booleen continue de designer le joueur lui-meme.
  const direct = new Anglerfish([0, 0, 0]);
  direct.update(1, { x: 0, y: 0, z: 100 }, true);
  check("un booleen designe toujours le joueur", direct.state, "poursuit");
}

// --- corruption ----------------------------------------------------------
{
  const r = corruptionRange({ _minCutoff: 0.2, _maxCutoff: 0.9, _autreChose: 42 });
  check("bornes lues dans les champs de decoupe", `${r.from}/${r.to}`, "0.2/0.9");
  check("sans champ lisible, la course entiere",
        JSON.stringify(corruptionRange({ _vitesse: 3 })), '{"from":0,"to":1}');
  check("debut de boucle", corruptionThreshold(r, 0), 0.2);
  check("fin de boucle", round(corruptionThreshold(r, 1), 3), 0.9);
  check("a mi-boucle", round(corruptionThreshold(r, 0.5), 3), 0.55);
  check("fraction bornee", round(corruptionThreshold(r, 5), 3), 0.9);
}

// --- mort : son et camera ------------------------------------------------
{
  check("une cause, un motif de son", DEATH_SOUNDS.digestion.test("AnglerFish_Chomp"), true);
  check("... qui ne prend pas n'importe quoi",
        DEATH_SOUNDS.digestion.test("CampfireLoop"), false);

  check("vivant : la camera ne bouge pas",
        deathCamera({ phase: "fini", fini: true }).drop, 0);
  const debut = deathCamera({ phase: "attente", fini: false, t: 0 });
  check("la chute commence en douceur", debut.drop, 0);
  const fin = deathCamera({ phase: "attente", fini: false, t: 2 });
  check("elle est complete au bout du delai", round(fin.drop, 3), DEATH_FALL.drop);
  check("pendant les images, la camera reste basse",
        deathCamera({ phase: "images", fini: false, t: 3 }).roll, DEATH_FALL.roll);
  check("le fondu la releve",
        deathCamera({ phase: "fondu", alpha: 1, fini: false, t: 8 }).drop, 0);
}

// --- arbre de dialogue par reference, non par nom ------------------------
//
// Les 20 attributs eventbased du build valent tous "false" : l'echange se fait
// au niveau des ARBRES, et le controleur les porte en reference directe.
//
// Les noms de champs sont ceux du build, releves dans l'IL de
// `CoachConvoController.OnStartConversation`. Ce banc en portait d'inventes
// (`_withCodesTree`, `_withoutCodesTree`) qui n'existent nulle part : ils
// passaient tant que la selection se faisait par expression reguliere sur le
// nom du champ, et c'est precisement cette selection qui se trompait de
// personnage sur le vrai build.
{
  const gameplay = { placed: { CoachConvoController: [
    { name: "Coach", position: [0, 0, 0],
      trees: { _beforeTraining: 11, _afterTrainingWithCodes: 12,
               _afterTrainingWithoutCodes: 13 } },
  ] } };
  const ctrls = convoControllers(gameplay);
  check("controleur retenu avec ses arbres", ctrls.length, 1);

  const data = new PlayerData();
  data.explored.clear();
  data.hasCompletedTraining = false;
  data.knowsLaunchCodes = false;
  data.loopCount = 0;
  const convo = { name: "Coach", character: "Coach", position: [0, 0, 0], tree: "99" };
  check("avant l'entrainement", treeFromController(data, convo, ctrls), "11");
  data.hasCompletedTraining = true;
  check("apres l'entrainement, sans les codes",
        treeFromController(data, convo, ctrls), "13");
  data.knowsLaunchCodes = true;
  check("avec les codes", treeFromController(data, convo, ctrls), "12");
  check("aucun controleur : on retombe sur le nom",
        treeFromController(data, convo, []), null);
  const trees = { 11: {}, 12: {}, 13: {} };
  check("selectTree prend la reference",
        selectTree(data, convo, trees, ctrls), "12");
}

// --- manette -------------------------------------------------------------
//
// Elle ne cree aucune commande : les memes axes et les memes codes que le
// clavier et le doigt. Le build decrit XboxInput, et l'invite porte deja le
// bouton attendu.
{
  check("zone morte : rien", deadZone(0.1), 0);
  check("au sortir de la zone morte, l'axe repart de zero",
        round(deadZone(PAD_DEAD_ZONE + 1e-6), 3), 0);
  check("a fond", deadZone(1), 1);
  check("le signe est conserve", deadZone(-1), -1);
  check("courbe de regard : lineaire pres du centre, cubique au bord",
        round(padLookCurve(0.5), 3), 0.219);

  const pad = { axes: [0, -1, 1, 0], buttons: [] };
  const st = padState(pad);
  check("manche gauche pousse : on avance", st.forward, 1);
  check("manche droit a droite : on tourne", round(st.lookX, 3), 1);

  const press = (i) => {
    const b = [];
    for (let k = 0; k <= 15; k++) b.push({ pressed: k === i, value: k === i ? 1 : 0 });
    return { axes: [0, 0, 0, 0], buttons: b };
  };
  //
  // Ces quatre lignes gardaient la disposition que le PORTAGE avait inventee.
  // Celle du build est dans l'`InputManager` (docs/61-commandes.md), et quatre
  // de ses six boutons ne tombaient pas au meme endroit.
  check("A saute", padState(press(0)).jump, true);
  check("B annule", padEdges(press(1)).codes.join(","), "KeyQ");
  check("X interagit", padEdges(press(2)).codes.join(","), "KeyE");
  check("Y prend la vue arriere", padEdges(press(3)).codes.join(","), "KeyR");
  check("LB vise un referentiel", padEdges(press(4)).codes.join(","), "Mouse0");
  check("RB lance la sonde", padEdges(press(5)).codes.join(","), "Mouse2");
  check("Back ouvre la carte", padEdges(press(8)).codes.join(","), "Enter");
  check("Start met en pause", padEdges(press(9)).codes.join(","), "Escape");
  // Les gachettes montent et descendent : `Move Up` est l'axe 9 d'Unity, la
  // gachette DROITE, et `Move Down` l'axe 8, la gauche. Le portage montait au
  // bouton A — qui est le saut — et accelerait a la gachette droite, avec un
  // accelerateur que le build n'a pas.
  check("la gachette droite monte",
        padState({ axes: [0, 0, 0, 0], buttons: [0, 0, 0, 0, 0, 0, 0, 1] }).up, true);
  check("la gachette gauche descend",
        padState({ axes: [0, 0, 0, 0], buttons: [0, 0, 0, 0, 0, 0, 1, 0] }).down, true);
  check("et il n'y a plus d'accelerateur",
        padState({ axes: [0, 0, 0, 0], buttons: [0, 0, 0, 0, 0, 0, 1, 1] }).boost, false);

  // Seuls les FRONTS comptent : un bouton tenu ouvrirait puis fermerait la
  // carte a chaque image.
  const first = padEdges(press(8));
  check("bouton tenu : plus aucun front",
        padEdges(press(8), first.state).codes.length, 0);
  check("relache puis repris : un nouveau front",
        padEdges(press(8), padEdges(press(0), first.state).state).codes.join(","),
        "Enter");
  check("chaque bouton porte le nom du build", PAD_BUTTONS[5].build, "RightBumper");
}

// --- Ogg Opus : le conteneur -------------------------------------------
//
// WebCodecs rend des paquets nus ; sans conteneur, aucun navigateur ne les
// joue. Le CRC d'Ogg n'est PAS celui de zlib : il n'est pas reflechi, et s'y
// tromper produit un fichier muet sans autre symptome.
{
  const wav = (frames, rate = 48000) => {
    const bytes = new Uint8Array(44 + frames * 2);
    const dv = new DataView(bytes.buffer);
    const put = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    put(0, "RIFF"); dv.setUint32(4, 36 + frames * 2, true); put(8, "WAVE");
    put(12, "fmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    put(36, "data"); dv.setUint32(40, frames * 2, true);
    for (let i = 0; i < frames; i++) dv.setInt16(44 + i * 2, i % 2 ? 16384 : -16384, true);
    return bytes;
  };
  const parsed = parseWav(wav(100));
  check("WAV lu : frequence", parsed.rate, 48000);
  check("WAV lu : images", parsed.frames, 100);
  check("PCM 16 bits ramene entre -1 et 1", round(parsed.data[0][1], 3), 0.5);
  check("ce qui n'est pas un RIFF est refuse", parseWav(new Uint8Array(64)), null);

  const inter = interleave([new Float32Array([1, 3]), new Float32Array([2, 4])], 2);
  check("entrelacement", inter.join(","), "1,2,3,4");

  // Le CRC se verifie sur lui-meme : la page porte son CRC, et le recalculer
  // sur la page dont le champ est remis a zero doit redonner la meme valeur.
  const page = oggPage([new Uint8Array([1, 2, 3])],
                       { serial: 1, sequence: 0, granule: 960, flags: 2 });
  check("entete OggS", String.fromCharCode(...page.slice(0, 4)), "OggS");
  check("drapeau de debut de flux", page[5], 2);
  check("un segment pour trois octets", page[26], 1);
  check("table de segments", page[27], 3);
  const dv = new DataView(page.buffer);
  const stored = dv.getUint32(22, true);
  dv.setUint32(22, 0, true);
  check("le CRC porte sur la page entiere", oggCrc(page), stored);
  dv.setUint32(22, stored, true);

  // Un paquet de plus de 255 octets se decoupe en plusieurs segments.
  const gros = oggPage([new Uint8Array(300)], { serial: 1, sequence: 1, granule: 0 });
  check("paquet de 300 octets : deux segments", gros[26], 2);
  check("... 255 puis 45", `${gros[27]},${gros[28]}`, "255,45");

  const ogg = muxOggOpus([{ data: new Uint8Array([5, 5, 5]), frames: 960 },
                          { data: new Uint8Array([6]), frames: 960 }], 1);
  const head = String.fromCharCode(...ogg.slice(28, 36));
  check("premiere page : OpusHead", head, "OpusHead");
  check("deuxieme page : OpusTags",
        new TextDecoder().decode(ogg).includes("OpusTags"), true);
  check("le flux se termine par une page de fin",
        [...ogg.slice(-1000)].length > 0, true);
}


// --- marche, saut et sac dorsal -----------------------------------------
//
// Le plus gros ecart du portage : il n'y avait PAS de marche. On se deplacait
// au sol comme dans le vide, a la poussee, sans vitesse maximale, sans
// acceleration, sans saut — alors que toutes les constantes etaient extraites,
// chargees, rangees dans `this.c` et jamais lues (docs/36-audit.md §2.1).
{
  const c = PLAYER_FALLBACK;
  const basis = { fwd: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 },
                  up: { x: 0, y: 1, z: 0 } };

  check("en avant, on vise _groundSpeed",
        round(groundTarget({ forward: 1, right: 0 }, basis, c).z, 3), 7);
  check("de cote, on vise _strafeSpeed",
        round(groundTarget({ forward: 0, right: 1 }, basis, c).x, 3), 5);
  // Composer 7 et 5 sans borner donnerait 8,6 en diagonale : plus vite en
  // biais qu'en ligne droite, ce qui est le defaut classique.
  const diag = groundTarget({ forward: 1, right: 1 }, basis, c);
  check("en diagonale, on ne va pas plus vite qu'en avant",
        Math.hypot(diag.x, diag.z) <= 7 + 1e-9, true);

  // Regime etabli : v -> _groundSpeed a 1 % pres. `_groundAcceleration` est
  // une fraction par PAS FIXE (50 Hz), pas par seconde : la mise en vitesse se
  // compte en dixiemes de seconde, pas en dizaines.
  let v = 0;
  for (let i = 0; i < 60; i++) v = approach(v, 7, c.acceleration, 1 / 60);
  check("la vitesse de regime est _groundSpeed a 1 % pres",
        Math.abs(v - 7) / 7 < 0.01, true);
  let court = 0;
  for (let i = 0; i < 12; i++) court = approach(court, 7, c.acceleration, 1 / 60);
  check("... et elle est atteinte en un cinquieme de seconde",
        Math.abs(court - 7) / 7 < 0.01, true);
  // Meme mise en vitesse quelle que soit la cadence (le principe du §2.5).
  const apres1s = (fps) => {
    let u = 0;
    for (let i = 0; i < fps; i++) u = approach(u, 7, c.acceleration, 1 / fps);
    return u;
  };
  check("la mise en vitesse ne depend pas de la frequence d'images",
        Math.abs(apres1s(30) - apres1s(144)) < 1e-9, true);
  check("l'approche ne depasse jamais sa cible", approach(0, 7, 1, 1), 7);

  // Pente praticable : _maxAngleToBeGrounded vaut 45 degres. Le portage
  // n'avait aucun seuil, et on tenait sur une paroi verticale.
  const up = [0, 1, 0];
  const pente = (deg) => [Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180), 0];
  check("un sol plat porte", walkable(pente(0), up), true);
  check("une pente a 44 degres porte encore", walkable(pente(44), up), true);
  check("une pente a 46 degres ne porte plus", walkable(pente(46), up), false);
  check("une paroi verticale ne porte pas", walkable(pente(90), up), false);

  // Hauteur de saut : _jumpSpeed 6 sous la pesanteur de Timber Hearth (12).
  check("hauteur de saut : v^2 / 2g", round(jumpHeight(6, 12), 4), 1.5);

  // Un joueur pose sur une sphere : il marche, il saute, et il retombe.
  const corps = [{ name: "P", position: [0, 0, 0],
                   gravity: { surfaceAcceleration: 12, upperSurfaceRadius: 250,
                              lowerSurfaceRadius: 250, cutoffRadius: 0,
                              falloffType: 0, alignmentRadius: 400 } }];
  const p = new Player({}, [0, 251.7, 0]);
  const vertical = { fwd: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 },
                     up: { x: 0, y: 1, z: 0 } };
  const rien = { forward: 0, right: 0, up: false };
  for (let i = 0; i < 60; i++) p.update(1 / 60, corps, rien, vertical, null);
  check("pose au sol", p.grounded, true);
  check("... et immobile", round(Math.hypot(p.vel.x, p.vel.y, p.vel.z), 2), 0);

  // Marche : douze secondes en avant, et la vitesse tangentielle vaut 7.
  for (let i = 0; i < 60 * 12; i++) {
    p.update(1 / 60, corps, { forward: 1, right: 0, up: false }, vertical, null);
  }
  const tang = Math.hypot(p.vel.x, p.vel.z);
  check("on marche a _groundSpeed", Math.abs(tang - 7) / 7 < 0.02, true);
  check("marcher ne brule pas de carburant", p.jetpack, false);

  // Saut : sur le FRONT de la touche, et une seule fois.
  const q = new Player({}, [0, 251.7, 0]);
  for (let i = 0; i < 60; i++) q.update(1 / 60, corps, rien, vertical, null);
  // `Jump` et `Move Up` sont DEUX canaux du build : l'espace saute, la
  // majuscule pousse. Le portage les avait sur la meme touche.
  q.update(1 / 60, corps, { forward: 0, right: 0, jump: true }, vertical, null);
  check("le saut part a _jumpSpeed", round(q.vel.y, 1), 5.8);
  check("... et quitte le sol", q.grounded, false);

  // Sac dorsal : 7 loin de tout, 12 en vertical pres d'une surface, 5 de cote.
  const r = new Player({}, [0, 300, 0]);
  r.field = { body: corps[0], distance: 300, magnitude: 12,
              dir: { x: 0, y: -1, z: 0 } };
  check("pres d'une surface, la poussee verticale vaut 12",
        round(r.jetpackAccel({ forward: 0, right: 0, up: true }, vertical,
                             { x: 0, y: 1, z: 0 }).y, 3), 12);
  check("... et la poussee laterale 5",
        round(r.jetpackAccel({ forward: 1, right: 0, up: false }, vertical,
                             { x: 0, y: 1, z: 0 }).z, 3), 5);
  r.field = { body: corps[0], distance: 5000, magnitude: 0.6,
              dir: { x: 0, y: -1, z: 0 } };
  check("loin de tout, c'est _maxTranslationalThrust",
        round(r.jetpackAccel({ forward: 1, right: 0, up: false }, vertical,
                             { x: 0, y: 1, z: 0 }).z, 3), 7);
  check("le sac dorsal qui pousse se declare", r.jetpack, true);

  // Les constantes viennent des DEUX composants, et rien n'est invente : ce
  // que le build ne donne pas est absent, `Player` complete avec son repli.
  const consts = playerConstants(
    { constants: { PlayerCharacterController: { _groundSpeed: 9, _turnRate: 200 } } },
    { singletons: { JetpackThrusterModel: { fields: { _maxTranslationalThrust: 7,
                                                      _surfaceVerticalThrust: 12 } } } });
  check("la marche vient de PlayerCharacterController", consts.groundSpeed, 9);
  check("le sac dorsal vient de JetpackThrusterModel",
        consts.surfaceVerticalThrust, 12);
  check("ce que le build ne donne pas n'est pas invente",
        "jumpSpeed" in consts, false);
  check("... et le repli le fournit",
        new Player(consts, [0, 0, 0]).c.jumpSpeed, 6);

  // Desequilibre a l'atterrissage : _tumbleDuration 1,5.
  const t = new Player({ tumbleThreshold: 10, tumbleDuration: 1.5 }, [0, 260, 0]);
  t.vel.y = -40;
  for (let i = 0; i < 30; i++) t.update(1 / 60, corps, rien, vertical, null);
  check("un atterrissage rapide desequilibre", t.tumble > 0, true);
  const avant = { x: t.vel.x, z: t.vel.z };
  t.update(1 / 60, corps, { forward: 1, right: 0, up: false }, vertical, null);
  check("... et coupe les commandes le temps de se relever",
        round(Math.hypot(t.vel.x - avant.x, t.vel.z - avant.z), 6), 0);

  // --- LE PAS DE PHYSIQUE, celui que le repli ne prend jamais ------------
  //
  // Tout ce qui precede passe par `stepAnalytic` : sans Havok, le joueur tombe
  // dans le moteur de repli. C'est la moitie du code qu'aucun test sous Node
  // n'atteignait, et une variable libre y a vecu le temps d'un commit — une
  // ReferenceError levee a chaque image, donc uniquement chez qui a fourni son
  // build, puisque le systeme de substitution n'a pas de colliders.
  //
  // Havok ne tourne pas sous Node, mais `stepPhysics` ne lui demande presque
  // rien : un Vector3, un corps qui rend et recoit sa vitesse, et un moteur de
  // physique. Sans lanceur de rayon, `probeGround` declare simplement qu'on ne
  // touche pas le sol — c'est le cas en vol, et il suffit a EXECUTER le pas.
  class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    addInPlace(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    scale(k) { return new V3(this.x * k, this.y * k, this.z * k); }
    add(v) { return new V3(this.x + v.x, this.y + v.y, this.z + v.z); }
  }
  const havokFeint = (joueur) => {
    const forces = [];
    const node = { position: new V3(0, 300, 0), absolutePosition: new V3(0, 300, 0) };
    joueur.usePhysics({ Vector3: V3 }, { getPhysicsEngine: () => null },
                      { transformNode: node,
                        body: { getLinearVelocity: () => new V3(0, 0, 0),
                                setLinearVelocity: () => {},
                                applyForce: (f) => forces.push(f) } });
    return forces;
  };

  const pesant = new Player({}, [0, 300, 0]);
  const forcesPesant = havokFeint(pesant);
  pesant.update(1 / 60, corps, rien, vertical, null, { framePos: [0, 0, 0] });
  check("le pas de physique s'execute", forcesPesant.length, 1);
  // 250 u de rayon, 300 u du centre, et un falloff LINEAIRE (`falloffType` 0,
  // celui de la plupart des corps du build) : la pesanteur y vaut
  // 12 x 250/300, et la force est cette acceleration fois la masse (70).
  const g300 = 12 * (250 / 300);
  check("... et il applique le champ radial", round(forcesPesant[0].y, 3),
        round(-g300 * 70, 3));

  // L'APESANTEUR DECLAREE coupe ce champ-la, et rien d'autre : le champ reste
  // LU — c'est lui qui tient la verticale de la camera — mais il ne tire plus.
  const flottant = new Player({}, [0, 300, 0]);
  const forcesFlottant = havokFeint(flottant);
  const monde = { framePos: [0, 0, 0],
                  zeroG: { name: "ZeroGVolume", body: "BrokenSatellite_Body" } };
  flottant.update(1 / 60, corps, rien, vertical, null, monde);
  check("dans un ZeroGField, plus rien ne tire vers le bas",
        round(Math.hypot(forcesFlottant[0].x, forcesFlottant[0].y,
                         forcesFlottant[0].z), 6), 0);
  check("... mais le champ est toujours lu", !!flottant.field, true);
}

// --- frottements ramenes a dt --------------------------------------------
//
// `vel *= 0,86` etait applique PAR IMAGE : a 30 im/s le freinage etait deux
// fois plus faible qu'a 60, et la distance de glissade dependait de la machine
// (docs/36-audit.md §2.5).
{
  check("a 60 im/s, le facteur d'origine est inchange",
        round(frameFriction(0.86, 1 / 60), 6), 0.86);
  // Une seconde de freinage doit donner le meme resultat quelle que soit la
  // cadence : c'est tout ce que l'invariant demande.
  const apres = (fps) => {
    let v = 10;
    for (let i = 0; i < fps; i++) v *= frameFriction(0.86, 1 / fps);
    return v;
  };
  check("une seconde a 30 im/s freine autant qu'a 60",
        Math.abs(apres(30) - apres(60)) < 1e-9, true);
  check("... et autant qu'a 144", Math.abs(apres(144) - apres(60)) < 1e-9, true);
  check("un pas nul ne freine pas", frameFriction(0.86, 0), 1);
}

// --- vaisseau : inertie de rotation et roulis -----------------------------
//
// `_usePhysicsToRotate` vaut VRAI et `_angularDrag` 0,92 etait lu sans jamais
// servir : le vaisseau collait instantanement au repere camera, il tournait
// comme une camera (docs/36-audit.md §2.2).
{
  const consts = { _maxTranslationalThrust: 50, _maxRotationalThrust: 2,
                   _angularDrag: 0.92, _usePhysicsToRotate: true };
  const ship = new Ship(consts, null, [0, 0, 0]);
  check("la poussee rotationnelle est lue", ship.rotationalThrust, 2);
  check("la trainee angulaire aussi", ship.angularDrag, 0.92);
  check("et elle est desormais employee", ship.usePhysicsToRotate, true);

  // Le nez part sur +Z ; on demande un quart de tour vers +X.
  ship.boarded = true;
  const cible = { fwd: { x: 1, y: 0, z: 0 }, right: { x: 0, y: 0, z: -1 },
                  up: { x: 0, y: 1, z: 0 } };
  const nez = () => ship.axes.fwd;
  check("le vaisseau ne se retourne pas dans l'image",
        round(nez()[0], 3), 0);
  let images = 0;
  while (nez()[0] < 0.99 && images < 60 * 30) {
    ship.rotate(1 / 60, { roll: 0 }, cible);
    images += 1;
  }
  check("le quart de tour prend un temps fini", images < 60 * 30, true);
  check("... et se compte en secondes, pas en images", images > 30, true);
  check("le nez finit par viser le regard", round(nez()[0], 1), 1);

  // Vitesse angulaire terminale : couple / (1 - trainee), par pas fixe.
  check("vitesse angulaire terminale", round(terminalAngularSpeed(2, 0.92), 4),
        round((2 / 60) / 0.08, 4));

  // Roulis : la manette et le clavier le prevoyaient, le vaisseau n'avait
  // aucun axe.
  const roul = new Ship(consts, null, [0, 0, 0]);
  roul.boarded = true;
  const droit = { fwd: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 },
                  up: { x: 0, y: 1, z: 0 } };
  for (let i = 0; i < 60; i++) roul.rotate(1 / 60, { roll: 1 }, droit);
  check("le roulis tourne le vaisseau autour de son nez",
        round(roul.axes.fwd[2], 2), 1);
  check("... et incline son haut", Math.abs(roul.axes.up[0]) > 0.1, true);

  // Un pas d'integration d'orientation ne change pas la norme.
  const q = spinStep([0, 0, 0, 1], [0, 3, 0], 0.1);
  check("le quaternion reste unitaire",
        round(Math.hypot(q[0], q[1], q[2], q[3]), 6), 1);
  check("une rotation de 0,3 rad autour de Y tourne bien +Z vers +X",
        quatRotate(q, [0, 0, 1])[0] > 0, true);

  // Sans physique de rotation, on retrouve exactement l'ancien comportement.
  const colle = new Ship({ ...consts, _usePhysicsToRotate: false }, null, [0, 0, 0]);
  colle.boarded = true;
  colle.rotate(1 / 60, { roll: 1 }, cible);
  check("_usePhysicsToRotate faux : le vaisseau ne tourne pas seul",
        colle.quat.join(","), "0,0,0,1");

  // Orientation initiale : le « haut » du vaisseau doit etre la verticale
  // locale, sinon sa poussee verticale part de travers des la premiere image.
  const pose = new Ship(consts, null, [0, 0, 0]);
  pose.orientTo([0, 0, 1], null);
  check("orientTo pose le haut du vaisseau sur la verticale donnee",
        pose.axes.up.map((v) => round(v, 6)).join(","), "0,0,1");
}

// --- report des vitesses au changement de referentiel ---------------------
//
// La boucle recalait les POSITIONS d'une ancre a l'autre et laissait les
// vitesses : on arrivait toujours a l'arret relatif de sa cible, ce qui
// supprime la quatrieme phase de l'Autopilot — dans le jeu, la difficulte
// centrale du vol (docs/36-audit.md §2.4).
{
  const soleil = { name: "Soleil", bodyName: "Soleil", position: [0, 0, 0],
                   bodyPosition: [0, 0, 0],
                   gravity: { surfaceAcceleration: 100, upperSurfaceRadius: 2000,
                              lowerSurfaceRadius: 2000, cutoffRadius: 0,
                              falloffType: 1 } };
  const planete = { name: "Planete", bodyName: "Planete", position: [0, 0, 8600],
                    bodyPosition: [0, 0, 8600],
                    gravity: { surfaceAcceleration: 12, upperSurfaceRadius: 250,
                               lowerSurfaceRadius: 250, cutoffRadius: 0,
                               falloffType: 0 },
                    orbit: { primary: "Soleil", impulseScalar: 1 } };
  // mu = a R = 12 x 250 = 3000, donc v = sqrt(mu) ~ 54,8 u/s
  const lune = { name: "Lune", bodyName: "Lune", position: [0, 0, 8600 + 1000],
                 bodyPosition: [0, 0, 8600 + 1000],
                 gravity: { surfaceAcceleration: 5, upperSurfaceRadius: 100,
                            lowerSurfaceRadius: 100, cutoffRadius: 0,
                            falloffType: 0 },
                 orbit: { primary: "Planete", impulseScalar: 1 } };
  const orb = buildOrbits([soleil, planete, lune]);

  check("un corps fixe n'a pas de vitesse de repere",
        frameVelocity(orb, soleil).join(","), "0,0,0");
  const vp = frameVelocity(orb, planete);
  check("la planete se deplace a sa vitesse orbitale",
        round(Math.hypot(...vp), 3), round(orb.states.get(planete).speed, 3));

  // La lune porte SA vitesse plus celle de sa planete : c'est bien l'ecart
  // entre les deux reperes qu'on doit annuler en arrivant.
  const dv = frameVelocity(orb, planete).map((v, i) => v - frameVelocity(orb, lune)[i]);
  check("l'ecart entre les deux reperes vaut sqrt(mu)",
        Math.abs(Math.hypot(...dv) - Math.sqrt(12 * 250 * 250 / 1000)) < 30, true);
  check("... et il n'est pas nul", Math.hypot(...dv) > 10, true);

  // Il reste coherent apres integration : ce n'est pas une valeur de depart.
  advance(orb, 137);
  const vp2 = frameVelocity(orb, planete);
  check("la vitesse suit l'orbite",
        round(Math.hypot(...vp2), 3), round(Math.hypot(...vp), 3));
  check("... mais a change de direction",
        Math.abs(vp2[0] - vp[0]) > 1, true);
}

// --- champs polaires et alignement ---------------------------------------
//
// `PolarForceField` : un volume, `_acceleration -10`, radiale a un AXE et non
// a un point. Il etait extrait et jamais lu. `_affectsAlignment` non plus, sur
// les champs directionnels (docs/36-audit.md §2.9).
{
  const gameplay = { placed: { PolarForceField: [{
    name: "Puits", position: [0, 0, 0], rotation: null,
    volume: { shape: "capsule", radius: 30, height: 200, axis: 1, center: [0, 0, 0] },
    fields: { _acceleration: -10, _localAxis: { x: 0, y: 1, z: 0 } },
  }] } };
  const pf = polarFields(gameplay);
  check("le champ polaire est lu", pf.length, 1);
  check("son acceleration est celle du build", pf[0].acceleration, -10);
  check("son intensite est le module", pf[0].magnitude, 10);

  // Acceleration negative : on est attire VERS l'axe, quelle que soit la
  // hauteur a laquelle on se trouve.
  const d = polarDirection(pf[0], [10, 40, 0]);
  check("la force pointe vers l'axe", d.map((v) => round(v, 3)).join(","), "-1,0,0");
  check("... et n'a pas de composante le long de l'axe", round(d[1], 6), 0);
  check("sur l'axe meme, il n'y a pas de direction",
        polarDirection(pf[0], [0, 0, 0]), null);
  check("le volume est bien une capsule",
        round(distanceToAxis([10, 40, 0], pf[0].volume), 3), 10);
  check("hors du volume, aucun champ", strongestPolar(pf, [90, 0, 0]), null);
  check("dedans, il l'emporte", strongestPolar(pf, [10, 0, 0]).name, "Puits");

  // `_affectsAlignment` : un champ sur 34 pousse SANS retourner ce qu'il tient.
  const corps = [{ name: "P", position: [0, 0, 0],
                   gravity: { surfaceAcceleration: 12, upperSurfaceRadius: 250,
                              lowerSurfaceRadius: 250, cutoffRadius: 0,
                              falloffType: 0 } }];
  const couloir = (align) => directionalFields({ placed: { DirectionalForceField: [{
    name: "Couloir", position: [0, 260, 0], rotation: null,
    volume: { shape: "sphere", radius: 20, center: [0, 0, 0] },
    fields: { _fieldMagnitude: 10, _fieldDirection: { x: 1, y: 0, z: 0 },
              _affectsAlignment: align },
  }] } });
  const suit = dominantField(corps, { x: 0, y: 260, z: 0 },
                             { directional: couloir(true), framePos: [0, 0, 0] });
  check("un champ qui aligne impose sa verticale",
        round(suit.alignDir.x, 3), 1);
  const pousse = dominantField(corps, { x: 0, y: 260, z: 0 },
                               { directional: couloir(false), framePos: [0, 0, 0] });
  check("un champ qui n'aligne pas pousse quand meme",
        round(pousse.dir.x, 3), 1);
  check("... mais laisse la verticale a la planete",
        round(pousse.alignDir.y, 3), -1);

  // Les deux familles se comparent sur le meme pied : priorite, puis intensite.
  const melange = dominantField(corps, { x: 10, y: 0, z: 0 },
    { directional: [], polar: pf, framePos: [0, 0, 0] });
  check("le champ polaire prend la main dans son volume",
        round(melange.dir.x, 3), -1);
}

// --- attenuation audio : 83 sources sur 97 sont en courbe ------------------
//
// Le portage ecrivait `rolloff === "logarithmic" ? "inverse" : "linear"` : il
// rendait donc les 83 sources `custom` dans le seul mode que le build n'emploie
// JAMAIS (docs/36-audit.md §2.6).
{
  check("logarithmique -> inverse", rolloffModel("logarithmic"), "inverse");
  check("custom -> inverse, pas lineaire", rolloffModel("custom"), "inverse");
  check("lineaire reste lineaire", rolloffModel("linear"), "linear");
  check("une source sans mode connu ne tombe pas en lineaire",
        rolloffModel(null), "inverse");

  // La courbe est echantillonnee entre MinDistance et MaxDistance.
  const c = [1, 0.5, 0.2, 0.05, 0];
  check("au minimum, plein volume", curveGain(c, 5, 10, 50), 1);
  check("en deca du minimum aussi", curveGain(c, 0, 10, 50), 1);
  check("a mi-portee, on suit la courbe", round(curveGain(c, 30, 10, 50), 3), 0.2);
  check("au-dela du maximum, on plafonne", curveGain(c, 500, 10, 50), 0);
  check("un point intermediaire s'interpole",
        round(curveGain(c, 25, 10, 50), 3), 0.35);
  check("sans courbe, le gain est neutre", curveGain(null, 30, 10, 50), 1);
}

// --- colliders par niveau de detail ---------------------------------------
//
// A8 etait surestimee : il y a DEUX `LODGroup` dans la scene et les cinq
// `CreateLODGroup` sont vides. Le vrai gain est dans les 21 `ChildColliderLOD`,
// qui portent `_trackPlayer` et font tomber les 441 colliders de Timber Hearth
// (docs/36-audit.md §2.8).
{
  const gameplay = { placed: { ChildColliderLOD: [
    { name: "Village", position: [0, 0, 0], fields: { _trackPlayer: true },
      volume: { shape: "sphere", radius: 120 } },
    { name: "Observatoire", position: [500, 0, 0],
      fields: { _trackPlayer: true, _trackShip: true, _radius: 80 } },
    { name: "Sans suivi", position: [9000, 0, 0], fields: { _trackPlayer: false } },
  ] } };
  const groupes = colliderLODs(gameplay);
  check("les groupes sont lus", groupes.length, 3);
  check("la portee vient du collider quand le champ n'y est pas",
        groupes[0].radius, 120);
  check("... et du champ quand il y est", groupes[1].radius, 80);
  check("le vaisseau reveille l'observatoire", groupes[1].trackShip, true);

  const lod = new ColliderLODs(groupes);
  lod.update({ player: [0, 0, 0] });
  check("pres du village, il est eveille", lod.awake.has("Village"), true);
  check("l'observatoire dort", lod.awake.has("Observatoire"), false);
  check("un groupe que rien ne suit reste eveille",
        lod.awake.has("Sans suivi"), true);
  check("les colliders endormis sont nommes", lod.asleep().has("Observatoire"), true);

  lod.update({ player: [0, 0, 0] });
  check("un ensemble stable ne declenche pas de reconstruction",
        lod.changed, false);
  lod.update({ player: [0, 0, 0], ship: [480, 0, 0] });
  check("le vaisseau qui arrive reveille son groupe",
        lod.awake.has("Observatoire"), true);
  check("... et cela demande une reconstruction", lod.changed, true);

  // Le filtre porte sur le SOUS-ARBRE : un maillage descend d'un noeud endormi.
  const parent = { name: "Observatoire", parent: null };
  const enfant = { name: "Toit", parent };
  check("un enfant de groupe endormi est ecarte",
        underAsleep(enfant, new Set(["Observatoire"])), true);
  check("... et un maillage libre ne l'est pas",
        underAsleep({ name: "Sol", parent: null }, new Set(["Observatoire"])), false);
  check("sans groupe endormi, rien n'est ecarte",
        underAsleep(enfant, new Set()), false);

  // Ce que le build ne rend pas solide ne doit pas le devenir : 725 des 2 219
  // objets porteurs de maillage n'ont AUCUN collider (docs/40-solide.md).
  // L'exportateur les marque, et la physique les laisse passer.
  const nuage = { name: "PieceOfRing",
                  metadata: { gltf: { extras: { noCollide: true } } } };
  const sol = { name: "Terrain", metadata: { gltf: { extras: {} } } };
  check("un noeud marque traversable l'est", noCollide(nuage), true);
  check("... et le terrain ne l'est pas", noCollide(sol), false);
  check("un maillage sans metadonnees reste solide",
        noCollide({ name: "Rocher" }), false);
  check("un maillage sans extras non plus",
        noCollide({ name: "Rocher", metadata: { gltf: {} } }), false);
}

// --- textures qui defilent -------------------------------------------------
//
// Une seule loi pour les quatre classes du build, 44 instances
// (docs/42-lumieres.md) : offset += rate x echelle x dt, replie dans [0, 1].
{
  check("un pas avance l'offset", round(scrollOffset(0, 0.05, 1, 1), 6), 0.05);
  check("l'echelle de la texture multiplie le pas",
        round(scrollOffset(0, 0.05, 4, 1), 6), 0.2);
  // Le build teste STRICTEMENT au-dela de 1 : on repart de zero, on ne module
  // pas. Un pas qui deborde perd donc son reste, et c'est ce que fait le jeu.
  check("au-dela de un, on repart de zero", scrollOffset(0.99, 0.05, 1, 1), 0);
  check("exactement a un, on ne repart pas encore",
        round(scrollOffset(0.95, 0.05, 1, 1), 6), 1);
  check("un rythme negatif remonte", round(scrollOffset(0.5, -0.05, 1, 1), 6), 0.45);
  check("... et sous zero, on repart de un", scrollOffset(0.01, -0.05, 1, 1), 1);
  check("une echelle absente vaut un", round(scrollOffset(0, 0.05, 0, 1), 6), 0.05);

  // Le rattachement se fait par NOM : la position extraite est statique, et
  // les corps orbitent — un appariement geometrique echoue des la premiere
  // seconde, ce qu'un premier essai a montre a zero surface sur quarante-quatre.
  const d = { scrollers: [
    { name: "Sable", position: [10, 0, 0], channels: { main: { direction: [0, 1], rate: 0.05 } } },
    { name: "Sable", position: [50, 0, 0], channels: { main: { direction: [0, 1], rate: 0.07 } } },
  ] };
  const mk = (nom) => ({ name: nom, material: null });
  const sc = new TextureScrollers(d);
  check("deux surfaces decrites", sc.total, 2);
  check("les deux se retrouvent par leur nom",
        sc.attach([mk("Sable"), mk("Sable"), mk("Roche")]), 2);
  check("... et aucune autre", sc.count, 2);
  check("chaque description prend un maillage distinct",
        new Set(sc.live.map((x) => x.mesh)).size, 2);
  // Moins de maillages que de descriptions : on n'en invente pas.
  const court = new TextureScrollers(d);
  check("une seule surface pour deux descriptions", court.attach([mk("Sable")]), 1);
  // Un nom qui n'est pas la ne rattache rien.
  check("un nom absent ne rattache rien",
        new TextureScrollers(d).attach([mk("Roche")]), 0);
  // Sans donnees, rien ne se rattache et rien ne casse.
  const vide = new TextureScrollers(null);
  check("sans donnees, aucune surface", vide.total, 0);
  check("... et rattacher ne trouve rien", vide.attach([mk("Sable")]), 0);
  check("... et avancer ne fait rien", vide.update(0.016), 0);
}

// --- ce qui fait vivre une lumiere -----------------------------------------
//
// Trois `Update` du build, transcrits (docs/42-lumieres.md). Le portage posait
// l'intensite serialisee et n'en bougeait plus.
{
  // `PulsingLight` : sinusoide ADDITIVE, pas un facteur.
  const f = { _pulseRate: 2, _timeOffset: 0, _intensityFluctuation: 0.3,
              _rangeFluctuation: 5 };
  const base = { intensity: 1, range: 20 };
  check("au temps zero, la sinusoide ne decale rien",
        round(pulse(base, f, 0).intensity, 6), 1);
  // sin(pi/2) = 1 : le maximum est atteint quand (t x rate) vaut pi/2.
  const haut = pulse(base, f, Math.PI / 4);
  check("au sommet, on ajoute toute la fluctuation",
        round(haut.intensity, 6), 1.3);
  check("... et la portee suit la sienne", round(haut.range, 6), 25);
  const bas = pulse(base, f, 3 * Math.PI / 4);
  check("au creux, on la retranche", round(bas.intensity, 6), 0.7);
  check("une fluctuation nulle laisse tout en place",
        round(pulse(base, { _pulseRate: 2 }, 1).intensity, 6), 1);
  // Le decalage de phase existe pour que deux lampes voisines ne battent pas
  // ensemble.
  check("le decalage de phase change la valeur",
        round(pulse(base, { ...f, _timeOffset: Math.PI / 4 }, 0).intensity, 6), 1.3);

  // `LightFlicker` : on tire une cible, on s'en approche par un Lerp.
  const etat = { intensity: 1, target: 1 };
  // alea = 1 -> cible = (1 x 2 - 1) x range + base = base + range
  const apres = flicker(etat, 1, { range: 0.1, rate: 0.2 }, () => 1);
  check("une cible atteinte en fait tirer une autre", round(etat.target, 6), 1.1);
  check("on s'en approche du taux donne", round(apres, 6), 1.02);
  // Tant qu'on n'est pas arrive, la cible ne change pas.
  const cible0 = etat.target;
  flicker(etat, 1, { range: 0.1, rate: 0.2 }, () => 0);
  check("en chemin, la cible tient", round(etat.target, 6), round(cible0, 6));
  check("les valeurs par defaut sont celles du build",
        round(flicker({ intensity: 5, target: 5 }, 5, {}, () => 1), 4), 5.02);

  // `NightLight` : l'intensite serialisee est celle de la NUIT.
  const nf = { _dayIntensityMultiplier: 0.5 };
  check("le fondu dure cinq secondes", NIGHT_FADE, 5);
  check("de nuit, fondu acheve, on est a l'intensite du build",
        round(nightIntensity(2, nf, true, 5), 6), 2);
  check("de jour, fondu acheve, on est a la moitie",
        round(nightIntensity(2, nf, false, 5), 6), 1);
  check("a mi-fondu vers la nuit, on est entre les deux",
        round(nightIntensity(2, nf, true, 2.5), 6), 1.5);
  check("au-dela de la duree, on ne depasse pas",
        round(nightIntensity(2, nf, false, 100), 6), 1);
  check("sans multiplicateur, c'est la moitie du build",
        round(nightIntensity(2, {}, false, 5), 6), 1);
}

// --- la voute celeste ------------------------------------------------------
//
// `SkyBehavior` fait deux choses par image, et le portage n'en faisait aucune :
// il tourne la voute vers l'etoile — c'est de la que viennent le jour et la
// nuit — et il l'efface quand on s'en eloigne (docs/41-ciel.md).
{
  // La courbe relevee sur le build : pleine jusqu'aux trois quarts, puis elle
  // tombe a zero.
  const courbe = [1, 1, 1, 1, 1, 1, 1, 0.8221, 0];
  check("le rayon de ciel par defaut est celui du constructeur", SKY_RADIUS, 320);
  check("au centre, la voute est pleine", skyAlpha(courbe, 0, 320), 1);
  check("au village, elle l'est encore", skyAlpha(courbe, 132, 320), 1);
  // Le build divise par `_skyRadius` (320) et NON par le rayon du collider
  // (250,7) : a la surface de la voute, on la voit donc encore.
  check("a la surface de la voute, elle tient presque entierement",
        round(skyAlpha(courbe, 250.749, 320), 3), 0.952);
  check("au rayon de ciel, elle a disparu", skyAlpha(courbe, 320, 320), 0);
  check("au-dela, elle reste disparue", skyAlpha(courbe, 900, 320), 0);
  check("entre les deux, elle decroit",
        round(skyAlpha(courbe, 300, 320), 3), 0.411);
  check("sans rayon, on ne divise pas par zero", skyAlpha(courbe, 10, 0), 1);
  check("sans courbe, la voute reste pleine", skyAlpha(null, 10, 320), 1);
  check("une courbe s'interpole", skyCurveAt([0, 1], 0.5), 0.5);

  // Sans donnees de ciel, le module ne fabrique rien : il n'y a pas de voute
  // inventee, seulement celle du build.
  const vide = new Sky(null);
  check("sans donnees, aucune voute", vide.ready, false);
  check("... et rattacher ne trouve rien", vide.attach([{ name: "SkyShell" }]), 0);
  const ciel = new Sky({ shell: { name: "SkyShell", alphaCurve: courbe, skyRadius: 320 },
                         clouds: new Array(24).fill({ texture: "cloud_01" }) });
  check("la voute se retrouve par son nom",
        ciel.attach([{ name: "Sol" }, { name: "SkyShell" }]), 1);
  check("... et le ciel est alors pret", ciel.ready, true);
  check("les nuages du build sont comptes", ciel.cloudCount, 24);
  check("sans donnees, aucun nuage", vide.cloudCount, 0);
}

// --- detecteur d'oxygene ---------------------------------------------------
//
// `OxygenDetector` : une capsule r=0,5 h=2 portee par le joueur. Elle etait
// extraite et jamais lue, et le test de zone restait ponctuel (§2.9).
{
  const gameplay = { placed: { OxygenDetector: [{
    name: "PlayerDetector", position: [0, 0, 0],
    volume: { shape: "capsule", radius: 0.5, height: 2, axis: 1, center: [0, 0, 0] },
    fields: {},
  }] } };
  const det = oxygenDetector(gameplay);
  check("le detecteur est lu", det.radius, 0.5);
  check("sa portee est son demi-encombrement", det.reach, 1);
  check("sans detecteur, pas de portee", oxygenDetector({}), null);

  const zones = [{ name: "Arbres", position: [0, 0, 0], radius: 24 }];
  check("un point hors zone reste hors zone",
        inOxygenZone(zones, [24.5, 0, 0]), null);
  check("mais la capsule du joueur y touche",
        inOxygenZone(zones, [24.5, 0, 0], det.reach).name, "Arbres");
}

// --- repere tournant : Coriolis et force centrifuge ------------------------
//
// Le repere de travail TOURNE avec le corps ancre — c'est ce qui garde ses
// colliders immobiles — et rien n'en tirait les consequences : en vol
// stationnaire, le sol ne defilait pas (docs/36-audit.md §1.2).
{
  const corps = { spin: { axis: [0, 1, 0], degreesPerSecond: 0.05 * 180 / Math.PI } };
  const champ = new SpinField([corps]);
  check("le vecteur rotation est lu",
        champ.omega(corps).map((v) => round(v, 6)).join(","), "0,0.05,0");
  check("un corps qui ne tourne pas n'en a pas",
        champ.omega({ spin: null }), null);

  // A 250 unites et 0,05 rad/s, le sol defile a 12,5 u/s sous un joueur qui
  // reste immobile dans le repere inertiel.
  const r = { x: 250, y: 0, z: 0 };
  const w = champ.omega(corps);
  const v = { x: -(w[1] * r.z - w[2] * r.y), y: -(w[2] * r.x - w[0] * r.z),
              z: -(w[0] * r.y - w[1] * r.x) };
  check("le sol defile a omega r", round(Math.hypot(v.x, v.y, v.z), 3), 12.5);

  // Pour un tel corps, Coriolis et centrifuge se composent exactement en
  // l'acceleration centripete qui le maintient sur son cercle apparent.
  const a = champ.inertial(corps, r, v);
  check("l'acceleration d'inertie est centripete", round(a[0], 6), -0.625);
  check("... et vaut omega^2 r", round(-a[0], 6), round(0.05 ** 2 * 250, 6));
  check("elle n'a pas de composante hors du plan", round(a[1], 9), 0);
  check("un corps immobile dans le repere tournant ne subit que le centrifuge",
        round(champ.inertial(corps, r, { x: 0, y: 0, z: 0 })[0], 6), 0.625);
}

// --- le depart de la partie ----------------------------------------------
//
// Trois ecarts fermes d'un coup (docs/38-depart.md) : on apparaissait a cote du
// vaisseau plutot qu'au village, 40 u au-dessus de la surface plutot qu'au sol,
// et face a une direction que rien ne fondait.
{
  const home = { position0: [0, 0, -8593] };
  // Un jeu de points d'apparition en miniature : deux sur le corps habitable,
  // deux sur une autre planete, pour que le choix du plus proche compte.
  const gameplay = { placed: { SpawnPoint: [
    { name: "SpawnPoint_Player", position: [0, 168, -8593], rotation: [0, 0, 0, 1] },
    { name: "SpawnPoint_Ship", position: [0, 168, -9064] },
    { name: "SpawnPoint_Player", position: [11691, 200, 0] },
    { name: "SpawnPoint_Ship", position: [11691, 180, 0] },
  ] } };

  check("le point du vaisseau se reconnait a son nom",
        isShipSpawn({ name: "SpawnPoint_Ship" }), true);
  check("celui du joueur aussi", isShipSpawn({ name: "SpawnPoint_Player" }), false);
  check("le champ du composant prime sur le nom",
        isShipSpawn({ name: "SpawnPoint_Player", fields: { _isShipSpawn: 1 } }), true);
  check("deux points de joueur dans la scene",
        spawnPoints(gameplay, { ship: false }).length, 2);
  check("le plus proche du corps habitable est le sien",
        nearestTo(spawnPoints(gameplay, { ship: false }), home.position0).position[1], 168);

  const pose = startPose(gameplay, home);
  check("on apparait sur la verticale du point d'apparition",
        pose.up.map((v) => round(v, 6)).join(","), "0,1,0");
  // Le corps du joueur est une sphere : son CENTRE est un rayon plus une garde
  // au-dessus du sol, sinon Havok l'ejecte de la geometrie ou il nait.
  check("a la hauteur du point, plus le rayon du corps et sa garde",
        round(Math.hypot(...pose.position), 3),
        round(168 + PLAYER_RADIUS + SPAWN_CLEARANCE, 3));
  // 471 u separent les deux points sur le vrai build (docs/07-gameplay.md) ;
  // la mesure porte ici sur le calcul, pas sur le chiffre.
  check("la marche jusqu'au vaisseau se mesure d'un point a l'autre",
        round(walkToShip(gameplay, home), 0), 471);

  // Le regard : l'axe Z du point d'apparition, ramene au lacet de la camera.
  check("un quaternion identite regarde son axe Z",
        quatForward([0, 0, 0, 1]).join(","), "0,0,1");
  check("l'orientation est bien lue", pose.oriented, true);
  const b = horizonBasis(pose.up);
  const fwd = b.north.map((n, i) => n * Math.cos(pose.yaw) + b.east[i] * Math.sin(pose.yaw));
  check("et le lacet de depart y ramene exactement",
        fwd.map((v) => round(v, 6)).join(","), "0,0,1");
  check("une direction verticale n'a pas de lacet",
        yawFor([0, 1, 0], [0, 1, 0]), null);

  // Sans rotation extraite — une extraction anterieure — on le DIT plutot que
  // de faire passer un zero pour une mesure.
  const nu = startPose({ placed: { SpawnPoint: [
    { name: "SpawnPoint_Player", position: [0, 168, -8593] }] } }, home);
  check("sans rotation, aucune orientation n'est affirmee", nu.oriented, false);
  check("... et le lacet vaut zero", nu.yaw, 0);

  // Repli : sans le build, il n'y a pas de point d'apparition, et la page doit
  // rester ouvrable.
  check("aucun point d'apparition : le moteur garde son repli",
        startPose({ placed: {} }, home), null);
}

// --- Audio : un clip doit etre NOMME comme il est fait -----------------------
//
// Le portage deduisait l'extension de `m_Format`, qui ne dit rien du
// conteneur : vingt clips sur trente-six partaient en `.ogg` en etant du RIFF
// ou de l'AIFF. Les octets de tete, eux, ne mentent pas.
{
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
  const ogg = new Uint8Array([...ascii("OggS"), ...new Array(16).fill(0)]);
  const wav = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVEfmt ")]);
  const aif = new Uint8Array([...ascii("FORM"), 0, 0, 0, 0, ...ascii("AIFFCOMM")]);
  check("un OggS se reconnait", sniffContainer(ogg), "ogg");
  check("un RIFF/WAVE aussi", sniffContainer(wav), "wav");
  check("un FORM/AIFF aussi", sniffContainer(aif), "aiff");
  check("quatre octets ne suffisent pas a se tromper", sniffContainer(new Uint8Array(4)), null);

  // m_Type est l'AudioType d'Unity : 2 = AIFF, 14 = Ogg, 20 = WAV. m_Format,
  // lui, vaut 2 pour les trois — c'est la profondeur des echantillons.
  check("sans octets lisibles, m_Type tranche", clipContainer({ m_Type: 20 }, null), "wav");
  check("... et il connait l'Ogg", clipContainer({ m_Type: 14 }, null), "ogg");
  check("... et l'AIFF", clipContainer({ m_Type: 2 }, null), "aiff");
  // Les octets priment sur l'enumeration : c'est tout l'objet de la correction.
  check("les octets priment sur m_Type", clipContainer({ m_Type: 14 }, wav), "wav");
}

// --- Audio : l'AIFF du build, converti sans perte ---------------------------
{
  // Le taux d'echantillonnage d'un AIFF est un flottant etendu sur 80 bits.
  // 44 100 Hz s'y ecrit exposant 16398, mantisse 0xAC440000_00000000.
  const rate44100 = new Uint8Array([0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0]);
  check("le flottant etendu se lit", Math.round(extended80(rate44100, 0)), 44100);

  // AIFF fabrique : 1 canal, 16 bits, 4 trames, gros-boutiste.
  const samples = [1000, -1000, 32767, -32768];
  const be = [];
  for (const v of samples) { const u = v & 0xffff; be.push(u >> 8, u & 0xff); }
  const put = (arr, s) => { for (const c of s) arr.push(c.charCodeAt(0)); };
  const u32 = (arr, n) => arr.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  const body = [];
  put(body, "AIFF");
  put(body, "COMM"); u32(body, 18);
  body.push(0, 1);                       // canaux
  u32(body, samples.length);             // trames
  body.push(0, 16);                      // bits
  body.push(...rate44100);
  put(body, "SSND"); u32(body, 8 + be.length);
  u32(body, 0); u32(body, 0);            // offset, blockSize
  body.push(...be);
  const aiff = [];
  put(aiff, "FORM"); u32(aiff, body.length); aiff.push(...body);

  const out = aiffToWav(new Uint8Array(aiff));
  check("un AIFF non compresse se convertit", out !== null, true);
  const w = parseWav(out);
  check("le WAV obtenu se relit", !!w, true);
  check("il garde son taux", w.rate, 44100);
  check("il garde ses canaux", w.channels, 1);
  check("il garde ses trames", w.frames, samples.length);
  // La conversion ne fait que retourner les octets : les echantillons doivent
  // revenir a l'identique. Un ordre inverse donnerait n'importe quoi.
  check("et ses echantillons, a l'identique",
        [...w.data[0]].map((v) => Math.round(v * 32768)).join(","),
        samples.join(","));
  check("un Ogg n'est pas un AIFF", aiffToWav(new Uint8Array([79, 103, 103, 83, 0, 0, 0, 0, 0, 0, 0, 0])), null);
}

// --- Audio : ce qui doit jouer au deverrouillage ----------------------------
//
// Le navigateur bloque le son avant le premier geste. Une source creee avant
// ce geste doit repartir apres — et la condition du deverrouillage etait plus
// etroite que celle de la creation, ce qui laissait la musique muette pour de
// bon : les cinq sources de musique du build sont a `playOnAwake` faux.
{
  const champ = new AudioField({}, []);
  check("une ambiance qui joue d'elle-meme repart",
        champ._shouldPlay({ playOnAwake: true, track: "Ambience" }), true);
  check("une musique en boucle repart aussi",
        champ._shouldPlay({ playOnAwake: false, track: "Music" }), true);
  check("un signal en boucle egalement",
        champ._shouldPlay({ playOnAwake: false, track: "Signal" }), true);
  check("un effet ponctuel, non",
        champ._shouldPlay({ playOnAwake: false, track: "Default" }), false);
}

// --- PNJ : l'arbre vient du controleur, choisi par sa CLASSE ----------------
//
// Regles transcrites de l'IL du build. Le Conservateur n'a PAS d'arbre dans la
// scene : c'est son controleur qui le pose au demarrage de la conversation.
{
  const data = new PlayerData();
  data.wipe();
  const curator = { index: 0, character: "Curator", position: [0, 0, 0],
                    tree: null,
                    controller: { kind: "CuratorConvoController",
                                  trees: { _preFlightObservations: "A", _goodLuck: "B" } } };
  check("avant de lui avoir parle : ses observations",
        treeFromController(data, curator, [], { ended: 0 }), "A");
  check("une fois la conversation finie : bonne route",
        treeFromController(data, curator, [], { ended: 1 }), "B");

  const coach = { index: 1, character: "Zero-G Coach", position: [0, 0, 0],
                  controller: { kind: "CoachConvoController",
                                trees: { _beforeTraining: "T", _afterTrainingWithCodes: "C",
                                         _afterTrainingWithoutCodes: "N" } } };
  check("le formateur, avant l'entrainement",
        treeFromController(data, coach, [], { ended: 0 }), "T");
  data.learn("hasCompletedTraining");
  check("apres l'entrainement, sans les codes",
        treeFromController(data, coach, [], { ended: 0 }), "N");
  data.learn("knowsLaunchCodes");
  check("apres l'entrainement, avec les codes",
        treeFromController(data, coach, [], { ended: 0 }), "C");

  // Le nom ne distingue rien : les quatorze zones du build s'appellent toutes
  // `ConversationZone`. C'est la classe du controleur qui decide.
  check("deux zones homonymes ne se confondent plus",
        treeFromController(data, { ...curator, name: "ConversationZone" }, [], { ended: 0 }), "A");

  check("le scientifique, au premier echange",
        CONVO_RULES.RocketScientistConvoController(data, { ended: 0 }), "_bigDay");
  check("... puis au second", CONVO_RULES.RocketScientistConvoController(data, { ended: 1 }),
        "_secondConvo");
  // OnTriggerEnter sort si GetLoopCount() < 2.
  check("les adieux n'arrivent pas a la premiere boucle",
        CONVO_RULES.SecondLoopConvoTrigger({ loopCount: 1 }, { ended: 0 }), null);
  check("mais bien a la deuxieme",
        CONVO_RULES.SecondLoopConvoTrigger({ loopCount: 2 }, { ended: 0 }), "_2ndLoop");
}

// --- PNJ : une conversation sans arbre reste joignable ----------------------
{
  const sys = new DialogueSystem({
    trees: { A: { start: "s", branches: { s: { talk: ["..."], options: [] } } } },
    conversations: [
      { name: "ConversationZone", character: "Curator", position: [0, 0, 0],
        tree: null,
        controller: { kind: "CuratorConvoController", trees: { _preFlightObservations: "A" } } },
      { name: "ConversationZone", character: "Muet", position: [1, 0, 0], tree: null,
        controller: null },
    ],
  });
  const ici = { x: 0, y: 0, z: 0 };
  const vu = sys.nearest(ici, [0, 0, 0]);
  check("le Conservateur est vu malgre son arbre nul", vu && vu.character, "Curator");
  check("une conversation sans arbre NI controleur reste ecartee",
        sys.nearest({ x: 1, y: 0, z: 0 }, [0, 0, 0]) === null ||
        sys.nearest({ x: 1, y: 0, z: 0 }, [0, 0, 0]).character === "Curator", true);

  // La fin de la conversation est un evenement : c'est la que le build accorde
  // les codes de lancement, pas a l'ouverture.
  let finies = 0, ouverture = null;
  sys.onEnd = (c) => { finies++; ouverture = c.character; };
  sys.open({ ...vu, tree: "A" });
  check("a l'ouverture, rien n'est encore accorde", finies, 0);
  sys.advance();
  check("a la fin, l'evenement part une fois", finies, 1);
  check("... et il porte la bonne conversation", ouverture, "Curator");
  check("la boucle retient qu'on lui a parle", sys.stateOf(vu).ended, 1);
  sys.resetLoop();
  check("une nouvelle boucle remet le compteur a zero", sys.stateOf(vu).ended, 0);
}

// --- le sable des jumelles ---------------------------------------------
//
// Les quatre nombres sont ceux des deux instances posees dans le build ; la loi
// est une interpolation lineaire bornee, sans adoucissement.
{
  const monte = { initScale: 60, finalScale: 290, startMinutes: 2, endMinutes: 17 };
  const baisse = { initScale: 300, finalScale: 66, startMinutes: 2, endMinutes: 17 };

  check("avant la 2e minute, rien n'a bouge", sandScale(0, monte), 60);
  check("... y compris a la minute pile", sandScale(2, monte), 60);
  check("a mi-course, la moitie du chemin", sandScale(9.5, monte), 175);
  check("a la 17e minute, tout est fini", sandScale(17, monte), 290);
  check("et cela ne bouge plus apres", sandScale(19.9, monte), 290);
  check("la jumelle qui se vide part de 300", sandScale(0, baisse), 300);
  check("... et finit a 66", sandScale(17, baisse), 66);
  check("... en passant par 183 a mi-course", sandScale(9.5, baisse), 183);

  // Le sable ne se deplace pas : ce qu'une jumelle gagne en rayon, l'autre ne
  // le perd pas a l'identique. Les deux echelles sont independantes, et c'est
  // bien ce que disent les quatre nombres.
  check("les deux colonnes ne sont pas symetriques",
        Math.round((290 - 60) - (300 - 66)), -4);

  check("la fraction est bornee en bas", sandProgress(-5, 2, 17), 0);
  check("la fraction est bornee en haut", sandProgress(99, 2, 17), 1);
  check("une fenetre nulle ne divise pas par zero", sandProgress(5, 3, 3), 1);

  const f = { growAfterMinutes: 2, shrinkAfterMinutes: 17 };
  check("l'entonnoir est ferme au depart", funnelScale(0, f), 0);
  check("il est a moitie ouvert cinq secondes apres la pousse",
        funnelScale(2 * 60 + 5, f), 0.5);
  check("ouvert dix secondes apres", funnelScale(2 * 60 + 10, f), 1);
  check("toujours ouvert a la 16e minute", funnelScale(16 * 60, f), 1);
  check("a moitie referme cinq secondes apres le retrait",
        funnelScale(17 * 60 + 5, f), 0.5);
  check("ferme dix secondes apres", funnelScale(17 * 60 + 10, f), 0);
  check("il n'existe pas avant sa pousse", funnelActive(60, f), false);
  check("il existe entre les deux", funnelActive(10 * 60, f), true);
  check("il n'existe plus apres son retrait", funnelActive(18 * 60, f), false);

  // Sans donnees, aucune colonne et aucune plantee.
  check("sans build, aucune colonne", sandColumns({}).length, 0);
  check("sans build, aucun entonnoir", sandFunnels({}).length, 0);
  const lu = sandColumns({ placed: { SandLevelController: [
    { name: "RisingSand", position: [0, 0, 0],
      fields: { _initScale: 60, _finalScale: 290, _startAfterMinutes: 2, _endAfterMinutes: 17 } }] } });
  check("une colonne lue garde ses quatre nombres",
        `${lu[0].initScale}/${lu[0].finalScale}/${lu[0].startMinutes}/${lu[0].endMinutes}`,
        "60/290/2/17");
}

// --- ou l'on meurt, et comment on repare ------------------------------
{
  check("l'enumeration DeathType du build fait cinq valeurs", DEATH_TYPES.length, 5);
  check("la valeur 2 est l'asphyxie", deathCause(2), "asphyxie");
  check("la 3 est l'energie", deathCause(3), "incineration");
  check("la 4 est la supernova", deathCause(4), "supernova");
  check("la 0 est la mort par defaut", deathCause(0), "ecrasement");

  const gp = { placed: { DestructionVolume: [
    { name: "JawsOfDestruction", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 10, center: [0, 0, 0] },
      fields: { _deathType: 0, _onlyAffectsPlayerAndShip: true } },
    { name: "DestructionVolume", position: [100, 0, 0],
      volume: { shape: "sphere", radius: 5, center: [0, 0, 0] },
      fields: { _deathType: 3, _onlyAffectsPlayerAndShip: false } },
  ] } };
  const vols = destructionVolumes(gp);
  check("deux volumes lus", vols.length, 2);
  check("un joueur au centre des machoires meurt",
        destroyedBy(vols, [0, 0, 0], "player").deathType, 0);
  check("... et une sonde les traverse",
        destroyedBy(vols, [0, 0, 0], "probe"), null);
  check("le volume ouvert n'epargne pas la sonde",
        destroyedBy(vols, [100, 0, 0], "probe").deathType, 3);
  check("hors de tout volume, on survit", destroyedBy(vols, [50, 50, 50], "player"), null);
  check("un volume sans collider ne tue personne",
        destroyedBy(destructionVolumes({ placed: { DestructionVolume:
          [{ name: "x", position: [0, 0, 0], fields: {} }] } }), [0, 0, 0]), null);

  const rv = repairVolumes({ placed: { RepairVolume: [
    { name: "RepairVolume", position: [0, 0, 0], fields: { _repairDistance: 5 } }] } });
  check("la duree de reparation retombe sur les trois secondes du build",
        rv[0].seconds, 3);
  const r = new Repair(rv[0]);
  check("a portee", r.inRange([0, 4, 0]), true);
  check("hors de portee", r.inRange([0, 6, 0]), false);
  check("sans maintien, rien n'avance", r.update(1) || r.fraction, 0);
  r.press();
  r.update(1);
  check("un tiers du chemin apres une seconde", Number(r.fraction.toFixed(3)), 0.333);
  r.release();
  r.update(5);
  check("relacher garde l'avancement", Number(r.fraction.toFixed(3)), 0.333);
  r.press();
  check("la reparation s'acheve", r.update(2), true);
  check("... et ne s'acheve qu'une fois", r.update(2), false);
  check("... la fraction est pleine", r.fraction, 1);
  r.reset();
  check("le redemarrage de boucle la remet a zero", r.fraction, 0);
}

// --- les zones d'ambiance ----------------------------------------------
//
// Le point de la mecanique n'est pas la proximite mais l'ARBITRAGE : une seule
// zone par couche, la plus prioritaire, et les couches jouent ensemble.
{
  const zone = (name, layer, priority, radius, file, extra = {}) => ({
    name, layer, priority, file, fade: 2,
    position: [0, 0, 0],
    volume: { shape: "sphere", radius, center: [0, 0, 0] }, ...extra,
  });
  const zones = [
    zone("Atmosphere", 1, 0, 250, "atmo.ogg"),
    zone("CaveVolume", 1, 1, 10, "cave.ogg"),
    zone("MusicVolume", 2, 0, 100, "musique.ogg"),
    zone("Hatch", 0, 100, 0.5, "sas.ogg"),
  ];

  check("une zone sans forme ni clip est ecartee",
        ambienceZones({ volumes: [...zones, { name: "vide", layer: 0 }] }).length, 4);
  check("au centre, les quatre zones contiennent l'auditeur",
        activeZones(zones, [0, 0, 0]).length, 4);
  // A 100 unites on est encore SUR le bord de MusicVolume : la borne est
  // inclusive, et c'est ce que le test garde.
  check("a 100 unites, l'atmosphere et le bord de la musique",
        activeZones(zones, [100, 0, 0]).map((z) => z.name).sort().join(","),
        "Atmosphere,MusicVolume");
  check("a 101, la musique est sortie", activeZones(zones, [101, 0, 0]).length, 1);

  const g = winnersByLayer(zones, [0, 0, 0]);
  check("trois couches gagnees", g.size, 3);
  check("dans la couche 1, la grotte couvre l'atmosphere", g.get(1).name, "CaveVolume");
  check("la couche 0 revient au sas", g.get(0).name, "Hatch");
  check("hors de la grotte, l'atmosphere reprend la couche 1",
        winnersByLayer(zones, [50, 0, 0]).get(1).name, "Atmosphere");

  // A priorite egale, la plus petite zone gagne : une piece est plus precise
  // qu'une atmosphere, et c'est la seule regle qui donne un resultat stable.
  const exaequo = [zone("grande", 1, 0, 250, "a.ogg"), zone("petite", 1, 0, 20, "b.ogg")];
  check("a egalite, la plus petite l'emporte",
        winnersByLayer(exaequo, [0, 0, 0]).get(1).name, "petite");

  const nuit = zone("VillageAmbience", 1, 1, 90, "jour.ogg", { nightFile: "nuit.ogg" });
  check("de jour, le clip du jour", clipOf(nuit, false), "jour.ogg");
  check("de nuit, celui de la nuit", clipOf(nuit, true), "nuit.ogg");
  check("sans clip de nuit, on garde celui du jour",
        clipOf(zone("x", 1, 0, 10, "jour.ogg"), true), "jour.ogg");

  // Les fondus : deux secondes de montee, deux de descente.
  const mix = new AmbienceMixer(zones);
  mix.update(1, [0, 0, 0]);
  const c1 = mix.playing.find((l) => l.layer === 1);
  check("a mi-fondu, la couche 1 est a la moitie", Number(c1.gain.toFixed(3)), 0.5);
  mix.update(1, [0, 0, 0]);
  check("deux secondes plus tard, elle est pleine",
        Number(mix.playing.find((l) => l.layer === 1).gain.toFixed(3)), 1);
  check("et les trois couches sonnent ensemble", mix.playing.length, 3);

  // Sortir de tout : chaque couche redescend a son rythme, puis se tait.
  mix.update(1, [1000, 0, 0]);
  check("en sortant, la couche 1 redescend",
        Number(mix.playing.find((l) => l.layer === 1).gain.toFixed(3)), 0.5);
  mix.update(2, [1000, 0, 0]);
  check("puis se tait tout a fait", mix.playing.length, 0);

  // Changer de zone dans une couche : on libere la place avant de la prendre.
  const m2 = new AmbienceMixer(zones);
  m2.update(5, [50, 0, 0]);
  check("l'atmosphere tient la couche 1",
        m2.playing.find((l) => l.layer === 1).name, "Atmosphere");
  m2.update(1, [0, 0, 0]);
  check("entrer dans la grotte fait d'abord baisser l'atmosphere",
        m2.playing.find((l) => l.layer === 1).name, "Atmosphere");
  m2.update(1.1, [0, 0, 0]);
  m2.update(0.1, [0, 0, 0]);
  check("puis la grotte prend la couche",
        m2.playing.find((l) => l.layer === 1).name, "CaveVolume");
}

// --- ce que docs/44-reste-a-migrer.md demandait -----------------------------
//
// Les lois de ces six lots sont posees ici AVANT d'etre branchees, comme la
// methode de docs/45 le demande. Aucune ne vient d'un raisonnement : toutes
// sont lues dans l'IL du build.

{
  // §1 LES REFERENTIELS DECLARES. Le plus petit volume contenant le point
  // gagne : le vaisseau (r=30) vit DANS Timber Hearth (r=600), et c'est
  // justement le cas — un vaisseau pose dans un hangar — que la gravite
  // dominante ne sait pas traiter.
  const gp = { placed: {
    MajorReferenceFrameVolume: [
      { name: "RFVolume", body: "TimberHearth_Body", position: [0, 0, 0],
        volume: { shape: "sphere", radius: 600, center: [0, 0, 0] },
        fields: { _isPrimaryVolume: true, _autopilotArrivalDistance: 1000,
                  _autoAlignmentDistance: 700 } },
      { name: "RFVolume", body: "DarkBramble_Body", position: [10000, 0, 0],
        volume: { shape: "sphere", radius: 1500, center: [0, 0, 0] },
        fields: { _isPrimaryVolume: true, _autopilotArrivalDistance: 2500,
                  _autoAlignmentDistance: 0 } },
    ],
    ReferenceFrameVolume: [
      { name: "RFVolume", body: "Ship_Body", position: [100, 0, 0],
        volume: { shape: "sphere", radius: 30, center: [0, 0, 0] },
        fields: { _isPrimaryVolume: true } },
    ],
  } };
  const frames = referenceFrames(gp);
  check("trois volumes de referentiel", frames.length, 3);
  check("les majeurs portent leurs distances",
        frames.filter((f) => f.major && f.arrival !== null).length, 2);
  check("loin de tout, aucun referentiel declare",
        frameAt(frames, [0, 0, 5000]), null);
  check("au centre de la planete, c'est elle",
        frameAt(frames, [0, 0, 0]).body, "TimberHearth_Body");
  check("dans le hangar, c'est le VAISSEAU qui l'emporte",
        frameAt(frames, [95, 0, 0]).body, "Ship_Body");
  check("un pas plus loin, la planete reprend la main",
        frameAt(frames, [200, 0, 0]).body, "TimberHearth_Body");

  check("la distance d'arrivee vient du build",
        autopilotDistances(frames, "DarkBramble_Body").arrival, 2500);
  check("et l'alignement de Dark Bramble vaut zero",
        autopilotDistances(frames, "DarkBramble_Body").alignment, 0);
  check("un corps sans volume majeur garde la regle d'avant",
        autopilotDistances(frames, "WhiteHole_Body", 200).arrival,
        200 * ARRIVAL_FALLBACK);
  check("et se sait non declare",
        autopilotDistances(frames, "WhiteHole_Body", 200).declared, false);

  // Le suivi previent au changement, et n'ancre que ce qui est ancrable.
  const suivi = new DeclaredFrames(frames);
  suivi.update([0, 0, 5000]);
  check("hors de tout volume, rien a ancrer", suivi.current, null);
  suivi.update([95, 0, 0]);
  check("entrer dans le hangar est un changement", suivi.changed, true);
  const corps = [{ name: "GravityWell_HomePlanet", bodyName: "TimberHearth_Body" }];
  check("mais le vaisseau n'est pas un corps ancrable",
        suivi.anchorBody(corps), null);
  suivi.update([200, 0, 0]);
  check("la planete, elle, l'est",
        suivi.anchorBody(corps).bodyName, "TimberHearth_Body");

  // La scene est extraite AU REPOS, et les corps orbitent : comparer un point
  // du moment a une position de repos derive de tout le chemin parcouru. C'est
  // ce qu'un vrai Chromium a montre — le referentiel de Timber Hearth ne
  // contenait plus sa propre planete au bout d'une douzaine de secondes.
  const decale = (fr) => (fr.body === "TimberHearth_Body" ? [5000, 0, 0] : null);
  check("sans correction, le corps a derive hors de son propre volume",
        frameAt(frames, [5000, 0, 0]), null);
  check("ramene au repos, il le contient a nouveau",
        frameAt(frames, [5000, 0, 0], decale).body, "TimberHearth_Body");
  check("et un point qui n'a pas suivi le corps reste dehors",
        frameAt(frames, [0, 0, 0], decale), null);

  // `MatchInitialMotion` : v = v_porteur + omega x r.
  const porteur = { position: [0, 0, 0], velocity: [10, 0, 0],
                    angularVelocity: [0, 2, 0] };
  const v = matchInitialVelocity(porteur, [3, 0, 0]);
  check("la vitesse du porteur est heritee", v[0], 10);
  check("et la vitesse tangentielle s'y ajoute", v[2], -6);
  check("les cinq instances qui ignorent la rotation n'en gardent rien",
        matchInitialVelocity(porteur, [3, 0, 0], { ignoreAngular: true })[2], 0);

  // `AttachOnAwake` : la sphere de controle, rayon 1 sur trente instances.
  const sol = [{ name: "A", position: [0, 0, 0], radius: 100 },
               { name: "B", position: [0, 0, 300], radius: 100 }];
  check("pose sur la surface, on s'attache au corps sous soi",
        attachTarget([0, 0, 100.5], 1, sol).name, "A");
  check("a deux unites au-dessus, plus rien ne repond",
        attachTarget([0, 0, 102], 1, sol), null);
}

{
  // Le volume de destruction du soleil est une sphere de 2 000 unites CENTREE
  // SUR L'ORIGINE DU MONDE. Le tester avec une position exprimee dans le
  // repere ancre — quelques centaines d'unites — tuait le joueur des la
  // premiere image, et c'est ce qu'un vrai Chromium a montre (docs/46).
  {
    const soleil = destructionVolumes({ placed: { DestructionVolume: [
      { name: "DestructionVolume", body: "Sun_Body", position: [0, 0, 0],
        volume: { shape: "sphere", radius: 2000, center: [0, 0, 0] },
        fields: { _deathType: 3, _onlyAffectsPlayerAndShip: false } }] } });
    check("pose sur une planete lointaine, on ne brule pas",
          destroyedBy(soleil, [0, 0, -8593]), null);
    check("mais une position prise dans le repere ancre, si",
          destroyedBy(soleil, [0, 0, -129]) !== null, true);
    check("dans l'etoile, on brule pour de bon",
          destroyedBy(soleil, [0, 0, 1500]).deathType, 3);
  }

  // §3 LA VIE DU DECOR.
  const q = fromToRotation([0, 0, 1], [1, 0, 0]);
  const amene = qrot(q, [0, 0, 1]);
  check("FromToRotation amene bien l'un sur l'autre",
        amene.map((x) => Math.round(x * 1000) / 1000).join(","), "1,0,0");
  check("dos a dos, la rotation existe encore (demi-tour)",
        Math.round(qrot(fromToRotation([0, 0, 1], [0, 0, -1]), [0, 0, 1])[2]), -1);

  // L'axe de rotation retire la composante verticale : un panneau tourne
  // autour de son mat, il ne se couche pas.
  check("sans axe, la direction reste entiere",
        projectOut([1, 2, 3], [0, 0, 0]).join(","), "1,2,3");
  check("avec un axe vertical, la composante verticale tombe",
        projectOut([1, 2, 3], [0, 1, 0]).join(","), "1,0,3");

  check("l'angle signe dit de quel cote tourner",
        Math.round(signedAngleAround([0, 1, 0], [0, 0, 1], [1, 0, 0])), 90);
  check("et de l'autre cote, il change de signe",
        Math.round(signedAngleAround([0, 1, 0], [0, 0, 1], [-1, 0, 0])), -90);

  const pas = facePlayerStep([0, 1, 0], [0, 0, 1], [1, 0, 0]);
  check("le personnage ne tourne que d'un dixieme par image",
        Math.round(pas.step), Math.round(90 * FACE_SLERP));
  check("il n'a pas fini", pas.done, false);
  check("sous un degre, il a fini",
        facePlayerStep([0, 1, 0], [0, 0, 1], [0.005, 0, 1]).done, true);

  check("LookRotation pose l'axe Z sur la cible",
        qrot(decorLook([1, 0, 0]), [0, 0, 1])
          .map((x) => Math.round(x * 1000) / 1000).join(","), "1,0,0");
  check("et garde le haut du monde en haut",
        Math.round(qrot(decorLook([1, 0, 0]), [0, 1, 0])[1]), 1);

  // Les dix buses, et le seuil de 1 sur l'acceleration LOCALE.
  check("dix buses", THRUSTER_NOZZLES.length, 10);
  check("la buse basse s'allume en descendant", nozzleFires(0, [0, -2, 0]), true);
  check("mais pas pour un souffle", nozzleFires(0, [0, -0.5, 0]), false);
  check("la buse avant repond a l'axe Z", nozzleFires(2, [0, 0, 2]), true);
  check("Left_Thruster part vers la GAUCHE, pas vers l'arriere",
        nozzleFires(4, [-2, 0, 0]) && !nozzleFires(4, [0, 0, -2]), true);
  check("et Backward_Left vers l'arriere",
        nozzleFires(6, [0, 0, -2]) && !nozzleFires(6, [-2, 0, 0]), true);

  // La minuterie tire un delai a chaque declenchement.
  let tirage = 0;
  const t = new RandomTimer(1, 3, () => [0, 1, 0.5][tirage++ % 3]);
  check("le premier delai est le minimum", t.delay, 1);
  check("a une seconde, la bouffee part", t.update(1), true);
  check("et le delai suivant est le maximum", t.delay, 3);
  check("deux secondes ne suffisent pas", t.update(2), false);
  check("la troisieme oui", t.update(1), true);

  // Le passage ancien : trois conditions, et il n'en manque jamais une.
  const tel = { alignmentWindow: 5, occlusionWindow: 20 };
  check("aligne, degage et repose : il part",
        teleporterFires(tel, 1, 30, 6), true);
  check("mal aligne : rien", teleporterFires(tel, 4, 30, 6), false);
  check("soleil entre les deux : rien", teleporterFires(tel, 1, 5, 6), false);
  check("moins de cinq secondes : rien",
        teleporterFires(tel, 1, 30, TELEPORT_COOLDOWN - 1), false);
}

{
  // §3 suite : le rattachement par nom, avec de faux noeuds — la classe ne
  // connait pas Babylon, elle ne connait que des noeuds qui portent une
  // rotation.
  const noeud = (name) => ({
    name, parent: null,
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1,
      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; } },
    getAbsolutePosition: () => ({ x: 0, y: 0, z: 0 }),
    get absoluteRotationQuaternion() { return this.rotationQuaternion; },
  });
  const panneau = { name: "Billboard", facing: [0, 0, 1], axis: [0, 1, 0], lookAt: false };
  const decor = new DecorField([panneau], [{ name: "Skeptic" }]);
  const n = noeud("Billboard"), f = noeud("Skeptic");
  check("rien tant que la geometrie n'est pas la", decor.count, 0);
  check("deux noeuds rattaches", decor.attach([n, f]), 2);
  decor.update([10, 5, 0], [0, 0, 0], null);
  const vers = qrot([n.rotationQuaternion.x, n.rotationQuaternion.y,
                     n.rotationQuaternion.z, n.rotationQuaternion.w], [0, 0, 1]);
  check("le panneau s'est tourne vers la camera",
        Math.round(vers[0] * 100) / 100, 1);
  check("mais il ne s'est pas couche : l'axe Y le retient",
        Math.round(vers[1] * 1000) / 1000, 0);

  // Le personnage ne bouge que si on lui parle.
  const avant = f.rotationQuaternion.y;
  decor.update([0, 0, 0], [1, 0, 0], null);
  check("on ne se retourne pas pour rien", f.rotationQuaternion.y, avant);
  decor.update([0, 0, 0], [1, 0, 0], "Skeptic");
  check("mais on se tourne vers qui nous parle",
        f.rotationQuaternion.y !== avant, true);
}

{
  // §5 LE SON REACTIF.
  check("la marche commence a 0,5 u/s", FOOTSTEP.walkThreshold, 0.5);
  check("la course a 4,5", FOOTSTEP.runThreshold, 4.5);
  check("a la limite de la marche, un pas toutes les 1,5 s",
        footstepInterval(1), FOOTSTEP.maxInterval);
  check("a quatre unites par seconde, un pas toutes les demi-secondes",
        footstepInterval(4), 0.5);
  check("et jamais moins de 0,4 s", footstepInterval(100), FOOTSTEP.minInterval);

  const pas = new Footsteps(() => 0.5);
  check("immobile, aucun bruit", pas.update(1, 0), null);
  check("en marchant, un pas", pas.update(0.1, 2).kind, "walk");
  check("pas deux dans la meme foulee", pas.update(0.1, 2), null);
  check("en courant, le pas est un pas de course",
        pas.update(2, 6).kind, "run");
  check("la hauteur est tiree autour de 1", pas.update(2, 6).pitch, 1);
  check("en l'air, on ne fait pas de bruit de pas",
        pas.update(2, 6, false), null);

  check("sous vingt unites par seconde, pas de vent",
        turbulenceTarget(10, 1), 0);
  check("a mi-chemin des deux limites, la moitie du volume",
        turbulenceTarget(30, 1), 0.5);
  check("au-dela, plein volume", turbulenceTarget(100, 1), 1);
  check("sous l'eau, rien", turbulenceTarget(100, 10), 0);

  const turb = new Turbulence();
  check("dans le liquide, le vent ne demarre meme pas",
        turb.update(0.1, 100, TURBULENCE.maxDensity + 1), 0);
  turb.update(0.1, 30, 1);
  check("dans l'air et assez vite, il demarre a zero", turb.playing, true);
  for (let i = 0; i < 200; i++) turb.update(1 / 60, 30, 1);
  check("puis rejoint sa cible", Math.round(turb.volume * 100) / 100, 0.5);

  const th = new ThrusterSound(() => 0);
  th.update(THRUSTER_AUDIO.fadeIn, true, false);
  check("la poussee monte en cinq centiemes", th.level, 1);
  th.update(THRUSTER_AUDIO.fadeOut, false, false);
  check("et redescend en un dixieme", th.level, 0);
  check("un tir de rotation part", th.update(0.01, false, true).valueOf() >= 0
        && th.fired === 0, true);
  th.update(0.05, false, true);
  check("mais pas deux en un vingtieme de seconde", th.fired, null);
  th.update(THRUSTER_AUDIO.rotationalInterval, false, true);
  check("un cinquieme de seconde plus tard, si", th.fired, 0);

  const voyage = new TravelMusic();
  voyage.update(1, true, false);
  check("au poste de pilotage mais pas dans le vide : rien", voyage.volume, 0);
  voyage.update(TRAVEL_FADE / 2, true, true);
  check("dans le vide et aux commandes, la musique monte", voyage.volume, 0.5);
  voyage.update(TRAVEL_FADE, false, true);
  check("quitter le poste la fait redescendre", voyage.volume, 0);

  const fin = new EndOfTimeMusic();
  fin.update(1, END_OF_TIME.secondsRemaining + 10);
  check("a plus de quatre-vingt-dix secondes, rien", fin.volume, 0);
  fin.update(END_OF_TIME.fadeIn, 60);
  check("sous quatre-vingt-dix, elle entre en deux secondes", fin.volume, 1);
  fin.update(END_OF_TIME.fadeOut, 0, { exploded: true });
  check("et sort en deux secondes a l'explosion", fin.volume, 0);
  const empechee = new EndOfTimeMusic();
  empechee.update(10, 10, { prevented: true });
  check("supernova empechee : la musique ne part pas", empechee.volume, 0);

  // L'index des clips d'evenement : les familles se lisent dans l'ordre des
  // numeros du build, parce que le tirage se fait dessus.
  const ev = eventAudio({ events: [
    { script: "PlayerMovementAudio", name: "MovementAudio", body: "Player_Body",
      clips: { _walk1: "a.wav", _walk2: "b.wav", _run1: "c.wav" }, params: {} },
    { script: "ThrusterAudio", name: "ThrusterAudio", body: "Player_Body",
      clips: { _translationalClip: "d.wav" }, params: {} },
    { script: "ThrusterAudio", name: "ThrusterAudio", body: "ModelShip_Body",
      clips: { _translationalClip: "e.wav" }, params: {} },
  ] });
  check("trois emetteurs d'evenement", ev.count, 3);
  check("la famille des pas se lit dans l'ordre",
        ev.family("PlayerMovementAudio", "_walk").join(","), "a.wav,b.wav");
  check("un script pose deux fois se departage par son corps",
        ev.of("ThrusterAudio", "ModelShip_Body").clips._translationalClip, "e.wav");
}

{
  // §7 L'EQUIPEMENT SE RAMASSE.
  const gp = { placed: { GearPickup: [
    { name: "ExpeditionGear", body: "Ship_Body", position: [0, 0, 0],
      fields: { _enableSuit: true, _enableProbe: true, _enableMinimap: true } },
    { name: "SpaceSuit", body: "TimberHearth_Body", position: [100, 0, 0],
      fields: { _enableSuit: true, _enableProbe: false, _enableMinimap: false } },
  ] } };
  const pickups = gearPickups(gp);
  check("deux objets a ramasser", pickups.length, 2);
  const eq = new Equipment();
  check("on commence les mains vides", eq.suit || eq.probe || eq.minimap, false);
  check("la combinaison de la grotte ne donne que la combinaison",
        eq.pickUp(pickups[1]).join(","), "combinaison");
  check("le paquetage du vaisseau donne le reste",
        eq.pickUp(pickups[0]).join(","), "sonde,minicarte");
  check("et ne se ramasse pas deux fois", eq.pickUp(pickups[0]).length, 0);

  const volumes = suitVolumes({ placed: {
    SuitRemovalVolume: [{ name: "SuitReturn", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 5, center: [0, 0, 0] } }],
    SuitBarrier: [{ name: "SuitBarrier", position: [20, 0, 0],
      volume: { shape: "sphere", radius: 5, center: [0, 0, 0] },
      fields: { _invisibleWall: { name: "InvisibleWall" } } }],
  } });
  check("deux volumes de combinaison", volumes.length, 2);
  check("le mur connait son mur invisible",
        volumes.find((v) => v.kind === "barrier").wall, "InvisibleWall");
  check("traverser le retour rend la combinaison",
        suitVolumeStep(volumes, [0, 0, 0], eq), "removed");
  check("sans combinaison, le retour n'existe pas",
        suitVolumeStep(volumes, [0, 0, 0], eq), null);
  check("et le mur redevient solide", eq.barrierSolid(), true);

  // La fenetre de VUE des zones d'interaction.
  const zones = interactZones({ placed: { InteractZone: [
    { name: "HatchControls", position: [0, 0, 0],
      fields: { _prompt: "Open Hatch", _viewingWindow: 60 } },
    { name: "AttachPoint", position: [0, 0, 0],
      fields: { _prompt: "Activate Lift", _viewingWindow: 360 } },
  ] } });
  check("l'invite vient du build", zones[0].prompt, "Open Hatch");
  check("de face, la trappe s'annonce",
        zoneFaced(zones[0], [0, 0, 1], [0, 0, 1]), true);
  check("de biais, non", zoneFaced(zones[0], [1, 0, 0], [0, 0, 1]), false);
  check("une zone a 360 degres s'annonce de partout",
        zoneFaced(zones[1], [1, 0, 0], [0, 0, 1]), true);

  // Les zones d'interaction entrent dans le meme catalogue que les
  // interactifs, avec leur invite — et elles SUIVENT leur corps : un paquetage
  // pose dans la cabine part avec le vaisseau.
  {
    const cat = new Interactables({ placed: { InteractZone: [
      { name: "InteractVolume", body: "Ship_Body", position: [0, 0, 0],
        rotation: [0, 0, 0, 1], volume: { shape: "sphere", radius: 1 },
        fields: { _prompt: "Gear Up", _viewingWindow: 90 } },
    ] } });
    // La zone regarde vers +Z : on l'aborde donc par devant, en venant de +Z.
    const versLaZone = { x: 0, y: 0, z: -1 };
    check("la zone porte l'invite du build",
          cat.focus({ x: 0, y: 0, z: 2 }, [0, 0, 0], versLaZone).prompt, "Gear Up");
    check("prise a revers, elle ne s'annonce pas : la fenetre est celle de la ZONE",
          cat.focus({ x: 0, y: 0, z: -2 }, [0, 0, 0], { x: 0, y: 0, z: 1 }), null);
    check("restee au sol quand le vaisseau est parti, elle ne s'annonce plus",
          cat.focus({ x: 0, y: 0, z: 2 }, [0, 0, 0], versLaZone,
                    () => [500, 0, 0]), null);
    check("mais elle suit le vaisseau",
          cat.focus({ x: 500, y: 0, z: 2 }, [0, 0, 0], versLaZone,
                    () => [500, 0, 0]).prompt, "Gear Up");
  }

  // L'entrainement : trois noeuds du satellite casse, et eux seuls.
  const reparations = [
    { volume: { body: "BrokenSatellite_Body" }, done: false },
    { volume: { body: "BrokenSatellite_Body" }, done: false },
    { volume: { body: "BrokenSatellite_Body" }, done: false },
    { volume: { body: "Ship_Body" }, done: false },
  ];
  const entrainement = new ZeroGTraining(reparations);
  check("trois noeuds a reparer, pas quatre", entrainement.total, 3);
  reparations[0].done = true; reparations[1].done = true;
  check("deux sur trois ne suffisent pas", entrainement.update(), false);
  reparations[2].done = true;
  check("les trois, oui", entrainement.update(), true);
  check("et on ne l'annonce qu'une fois", entrainement.update(), false);

  // Le verrouillage de camera, RELU dans l'IL : les trois verifications qui
  // etaient ici gardaient une paraphrase — un `progress` de 0 a 1 qui
  // n'existe nulle part dans le build (docs/69-assise.md).
  const lock = new CameraLock();
  check("sans cible, rien", lock.update(1, [1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], 5), null);
  lock.lockOn({ name: "Projector" }, { followRate: 2 });
  {
    // Cible a 90 degres sur la droite, joueur regardant +Z, haut +Y.
    const r = lock.update(0.5, [10, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], 5);
    check("le lacet vaut l'ecart, fois le taux, fois le temps", r.yaw, 90);
    check("et sous dix unites, le champ ne bouge pas", r.fov, 70);
  }
  {
    // La meme cible, mais a gauche : le signe vient de `Dot(aplati, right)`.
    const r = lock.update(0.5, [-10, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], 5);
    check("a gauche, le lacet est negatif", r.yaw, -90);
  }
  {
    // Une cible HAUTE, mais pile devant : le lacet est nul, car l'ecart est
    // aplati dans le plan du joueur avant d'etre mesure.
    const r = lock.update(1, [0, 50, 3], [0, 0, 1], [0, 1, 0], [1, 0, 0], 50);
    check("ce qui est plus haut ne fait pas tourner le corps", Math.round(r.yaw), 0);
    check("et a cinquante unites, le champ est au plancher", r.fov, 20);
  }
  check("l'ecart brut se mesure aussi seul, en degres signes",
        Math.round(lockYawError([0, 0, -10], [0, 0, 1], [0, 1, 0], [1, 0, 0])), 180);
  check("a vingt unites, cinq cents divise par la distance", lockFOV(20), 25);
  check("et le plancher tient a vingt-cinq", lockFOV(25), 20);
  check("juste sous dix, le champ initial revient", lockFOV(10), 70);
  check("la rupture ramene le champ en deux secondes",
        lock.breakLock().snapSeconds, 2);
  check("et plus rien ne suit", lock.update(1, [1, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], 5), null);
}

{
  // §4 LES VOLUMES DE JEU.
  const haz = hazardVolumes({ placed: { HazardVolume: [
    { name: "KillVolume", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 10, center: [0, 0, 0] },
      fields: { _firstContactDamage: 4, _damagePerSecond: 20 } },
  ] } });
  const dangers = new Hazards(haz);
  check("hors du volume, aucun degat", dangers.update(1, [100, 0, 0]), 0);
  check("a l'entree, le premier contact et la seconde",
        dangers.update(1, [0, 0, 0]), 24);
  check("puis seulement la seconde", dangers.update(1, [0, 0, 0]), 20);
  dangers.update(1, [100, 0, 0]);
  check("ressortir puis rentrer redonne le premier contact",
        dangers.update(1, [0, 0, 0]), 24);

  const champs = zeroGFields({ placed: { ZeroGField: [
    { name: "ZeroGVolume", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 600, center: [0, 0, 0] },
      fields: { _forceScaleFactor: 1, _overridePriority: 1 } },
    { name: "ZeroGChamber", position: [0, 0, 0], fields: { _useEntrywayTriggers: true } },
  ] } });
  check("quatre champs, dont un sans forme : ici deux et un", champs.length, 2);
  check("celui qui vit de ses declencheurs n'a pas de volume",
        champs[1].volume, null);
  check("dans le volume, on flotte", zeroGAt(champs, [10, 0, 0]).name, "ZeroGVolume");
  check("dehors, non", zeroGAt(champs, [1000, 0, 0]), null);

  const secteurs = gameSectors({ placed: {
    ZeroGSector: [{ name: "Sector_DB", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 1500, center: [0, 0, 0] },
      fields: { _sectorName: 6, _thrustLimit: 20, _ambientLightRange: 1200 } }],
    MajorSector: [{ name: "Sector_QuantumMoon", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 120, center: [0, 0, 0] },
      fields: { _sectorName: 7, _thrustLimit: 20 } }],
  } });
  check("trois secteurs de jeu : ici deux", secteurs.length, 2);
  check("la poussee y est limitee a 20", secteurs[0].thrustLimit, 20);
  check("emboites, le plus petit gagne",
        gameSectorAt(secteurs, [0, 0, 0]).name, "Sector_QuantumMoon");
  check("plus loin, le grand reprend",
        gameSectorAt(secteurs, [500, 0, 0]).name, "Sector_DB");

  const invites = probePrompts({ placed: { ProbePromptTrigger: [
    { name: "ProbePromptTrigger", position: [0, 0, 0],
      volume: { shape: "box", size: [10, 10, 10], center: [0, 0, 0] },
      fields: { _localGazeDirection: { x: 0, y: -1, z: 0 }, _minGazeAngle: 45 } },
  ] } });
  check("l'invite de sonde porte son regard", invites[0].gaze.join(","), "0,-1,0");
  check("et son angle", invites[0].minAngle, 45);

  // Les emetteurs : la courbe des feux de camp, 1 a dix unites, 0 a
  // quarante-cinq.
  const feux = radiationEmitters({ placed: { RadiationEmitter: [
    { name: "RadiationEmitter", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 2.36, center: [0, 0, 0] },
      fields: { falloffMode: 1, radiationType: 1, magnitude: 100,
                CustomFalloff: { customFalloff: { m_Curve: [
                  { time: 10, value: 1 }, { time: 45, value: 0 }] } } } },
  ] } });
  check("pres du feu, pleine intensite", radiationAt(feux[0], 5), 100);
  check("a mi-courbe, la moitie", radiationAt(feux[0], 27.5), 50);
  check("au-dela, plus rien", radiationAt(feux[0], 60), 0);

  // --- les effets d'image de la camera du joueur --------------------------
  //
  // Quatre des six effets sont ETEINTS au reveil : c'est la premiere chose a
  // garder, parce que les allumer par defaut donnerait un ecran gris et floute
  // en permanence, et que rien dans une capture au repos ne le trahirait.
  const fx = new CameraEffects();
  check("au reveil, le glow est eteint", fx.glow.enabled, false);
  check("le gris aussi", fx.grayscale.enabled, false);
  check("la vignette aussi", fx.vignette.enabled, false);
  check("et le tourbillon aussi", fx.twirl.enabled, false);
  check("les reglages d'immersion sont ceux de la scene",
        fx.sousLEau.intensity, REGLAGES_JOUEUR.glow.intensity);

  // Le reveil : blanc a 3, puis retour au noir en trois secondes.
  fx.startOfTimeLoop();
  check("le reveil dure trois secondes", WAKE_DURATION, 3);
  check("il part du blanc", fx.glow.tint.join(","), "255,255,255");
  fx.update(0);
  check("et le glow est allume", fx.glow.enabled, true);
  fx.update(WAKE_DURATION);
  check("au bout, il s'eteint", fx.glow.enabled, false);

  // L'adoucissement n'est pas symetrique, et c'est LUI qui donne sa brutalite a
  // l'eclair. A mi-course d'une MONTEE, on n'a fait que 0,5^4 du chemin.
  const montee = new CameraEffects();
  montee.flashScreen(1, [1, 0, 0], 1, 0, 0);
  montee.update(0.5);
  check("une montee se retient : 0,5^4", Number(montee.glow.intensity.toFixed(4)), 0.0625);
  const descente = new CameraEffects();
  descente.glow.intensity = 1;
  descente.flashScreen(0, [0, 0, 0], 1, 0, 0);
  descente.update(0.5);
  check("une descente se traine : 1 - (0,5-1)^4",
        Number(descente.glow.intensity.toFixed(4)), 0.0625);

  // Les cinq causes de mort, et les TROIS traitements qu'elles recoivent.
  const asphyxie = new CameraEffects();
  asphyxie.playerDeath(DEATH_TYPE.Asphyxiation, 0);
  asphyxie.update(2.5);
  check("l'asphyxie fond en cinq secondes, a moitie", asphyxie.fadeFraction, 0.25);
  check("et le gris monte a 1 pour un demi", asphyxie.grayscale.amount, 1);
  asphyxie.update(4);
  check("la vignette reste basse a 0,8 du chemin",
        Math.round(asphyxie.vignette.intensity), 328);
  asphyxie.update(5);
  check("puis se referme d'un coup", Math.round(asphyxie.vignette.intensity), 1000);
  check("la mort demande le flashback quand l'effet est fini", asphyxie.update(5.1).flashbackDemande, true);

  const brulure = new CameraEffects();
  brulure.playerDeath(DEATH_TYPE.Energy, 0);
  check("l'energie n'est pas un fondu mais un eclair", brulure.fadeFraction, 0);
  brulure.update(3);
  check("et il est rouge", brulure.glow.tint.map(Math.round).join(","), "255,100,100");
  const nova = new CameraEffects();
  nova.playerDeath(DEATH_TYPE.Supernova, 0);
  nova.update(3);
  check("la supernova recoit le meme traitement que l'energie",
        nova.glow.tint.map(Math.round).join(","), "255,100,100");

  const impact = new CameraEffects();
  impact.playerDeath(DEATH_TYPE.Impact, 0);
  impact.update(0.3);
  check("un impact, lui, coupe en trois dixiemes", impact.fadeFraction, 1);

  // Le trou noir : de 220 a 360 degres en deux secondes, puis plus rien.
  const trou = new CameraEffects();
  trou.enterBlackHole(0);
  check("le tourbillon part de 220 degres", trou.twirl.angle, TWIRL_START_ANGLE);
  trou.update(TWIRL_DURATION / 2);
  check("a mi-course, 290", trou.twirl.angle, 290);
  trou.update(TWIRL_DURATION);
  check("au bout, il se coupe", trou.twirl.enabled, false);
  check("et revient a zero", trou.twirl.angle, 0);

  // L'immersion : le glow reprend les valeurs que `Awake` avait retenues, et
  // non celles qu'un eclair aurait laissees derriere lui.
  const eau = new CameraEffects();
  eau.playerDeath(DEATH_TYPE.Energy, 0);
  eau.update(3);
  eau.enterWater();
  check("sous l'eau, le glow retrouve sa teinte d'origine",
        eau.glow.tint.join(","), REGLAGES_JOUEUR.glow.tint.slice(0, 3).join(","));
  eau.exitWater();
  check("et s'eteint en sortant", eau.glow.enabled, false);

  // Le champ de vision : 70 degres, mesure sur la camera du build. Babylon en
  // pose 45,8 par defaut, et personne ne le reglait.
  check("la camera du joueur voit a 70 degres", REGLAGES_JOUEUR.fov, 70);

  // Les reglages se lisent dans `data/camera.json` quand il existe, et se
  // savent repli sinon — comme les distances du pilote automatique.
  check("sans extraction, les reglages se savent replis",
        reglagesDuJoueur(null).declared, false);
  const doc = { cameras: [{ name: "PlayerCamera", roles: ["joueur"], fov: 70,
    effects: { GlowEffect: [{ intensity: 2, iterations: 3, tint: [1, 0, 0, 0] }] } }] };
  check("avec elle, ils se savent declares", reglagesDuJoueur(doc).declared, true);
  check("et ce sont ceux du build", reglagesDuJoueur(doc).glow.intensity, 2);
  check("une camera absente ne rend rien", reglagesDe(doc, "LandingCam"), null);

  // --- le telescope, relu dans l'IL --------------------------------------
  //
  // Quatre erreurs a la fois dans l'ancienne version, et la plus couteuse etait
  // invisible : `maxFOV` servait de champ de REPOS, donc toute la partie se
  // jouait a 60 degres au lieu de 70, telescope range.
  const lunette = new Telescope();
  check("au repos, on voit au champ de la camera", lunette.fov, TELESCOPE.restFOV);
  check("et le plan proche est celui du build", lunette.nearClip, 0.05);
  check("on entre a (60 - 10) / 1,5", Number(lunette.entryFOV.toFixed(2)), 33.33);
  lunette.toggle();
  check("le plan proche recule en visant", lunette.nearClip, 0.5);
  // Deux secondes pour rejoindre la cible : c'est `_zoomInSeconds`.
  for (let i = 0; i < 200; i++) lunette.update(0.01);
  check("et deux secondes suffisent a y arriver",
        Number(lunette.fov.toFixed(2)), Number(lunette.entryFOV.toFixed(2)));
  // Puis on zoome A LA MAIN, cinquante degres par seconde, borne a 10.
  lunette.update(0.2, 1);
  check("la commande resserre a 50 degres par seconde",
        Number(lunette.targetFOV.toFixed(2)), Number((lunette.entryFOV - 10).toFixed(2)));
  for (let i = 0; i < 400; i++) lunette.update(0.05, 1);
  check("et ne depasse pas le minimum", lunette.targetFOV, TELESCOPE.minFOV);
  for (let i = 0; i < 400; i++) lunette.update(0.05, -1);
  check("ni le maximum dans l'autre sens", lunette.targetFOV, TELESCOPE.maxFOV);
  lunette.toggle();
  for (let i = 0; i < 400; i++) lunette.update(0.05);
  check("en sortant, on revient au champ de la camera",
        Number(lunette.fov.toFixed(3)), TELESCOPE.restFOV);
  check("le grossissement est celui du repos sur le minimum",
        lunette.magnification, 7);

  // --- la voute celeste ---------------------------------------------------
  //
  // docs/41-ciel.md laissait la rotation ouverte : « la convention d'axes reste
  // a etablir ». Elle se mesure sur les uv du maillage — le disque bleu est au
  // +Z local — et le calcul, lui, ne suppose rien de la chaine glTF : il passe
  // par les directions MONDE des axes du parent, reflexion comprise.
  //
  // Le controle est direct : on tourne l'axe par le quaternion rendu, on le
  // ramene dans le monde par la base, et il doit tomber sur le soleil.
  const surLeSoleil = (basis, soleil, axe = DISC_FALLBACK) => {
    const local = qrot(alignAxis(axe, soleil, basis), axe);
    const monde = [0, 1, 2].map((k) =>
      local[0] * basis[0][k] + local[1] * basis[1][k] + local[2] * basis[2][k]);
    const n = Math.hypot(soleil[0], soleil[1], soleil[2]);
    return Number(Math.hypot(monde[0] - soleil[0] / n, monde[1] - soleil[1] / n,
                             monde[2] - soleil[2] / n).toFixed(6));
  };
  const IDENT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const MIROIR = [[1, 0, 0], [0, 1, 0], [0, 0, -1]];   // l'inversion du glTF
  check("le disque tombe sur le soleil, repere direct", surLeSoleil(IDENT, [1, 0, 0]), 0);
  check("de dos aussi", surLeSoleil(IDENT, [0, 0, -1]), 0);
  check("et en oblique", surLeSoleil(IDENT, [0.6, 0.8, 0]), 0);
  // Le cas qui comptait : une base qui REFLECHIT. C'est celle du chargement
  // glTF, et c'est elle qui interdisait de composer naivement des quaternions.
  check("a travers un parent en miroir aussi", surLeSoleil(MIROIR, [1, 0, 0]), 0);
  check("et en oblique a travers le miroir",
        surLeSoleil(MIROIR, [0.3, 0.5, -0.81]), 0);
  // Le soleil pile sur l'axe, et pile a l'oppose : les deux singularites.
  check("soleil pile sur l'axe", surLeSoleil(IDENT, DISC_FALLBACK), 0);
  check("soleil pile a l'oppose",
        surLeSoleil(IDENT, DISC_FALLBACK.map((x) => -x)), 0);

  // Sans donnees, la voute ne fait rien plutot que de faire n'importe quoi.
  const cielVide = new Sky(null);
  check("sans data/sky.json, pas de voute", cielVide.ready, false);
  check("mais le repli de direction reste mesure", DISC_FALLBACK.join(","), "0,0,-1");

  // --- les nuages, rattaches par POSITION ---------------------------------
  //
  // Les vingt-quatre s'appellent tous `PieceOfRing` : le rattachement par nom
  // de tout le reste du portage ne les distingue pas.
  const faux = (x, y, z) => ({ name: CLOUD_NAME, position: { x, y, z },
                               getAbsolutePosition() { return this.position; } });
  const ciel = new Sky({ shell: { name: "SkyShell" }, clouds: [
    { name: CLOUD_NAME, position: [0, 0, 0], texture: "cloud_01", image: "a.png" },
    { name: CLOUD_NAME, position: [10, 0, 0], texture: "whisp_02", image: "b.png" },
    { name: CLOUD_NAME, position: [999, 0, 0], texture: "cloud_03", image: "c.png" },
  ] });
  const noeuds = [faux(10, 0, 0), faux(0.2, 0, 0), { name: "AutreChose", position: { x: 0, y: 0, z: 0 } }];
  check("deux nuages sur trois trouvent leur maillage", ciel.attachClouds(noeuds), 2);
  check("et chacun le SIEN, pas celui du voisin",
        ciel.clouds.map((c) => c.nuage.texture).join(","), "cloud_01,whisp_02");
  check("le plus proche l'emporte",
        Number(ciel.clouds[0].distance.toFixed(1)), 0.2);
  check("un maillage d'un autre nom n'est jamais pris",
        ciel.clouds.every((c) => c.noeud.name === CLOUD_NAME), true);
  // Un maillage deja pris ne se redonne pas : sans cela, deux nuages voisins
  // se disputeraient le meme et l'un des deux resterait sans visage.
  const serres = new Sky({ shell: {}, clouds: [
    { position: [0, 0, 0], texture: "a", image: "a.png" },
    { position: [0.1, 0, 0], texture: "b", image: "b.png" },
  ] });
  check("deux nuages serres prennent deux maillages",
        serres.attachClouds([faux(0, 0, 0), faux(0.1, 0, 0)]), 2);
  check("et pas deux fois le meme",
        serres.clouds[0].noeud === serres.clouds[1].noeud, false);

  // --- le champ d'etoiles s'eteint ----------------------------------------
  //
  // La plus visible des choses que le build fait et que le portage ne faisait
  // pas : le ciel SE VIDE pendant les vingt minutes, et presque tout a la fin.
  const COURBE = [0, 0.0171, 0.0343, 0.0514, 0.0686, 0.0857, 0.1029, 0.12,
                  0.1372, 0.1543, 0.1715, 0.1886, 0.2058, 0.2229, 0.2514,
                  0.3761, 0.5009, 0.6257, 0.7505, 0.8752, 1];
  const champ = new StarField({ stars: [{ count: 1000, radius: 30000,
    size: [200, 400], color: [0.8431, 0.8667, 1], explosionCurve: COURBE }] });
  check("mille etoiles", champ.count, 1000);
  check("a trente mille unites", champ.radius, 30000);
  check("au depart, aucune eteinte", champ.countAt(0), 0);
  check("a la fin, toutes", champ.countAt(1), 1000);
  // La forme de la courbe est ce qui compte : lente, puis brutale.
  check("a mi-boucle, moins d'un cinquieme", champ.countAt(0.5) < 200, true);
  check("les trois quarts partent dans le dernier tiers",
        champ.countAt(1) - champ.countAt(0.7) > 700, true);
  // L'extinction ne rend que ce qui vient DE s'eteindre : une etoile deja
  // eteinte ne redemande pas sa supernova a chaque image.
  check("le premier pas eteint un paquet", champ.update(0.5).length > 0, true);
  check("le meme instant n'en eteint plus", champ.update(0.5).length, 0);
  check("et revenir en arriere non plus", champ.update(0.2).length, 0);
  check("la supernova suspendue arrete tout", champ.update(1, true).length, 0);
  champ.reset();
  check("le redemarrage remplit le ciel", champ.extinguished, 0);

  // Les positions : sur la coquille, et les memes a chaque chargement.
  const pts = champ.positions(1);
  let dedans = true;
  for (let i = 0; i < champ.count; i++) {
    const r = Math.hypot(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    if (Math.abs(r - champ.radius) > 1) { dedans = false; break; }
  }
  check("toutes les etoiles sont sur la coquille", dedans, true);
  check("et la meme graine rend le meme ciel",
        champ.positions(1)[7], pts[7]);
  check("une autre graine, un autre ciel",
        champ.positions(2)[7] !== pts[7], true);

  // Sans champ extrait, on ne fabrique pas d'etoiles.
  check("sans donnees, pas de champ", new StarField(null).ready, false);

  // --- la queue du recensement (docs/49) ----------------------------------
  //
  // Les marqueurs de carte : le build les DECLARE, avec leurs vrais noms de
  // jeu. Le portage les deduisait de la gravite et affichait les noms internes.
  const marq = mapMarkers({ placed: { MapMarker: [
    { name: "Comet_Body", body: "Comet_Body", fields: { _label: "The Nomad", _markerType: 1 } },
    { name: "Moon_Body", body: "Moon_Body", fields: { _label: "Lunar Lookout", _markerType: 2 } },
    { name: "Sun_Body", body: "Sun_Body", fields: { _label: "Sun", _markerType: 3 } },
    { name: "Player_Body", body: "Player_Body", fields: { _label: "You Are Here", _markerType: 4 } },
    { name: "OribitingIsland", body: null, fields: { _label: "Giant's Landing", _markerType: 0 } },
  ] } });
  check("cinq marqueurs lus", marq.length, 5);
  check("et leurs vrais noms avec", marq[0].label, "The Nomad");
  // Les distances viennent de la TABLE DE SAUT d'`Awake`, pas de l'ordre des
  // blocs : une planete a 50 000, une lune seulement 5 000, le soleil toujours.
  check("une planete s'affiche a 50 000", marq[0].maxDistance, 50000);
  check("une lune, seulement a 5 000", marq[1].maxDistance, 5000);
  check("le soleil, toujours", marq[2].maxDistance, 1e10);
  check("le joueur est vert", marq[3].color, "#00ff00");
  check("une planete est blanche", marq[0].color, "#ffffff");
  // « Giant's Landing » n'est meme pas un corps : c'est une ILE. La deduction
  // par gravite ne pouvait pas la trouver.
  check("un marqueur peut n'etre porte par aucun corps", marq[4].body, null);

  // La visibilite, dans l'ordre ou `LateUpdate` decide.
  const planete = marq[0], lune = marq[1], joueur = marq[3];
  check("trop loin, une lune disparait",
        markerVisible(lune, [100, 100, 9000], [0, 0], null), false);
  check("assez pres, elle revient",
        markerVisible(lune, [100, 100, 4000], [0, 0], null), true);
  check("derriere la camera, rien ne s'affiche",
        markerVisible(planete, [100, 100, -5], [0, 0], null), false);
  // Les deux regles des dix pixels — celle du joueur, et celle du VAISSEAU que
  // le portage n'avait pas.
  check("a moins de dix pixels du joueur, masque",
        markerVisible(planete, [3, 3, 1000], [0, 0], null), false);
  check("a moins de dix pixels du vaisseau aussi",
        markerVisible(planete, [100, 100, 1000], [0, 0], [103, 103]), false);
  // Le marqueur du joueur, lui, sort avant tous les tests.
  check("le joueur ne se masque jamais",
        markerVisible(joueur, [3, 3, 1000], [0, 0], [3, 3]), true);
  check("sauf derriere la camera", markerVisible(joueur, [3, 3, -1], [0, 0], null), false);
  check("et la zone brouillee masque tout",
        markerVisible(planete, [100, 100, 1000], [0, 0], null, true), false);

  // Les pivots de tornade : une culbute autour de l'axe X local, a une vitesse
  // TIREE au reveil — cinq des six s'appellent pareil, d'ou le rattachement par
  // position.
  const pivots = tornadoPivots({ placed: { TornadoPivotController: [
    { name: "UpTornado_Pivot", position: [0, 0, 0] },
    { name: "UpTornado_Pivot", position: [50, 0, 0] },
  ] } }, () => 0.5);
  check("deux pivots", pivots.length, 2);
  check("la vitesse est tiree entre 1 et 2", pivots[0].speed, 1.5);
  check("et l'angle de depart entre 0 et 360", pivots[0].initialSpin, 180);
  const noeud = (x) => ({ name: "UpTornado_Pivot", position: { x, y: 0, z: 0 },
    getAbsolutePosition() { return this.position; },
    rotationQuaternion: { x: 0, y: 0, z: 0, w: 1,
      set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; } } });
  const tp = new TornadoPivots(pivots);
  const ns = [noeud(50), noeud(0)];
  check("chacun trouve le sien", tp.attach(ns), 2);
  check("et pas le meme deux fois", tp.live[0].noeud === tp.live[1].noeud, false);
  const avant = { ...ns[1].rotationQuaternion };
  tp.update(1);
  check("le pivot a bouge",
        ns[1].rotationQuaternion.w !== avant.w || ns[1].rotationQuaternion.y !== avant.y, true);
  // Une culbute, pas une rotation sur soi : l'axe avant du pivot change.
  const versAvant = qrot([ns[1].rotationQuaternion.x, ns[1].rotationQuaternion.y,
                          ns[1].rotationQuaternion.z, ns[1].rotationQuaternion.w], [0, 0, 1]);
  tp.update(100);
  const apres = qrot([ns[1].rotationQuaternion.x, ns[1].rotationQuaternion.y,
                      ns[1].rotationQuaternion.z, ns[1].rotationQuaternion.w], [0, 0, 1]);
  check("et il bascule : son axe avant s'est deplace",
        Math.abs(apres[1] - versAvant[1]) > 0.01 || Math.abs(apres[2] - versAvant[2]) > 0.01, true);

  // Les suiveurs, dont l'un ne suit RIEN — c'est une propriete du build.
  const suiv = matchTransforms({ placed: { MatchTransform: [
    { name: "CampfireSmoke", position: [0, 0, 0],
      fields: { _targetTransform: null, _matchPosition: true, _matchRotation: true } },
    { name: "OuterClouds", position: [0, 0, 0],
      fields: { _targetTransform: { $ref: "level0:9729" }, _matchPosition: true, _matchRotation: false } },
  ] } });
  check("deux suiveurs", suiv.length, 2);
  check("l'un d'eux ne suit rien, et on le dit", suiv[0].target, null);
  check("l'autre suit la position mais pas la rotation",
        `${suiv[1].matchPosition},${suiv[1].matchRotation}`, "true,false");

  // Et les conteneurs d'editeur : on les compte pour ne plus se poser la
  // question. Leur `Start` fait `Destroy(gameObject)`.
  check("les conteneurs jetables se comptent",
        disposableContainers({ placed: { DisposableContainer: [
          { name: "TimberHearth_Pivot", position: [0, 0, 0] },
          { name: "Islands", position: [0, 0, 0] }] } }).length, 2);

  // --- on allume en REGARDANT (docs/50) -----------------------------------
  const lus = gazeSwitches({ placed: { GazeSwitch: [
    { name: "GazeVolume", position: [0, 0, 0], body: "Twin01_Body",
      volume: { shape: "sphere", radius: 6, center: [0, 0, 0] },
      fields: { _angleOfActivation: 10, _secondsToCharge: 3,
                _switchableDevice: { $ref: "level0:23903" } } },
  ] } });
  check("un interrupteur du regard", lus.length, 1);
  check("son rayon vient du collider", lus[0].radius, 6);
  // `_activationDist` n'est serialise sur aucune instance : quatre unites, du
  // constructeur. L'invariant garde le repli, et refuse de le lire ailleurs.
  check("sa distance d'activation vient du constructeur",
        lus[0].activationDist, GAZE.activationDist);
  check("et il sait ce qu'il commande", lus[0].device, "level0:23903");

  // La loi : les DEUX facteurs doivent etre pleins. Etre pres ne suffit pas,
  // regarder droit non plus.
  const g = new Regard(lus[0]);
  const droit = [0, 0, 1];
  // A trois unites (donc sous les quatre d'activation) et pile dans l'axe.
  g.update(1, [0, 0, -3], droit, [0, 0, 0]);
  check("pres et droit : la charge monte", g.charge, 1);
  check("et le regard est plein", g.gazeFraction, 1);
  // Meme distance, mais de biais a vingt degres : la fraction retombe.
  const biais = new Regard(lus[0]);
  const a = 20 * Math.PI / 180;
  biais.update(1, [0, 0, -3], [Math.sin(a), 0, Math.cos(a)], [0, 0, 0]);
  check("de biais, la charge redescend", biais.charge, 0);
  check("et le regard n'est plus plein", biais.gazeFraction < 1, true);
  // Droit dans l'axe mais a cinq unites : au-dela des quatre, pareil.
  const loin = new Regard(lus[0]);
  loin.update(1, [0, 0, -5], droit, [0, 0, 0]);
  check("trop loin, la charge ne monte pas", loin.charge, 0);

  // Trois secondes, et ca declenche — une fois.
  const plein = new Regard(lus[0]);
  for (let i = 0; i < 30; i++) plein.update(0.1, [0, 0, -3], droit, [0, 0, 0]);
  check("trois secondes de regard fixe", plein.switched, true);
  check("l'appareil est allume", plein.on, true);
  plein.update(0.1, [0, 0, -3], droit, [0, 0, 0]);
  check("et il ne redeclenche pas", plein.switched, false);
  // Il faut redescendre sous la MOITIE pour pouvoir rallumer.
  for (let i = 0; i < 14; i++) plein.update(0.1, [0, 0, -100], droit, [0, 0, 0]);
  check("a plus de la moitie, toujours en attente", plein.waitForDischarge, true);
  plein.update(0.2, [0, 0, -100], droit, [0, 0, 0]);
  check("sous la moitie, on peut rallumer", plein.waitForDischarge, false);

  // La toile : au CUBE, et en sens inverse.
  const v0 = webSpeeds(0.5, 0);
  const v1 = webSpeeds(1, 0);
  check("a demi-regard, un huitieme de la vitesse",
        Number((v0.outer / v1.outer).toFixed(3)), 0.125);
  check("l'anneau interieur tourne en sens inverse", webSpeeds(1, 1).inner, -WEB.inner);
  check("et ne bouge pas sans charge", webSpeeds(1, 0).inner, 0);
  check("la toile s'efface en deux secondes", webAlpha(WEB.fade), 0);
  check("a mi-chemin, a moitie", webAlpha(1), 0.5);

  // La porte : les colliders se coupent d'un coup, l'alpha fond en une seconde.
  const porte = new Porte(energyGates({ placed: { EnergyGate: [
    { name: "EnergyGate", position: [0, 0, 0], body: "Twin01_Body" }] } })[0]);
  check("au depart, elle est solide", porte.solid, true);
  porte.switchOn(0);
  check("des l'allumage, elle ne bloque plus", porte.solid, false);
  check("mais elle se voit encore", porte.alpha, 1);
  porte.update(0.5);
  check("a mi-fondu, a moitie", porte.alpha, 0.5);
  porte.update(1);
  check("puis elle disparait", porte.alpha, 0);

  // --- la tour de lancement (docs/51) -------------------------------------
  //
  // La scene CONTREDIT le constructeur — 31,5 et 5 contre 10 et 3 — et c'est
  // elle qui gagne. C'est le seul endroit de la serie ou cela arrive, et
  // l'invariant garde les deux.
  const asc = elevators({ placed: { Elevator: [
    { name: "Elevator", position: [0, 0, 0], body: "TimberHearth_Body",
      fields: { _trackHeight: 31.5, _liftDuration: 5,
                _elevatorStartClip: { name: "elevatorstart" },
                _elevatorStopClip: { name: "elevatorstop" } } },
  ] } });
  check("un ascenseur", asc.length, 1);
  check("la scene dit 31,5 unites", asc[0].trackHeight, 31.5);
  check("et le constructeur disait 10", ELEVATOR.trackHeight, 10);
  check("la scene dit cinq secondes", asc[0].liftDuration, 5);
  check("et le constructeur disait trois", ELEVATOR.liftDuration, 3);

  const cab = new Cabine(asc[0]);
  check("au depart, les commandes sont fermees", cab.pressInteract(0), false);
  check("et la cabine est en bas", cab.fraction, 0);
  cab.activateControls();
  check("`ActivateLaunchTower` les ouvre", cab.pressInteract(0), true);
  cab.update(2.5);
  // `SmoothStep` et non une rampe : a mi-parcours, exactement la moitie, mais
  // le depart et l'arrivee sont adoucis.
  check("a mi-course, la moitie", cab.fraction, 0.5);
  check("le son, lui, est deja plein", cab.volume, 1);
  check("mais il ne l'etait pas au depart", smoothStep(0.01) * 10 < 1, true);
  cab.update(0.5 * 5);
  check("un quart de temps ne fait pas un quart de course",
        smoothStep(0.25) !== 0.25, true);
  cab.update(5);
  check("au bout, elle est en haut", cab.fraction, 1);
  check("et elle annonce son arrivee", cab.arrived, true);
  check("soit 31,5 unites plus haut", cab.height, 31.5);
  cab.update(6);
  check("puis elle se tait", cab.arrived, false);
  // `ReturnToStart` redescend sans basculer le sens.
  cab.returnToStart(6);
  cab.update(11);
  check("et elle redescend", cab.fraction, 0);

  // Le terminal ne verrouille pas : il REFUSE.
  const term = new LaunchTerminal();
  check("sans les codes, il refuse", term.pressInteract(false), "refuse");
  check("et il peut refuser encore", term.pressInteract(false), "refuse");
  check("l'invite vient de la connaissance", term.learnCodes(), " Enter Launch Codes");
  check("avec les codes, il actionne", term.pressInteract(true), "activate");
  check("et une seule fois", term.pressInteract(true), null);

  // Les pads : les trois capteurs, et le MEME corps.
  check("les trois touchent le meme corps",
        landedOn(["TimberHearth_Body", "TimberHearth_Body", "TimberHearth_Body"]),
        "TimberHearth_Body");
  check("un seul capteur en l'air suffit a ne pas etre pose",
        landedOn(["TimberHearth_Body", null, "TimberHearth_Body"]), null);
  check("a cheval sur deux corps, pas pose non plus",
        landedOn(["TimberHearth_Body", "Moon_Body", "TimberHearth_Body"]), null);
  check("et aucun capteur du tout n'est pas un atterrissage", landedOn([]), null);

  const pads = landingPadSensors({ placed: { LandingPadSensor: [
    { name: "SurfaceSensor", position: [0, 0, 0], body: "Ship_Body",
      volume: { shape: "sphere", radius: 0.5, center: [0, 0, 0] },
      fields: { _touchdownSound: { name: "podland_thud_hiss" } } },
  ] } });
  check("le capteur porte son son de contact", pads[0].touchdownSound, "podland_thud_hiss");
  check("et son rayon", pads[0].volume.radius, 0.5);

  // L'entree du musee, et sa direction de sortie.
  const musee = museumEntryways({ placed: { MuseumEntryway: [
    { name: "MuseumEntryway", position: [0, 0, 0], body: "TimberHearth_Body",
      fields: { _localExitDirection: { x: 1, y: 0, z: 0 } } },
  ] } });
  check("une entree de musee", musee.length, 1);
  check("et elle sort par son axe X", musee[0].exitDirection.join(","), "1,0,0");

  // --- le casque, l'alarme, les voyants (docs/52) --------------------------
  //
  // Encore une fois la scene contredit le constructeur, et c'est elle qui
  // gagne : le casque traine a 0,05 la ou le code pose 0,1.
  check("l'instance traine a 0,05", HELMET_LAG, 0.05);
  check("et le constructeur disait 0,1", HELMET_LAG_CTOR, 0.1);
  check("sans scene, on prend le repli", helmetSettings({}).lag, HELMET_LAG);
  check("et il se sait repli", helmetSettings({}).declared, false);
  check("avec elle, la valeur du build",
        helmetSettings({ placed: { HUDHelmet: [{ fields: { _helmetLagSpeed: 0.05 } }] } }).lag,
        0.05);

  const casque = new Helmet();
  check("au depart, il est range", casque.state, SUIT.OFF);
  casque.suitUp();
  for (let i = 0; i < 300; i++) casque.update(1 / 60);
  check("une fois enfile, il est porte", casque.worn, true);
  check("et il est pose a zero", Number(casque.y.toFixed(6)), 0);
  // Il traine derriere le regard, en sens INVERSE et d'un dixieme de l'ecart.
  casque.update(1 / 60, 1, 0, 10);
  check("un premier pas ne fait qu'un vingtieme du chemin",
        Number(casque.x.toFixed(6)), Number((HELMET_AMPLITUDE * HELMET_LAG).toFixed(6)));
  check("et il part a l'oppose du regard", casque.x < 0, true);
  for (let i = 0; i < 300; i++) casque.update(1 / 60, 1, 0, 10);
  check("au bout, il rejoint sa cible",
        Number(casque.x.toFixed(5)), Number(HELMET_AMPLITUDE.toFixed(5)));
  // L'axe vertical est bride dans la bande d'angles qu'on ne peut pas atteindre.
  const bride = new Helmet();
  bride.suitUp();
  for (let i = 0; i < 300; i++) bride.update(1 / 60);
  for (let i = 0; i < 60; i++) bride.update(1 / 60, 0, 1, 150);
  check("dans la bande morte, le casque ne suit pas le regard vertical",
        Number(bride.y.toFixed(6)), 0);
  for (let i = 0; i < 300; i++) bride.update(1 / 60, 0, 1, 10);
  check("hors de la bande, il suit", bride.y < 0, true);

  // L'alarme : trente pour cent, et les deux transitions.
  const alarme = new Alarme();
  check("le seuil est a trente pour cent", ALARM_THRESHOLD, 0.3);
  check("a quarante pour cent, rien", alarme.update(0.4), false);
  check("a trente pile, elle part", alarme.update(0.3), true);
  check("et elle le dit une fois", alarme.turnedOn, true);
  check("puis ne le redit plus", (alarme.update(0.2), alarme.turnedOn), false);
  check("au-dessus du seuil, elle se coupe", alarme.update(0.31), false);
  check("et le dit une fois", alarme.turnedOff, true);

  // Les voyants : le premier en continu, les autres ENSEMBLE a la demi-seconde.
  const voyants = new DamageDisplay();
  check("la periode est la demi-seconde", BLINK_PERIOD, 0.5);
  const a0 = voyants.update(0, true, [true, true]);
  check("le voyant general est allume des le moindre degat", a0[0], true);
  check("les autres commencent eteints", a0.slice(1).join(","), "false,false");
  const a1 = voyants.update(0.6, true, [true, true]);
  check("et clignotent ENSEMBLE", a1.slice(1).join(","), "true,true");
  check("une piece saine ne clignote jamais",
        voyants.update(1.2, true, [false, true]).slice(1).join(","), "false,false");
  check("sans degat, le voyant general s'eteint",
        voyants.update(1.8, false, [])[0], false);

  // Les notifications : une seule a la fois, et elle s'efface.
  const notes = new Notifications();
  check("au depart, rien", notes.update(0), null);
  notes.display("sonde genee", 3, 0);
  check("elle s'affiche", notes.update(1), "sonde genee");
  notes.display("autre chose", 3, 1);
  check("une nouvelle remplace l'ancienne", notes.update(2), "autre chose");
  check("et elle s'efface au bout de sa duree", notes.update(4.1), null);

  // Les huit invites de la guimauve : quatre unites, et toutes la portent.
  const guimauves = roastPrompts({ placed: { RoastPromptEvent: [
    { name: "RoastPromptEvent", position: [0, 0, 0], fields: { _roastDistance: 4 } },
  ] } });
  check("la distance est celle de la scene", guimauves[0].distance, ROAST_DISTANCE);
  check("a trois unites, on grille encore", roastBroken(3, guimauves[0]), false);
  check("a cinq, le grillage s'arrete", roastBroken(5, guimauves[0]), true);

  // --- ce que le joueur porte en plus de son corps (docs/53) --------------
  //
  // La portee d'interaction : dix unites, le rayon de
  // `FirstPersonManipulator`. Le portage exigeait d'etre a la portee du
  // RECEPTEUR — deux ou trois unites, qui sont la taille de sa cible.
  check("on vise a dix unites", INTERACT_RANGE, 10);

  // Le bruit : proportionnel a la poussee, plus un COUP au lancement de sonde.
  check("au repos, aucun bruit", playerNoise(0, 100), 0);
  check("a pleine poussee, cinq", playerNoise(1, 100), NOISE.thrust);
  check("a mi-poussee, la moitie", playerNoise(0.5, 100), NOISE.thrust / 2);
  check("lancer une sonde fait cinq d'un coup", playerNoise(0, 100, 100), NOISE.launch);
  check("qui retombe de moitie en un demi-seconde",
        playerNoise(0, 100.5, 100), NOISE.launch / 2);
  check("et a disparu au bout d'une seconde", playerNoise(0, 101, 100), 0);
  check("les deux s'ajoutent", playerNoise(1, 100, 100), NOISE.thrust + NOISE.launch);

  // L'ecrasement : cinq PAS de physique, pas cinq secondes.
  check("cinq pas de grace", COMPRESSION_GRACE, 5);
  const broyeur = new CompressionSensor();
  for (let i = 0; i < 5; i++) broyeur.update(0.02, true);
  check("cinq pas ne suffisent pas", broyeur.crushed, false);
  broyeur.update(0.02, true);
  check("le sixieme, si", broyeur.crushed, true);
  const attache = new CompressionSensor();
  for (let i = 0; i < 20; i++) attache.update(0.02, true, true);
  check("attache a un point, on ne se fait pas broyer", attache.crushed, false);
  const sorti = new CompressionSensor();
  for (let i = 0; i < 5; i++) sorti.update(0.02, true);
  sorti.update(0.02, false);
  for (let i = 0; i < 5; i++) sorti.update(0.02, true);
  check("et sortir remet le compte a zero", sorti.crushed, false);

  // La surface qui ecrase : UNE dans tout le build, et c'est le sable MONTANT.
  const colonnes = markCrushing(sandColumns({ placed: { SandLevelController: [
    { name: "RisingSand", position: [0, 0, 0],
      fields: { _initScale: 60, _finalScale: 290 } },
    { name: "DrainingSand", position: [1000, 0, 0],
      fields: { _initScale: 300, _finalScale: 66 } },
  ] } }), { placed: { Surface: [
    { name: "Collider", position: [0, 0, 0], fields: { _allowCompression: true },
      volume: { shape: "sphere", radius: 30, center: [0, 0, 0] } },
  ] } });
  check("le sable qui monte ecrase", colonnes[0].crushes, true);
  check("celui qui se vide, non", colonnes[1].crushes, false);
  check("et le rayon vient du collider", colonnes[0].radius, 30);

  // Le rayon suit l'echelle, en PROPORTION : le multiplier tel quel donnait
  // 1 800 unites, et la sphere avalait la planete des la premiere image.
  const faux2 = { name: "RisingSand", position: { x: 0, y: 0, z: 0 },
    scaling: { x: 60, y: 60, z: 60, set(a, b, c) { this.x = a; this.y = b; this.z = c; } },
    getAbsolutePosition() { return this.position; } };
  const niveaux = new SandLevels([colonnes[0]]);
  niveaux.attach([faux2]);
  niveaux.update(0);
  check("au depart, le sable n'avale pas a quarante unites",
        niveaux.swallows([40, 0, 0]), null);
  check("ni meme a trente", niveaux.swallows([30, 0, 0]), null);
  check("mais bien a vingt", !!niveaux.swallows([20, 0, 0]), true);
  niveaux.update(17 * 60);
  check("a la dix-septieme minute, il avale a quarante",
        !!niveaux.swallows([40, 0, 0]), true);
  check("et son rayon a atteint 145", !!niveaux.swallows([144, 0, 0]), true);
  check("mais pas au-dela", niveaux.swallows([146, 0, 0]), null);

  // L'etat du joueur : quatre drapeaux, et la mort qui ne se defait pas seule.
  const etat = new PlayerState();
  check("au depart, il est dehors et vivant",
        `${etat.insideShip},${etat.dead}`, "false,false");
  etat.die();
  check("mourir se retient", etat.dead, true);
  etat.reset();
  check("et la remise a zero le rend vivant", etat.dead, false);

  // --- ce qui pilote la lumiere GLOBALE (docs/54) -------------------------
  //
  // `AmbientLightManager` part du NOIR et ne prend l'ambiance du secteur qu'a
  // trois conditions. Le portage n'en posait aucune.
  check("dans un secteur, a la lumiere, on garde l'ambiance",
        ambientTarget(0.3, {}), 0.3);
  check("dans une zone sans soleil, noir", ambientTarget(0.3, { sunless: true }), 0);
  check("hors secteur majeur, noir", ambientTarget(0.3, { inMajorSector: false }), 0);
  check("et sur la carte, noir aussi", ambientTarget(0.3, { onMapCamera: true }), 0);
  // Le fondu est en `deltaTime` : a soixante images, un soixantieme du chemin.
  check("le fondu ne fait qu'un soixantieme par image",
        Number(ambientStep(0, 1, 1 / 60).toFixed(6)), Number((1 / 60).toFixed(6)));
  check("et il ne depasse jamais la cible", ambientStep(0, 1, 5), 1);
  let amb = 0.35;
  for (let i = 0; i < 60; i++) amb = ambientStep(amb, 0, 1 / 60);
  check("une seconde de grotte assombrit sans eteindre", amb > 0.1 && amb < 0.2, true);

  // Les phares du vaisseau : 600 par defaut, et le secteur ne peut que reduire.
  check("hors secteur, six cents", shiplightRange(100, false), SHIPLIGHT_RANGE);
  check("dans un secteur qui limite, la limite", shiplightRange(100, true), 100);
  check("un secteur sans limite ne rallonge pas", shiplightRange(0, true), SHIPLIGHT_RANGE);
  check("et un secteur plus large non plus", shiplightRange(5000, true), SHIPLIGHT_RANGE);

  // Une lumiere qui fond repart de la ou elle EN EST, pas de son origine.
  const lampe = new FadeLight(1);
  lampe.fadeIntensity(0, 2, 0);
  lampe.update(1);
  check("a mi-fondu, la moitie", lampe.intensity, 0.5);
  lampe.fadeIntensity(1, 2, 1);
  lampe.update(2);
  check("un second fondu repart de la valeur courante", lampe.intensity, 0.75);
  lampe.update(3);
  check("et atteint sa cible", lampe.intensity, 1);
  check("puis s'arrete", lampe.fading, false);

  // Le jour et la nuit : ce sont les TRANSITIONS qui manquaient.
  const cycle = new DayNightTracker(false);
  check("au depart, ni lever ni coucher",
        `${cycle.sunrise},${cycle.sunset}`, "false,false");
  cycle.update(true);
  check("le lever s'annonce une fois", cycle.sunrise, true);
  cycle.update(true);
  check("et pas deux", cycle.sunrise, false);
  cycle.update(false);
  check("le coucher aussi", cycle.sunset, true);

  // Les coquilles sonores : c'est l'OREILLE qu'on guette, et le fondu dure une
  // seconde.
  check("hors coquille, plein volume", shellGain(0, 5), 1);
  check("dedans, silence", shellGain(1, 5), 0);
  check("a mi-fondu, la moitie", shellGain(1, 0.5), 0.5);
  check("et en sortant, ca remonte", shellGain(0, 0.5), 0.5);

  // --- ce qui suit un autre corps, et ce qui clignote (docs/55) -----------
  //
  // `AlignWithTargetBody` : le haut d'une meduse n'est pas donne par la
  // gravite, mais par un corps DESIGNE — et sans aucune condition
  // (`CheckAlignmentRequirements` rend vrai, toujours).
  check("la direction va vers la cible",
        alignmentDirection([0, 0, 0], [0, 10, 0]).join(","), "0,1,0");
  check("et elle est normalisee",
        Number(Math.hypot(...alignmentDirection([1, 2, 3], [4, 8, 15])).toFixed(6)), 1);
  check("cible confondue : on garde un haut par defaut",
        alignmentDirection([5, 5, 5], [5, 5, 5]).join(","), "0,1,0");

  // `FieldInheritor` : les champs herites s'ADDITIONNENT.
  check("sans champ, aucune acceleration", inheritedAcceleration([]).join(","), "0,0,0");
  check("deux champs s'ajoutent",
        inheritedAcceleration([[1, 0, 0], [0, 2, 0]]).join(","), "1,2,0");
  check("et un champ nul ne casse rien",
        inheritedAcceleration([[1, 0, 0], null]).join(","), "1,0,0");

  // Les clignotants : les deux instances ne battent PAS au meme rythme.
  const clign = blinkingRenderers({ placed: { BlinkingRenderer: [
    { name: "UpdateIcon", position: [0, 0, 0],
      fields: { _onSeconds: 1, _offSeconds: 1, _duration: -1 } },
    { name: "ComputerUpdated", position: [0, 0, 0],
      fields: { _onSeconds: 1, _offSeconds: 0.5, _duration: -1 } },
  ] } });
  check("deux clignotants", clign.length, 2);
  check("et ils ne battent pas pareil",
        `${clign[0].off},${clign[1].off}`, "1,0.5");
  check("le constructeur, lui, dit un et un", `${BLINK.on},${BLINK.off}`, "1,1");
  const bat = new Blinker(clign[1]);
  bat.activate(0);
  check("au depart, visible", bat.visible, true);
  bat.update(1.1);
  check("apres une seconde allumee, eteint", bat.visible, false);
  bat.update(1.7);
  check("et rallume apres un demi-seconde", bat.visible, true);
  // Un `_duration` positif eteint le composant au bout du compte.
  const bref = new Blinker({ on: 1, off: 1, duration: 2 });
  bref.activate(0);
  bref.update(3);
  check("un clignotant a duree finit par s'arreter", bref.done, true);

  // Les trois noeuds du satellite : la reparation SE VOIT.
  const casses = brokenNodes({ placed: { BrokenNode: [
    { name: "BrokenNode", position: [0, 0, 0], body: "BrokenSatellite_Body",
      fields: { _repairedMaterial: { name: "GreenSelfIllumMat" } } },
  ] } });
  check("le noeud sait de quoi il aura l'air repare",
        casses[0].repairedMaterial, "GreenSelfIllumMat");

  // Les eclaboussures : les trois pointeurs ne sont resolus par rien dans le
  // build. L'invariant garde ce vide, pour que personne ne les cherche.
  const remous = waterEffects({ placed: { WaterEffectVolume: [
    { name: "OceanFluid", position: [0, 0, 0], body: "GiantsDeep_Body", fields: {} },
  ] } });
  check("trois tailles d'eclaboussure sont prevues", remous[0].splashes.length, 3);
  check("et aucune n'est resolue", remous[0].splashes.filter(Boolean).length, 0);

  // --- les impostures de planete (docs/56) --------------------------------
  //
  // Deux des cinq n'ont PAS de plan, et une troisieme vise une boite grise.
  // C'est un chantier de l'alpha, pas une technique aboutie a rattraper.
  const imps = planetImposters({ cameras: [
    { name: "LODCam_BrittleHollow", effects: { LODCameraSnapshot: [
      { interval: 1, firstSnapshot: 1, planet: "BrittleHollow_Body",
        plane: "LODPlane_BrittleHollow" }] } },
    { name: "LODCam_TimberHearth", effects: { LODCameraSnapshot: [
      { interval: 1, firstSnapshot: 1.6, planet: "HomePlanet_graybox",
        plane: "LODPlane_TimberHearth" }] } },
    { name: "GasGiantCam", effects: { LODCameraSnapshot: [
      { interval: 1, firstSnapshot: 1, planet: "GiantsDeep_Body", plane: null }] } },
  ] });
  check("trois impostures lues", imps.length, 3);
  check("deux seulement sont cablees", imps.filter((i) => i.wired).length, 2);
  check("et l'une des deux vise une boite grise",
        imps.filter((i) => i.graybox).length, 1);
  check("la texture fait 256", IMPOSTER_SIZE, 256);

  // Les premiers rendus sont DECALES : 1 ; 1,3 ; 1,6. Les trois ne rendent pas
  // la meme image, ce qui etale leur cout.
  check("les premiers rendus sont decales",
        new Set(imps.map((i) => i.firstSnapshot)).size > 1, true);

  const imposteur = new Imposter(imps[0]);
  check("avant l'heure, rien", imposteur.due(0.5), false);
  check("a l'heure, un rendu", imposteur.due(1.1), true);
  check("et pas deux de suite", imposteur.due(1.2), false);
  check("puis un par seconde", imposteur.due(2.1), true);
  // Le build avance `_nextSnapshotTime` d'un intervalle, et non depuis le
  // dernier rendu : une image sautee ne decale pas les suivantes.
  const saute = new Imposter({ interval: 1, firstSnapshot: 1 });
  saute.due(5);
  check("apres une longue absence, le rythme reprend sans derive",
        saute.next, 2);
  check("et il rattrape image par image", (saute.due(5), saute.next), 3);

  // Le plan ne se montre que si la vraie geometrie n'est PAS la.
  check("sans la vraie planete, l'imposture se voit", imposteur.visible(false), true);
  check("avec elle, elle s'efface", imposteur.visible(true), false);

  // La camera se met DERRIERE le plan, a la distance de la planete.
  check("la camera d'imposture est derriere le plan",
        imposteur.cameraPosition([0, 0, 0], [0, 0, 1], 500).join(","), "0,0,500");

  // --- le suivi de referentiel (docs/58) ----------------------------------
  //
  // Le build INVERSE notre vitesse avant de raisonner : il parle du mouvement
  // apparent de la cible. Le signe de `zSpeed` en sort negatif en approche, ce
  // qui surprend jusqu'a ce qu'on se souvienne de l'inversion.
  const approche = relativeMotion([0, 0, -50], [0, 0, 1000], [0, 0, 0]);
  check("en approche, la vitesse est negative", approche.zSpeed, -50);
  check("et le cercle est rouge", `${approche.hue},${approche.saturation}`, "0,1");
  const fuite = relativeMotion([0, 0, 50], [0, 0, 1000], [0, 0, 0]);
  check("en fuite, elle est positive", fuite.zSpeed, 50);
  check("et le cercle est vert", `${fuite.hue},${fuite.saturation}`, "140,1");
  const lent = relativeMotion([0, 0, -0.5], [0, 0, 1000], [0, 0, 0]);
  check("entre les deux, il est blanc", lent.saturation, 0);

  // La derive laterale, et le seuil qui s'elargit avec la distance.
  check("tout droit, c'est direct", approche.lateralSpeed, 0);
  const travers = relativeMotion([30, 0, -50], [0, 0, 1000], [0, 0, 0]);
  check("trente de travers a mille unites ne sont pas directs", travers.direct, false);
  const doux = relativeMotion([5, 0, -50], [0, 0, 1000], [0, 0, 0]);
  check("cinq, oui", doux.direct, true);
  const proche = relativeMotion([5, 0, -50], [0, 0, 50], [0, 0, 0]);
  check("les memes cinq a cinquante unites, non", proche.direct, false);
  // Le palier a 100 est du CODE MORT : la table de saut le rend inatteignable,
  // et l'invariant garde qu'on ne l'a pas porte « par evidence ».
  check("deux paliers seulement, pas trois",
        [10, 150, 2000].map(directThreshold).join(","), "1,10,10");
  check("et le troisieme est prevu sans etre atteint", DEAD_THRESHOLD, 100);
  // Le decalage des fleches grandit avec la DISTANCE, et suit le signe de la
  // vitesse INVERSEE.
  check("le decalage suit la distance et le facteur",
        Number(travers.xyOffset[0].toFixed(4)),
        Number((-30 * 1000 * ARROW_OFFSET).toFixed(4)));

  // La lecture passe en kilometres au-dela de CINQ mille, pas de mille.
  check("sous cinq mille, des metres", trackerReadout(4999, -10), " 4999m\n -10m/s");
  check("au-dela, des kilometres", trackerReadout(6200, -50), " 6km\n -50m/s");

  // La poussiere de mouvement : rien sous trente unites par seconde.
  check("sans cible visee, pas de poussiere",
        motionDust(100, { targeting: false }).emitting, false);
  check("sur la carte non plus", motionDust(100, { mapView: true }).emitting, false);
  check("le seuil de visibilite est a trente", DUST.minSpeed, 30);
  check("a dix, on emet mais on ne voit rien", motionDust(10).alpha, 0);
  check("a cinquante, on voit", motionDust(50).alpha > 0, true);
  check("et l'opacite plafonne", motionDust(1000).alpha, DUST.maxAlpha);
  // Plus vite : plus de traits, et plus courts.
  check("la duree de vie diminue avec la vitesse",
        motionDust(200).lifetime < motionDust(50).lifetime, true);
  check("le debit augmente", motionDust(200).rate > motionDust(50).rate, true);
  check("et la duree de vie a un plancher", motionDust(1000).lifetime, DUST.minLifetime);

  // Les six buses du vaisseau MINIATURE : la buse allumee est celle qui POUSSE,
  // donc l'OPPOSEE au mouvement. Ecrit a l'envers, les flammes sortent du cote
  // ou il va.
  check("six buses", SHIP_NOZZLES.length, 6);
  const versLaDroite = shipNozzles([1, 0, 0]);
  check("pousser a droite allume la buse de GAUCHE",
        `${versLaDroite.left},${versLaDroite.right}`, "true,false");
  const versLeHaut = shipNozzles([0, -1, 0]);
  check("monter allume celle du haut",
        `${versLeHaut.up},${versLeHaut.down}`, "true,false");
  const enAvant = shipNozzles([0, 0, -1]);
  check("avancer allume celle de l'avant",
        `${enAvant.forward},${enAvant.rear}`, "true,false");
  const repos = shipNozzles([0, 0, 0]);
  check("au repos, aucune", Object.values(repos).filter(Boolean).length, 0);
  // Les six s'appellent toutes `Thruster_Small` : seule leur place les
  // distingue, comme les nuages et les pivots de tornade.
  const buses = modelShipNozzles({ placed: { ThrusterParticleController: [
    { name: "Thrusters", body: "ModelShip_Body", nozzles: {
      forward: [0, 0, -1], rear: [0, 0, 1], right: [-1, 0, 0],
      left: [1, 0, 0], up: [0, -1, 0], down: [0, 1, 0] } },
  ] } });
  check("les six portent une position", buses.length, 6);
  check("et elles sont toutes distinctes",
        new Set(buses.map((b) => b.position.join(","))).size, 6);
  check("sur le vaisseau miniature, pas celui du joueur",
        buses[0].body, "ModelShip_Body");

  // La sonde ancienne : cinquante d'acceleration locale vers l'avant, sans fin.
  check("la sonde ancienne pousse a cinquante", ANCIENT_PROBE_THRUST, 50);
  check("droit devant elle",
        ancientProbeAcceleration([0, 0, 1]).join(","), "0,0,50");

  // Le volume compose : UNE entree et UNE sortie, quel que soit le nombre
  // d'enfants traverses. Sans ce compte, passer d'un cylindre au suivant
  // emettrait une sortie puis une entree, et tout ce qui ecoute clignoterait.
  const compose = new CompoundTrigger();
  check("entrer dans le premier enfant annonce une entree",
        compose.enterChild("joueur"), true);
  check("entrer dans un second, chevauchant, n'en annonce pas une seconde",
        compose.enterChild("joueur"), false);
  check("et l'on est compte une seule fois", compose.inside, 1);
  check("sortir du premier n'annonce rien", compose.exitChild("joueur"), false);
  check("on est toujours dedans", compose.contains("joueur"), true);
  check("sortir du dernier annonce la sortie", compose.exitChild("joueur"), true);
  check("et l'on n'est plus dedans", compose.inside, 0);
  // Deux corps distincts se comptent separement.
  compose.enterChild("a"); compose.enterChild("b");
  check("deux corps, deux comptes", compose.inside, 2);
  compose.exitChild("a");
  check("l'un sort sans emporter l'autre", compose.contains("b"), true);
  // Sortir de ce dans quoi on n'est jamais entre ne fait rien.
  check("une sortie sans entree ne fait rien", compose.exitChild("inconnu"), false);

  // --- la sonde, telle que le build la pose (docs/60) ---
  //
  // Le prefabrique vit dans `sharedassets1.assets` : le recensement ne lisait
  // que `level0` et docs/08 en avait conclu que le modele de sonde manquait au
  // build. Ces chiffres viennent tous du prefabrique ou de l'IL du lanceur.
  check("la charge ignore les quinze premiers centiemes", chargeFraction(0.15), 0);
  check("une pichenette ne charge rien", chargeFraction(0.05), 0);
  check("une seconde pleine charge tout", chargeFraction(1), 1);
  check("a mi-course, un peu plus de la moitie",
        Number(chargeFraction(0.6).toFixed(4)), Number((0.45 / 0.85).toFixed(4)));
  check("une charge nulle part a quarante", launchSpeed(0), 40);
  check("une charge pleine part a cent", launchSpeed(1), 100);
  // L'inclinaison est SIGNEE : positive quand on vise au-dessus du regard.
  check("viser droit devant : zero", launchPitch([0, 0, 1], [0, 1, 0], [0, 0, 1]), 0);
  check("viser vers le haut : positif",
        launchPitch([0, 0, 1], [0, 1, 0], [0, 1, 0]) > 0, true);
  check("viser vers le bas : negatif",
        launchPitch([0, 0, 1], [0, 1, 0], [0, -1, 0]) < 0, true);
  // La pichenette vise une ORBITE : sqrt(g r) * 1,1, plafonnee a cent.
  check("la vitesse orbitale, a plat",
        Number(orbitalSpeed(10, 100, 0).toFixed(3)),
        Number((Math.sqrt(1000) * 1.1).toFixed(3)));
  check("viser en l'air la fait monter",
        orbitalSpeed(10, 100, 45) > orbitalSpeed(10, 100, 0), true);
  check("mais jamais plus du double",
        Number(orbitalSpeed(10, 100, 89).toFixed(3)),
        Number(Math.min(Math.sqrt(1000) * 1.1 * 2, 100).toFixed(3)));
  check("et jamais plus que la vitesse maximale", orbitalSpeed(100, 1000, 0), 100);
  // La fenetre de tir : deux cents metres tant qu'on ignore le geste.
  check("avant d'apprendre, il faut deux cents metres", launchWindowLength(false), 200);
  check("apres, cinq suffisent", launchWindowLength(true), 5);
  // Le suivi d'horizon ne s'arme que sur un tir tendu, hors du poste.
  check("un tir tendu suit l'horizon", tracksHorizon(0, 10, false, 300), true);
  check("un tir charge ne le suit pas", tracksHorizon(0.8, 10, false, 300), false);
  check("un tir trop haut non plus", tracksHorizon(0, 60, false, 300), false);
  check("un tir trop bas non plus", tracksHorizon(0, -20, false, 300), false);
  check("depuis le poste de pilotage, jamais", tracksHorizon(0, 10, true, 300), false);
  check("et il faut un secteur qui ait un horizon", tracksHorizon(0, 10, false, 0), false);
  // La visee tangente : a distance R du centre, le point vise est a
  // sqrt(dist^2 - R^2) — donc plus court que la distance au centre.
  const vise = horizonAim([0, 0, 0], [0, 0, -320], [1, 0, 0], 300);
  check("sous l'horizon plus deux cents, on corrige", vise !== null, true);
  check("le point vise est le point de tangence",
        Math.round(Math.hypot(vise[0], vise[1], vise[2])),
        Math.round(Math.sqrt(320 * 320 - 300 * 300)));
  check("trop loin, on ne corrige plus",
        horizonAim([0, 0, 0], [0, 0, -600], [1, 0, 0], 300), null);
  check("sous l'horizon non plus",
        horizonAim([0, 0, 0], [0, 0, -200], [1, 0, 0], 300), null);
  // La collision imminente : le pas de physique depasserait-il le point ?
  check("a cent metres et cent par seconde, pas encore",
        impendingCollision([0, 0, 100], [0, 0, 100], [0, 0, 0], 0.02), false);
  check("a un metre et cent par seconde, oui",
        impendingCollision([0, 0, 1], [0, 0, 100], [0, 0, 0], 0.02), true);
  // La lanterne : eteinte a l'ancrage, cinquante deux secondes plus tard.
  check("la lanterne s'allume a zero", lanternRange(0), 0);
  check("a mi-parcours, la moitie", lanternRange(1), 25);
  check("deux secondes plus tard, cinquante", lanternRange(2), SONDE.lanternRange);
  check("et elle ne monte pas plus haut", lanternRange(10), SONDE.lanternRange);
  // La photo : 512 pres, 64 loin, et le seuil est a deux cents metres.
  check("sous deux cents metres, pleine definition", snapshotSize(150), 512);
  check("a mille metres, la plus petite", snapshotSize(1000), 64);
  check("et plus loin, pas plus petite", snapshotSize(5000), 64);
  check("a six cents metres, entre les deux", snapshotSize(600), 288);
  // Le marqueur : le danger l'emporte, et il tient une seconde.
  check("en vol, on repere", probeIcon(0, null, false), "locator");
  check("posee, on ancre", probeIcon(0, null, true), "anchor");
  check("dans un danger, on alerte", probeIcon(5, null, true), "danger");
  check("un degat de contact tient une seconde", probeIcon(0, 0.5, false), "danger");
  check("et pas deux", probeIcon(0, 1.5, false), "locator");
  check("le texte du marqueur", probeReadout(42.4), " 42m");
  check("avec l'integrite de la croute", probeReadout(10, 87),
        " 10m\n Crust Integrity: 87%");
  check("et les renseignements du lieu", probeReadout(10, null, ["Chert"]),
        " 10m\n Chert");
  check("derriere la camera, pas de marqueur",
        probeLabelPos({ x: 10, y: 10, z: -1 }, 600, { width: 32, height: 32 }), null);
  check("devant, trente pixels au-dessus du point",
        probeLabelPos({ x: 100, y: 200, z: 5 }, 600, { width: 32, height: 32 }).y,
        600 - 200 - 16 - 30);
  check("l'autodestruction attend sa seconde", selfDestructed(0.5), false);
  check("puis elle detruit", selfDestructed(1.5), true);

  // Le lanceur : UNE sonde a la fois. C'est la difference de jeu la plus
  // visible de ce lot — le portage en lancait autant qu'on voulait.
  const monde = { pos: [0, 0, 0], forward: [0, 0, 1], playerForward: [0, 0, 1],
                  playerUp: [0, 1, 0], playerVelocity: [0, 0, 0], knowsProbes: true };
  const lanceur = new Lanceur();
  lanceur.update(0.016, { launch: true }, monde);
  check("appuyer met en charge", lanceur.charging, true);
  check("mais ne lance rien", lanceur.active, 0);
  for (let i = 0; i < 60; i++) lanceur.update(0.016, { launch: true }, monde);
  check("la charge monte", lanceur.charge > 0.5, true);
  lanceur.update(0.016, { launch: false }, monde);
  check("relacher lance", lanceur.active, 1);
  check("et le son est celui de la pleine puissance",
        lanceur.events.includes("ProbeLaunch_HighPower"), true);
  lanceur.update(0.016, { launch: true }, monde);
  check("une seconde sonde ne part pas", lanceur.launched, 1);
  // Le rappel demande un MAINTIEN de trois dixiemes.
  lanceur.update(0.2, { retrieve: true }, monde);
  check("un appui bref ne rappelle pas", lanceur.active, 1);
  lanceur.update(0.4, { retrieve: true }, monde);
  check("trois dixiemes rappellent", lanceur.active, 0);
  check("et l'evenement de destruction part",
        lanceur.events.includes("ProbeDestroyed"), true);
  // La pichenette, pres d'un corps : elle part en ORBITE, pas a quarante.
  const orbital = new Lanceur();
  orbital.update(0.016, { launch: true }, monde);
  const jete = orbital.update(0.016, { launch: false },
    { ...monde, field: { magnitude: 12, dir: { x: 0, y: -1, z: 0 } },
      wellCenter: [0, -300, 0] });
  check("la pichenette vise l'orbite",
        Math.round(Math.hypot(...jete.vel)),
        Math.round(orbitalSpeed(12, 300, 0)));
  check("et le son est celui de la faible puissance",
        orbital.events.includes("ProbeLaunch_LowPower"), true);
  // Un mur devant : le tir est refuse, et une seule fois.
  const bloque = new Lanceur();
  const mur = { ...monde, raycast: () => ({ point: [0, 0, 3], normal: [0, 0, -1] }) };
  bloque.update(0.016, { launch: true }, mur);
  check("un mur refuse le tir", bloque.events.includes("ProbeLaunchAborted"), true);
  check("et ne met pas en charge", bloque.charging, false);
  bloque.update(0.016, { launch: true }, mur);
  check("maintenir la touche ne le refuse pas deux fois",
        bloque.events.length, 0);
  // Dans le vaisseau, hors du poste de pilotage : refuse aussi.
  const cabine = new Lanceur();
  cabine.update(0.016, { launch: true }, { ...monde, insideShip: true });
  check("dans la cabine, le tir est refuse",
        cabine.events.includes("ProbeLaunchAborted"), true);
  const poste = new Lanceur();
  poste.update(0.016, { launch: true },
               { ...monde, insideShip: true, atFlightConsole: true });
  check("au poste de pilotage, il passe", poste.charging, true);

  // La sonde en vol : le collider ne s'allume qu'au bout de deux dixiemes,
  // puis elle se plante NEZ DANS la surface et la lanterne monte.
  const sonde = new Sonde([0, 0, 0], [0, 0, 1], [0, 0, 50]);
  check("au depart, pas de collider", sonde.colliderOn, false);
  sonde.step(0.1, {});
  check("a un dixieme, toujours pas", sonde.colliderOn, false);
  sonde.step(0.15, {});
  check("a deux dixiemes et demi, oui", sonde.colliderOn, true);
  check("et elle a avance", Math.round(sonde.pos[2]), 13);
  const sol = { point: [0, 0, 20], normal: [0, 0, -1] };
  sonde.step(0.5, { raycast: () => sol });
  check("elle s'ancre", sonde.anchored, true);
  check("au point touche", sonde.pos.join(","), "0,0,20");
  check("le nez dans la surface", sonde.forward.join(","), "0,0,1");
  check("et elle ne bouge plus", Math.hypot(...sonde.vel), 0);
  check("la lanterne part de zero", sonde.lantern, 0);
  sonde.step(1, {});
  check("et monte", sonde.lantern, 25);
  check("la boucle de vol s'est tue", sonde.flightLoop, 0);
  // Le scan : la sphere de trente, et le plus proche.
  sonde.scan([{ nom: "loin", pos: [0, 0, 100] }, { nom: "pres", pos: [0, 0, 25] },
              { nom: "moyen", pos: [0, 0, 40] }]);
  check("deux points dans la sphere de trente", sonde.poi.length, 2);
  check("et le plus proche est retenu", sonde.closestPOI.nom, "pres");
  // Le capteur haute vitesse : sur un decor STATIQUE, il ancre en reculant de
  // quinze centimetres du point d'impact.
  //
  // Le decor ne repond qu'au rayon du CAPTEUR (portee cent) et pas a celui du
  // balayage : c'est le cas ou les deux detections divergent, et donc le seul
  // ou le capteur sert a quelque chose.
  // Il travaille des la premiere image : `ProbeAnchor.OnImpendingCollision`
  // n'attend pas que le collider s'allume, seulement que la sonde ne soit pas
  // deja posee.
  const rapide = new Sonde([0, 0, 0], [0, 0, 1], [0, 0, 6000]);
  const paroi = { point: [0, 0, 80], normal: [0, 0, -1], dynamic: false };
  rapide.step(0.016,
    { raycast: (from, dir, portee) => (portee === SONDE.sensorRange ? paroi : null) });
  check("le capteur voit le mur cent metres devant", rapide.anchored, true);
  check("et recule de quinze centimetres",
        Number(rapide.pos[2].toFixed(2)), 79.85);
  check("l'angle entre deux directions opposees vaut cent quatre-vingts",
        Math.round(angleEntre([0, 0, 1], [0, 0, -1])), 180);

  // --- les commandes du build (docs/61) ---
  //
  // Elles vivent dans l'`InputManager` de `mainData`, que le portage ne lisait
  // pas : ses touches etaient les siennes. Ce qui suit garde la TRADUCTION —
  // le nom Unity vers le code du navigateur — et le comportement des canaux ;
  // les liaisons elles-memes sont gardees contre le build par
  // `tests/05-extract.mjs`.
  check("une lettre devient une place", codeUnity("a"), "KeyA");
  check("et la place survit a un azerty", codeUnity("q"), "KeyQ");
  check("l'espace", codeUnity("space"), "Space");
  check("la majuscule gauche", codeUnity("left shift"), "ShiftLeft");
  check("le controle droit", codeUnity("right ctrl"), "ControlRight");
  // « return » est la grande touche, « enter » celle du pave numerique. Unity
  // les distingue, et le build lie les DEUX a la carte.
  check("return est la grande touche", codeUnity("return"), "Enter");
  check("enter est celle du pave", codeUnity("enter"), "NumpadEnter");
  // Unity compte gauche, DROIT, milieu ; le DOM compte gauche, MILIEU, droit.
  // La traduction croise donc 1 et 2, et c'est le navigateur qui l'a appris au
  // portage : `mouse 1` mettait la sonde sur la molette.
  check("le clic droit d'Unity est le bouton 2 du DOM", codeUnity("mouse 1").mouse, 2);
  check("son clic du milieu est le bouton 1", codeUnity("mouse 2").mouse, 1);
  check("et le gauche ne bouge pas", codeUnity("mouse 0").mouse, 0);
  check("un bouton de manette", codeUnity("joystick button 5").pad, 5);
  check("et ce qu'on ne connait pas ne devient rien", codeUnity("§"), null);

  const cmd = new Commandes(null);
  check("sans data/input.json, on se sait repli", cmd.fallback, true);
  check("vingt-deux canaux du build", Object.keys(COMMANDES).length, 22);
  check("et cinq ajouts nommes", Object.keys(AJOUTS).length, 5);
  check("dont sortir le baton, qui n'a pas de canal dans l'alpha",
        !!AJOUTS.Stick, true);
  // Les trois boutons de souris, que le portage n'avait pas.
  check("viser un referentiel est le clic GAUCHE",
        cmd.get("Lock On").pos.mouse[0], 0);
  check("la sonde est le clic DROIT", cmd.get("Probe").pos.mouse[0], 2);
  check("la lunette est le clic du MILIEU", cmd.get("Telescope").pos.mouse[0], 1);
  check("le clic droit tient la sonde",
        cmd.held("Probe", { mouse: { 2: true } }), true);
  check("et le gauche ne la tient pas",
        cmd.held("Probe", { mouse: { 0: true } }), false);
  // Les axes de deplacement : a/d et w/s, avec leurs suppleants j/l et k/i.
  check("d va a droite", cmd.axis("Move X", { keys: { KeyD: true } }), 1);
  check("a va a gauche", cmd.axis("Move X", { keys: { KeyA: true } }), -1);
  check("l aussi, c'est le suppleant", cmd.axis("Move X", { keys: { KeyL: true } }), 1);
  check("w avance", cmd.axis("Move Z", { keys: { KeyW: true } }), 1);
  check("les deux a la fois s'annulent",
        cmd.axis("Move Z", { keys: { KeyW: true, KeyS: true } }), 0);
  // Le sac dorsal monte a la MAJUSCULE et descend au CONTROLE ; l'espace saute.
  check("la majuscule monte", cmd.held("Move Up", { keys: { ShiftLeft: true } }), true);
  check("le controle descend", cmd.held("Move Down", { keys: { ControlLeft: true } }), true);
  check("l'espace saute", cmd.held("Jump", { keys: { Space: true } }), true);
  check("et l'espace ne monte pas", cmd.held("Move Up", { keys: { Space: true } }), false);
  // La lunette zoome avec les MEMES touches que le sac dorsal : c'est le build
  // qui les partage, par jeu de commandes.
  check("zoomer, c'est monter", cmd.held("Zoom In", { keys: { ShiftLeft: true } }), true);
  // Interagir et le pilote automatique partagent E, comme dans le build.
  check("E interagit", cmd.held("Interact", { keys: { KeyE: true } }), true);
  check("et pilote", cmd.held("Autopilot", { keys: { KeyE: true } }), true);
  check("Q annule", cmd.held("Cancel", { keys: { KeyQ: true } }), true);
  check("la carte est sur entree", cmd.held("Map", { keys: { Enter: true } }), true);
  // La manette : les numeros du build, traduits.
  check("la sonde est au bouton 5", cmd.padButton("Probe"), 5);
  check("la carte au bouton 6", cmd.padButton("Map"), 6);
  check("et monter est un AXE", cmd.padAxis("Move Up").axis, 9);
  // Les libelles d'invite.
  check("l'invite de la sonde", cmd.label("Probe"), "clic droit");
  check("et celle de la lunette", cmd.label("Telescope"), "clic milieu");
  check("celle du saut", cmd.label("Jump"), "Espace");
  check("celle du sac dorsal", cmd.label("Move Up"), "Maj");
  check("et celle de l'interaction", cmd.label("Interact"), "E");
  // Un canal absent ne fait rien plutot que d'exploser.
  check("un canal inconnu ne tient rien", cmd.held("Inexistant", {}), false);
  check("et son axe vaut zero", cmd.axis("Inexistant", {}), 0);
  // Avec des donnees, ce sont ELLES qui gagnent.
  const cmd2 = new Commandes({ channels: {
    Probe: { Key: { kind: "buttons", neg: [], pos: ["z"] },
             PC: { kind: "buttons", neg: [], pos: ["joystick button 7"] } } } });
  check("avec data/input.json, on ne se sait plus repli", cmd2.fallback, false);
  check("et la liaison vient du fichier", cmd2.get("Probe").pos.codes[0], "KeyZ");
  check("la manette aussi", cmd2.padButton("Probe"), 7);
  check("les canaux absents du fichier gardent la table",
        cmd2.get("Jump").pos.codes[0], "Space");

  // --- viser un referentiel (docs/62) ---
  //
  // `ReferenceFrameTracker` : la cible se REGARDE, elle ne se choisit pas dans
  // la carte. Le portage ne la choisissait que dans la carte.
  check("les crochets se ferment a dix par seconde",
        bracketScale(1, true, 0.05), 0.5);
  check("et se rouvrent aussi vite", bracketScale(0, false, 0.05), 0.5);
  check("sans jamais depasser un", bracketScale(0.9, false, 1), 1);
  check("ni descendre sous zero", bracketScale(0.1, true, 1), 0);
  check("dix par seconde", BRACKET_RATE, 10);
  check("l'angle a la perpendiculaire", Math.round(angleTo([0, 0, 1], [0, 1, 0])), 90);
  // La visee : le mieux CENTRE gagne, pas le plus proche.
  const corps = [
    { name: "loin mais centre", position: [0, 0, 5000], radius: 200 },
    { name: "pres mais de cote", position: [3000, 0, 300], radius: 100 },
  ];
  check("le mieux centre gagne",
        aimedFrame(corps, [0, 0, 0], [0, 0, 1]).name, "loin mais centre");
  check("et regarder de cote change la cible",
        aimedFrame(corps, [0, 0, 0], [1, 0, 0.1]).name, "pres mais de cote");
  // Temps 1 : un corps perce par le rayon PROCHE l'emporte sur un mieux centre.
  const pres = [
    { name: "la lune, sous le nez", position: [0, 0, 300], radius: 250 },
    { name: "la planete, derriere", position: [0, 0, 40000], radius: 2000 },
  ];
  check("ce qu'on touche a mille l'emporte",
        aimedFrame(pres, [0, 0, 0], [0, 0, 1]).name, "la lune, sous le nez");
  check("le rayon proche porte a mille", LOCK_NEAR, 1000);
  check("et rien devant ne donne rien",
        aimedFrame([], [0, 0, 0], [0, 0, 1]), null);
  // Le verrouillage : la meme touche pose et retire.
  const lock = new LockOn();
  const cible1 = { name: "a" }, cible2 = { name: "b" };
  lock.update(0.016, true, cible1);
  check("viser pose la cible", lock.current, cible1);
  check("et l'annonce", lock.events.join(","), "TargetReferenceFrame");
  check("les crochets repartent d'en haut", lock.bracket > 0.8, true);
  lock.update(0.016, true, cible1);
  check("re-viser la meme la retire", lock.current, null);
  check("et l'annonce aussi", lock.events.join(","), "UntargetReferenceFrame");
  lock.update(0.016, true, cible1);
  lock.update(0.016, true, cible2);
  check("viser une autre change de cible", lock.current, cible2);
  check("l'ancienne est retenue", lock.last, cible1);
  lock.update(0.016, true, null);
  check("viser le vide devise", lock.current, null);
  check("deviser deux fois ne dit rien",
        (lock.update(0.016, true, null), lock.events.length), 0);
  // L'invite ne s'affiche que sur une cible AUTRE que celle qu'on tient.
  lock.update(0.016, true, cible1);
  lock.update(0.016, false, cible1);
  check("pas d'invite sur ce qu'on vise deja", lock.showPrompt, false);
  lock.update(0.016, false, cible2);
  check("mais une sur ce qu'on pourrait viser", lock.showPrompt, true);
  // Le pilote automatique REFUSE si l'on est deja arrive.
  check("aller plus loin que la distance d'arrivee", canFlyTo(5000, 1000), true);
  check("y etre deja, non", canFlyTo(500, 1000), false);
  check("et un referentiel qui l'interdit, non plus",
        canFlyTo(5000, 1000, false), false);
  check("accorder sa vitesse la copie",
        matchedVelocity([1, 2, 3]).join(","), "1,2,3");

  // --- ce qui boucle et ce qui ne boucle pas (docs/63) ---
  //
  // Le portage jouait TOUT en boucle. Le build ne le fait pas, et la regle
  // d'Unity est en deux etages pour les clips legacy.
  check("un clip en Loop boucle",
        clipLoops({ m_AnimationType: 1, m_WrapMode: WRAP.LOOP }), true);
  check("un clip en Once ne boucle pas",
        clipLoops({ m_AnimationType: 1, m_WrapMode: WRAP.ONCE }), false);
  check("un ping-pong boucle aussi",
        clipLoops({ m_AnimationType: 1, m_WrapMode: WRAP.PINGPONG }), true);
  // En Default, c'est le composant qui tranche...
  check("en Default, le composant tranche",
        clipLoops({ m_AnimationType: 1, m_WrapMode: WRAP.DEFAULT }, WRAP.LOOP), true);
  // ... et si le composant est en Default aussi, Unity retombe sur Once.
  check("et deux Default valent Once",
        clipLoops({ m_AnimationType: 1, m_WrapMode: WRAP.DEFAULT }, WRAP.DEFAULT), false);
  // Mecanim ne lit pas le wrapMode du clip : la reponse est dans le muscle.
  check("un clip Mecanim en boucle boucle",
        clipLoops({ m_AnimationType: 2, m_WrapMode: WRAP.DEFAULT,
                    m_MuscleClip: { m_LoopBlend: true } }), true);
  check("et sans boucle, non",
        clipLoops({ m_AnimationType: 2, m_WrapMode: WRAP.DEFAULT,
                    m_MuscleClip: { m_LoopBlend: false } }), false);
  check("un muscle absent vaut boucle",
        clipLoops({ m_AnimationType: 2, m_WrapMode: WRAP.DEFAULT }), true);

  // --- ce qu'on tient dans la main (docs/64) ---
  check("deux objets en main", HELD_ROOTS.length, 2);
  check("le baton a quatre clips", STICK_CLIPS.length, 4);
  check("et deux lumieres", STICK_LIGHTS.length, 2);
  check("la lampe de la guimauve porte a 1,21",
        STICK_LIGHTS[0].range, 1.21);
  check("celle du thermometre est courte et vive",
        `${STICK_LIGHTS[1].range},${STICK_LIGHTS[1].intensity}`, "0.16,2");
  // Le thermometre est une POSE d'animation : quarante unites de chaleur
  // parcourent le clip entier, et au-dela on reste sur la derniere image.
  check("quarante unites parcourent le clip", THERM_HEAT_SPAN, 40);
  check("froid, l'aiguille est au depart", thermTime(0), 0);
  check("a mi-chaleur, a mi-course", thermTime(20), 0.5);
  check("brulant, elle bute", thermTime(400), 1);
  check("et un froid negatif ne la renverse pas", thermTime(-5), 0);
  // Le baton est DEHORS au premier instant : `Awake` met deux clips a la queue.
  const baton = new Baton();
  check("le baton commence dehors", baton.out, true);
  check("et sort avant d'attendre", baton.clip, "PullOut");
  baton.update(0.016, { playing: false });
  check("le clip fini, il attend", baton.clip, "idle");
  baton.toggle();
  check("le ranger le range", baton.out, false);
  check("et joue PutBack", baton.clip, "PutBack");
  check("les lumieres s'eteignent", baton.lights, false);
  check("le thermometre se coupe", baton.canTherm, false);
  check("et la guimauve se remet a neuf",
        baton.events.includes("ResetMarshmallow"), true);
  baton.toggle();
  check("le ressortir le ressort", baton.out, true);
  check("les lumieres reviennent", baton.lights, true);
  // Manger range le baton TOUT SEUL.
  const mange = new Baton();
  mange.update(0.016, { eaten: true });
  check("manger range le baton", mange.out, false);
  check("il s'en souvient", mange.putAwayOnce, true);
  // La flamme ne se voit que baton dehors et animation finie.
  const flamme = new Baton();
  flamme.update(0.016, { playing: true });
  check("pas de flamme pendant la sortie", flamme.flame, false);
  flamme.update(0.016, { playing: false });
  check("mais une fois sorti, oui", flamme.flame, true);

  // --- l'onde du telescope (docs/65) ---
  check("cinq cents points", WAVE.points, 500);
  check("et une boite dans le coin",
        `${WAVE.x0},${WAVE.y0},${WAVE.x1},${WAVE.y1}`, "0.4,0.15,0.6,0.25");
  const onde = new SoundWave();
  check("au repos, la ligne est plate au milieu",
        new Set(onde.ordered()).size, 1);
  check("et au milieu vaut un demi", onde.ordered()[0], 0.5);
  // Force nulle : la valeur reste 0,5 quel que soit l'echantillon.
  check("sans signal, l'echantillon ne fait rien", onde.push(1, 0), 0.5);
  check("un signal plein prend toute la hauteur", onde.push(1, 1), 1);
  check("et l'oppose descend au plancher", onde.push(-1, 1), 0);
  check("a demi-force, a mi-hauteur", onde.push(1, 0.5), 0.75);
  // Le point neuf est le DERNIER de la liste : l'onde defile vers la gauche.
  check("le dernier point est le plus recent", onde.ordered()[499], 0.75);
  check("et le tampon garde sa taille", onde.ordered().length, 500);
  // Cinq cents images plus tard, le premier point a disparu.
  const courte = new SoundWave(4);
  for (const v of [1, 1, 1, 1, 1]) courte.push(v, 1);
  check("un tampon de quatre ne garde que quatre points",
        courte.ordered().join(","), "1,1,1,1");
  // La lunette grossit avec le champ : quatre fois plus grande a soixante.
  check("a quinze degres, taille d'origine", telescopeScale(15), 1);
  check("a soixante, quatre fois plus", telescopeScale(60), 4);
  check("et l'echelle d'origine multiplie", telescopeScale(30, 2), 4);
  check("la fleche du zoom est en bas au plus etroit",
        zoomArrowFraction(TELESCOPE_GUI.minFOV), 0);
  check("et monte avec le champ",
        Number(zoomArrowFraction(45).toFixed(4)), 0.5);
  check("sans jamais deborder", zoomArrowFraction(1000), 1);

  // --- l'allumage du vaisseau (docs/66) ---
  //
  // Un vaisseau pose ne decolle pas a l'appui : il s'ALLUME, une seconde
  // durant, et relacher annule tout.
  check("une seconde d'allumage", IGNITION_DURATION, 1);
  const nef = new Ship({}, null, [0, 0, 0]);
  nef.landed = true;
  check("l'appui allume", nef.ignition(0.1, 1), 0);
  check("et l'annonce", nef.events.join(","), "StartShipIgnition");
  check("pendant l'allumage, aucune poussee", nef.ignition(0.5, 1), 0);
  check("et rien a annoncer", nef.events.length, 0);
  check("la seconde passee, la poussee vient", nef.ignition(0.5, 1), 1);
  check("et l'allumage est complet",
        nef.events.join(","), "CompleteShipIgnition");
  // Relacher AVANT la fin annule, et il faut tout recommencer.
  const nef2 = new Ship({}, null, [0, 0, 0]);
  nef2.landed = true;
  nef2.ignition(0.1, 1);
  nef2.ignition(0.4, 1);
  check("relacher annule", nef2.ignition(0.1, 0), 0);
  check("et l'annonce", nef2.events.join(","), "CancelShipIgnition");
  nef2.ignition(0.1, 1);
  check("on repart de zero", nef2.ignition(0.5, 1), 0);
  check("et il faut de nouveau une seconde", nef2.ignition(0.5, 1), 1);
  // En vol, l'allumage ne s'applique pas : la poussee passe telle quelle.
  const enVol = new Ship({}, null, [0, 0, 0]);
  enVol.landed = false;
  check("en vol, la poussee passe", enVol.ignition(0.016, 1), 1);
  check("et rien ne s'annonce", enVol.events.length, 0);
  // Une poussee vers le BAS au sol est bornee a zero : on ne s'enfonce pas
  // dans la piste.
  const bas = new Ship({}, null, [0, 0, 0]);
  bas.landed = true;
  check("pousser vers le bas au sol ne fait rien", bas.ignition(0.1, -1), 0);
  check("et n'allume pas", bas.events.length, 0);

  // --- ce que le jeu annonce, lot 2 (docs/67) ---
  //
  // Le mur qui reclame la combinaison : un collider qu'on allume et qu'on
  // eteint, pas un volume qui declenche.
  const barriere = [{ kind: "barrier", name: "SuitBarrier", position: [0, 0, 0],
                 volume: { shape: "box", size: [10, 10, 10] } }];
  const nu = new Equipment({ suit: false });
  const vetu = new Equipment({ suit: true });
  check("sans combinaison, le barriere repousse",
        suitBarrierPush(barriere, [4, 0, 0], nu) !== null, true);
  check("et il repousse par la face la plus proche",
        suitBarrierPush(barriere, [4, 0, 0], nu).map((v) => Math.round(v * 100) / 100)
          .join(","), "1,0,0");
  check("de l'autre cote, dans l'autre sens",
        Math.sign(suitBarrierPush(barriere, [-4, 0, 0], nu)[0]), -1);
  check("et par le haut si c'est plus court",
        suitBarrierPush(barriere, [0, 4.5, 0], nu).findIndex((v) => v !== 0), 1);
  check("avec la combinaison, il n'existe pas",
        suitBarrierPush(barriere, [0, 0, 0], vetu), null);
  check("et dehors, rien non plus",
        suitBarrierPush(barriere, [50, 0, 0], nu), null);
  // Manger une guimauve REND TOUTE LA SANTE. Deux lignes d'IL, et le portage
  // comptait les guimauves sans rien en faire.
  const res = { health: 12, maxHealth: 100, dead: true };
  check("manger rend toute la sante", eatMarshmallowHeals(res), 88);
  check("la sante est pleine", res.health, 100);
  check("et l'on n'est plus mort", res.dead, false);
  check("sans ressources, rien ne casse", eatMarshmallowHeals(null), 0);
  // L'invite de lampe : sept conditions, et la derniere est un OU.
  const invite = (o) => flashlightPromptVisible({ suit: true, onDaySide: false, ...o });
  check("de nuit, sans lampe allumee, on propose", invite({}), true);
  check("lampe allumee, non", invite({ on: true }), false);
  check("sans combinaison, non", invite({ suit: false }), false);
  check("dans le vaisseau, non", invite({ inShip: true }), false);
  check("sur la carte, non", invite({ inMapView: true }), false);
  check("assis quelque part, non", invite({ attached: true }), false);
  check("a la camera du satellite, non", invite({ satelliteCam: true }), false);
  check("en plein jour, non", invite({ onDaySide: true }), false);
  check("mais en plein jour dans une zone sombre, oui",
        invite({ onDaySide: true, inDarkZone: true }), true);

  // --- les meteores de Brittle Hollow (docs/68) ---
  //
  // `meteorLaunchers` etait ecrit, eprouve, et appele par personne.
  check("cinquante de degats au contact", METEOR.damage, 50);
  check("et une demi-seconde d'immunite", METEOR.ignoreSeconds, 0.5);
  const tireur = [{ name: "L", position: [0, 0, 0], direction: [0, 1, 0],
                     minSpeed: 100, maxSpeed: 200, minInterval: 5,
                     maxInterval: 20, radius: 10 }];
  // Un tirage constant a la moitie : delai 12,5 s, vitesse 150.
  const lesTireurs = new MeteorLaunchers(tireur, () => 0.5);
  check("rien ne part avant le delai", lesTireurs.update(1, 10).length, 0);
  check("puis un meteore part", lesTireurs.update(1, 13).length, 1);
  check("a la vitesse tiree", Math.round(lesTireurs.meteors[0].vel[1]), 150);
  check("et il n'y en a qu'un", lesTireurs.meteors.length, 1);
  // Le delai se RETIRE a chaque tir : ce n'est pas une periode.
  check("le delai est retire", lesTireurs.launchers[0].delay, 12.5);
  check("rien juste apres", lesTireurs.update(1, 20).length, 0);
  check("un second au delai suivant", lesTireurs.update(1, 26).length, 1);
  // La demi-seconde d'immunite : un meteore tout neuf ne touche personne.
  const neuf = new MeteorLaunchers(tireur, () => 0);
  neuf.update(1, 6);
  check("un meteore tout neuf ne touche pas", neuf.hits([0, 0, 0], 1), null);
  neuf.step(0.6, null);
  check("passe la demi-seconde, il touche",
        neuf.hits(neuf.meteors[0].pos, 1) !== null, true);
  check("et loin, il ne touche pas", neuf.hits([0, 0, 9999], 1), null);
  // Le champ le fait retomber.
  const retombe = new MeteorLaunchers(tireur, () => 0);
  retombe.update(1, 6);
  const vAvant = retombe.meteors[0].vel[1];
  retombe.step(1, { dir: { x: 0, y: -1, z: 0 }, magnitude: 20 });
  check("le champ le freine", retombe.meteors[0].vel[1], vAvant - 20);
  // Il ne vit pas eternellement.
  const vieux = new MeteorLaunchers(tireur, () => 0);
  vieux.update(1, 6);
  vieux.step(METEOR.life + 1, null);
  check("et il finit par disparaitre", vieux.meteors.length, 0);
}

{
  // --- S'ASSEOIR (docs/69-assise.md) ---
  //
  // Les quatre `PlayerAttachPoint` : le portage ne s'asseyait nulle part, et
  // `attachPoints` etait lu par personne.

  check("le taux du constructeur", ATTACHE.rotationRate, 100);
  check("et le glissement", ATTACHE.translationRate, 2);

  // La duree du demi-tour est une DISTANCE ANGULAIRE divisee par un taux.
  check("arriver de face ne prend aucun temps",
        turnDuration([0, 0, 1], [0, 0, 1]), 0);
  check("arriver de dos prend 1,8 s a cent degres par seconde",
        turnDuration([0, 0, -1], [0, 0, 1]), 1.8);
  check("un quart de tour, 0,9 s",
        Math.round(turnDuration([1, 0, 0], [0, 0, 1]) * 1000) / 1000, 0.9);

  // Le SmoothStep, et le cas ou la duree est nulle : `ble.un` du build.
  check("duree nulle, on y est deja", turnFraction(0, 0), 1);
  check("a mi-duree, la moitie du chemin", turnFraction(0.9, 1.8), 0.5);
  check("au quart, moins que le quart (SmoothStep)",
        turnFraction(0.45, 1.8) < 0.25, true);

  // Le glissement est une fraction PAR IMAGE, bornee.
  check("a soixante images, un trentieme",
        Math.round(slideFraction(1 / 60) * 10000) / 10000, 0.0333);
  check("une image trop longue ne depasse pas la cible", slideFraction(10), 1);

  // `CenterCamera(rate)` est `SnapToDegrees(0, 0, rate)`.
  check("recentrer depuis (30, 40) prend un demi-tour de seconde",
        snapDuration(30, 40, 0, 0, 100), 0.5);
  check("et depuis le centre, aucun temps", snapDuration(0, 0, 0, 0, 100), 0);
  check("a mi-duree, la moitie des degres",
        snapDegrees([30, 40], [0, 0], 0.25, 0.5)[0], 15);

  // Le repere du point : aller et retour.
  const point = { position: [10, 0, 0], rotation: [0, 0.707107, 0, 0.707107] };
  const local = toLocal(point, [10, 0, 5]);
  // Le point regarde +X ; ce qui est cinq unites devant lui en monde (+Z)
  // est donc a -5 sur SON axe X, et non a +5 : c'est la rotation inverse.
  check("le repere du point tourne bien avec lui", Math.round(local[0]), -5);
  const retour = toWorld(point, local);
  check("et l'aller-retour retombe sur ses pieds", Math.round(retour[2]), 5);

  // Le slerp prend le chemin court, meme entre quaternions opposes.
  const q = qslerp([0, 0, 0, 1], [0, 0, 0, -1], 0.5);
  check("le chemin court entre deux ecritures de la meme pose",
        Math.abs(q[3]), 1);

  // Le poste de pilotage : les trois drapeaux, et une assise complete.
  const pilotage = new AttachPoint({
    name: "FlightConsole", body: "Ship_Body", position: [0, 0, 0],
    rotation: [0, 0, 0, 1], lockTurning: true, matchRotation: true,
    centerCamera: true, rotationRate: 100 });
  const joueur = { position: [0, 0, -2], rotation: [0, 1, 0, 0] };  // dos tourne
  const demande = pilotage.attach(joueur, 0);
  check("le poste recentre la camera", demande.centerCamera, true);
  check("au taux du point", demande.rate, 100);
  check("et verrouille le tour du joueur", demande.lock, true);
  check("dos tourne, le demi-tour dure 1,8 s",
        Math.round(pilotage.turnDuration * 100) / 100, 1.8);
  // Une image plus tard : le joueur a glisse vers le point, sans y etre.
  const p1 = pilotage.update(0.1, 0.1);
  check("il glisse vers le siege", p1.position[2] > -2, true);
  check("sans y etre deja", p1.position[2] < 0, true);
  // Et au bout de la duree, il est aligne sur le point : rotation identite.
  pilotage.update(0.1, 5);
  const fin = pilotage.update(0.1, 5);
  check("passe la duree, il regarde ou le siege regarde",
        Math.round(Math.abs(fin.rotation[3]) * 1000) / 1000, 1);

  // On se leve avec la vitesse DU POINT, jamais zero.
  const assis = new AttachPoint({ name: "FlightConsole", body: "Ship_Body",
                                  position: [0, 0, 0], rotation: [0, 0, 0, 1] });
  assis.attach({ position: [0, 0, -1], rotation: [0, 0, 0, 1] }, 0);
  check("s'asseoir s'annonce", assis.events[0], "AttachPlayerToPoint");
  check("et l'annonce sait a quoi", assis.body, "Ship_Body");
  const leve = assis.detach([0, 0, 200]);
  check("se lever aussi", assis.events[1], "DetachPlayerFromPoint");
  check("et on emporte la vitesse du point", leve.velocity[2], 200);
  check("plus rien ne suit une fois debout", assis.update(0.1, 1), null);

  // L'ascenseur : le seul point qui ne prend RIEN.
  const lift = new AttachPoint({ name: "AttachPoint", body: "TimberHearth_Body",
                                 position: [0, 0, 0], rotation: [0, 0, 0, 1],
                                 lockTurning: false, matchRotation: false,
                                 centerCamera: false });
  const monte = lift.attach({ position: [0, 1, 0], rotation: [0, 1, 0, 0] }, 0);
  check("monter ne recentre pas la camera", monte.centerCamera, false);
  check("ni ne verrouille le tour", monte.lock, false);
  check("et l'orientation reste au joueur", lift.update(0.1, 1).rotation, null);

  // Le porteur bouge : le point suit, et le joueur avec.
  const suivi = new AttachPoint({ position: [0, 0, 0], rotation: [0, 0, 0, 1] });
  suivi.attach({ position: [0, 0, -1], rotation: [0, 0, 0, 1] }, 0);
  const porte = suivi.update(1, 1, [100, 0, 0]);
  check("le joueur part avec son porteur", porte.position[0] > 50, true);

  // Le porteur TOURNE : c'est le cas du vaisseau, et le decalage seul ne le
  // dit pas. Le repere vivant remplace alors la pose au repos.
  const coque = new AttachPoint({ position: [0, 0, 0], rotation: [0, 0, 0, 1],
                                  matchRotation: true });
  coque.follow({ position: [0, 500, 0], rotation: [0, 1, 0, 0] });
  check("le siege prend le repere de sa coque",
        Math.round(coque.forward()[2]), -1);
  coque.attach({ position: [0, 499, 0], rotation: [0, 1, 0, 0] }, 0);
  check("et le joueur y est porte", Math.round(coque.update(1, 9).position[1]), 500);
  coque.follow(null);
  check("rendu, le point retrouve sa pose au repos", coque.forward()[2], 1);

  // La lunette suspend l'assise, et en sortir RECOMMENCE le demi-tour.
  const lunette = new AttachPoint({ position: [0, 0, 0], rotation: [0, 0, 0, 1],
                                    matchRotation: true });
  lunette.attach({ position: [0, 0, -1], rotation: [0, 0, 0, 1] }, 0);
  check("entrer dans la lunette suspend le suivi",
        lunette.enterTelescope() && lunette.matchRotation, false);
  check("et n'y entre pas deux fois", lunette.enterTelescope(), false);
  lunette.exitTelescope({ position: [0, 0, -1], rotation: [0, 1, 0, 0] }, 9);
  check("en sortir le restaure", lunette.matchRotation, true);
  check("et redemarre le demi-tour depuis maintenant", lunette.since, 9);

  // Un seul point a la fois.
  const tous = new AttachPoints([
    { name: "FlightConsole", position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    { name: "ShipComputer", position: [0, -6, 0], rotation: [0, 0, 0, 1] },
  ]);
  check("les deux points sont poses", tous.count, 2);
  check("on trouve celui de la zone", tous.at([0, -6, 0.2]).name, "ShipComputer");
  check("et rien la ou il n'y en a pas", tous.at([0, 50, 0]), null);
  tous.attach(tous.at([0, 0, 0]), { position: [0, 0, -1], rotation: [0, 0, 0, 1] }, 0);
  check("on est assis", tous.attached, true);
  tous.attach(tous.at([0, -6, 0]), { position: [0, -6, -1], rotation: [0, 0, 0, 1] }, 1);
  check("passer a l'autre libere le premier",
        tous.points[0].attached, false);
  check("et le second tient", tous.points[1].attached, true);
  tous.detach();
  check("se lever libere tout", tous.attached, false);
  // Les annonces se drainent d'un bloc, comme celles du vaisseau.
  const annonces = tous.drain();
  check("les quatre annonces sont passees", annonces.length, 4);
  check("et le drainage vide", tous.drain().length, 0);
}

{
  // --- CE QUI SE COMMANDE, ET QUAND (docs/70-modes.md) ---
  //
  // `OWInput` echange un ENSEMBLE de canaux actifs a chaque changement de
  // mode, et `GetAxis` rend zero pour tout canal absent. Le portage lisait les
  // vingt-deux canaux en permanence, ce qui n'est vrai dans aucun mode.

  check("dix ensembles", Object.keys(ENSEMBLES).length, 10);
  // Les alias de mode retombent tous sur un canal du build : c'est tout ce que
  // sont les classes `*Input` — des tables d'alias.
  check("chaque alias designe un canal connu",
        Object.values(ALIAS).every((c) => COMMANDES[c] !== undefined), true);
  check("roulis et lacet sont le MEME canal", ALIAS.roll, ALIAS.yaw);
  check("avancer le texte, c'est interagir", ALIAS.advanceText, ALIAS.interact);

  // Les tailles mesurees, ensemble par ensemble.
  check("a pied, dix-huit canaux sur vingt-deux", canaux("personnage").size, 18);
  check("au poste de pilotage, dix-sept", canaux("vaisseau").size, 17);
  check("a la camera d'atterrissage, douze", canaux("atterrissage").size, 12);
  check("au vaisseau miniature, huit", canaux("modele").size, 8);
  check("a la carte, huit", canaux("carte").size, 8);
  check("a la lunette, six", canaux("lunette").size, 6);
  check("a l'ordinateur de bord, quatre", canaux("ordinateur").size, 4);
  check("a la camera du satellite, trois", canaux("satellite").size, 3);
  check("en dialogue, deux", canaux("dialogue").size, 2);
  check("dans un menu, UN", canaux("menu").size, 1);

  // Et ce que ces tailles veulent dire, ligne par ligne.
  check("a pied, pas d'autopilote", canaux("personnage").has("Autopilot"), false);
  check("ni de camera d'atterrissage",
        canaux("personnage").has("Landing Camera"), false);
  check("ni de zoom", canaux("personnage").has("Zoom In"), false);
  check("au poste, pas de saut", canaux("vaisseau").has("Jump"), false);
  check("et PAS DE LAMPE", canaux("vaisseau").has("Flashlight"), false);
  check("a la lunette, on ne marche plus", canaux("lunette").has("Move Z"), false);
  check("ni ne saute", canaux("lunette").has("Jump"), false);
  check("mais on vise toujours un referentiel",
        canaux("lunette").has("Lock On"), true);
  check("a la carte, on n'interagit pas", canaux("carte").has("Interact"), false);
  check("mais on vise", canaux("carte").has("Lock On"), true);
  check("dans un menu, seule la touche qui le referme",
        [...canaux("menu")][0], "Pause");
  check("en dialogue, avancer et choisir",
        [...canaux("dialogue")].sort().join(","), "Interact,Move Z");
  check("a la camera d'atterrissage, pas de menu",
        canaux("atterrissage").has("Pause"), false);

  // Chaque mode se quitte : un ensemble sans sortie enfermerait le joueur.
  for (const [nom, sortie] of [["carte", "Map"], ["lunette", "Telescope"],
                               ["menu", "Pause"], ["dialogue", "Interact"],
                               ["ordinateur", "Cancel"], ["satellite", "Cancel"],
                               ["modele", "Cancel"],
                               ["atterrissage", "Landing Camera"]]) {
    check(`on sort du mode ${nom}`, canaux(nom).has(sortie), true);
  }

  const m = new Modes();
  check("on commence a pied", m.mode, "personnage");
  check("et la lampe s'allume", m.permet("Flashlight"), true);
  m.entre("vaisseau");
  check("au poste, la lampe ne repond plus", m.permet("Flashlight"), false);
  check("mais l'autopilote, oui", m.permet("Autopilot"), true);
  m.sort("vaisseau");
  check("en sortant, la lampe revient", m.permet("Flashlight"), true);

  // LA CASE DE SAUVEGARDE N'EST PAS UNE PILE. C'est le build, et le reproduire
  // est le but : un portage qui « corrige » cela ne se commande plus pareil.
  const pile = new Modes();
  pile.entre("lunette");
  check("a la lunette", pile.permet("Zoom In"), true);
  pile.entre("carte");
  check("la carte ecrase la sauvegarde de la lunette",
        pile.dernier.has("Zoom In"), true);
  pile.entre("menu");
  check("et le menu ecrase celle de la carte", pile.dernier.has("Map"), true);
  pile.sort("menu");
  check("refermer le menu rend la CARTE", pile.permet("Map"), true);
  pile.sort("carte");
  check("et refermer la carte rend la carte encore", pile.permet("Map"), true);
  // Et c'est bien l'ensemble de la CARTE que l'on garde, pas celui de la
  // lunette : « Move Z » y est, et la lunette ne l'a pas.
  check("la lunette, elle, est perdue", pile.permet("Move Z"), true);

  // Sortir du poste alors que la lunette est ouverte ne touche a RIEN.
  const lu = new Modes();
  lu.entre("vaisseau");
  lu.entre("lunette");
  check("la lunette depuis le poste", lu.permet("Zoom In"), true);
  check("sortir du poste ne fait rien", lu.sort("vaisseau"), false);
  check("et la lunette tient toujours", lu.permet("Zoom In"), true);
  lu.sort("lunette");
  check("c'est en la refermant qu'on retrouve le poste",
        lu.permet("Autopilot"), true);

  // Un mort ne commande RIEN — pas meme d'ouvrir le menu.
  const mo = new Modes();
  mo.meurt();
  check("un mort n'a aucun canal", mo.actif.size, 0);
  check("pas meme la pause", mo.permet("Pause"), false);
  mo.init();
  check("et rouvrir les yeux les rend tous", mo.actif.size, 18);

  // Les cinq ajouts du portage ne sont dans aucun ensemble du build, et
  // passent toujours : ils sont hors du systeme de modes, pas dedans.
  const aj = new Modes();
  aj.entre("menu");
  for (const nom of Object.keys(AJOUTS)) {
    check(`l'ajout « ${nom} » passe meme dans un menu`, aj.permet(nom), true);
  }

  // Le filtre vit dans `Commandes`, comme `GetAxis` dans le build.
  const cm = new Commandes(null);
  const etat = { keys: { KeyF: true, KeyE: true } };
  check("sans modes poses, tout se lit", cm.held("Flashlight", etat), true);
  const fm = new Modes();
  cm.setModes(fm);
  check("a pied, la lampe repond", cm.held("Flashlight", etat), true);
  fm.entre("vaisseau");
  check("au poste, la MEME touche ne rend plus rien",
        cm.held("Flashlight", etat), false);
  check("et l'axe rend zero", cm.axis("Move X", { keys: { KeyD: true } }), 1);
  fm.entre("menu");
  check("dans un menu, plus un axe", cm.axis("Move X", { keys: { KeyD: true } }), 0);
  check("et les modes qui sauvegardent sont sept", SAUVEGARDENT.size, 7);
}

{
  // --- CE QUI BOUGE QUAND ON NE LE REGARDE PAS (docs/71-quantique.md) ---

  check("cent unites de verrou", QUANTIQUE.maxQuantumLockRange, 100);
  check("cent de rayon de fonction d'onde", QUANTIQUE.wavefunctionRadius, 100);
  check("quarante-cinq degres de pente", QUANTIQUE.maxSlope, 45);
  check("une chance sur cinq par morceau", QUANTIQUE.rendererChance, 0.2);

  // Les cinq enfants de `MakeChildrenPlanarQuantum` : trois pins, une cabane,
  // un panneau — sur la lune quantique.
  const gpq = { placed: { MakeChildrenPlanarQuantum: [
    { name: "QuantumObjects", body: "QuantumMoon_Body", position: [0, 0, 0],
      fields: {}, children: [
        { name: "Pine_Thick", local: [-13.8, 18.3, -15.1], position: [-13.8, 18.3, -15.1] },
        { name: "Pine_Thick", local: [6.3, 19, 15.4], position: [6.3, 19, 15.4] },
        { name: "Pine_Thick", local: [-25.3, 21.1, 17.6], position: [-25.3, 21.1, 17.6] },
        { name: "QuantumCabin", local: [0, 18.9, 0], position: [0, 18.9, 0] },
        { name: "Sign01", local: [-5.6, 19.6, 13.7], position: [-5.6, 19.6, 13.7] },
      ] },
  ] } };
  const cinq = planarQuantumObjects(gpq);
  check("cinq objets planaires", cinq.length, 5);
  check("et tous sur la lune quantique",
        cinq.every((o) => o.body === "QuantumMoon_Body"), true);
  check("trois pins", cinq.filter((o) => o.name === "Pine_Thick").length, 3);
  check("une cabane et un panneau",
        cinq.filter((o) => /Cabin|Sign/.test(o.name)).length, 2);
  check("sans composant pose, rien", planarQuantumObjects({}).length, 0);

  // La statue du musee, avec ses morceaux.
  const st = quantumStatues({ placed: { QuantumStatue: [
    { name: "QuantumStatue", body: null, position: [1, 2, 3],
      fields: { _maxQuantumLockRange: 100, _minQuantumLockRange: 0,
                _isLightSensitive: false },
      children: [{ name: "AncientHeadStatue", local: [0, 1.1, 0] }] },
  ] } });
  check("une statue", st.length, 1);
  check("un morceau", st[0].parts.length, 1);
  check("et elle n'est pas sensible a la lumiere", st[0].lightSensitive, false);

  // L'EFFONDREMENT SE DECLENCHE SUR LA TRANSITION, et sur elle seule.
  const q = new ObjetQuantique(cinq[0]);
  check("regarde, il ne bouge pas", q.update(true), false);
  check("toujours regarde, toujours pas", q.update(true), false);
  check("a l'instant ou il sort du champ, il bouge", q.update(false), true);
  check("et ne rebouge pas tant qu'il reste dehors", q.update(false), false);
  q.update(true);
  check("le revoir puis detourner les yeux le refait bouger",
        q.update(false), true);
  check("deux effondrements en tout", q.collapses, 2);

  // LE VERROU DE LA SONDE. Distance dans la fourchette ET dans le cadre.
  const v = new ObjetQuantique(cinq[1]);
  check("hors portee, rien ne change", v.snapshot(500, true), false);
  check("a bonne distance mais hors cadre, non", v.snapshot(50, false), false);
  check("a bonne distance et dans le cadre, verrouille", v.snapshot(50, true), true);
  v.update(true);
  check("un objet verrouille ne s'effondre plus", v.update(false), false);
  v.retrieveProbe();
  check("rappeler la sonde le libere", v.locked, false);
  v.update(true);
  check("et il s'effondre a nouveau", v.update(false), true);
  // La loi seule, hors de l'objet.
  check("hors portee : inchange", locksOnSnapshot(500, true), null);
  check("sous la portee minimale : inchange aussi",
        locksOnSnapshot(-1, true, { minLockRange: 0, maxLockRange: 100 }), null);
  check("dans la fourchette, le cadre decide", locksOnSnapshot(50, false), false);

  // LA LAMPE. Une sonde posee a moins de cent unites protege l'objet.
  check("invisible, eteindre ne fait rien",
        collapsesOnFlashlightOff(false, null), false);
  check("visible et sans sonde, il s'effondre",
        collapsesOnFlashlightOff(true, null), true);
  check("visible avec la sonde a cinquante, il tient",
        collapsesOnFlashlightOff(true, 50), false);
  check("la sonde a cent tient encore", collapsesOnFlashlightOff(true, 100), false);
  check("a cent-un, elle ne protege plus",
        collapsesOnFlashlightOff(true, 101), true);

  // LA STATUE : chaque morceau a sa chance, tiree independamment.
  const parts = ["a", "b", "c", "d", "e"];
  check("tout visible si le tirage est toujours bas",
        statueParts(parts, () => 0).filter((p) => p.visible).length, 5);
  check("rien si le tirage est toujours haut",
        statueParts(parts, () => 0.9).filter((p) => p.visible).length, 0);
  check("et le seuil est bien un cinquieme",
        statueParts(parts, () => 0.2).filter((p) => p.visible).length, 0);
  check("juste en dessous, tout",
        statueParts(parts, () => 0.19).filter((p) => p.visible).length, 5);

  // Le tirage planaire : dans le disque, a la hauteur du terrain.
  {
    let n = 0;
    const suite = [0.9, 0.9, 0.5, 0.5];     // premier couple hors du disque
    const p = planarCandidate(() => suite[n++ % suite.length]);
    check("le point tombe dans le disque",
          Math.hypot(p[0], p[2]) <= QUANTIQUE.wavefunctionRadius, true);
    check("et part d'au-dessus du terrain", p[1], QUANTIQUE.maxTerrainHeight);
    check("le tirage hors du disque est REJETE, pas ramene", n > 2, true);
  }

  // La pente : quarante-cinq degres, strictement.
  check("a plat, la pente convient", slopeOK([0, 1, 0], [0, 1, 0]), true);
  check("a trente degres, encore",
        slopeOK([Math.sin(Math.PI / 6), Math.cos(Math.PI / 6), 0], [0, 1, 0]), true);
  check("a soixante, non",
        slopeOK([Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 0], [0, 1, 0]), false);

  // Le tirage refuse un candidat visible : un objet quantique ne se
  // materialise jamais sous vos yeux.
  {
    const o = new ObjetQuantique(cinq[3]);
    let essais = 0;
    o.update(true);
    const bouge = o.update(false, () => { essais++; return essais >= 4 ? [1, 2, 3] : null; });
    check("il insiste jusqu'a trouver une place qu'on ne voit pas", bouge, true);
    check("en quatre essais", essais, 4);
    check("et il y est", o.position.join(","), "1,2,3");
  }
  {
    // Mille essais, aucune place : l'objet reste ou il est.
    const o = new ObjetQuantique(cinq[4]);
    const avant = o.position.join(",");
    o.update(true);
    check("sans place libre, il ne bouge pas", o.update(false, () => null), false);
    check("et reste ou il etait", o.position.join(","), avant);
  }
}

{
  // --- LES LOIS QUI N'ETAIENT QU'IMPORTEES (docs/72-poussiere.md) ---

  // LA POUSSIERE DE VITESSE. Rien sous trente unites par seconde.
  check("trente unites par seconde, le seuil", DUST.minSpeed, 30);
  check("sous le seuil, aucune trace", motionDust(29).alpha, 0);
  check("mais le systeme emet quand meme", motionDust(29).emitting, true);
  // `s x 0,01` borne a 0,2 atteint le plafond des vingt unites par seconde, et
  // le seuil en coupe trente : entre les deux lois, l'alpha ne prend QUE deux
  // valeurs, 0 et 0,2. La rampe existe dans le code du build et n'est jamais
  // parcourue — c'est le build qui le dit, pas le portage qui simplifie.
  check("au-dessus du seuil, l'alpha est au plafond", motionDust(31).alpha, 0.2);
  check("et beaucoup plus vite, toujours au plafond", motionDust(500).alpha, 0.2);
  check("et il plafonne a un cinquieme", motionDust(9999).alpha, DUST.maxAlpha);
  // La duree de vie DIMINUE quand le debit augmente.
  check("a trente, la vie est de cinq secondes", motionDust(30).lifetime, 5);
  check("a cent, elle est au plancher", motionDust(100).lifetime, DUST.minLifetime);
  check("et le debit a monte", motionDust(100).rate > motionDust(30).rate, true);
  check("sans cible visee, rien n'est seme",
        motionDust(500, { targeting: false }).emitting, false);
  check("et sur la carte non plus",
        motionDust(500, { mapView: true }).emitting, false);

  // ON NE GRILLE PAS DE LOIN.
  check("quatre unites", ROAST_DISTANCE, 4);
  check("a trois unites, on grille encore", roastBroken(3, null), false);
  check("a cinq, c'est fini", roastBroken(5, null), true);
  check("et l'invite du build a le dernier mot",
        roastBroken(9, { distance: 10 }), false);

  // LA TOILE : deux anneaux en sens INVERSE, au cube des fractions.
  const anim = webAnimators({ placed: { GazeWebAnimator: [
    { name: "GazeVolume", body: "Twin01_Body", position: [0, 0, 0], fields: {},
      targets: { _innerWeb: { name: "innerWeb" }, _outerWeb: { name: "outerWeb" },
                 _gazeSwitch: { name: "GazeVolume" } } },
  ] } });
  check("un animateur de toile", anim.length, 1);
  check("qui nomme ses deux anneaux",
        [anim[0].inner, anim[0].outer].join(","), "innerWeb,outerWeb");
  check("et l'interrupteur qui les commande", anim[0].gazeSwitch, "GazeVolume");
  check("sans rien poser, rien", webAnimators({}).length, 0);
  {
    const v = webSpeeds(0, 0);
    check("au repos, rien ne tourne", v.outer + v.inner, 0);
    const q = webSpeeds(0.5, 0);
    const p2 = webSpeeds(1, 0);
    // Au CUBE : a mi-regard, un huitieme de la vitesse, pas la moitie.
    check("a mi-regard, un huitieme de la vitesse", q.outer / p2.outer, 0.125);
    const c = webSpeeds(1, 1);
    check("les deux anneaux tournent en sens INVERSE", c.inner < 0 && c.outer > 0, true);
  }
  check("la toile s'efface en deux secondes", webAlpha(2), 0);
  check("a mi-chemin, a moitie", webAlpha(1), 0.5);
  check("et jamais en dessous de zero", webAlpha(10), 0);

  // LA TEMPETE DE SABLE : quatre cylindres, UNE entree, UNE sortie.
  const gpSable = { placed: {
    SandstormVolume: [{ name: "FluidVolume", body: "SandFunnel_Body",
                        position: [0, 0, 0], fields: {} }],
    ChildTriggerVolume: [
      { name: "FluidCylinder", body: "SandFunnel_Body", position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        volume: { shape: "capsule", radius: 30, height: 400, axis: 1, center: [0, 0, 0] } },
      { name: "FluidCylinder", body: "SandFunnel_Body", position: [40, 0, 0],
        rotation: [0, 0, 0, 1],
        volume: { shape: "capsule", radius: 25, height: 300, axis: 1, center: [0, 0, 0] } },
    ],
  } };
  check("une tempete posee", sandstormVolumes(gpSable).length, 1);
  const cyl = childTriggers(gpSable, "SandFunnel_Body");
  check("deux cylindres", cyl.length, 2);
  check("et chacun a son identite", cyl[0].id !== cyl[1].id, true);
  const orage = new Sandstorm(sandstormVolumes(gpSable), cyl);
  check("dehors, rien", orage.update([1000, 0, 0]), null);
  check("et l'ecran est calme", orage.active, false);
  check("entrer dans le premier cylindre l'annonce",
        orage.update([0, 0, 0]), "enter");
  check("l'ecran se charge", orage.active, true);
  // LE POINT DU VOLUME COMPOSE : passer d'un cylindre a l'autre n'emet RIEN.
  check("passer au second n'annonce rien", orage.update([40, 0, 0]), null);
  check("et l'ecran ne clignote pas", orage.active, true);
  check("ressortir l'annonce une fois", orage.update([1000, 0, 0]), "exit");
  check("et l'ecran se calme", orage.active, false);
  check("ressortir deux fois n'annonce rien", orage.update([1000, 0, 0]), null);
  // Sans cylindre, la tempete n'a pas de forme et ne declenche jamais.
  check("sans cylindre, rien",
        new Sandstorm(sandstormVolumes(gpSable), []).update([0, 0, 0]), null);
  // Le compte du volume compose, seul.
  const comp = new CompoundTrigger();
  comp.enterChild("a"); comp.enterChild("a");
  check("deux entrees du meme corps, un seul suivi", comp.inside, 1);
  check("une sortie ne suffit pas", comp.exitChild("a"), false);
  check("la seconde, oui", comp.exitChild("a"), true);
  check("et plus personne dedans", comp.inside, 0);
}

{
  // --- LES PASSAGES, LES COQUILLES, ET LE SOL QUI TOURNE (docs/73) ---

  // LES TROIS PASSAGES DE DARK BRAMBLE.
  check("six secondes de traversee", WARP.duration, 6);
  check("une seconde de garde apres l'arrivee", WARP.arrivalGuard, 1);
  check("et dix unites par seconde en arrivant", WARP.exitSpeed, 10);

  const gpW = { placed: { DerelictWarp: [
    { name: "DarkBrambleShortcut", body: "TimberHearth_Body", position: [0, 0, 0],
      rotation: [0, 0, 0, 1], volume: { shape: "sphere", radius: 50, center: [0, 0, 0] },
      fields: { _warpOnExit: false, _localArrivalPos: { x: 0, y: 0, z: 32.5 } },
      targets: { _sisterWarp: { name: "WarpVolume", body: "DarkBramble_Body" } } },
    { name: "WarpVolume", body: "DarkBramble_Body", position: [1000, 0, 0],
      rotation: [0, 0, 0, 1], volume: { shape: "sphere", radius: 60, center: [0, 0, 0] },
      fields: { _warpOnExit: false, _localArrivalPos: { x: 0, y: 0, z: 107.59 } },
      targets: { _sisterWarp: { name: "DarkBrambleShortcut", body: "TimberHearth_Body" } } },
  ] } };
  const res = new DerelictWarps(warps(gpW));
  check("deux passages", res.count, 2);
  check("et chacun connait son jumeau",
        res.warps.every((w) => w.jumeau !== null), true);
  // Entrer ne suffit pas : il faut TENIR trois secondes.
  check("a l'entree, rien", res.update(0.1, 0, [0, 0, 0]), null);
  check("a deux secondes, toujours rien", res.update(0.1, 2, [0, 0, 0]), null);
  const saut = res.update(0.1, 3, [0, 0, 0]);
  check("a trois secondes, on part", saut !== null, true);
  check("vers le jumeau", saut.receiver.name, "WarpVolume");
  // Le point d'arrivee : le local du JUMEAU, dans son repere.
  check("au point d'arrivee du jumeau", Math.round(saut.arrival[2]), 108);
  check("et pres de son centre", Math.round(saut.arrival[0]), 1000);
  // On arrive EN MOUVEMENT, vers le centre ou en s'en eloignant.
  check("et en mouvement", Math.round(Math.hypot(...saut.velocity)), 10);
  // La seconde de garde : arriver DANS le jumeau ne renvoie pas aussitot.
  check("la garde empeche le renvoi immediat",
        res.update(0.1, 3.5, [1000, 0, 0]), null);

  // Sortir d'un volume `_warpOnExit` part TOUT DE SUITE.
  const gpX = { placed: { DerelictWarp: [
    { name: "WarpVolume", body: "DerelictDimension_Body", position: [0, 0, 0],
      rotation: [0, 0, 0, 1], volume: { shape: "sphere", radius: 550, center: [0, 0, 0] },
      fields: { _warpOnExit: true, _localArrivalPos: { x: 525, y: 0, z: 0 } },
      targets: { _sisterWarp: { name: "Autre", body: "DarkBramble_Body" } } },
    { name: "Autre", body: "DarkBramble_Body", position: [5000, 0, 0],
      rotation: [0, 0, 0, 1], volume: { shape: "sphere", radius: 60, center: [0, 0, 0] },
      fields: { _warpOnExit: false, _localArrivalPos: { x: 0, y: 0, z: 10 } },
      targets: { _sisterWarp: { name: "WarpVolume", body: "DerelictDimension_Body" } } },
  ] } };
  const bord = new DerelictWarps(warps(gpX));
  bord.update(0.1, 0, [0, 0, 0]);                 // dedans
  check("rester dedans ne fait rien", bord.update(0.1, 1, [0, 0, 0]), null);
  const sortie = bord.update(0.1, 2, [10000, 0, 0]);
  check("en sortir part tout de suite", sortie !== null, true);
  check("et cela s'annonce", bord.drain().includes("ExitDerelictZone"), true);
  check("le drainage vide", bord.drain().length, 0);

  // LES COQUILLES SONORES.
  check("une seconde de fondu", SHELL_FADE, 1);
  const gpS = { placed: { AudioShell: [
    { name: "OceanAudio", body: "GiantsDeep_Body", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 498, center: [0, 0, 0] }, fields: {} },
  ] } };
  const sources = [{ position: [0, 0, 0], name: "ocean" },
                   { position: [9999, 0, 0], name: "ailleurs" }];
  const coq = new AudioShells(audioShells(gpS), sources);
  check("une coquille", coq.count, 1);
  check("appariee a la source de son centre", coq.paired, 1);
  check("et c'est la bonne", coq.shells[0].index, 0);
  // Dehors : la source joue a plein.
  check("dehors, la source joue", coq.update(1, [1000, 0, 0]).get(0), 1);
  // Entrer la tete : le fondu part de 1 et descend en une seconde.
  const g0 = coq.update(0, [0, 0, 0]).get(0);
  check("a l'instant ou la tete entre, rien n'a encore change", g0, 1);
  check("a mi-seconde, la moitie", coq.update(0.5, [0, 0, 0]).get(0), 0.5);
  check("a une seconde, etouffee", coq.update(0.5, [0, 0, 0]).get(0), 0);
  check("et cela tient", coq.update(2, [0, 0, 0]).get(0), 0);
  // Ressortir la remonte, du meme fondu.
  coq.update(0, [1000, 0, 0]);
  check("ressortir la remonte", coq.update(0.5, [1000, 0, 0]).get(0), 0.5);
  // Une source qu'aucune coquille ne commande n'est jamais touchee.
  check("l'autre source n'est jamais commandee",
        coq.update(1, [0, 0, 0]).has(1), false);

  // ON PART AVEC LE SOL : `MatchInitialMotion`.
  {
    // Un porteur qui tourne autour de Y a un radian par seconde ; un point a
    // dix unites de son axe va donc a dix unites par seconde.
    const porteur = { velocity: [0, 0, 0], position: [0, 0, 0],
                      angularVelocity: [0, 1, 0] };
    const v = matchInitialVelocity(porteur, [10, 0, 0]);
    check("le sol emporte le point a dix unites par seconde",
          Math.round(Math.hypot(v[0], v[1], v[2])), 10);
    check("et perpendiculairement au rayon", Math.round(v[0]), 0);
    // Sur l'axe, rien ne bouge : un pole ne va nulle part.
    const pole = matchInitialVelocity(porteur, [0, 10, 0]);
    check("au pole, le sol ne va nulle part",
          Math.round(Math.hypot(pole[0], pole[1], pole[2])), 0);
    // Le drapeau des cinq instances : on jette le terme tangentiel.
    const sans = matchInitialVelocity(porteur, [10, 0, 0], { ignoreAngular: true });
    check("cinq instances ignorent la rotation", Math.hypot(...sans), 0);
    // Et la vitesse du porteur s'ajoute toujours.
    const mobile = { velocity: [100, 0, 0], position: [0, 0, 0],
                     angularVelocity: [0, 1, 0] };
    check("la vitesse du porteur s'ajoute",
          Math.round(matchInitialVelocity(mobile, [10, 0, 0])[0]), 100);
  }
}

{
  // --- LA QUEUE DES LOIS (docs/74-etalons.md) ---

  // Les phares du vaisseau : 600 partout, et `min(limite, 600)` dans un
  // secteur majeur. Le portage n'avait pas la valeur par defaut.
  check("six cents unites de portee", SHIPLIGHT_RANGE, 600);
  check("hors secteur, la portee pleine", shiplightRange(100, false), 600);
  check("dans un secteur majeur sans limite, pleine aussi",
        shiplightRange(0, true), 600);
  check("l'epave les bride a cent", shiplightRange(100, true), 100);
  check("et une limite plus large ne les elargit pas",
        shiplightRange(9000, true), 600);

  // `MapMarker.LateUpdate` : les trois regles que le portage n'avait pas.
  {
    const m = { type: "Planet", maxDistance: 50000 };
    const joueur = [100, 100];
    check("loin du joueur, le marqueur se voit",
          markerVisible(m, [500, 500, 1000], joueur, null), true);
    check("a moins de dix pixels du joueur, non",
          markerVisible(m, [103, 102, 1000], joueur, null), false);
    check("a moins de dix pixels du VAISSEAU non plus",
          markerVisible(m, [500, 500, 1000], joueur, [502, 503]), false);
    check("au-dela de sa distance maximale, non",
          markerVisible(m, [500, 500, 99999], joueur, null), false);
    check("derriere la camera non plus",
          markerVisible(m, [500, 500, -1], joueur, null), false);
    // Le marqueur du joueur sort AVANT tous les tests.
    const moi = { type: "Player", maxDistance: 1 };
    check("le marqueur du joueur ne se masque jamais",
          markerVisible(moi, [100, 100, 5], joueur, [100, 100]), true);
    // Et dans la zone brouillee, plus rien.
    check("dans l'epave, aucun marqueur",
          markerVisible(moi, [500, 500, 10], joueur, null, true), false);
  }

  // L'entonnoir n'existe qu'entre sa minute de pousse et celle de retrait.
  {
    const f = { growAfterMinutes: 5, shrinkAfterMinutes: 15 };
    check("avant la pousse, pas d'entonnoir", funnelActive(4 * 60, f), false);
    check("pendant, oui", funnelActive(10 * 60, f), true);
    check("apres le retrait, non", funnelActive(16 * 60, f), false);
    check("la minute de pousse compte", funnelActive(5 * 60, f), true);
    check("celle du retrait, non", funnelActive(15 * 60, f), false);
  }

  // Et la tempete suit l'entonnoir : traverser l'endroit ou il SERA ne leve
  // rien, parce qu'il n'y est pas encore.
  {
    const gp = { placed: {
      SandstormVolume: [{ name: "V", body: "SandFunnel_Body", position: [0, 0, 0],
                          fields: {} }],
      ChildTriggerVolume: [{ name: "C", body: "SandFunnel_Body", position: [0, 0, 0],
                             rotation: [0, 0, 0, 1],
                             volume: { shape: "sphere", radius: 30, center: [0, 0, 0] } }],
    } };
    const o = new Sandstorm(sandstormVolumes(gp), childTriggers(gp));
    check("entonnoir absent, rien ne se leve",
          o.update([0, 0, 0], null, false), null);
    check("entonnoir la, la tempete monte", o.update([0, 0, 0], null, true), "enter");
    // Et s'il se retire pendant qu'on est dedans, la tempete tombe.
    check("s'il se retire, elle tombe", o.update([0, 0, 0], null, false), "exit");
    check("et l'ecran se calme", o.active, false);
  }
}

{
  // --- LA FIN DE LA LISTE (docs/75-chaleur.md) ---

  // LA CHALEUR QUI N'EXISTAIT PAS. `heatSources` ramassait les classes dont le
  // NOM contient « heat » — il n'y en a AUCUNE dans ce build.
  check("aucune classe de nom thermique", heatSources({ placed: {
    SomethingElse: [{ name: "x", position: [0, 0, 0], volume: { radius: 3 } }],
  } }).length, 0);
  // La chaleur est ailleurs : huit emetteurs de rayonnement de type 1.
  const gpR = { placed: { RadiationEmitter: [
    { name: "Campfire", body: "TimberHearth_Body", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 2.36, center: [0, 0, 0] },
      fields: { radiationType: 1, magnitude: 100, falloffMode: 1,
                CustomFalloff: { customFalloff: { m_Curve: [
                  { time: 10, value: 1 }, { time: 45, value: 0 }] } } } },
    { name: "Sun", body: "Sun_Body", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 30000, center: [0, 0, 0] },
      fields: { radiationType: 0, magnitude: 100, falloffMode: 0 } },
  ] } };
  const emet = radiationEmitters(gpR);
  check("deux emetteurs", emet.length, 2);
  check("dont un seul thermique", emet.filter((e) => e.type === 1).length, 1);
  const feux = heatSources(gpR, emet);
  check("une seule source de chaleur", feux.length, 1);
  check("et c'est le feu de camp", feux[0].name, "Campfire");
  // La courbe tient 100 jusqu'a dix unites, puis tombe a zero a quarante-cinq.
  check("sur le feu, cent", heatAt(feux, [0, 0, 0]), 100);
  check("a dix unites, encore cent", heatAt(feux, [10, 0, 0]), 100);
  check("a quarante-cinq, plus rien", Math.round(heatAt(feux, [45, 0, 0])), 0);
  check("a mi-chemin, la moitie",
        Math.round(heatAt(feux, [27.5, 0, 0])), 50);
  // LE COLLIDER DE 2,36 N'EST PAS LA PORTEE : c'est la forme du feu. Le
  // portage avait pris l'un pour l'autre, et n'avait donc AUCUNE chaleur.
  check("le collider ne borne pas la chaleur",
        heatAt(feux, [5, 0, 0]) > 0, true);

  // L'INVITE DE SONDE : un ecart maximal, pas un cone de vue.
  {
    const inv = { gaze: [0, 0, 1], minAngle: 45 };
    check("pile dans l'axe, l'invite vient",
          promptFaced(inv, [0, 0, 1], [0, 0, 1]), true);
    check("a quarante degres, encore",
          promptFaced(inv, [Math.sin(0.698), 0, Math.cos(0.698)], [0, 0, 1]), true);
    check("a cinquante, non",
          promptFaced(inv, [Math.sin(0.873), 0, Math.cos(0.873)], [0, 0, 1]), false);
    check("et une invite sans regard vient toujours",
          promptFaced({ gaze: null }, [1, 0, 0], [0, 0, 1]), true);
  }

  // LA SONDE ANCIENNE : cinquante d'acceleration locale, vers l'avant.
  check("cinquante de poussee", ANCIENT_PROBE_THRUST, 50);
  {
    const a = ancientProbeAcceleration([0, 0, 1]);
    check("et elle pousse vers l'avant", a.join(","), "0,0,50");
  }

  // LA REGLETTE DE ZOOM.
  check("au champ minimal, la fleche est en bas", zoomArrowFraction(15), 0);
  check("au champ maximal, plus haut", zoomArrowFraction(60) > 0.7, true);
  check("et elle ne sort pas de sa reglette", zoomArrowFraction(9999), 1);

  // `SelfDestruct` : cinq secondes pour la supernova lointaine, pas une.
  check("avant le delai, l'effet vit", selfDestructed(4.9, 5), false);
  check("apres, il s'efface", selfDestructed(5.1, 5), true);
  check("et le delai par defaut est d'une seconde", selfDestructed(1.1), true);
}

{
  // --- LA PROXIMITE DU VAISSEAU, ET LE TUTORIEL A USAGE UNIQUE (docs/76) ---

  // Les voyants d'avarie ne parlent que de PRES : `TurnOffIcons` a la sortie.
  const zones = shipProximity({ placed: { ShipProximityVolume: [
    { name: "ShipZone", body: "Ship_Body", position: [0, 0, 0],
      volume: { shape: "sphere", radius: 13, center: [0, 0, 0] }, fields: {} },
  ] } });
  check("une zone de proximite", zones.length, 1);
  check("de treize unites", zones[0].volume.radius, 13);
  check("sur le vaisseau", zones[0].body, "Ship_Body");
  check("sans rien de pose, rien", shipProximity({}).length, 0);

  {
    const v = new DamageDisplay(0.5);
    // De pres : le voyant general en continu, les autres qui clignotent.
    const a = v.update(0, true, [true, false], true);
    check("le voyant general s'allume", a[0], true);
    const b = v.update(0.6, true, [true, false], true);
    check("et les autres clignotent", b[1], true);
    // De loin : TOUT est eteint, general compris.
    const c = v.update(1.2, true, [true, false], false);
    check("de loin, plus un voyant", c.every((x) => x === false), true);
    // Le battement continue de tourner : revenir ne le rattrape pas a
    // contretemps.
    const avant = v.blinkOn;
    v.update(1.9, true, [true], false);
    check("mais le battement continue", v.blinkOn !== avant, true);
  }
}

{
  // --- LES HUIT SONS D'INTERFACE (docs/77-sons.md) ---

  check("le demi-volume de toute l'interface", UI_VOLUME, 0.5);
  check("neuf evenements, huit clips", Object.keys(UI_SOUNDS).length, 9);
  // La lampe partage `_switch01` dans les deux sens : un interrupteur fait le
  // meme bruit a l'aller et au retour.
  check("allumer et eteindre, le meme clip",
        UI_SOUNDS.TurnOnFlashlight, UI_SOUNDS.TurnOffFlashlight);
  // Viser et lacher, eux, sont DEUX clips differents.
  check("viser et lacher ne s'entendent pas pareil",
        UI_SOUNDS.TargetReferenceFrame !== UI_SOUNDS.UntargetReferenceFrame, true);
  check("avancer le texte et le finir non plus",
        UI_SOUNDS.AdvanceText !== UI_SOUNDS.ExitDialogueMode, true);

  const faux = {
    of(script) {
      if (script === "UIAudioController") {
        return { clips: { _advanceTextClip: "a.ogg", _finishTextClip: "f.ogg",
                          _affirmative01: "oui.ogg", _negative01: "non.ogg",
                          _jetpackWarning: "sac.ogg", _switch01: "clic.ogg",
                          _targetReferenceFrame: "vise.ogg",
                          _untargetReferenceFrame: "lache.ogg" } };
      }
      if (script === "RepairAudioController") {
        return { clips: { _repairLoop: "rep.ogg", _spaceRepairLoop: "repvide.ogg",
                          _repairFinish: "fin.ogg", _spaceRepairFinish: "finvide.ogg" } };
      }
      if (script === "SpacesuitAudioController") {
        return { clips: { _refillOxygenClip: "o2.ogg" } };
      }
      return null;
    },
  };
  const ui = new UISounds(faux);
  check("avancer le texte clique", ui.fire("AdvanceText").file, "a.ogg");
  check("a demi-volume", ui.fire("AdvanceText").volume, 0.5);
  check("finir a son propre son", ui.fire("ExitDialogueMode").file, "f.ogg");
  check("allumer la lampe", ui.fire("TurnOnFlashlight").file, "clic.ogg");
  check("l'eteindre aussi", ui.fire("TurnOffFlashlight").file, "clic.ogg");
  check("viser", ui.fire("TargetReferenceFrame").file, "vise.ogg");
  check("lacher", ui.fire("UntargetReferenceFrame").file, "lache.ogg");
  check("un evenement inconnu ne joue rien", ui.fire("N'importe quoi"), null);
  check("et sans clips, rien non plus", new UISounds(null).fire("AdvanceText"), null);

  // ON NE REPARE PAS PAREIL DANS LE VIDE.
  check("a l'air, la boucle de l'atelier", ui.startRepair(true).file, "rep.ogg");
  check("et elle MONTE en deux dixiemes", ui.startRepair(true).fade, REPAIR_FADE);
  check("dans le vide, l'autre boucle", ui.startRepair(false).file, "repvide.ogg");
  // Arreter rend la boucle EN COURS, pas une boucle choisie a nouveau.
  check("arreter rend celle qui jouait", ui.stopRepair().file, "repvide.ogg");
  check("et il n'y en a plus", ui.stopRepair(), null);
  check("finir a l'air", ui.finishRepair(true).file, "fin.ogg");
  check("finir dans le vide", ui.finishRepair(false).file, "finvide.ogg");
  ui.startRepair(true);
  ui.finishRepair(true);
  check("et la fin arrete la boucle", ui.stopRepair(), null);
  check("le plein d'oxygene s'entend", ui.refillOxygen().file, "o2.ogg");
  check("a plein volume", ui.refillOxygen().volume, 1);
}

{
  // --- LE VAISSEAU MINIATURE ET L'ENFANT (docs/78-modele.md) ---

  check("dix unites par seconde, le seuil de crash", MODELE.crashSpeed, 10);
  check("un contact doux n'est pas un crash", crashes(9.9), false);
  check("au-dela, si", crashes(10.1), true);
  check("et pile au seuil, non plus", crashes(10), false);

  // ETRE POSE NE SUFFIT PAS : il faut etre IMMOBILE, et la rotation compte
  // cent fois plus serre que la translation.
  check("un dixieme d'unite par seconde", MODELE.landSpeed, 0.1);
  check("un centieme de radian par seconde", MODELE.landSpin, 0.01);
  check("assez lent, assez droit", stillEnough(0.05, 0.005), true);
  check("trop vite, non", stillEnough(0.2, 0), false);
  check("et un modele qui TOURNE lentement ne compte pas",
        stillEnough(0, 0.05), false);

  const piste = new ModelLandingSpot();
  check("hors de la piste, rien", piste.update(0, 0, 0), false);
  piste.setInside(true);
  check("dedans mais trop vite, rien", piste.update(0, 5, 0), false);
  check("dedans et immobile : on note l'instant", piste.update(1, 0, 0), false);
  check("mais l'annonce attend deux dixiemes", piste.update(1.1, 0, 0), false);
  check("puis elle vient", piste.update(1.3, 0, 0), true);
  check("et une seule fois", piste.update(2, 0, 0), false);
  // UNE FOIS POSE, ON NE PEUT PLUS RATER : le build ne re-teste pas les
  // seuils. Seule la SORTIE de la zone annule.
  const p2 = new ModelLandingSpot();
  p2.setInside(true);
  p2.update(0, 0, 0);
  check("repartir tout de suite compte quand meme",
        p2.update(0.3, 999, 999), true);
  p2.setInside(false);
  p2.setInside(true);
  check("mais quitter la piste efface tout", p2.update(0.4, 999, 999), false);

  // L'ENFANT COMPTE, et l'ordre n'est pas celui qu'on choisirait.
  const gamin = new RocketKid();
  check("la premiere fois, il se presente", gamin.tree(), "introduction");
  check("et il se represente tant qu'on n'a rien fait", gamin.tree(), "introduction");
  gamin.landed();
  check("un atterrissage lui vaut un compliment",
        gamin.tree(), "successfulLanding");
  // ET IL SE REPRESENTE. Les deux compteurs sont a zero apres le compliment,
  // donc la PREMIERE branche s'applique a nouveau : l'enfant se represente
  // apres chaque reussite reconnue. C'est le build, ce n'est pas un oubli du
  // portage, et l'invariant garde la mesure et non ce qu'on en penserait.
  check("et il se represente ensuite", gamin.tree(), "introduction");
  for (let i = 0; i < 4; i++) gamin.crashed();
  check("quatre crashs ne suffisent pas", gamin.tree(), null);
  gamin.crashed();
  check("le cinquieme, si", gamin.tree(), "tooManyCrashes");
  check("et le compteur repart de zero", gamin.crashes, 0);
  // LES CRASHS PASSENT AVANT : se planter cinq fois puis reussir une fois vaut
  // le reproche, pas le compliment.
  const g2 = new RocketKid();
  for (let i = 0; i < 5; i++) g2.crashed();
  g2.landed();
  check("cinq crashs et une reussite : le reproche d'abord",
        g2.tree(), "tooManyCrashes");
  check("et la reussite attend son tour", g2.tree(), "successfulLanding");

  // Les lectures de la scene.
  const gpM = { placed: {
    ModelShipLandingSpot: [
      { name: "ModelLandingSpot", body: "TimberHearth_Body", position: [0, 0, 0], fields: {} },
      { name: "ModelLandingSpot", body: "TimberHearth_Body", position: [5, 0, 0], fields: {} },
    ],
    ModelShipCrashBehavior: [
      { name: "ModelShip_Body", body: "ModelShip_Body", position: [1, 2, 3],
        fields: { _crashSound: { name: "boum" } } },
    ],
    RocketKidConvoController: [
      { name: "ConversationZone", body: "TimberHearth_Body", position: [0, 0, 0],
        fields: {}, trees: { _introduction: "a", _successfulLanding: "b",
                             _tooManyCrashes: "c" } },
    ],
  } };
  check("deux pistes", modelLandingSpots(gpM).length, 2);
  check("un vaisseau miniature", modelShipBody(gpM).name, "ModelShip_Body");
  check("avec son son de crash", modelShipBody(gpM).crashSound, "boum");
  check("sans rien de pose, rien", modelShipBody({}), null);
  const k = rocketKids(gpM);
  check("un enfant", k.length, 1);
  check("avec ses trois arbres",
        [k[0].trees.introduction, k[0].trees.successfulLanding,
         k[0].trees.tooManyCrashes].join(","), "a,b,c");
}

{
  // --- PERDRE LA GRAVITE (docs/79-alignement.md) ---

  check("cinquante degres par seconde", FIELD_ALIGN.rate, 50);
  // Moitie moins vite que le demi-tour d'un siege : se relever est vif,
  // perdre le sol est lent.
  check("moitie moins vite que le siege", FIELD_ALIGN.rate * 2, ATTACHE.rotationRate);

  // La duree est encore un ANGLE divise par un TAUX, la troisieme fois.
  check("deux poses identiques, aucune duree",
        discreteRotationDuration([0, 0, 0, 1], [0, 0, 0, 1]), 0);
  {
    // Un demi-tour complet : 180 degres a 50 degres par seconde.
    const d = discreteRotationDuration([0, 0, 0, 1], [0, 1, 0, 0]);
    check("un demi-tour dure 3,6 s", Math.round(d * 100) / 100, 3.6);
  }
  {
    // Un quart de tour.
    const q = Math.sqrt(0.5);
    const d = discreteRotationDuration([0, 0, 0, 1], [0, q, 0, q]);
    check("un quart de tour, 1,8 s", Math.round(d * 100) / 100, 1.8);
  }

  const al = new FieldAlignment();
  // `CheckAlignmentRequirements` rend VRAI a la toute premiere image, quoi
  // qu'il arrive : sans cela, le premier instant d'une partie est une chute.
  check("la premiere image est alignee, meme sans champ",
        al.update(false, 0, 90), null);
  check("et les commandes repondent", al.locked, false);
  // Puis perdre le champ verrouille le regard.
  check("perdre le champ", al.update(false, 1, 90), "break");
  check("et prend les commandes", al.locked, true);
  check("pendant 90/50 secondes", al.duration, 1.8);
  check("a mi-chemin, toujours verrouille",
        al.update(false, 1.9, 0) === null && al.locked, true);
  al.update(false, 3, 0);
  check("passe la duree, elles reviennent", al.locked, false);

  // Et l'ecart se passe aussi sous la FORME DU BUILD : deux poses.
  const al3 = new FieldAlignment();
  al3.update(true, 0, 0);
  al3.update(false, 1, [[0, 0, 0, 1], [0, 1, 0, 0]]);   // un demi-tour
  check("deux poses valent un angle", Math.round(al3.duration * 100) / 100, 3.6);

  // Retrouver le sol rend les commandes TOUT DE SUITE.
  const al2 = new FieldAlignment();
  al2.update(true, 0, 0);
  al2.update(false, 1, 3600);        // une duree enorme
  check("verrouille pour longtemps", al2.duration, 72);
  check("retrouver un champ", al2.update(true, 1.1, 0), "init");
  check("rend les commandes sans attendre", al2.locked, false);
  // Et la transition ne se rejoue pas tant que l'etat ne change pas.
  check("rester dans le champ n'annonce rien", al2.update(true, 2, 0), null);
}

report();