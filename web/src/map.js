// Carte du systeme solaire.
//
// Constantes de MapController : distance de zoom par defaut 40 000, minimum
// 10 000. Types de marqueurs de MapMarker : Default, Planet, Moon, Sun, Player,
// Probe, Ship.
//
// Vue de dessus en projection orthographique sur le plan XZ, ce qui suffit ici :
// toutes les orbites du systeme sont pratiquement coplanaires.

// @lit MapMarker, MapController
// Les marqueurs declares et le zoom de la carte.

export const ZOOM_DEFAULT = 40000;
export const ZOOM_MIN = 10000;
/** Ce que `MapController` pose en ouvrant et en fermant la carte. */
export const MAP = {
  defaultZoom: ZOOM_DEFAULT,      // `_defaultZoomDist`
  minZoom: ZOOM_MIN,              // `_minZoomDistance`
  // `* 0.7f` : les sept dixiemes du cadrage exact joueur-cible.
  fitFactor: 0.7,
  // `_lastPlayAudioTime + 10f` : le son d'ouverture a dix secondes de garde.
  audioCooldown: 10,
  // La duree passee par l'appelant — `EnterMapView(2f, 0,02f, ...)` a la
  // touche, `(10f, 0,01f)` depuis l'observatoire —, et celle que la cible
  // IMPOSE. Le portage ecrivait 1 : une duree qu'il ne jouait pas.
  zoomDuration: 2,
  rotationRate: 0.02,
  observatoryZoomDuration: 10,
  observatoryRotationRate: 0.01,
  targetZoomDuration: 0.6,
  // Le champ dont depend le cadrage : `base.camera.fieldOfView`, celui de
  // `MapCamera` (60), et non celui du joueur (70) que le portage prenait.
  fov: 60,
  // `MapCamera` : plan lointain, plan proche de depart et sa course.
  far: 100000,
  nearStart: 0.1,
  nearTravel: 5,
};

// --- la camera de la carte : `MapController.LateUpdate` -----------------------
//
// La carte du build n'est pas un dessin : c'est `MapCamera`, une vraie camera
// (champ de 60 degres, plan lointain a 100 000) qui s'eleve de l'oeil du joueur
// jusqu'a la vue plongeante sur le plan du systeme. `LateUpdate`, a chaque
// image de carte :
//
//   t = SmoothStep(0, 1, (Time.time - _initZoomTime) / _zoomDuration)
//   camera.nearClipPlane = 0,1 + 5 t
//   si t >= 0,5 : _focalOffset.xz += pan x _zoomDistance x dt
//   position = Lerp(joueur, soleil + _focalOffset + (0, _zoomDistance, 0), t)
//   r = FromToRotation(avant, bas) x rotation
//   rotation = Lerp(rotation, r, t)
//   r = FromToRotation(haut, +Z) x r
//   rotation = Slerp(rotation, r, _rotationRate)
//
// A la touche, `doRotation` est faux : la rotation de depart est deja la vue
// plongeante, haut de l'ecran vers +Z. Depuis l'observatoire, elle part du
// regard du joueur. Le portage ouvrait un calque dessine par-dessus la scene,
// d'un coup.

/** `Mathf.SmoothStep(0, 1, t)`. */
export function smoothStep01(t) {
  const u = Math.max(0, Math.min(1, t));
  return -2 * u * u * u + 3 * u * u;
}

// Quaternions (x, y, z, w), conventions d'Unity — celles de Babylon aussi,
// les deux reperes etant de main gauche.
export function qMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by,
          aw * by - ax * bz + ay * bw + az * bx,
          aw * bz + ax * by - ay * bx + az * bw,
          aw * bw - ax * bx - ay * by - az * bz];
}

export function qRot(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty),
          v[1] + w * ty + (z * tx - x * tz),
          v[2] + w * tz + (x * ty - y * tx)];
}

const unitaire = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const qNorm = (q) => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map((x) => x / n); };

/** `Quaternion.FromToRotation(de, vers)`. */
export function qFromTo(de, vers) {
  const a = unitaire(de), b = unitaire(vers);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // Demi-tour : n'importe quel axe orthogonal fait l'affaire.
    let ax = [0, -a[2], a[1]];
    if (Math.hypot(ax[0], ax[1], ax[2]) < 1e-6) ax = [-a[2], 0, a[0]];
    ax = unitaire(ax);
    return [ax[0], ax[1], ax[2], 0];
  }
  return qNorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0], 1 + d]);
}

/** `Quaternion.Lerp` : interpolation normalisee, par le plus court chemin. */
export function qLerp(a, b, t) {
  const u = Math.max(0, Math.min(1, t));
  const s = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) < 0 ? -1 : 1;
  return qNorm(a.map((x, i) => x * (1 - u) + s * b[i] * u));
}

/** `Quaternion.Slerp`. */
export function qSlerp(a, b, t) {
  const u = Math.max(0, Math.min(1, t));
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = b.map((x) => -x); }
  if (d > 0.9995) return qLerp(a, bb, u);
  const th = Math.acos(d), sn = Math.sin(th);
  const ka = Math.sin((1 - u) * th) / sn, kb = Math.sin(u * th) / sn;
  return a.map((x, i) => x * ka + bb[i] * kb);
}

