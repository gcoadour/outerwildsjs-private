// Le casque, l'alarme, les voyants de degats et les notifications.
//
// @lit HUDHelmet, MasterAlarm, HUDDamageDisplay, NotificationManager
// Le lot « interface » de docs/44, que docs/46 avait laisse de cote : « le
// portage a son propre HUD, et remplacer un HUD qui marche par une
// transposition n'est pas un gain ».
//
// C'etait vrai pour la MISE EN PAGE, et faux pour ces quatre-la : aucun n'est
// une question de disposition. Le casque qui traine derriere le regard,
// l'alarme a trente pour cent, les voyants qui clignotent a la demi-seconde,
// la notification qui s'efface — ce sont des COMPORTEMENTS, et le portage n'en
// avait aucun.
//
// Tout ce module est de la logique pure : il ne touche ni a Babylon ni au DOM,
// et rend des positions, des booleens et des durees que l'affichage applique.

/**
 * `_helmetLagSpeed`. Le constructeur pose 0,1 ; l'INSTANCE pose 0,05, et c'est
 * elle qui gagne — comme la course de l'ascenseur (docs/51-tour.md). Le casque
 * traine donc deux fois plus que le code seul ne le laisse croire.
 */
export const HELMET_LAG = 0.05;
export const HELMET_LAG_CTOR = 0.1;
/** L'amplitude par unite d'axe : cinq millemes, et en sens INVERSE du regard. */
export const HELMET_AMPLITUDE = -0.005;
/**
 * La bande d'angles ou le casque cesse de suivre le regard vertical.
 *
 * En angles d'Euler d'Unity, regarder vers le bas va de 0 a 90 et vers le haut
 * de 270 a 360 : la bande [70, 280] est celle qu'on ne peut pas atteindre, et
 * la tester revient a brider le suivi aux extremes.
 */
export const HELMET_PITCH_BAND = [70, 280];
/** Seuil de l'alarme generale : trente pour cent de coque. */
export const ALARM_THRESHOLD = 0.3;
/** Periode du clignotement des voyants de degats. */
export const BLINK_PERIOD = 0.5;
/**
 * `_roastDistance` : quatre unites, et les huit instances la SERIALISENT —
 * a la meme valeur que le constructeur. C'est le cas ordinaire, et il valait
 * d'etre verifie plutot que suppose.
 */
export const ROAST_DISTANCE = 4;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/**
 * Le casque qui traine derriere le regard.
 *
 * `HUDHelmet.Update` deplace le casque de cinq millemes par unite d'axe, en
 * sens inverse du mouvement, et rejoint cette cible a un dixieme par image.
 * C'est ce qui donne l'impression de porter quelque chose : le verre a de
 * l'inertie, et il rattrape la tete.
 *
 * L'axe vertical est bride aux extremes — regarder droit en haut ne decale pas
 * le casque — et c'est ce que dit la bande d'angles.
 *
 * Quatre etats, dans l'ordre du build : 0 « on l'enfile », 1 « on le retire »,
 * 2 « porte », 3 « range ».
 */
export const SUIT = { PUTTING_ON: 0, REMOVING: 1, ON: 2, OFF: 3 };

/** Le casque, tel que la scene le regle. */
export function helmetSettings(gameplay) {
  const c = ((gameplay.placed || {}).HUDHelmet || [])[0];
  const lag = c && (c.fields || {})._helmetLagSpeed;
  return { lag: typeof lag === "number" ? lag : HELMET_LAG, declared: !!c };
}

export class Helmet {
  constructor(lag = HELMET_LAG) {
    this.lag = lag;
    this.state = SUIT.OFF;
    this.x = 0;
    this.y = 0;
    this.defaultY = 0;       // `_defaultOnPosition`, releve au moment ou il se pose
    this.activated = false;  // vient-il de se poser (« HelmetHUDActivated »)
  }

  suitUp() { if (this.state !== SUIT.ON) { this.state = SUIT.PUTTING_ON; this.y = 1; } }
  removeSuit() { if (this.state === SUIT.ON) this.state = SUIT.REMOVING; }

