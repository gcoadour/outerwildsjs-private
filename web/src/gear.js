// L'equipement se RAMASSE, et le portage le donnait.
//
// C'est la deuxieme correction que la mesure apporte a « ce qui n'est pas dans
// le build » (docs/45-recensement-mesure.md) : deux `GearPickup` posent la
// progression du debut de partie, et personne ne les lisait.
//
//   Ship_Body/Cabin/ExpeditionGear   combinaison + sonde + minicarte
//   ZeroGZone/CaveEntrance/SpaceSuit combinaison seule
//
// Le premier est dans la cabine du vaisseau, le second a l'entree de la grotte
// d'apesanteur. On appuie dessus (`OnPressInteract`), trois evenements partent
// — `SuitUp`, `AquireProbe`, `AquireMinimap` — et l'objet ferme son volume
// d'interaction : on ne le ramasse qu'une fois.
//
// LA COMBINAISON SE REND AUSSI. `SuitRemovalVolume` (le « SuitReturn » de la
// meme grotte) a son collider ETEINT tant qu'on n'a pas de combinaison, et
// allume par `SuitUp` : on ne peut la rendre que si on l'a. Et `SuitBarrier`
// fait l'inverse — son mur invisible est SOLIDE quand on n'a pas de
// combinaison, efface des qu'on l'enfile. Sans combinaison, on ne sort pas.
//
// L'ENTRAINEMENT EXISTE, lui aussi (docs/44 §7). `ZeroGTrainingManager` tient
// les trois volumes de reparation du satellite casse — ce sont exactement les
// trois volumes a portee 5 que docs/45 comptait sans savoir ce qu'ils etaient,
// les quinze autres etant les avaries du vaisseau — et joue
// « SystemBackOnline » quand les trois sont repares.

import { insideVolume } from "./gravity.js";
import { restingPoint } from "./frames.js";

/** Les deux objets a ramasser, avec ce que chacun debloque. */
export function gearPickups(gameplay) {
  return ((gameplay.placed || {}).GearPickup || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name, body: c.body || null, position: c.position,
      volume: c.volume || null, rotation: c.rotation || null,
      suit: f._enableSuit !== false,
      probe: !!f._enableProbe,
      minimap: !!f._enableMinimap,
    };
  });
}

/** Les volumes qui rendent la combinaison, et les murs qui la reclament. */
export function suitVolumes(gameplay) {
  const placed = gameplay.placed || {};
  const map = (list, kind) => (list || []).map((c) => ({
    kind, name: c.name, body: c.body || null, position: c.position,
    rotation: c.rotation || null, volume: c.volume || null,
    wall: ((c.fields || {})._invisibleWall || {}).name || null,
  }));
  return [...map(placed.SuitRemovalVolume, "removal"),
          ...map(placed.SuitBarrier, "barrier")];
}

/**
 * Ce que le joueur porte.
 *
 * Le portage donnait les trois d'emblee ; ils s'obtiennent maintenant comme le
 * build le veut. `startEquipped` garde la porte ouverte a un mode de
 * demonstration, mais la valeur par defaut est celle du jeu : on commence les
 * mains vides, dans un vaisseau ou la combinaison est a un pas.
 */
export class Equipment {
  constructor({ suit = false, probe = false, minimap = false } = {}) {
    this.suit = suit;
    this.probe = probe;
    this.minimap = minimap;
    this.taken = new Set();
  }

  /**
   * Ramasse un objet. Ne rend que ce qui vient d'etre gagne, pour que l'appelant
   * sache quoi annoncer.
   */
  pickUp(pickup) {
    if (!pickup || this.taken.has(pickup.name)) return [];
    this.taken.add(pickup.name);
    const gained = [];
    if (pickup.suit && !this.suit) { this.suit = true; gained.push("combinaison"); }
    if (pickup.probe && !this.probe) { this.probe = true; gained.push("sonde"); }
    if (pickup.minimap && !this.minimap) { this.minimap = true; gained.push("minicarte"); }
    return gained;
  }

