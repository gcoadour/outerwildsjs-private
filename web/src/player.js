// Controleur joueur.
//
// Deux regimes, et c'est la correction de fond de docs/36-audit.md §2.1 : le
// portage n'avait PAS de marche. On se deplacait au sol comme dans le vide, a
// la poussee, sans vitesse maximale, sans saut — alors que toutes les
// constantes de `PlayerCharacterController` etaient deja extraites, chargees,
// rangees dans `this.c` et jamais lues.
//
//   au sol   v_cible = _groundSpeed (7) en avant, _strafeSpeed (5) de cote
//            v approche v_cible a _groundAcceleration (0,5) — voir `approach`
//            saut : v += haut x _jumpSpeed (6), sur front de touche
//            appui : sphere de rayon _sphereCastRadius (0,46) lancee sur
//                    _sphereCastLength (0,6), et pente sous
//                    _maxAngleToBeGrounded (45 degres)
//   en vol   sac dorsal : _maxTranslationalThrust (7) loin de tout,
//            _surfaceVerticalThrust (12) et _surfaceLateralThrust (5) pres
//            d'une surface
//
// La vitesse de regime au sol vaut exactement `_groundSpeed`, et la mise en
// vitesse ne depend pas de la frequence d'images : voir `approach`, ou se joue
// la seule vraie question d'interpretation de cette serie.
//
// Deux moteurs interchangeables :
//   - Havok, quand la geometrie reelle et ses colliders sont disponibles ;
//   - integration analytique contre des spheres, en repli.
// Les deux partagent le meme modele de gravite et les memes commandes.

import { dominantField } from "./gravity.js";

/**
 * Valeurs de repli, employees seulement si le build n'est pas la.
 *
 * `_tumbleThreshold` n'a pas ete releve sur le build : la valeur ci-dessous est
 * un repli assume, pas une mesure — d'ou son nom.
 */
export const PLAYER_FALLBACK = {
  groundSpeed: 7, strafeSpeed: 5, jumpSpeed: 6, acceleration: 0.5,
  suitGroundSpeed: 6, turnRate: 160, telescopeTurnScalar: 0.5, suitTurnScalar: 1,
  maxAngleToBeGrounded: 45, sphereCastRadius: 0.46, sphereCastLength: 0.6,
  tumbleThreshold: 15, tumbleDuration: 1.5,
  maxTranslationalThrust: 7, surfaceVerticalThrust: 12, surfaceLateralThrust: 5,
  mass: 70,
};

/**
 * Frottement ramene a la seconde.
 *
 * `vel *= 0,86` etait applique PAR IMAGE : a 30 im/s le freinage etait deux
 * fois plus faible qu'a 60, et la distance de glissade dependait de la machine.
 * `k^(dt x 60)` redonne exactement le comportement d'origine a 60 im/s, et le
 * meme partout ailleurs.
 */
export function frameFriction(k, dt) {
  return Math.pow(k, dt * 60);
}

/**
 * Une pente est-elle praticable ?
 *
 * `_maxAngleToBeGrounded` vaut 45 degres : au-dela, on ne tient pas et on
 * glisse. Le portage n'avait aucun seuil, et on tenait donc sur une paroi
 * verticale. `up` et `normal` sont des vecteurs unitaires.
 */
export function walkable(normal, up, maxAngle = PLAYER_FALLBACK.maxAngleToBeGrounded) {
  const d = normal[0] * up[0] + normal[1] * up[1] + normal[2] * up[2];
  return d >= Math.cos((maxAngle * Math.PI) / 180) - 1e-9;
}

/**
 * Vitesse visee au sol, dans le plan tangent.
 *
 * L'avant et le cote n'ont PAS la meme vitesse : 7 contre 5. Les composer
 * naivement donnerait 8,6 en diagonale — on borne donc l'ellipse a 1.
 */
export function groundTarget(input, basis, c) {
  const fwd = Math.max(-1, Math.min(1, input.forward || 0));
  const rgt = Math.max(-1, Math.min(1, input.right || 0));
  const n = Math.hypot(fwd, rgt);
  const k = n > 1 ? 1 / n : 1;
  const vf = fwd * k * c.groundSpeed, vr = rgt * k * c.strafeSpeed;
  return { x: basis.fwd.x * vf + basis.right.x * vr,
           y: basis.fwd.y * vf + basis.right.y * vr,
           z: basis.fwd.z * vf + basis.right.z * vr };
}

/** Pas fixe d'Unity : 50 Hz. `_groundAcceleration` est une fraction PAR PAS. */
export const FIXED_STEP = 0.02;

