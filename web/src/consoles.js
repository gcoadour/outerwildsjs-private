// Consoles et objets de bord : ordinateur du vaisseau, lampe, guimauve,
// entrainement en apesanteur.
//
// Quatre systemes que le portage n'avait jamais regardes, un exemplaire de
// chacun dans la scene.

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

  /** L'invite ne s'affiche que dans le noir, lampe eteinte. */
  promptVisible(inDark, inShip, inMap, inDialogue) {
    return !this.on && !inShip && !inMap && !inDialogue && inDark;
  }
}

/**
 * Consoles a camera deportee.
 *
 * `RemoteFlightConsole` et `SatelliteSnapshotController` supposent tous deux
 * une camera AILLEURS que sur le joueur, ce que le portage n'avait pas — d'ou
 * leur mise de cote. Ce moyen existe depuis la camera embarquee de la sonde
 * (`ProbeCamera`) : ce sont les memes besoins, une vue seconde dans un coin de
 * l'ecran, et il n'y a donc rien de nouveau a ecrire pour les servir.
 *
 * Ce qui vient du build : leur presence, leur position, leur portee
 * d'interaction, et l'invite qui va avec. Ce qui n'en vient pas : le cadrage —
 * ou se met la camera une fois la console utilisee. La console de vol regarde
 * le vaisseau de haut, le satellite regarde le corps qu'il survole.
 */
export const CONSOLE_REACH = 6;

export function remoteConsoles(gameplay) {
  const out = [];
  const placed = (gameplay || {}).placed || {};
  for (const [cls, kind] of [["RemoteFlightConsole", "vol"],
                             ["SatelliteSnapshotController", "satellite"]]) {
    for (const e of placed[cls] || []) {
      const f = e.fields || {};
      out.push({ name: e.name, cls, kind, position: e.position,
                 range: f._interactRange ?? f._range ?? CONSOLE_REACH });
    }
  }
  return out;
}

export class RemoteView {
  constructor(consoles) {
    this.consoles = consoles;
    this.current = null;
  }

  get count() { return this.consoles.length; }

  /**
   * Console a portee, et le point de vue qu'elle ouvre.
   *
   * @param pos         position du joueur dans le repere courant
   * @param frameOffset decalage monde -> repere
   * @param targets     { ship: [x,y,z]|null, body: [x,y,z]|null, up: {x,y,z} }
   * @returns {pos, dir} a passer a la camera deportee, ou null
   */
  update(pos, frameOffset, targets = {}) {
    const o = frameOffset || [0, 0, 0];
    this.current = null;
    for (const c of this.consoles) {
      const p = [c.position[0] - o[0], c.position[1] - o[1], c.position[2] - o[2]];
      const d = Math.hypot(p[0] - pos.x, p[1] - pos.y, p[2] - pos.z);
      if (d > c.range) continue;
      this.current = c;
      const view = c.kind === "vol"
        ? aboveTarget(targets.ship, targets.up)
        : towards(p, targets.body);
      if (view) return view;
    }
    return null;
  }
}

/** Vue de haut, a vingt-cinq unites, pointee sur la cible. */
function aboveTarget(target, up) {
  if (!target) return null;
  const u = up || { x: 0, y: 1, z: 0 };
  const back = 25;
  return { pos: [target[0] + u.x * back, target[1] + u.y * back, target[2] + u.z * back],
           dir: [-u.x, -u.y, -u.z] };
}

/** Vue depuis la console elle-meme, tournee vers un point. */
function towards(from, target) {
  if (!target) return null;
  const d = [target[0] - from[0], target[1] - from[1], target[2] - from[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1;
  return { pos: from, dir: [d[0] / L, d[1] / L, d[2] / L] };
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
// Chaleur d'une source qui n'annonce pas la sienne. 100 est la valeur pour
// laquelle la formule du jeu donne les cinq secondes de `_cookTime` : c'est
// donc la chaleur du feu de camp, deduite du temps de cuisson et non choisie.
export const DEFAULT_HEAT = 100;

/**
 * Sources de chaleur posees dans la scene.
 *
 * La guimauve grillait SUR COMMANDE : `update(dt, 100)` etait appele par le
 * script de verification, et par rien d'autre. Dans le jeu, c'est la proximite
 * d'un `HeatSource` qui la cuit — on ne tend pas une guimauve au vide.
 *
 * La portee vient du collider de la source (voir `volumeOf` dans le pipeline) ;
 * la chaleur, du premier champ numerique qui la nomme.
 */
export function heatSources(gameplay) {
  const out = [];
  for (const e of ((gameplay || {}).placed || {}).HeatSource || []) {
    const f = e.fields || {};
    let heat = null;
    for (const [k, v] of Object.entries(f)) {
      if (typeof v === "number" && v > 0 && /heat|temperature|warmth/i.test(k)) {
        heat = v; break;
      }
    }
    const r = f._radius ?? (e.volume && e.volume.radius) ?? 0;
    if (r > 0) {
      out.push({ name: e.name, position: e.position, radius: r,
                 heat: heat ?? DEFAULT_HEAT });
    }
  }
  return out;
}

/**
 * Chaleur recue en un point, en additionnant les sources qui l'atteignent.
 *
 * Le jeu ne dit pas comment elle decroit dans le volume ; on la garde donc
 * CONSTANTE a l'interieur plutot que d'inventer une courbe, et c'est le rayon
 * mesure qui fait la limite.
 */
export function heatAt(sources, pos, frameOffset) {
  const o = frameOffset || [0, 0, 0];
  let total = 0;
  for (const s of sources) {
    const d = Math.hypot(s.position[0] - o[0] - pos.x,
                         s.position[1] - o[1] - pos.y,
                         s.position[2] - o[2] - pos.z);
    if (d < s.radius) total += s.heat;
  }
  return total;
}

export class Marshmallow {
  constructor(baseColor = [1, 0.98, 0.9]) {
    this.base = baseColor;
    this.toast = 0;
    this.eaten = 0;
    this.held = false;
  }

  get edible() { return this.held && this.toast >= MIN_TOAST; }
  get burnt() { return this.toast >= 1; }

  /** @param heat chaleur totale recue, 0 a 100 */
  update(dt, heat) {
    if (!this.held || heat <= 0) return this.toast;
    this.toast = Math.min(1.2, this.toast + heat / (COOK_TIME * 100) * dt);
    return this.toast;
  }

  /** Couleur courante : chaque composante moins le niveau de grillage. */
  color() {
    return this.base.map((c) => Math.max(0, c - this.toast));
  }

  eat() {
    if (!this.edible) return false;
    this.eaten += 1;
    this.toast = 0;
    this.held = false;
    return true;
  }
}
