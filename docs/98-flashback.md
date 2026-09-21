# Le flashback rejoue votre partie, et le portage l'avait déclaré absent

`docs/08-reste-a-faire.md` portait, dans la liste **« ce qui n'est pas dans le
build »** :

| manque | ce que le build en dit |
|---|---|
| les images du flashback | rien à rejouer : le jeu ne stocke pas de mémoire visuelle |

Et `web/src/death.js`, en tête de sa classe `Flashback` :

> Les images elles-mêmes n'existent pas ici : le build ne porte pas de mémoire à
> rejouer. Ce module donne leur **rythme**, et l'interface s'en sert pour faire
> battre l'écran. C'est une mise en scène, pas un contenu extrait.

C'est faux. Voici la méthode, entière :

```
Flashback.TakeSnapshot()
    RenderTexture rt = new RenderTexture(256, 256, 0);
    rt.isPowerOfTwo = true;
    rt.Create();
    _activeCamera.targetTexture = rt;
    _activeCamera.Render();
    _activeCamera.targetTexture = null;
    _snapshotRenders.Add(rt);
    _lastSnapShotTime = Time.time;
```

Et son appel, à la fin de `Flashback.Update` :

```
if (Time.time > _lastSnapShotTime + _snapshotFrequency
    && Time.timeSinceLevelLoad > 3f
    && !PlayerState.IsDead())
    TakeSnapshot();
```

`_snapshotFrequency` vaut **5**, sérialisé sur `FlashbackCamera`. Le jeu
photographie donc la partie en train de se jouer, 256 par 256, toutes les cinq
secondes — et la mort rejoue ces images-là, **de la plus récente à la plus
ancienne**. C'est le flashback d'*Outer Wilds*, celui que tout le monde connaît,
et c'est la chose la plus visible que ce portage ne faisait pas.

> La quatrième fois que ce dépôt déclare absent du build quelque chose qui s'y
> trouve, et la troisième fois que la ligne était dans
> [`08`](08-reste-a-faire.md) §1 ([`45`](45-recensement-mesure.md),
> [`49`](49-queue.md), [`60`](60-sonde.md)). Le point commun des quatre : la
> conclusion a été tirée d'une **absence dans la scène**, jamais d'une lecture
> de la méthode. La scène ne pose pas de « mémoire visuelle » parce qu'une
> mémoire visuelle n'est pas un objet de scène — elle se remplit à l'exécution.

## D'où venaient les « vingt-deux images »

Ce n'était pas une invention : c'est un nombre juste qui répondait à une autre
question. `OnTriggerFlashback` calcule les durées ainsi :

```
_totalFlashbackDuration = 0;
_imageDisplayTimes = new float[_snapshotRenders.Count];
for (i = 0; i < _snapshotRenders.Count; i++) {
    _totalFlashbackDuration += Mathf.Max(0.6f * Mathf.Pow(0.9f, i), 0.06f);
    _imageDisplayTimes[_snapshotRenders.Count - 1 - i] = _totalFlashbackDuration;
}
_totalFlashbackDuration += 0.8f;
```

`0,6 × 0,9ⁿ` reste au-dessus de `0,06` pour n allant de 0 à 21. **Vingt-deux est
le rang où la durée d'image touche son plancher** — pas le nombre d'images. Le
portage avait lu la bonne formule et en avait tiré la mauvaise grandeur.

Le nombre d'images, lui, est le temps qu'on a survécu divisé par cinq :

| on meurt à | photos | défilement | de la mort au redémarrage |
|---|---|---|---|
| 8 s | 1 | 0,60 s | 5,40 s |
| 2 min | 24 | 5,53 s | 10,33 s |
| 9 min | 108 | 10,57 s | 15,37 s |
| 17 min 50 | 214 | 16,93 s | 21,73 s |

**Mourir tard donne un long flashback.** C'est une conséquence du mécanisme, pas
un réglage, et c'est ce qui fait qu'une mort à la dix-septième minute pèse
autrement qu'une mort à la deuxième.

Notez aussi l'indexation : `_imageDisplayTimes[count - 1 - i]`. La borne du
**rang** `i` est rangée à l'index de la **photo**. `_flashbackIndex` part de
`count - 1` — la dernière photo prise — et descend tant que
`time > start + times[index - 1]`. On remonte le temps, de plus en plus vite.

## La séquence entière, et les deux secondes qui manquaient

Le portage jouait 2 s d'attente, le défilement, 0,8 s de fondu — 8,21 s en tout.
Le build en compte deux de plus, à deux endroits différents :

