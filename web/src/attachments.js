// Ce qui suit un autre corps, et ce qui clignote.
//
// @lit AlignWithTargetBody, FieldInheritor, BlinkingRenderer, BrokenNode
// @lit HatchController, WaterEffectVolume
// La fin de la queue du recensement : six classes, trente-cinq instances, et
// deux d'entre elles touchent a la PHYSIQUE (docs/55-attaches.md).
//
// Tout ce module est de la logique pure : ni Babylon, ni DOM.

/**
 * `AlignWithTargetBody.GetAlignmentDirection` : la direction du corps VISE,
 * depuis le centre de masse de celui qui s'aligne.
 *
 *     direction = centreDeMasse(cible) - centreDeMasse(moi)
 *
 * Et `CheckAlignmentRequirements` rend VRAI, toujours : l'alignement n'a pas de
 * condition. Quatorze objets s'alignent ainsi — les meduses de Giant's Deep,
 * les deux jumelles sur leur point focal, l'ile qui orbite, le satellite, la
 * comete. Ce n'est pas la gravite qui decide de leur haut, c'est un corps
 * DESIGNE.
 */
export function alignmentDirection(selfCenter, targetCenter) {
  const d = [targetCenter[0] - selfCenter[0], targetCenter[1] - selfCenter[1],
             targetCenter[2] - selfCenter[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  return n > 0 ? [d[0] / n, d[1] / n, d[2] / n] : [0, 1, 0];
}

/** Les objets qui s'alignent sur un corps designe. */
export function alignedBodies(gameplay) {
  return ((gameplay.placed || {}).AlignWithTargetBody || []).map((c) => ({
    name: c.name,
    position: c.position,
    body: c.body || null,
    target: ((c.fields || {})._targetBody || {}).name
         || ((c.fields || {})._targetBody || {}).$ref || null,
  }));
}

/**
 * `FieldInheritor` : neuf corps qui subissent le champ d'UN AUTRE.
 *
 * `FixedUpdate` tient en une ligne — `rigidbody.AddAcceleration(heritee)` — et
 * l'acceleration heritee est celle que ressent un detecteur POSE AILLEURS. Les
 * meduses de Giant's Deep, les deux jumelles, l'entonnoir de sable et le
 * satellite casse ne tombent donc pas vers ce qui est sous eux : ils tombent
 * avec leur porteur.
 *
 * Dans ce portage, l'essentiel de ce decor est un ENFANT du glTF de son corps
 * et herite du mouvement par la hierarchie — c'est le meme constat que pour
 * `AttachOnAwake` (docs/46, lot 1). La loi est posee et gardee quand meme,
 * parce que ce qui bouge seul ne passe pas par la hierarchie.
 *
 * LES ACCELERATIONS S'ADDITIONNENT, et c'est le contraire de la regle qui vaut
 * partout ailleurs dans ce jeu : un detecteur de champ ordinaire retient le
 * champ DOMINANT (docs/04-gravite.md), celui-ci les somme tous.
 *
 *     GetInheritedAcceleration()
 *         if (_dirty) {
 *             _netInheritedAcceleration = Vector3.zero;
 *             foreach (FieldDetector d in _inheritedDetectorList)
 *                 _netInheritedAcceleration += d.GetFieldAcceleration();
 *             _dirty = false;
 *         }
 *         return _netInheritedAcceleration;
 *     FixedUpdate()
 *         _owRigidbody.AddAcceleration(GetInheritedAcceleration());
 *
 * `AddInheritedFieldDetector`, `RemoveInheritedFieldDetector` et
 * `ClearInheritedFields` n'ont rien a refaire ici : elles tiennent la LISTE et
 * l'abonnement a `OnDetectorUpdated`, dont le seul effet est de lever `_dirty`
 * — un cache. Ce portage recalcule la somme a chaque appel, ce qui est le meme
 * resultat sans le cache. `AddInheritedFieldDetector` refuse par ailleurs
 * d'heriter du detecteur du corps LUI-MEME (« Cannot inherit from an attached
 * field detector! »), ce qui ne peut pas arriver dans un portage ou la liste
 * est celle des champs qu'on lui passe.
 */
// @vide aucun `FieldInheritor` ne bouge seul : ce decor est enfant du glTF de son corps (docs/68)
export function inheritedAcceleration(fields) {
  const a = [0, 0, 0];
  for (const f of fields || []) {
    if (!f) continue;
    a[0] += f[0] || 0; a[1] += f[1] || 0; a[2] += f[2] || 0;
  }
  return a;
}

/** Les corps qui heritent du champ d'un autre. */
export function fieldInheritors(gameplay) {
  return ((gameplay.placed || {}).FieldInheritor || []).map((c) => ({
    name: c.name, position: c.position, body: c.body || null,
  }));
}

/**
 * Un renderer qui clignote.
 *
 * `_onSeconds` et `_offSeconds` valent 1 dans le constructeur ; les deux
 * instances les SERIALISENT, et pas a la meme valeur — l'icone de mise a jour
 * bat a 1/1, celle de l'ordinateur a 1/0,5. Un clignotement plus rapide dit
 * quelque chose de plus urgent, et les deux ne disent pas la meme chose.
 *
 * `_duration` vaut -1 : elles clignotent sans fin. Un `_duration` positif
 * eteindrait le composant au bout du compte.
 */
export const BLINK = { on: 1, off: 1, duration: -1 };

export function blinkingRenderers(gameplay) {
  return ((gameplay.placed || {}).BlinkingRenderer || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      position: c.position,
      body: c.body || null,
      on: f._onSeconds ?? BLINK.on,
      off: f._offSeconds ?? BLINK.off,
      duration: f._duration ?? BLINK.duration,
    };
  });
}

