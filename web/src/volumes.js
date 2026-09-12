// Volumes qui detruisent, volumes qui reparent.
//
// Deux familles posees dans la scene que rien ne lisait, et qui decidaient
// pourtant de deux choses qu'un joueur ressent tout de suite : ou l'on meurt,
// et comment on repare.
//
// LA MORT, LA OU LE JEU LA MET. Le portage decidait de la mort par des seuils a
// lui — une distance a l'etoile, une profondeur. Le build, lui, pose SIX
// volumes de destruction, et la cause de mort est un champ du volume :
//
//   x4  JawsOfDestruction   _deathType 0 (Default), joueur et vaisseau seuls
//   x1  DestructionVolume   _deathType 3 (Energy), tout ce qui entre
//   x1  DestructionVolume   _deathType 3 (Energy), tout ce qui entre
//
// `_onlyAffectsPlayerAndShip` est ce qui separe les deux : les quatre machoires
// laissent passer une sonde, les deux autres n'epargnent rien.
//
// L'ENUMERATION, ENFIN LUE. `death.js` disait honnetement ne pas connaitre les
// valeurs de `DeathType` et porter des causes « que CE portage sait produire ».
// Elles sont dans l'assembly, et elles sont cinq :
//
//   0 Default   1 Impact   2 Asphyxiation   3 Energy   4 Supernova
//
// Les six causes du portage y retombent sans reste : `digestion` et
// `ecrasement` sont des morts par defaut, `incineration` une mort par energie.
//
// LA REPARATION SE TIENT. Elle n'est pas un volume qu'on traverse mais une
// interaction qu'on MAINTIENT :
//
//     fraction += dt / _secondsToRepair,  bornee a 1
//
// A 1 la piece est reparee et l'interaction se ferme. Relacher avant la fin ne
// remet pas la fraction a zero : le build la garde, on peut donc reprendre.
//
// Quinze des dix-huit volumes sont a portee 3, trois a portee 5 — et c'est une
// mesure, pas une lecture : le premier compte ecrit ici (17 et 1) venait d'un
// releve tronque, et l'invariant de tests/05 l'a refuse. `_secondsToRepair`,
// lui, n'est serialise sur aucune instance : les trois secondes viennent du
// constructeur, et c'est le repli qui est garde.

import { insideVolume } from "./gravity.js";
import { restingPoint } from "./frames.js";

/** Les cinq valeurs de `DeathType`, lues dans l'assembly. */
export const DEATH_TYPES = ["Default", "Impact", "Asphyxiation", "Energy", "Supernova"];

/** Cause du portage correspondant a une valeur de `DeathType`. */
export function deathCause(type) {
  switch (type) {
    case 1: return "impact";
    case 2: return "asphyxie";
    case 3: return "incineration";
    case 4: return "supernova";
    default: return "ecrasement";
  }
}

/** Volumes de destruction poses dans la scene. */
export function destructionVolumes(gameplay) {
  return ((gameplay.placed || {}).DestructionVolume || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      body: c.body || null,
      position: c.position,
      rotation: c.rotation,
      volume: c.volume || null,
      deathType: f._deathType ?? 3,
      onlyPlayerAndShip: !!f._onlyAffectsPlayerAndShip,
    };
  });
}

/**
 * Le premier volume qui detruit ce point, ou null.
 *
 * `kind` dit ce qu'on y fait entrer : "player", "ship" ou "probe". Une sonde
 * traverse les volumes reserves au joueur et au vaisseau.
 *
 * LE POINT EST UN POINT MONDE, et c'est ce qui manquait : la boucle passait la
 * position du joueur dans le REPERE ANCRE — une centaine d'unites de l'origine
 * — contre des volumes poses en coordonnees monde. Le volume de destruction du
 * soleil est une sphere de 2 000 unites centree sur l'origine du monde : tout
 * joueur pose sur une planete etait donc « dans le soleil » des la premiere
 * image, et mourait incinere avant d'avoir bouge. Mesure dans un vrai
 * Chromium, profil rempli (docs/46).
 *
 * `shiftOf` ramene chaque volume la ou son corps est maintenant
 * (`frames.js`, `restingPoint`) : sans lui, les quatre machoires de Dark
 * Bramble derivent avec l'orbite de leur planete.
 */
