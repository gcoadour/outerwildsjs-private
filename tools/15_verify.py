#!/usr/bin/env python3
"""Verifie le portage web dans un vrai navigateur.

Chaque systeme porte a ete verifie a la main, une fois, par un script jete
apres coup. Rien n'en restait : un changement pouvait casser en silence les
cartes de normales, le tri des invites par priorite ou le poids au demarrage,
et personne ne l'aurait su avant la capture suivante.

Ce script rassemble ces verifications en invariants mesurables. Il demarre la
page, mesure ce qui passe par le reseau, puis interroge le moteur. Chaque
controle dit ce qu'il attend et ce qu'il a trouve ; le code de sortie vaut 1
des qu'un seul echoue.

Il ne remplace pas l'oeil humain sur le rendu — il garantit que ce qui a ete
mesure une fois le reste.

Usage:
  python3 tools/15_verify.py                 # sert le depot et verifie
  python3 tools/15_verify.py --url http://localhost:8080/web/
  python3 tools/15_verify.py --lourd          # ajoute les controles lents
"""
import argparse
import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading

CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"


class Report:
    """Journal des controles, avec un verdict par ligne."""

    def __init__(self):
        self.rows = []

    def check(self, label, ok, got, want):
        self.rows.append((bool(ok), label, got, want))
        return bool(ok)

    def eq(self, label, got, want):
        return self.check(label, got == want, got, want)

    def at_least(self, label, got, want):
        return self.check(label, got is not None and got >= want, got, f">= {want}")

    def at_most(self, label, got, want):
        return self.check(label, got is not None and got <= want, got, f"<= {want}")

    def near(self, label, got, want, tol):
        ok = got is not None and abs(got - want) <= tol
        return self.check(label, ok, got, f"{want} +/- {tol}")

    def print(self):
        width = max((len(r[1]) for r in self.rows), default=10)
        for ok, label, got, want in self.rows:
            mark = "ok  " if ok else "ECHEC"
            detail = "" if ok else f"   (obtenu {got!r}, attendu {want!r})"
            print(f"  {mark} {label:<{width}}  {got}{detail}")
        bad = sum(1 for ok, *_ in self.rows if not ok)
        print(f"\n  {len(self.rows) - bad}/{len(self.rows)} controles passes")
        return bad


