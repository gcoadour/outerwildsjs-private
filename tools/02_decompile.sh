#!/usr/bin/env bash
# Decompile les assemblies managees en projets C# avec ILSpy.
# Sortie dans work/decompiled/ (gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."

export DOTNET_ROOT="${DOTNET_DIR:-/opt/dotnet}"
export PATH="$PATH:$DOTNET_ROOT:$HOME/.dotnet/tools"

MANAGED=$(find work/game -type d -name Managed | head -1)
[ -n "$MANAGED" ] || { echo "Build introuvable. Lancer tools/01_fetch.sh"; exit 1; }

mkdir -p work/decompiled
for asm in Assembly-CSharp Assembly-CSharp-firstpass Assembly-UnityScript \
           Assembly-UnityScript-firstpass DecalSystem.Runtime; do
  [ -f "$MANAGED/$asm.dll" ] || continue
  echo ">> $asm"
  ilspycmd "$MANAGED/$asm.dll" -r "$MANAGED" -o "work/decompiled/$asm" -p --nested-directories
done

echo
for d in work/decompiled/*/; do
  printf '   %-42s %5s fichiers .cs\n' "$d" "$(find "$d" -name '*.cs' | wc -l)"
done
