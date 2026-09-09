// Brouillards : volumes spheriques et coque quantique.
//
// Deux systemes distincts, et le jeu ne les traite pas pareil.
//
// 1. FogVolume + FogDetector : du brouillard de rendu. Chaque volume est une
//    sphere qui donne une densite selon la distance, le detecteur SOMME les
//    densites de tous les volumes ou l'on se trouve, plafonne le total, et
//    alimente le brouillard exponentiel au carre du moteur.
//
// 2. QuantumFogBoundary + QuantumFogSphere : une coque opaque autour du joueur,
//    dont seule l'ALPHA varie. Ce n'est pas du brouillard de rendu mais un
//    objet, ce qui lui permet d'etre totalement opaque a l'approche de la lune
//    quantique puis de s'ouvrir quand on la traverse.
//
// Les deux volumes du build, positions et rayons lus dans la scene :
//
//   Dark Bramble        (0, 0, 20000)      1200 -> 1400   densite 0     -> 0,01
//   dimension derelicte (0, -10000, 0)      400 ->  500   densite 0,01  -> 0,005
//
// Le second decroit vers le centre : on entre dans une poche degagee.

// RenderSettings de la scene : exponentiel au carre (m_FogMode 3).
//
// Ces deux valeurs etaient recopiees ici a la main. Elles sont maintenant LUES
// (data/lighting.json, voir pipeline/extract/lighting.js) et ne servent plus
// que de repli — une valeur juste et une valeur recopiee se ressemblent
// jusqu'au jour ou l'une des deux change. Ce jour est arrive : le gris moyen
// (0,5 ; 0,5 ; 0,5) qui figurait ici etait FAUX. Mesure sur le build, le
// brouillard de la scene est un vert-gris tres sombre — trois fois plus
// sombre que ce qui etait recopie.
export const FOG_COLOR = [0.1456, 0.1567, 0.1403];
export const FOG_MODE = "exp2";
export const MAX_DENSITY = 0.5;        // FogDetector._maxDensity
export const FOG_FAR_CLIP = 2400;      // PlayerCameraController.LateUpdate
export const FAR_CLIP_TRIGGER = 0.01;  // ... au-dela de cette densite

/** Volumes de brouillard du build, en coordonnees monde. */
export function fogVolumes(gameplay) {
  return ((gameplay.placed || {}).FogVolume || []).map((v) => {
    const f = v.fields || {};
    return {
      name: v.name,
      position: v.position,
      innerRadius: f._innerRadius ?? 1200,
      outerRadius: f._outerRadius ?? 1400,
      innerDensity: f._innerDensity ?? 0.01,
      outerDensity: f._outerDensity ?? 0,
      bramble: !!f._isBrambleFog,
    };
  });
}

/**
 * Densite d'un volume a une position donnee.
 *
 * FogVolume.GetDensityAtPosition : la decroissance est CUBIQUE, pas lineaire.
 * Le brouillard reste donc tenu presque jusqu'au rayon interieur, puis monte
 * vite — c'est ce qui donne l'impression d'un mur et non d'un degrade.
 */
export function densityAt(v, x, y, z) {
  const d = Math.hypot(x - v.position[0], y - v.position[1], z - v.position[2]);
  const t = 1 - Math.min(1, Math.max(0, (d - v.innerRadius) /
                                       (v.outerRadius - v.innerRadius)));
  return v.outerDensity + (v.innerDensity - v.outerDensity) * t * t * t;
}

/**
 * Le detecteur du joueur.
 *
 * Un volume ne compte que si l'on est DEDANS : le jeu s'appuie sur les
 * declencheurs de collision, on teste donc la distance au rayon exterieur.
 */
