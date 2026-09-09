# Audit du portage, mesuré sur le build

[`34-actions.md`](34-actions.md) comparait le jeu et le portage **sans avoir le
build** : chaque écart y pointait un fichier, aucun n'était chiffré. Cette
page-ci reprend la comparaison **avec le build sous la main**, et c'est la
première fois.

> **Méthode.** L'alpha 1.2 Linux a été téléchargée depuis archive.org
> (`tools/01_fetch.sh`), SHA-256 `5c7defa…80f05a`, conforme à celui
> qu'annonce le script. Tout ce qui suit sort de la chaîne du dépôt elle-même —
> `scripts/run-tests.mjs` avec `OW_BUILD`, plus quelques sondes jetables — et
> jamais d'une impression du jeu. Le build est resté dans `work/`, qui est
> ignoré : rien du jeu n'entre au dépôt.
>
> Ce que cette page **ne** couvre **pas** : le rendu et le son jugés à l'œil et
> à l'oreille, et une partie jouée. Ces trois-là demandent quelqu'un devant
> l'écran, et restent ouverts ([`08`](08-reste-a-faire.md) §2).

## Ce que la mesure a d'abord corrigé

Trois choses tenues pour acquises étaient fausses, et deux invariants du dépôt
ne vérifiaient rien. C'est le premier résultat de l'audit, avant toute
comparaison de gameplay.

| tenu pour vrai | mesuré | conséquence |
|---|---|---|
| « 33 animations, 8 148 canaux » | **34** animations, 8 148 canaux | le compte des canaux était juste, celui des animations non |
| `tests/08` vérifiait l'export d'animations | il comptait **0 animation** | l'`ExtractContext` y était construit **sans** `unity41-types.json` : `Animator`, `Animation` et `AnimatorController` étaient illisibles, et le test passait sur le vide |
| `tests/05` gardait « aucune portée audio de repli » | **0 source** dans la liste | `maxClips: 0` : une source n'est retenue que si le nom de son clip a été enregistré, or ce nom ne l'est qu'à l'export. L'invariant passait sur une liste vide |
| brouillard de la scène : gris moyen `(0,5 ; 0,5 ; 0,5)` | **`(0,1456 ; 0,1567 ; 0,1403)`** | un vert-gris très sombre, trois fois plus sombre. Le repli de `fog.js` était faux ([`29`](29-brouillards.md)) |
| `RocketKidConvoController` : « aucune source » | **présent et lisible**, trois arbres | [`08`](08-reste-a-faire.md) §1 le classait hors d'atteinte à tort |
| la poussée d'Archimède « n'est pas dans le build » | **tous** les volumes portent `_density` | de 0,2 à 500 ; voir §2.3 |

Les deux tests sont corrigés dans cette série, et ils mesurent désormais
quelque chose. Les chiffres du build, eux, sont confirmés : 24 032 objets dans
`level0`, 1 390 MonoBehaviour lus **exactement** à leur `byteSize`, 7 688
`GameObject`, 989 objets dans `mainData`.

---

## 1. Matrice des différences

Lecture des verdicts : **conforme** — le portage fait ce que le build décrit ;
**écart** — il fait autre chose, et la mesure le chiffre ; **absent** — le
build le décrit, le portage ne le lit pas.

### 1.1 Gameplay et contrôles

