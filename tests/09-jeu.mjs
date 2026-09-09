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

import { Flashback, PlayerDeathHandler, FLASHBACK } from "../web/src/death.js";
import { TimeLoop } from "../web/src/timeloop.js";
import { SunStage } from "../web/src/supernova.js";
import { ShipDamage, locationOf, LOCATIONS, ALL_LOCATIONS } from "../web/src/shipdamage.js";
import { Ship } from "../web/src/ship.js";
import { QuantumMoon, segmentHitsSphere, orbitTilt, bodyOccluder,
         quantumHosts } from "../web/src/quantum.js";
import { Anglerfish, FISH, Corruption, corruptionAnimators,
         corruptionCutoff } from "../web/src/bramble.js";
import { oxygenVolumes, inOxygen } from "../web/src/resources.js";
import { heatSources, heatAt, Marshmallow, MIN_TOAST, DEFAULT_HEAT,
         remoteConsoles, RemoteView } from "../web/src/consoles.js";
import { derelictZones, inDerelict, FogField } from "../web/src/fog.js";
import { markerDistances } from "../web/src/map.js";
import { selectTree } from "../web/src/playerdata.js";
import { deathCamera, DEATH_CAM, DEATH_SOUNDS } from "../web/src/death.js";
import { SpinField, spinOf, dayLength } from "../web/src/spin.js";
import { dominantField, directionalFields, insideVolume,
         DirectionalFields } from "../web/src/gravity.js";
import { fluidVolumes, fluidAcceleration, terminalSpeed,
         FluidField, DRAG_FALLBACK } from "../web/src/fluids.js";
import { DebrisField, DEBRIS_RADIUS } from "../web/src/blackhole.js";
import { MeshLOD, Evictor, LOD_RATIO } from "../web/src/lod.js";
import { ambientIntensity } from "../web/src/sectors.js";
import { transmitterCutoff, TRANSMITTER_LOWPASS, OPEN_BAND } from "../web/src/audio.js";
import { envelope } from "../web/src/pipeline/extract/particles.js";
import { stickVector, lookCurve, sprinting, STICK_RADIUS, DEAD_ZONE,
         LOOK_DEAD_ZONE, SPRINT_AT } from "../web/src/touch.js";
