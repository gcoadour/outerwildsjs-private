// La sonde, telle que le build la pose — et il la pose AILLEURS que dans
// `level0`.
//
// docs/08 §1 comptait « le modele de sonde » parmi ce que l'alpha n'a pas :
// « `_probePrefab` n'est pas resolu ». C'etait faux, et faux de la maniere que
// ce depot connait par coeur : personne n'avait regarde. Le pointeur vise
// `sharedassets1.assets:2295`, un prefabrique complet de dix noeuds, et le
// recensement ne le voyait pas parce qu'il ne lisait que `level0`
// ([`docs/60`](../../docs/60-sonde.md)).
//
//   SurveyorProbe        OWRigidbody, ProbeAnchor, ProbeGUI, HighSpeedCollisionSensor, MapMarker
//     Detectors          AlignmentFieldDetector, HazardDetector, SectorDetector, ProbeDestructionMessenger
//     CameraPivot        ProbeHorizonTracker
//       ForwardCamera    ProbeCamera + projecteur (spot, 600, 0,7)
//       RearCamera       projecteur (spot, 600, 0,5), tourne de 180 degres
//     ProbeAudioLoop     la boucle de vol
//     ScanVolume         ProbeScanner, sphere de 30
//     Lantern            ProbeLantern, point, portee 50, eteint
//     Collider           ProbeCollider, sphere de 0,45
//
// Tout ce qui suit est de la logique pure : ni Babylon ni DOM, donc
// `tests/09-jeu.mjs` l'eprouve sans le jeu. `main.js` n'y branche que le rendu
// (maillage, lumieres, camera embarquee) et le lancer de rayon.
//
// @lit ProbeLauncher, ProbeAnchor, ProbeCollider, ProbeLantern, ProbeScanner
// @lit ProbeHorizonTracker, ProbeGUI, ProbeDestructionMessenger, ProbeInfo
// @lit HighSpeedCollisionSensor, SelfDestruct, HideInMapView

/**
 * Les nombres, tous lus dans le build.
 *
 * Ceux du lanceur viennent du CONSTRUCTEUR de `ProbeLauncher` et non de
 * l'instance : les quatre champs ne sont pas serialises, et `composants.mjs`
 * ne montre que les quatre pointeurs de son. C'est ce qui avait fait ecrire
 * « ProbeLauncher n'expose aucune valeur numerique » — vrai de la scene, faux
 * du jeu. Les autres viennent des composants du prefabrique.
 */
