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

/**
 * Combien de lumieres un materiau peut recevoir sur CE processeur graphique.
 *
 * Sous WebGL 2, Babylon donne a chaque lumiere son propre bloc d'uniformes, en
 * plus de trois blocs fixes (scene, maillage, materiau). Le chargeur glTF, lui,
 * releve `maxSimultaneousLights` de TOUS les materiaux au nombre de lumieres
 * de la scene — quinze ici, des qu'un objet tenu apporte les siennes. Mesure
 * dans Chromium : `GL_MAX_VERTEX_UNIFORM_BLOCKS` vaut 14 sous SwiftShader, et
 * ANGLE sur Direct3D 11 en donne 12. Au-dela, chaque shader echoue, retombe
 * sur son repli, et RECOMMENCE a l'image suivante : 7 s par image, 0,14 image
 * par seconde, et une scene sans eclairage.
 *
 * On garde une marge d'un bloc (les os et les cibles de morphing en prennent
 * un selon le maillage). Le plancher de 4 est la valeur par defaut de Babylon.
 */
export function lightCap(maxUniformBlocks) {
  if (!(maxUniformBlocks > 0)) return 4;
  return Math.max(4, Math.floor(maxUniformBlocks) - 4);
}

/**
 * L'attenuation d'une lumiere ponctuelle dans Unity 4, rendu direct.
 *
 * `_LightTextureB0` est une table de `1 / (1 + 25 x^2)`, x etant la distance
 * rapportee a la portee, et rien au-dela de la portee. Les shaders « legacy »
 * du build (Diffuse, Bumped Diffuse) multiplient ensuite par DEUX :
 * `Albedo * _LightColor0 * (NdotL * atten * 2)`. D'ou le feu de camp qui
 * dore toute la planete du titre, la ou une decroissance lineaire le laissait
 * brun sombre, et la lune qui l'eclaire moins qu'on ne croirait.
 */
// @mesure
export function attenuationUnity(distance, range) {
  if (!(range > 0)) return 0;
  const x2 = (distance * distance) / (range * range);
  return x2 < 1 ? 2 / (1 + 25 * x2) : 0;
}

/**
 * Remplace, dans les shaders PBR de Babylon, l'attenuation « standard » par
 * celle d'Unity 4. Seuls les materiaux qui renoncent a l'attenuation physique
 * (`usePhysicalLightFalloff = false`, voir `falloffUnity`) la lisent.
 */
export function patchAttenuationUnity(BABYLON) {
  const store = BABYLON && BABYLON.Effect && BABYLON.Effect.IncludesShadersStore;
  if (!store) return false;
  let ok = false;
  // Le PBR : sa fonction d'attenuation « standard ».
  const k = "pbrDirectLightingFalloffFunctions";
  if (typeof store[k] === "string") {
    const avant = "{return max(0.,1.0-length(lightOffset)/range);}";
    const apres = "{float x2=dot(lightOffset,lightOffset)/(range*range);" +
                  "return x2<1.0?2.0/(1.0+25.0*x2):0.0;}";
    if (store[k].includes(avant)) store[k] = store[k].replace(avant, apres);
    ok = store[k].includes(apres);
  }
  // Le materiau STANDARD (`computeLighting`, `computeSpotLighting`), qui porte
  // desormais le monde : ponctuelles et spots.
  const k2 = "lightsFragmentFunctions";
  if (typeof store[k2] === "string") {
    // Deux formes : une affectation, et une DECLARATION (`float attenuation=`),
    // qu'un bloc en accolades casserait.
    const avant = "attenuation=max(0.,1.0-length(direction)/range);";
    const expr = "(dot(direction,direction)<range*range?" +
                 "2.0/(1.0+25.0*dot(direction,direction)/(range*range)):0.0);";
    store[k2] = store[k2].split(avant).join("attenuation=" + expr);
    ok = store[k2].includes(expr) && ok;
  }
  return ok;
}