export class Blinker {
  constructor(data = BLINK) {
    this.data = data;
    this.visible = true;
    this.last = 0;
    this.start = 0;
    this.done = false;
  }

  update(t) {
    if (this.done) return this.visible;
    // Le build teste STRICTEMENT le temps ecoule depuis la derniere bascule,
    // et non une phase : deux clignotants allumes a des instants differents ne
    // se synchronisent jamais.
    const seuil = this.visible ? this.data.on : this.data.off;
    if (t > this.last + seuil) { this.visible = !this.visible; this.last = t; }
    if (this.data.duration > 0 && t > this.start + this.data.duration) this.done = true;
    return this.visible;
  }

  activate(t = 0, duration = null) {
    this.start = t;
    this.last = t;
    this.visible = true;
    this.done = false;
    if (duration != null) this.data = { ...this.data, duration };
  }
}

/**
 * Les trois noeuds casses du satellite.
 *
 * `BrokenNode.OnCompleteRepair` echange le materiau du noeud contre
 * `_repairedMaterial` : la reparation SE VOIT. `ZeroGTrainingManager` compte
 * les trois (docs/46, lot 7) ; ce qui manquait est la trace visible.
 */
export function brokenNodes(gameplay) {
  return ((gameplay.placed || {}).BrokenNode || []).map((c) => ({
    name: c.name,
    position: c.position,
    body: c.body || null,
    repairedMaterial: ((c.fields || {})._repairedMaterial || {}).name || null,
  }));
}

/**
 * Les eclaboussures de l'ocean.
 *
 * `WaterEffectVolume` porte TROIS champs de prefab — grand, moyen, petit — et
 * n'en choisit un qu'a l'entree. Mesure faite, les trois pointeurs ne sont
 * resolus par AUCUNE valeur dans le build : c'est le meme cas que
 * `_probePrefab` et `_vanishEffectPrefab` (docs/08-reste-a-faire.md §1). Il n'y
 * a donc rien a porter, et c'est le build qui le dit — pas le portage qui
 * renonce.
 */
export function waterEffects(gameplay) {
  return ((gameplay.placed || {}).WaterEffectVolume || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name,
      body: c.body || null,
      position: c.position,
      splashes: ["_largeSplashPrefab", "_medSplashPrefab", "_smallSplashPrefab"]
        .map((k) => (f[k] || {}).name || null),
    };
  });
}
