# Le ciel, mesuré : la voûte qui tourne, dix nuages, mille étoiles qui s'éteignent

[`41-ciel.md`](41-ciel.md) avait ouvert le ciel de Timber Hearth et refermé la
page sur trois dettes, toutes déclarées ouvertes :

- **la rotation de la voûte** — « deux orientations essayées, toutes deux
  fausses ; la convention d'axes reste à établir » ;
- **les dix textures de nuage** — nommées, jamais exportées, donc vingt-quatre
  nuages au même visage ;
- **le champ d'étoiles** — le contrôleur extrait, son système de particules
  non.

Les trois sont fermées. Et la première l'est pour une raison qui vaut plus que
le résultat : **on a cessé de la raisonner**.

## La voûte : une capture d'écran n'est pas une mesure

La méthode de [`41`](41-ciel.md) était d'essayer une orientation, de la
photographier dans un vrai Chromium, et de conclure de ce qu'on voyait :

> - viser le soleil directement : le disque reste au zénith, plein jour permanent ;
> - viser le point opposé : une **gerbe de rayons cyan** au pôle de la sphère UV.

Et la conclusion tirée de la seconde image : « le disque est posé sur un pôle de
la sphère ; le `LookAt` d'Unity aligne l'axe **+Z**, c'est-à-dire l'équateur,
pas un pôle — donc ni l'une ni l'autre n'est ce que fait le jeu ».

Le raisonnement est bon. Sa prémisse — « +Z, c'est l'équateur » — ne l'est pas,
et rien dans une capture d'écran ne pouvait la démentir. La question se pose au
**maillage**, où elle a une réponse exacte :

> quel sommet de `pSphere2` porte l'uv (0,5 ; 0,5), le centre du disque bleu ?

```
uv le plus proche du centre : 0.5000 0.5000  ->  direction locale  0, 0, 1
  axe +X -> uv (0.109, 0.500)      axe -X -> uv (0.891, 0.500)
  axe +Y -> uv (0.500, 0.891)      axe -Y -> uv (0.500, 0.109)
  axe +Z -> uv (0.500, 0.500)      axe -Z -> uv (0.966, 0.651)
```

**Le disque est sur +Z**, et l'uv est une projection polaire centrée dessus :
le « pôle » de la sphère UV *est* l'axe que `LookAt` aligne. La première des
deux orientations essayées était donc la bonne — c'est son exécution qui ne
l'était pas.

L'extracteur mesure maintenant cette direction et la rend dans les coordonnées
de l'export (`discDirection`, `[0, 0, -1]` : Z inversé comme `gltf.js` le fait
sur les positions). Personne n'a plus à la deviner, et si le maillage change,
le nombre change avec lui.

### Ne pas supposer la chaîne de transformation non plus

Reste à poser la rotation. Entre le build et l'écran il y a deux inversions de
Z — celle de l'export, celle du chargeur glTF — et une réflexion **n'est pas une
rotation** : composer des quaternions au travers donne un résultat faux qui a
l'air juste.

Le moteur ne suppose donc rien de cette chaîne. Il lit dans Babylon les
directions **monde** des trois axes du parent, et résout dedans :

```
cible_parent = Bᵀ · cible_monde          B = [ex, ey, ez], lus, pas déduits
q            = lookRotation(cible_parent) ∘ lookRotation(axe)⁻¹
```

C'est plus long que d'écrire un signe, et c'est la seule façon de ne pas avoir à
le deviner. L'invariant le vérifie à travers une base **réfléchie**, qui est
précisément le cas qui se serait mal passé.

## Les nuages : dix visages, vingt-quatre maillages homonymes

`CloudTextureController.Awake` fait deux choses, et **une seule marche** :

```
renderer.material.mainTexture = _cloudTex;              <- appliquée
Color c = renderer.material.color; c.a = _startAlpha;   <- perdue
```

La seconde écrit dans une **copie** de la structure et ne la range jamais :
`_startAlpha` ne quitte jamais le champ. C'est le troisième morceau de code mort
relevé dans ce build, après `_currentSkyAlpha` de la voûte et les modificateurs
de dégâts du vaisseau. `Update`, lui, est vide : un nuage ne bouge pas.

Ce qui marche suffisait : `renderer.material` — au singulier, pas
`sharedMaterial` — **instancie** le matériau. Chaque nuage a le sien.

Deux conséquences pour le portage :

- les dix textures s'exportent maintenant comme images (256 px, par le
  `TextureExporter` qui servait déjà aux particules et à l'interface) ;
- le matériau est **cloné** par nuage. Poser la texture sur le matériau partagé
  les repeindrait tous les vingt-quatre de la même façon — exactement le défaut
  qu'on corrige.

