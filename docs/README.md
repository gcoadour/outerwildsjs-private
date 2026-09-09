# Notes d'analyse

Ce dossier documente le jeu et son portage. Rien de ce qui est ici n'est du
contenu du jeu : ce sont des mesures, des relevés et des explications.

## Le build et sa lecture

- [`01-build.md`](01-build.md) — anatomie du build, versions, empreintes
- [`03-typetrees.md`](03-typetrees.md) — comment on lit un build *stripped*
- [`31-navigateur.md`](31-navigateur.md) — **le pipeline dans le navigateur**
- [`24-outils.md`](24-outils.md) — télescope, sonde et sources de savoir
- [`27-poids.md`](27-poids.md) — poids au démarrage, chargement à la demande

## Le code du jeu

- [`02-architecture.md`](02-architecture.md) — architecture du code de jeu
- [`04-gravite.md`](04-gravite.md) — le modèle de gravité, et pourquoi il n'est pas newtonien
- [`06-orbites.md`](06-orbites.md) — orbites simulées et référentiels
- [`07-gameplay.md`](07-gameplay.md) — ressources, vaisseau, interaction
- [`12-boucle.md`](12-boucle.md) — boucle temporelle de 20 minutes et supernova
- [`32-mort.md`](32-mort.md) — **mourir, et la fin des temps**
- [`17-secteurs.md`](17-secteurs.md) — secteurs, niveau de détail par maillage et éviction
- [`18-vaisseau.md`](18-vaisseau.md) — pilote automatique et dégâts
- [`23-connaissance.md`](23-connaissance.md) — la connaissance débloque le jeu

## Les lieux

- [`14-quantique.md`](14-quantique.md) — lune quantique
- [`15-trounoir.md`](15-trounoir.md) — trou noir et trou blanc
- [`16-bramble.md`](16-bramble.md) — Dark Bramble et prédateurs
- [`29-brouillards.md`](29-brouillards.md) — brouillards de Dark Bramble et de la lune quantique

## Le rendu et le son

- [`05-gltf.md`](05-gltf.md) — export glTF, conversion de repère, décodage des sommets
- [`09-audio.md`](09-audio.md) — audio spatial et le piège du moteur audio Babylon
- [`10-particules.md`](10-particules.md) — particules et modes de fusion
- [`11-shaders.md`](11-shaders.md) — classement des shaders et atmosphères
- [`20-shaders-jeu.md`](20-shaders-jeu.md) — application des shaders du jeu
- [`21-skinning.md`](21-skinning.md) — skinning des personnages
- [`22-animations.md`](22-animations.md) — animations et le mur Mecanim
- [`26-muscleclip.md`](26-muscleclip.md) — décodage des clips Mecanim (`m_MuscleClip`)

## L'interface

- [`13-dialogue.md`](13-dialogue.md) — dialogues et mémoire entre boucles
- [`19-carte.md`](19-carte.md) — carte du système solaire
- [`25-interface.md`](25-interface.md) — interface de dialogue et sondes
- [`28-hud.md`](28-hud.md) — jauges de ressources et invites à l'écran
- [`30-consoles.md`](30-consoles.md) — ordinateur de bord, lampe, guimauve
- [`33-mobile.md`](33-mobile.md) — **commandes tactiles à deux manches et jeu en paysage**

## Ce qui manque

- [`08-reste-a-faire.md`](08-reste-a-faire.md) — ce qui manque pour un portage complet
- [`34-actions.md`](34-actions.md) — le jeu et le portage face à face : les actions à mener
- [`35-monde.md`](35-monde.md) — le monde qu'on ne lisait pas : rotation, lumières, fluides, champs, manette
- [`36-audit.md`](36-audit.md) — **l'audit mesuré sur le build : matrice des écarts, actions, backlog**