import { GamepadControls, moveAxes, lookDelta, buttonFor,
         BUTTONS, TRIGGER_UP, TRIGGER_BOOST } from "../web/src/gamepad.js";

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
  // Position de l'impact : la normale est exprimee dans le repere du vaisseau.
  check("impact par en dessous", locationOf([0, -1, 0]), "bas");
  check("impact frontal", locationOf([0, 0, 1]), "avant");
  check("impact par l'arriere", locationOf([0, -0.2, -1]), "arriere");
  check("impact lateral", locationOf([1, 0, 0.5]), "droite");

  // Valeurs du build : masque et modificateurs a zero. Les degats restent
  // globaux — c'est l'etat de l'alpha, pas un manque du portage.
  const alpha = new ShipDamage({ _damageLocationMask: 0,
                                 _genericPartImpactModifier: 0,
                                 _enginePartImpactModifier: 0,
                                 _disableDamagedThrusters: false });
  const r = alpha.impact(40, [0, -1, 0]);
  check("degats a 40 u/s", round(r.damage, 1), 26.3);
  check("aucune piece touchee avec les valeurs du build", r.part, 0);
  check("integrite entamee malgre tout", round(alpha.integrity, 1), 73.7);

  // Le mecanisme, allume.
  const arme = new ShipDamage({ _damageLocationMask: ALL_LOCATIONS,
                                _genericPartImpactModifier: 0.5,
                                _enginePartImpactModifier: 1,
                                _disableDamagedThrusters: true });
  const bas = arme.impact(40, [0, -1, 0]);
  check("la piece touchee prend sa part", round(bas.part, 2), 13.16);
  check("piece encore vivante", arme.parts.bas.dead, false);

  // Une piece meurt de SES degats a elle, pas de ceux de la coque. Avec un
  // modificateur eleve, une serie de petits chocs sur le meme cote la detruit
  // bien avant que le vaisseau ne soit perdu — c'est tout l'interet des degats
  // localises.
  const use = new ShipDamage({ _damageLocationMask: ALL_LOCATIONS,
                               _genericPartImpactModifier: 5,
                               _disableDamagedThrusters: true });
  for (let i = 0; i < 6; i++) use.impact(25, [0, -1, 0]);
  check("piece morte apres une serie de chocs", use.parts.bas.dead, true);
  check("le vaisseau, lui, tient encore", use.destroyed, false);
  check("le propulseur coupe est hors service", use.thrustFactor("bas"), 0);
  check("les autres poussent encore", use.thrustFactor("avant"), 1);

  const sansOption = new ShipDamage({ _damageLocationMask: ALL_LOCATIONS,
                                      _genericPartImpactModifier: 5,
                                      _disableDamagedThrusters: false });
  for (let i = 0; i < 6; i++) sansOption.impact(25, [0, -1, 0]);
  check("sans _disableDamagedThrusters, la piece morte ne coupe rien",
        sansOption.thrustFactor("bas"), 1);

  const masque = new ShipDamage({ _damageLocationMask: LOCATIONS.arriere,
                                  _genericPartImpactModifier: 0.5,
                                  _enginePartImpactModifier: 1 });
  check("hors du masque, rien n'est reporte", masque.impact(40, [0, -1, 0]).part, 0);
  check("dans le masque, le reacteur prend le sien",
        round(masque.impact(40, [0, 0, -1]).part, 1), 26.3);

  const perdu = new ShipDamage({});
  perdu.impact(300, [0, -1, 0]);
  check("mort instantanee a 300 u/s", perdu.destroyed, true);
  check("un vaisseau detruit ne pousse plus", perdu.thrustFactor("arriere"), 0);
  perdu.reset();
  check("la boucle le rend entier", perdu.destroyed, false);
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
  check("un corps sur la ligne de vue masque",
        segmentHitsSphere([0, 0, 0], [0, 0, 1000], [0, 0, 500], 100), true);
  check("un corps a cote ne masque pas",
        segmentHitsSphere([0, 0, 0], [0, 0, 1000], [400, 0, 500], 100), false);
  check("un corps derriere la cible ne masque pas",
        segmentHitsSphere([0, 0, 0], [0, 0, 500], [0, 0, 900], 100), false);

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
  // La sphere de verification : le segment est epaissi de _sphereCheckRadius,
  // et borne de _checkDepth du cote de la lune.
  {
    const frole = [{ bodyName: "Frole", position: [220, 0, 500],
                     gravity: { upperSurfaceRadius: 100 } }];
    check("un corps qui frole la ligne de vue masque",
          bodyOccluder(frole)([0, 0, 0], [0, 0, 1000]), true);
    check("... mais pas au-dela du rayon de la sphere",
          bodyOccluder(frole, null, { radius: 0 })([0, 0, 0], [0, 0, 1000]), false);
    // La profondeur borne le segment du cote de la lune. Avec les valeurs du
    // build la sphere (150) est plus large que la profondeur (100), si bien que
    // sa calotte recouvre la troncature : le bornage ne se voit que sur un
    // obstacle plus petit que le rayon de balayage.
    const colle = [{ bodyName: "Colle", position: [0, 0, 950],
                     gravity: { upperSurfaceRadius: 20 } }];
    check("les cent dernieres unites ne comptent pas",
          bodyOccluder(colle, null, { radius: 10 })([0, 0, 0], [0, 0, 1000]), false);
    check("... elles compteraient sans la profondeur",
          bodyOccluder(colle, null, { radius: 10, depth: 0 })([0, 0, 0], [0, 0, 1000]),
          true);
  }

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

