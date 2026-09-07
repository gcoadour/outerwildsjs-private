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

report();