/**
 * Un pas d'approche vers la vitesse visee.
 *
 * `_groundAcceleration` (0,5) est la fraction de l'ecart rattrapee a chaque
 * PAS FIXE d'Unity, pas par seconde : `AddLocalVelocityChange` s'appelle dans
 * `FixedUpdate`, a 50 Hz. La lire comme une fraction par seconde donnerait une
 * mise en vitesse asymptotique de neuf secondes pour atteindre 99 % de
 * `_groundSpeed` — ce n'est pas de la marche, c'est un tapis roulant.
 *
 * On ramene donc la fraction au temps ecoule, ce qui rend le resultat
 * independant de la frequence d'images (le principe du §2.5) tout en gardant
 * exactement le comportement d'Unity a 50 Hz : la vitesse de regime reste
 * `_groundSpeed`, et elle est atteinte en une fraction de seconde.
 */
export function approach(v, target, accel, dt, step = FIXED_STEP) {
  const a = Math.max(0, Math.min(1, accel));
  const k = a >= 1 ? 1 : 1 - Math.pow(1 - a, dt / step);
  return v + (target - v) * k;
}

/** Hauteur d'un saut, pour l'invariant : v^2 / 2g. */
export function jumpHeight(jumpSpeed, gravity) {
  return gravity > 0 ? (jumpSpeed * jumpSpeed) / (2 * gravity) : Infinity;
}

export class Player {
  constructor(consts, start) {
    this.c = { ...PLAYER_FALLBACK, ...(consts || {}) };
    this.pos = { x: start[0], y: start[1], z: start[2] }; // monde
    this.vel = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.groundNormal = null;   // normale du dernier appui, ou null
    this.field = null;
    this.fluid = null;    // volume de fluide traverse, ou null
    this.jetpack = false; // le sac dorsal pousse-t-il ? (c'est lui qui brule)
    this.tumble = 0;      // temps restant de desequilibre, en secondes
    this.wasUp = false;   // front de touche du saut
    this.mass = this.c.mass;
    this.body = null;     // agregat Havok, si physique active
    this.scene = null;
  }

  usePhysics(BABYLON, scene, aggregate) {
    this.BABYLON = BABYLON;
    this.scene = scene;
    this.body = aggregate;
  }

  get physics() { return !!this.body; }

  /** Le joueur est-il pres d'une surface ? Le sac dorsal y pousse autrement. */
  nearSurface() {
    const f = this.field;
    if (!f || !f.body || !f.body.gravity) return false;
    const g = f.body.gravity;
    const r = g.alignmentRadius || (g.upperSurfaceRadius || 0) * 1.5;
    return r > 0 && f.distance <= r;
  }

  /**
   * @param world { directional, polar, framePos, fluids } — le monde au-dela
   *        des corps : champs de force places, et fluides.
   */
  update(dt, bodies, input, basis, origin, world = null) {
    this.field = dominantField(bodies, this.pos, world);
    if (this.tumble > 0) this.tumble = Math.max(0, this.tumble - dt);
    // Un joueur desequilibre ne commande plus rien : c'est la punition d'un
    // atterrissage trop rapide (_tumbleDuration 1,5).
    const cmd = this.tumble > 0
      ? { forward: 0, right: 0, up: false } : (input || {});
    this.jetpack = false;
    this.world = world;
    if (this.physics) this.stepPhysics(dt, cmd, basis, origin);
    else this.stepAnalytic(dt, bodies, cmd, basis);
    this.wasUp = !!(input && input.up);
    this.fluid = this.applyFluid(dt, world);
    return this.field;
  }

  /**
   * Saut : au sol, la touche « haut » saute sur son FRONT ; en l'air, la meme
   * touche tenue allume le sac dorsal. C'est le partage du jeu, et le portage
   * n'avait que la seconde moitie.
   *
   * @returns true si le saut est parti.
   */
  tryJump(input, up) {
    if (!this.grounded || !input.up || this.wasUp || this.tumble > 0) return false;
    this.vel.x += up.x * this.c.jumpSpeed;
    this.vel.y += up.y * this.c.jumpSpeed;
    this.vel.z += up.z * this.c.jumpSpeed;
    this.grounded = false;
    return true;
  }

