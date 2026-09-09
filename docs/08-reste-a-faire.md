# Ce qui manque encore pour un portage complet

Cette page fait l'inventaire de l'**état** du portage.
[`34-actions.md`](34-actions.md) reprend la comparaison sous forme d'**actions
ordonnées**, et [`35-monde.md`](35-monde.md) raconte ce qu'a donné leur mise en
œuvre : l'essentiel de ce qui manquait était **déjà extrait, et personne ne le
lisait**.

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
| déplacement du joueur | **marche, course d'élan, saut et sac dorsal, aux constantes du build** |
| ressources | oxygène, carburant, santé, intégrité |
| vaisseau | embarquement, vol, **inertie de rotation et roulis**, appui sur le terrain réel |
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
| animations | 34 animations, 8 148 canaux, Mecanim compris (mesure) |
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
| commandes tactiles | manche analogique, regard, 18 boutons, carte au pincement |
| jeu en paysage | HUD, dialogue et réglages bornés pour un écran de 800 × 370 |
| rotation propre et jour/nuit | appliquée au repère ancré, le sol ne bouge pas |
| lumières placées | extraites, instanciées à la volée dans un budget de 8 |
| portées audio | `MinDistance` / `MaxDistance` / `rolloffMode` du build |
| champs directionnels | 34 volumes, prioritaires sur le champ radial |
| fluides | densité, poussée d'Archimède, **courants et tornades**, traînée du détecteur |
| zones d'oxygène et chaleur | ramassées par motif, avec le volume de leur collider |
| manette | Gamepad API, mêmes axes et mêmes codes que le clavier |
| caméras déportées | les deux consoles réutilisent la vue de la sonde |
| `mainData` | inventorié : scène de démarrage et managers |
| référentiels | positions **et vitesses** reportées au changement d'ancre |
| repère tournant | Coriolis et force centrifuge : le sol défile sous un stationnaire |
| colliders par portée | les 21 `ChildColliderLOD` endorment leur sous-arbre |
| départ de la partie | **au point d'apparition du build, à sa hauteur et dans son regard** |
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
| l'entraînement et le ciblage | aucune source |

> **Corrigé par la mesure** ([`36-audit.md`](36-audit.md)).
> `RocketKidConvoController` **est** dans le build, lisible, et porte trois
> arbres (`_introduction`, `_successfulLanding`, `_tooManyCrashes`). Il sort
> donc de cette liste : c'est un manque du portage, pas de l'alpha.

### 2. Ce qui demande un œil ou une oreille humaine

Tout est vérifié au chiffre, rien ne l'est au rendu.

- **L'équilibrage des volumes audio** — les portées sont désormais celles du
  build (`MinDistance`, `MaxDistance`, `rolloffMode`, voir
  [`35-monde.md`](35-monde.md) §2). L'oreille juge donc enfin des valeurs du
  jeu, mais elle n'a pas encore jugé.
- **L'équilibrage visuel des particules** — les tailles vont jusqu'à 140 unités.
- **Le rendu général** : atmosphères, surface stellaire, brouillards et
  explosion sont des implémentations originales visant un résultat comparable,
  pas des transpositions de shaders.
- **La première image du jeu** — le pose de départ vient désormais du build
  ([`38-depart.md`](38-depart.md)) : point d'apparition du joueur, sa hauteur,
  sa rotation. Le **rendu** de cette image, lui, n'est pas mesuré — ciel de
  nuit, nuages de Timber Hearth, lumière de la lune. Les nuages, en
  particulier, n'ont aucun lecteur dans le portage, et personne n'a encore
  demandé au build ce qu'ils sont.
- **Une partie jouée**, tout simplement.

### 3. Ce qui reste techniquement ouvert

- **La distorsion** reste une approximation délibérée : capturer le fond
  demanderait un second rendu complet de la scène — doubler les 6,1 ms — pour
  **deux matériaux dans tout le jeu**.
- **Les niveaux de détail du build** ne valent pas ce qu'on en attendait.
  Mesure faite ([`36-audit.md`](36-audit.md)) : `level0` ne contient que
  **deux** objets de classe `LODGroup` (205), et les cinq `CreateLODGroup` ont
  des champs **vides**. `lodThresholds()` n'en tire donc aucun seuil, et
  régénérer `unity41-types.json` n'y changerait presque rien. Le seuil unique
  de 0,0022 reste la règle, et l'effort utile est ailleurs : les 21
  `ChildColliderLOD`, et les impostures de `LODCameraSnapshot` (×5).
