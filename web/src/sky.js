// La voute celeste, les nuages et le champ d'etoiles de Timber Hearth.
//
// Trois classes du build dont AUCUNE n'etait lue, et qui font pourtant la
// premiere image de la partie (docs/41-ciel.md).
//
// `SkyBehavior` — la voute. Son `Update`, lu dans l'IL, tient en deux gestes :
//
//     _relativeBody.transform.LookAt(_sunBody.transform.position);
//     si (_playerIsInsideAtmosphere && _distanceFromPlayer > 0)
//       _currentSkyAlpha = SkyAlphaCurve.Evaluate(_distanceFromPlayer / _skyRadius);
//
// Le second est DU CODE MORT dans cette alpha : `_currentSkyAlpha` est range
// dans `_endMaterialColor.a`, et rien, dans toute la classe, ne reporte cette
// couleur sur le rendu. `skyAlpha` est donc fourni et documente, mais le
// moteur ne l'applique pas — comme les modificateurs de degats du vaisseau,
// cables et eteints parce que le build les eteint.
//
// Le premier EST porte, et il l'est parce qu'on a cesse de le raisonner.
//
// docs/41-ciel.md avait essaye deux orientations, les avait photographiees, et
// avait conclu de ce qu'elles montraient : « la convention d'axes entre le
// LookAt d'Unity et l'export glTF reste a etablir ». Deduire une convention
// d'axes d'une capture d'ecran demande de reconnaitre a l'oeil ou tombe le
// centre d'une texture — ce qui est precisement ce qu'une machine mesure mieux.
//
// La question posee au MAILLAGE : quel sommet porte l'uv (0,5 ; 0,5), le centre
// du disque bleu ? Reponse, sans ambiguite : celui dont la direction locale est
// +Z, et l'uv est une projection polaire centree dessus. Le `LookAt` amene donc
// bien le disque SUR le soleil, et la premiere des deux orientations essayees
// etait la bonne — c'est son execution qui ne l'etait pas.
//
// L'extracteur mesure cette direction et la rend dans les coordonnees de
// l'export (`discDirection`, [0, 0, -1] : Z inverse). Le moteur, lui, ne
// suppose RIEN de la chaine de transformation qui mene du glTF au monde : il
// lit dans Babylon les directions monde des axes du parent, et resout dedans.
// C'est plus long que d'ecrire un signe, et c'est la seule facon de ne pas
// avoir a le deviner.
//
// `_skyRadius` n'est pas serialise : c'est le 320 du constructeur.

// @lit SkyBehavior, CloudTextureController, DistantStarController
// La voute qui tourne, les dix visages de nuage, les mille etoiles qui
// s'eteignent. Aucun de ces trois noms n'apparait dans le code : ce depot
// traduit, et le marqueur ci-dessus est ce qui le dit au recensement.

import { lookRotation, qmul, qconj, qrot } from "./decor.js";

/** Rayon de ciel par defaut : le `_skyRadius` du constructeur de SkyBehavior. */
export const SKY_RADIUS = 320;

/**
 * Repli de la direction du disque, dans les coordonnees de l'export.
 *
 * Ce n'est pas une invention : c'est le +Z mesure sur `pSphere2`, Z inverse
 * comme l'export le fait. Il sert quand `data/sky.json` vient d'une extraction
 * anterieure a cette mesure.
 */
export const DISC_FALLBACK = [0, 0, -1];

/**
 * Le nom que portent les vingt-quatre nuages. Le meme pour tous : c'est
 * pourquoi ils se rattachent par position et non par nom.
 */
export const CLOUD_NAME = "PieceOfRing";

