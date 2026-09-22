// Pilote automatique et modele de degats du vaisseau.
//
// L'Autopilot du jeu procede en quatre phases, lisibles a ses drapeaux :
// alignement sur la destination, vol, approche, puis egalisation de vitesse
// avec le referentiel d'arrivee. On reprend cette decomposition.
//
// Degats (ShipDamageController) :
//   impact leger    au-dela de 15 u/s
//   impact moyen    au-dela de 30 u/s
//   integrite       100
//   mort instantanee a 300 u/s

// CE QUE `ReadTranslationalInput` FAIT, ET QUE CE MODULE APPROXIMAIT
// (docs/107-pilote.md). Les quatre phases etaient une reconstruction de bon
// sens : on poussait vers la cible, on poussait a rebours en approche, et
// l'egalisation POSAIT la vitesse — ce qui etait dit, mais reste une seconde
// de jeu escamotee. Le build n'a pas de machine a phases : il a UNE methode
// qui, chaque pas de physique, rend une DIRECTION de poussee, et les quatre
// drapeaux ne sont que ce qu'elle a decide en chemin.
//
// Trois choses en sortent, et aucune ne se devinait :
//
//   - LA DISTANCE DE FREINAGE compte la gravite et l'acceleration du
//     referentiel, pas seulement la poussee. Tomber vers la cible ALLONGE le
//     freinage, et le portage l'ignorait ;
//   - ON NE FREINE PAS EN POUSSANT A REBOURS. Au moment ou la distance de
//     freinage depasse ce qui reste, le build tire ses retro-fusees et passe a
//     l'EGALISATION — c'est la meme loi qui ralentit et qui accorde ;
//   - L'EGALISATION est un asservissement : au plus une image de poussee
//     maximale, mise a l'echelle pour ne pas depasser, et c'est fini quand il
//     reste moins d'un centieme d'unite par seconde.
//
// `ReadRotationalInput` rend `Vector3.zero`. Le pilote automatique ne tourne
// RIEN : l'orientation du vaisseau pendant le voyage ne vient pas de lui. Une
// piste qui se ferme a la lecture, et c'est un bon resultat.

// @lit AutopilotGUI, Autopilot
// Les messages du pilote automatique viennent d'`AutopilotGUI`.

export const DAMAGE = {
  light: 15, medium: 30, total: 100, instantDeath: 300,
};

export const PHASES = ["repos", "alignement", "vol", "approche", "egalisation"];

/**
 * `AutopilotGUI.Update` : quel message, selon quels drapeaux.
 *
 *     if (IsMatchingVelocity())
 *         if (IsFlyingToDestination()) "stage 3: firing retro-rockets"
 *         else                         "matching target velocity"
 *     else if (IsLiningUpDestination())    "stage 1: aligning flight path"
 *     else if (IsApproachingDestination()) "stage 2: accelerating towards destination"
 *
 * LES QUATRE CLES DE CE PORTAGE ETAIENT MAL APPARIEES. « approche » affichait
 * « stage 3: firing retro-rockets », qui est en fait l'EGALISATION pendant un
 * vol ; et « vol » affichait « stage 2 », qui est `_isApproachingDestination`.
 * Le catalogue etait juste, l'aiguillage non (docs/107-pilote.md).
 *
 * Et rien ne posait jamais « vol » : le message le plus frequent du vol
 * n'apparaissait donc nulle part.
 */
