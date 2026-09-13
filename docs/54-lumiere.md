# La lumière globale, et une troisième chose extraite que personne ne lisait

Quatre classes qui pilotent la lumière **de la scène entière**, deux coquilles
sonores — et, découvert en chemin, un extracteur de plus dont la sortie n'avait
jamais eu de lecteur.

## L'ambiance ne devrait pas sauter

`AmbientLightManager.Update` tient en deux gestes, et le portage n'avait ni
l'un ni l'autre.

**D'abord, il part du noir.** L'ambiance du secteur n'est prise qu'à **trois**
conditions réunies :

```
aucune zone sans soleil        (DarkZone)
un secteur majeur actif
la caméra active n'est pas celle de la CARTE
```

Le portage posait directement l'intensité du secteur. Entrer dans une grotte
n'assombrissait donc rien, et **ouvrir la carte gardait l'ambiance du lieu** —
alors que le build la coupe, pour que les orbites se lisent sur du noir.

**Ensuite, il y fond** : `Color.Lerp(courant, cible, deltaTime)`. Le facteur est
`deltaTime` lui-même, ce qui est une constante de temps d'une seconde : à
soixante images par seconde, on parcourt un soixantième du chemin restant par
image. C'est lent, et c'est ce qui fait qu'une grotte **s'assombrit** au lieu de
s'éteindre.

## La troisième fois

En branchant la première condition, il a fallu savoir où sont les zones sans
soleil. Elles sont extraites — `signalVolumes()` les rend depuis longtemps, avec
les brouilleurs — et **rien dans le moteur ne les lisait**.

C'est la troisième fois que ce dépôt rencontre ce cas exact :

| | découvert par |
|---|---|
| rotation propre, portées audio, lumières, fluides… | [`35-monde.md`](35-monde.md) |
| la pile d'effets d'image des caméras | [`47-effets-image.md`](47-effets-image.md) |
| les zones sombres et les brouilleurs | ici |

Le recensement de `scripts/recensement.mjs` a une colonne pour cela —
« extraites, non lues » — et elle compte encore 31 classes. Elle est plus utile
que la colonne « sans lecteur » : ce qu'elle nomme est du travail **déjà fait à
moitié**.

## Les phares du vaisseau ont une portée par défaut

```
min(limite du secteur, 600)   dans un secteur majeur
600                            partout ailleurs
```

Le portage lisait bien `_flashlightRangeLimit` ([`46`](46-migration-lots.md),
lot 4 : « phares du vaisseau limités à 100 dans la dimension abandonnée ») mais
n'avait pas la valeur par défaut. Hors secteur, ses phares gardaient donc la
portée du **dernier secteur traversé** — et l'on ressortait de la dimension
abandonnée avec des phares de 100.

Le secteur ne peut que **réduire** : un secteur qui déclarerait 5 000 ne
rallongerait rien.

## Une lumière qui fond repart d'où elle en est

`FadeLight.FadeIntensity(cible, durée)` retient l'intensité **courante** comme
point de départ, et non celle d'origine. Deux fondus qui se chevauchent partent
donc de là où l'on en était, sans à-coup. C'est une ligne de code et c'est tout
ce qui sépare un fondu propre d'un saut.

## Le jour et la nuit : ce sont les transitions qui manquaient

`DayNightTracker.Update` ne fait qu'une chose : comparer « fait-il jour ici » à
ce qu'il en était à l'image précédente, et annoncer le **lever** ou le
**coucher**.

Ce sont ces deux événements que les quinze `NightLight` écoutent
([`42-lumieres.md`](42-lumieres.md)). Le portage calculait le jour — il avait
l'intensité de nuit et le multiplicateur de jour — mais pas les **transitions**,
et une lumière de nuit ne savait donc pas *quand* fondre.

## Les coquilles sonores

Deux `AudioShell`. `OnTriggerEnter` teste le tag `PlayerCameraDetector` — c'est
l'**oreille** qu'on guette, pas le corps — et fait fondre sa source en une
seconde ; sortir la remonte. Une coquille est un endroit où l'on cesse
d'entendre quelque chose **en y passant la tête**.

`FadeInAudioOnAwake` n'a aucun champ et son `Start` tient en un appel : la
source monte au lieu de commencer à plein volume. Sans lui, le premier instant
de la partie claque.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : les trois conditions
de l'ambiance, prises séparément ; le fondu à un soixantième par image, qui ne
dépasse jamais sa cible, et la seconde de grotte qui assombrit sans éteindre ;
les six cents hors secteur, la limite qui réduit, et celle qui ne rallonge pas ;
le second fondu qui repart de la valeur courante ; le lever annoncé une fois et
pas deux ; le plein volume hors coquille, le silence dedans, et la moitié à
mi-fondu dans les deux sens.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : un
gestionnaire d'ambiance, deux phares extérieurs, une lumière à fondu, un suivi
du jour et de la nuit ; deux coquilles sonores, toutes deux avec une forme ; et
des zones de signal posées, dont des zones sombres.

## Le compte

| | [`53`](53-joueur.md) | ici |
|---|---|---|
| lues par le moteur | 147 | **153** |
| **sans aucun lecteur** | 36 (44 inst.) | **30** (36) |

## La leçon

> un modèle cohérent avec lui-même ne se dénonce pas ([`53`](53-joueur.md)) — et
> **« extrait » n'est pas « lu », trois fois de suite**.

La colonne « extraites, non lues » du recensement vaut qu'on la regarde avant
l'autre. Écrire un extracteur est la partie visible du travail ; s'en servir est
la partie qu'on oublie, parce qu'entre les deux il y a un commit, un jour, et
une page de documentation qui dit que c'est fait.
