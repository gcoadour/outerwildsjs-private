# Se redresser prend 1,8 seconde, et le regard ne bascule pas avec

Le portage prenait le bas du champ dominant **tel quel, à chaque image** :

```js
const ad = f ? (f.alignDir || f.dir) : null;
const up = ad ? new BABYLON.Vector3(-ad.x, -ad.y, -ad.z)
              : new BABYLON.Vector3(0, 1, 0);
```

Changer de champ — se poser, passer d'une planète à sa lune, entrer dans une
grotte qui porte le sien — faisait donc **basculer le monde d'un coup**. Le
build y met une seconde et huit dixièmes pour un demi-tour, et pendant tout ce
temps il retire du regard ce que le corps prend.

`AlignWithDirection` n'était lue nulle part. Elle n'apparaissait dans aucun des
quatre dénominateurs : pas de `@lit`, donc pas de recensement, pas de méthodes
à compter, aucune loi écrite à trouver sans appelant. C'est le trou que
[`103`](103-refait.md) nomme pour les classes **déclarées lues** — et celui-ci
était d'un cran en dessous.

## 1. Le mode 2 est une vitesse constante, et il faut le calculer pour le voir

```
_currentDirection   = transform.TransformDirection(_localAlignmentAxis);
_alignmentDirection = GetAlignmentDirection();
_degreesToTarget    = Vector3.Angle(_currentDirection, _alignmentDirection);
if (_degreesToTarget == 0) _degreesToTarget = 0.0001f;
switch (_interpolationMode) {
    1: _adjustedSlerpRate = _interpolationRate * fixedDeltaTime;
    2: _adjustedSlerpRate = _interpolationRate / _degreesToTarget * fixedDeltaTime;
    3: _adjustedSlerpRate = _interpolationRate / Pow(_degreesToTarget, 2) * fixedDeltaTime;
}
_adjustedSlerpRate = Mathf.Clamp01(_adjustedSlerpRate);
rigidbody.rotation = Slerp(identity, FromToRotation(courant, cible),
                           _adjustedSlerpRate) * GetRotation();
```

L'unique instance, posée sur `Player_Body` :

| champ | valeur |
|---|---|
| `_localAlignmentAxis` | `(0, -1, 0)` — on aligne son **bas** |
| `_interpolationMode` | **2** |
| `_interpolationRate` | **100** |
| `_usePhysicsToRotate` | faux |
| `_fieldStrengthThreshold` | 0 — la moindre gravité suffit |

Le taux est une **fraction du chemin restant**. Diviser par l'écart restant
annule donc l'écart :

> `taux × écart = _interpolationRate × dt`

À cinquante hertz, cela fait **deux degrés par pas de physique quelle que soit
la distance** — soit **cent degrés par seconde**, et 1,8 s pour un demi-tour
complet. Sous deux degrés le taux dépasse 1, `Clamp01` le ramène, et les deux
derniers degrés se franchissent d'un coup : ce n'est pas une approximation,
c'est la fin de l'interpolation.

Le mode 1 est le seul des trois qui ralentisse en approchant — un `Lerp`
ordinaire, asymptotique, jamais tout à fait arrivé. C'est celui qu'on aurait
écrit de soi-même, et ce n'est pas celui du joueur.

Le `0.0001` n'est pas une précaution contre la division par zéro : il la
remplace par un taux énorme que `Clamp01` ramène à 1. Un corps déjà aligné le
reste.

## 2. Le regard rend ce que le corps prend

`InitAlignment` — appelée à **chaque** entrée dans un champ — pose
`_keepCameraSteady = true`. Tant que le drapeau tient, `FixedUpdate` ne fait pas
son petit décalage de `-0,1°`, laisse l'alignement à la classe mère, et appelle :

```
Vector3 plat = _alignmentDirection - Project(_alignmentDirection, transform.right);
float deg = -Vector3.Angle(transform.TransformDirection(_localAlignmentAxis), plat)
          * Mathf.Sign(Vector3.Dot(transform.forward, _alignmentDirection));
_playerCameraController.AddDegreesY(deg * _adjustedSlerpRate);
```

La part de **tangage** du mouvement est retirée du regard, exactement dans la
proportion parcourue cette image. Le corps pivote sous vous ; la vue ne bouge
pas. Puis :

```
if (_degreesToTarget < 1f) _keepCameraSteady = false;
```

