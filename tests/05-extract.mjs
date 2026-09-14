// Verifie les extracteurs contre les chiffres du pipeline Python (README.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UnityEnv } from "../web/src/pipeline/unity/env.js";
import { TypeUniverse } from "../web/src/pipeline/dotnet/typetree.js";
import { ExtractContext } from "../web/src/pipeline/extract/context.js";
import { extractScene } from "../web/src/pipeline/extract/scene.js";
import { extractCameras } from "../web/src/pipeline/extract/camera.js";
import { extractComponents } from "../web/src/pipeline/extract/components.js";
import { extractSolarSystem } from "../web/src/pipeline/extract/solar.js";
import { extractGameplay } from "../web/src/pipeline/extract/gameplay.js";
import { sandColumns, sandFunnels, funnelActive, markCrushing } from "../web/src/sand.js";
import { destructionVolumes, repairVolumes, destroyedBy, hazardVolumes,
         zeroGFields, probePrompts,
         radiationEmitters } from "../web/src/volumes.js";
import { referenceFrames, frameAt, autopilotDistances } from "../web/src/frames.js";
import { majorSectors, activeMajorSector } from "../web/src/sectors.js";
import { directionalFields } from "../web/src/gravity.js";
import { sunlessZones, entrywayTriggers } from "../web/src/entryways.js";
import { ambienceZones } from "../web/src/ambience.js";
import { billboards, talkingFaces, thrusterNozzles, particleBursts,
         meteorLaunchers, teleporters, warps } from "../web/src/decor.js";
import { eventAudio, FOOTSTEP } from "../web/src/reactaudio.js";
import { gearPickups, suitVolumes, interactZones, attachPoints, lockOnTargets,
         ZeroGTraining } from "../web/src/gear.js";
import { spawnPoints, startPose, walkToShip } from "../web/src/start.js";
import { planarQuantumObjects, quantumStatues } from "../web/src/quantumobj.js";
import { heatSources } from "../web/src/consoles.js";
import { shipProximity } from "../web/src/helmet.js";
import { modelLandingSpots, modelShipBody,
         rocketKids } from "../web/src/modelship.js";
import { fluidVolumes, mediumVelocity } from "../web/src/fluids.js";
import { extractAudio, sniffContainer } from "../web/src/pipeline/extract/audio.js";
import { extractDialogue } from "../web/src/pipeline/extract/dialogue.js";
import { extractLighting } from "../web/src/pipeline/extract/lighting.js";
import { extractSky } from "../web/src/pipeline/extract/sky.js";
import { extractParticles } from "../web/src/pipeline/extract/particles.js";
import { extractTextureAnimators } from "../web/src/pipeline/extract/texanim.js";
import { extractPrefabs, mergePrefabs } from "../web/src/pipeline/extract/prefabs.js";
import { extractInput } from "../web/src/pipeline/extract/input.js";
import { clipLoops, HELD_ROOTS } from "../web/src/pipeline/extract/gltf.js";
import { STICK_LIGHTS, THERM_HEAT_SPAN } from "../web/src/held.js";
import { Commandes, COMMANDES } from "../web/src/input.js";
import { BUILD, DATA_FILES, haveBuild, load, loadEnv, check, report } from "./run.mjs";

if (!haveBuild()) { console.log(`build absent (${BUILD}) — test ignore`); process.exit(0); }

const ASSEMBLIES = ["Assembly-CSharp", "Assembly-CSharp-firstpass",
                    "Assembly-UnityScript", "Assembly-UnityScript-firstpass",
                    "DecalSystem.Runtime", "UnityEngine", "mscorlib"];
const u = new TypeUniverse();
for (const a of ASSEMBLIES) u.add(a, new Uint8Array(readFileSync(join(BUILD, "Managed", `${a}.dll`))));
const env = await loadEnv();

// Structures des classes moteur : le Worker les recupere par fetch, les tests
// par le disque. Sans elles, ni les AudioSource ni les Light ne se lisent.
const engineTypes = JSON.parse(readFileSync(
  "web/src/pipeline/unity/unity41-types.json", "utf8"));

console.time("indexation");
const ctx = new ExtractContext(env, u, "level0", engineTypes);
console.timeEnd("indexation");

console.time("scene");
const scene = extractScene(ctx);
console.timeEnd("scene");
check("noeuds de scene", scene.node_count, 7688);
check("composants recenses", scene.component_count, 16271);

console.time("composants");
const comps = extractComponents(ctx);
console.timeEnd("composants");
check("MonoBehaviour avec valeurs", comps.count, 1390);

console.time("systeme solaire");
const solar = extractSolarSystem(ctx);
console.timeEnd("systeme solaire");
check("corps du systeme solaire", solar.bodies.length, 17);
const withGravity = solar.bodies.filter((b) => b.gravity && b.gravity.surfaceAcceleration);
console.log("     corps avec gravite:", withGravity.length);
for (const b of solar.bodies.slice(0, 6)) {
  const g = b.gravity || {};
  console.log(`       ${(b.name || "?").padEnd(24)} d=${Math.hypot(...b.position).toFixed(0).padStart(7)} g=${g.surfaceAcceleration ?? "-"} r=${g.upperSurfaceRadius ?? "-"}`);
}

console.time("gameplay");
const gp = extractGameplay(ctx);
console.timeEnd("gameplay");
const n = (k) => (gp.placed[k] || []).length;
check("objets interactifs", n("InteractReceiver"), 39);
check("objets lisibles", n("ReadableObject"), 34);
check("points d'apparition", n("SpawnPoint"), 16);

// Ce qui bouge quand on ne le regarde pas (docs/71-quantique.md). Ni la statue
// ni le parent des objets planaires n'etaient extraits : ils etaient dans la
// scene depuis toujours, et le recensement ne les comptait meme pas.
{
  const planaires = planarQuantumObjects(gp);
  check("cinq objets planaires quantiques", planaires.length, 5);
  check("tous sur la lune quantique",
        planaires.every((o) => o.body === "QuantumMoon_Body"), true);
  check("trois pins", planaires.filter((o) => o.name === "Pine_Thick").length, 3);
  check("une cabane", planaires.filter((o) => o.name === "QuantumCabin").length, 1);
  check("un panneau", planaires.filter((o) => o.name === "Sign01").length, 1);
  // Ils sont POSES sur la lune : leur hauteur locale est celle de sa surface.
  check("et tous a la surface, entre 18 et 22 unites du centre",
        planaires.every((o) => o.local[1] > 18 && o.local[1] < 22), true);
  const statues = quantumStatues(gp);
  check("une statue quantique", statues.length, 1);
  check("avec un morceau", statues[0].parts.length, 1);
  check("qui est la tete ancienne", statues[0].parts[0], "AncientHeadStatue");
  check("cent unites de verrou", statues[0].maxLockRange, 100);
  // AUCUNE des deux n'est sensible a la lumiere : la loi de la lampe est
  // portee, et son entree est vide. Le build le dit, pas le portage.
  check("et elle n'est pas sensible a la lumiere", statues[0].lightSensitive, false);
}

// La chaleur des feux de camp (docs/75-chaleur.md). `heatSources` cherchait des
// classes dont le NOM contient « heat » : il n'y en a AUCUNE dans ce build, la
// liste etait vide, et la guimauve ne chauffait jamais.
{
  const emet = radiationEmitters(gp);
  check("neuf emetteurs de rayonnement", emet.length, 9);
  check("dont huit feux de camp", emet.filter((e) => e.type === 1).length, 8);
  check("et l'etoile", emet.filter((e) => e.type === 0).length, 1);
  check("le motif ne trouve aucune classe thermique",
        heatSources(gp).length, 0);
  const feux = heatSources(gp, emet);
  check("les huit feux sont la chaleur du jeu", feux.length, 8);
  // Tous portent la MEME courbe : cent jusqu'a dix unites, zero a quarante-cinq.
  check("tous a magnitude cent", feux.every((f) => f.heat === 100), true);
  check("et tous a la meme courbe",
        new Set(emet.filter((e) => e.type === 1)
          .map((e) => JSON.stringify(e.curve))).size, 1);
  // La sonde ancienne : une, et elle n'etait pas extraite.
  const anc = (gp.placed.AncientProbeController || []);
  check("une sonde ancienne", anc.length, 1);
  check("posee sur son propre corps", anc[0].body, "AncientProbe_Body");
  check("avec son orientation", Array.isArray(anc[0].rotation), true);
  // Les quatre invites de sonde, et leur regard.
  const inv = probePrompts(gp);
  check("cinq invites en tout", inv.length, 5);
  check("quatre pour la sonde", inv.filter((i) => i.kind === "probe").length, 4);
  check("toutes a quarante-cinq degres",
        inv.filter((i) => i.kind === "probe").every((i) => i.minAngle === 45), true);
  check("toutes sur la premiere jumelle",
        inv.filter((i) => i.kind === "probe").every((i) => i.body === "Twin01_Body"),
        true);
  // La zone de proximite du vaisseau : treize unites, et les voyants d'avarie
  // ne parlent que dedans (docs/76-proximite.md).
  const zp = shipProximity(gp);
  check("une zone de proximite du vaisseau", zp.length, 1);
  check("de treize unites", zp[0].volume.radius, 13);
  check("posee sur le vaisseau", zp[0].body, "Ship_Body");
  // Le vaisseau miniature et l'enfant qui compte (docs/78-modele.md).
  check("trois pistes pour le modele reduit", modelLandingSpots(gp).length, 3);
  check("toutes deux a Timber Hearth",
        modelLandingSpots(gp).every((p) => p.body === "TimberHearth_Body"), true);
  const mod = modelShipBody(gp);
  check("un vaisseau miniature", mod !== null, true);
  check("avec son son de crash", mod.crashSound, "ModelShipCrash_Explosion");
  const kid = rocketKids(gp);
  check("un enfant aux fusees", kid.length, 1);
  // Les TROIS arbres sont resolus : c'est ce qui rend la selection possible.
  check("et ses trois arbres, tous resolus",
        Object.values(kid[0].trees).every((t) => t !== null), true);
  check("et tous differents", new Set(Object.values(kid[0].trees)).size, 3);
}

