# Ce qu'on tient dans la main

[`63-boucles.md`](63-boucles.md) s'est arrêté sur une phrase qui demandait une
suite :

> `MarshmallowStick` est **un objet tenu en main, animé, que le portage n'a
> pas**. […] C'est le genre d'entrée qu'on préfère : une chose absente **dont
> on connaît l'adresse**.

L'adresse était bonne. Deux objets pendent sous `PlayerCamera` et n'étaient
portés ni l'un ni l'autre, pour une raison purement mécanique : **l'export glTF
part des corps célestes** (`findRoots`), et une main n'en est pas un.

```
Player_Body / PlayerCamera
  MarshmallowStick   [Animation, MarshmallowStick]        4 clips
    stick_root / Needle                                    l'aiguille
    StickAndTherm / polySurface1..4                        le bâton
    MallowLight, ThermLight                                deux lumières
    Marshmallow  [Marshmallow]                             la guimauve
      Flame            [ParticleSystem]
      HeatDetector     [RadiationDetector]
      MarshmallowModel [MeshFilter]
  TelescopeGUI  [TelescopeGUI]
    telescopeBody, telescopeGlass
```

## Le thermomètre est une pose d'animation

C'est la trouvaille de ce lot, et elle explique le quatrième clip.

```
animation["Therm"].time  = _marshmallow.GetHeatLevel() / 40f
animation["Therm"].speed = 0
animation.Blend("Therm", 100f)
```

`Therm` ne se **joue** pas : on lui met une vitesse de zéro, on choisit son
instant à la main, et on le mélange à poids plein. L'aiguille du thermomètre
n'est pas un widget, c'est **une image d'animation choisie par la chaleur** —
quarante unités parcourent le clip entier, et au-delà on reste sur la dernière
pose, ce qui est exactement le comportement d'un clip en `WrapMode.Once`.

Le portage fait la même chose avec l'API de Babylon : `play`, `pause`,
`goToFrame`. Ce n'est pas une transposition littérale, c'est la même phrase dans
une autre langue, et le commentaire le dit.

## Le bâton sort tout seul, et se range tout seul

`Awake` met **deux clips à la queue** — `PullOut` puis `idle` : le bâton est
dehors dès la première image du jeu, il sort, puis il attend.

`ToggleStick` fait le reste :

| | ce qui se passe |
|---|---|
| sortir | flamme cachée, `PullOut`, thermomètre armé, **les deux lumières s'allument** |
| ranger | lumières éteintes, thermomètre coupé, guimauve **remise à neuf**, `PutBack` |

Et `Update` porte la ligne qu'on n'aurait pas devinée : **manger range le
bâton**. Pas de commande, pas de délai — la guimauve mangée, le bâton s'en va.

## Ce que le portage gagne

| avant | après |
|---|---|
| la guimauve était un pourcentage dans le bandeau d'état | le bâton est **dans la main**, avec son aiguille, sa flamme et ses deux lumières |
| la lunette était un champ de vision | elle a **un corps et un verre** |
| quatre clips du build n'étaient exportés par rien | ils le sont, et trois se jouent |

La touche `V` sort et range le bâton. Le build n'a **pas** de canal pour
`ToggleStick` — c'est le tutoriel du feu de camp qui l'appelle, et le tutoriel
n'est pas porté — donc cette touche est du portage, et `AJOUTS` la nomme avec
les quatre autres ([`61`](61-commandes.md)).

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 248** vérifications (+25) |
| sur le build | **360** vérifications (+11) |
| en navigateur, avec le build | **140** contrôles (+9) |

Les neuf contrôles neufs du navigateur mesurent ce qu'aucun test sans navigateur
ne peut voir : que les deux objets **arrivent** — chargés, avec leurs quatre
clips, leurs deux lumières et leur géométrie — et que `V` les range et les
ressort. Les vingt-cinq autres gardent la loi : quarante unités de chaleur d'un
bout à l'autre du clip, l'aiguille qui bute au lieu de déborder, le bâton dehors
au premier instant, et manger qui range.

## Et le recensement s'est menti, une troisième fois

Après ce lot, `scripts/recensement.mjs` a annoncé **zéro classe sans lecteur** —
100 %, du jour au lendemain, sans qu'une ligne de moteur ait été écrite pour les
quinze qui restaient.

La cause était dans ce lot même. `geometry.js` lit les marqueurs d'un nom de
clip par `/^[~!]*/` — un motif qui réussit sur **n'importe quelle** chaîne, y
compris vide. Le recensement compte comme lecteur tout motif du moteur qui
reconnaît un nom de classe ; celui-là les reconnaissait tous.

> C'est exactement la faute de [`47`](47-effets-image.md) — un commentaire n'est
> pas un lecteur — et de [`50`](50-regard.md) — une traduction n'est pas une
> absence. Commise une troisième fois, par **l'outil**, et **en sa faveur**.

Le garde est simple, et il tient en une ligne : un motif qui reconnaît la chaîne
vide, ou un nom de classe qui n'existe pas, n'est pas un lecteur. Le compte
honnête, après :

| | classes | instances |
|---|---|---|
| posées, tous fichiers | 295 | 1 451 |
| **lues** | **276** | **1 414 — 97,5 %** |
| extraites, non lues | 5 | 20 |
| sans aucun lecteur | 14 | 17 |

## La leçon

> Une chose absente dont on connaît l'adresse se porte en une séance. Une chose
> absente dont personne n'a cherché l'adresse reste absente indéfiniment.
>
> Et : **un chiffre qui s'améliore tout seul est un chiffre qui a cassé.**

Ce lot n'a rien découvert : [`63`](63-boucles.md) avait déjà écrit le chemin
complet, `Player_Body / PlayerCamera / MarshmallowStick`, et nommé les quatre
clips. Il a suffi de le suivre. Ce qui coûte, dans ce portage, ce n'est jamais
d'écrire le code — c'est de **savoir où regarder**, et chaque page qui note une
adresse précise en épargne une autre.
