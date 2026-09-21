# La carte : cinq couleurs, une ellipse, et un centre qui n'était pas le Soleil

`MapOpenGL` traînait depuis longtemps dans la colonne « **extraites, et que rien
ne lit** » du recensement. Une classe, une instance, posée sur
`SolarOrbitsCamera`. En l'ouvrant, elle dit trois choses, et le portage se
trompait sur les trois.

## Ce que le build dessine

`Start` range cinq corps et cinq couleurs dans **le même ordre**, à la main :

```
_planetRadiusArray = { _homePlanet, _hourglassPlanet, _brittlePlanet,
                       _gasPlanet, _bramblePlanet }
_lineColors        = { _homeColor,  _hourglassColor,  _brittleColor,
                       _giantColor,  _brambleColor }
```

et `OnPostRender` trace, pour chacun, un cercle en espace écran — de cinq
degrés en cinq degrés — centré sur la projection du **Soleil**, de rayon la
distance en **pixels** entre le Soleil et le corps :

```
Vector3 s = camera.WorldToScreenPoint(_sun.transform.position);
for (i = 0; i < 5; i++) {
    Vector3 p = camera.WorldToScreenPoint(_planetRadiusArray[i].transform.position);
    float   r = Vector2.Distance(s, p);
    GL.Color(_lineColors[i]);
    ... cercle de rayon r autour de (s.x, s.y), pas de 5 degrés ...
}
```

Les couleurs, relevées sur l'instance :

| orbite | r, g, b | à l'œil |
|---|---|---|
| Timber Hearth | 0,545 0,761 1,000 | bleu |
| les Jumelles (`FocalBody`) | 1,000 0,974 0,592 | sable |
| Brittle Hollow | 0,816 0,509 0,509 | rouge éteint |
| Giant's Deep | 0,600 1,000 0,916 | vert d'eau |
| Dark Bramble | 0,503 0,796 0,524 | vert |
| la comète | 0,761 1,000 0,986 | blanc glacé |

Toutes à la même alpha : **0,50980**, soit 130 sur 255. C'est elle qui laisse
les marqueurs lisibles par-dessus.

## Les trois erreurs du portage

1. **Une seule couleur.** `map.js` traçait tout en `rgba(120,140,170,.22)` — un
   gris inventé, et une alpha inventée aussi.
2. **Un cercle par corps du système**, au lieu des cinq du build. Les lunes,
   les satellites et l'épave avaient droit au leur.
3. **Centrés sur le milieu de l'écran, et mesurés depuis l'origine du repère
   ancré.** C'est-à-dire : depuis le corps sous les pieds du joueur. Une orbite
   n'est pas un cercle autour de là où l'on se tient — et dès qu'on quittait
   Timber Hearth, les cercles s'en allaient avec le joueur.

Cette troisième est celle qui se voit le plus, et c'est la plus facile à
laisser passer : sur la première image d'une partie, le joueur **est** sur
Timber Hearth, le repère ancré y est centré, et le Soleil n'est pas loin du
centre de l'écran à l'échelle par défaut. Tout paraît juste tant qu'on ne
décolle pas.

## L'ellipse de la comète, et pourquoi ce sont deux nombres

La comète n'a pas de cercle : `CometPath` lui dessine une **ellipse**, avec un
foyer sur le Soleil. Ses demi-axes viennent de
`InitialMotion.GetOrbitEllipseSemiAxes`, qui applique la formule de vis-viva :

```
mu = masse x 0,001                  (GravityWell.GetStandardGravitationalParameter)
a  = 1 / (2/r - v^2/mu)
e  = (r - a) / a                    le corps part de son apside
b  = a x sqrt(1 - e^2)
c  = sqrt(a^2 - b^2)                _fociDistance
```

C'est une gravité **képlérienne** — alors que le champ de ce jeu a un falloff
**linéaire** ([`04-gravite.md`](04-gravite.md)). Le build approxime donc pour
dessiner, et ne simule pas ce qu'il dessine. La remarque vaut d'être gardée :
c'est la même classe qui fait les deux.

Refaite ici sur la scène — comète à 24 000 du Soleil, `_orbitImpulseScalar` à
−0,425, masse du Soleil 20 000 000 donc mu = 20 000 —, la formule rend
`a = 13 191` et `b = 7 562`. Le **constructeur** de `MapOpenGL`, lui, porte en
dur :

```
_semiMajorAxisF = 13197.6904296875
_semiMinorAxisF = 7582.1591796875
```

Un demi-pour-cent d'écart. Ce sont donc le même calcul, fait par le studio sur
cette comète-ci et recopié comme valeur de départ. Et il y a une façon de le
**vérifier** plutôt que de le supposer :

```
a + c = 13197,69 + 10802,31 = 24000,00
```

**Exactement** la distance à laquelle la scène pose la comète. Son aphélie tombe
sur sa position de repos, ce qui est la signature d'un corps lancé depuis son
apside — et ce qui prouve que ces deux nombres sont bien cette ellipse-là, et
non des valeurs laissées d'un autre corps.

Son périhélie, lui, vaut `a − c = 2 395` : la comète passe **dans** le système
intérieur, plus près du Soleil que Timber Hearth (8 593).

> C'est pour cela que le portage garde les deux constantes du constructeur
> plutôt que de refaire la formule : une valeur du build vaut mieux qu'un calcul
> qui l'approche, et celle-ci se vérifie contre la scène.

## Ce qui est lu, et ce qui est un repli

Les six couleurs et leur alpha sont **lues** dans `gameplay.singletons.MapOpenGL`
— la classe entre au catalogue des singletons de l'extracteur. Les constantes de
`map.js` restent, comme le veut la convention du dépôt, le **repli explicite**
pour une page ouverte sans le build.

Les demi-axes, eux, sont des constantes : ils ne sont pas sérialisés, et c'est le
constructeur qui les porte. Le commentaire du module dit d'où ils viennent et
comment les revérifier.