export const SONDE = {
  // ProbeLauncher..ctor
  minLaunchSpeed: 40,        // vitesse d'une charge nulle... voir orbitalSpeed
  maxLaunchSpeed: 100,
  minChargeBuffer: 0.15,     // en deca, la charge vaut zero : c'est une pichenette
  chargeRange: 1,            // une seconde pleine pour la charge maximale
  // ProbeLauncher.Update
  retrieveHold: 0.3,         // maintenir pour rappeler
  launchWindow: 5,           // longueur du rayon qui verifie la fenetre de tir
  tutorialWindow: 200,       // tant qu'on ignore comment marchent les sondes
  fastLaunchCharge: 0.6,     // au-dela, le son de lancement change
  // ProbeLauncher.LaunchProbe : le tir a vide vise une ORBITE
  orbitalMargin: 1.1,
  orbitalCap: 2,             // et jamais plus du double de la vitesse circulaire
  // ProbeHorizonTracker. `TrackHorizon(corps, secteur)` ne fait que s'ARMER :
  // `enabled = true`, et les deux references rangees. Tout le travail est dans
  // `FixedUpdate`, avec les cinq nombres ci-dessous. La methode n'a donc rien
  // a porter — une piste qui se ferme a la lecture (docs/119-bruit.md).
  horizonMinPitch: -10,      // la fenetre de tir qui declenche le suivi d'horizon
  horizonMaxPitch: 55,
  horizonMaxCharge: 0.5,
  horizonHeight: 200,        // au-dela de l'horizon + 200, on ne corrige plus
  horizonSlerp: 0.1,         // par pas de physique
  // ProbeCollider. `ActivateCollider` fait TROIS choses, et la deuxieme est
  // la vraie :
  //
  //     collider.enabled = true;
  //     Physics.IgnoreCollision(collider, colliderDuJoueur);
  //     FireEvent("IgnoreProbeCollider", collider);  enabled = false;
  //
  // Le delai de 0,2 s ci-dessous n'empeche pas de se tirer dessus — c'est
  // l'ignorance PERMANENTE du collider du joueur qui le fait. Le delai ne sert
  // qu'a laisser la sonde sortir de la main avant de devenir solide pour le
  // reste du monde, et l'annonce dit aux autres d'en faire autant
  // (`IgnoreProbeCollision.Awake` l'ecoute). Le portage ne fait pas entrer la
  // sonde en collision avec le joueur, ce qui est la meme chose par l'autre
  // bout (docs/121-avis.md).
  colliderDelay: 0.2,
  colliderRadius: 0.45,
  detectorRadius: 0.75,
  // ProbeAnchor
  anchorBackoff: 0.15,       // on recule d'autant du point d'impact prevu
  flightLoopFade: 0.5,
  // ProbeLantern
  lanternRange: 50,          // Light.range du prefabrique : la valeur MAXIMALE
  lanternRamp: 2,            // et elle monte de zero en deux secondes
  // ProbeScanner
  scanRadius: 30,
  // HighSpeedCollisionSensor
  sensorRange: 100,
  // ProbeCamera
  snapshotMax: 512,          // 512 - 448 * t, donc 512 pres et 64 loin
  snapshotSpan: 448,
  snapshotNear: 200,
  snapshotFar: 800,
  cameraFOV: 90,
  forwardSpotIntensity: 0.5, // pendant une photo en vol, et 0,7 au repos
  forwardSpotRest: 0.7,
  rearSpotIntensity: 0.5,
  spotRange: 600,
  // ProbeGUI
  dangerHold: 1,             // un degat de contact tient l'icone rouge une seconde
};

// --- petite algebre, en tableaux [x, y, z] ------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** `Mathf.Sign` rend 1 pour zero, et ce cas se presente : ne pas le « corriger ». */
const signe = (v) => (v < 0 ? -1 : 1);

/** `Vector3.Angle`, en DEGRES comme Unity. */
export function angleEntre(a, b) {
  const c = dot(norm(a), norm(b));
  return Math.acos(c < -1 ? -1 : c > 1 ? 1 : c) * 180 / Math.PI;
}

/** Rotation d'un vecteur autour d'un axe, angle en degres (`Quaternion.AngleAxis`). */
export function tourneAutour(v, axe, degres) {
  const u = norm(axe), r = degres * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return add(add(mul(v, c), mul(cross(u, v), s)), mul(u, dot(u, v) * (1 - c)));
}

// --- le lanceur ---------------------------------------------------------------

/**
 * La fraction de charge : zero tant qu'on n'a pas tenu `minChargeBuffer`.
 *
 * `(t - t0 - 0,15) / (1 - 0,15)`, borne a [0, 1]. Le tampon n'est pas un
 * detail d'affichage : une charge EXACTEMENT nulle est le seul cas ou le
 * lancement calcule une vitesse orbitale (voir `orbitalSpeed`). Une pichenette
 * et un appui d'un dixieme de seconde donnent donc le meme tir, voulu.
 */
export function chargeFraction(tenu, cfg = SONDE) {
  return clamp01((tenu - cfg.minChargeBuffer) / (cfg.chargeRange - cfg.minChargeBuffer));
}

/** `_minLaunchSpeed + charge * (_max - _min)` : 40 a vide, 100 a pleine charge. */
export function launchSpeed(charge, cfg = SONDE) {
  return cfg.minLaunchSpeed + clamp01(charge) * (cfg.maxLaunchSpeed - cfg.minLaunchSpeed);
}

