// Lune quantique.
//
// Constantes relevees dans le build :
//   _maxQuantumLockRange = 2000   au-dela, l'observation ne verrouille plus
//   _minQuantumLockRange = 150    en deca, elle est verrouillee quoi qu'il arrive
//   _sphereCheckRadius   = 150    rayon du test de visibilite
//   _isLightSensitive    = false  dans cette alpha, la lumiere n'intervient pas
//
// Quatre QuantumOrbit sont posees sur quatre corps hotes, chacune avec son
// rayon : Brittle Hollow 1400, Twin01 1700, Timber Hearth 1100, Giant's Deep
// 1500. La lune se trouve autour de l'un d'eux, et change d'hote des qu'on
// cesse de la regarder.

export const LOCK_MAX = 2000;
export const LOCK_MIN = 150;
export const CHECK_RADIUS = 150;   // _sphereCheckRadius
export const CHECK_DEPTH = 100;    // _checkDepth

/**
 * Inclinaison de l'orbite d'un hote.
 *
 * Le test cherche d'abord une valeur DANS les champs du composant : un angle
 * (`_inclination`, `_orbitAngle`...) ou un axe (`_orbitAxis`, `_upVector`...).
 * L'alpha n'en pose aucun sur ses quatre QuantumOrbit — c'est pourquoi la
 * premiere version de ce module tournait a plat.
 *
 * A defaut, l'inclinaison est tiree du NOM de l'hote, donc stable d'une partie
 * a l'autre, et bornee a 25 degres. C'est un choix de ce portage, pas une
 * mesure : sans lui les quatre orbites sont dans le meme plan, ce qui se voit
 * immediatement et ne ressemble a rien.
 */
export function orbitTilt(fields = {}, seed = "") {
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "number" && /inclin|tilt/i.test(k)) return v * Math.PI / 180;
    if (Array.isArray(v) && v.length === 3 && /axis|upvector|normal/i.test(k)) {
      const L = Math.hypot(v[0], v[1], v[2]);
      if (L > 1e-6) return Math.acos(Math.max(-1, Math.min(1, v[1] / L)));
    }
  }
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * (50 * Math.PI / 180);
}

/**
 * Un segment coupe-t-il une sphere ?
 *
 * C'est le test d'occlusion : la lune n'est observee que si RIEN ne se trouve
 * entre l'oeil et elle. Le jeu lance une sphere de `_sphereCheckRadius` sur une
 * profondeur de `_checkDepth` ; ici le test est analytique contre les corps du
 * systeme, ce qui coute trois produits scalaires au lieu d'un lancer de rayon
 * dans la scene, et ne depend pas de la geometrie chargee — une planete pas
 * encore telechargee masque quand meme la lune.
 */
export function segmentHitsSphere(a, b, center, radius) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const f = [a[0] - center[0], a[1] - center[1], a[2] - center[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (dd < 1e-9) return false;
  // parametre du point du segment le plus proche du centre, borne a [0, 1]
  let t = -(f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / dd;
  t = Math.max(0, Math.min(1, t));
  const p = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
  return Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) < radius;
}

/**
 * Longueur du segment qui passe A L'INTERIEUR d'une sphere.
 *
 * C'est ce que `_checkDepth` demande et que le test binaire ne donnait pas : le
 * jeu ne se contente pas de savoir qu'un obstacle est sur le chemin, il lance
 * une sphere SUR UNE PROFONDEUR. Raser le limbe d'une planete ne masque donc
 * pas la lune ; passer franchement derriere elle, si.
 */
export function segmentDepthInSphere(a, b, center, radius) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const f = [a[0] - center[0], a[1] - center[1], a[2] - center[2]];
  const A = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (A < 1e-9 || !(radius > 0)) return 0;
  const B = 2 * (f[0] * d[0] + f[1] * d[1] + f[2] * d[2]);
  const C = f[0] * f[0] + f[1] * f[1] + f[2] * f[2] - radius * radius;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return 0;
  const s = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - s) / (2 * A));
  const t1 = Math.min(1, (-B + s) / (2 * A));
  return t1 > t0 ? (t1 - t0) * Math.sqrt(A) : 0;
}

/**
 * Un corps masque-t-il la lune ?
 *
 * La sphere lancee a un rayon (`_sphereCheckRadius`, 150), ce qui revient a
 * grossir l'obstacle d'autant ; et elle doit rester dedans sur `_checkDepth`
 * (100) pour que l'obstacle compte. Les deux constantes etaient exportees et
 * inutilisees.
 */
export function occludes(a, b, center, radius,
                         probe = CHECK_RADIUS, depth = CHECK_DEPTH) {
  return segmentDepthInSphere(a, b, center, radius + probe) >= depth;
}

/**
 * Quaternion orientant l'axe +Z vers une direction donnee.
 *
 * `AlignQuantumMoon` tourne la lune vers le joueur : quel que soit l'hote
 * autour duquel elle s'est effondree, c'est la meme face qu'on voit. Sans lui,
 * la lune changeait de planete ET d'aspect a chaque saut.
 */
