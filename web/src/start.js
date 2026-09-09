// Le depart de la partie.
//
// Le portage faisait apparaitre le joueur a `upperSurfaceRadius + 40`, decale
// de 9 unites a cote du vaisseau, face a une direction quelconque, puis le
// laissait tomber. Trois ecarts, et aucun n'est une question de gout :
//
//   - LE POINT. Le build pose seize `SpawnPoint`, deux par planete, et c'est
//     lui qui place joueur et vaisseau a l'execution (docs/07-gameplay.md).
//     Sur Timber Hearth les deux sont distants de 471 u : on demarre au
//     village et on MARCHE jusqu'au vaisseau. Le raccourci ne se contentait
//     pas d'abreger le trajet, il rendait le debut incoherent — on apparaissait
//     contre un vaisseau qu'on ne peut pas ouvrir, puisque `knowsLaunchCodes`
//     attend qu'on ait parle au conservateur, qui est au village.
//   - LA HAUTEUR. `upperSurfaceRadius + 40` n'est pas une position, c'est une
//     chute : le joueur se stabilisait a 249 u du centre quand les points
//     d'apparition sont a 131-168 (docs/07-gameplay.md). Il ne retombait donc
//     pas sur le sol du village mais sur ce qui depasse — les `PieceOfRing`
//     sont a 218-238.
//   - LE REGARD. `yaw = 0` regarde le « nord » du repere de travail, qui est
//     une construction du moteur (l'axe X ou Y du monde projete sur le plan
//     tangent) et ne veut rien dire sur une planete. Le `SpawnPoint` porte une
//     rotation ; il suffisait de l'extraire pour savoir ou le jeu tourne la
//     tete au premier instant.
//
// Tout ici est de la logique pure : ni Babylon, ni DOM, ni fetch. C'est ce qui
// permet a tests/09-jeu.mjs de verifier le pose de depart sans le build.
//
// Convention de repere : la geometrie corrigee coincide avec les coordonnees
// monde d'Unity (docs/05-gltf.md), et le repere ancre a t = 0 n'est qu'une
// TRANSLATION de celui-ci — la rotation propre part de zero (spin.js). Les
// positions et les directions du build s'emploient donc telles quelles au
// premier instant, sans conversion.

/** Hauteur des yeux au-dessus du centre du corps du joueur. */
export const EYE_HEIGHT = 1.2;

/** Rayon du corps du joueur, tel que `createPlayerBody` le construit. */
export const PLAYER_RADIUS = 0.6;

/**
 * Garde entre le sol et le bas du corps du joueur.
 *
 * Repli assume, pas une mesure : le `SpawnPoint` est au sol, et une sphere
 * creee EN INTERSECTION avec un collider trimesh est ejectee violemment par
 * Havok. On la pose donc un demi-metre au-dessus, ce qui se resorbe a la
 * premiere image.
 */
export const SPAWN_CLEARANCE = 0.5;

