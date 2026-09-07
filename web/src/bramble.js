// Dark Bramble : ronces et anglerfish.
//
// Ce que contient REELLEMENT cette alpha, apres inspection de la scene :
//
//   BrambleManager (x10)        pose sur des objets Thorns/pCylinder_on_curve,
//                               il fait CROITRE les ronces au fil de la boucle
//   AnglerfishController (x4)   predateurs
//   NoiseSensor (x4)            detection du bruit
//   FogCloak (x7)               masquage par le brouillard
//
// Il n'existe AUCUN volume de distorsion : l'espace replie de Dark Bramble,
// qui fait sa reputation dans le jeu final, n'est pas implemente ici. Le
// conteneur s'appelle d'ailleurs DarkBramble_TestBed — c'est une zone d'essai.
//
// Constantes des predateurs, relevees dans le build :
//   acceleration 2, vitesse d'inspection 15, vitesse de poursuite 42,
//   distance d'echappement 300, rayon d'habitat 1200,
//   rayon de detection du bruit 200

export const FISH = {
  acceleration: 2,
  investigateSpeed: 15,
  chaseSpeed: 42,
  escapeDistance: 300,
  habitatRadius: 1200,
  noiseRadius: 200,
  // Distance a laquelle le predateur attrape. Le build ne la donne PAS : il
  // decrit la detection et la poursuite, pas la prise, qui passe par un volume
  // de collision sur la bouche. 25 unites est l'ordre de grandeur du maillage
  // d'AnglerFish ; c'est un choix de ce portage, comme le dit docs/16-bramble.md.
  catchRadius: 25,
};

const dist = (a, b) => Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z);

export class Anglerfish {
  constructor(home, cfg = FISH) {
    this.cfg = cfg;
    this.home = home.slice();
    this.position = home.slice();
    this.state = "repos";     // repos | inspecte | poursuit
    this.speed = 0;
    this.caught = false;      // le joueur est dans la bouche
  }

  /**
   * Le joueur n'est detecte que s'il fait du bruit — se deplacer, pousser les
   * reacteurs. Rester immobile le rend invisible, ce qui est tout le principe.
   *
   * @param player position du joueur dans le repere courant
   * @param noisy  le joueur fait-il du bruit
   */
  update(dt, player, noisy) {
    const d = dist(this.position, player);
    const fromHome = Math.hypot(this.position[0] - this.home[0],
                                this.position[1] - this.home[1],
                                this.position[2] - this.home[2]);

    if (fromHome > this.cfg.habitatRadius || d > this.cfg.escapeDistance) {
      this.state = "repos";           // le joueur a echappe, ou on s'eloigne trop
    } else if (noisy && d < this.cfg.noiseRadius) {
      this.state = "poursuit";
    } else if (this.state === "poursuit" && d < this.cfg.escapeDistance) {
      this.state = "inspecte";        // dernier point connu
    }

    const target = this.state === "repos" ? this.home
                                          : [player.x, player.y, player.z];
    const want = this.state === "poursuit" ? this.cfg.chaseSpeed
               : this.state === "inspecte" ? this.cfg.investigateSpeed : 0;
    // acceleration bornee : le predateur ne change pas de vitesse d'un coup
    this.speed += Math.sign(want - this.speed) *
                  Math.min(Math.abs(want - this.speed), this.cfg.acceleration * dt);

    if (this.speed > 0.01) {
      const v = [target[0] - this.position[0], target[1] - this.position[1],
                 target[2] - this.position[2]];
      const L = Math.hypot(...v) || 1;
      for (let i = 0; i < 3; i++) {
        this.position[i] += (v[i] / L) * this.speed * dt;
      }
    }
    // La prise : un predateur qui atteint sa proie la mange. C'est la seule
    // consequence qui manquait — jusqu'ici on pouvait se faire poursuivre sans
    // rien risquer.
    this.caught = this.state !== "repos" &&
                  dist(this.position, player) < this.cfg.catchRadius;
    return this.state;
  }
}

/**
 * Croissance des ronces, indexee sur la fraction de boucle : c'est ainsi que
 * le jeu la pilote (BrambleManager compare la fraction courante a la derniere
 * fraction de croissance).
 */
export class Thorns {
  constructor(count = 10) { this.count = count; this.grown = 0; }
  update(loopFraction) {
    this.grown = Math.floor(this.count * Math.min(1, loopFraction));
    return this.grown;
  }
}
