// Mort du joueur et sequence de flashback.
//
// Deux choses distinctes, que le jeu tient dans deux classes :
//
//   PlayerDeathHandler  recoit une cause de mort, coupe les commandes, lance
//                       la sequence, puis fait redemarrer la boucle ;
//   Flashback           l'enchainement d'images qui remonte le temps, avec ses
//                       quatre constantes relevees dans le build :
//                         delai 2 s, premiere image 0,6 s, facteur 0,9,
//                         image minimale 0,06 s, fondu au blanc 0,8 s.
//
// Ce qui vient du build : les quatre constantes de `Flashback` et le fait
// qu'une mort passe par une cause nommee. Ce qui n'en vient PAS : la liste
// exacte des valeurs de `DeathType`, que je n'ai pas lue ici — elle vit dans
// l'assembly, pas dans les assets. Les causes ci-dessous sont donc celles que
// CE portage sait produire, chacune reliee a un evenement du jeu qui existe
// vraiment (asphyxie, impact, supernova, predateur, etoile), et pas une
// enumeration recopiee.

export const FLASHBACK = {
  delay: 2,          // avant que les images ne commencent
  firstFrame: 0.6,   // duree de la premiere image
  decay: 0.9,        // chaque image dure 0,9 fois la precedente
  minFrame: 0.06,    // plancher : en dessous, on passe au fondu
  fade: 0.8,         // fondu au blanc final
};

/**
 * Causes de mort portees. La cle est celle qu'on passe a `kill()`, le libelle
 * est ce que l'interface affiche.
 */
export const DEATHS = {
  asphyxie: "asphyxie",
  impact: "impact",
  supernova: "supernova",
  digestion: "devore",
  incineration: "incineration",
  ecrasement: "ecrasement",
};

/**
 * Enchainement d'images de plus en plus breves, puis fondu au blanc.
 *
 * Le nombre d'images n'est pas une constante du build : il decoule des trois
 * autres. 0,6 x 0,9^n reste au-dessus de 0,06 pour n allant de 0 a 21, soit
 * 22 images et 5,41 s, auxquelles s'ajoutent les 2 s d'attente et les 0,8 s de
 * fondu — une sequence de 8,21 s.
 *
 * Les images elles-memes n'existent pas ici : le build ne porte pas de memoire
 * a rejouer. Ce module donne leur RYTHME, et l'interface s'en sert pour faire
 * battre l'ecran. C'est une mise en scene, pas un contenu extrait.
 */
export class Flashback {
  constructor(cfg = FLASHBACK) {
    this.cfg = cfg;
    this.frames = [];
    let d = cfg.firstFrame;
    while (d >= cfg.minFrame - 1e-9) {
      this.frames.push(d);
      d *= cfg.decay;
    }
    this.reset();
  }

  reset() {
    this.running = false;
    this.t = 0;
    this.frame = -1;
  }

  start() { this.reset(); this.running = true; }

  /** Duree totale de la sequence, attente et fondu compris. */
  get duration() {
    return this.cfg.delay + this.frames.reduce((a, b) => a + b, 0) + this.cfg.fade;
  }

  /**
   * @returns {phase, frame, alpha, fini}
   *   phase  "attente" | "images" | "fondu" | "fini"
   *   frame  index de l'image courante, -1 hors de la phase d'images
   *   alpha  opacite du voile blanc, 0 a 1
   */
  update(dt) {
    if (!this.running) {
      return { phase: "fini", frame: -1, alpha: 0, fini: true, t: this.t };
    }
    this.t += dt;
    const c = this.cfg;

    if (this.t < c.delay) {
      this.frame = -1;
      return { phase: "attente", frame: -1, alpha: 0, fini: false, t: this.t };
    }

    let u = this.t - c.delay;
    for (let i = 0; i < this.frames.length; i++) {
      if (u < this.frames[i]) {
        this.frame = i;
        // chaque image s'allume puis s'eteint : c'est ce battement, de plus en
        // plus rapide, qui donne l'impression d'un temps qui se rembobine
        const k = u / this.frames[i];
        return { phase: "images", frame: i,
                 alpha: 0.35 * Math.sin(Math.PI * k), fini: false, t: this.t };
      }
      u -= this.frames[i];
    }

    const a = Math.min(1, u / c.fade);
    if (u >= c.fade) {
      this.running = false;
      return { phase: "fini", frame: -1, alpha: 1, fini: true, t: this.t };
    }
    return { phase: "fondu", frame: -1, alpha: a, fini: false, t: this.t };
  }
}

