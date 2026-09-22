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
// @mesure — un etalon, pas un mecanisme : le moteur integre, celui-ci verifie.
export function jumpHeight(jumpSpeed, gravity) {
  return gravity > 0 ? (jumpSpeed * jumpSpeed) / (2 * gravity) : Infinity;
}

/**
 * `PlayerJetpackController` : DEUX verrous sur la poussee, que le portage
 * n'avait ni l'un ni l'autre.
 *
 * 1. LE CARBURANT A VIDE, AVEC HYSTERESIS. `Update` pose `_isFuelDepleted` des
 *    que la fraction touche zero — et il abandonne le pilote automatique au
 *    passage — mais il ne le retire qu'au-DESSUS de cinq pour cent. Tomber en
 *    panne ne se repare donc pas d'une goutte : il faut avoir refait le plein
 *    d'un vingtieme avant que le sac reparte.
 *
 * 2. LA POUSSEE HORIZONTALE NE REPART PAS TOUTE SEULE APRES UN SAUT.
 *    `OnBecomeGrounded` la coupe (`_isHorizontalThrustEnabled = false`), et
 *    `OnBecomeUngrounded` retient la commande DU MOMENT DU DECOLLAGE
 *    (`_translationAtJump`). En l'air, elle ne revient que si l'une des trois
 *    conditions de `ReadTranslationalInput` est remplie :
 *
 *      - la commande depasse 0,5 ET s'ecarte de plus de SOIXANTE degres de
 *        celle du decollage — on a change d'avis, donc on pousse vraiment ;
 *      - on appuie sur monter ou descendre, quel que soit le reste ;
 *      - la poussee de rotation est deja engagee.
 *
 *    C'est ce qui empeche un simple saut de devenir un envol : courir puis
 *    sauter ne vous propulse pas, il faut un GESTE de plus. Le portage poussait
 *    lateralement dans tous les cas, et le saut y valait decollage.
 */
export const JETPACK = {
  refuelFraction: 0.05,   // au-dessus, la panne est levee
  minMagnitude: 0.5,      // en deca, le changement de cap ne compte pas
  turnDegrees: 60,        // l'ecart qui rallume la poussee horizontale
};

/** L'angle non signe entre deux commandes, en degres (`Vector3.Angle`). */
export function inputAngle(a, b) {
  const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
}

export class JetpackGate {
  constructor(cfg = JETPACK) {
    this.cfg = cfg;
    this.depleted = false;
    this.grounded = true;
    this.horizontal = false;
    this.atJump = [0, 0, 0];
  }

  /**
   * `Update`, premier bloc. @returns true si la panne vient de commencer —
   * c'est a cet instant que le build abandonne le pilote automatique.
   */
  fuel(fraction) {
    if (!(fraction > 0)) {
      if (this.depleted) return false;
      this.depleted = true;
      return true;
    }
    if (this.depleted && fraction > this.cfg.refuelFraction) this.depleted = false;
    return false;
  }

  /** `OnBecomeGrounded` / `OnBecomeUngrounded`, sur la TRANSITION. */
  setGrounded(grounded, input = [0, 0, 0]) {
    const g = !!grounded;
    if (g === this.grounded) return;
    this.grounded = g;
    if (g) this.horizontal = false;
    else this.atJump = [input[0], input[1], input[2]];
  }

