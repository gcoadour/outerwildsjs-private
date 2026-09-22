// Consoles et objets de bord : ordinateur du vaisseau, lampe, guimauve,
// entrainement en apesanteur.
//
// Quatre systemes que le portage n'avait jamais regardes, un exemplaire de
// chacun dans la scene.

// @lit MarshmallowStick, ShipComputerCamera, RemoteFlightConsole
// L'ordinateur de bord, la lampe et la guimauve.

import { radiationAt } from "./volumes.js";

/**
 * Ordinateur de bord.
 *
 * Ce n'est PAS un selecteur de destination — je l'avais suppose — mais le
 * registre des lieux : on fait defiler les sept notices a gauche et a droite,
 * et celles des endroits deja explores s'ouvrent sur leur description. Les
 * autres affichent « UNEXPLORED » et « --------- ».
 *
 * Les textes sont ceux du build, un TextAsset par lieu, et ils en disent long :
 * la notice du Soleil porte « UNSTABLE — Accelerated nuclear fusion detected in
 * core », celle de Brittle Hollow « EXTREMELY UNSTABLE: Crust weakened by heavy
 * volcanic bombardment ». Le jeu previent, dans un terminal que rien n'oblige a
 * consulter.
 *
 * `_locationIndex` part a 2 et `_zoomLevel` a 1 dans le build ; le niveau 2 est
 * la fiche ouverte.
 */
export const UNEXPLORED_NAME = "UNEXPLORED";
export const UNEXPLORED_DESC = "---------";

export function shipRecords(gameplay) {
  return ((gameplay.placed || {}).SectorData || [])
    .map((r) => ({
      sector: (r.fields || {})._sectorName ?? 0,
      orthoSize: (r.fields || {})._orthoSize ?? 2,
      text: r.text || "",
    }))
    .sort((a, b) => a.sector - b.sector);
}

export class ShipComputer {
  /** @param sectorNames table indice -> nom de secteur, comme PlayerData */
  constructor(records, sectorNames, playerData) {
    this.records = records;
    this.names = sectorNames;
    this.pdata = playerData;
    this.index = Math.min(2, Math.max(0, records.length - 1));
    this.zoom = 1;
    this.open = false;
  }

  get current() { return this.records[this.index] || null; }

  name(rec) { return (this.names[rec.sector] || "?"); }

  revealed(rec) {
    return !this.pdata || this.pdata.hasExplored(this.name(rec));
  }

  move(dir) {
    // le jeu borne l'index, il ne boucle pas
    this.index = Math.max(0, Math.min(this.records.length - 1, this.index + dir));
    this.zoom = 1;
  }

  /** @returns "ouvre" | "refus" | "ferme" | null */
  select() {
    const r = this.current;
    if (!r) return null;
    if (this.zoom === 1) {
      if (!this.revealed(r)) return "refus";
      this.zoom = 2;
      return "ouvre";
    }
    return null;
  }

  cancel() {
    if (this.zoom === 2) { this.zoom = 1; return "retour"; }
    this.open = false;
    return "ferme";
  }

  /** Deux lignes affichees, comme les deux TextMesh du terminal. */
  display() {
    const r = this.current;
    if (!r) return { name: "", description: "" };
    if (!this.revealed(r)) {
      return { name: `<   ${UNEXPLORED_NAME}   >`, description: UNEXPLORED_DESC };
    }
    if (this.zoom === 1) {
      return { name: `<   ${this.name(r)}   >`, description: "[records available]" };
    }
    return { name: this.name(r), description: r.text };
  }
}

/**
 * Lampe frontale.
 *
 * Portee **80**, bornee par le secteur quand il en impose une. Elle s'eteint
 * d'elle-meme des qu'on entre dans le vaisseau, la carte, une conversation ou
 * un point d'accroche — le jeu appelle `TurnOff` sur chacun de ces evenements.
 *
 * Son invite ne s'affiche que si elle est eteinte, qu'on porte la combinaison et
 * qu'on est dans le noir : une zone sombre, ou la face nuit du corps.
 */
export const FLASHLIGHT_RANGE = 80;

