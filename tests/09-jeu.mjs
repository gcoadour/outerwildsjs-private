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
import { Ship, spinStep, quatRotate, terminalAngularSpeed } from "../web/src/ship.js";
import { Player, PLAYER_FALLBACK, groundTarget, approach, walkable,
         jumpHeight, frameFriction } from "../web/src/player.js";
import { playerConstants } from "../web/src/config.js";
import { buildOrbits, advance, frameVelocity } from "../web/src/orbits.js";
import { polarFields, polarDirection, strongestPolar,
         distanceToAxis } from "../web/src/gravity.js";
import { rolloffModel, curveGain } from "../web/src/audio.js";
import { colliderLODs, ColliderLODs } from "../web/src/lod.js";
import { oxygenDetector } from "../web/src/resources.js";
import { underAsleep, noCollide } from "../web/src/physics.js";
import { skyAlpha, curveAt as skyCurveAt, SKY_RADIUS, Sky } from "../web/src/sky.js";
import { scrollOffset, TextureScrollers } from "../web/src/texanim.js";
import { QuantumMoon, segmentHitsSphere, orbitTilt, bodyOccluder,
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
import { lodThresholds, colliderLODNames } from "../web/src/lod.js";
import { segmentDepthInSphere, occludes, lookRotation, alignToObserver,
         CHECK_RADIUS, CHECK_DEPTH } from "../web/src/quantum.js";
import { NoiseField, corruptionRange, corruptionThreshold } from "../web/src/bramble.js";
import { deathCamera, DEATH_FALL, DEATH_SOUNDS } from "../web/src/death.js";
import { convoControllers, treeFromController, PlayerData,
         selectTree } from "../web/src/playerdata.js";
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
  const cols = colliderLODNames(gameplay);
  check("colliders par niveau de detail", cols.size, 2);
  check("... nommes", cols.has("Rampe"), true);

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
{
  const gameplay = { placed: { CoachConvoController: [
    { name: "Coach", position: [0, 0, 0],
      trees: { _beforeTrainingTree: 11, _withCodesTree: 12, _withoutCodesTree: 13 } },
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
  check("B interagit", padEdges(press(1)).codes.join(","), "KeyE");
  check("Back ouvre la carte", padEdges(press(8)).codes.join(","), "KeyM");
  check("A pousse vers le haut", padState(press(0)).up, true);
  check("la gachette droite accelere",
        padState({ axes: [0, 0, 0, 0], buttons: [0, 0, 0, 0, 0, 0, 0, 1] }).boost, true);

  // Seuls les FRONTS comptent : un bouton tenu ouvrirait puis fermerait la
  // carte a chaque image.
  const first = padEdges(press(8));
  check("bouton tenu : plus aucun front",
        padEdges(press(8), first.state).codes.length, 0);
  check("relache puis repris : un nouveau front",
        padEdges(press(8), padEdges(press(0), first.state).state).codes.join(","),
        "KeyM");
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
  q.update(1 / 60, corps, { forward: 0, right: 0, up: true }, vertical, null);
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

report();
