# Audio spatial

`tools/10_audio.py` exporte les clips et la carte des sources placées :
**92 sources**, **31 clips** (35 Mo). `web/src/audio.js` les joue en spatial.

## Où vit l'information

Le clip est sur le composant Unity natif `AudioSource` (`m_audioClip`), pas sur
le `OWAudioSource` du jeu — c'est ce dernier qui porte la piste de mixage.
L'outil croise les deux via leur `GameObject`.

`AudioMixer.TrackName` est un champ de bits :

| piste | valeur | sources |
|---|---|---|
| Ambience | 4 | 45 |
| Undefined | 0 | 29 |
| Signal | 16 | 11 |
| Music | 2 | 5 |
| Default | 1 | 1 |
| EndTimes | 8 | 1 |

Sur 159 `AudioSource` dans la scène, **97 portent un clip** ; 92 ont pu être
exportées.

## Le piège qui coûte le plus cher

Depuis Babylon 8, **le moteur audio hérité n'est plus créé par le moteur de
rendu**. `BABYLON.Engine.audioEngine` est simplement absent — y compris en
passant `audioEngine: true` aux options du moteur, qui ne le ressuscite pas.

Et `BABYLON.Sound` existe toujours. On peut donc instancier des dizaines de
sources, sans la moindre erreur en console, et **aucun fichier n'est
téléchargé**. Le symptôme observé : 6 sources « vivantes », une seule requête
HTTP, celle du manifeste. Rien ne signale la panne.

Le diagnostic est venu d'une sonde sur l'état du moteur, pas de la console :

```
audioEngineExiste: false     AudioContextNatif: true     SoundExiste: true
```

La bonne API en 9.25 est **AudioEngineV2** : `CreateAudioEngineAsync`,
`CreateSoundAsync`, `engine.unlockAsync()`, et la spatialisation sur
`sound.spatial.position`.

## Portées d'atténuation

### Correction : elles sont dans le build, et le pipeline navigateur les lit

Cette page affirmait qu'« UnityPy n'expose ni `m_MinDistance` ni
`m_MaxDistance` sur Unity 4 », d'où des portées **choisies par piste** —
300 u pour Signal, 150 pour Ambience, 60 sinon. La cause était juste, la
conclusion ne l'est plus : en 4.1 le champ s'appelle **`MinDistance`, sans
préfixe `m_`**. C'est UnityPy qui ne le trouvait pas ; le type tree de
`unity41-types.json`, que le pipeline navigateur lit directement, le porte noir
sur blanc, avec `MaxDistance`, `rolloffMode`, `Pan2D` et `DopplerLevel`.

Sont donc lus, par source :

| champ | ce qu'il donne au moteur |
|---|---|
| `MinDistance` | rayon intérieur, à plein volume |
| `MaxDistance` | portée, `spatialMaxDistance` |
| `rolloffMode` | modèle d'atténuation — `Logarithmic` devient `inverse` en WebAudio |
| `Pan2D` | à 1, la source n'est pas spatialisée : on n'a plus à le deviner |
| `DopplerLevel`, `Loop` | relevés, pour ce qui viendra |

Les valeurs par piste ne servent plus que de **repli**, et
`tests/05-extract.mjs` échoue si une seule source y tombe. Voir
[`35-monde.md`](35-monde.md) §2.

### Correction : les émetteurs ne sont pas des sources spatiales

J'avais écrit ici que « les 9 `AudioTransmitter` portent leurs vrais rayons, qui
priment », en unités de monde. **C'est faux.** `_hotspotRadius` et
`_falloffRadius` sont des distances **en pixels à l'écran**, mesurées à travers
la lunette :

```
d = distance en pixels entre le centre de l'écran et le point projeté
s = clamp01(1 − (d − hotspot) / (falloff − hotspot))²
panLevel = 1 − s              la source cesse d'être spatialisée
telescope.AddSignalStrength(s)
```

Autrement dit : **un signal se trouve en visant à la lunette**. Plus on le
cadre, plus il devient présent — jusqu'à cesser d'être spatialisé, c'est-à-dire
à jouer « dans la tête » — et le volume de la lunette elle-même est la **somme**
des forces de tous les émetteurs visés (`Telescope.Update` fait
`audio.volume = _signalStrength`, remis à zéro à chaque image).