  /**
   * `ReadTranslationalInput`. @param input [droite, haut - bas, avant]
   * @returns la commande effective, deja privee de ce qui est coupe
   */
  read(input, rotational = false) {
    if (this.depleted) return [0, 0, 0];
    if (!this.grounded) {
      const gros = Math.hypot(input[0], input[1], input[2]) > this.cfg.minMagnitude;
      const vire = gros && inputAngle(this.atJump, input) > this.cfg.turnDegrees;
      if (vire || Math.abs(input[1]) > 0 || rotational) this.horizontal = true;
    }
    return this.horizontal ? [input[0], input[1], input[2]] : [0, input[1], 0];
  }
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
    // Les deux verrous de `PlayerJetpackController` : la panne de carburant et
    // la poussee horizontale qui ne repart pas apres un saut.
    this.gate = new JetpackGate();
    this.tumble = 0;      // temps restant de desequilibre, en secondes
    this.wasJump = false;   // front de touche du saut
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
      ? { forward: 0, right: 0, up: false, down: false, jump: false } : (input || {});
    this.jetpack = false;
    this.world = world;
    if (this.physics) this.stepPhysics(dt, cmd, basis, origin);
    else this.stepAnalytic(dt, bodies, cmd, basis);
    this.wasJump = !!(input && input.jump);
    this.fluid = this.applyFluid(dt, world);
    return this.field;
  }

  /**
   * Saut : sur le FRONT de la touche, et au sol.
   *
   * Le portage faisait sauter ET monter avec la meme touche, en commentant
   * « c'est le partage du jeu ». Ce n'en est pas un : le build a deux canaux
   * distincts, `Jump` (espace, `GroundInput.jump`) et `Move Up` (majuscule,
   * `JetpackInput.thrustUp`). On peut donc sauter et pousser en meme temps,
   * et c'est ce qui donne au decollage sa forme (docs/61-commandes.md).
   *
   * @returns true si le saut est parti.
   */
  tryJump(input, up) {
    if (!this.grounded || !input.jump || this.wasJump || this.tumble > 0) return false;
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
    // `ThrusterController.FixedUpdate` lit la commande, puis MET A ZERO x et z
    // — et rien d'autre — quand la poussee horizontale est coupee. La commande
    // du build est `(thrustX, thrustUp - thrustDown, thrustZ)` : on la compose
    // dans cet ordre, on la passe au verrou, et on reprend ce qui en sort.
    const brut = [input.right || 0,
                  (input.up ? 1 : 0) - (input.down ? 1 : 0),
                  input.forward || 0];
    this.gate.setGrounded(this.grounded, brut);
    const [rgt, vert, fwd] = this.gate.read(brut);
    if (fwd || rgt) {
      a.x += (basis.fwd.x * fwd + basis.right.x * rgt) * lat;
      a.y += (basis.fwd.y * fwd + basis.right.y * rgt) * lat;
      a.z += (basis.fwd.z * fwd + basis.right.z * rgt) * lat;
    }
    // `thrustUp` et `thrustDown` sont DEUX canaux — majuscule et controle — et
    // le portage n'avait que le premier. Descendre au sac dorsal etait donc
    // impossible : on ne pouvait que couper la poussee et tomber.
    if (vert) { a.x += up.x * ver * vert; a.y += up.y * ver * vert; a.z += up.z * ver * vert; }
    this.jetpack = !!(fwd || rgt || vert);
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

// --- ce que le joueur porte en plus de son corps ---------------------------
//
// @lit PlayerState, PlayerNoiseMaker, FirstPersonManipulator
// @lit AlignPlayerWithField, PlayerJetpackController, PlayerCharacterController
// @lit PlayerCompressionSensor, SurfaceSensor
// Quatre classes de docs/44 §7 restees sans lecteur, et trois d'entre elles
// portent un NOMBRE que le portage avait remplace par une invention
// (docs/53-joueur.md).

/**
 * La portee d'interaction : `FirstPersonManipulator.LateUpdate` lance un rayon
 * de DIX unites depuis la camera, et observe l'`InteractReceiver` touche.
 *
 * Le portage exigeait d'etre a la portee du RECEPTEUR — deux ou trois unites,
 * qui sont la taille de son volume. Ce sont deux choses differentes : le volume
 * dit la taille de la cible, le rayon dit de combien loin on peut la viser.
 */
export const INTERACT_RANGE = 10;

/**
 * Les quatre etats que `PlayerState` tient, et rien d'autre.
 *
 * Quatre booleens STATIQUES et leurs accesseurs. `InShipProximity()` et
 * `AtFlightConsole()` ne sont que des lectures de champ — le filtre de
 * `refait.mjs` ne les reconnait pas comme telles parce que le build les nomme
 * SANS prefixe, la ou il ecrit ailleurs `GetSecondsRemaining` ou `IsDay`. Ce
 * sont pourtant les memes accesseurs, et ce qui compte est le champ.
 *
 *     Reset()
 *         _isDead = _atFlightConsole = _insideShip = _inShipProximity = false;
 *
 * `Reset` les remet tous les quatre a faux — la mort comprise, qui est le seul
 * a ne pas se defaire tout seul en cours de boucle.
 */
export class PlayerState {
  constructor() {
    this.insideShip = false;
    this.inShipProximity = false;
    this.atFlightConsole = false;
    this.dead = false;
  }

  /** `OnPlayerDeath` : la mort est le seul etat qui ne se defait pas seul. */
  die() { this.dead = true; }
  reset() {
    this.insideShip = this.inShipProximity = this.atFlightConsole = false;
    this.dead = false;
  }
}

/** Volumes sonores du constructeur de `PlayerNoiseMaker`. */
export const NOISE = { thrust: 5, launch: 5, launchFade: 1 };

/**
 * Le bruit que fait le joueur, et que les predateurs entendent.
 *
 * `PlayerNoiseMaker.Update`, en deux termes :
 *
 *     bruit = fractionDePoussee x 5
 *           + (1 - clamp01((t - instantDeLancement) / 1)) x 5
 *
 * Le premier est continu et proportionnel : pousser doucement fait moins de
 * bruit que pousser a fond. Le second est un COUP : lancer une sonde fait cinq
 * d'un seul trait, qui retombe en une seconde.
 *
 * Le portage rendait un booleen — 1 en poussant, 0,7 sinon — et n'avait pas du
 * tout le coup de la sonde. On pouvait donc lancer une sonde au nez d'un
 * predateur sans qu'il l'entende.
 */
export function playerNoise(thrustFraction, t, lastLaunchTime = -100, cfg = NOISE) {
  const pousse = Math.max(0, Math.min(1, thrustFraction)) * cfg.thrust;
  const u = Math.max(0, Math.min(1, (t - lastLaunchTime) / (cfg.launchFade || 1)));
  return pousse + (1 - u) * cfg.launch;
}

/** `_graceFrames` du constructeur de `PlayerCompressionSensor`. */
export const COMPRESSION_GRACE = 5;

/**
 * La mort par ECRASEMENT, que le portage n'avait pas.
 *
 * `PlayerCompressionSensor.FixedUpdate` : tant qu'on touche une surface qui
 * declare ecraser (`Surface.GetAllowCompression`) et qu'on n'est pas attache a
 * un point, un compte court. Passe cinq pas de physique, on meurt — de la
 * `DeathType` par defaut, et le build l'annonce en clair :
 * « Death by compression :( ».
 *
 * Cinq PAS, pas cinq secondes : a un cinquantieme de seconde le pas, cela fait
 * un dixieme de seconde. C'est immediat, et c'est voulu — ce n'est pas une
 * usure, c'est un broyage.
 */
export class CompressionSensor {
  constructor(graceFrames = COMPRESSION_GRACE, step = FIXED_STEP) {
    this.graceFrames = graceFrames;
    this.step = step;
    this.elapsed = 0;
    this.crushed = false;
  }

  /**
   * @param dt
   * @param compressing touche-t-on une surface qui ecrase
   * @param attached    est-on attache a un point (un ascenseur, par exemple)
   */
  update(dt, compressing, attached = false) {
    if (!compressing || attached) { this.elapsed = 0; return false; }
    this.elapsed += dt;
    if (this.elapsed > this.step * this.graceFrames) this.crushed = true;
    return this.crushed;
  }

  reset() { this.elapsed = 0; this.crushed = false; }
}