// Le point d'apparition ne dit pas seulement OU l'on nait, mais dans quelle
// direction on regarde : son axe Z. Seule la position etait extraite, et le
// portage tournait donc la tete au hasard (docs/38-depart.md).
{
  const spawns = gp.placed.SpawnPoint || [];
  const tournes = spawns.filter((p) => Array.isArray(p.rotation) && p.rotation.length === 4);
  check("chaque point d'apparition porte sa rotation", tournes.length, spawns.length);
  check("et ce sont des quaternions unitaires",
        tournes.every((p) => Math.abs(Math.hypot(...p.rotation) - 1) < 1e-3), true);
  const joueur = spawnPoints(gp, { ship: false });
  const vaisseau = spawnPoints(gp, { ship: true });
  check("ils se partagent entre joueur et vaisseau",
        joueur.length + vaisseau.length, spawns.length);
  const hb = solar.bodies.find((b) => /home|planet|timber/i.test(b.name));
  const home0 = hb ? (hb.bodyPosition || hb.position) : [0, 0, 0];
  const pose = startPose(gp, { position0: home0 });
  const marche = walkToShip(gp, { position0: home0 });
  console.log(`     depart: ${joueur.length} points de joueur, ${vaisseau.length} de vaisseau` +
    (pose ? ` | ${pose.name} a ${pose.radius.toFixed(0)} u du centre` : "") +
    (marche != null ? ` | vaisseau a ${marche.toFixed(0)} u` : ""));
  // 471 u sur le build : on demarre au village et on marche jusqu'au vaisseau.
  // Un depart qui se retrouverait a portee du vaisseau serait le raccourci
  // d'avant, revenu par la porte de derriere.
  check("on ne demarre pas au pied du vaisseau", marche > 100, true);
}
const withText = (gp.placed.ReadableObject || []).filter((x) => x.text).length;
console.log("     lisibles avec texte:", withText, "| systemes uniques:", Object.keys(gp.singletons).length);

// --- ce que le build portait et que le portage ne lisait pas ---
//
// Voir docs/34-actions.md. Ces extracteurs sont neufs : on releve ici ce qu'ils
// sortent, et on garde en invariant ce qui ne peut pas etre autrement.

console.time("audio");
const audioFiles = [];
// `maxClips` doit rester HAUT. Une source n'est retenue que si le nom de son
// clip a ete enregistre, et ce nom ne l'est qu'au moment de l'export : avec
// maxClips a 0, la carte des sources sortait VIDE, et l'invariant « aucune
// portee de repli » passait sur une liste vide sans rien verifier. Les octets,
// eux, sont jetes ici — ce qu'on mesure, c'est la carte.
const audio = extractAudio(ctx, (name, bytes) => audioFiles.push({ name, bytes }),
                           { maxClips: 400 });
console.timeEnd("audio");
// A2 : MinDistance / MaxDistance existent bien en 4.1 sans le prefixe m_.
// Une portee de repli signale une source dont le champ n'a pas ete lu.
check("des sources audio sont placees", audio.sources.length > 0, true);
check("aucune portee audio de repli", audio.stats["portee de repli"] ?? 0, 0);
const ranges = new Set((audio.sources || []).map((s) => s.range));
// Les portees du build ne ressemblent pas aux replis par piste (60/150/300) :
// elles vont de 10 a 4 000. Une distribution qui s'y reduirait signalerait un
// retour en arriere.
check("les portees ne sont pas les trois valeurs inventees", ranges.size > 3, true);
const rolloffs = audio.sources.reduce((a, s) => (a[s.rolloff] = (a[s.rolloff] || 0) + 1, a), {});
console.log("     sources:", audio.sources.length,
            "| portees distinctes:", ranges.size,
            `[${[...ranges].sort((a, b) => a - b).join(", ")}]`,
            "| rolloff:", JSON.stringify(rolloffs));

console.time("lumieres");
const lighting = extractLighting(ctx);
console.timeEnd("lumieres");
// A3/A4 : le moteur n'avait que deux lumieres inventees, et fog.js portait des
// RenderSettings recopies a la main.
check("des lumieres sont posees dans la scene", lighting.lights.length > 0, true);
check("les RenderSettings de la scene sont lus", !!lighting.settings, true);
// Ce qui fait VIVRE ces lumieres : trois comportements que le portage ne lisait
// pas (docs/42-lumieres.md). Une lumiere sans eux garde l'intensite serialisee.
check("les lumieres qui s'allument la nuit",
      lighting.stats.comportements.NightLight, 15);
check("celles qui battent", lighting.stats.comportements.PulsingLight, 15);
check("celles qui vacillent", lighting.stats.comportements.LightFlicker, 9);
// L'intensite serialisee d'une `NightLight` est celle de la NUIT : il faut
// donc qu'elle soit non nulle, sinon il n'y a rien a faire fondre.
{
  const nuit = lighting.lights.filter(
    (l) => (l.behaviours || []).some((b) => b.kind === "NightLight"));
  check("chacune porte une intensite de nuit",
        nuit.filter((l) => l.intensity > 0).length, 15);
  const batt = lighting.lights.filter(
    (l) => (l.behaviours || []).some((b) => b.kind === "PulsingLight"));
  check("chaque battement porte un rythme",
        batt.filter((l) => (l.behaviours.find((b) => b.kind === "PulsingLight")
                            .fields._pulseRate ?? 0) !== 0).length, 15);
}
console.log("     comportements:", JSON.stringify(lighting.stats.comportements));
console.log("     lumieres:", JSON.stringify(lighting.stats.types),
            "| brouillard:", lighting.settings && lighting.settings.fogMode,
            JSON.stringify(lighting.settings && lighting.settings.fogColor));

// A6/A7/A8/A11 : les familles ramassees par motif. Un compte nul n'est pas une
// erreur — c'est la reponse a « l'alpha en pose-t-elle ? », qui n'avait jamais
// ete posee.
for (const [k, v] of Object.entries(gp.stats.decouvertes || {})) {
  console.log(`     decouvert: ${k} x${v}`);
}
console.log("     champs directionnels:", n("DirectionalForceField"),
            "| fluides (solaire):", (solar.fluids || []).length,
            "| ChildColliderLOD:", n("ChildColliderLOD"));
const volumes = (gp.placed.DirectionalForceField || []).filter((e) => e.volume).length;
console.log("     champs avec volume mesure:", volumes,
            "/", n("DirectionalForceField"));

// --- le sable des jumelles ---
//
// Trois composants, quatre nombres chacun, aucun lecteur jusqu'ici. Ce sont ces
// valeurs-la, et non celles du constructeur (150 -> 33), qui menent le lieu :
// l'invariant garde donc les deux instances NOMMEES, pas seulement leur compte.
{
  const cols = sandColumns(gp);
  const par = Object.fromEntries(cols.map((c) => [c.name, c]));
  check("deux colonnes de sable posees", cols.length, 2);
  check("la jumelle qui se remplit va de 60 a 290",
        par.RisingSand && `${par.RisingSand.initScale}->${par.RisingSand.finalScale}`, "60->290");
  check("celle qui se vide va de 300 a 66",
        par.DrainingSand && `${par.DrainingSand.initScale}->${par.DrainingSand.finalScale}`,
        "300->66");
  check("les deux suivent la meme fenetre de boucle",
        cols.every((c) => c.startMinutes === 2 && c.endMinutes === 17), true);
  // Aucune colonne ne doit garder les valeurs du constructeur : si l'extraction
  // cesse de lire les champs, c'est ce repli-la qui reapparaitrait.
  check("aucune ne retombe sur le repli du constructeur",
        cols.some((c) => c.initScale === 150 && c.finalScale === 33), false);

  const funnels = sandFunnels(gp);
  check("un entonnoir pose", funnels.length, 1);
  check("il pousse a la 2e minute et se retire a la 17e",
        funnels[0] && `${funnels[0].growAfterMinutes}/${funnels[0].shrinkAfterMinutes}`, "2/17");
  check("l'entonnoir est ouvert au milieu de la boucle",
        funnelActive(10 * 60, funnels[0]), true);
}

// --- ou l'on meurt, et comment on repare ---
{
  const dv = destructionVolumes(gp);
  check("six volumes de destruction poses", dv.length, 6);
  check("quatre machoires ne mordent que le joueur et le vaisseau",
        dv.filter((v) => v.onlyPlayerAndShip).length, 4);
  check("les deux autres n'epargnent rien",
        dv.filter((v) => !v.onlyPlayerAndShip).length, 2);
  // Les causes sont celles du build, pas celles du portage : 0 (Default) pour
  // les machoires, 3 (Energy) pour les deux volumes ouverts.
  check("les causes de mort posees sont 0 et 3",
        [...new Set(dv.map((v) => v.deathType))].sort().join(","), "0,3");
  check("chaque volume de destruction a une forme mesuree",
        dv.every((v) => v.volume && (v.volume.radius > 0 || v.volume.size)), true);
  // Un volume sans forme ne tuerait personne : c'est exactement le defaut que
  // l'invariant precedent garde, et celui-ci le verifie de l'autre cote.
  check("un point tres loin de tout ne meurt d'aucun volume",
        destroyedBy(dv, [1e9, 1e9, 1e9], "player"), null);

  const rv = repairVolumes(gp);
  check("dix-huit volumes de reparation", rv.length, 18);
  check("tous reparent en trois secondes",
        rv.every((v) => v.seconds === 3), true);
  check("quinze sont a portee 3, trois a portee 5",
        `${rv.filter((v) => v.distance === 3).length}/${rv.filter((v) => v.distance === 5).length}`,
        "15/3");
  // `_secondsToRepair` n'est serialise sur AUCUNE instance : les trois secondes
  // viennent du constructeur. L'invariant garde donc le repli lui-meme — s'il
  // changeait, dix-huit volumes changeraient de rythme en silence.
  check("aucune instance ne porte sa propre duree",
        rv.every((v) => v.seconds === 3), true);
}

// --- ce que l'audit a mesure, garde en invariant ---
//
// docs/36-audit.md. Chaque ligne ci-dessous chiffre une affirmation du portage
// que la mesure a dementie : elles ne peuvent plus redevenir fausses en
// silence.

// §1.2 : « la poussee d'Archimede n'est pas dans le build ». TOUS les volumes
// portent une densite, de 0,2 a 500.
const milieux = [];
for (const [cls, list] of Object.entries(gp.placed)) {
  if (!/fluid|ocean/i.test(cls) || /detector/i.test(cls)) continue;
  for (const e of list) milieux.push({ cls, e });
}
check("le build pose des volumes de fluide", milieux.length > 0, true);
check("tous portent une densite",
      milieux.filter(({ e }) => typeof (e.fields || {})._density === "number").length,
      milieux.length);

// §1.2 : les tornades de Giant's Deep portent un COURANT, et c'est le contenu
// jouable de la planete. Le portage les lisait comme de simples volumes.
const courants = milieux.filter(({ e }) => (e.fields || {})._flowSpeed);
console.log("     fluides:", milieux.length, "| avec courant:", courants.length,
            "| densites:", JSON.stringify([...new Set(milieux
              .map(({ e }) => (e.fields || {})._density))].sort((a, b) => a - b)));