export class FogField {
  /** @param settings `settings` de data/lighting.json, ou null pour le repli */
  constructor(volumes, settings = null) {
    this.volumes = volumes;
    this.density = 0;
    this.inBramble = false;
    this.flash = null;
    this.color = (settings && settings.fogColor) || FOG_COLOR;
    this.mode = (settings && settings.fogMode) || FOG_MODE;
    // Une zone d'epave suspend la mise a jour du brouillard : `DerelictCloaker`
    // et les evenements EnterDerelictZone / ExitDerelictZone. La densite garde
    // alors la valeur qu'elle avait en entrant.
    this.suspended = false;
  }

  /** Entree/sortie d'une zone d'epave : le brouillard cesse d'etre recalcule. */
  setSuspended(on) {
    if (this.suspended === !!on) return false;
    this.suspended = !!on;
    return true;
  }

  /** Eclair de brouillard : montee cubique puis descente cubique. */
  startFlash(peak, fadeIn, fadeOut, now) {
    this.flash = { peak, fadeIn, fadeOut, t0: now };
  }

  /**
   * @param pos position de la camera dans le repere courant
   * @param framePos position monde de l'origine du repere courant
   */
  update(pos, framePos, now) {
    if (this.suspended) return this.density;
    const o = framePos || [0, 0, 0];
    let net = 0;
    let bramble = false;
    for (const v of this.volumes) {
      const x = pos.x + o[0], y = pos.y + o[1], z = pos.z + o[2];
      const d = Math.hypot(x - v.position[0], y - v.position[1], z - v.position[2]);
      if (d > v.outerRadius) continue;
      net += densityAt(v, x, y, z);
      if (v.bramble) bramble = true;
    }
    if (this.flash) {
      const { peak, fadeIn, fadeOut, t0 } = this.flash;
      const e = now - t0;
      let f = 0;
      if (e < fadeIn) {
        f = Math.pow(Math.min(1, e / fadeIn), 3);
      } else if (e - fadeIn < fadeOut) {
        f = Math.pow(1 - Math.min(1, (e - fadeIn) / fadeOut), 3);
      } else {
        this.flash = null;
      }
      net += f * peak;
    }
    this.density = Math.min(net, MAX_DENSITY);
    this.inBramble = bramble;
    return this.density;
  }

  /** Applique le brouillard a la scene et resserre le plan lointain. */
  apply(BABYLON, scene, camera) {
    if (this.density > 0) {
      scene.fogMode = this.mode === "linear" ? BABYLON.Scene.FOGMODE_LINEAR
        : this.mode === "exp" ? BABYLON.Scene.FOGMODE_EXP
        : BABYLON.Scene.FOGMODE_EXP2;
      scene.fogDensity = this.density;
      scene.fogColor = new BABYLON.Color3(...this.color);
    } else {
      scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
    }
    if (camera) {
      // le plan lointain d'origine est retenu au premier passage : le jeu
      // memorise de meme _initFarClipPlane a l'initialisation
      if (this.baseFar === undefined) this.baseFar = camera.maxZ;
      camera.maxZ = this.density >= FAR_CLIP_TRIGGER ? FOG_FAR_CLIP : this.baseFar;
    }
  }
}

/**
 * Coque de brouillard quantique.
 *
 * QuantumFogBoundary mesure la distance entre la lune et le joueur, et en tire
 * une alpha :
 *
 *   au-dela du rayon exterieur   fond sur l'epaisseur de transition
 *   entre les deux rayons        opaque, et sortir par la force l'effondrement
 *   en deca du rayon interieur   se degage, la lune apparait
 *
 * La sortie du volume declenche un fondu propre, a 0,5 par seconde.
 */
export class QuantumFog {
  constructor(conf) {
    const f = (conf && conf.fields) || {};
    this.inner = f._innerRadius ?? 150;
    this.outer = f._outerRadius ?? 150;
    this.fade = f._fadeZoneThickness ?? 30;
    this.alpha = 0;
    this.inside = false;
    this.fadingOut = false;
  }

