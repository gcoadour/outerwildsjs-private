// Niveau de detail par maillage, et eviction de la geometrie.
//
// Les secteurs font une bascule tout ou rien a l'echelle du CORPS : la
// geometrie complete, ou la sphere de substitution. Le jeu, lui, empile des
// `LODGroup` (plus 21 `ChildColliderLOD` et 5 `CreateLODGroup`) qui reduisent
// le detail maillage par maillage.
//
// Ce module fait la meme chose avec ce que le portage a sous la main. Un
// LODGroup d'Unity se declenche sur la HAUTEUR RELATIVE A L'ECRAN de l'objet :
// c'est exactement le rapport entre le rayon de sa sphere englobante et sa
// distance a la camera. On n'a donc rien a inventer — seulement a mesurer ce
// rapport et a eteindre ce qui tombe sous le seuil.
//
// Deux precautions comptent plus que le seuil lui-meme :
//
//   - le cout. Parcourir 12 000 maillages a chaque image couterait plus cher
//     que ce qu'on economise. Le parcours est donc TOURNANT : une tranche par
//     image, et le tour complet en quelques images.
//   - les gros objets. Une planete entiere a un rapport enorme et ne doit
//     jamais disparaitre ; un caillou pose dessus, oui. Le seuil est un rapport,
//     pas une distance : il traite les deux correctement sans cas particulier.

/** Hauteur relative a l'ecran en dessous de laquelle un maillage s'eteint. */
export const LOD_RATIO = 0.0022;   // ~1,6 pixel de haut sur 720 lignes
/** Maillages examines par image. */
export const LOD_SLICE = 400;

/**
 * Seuils du build, par objet.
 *
 * Un `LODGroup` ne simplifie rien a la volee : il DESIGNE des maillages deja
 * simplifies et le seuil auquel on passe de l'un a l'autre. Ce seuil est
 * exprime en hauteur relative a l'ecran — exactement l'unite que `apply()`
 * calcule. Il n'y a donc rien a inventer, seulement a lire ce que
 * `CreateLODGroup` porte, quand il le porte : ce qui n'a pas de seuil lisible
 * retombe sur le seuil unique, qui reste la regle generale.
 *
 * @returns Map nom d'objet -> seuil
 */
export function lodThresholds(gameplay = {}) {
  const out = new Map();
  const placed = gameplay.placed || {};
  for (const [cls, list] of Object.entries(placed)) {
    if (!/^(Create)?LODGroup$|^LODLayer$/i.test(cls)) continue;
    for (const e of list) {
      const f = e.fields || {};
      let best = null;
      for (const [k, v] of Object.entries(f)) {
        if (!/screen|height|relative|threshold/i.test(k)) continue;
        const vals = Array.isArray(v) ? v.filter((x) => typeof x === "number")
                   : (typeof v === "number" ? [v] : []);
        for (const x of vals) {
          // un seuil de hauteur d'ecran vit dans ]0, 1[ ; au-dela c'est une
          // distance, qui ne se compare pas a la meme grandeur
          if (x > 0 && x < 1 && (best === null || x < best)) best = x;
        }
      }
      if (best !== null && e.name) out.set(e.name, best);
    }
  }
  return out;
}

/**
 * Objets portant un `ChildColliderLOD` (21 dans la scene).
 *
 * Le portage pose les colliders d'un bloc sur le corps ancre — 441 sur Timber
 * Hearth, 898 ms de construction. Le jeu, lui, ne garde en collision que ce qui
 * est assez pres. La liste sert de filtre : quand elle n'est pas vide, seuls
 * ses objets et leurs enfants entrent dans la construction differee.
 */
export function colliderLODNames(gameplay = {}) {
  return new Set(((gameplay.placed || {}).ChildColliderLOD || [])
    .map((e) => e.name).filter(Boolean));
}

export class MeshLOD {
  /**
   * @param thresholds Map nom -> hauteur d'ecran, issue de lodThresholds()
   */
  constructor(ratio = LOD_RATIO, slice = LOD_SLICE, thresholds = null) {
    this.ratio = ratio;
    this.slice = slice;
    this.thresholds = thresholds || new Map();
    this.cursor = new Map();     // fichier -> position du parcours tournant
    this.hidden = 0;
    this.tested = 0;
    this.fromBuild = 0;          // maillages eteints sur un seuil du build
  }

