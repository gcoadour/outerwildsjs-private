# Ce qui bouge quand on ne le regarde pas — et un import qui n'est pas un appel

[`36`](36-audit.md) et la lune quantique : le portage a depuis longtemps une
lune qui change d'hôte dès qu'on cesse de la regarder. `QuantumObject` est une
**classe de base**, et le build en pose deux descendances que le portage
n'extrayait même pas.

```
QuantumObjects  (sur QuantumMoon_Body)  trois pins, une cabane, un panneau
QuantumStatue   (dans le musée)         une tête ancienne, en vitrine
```

## Cinq objets que rien ne posait

`MakeChildrenPlanarQuantum.Awake` prend ses **enfants** un par un, en fait des
`PlanarQuantumObject`, et **se détruit**.

Ce que ce composant fait n'est donc pas dans ses champs — il n'en a aucun — mais
dans sa descendance. C'est pour cela que rien ne l'avait vu : le recensement
compte des classes **posées**, et celle-ci ne pose rien. Il a fallu redescendre
le graphe de scène, ce dont aucun extracteur n'avait eu besoin jusqu'ici : tous
partaient d'un composant et **remontaient**.

Les cinq sont posés à 18–21 unités du centre de la lune, donc à sa surface. Un
rayon de fonction d'onde de **100**.

> Trois pins, une cabane et un panneau qui changent de place sur une lune
> chaque fois qu'on regarde ailleurs. C'est, en cinq objets, tout le jeu qu'Outer
> Wilds allait devenir.

## La règle, et elle tient en une ligne

```
Update:  visible = l'AABB est dans le tronc de la caméra active
         si (!visible ET visible à l'image précédente) → Collapse()
```

L'objet ne bouge **pas** pendant qu'on le regarde, ni pendant qu'on ne le
regarde pas : il bouge à **l'instant** où il sort du champ.

Et chaque place tirée est **refusée si elle est visible**. C'est ce refus qui
rend la mécanique crédible — un objet quantique ne se matérialise jamais sous
vos yeux — et c'est lui qu'un portage pressé oublierait.

| | comment il s'en va |
|---|---|
| `PlanarQuantumObject` | un point dans un disque de 100, posé sur le terrain par un rayon de 200, **refusé au-delà de 45° de pente** |
| `SimpleQuantumObject` | un point dans une sphère de 10, refusé si la place est occupée |
| `QuantumStatue` | elle ne se déplace pas : **chaque morceau a une chance sur cinq d'être visible** |

Mille essais chacun (`_checkDepth`), et si aucun ne tient, l'objet reste où il
est.

**La statue est la plus étrange, et c'est une seule ligne.** `si Random.value <
0,2 alors montre ce morceau`. Détourner les yeux d'une tête ancienne en vitrine,
et n'en retrouver qu'un cinquième.

## Ce qui verrouille

```
OnProbeSnapshot(caméra) :
    distance dans [_minQuantumLockRange, _maxQuantumLockRange]
    ET l'objet est DANS LE CADRE
    → _isQuantumLocked = true
```

`Collapse` commence par ce test et rend faux. **Photographier un objet quantique
avec la sonde l'épingle** — il ne bouge plus, même hors du champ. Rappeler la
sonde le libère.

Le mécanisme de l'appareil photo qui fige un objet quantique est donc déjà là,
entier, dans l'alpha.

La troisième condition est celle qu'on oublierait : être à bonne distance ne
suffit pas, il faut l'avoir **dans le cadre**. Photographier à côté ne
verrouille rien.

## Et ils sont brouillés dès le départ

`Start` appelle `Collapse()` une fois. Les cinq ne sont **jamais** là où la
scène les pose. Arriver sur la lune quantique et trouver la cabane ailleurs
qu'à sa place n'est pas un hasard de partie : c'est la première image qu'on a
d'eux.

## La lampe, et une entrée vide

`OnSwitchFlashlightOff` fait s'effondrer un objet **visible**, sauf si la sonde
est posée à moins de cent unités — c'est la sonde qui observe à votre place.

Mais `Awake` n'ajoute cet écouteur **que si `_isLightSensitive`**, et le même
test gouverne `LaunchProbe`, donc `_probeBody`, donc le bouclier de la sonde.
Aucune des deux instances du build ne l'est.

La loi est donc écrite et gardée, et sa liste d'entrées est **vide** — le même
cas que les dix-huit bouffées de [`46`](46-migration-lots.md) et
qu'`inheritedAcceleration` de [`68`](68-lois.md).

## Un import n'est pas un appel

`lois.mjs` déclarait `probeIcon`, `probeReadout`, `probeLabelPos`, `motionDust`,
`roastBroken` et `webSpeeds` **vivantes**. Elles ne l'étaient pas. Elles
figuraient dans une ligne d'`import` de `main.js`, et nulle part ailleurs.

```js
import { ProbeLauncher, SONDE, snapshotSize, probeIcon,
         probeReadout } from "./probe.js";   // ← et c'est tout
