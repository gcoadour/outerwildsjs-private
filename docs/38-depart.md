# Le départ de la partie

Point de départ de cette page : une capture du début de l'alpha. On y voit une
scène sombre, une charpente de bois tout près, des nuages éclairés et la lune
dans un ciel noir. Rien n'y ressemble à ce que le portage montrait au premier
instant.

La capture dit *ce que ça donne* ; c'est le build qui dit **pourquoi**. Et il le
dit sans ambiguïté : le joueur naît sur son propre point d'apparition, à sa
hauteur et dans la direction que porte sa rotation. Le portage, lui, le faisait
apparaître **contre le vaisseau**, quarante unités au-dessus du sol, face à une
direction que rien ne fondait — puis le laissait tomber.

Trois écarts, et aucun n'était une question de goût : les trois ont une source
dans le build, et les trois se ferment en la lisant. Ce que la capture montre et
qui ne se lit pas dans une donnée — le ciel, les nuages — est en fin de page,
non résolu et dit comme tel.

## Ce que le build dit du départ

Le jeu ne pose ni le joueur ni le vaisseau là où la scène les enregistre : il
les place **à l'exécution**, par un composant `SpawnPoint`. Il y en a
**seize**, deux par planète ([`07-gameplay.md`](07-gameplay.md)), et sur Timber
Hearth les deux sont distants de **471 unités**.

Ce chiffre est le départ lui-même : *on commence au village, et on marche
jusqu'au vaisseau*. Ce n'est pas une marche décorative — `knowsLaunchCodes`
garde l'embarquement, et les codes de lancement s'apprennent auprès du
conservateur, qui est au village ([`23-connaissance.md`](23-connaissance.md)).
Le raccourci qui faisait apparaître le joueur à 9 u du vaisseau ne se contentait
donc pas d'abréger le trajet : il posait le joueur devant une porte fermée, sans
lui donner la seule chose qui l'ouvre.

| grandeur | valeur relevée sur le build |
|---|---|
| points d'apparition dans `level0` | 16 |
| rayon des points d'apparition | 131 à 168 u |
| distance joueur → vaisseau (Timber Hearth) | 471 u |
| terrain de Timber Hearth | 100 à 250 u, dont 25 maillages au-delà de 200 |

## Les trois écarts

### 1. Le point — on apparaissait au mauvais endroit

`shipSpawn()` donnait la direction du vaisseau, et le joueur naissait dessus.
Le point d'apparition du **joueur** existait pourtant dans les mêmes données,
distingué du premier par son nom (`SpawnPoint_Player` contre `SpawnPoint_Ship`)
et, quand le composant le porte, par son champ `_isShipSpawn`.

### 2. La hauteur — on ne naissait pas, on tombait

`upperSurfaceRadius + 40` n'est pas une position, c'est une chute. La
conséquence était mesurée depuis longtemps sans être nommée : *« le joueur se
stabilise à 249 u du centre alors que les points d'apparition sont à
131–168 »* ([`07-gameplay.md`](07-gameplay.md)). Il ne se posait donc pas sur le
sol du village mais sur **ce qui dépasse** — les `PieceOfRing` sont à 218–238 —
et la portée d'embarquement du vaisseau avait été élargie à 40 u pour rattraper
les trente unités de dérive de cette chute.

Le corps du joueur est une sphère de rayon 0,6 : son centre se pose donc au
point d'apparition plus ce rayon, plus une garde d'un demi-mètre — une sphère
créée **en intersection** avec un collider trimesh est éjectée violemment par
Havok. Cette garde est le seul chiffre inventé de la page, et elle se résorbe à
la première image.

### 3. Le regard — la première image ne visait rien