  /**
   * Seuil applicable a un maillage : celui du build s'il en a un, le seuil
   * general sinon. Le nom du noeud glTF est celui du GameObject d'origine.
   */
  thresholdFor(mesh) {
    if (!this.thresholds.size || !mesh || !mesh.name) return this.ratio;
    const own = this.thresholds.get(mesh.name);
    if (own !== undefined) return own;
    const parent = mesh.parent && mesh.parent.name
      ? this.thresholds.get(mesh.parent.name) : undefined;
    return parent === undefined ? this.ratio : parent;
  }

  /**
   * @param entries lots de geometrie charges
   * @param camera  position de la camera dans le repere courant
   * @param active  (fichier) => ce lot est-il affiche ? Un lot eteint par les
   *                secteurs n'a pas a etre parcouru.
   */
  update(entries, camera, active = null) {
    let tested = 0;
    for (const e of entries) {
      if (active && !active(e.file)) continue;
      const list = e.meshes;
      if (!list || !list.length) continue;
      let i = this.cursor.get(e.file) || 0;
      const n = Math.min(this.slice, list.length);
      for (let k = 0; k < n; k++) {
        const m = list[(i + k) % list.length];
        this.apply(m, camera);
        tested++;
      }
      this.cursor.set(e.file, (i + n) % list.length);
    }
    this.tested = tested;
    return tested;
  }

  /** Eteint un maillage trop petit a l'ecran, rallume-le des qu'il grandit. */
  apply(mesh, camera) {
    if (!mesh.getBoundingInfo || mesh.__lodPinned) return;
    const bs = mesh.getBoundingInfo().boundingSphere;
    const c = bs.centerWorld, r = bs.radiusWorld;
    if (!(r > 0)) return;
    const d = Math.hypot(c.x - camera.x, c.y - camera.y, c.z - camera.z);
    const ratio = d > 1e-6 ? r / d : Infinity;
    const limit = this.thresholdFor(mesh);
    const on = ratio >= limit;
    // isVisible plutot que setEnabled : le maillage garde sa place dans la
    // hierarchie et ses enfants, on ne fait que cesser de le dessiner.
    if (mesh.isVisible !== on) {
      mesh.isVisible = on;
      this.hidden += on ? -1 : 1;
      if (!on && limit !== this.ratio) this.fromBuild += 1;
    }
  }

  /** Un maillage qu'on ne veut jamais voir disparaitre (le vaisseau, la croute). */
  static pin(mesh) { if (mesh) mesh.__lodPinned = true; }
}

/**
 * Eviction : rendre la memoire d'un corps qu'on a quitte.
 *
 * Le chargement a la demande (voir `docs/27-poids.md`) ne relachait jamais
 * rien : traverser le systeme finissait par tout charger, et le poids revenait
 * a ce qu'il etait avant. Un corps quitte depuis assez longtemps est donc
 * libere, et se rechargera comme la premiere fois si l'on revient.
 *
 * Le delai compte autant que la distance : sans lui, franchir la limite dans
 * un sens puis dans l'autre declencherait un cycle liberation/telechargement.
 */
export class Evictor {
  /**
   * @param seconds delai d'inactivite avant liberation
   * @param protect fichiers a ne jamais liberer (corps ancre, corps de depart)
   */
  constructor(seconds = 45, protect = []) {
    this.seconds = seconds;
    this.protect = new Set(protect);
    this.away = new Map();     // fichier -> temps passe hors de portee
    this.evicted = 0;
  }

  keep(file) { this.protect.add(file); }
  release(file) { this.protect.delete(file); }

  /**
   * Signale l'etat d'un fichier charge. Un fichier a portee, ou protege,
   * remet son compteur a zero.
   */
  see(file, inRange) {
    if (inRange || this.protect.has(file)) this.away.delete(file);
    else if (!this.away.has(file)) this.away.set(file, 0);
  }

  /**
   * @param evict (fichier) => libere, retourne vrai si c'est fait
   * @returns les fichiers liberes a cette image
   */
  update(dt, evict) {
    const done = [];
    for (const [file, t] of [...this.away]) {
      if (this.protect.has(file)) { this.away.delete(file); continue; }
      const next = t + dt;
      if (next < this.seconds) { this.away.set(file, next); continue; }
      this.away.delete(file);
      if (evict(file)) { this.evicted += 1; done.push(file); }
    }
    return done;
  }

  /** Secondes d'absence deja comptees pour un fichier. */
  waiting(file) { return this.away.get(file) ?? 0; }
}