/**
 * L'inclinaison du lanceur par rapport au regard du joueur, SIGNEE.
 *
 * `Vector3.Angle(joueur.forward, lanceur.forward) * Mathf.Sign(Dot(joueur.up,
 * lanceur.forward))`. Positive quand on vise au-dessus de l'horizon du joueur.
 * Elle sert deux fois : a corriger la vitesse orbitale, et a decider si la
 * sonde suit l'horizon.
 */
export function launchPitch(avantJoueur, hautJoueur, avantLanceur) {
  return angleEntre(avantJoueur, avantLanceur) * signe(dot(hautJoueur, avantLanceur));
}

/**
 * Le tir a vide vise une orbite, et c'est la plus jolie ligne du lanceur.
 *
 * `sqrt(g * r) * 1,1` est la vitesse circulaire a la distance du centre, plus
 * dix pour cent. Vise-t-on vers le haut ? On divise par le cosinus de
 * l'inclinaison — pour que la composante horizontale reste orbitale — sans
 * jamais depasser le double, puis on plafonne a `_maxLaunchSpeed`.
 *
 * Consequence a ne pas gommer : une pichenette pres d'un gros corps part PLUS
 * vite qu'une charge moyenne. Ce n'est pas une incoherence, c'est le geste que
 * le jeu recompense — jeter la sonde en orbite d'un coup de poignet.
 *
 * @param g   norme de l'acceleration du champ, a l'endroit de la sonde
 * @param r   distance au centre du puits de gravite
 */
export function orbitalSpeed(g, r, pitch, cfg = SONDE) {
  let v = Math.sqrt(g * r) * cfg.orbitalMargin;
  if (pitch > 0) {
    v = Math.min(v / Math.cos(pitch * Math.PI / 180), v * cfg.orbitalCap);
  }
  return Math.min(v, cfg.maxLaunchSpeed);
}

/**
 * La fenetre de tir : tant qu'on ignore comment marchent les sondes, il faut
 * DEUX CENTS metres devant soi ; ensuite cinq suffisent.
 *
 * Le nombre surprend jusqu'a ce qu'on voie a quoi il sert : la premiere sonde
 * de la partie est celle qui apprend le geste, et le jeu refuse de la laisser
 * partir dans un mur ou elle ne montrerait rien.
 */
/**
 * `ProbeLauncher.CheckLaunchWindow(distance)` tient en une ligne :
 *
 *     return Physics.Raycast(transform.position, transform.forward,
 *                            distance, OWLayerMask.GetPhysicalMask());
 *
 * UN RAYON, DEPUIS LE LANCEUR, LE LONG DE SON AVANT — pas depuis l'oeil, et
 * pas dans un cone. Et il rend VRAI quand la fenetre est BOUCHEE : le nom
 * trompe, et c'est l'appelant qui refuse le tir. Le masque est celui des
 * couches physiques, donc les declencheurs ne comptent pas.
 *
 * Ce module lui passe la longueur ci-dessous, qui est la seule chose qui
 * change entre un joueur qui sait se servir d'une sonde et un qui l'ignore.
 */
export function launchWindowLength(sait, cfg = SONDE) {
  return sait ? cfg.launchWindow : cfg.tutorialWindow;
}

/**
 * Le suivi d'horizon ne s'arme que sur un tir tendu, et jamais depuis le
 * poste de pilotage.
 */
export function tracksHorizon(charge, pitch, auPoste, rayonHorizon, cfg = SONDE) {
  return !auPoste && charge < cfg.horizonMaxCharge
    && pitch > cfg.horizonMinPitch && pitch < cfg.horizonMaxPitch
    && rayonHorizon > 0;
}