> **Et un rattachement par position, le premier du dépôt.** Le sable, les
> textures qui défilent, le décor vivant se rattachent tous **par nom**, parce
> que le nom du build suffit à désigner une chose. Ici il ne suffit pas : les
> vingt-quatre nuages s'appellent tous `PieceOfRing`. Ce qui les distingue est
> leur place. Chaque maillage n'est pris qu'une fois, et chaque nuage prend le
> plus proche encore libre — sans quoi deux nuages voisins se disputeraient le
> même et l'un des deux resterait sans visage.

## Le champ d'étoiles : le compte à rebours est écrit dans le ciel

C'est la plus belle chose que cette page a trouvée, et le portage ne la faisait
pas du tout.

`DistantStarController` fait trois choses :

1. **`LateUpdate` met le système de particules en PAUSE** dès la première image
   et ne le relance jamais. Les mille étoiles ne bougent plus ; leurs positions
   sont relevées une fois (`GetParticles`).
2. Il colle ensuite le champ **sur la caméra du joueur** à chaque image — c'est
   ce qui les rend infiniment lointaines.
3. **`Update` les éteint une à une.** À chaque image, `_explodeToThisIndex` suit
   une courbe de la fraction de boucle ; chaque étoile franchie reçoit une
   `DistantSupernova` à sa place et passe en couleur `(0, 0, 0, 0)`.

```
                    part du build           ce qu'on en voit
fraction 0,000   ->    0 étoiles éteintes   le ciel plein
fraction 0,695   ->  238 sur 1 000          un ciel qui s'est clairsemé
fraction 1,000   -> 1000                    plus rien
```

La courbe est lente puis brutale : les trois quarts du ciel partent dans le
dernier tiers de la boucle. **Le ciel se vide pendant les vingt minutes**, et
c'est un compte à rebours qu'on ne peut pas ne pas voir.

Les nombres du champ, lus sur son système de particules : **1 000** étoiles sur
une coquille sphérique de **30 000** unités, de 200 à 400 d'envergure, couleur
(0,843 ; 0,867 ; 1) — un blanc bleuté.

Deux écarts assumés dans le rendu, et dits :

- **les positions sont tirées d'un générateur à graine.** Le build les tire une
  fois au démarrage et les garde ; sans graine, elles changeraient à chaque
  chargement, et une étoile éteinte au redémarrage de la boucle ne serait plus
  la même — ce qui se verrait, puisque le champ ne bouge pas. Le tirage est
  celui de Marsaglia : le tirage naïf (θ, φ uniformes) entasse les étoiles aux
  pôles, et un ciel qui a deux touffes se remarque.
- **la `DistantSupernova` n'est pas instanciée.** Mille préfabriqués de
  particules sont hors de portée ici. On garde le **geste** — l'étoile brille
  puis s'éteint, sur une seconde — et on le dit, plutôt que de le laisser croire
  porté.

## Un garde-fou qui manquait

En branchant tout cela, une chose est apparue : **une faute de syntaxe dans
`main.js` n'était attrapée par rien.** Les tests ne l'importent pas (il touche
au DOM), et `check-modules.mjs` l'ignorait pour la même raison. Elle attendait
l'ouverture de la page, c'est-à-dire un navigateur.

`check-modules.mjs` a donc une seconde passe : les soixante modules du moteur ne
sont pas **chargés** — ils sont **compilés**. Cela n'exécute rien et attrape ce
qui les concerne vraiment ici : une accolade oubliée, un import en double.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : l'axe du disque
amené sur le soleil, en repère direct et **à travers une base réfléchie**, y
compris aux deux singularités (soleil pile sur l'axe, pile à l'opposé) ; le
rattachement des nuages par position, le plus proche qui l'emporte, un maillage
jamais pris deux fois, un maillage d'un autre nom jamais pris ; les mille
étoiles, la forme de leur courbe (moins d'un cinquième à mi-boucle, plus des
trois quarts dans le dernier tiers), l'extinction qui ne rend que le nouveau,
la supernova suspendue qui arrête tout, le redémarrage qui remplit le ciel, les
positions sur la coquille et la graine qui les reproduit.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : le disque au
`+Z` local, Z inversé par l'export ; dix images de nuage écrites, toutes en 256
pixels, chaque nuage sachant laquelle est la sienne, et les vingt-quatre portant
le même nom ; un champ d'étoiles, mille étoiles, 30 000 unités, 200 à 400
d'envergure, sa courbe en 21 points de 0 à 1, et son intervalle de contrôle à
zéro.

## La leçon

> une liste se mesure elle aussi ([`47`](47-effets-image.md)) — et **une capture
> d'écran non plus n'est pas une mesure**.

Regarder le résultat est indispensable : c'est une capture d'écran qui avait
montré que la voûte ne tournait pas ([`41`](41-ciel.md)), et c'est un navigateur
qui avait trouvé qu'on mourait à la première image ([`46`](46-migration-lots.md)).
Mais l'œil constate un symptôme ; il ne lit pas une convention d'axes. Quand la
question a une réponse dans les données — et « où la texture pose-t-elle son
centre » en a une —, c'est aux données qu'il faut la poser.
