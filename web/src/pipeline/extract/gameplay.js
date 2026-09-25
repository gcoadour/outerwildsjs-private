// Vaisseau, ressources du joueur, objets interactifs, textes lisibles, secteurs.
// Portage de tools/09_gameplay.py.

const SINGLETONS = ["PlayerResources", "JetpackThrusterModel", "ShipThrusterModel",
                    "ThrusterModel", "ShipDamageController", "PlayerCharacterController",
                    // `_loopDurationInMinutes` vaut 18 dans la scene, et le
                    // portage avait ecrit 20 de memoire (docs/88-boucle.md).
                    "Autopilot", "ShipBody", "PlayerBody", "TimeLoop",
                    // `MapOpenGL` dessine les orbites de la carte : cinq
                    // cercles, une couleur par corps, et l'ELLIPSE de la
                    // comete. Le portage tracait tout d'un meme gris invente
                    // (docs/100-carte.md).
                    "MapOpenGL"];
const PLACED = ["InteractReceiver", "ReadableObject", "PlanetoidSector",
                "OWAudioSource", "Conversation", "AudioTransmitter", "SpawnPoint",
                "QuantumMoon", "QuantumOrbit", "QuantumFogBoundary", "FogVolume",
                "FogLight", "MakeChildrenBreakable", "SectorData",
                "DetachableFragment", "BlackHoleVolume", "WhiteHoleVolume",
                "BrambleManager", "AnglerfishController", "FogCloak",
                "DirectionalForceField", "SingleFieldDetector",
                "SimpleFluidVolume", "SphereOceanFluidVolume", "SimpleFluidDetector",
                "AlignQuantumMoon", "CorruptionAnimator", "DerelictCloaker",
                "NoiseSensor", "RemoteFlightConsole", "SatelliteSnapshotController",
                "ChildColliderLOD", "CreateLODGroup", "LODLayer", "LODBiasManager",
                // Le sable des jumelles : deux niveaux et un entonnoir, quatre
                // nombres chacun. C'est la mecanique propre du lieu, et le
                // recensement des classes posees l'a trouvee sans lecteur.
                "SandLevelController", "SandFunnelController",
                // Ou l'on meurt, et comment on repare : deux familles de
                // volumes que le portage decidait a sa place (web/src/volumes.js).
                "DestructionVolume", "RepairVolume",
                // --- ce que docs/44-reste-a-migrer.md demandait, par lot ---
                //
                // §1 les referentiels : le build DECLARE son referentiel par
                // volume, la ou le portage le deduisait de la gravite dominante.
                "MajorReferenceFrameVolume", "ReferenceFrameVolume",
                "AttachOnAwake", "MatchInitialMotion", "FieldInheritor",
                // §2 les decalcomanies : la geometrie est deja exportee, il
                // manque le materiau qui les pose SUR la paroi.
                "DS_Decals", "DS_DecalsMeshRenderer", "DS_DecalProjector",
                // §3 la vie du decor : les visages, les panneaux, les
                // reacteurs, les six passages anciens et les meteores.
                "FaceActiveCamera", "FacePlayerWhenTalking",
                "ThrusterParticlesBehavior", "RandomParticleBursts",
                "AncientTeleporter", "AncientTeleportReceiver", "MeteorLauncher",
                "DerelictWarp", "Elevator", "HatchController", "BlinkingRenderer",
                // §4 les volumes et zones de jeu.
                "InteractZone", "SuitBarrier", "SuitRemovalVolume", "HazardVolume",
                "DarkZone", "InterferenceVolume", "ZeroGField", "ZeroGSector",
                // `SunlessZone` eteint l'ambiance globale, et le portage
                // prenait `DarkZone` pour elle : deux classes, deux evenements,
                // deux usages. `EntrywayTrigger` est leur forme reelle — un
                // SEUIL qu'on franchit dans un sens (docs/83-seuils.md).
                "SunlessZone", "EntrywayTrigger",
                // La sphere de l'observatoire qui remet la simulation a zero :
                // armee au premier tour, elle n'attend que les codes de
                // lancement (docs/91-remise-a-zero.md).
                "ResetSimulationTrigger",
                "MajorSector", "ProbePromptTrigger", "TelescopePromptTrigger",
                "RadiationEmitter", "ObservatoryMap",
                // §5 le son reactif : le jeu repond a ce qu'on FAIT.
                "PlayerMovementAudio", "TurbulenceAudio", "ThrusterAudio",
                "SpacesuitAudioController", "PlayerAudioEffects",
                "UIAudioController", "RepairAudioController",
                "TravelMusicController", "EndOfTimeMusicController",
                // §7 le joueur et son equipement : la combinaison, la sonde et
                // la minicarte se RAMASSENT.
                "GearPickup", "PlayerLockOnTargeting", "ZeroGTrainingManager",
                "PlayerAttachPoint", "LandingPadSensor",
                // §8 les impostures de planete, gardees pour ce qu'elles disent.
                "LODCameraSnapshot",
                // --- la queue du recensement (docs/49-queue.md) -------------
                //
                // Ce qui restait apres les six lots, une fois les COMMENTAIRES
                // retires du comptage (docs/47) : plus une famille, une queue.
                // Quatre de ces classes se lisent, deux se mesurent et se
                // ferment.
                //
                // La carte DECLARE ses marqueurs : treize, avec leurs vrais
                // noms de jeu. Le portage les deduisait de la gravite et
                // affichait les noms internes (`Comet_Body` pour « The Nomad »).
                "MapMarker",
                // Le chainon manquant de shipdamage.js, ecrit en toutes
                // lettres dans son commentaire : « elle passe par
                // EngineComponent, qui n'est pas lu ».
                "EngineComponent",
                // Le pivot des tornades : une lente culbute dont la vitesse est
                // TIREE au reveil, pas serialisee.
                "TornadoPivotController",
                // Trois objets qui suivent un autre transform.
                "MatchTransform",
                // Et deux qu'on extrait pour pouvoir dire, chiffres en main,
                // qu'il n'y a rien a en faire.
                "DisposableContainer", "InertiaTensorCalibrator",
                // On allume en REGARDANT : une mecanique entiere de Dark
                // Bramble, sans invite ni touche, que rien ne signalait
                // (docs/50-regard.md).
                "GazeSwitch", "GazeWebAnimator", "EnergyGate",
                // La tour de lancement et ce qui va avec : le terminal qui
                // refuse, l'ascenseur qui monte de 31,5 unites en 5 secondes,
                // les trois capteurs qui decident si l'on est POSE, et l'entree
                // du musee qui se rejoue apres une pause (docs/51-tour.md).
                "LaunchTerminal", "LaunchElevatorController",
                "LandingPadManager", "MuseumEntryway",
                // Le lot « interface » de docs/44, pour ce qui n'est pas une
                // question de mise en page : le casque qui traine, l'alarme a
                // trente pour cent, les voyants qui clignotent, les huit
                // invites de la guimauve (docs/52-casque.md).
                "RoastPromptEvent", "MarshmallowStick", "HUDHelmet",
                "MasterAlarm", "HUDDamageDisplay", "NotificationManager",
                // La seule surface du build qui declare ECRASER, et c'est elle
                // qui porte la mort par compression : le sable montant
                // (docs/53-joueur.md).
                "Surface", "PlayerCompressionSensor", "PlayerNoiseMaker",
                "PlayerState", "FirstPersonManipulator",
                // Ce qui pilote la lumiere GLOBALE et les coquilles sonores
                // (docs/54-lumiere.md).
                "AmbientLightManager", "ExternalLightController", "FadeLight",
                "DayNightTracker", "AudioShell", "FadeInAudioOnAwake",
                // La fin de la queue : ce qui suit un autre corps, et ce qui
                // clignote (docs/55-attaches.md).
                "AlignWithTargetBody", "BlinkingRenderer", "BrokenNode",
                "HatchController", "WaterEffectVolume",
                // Les six buses du VAISSEAU, nommees par leur direction
                // (docs/58-suivi.md).
                "ThrusterParticleController",
                // Le volume compose et ses declencheurs enfants : une entree,
                // une sortie, quel que soit le nombre d'enfants traverses.
                "CompoundTriggerVolume", "ChildTriggerVolume", "SandstormVolume",
                // Ce qui bouge quand on ne le regarde PAS (docs/71-quantique.md).
                // La statue et le parent des objets planaires etaient dans la
                // scene depuis toujours ; aucun des deux n'etait extrait, donc
                // le recensement ne les comptait ni lus ni non lus — ils
                // n'etaient simplement pas la.
                "QuantumStatue", "MakeChildrenPlanarQuantum",
                // La sonde ancienne : UNE instance, et son `FixedUpdate` tient
                // en une ligne — cinquante d'acceleration locale vers l'avant,
                // pour toujours (docs/75-chaleur.md).
                "AncientProbeController",
                // La zone de proximite du vaisseau : l'affichage des avaries
                // ne s'allume QUE dedans (docs/76-proximite.md).
                "ShipProximityVolume",
                // Le vaisseau miniature de l'observatoire : sa piste, son
                // crash, et l'enfant qui compte les deux (docs/78-modele.md).
                "ModelShipLandingSpot", "ModelShipCrashBehavior",
                "RocketKidConvoController"];

