# Lire un build *stripped* : la question des type trees

## Le problème

Un fichier `.assets` Unity peut embarquer la description de ses structures — le
*type tree* — qui indique pour chaque classe l'ordre, le type et l'alignement de
ses champs sérialisés. Les builds de production sont généralement compilés sans,
pour gagner de la place. C'est le cas ici.

Conséquence : les 1 390 `MonoBehaviour` de `level0` sont des blocs d'octets
opaques. Sans type tree, un lecteur générique ne connaît que l'entête commune
(`m_GameObject`, `m_Enabled`, `m_Script`, `m_Name`) et ignore tout ce qui suit,
c'est-à-dire précisément les données de gameplay.

Deux symptômes rencontrés, dans cet ordre :

1. UnityPy refuse de lire l'objet, car il a consommé 24 octets sur les 28, 32 ou
   52 attendus, et lève une `ValueError`. Passer `check_read=False` désactive
   cette vérification et rend au moins l'entête exploitable — ce qui suffit déjà
   à savoir **quel script** est attaché à **quel GameObject** (1 390/1 390).
2. Les valeurs des champs, elles, restent inaccessibles.

Attention au passage : `PPtr.read()` n'accepte aucun argument. Pour lire une
cible de pointeur en mode tolérant il faut d'abord `deref()` afin d'obtenir
l'`ObjectReader`, puis appeler `read(check_read=False)` dessus. C'est le rôle de
`read_lenient()` dans `tools/lib_ow.py`.

## La solution

Les type trees absents des `.assets` sont **reconstructibles depuis
`Assembly-CSharp.dll`** : les règles de sérialisation d'Unity (champs publics ou
`[SerializeField]`, dans l'ordre de déclaration, avec des règles d'alignement
connues) sont déterministes. C'est exactement ce que fait AssetRipper.

On réutilise donc son générateur via `TypeTreeGeneratorAPI`, en backend
`AssetRipper`, et on convertit sa sortie au format attendu par UnityPy.

## Deux pièges d'intégration

**Format de nœuds.** Le générateur renvoie une liste plate de nœuds portant un
`m_Level`. UnityPy 1.25 attend un arbre (`m_Children`). Sa méthode
`TypeTreeNode.from_list` reconstruit l'arbre à partir des niveaux, mais
uniquement si on lui passe des **dictionnaires** contenant `m_Level`, `m_Type`
et `m_Name`. La conversion tient en une ligne (`_to_dicts` dans
`tools/lib_typetree.py`).

**Couverture des classes.** `get_monobehaviour_definitions()` ne liste que 329
classes, et en manque 67 pourtant bien présentes dans la scène
(`InteractReceiver`, `DirectionalForceField`, `SimpleFluidVolume`…) —
vraisemblablement celles qui dérivent d'une base intermédiaire plutôt que
directement de `MonoBehaviour`. Or `get_nodes("Assembly-CSharp", "<classe>")`
les résout parfaitement en accès direct. D'où la stratégie en deux temps de
`TreeCache._lookup()` : définitions listées d'abord, puis essai direct dans
chaque assembly de jeu.

## Résultat

**1 364 / 1 390 MonoBehaviour** lus avec leurs valeurs, soit 98,1 %.

Les 26 restants sont des `EOFError` concentrés sur 4 classes (`EntrywayTrigger`,
`DS_Decals`, `MuseumEntryway`, `DialogueGUI`) : le type tree généré y attend
plus de données que l'objet n'en contient, probablement du fait de champs dont
la sérialisation Unity 4 diffère de ce que suppose le générateur. Ces classes
restent lisibles au niveau de l'entête, et leur cas se traite au besoin à la
main.
