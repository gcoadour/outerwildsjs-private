// Les referentiels que le build DECLARE, la ou le portage les deduisait.
//
// C'est la famille la plus lourde de ce qui restait a migrer — douze classes,
// 106 instances (docs/44-reste-a-migrer.md §1) — et la moins comprise, parce
// qu'elle ne se voit pas : elle decide de ce par rapport a quoi tout le reste
// est exprime.
//
// LE PORTAGE CHOISIT SON ANCRE PAR LA GRAVITE DOMINANTE ; LE BUILD LA DECLARE.
// Quatorze volumes la posent, et ils ne disent pas la meme chose que la gravite :
//
//   MajorReferenceFrameVolume x9   une sphere par corps principal, de rayon 167
//                                  a 1 500, toutes primaires
//   ReferenceFrameVolume      x5   Sun_Body r=2000, Ship_Body r=30 (primaires),
//                                  et trois BrokenNode r=3 (non primaires)
//
// Les deux derniers sont exactement le cas que la gravite ne sait pas traiter :
// un vaisseau pose dans un hangar, un morceau de satellite lache dans une
// grotte. Le volume du vaisseau fait trente unites et vit DANS celui de Timber
// Hearth, qui en fait six cents : c'est donc le plus PETIT volume contenant le
// point qui gagne, et non le premier trouve.
//
// LES DISTANCES DU PILOTE AUTOMATIQUE etaient codees en dur (`surface x 1,5`).
// Elles sont dans `MajorReferenceFrameVolume`, deux par corps :
//
//   _autopilotArrivalDistance   1 000 partout, sauf Giant's Deep et Dark
//                               Bramble a 2 500
//   _autoAlignmentDistance      0 a 1 000 — la distance sous laquelle le
//                               vaisseau s'aligne sur la verticale du corps ;
//                               Dark Bramble vaut 0, on ne s'aligne jamais
//                               sur une ronce.
//
// CE QUE LE PORTAGE SATISFAIT DEJA, PAR CONSTRUCTION. `AttachOnAwake` (x34) et
// `MatchInitialMotion` (x27) attachent un objet au corps sous lui et lui
// donnent sa vitesse au demarrage. Dans ce portage le decor est un ENFANT du
// glTF de son corps : il herite du mouvement par la hierarchie, sans code. Les
// lois sont posees ici quand meme, parce que ce qui bouge seul — le vaisseau,
// les sondes — ne passe pas par la hierarchie, et qu'un invariant vaut mieux
// qu'une coincidence.

import { insideVolume } from "./gravity.js";

/** Repli quand un corps n'a pas de volume declare : la regle d'avant. */
export const ARRIVAL_FALLBACK = 1.5;

/**
 * Les quatorze volumes de referentiel, majeurs et ordinaires melanges.
 *
 * Le champ qui compte n'est pas le nom du volume — les neuf s'appellent tous
 * « RFVolume » — mais `body`, le corps porteur, que l'extracteur remonte par la
 * chaine des parents.
 */
export function referenceFrames(gameplay) {
  const placed = gameplay.placed || {};
  const out = [];
  for (const [cls, list] of [["MajorReferenceFrameVolume", placed.MajorReferenceFrameVolume],
                             ["ReferenceFrameVolume", placed.ReferenceFrameVolume]]) {
    for (const c of list || []) {
      const f = c.fields || {};
      out.push({
        body: c.body || c.name,
        name: c.name,
        position: c.position,
        rotation: c.rotation || null,
        volume: c.volume || null,
        radius: (c.volume && c.volume.radius) || 0,
        primary: !!f._isPrimaryVolume,
        major: cls === "MajorReferenceFrameVolume",
        // Les deux distances ne vivent que sur les volumes majeurs : un
        // volume ordinaire n'est pas une destination de pilote automatique.
        arrival: f._autopilotArrivalDistance ?? null,
        alignment: f._autoAlignmentDistance ?? null,
      });
    }
  }
  return out;
}

/**
 * Le referentiel declare en un point : le plus PETIT volume qui le contient.
 *
 * L'emboitement est la regle du build — le vaisseau dans la planete, le noeud
 * casse dans la grotte dans la planete — et « le premier trouve » rendrait
 * l'ordre d'extraction significatif, ce qu'il n'est pas.
 *
 * `shiftOf` ramene un volume la ou son corps se trouve MAINTENANT ; voir
 * `restingPoint`.
 */
export function frameAt(frames, worldPoint, shiftOf = null) {
  let best = null;
  for (const fr of frames) {
    if (!fr.volume) continue;
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(fr)) : worldPoint;
    if (!insideVolume(fr, p)) continue;
    if (!best || fr.radius < best.radius) best = fr;
  }
  return best;
}

