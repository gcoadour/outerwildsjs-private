// Mort du joueur et sequence de flashback.
//
// Deux choses distinctes, que le jeu tient dans deux classes :
//
//   PlayerDeathHandler  recoit une cause de mort, coupe les commandes, lance
//                       la sequence, puis fait redemarrer la boucle ;
//   Flashback           l'enchainement d'images qui remonte le temps.
//
// CE QUE CE FICHIER A LONGTEMPS DIT DE FAUX (docs/98-flashback.md).
//
// Il portait, en tete : « Les images elles-memes n'existent pas ici : le build
// ne porte pas de memoire a rejouer. » C'est faux, et mesurable :
//
//   Flashback.TakeSnapshot()
//       RenderTexture rt = new RenderTexture(256, 256, 0);
//       rt.isPowerOfTwo = true;  rt.Create();
//       _activeCamera.targetTexture = rt;
//       _activeCamera.Render();
//       _activeCamera.targetTexture = null;
//       _snapshotRenders.Add(rt);
//       _lastSnapShotTime = Time.time;
//
// Appele toutes les `_snapshotFrequency` secondes — **cinq**, serialise sur
// `FlashbackCamera` — des que `timeSinceLevelLoad > 3` et tant que
// `PlayerState.IsDead()` est faux. Le jeu photographie donc la partie en
// train de se jouer, 256 par 256, et la mort REJOUE ces images-la, de la plus
// recente a la plus ancienne. C'est le flashback d'Outer Wilds, et il n'etait
// pas la.
//
// Le nombre d'images n'est pas une constante : c'est le temps qu'on a survecu
// divise par cinq. Mourir apres deux minutes rend un flashback de deux minutes
// de vie ; mourir a la dix-septieme rend dix-sept minutes. Les vingt-deux
// images que ce fichier comptait etaient le point ou la DUREE d'image touche
// son plancher, pas le nombre d'images du jeu.
//
// Ce qui vient du build : les cinq constantes, la frequence, la marche arriere,
// la duree cumulee, le plan qui avance, le tourbillon et le flou final. Ce qui
// n'en vient PAS : la liste exacte des valeurs de `DeathType`, qui vit dans
// l'assembly. Les causes ci-dessous sont donc celles que CE portage sait
// @lit PlayerDeathHandler, Flashback
// @autrement Flashback : la gestion des textures et passes Unity (Load, ActivateScene, UpdateCameraEffects, ConvertToTexture2D) est portee par le canvas et shaders WebGL

export const DEATH_EVENTS = {
  triggerPlayerDeath: "TriggerPlayerDeath",
  triggerFlashback: "TriggerFlashback",
  startFlashback: "StartFlashback",
  finishFlashback: "FinishFlashback",
};

export const FLASHBACK = {
  // `FLASHBACK_START_DELAY` : de `TriggerFlashback` a `StartFlashback`.
  delay: 2,
  // Puis une seconde de PLUS avant que le plan n'apparaisse et que le
  // chronometre des images ne parte (`_primeFlashbackTime + 2 + 1`). Le
  // portage n'avait pas cette seconde-la.
  prime: 1,
  firstFrame: 0.6,   // INIT_FRAME_LENGTH
  decay: 0.9,        // FRAME_LENGTH_MULTIPLIER
  minFrame: 0.06,    // MIN_FRAME_LENGTH
  fade: 0.8,         // WHITE_OUT_LENGTH
  // `Flashback.Update` attend une seconde apres `FinishFlashback` avant
  // d'appeler `RestartTimeLoop`.
  restart: 1,
  // `_snapshotFrequency`, serialise : une photo toutes les cinq secondes, et
  // pas avant la troisieme seconde de partie.
  snapshotEvery: 5,
  snapshotAfter: 3,
  snapshotSize: 256,
  // Le plan porte-image avance vers la camera : `Vector3.Lerp(
  // _initLocalPlanePos, new Vector3(0, 0, 0.5f), u)`, avec `_initLocalPlanePos`
  // pose a `(0, 0, 12)` dans `Start`.
  planeFrom: 12, planeTo: 0.5,
  // `_twirlEffect.angle = 7 * sin(Time.time * 0.5)` : un tourbillon lent qui
  // va et vient, et ne se cale sur rien.
  twirl: 7, twirlRate: 0.5,
  // `_glowEffect.blurIterations = (int)(2 + 30 * blancheur)`.
  glowMin: 2, glowMax: 32,
};