/** `Quaternion.LookRotation(avant, haut)`. */
export function qLookRotation(avant, haut) {
  const f = unitaire(avant);
  let r = [haut[1] * f[2] - haut[2] * f[1], haut[2] * f[0] - haut[0] * f[2],
           haut[0] * f[1] - haut[1] * f[0]];
  if (Math.hypot(r[0], r[1], r[2]) < 1e-9) return qFromTo(AVANT_Z, f);
  r = unitaire(r);
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  // Colonnes : droite, haut, avant.
  const m00 = r[0], m01 = u[0], m02 = f[0];
  const m10 = r[1], m11 = u[1], m12 = f[1];
  const m20 = r[2], m21 = u[2], m22 = f[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const k = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / k, (m02 - m20) / k, (m10 - m01) / k, 0.25 * k];
  } else if (m00 > m11 && m00 > m22) {
    const k = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * k, (m01 + m10) / k, (m02 + m20) / k, (m21 - m12) / k];
  } else if (m11 > m22) {
    const k = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / k, 0.25 * k, (m12 + m21) / k, (m02 - m20) / k];
  } else {
    const k = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / k, (m12 + m21) / k, 0.25 * k, (m10 - m01) / k];
  }
  return qNorm(q);
}

const BAS = [0, -1, 0], AVANT_Z = [0, 0, 1], HAUT_Y = [0, 1, 0];
const identite = (v) => v;

export class VueCarte {
  constructor() {
    this.open = false;
    this.rotation = [0, 0, 0, 1];
    this.position = [0, 0, 0];
    this.near = MAP.nearStart;
    this.t = 0;
    this.initTime = 0;
    this.zoomDuration = MAP.zoomDuration;
    this.rotationRate = MAP.rotationRate;
    this.promptsShown = false;
  }

  /**
   * `EnterMapView`. `regard` est la rotation de la camera active : avec
   * `doRotation`, on part de ce regard tourne vers le bas ; sans, de la vue
   * plongeante, haut de l'ecran vers +Z.
   */
  entrer({ now, zoomDuration = MAP.zoomDuration, rotationRate = MAP.rotationRate,
           doRotation = false, regard = [0, 0, 0, 1], versRepere = identite }) {
    this.open = true;
    this.initTime = now;
    this.zoomDuration = zoomDuration;
    this.rotationRate = rotationRate;
    this.promptsShown = false;
    this.t = 0;
    // Le bas et l'avant du MONDE, exprimes dans le repere de travail — qui
    // tourne avec le corps ancre (spin.js). `Vector3.down` n'est le bas du
    // repere qu'a l'instant zero.
    const bas = versRepere(BAS);
    this.rotation = doRotation
      ? qMul(qFromTo(qRot(regard, AVANT_Z), bas), regard)
      : qLookRotation(bas, versRepere(AVANT_Z));
  }

  sortir() { this.open = false; this.promptsShown = false; this.t = 0; }

  /**
   * Une image de `LateUpdate`, pour la camera. `zoom` et `focal` sont ceux de
   * `SolarMap` : la distance, et le decalage (x, z) du point vise depuis le
   * Soleil.
   *
   * @returns { t, position, rotation, near, montrer } — `montrer` vaut vrai a
   *          l'image ou les invites apparaissent (t atteint 1).
   */
  etape(now, joueur, soleil, zoom, focal, versRepere = identite) {
    const t = smoothStep01((now - this.initTime) / (this.zoomDuration || 1));
    this.t = t;
    this.near = MAP.nearStart + t * MAP.nearTravel;
    const d = versRepere([focal[0], zoom, focal[1]]);
    const vers = [soleil[0] + d[0], soleil[1] + d[1], soleil[2] + d[2]];
    this.position = joueur.map((x, i) => x + (vers[i] - x) * t);
    let r = qMul(qFromTo(qRot(this.rotation, AVANT_Z), versRepere(BAS)), this.rotation);
    this.rotation = qLerp(this.rotation, r, t);
    // `transform.up` : celui de la rotation DEJA interpolee, pas celui de r.
    r = qMul(qFromTo(qRot(this.rotation, HAUT_Y), versRepere(AVANT_Z)), r);
    this.rotation = qSlerp(this.rotation, r, this.rotationRate);
    let montrer = false;
    if (!this.promptsShown && t >= 1) { this.promptsShown = true; montrer = true; }
    return { t, position: this.position, rotation: this.rotation, near: this.near, montrer };
  }
}
// MapMarker et IconGenerator.GenerateSquareBracket
export const MARKER_ICON = 20;
export const MARKER_LINE = 1;
export const BRACKET_RATIO = 0.25;
export const MARKER_FONT = 14;
export const MARKER_MIN_SCREEN = 10;
// MapMarker n'emploie que deux couleurs : le blanc par defaut, et le VERT pour
// ce qui appartient au joueur — lui-meme, son vaisseau, sa sonde. La palette
// coloree que j'avais inventee etait plus lisible mais n'etait pas la sienne.
const COLORS = {
  Sun: "#ffffff", Planet: "#ffffff", Moon: "#ffffff", Default: "#ffffff",
  Player: "#00ff00", Ship: "#00ff00", Probe: "#00ff00",
};

