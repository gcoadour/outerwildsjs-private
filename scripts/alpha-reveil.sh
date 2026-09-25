#!/usr/bin/env bash
# Le reveil de l'alpha, horodate : on lance l'alpha, on choisit « New
# Expedition », puis on capture l'ecran toutes les `pas` secondes pendant
# `duree` secondes. Chaque image porte son instant depuis l'appui, dans
# work/alpha-rv/instants.txt : c'est ce qui permet de caler le portage
# (scripts/pw-jeu.mjs) sur le MEME moment, et non sur « a peu pres ».
#
#   scripts/alpha-reveil.sh [attente_titre_s] [duree_s] [pas_s] [debut_s] [sortie]
#
# `debut` retarde la premiere capture : 1170 fait voir la fin de la boucle de
# vingt minutes (supernova, onde, mort, flashback) sans mille images inutiles.
#
# L'alpha exige le processeur pour elle seule : lancee a cote de Chromium,
# elle rend du noir (docs/132).
set -euo pipefail
cd "$(dirname "$0")/.."
ATTENTE="${1:-25}"; DUREE="${2:-45}"; PAS="${3:-0.5}"; DEBUT="${4:-0}"
OUT="${5:-work/alpha-rv}"
rm -rf "$OUT"; mkdir -p "$OUT"
export DISPLAY="${ALPHA_DISPLAY:-:99}"
# Le pointeur AU CENTRE de la fenetre : ailleurs, le verrouillage du curseur
# en jeu lit un premier delta de souris qui envoie la camera en NaN (ecran
# noir, « Invalid parameter because it was infinity or nan »).
ALPHA_W=640 ALPHA_H=360 scripts/alpha.sh start
sleep "$ATTENTE"
scripts/alpha.sh shot "$OUT/titre.png"
xdotool mousemove 320 180
# « New Expedition » par la touche, et SANS donner le focus a la fenetre :
# focalisee, l'alpha verrouille le curseur en jeu et lit un premier delta de
# souris qui envoie la camera en NaN — ecran noir, « Invalid parameter
# because it was infinity or nan ». La sequence est celle qui a marche.
W=$(xdotool search --name "Outer Wilds" | head -1)
# `CHOIX` : les touches a passer AVANT de valider, une par une et tenues comme
# la validation. `CHOIX=s` descend sur « Skip Intro » (la ligne verrouillee est
# sautee) : `CreateNewPlayerSave(true)` donne alors les codes de lancement, et
# la supernova n'est plus suspendue (`TimeLoop.Start`, docs/132).
for c in ${CHOIX:-}; do
  xdotool key --window "$W" "$c"; xdotool keydown "$c"; sleep 0.3; xdotool keyup "$c"; sleep 1.5
done
[ -n "${CHOIX:-}" ] && import -window root -crop 640x360+0+0 "$OUT/choix.png"
T0=$(date +%s.%N)
xdotool key --window "$W" e; sleep 1
xdotool keydown e; sleep 0.3; xdotool keyup e
i=0
if [ "$DEBUT" != "0" ]; then
  # Une image de controle a mi-parcours, pour savoir si l'alpha tourne encore.
  sleep "$(echo "$DEBUT / 2" | bc)"; import -window root -crop 640x360+0+0 "$OUT/mi.png"
  while (( $(echo "$(date +%s.%N) - $T0 < $DEBUT" | bc) )); do sleep 1; done
fi
while :; do
  T=$(date +%s.%N)
  DT=$(echo "$T - $T0" | bc)
  if (( $(echo "$DT > $DEBUT + $DUREE" | bc) )); then break; fi
  F=$(printf "%s/%04d.png" "$OUT" "$i")
  import -window root -crop 640x360+0+0 "$F"
  echo "$i $DT" >> "$OUT/instants.txt"
  i=$((i + 1))
  sleep "$PAS"
done
scripts/alpha.sh stop
echo "$i images dans $OUT"
