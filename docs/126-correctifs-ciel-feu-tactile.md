# Correctifs visuels et tactiles — voûte céleste, feu de camp et boutons mobiles

Ce document consigne les diagnostics et correctifs appliqués à la suite des tests sur iPhone (iOS Safari / WebGL Metal sur `gcoadour.github.io`), illustrés par les captures d'écran des artefacts célestes, des sphères au feu de camp et de la persistance des boutons verticaux.

---

## 1. Rayons psychédéliques cyan et magenta au zénith

### Symptômes observés
- En levant les yeux vers le ciel nocturne depuis Âtrebois (Timber Hearth), un grand disque noir centré au zénith est entouré d'une immense gerbe radiale de rayons cyan, mauves et magenta qui s'étirent en éventail sur tout l'écran.

### Causes racines
1. **Échec de correspondance du shader Unity** :
   Dans l'alpha Unity originale, la sphère d'atmosphère `SkyShell` (`pSphere2`) utilise le shader `Custom/Atmosphere`. Dans `web/src/shaders/index.js`, la condition de correspondance était un test d'égalité stricte `name === "Atmosphere"`. En raison du préfixe de catégorie Unity `Custom/`, la condition échouait silencieusement et la voûte conservait le matériau PBR opaque généré par défaut.
2. **Export glTF en mode OPAQUE** :
   Dans le pipeline d'extraction (`web/src/pipeline/extract/gltf.js`), la fonction `alphaMode(shaderName)` ne traitait pas `Atmosphere` comme transparent. Le modèle glTF résultant avait donc `alphaMode: "OPAQUE"`.
3. **Pincement des UVs au pôle opposé au soleil** :
   `sky.lookAtSun` aligne le pôle `+Z` de la sphère vers le soleil. La nuit, le soleil se trouve à environ -77° sous l'horizon, ce qui projette le pôle opposé (`-Z`) directement vers le zénith du joueur. Aux pôles d'une sphère UV, les coordonnées se rejoignent et les triangles polaires étirent les pixels des bordures de la texture `atmosphere_blue.png`. En mode de répétition par défaut (`WRAP_ADDRESSMODE`) et sans alpha blending, cet étirement produit une anomalie visuelle sévère (déjà documentée dans `docs/41-ciel.md`).

### Correctifs appliqués
- **Normalisation des noms de shaders** dans `web/src/shaders/index.js` via `const base = name.split("/").pop();`, permettant de faire correspondre indifféremment `Custom/Atmosphere` ou `Atmosphere`.
- **Mode BLEND dans l'export glTF** : ajout de `atmosphere` (ainsi que `fireball`, `distort`, `v-fog`, `crack`, `rim`, `diamond`) dans les motifs reconnus par `alphaMode()` dans `web/src/pipeline/extract/gltf.js`.
- **Configuration du matériau Babylon.js** dans `applyAlphaBlend` :
  - `mat.useAlphaFromAlbedoTexture = true;` pour utiliser le canal alpha de `atmosphere_blue.png`.
  - `tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;` et `tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;` pour empêcher le débordement de texture aux pôles.
  - `mat.backFaceCulling = false;` (`cullOff = true`) pour garantir la visibilité de la voûte depuis la surface de la planète.
  - Suppression de l'assignation emissive (`emissiveColor = (0, 0, 0)` et `emissiveTexture = null`) pour éviter d'illuminer la voûte en pleine nuit.
  - `sky.shell.isPickable = false;` dans `main.js` afin que la géométrie de la voûte ne bloque pas les rayons de détection et d'interaction.

---

## 2. Sphères blanches et grises opaques sur le feu de camp

### Symptômes observés
- Au feu de camp de Slate, une sphère opaque grise/blanche reposait au centre des pierres du foyer, accompagnée d'une seconde sphère lumineuse blanche sur son flanc droit.

### Causes racines
1. **Géométrie Unity du feu de camp** :
   Le préfabriqué `Props_HEA_Campfire` contient deux sphères imbriquées :
   - Une grande sphère portant le shader `DistortionShader` pour l'ondulation thermique de l'air chaud au-dessus des flammes.
   - Une plus petite sphère portant `FireBall` pour le cœur lumineux du feu.
2. **Mode multiplicatif sans GrabPass sous WebGL Metal** :
   Le shader de distorsion (`makeDistortion` dans `web/src/shaders/distortion.js`) utilisait `BABYLON.Engine.ALPHA_MULTIPLY` avec un fragment shader retournant une couleur blanche et `alpha = 1.0`. Sur les pilotes Metal d'iOS Safari, un maillage multiplicatif sans tampon de réfraction (`GrabPass`) se compose comme un volume opaque solide blanc ou grisâtre.
3. **Texture de normales (bump) manquante** :
   En l'absence de `bumpTexture`, le vecteur de déformation était nul (`length(b.xy) == 0`), transformant l'effet de chaleur en une coquille vide opaque.

### Correctifs appliqués
- Dans `web/src/shaders/distortion.js` :
  - Remplacement de `ALPHA_MULTIPLY` par `BABYLON.Engine.ALPHA_COMBINE` (mélange standard `SrcAlpha / OneMinusSrcAlpha`).
  - `mat.backFaceCulling = true;` et `mat.disableDepthWrite = true;`.
  - Calcul de transparence adaptatif dans le shader :
    `float a = hasBump > 0.5 ? clamp(pow(edge, 2.0) * 0.15 * bumpAmt * length(b.xy), 0.0, 0.25) : 0.0;`
    Si aucune texture de perturbation n'est associée (`hasBump <= 0.5`), l'alpha est rigoureusement égal à 0.0, rendant la sphère entièrement invisible sans aucun artefact visuel.

---

## 3. Boutons tactiles et cache Safari iOS

### Symptômes observés
- Les boutons « MONTER » et « DESCENDRE » restaient visibles sur la partie droite de l'écran tactile dès le début de la partie, alors que le joueur ne portait pas encore de combinaison spatiale.

### Causes racines
1. `this.suit = false;` n'était pas initialisé dans le constructeur de `TouchControls` dans `web/src/touch.js`.
2. Le masquage reposait uniquement sur `element.style.display = "none"`, sans règle CSS prioritaire `!important`.
3. Le navigateur Safari sur iOS met agressivement en cache les modules JavaScript ES natifs et les feuilles de style CSS entre les chargements de page.

### Correctifs appliqués
- Dans `web/src/touch.js` :
  - Déclaration explicite de `this.suit = false;` à l'instanciation de `TouchControls`.
  - Dans `updateSuitButtons()`, basculement synchronisé du style et de la classe CSS `.tc-hidden`.
- Dans `web/style.css` :
  - Ajout de la règle `.tc-hidden { display: none !important; pointer-events: none !important; }`.
- Dans `web/src/main.js` :
  - Appel immédiat de `touch.setContext({ menu: false, map: false, suit: equipment.suit });` dès l'activation des contrôles tactiles.
- Dans `web/index.html` et `web/src/gate.js` :
  - Ajout du paramètre de versionnement `?v=126` sur `style.css`, `./src/gate.js` et `./main.js` pour forcer le rafraîchissement immédiat de toutes les dépendances chez les testeurs mobiles.