check("des volumes portent un courant", courants.length > 0, true);
// Les huit colonnes de tornade sont des capsules ; leurs six BASES sont des
// spheres de 65 a 80. L'invariant precedent affirmait « toutes des capsules »
// et echouait sur le build : la mesure a tranche contre lui.
const formes = {};
for (const { e } of courants) {
  const s = (e.volume && e.volume.shape) || "aucune";
  formes[s] = (formes[s] || 0) + 1;
}
console.log("     formes des volumes a courant:", JSON.stringify(formes));
check("les colonnes de tornade sont des capsules", formes.capsule, 11);
check("... et leurs bases des spheres", formes.sphere, 6);

// Le vrai invariant : AUCUN volume portant un `_flowSpeed` ne doit rester
// immobile. Trois lois sur quatre calculent leur direction depuis le point et
// ne serialisent donc pas de `_localLinearFlow` — c'est ce qui laissait les six
// bases, le rayon tracteur et l'ocean sans mouvement (docs/39-fluides.md).
const vols = fluidVolumes(gp, solar);
const muets = vols.filter((v) => v.flowSpeed > 0 &&
                                 mediumVelocity(v, [v.position[0] + (v.radius || 1) / 2,
                                                    v.position[1],
                                                    v.position[2]]) === null);
check("aucun volume a flux ne reste immobile", muets.map((v) => v.name).join(",") || null, null);
const ocean = vols.find((v) => v.law === "ocean");
check("l'ocean porte sa courbe de repulsion", !!(ocean && ocean.repelCurve), true);
check("... et sa vitesse de repulsion maximale", ocean && ocean.maxRepelSpeed, 250);
check("... son rayon interne", ocean && ocean.innerRadius, 440);
check("... et son courant de surface", ocean && ocean.currentSpeed, 10);
console.log("     lois de fluide:", JSON.stringify(
  vols.reduce((a, v) => ((a[v.law] = (a[v.law] || 0) + 1), a), {})));

// §2.3 : la trainee est portee par le DETECTEUR, pas par le volume.
const detecteurs = Object.entries(gp.placed)
  .filter(([cls]) => /fluiddetector/i.test(cls))
  .flatMap(([cls, l]) => l.map((e) => ({ cls, e })));
check("les detecteurs de fluide sont extraits", detecteurs.length > 0, true);
check("... et portent leur facteur de trainee",
      detecteurs.some(({ e }) => typeof (e.fields || {})._dragFactor === "number"), true);

// §2.9 : `PolarForceField` etait extrait et jamais lu.
const polaires = Object.entries(gp.placed)
  .filter(([cls]) => /polar.*forcefield/i.test(cls))
  .flatMap(([, l]) => l);
console.log("     champs polaires:", polaires.length,
            polaires.map((e) => (e.fields || {})._acceleration).join(", "));

// §1.3 : 83 sources sur 97 sont en attenuation `custom`, 14 en `logarithmic`,
// AUCUNE en lineaire — le seul mode dans lequel le portage les rendait.
check("aucune source n'est en attenuation lineaire", rolloffs.linear ?? 0, 0);
check("l'attenuation `custom` est majoritaire",
      (rolloffs.custom ?? 0) > (rolloffs.logarithmic ?? 0), true);
const courbes = audio.sources.filter((x) => x.rolloffCurve).length;
console.log("     sources avec courbe echantillonnee:", courbes,
            "/", (rolloffs.custom ?? 0));

// Un clip doit etre NOMME comme il est fait.
//
// L'extension venait de `m_Format`, qui ne dit rien du conteneur : mesure sur
// le build, 20 des 36 clips d'alors partaient en `.ogg` en etant du RIFF ou
// de l'AIFF. Consequences : un `Content-Type` faux au Service Worker, et le
// reencodage Opus du worker — qui filtre sur `/\.wav$/` — sans aucun fichier a
// se mettre sous la dent. Voir docs/09-audio.md.
{
  const parExt = {};
  let mentent = 0;
  for (const { name, bytes } of audioFiles) {
    const ext = name.split(".").pop().toLowerCase();
    parExt[ext] = (parExt[ext] || 0) + 1;
    const vrai = sniffContainer(bytes);
    if (vrai && vrai !== ext) mentent++;
  }
  console.log("     clips par conteneur:", JSON.stringify(parExt),
              "| stats:", JSON.stringify(audio.stats));
  check("aucune extension ne ment sur son contenu", mentent, 0);
  // Le compte a bouge deux fois, et chaque fois parce qu'une famille de clips
  // n'appartenait a AUCUNE source placee :
  //
  //   36 -> 48   les volumes d'ambiance, vises par `_clip` (docs/45)
  //   48 -> 97   les sons d'EVENEMENT, champs d'un script joues en
  //              `PlayOneShot` : six pas de marche, six de course, trois de
  //              saut, quatre propulseurs de rotation, huit sons d'interface…
  //              (docs/46, lot 5)
  check("clips exportes en tout", audioFiles.length, 97);
  check("clips en Ogg Vorbis", parExt.ogg ?? 0, 23);
  // 73 RIFF, plus l'AIFF converti.
  check("clips en WAV", parExt.wav ?? 0, 74);
  check("plus aucun AIFF, qu'aucun navigateur ne decode", parExt.aiff ?? 0, 0);
  check("l'unique AIFF du build a ete converti",
        audio.stats["AIFF convertis en WAV"] ?? 0, 1);
  // C'est cette ligne qui rend le reencodage Opus du worker possible : sans un
  // seul `.wav`, il ne s'executait jamais.
  check("le worker a de quoi reencoder", (parExt.wav ?? 0) > 0, true);

  // --- les zones d'ambiance et leurs seuils (docs/84-ambiance.md) --------
  //
  // Six des dix-sept n'ont AUCUN collider. L'extraction leur en fabriquait un
  // en prenant la premiere boite d'enfant trouvee : la grotte aux quatre
  // portes se reduisait a une porte de onze metres.
  check("volumes d'ambiance", audio.volumes.length, 17);
  check("dont six sans forme propre",
        audio.volumes.filter((v) => !v.volume).map((v) => v.name).sort().join(","),
        "CaveVolume,CaveVolume01,CaveVolume02,Hatch,MuseumVolume,MusicVolume");
  check("tous portent leur corps",
        audio.volumes.every((v) => !!v.body), true);
  // Deux `MusicVolume`, sur deux corps : l'un a une sphere, l'autre des portes.
  const musiques = audio.volumes.filter((v) => v.name === "MusicVolume");
  check("deux zones nommees MusicVolume", musiques.length, 2);
  check("et elles ne sont pas sur le meme corps",
        new Set(musiques.map((v) => v.body)).size, 2);
  const jointes = ambienceZones(audio, entrywayTriggers(gp));
  check("zones d'ambiance retenues", jointes.length, 17);
  check("et les six sans forme ont toutes des portes",
        jointes.filter((z) => !z.volume).every((z) => z.entryways.length > 0), true);
  check("quatorze seuils servent une zone sonore",
        jointes.reduce((a, z) => a + z.entryways.length, 0), 14);
  check("la grotte aux quatre portes les a toutes les quatre",
        jointes.find((z) => z.name === "CaveVolume01").entryways.length, 4);
  check("et la musique de la cite enterree en a cinq",
        jointes.find((z) => z.name === "MusicVolume" && !z.volume)
          .entryways.length, 5);

  // Les sons d'evenement : qui les porte, et avec quelle loi.
  const ev = eventAudio(audio);
  check("emetteurs de son d'evenement", ev.count, 22);
  check("six pas de marche", ev.family("PlayerMovementAudio", "_walk").length, 6);
  check("six pas de course", ev.family("PlayerMovementAudio", "_run").length, 6);
  check("trois sauts", ev.family("PlayerMovementAudio", "_jump").length, 3);
  check("quatre propulseurs de rotation",
        ev.family("ThrusterAudio", "_rotationalThrust", "Player_Body").length, 4);
  check("et le vaisseau miniature a son propre propulseur",
        ev.of("ThrusterAudio", "ModelShip_Body").clips._translationalClip
          .startsWith("ModelRocketThruster"), true);
  // Les seuils de la marche ne sont serialises sur AUCUNE instance : ils
  // viennent du constructeur, comme les trois secondes de `RepairVolume`.
  // L'invariant garde le repli — sans lui, une extraction qui cesserait de
  // lire les champs passerait en silence.
  check("les seuils de pas ne sont pas dans la scene",
        Object.keys(ev.of("PlayerMovementAudio").params).length, 0);
  check("ils viennent donc du constructeur",
        `${FOOTSTEP.walkThreshold}/${FOOTSTEP.runThreshold}`, "0.5/4.5");
  // Le vent de course, lui, EST regle par l'instance, et pas comme le
  // constructeur : 40 au lieu de 80 pour la limite haute.
  check("la limite haute du vent vient de l'instance",
        ev.of("TurbulenceAudio").params._upperSpeedLimit, 40);
}

// --- les six lots de docs/44-reste-a-migrer.md, sur le build ----------------

// §1 LES REFERENTIELS DECLARES. Quatorze volumes : neuf majeurs, un par corps
// principal, et cinq ordinaires dont le vaisseau et le soleil.
{
  const frames = referenceFrames(gp);
  check("volumes de referentiel", frames.length, 14);
  check("dont majeurs", frames.filter((f) => f.major).length, 9);
  check("les neuf majeurs sont primaires",
        frames.filter((f) => f.major && f.primary).length, 9);
  check("tous portent un corps", frames.every((f) => f.body), true);
  check("et tous une sphere",
        frames.every((f) => f.volume && f.volume.shape === "sphere"), true);
  const arrivees = [...new Set(frames.filter((f) => f.major)
    .map((f) => f.arrival))].sort((a, b) => a - b);
  check("deux distances d'arrivee seulement", arrivees.join(","), "1000,2500");
  check("Timber Hearth : arrivee 1000, alignement 700",
        JSON.stringify(autopilotDistances(frames, "TimberHearth_Body")),
        JSON.stringify({ arrival: 1000, alignment: 700, declared: true }));
  check("Dark Bramble arrive a 2500 et ne s'aligne jamais",
        JSON.stringify(autopilotDistances(frames, "DarkBramble_Body")),
        JSON.stringify({ arrival: 2500, alignment: 0, declared: true }));
  const vaisseau = frames.find((f) => f.body === "Ship_Body");
  check("le vaisseau a son propre referentiel, de trente unites",
        vaisseau.radius, 30);
  check("et les trois noeuds du satellite casse le leur, non primaire",
        frames.filter((f) => f.body === "BrokenSatellite_Body" && !f.primary).length, 3);
  // Le cas que la gravite dominante ne sait pas traiter : dans le hangar,
  // c'est le vaisseau qui gagne, parce qu'il est le plus petit volume.
  check("au centre du vaisseau, le referentiel est le sien",
        frameAt(frames, vaisseau.position).body, "Ship_Body");
}

