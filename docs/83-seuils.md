# Les seuils : ce qui compte n'est pas d'être dedans, c'est d'y être entré

Tous les volumes de ce portage répondent à la même question — *ce point est-il
dans cette forme ?* `EntrywayTrigger` n'y répond pas. C'est une boîte posée dans
une **porte**, et elle ne regarde pas où l'on est mais dans quel sens on l'a
traversée.

```
IsOutsideEntryway(c) = Dot(_localExitDirection,
                          InverseTransformDirection(c.position - self.position)) > 0

OnTriggerEnter : on retient de quel côté on était en abordant la boîte.
OnTriggerExit  : on regarde de quel côté on en sort.
                 dehors -> dedans  =  OnEntry
                 dedans -> dehors  =  OnExit
                 même côté         =  RIEN
```

Faire demi-tour dans l'embrasure ne compte donc pas, et c'est tout l'intérêt :
**une grotte n'a pas de forme, elle a des portes.** Les quatre entrées de
`CaveVolume01` — la tour, le quantique, la cité, la capsule — sont quatre boîtes
de quelques mètres pour un réseau de galeries qu'aucune sphère ne décrirait.
`_initialOccupants` ferme la boucle : ce qui commence dedans reçoit son `OnEntry`
au démarrage, sans avoir rien traversé.

## Deux classes qu'on prenait pour une

Le portage lisait `DarkZone` et s'en servait comme zone sans soleil. Ce sont deux
classes distinctes, pour deux auditeurs distincts :

| | émet | écouté par |
|---|---|---|
| `SunlessZone` | `EnterSunlessZone` / `ExitSunlessZone` | `AmbientLightManager` |
| `DarkZone` | `EnterDarkZone` / `ExitDarkZone` | `Flashlight` |

Il y a **une** `DarkZone` dans la scène, posée sur un déclencheur d'invite de
lampe, et **cinq** `SunlessZone` :

| zone | corps | forme |
|---|---|---|
| `CaveVolume01` | Twin01 | 4 portes (tour, quantique, cité, capsule) |
| `CaveVolume02` | Twin01 | 2 portes (fossile, tranchée) |
| `CaveVolume` | Timber Hearth | 1 porte |
| `MuseumVolume` | Timber Hearth | 1 porte (le toit) |
| `CorrosiveMembrane` | Giant's Deep | une sphère de 205 |

L'ambiance globale ne s'éteignait donc **dans aucune grotte**, ni dans le musée,
ni sous la membrane de Giant's Deep. C'est la lumière qui manquait le plus
discrètement : on ne remarque pas qu'une grotte n'est pas assez sombre.

`OWEffectVolume.Awake` prend ses `EntrywayTrigger` par
`GetComponentsInChildren` : **le lien est dans la hiérarchie, pas dans un
champ**. L'extraction n'émettait aucune information de parenté ; elle émet
désormais la chaîne d'ancêtres pour cette classe, et c'est ce qui permet de dire
que `TowerEntryway` garde `CaveVolume01` et non le volume musical de la cité
enterrée, qui est sur le même corps.

Sur les dix-huit seuils de la scène, huit servent les zones sans soleil. Les dix
autres gardent la musique de la cité enterrée (×5), la zone sombre elle-même, la
chambre en apesanteur, la station météo (×2) et la trappe du vaisseau : autant
de mécaniques qui ont la même forme.

## Un compte, pas un booléen

`AmbientLightManager._sunlessZoneCount` s'incrémente et se décrémente. Rien
n'interdit à deux zones de se recouvrir, ni à une même zone d'être abordée par
deux portes ; un booléen clignoterait au chevauchement. C'est la deuxième fois
que ce dépôt rencontre ce motif, après `_sandstormCount`
([`docs/72`](72-poussiere.md)) — et c'est la même leçon : **le build compte là
où le portage testait**.

## La couleur qu'on lisait comme un nombre

`_ambientLight` n'est pas une intensité : c'est une énumération à trois valeurs,
que `MajorSector.Awake` convertit en couleur.

```
0  ->  Color.black
1  ->  ColorHSV(240, .2353, .0588)    un bleu de nuit
2  ->  ColorHSV(135, .2353, .0588)    un vert
```

Les deux teintes ont exactement la même saturation et la même valeur : ce n'est
pas une intensité déguisée, c'est un choix de couleur. Quatre secteurs sont en
bleu de nuit (Timber Hearth, Brittle Hollow, les deux jumelles), **un seul** est
vert — Giant's Deep — et cinq sont noirs : la comète, la lune, Dark Bramble,
l'épave, la lune quantique.

Et c'est là que les deux champs doivent se lire ensemble : **Dark Bramble porte
la plus grande portée d'ambiance du système, 1 200, pour la couleur noire.**
Lire `_ambientLightRange` seul donnait un secteur généreusement éclairé ; lire
`_ambientLight` avec lui donne le noir absolu sur 1 200 unités, ce qui est
exactement ce qu'on attend d'un buisson d'épines.

## Une zone sombre qui était un seuil elle aussi

L'unique `DarkZone` est posée **sur** un `FlashlightPromptTrigger`, c'est-à-dire
sur le même GameObject que son `EntrywayTrigger` — `GetComponentsInChildren`
inclut le composant porté par l'objet lui-même. Le portage la testait par
contenance dans une boîte de 11,47 : on n'y était « dedans » que le temps de
franchir l'embrasure, et l'invite de lampe clignotait au passage au lieu de
rester allumée tant qu'on est dans la grotte. Elle se compte maintenant comme
les autres.

Ce qui a fait tomber l'autre moitié de `signalVolumes` : le **brouillage**. La
scène pose un `InterferenceVolume` (force 1, sur le volume musical de la cité
enterrée), mais `InterferenceDetector` n'a **aucune** instance et son
`GetInterference` n'est appelé par personne dans l'assembly. La mécanique est
inerte dans cette alpha ; il n'y a rien à brancher. Le volume reste extrait, et
`recensement.mjs` le compte désormais parmi les classes extraites que rien ne
lit — ce qui est la vérité, là où une lecture de façade la cachait.

## Ce que le portage fait maintenant

- `entryways.js` tient les seuils, leur sens de traversée et le compte des zones
  sans soleil ; l'ambiance globale s'éteint en entrant dans une grotte et se
  rallume en en sortant, pas avant.
- La teinte du secteur actif est posée sur la lumière hémisphérique, normalisée
  à sa composante la plus forte : le moteur porte une intensité à lui, et la
  teinte du build par-dessus.
- `ambientIntensity` rend le repli dès que `_ambientLight` vaut 0, quelle que
  soit la portée.

## Gardé par

- `tests/09-jeu.mjs` — le produit scalaire du seuil, la traversée dans les deux
  sens, **le demi-tour dans l'embrasure qui ne compte pas**, le compte qui monte
  à deux et redescend à un, et `ColorHSV.ToColorRGB` sur ses cas connus.
- `tests/05-extract.mjs` — dix-huit seuils, cinq zones sans soleil contre une
  zone sombre, les huit portes réparties par la hiérarchie, et les 1 200 de
  portée noire de Dark Bramble.
- `tools/15_verify.py --profil` — cinq zones montées, huit portes suivies, une
  seule contenance ; au village il fait jour, et la lumière ambiante porte le
  bleu de nuit de Timber Hearth.
