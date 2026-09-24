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

// @lit NoiseSensor, AnglerfishController, AnglerfishAudioController, ShipNoiseMaker, ShipOnlyMusicVolume
// Les predateurs et ce qu'ils entendent.

/**
 * Verification de l'etat de lecture de ShipOnlyMusicVolume (ShipOnlyMusicVolume.CheckPlayState).
 * Le son de Dark Bramble s'active uniquement quand le joueur est a la fois dans le volume et dans le vaisseau.
 */
export function shipOnlyMusicState(inVolume, inShip) {
  return !!(inVolume && inShip);
}

export const FISH = {
  acceleration: 2,
  investigateSpeed: 15,
  chaseSpeed: 42,
  escapeDistance: 300,
  habitatRadius: 1200,
  noiseRadius: 200,   // `NoiseSensor._detectAsTargetRadius`, sur les quatre
  // `AddAngularVelocityChange(w * 0.1f)` : le predateur ne tourne qu'un DIXIEME
  // du chemin par pas de physique. C'est toute sa faiblesse.
  turnPart: 0.1,
  // `SetAngularVelocity(GetAngularVelocity() * 0.95f)` a l'arret : sa rotation
  // s'eteint de cinq pour cent par pas, il ne s'immobilise pas net.
  restSpin: 0.95,
  // Distance a laquelle le predateur attrape. Le build ne la donne PAS : il
  // decrit la detection et la poursuite, pas la prise, qui passe par un volume
  // de collision sur la bouche. 25 unites est l'ordre de grandeur du maillage
  // d'AnglerFish ; c'est un choix de ce portage, comme le dit docs/16-bramble.md.
  catchRadius: 25,
};

/**
 * Les deux seuils de `NoiseSensor.ListenForNoises`, et ils ne sont pas de la
 * meme espece : l'un est une DISTANCE serialisee, l'autre un VOLUME en dur.
 */
export const NOISE_SENSE = {
  targetRadius: FISH.noiseRadius,   // `_detectAsTargetRadius`, 200 sur les quatre
  disturbanceVolume: 10,            // `vol > 10f`, ecrit dans la methode
};

const dist = (a, b) => Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z);

/**
 * `OWPhysics.FromToAngularVelocity(de, vers)`, et son piege.
 *
 *     Vector3 c = Cross(de.normalized, vers.normalized);
 *     float angle = Mathf.Asin(c.magnitude);
 *     return c.normalized * angle / Time.fixedDeltaTime;
 *
 * L'ANGLE VIENT D'UN ARCSINUS, pas d'un arccosinus. Il plafonne donc a
 * quatre-vingt-dix degres et REDESCEND au-dela : une cible pile derriere donne
 * un produit vectoriel presque nul, donc un angle presque nul, donc un
 * predateur qui ne se retourne pas. Ce n'est pas une approximation du build,
 * c'est un angle mort — et il se joue (docs/109-anglerfish.md).
 *
 * @returns {{axe:Array, angle:number}} l'axe unitaire et l'angle en radians
 */
export function fromToAngular(de, vers) {
  const ld = Math.hypot(de[0], de[1], de[2]) || 1;
  const lv = Math.hypot(vers[0], vers[1], vers[2]) || 1;
  const a = [de[0] / ld, de[1] / ld, de[2] / ld];
  const b = [vers[0] / lv, vers[1] / lv, vers[2] / lv];
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
             a[0] * b[1] - a[1] * b[0]];
  const m = Math.hypot(c[0], c[1], c[2]);
  const angle = Math.asin(Math.min(1, m));
  if (m < 1e-9) return { axe: [0, 0, 0], angle: 0 };
  return { axe: [c[0] / m, c[1] / m, c[2] / m], angle };
}

/** Rotation d'un vecteur autour d'un axe unitaire, formule de Rodrigues. */
function tourne(v, axe, ang) {
  const co = Math.cos(ang), si = Math.sin(ang);
  const d = axe[0] * v[0] + axe[1] * v[1] + axe[2] * v[2];
  return [v[0] * co + (axe[1] * v[2] - axe[2] * v[1]) * si + axe[0] * d * (1 - co),
          v[1] * co + (axe[2] * v[0] - axe[0] * v[2]) * si + axe[1] * d * (1 - co),
          v[2] * co + (axe[0] * v[1] - axe[1] * v[0]) * si + axe[2] * d * (1 - co)];
}