// §2 LES DECALCOMANIES. La geometrie est deja exportee — ce sont les trente
// « Decals Mesh Renderer » de docs/40-solide.md ; ce qui manquait est le
// materiau, et `_meshOffset` vaut zero partout : rien n'est decale
// geometriquement, tout se joue au rendu.
{
  check("projecteurs de decalcomanie", n("DS_DecalProjector"), 38);
  check("groupes de decalcomanies", n("DS_Decals"), 30);
  check("maillages de decalcomanies", n("DS_DecalsMeshRenderer"), 30);
  check("aucun decalage geometrique",
        (gp.placed.DS_DecalProjector || []).every((c) => (c.fields || {}).meshOffset === 0),
        true);
  check("les trente maillages portent tous le meme nom",
        new Set((gp.placed.DS_DecalsMeshRenderer || []).map((c) => c.name)).size, 1);
  check("mais pas le meme corps : c'est lui qui les distingue",
        new Set((gp.placed.DS_DecalsMeshRenderer || []).map((c) => c.body)).size > 1,
        true);
}

// §3 LA VIE DU DECOR.
{
  const panneaux = billboards(gp);
  check("panneaux face camera", panneaux.length, 15);
  check("dont cinq en LookAt — les plans des planetes lointaines",
        panneaux.filter((p) => p.lookAt).length, 5);
  // Quatre seulement tournent autour d'un mat, et ce sont les quatre
  // villageois : les six autres regardent librement la camera.
  check("et quatre qui tournent autour d'un axe",
        panneaux.filter((p) => !p.lookAt && Math.hypot(...p.axis) > 0).length, 4);
  check("personnages qui se tournent quand on leur parle",
        talkingFaces(gp).length, 8);
  // Le declenchement passe par le nom : la zone de conversation est l'ENFANT du
  // personnage, et c'est son parent qu'on cherche. Les quatorze zones
  // s'appellent presque toutes « ConversationZone » — sans ce chemin, aucun
  // personnage ne se tournerait jamais.
  {
    const dlg = extractDialogue(ctx);
    const parlants = new Set(dlg.conversations.map((c) => c.speaker));
    check("chaque visage a bien une conversation a son nom",
          talkingFaces(gp).filter((f) => parlants.has(f.name)).length, 8);
  }

  const buses = thrusterNozzles(gp);
  check("buses de reacteur", buses.length, 10);
  check("une par valeur de l'enum Thruster",
        new Set(buses.map((b) => b.thruster)).size, 10);
  check("et toutes sur le vaisseau",
        buses.every((b) => b.body === "Ship_Body"), true);

  check("bouffees de particules", particleBursts(gp).length, 18);
  check("toutes entre une et trois secondes",
        particleBursts(gp).every((b) => b.min === 1 && b.max === 3), true);
  // Et toutes en BOUCLE, ce qui annule le tirage : `Awake` pose
  // `particleSystem.loop = _looping`, et un systeme qui boucle joue en continu.
  // Le delai aleatoire n'a donc aucun effet visible dans l'alpha.
  check("et toutes en boucle, ce qui rend le tirage sans effet",
        particleBursts(gp).filter((b) => b.looping).length, 18);
  const meteores = meteorLaunchers(gp);
  check("lanceurs de meteores", meteores.length, 4);
  check("l'un d'eux attend plus longtemps que les autres",
        meteores.filter((m) => m.minInterval === 15).length, 1);

  const passages = teleporters(gp);
  check("passages anciens", passages.length, 6);
  check("tous connaissent leur arrivee",
        passages.every((t) => t.receiver && t.receiver.name), true);
  check("deux visent une cible de vue differente de leur arrivee",
        passages.filter((t) => t.viewTarget !== t.receiver).length, 2);
  check("et leurs arrivees se repartissent sur quatre corps",
        new Set(passages.map((t) => t.receiver.body)).size, 4);
  check("passages de la dimension abandonnee", warps(gp).length, 3);
}

// §4 LES VOLUMES DE JEU.
{
  const haz = hazardVolumes(gp);
  check("volumes qui blessent", haz.length, 1);
  check("le sable de l'entonnoir fait vingt points par seconde",
        haz[0].perSecond, 20);
  check("et rien au premier contact", haz[0].firstContact, 0);

  const zg = zeroGFields(gp);
  check("champs d'apesanteur", zg.length, 4);
  check("dont un sans forme, qui vit de ses declencheurs",
        zg.filter((f) => !f.volume && f.entryways.length).length, 1);
  // La chambre du village : une seule porte, et le portage l'ecartait
  // (docs/85-chambre.md).
  const chambre = zg.find((f) => !f.volume);
  check("la chambre en apesanteur a une porte", chambre.entryways.length, 1);
  check("et elle est sur Timber Hearth", chambre.body, "TimberHearth_Body");
  // Le seul champ directionnel commande par des seuils : la station meteo.
  const dirs = directionalFields(gp);
  const parSeuils = dirs.filter((f) => f.byEntryways);
  check("un seul champ directionnel par seuils",
        parSeuils.map((f) => f.name).join(","), "Field_WeatherStation");
  check("et il n'a pas de forme a lui", parSeuils[0].volume, undefined);
  // Les secteurs MAJEURS : sept PlanetoidSector, deux ZeroGSector, un
  // MajorSector nu (docs/82-secteur-majeur.md).
  const secteurs = majorSectors(gp);
  check("secteurs majeurs", secteurs.length, 10);
  check("sept portent la minicarte, trois non",
        secteurs.filter((x) => x.useMinimap).length, 7);
  // La poussee : vingt partout SAUF deux — la premiere jumelle en autorise
  // dix fois plus, Giant's Deep n'en limite aucune.
  check("la poussee est bridee a vingt dans huit secteurs",
        secteurs.filter((x) => x.thrustLimit === 20).length, 8);
  check("la premiere jumelle autorise deux cents",
        secteurs.find((x) => x.name === "Sector_HT_1").thrustLimit, 200);
  check("Giant's Deep n'en limite aucune",
        secteurs.find((x) => x.name === "Sector_GD").thrustLimit, null);
  // LA LAMPE. Un seul secteur la bride, et le portage lui passait
  // `_ambientLightRange` : il bridait la lampe partout, avec le mauvais
  // nombre, et laissait passer le seul endroit ou le build la bride vraiment.
  check("un seul secteur bride la lampe du joueur",
        secteurs.filter((x) => x.flashlightLimit !== null).map((x) => x.name)
          .join(","), "Sector_HT_2");
  check("... et il la bride a vingt",
        secteurs.find((x) => x.name === "Sector_HT_2").flashlightLimit, 20);
  check("tous portent un declencheur spherique",
        secteurs.every((x) => x.volume && x.volume.shape === "sphere" &&
                              x.volume.radius > 0), true);
  // La minicarte suit la CLASSE : les trois qui ne sont pas des
  // PlanetoidSector ne la portent pas, et ce sont les trois endroits ou l'on
  // ne sait plus ou l'on est.
  check("secteurs sans minicarte",
        secteurs.filter((x) => !x.useMinimap).map((x) => x.name).sort().join(","),
        "Sector_DB,Sector_Derelict,Sector_QuantumMoon");
  // Le declencheur n'est PAS l'horizon : le portage prenait `horizon x 1,5`.
  const th = secteurs.find((x) => x.name === "Sector_TH");
  check("Timber Hearth : 200 d'horizon", th.horizon, 200);
  check("... et 1000 de declencheur", th.volume.radius, 1000);
  check("aucun declencheur n'egale son horizon",
        secteurs.some((x) => x.horizon && x.volume.radius === x.horizon), false);
  check("l'epave bride les phares a cent",
        secteurs.find((x) => x.name === "Sector_Derelict").shiplightLimit, 100);
  // `CalculateActiveMajorSector` sur la scene au repos. Le secteur de la lune
  // est EMBOITE dans celui de Timber Hearth (son centre est a 450 unites du
  // sien, pour un declencheur de 1000) : c'est le cas ou les deux regles
  // possibles se departagent, et celle du build retient le plus proche.
  const lune = secteurs.find((x) => x.name === "Sector_Moon");
  check("au centre du secteur de la lune, c'est lui qui est actif",
        activeMajorSector(secteurs, lune.position).name, "Sector_Moon");
  check("et la minicarte s'y allume", activeMajorSector(secteurs, lune.position)
        .useMinimap, true);
  const lq = secteurs.find((x) => x.name === "Sector_QuantumMoon");
  check("sur la lune quantique, la minicarte s'eteint",
        activeMajorSector(secteurs, lq.position).useMinimap, false);
  check("loin de tout, aucun secteur majeur",
        activeMajorSector(secteurs, [0, 100000, 0]), null);
  // La TEINTE, lue pour la premiere fois : `_ambientLight` est une
  // enumeration. Quatre secteurs en bleu de nuit, l'ocean en vert, cinq noirs.
  check("secteurs en bleu de nuit",
        secteurs.filter((x) => x.ambient === 1).length, 4);
  check("un seul secteur vert",
        secteurs.filter((x) => x.ambient === 2).map((x) => x.name).join(","),
        "Sector_GD");
  check("et cinq qui n'eclairent rien",
        secteurs.filter((x) => !x.ambient).length, 5);
  // Dark Bramble a la plus grande portee d'ambiance du systeme ET la couleur
  // noire : lire `_ambientLightRange` seul ne pouvait pas le dire.
  check("Dark Bramble : 1200 de portee pour du noir",
        [secteurs.find((x) => x.name === "Sector_DB").lightRange,
         secteurs.find((x) => x.name === "Sector_DB").ambient].join(","), "1200,0");

  // --- les seuils et les zones sans soleil (docs/83-seuils.md) ------------
  const seuils = entrywayTriggers(gp);
  check("seuils poses dans la scene", seuils.length, 18);
  check("tous ont une boite", seuils.every((t) => t.volume &&
        t.volume.shape === "box"), true);
  check("et une direction de sortie unitaire",
        seuils.every((t) => Math.abs(Math.hypot(...t.exit) - 1) < 1e-6), true);
  const sz = sunlessZones(gp);
  check("zones sans soleil", sz.length, 5);
  // Le portage prenait `DarkZone` pour elles : il y en a UNE, sur un
  // declencheur d'invite de lampe.
  check("zones sombres, qui sont autre chose",
        (gp.placed.DarkZone || []).length, 1);
  check("les grottes n'ont pas de forme, elles ont des portes",
        sz.filter((z) => !z.volume).length, 4);
  check("la membrane corrosive, elle, est une sphere",
        sz.find((z) => z.name === "CorrosiveMembrane").volume.radius, 205);
  check("portes des zones sans soleil",
        sz.reduce((a, z) => a + z.entryways.length, 0), 8);
  check("la grande grotte de la jumelle en a quatre",
        sz.find((z) => z.name === "CaveVolume01").entryways.map((t) => t.name)
          .sort().join(","), "CityEntryway,PodEntryway,QuantumEntryway,TowerEntryway");
  // Les six portes des deux grottes de la jumelle sortent vers +Y : elles sont
  // au plafond, et sortir c'est monter. Les deux autres zones n'ont pas cette
  // forme — le toit du musee sort en +X, la grotte de Timber Hearth en -Z.
  check("directions de sortie des huit portes",
        sz.flatMap((z) => z.entryways).map((t) => t.exit.join(",")).sort()
          .join(" | "),
        "0,0,-1 | 0,1,0 | 0,1,0 | 0,1,0 | 0,1,0 | 0,1,0 | 0,1,0 | 1,0,0");

  check("zones d'interaction", interactZones(gp).length, 7);
  check("trois fenetres de vue distinctes",
        [...new Set(interactZones(gp).map((z) => z.viewingWindow))]
          .sort((a, b) => a - b).join(","), "60,90,360");
  const invites = probePrompts(gp);
  check("invites de sonde et de lunette", invites.length, 5);
  check("les quatre invites de sonde demandent 45 degres de regard",
        invites.filter((p) => p.kind === "probe" && p.minAngle === 45).length, 4);
  check("emetteurs de rayonnement", radiationEmitters(gp).length, 9);
  check("huit feux de camp a la meme courbe, plus l'etoile",
        radiationEmitters(gp).filter((e) => e.type === 1).length, 8);
}

