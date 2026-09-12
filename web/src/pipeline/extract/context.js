// Contexte partage par les extracteurs : l'equivalent de tools/lib_ow.py.
//
// Indexe une fois ce que chaque extracteur redemanderait : GameObject et
// Transform de la scene, arbres de type par classe, noms d'assets, textes.

import { readTypeTree } from "../unity/typetree.js";
import { monoBehaviourTree } from "../dotnet/typetree.js";

/** Multiplication de quaternions. */
export function qmul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
          a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
          a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
          a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}

/** Rotation d'un vecteur par un quaternion. */
export function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

const round = (v, n) => (Number.isFinite(v) ? Number(v.toFixed(n)) : null);

export class ExtractContext {
  /**
   * @param {UnityEnv} env
   * @param {TypeUniverse} universe
   * @param {string} sceneFile  fichier de scene principal
   */
  constructor(env, universe, sceneFile = "level0", engineTypes = null) {
    this.env = env;
    this.universe = universe;
    this.sceneFile = sceneFile;
    // Structures des classes moteur (unity41-types.json), injectees plutot
    // qu'importees : le Worker les recupere par fetch, les tests par le disque.
    this.engineTypes = (engineTypes && engineTypes.classes) || {};
    this.trees = new Map();
    this.worldCache = new Map();

    // --- index de la scene ---
    this.gameObjects = new Map();     // path_id -> GameObject lu
    this.transformOf = new Map();     // path_id de GameObject -> Transform lu
    this.transformId = new Map();     // path_id de GameObject -> path_id du Transform
    for (const o of env.objects({ file: sceneFile })) {
      if (o.type === "GameObject") {
        const v = env.read(o);
        if (v) this.gameObjects.set(o.pathId, v);
      } else if (o.type === "Transform") {
        const v = env.read(o);
        if (!v || !v.m_GameObject) continue;
        this.transformOf.set(v.m_GameObject.pathId, v);
        this.transformId.set(v.m_GameObject.pathId, o.pathId);
      }
    }

    // --- noms d'assets, pour rendre les PPtr lisibles ---
    //
    // Indexe par cle canonique `fichier:path_id`. Un path_id NU se repete d'un
    // fichier a l'autre : indexer dessus rendait la table ambigue, et c'est
    // exactement ce qui faisait resoudre les arbres de dialogue des
    // `*ConvoController` vers des os de squelette (`anglerfish_rig:UpTail4`).
    // Voir docs/36-audit.md §2.7.
    this.assetNames = new Map();
    for (const type of ["Texture2D", "Mesh", "Material", "AudioClip"]) {
      for (const o of env.objects({ type })) {
        const n = this.assetName(o);
        if (n !== null) this.assetNames.set(refKey(o), n);
      }
    }

    // --- textes ---
    this.texts = new Map();
    for (const o of env.objects({ type: "TextAsset" })) {
      const v = env.read(o);
      if (v) this.texts.set(refKey(o), new TextDecoder("utf-8").decode(v.m_Script));
    }
  }

  /** Le fichier de la scene, comme objet — le point de depart de tout PPtr. */
  get sceneObj() { return this.env.get(this.sceneFile); }

  /**
   * Cle canonique d'un objet resolu : `fichier:path_id`.
   *
   * Elle est la SEULE facon sure de designer un objet : les path_id se
   * repetent d'un fichier a l'autre, et un pointeur qui ignore son `fileId`
   * tombe sur l'homonyme du fichier courant.
   */
  refKey(obj) { return refKey(obj); }

  /** Suit un PPtr en tenant compte de son `fileId`, et rend sa cle. */
  refOf(ptr, file = null) {
    const t = this.env.deref(ptr, file || this.sceneObj);
    return t ? refKey(t) : null;
  }

  /** Texte d'un TextAsset vise par un PPtr, ou null si la cible n'en est pas un. */
  textFor(ptr, file = null) {
    const key = this.refOf(ptr, file);
    return key !== null && this.texts.has(key) ? this.texts.get(key) : null;
  }

  /** Arbre de type d'une classe de script, memoise. */
  tree(cls) {
    if (!this.trees.has(cls)) this.trees.set(cls, monoBehaviourTree(this.universe, cls));
    return this.trees.get(cls);
  }

