#!/usr/bin/env python3
"""Extrait l'interface de jeu : jauges de ressources et invites a l'ecran.

Deux ecrans manquaient au portage : `PlayerResourceGUI`, les jauges d'oxygene,
de carburant et de sante, et `PromptManager`, les invites contextuelles. Leurs
donnees ne vivent pas au meme endroit que le reste :

  - les TEXTURES sont dans le build (ResourceBar_*, TutorialTextBG, redVignette),
    deja sorties par tools/04_extract_assets.py ;
  - les MESURES et les TEXTES sont dans le code, pas dans les assets. Les
    invites sont construites en dur par une quarantaine de classes, chacune
    declarant son texte, sa priorite et sa zone d'ecran.

Ce script rassemble les deux dans data/interface/ : les textures copiees et un
interface.json que le moteur web lit directement, plutot que de retaper
quarante-six chaines a la main.

Usage:
  python3 tools/14_interface.py
"""
import argparse
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib_ow import UNITY_VERSION

# Textures du HUD, telles que PlayerResourceGUI et ScreenPrompt les chargent.
TEXTURES = [
    "ResourceBar_Layer1.png",        # cadres vides, marques « O2 » et « FUEL »
    "ResourceBar_Layer01.png",       # remplissage des deux jauges
    "ResourceBar_Layer2_HP25.png",   # silhouette de scaphandre, par paliers
    "ResourceBar_Layer2_HP50.png",
    "ResourceBar_Layer2_HP75.png",
    "ResourceBar_Layer2_HP100.png",
    "TutorialTextBG.png",            # fond des invites
    "redVignette.png",               # bordure rouge quand on encaisse
    # Icones des FogLight, dessinees par OnGUI a la position projetee de la
    # lumiere. Ce sont bien des elements d'interface, meme si elles reperent des
    # objets du monde — et savoir laquelle s'affiche est tout l'enjeu : deux
    # sont des reperes, la troisieme est un leurre d'anglerfish.
    "AnglerfishLure.png",
    "EscapePodBeacon.png",
    "WoodsmanBeacon.png",
    "LocationText_BG.png",           # fond du menu des reglages
]

# Polices du jeu. Elles etaient extraites depuis le debut sans etre utilisees :
# toute l'interface du portage etait rendue dans une police systeme.
#
#   OWUtilities.GetDialogueFont()  -> Gill Sans MT       dialogues et invites
#   OWUtilities.GetHelmetFont()    -> digital-7          casque, alertes, pilote
#   GetPromptGUIStyleCharacterName -> Gill Sans MT Bold  noms de personnages
#   GUIText du menu                -> Gill Sans MT Menu  reglages
FONTS = {
    "dialogue": "Gill Sans MT.ttf",
    "helmet": "digital-7.ttf",
    "characterName": "Gill Sans MT Bold.ttf",
    "menu": "Gill Sans MT Menu.ttf",
}

# Icones de manette, telles que XboxInput les charge. Le nom du fichier ne suit
# pas toujours celui de l'enumeration : quatre gachettes et bumpers sont ranges
# sous leur abreviation, ce que seul le code dit.
XBOX_BUTTONS = {
    "RightStick": "RightStick", "X": "X", "Y": "Y", "A": "A", "B": "B",
    "RightTrigger": "RT", "LeftTrigger": "LT", "Triggers": "Triggers",
    "LeftStick": "LeftStick", "RightStickClick": "RightStickClick",
    "LeftStickClick": "LeftStickClick", "Start": "Start", "Select": "Select",
    "RightBumper": "RB", "LeftBumper": "LB", "DPadUp": "DPadUp",
}

