# On s'asseyait d'un coup — et trois autres lois qui dormaient

`scripts/lois.mjs` comptait vingt méthodes que rien n'appelait
([`90`](90-methodes.md)). Ce lot en branche sept. Une d'entre elles n'était pas
seulement débranchée : elle était débranchée **sans que rien ne puisse le
dire**, et c'est la plus instructive du lot.

## 1. Le `Vector3` qui rendait l'assise instantanée

`PlayerAttachPoint.InitAttachment` calcule une durée :

```
_turnDuration = Vector3.Angle(playerTransform.forward, transform.forward)
              / _rotationRate
```

`_rotationRate` vaut **100** sur les quatre points d'accrochage de la scène.
Arriver dos au poste de pilotage demande donc 1,8 s de demi-tour, et arriver de
face n'en demande aucune. Le portage le savait : `attach.js` porte la formule,
`tests/09-jeu.mjs` la mesure, et `tools/15_verify.py` la mesurait **en
navigateur** :

```python
rep.eq("dos tourne, le demi-tour dure 1,8 s", duree["dos"], 1.8)
```

Ce contrôle était vert. Et pourtant, dans le jeu, **on s'asseyait d'un coup**,
à tous les points d'accrochage, depuis toujours.

### Ce qui se passait

`attach.js` vit du côté logique pure : il indexe `v[0]`, `v[1]`, `v[2]`. Le
moteur, lui, tient l'avant du joueur dans un `BABYLON.Vector3`, et le lui
passait tel quel — trois fois, à trois endroits différents :

```js
pointsAttache.attach(siegePilotage, { position: [...], forward: fwd, ... })
```

`fwd[0]` vaut alors `undefined`. `Math.hypot(undefined, undefined, undefined)`
rend `NaN`. `normalize` teste `l > 1e-9`, ce qui est faux pour `NaN`, et retombe
sur le **vecteur nul**. `angleBetween` rend alors zéro, et `turnDuration` zéro
avec lui.

Zéro n'est pas une valeur absurde. C'est la durée exacte d'un joueur qui arrive
**déjà aligné** — et `turnFraction` la documente comme telle :

```js
/**
 * `_turnDuration <= 0` vaut 1 tout de suite, et c'est le cas d'un joueur qui
 * arrive deja aligne : le build teste `ble.un`, donc NaN passe aussi par la.
 */
```

Le commentaire est juste. C'est le chemin par lequel on y arrivait qui ne
l'était pas.

### Pourquoi le contrôle navigateur ne l'a pas vu

Parce qu'il appelait la loi **à la main** :

```js
p.attach({ position: [0, 0, -1], rotation: [0, 1, 0, 0] }, 0);
```

Pas de `forward` du tout — donc la branche de repli, `qrot(rotation, [0,0,1])`,
qui rend un tableau. 1,8 s, comme annoncé. Le contrôle mesurait la loi ; la
boucle, elle, empruntait un autre chemin.

> C'est exactement la leçon de [`71`](71-quantique.md), reprise une fois de
> plus : **un contrôle qui appelle la loi lui-même ne dit rien du chemin que le
> jeu emprunte.** [`71`](71-quantique.md) l'avait dit d'une faute de portée ;
> celle-ci est une faute de type, et elle se cache mieux — parce que sa valeur
> fausse est indistinguable d'une valeur juste.

### Ce qui est écrit maintenant

Trois choses, et pas une seule :

1. les trois appelants passent un tableau ;
2. `attach.js` normalise au bord (`vec3()`), pour qu'un quatrième appelant ne
   puisse pas refaire la faute ;
3. le point garde `initForward`, **ce sur quoi la durée a été calculée** — et
   c'est cela que le contrôle navigateur interroge désormais, après un vrai
   embarquement, plutôt que le résultat :

```python
rep.eq("le siege recoit un vrai vecteur, pas un Vector3", avant["tableau"], True)
rep.eq("dont les trois composantes sont finies",         avant["fini"],    True)
rep.eq("et qui est unitaire",                            avant["norme"],   1.0)
```

Le résultat et l'entrée ne se distinguent qu'ici. Garder l'entrée est le seul
moyen de garder la mesure.

## 2. La lunette fait taire le monde

La **première** ligne d'`Telescope.EnterTelescope` n'est pas un champ de
vision :

```
Locator.GetAudioMixer().IsolateTrack(TrackName.Signal, 0.2f, 1f);
```

Toutes les pistes sauf celle des signaux tombent à **un cinquième**, en une
seconde. `ExitTelescope` les rend à un, en une seconde aussi. C'est par là qu'on
trouve un émetteur : le monde se tait, et il ne reste que lui. Le portage
n'avait rien de cela — il avait les émetteurs, leur force en pixels, l'onde qui
se trace, et pas le silence dans lequel on les entend.

Au passage, `_allowExit` — qui garde la sortie dans `Telescope.Update` — vaut
**vrai** dans le constructeur et n'est écrit nulle part ailleurs. C'est un
drapeau mort : rien à porter.

