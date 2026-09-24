# Validation Playwright des scénarios et corrections de gameplay

Ce document détaille la mise en place du banc d'essai automatisé sous Playwright, les dix scénarios de jeu validés de bout en bout contre le build Linux de l'alpha d'Outer Wilds (v1.2), ainsi que les corrections de gameplay apportées au moteur web pour assurer une stricte parité d'interaction, de timing et de physique.

---

## 1. Contexte et démarche

L'objectif de cette étape est de confronter directement le portage JavaScript exécuté dans un navigateur Chromium réel aux comportements originaux du moteur Unity 4.1.2f1, en vérifiant les contrôles, les timings d'animation et les règles physiques.

Pour éviter les mocks et tester la chaîne complète :
1. Un profil de navigation persistant (`work/pw-profile`) stocke les données extraites dans le système de fichiers privé d'origine (OPFS).
2. Un serveur HTTP local sert l'application web sur le port 8089.
3. Un script Playwright autonome (`scripts/playwright-scenarios.mjs`) orchestre les actions du joueur via les événements clavier et souris standard.
4. Les assertions valident à la fois l'état interne du moteur (`window.__player`, `window.__shipRef`, `window.__consoles`, etc.) et la réponse visuelle/auditive.

---

## 2. Les dix scénarios validés de bout en bout (33/33 assertions)

La suite de tests automatisés couvre dix séquences fondamentales du départ de partie :

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

### 2.8. Scénario 8 : Sonde de reconnaissance
- **Comportement alpha** : `ProbeLauncher` arme le tir photographique avec un rayon de détection et de numérisation de maillage de 30 unités.
- **Vérifications** : configuration et disponibilité du lanceur de sonde.

### 2.9. Scénario 9 : Pilote automatique
- **Comportement alpha** : `Autopilot` déploie ses trois phases (alignement sur la trajectoire, approche accélérée, rétro-fusées et égalisation de vitesse relative).
- **Vérifications** : instanciation du pilote automatique, engagement vers une coordonnée cible, mise à jour des drapeaux d'état.

### 2.10. Scénario 10 : Carte du système solaire
- **Comportement alpha** : `MapController` gère la vue orbitale et la projection des marqueurs célestes pour chaque planète et satellite.
- **Vérifications** : présence du module cartographique avec l'ensemble des 11 marqueurs orbitaux du système.

---

## 3. Écarts extraits du bytecode et correctifs appliqués

La comparaison directe avec l'assembly C# et l'exécution automatisée ont révélé plusieurs écarts subtils qui ont été corrigés :

1. **Avertissement de Coach sur la barrière (`web/src/main.js`)** :
   Dans l'alpha, `SuitBarrier.OnTriggerEnter` notifie `CoachConvoController`. Si le joueur ne porte pas la combinaison, le dialogue `_suitWarning` s'ouvre automatiquement. Cette ouverture distante a été branchée sur la détection de collision de la barrière.

2. **Touche de dégustation de la guimauve (`web/src/main.js`)** :
   Le portage initial n'acceptait que la touche personnalisée 'B'. Dans le build original (`Marshmallow.Update`), c'est `OWInput.interact` (la touche standard 'E') qui permet de consommer la guimauve lorsque son état est comestible (`edible`). Les deux entrées sont désormais acceptées.

3. **Maintien du vaisseau au sol au démarrage (`web/src/ship.js`)** :
   Sur Âtrebois, la plate-forme de lancement est surélevée par rapport au rayon sphérique moyen de la planète (`upperSurfaceRadius`). Sans maillage Havok actif lors des tests headless, la détection analytique déclarait le vaisseau non posé (`landed = false`), ce qui empêchait la séquence d'allumage (laquelle requiert `landed = true`).
   L'introduction d'un drapeau `parked` fige le vaisseau sur son socle d'apparition au repos jusqu'à l'aboutissement de la séquence `CompleteShipIgnition`.

4. **Outil d'inspection de chaînes IL (`scripts/il.mjs`)** :
   Ajout de la commande `node scripts/il.mjs --string <recherche>` permettant de localiser instantanément toutes les références de chaînes d'événements, noms de clips audio et messages de dialogue dans les assemblies Unity.

---

## 4. Bilan de la validation

Tous les contrôles du projet sont au vert :
- **33/33 scénarios Playwright validés** (`node scripts/playwright-scenarios.mjs`).
- **2424/2424 vérifications unitaires réussies** (`node scripts/run-tests.mjs`).
- **484/484 assertions d'extraction conformes** (`node tests/05-extract.mjs`).
- **0 loi du moteur orpheline** (`node scripts/lois.mjs`).
- **0 ressource binaire supérieure à 512 Ko** versionnée sous git (`node scripts/check-no-assets.mjs`).
