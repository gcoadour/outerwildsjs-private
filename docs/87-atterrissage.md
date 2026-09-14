# Le mode atterrissage : la caméra qui regarde le sol, et la poussée qui refuse de vous mettre en orbite

[`docs/86`](86-annonces-de-mode.md) s'était arrêté ici : la mécanique était lue,
mesurée, écrite dans un document — et pas portée, faute d'une caméra
d'atterrissage. Ce lot-ci la fait.

Deux mécaniques que le build nomme presque pareil, et qu'il faut tenir
séparées :

| | événements | composant | ce que c'est |
|---|---|---|---|
| la **vue** | `EnterLandingView` / `ExitLandingView` | `FlightConsole` | une caméra, un regard, des commandes |
| le **mode** | `EnterLandingMode` / `ExitLandingMode` | `ShipThrusterController` | une poussée écrêtée |

La vue s'ouvre à la touche ; le mode demande en plus d'être **assez près**.

## La bascule, et son ordre

```
if (!_doLandingCamTransition && GetButtonDown(toggleLandingCam)) {
   if (!landingCam.enabled) {
      if (vitesse relative au referentiel > 20)  autopilot.InitMatchVelocity();
      _doLandingCamTransition = true;  _initLandingCamTime = Time.time;
      playerCamController.SnapToDegrees(0, -70, 140);
   } else ExitLandingView();
   shipController.InvertRoll();
   shipController.SetRollByDefault(_doLandingCamTransition);
}
```

puis, dans `UpdateLandingMode`, **0,45 seconde plus tard** : la caméra
d'atterrissage s'allume, celle du joueur s'éteint, et `SwitchActiveCamera` puis
`EnterLandingView` partent.

L'ordre est le détail qui compte : **le regard bascule à l'appui, la caméra
0,45 s plus tard**. On voit le sol arriver avant d'y être. Un portage qui fait
tout d'un coup perd exactement ce demi-instant.

Le portage n'a pas de seconde caméra. Il fait basculer le regard du joueur à
−70° de tangage, à 140°/s — et il ne remet **pas** le lacet à zéro, parce que son
lacet est absolu là où celui du build est relatif au vaisseau : le remettre à
zéro ferait pivoter la vue au hasard. C'est le tangage qui porte le sens du
geste, et c'est lui qu'on reproduit.

## Le manche change de main

`InvertRoll()` et `SetRollByDefault()` sont appelés **dans les deux sens**, à
chaque bascule. Avec :

```
isRollMode = GetButton(swapRollAndYaw) ? !rollByDefault : rollByDefault
```

cela donne :

| | manche seul | manche + alt |
|---|---|---|
| en vol | lacet | roulis |
| **en vue d'atterrissage** | **roulis, inversé** | **lacet** |

Le portage n'avait que la moitié gauche du tableau : la touche alt donnait le
roulis, toujours. `_flipRollFactor` alterne entre −1 et +1 à chaque appel
d'`InvertRoll` — il vaut donc −1 en vue d'atterrissage et +1 dehors, et le
roulis s'y inverse.

Troisième chose lue dans `ReadRotationalInput`, et qui n'a rien à voir avec
l'atterrissage : **posé, on ne tourne plus du tout.** Pas moins, pas lentement :
`Vector3.zero`. La traînée angulaire, elle, continue de finir le mouvement.

## L'écrêtage, ou pourquoi on arrive à se poser

`ShipThrusterController` pose `_limitOrbitSpeed` à l'entrée du mode, et garde le
référentiel. Alors, dans `ReadTranslationalInput` :

```
tangentielle   = v_rel - projection(v_rel, radial)
a_tangentielle = a_monde - projection(a_monde, radial)
prevue         = tangentielle + a_tangentielle * dt
si |prevue| > GetOrbitSpeed(d) :            # sqrt(g(d) * d)
    prevue         = normalisee(prevue) * GetOrbitSpeed(d)
    a_tangentielle = (prevue - tangentielle) / dt
```

**En mode atterrissage, on ne peut pas accélérer latéralement au-delà de la
vitesse orbitale circulaire locale.** La part radiale, elle, n'est jamais
touchée : on monte et on descend à pleine puissance.

C'est ce qui rend un atterrissage manœuvrable. Sans cet écrêtage, chaque
correction latérale ajoute de la vitesse orbitale, et on rate le sol en tournant
autour — ce qui est exactement ce que faisait le portage.

`GetOrbitSpeed` se calcule sur le champ **analytique** du corps, pas sur une
masse : `sqrt(g(d) · d)`, où `g` est le `fieldStrength` que ce portage a depuis
le premier jour.

## Ce qui ouvre le mode

`GetAllowLandingMode()` : quatre conditions, toutes nécessaires — un référentiel
**visé**, qui autorise l'alignement automatique, le vaisseau **pas posé**, et une
distance sous `GetAutoAlignmentDistance()`. Cette dernière, le portage
l'extrayait déjà : c'est le champ `alignment` d'`autopilotDistances`.

Le référentiel visé est celui du verrouillage (`Lock On`) — on ne se pose pas
« quelque part », on se pose **sur ce qu'on a visé**.

## Une loi retirée plutôt qu'écrite pour rien

`rotationalInput` avait d'abord été écrite : les trois règles de
`ReadRotationalInput` dans une fonction. Personne ne pouvait l'appeler — le
modèle de rotation du portage n'est pas celui du build (tangage et lacet y
suivent le **regard**, par un couple vers la direction visée, là où le build lit
deux axes). `scripts/lois.mjs` l'a dit tout de suite, et elle a été retirée : les
trois règles vivent maintenant là où le portage les applique, et chacune y est
gardée. Une loi juste au mauvais endroit reste une loi morte.

## Gardé par

- `tests/09-jeu.mjs` — le tableau du manche dans ses quatre cases, `sqrt(g·d)`,
  la projection, l'écrêtage qui annule la tangentielle **et laisse passer la
  radiale entière**, les quatre conditions du mode, le délai de 0,45 s, la touche
  qui ne répond plus pendant la transition, et — sur `Ship.rotate` — posé, le
  roulis ne fait rien.
- `tools/15_verify.py --profil` — au poste de pilotage, la touche fait rouler le
  manche et inverse le roulis **dès l'appui**, la vue s'ouvre, les deux annonces
  du build partent, le jeu de commandes devient `atterrissage`, et ressortir
  rend tout. (Le délai de 0,45 s n'y est pas observable : sous swiftshader une
  image peut durer une seconde.)