# ScreenPrompt(...) : soit (texte[, priorite]), soit (XboxButton.X, texte[, priorite]).
# Le texte est en general une chaine litterale, mais InteractVolume lui passe son
# champ serialise `_prompt` : cette invite-la n'a pas de texte dans le code, il
# vient de la scene (voir les InteractReceiver de gameplay.json). On la capture
# quand meme, marquee dynamique, plutot que de la laisser disparaitre.
NEW_PROMPT = re.compile(
    r"(_\w+)\s*=\s*new ScreenPrompt\(\s*"
    r"(?:XboxButton\.(\w+)\s*,\s*)?"
    r'(?:"((?:[^"\\]|\\.)*)"|string\.Empty|(_\w+))'
    r"(?:\s*,\s*(\d+))?\s*\)")

ADD_PROMPT = re.compile(
    r"AddScreenPrompt\(\s*(_\w+)\s*,\s*PromptPosition\.(\w+)"
    r"(?:\s*,\s*(?:makeVisible:\s*)?(true|false))?\s*\)")

# Certaines invites naissent vides et recoivent leur texte a l'execution :
# LaunchCodePromptController affiche « Launch Codes Aquired » puis
# « Launch Codes Remembered » d'une boucle a l'autre. Sans cette passe, leur
# entree au catalogue serait une chaine vide.
SET_TEXT = re.compile(r'(_\w+)\.SetText\(\s*"((?:[^"\\]|\\.)*)"\s*\)')


def hsv_to_hex(h, s, v):
    """Meme conversion que ColorHSV.ToColorRGB : teinte en degres, s et v en 0-1."""
    i = int(h % 360 / 60)
    f = h % 360 / 60 - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    rgb = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]
    return "#" + "".join(f"{round(c * 255):02X}" for c in rgb)


def scan_prompts(src_dir):
    """Catalogue des invites, une entree par ScreenPrompt construit.

    Le texte est declare a la construction et la zone d'ecran a l'inscription,
    dans deux methodes differentes de la meme classe : on les rapproche par le
    nom du champ, qui est le seul lien entre les deux.
    """
    out = []
    for name in sorted(os.listdir(src_dir)):
        if not name.endswith(".cs"):
            continue
        text = open(os.path.join(src_dir, name), encoding="utf-8",
                    errors="replace").read()
        if "new ScreenPrompt(" not in text:
            continue
        placement = {m.group(1): (m.group(2), m.group(3))
                     for m in ADD_PROMPT.finditer(text)}
        runtime = {}
        for m in SET_TEXT.finditer(text):
            runtime.setdefault(m.group(1), []).append(m.group(2))
        for m in NEW_PROMPT.finditer(text):
            field, button, label, dynamic, priority = m.groups()
            pos, visible = placement.get(field, (None, None))
            entry = {
                "owner": name[:-3],
                "field": field,
                # le jeu prefixe le texte d'une espace pour degager l'icone
                "text": (label or "").strip(),
                "button": button,
                "priority": int(priority or 0),
                "position": pos,
                "visible": visible != "false",
            }
            if dynamic:
                entry["text"] = None
                entry["dynamic"] = dynamic
            later = runtime.get(field)
            if later:
                entry["texts"] = later
                if not entry["text"]:
                    entry["text"] = later[0]
            out.append(entry)
    return out


# Decoupes mesurees sur les textures, par balayage du canal alpha.
#
# ResourceBar_Layer1 (512x256) porte les DEUX cadres cote a cote, separes par un
# creux vertical vide en x 152-176 : a gauche celui marque « O2 », a droite celui
# marque « FUEL ». ResourceBar_Layer01 porte les degrades de remplissage, mais
# a des positions qui ne correspondent pas a celles des cadres : les deux
# textures habillent des quads 3D distincts du casque, chacun avec sa propre
# transformation, et rien ne les aligne dans l'espace de la texture. On decoupe
# donc chaque element pour le reposer soi-meme.
CROPS = {
    "bar_frame_oxygen.png": ("ResourceBar_Layer1.png", (63, 43, 153, 217)),
    "bar_frame_fuel.png": ("ResourceBar_Layer1.png", (176, 43, 265, 217)),
    "bar_fill.png": ("ResourceBar_Layer01.png", (57, 41, 272, 220)),
}


