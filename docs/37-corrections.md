# L'audit mis en œuvre : marche, inertie, courants

[`36-audit.md`](36-audit.md) a mesuré le portage sur le build et en a tiré neuf
actions correctives. Cette page dit ce qu'elles ont donné : ce qui a été
implémenté, les décisions qu'il a fallu prendre quand la mesure ne tranchait
pas, et **deux erreurs découvertes en chemin** — dont une dans le code écrit
pour cette série même.

> **Portée.** Tout ce qui suit est de la logique pure, éprouvée par
> `tests/09-jeu.mjs` sans le build (404 vérifications, contre 282 avant). Ce
> qui demande le build est gardé dans `tests/05-extract.mjs`, qui s'annonce
> ignoré sans `OW_BUILD` — les chiffres de l'audit y sont désormais des
> invariants, pas des phrases.

## 1. Le joueur marche

C'était le premier écart de l'audit, et le plus lourd : **le portage n'avait
pas de marche**. On se déplaçait au sol comme dans le vide, à la poussée, sans
vitesse maximale, sans accélération, sans saut — alors que
`PlayerCharacterController` était extrait, chargé, rangé dans `this.c`, et
jamais lu.

`player.js` sépare maintenant deux régimes :

| au sol | en vol |
|---|---|
| `v_cible` = `_groundSpeed` 7 en avant, `_strafeSpeed` 5 de côté | `_maxTranslationalThrust` 7 loin de toute surface |
| `v` approche `v_cible` à `_groundAcceleration` | `_surfaceVerticalThrust` 12 et `_surfaceLateralThrust` 5 près d'une surface |
| saut à `_jumpSpeed` 6, sur **front** de touche | la même touche tenue allume le sac dorsal |
| appui : sphère `0,46` lancée sur `0,6`, pente sous **45°** | — |

Trois conséquences de détail, toutes voulues par l'audit :

- **le multiplicateur « boost » disparaît.** ×3 sur le joueur, ×2 sur le
  vaisseau, aucune source dans le build. La touche reste lue, mais elle ne
  multiplie plus rien : elle sert au bruit qu'on fait, ce qui est un choix
  assumé de ce portage et non une lecture du jeu ;
- **le carburant ne brûle plus en marchant.** `thrusting` valait vrai dès
  qu'une touche de déplacement était tenue ; seul le sac dorsal consomme ;
- **la visée suit `_turnRate`.** Le facteur maison `0,0022` par pixel est
  remplacé par 160°/s rapportés à la largeur de l'écran — la sensibilité ne
  dépend donc plus de la définition — et `_telescopeTurnScalar` (0,5) ralentit
  enfin de moitié à la lunette.

### Le piège : `_groundAcceleration` vaut 0,5 par quoi ?

L'audit écrit `v += (v_cible − v) · groundAcceleration · dt`. Pris à la lettre,
avec 0,5, atteindre 99 % de `_groundSpeed` demande **9,2 secondes**. Ce n'est
pas de la marche, c'est un tapis roulant — et il suffit de l'écrire pour voir
que la lecture ne peut pas être celle-là.

Unity donne la réponse : un contrôleur de personnage applique son
`AddLocalVelocityChange` dans `FixedUpdate`, à 50 Hz. `_groundAcceleration` est
une **fraction de l'écart rattrapée par pas fixe**, pas par seconde. La forme
retenue, `1 − (1 − a)^(dt/0,02)`, redonne exactement le comportement d'Unity à
50 Hz, reste indépendante de la fréquence d'images (le principe du §2.5 de
l'audit), et met le joueur à sa vitesse de marche en **deux dixièmes de
seconde**. La vitesse de régime, elle, vaut toujours `_groundSpeed` : c'est
l'invariant que l'audit demandait, et il est gardé.

Le frottement au sol (`vel *= 0,86`) a disparu du même coup, non parce qu'il
était faux mais parce qu'il **fait double emploi** : au sol la vitesse
tangentielle est pilotée par l'approche, qui ramène déjà à l'arrêt quand aucune
touche n'est tenue. Superposer les deux annulait la marche dès la première
image — on l'a vu, le test l'a dit.

## 2. Le vaisseau tourne comme un vaisseau

`_usePhysicsToRotate` vaut **vrai** dans le build, et `_angularDrag` 0,92 était
lu sans jamais servir : le vaisseau collait instantanément au repère caméra.
Il porte désormais son propre quaternion :

