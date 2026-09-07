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
`ChildColliderLOD` ×21, `CreateLODGroup` ×5, `LODBiasManager`), non portée.

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

## Ce qui manque

- **Le LOD par maillage.** La bascule est tout ou rien à l'échelle du corps ;
  le jeu réduit progressivement le détail des maillages.
- **Le chargement à la demande.** Les sept fichiers sont téléchargés au
  démarrage ; seul leur *rendu* est conditionnel. Un vrai découpage
  n'irait chercher un fichier qu'à l'approche de son secteur.
- **La limite de poussée n'est pas appliquée** au vaisseau, seulement remontée
  à l'affichage.
- **L'éclairage ambiant par secteur** (`_ambientLightRange`) n'est pas exploité.
