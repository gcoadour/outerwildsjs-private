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
 */
export function destroyedBy(volumes, worldPoint, kind = "player") {
  for (const v of volumes) {
    if (!v.volume) continue;
    if (v.onlyPlayerAndShip && kind === "probe") continue;
    if (insideVolume(v, worldPoint)) return v;
  }
  return null;
}

/** Volumes de reparation poses dans le vaisseau. */
export function repairVolumes(gameplay) {
  return ((gameplay.placed || {}).RepairVolume || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
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
