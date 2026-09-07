# Orbites et référentiels

## Ce qui était faux dans mes premières notes

J'avais écrit que les orbites étaient imposées par la rotation des objets
`*_Pivot`, et donc non simulées. **C'est faux.** Ces pivots ne portent qu'un
`DisposableContainer` — un simple regroupement pour le nettoyage — et aucune
rotation. Aucun `RotateTransform` n'est attaché à un pivot d'orbite.

Le vrai mécanisme est un composant `InitialMotion` (14 instances) posé sur
chaque corps : il donne au démarrage une vitesse au rigidbody, qui suit ensuite
le champ de son primaire. Les orbites sont **réellement simulées**.

## La hiérarchie réelle

| corps | primaire | rayon | période |
|---|---|---|---|
| Timber Hearth | Soleil | 8 593 | 4,2 min |
| Brittle Hollow | Soleil | 11 691 | 6,6 min |
| Giant's Deep | Soleil | 16 458 | 11,1 min |
| Comète | Soleil | 24 000 | ellipse |
| Lune (Attlerock) | Timber Hearth | 541 | 1,0 min |
| Lune volcanique | Brittle Hollow | 870 | 1,4 min |
| Jumelles | *(l'une l'autre)* | — | vitesse linéaire 31,65 |

## Deux régimes, deux traitements

La vitesse initiale vaut `√(a(r)·r)` perpendiculairement au rayon, multipliée
par `_orbitImpulseScalar`.

**Scalaire = 1 → orbite circulaire exacte.** Résolue analytiquement : la phase
avance de `ω·dt`, sans intégrateur. Mesuré sur 20 minutes simulées à 60 Hz :
**0,00 % de dérive** sur les cinq corps concernés. Une intégration numérique
aurait dérivé pour rien.

**Scalaire ≠ 1 → ellipse, intégrée.** Un seul corps : la comète, à **−0,425**.
Le signe négatif la rend rétrograde, le module inférieur à 1 la met sous la
vitesse circulaire — donc une ellipse très excentrique. C'est un réglage
délibéré des auteurs, et il est fin : sur 90 minutes simulées, périapse à
**2 383** pour un rayon solaire de **2 000**. La comète rase le Soleil sans
jamais le toucher, avec une excentricité de 0,82.

## Les référentiels

Le monde est exprimé dans le repère du **corps dominant**. Ce corps est
immobile par définition dans son propre repère ; tout le reste bouge autour.
C'est le concept de l'original, et c'est aussi ce qui rend la physique
possible : les colliders statiques du corps ancré ne bougent jamais, alors que
le Soleil et les planètes défilent dans le ciel.

Vérifié dans le navigateur sur 8 secondes, le joueur étant au sol sur Timber
Hearth : Soleil **+1 196 u**, Brittle Hollow **+1 535 u**, comète **+1 169 u**,
lune **+300 u** — pendant que le joueur reste à altitude −1, vitesse 0, et que
ses 400 colliders restent valides.

Les colliders sont restreints au **sous-arbre du corps ancré**, pas au fichier
glTF entier : un fichier de pivot contient aussi les lunes, qui elles se
déplacent et rendraient leurs colliders faux.

### Approximation assumée

Le repère du corps ancré est en rotation et en accélération : les forces de
Coriolis et centrifuge sont ignorées. Aux vitesses angulaires en jeu (période
de 4 à 11 minutes) l'effet est imperceptible à l'échelle du joueur.

## Trois bugs de repère, tous de la même famille

Le passage aux référentiels a produit trois erreurs successives, toutes du même
type : appliquer un décalage à une valeur qui l'incluait déjà.

1. **Position d'apparition** calculée en coordonnées monde avant le changement
   de repère : le joueur naissait à 8 593 unités de la planète, et tombait vers
   Giant's Deep.
2. **Lecture de la position physique** : `origin.offset` était ajouté à la
   position du corps Havok, qui est déjà dans le repère. Le joueur traversait
   le terrain.
3. **Création du corps physique** via `origin.toRender`, qui soustrayait encore
   le décalage : le corps naissait exactement à la position du Soleil.

La règle qui s'en dégage : une fois le repère du corps ancré adopté, il est le
seul repère de travail. `origin.offset` ne sert plus qu'à **une** chose, placer
le contenu des glTF, et nulle part ailleurs.