  /**
   * Rend la combinaison. Le point de ramassage redevient disponible : le build
   * ecoute `RemoveSuit` sur le `GearPickup` pour rouvrir son volume.
   */
  removeSuit(pickupName = null) {
    if (!this.suit) return false;
    this.suit = false;
    if (pickupName) this.taken.delete(pickupName);
    return true;
  }

  /** Un mur de combinaison est-il solide ici ? Sans combinaison, il l'est. */
  barrierSolid() { return !this.suit; }
}

/**
 * Ce que les deux volumes de combinaison font quand on les traverse.
 *
 * @returns {"removed"|null} la combinaison vient-elle d'etre rendue
 */
export function suitVolumeStep(volumes, worldPoint, equipment, shiftOf = null) {
  for (const v of volumes) {
    if (v.kind !== "removal" || !v.volume) continue;
    // Le collider est eteint tant qu'on n'a pas de combinaison : sans elle, le
    // volume n'existe pas.
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(v)) : worldPoint;
    if (!equipment.suit || !insideVolume(v, p)) continue;
    return equipment.removeSuit() ? "removed" : null;
  }
  return null;
}

/**
 * Le mur qui reclame la combinaison.
 *
 * `SuitBarrier` n'est pas un volume qui declenche : c'est un COLLIDER qu'on
 * allume et qu'on eteint. `OnRemoveSuit` l'allume, `OnSuitUp` l'eteint — sans
 * combinaison, on ne sort pas du village, et c'est tout ce que fait la classe.
 *
 * Le portage ne peut pas s'en remettre a Havok pour ce mur-la : `InvisibleWall`
 * porte un `BoxCollider` et AUCUN maillage, et l'export glTF ne fabrique de
 * collider que pour ce qui se dessine. Le mur n'existe donc nulle part dans la
 * scene du portage. On le rend ici comme ce qu'il est pour un joueur qui
 * marche — une poussee vers l'exterieur de la boite — plutot que de reconstruire
 * un agregat Havok pour un cube (docs/67-annonces.md).
 *
 * @returns la correction a appliquer a la position, ou null
 */
export function suitBarrierPush(volumes, worldPoint, equipment, shiftOf = null) {
  for (const v of volumes) {
    if (v.kind !== "barrier" || !v.volume || v.volume.shape !== "box") continue;
    // Le collider est ETEINT tant qu'on porte la combinaison. La question se
    // pose a l'equipement, qui sait y repondre : la poser ici en lisant son
    // champ faisait deux sources pour une seule regle, et `barrierSolid` etait
    // ecrite, eprouvee, appelee par personne (docs/93-commandes.md).
    if (!equipment.barrierSolid()) continue;
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(v)) : worldPoint;
    const c = v.position;
    const demi = v.volume.size.map((x) => x / 2);
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    if (Math.abs(d[0]) > demi[0] || Math.abs(d[1]) > demi[1]
        || Math.abs(d[2]) > demi[2]) continue;
    // On sort par la face la plus PROCHE : c'est ce que fait un contact, et
    // c'est ce qui evite de traverser la boite en diagonale.
    let axe = 0, jeu = demi[0] - Math.abs(d[0]);
    for (let i = 1; i < 3; i++) {
      const j = demi[i] - Math.abs(d[i]);
      if (j < jeu) { jeu = j; axe = i; }
    }
    const push = [0, 0, 0];
    push[axe] = (d[axe] >= 0 ? 1 : -1) * (jeu + 1e-3);
    return push;
  }
  return null;
}

/** Les quatre points d'accrochage du joueur (pilotage, ordinateur, lift…). */
export function attachPoints(gameplay) {
  return ((gameplay.placed || {}).PlayerAttachPoint || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name, body: c.body || null, position: c.position,
      volume: c.volume || null, rotation: c.rotation || null,
      lockTurning: f._lockPlayerTurning !== false,
      matchRotation: !!f._matchRotation,
      centerCamera: !!f._centerCamera,
      rotationRate: f._rotationRate ?? 100,
    };
  });
}