/**
 * LES ORBITES DE LA CARTE ONT UNE COULEUR CHACUNE (`MapOpenGL`).
 *
 * `MapOpenGL.Start` range cinq corps et cinq couleurs dans le meme ordre —
 * `_planetRadiusArray` et `_lineColors` — et `OnPostRender` trace un cercle par
 * corps, de cinq degres en cinq degres, dans la couleur correspondante. Le
 * portage tracait tout d'un meme gris invente.
 *
 * L'ordre du build, qui est aussi celui de la page :
 *
 *   0 TimberHearth   1 FocalBody (les jumelles)   2 BrittleHollow
 *   3 GiantsDeep     4 DarkBramble
 *
 * L'alpha commune vaut 0,50980 — 130 sur 255 — et c'est elle qui rend la
 * carte lisible sous les marqueurs.
 */
export const ORBIT_COLORS = [
  { body: "TimberHearth_Body", rgb: [0.545098, 0.760511, 1] },
  { body: "FocalBody", rgb: [1, 0.973871, 0.592157] },
  { body: "BrittleHollow_Body", rgb: [0.815686, 0.508604, 0.508604] },
  { body: "GiantsDeep_Body", rgb: [0.6, 1, 0.916434] },
  { body: "DarkBramble_Body", rgb: [0.502622, 0.796078, 0.523875] },
];
export const ORBIT_ALPHA = 0.509804;
/** `_cometColor` : la comete n'est pas dans le tableau, elle a son trace a part. */
export const COMET_COLOR = [0.760784, 1, 0.986007];

/**
 * L'ELLIPSE DE LA COMETE, et pourquoi ce sont deux nombres et non une formule.
 *
 * `MapOpenGL.Start` demande ses demi-axes a
 * `InitialMotion.GetOrbitEllipseSemiAxes`, qui applique la formule de
 * vis-viva — donc une gravite KEPLERIENNE, alors que le champ de ce jeu a un
 * falloff lineaire (docs/04-gravite.md). C'est une approximation que le build
 * fait pour DESSINER, pas le modele qu'il simule.
 *
 *   mu = masse x 0,001               le Soleil pese 20 000 000, donc mu = 20 000
 *   a  = 1 / (2/r - v^2/mu)
 *   e  = (r - a) / a                 le corps part de son apside
 *   b  = a x sqrt(1 - e^2)
 *   c  = sqrt(a^2 - b^2)             `_fociDistance`
 *
 * Refaite ici sur la scene — comete a 24 000 du Soleil, `_orbitImpulseScalar`
 * a -0,425 — elle rend a = 13 191 et b = 7 562, soit un demi-pour-cent des
 * valeurs que le CONSTRUCTEUR de `MapOpenGL` porte en dur. Ces deux-la sont
 * donc le meme calcul, fait par le studio sur cette comete-ci, et c'est elles
 * qu'on garde : une valeur du build vaut mieux qu'une formule qui l'approche.
 */
export const COMET_ELLIPSE = { a: 13197.6904296875, b: 7582.1591796875 };

/** `_fociDistance` : le decalage du foyer, ou le Soleil se tient. */
export function fociDistance(e = COMET_ELLIPSE) {
  return Math.sqrt(Math.max(0, e.a * e.a - e.b * e.b));
}

