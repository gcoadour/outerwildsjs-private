// Degats du vaisseau, piece par piece.
//
// `ShipDamageController` porte quatre champs que le portage laissait de cote :
//
//   _damageLocationMask            quelles positions peuvent etre touchees
//   _genericPartImpactModifier     part des degats reportee sur une piece
//   _enginePartImpactModifier      la meme chose pour les reacteurs
//   _disableDamagedThrusters       une piece detruite coupe son propulseur
//
// MESURE PLUTOT QUE SUPPOSEE : dans ce build, les trois premiers valent ZERO.
// Un masque nul ne designe aucune position et un modificateur nul ne reporte
// rien : avec les valeurs de l'alpha, le vaisseau n'a PAS de degats localises.
// Seule son integrite globale bouge. Ce n'est pas un oubli du portage, c'est
// l'etat du jeu a cette date — la mecanique est cablee, les reglages ne
// l'allument pas encore.
//
// Le mecanisme est porte quand meme, et il s'allume des qu'un masque est
// declare : c'est ce qui permet de le verifier, et ce qui rendra le jour ou
// une version ulterieure posera d'autres valeurs.

import { impactDamage, DAMAGE } from "./autopilot.js";

/** Positions d'impact, en bits — l'ordre est celui du repere du vaisseau. */
export const LOCATIONS = {
  avant: 1, arriere: 2, gauche: 4, droite: 8, haut: 16, bas: 32,
};
export const ALL_LOCATIONS = 63;

/** Nom de la piece qui occupe chaque position. */
const PART_AT = {
  avant: "cockpit", arriere: "reacteur", gauche: "aile gauche",
  droite: "aile droite", haut: "coque superieure", bas: "train d'atterrissage",
};

/** La position d'un impact, depuis sa normale exprimee dans le repere du vaisseau. */
export function locationOf(normal) {
  const [x, y, z] = normal;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (az >= ax && az >= ay) return z > 0 ? "avant" : "arriere";
  if (ax >= ay) return x > 0 ? "droite" : "gauche";
  return y > 0 ? "haut" : "bas";
}

export class ShipDamage {
  /**
   * @param fields champs de ShipDamageController, tels qu'extraits
   */
  constructor(fields = {}) {
    this.mask = fields._damageLocationMask ?? 0;
    this.generic = fields._genericPartImpactModifier ?? 0;
    this.engine = fields._enginePartImpactModifier ?? 0;
    this.disableDamagedThrusters = !!fields._disableDamagedThrusters;
    this.total = DAMAGE.total;

    this.integrity = this.total;
    this.parts = {};
    for (const k of Object.keys(LOCATIONS)) {
      this.parts[k] = { name: PART_AT[k], integrity: this.total, dead: false };
    }
    this.destroyed = false;
    this.lastImpact = 0;
    this.lastLocation = null;
  }

  /** La position est-elle declaree dans le masque ? */
  covers(location) {
    return (this.mask & (LOCATIONS[location] || 0)) !== 0;
  }

  /**
   * Un impact.
   *
   * @param speed  vitesse NORMALE a la surface, en u/s
   * @param normal normale de l'impact dans le repere du vaisseau, ou null
   * @returns {damage, location, part, destroyed}
   */
  impact(speed, normal = null) {
    const damage = impactDamage(speed);
    if (damage <= 0) return { damage: 0, location: null, part: 0, destroyed: this.destroyed };

    this.lastImpact = Math.round(speed);
    this.integrity = Math.max(0, this.integrity - damage);

    const loc = normal ? locationOf(normal) : null;
    this.lastLocation = loc;
    let part = 0;
    if (loc && this.covers(loc)) {
      // La piece touchee prend sa part des degats. Le reacteur a son propre
      // modificateur ; tout le reste partage le modificateur generique.
      const mod = loc === "arriere" ? this.engine : this.generic;
      part = damage * mod;
      if (part > 0) {
        const p = this.parts[loc];
        p.integrity = Math.max(0, p.integrity - part);
        if (p.integrity <= 0) p.dead = true;
      }
    }

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
    for (const p of Object.values(this.parts)) { p.integrity = this.total; p.dead = false; }
  }

  get summary() {
    const dead = this.deadParts;
    return `coque ${this.integrity.toFixed(0)}%` +
      (this.destroyed ? " — detruit" : "") +
      (dead.length ? ` — ${dead.length} piece(s) hors service` : "");
  }
}
