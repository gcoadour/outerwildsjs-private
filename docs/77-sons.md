# Les huit sons que l'interface ne faisait pas

124 annonces, 21 nommées après [`76`](76-proximite.md). Cette page en nomme
huit d'un coup, et elles partagent un écouteur : `UIAudioController`.

```
AdvanceText              _advanceTextClip
ExitDialogueMode         _finishTextClip
PlayAffirmativeUISound   _affirmative01
PlayNegativeUISound      _negative01
PlaySuitWarningSound     _jetpackWarning
TargetReferenceFrame     _targetReferenceFrame
UntargetReferenceFrame   _untargetReferenceFrame
TurnOnFlashlight  }
TurnOffFlashlight }      _switch01
```

Tous joués en `PlayOneShot(clip, 0.5)` — **le même demi-volume partout**, ce qui
est une décision et pas un hasard : ces sons ne doivent jamais couvrir le monde.

Le portage n'en jouait **aucun**. Avancer un dialogue, le finir, viser un
référentiel, le relâcher, allumer sa lampe : tout cela se faisait en silence.

> Le silence d'une interface se remarque moins qu'un son manquant dans le
> monde. C'est pour cela que ce lot arrive tard — rien ne *sonnait* faux, il n'y
> avait simplement rien.

## Deux détails que la table dit toute seule

**La lampe partage un clip dans les deux sens.** `_switch01` sur l'allumage et
sur l'extinction : un interrupteur fait le même bruit à l'aller et au retour.

**Viser et lâcher n'en partagent pas.** `_targetReferenceFrame` et
`_untargetReferenceFrame` sont deux clips distincts — verrouiller une cible et
la relâcher ne s'entendent pas pareil. Pareil pour le dialogue : avancer
**clique**, finir a son propre son.

Ce sont trois lignes de champs, et elles disent où le jeu a décidé que la
différence valait un enregistrement.

## On ne répare pas pareil dans le vide

```
OnStartRepairing:   clip = oxygène ? _repairLoop    : _spaceRepairLoop
                    FadeIn(0.2)
OnStopRepairing:    FadeOut(0.2)
OnFinishRepairing:  Stop(), puis oxygène ? _repairFinish : _spaceRepairFinish
```

`RepairAudioController` interroge le **détecteur d'oxygène** pour choisir son
clip. Réparer sa coque en apesanteur, sans air, ne fait pas le même bruit que la
réparer posée au village — et le build a enregistré les deux, pour la boucle
**et** pour la fin.

La boucle **monte** en deux dixièmes de seconde et redescend de même ; la fin,
elle, l'arrête net et la remplace par un coup.

Et les deux clips se nomment eux-mêmes :

```
à l'air    ShipRepair_2254.wav
dans le vide  ShipRepair_LowPass_2220.wav
```

Le son du vide est **le même passé au filtre passe-bas**. Sans air pour porter
les aigus, on entend la réparation par la coque — et le studio l'a produit en
filtrant l'autre plutôt qu'en le rejouant.

## Le plein d'oxygène s'entend

`SpacesuitAudioController.OnRefillOxygen` joue `_refillOxygenClip`, à plein
volume — le seul de ce lot qui ne soit pas à moitié. Se remplir en oxygène n'est
pas une confirmation d'interface, c'est un événement.

Il ne se joue qu'**une fois par remplissage**, pas à chaque image passée dans la
zone.

## La zone morte temporelle, une quatrième fois

`RepairAudioController` interroge le détecteur d'oxygène — et la réparation a
lieu, dans cette boucle, **avant** le bloc qui calculait la zone d'oxygène.
Lire `zone` de là aurait levé.

La zone se calcule maintenant une fois, en haut, et le bloc d'en dessous la
réutilise. C'est la quatrième fois dans ce dépôt ([`56`](56-impostures.md),
[`62`](62-visee.md), [`73`](73-passages.md), ici), et la règle ne change pas :

> Un `const` est déclaré avec ce qu'il décrit. Quand deux endroits en ont
> besoin, c'est le **premier** qui le déclare, pas le plus bavard.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 632** vérifications (+24) |
| sur le build | 388 vérifications |
| en navigateur, avec le build | **243** contrôles (+6) |
| en navigateur, sans le build | 13 contrôles |
| annonces nommées | 21 → **32** |

## La leçon

> Ce qui manque en silence manque plus longtemps.

Les dénominateurs de ce dépôt ont tous trouvé des choses **visibles** — une
classe posée, une loi écrite, un import. Celui des annonces trouve autre chose :
des choses qui ne laissent **aucune trace** quand elles manquent. Huit sons, et
rien dans le code ne disait qu'ils devraient exister.
