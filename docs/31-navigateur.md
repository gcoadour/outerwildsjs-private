# Le pipeline dans le navigateur

Le pipeline d'origine est en Python : UnityPy pour lire les fichiers sérialisés,
et le backend .NET d'AssetRipper pour régénérer les type trees. Ni l'un ni
l'autre ne tourne dans un onglet. Pour que tout soit faisable depuis une page
GitHub Pages, il a fallu le réécrire, module par module.

Ce document décrit ce qui change, et ce que la réécriture a appris.

## Ce qui entre, ce qui sort

Rien du jeu n'est publié. La page contient le moteur et le pipeline ; les
données viennent du fichier que la personne fournit.

```
OuterWilds_Alpha_1_2_Linux.zip   (fourni sur la page, jamais téléversé)
        │
        │  DecompressionStream, entrée par entrée
        ▼
stockage privé de l'origine (OPFS)
        │
        │  FileSystemSyncAccessHandle : lecture à la demande
        ▼
UnityEnv ── SerializedFile × 6 ── PPtr résolus entre fichiers
        │
        ├── structures moteur      : web/src/pipeline/unity/unity41-types.json
        └── structures des scripts : régénérées depuis les assemblies (.dll)
        │
        ▼
extracteurs (scène, composants, système solaire, gameplay, dialogue,
             audio, shaders, particules, interface, glTF)
        │
        ▼
data/… dans l'OPFS ── Service Worker ── le moteur croit lire des fichiers servis
```

## Les fichiers ne tiennent pas en mémoire

Le build extrait pèse environ 540 Mo, dont 410 pour `sharedassets1.assets`. Les
charger en entier fait échouer l'onglet sur bien des machines.

Or un fichier sérialisé n'a besoin en permanence que de son en-tête : 48 Ko pour
les 410 Mo de `sharedassets1`. Le reste — les octets des objets — se lit à la
demande. `SerializedFile` prend donc une **source d'octets** plutôt qu'un
tampon, et le navigateur en fournit une idéale : `FileSystemSyncAccessHandle`,
disponible dans un Worker, qui lit dans l'OPFS sans charger le fichier.

Les tests passent par une source équivalente adossée au disque, pour éprouver ce
chemin-là plutôt qu'un chargement intégral qui n'aura jamais lieu.

## Régénérer les type trees sans .NET

Le build est *stripped* : `typeCount` vaut 0, aucune structure n'est décrite
dans les fichiers (voir [`03-typetrees.md`](03-typetrees.md)). Deux sources les
remplacent.

**Les classes du moteur** viennent des dumps de type trees publiés par le projet
TypeTreeDumps d'AssetRipper, redistribués dans UnityPy.
`tools/16_unity_types.py` en extrait les 35 classes utiles pour Unity 4.1.2f1.
C'est du format Unity, pas du contenu du jeu : ce fichier est versionné.

**Les MonoBehaviour** sont régénérés en lisant `Assembly-CSharp.dll` :
PE → en-tête CLI → flux de métadonnées → tables ECMA-335, puis les règles de
sérialisation d'Unity (champs publics ou `[SerializeField]`, dans l'ordre de
déclaration, classes de base d'abord, alignement sur 4 après tout champ de moins
de 4 octets).

Résultat : **1 390 / 1 390** MonoBehaviour de `level0` lus au bit près, contre
1 364 pour le pipeline Python. Les 26 qui lui échappaient tenaient à trois
détails que la lecture des octets a désignés :

- **Bases génériques.** `DecalProjectorComponent` dérive d'une classe générique,
  donc son `extends` pointe une `TypeSpec` et non une `TypeDef`. Sans résoudre
  ce cas, la chaîne d'héritage s'arrête net et tous les champs hérités
  disparaissent de l'arbre — 83 objets du build en dépendaient.
- **`char` n'est pas sérialisé par Unity 4.** L'inclure décalait `DialogueGUI` de
  4 octets ; l'objet fait 52 octets, ce qui ne laisse pas la place au champ.
- **`GUIStyle` a un pendant natif.** Sa forme sérialisée ne se déduit pas de ses
  champs C#. Elle est écrite à la main et vérifiée sur le seul `GUIStyle` du
  build : 312 octets, avec les booléens tassés par paires. Aligner après chaque
  booléen en ajoutait huit.

## Trois pièges du format, trouvés par l'oracle

L'oracle est le même partout : **lire un objet doit consommer exactement ses
`byteSize` octets**. C'est lui qui a désigné, un par un :

- **L'alignement final.** Unity aligne *entre* les champs, mais `byteSize`
  n'inclut pas le remplissage final. Aligner sans borne consomme un octet de
  trop sur un `GameObject`, trois sur un `MonoScript`.
- **`TypelessData`** (image d'une `Texture2D`, tampons d'un `Mesh`) n'a pas de
  nœud `Array` : une taille, puis les octets bruts. Traité comme une structure,
  il s'arrête au premier octet.
- **`char` dans un type tree fait un octet**, pas deux. Sur 16 bits, le
  `m_FontData` des sept polices déborde.

Et un cas que l'oracle ne pouvait pas trancher seul : les octets d'un `AudioClip`
sont tantôt dans l'objet, tantôt dans le `.resS`. `m_Stream` ne permet pas de
décider — les 142 clips l'ont non nul alors que 132 portent leurs octets en
ligne. La décision se prend sur ce qui reste à lire.

## Décoder les assets

