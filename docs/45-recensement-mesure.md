# Le recensement, refait sur le build — et trois lots qu'il a ouverts

[`42-lumieres.md`](42-lumieres.md) avait posé la méthode : demander au build la
liste complète des composants qu'il pose dans `level0`, et regarder lesquels le
portage nomme. [`44-reste-a-migrer.md`](44-reste-a-migrer.md) l'avait appliquée
**sans le build**, par recoupement sur les noms cités dans les notes, en
annonçant ses angles morts.

Cette page-ci refait le recensement **avec le build**, et ce qu'il montre valait
d'être mesuré : la liste par recoupement voyait 38 classes, le recensement en
voit **117**. Puis elle raconte les trois lots qui en sont sortis.

## Le compte

Build d'origine, alpha 1.2 Linux, SHA-256 `5c7defad…80f05a`, obtenu par
`tools/01_fetch.sh` depuis l'instantané Wayback du 15 août 2015.

| | |
|---|---|
| classes distinctes posées dans `level0` | **275** |
| instances | **1 390** |
| nommées quelque part dans `web/src/` | 114 — dont 99 par le moteur, 15 par le seul pipeline |
| **jamais nommées** | **161 classes, 581 instances** |
| dont attrapées par un **motif** du moteur (`/oxygen/i`, `/tornadobase/i`…) | 44 classes, 96 instances |
| **sans aucun lecteur, motifs compris** | **117 classes, 485 instances** |

Le compte de [`42`](42-lumieres.md) — 105 nommées, 170 absentes — s'est déplacé
de neuf classes depuis, ce qui est exactement le travail fait entre-temps.

La ligne qui compte est la dernière : le filtrage par motif n'est plus une
supposition, il est mesuré. **44 classes que la liste de [`44`](44-reste-a-migrer.md)
aurait comptées absentes sont en réalité lues** — les zones d'oxygène, les bases
de tornade, le rayon tracteur, mais aussi `ShipComponent`, `ImpactSensor`,
`LookAtSun`, `ModelShipController`.

## Ce que la méthode sans build ne pouvait pas voir

Le recoupement sur les notes trouvait 38 classes de jeu. Le recensement en
trouve 117. L'écart n'est pas une erreur de la première méthode : c'est sa
limite, annoncée d'avance — **une classe que personne n'a jamais écrite nulle
part lui est invisible**.

Ce sont précisément les plus intéressantes, parce que leur absence des notes
signifie que personne n'y a jamais pensé. Trois exemples, et le premier est
devenu le premier lot :

- `SandLevelController` ×2, `SandFunnelController`, `SandstormVolume` — **le
  sable des jumelles**, la mécanique propre du lieu ;
- `PlayerLockOnTargeting` ×2 (dont une posée sur `Player_Body`) et
  `ZeroGTrainingManager` — que [`08`](08-reste-a-faire.md) §1 classait sous
  « l'entraînement et le ciblage : aucune source ». Ils sont dans le build,
  lisibles, et le second porte deux références résolues. **C'est la deuxième
  fois** qu'une ligne de « ce qui n'est pas dans le build » tombe à la mesure,
  après `RocketKidConvoController` ([`36`](36-audit.md)) ;
- `GearPickup` ×2 — la combinaison, la sonde et la minicarte s'obtiennent en
  ramassant deux objets (`ExpeditionGear`, `SpaceSuit`), chacun disant lequel
  des trois il débloque. Le portage les donne d'emblée.

## Lot 1 — le sable des jumelles

C'est la mécanique du lieu, et elle manquait **entièrement** : aucune ligne du
portage ne parlait de sable.

Trois composants, quatre nombres chacun :

| | de | à | fenêtre |
|---|---|---|---|
| `RisingSand` | 60 | 290 | de la 2ᵉ à la 17ᵉ minute |
| `DrainingSand` | 300 | 66 | de la 2ᵉ à la 17ᵉ minute |
| `SandFunnel_Body` | poussée à la 2ᵉ, retrait à la 17ᵉ, dix secondes chacun | | |