// --- rotation propre des corps -------------------------------------------
//
// Cinematique pure : ce qui tourne est le REPERE, donc le sol reste ou il est
// et c'est le ciel qui defile.
{
  const im = { name: "Planete", position: [0, 0, 0],
               orbit: { spinAxis: { x: 0, y: 2, z: 0 }, spinSpeed: 0.03 } };
  const s = spinOf(im);
  check("axe normalise", JSON.stringify(s.axis), "[0,1,0]");
  check("vitesse lue en rad/s", s.rate, 0.03);
  check("InitialMotion l'emporte", s.source, "InitialMotion");
  check("duree du jour", round(dayLength(im), 1), 209.4);

  // RotateTransform, lui, compte en DEGRES par seconde.
  const rt = { name: "Accessoire",
               spin: { axis: { x: 0, y: 0, z: 1 }, degreesPerSecond: 18 } };
  check("RotateTransform en degres", round(spinOf(rt).rate, 6),
        round(18 * Math.PI / 180, 6));
  check("sans rien, pas de rotation", spinOf({ name: "Fixe" }), null);

  // L'axe est donne dans le repere PROPRE du corps : l'orientation monde du
  // corps le remet dans le repere de travail. Un quart de tour autour de X
  // couche l'axe Y sur Z.
  const incline = { name: "Inclinee", bodyRotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
                    orbit: { spinAxis: { x: 0, y: 1, z: 0 }, spinSpeed: 0.03 } };
  check("axe ramene dans le repere de travail",
        spinOf(incline).axis.map((v) => round(v, 3)).join(),
        "0,0,1");

  const field = new SpinField([im, rt, { name: "Fixe" }]);
  check("corps tournants retenus", field.count, 2);

  // Le soleil vu du sol : un point fixe du monde defile en sens inverse.
  const soleil = [0, 0, 1000];
  check("azimut inchange a t = 0",
        field.intoFrame(im, soleil).map((v) => round(v)).join(), "0,0,1000");
  field.advance(Math.PI / 2 / 0.03);          // un quart de tour
  const q = field.intoFrame(im, soleil).map((v) => round(v));
  check("apres un quart de tour, le soleil a bascule", q.join(), "-1000,0,0");
  check("la distance ne change pas", round(Math.hypot(...q)), 1000);
  field.advance(3 * Math.PI / 2 / 0.03);      // le tour complet
  check("un jour entier ramene le ciel a sa place",
        field.intoFrame(im, soleil).map((v) => round(v)).join(), "0,0,1000");
  check("l'angle reste borne a un tour", field.angle(im) < 2 * Math.PI, true);
  check("le sol, lui, ne bouge jamais",
        field.intoFrame(im, [0, 0, 0]).map((v) => round(v)).join(), "0,0,0");
}

