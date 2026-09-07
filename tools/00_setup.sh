#!/usr/bin/env bash
# Installe la chaine d'outils : .NET (pour ILSpy + backend AssetRipper) et les paquets Python.
set -euo pipefail

DOTNET_DIR="${DOTNET_DIR:-/opt/dotnet}"
if ! [ -x "$DOTNET_DIR/dotnet" ]; then
  echo ">> Installation du SDK .NET 9 dans $DOTNET_DIR"
  curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 9.0 --install-dir "$DOTNET_DIR" --no-path
fi
export DOTNET_ROOT="$DOTNET_DIR"
export PATH="$PATH:$DOTNET_DIR:$HOME/.dotnet/tools"

# ilspycmd : la derniere version publiee est parfois cassee en tant que dotnet tool,
# d'ou l'epinglage. --allow-roll-forward autorise l'execution du tool net8 sur le runtime 9.
if ! command -v ilspycmd >/dev/null; then
  echo ">> Installation d'ilspycmd 9.1.0.7988"
  dotnet tool install -g ilspycmd --version 9.1.0.7988 --allow-roll-forward
fi

echo ">> Paquets Python"
pip install --quiet UnityPy TypeTreeGeneratorAPI numpy Pillow

echo ">> Pret. Ajouter a votre shell :"
echo "   export DOTNET_ROOT=$DOTNET_DIR"
echo "   export PATH=\$PATH:$DOTNET_DIR:\$HOME/.dotnet/tools"
