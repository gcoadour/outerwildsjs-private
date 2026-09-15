# Parler aux PNJ au doigt

> « Je n'arrive pas à interagir avec les PNJ sur mobile. »

C'est exact, et ce n'était pas une impression. Sur un téléphone, on pouvait
*ouvrir* une conversation — le bouton d'action produit bien `KeyE` — mais on ne
pouvait ni savoir qu'il y avait quelqu'un à qui parler, ni **choisir une
réponse**, ni appuyer sur « Next ». Quatre défauts superposés, tous mesurés dans
un vrai Chromium à 812 × 375 avec `hasTouch`, la taille d'un téléphone tenu en
paysage.

[`33-mobile.md`](33-mobile.md) finissait par : *« Une partie jouée sur un vrai
téléphone : tout est vérifié au chiffre et à l'émulation ; rien ne l'est encore
au pouce. »* Voilà ce que le pouce a trouvé.

## 1. Le dialogue vivait **sous** les zones de pilotage

Le plus grave, et le plus court à dire. `docs/33` décrit trois plans, et les
donne dans cet ordre :

```
#touchui   z-index 8    boutons
#ui        z-index 7    jauges, invites
#dialogue  z-index 6    dialogue et ses options
#touch     z-index 4    zones de pilotage
```

Le commentaire du CSS le promettait aussi : *« ses zones de pilotage ne volent
donc jamais un appui destiné à une option de dialogue »*. **C'était faux.**
`#dialogue` était un enfant de `#hud`, et `#hud` est `position: fixed` — ce qui
crée un **contexte d'empilement**. Le `z-index: 6` de `#dialogue` n'y valait donc
que *dedans* ; `#hud`, lui, s'empile à `auto`, c'est-à-dire 0, sous les zones de
pilotage à 4.

La mesure, celle qui part du point de l'écran et non de l'élément :