// --- champs de force directionnels ---------------------------------------
//
// SingleFieldDetector ne combine pas : dans son volume, le champ directionnel
// l'emporte sur le champ radial.
{
  const gameplay = { placed: { DirectionalForceField: [
    { name: "GravityTrail", position: [0, 200, 0], rotation: [0, 0, 0, 1],
      volume: { shape: "sphere", center: [0, 0, 0], radius: 50 },
      fields: { _fieldMagnitude: 8 } },
    { name: "Couloir", position: [0, 0, 400], rotation: [0, 0, 0, 1],
      volume: { shape: "box", center: [0, 0, 0], size: [20, 20, 200] },
      fields: { _fieldMagnitude: 5 } },
    { name: "Muet", position: [500, 0, 0], rotation: [0, 0, 0, 1],
      volume: { shape: "sphere", center: [0, 0, 0], radius: 10 }, fields: {} },
  ] } };
  const list = directionalFields(gameplay);
  check("champs directionnels lus", list.length, 3);
  check("un champ sans intensite lisible ne s'applique pas",
        list.filter((f) => f.usable).length, 2);
  check("intensite lue dans les champs", list[0].magnitude, 8);
  // Sans vecteur ni axe serialise, la direction est le BAS local de l'objet.
  check("direction par defaut : le bas local",
        list[0].dir.map((v) => round(v)).join(), "0,-1,0");

  check("dans le volume", insideVolume(list[0], 0, 220, 0), true);
  check("hors du volume", insideVolume(list[0], 0, 260, 0), false);
  check("boite : dans la longueur", insideVolume(list[1], 0, 0, 480), true);
  check("boite : au-dela du bout", insideVolume(list[1], 0, 0, 520), false);

  const planete = [{ name: "P", bodyName: "P", position: [0, 0, 0],
                     gravity: { surfaceAcceleration: 12, upperSurfaceRadius: 100,
                                lowerSurfaceRadius: 100, cutoffRadius: 0,
                                falloffType: 0 } }];
  const champs = new DirectionalFields(list);
  const dehors = dominantField(planete, { x: 0, y: 150, z: 0 }, champs);
  check("hors des volumes, le champ radial garde la main",
        dehors.dir.y < 0 && dehors.directional === undefined, true);
  const dedans = dominantField(planete, { x: 0, y: 200, z: 0 }, champs);
  check("dans le volume, le directionnel l'emporte", dedans.directional, "GravityTrail");
  check("... avec son intensite a lui", dedans.magnitude, 8);
  check("... et le corps reste celui du champ radial", dedans.body.name, "P");
  check("sans champ radial, rien a remplacer",
        dominantField([], { x: 0, y: 200, z: 0 }, champs), null);
}

// --- fluides --------------------------------------------------------------
{
  const solar = { fluids: [
    { name: "Ocean", position: [0, 0, 0], radius: 500,
      dragCoefficient: 2, density: 0, body: "GiantsDeep" },
    { name: "SansRayon", position: [0, 0, 0], radius: null },
  ] };
  const vols = fluidVolumes(solar, {});
  check("l'ocean est enfin emis", vols.length, 1);
  check("trainee lue dans le volume", vols[0].drag, 2);

  // Trainee lineaire : la vitesse limite est exactement g / c.
  check("vitesse limite de chute", terminalSpeed(12, vols[0]), 6);
  // La fonction ne rend QUE l'apport du fluide : a la vitesse limite, il vaut
  // exactement l'oppose de la gravite, et la somme des deux est nulle.
  const a = fluidAcceleration({ x: 0, y: -6, z: 0 }, { x: 0, y: -12, z: 0 }, vols[0]);
  check("a la vitesse limite, la trainee compense la gravite", round(a.y, 6), 12);
  check("une poussee neutre annule la gravite",
        round(fluidAcceleration({ x: 0, y: 0, z: 0 }, { x: 0, y: -12, z: 0 },
                                { drag: 0, buoyancy: 1 }).y, 6), 12);

  const field = new FluidField(vols);
  const obj = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 100, y: 0, z: 0 } };
  check("dedans", field.at(obj.pos, [0, 0, 0]).name, "Ocean");
  check("dehors", field.at({ x: 0, y: 0, z: 900 }, [0, 0, 0]), null);
  check("le repere est pris en compte", field.at(obj.pos, [0, 0, 900]), null);
  field.apply(0.5, obj, null, [0, 0, 0], "joueur");
  check("le fluide freine", obj.vel.x, 0);
  check("... et l'on sait ou l'on est", field.inside.get("joueur").name, "Ocean");
  check("sans mesure, la trainee de repli", DRAG_FALLBACK, 1);
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

  // Les seuils du build : un maillage qui appartient a un LODGroup ne suit plus
  // le seuil unique mais les deux bornes de SON niveau. Un seul niveau du groupe
  // peut etre allume a la fois.
  {
    const niveau = (level, height, upper) => {
      const m = mesh(1, 100);       // rapport 0,01
      m.__lod = { level, height, upper };
      return m;
    };
    const l = new MeshLOD();
    const fin = niveau(0, 0.05, null);      // 0,01 < 0,05 : trop loin pour le fin
    const moyen = niveau(1, 0.005, 0.05);   // 0,005 <= 0,01 < 0,05 : c'est lui
    const grossier = niveau(2, 0.001, 0.005);
    for (const m of [fin, moyen, grossier]) l.apply(m, cam);
    check("le niveau fin s'efface a distance", fin.isVisible, false);
    check("le niveau qui encadre le rapport est allume", moyen.isVisible, true);
    check("les autres niveaux du groupe sont eteints", grossier.isVisible, false);
    check("maillages regis par un LODGroup", l.grouped, 3);

    // Sous le dernier seuil, le groupe entier disparait.
    const loin = { x: 0, y: 0, z: 0 };
    const tout = [niveau(0, 0.05, null), niveau(1, 0.005, 0.05),
                  niveau(2, 0.02, 0.05)];
    for (const m of tout) m.getBoundingInfo = () => ({ boundingSphere: {
      centerWorld: { x: 100000, y: 0, z: 0 }, radiusWorld: 1 } });
    for (const m of tout) l.apply(m, loin);
    check("au-dela du dernier seuil, plus rien du groupe",
          tout.filter((m) => m.isVisible).length, 0);
  }

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

