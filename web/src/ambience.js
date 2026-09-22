// Les zones d'ambiance : ce qu'on entend, selon ou l'on est.
//
// Dix-sept volumes poses dans la scene — quatorze `AudioVolume` et trois
// `DayNightAudioVolume` — dont rien ne lisait ni la forme, ni le clip, ni la
// priorite. Le portage jouait toutes ses sources a la proximite : une grotte,
// un musee et un village sonnaient ensemble des qu'on en approchait.
//
// CE QUE LE BUILD FAIT, ET QUI N'EST PAS DE LA PROXIMITE. Chaque volume porte
// une COUCHE et une PRIORITE. Dans une couche, une seule zone joue : la plus
// prioritaire parmi celles qui contiennent l'auditeur. Les autres se taisent en
// fondu. Les couches, elles, jouent ensemble — c'est ce qui superpose une
// musique de village a l'ambiance de son atmosphere.
//
//   couche 0   les interieurs : Hatch et MusicVolume a 100, les grottes et le
//              musee a 2, TheDepthsMusic a 100
//   couche 1   le dehors : Atmosphere a 0, les cavernes a 1, DeepFluid a 3,
//              l'ocean a 1 — la priorite decide qui couvre qui
//   couche 2   la musique de lieu : AncientMusic, VillageMusic, MusicVolume
//
// Trois choses mesurees qui ne se devinaient pas :
//
//   - le clip d'une zone est vise par `_clip`, et l'`AudioSource` posee sur le
//     meme objet est serialisee SANS clip. Les apparier par objet rendait les
//     dix-sept zones muettes ;
//   - six zones sur dix-sept n'ont PAS de collider. Leur forme est celle des
//     `EntrywayTrigger` poses sous elles — et un seuil n'est pas une
//     contenance : il dit dans quel SENS on l'a traverse. Avoir servi la
//     premiere boite d'enfant comme portee reduisait la grotte aux quatre
//     portes a UNE porte de onze metres (docs/84-ambiance.md) ;
//   - les priorites vont de 0 a 100 et NE sont PAS uniques dans une couche :
//     cinq zones de la couche 1 sont a 0.
//
// CE QUE CE FICHIER A CRU, ET QUE `AudioDetector` DEMENT. Le lot precedent
// avait pose trois regles de son cru, toutes plausibles, toutes fausses, et la
// quatrieme mesure les a defaites une par une (docs/104-arbitrage.md) :
//
//   - « les couches jouent ensemble » — la couche 0 CONCOURT avec les autres.
//     Elle les couvre toutes quand sa tete l'emporte, et se tait entierement
//     quand elle perd. C'est la loi qui fait qu'entrer dans le musee eteint le
//     village, et que le sas du vaisseau eteint tout ;
//   - « a egalite, la plus petite zone gagne » — a egalite, elles jouent
//     TOUTES. Le build ne departage pas parce qu'il n'a pas a le faire ;
//   - « une couche qui change de zone se libere d'abord » — non : la sortante
//     descend et l'entrante monte EN MEME TEMPS. C'est un fondu enchaine.
//
// Ce que le build donne aussi, et qu'on croyait lui manquer : la FORME du
// fondu. Elle est dans `OWAudioSource.UpdateLocalFade`, et elle est lineaire —
// ce n'etait donc pas un choix de ce portage, c'etait une mesure qu'on n'avait
// pas faite. Avec elle vient un detail de rythme qui, lui, s'entend :
//
//   `FadeTo` repart de la valeur COURANTE et se donne la duree ENTIERE. Un
//   fondu interrompu a mi-chemin puis inverse ne reprend pas le meme rythme :
//   il remet deux secondes au compteur depuis la ou il en etait. Le portage
//   avancait `gain += dt / duree`, un rythme constant, et remontait donc de
//   moitie deux fois trop vite.
//
// `_dayWindow` vaut 200 sur les trois volumes jour/nuit, et `IsDay` dit ce que
// c'est : la LARGEUR EN DEGRES de l'arc de jour, centre sur le point subsolaire.
// 200 et non 180 — le jour deborde de dix degres de part et d'autre du
// terminateur. Le portage lui preferait son propre signal de nuit ; c'est la
// loi du build qui le remplace.

