# La queue de `refait.mjs` : 176 sur 176, et sept lois de plus en chemin

Ce lot ferme les vingt dernières méthodes que
[`103`](103-refait.md) listait. La plupart se ferment à la lecture — c'est le
résultat attendu d'un dénominateur qui compte des noms. Sept ne le faisaient
pas.

## 1. Une notification en cours fait tomber la suivante

```
NotificationManager.DisplayNotification(go, duree)
    if (_currentNotification == null) {
        _currentNotification = go;  enabled = true;
        _displayDuration = duree;  _initDisplayTime = Time.time;
        _currentNotification.SetActive(true); }
```

Pas de file, pas de remplacement : la seconde est **perdue**. Le portage
écrasait la courante, si bien que deux avis coup sur coup n'en laissaient voir
qu'un — le **second**, là où le build montre le **premier** pour toute sa durée.
Le test qui gardait cela disait « une nouvelle remplace l'ancienne » : encore un
invariant sur un raisonnement.

Et il n'y a **qu'une** notification dans ce build. `NotificationManager` porte un
seul objet, `ProbeLaunchWindowObstructed`, affiché **1,5 s** par
`OnProbeLaunchAborted`, avec un son négatif. Le portage avait la classe, le
refus de tir *et* l'annonce — jamais reliés. Refuser un tir de sonde
n'affichait rien.

## 2. Le départ d'un téléporteur n'est pas l'arrivée

```
AncientTeleporter.FireTeleporter()
    _teleportParticles.Play();
    audio.PlayOneShot(_teleportSound);
    _receiver.TeleportBody(_playerBody, 0.5f);
    FireEvent("TeleportPlayer");

AncientTeleportReceiver.TeleportBody(corps, delai)
    if (delai > 0f) { _incomingBody = corps; _teleportTime = Time.time;
                      _teleportDelay = delai; enabled = true; }
    else            RelocateBody(corps);
```

Particules et son **tout de suite**, le corps **une demi-seconde plus tard**. Le
portage faisait tout dans la même image : on entendait le passage en étant déjà
de l'autre côté.

Le zéro est la porte de service, et elle sert :
`TimeLoopTeleportReceiver.RelocateBody` appelle la relocalisation directement —
le retour au début de boucle est **instantané**, et s'annonce en plus par
`EnterTimeLoopCentral`.

## 3. Les météores tombaient vers ce que le joueur avait sous les pieds

`step(dt, field)` recevait `player.field` — le champ dominant **du joueur**. Un
caillou au-dessus de Brittle Hollow retombait donc vers la planète où se
trouvait le joueur, ailleurs.

Pire : les météores vivent en coordonnées **monde** (celles de leurs lanceurs)
et le contact était testé contre `player.pos`, qui est dans le repère courant.
Le contact ne pouvait donc **jamais** se produire, et la sphère dessinée
n'était pas non plus au bon endroit.

`LaunchMeteor` dit le reste :

```
m.transform.parent = transform.root;          // la RACINE, pas le lanceur
if (_targetBody != null && _targetBody.GetGravityField() != null)
    m.GetSingleFieldDetector().SetDetectableField(champ, true);
```

Le météore est rattaché à la racine — il part avec la pose du lanceur et ne le
suit plus, sans quoi un lanceur qui tourne avec sa planète emporterait ses
propres cailloux. Et `_targetBody` est **nul sur les quatre lanceurs** : le
détecteur à champ unique n'est jamais posé dans ce build, et c'est donc bien la
règle du champ dominant qui s'applique — **lue au météore**.

## 4. Une case du trace est épinglée au milieu

```
DrawSoundWave.ShiftPoints()
    for (int i = _points.Length - 1; i >= 0; i--) {
        if (i == 0) _points[0] = _points[_points.Length - 1];
        else        _points[i] = _points[i - 1];
        if (i == 497) _points[i] = 0.5f;
    }
```

Le tableau fait 500 cases, et la **497e** est remise à 0,5 à chaque image, quoi
qu'on y ait écrit. Le tracé de la lunette porte un cran plat permanent près de
son bord droit. Il n'y a rien à comprendre : c'est écrit, et c'est reproduit.

