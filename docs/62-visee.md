# Viser un référentiel — la cible se regarde, elle ne se choisit pas

[`61-commandes.md`](61-commandes.md) a rendu au portage les touches du jeu. Trois
d'entre elles ne pilotaient encore rien :

| canal | touche | ce qui manquait |
|---|---|---|
| `Lock On` | clic gauche | **viser** un référentiel |
| `Match Velocity` | espace | **s'accorder** à sa vitesse |
| `Autopilot` | `E` | **y aller** |

Le portage avait bien une cible et un pilote automatique — mais on ne pouvait
les désigner que dans la carte. Dans le jeu, **on vise ce qu'on regarde**.

## Comment le build choisit ce qu'on vise

`ReferenceFrameTracker.UpdateTargeting`, en deux temps :

1. un rayon de **mille** unités droit devant, sur le masque physique augmenté du
   calque `CloseRangeRFVolume`. Ce qu'il touche gagne — c'est ce qui permet de
   viser une lune en la regardant de près, même quand un plus gros volume
   l'englobe ;
2. à défaut, `Physics.RaycastAll` à **cent mille** unités sur le seul calque
   `ReferenceFrameVolume`, et parmi tous les touchés, **le plus petit angle**
   gagne. Pas le plus proche : le mieux centré.

Puis, sur l'appui :

```
si rien de visé, ou déjà cette cible  →  on relâche   (UntargetReferenceFrame)
sinon                                 →  on verrouille (TargetReferenceFrame)
```

La même touche pose et retire. Et `_bracketScale` — les crochets de visée —
se ferme à **dix par seconde**, se rouvre à la même vitesse, et **repart de 1**
au moment du verrouillage : chaque nouvelle cible rejoue l'animation.

> Le portage n'a pas de volumes de référentiel à percer d'un rayon : il a la
> liste des corps et leur rayon de surface. Le premier temps devient donc « le
> corps dont on perce la sphère à moins de mille », le second « le mieux
> centré ». **La règle du build est conservée, sa mise en œuvre non**, et
> `tracker.js` le dit à l'endroit où c'est écrit.

## S'accorder, et y aller

`PlayerJetpackController.Update` : `Match Velocity` demande **une cible, du
carburant, et le pilote automatique disponible**. C'est l'espace — la même
touche que le saut. Au sol on saute ; en vol, avec une cible, on s'accorde. Le
mode tranche, comme partout dans ce jeu d'entrées.

`Autopilot.InitFlyToDestination` **refuse** si l'on y est déjà :

```
si distance < distance d'arrivée du référentiel  →  OnAlreadyAtDestination, et rien
```

Le portage engageait toujours, et le pilote partait pour un voyage de zéro
unité. La distance d'arrivée, elle, est celle que le volume déclare — les mille
et deux mille cinq cents unités de [`46`](46-migration-lots.md).

## Deux bogues attrapés par le navigateur, encore

### Comparer par identité demande une identité stable

`LockOn` compare la cible visée à la cible tenue — comme le build compare deux
`ReferenceFrame`. Le portage reconstruisait la liste des corps visables **à
chaque image**, avec des objets tout neufs : `visé === courant` n'était donc
jamais vrai, et **re-viser la même cible ne la relâchait jamais**. La liste est
maintenant construite une fois et rafraîchie en place.

C'est un bogue qu'aucun test unitaire n'aurait vu : dans `tests/09-jeu.mjs` on
passe deux fois le même objet, et il se compare bien à lui-même. Il fallait la
boucle réelle pour que les deux objets divergent.

### La zone morte, une deuxième fois

`const visables` était déclaré près de son lecteur plutôt qu'avec les corps :
`Cannot access 'visables' before initialization`, exactement comme `impostures`
au lot précédent ([`60`](60-sonde.md)). Deux fois le même piège dans le même
fichier, en deux lots — et le même symptôme, une erreur au premier usage,
muette jusque-là.

> Dans un fichier de deux mille sept cents lignes, **un `const` se déclare avec
> ce qu'il décrit, pas avec ce qui le lit.** L'ordre du code n'est pas l'ordre
> de l'exécution ([`46`](46-migration-lots.md)) — cette leçon-là avait été
> écrite, et il a fallu la payer deux fois de plus pour qu'elle s'applique aux
> déclarations.

### Et un troisième, dans l'outil

`tools/15_verify.py` s'est mis à échouer avec un message impossible : « le
module ne fournit pas d'export nommé `LockOn` », alors que le fichier sur le
disque l'exporte. `http.server` n'envoie aucun `Cache-Control`, Chromium
applique donc sa mise en cache **heuristique**, et un profil persistant garde
les modules de la session précédente. Le mode `--repli`, qui repart d'un profil
vide, ne le voyait pas.

Le serveur du contrôle annonce désormais `no-store`. Un outil de vérification
qui teste la version d'avant ne vérifie rien.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 215** vérifications (+26) |
| sur le build | 343 vérifications |
| en navigateur, avec le build | **131** contrôles (+5) |
| en navigateur, sans le build | 13 contrôles |

Les cinq contrôles neufs du navigateur suivent le geste : un clic gauche vise,
la carte tient la même cible, les crochets se ferment, un second clic relâche,
les crochets se rouvrent. Les vingt-six autres gardent les nombres — dix par
seconde, mille et cent mille unités, le mieux centré qui l'emporte, le pilote
qui refuse une destination où l'on est déjà.
