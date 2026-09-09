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
//
// Correction de fond (docs/36-audit.md §2.2) : `_usePhysicsToRotate` vaut VRAI
// et `_angularDrag` etait lu sans jamais servir. Le vaisseau collait
// instantanement au repere camera — il tournait comme une camera, pas comme un
// engin de plusieurs tonnes. Il porte desormais son propre quaternion, integre
// au second ordre :
//
//   omega += couple x _maxRotationalThrust (2) x dt
//   omega *= _angularDrag (0,92)^(dt x 60)      convention Unity, ramenee a dt
//   q = normalise(q + 1/2 omega (x) q dt)
//
// La camera SUIT le vaisseau au lieu de le commander : l'ecart entre le regard
// et le nez devient visible, et c'est exactement la lourdeur que decrit
// docs/07-gameplay.md.

import { dominantField } from "./gravity.js";
import { ShipDamage } from "./shipdamage.js";
import { frameFriction } from "./player.js";
import { spawnPoints, nearestTo } from "./start.js";

/** Multiplication de quaternions [x, y, z, w]. */
export function quatMul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
          a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
          a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
          a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}

export function quatNorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotation d'un vecteur par un quaternion. */
export function quatRotate(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

/**
 * Un pas d'integration de l'orientation.
 *
 * `omega` est en repere MONDE : q' = q + 1/2 (omega (x) q) dt, puis
 * renormalisation. C'est l'integration au premier ordre d'Unity, suffisante
 * tant que `omega dt` reste petit.
 */
export function spinStep(q, omega, dt) {
  const w = [omega[0], omega[1], omega[2], 0];
  const d = quatMul(w, q);
  return quatNorm([q[0] + 0.5 * d[0] * dt, q[1] + 0.5 * d[1] * dt,
                   q[2] + 0.5 * d[2] * dt, q[3] + 0.5 * d[3] * dt]);
}

/**
 * Vitesse angulaire terminale d'un axe : couple / (1 - trainee).
 *
 * A chaque pas fixe, omega gagne `couple x dt` et perd `(1 - drag)`. La serie
 * geometrique converge vers `couple x dt / (1 - drag)` par pas, soit
 * `couple / (1 - drag) x dt` par seconde a 60 im/s — c'est l'invariant garde
 * dans tests/09-jeu.mjs.
 */
export function terminalAngularSpeed(torque, drag, step = 1 / 60) {
  return drag >= 1 ? Infinity : (torque * step) / (1 - drag);
}

export class Ship {
  constructor(consts, node, startPos, damageFields = {}) {
    this.thrust = consts._maxTranslationalThrust ?? 50;
    this.angularDrag = consts._angularDrag ?? 0.92;
    this.rotationalThrust = consts._maxRotationalThrust ?? 2;
    // `_usePhysicsToRotate` : vrai dans le build. Faux ferait retomber le
    // vaisseau sur l'ancien comportement, ou il collait au repere camera.
    this.usePhysicsToRotate = consts._usePhysicsToRotate !== false;
    this.node = node;                       // noeud glTF du vaisseau
    this.pos = { x: startPos[0], y: startPos[1], z: startPos[2] };
    this.vel = { x: 0, y: 0, z: 0 };
    this.quat = [0, 0, 0, 1];               // orientation propre
    this.omega = [0, 0, 0];                 // vitesse angulaire, repere monde
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
    // Sonde de terrain, posee par main.js quand Havok et la geometrie reelle
    // sont la : (position, haut local, portee) -> { distance, point, normale },
    // ou null. Sans elle, on retombe sur la sphere analytique.
    this.probe = null;
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

  /** Axes propres du vaisseau : avant, droite, haut. */
  get axes() {
    return { fwd: quatRotate(this.quat, [0, 0, 1]),
             right: quatRotate(this.quat, [1, 0, 0]),
             up: quatRotate(this.quat, [0, 1, 0]) };
  }

  /** Rapproche la geometrie de la position ET de l'orientation simulees. */
  sync(BABYLON) {
    if (!this.node) return;
    this.node.setAbsolutePosition(
      new BABYLON.Vector3(this.pos.x, this.pos.y, this.pos.z));
    if (this.usePhysicsToRotate) {
      const q = this.quat;
      if (!this.node.rotationQuaternion) {
        this.node.rotationQuaternion = new BABYLON.Quaternion(q[0], q[1], q[2], q[3]);
      } else {
        this.node.rotationQuaternion.set(q[0], q[1], q[2], q[3]);
      }
    }
  }

  /**
   * Oriente le vaisseau une fois pour toutes, au posage initial.
   *
   * Sans cela son quaternion part de l'identite : son « haut » serait celui du
   * repere de travail, pas la verticale locale, et la poussee verticale
   * pousserait de travers des la premiere image.
   */
  orientTo(up, fwd) {
    const n = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const u = n(up);
    let f = fwd ? fwd.slice() : [0, 0, 1];
    const d = f[0] * u[0] + f[1] * u[1] + f[2] * u[2];
    f = n([f[0] - u[0] * d, f[1] - u[1] * d, f[2] - u[2] * d]);
    if (!isFinite(f[0])) f = n([u[1], -u[0], 0]);
    const r = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2],
               u[0] * f[1] - u[1] * f[0]];
    // matrice [droite, haut, avant] -> quaternion
    const m = [r, u, f];
    const tr = m[0][0] + m[1][1] + m[2][2];
    let q;
    if (tr > 0) {
      const s2 = Math.sqrt(tr + 1) * 2;
      q = [(m[1][2] - m[2][1]) / s2, (m[2][0] - m[0][2]) / s2,
           (m[0][1] - m[1][0]) / s2, s2 / 4];
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
      const s2 = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
      q = [s2 / 4, (m[1][0] + m[0][1]) / s2, (m[2][0] + m[0][2]) / s2,
           (m[1][2] - m[2][1]) / s2];
    } else if (m[1][1] > m[2][2]) {
      const s2 = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
      q = [(m[1][0] + m[0][1]) / s2, s2 / 4, (m[2][1] + m[1][2]) / s2,
           (m[2][0] - m[0][2]) / s2];
    } else {
      const s2 = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
      q = [(m[2][0] + m[0][2]) / s2, (m[2][1] + m[1][2]) / s2, s2 / 4,
           (m[0][1] - m[1][0]) / s2];
    }
    this.quat = quatNorm(q);
    this.omega = [0, 0, 0];
    return this.quat;
  }

  /** Distance du joueur au vaisseau, dans le repere courant. */
  distanceTo(p) {
    return Math.hypot(this.pos.x - p.x, this.pos.y - p.y, this.pos.z - p.z);
  }

  /**
   * Un pas de rotation.
   *
   * Le couple vient des commandes : tangage et lacet suivent l'ecart entre le
   * nez et le regard, le roulis est un axe a part entiere — la manette et le
   * clavier le prevoyaient, le portage ne l'avait pas.
   */
  rotate(dt, input, basis) {
    if (!this.usePhysicsToRotate) return this.quat;
    const a = this.axes;
    const torque = [0, 0, 0];
    // Un vaisseau qu'on vient de quitter ne se fige pas en plein virage : il
    // ne recoit plus de couple, mais sa trainee angulaire continue de l'arreter.
    // Tangage et lacet : on vise la direction du regard. Le produit vectoriel
    // du nez vers la cible donne l'axe et, a petit angle, l'amplitude.
    if (this.boarded && basis && basis.fwd) {
      const t = [basis.fwd.x, basis.fwd.y, basis.fwd.z];
      torque[0] += a.fwd[1] * t[2] - a.fwd[2] * t[1];
      torque[1] += a.fwd[2] * t[0] - a.fwd[0] * t[2];
      torque[2] += a.fwd[0] * t[1] - a.fwd[1] * t[0];
    }
    const roll = (this.boarded && input && input.roll)
      ? Math.max(-1, Math.min(1, input.roll)) : 0;
    if (roll) {
      torque[0] -= a.fwd[0] * roll;
      torque[1] -= a.fwd[1] * roll;
      torque[2] -= a.fwd[2] * roll;
    }
    const k = this.rotationalThrust * (this.destroyed ? 0 : 1);
    this.omega[0] += torque[0] * k * dt;
    this.omega[1] += torque[1] * k * dt;
    this.omega[2] += torque[2] * k * dt;
    // `_angularDrag` est une fraction PAR PAS FIXE dans Unity : la ramener a dt
    // rend le comportement independant de la frequence d'images (§2.5).
    const d = frameFriction(this.angularDrag, dt);
    this.omega[0] *= d; this.omega[1] *= d; this.omega[2] *= d;
    this.quat = spinStep(this.quat, this.omega, dt);
    return this.quat;
  }

  update(dt, bodies, input, basis, world = null) {
    const f = dominantField(bodies, this.pos, world);
    if (f) {
      this.vel.x += f.dir.x * f.magnitude * dt;
      this.vel.y += f.dir.y * f.magnitude * dt;
      this.vel.z += f.dir.z * f.magnitude * dt;
    }
    // Coriolis et force centrifuge du repere tournant : le vaisseau les subit
    // comme le joueur, et c'est ce qui fait defiler le sol sous un stationnaire.
    const inert = world && world.inertial ? world.inertial(this.pos, this.vel) : null;
    if (inert) {
      this.vel.x += inert[0] * dt;
      this.vel.y += inert[1] * dt;
      this.vel.z += inert[2] * dt;
    }

    this.rotate(dt, input, basis);

    if (this.boarded) {
      const t = this.effectiveThrust * dt;
      // La poussee suit le NEZ du vaisseau, pas le regard : c'est ce qui rend
      // la rotation lourde consequente. Chaque direction passe par son
      // propulseur, et une piece morte coupe le sien quand
      // `_disableDamagedThrusters` est vrai.
      const a = this.usePhysicsToRotate ? this.axes
        : { fwd: [basis.fwd.x, basis.fwd.y, basis.fwd.z],
            right: [basis.right.x, basis.right.y, basis.right.z],
            up: [basis.up.x, basis.up.y, basis.up.z] };
      const fw = input.forward * this.damage.thrustFactor(input.forward > 0 ? "arriere" : "avant");
      const rt = input.right * this.damage.thrustFactor(input.right > 0 ? "gauche" : "droite");
      this.vel.x += (a.fwd[0] * fw + a.right[0] * rt) * t;
      this.vel.y += (a.fwd[1] * fw + a.right[1] * rt) * t;
      this.vel.z += (a.fwd[2] * fw + a.right[2] * rt) * t;
      if (input.up && this.damage.thrustFactor("bas")) {
        this.vel.x += a.up[0] * t; this.vel.y += a.up[1] * t; this.vel.z += a.up[2] * t;
      }
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    this.resolveGround(dt, bodies, basis);

    // Fluides : ce qui vaut pour le joueur vaut pour le vaisseau. Poser un
    // vaisseau sur Giant's Deep sans que rien ne freine n'avait pas de sens.
    // Le facteur de trainee est celui de `ShipFluidDetector`.
    this.fluid = (world && world.fluids && world.fluids.count)
      ? world.fluids.apply(
          [this.pos.x + (world.framePos ? world.framePos[0] : 0),
           this.pos.y + (world.framePos ? world.framePos[1] : 0),
           this.pos.z + (world.framePos ? world.framePos[2] : 0)],
          this.vel, dt, f, { dragFactor: world.fluids.dragFactor("ship") })
      : null;
    return f;
  }

  /**
   * Appui au sol.
   *
   * Le vaisseau se posait sur une SPHERE de rayon `upperSurfaceRadius`, donc
   * au-dessus du terrain : il flottait sur les vallees et traversait les
   * montagnes. Quand `probe` est branchee — Havok et la geometrie reelle sont
   * la — on lance un rayon vers le bas local et on se pose sur le contact
   * reel. La sphere analytique reste le repli, et le filet de securite qui
   * empeche de tomber au centre de la planete.
   */
  resolveGround(dt, bodies, basis) {
    this.landed = false;
    for (const b of bodies) {
      const R = (b.gravity.upperSurfaceRadius || 0) + this.radius;
      const d = [this.pos.x - b.position[0], this.pos.y - b.position[1],
                 this.pos.z - b.position[2]];
      const dist = Math.hypot(...d);
      // Terrain reel : on ne teste que dans le voisinage de la surface, pour
      // ne pas lancer un rayon a chaque image depuis l'orbite.
      const n0 = dist > 0 ? d.map((v) => v / dist) : [0, 1, 0];
      if (this.probe && dist < R + 60 && dist > 0) {
        const hit = this.probe(this.pos, n0, this.radius + 60);
        if (hit && hit.distance <= this.radius) {
          this.contact(dt, hit.point, hit.normal || n0, basis);
          return true;
        }
        if (hit) continue;   // terrain vu, plus loin que la coque : rien a faire
      }
      if (dist >= R || dist === 0) continue;
      this.contact(dt, [b.position[0] + n0[0] * R, b.position[1] + n0[1] * R,
                        b.position[2] + n0[2] * R], n0, basis);
      return true;
    }
    return false;
  }

  /** Pose le vaisseau sur un point de contact, avec les degats correspondants. */
  contact(dt, point, n, basis) {
    this.pos.x = point[0]; this.pos.y = point[1]; this.pos.z = point[2];
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
    // Le frottement au sol etait applique PAR IMAGE : a 30 im/s le vaisseau
    // glissait deux fois plus loin qu'a 60 (§2.5).
    const fr = frameFriction(0.7, dt);
    this.vel.x *= fr; this.vel.y *= fr; this.vel.z *= fr;
    this.landed = true;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z); }
}

/**
 * Point d'apparition du vaisseau le plus proche d'une position monde.
 *
 * Le tri des points entre joueur et vaisseau vit dans `start.js`, avec celui du
 * depart : deux filtres separes finissaient par diverger, et c'est la meme
 * question posee deux fois.
 */
export function shipSpawn(gameplay, nearWorld) {
  const p = nearestTo(spawnPoints(gameplay, { ship: true }), nearWorld);
  return p ? p.position : null;
}
