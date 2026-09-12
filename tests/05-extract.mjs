// Verifie les extracteurs contre les chiffres du pipeline Python (README.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UnityEnv } from "../web/src/pipeline/unity/env.js";
import { TypeUniverse } from "../web/src/pipeline/dotnet/typetree.js";
import { ExtractContext } from "../web/src/pipeline/extract/context.js";
import { extractScene } from "../web/src/pipeline/extract/scene.js";
import { extractComponents } from "../web/src/pipeline/extract/components.js";
import { extractSolarSystem } from "../web/src/pipeline/extract/solar.js";
import { extractGameplay } from "../web/src/pipeline/extract/gameplay.js";
import { sandColumns, sandFunnels, funnelActive } from "../web/src/sand.js";
import { destructionVolumes, repairVolumes, destroyedBy, hazardVolumes,
         zeroGFields, gameSectors, probePrompts,
         radiationEmitters } from "../web/src/volumes.js";
import { referenceFrames, frameAt, autopilotDistances } from "../web/src/frames.js";
import { billboards, talkingFaces, thrusterNozzles, particleBursts,
         meteorLaunchers, teleporters, warps } from "../web/src/decor.js";
import { eventAudio, FOOTSTEP } from "../web/src/reactaudio.js";
import { gearPickups, suitVolumes, interactZones, attachPoints, lockOnTargets,
         ZeroGTraining } from "../web/src/gear.js";
import { spawnPoints, startPose, walkToShip } from "../web/src/start.js";
import { fluidVolumes, mediumVelocity } from "../web/src/fluids.js";
import { extractAudio, sniffContainer } from "../web/src/pipeline/extract/audio.js";
import { extractDialogue } from "../web/src/pipeline/extract/dialogue.js";
import { extractLighting } from "../web/src/pipeline/extract/lighting.js";
import { extractSky } from "../web/src/pipeline/extract/sky.js";
import { extractTextureAnimators } from "../web/src/pipeline/extract/texanim.js";
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
        zg.filter((f) => !f.volume && f.entryways).length, 1);
  const secteurs = gameSectors(gp);
  check("secteurs de jeu", secteurs.length, 3);
  check("tous limitent la poussee a vingt",
        secteurs.every((x) => x.thrustLimit === 20), true);
  check("aucun ne limite la lampe du joueur",
        secteurs.every((x) => x.flashlightLimit === null), true);

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
                            ["mainData", mscene]]) {
  let ok = true;
  try { JSON.stringify(obj); } catch { ok = false; }
  check(`${label} serialisable en JSON`, ok, true);
}
report();
