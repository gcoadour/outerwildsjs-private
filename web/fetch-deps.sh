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
for f in vendor/babylon.js vendor/babylonjs.loaders.min.js vendor/HavokPhysics_umd.js vendor/HavokPhysics.wasm; do
  echo "$f : $(wc -c < "$f") octets"
done