Ce n'est donc pas une atténuation mais une **mécanique de jeu entière**, et les
neuf émetteurs sont les instruments des voyageurs :

| émetteur | point chaud | coupure |
|---|---|---|
| `HarmonicaSignal` | 20 px | 400 px |
| `PipeSignal`, `DrumSignal`, `BanjoSignal`, `QuantumSignal` | 20 px | 300 px |
| `RadioSignal`, `BoilingSound` | 1 px | 100 px |
| `QuantumSignal` (×2) | 1 px | 50 px |

Harmonica, banjo, tambour, flûte — ce que le jeu final fera chercher d'un bout à
l'autre du système était déjà là. Mesuré dans le portage : force 1 dans le point
chaud, **0,287 à mi-chemin** (décroissance quadratique), 0 au rayon de coupure.

## Le mixage par piste

`AudioMixer` tient **six pistes** — `Undefined`, `Default`, `Music`, `Ambience`,
`EndTimes`, `Signal`, `Death` — chacune avec son volume et ses fondus linéaires
(`AudioTrack.FadeTo`). Deux mélanges sont nommés dans le code :

- `MixEndTimes` fait tomber **musique et ambiance à zéro** quand la supernova
  arrive, laissant la piste de fin ;
- `MixDeath` **isole** la piste de mort en coupant toutes les autres.

Les deux sont portés et déclenchés par la boucle. Vérifié : la musique descend
de 0,75 à 0 en deux secondes pendant que la piste des signaux reste à 1.

## Ce qui reste

- ~~**La coupure passe-bas** des émetteurs~~ — **portée**. Babylon ne publie pas
  de filtre, mais son graphe est fait de vrais nœuds WebAudio : le dernier de la
  chaîne d'une source est un `GainNode` relié au bus de sortie, et on s'intercale
  entre les deux. La manœuvre est défensive de bout en bout — le filtre n'est
  branché sur la destination qu'**avant** de couper l'arête existante, et le
  moindre accroc annule tout. Une version de Babylon qui changerait sa structure
  interne ferait perdre le filtre, jamais le son.

  Ce qui vient du build : le filtre et sa valeur de 1 000 Hz. Ce qui n'en vient
  pas : la façon dont il s'ouvre. Le rapprochement avec `panLevel`, qui suit
  `1 − force`, dit que le signal se dégage à mesure qu'on le cadre ; la
  progression retenue est **géométrique**, parce qu'une octave se parcourt en
  multipliant — 1 000 Hz sans viser, 4 472 Hz à mi-course, la bande entière une
  fois le signal centré.

  Vérifié dans un vrai navigateur, sur un WAV fabriqué : le nœud inséré est bien
  un `lowpass`, il passe de 1 000 à 20 000 Hz selon la force du signal, et il est
  détaché avec la source. Le `_lowPassCutoff` de chaque émetteur est lu depuis la
  source elle-même — l'extracteur le pose déjà sur elle — et non pris comme une
  constante.
- ~~**15 Mo de WAV non compressés**~~ — réencodés en Opus à l'extraction
  (WebCodecs), avec repli WAV : voir [`27-poids.md`](27-poids.md) et
  [`35-monde.md`](35-monde.md) §9. Le gain reste à mesurer sur un build.
- **L'équilibrage des volumes** demande une écoute humaine — mais elle portera
  désormais sur les portées du jeu, non sur des valeurs choisies par piste.
- **Le bruit des prédateurs** vient maintenant de ce champ audio : les sources
  qui jouent vraiment attirent les anglerfish ([`16-bramble.md`](16-bramble.md)).

## Instanciation à la volée

Créer 92 sources d'un coup n'aurait aucun intérêt. Une source n'est créée que
lorsque l'auditeur entre dans sa portée (avec 40 % de marge) et libérée en
sortant. Mesuré au sol sur Timber Hearth : **6 sources instanciées, 5 en
lecture, 0 échec, 11 clips téléchargés**.

## Limite de vérification

Le conteneur n'a pas de périphérique audio. Ce qui est vérifié : le moteur
s'initialise, les fichiers sont téléchargés en HTTP 200, les sons passent à
l'état « lecture » et sont positionnés dans le repère courant. Ce qui ne l'est
pas : le rendu sonore réel, ni l'équilibrage des volumes. Cela demande une
écoute humaine.
