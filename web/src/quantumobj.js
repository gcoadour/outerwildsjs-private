// @lit QuantumObject
// @lit QuantumStatue
// @lit PlanarQuantumObject
// @lit MakeChildrenPlanarQuantum
//
// Ce qui bouge quand on ne le regarde pas.
//
// `quantum.js` porte la LUNE quantique — elle change d'hote des qu'on cesse de
// la regarder. Elle n'est pas seule : `QuantumObject` est une classe de base,
// et le build en pose deux descendances que le portage n'extrayait meme pas.
//
//   QuantumObjects (sur QuantumMoon_Body)   trois pins, une cabane, un panneau
//   QuantumStatue  (dans le musee)          une tete ancienne, en vitrine
//
// LES CINQ DE LA LUNE. `MakeChildrenPlanarQuantum.Awake` prend ses enfants un
// par un, en fait des `PlanarQuantumObject`, et SE DETRUIT. Ce que ce composant
// fait n'est donc pas dans ses champs — il n'en a aucun — mais dans sa
// descendance, et c'est pour cela que rien ne l'avait vu : le recensement
// compte des classes posees, et celle-ci ne pose rien.
//
// LA REGLE COMMUNE AUX TROIS DESCENDANCES, et c'est elle qui fait le jeu :
//
//   Update:  visible = l'AABB est dans le tronc de la camera active
//            si (!visible && visible a l'image precedente) -> Collapse()
//
// L'objet ne bouge donc PAS pendant qu'on le regarde, ni pendant qu'on ne le
// regarde pas : il bouge a l'INSTANT ou il sort du champ. Et chaque candidat
// est rejete s'il est visible depuis la camera active — un objet quantique ne
// se materialise jamais sous vos yeux.
//
// « VISIBLE » VEUT DIRE MOINS QUE CA, et c'est la mesure qui le dit :
//
//     CheckVisibility()  UpdateBounds();
//                        return GeometryUtility.TestPlanesAABB(
//                            GeometryUtility.CalculateFrustumPlanes(_activeCam),
//                            _worldBounds);
//     UpdateBounds()     _worldBounds.size = Vector3.zero;
//                        foreach (r in _childRenderers)
//                            _worldBounds.Encapsulate(r.bounds);
//
// Un test de TRONC sur une boite englobante alignee sur les axes du monde, et
// rien d'autre. Pas de rayon, pas d'occlusion : un objet quantique cache
// derriere une planete, un mur ou votre propre vaisseau compte comme REGARDE
// tant qu'il tombe dans le tronc de la camera. Se cacher les yeux ne suffit
// pas ; il faut tourner la tete.
//
// Et la boite est l'UNION des rendus enfants, repartie de zero a chaque image :
// elle suit donc l'objet, et elle est d'autant plus large que ses morceaux sont
// ecartes — une statue en pieces est « vue » bien avant que ses pieces le
// soient. Ce portage teste le meme tronc sur la meme union.
//
// TROIS FACONS DE NE PLUS ETRE LA :
//
//   PlanarQuantumObject   un point tire dans un disque, pose sur le terrain
//                         par un rayon, refuse si la pente depasse 45 degres
//   SimpleQuantumObject   un point tire dans une sphere, refuse s'il est occupe
//   QuantumStatue         elle ne se deplace pas : chacun de ses morceaux a une
//                         chance sur cinq d'etre visible
//
// La statue est la plus etrange des trois, et c'est une seule ligne : `si
// Random.value < 0,2 alors montre ce morceau`. Detourner les yeux d'une tete
// ancienne en vitrine, et n'en retrouver qu'un cinquieme.
//
// CE QUI VERROUILLE. `OnProbeSnapshot` : photographier un objet quantique avec
// la sonde, a une distance comprise entre `_minQuantumLockRange` et
// `_maxQuantumLockRange` et en l'ayant dans le cadre, pose `_isQuantumLocked` —
// et un objet verrouille ne s'effondre plus, meme hors du champ. `Collapse`
// commence par ce test et rend faux. Rappeler la sonde deverrouille.
//
// Le mecanisme de l'appareil photo qui epingle un objet quantique est donc
// deja la, dans l'alpha, entier.
//
// ET LA LAMPE. `OnSwitchFlashlightOff` : eteindre sa lampe fait s'effondrer un
// objet VISIBLE, sauf si la sonde est posee a moins de cent unites.
//
// Mais `Awake` n'ajoute cet ecouteur QUE si `_isLightSensitive` — et le meme
// test gouverne `LaunchProbe`, donc `_probeBody`, donc le bouclier de la sonde.
// Aucune des deux instances du build ne l'est. La loi est donc ecrite et
// gardee, et sa liste d'entrees est VIDE : c'est le meme cas que les dix-huit
// bouffees de docs/46 et que `inheritedAcceleration` de docs/68, et c'est dit
// ici plutot qu'omis.
//
// ET ILS SONT BROUILLES DES LE DEPART. `Start` appelle `Collapse()` une fois :
// les cinq objets ne sont jamais la ou la scene les pose. Arriver sur la lune
// quantique et trouver la cabane ailleurs qu'a sa place n'est pas un hasard de
// partie, c'est la premiere image.

