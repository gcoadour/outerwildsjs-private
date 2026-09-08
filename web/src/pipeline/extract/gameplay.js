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
                "ChildColliderLOD", "CreateLODGroup", "LODLayer", "LODBiasManager"];

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

/** Volumes qu'on veut mesurer : leur collider dit leur portee. */
const WANT_VOLUME = /forcefield|fluid|ocean|oxygen|heatsource|zone|volume/i;

export function extractGameplay(ctx) {
  // OWRigidbody -> nom du GameObject, pour resoudre les references entre
  // composants (_attachedBody d'une orbite quantique, par exemple).
  const rbOwner = new Map();
  for (const { obj, cls } of ctx.behaviours(["OWRigidbody"])) {
    const nm = ctx.name(ctx.ownerId(obj));
    if (nm) rbOwner.set(obj.pathId, nm);
  }

  const singletons = {};
  const placed = {};
  const discovered = {};
  const named = new Set([...SINGLETONS, ...PLACED]);
  const keep = (cls) => named.has(cls) || PLACED_PATTERNS.some((p) => p.test(cls));

  for (const { obj, cls } of ctx.behaviours(keep)) {
    const fields = ctx.scriptFields(obj);
    if (!fields) continue;
    const plain = ctx.plain(fields);
    const gid = ctx.ownerId(obj);
    const entry = { name: ctx.name(gid), position: ctx.worldPosition(gid), fields: plain };

    if (SINGLETONS.includes(cls) && !singletons[cls]) singletons[cls] = entry;
    if (!PLACED.includes(cls) && !PLACED_PATTERNS.some((p) => p.test(cls))) continue;
    if (!PLACED.includes(cls)) discovered[cls] = (discovered[cls] || 0) + 1;

    // Un champ de force, un volume de fluide ou une zone d'oxygene n'a pas de
    // portee dans ses champs : elle est dans le collider pose a cote.
    if (WANT_VOLUME.test(cls)) {
      const vol = ctx.volumeOf(gid);
      if (vol) entry.volume = vol;
      const [, rot] = ctx.world(gid);
      entry.rotation = rot.map((v) => Math.round(v * 1e6) / 1e6);
    }

    // Reference vers un corps : on remplace le pointeur par son nom.
    for (const [k, v] of Object.entries(plain)) {
      if (v && typeof v === "object" && "$ref" in v && rbOwner.has(v.$ref)) {
        (entry.refs ||= {})[k] = rbOwner.get(v.$ref);
      }
    }
    // Texte des objets lisibles, resolu depuis le TextAsset.
    if (cls === "ReadableObject") {
      const ref = plain._displayTextAsset;
      if (ref && ctx.texts.has(ref.$ref)) entry.text = ctx.texts.get(ref.$ref);
      else if (plain._displayText) entry.text = plain._displayText;
    }
    // Fiches de l'ordinateur de bord : une notice par lieu, lisible seulement
    // apres avoir explore l'endroit.
    if (cls === "SectorData") {
      const ref = plain._description;
      if (ref && ctx.texts.has(ref.$ref)) entry.text = ctx.texts.get(ref.$ref);
    }
    // Arbres de dialogue portes par un controleur de personnage. Le portage
    // les cherchait par NOM (« ...WithCodes », « ...Preflight ») faute de les
    // avoir sous la main ; ce sont pourtant des references directes, et un
    // TextAsset se nomme ici sans ambiguite.
    for (const [k, v] of Object.entries(plain)) {
      if (v && typeof v === "object" && "$ref" in v && ctx.texts.has(v.$ref)) {
        (entry.trees ||= {})[k] = v.$ref;
      }
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
  if (Object.keys(discovered).length) stats.decouvertes = discovered;
  for (const [k, v] of Object.entries(placed)) stats[k] = v.length;

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, singletons, placed, stats };
}