const len = (v) => Math.hypot(v[0], v[1], v[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];

function unit(v) {
  if (!Array.isArray(v) || v.length < 3) return null;
  const L = len(v);
  return L > 1e-9 ? [v[0] / L, v[1] / L, v[2] / L] : null;
}

/**
 * Direction regardee par un transform : son axe Z local, tourne par le monde.
 *
 * Meme formule que `forward()` de l'extracteur des lumieres — Unity et Babylon
 * sont tous deux en main gauche, la conversion de repere du glTF se referme
 * (docs/05-gltf.md) et il n'y a donc rien a inverser ici.
 */
export function quatForward(q) {
  if (!Array.isArray(q) || q.length < 4) return null;
  const [x, y, z, w] = q;
  return unit([2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]);
}

/**
 * Ce point d'apparition est-il celui du vaisseau ?
 *
 * Le champ du composant fait foi quand il existe ; sinon le nom, qui est la
 * seule chose dont on soit sur (`SpawnPoint_Ship`). Un booleen d'Unity peut
 * arriver en 0/1 : les deux formes sont acceptees.
 */
export function isShipSpawn(p) {
  const f = (p && p.fields) || {};
  for (const k of ["_isShipSpawn", "isShipSpawn"]) {
    if (f[k] === true || f[k] === 1) return true;
    if (f[k] === false || f[k] === 0) return false;
  }
  return /ship/i.test((p && p.name) || "");
}

/** Les points d'apparition de la scene, filtres par destinataire. */
export function spawnPoints(gameplay, { ship = false } = {}) {
  const pts = ((gameplay && gameplay.placed && gameplay.placed.SpawnPoint) || [])
    .filter((p) => p && Array.isArray(p.position) && p.position.length >= 3);
  return pts.filter((p) => isShipSpawn(p) === ship);
}

/** Le plus proche d'une position monde, ou null. */
export function nearestTo(points, world) {
  let best = null, bestD = Infinity;
  for (const p of points || []) {
    const d = len(sub(p.position, world));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/**
 * Le repere d'horizon d'une verticale locale.
 *
 * C'est CE repere que `yaw` mesure dans le moteur : `yaw = 0` regarde le nord,
 * `yaw = +pi/2` l'est. Il vit ici pour que le pose de depart et la camera
 * partagent la meme convention — sinon l'orientation lue dans le build serait
 * juste et la tete tournee d'un angle arbitraire.
 */
export function horizonBasis(up) {
  const u = unit(up) || [0, 1, 0];
  const ref = Math.abs(u[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const east = unit(cross(u, ref)) || [1, 0, 0];
  const north = unit(cross(east, u)) || [0, 0, 1];
  return { up: u, east, north };
}

/**
 * Angle de lacet qui fait regarder dans une direction donnee.
 *
 * La composante verticale est jetee : le lacet ne dit que l'azimut, et une
 * direction exactement verticale n'en a pas — d'ou le null, que l'appelant
 * traite comme « aucune orientation connue ».
 */
export function yawFor(dir, up) {
  const d = unit(dir);
  if (!d) return null;
  const { up: u, east, north } = horizonBasis(up);
  const k = dot(d, u);
  const t = unit([d[0] - u[0] * k, d[1] - u[1] * k, d[2] - u[2] * k]);
  if (!t) return null;
  return Math.atan2(dot(t, east), dot(t, north));
}

/**
 * Le pose de depart, dans le repere du corps ancre.
 *
 * `home.position0` est la position monde du corps ; le repere de travail est
 * centre dessus. La verticale locale est radiale — c'est la meme approximation
 * que partout ailleurs sur un corps rond, et le champ dominant la reprendra
 * des la premiere image.
 *
 * Rend `null` quand le build n'est pas la : l'appelant garde alors son repli,
 * et la page reste ouvrable sans le jeu.
 */
export function startPose(gameplay, home) {
  const home0 = (home && (home.position0 || home.position)) || [0, 0, 0];
  const p = nearestTo(spawnPoints(gameplay, { ship: false }), home0);
  if (!p) return null;
  const local = sub(p.position, home0);
  const up = unit(local);
  if (!up) return null;
  const lift = PLAYER_RADIUS + SPAWN_CLEARANCE;
  const fwd = quatForward(p.rotation);
  const yaw = fwd ? yawFor(fwd, up) : null;
  return {
    name: p.name || "SpawnPoint",
    position: [local[0] + up[0] * lift,
               local[1] + up[1] * lift,
               local[2] + up[2] * lift],
    up,
    yaw: yaw === null ? 0 : yaw,
    // Une extraction anterieure a la rotation des `SpawnPoint` ne porte pas
    // d'orientation : on le dit plutot que de faire passer un zero pour une
    // mesure.
    oriented: yaw !== null,
    radius: len(local),
  };
}

/**
 * Distance a parcourir jusqu'au vaisseau, ou null.
 *
 * Sert au journal de demarrage : c'est le chiffre qui dit si le depart est
 * celui du jeu (471 u sur Timber Hearth) ou le raccourci d'avant (9 u).
 */
export function walkToShip(gameplay, home) {
  const home0 = (home && (home.position0 || home.position)) || [0, 0, 0];
  const a = nearestTo(spawnPoints(gameplay, { ship: false }), home0);
  const b = nearestTo(spawnPoints(gameplay, { ship: true }), home0);
  if (!a || !b) return null;
  return len(sub(a.position, b.position));
}