  /**
   * Nom d'un asset, sans le decoder entierement : la chaine est en tete de
   * Texture2D, Mesh, Material, AudioClip, Shader et Font.
   */
  assetName(obj) {
    try {
      return obj.file.reader(obj).string();
    } catch {
      return null;
    }
  }

  /** Lit un objet moteur avec sa structure Unity. */
  readEngine(obj) {
    if (!obj) return null;
    const nodes = this.engineTypes[obj.type];
    if (!nodes) return this.env.read(obj);
    try {
      return readTypeTree(obj.file.reader(obj), nodes, obj.file).value;
    } catch {
      return null;
    }
  }

  /** Nom de la classe C# d'un MonoBehaviour. */
  scriptName(o) { return this.env.scriptName(o); }

  /** Champs serialises d'un MonoBehaviour, ou null si illisible. */
  fields(o) {
    const cls = this.scriptName(o);
    const nodes = cls && this.tree(cls);
    if (!nodes) return null;
    try {
      return readTypeTree(o.file.reader(o), nodes, o.file).value;
    } catch {
      return null;
    }
  }

  /** Champs propres au script, sans l'entete m_*. */
  scriptFields(o) {
    const v = this.fields(o);
    if (!v) return null;
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!k.startsWith("m_")) out[k] = x;
    return out;
  }

  /** GameObject porteur d'un composant. */
  ownerId(o) {
    const h = this.env.read(o) || this.env.monoHeader(o);
    return h && h.m_GameObject ? h.m_GameObject.pathId : 0;
  }

  /**
   * Composants d'un GameObject, par type moteur.
   *
   * Le GameObject porte la liste de ses composants ; c'est le seul chemin qui
   * mene d'un MonoBehaviour au collider pose a cote de lui. Sans lui, un
   * DirectionalForceField ou un volume de fluide n'a ni forme ni taille : le
   * champ vit dans le collider, pas dans le script.
   */
  *componentsOf(gid, types = null) {
    const go = this.gameObjects.get(gid);
    if (!go || !go.m_Component) return;
    const want = types ? new Set(types) : null;
    const file = this.env.get(this.sceneFile);
    for (const c of go.m_Component) {
      const o = this.env.deref(c.component, file);
      if (!o || (want && !want.has(o.type))) continue;
      yield o;
    }
  }

  /**
   * Volume d'un GameObject, deduit de ses colliders.
   *
   * On rend un rayon englobant plutot que la forme exacte : le moteur teste des
   * appartenances a des volumes, pas des contacts. L'echelle monde du
   * GameObject est appliquee — un collider de rayon 1 sur un objet a l'echelle
   * 500 fait bien un volume de 500.
   *
   * @returns {shape, radius, center, size} ou null si l'objet n'a pas de volume
   */
  volumeOf(gid) {
    const [, , scl] = this.world(gid);
    const k = Math.max(Math.abs(scl[0]), Math.abs(scl[1]), Math.abs(scl[2])) || 1;
    for (const o of this.componentsOf(gid, ["SphereCollider", "BoxCollider",
                                            "CapsuleCollider", "MeshCollider"])) {
      const v = this.readEngine(o);
      if (!v) continue;
      const c = v.m_Center ? [v.m_Center.x, v.m_Center.y, v.m_Center.z] : [0, 0, 0];
      if (o.type === "SphereCollider" && v.m_Radius) {
        return { shape: "sphere", radius: round(v.m_Radius * k, 3),
                 center: c.map((x) => round(x * k, 3)) };
      }
      if (o.type === "BoxCollider" && v.m_Size) {
        const s = [v.m_Size.x * k, v.m_Size.y * k, v.m_Size.z * k];
        return { shape: "box", size: s.map((x) => round(x, 3)),
                 center: c.map((x) => round(x * k, 3)),
                 radius: round(Math.hypot(s[0], s[1], s[2]) / 2, 3) };
      }
      if (o.type === "CapsuleCollider" && v.m_Radius) {
        const h = Math.max(v.m_Height || 0, v.m_Radius * 2) * k;
        // `m_Direction` dit sur QUEL axe la capsule s'allonge (0=X, 1=Y, 2=Z).
        // Sans lui, les huit tornades de Giant's Deep — r=40, h=305 — se
        // lisaient comme des spheres de rayon 40 : 225 unites de colonne
        // tombaient hors du volume.
        return { shape: "capsule", radius: round(v.m_Radius * k, 3),
                 height: round(h, 3), axis: v.m_Direction ?? 1,
                 center: c.map((x) => round(x * k, 3)) };
      }
      if (o.type === "MeshCollider") return { shape: "mesh", radius: null, center: c };
    }
    return null;
  }

  name(gid) {
    const go = this.gameObjects.get(gid);
    return go ? go.m_Name : null;
  }

  /**
   * Noms des ancetres d'un GameObject, du plus haut au plus proche.
   *
   * Le nom seul ne suffit pas a designer un objet : la scene pose NEUF
   * GameObject nommes « RFVolume » et trente nommes « Decals Mesh Renderer ».
   * C'est la chaine qui dit lequel — et surtout a quel corps il appartient.
   */
  ancestors(gid, depth = 0) {
    const t = this.transformOf.get(gid);
    if (!t || depth > 64) return [];
    const parent = t.m_Father ? this.env.deref(t.m_Father, this.sceneObj) : null;
    const pt = parent ? this.env.read(parent) : null;
    if (!pt || !pt.m_GameObject) return [];
    const pid = pt.m_GameObject.pathId;
    return [...this.ancestors(pid, depth + 1), this.name(pid)];
  }

  /**
   * Corps porteur d'un objet : le premier ancetre — lui-meme compris — dont le
   * nom finit par `_Body`.
   *
   * C'est la convention du build, et elle est tenue : un `OWRigidbody` est pose
   * sur `Ship_Body`, `TimberHearth_Body`, `Twin01_Body`… Un volume de
   * referentiel ne dit pas de QUEL corps il est le referentiel autrement.
   */
  bodyOf(gid) {
    const self = this.name(gid);
    if (self && self.endsWith("_Body")) return self;
    const chain = this.ancestors(gid);
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i] && chain[i].endsWith("_Body")) return chain[i];
    }
    return null;
  }

  /**
   * Objet porteur du COMPOSANT vise par un PPtr : nom, position monde, corps.
   *
   * `plain()` sait deja nommer un pointeur qui vise un GameObject, mais un
   * pointeur qui vise un composant — `AncientTeleporter._receiver`, par
   * exemple — rendait un identifiant nu. Or c'est le cas general : les
   * references d'un script visent des scripts.
   */
  ownerInfo(ptr, file = null) {
    const target = this.env.deref(ptr, file || this.sceneObj);
    if (!target) return null;
    if (fileKey(target.file.name) !== fileKey(this.sceneFile)) return null;
    // Un pointeur de la scene ne vise pas forcement un composant : il peut
    // viser un asset (`_teleportSound`) ou un objet dont l'entete n'est pas
    // lisible. Lire l'entete d'un MonoBehaviour qui n'en est pas un leve, donc
    // on garde : ce qui ne resout pas n'a simplement pas de porteur.
    let gid = 0;
    if (this.gameObjects.has(target.pathId)) gid = target.pathId;
    else { try { gid = this.ownerId(target); } catch { return null; } }
    if (!gid || !this.gameObjects.has(gid)) return null;
    return { name: this.name(gid), position: this.worldPosition(gid),
             body: this.bodyOf(gid) };
  }

  /**
   * Transformation monde d'un GameObject : position, rotation, echelle.
   *
   * Sommer les translations locales ne suffit pas — il faut composer rotations
   * et echelles des parents, sinon un objet pose a la surface d'une planete se
   * retrouve a l'interieur.
   */
  world(gid, depth = 0) {
    if (this.worldCache.has(gid)) return this.worldCache.get(gid);
    const t = this.transformOf.get(gid);
    if (!t || depth > 64) {
      const id = [[0, 0, 0], [0, 0, 0, 1], [1, 1, 1]];
      return id;
    }
    const lp = [t.m_LocalPosition.x, t.m_LocalPosition.y, t.m_LocalPosition.z];
    const lr = [t.m_LocalRotation.x, t.m_LocalRotation.y,
                t.m_LocalRotation.z, t.m_LocalRotation.w];
    const ls = [t.m_LocalScale.x, t.m_LocalScale.y, t.m_LocalScale.z];

    let res;
    const parent = t.m_Father ? this.env.deref(t.m_Father, this.env.get(this.sceneFile)) : null;
    const parentT = parent ? this.env.read(parent) : null;
    if (!parentT || !parentT.m_GameObject) {
      res = [lp, lr, ls];
    } else {
      const [pp, pr, ps] = this.world(parentT.m_GameObject.pathId, depth + 1);
      const scaled = [lp[0] * ps[0], lp[1] * ps[1], lp[2] * ps[2]];
      const rp = qrot(pr, scaled);
      res = [[pp[0] + rp[0], pp[1] + rp[1], pp[2] + rp[2]],
             qmul(pr, lr),
             [ps[0] * ls[0], ps[1] * ls[1], ps[2] * ls[2]]];
    }
    this.worldCache.set(gid, res);
    return res;
  }

  worldPosition(gid, digits = 4) {
    return this.world(gid)[0].map((v) => round(v, digits));
  }

  /**
   * Rend une valeur serialisable en JSON. Un PPtr devient {$ref} et emporte le
   * nom de sa cible quand on le connait : un identifiant nu ne dit rien a la
   * lecture, alors qu'un nom apprend qu'un FogLight eclaire « AnglerfishLure »
   * plutot qu'« EscapePodBeacon » — toute la difference entre un phare et un piege.
   */
  plain(v, depth = 0, file = null) {
    const from = file || this.sceneObj;
    if (depth > 8) return null;
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v instanceof Uint8Array) return { __bytes__: v.length };
    if (Array.isArray(v)) return v.map((x) => this.plain(x, depth + 1, from));
    if (typeof v === "object") {
      if ("fileId" in v && "pathId" in v) {
        if (!v.pathId) return null;
        // Le `fileId` etait JETE ici : `{ $ref: v.pathId }`. Le nom qui suivait
        // venait alors d'un homonyme du fichier de la scene, d'ou des arbres
        // de dialogue qui se resolvaient en os de squelette. On suit le
        // pointeur pour de bon, et l'identite emise est celle de la CIBLE.
        const target = this.env.deref(v, from);
        if (!target) return { $ref: null, $missing: v.pathId };
        const key = refKey(target);
        const ref = { $ref: key };
        const nm = this.assetNames.get(key) ||
                   (fileKey(target.file.name) === fileKey(this.sceneFile)
                     ? this.name(target.pathId) : null);
        if (nm) ref.name = nm;
        return ref;
      }
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = this.plain(x, depth + 1, from);
      return out;
    }
    return null;
  }

  /**
   * Itere les MonoBehaviour de la scene dont la classe est retenue.
   *
   * `classes` est une liste de noms, ou un predicat quand on cherche une
   * famille dont on ne connait pas les noms exacts.
   */
  *behaviours(classes) {
    const keep = typeof classes === "function" ? classes
      : classes ? ((cls) => new Set(classes).has(cls)) : (() => true);
    const want = typeof classes === "function" || !classes
      ? null : new Set(classes);
    for (const o of this.env.objects({ type: "MonoBehaviour", file: this.sceneFile })) {
      const cls = this.scriptName(o);
      if (!cls) continue;
      if (want ? !want.has(cls) : !keep(cls)) continue;
      yield { obj: o, cls };
    }
  }
}

/**
 * `fichier:path_id` — l'identite d'un objet, sans ambiguite entre fichiers.
 *
 * Le nom est normalise comme le fait `UnityEnv` : nom nu, en minuscules. Un
 * en-tete peut ecrire « Library/unity default resources » la ou un autre ecrit
 * le nom seul, et deux ecritures du meme fichier donneraient deux cles.
 */
export function fileKey(name) {
  return String(name).replace(/\\/g, "/").split("/").pop().toLowerCase();
}

export function refKey(obj) { return `${fileKey(obj.file.name)}:${obj.pathId}`; }

export { round };
