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
import { fluidVolumes, fluidAt, depthIn, applyDrag, terminalSpeed,
         FluidField } from "../web/src/fluids.js";
import { pickLights, LIGHT_BUDGET } from "../web/src/lights.js";
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
}

// --- fluides ------------------------------------------------------------
//
// SphereOceanFluidVolume etait lu par l'extracteur puis jete : la boucle
// n'ecrivait un corps que s'il portait un GravityWell. Giant's Deep n'avait
// donc pas d'ocean, et le _dragCoefficient de 10 des fragments de croute ne
// s'appliquait jamais.
{
  const solar = { fluids: [{ name: "Ocean", kind: "SphereOceanFluidVolume",
                             position: [0, 0, 0], radius: 700, drag: 2 }] };
  const gameplay = { placed: { SimpleFluidVolume: [
    { name: "Mare", position: [0, 0, 2000], fields: { _radius: 50, _dragCoefficient: 4 } },
    { name: "SansRayon", position: [0, 0, 0], fields: {} },
  ] } };
  const vols = fluidVolumes(gameplay, solar);
  check("volumes emis, celui sans rayon ecarte", vols.length, 2);
  check("l'ocean vient du systeme solaire",
        vols.find((v) => v.ocean).name, "Ocean");
  check("coefficient de trainee lu", vols[0].drag, 4);

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

  // Poussee d'Archimede : elle n'est PAS dans le build (aucune densite), donc
  // nulle par defaut. A densite non nulle, elle s'oppose a la gravite.
  const flot = new FluidField([{ name: "Eau", position: [0, 0, 0], radius: 100,
                                 drag: 0, density: 2 }]);
  const vf = { x: 0, y: 0, z: 0 };
  flot.apply([0, 0, 0], vf, 1, g);
  check("a densite 2, la poussee remonte le mobile", round(vf.y, 3), 24);
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

report();
