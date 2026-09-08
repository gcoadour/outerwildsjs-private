# Le monde qu'on ne lisait pas

[`34-actions.md`](34-actions.md) avait fait un constat gênant : la moitié de ce
qui manquait au portage **était déjà extrait**. Les valeurs étaient mesurées,
écrites dans `data/`, et aucun module du moteur ne les ouvrait. Cette page dit
ce qui a été branché, comment, et ce que ça change.

> Cette session n'a pas le build : rien n'y a été **mesuré**. Ce qui est écrit
> ici décrit le mécanisme et pointe la source, comme le faisait `34-actions.md`.
> Les comptes réels sortiront à la première extraction — `tests/05-extract.mjs`
> et `tools/15_verify.py` les relèvent désormais.

## 1. La rotation propre des corps

`web/src/spin.js`. Le build donne la rotation deux fois : **65
`RotateTransform`** (`_localAxis`, `_degreesPerSecond`) et l'`InitialMotion` de
chaque corps (`_rotationAxis`, `_initAngularSpeed`, de 0,02 à 0,05 rad/s, voir
[`04-gravite.md`](04-gravite.md)). `pipeline/extract/solar.js` écrivait déjà
`spin` et `orbit.spinAxis` / `orbit.spinSpeed` dans `solar_system.json`. Rien ne
les lisait : les planètes étaient figées, il n'y avait ni cycle jour/nuit, et la
règle « face nuit » de la lampe ne pouvait jamais basculer.

**La rotation s'applique au repère ancré, pas à la géométrie.** C'est le même
raisonnement que le floating origin ([`06-orbites.md`](06-orbites.md)) : le corps
dominant est immobile dans son propre repère, et le faire tourner revient à
faire tourner le reste du monde autour de lui.

| ce qui tourne | ce qui ne tourne pas |
|---|---|
| les autres corps, donc l'étoile, donc la lumière et les ombres | le sol du corps ancré, et ses colliders statiques Havok |
| le ciel vu depuis la surface | ce qui est **posé** sur le corps — sources audio, volumes, interactifs |

La seconde colonne n'est pas une approximation : ces objets tournent *avec* le
corps, leur position relative au sol est donc juste. Faire tourner la géométrie
aurait obligé à reconstruire les colliders à chaque image — 898 ms sur Timber
Hearth.

`sunElevation()` en tire la hauteur du soleil au-dessus de l'horizon local, donc
la nuit, qui n'existait pas jusqu'ici.

## 2. Les portées audio, enfin celles du jeu

`pipeline/extract/audio.js` inventait une portée **par piste** — 300 pour
Signal, 150 pour Ambience, 60 sinon — au motif qu'« Unity 4 n'expose pas
min/max distance ». C'était vrai **du pipeline Python** : UnityPy cherchait
`m_MinDistance`, or en 4.1 le champ s'appelle `MinDistance`, sans préfixe. Il
est dans le type tree de `unity41-types.json`, que le pipeline navigateur lit
directement.

Sont lus désormais : `MinDistance`, `MaxDistance`, `rolloffMode`, `Pan2D`,
`DopplerLevel`, `Loop`. Le moteur en tire le rayon intérieur (plein volume), le
modèle d'atténuation (`Logarithmic` devient `inverse` côté WebAudio) et la
portée. `Pan2D = 1` désigne une source non spatialisée, qu'on n'a plus à
deviner.

Second défaut, de la même famille : les neuf émetteurs prenaient
`transmitter.falloff` comme portée spatiale — un rayon **en pixels d'écran**
(`HarmonicaSignal` : 400 px devenus 400 unités de monde). Les rayons en pixels
ne servent plus qu'à `signalStrength`, où ils ont un sens
([`09-audio.md`](09-audio.md)).

L'invariant gardé : **aucune source ne doit tomber sur une portée de repli**.
L'équilibrage à l'oreille reste à faire — mais il portera enfin sur les valeurs
du jeu.

## 3. Les lumières et les `RenderSettings`

`pipeline/extract/lighting.js`, `web/src/lights.js`. Le moteur créait **une**
directionnelle pour l'étoile et **une** hémisphérique d'ambiance, pour tout un
système solaire. Les composants `Light` du build portent type, couleur,
intensité, portée, angle de spot, ombres et mode de *lightmapping* : c'est une
classe moteur, sa structure est dans `unity41-types.json`, il n'y avait rien à
régénérer.

Une lumière temps réel est chère : elles sont instanciées à la volée dans un
**budget de 8**, les plus proches d'abord, comme l'audio et les particules. Deux
écarts sont écartés d'emblée : une lumière éteinte, et une lumière **cuite dans
les lightmaps** (`m_Lightmapping = 2`), qui n'éclaire rien à l'exécution et
occuperait le budget pour rien.

Les `RenderSettings` suivent le même chemin : `fog.js` portait en dur le gris
`(0,5 ; 0,5 ; 0,5)` et `m_FogMode = 3` relevés à la main
([`29-brouillards.md`](29-brouillards.md)). Ils sont lus. Une valeur juste et
une valeur recopiée se ressemblent jusqu'au jour où l'une des deux change.

