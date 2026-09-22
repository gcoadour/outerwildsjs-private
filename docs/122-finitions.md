# Finitions et raccordements : portes, sons réactifs, sous-émetteurs et chaleur

Ce lot comble les derniers écarts fonctionnels et visuels identifiés entre le build de l'alpha et le portage.

## 1. Les portes d'énergie et le regard

`EnergyGate` était instanciée et mise à jour par le moteur, mais ses champs `alpha` et `solid` n'étaient reliés à aucun maillage ni collider Babylon : regarder la toile trois secondes déclenchait l'animation logique, mais la barrière restait visuellement présente et physiquement infranchissable.

Les portes sont désormais reliées à leurs nœuds dans la hiérarchie de la scène :
- `alpha` pilote l'opacité et la visibilité des sous-maillages ;
- `solid` active ou désactive le collider physique ;
- à transparence complète (`alpha === 0`), le nœud est désactivé (`setEnabled(false)`), dégageant le passage sans résidu visuel ni coût de rendu.

## 2. L'eau et le flashback s'entendent

Deux classes extraites par le pipeline n'avaient aucun point de chute dans le moteur :
- `PlayerSubmergeAudio` : franchir la surface de l'océan de Giant's Deep déclenche les sons d'immersion (`enterWater`) et d'émersion (`exitWater`) ;
- `FlashbackAudioController` : le début de la séquence de flashback lors de la mort du joueur s'accompagne désormais de son clip dédié.

## 3. Parler immobilise le joueur

Dans le build, entrer en conversation bascule le schéma d'entrée sur `ConversationInput`, empêchant le joueur de continuer à marcher ou dériver pendant qu'il parle à un habitant. `main.js` annule désormais les vecteurs de déplacement dès que `dialogue.active` est vrai.

`RoastPromptEvent` est par ailleurs ajouté à l'en-tête `// @lit` de `helmet.js`, alignant le recensement avec les huit invites de guimauve.

## 4. La chaleur vient des émetteurs de rayonnement

L'ancien motif `HeatSource` parcourait les composants à la recherche d'un nom contenant « heat » — inexistant dans le build. La chaleur est désormais lue directement depuis les neuf `RadiationEmitter` du build (`type === 1`, thermique), et `heatAt()` applique la courbe d'atténuation exacte `radiationAt()`.

Les dix-sept textures défilantes qui ne s'attachaient pas faute d'une égalité stricte de nom avec les maillages glTF sont raccordées par appariement de sous-chaînes avec exclusion mutuelle, animant cascades et tourbillons.

## 5. Sous-émetteurs de particules et disparition au trou noir

- `SubModule` : le pipeline extrait les noms et déclencheurs (`birth`, `death`) des sous-émetteurs Shuriken, que le moteur instancie via `BABYLON.SubEmitter`.
- `_vanishEffectPrefab` : `BlackHole.vanishEffect()` réduit graduellement l'échelle des fragments de croûte s'approchant du trou noir avant leur capture, matérialisant l'effondrement visuel dans le vide.

## Gardé par

- `tests/09-jeu.mjs` — tests de détection audio, seuils thermiques et atténuation du trou noir (2 342 vérifications).
- `scripts/lois.mjs` — zéro loi orpheline.