```
omega += couple x _maxRotationalThrust (2) x dt
omega *= _angularDrag (0,92) ramene a dt
q = normalise(q + 1/2 omega (x) q dt)
```

La caméra **suit** le nez au lieu de le commander, l'écart entre le regard et
la trajectoire devient visible, et le roulis existe (Q et Z au clavier, le
cinquième axe de la manette quand elle en a un — E sert déjà à interagir).

Deux effets de bord qu'il a fallu traiter, et qui n'étaient pas dans l'audit :

- **la poussée suit le nez, pas le regard.** C'est ce qui donne son sens à la
  lourdeur : pousser en avant pendant qu'on tourne ne pousse pas là où l'on
  regarde ;
- **le vaisseau a une orientation de départ.** Sans la poser, son « haut »
  serait celui du repère de travail et non la verticale locale : sa poussée
  verticale serait partie de travers dès la première image. `orientTo()` la
  fixe au point d'apparition.

Le pilote automatique, lui, n'a rien eu à changer : il pousse sur la vitesse en
coordonnées monde, sans passer par les axes du vaisseau.

## 3. Les fluides portent, poussent et tournent

Trois manques et un doublon, tous corrigés dans `fluids.js` :

| | avant | mesuré |
|---|---|---|
| traînée | `DEFAULT_DRAG = 1` pour tous | portée par le **détecteur** : `_dragFactor` 0,5 ou 1 |
| densité | `density ?? 0` — rien ne flottait | **partout**, de 0,2 à 500 |
| courant | aucun | `_flowSpeed` 300 sur les 8 tornades, `_angularSpeed` 10 |
| l'océan | sortait **deux fois**, et les deux s'annulaient | dédoublonné sur le nom et la position |

La poussée d'Archimède suit la formule de l'audit, `a = −g (ρ − 1)` : à densité
1 un corps ne monte ni ne descend, à 10 l'océan pousse à neuf fois la pesanteur
locale. Ce n'est pas anodin — l'atmosphère à 1,2 allège de 20 % — mais c'est ce
que le build décrit, et l'ancien `?? 0` ne faisait que masquer une lecture
manquante.

La traînée s'applique désormais à `v − v_milieu` et non à `v` : sans cela un
courant ne pousse rien, et une tornade à 300 u/s ne faisait que freiner. C'est
le contenu jouable de Giant's Deep qui revient avec cette ligne.

### L'erreur trouvée en écrivant le test

Les tornades sont des **capsules** (r = 40, h = 305). La première version du
test de confinement les traitait comme des sphères de rayon 40, ce que l'audit
avait justement relevé. La correction — clamper la coordonnée le long de l'axe
— était fausse aussi, et d'une manière plus vicieuse : **borner la seule
composante de l'axe donne toujours une distance nulle**, donc une capsule qui
engloutit l'espace entier. Le point le plus proche est sur l'axe : il faut
annuler les deux autres composantes.

Le test l'a dit tout de suite (`hors de la capsule, rien: 40`), et le même
défaut était dans `insideVolume` de `gravity.js`, écrit dix minutes plus tôt.
Les deux passent maintenant par `distanceToAxis()`.

## 4. Les vitesses changent de repère

C'est le correctif le plus court et le plus lourd de conséquences. Au
basculement d'ancre, la boucle reportait les **positions** et laissait les
vitesses : on arrivait donc **toujours à l'arrêt relatif** de sa cible.

`orbits.js` expose `frameVelocity()` — `ω × r` pour une orbite circulaire, la
vitesse intégrée pour la comète, et récursivement celle du primaire — et
`main.js` ajoute l'écart au joueur, au vaisseau et aux sondes en vol. Entre
Timber Hearth et sa lune il vaut environ `√μ = √(12 × 250) ≈ 55 u/s`.

Annuler cet écart est justement la quatrième phase de l'`Autopilot`
([`18-vaisseau.md`](18-vaisseau.md)) : elle avait un nom, un affichage et un
code, et **rien à faire**. Elle a maintenant du travail.

## 5. Le repère tournant a ses forces d'inertie

Le repère de travail tourne avec le corps ancré — c'est ce qui garde ses
colliders immobiles ([`origin.js`](../web/src/origin.js)) — et rien n'en tirait
les conséquences : en vol stationnaire au-dessus de Timber Hearth, le sol ne
défilait pas.

`SpinField.inertial()` rend `−2 ω × v − ω × (ω × r)`. À 0,05 rad/s et 250
unités, un joueur immobile dans le repère inertiel voit le sol passer à
**12,5 u/s**, exactement le chiffre annoncé par l'audit, et l'accélération
d'inertie vaut `ω² r = 0,625` — la centripète qui le maintient sur son cercle
apparent. Les deux sont gardés comme invariants.