## 4. Les champs de force directionnels

Le build compte **34 `DirectionalForceField`** contre 10 `GravityWell`
([`02-architecture.md`](02-architecture.md)) : ce sont les gravités locales, et
l'un des porteurs de la croûte de Brittle Hollow s'appelle `GravityTrail`.

Ils ne s'ajoutent pas au champ radial : **ils le remplacent dans leur volume**.
C'est bien le rôle de `SingleFieldDetector`, qui ne combine pas mais choisit. Le
corps, lui, reste celui du champ radial — c'est lui qui porte l'ancre du repère,
le rayon de surface et le nom affiché ; seules la direction et l'intensité
changent.

Le composant ne porte pas sa portée : elle est dans le **collider posé à côté**.
`ExtractContext.volumeOf()` la mesure (sphère, boîte, capsule), en appliquant
l'échelle monde du `GameObject`. Sans volume lisible ou sans intensité lisible,
le champ est **écarté** plutôt que deviné, et le champ radial reprend la main.

## 5. Les fluides, et l'océan de Giant's Deep

`web/src/fluids.js`. `SphereOceanFluidVolume` figurait dans les classes lues par
`extract/solar.js` **depuis toujours** — mais la boucle n'écrivait un corps que
s'il portait un `GravityWell` ou un `PlanetoidSector`. Le volume était lu puis
jeté. Giant's Deep n'avait pas d'océan, et le `_dragCoefficient` de 10 des
fragments de croûte ne s'appliquait jamais.

Les volumes sortent maintenant à part — ce n'est pas un corps, c'est un milieu —
et joueur, vaisseau et fragments les traversent :

```
traînée   v *= max(0, 1 − k·dt)      convention des rigidbody d'Unity
poussée   a = −g × densité           opposée à la gravité
```

La traînée est celle d'Unity, parce que c'est elle que `_dragCoefficient`
désigne ; la vitesse limite de chute vaut donc `g / k`. La poussée d'Archimède,
elle, **n'est pas dans le build** : aucun volume ne porte de densité. Elle est à
zéro par défaut — un fluide freine, il ne fait flotter que si on le lui demande.

Sous Havok, la vitesse vit dans le corps physique : la corriger sur `vel` seul
ne ferait rien, il faut la lui rendre. C'est ce que fait `Player.applyFluid`.

## 6. Ce que l'extracteur ne savait pas nommer

Une liste fermée de classes ne peut pas trouver ce qu'elle ne nomme pas. La
question « qui fournit l'oxygène hors du vaisseau ? » n'avait pas de réponse,
faute d'avoir ouvert le build — et on ne savait donc pas si c'était un manque du
portage ou de l'alpha.

`extract/gameplay.js` ramasse désormais par **motif** les familles dont on
ignore le nom exact — oxygène, fluides, champs de force, LOD, sources de
chaleur, contrôleurs de dialogue — et publie ce qu'il a trouvé dans
`stats.decouvertes`. Un compte nul est alors une **réponse**, pas un oubli : à
inscrire dans [`08-reste-a-faire.md`](08-reste-a-faire.md) §1.

Les volumes de tout ce petit monde viennent des colliders posés à côté des
composants, par le même `volumeOf()`.

## 7. La manette

`web/src/gamepad.js`. Le build décrit une manette entière (`XboxInput`),
l'extracteur d'invites retient **le bouton attendu par chaque invite**, et les
16 textures d'icônes sont extraites avec leur nommage particulier
(`RightTrigger` → `RT.png`, voir [`28-hud.md`](28-hud.md)). `hud.js` affichait
déjà l'icône. Il ne manquait que la lecture.

Comme la couche tactile, elle **ne crée aucune commande** : elle produit les
mêmes axes et les mêmes codes clavier, si bien que rien en aval ne sait d'où
vient l'ordre ([`33-mobile.md`](33-mobile.md)). Trois détails comptent :

- la Gamepad API ne pousse **aucun événement** : elle se lit une fois par image ;
- seuls les **fronts** déclenchent une commande, sinon un bouton tenu ouvrirait
  et fermerait la carte à chaque image ;
- le manche droit tourne la caméra en **vitesse**, avec la même courbe que le
  pouce : linéaire près du centre, cubique au bord.

| bouton | build | commande |
|---|---|---|
| A | `AButton` | pousser vers le haut |
| B | `BButton` | interagir, parler |
| X / Y | `XButton` / `YButton` | lampe / télescope |
| LB / RB | `LeftBumper` / `RightBumper` | ordinateur de bord / sonde |
| Back / Start | `Back` / `Start` | carte / réglages |
| gâchettes | `LeftTrigger` / `RightTrigger` | monter / accélérer |

## 8. Les petites règles

- **`_checkDepth`** de la lune quantique. `CHECK_RADIUS = 150` et
  `CHECK_DEPTH = 100` étaient exportés et **inutilisés** : le test d'occlusion
  était binaire, là où le jeu lance une sphère **sur une profondeur**. La sphère
  revient à grossir l'obstacle de 150, et il faut y rester sur 100 pour qu'il
  compte : **raser le limbe d'une planète ne masque plus la lune**, passer
  franchement derrière, si.
