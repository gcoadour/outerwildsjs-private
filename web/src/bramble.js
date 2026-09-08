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

/**
 * Le bruit, tel que les predateurs l'entendent.
 *
 * Le `NoiseSensor` etait nourri par les COMMANDES du joueur : bouger faisait du
 * bruit, tout le reste etait silencieux. Or le champ audio sait exactement
 * quelles sources jouent et ou elles sont. Le bruit devient donc un champ, et
 * un predateur va vers ce qu'il entend — qui n'est pas forcement le joueur.
 *
 * Deux consequences de jeu, et c'est tout l'interet : on peut se trahir en
 * laissant tourner une source sonore, et on peut s'en servir comme leurre.
 *
 * Le niveau percu ne s'additionne pas d'une source a l'autre : le capteur suit
 * la plus forte, comme le detecteur de gravite suit le champ dominant.
 */
export class NoiseField {
  constructor() { this.sources = []; }

  clear() { this.sources.length = 0; }

  /**
   * @param position position MONDE de la source
   * @param level    force, 0 a 1
   * @param radius   portee au-dela de laquelle elle n'est plus audible
   */
  add(position, level = 1, radius = FISH.noiseRadius) {
    if (!(level > 0) || !(radius > 0)) return;
    this.sources.push({ position: position.slice(), level, radius });
  }

  /** La source la plus forte entendue depuis un point, ou null. */
  strongestAt(point, reach = Infinity) {
    let best = null;
    for (const s of this.sources) {
      const d = Math.hypot(s.position[0] - point[0], s.position[1] - point[1],
                           s.position[2] - point[2]);
      const range = Math.min(s.radius, reach);
      if (d > range) continue;
      // une source lointaine s'entend moins qu'une source proche de meme force
      const heard = s.level * (1 - d / range);
      if (!best || heard > best.heard) best = { ...s, distance: d, heard };
    }
    return best;
  }

  get count() { return this.sources.length; }
}

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
   * @param noisy  vrai/faux (le joueur fait du bruit), ou un `NoiseField` : le
   *        predateur va alors vers la source la plus forte qu'il entend, qui
   *        n'est pas forcement le joueur.
   */
  update(dt, player, noisy) {
    const d = dist(this.position, player);
    const fromHome = Math.hypot(this.position[0] - this.home[0],
                                this.position[1] - this.home[1],
                                this.position[2] - this.home[2]);

    // Un champ de bruit est un objet, donc toujours « vrai » : sans cette
    // distinction, un champ vide valait « le joueur fait du bruit » et le
    // predateur poursuivait une proie parfaitement silencieuse.
    const field = !!(noisy && typeof noisy === "object" && noisy.strongestAt);
    const heard = field ? noisy.strongestAt(this.position, this.cfg.noiseRadius) : null;
    const noise = heard ? heard.position : [player.x, player.y, player.z];
    const audible = field ? !!heard : (!!noisy && d < this.cfg.noiseRadius);
    this.heard = heard;

    // Ce qui echappe, c'est la SOURCE poursuivie : un joueur parti loin ne
    // ramene pas le predateur chez lui tant qu'une autre source l'appelle.
    const away = heard ? heard.distance : d;
    if (fromHome > this.cfg.habitatRadius || away > this.cfg.escapeDistance) {
      this.state = "repos";           // le joueur a echappe, ou on s'eloigne trop
    } else if (audible) {
      this.state = "poursuit";
    } else if (this.state === "poursuit" && d < this.cfg.escapeDistance) {
      this.state = "inspecte";        // dernier point connu
    }

    const target = this.state === "repos" ? this.home
                                          : (this.state === "poursuit" ? noise
                                             : [player.x, player.y, player.z]);
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
 * Corruption : le seuil de decoupe qui gagne la matiere au fil de la boucle.
 *
 * `CorruptionAnimator` (10 instances) pilote un seuil de decoupe de materiau
 * sur la fraction de boucle. Le composant ne nomme pas ses bornes de la meme
 * facon partout ; on prend donc les valeurs numeriques qui parlent de decoupe,
 * et a defaut la course entiere de 0 a 1.
 */
export function corruptionRange(fields = {}) {
  const found = [];
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "number" && /cut|threshold|corrupt|dissolve/i.test(k)) found.push(v);
  }
  if (!found.length) return { from: 0, to: 1 };
  return { from: Math.min(...found), to: Math.max(...found) };
}

/** Seuil courant, interpole sur la fraction de boucle. */
export function corruptionThreshold(range, fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  return range.from + (range.to - range.from) * f;
}

export class Corruption {
  /**
   * @param entries `placed.CorruptionAnimator` de gameplay.json
   * @param resolve (nom, position) => liste de noeuds a animer
   */
  constructor(entries = [], resolve = null) {
    this.items = entries.map((e) => ({
      name: e.name, position: e.position,
      range: corruptionRange(e.fields || {}), nodes: null, threshold: null,
    }));
    this.resolve = resolve;
  }

  get count() { return this.items.filter((i) => i.nodes && i.nodes.length).length; }

  update(fraction) {
    for (const it of this.items) {
      if (!it.nodes && this.resolve) {
        it.nodes = this.resolve(it.name, it.position) || null;
        if (!it.nodes || !it.nodes.length) { it.nodes = null; continue; }
      }
      if (!it.nodes) continue;
      const t = corruptionThreshold(it.range, fraction);
      if (it.threshold !== null && Math.abs(t - it.threshold) < 1e-3) continue;
      it.threshold = t;
      for (const n of it.nodes) {
        const meshes = n.getChildMeshes ? [n, ...n.getChildMeshes(false)] : [n];
        for (const m of meshes) {
          const mat = m.material;
          // le repartiteur de shaders a deja pose une decoupe alpha sur ces
          // materiaux : il n'y a qu'un seuil a deplacer
          if (mat && "alphaCutOff" in mat) mat.alphaCutOff = t;
        }
      }
    }
    return this.count;
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
