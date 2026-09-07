#!/usr/bin/env bash
# Telecharge et extrait le build de l'alpha ouverte depuis archive.org.
# Le contenu atterrit dans work/ qui est gitignore : rien du jeu n'entre au depot.
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${1:-Linux}"   # Linux | PC | Mac
SNAP="20150815180605"
URL="https://web.archive.org/web/${SNAP}if_/http://alexbeachum.com/outerwildsDownloads/OuterWilds_Alpha_1_2_${PLATFORM}.zip"
ZIP="work/downloads/OuterWilds_Alpha_1_2_${PLATFORM}.zip"

mkdir -p work/downloads work/game
if [ ! -f "$ZIP" ]; then
  echo ">> Telechargement ($PLATFORM, ~290 Mo) depuis archive.org"
  curl -L --retry 4 --retry-delay 2 --fail -o "$ZIP" "$URL"
fi

echo ">> SHA-256 : $(sha256sum "$ZIP" | cut -d' ' -f1)"
echo "   attendu (Linux) : 5c7defadfd42368402d95a1da9f753e1dcb8e50ef184801718fa8cb13780f05a"

echo ">> Extraction dans work/game"
unzip -q -o "$ZIP" -d work/game
find work/game -maxdepth 2 -name '*_Data' -printf '   %p\n'
echo ">> Version Unity : $(head -c 40 work/game/*_Data/mainData | tr -c '[:print:]' '\n' | grep -m1 -E '^[0-9]+\.[0-9]+')"
