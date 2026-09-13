# Les commandes — celles du build, pas celles du portage

Le portage se jouait en WASD, T pour la lunette, F pour la sonde, L pour la
lampe, M pour la carte. Aucune de ces touches sauf les quatre premières n'est
celle de l'alpha, et personne ne l'avait vérifié : **les liaisons du jeu sont
dans le build**, et le portage ne les lisait pas.

Elles sont dans l'`InputManager` — un des dix-neuf *réglages de projet* que
Unity 4 range dans `mainData`. Deux raisons de ne pas les avoir vues, et les
deux sont les mêmes que pour la sonde ([`60`](60-sonde.md)) :

1. le portage ne lisait `mainData` que pour inventorier sa scène ;
2. `unity41-types.json` n'avait pas la structure de la classe 13, donc l'objet
   n'était pas lisible même en le trouvant.

Quatre classes ont été ajoutées à `tools/16_unity_types.py`, et le fichier
regénéré : `TimeManager` (5), **`InputManager` (13)**, `PhysicsManager` (55),
`TagManager` (78). L'oracle est le même que partout — lire l'objet doit
consommer exactement ses `byteSize` octets — et il passe.

## Ce que le build dit

`InputChannels` déclare **vingt-deux canaux** ; l'`InputManager` décline chacun
en trois axes selon la source (`_Key`, `_PC`, `_Mac`), soit soixante-six axes.

| canal | clavier / souris | manette (numérotation Unity) |
|---|---|---|
| Move X | `a` / `d`, suppl. `j` / `l` | axe 0 |
| Move Z | `s` / `w`, suppl. `k` / `i` | axe 1, inversé |
| **Move Up** | **maj gauche / droite** | axe 9 (gâchette droite) |
| **Move Down** | **ctrl gauche / droit** | axe 8 (gâchette gauche) |
| Yaw / Pitch | mouvement de souris | axes 3 / 4 |
| Zoom In / Out | maj / ctrl | axes 9 / 8 |
| Interact | `e`, suppl. `u` | bouton 2 |
| **Cancel** | **`q`**, suppl. `o` | bouton 1 |
| Jump | `espace` | bouton 0 |
| **Flashlight** | **`f`**, suppl. `h` | axe 6 (croix) |
| **Telescope** | **clic du milieu** | bouton 9 |
| **Lock On** | **clic gauche** | bouton 4 |
| **Probe** | **clic droit** | bouton 5 |
| Alt Probe | `r`, suppl. `y` | bouton 3 |
| Match Velocity | `espace` | bouton 0 |
| Autopilot | `e`, suppl. `u` | bouton 2 |
| Landing Camera | `r`, suppl. `y` | bouton 3 |
| Swap Roll/Yaw | alt gauche / droit | bouton 8 |
| **Map** | **`entrée`** | bouton 6 |
| Pause | `échap` | bouton 7 |

Les classes `*Input` assemblent ensuite ces canaux **par mode de jeu** —
`GroundInput`, `JetpackInput`, `ShipInput`, `MapInput`, `TelescopeInput`,
`InterfaceInput`, `ProbeInput`… — et c'est là que se voit l'économie du
dispositif : **un canal sert plusieurs actions, et le mode tranche.**

| une touche | deux actions | parce que |
|---|---|---|
| `Probe` | lancer, photographier, rappeler | `ProbeInput` construit ses trois statiques dessus |
| `Move Up` | monter au sac dorsal, zoomer à la lunette | `JetpackInput.thrustUp` et `TelescopeInput.zoomIn` |
| `Alt Probe` | photo arrière, caméra d'atterrissage | `SatelliteInput` et `ShipInput` |
| `Interact` | parler, déclencher le pilote automatique | `InterfaceInput` et `ReferenceFrameInput` |
| `Jump` | sauter, accorder sa vitesse | `GroundInput` et `ReferenceFrameInput` |

## Ce que le portage faisait, et qui était faux

### Le saut et le sac dorsal sur la même touche

