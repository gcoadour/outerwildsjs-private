// Trou noir de Brittle Hollow et trou blanc.
//
// Constantes relevees dans le build :
//   BlackHoleVolume   collider declencheur de rayon 40, au centre de la planete
//   WhiteHoleVolume   rayon 50, cone de sortie 60 degres, rayon de debris 750
//   MakeChildrenBreakable  integrite 100, fraction detachable 0,25, masse 100,
//                          coefficient de trainee 10
//   DetachableFragment     masse 100
//
// La croute de Brittle Hollow s'effondre au fil de la boucle : les fragments
// tombent dans le trou noir et ressortent au trou blanc, a l'autre bout du
// systeme. Le joueur subit le meme sort.

// @lit BlackHoleVolume, WhiteHoleVolume, DetachableFragment
// Le trou noir, le trou blanc et les fragments qui tombent dedans.

export const CAPTURE_RADIUS = 40;

/**
 * `WhiteHoleVolume`, relu en entier — et il dit autre chose que ce que le
 * portage en avait tire (docs/102-trou-blanc.md).
 *
 * LE JOUEUR, LE VAISSEAU ET LA SONDE NE SORTENT PAS DANS UN CONE.
 * `ForceWarp`, qui les concerne tous les trois, est DETERMINISTE :
 *
 *     Vector3 p = transform.position + transform.forward * _radius;
 *     body.SetPosition(p);
 *     body.SetVelocity(_whiteHoleBody.GetVelocity()
 *                      + transform.forward.normalized * 20f);
 *
 * Droit devant, a exactement `_radius`, et a vingt unites par seconde. Le
 * portage tirait une direction au hasard dans un cone de soixante degres, a
 * 1,2 fois le rayon, et lancait a trente.
 *
 * LE CONE EXISTE, MAIS IL EST POUR LES DEBRIS, et il n'est pas celui-la :
 * `GetRandomExitTrajectory` tire l'angle entre QUINZE degres et la MOITIE de
 * `_exitConeAngle` — donc entre 15 et 30 —, autour de l'avant du trou blanc et
 * non d'une verticale quelconque. Il y a un plancher, et le demi-angle est
 * moitie moins grand que le nom du champ le laisse croire.
 */
export const WHITE_HOLE = {
  radius: 50,            // `_radius`
  exitConeDeg: 60,       // `_exitConeAngle` : le cone va de 15 a sa MOITIE
  coneFloorDeg: 15,      // `Random.Range(15f, _exitConeAngle * 0.5f)`
  exitSpeed: 20,         // le meme pour `ForceWarp` et pour les debris
  debrisRadius: 750,     // `_debrisRadius`, la longueur de laisse maximale
  leashMin: 0.2,         // `Random.Range(0.2f, 1f)` la multiplie
  startScale: 0.1,       // `localScale = Vector3.one * 0.1f` a l'engloutissement
  growPerStep: 1.05,     // par pas de PHYSIQUE, jusqu'a un
  checkSeconds: 1,       // `_lastCheckTime + 1f` entre deux sorties
  leashSlack: 0.8,       // rien ne freine en deca de 80 % de la laisse
};
/** Conserve : `_debrisRadius` est la longueur de laisse, pas un rayon de champ. */
export const DEBRIS_RADIUS = WHITE_HOLE.debrisRadius;