| point | l'alpha (mesuré) | le portage | verdict |
|---|---|---|---|
| **marche au sol** | `PlayerCharacterController` : `_groundSpeed 7`, `_strafeSpeed 5`, `_groundAcceleration 0,5`, `_suitGroundSpeed 6` | **aucun modèle de marche** : la même poussée sert au sol et dans le vide | **absent** |
| **saut** | `_jumpSpeed 6` | aucune touche de saut | **absent** |
| **sac dorsal** | `JetpackThrusterModel` : `_maxTranslationalThrust 7`, `_surfaceVerticalThrust 12`, `_surfaceLateralThrust 5` | `player.js` code en dur `thrust = 18`, uniforme | **écart ×2,6 à ×3,6** |
| **constantes du joueur** | extraites, écrites dans `solar_system.json`, `playerConstants()` les lit | `new Player(playerConstants(data), …)` les range dans `this.c` et **ne s'en sert jamais** | **absent** |
| **pente praticable** | `_maxAngleToBeGrounded 45`, `_maxAngleBetweenSlopes 115` | aucun seuil : on tient sur n'importe quelle paroi | **absent** |
| **sonde d'appui** | sphère de rayon `0,46` sur `0,6` (`_sphereCastLength/Radius`) | rayon simple de 1,4 | **écart** |
| **chute qui déséquilibre** | `_tumbleThreshold`, `_tumbleDuration 1,5` | rien | **absent** |
| **sensibilité de visée** | `_turnRate 160`, `_telescopeTurnScalar 0,5`, `_suitTurnScalar 1` | facteur maison `0,0022`, pas de ralenti à la lunette | **écart** |
| **accélération (« boost »)** | rien de tel dans le build | `input.boost ? 3 : 1` sur le joueur, `? 2 : 1` sur le vaisseau | **inventé** |
| **carburant** | consommé par le sac dorsal | consommé aussi en **marchant** (`thrusting: input.forward \|\| input.right \|\| input.up`) | **écart** |
| **rotation du vaisseau** | `_maxRotationalThrust 2`, `_angularDrag 0,92`, **`_usePhysicsToRotate: true`** | `ship.angularDrag` est lu **et jamais utilisé** : le vaisseau colle instantanément au repère caméra | **absent** |
| **roulis** | manette et clavier le prévoient | aucun axe de roulis | **absent** |
| **manette / tactile** | `XboxInput`, 16 icônes | branchés, mêmes axes et mêmes codes | **conforme** |

Le point le plus lourd est le premier : **il n'y a pas de marche dans le
portage**. On se déplace au sol comme dans le vide, à la poussée, sans vitesse
maximale, sans accélération, sans saut. C'est la sensation la plus immédiate du
jeu, et c'est la seule dont toutes les constantes étaient déjà extraites et
chargées.

### 1.2 Physique et collisions

| point | l'alpha (mesuré) | le portage | verdict |
|---|---|---|---|
| **modèle de gravité** | champ analytique par corps, `SingleFieldDetector` choisit | quatre zones, sélection du dominant | **conforme** |
| **orbites** | `InitialMotion`, vitesse initiale puis suivi du champ | circulaire exact + Verlet pour la comète | **conforme** |
| **champs directionnels** | 34 volumes, `_fieldMagnitude` **10** sur 29 d'entre eux (aussi 0, 7, 12, 13 ×2) | lisait `_forceScaleFactor` (**1** partout) : gravités locales **10× trop faibles** | **corrigé ici** |
| **direction des champs** | `_fieldDirection` est un `Vector3 {x,y,z}` | ne reconnaissait que les tableaux → repli `(0,−1,0)` systématique | **corrigé ici** |
| **arbitrage des volumes** | `_overridePriority`, de 0 à 5 | l'intensité départageait | **corrigé ici** |
| **`PolarForceField`** | 1 volume, `_acceleration −10`, axe local | non lu | **absent** |
| **fluides : traînée** | portée par le **détecteur** (`_dragFactor` 0,5 ou 1), pas par le volume | `DEFAULT_DRAG = 1` pour tous : les détecteurs ne sont pas lus | **écart** |
| **fluides : densité** | **présente partout** : atmosphère 1,2 · tornade 2 · océan 10 (`_deepDensity` 100) · rayon tracteur 500 | `density ?? 0` → **rien ne flotte** | **absent** |
| **fluides : courant** | `_flowSpeed` **300** et `_localLinearFlow (0,1,0)` sur les 8 `TornadoFluidVolume`, `_angularSpeed 10` | ni courant ni rotation : les tornades de Giant's Deep ne poussent rien | **absent** |
| **rayon tracteur** | `TractorBeamFluid`, densité 500, flux 10, capsule r=1 h=10 | non lu | **absent** |
| **doublons de fluides** | — | l'océan sort **deux fois** (r=498 densité 10 par `gameplay`, r=500 densité **0** par `solar`) et s'annule | **défaut** |
| **collision du vaisseau** | colliders réels | sphère analytique de rayon `upperSurfaceRadius` : le vaisseau se pose sur une sphère invisible, pas sur le terrain | **écart** |
| **corps du joueur** | capsule d'un contrôleur de personnage | sphère Havok r=0,6, amortissement angulaire 20 | **écart assumé** |
| **frottement** | — | `vel *= 0,86` (joueur) et `*= 0,7` (vaisseau) **par image**, non ramenés à `dt` : le freinage dépend de la fréquence d'images | **défaut** |
| **changement de référentiel** | `MatchInitialMotion`, `AttachOnAwake` : un objet hérite du mouvement de son porteur | au changement de corps ancré, les **positions** sont reportées, **jamais les vitesses** | **écart** |
| **repère tournant** | rotation propre réelle | le repère ancré tourne, mais ni Coriolis ni force centrifuge : en vol stationnaire, le sol ne défile pas sous le joueur | **écart** |