/**
 * Les durees d'image, dans l'ordre ou le build les additionne.
 *
 *   for (i = 0; i < count; i++)
 *       _totalFlashbackDuration += Mathf.Max(0.6f * Mathf.Pow(0.9f, i), 0.06f);
 *
 * La premiere image du DEFILEMENT est la derniere photo prise, et elle dure
 * 0,6 s ; chaque suivante dure 0,9 fois la precedente, jusqu'au plancher de
 * 0,06. Le temps s'accelere a mesure qu'on remonte — c'est cela, remonter le
 * temps.
 */
export function frameLengths(count, cfg = FLASHBACK) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.max(cfg.firstFrame * Math.pow(cfg.decay, i), cfg.minFrame));
  }
  return out;
}

/**
 * `_imageDisplayTimes`, indexe par NUMERO DE PHOTO et non par rang d'affichage.
 *
 *   _imageDisplayTimes[count - 1 - i] = _totalFlashbackDuration (apres l'ajout)
 *
 * Le defilement part de `count - 1` — la photo la plus recente — et descend.
 * `Update` passe a la suivante quand le temps depasse `times[index - 1]` : la
 * borne porte l'indice d'ARRIVEE, pas celui d'ou l'on vient.
 */
export function displayTimes(count, cfg = FLASHBACK) {
  const lens = frameLengths(count, cfg);
  const times = new Array(count).fill(0);
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += lens[i];
    times[count - 1 - i] = total;
  }
  return times;
}

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
 * Le defilement du flashback, tel que `Flashback.OnTriggerFlashback` le prepare
 * et `Flashback.Update` le joue.
 *
 * La sequence entiere, dans l'ordre :
 *
 *   0                        `TriggerFlashback` : les durees sont calculees,
 *                            l'index part de la DERNIERE photo, rien ne parait
 *   +2 s                     `StartFlashback` : l'annonce part
 *   +1 s                     le plan apparait, le chronometre des images part
 *   ... total                les photos defilent A REBOURS, de plus en plus vite
 *   les 0,8 s finales        l'image de fin, et le flou qui monte de 2 a 32
 *   +1 s apres la fin        `RestartTimeLoop`
 *
 * Le portage n'avait ni la seconde d'amorce, ni la seconde de fin, ni les
 * photos, ni le plan qui avance, ni le tourbillon, ni le flou. Il avait le
 * rythme, et il le faisait battre sur un voile blanc.
 */
export class Flashback {
  constructor(cfg = FLASHBACK) {
    this.cfg = cfg;
    this.count = 0;
    this.times = [];
    this.lengths = [];
    this.total = 0;
    this.reset();
  }

  reset() {
    this.running = false;
    this.t = 0;
    this.index = -1;
    this.finishedAt = null;
  }

  /**
   * `OnTriggerFlashback`.
   *
   * @param count nombre de photos en memoire. Zero est un cas reel — mourir
   *   dans les trois premieres secondes — et le build le traverse sans rien
   *   afficher : le tableau est vide, la duree se reduit au fondu.
   */
  start(count = 0) {
    this.reset();
    this.count = Math.max(0, count | 0);
    this.lengths = frameLengths(this.count, this.cfg);
    this.times = displayTimes(this.count, this.cfg);
    this.total = (this.times.length ? this.times[0] : 0) + this.cfg.fade;
    this.index = this.count - 1;
    this.running = true;
  }

