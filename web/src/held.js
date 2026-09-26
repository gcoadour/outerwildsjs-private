// Ce que le joueur tient dans la main.
//
// Deux objets pendent sous `PlayerCamera` dans la scene du build, et aucun
// n'etait porte : l'export glTF part des corps celestes, et une main n'en est
// pas un ([`docs/64`](../../docs/64-mains.md)).
//
//   MarshmallowStick   Animation + MarshmallowStick, quatre clips
//     stick_root/Needle          l'aiguille du thermometre
//     StickAndTherm/polySurface1..4
//     MallowLight, ThermLight    deux lumieres
//     Marshmallow                Marshmallow + Flame + HeatDetector
//   TelescopeGUI       telescopeBody, telescopeGlass
//
// Le baton porte les QUATRE seuls clips du build qui ne bouclent pas
// ([`docs/63`](../../docs/63-boucles.md)), et l'un des quatre n'est pas une
// animation au sens ou on l'entend : `Therm` est SCRUBBE a la main, vitesse
// zero, sur la chaleur recue. Le thermometre est une pose d'animation, pas un
// widget.
//
// Logique pure : ni Babylon, ni DOM.
//
// @lit MarshmallowStick, Marshmallow, TelescopeGUI, RadiationDetector

// `RadiationDetector`, ET CE QUI EN EST MORT DANS CE BUILD. Le portage lit
// `TotalHeat` — la chaleur, qui grille la guimauve — et rien d'autre. Les
// quatre methodes qui restent se ferment a la lecture (docs/103-refait.md) :
//
//   TotalLight, TotalRadiation   de simples lectures de champ (`oldTotalLight`,
//                                `oldTotalRadiation`), et leurs SEULS appelants
//                                sont `Test`, `RadiationDetectorTestPrinter` et
//                                `LensFlareFlicker` — dont la scene ne pose
//                                AUCUNE instance. Rien ne les lit en jeu ;
//   AddEmitter, RemoveEmitter    la liste des emetteurs. Une seule chose s'y
//                                decide, et elle merite d'etre notee :
//
//     if (UseRaycasts) radiationEmitters.Add(emitter, poids);
//     else             radiationEmitters.Add(emitter, 1);
//
//   — sans lancer de rayon, un emetteur compte pour UN, quel que soit le poids
//   qu'on lui donne. Le poids n'existe que si le detecteur trace vers chaque
//   source.

/**
 * `MarshmallowStick.Update` : `_marshmallow.GetHeatLevel() / 40f`.
 *
 * Quarante unites de chaleur parcourent le clip entier. La division est ecrite
 * telle quelle dans l'IL, sans borne : au-dela, `AnimationState.time` depasse
 * la duree du clip, et Unity le laisse a sa derniere pose puisque le clip est
 * en `Once`. On borne donc a la duree plutot qu'a la chaleur.
 *
 * `Marshmallow.Toast(quantite)` est ce qui remplit ce compteur, et c'est tout
 * ce qu'elle fait : `_toastLevel += quantite`. PAS DE BORNE, pas de vitesse,
 * pas de seuil — la guimauve accumule sans fin, et c'est `GetHeatLevel` qui
 * rend ce total tel quel. Une guimauve oubliee sur le feu ne « brule » donc
 * pas a un moment precis : elle depasse, simplement, et l'animation reste a sa
 * derniere pose. Le portage accumule de meme (docs/121-avis.md).
 */
export const THERM_HEAT_SPAN = 40;

/**
 * Les deux lumieres du baton, lues sur le prefabrique de la scene.
 *
 * Le glTF ne les emporte pas — l'exporteur n'ecrit que de la geometrie — et
 * elles sont trop peu nombreuses pour meriter un extracteur : deux points, une
 * position locale, une portee et une intensite. Elles sont donc ici, comme les
 * autres nombres mesures, et un test les compare au build.
 *
 * Les deux sont `m_Type` 2 (ponctuelles) et partent ETEINTES : `ToggleStick`
 * les allume en sortant le baton.
 */
