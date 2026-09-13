// Le suivi de referentiel : ou est la cible, et comment on va vers elle.
//
// @lit ReferenceFrameTracker, MotionParticleBehavior
// Les deux dernieres pieces visibles de la queue, et les deux disent la meme
// chose de deux facons : ce qui compte dans l'espace n'est pas ou l'on est,
// c'est comment on se DEPLACE par rapport a quelque chose (docs/58-suivi.md).
//
// Logique pure : ni Babylon, ni DOM.

/** `_arrowOffsetFactor`, du constructeur de `ReferenceFrameTracker`. */
export const ARROW_OFFSET = 0.005;

/**
 * Seuils de « trajectoire directe », par distance a la cible.
 *
 * Plus on est loin, plus on tolere de derive laterale — et le build en prevoit
 * TROIS paliers, dont un qu'il n'atteint jamais. L'IL, lu dans l'ordre des
 * SAUTS et non des lignes :
 *
 *     t = 1
 *     si dist <= 100  -> aller au test suivant
 *     sinon             t = 10, et FIN
 *     si dist <= 1000 -> FIN
 *     sinon             t = 100
 *
 * Le dernier `sinon` demande `dist <= 100` ET `dist > 1000` : il est
 * inatteignable. Le palier a 100 est du CODE MORT, et la tolerance reelle ne
 * connait que deux valeurs.
 *
 * J'avais d'abord ecrit les trois paliers « evidents » — 1, 10, 100 aux seuils
 * 100 et 1 000 — parce que c'est manifestement ce que l'auteur voulait. C'est
 * l'invariant qui a refuse, et il avait raison : on porte ce que le build
 * FAIT.
 */
export function directThreshold(distance) {
  return distance > 100 ? 10 : 1;
}

/** Le palier que le build prevoit et n'atteint jamais. Garde pour memoire. */
export const DEAD_THRESHOLD = 100;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (v) => Math.hypot(v[0], v[1], v[2]);

/**
 * `UpdateRelativeMotion`, tel quel.
 *
 * @param relativeVelocity notre vitesse DANS le referentiel vise
 * @param selfCenter       notre centre de masse
 * @param framePosition    la position du referentiel
 *
 * Le build commence par INVERSER notre vitesse : il raisonne sur le mouvement
 * apparent de la cible, pas sur le notre. Puis il projette sur la ligne de
 * visee, et ce qui reste est la derive laterale.
 *
 *   zSpeed = |projection| x -signe(produit scalaire)
 *
 * Le signe sort ainsi NEGATIF quand on se rapproche, ce qui surprend jusqu'a
 * ce qu'on se souvienne de l'inversion du debut. La couleur suit : rouge en
 * dessous de -1, verte au-dessus de +1, blanche entre les deux.
 */
export function relativeMotion(relativeVelocity, selfCenter, framePosition,
                               arrowOffset = ARROW_OFFSET) {
  const v = relativeVelocity.map((x) => -x);
  const d = [selfCenter[0] - framePosition[0], selfCenter[1] - framePosition[1],
             selfCenter[2] - framePosition[2]];
  const dist = len(d);
  // `Vector3.Project(v, d)` : la composante de v le long de d.
  const dd = dot(d, d);
  const k = dd > 0 ? dot(v, d) / dd : 0;
  const proj = [d[0] * k, d[1] * k, d[2] * k];
  const signe = Math.sign(dot(d, proj)) || 0;
  const zSpeed = len(proj) * -signe;
  const xy = [v[0] - proj[0], v[1] - proj[1], v[2] - proj[2]];
  const xyMag = len(xy);
  return {
    distance: dist,
    zSpeed,
    // Le decalage des fleches grandit avec la DISTANCE : de loin, une petite
    // derive se voit autant que de pres une grande.
    xyOffset: xy.map((x) => x * dist * arrowOffset),
    lateralSpeed: xyMag,
    direct: xyMag < directThreshold(dist),
    hue: zSpeed < -1 ? 0 : zSpeed > 1 ? 140 : 0,
    saturation: zSpeed < -1 || zSpeed > 1 ? 1 : 0,
  };
}

/**
 * La lecture affichee : distance puis vitesse d'approche.
 *
 * Le build passe en kilometres au-dela de CINQ mille metres, et non de mille —
 * un seuil inhabituel, et mesure.
 */
export function trackerReadout(distance, zSpeed) {
  let d = distance, unite = "m";
  if (d >= 5000) { d /= 1000; unite = "km"; }
  return ` ${Math.round(d)}${unite}\n ${Math.round(zSpeed)}m/s`;
}

/**
 * Les particules de mouvement : la poussiere qui defile quand on file.
 *
 * `MotionParticleBehavior.Update`, avec `s` la norme de la vitesse relative :
 *
 *   emission     seulement si un referentiel est VISE, et hors carte
 *   vitesse      s
 *   taille       s x 0,1
 *   duree de vie clamp(8 - s x 0,1, 0,7, 8)
 *   debit        clamp(s x 0,1, 1, 100)
 *   alpha        0 sous 30 u/s, sinon clamp(s x 0,01, 0, 0,2)
 *
 * Deux choses valent d'etre relevees. La poussiere n'apparait qu'au-dela de
 * TRENTE unites par seconde : en dessous, l'espace reste vide, et c'est ce qui
 * donne son prix a la vitesse. Et la duree de vie DIMINUE quand on accelere,
 * pendant que le debit augmente : plus on va vite, plus il y a de traits, et
 * plus ils sont courts.
 *
 * Enfin, le systeme REGARDE la direction du mouvement (`LookAt`) : les traits
 * sont alignes sur le deplacement, pas semes au hasard.
 */
export const DUST = { minSpeed: 30, maxAlpha: 0.2, maxLifetime: 8, minLifetime: 0.7 };

export function motionDust(speed, { targeting = true, mapView = false } = {}, cfg = DUST) {
  if (!targeting || mapView) return { emitting: false };
  const s = Math.abs(speed);
  return {
    emitting: true,
    startSpeed: s,
    size: s * 0.1,
    lifetime: Math.min(cfg.maxLifetime, Math.max(cfg.minLifetime, 8 - s * 0.1)),
    rate: Math.min(100, Math.max(1, s * 0.1)),
    alpha: s < cfg.minSpeed ? 0 : Math.min(cfg.maxAlpha, Math.max(0, s * 0.01)),
  };
}
