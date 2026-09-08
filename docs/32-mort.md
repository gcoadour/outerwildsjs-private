# Mourir, et la fin des temps

`web/src/death.js` et `web/src/supernova.js`.

Jusqu'ici, mourir se réduisait à deux chemins codés à côté l'un de l'autre :
l'asphyxie mettait un drapeau sur les ressources, la supernova en mettait un
autre sur la boucle, et un `setTimeout` de 2,5 s posé dans la boucle de rendu
faisait réapparaître le joueur. Rien de tout cela ne ressemblait à ce que le
jeu fait d'une mort.

## Une seule porte d'entrée

`PlayerDeathHandler` reçoit une cause, la retient, joue la séquence, et rend la
main quand elle est finie. **La première cause l'emporte** : mourir asphyxié
pendant que l'onde de choc arrive reste une seule mort, avec une seule cause
affichée.

| cause | ce qui la déclenche | d'où elle vient |
|---|---|---|
| asphyxie | oxygène à zéro, puis santé à zéro | `PlayerResources` |
| impact | vitesse de chute au-delà de `_maxImpactSpeed` | `PlayerResources` (20 / 40 u/s) |
| supernova | l'onde de choc rattrape le joueur | `SunSphereOfDeathBehavior` |
| dévoré | un prédateur de Dark Bramble atteint sa proie | `AnglerfishController` |
| incinération | entrer dans l'étoile | rayon de surface du corps |

Deux d'entre elles n'étaient pas des manques d'écriture mais des branchements
absents : `Resources.applyImpact` portait déjà les seuils du build **sans que
rien ne l'appelle jamais**, et les prédateurs poursuivaient sans jamais
attraper.

Ce que ce tableau n'est pas : une recopie de `DeathType`. Cette énumération vit
dans l'assembly, pas dans les assets, et je ne l'ai pas lue ici. Les cinq causes
ci-dessus sont celles que **ce portage sait produire**, chacune reliée à un
mécanisme qui existe vraiment dans le build.

## Le flashback, quatre constantes et rien d'autre

`Flashback` porte quatre valeurs, et elles suffisent à tout :

| constante | valeur |
|---|---|
| délai avant les images | 2 s |
| durée de la première image | 0,6 s |
| facteur d'une image à la suivante | 0,9 |
| plancher | 0,06 s |
| fondu au blanc | 0,8 s |

Le **nombre d'images n'est pas une cinquième constante** : il en découle.
0,6 × 0,9ⁿ reste au-dessus de 0,06 pour n allant de 0 à 21, soit **22 images** et
5,41 s. Avec l'attente et le fondu, la séquence dure **8,21 s** — c'est le temps
qu'il faut pour qu'une mort soit une mort, et non un clignotement.

Ce que le portage ne peut pas donner : les images elles-mêmes. Le build ne
contient aucune mémoire à rejouer. Ce module en donne le **rythme**, et l'écran
bat à ce rythme, de plus en plus vite, avant de blanchir. C'est une mise en
scène, et elle est écrite comme telle.

Vérifié dans un vrai navigateur : la séquence traverse ses quatre phases —
attente, images, fondu, fini — et la boucle repart au bout, compteur incrémenté.

## `GetPreventSupernova`

La boucle sait maintenant retenir la fin des temps : le compte à rebours
continue, l'étoile n'explose pas. C'est un point d'entrée du jeu, pas une
commodité de débogage — il existe pour qu'une scène puisse se jouer jusqu'au
bout.

## Le spectacle

Le build nomme quatre comportements pour la fin des temps, et leur ordre dit
déjà l'essentiel :

| comportement | ce qu'il fait |
|---|---|
| `SunSurfaceProgressionBehavior` | la surface se dégrade au fil de la boucle |
| `SunCoronaProgressBehavior` | la couronne suit la même progression |
| `ShrinkSunBehavior` | l'étoile **se contracte** avant d'exploser |
| `SunExplosionBehavior` | puis l'explosion, et son onde |

La contraction est le détail qu'on n'aurait pas deviné : l'étoile ne gonfle pas
jusqu'à éclater, elle s'effondre d'abord. `SunStage` rend les quatre étapes
d'une seule courbe, parce qu'elles partagent la même horloge.

Ce qui vient du build : les quatre étapes, leur ordre, et l'onde à **2 000 u/s**.
Ce qui n'en vient pas : les durées et les échelles, qui vivent dans des
composants d'animation non lus. Elles sont rassemblées dans `SUN_SHOW`, en
clair, pour qu'on ne les prenne pas pour des mesures.

| instant | échelle de l'étoile |
|---|---|
| début de boucle | 1,00 |
| 90 % de la boucle | 1,32 |
| **creux de la contraction** | **0,62** |
| onde à 20 000 u | 10,62 |
| bornée à | 40 |

La couronne et la coque d'onde de choc ne sont montées qu'au moment où elles
servent : tant que la boucle n'approche pas de sa fin, ces objets n'existent
pas.

## Ce qui manque encore

- **Les images du flashback**, qui ne sont pas dans le build.
- **Le rendu de l'explosion** reste une couronne additive et une coque en fil de
  fer. Les shaders de la supernova ne sont pas portés.
- **`PlayerDeathHandler` du jeu** fait plus que ce qui est ici : il joue un son
  par cause et pilote la caméra pendant la séquence. Les commandes, elles, sont
  bien coupées — un mort ne marche plus pendant son propre flashback.