/**
 * Amene un axe LOCAL d'un maillage sur une direction du MONDE.
 *
 * @param axisLocal   l'axe a viser, dans le repere du maillage
 * @param targetWorld la direction du monde ou l'amener
 * @param basis       [ex, ey, ez], directions MONDE des axes du parent
 * @param upWorld     reference de roulis ; `LookAt` d'Unity prend (0, 1, 0)
 * @returns quaternion [x, y, z, w] a poser sur le maillage
 *
 * La base du parent peut comporter une REFLEXION (l'inversion de Z du
 * chargement glTF). Une reflexion n'est pas une rotation, et composer des
 * quaternions au travers serait faux : on passe donc par la transposee de la
 * base, qui ramene la cible dans le repere du parent, ou le probleme redevient
 * une rotation ordinaire.
 */
export function alignAxis(axisLocal, targetWorld, basis, upWorld = [0, 1, 0]) {
  const [ex, ey, ez] = basis;
  const dans = (v) => [v[0] * ex[0] + v[1] * ex[1] + v[2] * ex[2],
                       v[0] * ey[0] + v[1] * ey[1] + v[2] * ey[2],
                       v[0] * ez[0] + v[1] * ez[1] + v[2] * ez[2]];
  const cible = dans(targetWorld);
  const haut = dans(upWorld);
  // `lookRotation` amene +Z sur sa cible. L'axe du disque n'etant pas +Z, on
  // compose : q0 amene +Z sur la cible, qa amene +Z sur l'axe, et q0 * qa⁻¹
  // amene donc l'axe sur la cible.
  const q0 = lookRotation(cible, haut);
  const qa = lookRotation(axisLocal, [0, 1, 0]);
  return qmul(q0, qconj(qa));
}

/** Valeur d'une courbe echantillonnee, en un parametre de 0 a 1. */
export function curveAt(curve, u) {
  if (!curve || !curve.length) return 1;
  const x = Math.max(0, Math.min(1, u)) * (curve.length - 1);
  const i = Math.min(curve.length - 2, Math.floor(x));
  return curve[i] + (curve[i + 1] - curve[i]) * (x - i);
}

/**
 * Opacite que le build CALCULE pour la voute, et qu'il n'applique pas.
 *
 * Il divise par `_skyRadius` (320) et non par le rayon du collider (250,7) :
 * la voute resterait donc pleine bien au-dela de sa propre surface, et ne
 * s'effacerait qu'en partant vraiment.
 */
export function skyAlpha(curve, distance, skyRadius = SKY_RADIUS) {
  if (!(skyRadius > 0)) return 1;
  return curveAt(curve, distance / skyRadius);
}

/**
 * Le ciel d'un corps, tel que le build le decrit.
 *
 * Le moteur ne connait que des maillages : `attach` retrouve la voute par son
 * nom dans un lot de geometrie charge.
 */