export const STICK_LIGHTS = [
  { name: "MallowLight", position: [-0.035279, 0.100099, 0.565471],
    range: 1.21, intensity: 0.4, enabled: false },
  { name: "ThermLight", position: [-0.090081, 0.075408, 0.199992],
    range: 0.16, intensity: 2, enabled: false },
];

/** Les quatre clips du baton, dans l'ordre ou ils se jouent. */
export const STICK_CLIPS = ["PullOut", "idle", "PutBack", "Therm"];

/**
 * La pose du thermometre, en secondes dans le clip `Therm`.
 *
 * @param heat    chaleur totale recue (`RadiationDetector.TotalHeat`)
 * @param length  duree du clip, qui borne la pose
 */
export function thermTime(heat, length = 1) {
  const t = Math.max(0, heat) / THERM_HEAT_SPAN;
  return t > length ? length : t;
}

/**
 * Le baton a guimauve : sorti ou range, et ce qui se joue.
 *
 * UNE LECTURE A CORRIGER. Ce commentaire disait : « `Awake` met deux clips a la
 * queue — `PullOut` puis `idle` — donc le baton est DEHORS au premier instant
 * du jeu ». L'IL dit une alternative, pas une suite :
 *
 *     if (_isOut) animation.PlayQueued("PullOut");
 *     else        animation.PlayQueued("idle");
 *
 * et la scene pose `_isOut` a FAUX. Le baton part range, et ses deux lumieres
 * — que `Awake` ne touche pas — gardent leur `m_Enabled` serialise, eteint. Le
 * portage les allumait des le reveil : collees au regard, elles faisaient une
 * tache orange sur toute paroi approchee a moins d'un metre, que l'alpha n'a
 * pas (docs/132).
 *
 * `ToggleStick(true)` ne joue que `PullOut` : rien ne suit, et le baton reste
 * sur la derniere pose du clip. Les quatre clips sont en `Once`.
 */
export class MarshmallowStick {
  /**
   * @param isOut    `_isOut`, serialise sur l'instance (faux dans ce build)
   * @param lightsOn les `m_Enabled` des deux lumieres (eteintes)
   */
  constructor({ isOut = false, lightsOn = false } = {}) {
    this.out = !!isOut;
    this.queue = [isOut ? "PullOut" : "idle"];
    // `_canTherm` n'est pose que par `ToggleStick` : faux au reveil.
    this.canTherm = false;
    this.lights = !!lightsOn;
    this.flame = false;
    // `_hasBeenPutAwayOnce` : le build le tient pour son tutoriel.
    this.putAwayOnce = false;
    this.events = [];
  }

  /** Le clip a jouer maintenant, ou null si la file est vide. */
  get clip() { return this.queue.length ? this.queue[0] : null; }

  /**
   * `ToggleStick` : sortir, ou ranger.
   *
   * Sortir eteint la flamme et allume les deux lumieres ; ranger eteint les
   * lumieres, remet la guimauve a neuf et coupe le thermometre.
   */
  toggle() {
    this.events = [];
    if (!this.out) {
      this.flame = false;
      this.queue = ["PullOut"];
      this.out = true;
      this.canTherm = true;
      this.lights = true;
      this.events.push("StickOut");
    } else {
      this.lights = false;
      this.canTherm = false;
      this.queue = ["PutBack"];
      this.out = false;
      this.putAwayOnce = true;
      this.events.push("StickAway", "ResetMarshmallow");
    }
    return this.out;
  }

  /**
   * @param dt
   * @param etat { eaten, heat, playing }
   *   `eaten`   la guimauve vient d'etre mangee — le baton se range SEUL
   *   `heat`    la chaleur recue, pour la pose du thermometre
   *   `playing` un clip est-il en cours ? La file avance quand il finit.
   */
  update(dt, { eaten = false, heat = 0, playing = false } = {}) {
    this.events = [];
    // `Update` : « si le baton est dehors et la guimauve mangee, on range ».
    if (this.out && eaten) {
      this.toggle();
      return this;
    }
    if (!playing && this.queue.length > 1) this.queue.shift();
    // La flamme ne se voit que baton dehors, et une fois l'animation finie.
    this.flame = this.out && !playing;
    this.therm = this.canTherm ? thermTime(heat) : null;
    return this;
  }
}
