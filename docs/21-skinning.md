# Skinning : les personnages

Le dernier gisement technique. `tools/08_export_gltf.py`.

## Le blocage, et sa levée

Depuis le début, l'export de maillages passait par l'export **OBJ** de UnityPy :
les sommets Unity 4 vivent dans des flux entrelacés (`m_VertexData`), que je ne
voulais pas décoder à la main. L'OBJ transporte positions, normales et UV — mais
**pas les poids d'os**. Les 70 personnages sortaient donc en pose de repos.

La levée tient en une découverte : `UnityPy.helpers.MeshHelper` expose une
classe **`MeshHandler`** qui fait ce décodage et donne davantage que l'OBJ.

Sur un maillage de villageois :

| donnée | contenu |
|---|---|
| `m_Vertices`, `m_Normals`, `m_UV0` | 3 201 entrées chacune |
| **`m_BoneWeights`** | 3 201 quadruplets de poids |
| **`m_BoneIndices`** | 3 201 quadruplets d'indices |
| `m_BindPose` (sur le maillage) | 53 matrices 4×4 |
| `m_Bones` (sur le rendu) | 53 os |

L'intermédiaire OBJ a donc été **supprimé** : le décodage est direct, ce qui
règle le skinning et retire un aller-retour au passage.

## La conversion de repère des matrices

Inverser l'axe Z se propage à une matrice par conjugaison. Avec
`S = diag(1, 1, −1, 1)`, la matrice devient `S·M·S`, ce qui revient à changer le
signe des éléments dont **exactement un** indice vaut 2. Puis glTF attend
l'ordre colonne par colonne, là où Unity expose `e{ligne}{colonne}`.

Se tromper ici ne produit pas une erreur mais un personnage tordu — d'où la
vérification numérique plutôt qu'à l'œil.

## Vérifié

**Données**, sur Timber Hearth — 12 squelettes, 5 maillages skinnés :

| contrôle | résultat |
|---|---|
| poids sommant à 1 | écart max **4,5 × 10⁻⁸** |
| indices d'os dans les bornes | max 52 pour 53 os |
| matrices inverses | 53 pour 53 os |

**Chargement dans Babylon** : 12 squelettes de 53 à 58 os, 12 maillages liés,
poids et indices présents sur le tampon de sommets.

## Prudence sur les squelettes incomplets

Les os sont des `Transform`. Un squelette n'est émis que si **tous** ses os
appartiennent au sous-arbre exporté ; sinon il est ignoré et compté à part.
Émettre un squelette avec des os manquants donnerait des indices pointant vers
de mauvais nœuds — un personnage disloqué plutôt qu'une erreur franche.

## Ce qui manque encore

- **Les animations ne sont pas transportées.** Le squelette est là, mais les
  16 `AnimationClip` et 8 `AnimatorController` ne sont pas convertis en
  animations glTF. Les personnages sont désormais *déformables*, pas encore
  *animés*.
- **Les `Avatar`** (10) et la retargetisation Mecanim ne sont pas exploités.
- **Les mélanges de morphes** ne sont pas pris en compte.