// @lit AudioVolume, DayNightAudioVolume, AudioDetector, OWAudioSource
// Les dix-sept volumes d'ambiance, arbitres par couche et priorite.

import { ZonePresence, zonesAround, attachEntryways } from "./entryways.js";

/**
 * Charge les zones depuis le meme fichier que les sources.
 *
 * Elles y vivent a cote (`volumes`) parce qu'elles partagent les clips : une
 * zone et une source placee peuvent viser le meme fichier, et l'exporter deux
 * fois serait le telecharger deux fois.
 */
export async function loadAmbience() {
  try {
    const res = await fetch("data/audio/sources.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return (await res.json()).volumes || [];
  } catch (e) {
    console.warn("zones d'ambiance absentes :", e.message);
    return [];
  }
}

/**
 * Zones d'ambiance extraites, jointes a leurs SEUILS.
 *
 * Six des dix-sept n'ont pas de collider : la grotte aux quatre portes, sa
 * voisine a deux, la grotte et le musee de Timber Hearth, la musique de la cite
 * enterree et la trappe du vaisseau. Leur forme est celle de leurs
 * `EntrywayTrigger`, et le lien vit dans la HIERARCHIE — d'ou la jointure par
 * nom ET par corps : il y a deux `MusicVolume` dans la scene, l'un sur la lune
 * quantique avec sa sphere de cent, l'autre sous la cite enterree avec ses six
 * portes (docs/84-ambiance.md).
 */
export function ambienceZones(audio, seuils = []) {
  return attachEntryways((audio && audio.volumes) || [], seuils)
    .filter((z) => z.file && (z.volume || z.entryways.length));
}

/**
 * Les zones qui SONNENT, parmi celles ou l'on est.
 *
 * `AudioDetector.UpdateActivation`, plus la boucle de tete d'`ActivateLayer`.
 * Le detecteur tient, par couche, une liste triee par priorite croissante ;
 * `GetHighestPriority(couche)` est donc la priorite du DERNIER element, et vaut
 * -1 quand la couche est vide — `Awake` pose la couche 0 des le depart, ce qui
 * rend ce -1 atteignable pour elle seule.
 *
 *     bool couche0 = false;
 *     if (haut(0) < hautNonZero) DeactivateLayer(0);
 *     else { ActivateLayer(0); couche0 = true; }
 *     foreach (couche l != 0)
 *         if (!couche0 || haut(l) >= haut(0)) ActivateLayer(l);
 *         else                                DeactivateLayer(l);
 *
 * Deux choses s'y lisent, et aucune des deux n'avait ete devinee.
 *
 * LA COUCHE 0 N'EST PAS UNE COUCHE COMME LES AUTRES. Elle concourt contre le
 * meilleur de toutes les autres reunies (`_highestNonZeroPriority`, dont le nom
 * dit mal ce qu'il est : le maximum sur les couches NON NULLES). Si elle gagne,
 * elle joue et toute couche moins bien classee qu'elle se tait ; si elle perd,
 * elle se tait et toutes les autres jouent. C'est la loi qui fait que le sas du
 * vaisseau (couche 0, priorite 100) eteint l'atmosphere et la musique, et que
 * le musee (couche 0, priorite 2) eteint le village — mais pas le fluide des
 * profondeurs (couche 1, priorite 3), qui le couvre a son tour.
 *
 * A EGALITE, TOUT JOUE. `ActivateLayer` remonte la liste depuis la fin et
 * active tant que la priorite egale la plus haute. Les cinq zones a 0 de la
 * couche 1 sonnent donc ensemble quand elles se recouvrent. La regle « la plus
 * petite gagne » que ce fichier portait etait une invention — stable, mais
 * inventee, et c'est exactement ce contre quoi le depot se garde.
 *
 * CE QUI N'EST PAS REFAIT, ET POURQUOI. Le detecteur est une machine a
 * evenements : `AddAudioVolume` et `RemoveAudioVolume` entretiennent la liste
 * triee et `_highestNonZeroPriority`, et n'appellent `UpdateActivation` que
 * quand la tete d'une couche BOUGE — les autres chemins ne peuvent rien changer
 * a l'image, et c'est verifiable ligne a ligne. Ce portage evalue donc
 * `UpdateActivation` a neuf a chaque pas, ce qui donne le meme resultat sans
 * garder d'etat.
 *
 * Sans garder d'etat, et c'est une difference assumee : `RemoveAudioVolume` ne
 * recalcule `_highestNonZeroPriority` que si le volume retire etait ACTIF, si
 * bien qu'un volume muet — parce que la couche 0 le couvrait — peut laisser
 * derriere lui un maximum perime jusqu'au prochain `UpdateActivation`. C'est un
 * defaut du build, il depend de l'ORDRE des entrees et des sorties, et aucune
 * fonction pure ne peut le porter. On le nomme plutot que de le taire.
 *
 * `CalculateHighestNonZeroPriority` n'est que ce recalcul, et `ShowLog` de la
 * mise au point du studio.
 *
 * @param presentes zones ou l'auditeur se trouve — par contenance ou par seuil
 * @returns {Array} les zones actives, dans l'ordre d'entree
 */
export function zonesActives(presentes) {
  const haut = new Map();
  for (const z of presentes) {
    const l = z.layer | 0;
    if (!haut.has(l) || z.priority > haut.get(l)) haut.set(l, z.priority);
  }
  const h = (l) => (haut.has(l) ? haut.get(l) : -1);
  let hautNonZero = -1;
  for (const [l, p] of haut) if (l !== 0) hautNonZero = Math.max(hautNonZero, p);
  const couche0 = h(0) >= hautNonZero;
  const out = [];
  for (const z of presentes) {
    const l = z.layer | 0;
    if (z.priority !== h(l)) continue;      // pas la tete de sa couche
    if (l === 0) { if (couche0) out.push(z); }
    else if (!couche0 || h(l) >= h(0)) out.push(z);
  }
  return out;
}

/**
 * `DayNightAudioVolume.IsDay`, et ce que `_dayWindow` veut dire.
 *
 *     float a = Vector3.Angle(planete.position - point.position,
 *                             point.position  - soleil.position);
 *     return a < _dayWindow * 0.5f;
 *
 * Le premier vecteur descend du point vers le centre de la planete, le second
 * suit le rayon de lumiere. Face au soleil ils sont colineaires (angle 0) ;
 * a l'oppose ils sont opposes (180). Le terminateur geometrique tombe donc un
 * peu au-dela de 90 — et le seuil, lui, est a `_dayWindow / 2` = **100**.
 *
 * Autrement dit `_dayWindow` est la LARGEUR de l'arc de jour, en degres,
 * centree sur le point subsolaire : 200 la ou la geometrie en donnerait 180.
 * Le jour se leve dix degres trop tot et se couche dix degres trop tard, ce qui
 * laisse l'ambiance de jour couvrir l'aube et le crepuscule.
 *
 * `_usePlayerPosition` decide d'ou l'on regarde : la position du joueur
 * (WindyAmbience) ou celle du volume (les deux du village). Une zone posee au
 * village bascule donc a l'heure DU VILLAGE, et non a celle de l'auditeur.
 */
export function isDay(dayWindow, planetPos, point, sunPos) {
  const a = [planetPos[0] - point[0], planetPos[1] - point[1], planetPos[2] - point[2]];
  const b = [point[0] - sunPos[0], point[1] - sunPos[1], point[2] - sunPos[2]];
  const na = Math.hypot(a[0], a[1], a[2]);
  const nb = Math.hypot(b[0], b[1], b[2]);
  if (na === 0 || nb === 0) return true;    // Vector3.Angle rend 0
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb);
  const angle = Math.acos(Math.min(1, Math.max(-1, c))) * 180 / Math.PI;
  return angle < dayWindow * 0.5;
}