/**
 * Classes qu'on ne connait pas par leur nom exact.
 *
 * Une liste fermee ne peut pas trouver ce qu'elle ne nomme pas : la question
 * « qui fournit l'oxygene hors du vaisseau ? » n'a pas de reponse tant qu'on
 * n'a pas ouvert le build. Ces motifs ramassent donc les familles, et
 * `stats.decouvertes` dit ce qui a ete pris — c'est la reponse a la question,
 * pas une supposition sur elle.
 */
const PLACED_PATTERNS = [
  /oxygen/i,            // A11 : la source d'oxygene hors du vaisseau
  /fluid|ocean/i,       // A7  : volumes de fluide, quel que soit leur nom
  /forcefield/i,        // A6  : champs directionnels et leurs variantes
  /heatsource/i,        // A15 : la chaleur qui grille la guimauve
  /convocontroller|convotrigger/i,   // A15 : les arbres de dialogue par reference
  /^lod|lodgroup/i,     // A8  : la hierarchie de niveau de detail
];

/**
 * Volumes qu'on veut mesurer : leur collider dit leur portee.
 *
 * La premiere moitie ramasse des FAMILLES par leur nom ; la seconde nomme les
 * classes du lot de `docs/44-reste-a-migrer.md` dont la portee vit elle aussi
 * dans un collider — un champ d'apesanteur, une barriere de combinaison, un
 * passage ancien. Les nommer une par une plutot que d'elargir les motifs evite
 * d'ajouter un volume a des classes qui n'en avaient pas et dont personne ne
 * l'a mesure.
 */
