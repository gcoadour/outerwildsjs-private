# Ce qui manque encore pour un portage complet

Inventaire fondé sur les composants et assets réellement présents dans le
build, pas sur une impression. Ce document dit honnêtement où en est le
portage.

## Ce qui est porté

| système | état |
|---|---|
| gravité par champs dominants | complet, modèle du jeu |
| orbites et référentiels | complet, 0,00 % de dérive |
| floating origin | complet, ancré sur le corps dominant |
| géométrie des 7 corps | complète, 69 Mo en glTF |
| matériaux et textures | 251 matériaux, 200 textures, normales désentrelacées |
| collision | Havok, colliders trimesh du corps ancré |
| déplacement du joueur | constantes réelles |
| ressources | oxygène, carburant, santé, intégrité |
| vaisseau | embarquement, vol, appui au sol |
| détection d'interaction | 39 interactifs, 34 lisibles |
| audio spatial | 92 sources, 31 clips, instanciation à la volée |
| particules | 135 systèmes, 15 textures, budget de 14 simultanés |
| atmosphères et soleil | shaders maison, 122 shaders classés |
| boucle temporelle | 20 min, supernova, onde de choc, mort, redémarrage |
| dialogues et mémoire | 26 arbres, 72 branches, connaissance persistante |
| lune quantique | 4 orbites hôtes, effondrement à la perte de vue |
| trou noir / trou blanc | capture, éjection en cône, effondrement de croûte |
| Dark Bramble | prédateurs sensibles au bruit, croissance des ronces |
| secteurs | bascule géométrie/substitution **et téléchargement**, 3 corps sur 12 |
| poids au démarrage | 60,0 Mo pour la première image, contre 199,6 avant |
| pilote auto et dégâts | 4 phases, seuils d'impact 15/30/300 |
| carte du système | orbites, marqueurs, sélection de cible |
| shaders du jeu | **203 affectations**, tous les shaders utilisés couverts |
| skinning | 55 squelettes, 33 maillages skinnés, décodage direct |
| animations | 33 animations, 8 148 canaux, Mecanim compris |
| connaissance | codes, exploration et boucle persistants et signifiants |
| outils | télescope ×6 et lanceur de sonde, 3/6 savoirs gagnables |
| interface de dialogue | proportions du build, curseur, sondes rendues |
| jauges et invites | textures du casque, 46 invites triées par priorité |
| brouillards | Dark Bramble et coque quantique, masquage et lumières |
| croûte de Brittle Hollow | 122 fragments : 72 tombent, 50 se brisent |
| minicarte | globe du secteur, traces de 100 points |
| réglages | 7 options, sauvegarde distincte de la partie |
| polices | les 4 polices du jeu, réparties par rôle |
| ordinateur de bord | 7 notices de lieu, ouvertes par l'exploration |
| lampe et guimauve | portée 80, grillage en 5 s |
| mort et flashback | 5 causes, 22 images, 8,21 s, commandes coupées |
| supernova | progression, contraction, explosion, onde de choc |
| dégâts du vaisseau | pièces, propulseurs coupés, destruction |
| LOD par maillage | hauteur relative à l'écran, parcours tournant |
| éviction | un corps quitté depuis 45 s est libéré |
| champ de débris | ce qui tombe ressort au trou blanc, 750 u |
| caméra de sonde | vue embarquée dans un coin de l'écran |
| vérification | `tools/15_verify.py` en navigateur, `tests/09-jeu.mjs` sans le jeu |

## Ce qui manque, par famille

