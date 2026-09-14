# La chaleur qui n'existait pas — et la fin de la liste

`lois.mjs` comptait 6 lois sans appelant après [`74`](74-etalons.md). Il en
compte **zéro**. Et la dernière tournée en a trouvé une mécanique morte depuis
le jour où elle a été écrite.

## La guimauve ne chauffait jamais

```js
export function heatSources(gameplay) {
  for (const [cls, list] of Object.entries(gameplay.placed || {})) {
    if (!/heat/i.test(cls)) continue;    // ← aucune classe ne passe ici
    …
```

**Il n'y a aucune classe dont le nom contient « heat » dans ce build.** Pas de
`HeatSource`, pas de `HeatVolume` — rien. La fonction rendait une liste **vide**,
`heatAt` rendait toujours zéro, et la guimauve ne cuisait pas.

[`67`](67-annonces.md) a bâti le soin du jeu par-dessus — *manger une guimauve
rend toute la santé* — sans que rien ne le signale. Les contrôles posaient
`toast` à la main pour tester la règle qui les intéressait, et c'est
précisément ce qui a laissé le trou ouvert : **on ne teste pas ce qu'on
suppose acquis.**

> Le motif `/heat/i` était une question posée au build. Le build a répondu
> « rien », et personne n'a lu la réponse.

## Où la chaleur est vraiment

Elle est nommée, et elle est ailleurs : **neuf `RadiationEmitter`**, dont huit
de `radiationType` 1.

| | |
|---|---|
| magnitude | **100** partout |
| courbe | 1 à **dix** unités, 0 à **quarante-cinq** |
| collider | une sphère de **2,36** |
| où | la lune, Timber Hearth ×2, la première jumelle, Zen Island, Brittle Hollow ×2, l'astéroïde en beignet |

Ce sont les huit feux de camp. Le neuvième, `radiationType` 0, est **l'étoile** :
une sphère de 30 000 unités, décroissance simple, et un plancher de 10 % en
surface.

> **Le collider de 2,36 n'est pas la portée.** C'est la forme du feu. La portée
> est dans la courbe, et elle va à quarante-cinq unités. Le portage prenait
> l'un pour l'autre — ce qui, même si le motif avait trouvé quelque chose,
> aurait fait une chaleur qui s'arrête à deux mètres.

## L'invite de sonde ne s'affiche pas partout

Les quatre `ProbePromptTrigger` sont posés sur la première jumelle, et chacun
porte une **direction de regard** :

```
Update:  invite cachée, puis remontrée SI
         Angle(caméra.forward, transform.TransformDirection(_localGazeDirection))
           < _minGazeAngle
```

L'invite ne vient pas parce qu'on **est** là, mais parce qu'on **regarde**
quelque part — le fond du canyon, le camp vu d'en haut. Le portage l'affichait
en permanence, ce qui est la même chose que ne rien dire.

L'angle se compare tel quel, et non à sa moitié : ce n'est pas un cône de vue
comme `_viewingWindow`, c'est un **écart maximal**. À quarante-cinq degrés, la
fenêtre fait donc quatre-vingt-dix de large.

## La sonde ancienne part, et rien ne l'arrête

`AncientProbeController.FixedUpdate` tient en une ligne :

```
_probeBody.AddLocalAcceleration(forward × 50)
```

Elle ne vise rien, ne s'arrête pas, n'a pas de carburant. Une seule instance,
posée près de Giant's Deep et tournée vers l'extérieur du système — et
l'extracteur ne la collectait pas.

## Cinq secondes, pas une

`SelfDestruct` porte dix délais, tous sur des préfabriqués :

```
DistantStarsExplosion 8   DistantSupernova 5   Splash_* 5
RockBreakawayAudio 3      Explosion_Fiery_Small 3
Explosion_Debris_Med 2    Geyser_Fiery_Med 2   Explosion_Fiery_Med 1
```

Le portage faisait briller ses étoiles lointaines **une** seconde, en le disant
honnêtement : « on garde le geste, faute d'avoir la valeur ». La valeur était
dans `data/prefabs.json` depuis [`60`](60-sonde.md) — **cinq** secondes — et
rien ne lisait ce fichier.

## Et la réglette de zoom

`TelescopeGUI` pose une flèche sur une réglette dont la hauteur dit le champ
courant. Le portage montrait la lunette et son onde, et pas où l'on en était du
zoom.

## Ce qui est gardé

| | |
|---|---|
| sans le build | **1 600** vérifications (+22) |
| sur le build | **385** vérifications (+14) |
| en navigateur, avec le build | **233** contrôles (+5) |
| en navigateur, sans le build | 13 contrôles |
| **lois sans appelant** | **6 → 0** |

## La leçon

> Une fonction qui pose une question au build doit **lire la réponse**.

`heatSources` demandait « quelles classes s'appellent *heat* ? ». La réponse
était « aucune », depuis toujours, et la fonction la rendait sous la forme
la plus discrète qui soit : une liste vide, qui ne lève rien, ne se plaint pas,
et donne zéro à qui l'interroge.

C'est la forme la plus difficile à voir de toutes celles que ce dépôt a
rencontrées — plus que le commentaire-qui-lit ([`47`](47-effets-image.md)), plus
que l'import-qui-n'appelle-pas ([`71`](71-quantique.md)). Celles-là mentaient
sur ce qui tournait ; **celle-ci tournait vraiment, et ne trouvait rien.**
