// Degats du vaisseau, piece par piece.
//
// UNE LECTURE A L'ENVERS, CORRIGEE. Le portage lisait `_damageLocationMask`
// comme un FILTRE — « quelles positions peuvent etre touchees » — et concluait
// de sa valeur nulle que « le vaisseau n'a PAS de degats localises dans cette
// alpha ». L'IL d'`OnImpact` dit l'inverse :
//
//     mask |= composant._alertLocation;    // il s'ACCUMULE
//     si mask a change -> DamageAlert(mask)
//
// C'est une SORTIE, pas une entree : le zero est l'etat d'un vaisseau intact,
// pas un interrupteur eteint. La mecanique tournait ; le portage l'avait
// desactivee en lisant un resultat pour une permission.
//
// LES DEUX MODIFICATEURS SERVENT, et ce commentaire disait le contraire :
// « restent nuls, et ceux-la pour de bon, qu'aucune methode de la classe
// n'emploie ». `Awake` les emploie, et c'est la que tout se joue —
//
//     foreach (ShipComponent c in _components)
//         c.SetImpactThreshold(_mediumImpactThreshold + _genericPartImpactModifier);
//     foreach (ShipComponent c in _components)
//         if (c.GetType() == typeof(EngineComponent)) {
//             c.SetImpactThreshold(_mediumImpactThreshold + _enginePartImpactModifier);
//             ((EngineComponent)c).ToggleEngineDamage(_disableDamagedThrusters);
//         }
//
// — parce que `SetImpactThreshold` ECRASE le champ serialise. Les dix
// `EngineComponent` portent `_impactThreshold = 0` dans la scene, et cette
// valeur ne survit pas au reveil : tous les composants du vaisseau repartent a
// `_mediumImpactThreshold + modificateur`, soit TRENTE.
//
// Deux consequences, et ce sont des consequences de jeu (docs/113-seuil.md) :
//
//   - un choc sous trente unites par seconde n'abime AUCUNE piece. Le portage
//     lisait le zero serialise et abimait le reacteur le plus proche au moindre
//     contact ;
//   - le seuil entre deux fois dans la force, et trente au lieu de zero la
//     reduit d'autant. A cinquante unites par seconde, la piece prend 7,4 au
//     lieu de 16,7.
//
// Les deux modificateurs sont nuls, donc les generiques et les reacteurs ont le
// MEME seuil dans ce build. La distinction existe et ne se voit pas ; elle est
// portee quand meme, comme le drapeau des propulseurs.
//
// LES CINQ POSITIONS DU BUILD. `DamageAlertLocation`, lue dans la table
// Constant : Front 1, Top 2, Back 4, Left 8, Right 16. Ce sont des DRAPEAUX, et
// il n'y en a que cinq — les six positions du portage (avec un « bas » a 32)
// etaient inventees.
//
// LA PIECE TOUCHEE EST LA PLUS PROCHE. Pas celle que designe une normale : le
// build parcourt ses composants et garde celui dont le GameObject est le plus
// pres du POINT d'impact — parmi QUINZE : dix reacteurs et cinq pieces de coque
// (deux a l'arriere, deux en haut, une devant). Le portage ne lisait que les
// reacteurs et ramenait les degats a cinq positions ; ils vivent maintenant sur
// les pieces, et les positions n'en sont que la vue du casque.
//
// TROIS ENTREES AU PLUS. `_damagedParts` est une liste ou une piece rentre a
// chaque coup, sans `Contains` : au-dela de trois entrees, un impact ne fait
// plus de nouvelle victime et sa force se partage entre elles.
//
// LA FORCE, ET LA MORT :
//
//     force  = |v| x 100 / (_instantDeathSpeed - seuil)      (x (|v| - seuil))
//     piece  : _integrity -= |force| ; _totalDamage -= |force|
//     explose si |v| > _instantDeathSpeed
//     explose si |somme des _totalDamage| > _shipTotalHealth
//
// Valeurs mesurees sur l'instance : seuils 15 et 30, sante 100, mort
// instantanee a 300, et `_disableDamagedThrusters` FAUX — dans cette alpha, une
// piece morte ne coupe donc aucun propulseur. Le mecanisme est porte quand
// meme, et il s'allume si le drapeau change.
//
// Les dix `EngineComponent` portent chacun une `ThrusterLocation` (Left,
// FrontLeft, TopLeft, BottomLeft, BackLeft, et les cinq de droite) et une
// `_alertLocation` qui vaut Left pour les cinq de gauche et Right pour les cinq
// de droite. Leur `_impactThreshold` serialise vaut zero, et `Awake` le remonte
// a trente : c'est le seuil du reveil qui vaut, pas celui de la scene.

