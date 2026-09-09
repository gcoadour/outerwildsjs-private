# Secteurs et niveau de détail

`web/src/sectors.js`. Le gain est pratique : sans découpage, les sept fichiers
glTF sont rendus en permanence — **33 Mo de géométrie**, dont 12 pour la seule
Timber Hearth.

## Les données

Sept `PlanetoidSector`, chacun avec son rayon d'horizon, sa limite de poussée et
sa portée d'éclairage ambiant :

| secteur | horizon | limite de poussée | portée d'ambiance |
|---|---|---|---|
| Giant's Deep | 500 | *(illimitée)* | 750 |
| Brittle Hollow | 250 | 20 | 350 |
| Timber Hearth | 200 | 20 | 250 |
| Jumelle 2 | 120 | 20 | 200 |
| Jumelle 1 | 75 | **200** | 0 |
| Comète, Lune | 75 | 20 | 0 |

La limite de poussée de 200 sur la première jumelle, contre 20 partout ailleurs,
est un réglage délibéré : c'est le seul endroit où le vaisseau garde sa pleine
puissance.

La scène contient aussi une hiérarchie de LOD (`LODGroup`, `LODLayer`,
`ChildColliderLOD` ×21, `CreateLODGroup` ×5, `LODBiasManager`). Les seuils des
`LODGroup` et l'effet des `ChildColliderLOD` sont portés depuis (voir « Ce qui
manque », plus bas).

## Le principe retenu

Chaque corps bascule entre sa **géométrie complète**, quand on est dans son
secteur, et sa **sphère de substitution** au-delà. C'est l'idée des `LODGroup`
du jeu, appliquée à l'échelle du corps plutôt qu'à celle du maillage.

Le seuil d'activation est fixé à huit fois le rayon d'horizon — de 600 u pour
les petits corps à 4 000 u pour Giant's Deep.

## Vérifié

| position | corps actifs | secteur | fichiers chargés |
|---|---|---|---|
| au sol sur Timber Hearth | **3 / 10** | Sector_TH | soleil + Timber Hearth |
| près de Brittle Hollow | **3 / 10** | Sector_BH | soleil + Brittle Hollow |
| espace lointain | 0 / 10 | — | aucun |

La limite de poussée du secteur courant est bien remontée (20 dans les deux
premiers cas).

## Le LOD par maillage

`web/src/lod.js`. Un `LODGroup` d'Unity se déclenche sur la **hauteur relative à
l'écran** de l'objet — c'est-à-dire, exactement, le rapport entre le rayon de sa
sphère englobante et sa distance à la caméra. Il n'y a donc rien à inventer :
on mesure ce rapport et on éteint ce qui tombe sous le seuil, fixé à 0,0022,
soit environ 1,6 pixel de haut sur 720 lignes.

Deux précautions comptent plus que le seuil :

- **le coût.** Parcourir 12 000 maillages à chaque image coûterait plus cher que
  ce qu'on économise. Le parcours est **tournant** : 400 maillages par image, le
  tour complet en quelques images.
- **les gros objets.** Une planète a un rapport énorme et ne disparaît jamais ;
  un caillou posé dessus, oui. Comme le seuil est un rapport et non une
  distance, les deux cas se traitent sans exception — sauf le vaisseau et les
  débris, épinglés parce qu'on les cherche des yeux.

## L'éviction

Le chargement à la demande (voir [`27-poids.md`](27-poids.md)) ne relâchait
jamais rien : traverser le système finissait par tout charger, et les 60 Mo du
démarrage redevenaient 200. Un corps quitté depuis **45 secondes** est
maintenant libéré — maillages, matériaux et textures — et se rechargera comme la
première fois si l'on revient.

Le délai compte autant que la distance : sans lui, franchir la limite dans un
sens puis dans l'autre déclencherait un cycle libération/téléchargement.

Trois lots ne sont jamais libérés : celui du corps ancré, celui qui porte les
colliders, et Brittle Hollow une fois sa croûte résolue — ses fragments
pointent vers des nœuds de ce lot.

## Les deux réglages de secteur, appliqués

- **`_thrustLimit`** borne la poussée du vaisseau : 20 partout, 200 sur la
  première jumelle, illimitée sur Giant's Deep.
- **`_ambientLightRange`** pilote l'intensité de la lumière d'ambiance, pleine
  au centre du secteur et éteinte au-delà de la portée. Un secteur à 0 — la
  première jumelle, la comète — n'a tout simplement pas d'ambiance : son ciel
  n'est éclairé que par l'étoile.

## Ce qui manque

- ~~**Le LOD ne fait que deux niveaux**~~ — **porté**, et le raisonnement était
  faux : un `LODGroup` ne simplifie rien à la volée, il désigne des maillages
  **déjà simplifiés, présents dans le build**. Il n'y avait donc rien à
  générer. `LODGroup` a été ajouté aux classes moteur lues, et l'export glTF
  pose sur chaque nœud le niveau auquel il appartient et les deux bornes entre
  lesquelles il est visible : un seul niveau affiché à la fois, et sous le
  dernier seuil le groupe entier disparaît. Le seuil unique de `lod.js` ne sert
  plus qu'aux maillages qui n'appartiennent à aucun groupe.
- ~~**Les 21 `ChildColliderLOD`**~~ — **portés dans leur effet** : les colliders
  ne sont plus posés que sur le niveau le plus fin. Les niveaux grossiers
  portent la même forme en moins détaillé ; leur poser un collider double le
  travail de Havok sans rien ajouter à la collision.
