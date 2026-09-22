# Se lever ne range rien : le poste de pilotage, la vue d'atterrissage, et une poussée qu'on redresse

`FlightConsole` et `ShipThrusterController` ont une particularité : le portage
en tenait l'essentiel — la bascule à 0,45 s, l'écrêtage orbital, l'inversion du
roulis, l'allumage — et ce qui manquait n'était pas *un morceau de plus*, mais
**ce qui arrive quand on se lève au mauvais moment**.

## 1. `ExitFlightConsole` ferme la vue, et rien d'autre

```
ExitFlightConsole()
    _playerAttachPoint.DetachPlayer();
    _interactVolume.ResetInteraction();
    if (!_playerCam.enabled) ExitLandingView();
    _shipController.enabled = false;
    enabled = false;
    _doLandingCamTransition = false;
    audio.PlayOneShot(_unbuckleSound);
    FireEvent("ExitFlightConsole");
```

Trois choses s'y lisent, et le portage n'en faisait aucune.

**La vue tombe.** `!_playerCam.enabled` veut dire « la caméra d'atterrissage est
passée » : on repasse alors par `ExitLandingView`, avec son `CenterCamera(140)`
et ses deux annonces. Le portage laissait la vue d'atterrissage **ouverte** en
se levant : on quittait le poste en regardant toujours le sol par une caméra
sous le vaisseau.

**Une bascule en cours est annulée.** `_doLandingCamTransition = false`, sans
`ExitLandingView` — la caméra n'était pas encore passée, la vue n'a jamais eu
lieu, et rien ne s'annonce. C'est la seule façon de sortir de la transition
autrement qu'en la laissant finir.

**Le roulis, lui, n'est pas rangé.** `InvertRoll` et `SetRollByDefault` ne
vivent que dans la branche de la touche, au fond de `FlightConsole.Update` :

```
if (_landingCam.enabled) ExitLandingView();
else { ... _doLandingCamTransition = true; ... SnapToDegrees(0, -70, 140); }
_shipController.InvertRoll();
_shipController.SetRollByDefault(_doLandingCamTransition);
```

Se lever en vue d'atterrissage laisse donc `_flipRollFactor` à **-1** et
`_rollByDefault` à **vrai**. Le manche roule à l'envers, et il n'existe aucun
chemin qui le répare en se levant.

## 2. `ResetRollSettings` est ce filet, et il se déclenche en s'asseyant

```
ResetRollSettings()
    _rollByDefault = false; _flipRollFactor = 1; _isRollMode = false;
```

Un seul appelant dans tout le build : `FlightConsole.OnPressInteract`, juste
après `_shipController.enabled = true`. **En s'asseyant.** On cherchait la
remise à plat du mauvais côté de la transition ; elle est de l'autre.

> Une méthode qui répare un état n'est pas forcément appelée là où l'état se
> casse. Celle-ci attend le tour suivant.

## 3. `UpdateLandingMode` ne tourne pas hors du poste

```
UpdateLandingMode()
    if (_doLandingCamTransition && Time.time > _initLandingCamTime + 0.45f) {
        _landingCam.enabled = true; _playerCam.enabled = false;
        _doLandingCamTransition = false;
        FireEvent("SwitchActiveCamera", _landingCam);
        FireEvent("EnterLandingView"); }
    if (!_isLandingMode && _landingCam.enabled && GetAllowLandingMode()) {
        _isLandingMode = true; FireEvent("EnterLandingMode", _referenceFrame); }
    else if (_isLandingMode && (!_landingCam.enabled || !GetAllowLandingMode())) {
        _isLandingMode = false; FireEvent("ExitLandingMode"); }
```

Elle est appelée depuis `Update`, et `ExitFlightConsole` pose `enabled = false`.
Se lever **n'annonce donc pas** `ExitLandingMode` : `_isLandingMode` reste vrai
jusqu'à ce qu'on se rassoie, et l'annonce part alors, en retard d'un aller-retour.

C'est une bizarrerie, elle est sans conséquence de jeu — debout, on ne pousse
pas —, et elle est reproduite : l'appel à `updateMode` est gardé par « assis »,
pas seulement l'état.

`GetAllowLandingMode` s'ouvre d'ailleurs sur `if (!enabled) return false` :
le mode ne s'établit **pas** hors du poste, même en orbite basse. C'est la
quatrième condition, et elle se lisait mal parce qu'elle ne parle pas du
vaisseau.

## 4. La poussée est REDRESSÉE avant d'être écrêtée

La ligne manquante de `ReadTranslationalInput` :

```
Quaternion q = Quaternion.FromToRotation(-transform.up, d);
Vector3 thrust = q * transform.TransformDirection(input * maxThrust);
```

`d` va du vaisseau vers le centre du référentiel. La rotation amène le **bas du
vaisseau** sur ce radial, et la sortie — `InverseTransformDirection(thrust) /
maxThrust` — ne la défait jamais.

Quand l'écrêtage mord sur un vaisseau incliné, la poussée ne part donc pas où
le nez regarde : elle part dans le repère du sol. Un vaisseau couché qui pousse
« vers son propre bas » pousse **vers la planète**, et ces unités-là passent
entières, puisque la part radiale n'est jamais écrêtée.

Mesuré sur un vaisseau à six unités par seconde tangentielles pour une vitesse
orbitale de cinq, poussant neuf :

| | ce qui est appliqué |
|---|---|
| sans redressement | `0, -1, 0` — les neuf unités mangées, reste le freinage |
| redressé, couché | `9, -1, 0` — les neuf partent vers le sol, le freinage s'ajoute |

C'est ce qui fait qu'un atterrissage de travers **descend** au lieu de dériver.
Et cela ne coûte rien tant que l'alignement automatique tient le vaisseau droit :
la rotation est alors l'identité.

### Là où le build ne réécrit rien

La conversion de retour vit **dans** la branche `if (|prévue| > vOrbite)`. Sous
la vitesse orbitale, l'entrée ressort telle quelle — redressement compris. Le
redressement n'est donc pas une correction permanente d'assiette : il n'existe
que les images où l'écrêtage mord.

## Ce que `ReadTranslationalInput` disait déjà, et où

Trois de ses quatre lois étaient portées, ailleurs, et c'est dit à côté de la
quatrième maintenant : posé on ne peut que monter (`Clamp01`), l'allumage d'une
seconde ([`66`](66-allumage.md)), et la limite de poussée du secteur
(`Min(GetThrustLimit(), maxThrust) / maxThrust`).

## Gardé par

- `tests/09-jeu.mjs` — se lever en vue d'atterrissage la referme avec ses deux
  annonces **et laisse le roulis inversé** ; se rasseoir le remet à plat ; se
  lever pendant la bascule annule la transition **sans rien annoncer** ; debout,
  le mode d'atterrissage ne s'établit pas ; et le redressement, dans les trois
  cas ci-dessus — mordu couché, mordu droit, pas mordu du tout.