// @lit ShipDamageController, ShipComponent, EngineComponent
// Le modele de degats du build, relu a l'endroit (docs/49-queue.md).

import { DAMAGE } from "./autopilot.js";

/**
 * `DamageAlertLocation`, lue dans la table Constant de l'assembly : cinq
 * drapeaux, et pas de « bas ».
 */
export const LOCATIONS = { avant: 1, haut: 2, arriere: 4, gauche: 8, droite: 16 };
export const ALL_LOCATIONS = 31;

/**
 * L'ordre des voyants du casque, qui n'est pas celui des drapeaux.
 *
 * `HUDDamageDisplay.OnDamageShip` lit le masque dans un ordre ecrit a la main,
 * et c'est lui qui range les icones : `mask & 4` va au voyant 0, `mask & 1` au
 * 1, `mask & 16` au 2, `mask & 8` au 3, `mask & 2` au 4. Soit, en clair :
 *
 *     arriere, avant, droite, gauche, haut
 *
 * Le portage rangeait ses voyants dans l'ordre de `LOCATIONS` — avant, haut,
 * arriere, gauche, droite — c'est-a-dire que trois voyants sur cinq
 * designaient la mauvaise piece.
 */
export const ALERT_ORDER = ["arriere", "avant", "droite", "gauche", "haut"];

/** `ThrusterLocation` : dix buses, cinq par cote. */
export const THRUSTERS = ["Left", "FrontLeft", "TopLeft", "BottomLeft", "BackLeft",
                          "Right", "FrontRight", "TopRight", "BottomRight", "BackRight"];

/** Nom de la piece qui occupe chaque position. */
const PART_AT = {
  avant: "cockpit", arriere: "reacteur", gauche: "aile gauche",
  droite: "aile droite", haut: "coque superieure",
};

/**
 * La position d'un impact, depuis sa normale dans le repere du vaisseau.
 *
 * Le build, lui, ne se sert PAS d'une normale : il prend la piece la plus
 * proche du point d'impact. Cette fonction reste le repli du portage pour un
 * vaisseau dont on n'a pas les positions de pieces — et, faute de « bas » dans
 * l'enumeration, un choc par en dessous compte desormais pour « arriere »,
 * qui est ou sont les reacteurs.
 */
export function locationOf(normal) {
  const [x, y, z] = normal;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (az >= ax && az >= ay) return z > 0 ? "avant" : "arriere";
  if (ax >= ay) return x > 0 ? "droite" : "gauche";
  return y > 0 ? "haut" : "arriere";
}

/**
 * Les dix reacteurs poses dans la scene, avec leur position et leur cote.
 *
 * C'est le chainon que le commentaire de `repair()` annoncait manquant : « la
 * correspondance volume -> piece passe par EngineComponent, qui n'est pas lu ».
 */
export function engineComponents(gameplay) {
  return ((gameplay.placed || {}).EngineComponent || []).map((c) => {
    const f = c.fields || {};
    const alerte = Object.entries(LOCATIONS)
      .find(([, bit]) => bit === (f._alertLocation ?? 0));
    return {
      id: c.id ?? null,
      name: c.name,
      moteur: true,
      position: c.position || null,
      thruster: THRUSTERS[f._thrusterLocation ?? 0] || null,
      thrusterIndex: f._thrusterLocation ?? 0,
      alertBit: f._alertLocation ?? 0,
      location: alerte ? alerte[0] : null,
      // Ce que la SCENE porte : zero sur les dix. `Awake` l'ecrase au reveil,
      // et c'est `awakeThreshold` ci-dessous qui donne la valeur qui vaut.
      impactThreshold: f._impactThreshold ?? 0,
      integrity: f._integrity ?? 100,
    };
  });
}

