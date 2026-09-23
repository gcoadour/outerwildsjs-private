# Comparaison alpha Unity et moteur Web : extraction et implémentation de six correctifs

Ce document détaille la comparaison systématique entre le build original de l'alpha (Unity 4.x Linux v1.2 dans `work/game/OuterWilds_Alpha_1_2_Data`) et le moteur Web JavaScript (`web/src/`), ainsi que l'implémentation des six correctifs visuels et de gameplay qui en résultent.

---

## 1. Contexte et démarche d'analyse

Bien que les audits nominaux affichaient 100 % de couverture structurelle (recensement des composants, catalogue des événements globaux et suivi des méthodes C#), une confrontation détaillée du bytecode IL (`Assembly-CSharp.dll`), des constantes sérialisées et du ressenti de jeu entre l'exécutable natif et le moteur Web a mis en lumière plusieurs écarts fonctionnels, sensoriels et temporels.

L'objectif de cette passe a été d'extraire ces écarts, de vérifier les comportements originaux au bit près dans les assemblies Unity 4, et de les reporter fidèlement dans le moteur de jeu Web.

---

## 2. Les six correctifs extraits et implémentés

### 1. Vitesse de déplacement et restriction du sac dorsal selon la combinaison (`PlayerCharacterController`, `PlayerJetpackController`)
- **Comportement Unity 4 :** Sans combinaison, le joueur court à 7 m/s (`_groundSpeed = 7`) et son propulseur dorsal est totalement désactivé (`PlayerJetpackController.enabled = false`). Lorsqu'il enfile la combinaison (`OnSuitUp`), le poids de l'équipement réduit sa vitesse à 6 m/s (`_suitGroundSpeed = 6`), et le jetpack devient opérationnel. Au retrait (`OnRemoveSuit`), la vitesse remonte à 7 m/s et le jetpack redevient inopérant.
- **Écart constaté :** La vitesse au sol restait figée à 7 m/s quelle que soit la tenue du joueur, et les forces de poussée du sac dorsal pouvaient s'exercer même sans combinaison.
- **Correctif :**
  - Ajout de `setSuit(suited)` dans `web/src/player.js` adaptant dynamiquement `c.groundSpeed` (6 m/s en combinaison, 7 m/s en civil).
  - Conditionnement de la poussée du jetpack au port de la combinaison dans les boucles de mise à jour physique (`stepHavok` et `update`).
  - Synchronisation de l'état de combinaison dans `main.js` via `player.setSuit(equipment.suit)`.

### 2. Allumage et propulseurs du vaisseau (`ShipThrusterAudio`)
- **Comportement Unity 4 :** `ShipThrusterAudio` écoute les phases d'allumage : `StartShipIgnition` (joue `ThrusterIgnition_crossfade`), `CancelShipIgnition` (interrompt le son), et `CompleteShipIgnition` (enclenche la boucle de poussée `Thrusters_LowPower_New`). En vol, le contrôleur alterne entre le régime standard et le haut régime (`Thrusters_HighPower_New`) lorsque la commande de poussée dépasse 80 % (`IsHighPowered` vérifie `thrustFraction > 0.8`), et joue des bouffées rotationnelles (`RotationalThruster01..04`).
- **Écart constaté :** `ShipThrusterAudio` n'était pas inclus dans `EVENT_AUDIO` du pipeline d'extraction. Dans `main.js`, les événements d'allumage n'émettaient que des journaux console et la boucle sonore ne traitait que les réacteurs du joueur.
- **Correctif :**
  - Ajout de `"ShipThrusterAudio"` dans `EVENT_AUDIO` (`web/src/pipeline/extract/audio.js`), extrayant les 7 clips correspondants.
  - Ajout de `sonsUI.shipIgnition()` dans `web/src/reactaudio.js`.
  - Câblage complet des événements d'allumage et de la boucle de propulsion dans `web/src/main.js`, avec transition automatique entre basse puissance et haute puissance selon l'amplitude de poussée (`hypot > 0.8`).

### 3. Soin complet à l'accès au cockpit du vaisseau (`PlayerResources.OnEnterShip`)
- **Comportement Unity 4 :** Dans `PlayerResources.OnEnterShip`, la santé du joueur est immédiatement restaurée au maximum (`_currentHealth = _maxHealth`), symbolisant la prise en charge médicale / premiers secours du cockpit.
- **Écart constaté :** Le moteur Web réinitialisait l'invulnérabilité du premier tour (`pdata.enterShip()`), mais ne soignait pas les dégâts physiques subis par le personnage.
- **Correctif :** Rétablissement de `resources.health = resources.maxHealth;` et `resources.dead = false;` lors de l'accès au siège de pilotage (`ship.boarded = true`) dans `web/src/main.js`.

### 4. Vitesse de recharge en oxygène (`PlayerResources.Update`)
- **Comportement Unity 4 :** L'instruction IL de `PlayerResources.Update` crédite l'oxygène avec `ldc.r4 100` : `_currentOxygen += 100f * Time.deltaTime`. Remplir le réservoir de 400 s ne prend donc que 4 secondes lorsqu'on est sous alimentation (cockpit ou zone arborée).
- **Écart constaté :** Le portage appliquait un taux de `dt * 10`, soit 10 unités par seconde, imposant 40 secondes d'attente immobile pour une recharge complète (10 fois trop lent).
- **Correctif :** Ajustement du facteur de recharge à `dt * 100` dans `web/src/resources.js`.

### 5. Sons d'impact et d'atterrissage du joueur (`PlayerImpactAudio`)
- **Comportement Unity 4 :** `PlayerImpactAudio` analyse la vitesse et l'orientation de collision :
  - Vitesse $\le 3$ m/s : aucun son.
  - Entre 3 et 20 m/s : tirage aléatoire entre les clips d'atterrissage (`_landingImpact1..3`) si le choc est vertical et dirigé vers les pieds, sinon clips de choc corps/paroi (`_lightImpact1..3`).
  - Entre 20 et 30 m/s : clips d'impact moyen (`_mediumImpact1..3`).
  - Au-delà de 30 m/s : clip d'impact violent (`_heavyImpact`).
- **Écart constaté :** Ni la classe ni ses clips n'étaient extraits, laissant les sauts, atterrissages et chutes sans aucun retour acoustique.
- **Correctif :**
  - Ajout de `"PlayerImpactAudio"` à `EVENT_AUDIO` dans `web/src/pipeline/extract/audio.js` (10 clips extraits).
  - Implémentation de la fonction pure `playerImpactSound(speed, isFeetLanding, alea)` et de la méthode `sonsUI.playerImpact(...)` dans `web/src/reactaudio.js`.
  - Câblage de l'émission sonore au contact du sol dans la boucle principale (`main.js`).

### 6. Durée de l'éclair blanc de supernova (`supernova.js`)
- **Comportement Unity 4 :** `_flashSeconds = 0.8s`. L'onde blanche aveuglante s'estompe sur 0,8 seconde à compter de la détonation de l'étoile.
- **Écart constaté :** Le paramètre d'atténuation `since` était calculé via `r / 2000`, où `r` est le rayon cubique de l'onde de choc ($30\,000 \cdot (t/15)^3$). Durant les cinq premières secondes de l'explosion, $r$ demeure inférieur à 1 600, maintenant `since < 0.8s` et laissant l'écran totalement aveuglé de blanc pendant plus de 5 secondes.
- **Correctif :** Calcul prioritaire de `since` à partir du temps réel écoulé dans la boucle (`loop.elapsed - loop.supernovaAt`), restituant l'éclair blanc bref et percutant de 0,8 seconde.

---

## 3. Résultats des vérifications automatisées

Les vérifications exhaustives confirment le bon fonctionnement de tous les systèmes :
- **Extracteurs du pipeline (`tests/05-extract.mjs`)** : 475/475 vérifications réussies.
  - 110 clips audio exportés (contre 97 auparavant, dont 87 en format WAV).
  - 24 émetteurs de sons d'événements (contre 22 auparavant).
- **Logique de jeu (`tests/09-jeu.mjs`)** : 2 359/2 359 vérifications réussies.
  - Tests unitaires dédiés pour les 4 paliers d'impact, les transitions de vitesse de combinaison (7 m/s vs 6 m/s), la cadence de recharge d'oxygène (50 u en 0,5 s) et l'extinction du flash de supernova à 0,8 s.
- **Audit des lois (`scripts/lois.mjs`)** : 0 loi non appelée dans 0 module.
- **Audit des méthodes C# (`scripts/refait.mjs`)** : 179/179 méthodes nommées (100 %).
- **Audit des événements globaux (`scripts/evenements.mjs`)** : 124/124 événements nommés (100 %).
- **Intégrité du dépôt (`scripts/check-modules.mjs` & `scripts/check-no-assets.mjs`)** : 39/39 modules de pipeline et 75/75 modules moteur opérationnels, 0 asset binaire présent dans Git.