/**
 * De combien le predateur tourne pendant `dt`, et a quelle vitesse il va.
 *
 *     Vector3 w = FromToAngularVelocity(transform.forward, vers);
 *     _anglerBody.SetAngularVelocity(Vector3.zero);
 *     _anglerBody.AddAngularVelocityChange(w * 0.1f);
 *     float v = Min(relative.magnitude + _acceleration, vitesseMax);
 *     _anglerBody.SetVelocity(transform.forward * v + bramble.GetVelocity());
 *
 * DEUX CHOSES QUE CE PORTAGE N'AVAIT PAS, et ce sont celles qui se jouent :
 *
 *   - IL NE VA PAS DROIT SUR SA PROIE. Il oriente son AVANT d'un dixieme du
 *     chemin par pas de physique, et avance le long de cet avant. Il depasse,
 *     il vire large, et c'est ce qui permet de l'esquiver. Le portage le
 *     deplacait droit vers la cible, ce qui en faisait un missile ;
 *   - IL ACCELERE EN UNE DEMI-SECONDE. `+ _acceleration` est ajoute PAR PAS DE
 *     PHYSIQUE, sans `deltaTime` : deux unites par seconde toutes les vingt
 *     millisecondes, soit cent unites par seconde carree. Les quarante-deux de
 *     la poursuite sont atteintes en vingt et un pas — 0,42 s. Le portage
 *     lisait `acceleration * dt` et mettait vingt et une SECONDES.
 *
 * Les deux constantes du build sont par PAS ; on les ramene au temps ecoule,
 * comme `approach` le fait pour la marche, ce qui garde le comportement exact a
 * cinquante hertz sans dependre de la cadence d'images.
 */
export function fishStep(avant, vers, vitesse, vitesseMax, dt, cfg = FISH,
                         step = 0.02) {
  const { axe, angle } = fromToAngular(avant, vers);
  // Un dixieme PAR PAS : sur `dt`, autant de dixiemes qu'il y a de pas — mais
  // jamais plus que le chemin qui reste.
  const part = angle > 0
    ? Math.min(angle, angle * cfg.turnPart * (dt / step)) : 0;
  const neuf = angle > 0 ? tourne(avant, axe, part) : avant.slice();
  const l = Math.hypot(neuf[0], neuf[1], neuf[2]) || 1;
  const v = Math.min(vitesse + cfg.acceleration * (dt / step), vitesseMax);
  return { forward: [neuf[0] / l, neuf[1] / l, neuf[2] / l], speed: v,
           angle, tourne: part };
}

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
 * ET LE CAPTEUR NE COMPARE RIEN. Ce module tenait « la source la plus forte,
 * attenuee par la distance » — une loi ecrite ici, pas lue. `ListenForNoises`
 * parcourt sa liste et REND A LA PREMIERE qui qualifie ; le volume n'entre
 * dans la decision que pour le seuil de dix, et la distance que pour le rayon
 * de cible. L'ordre d'inscription decide du reste (docs/119-bruit.md).
 */
export class NoiseField {
  constructor() { this.sources = []; }

  clear() { this.sources.length = 0; }

  /**
   * @param position position MONDE de la source
   * @param level    force, 0 a 1
   * @param radius   portee au-dela de laquelle elle n'est plus audible
   */
  add(position, level = 1, radius = FISH.noiseRadius, volume = null) {
    if (!(level > 0) || !(radius > 0)) return;
    // `volume` est l'echelle du build (`NoiseMaker._netVolume`, jusqu'a 13,66
    // pour le joueur) ; `level` reste celle du champ du portage, de 0 a 1.
    // Les deux vivent cote a cote parce que le seuil de dix se lit sur la
    // premiere et la comparaison entre sources sur la seconde.
    this.sources.push({ position: position.slice(), level, radius,
                        volume: volume == null ? level : volume });
  }

