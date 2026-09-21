# Le quatrième dénominateur : ce qu'on lit, et ce qu'on n'en refait pas

Les trois comptes du dépôt ont chacun rencontré la même limite, et chacun l'a
rencontrée en fermant :

| | ce qu'il mesure | ce qu'il ne peut pas voir |
|---|---|---|
| `recensement.mjs` | ce que le build **installe** | une classe **lue à moitié** : le compte ne bouge pas |
| `evenements.mjs` | ce que le build **annonce** | tout ne passe pas par un événement |
| `lois.mjs` | ce que le portage **appelle** | ce qui n'est **pas écrit** |

`scripts/refait.mjs` part de l'autre bout. Pour chaque classe que le portage
déclare lire — `// @lit X` —, il liste les **méthodes** que le build lui donne,
et regarde si le module qui la déclare les **nomme**.

## Pourquoi celui-là, et pourquoi maintenant

Il est né d'un cas précis, et il aurait pu naître de n'importe lequel des
quatre derniers lots.

`PlayerJetpackController` est marquée `@lit` depuis longtemps. Le portage en
tenait les trois constantes de poussée, mesurées et testées. Il lui manquait les
deux verrous de `ReadTranslationalInput` — sauter ne décolle pas, la panne sèche
a une hystérésis ([`101`](101-sac-dorsal.md)) — et **aucun des trois comptes ne
pouvait le dire** :

- le recensement la voyait lue, et elle l'était ;
- aucun de ces deux verrous n'émet d'événement ;
- rien n'était écrit, donc rien ne manquait d'appelant.

Le même trou avait laissé passer `MapOpenGL` ([`100`](100-carte.md)) et les
trois champs du trou blanc ([`102`](102-trou-blanc.md)).

## Ce qu'il compte, et ce qu'il ne compte pas

**Il compte des noms**, comme `evenements.mjs`, et il se lit comme lui : une
**liste de pistes**, une par une, jamais en pourcentage. Une méthode peut être
refaite sans que son nom paraisse — le portage écrit en français —, et une
méthode nommée en commentaire peut n'être refaite nulle part.

Ce qui le rend malgré tout utile est une convention du dépôt : **un portage qui
refait une méthode du build la cite**, au-dessus du code qui la refait. C'est
l'usage depuis les premiers lots.

> Conséquence, et elle va à l'opposé de `recensement.mjs` : ce compte **lit les
> commentaires**, là où le recensement les retire. Les deux ont raison, parce
> qu'ils ne posent pas la même question. Le recensement demande « lit-on cette
> classe ? », et une classe citée en prose n'est pas lue ([`47`](47-effets-image.md)).
> Celui-ci demande « a-t-on regardé cette méthode ? », et une méthode citée en
> prose a bien été regardée.

**Le bruit est retiré**, et chaque famille pour une raison :

| écarté | pourquoi |
|---|---|
| `.ctor`, `Awake`, `Update`, `FixedUpdate`… | Unity les appelle tout seul |
| `add_X` / `remove_X` | la plomberie d'un `event` C# |
| `On<Événement>` | `evenements.mjs` les compte déjà, et mieux |
| `Get*`, `Is*`, `Has*`, `Can*`, `Set*` | des accesseurs ; ce qui compte est le **champ** |
| `Draw*`, `Gizmo*`, `Debug*` | de la mise au point du studio |

## L'échappatoire, et la seule

`// @autrement <Classe> : <raison>`, la raison **obligatoire** sur la même
ligne — la même exigence que `@vide` ([`74`](74-etalons.md)), et pour la même
raison : sans elle, le marqueur devient un moyen commode de ne plus rien
mesurer.

Elle dit : *cette classe est lue, et ses méthodes n'ont pas à être refaites,
parce que le portage fait la même chose par un autre chemin, et que ce chemin
est un choix assumé.* Quatre classes la portent :

| classe | ce que le portage fait à la place |
|---|---|
| `OWRigidbody` (29) | vingt-neuf méthodes qui transmettent à PhysX ; ce portage a Havok |
| `BloomAndLensFlares` (6) | les passes d'un shader d'Unity 4 ; la chaîne de Babylon en vise le résultat |
| `GlowEffect` (6) | idem — le portage en tient la **grandeur** (`blurIterations`, 2 à 32) |
| `Tonemapping` (4) | Babylon a la sienne, et c'est elle qu'on règle |

Les trois dernières ne sont pas une nouveauté : [`08`](08-reste-a-faire.md) §2
dit depuis toujours que le rendu des atmosphères, des brouillards et de
l'explosion sont **des implémentations originales visant un résultat
comparable**. Le marqueur ne fait que le dire à l'endroit où un compte le
demande.

## Ce qu'il trouve, le jour où il s'ouvre

**73 classes déclarées lues, 49 méthodes nommées sur 159.** Comme pour les trois
autres, le chiffre du premier jour n'est pas une régression : c'est l'outil qui
commence à regarder.

Les plus larges écarts, et ce qu'ils annoncent :

- **`DialogueGUI` (0/8)** — huit méthodes de mise en page d'une boîte de
  dialogue. [`25`](25-interface.md) a porté les proportions ; la mise en page
  elle-même est refaite en CSS. Candidat à `@autrement`, **après** l'avoir lue.
- **`Conversation` (0/5)** — `StartRemoteConversation` est branché sous un autre
  nom ([`13`](13-dialogue.md)), `ReadXML` et `ProcessXMLDialogues` sont le
  pipeline, qui est ailleurs. Deux vraies pistes : `StartConversation` et
  `selectOption`.
- **`AudioVolume` / `DayNightAudioVolume` (0/3 et 0/4)** — `Init`, `Activate`,
  `Deactivate`, `UpdatePlayState`. [`84`](84-ambiance.md) a porté l'arbitrage
  par priorité ; ces quatre-là disent ce qui se passe **au moment** d'entrer et
  de sortir, et c'est précisément ce genre de détail que les trois autres
  comptes laissent passer.
- **`PromptManager` (0/4)** — `AddScreenPrompt` / `RemoveScreenPrompt` et le
  calcul de dimensions. [`28`](28-hud.md) a porté le tri par priorité.
- **`RadiationDetector` (1/5)** — `TotalLight` et `TotalRadiation` sont **morts
  dans ce build** : leurs seuls appelants sont `Test`,
  `RadiationDetectorTestPrinter` et `LensFlareFlicker`, qui n'a **aucune
  instance**. Une piste qui se ferme à la lecture, et c'est un bon résultat.
- **`PlayerSpawner` (0/3)** — `SpawnPlayer`, `Warp`, `FindPlanetSpawns`.
  [`38`](38-depart.md) a porté le point d'apparition ; `FindPlanetSpawns` dit
  comment le jeu les **choisit**, ce qui n'est pas la même question.

## Ce que ce lot a déjà fermé

`WhiteHoleVolume` est passée de 2/6 à 6/6 en lisant les trois `Receive*` — et
`ReceiveWarpedPlayer` portait une chose que [`102`](102-trou-blanc.md) avait
laissée : **on ressort en regardant la sortie**. Le build fait pivoter le corps
entier (`Quaternion.FromToRotation(camera.forward, whiteHole.forward)`) avant
même de le déplacer ; ce portage tient le regard en lacet et tangage, et c'est
donc le lacet qu'il mène — le même choix qu'à l'assise ([`69`](69-assise.md)).

Une méthode de plus, lue parce qu'un compte l'a nommée. C'est exactement ce
qu'on attend d'un dénominateur le jour où il s'ouvre.