export function lookRotation(dir, up = [0, 1, 0]) {
  const L = Math.hypot(dir[0], dir[1], dir[2]);
  if (L < 1e-9) return [0, 0, 0, 1];
  const f = [dir[0] / L, dir[1] / L, dir[2] / L];
  let r = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2],
           up[0] * f[1] - up[1] * f[0]];
  let rl = Math.hypot(r[0], r[1], r[2]);
  if (rl < 1e-6) {
    const alt = Math.abs(f[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    r = [alt[1] * f[2] - alt[2] * f[1], alt[2] * f[0] - alt[0] * f[2],
         alt[0] * f[1] - alt[1] * f[0]];
    rl = Math.hypot(r[0], r[1], r[2]) || 1;
  }
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2],
             f[0] * r[1] - f[1] * r[0]];
  // matrice (r, u, f) -> quaternion, par la trace
  const m = [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]];
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [(m[5] - m[7]) / s, (m[6] - m[2]) / s, (m[1] - m[3]) / s, 0.25 * s];
  }
  if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    return [0.25 * s, (m[3] + m[1]) / s, (m[6] + m[2]) / s, (m[5] - m[7]) / s];
  }
  if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    return [(m[3] + m[1]) / s, 0.25 * s, (m[7] + m[5]) / s, (m[6] - m[2]) / s];
  }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
  return [(m[6] + m[2]) / s, (m[7] + m[5]) / s, 0.25 * s, (m[1] - m[3]) / s];
}

/** Hotes possibles, lus depuis data/gameplay.json. */
export function quantumHosts(gameplay) {
  return ((gameplay.placed && gameplay.placed.QuantumOrbit) || [])
    .map((o) => ({ host: o.name, radius: (o.fields || {})._orbitRadius || 1000,
                   tilt: orbitTilt(o.fields || {}, o.name || "") }))
    .filter((o) => o.radius > 0);
}

export class QuantumMoon {
  /**
   * @param hosts  [{host, radius}]
   * @param bodies corps du systeme, pour retrouver un hote par son bodyName
   */
  constructor(hosts, bodies) {
    this.hosts = hosts;
    this.bodies = bodies;
    this.index = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.collapses = 0;
    this.observed = false;
    this.occludedCount = 0;
    this.position = [0, 0, 0];
    this.relocate(0);
  }

  hostBody(i) {
    const h = this.hosts[i];
    return h ? this.bodies.find((b) => b.bodyName === h.host) : null;
  }

  /** Choisit un nouvel hote et une nouvelle position sur son orbite. */
  relocate(forceIndex = null) {
    if (!this.hosts.length) return;
    if (forceIndex === null) {
      let n = this.index;
      // un effondrement doit changer quelque chose de visible
      if (this.hosts.length > 1) {
        while (n === this.index) n = Math.floor(Math.random() * this.hosts.length);
      }
      this.index = n;
      this.collapses += 1;
    } else {
      this.index = forceIndex;
    }
    this.angle = Math.random() * Math.PI * 2;
    this.sync();
  }

  sync() {
    const h = this.hosts[this.index];
    const b = this.hostBody(this.index);
    if (!h || !b) return;
    // Orbite inclinee : le plan est celui de l'hote, bascule autour de l'axe X
    // par `tilt`. A inclinaison nulle on retrouve exactement l'orbite plane de
    // la premiere version.
    const c = Math.cos(this.angle) * h.radius, s = Math.sin(this.angle) * h.radius;
    const ct = Math.cos(h.tilt || 0), st = Math.sin(h.tilt || 0);
    this.position = [
      b.position[0] + c,
      b.position[1] + s * st,
      b.position[2] + s * ct,
    ];
  }

  /**
   * Un observateur verrouille la lune s'il la regarde et qu'il est a portee.
   * En deca de LOCK_MIN elle est verrouillee quoi qu'il arrive : on ne peut pas
   * la faire disparaitre en se collant contre elle en fermant les yeux.
   *
   * @param opts.occluded (oeil, lune) => vrai si quelque chose est entre les
   *        deux. C'est le test de profondeur du jeu : une lune cachee derriere
   *        une planete n'est PAS observee, et rien n'empeche alors le saut.
   */
  isObserved(eye, forward, opts = {}) {
    const halfFov = opts.halfFov ?? 0.62;
    const d = [this.position[0] - eye.x, this.position[1] - eye.y,
               this.position[2] - eye.z];
    const dist = Math.hypot(...d) || 1e-6;
    if (dist < LOCK_MIN) return true;
    if (dist > LOCK_MAX) return false;
    const dot = (d[0] * forward.x + d[1] * forward.y + d[2] * forward.z) / dist;
    if (dot <= Math.cos(halfFov)) return false;
    if (opts.occluded && opts.occluded([eye.x, eye.y, eye.z], this.position)) {
      this.occludedCount = (this.occludedCount || 0) + 1;
      return false;
    }
    return true;
  }

  /** Suit son hote, et s'effondre ailleurs des qu'on cesse de la regarder. */
  update(eye, forward, opts = {}) {
    this.sync();
    const now = this.isObserved(eye, forward, opts);
    if (this.observed && !now) this.relocate();
    this.observed = now;
    return this.observed;
  }

  get hostName() {
    const h = this.hosts[this.index];
    return h ? h.host : null;
  }
}

/**
 * Test d'occlusion contre les corps du systeme.
 *
 * @param bodies  corps, dont la position est exprimee dans le repere courant
 * @param exclude corps a ignorer — la lune elle-meme, qui se masquerait sinon
 */
export function bodyOccluder(bodies, exclude = null) {
  return (from, to) => {
    for (const b of bodies) {
      if (b === exclude) continue;
      const r = (b.gravity && b.gravity.upperSurfaceRadius) || 0;
      if (r <= 0) continue;
      if (occludes(from, to, b.position, r)) return true;
    }
    return false;
  };
}

/**
 * Orientation de la lune face a l'observateur (`AlignQuantumMoon`).
 *
 * @returns quaternion [x, y, z, w] a poser sur le noeud de la lune
 */
export function alignToObserver(moonPos, eye) {
  return lookRotation([eye.x - moonPos[0], eye.y - moonPos[1], eye.z - moonPos[2]]);
}