/**
 * Une zone bascule-t-elle avec le jour ?
 *
 * `DayNightAudioVolume` en est un, et il en reste un meme SANS clip de nuit :
 * `VillageMusic` n'en a pas, et c'est precisement ce qui la fait se taire la
 * nuit au lieu de changer de morceau.
 */
function jourNuit(z) {
  return z.kind === "DayNightAudioVolume" || z.nightFile !== undefined;
}

/**
 * `OWAudioSource.UpdateSourceVolume` — ce que le fondu ci-dessous commande, et
 * ce qu'il ne commande PAS.
 *
 *     _audioSource.volume = _maxSourceVolume * _localVolume
 *                         * _audioTrack.GetVolume();
 *
 * TROIS FACTEURS, ET UN SEUL EST A LA SOURCE. `_maxSourceVolume` est son
 * plafond, serialise ; `_localVolume` est ce que le fondu deplace, de 0 a 1 ;
 * et `_audioTrack.GetVolume()` est le volume de la PISTE — un reglage commun a
 * toutes les sources qui la partagent. Une source ne connait donc jamais son
 * volume final : elle connait sa part.
 *
 * Ce portage n'a pas de pistes : `AmbienceMixer` applique le produit des deux
 * premiers, et le navigateur tient le troisieme sur son noeud de sortie. Le
 * resultat est le meme produit, range ailleurs (docs/121-avis.md).
 */