  /**
   * @param dt
   * @param turn   axe de rotation horizontale, -1 a 1
   * @param lookY  axe de regard vertical, -1 a 1
   * @param pitch  tangage de la camera en angles d'Euler d'Unity, 0 a 360
   */
  update(dt, turn = 0, lookY = 0, pitch = 0) {
    this.activated = false;
    if (this.state === SUIT.ON) {
      const dx = clamp(turn, -1, 1) * HELMET_AMPLITUDE;
      // Hors de la bande, le suivi vertical est coupe.
      const libre = Math.ceil(pitch) < HELMET_PITCH_BAND[0]
                 || Math.floor(pitch) > HELMET_PITCH_BAND[1];
      const dy = libre ? clamp(lookY, -1, 1) * HELMET_AMPLITUDE : 0;
      this.x += (dx - this.x) * this.lag;
      this.y += (this.defaultY + dy - this.y) * this.lag;
    } else if (this.state === SUIT.PUTTING_ON) {
      // Il DESCEND sur la tete : la cible est sous zero, et il s'arrete a zero.
      if (this.y > 0) this.y += (-0.6 - this.y) * dt;
      else {
        this.y = 0; this.x = 0;
        this.defaultY = 0;
        this.state = SUIT.ON;
        this.activated = true;
      }
    } else if (this.state === SUIT.REMOVING) {
      // Litteralement ce que fait le build : tant qu'on est SOUS la position de
      // pose, on remonte vers 2 ; des qu'on la repasse, c'est fini. L'etat est
      // donc bref — le casque n'a qu'a rattraper le retard que le suivi lui
      // avait donne.
      if (this.y < this.defaultY) this.y += (2 - this.y) * dt;
      else this.state = SUIT.OFF;
    }
    return this;
  }

  get worn() { return this.state === SUIT.ON; }
}

/**
 * L'alarme generale du vaisseau.
 *
 * `MasterAlarm.Update` la declenche des que la coque passe sous trente pour
 * cent, et la coupe quand elle repasse au-dessus. Une seule valeur, et le
 * portage ne l'avait pas : il affichait un chiffre, et rien ne criait.
 */
export class MasterAlarm {
  constructor(threshold = ALARM_THRESHOLD) {
    this.threshold = threshold;
    this.on = false;
    this.turnedOn = false;    // transitions, pour jouer un son une seule fois
    this.turnedOff = false;
  }

  /** @param fraction integrite de coque, de 0 a 1 */
  update(fraction) {
    this.turnedOn = this.turnedOff = false;
    if (!this.on && fraction <= this.threshold) { this.on = true; this.turnedOn = true; }
    else if (this.on && fraction > this.threshold) { this.on = false; this.turnedOff = true; }
    return this.on;
  }

  reset() { this.on = false; this.turnedOn = this.turnedOff = false; }
}

/**
 * Les voyants de degats du tableau de bord.
 *
 * Le premier voyant est allume EN CONTINU des qu'il y a le moindre degat ; les
 * suivants CLIGNOTENT a la demi-seconde, un par piece abimee. Le clignotement
 * est global — tous ensemble —, ce qui se voit : un tableau de bord ou chaque
 * voyant bat a son rythme serait un sapin de Noel.
 */
export class DamageDisplay {
  constructor(period = BLINK_PERIOD) {
    this.period = period;
    this.blinkOn = false;
    this.last = 0;
  }

  /**
   * @param t       temps courant
   * @param damaged y a-t-il le moindre degat
   * @param parts   un booleen par piece
   * @returns un booleen par voyant, le premier etant le voyant general
   */
  update(t, damaged, parts = []) {
    if (t > this.last + this.period) { this.last = t; this.blinkOn = !this.blinkOn; }
    return [!!damaged, ...parts.map((p) => !!p && this.blinkOn)];
  }
}

/**
 * Les notifications qui s'effacent toutes seules.
 *
 * `NotificationManager` n'en tient qu'UNE : une nouvelle remplace la
 * precedente. Elle s'efface au bout de sa duree, et le composant s'eteint.
 */
export class Notifications {
  constructor() { this.current = null; this.t0 = 0; this.duration = 0; }

  display(texte, duree, t = 0) {
    this.current = texte;
    this.duration = duree;
    this.t0 = t;
    return this.current;
  }

  update(t) {
    if (this.current !== null && t > this.t0 + this.duration) this.current = null;
    return this.current;
  }
}

/**
 * Les huit invites de la guimauve.
 *
 * `RoastPromptEvent` ne fait qu'une chose une fois qu'on grille : si l'on
 * s'eloigne de plus de quatre unites du feu, il coupe le grillage et remet
 * l'interaction en etat. Les huit portent la distance dans la scene, et
 * l'invariant garde qu'elles la portent TOUTES a la meme valeur.
 */
export function roastPrompts(gameplay) {
  return ((gameplay.placed || {}).RoastPromptEvent || []).map((c) => ({
    name: c.name,
    position: c.position,
    body: c.body || null,
    distance: (c.fields || {})._roastDistance ?? ROAST_DISTANCE,
  }));
}

/** S'est-on trop eloigne du feu pour continuer a griller ? */
export function roastBroken(distance, prompt) {
  return distance > (prompt ? prompt.distance : ROAST_DISTANCE);
}