/** `GL.Color` sur un `Color` d'Unity, rendu en CSS. */
export function orbitStyle(rgb, alpha = ORBIT_ALPHA) {
  const q = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${q(rgb[0])},${q(rgb[1])},${q(rgb[2])},${alpha.toFixed(3)})`;
}

// `MarkerType`, lu dans la table Constant de l'assembly.
export const MARKER_TYPES = ["Default", "Planet", "Moon", "Sun", "Player", "Probe", "Ship"];

// _maxDisplayDistance par type de marqueur, lu dans la TABLE DE SAUT de
// `MapMarker.Awake` — et non dans l'ordre des blocs, qui dit autre chose
// (docs/46). Le soleil est toujours visible, une lune seulement a 5 000.
//
// Le cas du joueur n'est pas une distance mais une sortie anticipee : son
// `LateUpdate` rend avant tous les tests des que le marqueur est devant la
// camera. `Infinity` est la facon d'ecrire cela ici.
export const MARKER_MAX_DISTANCE = {
  Default: 5000, Planet: 50000, Moon: 5000, Sun: 1e10,
  Player: Infinity, Probe: 50000, Ship: 50000,
};

/**
 * Les marqueurs que le build POSE, avec leurs vrais noms de jeu.
 *
 * Le portage deduisait le type de la gravite du corps et affichait le nom
 * interne : `Comet_Body` la ou le jeu ecrit « The Nomad », `VolcanicMoon_Body`
 * pour « Devil's Furnace », `Moon_Body` pour « Lunar Lookout ». Les treize
 * marqueurs sont declares, et l'un d'eux — « Giant's Landing » — n'est meme pas
 * un corps : c'est une ILE, que la deduction par gravite ne pouvait pas trouver.
 */
export function mapMarkers(gameplay) {
  return ((gameplay.placed || {}).MapMarker || []).map((c) => {
    const f = c.fields || {};
    const type = MARKER_TYPES[f._markerType ?? 0] || "Default";
    return {
      name: c.name,
      body: c.body || null,
      label: f._label || c.name,
      type,
      maxDistance: MARKER_MAX_DISTANCE[type] ?? 5000,
      // `Awake` ne pose que DEUX couleurs : le blanc du constructeur, et le
      // vert pour ce qui appartient au joueur — lui, sa sonde, son vaisseau.
      color: COLORS[type] || COLORS.Default,
    };
  });
}

/**
 * `MapMarker.LateUpdate`, dans l'ordre ou il decide.
 *
 * Les trois regles que le portage n'avait pas, et qui se voient toutes :
 *
 *   - un marqueur a moins de DIX pixels du joueur est masque — sans quoi, au
 *     zoom maximal, tout s'empile sur le point vise ;
 *   - un marqueur a moins de dix pixels du VAISSEAU l'est aussi. Le portage ne
 *     testait que le joueur, et le nom de la planete se posait sur le vaisseau ;
 *   - le marqueur du joueur, lui, sort avant tous les tests : il ne se masque
 *     jamais derriere quoi que ce soit.
 *
 * @param screen        [x, y, distance] du marqueur
 * @param playerScreen  [x, y] du joueur, ou null
 * @param shipScreen    [x, y] du vaisseau, ou null
 * @param derelict      le joueur est dans la zone brouillee
 */
export function markerVisible(marker, screen, playerScreen, shipScreen, derelict = false) {
  if (derelict) return false;
  const [x, y, z] = screen;
  if (marker.type === "Player") return z > 0;
  const loinDuJoueur = playerScreen
    ? Math.hypot(x - playerScreen[0], y - playerScreen[1]) : Infinity;
  if (marker.type === "Ship") {
    if (z > 0 && z < marker.maxDistance && loinDuJoueur > MARKER_MIN_SCREEN) return true;
  }
  if (shipScreen
      && Math.hypot(x - shipScreen[0], y - shipScreen[1]) < MARKER_MIN_SCREEN) return false;
  if (z < 0 || z > marker.maxDistance) return false;
  return loinDuJoueur >= MARKER_MIN_SCREEN;
}

function markerType(body) {
  const g = body.gravity || {};
  if ((g.surfaceAcceleration || 0) >= 50) return "Sun";
  if ((g.upperSurfaceRadius || 0) >= 200) return "Planet";
  return "Moon";
}

/**
 * Quand la touche de la carte repond : `MapController.enabled`.
 *
 * Le composant est ETEINT dans la scene (`m_Enabled` 0) et `Awake` le laisse
 * eteint ; c'est son `LateUpdate` qui lit la touche, si bien qu'eteint, la
 * touche ne fait rien. L'alpha, mesuree au feu de camp : Entree n'ouvre rien
 * (docs/132). Le portage ouvrait la carte partout, combinaison ou non.
 *
 *   OnSuitUp                  enabled = true ;  _isWearingSuit = true
 *   OnRemoveSuit              enabled = false ; _isWearingSuit = false
 *   OnTriggerObservatoryMap   enabled = true ;  _isObservatoryMap = true
 *   ExitMapView               si observatoire et sans combinaison : enabled = false
 *   OnPlayerDeath             ExitMapView() ; enabled = false
 *
 * La mort eteint la carte meme combinaison sur le dos : elle ne se rallume
 * qu'au prochain `SuitUp`, et la boucle suivante rend le paquetage a la
 * cabine de toute facon.
 */
export class AccesCarte {
  constructor() {
    this.actif = false;
    this.combinaison = false;
    this.observatoire = false;
  }

  /** Suit l'etat de la combinaison, et n'agit que sur ses FRONTS. */
  porte(combinaison) {
    if (combinaison === this.combinaison) return;
    this.combinaison = combinaison;
    this.actif = combinaison;
  }

  /** `OnTriggerObservatoryMap`, avant `EnterMapView(10, 0,01)`. */
  depuisObservatoire() {
    this.actif = true;
    this.observatoire = true;
  }

  /** `ExitMapView`, sa partie qui touche a `enabled`. */
  sortie() {
    if (this.observatoire) {
      if (!this.combinaison) this.actif = false;
      this.observatoire = false;
    }
  }

  /** `OnPlayerDeath`. La sortie de carte est a la charge de l'appelant. */
  mort() {
    this.sortie();
    this.actif = false;
  }
}

export class SolarMap {
  constructor(canvas, bodies, playerData = null, sectorOf = {}, markers = []) {
    this.canvas = canvas;
    this.bodies = bodies;
    this.playerData = playerData;
    this.sectorOf = sectorOf;
    // Les marqueurs declares, indexes par corps porteur. Ce que le build dit
    // l'emporte sur ce que la gravite laisse deviner ; la deduction reste le
    // repli, pour un corps qu'aucun marqueur ne nomme.
    this.markers = new Map();
    for (const m of markers) if (m.body) this.markers.set(m.body, m);
    this.zoom = ZOOM_DEFAULT;
    // MapController : le « pan » n'est pas une rotation mais un DECALAGE du
    // point vise, en x et z, a la vitesse de la distance de zoom par seconde.
    // La camera regarde toujours droit vers le bas — il n'y a pas de rotation
    // libre dans cette alpha.
    this.focal = [0, 0];
    this.open = false;
    this.selected = null;
    // `_lastPlayAudioTime` : moins l'infini, pour que la premiere ouverture
    // sonne toujours.
    this.lastAudio = -Infinity;
    this.hits = [];      // zones cliquables, recalculees a chaque rendu
    // Les couleurs d'orbite, telles que `MapOpenGL` les porte. Les constantes
    // ci-dessus restent le repli explicite quand l'extraction manque.
    this.orbits = ORBIT_COLORS;
    this.cometColor = COMET_COLOR;
  }

  /**
   * `MapOpenGL` : cinq pointeurs de corps et cinq couleurs, plus celle de la
   * comete. Le tableau est range par `Start` dans un ordre ecrit a la main —
   * home, jumelles, Brittle Hollow, Giant's Deep, Dark Bramble — et c'est cet
   * ordre-la qui apparie les deux.
   */
  readOrbitColors(mog) {
    if (!mog || !mog.fields) return this.orbits;
    const f = mog.fields;
    const nom = (k) => (f[k] && f[k].name) || null;
    const rgb = (k) => (f[k] && typeof f[k].r === "number"
      ? [f[k].r, f[k].g, f[k].b] : null);
    const paires = [["_homePlanet", "_homeColor"], ["_hourglassPlanet", "_hourglassColor"],
                    ["_brittlePlanet", "_brittleColor"], ["_gasPlanet", "_giantColor"],
                    ["_bramblePlanet", "_brambleColor"]];
    const out = [];
    for (const [corps, couleur] of paires) {
      const b = nom(corps), c = rgb(couleur);
      if (b && c) out.push({ body: b, rgb: c });
    }
    if (out.length) this.orbits = out;
    const cc = rgb("_cometColor");
    if (cc) this.cometColor = cc;
    // L'alpha est la MEME sur les six : on la lit une fois, et le repli tient
    // si elle manque.
    const a = f._homeColor && typeof f._homeColor.a === "number"
      ? f._homeColor.a : null;
    if (a !== null) this.orbitAlpha = a;
    return this.orbits;
  }

  toggle() { this.open = !this.open; this.canvas.hidden = !this.open; }

  /**
   * `MapController.EnterMapView(zoomDuration, rotationRate, snapToPlayer)`.
   *
   * Deux lois y vivent, et le portage n'avait ni l'une ni l'autre.
   *
   * SANS CIBLE, la carte s'ouvre sur le systeme entier :
   *
   *     _zoomDistance = _defaultZoomDist;  _focalOffset = Vector3.zero;
   *
   * AVEC UNE CIBLE VISEE, elle vous CADRE tous les deux :
   *
   *     d = Distance(cible, joueur)
   *     _zoomDistance = Max(d / Tan(0,5 x fov x DEG2RAD) x 0,7, _minZoomDistance)
   *     _focalOffset  = (joueur - focale) + (cible - joueur) x 0,5
   *     _zoomDuration = 0,6f          // et non celui qu'on lui passe
   *
   * Le point vise est le MILIEU du segment joueur-cible, et la distance de
   * camera est celle qui les tient juste a l'image, a sept dixiemes pres —
   * avec un champ de 70 degres, `tan(35°)` vaut 0,7002, si bien que la demi-
   * etendue vue est a un millieme pres la distance qui vous separe. Le
   * cadrage n'est pas un reglage : il tombe de la geometrie.
   *
   * Et le zoom dure 0,6 s dans ce cas-la, quelle que soit la duree demandee.
   * Ce portage ouvre la carte d'un coup ; la valeur est relevee ici pour que
   * l'animation, le jour ou elle vient, n'ait pas a etre devinee.
   *
   * LE SON A DIX SECONDES DE GARDE :
   *
   *     if (Time.time > _lastPlayAudioTime + 10f) { ...; audio.Play(); }
   *
   * Ouvrir et refermer la carte coup sur coup est donc SILENCIEUX apres la
   * premiere fois. C'est ce qui empeche le jeu de claquer a chaque coup d'oeil.
   *
   * @param player [x, y, z] du joueur
   * @param target [x, y, z] de la cible visee, ou null
   * @param now    secondes, pour la garde du son
   * @returns { annonces, sonne, zoomDuration }
   */
  enterMapView(player, target = null, now = 0, fov = MAP.fov, soleil = [0, 0, 0],
               duree = MAP.zoomDuration) {
    this.open = true;
    this.canvas.hidden = false;
    // `_cometPathDegrees = 0` : l'ellipse de la comete se redessine a chaque
    // ouverture, dix degres par image (`MapOpenGL.OnEnterMapView`).
    this.cometDeg = 0;
    // `_focalOffset` est un DECALAGE depuis le Soleil (`_focalTransform`). Le
    // portage tenait un point absolu de son repere flottant — ancre sur le
    // corps du joueur : sans cible, la carte se centrait sur la planete du
    // joueur, et non sur l'etoile.
    if (target && player) {
      const d = Math.hypot(target[0] - player[0], target[1] - player[1],
                           target[2] - player[2]);
      const demi = Math.tan(0.5 * fov * Math.PI / 180);
      this.zoom = Math.max(d / (demi || 1) * MAP.fitFactor, MAP.minZoom);
      this.focal = [player[0] - soleil[0] + (target[0] - player[0]) * 0.5,
                    player[2] - soleil[2] + (target[2] - player[2]) * 0.5];
      duree = MAP.targetZoomDuration;
    } else {
      this.zoom = MAP.defaultZoom;
      this.focal = [0, 0];
    }
    const sonne = now > this.lastAudio + MAP.audioCooldown;
    if (sonne) this.lastAudio = now;
    return { annonces: ["EnterMapView", "SwitchActiveCamera"], sonne,
             zoomDuration: duree };
  }

  /**
   * `MapController.ExitMapView`.
   *
   * Elle ne touche NI au zoom NI au point vise : rouvrir la carte sans cible
   * la retrouve au systeme entier parce qu'`EnterMapView` les repose, pas
   * parce que la sortie les aurait ranges. Ce qu'elle range, ce sont les
   * invites — `_showingPrompts = false` et `RemoveScreenPrompt(_closePrompt)`.
   */
  exitMapView() {
    this.open = false;
    this.canvas.hidden = true;
    return { annonces: ["ExitMapView", "SwitchActiveCamera"] };
  }

  /** Zoom borne, comme dans le jeu. */
  setZoom(z) { this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_DEFAULT * 3, z)); }

  /**
   * Icone d'un `MapMarker`.
   *
   * Ce n'est pas une texture mais un DESSIN :
   * `IconGenerator.GenerateSquareBracket(20, 20, blanc)` produit quatre coins
   * en crochet, d'un pixel de trait, chacun couvrant un quart du cote. Le
   * redessiner ici coute moins qu'exporter seize variantes de couleur.
   */
  bracket(ctx, x, y, color, size = MARKER_ICON, ratio = BRACKET_RATIO) {
    const half = size / 2;
    const arm = size * ratio;
    ctx.strokeStyle = color;
    ctx.lineWidth = MARKER_LINE;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px0 = x + sx * half, py0 = y + sy * half;
      ctx.moveTo(px0, py0); ctx.lineTo(px0 - sx * arm, py0);
      ctx.moveTo(px0, py0); ctx.lineTo(px0, py0 - sy * arm);
    }
    ctx.stroke();
  }

  /**
   * Deplace le point vise. Le jeu applique `axe x distance x dt` : le
   * deplacement est donc proportionnel au zoom, ce qui garde une vitesse
   * constante A L'ECRAN quel que soit le niveau de zoom.
   */
  pan(ax, az, dt) {
    // `if (t >= 0,5f)` : pas de deplacement pendant la premiere moitie de la
    // montee de la camera.
    if (this.panLocked) return;
    this.focal[0] += Math.max(-1, Math.min(1, ax)) * this.zoom * dt;
    this.focal[1] += Math.max(-1, Math.min(1, az)) * this.zoom * dt;
  }

  recenter() { this.focal[0] = 0; this.focal[1] = 0; }

  /** Corps sous le curseur, en coordonnees canvas. */
  pick(x, y) {
    for (const h of this.hits) {
      if (Math.hypot(x - h.x, y - h.y) < Math.max(h.r, 10)) return h.body;
    }
    return null;
  }

  /**
   * @param playerPos position du joueur dans le repere courant
   * @param shipPos   position du vaisseau, ou null
   */
  /**
   * La carte VUE PAR LA CAMERA : `MapOpenGL.OnPostRender` et `MapMarker`.
   *
   * `projeter(p)` rend [x, y, z] ecran de `WorldToScreenPoint` — x, y en pixels
   * du canevas (y vers le bas), z la profondeur devant la camera. La scene est
   * dessinee dessous par le moteur ; ce calque ne pose que les cercles, la
   * comete et les marqueurs, sur fond transparent.
   *
   *   - chaque cercle est centre sur le Soleil A L'ECRAN, de rayon la distance
   *     ECRAN du corps au Soleil, trace de cinq degres en cinq degres. Pendant
   *     la montee de la camera, ce sont donc des cercles d'ecran qui ne
   *     suivent pas encore le plan du systeme — comme dans l'alpha ;
   *   - l'ellipse de la comete se dessine dix degres par image, en partant de
   *     180 degres, a partir de trois points projetes ;
   *   - un marqueur : crochet blanc de 20 pixels et libelle de 14, a la
   *     couleur de son type, teste par `markerVisible` avec la PROFONDEUR
   *     camera — le portage lui passait la distance au joueur.
   */
  drawProjete(projeter, playerPos, shipPos, derelict = false) {
    this.player = playerPos || null;
    this.derelict = !!derelict;
    if (!this.open) return;
    const c = this.canvas, ctx = c.getContext("2d");
    const w = c.width = c.clientWidth, h = c.height = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const soleil = this.bodies.find((b) => /sun/i.test(b.bodyName || b.name || ""));
    const alpha = this.orbitAlpha ?? ORBIT_ALPHA;
    if (soleil) {
      const S = projeter(soleil.position);
      ctx.lineWidth = 1;
      const couleurDe = new Map();
      for (const o of this.orbits) couleurDe.set(o.body, orbitStyle(o.rgb, alpha));
      for (const b of this.bodies) {
        const style = couleurDe.get(b.bodyName) || couleurDe.get(b.name);
        if (!style) continue;
        const P = projeter(b.position);
        const r = Math.hypot(P[0] - S[0], P[1] - S[1]);
        if (!(r > 0.5) || r > Math.max(w, h) * 50) continue;
        ctx.strokeStyle = style;
        ctx.beginPath();
        for (let j = 0; j <= 360; j += 5) {
          const f = j * Math.PI / 180;
          const x = S[0] + r * Math.cos(f), y = S[1] - r * Math.sin(f);
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // `CometPath` : le centre de l'ellipse (le Soleil decale du foyer), son
      // extremite en x (moins le demi-grand axe) et en z (plus le petit). Le
      // calcul se fait en y MONTANT, comme l'ecran d'Unity.
      const sp = soleil.position, fd = fociDistance();
      const V2 = projeter([sp[0] - fd, sp[1], sp[2]]);
      const V3 = projeter([sp[0] - fd - COMET_ELLIPSE.a, sp[1], sp[2]]);
      const V4 = projeter([sp[0], sp[1], sp[2] + COMET_ELLIPSE.b]);
      const deg = this.cometDeg || 0;
      if (deg > 0) {
        ctx.strokeStyle = orbitStyle(this.cometColor, alpha);
        ctx.beginPath();
        const y2 = h - V2[1], y4 = h - V4[1];
        for (let i = 0; i <= deg; i += 5) {
          const f = (i + 180) * Math.PI / 180;
          const x = V2[0] + (V2[0] - V3[0]) * Math.cos(f);
          const y = h - (y2 + (y2 - y4) * Math.sin(f));
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (this.cometDeg < 360) this.cometDeg = (this.cometDeg || 0) + 10;
    }

    this.hits = [];
    const P = playerPos ? projeter([playerPos.x, playerPos.y, playerPos.z]) : null;
    const V = shipPos ? projeter([shipPos.x, shipPos.y, shipPos.z]) : null;
    const places = [];
    for (const b of this.bodies) {
      const m = this.markers.get(b.name) || this.markers.get(b.bodyName);
      if (m) places.push({ m, pos: b.position, body: b });
    }
    for (const m of this.markers.values()) {
      if (m.type === "Player" && P) places.push({ m, pos: [playerPos.x, playerPos.y, playerPos.z] });
      if (m.type === "Ship" && V) places.push({ m, pos: [shipPos.x, shipPos.y, shipPos.z] });
    }
    ctx.font = `${MARKER_FONT}px "OW Dialogue", ui-monospace, monospace`;
    for (const { m, pos, body } of places) {
      const E = projeter(pos);
      const dec = { type: m.type, maxDistance: m.maxDistance ?? MARKER_MAX_DISTANCE[m.type] ?? 5000 };
      if (!markerVisible(dec, E, P, V, this.derelict)) continue;
      this.bracket(ctx, E[0], E[1], "#ffffff", MARKER_ICON);
      ctx.fillStyle = m.color || COLORS[m.type] || COLORS.Default;
      ctx.fillText(" " + m.label, E[0] + MARKER_ICON / 2, E[1] + 4);
      if (body && this.selected === body) {
        ctx.strokeStyle = "#ffd9a0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(E[0], E[1], MARKER_ICON, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
      if (body) this.hits.push({ body, x: E[0], y: E[1], r: MARKER_ICON / 2 });
    }
  }

  draw(playerPos, shipPos, derelict = false) {
    this.player = playerPos || null;
    this.derelict = !!derelict;
    if (!this.open) return;
    const c = this.canvas, ctx = c.getContext("2d");
    const w = c.width = c.clientWidth, h = c.height = c.clientHeight;
    const scale = Math.min(w, h) / (this.zoom * 2);
    const cx = w / 2, cy = h / 2;
    // Le repli sans camera : une projection plane. Le point vise est un
    // decalage depuis le Soleil, comme `_focalOffset`.
    const sol = this.bodies.find((b) => /sun/i.test(b.bodyName || b.name || ""));
    const o = sol ? sol.position : [0, 0, 0];
    const px = (p) => [cx + (p[0] - o[0] - this.focal[0]) * scale,
                       cy + (p[2] - o[2] - this.focal[1]) * scale];

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(6,9,16,.92)";
    ctx.fillRect(0, 0, w, h);

    // LES ORBITES, AUX COULEURS DU BUILD. `MapOpenGL.OnPostRender` trace un
    // cercle par corps, de cinq degres en cinq degres, dans la couleur que
    // `_lineColors` lui donne — cinq corps, cinq couleurs. Le portage les
    // tracait TOUTES d'un meme gris invente, et en tracait une par corps du
    // systeme plutot que les cinq du build (docs/100-carte.md).
    // ET ELLES SONT CENTREES SUR LE SOLEIL, ce que le portage ne faisait pas
    // non plus : il tracait ses cercles au centre de l'ECRAN, avec pour rayon
    // la distance du corps a l'origine du repere ancre — qui est le corps sous
    // les pieds du joueur, pas l'etoile. `OnPostRender` part de
    // `WorldToScreenPoint(_sun.transform.position)` et mesure le rayon en
    // PIXELS depuis ce point.
    const soleil = this.bodies.find((b) => /sun/i.test(b.bodyName || b.name || ""));
    if (soleil) {
      const [sx, sy] = px(soleil.position);
      const alpha = this.orbitAlpha ?? ORBIT_ALPHA;
      const couleurDe = new Map();
      for (const o of this.orbits) couleurDe.set(o.body, orbitStyle(o.rgb, alpha));
      for (const b of this.bodies) {
        const style = couleurDe.get(b.bodyName) || couleurDe.get(b.name);
        if (!style) continue;
        const r = Math.hypot(b.position[0] - soleil.position[0],
                             b.position[2] - soleil.position[2]) * scale;
        if (r < 4 || r > Math.max(w, h) * 8) continue;
        ctx.strokeStyle = style;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
      }
      // LA COMETE N'A PAS UN CERCLE, ELLE A UNE ELLIPSE. `CometPath` la
      // dessine a part, un FOYER sur le Soleil : le centre est decale de
      // `_fociDistance` le long de l'axe des x, du cote oppose au perihelie.
      const ra = COMET_ELLIPSE.a * scale, rb = COMET_ELLIPSE.b * scale;
      if (ra > 4 && ra < Math.max(w, h) * 16) {
        const [ex, ey] = px([soleil.position[0] - fociDistance(),
                             soleil.position[1], soleil.position[2]]);
        ctx.strokeStyle = orbitStyle(this.cometColor, alpha);
        ctx.beginPath();
        ctx.ellipse(ex, ey, ra, rb, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    this.hits = [];
    const placedLabels = [];
    // Le joueur et le vaisseau a l'ecran : `markerVisible` compare des PIXELS,
    // pas des unites — c'est ce qui fait qu'un marqueur se masque au zoom et
    // reapparait quand on s'ecarte.
    const ecranJoueur = playerPos ? px([playerPos.x, playerPos.y, playerPos.z]) : null;
    const ecranVaisseau = shipPos ? px([shipPos.x, shipPos.y, shipPos.z]) : null;
    for (const b of this.bodies) {
      const declare = this.markers.get(b.name) || this.markers.get(b.bodyName);
      const t = declare ? declare.type : markerType(b);
      const [x, y] = px(b.position);
      const r = Math.max(3, ((b.gravity || {}).upperSurfaceRadius || 100) * scale);
      // un corps jamais approche reste en creux : la carte se remplit a mesure
      const sec = this.sectorOf[b.name];
      const known = !this.playerData || !sec || this.playerData.hasExplored(sec);
      // `MapMarker.LateUpdate`, et non une regle du portage : la LOI vit dans
      // `markerVisible`, juste au-dessus, et elle etait ecrite, eprouvee — et
      // appelee par personne. Ce code en tenait une moitie a la main : la
      // distance maximale, et le dixieme de pixel autour du joueur. Il lui
      // manquait le VAISSEAU, le marqueur du joueur qui ne se masque jamais,
      // et la zone brouillee qui efface tout (docs/74-etalons.md).
      const dd = this.player
        ? Math.hypot(b.position[0] - this.player.x, b.position[1] - this.player.y,
                     b.position[2] - this.player.z)
        : 0;
      const dec = { type: t, maxDistance: MARKER_MAX_DISTANCE[t] ?? 5000 };
      if (!markerVisible(dec, [x, y, dd], ecranJoueur, ecranVaisseau,
                         this.derelict)) continue;
      const color = COLORS[t] || COLORS.Default;
      ctx.globalAlpha = known ? 1 : 0.28;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // MapMarker : le crochet encadre le corps. Le test du dixieme de pixel a
      // deja eu lieu — c'est `markerVisible` qui le porte maintenant, et il le
      // fait autour du JOUEUR, pas du centre de l'ecran : la carte se deplace,
      // et le joueur n'est pas toujours au milieu.
      this.bracket(ctx, x, y, color, Math.max(MARKER_ICON, r * 2 + 6));
      if (this.selected === b) {
        ctx.strokeStyle = "#ffd9a0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = color;
      // MapMarker._markerStyle : corps 14, libelle precede d'une espace
      ctx.font = `${MARKER_FONT}px "OW Dialogue", ui-monospace, monospace`;
      // Chevauchement des libelles : au zoom maximal, les corps interieurs se
      // resserrent au centre et leurs noms se superposaient. On empile ceux qui
      // se genent, du plus proche au plus loin, plutot que de les masquer — un
      // nom absent vaut moins qu'un nom decale.
      // Le nom du JEU quand le build en donne un : « The Nomad » plutot que
      // `Comet_Body`, « Devil's Furnace » plutot que `VolcanicMoon_Body`.
      const label = " " + (known
        ? (declare ? declare.label
                   : (b.bodyName || b.name || "").replace(/^GravityWell_/, ""))
        : "inconnu");
      const lx = x + Math.max(MARKER_ICON, r * 2 + 6) / 2;
      let ly = y + 4;
      const lw = ctx.measureText(label).width;
      let guard = 0;
      while (guard++ < 12 && placedLabels.some(
          (p) => Math.abs(p.y - ly) < MARKER_FONT && lx < p.x + p.w && p.x < lx + lw)) {
        ly += MARKER_FONT + 2;
      }
      placedLabels.push({ x: lx, y: ly, w: lw });
      ctx.fillText(label, lx, ly);
      ctx.globalAlpha = 1;
      this.hits.push({ body: b, x, y, r });
    }

    // joueur et vaisseau
    const mark = (p, color, label) => {
      if (!p) return;
      const [x, y] = px([p.x, p.y, p.z]);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(label, x + 7, y + 3);
    };
    mark(playerPos, COLORS.Player, "vous");
    mark(shipPos, COLORS.Ship, "vaisseau");

    ctx.fillStyle = "rgba(160,175,195,.8)";
    ctx.fillText(`portee ${Math.round(this.zoom)} u — molette : zoom, ` +
                 `glisser : deplacer, clic : cible, C : recentrer`, 12, 20);
  }
}