export class Flashlight {
  constructor(BABYLON, scene) {
    this.B = BABYLON;
    this.light = new BABYLON.SpotLight(
      "flashlight", BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, 0, 1),
      Math.PI / 3.2, 2, scene);
    this.light.range = FLASHLIGHT_RANGE;
    this.light.intensity = 1.4;
    this.light.setEnabled(false);
    this.on = false;
  }

  toggle() { this.on = !this.on; this.light.setEnabled(this.on); return this.on; }

  /** Extinction forcee : vaisseau, carte, conversation, accroche. */
  forceOff() {
    if (!this.on) return false;
    this.on = false;
    this.light.setEnabled(false);
    return true;
  }

  /** @param limit portee imposee par le secteur, ou null */
  update(camera, forward, limit = null) {
    this.light.range = Math.min(limit ?? Infinity, FLASHLIGHT_RANGE);
    this.light.position.copyFrom(camera.position);
    this.light.direction.copyFrom(forward);
  }

  // L'invite de lampe ne vit plus ici. Elle y a ete ecrite en quatre
  // conditions devinees ; `Flashlight.CheckPromptStatus` en a SEPT, et
  // `flashlightPromptVisible` plus bas les porte toutes. Garder les deux, c'est
  // garder un piege : la version courte a l'air juste, et `lois.mjs` l'a
  // trouvee morte depuis le lot ou la longue l'a remplacee.
}

/**
 * Guimauve au feu de camp.
 *
 * `_cookTime` vaut 5 et la formule est
 * `_toastLevel += chaleur / (cookTime x 100) x dt` : a chaleur 100, il faut
 * donc cinq secondes pour arriver a 1. La guimauve n'est mangeable qu'a partir
 * de **0,6**, et sa couleur fonce en soustrayant le niveau a chaque composante.
 *
 * Son invite est la seule du jeu posee AU-DESSUS du centre de l'ecran
 * (`GetScreenCenterPos() - (0, 50)`), la ou toutes les autres sont dessous.
 */
export const COOK_TIME = 5;
export const MIN_TOAST = 0.6;

/**
 * Sources de chaleur posees dans la scene.
 *
 * La guimauve grillait SUR COMMANDE : on appuyait, elle cuisait, ou qu'on soit.
 * Le feu de camp existe pourtant, et la formule du jeu prend une chaleur en
 * entree. On la lit donc la ou elle est.
 *
 * CETTE FONCTION NE TROUVAIT RIEN. Elle ramassait les classes dont le NOM
 * contient « heat », et il n'y en a aucune dans ce build — pas plus qu'il n'y
 * a de classe `HeatSource`. Elle rendait donc une liste vide, la guimauve ne
 * chauffait jamais, et `docs/67` a bati le soin du jeu par-dessus sans que
 * personne ne s'en apercoive : les controles posaient `toast` a la main.
 *
 * La chaleur du build est ailleurs, et elle est nommee : huit
 * `RadiationEmitter` de `radiationType` 1, magnitude 100, avec une courbe qui
 * va de 1 a dix unites a 0 a quarante-cinq. Ce sont les feux de camp — un sur
 * la lune, deux a Timber Hearth, un sur chaque jumelle, deux sur Brittle
 * Hollow, un sur l'asteroide en beignet (docs/75-chaleur.md).
 *
 * Le motif est garde pour ce qu'il pourrait trouver ailleurs, et il est
 * desormais SECOND : les emetteurs passent d'abord.
 */
export function heatSources(gameplay = {}, emitters = []) {
  const out = [];
  // Les emetteurs de rayonnement THERMIQUE : la vraie source.
  for (const e of emitters) {
    if (e.type !== 1) continue;
    out.push({ name: e.name, position: e.position, body: e.body,
               emitter: e, radius: 0, heat: e.magnitude });
  }
  for (const [cls, list] of Object.entries(gameplay.placed || {})) {
    if (!/heat/i.test(cls)) continue;
    for (const e of list) {
      const f = e.fields || {};
      const heat = Object.entries(f).find(([k, v]) =>
        typeof v === "number" && /heat|temperature|intensity/i.test(k));
      const radius = (e.volume && e.volume.radius) ||
        Object.entries(f).find(([k, v]) =>
          typeof v === "number" && v > 0 && /radius|range/i.test(k))?.[1] || 0;
      if (!radius) continue;
      out.push({ name: e.name, position: e.position, radius,
                 heat: heat ? Math.abs(heat[1]) : 100 });
    }
  }
  return out;
}

/**
 * Chaleur recue en un point, en unites de `_toastLevel` (0 a 100).
 *
 * Decroissance lineaire jusqu'au bord du volume : c'est ce que fait une lumiere
 * ponctuelle d'Unity 4 en mode simple, et le jeu ne donne pas d'autre courbe.
 */