// --- les petites regles restees de cote -----------------------------------
//
// Chacune tient en quelques lignes, et chacune remplace une regle du portage
// par ce que la scene dit.
{
  // Zones d'oxygene : le vaisseau n'est plus la seule source. La classe est
  // trouvee par MOTIF, parce que son nom exact n'est pas connu du depot.
  const gp = { placed: {
    OxygenVolume: [{ name: "Arbre", position: [0, 0, 0],
                     volume: { shape: "sphere", radius: 12 }, fields: {} }],
    HeatSource: [{ name: "FeuDeCamp", position: [100, 0, 0],
                   volume: { shape: "sphere", radius: 8 }, fields: {} }],
    MapMarker: [{ name: "TimberHearth", position: [0, 0, 0],
                  fields: { _maxDisplayDistance: 12345 } }],
    DerelictCloaker: [{ name: "Derelicte", position: [0, -10000, 0],
                        volume: { shape: "sphere", radius: 400 }, fields: {} }],
    RemoteFlightConsole: [{ name: "Console", position: [0, 0, 0], fields: {} }],
    CorruptionAnimator: [{ name: "Ronce", position: [0, 0, 0],
                           fields: { _startCutoff: 0.2, _endCutoff: 0.8 } }],
  } };

  const o2 = oxygenVolumes(gp);
  check("zone d'oxygene trouvee par motif", o2.length, 1);
  check("son rayon vient du collider", o2[0].radius, 12);
  check("dedans, on recharge", !!inOxygen(o2, { x: 5, y: 0, z: 0 }, [0, 0, 0]), true);
  check("dehors, non", inOxygen(o2, { x: 50, y: 0, z: 0 }, [0, 0, 0]), null);

  // Guimauve : c'est la PROXIMITE d'une source de chaleur qui la cuit.
  const feux = heatSources(gp);
  check("source de chaleur lue", feux.length, 1);
  check("chaleur deduite du temps de cuisson", feux[0].heat, DEFAULT_HEAT);
  check("loin du feu, aucune chaleur", heatAt(feux, { x: 0, y: 0, z: 0 }, [0, 0, 0]), 0);
  const chaud = heatAt(feux, { x: 100, y: 0, z: 0 }, [0, 0, 0]);
  check("au feu, la chaleur pleine", chaud, DEFAULT_HEAT);
  const gui = new Marshmallow();
  gui.held = true;
  for (let i = 0; i < 30; i++) gui.update(0.1, chaud);
  check("grillee en trois secondes", round(gui.toast, 2), 0.6);
  check("... et mangeable a partir de la", gui.edible, true);
  check("MIN_TOAST du build", MIN_TOAST, 0.6);

  // Marqueurs de carte : la distance d'affichage de CE marqueur.
  const md = markerDistances(gp);
  check("distance d'affichage lue sur le marqueur",
        md.get("TimberHearth"), 12345);

  // Zone derelicte : y entrer suspend la mise a jour du brouillard.
  const zones = derelictZones(gp);
  check("zone derelicte lue", zones.length, 1);
  const brouillard = new FogField([{ name: "V", position: [0, 0, 0],
    innerRadius: 100, outerRadius: 200, innerDensity: 0.01, outerDensity: 0 }]);
  brouillard.update({ x: 0, y: 0, z: 0 }, [0, 0, 0], 0);
  const dense = brouillard.density;
  check("dans le volume, le brouillard monte", dense > 0, true);
  brouillard.update({ x: 0, y: 0, z: 100000 }, [0, 0, 0], 0, true);
  check("suspendue, la densite ne bouge plus", brouillard.density, dense);
  brouillard.update({ x: 0, y: 0, z: 100000 }, [0, 0, 0], 0, false);
  check("reprise, elle retombe", brouillard.density, 0);
  check("dedans", !!inDerelict(zones, { x: 0, y: -10000, z: 0 }, [0, 0, 0]), true);

  // Consoles a camera deportee : la vue de la sonde leur sert.
  const consoles = remoteConsoles(gp);
  check("console deportee lue", consoles.length, 1);
  const vue = new RemoteView(consoles).update({ x: 0, y: 0, z: 0 }, [0, 0, 0],
    { ship: [0, 0, 500], up: { x: 0, y: 1, z: 0 } });
  check("elle ouvre une vue sur le vaisseau", !!vue, true);
  check("de haut", vue.pos[1] > 0, true);
  check("et tournee vers lui", vue.dir.map((v) => round(v)).join(), "0,-1,0");
  check("hors de portee, aucune vue",
        new RemoteView(consoles).update({ x: 0, y: 0, z: 900 }, [0, 0, 0], {}), null);

  // Corruption : le seuil de decoupe suit la fraction de boucle.
  const anim = corruptionAnimators(gp);
  check("animateur de corruption lu", anim.length, 1);
  check("bornes lues dans les champs", `${anim[0].from},${anim[0].to}`, "0.2,0.8");
  check("au debut de la boucle", corruptionCutoff(anim[0], 0), 0.2);
  check("a la fin", corruptionCutoff(anim[0], 1), 0.8);
  check("a mi-boucle", round(corruptionCutoff(anim[0], 0.5), 3), 0.5);

  // Le seuil est pose sur les materiaux une fois la geometrie resolue.
  const mat = { alphaCutOff: 0 };
  const corr = new Corruption(anim, () => [{ material: mat }]);
  check("resolution", corr.resolve(), true);
  corr.update(1);
  check("le materiau porte le seuil", mat.alphaCutOff, 0.8);

  // Arbre de dialogue : la REFERENCE de la conversation avant le nom du fichier.
  const trees = { 11: { name: "Coach_WithCodes" }, 22: { name: "autre_chose" } };
  const convo = { character: "Coach", tree: 22,
                  trees: { _dialogueTreeWithCodes: 22 } };
  check("la reference directe l'emporte sur le nom",
        selectTree({ hasCompletedTraining: true, knowsLaunchCodes: true, loopCount: 0 },
                   convo, trees), 22);
  check("sans reference, le nom sert encore",
        selectTree({ hasCompletedTraining: true, knowsLaunchCodes: true, loopCount: 0 },
                   { character: "Coach", tree: 22 }, trees), "11");

  // Mort : un mouvement de camera pendant l'attente, puis plus rien.
  check("au premier instant, la camera n'a pas bouge",
        round(deathCamera({ phase: "attente", t: 0 }).drop, 3), 0);
  check("apres l'attente, elle a fini sa course",
        round(deathCamera({ phase: "images", t: 2 }).back, 3), DEATH_CAM.back);
  check("elle ne bouge plus une fois la sequence finie",
        deathCamera({ phase: "fini", t: 9 }).roll, 0);
  check("un motif de son par cause", Object.keys(DEATH_SOUNDS).length, 6);
  check("le motif de l'asphyxie reconnait son clip",
        DEATH_SOUNDS.asphyxie.test("PlayerSuffocate"), true);
}

