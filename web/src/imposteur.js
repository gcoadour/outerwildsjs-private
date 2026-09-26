// Le soleil de substitution : `SunlightSwapper` et `LookAtSun`.
//
// @lit SunlightSwapper, LookAtSun
//
// Le vrai soleil du build est une ponctuelle SANS OMBRE posee sur l'etoile
// (`SunLight`, portee 20 000). Sans ombre, il eclaire aussi la face NUIT d'une
// planete : tout ce qui se tourne vers lui, sous l'horizon, en recoit. Le
// portage le rendait ainsi, et au reveil de Timber Hearth, soleil a trente-cinq
// degres sous l'horizon, la tour et les arbres prenaient un tiers de leur
// lumiere d'un astre qu'on ne voit pas. Dans l'alpha, a ce moment-la, ils n'en
// recoivent rien (docs/132).
//
// Le build contourne le probleme par un IMPOSTEUR, sur Timber Hearth et sur
// Brittle Hollow :
//
//   SunlightSwapper.OnOccupantEnterSector(Player) -> UseSunImposter()
//     tout ce qui, sous le corps, est au calque `Default` passe au calque
//     `UseSunImposter` (12) — que le masque de `SunLight` exclut ;
//   OnOccupantExitSector(Player) -> UseAuthenticSun()
//     et le chemin inverse, du calque 12 au calque 0.
//
//   LookAtSun.Update : _transform.LookAt(soleil)
//     le pivot `SunImposterPivot`, au centre du corps, regarde l'etoile ; ses
//     spots — `SunImposter_Center` a 491,3 unites sur l'avant du pivot pour
//     Timber Hearth, `SunImposterLight` a 1 375 pour Brittle Hollow, tournes
//     d'un demi-tour vers le centre — suivent. Intensite 8, cone de 45 et 35
//     degres, et des OMBRES : la planete eteint elle-meme sa face nuit.
//
// Le pivot de Timber Hearth porte aussi une COURONNE de huit spots sans ombre
// (TopLight ... BottomRightLight : intensite 5,25, cone de 85 degres), a 391
// unites de l'axe, inclines de trente degres vers lui. Ce sont eux qui
// eclairent les faces verticales et le pourtour du jour : sans eux, a midi, le
// terminal et la tour ne prenaient le spot central que par la tranche.

/** Les deux calques que l'echange connait, par leur numero dans `TagManager`. */
export const CALQUE_DEFAUT = 0;
export const CALQUE_IMPOSTEUR = 12;

/**
 * Le calque d'un objet apres l'echange.
 *
 * `UseSunImposter` ne touche qu'au calque 0 ; `UseAuthenticSun` ne rend au
 * calque 0 que ce qui est au 12 — y compris, s'il y en avait, ce qui y etait
 * pose des le depart. C'est la regle du build, on la garde.
 */
export function coucheApresEchange(couche, dedans) {
  if (dedans) return couche === CALQUE_DEFAUT ? CALQUE_IMPOSTEUR : couche;
  return couche === CALQUE_IMPOSTEUR ? CALQUE_DEFAUT : couche;
}

/**
 * Le repere du pivot apres `Transform.LookAt(soleil)` : l'avant vers l'etoile,
 * le haut aussi pres que possible de `Vector3.up` du monde — c'est le second
 * argument par defaut de `LookAt`. Droite = haut x avant, haut = avant x
 * droite, comme `Quaternion.LookRotation`.
 *
 * @returns { droite, haut, avant } ou null si l'etoile est au centre
 */
export function repereRegard(centre, soleil) {
  const d = [soleil[0] - centre[0], soleil[1] - centre[1], soleil[2] - centre[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  if (!(n > 1e-6)) return null;
  const f = [d[0] / n, d[1] / n, d[2] / n];
  // Haut du monde colineaire a l'avant : `LookRotation` garde alors l'axe X,
  // on en fait autant.
  let r = [f[2], 0, -f[0]];                   // (0,1,0) x f
  let nr = Math.hypot(r[0], r[1], r[2]);
  if (!(nr > 1e-6)) { r = [1, 0, 0]; nr = 1; }
  r = [r[0] / nr, r[1] / nr, r[2] / nr];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return { droite: r, haut: u, avant: f };
}

const dansRepere = (b, v) => [
  b.droite[0] * v[0] + b.haut[0] * v[1] + b.avant[0] * v[2],
  b.droite[1] * v[0] + b.haut[1] * v[1] + b.avant[1] * v[2],
  b.droite[2] * v[0] + b.haut[2] * v[1] + b.avant[2] * v[2],
];

/**
 * Pose d'un spot accroche au pivot : sa position et sa direction LOCALES
 * (`pivot` de l'extraction), recomposees dans le repere de `LookAt(soleil)`.
 *
 * @param centre centre du corps (repere courant)
 * @param soleil centre de l'etoile (meme repere)
 * @param local  { position, direction } dans le repere du pivot
 * @returns { position, direction } ou null si l'etoile est au centre
 */
export function poseImposteur(centre, soleil, local) {
  const b = repereRegard(centre, soleil);
  if (!b) return null;
  const p = dansRepere(b, local.position);
  return {
    position: [centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]],
    direction: dansRepere(b, local.direction),
  };
}

/**
 * Les spots du soleil de substitution : toute lumiere que l'extraction a
 * trouvee sous un pivot `LookAtSun`. Neuf sur Timber Hearth — le spot central
 * et sa couronne de huit —, un sur Brittle Hollow.
 */
export function imposteursDuBuild(lights) {
  // Le pivot porte aussi une directionnelle de test, eteinte dans le build.
  return (lights || []).filter((l) => l && l.pivot && l.body && l.enabled !== false);
}

/**
 * L'echange de calques pour un corps : les maillages sous lui, leur calque
 * d'origine, et l'etat courant. Idempotent : entrer deux fois ne change rien.
 */
export class EchangeSoleil {
  constructor(corps) {
    this.corps = corps;
    this.meshes = [];      // [{ mesh, couche }]
    this.dedans = false;
  }

  /** Ajoute les maillages d'un lot, avec le calque que `applyLayers` a pose. */
  ajouter(meshes) {
    for (const m of meshes || []) {
      if (!m || typeof m.layerMask !== "number") continue;
      const couche = Math.round(Math.log2(m.layerMask >>> 0));
      this.meshes.push({ mesh: m, couche: Number.isFinite(couche) ? couche : 0 });
    }
    if (this.dedans) this.appliquer();
  }

  /** @returns vrai si l'etat a change */
  poser(dedans) {
    if (dedans === this.dedans) return false;
    this.dedans = dedans;
    this.appliquer();
    return true;
  }

  appliquer() {
    for (const e of this.meshes) {
      e.couche = coucheApresEchange(e.couche, this.dedans);
      e.mesh.layerMask = (1 << e.couche) >>> 0;
    }
  }
}