Deux conséquences de jeu méritent d'être nommées.

**Le report de vitesse manquant supprime une compétence entière.** En passant
de Timber Hearth à sa lune, le repère change ; les deux référentiels diffèrent
d'environ `√μ = √(12 × 250) ≈ 55 u/s`. Le portage recale les positions et laisse
les vitesses telles quelles : on arrive donc toujours **à l'arrêt relatif** de
sa cible. Or l'égalisation de vitesse avec le référentiel d'arrivée est
justement la quatrième phase de l'`Autopilot` ([`18`](18-vaisseau.md)) — et,
dans le jeu, la difficulté centrale du vol.

**Les tornades sont le contenu jouable de Giant's Deep.** Huit volumes en
capsule (r=40, h=305) qui poussent à 300 u/s vers le haut en tournant à
10 rad/s, plus six bases à 100 : c'est ce qui projette le vaisseau hors de
l'atmosphère. Le portage les lit comme de simples volumes de traînée.

### 1.3 Rendu visuel et audio

| point | l'alpha (mesuré) | le portage | verdict |
|---|---|---|---|
| **lumières placées** | **133** dans `level0` : 114 ponctuelles, 16 spots, 3 directionnelles | extraites, budget de 8 vivantes | **conforme** |
| **`RenderSettings`** | brouillard `exp2`, `(0,1456 ; 0,1567 ; 0,1403)` | lus ; le **repli** codé en dur était faux | **corrigé ici** |
| **sources audio** | **97** sources placées portant un clip (159 `AudioSource`, 62 sans clip), **36** clips distincts | instanciation à la volée | **conforme** |
| **portées audio** | **11 valeurs distinctes** : 10, 30, 50, 100, 200, 300, 400, 500, 750, 1000, 4000 | lues (A2 tenait) — et une seule tombe par hasard sur un ancien repli | **conforme** |
| **atténuation** | **83 sources sur 97 en courbe `custom`**, 14 en `logarithmic`, **aucune linéaire** | `rolloff === "logarithmic" ? "inverse" : "linear"` → 83 sources rendues dans le seul mode que le build n'emploie jamais | **écart** |
| **`rolloffCustomCurve`** | présente sur chaque source | jamais lue | **absent** |
| **spatialisation** | `Pan2D` n'atteint 1 sur aucune source | la branche « source plate » ne sert jamais | conforme (branche morte) |
| **impostures de planète** | `LODCameraSnapshot` ×5, `_snapshotInterval 1` : les planètes lointaines sont **rendues dans une texture** rafraîchie chaque seconde | sphères de substitution unies | **absent** |
| **`LODGroup`** | **2 objets** de classe 205 dans `level0` ; les 5 `CreateLODGroup` ont des champs **vides** | `lodThresholds()` n'en tire **aucun** seuil : le 0,0022 unique reste la règle | **écart, et A8 surestimée** |
| **`ChildColliderLOD`** | 21, avec `_trackPlayer/_trackShip/_trackProbe` | extraits, non appliqués | **absent** |
| **shaders** | 122, dont 37 maison | 203 affectations, implémentations originales | conforme par l'intention, **non jugé à l'œil** |

