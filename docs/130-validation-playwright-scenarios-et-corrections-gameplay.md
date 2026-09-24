# Validation Playwright des scénarios et corrections de gameplay

Ce document détaille la mise en place du banc d'essai automatisé sous Playwright, les vingt scénarios de jeu validés de bout en bout contre le build Linux de l'alpha d'Outer Wilds (v1.2), ainsi que les corrections de gameplay apportées au moteur web pour assurer une stricte parité d'interaction, de timing et de physique.

---

## 1. Contexte et démarche

L'objectif de cette étape est de confronter directement le portage JavaScript exécuté dans un navigateur Chromium réel aux comportements originaux du moteur Unity 4.1.2f1, en vérifiant les contrôles, les timings d'animation et les règles physiques.

Pour éviter les mocks et tester la chaîne complète :
1. Un profil de navigation persistant (`work/pw-profile`) stocke les données extraites dans le système de fichiers privé d'origine (OPFS).
2. Un serveur HTTP local sert l'application web sur le port 8089.
3. Un script Playwright autonome (`scripts/playwright-scenarios.mjs`) orchestre les actions du joueur via les événements clavier et souris standard.
4. Les assertions valident à la fois l'état interne du moteur (`window.__player`, `window.__shipRef`, `window.__consoles`, `window.__death`, `window.__pdata`, `window.__atterrissage`, etc.) et la réponse visuelle/auditive.

---

## 2. Les vingt scénarios validés de bout en bout (66/66 assertions)

La suite de tests automatisés couvre l'ensemble des systèmes de gameplay fondamentaux du départ de partie et de l'exploration spatiale :

### 2.1. Scénario 1 : Réveil du joueur et regard
- **Comportement alpha** : `PlayerCameraController.Awake` arme le réveil avec un regard pointé vers le ciel à 80° (`pitch = -80°`). Le réveil attend 7 secondes avant de redescendre doucement à l'horizon, sauf si le joueur prend la main en inclinant la vue vers le bas (en dessous de 45°).
- **Vérifications** : angle initial conforme, réveil armé, orientation libre de la caméra à la souris/touches.

### 2.2. Scénario 2 : Lampe torche (touche F)
- **Comportement alpha** : `Flashlight.Update` écoute l'interrupteur `OWInput.toggleFlashlight` (touche 'F'). La lampe s'éteint et s'allume avec un retour sonore.
- **Vérifications** : lampe éteinte au réveil, allumée au premier appui sur F, éteinte au second.

