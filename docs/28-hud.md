# Jauges de ressources et invites à l'écran

Deux écrans manquaient : `PlayerResourceGUI` et `PromptManager`. Hors la carte
et la boîte de dialogue, tout le reste de l'interface était un HUD texte.

## Où vivent les données

Elles sont à deux endroits, et c'est ce qui rend l'extraction particulière :

- les **textures** sont dans le build, déjà sorties par `04_extract_assets.py` :
  `ResourceBar_Layer1` (les deux cadres, marqués « O2 » et « FUEL »),
  `ResourceBar_Layer01` (les dégradés de remplissage),
  `ResourceBar_Layer2_HP25/50/75/100` (une silhouette de scaphandre qui rougit),
  `TutorialTextBG` (le fond des invites) et `redVignette` ;
- les **mesures et les textes** sont dans le code. Les quarante-six invites du
  jeu sont construites en dur par une quarantaine de classes, chacune déclarant
  son texte, sa priorité et sa zone d'écran.

`tools/14_interface.py` rassemble les deux dans `data/interface/`.

## Les jauges ne sont pas dessinées en 2D

C'est la découverte qui a orienté tout le reste. `PlayerResourceGUI` ne dessine
rien : il **met à l'échelle trois objets 3D** placés dans le casque, sous
`PlayerCamera/HUDCamera/HUDHelmetHighPoly/ResourcesHUD/HUDLayer1OuterBars`.

Leur géométrie relative se lit dans la scène, via les type trees (le
`MonoBehaviour` est strippé, `read()` seul ne donne rien) :

| élément | position x | demi-largeur | demi-hauteur |
|---|---|---|---|
| `HUDPlayerHealth` | −0,5 | 0,5 | 0,64 |
| `HUDLayer2FuelBar` | 0,135 | 0,12 | 0,61 |
| `HUDLayer2OxyBar` | 0,577 | 0,12 | 0,61 |

Et l'animation tient en deux lignes de `Update` :

```
localScale.y    = 0,61 × fraction
localPosition.y = −0,6 + 0,58 × fraction
```

Ces deux formules ne sont cohérentes que pour un quad de **2 unités** de haut :
le bas de la jauge tombe alors à −0,6 − 0,03 × fraction, c'est-à-dire fixe, et
le haut monte à +0,59 quand elle est pleine. Pour un quad unitaire, le bas
dériverait de −0,6 à −0,325 pendant que la jauge se vide, ce qui n'a pas de
sens. C'est cette lecture-là que le portage retient.

À noter aussi : le jeu **étire** le dégradé de remplissage, il ne le rogne pas.
Ma première version révélait le dégradé par le bas ; c'est `localScale` dans le
code, pas un masque.

## Ce qui est authentique, ce qui ne l'est pas

Il faut le dire, parce que la frontière n'est pas évidente :

| | |
|---|---|
| **authentique** | les textures ; la géométrie relative des trois éléments ; les deux formules d'animation ; les quatre paliers de santé (≤ 0,25 / 0,5 / 0,75 / 1) ; le seuil d'alerte à 0,2 ; les textes, priorités et zones des invites ; le glissement de 400 px en 0,5 s |
| **inventé** | la **position à l'écran** du panneau de ressources |

Le jeu affiche ces trois éléments comme des quads 3D vus par une `HUDCamera`
dédiée ; leur étendue à l'écran dépend de cette caméra, que ce portage ne
reproduit pas. Le panneau est donc posé en bas à droite, à une taille choisie —
les invites du jeu occupant déjà le bas à gauche.

Les deux planches de textures ne s'alignent pas non plus entre elles : les
cadres sont en x 63–264 de `Layer1`, les dégradés en x 57–450 de `Layer01`.
Ce sont deux quads distincts, chacun avec sa transformation. On découpe donc
chaque élément séparément (`bar_frame_oxygen`, `bar_frame_fuel`, `bar_fill`)
pour le reposer soi-même — pixels authentiques, disposition à moi.

## Les invites

`PromptManager` tient trois listes, aux positions suivantes :

| zone | position | alignement |
|---|---|---|
| centre | centre de l'écran + 50 px vers le bas | centré |
| bas | (largeur/2, hauteur − 100) | centré |
| gauche | (50, hauteur − 100), empilées vers le haut de 5 px | à gauche |

Au centre et à gauche, **seules les invites de priorité maximale restent
visibles**. C'est ce qui fait le tri tout seul : les invites de la carte valent
2, celles du télescope 1, le reste 0. Ouvrir la carte remplace donc « Upwards
Thrust » par « Close Map / Zoom In/Out / Pan View » sans qu'aucune logique de
portage n'ait à le décider — vérifié à l'écran.

Le fond de chaque invite est `TutorialTextBG`, dessiné à 1,1 × 1,2 fois la
taille du texte et centré dessus.

### Ce que l'extraction a failli perdre

Sur les 46 invites, deux ne se laissent pas lire au même endroit que les autres,
et un `continue` muet les aurait fait disparaître :