const WANT_VOLUME = new RegExp([
  "forcefield|fluid|ocean|oxygen|heatsource|zone|volume",
  // `PlanetoidSector` manquait, et c'est ce trou qui a fait inventer au
  // portage un « horizon x 1,5 » : la sphere de declenchement du secteur
  // etait la, mesuree dans la scene, et l'extraction ne la sortait pas
  // (docs/82-secteur-majeur.md).
  "|^(PlanetoidSector|ZeroGField|ZeroGSector|MajorSector|SuitBarrier",
  "|ProbePromptTrigger",
  "|TelescopePromptTrigger|AncientTeleporter|AncientTeleportReceiver",
  "|RadiationEmitter|DerelictWarp|GearPickup|LandingPadSensor",
  "|PlayerAttachPoint|LODCameraSnapshot|SunlessZone|EntrywayTrigger",
  // `GazeSwitch.Awake` lit son rayon dans son SphereCollider : sans le volume,
  // la loi du regard n'a aucune portee.
  "|GazeSwitch|MuseumEntryway|Surface|AudioShell|ResetSimulationTrigger",
  // `HatchController.OnEntry` est un declencheur, et son rayon est celui du
  // collider de « HatchControls » : c'est lui qui dit quand la trappe se
  // referme derriere vous (docs/116-trappe.md).
  "|LaunchTerminal|LaunchElevatorController|HatchController",
  // `FirstPersonManipulator` vise le collider de l'`InteractReceiver` : c'est
  // la capsule d'un personnage qu'on regarde pour lui parler (docs/132).
  "|InteractReceiver)$",
].join(""), "i");

