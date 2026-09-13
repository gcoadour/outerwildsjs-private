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

Le moteur ne demarre qu'une fois le build fourni a la page : les controles qui
suivent supposent donc une extraction. Elle vit dans le stockage prive de
l'origine, donc dans un PROFIL de navigateur, et le port fait partie de
l'origine — un profil rempli sur le port 8102 est vide sur le 8099.

Usage:
  # premiere fois : on depose l'archive, le profil garde l'extraction
  python3 tools/15_verify.py --profil work/profil --zip work/downloads/OuterWilds_Alpha_1_2_Linux.zip
  # ensuite : le profil suffit, et c'est bien plus rapide
  python3 tools/15_verify.py --profil work/profil
  python3 tools/15_verify.py --url http://localhost:8080/web/
  python3 tools/15_verify.py --lourd          # ajoute les controles lents
"""
import argparse
import http.server
import json
import os
import shutil
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
    """Sert le depot en tache de fond, comme web/serve.sh.

    A une difference pres, et elle a coute une demi-heure : on annonce
    `no-store`. `http.server` n'envoie aucun `Cache-Control`, Chromium applique
    alors sa mise en cache HEURISTIQUE, et un profil persistant garde donc les
    modules de la session precedente. Le symptome est parfaitement trompeur —
    « le module ne fournit pas d'export nomme X » alors que le fichier sur le
    disque l'exporte — et il ne se produit QU'avec `--profil`, jamais en
    `--repli`, qui repart d'un profil vide.
    """
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    handler = type("H", (http.server.SimpleHTTPRequestHandler,),
                   {"directory": root,
                    "end_headers": end_headers,
                    "log_message": lambda *a, **k: None})
    # un port laisse en TIME_WAIT par une execution precedente ne doit pas
    # empecher la suivante
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run_repli(url):
    """Demarre le moteur SANS le build, et verifie qu'il demarre.

    Le mode ordinaire exige une extraction : il quitte avec le code 2 quand la
    page attend encore son fichier. L'integration continue n'a donc aucun
    controle NAVIGATEUR — `check-modules.mjs` compile les modules du moteur
    mais ne les execute pas, et une erreur d'execution dans `boot()` attendait
    jusqu'ici qu'un humain ouvre la page.

    Ce mode-ci comble exactement cela. Il charge Babylon, entre dans `main.js`
    en sautant le portique, et ne verifie que ce qui ne demande aucune donnee :
    que rien ne leve, que les systemes sont montes, et que la couleur du ciel
    est bien celle qu'on a posee. Les replis sont un chemin garde par CLAUDE.md
    (« la page doit rester ouvrable sans le build ») : le voici garde pour de
    bon.

    SA LIMITE, ET ELLE EST REELLE. Sans donnees, des branches entieres de la
    boucle ne s'executent pas — il n'y a ni secteur, ni decor, ni sonde. Ce
    mode a laisse passer un `ambientStep is not defined` que le mode complet a
    trouve : l'appel vit dans une branche qui demande un secteur. Il attrape ce
    qui casse au DEMARRAGE, pas ce qui casse en jouant.
    """
    from playwright.sync_api import sync_playwright

    rep = Report()
    with sync_playwright() as p:
        args = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"]
        exe = CHROMIUM if os.path.exists(CHROMIUM) else None
        browser = p.chromium.launch(executable_path=exe, args=args)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url, wait_until="load", timeout=90000)
        # On saute le portique : il attend un fichier qu'on n'a pas, et ce n'est
        # pas lui qu'on verifie ici.
        page.evaluate("""async () => {
          const load = (src) => new Promise((ok, ko) => {
            const s = document.createElement('script');
            s.src = src; s.onload = ok; s.onerror = () => ko(new Error(src));
            document.head.appendChild(s);
          });
          await load('vendor/babylon.js');
          await load('vendor/babylonjs.loaders.min.js');
          try { await load('vendor/HavokPhysics_umd.js'); } catch (e) { /* repli */ }
          const g = document.getElementById('gate');
          if (g) g.hidden = true;
          document.body.classList.add('playing');
          await import('./src/main.js');
        }""")
        page.wait_for_function("window.__ready===true", timeout=180000)
        page.wait_for_timeout(4000)

        rep.eq("aucune erreur d'execution sans le build", errors[:3], [])
        # Les systemes montes par `boot()`. Chacun est un lot de la serie
        # docs/47 a docs/58 : s'il manque, c'est que `boot()` s'est arrete avant.
        for nom, expr in [
            ("effets d'image montes", "!!window.__fx"),
            ("etat du joueur monte", "!!window.__joueur"),
            ("tour de lancement montee", "!!window.__tour"),
            ("interrupteur du regard monte", "!!window.__regard"),
            ("casque et alarmes montes", "!!window.__casque"),
            ("queue du recensement montee", "!!window.__queue"),
            ("impostures montees", "!!window.__impostures"),
            ("carte montee", "!!window.__map"),
            ("monde monte", "!!window.__world"),
        ]:
            rep.eq(nom, page.evaluate(f"() => {expr}"), True)

        # Le champ de vision vient du build quand il est la, et se SAIT repli
        # sinon. Les deux moities comptent (docs/47-effets-image.md).
        rep.eq("champ de vision de la camera (degres)",
               page.evaluate("() => Math.round(window.__fx.reglagesCam.fov)"), 70)
        rep.eq("et il se sait repli sans le build",
               page.evaluate("() => window.__fx.reglagesCam.declared"), False)

        # La couleur du ciel, apres la chaine d'effets d'image. `clearColor` vaut
        # (0,02 ; 0,02 ; 0,05), soit (5, 5, 13) sur 255 : si une passe teintait
        # l'ecran, ce controle le dirait.
        png = page.screenshot()
        rep.eq("le ciel sort de la chaine d'effets inchange",
               pixel_png(png, 20, 20), (5, 5, 13))

        browser.close()
    return rep


def pixel_png(data, x, y):
    """Un pixel d'un PNG, sans dependance : on relit le flux zlib nous-memes."""
    import struct
    import zlib

    pos, width, height, raw, canaux = 8, 0, 0, b"", 4
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            width, height = struct.unpack(">II", body[:8])
            profondeur, couleur = body[8], body[9]
            if profondeur != 8:
                raise ValueError(f"PNG en {profondeur} bits, non gere")
            # Type 2 = RGB, 6 = RGBA. Chromium ecrit l'un ou l'autre selon la
            # version : le supposer est exactement ce qui a casse ce decodeur.
            canaux = {0: 1, 2: 3, 4: 2, 6: 4}.get(couleur)
            if canaux is None:
                raise ValueError(f"PNG de type {couleur}, non gere")
        elif kind == b"IDAT":
            raw += body
        pos += 12 + length
    pixels = zlib.decompress(raw)
    stride = width * canaux + 1     # les canaux, plus l'octet de filtre
    # Les lignes d'une capture Chromium sont filtrees ; on les defiltre.
    # On ne defiltre que jusqu'a la ligne demandee : une capture 1280x720
    # defiltree entierement en Python prend plusieurs secondes pour un pixel.
    prev = bytearray(width * canaux)
    ligne = prev
    for j in range(y + 1):
        f = pixels[j * stride]
        ligne = bytearray(pixels[j * stride + 1:(j + 1) * stride])
        for i in range(len(ligne)):
            a = ligne[i - canaux] if i >= canaux else 0
            b = prev[i]
            c = prev[i - canaux] if i >= canaux else 0
            if f == 1:
                ligne[i] = (ligne[i] + a) & 255
            elif f == 2:
                ligne[i] = (ligne[i] + b) & 255
            elif f == 3:
                ligne[i] = (ligne[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                ligne[i] = (ligne[i] + pr) & 255
        prev = ligne
    o = x * canaux
    return (ligne[o], ligne[o + 1], ligne[o + 2])


def run(url, heavy, profil=None, zip_path=None):
    from playwright.sync_api import sync_playwright

    rep = Report()
    with sync_playwright() as p:
        args = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"]
        exe = CHROMIUM if os.path.exists(CHROMIUM) else None
        # Sans profil persistant, le stockage prive de l'origine est vide a
        # chaque lancement : la page reste sur son ecran d'accueil et rien de ce
        # qui suit n'a de sens. C'est pourquoi ces controles ne se mesuraient
        # jusqu'ici que sur le systeme de substitution.
        if profil:
            # Le cache HTTP du profil, et lui seul.
            #
            # `no-store` empeche Chromium de GARDER une reponse ; il n'efface
            # pas celles qu'il garde deja. Un profil qui a servi a autre chose
            # — une mise au point, une version d'avant — peut donc rendre un
            # module perime sans meme demander au serveur, et le symptome est
            # celui-la : « le module ne fournit pas d'export nomme X », alors
            # que le fichier sur le disque l'exporte (docs/62-visee.md).
            #
            # On vide donc le cache et lui seul : l'extraction vit dans le
            # stockage prive de l'origine, qui est ailleurs et qu'on garde.
            for sous in ("Cache", "Code Cache", "GPUCache", "Service Worker/CacheStorage"):
                shutil.rmtree(os.path.join(profil, "Default", sous), ignore_errors=True)
            browser = p.chromium.launch_persistent_context(
                profil, executable_path=exe, args=args,
                viewport={"width": 1280, "height": 720})
            page = browser.pages[0] if browser.pages else browser.new_page()
        else:
            browser = p.chromium.launch(executable_path=exe, args=args)
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
        # L'ecran d'accueil demande le fichier de l'alpha, puis un clic. Sans
        # profil persistant il n'y a rien a franchir : la page va droit au
        # moteur avec son systeme de substitution.
        page.wait_for_timeout(3000)
        if page.locator("#gate-play").count():
            if zip_path and not page.locator("#gate-step-done").is_visible():
                page.set_input_files("#gate-file", zip_path)
                page.wait_for_selector("#gate-step-done", state="visible",
                                       timeout=3_000_000)
            if page.locator("#gate-step-done").is_visible():
                weight["total"] = 0        # l'extraction n'est pas le demarrage
                page.click("#gate-play")
            elif not zip_path:
                # Le moteur ne demarre pas tant que le build n'a pas ete fourni :
                # la page reste sur son ecran d'accueil. Le dire tout de suite
                # vaut mieux que cinq minutes d'attente et une trace d'appel.
                print("La page attend le fichier de l'alpha, et le profil est vide.\n"
                      "  Donnez --zip chemin/vers/OuterWilds_Alpha_1_2_Linux.zip,\n"
                      "  ou --profil vers un profil Chromium ou l'extraction est faite.\n"
                      "  Sans build, il n'y a pas de moteur a verifier.")
                browser.close()
                sys.exit(2)
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

        # les invites de la carte, de priorite 2, doivent evincer les autres.
        # La carte est sur ENTREE dans le build (canal `Map`), pas sur M
        # (docs/61-commandes.md).
        page.keyboard.press("Enter")
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
        page.keyboard.press("Enter")
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

        # --- rotation propre des corps ------------------------------------------
        #
        # Elle s'applique au REPERE ancre, pas a la geometrie : le ciel tourne,
        # le sol ne bouge pas. C'est ce que ces deux mesures separent — l'azimut
        # du soleil vu du sol change, la position du corps ancre non.
        monde = page.evaluate("""() => {
          const sun = window.__bodies.find(b => (b.gravity.surfaceAcceleration || 0) >= 50);
          const az = (p) => Math.atan2(p[2], p[0]);
          return { corps: window.__spin.count,
                   azimut: sun ? az(sun.position) : null,
                   ancre: window.__bodies.map(b => Math.hypot(...b.position) < 1e-6)
                            .filter(Boolean).length };
        }""")
        rep.at_least("corps qui tournent sur eux-memes", monde["corps"], 1)
        rep.eq("le corps ancre reste a l'origine de son repere", monde["ancre"], 1)
        page.wait_for_timeout(1500)
        azimut2 = page.evaluate("""() => {
          const sun = window.__bodies.find(b => (b.gravity.surfaceAcceleration || 0) >= 50);
          return sun ? Math.atan2(sun.position[2], sun.position[0]) : null;
        }""")
        rep.check("l'azimut du soleil change avec le temps",
                  monde["azimut"] is not None and azimut2 is not None
                  and abs(azimut2 - monde["azimut"]) > 1e-6,
                  azimut2, f"!= {monde['azimut']}")

        # --- ce que le build portait et que rien ne lisait ----------------------
        #
        # Un compte nul n'est pas forcement un echec du portage : il dit que
        # l'alpha ne pose pas cette chose-la. On mesure donc, et on affiche.
        w = page.evaluate("""() => ({
          lumieres: window.__world.lighting.total,
          allumees: window.__world.lighting.count,
          champs: window.__world.dirFields.length,
          fluides: window.__world.fluids.count,
          oxygene: window.__world.oxygen.length,
          chaleur: window.__world.heat.length,
          controleurs: window.__world.controllers.length,
          seuilsLOD: window.__lod.seuils,
        })""")
        rep.at_least("lumieres extraites de la scene", w["lumieres"], 1)
        rep.at_most("lumieres allumees a la fois", w["allumees"], 8)
        for label, key in [("champs de force directionnels", "champs"),
                           ("volumes de fluide", "fluides"),
                           ("zones d'oxygene", "oxygene"),
                           ("sources de chaleur", "chaleur"),
                           ("controleurs de dialogue", "controleurs"),
                           ("seuils de niveau de detail du build", "seuilsLOD")]:
            rep.at_least(label, w[key], 0)

        # --- brouillard : les RenderSettings, non plus recopies ------------------
        rs = page.evaluate("() => ({ couleur: window.__fog.fog.color,"
                           " mode: window.__fog.fog.mode })")
        rep.eq("mode de brouillard lu dans la scene", rs["mode"], "exp2")
        # Le gris moyen attendu ici etait la couleur RECOPIEE, celle que la
        # mesure a dementie (docs/29-brouillards.md, docs/36-audit.md) : les
        # RenderSettings de level0 donnent un vert-gris tres sombre. Ce
        # controle gardait donc la valeur fausse.
        rep.eq("couleur de brouillard lue dans la scene",
               [round(c, 3) for c in rs["couleur"]], [0.146, 0.157, 0.14])

        # --- marche, saut et sac dorsal -----------------------------------------
        #
        # docs/36-audit.md §2.1. Ce qui ne se verifie qu'ici : que le joueur
        # ATTEINT sa vitesse de marche sur le terrain reel, sous Havok, et
        # qu'il ne brule pas de carburant en marchant. Le modele lui-meme est
        # eprouve sans le jeu par tests/09-jeu.mjs.
        pc = page.evaluate("() => window.__player ? window.__player.c : null")
        if pc:
            rep.eq("vitesse de marche du build", pc.get("groundSpeed"), 7)
            rep.eq("vitesse de pas de cote", pc.get("strafeSpeed"), 5)
            rep.eq("vitesse de saut", pc.get("jumpSpeed"), 6)
            rep.eq("poussee verticale de surface", pc.get("surfaceVerticalThrust"), 12)
            rep.eq("poussee laterale de surface", pc.get("surfaceLateralThrust"), 5)
            rep.eq("poussee du sac dorsal loin de tout",
                   pc.get("maxTranslationalThrust"), 7)

        # On attend d'etre pose, puis on marche une seconde. Le joueur apparait
        # en l'air : sans appui, il n'y a pas de marche a mesurer, et le
        # controle le dit plutot que d'echouer sur un temps d'attente.
        #
        # Le delai est genereux, et il le faut : le temps SIMULE d'une image est
        # plafonne a 0,05 s, et un rendu logiciel qui tient une image par
        # seconde avance donc vingt fois moins vite qu'une montre. Depuis que le
        # baton a guimauve est dans la main — huit maillages plein cadre, que
        # swiftshader remplit pixel par pixel — la chute prend plusieurs
        # dizaines de secondes de montre (docs/64-mains.md).
        pose = True
        try:
            page.wait_for_function("window.__player && window.__player.grounded",
                                   timeout=180000)
        except Exception:
            pose = False
        rep.eq("le joueur finit par se poser", pose, True)

        # --- le depart de la partie (docs/38-depart.md) -------------------------
        #
        # Ce qui ne se verifie qu'ici : que le joueur se pose LA OU le build le
        # fait apparaitre — le pose lui-meme est eprouve sans le jeu par
        # tests/09-jeu.mjs — et que ses yeux sont bien au-dessus de lui, sur la
        # verticale LOCALE. Le decalage etait applique sur Y du repere de
        # travail : ailleurs qu'au pole, il portait la camera de cote.
        depart = page.evaluate("""() => {
          const s = window.__start;
          if (!s || !s.pose) return null;
          const p = window.__player, f = p.field;
          const u = f ? [-f.dir.x, -f.dir.y, -f.dir.z] : [0, 1, 0];
          const e = s.eye();
          const haut = e.x * u[0] + e.y * u[1] + e.z * u[2];
          return {
            derive: Math.hypot(p.pos.x - s.pose.position[0],
                               p.pos.y - s.pose.position[1],
                               p.pos.z - s.pose.position[2]),
            haut,
            cote: Math.hypot(e.x - haut * u[0], e.y - haut * u[1],
                             e.z - haut * u[2]),
            marche: s.walk, oriente: s.pose.oriented, rayon: s.pose.radius,
          };
        }""")
        if depart:
            rep.eq("le regard de depart vient du build", depart["oriente"], True)
            rep.near("les yeux sont a 1,2 u au-dessus du joueur",
                     round(depart["haut"], 3), 1.2, 0.05)
            rep.at_most("... et exactement au-dessus, pas de cote",
                        round(depart["cote"], 3), 0.01)
            # On tombe d'une garde d'un demi-metre, pas de quarante unites.
            rep.at_most("on se pose au point d'apparition",
                        round(depart["derive"], 2), 10)
            # 471 u sur Timber Hearth : on demarre au village, pas au vaisseau.
            rep.at_least("le vaisseau est a distance de marche",
                         round(depart["marche"] or 0, 0), 100)
        carburant0 = page.evaluate("() => window.__resources.fuel")
        if pose:
            page.keyboard.down("w")
            page.wait_for_timeout(1000)
            marche = page.evaluate("""() => {
              const p = window.__player, f = p.field;
              if (!f) return null;
              const u = [-f.dir.x, -f.dir.y, -f.dir.z];
              const vn = p.vel.x * u[0] + p.vel.y * u[1] + p.vel.z * u[2];
              return { tangentielle: Math.hypot(p.vel.x - vn * u[0],
                                                p.vel.y - vn * u[1],
                                                p.vel.z - vn * u[2]),
                       sacDorsal: p.jetpack, ausol: p.grounded };
            }""")
            page.keyboard.up("w")
            if marche:
                rep.eq("on marche au sol, pas a la poussee", marche["ausol"], True)
                rep.near("vitesse de marche atteinte", marche["tangentielle"],
                         (pc or {}).get("groundSpeed", 7), 1.5)
                rep.eq("le sac dorsal ne s'allume pas en marchant",
                       marche["sacDorsal"], False)
            # Il peut RECHARGER (zone d'oxygene, vaisseau) : ce qu'on interdit,
            # c'est qu'il baisse. `thrusting` valait vrai des qu'une touche de
            # deplacement etait tenue (docs/36-audit.md §1.1).
            fuel1 = page.evaluate("() => window.__resources.fuel")
            rep.check("marcher ne brule pas de carburant",
                      fuel1 >= carburant0 - 0.01, round(fuel1, 3),
                      f">= {round(carburant0, 3)}")

            # Saut : l'espace saute (`Jump`), la majuscule pousse (`Move Up`).
            # Ce sont DEUX canaux du build, et le portage les avait sur une
            # seule touche (docs/61-commandes.md).
            page.keyboard.press("Space")
            page.wait_for_timeout(120)
            rep.eq("le saut quitte le sol",
                   page.evaluate("() => window.__player.grounded"), False)

        # --- inertie de rotation du vaisseau ------------------------------------
        #
        # `_usePhysicsToRotate` vaut vrai : le vaisseau porte son quaternion et
        # la camera le suit, au lieu de lui coller (docs/36-audit.md §2.2).
        rot = page.evaluate("""() => {
          const s = window.__shipRef;
          return s ? { physique: s.usePhysicsToRotate, couple: s.rotationalThrust,
                       trainee: s.angularDrag, quat: s.quat.length } : null;
        }""")
        if rot:
            rep.eq("le vaisseau tourne par la physique", rot["physique"], True)
            rep.eq("poussee rotationnelle du build", rot["couple"], 2)
            # `_angularDrag` est un flottant 32 bits du build : il vaut
            # 0,9200000166893005 une fois elargi, et l'egalite stricte le
            # refusait. Ce controle ne passait donc jamais sur un vrai build —
            # ce que personne ne pouvait voir tant qu'il tournait sur le
            # systeme de substitution.
            rep.near("trainee angulaire du build", rot["trainee"], 0.92, 1e-6)
            rep.eq("il porte son propre quaternion", rot["quat"], 4)

        # --- colliders par groupe de niveau de detail ---------------------------
        #
        # A8 requalifiee : ce ne sont pas les LODGroup mais les 21
        # `ChildColliderLOD` qui font tomber les colliders (§2.8).
        col = page.evaluate("() => window.__world.colliderLOD || null")
        if col:
            rep.at_least("groupes de colliders lus", col["groupes"], 0)
            rep.at_most("groupes eveilles", col["eveilles"], col["groupes"])

        # --- les lots de docs/46 ------------------------------------------------
        #
        # Ce qui ne se verifie QUE dans un navigateur : les positions du moment.
        # Les volumes extraits sont poses a la position de la scene au REPOS, et
        # les corps orbitent ; c'est ici, profil rempli, que la derive se voit.
        lots = page.evaluate("""() => {
          const L = window.__lots;
          if (!L) return null;
          return {
            referentiels: L.declared.count,
            repere: L.declared.current && L.declared.current.body,
            arrivee: L.declared.current && L.declared.current.arrival,
            decors: L.decor.count, passages: L.passages.count,
            dangers: L.hazards.count, ramassages: L.pickups.length,
            evenements: L.events.count,
            equipement: L.equipment.probe,
            morts: Object.keys(window.__death.byCause).length,
          };
        }""")
        if lots:
            rep.eq("volumes de referentiel declares", lots["referentiels"], 14)
            # Le controle central du lot 1 : le joueur est POSE sur Timber
            # Hearth, donc dans le volume de referentiel de Timber Hearth. Sans
            # la correction de derive, ce champ valait `null` passe une
            # douzaine de secondes — la planete sortait de son propre volume.
            rep.eq("le referentiel declare du joueur", lots["repere"], "TimberHearth_Body")
            rep.eq("et sa distance d'arrivee vient du build", lots["arrivee"], 1000)
            rep.at_least("decors vivants rattaches", lots["decors"], 1)
            rep.eq("passages anciens suivis", lots["passages"], 6)
            rep.eq("volumes qui blessent", lots["dangers"], 1)
            rep.eq("objets a ramasser", lots["ramassages"], 2)
            rep.eq("emetteurs de son d'evenement", lots["evenements"], 22)
            # Le volume de destruction du soleil est une sphere de 2 000 unites
            # centree sur l'origine du MONDE : teste avec une position du repere
            # ancre, il tuait le joueur des la premiere image.
            rep.eq("aucune mort en cours de parcours", lots["morts"], 0)
            # L'equipement se ramasse : la sonde n'est pas donnee.
            rep.eq("la sonde n'est pas donnee au depart", lots["equipement"], False)

        # --- la sonde, telle que le build la lance (docs/60-sonde.md) -----------
        #
        # Elle ne part qu'une fois RAMASSEE (docs/46, lot 7) : le portage la
        # donnait d'emblee, le build la met dans la cabine. Et elle ne part plus
        # a l'appui : on TIENT pour charger, on relache pour lancer.
        #
        # Le rythme d'images compte ici, et il a couche ce controle : sous
        # swiftshader une image peut durer une seconde, et `keyboard.press()`
        # fait l'appui et le relachement dans la meme milliseconde. Le moteur
        # retient donc les relachements jusqu'a la fin de l'image — sinon la
        # frappe entiere tombe entre deux images, comme dans Unity qui latche
        # `GetButtonDown` — et il faut LAISSER PASSER une image apres chaque
        # geste avant de mesurer.
        def sonde_geste(duree_ms, attente_ms=9000):
            # Le bouton DROIT : `InputChannels.probe` est `mouse 1`, et les
            # trois statiques d'`OWInput` qui lancent, photographient et
            # rappellent sont construites dessus.
            page.mouse.down(button="right")
            page.wait_for_timeout(duree_ms)
            page.mouse.up(button="right")
            page.wait_for_timeout(attente_ms)

        def etat_sonde():
            return page.evaluate("""() => {
              const t = window.__tools.probes, p = t.last;
              return { active: t.active, launched: t.launched,
                       ancree: !!(p && p.anchored),
                       lanterne: p ? Math.round(p.lantern) : 0,
                       vitesse: p ? Math.round(Math.hypot(...p.vel)) : 0,
                       cams: (window.__scene || BABYLON.Engine.LastCreatedScene)
                               .activeCameras.map(c => c.name) };
            }""")

        sonde_geste(120)
        # Tant que la vue de sonde n'est pas ouverte, la scene n'a pas de liste
        # de cameras actives : c'est `activeCamera` au singulier qui rend.
        rep.eq("sans la sonde, la touche ne lance rien", etat_sonde()["cams"], [])
        page.evaluate("() => window.__lots.equipment.pickUp(window.__lots.pickups"
                      ".find(p => p.probe))")
        # La FENETRE DE TIR : tant que `KnowsHowProbesWork` est faux, le build
        # exige DEUX CENTS metres de degage devant soi — c'est le garde-fou du
        # premier lancement, qui refuse de laisser la sonde partir dans un mur
        # ou elle ne montrerait rien. Debout au village, il refuse.
        #
        # Le savoir est PERSISTANT : une fois appris, il l'est pour le profil.
        # On le remet a faux avant de mesurer, sinon ce controle ne passe qu'a
        # la premiere execution sur un profil neuf — et un test qui ne passe
        # qu'une fois est un test qui ment la seconde.
        rep.eq("on ignore encore comment marchent les sondes",
               page.evaluate("""() => { const d = window.__pdata;
                 d.knowsHowProbesWork = false; d.save();
                 return d.knows('knowsHowProbesWork'); }"""),
               False)
        sonde_geste(120)
        rep.eq("et la fenetre de deux cents metres refuse le tir",
               etat_sonde()["launched"], 0)
        # Une fois le geste appris, cinq metres suffisent.
        page.evaluate("() => window.__pdata.learn('knowsHowProbesWork')")
        sonde_geste(120)
        etat = etat_sonde()
        rep.eq("une fois le geste appris, elle part", etat["launched"], 1)
        rep.eq("et il n'y en a qu'UNE", etat["active"], 1)
        rep.eq("la sonde allume sa camera", etat["cams"], ["cam", "probeCam"])
        rep.eq("cadre de la vue de sonde",
               page.evaluate("() => !document.querySelector('.ow-probeview').hidden"), True)
        # Le meme bouton ne relance rien tant qu'une sonde existe : c'est
        # `_activeProbe`, un champ et non une liste.
        sonde_geste(120)
        rep.eq("un second appui ne lance pas de seconde sonde",
               etat_sonde()["launched"], 1)
        # Maintenir RAPPELLE la sonde. Le seuil est de trois dixiemes de seconde
        # de temps SIMULE, et le temps simule d'une image est plafonne a 0,05 :
        # sous swiftshader, ou une image peut durer une seconde, trois dixiemes
        # de jeu demandent plusieurs secondes de montre. On tient donc jusqu'a
        # ce que ca arrive plutot que de parier sur un delai — le chiffre, lui,
        # est garde par `tests/09-jeu.mjs`.
        page.mouse.down(button="right")
        try:
            page.wait_for_function("() => window.__tools.probes.active === 0",
                                   timeout=60000)
        except Exception:
            pass
        finally:
            page.mouse.up(button="right")
        page.wait_for_timeout(2000)
        apres = etat_sonde()
        rep.eq("maintenir le bouton rappelle la sonde", apres["active"], 0)
        # `['cam']` et non `[]` : une fois la liste de cameras actives etablie,
        # `ProbeCamera` y LAISSE celle du joueur seule. Une liste vide donnerait
        # un ecran noir, et c'est ecrit dans `tools.js`.
        rep.eq("et la vue se referme", apres["cams"], ["cam"])
        rep.eq("le cadre aussi",
               page.evaluate("() => document.querySelector('.ow-probeview').hidden"), True)

        # --- les commandes du build (docs/61-commandes.md) ----------------------
        #
        # Elles viennent de l'`InputManager` de `mainData`, extrait en
        # `data/input.json`. Ce qui se verifie ICI et nulle part ailleurs, c'est
        # qu'un VRAI bouton de souris arrive : Babylon appelle `preventDefault()`
        # sur `pointerdown`, ce qui supprime les evenements souris de
        # compatibilite, et un `mousedown` pose sur la fenetre ne se declenche
        # jamais. Aucun test sans navigateur ne peut le voir.
        rep.eq("les liaisons viennent du build, pas du repli",
               page.evaluate("() => window.__commandes.fallback"), False)
        rep.eq("vingt-deux canaux",
               page.evaluate("() => [...window.__commandes.canaux.keys()]"
                             ".filter(n => !window.__commandes.get(n).ajout).length"), 22)
        rep.eq("le pas de physique du jeu",
               page.evaluate("() => window.__commandes.fixedTimestep"), 0.016)
        # La lunette est le clic du MILIEU, et c'est un vrai clic.
        page.mouse.move(640, 360)
        page.mouse.down(button="middle")
        page.mouse.up(button="middle")
        page.wait_for_timeout(600)
        rep.eq("le clic du milieu ouvre la lunette",
               page.evaluate("() => window.__tools.telescope.active"), True)
        page.mouse.down(button="middle")
        page.mouse.up(button="middle")
        page.wait_for_timeout(600)
        rep.eq("et la referme",
               page.evaluate("() => window.__tools.telescope.active"), False)
        # La lampe est sur F, pas sur L.
        allumee = page.evaluate("() => window.__consoles.flashlight.on")
        page.keyboard.press("KeyF")
        page.wait_for_timeout(300)
        rep.eq("F allume la lampe",
               page.evaluate("() => window.__consoles.flashlight.on"), not allumee)
        page.keyboard.press("KeyF")
        page.wait_for_timeout(300)

        # --- ce que le jeu annonce, lot 2 (docs/67-annonces.md) -----------------
        #
        # Manger une guimauve rend TOUTE la sante : deux lignes d'IL, et le
        # soin du jeu. Le portage comptait les guimauves sans rien en faire.
        soin = page.evaluate("""() => {
          const r = window.__resources, m = window.__consoles.marshmallow;
          const avant = r.health;
          r.health = 20;
          m.held = true; m.toast = 1;                 // assez grillee
          const mange = m.eat();
          const apres = r.health;
          r.health = avant;
          return { mange, apres, max: r.maxHealth };
        }""")
        rep.eq("la guimauve se mange", soin["mange"], True)
        # Le soin passe par `command()`, pas par `eat()` : on mesure donc la
        # regle a part, la ou elle est ecrite.
        rep.eq("et manger rend toute la sante", page.evaluate(
            "() => { const r = { health: 3, maxHealth: 100, dead: true };"
            "  return [window.__soin(r), r.health, r.dead].join(','); }"),
            "97,100,false")
        # Le mur qui reclame la combinaison : il repousse tant qu'on n'en a pas.
        rep.eq("le mur reclame la combinaison", page.evaluate(
            "() => { const b = [{ kind: 'barrier', position: [0,0,0],"
            "   volume: { shape: 'box', size: [10,10,10] } }];"
            "  const nu = { suit: false }, vetu = { suit: true };"
            "  return [!!window.__mur(b, [4,0,0], nu),"
            "          window.__mur(b, [4,0,0], vetu) === null].join(','); }"),
            "true,true")

        # --- l'allumage du vaisseau (docs/66-allumage.md) -----------------------
        #
        # Un vaisseau pose ne decolle pas a l'appui : il s'ALLUME une seconde,
        # et relacher annule. Ce controle mesure l'ETAT du modele, pas un vol —
        # faire decoller le vaisseau demanderait d'y monter, et le temps simule
        # d'une image plafonne a 0,05 s.
        allumage = page.evaluate("""() => {
          const s = window.__shipRef;
          if (!s) return null;
          const avant = { landed: s.landed, igniting: s.igniting };
          s.landed = true;
          const t0 = s.ignition(0.1, 1);         // l'appui allume
          const debut = s.events.slice();
          const t1 = s.ignition(0.5, 1);         // pendant, rien
          const t2 = s.ignition(0.5, 1);         // la seconde passee, ca pousse
          const fin = s.events.slice();
          const t3 = s.ignition(0.1, 0);         // relacher, hors allumage
          s.landed = avant.landed; s.igniting = avant.igniting;
          s.ignitionTime = 0;
          return { duree: s.ignitionDuration, t0, t1, t2, t3, debut, fin };
        }""")
        if allumage:
            rep.eq("une seconde d'allumage", allumage["duree"], 1)
            rep.eq("l'appui ne pousse pas encore", allumage["t0"], 0)
            rep.eq("et l'annonce", allumage["debut"], ["StartShipIgnition"])
            rep.eq("pendant l'allumage non plus", allumage["t1"], 0)
            rep.eq("la seconde passee, ca pousse", allumage["t2"], 1)
            rep.eq("et l'allumage est complet", allumage["fin"], ["CompleteShipIgnition"])

        # --- l'onde de la lunette (docs/65-onde.md) -----------------------------
        #
        # `DrawSoundWave` : cinq cents points, un par image, dans une boite du
        # coin de l'ecran. Au repos la ligne est plate au milieu ; elle ne se
        # trace que lunette ouverte, et la lunette GROSSIT avec le champ.
        rep.eq("l'onde est rangee lunette baissee",
               page.evaluate("() => document.querySelector('.ow-soundwave').hidden"),
               True)
        page.mouse.move(640, 360)
        page.mouse.down(button="middle")
        page.mouse.up(button="middle")
        page.wait_for_timeout(2500)
        onde = page.evaluate(
            "() => ({ cachee: document.querySelector('.ow-soundwave').hidden,"
            "   largeur: document.querySelector('.ow-soundwave').width,"
            "   lunette: window.__tools.telescope.active,"
            "   echelle: Math.round(window.__mains.enMain.get('telescopegui')"
            "              .racine.scaling.x * 100) / 100 })")
        rep.eq("la lunette est ouverte", onde["lunette"], True)
        rep.eq("l'onde se montre", onde["cachee"], False)
        rep.eq("cinq cents points", onde["largeur"], 500)
        # `TelescopeGUI.LateUpdate` : echelle = champ / 15. En entrant, le
        # champ vise 33,33 degres et le suivi met deux secondes a l'atteindre —
        # l'echelle est donc entre celle du repos (70/15) et celle de l'entree.
        rep.check("la lunette grossit avec le champ",
                  1 < onde["echelle"] <= 70 / 15 + 0.01, onde["echelle"],
                  "entre 1 et 4,67")
        page.mouse.down(button="middle")
        page.mouse.up(button="middle")
        page.wait_for_timeout(1500)
        rep.eq("et l'onde se range avec elle",
               page.evaluate("() => document.querySelector('.ow-soundwave').hidden"),
               True)

        # --- ce qu'on tient dans la main (docs/64-mains.md) ---------------------
        #
        # Le baton a guimauve et la lunette pendent sous `PlayerCamera` dans le
        # build : l'export partait des corps celestes, et aucun des deux n'etait
        # porte. Le baton porte les quatre seuls clips qui ne bouclent pas.
        mains = page.evaluate("""() => {
          const m = window.__mains, b = m.baton;
          const objet = m.enMain.get('marshmallowstick');
          return { charges: [...m.enMain.keys()].sort(),
                   dehors: b.out, clip: b.clip,
                   clips: objet ? [...objet.parNom.keys()].sort() : [],
                   lumieres: objet ? objet.lumieres.length : 0,
                   maillages: objet ? objet.meshes.length : 0 };
        }""")
        rep.eq("les deux objets en main sont charges", mains["charges"],
               ["marshmallowstick", "telescopegui"])
        rep.eq("le baton porte ses quatre clips", mains["clips"],
               ["PullOut", "PutBack", "Therm", "idle"])
        # Le glTF n'emporte pas de lumieres : ces deux-la sont posees par le
        # moteur, aux valeurs du prefabrique (`STICK_LIGHTS`).
        rep.eq("et ses deux lumieres", mains["lumieres"], 2)
        rep.at_least("avec de la geometrie", mains["maillages"], 5)
        rep.eq("le baton commence dehors", mains["dehors"], True)
        # `V` le range, et le build joue alors `PutBack`.
        page.keyboard.press("KeyV")
        page.wait_for_timeout(600)
        range_ = page.evaluate("""() => { const b = window.__mains.baton;
          return { dehors: b.out, clip: b.clip, lumieres: b.lights }; }""")
        rep.eq("V range le baton", range_["dehors"], False)
        rep.eq("et joue PutBack", range_["clip"], "PutBack")
        rep.eq("les lumieres s'eteignent", range_["lumieres"], False)
        page.keyboard.press("KeyV")
        page.wait_for_timeout(600)
        rep.eq("V le ressort", page.evaluate("() => window.__mains.baton.out"), True)

        # --- viser un referentiel (docs/62-visee.md) ----------------------------
        #
        # La cible se REGARDE : un clic gauche verrouille ce qu'on a devant soi,
        # un second sur la meme la relache. Le portage ne la choisissait que
        # dans la carte, et les trois canaux de vol du build ne pilotaient rien.
        page.mouse.move(640, 360)
        page.mouse.down(button="left"); page.mouse.up(button="left")
        page.wait_for_timeout(600)
        visee = page.evaluate("""() => { const l = window.__visee;
          return { cible: l.current ? l.current.name : null,
                   crochets: Math.round(l.bracket * 100) / 100,
                   carte: window.__map.selected ? window.__map.selected.name : null };
        }""")
        rep.check("le clic gauche vise un referentiel", visee["cible"] is not None,
                  visee["cible"], "!= None")
        rep.eq("et la carte tient la meme cible", visee["carte"], visee["cible"])
        rep.eq("les crochets se sont fermes", visee["crochets"], 0)
        page.mouse.down(button="left"); page.mouse.up(button="left")
        page.wait_for_timeout(600)
        rep.eq("un second clic la relache",
               page.evaluate("() => window.__visee.current"), None)
        rep.eq("et les crochets se rouvrent",
               page.evaluate("() => Math.round(window.__visee.bracket)"), 1)

        # --- coupure passe-bas des emetteurs -------------------------------------
        rep.at_least("sources reliees a un emetteur",
                     page.evaluate("() => window.__audioMix.transmitters"
                                   ".reduce((a, t) => a + t.sources.length, 0)"), 1)

        # --- commandes tactiles ------------------------------------------------
        #
        # Le navigateur de verification n'est pas tactile : on installe la
        # couche a la main, puis on lui envoie des evenements de pointeur. Ce
        # qui est verifie, c'est qu'elle produit les MEMES entrees que le
        # clavier — un axe analogique et des codes de touche — et que le
        # manche droit tourne bien la camera tant qu'il est tenu, ce qu'aucun
        # evenement de pointeur ne dit : c'est une vitesse, pas un deplacement.
        tactile = page.evaluate("""() => {
          const t = window.__touch;
          t.enable();
          const send = (sel, type, x, y, id) => document.querySelector(sel)
            .dispatchEvent(new PointerEvent(type, {pointerId: id, clientX: x,
              clientY: y, bubbles: true, pointerType: 'touch'}));
          const vus = [];
          const onKey = t.onKey, onLook = t.onLook;
          t.onKey = (c) => vus.push(c);
          let tourne = 0;
          t.onLook = (dx) => { tourne += dx; };

          // manche gauche pousse a fond vers l'avant : axe sature, et le cran
          // de course MONTE, depuis que l'accelerateur a disparu : le build
          // n'en a pas, et la majuscule y est `Move Up` (docs/61-commandes.md)
          send('.tc-zone-move', 'pointerdown', 200, 500, 1);
          send('.tc-zone-move', 'pointermove', 200, 400, 1);
          const avant = +t.axes.forward.toFixed(2);
          const course = t.axes.up;
          send('.tc-zone-move', 'pointerup', 200, 400, 1);
          const relache = t.axes.forward, apresCourse = t.axes.up;

          // manche droit tenu a fond : la camera tourne SANS que le doigt
          // bouge encore — c'est une vitesse, en pixels par seconde
          send('.tc-zone-look', 'pointerdown', 900, 400, 2);
          send('.tc-zone-look', 'pointermove', 1000, 400, 2);
          const glisse = Math.round(tourne);
          tourne = 0;
          t.applyLookRate(0.1);
          const vitesse = Math.round(tourne / 0.1);
          send('.tc-zone-look', 'pointerup', 1000, 400, 2);
          tourne = 0;
          t.applyLookRate(0.1);
          const arret = tourne;

          // tape breve sur le manche droit, puis bouton d'action : les deux
          // envoient la touche que le jeu attend
          send('.tc-zone-look', 'pointerdown', 900, 400, 3);
          send('.tc-zone-look', 'pointerup', 900, 400, 3);
          document.querySelector('.tc-act').dispatchEvent(
            new PointerEvent('pointerdown', {pointerId: 4, bubbles: true}));
          t.onKey = onKey; t.onLook = onLook;

          // un menu ouvert remplace la manette par la croix et les deux
          // boutons de reponse, et suspend le pilotage
          const vus_a_l_ecran = () =>
            [...document.querySelectorAll('#touchui .tc-btn')]
              .filter(b => b.offsetParent).map(b => b.getAttribute('aria-label'));
          t.setContext({menu: true, map: false});
          const suspendu = document.getElementById('touch')
            .classList.contains('tc-idle');
          const enMenu = vus_a_l_ecran();
          t.setContext({menu: false, map: false});
          const enVol = vus_a_l_ecran();

          // CE QUI COMPTE VRAIMENT : le pouce touche l'ecran, pas un element
          // choisi a la main. Un plan pose au-dessus des zones de pilotage les
          // rendrait muettes sans qu'aucun evenement envoye a la zone elle-meme
          // ne s'en apercoive — c'est exactement ce qui est arrive avec la
          // carte fermee, restee etendue sur tout l'ecran.
          const sous = (x, y) => { const el = document.elementFromPoint(x, y);
                                   return el ? String(el.className || el.id) : 'rien'; };
          const pouceGauche = sous(innerWidth * 0.15, innerHeight * 0.72);
          const pouceDroit = sous(innerWidth * 0.62, innerHeight * 0.72);

          const manches = document.querySelectorAll('#touch .tc-stick').length;
          const empreintes = document.querySelectorAll('#touch .tc-home').length;
          const boutons = document.querySelectorAll('#touchui .tc-btn').length;
          t.disable();          // la page est rendue telle qu'elle etait
          return {avant, course, relache, apresCourse, glisse, vitesse, arret,
                  vus, suspendu, manches, empreintes, boutons, enVol, enMenu,
                  pouceGauche, pouceDroit};
        }""")
        rep.eq("manche gauche a fond : axe sature a 1", tactile["avant"], 1)
        rep.eq("a fond devant : le cran de course fait MONTER", tactile["course"], True)
        rep.eq("manche relache : axe a zero", tactile["relache"], 0)
        rep.eq("manche relache : la montee s'arrete", tactile["apresCourse"], False)
        rep.eq("un manche par pouce", tactile["manches"], 2)
        rep.eq("empreinte sous chaque pouce", tactile["empreintes"], 2)
        rep.eq("glisser au manche droit garde son effet direct",
               tactile["glisse"], round(100 * 1.7))
        rep.eq("manche droit tenu a fond : rotation continue",
               tactile["vitesse"], 900)
        rep.eq("manche droit relache : plus de rotation", tactile["arret"], 0)
        rep.eq("tape et bouton d'action donnent la touche du jeu",
               tactile["vus"], ["KeyE", "KeyE"])
        rep.eq("un menu ouvert suspend le pilotage", tactile["suspendu"], True)
        # Rien au-dessus des zones de pilotage : le defaut qui rendait les deux
        # manches muets ne se voyait qu'ici.
        rep.eq("le pouce gauche atteint sa zone",
               "tc-zone-move" in tactile["pouceGauche"], True)
        rep.eq("le pouce droit atteint sa zone",
               "tc-zone-look" in tactile["pouceDroit"], True)
        # La disposition suit les canaux du build : plus d'accelerateur (il
        # n'existe pas), une DESCENTE au sac dorsal (elle existe et manquait),
        # et le saut a sa propre place — `Jump` et `Move Up` sont deux canaux.
        rep.eq("la manette en vol", tactile["enVol"],
               ["Telescope", "Sonde", "Carte du systeme", "Lampe",
                "Ordinateur de bord", "Affichage", "Menu",
                "Monter", "Descendre", "Sauter", "Interagir, parler"])
        rep.eq("un menu la remplace par la croix et les deux reponses",
               tactile["enMenu"],
               ["Haut", "Gauche", "Droite", "Bas", "Valider", "Retour"])
        rep.eq("boutons tactiles en tout", tactile["boutons"], 19)

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
    ap.add_argument("--profil", default=None,
                    help="dossier de profil Chromium ou l'extraction est deja faite ; "
                         "sans lui, la page tourne sur son systeme de substitution")
    ap.add_argument("--zip", dest="zip_path", default=None,
                    help="archive de l'alpha a deposer sur la page si le profil est vide")
    ap.add_argument("--repli", action="store_true",
                    help="demarre le moteur SANS le build et verifie qu'il demarre ; "
                         "le seul controle navigateur qui tourne sans les 289 Mo")
    a = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    httpd = None
    url = a.url
    if not url:
        httpd = serve(root, a.port)
        url = f"http://127.0.0.1:{a.port}/web/"
    print(f"Verification de {url}\n")
    try:
        rep = run_repli(url) if a.repli else run(url, a.lourd, a.profil, a.zip_path)
    finally:
        if httpd:
            httpd.shutdown()
    bad = rep.print()
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