/**
 * Les quatre invites du sac dorsal : lesquelles, et quand.
 *
 * @lit JetpackPromptController
 *
 * ELLES N'EXISTENT QU'EN APESANTEUR. `OnBreakPlayerFieldAlignment` allume le
 * composant et pose ses quatre invites ; `OnInitPlayerFieldAlignment` l'eteint
 * et les retire. Poser le pied sur une planete les fait donc disparaitre
 * toutes, et le portage les affichait des qu'on n'etait pas dans le vaisseau.
 *
 * ET LES TROIS POUSSEES NE VIENNENT QU'A L'ENTRAINEMENT. `_isTrainingMode` est
 * pose par `OnEnterZeroGTraining` : ce sont les invites du satellite casse, pas
 * celles du vol libre. Une fois qu'on a appris, le jeu ne les remontre plus —
 * et il ne les montre pas non plus tant qu'on vise un referentiel, parce que
 * viser veut dire qu'on sait deja ou l'on va.
 *
 * L'ACCORD DE VITESSE, LUI, EXCLUT LES AUTRES. Il demande une cible visee et
 * plus d'une unite par seconde de vitesse relative, et quand il s'affiche il
 * est SEUL : le jeu ne propose qu'une chose a la fois.
 *
 * @returns {{matchVelocity:boolean, thrust:boolean}}
 */
export function jetpackPrompts({
  inField = true, mapView = false, autopilotAllowed = true,
  targeted = false, localSpeed = 0, training = false,
} = {}) {
  const rien = { matchVelocity: false, thrust: false };
  if (inField || mapView) return rien;
  if (autopilotAllowed && targeted && Math.abs(localSpeed) > 1) {
    return { matchVelocity: true, thrust: false };
  }
  if (training && !targeted) return { matchVelocity: false, thrust: true };
  return rien;
}

export function heatAt(sources, world, shiftOf = null) {
  let best = 0;
  for (const s of sources) {
    const dec = shiftOf ? (shiftOf(s) || [0, 0, 0]) : [0, 0, 0];
    const d = Math.hypot(world[0] - s.position[0] - dec[0],
                         world[1] - s.position[1] - dec[1],
                         world[2] - s.position[2] - dec[2]);
    // Un emetteur porte SA courbe : ni lineaire, ni bornee par son collider.
    // Celle des feux de camp tient 100 jusqu'a dix unites puis tombe a zero a
    // quarante-cinq — le collider de 2,36, lui, est la forme du feu, pas sa
    // portee, et c'est ce que le portage avait pris pour une portee.
    if (s.emitter) { best = Math.max(best, radiationAt(s.emitter, d)); continue; }
    if (d >= s.radius) continue;
    best = Math.max(best, s.heat * (1 - d / s.radius));
  }
  return best;
}

/**
 * Les trois seuils de couleur de `Marshmallow.Update`, et son delai.
 *
 * Le build ne raisonne jamais sur le niveau de grillage pour ces trois-la : il
 * raisonne sur la composante ROUGE de la couleur courante, qui vaut
 * `_initR - _toastLevel`. C'est le meme nombre a une soustraction pres, et
 * c'est cette soustraction qui fait que la guimauve brule AVANT d'atteindre 1 :
 *
 *   r < 0,25  la flamme prend           (`_pSys.renderer.enabled`)
 *   r < 0,08  la guimauve est perdue    (`ResetMarshmallow`)
 *
 * Et une fois la flamme prise, `_toastLevel += 0,001` PAR IMAGE, chaleur ou
 * pas : on ne rattrape pas une guimauve qui a pris feu, on la regarde finir.
 * Le pas est par image et non par seconde — c'est ecrit ainsi dans l'IL, sans
 * `deltaTime`, comme le glissement des points d'accrochage.
 */
export const MALLOW = {
  flame: 0.25,        // composante rouge en dessous de laquelle ca s'enflamme
  lost: 0.08,         // ... et en dessous de laquelle il n'en reste rien
  burnStep: 0.001,    // par IMAGE, une fois la flamme prise
  respawn: 0.8,       // secondes avant qu'une nouvelle n'apparaisse
};

