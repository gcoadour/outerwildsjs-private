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
| vérification | `tools/15_verify.py`, 30 invariants dans un vrai navigateur |

## Ce qui manque, par ordre de coût

### 1. Shaders — partiellement porté (voir `docs/11-shaders.md`)

Les 122 shaders sont exportés et classés : **85 sont des shaders Unity
standard** (inutile de les réécrire, un matériau Babylon suffit) et **37 sont
écrits par l'équipe**.

**Premier lot appliqué** (voir `docs/20-shaders-jeu.md`) : 200 affectations
traitées via cinq familles — `diamond shader`, `DoubleSidedCutout*`,
`SelfIllumin*` — plus la coque atmosphérique et la surface stellaire.

**Second lot fait** : `RimShader`, `CrackShader`, `DistortionShader` et
`FireBall` portent le total à **203 affectations, 0 erreur**. Tous les shaders
du jeu effectivement utilisés dans la scène sont traités ; les 18 jamais
utilisés sont laissés de côté délibérément.

La mesure d'usage avait corrigé une erreur de ma part : `CrackShader`,
`RimShader` et `HeatDistortion` ne portaient PAS l'identité visuelle.

Reste approximatif : la distorsion, faute de capture du fond dans une texture
intermédiaire.

### 2. Audio — porté (voir `docs/09-audio.md`)

**92 sources** et **31 clips** exportés et joués en spatial, le **mixage par
piste** avec ses fondus, et les **neuf émetteurs de signal** — dont la
découverte que leurs rayons sont des distances **en pixels à l'écran** : on
trouve un signal en visant à la lunette, et le volume de celle-ci est la somme
des forces des émetteurs visés.

Restent : la coupure passe-bas des `AudioTransmitter`, et une écoute humaine
pour équilibrer les volumes.

### 3. Particules — portées (voir `docs/10-particules.md`)

**135 systèmes** et 15 textures exportés et rendus, avec budget et
instanciation à la volée. Restent : les courbes variables, aplaties à leur
scalaire ; les modules secondaires (couleur, taille, vitesse, force, rotation,
animation de sprites, collision) ; `gravityModifier`, à brancher sur le champ
dominant ; et l'équilibrage visuel, qui demande un œil humain.

### 4. Animation — skinning porté (voir `docs/21-skinning.md`)

Le décodage direct des flux de sommets remplace l'intermédiaire OBJ :
**55 squelettes et 33 maillages skinnés** exportés sur les neuf corps, poids
sommant à 1 à 4,5 × 10⁻⁸ près, chargés par Babylon en squelettes de 53 à 58 os.

**Animations portées**, Mecanim compris (voir `docs/22-animations.md` puis
`docs/26-muscleclip.md`). Les 16 clips se répartissent en 7 legacy et 9
Mecanim ; ces derniers laissaient leurs courbes vides, tout vivant dans
`m_MuscleClip`. Le flux est décodé : **33 animations, 8 148 canaux, 0 os non
résolu**, et Timber Hearth passe de 0 à 17 animations — précisément les
villageois.

Les **tangentes** sont portées aussi : 4 022 canaux en `CUBICSPLINE`. Quant aux
`AnimatorController`, il n'y a **rien à porter** — 11 états et zéro transition
dans tout le build (voir 6 bis).

### 5. Dialogues — portés (voir `docs/13-dialogue.md`)

**26 arbres, 72 branches, 44 options**, 13 des 14 conversations reliées, et la
**mémoire entre boucles** qui survit à la supernova et au rechargement. Sur les
73 TextAsset, 47 sont en fait les textes bruts des objets lisibles, pas des
dialogues.

**La connaissance débloque désormais le jeu** (voir `docs/23-connaissance.md`) :
les codes de lancement conditionnent le décollage, l'exploration remplit la
carte, les drapeaux de `PlayerData` sélectionnent l'arbre de dialogue, et tout
survit à la supernova comme au rechargement.

À noter : les 20 attributs `eventbased` du build valent tous `"false"` — le
déblocage se fait au niveau des arbres entiers, pas des branches.