`player.js` commentait : « au sol, la touche « haut » saute sur son FRONT ; en
l'air, la même touche tenue allume le sac dorsal. **C'est le partage du jeu**, et
le portage n'avait que la seconde moitié. »

Ce n'en est pas un. Le build a deux canaux, `Jump` (espace, `GroundInput.jump`)
et `Move Up` (majuscule, `JetpackInput.thrustUp`). On peut donc **sauter et
pousser en même temps**, et c'est ce qui donne au décollage sa forme.

Pire : il n'y avait **pas de descente**. `JetpackInput.thrustDown` existe, sur
le contrôle, et le portage ne pouvait que couper la poussée et tomber.

### L'accélérateur qui n'existe pas

La majuscule portait un « boost ». Le build n'a aucun canal de course — et la
majuscule y est la poussée verticale. La touche la plus utilisée du portage
faisait donc une chose que le jeu ne fait pas, à la place de celle qu'il fait.

### Le roulis inventé

Le portage avait pris `Q` et `Z` « faute d'en avoir une paire libre ». Or `Q`
est le canal `Cancel`. Et le build n'a pas d'axe de roulis du tout :
`JetpackInput.roll` et `JetpackInput.yaw` sont construits sur le **même** canal
(`yaw`), et `Swap Roll/Yaw` — la touche alt, le clic du manche gauche — choisit
lequel des deux reçoit le mouvement.

### Les trois boutons de souris jamais lus

`Lock On` est le clic gauche, `Probe` le droit, `Telescope` celui du milieu. Le
portage n'écoutait aucun bouton de souris, et avait mis ces trois actions sur
des lettres.

### La manette, fausse quatre fois sur six

`PAD_BUTTONS` avait été écrit de mémoire. En regard de l'`InputManager` :

| bouton | le portage | le build |
|---|---|---|
| A | monter | **sauter** |
| B | interagir | **annuler** |
| X | lampe | **interagir**, pilote automatique |
| Y | lunette | **vue arrière**, caméra d'atterrissage |
| LB | ordinateur de bord | **viser un référentiel** |
| RB | sonde | sonde ✓ |

Et une septième erreur, de numérotation cette fois : le build compte comme
Unity sous Windows, le navigateur comme le « standard mapping ». **Les deux
coïncident jusqu'à cinq et divergent ensuite** — ce qu'Unity appelle 6 et 7
(Back et Start) est 8 et 9 dans le navigateur, où 6 et 7 sont les gâchettes.
Prendre les numéros tels quels aurait mis la carte sur la gâchette gauche. La
table de traduction est dans `gamepad.js`, nommée.

## Deux pièges que seul le navigateur pouvait montrer

Aucun des deux ne se voit sans lancer la page. Les deux ont fait échouer
`tools/15_verify.py`, ce qui est exactement son travail.

### Unity et le DOM ne numérotent pas les boutons pareil

```
Unity      0 gauche   1 DROIT    2 milieu
DOM        0 gauche   1 MILIEU   2 droit
```

`mouse 1` traduit naïvement mettait la sonde **sur la molette** et la lunette
sur le clic droit. `codeUnity` croise donc 1 et 2, et un test le garde.

### `preventDefault` sur un événement pointeur tue l'événement souris

Babylon appelle `preventDefault()` sur `pointerdown` pour son propre pilotage de
caméra. Or **un `preventDefault` sur un événement pointeur supprime les
événements souris de compatibilité qui devaient suivre** : le `mousedown` posé
sur la fenêtre ne se déclenchait jamais.

Le symptôme était muet et déroutant : les *mouvements* de souris passaient, les
*boutons* non, et rien dans la console. Le moteur écoute donc `pointerdown` et
`pointerup`, ce qui est de toute façon le bon choix — ils couvrent aussi le
stylet et le doigt.

> Une mesure de plus pour la liste : **un test sans navigateur n'appuie sur
> aucun vrai bouton.** Les 1 189 vérifications de `tests/09-jeu.mjs` passaient
> avec la mauvaise numérotation *et* avec un écouteur qui ne se déclenchait
> jamais.