La loi, lue dans l'IL, tient en deux lignes :

```
t       = clamp01((minutes - debut) / (fin - debut))
echelle = initScale + (finalScale - initScale) x t
```

Une interpolation linéaire, sans adoucissement : **le sable monte à vitesse
constante pendant quinze minutes**. Les deux niveaux sont des sphères qu'on met
à l'échelle — le sable ne se déplace pas, il change de taille aux deux bouts,
et c'est ce qui découvre chez la jumelle qui se vide ce qu'il recouvrait.

Deux détails que la mesure a tranchés :

- **les valeurs du constructeur (150 → 33) ne servent nulle part** : les deux
  instances les remplacent toutes les quatre. L'invariant garde donc les
  colonnes *nommées* et **refuse** le repli — sans quoi une extraction qui
  cesserait de lire les champs passerait en silence ;
- l'entonnoir est mené en deux temps par le build, mais ses deux minutes sont à
  quinze minutes d'intervalle : la forme fermée rend exactement les mêmes
  valeurs, et c'est elle qui est écrite.

Le rattachement se fait **par nom**, comme les textures qui défilent
([`42`](42-lumieres.md)) et pour la même raison : les jumelles orbitent, une
position de scène au repos ne vaut plus rien dès la première seconde.

## Lot 2 — la mort là où le jeu la met, et la réparation

Le portage décidait de la mort par des seuils à lui. Le build pose **six
`DestructionVolume`**, et la cause est un champ du volume :

| | `_deathType` | portée |
|---|---|---|
| `JawsOfDestruction` ×4 | 0 (`Default`) | joueur et vaisseau seulement |
| `DestructionVolume` ×2 | 3 (`Energy`) | tout ce qui entre, sonde comprise |

`_onlyAffectsPlayerAndShip` est ce qui sépare les deux. Le seuil analytique du
portage — la distance à l'étoile — reste le filet de sécurité.

**L'énumération, enfin lue.** `death.js` disait honnêtement ne pas connaître les
valeurs de `DeathType` et porter des causes « que CE portage sait produire ».
Elles sont dans l'assembly et elles sont cinq : `Default`, `Impact`,
`Asphyxiation`, `Energy`, `Supernova`. Les six causes du portage y retombent
sans reste.

**La réparation** n'est pas un volume qu'on traverse mais une interaction qu'on
maintient : `fraction += dt / _secondsToRepair`, bornée à 1, et **relâcher
n'annule pas l'avancement**. Dix-huit volumes, quinze à portée 3 et trois à
portée 5 ; `_secondsToRepair` n'est sérialisé sur aucune instance, les trois
secondes viennent donc du constructeur, et c'est ce repli-là que l'invariant
garde.

> Le premier compte écrit ici était faux — dix-sept à portée 3, un à portée 5 —
> parce qu'il venait d'un relevé tronqué à l'écran. **L'invariant de `tests/05`
> l'a refusé avant le commit.** C'est le troisième cas de la série, après le
> brouillard gris et les niveaux de détail : ce qu'on croit avoir lu et ce que
> le build dit sont deux choses.

Le portage n'ayant pas d'intérieur de vaisseau, les dix-huit volumes se ramènent
à une réparation depuis le poste de pilotage, une pièce à la fois, au rythme du
build. C'est un choix, et il est dit dans le code.

## Lot 3 — l'ambiance joue par couches, pas par proximité

Dix-sept volumes — quatorze `AudioVolume`, trois `DayNightAudioVolume` — dont
rien ne lisait ni la forme, ni le clip, ni la priorité.
[`43`](43-pnj-son-decollage.md) les avait relevés et laissés ouverts.

**Le point de la mécanique n'est pas la proximité, c'est l'arbitrage.** Chaque
volume porte une couche et une priorité. Dans une couche, une seule zone joue :
la plus prioritaire parmi celles qui contiennent l'auditeur ; les autres se
taisent en fondu. Les couches, elles, jouent ensemble — c'est ce qui superpose
une musique de village à l'ambiance de son atmosphère.