const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export class BlackHole {
  /**
   * @param holeBody   corps portant le trou noir (Brittle Hollow)
   * @param whiteWorld position monde du trou blanc
   * @param whiteRadius rayon de sortie
   */
  constructor(holeBody, whiteWorld, whiteRadius = 50) {
    this.holeBody = holeBody;
    this.whiteWorld = whiteWorld;
    this.whiteRadius = whiteRadius;
    this.transits = 0;
    this.lastTransit = null;
    this.fragmentsDetached = 0;
  }

  /** Position du trou noir dans le repere courant : le centre de son corps. */
  get position() { return this.holeBody ? this.holeBody.position : null; }

  /** Position de sortie, dans le repere courant. */
  exitPosition(frameOffset) {
    return [this.whiteWorld[0] - frameOffset[0],
            this.whiteWorld[1] - frameOffset[1],
            this.whiteWorld[2] - frameOffset[2]];
  }

  /**
   * `BlackHoleVolume.VanishPlayer` / `VanishShip` / `VanishProbe`, puis
   * `WhiteHoleVolume.ReceiveWarpedPlayer` / `ReceiveWarpedShip` /
   * `ReceiveWarpedProbe`, qui menent tous trois a `ForceWarp` — le meme
   * chemin, a deux details pres :
   *
   *   `ReceiveWarpedPlayer` fait d'abord PIVOTER le corps pour que l'avant de
   *   la camera s'aligne sur l'avant du trou blanc
   *   (`Quaternion.FromToRotation`). On sort en regardant la ou l'on part, et
   *   c'est ce que `lookTowardExit` rend ici ;
   *   `ReceiveWarpedShip` se garde d'un second appel dans la meme image
   *   (`_lastShipWarpTime + Time.deltaTime`), ce qui n'a pas d'objet tant que
   *   le portage n'a qu'un appelant par image.
   *
   * `ReceiveWarpedBody`, lui, est la porte des DEBRIS : il ne passe pas par
   * `ForceWarp` du tout, il met en file (voir `DebrisField`). Et c'est
   * `Vanish(corps)` qui l'y envoie, en DEUX temps :
   *
   *     foreach (Renderer r in corps.GetComponentsInChildren<Renderer>())
   *         r.gameObject.SetActive(false);
   *     _whiteHole.ReceiveWarpedBody(corps);
   *
   * LE CORPS DISPARAIT AVANT D'ARRIVER. Ses rendus sont eteints un a un — pas
   * le corps lui-meme, qui continue d'exister et de se deplacer — puis il est
   * remis au trou blanc. Entre les deux, il est invisible et bien la : c'est
   * ce qui fait qu'un morceau de croute avale ne laisse rien voir du transit,
   * et qu'il ressort entier de l'autre cote (docs/121-avis.md).
   *
   * DETERMINISTE, et le portage le tirait au hasard : on ressort DROIT DEVANT
   * le trou blanc, a exactement son rayon, a vingt unites par seconde. Le cone
   * de `_exitConeAngle` existe, mais il n'est lu que pour les DEBRIS, et pas
   * avec ce demi-angle-la (voir `exitTrajectory`).
   *
   * @param forward avant du trou blanc ; a defaut, la verticale locale du
   *   portage — qui n'a pas d'orientation pour ce volume tant que l'extraction
   *   n'en pose pas.
   * @returns {position, velocity} si transit, sinon null
   */
  capture(pos, frameOffset, forward = null) {
    const c = this.position;
    if (!c) return null;
    const d = [pos.x - c[0], pos.y - c[1], pos.z - c[2]];
    if (len(d) > CAPTURE_RADIUS) return null;

    const exit = this.exitPosition(frameOffset);
    const dir = norm(forward || [0, 1, 0]);
    const r = this.whiteRadius;
    const v = WHITE_HOLE.exitSpeed;
    this.transits += 1;
    this.lastTransit = { from: [...d], at: Date.now() };
    return {
      position: [exit[0] + dir[0] * r, exit[1] + dir[1] * r, exit[2] + dir[2] * r],
      velocity: [dir[0] * v, dir[1] * v, dir[2] * v],
      // `ReceiveWarpedPlayer` : on ressort en REGARDANT la sortie.
      forward: dir,
    };
  }

  /**
   * Le lacet qui fait regarder dans la direction de sortie.
   *
   * `Quaternion.FromToRotation(camera.forward, whiteHole.forward)` tourne le
   * corps entier ; ce portage tient le regard en lacet et tangage, et c'est
   * donc le LACET qu'on mene — le meme choix qu'a l'assise (docs/69).
   *
   * @param up la verticale locale, celle dans laquelle le lacet se mesure
   * @returns le lacet vise en radians, ou null si la direction est verticale
   */
  static lookTowardExit(forward, up) {
    const u = norm(up);
    const d = norm(forward);
    // La composante horizontale de la sortie, dans le plan du sol.
    const dv = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    const plan = [d[0] - u[0] * dv, d[1] - u[1] * dv, d[2] - u[2] * dv];
    if (len(plan) < 1e-6) return null;
    // Une base d'horizon quelconque mais STABLE : l'axe le moins colineaire.
    const ref = Math.abs(u[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const est = norm([u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2],
                      u[0] * ref[1] - u[1] * ref[0]]);
    const nord = [u[1] * est[2] - u[2] * est[1], u[2] * est[0] - u[0] * est[2],
                  u[0] * est[1] - u[1] * est[0]];
    const p = norm(plan);
    return Math.atan2(p[0] * est[0] + p[1] * est[1] + p[2] * est[2],
                      p[0] * nord[0] + p[1] * nord[1] + p[2] * nord[2]);
  }

  // L'effondrement de la croute ne se devine plus ici.
  //
  // Ce fichier portait un `crustProgress(loopFraction, total)` qui estimait le
  // nombre de fragments tombes : un quart des maillages, au prorata de la
  // boucle. `crust.js` fait le vrai travail depuis docs/15 — il lit les 122
  // fragments, en detache 72 et en brise 50 — et les deux modeles se
  // CONTREDISAIENT : un quart contre 59 pour cent. La boucle lisait le bon, et
  // l'estimation dormait a cote, fausse et jamais appelee.
  //
  // `fragmentsDetached` reste, parce que le trou noir en a besoin pour savoir
  // ce qu'il a avale — mais c'est `Crust` qui l'ecrit desormais.
}

/**
 * Champ de debris du trou blanc, relu en entier (docs/102-trou-blanc.md).
 *
 * Le portage en tenait deux choses justes — la file d'attente, et le fait que
 * `_debrisRadius` vaille 750 — et une fausse : il dispersait les morceaux
 * UNIFORMEMENT dans une sphere de 750, a raison d'un toutes les deux secondes,
 * en disant que la cadence n'etait pas dans le build. Elle y est, et le reste
 * aussi. `AddToGrowQueue` et `FixedUpdate` donnent la sequence entiere :
 *
 *   1. englouti      `localScale = 0.1`, pose AU trou blanc, vitesse du trou
 *                    blanc, et une LAISSE de `_debrisRadius x U(0,2 ; 1)`
 *   2. en file       une sortie par seconde AU PLUS, et seulement si la sphere
 *                    de `_radius` est LIBRE — sinon « White hole exit blocked »
 *   3. il grandit    `localScale x= 1,05` par pas de PHYSIQUE, jusqu'a un ;
 *                    ln(10) / ln(1,05) vaut 47,2, donc quarante-huit pas pour
 *                    ATTEINDRE un — 0,96 s a cinquante hertz
 *   4. il part       vitesse du trou blanc + `GetRandomExitTrajectory() x 20`
 *   5. il reste      `DebrisLeash` freine au-dela de 80 % de la laisse
 *
 * Rien n'est disperse : tout SORT du trou blanc et s'en eloigne jusqu'a ce que
 * sa laisse le retienne. C'est ce qui donne au champ de debris sa forme, et le
 * portage en faisait un nuage pose la.
 */

/**
 * `GetRandomExitTrajectory` : l'angle est tire entre QUINZE degres et la
 * MOITIE de `_exitConeAngle`, autour de l'avant du trou blanc.
 *
 * Deux pieges dans une ligne : le plancher de quinze — rien ne sort dans l'axe
 * — et la moitie, qui fait du « cone de soixante » un cone de trente.
 *
 * @param u1,u2 deux tirages dans [0, 1), passes pour rester reproductible
 */
export function exitTrajectory(forward, up, u1, u2, cfg = WHITE_HOLE) {
  const f = norm(forward), u = norm(up);
  const angle = (cfg.coneFloorDeg
    + u1 * (cfg.exitConeDeg * 0.5 - cfg.coneFloorDeg)) * Math.PI / 180;
  const spin = u2 * Math.PI * 2;
  // L'axe d'inclinaison est le HAUT du trou blanc, tourne autour de son avant.
  const axe = rotateAbout(u, f, spin);
  return norm(rotateAbout(f, axe, angle));
}

/** Rotation de `v` autour de `k` (unitaire) de `a` radians — Rodrigues. */
function rotateAbout(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2],
              k[0] * v[1] - k[1] * v[0]];
  const kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
          v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
          v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