// §7 L'EQUIPEMENT SE RAMASSE.
{
  const pickups = gearPickups(gp);
  check("objets a ramasser", pickups.length, 2);
  const paquetage = pickups.find((p) => p.name === "ExpeditionGear");
  const combi = pickups.find((p) => p.name === "SpaceSuit");
  check("le paquetage du vaisseau donne les trois",
        `${paquetage.suit}${paquetage.probe}${paquetage.minimap}`, "truetruetrue");
  check("la combinaison de la grotte ne donne qu'elle-meme",
        `${combi.suit}${combi.probe}${combi.minimap}`, "truefalsefalse");
  check("le paquetage est dans le vaisseau", paquetage.body, "Ship_Body");
  check("volumes de combinaison", suitVolumes(gp).length, 2);
  check("le mur invisible est nomme",
        suitVolumes(gp).find((v) => v.kind === "barrier").wall, "InvisibleWall");
  check("points d'accrochage du joueur", attachPoints(gp).length, 4);
  check("verrouillages de camera", lockOnTargets(gp).length, 2);
  check("dont un pose sur le joueur lui-meme",
        lockOnTargets(gp).filter((t) => t.body === "Player_Body").length, 1);

  // Les trois volumes de reparation du satellite casse sont l'entrainement en
  // apesanteur ; les quinze autres sont les avaries du vaisseau. Le CORPS les
  // separe, la portee ne fait que les distinguer aujourd'hui.
  const entrainement = new ZeroGTraining(
    repairVolumes(gp).map((v) => ({ volume: v, done: false })));
  check("trois noeuds a reparer dans la chambre d'apesanteur",
        entrainement.total, 3);
}

// Les PNJ : une conversation sans arbre dans la scene reste jouable.
//
// Le `_activeDialogueTree` du Conservateur est NUL dans le build, et ce n'est
// pas un oubli : `CuratorConvoController` pose l'arbre a l'execution. Le
// portage l'ecartait, et avec lui les codes de lancement qu'il est le seul a
// accorder — donc le decollage. Voir docs/13-dialogue.md.
{
  const dlg = extractDialogue(ctx);
  console.log("     dialogue:", JSON.stringify(dlg.stats));
  check("conversations de la scene", dlg.conversations.length, 14);
  check("une seule n'a pas d'arbre pose", dlg.stats["conversations liees"], 13);
  check("les controleurs sont rattaches par GameObject",
        dlg.stats["conversations a controleur"], 4);
  check("et toutes les conversations sont jouables",
        dlg.stats["conversations jouables"], 14);

  const curator = dlg.conversations.find((c) => c.character === "Curator");
  check("le Conservateur est bien la", !!curator, true);
  check("son arbre est nul dans la scene", curator.tree, null);
  check("son controleur, lui, est pose dessus",
        curator.controller && curator.controller.kind, "CuratorConvoController");
  // Les deux arbres que l'IL nomme : avant le vol, puis les souhaits.
  check("et il porte ses deux arbres",
        Object.keys(curator.controller.trees).sort().join(","),
        "_goodLuck,_preFlightObservations");
  // Le nom ne distingue rien : c'est pourquoi le lien se fait par GameObject.
  const zones = dlg.conversations.filter((c) => c.name === "ConversationZone").length;
  check("les zones de conversation sont homonymes", zones, 13);
}

// §2.7 : l'objet vise par un controleur de dialogue est un ARBRE, jamais un
// Transform. Le `fileId` etait perdu au dereferencement, et les pointeurs se
// resolvaient en os de squelette (`anglerfish_rig:UpTail4`).
// Le ciel de Timber Hearth : une voute, 24 nuages, un champ d'etoiles. Aucune
// des trois classes n'etait lue, et la premiere image du jeu montrait donc un
// plein jour uni la ou le build decrit une nuit (docs/41-ciel.md).
{
  const sky = extractSky(ctx);
  console.log("     ciel:", JSON.stringify(sky.stats),
              "| textures:", sky.textures.join(" "));
  check("la voute est extraite", !!sky.shell, true);
  check("son rayon de collider", sky.shell && sky.shell.radius, 250.749);
  // La question que docs/41-ciel.md laissait ouverte — « la convention d'axes
  // reste a etablir » — se lit sur les uv du maillage : le centre du disque
  // bleu (uv 0,5 ; 0,5) tombe sur le +Z local, et l'uv est une projection
  // polaire centree dessus. Rendu ici avec le Z deja inverse par l'export.
  check("le disque de ciel est au +Z local, Z inverse par l'export",
        (sky.shell.discDirection || []).join(","), "0,0,-1");
  // Les dix textures de nuage sortent enfin comme IMAGES. Elles etaient
  // nommees depuis docs/41, et les 24 nuages portaient donc tous le visage
  // serialise sur le materiau partage.
  const vues = [];
  const skyImg = extractSky(ctx, (nom, img) => { vues.push([nom, img.width]); return nom; });
  check("dix images de nuage ecrites", vues.length, 10);
  check("toutes en 256 pixels", vues.every(([, w]) => w === 256), true);
  check("et chaque nuage sait laquelle est la sienne",
        skyImg.clouds.every((c) => !!c.image), true);
  check("les vingt-quatre portent le meme nom",
        new Set(skyImg.clouds.map((c) => c.name)).size, 1);
  // Le champ d'etoiles : mille etoiles qui s'eteignent une a une.
  const champ = sky.stars[0];
  check("un champ d'etoiles", sky.stars.length, 1);
  check("de mille etoiles", champ.count, 1000);
  check("a trente mille unites", champ.radius, 30000);
  check("de 200 a 400 d'envergure", (champ.size || []).join(","), "200,400");
  check("sa courbe d'extinction est echantillonnee", champ.explosionCurve.length, 21);
  check("elle part de zero", champ.explosionCurve[0], 0);
  check("et finit a un", champ.explosionCurve[20], 1);
  // `_starsUpdateIntervalInSeconds` vaut zero : le controle est fait a chaque
  // image, et l'invariant garde ce zero.
  check("le controle se fait a chaque image", champ.interval, 0);
  // `_skyRadius` n'est pas serialise : c'est le 320 du constructeur, et c'est
  // par LUI que le build divise, pas par le rayon du collider.
  check("son rayon de ciel vient du constructeur", sky.shell && sky.shell.skyRadius, 320);
  check("sa courbe d'alpha est echantillonnee",
        sky.shell && sky.shell.alphaCurve && sky.shell.alphaCurve.length, 9);
  check("elle part pleine", sky.shell.alphaCurve[0], 1);
  check("... et finit a zero", sky.shell.alphaCurve[8], 0);
  check("les nuages sont extraits", sky.clouds.length, 24);
  // Les 24 partagent le materiau `CloudMat`, dont la texture serialisee est
  // `cloud_01`. Sans ce composant, ils portent tous le meme visage.
  check("... et ils portent dix textures distinctes", sky.textures.length, 10);
  check("chaque nuage nomme la sienne",
        sky.clouds.filter((c) => c.texture).length, 24);
  check("le champ d'etoiles est la", sky.stars.length, 1);
}

// Les surfaces qui defilent : le sable des jumelles, les cascades, les ecrans.
// Quatre classes, une seule loi, et rien ne les lisait (docs/42-lumieres.md).
{
  const ta = extractTextureAnimators(ctx);
  console.log("     textures defilantes:", JSON.stringify(ta.stats));
  check("les surfaces defilantes sont extraites", ta.scrollers.length, 44);
  check("dont le defilement principal", ta.stats.TextureAnimator, 27);
  check("... sa variante multi-materiaux", ta.stats.TextureAnimatorMultipleMats, 10);
  check("... et celle qui anime aussi la normale", ta.stats.NormalTexAnimator, 4);
  // Aucune ne doit sortir sans rythme : un defilement a zero ne defile pas, et
  // l'extracteur les ecarte plutot que de les emettre inertes.
  check("chacune porte un rythme",
        ta.scrollers.filter((s) => Object.values(s.channels)
          .every((c) => c.rate !== 0)).length, 44);
  check("chacune porte une direction",
        ta.scrollers.filter((s) => Object.values(s.channels)
          .every((c) => Array.isArray(c.direction) && c.direction.length === 2)).length, 44);
}

