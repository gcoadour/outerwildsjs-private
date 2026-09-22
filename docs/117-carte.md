# Ouvrir la carte vous cadre avec votre cible, et le son a dix secondes de garde

`MapController.EnterMapView` fait bien plus que montrer la carte, et ce qu'elle
fait de plus tombe de la géométrie plutôt que d'un réglage.

## 1. Le cadrage

```
if (_currentRFrame == null || _isObservatoryMap) {
    _zoomDistance = _defaultZoomDist;
    _focalOffset  = Vector3.zero;
} else {
    float d = Vector3.Distance(_currentRFrame.GetPosition(), _playerTransform.position);
    _zoomDistance = Mathf.Max(d / Mathf.Tan(0.5f * camera.fieldOfView * Mathf.Deg2Rad)
                                * 0.7f,
                              _minZoomDistance);
    Vector3 versCible = _currentRFrame.GetPosition() - _playerTransform.position;
    Vector3 depuisFocale = _playerTransform.position - _focalTransform.position;
    _focalOffset = depuisFocale + versCible * 0.5f;
}
```

Sans cible : le système entier, vu du centre. **Avec une cible visée : vous deux.**

- le point visé est le **milieu** du segment joueur–cible ;
- la distance de caméra est celle qui vous tient juste à l'image, à sept
  dixièmes près.

Pour une caméra perspective à distance `D`, la demi-hauteur visible vaut
`D · tan(fov/2)`. Poser `D = d / tan(fov/2) × 0,7` donne donc une demi-étendue
de `0,7 · d`. Et comme le champ du joueur vaut **70 degrés**, `tan(35°) = 0,7002` :
la distance de caméra est, à un millième près, **la distance qui vous sépare de
votre cible**. Le facteur 0,7 et le champ de 70 degrés s'annulent presque
exactement — le cadrage n'est pas réglé, il tombe.

`_minZoomDistance` (10 000) borne le tout : viser quelque chose de proche ne
colle pas la caméra au sol.

### Et la durée du zoom est imposée

```
if (!_isObservatoryMap && _currentRFrame != null) _zoomDuration = 0.6f;
```

`EnterMapView` reçoit une durée en paramètre et **l'écrase** dès qu'il y a une
cible. Ce portage ouvre la carte d'un coup ; la valeur est relevée pour que
l'animation, le jour où elle vient, n'ait pas à être devinée.

## 2. Le son a dix secondes de garde

```
if (Time.time > _lastPlayAudioTime + 10f) {
    _lastPlayAudioTime = Time.time;
    audio.Play();
}
```

Ouvrir et refermer la carte coup sur coup est donc **silencieux** après la
première fois. C'est ce qui empêche le jeu de claquer à chaque coup d'œil, et
c'est le genre de règle qu'on n'invente pas : on la lit.

## 3. Ce que `ExitMapView` ne fait pas

```
FireEvent("ExitMapView");  FireEvent("SwitchActiveCamera", _activeCam);
_playerListener.enabled = true;  _mapListener.enabled = false;
_isMapMode = false;  _showingPrompts = false;
Locator.GetPromptManager().RemoveScreenPrompt(_closePrompt);
```

Ni le zoom ni le point visé n'y sont rangés. Rouvrir la carte sans cible la
retrouve au système entier **parce qu'`EnterMapView` les repose**, pas parce que
la sortie les aurait remis à zéro. La distinction compte : elle dit où vit
l'état.

Les deux méthodes échangent aussi l'`AudioListener` — celui du joueur contre
celui de la carte. C'est pourquoi le monde se tait pendant qu'on regarde la
carte, ce que le portage fait déjà par son système de modes.

## 4. Trois classes que le rendu ferme autrement

`NoiseEffect` (`get_material`, `SanitizeParameters`), `NoiseAndGrain` et
`Vignetting` (`CheckResources`, `Main`) sont la plomberie de shaders d'Unity 4 :
vérifier qu'un `Material` est là, borner ses champs, puis `Graphics.Blit`. Ni
l'un ni l'autre n'a de sens hors d'Unity. Elles rejoignent `BloomAndLensFlares`
et `GlowEffect` sous `@autrement` — le portage vise le **résultat** avec la
chaîne d'effets de Babylon, réglée sur les mêmes grandeurs, et
[`103`](103-refait.md) prévoyait exactement ce cas.

## 5. Deux méthodes qui étaient portées sans être nommées

`PlayerCameraEffectController.FadeOut` allume **deux** effets — le gris *et* la
vignette — et remet le gris à zéro : un fondu qui en interrompt un autre repart
du blanc. `FlashScreen` pose `blurIterations = 10` en dur à chaque éclair, quelle
que soit la valeur de la scène (**une**, sur la caméra du joueur), et part de
l'intensité et de la teinte **courantes** — deux éclairs qui se chevauchent
s'enchaînent, comme les fondus sonores d'`OWAudioSource`
([`104`](104-arbitrage.md)).

`TonemappingManager._isTonemappingActive` est **statique** : un seul booléen
pour tout le jeu, que `UpdateTonemapping` repousse sur chaque tonemapper enfant
— c'est-à-dire sur chaque caméra. C'est exactement la portée de
`scene.imageProcessingConfiguration`, que le portage pilote déjà depuis l'option
« Screen Brightness ».

## Gardé par

- `tests/09-jeu.mjs` — sans cible : le zoom par défaut et le centre ; avec une
  cible : le milieu du segment, le minimum qui gagne de près, le cadrage qui
  l'emporte de loin, et la durée de 0,6 s. Le son : la première ouverture sonne,
  la neuvième seconde non, la dixième et demie oui.