export function destroyedBy(volumes, worldPoint, kind = "player", shiftOf = null) {
  for (const v of volumes) {
    if (!v.volume) continue;
    if (v.onlyPlayerAndShip && kind === "probe") continue;
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(v)) : worldPoint;
    if (insideVolume(v, p)) return v;
  }
  return null;
}

/** Volumes de reparation poses dans le vaisseau. */
export function repairVolumes(gameplay) {
  return ((gameplay.placed || {}).RepairVolume || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      // Le corps porteur separe les deux familles de reparation : quinze
      // avaries du vaisseau, trois noeuds du satellite casse. La portee — 3
      // contre 5 — les separe aussi aujourd'hui, mais c'est une coincidence.
      body: c.body || null,
      position: c.position,
      rotation: c.rotation,
      volume: c.volume || null,
      distance: f._repairDistance ?? 3,
      seconds: f._secondsToRepair ?? 3,
    };
  });
}

/**
 * Une reparation en cours.
 *
 * Etat pur : on la nourrit d'un maintien et d'un pas de temps, elle rend une
 * fraction et previent une fois quand elle atteint 1.
 */
export class Repair {
  constructor(volume) {
    this.volume = volume;
    this.fraction = 0;
    this.holding = false;
    this.done = false;
  }

  /** Portee utile : celle du volume, et c'est un rayon autour de son centre. */
  inRange(worldPoint) {
    const p = this.volume.position;
    if (!p) return false;
    return Math.hypot(worldPoint[0] - p[0], worldPoint[1] - p[1], worldPoint[2] - p[2])
           <= this.volume.distance;
  }

  press() { if (!this.done) this.holding = true; }

  /** Relacher garde l'avancement : le build ne remet pas la fraction a zero. */
  release() { this.holding = false; }

  /** @returns {boolean} vrai la seule fois ou la reparation s'acheve. */
  update(dt) {
    if (this.done || !this.holding) return false;
    this.fraction = Math.min(1, this.fraction + dt / (this.volume.seconds || 3));
    if (this.fraction < 1) return false;
    this.done = true;
    this.holding = false;
    return true;
  }

  /** Le redemarrage de la boucle rend le vaisseau intact, donc a reparer. */
  reset() {
    this.fraction = 0;
    this.holding = false;
    this.done = false;
  }
}

// --- les volumes de jeu : des regles la ou il n'y en avait pas -------------
//
// Dix-huit classes, 34 instances (docs/44-reste-a-migrer.md §4). Le portage
// avait ses propres regles la ou le build en pose : un entonnoir de sable qui
// ne blesse pas, une apesanteur decidee par la gravite plutot que declaree, une
// limite de poussee que rien ne limitait.

/**
 * Les volumes qui blessent : `HazardVolume`.
 *
 * Un seul dans l'alpha, et c'est le bon — `SandFunnel_Body/KillVolume`, la
 * colonne de sable entre les deux jumelles : 20 points par seconde, et zero au
 * premier contact. Les deux nombres sont separes parce que le build les separe,
 * et que l'un des deux vaut zero ici : entrer dans le sable ne tue pas, y
 * rester tue.
 */
export function hazardVolumes(gameplay) {
  return ((gameplay.placed || {}).HazardVolume || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name, body: c.body || null, position: c.position,
      rotation: c.rotation || null, volume: c.volume || null,
      firstContact: f._firstContactDamage ?? 0,
      perSecond: f._damagePerSecond ?? 10,
    };
  });
}

/**
 * Degats subis cette image, et degats d'entree.
 *
 * `inside` porte l'etat d'une image a l'autre : le premier contact n'est du
 * qu'une fois par entree, et c'est ce que l'ensemble retient.
 */
export class Hazards {
  constructor(volumes = []) {
    this.volumes = volumes;
    this.inside = new Set();
  }

  get count() { return this.volumes.length; }

