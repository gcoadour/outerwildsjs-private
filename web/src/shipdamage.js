// Degats du vaisseau, piece par piece.
//
// UNE LECTURE A L'ENVERS, CORRIGEE. Le portage lisait `_damageLocationMask`
// comme un FILTRE — « quelles positions peuvent etre touchees » — et concluait
// de sa valeur nulle que « le vaisseau n'a PAS de degats localises dans cette
// alpha ». L'IL d'`OnImpact` dit l'inverse :
//
//     mask |= composant._alertLocation;    // il s'ACCUMULE
//     si mask a change -> DamageAlert(mask)
//
// C'est une SORTIE, pas une entree : le zero est l'etat d'un vaisseau intact,
// pas un interrupteur eteint. La mecanique tournait ; le portage l'avait
// desactivee en lisant un resultat pour une permission.
//
// LES DEUX MODIFICATEURS SERVENT, et ce commentaire disait le contraire :
// « restent nuls, et ceux-la pour de bon, qu'aucune methode de la classe
// n'emploie ». `Awake` les emploie, et c'est la que tout se joue —
//
//     foreach (ShipComponent c in _components)
//         c.SetImpactThreshold(_mediumImpactThreshold + _genericPartImpactModifier);
//     foreach (ShipComponent c in _components)
//         if (c.GetType() == typeof(EngineComponent)) {
//             c.SetImpactThreshold(_mediumImpactThreshold + _enginePartImpactModifier);
//             ((EngineComponent)c).ToggleEngineDamage(_disableDamagedThrusters);
//         }
//
// — parce que `SetImpactThreshold` ECRASE le champ serialise. Les dix
// `EngineComponent` portent `_impactThreshold = 0` dans la scene, et cette
// valeur ne survit pas au reveil : tous les composants du vaisseau repartent a
// `_mediumImpactThreshold + modificateur`, soit TRENTE.
//
// Deux consequences, et ce sont des consequences de jeu (docs/113-seuil.md) :
//
//   - un choc sous trente unites par seconde n'abime AUCUNE piece. Le portage
//     lisait le zero serialise et abimait le reacteur le plus proche au moindre
//     contact ;
//   - le seuil entre deux fois dans la force, et trente au lieu de zero la
//     reduit d'autant. A cinquante unites par seconde, la piece prend 7,4 au
//     lieu de 16,7.
//
// Les deux modificateurs sont nuls, donc les generiques et les reacteurs ont le
// MEME seuil dans ce build. La distinction existe et ne se voit pas ; elle est
// portee quand meme, comme le drapeau des propulseurs.
//
// LES CINQ POSITIONS DU BUILD. `DamageAlertLocation`, lue dans la table
// Constant : Front 1, Top 2, Back 4, Left 8, Right 16. Ce sont des DRAPEAUX, et
// il n'y en a que cinq — les six positions du portage (avec un « bas » a 32)
// etaient inventees.
//
// LA PIECE TOUCHEE EST LA PLUS PROCHE. Pas celle que designe une normale : le
// build parcourt ses composants et garde celui dont le GameObject est le plus
// pres du POINT d'impact. C'est pourquoi les dix reacteurs portent une position
// dans la scene et pas une direction.
//
// TROIS PIECES ABIMEES AU PLUS. Au-dela, un impact ne fait plus de nouvelle
// victime : sa force se partage entre les pieces deja touchees.
//
// LA FORCE, ET LA MORT :
//
//     force  = |v| x 100 / (_instantDeathSpeed - seuil)      (x (|v| - seuil))
//     piece  : _integrity -= |force| ; _totalDamage -= |force|
//     explose si |v| > _instantDeathSpeed
//     explose si |somme des _totalDamage| > _shipTotalHealth
//
// Valeurs mesurees sur l'instance : seuils 15 et 30, sante 100, mort
// instantanee a 300, et `_disableDamagedThrusters` FAUX — dans cette alpha, une
// piece morte ne coupe donc aucun propulseur. Le mecanisme est porte quand
// meme, et il s'allume si le drapeau change.
//
// Les dix `EngineComponent` portent chacun une `ThrusterLocation` (Left,
// FrontLeft, TopLeft, BottomLeft, BackLeft, et les cinq de droite) et une
// `_alertLocation` qui vaut Left pour les cinq de gauche et Right pour les cinq
// de droite. Leur `_impactThreshold` serialise vaut zero, et `Awake` le remonte
// a trente : c'est le seuil du reveil qui vaut, pas celui de la scene.