/**
 * Ou viser pour rester tangent a l'horizon du secteur.
 *
 * `d` va de la sonde au centre du secteur, `R` est le rayon d'horizon. Le
 * point de tangence est a `sqrt(|d|^2 - R^2)` dans la direction de `d`
 * tournee de `asin(R / |d|)` autour de `d x v`. Au-dela de `R + 200`, ou en
 * deca de `R`, on ne corrige rien : la sonde est trop loin pour que la
 * correction ait un sens, ou deja sous l'horizon.
 *
 * @returns la direction a viser, ou null s'il n'y a rien a corriger
 */
export function horizonAim(centreSecteur, posSonde, vitesseRelative, rayon, cfg = SONDE) {
  const d = sub(centreSecteur, posSonde);
  const dist = len(d);
  const hauteur = dist - rayon;
  if (hauteur <= 0 || hauteur > cfg.horizonHeight) return null;
  const theta = Math.asin(Math.min(1, rayon / dist));       // en radians
  const tangente = dist * Math.cos(theta);
  const axe = cross(d, vitesseRelative);
  if (len(axe) === 0) return null;
  return tourneAutour(mul(norm(d), tangente), axe, theta * 180 / Math.PI);
}

/**
 * La detection de collision imminente : un rayon de cent metres devant, et la
 * question « ce pas de physique nous fait-il DEPASSER le point touche ? ».
 *
 * `Project(vitesseRelative, versLeChoc)` puis comparaison de sa norme fois
 * `dt` a la distance. La vitesse relative est celle de la CIBLE moins la
 * notre, d'ou le signe : on s'approche quand la projection est dirigee vers
 * nous. La norme suffit — le build ne teste pas le sens, et une cible qui
 * s'eloigne aussi vite qu'on l'approche declencherait donc l'evenement. C'est
 * son comportement, pas une simplification.
 */
export function impendingCollision(versLeChoc, vitesseSonde, vitesseCible, dt) {
  const rel = sub(vitesseCible, vitesseSonde);
  const d = len(versLeChoc);
  if (d === 0) return true;
  const u = mul(versLeChoc, 1 / d);
  return Math.abs(dot(rel, u)) * dt > d;
}

// --- la sonde posee -----------------------------------------------------------

/** `ProbeLantern.Update` : la portee monte de zero au maximum en deux secondes. */
export function lanternRange(depuis, max = SONDE.lanternRange, cfg = SONDE) {
  return max * clamp01(depuis / cfg.lanternRamp);
}

/**
 * `ProbeCamera.Update` : la definition de la photo FOND avec la distance.
 *
 * 512 pixels a deux cents metres, 64 a mille. C'est un entier — le build
 * tronque — et la texture est carree.
 */
export function snapshotSize(distance, cfg = SONDE) {
  const t = clamp01((distance - cfg.snapshotNear) / cfg.snapshotFar);
  return Math.trunc(cfg.snapshotMax - cfg.snapshotSpan * t);
}

/**
 * L'icone du marqueur de sonde : danger, ancre, ou simple reperage.
 *
 * Le danger l'emporte, et il tient encore une seconde apres un degat de
 * contact — `_isTakingInstantDamage` ne retombe pas a la fin du degat mais a
 * la fin de la seconde.
 */
export function probeIcon(degatsParSeconde, contactIlYA, ancree) {
  if (degatsParSeconde > 0 || (contactIlYA !== null && contactIlYA < SONDE.dangerHold)) {
    return "danger";
  }
  return ancree ? "anchor" : "locator";
}

/**
 * Le texte du marqueur. Les espaces et les retours a la ligne sont ceux du
 * build : `" 42m"`, puis une ligne par renseignement.
 */
export function probeReadout(distance, integrite = null, renseignements = []) {
  let t = ` ${Math.round(distance)}m`;
  if (integrite !== null) t += `\n Crust Integrity: ${integrite}%`;
  for (const r of renseignements) t += `\n ${r}`;
  return t;
}

