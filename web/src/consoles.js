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
