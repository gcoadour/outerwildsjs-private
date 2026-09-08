// Le vaisseau.
//
// Sa geometrie est deja dans timberhearth_pivot.gltf, sous
// TimberHearth_Body/ShipContainer/Ship_Body. On la deplace au point
// d'apparition SpawnPoint_Ship plutot qu'a sa position enregistree : dans le
// jeu, vaisseau et joueur sont places a l'execution par un SpawnPoint, pas la
// ou la scene les enregistre (sa position enregistree tombe d'ailleurs sous la
// surface).
//
// Constantes de ShipThrusterModel : poussee 50, poussee rotationnelle 2,
// trainee angulaire 0,92 — soit un engin bien plus puissant et bien plus lourd
// a tourner que le sac dorsal (7).

import { dominantField } from "./gravity.js";
import { ShipDamage } from "./shipdamage.js";

export class Ship {
  constructor(consts, node, startPos, damageFields = {}) {
    this.thrust = consts._maxTranslationalThrust ?? 50;
    this.angularDrag = consts._angularDrag ?? 0.92;
    this.node = node;                       // noeud glTF du vaisseau
    this.pos = { x: startPos[0], y: startPos[1], z: startPos[2] };
    this.vel = { x: 0, y: 0, z: 0 };
    this.boarded = false;
    this.landed = false;
    this.radius = 6;                        // demi-taille approximative
    // Degats : l'integrite globale et les pieces vivent dans ShipDamage, qui
    // porte les quatre champs de ShipDamageController.
    this.damage = new ShipDamage(damageFields);
    // Limite de poussee du secteur courant (PlanetoidSector._thrustLimit), ou
    // null hors de tout secteur. Le vaisseau garde sa pleine puissance sur la
    // premiere jumelle, ou la limite vaut 200 contre 20 partout ailleurs.
    this.thrustLimit = null;
    this.fluid = null;
  }

  get integrity() { return this.damage.integrity; }
  get destroyed() { return this.damage.destroyed; }
  get lastImpact() { return this.damage.lastImpact; }

  /** Poussee effective : bornee par le secteur, nulle si le vaisseau est detruit. */
  get effectiveThrust() {
    if (this.destroyed) return 0;
    const t = this.thrust;
    return this.thrustLimit != null ? Math.min(t, this.thrustLimit) : t;
  }

  /** Rapproche la geometrie de la position simulee. */
  sync(BABYLON) {
    if (this.node) {
      this.node.setAbsolutePosition(
        new BABYLON.Vector3(this.pos.x, this.pos.y, this.pos.z));
    }
  }

  /** Distance du joueur au vaisseau, dans le repere courant. */
  distanceTo(p) {
    return Math.hypot(this.pos.x - p.x, this.pos.y - p.y, this.pos.z - p.z);
  }

  update(dt, bodies, input, basis, world = null) {
    const f = dominantField(bodies, this.pos, world);
    if (f) {
      this.vel.x += f.dir.x * f.magnitude * dt;
      this.vel.y += f.dir.y * f.magnitude * dt;
      this.vel.z += f.dir.z * f.magnitude * dt;
    }

    if (this.boarded) {
      const t = this.effectiveThrust * dt * (input.boost ? 2 : 1);
      // Chaque direction passe par son propulseur : une piece morte coupe le
      // sien quand `_disableDamagedThrusters` est vrai.
      const fw = input.forward * this.damage.thrustFactor(input.forward > 0 ? "arriere" : "avant");
      const rt = input.right * this.damage.thrustFactor(input.right > 0 ? "gauche" : "droite");
      this.vel.x += (basis.fwd.x * fw + basis.right.x * rt) * t;
      this.vel.y += (basis.fwd.y * fw + basis.right.y * rt) * t;
      this.vel.z += (basis.fwd.z * fw + basis.right.z * rt) * t;
      if (input.up && f && this.damage.thrustFactor("bas")) {
        this.vel.x -= f.dir.x * t;
        this.vel.y -= f.dir.y * t;
        this.vel.z -= f.dir.z * t;
      }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // Appui au sol analytique. Le vaisseau ne passe pas par Havok : il n'a pas
    // de collider propre, ses maillages appartenant au sous-arbre de la
    // planete, dont les colliders sont statiques.
    this.landed = false;
    for (const b of bodies) {
      const R = (b.gravity.upperSurfaceRadius || 0) + this.radius;
      const d = [this.pos.x - b.position[0], this.pos.y - b.position[1],
                 this.pos.z - b.position[2]];
      const dist = Math.hypot(...d);
      if (dist >= R || dist === 0) continue;
      const n = d.map((v) => v / dist);
      this.pos.x = b.position[0] + n[0] * R;
      this.pos.y = b.position[1] + n[1] * R;
      this.pos.z = b.position[2] + n[2] * R;
      const vn = this.vel.x * n[0] + this.vel.y * n[1] + this.vel.z * n[2];
      if (vn < 0) {
        // Degats a l'impact, selon la vitesse normale a la surface. La normale
        // est exprimee dans le repere du vaisseau — celui de la camera quand on
        // le pilote — pour que la position de l'impact ait un sens.
        const local = basis ? [
          -(n[0] * basis.right.x + n[1] * basis.right.y + n[2] * basis.right.z),
          -(n[0] * basis.up.x + n[1] * basis.up.y + n[2] * basis.up.z),
          -(n[0] * basis.fwd.x + n[1] * basis.fwd.y + n[2] * basis.fwd.z),
        ] : null;
        this.lastHit = this.damage.impact(-vn, local);
        this.vel.x -= vn * n[0]; this.vel.y -= vn * n[1]; this.vel.z -= vn * n[2];
      }
      this.vel.x *= 0.7; this.vel.y *= 0.7; this.vel.z *= 0.7;
      this.landed = true;
      break;
    }

    // Fluides : ce qui vaut pour le joueur vaut pour le vaisseau. Poser un
    // vaisseau sur Giant's Deep sans que rien ne freine n'avait pas de sens.
    this.fluid = (world && world.fluids && world.fluids.count)
      ? world.fluids.apply(
          [this.pos.x + (world.framePos ? world.framePos[0] : 0),
           this.pos.y + (world.framePos ? world.framePos[1] : 0),
           this.pos.z + (world.framePos ? world.framePos[2] : 0)],
          this.vel, dt, f)
      : null;
    return f;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z); }
}

/** Point d'apparition du vaisseau le plus proche d'une position monde. */
export function shipSpawn(gameplay, nearWorld) {
  const pts = ((gameplay && gameplay.placed && gameplay.placed.SpawnPoint) || [])
    .filter((p) => /ship/i.test(p.name || ""));
  if (!pts.length) return null;
  let best = pts[0], bestD = Infinity;
  for (const p of pts) {
    const d = Math.hypot(p.position[0] - nearWorld[0],
                         p.position[1] - nearWorld[1],
                         p.position[2] - nearWorld[2]);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best.position;
}