/**
 * Le fondu d'`OWAudioSource`, et il tient en quatre methodes.
 *
 *     FadeTo(cible, duree, pause)
 *         if (!source.isPlaying) source.Play();
 *         _initFadeVolume = _localVolume;      // DE LA OU L'ON EST
 *         _targetFadeVolume = cible; _fadeDuration = duree;
 *         _initFadeTime = Time.time; _fadingOut = false;
 *     FadeIn(duree, force, hasard)
 *         if (force || !source.isPlaying) { _localVolume = 0;
 *                                           if (hasard) RandomizePlayhead(); }
 *         FadeTo(1, duree, false);
 *     FadeOut(duree, pause)  { FadeTo(0, duree, pause); _fadingOut = true; }
 *     UpdateLocalFade()
 *         float t = _fadeDuration > 0
 *                 ? Mathf.Clamp01((Time.time - _initFadeTime) / _fadeDuration) : 1;
 *         _localVolume = _initFadeVolume + (_target - _initFadeVolume) * t;
 *         if (_localVolume <= 0 && _fadingOut)
 *             { if (_pauseOnFadeOut) source.Pause(); else source.Stop(); }
 *
 * LE PIEGE EST DANS `FadeTo`, ET IL S'ENTEND. La duree n'est pas un rythme :
 * elle est remise a neuf a chaque appel, depuis la valeur courante. Entrer dans
 * une zone, ressortir a mi-fondu puis y rentrer aussitot ne reprend pas la
 * montee la ou elle en etait — cela redonne deux secondes pleines pour parcourir
 * la moitie qui reste. Le portage avancait a rythme constant et arrivait deux
 * fois trop vite.
 *
 * `FadeIn` ne remet a zero que si la source ne joue PAS. Une zone reprise en
 * plein fondu de sortie continue donc d'ou elle en etait, sans saut — et c'est
 * la seule chose qui rende le va-et-vient sur un seuil supportable.
 *
 * DEUX CHAMPS QUE RIEN NE LISAIT, ET LEURS DEUX PORTEURS :
 *
 *   `_randomizePlayhead`  WindyAmbience et VillageAmbience_Day. Une boucle
 *                         d'ambiance reprise au meme endroit se reconnait ; on
 *                         la relance donc a un point tire au hasard.
 *   `_pauseOnFadeOut`     VillageMusic, et elle seule. La musique du village
 *                         ne se rembobine pas : elle se met en PAUSE, et
 *                         reprend a la note ou on l'avait laissee.
 *
 * CE QUE LE MOTEUR DOIT EN SAVOIR. Unity reprend une source mise en pause la
 * ou elle en etait, et rembobine celle qu'on a arretee — la distinction n'est
 * donc pas un ordre, c'est un ETAT de la source. Ce module ne suit pas
 * l'avancement d'un clip dont il ignore la duree : il dit seulement, par
 * `rembobine`, laquelle des deux choses le moteur doit faire au prochain
 * depart, et `offset` est une FRACTION que le moteur multiplie par la longueur
 * qu'il a chargee.
 */