- **`AlignQuantumMoon`** : la lune fait face à l'observateur. Sans lui, elle
  changeait de planète *et* d'aspect à chaque saut.
- **`CorruptionAnimator`** (×10) : un seuil de découpe de matériau, interpolé
  sur la fraction de boucle. Le répartiteur de shaders posait déjà une découpe
  alpha sur ces matériaux ; il n'y avait qu'un seuil à déplacer.
- **`DerelictCloaker`** : entrer dans une zone d'épave **suspend** la mise à
  jour du brouillard (`EnterDerelictZone` / `ExitDerelictZone`).
- **Le bruit des prédateurs** vient des sources audio qui jouent réellement, et
  non plus des commandes du joueur. Un prédateur va vers **ce qu'il entend** :
  on peut se trahir en laissant tourner une source, ou s'en servir de leurre.
- **Les caméras déportées** (`RemoteFlightConsole`,
  `SatelliteSnapshotController`) réutilisent la vue de la sonde
  ([`25-interface.md`](25-interface.md)) : c'est le moyen qui leur manquait.
  Touche **R** à portée de la console.
- **La guimauve** ne grille plus sur commande mais au-dessus d'un `HeatSource`,
  avec la formule du build : `_cookTime = 5`, donc cinq secondes à chaleur 100.
- **La mort** joue un son par cause — la source dont le nom parle de cette
  cause, la piste `Death` à défaut — et la caméra bascule et descend pendant la
  séquence, puis se relève au fondu.
- **L'arbre de dialogue** est choisi par la **référence** que porte le
  contrôleur (`CoachConvoController`, `CuratorConvoController`…), et non plus
  par une recherche sur le nom de l'arbre ([`23-connaissance.md`](23-connaissance.md)).

## 9. Le poids

- **Opus à l'extraction.** Quinze clips sont stockés décodés dans le build :
  15 Mo de WAV 48 kHz 16 bits sur les 66 du démarrage
  ([`27-poids.md`](27-poids.md)). La chaîne d'outils Python n'a pas d'encodeur
  Vorbis — mais le navigateur en a un. `AudioEncoder` (WebCodecs) encode en Opus
  **dans le worker, au moment de l'extraction, une fois pour toutes**.

  WebCodecs rend des paquets nus : sans conteneur, aucun navigateur ne les joue.
  `pipeline/audioenc.js` les emballe en Ogg (RFC 7845). Le piège est le CRC :
  celui d'Ogg **n'est pas celui de zlib**, il n'est pas réfléchi, et s'y tromper
  produit un fichier muet sans autre symptôme. Sans `AudioEncoder`, ou au
  moindre accroc, le WAV part tel quel — un clip qui pèse vaut mieux qu'un clip
  muet.
- **Le cache du Service Worker.** 27 URL étaient demandées jusqu'à cinq fois,
  faute d'en-têtes. Les fichiers de `data/` sont **immuables** : ils viennent
  d'être reconstruits et rien ne les modifie. `sw.js` annonce donc
  `Cache-Control: public, max-age=86400, immutable` et garde les petits fichiers
  (≤ 512 Ko, 8 Mo en tout) en mémoire. La page prévient le worker quand une
  nouvelle extraction commence — il n'a aucun moyen de le savoir seul.

## 10. `mainData`

`pipeline/worker.js` chargeait bien les cinq fichiers, mais l'`ExtractContext`
était construit sur `level0` seul : les **989 objets** de `mainData` — scène de
démarrage et managers — ne sortaient jamais. C'est ce qui explique les 7 rendus
`V-Fog` restés introuvables ([`20-shaders-jeu.md`](20-shaders-jeu.md)) et
l'absence de menu principal ([`28-hud.md`](28-hud.md)).

Scène et composants y passent maintenant, dans `data/scene/maindata.json` et
`data/components/maindata.json`. **C'est un inventaire, pas un portage** : ce
qu'on en tirera se décide en le lisant.

## Ce qui reste ouvert

- **Les niveaux de détail du build.** `lod.js` lit les seuils quand
  `CreateLODGroup` en porte, et l'extracteur sait lire la classe moteur
  `LODGroup` (205) — mais sa structure n'est pas encore dans
  `unity41-types.json` : `tools/16_unity_types.py` la demande désormais, et il
  faut relancer l'outil (UnityPy) pour l'obtenir. Tant qu'elle manque, rien
  n'est émis et le seuil unique de 0,0022 reste la règle. Les 21
  `ChildColliderLOD` sont extraits et pas encore appliqués aux colliders.
- **Babylon pèse 11,1 Mo** des 66. Une compilation sur mesure les réduirait, au
  prix d'une étape de construction que le dépôt n'a pas (« aucune dépendance
  npm »). C'est un choix de projet, pas une optimisation à faire en passant.
- **Tout le jugement humain**, inchangé : l'équilibrage des volumes — que la
  section 2 rend enfin discutable sur des valeurs du jeu —, l'échelle des
  particules, le rendu des atmosphères et de l'explosion, et une partie jouée.
