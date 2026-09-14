# Un lot pour plusieurs corps : la planète de départ qui s'efface une demi-minute sur deux

Debout au village, sans rien faire, le sol disparaît. Pas un clignotement : la
planète entière s'en va, on reste suspendu au-dessus du vide sur des colliders
qu'on ne voit plus, puis elle revient. L'intervalle paraît quelconque — il ne
l'est pas, il est réglé comme une horloge.

## Le compte qui explique tout

`Sectors.update` décide **par corps** et applique **par fichier**. La décision
est juste : chaque corps a son secteur, son horizon, sa distance au joueur.
L'application ne l'est pas, parce qu'un lot glTF porte souvent plus d'un corps :

| fichier | corps qu'il porte |
|---|---|
| `timberhearth_pivot.gltf` | `GravityWell_HomePlanet`, `GravityWell_Moon` |
| `brittlehollow_pivot.gltf` | `GravityWell_BrittleHollow`, `GravityWell_VolcanicMoon` |
| `hourglasstwins_pivot.gltf` | `GravityWell_Buried`, `GravityWell_Revealed` |
| `darkbramble_pivot.gltf` | `GravityWell_DarkBramble`, plus un volume d'`EXTRA_VOLUMES` |

Quatre lots sur neuf sont réclamés par deux demandeurs. La boucle appelait
`container.setEnabled(on)` au passage de chacun : **le dernier passé décidait
pour tous les autres**, et l'ordre vient de celui des objets dans la scène.

Sur Timber Hearth, le dernier passé est sa lune, et l'arithmétique fait le
reste :

```
Attlerock      orbite a 541 u de Timber Hearth, en 1,0 min   (docs/06)
Sector_Moon    horizon 75  ->  activation  75 x 8 =  600     (docs/82)
Timber Hearth  rayon de surface 250                          (docs/04)

joueur au sol, distance a la lune :  541 - 250 = 291  ...  541 + 250 = 791
d = 600  <=>  cos t = (250² + 541² - 600²) / (2 x 250 x 541) = -0,018  ->  t = 91°
```

La lune franchit donc les 600 unités **deux fois par tour**, et passe un peu
plus de la moitié de sa minute d'orbite hors de portée. La moitié du temps,
elle éteignait le conteneur — avec la planète dedans. Une demi-minute de sol,
une demi-minute de vide, indéfiniment.

Ce qui achevait de rendre la chose illisible : la sphère de substitution
reprend la main dès que le lot n'est plus actif (`main.js`), et de l'intérieur
une sphère de 250 unités ne montre rien. On ne voyait donc pas un objet de
remplacement grossier apparaître à la place du terrain — on ne voyait **rien**,
ce qui ressemble bien plus à un bug de rendu qu'à une décision de secteur.

## La correction

On ne peut pas décider plus finement que le fichier : c'est le conteneur glTF
qu'on allume, et la lune vit dans celui de sa planète. La seule réponse juste
est donc l'**union** — un lot est affiché dès que *quelqu'un* le réclame :

```
collecte :   pour chaque corps, pour chaque volume  ->  veut[fichier] |= on
application :  une fois par fichier, et une fois seulement
```

Éteindre la lune ne rendait de toute façon rien tant que sa planète était
visible : les deux partagent les mêmes octets. L'union ne coûte donc aucune
mémoire, et `PRELOAD_MARGIN` comme l'éviction continuent de travailler sur les
mêmes fichiers qu'avant.

`actifs` compte désormais les **demandeurs servis**, pas les fichiers allumés :
c'est ce que `total` compte déjà, et l'affichage met les deux côte à côte.

## L'invariant

`tests/09-jeu.mjs` reconstruit la situation exacte — la planète, sa lune à
541 u, le joueur au sol du côté opposé — dans l'ordre qui produisait le défaut,
et vérifie que le lot reste allumé. Il vérifie aussi que ce n'est pas devenu un
lot qu'on n'éteint jamais : loin des deux, il part. Le cas à deux boucles
(`darkbramble_pivot.gltf`, réclamé par un corps *et* par un volume sans puits
de gravité, avec deux portées différentes) est gardé de la même façon.

C'est la troisième fois que ce dépôt rencontre ce motif — une décision prise
par élément, écrite dans un état partagé : `_sunlessZoneCount`
([`83`](83-seuils.md)) et `_sandstormCount` ([`72`](72-poussiere.md)) comptaient
là où le portage testait. Ici le portage écrasait là où il fallait réunir.
