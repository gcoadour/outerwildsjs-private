// Effondrement de la croute de Brittle Hollow.
//
// `MakeChildrenBreakable`, pose sur six objets de la planete, rend cassables
// leurs enfants directs pourvus d'un MeshCollider non declencheur, puis se
// detruit lui-meme. Chaque enfant tire au sort, avec la probabilite
// `_fractionDetachable`, s'il sera DETACHABLE ou seulement fracturable.
//
//   porteur           enfants   detachable   integrite
//   SurfaceShards          96       0,50           100
//   TheNarrows              8       1,00            50
//   GravityTrail            7       1,00            50
//   StalactiteTrail         6       1,00           200
//   BridgeShards            3       1,00           100
//   TowerShards             2       0,25           100
//                        ----
//                         122 fragments, 72 detachables en moyenne
//
// Correction d'une note anterieure : `docs/15-trounoir.md` annoncait « sur 100
// fragments candidats, 25 se detachent ». Les deux nombres etaient faux. Le
// 100 venait de `_integrity`, qui est une integrite et non un compte, et le
// 0,25 de `TowerShards`, le plus petit des six porteurs avec ses deux enfants.
// La croute proprement dite, `SurfaceShards`, est a 0,50.
//
// Un fragment detache prend la masse 100 et `_fieldDetection = ParentOnly` : il
// ne subit QUE la gravite de son corps parent. Il tombe donc droit vers le
// centre de Brittle Hollow, c'est-a-dire vers le trou noir.
//
// Ce que le build ne donne PAS : le calendrier. Rien dans l'alpha ne fait
// s'effondrer la croute toute seule — `BreakableFragment.AddDamage` attend un
// impact, et le trou noir n'endommage rien. La progression au fil de la boucle
// est donc un choix de ce portage, par analogie avec la croissance des ronces
// de Dark Bramble. Les fragments, leurs proprietes et leur chute, eux, sont
// ceux du jeu.

export const FIELD_PARENT_ONLY = 2;

/** Porteurs de croute, avec leurs proprietes de fragment. */
export function crustCarriers(gameplay) {
  return ((gameplay.placed || {}).MakeChildrenBreakable || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      position: c.position,
      fraction: f._fractionDetachable ?? 0.25,
      integrity: f._integrity ?? 100,
      mass: f._mass ?? 100,
      fieldDetection: f._fieldDetection ?? 0,
    };
  });
}

/**
 * Tirage reproductible.
 *
 * Le jeu appelle `Random.Range` : la selection change a chaque partie. Ici elle
 * est tiree du nom du fragment, ce qui la rend stable d'une boucle et d'une
 * session a l'autre — sans quoi la croute se recomposerait autrement a chaque
 * mort, et rien ne serait verifiable.
 */
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export class Crust {
  /**
   * @param carriers  issus de crustCarriers()
   * @param gravity   acceleration de surface du corps parent
   * @param radius    rayon de surface du corps parent
   */
  constructor(carriers, gravity, radius) {
    this.carriers = carriers;
    this.gravity = gravity;
    this.radius = radius;
    this.fragments = [];     // detachables, resolus une fois la geometrie la
    this.shatterable = [];   // les autres : ils se brisent sur place
    this.falling = [];
    this.detached = 0;
    this.shattered = 0;
    this.swallowed = 0;
    this.resolved = false;
  }

  get total() { return this.fragments.length; }
  get totalShatterable() { return this.shatterable.length; }

  /**
   * Resout les fragments dans la geometrie chargee.
   * @param nodesFor  (nomDuPorteur) => noeuds enfants, ou null
   */
  resolve(nodesFor) {
    if (this.resolved) return 0;
    for (const c of this.carriers) {
      const kids = nodesFor(c.name);
      if (!kids || !kids.length) continue;
      for (const n of kids) {
        if (hash01(n.name) < c.fraction) {
          this.fragments.push({ node: n, carrier: c, gone: false });
        } else {
          // ShatterableFragment : celui-la ne se detache pas, il se BRISE sur
          // place et disparait. Sa branche « eclats de debris » est vide dans
          // cette alpha — `if (_debrisShardPrefab != null) { }` ne fait rien —
          // il ne reste donc que l'effet et la destruction de l'objet.
          this.shatterable.push({ node: n, carrier: c, gone: false });
        }
      }
    }
    this.resolved = this.fragments.length > 0;
    return this.fragments.length;
  }

  /**
   * Detache ce qui doit l'etre a cet instant de la boucle, puis fait tomber ce
   * qui est detache.
   *
   * @param loopFraction  avancement de la boucle, 0 a 1
   * @param center        centre du corps parent, dans le repere du conteneur
   * @param detach        (fragment) => etat de chute, ou null si impossible
   */
  update(dt, loopFraction, center, detach) {
    const f = Math.min(1, Math.max(0, loopFraction));
    const want = Math.floor(this.fragments.length * f);
    // les fragments fracturables suivent la meme progression, mais eux
    // disparaissent au lieu de tomber
    const wantShatter = Math.floor(this.shatterable.length * f);
    while (this.shattered < wantShatter && this.shattered < this.shatterable.length) {
      const sh = this.shatterable[this.shattered];
      this.shattered += 1;
      if (sh.node.setEnabled) sh.node.setEnabled(false);
      sh.gone = true;
    }
    while (this.detached < want && this.detached < this.fragments.length) {
      const f = this.fragments[this.detached];
      this.detached += 1;
      const state = detach(f);
      if (state) this.falling.push(state);
    }

    for (let i = this.falling.length - 1; i >= 0; i--) {
      const s = this.falling[i];
      const d = [center[0] - s.pos[0], center[1] - s.pos[1], center[2] - s.pos[2]];
      const r = Math.hypot(d[0], d[1], d[2]) || 1;
      // ParentOnly : seule la gravite du corps parent agit. Au-dessus de la
      // surface elle decroit en 1/r², au-dessous le jeu la laisse constante.
      const g = this.gravity * (r > this.radius ? (this.radius * this.radius) / (r * r) : 1);
      for (let k = 0; k < 3; k++) {
        s.vel[k] += (d[k] / r) * g * dt;
        s.pos[k] += s.vel[k] * dt;
      }
      s.apply(s.pos);
      if (r < 40) {          // rayon de capture du trou noir
        s.remove();
        this.falling.splice(i, 1);
        this.swallowed += 1;
      }
    }
    return { detached: this.detached, falling: this.falling.length,
             swallowed: this.swallowed, shattered: this.shattered };
  }
}