/**
 * Ou poser le marqueur a l'ecran. L'origine de `GUI` est en HAUT a gauche
 * quand celle de `WorldToScreenPoint` est en bas : d'ou la soustraction a la
 * hauteur, et les trente pixels qui remontent l'etiquette au-dessus du point.
 *
 * @returns {x, y} en pixels, ou null si la sonde est derriere la camera
 */
export function probeLabelPos(ecran, hauteurCamera, icone) {
  if (!ecran || ecran.z <= 0) return null;
  return { x: ecran.x - icone.width / 2,
           y: hauteurCamera - ecran.y - icone.height / 2 - 30 };
}

/**
 * `SelfDestruct` : dix instances dans le build, aucune dans `level0`. Une
 * seconde par defaut, deux pour le geyser du prefabrique de sonde.
 */
export function selfDestructed(depuis, delai = 1) { return depuis > delai; }

/**
 * Une sonde en vol, puis posee.
 *
 * L'integration est celle du portage — le champ dominant, comme le joueur —
 * et non un `Rigidbody` : c'est deja le choix de `gravity.js`, et le build
 * n'applique a la sonde aucune force que le champ ne donne pas.
 */
export class Probe {
  /**
   * @param pos      [x, y, z] du lanceur
   * @param avant    direction de tir, normalisee
   * @param vitesse  vitesse initiale complete (celle du joueur comprise)
   */
  constructor(pos, avant, vitesse, cfg = SONDE) {
    this.cfg = cfg;
    this.pos = [...pos];
    this.vel = [...vitesse];
    this.forward = norm(avant);
    this.age = 0;
    // ProbeCollider.Start : desactive, et il ne s'allume qu'au bout de 0,2 s.
    // Sans ce delai la sonde percute le joueur qui vient de la lancer.
    this.colliderOn = false;
    this.anchored = false;
    this.anchorAge = 0;
    // ProbeAnchor.AttachToObject : le corps touche, pour suivre ce qui bouge
    this.attachedTo = null;
    this.localImpact = null;
    this.breakableFragment = null;
    this.probeInfos = [];
    // ProbeScanner
    this.poi = [];
    this.closestPOI = null;
    // ProbeHorizonTracker : arme au lancement, desarme a l'ancrage
    this.tracking = null;
    // ProbeAnchor : la boucle de vol s'eteint en une demi-seconde
    this.flightLoop = 1;
  }

  /** `ProbeLantern` : eteinte en vol, elle monte a 50 en deux secondes une fois posee. */
  get lantern() {
    return this.anchored ? lanternRange(this.anchorAge, this.cfg.lanternRange, this.cfg) : 0;
  }

  /**
   * L'ancrage. `AttachToObject` fait sept choses, et l'ordre importe peu sauf
   * pour la derniere : l'evenement `ProbeAnchorToSurface` allume la lanterne
   * et desarme le suivi d'horizon, donc il vient apres.
   *
   * @param normale  la normale de la surface : la sonde plante son NEZ dedans
   */
  anchor(normale, cible = null, infos = [], fragment = null) {
    if (this.anchored) return false;
    this.anchored = true;
    this.anchorAge = 0;
    this.attachedTo = cible;
    this.breakableFragment = fragment;
    this.probeInfos = infos;
    this.tracking = null;
    // `Quaternion.FromToRotation(forward, -normale)` : l'avant de la sonde
    // regarde vers la surface, pas dans le sens du vol.
    this.forward = mul(norm(normale), -1);
    this.vel = [0, 0, 0];
    // `_localImpactPos` est une position LOCALE : c'est elle qui fait suivre
    // la sonde quand le corps touche tourne ou orbite. Sans conversion — un
    // corps qui n'en propose pas — on retombe sur le monde, et la sonde reste
    // ou elle s'est plantee.
    this.localImpact = cible && cible.worldToLocal
      ? cible.worldToLocal(this.pos) : [...this.pos];
    return true;
  }