export class Sky {
  constructor(data = null) {
    this.data = data && data.shell ? data : null;
    this.shell = null;        // maillage de la voute
    this.alpha = 1;           // ce que le build calculerait, s'il s'en servait
    this.clouds = [];         // { noeud, nuage } pour chacun des 24
    // Repere du parent : l'identite tant que personne ne l'a lu dans Babylon.
    this.basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  get ready() { return !!this.shell; }

  /** Nombre de nuages decrits par le build, 0 sans donnees. */
  get cloudCount() { return this.data ? (this.data.clouds || []).length : 0; }

  /** Nuages effectivement rattaches a un maillage. */
  get cloudsAttached() { return this.clouds.length; }

  /**
   * Rattache les 24 nuages, PAR POSITION.
   *
   * Tous les autres rattachements du portage se font par nom (`sand.js`,
   * `texanim.js`, `decor.js`) parce que le nom du build suffit a designer une
   * chose. Ici il ne suffit pas : les vingt-quatre nuages s'appellent tous
   * `PieceOfRing`, et ce qui les distingue est leur place et leur texture.
   *
   * La tolerance est large (une unite) : la position extraite est celle de la
   * scene au repos, et la geometrie chargee porte la sienne au millieme pres.
   * Chaque maillage n'est pris qu'une fois, et chaque nuage rend le plus proche
   * encore libre — sans quoi deux nuages voisins se disputeraient le meme.
   */
  attachClouds(nodes, tolerance = 1) {
    if (!this.data || !nodes || !nodes.length) return 0;
    const libres = nodes.filter((m) => m.name === CLOUD_NAME);
    const pris = new Set();
    this.clouds = [];
    for (const c of this.data.clouds || []) {
      if (!c.position) continue;
      let best = null, bestD = Infinity;
      for (const m of libres) {
        if (pris.has(m)) continue;
        const p = m.getAbsolutePosition ? m.getAbsolutePosition() : m.position;
        if (!p) continue;
        const d = Math.hypot(p.x - c.position[0], p.y - c.position[1], p.z - c.position[2]);
        if (d < bestD) { bestD = d; best = m; }
      }
      if (!best || bestD > tolerance) continue;
      pris.add(best);
      this.clouds.push({ noeud: best, nuage: c, distance: bestD });
    }
    return this.clouds.length;
  }

  /** Retrouve la voute dans un lot de maillages charge. */
  attach(meshes) {
    if (!this.data) return 0;
    const nom = this.data.shell.name || "SkyShell";
    this.shell = (meshes || []).find((m) => m.name === nom) || null;
    return this.shell ? 1 : 0;
  }

  /**
   * Le repere du parent, lu dans Babylon et non suppose.
   *
   * `basis` porte les directions MONDE des trois axes du parent du maillage.
   * La chaine glTF -> Babylon comporte une inversion de Z (l'export la pose sur
   * les positions, le chargeur la reprend sur un noeud racine) : la lire plutot
   * que la deduire rend le calcul juste quelle que soit cette chaine.
   *
   * @param mesh  le maillage de la voute, deja dans la scene
   * @param B     le module BABYLON
   */
  readBasis(mesh, B) {
    if (!mesh || !B) return null;
    const parent = mesh.parent;
    const axe = (v) => {
      const w = parent
        ? B.Vector3.TransformNormal(v, parent.getWorldMatrix()).normalize()
        : v;
      return [w.x, w.y, w.z];
    };
    this.basis = [axe(new B.Vector3(1, 0, 0)), axe(new B.Vector3(0, 1, 0)),
                  axe(new B.Vector3(0, 0, 1))];
    return this.basis;
  }

  /**
   * La rotation a poser sur la voute pour que le soleil soit au centre du
   * disque. Rendue en quaternion [x, y, z, w], dans le repere du parent.
   *
   * @param sunDir  direction du soleil, dans le MONDE
   */
  lookAtSun(sunDir) {
    const axe = (this.data && this.data.shell && this.data.shell.discDirection)
      || DISC_FALLBACK;
    return alignAxis(axe, sunDir, this.basis);
  }

  /**
   * Tient a jour ce que le build tient a jour — c'est-a-dire, ici, la seule
   * opacite, et sans la rendre.
   *
   * @param playerPos position du joueur dans le repere de travail
   */
  update(playerPos) {
    if (!this.shell || !this.data || !playerPos) return;
    const shell = this.data.shell;
    const c = this.shell.getAbsolutePosition();
    const d = Math.hypot(playerPos.x - c.x, playerPos.y - c.y, playerPos.z - c.z);
    this.alpha = skyAlpha(shell.alphaCurve, d, shell.skyRadius || SKY_RADIUS);
  }
}

/** Charge `data/sky.json`, ou null si le build n'a pas ete extrait. */
export async function loadSky() {
  try {
    const res = await fetch("data/sky.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    // Pas de repli invente : sans la voute du build, il n'y a pas de voute.
    console.warn("data/sky.json absent :", e.message);
    return null;
  }
}

/**
 * Le champ d'etoiles, et son extinction.
 *
 * `DistantStarController` fait trois choses, et la troisieme est la plus belle
 * chose du build que le portage ne faisait pas :
 *
 *   - `LateUpdate` MET EN PAUSE le systeme de particules des la premiere image
 *     et ne le relance jamais. Les mille etoiles ne bougent plus ; on releve
 *     leurs positions une fois ;
 *   - il colle ensuite le champ sur la camera du joueur a chaque image, ce qui
 *     les rend infiniment lointaines ;
 *   - `Update` les ETEINT UNE A UNE a mesure que la boucle passe. Chaque
 *     etoile franchie recoit une supernova a sa place et passe en (0, 0, 0, 0).
 *
 * Le ciel se vide donc pendant les vingt minutes — et surtout a la fin : la
 * courbe donne 23,8 % des etoiles a 69,5 % du temps, et les 76 % restants dans
 * le dernier tiers. C'est le compte a rebours, ecrit dans le ciel.
 *
 * Les positions sont tirees d'un generateur A GRAINE : le build, lui, les tire
 * une fois au demarrage et les garde. Sans graine, elles changeraient a chaque
 * chargement, et une etoile eteinte au redemarrage de la boucle ne serait plus
 * la meme — ce qui se verrait, puisque le champ ne bouge pas.
 */
export class StarField {
  constructor(data = null) {
    const s = (data && data.stars && data.stars[0]) || null;
    this.data = s;
    this.count = s && s.count ? s.count : 0;
    this.radius = s && s.radius ? s.radius : 30000;
    this.size = (s && s.size) || [200, 400];
    this.color = (s && s.color) || [0.8431, 0.8667, 1];
    this.curve = (s && s.explosionCurve) || null;
    this.extinguished = 0;      // `_lastParticleListIndex`
  }

  get ready() { return this.count > 0; }

  /**
   * Les positions des etoiles, sur une coquille spherique de rayon `radius`.
   *
   * Tirage de Marsaglia pour une direction uniforme — le tirage naif
   * (theta, phi uniformes) entasse les etoiles aux poles, et un ciel qui a deux
   * touffes se remarque. La graine rend la suite reproductible.
   */
  positions(seed = 1) {
    const out = new Float32Array(this.count * 3);
    let e = seed >>> 0 || 1;
    const rnd = () => {
      // xorshift32 : court, sans dependance, et suffisamment uniforme pour
      // mille points qu'on regarde de loin.
      e ^= e << 13; e >>>= 0;
      e ^= e >>> 17;
      e ^= e << 5; e >>>= 0;
      return e / 4294967296;
    };
    for (let i = 0; i < this.count; i++) {
      let x, y, s2;
      do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; s2 = x * x + y * y; } while (s2 >= 1 || s2 === 0);
      const k = 2 * Math.sqrt(1 - s2);
      out[i * 3] = x * k * this.radius;
      out[i * 3 + 1] = y * k * this.radius;
      out[i * 3 + 2] = (1 - 2 * s2) * this.radius;
    }
    return out;
  }

  /** Combien d'etoiles sont eteintes a cette fraction de boucle. */
  countAt(fraction) {
    if (!this.curve || !this.count) return 0;
    return Math.floor(curveAt(this.curve, fraction) * this.count);
  }

  /**
   * Avance l'extinction et rend les indices NOUVELLEMENT eteints — un par
   * supernova a poser. Rien ne se rallume : seule une remise a zero le fait.
   *
   * @param fraction         `TimeLoop.GetLoopFraction()`
   * @param preventSupernova `TimeLoop.GetPreventSupernova()` : la boucle
   *                         continue, le ciel ne se vide pas
   */
  update(fraction, preventSupernova = false) {
    if (preventSupernova || !this.ready) return [];
    const cible = Math.min(this.countAt(fraction), this.count);
    if (cible <= this.extinguished) return [];
    const neufs = [];
    for (let i = this.extinguished; i < cible; i++) neufs.push(i);
    this.extinguished = cible;
    return neufs;
  }

  /** Au redemarrage de la boucle, le ciel se remplit de nouveau. */
  reset() { this.extinguished = 0; }
}