```

C'est la **cinquième** forme que prend la même erreur dans ce dépôt, et la plus
insidieuse des cinq : les quatre précédentes faisaient passer pour vivant ce qui
n'était pas branché ; celle-ci fait passer pour branché ce qui n'est
qu'**annoncé**.

| | |
|---|---|
| [`47`](47-effets-image.md) | un **commentaire** faisait passer pour lu ce qui ne l'était pas |
| [`65`](65-onde.md) | du **code** faisait sans être nommé |
| [`68`](68-lois.md) | une **loi éprouvée** avait l'air vivante |
| [`69`](69-assise.md) | le **compteur** écrit pour éviter le premier piège y est tombé |
| ici | un **import** comptait pour un appel |

Le compte honnête : **29 lois** sans appelant, contre 26 annoncées.

### Le marqueur de sonde, du coup

Les trois lois du marqueur sont branchées ici : où est la sonde à l'écran, à
quelle distance, et dans quel état — danger, ancrée, ou simple repérage. Le
danger l'emporte et tient encore une seconde après un dégât de contact.

`WorldToScreenPoint` a son origine **en bas** à gauche et `GUI` en haut : d'où la
soustraction à la hauteur, et les trente pixels qui remontent l'étiquette
au-dessus du point. La loi est écrite dans cette convention-là, et le portage la
lui rend plutôt que de la réécrire dans la sienne.

**Trois restent, nommées plutôt qu'oubliées :** `motionDust` ([`58`](58-suivi.md)),
`roastBroken` ([`52`](52-casque.md)) et `webSpeeds` ([`50`](50-regard.md)) sont
importées et jamais appelées. Elles sont le lot suivant.

## Et le profil testait d'anciennes données

Les contrôles neufs ont échoué la première fois, et pour une raison qui n'était
pas dans le code : `15_verify.py --profil` **réutilise l'extraction déjà faite**.
Un lot qui touche à un extracteur ne change alors rien à ce que la page lit.

C'est le même silence que le cache HTTP de [`62`](62-visee.md), une couche plus
loin : la **page** était à jour, ses **données** ne l'étaient pas.

Le piège devient un garde-fou : l'outil compare la date de l'extraction du
profil à celle du fichier le plus récemment modifié sous `web/src/pipeline/`, et
le dit en toutes lettres quand l'extraction est la plus ancienne. Le test est
grossier à dessein — des dates de fichiers, pas un hachage — et il suffit pour
ce qu'on veut attraper : « j'ai édité un extracteur et j'ai oublié de refaire
l'extraction ».

> Ici il a échoué bruyamment, ce qui est le bon cas. Il aurait pu **passer** :
> un contrôle qui ne touche pas aux données neuves passe très bien sur les
> anciennes.

## Un `TransformNode` n'est pas cullable

`QuantumObject.CheckVisibility` demande à Unity de tester des `Bounds` contre
les plans du tronc de la caméra. Babylon ne sait tester que ce qui est
**cullable** — un maillage. Un `TransformNode` n'a pas d'`isInFrustum`, et
`camera.isInFrustum(nœud)` lève donc à chaque image.

Une exception dans la boucle de rendu **ne se voit pas** : tout ce qui suit dans
l'image ne tourne simplement plus. Le symptôme est apparu trente contrôles plus
loin, sur un `window.__visee` qui n'avait jamais été posé — un objet de la
*visée*, sans rapport avec le quantique, et le vrai coupable était vingt écrans
plus haut dans la boucle.

> Et `--repli` ne pouvait pas l'attraper. C'est la première fois : ce mode a
> trouvé trois erreurs d'exécution que la compilation laissait passer
> ([`59`](59-etat.md), [`62`](62-visee.md), [`68`](68-lois.md)), mais il ne
> tourne que sur les replis — et ce code-ci n'existe **qu'avec le build**. Le
> seul filet qui reste là est `--profil`, et il coûte quinze minutes.

## Une faute de portée, et le lot d'avant

Le vrai coupable n'était ni le tronc ni les données : `anchorPos` — le repère
ancré, recalculé à chaque image — était lu depuis une fonction déclarée dans
`boot()`, où il n'existe pas.

Et il ne l'était pas que là. `siegeVivant()`, écrite au lot précédent
([`69`](69-assise.md)), faisait exactement la même chose. **Elle a passé 184
contrôles sans broncher**, parce qu'elle n'est appelée qu'en *montant dans le
vaisseau*, et qu'aucun contrôle ne montait dans le vaisseau.

> Un contrôle qui appelle la loi à la main ne touche jamais au chemin que la
> boucle emprunte. Il y en a maintenant un qui s'assied pour de vrai.

Les erreurs de page étaient collectées depuis toujours — et lues au **dernier**
contrôle, celui qu'on n'atteint jamais quand une exception coupe le parcours.
`15_verify.py` les affiche désormais dès qu'un contrôle lève, et il a nommé la
cause en une seule exécution.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 482** vérifications (+47) |
| sur le build | **371** vérifications (+11) |
| en navigateur, avec le build | **201** contrôles (+17) |
| en navigateur, sans le build | 13 contrôles |
| lois sans appelant | **26 → 29**, et le compte est juste |

## La leçon

> Un chiffre qui s'améliore tout seul est un chiffre qui a cassé
> ([`50`](50-regard.md)). Un chiffre qui **empire** quand on affûte l'outil est
> un chiffre qui vient de devenir vrai.
