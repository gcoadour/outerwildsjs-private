# Où en est le portage — le compte, en face

> **Corrigé par [`60-sonde.md`](60-sonde.md).** Tout ce qui suit compte
> `level0`, et `level0` seul. L'alpha pose 37 classes de plus — 61 instances —
> dans `sharedassets1.assets`, `resources.assets` et `mainData`, et la sonde y
> est en entier. Le compte juste est de **1 413 instances lues sur 1 451, soit
> 97,4 %** : le pourcentage a baissé en devenant vrai. La phrase de conclusion
> ci-dessous — « c'est le fond du tonneau » — portait sur le bon fond et le
> mauvais tonneau.

Cette page remplace l'estimation de [`08-reste-a-faire.md`](08-reste-a-faire.md)
par un **chiffre mesurable et rejouable** :

```
OW_BUILD=/chemin/vers/..._Data node scripts/recensement.mjs
```

## Le compte

| | classes | instances |
|---|---|---|
| posées dans `level0` | **275** | **1 390** |
| lues par le moteur | 197 | 1 192 |
| lues par un motif (`/oxygen/i`…) | 60 | 164 |
| **lues, en tout** | **257** | **1 356 — 97,6 %** |
| extraites, non lues | 5 | 20 |
| sans aucun lecteur | 13 | 14 |

Les **34 instances** qui restent sont nommées une par une en fin de
[`58-suivi.md`](58-suivi.md) : quatorze calibrateurs de tenseur d'inertie, sept
outils de studio, sept mises en page, trois singletons de câblage, une
bibliothèque d'explosion tierce, un tracé d'onde. Aucune n'est un système de
jeu.

### Comment ce chiffre est devenu fiable

Il a été faux **deux fois**, dans les deux sens, et chaque correction est une
page :

| | classes sans lecteur | pourquoi |
|---|---|---|
| [`45`](45-recensement-mesure.md) | 117 | premier recensement sur le build |
| [`46`](46-migration-lots.md) | 59 | six lots écrits |
| [`47`](47-effets-image.md) | **77** | le compte **montait** : un commentaire n'est pas un lecteur |
| [`50`](50-regard.md) | 51 | le marqueur `@lit` : une traduction n'est pas une absence |
| ici | **13** | huit lots de plus |

> L'outil qui mesure ce qui manque se mesure comme le reste.

## Ce qui a été fermé dans cette série

| page | ce qui manquait |
|---|---|
| [`47`](47-effets-image.md) | **24 effets d'image sur 15 caméras**, le champ de vision (70° et non 60), le télescope relu |
| [`48`](48-ciel-mesure.md) | la voûte qui **tourne**, dix visages de nuage, **mille étoiles qui s'éteignent** |
| [`49`](49-queue.md) | les dégâts du vaisseau **relus à l'endroit**, treize marqueurs de carte, six tornades qui penchent |
| [`50`](50-regard.md) | **on allume en regardant** : trois secondes de regard fixe |
| [`51`](51-tour.md) | la tour de lancement, et ce que « **posé** » veut dire |
| [`52`](52-casque.md) | le casque qui **traîne**, l'alarme à 30 %, les voyants en phase |
| [`53`](53-joueur.md) | viser à dix unités, **lancer une sonde s'entend**, le sable qui écrase |
| [`54`](54-lumiere.md) | la lumière globale qui **fond**, les phares à six cents |
| [`55`](55-attaches.md) | quatorze alignements sur un corps désigné, la réparation qui se voit |
| [`56`](56-impostures.md) | les impostures rendues, et **trois quads décollés** des vraies planètes |
| [`57`](57-particules.md) | la **queue de la comète**, le plafond de l'explosion |
| [`58`](58-suivi.md) | la lecture de la cible visée, la **poussière de vitesse** |

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 055** vérifications (`tests/09-jeu.mjs` et les huit autres) |
| sur le build | **303** vérifications (`tests/05-extract.mjs` surtout) |
| en navigateur, **sans** le build | **13** contrôles (`15_verify.py --repli`) |
| en navigateur, avec le build | **112** contrôles (`15_verify.py --profil`) |
| le pipeline se charge | 37 modules |
| le moteur se **compile** | 66 modules |

