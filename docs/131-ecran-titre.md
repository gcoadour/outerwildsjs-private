# L'écran-titre : le niveau 0, porté

Le portage entrait droit dans la partie. L'alpha, elle, s'ouvre sur une petite
planète qui tourne lentement sous les étoiles, un feu de camp qui fume, deux
voyageurs — le Voyageur à la flûte, l'Archéologue au banjo —, le vaisseau posé,
et cinq lignes : **New Expedition**, **Resume Expedition**, **Skip Intro**,
**Settings**, **Exit Game**. `docs/28-hud.md` et `docs/99` notaient l'absence
de menu principal, et `SettingsMenu` verrouillait sa septième option « faute de
menu principal ». Tout était pourtant dans le premier fichier du build.

Le constat est venu en **lançant l'alpha elle-même** à côté du portage
([`132`](132-comparaison-native.md)) : la première image de l'une et de l'autre
ne se ressemblaient pas.

## Ce que `mainData` pose

`mainData` est le **niveau 0** d'Unity 4 : les réglages du projet *et* une
scène. `scripts/composants.mjs --scene mainData --regex .` la liste (l'option
`--scene` est ajoutée par ce lot) :

| objet | composants | rôle |
|---|---|---|
| `Root` | `RotateTransform` (+1°/s autour de Y), `TonemappingManager` | porte la caméra et la lune |
| `PlanetPivot` | `RotateTransform` (−1°/s autour de **son** Y) | porte la planète, retournée de 180° sur X |
| `Camera` | `Camera` (70°, 0,3–1000, `DeferredLighting`, HDR), `DepthOfFieldScatter`, `Tonemapping` | |
| `MoonLight` | `Light` ponctuelle, portée 170, bleutée, ombres douces | |
| `Campfire/Light` | `Light` ponctuelle, portée 302,75, orangée, `LightFlicker` | |
| `Campfire` | `AudioSource` (`campfire`, 3D, 3–50), 5 `ParticleSystem` | flamme, deux fumées, deux distorsions |
| `MainMenu` | `TitleScreenMenu`, `AudioSource` (`Main Title 050913 AP`, **2D**, 0,4, en boucle) | cinq `GUIText` |
| `OWLogo` | `GUITexture` (`Logo_Fall_Whitepng`) | |
| `SettingsMenu` | `SettingsMenu` | les sept options déjà portées |

Deux classes moteur manquaient à `unity41-types.json` parce qu'aucun objet de
`level0` ne les porte : **`GUIText` (132)** et **`GUITexture` (131)**.
`tools/16_unity_types.py` les ajoute ; l'oracle les lit **au bit près**
(13/13 et 2/2, `tests/05-extract.mjs`).

## Ce que le menu fait, lu dans l'IL

```
TitleScreenMenu.Start      if (PlayerData.LoadLoopCount() < 2) _optionLockList[1] = true
TitleScreenMenu.ToggleOption(dir)
    if (dir != 0) return                    gauche, droite, clic droit : rien
    0  TriggerLoad(true,  false)            New Expedition
    1  TriggerLoad(false, false)            Resume Expedition
    2  TriggerLoad(true,  true)             Skip Intro
    3  _settingsMenu.Open(this)             Settings
    4  Application.Quit()                   Exit Game
TriggerLoad(newSave, skipIntro)
    _musicSource.FadeOut(0.5)
    ligne choisie : couleur HSV(104, 0.7, 0.7), texte « Loading... »
    if (newSave) PlayerData.CreateNewPlayerSave(skipIntro)
    GlobalMessenger.FireEvent("LoadFromMenu")
    StartCoroutine(Load)                    LoadLevelAsync(1), activation différée
    ActivateScene(); Suspend(false)
PlayerData.CreateNewPlayerSave(skipIntro)
    _playerSave = new PlayerSave()
    if (skipIntro) { knowsLaunchCodes = knowsTelescope = knowsProbes =
                     knowsShipProbes = knowsTargeting = true; SavePlayer() }
```

Trois choses qu'on ne devine pas :

- **Resume Expedition est grisée tant qu'on n'a pas deux boucles** au compteur.
- **Une nouvelle partie ordinaire n'écrit rien** : seule « Skip Intro » appelle
  `SavePlayer`. Quitter aussitôt laisse l'ancienne sauvegarde intacte.
  `PlayerData.nouvelleSauvegarde` fait exactement cela.
- **La souris peut viser une ligne verrouillée** (`Menu.Update` pose l'index au
  survol sans regarder le verrou) mais pas la valider.

La navigation passe par les canaux du build — `Move Z` (W/S, I/K), `Interact`
(E, U), `Jump` (espace), le clic gauche — avec les quatre horloges de `Menu`
(0,2 s). Les flèches n'y sont pas liées dans l'alpha, et ne le sont pas ici.