/**
 * Composants dont l'ORIENTATION compte autant que la position.
 *
 * Un `SpawnPoint` ne dit pas seulement ou l'on apparait : son axe Z dit dans
 * quelle direction on regarde au premier instant. La position seule etait
 * extraite, et le portage tournait donc la tete au hasard (docs/38-depart.md).
 */
// `ShipBody` s'y ajoute : les capteurs de pad sont ses enfants, et ramener
// leur position dans SON repere demande sa pose de repos (docs/89-pose.md).
// `WhiteHoleVolume` aussi : `ForceWarp` sort DROIT DEVANT lui, et
// `GetRandomExitTrajectory` incline autour de son avant et de son haut. Sans
// son orientation, il n'y a pas de « devant » a suivre (docs/102-trou-blanc.md).
// `AncientTeleportReceiver` enfin : `RelocateBody` pose la ROTATION du
// recepteur sur le corps qui arrive. On ne debarque pas dans la direction ou
// l'on marchait, on debarque tourne vers ce que le recepteur regarde
// (docs/111-passages.md).
const WANT_ROTATION =
  /^(spawnpoint|shipbody|whiteholevolume|ancientteleportreceiver)$/i;

/** Composants dont le PARENT designe ce qu'ils commandent. */
const WANT_PARENTS = /^EntrywayTrigger$/i;

/**
 * La position MONDE du GameObject qu'un PPtr de composant designe.
 *
 * Les six buses du vaisseau s'appellent TOUTES `Thruster_Small` : leur nom ne
 * les distingue pas, leur place si. C'est le meme cas que les nuages
 * (docs/48-ciel-mesure.md) et les pivots de tornade (docs/49-queue.md).
 */
function positionDuComposant(ctx, ptr) {
  if (!ptr || !ptr.pathId) return null;
  const o = ctx.env.deref(ptr, ctx.sceneObj);
  const v = o && ctx.readEngine(o);
  const gid = v && v.m_GameObject ? v.m_GameObject.pathId : 0;
  if (!gid || !ctx.transformOf.has(gid)) return null;
  return ctx.world(gid)[0].map((x) => Math.round(x * 1000) / 1000);
}

