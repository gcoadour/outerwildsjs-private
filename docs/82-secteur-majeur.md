# Le secteur majeur actif : une question, cinq réponses inventées

`SectorDetector` est le carrefour du build. La minicarte, la limite de poussée,
l'éclairage ambiant, la portée de la lampe et celle des phares du vaisseau lui
demandent tous la même chose : **dans quel secteur majeur suis-je ?** Le portage
posait cinq questions différentes, et aucune n'était celle-là.

## Ce que le build demande

Trois classes, une hiérarchie :

```
Sector
└── MajorSector          GetUseMinimap -> ldc.i4 0 ; ret
    ├── PlanetoidSector  GetUseMinimap -> ldfld _useMinimap
    └── ZeroGSector      (n'en redéfinit aucune)
```

`SectorDetector` ne calcule aucune distance de son côté : ce sont les
**déclencheurs** — un `SphereCollider` sur l'objet du secteur — qui remplissent
sa liste, par `OnTriggerEnter`. Puis :

```
CalculateActiveMajorSector : le plus proche PAR LE CENTRE, parmi ceux
                             dont on touche la sphère.
GetThrustLimit             : le MINIMUM sur TOUTE la liste, actif ou non.
GetAmbientLight            : le secteur ACTIF, et sa distance.
GetFlashlightRangeLimit    : le secteur ACTIF.
GetShiplightRangeLimit     : le secteur ACTIF.
```

Deux règles différentes pour deux usages différents : la poussée se cumule
(le minimum de tout ce qui vous contient), tout le reste suit un seul secteur.

## Les dix secteurs, mesurés

| Secteur | classe | déclencheur | horizon | poussée | lampe | phares | ambiance |
|---|---|---:|---:|---:|---:|---:|---:|
| `Sector_TH` | Planetoid | 1000 | 200 | 20 | — | — | 250 |
| `Sector_BH` | Planetoid | 1000 | 250 | 20 | — | — | 350 |
| `Sector_GD` | Planetoid | 750 | 500 | — | — | 200 | 750 |
| `Sector_HT_1` | Planetoid | 300 | 120 | **200** | — | — | 0 |
| `Sector_HT_2` | Planetoid | 300 | 120 | 20 | **20** | — | 200 |
| `Sector_Moon` | Planetoid | 167,3 | 75 | 20 | — | — | 0 |
| `Sector_N` | Planetoid | 150 | 75 | 20 | — | — | 0 |
| `Sector_DB` | ZeroG | 1500 | — | 20 | — | — | 1200 |
| `Sector_Derelict` | ZeroG | 600 | — | 20 | — | 100 | 0 |
| `Sector_QuantumMoon` | Major | 120 | — | 20 | — | — | 0 |

Le déclencheur n'est **pas** l'horizon, et le rapport entre les deux n'est pas
constant : cinq fois pour Timber Hearth, une fois et demie pour Giant's Deep.
Aucune formule ne les relie — ce sont deux nombres posés à la main, pour deux
usages qui n'ont rien à voir. L'horizon sert au rendu ; le déclencheur dit
où l'on est.

## Les cinq inventions

**1. La minicarte.** Le portage l'allumait « à moins de deux rayons de surface
du corps dominant ». Le build ne connaît que le déclencheur — et la classe. Les
trois secteurs qui ne sont pas des `PlanetoidSector` héritent du
`GetUseMinimap` de la classe de base, qui est un `ldc.i4 0` : **Dark Bramble,
l'épave et la lune quantique éteignent la minicarte.** Les trois endroits,
exactement, où l'on ne sait plus où l'on est. Ce n'est pas une omission : c'est
la mécanique.

**2. Le secteur « courant ».** `Sectors.update` retenait le secteur d'un corps à
moins de `horizon × 1,5`, soit 300 unités pour Timber Hearth. Le déclencheur en
fait 1000. Debout au village, passé quelques secondes de dérive orbitale, le
joueur n'était donc dans **aucun** secteur — et c'est de là que sortaient
l'ambiance, la poussée et la portée de la lampe.

