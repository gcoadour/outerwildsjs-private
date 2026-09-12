# outerwildsjs — l'alpha ouverte d'Outer Wilds dans le navigateur

Une page GitHub Pages qui rejoue l'**alpha ouverte d'Outer Wilds** (version 1.2,
Unity 4.1.2f1, décembre 2013). Elle ne contient rien du jeu : on lui donne sa
propre copie du build Linux, et tout est reconstruit dans le navigateur.

## Ce dépôt ne contient pas le jeu, et la page ne le sert pas

Outer Wilds est l'œuvre d'Alex Beachum et de Mobius Digital. Aucun binaire,
asset ni source décompilée n'est versionné ici, et **le site publié n'en héberge
aucun non plus** : il ne contient que le moteur et le pipeline d'analyse.

C'est la personne qui visite la page qui fournit son fichier. Celui-ci n'est pas
téléversé : il est lu dans l'onglet, décompressé dans un Web Worker, et tout ce
qui en sort reste dans le stockage privé de son navigateur. Aucune requête
réseau n'est faite avec son contenu.

Un garde-fou d'intégration continue (`scripts/check-no-assets.mjs`) fait échouer
la publication si un fichier du jeu entre au dépôt.

## Utilisation

Ouvrir la page, déposer `OuterWilds_Alpha_1_2_Linux.zip` (289 268 118 octets,
SHA-256 `5c7defad…80f05a`). L'extraction complète prend environ **70 secondes**
et n'est faite qu'une fois : elle est conservée d'une visite à l'autre.

Une manette est lue si elle est branchée : elle produit exactement les mêmes
axes et les mêmes commandes que le clavier, et l'invite à l'écran porte déjà
l'icône du bouton que le jeu attend
([`docs/35-monde.md`](docs/35-monde.md) §7).

Sur téléphone ou tablette, la page se joue **en paysage**, avec la disposition
d'un FPS mobile : deux manches — le gauche déplace, le droit regarde, glissé
pour viser et tenu pour tourner — des gâchettes le long du bord haut, un losange
d'action à droite, une croix directionnelle dans les menus, la carte au
pincement. Rien de tout cela ne vient du jeu, qui est fait pour le clavier et la
manette — voir [`docs/33-mobile.md`](docs/33-mobile.md).

En local :

```bash
web/fetch-deps.sh    # Babylon.js dans web/vendor (non versionné)
web/serve.sh         # http://localhost:8080/
```

Le Service Worker exige une origine sûre : `localhost` en est une, un fichier
ouvert en `file://` n'en est pas une.

## Ce que le navigateur reconstruit

| Sortie | Contenu |
|---|---|
| `data/scene/level0.json` | 7 688 nœuds, 16 271 composants, hiérarchie et transforms |
| `data/components/level0.json` | 1 390 MonoBehaviour avec la **valeur** de leurs champs |
| `data/solar_system.json` | 17 corps : positions, rayons, gravité, constantes de vol |
| `data/gameplay.json` | vaisseau, ressources, 39 interactifs, 34 lisibles, 16 spawns |
| `data/gltf/*.gltf` | 9 corps en glTF 2.0, hiérarchie, matériaux, squelettes, animations |
| `data/audio/` | 48 clips, 97 sources placées et 17 zones d'ambiance |
| `data/particles/` | 135 systèmes de particules et leurs textures |
| `data/shaders/` | 121 sources ShaderLab et leur classement |
| `data/dialogue/` | 26 arbres de dialogue, 72 branches, 14 conversations |
| `data/interface/` | 46 invites à l'écran, 4 polices, jauges et icônes |
| `data/lighting.json` | lumières placées de la scène et `RenderSettings` |
| `data/scene/maindata.json` | scène de démarrage et managers, en inventaire |

## Comment ça marche

Le pipeline était en Python (UnityPy plus un backend .NET), donc inutilisable
depuis une page web. Il a été porté en JavaScript, module par module.

```
archive ZIP  ──►  DecompressionStream  ──►  stockage privé de l'origine
                                                   │
        lecture paresseuse (FileSystemSyncAccessHandle)
                                                   ▼
   fichiers sérialisés Unity 4.1   ◄──►   assemblies .NET (ECMA-335)
        (structures moteur)              (type trees des MonoBehaviour)
                                                   │
                                                   ▼
                        extracteurs  ──►  data/…  ──►  Service Worker  ──►  moteur
```

Trois difficultés valaient d'être résolues plutôt que contournées :

- **Le build est *stripped*.** `typeCount` vaut 0 : aucune structure n'est
  décrite dans les fichiers. Celles du moteur viennent des dumps publics
  d'AssetRipper ; celles des MonoBehaviour sont **régénérées depuis les
  assemblies**, en lisant les métadonnées ECMA-335 et en appliquant les règles
  de sérialisation d'Unity. Voir [`docs/03-typetrees.md`](docs/03-typetrees.md).
- **540 Mo ne tiennent pas en mémoire.** Les fichiers sont lus à la demande,
  par `FileSystemSyncAccessHandle` : un fichier sérialisé n'a besoin en
  permanence que de son en-tête, 48 Ko pour les 410 Mo de `sharedassets1`.
- **Les invites à l'écran vivent dans le code.** Le pipeline Python les lisait
  dans la source décompilée par ILSpy. Ici, les corps de méthode sont lus
  directement en IL — quelques instructions repérées et rapprochées, pas une
  décompilation.

## Vérification

L'oracle est le même partout et il est strict : **lire un objet doit consommer
exactement ses `byteSize` octets**. Un seul champ mal placé, mal dimensionné ou
oublié fait échouer le test.

```bash
OW_BUILD=/chemin/vers/OuterWilds_Alpha_1_2_Data node scripts/run-tests.mjs
```

| Contrôle | Résultat |
|---|---|
| Objets du build lus au bit près | 26 376 objets moteur, 142 clips audio |
| MonoBehaviour de `level0` | **1 390 / 1 390** (pipeline Python : 1 364) |
| Textures décodées | 399, dont DXT1/DXT5/ARGB32/RGB24 identiques à UnityPy au pixel près |
| Maillages décodés | 1 569, 929 529 sommets, concordants avec UnityPy |
| Clips d'animation décodés | flux Mecanim et courbes legacy, mêmes valeurs que le décodeur Python |
| Pipeline complet dans Chromium | 70 s, mêmes chiffres que le pipeline Python |
| Logique de jeu, sans le build | 580 vérifications : mort et flashback, supernova, dégâts par pièce, LOD, éviction, courbes de particules, manches tactiles et manette, rotation propre, champs de force, fluides, occlusion quantique, conteneur Ogg |

Ce qui peut se vérifier sans le jeu l'est sans lui : le décodage des clips
d'animation s'éprouve sur un flux fabriqué, l'export glTF sur un monde de
trois objets, et toute la logique de jeu — mourir, exploser, s'abîmer, alléger
la scène — sur des états construits à la main. Le reste s'annonce ignoré plutôt
que d'échouer : rien n'oblige jamais l'intégration continue à héberger le jeu.

## Le pipeline Python

`tools/` reste en place pour le travail local : il fait des choses que le
navigateur ne fait pas (décompilation complète par ILSpy, inventaire, export
d'assets en vrac). `tools/16_unity_types.py` est le seul dont la sortie est
versionnée — ce sont les structures du format Unity 4.1, pas du contenu du jeu.

Voir [`docs/`](docs/README.md) pour l'analyse du jeu lui-même : gravité, orbites, boucle
temporelle, dialogues, shaders, et le reste.
