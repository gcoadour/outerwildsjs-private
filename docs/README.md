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
- [`38-depart.md`](38-depart.md) — **le départ de la partie : point d'apparition, regard, hauteur des yeux**
- [`39-fluides.md`](39-fluides.md) — **les quatre lois de fluide, lues dans l'IL du build : l'océan repousse**
- [`40-solide.md`](40-solide.md) — **ce qui est solide : un tiers des maillages ne l'est pas, et on se posait sur le ciel**
- [`41-ciel.md`](41-ciel.md) — **la première image, regardée : voûte, nuages, étoiles, et pourquoi il faisait jour la nuit**
- [`42-lumieres.md`](42-lumieres.md) — **le recensement des 275 classes posées : lumières vivantes et textures qui défilent**

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

- [`80-invites.md`](80-invites.md) — **les invites qui ne devaient pas être là, et un contrôle qui gardait le bug**
- [`79-alignement.md`](79-alignement.md) — **perdre la gravité vous prend les commandes : 50°/s, et la toute première image est alignée quoi qu'il arrive**
- [`78-modele.md`](78-modele.md) — **le vaisseau miniature vole, et l'enfant compte : cinq crashs valent un reproche, et il passe avant la réussite**
- [`77-sons.md`](77-sons.md) — **les huit sons que l'interface ne faisait pas, et une réparation qui ne s'entend pas pareil dans le vide**
- [`76-proximite.md`](76-proximite.md) — **le tableau de bord ne parle que de près, le tutoriel ne se rejoue pas, et un garde-fou qui n'avait jamais parlé**
- [`75-chaleur.md`](75-chaleur.md) — **la chaleur qui n'existait pas : un motif qui ne trouvait rien, une guimauve qui ne cuisait jamais, et la liste des lois fermée**
- [`74-etalons.md`](74-etalons.md) — **les étalons, les lois vides, et une question trop simple : un compte qui ne distingue pas « pas fait » de « rien à faire »**
- [`73-passages.md`](73-passages.md) — **trois passages de Dark Bramble, deux coquilles sonores, et un sol qui tourne sous les pieds au premier instant**
- [`72-poussiere.md`](72-poussiere.md) — **quatre lois qui n'étaient qu'importées : la poussière de vitesse, le grillage qui se rompt, la toile qui tourne, la tempête de sable**
- [`71-quantique.md`](71-quantique.md) — **ce qui bouge quand on ne le regarde pas : cinq objets sur la lune, une statue au musée, et un import qui comptait pour un appel**
- [`70-modes.md`](70-modes.md) — **ce qui se commande, et quand : dix ensembles de canaux, une case qui n'est pas une pile, et un mort qui ne commande rien**
- [`69-assise.md`](69-assise.md) — **s'asseoir : les quatre points d'accrochage, une caméra dont la loi était une paraphrase, et un compteur tombé dans le piège qu'il était né pour éviter**
- [`68-lois.md`](68-lois.md) — **les lois écrites que rien n'appelait : un module entier, éprouvé, documenté et vert, qu'aucun module du moteur n'importait**
- [`67-annonces.md`](67-annonces.md) — **trois annonces lues : la guimauve soigne, le mur réclame la combinaison, la lampe se propose**
- [`66-allumage.md`](66-allumage.md) — **ce que le jeu annonce : 124 événements, et l'allumage du vaisseau qu'aucun compte de classes ne montrait**
- [`65-onde.md`](65-onde.md) — **l'onde de la lunette, la lunette qui grossit, et une classe lue depuis toujours sans être nommée**
- [`64-mains.md`](64-mains.md) — **ce qu'on tient dans la main : le bâton à guimauve, sa lunette, et un thermomètre qui est une pose d'animation**
- [`63-boucles.md`](63-boucles.md) — **ce qui boucle et ce qui ne boucle pas : le portage jouait seize clips en boucle, le build en boucle treize**
- [`62-visee.md`](62-visee.md) — **viser un référentiel du regard, s'accorder à sa vitesse, y aller : les trois canaux de vol que rien ne pilotait**
- [`61-commandes.md`](61-commandes.md) — **les commandes du jeu, lues dans l'`InputManager` : le portage avait inventé ses touches, et sa manette était fausse quatre fois sur six**
- [`60-sonde.md`](60-sonde.md) — **la sonde, et la moitié du jeu que le recensement ne lisait pas : le préfabriqué existait depuis toujours**
- [`59-etat.md`](59-etat.md) — où en est le portage : le compte de `level0`, corrigé par [`60`](60-sonde.md) (1 413 des 1 451 instances, 97,4 %)
- [`08-reste-a-faire.md`](08-reste-a-faire.md) — ce qui manque pour un portage complet
- [`34-actions.md`](34-actions.md) — le jeu et le portage face à face : les actions à mener
- [`35-monde.md`](35-monde.md) — le monde qu'on ne lisait pas : rotation, lumières, fluides, champs, manette
- [`36-audit.md`](36-audit.md) — l'audit mesuré sur le build : matrice des écarts, actions, backlog
- [`37-corrections.md`](37-corrections.md) — **l'audit mis en œuvre : marche, inertie de rotation, courants, référentiels**
- [`43-pnj-son-decollage.md`](43-pnj-son-decollage.md) — **parler, entendre, décoller : trois systèmes qui passaient leurs tests sans fonctionner**
- [`44-reste-a-migrer.md`](44-reste-a-migrer.md) — **ce qui reste à migrer de l'alpha d'origine : neuf familles, par ordre (413 composants sans lecteur, 94 après [`46`](46-migration-lots.md))**
- [`45-recensement-mesure.md`](45-recensement-mesure.md) — **le recensement refait sur le build : le sable des jumelles, la mort là où le jeu la met, l'ambiance par couches**
- [`58-suivi.md`](58-suivi.md) — **le suivi de référentiel, la poussière de vitesse, et un palier que le build n'atteint jamais**
- [`57-particules.md`](57-particules.md) — **quatre modules de particules, dont la queue de la comète : et un compte qui disait « jamais »**
- [`56-impostures.md`](56-impostures.md) — **les impostures de planète : deux caméras sur cinq sans plan, et trois quads plats collés sur les vraies planètes**
- [`55-attaches.md`](55-attaches.md) — **ce qui suit un autre corps, ce qui clignote, et la fin de la queue : 95,8 % des instances du build sont lues**
- [`54-lumiere.md`](54-lumiere.md) — **la lumière globale qui fond au lieu de sauter, les phares à six cents, et une troisième chose extraite que personne ne lisait**
- [`53-joueur.md`](53-joueur.md) — **on vise à dix unités, lancer une sonde s'entend, et le sable montant écrase : ce que le joueur porte en plus de son corps**
- [`52-casque.md`](52-casque.md) — **le casque qui traîne, l'alarme à trente pour cent, les voyants qui clignotent : le lot d'interface qu'on avait eu tort de fermer**
- [`51-tour.md`](51-tour.md) — **la tour de lancement, les trois capteurs de pad, et ce que « posé » veut dire**
- [`50-regard.md`](50-regard.md) — **on allume en regardant : une mécanique entière sans invite ni touche, et un recensement qui compte enfin juste**
- [`49-queue.md`](49-queue.md) — **la queue du recensement : les dégâts du vaisseau relus à l'endroit, treize marqueurs de carte, six tornades qui penchent — et un test qui gardait une erreur**
- [`48-ciel-mesure.md`](48-ciel-mesure.md) — **le ciel mesuré : la voûte qui tourne enfin, dix visages de nuage, et mille étoiles qui s'éteignent pendant la boucle**
- [`47-effets-image.md`](47-effets-image.md) — **les effets d'image, et le commentaire qui les cachait : 24 effets sur 15 caméras, le champ de vision et le télescope corrigés**
- [`46-migration-lots.md`](46-migration-lots.md) — **six lots écrits : référentiels déclarés, décor vivant, son d'événement, équipement à ramasser, décalcomanies, volumes de jeu**