/**
 * Le test d'ombre des lumieres PONCTUELLES d'Unity 4, a la place de celui de
 * Babylon.
 *
 * Lu dans le programme de fragment `Internal-PrePassLighting` (variante
 * `POINT SHADOWS_CUBE`) de `unity default resources` : la distance stockee
 * dans la cube map, divisee par la portee (`_LightPositionRange.w`), est
 * comparee a `0.97 x d / portee`. Le biais est MULTIPLICATIF — trois pour cent
 * de la distance —, la ou celui de Babylon s'ajoute a la profondeur stockee.
 * Avec un biais additif de 0,0005 et quatre echantillons de Poisson, le sol de
 * l'ecran-titre s'ombrait lui-meme et sortait trois fois trop sombre
 * (docs/132). La variante `SHADOWS_SOFT` prend quatre echantillons decales de
 * 1/128 d'unite : a plusieurs metres de la lumiere, c'est le meme texel ; un
 * seul echantillon suffit donc.
 *
 * La comparaison est invariante d'echelle tant que la profondeur de Babylon
 * vaut `d / maxZ` : il faut `shadowMinZ` a 0 et un biais nul (`ombreUnity`).
 */
export const BIAIS_OMBRE_PONCTUELLE = 0.97;

export function patchOmbresUnity(BABYLON) {
  const store = BABYLON && BABYLON.Effect && BABYLON.Effect.IncludesShadersStore;
  if (!store || typeof store.shadowsFragmentFunctions !== "string") return false;
  const k = "shadowsFragmentFunctions";
  const debut = store[k].indexOf("float computeShadowCube(");
  if (debut < 0) return false;
  const avant = "return depth>shadow ? darkness : 1.0;";
  const apres = `return ${BIAIS_OMBRE_PONCTUELLE.toFixed(2)}*depth>shadow ? darkness : 1.0;`;
  const i = store[k].indexOf(avant, debut);
  if (i >= 0 && store[k].indexOf(apres, debut) < 0) {
    store[k] = store[k].slice(0, i) + apres + store[k].slice(i + avant.length);
  }
  return store[k].indexOf(apres, debut) >= 0;
}

/**
 * Regle un generateur d'ombres de Babylon comme une ombre ponctuelle d'Unity 4.
 *
 * @param ombre  `{ force }` lu dans `m_Shadows` (extract/lighting.js)
 */
export function ombreUnity(BABYLON, generateur, lumiere, ombre = null) {
  const force = ombre && typeof ombre.force === "number" ? ombre.force : 1;
  generateur.usePoissonSampling = false;
  if (BABYLON.ShadowGenerator && "FILTER_NONE" in BABYLON.ShadowGenerator) {
    generateur.filter = BABYLON.ShadowGenerator.FILTER_NONE;
  }
  generateur.bias = 0;
  generateur.normalBias = 0;
  // `_LightShadowData.x` vaut 1 - force : l'ombre ne tombe jamais sous lui.
  generateur.setDarkness(1 - force);
  lumiere.shadowMinZ = 0;
  if (lumiere.range) lumiere.shadowMaxZ = lumiere.range;
  return generateur;
}

/**
 * Le masque de calques d'une lumiere Unity, pour Babylon.
 *
 * Un maillage exporte porte `layerMask = 1 << calque` (`applyLayers`) ; une
 * lumiere dont le masque couvre tout ne filtre rien (0 dans Babylon).
 */
export function layerMaskFor(cullingMask) {
  const m = (cullingMask ?? 0xFFFFFFFF) >>> 0;
  return m === 0xFFFFFFFF ? 0 : m;
}

/** Bit des billes de sonde, que la camera de la sonde ne voit pas. */
export const CALQUE_SONDE = 0x20000000;

/**
 * Le masque d'une camera du build, pour Babylon.
 *
 * Un maillage cree par le portage garde le masque par defaut de Babylon
 * (0x0FFFFFFF) et reste donc visible sous n'importe quel masque qui touche aux
 * bits 0 a 27. Le bit des billes de sonde est ajoute, quel que soit le masque :
 * le build le contient, un repli doit le contenir aussi.
 */
export function masqueCamera(cullingMask) {
  const m = cullingMask == null ? 0x0FFFFFFF : (cullingMask >>> 0);
  return (m | CALQUE_SONDE) >>> 0;
}

/**
 * Pose, sur chaque maillage importe, le bit de son calque Unity.
 *
 * Sans lui, toute lumiere eclairait tout : les deux `surfacelighter` de
 * l'etoile teintaient la nuit de Timber Hearth d'orange et de rose, et le
 * soleil eclairait les 766 objets du calque `IgnoreSun` (docs/132). La camera
 * du portage voit les bits 0 a 27 : les calques du build (0 a 23) y tiennent.
 */