// Ce qui est SOLIDE se lit dans le build, et le portage le supposait : il
// fabriquait un collider trimesh pour chaque maillage rendu. Un tiers d'entre
// eux n'en portent aucun (docs/40-solide.md) — dont la voute `SkyShell`, une
// sphere de rayon 250,7 autour de Timber Hearth sur laquelle le joueur se
// posait.
{
  const COL = ["MeshCollider", "SphereCollider", "BoxCollider",
               "CapsuleCollider", "WheelCollider"];
  const avecCollider = new Set();
  let declencheurs = 0;
  for (const t of COL) {
    for (const o of ctx.env.objects({ type: t, file: "level0" })) {
      const v = ctx.readEngine(o);
      if (!v || !v.m_GameObject) continue;
      // Un declencheur signale qu'on entre ; il ne rend rien solide.
      if (v.m_IsTrigger === 1 || v.m_IsTrigger === true) { declencheurs++; continue; }
      avecCollider.add(v.m_GameObject.pathId);
    }
  }
  check("le build distingue les declencheurs des obstacles", declencheurs, 194);
  const avecMaillage = new Set();
  for (const o of ctx.env.objects({ type: "MeshFilter", file: "level0" })) {
    const v = ctx.readEngine(o);
    if (v && v.m_GameObject) avecMaillage.add(v.m_GameObject.pathId);
  }
  const traversables = [...avecMaillage].filter((g) => !avecCollider.has(g));
  console.log("     maillages:", avecMaillage.size, "| colliders:", avecCollider.size,
              "| traversables:", traversables.length);
  check("le build pose des obstacles", avecCollider.size, 1691);
  check("... et des maillages", avecMaillage.size, 2219);
  check("un tiers des maillages se traverse", traversables.length, 747);

  // Les 24 nuages de Timber Hearth et la voute celeste en font partie : ce
  // sont eux qu'on heurtait.
  const ciel = new Set();
  for (const { obj, cls } of ctx.behaviours((c) => /cloudtexture|skybehavior/i.test(c))) {
    ciel.add(ctx.ownerId(obj));
  }
  check("le ciel de Timber Hearth est pose", ciel.size, 25);
  check("... et rien de ce ciel n'est solide",
        [...ciel].filter((g) => avecCollider.has(g)).length, 0);
}

// Le build EN A UN, et il est legitime : `_rocketScientistConversation` vise
// le composant `Conversation` de la zone du scientifique, pas un arbre. Ce
// qu'on garde, c'est donc la LISTE exacte : elle nomme le champ, et grossirait
// aussitot si le `fileId` se reperdait et que des os de squelette revenaient
// se faire passer pour des arbres.
check("les pointeurs non textuels sont exactement ceux du build",
      (gp.stats["references non textuelles"] ?? []).join(","),
      "SecondLoopConvoTrigger._rocketScientistConversation");
const ctrls = Object.entries(gp.placed)
  .filter(([cls]) => /convocontroller|convotrigger/i.test(cls))
  .flatMap(([cls, l]) => l.map((e) => ({ cls, e })));
console.log("     controleurs de dialogue:", ctrls.length,
            "| avec arbres:", ctrls.filter(({ e }) => e.trees).length);

// --- les cameras et leurs effets d'image (docs/47-effets-image.md) ---------
//
// Le recensement les donnait pour LUES parce que trois de leurs classes sont
// citees dans un commentaire de `shaders/index.js`. Ces comptes-la sont donc
// la contre-mesure : ils portent sur la scene, pas sur ce que le portage dit.
const cams = extractCameras(ctx);
check("quinze cameras dans level0", cams.count, 15);
check("et vingt-quatre effets d'image poses dessus", cams.effectCount, 24);
check("toutes lisibles", Object.keys(cams.unreadable).length, 0);

const parNom = new Map(cams.cameras.map((c) => [c.name, c]));
const joueur = parNom.get("PlayerCamera");
check("la camera du joueur voit a 70 degres", joueur.fov, 70);
check("son plan proche est a 0,05", joueur.near, 0.05);
check("son plan lointain a 50 000", joueur.far, 50000);
check("elle est en HDR", joueur.hdr, true);
check("elle porte six effets", Object.keys(joueur.effects).length, 6);
check("dont un bloom au seuil de 0,8",
      joueur.effects.BloomAndLensFlares[0].threshold, 0.8);
check("additif, comme celui de la carte", joueur.effects.BloomAndLensFlares[0].blend, "add");
check("son glow est bleu", joueur.effects.GlowEffect[0].tint.slice(0, 3).join(","),
      "0.3216,0.6588,1");
check("sa vignette est discrete au repos", joueur.effects.Vignetting[0].intensity, 0.375);
check("et son tourbillon prend tout l'ecran", joueur.effects.TwirlEffect[0].radius[0], 1.5);

// Les halos de lentille sont poses et ETEINTS sur les deux instances : le
// build a le composant et ne s'en sert pas. On le garde ecrit, faute de quoi
// quelqu'un les portera un jour pour rien.
const blooms = cams.cameras.flatMap((c) => c.effects.BloomAndLensFlares || []);
check("deux blooms dans la scene", blooms.length, 2);
check("aucun n'allume ses halos", blooms.filter((b) => b.lensflares).length, 0);
check("celui de la carte a un seuil plus bas",
      parNom.get("MapCamera").effects.BloomAndLensFlares[0].threshold, 0.5);

// LandingCam porte DEUX Tonemapping : c'est pourquoi chaque effet est une
// liste et non un champ.
check("la camera d'atterrissage voit a 100 degres", parNom.get("LandingCam").fov, 100);
check("et porte deux tonemapping", parNom.get("LandingCam").effects.Tonemapping.length, 2);
check("son grain a la force 4", parNom.get("LandingCam").effects.NoiseAndGrain[0].strength, 4);
check("la camera du satellite est monochrome",
      parNom.get("SatelliteCamera").effects.NoiseEffect[0].monochrome, true);

// Les cinq impostures de planete : `_snapshotInterval` vaut 1 partout — mais
// le systeme est A MOITIE CABLE, et c'est le build qui le dit
// (docs/56-impostures.md).
const lods = cams.cameras.filter((c) => c.effects.LODCameraSnapshot);
check("cinq cameras d'imposture", lods.length, 5);
check("toutes a une image par seconde",
      lods.filter((c) => c.effects.LODCameraSnapshot[0].interval === 1).length, 5);
const snaps = lods.map((c) => c.effects.LODCameraSnapshot[0]);
check("deux d'entre elles n'ont AUCUN plan",
      snaps.filter((s) => !s.plane).length, 2);
check("une n'a meme pas de planete", snaps.filter((s) => !s.planet).length, 1);
check("et l'une des trois cablees vise une boite grise",
      snaps.filter((s) => /graybox/i.test(s.planet || "")).length, 1);
// Les premiers rendus sont DECALES, pour ne pas rendre les trois la meme image.
check("les premiers rendus sont decales",
      new Set(snaps.map((s) => s.firstSnapshot)).size, 3);
check("les trois plans cables portent leur nom",
      snaps.filter((s) => s.plane).map((s) => s.plane).sort().join(","),
      "LODPlane_BrittleHollow,LODPlane_DB,LODPlane_TimberHearth");

// Le controleur ne serialise RIEN : ses constantes viennent du constructeur.
// L'invariant garde cette absence, exactement comme pour les seuils de la
// marche (docs/46) — sans lui, une extraction qui cesserait de lire ses champs
// passerait pour normale.
const ctrl = [...ctx.behaviours(["PlayerCameraEffectController"])];
check("un seul controleur d'effets", ctrl.length, 1);
check("et il ne serialise aucun champ",
      Object.keys(ctx.scriptFields(ctrl[0].obj) || {}).length, 0);

// --- la queue du recensement (docs/49-queue.md) ---------------------------
//
// Ce qui restait apres les six lots, une fois les commentaires retires du
// comptage : quatre classes qui se lisent, deux qui se mesurent et se ferment.
const marqueurs = (gp.placed.MapMarker || []);
check("treize marqueurs de carte", marqueurs.length, 13);
check("et tous portent un nom de jeu",
      marqueurs.every((m) => (m.fields || {})._label), true);
check("le vaisseau est du type Ship (6)",
      (marqueurs.find((m) => m.name === "Ship_Body").fields || {})._markerType, 6);
check("et l'un d'eux n'est pas un corps mais une ile",
      !!marqueurs.find((m) => (m.fields || {})._label === "Giant's Landing"), true);

const moteurs = (gp.placed.EngineComponent || []);
check("dix reacteurs", moteurs.length, 10);
// `_alertLocation` vaut Left (8) pour les cinq de gauche et Right (16) pour les
// cinq de droite : cinq et cinq, sans exception.
check("cinq a gauche", moteurs.filter((m) => m.fields._alertLocation === 8).length, 5);
check("cinq a droite", moteurs.filter((m) => m.fields._alertLocation === 16).length, 5);
check("chacun sur une buse distincte",
      new Set(moteurs.map((m) => m.fields._thrusterLocation)).size, 10);
// Zero sur les dix : n'importe quel choc abime le reacteur le plus proche.
check("aucun n'a de seuil d'impact",
      moteurs.every((m) => (m.fields._impactThreshold ?? 0) === 0), true);

// `_damageLocationMask` est une SORTIE qui s'accumule, pas un filtre : sa
// valeur serialisee est l'etat de depart d'un vaisseau intact.
const dmg = (gp.singletons.ShipDamageController || {}).fields || {};
check("le masque de degats part de zero", dmg._damageLocationMask, 0);
check("les seuils d'impact sont 15 et 30",
      `${dmg._lightImpactThreshold},${dmg._mediumImpactThreshold}`, "15,30");
check("la mort instantanee est a 300", dmg._instantDeathSpeed, 300);
check("et les propulseurs ne se coupent PAS dans cette alpha",
      !!dmg._disableDamagedThrusters, false);

check("six pivots de tornade", (gp.placed.TornadoPivotController || []).length, 6);
// `_speed` n'est serialise sur aucun : il est TIRE au reveil, entre 1 et 2.
check("dont aucun ne serialise sa vitesse",
      (gp.placed.TornadoPivotController || []).every((t) => !("_speed" in (t.fields || {}))), true);
check("trois suiveurs", (gp.placed.MatchTransform || []).length, 3);
check("dont un sans cible",
      (gp.placed.MatchTransform || []).filter((m) => !m.fields._targetTransform).length, 1);
check("dix-huit conteneurs jetables", (gp.placed.DisposableContainer || []).length, 18);
check("quatorze calibrateurs d'inertie",
      (gp.placed.InertiaTensorCalibrator || []).length, 14);