La liste par système a fondu : les entrées qui restaient ouvertes ont été
reprises une par une (voir l'historique des pages ci-dessous). Ce qui reste ne
se range plus par mécanique mais par **nature de l'obstacle**, et c'est plus
utile ainsi — la moitié de ce qui manque ne se comble pas en portant mieux.

### 1. Ce qui n'est pas dans le build

Aucune de ces choses ne s'obtient en travaillant davantage : elles ne sont pas
dans l'alpha.

| manque | ce que le build en dit |
|---|---|
| l'espace replié de Dark Bramble | aucun volume de distorsion ; le conteneur s'appelle `DarkBramble_TestBed` |
| quatre des cinq savoirs | un seul a une source vivante ; les autres sont du code mort |
| le déblocage par branche de dialogue | les 20 attributs `eventbased` valent tous `"false"` |
| les machines à états d'animation | 11 états, **zéro transition** dans tout le build |
| les dégâts localisés du vaisseau | masque et modificateurs à **0** : la mécanique est câblée, les réglages ne l'allument pas |
| les éclats de fracture | `if (_debrisShardPrefab != null) { }` est un bloc vide |
| le modèle de sonde | `_probePrefab` n'est pas résolu |
| les images du flashback | rien à rejouer : le jeu ne stocke pas de mémoire visuelle |
| la courbe de dégâts d'impact | les seuils sont là, la fonction qui les relie n'y est pas |
| `RocketKidConvoController`, l'entraînement, le ciblage | aucune source |

### 2. Ce qui demande un œil ou une oreille humaine

Tout est vérifié au chiffre, rien ne l'est au rendu.

- **L'équilibrage des volumes audio** — les portées sont choisies par piste,
  faute de `m_MinDistance` sur Unity 4.
- **L'équilibrage visuel des particules** — les tailles vont jusqu'à 140 unités.
- **Le rendu général** : atmosphères, surface stellaire, brouillards et
  explosion sont des implémentations originales visant un résultat comparable,
  pas des transpositions de shaders.
- **Une partie jouée**, tout simplement.

### 3. Ce qui reste techniquement ouvert

- **La distorsion** reste une approximation délibérée : capturer le fond
  demanderait un second rendu complet de la scène — doubler les 6,1 ms — pour
  **deux matériaux dans tout le jeu**.
- **Le LOD ne fait que deux niveaux**, présent ou absent, là où un `LODGroup`
  en enchaîne plusieurs sur des maillages simplifiés.
- **Les 21 `ChildColliderLOD`** : les colliders sont posés d'un bloc sur le
  corps ancré.
- **15 Mo de WAV non compressés** et **11,1 Mo de Babylon** sur les 66 du
  démarrage (voir [`27-poids.md`](27-poids.md)).
- **Le son comme signal** pour les prédateurs : le bruit est déduit des
  commandes du joueur, pas des sources sonores réelles.
- **`_checkDepth = 100`** de la lune quantique : le test d'occlusion est
  binaire, là où le jeu lance une sphère sur une profondeur.
- **`AlignQuantumMoon`**, **`CorruptionAnimator`**, **`_vanishEffectPrefab`**.
- **Les pièces du vaisseau n'ont pas de géométrie propre** : une pièce morte se
  lit dans son état, elle ne se voit pas sur la coque.

## Où lire le détail

| ce qui a été fermé | page |
|---|---|
| mort, flashback, supernova | [`32-mort.md`](32-mort.md) |
| dégâts par pièce, destruction, limite de poussée | [`18-vaisseau.md`](18-vaisseau.md) |
| LOD par maillage, éviction, éclairage ambiant | [`17-secteurs.md`](17-secteurs.md) |
| occlusion et inclinaison de la lune quantique | [`14-quantique.md`](14-quantique.md) |
| champ de débris du trou blanc | [`15-trounoir.md`](15-trounoir.md) |
| coupure passe-bas des émetteurs | [`09-audio.md`](09-audio.md) |
| courbes variables et `gravityModifier` | [`10-particules.md`](10-particules.md) |
| mort par prédateur | [`16-bramble.md`](16-bramble.md) |
| caméra embarquée de la sonde | [`25-interface.md`](25-interface.md) |

## Estimation honnête

Le socle — physique, orbites, référentiels, géométrie, collision — est fait
depuis longtemps, et c'est lui qui conditionnait tout le reste. Ce qui manquait
ensuite était du **volume** de logique de jeu ; il a été porté système par
système.

Ce qui reste tient en une phrase : **le contenu que l'alpha n'a pas, et le
jugement qu'une machine ne rend pas**. Le premier ne se comble pas ; le second
demande quelqu'un qui joue, regarde et écoute.