- `InteractVolume` passe son champ sérialisé `_prompt` au constructeur : le
  texte n'est pas dans le code mais dans la scène. Elle est cataloguée comme
  **dynamique**, et le portage lui donne le texte de l'objet visé.
- Trois invites naissent vides et reçoivent leur texte à l'exécution, par
  `SetText`. `LaunchCodePromptController` affiche ainsi « Launch Codes
  Aquired » — la faute d'orthographe est celle du jeu — puis « Launch Codes
  Remembered » aux boucles suivantes.

Le décompte final le dit explicitement : 46 invites, 45 placées (2 en bas, 7 au
centre, 36 à gauche), 1 au texte dynamique, 3 au texte posé à l'exécution, 1
jamais inscrite (`Marshmallow._eatPrompt`, construite mais sans zone).

## Détails repris tels quels

- La couleur des invites est `ColorHSV(42, 0,2, 0,9)`, soit **#E6D8B8**, calculé
  par la même conversion que `ColorHSV.ToColorRGB`.
- Les alertes « low oxygen / low health / low fuel » s'affichent à
  x = largeur/2 + 50, en corps 20, en rouge. Leur ordre vertical n'est pas
  l'ordre du code : les décalages sont −25, 0 et +25, et l'axe y de `GUI`
  descend — l'oxygène est donc la plus haute et le carburant la plus basse.
- La vignette rouge s'allume à plein sur un dégât ponctuel puis s'efface en une
  seconde ; l'exposition la maintient à plein tant qu'elle dure.

## Le reste de l'interface

### `GUIMode` — quatre modes, et ce qu'ils cachent

`GUIMode` fait tourner quatre modes sur une touche de débogage : complet,
débogage, capture, masqué. Ils ne changent pas ce qui est calculé, seulement ce
qui est dessiné, et le détail compte :

```csharp
if (GUIMode.IsHiddenMode()) return;
if (_activeCenterPrompt != null) _activeCenterPrompt.DrawPrompt();
if (!GUIMode.IsCaptureMode()) { bottom…; left…; }
```

En mode **capture**, l'invite du centre reste affichée — seules celles du bas et
de la gauche disparaissent. C'est bien un mode fait pour la capture d'écran :
il retire l'habillage sans retirer ce que le joueur est en train de viser.
Porté sur la touche **G**, vérifié : 3 invites en mode complet et débogage, 0 en
capture et masqué.

### `AutopilotGUI` — dix messages, au mot près

Un seul message à la fois, centré, en corps 24, à 200 pixels du haut plus sa
propre hauteur. Les messages d'état durent tant que la phase dure, ceux de fin
trois secondes.

| message | couleur | quand |
|---|---|---|
| `stage 1: aligning flight path` | vert | alignement |
| `stage 2: accelerating towards destination` | vert | vol |
| `stage 3: firing retro-rockets` | vert | approche |
| `matching target velocity` | vert | égalisation seule |
| `autopilot complete` | vert | arrivée |
| `autopilot complete - undershot target` | vert | arrivée à plus de 50 u |
| `velocity match complete` | vert | égalisation terminée |
| `autopilot ABORTED` | rouge | abandon en vol |
| `velocity match ABORTED` | rouge | abandon en égalisation |
| `too close to target` | rouge | cible trop proche |

Les capitales d'`ABORTED` sont celles du build. La distinction arrivée/abandon
a demandé d'ajouter un drapeau `arrived` au pilote automatique du portage, qui
retombait au repos dans les deux cas.

### `Minimap` — un globe, pas une carte

La découverte de cette partie. `Minimap` ne dessine pas une carte plate : elle
pose les marqueurs sur une **sphère**, dans le repère du secteur majeur actif —

```
position locale = InverseTransformPoint(monde).normalized × 0,51
```

— et place une caméra dédiée à distance fixe **dans la direction du marqueur du
joueur**, en le regardant. Elle montre donc toujours l'hémisphère où l'on se
trouve, joueur au centre par construction.

Les traces sont **cent particules par piste**, une nouvelle posée dès que la
direction du joueur a bougé de plus de **5 degrés**, en anneau : la trace a une
longueur constante quelle que soit la vitesse, et se recouvre elle-même au bout
de cent points.

Le portage en fait une **projection orthographique 2D** du même hémisphère, sur
un canevas de 168 pixels. C'est la même image que la caméra du jeu, sans seconde
caméra ni cible de rendu — un écart de moyen, pas de contenu. Les marqueurs
derrière l'horizon sont écartés par le signe du produit scalaire, et l'opacité
d'un point de trace suit sa profondeur.

Elle ne s'allume que hors du vaisseau et à proximité d'un corps, comme le jeu la
réserve aux secteurs majeurs qui la déclarent (`GetUseMinimap`).

### `SettingsMenu` — sept options, cinq portables

**Correction.** J'avais écarté ce menu en écrivant que « ce portage n'a pas de
réglages à régler ». C'était faux : il en a sept, dont cinq portent sur quelque
chose que le portage possède, et trois sont **persistés**.

