# Ce que « posé » veut dire — et une loi écrite qui n'avait jamais tourné

`Ship.padLanding` était écrite, commentée, éprouvée par un test — et **appelée
par personne**. C'est la cinquième fois que ce dépôt rencontre du travail fait
qui ne s'exécute pas ([`docs/68`](68-lois.md), [`docs/71`](71-quantique.md),
[`docs/75`](75-chaleur.md), [`docs/76`](76-proximite.md)), et cette fois-ci
`scripts/lois.mjs` ne pouvait pas le dire : il compte les **fonctions
exportées**, et celle-ci était une **méthode**.

Ce qui a rendu la chose visible, c'est [`docs/87`](87-atterrissage.md) : en
apprenant que `ReadRotationalInput` rend `Vector3.zero` dès que `IsLanded()`, il
a bien fallu aller voir ce que le portage appelait « posé ». Il appelait ça le
contact au sol, et le vrai `IsLanded` demande trois choses de plus.

## La loi, en entier

```
LandingPadManager.Update :
    isLanded = true ;  contact = null
    pour chaque capteur :
        body = capteur.GetContactBody()
        si body == null           -> isLanded = false ; on sort
        si contact == null        -> contact = body
        sinon si contact != body  -> isLanded = false ; on sort
    si contact != null :
        v = |shipBody.velocity - contact.GetPointVelocity(...)|
        si v > 5                  -> isLanded = false
    isLanded && !wasLanded  ->  ShipTouchdown
    !isLanded && wasLanded  ->  ShipTakeoff
```

Trois conditions, donc : **les trois jambes touchent**, **elles touchent le même
corps**, et **on ne va pas à plus de cinq unités**. Le portage n'avait que la
première, sous la forme « quelque chose est sous moi ».

La troisième compte plus qu'il n'y paraît depuis que « posé » coupe toute
rotation : sans elle, un vaisseau qui dérape sur une piste perdait ses commandes
au pire moment. Et `GetAllowLandingMode` exige `!IsLanded()` — un vaisseau
garé ne repasse pas en mode atterrissage.

Les deux annonces, elles, ne sont écoutées par personne dans l'assembly. C'est
justement ce qui les rend intéressantes à poser : le build les émet quand même,
et un portage qui les émet aussi pourra les brancher sans rien rouvrir.

## Pourquoi elle ne tournait pas, même appelée

Trois bugs en série, chacun invisible tant que personne n'appelait :

**1. Le mauvais point d'origine.** Les offsets des capteurs se calculaient depuis
le point d'**apparition** du vaisseau, pas depuis la position de repos de
`Ship_Body`. Résultat : des décalages de `(-3,65 ; -59,26 ; 171,12)` — cent
soixante et onze unités devant un vaisseau de six de rayon.

**2. La rotation manquante.** Corrigé le point d'origine, les offsets sortaient
en coordonnées **monde** : `(-5,17 ; -3,46 ; 3,74)`, où la hauteur est en Y et
l'avant en Z. Il fallait les ramener dans le repère du vaisseau par l'inverse de
sa pose de repos. Or l'extracteur ne posait `rotation` que sur les objets
`PLACED` : un `continue` la refusait à tout singleton, et `ShipBody` en est un.
Le champ manquait sans que rien ne le dise. Une fois posé, les offsets
deviennent `(-5,17 ; -3,74 ; -3,46)`, `(5,15 ; -3,74 ; -3,47)`,
`(0,03 ; -3,74 ; 5,29)` — **trois jambes, toutes à 3,74 sous la coque, deux
écartées à l'arrière et une à l'avant**. Cette fois, ça ressemble à un train
d'atterrissage.

**3. La portée du rayon.** Le build ne lance aucun rayon : ses capteurs sont des
sphères de 0,5 posées aux pieds de la **coque**, et c'est le sol qui entre
dedans. Ce portage n'a pas de coque — son vaisseau est une sphère de rayon 6,
posée centre en l'air — et ses jambes restent donc à 2,26 du sol quand il est
posé. Un rayon de 0,5 ne pouvait rien toucher.

## Ce qu'on ne peut pas tenir, et qu'on écrit

Le rayon a été allongé à la coque, et la loi tourne là où la géométrie répond.
Là où elle ne répond pas — le vaisseau reposant sur la sphère analytique, hors
des zones où le maillage est chargé — les trois rayons rendent `null`, et le
portage retombe sur son contact au sol **en gardant les deux conditions qui,
elles, sont mesurables partout** : un seul corps, et moins de cinq unités.

Ce n'est pas la loi du build. C'est ce qu'on peut en tenir sans coque, et c'est
écrit dans le code plutôt que masqué par un nombre ajusté jusqu'à ce qu'un
contrôle passe. La tentation était réelle : il aurait suffi d'allonger le rayon
jusqu'à ce que le vert arrive, et d'appeler ça une mesure.

## Deux notions, deux noms

| | ce que c'est | ce qui s'en sert |
|---|---|---|
| `landed` | on touche le sol, quel qu'il soit | l'allumage des moteurs |
| `onPad` | `IsLanded()` : trois jambes, un corps, moins de cinq | la rotation, le mode atterrissage |

Les confondre, c'était couper les commandes de rotation dès qu'on effleure une
colline. Les séparer ne coûte qu'un champ.

## Gardé par

- `tests/09-jeu.mjs` — les trois conditions séparément, la limite exacte à cinq,
  les deux annonces sur les **transitions** et pas sur l'état, et reprendre de la
  vitesse sans quitter le sol qui compte comme un décollage.
- `tools/15_verify.py --profil` — au démarrage le vaisseau est posé et
  `ShipTouchdown` est parti ; lancé à quarante unités il ne l'est plus, et
  `ShipTakeoff` part.
