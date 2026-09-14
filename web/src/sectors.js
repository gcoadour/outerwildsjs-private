// Secteurs et niveau de detail.
//
// Le jeu decoupe l'espace en PlanetoidSector (7 dans la scene), chacun avec son
// rayon d'horizon, sa limite de poussee et sa portee d'eclairage ambiant :
//
//   Giant's Deep      500      Brittle Hollow  250      Timber Hearth   200
//   Twin 2            120      Twin 1, comete, lune      75
//
// Sans decoupage, les sept fichiers glTF sont rendus en permanence — 33 Mo de
// geometrie, dont 12 pour la seule Timber Hearth. On bascule donc chaque corps
// entre sa geometrie complete, quand on est dans son secteur, et sa sphere de
// substitution au-dela. C'est le principe des LODGroup du jeu, applique a
// l'echelle du corps.

import { insideVolume } from "./gravity.js";
import { restingPoint } from "./frames.js";

const ACTIVATION = 8;      // multiple du rayon d'horizon ou la geometrie s'active
const PRELOAD_MARGIN = 3000;   // unites d'avance pour la telecharger

// La marge de telechargement est ABSOLUE, pas proportionnelle. Un multiple de
// l'horizon paraissait naturel, mais l'horizon de Giant's Deep vaut 500 : a
// 20 fois, son rayon de demande couvrait 10 000 unites, soit presque tout le
// systeme, et la planete se telechargeait au demarrage depuis Timber Hearth
// (8 039 unites). Ce qui compte n'est pas la taille du corps mais le TEMPS de
// vol : 3 000 unites font huit secondes a 375 u/s, la pointe du pilote
// automatique.

export function sectorMap(gameplay) {
  const out = new Map();
  for (const s of (gameplay.placed || {}).PlanetoidSector || []) {
    const f = s.fields || {};
    out.set(s.name, {
      name: s.name,
      position: s.position,
      horizon: f._horizonRadius || 100,
    });
  }
  return out;
}

/**
 * Les secteurs MAJEURS, avec leur sphere de declenchement.
 *
 * @lit PlanetoidSector
 * @lit MajorSector
 * @lit ZeroGSector
 *
 * C'est une AUTRE liste que celle de `sectorMap`, et pour une autre raison.
 * `sectorMap` sert le rendu : un secteur y est le rayon d'horizon d'un corps.
 * Ici il s'agit de savoir OU L'ON EST, et le build ne le demande jamais a une
 * distance : `SectorDetector` tient la liste des secteurs dont on touche le
 * SphereCollider. Les deux rayons n'ont rien a voir — Timber Hearth a 200
 * d'horizon pour 1000 de declencheur, Giant's Deep 500 pour 750. Le portage
 * prenait `horizon x 1,5`, ce qui faisait entrer dans le secteur de Timber
 * Hearth trois fois trop tard.
 *
 * `useMinimap` suit la CLASSE, pas le champ :
 *
 *   PlanetoidSector.GetUseMinimap  ->  ldfld _useMinimap   (vrai sur les sept)
 *   MajorSector.GetUseMinimap      ->  ldc.i4 0 ; ret      (faux, en dur)
 *
 * et `ZeroGSector` herite de `MajorSector` sans rien redefinir. Les trois
 * secteurs qui ne sont pas des `PlanetoidSector` — Dark Bramble, l'epave, la
 * lune quantique — sont donc les trois endroits ou la minicarte s'eteint
 * (docs/82-secteur-majeur.md).
 */
export function majorSectors(gameplay = {}) {
  const placed = gameplay.placed || {};
  const out = [];
  const ajoute = (list, useMinimap) => {
    for (const c of list || []) {
      const f = c.fields || {};
      out.push({
        name: c.name, body: c.body || null, position: c.position,
        rotation: c.rotation || null, volume: c.volume || null,
        useMinimap: useMinimap(f),
        // `MajorSector.GetHorizonRadius` rend 0 : seul un PlanetoidSector en a.
        horizon: f._horizonRadius || 0,
        thrustLimit: f._thrustLimit ?? null,
        lightRange: f._ambientLightRange || 0,
        flashlightLimit: f._flashlightRangeLimit ?? null,
        shiplightLimit: f._shiplightRangeLimit ?? null,
      });
    }
  };
  ajoute(placed.PlanetoidSector, (f) => f._useMinimap !== false);
  ajoute(placed.MajorSector, () => false);
  ajoute(placed.ZeroGSector, () => false);
  return out;
}

/**
 * `SectorDetector.CalculateActiveMajorSector` : le plus proche PAR LE CENTRE
 * parmi ceux qu'on touche.
 *
 * Ce n'est pas la regle de `gameSectorAt`, qui retient le plus PETIT. Les deux
 * se ressemblent assez pour qu'on les confonde, et elles ne departagent pas de
 * la meme facon deux secteurs emboites.
 */