/**
 * Le seuil qu'un composant porte APRES `Awake`, et non celui de la scene.
 *
 *     c.SetImpactThreshold(_mediumImpactThreshold + modificateur);
 *
 * `SetImpactThreshold` ecrit le champ : la valeur serialisee ne survit pas au
 * reveil. Le modificateur est celui des reacteurs pour un `EngineComponent`,
 * celui des pieces generiques sinon — tous deux nuls dans ce build, donc trente
 * partout (docs/113-seuil.md).
 */
export function awakeThreshold(fields = {}, engine = false) {
  const base = fields._mediumImpactThreshold ?? DAMAGE.medium;
  const mod = engine ? (fields._enginePartImpactModifier ?? 0)
                     : (fields._genericPartImpactModifier ?? 0);
  return base + mod;
}

/**
 * Les QUINZE pieces du vaisseau : les dix reacteurs et les cinq pieces de
 * coque, avec leur position ramenee dans le repere du vaisseau au repos.
 *
 * `_components = GetComponentsInChildren<ShipComponent>()` les prend toutes,
 * et `EngineComponent` n'en est qu'une sous-classe. Le portage ne lisait que
 * les reacteurs : un choc sur le nez, ou le dessus de la coque, allait donc au
 * reacteur le plus proche, jamais au cockpit (docs/132).
 *
 * @param rest    position de repos de `Ship_Body`, dans le monde de la scene
 * @param restRot sa rotation de repos (x, y, z, w)
 */
export function shipComponents(gameplay, rest = null, restRot = null) {
  const placed = gameplay.placed || {};
  const generiques = (placed.ShipComponent || []).map((c) => {
    const f = c.fields || {};
    const alerte = Object.entries(LOCATIONS).find(([, bit]) => bit === (f._alertLocation ?? 0));
    return { id: c.id ?? null, name: c.name, moteur: false, position: c.position || null,
             thruster: null, thrusterIndex: null, alertBit: f._alertLocation ?? 0,
             location: alerte ? alerte[0] : null, impactThreshold: f._impactThreshold ?? 0,
             integrity: f._integrity ?? 100 };
  });
  const toutes = [...engineComponents(gameplay), ...generiques];
  if (!rest) return toutes;
  const [qx, qy, qz, qw] = restRot || [0, 0, 0, 1];
  // Rotation par l'INVERSE de la pose de repos : le point d'impact arrive dans
  // le repere du vaisseau (droite, haut, avant), et c'est la qu'on compare.
  const inv = (v) => {
    const x = -qx, y = -qy, z = -qz, w = qw;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz),
            v[2] + w * tz + (x * ty - y * tx)];
  };
  return toutes.map((c) => ({
    ...c,
    position: c.position
      ? inv([c.position[0] - rest[0], c.position[1] - rest[1], c.position[2] - rest[2]])
      : null,
  }));
}

/**
 * Les buses que `ShipThrusterModel.FireTranslationalThrusters` consulte, par
 * axe et par sens. Deux par direction, chacune pour moitie ; l'axe lateral
 * n'en consulte AUCUNE — `Left` et `Right` ont beau etre des reacteurs, rien ne
 * les eteint dans la poussee.
 */
const BUSES = {
  "z+": ["BackLeft", "BackRight"], "z-": ["FrontLeft", "FrontRight"],
  "y+": ["BottomLeft", "BottomRight"], "y-": ["TopLeft", "TopRight"],
};