  /**
   * `NoiseSensor.ListenForNoises` — DEUX issues, et elles ne se ressemblent pas.
   *
   *     foreach (NoiseMaker n in _noiseMakerList) {
   *         float vol = n.GetVolume();
   *         if (vol <= 0f) continue;
   *         float d = Distance(transform.position, n.transform.position);
   *         if (d < _detectAsTargetRadius) { DetectTarget(n.GetAttachedBody()); return; }
   *         else if (vol > 10f)            { DetectDisturbance(n.transform.position); return; }
   *     }
   *
   * SOUS DEUX CENTS UNITES, LE MOINDRE BRUIT FAIT DE VOUS UNE CIBLE : le
   * volume n'entre pas dans la comparaison, seule la distance. Pousser une
   * seconde a un dixieme suffit.
   *
   * AU-DELA, IL FAUT PASSER DIX, et la distance ne compte plus du tout : un
   * bruit assez fort s'entend de n'importe ou dans le systeme. Mais il n'est
   * alors qu'un TROUBLE — on vient voir l'endroit, on ne vous poursuit pas.
   *
   * Et la boucle REND A LA PREMIERE source qui qualifie, pas a la plus proche
   * ni a la plus forte. L'ordre d'inscription decide.
   *
   * @returns {{kind:"cible"|"trouble", source}|null}
   */
  sense(point, cfg = NOISE_SENSE) {
    for (const s of this.sources) {
      if (!(s.level > 0)) continue;
      const d = Math.hypot(s.position[0] - point[0], s.position[1] - point[1],
                           s.position[2] - point[2]);
      // LA PORTEE EST UNE EXTENSION DE CE PORTAGE, pas une regle du build : le
      // build n'a qu'UN `NoiseMaker`, celui du joueur, et il s'entend de
      // partout. Les sources qu'on y ajoute — les emetteurs audio — ont, elles,
      // une portee au-dela de laquelle elles ne s'entendent plus, et c'est ce
      // qui permet de s'en servir comme leurre. Le joueur passe `Infinity`.
      if (s.radius != null && d > s.radius) continue;
      if (d < cfg.targetRadius) return { kind: "cible", source: { ...s, distance: d } };
      if (s.volume > cfg.disturbanceVolume) {
        return { kind: "trouble", source: { ...s, distance: d } };
      }
    }
    return null;
  }

  // `strongestAt` vivait ici : « la source la plus forte, attenuee par la
  // distance ». Le build ne compare RIEN et n'attenue RIEN — il prend la
  // premiere source qui qualifie, et le volume n'entre dans la decision que
  // pour le seuil de dix. C'etait une loi inventee, et son test gardait donc
  // un raisonnement (docs/119-bruit.md).

  get count() { return this.sources.length; }
}

export class Anglerfish {
  /** Nouvelle boucle : le predateur oublie, et sa proie revit. */
  reset() {
    this.position = this.home.slice();
    this.state = "repos";
    this.speed = 0;
    this.spin = 0;
    this.caught = false;
    this.forward = [0, 0, 1];
    this.disturbance = null;
  }