`CreateLineMaterial` construit son matériau depuis une source de shader écrite
en dur — `Blend SrcAlpha OneMinusSrcAlpha`, `ZWrite Off`, `Cull Off`, `Fog Off`,
sommets et couleurs seulement. Un canevas 2D a exactement ces propriétés sans
avoir à les demander.

## 5. Ce que le reste disait, en une ligne chacun

- **`BlackHoleVolume.Vanish`** éteint les rendus du corps **un à un**, puis le
  remet au trou blanc. Entre les deux il est invisible et bien là — c'est ce qui
  fait qu'un morceau de croûte avalé ne laisse rien voir du transit.
- **`PlayerJetpackController.ReadRotationalInput`** : roulis et lacet **ne
  s'additionnent jamais**, et pour le joueur le roulis n'est jamais le défaut —
  il faut tenir `swapRollAndYaw`. Le tangage, lui, passe toujours.
- **`ReferenceFrameVolume.GenerateReferenceFrame`** passe `(0f, 0f)` là où
  **`MajorReferenceFrameVolume`** passe ses deux distances : un référentiel
  ordinaire ne peut être ni une destination de pilote automatique ni une cible
  d'alignement. La différence était mesurée depuis [`46`](46-migration-lots.md),
  elle n'était pas nommée.
- **`LODCameraSnapshot.TakeSnapshot`** place la caméra **devant le plan**, le
  long de son avant, et se retourne vers lui. Sans `_planeTransform`, les trois
  lignes lèvent une exception : les deux caméras sans plan ne sont pas inertes,
  elles sont **cassées**.
- **`MakeChildrenBreakable.MakeBreakable`** rend **tout** enfant cassable, puis
  tire au sort ceux qui seront *en plus* détachables. Les deux ne s'excluent
  pas, et celui qui perd reçoit un collider — il reste solide.
- **`RemoteFlightConsole.RespawnModelShip`** repose le vaisseau modèle avec **la
  vitesse du point** où il atterrit, jamais zéro. Même loi qu'en se levant du
  poste de pilotage, et pour la même raison : l'observatoire tourne.
- **`OWAudioSource.UpdateSourceVolume`** est un produit de **trois** facteurs,
  dont un commun à toute une piste : une source ne connaît jamais son volume
  final, seulement sa part.
- **`CenterOfTheUniverse.RecenterUniverseAroundPlayer`** retranche la position
  du **corps centre**, pas celle du joueur — malgré son nom —, et seulement aux
  enfants directs.
- **`PlayerCameraController.AddDegreesY`** est `_degreesY += d`, et c'est ce qui
  en fait une trouvaille : le cap du build est un **champ** qu'on pousse, jamais
  re-dérivé. Ce portage re-dérive le sien du haut et doit donc rendre les deux
  angles ([`106`](106-redressement.md)).

## 6. Et celles qui se ferment vraiment à la lecture

`OffsetTextureAnimate.Main` est **vide** — le point d'entrée qu'UnityScript
ajoute à tout script. `DS_Decals.AddDecalsMeshRendererComponentToGameObject` est
une fabrique d'éditeur que rien dans la scène n'appelle.
`BlinkingRenderer.Activate` poserait une durée limitée : elle n'a **aucun
appelant**, et les deux instances clignotent sans fin depuis leur valeur
sérialisée. `EntrywayTrigger.FireEntryEvent` n'est qu'un relais vers le délégué —
le seuil porte la géométrie, l'effet porte la conséquence.
`ProbeHorizonTracker.TrackHorizon` s'arme et range deux références.
`Marshmallow.Toast` est `_toastLevel += quantité`, **sans borne** : une guimauve
oubliée ne brûle pas à un moment précis, elle dépasse.

> Une méthode qu'on lit et qui ne demande rien est un résultat, pas un échec.
> Le dénominateur n'a jamais promis que 176 méthodes cachaient 176 lois — il a
> promis qu'on les aurait toutes ouvertes.

## Gardé par

- `tests/09-jeu.mjs` — la notification qui tombe (et celle qui passe une fois la
  place libre), l'avis unique et sa durée, le téléporteur qui annonce son départ
  puis arrive une demi-seconde après, le champ des météores demandé **à leur
  position**, et la case 497 épinglée au milieu d'un tracé par ailleurs saturé.