export class ShipDamage {
  /**
   * @param fields     champs de ShipDamageController, tels qu'extraits
   * @param composants les pieces (`shipComponents()`, ou les seuls reacteurs
   *                   d'`engineComponents()`) ; sans elles, une piece par
   *                   position, choisie par la normale
   */
  constructor(fields = {}, composants = []) {
    // `_damageLocationMask` s'ACCUMULE : sa valeur serialisee est l'etat de
    // depart, c'est-a-dire zero, et non une permission.
    this.mask = fields._damageLocationMask ?? 0;
    this.generic = fields._genericPartImpactModifier ?? 0;
    this.engine = fields._enginePartImpactModifier ?? 0;
    this.disableDamagedThrusters = !!fields._disableDamagedThrusters;
    // Les deux modificateurs sont nuls ici, donc reacteurs et pieces
    // generiques partagent le meme seuil. On garde les deux : la distinction
    // existe dans le build, et elle s'allumerait si un modificateur changeait.
    this.seuilPiece = awakeThreshold(fields, true);
    this.seuilGenerique = awakeThreshold(fields, false);
    // `_lightImpactThreshold` et `_mediumImpactThreshold` choisissent le CLIP
    // d'impact, et rien d'autre. Les prendre pour des seuils de degats etait
    // l'erreur qui a fait naitre la courbe de coque inventee.
    this.lightSound = fields._lightImpactThreshold ?? DAMAGE.light;
    this.mediumSound = fields._mediumImpactThreshold ?? DAMAGE.medium;
    this.shipTotalHealth = fields._shipTotalHealth ?? DAMAGE.total;
    this.instantDeathSpeed = fields._instantDeathSpeed ?? DAMAGE.instantDeath ?? 300;
    // L'integrite d'une PIECE, serialisee a 100 sur chacune. Elle n'a rien a
    // voir avec `_shipTotalHealth`, qui borne le CUMUL.
    this.total = DAMAGE.total;

    const base = composants.length ? composants
      : Object.keys(LOCATIONS).map((k) => ({ name: PART_AT[k], moteur: false, position: null,
                                            location: k, alertBit: LOCATIONS[k] }));
    this.composants = base.map((c) => ({
      id: c.id ?? null, name: c.name, moteur: !!c.moteur, position: c.position || null,
      thruster: c.thruster || null, location: c.location || null,
      alertBit: c.alertBit ?? LOCATIONS[c.location] ?? 0,
      // `Awake` ecrase le seuil serialise (80 sur les pieces de coque, 0 sur
      // les reacteurs) : c'est celui du reveil qui vaut.
      seuil: c.moteur ? this.seuilPiece : this.seuilGenerique,
      integrity: this.total, totalDamage: 0, dead: false,
    }));
    // `_damagedParts` : une LISTE, et une piece y entre a CHAQUE coup qui
    // l'abime, sans `Contains`. Voir `impact`.
    this.endommagees = [];
    // `ShipThrusterModel.DisableThruster` : une buse coupee le reste, la
    // reparation ne la rallume pas (`EnableThruster` n'est appele nulle part).
    this.busesCoupees = new Set();
    this.destroyed = false;
    this.lastImpact = 0;
    this.lastLocation = null;
    this.lastPiece = null;
  }

  /**
   * Les pieces, regroupees par position d'alerte : ce que le casque montre.
   * Une vue, recalculee : la verite est dans `composants`.
   */
  get parts() {
    const out = {};
    for (const k of Object.keys(LOCATIONS)) {
      const ici = this.composants.filter((c) => c.location === k);
      out[k] = { name: PART_AT[k], pieces: ici.length,
                 integrity: ici.length ? Math.min(...ici.map((c) => c.integrity)) : this.total,
                 totalDamage: ici.reduce((s, c) => s + c.totalDamage, 0),
                 dead: ici.some((c) => c.dead) };
    }
    return out;
  }

  /**
   * Quel BRUIT d'impact, et c'est tout ce que ces deux seuils commandent.
   *
   *     if (|v| >= _mediumImpactThreshold) ... _mediumImpactClip ...
   *     else if (|v| >= _lightImpactThreshold) ... _lightImpactClip ...
   *
   * Rendu comme un niveau de 0 a 2, pour que l'appelant choisisse son clip.
   */
  soundLevel(speed) {
    if (speed >= (this.mediumSound ?? DAMAGE.medium)) return 2;
    if (speed >= (this.lightSound ?? DAMAGE.light)) return 1;
    return 0;
  }

  /**
   * `RecalculateShipDamge` : la somme des `_totalDamage` sur `_damagedParts`.
   *
   * SUR LA LISTE, DOUBLONS COMPRIS. Une piece touchee deux fois y figure deux
   * fois, et son dommage compte donc double : deux chocs a 100 u/s sur le meme
   * reacteur (25,9 chacun) font un cumul de 2 x 51,9 = 103,7, et le vaisseau
   * explose au DEUXIEME choc et non au quatrieme. C'est le build ; le portage
   * le garde tel quel.
   */
  get cumul() {
    return this.endommagees.reduce((s, c) => s + c.totalDamage, 0);
  }

