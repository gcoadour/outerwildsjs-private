// Le regard a pied : combien de degres pour un mouvement de souris ou de manche.
//
// @lit PlayerCameraController, PlayerCharacterController
//
// DEUX VITESSES INVENTEES, REMPLACEES. Le portage tournait de `_turnRate`
// degres pour une largeur d'ecran de souris, et la manette a « 900 pixels de
// souris par seconde », avec une zone morte de 0,18 et une courbe cubique. Rien
// de cela n'est dans le build, qui fait :
//
//   axe     = Input.GetAxis("Yaw_PC") + Input.GetAxis("Yaw_Key")
//             (le manche passe sa zone morte de 0,25 ; la souris compte ses
//              pixels x 0,1 — la `sensitivity` de l'axe `mouseMove`)
//   lacet   : PlayerCharacterController.FixedUpdate
//             angle = axe x (fov / fov initial) x _turnRate x fixedDeltaTime
//   tangage : PlayerCameraController.UpdateInput
//             _degreesY += axe x _sensitivityY x (fov / fov initial) x deltaTime
//             borne a [_minDegreesY, _maxDegreesY] = [-80, 80]
//
// Un manche a fond tourne donc de 160 degres par seconde et leve la tete de
// 120 ; la souris, a 60 images par seconde, de 0,27 et 0,2 degre par pixel.
// Le lacet se paie par pas FIXE et le tangage par image : cumules sur une
// image, ils valent tous deux `axe x vitesse x duree de l'image`. C'est aussi
// pourquoi, dans le build, la souris tourne plus par pixel quand l'image
// ralentit — le portage le garde tel quel.
//
// La lunette ralentit les deux (`_telescopeTurnScalar`,
// `_telescopeSensitivityScalar`, 0,5 chacun), et le zoom aussi, par le
// rapport des champs. Le tangage etait borne a 86 degres ; il l'est a 80.

/** Les valeurs du build, et les replis s'il manque le composant. */
export const REGARD = {
  turnRate: 160,          // PlayerCharacterController._turnRate
  sensitivityY: 120,      // PlayerCameraController._sensitivityY
  telescopeTurn: 0.5,     // _telescopeTurnScalar
  telescopeSens: 0.5,     // _telescopeSensitivityScalar
  suitTurn: 1,            // _suitTurnScalar
  suitSens: 1,            // _suitSensitivityScalar
  minDegreesY: -80,
  maxDegreesY: 80,
  souris: 0.1,            // InputManager, `Yaw_Key` et `Pitch_Key` (mouseMove)
  zoneMorte: 0.25,        // InputManager, `Yaw_PC` et `Pitch_PC`
};

/** Les constantes du regard, depuis `gameplay.json` et `input.json`. */
export function regardDuBuild(gameplay = {}, commandes = null) {
  const s = gameplay.singletons || {};
  const cam = (s.PlayerCameraController || {}).fields || {};
  const pas = (s.PlayerCharacterController || {}).fields || {};
  const n = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  const lacet = commandes && commandes.get ? commandes.get("Yaw") : null;
  return {
    turnRate: n(pas._turnRate, REGARD.turnRate),
    sensitivityY: n(cam._sensitivityY, REGARD.sensitivityY),
    telescopeTurn: n(pas._telescopeTurnScalar, REGARD.telescopeTurn),
    telescopeSens: n(cam._telescopeSensitivityScalar, REGARD.telescopeSens),
    suitTurn: n(pas._suitTurnScalar, REGARD.suitTurn),
    suitSens: n(cam._suitSensitivityScalar, REGARD.suitSens),
    minDegreesY: n(cam._minDegreesY, REGARD.minDegreesY),
    maxDegreesY: n(cam._maxDegreesY, REGARD.maxDegreesY),
    souris: n(lacet && lacet.souris, REGARD.souris),
    zoneMorte: n(lacet && lacet.zoneMorte, REGARD.zoneMorte),
  };
}

/**
 * Une image de regard.
 *
 * @param sourisDx, sourisDy  pixels de souris cumules sur l'image (y vers le bas)
 * @param padX, padY          manche droit, zone morte passee (y vers le bas)
 * @param dt                  duree de l'image, en secondes
 * @param sensibilite         `Axis._sensitivity / 5`, signe de l'inversion compris
 * @param fovRatio            champ courant / champ initial
 * @returns {dYaw, dPitch} en radians ; `dPitch` positif baisse le regard,
 *          comme le tangage du portage
 */
export function pasDeRegard({ sourisDx = 0, sourisDy = 0, padX = 0, padY = 0, dt = 0,
                              sensibilite = 1, fovRatio = 1, lunette = false, combinaison = false },
                            c = REGARD) {
  const axeX = sourisDx * c.souris + padX;
  // `Mouse Y` et le manche inverse (`invert` sur `Pitch_PC`) montent vers le
  // HAUT ; l'ecran et la Gamepad API descendent.
  const axeY = -(sourisDy * c.souris + padY);
  const tour = c.turnRate * (lunette ? c.telescopeTurn : combinaison ? c.suitTurn : 1);
  const leve = c.sensitivityY * (lunette ? c.telescopeSens : combinaison ? c.suitSens : 1);
  const rad = Math.PI / 180;
  return {
    dYaw: axeX * Math.abs(sensibilite) * tour * fovRatio * dt * rad,
    dPitch: -axeY * sensibilite * leve * fovRatio * dt * rad,
  };
}

/** Le tangage borne comme `_degreesY`, dans la convention du portage. */
export function borneTangage(pitch, c = REGARD) {
  return Math.max(-c.maxDegreesY * Math.PI / 180,
                  Math.min(-c.minDegreesY * Math.PI / 180, pitch));
}
