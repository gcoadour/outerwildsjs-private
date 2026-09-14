# Ce qui se commande, et quand

[`61`](61-commandes.md) a lu les vingt-deux canaux de l'`InputManager` : quelle
touche fait quoi. Il manquait l'autre moitié, et c'est celle qui se sent en
jouant.

```
OWInput.GetAxis(canal)    →  _activeInputs.Contains(canal) ? valeur : 0
OWInput.GetButton(canal)  →  _activeInputs.Contains(canal) ? tenu   : false
```

Rien de plus. `OWInput` tient un **ensemble** de canaux actifs et l'échange
**en entier** à chaque changement de mode ; un canal absent de l'ensemble
courant ne rend pas « rien ne s'est passé », il rend zéro — comme si la touche
n'existait pas.

Le portage lisait les vingt-deux canaux en permanence. **Ce n'est vrai dans
aucun mode du jeu, pas même à pied.**

## Les dix ensembles, mesurés

Les dix sont posés dans `OWInput..cctor`, en alias de mode. Chaque classe
`*Input` — `GroundInput`, `JetpackInput`, `ShipInput`, `MapInput`… — n'est
qu'une **table d'alias** vers les vingt-deux canaux : `ShipInput.roll` et
`JetpackInput.yaw` pointent tous deux sur `Yaw`, et c'est de là que vient le
partage roulis/lacet de [`61`](61-commandes.md).

| mode | canaux | ce que cela veut dire |
|---|---|---|
| à pied | **18** | ni autopilote, ni caméra d'atterrissage, ni zoom |
| au poste de pilotage | **17** | **ni saut, ni lampe**, ni alt-sonde |
| caméra d'atterrissage | **12** | et **pas de menu** |
| vaisseau miniature | **8** | on le pilote, et c'est tout |
| carte | **8** | on ne marche pas, on n'interagit pas — mais on **vise** |
| lunette | **6** | **on ne marche plus du tout** |
| ordinateur de bord | **4** | choisir, annuler, deux axes |
| caméra du satellite | **3** | annuler, photographier, photographier en arrière |
| dialogue | **2** | avancer le texte, choisir la réponse |
| menu | **1** | la touche qui le referme |
| **mort** | **0** | `OnPlayerDeath` pose un ensemble **vide** |

Trois lignes valent qu'on s'y arrête.

**Pas de lampe au poste de pilotage.** `Flashlight` n'est pas dans
`_shipInputs`. On ne rallume pas sa lampe assis aux commandes — le tableau de
bord éclaire, et le jeu ne laisse pas le choix.

**La lunette vous enracine.** `moveX`, `moveZ` et `jump` sont absents de
`_telescopeInputs`. Regarder dans la lunette n'est pas une action qu'on fait en
marchant : on s'arrête. Le portage laissait marcher, et c'est tout autre chose —
on balayait le ciel en courant.

**Un mort ne commande rien**, pas même la pause. Le portage coupait déjà le
déplacement ([`46`](46-migration-lots.md)) ; il laissait la lampe, la carte et
la sonde.

## La case n'est pas une pile

`_lastInputs` est **une case**, pas une pile. Sept modes sauvegardent l'ensemble
courant avant de poser le leur ; entrer dans un second **écrase** la première
sauvegarde.

```
lunette  →  carte  →  menu
                      _lastInputs = carte   (la lunette est perdue)
refermer le menu   →  carte
refermer la carte  →  carte
```

On ressort d'un menu ouvert depuis la carte ouverte depuis la lunette avec…
l'ensemble de la carte. **C'est le build.** Ce n'est pas joli, et c'est
reproduit tel quel : un portage qui « corrige » cela ne se commande plus
pareil, et l'écart ne se verrait que là où il compte.

> **Un invariant garde une mesure, pas une conclusion.** « La pile se dépile
> correctement » aurait été une conclusion — et fausse. Le test dit ce que le
> build fait, et le dit dans son propre vocabulaire.

## Deux modes ne sauvegardent pas

Le poste de pilotage et la console du vaisseau miniature posent leur ensemble
**directement**, et leur sortie est écrite en dur : elle repose celui du
personnage. Avec une exception, qui est une vraie ligne de code et non un oubli :

```
OnExitFlightConsole:
    si _usingTelescope → ne rien faire
    sinon              → _activeInputs = _characterInputs
```

Quitter le poste **pendant que la lunette est ouverte** ne touche à rien. Sans
ce test, refermer la lunette ensuite rendrait deux fois les commandes du
personnage, et la première fois trop tôt.

## Où le filtre vit

Dans `Commandes`, au même endroit que dans le build — `GetAxis` pose la
question, pas ses soixante appelants.

```js
held(nom, etat) { if (!this.permis(nom)) return false; … }
axis(nom, etat) { if (!this.permis(nom)) return 0; … }
```

> Un filtre qu'on peut oublier à un endroit n'est pas un filtre. Le brancher
> aux soixante appels de `main.js` aurait laissé des trous, et les trous d'un
> système d'entrées ne se voient qu'en jouant.

Les transitions, elles, se lisent sur l'**état** : chaque bascule de mode a déjà
son booléen dans la boucle, et les guetter est exact là où brancher chaque
appel ne l'aurait pas été. Les sorties passent d'abord, dans l'ordre inverse des
entrées, pour que la case se vide dans le bon ordre.

## Les cinq ajouts restent dehors

Les cinq canaux que ce portage ajoute faute d'équivalent dans le build
([`61`](61-commandes.md)) ne sont dans aucun ensemble — et ne le seraient à
tort dans aucun. Ils passent toujours, et c'est dit à un endroit plutôt que
dilué dans les appels.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 435** vérifications (+64) |
| sur le build | 360 vérifications |
| en navigateur, avec le build | **184** contrôles (+10) |
| en navigateur, sans le build | 13 contrôles |

Les contrôles en navigateur mesurent ce qui se sent : la lunette ouverte, la
touche de marche **ne rend plus rien** ; refermée, elle rend 1 à nouveau. C'est
la même touche, le même code, et deux réponses.

## La leçon

> Savoir quelle touche fait quoi ne dit pas **quand** elle le fait.

Le tableau des vingt-deux canaux avait l'air d'être toute la question des
commandes. Il en était la moitié — et l'autre moitié ne tient pas dans une
table de touches : elle tient dans dix ensembles et une case de sauvegarde.