`SettingsMenu`, lui, dépend du niveau (`Application.loadedLevel`) : au titre sa
septième ligne est **vide** et ne fait rien ; en partie c'est
**« Exit to Main Menu »**, qui recharge le niveau 0. Elle était verrouillée
dans le portage ; elle ne l'est plus nulle part (`Settings({ niveau })`).
Revenir au titre recharge la page avec une marque de session que `gate.js` lit
pour repartir droit sur l'écran-titre.

## La scène, et un changement de repère

Les deux `RotateTransform` se composent : le pivot étant retourné de 180° sur X,
son Y local est le −Y du monde, et la planète tourne à **+2°/s dans le monde**
quand la caméra tourne à +1. Ce qu'on voit, c'est la planète qui tourne à +1°/s
sous la caméra.

Le portage garde **la planète immobile** et fait tourner le reste à l'envers :
caméra et lune à −1°/s, voûte à −2°/s (`repereDuTitre`). Les poses relatives
sont exactement celles du build, et les particules et la lumière du feu, posées
sur la planète, restent à leur place sans qu'on les déplace.

Le chargement suit `LoadLevelAsync` : au choix, la ligne passe à
« Loading... », la musique s'éteint en 0,5 s, et la partie se charge **derrière**
le titre, qui continue de tourner. Quand elle est prête, le titre s'efface.

## Ce que la comparaison a corrigé, image par image

Captures au même instant après le chargement (`scripts/alpha.sh` pour l'alpha,
`scripts/pw-titre.mjs … 4` pour le portage, qui cale l'horloge du titre).

1. **Un triangle bleu au milieu du ciel.** Le cube de voûte faisait 1,5 fois le
   plan lointain : ses coins sortaient du tronc de vue et la couleur de fond de
   la caméra passait par le trou. Il tient maintenant dedans.
2. **Une planète noire.** Les matériaux glTF sont en PBR, dont l'atténuation
   physique (1/d²) laisse à la planète, à 77 unités d'une lune d'intensité 1,
   un six-millième de sa lumière. Unity 4 atténue sur la **portée** :
   `1/(1 + 25 (d/r)²)`, coupé à r — et ses shaders « legacy » multiplient par
   **deux**. `patchAttenuationUnity` remplace la fonction d'atténuation
   « standard » des shaders PBR de Babylon par celle-ci ; seuls les matériaux
   qui renoncent à l'atténuation physique la lisent (ceux du titre). Le feu de
   camp dore alors la planète comme dans l'alpha.
3. **Pas de colonne de fumée.** Deux causes, et la seconde vaut pour tout le
   jeu :
   - le build **préchauffe** ses fumées (`prewarm`) : elles sont là dès la
     première image. L'extracteur ne le transmettait pas (`prewarmCycles`) ;
   - **la courbe `sizeOverLife` d'Unity multiplie la taille initiale ; le
     gradient de Babylon la remplace.** La fumée — 30 à 60 unités, courbe de
     0,12 à 0,58 — sortait à trois dixièmes d'unité, et **toutes** les fumées,
     flammes et poussières du monde étaient à la même échelle réduite
     (`sizeGradients`, mesuré dans la page).
4. **Ni ombres ni nuit entre les pins.** La caméra du titre est en
   `DeferredLighting`, seul chemin d'Unity 4 où une lumière ponctuelle projette
   des ombres ; les deux lumières en portent de douces. Deux générateurs
   d'ombres cubiques les rendent.

Ce qui reste volontairement de côté :

- `DepthOfFieldScatter` : `maxBlurSize` vaut **0** dans la scène, le flou ne
  s'applique jamais (marqué `@autrement`).
- Le son du feu : clip 3D, portée 50, et la caméra en est à 64 unités — il est
  inaudible dans l'alpha aussi.
- Le Voyageur ne joue pas de la flûte : son `Animator` n'a **pas de
  contrôleur**. L'Archéologue, lui, joue (`Animation` en lecture automatique).
- « For educational use only », en bas à droite de l'alpha, est le filigrane
  de la licence Unity du moteur, pas du jeu.

## Invariants

- `tests/05-extract.mjs` : `GUIText`/`GUITexture` lus au bit près ; cinq
  options dans l'ordre de `_menuOptions`, ancrées en bas à gauche, par pas de
  60 pixels, en corps 40 ; caméra à 70° sur la voûte ; deux `RotateTransform` ;
  encart du logo de 385,73 × 212 ; six faces de voûte.
- `tests/09-jeu.mjs` : verrou de Resume sous deux boucles, navigation qui saute
  le verrou, survol sans validation, actions des cinq lignes, horloges de
  `Menu`, composition des rotations (−1 et −2°/s), placement des `GUIText` et
  de la `GUITexture` à 1280 × 720, teinte ×2, atténuation d'Unity,
  préchauffage, gradients de taille multipliés.
- `scripts/playwright-scenarios.mjs` et `tools/15_verify.py` traversent le
  titre comme un joueur : la touche E sur « New Expedition ».