// --- la manette ----------------------------------------------------------
//
// Elle ne cree aucune commande : elle produit les MEMES axes et les MEMES
// codes que le doigt et le clavier. C'est cela qu'on verifie ici — le reste,
// la lecture d'une vraie manette, demande un navigateur.
{
  check("manche gauche a fond : axe sature", round(moveAxes([0, -1]).forward, 3), 1);
  check("dans la zone morte : rien", moveAxes([0.1, 0]).right, 0);
  check("a fond devant : le cran de course prend", moveAxes([0, -1]).sprint, true);
  check("a fond de cote : pas de course", moveAxes([1, 0]).sprint, false);

  // Manche droit : une VITESSE, en pixels de souris par seconde, la meme
  // courbe et la meme echelle qu'au pouce.
  check("manche de regard lache : aucune rotation",
        lookDelta([0, 0, 0, 0], 0.1).dx, 0);
  check("manche de regard a fond : 900 px/s",
        Math.round(lookDelta([0, 0, 1, 0], 0.05).dx / 0.05), 900);
  check("le pas est borne comme celui du moteur",
        Math.round(lookDelta([0, 0, 1, 0], 10).dx),
        Math.round(lookDelta([0, 0, 1, 0], 0.05).dx));

  check("le bouton du jeu porte la touche du portage", BUTTONS[0].xbox, "A");
  check("... et se retrouve depuis la touche", buttonFor("KeyE"), "A");
  check("les gachettes portent la poussee", buttonFor("Space"), "RightTrigger");

  // Une manette fabriquee : ce qu'un bouton enfonce produit en aval.
  const vus = [];
  let tourne = 0;
  const pad = new GamepadControls({ onKey: (c) => vus.push(c),
                                    onLook: (dx) => { tourne += dx; } });
  const manette = { connected: true, mapping: "standard",
                    axes: [0, -1, 0, 0],
                    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  pad.pad = () => manette;

  manette.buttons[0].pressed = true;            // A
  manette.buttons[TRIGGER_UP].value = 1;        // gachette droite
  manette.buttons[TRIGGER_BOOST].value = 1;     // gachette gauche
  pad.update(0.1);
  check("manette reconnue", pad.connected, true);
  check("le manche pousse fait avancer", round(pad.axes.forward, 3), 1);
  check("la gachette droite monte", pad.axes.up, true);
  check("la gachette gauche accelere", pad.axes.boost, true);
  check("A donne la touche d'interaction", vus.join(), "KeyE");

  // Front montant : un bouton TENU ne repete pas. Sans cela, un menu defilerait
  // a la vitesse des images.
  pad.update(0.1);
  check("un bouton tenu ne se repete pas", vus.length, 1);
  manette.buttons[0].pressed = false;
  pad.update(0.1);
  manette.buttons[0].pressed = true;
  pad.update(0.1);
  check("... mais relache puis represse, oui", vus.length, 2);

  // Debranchee, elle rend la main : les axes retombent, et rien ne reste tenu.
  pad.pad = () => null;
  pad.update(0.1);
  check("manette debranchee", pad.connected, false);
  check("axes remis a zero", pad.axes.forward, 0);
  check("plus rien de tenu", pad.axes.up, false);
}

report();
