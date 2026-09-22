# Le seuil ne vient pas de la scène, il vient du réveil — et il n'y a pas d'intégrité de coque

Deux erreurs dans le même système, et elles se tenaient l'une l'autre.

## 1. `Awake` écrase le seuil sérialisé

```
ShipDamageController.Awake()
    foreach (ShipComponent c in _components)
        c.SetImpactThreshold(_mediumImpactThreshold + _genericPartImpactModifier);
    foreach (ShipComponent c in _components)
        if (c.GetType() == typeof(EngineComponent)) {
            c.SetImpactThreshold(_mediumImpactThreshold + _enginePartImpactModifier);
            ((EngineComponent)c).ToggleEngineDamage(_disableDamagedThrusters);
        }
```

`SetImpactThreshold` **écrit** le champ. Les dix `EngineComponent` portent
`_impactThreshold = 0` dans la scène, et cette valeur ne survit pas au réveil :
tout composant du vaisseau repart à `_mediumImpactThreshold + modificateur`,
soit **trente**.

Le portage lisait le zéro sérialisé. Il en concluait — et l'écrivait en
commentaire — que *« n'importe quel choc abîme le réacteur le plus proche »*.
Deux conséquences de jeu :

- **un choc sous trente unités par seconde n'abîme aucune pièce.** Le portage
  abîmait au moindre contact ;
- **le seuil entre deux fois dans la force.** À cinquante unités par seconde, la
  pièce prend 7,4 au lieu de 16,7 :
  `force = 100 × (|v| − seuil) / (mortInstantanée − seuil)`.

Le même commentaire affirmait que `_genericPartImpactModifier` et
`_enginePartImpactModifier` *« restent nuls, et ceux-là pour de bon, qu'aucune
méthode de la classe n'emploie »*. `Awake` les emploie — c'est même tout ce
qu'ils font. Ils sont nuls, donc réacteurs et pièces génériques partagent le
même seuil dans ce build ; la distinction existe et ne se voit pas, et elle est
portée quand même.

## 2. Il n'y a pas d'intégrité de coque

Le portage tenait un second compteur de santé, alimenté par une courbe à lui :

```js
const t = (speed - DAMAGE.light) / (DAMAGE.instantDeath - DAMAGE.light);
const severity = speed >= DAMAGE.medium ? 1 : 0.4;
return Math.min(DAMAGE.total, DAMAGE.total * t * severity * 3);
```

`ShipDamageController` ne porte **aucun champ de santé de coque**. Il explose sur
deux conditions, et deux seulement :

```
if (_instantDeathSpeed <= |velocity|)            ExplodeShip();
if (Abs(_currentShipDamage) > _shipTotalHealth)  ExplodeShip();
```

`_currentShipDamage` est le **cumul** des `_totalDamage` des pièces, recalculé
par `RecalculateShipDamge`. L'intégrité du vaisseau est donc une **soustraction**
— ce qu'il lui reste avant le cumul fatal —, pas un compteur séparé.

### Et `_lightImpactThreshold` / `_mediumImpactThreshold` ?

Ce sont les seuils du **bruit**. Leur seul emploi dans `OnImpact` est de choisir
entre `_lightImpactClip` et `_mediumImpactClip` :

```
if (|v| >= _mediumImpactThreshold)     ... _mediumImpactClip ...
else if (|v| >= _lightImpactThreshold) ... _lightImpactClip ...
```

Les prendre pour des seuils de **dégâts** est l'erreur d'où la courbe inventée
est née. `impact()` rend maintenant un niveau de bruit de 0 à 2, ce qu'ils
disent.

### Ce que l'invention cachait

La courbe faisait mourir la coque **avant** qu'aucune pièce n'atteigne zéro
intégrité : à toute vitesse qui abîme une pièce, elle infligeait assez de dégâts
de coque pour détruire le vaisseau en quatre ou cinq chocs.

`_disableDamagedThrusters` ne pouvait donc **jamais** couper un propulseur —
pas parce que le drapeau est faux dans ce build, mais parce que la condition
qu'il attend était inatteignable. Le mécanisme était porté, testé, et mort.

> Deux erreurs qui se tenaient : un seuil lu trop bas faisait abîmer les pièces
> trop tôt, et une santé inventée tuait le vaisseau avant qu'une pièce ne cède.
> Chacune rendait l'autre invisible.

Une troisième confusion tombait du même arbre : `this.total`, l'intégrité d'une
**pièce** (100, sérialisée sur chacun des dix `EngineComponent`), avait été
confondue avec `_shipTotalHealth`, qui borne le **cumul**. Des pièces
increvables en sortaient dès qu'on donnait au vaisseau une grande santé.

## Ce qui reste nommé et non porté

`OnImpact` a une branche que ce portage n'a pas : quand **trois pièces sont déjà
abîmées**, la force ne suit plus la formule — elle vaut `velocity / n`, la
vitesse brute divisée par le nombre de pièces concernées, appliquée à chacune.
Un choc à quarante réparti sur trois pièces leur inflige donc 13,3 chacune, bien
plus que les 3,7 de la branche ordinaire. Le portage, lui, ne fait plus de
nouvelle victime au-delà de trois et n'aggrave que la pièce touchée.

C'est écrit ici plutôt que passé sous silence.

## Gardé par

- `tests/09-jeu.mjs` — le seuil du réveil et son déplacement par un
  modificateur, le choc sous trente qui n'abîme rien, la force à quarante
  (3,70), les trois niveaux de bruit, les quatre chocs à cent qui **tuent une
  pièce sans détruire le vaisseau** — ce que la courbe inventée rendait
  impossible —, le propulseur coupé, et le cumul fatal avec l'intégrité qui
  tombe à zéro avec lui.
