# Le réveil : sept secondes le regard au ciel

Le portage commençait la partie le regard à l'horizon. Le build vous fait
ouvrir les yeux **quatre-vingts degrés plus haut**, et vous y laisse **sept
secondes** avant de redescendre tout seul.

C'est la première chose que le jeu fait, et elle n'était pas là.

```
PlayerSpawner.SpawnPlayer()
    if (_initialSpawnPoint == GetSpawnPoint(SpawnLocation.HomePlanet)) {
        _cameraController.SetDegreesY(80f);
        _doCamAutoCenter = true;
    }
    ...

PlayerSpawner.Update()
    if (_doCamAutoCenter) {
        if (Time.timeSinceLevelLoad > 7f) {
            _cameraController.CenterCamera(50f);
            _doCamAutoCenter = false;
        }
        if (_cameraController.GetDegreesY() < 45f) _doCamAutoCenter = false;
    }
```

## Quatre-vingts degrés vers le haut, et le signe se lit

`UpdateRotation` compose la rotation de tangage ainsi :

```
_rotationY = Quaternion.AngleAxis(_degreesY, -Vector3.right);
```

Autour de l'**opposé** de l'axe droit : un `_degreesY` positif **lève** le
regard. Quatre-vingts degrés, c'est le ciel.

Le tangage de ce portage est compté à l'envers — positif vers le bas, parce que
l'avant y est construit comme `north·cos + east·sin − up·sin(tangage)`. La
valeur arrive donc changée de signe, et c'est écrit là où elle arrive.

> Le sens d'un angle ne se devine pas au souvenir qu'on a du jeu. Il se lit
> dans la composition de la rotation, et c'est une ligne d'IL.

## Sept secondes, puis 1,6 seconde de descente

`CenterCamera(50f)` est `SnapToDegrees(0, 0, 50)` — la même forme que le
demi-tour du siège et le recentrage du télescope ([`69`](69-assise.md)) : une
**durée** tirée d'une distance angulaire et d'un taux, puis un `SmoothStep`
par-dessus.

> 80 / 50 = **1,6 s**

Sept secondes d'immobilité, puis une seconde et six dixièmes de descente. Le
temps de voir le ciel, exactement.

## Et le joueur garde la main

```
if (_cameraController.GetDegreesY() < 45f) _doCamAutoCenter = false;
```

Dès que son propre regard passe sous quarante-cinq degrés, le recentrage est
**abandonné**. On ne lui reprend pas la tête s'il a déjà commencé à regarder
ailleurs — et c'est ce qui fait que le geste ne se sent jamais comme une
contrainte.

**L'ordre des deux tests compte**, et il est reproduit tel quel : le recentrage
part à la septième seconde *même si* le regard est déjà bas, parce que le test
des quarante-cinq degrés vient **après** et ne fait qu'éteindre un drapeau déjà
éteint.

## À chaque boucle, pas seulement au début

```
PlayerSpawner.OnStartOfTimeLoop()
    if (TimeLoop.GetLoopCount() == 1 || _initialSpawnPoint == null || _ignoreDebugSpawn)
        _initialSpawnPoint = GetSpawnPoint(SpawnLocation.HomePlanet);
    SpawnPlayer();
```

`SpawnPlayer` est rappelée à **chaque** début de boucle, et le point
d'apparition est celui de la planète natale : on rouvre donc les yeux sur le
ciel vingt-deux fois par partie.

Le compte de sept secondes est `Time.timeSinceLevelLoad`. Ce portage tient
déjà, depuis [`98`](98-flashback.md), que **la boucle est un rechargement de
scène** — c'est pour cela que la pellicule du flashback repart à zéro à chaque
tour. Le compte repart donc lui aussi, et les sept secondes valent à chaque
boucle.

## Gardé par

- `tests/09-jeu.mjs` — les quatre nombres, la durée de 1,6 s calculée par la
  même `snapDuration` que le siège, l'abandon sous quarante-cinq degrés, le
  fait que le recentrage ne parte **qu'une fois**, et l'ordre des deux tests :
  septième seconde *et* regard bas donne quand même l'ordre.
- `tools/15_verify.py --profil` — que le module soit **branché** : le parcours
  dure bien plus de sept secondes avant d'y arriver, le recentrage a donc eu
  lieu, le drapeau est retombé, et le regard est redescendu près de l'horizon.
