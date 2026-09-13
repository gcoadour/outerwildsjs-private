# Ce que le jeu annonce — et l'allumage du vaisseau

Le recensement des classes est fermé : douze restent sans lecteur, toutes des
outils de studio ([`65`](65-onde.md)). Il ne dit plus rien d'utile, et il ne
disait de toute façon qu'une chose : **ce que le build installe**. Pas ce qu'il
*fait*.

Une classe peut être lue et son comportement à moitié porté sans qu'aucun compte
ne bouge. Il fallait un autre dénominateur.

## Les événements, l'autre bout

`GlobalMessenger` tisse tout le jeu. Entrer dans un secteur, s'asseoir au poste
de pilotage, allumer la lampe, manger une guimauve, faire exploser le soleil :
chaque fois, une **chaîne**.

```
OW_BUILD=… node scripts/evenements.mjs
```

| | |
|---|---|
| événements du build | **124** |
| nommés quelque part dans `web/src/` | **31** |
| non nommés | **93** |

`scripts/evenements.mjs` est le quatrième outil du dépôt, à côté de
`recensement`, `il` et `composants`. Il lit l'IL de toutes les assemblies, prend
chaque `ldstr` suivi d'un `FireEvent` ou d'un `AddListener`, et compare à ce que
le portage nomme.

> **Ce que ce compte ne dit pas.** Un événement non nommé n'est pas un
> comportement absent : `SettingsMenuTrigger` faisait exactement ce que le build
> fait sans qu'aucune de ses chaînes n'apparaisse ([`65`](65-onde.md)). Les 93
> sont une liste de **pistes**, comme le recensement en a été une. Elle se lit
> une par une, pas en pourcentage — et la première lue en a donné une bonne.

## L'allumage

`ShipThrusterController.ReadTranslationalInput` porte trois de ces événements —
`StartShipIgnition`, `CancelShipIgnition`, `CompleteShipIgnition` — et derrière
eux, une mécanique que le portage n'avait pas du tout.

```
si le vaisseau est POSÉ :
    poussée latérale  →  zéro          (on ne glisse pas sur la piste)
    poussée verticale →  clamp01       (on ne s'enfonce pas dedans)

    pas encore allumé, et on pousse  →  allumage, StartShipIgnition
    allumé :
        on relâche                   →  CancelShipIgnition, et rien
        avant _ignitionDuration      →  poussée = ZÉRO
        après                        →  CompleteShipIgnition, et ça pousse
```

`_ignitionDuration` vaut **1 seconde**, et elle est dans le constructeur — pas
sur l'instance, que `composants.mjs` rend vide. Encore un cas où la scène ne dit
rien de ce que le code fait ([`60`](60-sonde.md)).

**Un vaisseau posé ne décolle donc pas à l'appui : il s'allume.** Une seconde de
poussée tenue avant que quoi que ce soit ne bouge, et relâcher avant la fin
annule tout — il faut recommencer depuis zéro.

Le portage décollait à l'instant. C'est une seconde de différence, et c'est
toute la différence : une seconde, c'est le temps de lever les yeux du sol vers
ce qu'on va quitter. Le décollage d'Outer Wilds a un poids, et il vient de là.

## Deux choses mesurées au passage, déjà justes

En lisant la même méthode :

- **la limite de poussée par secteur.** `min(secteur.thrustLimit, pousséeMax) /
  pousséeMax` met tout l'axe à l'échelle. Le portage le fait déjà
  (`ship.thrustLimit`), et un seul secteur du build en porte une :
  `Sector_QuantumMoon`, à **20**. Approcher la lune quantique bride le vaisseau.
- **le limiteur de vitesse orbitale** en mode atterrissage : il projette la
  vitesse relative au référentiel d'atterrissage hors de l'axe vertical et la
  borne. Le portage ne l'a pas ; il est noté ici plutôt qu'oublié.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 280** vérifications (+15) |
| sur le build | 360 vérifications |
| en navigateur, avec le build | **152** contrôles (+6) |
| en navigateur, sans le build | 13 contrôles |

Les six contrôles neufs mesurent l'état du modèle dans le navigateur — l'appui
qui ne pousse pas, la seconde qui passe, la poussée qui vient — plutôt qu'un vol
réel : faire décoller le vaisseau demanderait d'y monter, et le temps simulé
d'une image plafonne à 0,05 s ([`64`](64-mains.md)).

## La leçon

> Un dénominateur épuisé n'est pas une fin, c'est le signe qu'il faut en
> chercher un autre.

Le recensement des classes a servi neuf pages, de [`45`](45-recensement-mesure.md)
à [`65`](65-onde.md), et il est arrivé au bout de ce qu'il pouvait montrer. Les
événements en ouvrent un autre, plus proche de la question qu'on pose vraiment :
**le jeu fait-il les mêmes choses ?** Et ils en ouvriront un troisième quand ils
seront épuisés à leur tour.