  /**
   * @param dt
   * @param ctx  { field, raycast, sectorCenter, sectorRadius, sectorVelocity }
   *             `raycast(depuis, direction, portee)` rend
   *             `{ point, normal, dynamic, target, infos, fragment }` ou null.
   */
  step(dt, ctx = {}) {
    this.age += dt;
    if (this.anchored) {
      this.anchorAge += dt;
      this.flightLoop = Math.max(0, this.flightLoop - dt / this.cfg.flightLoopFade);
      // ProbeAnchor.Update : la position locale est FIGEE, ce qui suit le
      // corps touche s'il tourne ou orbite.
      if (this.attachedTo && this.attachedTo.localToWorld) {
        this.pos = this.attachedTo.localToWorld(this.localImpact);
      }
      return this;
    }
    if (!this.colliderOn && this.age >= this.cfg.colliderDelay) this.colliderOn = true;

    const f = ctx.field;
    if (f) {
      const a = mul([f.dir.x, f.dir.y, f.dir.z], f.magnitude * dt);
      this.vel = add(this.vel, a);
    }
    // ProbeHorizonTracker.FixedUpdate : le pivot de camera s'incline vers le
    // point de tangence, d'un dixieme par pas. Il ne touche PAS a la
    // trajectoire — c'est un pivot de camera, et le portage a failli en faire
    // une force.
    if (this.tracking && ctx.sectorCenter) {
      const rel = sub(ctx.sectorVelocity || [0, 0, 0], this.vel);
      const vise = horizonAim(ctx.sectorCenter, this.pos, rel, ctx.sectorRadius || 0, this.cfg);
      if (vise) {
        const cible = norm(vise);
        this.forward = norm(add(mul(this.forward, 1 - this.cfg.horizonSlerp),
                                mul(cible, this.cfg.horizonSlerp)));
      }
    }

    const pas = mul(this.vel, dt);
    const parcours = len(pas);
    let touche = null, pose = null;
    if (ctx.raycast) {
      // Deux detections, comme le build. Le collider continu de Unity
      // (`m_CollisionDetection` 2) balaie le DEPLACEMENT : ici, un rayon sur
      // le pas, et la sonde se pose AU point touche. `OnCollisionEnter`.
      if (this.colliderOn && parcours > 0) {
        const h = ctx.raycast(this.pos, mul(pas, 1 / parcours), parcours);
        if (h) { touche = h; pose = h.point; }
      }
      // `HighSpeedCollisionSensor`, lui, regarde cent metres droit DEVANT —
      // pas le long du pas — et sert quand la vitesse depasse ce que le
      // balayage rattrape. `OnImpendingCollision` recule alors de 0,15 sur
      // l'avant : sans ce retrait la sonde se pose DANS le decor.
      if (!touche) {
        const h = ctx.raycast(this.pos, this.forward, this.cfg.sensorRange);
        if (h && !h.dynamic) {
          const vers = sub(h.point, this.pos);
          if (impendingCollision(vers, this.vel, h.velocity || [0, 0, 0], dt)) {
            touche = h;
            pose = sub(h.point, mul(this.forward, this.cfg.anchorBackoff));
          }
        }
      }
    }
    if (touche) {
      this.pos = pose || this.pos;
      this.anchor(touche.normal || mul(norm(this.vel), -1), touche.target || null,
                  touche.infos || [], touche.fragment || null);
      return this;
    }
    this.pos = add(this.pos, pas);
    return this;
  }

  /**
   * `ProbeScanner` : ce qui entre dans la sphere de trente, et le plus proche.
   *
   * @vide aucun `PointOfInterest` dans le build — les cinq fichiers serialises
   * en comptent ZERO, `ProbeScanner.GetClosestPOI` n'est appele par personne, et
   * `PointOfInterest.CaughtOnCamera` a un corps vide. Le volume de scan est bien
   * pose sur le prefabrique de la sonde (`ScanVolume`, sharedassets1), mais il
   * n'a rien a detecter : c'est un chantier de l'alpha, pas une mecanique.
   */
  // @vide aucun PointOfInterest n'est pose dans ce build
  scan(points) {
    this.poi = points.filter((p) => len(sub(p.pos, this.pos)) <= this.cfg.scanRadius);
    let best = null, d = Infinity;
    for (const p of this.poi) {
      const dd = len(sub(p.pos, this.pos));
      if (dd < d) { d = dd; best = p; }
    }
    this.closestPOI = best;
    return best;
  }
}