| couche | ce qu'on y trouve |
|---|---|
| 0 | les intérieurs : `Hatch` et `MusicVolume` à 100, les grottes et le musée à 2 |
| 1 | le dehors : `Atmosphere` à 0, les cavernes à 1, `DeepFluid` à 3, l'océan à 1 |
| 2 | la musique de lieu : `AncientMusic`, `VillageMusic`, `MusicVolume` |

Trois mesures qui ne se devinaient pas, et **les deux premières ont été prises à
l'envers avant de l'être à l'endroit** :

1. **le clip est visé par `_clip`**, et l'`AudioSource` posée sur le même objet
   est sérialisée *sans* clip — c'est le volume qui le lui pose à l'exécution.
   Les apparier par GameObject rendait les dix-sept zones muettes, et la
   première mesure l'a montré d'un coup : dix-sept lignes « clip NON » ;
2. **la forme n'est pas sur l'objet de la zone** mais sur ses enfants, qui
   portent les `EntrywayTrigger` auxquels elle s'abonne. Six zones sur dix-sept
   n'avaient donc aucune portée — voilà à quoi servent les 18 `EntrywayTrigger`
   du recensement ;
3. **les priorités ne sont pas uniques dans une couche** : cinq zones de la
   couche 1 sont à 0. À égalité, la plus petite zone gagne — une pièce est plus
   précise qu'une atmosphère, et c'est la seule règle qui donne un résultat
   stable.

L'export des clips est sorti de la boucle des sources pour servir aussi aux
zones. **Le compte passe de 36 à 48 clips** — 23 Ogg, 25 WAV — et le chiffre
bouge partout où il était écrit, README compris.

Ce que le build ne donne pas : la **forme** du fondu (la durée, oui : 2 s
partout, 5 s pour la musique du village). Il est linéaire, et c'est dit comme
tel. Ni le sens de `_dayWindow`, qui vaut 200 sur les trois volumes jour/nuit :
il est extrait et gardé, pas interprété — le portage lui préfère son propre
signal de nuit, qui vient de la hauteur du soleil.

## Ce que les trois lots laissent

| | avant | après |
|---|---|---|
| classes sans aucun lecteur | 117 | **109** |
| instances | 485 | **413** |

Ce qui reste est trié par famille dans [`44`](44-reste-a-migrer.md), qui a été
réécrite sur ces chiffres-ci.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : les deux lois du
sable et leurs bornes, l'entonnoir et sa forme fermée, les cinq valeurs de
`DeathType` et leur correspondance, la sonde qui traverse ce que les mâchoires
arrêtent, la réparation qui garde son avancement au relâchement, l'arbitrage par
couche et par priorité, le départage à égalité, les fondus et le changement de
zone dans une couche.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : les deux
colonnes de sable nommées avec leurs quatre nombres et le refus du repli du
constructeur, l'entonnoir et sa fenêtre, six volumes de destruction dont quatre
mâchoires et deux causes distinctes, dix-huit volumes de réparation en 15/3, et
les 48 clips en 23 Ogg et 25 WAV.

## La leçon, d'un cran encore

La série en avait déjà trois :

> avant de conclure qu'une chose manque au build, vérifier qu'on la lit
> ([`34`](34-actions.md)) — avant de conclure qu'on la lit, la mesurer
> ([`36`](36-audit.md)) — avant de conclure qu'on la joue, la jouer
> ([`43`](43-pnj-son-decollage.md)).

Celle-ci en ajoute une quatrième, et c'est la plus bête : **avant de chercher ce
qui manque, demander la liste.** Le sable des jumelles n'a jamais été « oublié »
— il n'a jamais été *cherché*, parce qu'aucune note ne l'avait nommé. Une
méthode qui part des notes ne trouve que ce que les notes contiennent.