Deux points changent le plan d'action.

**A8 valait moins que prévu.** [`08`](08-reste-a-faire.md) et
[`35`](35-monde.md) attendaient qu'on régénère `unity41-types.json` pour
récolter les `LODGroup` du build. Ils sont **deux**, et les cinq
`CreateLODGroup` ne portent aucun champ sérialisé. Il n'y a donc rien à
récolter : le vrai gain de niveau de détail est ailleurs, dans les 21
`ChildColliderLOD` et dans les impostures.

**Les impostures expliquent le budget du jeu.** `LODCameraSnapshot` est la
raison pour laquelle l'alpha affiche un système entier : les planètes
lointaines sont des textures rafraîchies une fois par seconde. Le portage a
résolu le même problème autrement (sphères + secteurs), ce qui est légitime,
mais ce n'est pas ce que fait le jeu et le ciel n'y ressemble pas.

### 1.4 Logique et IA

| point | l'alpha (mesuré) | le portage | verdict |
|---|---|---|---|
| **prédateurs** | accélération 2, inspection 15, poursuite 42, fuite 300, habitat 1200, bruit 200 | portés, nourris par le champ audio réel | **conforme** |
| **rayon de prise** | **absent du build** (volume de collision sur la bouche) | 25, choix assumé et documenté | conforme au dépôt |
| **boucle temporelle** | 20 min, onde à 2 000 u/s | portée | **conforme** |
| **lune quantique** | `_checkDepth`/`_checkRadius`, `AlignQuantumMoon` | portés | **conforme** |
| **dégâts du vaisseau** | seuils 15/30/100/300 ; masque et modificateurs à **0** | câblés, éteints comme dans le build | **conforme** |
| **zones d'oxygène** | **10 `OxygenVolume`** : `Atmosphere` r=250 et r=106, `PineGroveVolume` r=24, 5 `OxygenVolume` de 13 à 35, `TimeLoopVolume` r=31 — **et `Ship_Body`, sans collider** | `oxygenZones()` en retient 10 sur 10 ; celle du vaisseau n'a pas de volume et passe par `ship.boarded` | **conforme** |
| **détecteur d'oxygène** | `OxygenDetector` sur le joueur, capsule r=0,5 h=2 | non lu (le test de zone est ponctuel) | écart mineur |
| **`RocketKidConvoController`** | **présent**, trois arbres : `_introduction`, `_successfulLanding`, `_tooManyCrashes` | classé « aucune source » dans [`08`](08-reste-a-faire.md) | **à reclasser** |
| **arbres par référence** | les contrôleurs portent des `PPtr` vers leurs arbres | les `$ref` se résolvent en **os de squelette** (`anglerfish_rig:UpTail4`, `villager_rig:R_lowerEye4_JNT`) : le `fileId` du pointeur n'est pas suivi | **défaut probable, à confirmer** |
| **espace replié de Dark Bramble** | aucun volume de distorsion | absent | **hors d'atteinte**, confirmé |

Le dernier point mérite prudence : je constate que les `PPtr` des contrôleurs de
dialogue se résolvent vers des objets qui ne peuvent pas être des arbres de
dialogue. C'est le symptôme d'un `fileId` ignoré au déréférencement. Je ne l'ai
pas isolé jusqu'au bout ; il est inscrit comme **à confirmer**, pas comme
établi.

