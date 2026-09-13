# Ce que le joueur porte en plus de son corps

Quatre classes de [`44`](44-reste-a-migrer.md) §7 restées sans lecteur, et trois
d'entre elles portent un **nombre** que le portage avait remplacé par une
invention. La quatrième porte une **mort** qu'il n'avait pas du tout.

## On vise à dix unités, pas à trois

`FirstPersonManipulator.LateUpdate` tient en deux lignes : un rayon de **dix
unités** depuis la caméra, et `Observe` sur l'`InteractReceiver` touché.

Le portage exigeait d'être à la portée du **récepteur** — deux ou trois unités.
Ce sont deux choses différentes :

> le volume du récepteur dit la **taille de la cible** ; le rayon dit de combien
> **loin** on peut la viser.

Un interrupteur d'une unité de rayon reste visable de dix unités ; il est
simplement plus petit à l'écran. Le portage forçait à venir le toucher.

## Le bruit est proportionnel, et lancer une sonde s'entend

```
bruit = fractionDePoussée × 5
      + (1 − clamp01((t − instantDeLancement) / 1)) × 5
```

Deux termes, deux natures. Le premier est **continu** : pousser doucement fait
moins de bruit que pousser à fond. Le second est un **coup** : lancer une sonde
fait cinq d'un seul trait, qui retombe en une seconde.

Le portage rendait un booléen — 1 en poussant, 0,7 sinon — et n'avait pas du
tout le coup de la sonde. **On pouvait lancer une sonde au nez d'un prédateur de
Dark Bramble sans qu'il l'entende.** C'est le genre d'écart qu'on ne voit pas en
lisant le code du portage, parce que son modèle est cohérent avec lui-même.

## La mort par écrasement, et où elle se trouve

`PlayerCompressionSensor` est un **déclencheur posé sur le joueur lui-même**
(`collider.isTrigger = true`, couche « Primitive »). Il compte les colliders
**solides** qui le chevauchent — normalement zéro : on se tient *sur* les
choses, on ne les traverse pas.

Quand un solide commence à vous chevaucher, une horloge part. Si cela dure plus
de **cinq pas de physique** — un dixième de seconde — et qu'on n'est pas attaché
à un point, on meurt, `DeathType` par défaut, et le build l'annonce en clair :

```
print("Death by compression :(")
```

Cinq **pas**, pas cinq secondes. Ce n'est pas une usure, c'est un broyage.

### La seule surface qui écrase

`Surface._allowCompression` est posé **une seule fois dans toute la scène** :

```
SolarSystemRoot / HourglassTwins_Pivot / FocalBody / Twin01_Body
  / RisingSand / Collider        _allowCompression = true
```

C'est le **sable montant** des jumelles. La mort par écrasement du build est
celle-là, et pas une autre : le sable vous passe dessus parce qu'un plafond vous
retient. `DrainingSand`, celui qui se vide, ne porte rien.

Le portage a le sable depuis [`45`](45-recensement-mesure.md) et n'avait pas
cette mort. Elle est maintenant branchée sur la seule situation qui la produit :
être **sous** la surface du sable. Hors d'un coincement, sa montée vous
repousse — y être signifie qu'on n'a pas pu monter avec lui.

### Une erreur d'échelle, et comment elle s'est vue

Le collider fait **0,5 en local**, sur un objet à l'échelle **60** : trente
unités de rayon monde. `volumeOf()` rend ces trente-là, déjà mis à l'échelle.

Mon premier calcul multipliait ce trente par l'échelle courante — soit 1 800 au
départ, et la sphère avalait toute la planète dès la première image. Le bon
calcul est une **proportion** :

```
rayon = rayonAuteur × échelleCourante / échelleAuteur
      = 30 × (60 → 290) / 60
      = 30 → 145
```

Ce qui l'a montré n'est pas une relecture du code : c'est d'avoir écrit
l'invariant *« au départ, le sable n'avale pas à quarante unités »* et de l'avoir
vu échouer. Un nombre faux d'un facteur soixante reste un nombre.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : la portée de dix ;
le bruit nul au repos, proportionnel à mi-poussée, le coup du lancement et sa
retombée en une seconde, et les deux termes qui s'ajoutent ; cinq pas qui ne
suffisent pas et le sixième qui tue, l'attache qui protège, la sortie qui remet
le compte à zéro ; le sable qui monte qui écrase et celui qui se vide qui
n'écrase pas ; le rayon à trente au départ et cent quarante-cinq à la
dix-septième minute, avec les trois distances qui l'encadrent ; les quatre
drapeaux de l'état et la mort qui ne se défait pas seule.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : **une seule**
surface déclarée, elle écrase, elle est sur une jumelle, son rayon est de
trente ; le rattachement qui désigne `RisingSand` et non `DrainingSand` ; un
capteur de compression, un bruiteur, un état, un manipulateur.

## Le compte

| | [`52`](52-casque.md) | ici |
|---|---|---|
| lues par le moteur | 142 | **147** |
| **sans aucun lecteur** | 41 (49 inst.) | **36** (44) |

## La leçon

> un zéro calculé ressemble à un zéro mesuré ([`51`](51-tour.md)) — et **un
> modèle cohérent avec lui-même ne se dénonce pas**.

Le bruit du portage — un booléen à 1 ou 0,7 — était parfaitement raisonnable. Il
se lisait bien, il se testait bien, et il donnait des prédateurs qui réagissent.
Rien, dans le portage seul, ne pouvait dire qu'il manquait le coup de la sonde :
il aurait fallu se demander *ce que le build fait*, et non *si ce qu'on fait
marche*.

C'est la différence entre un portage qui fonctionne et un portage qui est le
même jeu, et elle ne se voit qu'en lisant l'autre côté.
