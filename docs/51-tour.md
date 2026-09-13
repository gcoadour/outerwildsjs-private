# La tour de lancement, les pads, et ce que « posé » veut dire

Quatre mécaniques du début de partie, toutes posées dans le build et aucune
lue. Deux d'entre elles remplacent une approximation du portage par une règle
plus exigeante, et c'est la seconde qui est intéressante.

## La tour : un terminal qui refuse

[`43-pnj-son-decollage.md`](43-pnj-son-decollage.md) avait débloqué le
décollage — les codes de lancement sont accordés **à la fin** de la conversation
du Conservateur, et par lui seul. Le portage s'arrêtait là : on rejoignait le
vaisseau à pied.

Le build pose un enchaînement :

```
apprendre les codes  →  le terminal s'annonce (« Enter Launch Codes »)
l'actionner          →  ActivateLaunchTower  →  l'ascenseur s'ouvre
l'actionner          →  il monte, 31,5 unités en 5 secondes
```

Et le terminal ne verrouille pas, il **refuse** : sans les codes, un son négatif
et il se remet en état ; avec, un son affirmatif, il actionne la tour et se
désactive. Ce qui ouvre le vaisseau reste la connaissance — le terminal ne fait
que le dire à haute voix.

### La scène contredit le constructeur

C'est le seul endroit de toute cette série où cela arrive, et il valait d'être
relevé :

| | constructeur | instance |
|---|---|---|
| `_trackHeight` | 10 | **31,5** |
| `_liftDuration` | 3 | **5** |

Partout ailleurs — les seuils de la marche, `_secondsToRepair`,
`_activationDist` du regard — le constructeur pose une valeur que la scène ne
sérialise pas, et l'invariant garde cette **absence**. Ici les deux existent et
diffèrent ; c'est l'instance qui gagne, et l'invariant garde les deux nombres
pour que la prochaine lecture ne prenne pas le mauvais.

### Deux détails qui font la cabine

```
u        = SmoothStep(0, 1, (t − départ) / durée)
position = Lerp(départ, cible, u)
volume   = clamp01(u × 10)
```

`SmoothStep` et non une rampe : elle part et s'arrête en douceur. Et le son
monte en un **dixième** du trajet, pas sur toute sa durée — une cabine qui
démarre fait du bruit tout de suite. Arrivée, elle détache le joueur, coupe la
boucle, joue `elevatorstop` et rallume sa lampe.

Une dernière règle, dans `LaunchElevatorController` : si le joueur entre dans le
déclencheur alors que la cabine est au-delà de **90 %** de sa course, elle
**redescend**. C'est ce qui évite de rester coincé en haut.

## Les pads : « posé » n'est pas « quelque chose est sous moi »

`LandingPadManager.Update` tient en une phrase :

> posé ⟺ les **trois** capteurs touchent, et tous les trois le **même** corps.

Trois `LandingPadSensor`, sphères de rayon 0,5, posées sur `Ship_Body` : deux en
bas et écartées — les pieds —, une haute et centrée. Toutes portent le même son
de contact, `podland_thud_hiss`.

Le portage déclarait « posé » au premier contact de son rayon vers le bas. Un
vaisseau à cheval sur un rebord était donc posé, et un vaisseau sur le flanc
aussi. C'est la différence entre « quelque chose est sous moi » et « je suis
posé ».

> **Une nuance de portage, et elle est dite.** Le build compare des
> `OWRigidbody`. Ce portage n'en a pas sous la main au point de contact : il
> compare le corps dont la **surface** est la plus proche du point touché.
> C'est la même question posée autrement.

## L'entrée du musée

`MuseumEntryway` écoute `ResumeSimulation` et **rejoue** son événement d'entrée
pour le joueur. Le portage fige la partie dans le menu des réglages
(`Time.timeScale = 0`, mesuré) et la reprend telle quelle ; le build refait
passer le joueur par la porte. Sans cela, revenir d'un menu vous laisse compté
dehors alors que vous n'avez pas bougé.

## Une erreur corrigée en passant

En branchant le point d'impact que [`49`](49-queue.md) avait rendu nécessaire —
le build choisit la pièce touchée par **proximité au point**, pas par une
normale — je l'ai calculé ainsi :

```js
contact(dt, point, n, basis) {
  this.pos.x = point[0]; …          // le vaisseau est déplacé
  const rel = [point[0] - this.pos.x, …];   // …donc rel vaut toujours zéro
```

Le vecteur était nul à chaque fois, et la même pièce aurait été choisie
indéfiniment. Rien ne l'aurait signalé : un zéro est une valeur comme une autre,
et `nearestEngine([0,0,0])` rend un réacteur parfaitement plausible. La position
d'avant le contact est maintenant capturée avant d'être écrasée.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : les commandes
fermées tant que la tour n'est pas actionnée ; la moitié de course à mi-temps
mais un départ adouci, le son plein avant le dixième ; l'arrivée annoncée une
fois, les 31,5 unités, le retour au départ ; le terminal qui refuse autant de
fois qu'on veut, l'invite qui vient de la connaissance, et l'actionnement
unique ; les trois capteurs et le même corps — un seul en l'air, ou deux corps,
et l'on n'est pas posé ; la direction de sortie du musée.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : un ascenseur
sur Timber Hearth, sa course de 31,5 et ses cinq secondes — **contre** les 10 et
3 du constructeur ; un terminal et son contrôleur ; trois capteurs, tous sur le
vaisseau, tous de rayon un demi, tous au même son ; un gestionnaire de pads ;
une entrée de musée.

## La leçon

> un test doit garder une mesure, pas une conclusion ([`49`](49-queue.md)) —
> l'outil qui compte se mesure aussi ([`50`](50-regard.md)) — et **un zéro
> calculé ressemble à un zéro mesuré**.

`rel` valait zéro parce que je lisais une variable après l'avoir écrasée. Aucune
vérification ne l'aurait vu : la valeur était du bon type, dans le bon ordre de
grandeur, et donnait un résultat crédible. C'est ce qui distingue cette
catégorie d'erreur des autres — elle ne produit pas d'absurdité, elle produit
une réponse constante et plausible.