// @lit ShipDamageController, ShipComponent, EngineComponent
// Le modele de degats du build, relu a l'endroit (docs/49-queue.md).

import { DAMAGE } from "./autopilot.js";

/**
 * `DamageAlertLocation`, lue dans la table Constant de l'assembly : cinq
 * drapeaux, et pas de « bas ».
 */
export const LOCATIONS = { avant: 1, haut: 2, arriere: 4, gauche: 8, droite: 16 };
export const ALL_LOCATIONS = 31;

/**
 * L'ordre des voyants du casque, qui n'est pas celui des drapeaux.
 *
 * `HUDDamageDisplay.OnDamageShip` lit le masque dans un ordre ecrit a la main,
 * et c'est lui qui range les icones : `mask & 4` va au voyant 0, `mask & 1` au
 * 1, `mask & 16` au 2, `mask & 8` au 3, `mask & 2` au 4. Soit, en clair :
 *
 *     arriere, avant, droite, gauche, haut
 *
 * Le portage rangeait ses voyants dans l'ordre de `LOCATIONS` — avant, haut,
 * arriere, gauche, droite — c'est-a-dire que trois voyants sur cinq
 * designaient la mauvaise piece.
 */
export const ALERT_ORDER = ["arriere", "avant", "droite", "gauche", "haut"];

/** `ThrusterLocation` : dix buses, cinq par cote. */
export const THRUSTERS = ["Left", "FrontLeft", "TopLeft", "BottomLeft", "BackLeft",
                          "Right", "FrontRight", "TopRight", "BottomRight", "BackRight"];

/** Nom de la piece qui occupe chaque position. */
const PART_AT = {
  avant: "cockpit", arriere: "reacteur", gauche: "aile gauche",
  droite: "aile droite", haut: "coque superieure",
};

/**
 * La position d'un impact, depuis sa normale dans le repere du vaisseau.
 *
 * Le build, lui, ne se sert PAS d'une normale : il prend la piece la plus
 * proche du point d'impact. Cette fonction reste le repli du portage pour un
 * vaisseau dont on n'a pas les positions de pieces — et, faute de « bas » dans
 * l'enumeration, un choc par en dessous compte desormais pour « arriere »,
 * qui est ou sont les reacteurs.
 */
export function locationOf(normal) {
  const [x, y, z] = normal;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (az >= ax && az >= ay) return z > 0 ? "avant" : "arriere";
  if (ax >= ay) return x > 0 ? "droite" : "gauche";
  return y > 0 ? "haut" : "arriere";
}

/**
 * Les dix reacteurs poses dans la scene, avec leur position et leur cote.
 *
 * C'est le chainon que le commentaire de `repair()` annoncait manquant : « la
 * correspondance volume -> piece passe par EngineComponent, qui n'est pas lu ».
 */
export function engineComponents(gameplay) {
  return ((gameplay.placed || {}).EngineComponent || []).map((c) => {
    const f = c.fields || {};
    const alerte = Object.entries(LOCATIONS)
      .find(([, bit]) => bit === (f._alertLocation ?? 0));
    return {
      name: c.name,
      position: c.position || null,
      thruster: THRUSTERS[f._thrusterLocation ?? 0] || null,
      thrusterIndex: f._thrusterLocation ?? 0,
      alertBit: f._alertLocation ?? 0,
      location: alerte ? alerte[0] : null,
      // Ce que la SCENE porte : zero sur les dix. `Awake` l'ecrase au reveil,
      // et c'est `awakeThreshold` ci-dessous qui donne la valeur qui vaut.
      impactThreshold: f._impactThreshold ?? 0,
      integrity: f._integrity ?? 100,
    };
  });
}

/**
 * Le seuil qu'un composant porte APRES `Awake`, et non celui de la scene.
 *
 *     c.SetImpactThreshold(_mediumImpactThreshold + modificateur);
 *
 * `SetImpactThreshold` ecrit le champ : la valeur serialisee ne survit pas au
 * reveil. Le modificateur est celui des reacteurs pour un `EngineComponent`,
 * celui des pieces generiques sinon — tous deux nuls dans ce build, donc trente
 * partout (docs/113-seuil.md).
 */
