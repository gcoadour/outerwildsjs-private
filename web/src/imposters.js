// Les impostures de planete, et ce que la mesure en dit.
//
// @lit LODCameraSnapshot
// Le dernier point de rendu ouvert de docs/08-reste-a-faire.md §3, laisse par
// docs/44 en lot 8 et par docs/46 en « non porte, et pourquoi » : le jeu
// afficherait un systeme entier parce que les planetes lointaines sont des
// textures rafraichies une fois par seconde.
//
// C'EST A MOITIE VRAI, et la mesure le dit (docs/56-impostures.md). Sur les
// CINQ cameras d'imposture :
//
//   LODCam_BrittleHollow  -> LODPlane_BrittleHollow, BrittleHollow_Body    cable
//   LODCam_DarkBramble    -> LODPlane_DB,            DarkBramble_Body      cable
//   LODCam_TimberHearth   -> LODPlane_TimberHearth,  HomePlanet_graybox    GRAYBOX
//   GasGiantCam           -> aucun plan,             GiantsDeep_Body       mort
//   HourglassCam          -> aucun plan,             aucune planete        mort
//
// Deux cameras sur cinq n'ont pas de plan, et une troisieme vise une boite
// grise. Le systeme n'est pas une technique aboutie qu'il faudrait rattraper :
// c'est un chantier de l'alpha.
//
// `TakeSnapshot` dit pourquoi un plan manquant tue la camera :
//
//     transform.position = _planeTransform.position
//                        + _planeTransform.forward * _distanceToPlanet;
//     transform.LookAt(_planeTransform);
//     camera.Render();
//
// LA CAMERA SE RANGE PAR RAPPORT AU PLAN, pas a la planete. Elle se pose
// DEVANT lui — le long de son avant — et se retourne vers lui, si bien que la
// planete se retrouve derriere le plan, dans le champ. Sans `_planeTransform`,
// les trois lignes lancent une exception de reference nulle : les deux cameras
// sans plan ne sont pas « inertes », elles sont CASSEES, et c'est une raison
// de plus de ne pas chercher a les rattraper (docs/121-avis.md).
//
// CE QUE LE PORTAGE Y GAGNE QUAND MEME. Les trois plans cables sont dans la
// geometrie exportee, leur renderer est ACTIF, et ils se tournent vers la
// camera depuis docs/46 (lot 3). Le portage collait donc trois quads plats,
// textures d'un `*LODMaterial` de remplissage, PAR-DESSUS les vraies planetes.
// C'etait un defaut visible que personne n'avait relie a cette page.
//
// LA LOI, pour ceux qui sont cables :
//
//   Awake   texture de rendu 256x256, posee sur le `_MainTex` du plan ;
//           la camera est ETEINTE et ne rend que sur commande
//   Start   distance = |planete - camera|, mesuree UNE fois
//   Update  toutes les `_snapshotInterval` (1 s), a partir de
//           `_firstSnapshotTime` (1 ; 1,3 ; 1,6 — decales, pour ne pas rendre
//           les trois la meme image)
//   snapshot  camera = plan.position + plan.avant x distance, LookAt(plan),
//             puis un rendu
//
// La camera se met donc DERRIERE le plan, a la distance de la planete, et
// regarde vers lui : ce qu'elle capture est la planete qui se trouve au-dela.

/** Taille de la texture d'imposture, en dur dans `Awake`. */
export const IMPOSTER_SIZE = 256;

/**
 * Les impostures declarees, lues dans `data/camera.json`.
 *
 * `wired` dit si l'imposture est complete — un plan ET une planete. Les deux
 * qui ne le sont pas sont rendues quand meme, avec le drapeau a faux : c'est
 * une propriete du build, et la taire donnerait a croire qu'on les a manquees.
 */
export function planetImposters(camera) {
  const out = [];
  for (const c of (camera && camera.cameras) || []) {
    for (const l of (c.effects && c.effects.LODCameraSnapshot) || []) {
      out.push({
        camera: c.name,
        plane: l.plane || null,
        planet: l.planet || null,
        interval: l.interval ?? 1,
        firstSnapshot: l.firstSnapshot ?? 1,
        // `HomePlanet_graybox` est une boite grise : l'imposture est cablee,
        // mais sur un objet de remplissage. On le dit.
        graybox: /graybox/i.test(l.planet || ""),
        wired: !!(l.plane && l.planet),
      });
    }
  }
  return out;
}

/**
 * Une imposture vivante : quand faut-il refaire son image, et faut-il
 * seulement la montrer.
 */
export class Imposter {
  constructor(data) {
    this.data = data;
    this.next = data.firstSnapshot;
    this.shots = 0;
  }

  /**
   * Le build rend a instant fixe, et non a intervalle depuis le dernier rendu :
   * `_nextSnapshotTime += _snapshotInterval`. Une image sautee ne DECALE donc
   * pas les suivantes, et les trois impostures gardent leur decalage de
   * depart — ce qui etale leur cout au lieu de le concentrer.
   */
  due(t) {
    if (t <= this.next) return false;
    this.next += this.data.interval || 1;
    this.shots += 1;
    return true;
  }

  /**
   * Le plan ne se montre que si la vraie geometrie n'est PAS la.
   *
   * Le build n'a pas ce test : il n'affiche jamais les deux, parce que sa
   * planete lointaine n'est pas chargee. Ce portage, lui, charge la geometrie
   * par secteur et peut avoir les deux sous les yeux — auquel cas l'imposture
   * est un quad plat colle sur une vraie planete.
   */
  visible(realGeometryLoaded) { return !realGeometryLoaded; }

  /**
   * La position de la camera d'imposture : derriere le plan, a la distance de
   * la planete, regardant le plan.
   */
  cameraPosition(planePosition, planeForward, distance) {
    return [planePosition[0] + planeForward[0] * distance,
            planePosition[1] + planeForward[1] * distance,
            planePosition[2] + planeForward[2] * distance];
  }

  reset() { this.next = this.data.firstSnapshot; this.shots = 0; }
}
