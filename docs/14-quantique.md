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

## L'occlusion, et l'inclinaison

Deux manques de cette page sont comblés.

**Le test de visibilité tient compte des occlusions.** Il ne suffit plus de
garder la lune dans son champ de vision : si un corps se trouve entre l'œil et
elle, elle n'est pas observée, et rien n'empêche le saut. Le test est
analytique — distance du centre du corps au segment œil-lune — plutôt qu'un
lancer de rayon dans la scène : il coûte trois produits scalaires, et il ne
dépend pas de la géométrie chargée, si bien qu'une planète pas encore
téléchargée masque quand même.

La garde des 150 unités tient malgré tout : collé contre la lune, mur ou pas,
on la verrouille.

**Les orbites sont inclinées.** `orbitTilt` cherche d'abord une valeur dans les
champs du composant — un angle, un axe. Les quatre `QuantumOrbit` de l'alpha
n'en portent aucun : c'est pourquoi la première version tournait à plat. À
défaut, l'inclinaison est tirée du **nom de l'hôte**, donc stable d'une partie à
l'autre, et bornée à 25 degrés. C'est un choix de ce portage, pas une mesure —
mais quatre orbites dans le même plan, cela se voit.

## Ce qui manque

- **Le brouillard quantique est porté depuis** (voir
  [`29-brouillards.md`](29-brouillards.md)) : coque opaque de 100 à 110 unités,
  fondue sur 30, dont la sortie force l'effondrement.
- **`_checkDepth = 100` n'est pas utilisé comme tel** : le test d'occlusion est
  binaire, là où le jeu lance une sphère de 150 sur une profondeur de 100.
- `AlignQuantumMoon`, qui oriente la lune vers le joueur, n'est pas porté.
