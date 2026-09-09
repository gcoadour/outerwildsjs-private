// Chargement de la description du systeme solaire.
//
// data/solar_system.json est produit par tools/07_solar_system.py et n'est pas
// versionne (c'est de la donnee extraite du jeu). Sans lui, on retombe sur un
// systeme de substitution synthetique pour que le prototype reste executable.

const FALLBACK = {
  synthetic: true,
  bodies: [
    { name: "Etoile", position: [0, 0, 0],
      gravity: { surfaceAcceleration: 100, upperSurfaceRadius: 2000, cutoffRadius: 40000 } },
    { name: "Planete", position: [0, 0, 8600],
      gravity: { surfaceAcceleration: 12, upperSurfaceRadius: 250, cutoffRadius: 2000 } },
    { name: "Lune", position: [0, 0, 8900],
      gravity: { surfaceAcceleration: 5, upperSurfaceRadius: 100, cutoffRadius: 800 } },
  ],
  constants: {
    PlayerCharacterController: { _groundSpeed: 7, _jumpSpeed: 6, _groundAcceleration: 0.5 },
  },
};

export async function loadSolarSystem() {
  try {
    const res = await fetch("data/solar_system.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // on ne garde que les corps porteurs d'un champ de gravite
    data.bodies = data.bodies.filter((b) => b.gravity && b.gravity.surfaceAcceleration);
    data.synthetic = false;
    return data;
  } catch (e) {
    console.warn("data/solar_system.json absent, systeme de substitution utilise:", e.message);
    return FALLBACK;
  }
}

/**
 * Donnees de gameplay : vaisseau, ressources, objets interactifs, textes.
 * Produites par tools/09_gameplay.py, non versionnees (contenu du jeu).
 */
export async function loadGameplay() {
  try {
    const res = await fetch("data/gameplay.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("data/gameplay.json absent :", e.message);
    return { singletons: {}, placed: {} };
  }
}

/**
 * Constantes de deplacement du joueur.
 *
 * Elles viennent de DEUX composants : `PlayerCharacterController` pour la
 * marche (dans `solar_system.json`) et `JetpackThrusterModel` pour le sac
 * dorsal (dans `gameplay.json`). Le portage n'en lisait que cinq, et le
 * controleur les rangeait sans jamais s'en servir (docs/36-audit.md §2.1).
 *
 * Ce qui manque ici n'est PAS remplace : `Player` complete avec
 * `PLAYER_FALLBACK`, et c'est le seul endroit ou une valeur est ecrite en dur.
 */
export function playerConstants(data, gameplay = {}) {
  const c = (data.constants && data.constants.PlayerCharacterController) || {};
  // `JetpackThrusterModel` et rien d'autre : `ThrusterModel` est la classe de
  // base, dont derive aussi `ShipThrusterModel` (poussee 50). S'en servir comme
  // repli donnerait au joueur la poussee du vaisseau — sept fois trop. Faute du
  // composant, c'est `PLAYER_FALLBACK` qui complete, explicitement.
  const j = ((gameplay.singletons || {}).JetpackThrusterModel || {}).fields || {};
  const out = {
    groundSpeed: c._groundSpeed,
    strafeSpeed: c._strafeSpeed,
    jumpSpeed: c._jumpSpeed,
    acceleration: c._groundAcceleration,
    suitGroundSpeed: c._suitGroundSpeed,
    turnRate: c._turnRate,
    telescopeTurnScalar: c._telescopeTurnScalar,
    suitTurnScalar: c._suitTurnScalar,
    maxAngleToBeGrounded: c._maxAngleToBeGrounded,
    maxAngleBetweenSlopes: c._maxAngleBetweenSlopes,
    sphereCastRadius: c._sphereCastRadius,
    sphereCastLength: c._sphereCastLength,
    tumbleThreshold: c._tumbleThreshold,
    tumbleDuration: c._tumbleDuration,
    maxTranslationalThrust: j._maxTranslationalThrust,
    surfaceVerticalThrust: j._surfaceVerticalThrust,
    surfaceLateralThrust: j._surfaceLateralThrust,
  };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== "number" || !isFinite(v)) delete out[k];
  }
  return out;
}
