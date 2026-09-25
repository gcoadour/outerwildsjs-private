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

// --- les trois dernieres pieces de la queue --------------------------------
//
// @lit ThrusterParticleController, DissipatingParticlesBehavior
// @lit AncientProbeController

/**
 * Les six buses du VAISSEAU MINIATURE, par le signe de son acceleration locale.
 *
 * Le porteur est `ModelShip_Body` — le petit vaisseau telecommande de
 * l'observatoire, et non celui du joueur. Je l'avais ecrit « du vaisseau » a
 * vue du nom de la classe ; c'est le champ `body` de l'extraction qui l'a
 * corrige, comme il avait corrige « dans Dark Bramble » pour l'interrupteur du
 * regard (docs/50-regard.md).
 *
 * `ThrusterParticleController.Update` allume la buse OPPOSEE au mouvement :
 * une acceleration vers la droite (x > 0) allume la buse de GAUCHE, parce que
 * c'est elle qui pousse. Ecrit a l'envers, cela donne un vaisseau dont les
 * flammes sortent du cote ou il va — ce qui se voit, et c'est le meme piege que
 * docs/46 avait releve sur les dix buses du sac dorsal.
 *
 *   x < 0 -> droite     x > 0 -> gauche
 *   y < 0 -> haut       y > 0 -> bas
 *   z < 0 -> avant      z > 0 -> arriere
 *
 * Le seuil est ZERO, et non un seuil de bruit : la moindre commande allume.
 */
export const SHIP_NOZZLES = ["right", "left", "up", "down", "forward", "rear"];

/**
 * Les six buses, avec leur position — elles s'appellent TOUTES `Thruster_Small`,
 * et seule leur place les distingue.
 */
export function modelShipNozzles(gameplay) {
  const c = ((gameplay.placed || {}).ThrusterParticleController || [])[0];
  if (!c || !c.nozzles) return [];
  return SHIP_NOZZLES
    .filter((d) => c.nozzles[d])
    .map((d) => ({ direction: d, position: c.nozzles[d], body: c.body || null }));
}

export function shipNozzles(localAcceleration) {
  const [x, y, z] = localAcceleration;
  return {
    right: x < 0, left: x > 0,
    up: y < 0, down: y > 0,
    forward: z < 0, rear: z > 0,
  };
}

/**
 * La sonde ancienne : une acceleration LOCALE constante de cinquante, vers
 * l'avant, a chaque pas de physique. Elle ne vise rien et ne s'arrete pas.
 */
export const ANCIENT_PROBE_THRUST = 50;

export function ancientProbeAcceleration(forward, thrust = ANCIENT_PROBE_THRUST) {
  return [forward[0] * thrust, forward[1] * thrust, forward[2] * thrust];
}

// --- viser un referentiel, et s'y accorder (docs/62-visee.md) ------------------
//
// `ReferenceFrameTracker.UpdateTargeting` : la cible ne se choisit pas dans la
// carte, elle se REGARDE. Le portage ne la choisissait que dans la carte, et
// les trois canaux de vol du build — `Lock On`, `Match Velocity`, `Autopilot` —
// ne pilotaient rien une fois lus (docs/61-commandes.md).
//
// @lit ReferenceFrame, ReferenceFrameVolume, Autopilot, AutopilotGUI
// @lit PlayerJetpackController, ShipThrusterController

/** La portee du rayon proche, celui qui traverse le decor. */
export const LOCK_NEAR = 1000;
/** Celle du rayon lointain, qui ne voit que les volumes de referentiel. */
export const LOCK_FAR = 100000;
/** Vitesse de fermeture des crochets de visee, par seconde. */
export const BRACKET_RATE = 10;

/**
 * Les crochets de visee se ferment en un dixieme de seconde, et se rouvrent
 * aussi vite. `_bracketScale` va de 1 (ouvert) a 0 (ferme) a dix par seconde,
 * borne a [0, 1] — et il est REMIS a 1 au moment ou l'on vise, pour que
 * l'animation reparte de l'ouverture a chaque nouvelle cible.
 */
