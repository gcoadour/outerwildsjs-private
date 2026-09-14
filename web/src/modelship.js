// @lit ModelShipCrashBehavior, ModelShipLandingSpot, RocketKidConvoController
//
// Le vaisseau miniature de l'observatoire, et l'enfant qui le regarde.
//
// Ce n'est pas un decor : c'est un petit jeu complet, avec sa console, sa piste
// d'atterrissage, ses conditions de reussite — et quelqu'un qui commente.
//
// LE CRASH A UN SEUIL. `ModelShipCrashBehavior.OnImpact` ne fait rien sous DIX
// unites par seconde de vitesse d'impact : un contact doux n'est pas un crash,
// et le modele reduit peut se poser en le touchant. Au-dela, particules, son,
// et une explosion qui HERITE de la vitesse du vaisseau — les debris partent
// dans la direction ou il allait.
//
// L'ATTERRISSAGE DEMANDE D'ETRE IMMOBILE, et pas seulement pose :
//
//   |v relative a la planete| < 0,1     u/s
//   |omega relative|          < 0,01    rad/s
//   et cela pendant 0,2 s
//
// Le second seuil est cent fois plus serre que le premier, et c'est ce qui
// rend l'exercice difficile : un modele qui tourne lentement sur lui-meme est
// « pose » pour l'oeil et ne compte pas. La rotation doit s'arreter.
//
// UNE FOIS POSE, ON NE PEUT PLUS RATER. Le build ne re-teste pas les seuils :
// `_isLanded` ne retombe que sur `OnTriggerExit`, en QUITTANT la zone. Repartir
// dans les deux dixiemes de seconde compte donc quand meme comme un
// atterrissage — a condition de rester au-dessus de la piste.
//
// ET L'ENFANT COMPTE. `RocketKidConvoController` tient deux compteurs et choisit
// son arbre de dialogue a l'ouverture de la conversation :
//
//   aucun crash, aucun atterrissage  ->  l'introduction
//   cinq crashs ou plus              ->  « trop de crashs », puis on remet a zero
//   au moins un atterrissage         ->  « bel atterrissage », puis on remet a zero
//
// Les crashs passent AVANT les atterrissages : se planter cinq fois puis reussir
// une fois vous vaut le reproche, pas le compliment. Et le compteur se remet a
// zero une fois la phrase dite — il ne la redit donc pas a la conversation
// suivante, il faut recommencer.
//
// Entre un et quatre crashs sans atterrissage, aucune branche ne s'applique et
// l'arbre COURANT reste : l'enfant redit ce qu'il a dit la derniere fois. Ce
// n'est pas un oubli du build, c'est ce qui fait qu'il ne commente pas chaque
// bosse.

/** Les seuils de `ModelShipCrashBehavior` et de `ModelShipLandingSpot`. */
export const MODELE = {
  crashSpeed: 10,
  landSpeed: 0.1,
  landSpin: 0.01,
  landHold: 0.2,
  kidCrashLimit: 5,
};

/** Les pistes d'atterrissage posees : TROIS, toutes a Timber Hearth. */
export function modelLandingSpots(gameplay) {
  return ((gameplay.placed || {}).ModelShipLandingSpot || []).map((c) => ({
    name: c.name, body: c.body || null, position: c.position,
    volume: c.volume || null,
  }));
}

/** Le vaisseau miniature lui-meme, et le son de son crash. */
export function modelShipBody(gameplay) {
  const c = ((gameplay.placed || {}).ModelShipCrashBehavior || [])[0];
  if (!c) return null;
  const f = c.fields || {};
  return {
    name: c.name, body: c.body || null, position: c.position,
    rotation: c.rotation || [0, 0, 0, 1],
    crashSound: (f._crashSound && f._crashSound.name) || null,
  };
}

/**
 * L'enfant, et ses trois arbres.
 *
 * Ils sont designes par POINTEUR et resolus a l'extraction : `trees` porte les
 * trois identifiants, et c'est tout ce dont la selection a besoin.
 */
export function rocketKids(gameplay) {
  return ((gameplay.placed || {}).RocketKidConvoController || []).map((c) => ({
    name: c.name, body: c.body || null, position: c.position,
    trees: {
      introduction: (c.trees || {})._introduction || null,
      successfulLanding: (c.trees || {})._successfulLanding || null,
      tooManyCrashes: (c.trees || {})._tooManyCrashes || null,
    },
  }));
}

/** Un contact doux n'est pas un crash. */
export function crashes(impactSpeed, cfg = MODELE) {
  return impactSpeed > cfg.crashSpeed;
}

/** Le vaisseau miniature est-il assez immobile pour compter comme pose ? */
export function stillEnough(relSpeed, relSpin, cfg = MODELE) {
  return relSpeed < cfg.landSpeed && relSpin < cfg.landSpin;
}

/**
 * La piste d'atterrissage du modele reduit.
 *
 * Elle ne fait rien tant que le vaisseau n'est pas DEDANS : c'est le collider
 * qui l'allume, et le quitter remet tout a zero.
 */
export class ModelLandingSpot {
  constructor(cfg = MODELE) {
    this.cfg = cfg;
    this.inside = false;
    this.landed = false;
    this.since = 0;
    this.announced = false;
  }

  /** `OnTriggerEnter` / `OnTriggerExit`, sur le tag `ModelShipDetector`. */
  setInside(dedans) {
    if (dedans === this.inside) return;
    this.inside = !!dedans;
    // Quitter la zone efface l'atterrissage : on ne revient pas « pose ».
    this.landed = false;
    this.announced = false;
  }

  /**
   * @returns {boolean} vrai la seule fois ou l'atterrissage est annonce.
   */
  update(now, relSpeed, relSpin) {
    if (!this.inside) return false;
    if (!this.landed) {
      if (!stillEnough(relSpeed, relSpin, this.cfg)) return false;
      this.since = now;
      this.landed = true;
      return false;
    }
    // Pose : le build ne RE-TESTE pas les seuils. Seule la sortie de la zone
    // annule, et c'est pour cela que repartir tout de suite compte quand meme.
    if (this.announced || now <= this.since + this.cfg.landHold) return false;
    this.announced = true;
    return true;
  }

  reset() { this.landed = false; this.announced = false; this.inside = false; }
}

/**
 * L'enfant qui regarde, et ce qu'il a a dire.
 *
 * Rend le NOM de l'arbre choisi plutot que l'arbre : le portage lit ses
 * dialogues par references (docs/46), et cette classe n'a pas a les connaitre.
 */
export class RocketKid {
  constructor(cfg = MODELE) {
    this.cfg = cfg;
    this.crashes = 0;
    this.landings = 0;
  }

  crashed() { this.crashes++; }
  landed() { this.landings++; }

  /**
   * `OnStartConversation` : l'ordre compte, et il n'est pas celui qu'on
   * choisirait — les crashs passent avant les reussites.
   *
   * @returns {"introduction"|"tooManyCrashes"|"successfulLanding"|null}
   */
  tree() {
    if (this.crashes === 0 && this.landings === 0) return "introduction";
    if (this.crashes >= this.cfg.kidCrashLimit) {
      this.crashes = 0;
      return "tooManyCrashes";
    }
    if (this.landings > 0) {
      this.landings = 0;
      return "successfulLanding";
    }
    // Entre un et quatre crashs : l'arbre courant reste, et il ne commente pas.
    return null;
  }

  reset() { this.crashes = 0; this.landings = 0; }
}