export class Marshmallow {
  constructor(baseColor = [1, 0.98, 0.9], cfg = MALLOW) {
    this.base = baseColor;
    this.cfg = cfg;
    this.toast = 0;
    this.eaten = 0;
    this.held = false;
    // `_justReset` / `_resetTime` : entre la guimauve perdue (ou mangee) et la
    // suivante, il n'y a rien sur le baton pendant huit dixiemes de seconde.
    this.gone = false;
    this.goneFor = 0;
    this.burned = 0;      // combien on en a laisse bruler
  }

  /** La composante rouge courante, celle sur laquelle le build decide. */
  get red() { return Math.max(0, this.base[0] - this.toast); }

  /** `_pSys.renderer.enabled` : la flamme a pris. */
  get aflame() { return !this.gone && this.held && this.red < this.cfg.flame; }

  get edible() { return !this.gone && this.held && this.toast >= MIN_TOAST; }

  /**
   * Il n'en reste rien. Ce n'etait pas `toast >= 1` : avec un rouge d'origine
   * a 1, le build la perd des 0,92 — soit AVANT le grillage complet, et donc
   * avant que le portage ne s'en apercoive.
   */
  get burnt() { return this.red < this.cfg.lost; }

  /** @param heat chaleur totale recue, 0 a 100 */
  update(dt, heat) {
    // La guimauve perdue ou mangee revient apres son delai, entiere.
    if (this.gone) {
      this.goneFor += dt;
      if (this.goneFor >= this.cfg.respawn) {
        this.gone = false; this.goneFor = 0; this.toast = 0;
      }
      return this.toast;
    }
    if (!this.held) return this.toast;
    if (heat > 0) {
      this.toast = Math.min(1.2, this.toast + heat / (COOK_TIME * 100) * dt);
    }
    // `if (_pSys.renderer.enabled && _toastLevel < 1) _toastLevel += 0.001`.
    // L'ordre compte : le build lit la flamme de l'image PRECEDENTE, puis
    // recalcule la couleur, puis rallume ou non la flamme.
    if (this.aflame && this.toast < 1) this.toast += this.cfg.burnStep;
    if (this.burnt) { this.burned += 1; this.vanish(); }
    return this.toast;
  }

  /** `ResetMarshmallow`, branche « elle etait la » : elle disparait. */
  vanish() {
    if (this.gone) return false;
    this.gone = true;
    this.goneFor = 0;
    return true;
  }

  /** Couleur courante : chaque composante moins le niveau de grillage. */
  color() {
    return this.base.map((c) => Math.max(0, c - this.toast));
  }

  eat() {
    if (!this.edible) return false;
    this.eaten += 1;
    // `_eaten = true` puis `ResetMarshmallow` : on ne repart pas d'une
    // guimauve crue dans la seconde, on repart de rien pendant 0,8 s.
    this.vanish();
    return true;
  }
}

/**
 * Consoles a camera deportee.
 *
 * `RemoteFlightConsole` — piloter le vaisseau depuis l'observatoire — et
 * `SatelliteSnapshotController` — regarder par le satellite — supposent une
 * camera ailleurs que sur le joueur. Le moyen existe depuis que la sonde a la
 * sienne : c'est la meme vue dans un coin de l'ecran, avec une autre cible.
 *
 * Leurs invites sont deja au catalogue, ce qui dit que le jeu attendait bien
 * une interaction a portee : ces consoles se prennent en main, elles ne
 * s'allument pas toutes seules.
 *
 * `RespawnModelShip` remet le vaisseau modele sur son point — et la ligne qui
 * compte est la troisieme :
 *
 *     _modelShipBody.SetPosition(_respawnPoint.position);
 *     _modelShipBody.transform.rotation = _respawnPoint.rotation;
 *     _modelShipBody.SetVelocity(
 *         _attachedBody.GetPointVelocity(_respawnPoint.position));
 *     _modelShipBody.SetAngularVelocity(Vector3.zero);
 *     _playerAudioSource.PlayOneShot(_respawnAudioClip, 0.5f);
 *
 * IL NE REAPPARAIT PAS IMMOBILE : il reprend la vitesse du POINT ou il est
 * repose, sur le corps qui le porte. C'est la meme loi qu'en se levant du
 * poste de pilotage (`PlayerAttachPoint.DetachPlayer`, docs/97), et pour la
 * meme raison — l'observatoire tourne avec Timber Hearth. Reposer un objet a
 * zero sur un sol qui bouge le fait glisser.
 *
 * Ce portage ne fait pas encore reapparaitre le modele : `modelShipBody` en
 * lit la pose, et le crash s'annonce, mais rien ne le repose. La loi est
 * relevee ici pour que le jour ou on le fera, la vitesse du point y soit —
 * c'est elle qu'on oublie, pas la position.
 */
