# La connaissance débloque enfin quelque chose

Jusqu'ici la mémoire entre boucles était enregistrée, persistante, affichée — et
**sans effet**. Or dans Outer Wilds c'est tout le jeu. `web/src/playerdata.js`.

## Le vrai mécanisme du build

Deux découvertes ont orienté l'implémentation.

**Le déblocage n'est pas au niveau des branches.** Les 20 attributs
`eventbased` du build valent **tous `"false"`** — j'avais soupçonné un bug de
mon parseur, il n'y en avait pas : ces branches ne sont simplement pas activées
dans cette alpha.

**Il est au niveau des arbres entiers.** Chaque contrôleur de personnage échange
l'arbre de dialogue complet selon des drapeaux :

| contrôleur | condition |
|---|---|
| `CoachConvoController` | `HasCompletedTraining()`, puis `KnowsLaunchCodes()` |
| `CuratorConvoController` | appelle `LearnLaunchCodes()` |
| `SecondLoopConvoTrigger` | `TimeLoop.GetLoopCount() == 2` |
| `RocketKidConvoController` | compteurs d'atterrissages et de crashs |

## Le vocabulaire, tiré de `PlayerData`

L'API donne les noms exacts, qu'il aurait été absurde d'inventer :

```
HasExploredPlanet(SectorName) / SaveExploredPlanet(...)
LearnTargeting()   / KnowsTargeting()
LearnLaunchCodes() / KnowsLaunchCodes()
KnowsHowProbesWork() / KnowsHowShipProbesWork() / KnowsHowTelescopeWorks()
HasCompletedTraining()
SaveLoopCount(n) / LoadLoopCount()
```

Et `Sector.SectorName` énumère les huit lieux : Nomad, HourglassTwins,
TimberHearth, BrittleHollow, GiantsDeep, DarkBramble, QuantumMoon, Sun.

`ShipComputer` appelle `SaveExploredPlanet` — c'est l'ordinateur de bord qui
enregistre les visites. `LaunchTerminal` et `LaunchCodePromptController`
appellent `LearnLaunchCodes` : les codes conditionnent le décollage.

## Ce que la connaissance débloque désormais

| connaissance | effet |
|---|---|
| **codes de lancement** | sans eux, le vaisseau reste au sol |
| **exploration d'un secteur** | le corps sort du néant sur la carte |
| **drapeaux de savoir** | sélection de l'arbre de dialogue, comme les contrôleurs |
| **numéro de boucle** | à partir de la deuxième, certains font leurs adieux |

La carte est le retour le plus lisible : un corps jamais approché s'y affiche en
creux et sans nom. Elle se remplit à mesure qu'on explore, et **elle ne se vide
jamais** — c'est la seule chose que la supernova épargne.

## Vérifié

| étape | résultat |
|---|---|
| départ, données effacées | 0 savoir, `1/8 explorés` |
| approche du vaisseau, `E` | codes de lancement appris |
| second `E` | embarquement autorisé |
| **après une supernova** | exploration et codes **conservés** |
| **après rechargement complet** | conservés, et boucle **1** restaurée |

## Deux défauts corrigés au passage

**Le compteur de boucles était écrasé.** La synchronisation remettait la valeur
fraîche du moteur — zéro — par-dessus la valeur sauvegardée à chaque
rechargement. Il est désormais restauré au démarrage, et la sauvegarde ne
progresse que vers le haut.

**Le rayon d'embarquement était trop serré.** À 12 unités, le vaisseau était
inatteignable : le joueur se stabilise à une trentaine d'unités après sa chute
sur le terrain. Porté à 40.

## Ce qui manque

- **Les autres savoirs ne sont pas gagnables** : seuls les codes de lancement
  ont une source. Il n'y a ni entraînement, ni télescope, ni sonde.
- **`RocketKidConvoController`** et ses compteurs d'atterrissages ne sont pas
  portés.
- ~~**La sélection d'arbre reste approximative**~~ — **corrigée** : la
  `Conversation` désigne ses arbres, un champ par situation, et l'extracteur
  sort maintenant tous ces pointeurs et non le seul arbre actif. C'est la
  référence qui fait foi ; le choix par nom d'arbre ne reste qu'en repli, pour
  une conversation dont les pointeurs ne se lisent pas. Deviner un fichier par
  une bribe de son nom marche jusqu'au jour où l'on renomme un fichier.
