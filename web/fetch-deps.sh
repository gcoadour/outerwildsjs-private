#!/usr/bin/env bash
# Recupere Babylon.js en local. web/vendor/ n'est pas versionne.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p vendor
[ -s vendor/babylon.js ] || curl -sSL --fail -o vendor/babylon.js https://cdn.babylonjs.com/babylon.js
[ -s vendor/babylonjs.loaders.min.js ] || curl -sSL --fail -o vendor/babylonjs.loaders.min.js https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js
# Havok : le glue JS charge le .wasm place a cote
[ -s vendor/HavokPhysics_umd.js ] || curl -sSL --fail -o vendor/HavokPhysics_umd.js https://cdn.babylonjs.com/havok/HavokPhysics_umd.js
[ -s vendor/HavokPhysics.wasm ]   || curl -sSL --fail -o vendor/HavokPhysics.wasm   https://cdn.babylonjs.com/havok/HavokPhysics.wasm
# Poids brut ET poids transfere. Babylon pese 11,1 Mo, pres d'un cinquieme du
# demarrage (docs/27-poids.md) -- mais c'est le poids COMPRESSE qui passe sur le
# reseau, et tout hebergeur statique compresse. Afficher les deux evite de peser
# une compilation sur mesure contre un chiffre qui n'est celui de personne.
total_brut=0
total_gz=0
for f in vendor/babylon.js vendor/babylonjs.loaders.min.js vendor/HavokPhysics_umd.js vendor/HavokPhysics.wasm; do
  brut=$(wc -c < "$f")
  gz=$(gzip -9 -c "$f" | wc -c)
  total_brut=$((total_brut + brut))
  total_gz=$((total_gz + gz))
  printf '%-36s %8s Ko   %8s Ko compresse\n' "$f" $((brut / 1024)) $((gz / 1024))
done
printf '%-36s %8s Ko   %8s Ko compresse\n' "total" $((total_brut / 1024)) $((total_gz / 1024))
