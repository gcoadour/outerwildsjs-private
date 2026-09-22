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

// @lit BreakableFragment, MakeChildrenBreakable, DetachableFragment
// Les 122 fragments de la croute : 72 tombent, 50 se brisent.
//
// `MakeBreakable(enfant)` est la methode qui tire ce sort, et l'ordre y compte :
//
//     enfant.AddBreakableFragment().Init(_integrity, _propagateToChildFraction,
//                                        _fractureMaterial);
//     if (Random.Range(0f, 1f) < _fractionDetachable)
//         enfant.AddDetachableFragment().Init(_mass, _dragCoefficient,
//                                             _escapeFromParentSpeed,
//                                             _fieldDetection);
//     else enfant.AddCollider();
//
// TOUT ENFANT EST D'ABORD CASSABLE, et seule une part tiree au sort devient en
// plus DETACHABLE. Les deux ne s'excluent pas : un fragment detachable se
// brise aussi. Et celui qui ne l'est pas recoit un collider a la place — il
// reste solide, il ne disparait pas.
//
// Le tirage est fait UNE FOIS, au reveil, et non a chaque impact : la carte des
// morceaux qui tomberont est figee avant qu'on arrive. C'est pourquoi ce
// portage tire lui aussi une fois, par `hash01` sur le nom — meme loi, tirage
// reproductible (docs/121-avis.md).

export const FIELD_PARENT_ONLY = 2;

/**
 * `DetachableFragment.Init(masse, trainee, vitesseDeFuite, detectionDeChamp)`
 * et `Detach()`, qui est tout ce qui se passe au moment ou un morceau lache.
 *
 *     parent.rigidbody.mass -= _mass;
 *     self.rigidbody.mass    = _mass;
 *     Vector3 fuite = _escapeFromParentSpeed
 *                   * (self.worldCoM - parent.worldCoM).normalized;
 *     self.SetVelocity(parent.GetPointVelocity(self.worldCoM) + fuite);
 *     self.SetAngularVelocity(parent.GetAngularVelocity());
 *
 * L'UNIQUE INSTANCE DE LA SCENE porte `_mass = 100`, `_dragFactor = 0` et
 * `_escapeFromParentSpeed = 0`. Deux des quatre champs d'`Init` sont donc
 * NULS dans ce build : le morceau n'est pas ejecte, et rien ne le freine. Ce
 * qui reste est la seule chose qui se voie, et elle manquait —
 *
 *   **il part avec la vitesse du point d'ou il se detache.**
 *
 * `GetPointVelocity(p)` d'un corps qui tourne vaut `omega x (p - centre)`. Un
 * fragment de la croute de Brittle Hollow ne tombe donc pas droit : il garde
 * la vitesse que la rotation de la planete lui donnait, et s'ecarte en spirale.
 * Le portage le lachait immobile (docs/110-croute.md).
 *
 * Le transfert de masse, lui, n'a pas d'equivalent ici : ce portage n'a pas de
 * `Rigidbody` pour la planete, et sa gravite vient d'un champ analytique que
 * cent unites de moins ne changent pas.
 *
 * @param point   position du fragment, dans le repere du conteneur
 * @param centre  centre du corps parent, meme repere
 * @param spin    `bodySpin(corps)` : axe unitaire et rad/s, ou null
 */
export function detachVelocity(point, centre, spin) {
  if (!spin) return [0, 0, 0];
  const r = [point[0] - centre[0], point[1] - centre[1], point[2] - centre[2]];
  const w = [spin.axis[0] * spin.rate, spin.axis[1] * spin.rate,
             spin.axis[2] * spin.rate];
  return [w[1] * r[2] - w[2] * r[1],
          w[2] * r[0] - w[0] * r[2],
          w[0] * r[1] - w[1] * r[0]];
}

import { BlackHole } from "./blackhole.js";

/** Les six porteurs de fragments et leurs proprietes de build. */
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
      // Effet de disparition graduelle (_vanishEffectPrefab) : on reduit
      // l'echelle du fragment avant sa teleportation.
      if (s.node) {
        BlackHole.vanishEffect(s.node, r, 100);
      }
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