export const CONSOLE_REACH = 8;

export function remoteConsoles(gameplay = {}) {
  const placed = gameplay.placed || {};
  const out = [];
  for (const cls of ["RemoteFlightConsole", "SatelliteSnapshotController"]) {
    for (const e of placed[cls] || []) {
      // `targets` porte ce que le verrouillage de camera regarde pendant qu'on
      // tient la console : le VAISSEAU MODELE pour la console de vol,
      // l'ECRAN DE PROJECTION pour le satellite. Ce n'est pas la console
      // elle-meme, et c'est ce qui fait qu'on se tourne vers le bon objet
      // (docs/105-lire.md).
      out.push({ name: e.name, kind: cls, position: e.position,
                 body: e.body || null, targets: e.targets || null,
                 flight: cls === "RemoteFlightConsole" });
    }
  }
  return out;
}

export class RemoteConsoles {
  constructor(consoles = [], reach = CONSOLE_REACH) {
    this.consoles = consoles;
    this.reach = reach;
    this.active = null;
  }

  get count() { return this.consoles.length; }

  /** Console a portee de la main, en coordonnees monde. */
  nearest(world) {
    let best = null, bestD = this.reach;
    for (const c of this.consoles) {
      const d = Math.hypot(c.position[0] - world[0], c.position[1] - world[1],
                           c.position[2] - world[2]);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /** Prend ou lache la console a portee. @returns la console active, ou null */
  toggle(world) {
    if (this.active) { this.active = null; return null; }
    this.active = this.nearest(world) || null;
    return this.active;
  }

  /**
   * Ce que la camera deportee regarde, dans le repere courant.
   *
   * La console de vol suit le vaisseau et regarde devant lui ; le satellite
   * reste ou il est et vise le corps le plus proche. Le format est celui d'une
   * sonde, pour que `ProbeCamera` les affiche sans rien savoir d'elles.
   *
   * @param frame decalage monde -> repere courant
   */
  view(frame = [0, 0, 0], { ship = null, body = null } = {}) {
    const c = this.active;
    if (!c) return null;
    if (c.flight) {
      if (!ship) return null;
      const v = [ship.vel.x, ship.vel.y, ship.vel.z];
      const L = Math.hypot(...v);
      return { pos: [ship.pos.x, ship.pos.y, ship.pos.z],
               vel: L > 0.1 ? v : [0, 0, 1] };
    }
    const p = [c.position[0] - frame[0], c.position[1] - frame[1],
               c.position[2] - frame[2]];
    const t = body ? body.position : [0, 0, 0];
    const d = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
    return { pos: p, vel: Math.hypot(...d) > 1e-3 ? d : [0, 0, 1] };
  }
}

/**
 * `PlayerResources.OnEatMarshmallow` : la sante repart au MAXIMUM.
 *
 *     _currentHealth = _maxHealth
 *
 * Deux lignes d'IL, et une mecanique entiere que le portage n'avait pas : la
 * guimauve n'est pas un decor de feu de camp, c'est le soin du jeu. Le portage
 * comptait les guimauves mangees et n'en faisait rien
 * ([`docs/67`](../../docs/67-annonces.md)).
 *
 * @lit PlayerResources
 */
export function eatMarshmallowHeals(resources) {
  if (!resources) return 0;
  const avant = resources.health;
  resources.health = resources.maxHealth;
  resources.dead = false;
  return resources.health - avant;
}

/**
 * `Flashlight.CheckPromptStatus` : quand proposer d'allumer la lampe.
 *
 * Sept conditions, toutes necessaires, et la derniere est un OU. Le portage
 * affichait l'invite sur la seule portee, ce qui la montrait en plein jour et
 * dans le vaisseau.
 *
 * @lit Flashlight
 */
export function flashlightPromptVisible({
  on = false, suit = false, inShip = false, inMapView = false,
  attached = false, satelliteCam = false, inDarkZone = false, onDaySide = true,
} = {}) {
  if (on || !suit || inShip || inMapView || attached || satelliteCam) return false;
  return inDarkZone || !onDaySide;
}
