# Perdre la gravité vous prend les commandes

Quitter un champ de gravité n'est pas seulement cesser de tomber. Le jeu vous
**retourne**, et pendant qu'il le fait, il vous prend le regard.

```
BreakAlignment:
    CenterCamera(50)                         la caméra revient au centre
    InitDiscreteRotation(corps, caméra, 50)  le CORPS va où le regard était
    FireEvent("BreakPlayerFieldAlignment")   → _isInputLocked = true

InitAlignment:
    FireEvent("InitPlayerFieldAlignment")    → _isInputLocked = false
                                               StopSnapping()
```

## Cinquante degrés par seconde

Et non les **cent** du point d'accrochage ([`69`](69-assise.md)). Se relever
d'un siège est vif ; perdre le sol sous ses pieds est **lent**, et cette lenteur
est le seul moment du jeu où l'on ne commande plus rien.

Un demi-tour complet dure **3,6 secondes**. C'est long. C'est fait pour.

> La durée est encore un **angle divisé par un taux** — la troisième fois dans
> ce build, après le demi-tour du siège et le recentrage de la caméra. C'est une
> habitude de ce studio, et elle se reconnaît maintenant à vue : quand un champ
> s'appelle `_rate` et qu'il vaut une dizaine, c'est une vitesse angulaire, et
> la durée en découle.

## Retrouver le sol rend tout, immédiatement

`InitAlignment` ne se contente pas de déverrouiller : il appelle
`StopSnapping()`. Le recentrage en cours **s'arrête là où il en est**.

Retomber dans un champ pendant qu'on se fait retourner rend donc les commandes
**tout de suite**, sans attendre la fin du mouvement. Le jeu ne vous garde pas
prisonnier d'une animation qui n'a plus de raison d'être.

## La toute première image est alignée

```
CheckAlignmentRequirements:
    si _isFirstFrame → _isFirstFrame = false, et rendre VRAI
    sinon → la règle normale
```

Quoi qu'il arrive, quel que soit le champ trouvé. Sans cela, le premier instant
d'une partie serait une chute libre pendant que le détecteur cherche son corps.

C'est une ligne, et c'est la différence entre se réveiller debout et se réveiller
en tombant.

## Ce que ce portage n'a pas

Le build tourne le **corps** vers l'orientation de la **caméra** — deux choses
distinctes chez lui. Ici elles n'en font qu'une : le regard *est* l'orientation
du joueur, tenue en lacet et tangage.

La rotation discrète n'a donc rien à tourner, et ce qui reste est ce qui se
sent : **les commandes verrouillées** et **la caméra qui revient au centre**.
C'est écrit à l'endroit où le choix est fait, pas passé sous silence.

En revanche la **durée** se calcule sous la forme du build — deux poses, et
`Quaternion.Angle` entre elles. Ici « le corps » est la pose alignée sur
l'horizon et « le regard » la même plus le **tangage** : leur écart est donc
exactement le tangage, ce qui rend la loi du build applicable telle qu'elle est
écrite plutôt que traduite en degrés au point d'appel.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 681** vérifications (+17) |
| sur le build | 395 vérifications |
| en navigateur, avec le build | **255** contrôles (+5) |
| en navigateur, sans le build | 13 contrôles |
| annonces nommées | 34 → **36** |

## La leçon

> Un jeu qui vous retire les commandes vous dit quelque chose. Un portage qui
> ne les retire jamais ne le dit pas.

Le portage laissait le regard répondre en permanence — ce qui semble une
amélioration, et n'en est pas une. Les trois secondes et demie où l'on ne
contrôle plus rien sont exactement ce qui fait que quitter une planète se
**remarque**.