  /**
   * Poussee du sac dorsal, en acceleration.
   *
   * Trois constantes la portent, la ou le portage codait `thrust = 18` uniforme
   * — soit 2,6 a 3,6 fois trop.
   */
  jetpackAccel(input, basis, up) {
    const c = this.c;
    const surf = this.nearSurface();
    const lat = surf ? c.surfaceLateralThrust : c.maxTranslationalThrust;
    const ver = surf ? c.surfaceVerticalThrust : c.maxTranslationalThrust;
    const a = { x: 0, y: 0, z: 0 };
    const fwd = input.forward || 0, rgt = input.right || 0;
    if (fwd || rgt) {
      a.x += (basis.fwd.x * fwd + basis.right.x * rgt) * lat;
      a.y += (basis.fwd.y * fwd + basis.right.y * rgt) * lat;
      a.z += (basis.fwd.z * fwd + basis.right.z * rgt) * lat;
    }
    if (input.up) { a.x += up.x * ver; a.y += up.y * ver; a.z += up.z * ver; }
    this.jetpack = !!(fwd || rgt || input.up);
    return a;
  }

  /**
   * Forces d'inertie du repere tournant : Coriolis et centrifuge.
   *
   * Le repere de travail tourne avec le corps ancre, et rien n'en tirait les
   * consequences. Sans ces deux termes, un joueur en vol stationnaire voit un
   * sol immobile la ou il devrait defiler (docs/36-audit.md §1.2).
   */
  applyInertial(dt, world) {
    const f = world && world.inertial;
    if (!f) return null;
    const a = f(this.pos, this.vel);
    if (!a) return null;
    this.vel.x += a[0] * dt; this.vel.y += a[1] * dt; this.vel.z += a[2] * dt;
    return a;
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
    // Le facteur de trainee est celui du DETECTEUR pose sur le joueur, pas une
    // constante uniforme : `SimpleFluidDetector._dragFactor` vaut 0,5 ou 1.
    const hit = field.apply([this.pos.x + o[0], this.pos.y + o[1], this.pos.z + o[2]],
                            this.vel, dt, this.field,
                            { dragFactor: field.dragFactor("player") });
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

    const up = { x: basis.up.x, y: basis.up.y, z: basis.up.z };
    this.probeGround(basis.up);

    // gravite : le moteur en est depourvu, on applique le champ dominant
    //
    // Sauf en APESANTEUR DECLAREE : les quatre `ZeroGField` du build portent
    // une priorite d'ecrasement, et dans leur volume plus rien ne tire vers le
    // bas — pas meme le champ radial du corps, qui pourtant ne s'arrete pas la
    // (docs/46, lot 4). Le champ reste LU : c'est lui qui tient la verticale de
    // la camera, et `_alignmentPriority` vaut zero, l'apesanteur ne retourne
    // donc personne.
    const f = this.field;
    // `world` est porte par l'instance : `update` l'y depose, et
    // `stepPhysics` ne le recoit pas en parametre. L'avoir lu comme une
    // variable libre levait une ReferenceError A CHAQUE IMAGE des que Havok
    // menait la danse — donc sur le build, et jamais sur le systeme de
    // substitution, qui tombe dans le moteur analytique.
    const apesanteur = !!(this.world && this.world.zeroG);
    const force = new B.Vector3(0, 0, 0);
    if (f && !apesanteur) {
      force.addInPlace(new B.Vector3(f.dir.x, f.dir.y, f.dir.z).scale(f.magnitude * this.mass));
    }
    const inert = this.world && this.world.inertial
      ? this.world.inertial(this.pos, this.vel) : null;
    if (inert) {
      force.addInPlace(new B.Vector3(inert[0], inert[1], inert[2]).scale(this.mass));
    }

    if (this.grounded) {
      // Au sol la vitesse est PILOTEE, pas poussee : on approche la cible dans
      // le plan tangent et on laisse la composante verticale a la physique.
      const t = groundTarget(input, basis, this.c);
      const vn = this.vel.x * up.x + this.vel.y * up.y + this.vel.z * up.z;
      const tan = { x: this.vel.x - vn * up.x, y: this.vel.y - vn * up.y,
                    z: this.vel.z - vn * up.z };
      const nx = approach(tan.x, t.x, this.c.acceleration, dt);
      const ny = approach(tan.y, t.y, this.c.acceleration, dt);
      const nz = approach(tan.z, t.z, this.c.acceleration, dt);
      this.vel.x = nx + vn * up.x; this.vel.y = ny + vn * up.y;
      this.vel.z = nz + vn * up.z;
      this.tryJump(input, up);
      body.setLinearVelocity(new B.Vector3(this.vel.x, this.vel.y, this.vel.z));
    } else {
      const a = this.jetpackAccel(input, basis, up);
      force.addInPlace(new B.Vector3(a.x, a.y, a.z).scale(this.mass));
    }
    body.applyForce(force, node.absolutePosition);
  }