```
0                 TriggerFlashback : les durées sont calculées, l'index part
                  de la dernière photo, le plan est encore invisible
+2 s              StartFlashback (FLASHBACK_START_DELAY)
+1 s de plus      le plan apparaît, _flashbackStartTime part
... totale        les photos défilent à rebours
les 0,8 s finales _finalImage remplace la photo, le flou monte de 2 à 32
                  FinishFlashback
+1 s              RestartTimeLoop
```

La seconde d'amorce et la seconde finale sont écrites dans deux conditions
distinctes de `Update` (`_primeFlashbackTime + 2 + 1` et
`_finishFlashbackTime + 1`), et aucune des deux n'était portée.

## Ce que l'image fait, pendant ce temps

Trois choses, toutes dans `UpdateCameraEffects` et dans `Update` :

- **Le plan avance.** `Vector3.Lerp(_initLocalPlanePos, (0, 0, 0.5), u)`, avec
  `_initLocalPlanePos` posé à `(0, 0, 12)` dans `Start`. L'image vient vers
  l'œil pendant toute la séquence.
- **Un tourbillon lent.** `_twirlEffect.angle = 7 * Mathf.Sin(Time.time * 0.5f)`
  — sept degrés d'amplitude, et il suit l'horloge du jeu, pas celle de la
  séquence : on entre dedans à l'angle où il se trouve.
- **Le flou qui efface.** `_glowEffect.blurIterations = (int)(2 + 30 * blancheur)`,
  où `blancheur` est la fraction des 0,8 s finales. Deux itérations pendant tout
  le défilement, trente-deux à la fin. Ce n'est pas un fondu au blanc : c'est une
  image qu'on floute jusqu'à la perdre.

## Comment c'est porté

Le principe est le même, avec ce qu'un navigateur a sous la main.

- Une `RenderTargetTexture` de 256 par 256, `refreshRate = 0` — Babylon ne la
  dessine jamais de lui-même. On appelle `render()` **une fois toutes les cinq
  secondes**, et pas une image de plus.
- `readPixels()` est asynchrone : on ne bloque pas l'image pour elle, et une
  photo qui n'arrive pas est une photo de moins, rien d'autre.
- WebGL rend ses lignes **de bas en haut**, `ImageData` les attend de haut en
  bas : sans le retournement, tout le flashback serait à l'envers.
- Les pixels vont dans un `OffscreenCanvas`, puis `transferToImageBitmap()`. Une
  photo pèse 256 Ko ; une boucle entière en laisse 216, soit cinquante
  mégaoctets. Le build en garde autant et sans plafond — c'est le prix du
  mécanisme, et le plafonner changerait le jeu.
- La pellicule est **vidée à chaque redémarrage de boucle** : `Flashback.Start`
  recrée `_snapshotRenders` à chaque chargement de scène, et la boucle *est* un
  rechargement de scène. Le flashback d'une boucle ne montre que cette
  boucle-là.
- Le tourbillon et le flou sont des filtres CSS. Ce ne sont pas les shaders du
  build — `TwirlEffect` déforme en spirale, `GlowEffect` fait un flou additif à
  N itérations — mais ils en portent les deux grandeurs, lues dans l'IL.

## Ce que cela branche, au passage

Le garde-fou `!PlayerState.IsDead()` est ce qui relie ce mécanisme à
[`97`](97-assise-instantanee.md) : `PlayerState._isDead` était l'un des quatre
états du build que le portage laissait à faux pour toujours. Sans lui, la
séquence de mort se photographierait elle-même et se retrouverait en tête du
flashback suivant — un flashback qui commence par le souvenir du flashback
précédent.

Et `FinalFlashbackImage` (`sharedassets1.assets:485`) entre au catalogue de
`interface.js` : le portage faisait un fondu au blanc nu, faute de l'avoir
extraite.

## La ligne qui sort de la liste

[`08-reste-a-faire.md`](08-reste-a-faire.md) §1 perd sa quatrième ligne. Il en
reste cinq, et il vaut la peine de dire pourquoi celles-là tiennent : ce sont des
**champs vides et des tableaux vides** — 20 attributs `eventbased` à `"false"`,
onze états d'animation et zéro transition, un `if (prefab != null) { }` dont le
corps est vide. Pas une méthode qu'on n'aurait pas lue.

> **La règle qui manquait**, et qui vaut pour la suite : avant d'écrire qu'une
> chose n'est pas dans le build, **lire la méthode qui la ferait**. Quatre fois
> sur quatre, la conclusion venait de ce que la scène ne posait pas — et quatre
> fois sur quatre, le mécanisme vivait à l'exécution.