/**
 * `DebrisLeash.FixedUpdate` : rien en deca de 80 % de la laisse, puis un
 * freinage QUADRATIQUE de la vitesse relative, plein a la laisse.
 *
 * @returns le facteur applique a l'oppose de la vitesse relative
 */
export function leashBrake(distance, leash, cfg = WHITE_HOLE) {
  const mou = leash * cfg.leashSlack;
  const k = Math.max(0, Math.min(1, (distance - mou) / ((leash - mou) || 1)));
  return k * k;
}

/** Combien de pas de physique pour passer de 0,1 a 1 a raison de x1,05. */
export function growSteps(cfg = WHITE_HOLE) {
  return Math.ceil(Math.log(1 / cfg.startScale) / Math.log(cfg.growPerStep));
}

export class DebrisField {
  /**
   * @param fixedStep le pas de physique : la croissance est PAR PAS, pas par
   *   seconde, et le build tourne a 50 Hz.
   */
  constructor(cfg = WHITE_HOLE, fixedStep = 1 / 50) {
    this.cfg = cfg;
    this.radius = cfg.debrisRadius;
    this.step = fixedStep;
    this.queue = [];
    this.items = [];
    this.growing = null;
    this.since = Infinity;   // depuis la derniere sortie ; on ne fait pas attendre la premiere
    this.reste = 0;          // pas de physique en retard
    this.blocked = 0;        // combien de fois la sortie etait prise
  }