  /**
   * Appui au sol par lancer de SPHERE vers le bas local.
   *
   * Le build donne les deux nombres : `_sphereCastRadius` 0,46 et
   * `_sphereCastLength` 0,6. Le portage lancait un rayon simple de 1,4, donc
   * plus long et infiniment fin — il manquait le bord d'une marche et
   * accrochait une paroi. Havok n'expose pas le lancer de sphere : on echantillonne
   * la sphere par quelques rayons paralleles, ce qui en donne l'essentiel — la
   * tolerance laterale — sans quitter l'API publique.
   */
  probeGround(up) {
    const B = this.BABYLON;
    const eng = this.scene.getPhysicsEngine();
    if (!eng || !eng.raycast) { this.grounded = false; return false; }
    const p = this.body.transformNode.absolutePosition;
    const r = this.c.sphereCastRadius, len = this.c.sphereCastLength;
    // deux tangentes pour repartir les rayons sur le disque de la sphere
    const ref = Math.abs(up.y) > 0.95 ? new B.Vector3(1, 0, 0) : new B.Vector3(0, 1, 0);
    const t1 = B.Vector3.Cross(up, ref).normalize();
    const t2 = B.Vector3.Cross(t1, up).normalize();
    const offsets = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    let normal = null;
    for (const [a, b] of offsets) {
      const from = p.add(t1.scale(a)).add(t2.scale(b));
      try {
        const hit = eng.raycast(from, from.add(up.scale(-(len + r))));
        if (!hit || !hit.hasHit) continue;
        const n = hit.hitNormal
          ? [hit.hitNormal.x, hit.hitNormal.y, hit.hitNormal.z] : [up.x, up.y, up.z];
        if (!walkable(n, [up.x, up.y, up.z], this.c.maxAngleToBeGrounded)) continue;
        normal = n;
        break;
      } catch (e) { /* moteur en cours de reconstruction */ }
    }
    this.groundNormal = normal;
    this.grounded = !!normal;
    return this.grounded;
  }

  // --- moteur analytique (repli sans Havok) ---

  stepAnalytic(dt, bodies, input, basis) {
    const up = { x: basis.up.x, y: basis.up.y, z: basis.up.z };
    if (this.field) {
      const g = this.field.magnitude;
      this.vel.x += this.field.dir.x * g * dt;
      this.vel.y += this.field.dir.y * g * dt;
      this.vel.z += this.field.dir.z * g * dt;
    }
    this.applyInertial(dt, this.world);
    if (this.grounded) {
      const t = groundTarget(input, basis, this.c);
      const vn = this.vel.x * up.x + this.vel.y * up.y + this.vel.z * up.z;
      const tx = this.vel.x - vn * up.x, ty = this.vel.y - vn * up.y,
            tz = this.vel.z - vn * up.z;
      const nx = approach(tx, t.x, this.c.acceleration, dt);
      const ny = approach(ty, t.y, this.c.acceleration, dt);
      const nz = approach(tz, t.z, this.c.acceleration, dt);
      this.vel.x = nx + vn * up.x; this.vel.y = ny + vn * up.y;
      this.vel.z = nz + vn * up.z;
      this.tryJump(input, up);
    } else {
      const a = this.jetpackAccel(input, basis, up);
      this.vel.x += a.x * dt; this.vel.y += a.y * dt; this.vel.z += a.z * dt;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    this.resolveGround(bodies, up, dt);
  }

  /**
   * Collision analytique : les corps sont des spheres de rayon connu. Le relief
   * du terrain n'est donc pas pris en compte ; c'est le repli quand Havok et la
   * geometrie reelle ne sont pas disponibles.
   */
  resolveGround(bodies, up, dt) {
    const wasGrounded = this.grounded;
    this.grounded = false;
    this.groundNormal = null;
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
        // Un atterrissage trop rapide desequilibre : _tumbleDuration 1,5.
        if (!wasGrounded && -vn >= this.c.tumbleThreshold) {
          this.tumble = this.c.tumbleDuration;
        }
        this.vel.x -= vn * nx; this.vel.y -= vn * ny; this.vel.z -= vn * nz;
      }
      // Sur une sphere analytique, la normale EST la verticale locale : la
      // pente est toujours praticable. Le seuil de 45 degres n'a de sens que
      // contre la geometrie reelle, ou `probeGround` l'applique.
      if (up && !walkable([nx, ny, nz], [up.x, up.y, up.z], this.c.maxAngleToBeGrounded)) {
        break;
      }
      // Le frottement `vel *= 0,86` par image disparait : au sol, la vitesse
      // tangentielle est PILOTEE par l'approche vers la vitesse visee, et
      // celle-ci ramene deja a l'arret quand aucune touche n'est tenue.
      // Superposer les deux annulait la marche des la premiere image.
      this.grounded = true;
      this.groundNormal = [nx, ny, nz];
      break;
    }
    return this.grounded;
  }
}
