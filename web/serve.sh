#!/usr/bin/env bash
# Sert le site tel qu'il sera publie : web/ est la racine.
#
# Le Service Worker exige une origine sure : localhost en est une, un fichier
# ouvert directement (file://) n'en est pas une.
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "Page sur http://localhost:$PORT/"
exec python3 -m http.server "$PORT"