/** Constructeurs de `QuantumObject` et de ses deux descendances. */
export const QUANTIQUE = {
  maxQuantumLockRange: 100,
  minQuantumLockRange: 0,
  // PlanarQuantumObject
  wavefunctionRadius: 100,
  maxSlope: 45,
  checkDepth: 1000,
  maxTerrainHeight: 100,
  raycastDist: 200,
  // QuantumStatue
  rendererChance: 0.2,
  // OnSwitchFlashlightOff
  probeShieldRange: 100,
};

/** Les cinq enfants que `MakeChildrenPlanarQuantum` transforme au reveil. */
export function planarQuantumObjects(gameplay) {
  const out = [];
  for (const c of ((gameplay.placed || {}).MakeChildrenPlanarQuantum || [])) {
    for (const k of c.children || []) {
      out.push({ name: k.name, parent: c.name, body: c.body || null,
                 local: k.local, position: k.position,
                 wavefunctionRadius: QUANTIQUE.wavefunctionRadius });
    }
  }
  return out;
}

/** Les statues quantiques posees, avec leurs morceaux. */
export function quantumStatues(gameplay) {
  return ((gameplay.placed || {}).QuantumStatue || []).map((c) => {
    const f = c.fields || {};
    return {
      name: c.name, body: c.body || null, position: c.position,
      parts: (c.children || []).map((k) => k.name),
      maxLockRange: f._maxQuantumLockRange ?? QUANTIQUE.maxQuantumLockRange,
      minLockRange: f._minQuantumLockRange ?? QUANTIQUE.minQuantumLockRange,
      lightSensitive: !!f._isLightSensitive,
    };
  });
}

/**
 * `OnProbeSnapshot` : la photo verrouille-t-elle l'objet ?
 *
 * Les trois conditions sont dans l'IL, et la troisieme est celle qu'on
 * oublierait : il ne suffit pas d'etre a bonne distance, il faut etre DANS LE
 * CADRE. Photographier a cote ne verrouille rien.
 */
export function locksOnSnapshot(distance, dansLeCadre, obj = QUANTIQUE) {
  const max = obj.maxLockRange ?? obj.maxQuantumLockRange;
  const min = obj.minLockRange ?? obj.minQuantumLockRange;
  if (distance > max || distance < min) return null;   // hors portee : inchange
  return !!dansLeCadre;
}

/**
 * `OnSwitchFlashlightOff` : eteindre la lampe fait-il s'effondrer l'objet ?
 *
 * Une sonde posee a moins de cent unites PROTEGE l'objet — c'est la sonde qui
 * observe a votre place.
 */
// @vide aucune des deux instances n'est `_isLightSensitive`, et `Awake` ne pose l'ecouteur que si elle l'est (docs/71)
export function collapsesOnFlashlightOff(visible, distanceSonde = null,
                                         cfg = QUANTIQUE) {
  if (!visible) return false;
  if (distanceSonde !== null && distanceSonde <= cfg.probeShieldRange) return false;
  return true;
}

