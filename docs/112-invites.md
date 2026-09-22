# La zone du bas n'arbitre rien, et trois classes qui se ferment à la lecture

`refait.mjs` ne dit pas seulement ce qui manque. Il dit aussi où le portage a
**appliqué une règle de plus** que le build — ce qu'aucun des trois autres
dénominateurs ne voit, puisque le code est écrit, appelé et testé.

## `PromptManager` : trois listes, deux arbitrages

```
AddScreenPrompt(prompt, position)
    position == 0 : _bottomPromptList.Add(prompt); prompt.SetAlignment(1);
    position == 2 : _leftPromptList.Add(prompt);   prompt.SetAlignment(0);
                    _highestLeftPriority = GetHighestPriority(_leftPromptList);
    position == 1 : _centerPromptList.Add(prompt); prompt.SetAlignment(1);
                    _highestCenterPriority = GetHighestPriority(_centerPromptList);
```

Trois listes, et **deux** priorités les plus hautes. Les champs de la classe le
disent sans ambiguïté :

```
_centerPromptList, _bottomPromptList, _leftPromptList,
_highestLeftPriority, _highestCenterPriority,
_biggestBottomPromptDimensions, _biggestLeftPromptDimensions, ...
```

Il n'existe **aucun** `_highestBottomPriority`. La zone du bas montre tout ce
qu'on lui donne.

Ce portage arbitrait les trois. C'est la zone des **codes de lancement** :
n'importe quelle invite de priorité supérieure pouvait les chasser de l'écran.

### Deux alignements, pas trois

`SetAlignment(1)` pour le bas et le centre, `SetAlignment(0)` pour la gauche :
la colonne de gauche est ferrée à gauche, les deux autres sont centrées. La
feuille de style le faisait déjà ; c'est maintenant écrit à côté de la loi.

### La largeur d'une colonne

`UpdatePromptDimensions` mesure la **plus large** invite du bas et de la gauche
(`CalculatePromptDimensions` parcourt la liste et garde le maximum en x). Une
colonne prend donc la largeur de son plus large élément, pas celle du texte
courant. Le centre n'en a pas besoin : il n'a qu'une invite à la fois, posée à
`_centerPromptScreenPosition`.

## Deux classes qui se ferment à la lecture

Toutes les méthodes manquantes ne sont pas du travail. Ces deux-là n'en sont
pas, et le dire est le résultat.

**`FieldInheritor`** — `AddInheritedFieldDetector`,
`RemoveInheritedFieldDetector` et `ClearInheritedFields` tiennent la liste et
l'abonnement à `OnDetectorUpdated`, dont le seul effet est de lever `_dirty`
— un cache. Ce portage recalcule la somme à chaque appel : même résultat, sans
le cache.

La loi, elle, méritait d'être notée : **les accélérations héritées
s'additionnent**, et c'est le contraire de la règle qui vaut partout ailleurs
dans ce jeu, où un détecteur retient le champ **dominant**
([`04`](04-gravite.md)).

**`PlayerState`** — quatre booléens statiques et leurs accesseurs.
`InShipProximity()` et `AtFlightConsole()` sont des lectures de champ que le
filtre de `refait.mjs` ne reconnaît pas, parce que le build les nomme **sans
préfixe** là où il écrit ailleurs `GetSecondsRemaining` ou `IsDay`. `Reset()`
les remet tous les quatre à faux, la mort comprise.

> Un compte qui écarte `Get*`, `Is*`, `Has*` et `Can*` écarte les accesseurs
> **qui se nomment**. Ceux qui ne se nomment pas restent dans la liste, et il
> faut les lire pour le savoir. C'est le prix d'un dénominateur qui compte des
> noms, et il est écrit dans `refait.mjs` depuis le premier jour.

## Gardé par

- `tests/09-jeu.mjs` — `maxPriority` : seules les invites de priorité maximale
  restent, plusieurs ex aequo restent ensemble, une liste vide ou absente ne
  casse rien.
- `tools/15_verify.py --profil` — dans la page, sur les trois zones et sur une
  copie de leur contenu : le centre et la gauche n'en gardent **qu'une**, le
  bas les garde **toutes les deux**.