---

## 2. Actions correctives déduites

Chaque action dit **quoi faire**, **où**, et **comment le vérifier**. Les
valeurs sont celles mesurées ci-dessus.

### 2.1 Rendre au joueur son modèle de déplacement — `player.js`

Le constructeur reçoit déjà `playerConstants(data)` et l'ignore. Il faut
séparer deux régimes que le portage confond :

```
au sol      v_cible = groundSpeed (7) ou strafeSpeed (5) selon l'axe
            v += (v_cible − v) · groundAcceleration · dt      (approche, pas force)
            saut : v += up · jumpSpeed (6), sur front de touche
            appui  : sphère de rayon 0,46 lancée sur 0,6, et normale
                     dont l'angle à la verticale reste sous 45°
en vol      a = maxTranslationalThrust (7) le long de la commande
près du sol a_vertical = surfaceVerticalThrust (12)
            a_laterale = surfaceLateralThrust (5)
```

Supprimer `thrust = 18`, `mass = 70` codés en dur et le multiplicateur `boost`
inventé ; ne consommer du carburant que sous poussée du sac dorsal, jamais en
marchant. Vérifier dans `tests/09-jeu.mjs` : vitesse en régime établi égale à
`groundSpeed` à 1 % près, hauteur de saut `jumpSpeed²/2g`, glissement au-delà
de 45° de pente.

### 2.2 Donner au vaisseau une inertie de rotation — `ship.js`

`_usePhysicsToRotate` vaut **vrai** et `_angularDrag` 0,92 est lu sans être
employé. Le vaisseau doit porter son propre quaternion, intégré comme un
second ordre :

```
ω += (couple de commande · _maxRotationalThrust (2)) · dt
ω *= _angularDrag (0,92)          convention Unity, par pas fixe
q  = normalize(q + ½ · ω ⊗ q · dt)
```

La caméra suit le vaisseau au lieu de le commander ; l'écart entre le regard et
le nez devient visible, et c'est exactement la lourdeur que décrit
[`07`](07-gameplay.md). Ajouter le roulis. Vérifier : temps de demi-tour à
poussée pleine, et vitesse angulaire terminale `couple/(1 − drag)`.

### 2.3 Lire les fluides pour ce qu'ils sont — `fluids.js`

Trois manques et un doublon :

- **traînée** : la prendre sur `SimpleFluidDetector._dragFactor` (0,5 ou 1) et
  `ShipFluidDetector._dragFactor` (1), pas sur la constante `DEFAULT_DRAG` ;
- **densité** : elle est dans chaque volume (`_density`, et `_deepDensity` 100
  pour l'océan). Appliquer `a = −g · (ρ − 1)` et supprimer la note qui affirme
  qu'elle n'y est pas ;
- **courant** : `_flowSpeed` et `_localLinearFlow` produisent une vitesse de
  milieu ; la traînée doit s'appliquer à `v − v_milieu` et non à `v`. Avec
  `_angularSpeed` et `_localRotationAxis`, c'est la tornade complète ;
- **doublon** : le même océan sort de `gameplay` (avec densité) et de
  `solar.fluids` (sans). Dédoublonner sur le nom et la position, garder la
  version qui porte la densité.

Ajouter `_priority` (0 à 100) pour arbitrer les volumes qui se recouvrent —
l'intérieur du vaisseau est à 100, le centre d'une tornade à 5, l'océan à 1.

Vérifier dans `tests/09-jeu.mjs` : vitesse limite de chute `g/k`, remontée d'un
corps de densité inférieure, et vitesse d'éjection d'une tornade.

### 2.4 Reporter les vitesses au changement de repère — `main.js`

Au basculement d'ancre, la boucle décale les positions de `shift` et laisse les
vitesses. Il faut y ajouter la vitesse **relative** des deux référentiels,
qu'`orbits.js` connaît déjà (`s.vel` pour une orbite intégrée,
`ω × r` pour une orbite circulaire) :