  /**
   * @param shiftOf ramene un volume la ou son corps est MAINTENANT
   *                (`frames.js`, `restingPoint`)
   * @returns {number} points de degats a appliquer cette image.
   */
  update(dt, worldPoint, shiftOf = null) {
    let damage = 0;
    for (const v of this.volumes) {
      const p = shiftOf ? restingPoint(worldPoint, shiftOf(v)) : worldPoint;
      const now = !!v.volume && insideVolume(v, p);
      const was = this.inside.has(v.name);
      if (now && !was) damage += v.firstContact;
      if (now) damage += v.perSecond * dt;
      if (now) this.inside.add(v.name); else this.inside.delete(v.name);
    }
    return damage;
  }
}

/**
 * Les quatre champs d'apesanteur : `ZeroGField`.
 *
 * Le portage n'avait d'apesanteur que par absence de gravite. Le build la
 * DECLARE, avec un facteur d'echelle de force (1 partout) et une priorite
 * d'ecrasement de 1 : dans le volume, plus rien ne tire vers le bas — pas meme
 * le champ radial du corps, qui pourtant ne s'arrete pas la.
 *
 * Un des quatre (`ZeroGZone/ZeroGChamber`) prend sa forme de ses declencheurs
 * d'entree (`_useEntrywayTriggers`) et non d'un collider : il n'a donc pas de
 * volume, et c'est vrai du build, pas un defaut d'extraction.
 */
export function zeroGFields(gameplay) {
  return ((gameplay.placed || {}).ZeroGField || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name, body: c.body || null, position: c.position,
      rotation: c.rotation || null, volume: c.volume || null,
      scale: f._forceScaleFactor ?? 1,
      entryways: !!f._useEntrywayTriggers,
      alignmentPriority: f._alignmentPriority ?? 0,
      overridePriority: f._overridePriority ?? 0,
    };
  });
}

/** Est-on en apesanteur declaree ? Rend le champ, ou null. */
export function zeroGAt(fields, worldPoint, shiftOf = null) {
  let best = null;
  for (const f of fields) {
    if (!f.volume) continue;
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(f)) : worldPoint;
    if (!insideVolume(f, p)) continue;
    if (!best || f.overridePriority > best.overridePriority) best = f;
  }
  return best;
}

/**
 * Les secteurs de jeu : `ZeroGSector` x2 et `MajorSector` x1.
 *
 * Ce ne sont pas les `PlanetoidSector` que le portage lit deja pour son budget
 * de rendu : ce sont des reglages de JEU attaches a un lieu. Dark Bramble
 * limite la poussee a 20 et pose une lumiere ambiante jusqu'a 1 200 unites ; la
 * dimension abandonnee limite en plus la portee des phares du vaisseau a 100.
 * `_flashlightRangeLimit` est nul partout : la lampe du joueur garde sa portee.
 */
export function gameSectors(gameplay) {
  const placed = gameplay.placed || {};
  const map = (list, kind) => (list || []).map((c) => {
    const f = c.fields || {};
    return {
      kind, name: c.name, body: c.body || null, position: c.position,
      rotation: c.rotation || null, volume: c.volume || null,
      sector: f._sectorName ?? null,
      ambient: f._ambientLight ?? 0,
      ambientRange: f._ambientLightRange ?? 0,
      thrustLimit: f._thrustLimit ?? null,
      flashlightLimit: f._flashlightRangeLimit ?? null,
      shiplightLimit: f._shiplightRangeLimit ?? null,
      probePrompt: !!f._triggersShipProbePrompt,
    };
  });
  return [...map(placed.ZeroGSector, "zerog"), ...map(placed.MajorSector, "major")];
}

/** Le secteur de jeu ou l'on se trouve : le plus petit qui contient le point. */
export function gameSectorAt(sectors, worldPoint, shiftOf = null) {
  let best = null;
  for (const s of sectors) {
    if (!s.volume) continue;
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(s)) : worldPoint;
    if (!insideVolume(s, p)) continue;
    const r = s.volume.radius || Infinity;
    if (!best || r < (best.volume.radius || Infinity)) best = s;
  }
  return best;
}

