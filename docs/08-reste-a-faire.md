# Ce qui manque encore pour un portage complet

Cette page fait l'inventaire de l'**état** du portage.
[`34-actions.md`](34-actions.md) reprend la comparaison sous forme d'**actions
ordonnées**, et [`35-monde.md`](35-monde.md) raconte ce qu'a donné leur mise en
œuvre : l'essentiel de ce qui manquait était **déjà extrait, et personne ne le
lisait**.

> [`44-reste-a-migrer.md`](44-reste-a-migrer.md) reprend la même question par
> l'autre bout — **ce que l'alpha pose et que le portage ne nomme pas** — et en
> fait des lots ordonnés, prêts à écrire. Ses chiffres viennent du recensement
> refait sur le build ([`45-recensement-mesure.md`](45-recensement-mesure.md)) :
> **109 classes et 413 instances n'avaient alors aucun lecteur**.
>
> **Où en sont les trois dénominateurs**, aujourd'hui. Le dépôt en tient trois,
> et chacun a été ouvert quand le précédent a cessé de dire quelque chose
> ([`66`](66-allumage.md), [`68`](68-lois.md)) :
>
> | | |
> |---|---|
> | `recensement.mjs` — ce que le build **installe** | 12 classes / 15 instances sans lecteur, et 6 / 21 extraites sans lecteur, sur 295 / 1 451 |
> | `evenements.mjs` — ce que le build **annonce** | **79** des 124 nommés |
> | `lois.mjs` — ce que le portage **appelle** | **0** — les vingt fermées par quatre issues ([`97`](97-assise-instantanee.md), [`98`](98-flashback.md), [`99`](99-lois-branchees.md)) |
> | `refait.mjs` — ce que le build **fait dans une classe qu'on lit** | **187 des 187** méthodes nommées, sur 80 classes — le dénominateur est fermé ([`103`](103-refait.md) → [`121`](121-avis.md), [`131`](131-ecran-titre.md)) |
>
> Les trois se sont chacun menti une fois, et chaque fois dans le sens qui
> flatte : [`47`](47-effets-image.md), [`65`](65-onde.md), [`68`](68-lois.md),
> [`69`](69-assise.md), [`71`](71-quantique.md), [`74`](74-etalons.md),
> [`75`](75-chaleur.md), [`76`](76-proximite.md).

Inventaire fondé sur les composants et assets réellement présents dans le
build, pas sur une impression. Ce document dit honnêtement où en est le
portage.

## Ce qui est porté