```
v_joueur   += v_ancienne_ancre − v_nouvelle_ancre
```

et de même pour le vaisseau et les sondes en vol. Exposer une
`frameVelocity(orbits, body)` à côté de `currentPosition()`. Vérifier :
partir en ligne droite de Timber Hearth vers sa lune et constater qu'on arrive
avec une vitesse relative non nulle — c'est ce que l'`Autopilot` doit ensuite
annuler.

### 2.5 Rendre les frottements indépendants de la fréquence d'images

`player.js:171` et `ship.js:116` multiplient la vitesse par une constante **par
image**. À 30 im/s le freinage est deux fois plus faible qu'à 60. Remplacer
`v *= k` par `v *= Math.pow(k, dt · 60)`, ou par la forme continue
`v *= max(0, 1 − c·dt)` déjà employée dans `fluids.js`.

### 2.6 Suivre les courbes d'atténuation audio — `audio.js`

83 sources sur 97 sont en `custom`, et le portage les rend en linéaire — le
seul mode absent du build. Deux niveaux, du moins cher au plus juste :

1. traiter `custom` comme `inverse` plutôt que `linear` : une courbe
   personnalisée d'Unity part presque toujours d'une décroissance rapide ;
2. lire `rolloffCustomCurve` (une `AnimationCurve`, déjà décodée ailleurs pour
   `_repelCurve`) et l'échantillonner dans un `spatialCustomCurve`.

Vérifier : à mi-distance entre `MinDistance` et `MaxDistance`, le gain rendu
doit suivre la courbe du build à quelques pour cent.

### 2.7 Corriger le déréférencement des arbres de dialogue

Les `PPtr` des `*ConvoController` se résolvent vers des os de squelette. Isoler
le point où le `fileId` est perdu (`env.deref`, ou l'index de fichiers de
`ExtractContext`), puis garder en invariant que **l'objet visé par un
contrôleur de dialogue est un arbre**, jamais un `Transform`.

### 2.8 Requalifier le niveau de détail

Cesser d'attendre `LODGroup` : il y en a **deux**, et les `CreateLODGroup` sont
vides. Reporter l'effort sur les 21 `ChildColliderLOD` — qui portent
`_trackPlayer` et feront tomber les 441 colliders de Timber Hearth — et, si le
budget de rendu le demande, sur des impostures à la `LODCameraSnapshot`.

### 2.9 Les petites lectures manquantes

`PolarForceField` (`_acceleration −10`) ; `_affectsAlignment` des champs
directionnels, maintenant lu mais pas encore appliqué à l'orientation du
joueur ; `OxygenDetector` et son volume ; `_telescopeTurnScalar` à la lunette.

---

## 3. Backlog de finalisation

Priorisé par **écart ressenti par pouce de code écrit**. Ce qui a été fait dans
cette série est coché.

### Haute priorité — cœur du gameplay

- [ ] **Modèle de marche et saut** (§2.1). Le plus gros écart du portage, et
      toutes ses constantes sont déjà chargées et ignorées.
- [ ] **Inertie de rotation du vaisseau et roulis** (§2.2). `_usePhysicsToRotate`
      vaut vrai ; le vaisseau du portage tourne comme une caméra.
- [ ] **Report des vitesses au changement de référentiel** (§2.4). Sans lui, le
      vol interplanétaire n'a pas de difficulté.
- [ ] **Courants de fluide : tornades et rayon tracteur** (§2.3). C'est le
      contenu jouable de Giant's Deep.
- [x] **Intensité des champs directionnels** — lisait `_forceScaleFactor` (1) au
      lieu de `_fieldMagnitude` (10) : gravités locales dix fois trop faibles,
      donc écrasées par le champ radial. Corrigé, avec la direction `{x,y,z}` et
      l'arbitrage par `_overridePriority`.
