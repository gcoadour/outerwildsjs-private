#!/usr/bin/env bash
# Sert le prototype. La page lit ../data/solar_system.json, il faut donc
# servir la racine du depot et non web/.
cd "$(dirname "$0")/.."
PORT="${1:-8080}"
echo "Prototype sur http://localhost:$PORT/web/"
exec python3 -m http.server "$PORT"