export function autopilotMessageKey({ matching = false, flying = false,
                                      liningUp = false, approaching = false } = {}) {
  if (matching) return flying ? "approche" : "egalisation";
  if (liningUp) return "alignement";
  if (approaching) return "vol";
  return null;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const mul = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Les quatre seuils de `ReadTranslationalInput`, tels quels. */
export const AUTOPILOT = {
  matched: 0.01,       // `reste < 0.01f` : la vitesse est accordee
  receding: 1,         // `vAppro < -1f` : on s'eloigne, on se realigne
  lateralPart: 10,     // `|travers| > poussee / 10f` : il faut se realigner
  closingFast: 10,     // `vAppro > 10f` : on coupe la poussee axiale
  halfProj: 2,         // `travers *= |proj| / 2f`
};

/**
 * `GetRelativeVelocity(frame)` : le Δv qu'il RESTE A AJOUTER.
 *
 *     frame.GetVelocity() - this.GetVelocity()
 *
 * Le sens compte, et il n'est pas celui qu'on suppose : ce vecteur n'est pas
 * « notre vitesse vue du referentiel », c'est son OPPOSE. C'est ce qui rend
 * toute la methode lisible — l'entree de poussee rendue est ce vecteur
 * normalise, pas son contraire.
 */
export function relativeDelta(vFrame, vShip) { return sub(vFrame, vShip); }

/**
 * La composante SIGNEE d'un vecteur le long d'un axe.
 *
 * Le build l'ecrit en trois lignes — `|Project(v, axe)|` multiplie par le
 * signe du produit scalaire — et c'est exactement le produit scalaire avec
 * l'axe unitaire. On l'ecrit court, et on dit ici que c'est la meme chose,
 * pour que personne n'aille chercher une subtilite qui n'y est pas.
 */
export function alongAxis(v, axe) {
  const l = len(axe);
  if (!l) return 0;
  return (v[0] * axe[0] + v[1] * axe[1] + v[2] * axe[2]) / l;
}

/**
 * `ReadTranslationalInput`, branche `_isMatchingVelocity`.
 *
 *     float maxDv = GetMaxTranslationalThrust() * fixedDeltaTime;
 *     float frac = 1f;
 *     if (rel.magnitude < maxDv) frac = rel.magnitude / maxDv;
 *     float reste = rel.magnitude - maxDv * frac;
 *     if (reste < 0.01f) { ... evenement ... enabled = false; }
 *     return InverseTransformDirection(rel.normalized * frac);
 *
 * UN ASSERVISSEMENT, ET NON UNE POSE. Ce module posait la vitesse d'un coup en
 * le disant : « la difference se voit sur une seconde, pas sur le resultat ».
 * Une seconde de jeu est ce que ce portage cherche.
 *
 * La fraction est la seule finesse : tant que l'ecart depasse ce qu'une image
 * de poussee peut combler, on pousse a fond ; en dessous, on ne pousse que ce
 * qu'il faut — donc jamais de depassement, et `reste` tombe a zero.
 */
export function matchVelocityStep(rel, maxThrust, dt, cfg = AUTOPILOT) {
  const maxDv = maxThrust * dt;
  const m = len(rel);
  const frac = maxDv > 0 && m < maxDv ? m / maxDv : 1;
  const reste = m - maxDv * frac;
  return { input: mul(norm(rel), frac), frac, reste, done: reste < cfg.matched };
}

/**
 * La distance de freinage, et ce qu'elle compte en plus de la poussee.
 *
 *     float decel = accReferentiel + gravite + GetMaxTranslationalThrust();
 *     float d = Pow(Abs(vAppro), 2) / (2f * decel);
 *
 * `gravite` est la composante de l'acceleration du champ le long de l'axe
 * d'approche, **changee de signe** : tomber vers la cible RETRANCHE de la
 * deceleration, donc allonge le freinage. Ce module n'avait que la poussee, et
 * freinait donc trop tard en approchant d'un corps lourd.
 */
export function brakingDistance(vApproche, maxThrust, graviteAxiale = 0,
                                accReferentielAxiale = 0) {
  const decel = accReferentielAxiale + graviteAxiale + maxThrust;
  if (!(decel > 0)) return Infinity;
  return (vApproche * vApproche) / (2 * decel);
}

/**
 * `ReadTranslationalInput`, branche `_isFlyingToDestination`.
 *
 * L'ordre des decisions EST la loi ; le renverser change le vol :
 *
 *   1. on s'eloigne de plus d'une unite par seconde   -> on realigne
 *   2. la distance de freinage depasse ce qui reste   -> retro-fusees, puis
 *                                                        EGALISATION
 *   3. la derive de travers depasse le dixieme de la poussee -> on realigne,
 *      et si l'on ferme a plus de dix, on coupe toute poussee axiale
 *   4. sinon on approche : une correction de travers valant la moitie de la
 *      vitesse axiale, et la poussee axiale inversee si l'on ferme deja
 *
 * @returns {{phase:string, input:Array|null, retro:boolean, vApproche:number,
 *            freinage:number}}
 */
export function flyStep({ vers, rel, maxThrust, arrivalDistance = 0,
                          graviteAxiale = 0, accReferentielAxiale = 0 },
                        cfg = AUTOPILOT) {
  const distance = len(vers);
  const axe = norm(vers);
  // `vAppro > 0` : on FERME. Le signe vient de ce que `rel` est le Δv a
  // ajouter, donc l'oppose de notre vitesse vue du referentiel.
  const compo = alongAxis(rel, vers);
  const vApproche = -compo;
  const proj = mul(axe, compo);
  if (vApproche < -cfg.receding) {
    return { phase: "alignement", input: norm(rel), retro: false,
             vApproche, freinage: 0 };
  }
  const freinage = brakingDistance(vApproche, maxThrust, graviteAxiale,
                                   accReferentielAxiale);
  if (freinage > distance - arrivalDistance) {
    // `OnFireRetroRockets()` puis `InitMatchVelocity(frame)` : le freinage
    // N'EST PAS une poussee a rebours, c'est un changement de mode.
    return { phase: "egalisation", input: null, retro: true,
             vApproche, freinage };
  }
  let travers = sub(rel, proj);
  let axial = proj;
  if (len(travers) > maxThrust / cfg.lateralPart) {
    if (vApproche > cfg.closingFast) axial = [0, 0, 0];
    return { phase: "alignement", input: norm(add(travers, axial)), retro: false,
             vApproche, freinage };
  }
  travers = mul(travers, len(proj) / cfg.halfProj);
  if (vApproche > 0) axial = mul(proj, -1);
  else { travers = [0, 0, 0]; axial = [...vers]; }
  return { phase: "approche", input: norm(add(travers, axial)), retro: false,
           vApproche, freinage };
}

/**
 * `ReadRotationalInput` : `Vector3.zero`, et rien d'autre.
 *
 * Deux instructions d'IL, et une piste qui se ferme a la lecture : le pilote
 * automatique ne tourne pas le vaisseau. L'orientation pendant le voyage vient
 * d'ailleurs — et savoir qu'elle n'en vient PAS vaut d'etre ecrit.
 */
// @mesure
export function autopilotRotation() { return [0, 0, 0]; }

import { autopilotDistances, ARRIVAL_FALLBACK } from "./frames.js";

export class Autopilot {
  /**
   * @param frames volumes de referentiel declares (`frames.js`). Ce sont eux
   *        qui portent les distances d'arrivee et d'alignement du build ; sans
   *        eux, on retombe sur la regle d'avant, `rayon de surface x 1,5`.
   */
  constructor(ship, frames = []) {
    this.ship = ship;
    this.frames = frames;
    this.arrival = 0;
    this.alignment = 0;
    this.declared = false;
    this.target = null;        // corps vise
    this.phase = "repos";
    // AutopilotGUI distingue l'arrivee de l'abandon, et l'arrivee courte de
    // l'arrivee juste : l'ecart de plus de 50 unites donne « undershot target »
    this.arrived = false;
    this.arrivalError = null;
    this.matching = false;   // `_isMatchingVelocity`
    this.flying = false;     // `_isFlyingToDestination`
  }

  engage(body) {
    if (!body) return false;
    this.target = body;
    this.arrived = false;
    this.phase = "alignement";
    this.arrivalError = null;
    this.matching = false;   // `_isMatchingVelocity`
    this.flying = true;      // `_isFlyingToDestination`
    // Les deux distances viennent du `MajorReferenceFrameVolume` du corps vise
    // (docs/46, lot 1) : 1 000 partout, 2 500 pour Giant's Deep et Dark
    // Bramble, et un alignement de 0 a 1 000 — zero pour Dark Bramble, ou l'on
    // ne s'aligne sur rien.
    const surface = (body.gravity && body.gravity.upperSurfaceRadius) || 100;
    const d = autopilotDistances(this.frames, body.bodyName || body.name, surface);
    this.arrival = d.arrival;
    this.alignment = d.alignment;
    this.declared = d.declared;
    return true;
  }

  /** `Abort` : les quatre drapeaux tombent ensemble, et l'annonce part. */
  abort() {
    const etait = this.phase !== "repos";
    this.target = null;
    this.phase = "repos";
    this.matching = false;
    this.flying = false;
    return etait;
  }

  /**
   * `InitMatchVelocity(frame)` sans destination : accorder sa vitesse, et rien
   * d'autre. C'est le second geste du pilote, et il a son propre message.
   */
  matchVelocity(body) {
    if (!body) return false;
    this.target = body;
    this.arrived = false;
    this.arrivalError = null;
    this.matching = true;
    this.flying = false;
    this.phase = "egalisation";
    return true;
  }

  get engaged() { return this.phase !== "repos"; }

  /**
   * Une image du pilote automatique.
   *
   * Le build appelle `ReadTranslationalInput` a chaque pas de physique et rend
   * une DIRECTION de poussee, a fond ; les phases ne sont que ce qu'il a decide
   * en chemin. Ce module applique donc la poussee, et ne pose plus la vitesse.
   *
   * @param monde { gravite, accReferentiel, vitesseCible } — la gravite au
   *   vaisseau et l'acceleration du referentiel, que seul l'appelant connait.
   *   Absentes, elles valent zero : le freinage se calcule alors sur la seule
   *   poussee, ce qui etait tout ce que ce module savait faire.
   */
  update(dt, monde = {}) {
    if (!this.target) return this.phase;
    const s = this.ship;
    const vers = sub(this.target.position, [s.pos.x, s.pos.y, s.pos.z]);
    const d = len(vers);
    const surface = (this.target.gravity && this.target.gravity.upperSurfaceRadius) || 100;
    const arrival = this.arrival || surface * ARRIVAL_FALLBACK;
    const poussee = s.thrust || 50;
    const vCible = monde.vitesseCible || this.target.velocity || [0, 0, 0];
    const rel = relativeDelta(vCible, [s.vel.x, s.vel.y, s.vel.z]);

    // EGALISATION : le meme asservissement sert a freiner et a accorder, et
    // c'est `IsFlyingToDestination` qui distingue les deux messages.
    if (this.matching) {
      this.phase = autopilotMessageKey({ matching: true, flying: this.flying });
      const pas = matchVelocityStep(rel, poussee, dt);
      const k = poussee * dt;
      s.vel.x += pas.input[0] * k;
      s.vel.y += pas.input[1] * k;
      s.vel.z += pas.input[2] * k;
      if (pas.done) {
        // `OnArriveAtDestination(distance - arrivalDistance)` pendant un vol,
        // `OnMatchedVelocity()` sinon.
        if (this.flying) {
          this.arrivalError = Math.round(d - arrival);
          this.arrived = true;
        }
        this.abort();
      }
      return this.phase;
    }

    const pas = flyStep({
      vers, rel, maxThrust: poussee, arrivalDistance: arrival,
      graviteAxiale: -alongAxis(monde.gravite || [0, 0, 0], vers),
      accReferentielAxiale: alongAxis(monde.accReferentiel || [0, 0, 0], vers),
    });
    if (pas.retro) {
      // `OnFireRetroRockets` puis `InitMatchVelocity` : `_isFlyingToDestination`
      // RESTE vrai, et c'est lui qui donne « stage 3 » plutot que le message
      // d'egalisation simple.
      this.matching = true;
      this.phase = autopilotMessageKey({ matching: true, flying: true });
      return this.phase;
    }
    this.phase = autopilotMessageKey({
      liningUp: pas.phase === "alignement",
      approaching: pas.phase === "approche",
    }) || this.phase;
    const k = poussee * dt;
    s.vel.x += pas.input[0] * k;
    s.vel.y += pas.input[1] * k;
    s.vel.z += pas.input[2] * k;
    return this.phase;
  }
}

// `impactDamage` vivait ici, et c'etait une INVENTION : « progression lineaire
// entre le seuil leger et le seuil de mort instantanee », avec une severite de
// 0,4 ou 1. Elle prenait `_lightImpactThreshold` et `_mediumImpactThreshold`
// pour des seuils de DEGATS ; ce sont les seuils du BRUIT, et leur seul autre
// emploi dans `OnImpact` est de choisir entre `_lightImpactClip` et
// `_mediumImpactClip`.
//
// `ShipDamageController` ne porte AUCUN champ de sante de coque. Il explose sur
// deux conditions seulement — la vitesse d'un choc, et le cumul des degats des
// pieces au-dela de `_shipTotalHealth`. C'est ce que `shipdamage.js` fait
// maintenant, et l'integrite du vaisseau y est une soustraction
// (docs/113-seuil.md).