- [ ] **Traînée et densité des fluides depuis les détecteurs et les volumes**
      (§2.3), et dédoublonnage de l'océan.
- [ ] **Collision réelle du vaisseau** : il se pose aujourd'hui sur une sphère
      de rayon `upperSurfaceRadius`, donc au-dessus du terrain.

### Moyenne priorité — sensation et retour

- [ ] **Pente praticable et sonde d'appui sphérique** (`_maxAngleToBeGrounded 45`,
      `_sphereCastRadius 0,46`).
- [ ] **Déséquilibre à l'atterrissage** (`_tumbleDuration 1,5`).
- [ ] **Courbes d'atténuation audio** (§2.6) — 83 sources sur 97 sont concernées.
- [x] **Couleur de brouillard de repli** corrigée d'après les `RenderSettings`.
- [ ] **Sensibilité de visée du build** (`_turnRate 160`) et ralenti à la lunette
      (`_telescopeTurnScalar 0,5`).
- [ ] **Carburant : ne plus en consommer en marchant.**
- [ ] **Frottements ramenés à `dt`** (§2.5) — un bug franc, mais peu visible.
- [ ] **`PolarForceField` et `_affectsAlignment`** (§2.9).
- [ ] **Forces d'inertie du repère tournant** (Coriolis, centrifuge) : à 0,05 rad/s
      et 250 u, le sol devrait défiler à 12,5 u/s sous un joueur en vol
      stationnaire.
- [ ] **Équilibrage à l'oreille et à l'œil**, et **une partie jouée** : inchangé,
      et toujours hors de portée d'une machine.

### Basse priorité — détails, justesse, tenue

- [x] **`tests/08` construisait son contexte sans `unity41-types.json`** : il
      comptait 0 animation sur un build qui en porte 34.
- [x] **`tests/05` gardait les portées audio sur une liste vide** : l'invariant
      A2 ne vérifiait rien.
- [ ] **Déréférencement des arbres de dialogue** (§2.7) — à confirmer avant de
      corriger.
- [ ] **Requalifier A8** (§2.8) : `LODGroup` ne vaut pas la régénération
      annoncée ; viser `ChildColliderLOD`.
- [ ] **Impostures de planète** à la `LODCameraSnapshot`, si le budget de rendu
      le demande.
- [ ] **`OxygenDetector`** et son volume, plutôt qu'un test ponctuel.
- [ ] **Babylon, 11,1 Mo** : choix de projet, inchangé ([`34`](34-actions.md) A17).
- [ ] **Gain réel de l'encodage Opus**, toujours non mesuré.

---

## Ce que l'audit change au reste des pages

- [`08-reste-a-faire.md`](08-reste-a-faire.md) : le compte d'animations passe à
  34 ; `RocketKidConvoController` sort de « ce qui n'est pas dans le build » ;
  la ligne `LODGroup` de « techniquement ouvert » perd son objet.
- [`29-brouillards.md`](29-brouillards.md) : la couleur de brouillard recopiée
  était fausse, la mesure est inscrite.
- [`34-actions.md`](34-actions.md) : **A2 tenait** (les portées sont bien celles
  du build, 11 valeurs distinctes), **A6 ne tenait qu'à moitié** (les champs
  étaient lus, leur intensité non), **A7 ne tenait qu'en partie** (traînée oui,
  densité et courant non), **A8 était surestimée**.

La leçon de [`34`](34-actions.md) — « avant de conclure qu'une chose manque au
build, vérifier qu'on la lit » — se prolonge d'une seconde : **avant de conclure
qu'on la lit, la mesurer sur le build**. Six des neuf écarts de l'audit
précédent étaient des lecteurs absents ; quatre de ceux-ci sont des lecteurs
présents qui lisaient à côté, et deux étaient des tests qui gardaient le vide.