export function bracketScale(prev, targeted, dt, rate = BRACKET_RATE) {
  const v = prev + (targeted ? -1 : 1) * dt * rate;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const _sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const _len = (a) => Math.hypot(a[0], a[1], a[2]);

/** L'angle, en degres, entre deux directions. */
export function angleTo(a, b) {
  const la = _len(a) || 1, lb = _len(b) || 1;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(c < -1 ? -1 : c > 1 ? 1 : c) * 180 / Math.PI;
}

/**
 * Le referentiel VISE, en deux temps comme le build.
 *
 * 1. un rayon de mille unites droit devant, sur le masque physique : ce qu'on
 *    touche vraiment. C'est ce qui permet de viser une lune en la regardant de
 *    pres, meme si un plus gros volume l'englobe.
 * 2. a defaut, tous les volumes de referentiel a cent mille unites, et le plus
 *    proche EN ANGLE gagne — pas le plus proche en distance. Viser une planete
 *    lointaine mais bien centree l'emporte donc sur une lune du coin de l'oeil.
 *
 * Le premier temps devient « le corps dont on perce la sphere a moins de
 * mille ». Le second exige maintenant, comme le `RaycastAll` du build, que le
 * rayon TRAVERSE la sphere de visee du corps (`rf`, les onze « RFVolume » du
 * calque 19) — en partant de dehors : un rayon d'Unity ne touche pas le
 * collider dont il part. Le portage prenait le mieux centre du ciel entier ;
 * viser le vide gardait donc toujours une cible, et le clic qui devait
 * relacher re-visait (docs/132). Sans `rf` (extraction ancienne), on garde
 * cette ancienne regle en repli.
 *
 * @param corps  [{ name, position, radius, rf }]
 * @returns le corps vise, ou null
 */
export function aimedFrame(corps, origine, avant,
                           { near = LOCK_NEAR, far = LOCK_FAR } = {}) {
  let proche = null, procheDist = Infinity;
  let centre = null, meilleurAngle = 180;
  for (const b of corps || []) {
    if (!b || !b.position) continue;
    const d = _sub(b.position, origine);
    const dist = _len(d);
    const angle = angleTo(avant, d);
    // Temps 1 : la sphere du corps est PERCEE par le rayon proche. Le demi-angle
    // sous lequel on la voit borne l'ecart tolere.
    const r = b.radius || 0;
    if (dist - r <= near && r > 0 && dist > 0) {
      const demi = Math.asin(Math.min(1, r / Math.max(dist, r))) * 180 / Math.PI;
      if (angle <= demi && dist < procheDist) { proche = b; procheDist = dist; }
    }
    // Temps 2 : le mieux centre parmi les spheres de visee que le rayon
    // traverse, a portee du rayon lointain.
    if (dist <= far && angle < meilleurAngle) {
      if (b.rf > 0) {
        const n = _len(avant) || 1;
        const t = (d[0] * avant[0] + d[1] * avant[1] + d[2] * avant[2]) / n;
        const perp = Math.sqrt(Math.max(0, dist * dist - t * t));
        if (dist > b.rf && t > 0 && perp <= b.rf) { meilleurAngle = angle; centre = b; }
      } else if (!(corps || []).some((x) => x && x.rf > 0)) {
        meilleurAngle = angle; centre = b;
      }
    }
  }
  return proche || centre;
}

/**
 * Le verrouillage : une touche, trois issues.
 *
 * Viser du vide ou re-viser ce qu'on visait deja DEVERROUILLE — c'est la meme
 * touche qui pose et qui retire, et le build ne s'en cache pas
 * (`UntargetReferenceFrame`).
 */
export class LockOn {
  constructor() {
    this.current = null;
    this.last = null;
    this.possible = null;
    this.bracket = 1;
    this.showPrompt = false;
    this.events = [];
  }

  /**
   * @param dt
   * @param press  le front de `Lock On`
   * @param vise   le referentiel regarde, ou null (`aimedFrame`)
   */
  update(dt, press, vise) {
    this.events = [];
    if (press) {
      if (!vise || vise === this.current) {
        if (this.current) {
          this.last = this.current;
          this.current = null;
          this.events.push("UntargetReferenceFrame");
        }
      } else {
        this.last = this.current;
        this.current = vise;
        // Les crochets repartent grands ouverts : c'est ce que fait
        // `_bracketScale = 1f` juste apres l'evenement.
        this.bracket = 1;
        this.events.push("TargetReferenceFrame");
      }
    }
    this.bracket = bracketScale(this.bracket, !!this.current, dt);
    // L'invite « vous pouvez viser ceci » ne s'affiche que sur une cible
    // DIFFERENTE de celle qu'on tient deja.
    this.showPrompt = !!vise && vise !== this.current;
    this.possible = vise;
    return this.current;
  }
}

// `Autopilot.InitMatchVelocity` vivait ici, et posait la vitesse d'un coup en
// disant que « la difference se voit sur une seconde, pas sur le resultat ».
// Une seconde de jeu est justement ce que ce portage cherche : la loi est
// maintenant dans `autopilot.js`, ou `matchVelocityStep` refait
// l'asservissement du build — au plus une image de poussee maximale, mise a
// l'echelle pour ne pas depasser (docs/107-pilote.md).

/**
 * `Autopilot.InitFlyToDestination` : il REFUSE si l'on y est deja.
 *
 * « Deja » veut dire : plus pres que la distance d'arrivee declaree par le
 * volume de referentiel. Le portage engageait toujours, et le pilote partait
 * pour un voyage de zero unite.
 */
export function canFlyTo(distance, arrivalDistance, allowAutopilot = true) {
  if (!allowAutopilot) return false;
  return distance >= arrivalDistance;
}