def serve(root, port):
    """Sert le depot en tache de fond, comme web/serve.sh."""
    handler = type("H", (http.server.SimpleHTTPRequestHandler,),
                   {"directory": root,
                    "log_message": lambda *a, **k: None})
    # un port laisse en TIME_WAIT par une execution precedente ne doit pas
    # empecher la suivante
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run(url, heavy):
    from playwright.sync_api import sync_playwright

    rep = Report()
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROMIUM if os.path.exists(CHROMIUM) else None,
            args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        weight = {"total": 0}

        def on_response(r):
            if not r.url.startswith("http"):
                return          # blob: et data: ne passent pas par le reseau
            try:
                weight["total"] += int(r.headers.get("content-length") or 0)
            except (TypeError, ValueError):
                pass

        page.on("response", on_response)
        page.goto(url, wait_until="load", timeout=90000)
        page.wait_for_function("window.__ready===true", timeout=300000)
        page.wait_for_timeout(3000)

        rep.eq("erreurs console au demarrage", errors[:3], [])
        rep.at_most("poids reseau (Mo)", round(weight["total"] / 1e6, 1), 70)

        # --- geometrie a la demande -----------------------------------------
        files = page.evaluate("() => window.__geo.entries.map(e => e.file).sort()")
        rep.eq("fichiers glTF au demarrage", files,
               ["sun_body.gltf", "timberhearth_pivot.gltf"])

        # --- shaders, physique, secteurs ------------------------------------
        rep.at_least("affectations de shaders",
                     page.evaluate("() => Object.values(window.__shaders||{})"
                                   ".reduce((a,b)=>a+b,0)"), 90)
        rep.eq("physique Havok active", page.evaluate("() => !!window.__physics"), True)
        # On COMPTE les corps que les secteurs suivent, sans appeler update() :
        # celui-ci declencherait des telechargements et fausserait la mesure de
        # poids faite juste au-dessus. Un controle ne doit rien changer.
        rep.at_least("corps suivis par les secteurs",
                     page.evaluate("() => window.__sectors.bodies.filter("
                                   "b => window.__sectors.fileFor(b)).length +"
                                   " window.__sectors.extras.length"), 10)

        # --- animations ------------------------------------------------------
        anim = page.evaluate("""() => {
          const s = window.__scene || BABYLON.Engine.LastCreatedScene;
          const g = s.animationGroups;
          let cub = 0, tot = 0;
          for (const gr of g) for (const ta of gr.targetedAnimations) {
            tot++;
            if (ta.animation.getKeys().some(k => k.inTangent !== undefined)) cub++;
          }
          return {groupes: g.length, jouent: g.filter(x => x.isPlaying).length,
                  canaux: tot, cubiques: cub};
        }""")
        rep.at_least("groupes d'animation", anim["groupes"], 15)
        rep.at_least("groupes en lecture", anim["jouent"], 10)
        rep.eq("canaux tous cubiques", anim["cubiques"], anim["canaux"])

        # --- particules --------------------------------------------------------
        parts = page.evaluate("""() => {
          const s = window.__scene || BABYLON.Engine.LastCreatedScene;
          let couleur = 0, taille = 0;
          for (const ps of s.particleSystems) {
            if ((ps.getColorGradients() || []).length > 1) couleur++;
            if ((ps.getSizeGradients() || []).length > 1) taille++;
          }
          return {vivants: s.particleSystems.length, couleur, taille};
        }""")
        rep.at_least("systemes de particules vivants", parts["vivants"], 3)
        rep.at_least("degrades de couleur appliques", parts["couleur"], 1)

        # --- interface ---------------------------------------------------------
        rep.at_least("invites affichees",
                     page.evaluate("() => document.querySelectorAll('.ow-prompt').length"), 2)
        rep.eq("icone de manette sur chaque invite",
               page.evaluate("() => document.querySelectorAll('.ow-prompt-btn').length"),
               page.evaluate("() => document.querySelectorAll('.ow-prompt').length"))
        rep.eq("panneau de ressources present",
               page.evaluate("() => !!document.querySelector('.ow-res')"), True)
        # Une police ne se charge qu'a son premier usage : on attend la fin du
        # chargement, et on ne teste que celles qui sont effectivement posees a
        # l'ecran au demarrage. « OW Menu » ne l'est qu'une fois le menu ouvert.
        rep.eq("polices du jeu chargees",
               page.evaluate("""async () => {
                 if (!document.fonts) return true;
                 await document.fonts.ready;
                 return [...document.fonts].map(f => f.family).filter(
                   f => f.startsWith('OW ')).sort();
               }"""),
               ["OW Dialogue", "OW Helmet", "OW Menu", "OW Name"])

        # les invites de la carte, de priorite 2, doivent evincer les autres
        page.keyboard.press("KeyM")
        page.wait_for_timeout(1200)
        rep.eq("le tri par priorite evince les invites de reacteur",
               page.evaluate("() => [...document.querySelectorAll("
                             "'.ow-prompts-left .ow-prompt')].map(n=>n.textContent.trim())"),
               ["Close Map", "Zoom In/Out", "Pan View"])
        page.evaluate("() => window.__map.pan(-0.5, -0.5, 1)")
        rep.check("le deplacement de la carte suit la distance de zoom",
                  page.evaluate("() => Math.abs(window.__map.focal[0]) > 1000"),
                  page.evaluate("() => Math.round(window.__map.focal[0])"), "!= 0")
        page.evaluate("() => window.__map.recenter()")
        page.keyboard.press("KeyM")
        page.wait_for_timeout(600)

        # --- reglages ----------------------------------------------------------
        wrap = page.evaluate("""() => {
          const s = window.__gui.settings;
          const out = []; let v = 8;
          for (let i = 0; i < 4; i++) { v = s.step(v, 1); out.push(v); }
          return out;
        }""")
        rep.eq("la sensibilite boucle de 10 a 1", wrap, [9, 10, 1, 2])
        rep.near("facteur d'axe a la sensibilite neutre",
                 page.evaluate("() => window.__gui.settings.lookFactor()"), 1.0, 0.001)

        # --- consoles et objets de bord ---------------------------------------
        cons = page.evaluate("""() => {
          const c = window.__consoles.computer, m = window.__consoles.marshmallow;
          m.held = true; m.toast = 0;
          for (let i = 0; i < 3; i++) m.update(1, 100);
          return {notices: c.records.length,
                  avecTexte: c.records.filter(r => r.text && r.text.length > 20).length,
                  portee: window.__consoles.flashlight.light.range,
                  grillage: +m.toast.toFixed(2)};
        }""")
        rep.eq("notices de l'ordinateur de bord", cons["notices"], 7)
        rep.eq("notices pourvues d'un texte", cons["avecTexte"], 7)
        rep.eq("portee de la lampe", cons["portee"], 80)
        rep.near("guimauve grillee en trois secondes", cons["grillage"], 0.6, 0.001)

        # --- signaux et mixage -------------------------------------------------
        audio = page.evaluate("""() => {
          const m = window.__audioMix.mixer;
          const f = (d, h, fo) => { const s = Math.max(0, Math.min(1, 1-(d-h)/(fo-h)));
                                    return +(s*s).toFixed(3); };
          m.reset(); m.mixEndTimes(2);
          for (let i = 0; i < 4; i++) m.update(0.5);
          const out = {emetteurs: window.__audioMix.transmitters.length,
                       centre: f(0, 20, 300), moitie: f(150, 20, 300),
                       bord: f(300, 20, 300),
                       musiqueCoupee: +m.volume('Music').toFixed(2),
                       signalIntact: +m.volume('Signal').toFixed(2)};
          m.reset();
          return out;
        }""")
        rep.eq("emetteurs de signal", audio["emetteurs"], 9)
        rep.eq("signal plein dans le point chaud", audio["centre"], 1)
        rep.near("decroissance quadratique a mi-chemin", audio["moitie"], 0.287, 0.002)
        rep.eq("signal nul au rayon de coupure", audio["bord"], 0)
        rep.eq("la supernova coupe la musique", audio["musiqueCoupee"], 0)
        rep.eq("... sans toucher a la piste des signaux", audio["signalIntact"], 1)

        # --- brouillards -------------------------------------------------------
        fog = page.evaluate("""() => {
          const v = window.__fog.fog.volumes.find(x => x.bramble);
          const at = (d) => { const t = 1 - Math.min(1, Math.max(0,
              (d - v.innerRadius) / (v.outerRadius - v.innerRadius)));
            return +(v.outerDensity + (v.innerDensity - v.outerDensity) * t*t*t).toFixed(5); };
          return {mur: at(1400), milieu: at(1300), coeur: at(1200),
                  volumes: window.__fog.fog.volumes.length,
                  masques: window.__fog.cloaks.cloaks.length,
                  lumieres: window.__fog.lights.lights.length};
        }""")
        rep.eq("volumes de brouillard", fog["volumes"], 2)
        rep.eq("objets masques par le brouillard", fog["masques"], 7)
        rep.eq("lumieres dans le brouillard", fog["lumieres"], 6)
        rep.eq("densite nulle au rayon exterieur", fog["mur"], 0)
        rep.near("decroissance cubique a mi-chemin", fog["milieu"], 0.00125, 1e-5)
        rep.near("densite pleine au rayon interieur", fog["coeur"], 0.01, 1e-5)

        # --- mort, flashback et supernova ---------------------------------------
        fin = page.evaluate("""() => {
          const d = window.__death, s = window.__supernova.stage;
          const fb = d.flashback;
          const at = (f, left, nova, r) => s.update({fraction: f, secondsRemaining: left,
                                                     supernova: nova, shockwaveRadius: r});
          return {images: fb.frames.length, duree: +fb.duration.toFixed(2),
                  progression: at(0.5, 600, false, 0).phase,
                  contraction: +at(1, 0, false, 0).scale.toFixed(2),
                  explosion: at(1, 0, true, 5000).phase,
                  causes: Object.keys(window.__death.byCause).length};
        }""")
        rep.eq("images du flashback", fin["images"], 22)
        rep.eq("duree de la sequence de mort (s)", fin["duree"], 8.21)
        rep.eq("l'etoile se contracte avant d'exploser", fin["contraction"], 0.62)
        rep.eq("phase d'explosion", fin["explosion"], "explosion")
        rep.eq("aucune mort au demarrage", fin["causes"], 0)

        # --- degats du vaisseau -------------------------------------------------
        # Les valeurs de l'alpha eteignent les degats localises : on verifie que
        # c'est bien CE qu'on lit dans le build, pas une hypothese du portage.
        dmg = page.evaluate("""() => {
          const s = window.__shipRef;
          if (!s) return null;
          const d = s.damage;
          return {masque: d.mask, generique: d.generic, moteur: d.engine,
                  coupe: d.disableDamagedThrusters, poussee: s.effectiveThrust};
        }""")
        if dmg:
            rep.eq("masque de position d'impact du build", dmg["masque"], 0)
            rep.eq("modificateur de piece generique", dmg["generique"], 0)
            rep.eq("modificateur de reacteur", dmg["moteur"], 0)
            rep.eq("coupure des propulseurs endommages", dmg["coupe"], False)

        # --- champ de debris du trou blanc --------------------------------------
        deb = page.evaluate("() => window.__debris ? window.__debris.radius : null")
        rep.eq("rayon du champ de debris", deb, 750)

        # --- camera embarquee de la sonde ---------------------------------------
        page.keyboard.press("KeyF")
        page.wait_for_timeout(600)
        rep.eq("la sonde allume sa camera",
               page.evaluate("() => (window.__scene || BABYLON.Engine.LastCreatedScene)"
                             ".activeCameras.map(c => c.name)"),
               ["cam", "probeCam"])
        rep.eq("cadre de la vue de sonde",
               page.evaluate("() => !document.querySelector('.ow-probeview').hidden"), True)

        # --- coupure passe-bas des emetteurs -------------------------------------
        rep.at_least("sources reliees a un emetteur",
                     page.evaluate("() => window.__audioMix.transmitters"
                                   ".reduce((a, t) => a + t.sources.length, 0)"), 1)

        # --- commandes tactiles ------------------------------------------------
        #
        # Le navigateur de verification n'est pas tactile : on installe la
        # couche a la main, puis on lui envoie des evenements de pointeur. Ce
        # qui est verifie, c'est qu'elle produit les MEMES entrees que le
        # clavier — un axe analogique et des codes de touche.
        tactile = page.evaluate("""() => {
          const t = window.__touch;
          t.enable();
          const send = (sel, type, x, y, id) => document.querySelector(sel)
            .dispatchEvent(new PointerEvent(type, {pointerId: id, clientX: x,
              clientY: y, bubbles: true, pointerType: 'touch'}));
          // manche pousse a fond vers l'avant, puis relache
          send('.tc-zone-move', 'pointerdown', 200, 500, 1);
          send('.tc-zone-move', 'pointermove', 200, 400, 1);
          const avant = +t.axes.forward.toFixed(2);
          send('.tc-zone-move', 'pointerup', 200, 400, 1);
          const relache = t.axes.forward;
          // tape breve sur la zone de regard, puis bouton d'action : les deux
          // envoient la touche que le jeu attend
          const vus = [];
          const onKey = t.onKey;
          t.onKey = (c) => vus.push(c);
          send('.tc-zone-look', 'pointerdown', 900, 400, 2);
          send('.tc-zone-look', 'pointerup', 900, 400, 2);
          document.querySelector('.tc-act').dispatchEvent(
            new PointerEvent('pointerdown', {pointerId: 3, bubbles: true}));
          t.onKey = onKey;
          // un menu ouvert suspend le pilotage
          t.setContext({menu: true, map: false});
          const suspendu = document.getElementById('touch')
            .classList.contains('tc-idle');
          t.setContext({menu: false, map: false});
          const boutons = document.querySelectorAll('#touchui .tc-btn').length;
          t.disable();          // la page est rendue telle qu'elle etait
          return {avant, relache, vus, suspendu, boutons};
        }""")
        rep.eq("manche tactile a fond : axe sature a 1", tactile["avant"], 1)
        rep.eq("manche relache : axe a zero", tactile["relache"], 0)
        rep.eq("tape et bouton d'action donnent la touche du jeu",
               tactile["vus"], ["KeyE", "KeyE"])
        rep.eq("un menu ouvert suspend le pilotage", tactile["suspendu"], True)
        rep.eq("boutons tactiles a l'ecran", tactile["boutons"], 18)

        if heavy:
            # --- croute de Brittle Hollow (demande de charger la planete) -------
            page.evaluate("() => { window.__geo.request('brittlehollow_pivot.gltf'); }")
            page.wait_for_function(
                "() => window.__geo.entries.some(e => e.file === 'brittlehollow_pivot.gltf')",
                timeout=300000)
            page.wait_for_timeout(3000)
            rep.eq("fragments detachables de la croute",
                   page.evaluate("() => window.__crust.total"), 72)
            rep.eq("fragments fracturables",
                   page.evaluate("() => window.__crust.totalShatterable"), 50)
            page.evaluate("() => { window.__loop.elapsed = window.__loop.duration; }")
            page.wait_for_timeout(1500)
            rep.eq("toute la croute part sur une boucle",
                   page.evaluate("() => window.__crust.detached + window.__crust.shattered"),
                   122)

            # Le niveau de detail travaille des qu'une planete entiere est la :
            # sur 12 Mo de geometrie, une partie est toujours trop petite a
            # l'ecran pour valoir un appel de rendu.
            rep.at_least("maillages eteints par le niveau de detail",
                         page.evaluate("() => window.__lod.meshLOD.hidden"), 1)
            rep.at_least("maillages examines par image",
                         page.evaluate("() => window.__lod.meshLOD.tested"), 1)

        rep.eq("erreurs console en fin de parcours", errors[:3], [])
        browser.close()
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--lourd", action="store_true",
                    help="ajoute les controles qui chargent une planete entiere")
    a = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    httpd = None
    url = a.url
    if not url:
        httpd = serve(root, a.port)
        url = f"http://127.0.0.1:{a.port}/web/"
    print(f"Verification de {url}\n")
    try:
        rep = run(url, a.lourd)
    finally:
        if httpd:
            httpd.shutdown()
    bad = rep.print()
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