/**
 * Un point du moment, ramene dans la scene AU REPOS.
 *
 * Toutes les positions extraites sont celles de la scene a l'arret : c'est la
 * seule position qu'un fichier de scene contienne. Les corps, eux, orbitent.
 * Comparer un point du moment a une position de repos derive donc de tout le
 * chemin parcouru depuis le debut de la boucle — pour Timber Hearth, les six
 * cents unites de rayon de son volume de referentiel sont avalees en une
 * douzaine de secondes, et le volume cesse de contenir la planete.
 *
 * `shift` est le deplacement du corps porteur depuis sa position de repos :
 * l'oter du point, c'est comparer dans le repere ou les positions extraites
 * ont un sens.
 */
export function restingPoint(worldPoint, shift) {
  if (!shift) return worldPoint;
  return [worldPoint[0] - shift[0], worldPoint[1] - shift[1], worldPoint[2] - shift[2]];
}

/**
 * Distances d'arrivee et d'alignement pour un corps vise.
 *
 * Le repli garde la regle d'avant (`rayon de surface x 1,5`) : un corps sans
 * volume majeur — le trou blanc, la lune quantique avant qu'on l'ait vue — doit
 * rester atteignable.
 */
export function autopilotDistances(frames, bodyName, surfaceRadius = 0) {
  const fr = frames.find((x) => x.major && x.body === bodyName && x.arrival !== null);
  if (!fr) {
    return { arrival: surfaceRadius * ARRIVAL_FALLBACK, alignment: 0, declared: false };
  }
  return { arrival: fr.arrival, alignment: fr.alignment ?? 0, declared: true };
}

/**
 * Vitesse heritee d'un porteur : `MatchInitialMotion.CalculateMatchVelocity`.
 *
 *     v = v_porteur + omega x (p - centre_du_porteur)
 *
 * Le second terme est la vitesse tangentielle au point ou l'on se trouve : un
 * objet pose sur l'equateur d'une planete qui tourne ne va pas a la meme
 * vitesse qu'un objet pose sur son pole. Cinq des vingt-sept instances portent
 * `_ignoreAngularVelocity` a vrai et n'en gardent que le premier terme —
 * d'ou le drapeau.
 */
export function matchInitialVelocity(carrier, point, { ignoreAngular = false } = {}) {
  const v = (carrier && carrier.velocity) || [0, 0, 0];
  if (ignoreAngular || !carrier || !carrier.angularVelocity) return v.slice();
  const w = carrier.angularVelocity;
  const c = carrier.position || [0, 0, 0];
  const r = [point[0] - c[0], point[1] - c[1], point[2] - c[2]];
  return [v[0] + w[1] * r[2] - w[2] * r[1],
          v[1] + w[2] * r[0] - w[0] * r[2],
          v[2] + w[0] * r[1] - w[1] * r[0]];
}

/**
 * A quoi s'attache un objet qui se reveille : `AttachOnAwake`.
 *
 * Le build teste une sphere (`_localCheckPos`, `_checkRadius` — 1 pour trente
 * des trente-quatre instances) et prend ce qu'elle touche. On garde la meme
 * question : quel corps la sphere de controle touche-t-elle ? Le plus proche
 * gagne, parce qu'une sphere d'une unite n'en touche jamais deux.
 */
export function attachTarget(point, radius, bodies) {
  let best = null, bestGap = Infinity;
  for (const b of bodies) {
    const r = (b.gravity && b.gravity.upperSurfaceRadius) || b.radius || 0;
    if (!r) continue;
    const d = Math.hypot(point[0] - b.position[0], point[1] - b.position[1],
                         point[2] - b.position[2]);
    const gap = d - r;                 // negatif : le point est sous la surface
    if (gap > radius || gap >= bestGap) continue;
    best = b; bestGap = gap;
  }
  return best;
}

/**
 * Suivi du referentiel declare, image par image.
 *
 * Rend le volume courant et previent au changement : c'est ce que le jeu
 * affiche sous le nom de « reference frame », et ce que le ciblage verrouille.
 */
export class DeclaredFrames {
  constructor(frames = []) {
    this.frames = frames;
    this.current = null;
    this.changed = false;
  }

  get count() { return this.frames.length; }

  /** @returns {object|null} le volume courant, apres mise a jour. */
  update(worldPoint, shiftOf = null) {
    const fr = frameAt(this.frames, worldPoint, shiftOf);
    this.changed = (fr && fr.body) !== (this.current && this.current.body);
    this.current = fr;
    return fr;
  }

  /**
   * Le corps a ancrer, parmi ceux que le moteur sait ancrer.
   *
   * Un volume dont le corps n'est pas un corps du systeme — celui du vaisseau,
   * les trois du satellite casse — ne sert pas d'ancre : il n'a ni orbite ni
   * geometrie propre. Il reste lu, et c'est lui qu'affiche le ciblage.
   */
  anchorBody(bodies, accept = () => true) {
    if (!this.current) return null;
    const b = bodies.find((x) => x.bodyName === this.current.body
                              || x.name === this.current.body);
    return b && accept(b) ? b : null;
  }
}
