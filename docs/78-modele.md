# Le vaisseau miniature vole, et l'enfant compte

Il y a un modèle réduit de vaisseau à l'observatoire de Timber Hearth, une
console pour le piloter, **trois** pistes d'atterrissage, et un enfant qui
regarde.

Le portage le laissait posé. Les six buses de ses propulseurs étaient extraites,
la loi de laquelle s'allume était écrite et éprouvée — et [`58`](58-suivi.md)
notait honnêtement que « la mécanique existe, sa liste d'entrées est vide ».
Elle n'était pas vide : **la console existe, et le mode d'entrée aussi**
([`70`](70-modes.md), huit canaux et rien d'autre).

## Le crash a un seuil

```
OnImpact(vitesse):  si |vitesse| <= 10 → RIEN
                    sinon → particules, son, explosion, CrashedModelShip
```

**Un contact doux n'est pas un crash.** C'est ce qui rend l'atterrissage
possible : on peut toucher le sol sans faire exploser le modèle, et tout
l'exercice tient dans cette marge.

L'explosion **hérite de la vitesse** du vaisseau : les débris partent dans la
direction où il allait.

## L'atterrissage demande d'être immobile

```
|v relative à la planète| < 0,1   u/s
|ω relative|              < 0,01  rad/s
et cela pendant 0,2 s, à l'intérieur d'une piste
```

Le second seuil est **cent fois plus serré** que le premier, et c'est ce qui
rend l'exercice difficile : un modèle qui tourne lentement sur lui-même est
« posé » pour l'œil et ne compte pas. **La rotation doit s'arrêter.**

> Et la vitesse est relative à la **planète**, pas au monde. Sur un sol qui
> tourne, être immobile dans le monde, c'est déraper.

### Une fois posé, on ne peut plus rater

`FixedUpdate` ne re-teste pas les seuils une fois `_isLanded` posé : seul
`OnTriggerExit` — **quitter la piste** — l'annule. Repartir dans les deux
dixièmes de seconde compte donc quand même comme un atterrissage, à condition de
rester au-dessus de la piste.

Ce n'est pas de la générosité, c'est ce qui évite qu'un rebond d'une image
annule un atterrissage réussi.

## L'enfant compte, et l'ordre surprend

```
OnStartConversation:
    crashs == 0 ET atterrissages == 0  →  l'introduction
    crashs >= 5                        →  « trop de crashs », puis remise à zéro
    atterrissages > 0                  →  « bel atterrissage », puis remise à zéro
    sinon                              →  l'arbre COURANT reste
```

**Les crashs passent avant les réussites.** Se planter cinq fois puis réussir une
fois vous vaut le reproche, pas le compliment — et la réussite attend la
conversation suivante.

**Entre un et quatre crashs sans atterrissage, aucune branche ne s'applique** :
l'enfant redit ce qu'il a dit la dernière fois. Ce n'est pas un oubli du build,
c'est ce qui fait qu'il ne commente pas chaque bosse.

> **Et il se représente après chaque réussite reconnue.** Une fois le compliment
> dit, les deux compteurs sont à zéro — donc la première branche s'applique à
> nouveau, et il refait les présentations. L'invariant garde cela tel quel : une
> mesure, et non ce qu'on en penserait.

## Ce que ce portage n'a pas

La poussée du modèle réduit est celle du **vrai** vaisseau, à 40 % : le build
n'en pose aucune sur `ModelShip_Body`, et ce facteur est du portage. Il est
écrit à l'endroit où il est choisi.

Le modèle n'a pas non plus de collider à lui : il se pose sur la **surface du
corps dominant**, et c'est l'arrivée à cette surface qui donne la vitesse
d'impact — la seule chose dont le seuil de crash a besoin.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 664** vérifications (+32) |
| sur le build | **395** vérifications (+7) |
| en navigateur, avec le build | **250** contrôles (+7) |
| en navigateur, sans le build | 13 contrôles |
| annonces nommées | 32 → **34** |

## La leçon

> « Sa liste d'entrées est vide » est une mesure. Elle se refait.

[`58`](58-suivi.md) avait raison **au moment où il l'écrivait** : rien ne
pilotait le modèle réduit. Neuf lots plus tard, la console existe
([`70`](70-modes.md)), son mode d'entrée aussi, et la phrase était devenue
fausse sans que rien ne bouge dans le fichier qui la portait.

C'est le risque des justifications : elles vieillissent en silence. Celle-ci
tenait dans un commentaire, et rien ne la relisait.
