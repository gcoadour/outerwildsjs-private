# Systèmes de particules

`tools/11_particles.py` exporte **135 systèmes** et **15 textures**.
`web/src/particles.js` les rend avec le système de particules de Babylon.

## La structure Unity est entièrement lisible

Un `ParticleSystem` Unity est une structure à modules, et UnityPy les expose
tous sur Unity 4 — les 135 systèmes se lisent sans une seule erreur :

| module | ce qu'on en tire |
|---|---|
| `InitialModule` | durée de vie, vitesse, taille, couleur, capacité, gravité |
| `EmissionModule` | taux d'émission |
| `ShapeModule` | forme, rayon, angle, direction aléatoire |

Les valeurs sont des `MinMaxCurve` : on ne retient que le scalaire, ce qui
suffit pour les courbes constantes — la grande majorité ici.

Formes rencontrées : 61 cônes, 31 boîtes, 26 sphères, 9 coques sphériques,
6 volumes coniques, 1 maillage, 1 demi-coque.

## Le mode de fusion ne se devine pas

J'avais d'abord forcé le mode **additif** partout, en supposant que les
particules d'un jeu spatial sont toutes lumineuses. Résultat : le ciel saturé
d'un voile rose.

La vérité est dans le nom du shader du matériau, comme pour la transparence des
matériaux ordinaires :

| fusion | systèmes |
|---|---|
| additive | 110 |
| alpha | 25 |

**Un système sur cinq** n'était pas additif. C'est le genre d'hypothèse qui
paraît raisonnable et qui est fausse pour une fraction suffisante du contenu
pour se voir à l'écran.

## Instanciation à la volée, avec budget

Comme pour l'audio, on n'instancie que ce qui est à portée. Deux différences :

- le rayon d'influence est estimé à partir de la géométrie du système —
  `rayon d'émission + vitesse × durée de vie + taille` ;
- un **budget de 14 systèmes simultanés** est appliqué, les plus proches
  d'abord, et la capacité de chacun est plafonnée à 600 particules.

Mesuré au sol sur Timber Hearth : **3 à 4 systèmes vivants, ~350 particules
actives, 0 échec**, en parallèle de l'audio et des 350 colliders.

## Les modules secondaires

Un `ParticleSystem` Unity 4 empile vingt-trois modules. Plutôt que de tous les
porter, on a **mesuré lesquels servent** — la même méthode que pour les shaders,
et elle donne le même genre de réponse :

| module | actif sur 135 systèmes |
|---|---|
| `ColorModule` (couleur au fil de la vie) | **110** |
| `SizeModule` (taille au fil de la vie) | **80** |
| `RotationModule` | **28** |
| `UVModule` (planches de sprites) | **13** |
| `VelocityModule`, `ClampVelocityModule`, `RotationBySpeedModule` | 1 chacun |
| `SubModule` | 2 |
| `ForceModule`, `CollisionModule`, `ColorBySpeedModule`, `SizeBySpeedModule`, `InheritVelocityModule`, `ExternalForcesModule` | **0** |

Six modules ne servent nulle part. Quatre portent tout le reste, et ce sont
exactement ceux que Babylon sait reproduire nativement : `addColorGradient`,
`addSizeGradient`, la vitesse angulaire, et l'animation de planche de sprites.

Les quatre sont portés. Le feu de camp, par exemple, ne passe plus d'orange à
transparent mais suit son vrai dégradé : vert, puis magenta, puis rouge en
s'éteignant, avec une bosse de taille au milieu de la vie.

Deux détails valent d'être notés :

- `GradientNEW` range **huit clés de couleur et huit clés d'alpha avec des temps
  indépendants**, sur 16 bits. Prendre les unes pour les autres décale les
  fondus de sortie ; l'extracteur prend l'union des temps et interpole ce qui
  manque.
- La taille de case d'une planche de sprites vient de l'**extracteur**, pas de
  `texture.getSize()` : la texture n'est pas forcément chargée quand on crée le
  système, et une taille nulle donnerait des cases d'un pixel.

Vérifié dans le navigateur : 5 des 6 systèmes vivants au sol portent un dégradé
de couleur et une courbe de taille, et une planche 9 × 9 se découpe bien en
cases de 28 pixels sur ses 81 images.

## Ce qui reste approximatif

- **Les courbes de vitesse sont aplaties** à leur scalaire ; seules la couleur
  et la taille sont transportées comme courbes.
- **Le nombre de passages d'une planche de sprites** (`cycles`) ne se traduit
  qu'approximativement : Babylon exprime une cadence, Unity un nombre de
  passages sur la durée de vie. Le cas `cycles = 1` est exact.
- **Les six modules jamais utilisés** ne sont pas portés, délibérément.
- **`gravityModifier` n'est pas appliqué.** Il faudrait le brancher sur le champ
  dominant, comme pour le joueur.
- **L'équilibrage visuel n'est pas vérifié.** Les tailles vont jusqu'à 140
  unités ; savoir si le rendu est fidèle demande un œil humain, au même titre
  que l'équilibrage des volumes audio.

## Un correctif de fond au passage

L'export a d'abord échoué sur `ValueError: Out of range float values are not
JSON compliant: inf` — la même cause que sur `solar_system.json` plus tôt. Le
filtre existait, en copie locale dans un seul outil. Il est désormais dans
`lib_ow.py` (`finite()`) et partagé par les cinq extracteurs, qui écrivent tous
avec `allow_nan=False`.
