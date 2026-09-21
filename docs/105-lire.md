# Trente-quatre textes extraits, affichés nulle part — et cinq verrous de caméra

`ReadableObject` est marquée `@lit` depuis longtemps. Ses trente-quatre
instances étaient extraites, leur `TextAsset` résolu, leur texte posé dans
`data/gameplay.json`. Appuyer sur un panneau ne faisait **rien**, et l'ATH se
contentait d'annoncer « texte disponible ».

Le quatrième dénominateur ([`103`](103-refait.md)) a nommé `DialogueGUI` 0/8.
Derrière ces huit méthodes, trois choses : la pagination, la lecture des
panneaux, et les cinq appels de `LockOn` que le portage n'avait jamais comptés.

## 1. Lire, c'est la même boîte

```
ReadableObject.OnPressInteract()
    if (_isBeingRead) return;
    DialogueBox box = new DialogueBox(_displayText, String.Empty, 0,
                                      String.Empty, true);
    _dialogueGUI.ShowDialogueBox(box);
    _lockOnTargeting.LockOn(_attentionPoint, 2f, false, 1f);
    _isBeingRead = true;
    GlobalMessenger.AddListener("ExitDialogueMode", OnExitDialogueMode);
```

Aucune mécanique séparée : c'est la boîte de dialogue, avec `_isMuseumSign` à
**vrai** — donc sans nom de personnage, sans options, et avec les limites de
découpage du panneau. Tout ce qui manquait était le chemin qui y mène.

## 2. Les quatre nombres ne bornaient pas une ligne, ils comptaient des appuis

`DialogueGUI` porte quatre entiers, sérialisés sur l'unique instance posée sur
`PlayerCamera` :

| | par ligne | lignes par page |
|---|---|---|
| personnage | 50 | 4 |
| panneau de musée | 70 | 5 |

Le portage les gardait tous les quatre — et coupait à la première page, avec un
`« … »` pour dire ce qu'il jetait. Or `CalculateDisplayableDialogues` ne borne
pas une ligne : il **découpe** le texte en unités affichables, et **chaque unité
coûte un appui**.

```
_dialogueToDisplay = Regex.Replace(_dialogueToDisplay, "\r\n?|\n", " ");
_dialogueToDisplay = _dialogueToDisplay.Trim();
... pour chaque espace, on regarde le mot suivant EN ENTIER ...
    si _countChars >= maxCharsPerLine || largeur rendue >= largeur de la boite
        on retire l'espace, on passe a la ligne, _countChars = 0
si _countlines == maxLinesToDisplay || c == forceNewLineCharacter
    _displayableDialogues[_numDisplayableUnits++] = ce qu'on a
```

Trois choses en sortent, et la première surprend :

- **le texte est un paragraphe.** Les retours à la ligne d'origine sont
  remplacés par des espaces *avant* toute mise en page. Les `\r\n` des panneaux
  ne sont donc pas des sauts de ligne à l'affichage ;
- **la coupure se fait à un espace**, jamais au milieu d'un mot : le build
  regarde le mot suivant en entier avant de décider ;
- `forceNewLineCharacter` vaut 64, soit `@`, et il termine la ligne **et la
  page**.

### Ce que cela fait, en chiffres du build

**Vingt-deux des trente-quatre textes se lisent en plusieurs fois.** La moitié
de leur contenu n'était affichable nulle part.

Et ce vingt-deux en recoupe un autre : vingt-deux textes portent au moins un
`@`. Ce n'est pas une coïncidence, et l'invariant garde la raison plutôt que le
chiffre — **aucun texte sans arobase n'atteint la page de panneau** (70 × 5 =
350 caractères ; le plus long en fait 261), et tout texte qui en porte une se
lit forcément en deux fois.

### Ce que ce portage ne peut pas tenir

