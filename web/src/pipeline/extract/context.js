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
    // Indexe par path_id seul. Ces identifiants se repetent d'un fichier a
    // l'autre, donc la table est ambigue : elle ne sert qu'a l'affichage, ou un
    // homonyme est sans consequence. Tout ce qui doit designer un objet
    // precisement passe par assetName(objet), qui ne peut pas se tromper.
    this.assetNames = new Map();
    for (const type of ["Texture2D", "Mesh", "Material", "AudioClip"]) {
      for (const o of env.objects({ type })) {
        const n = this.assetName(o);
        if (n !== null && !this.assetNames.has(o.pathId)) this.assetNames.set(o.pathId, n);
      }
    }

    // --- textes ---
    this.texts = new Map();
    for (const o of env.objects({ type: "TextAsset" })) {
      const v = env.read(o);
      if (v) this.texts.set(o.pathId, new TextDecoder("utf-8").decode(v.m_Script));
    }
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
        return { shape: "capsule", radius: round(v.m_Radius * k, 3),
                 height: round(h, 3), center: c.map((x) => round(x * k, 3)) };
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
  plain(v, depth = 0) {
    if (depth > 8) return null;
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v instanceof Uint8Array) return { __bytes__: v.length };
    if (Array.isArray(v)) return v.map((x) => this.plain(x, depth + 1));
    if (typeof v === "object") {
      if ("fileId" in v && "pathId" in v) {
        if (!v.pathId) return null;
        const ref = { $ref: v.pathId };
        const nm = this.assetNames.get(v.pathId) || this.name(v.pathId);
        if (nm) ref.name = nm;
        return ref;
      }
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = this.plain(x, depth + 1);
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

export { round };
