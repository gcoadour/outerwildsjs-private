# Ce qui est solide, et ce qu'on traversait sans le savoir

Le portage construisait un collider trimesh pour **chaque maillage rendu** du
corps ancré. C'était un raccourci commode, et il paraissait sans risque : si
c'est visible, c'est là, donc c'est solide.

Le build dit autre chose. Dans `level0` :

| mesure | valeur |
|---|---|
| objets portant un maillage | 2 219 |
| objets portant un collider **obstacle** | 1 691 |
| colliders **déclencheurs** (`m_IsTrigger`) | 194 |
| objets à maillage **sans** obstacle | **747** (34 %) |

Un tiers de ce qui se voit ne se heurte pas. Et ce tiers n'est pas un reliquat :
ce sont les 79 branches, les 40 symboles flottants, les 39 cristaux, les 30
décalcomanies, les 28 torchères, les 24 **nuages** de Timber Hearth, les
billboards, les lampes — et la voûte céleste.

## Le symptôme que cela explique

[`07-gameplay.md`](07-gameplay.md) notait, sans l'expliquer, que *« le joueur se
stabilise à 249 u du centre alors que les points d'apparition sont à
131–168 »*. [`38-depart.md`](38-depart.md) a repris l'observation et l'a
attribuée à *« ce qui dépasse — les `PieceOfRing` sont à 218–238 »*.

Les deux pointaient le bon endroit et la mauvaise cause. Les `PieceOfRing` **sont
les nuages**, et ce sur quoi le joueur se posait à 249 u est la voûte elle-même :

> `SkyShell`, sphère de collision de rayon **250,749** centrée sur Timber Hearth.

Le joueur lâché quarante unités au-dessus du sol ne tombait pas sur le village :
il atterrissait à l'intérieur du ciel. Le portage avait ensuite élargi la portée
d'embarquement du vaisseau à 40 u pour rattraper cette dérive — un correctif
posé sur un symptôme dont la cause était un collider qui n'aurait jamais dû
exister.

## Deux règles, et la seconde a failli manquer

**1. Un maillage n'est pas un collider.** L'exportateur glTF marque désormais
chaque nœud dont le `GameObject` ne porte aucun collider
(`extras.noCollide`), et `buildColliders` les laisse passer.

**2. Un déclencheur ne rend rien solide.** La première version de la règle
comptait tout collider comme un obstacle. Le test l'a démentie aussitôt : sur
les 25 objets du ciel, **un** restait solide — la voûte. `SkyBehavior.Awake`
fait `collider.isTrigger = true`, et `m_IsTrigger` est sérialisé.

Ce sont 194 colliders dans la scène, et ils ne sont pas anecdotiques : les
volumes de fluide, les zones d'oxygène et les atmosphères sont tous des
déclencheurs (`FluidVolume.Awake` fait le même appel). Les compter comme des
obstacles, c'était rendre une atmosphère infranchissable.

La règle juste est donc : **solide = collider dont `m_IsTrigger` est faux.**

## Le second effet, moins visible

`buildColliders` s'arrête à `maxCount = 1200`. Timber Hearth en posait 441, et
le décor y prenait sa part. Un budget rempli de branches et de décalcomanies
est un budget qui peut **évincer du vrai terrain** — un trou dans le sol, sans
message d'erreur, dépendant de l'ordre de parcours des maillages. Retirer 747
candidats ne rend pas seulement le décor traversable : cela rend le budget
honnête.

## Ce que cela ne règle pas

- Un collider **désactivé** (`m_Enabled` faux) est encore compté comme un
  obstacle. Le cas n'a pas été mesuré, et il est probablement rare ; la règle
  s'étendrait d'une ligne le jour où il se présente.
- Un objet dont le collider est porté par un **enfant** plutôt que par
  lui-même reste traité maillage par maillage. C'est la bonne granularité ici,
  puisque le collider du portage naît du maillage — mais cela ne serait plus
  vrai si le portage posait un jour des colliders par sous-arbre.
- Les colliders **primitifs** du build (71 sphères, 119 boîtes, 49 capsules,
  obstacles) sont toujours rendus comme des trimesh du maillage visible. C'est
  une approximation plus fine que nécessaire, pas plus grossière.

## Invariants posés

Sans le build ([`tests/09-jeu.mjs`](../tests/09-jeu.mjs)) : un nœud marqué
traversable l'est, un maillage sans métadonnées reste solide.

Sur le build ([`tests/05-extract.mjs`](../tests/05-extract.mjs)) : 1 691
obstacles, 194 déclencheurs, 2 219 maillages, 747 traversables — et **aucun des
25 objets du ciel de Timber Hearth n'est solide**. C'est ce dernier compte qui
a corrigé la règle.

Dans l'export ([`tests/08-animation.mjs`](../tests/08-animation.mjs)) : tout
maillage émis pour un objet sans obstacle ressort marqué.
