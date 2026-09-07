# Interface de dialogue et rendu des sondes

Rendre visible ce qui fonctionnait déjà en coulisses.
`web/src/dialogueui.js`.

## Les proportions viennent du build

`DialogueGUI` donne sa mise en page complète, rapportée à une hauteur de
référence de 1080 :

| élément | dimensions |
|---|---|
| fond du dialogue | 1200 × 300 |
| nom du personnage | 641 × 35 |
| zone de texte | 641 × 176 |
| zone d'options | 504 × 140 |
| curseur d'option | 504 × 35 |
| bouton de choix | 140 × 35 |
| corps de police | 30 |

Et surtout les limites de mise en forme, qui changent selon l'interlocuteur :

| contexte | caractères par ligne | lignes |
|---|---|---|
| personnage | **50** | **4** |
| panneau de musée | **70** | **5** |

Le bouton porte le libellé `Next`, et la sensibilité du curseur vaut 0,5.

## Ce que j'ai failli inventer

`_countChars` avait tout l'air d'un compteur de révélation progressive — l'effet
machine à écrire classique. En suivant son usage, il sert en réalité au **retour
à la ligne** : il se réinitialise au passage de `maxCharsPerLine`.

Le jeu n'affiche donc pas le texte caractère par caractère, et je n'ai pas
ajouté cet effet. C'était tentant, et ç'aurait été faux.

## Vérifié

| contrôle | résultat |
|---|---|
| découpe en mode personnage | 4 lignes, 47 caractères au plus, débordement signalé |
| découpe en mode panneau | 5 lignes, 67 caractères au plus |
| boîte rendue | 1080 px de large, bandeau de nom, 4 lignes, bouton `Next` |
| navigation | ↑ ↓ pour le curseur, ⏎ ou 1-9 pour choisir |

## Rendu des sondes

Une petite sphère émissive par sonde en vol, réutilisée d'une sonde à l'autre
plutôt que recréée. La sonde suit le champ gravitationnel dominant, comme le
joueur.

Un écart apparent — 3 maillages actifs pour 2 sondes — s'est révélé sans
conséquence : la scène contient déjà des maillages nommés `Probe`, `probe` et
`ProbeMesh`, qui sont de la géométrie du jeu. Avec un filtre strict, le compte
est exact.

## Ce qui manque

- **Pas de `_probePrefab`** : la sonde est une sphère, pas le modèle du jeu.
- ~~**Pas de caméra embarquée**~~ — **portée**. La sonde est un appareil photo
  qu'on jette : sa caméra occupe un coin de l'écran tant qu'elle vole, cadrée
  par un encadré HTML calé sur les mêmes fractions que le viewport de Babylon.
  Sa bille est posée sur un calque que cette caméra ne regarde pas — elle est à
  30 centimètres de l'objectif et remplirait l'image.
- **Pas de retour de la sonde** : elle part et ne revient pas.
- **Le curseur n'est pas pilotable à la manette**, la sensibilité de 0,5 du
  build s'appliquant à un axe analogique.
- **Les panneaux de musée** utilisent la mise en forme élargie, mais rien ne
  distingue encore un panneau d'un personnage à l'usage.