| option | valeurs | source |
|---|---|---|
| `Back` | — | ferme le menu |
| `Y-Axis: Inverted / Not Inverted` | facteur 1 ou −1 | `SettingsSave.inversionFactor` |
| `Look Sensitivity: N` | 1 à 10, défaut 5 | `Axis._sensitivity` |
| `Flight Sensitivity: N` | 1 à 10, défaut 5 | idem |
| `Screen Brightness: Normal / Bright` | tonemapping | `TonemappingManager` |
| `Shadows: On / Off` | distance d'ombre, **+3,3 ms par image** | `QualitySettings.shadowDistance` |
| `Exit to Main Menu` | verrouillée | pas de menu principal ici |

Trois détails qui ne s'inventent pas :

- La sensibilité est un entier **en anneau** : dépasser 10 ramène à **1**, pas à
  10. Vérifié dans le portage : 6, 7, 8, 9, 10, **1**, 2.
- **5 est le neutre**, et la formule le dit :
  `axe = brut × inversion × sensibilité / 5`. Une sensibilité de 2 donne donc un
  facteur de 0,4, et l'inversion de −0,4.
- `TonemappingManager._isTonemappingActive` est un statique à **faux** : l'état
  de départ est « Normal », et « Bright » active le tonemapping.

Les réglages ont leur **propre sauvegarde** dans le jeu — `SettingsSave`, distincte
de `PlayerData`. Effacer sa partie ne remet donc pas la sensibilité à zéro, et le
portage garde cette séparation : vérifié, les réglages survivent à un
`wipe()` de la sauvegarde de partie. Le menu fige aussi la partie, comme
`SettingsMenu.Open` met `Time.timeScale` à 0.

Les trois couleurs viennent de `Menu` : `ColorHSV(40, …)` donne #262117 pour une
option verrouillée, #B29559 pour l'option choisie, #4C4026 pour les autres.

### Les icônes de manette

`ScreenPrompt` pose l'icône **dans** le contenu, avant le texte, et préfixe
celui-ci d'une espace pour l'en dégager. Les seize textures sont dans le build,
mais leur nom de fichier ne suit pas toujours celui de l'énumération : quatre
gâchettes et bumpers sont rangés sous leur abréviation — `RightTrigger` est
`RT.png`, `RightBumper` est `RB.png` — ce que seul le code dit.

Le portage se joue au clavier, mais l'icône dit quel bouton le jeu attendait.

### La disposition du menu, et les polices

`Menu` emploie des `GUIText`, que j'avais pris pour du texte 3D. Ce n'en est
pas : un `GUIText` se dessine en espace écran, positionné par les coordonnées
d'écran de sa transformation **plus un décalage en pixels porté par le
composant**. Toute la disposition était donc lisible dans la scène :

| | |
|---|---|
| racine du menu | coordonnées d'écran **(0,5 ; 0,8)** |
| titre « Settings » | décalage (0, 0), corps **42** |
| options | décalages **−70 à −370**, par pas de **50**, corps **30** |
| fond | `GUITexture` `LocationText_BG`, à (0 ; −0,26), aux dimensions (0,36 ; 0,81) de l'écran, gris à 50 % |

Un détail amusant au passage : `Option7` porte le texte **« Exit Game »** dans la
scène, que `UpdateOptionText` remplace par « Exit to Main Menu » à l'exécution ;
et `Option3` est figée sur « Look Sensitivity: 3 », une valeur d'auteur.

### Les polices étaient là depuis le début

La découverte qui vaut pour **toute** l'interface : les quatre polices du jeu
sont extraites depuis `04_extract_assets.py`, et je n'en avais utilisé aucune —
tout était rendu dans une police système à chasse fixe. `OWUtilities` les
répartit par rôle :

| rôle | police | où |
|---|---|---|
| `GetDialogueFont` | **Gill Sans MT** | dialogues et invites |
| `GetHelmetFont` | **digital-7** | casque : alertes de ressources, pilote automatique |
| `GetPromptGUIStyleCharacterName` | **Gill Sans MT Bold** | noms de personnages |
| `GUIText` du menu | **Gill Sans MT Menu** | réglages |

Elles sont désormais chargées et appliquées par rôle. C'est le changement le
plus visible de cette passe, et il ne coûte que quatre `@font-face`.

## Ce qui reste
- ~~Les **icônes de manette**~~ — reprises, et la manette avec : la Gamepad API
  produit les mêmes axes et les mêmes codes que le doigt et le clavier, si bien
  que rien en aval ne sait d'où vient l'ordre (voir
  [`34-actions.md`](34-actions.md) A10).
- ~~Le **secteur majeur** n'est pas modélisé~~ — c'est désormais le drapeau
  `_useMinimap` du secteur majeur actif qui allume la minicarte, et non la
  proximité d'un corps. La distance n'entre plus en jeu : elle faisait
  apparaître la minicarte en plein vol au-dessus d'un secteur qui ne la demande
  pas, et disparaître au fond d'un secteur qui la demande.
- Les **traces de la minicarte** sont des points, là où le jeu emploie deux
  systèmes de particules.
