# Jouer au doigt, en paysage

Tout ce qui est décrit ici est **du portage, pas du jeu**. L'alpha de 2013 est
faite pour un clavier et une manette : le build ne contient aucun contrôle
tactile, aucune disposition d'écran alternative, et `XboxInput` est la seule
source d'entrée qui ne soit pas le clavier. Ce document dit donc ce qui a été
inventé, et selon quelle règle.

La règle tient en une phrase : **la couche tactile ne crée aucune commande**.
Elle produit exactement les mêmes entrées que le clavier — un axe et des codes
de touche — et rien en aval ne sait qu'un doigt existe.

```
doigt ──► web/src/touch.js ──┬──► axes (forward, right, up, boost) ──► input
                             ├──► pixels de regard ──────────────────► look()
                             └──► codes clavier (KeyE, KeyM, ...) ──► command()
clavier ─────────────────────┴──────────────────────────────────────►
souris ──────────────────────┴──────────────────────────────────────►
```

La disposition est celle des FPS sur téléphone : **deux manches**, un par pouce.
Le gauche déplace, le droit regarde. Ce sont le même objet — `Stick` dans
`web/src/touch.js` — à deux réglages près, ce qui est tout ce qu'il a fallu pour
que le côté droit devienne un manche plutôt qu'une simple zone de balayage.

`command(code)` dans `web/src/main.js` était le corps du gestionnaire de
`keydown` : l'avoir extrait en fonction est tout ce qu'il a fallu pour que les
boutons de l'écran et les touches partagent le même chemin.

## Les commandes

| geste | équivalent clavier | remarque |
|---|---|---|
| manche gauche | `W`/`A`/`S`/`D` | **analogique**, là où la touche vaut 1 |
| manche gauche poussé à fond devant | `Maj` | cran de course, tant qu'il dure |
| manche droit, glissé | souris capturée | même formule, gain 1,7 |
| manche droit, tenu | souris capturée | rotation **continue**, 900 px/s à fond |
| tape brève à droite | `E` | parler, interagir, faire défiler un dialogue |
| losange `▲` (place de Y) | `Espace` | monter, maintenu |
| losange `»` (place de X) | `Maj` | **latché** ; le cran de course l'allume aussi |
| losange `E` (place de A) | `E` | l'action principale, là où le pouce tombe |
| losange `☀` (place de B) | `L` | lampe |
| gâchettes `L1` `L2` `R1` `R2` | `T`, `F`, `M`, `N` | lunette, sonde, carte, ordinateur de bord |
| pastilles du milieu | `G`, `Échap` | affichage, menu |
| croix `▲▼◀▶`, à gauche | flèches | ne sort que dans un menu |
| `✓` `✕`, aux places de A et B | `Entrée`, `Échap` | ne sortent que dans un menu |
| `◎` `✕`, aux places de A et B | `C`, `M` | carte ouverte : centrer, fermer |
| glisser sur la carte | glisser à la souris | même conversion pixels → fraction d'écran |
| pincer sur la carte | molette | zoom borné aux valeurs du jeu |
| taper une option de dialogue | `1`-`9` | le curseur suit le doigt |
| taper une ligne de réglages | curseur puis `Entrée` | une ligne verrouillée ne fait rien |

Quatre choix méritent d'être défendus.

**Les manches sont flottants** : ils apparaissent là où le pouce se pose, au
lieu d'être dessinés à une place fixe. Sur une vitre sans relief, viser une
croix qu'on ne sent pas ne marche pas ; se poser n'importe où dans sa moitié
d'écran, si. Une empreinte pâle rappelle malgré tout qu'il y a un manche de
chaque côté, et s'efface dès que le pouce se pose. La zone morte vaut 0,16 du
rayon à gauche — `PlayerCharacterController` n'en a pas, parce qu'une touche ne
tremble pas, alors qu'un pouce posé ne tient pas immobile. Au sortir de la zone
morte l'axe repart de zéro, sans quoi le premier pixel utile vaudrait déjà 0,16
et le démarrage serait brusque.

**Le regard est une vitesse, et un déplacement.** Un manche tenu doit tourner la
caméra même quand le doigt ne bouge plus : la déflexion donne donc des pixels de
souris **par seconde**, appliqués par une boucle `requestAnimationFrame` — un
`pointermove` ne bat pas, et ne pouvait rien dire d'un pouce immobile. Le
glissement, lui, garde son effet direct : c'est lui qui permet de viser au
pixel, là où la vitesse sert à se retourner. Les deux se cumulent, ce qui donne
le balayage d'avant sans perdre le manche ; `?look=stick` ne garde que la
vitesse, `?look=swipe` que le glissement.

La réponse du manche droit est **courbée** — un quart de linéaire, le reste en
cube. Une réponse droite obligerait à choisir entre viser fin et se retourner
vite : à mi-course la caméra tourne à 22 % de sa vitesse, pas à 50 %. Sa zone
morte est plus large que celle du déplacement (0,22 contre 0,16) : une caméra
qui dérive sous un pouce immobile est bien plus pénible qu'un pas parasite.