| point visé | `elementFromPoint` rendait | après correction |
|---|---|---|
| centre d'une option de dialogue | `tc-zone-move` | `dlg-option dlg-sel` |
| centre du bouton « Next » | `tc-tag` (l'étiquette de « descendre ») | `dlg-next` |

Le manche gauche mangeait donc tous les appuis destinés aux réponses, et le
losange d'action tous ceux destinés à « Next ». **Aucune option de dialogue
n'était choisissable au doigt** — c'est exactement la plainte.

C'est la **troisième** visite du même piège, après `#gate` et après `#map` (dont
`docs/33` raconte déjà qu'il avait coûté deux manches muets). Les deux
premières fois, un élément posé au-dessus rendait muet ce qui était dessous. Ici
c'est l'inverse de forme et le même de fond : un parent anodin décide du plan de
son enfant, et le `z-index` écrit ne dit rien de ce qui est vrai.

**Le correctif** : `#dialogue` est sorti de `#hud` et posé à la racine. Rien
d'autre n'a changé — il était déjà `position: fixed`, donc il ne bouge pas d'un
pixel.

## 2. La tape brève ne survivait pas à un vrai pouce

`docs/33` présente la tape comme **le** geste principal : *« Une tape brève vaut
`E`. L'action principale du jeu est contextuelle et se déclenche partout ; lui
demander de viser un bouton à chaque réplique de dialogue serait pénible. »*

La règle écrite était : moins de **14 pixels de chemin parcouru**, en moins de
**300 ms**. Or « chemin parcouru » était la somme des `|dx| + |dy|` de chaque
`pointermove` — pas le déplacement. Un pouce posé ne tient pas immobile : huit
images à deux pixels de gigue font **32 pixels de chemin et zéro de
déplacement**.

| geste | avant | après |
|---|---|---|
| posé et relevé au même pixel | tape | tape |
| gigue de 2 px, 120 ms | **regard** | tape |
| immobile, appuyé 400 ms | **regard** | tape |
| glissement de 40 px | regard | regard |

Et l'échec n'était pas neutre : la tape ratée devenait un balayage, donc **la
caméra se détournait du personnage** qu'on essayait d'aborder.

La règle porte maintenant sur le **déplacement net depuis le point de pose** —
c'est ce que « sans avoir glissé » veut dire — bornée à 16 pixels, avec le
chemin gardé comme garde-fou bien plus large (48 px) : un aller-retour revenu à
son point de départ a bel et bien glissé. La fenêtre passe de 300 à 500 ms.
`isTap()` est une fonction pure : [`tests/09-jeu.mjs`](../tests/09-jeu.mjs) en
tient sept contrôles, et `tools/15_verify.py` rejoue la gigue dans le navigateur.

## 3. Rien ne disait qu'il y avait quelqu'un

L'invite existait — `E pour parler a Hornfels` — mais elle vivait **en fin du
bandeau d'état**, après la boucle, les ressources, les particules, l'audio,
l'oxygène, la guimauve, le chargement, les anglerfish, le trou noir, les débris
et la lune quantique. Or en paysage de téléphone ce bandeau tient sur **une
ligne**, coupée aux 60 % de l'écran :

```
largeur utile 471 px · largeur du texte 650 px · white-space: nowrap
```

L'invite tombait donc **toujours** hors champ. Sur un écran de bureau on la
voyait ; au doigt, jamais.

Un personnage à portée s'annonce désormais **au centre**, dans la zone que
`PromptManager` réserve à l'objet visé — celle qui porte déjà « ramasser »,
« ouvrir la trappe » et les consoles déportées. L'invite empruntée est celle de
l'interaction, avec son icône et sa priorité ; le **mot**, lui, est du portage :
`Conversation` ne construit pas de `ScreenPrompt` dans l'alpha, et on ne prétend
pas le contraire.

## 4. Les cibles n'avaient pas la taille d'un doigt

Le CSS des boutons tactiles le dit en toutes lettres : *« La cible fait au moins
44 px, ce qu'un doigt demande. »* Le dialogue ne l'avait jamais suivi.

| cible | avant | après |
|---|---|---|
| une option de dialogue | 236 × **20** | 236 × **38** |
| « Next » | 29 × **16** | 78 × **40** |

Et la boîte elle-même passait **sous** le losange d'action : mesurée à
`x 125 → 688` quand le losange commence à `x 622`. Elle s'ancre maintenant à
gauche, et sa largeur s'arrête avant lui. La place n'est pas écrite dans le
code : elle est **mesurée sur la couche** au moment du redimensionnement
(`DialogueUI.reserveOf`), parce qu'elle change avec la taille des boutons et
avec l'encoche.

```
avant   boîte 125 → 688   losange 622 → 792   ils se chevauchent
après   boîte  10 → 573   losange 622 → 792   ils ne se touchent pas
```

## Ce qu'on en retient

`docs/33` avait déjà tiré la bonne leçon de l'affaire `#map` : *« envoyer un
événement de pointeur à la zone elle-même ne prouve rien, puisque cela
court-circuite le test de recouvrement ; le contrôle qui l'aurait vu est celui
qui part du point de l'écran ».* Ce contrôle existait — et il ne regardait que
**deux points**, ceux où les pouces se posent sur les manches. Il ne regardait
aucun des points où le jeu demande de viser quelque chose.

La leçon se prolonge donc d'un cran, comme
[`43-pnj-son-decollage.md`](43-pnj-son-decollage.md) l'avait fait avant elle :
**un plan se mesure à chaque endroit où l'on demande d'appuyer**, pas à l'endroit
où l'on sait déjà que ça marche. Les quatre points mesurés ici — l'option, le
« Next », le chevauchement avec le losange, la tape sous gigue — sont désormais
dans `tools/15_verify.py`.

Et la seconde : un `z-index` écrit dans une feuille de style **n'est pas une
mesure**. Trois fois qu'un parent anodin en décide autrement.

## Ce qui reste

- **Le dialogue ne suspend pas le pilotage.** Pendant une conversation le manche
  gauche déplace toujours, ce qui est le comportement du portage depuis
  toujours, au clavier comme au doigt. Le build, lui, bascule sur
  `ConversationInput` : c'est un jeu de commandes à part, et le porter est un
  travail à soi seul.
- **Les options se refont à chaque image.** `DialogueUI.render` reconstruit les
  nœuds soixante fois par seconde. Mesuré : une tape de 150 ms choisit quand
  même la bonne option dans Chromium, donc ce n'est pas un défaut — seulement du
  travail rendu pour rien.
- **Toujours pas de partie jouée sur un vrai téléphone.** Ce qui précède est
  mesuré dans un Chromium à la taille d'un téléphone, avec `hasTouch` : c'est
  mieux qu'un chiffre, ce n'est pas encore un pouce.