export function awakeThreshold(fields = {}, engine = false) {
  const base = fields._mediumImpactThreshold ?? DAMAGE.medium;
  const mod = engine ? (fields._enginePartImpactModifier ?? 0)
                     : (fields._genericPartImpactModifier ?? 0);
  return base + mod;
}

export class ShipDamage {
  /**
   * @param fields champs de ShipDamageController, tels qu'extraits
   */
  /**
   * @param fields champs de ShipDamageController, tels qu'extraits
   * @param engines les dix `EngineComponent`, si on les a (`engineComponents()`)
   */
  constructor(fields = {}, engines = []) {
    // `_damageLocationMask` s'ACCUMULE : sa valeur serialisee est l'etat de
    // depart, c'est-a-dire zero, et non une permission.
    this.mask = fields._damageLocationMask ?? 0;
    this.generic = fields._genericPartImpactModifier ?? 0;
    this.engine = fields._enginePartImpactModifier ?? 0;
    this.disableDamagedThrusters = !!fields._disableDamagedThrusters;
    // Les deux modificateurs sont nuls ici, donc reacteurs et pieces
    // generiques partagent le meme seuil. On garde les deux : la distinction
    // existe dans le build, et elle s'allumerait si un modificateur changeait.
    this.seuilPiece = awakeThreshold(fields, true);
    this.seuilGenerique = awakeThreshold(fields, false);
    // `_lightImpactThreshold` et `_mediumImpactThreshold` choisissent le CLIP
    // d'impact, et rien d'autre. Les prendre pour des seuils de degats etait
    // l'erreur qui a fait naitre la courbe de coque inventee.
    this.lightSound = fields._lightImpactThreshold ?? DAMAGE.light;
    this.mediumSound = fields._mediumImpactThreshold ?? DAMAGE.medium;
    this.shipTotalHealth = fields._shipTotalHealth ?? DAMAGE.total;
    this.instantDeathSpeed = fields._instantDeathSpeed ?? DAMAGE.instantDeath ?? 300;
    // L'integrite d'une PIECE, serialisee a 100 sur chacun des dix
    // `EngineComponent`. Elle n'a rien a voir avec `_shipTotalHealth`, qui
    // borne le CUMUL : les confondre faisait naitre des pieces increvables.
    this.total = DAMAGE.total;

    this.parts = {};
    for (const k of Object.keys(LOCATIONS)) {
      this.parts[k] = { name: PART_AT[k], integrity: this.total, dead: false, totalDamage: 0 };
    }
    // Les reacteurs, quand on les a : chacun sait son cote et sa buse.
    this.engines = engines;
    this.destroyed = false;
    this.lastImpact = 0;
    this.lastLocation = null;
  }

  /**
   * Quel BRUIT d'impact, et c'est tout ce que ces deux seuils commandent.
   *
   *     if (|v| >= _mediumImpactThreshold) ... _mediumImpactClip ...
   *     else if (|v| >= _lightImpactThreshold) ... _lightImpactClip ...
   *
   * Rendu comme un niveau de 0 a 2, pour que l'appelant choisisse son clip.
   */
  soundLevel(speed) {
    if (speed >= (this.mediumSound ?? DAMAGE.medium)) return 2;
    if (speed >= (this.lightSound ?? DAMAGE.light)) return 1;
    return 0;
  }

  /**
   * `RecalculateShipDamge` : la somme des `_totalDamage` des pieces.
   *
   * Le build n'a PAS d'integrite de coque. `ShipDamageController` ne porte
   * aucun champ de sante propre : il explose sur deux conditions seulement, la
   * vitesse d'un choc et ce cumul-la. L'« integrite » du vaisseau est donc ce
   * qu'il lui reste avant le cumul fatal — une soustraction, pas un compteur
   * separe (docs/113-seuil.md).
   */
  get cumul() {
    return Object.values(this.parts).reduce((s, p) => s + p.totalDamage, 0);
  }

