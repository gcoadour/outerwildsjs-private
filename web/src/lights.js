// Lumieres de la scene.
//
// Le moteur n'en avait que deux — une directionnelle pour l'etoile, une
// hemispherique d'ambiance — pour tout un systeme solaire. Le build en pose
// beaucoup plus, avec leur type, leur couleur, leur intensite et leur portee :
// le feu de camp, les interieurs, les balises de Dark Bramble.
//
// Une lumiere temps reel est chere, et il y en a trop pour toutes les allumer.
// C'est la meme reponse que pour l'audio et les particules : on instancie a la
// volee, dans un budget, celles dont on est assez pres pour qu'elles comptent.
// Le choix des elues est de la logique pure, donc verifiable sans navigateur.

/** Lumieres allumees simultanement. Au-dela, le temps par image s'effondre. */
export const LIGHT_BUDGET = 8;
/** Multiple de la portee au-dela duquel une lumiere ne sert plus a rien. */
export const LIGHT_REACH = 1.25;

export async function loadLighting() {
  try {
    const res = await fetch("data/lighting.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("data/lighting.json absent :", e.message);
    return { settings: null, lights: [] };
  }
}

/**
 * Les lumieres a allumer, de la plus proche a la plus lointaine.
 *
 * Une lumiere cuite dans les lightmaps (`m_Lightmapping = 2`) n'eclaire rien a
 * l'execution : elle est ecartee d'emblee, sans quoi elle occuperait le budget
 * sans rien apporter. Une directionnelle n'a pas de portee et reste candidate
 * partout.
 */
export function pickLights(lights, listener, budget = LIGHT_BUDGET,
                           reach = LIGHT_REACH) {
  const near = [];
  for (const l of lights) {
    if (l.enabled === false || l.lightmapping === 2) continue;
    if (!(l.intensity > 0)) continue;
    const d = Math.hypot(l.position[0] - listener[0],
                         l.position[1] - listener[1],
                         l.position[2] - listener[2]);
    if (l.type === "directional") { near.push({ light: l, distance: 0 }); continue; }
    if (!(l.range > 0) || d > l.range * reach) continue;
    near.push({ light: l, distance: d });
  }
  // A budget egal, la plus proche gagne : c'est celle dont l'absence se voit.
  near.sort((a, b) => a.distance - b.distance);
  return near.slice(0, budget);
}

/**
 * Ce qui fait vivre une lumiere, transcrit des `Update` du build.
 *
 * Trois comportements, 39 lumieres sur Timber Hearth, et le portage n'en lisait
 * aucun : il posait l'intensite serialisee, fixe (docs/42-lumieres.md).
 */

/** Duree du fondu de `NightLight`, en secondes. Le build la code en dur. */
export const NIGHT_FADE = 5;

/**
 * `PulsingLight` : une sinusoide ADDITIVE autour des valeurs initiales.
 *
 *     intensite = sin((t + _timeOffset) x _pulseRate) x _intensityFluctuation
 *                 + intensite initiale
 *
 * et de meme pour la portee. C'est bien une addition, pas un facteur : une
 * fluctuation de 0,3 fait varier de plus ou moins 0,3, quelle que soit
 * l'intensite de depart.
 */
export function pulse(base, f, t) {
  const s = Math.sin((t + (f._timeOffset || 0)) * (f._pulseRate || 1));
  return {
    intensity: s * (f._intensityFluctuation || 0) + base.intensity,
    range: s * (f._rangeFluctuation || 0) + base.range,
  };
}

/**
 * `LightFlicker` : on vise un point au hasard autour de l'intensite initiale,
 * et on s'en approche par un `Lerp`. Une fois arrive (a 0,01 pres), on en tire
 * un autre.
 *
 * `rate` est un pas PAR IMAGE dans le build, et il est transcrit tel quel : le
 * vacillement d'un feu n'a pas de vitesse juste, seulement une allure.
 *
 * @param etat  {{ intensity, target }} modifie sur place
 * @param alea  fonction rendant un nombre dans [0, 1[
 */
export function flicker(etat, base, f, alea = Math.random) {
  const portee = f.range ?? 0.1, taux = f.rate ?? 0.2;
  if (Math.abs(etat.intensity - etat.target) < 0.01) {
    etat.target = (alea() * 2 - 1) * portee + base;
  }
  etat.intensity += (etat.target - etat.intensity) * taux;
  return etat.intensity;
}

/**
 * `NightLight` : l'intensite SERIALISEE est celle de la nuit. Au lever du
 * soleil elle fond vers `_dayIntensityMultiplier` (0,5 par defaut) en cinq
 * secondes ; au coucher, elle revient.
 *
 * @param night  vrai s'il fait nuit a cet endroit
 * @param t      secondes ecoulees depuis le dernier changement
 */
export function nightIntensity(base, f, night, t) {
  const jour = base * (f._dayIntensityMultiplier ?? 0.5);
  const de = night ? jour : base;      // on vient de l'etat precedent
  const vers = night ? base : jour;
  const u = Math.max(0, Math.min(1, t / NIGHT_FADE));
  return de + (vers - de) * u;
}

/** Champ de lumieres : instancie et libere selon le budget. */
export class LightField {
  constructor(BABYLON, scene, lights = [], budget = LIGHT_BUDGET) {
    this.B = BABYLON;
    this.scene = scene;
    this.lights = lights;
    this.budget = budget;
    this.live = new Map();     // lumiere -> objet Babylon
    this.failed = 0;
    this.anim = new Map();     // lumiere -> etat d'animation
    this.night = true;         // vrai tant qu'on n'a pas dit le contraire
    this.nightSince = 0;       // horodatage du dernier basculement
  }

  /** Le jour se leve, ou tombe : `NightLight` s'en sert, et rien d'autre. */
  setNight(night, t) {
    if (night === this.night) return;
    this.night = night;
    this.nightSince = t;
  }

  /**
   * Applique aux lumieres vivantes ce qui les anime.
   *
   * @param t temps en secondes, la meme horloge que `setNight`
   */
  animate(t) {
    let touchees = 0;
    for (const [light, node] of this.live) {
      const bs = light.behaviours;
      if (!bs || !bs.length) continue;
      let intensite = light.intensity ?? 1;
      let portee = light.range ?? 0;
      for (const b of bs) {
        if (b.kind === "PulsingLight") {
          const v = pulse({ intensity: intensite, range: portee }, b.fields, t);
          intensite = v.intensity; portee = v.range;
        } else if (b.kind === "NightLight") {
          intensite = nightIntensity(intensite, b.fields, this.night,
                                     t - this.nightSince);
        } else if (b.kind === "LightFlicker") {
          let etat = this.anim.get(light);
          if (!etat) { etat = { intensity: intensite, target: intensite };
                       this.anim.set(light, etat); }
          intensite = flicker(etat, light.intensity ?? 1, b.fields);
        }
      }
      node.intensity = Math.max(0, intensite);
      if (portee > 0 && "range" in node) node.range = portee;
      touchees += 1;
    }
    return touchees;
  }

  get count() { return this.live.size; }
  get total() { return this.lights.length; }

  /**
   * @param listener position de l'auditeur dans le repere courant
   * @param toFrame  decalage monde -> repere (position du corps ancre)
   */
  update(listener, toFrame = [0, 0, 0]) {
    if (!this.lights.length) return 0;
    const world = [listener.x + toFrame[0], listener.y + toFrame[1],
                   listener.z + toFrame[2]];
    const want = new Set();
    for (const { light } of pickLights(this.lights, world, this.budget)) {
      want.add(light);
      let node = this.live.get(light);
      if (!node) {
        node = this.create(light);
        if (!node) continue;
        this.live.set(light, node);
      }
      const p = [light.position[0] - toFrame[0], light.position[1] - toFrame[1],
                 light.position[2] - toFrame[2]];
      if (node.position) node.position.set(p[0], p[1], p[2]);
    }
    for (const [light, node] of [...this.live]) {
      if (want.has(light)) continue;
      try { node.dispose(); } catch (e) { /* deja liberee */ }
      this.live.delete(light);
      this.anim.delete(light);
    }
    return this.live.size;
  }

  create(l) {
    const B = this.B, V = B.Vector3;
    try {
      const p = new V(l.position[0], l.position[1], l.position[2]);
      const d = new V(l.direction[0], l.direction[1], l.direction[2]);
      let node;
      if (l.type === "spot") {
        // m_SpotAngle est l'angle TOTAL du cone, en degres ; Babylon attend
        // l'angle total en radians, et l'exposant de decroissance a part.
        node = new B.SpotLight(`ow_${l.name}`, p, d,
                               (l.spotAngle || 45) * Math.PI / 180, 2, this.scene);
      } else if (l.type === "directional") {
        node = new B.DirectionalLight(`ow_${l.name}`, d, this.scene);
      } else {
        node = new B.PointLight(`ow_${l.name}`, p, this.scene);
      }
      node.intensity = l.intensity ?? 1;
      if (l.range > 0) node.range = l.range;
      if (l.color) node.diffuse = new B.Color3(l.color[0], l.color[1], l.color[2]);
      return node;
    } catch (e) {
      this.failed += 1;
      return null;
    }
  }
}

// --- ce qui pilote la lumiere GLOBALE --------------------------------------
//
// @lit AmbientLightManager, ExternalLightController, FadeLight, DayNightTracker
// Quatre classes de plus, et la premiere corrige une ambiance qui SAUTAIT
// (docs/54-lumiere.md).

/** Portee par defaut des phares du vaisseau, en dur dans `Update`. */
export const SHIPLIGHT_RANGE = 600;

/**
 * L'ambiance que le build VISE, avant le fondu.
 *
 * `AmbientLightManager.Update` part du NOIR et ne prend l'ambiance du secteur
 * qu'a trois conditions reunies : aucune zone sans soleil, un secteur majeur
 * actif, et la camera active qui n'est pas celle de la CARTE.
 *
 * Le portage ne posait aucune des trois. Entrer dans une grotte n'assombrissait
 * donc rien, et ouvrir la carte gardait l'ambiance du lieu — alors que le build
 * la coupe, pour que les orbites se lisent sur du noir.
 *
 * @param sectorIntensity ce que le secteur courant donnerait
 * @param sunless         est-on dans une zone sans soleil (`DarkZone`)
 * @param inMajorSector   un secteur majeur est-il actif
 * @param onMapCamera     la carte est-elle la vue courante
 */
export function ambientTarget(sectorIntensity, { sunless = false, inMajorSector = true,
                                                 onMapCamera = false } = {}) {
  if (sunless || !inMajorSector || onMapCamera) return 0;
  return sectorIntensity;
}

/**
 * Et le FONDU qui y mene : `Color.Lerp(courant, cible, deltaTime)`.
 *
 * Le facteur est `deltaTime` lui-meme, ce qui est une constante de temps d'une
 * seconde : a soixante images par seconde on parcourt un soixantieme du chemin
 * restant par image. C'est lent, et c'est ce qui fait qu'une grotte s'assombrit
 * au lieu de s'eteindre.
 */
export function ambientStep(current, target, dt) {
  return current + (target - current) * Math.max(0, Math.min(1, dt));
}

/**
 * La portee des phares du vaisseau.
 *
 * `min(limite du secteur, 600)` dans un secteur majeur, 600 partout ailleurs.
 * Le portage lisait bien `_flashlightRangeLimit` (docs/46, lot 4) mais n'avait
 * pas la valeur par defaut : hors secteur, ses phares gardaient la portee du
 * dernier secteur traverse.
 */
export function shiplightRange(sectorLimit, inMajorSector = true) {
  if (!inMajorSector) return SHIPLIGHT_RANGE;
  const l = sectorLimit > 0 ? sectorLimit : SHIPLIGHT_RANGE;
  return Math.min(l, SHIPLIGHT_RANGE);
}

/**
 * Une lumiere qui fond vers une intensite.
 *
 * `FadeLight.FadeIntensity(cible, duree)` retient l'intensite COURANTE comme
 * point de depart — et non celle d'origine. Deux fondus qui se chevauchent
 * partent donc de la ou l'on en etait, sans a-coup.
 */
/**
 * `SatelliteSnapshotController` : deux secondes pour eteindre la salle, deux
 * pour la rallumer. Le meme nombre des deux cotes, et c'est le seul appelant de
 * `FadeIntensity` dans tout le build.
 */
export const SATELLITE_FADE = 2;

export class FadeLight {
  constructor(intensity = 0) {
    this.intensity = intensity;
    this.from = intensity;
    this.target = intensity;
    this.duration = 0;
    this.t0 = 0;
    this.fading = false;
  }

  fadeIntensity(target, duration, t = 0) {
    this.from = this.intensity;
    this.target = target;
    this.duration = duration;
    this.t0 = t;
    this.fading = true;
  }

  update(t) {
    if (!this.fading) return this.intensity;
    const u = this.duration > 0
      ? Math.max(0, Math.min(1, (t - this.t0) / this.duration)) : 1;
    this.intensity = this.from + (this.target - this.from) * u;
    if (u >= 1) { this.intensity = this.target; this.fading = false; }
    return this.intensity;
  }
}

/**
 * Le passage du jour a la nuit, et ses deux evenements.
 *
 * `DayNightTracker.Update` ne fait qu'une chose : comparer « fait-il jour ici »
 * a ce qu'il en etait a l'image precedente, et annoncer le lever ou le coucher.
 * Ce sont ces deux evenements que les quinze `NightLight` ecoutent
 * (docs/42-lumieres.md) — le portage calculait le jour, mais n'avait pas les
 * TRANSITIONS, et une lumiere de nuit ne savait donc pas qu'elle devait fondre.
 */
export class DayNightTracker {
  constructor(isDay = false) { this.wasDay = isDay; this.sunrise = false; this.sunset = false; }

  update(isDay) {
    this.sunrise = isDay && !this.wasDay;
    this.sunset = !isDay && this.wasDay;
    this.wasDay = isDay;
    return this;
  }
}
