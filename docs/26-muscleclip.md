# Décoder `m_MuscleClip`

Suite de [`docs/22-animations.md`](22-animations.md), qui s'arrêtait sur ce
constat : les clips Mecanim du build sortaient en pose de repos parce que
« décoder `m_MuscleClip` est le seul chemin, et c'est un travail à part ».

C'est ce travail. Il est fait, et il tenait en 200 lignes.

## Le point de départ

Sur les 16 `AnimationClip` du build, 9 portent `m_AnimationType == 2` et
laissent `m_PositionCurves`, `m_RotationCurves` et `m_ScaleCurves` **vides**.
Ce sont exactement les animations de personnages : villageois, enfants,
astronome, méduses, anglerfish.

Première correction à ma note précédente : `m_AnimationType == 2` ne désigne
**pas** le système humanoïde. L'énumération d'Unity est
`Legacy = 1, Generic = 2, Human = 3`. Ces clips sont du Mecanim *générique* :
les courbes visent de vrais os, par leur nom, sans passer par la
retargetisation musculaire. C'est une très bonne nouvelle — il n'y a aucun rig
humanoïde à reconstruire, seulement un format à lire.

## La structure

UnityPy lit déjà `ClipMuscleConstant` sans erreur ; il ne l'interprète pas.

```
m_MuscleClip (ClipMuscleConstant)
  ├─ m_StartTime, m_StopTime
  ├─ m_Clip.data (Clip)
  │    ├─ m_StreamedClip    flux d'entiers 32 bits   ← tout est là
  │    ├─ m_DenseClip       échantillons à pas fixe  (vide dans ce build)
  │    ├─ m_ConstantClip    valeurs constantes       (vide dans ce build)
  │    └─ m_Binding.data.m_ValueArray  une entrée par courbe scalaire
  ├─ m_IndexArray           (que des −1 ici)
  └─ m_ValueArrayDelta      bornes min/max par courbe
```

Sur les neuf clips, **100 % des courbes sont dans le flux entrelacé** ; ni
`m_DenseClip` ni `m_ConstantClip` ne servent. Le décodeur les gère quand même,
parce que rien ne garantit qu'un autre build fasse pareil.

## Le flux

`m_StreamedClip.data` est une liste d'entiers 32 bits qui mêle entiers et
flottants. Elle se lit par images :

```
[temps : float] [nb de clés : uint]
puis, pour chaque clé : [indice de courbe : uint] [4 coefficients : float]
```

Les quatre coefficients décrivent le polynôme cubique du segment qui commence à
cette clé. Le quatrième est la valeur au temps de l'image — c'est celui qu'on
échantillonne.

Deux images sont des **sentinelles** et non des données : la première porte le
temps `−FLT_MAX`, la dernière `+inf`. Elles encadrent le clip pour que
l'évaluateur d'Unity n'ait jamais à tester les bords. Les garder décale toute
l'animation ; le décodeur les écarte sur `math.isfinite`.

Pour « Stargazing » : 16 350 mots, 30 images dont 2 sentinelles, 984 courbes.

## Retrouver les os

Chaque entrée de `m_ValueArray` porte deux hachages :

- **`m_ID`** désigne l'os. C'est un `zlib.crc32` du **nom** du GameObject —
  vérifié littéralement : `zlib.crc32(b"villager_rig:Root_JNT") == 1155279419`.
  La correspondance hachage → nom vit dans la table `m_TOS` d'un `Avatar`.
  Ce sont bien des noms, pas des chemins : aucune des 1 003 entrées des dix
  Avatar ne contient de `/`.
- **`m_TypeID`** désigne l'attribut animé. Dix valeurs couvrent tout le build :

| attribut | hachages | composantes |
|---|---|---|
| position | `4174552735`, `2413145609`, `383582131` | x, y, z |
| rotation | `2211994246`, `4108282384`, `1842756522`, `325535511` | x, y, z, w |
| échelle | `1512518241`, `757072631`, `3022607181` | x, y, z |

Une entrée = **une composante scalaire**. L'ordre des composantes suit l'ordre
d'apparition dans `m_ValueArray`, et le tableau est trié par famille : pour
« Stargazing », les indices 0–353 sont des positions (118 os × 3), 354–785 des
rotations (108 × 4), 786–983 des échelles (66 × 3). Soit 984, le compte exact.