/**
 * `QuantumStatue.Collapse` : quels morceaux restent visibles.
 *
 * Une chance sur cinq CHACUN, tires independamment : la statue ne disparait
 * pas, elle se dissout par morceaux, et jamais deux fois pareil.
 */
export function statueParts(parts, random = Math.random, cfg = QUANTIQUE) {
  return parts.map((nom) => ({ name: nom, visible: random() < cfg.rendererChance }));
}

/**
 * Un point tire dans le disque de la fonction d'onde, en coordonnees locales.
 *
 * `Random.insideUnitCircle` rend un point du disque UNITE, pas du cercle : le
 * tirage est surfacique. On le reproduit par rejet plutot que par
 * `sqrt(u)` — c'est ce que fait Unity, et la difference se verrait sur la
 * densite au centre.
 *
 * La hauteur est `_maxTerrainHeight` : on part d'au-dessus du terrain et on
 * tombe dessus.
 */
export function planarCandidate(random = Math.random, cfg = QUANTIQUE) {
  let x, y;
  do { x = random() * 2 - 1; y = random() * 2 - 1; } while (x * x + y * y > 1);
  return [x * cfg.wavefunctionRadius, cfg.maxTerrainHeight, y * cfg.wavefunctionRadius];
}

/** La pente trouvee sous le candidat est-elle acceptable ? */
export function slopeOK(normale, haut, cfg = QUANTIQUE) {
  const ln = Math.hypot(normale[0], normale[1], normale[2]) || 1;
  const lh = Math.hypot(haut[0], haut[1], haut[2]) || 1;
  const cos = (normale[0] * haut[0] + normale[1] * haut[1] + normale[2] * haut[2])
            / (ln * lh);
  const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  return angle < cfg.maxSlope;
}

/**
 * Un objet quantique et son etat.
 *
 * Le tirage vit ici plutot que dans le moteur, pour que la loi s'eprouve avec
 * un tirage constant. Ce que le moteur fournit est ce que lui seul sait : le
 * rayon vers le terrain et le test de visibilite.
 */
export class QuantumObject {
  constructor(data = {}, cfg = QUANTIQUE) {
    this.name = data.name || "QuantumObject";
    this.body = data.body || null;
    this.parent = data.parent || null;
    this.local = data.local || [0, 0, 0];
    this.position = data.position || [0, 0, 0];
    this.cfg = { ...cfg, ...(data.wavefunctionRadius
      ? { wavefunctionRadius: data.wavefunctionRadius } : {}) };
    this.locked = false;
    this.visible = false;
    this.wasVisible = false;
    this.collapses = 0;
  }

  /** `OnProbeSnapshot`, `OnRetrieveProbe`. */
  snapshot(distance, dansLeCadre) {
    const r = locksOnSnapshot(distance, dansLeCadre, {
      maxLockRange: this.cfg.maxQuantumLockRange,
      minLockRange: this.cfg.minQuantumLockRange });
    if (r !== null) this.locked = r;
    return this.locked;
  }

  retrieveProbe() { this.locked = false; }

  /**
   * `QuantumObject.Collapse` : le verrou passe avant tout le reste.
   *
   * @param tirer  fonction qui propose une position et dit si elle tient ;
   *               c'est elle qui porte le rayon et le test de visibilite.
   * @returns {boolean} l'objet s'est-il effondre ?
   */
  collapse(tirer = null) {
    if (this.locked) return false;
    this.collapses++;
    if (!tirer) return true;
    for (let i = 0; i < this.cfg.checkDepth; i++) {
      const p = tirer(i);
      if (p) { this.position = p; return true; }
    }
    return false;
  }

  /**
   * `Update` : l'effondrement se declenche sur la TRANSITION visible -> non
   * visible, et sur elle seule.
   */
  update(visible, tirer = null) {
    this.visible = !!visible;
    let effondre = false;
    if (!this.visible && this.wasVisible) effondre = this.collapse(tirer);
    this.wasVisible = this.visible;
    return effondre;
  }
}