// On allume en REGARDANT (docs/50-regard.md) : un interrupteur, une toile, une
// porte. Trois classes enchainees, aucune lue avant.
const regards = (gp.placed.GazeSwitch || []);
check("un seul interrupteur du regard", regards.length, 1);
check("pose sur une jumelle, et non dans Dark Bramble", regards[0].body, "Twin01_Body");
check("son rayon vient de son collider", regards[0].volume.radius, 6);
check("dix degres d'ouverture", regards[0].fields._angleOfActivation, 10);
check("trois secondes de charge", regards[0].fields._secondsToCharge, 3);
// `_activationDist` vient du constructeur : l'invariant garde son ABSENCE de
// la scene, comme les seuils de la marche (docs/46).
check("mais la distance d'activation n'est pas dans la scene",
      "_activationDist" in regards[0].fields, false);
check("une toile", (gp.placed.GazeWebAnimator || []).length, 1);
check("et une porte d'energie", (gp.placed.EnergyGate || []).length, 1);

// La tour de lancement (docs/51-tour.md).
const asc = (gp.placed.Elevator || []);
check("un ascenseur", asc.length, 1);
check("sur Timber Hearth", asc[0].body, "TimberHearth_Body");
// La scene CONTREDIT le constructeur (10 et 3), et c'est le seul endroit de
// la serie ou cela arrive : l'invariant garde la valeur de la scene.
check("sa course fait 31,5 unites", asc[0].fields._trackHeight, 31.5);
check("et dure cinq secondes", asc[0].fields._liftDuration, 5);
check("un terminal de lancement", (gp.placed.LaunchTerminal || []).length, 1);
check("et son controleur d'ascenseur", (gp.placed.LaunchElevatorController || []).length, 1);
const pads = (gp.placed.LandingPadSensor || []);
check("trois capteurs de pad", pads.length, 3);
check("tous sur le vaisseau", pads.every((s) => s.body === "Ship_Body"), true);
check("tous de rayon un demi", pads.every((s) => s.volume && s.volume.radius === 0.5), true);
check("et tous avec le meme son de contact",
      new Set(pads.map((s) => s.fields._touchdownSound.name)).size, 1);
check("un gestionnaire de pads", (gp.placed.LandingPadManager || []).length, 1);
check("une entree de musee", (gp.placed.MuseumEntryway || []).length, 1);

// Les quatre modules de particules rares (docs/57-particules.md). Le compte
// disait qu'ils ne servaient JAMAIS ; refait, il en trouve quatre usages.
{
  const parts = extractParticles(ctx, (n) => n);
  const avec = (k) => parts.systems.filter((s) => s[k]);
  check("une vitesse constante, sur la comete", avec("velocity").length, 1);
  check("et elle part en arriere a cent", avec("velocity")[0].velocity.z, 100);
  check("un plafond de vitesse, sur l'explosion", avec("clampVelocity").length, 1);
  check("plafond cent, amortissement total",
        `${avec("clampVelocity")[0].clampVelocity.magnitude},` +
        `${avec("clampVelocity")[0].clampVelocity.dampen}`, "100,1");
  check("une rotation par vitesse", avec("rotationBySpeed").length, 1);
  // `scalar` est en RADIANS dans le build : 0,349 rad/s font vingt degres.
  check("de vingt degres par seconde",
        avec("rotationBySpeed")[0].rotationBySpeed.degreesPerSecond, 20);
  // Deux `SubModule` actifs, et celui de `DistantStars` n'a AUCUN
  // sous-emetteur : il est allume et ne fait rien.
  const subs = parts.systems.filter((s) => s.subEmitters !== null);
  check("deux modules de sous-emetteurs", subs.length, 2);
  check("dont un entierement vide",
        subs.filter((s) => s.subEmitters === 0).length, 1);
}

// Le casque, l'alarme, les voyants, les invites de guimauve (docs/52-casque.md).
const roasts = (gp.placed.RoastPromptEvent || []);
check("huit invites de guimauve", roasts.length, 8);
check("toutes a quatre unites",
      roasts.every((r) => r.fields._roastDistance === 4), true);
const casqueB = (gp.placed.HUDHelmet || []);
check("un casque", casqueB.length, 1);
// La scene CONTREDIT le constructeur (0,1), comme la course de l'ascenseur.
check("qui traine a 0,05 et non 0,1",
      Number(casqueB[0].fields._helmetLagSpeed.toFixed(2)), 0.05);
check("une alarme generale", (gp.placed.MasterAlarm || []).length, 1);
check("posee sur le vaisseau", (gp.placed.MasterAlarm || [])[0].body, "Ship_Body");
check("un afficheur de degats", (gp.placed.HUDDamageDisplay || []).length, 1);
check("un gestionnaire de notifications", (gp.placed.NotificationManager || []).length, 1);
check("et un baton a guimauve", (gp.placed.MarshmallowStick || []).length, 1);

// La seule surface du build qui declare ECRASER (docs/53-joueur.md).
const surfaces = (gp.placed.Surface || []);
check("une seule surface declaree", surfaces.length, 1);
check("elle ecrase", !!surfaces[0].fields._allowCompression, true);
check("elle est sur une jumelle", surfaces[0].body, "Twin01_Body");
check("et son rayon est de trente", surfaces[0].volume.radius, 30);
// Le rattachement doit designer le sable qui MONTE, pas celui qui se vide.
const colonnesB = markCrushing(sandColumns(gp), gp);
check("le sable qui monte ecrase",
      colonnesB.find((c) => c.name === "RisingSand").crushes, true);
check("celui qui se vide, non",
      colonnesB.find((c) => c.name === "DrainingSand").crushes, false);
check("un capteur de compression", (gp.placed.PlayerCompressionSensor || []).length, 1);
check("un bruiteur de joueur", (gp.placed.PlayerNoiseMaker || []).length, 1);
check("un etat de joueur", (gp.placed.PlayerState || []).length, 1);
check("et un manipulateur", (gp.placed.FirstPersonManipulator || []).length, 1);

// Ce qui pilote la lumiere GLOBALE (docs/54-lumiere.md).
check("un gestionnaire d'ambiance", (gp.placed.AmbientLightManager || []).length, 1);
// La boucle : dix-huit minutes, lues sur `SolarSystemRoot` et non devinees
// (docs/88-boucle.md). Le portage avait ecrit vingt.
check("la duree de boucle vient du build",
      gp.singletons.TimeLoop.fields._loopDurationInMinutes, 18);
check("deux phares exterieurs", (gp.placed.ExternalLightController || []).length, 2);
check("une lumiere a fondu", (gp.placed.FadeLight || []).length, 1);
check("un suivi du jour et de la nuit", (gp.placed.DayNightTracker || []).length, 1);
// Les coquilles sonores, et les zones sombres qui n'etaient lues par personne.
const coques = (gp.placed.AudioShell || []);
check("deux coquilles sonores", coques.length, 2);
check("et toutes deux ont une forme", coques.every((c) => !!c.volume), true);
// Le brouillage est INERTE dans cette alpha : un volume pose, un detecteur
// sans aucune instance, et un `GetInterference` que personne n'appelle. On
// garde la mesure — c'est elle qui dit qu'il n'y a rien a brancher.
check("un seul volume brouilleur", (gp.placed.InterferenceVolume || []).length, 1);
check("et aucun detecteur pour le lire",
      (gp.placed.InterferenceDetector || []).length, 0);

// La fin de la queue (docs/55-attaches.md).
check("quatorze objets s'alignent sur un corps designe",
      (gp.placed.AlignWithTargetBody || []).length, 14);
check("et tous savent lequel",
      (gp.placed.AlignWithTargetBody || []).every((c) => !!c.fields._targetBody), true);
check("neuf corps heritent d'un champ", (gp.placed.FieldInheritor || []).length, 9);
const clignotants = (gp.placed.BlinkingRenderer || []);
check("deux clignotants", clignotants.length, 2);
// Les deux serialisent leur rythme, et PAS a la meme valeur : un clignotement
// plus rapide dit quelque chose de plus urgent.
check("et ils ne battent pas au meme rythme",
      new Set(clignotants.map((c) => c.fields._offSeconds)).size, 2);
check("aucun n'a de duree finie",
      clignotants.every((c) => (c.fields._duration ?? -1) < 0), true);
const nodes = (gp.placed.BrokenNode || []);
check("trois noeuds casses", nodes.length, 3);
check("tous sur le satellite casse",
      nodes.every((n) => n.body === "BrokenSatellite_Body"), true);
check("et tous reparent vers le meme materiau vert",
      new Set(nodes.map((n) => n.fields._repairedMaterial.name)).size, 1);
check("une trappe", (gp.placed.HatchController || []).length, 1);
// Les six buses du vaisseau MINIATURE, et non celui du joueur : c'est le champ
// `body` qui le dit (docs/58-suivi.md).
const buses = (gp.placed.ThrusterParticleController || []);
check("un controleur de buses", buses.length, 1);
check("sur le vaisseau miniature", buses[0].body, "ModelShip_Body");
check("six buses resolues en positions",
      Object.values(buses[0].nozzles || {}).filter(Boolean).length, 6);
check("et les six sont a des places distinctes",
      new Set(Object.values(buses[0].nozzles).map((p) => p.join(","))).size, 6);
// Le volume compose et ses declencheurs enfants.
check("un volume compose", (gp.placed.CompoundTriggerVolume || []).length, 1);
check("et quatre declencheurs enfants", (gp.placed.ChildTriggerVolume || []).length, 4);
check("une tempete de sable", (gp.placed.SandstormVolume || []).length, 1);
// Les trois prefabs d'eclaboussure ne sont resolus par RIEN dans le build.
//
// Cette ligne disait « c'est le meme cas que `_probePrefab` », et c'etait faux :
// `_probePrefab` vise `sharedassets1.assets:2295` et s'y resout parfaitement
// (docs/60-sonde.md). Deux champs vides ne sont pas le meme cas parce qu'ils
// sont vides ; celui-ci l'est, et le controle ci-dessous le mesure — l'autre ne
// l'etait pas, et personne ne l'avait mesure. L'invariant garde ce vide-CI.
const remous = (gp.placed.WaterEffectVolume || []);
check("un volume d'eclaboussure", remous.length, 1);
check("et aucun de ses trois prefabs n'est resolu",
      ["_largeSplashPrefab", "_medSplashPrefab", "_smallSplashPrefab"]
        .filter((k) => remous[0].fields[k]).length, 0);

