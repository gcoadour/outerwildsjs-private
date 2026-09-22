# Un menu a sa propre cadence, et sa propre horloge

Le menu des réglages était porté : les sept options, leurs libellés, leurs trois
couleurs, la pause, la sauvegarde séparée. Ce qui manquait n'est dans
`SettingsMenu` qu'à moitié — l'essentiel est dans `Menu`, sa classe de base, que
le portage n'avait jamais lue.

## 1. `SELECT_DELAY` : 0,2 s, et **quatre** horloges

```
if (moveZ.GetAxisRaw() > 0.2f)
    if (Time.realtimeSinceStartup > _lastAxisUpTime + 0.2f) {
        _optionIndex--; ... _lastAxisUpTime = Time.realtimeSinceStartup; }
else if (moveZ.GetAxisRaw() < -0.2f)
    if (Time.realtimeSinceStartup > _lastAxisDownTime + 0.2f) { ... }
```

`_lastAxisUpTime`, `_lastAxisDownTime`, `_lastAxisLeftTime`,
`_lastAxisRightTime` : **quatre champs distincts**. Monter puis descendre dans
la foulée ne coûte rien ; monter deux fois demande deux dixièmes de seconde.
C'est ce qui rend un aller-retour vif et une répétition régulière, et une seule
horloge partagée l'aurait raté.

Le portage lisait l'appui clavier brut. La répétition automatique d'un
navigateur tourne à **trente millisecondes** : garder une flèche enfoncée
parcourait les sept options six fois trop vite, et régler une sensibilité au
dixième près relevait de l'adresse.

### `realtimeSinceStartup`, et non `Time.time`

`SettingsMenu.Open` vient de poser `Time.timeScale = 0`. Un menu cadencé sur
l'horloge du jeu serait **figé avec lui** — on ne pourrait plus en sortir. Le
choix de l'horloge n'est donc pas un détail de confort : c'est ce qui fait que
le menu fonctionne du tout.

## 2. Deux seuils, pas un

| geste | canal | seuil |
|---|---|---|
| parcourir les options | `moveZ` | **0,2** |
| changer une valeur | `moveX` | **0,5** |

Changer un réglage demande un geste plus franc que parcourir la liste. On ne
modifie pas une sensibilité en effleurant le manche, et c'est délibéré : la
navigation est la manœuvre qu'on répète, le changement celle qu'on regrette.

## 3. Trois façons de valider, dont une qui **recule**

```
if (interact.GetButtonDown() || jump.GetButtonDown() || Input.GetMouseButtonDown(0))
    ToggleOption(0);
else if (Input.GetMouseButtonDown(1))
    ToggleOption(-1);
```

Le portage n'avait que la barre d'espace et **Entrée**, qui n'est nulle part
dans le build. Il manquait la touche d'interaction, le clic gauche, et surtout
le **clic droit**, seule façon de faire *baisser* une valeur à la souris.

Et tout ce bloc est sauté quand l'option courante est verrouillée : une option
morte se survole, elle ne s'actionne pas — ni au clavier, ni au manche, ni au
clic.

## 4. Le curseur n'apparaît pas à l'ouverture

`Menu.Open` ne montre rien. Il **enregistre** :

```
_lastMousePos = Input.mousePosition;
_mouseActive  = Screen.showCursor;
```

C'est `Update` qui réveille la souris, et seulement si elle bouge :

```
if (Vector3.Distance(Input.mousePosition, _lastMousePos) > 0.1f) {
    Screen.lockCursor = false; Screen.showCursor = true; _mouseActive = true; }
```

Tant que `_mouseActive` est faux, le survol ne choisit rien. On ouvre le menu à
la manette ou au clavier sans que le curseur vienne s'interposer ; il arrive au
premier geste, et alors seulement les options répondent au survol.

Et le pendant, dans `SettingsMenu.Close` :

```
Screen.showCursor = false; Screen.lockCursor = true; Time.timeScale = 1;
```

**Fermer le menu reprend la souris.** Le portage la laissait où elle était :
une fois le curseur sorti pour cliquer une option, on retournait au jeu sans
regard à la souris, et il fallait recliquer sur la page pour piloter.

## 5. Les annonces, et pourquoi elles ne sont pas rejouées

`Menu.Open` lève `EnterMenuMode` quand il n'a pas de menu parent, `Menu.Close`
lève `ExitMenuMode`. Ce portage n'a qu'un menu, donc les deux partent toujours.

Elles sont écrites dans `Settings.ouvre` / `Settings.ferme` — c'est la loi — et
**délibérément pas rejouées** par `main.js` : le bloc des modes les lève déjà en
lisant l'état, et les dire deux fois en ferait deux transitions. Le retour de
ces deux méthodes est donc ce que le build annonce, gardé sous Node, et non un
canal de plus.

## 6. `UpdateColor` et `Suspend`, qui sont la même image

Trois couleurs, une seule **teinte** — 40 degrés, l'ambre du jeu — et c'est la
valeur qui distingue : `0,15` pour une option morte, `0,30` pour une option
vivante, `0,70` pour celle qu'on vise. `interface.js` les calculait déjà depuis
ces triplets HSV ; elles sont maintenant nommées à côté du rendu.

`Suspend(hide)` éteint les `GUIText` un à un plutôt que de les détruire, ce qui
explique pourquoi `Open` les rallume un à un plutôt que de les recréer. Le
portage cache un élément ; c'est le même geste.

## Gardé par

- `tests/09-jeu.mjs` — la cadence et ses quatre horloges (le même sens attend,
  l'autre non), les deux seuils, l'option verrouillée qui se survole sans
  s'actionner, le réveil de la souris à un dixième de pixel et son endormissement
  à la réouverture, et les deux annonces de `Open` / `Close`.
- `tools/15_verify.py --profil` — dans la page, en **rafale** : dix flèches
  envoyées d'affilée n'avancent que d'une ligne, la suivante passe après le
  délai, l'autre sens ne l'attend pas, et les deux annonces arrivent à l'image
  suivante.
