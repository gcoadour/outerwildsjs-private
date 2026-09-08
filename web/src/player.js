// Controleur joueur : chute libre sous le champ dominant, alignement sur la
// verticale locale, appui au sol. Les constantes proviennent de
// PlayerCharacterController tel qu'extrait du build.
//
// Deux moteurs interchangeables :
//   - Havok, quand la geometrie reelle et ses colliders sont disponibles ;
//   - integration analytique contre des spheres, en repli.
// Les deux partagent le meme modele de gravite et les memes commandes.

import { dominantField } from "./gravity.js";

export class Player {
  constructor(consts, start) {
    this.c = consts;
    this.pos = { x: start[0], y: start[1], z: start[2] }; // monde
    this.vel = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.field = null;
    this.fluid = null;    // volume de fluide traverse, ou null
    this.thrust = 18;     // acceleration du sac dorsal
    this.mass = 70;
    this.body = null;     // agregat Havok, si physique active
    this.scene = null;
  }

  usePhysics(BABYLON, scene, aggregate) {
    this.BABYLON = BABYLON;
    this.scene = scene;
    this.body = aggregate;
  }

  get physics() { return !!this.body; }

  /**
   * @param world { directional, framePos, fluids } — le monde au-dela des corps :
   *        champs de force places, et fluides. Absent, on retrouve exactement le
   *        comportement d'avant.
   */
  update(dt, bodies, input, basis, origin, world = null) {
    this.field = dominantField(bodies, this.pos, world);
    if (this.physics) this.stepPhysics(dt, input, basis, origin);
    else this.stepAnalytic(dt, bodies, input, basis);
    this.fluid = this.applyFluid(dt, world);
    return this.field;
  }

  /**
   * Trainee et poussee du fluide traverse.
   *
   * Sous Havok, la vitesse vit dans le corps physique : la corriger sur `vel`
   * seul ne ferait rien du tout, il faut la lui rendre.
   */
  applyFluid(dt, world) {
    const field = world && world.fluids;
    if (!field || !field.count) return null;
    const o = (world && world.framePos) || [0, 0, 0];
    const hit = field.apply([this.pos.x + o[0], this.pos.y + o[1], this.pos.z + o[2]],
                            this.vel, dt, this.field);
    if (hit && this.physics) {
      try {
        this.body.body.setLinearVelocity(
          new this.BABYLON.Vector3(this.vel.x, this.vel.y, this.vel.z));
      } catch (e) { /* corps deja libere */ }
    }
    return hit;
  }

  // --- moteur Havok ---

  stepPhysics(dt, input, basis, origin) {
    const B = this.BABYLON;
    const body = this.body.body;
    const node = this.body.transformNode;

    // Le repere de travail EST celui du corps ancre : la position du corps
    // physique s'y lit directement. Y rajouter origin.offset compterait deux
    // fois le decalage, ce qui envoyait le joueur a des milliers d'unites.
    this.pos.x = node.position.x;
    this.pos.y = node.position.y;
    this.pos.z = node.position.z;

    const v = body.getLinearVelocity();
    this.vel.x = v.x; this.vel.y = v.y; this.vel.z = v.z;

    // gravite : le moteur en est depourvu, on applique le champ dominant
    const f = this.field;
    const force = new B.Vector3(0, 0, 0);
    if (f) {
      force.addInPlace(new B.Vector3(f.dir.x, f.dir.y, f.dir.z).scale(f.magnitude * this.mass));
    }

    // propulsion, dans le repere de la camera
    const t = this.thrust * this.mass * (input.boost ? 3 : 1);
    force.addInPlace(basis.fwd.scale(input.forward * t));
    force.addInPlace(basis.right.scale(input.right * t));
    if (input.up && f) {
      force.addInPlace(new B.Vector3(-f.dir.x, -f.dir.y, -f.dir.z).scale(t));
    }
    body.applyForce(force, node.absolutePosition);

    this.grounded = this.probeGround(basis.up);
  }

  /**
   * Appui au sol par lancer de rayon vers le bas local. Havok expose le contact
   * mais un rayon court donne aussi la distance, ce qui evite de coller le
   * joueur a une paroi verticale prise pour un sol.
   */
  probeGround(up) {
    const B = this.BABYLON;
    const eng = this.scene.getPhysicsEngine();
    if (!eng || !eng.raycast) return false;
    const p = this.body.transformNode.absolutePosition;
    const to = p.add(up.scale(-1.4));
    try {
      const hit = eng.raycast(p, to);
      return !!(hit && hit.hasHit);
    } catch (e) {
      return false;
    }
  }

  // --- moteur analytique (repli sans Havok) ---

  stepAnalytic(dt, bodies, input, basis) {
    if (this.field) {
      const g = this.field.magnitude;
      this.vel.x += this.field.dir.x * g * dt;
      this.vel.y += this.field.dir.y * g * dt;
      this.vel.z += this.field.dir.z * g * dt;
    }
    const t = this.thrust * (input.boost ? 3 : 1) * dt;
    this.vel.x += (basis.fwd.x * input.forward + basis.right.x * input.right) * t;
    this.vel.y += (basis.fwd.y * input.forward + basis.right.y * input.right) * t;
    this.vel.z += (basis.fwd.z * input.forward + basis.right.z * input.right) * t;
    if (input.up && this.field) {
      this.vel.x -= this.field.dir.x * t;
      this.vel.y -= this.field.dir.y * t;
      this.vel.z -= this.field.dir.z * t;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    this.resolveGround(bodies);
  }

  /**
   * Collision analytique : les corps sont des spheres de rayon connu. Le relief
   * du terrain n'est donc pas pris en compte ; c'est le repli quand Havok et la
   * geometrie reelle ne sont pas disponibles.
   */
  resolveGround(bodies) {
    this.grounded = false;
    const eye = 1.7;
    for (const b of bodies) {
      const R = (b.gravity.upperSurfaceRadius || 0) + eye;
      const dx = this.pos.x - b.position[0];
      const dy = this.pos.y - b.position[1];
      const dz = this.pos.z - b.position[2];
      const d = Math.hypot(dx, dy, dz);
      if (d >= R || d === 0) continue;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      this.pos.x = b.position[0] + nx * R;
      this.pos.y = b.position[1] + ny * R;
      this.pos.z = b.position[2] + nz * R;
      const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= vn * nx; this.vel.y -= vn * ny; this.vel.z -= vn * nz;
      }
      const fr = 0.86;
      this.vel.x *= fr; this.vel.y *= fr; this.vel.z *= fr;
      this.grounded = true;
      break;
    }
  }
}
