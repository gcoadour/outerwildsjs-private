# Export glTF

`tools/08_export_gltf.py` sort un sous-arbre de la scène en glTF 2.0
(`.gltf` + `.bin`), format que Babylon.js et three.js chargent nativement.
C'est ce qui remplace l'export OBJ : l'OBJ transporte un maillage isolé, le
glTF transporte **la hiérarchie complète avec ses transformations**.

```bash
python3 tools/08_export_gltf.py --list                      # racines exportables
python3 tools/08_export_gltf.py --root TimberHearth_Pivot   # -> data/gltf/timberhearth.gltf
```

Vérification visuelle : `web/gltf-viewer.html?f=timberhearth.gltf`.

Sur Timber Hearth : **2 749 nœuds, 270 maillages, 486 instances, 423 644
sommets, 12 Mo**.

## Le décodage des sommets

Les maillages Unity 4 ne stockent pas leurs sommets en clair : `m_Vertices` est
vide, et les données vivent dans `m_VertexData`, un tampon de flux entrelacés
(6 canaux, 4 flux) décrit par des descripteurs de canaux, avec une variante
compressée dans `m_CompressedMesh`.

Réimplémenter ce décodage serait long et fragile. UnityPy sait déjà le faire —
c'est ce que fait sa méthode `export()`, qui produit un OBJ correct. L'exporteur
s'appuie donc dessus et réassemble le résultat en glTF.

Conséquence assumée : **le skinning n'est pas transporté**. Les 70
`SkinnedMeshRenderer` sortent en pose de repos. Les squelettes et les 16
`AnimationClip` restent lisibles et pourront être ajoutés plus tard.

## Conversion de repère

Unity est en main gauche, glTF en main droite. La conversion appliquée :

| Donnée | Transformation |
|---|---|
| positions, normales | `z → −z` |
| translations de nœud | `z → −z` |
| quaternions | `(x, y, z, w) → (−x, −y, z, w)` |
| ordre des triangles | inversé (l'inversion de Z change l'orientation) |
| coordonnées UV | `v → 1 − v` |

## Un piège de vérification, pas d'export

La première validation affichait un écran noir alors que le fichier était
correct. Deux causes, toutes deux dans la page de test :

**La caméra doit exister avant la boucle de rendu.** Si `scene.render()` lève
`No camera defined`, Babylon arrête la boucle ; elle ne repart pas quand la
caméra est créée ensuite. Sans boucle continue, le tampon WebGL n'est pas
conservé et la capture est noire même après un rendu manuel.

**Cadrer sur une boîte englobante globale ne marche pas ici.** Le sous-arbre part
du pivot d'orbite, à l'origine, alors que la géométrie est à ~8 700 unités. Le
centre de la boîte tombe donc dans le vide, à mi-chemin. Le visualiseur cadre
sur le barycentre des centres de maillages.

Le diagnostic décisif a été d'ajouter un objet témoin à la position visée : il
était invisible lui aussi, ce qui a écarté le glTF et désigné la page de test.

## Intégration au prototype

`web/src/geometry.js` charge les glTF dans le prototype et remplace les sphères
de substitution.

Les fichiers étant exportés depuis les pivots d'orbite, qui sont à l'origine du
monde, leurs coordonnées internes **sont déjà des coordonnées monde** : il n'y a
aucun placement par corps à faire, seulement le décalage du floating origin à
appliquer au conteneur.

### La convention d'axes, établie par la mesure

L'export inverse Z (Unity main gauche → glTF main droite), puis le chargeur de
Babylon applique sa propre conversion. Le résultat net n'est ni l'un ni l'autre
pris isolément : c'est une **rotation de 180° autour de Y**, soit X et Z
inversés tous les deux.

Cela ne se devine pas de façon fiable — les deux conversions se composent. La
mesure a tranché :

| corps | attendu (Unity) | mesuré, sans correction |
|---|---|---|
| soleil | `0, 0, 0` | `0, 0, 0` |
| planète natale | `0, 0, −8593` | `36, −3, **+8740**` |
| Brittle Hollow | `**+11691**, 0, 0` | `−11716, 40, −2` |

La correction est donc une rotation de 180° autour de Y, qui est sa propre
inverse. **Surtout pas une mise à l'échelle négative** : elle inverserait
l'orientation des faces.

### Vérification

Après correction, l'écart entre le barycentre mesuré de chaque sous-arbre et la
position du corps de référence :