- ~~**Les 21 `ChildColliderLOD`** sont extraits, mais les colliders sont
  toujours posés d'un bloc.~~ **Fermé** ([`37`](37-corrections.md) §7) : un
  groupe hors de portée n'entre plus dans la construction, et l'ensemble
  éveillé est réévalué en continu — mais reconstruit au plus une fois toutes
  les deux secondes, parce que reconstruire coûte près d'une seconde.
- **Les impostures de planète** (`LODCameraSnapshot` ×5, `_snapshotInterval` 1)
  restent ouvertes : le jeu affiche un système entier parce que les planètes
  lointaines sont des textures rafraîchies une fois par seconde. Le portage a
  résolu le même problème autrement — sphères et secteurs — ce qui est
  légitime, mais le ciel n'y ressemble pas.
- **11,1 Mo de Babylon** sur les 66 du démarrage
  ([`27-poids.md`](27-poids.md)) : les réduire demande une étape de
  construction, que le dépôt n'a pas. C'est un choix de projet, pas une
  optimisation à faire en passant.
- **Les 15 Mo de WAV** sont réencodés en Opus à l'extraction (WebCodecs, repli
  WAV) — le gain réel n'a pas encore été mesuré sur un build.
- **`_vanishEffectPrefab`**, et **les pièces du vaisseau sans géométrie
  propre** : une pièce morte se lit dans son état, elle ne se voit pas sur la
  coque.
- **Le portrait n'a pas d'interface propre.** La manette, elle, est lue
  ([`35-monde.md`](35-monde.md) §7).

### 4. Ce que la comparaison extracteurs / moteur avait fait apparaître

Des données du build **déjà extraites, et que rien ne lisait**. Les neuf écarts
relevés par [`34-actions.md`](34-actions.md) sont maintenant branchés — rotation
propre, portées audio, lumières, `RenderSettings`, `_checkDepth`, champs
directionnels, fluides, `mainData`, zones d'oxygène — et
[`35-monde.md`](35-monde.md) dit comment.

Ce qu'il faut en retenir vaut pour la suite : **avant de conclure qu'une chose
manque au build, vérifier qu'on la lit**. Six des neuf écarts étaient des
lecteurs absents, pas des données absentes.

C'est fait : [`36-audit.md`](36-audit.md) a mesuré ces extracteurs sur le build,
et [`37-corrections.md`](37-corrections.md) dit ce que ses neuf actions ont
donné. La leçon se prolonge d'une seconde — **avant de conclure qu'on lit une
chose, la mesurer** : quatre des écarts de l'audit étaient des lecteurs
présents qui lisaient à côté, et deux étaient des tests qui gardaient le vide.

Les chiffres de l'audit sont désormais des invariants de `tests/05-extract.mjs`
plutôt que des phrases : tous les volumes de fluide portent une densité, des
volumes portent un courant et ce sont des capsules, aucune source audio n'est
en atténuation linéaire, et aucun pointeur de contrôleur de dialogue ne vise
autre chose qu'un texte.

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
| commandes tactiles et jeu en paysage | [`33-mobile.md`](33-mobile.md) |
| rotation, lumières, fluides, champs, manette | [`35-monde.md`](35-monde.md) |

## Estimation honnête

Le socle — physique, orbites, référentiels, géométrie, collision — est fait
depuis longtemps, et c'est lui qui conditionnait tout le reste. Ce qui manquait
ensuite était du **volume** de logique de jeu ; il a été porté système par
système.

Puis une seconde nature de manque est apparue, moins attendue : **ce qui était
extrait et que rien ne lisait**. Elle est comblée
([`35-monde.md`](35-monde.md)), et il n'y avait presque rien à écrire — seulement
à ouvrir des fichiers qu'on écrivait déjà.

Ce qui reste tient en une phrase : **le contenu que l'alpha n'a pas, et le
jugement qu'une machine ne rend pas**. Le premier ne se comble pas ; le second
demande quelqu'un qui joue, regarde et écoute. S'y ajoute, pour un temps, une
troisième chose : **des comptes à relever sur un vrai build**, que les
extracteurs neufs sortiront à la première extraction.