/**
 * Le son d'une mort.
 *
 * `PlayerDeathHandler` joue un son par cause. Le build ne donne pas la table
 * qui relie l'un a l'autre — elle vit dans l'assembly — mais il donne les
 * sources, avec leurs noms, et une piste de mixage `Death` que `MixDeath`
 * isole. On demande donc la source dont le nom parle de cette mort, et a
 * defaut la piste entiere : c'est ce que le portage peut affirmer.
 */
export const DEATH_SOUNDS = {
  asphyxie: /suffocat|asphyx|oxygen|breath/i,
  impact: /impact|crash|collision|thud/i,
  supernova: /supernova|explos|blast|shock/i,
  digestion: /angler|fish|chomp|bite|eat/i,
  incineration: /fire|burn|sun|lava/i,
  ecrasement: /crush|impact|crash/i,
};

/**
 * Mouvement de camera pendant la sequence.
 *
 * Le jeu pilote la camera quand le joueur meurt : elle bascule et descend, le
 * temps que les images defilent, puis se releve pendant le fondu. Ce n'est pas
 * une mesure — aucune courbe n'est dans les assets — mais l'absence de tout
 * mouvement etait, elle, franchement fausse : on mourait sans que l'image
 * bouge d'un pixel.
 *
 * @returns {roll, pitch, drop} — radians, radians, unites vers le bas local
 */
export const DEATH_FALL = { roll: 0.55, pitch: 0.35, drop: 1.1 };

export function deathCamera(state, cfg = DEATH_FALL) {
  if (!state || state.fini) return { roll: 0, pitch: 0, drop: 0 };
  if (state.phase === "attente") {
    // la chute occupe le delai de deux secondes, en douceur
    const k = Math.min(1, (state.t || 0) / FLASHBACK.delay);
    const e = k * k * (3 - 2 * k);   // lissage aux deux bouts
    return { roll: cfg.roll * e, pitch: cfg.pitch * e, drop: cfg.drop * e };
  }
  if (state.phase === "fondu") {
    const k = 1 - Math.min(1, state.alpha);
    return { roll: cfg.roll * k, pitch: cfg.pitch * k, drop: cfg.drop * k };
  }
  return { roll: cfg.roll, pitch: cfg.pitch, drop: cfg.drop };
}

/**
 * Une mort, une cause, une sequence, un redemarrage.
 *
 * Le handler est la seule porte d'entree : la boucle temporelle, les ressources
 * et les predateurs lui passent une cause, et c'est lui qui decide quand la
 * boucle repart. Avant, la mort par asphyxie et la mort par supernova avaient
 * chacune leur chemin, et le delai de reapparition etait un `setTimeout` pose
 * dans la boucle de rendu.
 */
export class PlayerDeathHandler {
  constructor(flashback = new Flashback()) {
    this.flashback = flashback;
    this.cause = null;
    this.state = { phase: "fini", frame: -1, alpha: 0, fini: true, t: 0 };
    this.deaths = 0;
    this.byCause = {};
  }

  get dead() { return this.cause !== null; }

  /** @returns true si cette mort est celle qui a pris, false si une autre courait deja */
  kill(cause) {
    if (this.dead) return false;
    this.cause = DEATHS[cause] ? cause : "impact";
    this.deaths += 1;
    this.byCause[this.cause] = (this.byCause[this.cause] || 0) + 1;
    this.flashback.start();
    return true;
  }

  /** @returns true a l'image ou la sequence s'acheve : c'est le moment de rejouer */
  update(dt) {
    if (!this.dead) return false;
    this.state = this.flashback.update(dt);
    return this.state.fini;
  }

  revive() {
    this.cause = null;
    this.flashback.reset();
    this.state = { phase: "fini", frame: -1, alpha: 0, fini: true, t: 0 };
  }

  get label() {
    return this.cause ? (DEATHS[this.cause] || this.cause) : null;
  }
}

/**
 * Voile blanc du flashback. Un simple element, pose sur l'interface : le fondu
 * au blanc du jeu est un ecran plein, pas un effet de post-traitement.
 */
export class FlashbackOverlay {
  constructor(root) {
    this.el = document.createElement("div");
    this.el.className = "ow-flashback";
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  update(state) {
    const on = !!state && state.alpha > 0.001;
    this.el.hidden = !on;
    if (on) this.el.style.opacity = String(Math.min(1, state.alpha));
  }
}