**Pousser à fond devant, c'est courir.** Le cran de course des FPS mobiles :
au-delà de 95 % du rayon et dans les 45° de l'avant, `Maj` est tenue tant que le
manche y reste, et le bouton `»` s'allume pour le dire. Il ne remplace pas le
bouton, qui reste latché : un pouce ne peut pas à la fois tenir « accélérer » et
piloter, mais quand il pousse déjà à fond, il peut.

**Une tape brève vaut `E`.** L'action principale du jeu est contextuelle et se
déclenche partout ; lui demander de viser un bouton à chaque réplique de
dialogue serait pénible. Une tape est un pointeur posé et relevé sans avoir
glissé de plus de 14 pixels, en moins de 300 ms — au-delà, c'est un regard.

## La grammaire d'une manette

Les boutons n'étaient qu'une rangée de sept noms en haut et trois pastilles en
bas : rien ne disait lequel servait à quoi, ni où chercher. Ils suivent
désormais la disposition d'une manette, parce que c'est la seule que tout le
monde reconnaît sans l'apprendre — celle des overlays de FPS mobiles :

- **gâchettes** le long du bord haut, deux à gauche, deux à droite ; les coins
  sont pris par les jauges et la minicarte ;
- **losange d'action** en bas à droite, aux places de Y, X, B et A. C'est A qui
  tombe sous le pouce sans effort, donc A porte `E` — l'action principale ;
- **pastilles du milieu**, celles qu'une manette met entre ses deux manches,
  pour ce qui ne sert qu'entre deux vols ;
- **croix directionnelle** en bas à gauche, là où le pouce tenait le manche.

Chaque bouton porte **deux étiquettes** : le nom de l'action, en gros, et le
repère de manette (`L1`, `A`, …), en petit. Personne n'a de plan de touches en
tête pour un jeu de 2013 ; le repère dit *où* est le bouton, le nom dit ce
qu'il *fait*.

Un menu ne recouvre pas la manette : il la **remplace**. Les dix commandes de
vol disparaissent, la croix et les deux boutons de réponse prennent leur place —
`✓` et `✕` exactement là où le pouce venait de laisser « agir » et « lampe ».
Rien à chercher, rien qui réponde à côté.

## Les trois plans, et pourquoi l'ordre compte

```
#touchui   z-index 8    boutons — atteignables même sous la carte plein écran
#ui        z-index 7    jauges, invites, réglages
#dialogue  z-index 6    dialogue et ses options
#map       z-index 5    carte du système
#touch     z-index 4    zones de pilotage
#view                   le moteur
```

Les zones de pilotage sont **sous** l'interface : un appui destiné à une option
de dialogue ou à une ligne de réglages ne leur est jamais volé. Les boutons sont
**au-dessus de tout** : sans cela, ouvrir la carte — qui occupe l'écran entier —
enfermerait le joueur dedans, faute de pouvoir viser « fermer ». Leur conteneur
laisse passer les appuis ; seuls les boutons eux-mêmes les prennent.

Être en dessous a un prix, et il a été payé : **les deux manches sont restés
muets**. `#map` est un canvas plein écran, en z-index 5, masqué par l'attribut
`hidden` quand la carte est fermée — sauf que sa règle d'identité fixe
`display: block`, laquelle l'emporte sur le `display: none` que le navigateur
applique à `[hidden]`. La carte fermée restait donc étendue au-dessus des zones
de pilotage et avalait tous leurs appuis ; seuls les boutons, plus haut,
répondaient. Le même piège était déjà annoté sur `#gate`, où il avait été vu.

Ce qu'il faut en retenir tient à la manière de vérifier : envoyer un événement
de pointeur *à la zone elle-même* ne prouve rien, puisque cela court-circuite le
test de recouvrement. Le contrôle qui l'aurait vu est celui qui part du **point
de l'écran** — `elementFromPoint` là où le pouce se pose — et il est désormais
dans `tools/15_verify.py`.

Un menu ouvert (réglages, ordinateur de bord) ou la carte **suspendent le
pilotage** et rangent les boutons de vol : sinon le pouce qui vise une option
fait aussi tourner la tête du joueur derrière, et la croix se poserait sur le
bandeau d'état.

## L'interface en paysage

Un téléphone tenu en paysage donne environ **800 × 370 pixels CSS** : trois fois
moins de hauteur que l'écran de référence du HUD, qui est celui de 2013. Les
éléments gardent leurs proportions internes — la géométrie relative du casque,
mesurée sous `ResourcesHUD`, ne change pas — mais leur taille et leur coin
changent, et ils se rangent pour laisser les pouces libres :

```
┌──────────────────────────────────────────────────────────┐
│ jauges   L1 L2  vue menu  R1 R2                       ⊙   │  minicarte
│                                                     ▲     │
│                    invite centrale                        │
│  invites        ◌            ◌                  »     ☀   │
│  bandeau d'état ───────────────────────────────────  E ──│
└──────────────────────────────────────────────────────────┘
   manche gauche : déplacement    manche droit : regard, puis le losange
```