**Outils portés** (voir `docs/24-outils.md`) : télescope (60° → 10° en 2 s) et
lanceur de sonde, tous deux portés par la caméra du joueur dans la scène.
L'audit des cinq savoirs montre qu'**un seul a une source vivante** dans le
build ; les autres sont du code mort ou des drapeaux jamais câblés.

Correction : les codes de lancement viennent des **conversations**
(`CuratorConvoController`), pas du vaisseau — `LaunchTerminal` se contente
d'écouter l'événement.

**Interface de dialogue portée** (voir `docs/25-interface.md`) aux proportions
du build (1200×300, 50 caractères sur 4 lignes pour un personnage, 70 sur 5
pour un panneau), avec curseur au clavier. Le rendu des sondes est en place.

Restent : l'entraînement et le ciblage sans source dans le build, le modèle de
sonde (`_probePrefab`), la caméra embarquée, et `RocketKidConvoController`.

### 6. Logique du vaisseau — portée (voir `docs/18-vaisseau.md`)

Pilote automatique en quatre phases (alignement, vol, approche, égalisation) et
modèle de dégâts aux seuils réels. Vérifié : trajet de 3 000 u avec pointe à
375 u/s et arrivée à 50 u d'erreur.

Restent : la courbe de dégâts exacte, que le build ne donne pas ; les dégâts
localisés par pièce ; la destruction du vaisseau ; et la sélection de cible,
qui suppose la carte.

### 6 bis. Trois limites mesurées plutôt que supposées

Trois points restaient au tableau « à faire ». Les avoir mesurés en a supprimé
deux et chiffré le troisième.

- **Machines à états d'animation** — *rien à porter*. Les huit
  `AnimatorController` totalisent 11 états et **zéro transition** ; les trois
  qui ont deux états n'ont aucun moyen d'aller de l'un à l'autre. Voir
  `docs/22-animations.md`.
- **Coût des ombres** — *3,3 ms par image*, mesuré à l'instrumentation de scène
  (9,4 ms allumées contre 6,1 éteintes) et non au compteur d'images, trop
  bruité sous rendu logiciel.
- **Shader de distorsion** — *approximation délibérée*. Capturer le fond
  demanderait un second rendu complet de la scène, soit doubler les 6,1 ms, pour
  **deux matériaux dans tout le jeu**. Voir `docs/20-shaders-jeu.md`.

### 7. Mécaniques spéciales

- **Lune quantique** : **portée** (voir `docs/14-quantique.md`). Elle change de
  planète hôte dès qu'on cesse de la regarder, parmi quatre orbites. Son
  **brouillard est porté** (voir `docs/29-brouillards.md`) : une coque opaque de
  100 à 110 unités, fondue sur 30 de part et d'autre, dont la sortie force
  l'effondrement. Restent le test d'occlusion et l'inclinaison d'orbite.
- **Dark Bramble** : **porté** (voir `docs/16-bramble.md`). Découverte au
  passage : **l'espace replié n'existe pas dans cette alpha** — aucun volume de
  distorsion, et le conteneur s'appelle `DarkBramble_TestBed`. `BrambleManager`
  fait croître les ronces, il ne gère pas de dimension. Les prédateurs
  sensibles au bruit sont portés, et le **brouillard aussi** (voir
  `docs/29-brouillards.md`) : 1200 → 1400 unités, décroissance cubique jusqu'à
  une densité de 0,01. Restent `FogCloak`, `FogLight` et la mort.
- **Brittle Hollow** : **porté** (voir `docs/15-trounoir.md`). Capture à 40 u,
  éjection au trou blanc dans un cône de 60°, effondrement de 25 % de la croûte
  au fil de la boucle. Restent la chute réelle des fragments, le champ de
  débris et les effets visuels.

Chacune est une mécanique de jeu entière, pas un détail de rendu.

### 8. Boucle temporelle — portée (voir `docs/12-boucle.md`)

La boucle fait **20 minutes** dans cette alpha, pas 22 : le build porte
`_loopDurationInMinutes = 20`. Compte à rebours, supernova, onde de choc à
2 000 u/s, mort et redémarrage sont portés et vérifiés sur quatre cycles.

