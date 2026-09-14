// Les seuils : ce qui compte n'est pas d'etre dedans, c'est d'y etre ENTRE.
//
// Tous les volumes du portage repondent a la meme question — ce point est-il
// dans cette forme ? `EntrywayTrigger` n'y repond pas. C'est une boite posee
// dans une PORTE, et elle ne regarde pas ou l'on est mais DANS QUEL SENS on
// l'a traversee :
//
//   IsOutsideEntryway(c) = Dot(_localExitDirection,
//                             InverseTransformDirection(c.position - self.position)) > 0
//
//   OnTriggerEnter : on retient de quel cote on etait en abordant la boite.
//   OnTriggerExit  : on regarde de quel cote on en sort.
//                    dehors -> dedans  =  OnEntry
//                    dedans -> dehors  =  OnExit
//                    meme cote         =  RIEN
//
// Faire demi-tour dans l'embrasure ne compte donc pas, et c'est tout l'interet :
// une grotte n'a pas de forme, elle a des portes. Les quatre entrees de
// `CaveVolume01` — la tour, le quantique, la cite, la capsule — sont quatre
// boites de quelques metres pour un reseau de galeries qu'aucune sphere ne
// decrirait.
//
// `_initialOccupants` ferme la boucle : ce qui commence DEDANS recoit son
// OnEntry au demarrage, sans avoir rien traverse.
//
// @lit EntrywayTrigger
// @lit SunlessZone

import { insideVolume, rotateByQuaternion } from "./gravity.js";
import { restingPoint } from "./frames.js";

/** Les seuils de la scene, avec la chaine de parents qui dit ce qu'ils gardent. */
export function entrywayTriggers(gameplay = {}) {
  return ((gameplay.placed || {}).EntrywayTrigger || []).map((c) => {
    const d = (c.fields || {})._localExitDirection || { x: 0, y: 0, z: 1 };
    return {
      name: c.name, body: c.body || null, position: c.position,
      rotation: c.rotation || null, volume: c.volume || null,
      parents: c.parents || [],
      exit: [d.x, d.y, d.z],
      // Ce qui commence dedans : le build leur envoie OnEntry a `Start`.
      initial: ((c.fields || {})._initialOccupants || []).length,
    };
  });
}

/**
 * De quel cote du seuil est ce point ?
 *
 * `_localExitDirection` est LOCAL : il faut ramener l'ecart dans le repere du
 * declencheur avant le produit scalaire. Les huit seuils des grottes pointent
 * vers +Y — le ciel, vu de la porte.
 */
export function isOutsideEntryway(trigger, worldPoint) {
  const d = [worldPoint[0] - trigger.position[0],
             worldPoint[1] - trigger.position[1],
             worldPoint[2] - trigger.position[2]];
  const local = trigger.rotation
    ? rotateByQuaternion([-trigger.rotation[0], -trigger.rotation[1],
                          -trigger.rotation[2], trigger.rotation[3]], d)
    : d;
  return local[0] * trigger.exit[0] + local[1] * trigger.exit[1] +
         local[2] * trigger.exit[2] > 0;
}

/**
 * Un seuil qui suit un corps : rend "entry", "exit" ou null a chaque image.
 *
 * L'etat tenu est celui du build — `_transitColliders`, un dictionnaire de ce
 * qui est DANS la boite et du cote d'ou il y est entre. Sans lui, on ne sait
 * pas distinguer « il est ressorti par l'autre cote » de « il a fait demi-tour ».
 */
export class Entryway {
  constructor(trigger) {
    this.trigger = trigger;
    this.inBox = false;
    this.cameFromOutside = false;
  }

  update(worldPoint) {
    const dans = insideVolume(this.trigger, worldPoint);
    if (dans && !this.inBox) {
      this.inBox = true;
      this.cameFromOutside = isOutsideEntryway(this.trigger, worldPoint);
      return null;
    }
    if (!dans && this.inBox) {
      this.inBox = false;
      const dehors = isOutsideEntryway(this.trigger, worldPoint);
      if (this.cameFromOutside && !dehors) return "entry";
      if (!this.cameFromOutside && dehors) return "exit";
      return null;    // demi-tour dans l'embrasure
    }
    return null;
  }
}