Les Avatar vivent dans `sharedassets0/1`, **jamais** dans `level0`. Construire
la table sur les seuls objets de `level0` — ce que faisait ma première version
de l'exporteur — donne une table vide, donc zéro os résolu, donc zéro
animation, sans la moindre erreur.

## Deux vérifications, pas une

L'ordre `x, y, z, w` des quaternions est une hypothèse. Deux mesures
indépendantes la confirment :

1. **Norme.** Sur les neuf clips, 5 513 quaternions réassemblés : *tous* de
   norme 1.000 00 à 10⁻³ près. Un mauvais appariement de composantes entre os
   voisins casserait cette propriété.
2. **Pose de repos.** À `t = 0`, les valeurs décodées retombent sur les
   transformations locales des os dans la scène :

   | os | position décodée | `m_LocalPosition` de la scène |
   |---|---|---|
   | `villager_rig:Spine1_JNT` | −0.1500, 0.0000, 0.0000 | −0.1500, 0.0000, 0.0000 |
   | `villager_rig:Spine2_JNT` | −0.1688, 0.0000, 0.0000 | −0.1688, 0.0000, 0.0000 |
   | `villager_rig:Spine3_JNT` | −0.1497, 0.0000, −0.0485 | −0.1497, 0.0000, −0.0485 |

   Les rotations décodées s'en écartent légèrement, ce qui est attendu : c'est
   la pose animée, pas la pose de repos.

## Quel clip joue ?

Un `AnimatorController` liste plusieurs clips mais n'en démarre qu'un. Les
démarrer tous ferait se disputer les mêmes os.

`m_Controller.m_StateMachineArray[…].m_DefaultState` donne l'état par défaut, et
l'ordre des états suit celui de `m_AnimationClips` — vérifié sur les huit
contrôleurs du build en comparant les hachages `m_ClipID`. Le résultat est
cohérent avec la scène : le contrôleur `Villager` démarre sur « Default Idle »,
le contrôleur `StargazingVillager` sur « Stargazing », l'`Anglerfish` sur
« Idle ».

Comme glTF n'a pas de notion d'état par défaut, l'information passe par le nom
du groupe : `Objet|Clip` pour le clip actif, préfixé de `~` sinon. Le moteur web
ne démarre que les premiers.

Cette passe a aussi corrigé un défaut antérieur : un composant `Animation`
référence son clip par défaut **et** le liste dans `m_Animations`, ce qui le
faisait exporter deux fois. Brittle Hollow annonçait 2 animations pour un seul
clip réel. Les références sont désormais dédoublonnées par `path_id`.

## Résultat

| corps | animations | canaux | dont Mecanim | os non résolus |
|---|---|---|---|---|
| Timber Hearth | 17 | 4 022 | 17 | 0 |
| Dark Bramble | 9 | 1 604 | 8 | 0 |
| Giant's Deep | 6 | 2 124 | 5 | 0 |
| Hourglass Twins | 1 | 180 | 1 | 0 |

Avant : **0 animation** sur Timber Hearth.

Vérifié dans le navigateur : 35 groupes chargés, 26 en lecture (les 9 autres
sont les variantes préfixées `~`), les os bougent d'une image à l'autre, aucune
erreur console. L'enfant au télescope tient la pose « LookingThroughTelescope »,
bras levés vers l'instrument.

## Ce qui manque encore

- **Les tangentes.** Les coefficients `[0]`, `[1]`, `[2]` décrivent la cubique du
  segment ; le décodeur ne garde que la valeur et interpole linéairement.
  Passer en `CUBICSPLINE` demanderait de convertir les tangentes d'Unity vers
  la convention glTF, et se voit surtout sur les mouvements lents.
- **Les machines à états.** Seul l'état par défaut est joué ; transitions,
  conditions et arbres de mélange restent hors d'atteinte.
- **`m_ValueArrayDelta`** (bornes par courbe) et `m_IndexArray` ne servent pas.
  Ils n'apportent rien au rendu ici, mais un clip qui utiliserait la compression
  par delta en aurait besoin.