  /** `GetHullIntegrityFraction`, en points : ce qu'il reste avant le cumul fatal. */
  get integrity() {
    return Math.max(0, this.shipTotalHealth - this.cumul);
  }

  /** `ApplyDamageForce` : ce qu'une piece perd, et la buse qu'elle coupe. */
  _blesse(c, force) {
    c.integrity -= force;
    c.totalDamage += force;
    if (c.integrity <= 0) {
      c.integrity = 0;
      c.dead = true;
      if (c.moteur && c.thruster && this.disableDamagedThrusters) this.busesCoupees.add(c.thruster);
    }
  }

  /** Le vaisseau a-t-il pris quelque chose ? */
  get damaged() { return this.endommagees.length > 0; }

  /** La piece est-elle dans `_damagedParts` — donc son volume allume ? */
  estEndommagee(c) { return this.endommagees.includes(c); }

  /** La position est-elle dans le masque d'alerte COURANT ? */
  covers(location) {
    return (this.mask & (LOCATIONS[location] || 0)) !== 0;
  }

  /** Positions abimees, au sens du build : celles que le masque porte. */
  get alerted() {
    return Object.keys(LOCATIONS).filter((k) => this.covers(k));
  }

  /**
   * La piece la plus proche d'un point d'impact, dans le repere du vaisseau.
   * La boucle du build part de la premiere et ne change que sur un `<` strict :
   * a egalite, la premiere dans l'ordre de la hierarchie l'emporte.
   */
  plusProche(point) {
    if (!point) return null;
    let best = null, bestD = Infinity;
    for (const c of this.composants) {
      if (!c.position) continue;
      const d = Math.hypot(c.position[0] - point[0], c.position[1] - point[1],
                           c.position[2] - point[2]);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /**
   * Un impact, `OnImpact`.
   *
   * @param speed  vitesse NORMALE a la surface, en u/s
   * @param normal normale de l'impact dans le repere du vaisseau, ou null
   * @param point  point d'impact dans le repere du vaisseau, ou null — quand on
   *               l'a, c'est LUI qui designe la piece, comme dans le build
   * @returns {damage, location, piece, part, destroyed, justExploded}
   */
  impact(speed, normal = null, point = null) {
    // `OnImpact` n'a pas de garde d'entree : il joue un bruit selon la vitesse
    // puis cherche la piece.
    if (!(speed > 0)) {
      return { damage: 0, location: null, piece: null, part: 0, destroyed: this.destroyed };
    }
    this.lastImpact = Math.round(speed);
    const wasDestroyed = this.destroyed;
    let part = 0, cible = null;

    if (this.endommagees.length < 3) {
      // TANT QUE LA LISTE COMPTE MOINS DE TROIS ENTREES, le choc cherche la
      // piece la plus proche du point — parmi les quinze, deja touchee ou non.
      // Le portage retombe sur la normale quand il n'a pas de positions.
      cible = this.plusProche(point);
      if (!cible && normal) {
        const loc = locationOf(normal);
        cible = this.composants.find((c) => c.location === loc) || null;
      }
      if (cible && cible.seuil < speed) {
        // Le masque d'alerte s'accumule, et c'est lui que le HUD affiche.
        this.mask |= cible.alertBit;
        // force = 100 x (|v| - seuil) / (mortInstantanee - seuil)
        const denom = (this.instantDeathSpeed - cible.seuil) || 1;
        part = 100 * (speed - cible.seuil) / denom;
        this._blesse(cible, part);
        // SANS `Contains` : une piece retouchee entre une deuxieme fois. Trois
        // chocs sur le meme reacteur remplissent donc la liste a eux seuls.
        this.endommagees.push(cible);
      }
      // `if (_instantDeathSpeed <= |velocity|) ExplodeShip();` vit DANS cette
      // branche, et pas dans l'autre. C'est une bizarrerie du build, gardee
      // telle quelle : passe trois entrees, seule le cumul peut encore tuer.
      if (speed >= this.instantDeathSpeed) this.destroyed = true;
    } else {
      // AU-DELA, LA FORCE SE PARTAGE : `velocity / n` a chaque ENTREE dont le
      // seuil est passe, `n` etant leur nombre — doublons compris, si bien
      // qu'une piece presente deux fois prend deux parts (docs/113-seuil.md).
      const concernees = this.endommagees.filter((c) => speed > c.seuil);
      const n = concernees.length;
      if (n > 0) {
        part = speed / n;
        for (const c of concernees) this._blesse(c, part);
      }
    }
    const loc = cible ? cible.location : (normal ? locationOf(normal) : null);
    this.lastLocation = loc;
    this.lastPiece = cible;

    // `Abs(_currentShipDamage) > _shipTotalHealth`, et rien d'autre.
    if (this.cumul > this.shipTotalHealth) this.destroyed = true;
    const justExploded = !wasDestroyed && this.destroyed;
    return { damage: this.soundLevel(speed), location: loc, piece: cible, part,
             destroyed: this.destroyed, justExploded };
  }

  /**
   * Fraction de poussee disponible sur un axe du repere du vaisseau, dans un
   * sens : `FireTranslationalThrusters` n'ajoute que la moitie de la poussee
   * par buse encore allumee. Un vaisseau detruit ne pousse plus du tout.
   *
   * @param axe "x", "y" ou "z" ; signe > 0 ou < 0
   */
  poussee(axe, signe) {
    if (this.destroyed) return 0;
    const buses = BUSES[`${axe}${signe > 0 ? "+" : "-"}`];
    if (!buses || !this.busesCoupees.size) return 1;
    return buses.filter((b) => !this.busesCoupees.has(b)).length / 2;
  }

  /** `OnCompleteRepair` pour une piece. */
  _repare(c) {
    this.endommagees = this.endommagees.filter((x) => x !== c);
    // Le bit ne tombe que si plus AUCUNE piece abimee ne le porte.
    if (!this.endommagees.some((x) => x.alertBit === c.alertBit)) this.mask &= ~c.alertBit;
    c.totalDamage = 0;
    c.integrity = this.total;
    c.dead = false;
  }

  /**
   * Rend une piece a son integrite : celle d'un `RepairVolume`, qui ne repare
   * que la piece dont il est l'enfant.
   *
   * @param cible la piece, son identifiant de GameObject, une POSITION (toutes
   *   les pieces abimees qui la portent — le repli sans volumes) ou rien (la
   *   plus abimee)
   * @returns {string|null} la position reparee, ou null s'il n'y avait rien
   */
  repair(cible = null) {
    let pieces;
    if (cible && typeof cible === "object") pieces = [cible];
    else if (typeof cible === "string" && LOCATIONS[cible]) {
      pieces = this.composants.filter((c) => c.location === cible && this.estEndommagee(c));
    } else if (cible != null) {
      pieces = this.composants.filter((c) => c.id === cible);
    } else {
      pieces = [...new Set(this.endommagees)]
        .sort((a, b) => a.integrity - b.integrity).slice(0, 1);
    }
    pieces = pieces.filter((c) => this.estEndommagee(c));
    if (!pieces.length) return null;
    for (const c of pieces) this._repare(c);
    if (this.integrity > 0) this.destroyed = false;
    return pieces[0].location;
  }

  /** Pieces mortes, par position. */
  get deadParts() {
    return Object.keys(LOCATIONS).filter((k) => this.composants.some((c) => c.location === k && c.dead));
  }

  reset() {
    this.destroyed = false;
    this.lastImpact = 0;
    this.lastLocation = null;
    this.lastPiece = null;
    // Le masque est un cumul : le remettre a zero fait partie de la remise a
    // neuf, sans quoi l'alerte de degats survivrait a la boucle.
    this.mask = 0;
    this.endommagees = [];
    this.busesCoupees.clear();
    for (const c of this.composants) { c.integrity = this.total; c.dead = false; c.totalDamage = 0; }
  }

  get summary() {
    const dead = this.deadParts;
    return `coque ${this.integrity.toFixed(0)}%` +
      (this.destroyed ? " — detruit" : "") +
      (dead.length ? ` — ${dead.length} piece(s) hors service` : "");
  }
}
