// Les zones d'ambiance : ce qu'on entend, selon ou l'on est.
//
// Dix-sept volumes poses dans la scene — quatorze `AudioVolume` et trois
// `DayNightAudioVolume` — dont rien ne lisait ni la forme, ni le clip, ni la
// priorite. Le portage jouait toutes ses sources a la proximite : une grotte,
// un musee et un village sonnaient ensemble des qu'on en approchait.
//
// CE QUE LE BUILD FAIT, ET QUI N'EST PAS DE LA PROXIMITE. Chaque volume porte
// une COUCHE et une PRIORITE. Dans une couche, une seule zone joue : la plus
// prioritaire parmi celles qui contiennent l'auditeur. Les autres se taisent en
// fondu. Les couches, elles, jouent ensemble — c'est ce qui superpose une
// musique de village a l'ambiance de son atmosphere.
//
//   couche 0   les interieurs : Hatch et MusicVolume a 100, les grottes et le
//              musee a 2, TheDepthsMusic a 100
//   couche 1   le dehors : Atmosphere a 0, les cavernes a 1, DeepFluid a 3,
//              l'ocean a 1 — la priorite decide qui couvre qui
//   couche 2   la musique de lieu : AncientMusic, VillageMusic, MusicVolume
//
// Trois choses mesurees qui ne se devinaient pas :
//
//   - le clip d'une zone est vise par `_clip`, et l'`AudioSource` posee sur le
//     meme objet est serialisee SANS clip. Les apparier par objet rendait les
//     dix-sept zones muettes ;
//   - la forme n'est pas sur l'objet de la zone mais sur ses ENFANTS, qui
//     portent les `EntrywayTrigger`. Six zones sur dix-sept n'avaient donc
//     aucune portee ;
//   - les priorites vont de 0 a 100 et NE sont PAS uniques dans une couche :
//     cinq zones de la couche 1 sont a 0. A egalite, c'est la plus petite qui
//     gagne — une piece est plus precise qu'une atmosphere, et c'est la seule
//     regle qui donne un resultat stable.
//
// Ce que le build donne : la duree du fondu (`_fadeSeconds`, 2 s partout sauf
// 5 s pour la musique du village). Ce qu'il ne donne pas ici : sa FORME. Le
// fondu est lineaire, et c'est un choix de ce portage.
//
// `_dayWindow` vaut 200 sur les trois volumes jour/nuit. Sa signification n'est
// pas etablie : le portage lui prefere son propre signal de nuit, qui vient de
// la hauteur du soleil. La valeur est extraite et gardee, pas interpretee.

import { insideVolume } from "./gravity.js";

/**
 * Charge les zones depuis le meme fichier que les sources.
 *
 * Elles y vivent a cote (`volumes`) parce qu'elles partagent les clips : une
 * zone et une source placee peuvent viser le meme fichier, et l'exporter deux
 * fois serait le telecharger deux fois.
 */
export async function loadAmbience() {
  try {
    const res = await fetch("data/audio/sources.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return (await res.json()).volumes || [];
  } catch (e) {
    console.warn("zones d'ambiance absentes :", e.message);
    return [];
  }
}

/** Zones d'ambiance extraites, telles quelles. */
export function ambienceZones(audio) {
  return ((audio && audio.volumes) || []).filter((z) => z.volume && z.file);
}

/** Les zones qui contiennent ce point. */
export function activeZones(zones, worldPoint) {
  return zones.filter((z) => insideVolume(z, worldPoint));
}

/**
 * La zone qui gagne chaque couche.
 *
 * @returns {Map<number, object>} couche -> zone, ou la couche est absente si
 *   aucune zone ne contient le point.
 */
export function winnersByLayer(zones, worldPoint) {
  const out = new Map();
  for (const z of activeZones(zones, worldPoint)) {
    const en_place = out.get(z.layer);
    if (!en_place || z.priority > en_place.priority ||
        (z.priority === en_place.priority && rayon(z) < rayon(en_place))) {
      out.set(z.layer, z);
    }
  }
  return out;
}

/** Taille d'une zone, pour departager deux priorites egales. */
function rayon(z) {
  const v = z.volume || {};
  if (v.radius > 0) return v.radius;
  if (v.size) return Math.hypot(v.size[0], v.size[1], v.size[2]) / 2;
  return Infinity;
}

/** Le clip d'une zone a cet instant : celui de la nuit s'il en a un. */
export function clipOf(zone, night = false) {
  if (night && zone.nightFile) return zone.nightFile;
  return zone.file;
}

/**
 * Melangeur de couches, avec ses fondus.
 *
 * Etat pur : on le nourrit d'une position et d'un pas de temps, il rend ce qui
 * doit jouer et a quel volume. Rien ici ne connait Babylon.
 */
export class AmbienceMixer {
  constructor(zones = []) {
    this.zones = zones;
    this.layers = new Map();   // couche -> { zone, file, gain }
  }

  get count() { return this.zones.length; }

  /** Couches qui sonnent, avec leur gain courant. */
  get playing() {
    return [...this.layers.entries()]
      .filter(([, l]) => l.gain > 0.001 && l.file)
      .map(([layer, l]) => ({ layer, file: l.file, gain: l.gain,
                              name: l.zone ? l.zone.name : null }));
  }

  /**
   * Avance les fondus d'un pas de temps.
   *
   * Une couche dont la zone gagnante change ne coupe pas : elle descend a zero
   * au rythme de la zone SORTANTE, puis remonte au rythme de l'entrante. C'est
   * ce qui evite qu'un seuil de porte fasse claquer le son.
   */
  update(dt, worldPoint, { night = false } = {}) {
    const gagnantes = winnersByLayer(this.zones, worldPoint);
    const couches = new Set([...this.layers.keys(), ...gagnantes.keys()]);
    for (const c of couches) {
      const veut = gagnantes.get(c) || null;
      let etat = this.layers.get(c);
      if (!etat) { etat = { zone: null, file: null, gain: 0 }; this.layers.set(c, etat); }

      const memeZone = etat.zone && veut && etat.zone === veut;
      if (memeZone) {
        const f = clipOf(veut, night);
        // Le passage jour -> nuit change le clip sans changer de zone : on
        // redescend d'abord, sinon les deux se superposeraient.
        if (f !== etat.file && etat.gain <= 0.001) { etat.file = f; }
        etat.gain = memeFichier(etat, f)
          ? Math.min(1, etat.gain + dt / duree(veut))
          : Math.max(0, etat.gain - dt / duree(veut));
        continue;
      }
      if (!veut) {
        etat.gain = Math.max(0, etat.gain - dt / duree(etat.zone));
        if (etat.gain <= 0.001) { etat.zone = null; etat.file = null; }
        continue;
      }
      // Une autre zone veut la couche : on libere d'abord la place.
      if (etat.zone && etat.gain > 0.001) {
        etat.gain = Math.max(0, etat.gain - dt / duree(etat.zone));
        continue;
      }
      etat.zone = veut;
      etat.file = clipOf(veut, night);
      etat.gain = Math.min(1, etat.gain + dt / duree(veut));
    }
    return this.playing;
  }
}

function memeFichier(etat, f) { return etat.file === f; }
function duree(zone) { return Math.max(0.05, (zone && zone.fade) || 2); }