Le test porte sur l'écart que `FixedUpdate` vient de **mesurer**, pas sur celui
qu'il laisse. La dernière image de redressement en voit encore deux, et c'est la
suivante qui éteint — d'où **quatre-vingt-onze images** de compensation pour
quatre-vingt-dix de mouvement. L'invariant garde ce décalage plutôt que le
chiffre rond, parce que c'est lui qui dit où le test se trouve.

Le lacet et le roulis, eux, ne sont **pas** compensés : seule la composante
autour de l'axe droit de la caméra l'est, et c'est ce que dit la projection.

> Sans cette compensation, se poser fait basculer l'horizon — ce qui est, au
> sens propre, le contraire de ce que le jeu fait.

### Pourquoi la transcription littérale ne suffisait pas ici

Le premier jet portait la ligne du build telle quelle : `pitch -= steadyPitch(…)`.
Le contrôle navigateur a dit ce que le calcul seul ne disait pas — **six
contrôles de la sonde sont tombés**. Son tir dépend de l'orientation du joueur à
cet instant-là, et le vérificateur le signale depuis longtemps
([`46`](46-migration-lots.md)) : *« rien ne doit s'insérer avant lui »*.

La cause est une différence de **représentation**, pas de loi. Le build n'écrit
qu'un `AddDegreesY` parce que son **cap vit sur le `Rigidbody`** : redresser le
corps autour de son axe droit ne change pas la référence à laquelle le lacet se
mesure. Ici, le lacet se mesure sur un repère d'horizon **re-dérivé du haut à
chaque image** (`horizonBasis`) — donc bouger le haut bouge aussi la référence
du lacet, et ne corriger que le tangage laisse la vue dériver :

| pour 8° de redressement | dérive de la vue |
|---|---|
| sans rien faire | **8,7°** |
| avec le seul tangage | **3,4°** |
| avec `steadyLook` | **< 0,001°** |

Ce qui est reproduit est donc l'**effet**, qui est la loi : pendant que le corps
se redresse, la vue reste où elle était. `steadyLook` reconstruit l'avant
*monde* dans le repère d'avant le pas et redit les deux angles dans celui
d'après.

`steadyPitch` reste au dépôt, marquée `// @mesure` : c'est la transcription
littérale, et elle sert d'**étalon**. À lacet nul le repère ne tourne pas, les
deux lois coïncident, et c'est ce que le test garde — c'est le rattachement de
`steadyLook` à la ligne du build.

> Un portage qui transcrit une ligne sans vérifier qu'elle produit le même
> effet transcrit la lettre et perd la loi. Ici, la lettre tenait dans une
> représentation que ce portage n'a pas.

## 3. Ce que le portage en garde, et ce qu'il ne peut pas

Ce portage n'a qu'une orientation : le regard **est** l'orientation du joueur,
tenue en lacet et tangage au-dessus d'un repère d'horizon
([`79`](79-alignement.md)). Le haut de ce repère est ce qui s'interpole
désormais, à cent degrés par seconde, et les deux angles sont redits dans le
repère d'après pour que la vue ne bouge pas — pour la raison écrite plus haut.

Ce qui ne se transpose pas : le `-0,1°` autour de `Cross(courant, cible)` que le
build applique quand il n'est **ni** en compensation **ni** en rotation
discrète. C'est un décalage constant d'un dixième de degré sur un axe qui
s'annule justement quand les deux directions sont colinéaires — il ne se voit
nulle part, et il n'a pas d'équivalent dans un modèle qui ne tient pas de
`Rigidbody`.

## Gardé par

- `tests/09-jeu.mjs` — le produit `taux × écart` constant à cinq écarts
  différents, la borne sous deux degrés, les quatre-vingt-dix pas d'un
  demi-tour, les quatre-vingt-onze de la compensation ; `steadyPitch`, qui rend
  dix degrés pour une bascule de dix et **rien** pour un roulis pur ; et
  surtout l'effet lui-même — l'avant **monde** mesuré avant et après, à douze
  couples de lacet et de tangage, sous le millième de degré.
- `tools/15_verify.py --profil` — le module dans la page, sur une copie de son
  état : quatre-vingt-dix pas, 1,8 s, l'arrivée exacte, et **rien ne bouge sans
  champ**. Plus une mesure du monde réel : debout au village, l'écart est nul —
  un écart durable dirait qu'on interpole vers une cible qui fuit.