**Textures.** Sept formats sont présents : Alpha8, ARGB4444, RGB24, ARGB32,
RGB565, DXT1 et DXT5, les deux derniers couvrant 338 des 399 textures. Le
décodage est vérifié contre UnityPy octet par octet ; DXT1, DXT5, ARGB32 et
RGB24 sortent identiques. Alpha8 diffère volontairement : UnityPy rend
`(0,0,0,a)`, ici le RGB est blanc, parce que ces textures sont des masques
multipliés par une teinte et que du noir éteindrait la particule ou le halo.

**Maillages.** `m_Vertices` est vide ; les sommets vivent dans un tampon
entrelacé décrit par des descripteurs de canaux et de flux. Le pipeline Python
déléguait ce décodage à UnityPy. Ici il est fait directement, et vérifié contre
UnityPy : sommets, triangles et positions concordent. Aucun des 1 569 maillages
n'est compressé, donc `m_CompressedMesh` reste non implémenté — et le signale
explicitement plutôt que de rendre un maillage faux.

**Encodage.** Les textures d'Unity sortent toutes en RGBA, même sans
transparence réelle. Quand le canal alpha est partout opaque, le JPEG divise le
poids par un ordre de grandeur ; le PNG n'est gardé que pour ce qui est vraiment
transparent. L'extension est décidée avant l'écriture, sans quoi un glTF
renverrait vers un `.png` finalement écrit en `.jpg`.

## Lire les invites dans l'IL

Les invites à l'écran ne vivent pas dans les assets : une quarantaine de classes
les construisent en dur. `tools/14_interface.py` les cherchait par expressions
régulières dans la source décompilée par ILSpy — donc avec un SDK .NET.

Les corps de méthode sont maintenant lus directement. Il ne s'agit pas de
décompiler : on repère quelques instructions — `ldstr`, `newobj`, `stfld`,
`call` — et on les rapproche par le nom du champ, seul lien entre la
construction, qui porte le texte, et l'inscription, qui porte la zone d'écran.
Les noms de boutons et de zones viennent des énumérations du même assembly.

Résultat identique au Python : 46 invites, 45 placées, une au texte dynamique et
trois dont le texte est posé à l'exécution.

## Pourquoi un Service Worker

Le moteur charge ses données par des chemins relatifs, et un glTF renvoie
lui-même vers son `.bin` et ses textures de la même façon. Des URL `blob:`
casseraient cette résolution, et il aurait fallu réécrire le chargement dans
tout le moteur.

Un Service Worker qui sert `data/…` depuis l'OPFS laisse ce code inchangé : il
croit lire des fichiers servis. C'est aussi ce qui impose une origine sûre —
`localhost` ou HTTPS.

## Écarts assumés avec le pipeline Python

- **36 clips audio et 97 sources placées**, contre 31 et 92. Le lecteur
  d'`AudioClip` dédié récupère les clips que la lecture tolérante de UnityPy
  laissait tomber.
- **`Resources/unity default resources` est chargé.** `level0` pointe vers lui ;
  sans ce fichier, 72 shaders intégrés et les renvois vers les polices d'Unity
  restaient invisibles.
- **`docs/01-build.md` annonçait 28 286 objets.** C'était une erreur d'addition :
  989 + 24 032 + 174 + 621 + 2 390 = 28 206. Corrigé.

## Les animations, dernier module resté en Python

Le premier passage laissait les corps en pose de repos : les squelettes
sortaient, pas les clips. C'était le dernier écart de fond avec le pipeline
Python, et il est comblé — `web/src/pipeline/unity/muscle.js` porte
`tools/lib_muscle.py`, et l'exporteur glTF pose les canaux.

Trois choses ont dû suivre le décodeur.

**Deux classes moteur de plus.** Un clip Mecanim ne nomme pas ses os : il les
désigne par un CRC32, que seule la table `m_TOS` d'un `Avatar` sait traduire. Et
la liste des clips d'un `Animator` vit dans son `AnimatorController`, avec
l'état par défaut qui dit lequel démarre. Ni l'un ni l'autre n'était dans
`unity41-types.json` ; `tools/16_unity_types.py` les y ajoute (classes 90 et
91), sans rien changer aux 35 autres, vérifié octet pour octet.

**Le nom du tableau de couches.** Le Python cherchait `m_LayerArray` pour savoir
quelle machine à états lire. En 4.1 le champ s'appelle `m_HumanLayerArray` : la
recherche ne trouvait jamais rien et retombait sur la machine 0. Les deux noms
sont désormais lus, et un index hors bornes retombe sur la première machine
plutôt que de renoncer — auquel cas *tous* les clips se déclareraient par
défaut, et se disputeraient les mêmes os.

**Un flux dense n'a pas de tangentes.** Le Python levait une `IndexError` si un
clip en portait un et qu'on demandait les tangentes. Aucun clip du build n'est
dans ce cas, donc rien ne l'avait jamais montré ; le portage l'a rencontré sur
un flux fabriqué. Les deux versions retombent maintenant en interpolation
linéaire, ce qu'une courbe sans tangentes appelle.

Le décodeur JavaScript et le décodeur Python ont été comparés sur des flux
fabriqués — sentinelles, images à composantes désalignées, flux dense — et
rendent les mêmes valeurs et les mêmes tangentes, à 10⁻⁶ près. `tests/08-animation.mjs`
garde cette vérification, moitié sans le build (le flux fabriqué et un monde de
trois objets qui traverse tout l'exporteur), moitié dessus.