| système | état |
|---|---|
| gravité par champs dominants | complet, modèle du jeu |
| orbites et référentiels | complet, 0,00 % de dérive |
| floating origin | complet, ancré sur le corps dominant |
| géométrie des 7 corps | complète, 69 Mo en glTF |
| matériaux et textures | 251 matériaux, 200 textures, normales désentrelacées |
| collision | Havok, colliders trimesh du corps ancré |
| déplacement du joueur | **marche, course d'élan, saut et sac dorsal, aux constantes du build** |
| ressources | oxygène, carburant, santé, intégrité |
| vaisseau | embarquement, vol, **inertie de rotation et roulis**, appui sur le terrain réel |
| détection d'interaction | 39 interactifs, 34 lisibles |
| audio spatial | 92 sources, 31 clips, instanciation à la volée |
| particules | 135 systèmes, 15 textures, budget de 14 simultanés |
| atmosphères et soleil | shaders maison, 122 shaders classés |
| boucle temporelle | 20 min, supernova, onde de choc, mort, redémarrage |
| dialogues et mémoire | 26 arbres, 72 branches, connaissance persistante |
| contrôleurs de conversation | 5 règles lues dans l'IL, **14 conversations sur 14 joignables** |
| codes de lancement | accordés **à la fin** de la conversation du Conservateur |
| conteneurs audio | lus dans les octets : 16 Ogg, 20 WAV, **aucun AIFF muet** |
| lune quantique | 4 orbites hôtes, effondrement à la perte de vue |
| trou noir / trou blanc | capture, éjection en cône, effondrement de croûte |
| Dark Bramble | prédateurs sensibles au bruit, croissance des ronces |
| secteurs | bascule géométrie/substitution **et téléchargement**, 3 corps sur 12 ; **10 secteurs majeurs, actif par déclencheur** ([`82`](82-secteur-majeur.md)) |
| poids au démarrage | 60,0 Mo pour la première image, contre 199,6 avant |
| pilote auto et dégâts | 4 phases, seuils d'impact 15/30/300 |
| carte du système | orbites, marqueurs, sélection de cible |
| shaders du jeu | **203 affectations**, tous les shaders utilisés couverts |
| skinning | 55 squelettes, 33 maillages skinnés, décodage direct |
| animations | 34 animations, 8 148 canaux, Mecanim compris (mesure) |
| connaissance | codes, exploration et boucle persistants et signifiants |
| outils | télescope ×6 et lanceur de sonde, 3/6 savoirs gagnables |
| interface de dialogue | proportions du build, curseur, sondes rendues |
| jauges et invites | textures du casque, 46 invites triées par priorité |
| brouillards | Dark Bramble et coque quantique, masquage et lumières |
| croûte de Brittle Hollow | 122 fragments : 72 tombent, 50 se brisent |
| minicarte | globe du secteur, traces de 100 points, **éteinte dans les trois secteurs qui ne la portent pas** |
| réglages | 7 options, sauvegarde distincte de la partie ; « Exit to Main Menu » ramène au titre |
| écran-titre | la scène de `mainData` : planète, feu, fumées, voyageurs, cinq lignes lues dans l'IL ([`131`](131-ecran-titre.md)) |
| temps | l'image découpée comme Unity : pas maximal de 1 s, Havok au même pas ([`132`](132-comparaison-native.md)) |
| polices | les 4 polices du jeu, réparties par rôle |
| ordinateur de bord | 7 notices de lieu, ouvertes par l'exploration |
| lampe et guimauve | portée 80, grillage en 5 s |
| mort et flashback | 5 causes, commandes coupées, et les **photos de la partie** rejouées à rebours — autant qu'on a survécu de fois cinq secondes ([`98`](98-flashback.md)) |
| supernova | progression, contraction, explosion, onde de choc |
| dégâts du vaisseau | pièces, propulseurs coupés, destruction |
| LOD par maillage | hauteur relative à l'écran, parcours tournant |
| éviction | un corps quitté depuis 45 s est libéré |
| champ de débris | ce qui tombe ressort au trou blanc, 750 u |
| caméra de sonde | vue embarquée dans un coin de l'écran |
| commandes tactiles | manche analogique, regard, 18 boutons, carte au pincement |
| jeu en paysage | HUD, dialogue et réglages bornés pour un écran de 800 × 370 |
| rotation propre et jour/nuit | appliquée au repère ancré, le sol ne bouge pas |
| lumières placées | extraites, instanciées à la volée dans un budget de 8 |
| portées audio | `MinDistance` / `MaxDistance` / `rolloffMode` du build |
| champs directionnels | 34 volumes, prioritaires sur le champ radial |
| fluides | densité, poussée d'Archimède, **courants et tornades**, traînée du détecteur |
| zones d'oxygène et chaleur | ramassées par motif, avec le volume de leur collider |
| manette | Gamepad API, mêmes axes et mêmes codes que le clavier |
| caméras déportées | les deux consoles réutilisent la vue de la sonde |
| `mainData` | inventorié : scène de démarrage et managers |
| référentiels | positions **et vitesses** reportées au changement d'ancre |
| repère tournant | Coriolis et force centrifuge : le sol défile sous un stationnaire |
| colliders par portée | les 21 `ChildColliderLOD` endorment leur sous-arbre |
| départ de la partie | **au point d'apparition du build, à sa hauteur et dans son regard** |
| fluides | **quatre lois du build** : aspiration des bases de tornade, rayon tracteur, répulsion de l'océan |
| ce qui est solide | **1 691 obstacles sur 2 219 maillages** : le décor se traverse, la voûte aussi |
| ciel | voûte, 24 nuages et leurs 10 textures, champ d'étoiles, extraits ; fusions corrigées |
| lumières vivantes | 15 `NightLight`, 15 `PulsingLight`, 9 `LightFlicker` |
| textures qui défilent | 44 extraites, 27 rattachées et 23 en mouvement |
| sable des jumelles | **60 → 290 et 300 → 66 entre la 2e et la 17e minute**, entonnoir compris |
| volumes de destruction | 6 volumes, la cause de mort lue dans le build, sonde épargnée par 4 |
| réparation du vaisseau | 18 volumes, maintien à 3 s, l'avancement survit au relâchement |
| **la queue de `refait.mjs`** | un avis en cours fait tomber le suivant, un teleporteur met 0,5 s, les meteores lisent le champ A LEUR position ([`121`](121-avis.md)) |
| **les jumelles du sablier** | aucun primaire : elles tournent l'une autour de l'autre a 31,65, dans le repere de leur barycentre ([`120`](120-jumelles.md)) |
| **ce que le predateur entend** | cible sous 200 unites quel que soit le volume, trouble au-dela si le volume passe DIX — et dix n'est atteint qu'en diagonale ([`119`](119-bruit.md)) |
| **issues du pilote auto** | six facons de s'arreter et un message chacune ; le bandeau ne s'eteint que par une issue ([`118`](118-messages.md)) |
| **ouverture de la carte** | avec une cible visee, la carte vous CADRE tous les deux, et le son a dix secondes de garde ([`117`](117-carte.md)) |
| **trappe, saut, alarme** | la trappe retire un collider et se referme a l'ENTREE, le saut a son propre son, et l'alarme allume sa lumiere ([`116`](116-trappe.md)) |
| **menu des reglages** | SELECT_DELAY a 0,2 s sur QUATRE horloges de temps reel, deux seuils, le clic droit qui recule, et fermer reprend la souris ([`115`](115-menu.md)) |
| **poste de pilotage** | se lever ferme la vue d'atterrissage, le roulis ne se range qu'en se rasseyant, et l'ecretage REDRESSE la poussee sur le sol ([`114`](114-poste.md)) |
| **degats du vaisseau** | seuil de trente pose par `Awake`, et l'integrite est le cumul soustrait — pas une courbe inventee ([`113`](113-seuil.md)) |
| invites a l'ecran | trois zones, DEUX arbitrages : le bas montre tout ([`112`](112-invites.md)) |
| **passages anciens** | on arrive avec la vitesse du point d'arrivee, et tourne vers ce qu'il regarde ([`111`](111-passages.md)) |
| croute de Brittle Hollow | un morceau part avec la vitesse du point d'ou il lache ([`110`](110-croute.md)) |
| **anglerfish** | il DEPASSE sa proie, accelere en 0,42 s, et ne se retourne pas quand on est derriere ([`109`](109-anglerfish.md)) |
| **le reveil** | 80 degres au ciel, 7 s, puis 1,6 s de descente — et le joueur garde la main ([`108`](108-reveil.md)) |
| **pilote automatique** | l'asservissement du build, la gravite dans le freinage, et les quatre messages remis a l'endroit ([`107`](107-pilote.md)) |
| accorder sa vitesse | par la POUSSEE, aux trois endroits qui la posaient : l'écart divisé par la poussée ([`107`](107-pilote.md)) |
| **se redresser** | 100 deg/s vers le bas du champ, et le tangage compense tant que ca dure ([`106`](106-redressement.md)) |
| **objets lisibles** | les 34 textes s'affichent enfin, en pages de 70 x 5, `@` compris ([`105`](105-lire.md)) |
| verrouillage de camera | cinq appelants, cinq vitesses : 2 pour un panneau, 5 pour le vaisseau modele ([`105`](105-lire.md)) |
| ambiance par couches | 17 zones, arbitrées comme `AudioDetector` : **la couche 0 couvre les autres, les ex aequo jouent ensemble** ([`104`](104-arbitrage.md)) ; **5 zones sans soleil franchies par leurs portes** ([`83`](83-seuils.md)) |
| fondu d'ambiance | linéaire, et d'une **durée** repartant de la valeur courante — pas d'un rythme ([`104`](104-arbitrage.md)) |
| aube et crépuscule | `_dayWindow` = la **largeur de l'arc de jour**, 200° pour 180° de géométrie ; les deux clips se **croisent** ([`104`](104-arbitrage.md)) |
| tête de lecture | la boucle du vent repart au hasard, la musique du village **reprend à la même note** ([`104`](104-arbitrage.md)) |
| référentiels déclarés | 14 volumes : le build dit l'ancre, la gravité complète |
| distances du pilote auto | 1 000 / 2 500 et l'alignement, lus dans le build |
| décor vivant | 15 panneaux, 8 visages, 10 buses, 6 passages anciens |
| décalcomanies | 30 maillages posés **sur** la paroi, et non contre |
| son d'événement | pas, vent de course, propulseurs, voyage, fin des temps |
| équipement | combinaison, sonde et minicarte **se ramassent** |
| entraînement en apesanteur | les 3 nœuds du satellite cassé, et leur annonce |
| volumes de jeu | ce qui blesse, l'apesanteur déclarée, les fenêtres de vue |
| effets d'image | 24 effets sur 15 caméras : bloom, glow, vignette, tourbillon, grain |
| voûte céleste | elle **tourne** vers l'étoile : le jour et la nuit du build |
| nuages | dix visages sur 24 maillages homonymes, rattachés par position |
| champ d'étoiles | mille étoiles qui **s'éteignent** au fil de la boucle |
| dégâts du vaisseau | relus à l'endroit : le masque **s'accumule**, 3 pièces au plus |
| marqueurs de carte | les 13 du build, avec leurs vrais noms de jeu |
| tornades | six pivots qui **basculent**, à une vitesse tirée au réveil |
| interrupteur du regard | on **fixe** une toile trois secondes, la porte s'efface |
| tour de lancement | terminal qui refuse, ascenseur de 31,5 u en 5 s |
| atterrissage | posé = **trois** capteurs, et le **même** corps |
| casque et alarme | le verre **traîne** derrière le regard, la coque crie à 30 % |
| bruit du joueur | proportionnel à la poussée, et lancer une sonde **s'entend** |
| mort par écrasement | le sable montant, seule surface du build qui écrase |
| lumière globale | elle **fond**, se coupe dans une zone sombre et sur la carte |
| attaches | 14 alignements sur un corps désigné, 9 héritiers de champ |
| réparation visible | un nœud réparé devient vert |
| impostures de planète | les 3 câblées rendues à 1 Hz, effacées si le réel est là |
| modules de particules | la queue de la comète, le plafond de l'explosion |
| suivi de référentiel | distance et vitesse d'approche de la cible visée |
| poussière de vitesse | rien sous 30 u/s, puis des traits de plus en plus courts |
| volumes composés | une entrée, une sortie, quel que soit le nombre d'enfants |
| vérification sans le build | `15_verify.py --repli` : le moteur démarre, en navigateur |
| vérification avec le build | **267/267** ([`81`](81-invulnerable.md)) |
| la sonde | charge, orbite à la pichenette, ancrage, lanterne, photo, rappel ([`60`](60-sonde.md)) |
| **les commandes** | les 22 canaux de l'`InputManager` : souris, saut et sac dorsal séparés, manette refaite ([`61`](61-commandes.md)) |
| viser un référentiel | on vise ce qu'on **regarde** : crochets, accord de vitesse, pilote qui refuse ([`62`](62-visee.md)) |
| boucles d'animation | 13 clips bouclent, 4 s'arrêtent — la règle d'Unity en deux étages ([`63`](63-boucles.md)) |
| objets tenus en main | le bâton à guimauve et la lunette, exportés et animés ([`64`](64-mains.md)) |
| onde de la lunette | 500 points, un par image, plate au milieu sans signal ([`65`](65-onde.md)) |
| allumage du vaisseau | **une seconde de poussée tenue** avant de décoller, et relâcher annule ([`66`](66-allumage.md)) |
| la guimauve **soigne** | manger rend toute la santé : le feu de camp est l'infirmerie ([`67`](67-annonces.md)) |
| mur de combinaison | on ne quitte pas le village sans elle ([`67`](67-annonces.md)) |
| attaches **appelées** | le module existait, éprouvé et documenté ; aucun moteur ne l'importait ([`68`](68-lois.md)) |
| météores de Brittle Hollow | quatre lanceurs, délai **retiré à chaque tir**, 50 de dégâts au contact ([`68`](68-lois.md)) |
| **s'asseoir** | les 4 points d'accrochage : une durée tirée de l'angle, et on se lève avec la vitesse du siège ([`69`](69-assise.md)) |
| verrouillage de caméra | le corps tourne en lacet, le champ suit `500/d` borné à 20° ([`69`](69-assise.md)) |
| **modes d'entrée** | 10 ensembles de canaux : la lunette **enracine**, le poste n'a pas de lampe, un mort ne commande rien ([`70`](70-modes.md)) |
| objets quantiques | 5 sur la lune (3 pins, une cabane, un panneau) et la statue du musée : ils bougent **à l'instant** où l'on détourne les yeux ([`71`](71-quantique.md)) |
| la sonde **épingle** | photographier un objet quantique à portée et dans le cadre le fige ([`71`](71-quantique.md)) |
| marqueur de sonde | où elle est, à quelle distance, dans quel état ([`71`](71-quantique.md)) |
| poussière de vitesse | **rien** sous 30 u/s, puis des traits de plus en plus courts ([`72`](72-poussiere.md)) |
| grillage rompu | on ne grille pas à plus de 4 unités du feu ([`72`](72-poussiere.md)) |
| toile du regard | deux anneaux en sens inverse, au **cube** des fractions ([`72`](72-poussiere.md)) |
| tempête de sable | 4 cylindres, **une** entrée, **une** sortie ([`72`](72-poussiere.md)) |
| passages de Dark Bramble | 3 volumes, départ **3 s après l'entrée**, et l'épave se quitte par son **bord** ([`73`](73-passages.md)) |
| coquilles sonores | entrer la **tête** dans l'océan coupe le bruit de l'océan ([`73`](73-passages.md)) |
| **on part avec le sol** | le joueur se réveille à la vitesse du sol qui tourne, pas à zéro ([`73`](73-passages.md)) |
| phares du vaisseau | 600 unités, bridés à **100** dans la dimension abandonnée ([`74`](74-etalons.md)) |
| marqueurs de carte | la règle entière : le vaisseau, le joueur qui ne se masque jamais, l'épave qui efface tout ([`74`](74-etalons.md)) |
| **la chaleur des feux** | 8 émetteurs de rayonnement : la guimauve ne cuisait **jamais** ([`75`](75-chaleur.md)) |
| invite de sonde | elle vient parce qu'on **regarde** quelque part, pas parce qu'on est là ([`75`](75-chaleur.md)) |
| sonde ancienne | 50 d'accélération locale, pour toujours ([`75`](75-chaleur.md)) |
| voyants d'avarie | ils ne parlent que **dans les 13 unités** du vaisseau ([`76`](76-proximite.md)) |
| tutoriel de la sonde | lancer depuis une invite les détruit **toutes les quatre** ([`76`](76-proximite.md)) |
| **sons d'interface** | les 8 de `UIAudioController`, à demi-volume ([`77`](77-sons.md)) |
| son de réparation | l'air ou le vide, et le vide est le **passe-bas** de l'air ([`77`](77-sons.md)) |
| **le vaisseau miniature vole** | 3 pistes, crash au-delà de 10 u/s, et il faut être **immobile** pour se poser ([`78`](78-modele.md)) |
| l'enfant aux fusées | 3 arbres : 5 crashs valent un reproche, et il passe **avant** la réussite ([`78`](78-modele.md)) |
| **perdre la gravité** | le regard est **verrouillé** le temps d'être retourné, à 50°/s ([`79`](79-alignement.md)) |
| invites du sac dorsal | **seulement en apesanteur**, et les 3 poussées seulement à l'entraînement ([`80`](80-invites.md)) |
| le bâton sort au feu | `BeginRoasting` / `StopRoasting` : une touche inventée en moins ([`80`](80-invites.md)) |
| **invulnérable au premier tour** | tant qu'on n'a pas les codes et qu'on n'est pas monté dans le vaisseau ([`81`](81-invulnerable.md)) |
| tutoriel de la sonde | **3 photos en vol** puis la sonde détruite, et non le premier tir ([`81`](81-invulnerable.md)) |
| **la fin des temps** | le mixage à **90 s restantes** et non à l'explosion, `MixEndTimes(5)`, et le verrou qui tient le silence ([`97`](97-assise-instantanee.md)) |
| toile du regard | la fraction de charge, et non les secondes : elle tournait 27 fois trop vite ([`97`](97-assise-instantanee.md)) |
| **s'asseoir prend du temps** | 1,8 s dos tourné : un `Vector3` passé pour un tableau rendait l'assise instantanée ([`97`](97-assise-instantanee.md)) |
| la lunette fait taire le monde | `IsolateTrack(Signal, 0,2, 1)` : on trouve un émetteur par le silence ([`97`](97-assise-instantanee.md)) |
| la lunette pendant l'assise | le suivi se suspend, et en sortir **recommence** le demi-tour ([`97`](97-assise-instantanee.md)) |
| **la guimauve prend feu** | flamme à `r < 0,25`, perdue à `r < 0,08`, une neuve 0,8 s plus tard ([`97`](97-assise-instantanee.md)) |
| voyants d'avarie | le **masque**, pas les pièces mortes — et rangés `4, 1, 16, 8, 2` ([`97`](97-assise-instantanee.md)) |
| **le flashback** | les photos de la partie, à rebours, le plan qui avance, le flou qui efface ([`98`](98-flashback.md)) |
| état de mort du joueur | `PlayerState._isDead`, et c'est lui qui arrête les photos ([`98`](98-flashback.md)) |
| passages de Dark Bramble | l'**éclair de brouillard** du build, monté à l'entrée, et non l'éclair bleu du téléporteur ([`99`](99-lois-branchees.md)) |
| projecteur du satellite | la salle s'éteint en 2 s pendant qu'on regarde ([`99`](99-lois-branchees.md)) |
| nouvelle partie | `CreateNewPlayerSave`, depuis le **menu-titre** — New Expedition, Skip Intro — et encore aux réglages en partie ([`131`](131-ecran-titre.md)) |
| jauges du casque | elles sont **sur la visière** : sans combinaison, il n'y en a pas ([`99`](99-lois-branchees.md)) |
| orbites de la carte | cinq couleurs du build, centrées sur le **Soleil**, et l'ellipse de la comète ([`100`](100-carte.md)) |
| **sauter ne décolle pas** | la poussée horizontale se coupe au sol et demande un geste pour revenir ([`101`](101-sac-dorsal.md)) |
| panne sèche | rien ne pousse à zéro, et il faut 5 % pour repartir ([`101`](101-sac-dorsal.md)) |
| **sortie du trou blanc** | droit devant, à son rayon, à 20 u/s — le cône est pour les débris ([`102`](102-trou-blanc.md)) |
| champ de débris | un par seconde, il grandit en 0,96 s, et une laisse le retient ([`102`](102-trou-blanc.md)) |
| on ressort en regardant la sortie | `ReceiveWarpedPlayer` aligne le regard avant de déplacer le corps ([`103`](103-refait.md)) |
| réglages de projet | pas de physique fixe, gravité par défaut, balises et calques |
| les préfabriqués | ce que le build pose **hors de `level0`** : 37 classes, 61 instances |
| champ de vision | **70°**, et le télescope relu : entrée à 33,33°, zoom à la main |
| vérification | `tools/15_verify.py` en navigateur, `tests/09-jeu.mjs` sans le jeu |

