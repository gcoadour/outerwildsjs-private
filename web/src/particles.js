// Systemes de particules.
//
// 135 systemes extraits par tools/11_particles.py depuis les modules du
// ParticleSystem Unity : InitialModule (duree de vie, vitesse, taille,
// couleur, capacite), EmissionModule (taux), ShapeModule (forme d'emission).
//
// Comme pour l'audio, on n'instancie que ce qui est a portee : 135 systemes
// simultanes ne serviraient a rien et couteraient cher. Le budget de particules
// vivantes est plafonne.

const NEAR = 2.5;          // marge d'instanciation, en multiple de la taille
const MAX_LIVE = 14;       // budget de systemes simultanes
const MAX_CAPACITY = 600;  // plafond par systeme

export async function loadParticleMap() {
  try {
    const res = await fetch("data/particles/systems.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return (await res.json()).systems || [];
  } catch (e) {
    console.warn("data/particles/systems.json absent :", e.message);
    return [];
  }
}

/**
 * La couleur de depart, teinte du materiau comprise.
 *
 * Les shaders `Particles/Additive` et `Particles/Alpha Blended` rendent
 * `2 x _TintColor x couleur x texture` : la teinte par defaut, 0,5, est
 * neutre. Celles du build ne le sont pas — 0,22 sur les flammes, un bleu-vert
 * a 5 % sur les nuages de Giant's Deep. `Particles/Multiply` n'en a pas.
 */
export function teinteParticules(couleur, tint, blend = "add") {
  if (!tint || blend === "multiply") return couleur.slice();
  return couleur.map((v, i) => v * 2 * tint[i]);
}

/**
 * Le prechauffage d'Unity, en cycles de Babylon.
 *
 * `ParticleSystem.prewarm` : un systeme EN BOUCLE demarre « comme s'il avait
 * deja accompli un cycle entier » — donc `duration` secondes de simulation,
 * pas une duree de vie. Babylon prechauffe par pas de
 * `updateSpeed x preWarmStepOffset` ; on en compte assez pour couvrir la
 * duree. Rien pour un systeme qui ne boucle pas, comme dans Unity.
 */
export function prewarmCycles(s, updateSpeed = 0.016, stepOffset = 5) {
  if (!s || !s.prewarm || !s.looping || !(s.duration > 0)) return 0;
  return Math.ceil(s.duration / (updateSpeed * stepOffset));
}

/**
 * `SizeModule` d'Unity en gradients de Babylon.
 *
 * LA COURBE D'UNITY MULTIPLIE, LE GRADIENT DE BABYLON REMPLACE. Dans Unity la
 * taille d'une particule vaut `startSize x courbe(age)` ; dans Babylon, des
 * qu'un gradient de taille existe, c'est LUI qui donne la taille, et
 * `minSize`/`maxSize` ne comptent plus. Le portage passait la courbe telle
 * quelle : la colonne de fumee de l'ecran-titre — 30 a 60 unites au depart,
 * courbe de 0,12 a 0,58 — sortait a trois dixiemes d'unite, et toutes les
 * fumees, flammes et poussieres du monde a la meme echelle. Mesure dans le
 * navigateur (docs/131-ecran-titre.md).
 *
 * @returns [[t, taille basse, taille haute]]
 */
export function sizeGradients(s, smin, smax) {
  if (!s || !s.sizeOverLife || s.sizeOverLife.length < 2) return [];
  return s.sizeOverLife.map(([t, v]) => [t, v * smin, v * smax]);
}

/**
 * La rotation d'un emetteur Babylon pour un systeme Unity d'orientation `q`.
 *
 * Unity emet le long du +Z local du systeme ; les emetteurs de Babylon (cone,
 * boite) le long de leur +Y. On compose donc `q` avec le quart de tour qui
 * porte +Y sur +Z. Rend (x, y, z, w).
 */
export function emitterRotation(q) {
  // Quart de tour autour de X : (sin 45, 0, 0, cos 45) porte +Y sur +Z.
  const s = Math.SQRT1_2;
  const [ax, ay, az, aw] = q, [bx, by, bz, bw] = [s, 0, 0, s];
  return [aw * bx + ax * bw + ay * bz - az * by,
          aw * by - ax * bz + ay * bw + az * bx,
          aw * bz + ax * by - ay * bx + az * bw,
          aw * bw - ax * bx - ay * by - az * bz];
}

/** Rayon d'influence approximatif : de quoi decider quand instancier. */
function reach(s) {
  const shape = (s.shape && s.shape.radius) || 0;
  const travel = (s.startSpeed || 0) * (s.lifetime || 1);
  return Math.max(30, (shape + travel + (s.size || 1)) * NEAR);
}

export class ParticleField {
  /** @param dir le dossier des textures : l'ecran-titre a le sien */
  constructor(BABYLON, scene, systems, dir = "data/particles/") {
    this.B = BABYLON;
    this.dir = dir;
    this.scene = scene;
    this.systems = systems;
    this.live = new Map();
    this.textures = new Map();
    this.failed = 0;
  }

  texture(file) {
    if (!file) return null;
    if (!this.textures.has(file)) {
      try {
        this.textures.set(file,
          new this.B.Texture(`${this.dir}${file}`, this.scene));
      } catch (e) {
        this.textures.set(file, null);
      }
    }
    return this.textures.get(file);
  }

  /**
   * @param field champ de gravite dominant a la position de l'auditeur, ou
   *              null. Les systemes a portee sont sur le meme corps que le
   *              joueur : son champ est le leur, a la precision qui compte pour
   *              une etincelle qui vit une seconde.
   */
  /** @param shiftOf systeme -> deplacement de son corps depuis le repos (docs/132) */
  update(listener, toFrame, field = null, shiftOf = null) {
    // classe par distance : on garde les plus proches dans le budget
    const cand = [];
    for (let i = 0; i < this.systems.length; i++) {
      const s = this.systems[i];
      if (s.active === false) continue;   // inactif dans la scene (docs/132)
      const dv = shiftOf ? shiftOf(s) : null;
      const p = [s.position[0] + (dv ? dv[0] : 0) - toFrame[0],
                 s.position[1] + (dv ? dv[1] : 0) - toFrame[1],
                 s.position[2] + (dv ? dv[2] : 0) - toFrame[2]];
      const d = Math.hypot(p[0] - listener.x, p[1] - listener.y, p[2] - listener.z);
      if (d < reach(s)) cand.push({ i, s, p, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const keep = new Set(cand.slice(0, MAX_LIVE).map((c) => c.i));

    for (const i of [...this.live.keys()]) if (!keep.has(i)) this.despawn(i);
    for (const c of cand.slice(0, MAX_LIVE)) {
      if (this.live.has(c.i)) {
        const ps = this.live.get(c.i);
        if (ps && ps.emitter && ps.emitter.position) ps.emitter.position.set(c.p[0], c.p[1], c.p[2]);
        else if (ps) ps.emitter = new this.B.Vector3(c.p[0], c.p[1], c.p[2]);
      } else {
        this.spawn(c.i, c.s, c.p);
      }
      this.applyGravity(c.i, c.s, field);
    }
  }

  /**
   * `gravityModifier` d'InitialModule : la part de la gravite ambiante que
   * subissent les particules. Unity la multiplie par `Physics.gravity`, un
   * vecteur global constant ; ce jeu n'en a pas — la verticale change d'un
   * corps a l'autre. C'est donc le CHAMP DOMINANT qui joue ce role, ce qui est
   * la traduction exacte du modele : une etincelle retombe vers la planete
   * sous laquelle elle est nee, pas vers un bas absolu.
   */
  applyGravity(i, s, field) {
    const ps = this.live.get(i);
    if (!ps || !s.gravityModifier) return;
    if (!field) { ps.gravity = this.B.Vector3.Zero(); return; }
    const g = field.magnitude * s.gravityModifier;
    ps.gravity = new this.B.Vector3(field.dir.x * g, field.dir.y * g, field.dir.z * g);
  }

  /**
   * Ouvre ou ferme des systemes NOMMES, sans toucher a leur budget.
   *
   * Les dix buses du vaisseau sont des systemes places comme les autres — ils
   * naissent et meurent avec la proximite — mais ils ne doivent emettre que
   * quand la poussee le dit (`ThrusterParticlesBehavior`, docs/46 lot 3). Le
   * reste du champ de particules garde son comportement : ce qui n'est pas
   * nomme ici n'est pas touche.
   *
   * @param etats Map nom -> booleen
   */
  /**
   * Comme `gate`, mais par POSITION.
   *
   * Les six buses du vaisseau miniature s'appellent toutes `Thruster_Small` :
   * piloter par nom les allumerait ou les eteindrait toutes les six ensemble.
   * C'est le troisieme endroit du portage ou le nom du build ne suffit pas,
   * apres les nuages et les pivots de tornade.
   */
  gateAt(etats, tolerance = 0.01) {
    if (!etats || !etats.size) return 0;
    let n = 0;
    for (const [i, ps] of this.live) {
      if (!ps) continue;
      const p = (this.systems[i] || {}).position;
      if (!p) continue;
      let veut;
      for (const [cle, v] of etats) {
        const q = cle.split(",").map(Number);
        if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tolerance) { veut = v; break; }
      }
      if (veut === undefined) continue;
      try {
        const tourne = ps.isStarted ? ps.isStarted() : true;
        if (veut && !tourne) { ps.start(); n++; }
        else if (!veut && tourne) { ps.stop(); n++; }
      } catch (e) { /* un systeme dispose : rien a piloter */ }
    }
    return n;
  }

  gate(etats) {
    if (!etats || !etats.size) return 0;
    let n = 0;
    for (const [i, ps] of this.live) {
      if (!ps) continue;
      const veut = etats.get((this.systems[i] || {}).name);
      if (veut === undefined) continue;
      try {
        const tourne = ps.isStarted ? ps.isStarted() : true;
        if (veut && !tourne) { ps.start(); n++; }
        else if (!veut && tourne) { ps.stop(); n++; }
      } catch (e) { /* un systeme dispose : rien a piloter */ }
    }
    return n;
  }

  /**
   * Relance des systemes NOMMES sans jamais les arreter.
   *
   * C'est ce que fait `RandomParticleBursts` : une bouffee part, et le systeme
   * va au bout de sa vie tout seul. `gate` couperait la bouffee a l'image
   * suivante.
   */
  pulse(noms) {
    if (!noms || !noms.size) return 0;
    let n = 0;
    for (const [i, ps] of this.live) {
      if (!ps || !noms.has((this.systems[i] || {}).name)) continue;
      try { ps.start(); n++; } catch (e) { /* un systeme dispose */ }
    }
    return n;
  }

  createSystem(s, p, nomOverride = null) {
    const B = this.B;
    const ps = new B.ParticleSystem(nomOverride || s.name || `ps_unknown`,
      Math.min(s.capacity || 200, MAX_CAPACITY), this.scene);
    const tex = this.texture(s.texture);
    if (tex) ps.particleTexture = tex;
    if (s.rotation) {
      // Un maillage vide sert d'emetteur : Babylon oriente les directions et
      // la forme par sa matrice monde.
      const e = new B.Mesh(`${ps.name}_emetteur`, this.scene);
      e.position.set(p[0], p[1], p[2]);
      e.rotationQuaternion = new B.Quaternion(...emitterRotation(s.rotation));
      e.isPickable = false;
      ps.emitter = e;
      ps.onDisposeObservable.add(() => e.dispose());
    } else {
      ps.emitter = new B.Vector3(p[0], p[1], p[2]);
    }

    const c = teinteParticules(s.color || [1, 1, 1, 1], s.tint, s.blend);
    ps.color1 = new B.Color4(c[0], c[1], c[2], c[3]);
    ps.color2 = new B.Color4(c[0], c[1], c[2], c[3] * 0.6);
    ps.colorDead = new B.Color4(c[0], c[1], c[2], 0);
    if (s.colorOverLife && s.colorOverLife.length > 1) {
      for (const [t, k] of s.colorOverLife) {
        const col = new B.Color4(k[0] * c[0], k[1] * c[1], k[2] * c[2], k[3] * c[3]);
        ps.addColorGradient(t, col, col);
      }
    }
    ps.blendMode = s.blend === "alpha"
      ? B.ParticleSystem.BLENDMODE_STANDARD
      : s.blend === "multiply"
        ? B.ParticleSystem.BLENDMODE_MULTIPLY
        : B.ParticleSystem.BLENDMODE_ADD;

    const range = (r, fallback, floor) => {
      const lo = r ? Math.max(floor, r[0]) : Math.max(floor, fallback);
      const hi = r ? Math.max(lo, r[1]) : lo;
      return [lo, hi];
    };
    const [smin, smax] = range(s.sizeRange, s.size || 1, 0.01);
    ps.minSize = smin; ps.maxSize = smax;
    for (const [t, lo, hi] of sizeGradients(s, smin, smax)) ps.addSizeGradient(t, lo, hi);
    if (s.rotationSpeed) {
      ps.minAngularSpeed = -s.rotationSpeed;
      ps.maxAngularSpeed = s.rotationSpeed;
    }
    if (s.velocity) {
      const v = new B.Vector3(s.velocity.x, s.velocity.y, s.velocity.z);
      if (v.lengthSquared() > 0) {
        ps.direction1 = v.clone();
        ps.direction2 = v.clone();
        ps.minEmitPower = v.length();
        ps.maxEmitPower = v.length();
      }
    }
    if (s.clampVelocity && s.clampVelocity.magnitude > 0) {
      ps.maxEmitPower = Math.min(ps.maxEmitPower, s.clampVelocity.magnitude);
      ps.minEmitPower = Math.min(ps.minEmitPower, ps.maxEmitPower);
      if (ps.addLimitVelocityGradient) {
        ps.addLimitVelocityGradient(0, s.clampVelocity.magnitude);
        ps.limitVelocityDamping = s.clampVelocity.dampen;
      }
    }
    if (s.rotationBySpeed && s.rotationBySpeed.degreesPerSecond) {
      const r = s.rotationBySpeed.degreesPerSecond * Math.PI / 180;
      ps.minAngularSpeed = Math.min(ps.minAngularSpeed ?? 0, -r);
      ps.maxAngularSpeed = Math.max(ps.maxAngularSpeed ?? 0, r);
    }
    if (s.sheet && tex && s.textureSize) {
      const { tilesX, tilesY, cycles } = s.sheet;
      const [tw, th] = s.textureSize;
      ps.isAnimationSheetEnabled = true;
      ps.spriteCellWidth = Math.max(1, Math.floor(tw / Math.max(1, tilesX)));
      ps.spriteCellHeight = Math.max(1, Math.floor(th / Math.max(1, tilesY)));
      ps.startSpriteCellID = 0;
      ps.endSpriteCellID = Math.max(1, tilesX * tilesY) - 1;
      ps.spriteCellChangeSpeed = (cycles || 1) <= 1 ? 0 : cycles;
      ps.spriteCellLoop = true;
    }
    const [lmin, lmax] = range(s.lifetimeRange, s.lifetime || 1, 0.05);
    ps.minLifeTime = lmin; ps.maxLifeTime = lmax;
    ps.emitRate = Math.max(0.1, s.rate || 10);
    const [vmin, vmax] = range(s.speedRange, s.startSpeed || 0, 0);
    ps.minEmitPower = vmin; ps.maxEmitPower = vmax;
    ps.updateSpeed = 0.016 * (s.speedScale || 1);
    const cycles = prewarmCycles(s, 0.016);
    if (cycles) { ps.preWarmStepOffset = 5; ps.preWarmCycles = cycles; }

    const sh = s.shape || { type: "sphere", radius: 1 };
    const r2 = Math.max(0.01, sh.radius || 1);
    if (sh.type === "box") ps.createBoxEmitter(
      new B.Vector3(0, 1, 0), new B.Vector3(0, 1, 0),
      new B.Vector3(-r2, -r2, -r2), new B.Vector3(r2, r2, r2));
    else if (sh.type.startsWith("cone")) ps.createConeEmitter(
      r2, Math.min(Math.PI / 2, (sh.angle || 30) * Math.PI / 180));
    else if (sh.type.startsWith("hemisphere")) ps.createHemisphericEmitter(r2);
    else ps.createSphereEmitter(r2);

    if (s.subEmitters && s.subEmitters.length && B.SubEmitter) {
      ps.subEmitters = s.subEmitters.map(sub => {
        const cfg = this.systems.find(x => x.name === sub.name);
        if (!cfg) return null;
        const subPs = this.createSystem(cfg, p, `${ps.name}_sub_${sub.name}`);
        if (!subPs) return null;
        const type = sub.event === "birth" ? B.SubEmitterType.ATTACHED : B.SubEmitterType.END;
        const em = new B.SubEmitter(subPs);
        em.type = type;
        em.inheritDirection = true;
        em.inheritedVelocityAmount = 1;
        return em;
      }).filter(e => e);
    }
    return ps;
  }

  /**
   * Demarre LE systeme de ce nom le plus proche d'un point du monde (position
   * de l'instant zero, celle que portent les donnees). Six
   * `TeleportParticles`, quatre `EruptionParticles` : c'est le script du lieu
   * qui joue le sien, par sa reference (`_launchParticles`), et les passages
   * sont a moins de 40 unites les uns des autres — le plus proche, pas tous
   * ceux d'un rayon.
   * @returns 1 si un systeme a ete pilote, 0 sinon
   */
  jouerPres(nom, point, rayon = 50) {
    return this.piloterPres(nom, point, rayon, true);
  }

  /** Arrete les systemes nommes poses pres d'un point (`ParticleSystem.Stop`). */
  arreterPres(nom, point, rayon = 50) {
    return this.piloterPres(nom, point, rayon, false);
  }

  piloterPres(nom, point, rayon, allume) {
    const ps = this.lePlusProche(nom, point, rayon);
    if (!ps) return 0;
    try { if (allume) ps.start(); else ps.stop(); return 1; } catch (e) { return 0; }
  }

  /** Le systeme vivant de ce nom le plus proche d'un point, dans un rayon. */
  lePlusProche(nom, point, rayon = 50) {
    if (!point) return null;
    let best = null, bestD = rayon;
    for (const [i, ps] of this.live) {
      const s = this.systems[i] || {};
      if (!ps || s.name !== nom || !s.position) continue;
      const d = Math.hypot(s.position[0] - point[0], s.position[1] - point[1],
                           s.position[2] - point[2]);
      if (d <= bestD) { bestD = d; best = ps; }
    }
    return best;
  }

  /** Arrete les systemes NOMMES, ou qu'ils soient. */
  arreter(noms) {
    if (!noms || !noms.size) return 0;
    let n = 0;
    for (const [i, ps] of this.live) {
      if (!ps || !noms.has((this.systems[i] || {}).name)) continue;
      try { ps.stop(); n++; } catch (e) { /* dispose */ }
    }
    return n;
  }

  spawn(i, s, p) {
    try {
      const ps = this.createSystem(s, p, s.name || `ps${i}`);
      if (ps) {
        // `playOnAwake` : 53 des 135 systemes ne partent PAS seuls. Buses,
        // eruptions, passages, explosions, etoiles qui se dispersent : c'est
        // un script qui les joue (`ParticleSystem.Play`, `il.mjs --appel`).
        // Le portage les demarrait tous — l'explosion du vaisseau brulait
        // au-dessus du village des le reveil (docs/132).
        if (s.playOnAwake !== false) ps.start();
        this.live.set(i, ps);
      } else {
        this.failed++;
        this.live.set(i, null);
      }
    } catch (e) {
      this.failed++;
      this.live.set(i, null);
    }
  }

  despawn(i) {
    const ps = this.live.get(i);
    if (ps) { try { ps.stop(); ps.dispose(); } catch (e) { /* deja libere */ } }
    this.live.delete(i);
  }

  get count() { return this.live.size; }
  get particles() {
    let n = 0;
    for (const ps of this.live.values()) if (ps) n += ps.getActiveCount();
    return n;
  }
}
