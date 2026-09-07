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

/** Constantes de vol/deplacement, avec valeurs de repli. */
export function playerConstants(data) {
  const c = (data.constants && data.constants.PlayerCharacterController) || {};
  return {
    groundSpeed: c._groundSpeed ?? 7,
    strafeSpeed: c._strafeSpeed ?? 5,
    jumpSpeed: c._jumpSpeed ?? 6,
    acceleration: c._groundAcceleration ?? 0.5,
    turnRate: c._turnRate ?? 160,
  };
}