/**
 * Les zones d'interaction, avec leur invite et leur fenetre de VUE.
 *
 * `_viewingWindow` est ce que le portage n'avait pas : un angle, en degres,
 * autour de l'avant de la zone. Trois valeurs dans le build — 60 pour la
 * trappe, 90 pour les commandes, 360 pour ce qui se prend de n'importe ou.
 * Une invite « Open Hatch » qui s'affiche dans le dos de la trappe est
 * exactement ce que ce champ evite.
 */
export function interactZones(gameplay) {
  return ((gameplay.placed || {}).InteractZone || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name, body: c.body || null, position: c.position,
      rotation: c.rotation || null, volume: c.volume || null,
      prompt: f._prompt || "",
      resetOnLoseFocus: f._resetOnLoseFocus !== false,
      viewingWindow: f._viewingWindow ?? 360,
    };
  });
}

/**
 * La zone est-elle regardee d'assez pres et d'assez face ?
 *
 * @param toward  direction du regard du joueur, normalisee
 * @param facing  direction de l'avant de la zone, normalisee
 */
export function zoneFaced(zone, toward, facing) {
  if ((zone.viewingWindow ?? 360) >= 360) return true;
  const d = toward[0] * facing[0] + toward[1] * facing[1] + toward[2] * facing[2];
  const angle = Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
  return angle <= zone.viewingWindow / 2;
}

/**
 * L'entrainement en apesanteur : trois noeuds a reparer.
 *
 * Les trois volumes sont ceux du satellite casse, reconnus par leur corps
 * porteur — `BrokenSatellite_Body` — et non par leur portee : la portee 5 les
 * distingue aujourd'hui des quinze du vaisseau, mais c'est une coincidence, le
 * corps n'en est pas une.
 */
export class ZeroGTraining {
  constructor(repairs = []) {
    this.nodes = repairs.filter((r) => (r.volume || r).body === "BrokenSatellite_Body");
    this.announced = false;
  }

  get total() { return this.nodes.length; }
  get repaired() { return this.nodes.filter((r) => r.done).length; }
  get complete() { return this.total > 0 && this.repaired === this.total; }

  /** @returns {boolean} vrai la seule fois ou les systemes reviennent. */
  update() {
    if (this.announced || !this.complete) return false;
    this.announced = true;
    return true;
  }

  reset() { this.announced = false; }
}

/** Les deux verrouillages de camera poses dans la scene. */
export function lockOnTargets(gameplay) {
  return ((gameplay.placed || {}).PlayerLockOnTargeting || []).map((c) => ({
    name: c.name, body: c.body || null, position: c.position,
    volume: c.volume || null,
  }));
}

/**
 * Un verrouillage de camera : `PlayerLockOnTargeting`.
 *
 * CETTE CLASSE ETAIT UNE PARAPHRASE. Elle interpolait un `progress` de 0 a 1 a
 * `_followRate`, ce qui avait l'air raisonnable et n'etait pas ce que le build
 * fait. Personne ne l'appelait, donc rien ne l'a jamais contredite : une loi
 * sans appelant n'est pas seulement inutile, elle n'est pas non plus verifiee
 * (docs/69-assise.md). L'IL, lui, dit ceci, dans `FixedUpdate` :
 *
 *   versLa   = cible.TransformPoint(_localOffset) - joueur.position
 *   aplati   = versLa - Project(versLa, joueur.up)
 *   angle    = Angle(joueur.forward, aplati) * Sign(Dot(aplati, joueur.right))
 *   joueur.rotation = AngleAxis(angle * _followRate * dt, joueur.up) * rotation
 *
 * Ce n'est pas la camera qui tourne : c'est le CORPS du joueur, en lacet
 * seulement, autour de son propre haut. Le tangage reste a la main — on peut
 * lever les yeux pendant que le corps s'aligne. Et la vitesse est
 * proportionnelle a l'ecart, donc l'approche est exponentielle : jamais tout a
 * fait arrivee, et sans a-coup a la fin.
 *
 * LE ZOOM EST UNE HYPERBOLE, PAS UNE INTERPOLATION :
 *
 *   d > 10  ->  champ de vision = max(500 / d, 20)
 *   d <= 10 ->  retour au champ initial, en 2 s
 *
 * A vingt-cinq unites le champ est deja au minimum de 20°, contre 70° normaux
 * (docs/47) : le verrouillage est une longue-vue autant qu'une visee. Et le
 * plancher de 20° est ce qui empeche de zoomer a l'infini sur une cible
 * lointaine.
 */
