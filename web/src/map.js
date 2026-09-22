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
  // La duree passee par l'appelant, et celle que la cible IMPOSE.
  zoomDuration: 1,
  targetZoomDuration: 0.6,
  // Le champ de la camera du joueur, dont depend le cadrage.
  fov: 70,
};
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
  enterMapView(player, target = null, now = 0, fov = MAP.fov) {
    this.open = true;
    this.canvas.hidden = false;
    let duree = MAP.zoomDuration;
    if (target && player) {
      const d = Math.hypot(target[0] - player[0], target[1] - player[1],
                           target[2] - player[2]);
      const demi = Math.tan(0.5 * fov * Math.PI / 180);
      this.zoom = Math.max(d / (demi || 1) * MAP.fitFactor, MAP.minZoom);
      this.focal = [player[0] + (target[0] - player[0]) * 0.5,
                    player[2] + (target[2] - player[2]) * 0.5];
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
  draw(playerPos, shipPos, derelict = false) {
    this.player = playerPos || null;
    this.derelict = !!derelict;
    if (!this.open) return;
    const c = this.canvas, ctx = c.getContext("2d");
    const w = c.width = c.clientWidth, h = c.height = c.clientHeight;
    const scale = Math.min(w, h) / (this.zoom * 2);
    const cx = w / 2, cy = h / 2;
    // le decalage du point vise recentre toute la projection
    const px = (p) => [cx + (p[0] - this.focal[0]) * scale,
                       cy + (p[2] - this.focal[1]) * scale];

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