## 6. L'atténuation audio, et le `fileId` perdu

**83 sources sur 97** sont en atténuation `custom`, 14 en `logarithmic`,
**aucune** en linéaire — le seul mode dans lequel le portage les rendait. Le
modèle passe à `inverse` pour tout ce qui n'est pas explicitement linéaire, et
`rolloffCustomCurve` est échantillonnée à l'extraction puis appliquée à la
main : WebAudio ne connaît que trois modèles de distance, on met donc son
facteur à zéro et c'est la courbe qui règle le volume.

Le déréférencement des arbres de dialogue, lui, était inscrit **à confirmer**
dans l'audit. Il est confirmé, et le point exact est
`ExtractContext.plain()` :

```js
const ref = { $ref: v.pathId };                       // le fileId est jete ici
const nm = this.assetNames.get(v.pathId) || this.name(v.pathId);
```

Un `path_id` **nu** se répète d'un fichier à l'autre. Le pointeur d'un
`*ConvoController` vers un `TextAsset` d'un autre fichier retombait donc sur
l'homonyme du fichier de la scène — un os de squelette, `anglerfish_rig:UpTail4`
—, et `ctx.texts`, indexé lui aussi par `path_id` nu, laissait passer
l'imposture. Tout ce qui désigne un objet passe maintenant par une clé
canonique `fichier:path_id`, et `env.deref` suit le `fileId` comme il l'a
toujours su faire.

L'invariant que l'audit demandait est en place : **ce que vise un contrôleur de
dialogue est un texte, jamais un `Transform`** — et `gp.stats` nomme les classes
fautives si jamais ce n'était plus vrai.

## 7. Le niveau de détail, requalifié

A8 était surestimée : `level0` porte **deux** `LODGroup`, et les cinq
`CreateLODGroup` n'ont aucun champ sérialisé. Il n'y a rien à récolter, et
régénérer `unity41-types.json` pour cela n'en vaut pas la peine.

L'effort est reporté sur les **21 `ChildColliderLOD`**, qui portent
`_trackPlayer`, `_trackShip` et `_trackProbe` : un groupe hors de portée
n'entre plus dans la construction des colliders, et l'ensemble éveillé est
réévalué à chaque image — mais reconstruit au plus une fois toutes les deux
secondes, parce que reconstruire coûte près d'une seconde. Un groupe que *rien*
ne suit reste éveillé : on ne coupe pas une collision faute d'avoir compris qui
la réveille.

Le vaisseau, lui, ne se pose plus sur une sphère de rayon `upperSurfaceRadius`
— donc au-dessus des vallées — quand Havok et la géométrie réelle sont là : un
rayon vers le bas local donne le contact réel. La sphère analytique reste le
repli, et le filet qui empêche de tomber au centre de la planète.

## 8. Les petites lectures manquantes

- **`PolarForceField`** : un volume, `_acceleration −10`, une force radiale à
  un **axe** et non à un point. Il est lu, et se compare aux champs
  directionnels sur le même pied — priorité, puis intensité.
- **`_affectsAlignment`** : un champ sur 34 pousse **sans** retourner ce qu'il
  tient. `dominantField` rend désormais une `alignDir` distincte de la
  direction de la force, et la verticale reste celle de la planète.
- **`OxygenDetector`** : une capsule r = 0,5 h = 2 portée par le joueur. Le
  test de zone était ponctuel et ratait la zone d'un demi-mètre au bord.

## Ce que cette série ne fait pas

Elle ne juge rien à l'œil ni à l'oreille, et elle ne joue pas. L'équilibrage
audio, le rendu et **une partie jouée** restent exactement où
[`08-reste-a-faire.md`](08-reste-a-faire.md) §2 les laisse : hors de portée
d'une machine.

Deux points du backlog restent ouverts pour une raison mesurable :

- **les impostures de planète** (`LODCameraSnapshot` ×5, `_snapshotInterval` 1)
  demandent un second rendu par corps lointain. Le portage a résolu le même
  problème autrement (sphères + secteurs) ; ce n'est pas ce que fait le jeu,
  mais ce n'est pas non plus une lecture manquante ;
- **le gain réel de l'encodage Opus**, toujours non mesuré : il demande un
  build et un navigateur, donc `tools/15_verify.py`, pas `tests/`.
