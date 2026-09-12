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
 * Le build interpole l'orientation vers la cible a `_followRate` et zoome a
 * `_zoomSpeed` (1 au constructeur). Ni l'un ni l'autre n'est serialise : les
 * deux instances posees ne portent aucun champ, tout est passe a l'appel.
 * On garde donc la MECANIQUE et son reglage par defaut.
 */
export class CameraLock {
  constructor(followRate = 1, zoomSpeed = 1) {
    this.followRate = followRate;
    this.zoomSpeed = zoomSpeed;
    this.target = null;
    this.progress = 0;
  }

  lockOn(target, followRate = this.followRate) {
    this.target = target;
    this.followRate = followRate;
    this.progress = 0;
  }

  breakLock() { this.target = null; this.progress = 0; }

  /** @returns {number} 0 au verrouillage, 1 quand la camera y est. */
  update(dt) {
    if (!this.target) return 0;
    this.progress = Math.min(1, this.progress + dt * this.followRate);
    return this.progress;
  }
}
