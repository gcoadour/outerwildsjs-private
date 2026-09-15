# Le soleil au travers des planètes — un groupe de rendu qui n'est pas un calque

Le symptôme tenait en une phrase : **le soleil est visible au travers des
planètes, en transparence**. Pas un scintillement, pas un bord qui bave — la
planète est bien là, opaque, et l'orange de l'étoile se pose par-dessus.

Il est là depuis toujours, et il se voit **dès la première image d'une boucle**.

## La fausse piste, et ce qui l'a écartée

La première ligne à lire était celle-ci, posée au-dessus de la caméra depuis le
tout premier commit :

```js
// Le monde s'etendant sur ~100 000 unites, un depth buffer logarithmique
// evite le z-fighting entre le proche et le lointain.
```

Elle décrit **du code qui n'a jamais existé** : `git log -S useLogarithmicDepth`
ne rend rien, sur toutes les branches. Un commentaire qui promet une technique
absente est un piège parfait — il fait chercher le défaut ailleurs, et il fait
croire le problème connu.

Reste que le soupçon méritait un chiffre. Plan proche à 0,05, plan lointain à
200 000, tampon de profondeur à 24 bits (mesuré : `gl.DEPTH_BITS` vaut bien 24,
WebGL 2) : la profondeur se résout à

```
Δz ≈ z² × (1/n − 1/f) / 2²⁴  ≈  1,2·10⁻⁶ × z²
```

soit **120 unités à 10 000** et **750 à 25 000**. Or le corps le plus proche de
l'étoile — Timber Hearth, à 8 593 — laisse **6 600 unités** entre lui et la
surface solaire (rayon 2 000). Pour que les deux tombent dans le même cran de
profondeur il faudrait regarder le système depuis **74 000 unités**, et la
planète y ferait un pixel. **Ce n'est pas la profondeur.** Le commentaire ne
manquait de rien ; il parlait d'un problème qui ne se pose pas.

## Ce que c'était

Babylon **efface le tampon de profondeur devant chaque groupe de rendu non
vide**. Ce n'est pas un réglage qu'on aurait posé quelque part :
`RenderingManager.AUTOCLEAR` vaut vrai, et les quatre groupes partent avec
`{autoClear: true, depth: true, stencil: true}`. Mesuré dans la page :

```
scene.getAutoClearDepthStencilSetup(1)  ->  {autoClear:true, depth:true, stencil:true}
```

Donc `renderingGroupId = 1` ne veut pas dire « après l'opaque ». Il veut dire
**« par-dessus tout, quoi qu'il y ait devant »**. Le portage y avait posé quatre
coques, toutes pour la même raison — passer après l'opaque — et toutes les
quatre traversaient ce qui les occultait :

| coque | où | ce qu'elle traversait |
|---|---|---|
| couronne de l'étoile | `supernova.js` | tout le système |
| onde de choc | `supernova.js` | idem, pendant l'explosion |
| coques atmosphériques | `materials.js` | les corps et le vaisseau |
| coque quantique | `main.js` | la cabine, les mains |

Et la couronne n'attend pas la fin des temps. `SunCoronaProgressBehavior` part à
**0,12 d'alpha** et non à zéro (`corona.alpha = 0.12 + frac × 0.45 + flash ×
0.4`), au-dessus du seuil de 0,02 qui décide du montage : elle est donc bâtie
**au démarrage**, large de 1,18 rayon solaire, additive, sans écriture de
profondeur et sans élimination des faces arrière. Une planète placée entre
l'œil et l'étoile recevait le soleil par-dessus elle.

## La mesure

Caméra sur l'axe étoile–planète, 800 unités au-delà de la planète, tournée vers
l'étoile : la planète occulte l'étoile entièrement. Au centre du disque :

| | centre du disque | couronne juste à côté |
|---|---|---|
| tel quel | **(69, 40, 19)** — l'orange de la couronne | (67, 39, 25) |
| sans l'effacement de profondeur | **(7, 6, 7)** — la nuit de la planète | (67, 39, 25) |
| couronne éteinte (référence) | (7, 6, 7) | (5, 5, 13) — le ciel |

La deuxième ligne rend **exactement** la troisième au centre, et garde la
couronne à côté : l'éclipse est complète, et la couronne n'a pas été perdue en
route.

## Le correctif

Une ligne, à la création de la scène :

```js
scene.setRenderingAutoClearDepthStencil(1, false);
```

On garde le groupe, qui dit bien l'ordre voulu, et on lui retire le seul
effacement dont personne ne voulait. Rien d'autre ne change : le mélange alpha
suffit déjà à faire passer ces coques après l'opaque — c'est la file
transparente du groupe qui s'en charge, et elle, elle teste la profondeur.

Les trois autres coques y gagnent la même chose, pour le même prix : une
atmosphère ne brille plus au travers du corps qui la cache, et la coque
quantique ferme la vue au-delà de ses trente unités au lieu de tout effacer, y
compris la cabine.

## L'invariant

Sous Node, rien ne peut voir cela : il faut un vrai tampon de profondeur. Le
contrôle vit donc dans `tools/15_verify.py`, dans le mode `--repli`, qui tourne
**sans le build** — le système de substitution a une étoile et une planète, ce
qui suffit à monter l'éclipse.

Deux pixels, pas un. Le centre du disque occulté doit rester noir, **et** la
couronne à côté doit rester visible : éteindre la couronne ferait passer le
premier contrôle tout seul, et un invariant qui se laisse satisfaire en
supprimant la chose qu'il garde ne garde rien
([`docs/49`](49-queue.md)).

Le contrôle prend la main sur la caméra et arrête la boucle de rendu : il vient
en dernier.