  /**
   * Un morceau tombe dans le trou noir. Sa laisse est tiree de son nom, donc
   * reproductible : la meme croute ressort de la meme facon d'une session a
   * l'autre, sans quoi rien ne serait verifiable.
   */
  swallow(seed) {
    const s = String(seed);
    const h = hash01(s);
    this.queue.push({
      seed: s,
      leash: this.radius * (this.cfg.leashMin
        + h * (1 - this.cfg.leashMin)),
      u1: hash01(s + "#a"), u2: hash01(s + "#b"),
    });
    return this.queue.length;
  }

  /**
   * @param exitClear la sphere de sortie est-elle libre ? `Physics.CheckSphere`
   *   dans le build ; ici, le moteur le sait mieux que ce module.
   * @returns les morceaux PARTIS a cette image
   */
  update(dt, exitClear = true) {
    const out = [];
    this.since += dt;
    // 3. la croissance, par pas de physique
    if (this.growing) {
      this.reste += dt;
      while (this.reste >= this.step && this.growing.scale < 1) {
        this.reste -= this.step;
        this.growing.scale *= this.cfg.growPerStep;
      }
      if (this.growing.scale >= 1) {
        this.growing.scale = 1;
        const m = this.growing;
        this.growing = null;
        this.items.push(m);
        out.push(m);
      }
      return out;
    }
    this.reste = 0;
    // 2. une sortie par seconde au plus, et jamais dans une sortie occupee
    if (!this.queue.length || this.since < this.cfg.checkSeconds) return out;
    if (!exitClear) { this.blocked += 1; return out; }
    this.since = 0;
    const m = this.queue.shift();
    this.growing = { ...m, scale: this.cfg.startScale,
                     direction: null, position: [0, 0, 0] };
    return out;
  }

  /** La direction de depart d'un morceau, une fois qu'il a fini de grandir. */
  launch(item, forward, up) {
    const dir = exitTrajectory(forward, up, item.u1, item.u2, this.cfg);
    item.direction = dir;
    return { direction: dir,
             velocity: [dir[0] * this.cfg.exitSpeed, dir[1] * this.cfg.exitSpeed,
                        dir[2] * this.cfg.exitSpeed] };
  }

  get pending() { return this.queue.length; }
  get grown() { return this.items.length; }
  get scale() { return this.growing ? this.growing.scale : 0; }
}

/** Un nombre stable dans [0, 1), tire d'un nom (FNV-1a). */
export function hash01(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
