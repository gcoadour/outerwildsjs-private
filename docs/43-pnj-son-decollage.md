# Parler, entendre, décoller

Trois choses qu'on attend d'une partie : pouvoir parler aux habitants, entendre
le jeu, et emmener le vaisseau. Les trois étaient écrites dans le portage, et
les trois étaient cassées — chacune par un défaut différent, et chacun mesuré
sur le build d'origine (`OuterWilds_Alpha_1_2_Linux.zip`, SHA-256
`5c7defa…80f05a`, Unity 4.1.2f1).

La leçon de [`35-monde.md`](35-monde.md) se prolonge d'un cran. Elle disait :
*avant de conclure qu'une chose manque au build, vérifier qu'on la lit*. Puis
[`37-corrections.md`](37-corrections.md) : *avant de conclure qu'on la lit, la
mesurer*. Ici : **avant de conclure qu'on la joue, la jouer**. Les trois
systèmes passaient leurs tests. Aucun ne fonctionnait.

## 1. Le Conservateur était muet, et c'est le décollage qui tombait

### Ce qu'on voyait

14 conversations dans la scène, 13 reliées à un arbre de dialogue. La treizième
manquante, on l'avait notée comme une donnée absente du build. C'est le
**Conservateur** — et c'est le seul personnage qui accorde les codes de
lancement.

### Ce que dit le build

Le `_activeDialogueTree` de sa `Conversation` est bel et bien nul. Ce n'est pas
un oubli : l'arbre est posé **à l'exécution**, par le composant voisin. L'IL de
`CuratorConvoController` le dit en trois méthodes :

| méthode | ce qu'elle fait |
|---|---|
| `Awake` | `_conversation = GetComponent<Conversation>()`, s'abonne aux deux événements |
| `OnStartConversation` | `SetDialogueTree(_hasGivenLaunchCodes ? _goodLuck : _preFlightObservations)` |
| `OnEndConversation` | si les codes n'ont pas été donnés : `PlayerData.LearnLaunchCodes()` |
| `OnStartOfTimeLoop` | `_hasGivenLaunchCodes = false` |

Le contrôleur porte ses deux arbres en référence directe, résolue :
`_preFlightObservations` et `_goodLuck`.

### Les deux défauts

**Le premier.** `DialogueSystem.nearest()` faisait `if (!c.tree) continue;` : une
conversation sans arbre *dans la scène* était invisible. Le Conservateur
n'existait pas pour le joueur, donc les codes ne s'obtenaient jamais, donc le
vaisseau ne s'ouvrait pas. **Un pointeur nul fermait deux des trois portes.**

**Le second, plus insidieux.** Le portage retrouvait le contrôleur d'une
conversation **par son nom** :

```js
controllers.find((c) => c.name && c.name === convo.name)
```

Or **13 des 14 zones de conversation du build s'appellent toutes
`ConversationZone`**. Le premier trouvé gagnait. Les règles testaient ensuite un
motif (`/coach/i`) contre la *classe* du contrôleur retenu — si bien que le
Conservateur héritait des arbres du formateur. Le lien n'était pas
approximatif : il était faux.

### Ce qui a été fait

Le lien se fait maintenant **par GameObject**, et c'est le seul exact :
`Awake` appelle `GetComponent<Conversation>()`, donc le contrôleur et la
conversation sont sur le même objet. L'extracteur pose `convo.controller`
(classe + arbres résolus) ; il n'y a plus rien à rapprocher à l'exécution.

Les règles d'échange d'arbre sont désormais la transcription des méthodes
lues, indexées par **classe** de contrôleur :

| contrôleur | règle, lue dans l'IL |
|---|---|
| `CoachConvoController` | `!HasCompletedTraining` → `_beforeTraining` ; sinon `KnowsLaunchCodes ? _afterTrainingWithCodes : _afterTrainingWithoutCodes` |
| `CuratorConvoController` | déjà parlé cette boucle ? `_goodLuck` : `_preFlightObservations` |
| `RocketScientistConvoController` | `_bigDay`, puis `_secondConvo` une fois la conversation finie |
| `RocketKidConvoController` | `_crashCount >= 5` → `_tooManyCrashes` ; `_landCount > 0` → `_successfulLanding` ; sinon `_introduction` |
| `SecondLoopConvoTrigger` | sort si `GetLoopCount() < 2` ; sinon démarre sur `_2ndLoop` et pose `_farewell` pour la suite |

Le vaisseau miniature n'étant pas porté, `_crashCount` et `_landCount` restent à
zéro : la règle est écrite juste, elle ne se déclenche simplement pas.

**Mesuré après correction : 14 conversations sur 14 sont joignables.**

## 2. Les codes étaient donnés au mauvais moment, et par le mauvais personnage

Deux erreurs dans une seule ligne :

```js
if (/curator|scientist/i.test(convo.character || convo.name || "")) {
  if (pdata.learn("knowsLaunchCodes")) …
}
```

- **Le moment.** C'est `OnEndConversation` qui accorde les codes, pas
  `OnStartConversation`. Le portage les donnait à l'ouverture — sans avoir
  écouté.
- **Qui.** Le motif attrapait aussi le *Rocket Scientist*, qui ne les donne pas.

La connaissance passe maintenant par un événement de fin (`dialogue.onEnd`), et
seule la **classe** du contrôleur décide. Le `LaunchTerminal` du jeu ne fait
qu'écouter l'événement pour se déverrouiller : c'est bien la connaissance qui
ouvre le vaisseau.

L'état de boucle (`_hasGivenLaunchCodes`, `_triggerSecondConvo`) vit à part de
`PlayerData` et se remet à zéro au redémarrage, comme dans le build : **le monde
oublie, la connaissance non.**

## 3. Le son : deux défauts superposés