Les lignes « compile » et « sans le build » sont nouvelles. `check-modules.mjs`
ne couvrait que le pipeline : une faute de syntaxe dans `main.js` n'était
attrapée par rien, et une erreur d'**exécution** dans `boot()` attendait qu'un
humain ouvre la page. Les deux sont gardées maintenant, et la seconde tourne
sans les 289 Mo.

> **Et ce filet a servi tout de suite.** Un `import` que cette série croyait
> avoir ajouté ne l'avait pas été : le remplacement n'avait pas trouvé son
> ancre, et n'avait rien dit. Le module compilait, les 1 055 vérifications
> passaient, et `ambientStep is not defined` ne se levait qu'une fois le joueur
> dans un secteur — où il **abortait chaque image**, faisant échouer cinq
> contrôles sans rapport apparent. Les 112 du navigateur l'ont trouvé à la
> première exécution, et le comparatif avec l'état d'avant a montré que les cinq
> n'en faisaient qu'un.
>
> Le mode `--repli`, lui, ne l'avait **pas** vu : sans données il n'y a pas de
> secteur, donc pas d'appel. Il attrape ce qui casse au démarrage, pas ce qui
> casse en jouant, et sa docstring le dit.

## Les outils

[`46`](46-migration-lots.md) avait monté un désassembleur d'IL « un fichier
jetable », et l'avait jeté. Chaque lot suivant l'a remonté. Les trois sont au
dépôt :

| | |
|---|---|
| `scripts/recensement.mjs` | ce que le build pose, ce que le moteur en lit |
| `scripts/il.mjs` | l'IL sans SDK .NET — **avec la table de saut** des `switch` et la lecture des énumérations |
| `scripts/composants.mjs` | les instances de la scène, champs compris |

## Les neuf leçons

Chaque page de la série en a payé une. Dans l'ordre :

1. avant de conclure qu'une chose manque au build, **vérifier qu'on la lit** ([`34`](34-actions.md))
2. avant de conclure qu'on la lit, **la mesurer** ([`36`](36-audit.md))
3. avant de conclure qu'on la joue, **la jouer** ([`43`](43-pnj-son-decollage.md))
4. avant de chercher ce qui manque, **demander la liste** ([`45`](45-recensement-mesure.md))
5. **l'ordre du code n'est pas l'ordre de l'exécution** ([`46`](46-migration-lots.md))
6. **une liste se mesure elle aussi** ([`47`](47-effets-image.md))
7. **une capture d'écran n'est pas une mesure** ([`48`](48-ciel-mesure.md))
8. **un test garde une mesure, pas une conclusion** ([`49`](49-queue.md))
9. **ce que l'auteur voulait n'est pas ce que le build fait** ([`58`](58-suivi.md))

Et celles que la série a ajoutées en chemin : l'outil qui compte se mesure
([`50`](50-regard.md)) ; un zéro calculé ressemble à un zéro mesuré
([`51`](51-tour.md)) ; un modèle cohérent avec lui-même ne se dénonce pas
([`53`](53-joueur.md)) ; « extrait » n'est pas « lu »
([`54`](54-lumiere.md)) ; une décision d'architecture n'exempte pas de regarder
([`56`](56-impostures.md)) ; « jamais » est un chiffre, donc il se mesure
([`57`](57-particules.md)).

## Ce qui reste, honnêtement

Deux choses, et aucune ne se comble en portant mieux.

**Ce que l'alpha n'a pas.** [`08`](08-reste-a-faire.md) §1 en tient la liste, et
elle a maigri de trois lignes à la mesure — `RocketKidConvoController`, le
ciblage et l'entraînement, les dégâts localisés y figuraient à tort. Ce qui
reste y est pour de bon : l'espace replié de Dark Bramble, quatre des cinq
savoirs, les machines à états d'animation, les éclats de fracture, les images du
flashback.

**Le jugement qu'une machine ne rend pas.** L'équilibrage des volumes audio, des
tailles de particules, le rendu des atmosphères — et une partie jouée. Tout est
vérifié au chiffre ; rien ne l'est au goût.
