# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Le dépôt est rédigé en français ; ce fichier l'est aussi.

## Règle absolue : aucun contenu du jeu au dépôt

Ni binaire, ni asset, ni source décompilée d'Outer Wilds — et le site publié
n'en sert aucun non plus : il reconstruit tout chez la personne qui fournit sa
copie du build. `scripts/check-no-assets.mjs` fait échouer la CI et la
publication sur une extension interdite (`.assets`, `.dll`, `.png`, `.ogg`,
`.gltf`, `.zip`…), un chemin qui reçoit de l'extrait (`data/`, `work/`,
`web/vendor/`) ou un fichier de plus de 512 Ko. Seule exception nommée :
`web/src/pipeline/unity/unity41-types.json` (métadonnées de format Unity).

## Commandes

Node 22, aucune dépendance npm : pas de `package.json`, pas de bundler.

```bash
# Tests. Sans OW_BUILD, ce qui exige le build s'annonce ignore plutot que d'echouer.
node scripts/run-tests.mjs
OW_BUILD=/chemin/vers/OuterWilds_Alpha_1_2_Data node scripts/run-tests.mjs

# Un seul fichier de test (le drapeau memoire est indispensable sur les gros fichiers)
OW_BUILD=... node --max-old-space-size=6000 tests/05-extract.mjs

node scripts/check-modules.mjs     # chaque module du pipeline s'analyse et ses imports resolvent
node scripts/check-no-assets.mjs   # garde-fou contenu du jeu

# Servir la page telle qu'elle sera publiee (web/ est la racine du site)
web/fetch-deps.sh                  # Babylon.js + Havok dans web/vendor/, non versionne
web/serve.sh 8080                  # http://localhost:8080/ — le Service Worker exige localhost ou HTTPS

# Pipeline Python d'origine, pour le travail local seulement
tools/00_setup.sh                  # .NET 9, ilspycmd, UnityPy, numpy, Pillow
tools/01_fetch.sh Linux            # telecharge le build dans work/ (gitignore)
python3 tools/15_verify.py [--lourd]  # invariants mesures dans un vrai Chromium (Playwright)
```

`tests/01`…`08` lisent le build ; `tests/09-jeu.mjs` est de la logique pure et
tourne toujours. Les tests s'écrivent avec `check()` / `report()` de
`tests/run.mjs`, et un fichier qui a besoin du build sort en 0 après
`if (!haveBuild())`.

## Architecture

### Deux moitiés, deux régimes d'exécution

- **`web/src/pipeline/**`** — lit le build Unity. Tourne dans un Web Worker
  (`pipeline/worker.js` orchestre toute la chaîne), ne touche jamais au DOM, et
  s'importe donc sous Node : c'est ce que vérifie `check-modules.mjs` et ce dont
  les tests se servent.
- **`web/src/*.js`** — le moteur, Babylon.js + Havok. `main.js` (`boot()`)
  assemble tout ; ces modules touchent au DOM dès le chargement et ne sont pas
  couverts par `check-modules.mjs`. Ce qui, dans le moteur, est de la logique
  pure (mort, supernova, dégâts, LOD, éviction, manches tactiles) est isolé dans
  des modules sans Babylon ni DOM, et testé par `tests/09-jeu.mjs`.
- **`tools/`** — le pipeline Python d'origine, gardé pour ce que le navigateur
  ne fait pas (décompilation ILSpy, inventaire, export en vrac). Seule la sortie
  de `tools/16_unity_types.py` est versionnée.

### La chaîne de données

```
zip fourni sur la page ─DecompressionStream─► OPFS ─FileSystemSyncAccessHandle─►
UnityEnv (6 SerializedFile, PPtr croises) ─extracteurs─► data/… dans l'OPFS
─Service Worker─► le moteur, qui croit lire des fichiers servis
```

Quatre choix de conception portent tout le reste, à ne pas défaire :

- **Lecture paresseuse.** `SerializedFile` prend une *source d'octets*, jamais
  un tampon complet : `sharedassets1.assets` pèse 410 Mo dont seul l'en-tête
  (48 Ko) reste en mémoire. Les tests passent par `FdSource` (`tests/run.mjs`),
  équivalent Node du handle navigateur, pour éprouver ce chemin-là.
- **Type trees régénérés.** Le build est *stripped* (`typeCount` vaut 0). Les
  classes moteur viennent de `unity41-types.json` ; les MonoBehaviour sont
  reconstruits depuis les assemblies en lisant les métadonnées ECMA-335
  (`pipeline/dotnet/`) puis en appliquant les règles de sérialisation d'Unity 4.
  Voir `docs/03-typetrees.md` et `docs/31-navigateur.md`.
- **Service Worker plutôt qu'URL `blob:`.** Un glTF renvoie vers son `.bin` et
  ses textures par chemins relatifs ; servir `data/…` depuis l'OPFS
  (`web/sw.js`) laisse tout le code de chargement inchangé — au prix d'une
  origine sûre.
- **Repli partout.** `config.js` retombe sur un système synthétique, `sw.js`
  répond 404, le moteur dégrade (sphères sans glTF, collision analytique sans
  Havok). La page doit rester ouvrable sans le build, et la CI verte sans lui.

### L'oracle

Le même partout, et strict : **lire un objet doit consommer exactement ses
`byteSize` octets**. Un champ mal placé, mal dimensionné ou oublié fait échouer
le test. Les comptes attendus (24 032 objets dans `level0`, 1 390 MonoBehaviour,
399 textures, 1 569 maillages…) sont relevés dans `docs/01-build.md` et le
README : quand un chiffre bouge, les trois bougent ensemble.

### Le moteur, ce qu'il reproduit du jeu

- **Gravité par champs analytiques dominants** (`gravity.js`), pas une
  gravitation à N corps : chaque corps porte un champ, un détecteur retient le
  dominant. `cutoffRadius` est un rayon *interne*, et la plupart des corps ont
  un falloff linéaire, pas en 1/r².
- **Floating origin ancré sur le corps dominant, pas sur le joueur**
  (`origin.js`) : les colliders statiques de Havok restent alors immobiles.
- Orbites par vitesse initiale puis suivi du champ (`orbits.js`) ; secteurs, LOD
  par maillage et éviction (`sectors.js`, `lod.js`) traités comme du budget de
  rendu.
- Les constantes (vol, déplacement, dégâts, ressources) viennent du build via
  `data/solar_system.json` et `data/gameplay.json` — jamais codées en dur, sauf
  comme valeur de repli explicite.

## Conventions

- **Français partout.** Commentaires de code et messages de commit **sans
  accents** ; README, `docs/` et le texte d'interface (`index.html`, `style.css`)
  avec leurs accents.
- Les commentaires expliquent le *pourquoi* et, très souvent, le piège rencontré
  et comment il a été désigné (voir `origin.js`, `gravity.js`,
  `pipeline/unity/serialized.js`). Écrire dans ce registre plutôt que paraphraser
  le code.
- Modules ES natifs chargés tels quels par le navigateur ; Babylon et Havok
  s'utilisent en global (`window.BABYLON`), vendorisés à la publication pour que
  la page ne dépende d'aucun CDN à l'exécution.
- `docs/` est numéroté et indexé par `docs/README.md` : une nouvelle analyse
  s'ajoute au sommaire. `docs/08-reste-a-faire.md` tient l'état d'avancement du
  portage et se met à jour quand un système est fermé.
- Toute correspondance mesurée devient un invariant gardé : un test dans
  `tests/` si elle se vérifie sous Node, un contrôle dans `tools/15_verify.py`
  si elle demande un navigateur.
