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

// @lit ShipNoiseMaker

export const SHIP_NOISE = {
  thrust: 10,
  minImpact: 10,
  impactFade: 1,
};

/**
 * Bruit emis par le vaisseau (ShipNoiseMaker.Update et ShipNoiseMaker.OnImpact).
 * Poussee continue : fractionDePoussee * 10.
 * Impact violent (> 10 u/s) : decroissance lineaire sur 1 seconde depuis la vitesse du choc.
 */
export function shipNoise(thrustFraction, t, lastImpactTime = -100, lastImpactSpeed = 0, cfg = SHIP_NOISE) {
  const pousse = Math.max(0, thrustFraction) * cfg.thrust;
  const u = Math.max(0, Math.min(1, (t - lastImpactTime) / (cfg.impactFade || 1)));
  const choc = lastImpactSpeed > cfg.minImpact ? (1 - u) * lastImpactSpeed : 0;
  return pousse + choc;
}

import { limitOrbitThrust, orbitSpeed } from "./landing.js";
import { dominantField, rotateByQuaternion } from "./gravity.js";
import { ShipDamage } from "./shipdamage.js";
import { landedOn, LandingPads, LANDED_SPEED } from "./tower.js";

/**
 * `ShipThrusterController._ignitionDuration` : UNE seconde.
 *
 * Elle est dans le constructeur, pas sur l'instance — `composants.mjs` rend un
 * objet vide pour ce composant, et c'est encore un cas ou la scene ne dit rien
 * de ce que le code fait (docs/60-sonde.md).
 */
export const IGNITION_DURATION = 1;
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
// @mesure — le regime que l'integration atteint, pas une etape de celle-ci.
export function terminalAngularSpeed(torque, drag, step = 1 / 60) {
  return drag >= 1 ? Infinity : (torque * step) / (1 - drag);
}

export class Ship {
  constructor(consts, node, startPos, damageFields = {}, engines = []) {
    this.thrust = consts._maxTranslationalThrust ?? 50;
    this.field = null;        // le champ dominant de la derniere image
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
    this.landed = true;        // on touche le sol
    this.parked = true;        // stationne au point de depart tant que le decollage n'a pas eu lieu
    this.parkPos = { x: startPos[0], y: startPos[1], z: startPos[2] };
    this.groundBody = "TimberHearth";
    this.onPad = false;         // `LandingPadManager.IsLanded` : gare sur la piste
    this.padBody = null;
    this.pads = new LandingPads();
    this.lastLandingEvent = null;
    this.justExploded = false;
    // `_ignitionDuration`, du constructeur de `ShipThrusterController`.
    this.igniting = false;
    this.ignitionTime = 0;
    this.ignitionDuration = IGNITION_DURATION;
    this.events = [];
    this.radius = 6;                        // demi-taille approximative
    // Degats : l'integrite globale et les pieces vivent dans ShipDamage, qui
    // porte les quatre champs de ShipDamageController.
    this.damage = new ShipDamage(damageFields, engines);
    // Limite de poussee du secteur courant (PlanetoidSector._thrustLimit), ou
    // null hors de tout secteur. Le vaisseau garde sa pleine puissance sur la
    // premiere jumelle, ou la limite vaut 200 contre 20 partout ailleurs.
    this.thrustLimit = null;
    this.fluid = null;
    // Sonde de terrain, posee par main.js quand Havok et la geometrie reelle
    // sont la : (position, haut local, portee) -> { distance, point, normale },
    // ou null. Sans elle, on retombe sur la sphere analytique.
    this.probe = null;
    this.thrustFraction = 0;
    this.lastImpactTime = -100;
    this.lastImpactSpeed = 0;
    this.now = 0;
  }

