# Les quatre modules de particules — et un compte qui disait « jamais »

`docs/08-reste-a-faire.md` portait cette dette depuis
[`10-particules.md`](10-particules.md) :

> **Quatre modules de particules** employés par le build et non extraits —
> `VelocityModule`, `ClampVelocityModule`, `RotationBySpeedModule` (1 chacun) et
> `SubModule` (2). Les six autres sont employés **zéro** fois : rien à y gagner.

Et l'extracteur, lui, écrivait ceci :

```js
// Mesure d'usage sur les systemes du build : ColorModule et SizeModule
// dominent, RotationModule et UVModule suivent, et force, collision, vitesse
// par vitesse et sous-emetteurs ne servent JAMAIS.
```

Les deux ne pouvaient pas avoir raison ensemble. Le compte refait :

```
InitialModule 135   ShapeModule 133   EmissionModule 133   ColorModule 110
SizeModule 80       RotationModule 28   UVModule 13
VelocityModule 1    ClampVelocityModule 1   RotationBySpeedModule 1   SubModule 2
```

C'est la page qui avait raison. Quatre systèmes sur 135 — mais quatre systèmes
qu'on voit.

## Ce que chacun fait, et où

| module | système | ce qu'il fait |
|---|---|---|
| `VelocityModule` | `CometTrail` | vitesse constante **(0, 0, 100)** en repère local |
| `ClampVelocityModule` | `Explosion_Fiery_Med` | plafond **100**, amortissement **1** |
| `RotationBySpeedModule` | `DissapatingParticles` | **20 °/s** sur une plage de vitesse 0 à 1 |
| `SubModule` | `DissapatingParticles` | **1** sous-émetteur |
| `SubModule` | `DistantStars` | **0** sous-émetteur — allumé, et vide |

La queue de la comète part en arrière à **cent unités par seconde** : c'est
exactement ce qui en fait une queue plutôt qu'un halo. Le portage l'affichait
comme un halo.

> **`scalar` est en radians.** `RotationBySpeedModule` porte `0,3490658…`, ce qui
> est **vingt degrés**. Le transporter tel quel aurait donné une rotation
> cinquante-sept fois trop lente — assez lente pour passer pour « pas de
> rotation », et donc pour ne jamais être remarquée.

> **Et un module allumé qui ne fait rien.** Le `SubModule` de `DistantStars` est
> actif et ses **six** pointeurs de sous-émetteur sont nuls. C'est le quatrième
> morceau de code mort relevé dans ce build, après `_currentSkyAlpha`,
> `_startAlpha` des nuages et les modificateurs de dégâts. L'invariant garde ce
> zéro.

## Ce qui est porté, et ce qui est approché

Babylon n'a pas ces modules. Les trois vivants sont rendus par ce qu'il a :

- **vitesse constante** → `direction1/2` et la puissance d'émission ;
- **plafond** → `maxEmitPower` borné, plus `addLimitVelocityGradient` et
  `limitVelocityDamping` ;
- **rotation par vitesse** → ajoutée à la vitesse angulaire du `RotationModule`.
  Babylon n'a pas de rotation **fonction de la vitesse** : c'est une
  approximation, et elle est dite.

## Invariants posés

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : une vitesse
constante, sur la comète, qui part en arrière à cent ; un plafond de vitesse,
sur l'explosion, à cent et amortissement total ; une rotation par vitesse, de
**vingt degrés** par seconde (et non 0,349) ; deux modules de sous-émetteurs,
dont **un entièrement vide**.

## La leçon

> une décision d'architecture n'exempte pas de regarder
> ([`56`](56-impostures.md)) — et **« jamais » est un chiffre, donc il se
> mesure**.

`docs/08` disait « quatre usages » et l'extracteur disait « jamais », dans le
même dépôt, à propos des mêmes octets. Aucun des deux n'avait tort de bonne foi ;
l'un des deux avait simplement compté, et l'autre avait résumé. Un commentaire
qui affirme un compte devrait dire d'où il vient — et le meilleur endroit d'où
le faire venir est un invariant.
