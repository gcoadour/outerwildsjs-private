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
    // INVARIANT : ce que vise un controleur de dialogue est un TextAsset, et
    // rien d'autre. `ctx.texts` est desormais indexe par `fichier:path_id`, et
    // le pointeur suit son `fileId` : un `Transform` d'un autre fichier ne
    // peut plus se faire passer pour un arbre parce que son path_id tombe sur
    // celui d'un texte de la scene (docs/36-audit.md §2.7).
    for (const [k, v] of Object.entries(plain)) {
      if (!v || typeof v !== "object" || !("$ref" in v)) continue;
      if (v.$ref !== null && ctx.texts.has(v.$ref)) (entry.trees ||= {})[k] = v.$ref;
      else if (/convocontroller|convotrigger/i.test(cls)) ecartes.add(cls);
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