  constructor(home, cfg = FISH) {
    this.cfg = cfg;
    this.home = home.slice();
    this.position = home.slice();
    // `ChangeState(AnglerState)` pose l'etat et annonce `OnChangeAnglerState`.
    // Les trois etats du build sont `Lurking`, `Investigating` et `Chasing` ;
    // ce sont les trois que voici, et c'est `FixedUpdate` qui les separe : le
    // premier ne bouge pas, les deux autres passent par `UpdateMovement` avec
    // une cible et une vitesse differentes.
    this.state = "repos";     // repos | inspecte | poursuit
    this.speed = 0;
    this.caught = false;      // le joueur est dans la bouche
    // Son AVANT. Le build le tient sur le transform du poisson ; ici il fait
    // partie de son etat, parce que c'est lui qu'on oriente et lui qu'on suit.
    this.forward = [0, 0, 1];
    this.spin = 0;            // ce qui reste de sa rotation, a l'arret
    // L'endroit d'un `DetectDisturbance` : on y va, et on n'y poursuit rien.
    this.disturbance = null;
    this.trouble = false;
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
    const field = !!(noisy && typeof noisy === "object" && noisy.sense);
    // `ListenForNoises` : une CIBLE sous deux cents unites, un TROUBLE au-dela
    // si le volume passe dix. Le portage n'entendait rien au-dela de deux
    // cents, quelle que soit la force (docs/119-bruit.md).
    const percu = field ? noisy.sense(this.position) : null;
    const heard = percu ? percu.source : null;
    const noise = heard ? heard.position : [player.x, player.y, player.z];
    // Un trouble ne fait pas poursuivre : on vient VOIR l'endroit.
    const audible = field ? (percu ? percu.kind === "cible" : false)
                          : (!!noisy && d < this.cfg.noiseRadius);
    const trouble = !!(percu && percu.kind === "trouble");
    this.heard = heard;
    this.trouble = trouble;
    const stateAvant = this.state;

    // Ce qui echappe, c'est la SOURCE poursuivie : un joueur parti loin ne
    // ramene pas le predateur chez lui tant qu'une autre source l'appelle.
    const away = heard ? heard.distance : d;
    if (fromHome > this.cfg.habitatRadius || away > this.cfg.escapeDistance) {
      this.state = "repos";           // le joueur a echappe, ou on s'eloigne trop
    } else if (audible) {
      this.state = "poursuit";
    } else if (trouble) {
      // `DetectDisturbance(position)` : on va voir l'ENDROIT, pas la proie.
      this.state = "inspecte";
      this.disturbance = heard.position.slice();
    } else if (this.state === "poursuit" && d < this.cfg.escapeDistance) {
      this.state = "inspecte";        // dernier point connu
      this.disturbance = null;
    }

    this.stateChanged = this.state !== stateAvant;
    this.lastState = stateAvant;

    const target = this.state === "repos" ? this.home
                                          : (this.state === "poursuit" ? noise
                                             : (this.disturbance
                                                || [player.x, player.y, player.z]));
    const want = this.state === "poursuit" ? this.cfg.chaseSpeed
               : this.state === "inspecte" ? this.cfg.investigateSpeed : 0;

    if (this.state === "repos") {
      // `FixedUpdate`, branche `Lurking` : il s'arrete NET — sa vitesse devient
      // celle de Dark Bramble — et seule sa rotation s'eteint, de cinq pour
      // cent par pas. Il ne rentre pas chez lui, il attend sur place.
      this.speed = 0;
      this.spin *= Math.pow(this.cfg.restSpin, dt / 0.02);
    } else {
      const vers = [target[0] - this.position[0], target[1] - this.position[1],
                    target[2] - this.position[2]];
      const pas = fishStep(this.forward, vers, this.speed, want, dt, this.cfg);
      this.forward = pas.forward;
      this.speed = pas.speed;
      this.spin = pas.tourne / Math.max(1e-9, dt);
      // IL AVANCE LE LONG DE SON AVANT, pas vers sa cible : c'est la
      // difference, et c'est elle qui le rend esquivable.
      for (let i = 0; i < 3; i++) {
        this.position[i] += this.forward[i] * this.speed * dt;
      }
    }
    // La prise : un predateur qui atteint sa proie la mange. C'est la seule
    // consequence qui manquait — jusqu'ici on pouvait se faire poursuivre sans
    // rien risquer.
    // ON NE SE FAIT DEVORER QU'UNE FOIS, ET CELA NE SE DEFAIT PAS. Le drapeau
    // etait recalcule a chaque image : depuis que le predateur DEPASSE sa proie
    // au lieu de la viser, il la traverse en une image et s'en eloigne — et la
    // prise s'annulait toute seule a l'image d'apres. Dans le build, la bouche
    // est un volume de collision, et y entrer tue.
    if (this.state !== "repos"
        && dist(this.position, player) < this.cfg.catchRadius) this.caught = true;
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