  /**
   * Duree totale, de la mort au redemarrage de la boucle.
   *
   * Les deux secondes d'attente, la seconde d'amorce, le defilement, le fondu
   * au blanc, et la seconde qui separe `FinishFlashback` de `RestartTimeLoop`.
   */
  get duration() {
    return this.cfg.delay + this.cfg.prime + this.total + this.cfg.restart;
  }

  /**
   * @returns {phase, index, frame, alpha, white, plane, twirl, glow, u, fini}
   *   phase  "attente" | "images" | "fondu" | "fin" | "fini"
   *   index  numero de la photo affichee, -1 s'il n'y en a pas
   *   alpha  opacite du voile blanc, 0 a 1
   *   plane  distance du plan porte-image a la camera (12 vers 0,5)
   *   twirl  angle du tourbillon, en degres
   *   glow   iterations de flou, 2 a 32
   */
  update(dt) {
    const c = this.cfg;
    const rien = { phase: "fini", index: -1, frame: -1, alpha: 0, white: 0,
                   plane: c.planeFrom, twirl: 0, glow: c.glowMin, u: 0,
                   fini: true, t: this.t };
    if (!this.running) return rien;
    this.t += dt;

    // Le tourbillon ne se cale sur rien : `Mathf.Sin(Time.time * 0.5f)` suit
    // l'horloge du jeu, pas celle de la sequence. On entre donc dedans a
    // l'angle ou il se trouve, ce qui est exactement ce que le build fait.
    const twirl = c.twirl * Math.sin(this.t * c.twirlRate);

    if (this.t < c.delay + c.prime) {
      this.index = this.count - 1;
      return { phase: "attente", index: -1, frame: -1, alpha: 0, white: 0,
               plane: c.planeFrom, twirl, glow: c.glowMin, u: 0,
               fini: false, t: this.t };
    }

    const e = this.t - c.delay - c.prime;
    // Apres la fin, la seconde qui precede `RestartTimeLoop`. Le plan est vide
    // — `SetTexture("_MainTex", null)` — et l'ecran reste blanc.
    if (e >= this.total) {
      if (this.finishedAt === null) this.finishedAt = e;
      if (e - this.finishedAt >= c.restart) {
        this.running = false;
        return { ...rien, alpha: 1, t: this.t };
      }
      return { phase: "fin", index: -1, frame: -1, alpha: 1, white: 1,
               plane: c.planeTo, twirl, glow: c.glowMax, u: 1,
               fini: false, t: this.t };
    }

    // `while (_flashbackIndex > 0 && time > start + times[_flashbackIndex - 1])`
    while (this.index > 0 && e > this.times[this.index - 1]) this.index -= 1;

    const u = this.total > 0 ? Math.min(1, e / this.total) : 1;
    const white = Math.min(1, Math.max(0, (e - (this.total - c.fade)) / c.fade));
    const plane = c.planeFrom + (c.planeTo - c.planeFrom) * u;
    const glow = Math.floor(c.glowMin + (c.glowMax - c.glowMin) * white);
    return {
      phase: white > 0 ? "fondu" : "images",
      // La photo reste affichee pendant le fondu : c'est `_finalImage` qui la
      // remplace, et le flou qui l'efface. Le portage coupait l'image net.
      index: white >= 1 ? -1 : this.index,
      frame: this.count - 1 - this.index,
      alpha: white, white, plane, twirl, glow, u, fini: false, t: this.t,
    };
  }
}

/**
 * Quand photographier, et quand s'en abstenir.
 *
 *   if (Time.time > _lastSnapShotTime + _snapshotFrequency
 *       && Time.timeSinceLevelLoad > 3f
 *       && !PlayerState.IsDead())
 *       TakeSnapshot();
 *
 * Les trois conditions comptent, et la derniere est celle qui relie ce
 * mecanisme a `PlayerState._isDead` — l'etat que le portage laissait a faux
 * pour toujours (docs/97). Un mort ne photographie plus : sans cela, la
 * sequence de mort se photographierait elle-meme et se retrouverait en tete du
 * flashback suivant.
 *
 * `_lastSnapShotTime` nait a zero, donc la premiere photo part a cinq secondes.
 */