Le build coupe aussi la ligne quand sa **largeur rendue** atteint celle de la
boîte (`_promptStyle.CalcSize`). Cette mesure-là dépend des métriques d'une
police qu'Unity choisit lui-même — le champ `_font` est nul — et de la
résolution. Le découpage se fait donc ici au compte de caractères, et la boîte
du navigateur replie le reste en CSS. C'est une condition **supplémentaire** du
build, pas une autre règle : ce qui en sort est au plus aussi long.

## 3. Le verrouillage de caméra a cinq appelants, et cinq réglages

La loi était portée — `lockYawError`, `lockFOV`, `CameraLock` — et mesurée
([`69`](69-assise.md)). Elle était branchée à **une** chose : la console la plus
proche, à 1 degré par degré d'écart, avec zoom. Le build appelle `LockOn` à
cinq endroits, et chacun donne ses propres nombres.

| appelant | cible | taux | zoom | vitesse |
|---|---|---|---|---|
| `Conversation.StartConversation` | l'interlocuteur, `+0,5` en local | **3** | oui | 1 |
| `ReadableObject.OnPressInteract` | `_attentionPoint` | **2** | **non** | 1 |
| `ShipComputer.EnterShipComputer` | `_targetPoint` | 1 | oui | **8** |
| `RemoteFlightConsole.OnPressInteract` | `_modelShipBody` | **5** | oui | 1 |
| `SatelliteSnapshotController.OnPressInteract` | `_projectionScreen` | 1 | **non** | 1 |

C'est ce qui fait qu'on **pivote doucement** vers un panneau qu'on lit, et qu'on
**se retourne d'un coup** vers le vaisseau modèle quand on prend sa console. Un
seul taux pour tout écrasait cette différence entière.

Deux erreurs de lecture s'y cachaient aussi :

- **la cible n'est pas l'objet avec lequel on interagit.** C'est un transform
  sérialisé à côté. Le point d'attention de la vitrine des billes est
  `Ball_Body` — la bille elle-même —, pas le volume de lecture posé un mètre
  plus bas. Dix-neuf des trente-quatre objets lisibles en déclarent un ; les
  quinze autres se regardent eux-mêmes ;
- le portage visait le composant `PlayerLockOnTargeting` lui-même. Il n'y en a
  que **deux** dans la scène, et ils sont posés sur le joueur et sur les
  commandes du projecteur — donc jamais sur ce qu'on regarde. Un composant n'est
  pas une cible, c'est ce qui vise.

### L'offset qui ne change rien, et pourquoi le dire

`StartConversation` passe `(0, 0.5, 0)`, **local** à l'interlocuteur. Sur un sol
partagé, cet offset est parallèle au haut du joueur — et `lockYawError` projette
justement cette composante-là hors du lacet. Il ne change donc que la distance,
donc le champ de vision, qui sous dix unités ne bouge pas non plus.

> Le nombre est reporté quand même, avec la raison pour laquelle il ne se voit
> pas. Un portage qui laisse tomber un paramètre « parce qu'il ne change rien »
> ne sait plus, six mois plus tard, s'il l'a mesuré ou oublié.

## Gardé par

- `tests/09-jeu.mjs` — la pagination : coupure à l'espace, retours à la ligne
  mis à plat, `@` qui termine la page, et **rien de perdu** entre l'entrée et
  la sortie. Puis la lecture d'un objet : autant d'appuis que de pages, le
  dernier qui referme ; et la réplique d'une conversation, dont le rang de page
  repart à zéro à la réplique suivante.
- `tests/05-extract.mjs` — sur le build : les trente-quatre textes, les
  vingt-deux à arobase, les vingt-deux qui débordent, la raison pour laquelle
  ces deux comptes coïncident, et les dix-neuf points d'attention.
- `tools/15_verify.py --profil` — dans la page : on ouvre le plus long des
  trente-quatre, on compte les appuis jusqu'à la fermeture, on vérifie que la
  boîte porte le style de panneau — et que **tous les mots du texte ont été
  affichés**.