## 3. L'assise pendant la lunette

`PlayerAttachPoint.AttachPlayer` s'abonne à `EnterTelescopeView` et
`ExitTelescopeView` ; `DetachPlayer` s'en désabonne. Le point n'écoute donc que
**tant qu'on y est assis**, ce qui est exactement la durée pendant laquelle la
question se pose.

- `OnEnterTelescopeView` : `_savedMatchRotation = _matchRotation`, puis
  `_matchRotation = false`, puis `UnlockMovement`. On vise où l'on veut.
- `OnExitTelescopeView` : on restaure, et on rejoue `InitAttachment` — donc **le
  demi-tour recommence**, depuis l'angle où l'on ressort.

Les deux méthodes existaient dans `attach.js`, commentées et éprouvées, depuis
[`69`](69-assise.md). Rien ne les appelait.

## 4. La guimauve prend feu, et on la perd

`Marshmallow.Update` ne raisonne jamais sur le niveau de grillage pour décider :
il raisonne sur la composante **rouge** de la couleur courante, qui vaut
`_initR - _toastLevel`. Deux seuils :

| | |
|---|---|
| `r < 0,25` | la flamme prend (`_pSys.renderer.enabled`) |
| `r < 0,08` | `ResetMarshmallow` — il n'en reste rien |

Et, entre les deux :

```
if (_pSys.renderer.enabled && _toastLevel < 1) _toastLevel += 0.001f;
```

**Par image**, sans `deltaTime`, et sans chaleur. Une guimauve qui a pris feu
finit de brûler toute seule ; s'éloigner du feu ne la sauve pas.

Le portage attendait `toast >= 1`, qui **n'arrive jamais** : avec un rouge
d'origine à 1, la guimauve est perdue à 0,92. Il n'avait donc ni la flamme, ni
la perte, ni la fenêtre étroite — de 0,6 à 0,92, soit un peu plus d'une seconde
à pleine chaleur — pendant laquelle on peut encore manger.

`ResetMarshmallow` a deux branches, et le portage n'en avait aucune : la
guimauve perdue **ou mangée** disparaît, et une neuve apparaît **0,8 s** plus
tard. C'est le même délai dans les deux cas.

Trois conséquences visibles, et une correction de rendu qui allait avec : le
portage allumait la flamme et le modèle de guimauve **ensemble**, sur le bâton
sorti. Le build les sépare — `_mallowRenderer.enabled = _isOut` suit le bâton,
`_pSys.renderer.enabled` suit la couleur — et la couleur, qu'il calculait, il ne
la posait sur aucun matériau.

## 5. Les voyants d'avarie : le masque, et l'ordre

`HUDDamageDisplay.OnDamageShip` reçoit `_damageLocationMask` — la sortie qui
s'**accumule**, relue à l'endroit par [`49`](49-queue.md) — et allume un voyant
par position **touchée**. Le portage n'allumait rien tant qu'une pièce n'était
pas détruite, c'est-à-dire presque jamais : un voyant d'avarie sert justement à
prévenir avant.

Et il les rangeait dans l'ordre de l'énumération. L'IL, lui, lit le masque à la
main :

| voyant | drapeau | position |
|---|---|---|
| 0 | `& 4` | arrière |
| 1 | `& 1` | avant |
| 2 | `& 16` | droite |
| 3 | `& 8` | gauche |
| 4 | `& 2` | haut |

Soit **arrière, avant, droite, gauche, haut** — trois voyants sur cinq
désignaient la mauvaise pièce.

`ShipDamage.alerted` portait la liste depuis [`49`](49-queue.md), et personne ne
la lui demandait.

## 6. Deux branchements courts

- **L'état de mort.** `PlayerState` écoute `"PlayerDeath"` et pose `_isDead`. Le
  portage tenait les trois autres états — dans le vaisseau, à proximité, au
  poste — et laissait celui-là à faux pour toujours.
- **L'invite de lampe.** `Flashlight.promptVisible` était la version **courte**
  de `CheckPromptStatus` : quatre conditions devinées, là où il y en a sept.
  `flashlightPromptVisible` les porte toutes depuis [`67`](67-annonces.md), et
  la courte est restée à côté, morte, avec l'air d'être juste. Elle est
  supprimée. Au passage, son paramètre `satelliteCam` était câblé à `false` : la
  caméra du satellite est l'une des deux consoles déportées du portage, celle
  qui n'est pas la console de vol.

## Ce que ce lot ajoute au dénominateur

| | avant | après |
|---|---|---|
| `lois.mjs` | 20 | 12 |
| `tests/09-jeu.mjs` | 1 905 | 1 955 |

Et une leçon qui n'était pas encore écrite comme telle : **un invariant qui
mesure un résultat ne garde pas son entrée.** `turnDuration` valait zéro pour
deux raisons différentes, l'une juste et l'autre fausse, et aucune mesure du
résultat ne pouvait les distinguer. Le seul contrôle qui tienne est celui qui
interroge ce qui est entré dans le calcul.
