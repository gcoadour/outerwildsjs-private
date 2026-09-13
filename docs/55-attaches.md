# Ce qui suit un autre corps, ce qui clignote — et la fin de la queue

Six classes, trente-cinq instances, et deux d'entre elles touchent à la
**physique**. Puis le compte, qui vaut d'être regardé en face.

> **Corrigé par [`68`](68-lois.md).** Cette page décrit six lois comme portées,
> et elles l'étaient — écrites, éprouvées, documentées. Elles ne
> *s'exécutaient* pas : `web/src/attachments.js` n'était importé par **aucun**
> module du moteur, et personne ne s'en est aperçu pendant treize pages parce
> que quarante vérifications vertes ont l'air d'une preuve de vie. Le module
> est branché depuis [`68`](68-lois.md) ; ce qui suit se lit comme il a été
> écrit, sauf que rien de tout cela n'arrivait à l'écran avant.

## Le haut d'une méduse n'est pas donné par la gravité

`AlignWithTargetBody` ×14 :

```
direction = centreDeMasse(cible) − centreDeMasse(moi)
CheckAlignmentRequirements() → true, toujours
```

Quatorze objets s'alignent ainsi — les méduses de Giant's Deep, les deux
jumelles sur leur point focal, l'île qui orbite, le satellite, la comète. Ce
n'est pas le champ dominant qui décide de leur haut, c'est **un corps désigné**,
et sans aucune condition.

`FieldInheritor` ×9 fait le pendant côté force : `FixedUpdate` tient en une
ligne — `rigidbody.AddAcceleration(héritée)` — et l'accélération héritée est
celle que ressent un détecteur **posé ailleurs**. Les méduses, les deux
jumelles, l'entonnoir de sable et le satellite cassé ne tombent pas vers ce qui
est sous eux : ils tombent **avec leur porteur**.

Dans ce portage, l'essentiel de ce décor est un **enfant** du glTF de son corps
et hérite du mouvement par la hiérarchie — c'est le même constat que pour
`AttachOnAwake` ([`46`](46-migration-lots.md), lot 1). Les deux lois sont posées
et gardées quand même, parce que ce qui bouge seul ne passe pas par la
hiérarchie.

## Deux clignotants qui ne battent pas au même rythme

`_onSeconds` et `_offSeconds` valent 1 dans le constructeur. Les **deux**
instances les sérialisent, et pas à la même valeur :

| | allumé | éteint |
|---|---|---|
| `UpdateIcon` (sur le vaisseau) | 1 s | 1 s |
| `ComputerUpdated` (sur le joueur) | 1 s | **0,5 s** |

Un clignotement plus rapide dit quelque chose de plus urgent, et les deux ne
disent pas la même chose. C'est le genre de détail qu'on écrase en posant une
constante.

`_duration` vaut −1 sur les deux : elles clignotent sans fin. Le mécanisme de
durée finie existe, et l'invariant garde qu'aucune ne s'en sert.

> **Le build teste le temps écoulé depuis la dernière bascule**, pas une phase.
> Deux clignotants allumés à des instants différents ne se synchronisent donc
> jamais — ce qui est plus vivant, et gratuit.

## La réparation se voit

`BrokenNode.OnCompleteRepair` échange le matériau du nœud contre
`_repairedMaterial`. Les trois nœuds du satellite cassé réparent tous vers le
même : **`GreenSelfIllumMat`**, un vert auto-illuminé.

`ZeroGTrainingManager` comptait déjà les trois ([`46`](46-migration-lots.md),
lot 7). Ce qui manquait est la **trace visible** : jusqu'ici, réparer un nœud ne
changeait rien à sa tête, et seul un message disait que c'était fait.

## Ce que le build ne contient pas non plus

`WaterEffectVolume` porte trois champs de préfabriqué — grand, moyen, petit — et
n'en choisit un qu'à l'entrée. Mesure faite : **les trois pointeurs ne sont
résolus par rien** dans le build. C'est le même cas que `_probePrefab` et
`_vanishEffectPrefab` ([`08`](08-reste-a-faire.md) §1).

Il n'y a donc rien à porter, et c'est le **build** qui le dit — pas le portage
qui renonce. L'invariant garde ce vide, pour que personne ne les cherche.

## Le compte, en face

| | instances |
|---|---|
| posées dans `level0` | **1 390** |
| lues par le moteur | 1 167 |
| lues par un motif | 164 |
| **lues, en tout** | **1 331 — 95,8 %** |
| extraites, non lues | 28 |
| sans aucun lecteur | 31 |

Les **59 instances** qui restent, regardées une par une :

| | n | ce que c'est |
|---|---|---|
| outils de studio | 7 | `DebugBreakAllChildren` ×2, `DebugHUD`, `DebugInputManager`, `LoadTimeTracker`, `TapeMeasure`, `ResetSimulationTrigger` — [`44`](44-reste-a-migrer.md) §9 les nommait déjà « pour que personne n'y passe une heure » |
| mise en page | 6 | `MinimapHUD`, `ObservatoryMap`, `MapOpenGL`, `CustomAspectRatio` ×3, `HUDCameraScript` — le portage a ses propres dispositions ([`52`](52-casque.md) dit lesquelles, et pourquoi) |
| impostures de planète | 5 | `LODCameraSnapshot` — ouvert, et assumé depuis [`36`](36-audit.md) §2.8 |
| tenseur d'inertie | 14 | `InertiaTensorCalibrator` — ce portage n'en a pas ([`49`](49-queue.md)) |
| déclencheurs relais | 5 | `ChildTriggerVolume` ×4, `CompoundTriggerVolume` — ils **transmettent** les événements d'un collider enfant ; le portage lit directement le volume de l'enfant |
| le reste | 22 | une instance chacun |

Le reste, c'est la queue de la queue : `AncientProbeController`,
`CenterOfTheUniverse`, `Locator`, `InputInitializer`, `ReferenceFrameTracker`,
`TimeLoopTeleportReceiver`, `PlayerSpawner`, `PlayerJetpackController`,
`AlignPlayerWithField`, `SandstormVolume`, `SettingsMenuTrigger`,
`BreakableFragment`, `Detonator`, `DrawSoundWave`, et quatre comportements de
particules.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : la direction
d'alignement, normalisée, et le haut par défaut quand les deux centres se
confondent ; les champs hérités qui s'additionnent, y compris avec un champ nul ;
les deux rythmes de clignotement, celui du constructeur qui n'est ni l'un ni
l'autre, la bascule au bout de chaque demi-cycle, et la durée finie qui finit
par arrêter ; le matériau de réparation ; les trois tailles d'éclaboussure, et
qu'**aucune** n'est résolue.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : quatorze
alignements, tous avec une cible ; neuf héritiers de champ ; deux clignotants,
de rythmes **différents**, aucun à durée finie ; trois nœuds, tous sur le
satellite cassé, tous vers le même vert ; une trappe ; un volume
d'éclaboussure dont aucun des trois préfabriqués n'est résolu.

## La leçon

> « extrait » n'est pas « lu », trois fois de suite ([`54`](54-lumiere.md)) — et
> **une constante qui se répète n'est pas forcément une constante**.

`_onSeconds` et `_offSeconds` valent 1 dans le constructeur, et 1 sur la
première instance. Rien n'invitait à regarder la seconde. Elle bat à 0,5, parce
qu'elle dit autre chose.

C'est le pendant exact de la leçon de [`51`](51-tour.md) : là-bas, la scène
contredisait le constructeur ; ici, elle le contredit **sur une instance et pas
sur l'autre**. Lire la première et généraliser aurait donné un portage où les
deux voyants disent la même chose.