export class Fondu {
  constructor({ pause = false, randomize = false, alea = Math.random } = {}) {
    this.pause = pause;
    this.randomize = randomize;
    this.alea = alea;
    this.gain = 0;
    this.joue = false;        // `AudioSource.isPlaying`
    this.rembobine = true;    // le prochain depart repart de `offset`...
    this.offset = 0;          // ... cette fraction-la ; sinon il REPREND
    this.depart = 0;
    this.cible = 0;
    this.duree = 0;
    this.t0 = 0;
    this.sort = false;        // `_fadingOut`
    this.pauseCourante = false;
  }

  /** `FadeTo`. */
  fadeTo(cible, duree, now, pause = false) {
    this.joue = true;         // `if (!isPlaying) Play()`
    this.depart = this.gain;
    this.cible = cible;
    this.duree = duree;
    this.t0 = now;
    this.sort = false;
    this.pauseCourante = pause;
  }

  /** `FadeIn(duree, force, _randomizePlayhead)`. */
  fadeIn(duree, now, force = false) {
    if (force || !this.joue) {
      this.gain = 0;
      // `RandomizePlayhead` pose `time` sans rien demander : elle defait donc
      // une pause. Aucun volume du build ne porte les deux drapeaux, mais la
      // loi n'a pas a inventer une precedence qu'elle n'a pas.
      if (this.randomize) { this.offset = this.alea(); this.rembobine = true; }
    }
    this.fadeTo(1, duree, now, false);
  }

  /** `FadeOut(duree, _pauseOnFadeOut)`. */
  fadeOut(duree, now) {
    this.fadeTo(0, duree, now, this.pause);
    this.sort = true;
  }

  /** `UpdateLocalFade`. */
  update(now) {
    const t = this.duree > 0
      ? Math.min(1, Math.max(0, (now - this.t0) / this.duree)) : 1;
    this.gain = this.depart + (this.cible - this.depart) * t;
    if (this.gain <= 0 && this.sort) {
      this.joue = false;
      this.sort = false;
      // `Pause()` garde la tete de lecture, `Stop()` la ramene au debut.
      if (this.pauseCourante) this.rembobine = false;
      else { this.rembobine = true; this.offset = 0; }
    }
    return this.gain;
  }
}

/**
 * Le detecteur et ses dix-sept volumes, avec leurs fondus.
 *
 * Etat pur : on le nourrit d'une position et d'un pas de temps, il rend ce qui
 * doit jouer et a quel volume. Rien ici ne connait Babylon.
 *
 * UNE SOURCE PAR CLIP, ET NON UNE PAR COUCHE. Un `DayNightAudioVolume` en porte
 * DEUX — `_owAudioSrc` pour le jour, `_nightSource` pour la nuit — et
 * `UpdatePlayState` les fond en sens inverse AU MEME MOMENT. Deux clips sonnent
 * donc ensemble pendant la bascule, ce qu'un melangeur range par couche ne
 * savait pas dire : il descendait d'abord a zero, ce qui creusait un trou de
 * deux secondes dans l'ambiance du village a chaque aube.
 *
 * Une zone peut rester ACTIVE sans rien jouer : `VillageMusic` est un volume
 * jour/nuit sans clip de nuit, donc la nuit elle se met en pause et se tait —
 * pour reprendre a la meme note au lever du jour.
 */