/**
 * Le lanceur : une sonde a la fois, chargee a l'appui et rappelee au maintien.
 *
 * `_activeProbe` n'est pas une liste. Tant qu'une sonde est en vol ou posee,
 * la touche de lancement ne lance RIEN — c'est la touche de rappel qui agit.
 * Le portage en gardait un tableau et en lancait autant qu'on voulait ; c'est
 * la difference de jeu la plus visible de ce lot.
 */
export class ProbeLauncher {
  constructor(cfg = SONDE) {
    this.cfg = { ...SONDE, ...cfg };
    this.probe = null;
    this.charging = false;
    this.chargeStart = 0;
    this.retrievePressed = false;
    this.retrieveStart = 0;
    // `GetButtonDown`, pas `GetButton` : sans ce front, un joueur qui garde la
    // touche enfoncee devant un mur emet un « tir refuse » a chaque image.
    this.launchWasDown = false;
    this.altWasDown = false;
    this.launched = 0;
    // La derniere photo prise : sa definition et le cote vise.
    this.lastSnapshot = null;
    this.now = 0;
    // ce que le dernier pas a produit, pour que l'appelant le sonorise
    this.events = [];
  }

  get charge() {
    return this.charging ? chargeFraction(this.now - this.chargeStart, this.cfg) : 0;
  }

  get active() { return this.probe ? 1 : 0; }
  get last() { return this.probe; }

  /**
   * Un pas d'interaction.
   *
   * @param dt
   * @param input  { launch, retrieve, alt } etats MAINTENUS.
   *
   *   `launchProbe`, `takeSnapshot` et `retrieveProbe` sont TROIS statiques
   *   d'`OWInput` construites sur le MEME canal, `InputChannels.probe` — une
   *   seule touche, la droite de la souris. `reverseSnapshot` est la seule
   *   separee (`altProbe`, la touche R). D'ou une interaction a trois etages
   *   sur un bouton : rien en vol, une photo au relachement quand la sonde est
   *   posee, un rappel au maintien de trois dixiemes. Le portage garde deux
   *   champs parce que le build garde deux statiques ; `main.js` leur donne la
   *   meme touche, comme le build.
   *
   * @param monde  {
   *   pos, forward, up,            le lanceur (porte par la camera du joueur)
   *   playerForward, playerUp, playerVelocity,
   *   knowsProbes, insideShip, atFlightConsole,
   *   raycast, field, wellCenter,  pour la fenetre de tir et l'orbite
   *   sectorCenter, sectorRadius, sectorVelocity
   * }
   */
  update(dt, input = {}, monde = {}) {
    this.now += dt;
    this.events = [];
    const launchDown = !!input.launch && !this.launchWasDown;
    const launchUp = !input.launch && this.launchWasDown;
    this.launchWasDown = !!input.launch;
    const altDown = !!input.alt && !this.altWasDown;
    this.altWasDown = !!input.alt;
    if (this.probe) {
      // `ProbeCamera.Update` : la photo part a l'APPUI quand la sonde vole, et
      // au RELACHEMENT quand elle est posee. Le second cas est ce qui rend le
      // bouton unique jouable : un appui bref sur une sonde plantee
      // photographie, un appui long la rappelle, et les deux ne se marchent pas
      // dessus parce qu'a trois dixiemes la sonde n'existe plus.
      if ((!this.probe.anchored && launchDown) || (this.probe.anchored && launchUp)) {
        this.snapshot(monde, false);
      } else if (altDown) {
        this.snapshot(monde, true);
      }
      // Rappel : il faut MAINTENIR trois dixiemes de seconde. Un appui bref ne
      // fait rien — ce qui laisse la touche libre pour autre chose.
      if (input.retrieve && !this.retrievePressed) {
        this.retrievePressed = true;
        this.retrieveStart = this.now;
      } else if (!input.retrieve) {
        this.retrievePressed = false;
      }
      if (this.retrievePressed && this.now > this.retrieveStart + this.cfg.retrieveHold) {
        this.retrievePressed = false;
        this.probe = null;
        this.events.push("RetrieveProbe", "ProbeDestroyed");
      }
    } else if (!this.charging) {
      if (launchDown) {
        const portee = launchWindowLength(!!monde.knowsProbes, this.cfg);
        const bloque = monde.raycast
          ? !!monde.raycast(monde.pos, monde.forward, portee) : false;
        const dansLeVaisseau = !!monde.insideShip && !monde.atFlightConsole;
        if (bloque || dansLeVaisseau) {
          this.events.push("ProbeLaunchAborted");
        } else {
          this.charging = true;
          this.chargeStart = this.now;
        }
      }
    } else if (!input.launch) {
      this.launch(monde);
    }
    if (this.probe) this.probe.step(dt, monde);
    return this.probe;
  }