`yaw = 0` regarde le « nord » du repère de travail. Ce nord est une
construction du moteur (l'axe X ou Y du monde projeté sur le plan tangent) : il
ne désigne rien dans le jeu, et il change de sens d'un corps à l'autre.

Or un `SpawnPoint` est un *transform* : son axe Z **est** la direction du
regard au premier instant. L'extracteur ne gardait que la position — la
rotation n'était relevée que pour les volumes, qui en ont besoin pour leur
collider. Elle l'est désormais pour les points d'apparition aussi, et
`start.js` la ramène au lacet de la caméra.

C'est là qu'un piège attendait : le lacet n'a de sens que dans un repère, et
celui de la caméra était écrit **en ligne dans la boucle de rendu**. Une
orientation lue correctement dans le build et convertie dans un autre repère
donne une tête tournée de travers, ce qui ressemble à une erreur de lecture
alors que c'en est une de convention. Le repère d'horizon vit donc maintenant
dans `start.js` (`horizonBasis`), et la caméra l'importe : il n'y a plus qu'une
définition de « nord ».

### Et un quatrième, trouvé en chemin : les yeux

```js
camera.position.set(player.pos.x, player.pos.y + 1.2, player.pos.z); // yeux
```

La hauteur des yeux était ajoutée sur **Y du repère de travail**, pas sur la
verticale locale. Cela ne vaut qu'au pôle nord du corps ancré. Ailleurs, la
caméra était portée de côté ; sous l'équateur, elle passait **sous les pieds du
joueur**, c'est-à-dire dans le sol. Le décalage suit désormais la verticale du
champ dominant, comme le fait déjà la caméra de mort
([`32-mort.md`](32-mort.md)).

## Ce que le portage fait maintenant

`web/src/start.js` — logique pure, ni Babylon ni DOM, donc vérifiable sans le
jeu :

| fonction | ce qu'elle rend |
|---|---|
| `spawnPoints(gameplay, {ship})` | les points d'apparition, triés par destinataire |
| `startPose(gameplay, home)` | position dans le repère ancré, verticale, lacet |
| `walkToShip(gameplay, home)` | la distance à parcourir jusqu'au vaisseau |
| `horizonBasis(up)` / `yawFor(dir, up)` | le repère où se mesure le lacet |
| `quatForward(q)` | l'axe Z d'un transform, direction du regard |

Le repli tient : sans `data/gameplay.json`, `startPose` rend `null`, le moteur
retombe sur la face éclairée du corps habitable et la page reste ouvrable sans
le build. Une extraction antérieure, sans rotation, donne un pose **non
orienté** (`oriented: false`) plutôt qu'un zéro déguisé en mesure.

Le redémarrage de boucle remet aussi le regard à sa direction de départ : une
boucle qui recommence remet tout à l'état initial, sinon on rouvre les yeux
dans la direction où l'on est mort.

## Les invariants gardés

Dans `tests/09-jeu.mjs`, sans le build : le tri joueur / vaisseau, la hauteur
du corps au-dessus du point, l'aller-retour `rotation → lacet → direction
regardée` (qui est la vraie mesure : le lacet reconstruit doit redonner
exactement l'axe Z du point), le cas sans rotation et le repli sans données.

Dans `tests/05-extract.mjs`, avec le build : les seize points portent une
rotation, ce sont des quaternions unitaires, ils se partagent tous entre joueur
et vaisseau, et **le départ n'est pas au pied du vaisseau** — un retour du
raccourci se verrait là.

Dans `tools/15_verify.py`, dans un vrai navigateur — parce que ces deux-là ne se
mesurent qu'une fois la caméra placée et le joueur posé : le joueur **se pose au
point d'apparition** (il tombe d'une garde d'un demi-mètre, plus de quarante
unités), et ses yeux sont à 1,2 u **au-dessus** de lui, sans composante
latérale. C'est ce dernier contrôle qui aurait attrapé le décalage sur Y.

## Ce qui reste à juger sur l'image

L'image de référence montre plus qu'une position : un ciel noir semé
d'étoiles, des nuages éclairés qui passent devant la lune, une lumière de nuit.
Le pose de départ est désormais celui du build ; le **rendu** de cette
première image, lui, n'est pas mesuré, et deux points restent ouverts, tous
deux déjà connus ailleurs :

- **Le ciel.** Le jeu affiche un système entier parce que ses planètes
  lointaines sont des impostures rafraîchies une fois par seconde
  (`LODCameraSnapshot` ×5) ; le portage a résolu le même problème par des
  sphères et des secteurs, ce qui est légitime mais ne donne pas le même ciel
  ([`08-reste-a-faire.md`](08-reste-a-faire.md) §3).
- **Les nuages.** Rien, dans le portage, ne les nomme : ni shader, ni système
  de particules identifié, ni maillage recherché. La question à poser au build
  est simple et n'a pas encore été posée — les nuages de Timber Hearth
  sont-ils des `MeshRenderer` (auquel cas ils sortent déjà dans le glTF et il
  n'y a qu'à les regarder), des particules, ou des *billboards* que
  l'exporteur laisse tomber ? Tant que la réponse n'est pas relevée, écrire un
  système de nuages serait inventer.

Ces deux points relèvent de ce que [`08-reste-a-faire.md`](08-reste-a-faire.md)
appelle *le jugement qu'une machine ne rend pas* : ils se tranchent dans un
navigateur, avec le build, en comparant à l'image.
