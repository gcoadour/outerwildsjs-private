# Shaders

`tools/12_shaders.py` exporte les sources ShaderLab et les classe.
`web/src/materials.js` fournit des shaders maison pour les effets qui manquaient
le plus.

## Le tri, et pourquoi il compte

Sur **122 shaders**, **121 gardent leur source ShaderLab lisible** : c'est de la
traduction, pas de la rétro-ingénierie de bytecode.

Mais l'écrasante majorité sont des shaders **livrés avec Unity 4**. Les
réécrire n'aurait aucun sens : un matériau Babylon équivalent fait le travail,
mieux et pour rien.

| classe | nombre |
|---|---|
| Unity standard | 85 |
| écrits par l'équipe | 37 |

Parmi ces 37, les plus petits sont les plus révélateurs — un shader écrit à la
main pèse quelques kilo-octets, là où un shader du moteur en fait des centaines
en embarquant ses variantes compilées : `Atmosphere` (605 o), `diamond shader`
(1,2 Ko), `FireBall`, `V-Fog`, `TwirlEffect`, `HeatDistortion`,
`DistortionShader`. Et parmi les gros : `RimShader`, `CrackShader`,
`IzzySunShader`.

### Une erreur de classement

Ma première version reclassait en « Unity probable » tout shader de plus de
120 Ko. C'était faux : `IzzySunShader` (154 Ko), `CrackShader` (195 Ko) et
`RimShader` (321 Ko) sont manifestement écrits par l'équipe, mais pèsent lourd
parce qu'ils embarquent eux aussi de nombreuses variantes. **Le nom prime sur
la taille** ; celle-ci n'est qu'un indice, signalé par un champ à part.

## Ce que fournit `materials.js`

Ce fichier ne transpose aucun shader du jeu. Ce sont des implémentations
originales de techniques classiques, visant un résultat comparable.

**Coque atmosphérique.** Une sphère de 1,07 rayon autour de la planète, en
fusion additive, avec un terme de Fresnel : le limbe s'allume là où la normale
est perpendiculaire au regard, et la face jour est plus lumineuse que la face
nuit. C'est le gain visuel le plus net — une planète cesse d'être une bille
texturée.

**Surface stellaire.** Bruit de valeur sur trois octaves, animé, avec
assombrissement du limbe pour suggérer le volume. Pas de texture.

## Le piège du back-face culling

Première version avec `backFaceCulling = false`, en pensant qu'une coque
transparente doit se voir des deux côtés. Résultat : la planète disparaissait
sous un voile bleu uniforme.

La raison est géométrique. Sur l'hémisphère **arrière** de la coque, les
normales s'opposent au regard : `dot(n, v)` est négatif, le `clamp` le ramène à
zéro, et le terme de Fresnel `pow(1 - 0, 3)` **sature à 1 sur tout le disque**.
Au lieu d'un halo de limbe, on obtient un aplat pleine surface.

Avec les faces arrière éliminées, seul l'hémisphère avant contribue : au centre
du disque `dot(n,v) ≈ 1` donc Fresnel ≈ 0, et au bord `dot(n,v) ≈ 0` donc
Fresnel ≈ 1. Le halo apparaît là où il doit.

## Limites

- **Les teintes atmosphériques sont un choix, pas une mesure.** Le build ne
  porte pas de couleur d'atmosphère exploitable — le `_ambientLight` des
  `PlanetoidSector` est un indice (0, 1, 2), pas une teinte.
- **Pas d'atmosphère vue de l'intérieur.** Les faces arrière étant éliminées,
  se tenir au sol ne donne aucune teinte de ciel. Le jeu traite le ciel
  séparément.
- **Les 37 shaders du jeu ne sont pas portés**, seulement deux effets
  approchés. `CrackShader`, `RimShader`, `HeatDistortion`, `DistortionShader`,
  `V-Fog` et `FireBall` restent à faire, et ce sont eux qui portent l'identité
  visuelle des lieux.
