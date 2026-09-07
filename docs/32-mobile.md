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
                             └──► codes clavier (KeyE, KeyM, ...) ──► command()
clavier ─────────────────────┴──────────────────────────────────────►
```

`command(code)` dans `web/src/main.js` était le corps du gestionnaire de
`keydown` : l'avoir extrait en fonction est tout ce qu'il a fallu pour que les
boutons de l'écran et les touches partagent le même chemin.

## Les commandes

| geste | équivalent clavier | remarque |
|---|---|---|
| manche, moitié gauche | `W`/`A`/`S`/`D` | **analogique**, là où la touche vaut 1 |
| glisser, moitié droite | souris capturée | même formule, gain 1,7 |
| tape brève à droite | `E` | parler, interagir, faire défiler un dialogue |
| `▲` maintenu | `Espace` | monter |
| `»` | `Maj` | **latché** : un pouce ne peut pas tenir et viser à la fois |
| `E` | `E` | l'action principale, au coin, là où le pouce tombe |
| carte, lunette, sonde, lampe, bord, vue, menu | `M`, `T`, `F`, `L`, `N`, `G`, `Échap` | |
| croix `▲▼◀▶ ✓ ✕` | flèches, `Entrée`, `Échap` | ne sort que dans un menu |
| glisser sur la carte | glisser à la souris | même conversion pixels → fraction d'écran |
| pincer sur la carte | molette | zoom borné aux valeurs du jeu |
| taper une option de dialogue | `1`-`9` | le curseur suit le doigt |
| taper une ligne de réglages | curseur puis `Entrée` | une ligne verrouillée ne fait rien |

Deux choix méritent d'être défendus.

**Le manche est flottant** : il apparaît là où le pouce se pose, au lieu d'être
dessiné à une place fixe. Sur une vitre sans relief, viser une croix qu'on ne
sent pas ne marche pas ; se poser n'importe où dans sa moitié d'écran, si. Sa
zone morte vaut 0,16 du rayon — `PlayerCharacterController` n'en a pas, parce
qu'une touche ne tremble pas, alors qu'un pouce posé ne tient pas immobile. Au
sortir de la zone morte l'axe repart de zéro, sans quoi le premier pixel utile
vaudrait déjà 0,16 et le démarrage serait brusque.

**Une tape brève vaut `E`.** L'action principale du jeu est contextuelle et se
déclenche partout ; lui demander de viser un bouton à chaque réplique de
dialogue serait pénible. Une tape est un pointeur posé et relevé sans avoir
glissé de plus de 14 pixels, en moins de 300 ms — au-delà, c'est un regard.

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
│ jauges      carte lunette sonde lampe bord vue menu   ⊙   │  minicarte
│                                                           │
│                    invite centrale                        │
│  invites                                        ▲  »  E   │
│  bandeau d'état ─────────────────────────────────────────│
└──────────────────────────────────────────────────────────┘
   manche flottant                            regard
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

`tools/15_verify.py` installe la couche dans un vrai navigateur, lui envoie des
événements de pointeur, et contrôle qu'elle produit bien les entrées attendues :
axe saturé à 1 manche à fond, axe nul manche relâché, `KeyE` sur la tape comme
sur le bouton d'action, pilotage suspendu dans un menu, 18 boutons à l'écran.
Puis elle est retirée, et la page rendue telle qu'elle était.

L'ouverture forcée `?touch=1` installe la disposition tactile sur un poste de
bureau ; `?touch=0` l'interdit sur un appareil tactile.

## Ce qui reste

- **Le portrait** n'a pas d'interface propre, seulement un bandeau.
- **Rien n'est réglable** : ni la taille des boutons, ni leur côté (le gaucher
  n'a pas d'option), ni la sensibilité tactile en propre — elle passe par le
  réglage de regard du jeu, ce qui est cohérent mais pas séparé.
- **Le pincement ne sert que la carte.** Le télescope garde son bouton, là où un
  pincement serait plus naturel.
- **Aucune manette** n'est lue, alors que le build en décrit une entière
  (`XboxInput`) : c'est le chemin le plus court vers un vrai portage de
  commandes, et il n'est pas emprunté.
- **Une partie jouée sur un vrai téléphone.** Tout est vérifié au chiffre et à
  l'émulation ; rien ne l'est encore au pouce.