## Ce que le portage ajoute, et le dit

Quatre commandes n'ont aucun canal dans l'alpha, et `input.js` les range à part
dans `AJOUTS` plutôt que de les mêler aux vingt-deux :

| | pourquoi |
|---|---|
| `N` ordinateur de bord | il se consulte à l'intérieur du vaisseau, que ce portage n'a pas |
| `B` guimauve | elle se mange au feu de camp |
| `G` mode d'affichage | un outil de mise au point |
| `C` recentrer la carte | le build recentre autrement |

## Le tactile, refait sur les mêmes canaux

L'accélérateur disparaît ; sa place revient à la **descente** au sac dorsal, qui
existe et manquait. Le saut prend une place à lui. La lampe passe sur une
gâchette, l'ordinateur de bord au centre. Le cran de course du manche gauche
**monte**, ce que la majuscule fait dans le build.

| | avant | après |
|---|---|---|
| L1 | lunette (`T`) | lunette (clic milieu) |
| L2 | sonde (`F`) | sonde (clic droit, **tenue**) |
| R1 | carte (`M`) | carte (`entrée`) |
| R2 | ordinateur de bord | **lampe** (`F`) |
| ▲ | monter (`espace`) | monter (`maj`) |
| ✕ | **accélérer** | **descendre** (`ctrl`) |
| ● | lampe | **sauter** (`espace`) |
| ⏺ | agir (`E`) | agir (`E`) |
| centre | vue, menu | **bord**, vue, menu |

Dix-neuf boutons au lieu de dix-huit.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 189** vérifications (`tests/09-jeu.mjs`, +55) |
| sur le build | **343** vérifications (`tests/05-extract.mjs`, +18) |
| en navigateur, avec le build | **126** contrôles (+8) |
| en navigateur, sans le build | 13 contrôles |

L'invariant central est le dernier de `tests/05-extract.mjs` : **la table de
repli de `web/src/input.js` dit exactement ce que l'`InputManager` dit.** Elle
existe pour que la page reste jouable sans le build, pas pour qu'on l'écrive de
mémoire — et le jour où l'une des deux bouge sans l'autre, le test le nomme,
canal par canal.

Les contrôles en navigateur, eux, gardent ce qu'aucun autre ne peut voir : un
**vrai** bouton de souris arrive, la lunette s'ouvre au clic du milieu, la lampe
répond à F, la carte à entrée, et les liaisons chargées ne sont pas le repli.

> Deux d'entre eux ont d'ailleurs été gagnés en réparant le contrôle lui-même.
> La sonde ne partait plus sur un profil **neuf**, et pour une bonne raison :
> `KnowsHowProbesWork` est persistant, l'ancien profil l'avait appris de la
> session précédente, et la fenêtre de deux cents mètres ne s'était donc jamais
> refermée sous le test. Elle est maintenant gardée dans les deux sens — le tir
> refusé avant, le tir qui part après — et le drapeau est remis à faux avant la
> mesure, parce qu'un test qui ne passe qu'à la première exécution ment à la
> seconde.

## La leçon

> Avant de conclure qu'une chose manque au build, vérifier qu'on la lit
> ([`34`](34-actions.md)). Avant de croire la liste, vérifier qu'elle couvre le
> jeu entier ([`60`](60-sonde.md)).
>
> **Et : ce qui n'est pas un composant est quand même dans le build.**

Les commandes ne sont posées sur aucun objet. Elles ne sortent d'aucun
recensement de MonoBehaviour, d'aucun `composants.mjs`, d'aucune passe de
`scripts/recensement.mjs` — même corrigé pour lire les cinq fichiers. Elles sont
un *réglage de projet*, et cette catégorie entière était invisible au portage :
le pas de physique, la gravité par défaut, les noms de balises et de calques que
`LayerMask.NameToLayer` et `FindWithRequiredTag` cherchent partout dans l'IL,
étaient dans le même angle mort.
