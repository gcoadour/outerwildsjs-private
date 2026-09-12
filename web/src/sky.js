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
// Le premier n'est PAS porte, et la raison est dite en toutes lettres dans
// docs/41-ciel.md : les deux orientations essayees donnent soit un plein jour
// permanent, soit une gerbe de rayons au pole de la sphere UV. La convention
// d'axes entre le `LookAt` d'Unity et l'export glTF, qui inverse Z, reste a
// etablir. Poser une rotation fausse serait pire que n'en poser aucune.
//
// `_skyRadius` n'est pas serialise : c'est le 320 du constructeur.

/** Rayon de ciel par defaut : le `_skyRadius` du constructeur de SkyBehavior. */
export const SKY_RADIUS = 320;

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
  }

  get ready() { return !!this.shell; }

  /** Nombre de nuages decrits par le build, 0 sans donnees. */
  get cloudCount() { return this.data ? (this.data.clouds || []).length : 0; }

  /** Retrouve la voute dans un lot de maillages charge. */
  attach(meshes) {
    if (!this.data) return 0;
    const nom = this.data.shell.name || "SkyShell";
    this.shell = (meshes || []).find((m) => m.name === nom) || null;
    return this.shell ? 1 : 0;
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
