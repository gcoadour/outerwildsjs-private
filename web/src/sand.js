// Le sable des jumelles : la colonne qui passe d'un monde a l'autre.
//
// C'est la mecanique propre du lieu, et elle manquait entierement au portage.
// Le recensement des classes posees dans `level0` l'a fait apparaitre : trois
// composants, quatre nombres, et personne ne les lisait.
//
//   SandLevelController   RisingSand     60 -> 290   entre la 2e et la 17e minute
//   SandLevelController   DrainingSand  300 ->  66   entre la 2e et la 17e minute
//   SandFunnelController  SandFunnel_Body  pousse a la 2e, se retire a la 17e
//
// Les deux niveaux de sable sont des SPHERES qu'on met a l'echelle : la jumelle
// qui se remplit voit sa sphere de sable grossir de 60 a 290 pendant que celle
// de sa voisine tombe de 300 a 66. Le sable ne se deplace donc pas, il change
// de taille aux deux bouts — et c'est ce qui decouvre, chez la jumelle qui se
// vide, ce que le sable recouvrait.
//
// Le calendrier est celui de la boucle : rien ne bouge avant la 2e minute, tout
// est fini a la 17e, trois minutes avant la supernova. Les valeurs du
// constructeur (150 -> 33, de la 2e a la 17e) ne servent nulle part : les deux
// instances posees les remplacent toutes les quatre.

/** Fraction de la transition, bornee comme le fait le build (`Clamp01`). */
export function sandProgress(minutes, start, end) {
  if (!(end > start)) return minutes >= end ? 1 : 0;
  const t = (minutes - start) / (end - start);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Echelle d'une colonne de sable a un instant de la boucle.
 *
 *     t       = clamp01((minutes - debut) / (fin - debut))
 *     echelle = initScale + (finalScale - initScale) x t
 *
 * Interpolation lineaire, sans adoucissement : le sable monte a vitesse
 * constante pendant quinze minutes.
 */
export function sandScale(minutes, c) {
  const t = sandProgress(minutes, c.startMinutes, c.endMinutes);
  return c.initScale + (c.finalScale - c.initScale) * t;
}

/**
 * Echelle de la colonne-entonnoir, qui relie les deux jumelles.
 *
 * Le build la mene en deux temps : a la minute de croissance il lance une mise
 * a l'echelle vers 1 en dix secondes, a la minute de retrait une autre vers 0
 * en dix secondes, chacune partant de l'echelle courante. Comme les deux
 * minutes sont a quinze minutes d'intervalle, la premiere est toujours finie
 * quand la seconde part, et la forme fermee ci-dessous rend exactement les
 * memes valeurs :
 *
 *     echelle = clamp01((t - pousse) / 10) x (1 - clamp01((t - retrait) / 10))
 *
 * Seuls X et Y sont mis a l'echelle ; Z reste a 1, parce que c'est la longueur
 * de la colonne et qu'elle ne change pas — l'entonnoir s'ouvre, il ne s'etire
 * pas.
 */
export const FUNNEL_SCALE_SECONDS = 10;

export function funnelScale(seconds, f) {
  const monte = sandProgress(seconds, f.growAfterMinutes * 60,
                             f.growAfterMinutes * 60 + FUNNEL_SCALE_SECONDS);
  const baisse = sandProgress(seconds, f.shrinkAfterMinutes * 60,
                              f.shrinkAfterMinutes * 60 + FUNNEL_SCALE_SECONDS);
  return monte * (1 - baisse);
}

/** L'entonnoir n'existe qu'entre sa minute de pousse et sa minute de retrait. */
export function funnelActive(seconds, f) {
  return seconds >= f.growAfterMinutes * 60 && seconds < f.shrinkAfterMinutes * 60;
}

/** Colonnes de sable extraites, avec leurs quatre nombres. */
export function sandColumns(gameplay) {
  return ((gameplay.placed || {}).SandLevelController || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      position: c.position,
      initScale: f._initScale ?? 150,
      finalScale: f._finalScale ?? 33,
      startMinutes: f._startAfterMinutes ?? 2,
      endMinutes: f._endAfterMinutes ?? 17,
    };
  });
}

/** L'entonnoir, s'il est pose. Les defauts sont ceux du constructeur. */
export function sandFunnels(gameplay) {
  return ((gameplay.placed || {}).SandFunnelController || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      position: c.position,
      growAfterMinutes: f._growAfterMinutes ?? 1,
      shrinkAfterMinutes: f._shrinkAfterMinutes ?? 16,
    };
  });
}

/**
 * Les colonnes rattachees a la geometrie chargee.
 *
 * Par NOM, comme les textures qui defilent (`texanim.js`) et pour la meme
 * raison : la position extraite est celle de la scene au repos, et les jumelles
 * orbitent. Un appariement geometrique echouerait des la premiere seconde.
 */
export class SandLevels {
  constructor(columns = [], funnels = []) {
    this.columns = columns;
    this.funnels = funnels;
    this.live = [];        // { noeud, colonne }
    this.liveFunnels = []; // { noeud, entonnoir }
  }

  get total() { return this.columns.length + this.funnels.length; }
  get count() { return this.live.length + this.liveFunnels.length; }

  /** Rattache ce qu'on trouve dans un lot de noeuds fraichement charge. */
  attach(nodes) {
    if (!nodes || !nodes.length) return 0;
    let n = 0;
    for (const c of this.columns) {
      if (this.live.some((x) => x.colonne === c)) continue;
      const cible = nodes.find((m) => m.name === c.name);
      if (!cible) continue;
      this.live.push({ noeud: cible, colonne: c });
      n += 1;
    }
    for (const f of this.funnels) {
      if (this.liveFunnels.some((x) => x.entonnoir === f)) continue;
      const cible = nodes.find((m) => m.name === f.name);
      if (!cible) continue;
      this.liveFunnels.push({ noeud: cible, entonnoir: f });
      n += 1;
    }
    return n;
  }

  /**
   * Pose l'echelle du moment. Appelee avec les secondes ecoulees de la boucle,
   * donc remise a zero toute seule au redemarrage : le sable refait le meme
   * trajet a chaque boucle, comme dans le jeu.
   */
  update(seconds) {
    const minutes = seconds / 60;
    for (const { noeud, colonne } of this.live) {
      const s = sandScale(minutes, colonne);
      if (noeud.scaling) noeud.scaling.set(s, s, s);
    }
    for (const { noeud, entonnoir } of this.liveFunnels) {
      const s = funnelScale(seconds, entonnoir);
      if (noeud.scaling) noeud.scaling.set(s, s, 1);
      if ("setEnabled" in noeud) noeud.setEnabled(s > 0.001);
    }
  }
}