export function extractGameplay(ctx) {
  // OWRigidbody -> nom du GameObject, pour resoudre les references entre
  // composants (_attachedBody d'une orbite quantique, par exemple).
  const rbOwner = new Map();
  for (const { obj, cls } of ctx.behaviours(["OWRigidbody"])) {
    const nm = ctx.name(ctx.ownerId(obj));
    if (nm) rbOwner.set(ctx.refKey(obj), nm);
  }

  const singletons = {};
  const placed = {};
  const discovered = {};
  // Controleurs dont au moins un pointeur ne vise PAS un texte : c'est ce que
  // l'ancien index par path_id nu laissait passer pour un arbre.
  const ecartes = new Set();
  const named = new Set([...SINGLETONS, ...PLACED]);
  const keep = (cls) => named.has(cls) || PLACED_PATTERNS.some((p) => p.test(cls));

  for (const { obj, cls } of ctx.behaviours(keep)) {
    const fields = ctx.scriptFields(obj);
    if (!fields) continue;
    const plain = ctx.plain(fields);
    const gid = ctx.ownerId(obj);
    const entry = { name: ctx.name(gid), position: ctx.worldPosition(gid), fields: plain };
    // A QUEL CORPS cet objet appartient. La scene pose neuf GameObject nommes
    // « RFVolume » et trente « Decals Mesh Renderer » : le nom seul ne designe
    // rien, et c'est le corps porteur qui fait la difference entre le
    // referentiel de Timber Hearth et celui du vaisseau pose dessus.
    const body = ctx.bodyOf(gid);
    // Emis meme quand il vaut le nom de l'objet : `PlayerLockOnTargeting` est
    // pose SUR `Player_Body`, et un champ absent se lirait « sans corps »
    // plutot que « le corps, c'est moi ».
    if (body) entry.body = body;

    // L'ORIENTATION se pose AVANT le tri : un singleton en a besoin aussi, et
    // le `continue` qui suit la lui refusait. `ShipBody` en est le cas : ses
    // capteurs de pad sont ses enfants, et ramener leurs positions dans son
    // repere demande sa pose de repos. Le champ manquait sans que rien ne le
    // dise — l'offset sortait en coordonnees MONDE, et les jambes du vaisseau
    // se retrouvaient devant lui (docs/89-pose.md).
    if (WANT_ROTATION.test(cls)) {
      const [, rot] = ctx.world(gid);
      entry.rotation = rot.map((v) => Math.round(v * 1e6) / 1e6);
    }

    if (SINGLETONS.includes(cls) && !singletons[cls]) singletons[cls] = entry;
    if (!PLACED.includes(cls) && !PLACED_PATTERNS.some((p) => p.test(cls))) continue;
    if (!PLACED.includes(cls)) discovered[cls] = (discovered[cls] || 0) + 1;

    // Un champ de force, un volume de fluide ou une zone d'oxygene n'a pas de
    // portee dans ses champs : elle est dans le collider pose a cote.
    if (WANT_VOLUME.test(cls)) {
      const vol = ctx.volumeOf(gid);
      if (vol) entry.volume = vol;
      if (!entry.rotation) {
        const [, rot] = ctx.world(gid);
        entry.rotation = rot.map((v) => Math.round(v * 1e6) / 1e6);
      }
    }

    // A QUI ce seuil appartient. `OWEffectVolume.Awake` prend ses
    // `EntrywayTrigger` par `GetComponentsInChildren` : le lien est dans la
    // HIERARCHIE, pas dans un champ, et le nom du corps porteur ne suffit pas
    // — Timber Hearth porte les deux grottes, le musee et six autres seuils.
    if (WANT_PARENTS.test(cls)) {
      const chain = ctx.ancestors(gid).filter(Boolean);
      if (chain.length) entry.parents = chain;
    }

    // Reference vers un corps : on remplace le pointeur par son nom.
    for (const [k, v] of Object.entries(plain)) {
      if (v && typeof v === "object" && "$ref" in v && rbOwner.has(v.$ref)) {
        (entry.refs ||= {})[k] = rbOwner.get(v.$ref);
      }
    }
    // Reference vers un COMPOSANT de la scene : on emet l'objet qui le porte.
    //
    // C'est le cas general — les references d'un script visent des scripts —
    // et il restait un identifiant nu. Sans lui, `AncientTeleporter._receiver`
    // ne dit pas ou l'on arrive : six passages qui ne menent nulle part.
    for (const [k, v] of Object.entries(fields)) {
      if (!v || typeof v !== "object" || !("pathId" in v) || !v.pathId) continue;
      const info = ctx.ownerInfo(v);
      if (info && info.name) (entry.targets ||= {})[k] = info;
    }
    // Texte des objets lisibles, resolu depuis le TextAsset.
    if (cls === "ReadableObject") {
      const t = ctx.textFor(fields._displayTextAsset);
      if (t !== null) entry.text = t;
      else if (plain._displayText) entry.text = plain._displayText;
    }
    // Fiches de l'ordinateur de bord : une notice par lieu, lisible seulement
    // apres avoir explore l'endroit.
    if (cls === "SectorData") {
      const t = ctx.textFor(fields._description);
      if (t !== null) entry.text = t;
    }
    // Arbres de dialogue portes par un controleur de personnage. Le portage
    // les cherchait par NOM (« ...WithCodes », « ...Preflight ») faute de les
    // avoir sous la main ; ce sont pourtant des references directes.
    //
    // INVARIANT : ce qu'on RETIENT comme arbre est un TextAsset, et rien
    // d'autre. `ctx.texts` est desormais indexe par `fichier:path_id`, et le
    // pointeur suit son `fileId` : un `Transform` d'un autre fichier ne peut
    // plus se faire passer pour un arbre parce que son path_id tombe sur celui
    // d'un texte de la scene (docs/36-audit.md §2.7).
    //
    // Un controleur peut en revanche viser autre chose qu'un texte, et c'est
    // legitime : `SecondLoopConvoTrigger._rocketScientistConversation` pointe
    // sur le composant `Conversation` de la zone du scientifique (level0:23486),
    // pas sur un arbre. Ces pointeurs-la sont ecartes des arbres et NOMMES dans
    // `stats`, champ compris : c'est la liste, et non son absence, qui garde
    // contre le retour du `fileId` perdu.
    for (const [k, v] of Object.entries(plain)) {
      if (!v || typeof v !== "object" || !("$ref" in v)) continue;
      if (v.$ref !== null && ctx.texts.has(v.$ref)) (entry.trees ||= {})[k] = v.$ref;
      else if (/convocontroller|convotrigger/i.test(cls)) ecartes.add(`${cls}.${k}`);
    }
    // `ThrusterParticleController` designe ses six buses par pointeur, et les
    // six systemes portent le MEME nom : on resout en positions.
    if (cls === "ThrusterParticleController") {
      const brut = ctx.scriptFields(obj) || {};
      entry.nozzles = {};
      for (const [k, dir] of [["_forwardThruster", "forward"], ["_rearThruster", "rear"],
                              ["_rightThruster", "right"], ["_leftThruster", "left"],
                              ["_upThruster", "up"], ["_downThruster", "down"]]) {
        entry.nozzles[dir] = positionDuComposant(ctx, brut[k]);
      }
    }
    // Ce qui bouge quand on ne le regarde pas : ces deux classes agissent sur
    // leur DESCENDANCE, pas sur leurs champs — et `MakeChildrenPlanarQuantum`
    // n'a aucun champ du tout (docs/71-quantique.md).
    if (cls === "MakeChildrenPlanarQuantum" || cls === "QuantumStatue") {
      entry.children = ctx.childrenOf(gid);
    }
    // La sonde ancienne designe son corps par pointeur, et c'est SUR ce corps
    // que l'acceleration s'applique — pas sur le controleur.
    if (cls === "AncientProbeController") {
      const brut = ctx.scriptFields(obj) || {};
      const info = ctx.ownerInfo(brut._probeBody);
      if (info) entry.probeBody = info;
      const [, rot] = ctx.world(gid);
      entry.rotation = rot.map((v) => Math.round(v * 1e6) / 1e6);
    }
    // Un script sur un GameObject inactif ne tourne pas. On le garde — trois
    // classes sont rallumees en cours de partie (`SetActive`) —, marque.
    if (!ctx.actif(gid)) entry.active = false;
    (placed[cls] ||= []).push(entry);
  }

  // Groupes de niveau de detail : ce sont des composants MOTEUR, pas des
  // scripts. Ils ne se lisent donc que si la structure de la classe 205 figure
  // dans unity41-types.json — sinon rien n'est emis, et `lod.js` garde son
  // seuil unique. Voir tools/16_unity_types.py.
  for (const o of ctx.env.objects({ type: "LODGroup", file: ctx.sceneFile })) {
    const v = ctx.readEngine(o);
    if (!v || !v.m_GameObject) continue;
    const gid = v.m_GameObject.pathId;
    const levels = (v.m_LODs || []).map((l) => l.screenRelativeHeight)
      .filter((h) => typeof h === "number");
    if (!levels.length) continue;
    (placed.LODGroup ||= []).push({
      name: ctx.name(gid), position: ctx.worldPosition(gid),
      fields: { _screenRelativeHeights: levels },
    });
  }

  const stats = { classes: Object.keys(placed).length };
  if (ecartes.size) stats["references non textuelles"] = [...ecartes].sort();
  if (Object.keys(discovered).length) stats.decouvertes = discovered;
  for (const [k, v] of Object.entries(placed)) stats[k] = v.length;

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, singletons, placed, stats };
}
