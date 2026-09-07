# Lune quantique

La première des mécaniques spéciales portées. `web/src/quantum.js`.

## Les données

| constante | valeur | effet |
|---|---|---|
| `_maxQuantumLockRange` | 2000 | au-delà, l'observation ne verrouille plus |
| `_minQuantumLockRange` | 150 | en deçà, verrouillée quoi qu'il arrive |
| `_sphereCheckRadius` | 150 | rayon du test de visibilité |
| `_isLightSensitive` | **false** | la lumière n'intervient pas dans cette alpha |

Quatre composants `QuantumOrbit` sont posés sur quatre corps hôtes, chacun avec
son rayon :

| hôte | rayon d'orbite |
|---|---|
| Twin01 | 1700 |
| Giant's Deep | 1500 |
| Brittle Hollow | 1400 |
| Timber Hearth | 1100 |

La lune se trouve autour de l'un d'eux et change d'hôte dès qu'on cesse de la
regarder. Ce n'est donc pas un déplacement local : elle **change de planète**.

Le `_isLightSensitive = false` mérite d'être noté — dans le jeu final,
photographier la lune ou l'éclairer la verrouille. Cette alpha ne connaît que
l'observation directe.

## Les trois comportements, vérifiés

| situation | distance | résultat |
|---|---|---|
| on la regarde | 800 u | verrouillée, aucun saut |
| on détourne le regard | 800 u | **saut** : Brittle Hollow → Giant's Deep |
| dos tourné, collé contre elle | 50 u | verrouillée quand même |

Le dernier cas est le plus intéressant : la portée minimale de 150 u empêche de
tricher en se collant à la lune les yeux fermés. C'est une garde délibérée des
auteurs, pas un effet de bord.

Après le saut, la distance à l'observateur passe de 800 à 17 601 unités — la
mesure la plus parlante du fait que la lune a bien changé de système.

## Ce qui manque

- **Pas de brouillard quantique.** `QuantumFogBoundary` (rayons 100 et 110,
  zone de fondu 30) n'est pas porté : on voit la lune de loin sans le voile qui
  la masque dans le jeu.
- **Le test de visibilité est angulaire**, fondé sur le champ de vision. Le jeu
  utilise un test de sphère avec profondeur (`_checkDepth = 100`), qui tient
  compte des occlusions : une lune cachée derrière une planète compte comme non
  observée. Ici elle compterait comme vue.
- **L'orbite est plane.** La lune tourne dans le plan horizontal de son hôte,
  sans inclinaison.
- `AlignQuantumMoon`, qui oriente la lune vers le joueur, n'est pas porté.
