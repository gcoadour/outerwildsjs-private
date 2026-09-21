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
// Restent nuls, et ceux-la pour de bon : `_genericPartImpactModifier` et
// `_enginePartImpactModifier`, qu'aucune methode de la classe n'emploie.
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
// de droite. Leur `_impactThreshold` vaut ZERO : n'importe quel choc abime le
// reacteur le plus proche.

// @lit ShipDamageController, ShipComponent, EngineComponent
// Le modele de degats du build, relu a l'endroit (docs/49-queue.md).

import { impactDamage, DAMAGE } from "./autopilot.js";

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
      // Zero sur les dix : n'importe quel choc abime le reacteur le plus proche.
      impactThreshold: f._impactThreshold ?? 0,
      integrity: f._integrity ?? 100,
    };
  });
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
    this.shipTotalHealth = fields._shipTotalHealth ?? DAMAGE.total;
    this.instantDeathSpeed = fields._instantDeathSpeed ?? DAMAGE.instantDeath ?? 300;
    this.total = DAMAGE.total;

    this.integrity = this.total;
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
    const damage = impactDamage(speed);
    if (damage <= 0) return { damage: 0, location: null, part: 0, destroyed: this.destroyed };

    this.lastImpact = Math.round(speed);
    this.integrity = Math.max(0, this.integrity - damage);

    // Le build choisit par PROXIMITE quand il a des composants poses, et le
    // portage retombe sur la normale quand il n'en a pas.
    const proche = this.nearestEngine(point);
    const loc = proche ? proche.location : (normal ? locationOf(normal) : null);
    this.lastLocation = loc;

    let part = 0;
    // Trois pieces abimees au plus : au-dela, un impact ne fait plus de
    // nouvelle victime. Une piece deja abimee peut toujours l'etre davantage.
    const abimees = Object.values(this.parts).filter((p) => p.totalDamage > 0);
    const deja = loc ? this.parts[loc] && this.parts[loc].totalDamage > 0 : false;
    if (loc && this.parts[loc] && (deja || abimees.length < 3)) {
      const seuil = proche ? proche.impactThreshold : 0;
      if (speed > seuil) {
        // force = 100 x (|v| - seuil) / (mortInstantanee - seuil)
        const denom = (this.instantDeathSpeed - seuil) || 1;
        part = 100 * (speed - seuil) / denom;
        const p = this.parts[loc];
        p.integrity = Math.max(0, p.integrity - part);
        p.totalDamage += part;
        if (p.integrity <= 0) p.dead = true;
        // Le masque d'alerte s'accumule, et c'est lui que le HUD affiche.
        this.mask |= LOCATIONS[loc];
      }
    }

    // Deux morts distinctes : le choc unique trop violent, et l'usure.
    if (speed > this.instantDeathSpeed) this.destroyed = true;
    const cumul = Object.values(this.parts).reduce((s, p) => s + p.totalDamage, 0);
    if (cumul > this.shipTotalHealth) this.destroyed = true;
    if (this.integrity <= 0) this.destroyed = true;
    return { damage, location: loc, part, destroyed: this.destroyed };
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
    // L'integrite de coque est la moyenne des pieces : elle remonte d'autant.
    const parts = Object.values(this.parts);
    this.integrity = parts.reduce((s, x) => s + x.integrity, 0) / parts.length;
    if (this.integrity > 0) this.destroyed = false;
    return cible;
  }

  /** Pieces mortes, dans l'ordre des positions. */
  get deadParts() {
    return Object.entries(this.parts).filter(([, p]) => p.dead).map(([k]) => k);
  }

  reset() {
    this.integrity = this.total;
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