/**
 * Les quatre invites de sonde, et leur regard.
 *
 * `_localGazeDirection` et `_minGazeAngle` (45 partout) disent que l'invite ne
 * s'affiche pas parce qu'on est la, mais parce qu'on REGARDE quelque part :
 * le fond du canyon, le camp vu d'en haut. Une invite qui apparait quand on
 * regarde ailleurs est une invite qu'on n'a pas comprise.
 */
export function probePrompts(gameplay) {
  const placed = gameplay.placed || {};
  const out = ((placed.ProbePromptTrigger || []).map((c) => {
    const f = c.fields || {};
    const d = f._localGazeDirection || { x: 0, y: 0, z: 1 };
    return {
      kind: "probe", name: c.name, body: c.body || null, position: c.position,
      rotation: c.rotation || null, volume: c.volume || null,
      gaze: [d.x, d.y, d.z], minAngle: f._minGazeAngle ?? 45,
    };
  }));
  for (const c of placed.TelescopePromptTrigger || []) {
    out.push({ kind: "telescope", name: c.name, body: c.body || null,
               position: c.position, rotation: c.rotation || null,
               volume: c.volume || null, gaze: null, minAngle: 360 });
  }
  return out;
}

/** Les zones sans lumiere (`DarkZone`) et les brouilleurs (`InterferenceVolume`). */
export function signalVolumes(gameplay) {
  const placed = gameplay.placed || {};
  const map = (list, kind) => (list || []).map((c) => ({
    kind, name: c.name, body: c.body || null, position: c.position,
    rotation: c.rotation || null, volume: c.volume || null,
    strength: (c.fields || {})._interferenceStrength ?? 1,
  }));
  return [...map(placed.DarkZone, "dark"), ...map(placed.InterferenceVolume, "interference")];
}

/**
 * Les neuf emetteurs de rayonnement : huit feux de camp et l'etoile.
 *
 * `magnitude` vaut 100 partout ; ce qui change est la portee et la courbe. Les
 * feux de camp portent une courbe personnalisee (1 a dix unites, 0 a
 * quarante-cinq) dans une sphere de 2,36 ; l'etoile a une decroissance simple
 * dans une sphere de 30 000, et un plancher de 10 % en surface.
 *
 * Le portage chauffe deja sa guimauve par les `HeatSource` ramassees au motif ;
 * ces emetteurs-la sont extraits, et leur loi posee, mais c'est la chaleur du
 * portage qui reste branchee. Dit ici pour que le prochain sache que la
 * duplication est connue.
 */
export function radiationEmitters(gameplay) {
  return ((gameplay.placed || {}).RadiationEmitter || []).map((c) => {
    const f = c.fields || {};
    const curve = (((f.CustomFalloff || {}).customFalloff || {}).m_Curve) || [];
    return {
      name: c.name, body: c.body || null, position: c.position,
      volume: c.volume || null,
      falloffMode: f.falloffMode ?? 0,
      type: f.radiationType ?? 0,
      magnitude: f.magnitude ?? 0,
      surfaceRatio: f.EmitterSurfaceDefaultRatio ?? 0,
      curve: curve.map((k) => [k.time, k.value]),
    };
  });
}

/**
 * Intensite d'un emetteur a une distance donnee.
 *
 * La courbe du build est echantillonnee lineairement entre ses cles : elle n'a
 * que deux points sur les neuf emetteurs, et interpoler leurs tangentes
 * donnerait la meme chose a un cheveu pres pour bien plus de code.
 */
export function radiationAt(emitter, distance) {
  const c = emitter.curve || [];
  if (c.length >= 2) {
    if (distance <= c[0][0]) return emitter.magnitude * c[0][1];
    for (let i = 1; i < c.length; i++) {
      if (distance > c[i][0]) continue;
      const [t0, v0] = c[i - 1], [t1, v1] = c[i];
      const t = t1 > t0 ? (distance - t0) / (t1 - t0) : 0;
      return emitter.magnitude * (v0 + (v1 - v0) * t);
    }
    return 0;
  }
  const r = (emitter.volume && emitter.volume.radius) || 0;
  if (!r) return 0;
  return emitter.magnitude * Math.max(0, 1 - distance / r);
}
