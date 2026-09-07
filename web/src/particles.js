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

/** Rayon d'influence approximatif : de quoi decider quand instancier. */
function reach(s) {
  const shape = (s.shape && s.shape.radius) || 0;
  const travel = (s.startSpeed || 0) * (s.lifetime || 1);
  return Math.max(30, (shape + travel + (s.size || 1)) * NEAR);
}

export class ParticleField {
  constructor(BABYLON, scene, systems) {
    this.B = BABYLON;
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
          new this.B.Texture(`data/particles/${file}`, this.scene));
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
  update(listener, toFrame, field = null) {
    // classe par distance : on garde les plus proches dans le budget
    const cand = [];
    for (let i = 0; i < this.systems.length; i++) {
      const s = this.systems[i];
      const p = [s.position[0] - toFrame[0], s.position[1] - toFrame[1],
                 s.position[2] - toFrame[2]];
      const d = Math.hypot(p[0] - listener.x, p[1] - listener.y, p[2] - listener.z);
      if (d < reach(s)) cand.push({ i, s, p, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const keep = new Set(cand.slice(0, MAX_LIVE).map((c) => c.i));

    for (const i of [...this.live.keys()]) if (!keep.has(i)) this.despawn(i);
    for (const c of cand.slice(0, MAX_LIVE)) {
      if (this.live.has(c.i)) {
        const ps = this.live.get(c.i);
        if (ps) ps.emitter = new this.B.Vector3(c.p[0], c.p[1], c.p[2]);
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

  spawn(i, s, p) {
    const B = this.B;
    try {
      const ps = new B.ParticleSystem(s.name || `ps${i}`,
        Math.min(s.capacity || 200, MAX_CAPACITY), this.scene);
      const tex = this.texture(s.texture);
      if (tex) ps.particleTexture = tex;
      ps.emitter = new B.Vector3(p[0], p[1], p[2]);

      const c = s.color || [1, 1, 1, 1];
      ps.color1 = new B.Color4(c[0], c[1], c[2], c[3]);
      ps.color2 = new B.Color4(c[0], c[1], c[2], c[3] * 0.6);
      ps.colorDead = new B.Color4(c[0], c[1], c[2], 0);
      // ColorModule : le degrade de couleur au fil de la vie de la particule.
      // 110 systemes sur 135 en ont un, et c'est ce qui fait la difference
      // entre une flamme et une tache orange — celle du feu de camp passe du
      // vert au magenta puis au rouge en s'eteignant.
      if (s.colorOverLife && s.colorOverLife.length > 1) {
        for (const [t, k] of s.colorOverLife) {
          const col = new B.Color4(k[0] * c[0], k[1] * c[1], k[2] * c[2], k[3] * c[3]);
          ps.addColorGradient(t, col, col);
        }
      }
      // Le mode de fusion vient du shader du materiau, pas d'une hypothese :
      // 110 systemes sur 135 sont additifs, mais 25 sont en fusion alpha. Tout
      // forcer en additif saturait le ciel.
      ps.blendMode = s.blend === "alpha"
        ? B.ParticleSystem.BLENDMODE_STANDARD
        : s.blend === "multiply"
          ? B.ParticleSystem.BLENDMODE_MULTIPLY
          : B.ParticleSystem.BLENDMODE_ADD;

      // Bornes plutot que valeur unique quand la courbe en donne deux : une
      // gerbe dont toutes les etincelles ont exactement la meme taille et la
      // meme duree de vie se voit tout de suite.
      const range = (r, fallback, floor) => {
        const lo = r ? Math.max(floor, r[0]) : Math.max(floor, fallback);
        const hi = r ? Math.max(lo, r[1]) : lo;
        return [lo, hi];
      };
      const [smin, smax] = range(s.sizeRange, s.size || 1, 0.01);
      ps.minSize = smin; ps.maxSize = smax;
      // SizeModule : la taille au fil de la vie, presente sur 80 systemes.
      // Les valeurs sont des FACTEURS de la taille initiale, d'ou le gradient
      // de facteur plutot qu'une taille absolue.
      if (s.sizeOverLife && s.sizeOverLife.length > 1) {
        for (const [t, v] of s.sizeOverLife) ps.addSizeGradient(t, v, v);
      }
      // RotationModule : vitesse angulaire, en radians par seconde. 28 systemes.
      if (s.rotationSpeed) {
        ps.minAngularSpeed = -s.rotationSpeed;
        ps.maxAngularSpeed = s.rotationSpeed;
      }
      // UVModule : planche de sprites. 13 systemes, dont les explosions.
      if (s.sheet && tex && s.textureSize) {
        const { tilesX, tilesY, cycles } = s.sheet;
        const [tw, th] = s.textureSize;
        ps.isAnimationSheetEnabled = true;
        // La taille de case vient de l'extracteur, pas de tex.getSize() : la
        // texture n'est pas forcement chargee au moment ou l'on cree le systeme,
        // et une taille nulle donnerait des cases de 1 pixel.
        ps.spriteCellWidth = Math.max(1, Math.floor(tw / Math.max(1, tilesX)));
        ps.spriteCellHeight = Math.max(1, Math.floor(th / Math.max(1, tilesY)));
        ps.startSpriteCellID = 0;
        ps.endSpriteCellID = Math.max(1, tilesX * tilesY) - 1;
        // Babylon etale la planche entiere sur la duree de vie quand la vitesse
        // vaut 0, ce qui correspond exactement au cas cycles = 1 d'Unity.
        // Au-dela, le rapport est approximatif : Babylon exprime une cadence,
        // Unity un nombre de passages.
        ps.spriteCellChangeSpeed = (cycles || 1) <= 1 ? 0 : cycles;
        ps.spriteCellLoop = true;
      }
      const [lmin, lmax] = range(s.lifetimeRange, s.lifetime || 1, 0.05);
      ps.minLifeTime = lmin; ps.maxLifeTime = lmax;
      ps.emitRate = Math.max(0.1, s.rate || 10);
      const [vmin, vmax] = range(s.speedRange, s.startSpeed || 0, 0);
      ps.minEmitPower = vmin; ps.maxEmitPower = vmax;
      ps.updateSpeed = 0.016 * (s.speedScale || 1);

      const sh = s.shape || { type: "sphere", radius: 1 };
      const r = Math.max(0.01, sh.radius || 1);
      if (sh.type === "box") ps.createBoxEmitter(
        new B.Vector3(0, 1, 0), new B.Vector3(0, 1, 0),
        new B.Vector3(-r, -r, -r), new B.Vector3(r, r, r));
      else if (sh.type.startsWith("cone")) ps.createConeEmitter(
        r, Math.min(Math.PI / 2, (sh.angle || 30) * Math.PI / 180));
      else if (sh.type.startsWith("hemisphere")) ps.createHemisphericEmitter(r);
      else ps.createSphereEmitter(r);

      ps.start();
      this.live.set(i, ps);
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
