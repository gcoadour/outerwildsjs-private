# Correctifs mobiles — interactions, vaisseau, jetpack, crashs et shaders

Ce document consigne les cinq anomalies majeures identifiées lors des tests réels sur mobile (iOS Safari / WebGL Metal sur `gcoadour.github.io`) et les correctifs architecturaux appliqués pour y remédier.

---

## 1. Dialogue et interactions PNJ / terminaux

### Symptômes
- Impossible d'interagir avec les PNJ (Slate au feu de camp, Hornfels à l'observatoire).
- Impossible d'actionner la borne de lancement de la tour d'ascenseur, même après avoir appris les codes.
- Impossible de griller une guimauve au feu de camp.

### Causes racines
1. **Écrasement prématuré de l'appui d'interaction** : `interactPressed = false;` était exécuté à la ligne 3892 de `web/src/main.js`, avant les blocs de la guimauve (ligne 4791) et de la borne de la tour (ligne 5636). L'appui était donc systématiquement consommé avant d'atteindre ces mécaniques.
2. **Calcul de distance faussé par le repère orbital** : `dialogue.nearest(player.pos, anchorPos)` calculait `c.position - anchorPos - player.pos`. Dès que Timber Hearth orbitait, `anchorPos` atteignait des milliers d'unités, projetant la distance calculée à plus de 4 000 mètres alors que le joueur se tenait devant Slate.
3. **Absence du corps porteur** : les conversations extraites et les `InteractReceiver` ne conservaient pas le champ `body`, empêchant la translation `shiftOf(body)`.
4. **Types d'interaction ignorés** : `focus.kind === "interact"` n'était pas traité dans la chaîne d'interaction principale.

### Correctifs
- Dans `extractDialogue` (`web/src/pipeline/extract/dialogue.js`), inclusion systématique de `body: ctx.bodyOf(gid)`.
- Dans `dialogue.js`, mise à jour de `nearest` pour accepter une fonction de décalage `shiftOf(corps)`. Les coordonnées du joueur et du PNJ sont réalignées dans le repère de repos de la planète.
- Dans `interact.js`, transmission de `body: x.body || null` pour chaque instance de `InteractReceiver`.
- Dans `main.js`, déplacement de la remise à zéro `interactPressed = false;` en toute fin de boucle d'image (juste avant `appliquerRelachements()`), avec consommation immédiate par chaque action traitée. Prise en charge explicite de `focus.kind === "interact"`.

---

## 2. Visibilité et positionnement du vaisseau

### Symptômes
- Le vaisseau spatial était totalement invisible sur la plateforme de lancement.

### Causes racines
- Le noeud `Ship_Body` était rattaché dans la hiérarchie glTF à `TimberHearth_Body/ShipContainer/Ship_Body`. Son conteneur parent portait une rotation intrinsèque `rotation.y = Math.PI` et un décalage de repère.
- Dans `ship.sync(BABYLON)`, la rotation calculée était appliquée au repère *local* (`rotationQuaternion.set(...)`). La rotation à 180° du parent envoyait le vaisseau à l'autre bout de la planète, enfoui sous la roche.

### Correctifs
- Détachement explicite du noeud parent (`node.parent = null`) dès l'initialisation dans `main.js` et vérification dynamique dans `ship.sync()`.
- Positionnement et rotation appliqués directement dans le repère de scène Babylon : `node.position.set(...)` et `node.rotationQuaternion.set(...)`.
- Protection de tous les sous-maillages du vaisseau contre l'éviction par LOD avec `MeshLOD.pin(m)`, `m.setEnabled(true)` et `m.isVisible = true`.
- Assouplissement de la résolution du noeud dans `findBodyNode` (`geometry.js`).

---

## 3. Commandes tactiles et affichage sans combinaison

### Symptômes
- Au réveil et au début du jeu, l'interface tactile affichait les boutons « MONTER » et « DESCENDRE », et le sprint vertical au stick gauche fonctionnait même sans combinaison spatiale.
- Le bandeau d'état affichait en permanence les réserves de carburant et d'oxygène (`carb 15.0 oxy 10.0`).

### Causes racines
- `touch.js` créait et activait inconditionnellement les boutons et axes de poussée verticale.
- `hud2` appelait inconditionnellement `resources.summary()`.

### Correctifs
- Dans `touch.js`, ajout du suivi de `this.suit` : les boutons « MONTER » et « DESCENDRE » sont masqués (`display = "none"`) et les axes de poussée verticale (`axes.up`, `axes.down`) sont forcés à `false` tant qu'aucune combinaison n'est portée.
- Dans `main.js`, transmission continue de l'état d'équipement (`suit: equipment.suit`) à `touch.setContext()`.
- Dans `hud2`, affichage de `"sans combinaison"` à la place du résumé des jauges tant que `!equipment.suit`.

---

## 4. Robustesse mobile et pertes de contexte WebGL

### Symptômes
- Crashs et blocages complets de la page en cours de session sur mobile.

### Causes racines
- La boucle de rendu `engine.runRenderLoop(() => scene.render())` n'était pas enveloppée dans un bloc de capture d'exceptions : toute perte temporaire de tampon ou erreur WebGL Metal arrêtait définitivement le rendu.
- `MeshLOD.apply()` pouvait lever une exception si un maillage était libéré ou modifié pendant l'itération tournante.
- Absence d'interception des événements de cycle de vie WebGL.

### Correctifs
- Enveloppement de `scene.render()` dans un `try / catch` au sein de `engine.runRenderLoop`.
- Ajout des écouteurs `webglcontextlost` (avec `preventDefault()`) et `webglcontextrestored` sur le canvas.
- Garde `isDisposed()` et `try / catch` défensif dans `MeshLOD.apply()`.

---

## 5. Artefacts visuels et shaders

### Symptômes
- Énorme sphère blanche opaque posée sur le feu de camp devant Slate dès le réveil.
- Bandes néon multicolores (cyan, magenta) saturant l'écran sur iOS.

### Causes racines
- **Sphère blanche (`FireBall`)** : le shader `makeDistortion` utilisait `mat.alphaMode = BABYLON.Engine.ALPHA_MULTIPLY`. Par défaut, `BABYLON.ShaderMaterial` n'active le mélange alpha que pour `ALPHA_COMBINE`, classant donc le matériau en file opaque. De plus, `bumpTexture` était nul, laissant un sampler WebGL `sampler2D` non lié, ce qui provoque des erreurs de validation sur iOS Metal.
- **Bandes néon / débordements float16** : dans `web/src/postfx.js`, `owGlow` multipliait des composantes de couleur non normalisées par une intensité non bornée sans saturation. Les tampons de rendu half-float 16 bits d'Apple Metal débordaient à `+Infinity` / `NaN`. De même, `owVignette` manquait d'un garde contre les racines carrées de nombres négatifs.

### Correctifs
- Dans `makeDistortion` (`shaders/distortion.js`) : surcharge de `mat.needAlphaBlending = () => true` et `mat.needAlphaTesting = () => false`, création d'une texture normale 1x1 unitaire de repli (`[128, 128, 255, 255]`) pour lier le sampler, et bornage de la couleur finale.
- Dans `postfx.js` : clamping systématique à `[0.0, 1.0]` de toutes les sorties fragment (`owGlow`, `owVignette`, `owGrayscale`, `owBloom`, `owTwirl`, `owFilm`, `owGrain`), sécurisation de `sqrt(max(0.0, intensity) / 1000.0)`, normalisation des teintes `tint` et limitation de l'intensité de lueur.
