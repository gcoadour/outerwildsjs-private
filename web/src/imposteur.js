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
 * Pose d'un spot de l'imposteur : `LookAt(soleil)` sur le pivot, puis le spot a
 * `distance` sur l'avant du pivot, tourne vers le centre.
 *
 * @param centre   centre du corps (repere courant)
 * @param soleil   centre de l'etoile (meme repere)
 * @param distance position locale du spot sur l'avant du pivot
 * @returns { position, direction } ou null si l'etoile est au centre
 */
export function poseImposteur(centre, soleil, distance) {
  const d = [soleil[0] - centre[0], soleil[1] - centre[1], soleil[2] - centre[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  if (!(n > 1e-6)) return null;
  const u = [d[0] / n, d[1] / n, d[2] / n];
  return {
    position: [centre[0] + u[0] * distance, centre[1] + u[1] * distance, centre[2] + u[2] * distance],
    direction: [-u[0], -u[1], -u[2]],
  };
}

/**
 * Les spots de l'imposteur, tels que la scene les pose : nom de la lumiere,
 * corps porteur, distance au centre sur l'avant du pivot.
 */
export const IMPOSTEURS = [
  { lumiere: "SunImposter_Center", corps: "TimberHearth_Body", distance: 491.3126 },
  { lumiere: "SunImposterLight", corps: "BrittleHollow_Body", distance: 1374.998 },
];

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