### 3.1 Un clip sur deux était nommé à tort

L'extension venait de `m_Format` :

```js
return format === 1 ? ".wav" : ".ogg";
```

`m_Format` ne dit **rien** du conteneur. Mesure sur les 142 `AudioClip` du
build :

| `m_Format` | `m_Type` | octets de tête | n |
|---|---|---|---|
| 2 | 14 | `OggS` | 28 |
| 2 | 20 | `RIFF` | 109 |
| 3 | 20 | `RIFF` | 4 |
| 2 | 2 | `FORM` | 1 |

`m_Format` est un `FMOD_SOUND_FORMAT` — la profondeur des échantillons, 2 pour
du 16 bits, 3 pour du 24. Il vaut 2 pour de l'Ogg, du WAV **et** de l'AIFF. Le
conteneur est dans **`m_Type`**, qui est l'`AudioType` d'Unity : `2` = AIFF,
`14` = Ogg Vorbis, `20` = WAV.

Sur les 36 clips exportés, **20 partaient donc en `.ogg` sans en être**. Trois
conséquences, toutes réelles :

1. le Service Worker déduit le `Content-Type` de l'extension : il annonçait
   `audio/ogg` pour du RIFF ;
2. le réencodage Opus du worker filtre sur `/\.wav$/` — **aucun fichier n'était
   jamais nommé `.wav`**, la passe ne s'exécutait donc jamais. Les « 15 Mo de
   WAV » que [`27-poids.md`](27-poids.md) voulait économiser ne l'étaient pas,
   et cela figurait encore comme un gain « pas encore mesuré » ;
3. un clip est un **AIFF**, qu'aucun navigateur ne décode.

Le nom vient maintenant des **octets de tête**, `m_Type` ne servant que s'ils
sont illisibles. Les octets ne mentent pas ; une énumération se fait confiance.

### 3.2 L'AIFF, converti sans perte

Celui du build est du PCM entier non compressé, 2 canaux, 16 bits, 44,1 kHz,
9,5 s. Seul **l'ordre des octets** le sépare d'un WAV. `aiffToWav()` recopie les
échantillons en les retournant et n'y touche pas autrement — vérifié : le signal
reconverti garde ses crêtes à ±0,91 et un écart moyen entre échantillons voisins
de 0,009, soit 6 % de son amplitude. Un ordre inversé donnerait du bruit.

Le taux d'échantillonnage d'un AIFF est un flottant étendu IEEE sur 80 bits,
que personne n'écrit ailleurs et qu'aucune API du navigateur ne lit : il se
décode à la main (`extended80`).

**Résultat : 16 Ogg + 20 WAV, et plus une seule extension qui mente.**

### 3.3 Et surtout : la musique ne repartait jamais

Le plus court des trois défauts, et le plus exactement sur la cible. Le
navigateur interdit le son avant le premier geste de l'utilisateur. Le champ
audio crée ses sources à la distance, puis les joue — mais les deux moitiés ne
posaient pas la même condition :

```js
_spawn : if (this.unlocked && (s.playOnAwake || LOOPED.has(s.track))) …
unlock : if (snd && this.sources[i].playOnAwake) …
```

Une source créée **avant** le premier clic ne repartait donc que si elle était
`playOnAwake`. Or les **cinq sources de piste `Music` du build sont toutes à
`playOnAwake` faux**, toutes en portée 500, donc toutes créées dès la première
image au village — et définitivement silencieuses.

Les 45 ambiances sur 49 qui sont `playOnAwake`, elles, jouaient : d'où un jeu
qui « avait du son » et « n'avait pas de musique ». La condition est maintenant
posée une seule fois, dans `_shouldPlay`.

## Ce que le build fait de sa musique

Relevé au passage, pour la suite — la musique de l'alpha est entièrement
événementielle, aucune piste n'est en `playOnAwake` :

| contrôleur | ce qui la déclenche |
|---|---|
| `TravelMusicController` | le joueur est dans le vide (`OnEnterTheVoid`) et pas au poste de pilotage |
| `ShipOnlyMusicVolume` | le joueur est dans le volume **et** dans le vaisseau |
| `EndOfTimeMusicController` | `TimeLoop.GetSecondsRemaining()`, puis `MixEndTimes` et fondu |

Le portage les joue à la proximité de leur source, ce qui en approche le
résultat sans en être la mécanique : les volumes déclencheurs restent à porter.

## La chaîne, jouée de bout en bout

Simulation sur le build, dans l'ordre où un joueur la parcourt :

| étape | mesure |
|---|---|
| le Conservateur est vu à portée | oui *(il ne l'était pas)* |
| arbre proposé à la première visite | `PreFlightObservations` |
| conversation menée à son terme | 3 interactions |
| codes de lancement appris | à la **fin**, pas à l'ouverture |
| arbre à la seconde visite, même boucle | `GoodLuck` |
| embarquement sans les codes | refusé |
| embarquement avec les codes | accordé |
| vaisseau au repos, 5 s | se pose à 256 u du centre (surface 250 + coque 6) |
| poussée verticale, 10 s | 256 → 2 133 u, 422 u/s |

## Invariants gardés

Sous Node, sans le build (`tests/09-jeu.mjs`) : reconnaissance des conteneurs,
conversion AIFF→WAV à l'échantillon près, flottant étendu 80 bits, condition de
lecture au déverrouillage, les cinq règles d'échange d'arbre, la conversation
sans arbre qui reste joignable, l'événement de fin qui part une fois.

Avec le build (`tests/05-extract.mjs`) : aucune extension ne ment sur son
contenu, 16 Ogg et 20 WAV, plus aucun AIFF, 14 conversations dont 13 liées et
4 à contrôleur, 14 joignables, et le Conservateur avec son arbre nul et ses
deux arbres de contrôleur.
