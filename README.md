# outerwildsjs — outillage de rétro-ingénierie de l'alpha ouverte d'Outer Wilds

Chaîne d'outils reproductible pour analyser le build de l'**alpha ouverte
d'Outer Wilds** (version 1.2, Unity 4.1.2f1, décembre 2013), en vue d'une
réimplémentation en JavaScript.

## Ce dépôt ne contient pas le jeu

Aucun binaire, asset, ni source décompilée n'est versionné ici. Outer Wilds est
l'œuvre d'Alex Beachum et de Mobius Digital ; redistribuer son code ou ses
ressources n'est pas quelque chose que ce dépôt fait. Ce qui est versionné, ce
sont les **scripts qui reconstruisent tout localement** à partir de la copie
archivée, plus des notes d'analyse. Tout ce que produit le pipeline atterrit
dans `work/` et `data/`, ignorés par git.

## Pipeline

```bash
tools/00_setup.sh              # SDK .NET 9, ilspycmd, UnityPy, TypeTreeGeneratorAPI
tools/01_fetch.sh Linux        # télécharge + extrait le build (~290 Mo) depuis archive.org
tools/02_decompile.sh          # assemblies -> projets C# (ILSpy)

python3 tools/03_inventory.py       # recensement des objets par type
python3 tools/04_extract_assets.py  # textures PNG, meshes OBJ, audio, textes
python3 tools/05_dump_scene.py      # graphe de scène complet -> JSON
python3 tools/06_dump_components.py # valeurs des champs des MonoBehaviour -> JSON
python3 tools/07_solar_system.py    # systeme solaire consolide -> JSON
python3 tools/08_export_gltf.py --root TimberHearth_Pivot   # sous-arbre -> glTF 2.0
python3 tools/09_gameplay.py        # vaisseau, ressources, interactifs -> JSON
python3 tools/10_audio.py           # clips et sources audio placees -> data/audio
python3 tools/11_particles.py       # 135 systemes de particules -> data/particles
python3 tools/12_shaders.py         # sources ShaderLab + classement -> data/shaders
python3 tools/13_dialogue.py        # arbres de dialogue XML -> data/dialogue

web/fetch-deps.sh && web/serve.sh   # prototype Babylon.js sur http://localhost:8080/web/
```

Comptez ~15 min de bout en bout, dominées par le téléchargement.

## Ce que le pipeline produit

| Sortie | Contenu |
|---|---|
| `work/decompiled/` | 560 fichiers `.cs`, dont ~31 600 lignes pour `Assembly-CSharp` |
| `data/scene/level0.json` | 7 688 nœuds, 16 271 composants, hiérarchie + transforms |
| `data/components/level0.json` | 1 364 MonoBehaviour avec la **valeur** de leurs champs sérialisés |
| `data/assets/` | 363 textures, 1 560 meshes, 142 clips audio, 73 TextAsset |
| `data/inventory.json` | 28 286 objets recensés par type et par fichier |
| `data/solar_system.json` | 17 corps : positions, rayons, gravité, constantes de vol |
| `data/gltf/*.gltf` | 9 sous-arbres en glTF 2.0, skinning compris (55 squelettes) |
| `data/gameplay.json` | vaisseau, ressources, 39 interactifs, 34 lisibles, 16 spawns |
| `data/audio/` | 31 clips et 92 sources placées avec leur piste de mixage |
| `data/particles/` | 135 systèmes de particules et 15 textures |
| `data/shaders/` | 121 sources ShaderLab et leur classement |
| `data/dialogue/` | 26 arbres de dialogue, 72 branches, 14 conversations |

## Prototype navigateur

`web/` contient un prototype Babylon.js qui tourne sur les données extraites :
les 10 corps aux positions réelles, le modèle de gravité du jeu, et le
*floating origin* sans lequel le monde tremble à 100 000 unités.

```bash
web/fetch-deps.sh   # récupère Babylon.js dans web/vendor (non versionné)
web/serve.sh        # http://localhost:8080/web/
```

Sans `data/solar_system.json`, le prototype bascule sur un système synthétique
et reste exécutable.

Si les glTF sont présents dans `data/gltf/`, le prototype affiche la géométrie
réelle des planètes à la place des sphères de substitution :