export function activeMajorSector(sectors, worldPoint, shiftOf = null) {
  let best = null, bestD = Infinity;
  for (const s of sectors) {
    if (!s.volume) continue;
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(s)) : worldPoint;
    if (!insideVolume(s, p)) continue;
    const d = Math.hypot(p[0] - s.position[0], p[1] - s.position[1],
                         p[2] - s.position[2]);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/**
 * `SectorDetector.GetThrustLimit` : le MINIMUM sur TOUS les secteurs touches.
 *
 * Pas sur le secteur actif — sur toute la liste. La nuance se voit la ou ils
 * s'emboitent : l'epave (600) est dans Dark Bramble (1500), et c'est la plus
 * basse des deux limites qui tient, quel que soit celui des deux qui est actif.
 */
export function sectorThrustLimit(sectors, worldPoint, shiftOf = null) {
  let limite = null;
  for (const s of sectors) {
    if (!s.volume || s.thrustLimit == null) continue;
    const p = shiftOf ? restingPoint(worldPoint, shiftOf(s)) : worldPoint;
    if (!insideVolume(s, p)) continue;
    limite = limite == null ? s.thrustLimit : Math.min(limite, s.thrustLimit);
  }
  return limite;
}

export class Sectors {
  /**
   * @param sectors   Map issue de sectorMap()
   * @param bodies    corps du systeme (positions dans le repere courant)
   * @param geoFor    (body) => lot de geometrie deja charge, ou null
   * @param fileFor   (body) => nom du fichier glTF du corps, ou null
   * @param request   (file) => lance le telechargement, sans attendre
   */
  constructor(sectors, bodies, geoFor, fileFor = null, request = null,
              extras = [], entryFor = null) {
    this.sectors = [...sectors.values()];
    this.bodies = bodies;
    this.geoFor = geoFor;
    this.fileFor = fileFor;
    this.request = request;
    this.extras = extras;
    this.entryFor = entryFor;
    this.active = new Set();
    this.current = null;
  }

  /** Secteur dont le centre est le plus proche d'un corps donne. */
  sectorFor(body) {
    let best = null, bestD = Infinity;
    const p = body.position0 || body.position;
    for (const s of this.sectors) {
      const d = Math.hypot(s.position[0] - p[0], s.position[1] - p[1],
                           s.position[2] - p[2]);
      if (d < bestD) { bestD = d; best = s; }
    }
    // un secteur trop loin du corps n'est pas le sien
    return bestD < (best ? best.horizon * 6 : 0) ? best : null;
  }

  /**
   * Active la geometrie des corps proches, desactive celle des autres.
   * @returns {actifs, total, secteur}
   */
  update(playerPos, framePos = null) {
    let actifs = 0, total = 0;
    this.current = null;
    // Fichiers encore a portee de chargement : c'est cette liste que
    // l'eviction consulte pour savoir ce qu'elle peut liberer.
    this.inRange = new Set();
    for (const b of this.bodies) {
      const file = this.fileFor ? this.fileFor(b) : (this.geoFor(b) || {}).file;
      if (!file) continue;   // corps sans geometrie exportee
      total += 1;
      const s = this.sectorFor(b);
      const horizon = (s ? s.horizon : (b.gravity && b.gravity.upperSurfaceRadius) || 200);
      const d = Math.hypot(b.position[0] - playerPos.x,
                           b.position[1] - playerPos.y,
                           b.position[2] - playerPos.z);
      const on = d < horizon * ACTIVATION;
      // le secteur courant vaut meme sans geometrie : c'est lui qui porte la
      // limite de poussee
      if (on && s && d < s.horizon * 1.5) this.current = s;
      if (d < horizon * ACTIVATION + PRELOAD_MARGIN) {
        this.inRange.add(file);
        if (this.request) this.request(file);
      }
      const entry = this.geoFor(b);
      if (!entry) continue;   // pas encore charge : la sphere de substitution tient
      if (on) actifs += 1;
      if (entry.container.setEnabled) entry.container.setEnabled(on);
      this.active[on ? "add" : "delete"](entry.file);
    }
    // Volumes sans puits de gravite : meme regle, mais leur position est fixe
    // et donnee en coordonnees monde, d'ou le passage dans le repere courant.
    for (const v of this.extras) {
      total += 1;
      const d = Math.hypot(v.position[0] - (framePos ? framePos[0] : 0) - playerPos.x,
                           v.position[1] - (framePos ? framePos[1] : 0) - playerPos.y,
                           v.position[2] - (framePos ? framePos[2] : 0) - playerPos.z);
      const on = d < v.radius * ACTIVATION;
      if (d < v.radius * ACTIVATION + PRELOAD_MARGIN) {
        this.inRange.add(v.file);
        if (this.request) this.request(v.file);
      }
      const entry = this.entryFor ? this.entryFor(v.file) : null;
      if (!entry) continue;
      if (on) actifs += 1;
      if (entry.container.setEnabled) entry.container.setEnabled(on);
      this.active[on ? "add" : "delete"](entry.file);
    }
    return { actifs, total, secteur: this.current };
  }

}

/**
 * Intensite de l'eclairage ambiant a une distance donnee.
 *
 * `_ambientLightRange` va de 750 sur Giant's Deep a 0 sur la premiere jumelle
 * et la comete. Le portage en faisait une attenuation LINEAIRE, en ecrivant
 * que « le jeu n'en donne pas d'autre ». Le jeu en donne une autre, et elle
 * tient en trois instructions :
 *
 *   MajorSector.GetAmbientLight(d) :  d < _ambientLightRange ? _ambientColor
 *                                                            : Color.black
 *
 * C'est une MARCHE, pas une pente. Le fondu qu'on voit en approchant ne vient
 * pas de la distance mais de `AmbientLightManager.Update`, qui lerpe vers la
 * cible a `deltaTime` du chemin restant — et c'est `ambientStep` qui le porte.
 * Un secteur a 0 n'eclaire donc rien du tout, ou qu'on soit : c'est ce qu'on
 * sent en arrivant sur la comete, dont le ciel n'est eclaire que par l'etoile.
 *
 * `base` reste la part du portage : le build rend du NOIR hors de portee, et
 * une page entierement noire n'est pas jouable sans les phares du jeu final.
 * C'est un repli assume, pas une mesure.
 */
export function ambientIntensity(distance, range, base = 0.1, full = 0.35) {
  return distance < range ? full : base;
}
