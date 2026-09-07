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

UnityPy n'expose ni `m_MinDistance` ni `m_MaxDistance` sur Unity 4. Les portées
sont donc **choisies par piste**, faute de mieux :

| piste | portée |
|---|---|
| Signal | 300 u |
| Ambience | 150 u |
| Default / Undefined | 60 u |
| Music, EndTimes, Death | non spatialisé |

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

- **La coupure passe-bas** des émetteurs (`_lowPassCutoff = 1 000 Hz`) n'est pas
  appliquée : le graphe WebAudio de Babylon n'est pas exposé assez proprement
  pour y insérer un filtre biquad sans dépendre de sa version.
- **15 Mo de WAV non compressés** : voir `docs/27-poids.md`.
- **L'équilibrage des volumes** demande une écoute humaine.

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
