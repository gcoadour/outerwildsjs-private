#!/usr/bin/env bash
# Lance l'alpha native (Unity 4.1, Linux 32 bits) sous un X virtuel, pour la
# comparer au portage : captures d'ecran et touches envoyees par xdotool.
#
#   scripts/alpha.sh start            lance l'alpha sur :99 (1280x720)
#   scripts/alpha.sh shot <fichier>   capture l'ecran
#   scripts/alpha.sh key <touche...>  envoie des touches (noms xdotool)
#   scripts/alpha.sh stop
#
# Prerequis (Ubuntu) : dpkg --add-architecture i386, puis libc6:i386
# libgl1:i386 libgl1-mesa-dri:i386 libglu1-mesa:i386 libx11-6:i386
# libxcursor1:i386 libxrandr2:i386 libasound2t64:i386, Xvfb, xdotool,
# imagemagick. Le rendu passe par llvmpipe : lent, mais complet.
set -euo pipefail
cd "$(dirname "$0")/.."
GAME="work/game/OuterWilds_Alpha_1_2"
export DISPLAY="${ALPHA_DISPLAY:-:99}"
case "${1:-}" in
  start)
    pgrep -f "Xvfb $DISPLAY" >/dev/null || { Xvfb "$DISPLAY" -screen 0 1280x720x24 +extension GLX >/dev/null 2>&1 & sleep 2; }
    chmod +x "$GAME"
    LIBGL_ALWAYS_SOFTWARE=1 "$GAME" -screen-width "${ALPHA_W:-1280}" -screen-height "${ALPHA_H:-720}" \
      -screen-fullscreen 0 -logFile "$PWD/work/alpha.log" >/dev/null 2>&1 &
    echo $! > work/alpha.pid
    echo "alpha lancee (pid $(cat work/alpha.pid))"
    ;;
  shot) import -window root "${2:-work/alpha.png}" ;;
  key)
    shift
    WID=$(xdotool search --name "OuterWilds" | head -1 || true)
    [ -n "$WID" ] && xdotool windowactivate --sync "$WID" 2>/dev/null || true
    for k in "$@"; do xdotool key "$k"; sleep 0.3; done
    ;;
  stop) [ -f work/alpha.pid ] && kill "$(cat work/alpha.pid)" 2>/dev/null; rm -f work/alpha.pid ;;
  *) sed -n 2,14p "$0"; exit 1 ;;
esac