### 2.3. Scénario 3 : Déplacement et saut
- **Comportement alpha** : `PlayerCharacterController` applique les vitesses de marche au sol selon la combinaison (`_groundSpeed`), et `OWInput.jump` (barre d'espace) applique l'impulsion verticale de saut si le joueur est au sol.
- **Vérifications** : déplacement effectif en mètres lors du maintien de la touche Z/W, impulsion de vitesse verticale positive lors de l'appui sur Espace.

### 2.4. Scénario 4 : Bâton de guimauve et feu de camp
- **Comportement alpha** : `MarshmallowStick.Awake` sort le bâton au démarrage. Près du feu, la guimauve grille (`_heatLevel`). Dès que le niveau de cuisson atteint 0,6 (`edible`), le joueur peut la manger via `OWInput.interact` ('E'), ce qui restaure 100 % de sa santé et range le bâton.
- **Vérifications** : bâton présent en main au départ, possibilité de le ranger et le ressortir, cuisson effective face au feu, restauration complète des points de vie (de 40 à 100 HP) à la dégustation.

### 2.5. Scénario 5 : Combinaison spatiale et barrière de Coach
- **Comportement alpha** : le joueur débute sans combinaison à 7 m/s (`_groundSpeed`). Revêtir la combinaison réduit la vitesse de marche à 6 m/s (`_suitGroundSpeed`). Franchir la barrière invisible sans combinaison pousse le joueur et déclenche l'avertissement vocal de Coach (`CoachConvoController.OnTriggerSuitWarning`).
- **Vérifications** : vitesse initiale de 7 m/s, présence de l'arbre `_suitWarning` sur Coach, équipement de la combinaison et réduction de vitesse à 6 m/s.

### 2.6. Scénario 6 : Ascenseur de la tour de lancement
- **Comportement alpha** : `Elevator.Update` interpole la cabine sur 31,5 unités en 5,0 secondes à l'aide d'une courbe en `SmoothStep(0, 1, t)`, avec montée du volume audio sur le premier dixième du trajet.
- **Vérifications** : constantes de course (31,5 u) et durée (5,0 s), progression fluide en temps réel (`fraction >= 0,3` à mi-parcours), arrivée complète au sommet (`fraction = 1,0`).

### 2.7. Scénario 7 : Vaisseau et séquence d'allumage (1,0 seconde)
- **Comportement alpha** : `ShipThrusterController.ReadTranslationalInput` exige un maintien continu de la poussée verticale pendant `_ignitionDuration` (1,0 seconde) lorsque le vaisseau est posé sur la piste (`LandingPadManager.IsLanded`). Un relâchement prématuré émet `CancelShipIgnition`. La complétion émet `CompleteShipIgnition`, détache le vaisseau de la piste et applique la poussée.
- **Vérifications** : installation au siège pilote, déclenchement de `StartShipIgnition` sur appui court (Shift), annulation `CancelShipIgnition` sans décollage au relâchement, maintien complet de 1 seconde déclenchant `CompleteShipIgnition`, libération de la piste (`landed = false`).

### 2.8. Scénario 8 : Sonde de reconnaissance (lancement, photo, rappel)
- **Comportement alpha** : `ProbeLauncher` arme le tir photographique. En vol, un appui sur le bouton de sonde déclenche une prise de vue immédiate (`ProbeCamera.Update` / `MidairProbeSnapshot`). Lorsque la sonde est ancrée ou en vol, maintenir la touche de rappel au-delà du seuil `_retrieveHold` (0,3 seconde) détruit la sonde et émet `RetrieveProbe`.
- **Vérifications** : chargement et expulsion de la sonde, prise de vue instantanée en plein vol avec capture des événements d'imagerie, maintien du rappel sur la durée requise entraînant la rentrée de la sonde (`active = 0`).

### 2.9. Scénario 9 : Pilote automatique
- **Comportement alpha** : `Autopilot` déploie ses trois phases (alignement sur la trajectoire, approche accélérée, rétro-fusées et égalisation de vitesse relative).
- **Vérifications** : instanciation du pilote automatique, engagement vers une coordonnée cible, mise à jour des drapeaux d'état.

### 2.10. Scénario 10 : Carte du système solaire (bascule M et Entrée)
- **Comportement alpha** : `MapController` gère la vue orbitale et la projection des marqueurs célestes pour chaque planète et satellite. Dans le build Unity original, le canal `Map` est lié aux touches Entrée et NumpadEnter. Pour le confort web, l'appui sur 'M' est également reconnu.
- **Vérifications** : présence du module cartographique avec l'ensemble des 11 marqueurs orbitaux du système, ouverture et fermeture de la vue orbitale via les touches clavier.

### 2.11. Scénario 11 : Télescope et signaux acoustiques
- **Comportement alpha** : `TelescopeController` bascule la vue télescopique, réduit le champ de vision (FOV) selon le grossissement optique calculé par `telescopeScale(fov)`, et capte la force de transmission des signaux audio du système solaire.
- **Vérifications** : ouverture de la lunette, grossissement optique mesuré, captation du signal acoustique, restauration du champ de vision normal à la fermeture.

### 2.12. Scénario 12 : Panneaux de musée et textes Nomai
- **Comportement alpha** : `DialogueBox` affiche les objets lisibles (`ReadableObject`), découpe les longs paragraphes en pages, bloque temporairement le déplacement pendant la lecture et déverrouille le joueur à la fermeture.
- **Vérifications** : ouverture d'un panneau textuel de musée, pagination du texte, progression et déverrouillage propre à la fermeture.

### 2.13. Scénario 13 : Mort du joueur, flashback et reprise de la boucle
- **Comportement alpha** : `PlayerDeathHandler.OnTriggerPlayerDeath` initie la mort du joueur, coupe les commandes et déclenche la séquence de flashback `FlashbackCamera`. Lorsque le flashback se termine, `TimeLoop.RestartTimeLoop` incrémente `_loopCount`, appelle `PlayerData.SaveLoopCount` et réinitialise la boucle temporelle (`OnStartOfTimeLoop`).
- **Vérifications** : mort immédiate par impact, déroulement de la séquence de flashback, complétion de la fin des temps, incrémentation du compteur de boucles (`loopCount + 1`), réapparition du joueur au réveil et ré-ancrage du vaisseau sur la plate-forme de lancement.

### 2.14. Scénario 14 : Combinaison spatiale et Jetpack
- **Comportement alpha** : le jetpack est réservé au joueur équipé de la combinaison spatiale (`PlayerCharacterController.setSuit`). Lorsqu'il est revêtu, la vitesse de marche au sol passe à 6 m/s et la poussée verticale consomme le carburant du sac dorsal.
- **Vérifications** : équipement et réduction de vitesse de marche à 6 m/s, consommation effective du carburant lors de la poussée du jetpack, retrait de la combinaison restaurant la vitesse de marche à 7 m/s.

### 2.15. Scénario 15 : Gestion de l'oxygène et ravitaillement rapide (100 u/s)
- **Comportement alpha** : `PlayerResources.Update` draine l'oxygène au rythme d'une unité par seconde hors ravitaillement. En zone d'oxygène (arbres d'Âtrebois ou intérieur de vaisseau), le plein s'effectue à la cadence rapide de 100 unités par seconde (`ldc.r4 100` dans l'IL Unity).
- **Vérifications** : décroissance nominale de l'oxygène, recharge de 50 unités en 0,5 seconde dans une zone oxygénée.

