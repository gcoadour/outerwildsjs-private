// Floating origin.
//
// Le monde s'etend sur ~100 000 unites et 6 641 objets sont au-dela de 8 000.
// A cette distance la precision du float32 tombe au centimetre, ce qui produit
// un tremblement visible en vue premiere personne. Ni Babylon ni three.js ne
// gerent ca : on recentre donc le monde.
//
// On recentre sur le CORPS DOMINANT, pas sur le joueur. Deux raisons :
//
//   - les colliders statiques de Havok restent alors immobiles tant qu'on reste
//     sur le meme corps ; les recentrer en continu obligerait a mettre a jour
//     des centaines de transformations a chaque pas ;
//   - le joueur reste a moins d'un rayon de corps de l'origine (250 a 2000 u),
//     tres loin du seuil ou le float32 devient genant.
//
// C'est aussi ce que fait l'original avec ses referentiels : le monde est
// exprime relativement au corps auquel on est rattache.

export class FloatingOrigin {
  constructor(threshold = 500) {
    this.threshold = threshold;
    this.offset = { x: 0, y: 0, z: 0 }; // decalage cumule monde -> rendu
    this.anchorName = null;             // corps servant d'ancre, si ancrage
  }

  /** Coordonnees monde -> coordonnees de rendu. */
  toRender(worldPos) {
    return {
      x: worldPos[0] - this.offset.x,
      y: worldPos[1] - this.offset.y,
      z: worldPos[2] - this.offset.z,
    };
  }

  /** Ancre l'origine sur un corps. Retourne true si l'ancre a change. */
  anchorTo(body) {
    if (this.anchorName === body.name) return false;
    this.anchorName = body.name;
    this.offset.x = body.position[0];
    this.offset.y = body.position[1];
    this.offset.z = body.position[2];
    return true;
  }

  /**
   * Hors de toute influence, on retombe sur un recentrage suivant le joueur.
   * Retourne true si un recentrage a eu lieu.
   */
  followPlayer(playerWorld) {
    const d = Math.hypot(
      playerWorld.x - this.offset.x,
      playerWorld.y - this.offset.y,
      playerWorld.z - this.offset.z
    );
    if (d < this.threshold) return false;
    this.anchorName = null;
    this.offset.x = playerWorld.x;
    this.offset.y = playerWorld.y;
    this.offset.z = playerWorld.z;
    return true;
  }

  /** Recentrage : ancrage sur le corps dominant, sinon suivi du joueur. */
  update(playerWorld, field) {
    return field ? this.anchorTo(field.body) : this.followPlayer(playerWorld);
  }
}
