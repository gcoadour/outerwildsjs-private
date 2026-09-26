#!/usr/bin/env bash
# Lance l'alpha native (Unity 4.1, Linux 32 bits) sous un X virtuel, pour la
# comparer au portage : captures d'ecran et touches envoyees par xdotool.
#
#   scripts/alpha.sh start            lance l'alpha sur :99 (1280x720)
#   ALPHA_CLAVIER=1 ... start         ... le regard aux fleches, la lunette a t,
#                                     le verrou a g (scripts/alpha-clavier.mjs)
#   scripts/alpha.sh shot <fichier>   capture l'ecran
#   scripts/alpha.sh key <touche...>  envoie des touches (noms xdotool)
#   scripts/alpha.sh clic <x> <y>     clic gauche tenu
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
    DATA="${GAME}_Data/mainData"
    if [ -n "${ALPHA_CLAVIER:-}" ]; then
      # Le regard de l'alpha n'a que la souris, et la souris la casse sous
      # Xvfb : une copie LOCALE de l'InputManager lui donne des touches, le
      # temps du chargement, puis l'original est remis.
      [ -f work/mainData.origine ] || cp "$DATA" work/mainData.origine
      node scripts/alpha-clavier.mjs work/mainData.origine work/mainData.clavier
      cp work/mainData.clavier "$DATA"
    fi
    LIBGL_ALWAYS_SOFTWARE=1 "$GAME" -screen-width "${ALPHA_W:-1280}" -screen-height "${ALPHA_H:-720}" \
      -screen-fullscreen 0 -logFile "$PWD/work/alpha.log" >/dev/null 2>&1 &
    echo $! > work/alpha.pid
    if [ -n "${ALPHA_CLAVIER:-}" ]; then sleep 20; cp work/mainData.origine "$DATA"; fi
    echo "alpha lancee (pid $(cat work/alpha.pid))"
    ;;
  shot) import -window root "${2:-work/alpha.png}" ;;
  key)
    shift
    WID=$(xdotool search --name "Outer Wilds" | head -1 || true)
    # SANS donner le focus : focalisee, l'alpha verrouille le curseur en jeu
    # et lit un premier delta de souris qui envoie la camera en NaN (ecran
    # noir). Un envoi a la fenetre, puis la touche TENUE : sous llvmpipe
    # l'alpha tourne a quelques images par seconde, et un appui instantane
    # tombe entre deux `Input.GetKeyDown`.
    for k in "$@"; do
      [ -n "$WID" ] && xdotool key --window "$WID" "$k"
      xdotool keydown "$k"; sleep "${ALPHA_TENUE:-0.4}"; xdotool keyup "$k"; sleep 0.3
    done
    ;;
  clic)
    # clic gauche tenu en (x, y) : le menu-titre valide au clic (docs/131)
    WID=$(xdotool search --name "Outer Wilds" | head -1 || true)
    [ -n "$WID" ] && xdotool windowfocus "$WID" 2>/dev/null || true
    xdotool mousemove "$2" "$3"; sleep 1
    xdotool mousedown 1; sleep "${ALPHA_TENUE:-0.4}"; xdotool mouseup 1
    ;;
  stop) [ -f work/alpha.pid ] && kill "$(cat work/alpha.pid)" 2>/dev/null; rm -f work/alpha.pid ;;
  *) sed -n 2,15p "$0"; exit 1 ;;
esac