  /** Bruit instantane genere par le vaisseau (ShipNoiseMaker). */
  noise(t = this.now) {
    return shipNoise(this.thrustFraction, t, this.lastImpactTime, this.lastImpactSpeed);
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
    if (this.node.parent) {
      this.node.parent = null;
    }
    this.node.position.set(this.pos.x, this.pos.y, this.pos.z);
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
    // `ShipThrusterController.ReadRotationalInput` rend Vector3.zero des que
    // `LandingPadManager.IsLanded()` : pose, on ne tourne plus DU TOUT. Pas
    // moins, pas lentement — zero. La trainee angulaire, elle, continue.
    if (this.boarded && !this.onPad && basis && basis.fwd) {
      const t = [basis.fwd.x, basis.fwd.y, basis.fwd.z];
      torque[0] += a.fwd[1] * t[2] - a.fwd[2] * t[1];
      torque[1] += a.fwd[2] * t[0] - a.fwd[0] * t[2];
      torque[2] += a.fwd[0] * t[1] - a.fwd[1] * t[0];
    }
    const roll = (this.boarded && !this.onPad && input && input.roll)
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

  /**
   * `ShipThrusterController.ReadTranslationalInput`, la partie « au sol ».
   *
   * Un vaisseau pose ne decolle pas a l'appui : il S'ALLUME. Tant qu'il touche
   * le sol, les poussees laterales sont annulees, la verticale est bornee au
   * positif — on ne s'enfonce pas dans la piste — et la premiere seconde de
   * poussee ne produit AUCUNE acceleration. Relacher avant la fin annule tout
   * et il faut recommencer.
   *
   * Le portage decollait a l'instant, ce qui otait au depart son poids : une
   * seconde d'allumage, c'est le temps qu'il faut pour lever les yeux
   * (docs/66-allumage.md).
   *
   * @returns la poussee verticale a appliquer, apres allumage
   */
  ignition(dt, up) {
    this.events = [];
    if (!this.landed) {
      this.igniting = false;
      this.ignitionTime = 0;
      this.parked = false;
      return up;
    }
    const y = up > 0 ? (up > 1 ? 1 : up) : 0;
    if (!this.igniting && y > 0) {
      this.igniting = true;
      this.ignitionTime = 0;
      this.events.push("StartShipIgnition");
    }
    if (!this.igniting) return 0;
    if (y === 0) {
      this.igniting = false;
      this.events.push("CancelShipIgnition");
      return 0;
    }
    this.ignitionTime += dt;
    if (this.ignitionTime < this.ignitionDuration) return 0;
    this.igniting = false;
    this.landed = false;
    this.parked = false;
    this.events.push("CompleteShipIgnition");
    return y;
  }

  update(dt, bodies, input, basis, world = null) {
    this.now = (this.now || 0) + dt;
    this.thrustFraction = (this.boarded && input)
      ? Math.hypot(input.forward || 0, input.right || 0, input.up ? 1 : 0) : 0;
    const f = dominantField(bodies, this.pos, world);
    // Le pilote automatique en a besoin : la distance de freinage du build
    // compte la gravite le long de l'axe d'approche (docs/107-pilote.md).
    this.field = f;
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
      const vertical = this.ignition(dt, input.up ? 1 : 0);
      const vz = (vertical > 0 && this.damage.thrustFactor("bas")) ? vertical : 0;
      // La poussee est rassemblee en UNE acceleration avant d'etre appliquee :
      // c'est la seule facon d'en ecreter la part tangentielle en mode
      // atterrissage, ou le build refuse de vous laisser gagner de la vitesse
      // orbitale en essayant de vous poser (docs/87-atterrissage.md).
      let acc = [a.fwd[0] * fw + a.right[0] * rt + a.up[0] * vz,
                 a.fwd[1] * fw + a.right[1] * rt + a.up[1] * vz,
                 a.fwd[2] * fw + a.right[2] * rt + a.up[2] * vz];
      const L = world && world.landing;
      if (L && L.body) {
        const radial = [L.body.position[0] - this.pos.x,
                        L.body.position[1] - this.pos.y,
                        L.body.position[2] - this.pos.z];
        const d = Math.hypot(radial[0], radial[1], radial[2]);
        const vRel = [this.vel.x - (L.velocity ? L.velocity[0] : 0),
                      this.vel.y - (L.velocity ? L.velocity[1] : 0),
                      this.vel.z - (L.velocity ? L.velocity[2] : 0)];
        // `FromToRotation(-transform.up, d)` : le BAS du vaisseau, pas son nez.
        const bas = [-a.up[0], -a.up[1], -a.up[2]];
        acc = limitOrbitThrust(acc.map((x) => x * this.effectiveThrust), vRel,
                               radial, orbitSpeed(L.body, d), dt, bas)
          .map((x) => x / (this.effectiveThrust || 1));
      }
      this.vel.x += acc[0] * t;
      this.vel.y += acc[1] * t;
      this.vel.z += acc[2] * t;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    this.resolveGround(dt, bodies, basis);
    this.lastLandingEvent = this.updateLanding(bodies, basis);

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
  /**
   * Les trois capteurs de pad, exprimes dans le repere du vaisseau.
   *
   * `LandingPadSensor` x3, spheres de rayon 0,5, sur
   * `Ship_Body/LandingPads/LandingPad` : deux ecartees — les pieds — et une
   * troisieme en arriere. Ce sont les JAMBES du vaisseau, et elles detectent ce
   * qui entre dedans.
   *
   * L'offset se prend depuis la position de repos de `Ship_Body`, et se ramene
   * dans son repere par la rotation inverse de sa pose de repos. Le portage le
   * prenait depuis le POINT D'APPARITION du vaisseau, qui n'est pas le meme
   * endroit : il obtenait des decalages de 171 unites, et son lancer de rayon
   * ne touchait jamais rien. Personne ne s'en est apercu parce que personne
   * n'appelait la loi (docs/89-pose.md).
   */
  setPadSensors(sensors, shipRestPos, shipRestRot = null) {
    this.padSensors = (sensors || [])
      .filter((s) => s.position && shipRestPos)
      .map((s) => {
        let d = [s.position[0] - shipRestPos[0], s.position[1] - shipRestPos[1],
                 s.position[2] - shipRestPos[2]];
        if (shipRestRot) {
          const q = shipRestRot;
          d = rotateByQuaternion([-q[0], -q[1], -q[2], q[3]], d);
        }
        return {
          offset: d,
          radius: (s.volume && s.volume.radius) || 0.5,
          sound: s.touchdownSound || null,
        };
      });
    return this.padSensors.length;
  }

  /**
   * `LandingPadSensor.OnTriggerEnter` : ce que chaque jambe touche.
   *
   * Le build compare des `OWRigidbody` ; ce portage n'en a pas sous la main au
   * point de contact, et retient donc le corps dont la SURFACE est la plus
   * proche du point touche. C'est la meme question, posee autrement.
   *
   * @returns un nom de corps par capteur, `null` quand il ne touche rien
   */
  padContacts(bodies, basis) {
    if (!this.padSensors || !this.padSensors.length || !this.probe || !basis) return null;
    const contacts = [];
    for (const s of this.padSensors) {
      const o = s.offset;
      const p = [
        this.pos.x + o[0] * basis.right.x + o[1] * basis.up.x + o[2] * basis.fwd.x,
        this.pos.y + o[0] * basis.right.y + o[1] * basis.up.y + o[2] * basis.fwd.y,
        this.pos.z + o[0] * basis.right.z + o[1] * basis.up.z + o[2] * basis.fwd.z,
      ];
      const bas = [-basis.up.x, -basis.up.y, -basis.up.z];
      // LA PORTEE DU RAYON. Le build n'en lance aucun : ses capteurs sont des
      // spheres de 0,5 posees aux pieds de la COQUE, et c'est le sol qui entre
      // dedans. Ce portage n'a pas de coque — son vaisseau est une sphere de
      // rayon 6, posee centre en l'air — et ses jambes, a 3,74 sous le centre,
      // restent donc a 2,26 du sol quand il est pose. Un rayon de 0,5 ne
      // touchait jamais rien, et c'est ce qui a laisse la loi muette pendant
      // tout le temps ou personne ne l'appelait. La portee est ici celle de la
      // coque : le sol doit etre sous chaque jambe a moins d'un rayon.
      const hit = this.probe(p, bas, this.radius * 2);
      if (!hit || hit.distance > this.radius) { contacts.push(null); continue; }
      let best = null, bestD = Infinity;
      for (const b of bodies) {
        const d = Math.abs(Math.hypot(hit.point[0] - b.position[0],
                                      hit.point[1] - b.position[1],
                                      hit.point[2] - b.position[2])
                           - (b.gravity.upperSurfaceRadius || 0));
        if (d < bestD) { bestD = d; best = b.name; }
      }
      contacts.push(best);
    }
    return contacts;
  }

  /**
   * `LandingPadManager.Update` : ce que « POSE » veut dire, en entier.
   *
   * Deux notions distinctes, que le portage confondait en une :
   *
   *   `landed`  — on TOUCHE le sol, quel qu'il soit. C'est ce que
   *               `resolveGround` etablit, et ce que l'allumage demande.
   *   `onPad`   — les TROIS jambes touchent, elles touchent le MEME corps, et
   *               la vitesse relative ne depasse pas cinq.
   *
   * C'est `onPad` que le build appelle `IsLanded()`, et c'est lui qui coupe la
   * rotation et ferme le mode atterrissage. Un vaisseau a cheval sur un rebord,
   * ou qui derape sur une piste, n'est pas pose — et garde ses commandes
   * (docs/89-pose.md).
   *
   * La vitesse comparee est celle du repere ancre. Le build compare a celle du
   * POINT DE CONTACT, ce qui revient au meme des lors que le corps touche est
   * l'ancre — et il l'est chaque fois qu'on se pose, puisque l'origine
   * flottante s'ancre sur le corps dominant.
   */
  updateLanding(bodies, basis) {
    let contacts = this.padContacts(bodies, basis);
    this.derniersContacts = contacts;   // sonde de verification
    // CE QUE LE PORTAGE NE PEUT PAS FAIRE, ET POURQUOI ON LE DIT ICI.
    //
    // Les trois jambes ne trouvent le sol que la ou la geometrie repond. Le
    // vaisseau de ce portage est une SPHERE de rayon 6 : quand il se pose sur
    // la sphere analytique — le repli, hors des zones ou le maillage est
    // charge — il n'y a rien sous ses jambes a toucher, et les trois rayons
    // rendent null. On retombe alors sur le contact au sol de `resolveGround`,
    // en gardant les deux conditions qui, elles, sont mesurables partout : un
    // seul corps, et moins de cinq unites de vitesse.
    //
    // Ce n'est pas la loi du build, c'est ce qu'on peut en tenir sans coque. La
    // difference est ecrite plutot que masquee par un nombre ajuste jusqu'a ce
    // qu'un controle passe (docs/89-pose.md).
    if (!contacts || contacts.every((c) => c === null)) {
      contacts = this.landed ? [this.groundBody || "sol"] : [null];
    }
    const e = this.pads.update(contacts, this.speed);
    this.onPad = this.pads.landed;
    this.padBody = this.pads.body;
    return e;
  }

  resolveGround(dt, bodies, basis) {
    if (this.parked && this.landed) {
      this.groundBody = "TimberHearth";
      if (this.parkPos) {
        this.pos.x = this.parkPos.x;
        this.pos.y = this.parkPos.y;
        this.pos.z = this.parkPos.z;
      }
      this.vel.x = 0;
      this.vel.y = 0;
      this.vel.z = 0;
      return true;
    }
    this.landed = false;
    this.groundBody = null;
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
          this.contact(dt, hit.point, hit.normal || n0, basis, b.name);
          return true;
        }
        if (hit) continue;   // terrain vu, plus loin que la coque : rien a faire
      }
      if (dist >= R || dist === 0) continue;
      this.contact(dt, [b.position[0] + n0[0] * R, b.position[1] + n0[1] * R,
                        b.position[2] + n0[2] * R], n0, basis, b.name);
      return true;
    }
    return false;
  }

  /** Pose le vaisseau sur un point de contact, avec les degats correspondants. */
  contact(dt, point, n, basis, bodyName = null) {
    // Ou etait le vaisseau AVANT d'etre pose sur le contact : c'est par rapport
    // a cette position-la que le point d'impact a un sens. Le lire apres
    // l'avoir deplace donnait un vecteur nul, et donc toujours la meme piece.
    const avant = [this.pos.x, this.pos.y, this.pos.z];
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
      // Le POINT d'impact, dans le repere du vaisseau : c'est lui qui designe
      // la piece touchee dans le build, et non la normale (docs/49-queue.md).
      const rel = [point[0] - avant[0], point[1] - avant[1], point[2] - avant[2]];
      const pLocal = basis ? [
        rel[0] * basis.right.x + rel[1] * basis.right.y + rel[2] * basis.right.z,
        rel[0] * basis.up.x + rel[1] * basis.up.y + rel[2] * basis.up.z,
        rel[0] * basis.fwd.x + rel[1] * basis.fwd.y + rel[2] * basis.fwd.z,
      ] : null;
      this.lastHit = this.damage.impact(-vn, local, pLocal);
      this.lastImpactSpeed = -vn;
      this.lastImpactTime = this.now || 0;
      if (this.lastHit && this.lastHit.justExploded) this.justExploded = true;
      this.vel.x -= vn * n[0]; this.vel.y -= vn * n[1]; this.vel.z -= vn * n[2];
    }
    // Le frottement au sol etait applique PAR IMAGE : a 30 im/s le vaisseau
    // glissait deux fois plus loin qu'a 60 (§2.5).
    const fr = frameFriction(0.7, dt);
    this.vel.x *= fr; this.vel.y *= fr; this.vel.z *= fr;
    this.landed = true;
    // Le corps touche : c'est lui que les trois jambes doivent trouver, et
    // c'est lui qui sert de repli quand la geometrie ne repond pas.
    this.groundBody = bodyName;
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