export const LOCK_ON = { fovNumerator: 500, minFOV: 20, nearDistance: 10,
                         breakSeconds: 2, zoomSpeed: 1 };

/**
 * L'ecart de lacet, en degres signes, entre l'avant du joueur et la cible.
 *
 * Aplati DANS le plan du joueur : sur une planete, viser quelque chose qui est
 * plus haut que soi ne doit pas faire tourner le corps de travers.
 */
export function lockYawError(versLaCible, avant, haut, droite) {
  const d = versLaCible[0] * haut[0] + versLaCible[1] * haut[1] + versLaCible[2] * haut[2];
  const plat = [versLaCible[0] - haut[0] * d, versLaCible[1] - haut[1] * d,
                versLaCible[2] - haut[2] * d];
  const l = Math.hypot(plat[0], plat[1], plat[2]);
  if (!l) return 0;
  const u = [plat[0] / l, plat[1] / l, plat[2] / l];
  const la = Math.hypot(avant[0], avant[1], avant[2]) || 1;
  const cos = (u[0] * avant[0] + u[1] * avant[1] + u[2] * avant[2]) / la;
  const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  const cote = u[0] * droite[0] + u[1] * droite[1] + u[2] * droite[2];
  // `Mathf.Sign(0)` vaut 1 : une cible pile devant ou pile derriere tourne a
  // droite, et le derriere est le seul cas ou cela se voit.
  return angle * (cote < 0 ? -1 : 1);
}

/** `max(500 / d, 20)` au-dela de dix unites, sinon le champ initial. */
export function lockFOV(distance, initFOV = 70, cfg = LOCK_ON) {
  if (!(distance > cfg.nearDistance)) return initFOV;
  return Math.max(cfg.fovNumerator / distance, cfg.minFOV);
}

/** Un verrouillage de camera en cours. */
export class CameraLock {
  constructor(followRate = 1, zoomSpeed = LOCK_ON.zoomSpeed) {
    this.followRate = followRate;
    this.zoomSpeed = zoomSpeed;
    this.useZoom = false;
    this.target = null;
    this.localOffset = [0, 0, 0];
  }

  get locked() { return this.target !== null; }

  lockOn(target, { offset = [0, 0, 0], followRate = this.followRate,
                   useZoom = true, zoomSpeed = this.zoomSpeed } = {}) {
    this.target = target;
    this.localOffset = offset;
    this.followRate = followRate;
    this.useZoom = useZoom;
    this.zoomSpeed = zoomSpeed;
  }

  /** `BreakLock` : la vue revient au champ initial en deux secondes. */
  breakLock() {
    this.target = null;
    return { snapSeconds: LOCK_ON.breakSeconds };
  }

  /**
   * @returns {{yaw:number, fov:number}|null} le lacet a appliquer CETTE image,
   *   en degres, et le champ de vision vise.
   */
  update(dt, versLaCible, avant, haut, droite, distance, initFOV = 70) {
    if (!this.target) return null;
    const ecart = lockYawError(versLaCible, avant, haut, droite);
    return { yaw: ecart * this.followRate * dt,
             fov: this.useZoom ? lockFOV(distance, initFOV) : initFOV };
  }
}