```bash
python3 tools/08_export_gltf.py --root TimberHearth_Pivot --root BrittleHollow_Pivot \
  --root GiantsDeep_Pivot --root HourglassTwins_Pivot --root Sun_Body \
  --root QuantumMoon_Body --root Comet_Pivot
```

`web/gltf-viewer.html?f=timberhearth_pivot.gltf` visualise un export isolé.

## Documentation

- [`docs/01-build.md`](docs/01-build.md) — anatomie du build, versions, empreintes
- [`docs/02-architecture.md`](docs/02-architecture.md) — architecture du code de jeu
- [`docs/03-typetrees.md`](docs/03-typetrees.md) — comment on lit un build *stripped*
- [`docs/04-gravite.md`](docs/04-gravite.md) — le modèle de gravité, et pourquoi il n'est pas newtonien
- [`docs/05-gltf.md`](docs/05-gltf.md) — export glTF, conversion de repère, décodage des sommets
- [`docs/06-orbites.md`](docs/06-orbites.md) — orbites simulées et référentiels
- [`docs/07-gameplay.md`](docs/07-gameplay.md) — ressources, vaisseau, interaction
- [`docs/09-audio.md`](docs/09-audio.md) — audio spatial et le piège du moteur audio Babylon
- [`docs/10-particules.md`](docs/10-particules.md) — particules et modes de fusion
- [`docs/11-shaders.md`](docs/11-shaders.md) — classement des shaders et atmosphères
- [`docs/12-boucle.md`](docs/12-boucle.md) — boucle temporelle de 20 minutes et supernova
- [`docs/13-dialogue.md`](docs/13-dialogue.md) — dialogues et mémoire entre boucles
- [`docs/14-quantique.md`](docs/14-quantique.md) — lune quantique
- [`docs/15-trounoir.md`](docs/15-trounoir.md) — trou noir et trou blanc
- [`docs/16-bramble.md`](docs/16-bramble.md) — Dark Bramble et prédateurs
- [`docs/17-secteurs.md`](docs/17-secteurs.md) — secteurs et niveau de détail
- [`docs/18-vaisseau.md`](docs/18-vaisseau.md) — pilote automatique et dégâts
- [`docs/19-carte.md`](docs/19-carte.md) — carte du système solaire
- [`docs/20-shaders-jeu.md`](docs/20-shaders-jeu.md) — application des shaders du jeu
- [`docs/21-skinning.md`](docs/21-skinning.md) — skinning des personnages
- [`docs/22-animations.md`](docs/22-animations.md) — animations et le mur Mecanim
- [`docs/23-connaissance.md`](docs/23-connaissance.md) — la connaissance débloque le jeu
- [`docs/24-outils.md`](docs/24-outils.md) — télescope, sonde et sources de savoir
- [`docs/25-interface.md`](docs/25-interface.md) — interface de dialogue et sondes
- [`docs/26-muscleclip.md`](docs/26-muscleclip.md) — décodage des clips Mecanim (`m_MuscleClip`)
- [`docs/27-poids.md`](docs/27-poids.md) — poids au démarrage, chargement à la demande, cartes de normales
- [`docs/28-hud.md`](docs/28-hud.md) — jauges de ressources et invites à l'écran
- [`docs/29-brouillards.md`](docs/29-brouillards.md) — brouillards de Dark Bramble et de la lune quantique
- [`docs/30-consoles.md`](docs/30-consoles.md) — ordinateur de bord, lampe, guimauve
- [`docs/08-reste-a-faire.md`](docs/08-reste-a-faire.md) — **ce qui manque pour un portage complet**

## Pourquoi pas AssetRipper directement

AssetRipper et UtinyRipper sont les références du domaine, mais visent surtout
la reconstruction d'un projet Unity ré-ouvrable. Ici l'objectif est différent :
sortir des **données structurées** (JSON) directement consommables par un moteur
JS. Le pipeline s'appuie donc sur UnityPy, tout en réutilisant le générateur de
type trees d'AssetRipper via `TypeTreeGeneratorAPI` — c'est lui qui rend
lisibles les champs des MonoBehaviour (voir `docs/03-typetrees.md`).

Unity 4.1 est par ailleurs mal couvert par les versions récentes d'AssetRipper,
qui ciblent Unity 5+.