  /**
   * Ce qu'il reste au vaisseau, de `_shipTotalHealth` a zero.
   *
   * CE QUI A ETE RETIRE : une courbe de degats de coque inventee par ce
   * portage — « progression lineaire entre le seuil leger et le seuil de mort
   * instantanee », avec une severite de 0,4 ou 1. Elle prenait
   * `_lightImpactThreshold` et `_mediumImpactThreshold` pour des seuils de
   * DEGATS ; ce sont les seuils du BRUIT, et leur seul autre emploi dans
   * `OnImpact` est de choisir entre `_lightImpactClip` et `_mediumImpactClip`.
   *
   * Elle avait une consequence qu'aucun test ne voyait : la coque mourait
   * toujours avant qu'une piece n'atteigne zero, si bien que
   * `_disableDamagedThrusters` ne pouvait JAMAIS couper un propulseur.
   */
  get integrity() {
    return Math.max(0, this.shipTotalHealth - this.cumul);
  }

  /** `ApplyDamageForce` : ce qu'une piece perd, et ce qu'elle allume. */
  _blesse(p, cle, force) {
    p.integrity = Math.max(0, p.integrity - force);
    p.totalDamage += force;
    if (p.integrity <= 0) {
      p.integrity = 0;
      p.dead = true;
    }
    // Le masque d'alerte s'accumule, et c'est lui que le HUD affiche.
    if (cle) this.mask |= LOCATIONS[cle] || 0;
  }

  /** Le vaisseau a-t-il pris quelque chose ? */
  get damaged() { return this.cumul > 0 || this.deadParts.length > 0; }

  /** La position est-elle dans le masque d'alerte COURANT ? */
  covers(location) {
    return (this.mask & (LOCATIONS[location] || 0)) !== 0;
  }

  /** Positions abimees, au sens du build : celles que le masque porte. */
  get alerted() {
    return Object.keys(LOCATIONS).filter((k) => this.covers(k));
  }