  /**
   * `ProbeCamera.Update` : la photo. Sa definition FOND avec la distance au
   * joueur — 512 pixels a deux cents metres, 64 a mille — et la sonde en vol
   * allume son projecteur avant a 0,5 le temps du cliche.
   */
  snapshot(monde = {}, arriere = false) {
    if (!this.probe) return null;
    const d = Math.hypot(this.probe.pos[0] - (monde.playerPos || monde.pos || [0, 0, 0])[0],
                         this.probe.pos[1] - (monde.playerPos || monde.pos || [0, 0, 0])[1],
                         this.probe.pos[2] - (monde.playerPos || monde.pos || [0, 0, 0])[2]);
    const taille = snapshotSize(d, this.cfg);
    this.lastSnapshot = { size: taille, rear: arriere, distance: d,
                          anchored: this.probe.anchored };
    this.events.push("ProbeSnapshot");
    if (arriere) this.events.push("RearviewProbeSnapshot");
    if (!this.probe.anchored) this.events.push("MidairProbeSnapshot");
    return this.lastSnapshot;
  }

  /** `LaunchProbe` : la vitesse, le suivi d'horizon, le son. */
  launch(monde = {}) {
    const charge = this.charge;
    this.charging = false;
    const avant = norm(monde.forward || [0, 0, 1]);
    let v = launchSpeed(charge, this.cfg);
    const pitch = launchPitch(monde.playerForward || avant, monde.playerUp || [0, 1, 0], avant);
    // La pichenette : `charge == 0` exactement, donc tout appui de moins de
    // 0,15 s. Il faut un puits de gravite pour que le calcul ait un sens ;
    // sans lui, on garde les quarante de base.
    if (charge === 0 && monde.field && monde.wellCenter) {
      const r = len(sub(monde.wellCenter, monde.pos || [0, 0, 0]));
      const g = Math.abs(monde.field.magnitude || 0);
      if (r > 0 && g > 0) v = orbitalSpeed(g, r, pitch, this.cfg);
    }
    const sonde = new Probe(monde.pos || [0, 0, 0], avant,
                            add(monde.playerVelocity || [0, 0, 0], mul(avant, v)), this.cfg);
    if (tracksHorizon(charge, pitch, !!monde.atFlightConsole,
                      monde.sectorRadius || 0, this.cfg)) {
      sonde.tracking = true;
    }
    this.probe = sonde;
    this.launched += 1;
    this.events.push("LaunchProbe",
                     charge > this.cfg.fastLaunchCharge ? "ProbeLaunch_HighPower"
                                                        : "ProbeLaunch_LowPower");
    return sonde;
  }
}
