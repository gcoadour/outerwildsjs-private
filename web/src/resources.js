// Ressources du joueur : oxygene, carburant, integrite, sante.
// Constantes tirees de PlayerResources dans le build :
//   oxygene 400 s, carburant 15, recharge 0,75/s, sante 100, combinaison 100,
//   degats d'impact entre 20 et 40 u/s.

/**
 * Zones qui rechargent l'oxygene, hors du vaisseau.
 *
 * `main.js` passait `inSupply: ship.boarded` : SEUL LE VAISSEAU rechargeait, et
 * personne n'avait cherche ce que la scene proposait. La question se tranche
 * ici : on ramasse tout composant dont le nom parle d'oxygene, avec le volume
 * mesure sur son collider. Si le build n'en pose aucun, la liste est vide et le
 * comportement reste celui d'avant — mais on saura alors que c'est un manque de
 * l'alpha et non du portage, ce qui n'etait pas etabli.
 *
 * Les arbres de Timber Hearth en sont le cas attendu : dans le jeu final, on se
 * recharge a leur pied.
 */
export function oxygenZones(gameplay = {}) {
  const out = [];
  for (const [cls, list] of Object.entries(gameplay.placed || {})) {
    if (!/oxygen/i.test(cls)) continue;
    for (const e of list) {
      const f = e.fields || {};
      const radius = (e.volume && e.volume.radius) ||
        Object.entries(f).find(([k, v]) =>
          typeof v === "number" && v > 0 && /radius/i.test(k))?.[1] || 0;
      if (!radius) continue;
      out.push({ name: e.name, kind: cls, position: e.position, radius });
    }
  }
  return out;
}

/**
 * Le detecteur d'oxygene porte par le joueur.
 *
 * Le build en pose un : une CAPSULE de rayon 0,5 sur 2 de haut. Le portage
 * testait un POINT, ce qui rate la zone d'un demi-metre au bord — un ecart
 * mineur, mais mesurable, et le composant etait extrait sans etre lu
 * (docs/36-audit.md §2.9).
 */
export function oxygenDetector(gameplay = {}) {
  for (const [cls, list] of Object.entries(gameplay.placed || {})) {
    if (!/oxygendetector/i.test(cls)) continue;
    for (const e of list) {
      const v = e.volume || {};
      const r = v.radius || 0;
      const h = v.height || 0;
      if (!r && !h) continue;
      // portee = demi-encombrement de la capsule le long de son axe
      return { radius: r, height: h, reach: Math.max(r, h / 2) };
    }
  }
  return null;
}

/**
 * Le joueur est-il dans une zone d'oxygene ? (position monde)
 *
 * `reach` est le demi-encombrement de son detecteur : la zone est atteinte des
 * que la capsule la touche, pas seulement quand son centre y entre.
 */
export function inOxygenZone(zones, world, reach = 0) {
  for (const z of zones) {
    const d = Math.hypot(world[0] - z.position[0], world[1] - z.position[1],
                         world[2] - z.position[2]);
    if (d <= z.radius + reach) return z;
  }
  return null;
}

export class Resources {
  constructor(c = {}) {
    this.maxOxygen = c._maxOxygen ?? 400;
    this.maxFuel = c._maxFuel ?? 15;
    this.fuelRecharge = c._fuelRechargeRate ?? 0.75;
    this.maxHealth = c._maxHealth ?? 100;
    this.maxSuit = c._maxSuitIntegrity ?? 100;
    this.minImpact = c._minImpactSpeed ?? 20;
    this.maxImpact = c._maxImpactSpeed ?? 40;

    this.oxygen = this.maxOxygen;
    this.fuel = this.maxFuel;
    this.health = this.maxHealth;
    this.suit = this.maxSuit;
    this.dead = false;
  }

  /**
   * @param inSupply  dans le vaisseau ou une zone d'oxygene : tout se recharge
   * @param thrusting le sac dorsal consomme du carburant
   */
  update(dt, { inSupply = false, thrusting = false } = {}) {
    if (this.dead) return;

    if (inSupply) {
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 10);
      this.fuel = Math.min(this.maxFuel, this.fuel + dt * this.fuelRecharge * 4);
    } else {
      this.oxygen -= dt;
      if (thrusting && this.fuel > 0) this.fuel = Math.max(0, this.fuel - dt);
      else this.fuel = Math.min(this.maxFuel, this.fuel + dt * this.fuelRecharge);
    }

    // sans oxygene, la sante tombe
    if (this.oxygen <= 0) {
      this.oxygen = 0;
      this.health -= dt * 10;
    }
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }

  /**
   * Degats continus, en points : ce que fait un `HazardVolume` du build.
   *
   * Separe de `applyImpact`, qui part d'une VITESSE : ici les points sont deja
   * comptes par le volume (vingt par seconde pour la colonne de sable).
   */
  hurt(points) {
    if (!(points > 0) || this.dead) return 0;
    const before = this.health;
    this.health = Math.max(0, this.health - points);
    if (this.health <= 0) this.dead = true;
    return before - this.health;
  }

  /** Degats d'impact : nuls sous minImpact, mortels a maxImpact et au-dela. */
  applyImpact(speed) {
    if (speed < this.minImpact) return 0;
    const t = Math.min(1, (speed - this.minImpact) / (this.maxImpact - this.minImpact));
    const dmg = t * this.maxHealth;
    this.health = Math.max(0, this.health - dmg);
    if (this.health <= 0) this.dead = true;
    return dmg;
  }

  get canThrust() { return this.fuel > 0 && !this.dead; }

  summary() {
    return `O2 ${(this.oxygen).toFixed(0)}s · carb ${this.fuel.toFixed(1)}` +
           (this.health < this.maxHealth ? ` · sante ${this.health.toFixed(0)}` : "") +
           (this.dead ? " · MORT" : "");
  }
}
