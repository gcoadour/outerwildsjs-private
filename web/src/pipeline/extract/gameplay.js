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
                // Le monde physique : 34 champs de force directionnels contre
                // 10 GravityWell, et les volumes de fluide.
                "DirectionalForceField", "SimpleFluidVolume",
                "SphereOceanFluidVolume", "SimpleFluidDetector",
                // Habitants du brouillard et de la lune quantique.
                "CorruptionAnimator", "DerelictCloaker", "AlignQuantumMoon",
                // Petites regles restees de cote : marqueurs de carte, source
                // de chaleur de la guimauve.
                "MapMarker", "HeatSource"];

// Classes dont la portee vient d'un collider et non de leurs champs, et celles
// dont l'orientation compte (un champ directionnel pousse dans SON axe).
const WITH_VOLUME = new Set(["DirectionalForceField", "SimpleFluidVolume",
                             "SphereOceanFluidVolume", "FogVolume", "HeatSource",
                             "BlackHoleVolume", "WhiteHoleVolume"]);
const ORIENTED = new Set(["DirectionalForceField", "SimpleFluidVolume"]);

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
  const wanted = new Set([...SINGLETONS, ...PLACED]);

  // Inventaire de TOUTES les classes de la scene, pas seulement de celles
  // qu'on retient. Il ne coute rien — la boucle les nomme deja pour filtrer —
  // et il repond aux questions qu'on ne peut pas trancher depuis le depot :
  // quel composant fournit l'oxygene, quel autre chauffe la guimauve. Sans lui
  // on ne sait pas si un manque est celui du portage ou celui de l'alpha.
  const inventory = {};

  for (const { obj, cls } of ctx.behaviours(null)) {
    inventory[cls] = (inventory[cls] || 0) + 1;
    if (!wanted.has(cls)) continue;
    const fields = ctx.scriptFields(obj);
    if (!fields) continue;
    const plain = ctx.plain(fields);
    const gid = ctx.ownerId(obj);
    const entry = { name: ctx.name(gid), position: ctx.worldPosition(gid), fields: plain };
    if (WITH_VOLUME.has(cls)) {
      const vol = ctx.volumeOf(gid);
      if (vol) entry.volume = vol;
    }
    if (ORIENTED.has(cls)) {
      entry.rotation = ctx.world(gid)[1].map((v) => Math.round(v * 1e6) / 1e6);
    }

    if (SINGLETONS.includes(cls) && !singletons[cls]) singletons[cls] = entry;
    if (!PLACED.includes(cls)) continue;

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
    (placed[cls] ||= []).push(entry);
  }

  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, singletons, placed,
           inventory };
}