export class AmbienceMixer {
  constructor(zones = [], { alea = Math.random } = {}) {
    this.zones = zones;
    this.presences = zones.map((z) => new ZonePresence(z));
    this.t = 0;
    this.etats = zones.map((z, i) => ({
      i, zone: z, actif: false, jour: true, jourNuit: jourNuit(z),
      jourF: new Fondu({ pause: !!z.pauseOnFadeOut, randomize: !!z.randomize, alea }),
      nuitF: z.nightFile
        ? new Fondu({ pause: !!z.pauseOnFadeOut, randomize: !!z.randomize, alea })
        : null,
    }));
  }

  get count() { return this.zones.length; }

  /** Les sources qui sonnent, avec leur gain courant. */
  get playing() {
    const out = [];
    for (const e of this.etats) {
      for (const [f, fichier, quand] of [[e.jourF, e.zone.file, "jour"],
                                         [e.nuitF, e.zone.nightFile, "nuit"]]) {
        if (!f || !fichier || f.gain <= 0.001) continue;
        out.push({ layer: e.zone.layer | 0, file: fichier, gain: f.gain,
                   name: e.zone.name, key: `${e.i}:${quand}`,
                   rembobine: f.rembobine, offset: f.offset });
      }
    }
    return out;
  }

  /**
   * Avance d'un pas de temps.
   *
   * @param jourDe (zone) => bool — `IsDay` resolu par l'appelant, qui seul
   *   connait les positions du corps, du volume et du soleil. A defaut, le
   *   drapeau `night` sert de repli : la page doit rester ouvrable sans build.
   */
  update(dt, worldPoint, { night = false, shiftOf = null, jourDe = null } = {}) {
    this.t += dt;
    const presentes = new Set(zonesAround(this.presences, worldPoint, shiftOf));
    const actives = new Set(zonesActives([...presentes]));
    for (const e of this.etats) {
      const veut = actives.has(e.zone);
      const jour = e.jourNuit ? (jourDe ? !!jourDe(e.zone) : !night) : true;
      if (veut && !e.actif) {
        // `Activate` : un `AudioVolume` monte sa source, un `DayNightAudioVolume`
        // appelle `UpdatePlayState(IsDay())` — qui monte l'une et descend l'autre.
        e.actif = true;
        e.jour = jour;
        this._etat(e, jour);
      } else if (!veut && e.actif) {
        // `Deactivate` : les DEUX sources descendent, avec la meme duree.
        e.actif = false;
        e.jourF.fadeOut(duree(e.zone), this.t);
        if (e.nuitF) e.nuitF.fadeOut(duree(e.zone), this.t);
      } else if (veut && jour !== e.jour) {
        // `Update` ne surveille le jour QUE pendant que le volume est actif :
        // `Init` pose `enabled = false`, `Activate` le rallume.
        e.jour = jour;
        this._etat(e, jour);
      }
      e.jourF.update(this.t);
      if (e.nuitF) e.nuitF.update(this.t);
    }
    return this.playing;
  }

  /** `DayNightAudioVolume.UpdatePlayState` : l'un monte pendant que l'autre descend. */
  _etat(e, jour) {
    const d = duree(e.zone);
    if (jour) {
      e.jourF.fadeIn(d, this.t);
      if (e.nuitF) e.nuitF.fadeOut(d, this.t);
    } else {
      e.jourF.fadeOut(d, this.t);
      if (e.nuitF) e.nuitF.fadeIn(d, this.t);
    }
  }
}

function duree(zone) { return Math.max(0.05, (zone && zone.fade) || 2); }
