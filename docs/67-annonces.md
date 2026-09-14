# Trois annonces lues — la guimauve soigne, le mur réclame, la lampe se propose

[`66`](66-allumage.md) a ouvert un dénominateur neuf : **124 événements**
annoncés par le build, 31 nommés par le portage. La première piste lue a donné
l'allumage du vaisseau. Cette page en lit trois de plus, et les trois étaient
des manques.

## `EatMarshmallow` — la guimauve est le soin du jeu

```
PlayerResources.OnEatMarshmallow:
    _currentHealth = _maxHealth
```

Deux lignes d'IL. **Manger une guimauve rend toute la santé.**

Le portage avait la guimauve depuis longtemps : elle grille au-dessus des
braises, elle devient immangeable si on la brûle, et `eat()` incrémentait un
compteur. Ce compteur ne servait à rien. Le feu de camp de Timber Hearth n'était
pas un décor, c'était **l'infirmerie**, et personne ne l'avait vu parce que la
mécanique n'est écrite nulle part dans la scène — juste dans un écouteur de deux
lignes.

## `SuitBarrier` — on ne quitte pas le village sans combinaison

```
OnRemoveSuit : _invisibleWall.collider.enabled = true
OnSuitUp     : _invisibleWall.collider.enabled = false
```

Ce n'est pas un volume qui déclenche quelque chose : c'est **un mur qu'on allume
et qu'on éteint**. Une seule instance dans le build, un cube de 11,47 unités
d'arête à la sortie du village, et `TriggerSuitWarning` quand on s'y cogne — ce
qui fait parler l'entraîneur.

Le portage ne pouvait pas s'en remettre à Havok : `InvisibleWall` porte un
`BoxCollider` et **aucun maillage**, et l'export glTF ne fabrique un collider
que pour ce qui se dessine ([`40`](40-solide.md)). Le mur n'existait donc nulle
part. Il est rendu ici comme ce qu'il est pour un joueur qui marche — une
poussée hors de la boîte, par la face la plus proche — plutôt qu'en
reconstruisant un agrégat Havok pour un cube.

> La face la plus proche, et pas la première trouvée : sortir par la mauvaise
> face traverserait la boîte en diagonale, ce qui est exactement ce qu'un mur ne
> doit pas laisser faire.

## `Flashlight.CheckPromptStatus` — sept conditions pour une invite

```
invite visible  ⟺  lampe éteinte
                ET combinaison portée
                ET pas dans le vaisseau
                ET pas sur la carte
                ET pas assis quelque part
                ET pas à la caméra du satellite
                ET (zone sombre OU face nuit)
```

Sept conditions, toutes nécessaires, et la dernière est un OU. Le portage
n'affichait pas cette invite du tout.

**Le texte, lui, n'est pas extractible.** `_flashlightPrompt` est un
`ScreenPrompt` sérialisé sur l'instance, et le portage ne sait pas lire ce
type-là : `composants.mjs` rend un objet vide pour tout le composant. La règle
vient du build, le mot est du portage, et c'est écrit à l'endroit où le mot est
choisi.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 299** vérifications (+19) |
| sur le build | 360 vérifications |
| en navigateur, avec le build | **155** contrôles (+3) |
| en navigateur, sans le build | 13 contrôles |

## Ce que trois pistes sur quatre-vingt-treize suggèrent

Les quatre premières lues — l'allumage, la guimauve, le mur, l'invite — ont
donné **quatre mécaniques absentes**. Ce n'est pas une base statistique, mais
c'est un signe : le recensement des classes disait 97,6 % et il avait raison ;
il mesurait seulement autre chose.

Une classe lue à moitié compte pour une classe lue. Un événement non nommé, lui,
pointe vers un morceau de comportement précis — deux lignes, sept conditions, un
collider qu'on allume — et se vérifie en une lecture d'IL.

> Les deux dénominateurs ne se remplacent pas : le premier dit **ce qui est
> installé**, le second **ce qui se passe**. Il fallait les deux, et il aura
> fallu épuiser le premier pour chercher le second.
