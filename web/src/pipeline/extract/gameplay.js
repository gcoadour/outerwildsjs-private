// Vaisseau, ressources du joueur, objets interactifs, textes lisibles, secteurs.
// Portage de tools/09_gameplay.py.

const SINGLETONS = ["PlayerResources", "JetpackThrusterModel", "ShipThrusterModel",
                    "ThrusterModel", "ShipDamageController", "PlayerCharacterController",
                    "Autopilot", "ShipBody", "PlayerBody"];
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
                "MajorSector", "ProbePromptTrigger", "TelescopePromptTrigger",
                "RadiationEmitter",
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
                "LODCameraSnapshot"];

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
  "|^(ZeroGField|ZeroGSector|MajorSector|SuitBarrier|ProbePromptTrigger",
  "|TelescopePromptTrigger|AncientTeleporter|AncientTeleportReceiver",
  "|RadiationEmitter|DerelictWarp|GearPickup|LandingPadSensor",
  "|PlayerAttachPoint|LODCameraSnapshot)$",
].join(""), "i");

/**
 * Composants dont l'ORIENTATION compte autant que la position.
 *
 * Un `SpawnPoint` ne dit pas seulement ou l'on apparait : son axe Z dit dans
 * quelle direction on regarde au premier instant. La position seule etait
 * extraite, et le portage tournait donc la tete au hasard (docs/38-depart.md).
 */
const WANT_ROTATION = /spawnpoint/i;

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

    if (SINGLETONS.includes(cls) && !singletons[cls]) singletons[cls] = entry;
    if (!PLACED.includes(cls) && !PLACED_PATTERNS.some((p) => p.test(cls))) continue;
    if (!PLACED.includes(cls)) discovered[cls] = (discovered[cls] || 0) + 1;

    // Un champ de force, un volume de fluide ou une zone d'oxygene n'a pas de
    // portee dans ses champs : elle est dans le collider pose a cote.
    if (WANT_VOLUME.test(cls)) {
      const vol = ctx.volumeOf(gid);
      if (vol) entry.volume = vol;
    }
    if (WANT_VOLUME.test(cls) || WANT_ROTATION.test(cls)) {
      const [, rot] = ctx.world(gid);
      entry.rotation = rot.map((v) => Math.round(v * 1e6) / 1e6);
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
