# L'onde de la lunette, et deux classes qui n'en étaient pas

Le recensement, corrigé et honnête ([`64`](64-mains.md)), laissait quatorze
classes sans lecteur. Douze sont des outils de studio ou de la mise en page.
**Deux faisaient quelque chose de visible**, et cette page les prend.

## `DrawSoundWave` — un oscilloscope dans le coin de l'œil

C'est le dernier système *visible* de la scène que rien ne lisait. Tout tient
dans quatre nombres et une ligne.

| | |
|---|---|
| `_numPoints` | **500** |
| `_beginTopVertex` … `_endBottomVertex` | la boîte, de (0,4 ; 0,15) à (0,6 ; 0,25) |
| `_waveSampleClip` | `ProbeLoop` |
| `_xOffset`, `_yOffset` | 0,4 et −0,3 |

`Telescope.Update`, lunette ouverte, fait trois choses dans cet ordre :

```
audio.volume = _signalStrength          la lunette bourdonne vers un signal
_drawSoundWave.DrawPresetWave(_signalStrength)
_signalStrength = 0                     et on repart de zéro
```

`DrawPresetWave` échantillonne le clip à `Time.time % length`, et `SetPoints`
écrit **un seul point** :

```
point = (échantillon × force + 1) / 2
_points[_currentPoint--] = point
```

Trois conséquences qu'on n'aurait pas écrites soi-même :

- **force nulle ⇒ 0,5** : la ligne est plate **au milieu** de la boîte quand la
  lunette ne capte rien. C'est aussi ce que met `InitializePoints`, et c'est ce
  qui fait qu'une lunette braquée sur le vide ne montre pas une ligne au bord
  mais une ligne au centre — un oscilloscope au repos, pas un compteur à zéro ;
- **un point par image**, pas un par échantillon : le tracé avance au rythme du
  jeu, pas à celui du son. Cinq cents images de mémoire, soit une dizaine de
  secondes ;
- **le curseur descend.** Le point neuf s'écrit juste avant le précédent, et
  l'onde défile.

> La boucle de `SetPoints` est écrite pour deux échantillons et s'arrête à un
> (`blt 1` sur un tableau de deux). `DrawPresetWave` en lit deux et n'en pose
> qu'un. C'est un reste, pas une intention — et on porte le comportement, pas
> l'intention ([`58`](58-suivi.md)).

**Une liberté, nommée.** L'échantillon vient d'une sinusoïde et non de
`ProbeLoop` : le portage joue ses sons par des éléments `<audio>` et n'a pas
leurs octets sous la main. La loi — un point par image, `(échantillon × force +
1) / 2`, cinq cents points, la boîte — est celle du build ; la forme d'onde ne
l'est pas, et le commentaire le dit à l'endroit où c'est écrit.

## `TelescopeGUI` — la lunette grossit quand on desserre

Maintenant que la lunette a un corps et un verre ([`64`](64-mains.md)), sa règle
d'échelle a un sens :

```
localScale = Vector3.one × (échelle_initiale × champ / _minFOV)
```

`_minFOV` vaut **15** sur `TelescopeGUI` et **10** sur `Telescope` — deux
composants, deux valeurs, et c'est celle de l'interface qui commande l'échelle.
À soixante degrés la lunette est donc quatre fois plus grande qu'à quinze, et
elle **se rétracte à mesure qu'on resserre le zoom**. C'est le geste : on tire
l'instrument vers soi en zoomant.

La flèche du zoom sur sa réglette suit `(champ − minFOV) / maxFOV`. Le portage
n'a pas les deux images (`zoomMeter`, `zoomArrow`) sur son HUD, mais la loi est
écrite et éprouvée : le jour où la réglette sera dessinée, elle bougera juste.

## `SettingsMenuTrigger` — lue depuis toujours, jamais nommée

La deuxième des deux ne demandait pas une ligne de code.

```
si Pause enfoncée :  menu ouvert ? Close(), timeScale = 1
                     sinon         Open(),  timeScale = 0
```

Le portage fait exactement cela depuis longtemps : le canal `Pause` bascule le
menu, et le `dt` de la boucle vaut zéro tant qu'il est ouvert. La classe était
**lue sans être nommée**, et le recensement ne peut pas deviner ça — il compte
des noms. Un marqueur `@lit` dans `settings.js`, et le compte redevient juste.

> Le contraire exact de [`47`](47-effets-image.md), où un commentaire faisait
> passer pour lu ce qui ne l'était pas. Ici le code faisait, et le compte ne le
> voyait pas. Les deux erreurs sont réelles et vont en sens inverse ; seul un
> marqueur explicite les évite toutes les deux.

## Le compte

| | classes | instances |
|---|---|---|
| posées, tous fichiers | 295 | 1 451 |
| **lues** | **278** | **1 416 — 97,6 %** |
| extraites, non lues | 5 | 20 |
| sans aucun lecteur | **12** | **15** |

Les douze qui restent : `DebugBreakAllChildren` ×2, `DebugHUD`,
`DebugInputManager`, `LoadTimeTracker` ×2, `TapeMeasure`,
`ResetSimulationTrigger`, `Locator`, `Detonator`, `MinimapHUD`, `ObservatoryMap`.
Des outils de studio, un singleton de câblage, une bibliothèque d'explosion
tierce, deux mises en page que le portage fait autrement. **Aucune n'est un
système de jeu**, et cette fois la phrase est vraie sur le jeu entier et non sur
`level0` seul.

## Et le contrôle testait encore la version d'avant

`no-store` empêche Chromium de **garder** une réponse ; il n'efface pas celles
qu'il garde déjà. Un profil qui a servi à une mise au point garde donc les
modules d'alors et **ne redemande rien au serveur** — même symptôme qu'à
[`62`](62-visee.md), même message impossible : « le module ne fournit pas
d'export nommé `SoundWave` », alors que le fichier l'exporte.

Le contrôle vide maintenant le cache HTTP du profil au lancement, et lui seul :
l'extraction vit dans le stockage privé de l'origine, qui est ailleurs.

> Deux fois le même piège en trois lots. La première correction — annoncer
> `no-store` — était juste et **insuffisante**, ce qui est la pire sorte de
> correction : elle ferme le cas neuf et laisse le cas déjà là.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 265** vérifications (+17) |
| sur le build | 360 vérifications |
| en navigateur, avec le build | **146** contrôles (+6) |
| en navigateur, sans le build | 13 contrôles |