| fichier | écart | relatif |
|---|---|---|
| `sun_body` | 0 u | 0,0 % |
| `comet_pivot` | 36 u | 0,1 % |
| `quantummoon_body` | 28 u | 0,3 % |
| `brittlehollow_pivot` | 48 u | 0,4 % |
| `giantsdeep_pivot` | 129 u | 0,8 % |
| `timberhearth_pivot` | 152 u | 1,8 % |

Les résidus sont attendus : on compare le barycentre d'un sous-arbre entier,
lunes et satellites compris, au centre du seul corps de référence.

### Limite actuelle

La collision reste **analytique** — le joueur s'appuie sur une sphère du rayon
du corps, pas sur le relief affiché. Le terrain visible et la surface de
collision ne coïncident donc pas exactement. C'est le point où Havok et les
1 452 maillages de collision deviennent utiles.

## Physique Havok

`web/src/physics.js` construit des colliders trimesh sur la géométrie chargée.
Mesuré : **441 colliders pour Timber Hearth, construits en 898 ms**, et le
joueur repose sur le relief réel (altitude −1 u par rapport au rayon de la
sphère analytique, qu'il traverse donc).

### L'ancrage du floating origin

Un floating origin qui suit le joueur déplacerait tous les colliders statiques
en permanence, ce que Havok gère mal. L'origine est donc ancrée sur le **corps
dominant** : tant qu'on reste dessus, les colliders ne bougent pas, et le joueur
reste à moins d'un rayon de corps de l'origine (250 à 2 000 u) — très loin du
seuil où le float32 devient gênant.

C'est aussi ce que fait l'original avec ses référentiels. Au changement de corps
dominant, l'origine se ré-ancre, la géométrie suit, les colliders sont
reconstruits et le corps du joueur est repositionné.

### La gravité reste à la main

La gravité globale du moteur est mise à **zéro** : le jeu n'a pas de gravité
uniforme, chaque corps porte un champ et le plus fort l'emporte. L'accélération
du champ dominant est appliquée en force à chaque pas.

### Une sphère, pas une capsule

Le corps du joueur est une sphère. Une capsule devrait être maintenue verticale
en permanence, or la verticale change de direction d'un corps à l'autre — c'est
tout le sujet du jeu. Une sphère n'a pas d'orientation à défendre ; un fort
amortissement angulaire l'empêche de rouler.

### Dégradation

Sans glTF, le prototype retombe sur des sphères de substitution ; sans Havok,
sur la collision analytique. Les deux chemins partagent le même modèle de
gravité et les mêmes commandes.

## Matériaux et textures

L'exporteur transporte les matériaux : `MeshRenderer.m_Materials` donne le
matériau de chaque objet, dont on lit `_MainTex`, `_BumpMap` et `_Color`. Le
mode de transparence se déduit du nom du shader (`Alpha-*` → `BLEND`,
`*Cutout*` → `MASK`).

Total sur les neuf corps : **251 matériaux, 200 textures**.

### Le poids des textures

Les textures Unity sortent **systématiquement en RGBA**, même sans transparence
réelle, et beaucoup sont en 1024² voire 4096². Exportées telles quelles :
119 Mo pour la seule Timber Hearth — inutilisable dans un navigateur.

Deux mesures, via `--max-texture` (défaut 1024) et `--texture-quality` :

- plafonnement de la résolution ;
- test du canal alpha : s'il est entièrement opaque, passage en RGB et JPEG.

À 512 px : **119 Mo → 21 Mo** pour Timber Hearth, en 48 JPEG opaques et 53 PNG
réellement transparentes. Le PNG n'est conservé que là où il sert.

**Correction ultérieure** (voir `docs/27-poids.md`) : ce test du canal alpha
prenait les cartes de normales pour des textures transparentes. Unity les range
en DXT5nm — X dans l'alpha, Y dans le vert, RVB inutilisé — de sorte que leur
alpha varie toujours. Elles restaient donc en PNG (83 fichiers, 90 des 102 Mo)
**et** le moteur lisait leur gris comme un vecteur de normale, ce qui est faux.
`--normal-quality` les désentrelace et les sort en JPEG 4:4:4 : 102 Mo → 51 Mo,
et un rendu enfin correct.

### Limite

Les sous-maillages étant fusionnés à la lecture de l'OBJ, une primitive ne porte
qu'un matériau : sur un objet multi-matériaux, seul le premier est appliqué. La
clé du cache de maillages inclut le matériau, un même maillage instancié avec
deux matériaux étant exporté deux fois.

Les transformations d'UV (`m_Scale`, `m_Offset` de `UnityTexEnv`) ne sont pas
transportées : cela demanderait l'extension `KHR_texture_transform`.
