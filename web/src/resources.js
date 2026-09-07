// Ressources du joueur : oxygene, carburant, integrite, sante.
// Constantes tirees de PlayerResources dans le build :
//   oxygene 400 s, carburant 15, recharge 0,75/s, sante 100, combinaison 100,
//   degats d'impact entre 20 et 40 u/s.

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
