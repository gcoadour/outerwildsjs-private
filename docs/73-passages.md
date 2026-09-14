# Trois passages, deux coquilles, et un sol qui tourne sous les pieds

Suite de [`72`](72-poussiere.md) : six lois de plus, toutes écrites et
éprouvées, aucune appelée.

## Le réseau de Dark Bramble

Trois `DerelictWarp`, et ils forment un aller-retour :

| | rayon | ce qu'il fait |
|---|---|---|
| `DarkBrambleShortcut`, sur Timber Hearth | 50 | **un raccourci** vers Dark Bramble |
| `WarpVolume`, sur Dark Bramble | 60 | la porte de l'épave |
| `WarpVolume`, sur l'épave | 550 | **sur la SORTIE** |

Le troisième porte `_warpOnExit`. On ne quitte pas la dimension de l'épave en
entrant quelque part : on la quitte **en sortant de sa sphère**. Elle n'a pas de
porte, elle a un **bord**.

### Trois secondes, pas un instant

`_warpDuration` vaut 6 dans le constructeur, et `Update` déplace le corps à la
**moitié** :

```
u = clamp01((now − _initWarpTime) / _warpDuration)
si u ≥ 0,5 → WarpBody, et le composant s'éteint
```

Trois secondes après être entré, au milieu de l'éclair de brouillard que
`StartFogFlash` allume. **On ne disparaît pas au contact** : on s'enfonce, le
brouillard monte, et on est ailleurs. Une sortie, elle, est immédiate.

### La seconde d'après-arrivée

Les deux déclencheurs refusent d'agir tant que `Time.time <= _arrivalTime + 1`.
Sans cela, arriver **dans** le volume jumeau renverrait aussitôt d'où l'on
vient, sans fin. C'est une garde d'une ligne contre une boucle infinie, et elle
est dans les deux déclencheurs, pas dans un seul.

### Et on arrive en mouvement

```
vitesse = porteur.GetPointVelocity(arrivée) + normalize(vers le centre) × 10 × signe
```

Dix unités par seconde le long de l'axe qui va du point d'arrivée au centre du
passage — **vers** le centre en entrant dans l'épave, en s'en éloignant sinon.
On ne se matérialise pas immobile.

> **Deux arguments morts dans le build.** `WarpBody` calcule une rotation
> (`FromToRotation`) et une vitesse projetée, les passe à `ReceiveWarpedBody`…
> qui ne lit ni l'une ni l'autre. Le portage ne les reproduit donc pas, et le
> dit ici : c'est une mesure sur l'IL, pas un raccourci de portage.

## Entrer la tête dans l'océan le fait taire

Deux `AudioShell`, concentriques sur Giant's Deep — l'océan à 498 unités, la
membrane corrosive à 205.

```
OnTriggerEnter(tag == "PlayerCameraDetector") → _audioSource.FadeOut(1)
OnTriggerExit                                  → _audioSource.FadeIn(1)
```

C'est **l'oreille** qu'on guette, pas le corps : le tag est celui de la caméra.
Et la coquille étouffe la source posée sur le **même objet** (`GetComponent`),
pas les autres.

Ce que cela fait au jeu est contre-intuitif et juste : **entrer la tête dans
l'océan coupe le bruit de l'océan.** On l'entend du dessus, et plus une fois
dedans — où le son d'immersion prend le relais.

L'appariement se fait par **position** : la source commandée est à son centre
exact. C'est le seul lien que l'extraction conserve entre un composant et le
sien, et c'est le même choix que pour les dix visages de nuage
([`48`](48-ciel-mesure.md)).

## On part avec le sol

`MatchInitialMotion` est posé sur **vingt-sept** corps, `Player_Body` et
`Ship_Body` compris :

```
v = v_porteur + ω × (p − centre_du_porteur)
```

Cinq instances portent `_ignoreAngularVelocity` et n'en gardent que le premier
terme.

Le portage remettait la vitesse à **zéro** au réveil et à chaque boucle. Dans le
repère ancré, la vitesse du porteur est bien nulle — c'est lui l'ancre — mais le
terme tangentiel ne l'est pas : **l'ancre ne tourne pas avec la planète.**
Débarquer immobile sur un sol qui défile est précisément ce que cette classe
évite, et c'est le tout premier instant de la partie.

`AttachOnAwake` décide du porteur en posant une petite sphère et en regardant ce
qu'elle touche ; `attachTarget` pose la même question au système chargé.

## La zone morte temporelle, une troisième fois

Le calcul de la vitesse de départ appelait `vitesseDeDepart` depuis `boot()`.
Cette fonction lit `framePos`, qui est déclaré **avec la boucle**. Une erreur de
zone morte temporelle, et une erreur dans `boot()` ne laisse pas de page.

> Un `const` est déclaré avec ce qu'il décrit, pas avec ce qui le lit — et une
> fonction qui le lit a le droit d'être **écrite** avant, pas d'être **appelée**
> avant.

C'est la troisième fois dans ce dépôt. `--repli` l'a attrapée en une minute,
sans les 289 Mo : la quatrième fois que ce mode trouve ce que la compilation
laisse passer ([`59`](59-etat.md), [`62`](62-visee.md), [`68`](68-lois.md), ici)
— et le lot précédent avait justement noté qu'il ne pouvait pas tout voir
([`71`](71-quantique.md)). Les deux sont vrais : il ne couvre que ce qui tourne
sans le build, et ce qui tourne sans le build, il le couvre bien.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 557** vérifications (+33) |
| sur le build | 371 vérifications |
| en navigateur, avec le build | **225** contrôles (+13) |
| en navigateur, sans le build | 13 contrôles |
| lois sans appelant | **23 → 17** |

## La leçon

> Une garde d'une ligne contre une boucle infinie ne se devine pas. Elle se
> lit.

`_arrivalTime + 1` n'est ni une constante de gameplay ni un réglage : c'est la
trace d'un bug que quelqu'un a rencontré en 2015. Porter un jeu, c'est aussi
porter ses cicatrices.