  /**
   * @param d distance entre le joueur et la lune quantique
   * @returns { alpha, entered, exited }
   */
  update(d, dt) {
    let a;
    let entered = false, exited = false;
    if (d > this.outer + this.fade) {
      // hors du volume : le jeu ne pilote plus l'alpha, elle s'efface seule
      this.fadingOut = true;
      a = Math.max(0, this.alpha - dt * 0.5);
      this.inside = false;
    } else if (d > this.outer) {
      this.fadingOut = false;
      a = Math.min(1, Math.max(0, 1 - Math.abs(d - this.outer) / this.fade));
      this.inside = false;
    } else if (d >= this.inner) {
      this.fadingOut = false;
      a = 1;
      if (this.inside) { this.inside = false; exited = true; }
    } else {
      this.fadingOut = false;
      a = Math.min(1, Math.max(0, 1 - Math.abs(this.inner - d) / this.fade));
      if (!this.inside) { this.inside = true; entered = true; }
    }
    this.alpha = a;
    return { alpha: a, entered, exited };
  }
}

/**
 * Masquage par le brouillard.
 *
 * `FogCloak` desactive les rendus de son sous-arbre au demarrage et ne les
 * rallume qu'a l'entree dans le brouillard de Dark Bramble. Sans cela, on voit
 * les quatre anglerfish et l'epave de loin, ce qui vide la zone de sa tension.
 *
 * Le detail qui compte est `GetAllowChangeState` : un objet ne change d'etat
 * que si l'on est ASSEZ LOIN — au-dela de 100 unites dans le brouillard, de 300
 * en dehors. Rien n'apparait ni ne disparait sous les yeux du joueur ; tant que
 * la condition n'est pas remplie, le composant reste actif et reessaie.
 */
export const CLOAK_NEAR_IN_FOG = 100;
export const CLOAK_NEAR_OUTSIDE = 300;

export function fogCloaks(gameplay) {
  return ((gameplay.placed || {}).FogCloak || [])
    .map((c) => ({ name: c.name, position: c.position }));
}

export class FogCloaks {
  /** @param resolve (nom, position) => liste de noeuds a masquer */
  constructor(cloaks, resolve) {
    this.cloaks = cloaks.map((c) => ({ ...c, nodes: null, visible: false }));
    this.resolve = resolve;
  }

  get hidden() { return this.cloaks.filter((c) => c.nodes && !c.visible).length; }

  update(pos, framePos, inFog, density) {
    const o = framePos || [0, 0, 0];
    for (const c of this.cloaks) {
      if (!c.nodes) {
        c.nodes = this.resolve(c.name, c.position);
        if (!c.nodes || !c.nodes.length) { c.nodes = null; continue; }
        this.setVisible(c, false);      // masque au depart, comme Awake()
      }
      if (c.visible === inFog) continue;
      const d = Math.hypot(c.position[0] - o[0] - pos.x,
                           c.position[1] - o[1] - pos.y,
                           c.position[2] - o[2] - pos.z);
      const allowed = density >= 0.01 ? d > CLOAK_NEAR_IN_FOG : d > CLOAK_NEAR_OUTSIDE;
      if (allowed) this.setVisible(c, inFog);
    }
  }

  setVisible(c, on) {
    for (const n of c.nodes) if (n.setEnabled) n.setEnabled(on);
    c.visible = on;
  }
}

/**
 * Lumieres dans le brouillard.
 *
 * `FogLight` ne dessine pas une lumiere mais une ICONE a l'ecran, a la position
 * projetee de l'objet, et seulement tant qu'on est dans le brouillard. C'est le
 * seul repere de navigation de Dark Bramble.
 *
 * Le build en compte six, et leur repartition est tout le piege de la zone :
 * quatre leurres d'anglerfish, une balise de capsule de sauvetage, une balise
 * de l'epave du bucheron. Rien ne les distingue de loin.
 *
 * L'alpha monte et descend a 1 par seconde, plafonnee a 0,8, selon la ligne de
 * vue. Le test d'occlusion part non pas de la lumiere mais d'un point avance de
 * `_lineOfSightOffset` vers la camera, et s'arrete 10 unites avant elle : une
 * lumiere posee contre une paroi ne se masque pas elle-meme.
 */