export class SnapshotTimer {
  constructor(cfg = FLASHBACK) {
    this.cfg = cfg;
    this.last = 0;
    this.taken = 0;
  }

  reset() { this.last = 0; this.taken = 0; }

  /**
   * @param now  secondes depuis le chargement
   * @param dead `PlayerState.IsDead()`
   * @returns true s'il faut prendre une photo a cette image
   */
  due(now, dead = false) {
    if (dead) return false;
    if (!(now > this.cfg.snapshotAfter)) return false;
    if (!(now > this.last + this.cfg.snapshotEvery)) return false;
    this.last = now;
    this.taken += 1;
    return true;
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
    // L'attente dure maintenant trois secondes et non deux : deux avant
    // `StartFlashback`, une de plus avant que le plan n'apparaisse.
    const k = Math.min(1, (state.t || 0) / (FLASHBACK.delay + FLASHBACK.prime));
    const e = k * k * (3 - 2 * k);   // lissage aux deux bouts
    return { roll: cfg.roll * e, pitch: cfg.pitch * e, drop: cfg.drop * e };
  }
  if (state.phase === "fondu" || state.phase === "fin") {
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
    // Combien de photos la partie a laissees, au moment ou l'on meurt. C'est
    // une fonction et non un nombre : `kill()` est appele de sept endroits de
    // la boucle, et aucun d'eux n'a a savoir d'ou vient ce compte.
    this.snapshotCount = () => 0;
    this.cause = null;
    this.state = { phase: "fini", frame: -1, alpha: 0, fini: true, t: 0 };
    this.deaths = 0;
    this.byCause = {};
    // `TriggerFlashback` ne part pas a la mort : `PlayerCameraEffectController`
    // l'annonce a la FIN de l'effet de mort (0,3, 3 ou 5 s selon la cause).
    // Avec `attendreEffet`, `kill()` retient le compte de photos et le
    // flashback attend `declencherFlashback()` ; sans, il part tout de suite.
    this.attendreEffet = false;
    this.enAttente = null;
  }

  get dead() { return this.cause !== null; }

  /** @returns true si cette mort est celle qui a pris, false si une autre courait deja */
  /**
   * @param cause     la cause nommee
   * @param snapshots combien de photos la partie a laissees. C'est ce nombre
   *   qui donne sa longueur au flashback : mourir a la deuxieme minute et
   *   mourir a la dix-septieme ne rendent pas la meme sequence.
   */
  kill(cause, snapshots = this.snapshotCount()) {
    if (this.dead) return false;
    this.cause = DEATHS[cause] ? cause : "impact";
    this.deaths += 1;
    this.byCause[this.cause] = (this.byCause[this.cause] || 0) + 1;
    if (this.attendreEffet) this.enAttente = snapshots;
    else this.flashback.start(snapshots);
    return true;
  }

  /** `TriggerFlashback` : la fin de l'effet de mort lance la sequence. */
  declencherFlashback() {
    if (!this.dead || this.enAttente === null) return false;
    this.flashback.start(this.enAttente);
    this.enAttente = null;
    return true;
  }

  /** @returns true a l'image ou la sequence s'acheve : c'est le moment de rejouer */
  update(dt) {
    if (!this.dead) return false;
    if (this.enAttente !== null) {
      // L'effet de mort tient l'ecran ; le flashback n'a pas commence.
      this.state = { phase: "effet", index: -1, frame: -1, alpha: 0, white: 0,
                     fini: false, t: 0 };
      return false;
    }
    this.state = this.flashback.update(dt);
    return this.state.fini;
  }

  revive() {
    this.enAttente = null;
    this.cause = null;
    this.flashback.reset();
    this.state = this.flashback.update(0);
  }

  get label() {
    return this.cause ? (DEATHS[this.cause] || this.cause) : null;
  }
}

