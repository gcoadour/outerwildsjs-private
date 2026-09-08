# Dark Bramble

Troisième mécanique spéciale portée. `web/src/bramble.js`.

## Ce que contient réellement cette alpha

C'est la découverte principale, et elle corrige une attente : **l'espace replié
de Dark Bramble n'existe pas dans cette version**. Il n'y a aucun volume de
distorsion dans la scène. Ce qui fait la réputation de ce lieu dans le jeu
final — des nœuds de brouillard qui se replient les uns dans les autres — n'est
pas implémenté.

Le conteneur s'appelle d'ailleurs `DarkBramble_TestBed` : c'est une zone
d'essai.

Ce qui existe, sur 95 objets scriptés :

| composant | nombre | rôle réel |
|---|---|---|
| `BrambleManager` | 10 | posé sur les ronces (`Thorns/pCylinder_on_curve`), il les fait **croître** au fil de la boucle |
| `AnglerfishController` | 4 | prédateurs |
| `NoiseSensor` | 4 | détection du bruit |
| `FogCloak` | 7 | masquage par le brouillard |
| `CorruptionAnimator` | 10 | animation de corruption, indexée sur la boucle |

`BrambleManager` n'est donc pas un gestionnaire de dimension mais un contrôleur
de croissance végétale.

## Les prédateurs

Constantes du build :

| paramètre | valeur |
|---|---|
| accélération | 2 |
| vitesse d'inspection | 15 |
| vitesse de poursuite | **42** |
| distance d'échappement | 300 |
| rayon d'habitat | 1200 |
| rayon de détection du bruit | 200 |

Le principe est déjà là : **le joueur n'est détecté que s'il fait du bruit**.
Rester immobile le rend invisible.

### Vérifié

| situation | état | vitesse |
|---|---|---|
| silencieux à 100 u | repos | 0 |
| **bruit** à 100 u | poursuit | 4,0 après 2 s *(accélération 2/s)* |
| silencieux, fuite à 250 u | inspecte | 5,0 |
| au-delà de 300 u | repos | — |

L'accélération bornée se vérifie directement : après deux secondes de
poursuite, la vitesse est à 4,0 et non à 42 — le prédateur monte en régime.

Croissance des ronces : 0, 5 puis 10 sur 10 aux quarts de boucle.

## Ce qui manque

- **L'espace replié**, qui n'est pas dans le build — ce n'est donc pas un
  manque du portage mais de l'alpha elle-même.
- **Le brouillard**, `FogCloak` et `FogLight` sont portés depuis (voir
  [`29-brouillards.md`](29-brouillards.md)).
- ~~**Le son comme signal**~~ — **porté** : `AudioField.emitters()` publie les
  sources qui jouent vraiment, et le `NoiseSensor` va vers la plus forte qu'il
  entend. On peut donc se trahir en laissant tourner une source, ou s'en servir
  de leurre ([`35-monde.md`](35-monde.md) §8).
- ~~**La mort par prédateur**~~ — **portée** : un prédateur qui atteint sa proie
  la mange (voir [`32-mort.md`](32-mort.md)). Le rayon de prise, 25 unités,
  n'est pas dans le build — il décrit la détection et la poursuite, pas la
  prise, qui passe par un volume de collision sur la bouche.

  Au passage, un défaut de fond : les prédateurs sont posés en coordonnées
  **monde**, et la position du joueur s'exprime dans le repère du corps ancré.
  La distance était donc fausse du décalage entre les deux — plusieurs milliers
  d'unités — et aucun prédateur ne pouvait se réveiller. Le portage convertit
  maintenant la position du joueur avant de la leur passer.
- ~~`CorruptionAnimator`~~ — **porté** : le seuil de découpe suit la fraction de
  boucle, sur les matériaux auxquels le répartiteur de shaders a déjà posé une
  découpe alpha.