def cut(assets, out_dir):
    """Decoupe les elements du HUD dans leurs planches."""
    from PIL import Image
    made = []
    for name, (src, box) in CROPS.items():
        path = os.path.join(assets, src)
        if not os.path.exists(path):
            continue
        Image.open(path).convert("RGBA").crop(box).save(os.path.join(out_dir, name))
        made.append(name)
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="work/decompiled/Assembly-CSharp")
    ap.add_argument("--assets", default="data/assets/Texture2D")
    ap.add_argument("--fonts", default="data/assets/Font")
    ap.add_argument("-o", "--out", default="data/interface")
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    copied, missing = [], []
    for t in TEXTURES:
        src = os.path.join(a.assets, t)
        (copied if os.path.exists(src) else missing).append(t)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(a.out, t))

    fonts = {}
    for role, file in FONTS.items():
        src = os.path.join(a.fonts, file)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(a.out, file))
            fonts[role] = file

    buttons = {}
    for enum, file in XBOX_BUTTONS.items():
        src = os.path.join(a.assets, file + ".png")
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(a.out, file + ".png"))
            buttons[enum] = file + ".png"

    cropped = cut(a.assets, a.out)
    prompts = scan_prompts(a.src)
    placed = [p for p in prompts if p["position"]]

    doc = {
        "unity": UNITY_VERSION,
        "source": "PlayerResourceGUI, PromptManager, ScreenPrompt, OWUtilities",
        # PlayerResourceGUI.Update : les jauges sont des objets 3D du casque,
        # mis a l'echelle en Y par la fraction et repositionnes avec elle
        "resources": {
            "barBaseY": -0.6,
            "barSpanY": 0.58,
            "healthStages": [0.25, 0.5, 0.75, 1.0],
            "lowThreshold": 0.2,
            "vignetteFade": 1.0,
            "labelFontSize": 20,
            "labelColor": "#FF0000",
            "labelOffsetX": 50,
            "labelOffsetY": {"fuel": 25, "health": 0, "oxygen": -25},
            # Geometrie relative des trois elements, lue dans la scene sous
            # ResourcesHUD/HUDLayer1OuterBars via les type trees. Les quads font
            # 2 unites de cote : c'est la seule lecture qui rende le bas des
            # jauges FIXE quand elles se vident (-0.6 - 0.03 f, contre
            # -0.6 + 0.275 f pour un quad unitaire).
            "layout": {
                "oxygen": {"x": 0.577, "halfWidth": 0.12, "halfHeight": 0.61},
                "fuel": {"x": 0.135, "halfWidth": 0.12, "halfHeight": 0.61},
                "health": {"x": -0.5, "halfWidth": 0.5, "halfHeight": 0.64},
            },
            "textures": {
                "frameOxygen": "bar_frame_oxygen.png",
                "frameFuel": "bar_frame_fuel.png",
                "fill": "bar_fill.png",
                "vignette": "redVignette.png",
                "health": ["ResourceBar_Layer2_HP25.png",
                           "ResourceBar_Layer2_HP50.png",
                           "ResourceBar_Layer2_HP75.png",
                           "ResourceBar_Layer2_HP100.png"],
            },
        },
        "fonts": fonts,
        # SettingsMenu.UpdateOptionText et Axis. La sensibilite est un entier
        # de 1 a 10 qui BOUCLE (11 ramene a 1), 5 etant le neutre : l'axe vaut
        # brut x inversion x sensibilite / 5. Les couleurs viennent de Menu.
        "settings": {
            "sensitivity": {"default": 5, "min": 1, "max": 10, "neutral": 5},
            "inversion": {"default": 1},
            # Disposition reelle, lue dans la scene. La racine du menu est en
            # coordonnees d'ecran (0,5 ; 0,8) ; les options n'ont pas de
            # position propre mais un DECALAGE EN PIXELS porte par leur GUIText,
            # de -70 a -370 par pas de 50. Le titre est a l'origine, en corps 42.
            "layout": {
                "anchor": [0.5, 0.8],
                "title": {"text": "Settings", "fontSize": 42, "offset": [0, 0]},
                "firstOffset": -70,
                "step": -50,
                "fontSize": 30,
                "background": {
                    "texture": "LocationText_BG.png",
                    "offset": [0.0, -0.26],
                    "size": [0.36, 0.81],
                    "color": [0.5, 0.5, 0.5, 0.5],
                },
            },
            "colors": {
                "locked": hsv_to_hex(40.0, 0.4, 0.15),
                "selected": hsv_to_hex(40.0, 0.5, 0.7),
                "normal": hsv_to_hex(40.0, 0.5, 0.3),
            },
            "options": [
                {"key": "back", "label": "Back"},
                {"key": "invertY", "label": "Y-Axis: %s",
                 "states": ["Not Inverted", "Inverted"]},
                {"key": "lookSensitivity", "label": "Look Sensitivity: %d"},
                {"key": "flightSensitivity", "label": "Flight Sensitivity: %d"},
                {"key": "brightness", "label": "Screen Brightness: %s",
                 "states": ["Normal", "Bright"]},
                {"key": "shadows", "label": "Shadows: %s",
                 "states": ["Off", "On"]},
                # verrouillee au menu principal dans le jeu ; ce portage n'a pas
                # de menu principal, elle l'est donc toujours
                {"key": "exit", "label": "Exit to Main Menu", "locked": True},
            ],
        },
        # MapMarker : l'icone n'est pas une texture mais un dessin —
        # IconGenerator.GenerateSquareBracket(20, 20, blanc), quatre coins en
        # crochet, trait de 1 pixel, quart de cote. Le libelle est en corps 14,
        # precede d'une espace, et le marqueur disparait a moins de 10 pixels du
        # centre de l'ecran ou au-dela de sa distance d'affichage.
        "mapMarkers": {
            "iconSize": 20,
            "lineWidth": 1,
            "bracketRatio": 0.25,
            "fontSize": 14,
            "minScreenDistance": 10,
            "types": {
                "Default": {"color": "#FFFFFF", "maxDistance": 5000},
                "Planet": {"color": "#FFFFFF", "maxDistance": 50000},
                "Moon": {"color": "#FFFFFF", "maxDistance": 5000},
                "Sun": {"color": "#FFFFFF", "maxDistance": 1e10},
                "Player": {"color": "#00FF00", "maxDistance": 0},
                "Probe": {"color": "#00FF00", "maxDistance": 50000},
                "Ship": {"color": "#00FF00", "maxDistance": 50000},
            },
        },
        # PromptManager.Update et ScreenPrompt.DrawPrompt
        "prompts": {
            "fontSize": 30,
            "color": hsv_to_hex(42.0, 0.2, 0.9),
            "background": "TutorialTextBG.png",
            "boxScale": [1.1, 1.2],
            "spacing": 5,
            "bottomMargin": 100,
            "leftMargin": 50,
            "centerOffsetY": 50,
            "slideDistance": 400,
            "slideDuration": 0.5,
            "buttons": buttons,
            "catalogue": prompts,
        },
    }
    with open(os.path.join(a.out, "interface.json"), "w") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)

    zones = {}
    for p in placed:
        zones[p["position"]] = zones.get(p["position"], 0) + 1
    print(f"  {len(copied)} textures copiees, {len(cropped)} decoupes, "
          f"{len(buttons)} icones de manette, {len(fonts)} polices" +
          (f", {len(missing)} absentes : {missing}" if missing else ""))
    dyn = sum(1 for p in prompts if p.get("dynamic"))
    late = sum(1 for p in prompts if p.get("texts"))
    print(f"  {len(prompts)} invites, dont {len(placed)} placees " +
          ", ".join(f"{n} en {z}" for z, n in sorted(zones.items())) +
          f" ; {dyn} au texte dynamique, {late} au texte pose a l'execution, "
          f"{len(prompts) - len(placed)} jamais inscrite(s)")
    print(f"  couleur des invites {doc['prompts']['color']}"
          f" -> {a.out}/interface.json")


if __name__ == "__main__":
    main()
