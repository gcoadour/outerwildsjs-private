# Anatomie du build

## Source

Page d'origine archivée le 15 août 2015 :
`https://web.archive.org/web/20150815180605/http://outerwilds.com:80/downloads/`

Les trois binaires pointent vers `alexbeachum.com/outerwildsDownloads/` :

| Plateforme | Taille | SHA-256 |
|---|---|---|
| Linux | 289 268 118 o | `5c7defadfd42368402d95a1da9f753e1dcb8e50ef184801718fa8cb13780f05a` |
| PC | 288 417 374 o | (non téléchargé) |
| Mac | 287 701 253 o | (non téléchargé) |

Le build Linux suffit : les assemblies managées et les fichiers `.assets` sont
identiques d'une plateforme à l'autre, seul le lanceur natif change.

## Version

**Unity 4.1.2f1**, assemblies datées du 8 décembre 2013.

C'est un point important et contre-intuitif : l'archive s'appelle « alpha 1.2 »
et la page date de 2015, mais le contenu est le build de fin 2013 — le projet
étudiant USC, bien avant la reprise par Mobius Digital. La documentation
courante d'AssetRipper vise Unity 5+ ; ici on est sur du Unity 4, dont le format
sérialisé diffère (pas de `globalgamemanagers`, la version vit en tête de
`mainData`).

## Disposition

```
OuterWilds_Alpha_1_2            lanceur natif
OuterWilds_Alpha_1_2_Data/
├── mainData                    989 objets   — scène de démarrage + managers
├── level0                   24 032 objets   — la scène de jeu (24 Mo)
├── resources.assets            174 objets
├── sharedassets0.assets        621 objets   — dont les 468 MonoScript
├── sharedassets1.assets      2 390 objets   — meshes, matériaux, audio (410 Mo)
├── sharedassets1.assets.resS                — données binaires associées
├── Managed/                                 — assemblies .NET
└── Mono/                                    — runtime Mono
```

Total : **28 206 objets sérialisés**.

Le jeu tient donc en une seule scène (`level0`) : pas de découpage en niveaux,
ce qui est cohérent avec un système solaire continu et sans écran de chargement.

## Assemblies

| Assembly | Rôle | Fichiers `.cs` décompilés |
|---|---|---|
| `Assembly-CSharp` | le code du jeu (~31 600 lignes) | 411 |
| `Assembly-CSharp-firstpass` | code placé dans `Plugins/` | 49 |
| `Assembly-UnityScript-firstpass` | scripts JS/UnityScript tiers | 50 |
| `Assembly-UnityScript` | reliquat UnityScript | 3 |
| `DecalSystem.Runtime` | *Decal System*, asset store tiers | 47 |

Le code est compilé sans obfuscation et avec les noms de champs d'origine, ce
qui rend la décompilation très lisible.