  /**
   * La piece la plus proche d'un point d'impact, exprime dans le repere du
   * vaisseau. C'est ainsi que le build choisit — pas par une normale.
   */
  nearestEngine(point) {
    if (!point || !this.engines.length) return null;
    let best = null, bestD = Infinity;
    for (const e of this.engines) {
      if (!e.position) continue;
      const d = Math.hypot(e.position[0] - point[0], e.position[1] - point[1],
                           e.position[2] - point[2]);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * Un impact.
   *
   * @param speed  vitesse NORMALE a la surface, en u/s
   * @param normal normale de l'impact dans le repere du vaisseau, ou null
   * @param point  point d'impact dans le repere du vaisseau, ou null — quand on
   *               l'a, c'est LUI qui designe la piece, comme dans le build
   * @returns {damage, location, part, destroyed}
   */
  impact(speed, normal = null, point = null) {
    // `OnImpact` n'a pas de garde d'entree : il joue un bruit selon la vitesse
    // — leger au-dessus de quinze, moyen au-dessus de trente — puis cherche la
    // piece. Un choc plus doux que le seuil leger ne fait meme pas de bruit.
    if (!(speed > 0)) {
      return { damage: 0, location: null, part: 0, destroyed: this.destroyed };
    }
    this.lastImpact = Math.round(speed);

    // Le build choisit par PROXIMITE quand il a des composants poses, et le
    // portage retombe sur la normale quand il n'en a pas.
    const proche = this.nearestEngine(point);
    const loc = proche ? proche.location : (normal ? locationOf(normal) : null);
    this.lastLocation = loc;

    let part = 0;
    // `Awake` a ecrase le seuil serialise : c'est celui du reveil qui vaut, et
    // il gate l'impact autant qu'il entre dans la force.
    const seuil = this.seuilPiece;
    const abimees = Object.values(this.parts).filter((p) => p.totalDamage > 0);

    const wasDestroyed = this.destroyed;
    if (abimees.length < 3) {
      // TANT QU'IL Y A MOINS DE TROIS PIECES ABIMEES, le choc en cherche une
      // nouvelle : la plus proche du point, et elle seule.
      if (loc && this.parts[loc] && speed > seuil) {
        // force = 100 x (|v| - seuil) / (mortInstantanee - seuil)
        const denom = (this.instantDeathSpeed - seuil) || 1;
        part = 100 * (speed - seuil) / denom;
        this._blesse(this.parts[loc], loc, part);
      }
      // `if (_instantDeathSpeed <= |velocity|) ExplodeShip();` vit DANS cette
      // branche, et pas dans l'autre. C'est une bizarrerie du build, gardee
      // telle quelle : passe trois pieces abimees, la mort instantanee par
      // vitesse ne se declenche plus, et seul le cumul peut encore tuer.
      if (speed >= this.instantDeathSpeed) this.destroyed = true;
    } else {
      // AU-DELA DE TROIS, LA FORCE SE PARTAGE — et elle ne suit plus la
      // formule. Le build applique `velocity / n` a chaque piece deja abimee
      // dont le seuil est passe, `n` etant leur nombre. Un choc a quarante
      // reparti sur trois pieces leur coute donc 13,3 chacune, bien PLUS que
      // les 3,7 de la branche ordinaire (docs/113-seuil.md).
      const concernees = abimees.filter(() => speed > seuil);
      const n = concernees.length;
      if (n > 0) {
        part = speed / n;
        for (const p of concernees) {
          const cle = Object.keys(this.parts).find((k) => this.parts[k] === p);
          this._blesse(p, cle, part);
        }
      }
    }

    // `Abs(_currentShipDamage) > _shipTotalHealth` : le CUMUL des
    // `_totalDamage`, recalcule par `RecalculateShipDamge`. Il n'y a pas de
    // troisieme condition, et pas d'integrite de coque.
    if (this.cumul > this.shipTotalHealth) this.destroyed = true;
    const justExploded = !wasDestroyed && this.destroyed;
    return { damage: this.soundLevel(speed), location: loc, part,
             destroyed: this.destroyed, justExploded };
  }

  /**
   * Poussee encore disponible dans une direction du repere du vaisseau.
   *
   * `_disableDamagedThrusters` est le seul des quatre champs a etre un booleen,
   * et le seul dont l'effet ne depend pas d'un modificateur : une piece morte
   * coupe le propulseur qui la porte. Un vaisseau detruit ne pousse plus du
   * tout.
   */
  thrustFactor(location) {
    if (this.destroyed) return 0;
    if (!this.disableDamagedThrusters) return 1;
    const p = this.parts[location];
    return p && p.dead ? 0 : 1;
  }

  /**
   * Rend une piece a son integrite.
   *
   * Dans le build, chaque `RepairVolume` est pose SUR la piece qu'il repare et
   * ne repare que celle-la. Le portage n'a pas encore la correspondance volume
   * -> piece (elle passe par `EngineComponent`, qui n'est pas lu) : sans
   * position donnee, on rend donc la piece morte la plus abimee, ce qui revient
   * au meme tant qu'on repare une piece a la fois.
   *
   * @returns {string|null} la position reparee, ou null s'il n'y avait rien a
   *   reparer.
   */
  repair(location = null) {
    const cible = location && this.parts[location]
      ? location
      : Object.entries(this.parts)
          .filter(([, p]) => p.dead || p.integrity < this.total)
          .sort((a, b) => a[1].integrity - b[1].integrity)
          .map(([k]) => k)[0];
    if (!cible) return null;
    const p = this.parts[cible];
    p.integrity = this.total;
    p.dead = false;
    p.totalDamage = 0;
    // Reparer une piece retire sa position de l'alerte.
    this.mask &= ~LOCATIONS[cible];
    // L'integrite remonte d'elle-meme : elle est `_shipTotalHealth` moins le
    // cumul, et le cumul vient de tomber.
    if (this.integrity > 0) this.destroyed = false;
    return cible;
  }

  /** Pieces mortes, dans l'ordre des positions. */
  get deadParts() {
    return Object.entries(this.parts).filter(([, p]) => p.dead).map(([k]) => k);
  }

  reset() {
    this.destroyed = false;
    this.lastImpact = 0;
    this.lastLocation = null;
    // Le masque est un cumul : le remettre a zero fait partie de la remise a
    // neuf, sans quoi l'alerte de degats survivrait a la boucle.
    this.mask = 0;
    for (const p of Object.values(this.parts)) {
      p.integrity = this.total; p.dead = false; p.totalDamage = 0;
    }
  }

  get summary() {
    const dead = this.deadParts;
    return `coque ${this.integrity.toFixed(0)}%` +
      (this.destroyed ? " — detruit" : "") +
      (dead.length ? ` — ${dead.length} piece(s) hors service` : "");
  }
}