### 2.16. Scénario 16 : Système de dialogue interactif
- **Comportement alpha** : `DialogueSystem` gère l'état d'interaction avec les PNJ du village (`Slate`, `Coach`, etc.), empêche la dérive du joueur pendant l'échange (`ConversationInput`), pagine le texte et résout les branches de réplique.
- **Vérifications** : ouverture fluide d'une conversation, génération du découpage paginé, fermeture et réinitialisation de l'état actif.

### 2.17. Scénario 17 : Console de vol & Vue d'atterrissage
- **Comportement alpha** : `FlightConsole` permet d'enclencher la caméra d'atterrissage sous le vaisseau (`Landing Camera`). Une transition de 0,45 seconde oriente le regard vers le sol à -70°, inverse le roulis par défaut (`rollByDefault = true`, `flipRollFactor = -1`).
- **Vérifications** : déclenchement de la bascule d'atterrissage, inversion immédiate des réglages de roulis, complétion de la vue après 0,45 s, remise à plat en quittant la console (`resetRoll`).

### 2.18. Scénario 18 : Dégâts du vaisseau et réparations
- **Comportement alpha** : `ShipDamageController` calcule les avaries par pièce et les alertes de coque lors d'impacts dépassant le seuil de 30 m/s (`mediumImpactThreshold`). Le vaisseau peut être réparé pour restaurer son intégrité.
- **Vérifications** : intégrité nominale à 100 %, impact violent provoquant une avarie et une perte d'intégrité, réparation ramenant l'intégrité à 100 %.

### 2.19. Scénario 19 : Modèle réduit de vaisseau et conditions de pose
- **Comportement alpha** : `ModelShipLandingSpot` exige une immobilité stricte pour valider la pose du modèle réduit ($|v| < 0{,}1$ u/s, $|\omega| < 0{,}01$ rad/s pendant 0,2 s) et `ModelShipCrashBehavior` explose au-delà de 10 u/s d'impact.
- **Vérifications** : présence des 3 pistes d'atterrissage du modèle réduit sur Âtrebois et conformité des seuils physiques d'atterrissage et de destruction.

### 2.20. Scénario 20 : Sombre Ronce et détection acoustique du prédateur
- **Comportement alpha** : `NoiseSensor` du cœlacanthe écoute le bruit généré par les propulseurs du vaisseau (`ShipNoiseMaker`) dans un rayon de 200 unités, avec un seuil de perturbation fixé à 10 unités.
- **Vérifications** : bruit acoustique maximal (10 unités) à pleine poussée et silence acoustique (0 unité) à l'arrêt, assurant la mécanique d'approche silencieuse du prédateur.

---

## 3. Écarts extraits du bytecode et correctifs appliqués

La comparaison directe avec l'assembly C# et l'exécution automatisée ont révélé plusieurs écarts subtils qui ont été corrigés :

