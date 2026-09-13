# Les lois écrites que rien n'appelait

Trois dénominateurs, trois questions, et le troisième est le plus désagréable
des trois parce qu'il ne regarde pas le build du tout.

| | |
|---|---|
| `scripts/recensement.mjs` | ce que le build **installe**, et ce qu'on en lit |
| `scripts/evenements.mjs` | ce que le build **annonce**, et ce qu'on en nomme |
| **`scripts/lois.mjs`** | ce que le portage a **écrit**, et ce qu'il **appelle** |

```
node scripts/lois.mjs
41 lois du moteur que RIEN n'appelle, dans 21 modules
```

## `web/src/attachments.js` n'était importé par personne

Six classes du build. Trente-cinq instances. Une page de documentation
([`55`](55-attaches.md)). Quarante vérifications dans `tests/09-jeu.mjs`, toutes
vertes. Une ligne dans le tableau « ce qui est porté » de
[`08`](08-reste-a-faire.md).

**Et aucun module du moteur ne l'importait.**

```
$ grep -rn "attachments.js" web/src/main.js
$
```

Le module était écrit, éprouvé, documenté comme fait — et il ne s'exécutait
jamais. Les quatorze alignements sur un corps désigné, les neuf héritiers de
champ, les deux clignotants, les trois nœuds cassés dont « la réparation se
voit » : rien de tout cela n'arrivait à l'écran.

> **Un test ne peut pas le voir.** `tests/09-jeu.mjs` importe le module et le
> fait tourner ; tout passe. C'est précisément le piège : une loi éprouvée a
> l'air vivante. Il fallait chercher qui l'appelle, et personne ne l'avait
> cherché parce que rien ne le demandait.

C'est la troisième fois que ce dépôt se ment, et la troisième forme :

| | |
|---|---|
| [`47`](47-effets-image.md) | un **commentaire** faisait passer pour lu ce qui ne l'était pas |
| [`65`](65-onde.md) | du **code** faisait sans être nommé, et le compte ne le voyait pas |
| ici | une **loi éprouvée** avait l'air vivante, et rien ne l'appelait |

## Ce qui est branché

**Ce qui clignote.** Deux `BlinkingRenderer`, et pas au même rythme : l'icône de
mise à jour bat à 1/1, celle de l'ordinateur à 1/0,5. Ils se rattachent par nom
au maillage chargé, comme les nuages et les pivots de tornade.

**Ce qui s'aligne sur un corps désigné.** Quatorze objets — les méduses de
Giant's Deep, les deux jumelles sur leur point focal, l'île qui orbite, la
comète — dont le *haut* ne vient pas de la gravité dominante mais d'un corps
nommé.

**La réparation qui se voit.** Un nœud réparé du satellite change de matériau
dans le build ; ici il devient vert. Le matériau exact n'est pas sous la main,
la *règle* l'est.

**Ce qui n'a rien à brancher, et le dit.** `inheritedAcceleration` reste sans
appelant : dans ce portage, ce décor est un enfant du glTF de son corps et hérite
du mouvement par la hiérarchie. Le module le disait déjà ; c'est maintenant la
seule ligne d'`attachments.js` que `lois.mjs` signale, et elle est justifiée à
l'endroit où elle est écrite.

## Et les météores de Brittle Hollow

Même diagnostic, autre module : `meteorLaunchers` était écrit, éprouvé, appelé
par personne. Quatre lanceurs sur Brittle Hollow, et tout est mesuré :

| | |
|---|---|
| intervalle | **tiré entre 5 et 20 s, à chaque tir** |
| vitesse | tirée entre 100 et 200 |
| rayon | 10 |
| dégâts au contact | **50** (`TouchExplosive`, mesuré sur le préfabriqué en [`60`](60-sonde.md)) |
| immunité initiale | 0,5 s (`IgnoreInitialCollisions`) |

Le délai est **retiré à chaque tir**, pas fixé une fois : deux lanceurs ne se
synchronisent jamais, et le même lanceur ne bat pas deux fois pareil. C'est ce
qui fait qu'on ne peut pas apprendre le rythme des météores — on peut seulement
lever les yeux.

L'immunité de la demi-seconde n'est pas un détail non plus : sans elle, le
météore explose sur son propre lanceur.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 313** vérifications (+14) |
| sur le build | 360 vérifications |
| en navigateur, avec le build | **163** contrôles (+8) |
| en navigateur, sans le build | 13 contrôles |
| lois sans appelant | **41 → 33** |

Les huit contrôles neufs comptent ce qui tourne enfin : quatorze alignements,
neuf héritiers, deux clignotants, trois nœuds, un volume d'éclaboussure, quatre
lanceurs — et un tir forcé qui part bien entre cent et deux cents.

## Et `--repli` a servi une troisième fois

L'import des météores a atterri dans une ligne d'`import` qui n'était pas celle
de `decor.js`. `check-modules.mjs` compile chaque module, et un module compile
très bien avec un nom absent — la faute n'apparaît qu'à l'exécution, dans
`boot()`, sur `MeteorLaunchers is not defined`.

`tools/15_verify.py --repli` l'a trouvée en une minute, sans les 289 Mo. C'est la
troisième fois que ce mode attrape ce que la compilation laisse passer
([`59`](59-etat.md), [`62`](62-visee.md), ici).

## La leçon

> Une loi éprouvée a l'air vivante. **Demandez qui l'appelle.**

Trente-trois lois attendent encore leur appelant. Certaines sont légitimes — un
mécanisme dont la liste d'entrées est vide, et le dépôt en nomme déjà plusieurs
([`58`](58-suivi.md)). Les autres sont du travail fait qui ne sert à rien, et
c'est la forme de dette la plus coûteuse : elle a l'air d'un actif.
