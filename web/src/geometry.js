// Chargement de la geometrie reelle exportee en glTF par tools/08_export_gltf.py.
//
// Les fichiers sont exportes depuis les pivots d'orbite, qui sont a l'origine
// du monde : les coordonnees internes d'un glTF sont donc deja des coordonnees
// monde. Il n'y a pas de placement par corps a faire, seulement le decalage du
// floating origin a appliquer au conteneur.
//
// Convention d'axes, etablie par mesure et non par raisonnement : l'export
// inverse Z (Unity main gauche -> glTF main droite), puis le chargeur de
// Babylon applique sa propre conversion. Le resultat net est une ROTATION de
// 180 degres autour de Y, soit X et Z inverses tous les deux :
//
//   Brittle Hollow  attendu (+11691, 0, 0)   mesure (-11716, 40, -2)
//   planete natale  attendu (0, 0, -8593)    mesure (36, -3, +8740)
//   soleil          attendu (0, 0, 0)        mesure (0, 0, 0)
//
// (les petits ecarts viennent de la mesure : c'est le barycentre des centres de
// maillages du sous-arbre, lunes comprises, pas le centre du corps.)
//
// On corrige donc par une rotation de 180 degres autour de Y, qui est sa propre
// inverse. Surtout pas par une mise a l'echelle negative : celle-ci inverserait
// l'orientation des faces.

// Quel fichier glTF contient quel corps. Les fichiers exportes depuis un pivot
// contiennent tout le sous-arbre, lunes comprises : plusieurs corps partagent
// donc le meme fichier.
export const BODY_TO_FILE = {
  GravityWell_Sun: "sun_body.gltf",
  GravityWell_HomePlanet: "timberhearth_pivot.gltf",
  GravityWell_Moon: "timberhearth_pivot.gltf",
  GravityWell_BrittleHollow: "brittlehollow_pivot.gltf",
  GravityWell_VolcanicMoon: "brittlehollow_pivot.gltf",
  GravityWell_GasGiant: "giantsdeep_pivot.gltf",
  GravityWell_Buried: "hourglasstwins_pivot.gltf",
  GravityWell_Revealed: "hourglasstwins_pivot.gltf",
  GravityWell_Quantum: "quantummoon_body.gltf",
  GravityWell_Comet: "comet_pivot.gltf",
  GravityWell_DarkBramble: "darkbramble_pivot.gltf",
};

/** Lot de geometrie correspondant a un corps, ou null. */
export function entryForBody(entries, bodyName) {
  const f = BODY_TO_FILE[bodyName];
  return f ? entries.find((e) => e.file === f) || null : null;
}

export const BODY_FILES = [
  "sun_body.gltf",
  "timberhearth_pivot.gltf",
  "brittlehollow_pivot.gltf",
  "giantsdeep_pivot.gltf",
  "hourglasstwins_pivot.gltf",
  "quantummoon_body.gltf",
  "comet_pivot.gltf",
  "darkbramble_pivot.gltf",
  "derelictdimension_body.gltf",
];

/** Charge un fichier glTF et l'enveloppe dans un conteneur. */
async function loadFile(BABYLON, scene, file) {
  const res = await BABYLON.SceneLoader.ImportMeshAsync("", "../data/gltf/", file, scene);
  const container = new BABYLON.TransformNode("geo_" + file, scene);
  container.rotation.y = Math.PI;
  for (const m of res.meshes) {
    if (!m.parent) m.parent = container;
  }
  // Les clips Mecanim decodes sortent nommes « Objet|Clip ». Ceux prefixes
  // « ~ » sont les etats que le controleur Unity ne joue pas par defaut : les
  // demarrer aussi ferait se disputer deux clips sur les memes os. Le
  // chargeur glTF n'en lance qu'un seul de son cote, d'où l'arret prealable.
  for (const g of res.animationGroups || []) {
    g.stop();
    if (!g.name.startsWith("~")) g.play(true);
  }
  const meshes = res.meshes.filter((m) => m.getTotalVertices() > 0);
  // index des noeuds par nom de GameObject : l'exporteur conserve les noms,
  // ce qui permet de retrouver un corps precis dans le sous-arbre
  const nodes = new Map();
  for (const n of res.transformNodes || []) nodes.set(n.name, n);
  for (const m of res.meshes) if (!nodes.has(m.name)) nodes.set(m.name, m);
  // La carte par nom ne garde que le premier homonyme, et Dark Bramble compte
  // quatre GameObjects « AnglerFish ». La liste complete permet de tous les
  // retrouver.
  const all = [...(res.transformNodes || []), ...res.meshes];
  return { file, container, meshes, nodes, all, center: null };
}

/**
 * Magasin de geometrie, charge a la demande.
 *
 * Tout charger au demarrage coute ~200 Mo et une demi-minute d'ecran noir,
 * pour une geometrie dont les secteurs eteignent deja les sept dixiemes (voir
 * `sectors.js`). Ce magasin branche le TELECHARGEMENT sur cette meme mesure de
 * distance : un corps se charge quand on s'en approche, pas avant.
 *
 * `entries` est le meme tableau du debut a la fin de la partie ; il se remplit
 * au fil des chargements. Les lecteurs — `entryForBody`, `syncGeometry`, les
 * secteurs — restent donc inchanges, et un corps pas encore charge se comporte
 * exactement comme un corps absent : sa sphere de substitution prend la main.
 */