**3. La poussée.** Deux listes étaient minées avec deux règles : le secteur
« courant » d'un côté, un `gameSectorAt` (« le plus petit volume qui me
contient ») de l'autre. Le build prend le minimum sur toute la liste, ce qui
donne la même chose là où les secteurs ne s'emboîtent pas et autre chose là où
ils s'emboîtent — l'épave dans Dark Bramble. Et la première jumelle autorise
**200**, pas 20 : le portage ne pouvait pas le voir, parce qu'il ne lisait pas
les `PlanetoidSector` comme des secteurs de jeu.

**4. La lampe.** `flashlight.update` recevait `_ambientLightRange`. C'est une
autre grandeur, pour un autre usage. La lampe se trouvait donc bridée à 250 sur
Timber Hearth et à 750 sur Giant's Deep, alors qu'aucun de ces deux secteurs ne
la bride — et le seul qui la bride vraiment, `Sector_HT_2`, la coupe à **20**.
Vingt unités de portée sur la jumelle ensablée : on n'y voit rien, et c'est
voulu.

**5. L'ambiance.** Le portage faisait de `_ambientLightRange` une atténuation
linéaire, en écrivant dans le commentaire que « le jeu n'en donne pas d'autre ».
Le jeu en donne une autre, en trois instructions :

```
MajorSector.GetAmbientLight(d) :  d < _ambientLightRange ? _ambientColor
                                                         : Color.black
```

C'est une **marche**, pas une pente. Le fondu qu'on voit en approchant ne vient
pas de la distance mais de `AmbientLightManager.Update`, qui interpole vers la
cible à `deltaTime` du chemin restant. Le portage avait la bonne interpolation
(`ambientStep`) sous une mauvaise cible — et un test qui gardait la pente,
c'est-à-dire une conclusion déguisée en mesure, exactement ce que
[`docs/49`](49-queue.md) nous avait appris à ne plus faire.

## Deux composants, deux états

`Minimap` décide si la carte **existe** ; `MinimapHUD` si on la **voit** :

```
Minimap.AttemptActivation : !insideShip && secteur != null && secteur.GetUseMinimap()
                            -> TurnOn     (elle allume, elle n'éteint jamais)
MinimapHUD.AllowVisibility : _isHelmetHUDOn && _hasMinimap && _minimapEnabled
```

`AttemptActivation` n'éteint pas : passer d'un secteur qui porte la minicarte à
un secteur qui ne la porte pas la laisse **allumée**. Seuls `OnEnterShip` et un
secteur nul appellent `TurnOff`. Un `setEnabled(condition)` par image — ce que
faisait le portage — efface cette bizarrerie sans qu'on la voie jamais.
`Minimap` et `MinimapHUD` échangent trois chaînes : `MinimapEnabled`,
`MinimapDisabled`, `AquireMinimap` (la faute d'orthographe est du build).

## Ce que l'extraction ne sortait pas

`PlanetoidSector` n'était pas dans `WANT_VOLUME` : la sphère de déclenchement
était dans la scène, mesurable, et l'extraction ne la sortait pas. C'est ce trou
qui a fait inventer `horizon × 1,5` — non par paresse, mais parce que la mesure
n'était pas sur la table. **Une constante inventée est presque toujours la trace
d'un champ non extrait**, et c'est là qu'il faut chercher avant d'écrire une
formule.

## Ce qui reste

`_ambientLight` est une énumération à trois valeurs, et `MajorSector.Awake` la
convertit en **couleur** : noir, `HSV(240, 0.235, 0.059)` — un bleu de nuit — ou
`HSV(135, 0.235, 0.059)` — un vert. Le portage n'a qu'une intensité. La teinte
de l'ambiance par secteur reste à porter.

## Gardé par

- `tests/09-jeu.mjs` — les trois classes, les deux règles de sélection, le
  minimum de poussée, la marche d'ambiance, et tout le cycle de la minicarte
  (allumage, bord montant, vaisseau, visibilité, trace à 5°).
- `tests/05-extract.mjs` — les dix secteurs sur le vrai build, les trois sans
  minicarte, le déclencheur de Timber Hearth à 1000 contre 200 d'horizon, le
  seul secteur qui bride la lampe.
- `tools/15_verify.py --profil` — posé au village, le secteur actif est
  `Sector_TH`, la minicarte est allumée et l'événement `MinimapEnabled` est
  parti ; elle n'est pourtant pas à l'écran, faute de l'avoir ramassée.