export function applyLayers(meshes) {
  let n = 0;
  // Tout maillage du lot : Babylon ne cree `metadata.gltf` que pour un noeud
  // qui porte des `extras`, et le calque 0 n'en ecrit pas.
  for (const m of meshes || []) {
    if (!m || typeof m.getTotalVertices !== "function") continue;
    const md = m.metadata && m.metadata.gltf;
    const couche = (md && md.extras && md.extras.layer) || 0;
    m.layerMask = (1 << couche) >>> 0;
    n++;
  }
  return n;
}

/**
 * Fait lire l'attenuation d'Unity aux materiaux d'un lot importe.
 *
 * Tous les materiaux glTF du portage sont en PBR, dont l'attenuation
 * physique (1/d^2) eteint une lumiere ponctuelle d'intensite 1 a un metre :
 * le feu de camp du reveil n'eclairait rien, ni les lampes du village. Unity 4
 * decroit sur la PORTEE (docs/131, docs/132).
 */
export function falloffUnity(meshes) {
  let n = 0;
  for (const m of meshes || []) {
    const mat = m.material;
    if (mat && "usePhysicalLightFalloff" in mat && mat.usePhysicalLightFalloff) {
      mat.usePhysicalLightFalloff = false;
      n++;
    }
  }
  return n;
}

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
                           reach = LIGHT_REACH, posOf = null) {
  const near = [];
  for (const l of lights) {
    if (l.enabled === false || l.lightmapping === 2) continue;
    if (!(l.intensity > 0)) continue;
    const q = posOf ? posOf(l) : l.position;
    const d = Math.hypot(q[0] - listener[0],
                         q[1] - listener[1],
                         q[2] - listener[2]);
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
    // `PulsingLight.Enable` / `Disable` coupent DEUX choses : le composant et
    // la lumiere elle-meme (`light.enabled`). Une lumiere pulsante n'est donc
    // pas forcement allumee — celle de l'alarme generale ne l'est qu'en
    // dessous de trente pour cent de coque, et le portage la faisait battre en
    // permanence (docs/116-trappe.md).
    this.eteintes = new Set();
  }

  /** `PulsingLight.Enable` / `Disable`, par NOM de lumiere. */
  allume(nom, on) {
    if (on) this.eteintes.delete(nom); else this.eteintes.add(nom);
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
      // Eteinte par un `Disable` : ni animee, ni eclairante.
      if (this.eteintes.has(light.name)) { node.intensity = 0; continue; }
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
  /**
   * @param shiftOf lumiere -> deplacement de son corps depuis le repos, ou null.
   *   Les positions extraites sont celles de la scene A L'ARRET ; Timber
   *   Hearth, lui, orbite a plus de deux cents unites par seconde. Sans ce
   *   decalage, le feu de camp du reveil laissait sa lumiere derriere lui des
   *   la premiere seconde (docs/132).
   */
  update(listener, toFrame = [0, 0, 0], shiftOf = null) {
    if (!this.lights.length) return 0;
    const world = [listener.x + toFrame[0], listener.y + toFrame[1],
                   listener.z + toFrame[2]];
    const posOf = shiftOf ? (l) => {
      const d = shiftOf(l);
      return d ? [l.position[0] + d[0], l.position[1] + d[1], l.position[2] + d[2]]
        : l.position;
    } : null;
    const want = new Set();
    for (const { light } of pickLights(this.lights, world, this.budget, LIGHT_REACH, posOf)) {
      want.add(light);
      let node = this.live.get(light);
      if (!node) {
        node = this.create(light);
        if (!node) continue;
        this.live.set(light, node);
      }
      const q = posOf ? posOf(light) : light.position;
      const p = [q[0] - toFrame[0], q[1] - toFrame[1], q[2] - toFrame[2]];
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
    const node = this.createNode(l);
    if (node && "includeOnlyWithLayerMask" in node) {
      node.includeOnlyWithLayerMask = layerMaskFor(l.cullingMask);
    }
    return node;
  }

  createNode(l) {
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