/**
 * Les zones sans soleil, avec leurs portes.
 *
 * Le portage prenait `DarkZone` pour elles. Ce sont deux classes distinctes,
 * pour deux auditeurs distincts : `AmbientLightManager` ecoute
 * `EnterSunlessZone`, `Flashlight` ecoute `EnterDarkZone`. Il y a UNE `DarkZone`
 * dans la scene, sur un declencheur d'invite de lampe, et CINQ `SunlessZone` —
 * les deux grottes de la premiere jumelle, la grotte et le musee de Timber
 * Hearth, et la membrane corrosive de Giant's Deep. L'ambiance ne s'eteignait
 * donc dans aucune grotte (docs/83-seuils.md).
 *
 * `OWEffectVolume.Awake` prend ses `EntrywayTrigger` par
 * `GetComponentsInChildren` : le lien est dans la hierarchie. La membrane, elle,
 * a son propre collider — une sphere de 205 — et vaut par contenance.
 */
export function sunlessZones(gameplay = {}) {
  return zonesAvecSeuils(gameplay, "SunlessZone");
}

/**
 * Les zones sombres : UNE dans la scene, et c'est un seuil elle aussi.
 *
 * `DarkZone.Awake` prend son `_entryway` et s'abonne a ses deux evenements :
 * elle ne teste jamais la contenance. Son unique instance est posee SUR un
 * `FlashlightPromptTrigger`, c'est-a-dire sur le meme GameObject que le seuil —
 * d'ou la recherche par nom autant que par parente.
 *
 * Le portage la testait par contenance dans une boite de 11,47 : on n'y etait
 * « dedans » que le temps de franchir l'embrasure, et l'invite de lampe
 * clignotait au passage au lieu de rester tant qu'on est dans la grotte.
 *
 * @lit DarkZone
 */
export function darkZones(gameplay = {}) {
  return zonesAvecSeuils(gameplay, "DarkZone");
}

/**
 * Une zone d'effet et ses seuils.
 *
 * `OWEffectVolume.Awake` prend ses `EntrywayTrigger` par
 * `GetComponentsInChildren` — qui inclut le composant pose sur l'objet
 * LUI-MEME. Le lien est donc « meme objet, ou descendant », et il vit dans la
 * hierarchie : aucun champ ne le porte (docs/83-seuils.md).
 */
function zonesAvecSeuils(gameplay, cls) {
  const seuils = entrywayTriggers(gameplay);
  return ((gameplay.placed || {})[cls] || []).map((c) => ({
    name: c.name, body: c.body || null, position: c.position,
    rotation: c.rotation || null, volume: c.volume || null,
    entryways: seuils.filter((t) => t.name === c.name || t.parents.includes(c.name)),
  }));
}

/**
 * Un groupe de zones d'effet, et le COMPTE de celles ou l'on est.
 *
 * `AmbientLightManager._sunlessZoneCount` : un compte, pas un booleen.
 *
 * Rien n'interdit a deux zones de se recouvrir, ni a une meme zone d'etre
 * abordee par deux portes. Un booleen clignoterait au chevauchement ; le compte
 * ne descend a zero qu'une fois toutes les portes ressorties.
 */
export class EffectZones {
  constructor(zones = [], events = ["EnterSunlessZone", "ExitSunlessZone"]) {
    this.zones = zones;
    this.noms = events;
    this.portes = [];
    this.contenants = [];
    for (const z of zones) {
      for (const t of z.entryways) this.portes.push(new Entryway(t));
      if (z.volume) this.contenants.push({ zone: z, dedans: false });
    }
    this.count = 0;
    this.events = [];
  }

  get sunless() { return this.count > 0; }

  /**
   * @param worldPoint position MONDE du joueur
   * @param shiftOf    decalage du corps porteur, comme pour les autres volumes
   */
  update(worldPoint, shiftOf = null) {
    for (const p of this.portes) {
      const w = shiftOf ? restingPoint(worldPoint, shiftOf(p.trigger)) : worldPoint;
      const e = p.update(w);
      if (e === "entry") { this.count += 1; this.events.push(this.noms[0]); }
      else if (e === "exit") { this.count -= 1; this.events.push(this.noms[1]); }
    }
    for (const c of this.contenants) {
      const w = shiftOf ? restingPoint(worldPoint, shiftOf(c.zone)) : worldPoint;
      const dans = insideVolume(c.zone, w);
      if (dans === c.dedans) continue;
      c.dedans = dans;
      if (dans) { this.count += 1; this.events.push(this.noms[0]); }
      else { this.count -= 1; this.events.push(this.noms[1]); }
    }
    // Le build ne borne pas son compte ; on le borne, parce qu'une porte ratee
    // a l'image ou l'on se teleporte laisserait le monde noir pour toujours.
    if (this.count < 0) this.count = 0;
    return this.count;
  }
}