> **Corrigé par le navigateur** ([`46-migration-lots.md`](46-migration-lots.md)).
> Une ligne de ce tableau — les volumes de destruction, vertes depuis
> [`45`](45-recensement-mesure.md) — cachait une partie injouable : la boucle
> interrogeait ces volumes avec une position exprimée dans le repère ancré, et
> celui du soleil est une sphère de 2 000 unités centrée sur l'origine du monde.
> **Le joueur mourait incinéré à la première image, à chaque démarrage.** Les
> tests passaient tous ; c'est `tools/15_verify.py`, lancé sur un profil rempli,
> qui l'a vu.
>
> **Corrigé par le jeu** ([`43-pnj-son-decollage.md`](43-pnj-son-decollage.md)).
> Trois lignes de ce tableau — dialogues, audio spatial, vaisseau — étaient
> vertes alors que rien ne fonctionnait : le Conservateur était inaccessible
> (donc les codes de lancement, donc le décollage), 20 clips sur 36 portaient
> une extension qui mentait sur leur contenu, et la musique ne repartait jamais
> après le premier clic. **Un système qui passe ses tests n'est pas un système
> qu'on a joué.**

## Ce qui manque, par famille

La liste par système a fondu : les entrées qui restaient ouvertes ont été
reprises une par une (voir l'historique des pages ci-dessous). Ce qui reste ne
se range plus par mécanique mais par **nature de l'obstacle**, et c'est plus
utile ainsi — la moitié de ce qui manque ne se comble pas en portant mieux.

### 1. Ce qui n'est pas dans le build

Aucune de ces choses ne s'obtient en travaillant davantage : elles ne sont pas
dans l'alpha.

| manque | ce que le build en dit |
|---|---|
| l'espace replié de Dark Bramble | aucun volume de distorsion ; le conteneur s'appelle `DarkBramble_TestBed` |
| ~~quatre des cinq savoirs~~ | **trop sévère, relu** ([`81`](81-invulnerable.md)) : **deux** ont une source vivante — l'entraînement en apesanteur, et le tutoriel de la sonde (trois photos en vol puis la sonde détruite). Les deux sont branchées. `CompleteTelescopeTutorial` est écouté et émis par personne, et `CompleteShipProbeTutorial` vient d'une classe `_Old` : ces deux-là, oui |
| le déblocage par branche de dialogue | les 20 attributs `eventbased` valent tous `"false"` |
| les machines à états d'animation | 11 états, **zéro transition** dans tout le build |
| ~~les dégâts localisés du vaisseau~~ | **faux, relu** ([`49`](49-queue.md)) : `_damageLocationMask` est une **sortie** qui s'accumule, pas un filtre. Zéro est l'état d'un vaisseau intact. Seuls les deux modificateurs sont vraiment morts — aucune méthode ne les emploie |
| les éclats de fracture | `if (_debrisShardPrefab != null) { }` est un bloc vide |
| ~~le modèle de sonde~~ | **faux, mesuré** ([`60`](60-sonde.md)) : `_probePrefab` vise `sharedassets1.assets:2295` et s'y résout du premier coup. Le recensement ne lisait que `level0`, et l'alpha range les préfabriqués ailleurs. Dix nœuds, huit classes, deux caméras |
| ~~les images du flashback~~ | **faux, lu** ([`98`](98-flashback.md)) : `Flashback.TakeSnapshot` rend la caméra du joueur dans une `RenderTexture` de 256 × 256 **toutes les cinq secondes**, et la mort les rejoue à rebours. La mémoire visuelle n'est pas un objet de scène — elle se remplit à l'exécution, et c'est pour cela qu'un recensement ne la voyait pas |
| la courbe de dégâts d'impact | les seuils sont là, la fonction qui les relie n'y est pas |
| ~~l'entraînement et le ciblage~~ | **faux, mesuré** : `PlayerLockOnTargeting` ×2 (dont une sur `Player_Body`) et `ZeroGTrainingManager` sont dans le build ([`45`](45-recensement-mesure.md)) |

> **Corrigé par la mesure** ([`36-audit.md`](36-audit.md)).
> `RocketKidConvoController` **est** dans le build, lisible, et porte trois
> arbres (`_introduction`, `_successfulLanding`, `_tooManyCrashes`). Il sort
> donc de cette liste : c'est un manque du portage, pas de l'alpha.
> **Et il est comblé depuis [`78`](78-modele.md)** : le modèle réduit vole, ses
> trois pistes comptent, et l'enfant choisit son arbre.
>
> **Et une deuxième fois** ([`45-recensement-mesure.md`](45-recensement-mesure.md)).
> Le ciblage et l'entraînement y sont aussi. Deux lignes de ce tableau sur dix
> étaient donc des manques du portage déguisés en manques de l'alpha, et les
> deux sont tombées à la mesure, jamais au raisonnement. S'y ajoute une
> troisième chose que personne n'avait cherchée : la combinaison, la sonde et la
> minicarte **se ramassent** (`GearPickup` ×2), là où le portage les donne.

### 2. Ce qui demande un œil ou une oreille humaine

Tout est vérifié au chiffre, rien ne l'est au rendu.

- **L'équilibrage des volumes audio** — les portées sont désormais celles du
  build (`MinDistance`, `MaxDistance`, `rolloffMode`, voir
  [`35-monde.md`](35-monde.md) §2). L'oreille juge donc enfin des valeurs du
  jeu, mais elle n'a pas encore jugé.
- **L'équilibrage visuel des particules** — les tailles vont jusqu'à 140 unités.
- **Le rendu général** : atmosphères, surface stellaire, brouillards et
  explosion sont des implémentations originales visant un résultat comparable,
  pas des transpositions de shaders.
- **La première image du jeu** — le pose de départ vient du build
  ([`38-depart.md`](38-depart.md)), et elle a depuis été **regardée** : lancée
  dans un Chromium réel, le build fourni à la page, et photographiée
  ([`41-ciel.md`](41-ciel.md)). Elle montrait un plein jour cyan sur une scène
  dont le soleil est à 77 degrés sous l'horizon. Trois causes mesurées et
  corrigées : les coques d'atmosphère du portage vues de l'intérieur, les
  nuages rendus en additif quand le build les fond en alpha, et la voûte rendue
  opaque quand elle est transparente. Les nuages, eux, ont désormais un
  lecteur : 24 `CloudTextureController`, dix textures distinctes.
- **Une partie jouée**, tout simplement.

### 3. Ce qui reste techniquement ouvert

- **La distorsion** reste une approximation délibérée : capturer le fond
  demanderait un second rendu complet de la scène — doubler les 6,1 ms — pour
  **deux matériaux dans tout le jeu**.
- **Les niveaux de détail du build** ne valent pas ce qu'on en attendait.
  Mesure faite ([`36-audit.md`](36-audit.md)) : `level0` ne contient que
  **deux** objets de classe `LODGroup` (205), et les cinq `CreateLODGroup` ont
  des champs **vides**. `lodThresholds()` n'en tire donc aucun seuil, et
  régénérer `unity41-types.json` n'y changerait presque rien. Le seuil unique
  de 0,0022 reste la règle, et l'effort utile est ailleurs : les 21
  `ChildColliderLOD`, et les impostures de `LODCameraSnapshot` (×5).
- ~~**Les 21 `ChildColliderLOD`** sont extraits, mais les colliders sont
  toujours posés d'un bloc.~~ **Fermé** ([`37`](37-corrections.md) §7) : un
  groupe hors de portée n'entre plus dans la construction, et l'ensemble
  éveillé est réévalué en continu — mais reconstruit au plus une fois toutes
  les deux secondes, parce que reconstruire coûte près d'une seconde.
- ~~**La rotation de la voûte céleste**~~ **Fermé** ([`48`](48-ciel-mesure.md)) :
  la convention ne se déduisait pas de deux captures d'écran, elle se lit sur les
  uv du maillage. Le disque bleu est au `+Z` local, et le calcul passe par les
  directions monde des axes du parent plutôt que par un signe supposé.
- ~~**Les dix textures de nuage**~~ **Fermé** : exportées en images, et posées
  par **position** — les 24 nuages s'appellent tous `PieceOfRing`. Le matériau
  est cloné par nuage, comme `renderer.material` le fait dans le build.
- ~~**Le champ d'étoiles**~~ **Fermé**, et il cachait la plus visible des choses
  que le portage ne faisait pas : les mille étoiles **s'éteignent une à une**
  pendant la boucle, les trois quarts dans le dernier tiers. Le compte à rebours
  est écrit dans le ciel.
- **12 classes sur 295 n'ont aucun lecteur** — 15 instances sur 1 451 — et 5 de
  plus sont **extraites sans être lues**. Les douze sont des outils de studio et
  des mises en page ; `node scripts/recensement.mjs` en redonne la liste à jour.
  Ce dénominateur est **fermé** depuis [`65`](65-onde.md) : il ne dit plus rien
  d'utile, et c'est pour cela que [`66`](66-allumage.md) en a ouvert un autre.
  L'historique du compte vaut d'être gardé, parce qu'il **monte** une fois :
  170 en [`42`](42-lumieres.md), 109 avant les six lots de
  [`46`](46-migration-lots.md), 59 après — puis **77**, quand
  `scripts/recensement.mjs` s'est mis à retirer les **commentaires** avant de
  compter. C'est un commentaire qui avait caché toute la pile d'effets d'image
  ([`47`](47-effets-image.md)). Puis **62** après la queue de
  [`49`](49-queue.md), **13** après la série [`50`](50-regard.md)–[`58`](58-suivi.md),
  et **12** depuis, le recensement portant désormais sur les **cinq** fichiers
  sérialisés et non sur `level0` seul ([`60`](60-sonde.md)).
- ~~**Les impostures de planète**~~ **Fermé** ([`56`](56-impostures.md)), et la
  mesure a démenti la page : sur les cinq caméras, **deux n'ont aucun plan** et
  une troisième vise un `HomePlanet_graybox`. Le système est un chantier de
  l'alpha, pas une technique aboutie. Surtout, les trois plans câblés étaient
  **dans la géométrie, renderer actif, à la position de leur planète** : le
  portage collait trois quads plats par-dessus les vraies planètes.
- **11,1 Mo de Babylon** sur les 66 du démarrage
  ([`27-poids.md`](27-poids.md)) : les réduire demande une étape de
  construction, que le dépôt n'a pas. C'est un choix de projet, pas une
  optimisation à faire en passant.
- **Les 15 Mo de WAV** : le réencodage Opus est écrit depuis longtemps et
  **ne s'était jamais exécuté** — il filtre sur `/\.wav$/` et l'extracteur ne
  nommait aucun fichier `.wav`, parce que l'extension venait de `m_Format`, qui
  ne dit rien du conteneur ([`43`](43-pnj-son-decollage.md) §3.1). Corrigé :
  16 Ogg, 20 WAV. Le gain, lui, reste à mesurer dans un navigateur.
- **`_vanishEffectPrefab`**, et **les pièces du vaisseau sans géométrie
  propre** : une pièce morte se lit dans son état, elle ne se voit pas sur la
  coque.
- **Le portrait n'a pas d'interface propre.** La manette, elle, est lue
  ([`35-monde.md`](35-monde.md) §7).

### 4. Ce que la comparaison extracteurs / moteur avait fait apparaître

Des données du build **déjà extraites, et que rien ne lisait**. Les neuf écarts
relevés par [`34-actions.md`](34-actions.md) sont maintenant branchés — rotation
propre, portées audio, lumières, `RenderSettings`, `_checkDepth`, champs
directionnels, fluides, `mainData`, zones d'oxygène — et
[`35-monde.md`](35-monde.md) dit comment.

Ce qu'il faut en retenir vaut pour la suite : **avant de conclure qu'une chose
manque au build, vérifier qu'on la lit**. Six des neuf écarts étaient des
lecteurs absents, pas des données absentes.

C'est fait : [`36-audit.md`](36-audit.md) a mesuré ces extracteurs sur le build,
et [`37-corrections.md`](37-corrections.md) dit ce que ses neuf actions ont
donné. La leçon se prolonge d'une seconde — **avant de conclure qu'on lit une
chose, la mesurer** : quatre des écarts de l'audit étaient des lecteurs
présents qui lisaient à côté, et deux étaient des tests qui gardaient le vide.

Les chiffres de l'audit sont désormais des invariants de `tests/05-extract.mjs`
plutôt que des phrases : tous les volumes de fluide portent une densité, des
volumes portent un courant et ce sont des capsules, aucune source audio n'est
en atténuation linéaire, et aucun pointeur de contrôleur de dialogue ne vise
autre chose qu'un texte.

## Où lire le détail

| ce qui a été fermé | page |
|---|---|
| mort, flashback, supernova | [`32-mort.md`](32-mort.md) |
| dégâts par pièce, destruction, limite de poussée | [`18-vaisseau.md`](18-vaisseau.md) |
| LOD par maillage, éviction, éclairage ambiant | [`17-secteurs.md`](17-secteurs.md) |
| occlusion et inclinaison de la lune quantique | [`14-quantique.md`](14-quantique.md) |
| champ de débris du trou blanc | [`15-trounoir.md`](15-trounoir.md) |
| coupure passe-bas des émetteurs | [`09-audio.md`](09-audio.md) |
| courbes variables et `gravityModifier` | [`10-particules.md`](10-particules.md) |
| mort par prédateur | [`16-bramble.md`](16-bramble.md) |
| caméra embarquée de la sonde | [`25-interface.md`](25-interface.md) |
| commandes tactiles et jeu en paysage | [`33-mobile.md`](33-mobile.md) |
| rotation, lumières, fluides, champs, manette | [`35-monde.md`](35-monde.md) |
| les quatre lois de fluide, lues dans l'IL | [`39-fluides.md`](39-fluides.md) |
| ce qui est solide, et ce qu'on traversait | [`40-solide.md`](40-solide.md) |
| la première image, regardée | [`41-ciel.md`](41-ciel.md) |
| parler, entendre, décoller | [`43-pnj-son-decollage.md`](43-pnj-son-decollage.md) |
| le recensement, lumières vivantes et textures défilantes | [`42-lumieres.md`](42-lumieres.md) |

## Estimation honnête

Le socle — physique, orbites, référentiels, géométrie, collision — est fait
depuis longtemps, et c'est lui qui conditionnait tout le reste. Ce qui manquait
ensuite était du **volume** de logique de jeu ; il a été porté système par
système.

Puis une seconde nature de manque est apparue, moins attendue : **ce qui était
extrait et que rien ne lisait**. Elle est comblée
([`35-monde.md`](35-monde.md)), et il n'y avait presque rien à écrire — seulement
à ouvrir des fichiers qu'on écrivait déjà.

Ce qui reste tient en une phrase : **le contenu que l'alpha n'a pas, et le
jugement qu'une machine ne rend pas**. Le premier ne se comble pas ; le second
demande quelqu'un qui joue, regarde et écoute.

Une troisième nature de manque est apparue depuis, et c'est la plus instructive
des trois : **du travail fait qui ne s'exécutait pas**. Un module entier importé
par personne ([`68`](68-lois.md)), des lois présentes dans une ligne d'`import`
et nulle part ailleurs ([`71`](71-quantique.md)), un motif qui posait une
question au build sans lire la réponse ([`75`](75-chaleur.md)), un garde-fou qui
n'avait jamais parlé ([`76`](76-proximite.md)). On l'a crue comblée — `lois.mjs`
comptait **zéro** — et elle ne l'était pas : le compte ne regardait que les
fonctions exportées.

`scripts/lois.mjs` a montré sa limite avec [`89`](89-pose.md) : il comptait les
**fonctions exportées**, et `Ship.padLanding` était une **méthode** — écrite,
commentée, éprouvée par un test, et appelée par personne pendant tout ce temps.
Il voit les méthodes depuis [`90`](90-methodes.md), et il en a trouvé
**trente-cinq** que rien n'appelait, dont vingt-deux qu'un test faisait pourtant
tourner. Trois n'étaient lues que par `tools/15_verify.py` — un contrôle
navigateur est un appelant, et c'est la deuxième fois que l'extension du fichier
appelant le cachait à ce compte. Deux autres attendaient la sphère de
l'observatoire ([`91`](91-remise-a-zero.md)), quatre la borne de la tour de
lancement ([`92`](92-tour.md)), quatre étaient des règles de commande jamais
branchées ([`93`](93-commandes.md)), et deux confrontent désormais les deux
tables de la manette ([`94`](94-manette.md)). **Il en reste vingt**, et c'est le front
ouvert : ce ne sont pas des lois à écrire, ce sont des lois écrites à brancher —
et chaque fois qu'on cherche ce qui devrait les appeler, on trouve une mécanique
entière.

Une **quatrième** nature est apparue avec [`82`](82-secteur-majeur.md), et elle
est la plus discrète : **la constante inventée**. Le portage décidait du secteur
courant par un `horizon × 1,5` — un nombre plausible, écrit de bonne foi, et
faux de cinq fois. Il n'avait pas été inventé par paresse : la vraie mesure, la
sphère de déclenchement du secteur, n'était pas extraite. **Une constante
inventée est presque toujours la trace d'un champ non extrait**, et c'est là
qu'il faut chercher avant d'écrire une formule. Cinq lois en dépendaient — la
minicarte, la poussée, l'ambiance, la lampe, les phares — et aucune n'avait de
test qui aurait pu le dire, parce qu'on ne teste pas ce qu'on a inventé.

La teinte de l'ambiance par secteur, que ce lot avait laissée ouverte, est
portée depuis [`83`](83-seuils.md) : `_ambientLight` est une énumération, pas un
nombre. Les seuils, eux, servent maintenant les cinq zones sans soleil, la zone
sombre, les six zones sonores sans forme, la chambre en apesanteur et le champ
de la station météo : **dix-huit sur dix-huit** ([`83`](83-seuils.md),
[`84`](84-ambiance.md), [`85`](85-chambre.md)).

Et une cinquième nature de manque, découverte par [`84`](84-ambiance.md) :
**le commentaire exact posé sur un code approximatif**. L'extracteur audio
décrivait correctement ce qu'il aurait fallu faire — « la forme est celle des
`EntrywayTrigger` posés sous l'objet » — au-dessus d'un code qui prenait la
première boîte d'enfant et la servait comme contenance. Aucun test ne
l'interrogeait, parce que le commentaire tenait lieu de preuve. C'est plus
difficile à voir qu'un commentaire faux.

Reste le dénominateur des **annonces** : 45 des 124 chaînes de `GlobalMessenger`
ne sont nommées nulle part dans `web/src/`. Ce n'est pas une liste de manques —
un événement non nommé peut correspondre à un comportement porté sous un autre
nom — mais c'est **la carte de ce qu'il reste à lire**, et chaque piste s'y
vérifie en une lecture d'IL. C'est par là que passe la suite.