/**
 * Le flashback a l'ecran : les photos, le plan qui avance, le voile blanc.
 *
 * Le build affiche ses `RenderTexture` sur un QUAD pose devant la camera du
 * flashback, qui avance de douze unites a une demie pendant la sequence. Ici
 * c'est un canevas plein ecran et une mise a l'echelle : le plan qui se
 * rapproche est une image qui grandit, et c'est la meme chose vue de l'oeil.
 *
 * Le tourbillon et le flou sont rendus par des filtres CSS. Ce ne sont pas les
 * shaders du build — `TwirlEffect` deforme en spirale, `GlowEffect` fait un
 * flou additif a N iterations — mais ils en portent les deux grandeurs, et
 * l'angle comme le nombre d'iterations viennent de l'IL.
 */
export class FlashbackOverlay {
  constructor(root, cfg = FLASHBACK) {
    this.cfg = cfg;
    this.el = document.createElement("div");
    this.el.className = "ow-flashback";
    this.el.hidden = true;
    // Le fond : la camera du flashback efface en NOIR (`clearFlags` 2) et ne
    // voit que le plan porte-image. Sans lui, la scene restait visible autour
    // de la photo, la ou l'alpha ne montre que du noir (docs/132).
    this.fond = document.createElement("div");
    this.fond.className = "ow-flashback-fond";
    this.fond.hidden = true;
    root.appendChild(this.fond);
    // Le canevas porte la photo ; le `div` porte le blanc par-dessus.
    this.canvas = document.createElement("canvas");
    this.canvas.className = "ow-flashback-img";
    this.canvas.width = this.canvas.height = cfg.snapshotSize;
    this.canvas.hidden = true;
    this.ctx = this.canvas.getContext("2d");
    root.appendChild(this.canvas);
    root.appendChild(this.el);
    this.shown = -1;
    /** L'image de fin, quand l'extraction l'a rendue. */
    this.finalImage = null;
  }

  /** `_finalImage` : `FinalFlashbackImage`, posee sur le plan pendant le fondu. */
  setFinalImage(img) { this.finalImage = img || null; }

  /**
   * @param state ce que rend `Flashback.update`
   * @param shots les photos en memoire, la plus ancienne en tete
   */
  update(state, shots = null) {
    const vivant = !!state && !state.fini && state.phase !== "effet";
    this.fond.hidden = !vivant;
    const voile = vivant && state.alpha > 0.001;
    this.el.hidden = !voile;
    if (voile) this.el.style.opacity = String(Math.min(1, state.alpha));

    // Pendant les 0,8 s de blancheur, le build remplace la photo par
    // `_finalImage`, puis par rien du tout une fois la blancheur pleine.
    const finale = vivant && state.white > 0 && state.white < 1;
    const image = finale ? this.finalImage
      : (vivant && state.index >= 0 && shots && shots[state.index]) || null;
    if (!image) { this.canvas.hidden = true; this.shown = -1; return; }

    const cle = finale ? -2 : state.index;
    if (cle !== this.shown) {
      this.shown = cle;
      try {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
      } catch (e) { /* une photo perdue n'arrete pas la sequence */ }
    }
    this.canvas.hidden = false;
    // Le plan va de douze a une demie : ce qu'on voit, c'est une image qui
    // occupe de plus en plus l'ecran. On borne l'agrandissement a ce qui tient
    // — le quad du build sort du champ, un canevas plein ecran, non.
    const k = this.cfg.planeFrom / Math.max(0.01, state.plane || this.cfg.planeFrom);
    this.canvas.style.setProperty("--zoom", (0.55 + 0.45 * Math.min(1, k / 4)).toFixed(3));
    this.canvas.style.setProperty("--twirl", `${(state.twirl || 0).toFixed(2)}deg`);
    // `blurIterations` va de 2 a 32 ; en pixels, c'est ce qui efface l'image
    // pendant que le blanc monte.
    const flou = Math.max(0, (state.glow ?? this.cfg.glowMin) - this.cfg.glowMin);
    this.canvas.style.setProperty("--flou", `${(flou * 0.6).toFixed(1)}px`);
  }
}