export class GeometryStore {
  /**
   * @param onLoad  appele avec chaque lot des qu'il arrive : c'est la seule
   *                occasion d'appliquer ce qui, avant, se faisait une fois pour
   *                toutes au demarrage (shaders du jeu, position du conteneur)
   */
  constructor(BABYLON, scene, onLoad = null) {
    this.BABYLON = BABYLON;
    this.scene = scene;
    this.onLoad = onLoad;
    this.entries = [];
    this.pending = new Map();
    this.failed = new Set();
  }

  has(file) { return this.entries.some((e) => e.file === file); }

  /** Nombre de fichiers en cours de telechargement. */
  get busy() { return this.pending.size; }

  /**
   * Demande un fichier sans attendre. Idempotent : un fichier deja charge, deja
   * en vol ou deja en echec ne repart pas.
   * @returns la promesse en cours, ou null s'il n'y a rien a faire
   */
  request(file) {
    if (!file || this.has(file) || this.failed.has(file)) return null;
    if (this.pending.has(file)) return this.pending.get(file);
    const p = loadFile(this.BABYLON, this.scene, file)
      .then((entry) => {
        this.entries.push(entry);
        if (this.onLoad) this.onLoad(entry);
        return entry;
      })
      .catch((e) => {
        // un fichier absent est un cas normal : l'export est partiel par
        // defaut. On le retient pour ne pas le redemander a chaque image.
        console.warn("glTF absent ou illisible:", file, e.message);
        this.failed.add(file);
        return null;
      })
      .finally(() => this.pending.delete(file));
    this.pending.set(file, p);
    return p;
  }

  /** Demande plusieurs fichiers et attend qu'ils soient tous la. */
  async load(files) {
    await Promise.all(files.map((f) => this.request(f)).filter(Boolean));
    return this.entries;
  }
}

/**
 * Volumes de geometrie qui ne sont rattaches a aucun puits de gravite.
 *
 * Dark Bramble et la dimension derelicte n'apparaissent pas dans
 * `solar_system.json` : ils n'ont ni gravite ni orbite, seulement une position
 * fixe lue dans la scene (`DarkBramble_Body` a (0, 0, -20000),
 * `DerelictDimension_Body` a (0, -10000, 0)). Sans cette table, les secteurs ne
 * les verraient jamais passer et leur geometrie ne serait jamais demandee.
 *
 * Le rayon est celui qui sert de reference de distance, faute d'horizon de
 * secteur : il est mesure sur l'etendue du sous-arbre exporte.
 */
export const EXTRA_VOLUMES = [
  { file: "darkbramble_pivot.gltf", position: [0, 0, -20000], radius: 400 },
  { file: "derelictdimension_body.gltf", position: [0, -10000, 0], radius: 200 },
];

/**
 * Fichiers a charger avant la premiere image : celui du corps de depart et
 * celui du soleil, qui eclaire tout et ne pese que 0,2 Mo.
 */
export function bootFiles(homeBodyName) {
  const files = [BODY_TO_FILE[homeBodyName], "sun_body.gltf"];
  return [...new Set(files.filter(Boolean))];
}

/**
 * Charge tous les fichiers d'un coup. Conserve pour les outils hors jeu
 * (`gltf-viewer.html`) et pour les mesures avant/apres.
 */
export async function loadGeometry(BABYLON, scene, files = BODY_FILES) {
  const store = new GeometryStore(BABYLON, scene);
  await store.load(files);
  return store.entries;
}

/** Noeud d'un corps precis dans un lot (ex. "TimberHearth_Body"), ou null. */
export function findBodyNode(entry, bodyName) {
  return (entry && entry.nodes && entry.nodes.get(bodyName)) || null;
}

/**
 * Maillages appartenant a un corps precis. Un fichier de pivot contient tout le
 * sous-arbre, lunes comprises : restreindre au sous-arbre du corps evite de
 * poser des colliders sur des objets qui, eux, vont bouger sur leur orbite.
 */
export function meshesForBody(entry, bodyName, excludeRoots = []) {
  const node = findBodyNode(entry, bodyName);
  if (!node) return entry ? entry.meshes : [];
  const sub = node.getChildMeshes ? node.getChildMeshes(false) : [];
  // Les sous-arbres exclus (le vaisseau) se deplacent : leur poser des
  // colliders statiques les rendrait faux des le premier mouvement.
  const excluded = new Set();
  for (const name of excludeRoots) {
    const n = findBodyNode(entry, name);
    if (n && n.getChildMeshes) for (const m of n.getChildMeshes(false)) excluded.add(m);
    if (n) excluded.add(n);
  }
  const list = sub.filter((m) => m.getTotalVertices() > 0 && !excluded.has(m));
  return list.length ? list : (entry ? entry.meshes : []);
}

/** Centre geometrique mesure d'un lot, en coordonnees monde de la scene. */
export function measureCenter(BABYLON, entry) {
  const cs = entry.meshes.map((m) => {
    m.computeWorldMatrix(true);
    return m.getBoundingInfo().boundingBox.centerWorld;
  });
  if (!cs.length) return null;
  const c = cs.reduce((a, v) => a.add(v), BABYLON.Vector3.Zero()).scale(1 / cs.length);
  entry.center = c;
  return c;
}

/**
 * Applique le decalage du floating origin a toute la geometrie chargee.
 * La position d'un TransformNode s'exprime dans le repere parent, apres sa
 * rotation propre : le decalage s'applique donc directement, sans correction.
 */
export function syncGeometry(entries, origin) {
  for (const e of entries) {
    e.container.position.set(-origin.offset.x, -origin.offset.y, -origin.offset.z);
  }
}