export const LIGHT_FADE_RATE = 1;
export const LIGHT_MAX_ALPHA = 0.8;
export const LIGHT_ICON_RISE = 30;    // l'icone est remontee de 30 px

export function fogLights(gameplay) {
  return ((gameplay.placed || {}).FogLight || []).map((l) => {
    const f = l.fields || {};
    return {
      name: l.name,
      position: l.position,
      offset: f._lineOfSightOffset ?? 10,
      icon: (f._lightIcon && f._lightIcon.name) || null,
    };
  });
}

/** Icones des lumieres, projetees a l'ecran. */
export class FogLightIcons {
  constructor(BABYLON, scene, root, lights, dir = "data/interface/") {
    this.B = BABYLON;
    this.scene = scene;
    this.dir = dir;
    this.tick = 0;
    this.lights = lights.map((l, i) => {
      const img = document.createElement("img");
      img.className = "ow-foglight";
      img.src = dir + (l.icon || "EscapePodBeacon") + ".png";
      img.style.opacity = "0";
      root.appendChild(img);
      return { ...l, img, alpha: 0, visible: false, phase: i };
    });
  }

  get lit() { return this.lights.filter((l) => l.alpha > 0.01).length; }

  /**
   * @param inFog  le composant n'est actif que dans le brouillard de Dark Bramble
   */
  update(camera, framePos, dt, inFog) {
    this.tick += 1;
    const o = framePos || [0, 0, 0];
    const V = this.B.Vector3;
    const engine = this.scene.getEngine();
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    for (const l of this.lights) {
      if (!inFog) {
        // hors brouillard le composant est desactive : l'alpha reste ou elle est
        // et l'icone n'est plus dessinee
        l.img.style.opacity = "0";
        continue;
      }
      const p = new V(l.position[0] - o[0], l.position[1] - o[1], l.position[2] - o[2]);
      // Le test d'occlusion est le poste couteux : on l'echelonne sur cinq
      // images, une lumiere a la fois. Le fondu, lui, reste continu.
      if ((this.tick + l.phase) % 5 === 0) l.visible = this.lineOfSight(camera, p, l.offset);
      const target = l.visible ? LIGHT_MAX_ALPHA : 0;
      const step = LIGHT_FADE_RATE * dt;
      l.alpha += Math.max(-step, Math.min(step, target - l.alpha));
      l.alpha = Math.max(0, Math.min(LIGHT_MAX_ALPHA, l.alpha));

      const s = V.Project(p, this.B.Matrix.Identity(),
                          this.scene.getTransformMatrix(),
                          camera.viewport.toGlobal(w, h));
      const behind = V.TransformCoordinates(p, this.scene.getViewMatrix()).z <= 0;
      if (behind || l.alpha <= 0.005) {
        l.img.style.opacity = "0";
        continue;
      }
      l.img.style.opacity = String(l.alpha);
      l.img.style.left = `${s.x}px`;
      l.img.style.top = `${s.y - LIGHT_ICON_RISE}px`;
    }
  }

  /**
   * Vrai si rien ne s'interpose. Le rayon part d'un point avance de `offset`
   * vers la camera et s'arrete 10 unites avant elle, comme dans le jeu.
   */
  lineOfSight(camera, p, offset) {
    const V = this.B.Vector3;
    const toCam = camera.position.subtract(p);
    const len = toCam.length();
    if (len < 1e-3) return true;
    const dir = toCam.scale(1 / len);
    const from = p.add(dir.scale(len < offset ? 0 : offset));
    const to = camera.position.subtract(dir.scale(10));
    const seg = to.subtract(from);
    const d = seg.length();
    if (d < 1e-3) return true;
    const hit = this.scene.pickWithRay(new this.B.Ray(from, seg.scale(1 / d), d),
                                       (m) => m.isEnabled() && m.isVisible &&
                                              m.getTotalVertices() > 0);
    return !(hit && hit.hit);
  }
}
