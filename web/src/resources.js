// Ressources du joueur : oxygene, carburant, integrite, sante.
// Constantes tirees de PlayerResources dans le build :
//   oxygene 400 s, carburant 15, recharge 0,75/s, sante 100, combinaison 100,
//   degats d'impact entre 20 et 40 u/s.

/**
 * Zones d'oxygene posees dans la scene.
 *
 * Le portage ne rechargeait QUE dans le vaisseau (`inSupply: ship.boarded`) :
 * les arbres de Timber Hearth, sous lesquels on se refait une reserve, ne
 * comptaient pas. L'extracteur ramasse toute classe de la scene dont le nom
 * parle d'oxygene, avec le collider qui lui sert de volume ; on prend ce qui
 * en sort, quel que soit son nom.
 *
 * Si rien n'en sort, ce n'est pas un manque du portage mais de l'alpha, et le
 * vaisseau reste la seule source — ce que le compte ci-dessous permet de dire.
 */
export function oxygenVolumes(gameplay) {
  const out = [];
  for (const [cls, list] of Object.entries((gameplay || {}).placed || {})) {
    if (!/oxygen/i.test(cls)) continue;
    for (const e of list) {
      const f = e.fields || {};
      const r = f._radius ?? f._oxygenRadius ?? (e.volume && e.volume.radius) ?? 0;
      if (r > 0) out.push({ name: e.name, cls, position: e.position, radius: r });
    }
  }
  return out;
}

/** Est-on dans une zone d'oxygene ? Position dans le repere courant. */
export function inOxygen(volumes, pos, frameOffset) {
  const o = frameOffset || [0, 0, 0];
  for (const v of volumes) {
    const d = Math.hypot(v.position[0] - o[0] - pos.x,
                         v.position[1] - o[1] - pos.y,
                         v.position[2] - o[2] - pos.z);
    if (d < v.radius) return v;
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