Restent : **la mémoire entre boucles**, qui est tout l'intérêt du jeu et
suppose le système de dialogue et `PlayerData` ; la séquence de flashback ; le
spectacle de la supernova ; les autres causes de mort.

### 9. Interface — carte portée (voir `docs/19-carte.md`)

La carte du système solaire est en place (touche **M**) : orbites, marqueurs
typés, zoom borné aux valeurs du jeu, et sélection de cible qui engage le
pilote automatique.

**`PlayerResourceGUI` et `PromptManager` sont portés** (voir `docs/28-hud.md`) :
les jauges d'oxygène et de carburant avec leurs textures et leurs formules
d'animation, la silhouette de santé à quatre paliers, la vignette rouge, les
alertes, et les 46 invites du jeu réparties en trois zones avec leur tri par
priorité.

**`Minimap`, `AutopilotGUI` et `GUIMode` sont portés** eux aussi : la minicarte
est un globe vu depuis la direction du joueur, avec ses traces de 100 points à
5 degrés d'écart ; les dix messages du pilote automatique sont repris au mot
près ; et les quatre modes d'affichage cachent bien ce qu'ils doivent — en mode
capture, l'invite du centre reste, celles du bas et de la gauche partent.

**`SettingsMenu` est porté** lui aussi — j'avais eu tort de l'écarter : sept
options, dont cinq portent sur quelque chose que ce portage possède, et trois
sont persistées dans une sauvegarde distincte de celle de la partie. Les icônes
de manette des invites sont reprises, et la minicarte lit le drapeau
`_useMinimap` du secteur plutôt qu'une heuristique de distance.

Les **marqueurs de carte** suivent maintenant `MapMarker` — crochets dessinés,
deux couleurs, distances d'affichage —, la disposition du menu est celle de la
scène, et les **quatre polices du jeu** sont enfin utilisées : elles étaient
extraites depuis le début sans que rien ne s'en serve.

### 10. Secteurs et LOD — porté (voir `docs/17-secteurs.md`)

Chaque corps bascule entre géométrie complète et sphère de substitution selon
le secteur. Mesuré : **3 corps actifs sur 12** au sol.

Le **chargement à la demande** est branché sur cette même mesure de distance
(voir `docs/27-poids.md`) : seuls le corps de départ et le soleil partent avant
la première image, les autres arrivent 3 000 unités avant d'être affichés.

Restent : le LOD par maillage, l'éviction (rien n'est jamais déchargé), et
l'application réelle des limites de poussée et d'éclairage ambiant.

## Estimation honnête

Le socle — physique, orbites, référentiels, géométrie, collision — est fait, et
c'est la partie qui conditionnait tout le reste. Ce qui manque est surtout du
**volume** : ~31 600 lignes de logique de jeu dont une fraction est portée, plus
le rendu et le contenu.

Trois familles ont été traitées depuis :

- **Le poids au démarrage** (`docs/27-poids.md`) : 199,6 Mo avant la première
  image, 60,0 Mo après.
- **L'interface** (`docs/28-hud.md`) : jauges de ressources et 46 invites.
- **Les brouillards** (`docs/29-brouillards.md`) : Dark Bramble et la coque
  quantique.

Ce qui reste tient en trois familles :

- **Le contenu absent du build.** Un seul des cinq savoirs a une source vivante,
  les 20 attributs `eventbased` valent tous `"false"`, et l'espace replié de
  Dark Bramble n'existe pas. Ces manques-là ne se comblent pas en portant mieux.
- **La finition par mécanique.** Chute réelle des fragments de croûte,
  `FogCloak` et `FogLight`, modules secondaires de particules, tangentes
  d'animation, distorsion, machines à états d'animation.
- **La profondeur dans les systèmes déjà portés.** Le passe-bas des émetteurs,
  l'équilibrage des volumes, le LOD par maillage, l'éviction, les 11,1 Mo de
  Babylon sur les 66, les 15 Mo de WAV non compressés.
- **Une partie jouée par un humain.** Tout est vérifié au chiffre, rien ne l'est
  à l'œil ni à l'oreille.