1. **Avertissement de Coach sur la barrière (`web/src/main.js`)** :
   Dans l'alpha, `SuitBarrier.OnTriggerEnter` notifie `CoachConvoController`. Si le joueur ne porte pas la combinaison, le dialogue `_suitWarning` s'ouvre automatiquement. Cette ouverture distante a été branchée sur la détection de collision de la barrière.

2. **Touche de dégustation de la guimauve (`web/src/main.js`)** :
   Le portage initial n'acceptait que la touche personnalisée 'B'. Dans le build original (`Marshmallow.Update`), c'est `OWInput.interact` (la touche standard 'E') qui permet de consommer la guimauve lorsque son état est comestible (`edible`). Les deux entrées sont désormais acceptées.

3. **Maintien du vaisseau au sol au démarrage (`web/src/ship.js`, `web/src/main.js`)** :
   Sur Âtrebois, la plate-forme de lancement est surélevée par rapport au rayon sphérique moyen de la planète (`upperSurfaceRadius`). Sans maillage Havok actif lors des tests headless, la détection analytique déclarait le vaisseau non posé (`landed = false`), ce qui empêchait la séquence d'allumage (laquelle requiert `landed = true`).
   L'introduction d'un drapeau `parked` fige le vaisseau sur son socle d'apparition au repos jusqu'à l'aboutissement de la séquence `CompleteShipIgnition`.

4. **Synchronisation du compteur de boucle lors du respawn (`web/src/main.js`)** :
   L'inspection IL de `TimeLoop.RestartTimeLoop` démontre la séquence suivante :
   ```il
   IL_0000  ldsfld  _loopCount
   IL_0005  ldc.i4  1
   IL_0006  add
   IL_0007  stsfld  _loopCount
   IL_000c  ldsfld  _loopCount
   IL_0011  call    PlayerData::SaveLoopCount
   IL_0016  ldstr   "RestartTimeLoop"
   IL_001b  call    GlobalMessenger::FireEvent
   ```
   Dans le portage, `pdata.setLoopCount(loop.loopCount)` n'était pas appelé directement lors de `respawn()`, ce qui laissait `pdata.loopCount` désynchronisé tant qu'une frame de rendu n'avait pas tourné. L'appel explicite de synchronisation a été inséré dans `respawn()`.

5. **Timing de rappel de la sonde (`web/src/probe.js`, `scripts/playwright-scenarios.mjs`)** :
   Dans `ProbeLauncher.update()`, l'appui sur le rappel de sonde enregistre `this.retrieveStart = this.now` et vérifie `this.now > this.retrieveStart + this.cfg.retrieveHold` (0,3 s). Un maintien effectif sur plusieurs frames cumulant plus de 300 ms est nécessaire pour déclencher la destruction et le rappel de la sonde.

6. **Invariant de table d'entrées du build (`web/src/input.js`, `tests/05-extract.mjs`)** :
   L'invariant de parité stricte vérifie que la table de repli `COMMANDES` correspond exactement à l'asset `InputManager.asset` extrait du build original (où `Map` est sur `Enter`/`Return` et `Telescope` sur `mouse 2`). Les raccourcis clavier spécifiques au confort web ('M' pour la carte) ont été placés au niveau de la dispatch d'événements de `main.js` sans altérer la définition canonique de l'alpha.

7. **Outil d'inspection de chaînes IL (`scripts/il.mjs`)** :
   Ajout de la commande `node scripts/il.mjs --string <recherche>` permettant de localiser instantanément toutes les références de chaînes d'événements, noms de clips audio et messages de dialogue dans les assemblies Unity.

---

## 4. Bilan de la validation

Tous les contrôles du projet sont au vert :
- **66/66 assertions Playwright validées** sur 20 scénarios complets (`node scripts/playwright-scenarios.mjs`).
- **2424/2424 vérifications unitaires réussies** (`node scripts/run-tests.mjs`).
- **484/484 assertions d'extraction conformes** (`node tests/05-extract.mjs`).
- **0 loi du moteur orpheline** (`node scripts/lois.mjs`).
- **0 ressource binaire supérieure à 512 Ko** versionnée sous git (`node scripts/check-no-assets.mjs`).
- **39/39 modules pipeline et 75/75 modules moteur compilés** (`node scripts/check-modules.mjs`).