// A10 : les prefabriques. Le recensement ne lisait que `level0`, et l'alpha
// range dans `sharedassets1.assets` et `resources.assets` tout ce qu'elle
// instancie en cours de partie — la sonde entiere, et neuf effets a duree de
// vie. C'est la moitie du jeu que le denominateur ignorait (docs/60-sonde.md).
console.time("prefabriques");
const prefabs = mergePrefabs(["sharedassets1.assets", "resources.assets"]
  .map((f) => extractPrefabs(new ExtractContext(env, u, f, engineTypes))));
console.timeEnd("prefabriques");
check("le prefabrique de sonde est la", !!prefabs.probe, true);
// Neuf et non dix : `ProbeMesh` ne porte QUE de la geometrie, et
// l'extracteur ne retient un noeud que s'il a quelque chose a dire.
check("et il a neuf noeuds qui portent quelque chose",
      Object.keys(prefabs.probe.nodes).length, 9);
const noeud = (n) => prefabs.probe.nodes[n] || {};
// La lanterne : une lumiere PONCTUELLE de portee 50, eteinte. Ces deux
// nombres sont tout le systeme — `ProbeLantern.Awake` lit `light.range` pour
// s'en faire un maximum, puis remonte de zero en deux secondes.
check("la lanterne est ponctuelle", noeud("Lantern").light.type, 2);
check("sa portee est de cinquante", noeud("Lantern").light.range, 50);
check("et elle part eteinte", noeud("Lantern").light.enabled, false);
// Les deux cameras, a quatre-vingt-dix degres, et leurs projecteurs.
check("la camera avant voit a quatre-vingt-dix", noeud("ForwardCamera").camera.fov, 90);
check("la camera arriere aussi", noeud("RearCamera").camera.fov, 90);
check("les deux partent eteintes",
      [noeud("ForwardCamera").camera.enabled, noeud("RearCamera").camera.enabled]
        .filter(Boolean).length, 0);
check("le projecteur avant porte a six cents", noeud("ForwardCamera").light.range, 600);
check("et l'arriere brille a un demi", noeud("RearCamera").light.intensity, 0.5);
// Les trois spheres : le collider, les detecteurs, le volume de scan.
check("le collider de la sonde fait 0,45", noeud("Collider").volume.radius, 0.45);
check("ses detecteurs 0,75", noeud("Detectors").volume.radius, 0.75);
check("et son volume de scan trente", noeud("ScanVolume").volume.radius, 30);
// Le marqueur de carte : le QUATORZIEME du build, et il n'est pas dans level0.
check("la sonde porte un marqueur de carte",
      prefabs.probe.nodes.SurveyorProbe.scripts.MapMarker._label, "Probe");
// Les dix effets a duree de vie, chacun la sienne.
check("dix effets se detruisent seuls",
      Object.keys(prefabs.selfDestruct).length, 10);
check("l'explosion tient une seconde", prefabs.selfDestruct.Explosion_Fiery_Med, 1);
check("l'extinction des etoiles lointaines huit",
      prefabs.selfDestruct.DistantStarsExplosion, 8);
check("et une eclaboussure cinq", prefabs.selfDestruct.Splash_Large, 5);
// Le meteore : son explosion coute CINQUANTE, la ou le constructeur en pose
// vingt. L'instance dement sa propre valeur par defaut.
check("le meteore explose au contact",
      prefabs.touchExplosive.MoltenMeteor.damage, 50);
check("et il ignore ses collisions une demi-seconde",
      prefabs.ignoreInitialCollisions.MoltenMeteor, 0.5);
check("la supernova lointaine disparait de la carte",
      prefabs.hideInMapView.includes("DistantSupernova"), true);

// A11 : les COMMANDES. Elles sont dans l'`InputManager` de `mainData`, un
// reglage de projet qu'aucun composant ne porte — et dont `unity41-types.json`
// n'avait pas la structure. Les touches du portage etaient donc les siennes
// (docs/61-commandes.md).
//
// Le controle qui compte est le DERNIER : la table de repli de `web/src/input.js`
// doit dire exactement ce que le build dit. Sans lui, les deux derivent en
// silence et la page sans build ne se joue plus comme la page avec.
const inputCtx = new ExtractContext(env, u, "mainData", engineTypes);
const inp = extractInput(inputCtx);
check("soixante-six axes", inp.axisCount, 66);
check("regroupes en vingt-deux canaux", Object.keys(inp.channels).length, 22);
check("le pas de physique du jeu", inp.fixedTimestep, 0.016);
// Zero, et ce n'est pas un oubli : chaque corps porte son champ.
check("la gravite de Unity est nulle", (inp.gravity || []).join(","), "0,0,0");
check("sept iterations de solveur", inp.solverIterations, 7);
check("dix-huit balises", inp.tags.length, 18);
check("et le collider que l'ancrage epargne en est une",
      inp.tags.includes("ProbeDetector"), true);
check("le calque que le scan de sonde prend",
      Object.values(inp.layers).includes("BasicEffectVolume"), true);
// Les trois boutons de souris, que le portage n'avait pas lus.
check("la sonde est le clic droit",
      inp.channels.Probe.Key.pos.join(","), "mouse 1");
check("la lunette le clic du milieu",
      inp.channels.Telescope.Key.pos.join(","), "mouse 2");
check("viser un referentiel, le clic gauche",
      inp.channels["Lock On"].Key.pos.join(","), "mouse 0");
// Le saut et la montee sont DEUX canaux, sur deux touches.
check("le saut est l'espace", inp.channels.Jump.Key.pos.join(","), "space");
check("monter est la majuscule",
      inp.channels["Move Up"].Key.pos.join(","), "left shift,right shift");
check("descendre est le controle",
      inp.channels["Move Down"].Key.pos.join(","), "left ctrl,right ctrl");
// La manette : les numeros d'Unity, ceux que `gamepad.js` traduit.
check("la sonde est au bouton 5 de la manette",
      inp.channels.Probe.PC.pos.join(","), "joystick button 5");
check("et monter est un AXE, la gachette", inp.channels["Move Up"].PC.axis, 9);

// L'invariant central : la table de repli DIT ce que le build dit.
{
  const vivant = new Commandes(inp);
  const repli = new Commandes(null);
  const ecarts = [];
  for (const nom of Object.keys(COMMANDES)) {
    const a = vivant.get(nom), b = repli.get(nom);
    const cle = (c) => `${c.pos.codes.join("|")}/${c.pos.mouse.join("|")}`
      + `/${c.neg.codes.join("|")}/${JSON.stringify(c.pad)}`;
    if (cle(a) !== cle(b)) ecarts.push(`${nom}: ${cle(a)} != ${cle(b)}`);
  }
  check("la table de repli est celle du build", ecarts.join(" ; "), "");
}

// A12 : ce qui BOUCLE et ce qui ne boucle pas. Le portage jouait tout en
// boucle ; le build ne le fait pas (docs/63-boucles.md).
{
  const legacy = [], mecanim = [], sansBoucle = [];
  for (const o of env.objects({ type: "AnimationClip" })) {
    const v = ctx.readEngine(o);
    if (!v) continue;
    (v.m_AnimationType === 2 ? mecanim : legacy).push(v);
    // Les dix-neuf composants `Animation` du build sont en `WrapMode.Default` :
    // un clip en `Default` retombe donc sur `Once`.
    if (!clipLoops(v, 0)) sansBoucle.push(v.m_Name);
  }
  check("seize clips d'animation", legacy.length + mecanim.length, 16);
  check("sept legacy", legacy.length, 7);
  check("neuf Mecanim", mecanim.length, 9);
  check("quatre ne bouclent pas", sansBoucle.length, 4);
  check("et ce sont ceux du baton a guimauve",
        [...sansBoucle].sort().join(","), "PullOut,PutBack,Therm,idle");
  // Les neuf Mecanim bouclent : ce sont des inactivites, et leur entete de
  // muscle porte `m_LoopBlend`.
  check("les neuf Mecanim bouclent",
        mecanim.filter((v) => clipLoops(v, 0)).length, 9);
}

// A13 : ce qu'on tient dans la main. Les deux objets pendent sous
// `PlayerCamera`, et leurs deux lumieres ne passent pas par le glTF : elles
// sont ecrites dans `held.js`, et cet invariant les compare au build
// (docs/64-mains.md).
{
  const racines = new Set(HELD_ROOTS);
  const trouvees = [];
  for (const [gid, go] of ctx.gameObjects) {
    if (racines.has(go.m_Name)) trouvees.push(go.m_Name);
  }
  check("les deux objets en main sont dans la scene",
        trouvees.sort().join(","), "MarshmallowStick,TelescopeGUI");
  const lampes = new Map();
  for (const [gid, go] of ctx.gameObjects) {
    if (!/^(MallowLight|ThermLight)$/.test(go.m_Name)) continue;
    for (const o of ctx.componentsOf(gid, ["Light"])) {
      const v = ctx.readEngine(o);
      if (v) lampes.set(go.m_Name, v);
    }
  }
  check("les deux lumieres du baton", lampes.size, 2);
  for (const d of STICK_LIGHTS) {
    const v = lampes.get(d.name);
    check(`${d.name} est ponctuelle`, v.m_Type, 2);
    check(`${d.name} part eteinte`, !!v.m_Enabled, false);
    check(`portee de ${d.name}`, Number(v.m_Range.toFixed(3)), d.range);
    check(`intensite de ${d.name}`, Number(v.m_Intensity.toFixed(3)), d.intensity);
  }
  // La chaleur qui parcourt le clip du thermometre : `GetHeatLevel() / 40f`.
  check("quarante unites de chaleur", THERM_HEAT_SPAN, 40);
}

// A9 : mainData n'etait jamais extrait — l'ExtractContext etait construit sur
// level0 seul, et ses 989 objets ne sortaient pas.
console.time("mainData");
const mctx = new ExtractContext(env, u, "mainData", engineTypes);
const mscene = extractScene(mctx);
console.timeEnd("mainData");
check("mainData contient des objets", mscene.node_count > 0, true);
console.log("     mainData:", mscene.node_count, "noeuds,",
            mscene.component_count, "composants");

// Le JSON doit etre serialisable : ni NaN ni Infinity, que le pipeline Python
// filtrait explicitement (plusieurs champs du jeu en contiennent).
for (const [label, obj] of [["scene", scene], ["composants", comps],
                            ["solaire", solar], ["gameplay", gp],
                            ["audio", audio], ["lumieres", lighting],
                            ["mainData", mscene], ["prefabriques", prefabs],
                            ["commandes", inp]]) {
  let ok = true;
  try { JSON.stringify(obj); } catch { ok = false; }
  check(`${label} serialisable en JSON`, ok, true);
}
report();