Trois bornes s'ajoutent ailleurs, pour la même raison :

- **La boîte de dialogue** était mise à l'échelle de la hauteur seule. Sur un
  écran large et bas, cela donnait un corps de 7 pixels : elle est désormais
  bornée aussi par la largeur, et son corps par un plancher de 12 pixels.
- **Le menu des réglages** s'étale sur quelque 400 pixels sous son ancre, ce qui
  sortait par le bas ; il est mis à l'échelle de la place disponible, ses
  proportions intactes.
- **Le bandeau d'état** s'arrête avant les boutons d'action, tient sur une ligne
  par entrée, et disparaît dans un menu comme dans le mode « masqué » de
  `GUIMode` — qui ne cachait jusqu'ici que ce que le moteur dessine.
- **La vue de la sonde** occupait le coin bas-droit, désormais celui des boutons
  d'action : elle passe à gauche, sous les jauges. Son cadre HTML et le viewport
  Babylon bougent **ensemble** (`ProbeCamera.setViewport`) — déplacer l'un sans
  l'autre décalerait l'image de son cadre.

## Le portrait

Le HUD du jeu suppose un écran plus large que haut. En portrait, les trois
quarts s'y chevauchent. Plutôt que de dessiner une seconde interface, la page
demande de tourner l'appareil, et le moteur continue de tourner derrière. À
l'entrée dans le système, le plein écran et le verrouillage en paysage sont
demandés — les deux exigent le geste de l'utilisateur, c'est-à-dire ce clic-là,
et les deux échouent souvent (iOS n'expose pas le verrouillage d'orientation).
L'échec est sans conséquence : le bandeau prend le relais.

## Ce que le téléphone ne change pas

Le pipeline est le même, et c'est là que le bât blesse : l'archive fait 290 Mo,
l'extraction en écrit environ 600, et elle prend sur un téléphone bien plus que
les 70 secondes mesurées sur un poste de bureau. Les quatre API nécessaires —
stockage privé de l'origine avec `FileSystemSyncAccessHandle`, `DecompressionStream`,
`OffscreenCanvas`, Service Worker — sont présentes sur Chrome Android et sur
Safari 17 et suivants ; le contrôle de l'écran d'accueil les nomme plutôt que de
conclure qu'il faut un ordinateur.

## Vérification

La géométrie des manches est pure — ce qu'un pouce posé à tel endroit produit
comme axe — donc elle se vérifie sans navigateur : `tests/09-jeu.mjs` en compte
dix-huit contrôles, zone morte, saturation, diagonale, courbe du regard et cran
de course.

Le reste demande un vrai navigateur. `tools/15_verify.py` installe la couche,
lui envoie des événements de pointeur, et contrôle qu'elle produit bien les
entrées attendues : axe saturé à 1 manche à fond, course au cran, axe nul manche
relâché, glissement à droite à son gain direct, **rotation continue à 900 px/s
manche droit tenu** et plus rien une fois relâché, `KeyE` sur la tape comme sur
le bouton d'action, pilotage suspendu dans un menu, dix commandes de vol
remplacées par six en menu, deux manches, deux empreintes et 18 boutons en tout.
Puis elle est retirée, et la page rendue telle qu'elle était.

Et surtout, depuis que le défaut ci-dessus a coûté deux manches silencieux :
**ce que le doigt touche vraiment**, `elementFromPoint` aux deux endroits où les
pouces se posent, qui doit être la zone de pilotage et rien d'autre.

L'ouverture forcée `?touch=1` installe la disposition tactile sur un poste de
bureau ; `?touch=0` l'interdit sur un appareil tactile. `?look=stick` et
`?look=swipe` choisissent le regard.

## Ce qui reste

- **Le portrait** n'a pas d'interface propre, seulement un bandeau.
- **La croix ne sort que dans un menu.** En vol elle ne servirait à rien, mais
  dans un dialogue les options se visent au doigt plutôt qu'avec elle — ce qui
  marche, sans être le même geste que dans un menu.
- **Rien n'est réglable depuis l'écran** : ni la taille des boutons, ni leur
  côté (le gaucher n'a pas d'option), ni la sensibilité tactile en propre — elle
  passe par le réglage de regard du jeu, ce qui est cohérent mais pas séparé. Le
  mode de regard, lui, se choisit par l'adresse (`?look=`) et non par un
  bouton : le menu des réglages est celui du jeu, et rien n'y est inventé.
- **Le pincement ne sert que la carte.** Le télescope garde son bouton, là où un
  pincement serait plus naturel.
- **Aucune manette** n'est lue, alors que le build en décrit une entière
  (`XboxInput`) : c'est le chemin le plus court vers un vrai portage de
  commandes, et il n'est pas emprunté.
- **Une partie jouée sur un vrai téléphone.** Tout est vérifié au chiffre et à
  l'émulation ; rien ne l'est encore au pouce.
