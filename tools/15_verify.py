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

# Le reveil, mesure dans la page. Sorti du corps de `_run` parce que son
# texte JavaScript contiendrait des guillemets triples au milieu d'une
# chaine qui en est deja faite.
# Les trois zones d'invites. Sorti du corps de `_run` pour la meme raison que
# `REVEIL_JS` : son JavaScript porte des guillemets triples.
INVITES_JS = '''() => {
  const p = window.__prompts;
  if (!p) return null;
  const avant = {};
  for (const z of ["center", "bottom", "left"]) {
    avant[z] = p.zones[z].innerHTML;
  }
  const lot = [{ text: "un", priority: 0 }, { text: "deux", priority: 3 }];
  const compte = (z) => {
    p.set(z, lot, 0);
    return p.zones[z].querySelectorAll(".ow-prompt").length;
  };
  const r = { centre: compte("center"), bas: compte("bottom"),
              gauche: compte("left") };
  // On remet la page telle qu'elle etait : un controle ne change rien.
  for (const z of ["center", "bottom", "left"]) {
    p.set(z, [], 0);
    p.zones[z].innerHTML = avant[z];
  }
  return r;
}'''

REVEIL_JS = '''() => {
  const r = window.__reveil;
  if (!r) return null;
  return { arme: r.arme, seuil: r.cfg.degreesY,
           attente: r.cfg.afterSeconds, taux: r.cfg.rate,
           // Le regard, dans la convention du BUILD : positif vers le haut.
           // Apres le recentrage il doit etre revenu pres de zero.
           degresY: Math.round(-window.__regardCam().pitch * 180 / Math.PI) };
}'''



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
        errors = _ERREURS_PAGE
        del errors[:]
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

        # L'ECLIPSE, et pourquoi elle se mesure ici.
        #
        # Babylon efface le tampon de profondeur devant chaque groupe de rendu.
        # La couronne de l'etoile est dans le groupe 1, additive, et montee des
        # la premiere image — `SunCoronaProgressBehavior` part a 0,12 d'alpha —
        # si bien qu'elle se peignait PAR-DESSUS la planete qui occultait
        # l'etoile : le soleil se voyait au travers des planetes. Rien sous Node
        # ne peut voir cela ; il faut un vrai tampon de profondeur.
        #
        # On pose donc la camera sur l'axe etoile-planete, au-dela de la
        # planete, et on lit DEUX pixels : le centre du disque occulte, qui doit
        # rester la nuit de la planete, et la couronne juste a cote, qui doit
        # rester visible. Le second compte autant que le premier — eteindre la
        # couronne ferait passer le premier tout seul.
        #
        # Ce controle prend la main sur la camera et arrete la boucle de rendu.
        # Il vient donc en DERNIER.
        page.evaluate("""() => {
          const scene = BABYLON.Engine.LastCreatedScene;
          scene.getEngine().stopRenderLoop();
          scene.onBeforeRenderObservable.clear();
          const p = scene.getMeshByName('Planete').position;
          const e = scene.getMeshByName('Etoile').position;
          const cam = scene.activeCamera;
          cam.position.copyFrom(p.add(p.subtract(e).normalize().scale(800)));
          cam.setTarget(e);
          scene.render();
          // On mesure le RENDU : le reticule de `DebugHUD`, une croix au
          // centre exact de l'ecran, tomberait sur le pixel qu'on lit.
          const r = document.getElementById('reticule');
          if (r) r.hidden = true;
        }""")
        vue = page.locator("canvas").first.screenshot()
        vp = page.viewport_size
        cx, cy = vp["width"] // 2, vp["height"] // 2
        # 0,6 de la demi-hauteur, soit 22,8 degres a 70 de champ vertical : au
        # large du limbe de la planete (17,4 degres a cette distance) et bien
        # dans la couronne (37 degres). Le canal rouge suffit a les separer —
        # l'orange de la couronne y monte a 67, la nuit de la planete a 7.
        rep.at_most("la planete occulte l'etoile, couronne comprise",
                    pixel_png(vue, cx, cy)[0], 12)
        rep.at_least("et la couronne reste visible a cote",
                     pixel_png(vue, cx, cy - int(cy * 0.6))[0], 40)

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


def extraction_perimee(profil):
    """
    L'extraction du profil est-elle plus vieille que le pipeline qui l'a faite ?

    LE PIEGE, paye en docs/71. `--profil` sans `--zip` reutilise l'extraction
    deja presente dans le stockage prive de l'origine. Un lot qui touche a un
    EXTRACTEUR ne change alors rien a ce que la page lit : les controles neufs
    mesurent les donnees d'avant, et ils echouent — ou pire, ils passent.

    C'est le meme genre de silence que le cache HTTP de docs/62, une couche plus
    loin : la page etait a jour, ses DONNEES ne l'etaient pas.

    Le test est grossier a dessein — des dates de fichiers, pas un hachage du
    contenu — et il suffit : ce qu'on veut attraper est « j'ai edite un
    extracteur et j'ai oublie de refaire l'extraction ».

    @returns une phrase a afficher, ou None si tout va bien
    """
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pipeline = os.path.join(racine, "web", "src", "pipeline")
    plus_recent, quoi = 0, None
    for base, _, fichiers in os.walk(pipeline):
        for f in fichiers:
            if not f.endswith((".js", ".json")):
                continue
            t = os.path.getmtime(os.path.join(base, f))
            if t > plus_recent:
                plus_recent, quoi = t, os.path.relpath(os.path.join(base, f), racine)
    # L'OPFS de Chromium vit sous `Default/File System`, et LUI SEUL.
    #
    # La premiere version regardait aussi `WebStorage`, ou Chromium touche
    # `QuotaManager-journal` A CHAQUE OUVERTURE du profil : la date etait donc
    # toujours fraiche, et ce garde-fou n'a jamais rien dit — pas meme la fois
    # ou il aurait du (docs/76-proximite.md). Un garde-fou qu'on n'a jamais vu
    # parler n'est pas un garde-fou silencieux, c'est un garde-fou casse.
    stockage = os.path.join(profil, "Default", "File System")
    ecrit = 0
    for base, _, fichiers in os.walk(stockage):
        for f in fichiers:
            try:
                ecrit = max(ecrit, os.path.getmtime(os.path.join(base, f)))
            except OSError:
                pass
    if not ecrit or not plus_recent or ecrit >= plus_recent:
        return None
    from datetime import datetime
    d = lambda t: datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M")
    return (f"extraction du {d(ecrit)}, "
            f"{quoi} modifie le {d(plus_recent)}")


def run(url, heavy, profil=None, zip_path=None):
    """
    Les controles navigateur, et ce qu'on montre quand ils s'arretent net.

    UNE EXCEPTION DE PLAYWRIGHT CACHAIT LA VRAIE CAUSE. Une erreur dans la
    boucle de rendu arrete l'image en cours : tout ce qui suit ne tourne plus,
    et le premier controle qui s'en apercoit est trente lignes plus loin, sur un
    objet sans rapport. Le message etait « impossible de lire `current` » — et la
    faute etait vingt ecrans plus haut, dans un tout autre systeme.

    Les erreurs de page etaient pourtant collectees depuis toujours, et n'etaient
    lues qu'au DERNIER controle, celui qu'on n'atteint jamais dans ce cas
    (docs/71-quantique.md).
    """
    try:
        return _run(url, heavy, profil, zip_path)
    except Exception:
        for e in _ERREURS_PAGE[:6]:
            print(f"  !!   erreur de page : {e}")
        if _ERREURS_PAGE:
            print("       ^ la cause est probablement la, pas dans le controle"
                  " qui a leve.\n")
        raise


_ERREURS_PAGE = []


def _run(url, heavy, profil=None, zip_path=None):
    from playwright.sync_api import sync_playwright

    rep = Report()
    perime = None
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
            perime = extraction_perimee(profil)
            if perime:
                print(f"  !!   L'EXTRACTION DU PROFIL EST PLUS VIEILLE QUE LE PIPELINE.\n"
                      f"       {perime}")
                if zip_path:
                    print("       --zip est fourni : l'extraction sera REFAITE.\n")
                else:
                    print("       Les controles vont mesurer d'ANCIENNES donnees.\n"
                          "       Relancer avec --zip pour refaire l'extraction.\n")
            browser = p.chromium.launch_persistent_context(
                profil, executable_path=exe, args=args,
                viewport={"width": 1280, "height": 720})
            page = browser.pages[0] if browser.pages else browser.new_page()
        else:
            browser = p.chromium.launch(executable_path=exe, args=args)
            page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors = _ERREURS_PAGE
        del errors[:]
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
            # UN `--zip` NE SUFFISAIT PAS. L'archive n'etait deposee que si la
            # page ne montrait PAS deja une extraction — donc jamais, sur un
            # profil rempli. Un lot qui touche a un extracteur relancait avec
            # `--zip`, voyait l'ancienne extraction, et deux controles neufs
            # tombaient sans que rien ne dise pourquoi (docs/76-proximite.md).
            #
            # Quand l'extraction est perimee ET qu'on a l'archive, on VIDE le
            # stockage et on recommence. C'est le bouton que la page offre deja.
            # `--zip` VEUT DIRE « refais l'extraction ». Il ne servait qu'a
            # remplir un profil vide, et sur un profil plein il ne faisait
            # RIEN : un lot qui touche a un extracteur relancait avec l'archive
            # et mesurait quand meme les donnees d'avant. Deux controles neufs
            # sont tombes deux fois de suite avant qu'on le voie.
            if zip_path and page.locator("#gate-step-done").is_visible():
                print("  ..   --zip fourni : on vide le stockage et on refait.")
                page.click("#gate-reset")
                page.wait_for_timeout(2000)
                page.wait_for_selector("#gate-step-drop", state="visible", timeout=60000)
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
        # L'ecran-titre d'abord (docs/131-ecran-titre.md) : « New Expedition »
        # est la ligne choisie a l'ouverture, `Interact` (E) la valide. Sans
        # titre extrait, le moteur part droit dans la partie.
        page.wait_for_function("window.__titre || window.__ready===true", timeout=300000)
        if not page.evaluate("window.__ready===true"):
            titre = page.evaluate("""() => ({
              options: window.__titre.lignes.map((l) => l.textContent),
              verrous: window.__titre.menu.locked })""")
            rep.eq("cinq lignes au menu-titre", len(titre["options"]), 5)
            page.keyboard.press("KeyE")
        page.wait_for_function("window.__ready===true", timeout=300000)
        page.wait_for_timeout(3000)

        rep.eq("erreurs console au demarrage", errors[:3], [])
        # Un element `hidden` de l'interface ne se dessine pas, meme quand sa
        # classe pose un `display` : le marqueur de sonde dessinait un cercle
        # vide en haut a gauche des le reveil (docs/132).
        caches = page.evaluate("""() => [...document.querySelectorAll('#ui [hidden]')]
          .filter(e => getComputedStyle(e).display !== 'none').map(e => e.className)""")
        rep.eq("aucun element cache de l'interface ne se dessine", caches, [])
        # Le systeme ENTIER se charge derriere le titre, comme `level0` dans
        # l'alpha : c'est ce qui fait voir les planetes de loin (docs/132).
        # Mesure : 105,9 Mo, tampons et textures des huit lots compris.
        rep.at_most("poids reseau (Mo)", round(weight["total"] / 1e6, 1), 120)

        # --- geometrie : tout le systeme, derriere le titre ------------------
        files = page.evaluate("() => window.__geo.entries.map(e => e.file).sort()")
        rep.eq("fichiers glTF au demarrage : les huit lots", files,
               ["brittlehollow_pivot.gltf", "comet_pivot.gltf", "darkbramble_pivot.gltf",
                "giantsdeep_pivot.gltf", "hourglasstwins_pivot.gltf",
                "quantummoon_body.gltf", "sun_body.gltf", "timberhearth_pivot.gltf"])

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

        # --- le soleil de substitution ---------------------------------------
        # Au reveil, le joueur est dans le secteur de Timber Hearth : le spot
        # central de `SunImposterPivot` est allume, et sa couronne de huit
        # spots aussi — rangee dans UNE lumiere clusterisee quand le moteur le
        # permet (docs/132). Sans la couronne, midi sortait deux fois trop
        # sombre.
        imp = page.evaluate("""() => {
          const s = window.__scene || BABYLON.Engine.LastCreatedScene;
          const c = s.lights.find(l => l.name === 'couronne_TimberHearth_Body');
          const seuls = s.lights.filter(l => /^ow_(Top|Bottom|Left|Right)\\w*Light$/.test(l.name));
          const centre = s.lights.find(l => l.name === 'ow_SunImposter_Center');
          return {centre: !!(centre && centre.isEnabled()),
                  couronne: c ? (c.lights || c._lights).length : seuls.length,
                  allumee: c ? c.isEnabled() : seuls.every(l => l.isEnabled())};
        }""")
        rep.eq("spot central de l'imposteur allume au reveil", imp["centre"], True)
        rep.eq("couronne de l'imposteur : huit spots", imp["couronne"], 8)
        rep.eq("... allumee au reveil", imp["allumee"], True)
        # Les spots lisent le cookie `Soft` d'Unity, pas l'exposant de Babylon,
        # et l'attenuation s'eteint en fin de portee (docs/132).
        lum = page.evaluate("""() => {
          const k = BABYLON.Effect.IncludesShadersStore.lightsFragmentFunctions || '';
          return {exposant: k.includes('attenuation*=getAttenuation(cosAngle'),
                  fondu: k.includes('/0.36)')};
        }""")
        rep.eq("spots : plus d'exposant de Babylon", lum["exposant"], False)
        rep.eq("attenuation : le fondu de fin de portee d'Unity", lum["fondu"], True)
        # `Cull Off` sans `VFACE` : la face arriere garde la normale avant. Et
        # en Deferred Lighting, tout recoit l'ombre (docs/132).
        faces = page.evaluate("""() => {
          const s = BABYLON.EngineStore.LastCreatedScene;
          const m = s.materials.filter((x) => { const e = x.metadata && x.metadata.gltf && x.metadata.gltf.extras;
            return e && /DoubleSidedCutout/.test(e.unityShader || ''); });
          return { n: m.length, deux: m.filter((x) => x.twoSidedLighting).length };
        }""")
        rep.at_least("materiaux double face lus", faces["n"], 5)
        rep.eq("aucun n'eclaire sa face arriere a l'envers", faces["deux"], 0)

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
        #
        # CE CONTROLE GARDAIT UN BUG. Il demandait « au moins deux invites a
        # l'ecran », et il passait parce que le portage affichait les invites du
        # sac dorsal en PERMANENCE. Les pieds au sol, dans un champ de gravite,
        # le build n'en montre aucune (docs/80-invites.md) — et zero est donc la
        # bonne reponse.
        #
        # Ce qu'on voulait garder est que la COUCHE d'invites fonctionne. On le
        # mesure donc la ou le build en pose vraiment : la carte, qui en pose
        # trois. C'est la meme lecon que docs/49 — un invariant garde une
        # mesure, pas une conclusion — et cette fois la conclusion etait
        # « il devrait toujours y avoir des invites ».
        rep.eq("les pieds au sol, aucune invite de sac dorsal",
               page.evaluate("() => [...document.querySelectorAll("
                             "'.ow-prompts-left .ow-prompt')].length"), 0)
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

        # La carte ne repond qu'une fois `MapController` allume : combinaison
        # sur le dos (`OnSuitUp`). Au feu de camp, dans l'alpha, Entree n'ouvre
        # rien (docs/132).
        combi_avant = page.evaluate("() => !!window.__lots.equipment.suit")
        if not combi_avant:
            page.keyboard.press("Enter")
            page.wait_for_timeout(600)
            rep.eq("sans combinaison, Entree n'ouvre pas la carte",
                   page.evaluate("() => !!window.__map.open"), False)
            page.evaluate("() => { window.__lots.equipment.suit = true; }")
            page.wait_for_timeout(1500)
        # les invites de la carte, de priorite 2, doivent evincer les autres.
        # La carte est sur ENTREE dans le build (canal `Map`), pas sur M
        # (docs/61-commandes.md).
        page.keyboard.press("Enter")
        # `MapCamera` monte de l'oeil a la vue plongeante en deux secondes
        # (`SmoothStep`), et les invites n'arrivent qu'a la fin de la montee.
        page.wait_for_timeout(300)
        rep.eq("pendant la montee, pas encore d'invite de carte",
               page.evaluate("() => window.__vueCarte.t < 1 ? "
                             "[...document.querySelectorAll('.ow-prompts-left .ow-prompt')]"
                             ".map(n=>n.textContent.trim()).filter(t => /Map|Zoom|Pan/.test(t)) : []"),
               [])
        page.wait_for_timeout(2500)
        vue = page.evaluate("""() => {
          const c = BABYLON.EngineStore.LastCreatedScene.activeCamera;
          const s = window.__map.bodies.find((b) => /sun/i.test(b.bodyName || b.name || ''));
          const avant = c.getDirection(BABYLON.Axis.Z);
          return { t: window.__vueCarte.t, fov: Math.round(c.fov * 180 / Math.PI),
                   hauteur: s ? Math.round(Math.hypot(c.position.x - s.position[0],
                     c.position.y - s.position[1], c.position.z - s.position[2])) : null,
                   plonge: s ? Math.round(BABYLON.Vector3.Dot(avant.normalize(),
                     c.position.subtract(new BABYLON.Vector3(...s.position)).normalize()) * 100) / 100 : null,
                   casque: [...document.querySelectorAll('#ui .ow-res')]
                     .some((e) => !e.hidden && getComputedStyle(e).display !== 'none') };
        }""")
        rep.eq("la camera de la carte est montee", vue["t"], 1)
        rep.eq("au champ de `MapCamera`", vue["fov"], 60)
        rep.eq("a quarante mille du Soleil, sans cible", vue["hauteur"], 40000)
        rep.eq("et le regarde droit dessous", vue["plonge"], -1.0)
        rep.eq("la camera du casque s'eteint avec la carte", vue["casque"], False)
        rep.eq("la carte, elle, en pose trois",
               page.evaluate("() => [...document.querySelectorAll("
                             "'.ow-prompts-left .ow-prompt')].map(n=>n.textContent.trim())"),
               ["Close Map", "Zoom In/Out", "Pan View"])
        # La couche d'invites fonctionne : c'est ce que l'ancien controle
        # voulait dire, mesure la ou le build pose vraiment des invites.
        # Le compte seul ne disait pas LAQUELLE manquait : on compare les
        # libelles, pour qu'un echec se lise sans relancer.
        #
        # Et il portait sur TOUTES les invites, ce qui etait trop dire :
        # `ScreenPrompt` a un bouton FACULTATIF, et celle des codes de
        # lancement — « Launch Codes Aquired », en bas — n'en a pas. Elle
        # n'apparait qu'avec un profil qui connait les codes, ce qui a tenu
        # l'erreur cachee. La couche qu'on mesure ici est celle de GAUCHE,
        # celle que la carte remplit.
        rep.eq("icone de manette sur chaque invite de gauche",
               page.evaluate("""() => [...document.querySelectorAll(
                   '.ow-prompts-left .ow-prompt')]
                 .filter(n => !n.querySelector('.ow-prompt-btn'))
                 .map(n => n.textContent.trim())"""),
               [])
        # `LaunchCodePromptController` : l'invite du bas vit cinq secondes, et
        # le portage la gardait tant qu'on savait les codes (docs/132). Bien
        # apres le reveil et sans rien apprendre, le bas est vide.
        rep.eq("pas d'invite des codes en permanence",
               page.evaluate("""() => [...document.querySelectorAll(
                   '.ow-prompts-bottom .ow-prompt')].map(n => n.textContent.trim())"""),
               [])
        page.evaluate("() => window.__map.pan(-0.5, -0.5, 1)")
        rep.check("le deplacement de la carte suit la distance de zoom",
                  page.evaluate("() => Math.abs(window.__map.focal[0]) > 1000"),
                  page.evaluate("() => Math.round(window.__map.focal[0])"), "!= 0")
        # LES ORBITES DE LA CARTE (docs/100-carte.md). `MapOpenGL` porte cinq
        # pointeurs de corps et cinq couleurs, rangés dans le meme ordre par
        # `Start`. Le portage tracait tout d'un meme gris invente, au centre de
        # l'ECRAN et non du Soleil.
        carte = page.evaluate("""() => {
          const m = window.__map;
          return { n: m.orbits.length, corps: m.orbits.map((o) => o.body),
                   alpha: m.orbitAlpha === undefined
                     ? null : Math.round(m.orbitAlpha * 255),
                   comete: m.cometColor.map((c) => Math.round(c * 255)) };
        }""")
        rep.eq("cinq orbites colorees", carte["n"], 5)
        rep.eq("dans l'ordre de `_planetRadiusArray`", carte["corps"],
               ["TimberHearth_Body", "FocalBody", "BrittleHollow_Body",
                "GiantsDeep_Body", "DarkBramble_Body"])
        # L'alpha vient du build quand l'extraction l'a portee ; sans elle, le
        # repli explicite du module vaut la meme chose.
        rep.eq("a l'alpha du build", carte["alpha"] in (130, None), True)
        rep.eq("et la comete a sa propre couleur", carte["comete"], [194, 255, 251])
        page.evaluate("() => window.__map.recenter()")
        page.keyboard.press("Enter")
        page.wait_for_timeout(600)
        rep.eq("la carte fermee, la camera du joueur retrouve son champ",
               page.evaluate("() => Math.round(BABYLON.EngineStore.LastCreatedScene"
                             ".activeCamera.fov * 180 / Math.PI)"), 70)
        if not combi_avant:
            # La combinaison ote : `OnRemoveSuit` eteint la carte de nouveau.
            page.evaluate("() => { window.__lots.equipment.suit = false; }")
            page.wait_for_timeout(1500)
            rep.eq("combinaison otee, la carte s'eteint",
                   page.evaluate("() => window.__accesCarte.actif"), False)

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
          // Une guimauve ENTIERE : pres du feu, la partie a pu en bruler une,
          // et les premieres secondes compteraient alors son retour
          // (`gone`, `respawn`) au lieu de la griller.
          m.held = true; m.toast = 0; m.gone = false; m.goneFor = 0;
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
        # Neuf dans la scene, dont deux sur des objets INACTIFS que rien ne
        # rallume : sept emettent dans l'alpha (`actifsSeulement`, docs/132).
        rep.eq("emetteurs de signal", audio["emetteurs"], 7)
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
                  lumieres: window.__fog.lights.lights.length,
                  // `FogLightIcons.lit` : combien d'icones sont VISIBLES a cet
                  // instant. Hors du brouillard, aucune — le composant est
                  // desactive, et leur alpha reste ou il est.
                  allumees: window.__fog.lights.lit,
                  // `FogDetector.StartFogFlash` : l'eclair des passages de
                  // Dark Bramble, monte cubique puis descente cubique.
                  eclair: (() => {
                    const f = window.__fog.fog;
                    const avant = f.density;
                    f.startFlash(0.5, 3, 3, 100);
                    const p = !!f.flash;
                    f.flash = null; f.density = avant;
                    return p;
                  })()};
        }""")
        rep.eq("volumes de brouillard", fog["volumes"], 2)
        rep.eq("objets masques par le brouillard", fog["masques"], 7)
        rep.eq("lumieres dans le brouillard", fog["lumieres"], 6)
        # Au depart on est sur Timber Hearth, a des milliers d'unites du
        # brouillard : aucune icone n'a de raison d'etre allumee.
        rep.eq("et aucune n'est allumee au village", fog["allumees"], 0)
        rep.eq("l'eclair de brouillard s'arme", fog["eclair"], True)
        rep.eq("densite nulle au rayon exterieur", fog["mur"], 0)
        rep.near("decroissance cubique a mi-chemin", fog["milieu"], 0.00125, 1e-5)
        rep.near("densite pleine au rayon interieur", fog["coeur"], 0.01, 1e-5)

        # --- mort, flashback et supernova ---------------------------------------
        # LE FLASHBACK REJOUE LES PHOTOS DE LA PARTIE (docs/98-flashback.md).
        #
        # Ce controle mesurait « 22 images, 8,21 s » comme des constantes. Ce
        # n'en sont pas : vingt-deux est le rang ou la DUREE d'image touche son
        # plancher, et la longueur de la sequence depend du nombre de photos
        # prises, donc du temps qu'on a survecu.
        fin = page.evaluate("""() => {
          const d = window.__death, s = window.__supernova.stage;
          const fb = d.flashback;
          const at = (f, left, nova, r) => s.update({fraction: f, secondsRemaining: left,
                                                     supernova: nova, shockwaveRadius: r});
          // Une sequence de vingt-deux photos, calculee et rendue : 5,409 s de
          // defilement, 0,8 de blanc, plus 2 + 1 + 1 hors defilement.
          const garde = { count: fb.count, running: fb.running, t: fb.t };
          fb.start(22);
          const vingtDeux = +fb.duration.toFixed(3);
          fb.start(3);
          const trois = +fb.duration.toFixed(3);
          fb.start(garde.count); fb.running = garde.running; fb.t = garde.t;
          return {vingtDeux, trois,
                  progression: at(0.5, 600, false, 0).phase,
                  avantAnnonce: +at(1, 0, false, 0).scale.toFixed(2),
                  effondrement: [window.__loop.surface && window.__loop.surface.echelle,
                                 window.__loop.corona && window.__loop.corona.echelle],
                  explosion: at(1, 0, true, 5000).phase,
                  causes: Object.keys(window.__death.byCause).length};
        }""")
        rep.eq("vingt-deux photos : dix secondes deux", fin["vingtDeux"], 10.209)
        rep.eq("trois photos : six secondes quatre", fin["trois"], 6.426)
        # `SunExplosionBehavior` : l'etoile ne se contracte qu'apres
        # `TriggerSupernova`, vers 3 % de l'echelle que la scene lui donne.
        rep.eq("l'etoile ne se contracte pas avant l'annonce", fin["avantAnnonce"], 1)
        rep.eq("l'effondrement part des echelles de la scene", fin["effondrement"],
               [4000, 362.2121])
        rep.eq("phase d'explosion", fin["explosion"], "explosion")
        rep.eq("aucune mort au demarrage", fin["causes"], 0)

        # LA PELLICULE TOURNE POUR DE VRAI. Le controle precedent appelle la loi ;
        # celui-ci regarde ce que la BOUCLE a photographie — la leçon de docs/97,
        # appliquée tout de suite. Une photo part a cinq secondes de partie, et
        # la page en a vu plus que cela avant d'arriver ici.
        pellicule = page.evaluate("""() => {
          const p = window.__pellicule;
          if (!p) return null;
          const n = p.photos.length;
          const une = n ? p.photos[0] : null;
          return { n, chrono: p.timer.taken,
                   largeur: une ? une.width : 0, hauteur: une ? une.height : 0 };
        }""")
        rep.eq("la pellicule existe", pellicule is not None, True)
        if pellicule:
            rep.at_least("des photos ont ete prises", pellicule["n"], 1)
            rep.eq("le chronometre en a compte autant",
                   pellicule["chrono"] >= pellicule["n"], True)
            rep.eq("elles font 256 pixels de cote",
                   [pellicule["largeur"], pellicule["hauteur"]], [256, 256])

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

        # --- le trou blanc, relu en entier (docs/102-trou-blanc.md) -------------
        #
        # Trois champs serialises, trois noms pris pour des lois. Ce controle
        # garde ce que le portage en fait MAINTENANT, et surtout que le trou
        # blanc a une ORIENTATION : sans elle il n'y a pas de « devant », et
        # `ForceWarp` sort droit devant.
        deb = page.evaluate("""() => {
          const d = window.__debris;
          if (!d) return null;
          const f = window.__trouBlancFwd;
          return { laisse: d.radius, pas: d.cfg.checkSeconds,
                   depart: d.cfg.startScale, vitesse: d.cfg.exitSpeed,
                   avant: f ? f.map((x) => Math.round(x * 1000) / 1000) : null,
                   norme: f ? Math.round(Math.hypot(f[0], f[1], f[2]) * 1000) / 1000
                            : null };
        }""")
        rep.eq("la laisse maximale est `_debrisRadius`", deb and deb["laisse"], 750)
        rep.eq("une sortie par seconde au plus", deb and deb["pas"], 1)
        rep.eq("un morceau entre a un dixieme de sa taille", deb and deb["depart"], 0.1)
        rep.eq("et il part a vingt unites par seconde", deb and deb["vitesse"], 20)
        # L'avant du trou blanc vient de `WANT_ROTATION` : il est unitaire, et
        # il n'est PAS la verticale du monde — ce sur quoi le portage retombait.
        rep.eq("le trou blanc a un avant", deb and deb["norme"], 1.0)
        rep.eq("et ce n'est pas la verticale du monde",
               deb and deb["avant"] != [0, 1, 0], True)

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
          // L'EVICTION, VUE DE L'INTERIEUR. `Evictor.waiting` dit depuis
          // combien de temps un lot est hors de portee, et `keep` protege le
          // corps ancre — deux lois que rien n'appelait (docs/99). Le lot du
          // corps de depart est protege des la construction : il ne doit donc
          // JAMAIS accumuler d'absence, quoi qu'il arrive.
          protege: [...window.__lod.evictor.protect][0] || null,
          attenteProtege: window.__lod.evictor.waiting(
            [...window.__lod.evictor.protect][0] || ""),
          cielPret: window.__sky.ready,
          nuagesDecrits: window.__sky.cloudCount,
          nuagesRattaches: window.__sky.cloudsAttached,
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
        rep.eq("un lot protege de l'eviction", bool(w["protege"]), True)
        rep.eq("et il n'accumule aucune absence", w["attenteProtege"], 0)
        # LES VINGT-QUATRE NUAGES. Le build en decrit vingt-quatre — tous
        # nommes `PieceOfRing`, d'ou le rattachement par POSITION (docs/48) —
        # et ce controle demande qu'ils soient TOUS rattaches. Les deux
        # accesseurs existaient depuis ce lot-la, sans lecteur.
        rep.eq("nuages decrits par le build", w["nuagesDecrits"], 24)
        # Le rattachement attend le lot de geometrie qui PORTE les nuages, et il
        # n'est pas celui de la voute : `sky.ready` peut etre vrai sans qu'un
        # seul nuage soit pose. L'invariant est donc « rien de PARTIEL » — zero
        # ou les vingt-quatre — ce qui garde le rattachement par position sans
        # mesurer l'ordre de chargement.
        rep.eq("les nuages se rattachent tous ou pas du tout",
               w["nuagesRattaches"] in (0, w["nuagesDecrits"]), True)

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

        # --- les trois zones d'invites (docs/112-invites.md) -------------------
        #
        # `PromptManager` tient `_highestLeftPriority` et
        # `_highestCenterPriority`, et AUCUN `_highestBottomPriority` : la zone
        # du bas montre tout ce qu'on lui donne. Ce portage arbitrait les trois,
        # et une invite de priorite superieure pouvait donc chasser les codes de
        # lancement.
        invites = page.evaluate(INVITES_JS)
        if invites:
            rep.eq("au centre, seule la priorite maximale reste",
                   invites["centre"], 1)
            rep.eq("a gauche aussi", invites["gauche"], 1)
            rep.eq("mais en bas, tout s'affiche", invites["bas"], 2)

        # --- le reveil (docs/108-reveil.md) ------------------------------------
        #
        # `SpawnPlayer` ouvre les yeux quatre-vingts degres au-dessus de
        # l'horizon, et `Update` redescend seul a la septieme seconde. Ce qui ne
        # se verifie qu'ici : que le module est bien BRANCHE — la loi elle-meme
        # est eprouvee sans le jeu. Le parcours dure plus de sept secondes avant
        # d'arriver ici, le recentrage a donc deja eu lieu.
        reveil = page.evaluate(REVEIL_JS)
        if reveil:
            rep.eq("le reveil ouvre les yeux a quatre-vingts degres",
                   reveil["seuil"], 80)
            rep.eq("... apres sept secondes", reveil["attente"], 7)
            rep.eq("... a cinquante degres par seconde", reveil["taux"], 50)
            rep.eq("et le recentrage a eu lieu", reveil["arme"], False)
            rep.at_most("le regard est redescendu pres de l'horizon",
                        abs(reveil["degresY"]), 45)
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
            # Sous SwiftShader une image dure ~200 ms, et dans le cratere
            # (`CraterField`, 12 u/s2) le saut ne tient que 0,6 s en l'air :
            # un echantillon fixe a 120 ms tombait avant la premiere image.
            # On attend le decollage, une seconde au plus.
            # Et une image rendue peut couvrir plusieurs sous-pas : le saut du
            # cratere (0,5 s en l'air sous 12 u/s2) monte et retombe entre deux
            # images, et ni `grounded` ni la vitesse ne s'y lisent. On le
            # mesure donc la ou il nait : la vitesse le long du haut local que
            # `tryJump` laisse au corps.
            page.evaluate("""() => {
              const p = window.__player;
              window.__saut = null;
              const orig = p.tryJump.bind(p);
              p.tryJump = (i, u) => {
                const r = orig(i, u);
                if (r && !window.__saut) {
                  window.__saut = p.vel.x * u.x + p.vel.y * u.y + p.vel.z * u.z;
                }
                return r;
              };
            }""")
            page.keyboard.down("Space")
            page.wait_for_timeout(300)
            page.keyboard.up("Space")
            try:
                page.wait_for_function("() => window.__saut !== null", timeout=4000)
            except Exception:
                pass
            saut = page.evaluate("() => window.__saut")
            decolle = saut is not None and saut > 1
            rep.eq("le saut quitte le sol", decolle, True)
            if saut is not None:
                rep.near("vers le haut, a la vitesse de saut du build", round(saut, 2),
                         (pc or {}).get("jumpSpeed", 4), 1.5)

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
            # Le seul `HazardVolume` de la scene, `KillVolume`, est INACTIF :
            # il ne blesse personne dans l'alpha (docs/132).
            rep.eq("volumes qui blessent", lots["dangers"], 0)
            rep.eq("objets a ramasser", lots["ramassages"], 2)
            # 22 a l'origine ; les docs 124, 128 et 129 en ont porte dix-sept
            # de plus (`EVENT_AUDIO`, extract/audio.js) sans relever ce compte.
            rep.eq("emetteurs de son d'evenement", lots["evenements"], 39)
            # Le volume de destruction du soleil est une sphere de 2 000 unites
            # centree sur l'origine du MONDE : teste avec une position du repere
            # ancre, il tuait le joueur des la premiere image.
            rep.eq("aucune mort en cours de parcours", lots["morts"], 0)
            # L'equipement se ramasse : la sonde n'est pas donnee.
            rep.eq("la sonde n'est pas donnee au depart", lots["equipement"], False)

        # --- le secteur majeur actif (docs/82-secteur-majeur.md) ----------------
        #
        # Ce controle-ci n'existe que dans un navigateur : il demande la
        # position du moment, le declencheur du secteur ramene la ou sa planete
        # se trouve, et une minicarte reellement montee dans la page.
        #
        # Le portage decidait « suis-je a moins de deux rayons de surface du
        # corps dominant » et « le plus petit volume qui me contient ». Le build
        # ne pose ni l'une ni l'autre : il tient une liste de spheres de
        # declenchement et en retient la plus proche par le centre.
        sect = page.evaluate("""() => {
          const L = window.__lots, G = window.__gui;
          if (!L || !G) return null;
          const m = G.minimap;
          return {
            secteurs: L.majSecteurs.length,
            spheres: L.majSecteurs.filter(x => x.volume &&
                       x.volume.shape === "sphere" && x.volume.radius > 0).length,
            sansMinicarte: L.majSecteurs.filter(x => !x.useMinimap)
                             .map(x => x.name).sort(),
            actif: L.etat.secteurMajeur,
            porteMinicarte: L.etat.minicarteDuSecteur,
            allumee: m.on, montree: m.shown,
            evenements: m.events.slice(0, 1),
          };
        }""")
        if sect:
            rep.eq("secteurs majeurs poses", sect["secteurs"], 10)
            rep.eq("tous portent un declencheur spherique",
                   sect["spheres"], sect["secteurs"])
            rep.eq("les trois sans minicarte", sect["sansMinicarte"],
                   ["Sector_DB", "Sector_Derelict", "Sector_QuantumMoon"])
            # LE controle du lot. Le declencheur de Timber Hearth fait 1 000
            # unites ; le portage prenait `horizon x 1,5`, soit 300, et le
            # joueur pose au village n'etait dans AUCUN secteur passe les
            # premieres secondes de derive.
            rep.eq("pose au village, on est dans le secteur de Timber Hearth",
                   sect["actif"], "Sector_TH")
            rep.eq("et ce secteur porte la minicarte", sect["porteMinicarte"], True)
            rep.eq("le composant Minimap est donc allume", sect["allumee"], True)
            rep.eq("avec l'evenement du build", sect["evenements"],
                   ["MinimapEnabled"])
            # ... mais on ne la VOIT pas : `MinimapHUD.AllowVisibility` exige en
            # plus de l'avoir ramassee. Deux composants, deux etats.
            rep.eq("sans l'avoir ramassee, rien a l'ecran", sect["montree"], False)
            # Le seul ramassage qui porte la minicarte porte aussi la sonde :
            # la prendre ici fausserait la section suivante, qui verifie
            # justement qu'on n'a pas la sonde. On interroge donc la LOI sans
            # toucher a l'etat — un controle ne doit rien changer.
            rep.eq("ramassee, elle s'afficherait",
                   page.evaluate("() => window.__gui.minimap.allowVisibility("
                                 "{ helmetHUD: true, hasMinimap: true })"), True)

        # LES JAUGES SONT SUR LA VISIERE (docs/99-lois-branchees.md).
        #
        # `HUDCameraScript` les eteint a `RemoveSuit` et les rallume a
        # `HelmetHUDActivated`. Au demarrage on est au village, sans
        # combinaison : il ne doit y avoir NI oxygene NI carburant a l'ecran.
        # Le portage les affichait en permanence.
        visiere = page.evaluate("""() => {
          const h = window.__ui && window.__ui.resHUD;
          const c = window.__casque && window.__casque.casque;
          if (!h || !c) return null;
          return { porte: c.worn, jauges: !h.box.hidden };
        }""")
        rep.eq("le casque et les jauges sont montes", visiere is not None, True)
        if visiere:
            rep.eq("sans combinaison, le casque n'est pas porte",
                   visiere["porte"], False)
            rep.eq("et les jauges ne sont pas a l'ecran", visiere["jauges"], False)
            rep.eq("les deux disent la meme chose",
                   visiere["jauges"], visiere["porte"])

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
        # ... et il TENAIT aussi a ce qui le precede : six `page.evaluate` de
        # plus inseres avant lui suffisaient a faire refuser le tir. La dette
        # etait nommee — « tant qu'il n'aura pas ete rendu independant du
        # regard, en visant explicitement avant de tirer » — et c'est ce que
        # `vise()` fait maintenant.
        #
        # LA DETTE, ET CE QU'ELLE CACHAIT. Le controle ne mesurait pas la
        # fenetre de tir : il mesurait ou le joueur avait derive pendant que
        # les controles d'avant tournaient. Deux executions du MEME code
        # donnaient deux resultats, selon la charge de la machine. Un invariant
        # qui depend du temps qu'a pris le controle precedent ne garde rien.
        #
        # Ce qu'il garde maintenant est la LOI : `launchWindowLength` rend 200
        # tant qu'on ignore comment marchent les sondes, et 5 ensuite. On vise
        # donc le SOL pour le premier — bloque a cinq metres comme a deux
        # cents — et le CIEL pour le second, degage dans les deux cas. Seule la
        # longueur de la fenetre peut alors expliquer la difference.
        def vise(tangage):
            # Tangage POSITIF = vers le bas : `fwd` porte `up * (-sin p)`.
            #
            # On ne touche QUE le regard. Un premier jet mettait aussi la
            # vitesse a zero pour « stabiliser » — ce qui arrache le joueur au
            # sol qui l'emporte, et un controle plus loin mesure justement
            # cette vitesse-la. Stabiliser un controle en cassant ce qu'un
            # autre mesure n'est pas stabiliser.
            page.evaluate("(p) => window.__look(0, p)", tangage)
            page.wait_for_timeout(1200)

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
              const pl = window.__player;
              return { active: t.active, launched: t.launched,
                       ancree: !!(p && p.anchored),
                       lanterne: p ? Math.round(p.lantern) : 0,
                       vitesse: p ? Math.round(Math.hypot(...p.vel)) : 0,
                       cams: (window.__scene || BABYLON.Engine.LastCreatedScene)
                               .activeCameras.map(c => c.name),
                       // POURQUOI, quand elle ne part pas. Ce controle tient a
                       // ce qui le precede, et jusqu'ici il ne disait que
                       // « zero » — ce qui ne se diagnostique pas.
                       charge: !!t.charging,
                       aLaSonde: !!window.__lots.equipment.probe,
                       sait: !!window.__pdata.knows('knowsHowProbesWork'),
                       enDialogue: !!window.__dialogue.active,
                       auSol: !!(pl && pl.grounded),
                       vitesseJoueur: pl ? Math.round(
                         Math.hypot(pl.vel.x, pl.vel.y, pl.vel.z) * 10) / 10 : null,
                       // Le redressement est le suspect : s'il balance encore,
                       // le sondage de sol cherche le sol dans la mauvaise
                       // direction, et le joueur n'est au sol nulle part.
                       ecartHaut: window.__redressement
                         ? Math.round(window.__redressement.degres * 1000) / 1000 : null,
                       compense: window.__redressement
                         ? window.__redressement.steady : null };
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
        # Le sol : bloque a cinq metres comme a deux cents.
        vise(1.4)
        sonde_geste(120)
        rep.eq("et la fenetre de deux cents metres refuse le tir",
               etat_sonde()["launched"], 0)
        # Une fois le geste appris, cinq metres suffisent — et le ciel les
        # donne. C'est la SEULE difference entre les deux mesures.
        page.evaluate("() => window.__pdata.learn('knowsHowProbesWork')")
        vise(-1.4)
        sonde_geste(120)
        etat = etat_sonde()
        # Le refus se diagnostique, il ne se devine pas : ce controle tient a
        # tout ce qui le precede, et jusqu'ici il ne disait que « zero ».
        print("    etat du joueur au tir :",
              {k: etat[k] for k in ("charge", "aLaSonde", "sait", "enDialogue",
                                    "auSol", "vitesseJoueur", "ecartHaut",
                                    "compense")})
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

        # --- les lois enfin appelees (docs/68-lois.md) --------------------------
        #
        # `attachments.js` — six classes, une page de documentation, quarante
        # verifications — n'etait importe par AUCUN module du moteur. Ces
        # controles mesurent qu'il tourne maintenant.
        att = page.evaluate("""() => {
          const a = window.__attaches;
          return { alignes: a.alignes.length, heritiers: a.heritiers.length,
                   clignotants: a.clignotants.length,
                   rattaches: a.clignotants.filter(c => c.node).length,
                   noeuds: a.noeudsCasses.length, remous: a.remous.length,
                   lanceurs: window.__meteores.launchers.length };
        }""")
        # Quatorze poses, dont `OribitingIsland`, inactive et jamais rallumee.
        rep.eq("treize alignements sur un corps designe", att["alignes"], 13)
        rep.eq("neuf heritiers de champ", att["heritiers"], 9)
        rep.eq("deux clignotants", att["clignotants"], 2)
        rep.eq("trois noeuds casses", att["noeuds"], 3)
        rep.eq("un volume d'eclaboussure", att["remous"], 1)
        rep.eq("quatre lanceurs de meteores", att["lanceurs"], 4)
        # Les meteores partent tout seuls : cinq a vingt secondes de delai, et
        # le temps simule d'une image plafonne a 0,05 — on force donc l'horloge
        # plutot que d'attendre des minutes de montre.
        meteo = page.evaluate("""() => {
          const m = window.__meteores;
          const avant = m.launched;
          m.update(1, 1e6);              // largement au-dela de tout delai
          const nes = m.launched - avant;
          const vitesse = m.meteors.length
            ? Math.round(Math.hypot(...m.meteors[m.meteors.length - 1].vel)) : 0;
          return { nes, vitesse };
        }""")
        rep.eq("les quatre lanceurs tirent", meteo["nes"], 4)
        rep.check("et le meteore part entre cent et deux cents",
                  100 <= meteo["vitesse"] <= 200, meteo["vitesse"], "100..200")

        # --- ce que le jeu annonce, lot 2 (docs/67-annonces.md) -----------------
        #
        # Manger une guimauve rend TOUTE la sante : deux lignes d'IL, et le
        # soin du jeu. Le portage comptait les guimauves sans rien en faire.
        soin = page.evaluate("""() => {
          const r = window.__resources, m = window.__consoles.marshmallow;
          const avant = r.health;
          r.health = 20;
          // Une guimauve PRESENTE : laissee au feu plus tot dans la visite,
          // elle a pu bruler et disparaitre — un etat du moment, pas du soin.
          m.gone = false; m.goneFor = 0;
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
        # `barrierSolid` est une METHODE de l'equipement depuis
        # docs/93-commandes.md : un objet nu ne suffit plus pour l'interroger,
        # et c'est tant mieux — la regle n'a plus qu'une source.
        rep.eq("le mur reclame la combinaison", page.evaluate(
            "() => { const b = [{ kind: 'barrier', position: [0,0,0],"
            "   volume: { shape: 'box', size: [10,10,10] } }];"
            "  const E = window.__lots.equipment.constructor;"
            "  const nu = new E({ suit: false }), vetu = new E({ suit: true });"
            "  return [!!window.__mur(b, [4,0,0], nu),"
            "          window.__mur(b, [4,0,0], vetu) === null].join(','); }"),
            "true,true")

        # --- l'invulnerabilite du premier tour (docs/81-invulnerable.md) ---------
        #
        # `PlayerData.OnStartOfTimeLoop` : a la PREMIERE boucle, tant qu'on ne
        # connait pas les codes de lancement, les degats ne portent pas. Et cela
        # s'arrete a l'instant ou l'on monte dans le vaisseau.
        inv = page.evaluate("""() => {
          const d = window.__pdata, r = window.__resources;
          if (!d || !r) return null;
          const codes = d.knowsLaunchCodes;
          const sante = r.health, prot = r.invulnerable;
          d.knowsLaunchCodes = false;
          const tour1 = d.startOfTimeLoop(1);
          const tour2 = d.startOfTimeLoop(2);
          d.knowsLaunchCodes = true;
          const avecCodes = d.startOfTimeLoop(1);
          // Les degats, protection posee.
          r.invulnerable = true; r.health = 100; r.dead = false;
          const perdu = r.hurt(40), resteA = r.health;
          r.invulnerable = false; r.health = 100;
          const perdu2 = r.hurt(40);
          d.knowsLaunchCodes = codes; r.health = sante; r.invulnerable = prot;
          return { tour1, tour2, avecCodes, perdu, resteA, perdu2 };
        }""")
        if inv:
            rep.eq("premiere boucle sans les codes : protege", inv["tour1"], True)
            rep.eq("deuxieme boucle : plus rien", inv["tour2"], False)
            rep.eq("premiere boucle avec les codes : plus rien non plus",
                   inv["avecCodes"], False)
            rep.eq("protege, les degats ne retirent rien", inv["perdu"], 0)
            rep.eq("et la sante est intacte", inv["resteA"], 100)
            rep.eq("sans protection, ils portent", inv["perdu2"], 40)

        # --- les invites du sac dorsal (docs/80-invites.md) ----------------------
        #
        # Elles n'existent qu'en APESANTEUR, et les trois poussees qu'a
        # l'entrainement. Le portage les affichait des qu'on n'etait pas dans
        # le vaisseau — c'est-a-dire presque toujours, et donc pour rien.
        jp = page.evaluate("""() => {
          const f = window.__jetpackPrompts;
          if (!f) return null;
          return {
            auSol: f({ inField: true, training: true }).thrust,
            libre: f({ inField: false, training: false }).thrust,
            entrainement: f({ inField: false, training: true }).thrust,
            visant: f({ inField: false, training: true, targeted: true }).thrust,
            accord: f({ inField: false, targeted: true, localSpeed: 5 }).matchVelocity,
            seul: f({ inField: false, training: true, targeted: true,
                      localSpeed: 5 }).thrust,
          };
        }""")
        if jp:
            rep.eq("les pieds au sol, aucune invite de sac", jp["auSol"], False)
            rep.eq("en apesanteur sans entrainement non plus", jp["libre"], False)
            rep.eq("a l'entrainement, les trois viennent", jp["entrainement"], True)
            rep.eq("mais pas si l'on vise", jp["visant"], False)
            rep.eq("l'accord de vitesse vient quand on vise et qu'on bouge",
                   jp["accord"], True)
            rep.eq("et il est SEUL", jp["seul"], False)

        # --- perdre la gravite (docs/79-alignement.md) ---------------------------
        #
        # Quitter un champ verrouille le regard le temps qu'on soit retourne :
        # le seul moment du jeu ou les commandes ne repondent plus.
        alg = page.evaluate("""() => {
          const a = window.__alignement;
          if (!a) return null;
          const avant = { aligned: a.aligned, locked: a.locked,
                          first: a.firstFrame, since: a.since, dur: a.duration };
          a.firstFrame = false; a.aligned = true; a.locked = false;
          const perdu = a.update(false, 1000, 90);
          const verrouille = a.locked, duree = a.duration;
          const repris = a.update(true, 1000.1, 0);
          const rendu = !a.locked;
          Object.assign(a, avant);
          return { perdu, verrouille, duree, repris, rendu, taux: 50 };
        }""")
        if alg:
            rep.eq("perdre le champ s'annonce", alg["perdu"], "break")
            rep.eq("et prend les commandes du regard", alg["verrouille"], True)
            rep.eq("pendant l'angle divise par cinquante", alg["duree"], 1.8)
            rep.eq("le retrouver s'annonce aussi", alg["repris"], "init")
            rep.eq("et rend les commandes sans attendre", alg["rendu"], True)

        # --- le vaisseau miniature et l'enfant (docs/78-modele.md) ---------------
        mod = page.evaluate("""() => {
          const m = window.__modele;
          if (!m || !m.vaisseau) return null;
          return { pistes: m.pistes.length, nom: m.vaisseau.name,
                   son: m.vaisseau.crashSound,
                   arbres: m.arbres ? Object.values(m.arbres.trees)
                                        .filter(Boolean).length : 0 };
        }""")
        if mod:
            rep.eq("trois pistes pour le modele reduit", mod["pistes"], 3)
            rep.eq("le vaisseau miniature est la", mod["nom"], "ModelShip_Body")
            rep.eq("avec son son de crash", mod["son"], "ModelShipCrash_Explosion")
            rep.eq("et l'enfant a ses trois arbres", mod["arbres"], 3)
        # Il VOLE : la console deportee le pousse, et la gravite le fait tomber.
        vol = page.evaluate("""() => {
          const m = window.__modele;
          if (!m || !m.vaisseau) return null;
          const v = m.vaisseau;
          const avant = v.pos.slice();
          return { bouge: v.vel.some(x => x !== 0) || avant.some(x => x !== 0) };
        }""")
        if vol:
            rep.eq("il a une position et une vitesse", vol["bouge"], True)
        # Et il reste SUR SON SOCLE tant qu'on ne le pousse pas : sa position
        # derivait a la vitesse orbitale de Timber Hearth, et il quittait
        # l'observatoire avant qu'on ait touche a la console (docs/132).
        socle = page.evaluate("""() => {
          const m = window.__modele;
          if (!m || !m.vaisseau) return null;
          const v = m.vaisseau;
          return { pose: v.pose, vitesse: Math.hypot(...v.vel) };
        }""")
        if socle:
            rep.eq("le modele reste sur son socle", socle["pose"], True)
            rep.eq("... immobile", socle["vitesse"], 0)
        # L'enfant compte, et les crashs passent avant les reussites.
        kid = page.evaluate("""() => {
          const k = window.__modele.enfant;
          const avant = { c: k.crashes, l: k.landings };
          k.crashes = 5; k.landings = 1;
          const a = k.tree();
          const b = k.tree();
          k.crashes = avant.c; k.landings = avant.l;
          return { a, b };
        }""")
        if kid:
            rep.eq("cinq crashs et une reussite : le reproche d'abord",
                   kid["a"], "tooManyCrashes")
            rep.eq("et la reussite attend son tour", kid["b"], "successfulLanding")

        # --- les huit sons d'interface (docs/77-sons.md) -------------------------
        #
        # Le portage n'en jouait AUCUN : avancer un dialogue, le finir, viser
        # un referentiel, allumer sa lampe — tout en silence.
        son = page.evaluate("""() => {
          const u = window.__sonsUI;
          if (!u) return null;
          const f = (n) => { const s = u.fire(n); return s ? s.file : null; };
          return { avance: f("AdvanceText"), fin: f("ExitDialogueMode"),
                   lampeOn: f("TurnOnFlashlight"), lampeOff: f("TurnOffFlashlight"),
                   vise: f("TargetReferenceFrame"),
                   lache: f("UntargetReferenceFrame"),
                   volume: u.fire("AdvanceText") ? u.fire("AdvanceText").volume : null,
                   repAir: (u.startRepair(true) || {}).file,
                   repVide: (u.startRepair(false) || {}).file };
        }""")
        if son:
            rep.check("le son d'avance de texte existe", son["avance"] is not None,
                      son["avance"], "!= None")
            rep.check("et celui de fin est DIFFERENT",
                      son["fin"] is not None and son["fin"] != son["avance"],
                      son["fin"], f"!= {son['avance']}")
            rep.eq("la lampe fait le meme bruit dans les deux sens",
                   son["lampeOn"], son["lampeOff"])
            rep.check("viser et lacher ne s'entendent pas pareil",
                      son["vise"] != son["lache"], [son["vise"], son["lache"]],
                      "differents")
            rep.eq("a demi-volume", son["volume"], 0.5)
            rep.check("on ne repare pas pareil dans le vide",
                      son["repAir"] != son["repVide"],
                      [son["repAir"], son["repVide"]], "differents")

        # --- la proximite du vaisseau (docs/76-proximite.md) ---------------------
        prox = page.evaluate("""() => {
          const p = window.__proximite;
          return p ? { n: p.zones.length,
                       rayon: p.zones[0] ? p.zones[0].volume.radius : 0 } : null;
        }""")
        if prox:
            rep.eq("une zone de proximite du vaisseau", prox["n"], 1)
            rep.eq("de treize unites", prox["rayon"], 13)
        # Le tutoriel de la sonde est a usage unique.
        tut = page.evaluate("""() => {
          const i = window.__invites;
          return i ? { detruites: i.detruites, reste: i.sonde.length } : null;
        }""")
        if tut:
            rep.eq("les invites de sonde sont encore la", tut["detruites"], False)
            rep.eq("les cinq", tut["reste"], 5)

        # --- la fin de la liste (docs/75-chaleur.md) -----------------------------
        #
        # `heatSources` cherchait des classes dont le NOM contient « heat » : il
        # n'y en a AUCUNE dans ce build. La liste etait vide, et la guimauve ne
        # chauffait jamais — docs/67 a bati le soin du jeu par-dessus.
        ch = page.evaluate("""() => {
          const c = window.__chaleur;
          if (!c) return null;
          // Neuf emetteurs de rayonnement, dont HUIT feux (`radiationType` 1) :
          // compter le tout mesurait autre chose que ce que le controle nomme.
          return { sources: c.sources.filter((e) => e.type === 1).length,
                   surLeFeu: c.sur ? Math.round(c.sur) : 0 };
        }""")
        if ch:
            rep.eq("huit feux de camp", ch["sources"], 8)
            rep.eq("et cent de chaleur sur le premier", ch["surLeFeu"], 100)
        # La sonde ancienne avance, et rien ne l'arrete.
        anc = page.evaluate("""() => {
          const a = window.__sondeAncienne;
          if (!a) return null;
          return { v: Math.hypot(a.vel[0], a.vel[1], a.vel[2]) };
        }""")
        if anc:
            rep.check("la sonde ancienne a pris de la vitesse", anc["v"] > 0,
                      round(anc["v"], 1), "> 0")
        # Les quatre invites de sonde, avec leur regard.
        iv = page.evaluate("""() => {
          const i = window.__invites;
          return i ? { n: i.sonde.length,
                       angles: [...new Set(i.sonde.map(x => x.minAngle))] } : null;
        }""")
        if iv:
            rep.eq("cinq invites de sonde et de lunette", iv["n"], 5)
            rep.eq("a quarante-cinq degres et trois cent soixante",
                   sorted(iv["angles"]), [45, 360])

        # --- la queue des lois (docs/74-etalons.md) ------------------------------
        #
        # Les phares du vaisseau : le portage n'en avait AUCUN, et
        # `shiplightRange` etait ecrite, eprouvee, appelee par personne.
        ph = page.evaluate("""() => {
          const p = window.__phares;
          const s = window.__shipRef;
          if (!p || !s) return null;
          const avant = s.boarded;
          s.boarded = false;
          return { existe: true, portee: p.range, avant };
        }""")
        if ph:
            rep.eq("les phares du vaisseau existent", ph["existe"], True)
            rep.eq("a six cents unites de portee", ph["portee"], 600)
        # La carte suit `MapMarker.LateUpdate`, et non une moitie de la regle.
        carte = page.evaluate("""() => {
          const m = window.__map;
          return { derelict: m.derelict === false || m.derelict === undefined };
        }""")
        rep.eq("la carte connait la zone brouillee", carte["derelict"], True)

        # --- les passages, les coquilles, le sol qui tourne (docs/73) ------------
        ep = page.evaluate("""() => {
          const e = window.__epaves;
          return { n: e.count,
                   noms: e.warps.map(w => w.data.name),
                   surSortie: e.warps.filter(w => w.data.onExit).length,
                   jumeaux: e.warps.filter(w => w.jumeau).length };
        }""")
        # `DarkBrambleShortcut` est INACTIF dans le build, et aucun `SetActive`
        # ne le rallume (`il.mjs --appel SetActive`) : l'alpha n'a pas de
        # raccourci depuis Timber Hearth (docs/132).
        rep.eq("deux passages de Dark Bramble", ep["n"], 2)
        rep.eq("pas de raccourci depuis Timber Hearth",
               "DarkBrambleShortcut" in ep["noms"], False)
        rep.eq("un seul part sur la SORTIE", ep["surSortie"], 1)
        rep.eq("et les deux connaissent leur jumeau", ep["jumeaux"], 2)
        # Trois secondes, pas a l'instant : la moitie de `_warpDuration`.
        saut = page.evaluate("""() => {
          const e = window.__epaves;
          const w = e.warps.find(x => !x.data.onExit);
          const p = w.data.position;
          const a = e.update(0.1, 1000, p);
          const b = e.update(0.1, 1002, p);
          const c = e.update(0.1, 1003, p);
          e.drain();
          return { a: a !== null, b: b !== null, c: c !== null,
                   vers: c ? c.receiver.body : null,
                   vitesse: c ? Math.round(Math.hypot(...c.velocity)) : 0 };
        }""")
        rep.eq("entrer ne suffit pas", saut["a"], False)
        rep.eq("ni deux secondes", saut["b"], False)
        rep.eq("a trois secondes, on part", saut["c"], True)
        rep.eq("de Dark Bramble vers l'epave", saut["vers"], "DerelictDimension_Body")
        rep.eq("et en mouvement", saut["vitesse"], 10)
        # Les coquilles sonores, appariees a leur source par position.
        coq = page.evaluate("""() => {
          const c = window.__coquilles;
          if (!c) return null;
          return { n: c.count, appariees: c.paired,
                   rayons: c.shells.map(s => Math.round(s.data.volume.radius)) };
        }""")
        if coq:
            rep.eq("deux coquilles sonores", coq["n"], 2)
            rep.eq("concentriques sur Giant's Deep", sorted(coq["rayons"]), [205, 498])
            rep.at_least("appariees a leur source", coq["appariees"], 1)
        # ON PART AVEC LE SOL, et c'est la vitesse DE DEPART qu'on mesure.
        #
        # Ce controle lisait `player.vel` en cours de parcours et appelait cela
        # « la vitesse initiale ». Il mesurait donc ce que le joueur avait fait
        # depuis — debout sans bouger, sa vitesse retombe, et le controle
        # tombait avec elle des que le parcours s'allongeait (une extraction
        # complete suffit). Le depart, lui, est un instant : on le garde.
        sol = page.evaluate("""() => {
          const v = window.__start && window.__start.v0;
          return v ? Math.hypot(v[0], v[1], v[2]) : null;
        }""")
        if sol is not None:
            rep.check("le joueur ne part pas immobile sur un sol qui tourne",
                      sol > 0, round(sol, 3), "> 0")

        # --- les lois qui n'etaient qu'importees (docs/72-poussiere.md) ---------
        #
        # Quatre lois ecrites, eprouvees, documentees — et presentes dans une
        # seule ligne d'`import`. `lois.mjs` les declarait vivantes pour cette
        # raison, jusqu'a ce qu'il cesse de compter un import pour un appel.
        sable = page.evaluate("""() => {
          const t = window.__tempete;
          return { volumes: t.volumes.length, cylindres: t.cylindres.length,
                   rayons: t.cylindres.map(c => Math.round(c.volume.radius * 10) / 10),
                   actif: t.active };
        }""")
        rep.eq("une tempete de sable posee", sable["volumes"], 1)
        rep.eq("faite de quatre cylindres", sable["cylindres"], 4)
        rep.eq("de rayons decroissants", sable["rayons"], [31.6, 28.0, 23.8, 21.4])
        rep.eq("et on n'est pas dedans", sable["actif"], False)
        # Le volume compose : une entree, une sortie, quel que soit le nombre de
        # cylindres traverses.
        passage = page.evaluate("""() => {
          const t = window.__tempete;
          const c = t.cylindres;
          const e1 = t.update(c[0].position);
          const suivant = t.update(c[1].position);
          const s1 = t.update([1e6, 1e6, 1e6]);
          const s2 = t.update([1e6, 1e6, 1e6]);
          return { e1, suivant, s1, s2, reste: t.active };
        }""")
        rep.eq("entrer annonce une fois", passage["e1"], "enter")
        rep.eq("passer au cylindre suivant n'annonce rien", passage["suivant"], None)
        rep.eq("sortir annonce une fois", passage["s1"], "exit")
        rep.eq("et pas deux", passage["s2"], None)
        rep.eq("l'ecran est calme en sortant", passage["reste"], False)
        # La toile du regard : deux anneaux, retrouves dans le glTF.
        toile = page.evaluate("""() => {
          const t = window.__regard.toiles;
          return { n: t.length,
                   anneaux: t[0] ? [t[0].inner, t[0].outer] : [] };
        }""")
        rep.eq("un animateur de toile", toile["n"], 1)
        rep.eq("et ses deux anneaux nommes", toile["anneaux"], ["innerWeb", "outerWeb"])

        # --- ce qui bouge quand on ne le regarde pas (docs/71-quantique.md) -----
        #
        # Cinq objets sur la lune quantique — trois pins, une cabane, un
        # panneau — et une tete ancienne au musee. Ni la statue ni le parent
        # des cinq n'etaient EXTRAITS : ils etaient dans la scene depuis
        # toujours, et le recensement ne les comptait meme pas.
        qo = page.evaluate("""() => {
          const q = window.__quantiques;
          return { objets: q.objets.length, statues: q.statues.length,
                   noms: q.objets.map(o => o.name).sort(),
                   corps: q.objets.every(o => o.body === "QuantumMoon_Body"),
                   morceaux: q.statues[0] ? q.statues[0].parts : [] };
        }""")
        rep.eq("cinq objets quantiques planaires", qo["objets"], 5)
        rep.eq("trois pins, une cabane, un panneau", qo["noms"],
               ["Pine_Thick", "Pine_Thick", "Pine_Thick", "QuantumCabin", "Sign01"])
        rep.eq("tous sur la lune quantique", qo["corps"], True)
        rep.eq("une statue au musee", qo["statues"], 1)
        rep.eq("avec la tete ancienne", qo["morceaux"], ["AncientHeadStatue"])
        # L'effondrement se declenche sur la TRANSITION visible -> non visible,
        # et une place VISIBLE est refusee.
        col = page.evaluate("""() => {
          const o = window.__quantiques.objets[0];
          const avant = o.collapses;
          o.wasVisible = false;
          const regarde = o.update(true);          // on le regarde : rien
          const detourne = o.update(false, () => [1, 2, 3]);
          const encore = o.update(false, () => [9, 9, 9]);
          // Toutes les places proposees sont refusees : il reste ou il est.
          o.update(true);
          const place = o.position.join(",");
          const bloque = o.update(false, () => null);
          const apres = o.position.join(",");
          return { regarde, detourne, encore, bloque, bouge: place !== apres,
                   n: o.collapses - avant };
        }""")
        rep.eq("regarde, il ne bouge pas", col["regarde"], False)
        rep.eq("a l'instant ou il sort du champ, il bouge", col["detourne"], True)
        rep.eq("et pas une seconde fois hors du champ", col["encore"], False)
        rep.eq("sans place invisible, il ne bouge pas", col["bloque"], False)
        rep.eq("et il est reste ou il etait", col["bouge"], False)
        # La sonde VERROUILLE : photographier a bonne distance et dans le cadre.
        ver = page.evaluate("""() => {
          const o = window.__quantiques.objets[1];
          const loin = o.snapshot(500, true);
          const horsCadre = o.snapshot(50, false);
          const dedans = o.snapshot(50, true);
          o.wasVisible = true;
          const fige = o.update(false, () => [0, 0, 0]);
          o.retrieveProbe();
          o.wasVisible = true;
          const libre = o.update(false, () => [0, 0, 0]);
          return { loin, horsCadre, dedans, fige, libre };
        }""")
        rep.eq("photographier de loin ne verrouille pas", ver["loin"], False)
        rep.eq("hors du cadre non plus", ver["horsCadre"], False)
        rep.eq("dans le cadre et a portee, oui", ver["dedans"], True)
        rep.eq("et un objet verrouille ne s'effondre plus", ver["fige"], False)
        rep.eq("rappeler la sonde le libere", ver["libre"], True)

        # --- ce qui se commande, et quand (docs/70-modes.md) --------------------
        #
        # `OWInput` echange un ensemble de canaux actifs a chaque changement de
        # mode. Le portage lisait les vingt-deux en permanence.
        mo = page.evaluate("""() => {
          const m = window.__modes;
          return { mode: m.mode, actifs: m.actif.size,
                   lampe: m.permet("Flashlight"), pilote: m.permet("Autopilot") };
        }""")
        rep.eq("a pied, dix-huit canaux sur vingt-deux", mo["actifs"], 18)
        rep.eq("la lampe repond", mo["lampe"], True)
        rep.eq("et l'autopilote, non", mo["pilote"], False)
        # La lunette ROOTE le joueur : ni marche, ni saut. C'est le controle qui
        # se sent le plus, et le portage laissait marcher.
        page.mouse.move(640, 360)
        page.mouse.down(button="middle")
        page.mouse.up(button="middle")
        page.wait_for_timeout(300)
        lun = page.evaluate("""() => {
          const m = window.__modes;
          return { mode: m.mode, n: m.actif.size, marche: m.permet("Move Z"),
                   saut: m.permet("Jump"), zoom: m.permet("Zoom In") };
        }""")
        rep.eq("a la lunette, six canaux", lun["n"], 6)
        rep.eq("on ne marche plus", lun["marche"], False)
        rep.eq("on ne saute plus", lun["saut"], False)
        rep.eq("et le zoom repond", lun["zoom"], True)
        # Et la MEME touche ne fait plus rien : le filtre vit dans `Commandes`.
        rep.eq("la touche de marche ne rend plus rien", page.evaluate(
            "() => window.__cmds.axis('Move Z', { keys: { KeyW: true } })"), 0)
        page.mouse.down(button="middle")
        page.mouse.up(button="middle")
        page.wait_for_timeout(300)
        rep.eq("lunette refermee, on remarche", page.evaluate(
            "() => window.__cmds.axis('Move Z', { keys: { KeyW: true } })"), 1)
        rep.eq("et on est rendu a dix-huit canaux",
               page.evaluate("() => window.__modes.actif.size"), 18)

        # --- s'asseoir (docs/69-assise.md) --------------------------------------
        #
        # Les quatre `PlayerAttachPoint` : le portage ne s'asseyait nulle part,
        # et `attachPoints` etait ecrit, eprouve, et appele par personne.
        assise = page.evaluate("""() => {
          const a = window.__assise.points;
          const profils = a.points.map(p => [p.name, p.lockPlayerTurning,
                                             p.matchRotation, p.centerCamera].join("/"));
          return { n: a.count, profils, cibles: window.__assise.cibles.length };
        }""")
        rep.eq("quatre points d'accrochage", assise["n"], 4)
        rep.eq("dont le poste de pilotage, qui prend tout",
               "FlightConsole/true/true/true" in assise["profils"], True)
        rep.eq("et l'ascenseur, qui ne prend rien",
               assise["profils"].count("AttachPoint/false/false/false"), 1)
        rep.eq("deux verrouillages de camera poses", assise["cibles"], 2)
        # La duree du demi-tour est un ANGLE divise par un taux : dos tourne au
        # siege, 1,8 s ; de face, aucune. C'est ce que le portage n'avait pas.
        duree = page.evaluate("""() => {
          const a = window.__assise.points;
          const p = a.points.find(x => x.name === "FlightConsole");
          p.follow({ position: [0, 0, 0], rotation: [0, 0, 0, 1] });
          p.attach({ position: [0, 0, -1], rotation: [0, 1, 0, 0] }, 0);
          const dos = p.turnDuration;
          p.detach();
          p.attach({ position: [0, 0, -1], rotation: [0, 0, 0, 1] }, 0);
          const face = p.turnDuration;
          // On se leve avec la vitesse du siege, jamais zero.
          const leve = p.detach([0, 0, 200]);
          p.follow(null);
          a.current = null;
          a.drain();
          return { dos: Math.round(dos * 100) / 100, face, emporte: leve.velocity[2] };
        }""")
        # ET ON S'ASSIED POUR DE VRAI, dans la boucle de rendu.
        #
        # Les controles ci-dessus appellent la loi a la main ; ils ne touchent
        # jamais au chemin que la boucle emprunte. Une faute de PORTEE y a
        # dormi un lot entier — `siegeVivant()` lisait le repere ancre depuis
        # `boot()`, ou il n'existe pas — parce qu'aucun controle ne MONTAIT
        # dans le vaisseau (docs/71-quantique.md).
        assis = page.evaluate("""() => {
          const s = window.__shipRef;
          if (!s) return { saute: true };
          const avant = { boarded: s.boarded };
          s.boarded = true;
          return { avant, saute: false };
        }""")
        if not assis["saute"]:
            page.wait_for_timeout(800)
            rep.eq("monter dans le vaisseau ne leve pas", _ERREURS_PAGE[:2], [])
            rep.eq("et le moteur tourne toujours",
                   page.evaluate("() => typeof window.__visee"), "object")
            # Le vocabulaire des modes (docs/86-annonces-de-mode.md) : le
            # portage faisait deja la bonne transition sous son propre nom, il
            # la dit maintenant dans celui du jeu.
            rep.eq("monter au poste annonce EnterFlightConsole",
                   page.evaluate("() => window.__modes.events.slice(-1)"),
                   ["EnterFlightConsole"])
            rep.eq("et l'autopilote repond au poste",
                   page.evaluate("() => window.__modes.permet('Autopilot')"), True)
            page.evaluate("() => { window.__shipRef.boarded = false;"
                          "  window.__assise.points.detach([0,0,0]);"
                          "  window.__assise.points.drain(); }")
            page.wait_for_timeout(300)

        rep.eq("dos tourne, le demi-tour dure 1,8 s", duree["dos"], 1.8)
        rep.eq("de face, aucune duree", duree["face"], 0)
        rep.eq("et on se leve avec la vitesse du siege", duree["emporte"], 200)

        # Le verrouillage de camera, RELU dans l'IL : le corps tourne en lacet
        # a une vitesse proportionnelle a l'ecart, et le champ suit 500/d.
        verrou = page.evaluate("""() => {
          const v = window.__assise.verrou;
          v.lockOn({ name: "test" }, { followRate: 2 });
          const r = v.update(0.5, [10, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], 20, 70);
          const rompu = v.breakLock();
          return { yaw: r.yaw, fov: r.fov, snap: rompu.snapSeconds,
                   apres: v.update(1, [10, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], 20, 70) };
        }""")
        rep.eq("le lacet vaut l'ecart fois le taux fois le temps", verrou["yaw"], 90)
        rep.eq("et le champ, cinq cents sur la distance", verrou["fov"], 25)
        rep.eq("la rupture ramene le champ en deux secondes", verrou["snap"], 2)
        rep.eq("et plus rien ne suit", verrou["apres"], None)

        # --- se redresser prend 1,8 s (docs/106-redressement.md) --------------
        #
        # `AlignWithDirection` n'etait lue nulle part : le haut du joueur etait
        # le bas du champ dominant, pris tel quel a chaque image. Ce controle
        # mesure le module DANS la page, sur une copie, et remet l'etat — le
        # verrouiller sur la vraie instance ferait basculer la partie.
        redresse = page.evaluate("""() => {
          const R = window.__redressement;
          if (!R) return null;
          const vrai = { up: R.up, degres: R.degres, steady: R.steady };
          R.reset();
          R.update([0, 1, 0], 1 / 50);
          const premier = R.up.join(',');
          R.init();
          const rallume = R.steady;
          let pas = 0;
          while (Math.abs(R.up[1] + 1) > 1e-9 && pas < 1000) {
            R.update([0, -1, 0], 1 / 50); pas += 1;
          }
          const arrive = R.up.map(v => Math.round(v * 1e6) / 1e6).join(',');
          // Sans champ, rien ne bouge : le corps garde son orientation.
          const fige = R.update(null, 1 / 50).tourne;
          Object.assign(R, vrai);
          return { premier, rallume, pas, secondes: Math.round(pas / 50 * 100) / 100,
                   arrive, fige,
                   // Le monde reel : le joueur DOIT etre aligne au repos.
                   ecartCourant: Math.round(vrai.degres * 100) / 100,
                   hautCourant: Array.isArray(vrai.up) };
        }""")
        if redresse:
            rep.eq("la premiere image ne s'interpole pas", redresse["premier"], "0,1,0")
            rep.eq("entrer dans un champ rallume la compensation",
                   redresse["rallume"], True)
            rep.eq("un demi-tour prend quatre-vingt-dix pas", redresse["pas"], 90)
            rep.eq("soit 1,8 seconde a cinquante hertz", redresse["secondes"], 1.8)
            rep.eq("et l'on arrive exactement au but", redresse["arrive"], "0,-1,0")
            rep.eq("sans champ, le corps garde son orientation", redresse["fige"], 0)
            rep.eq("le joueur a bien un haut dans la page",
                   redresse["hautCourant"], True)
            # Debout au village, le redressement est termine : l'ecart mesure a
            # l'image d'avant est nul. Un ecart durable dirait que le haut voulu
            # fuit — le signe qu'on interpole vers une cible qui bouge seule.
            rep.eq("et il est aligne, au repos", redresse["ecartCourant"] < 1, True)

        # --- la reparation, dehors, piece par piece (docs/132) -----------------
        #
        # `RepairVolume` s'allume avec SA piece, et la piece est la plus proche
        # du POINT d'impact parmi quinze. Un choc sur le nez et un autre sur un
        # reacteur de gauche allument DEUX volumes — le portage, qui comptait
        # par position, en allumait six.
        page.evaluate("""() => { const d = window.__shipRef && window.__shipRef.damage; if (!d) return;
          window.__shipRef.boarded = false;
          const nez = d.composants.find((c) => c.location === 'avant');
          const gauche = d.composants.find((c) => c.thruster === 'Left');
          if (nez) d.impact(40, null, nez.position);
          if (gauche) d.impact(60, null, gauche.position); }""")
        page.wait_for_timeout(1500)
        rep_actifs = page.evaluate("""() => { const r = window.__reparations; if (!r) return null;
          const c = {}; for (const v of r.actifs) c[v.repair.volume.location] = (c[v.repair.volume.location] || 0) + 1;
          return { c, pieces: window.__shipRef.damage.composants.length }; }""")
        if rep_actifs is not None:
            rep.eq("quinze pieces au vaisseau, dix reacteurs et cinq de coque",
                   rep_actifs["pieces"], 15)
            rep.eq("reparation : deux volumes allumes, ceux des deux pieces touchees",
                   rep_actifs["c"], {"avant": 1, "gauche": 1})
        page.evaluate("() => { const d = window.__shipRef && window.__shipRef.damage; if (d) d.reset(); }")

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
        #
        # On REGARDE donc l'Attlerock d'abord : viser le vide ne vise plus
        # rien, comme dans le build (docs/132), et c'est ce que ce controle
        # prenait pour une cible. La lune est proche : le premier temps la
        # retient, et la derive du regard entre deux clics ne l'en sort pas.
        page.evaluate("""() => {
          const lune = (window.__bodies || []).find((b) => b.name === "GravityWell_Moon");
          if (lune && window.__interaction && window.__interaction.viser) {
            window.__interaction.viser(lune.position);
          }
        }""")
        page.wait_for_timeout(600)
        page.mouse.move(640, 360)
        page.mouse.down(button="left"); page.mouse.up(button="left")
        try:
            page.wait_for_function(
                "() => window.__visee.current !== null && Math.round(window.__visee.bracket * 100) === 0",
                timeout=5000)
        except Exception:
            pass
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
        # On ATTEND l'etat, au lieu de six dixiemes fixes : depuis que le
        # systeme entier est charge (docs/132), une image logicielle peut
        # depasser ce delai, et le controle echouait une fois sur trois sans
        # rien mesurer. Les crochets se rouvrent en fondu : on laisse le temps.
        try:
            page.wait_for_function(
                "() => window.__visee.current === null && Math.round(window.__visee.bracket) === 1",
                timeout=5000)
        except Exception:
            pass
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
          //
          // SANS COMBINAISON, RIEN NE MONTE : le sac dorsal est inerte tant
          // qu'on ne l'a pas revetue (`PlayerJetpackController.enabled`,
          // docs/124), et les boutons Monter/Descendre sont masques. Le cran
          // de course se mesure donc les deux fois.
          const suitAvant = t.suit;
          t.setContext({menu: false, map: false, suit: false});
          send('.tc-zone-move', 'pointerdown', 200, 500, 1);
          send('.tc-zone-move', 'pointermove', 200, 400, 1);
          const courseSansCombi = t.axes.up;
          send('.tc-zone-move', 'pointerup', 200, 400, 1);
          const enVolSansCombi = [...document.querySelectorAll('#touchui .tc-btn')]
            .filter(b => b.offsetParent).map(b => b.getAttribute('aria-label'));
          t.setContext({menu: false, map: false, suit: true});
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

          // LA MEME TAPE, SOUS UN POUCE QUI TREMBLE. C'est le geste reel, et
          // c'est celui que la premiere regle refusait : elle comptait le
          // chemin parcouru, or huit images a deux pixels de gigue en font
          // trente-deux pour zero de deplacement. La tape devenait un regard,
          // et l'action principale du jeu ne partait pas (docs/95).
          send('.tc-zone-look', 'pointerdown', 900, 400, 5);
          for (let i = 1; i <= 8; i++) {
            send('.tc-zone-look', 'pointermove',
                 900 + (i % 2 ? 2 : -2), 400 + (i % 3 ? 2 : -2), 5);
          }
          send('.tc-zone-look', 'pointerup', 900, 400, 5);
          const apresGigue = vus.length;
          // Et un vrai glissement n'en est toujours pas une.
          send('.tc-zone-look', 'pointerdown', 900, 400, 6);
          send('.tc-zone-look', 'pointermove', 960, 400, 6);
          send('.tc-zone-look', 'pointerup', 960, 400, 6);
          const apresGlissement = vus.length;
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

          // LE DIALOGUE AU DOIGT. Trois mesures, et les trois etaient fausses :
          // les options etaient recouvertes par le manche gauche (#dialogue
          // vivait dans #hud, qui est `position: fixed` et fait donc contexte
          // d'empilement : son z-index 6 n'y valait que dedans), « Next »
          // tombait sous le losange d'action, et il faisait 29 x 16 pixels la
          // ou un doigt en demande 44 (docs/95-pnj-au-doigt.md).
          //
          // On ouvre une conversation a la main, on mesure, on remet l'etat :
          // un controle ne doit rien changer.
          const dial = window.__dialogue, dlgUI = window.__dlgUI;
          const avantDlg = dial.active;
          let dlg = null;
          for (const c of dial.conversations) {
            if (!c.tree || !dial.open(c)) continue;
            while (dial.view && !dial.view.atEnd) dial.advance();
            if (!dial.view) continue;              // branche close sans reponse
            dlgUI.render(dial.view, false);
            const boite = document.querySelector('.dlg-fond').getBoundingClientRect();
            const face = document.querySelector('.tc-face').getBoundingClientRect();
            const cible = (el) => {
              if (!el || el.hidden) return null;
              const r = el.getBoundingClientRect();
              const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              // Le bouton porte une icone et un texte : ce qu'on touche peut
              // etre l'un des deux, et c'est toujours le bouton.
              const b = e && e.closest && e.closest('.dlg-choix');
              return { h: Math.round(r.height),
                       sous: b ? 'dlg-choix' : e ? String(e.className || e.tagName) : 'rien' };
            };
            dlg = { chevauche: boite.right > face.left && boite.bottom > face.top,
                    option: cible(document.querySelector('.dlg-opt')),
                    next: cible(document.querySelector('.dlg-choix')) };
            if (dlg.option) break;     // une conversation a reponses suffit
          }

          // LIRE UN PANNEAU. Les trente-quatre textes etaient extraits et
          // affiches nulle part : `render` ne recevait jamais de vue de
          // lecture. On en ouvre un long a la main, on compte les appuis, on
          // verifie que la boite porte bien le style de panneau, et on remet
          // l'etat (docs/105-lire.md).
          let lecture = null;
          const lisibles = (window.__interactables.items || [])
            .filter((x) => x.kind === 'readable' && x.text);
          const plusLong = lisibles.sort((a, b) => b.text.length - a.text.length)[0];
          if (plusLong && dial.read(plusLong)) {
            const v = dial.view;
            dlgUI.render(v, !!v.sign);
            const boite = document.querySelector('.dlg-imgui');
            let appuis = 0;
            while (dial.active && appuis < 40) { dial.advance(); appuis += 1; }
            lecture = {
              lisibles: lisibles.length,
              sansTexte: (window.__interactables.items || [])
                .filter((x) => x.kind === 'readable' && !x.text).length,
              pages: v.pageCount,
              lignes: v.lines.length,
              plusLongueLigne: Math.max(0, ...v.lines.map((l) => l.length)),
              panneau: v.sign === true,
              style: boite.classList.contains('dlg-sign'),
              options: v.options.length,
              texteAffiche: document.querySelector('.dlg-texte').textContent.length,
              appuis,
              ferme: dial.active === null,
              // Rien n'est perdu : la somme des mots des pages est celle du
              // texte, retours a la ligne mis a plat.
              motsRendus: 0, motsSource: 0,
            };
            dial.read(plusLong);
            let mots = 0;
            do { mots += dial.view.lines.join(' ').split(/\s+/).filter(Boolean).length;
                 dial.advance(); } while (dial.active);
            lecture.motsRendus = mots;
            lecture.motsSource = plusLong.text.replace(/\\r\\n?|\\n/g, ' ')
              .split(/\\s+/).filter(Boolean).filter((w) => w !== '@').length;
          }

          dial.active = avantDlg;
          dlgUI.render(dial.view, false);

          const manches = document.querySelectorAll('#touch .tc-stick').length;
          const empreintes = document.querySelectorAll('#touch .tc-home').length;
          const boutons = document.querySelectorAll('#touchui .tc-btn').length;
          t.disable();          // la page est rendue telle qu'elle etait
          t.setContext({menu: false, map: false, suit: !!suitAvant});
          return {courseSansCombi, enVolSansCombi,
                  avant, course, relache, apresCourse, glisse, vitesse, arret,
                  vus, apresGigue, apresGlissement, dlg, lecture,
                  suspendu, manches, empreintes, boutons, enVol, enMenu,
                  pouceGauche, pouceDroit};
        }""")
        rep.eq("manche gauche a fond : axe sature a 1", tactile["avant"], 1)
        rep.eq("sans combinaison, le cran de course ne monte pas",
               tactile["courseSansCombi"], False)
        rep.eq("sans combinaison, ni Monter ni Descendre",
               [b for b in tactile["enVolSansCombi"] if b in ("Monter", "Descendre")], [])
        rep.eq("a fond devant, en combinaison : le cran de course fait MONTER",
               tactile["course"], True)
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
               tactile["vus"][:2], ["KeyE", "KeyE"])
        # Un pouce ne tient pas immobile : la tape doit survivre a sa gigue.
        rep.eq("une tape sous un pouce qui tremble reste une tape",
               tactile["apresGigue"], 3)
        rep.eq("un glissement n'en est toujours pas une",
               tactile["apresGlissement"], 3)
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
        rep.eq("la manette en vol, en combinaison", tactile["enVol"],
               ["Telescope", "Sonde", "Carte du systeme", "Lampe",
                "Ordinateur de bord", "Affichage", "Menu",
                "Monter", "Descendre", "Sauter", "Interagir, parler"])
        rep.eq("un menu la remplace par la croix et les deux reponses",
               tactile["enMenu"],
               ["Haut", "Gauche", "Droite", "Bas", "Valider", "Retour"])
        rep.eq("boutons tactiles en tout", tactile["boutons"], 19)

        # Le dialogue au doigt. Sans conversation dans la scene il n'y a rien a
        # mesurer ; avec le build, il y en a quatorze.
        dlg = tactile["dlg"]
        if dlg and dlg["option"]:
            rep.eq("la boite de dialogue ne passe plus sous le losange d'action",
                   dlg["chevauche"], False)
            rep.eq("ce que le doigt touche sur une option, c'est l'option",
                   dlg["option"]["sous"], "dlg-opt dlg-sel")
            rep.eq("une option fait la taille d'un doigt",
                   dlg["option"]["h"] >= 36, True)
            if dlg["next"]:
                rep.eq("et « Next » est bien « Next », pas le bouton derriere",
                       dlg["next"]["sous"], "dlg-choix")
                rep.eq("« Next » fait la taille d'un doigt",
                       dlg["next"]["h"] >= 40, True)

        # --- lire un panneau (docs/105-lire.md) -------------------------------
        lect = tactile["lecture"]
        if lect:
            # Trente-quatre poses, dont un sur un objet inactif (docs/132).
            rep.eq("trente-trois objets lisibles, tous avec leur texte",
                   lect["lisibles"], 33)
            rep.eq("aucun objet lisible sans texte", lect["sansTexte"], 0)
            rep.eq("le plus long se lit en plusieurs fois", lect["pages"] > 1, True)
            # Cinq lignes AU PLUS : le plus long des trente-quatre commence par
            # une phrase courte suivie d'une arobase, et sa premiere page ne
            # fait donc qu'une ligne. C'est le plafond qui est la loi.
            rep.eq("une page de panneau tient cinq lignes au plus",
                   1 <= lect["lignes"] <= 5, True)
            rep.eq("et aucune ligne ne depasse soixante-dix caracteres",
                   lect["plusLongueLigne"] <= 70, True)
            rep.eq("c'est un panneau, pas quelqu'un qui parle",
                   lect["panneau"], True)
            rep.eq("... et la boite porte le style de panneau", lect["style"], True)
            rep.eq("un panneau n'offre aucune option", lect["options"], 0)
            rep.eq("le texte arrive jusqu'au DOM", lect["texteAffiche"] > 0, True)
            rep.eq("la lecture se termine au dernier appui", lect["ferme"], True)
            rep.eq("... apres autant d'appuis que de pages",
                   lect["appuis"], lect["pages"])
            rep.eq("et il en faut plus d'un", lect["pages"] > 1, True)
            # L'invariant qui compte : le decoupage ne PERD rien. Ce module
            # s'arretait a la premiere page et posait un « … » sur le reste.
            rep.eq("et tous les mots du texte ont ete affiches",
                   lect["motsRendus"], lect["motsSource"])

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

        # --- les seuils et les zones sans soleil (docs/83-seuils.md) ------------
        #
        # `DarkZone` n'etait pas `SunlessZone` : deux classes, deux evenements,
        # deux auditeurs. L'ambiance ne s'eteignait dans aucune grotte.
        seuils = page.evaluate("""() => {
          const L = window.__lots;
          if (!L || !L.zonesSansSoleil) return null;
          const z = L.zonesSansSoleil;
          return {
            zones: z.zones.length,
            portes: z.portes.length,
            contenances: z.contenants.length,
            compte: z.count,
            teinte: L.etat.secteurAmbiant,
          };
        }""")
        if seuils:
            rep.eq("zones sans soleil montees", seuils["zones"], 5)
            rep.eq("portes suivies", seuils["portes"], 8)
            rep.eq("et une seule zone qui vaut par contenance",
                   seuils["contenances"], 1)
            # Debout au village, dehors : aucune zone franchie.
            rep.eq("au village, il fait jour", seuils["compte"], 0)
            # Timber Hearth porte `_ambientLight = 1` : le bleu de nuit.
            rep.eq("et le secteur est en bleu de nuit", seuils["teinte"], 1)
            rep.eq("la lumiere ambiante en porte la teinte",
                   page.evaluate("() => { const s = window.__scene ||"
                                 " BABYLON.Engine.LastCreatedScene;"
                                 " const a = s.lights.find(l => l.name === 'amb');"
                                 " return a ? Math.round(a.diffuse.b * 1000) /"
                                 " Math.round(a.diffuse.r * 1000) > 1 : null; }"), True)

        # --- les zones d'ambiance et leurs seuils (docs/84-ambiance.md) --------
        #
        # Six des dix-sept zones n'ont pas de collider. L'extraction leur en
        # fabriquait un avec la premiere boite d'enfant trouvee : la grotte aux
        # quatre portes se reduisait a UNE porte de onze metres.
        amb = page.evaluate("""() => {
          const a = window.__audio && window.__audio.ambience;
          if (!a) return null;
          const z = a.zones;
          return {
            zones: z.length,
            sansForme: z.filter(x => !x.volume).length,
            portes: z.reduce((n, x) => n + (x.entryways || []).length, 0),
            grotte: (z.find(x => x.name === "CaveVolume01") || {}).entryways
                      ? z.find(x => x.name === "CaveVolume01").entryways.length : -1,
            couches: a.playing.map(l => l.name).sort(),
            // L'arbitrage du build : une seule tete par couche, et la couche 0
            // couvre tout ce qui lui est inferieur (docs/104-arbitrage.md).
            parCouche: a.playing.reduce((m, l) => (m[l.layer] = (m[l.layer] || 0) + 1, m), {}),
            // Ce que le melangeur donne au moteur, source par source.
            cles: a.playing.map(l => l.key).sort(),
            jourNuit: a.etats.filter(e => e.jourNuit).map(e => e.zone.name).sort(),
            // Le jour se lit sur les positions du monde, pas sur un drapeau :
            // si `jourDe` jetait, tout ce qui suit serait fige.
            jours: a.etats.filter(e => e.jourNuit).map(e => e.jour),
          };
        }""")
        if amb:
            rep.eq("zones d'ambiance montees", amb["zones"], 17)
            rep.eq("dont six sans forme propre", amb["sansForme"], 6)
            rep.eq("quatorze seuils leur sont joints", amb["portes"], 14)
            rep.eq("et la grotte aux quatre portes les a toutes", amb["grotte"], 4)
            # Debout au village : l'atmosphere et la musique du village, pas la
            # grotte d'en face.
            rep.check("au village, aucune ambiance de grotte ne joue",
                      all("Cave" not in (n or "") for n in amb["couches"]),
                      amb["couches"], "aucune Cave*")
            rep.at_least("et au moins une couche sonne", len(amb["couches"]), 1)
            # `ActivateLayer` n'active que la tete de couche — mais un
            # `DayNightAudioVolume` porte DEUX sources, qui se croisent a
            # l'aube. Le compte par couche vaut donc 1, ou 2 pendant la
            # bascule, jamais plus.
            rep.check("au plus deux sources par couche, et seulement en bascule",
                      all(n <= 2 for n in amb["parCouche"].values()),
                      amb["parCouche"], "<= 2 par couche")
            rep.eq("chaque source sonnante a sa propre cle",
                   len(set(amb["cles"])), len(amb["cles"]))
            rep.eq("les trois volumes jour/nuit sont montes comme tels",
                   ",".join(amb["jourNuit"]),
                   "VillageAmbience_Day,VillageMusic,WindyAmbience")
            # `IsDay` a besoin du centre de la planete, du point et du soleil.
            # Une seule position manquante et le booleen resterait a `true`
            # pour les trois, quelle que soit l'heure.
            rep.check("et leur jour se lit sans exception",
                      all(isinstance(j, bool) for j in amb["jours"]),
                      amb["jours"], "trois booleens")

        # --- ce que les seuils commandent encore (docs/85-chambre.md) ----------
        #
        # Les deux derniers seuils orphelins : la chambre en apesanteur du
        # village, et le champ de la station meteo. Ni l'une ni l'autre n'a de
        # collider — le portage les ecartait toutes les deux.
        chambre = page.evaluate("""() => {
          const L = window.__lots;
          if (!L || !L.presencesZeroG) return null;
          const sans = L.presencesZeroG.filter(p => !p.zone.volume);
          return {
            champs: L.presencesZeroG.length,
            sansForme: sans.length,
            portesChambre: sans.length ? sans[0].portes.length : -1,
            champsParSeuils: L.champsParSeuils.length,
            portesMeteo: L.champsParSeuils.length
              ? L.champsParSeuils[0].portes.length : -1,
            meteoPresente: L.champsParSeuils.length
              ? !!L.champsParSeuils[0].zone.present : null,
          };
        }""")
        if chambre:
            rep.eq("champs d'apesanteur montes", chambre["champs"], 4)
            rep.eq("dont un sans forme", chambre["sansForme"], 1)
            rep.eq("et il a sa porte", chambre["portesChambre"], 1)
            rep.eq("un champ directionnel par seuils",
                   chambre["champsParSeuils"], 1)
            rep.eq("avec ses deux portes", chambre["portesMeteo"], 2)
            # Au village de Timber Hearth, on n'est pas dans la station meteo
            # de Brittle Hollow.
            rep.eq("et on n'y est pas", chambre["meteoPresente"], False)

        # --- la vue d'atterrissage (docs/87-atterrissage.md) -------------------
        #
        # Le canal `Landing Camera` au poste de pilotage : le regard bascule a
        # l'appui, la camera 0,45 s plus tard, et le manche change de main.
        page.evaluate("() => { window.__shipRef.boarded = true; }")
        page.wait_for_timeout(400)
        att0 = page.evaluate("""() => {
          const a = window.__atterrissage;
          return a ? { on: a.on, roule: a.rollByDefault, flip: a.flipRollFactor,
                       mode: a.mode } : null;
        }""")
        if att0:
            rep.eq("au poste, la vue d'atterrissage est fermee", att0["on"], False)
            rep.eq("le manche lace", att0["roule"], False)
            rep.eq("et le roulis n'est pas inverse", att0["flip"], 1)
            page.keyboard.press("KeyR")
            page.wait_for_timeout(200)
            att1 = page.evaluate("() => ({ on: window.__atterrissage.on,"
                                 " transition: window.__atterrissage.transition,"
                                 " roule: window.__atterrissage.rollByDefault,"
                                 " flip: window.__atterrissage.flipRollFactor })")
            # Les 0,45 s de transition ne sont PAS observables ici : sous
            # swiftshader une image peut durer une seconde, et la premiere
            # image apres l'appui tombe deja au-dela du delai. Ce que ce
            # controle mesure est donc ce qui est synchrone de l'appui — les
            # commandes — et le delai lui-meme est garde par tests/09-jeu.mjs.
            rep.eq("le manche roule des l'appui", att1["roule"], True)
            rep.eq("et le roulis est inverse", att1["flip"], -1)
            page.wait_for_timeout(900)
            att2 = page.evaluate("""() => {
              const a = window.__atterrissage;
              return { on: a.on, annonces: a.events.slice(-2),
                       mode: window.__modes.mode };
            }""")
            rep.eq("passe le delai, la vue s'ouvre", att2["on"], True)
            rep.eq("avec les deux annonces du build", att2["annonces"],
                   ["SwitchActiveCamera", "EnterLandingView"])
            rep.eq("et le jeu de commandes change", att2["mode"], "atterrissage")
            page.keyboard.press("KeyR")
            page.wait_for_timeout(300)
            att3 = page.evaluate("() => ({ on: window.__atterrissage.on,"
                                 " roule: window.__atterrissage.rollByDefault,"
                                 " flip: window.__atterrissage.flipRollFactor })")
            rep.eq("ressortir la referme", att3["on"], False)
            rep.eq("le manche relace", att3["roule"], False)
            rep.eq("et le roulis reprend son sens", att3["flip"], 1)

            # `ExitFlightConsole` (docs/114-poste.md) : SE LEVER ferme la vue,
            # et ne range PAS le roulis. Seul le navigateur peut le dire — le
            # branchement vit dans `main.js`, que les tests Node ne chargent
            # pas. On rend ensuite au joueur sa place et sa vitesse : se lever
            # le decale de quatre unites et lui donne celle du siege, ce que
            # les controles suivants n'ont pas demande.
            page.keyboard.press("KeyR")
            page.wait_for_timeout(900)
            avant_leve = page.evaluate("""() => {
              const p = window.__player;
              return { on: window.__atterrissage.on,
                       pos: [p.pos.x, p.pos.y, p.pos.z],
                       vel: [p.vel.x, p.vel.y, p.vel.z] };
            }""")
            page.keyboard.press("KeyE")
            page.wait_for_timeout(300)
            leve = page.evaluate("""() => {
              const a = window.__atterrissage;
              return { boarded: window.__shipRef.boarded, on: a.on,
                       flip: a.flipRollFactor, roule: a.rollByDefault,
                       annonces: a.events.slice(-2) };
            }""")
            rep.eq("la vue etait bien ouverte avant de se lever",
                   avant_leve["on"], True)
            rep.eq("se lever quitte le poste", leve["boarded"], False)
            rep.eq("et referme la vue d'atterrissage", leve["on"], False)
            rep.eq("avec les deux annonces de la sortie", leve["annonces"],
                   ["SwitchActiveCamera", "ExitLandingView"])
            # Ce que le build ne fait PAS : ranger le roulis.
            rep.eq("le manche reste inverse", leve["flip"], -1)
            rep.eq("et le roulis reste le defaut", leve["roule"], True)
            page.evaluate("""(e) => {
              const p = window.__player;
              p.pos.x = e.pos[0]; p.pos.y = e.pos[1]; p.pos.z = e.pos[2];
              p.vel.x = e.vel[0]; p.vel.y = e.vel[1]; p.vel.z = e.vel[2];
              window.__atterrissage.resetRoll();
            }""", avant_leve)
        page.evaluate("() => { window.__shipRef.boarded = false; }")
        page.wait_for_timeout(300)

        # --- la boucle, lue et non devinee (docs/88-boucle.md) ----------------
        boucle = page.evaluate("""() => {
          const l = window.__loop;
          if (!l) return null;
          return { minutes: Math.round(l.duration / 60),
                   prevenue: l.preventSupernova,
                   annonces: l.events.slice(0, 2),
                   codes: !!window.__pdata.knows("knowsLaunchCodes") };
        }""")
        if boucle:
            rep.eq("la boucle dure dix-huit minutes", boucle["minutes"], 18)
            rep.eq("la premiere annonce est celle du build",
                   boucle["annonces"][:1], ["StartOfTimeLoop"])
            # `TimeLoop.Start` : la prevention suit les codes de lancement, et
            # le profil des controles les a appris — les deux doivent donc
            # s'accorder, quel que soit l'etat du profil.
            rep.eq("la fin des temps est suspendue si et seulement si les codes"
                   " sont inconnus", boucle["prevenue"], not boucle["codes"])

        # --- ce que « pose » veut dire (docs/89-pose.md) ----------------------
        #
        # `padLanding` etait ecrite, eprouvee, et appelee par personne : le
        # portage declarait « pose » au contact au sol, sans exiger que les
        # trois capteurs touchent le meme corps ni qu'on soit assez lent.
        pose = page.evaluate("""() => {
          const s = window.__shipRef;
          if (!s) return null;
          return { pose: s.onPad, corps: s.padBody,
                   vitesse: Math.round(s.speed * 100) / 100,
                   annonces: s.pads.events.slice(0, 2) };
        }""")
        if pose:
            # Le vaisseau commence pose sur la piste de Timber Hearth.
            rep.eq("au demarrage, le vaisseau est pose", pose["pose"], True)
            rep.at_most("et il ne bouge pas", pose["vitesse"], 5)
            rep.eq("le toucher s'est annonce", pose["annonces"][:1],
                   ["ShipTouchdown"])
            # Le lancer a plus de cinq unites : on ne se pose plus, on glisse.
            #
            # Ce qui se mesure est l'ANNONCE, pas l'etat qui suit. Au sol, le
            # frottement (0,7 par soixantieme) ramene quarante unites sous cinq
            # en moins d'un dixieme de seconde : le vaisseau decolle des
            # capteurs, glisse, et se repose — et sans GPU les trois tiennent
            # dans une seule image. Lire `onPad` ensuite mesurait le repos.
            n0 = page.evaluate("""() => {
              const s = window.__shipRef;
              const n = s.pads.events.length;
              s.vel.x += 40;
              return n;
            }""")
            try:
                page.wait_for_function(
                    "(n) => window.__shipRef.pads.events.slice(n).length > 0", arg=n0,
                    timeout=15000)
            except Exception:
                pass
            apres = page.evaluate("(n) => window.__shipRef.pads.events.slice(n)", n0)
            rep.eq("lance a quarante unites, il ne l'est plus",
                   "ShipTakeoff" in apres, True)
            rep.eq("et le decollage s'annonce", apres[:1], ["ShipTakeoff"])

        # --- la sphere de l'observatoire (docs/91-remise-a-zero.md) -----------
        raz = page.evaluate("""() => {
          const r = window.__remiseAZero;
          if (!r) return null;
          return { forme: !!r.volume, rayon: r.volume && r.volume.volume
                     ? r.volume.volume.radius : null,
                   armee: r.armed, tiree: r.fired,
                   codes: !!window.__pdata.knows("knowsLaunchCodes"),
                   tour: window.__loop.loopCount };
        }""")
        if raz:
            rep.eq("la sphere de remise a zero est montee", raz["forme"], True)
            rep.eq("et elle mesure 5,196", raz["rayon"], 5.196)
            # `OnStartOfTimeLoop` : armee au PREMIER tour seulement, et
            # seulement tant qu'on ignore les codes. Le profil des controles
            # les connait, donc elle doit etre desarmee.
            rep.eq("armee si et seulement si premier tour sans les codes",
                   raz["armee"], raz["tour"] + 1 == 1 and not raz["codes"])

        # --- la tour de lancement, de bout en bout (docs/92-tour.md) ----------
        tour = page.evaluate("""() => {
          const t = window.__tour;
          if (!t) return null;
          return { bornes: t.bornesTour.length,
                   declencheurs: t.declencheursTour.length,
                   cabines: t.ascenseurs.length,
                   ouverte: t.ascenseurs.some(a => a.unlocked),
                   servie: t.terminal.used };
        }""")
        if tour:
            rep.eq("une borne de lancement montee", tour["bornes"], 1)
            rep.eq("un declencheur d'en haut", tour["declencheurs"], 1)
            rep.eq("une cabine", tour["cabines"], 1)
            # `LaunchElevatorController.Start` ferme les commandes : tant que la
            # borne n'a pas ete pressee, la cabine ne repond pas.
            rep.eq("la cabine nait verrouillee", tour["ouverte"], False)
            rep.eq("et la borne n'a pas servi", tour["servie"], False)
            # La presser sans les codes refuse ; avec, elle ouvre la cabine.
            ouvert = page.evaluate("""() => {
              const t = window.__tour, d = window.__pdata;
              const avant = d.knowsLaunchCodes;
              d.knowsLaunchCodes = false;
              const refus = t.terminal.pressInteract(false);
              d.knowsLaunchCodes = true;
              const ok = t.terminal.pressInteract(true);
              if (ok === "activate") t.ascenseurs.forEach(a => a.activateControls());
              d.knowsLaunchCodes = avant;
              return { refus, ok, ouverte: t.ascenseurs.some(a => a.unlocked) };
            }""")
            rep.eq("sans les codes, la borne refuse", ouvert["refus"], "refuse")
            rep.eq("avec, elle actionne la tour", ouvert["ok"], "activate")
            rep.eq("et la cabine repond", ouvert["ouverte"], True)

        # --- les deux sensibilites (docs/93-commandes.md) ---------------------
        rep.eq("regler la sensibilite de vol change le facteur de vol",
               page.evaluate("""() => {
                 const s = window.__gui.settings;
                 const avant = s.values.flightSensitivity;
                 s.values.flightSensitivity = 10;
                 const double = s.flightFactor();
                 s.values.flightSensitivity = 1;
                 const petit = s.flightFactor();
                 s.values.flightSensitivity = avant;
                 return [double, Math.round(petit * 100) / 100];
               }"""), [2, 0.2])

        # --- la cadence du menu (docs/115-menu.md) ----------------------------
        #
        # `Menu.SELECT_DELAY` vaut 0,2 s. La repetition automatique d'un
        # navigateur tourne a trente millisecondes : sans la cadence, garder
        # une fleche enfoncee parcourt les sept options en un clin d'oeil.
        # Les evenements sont envoyes en RAFALE depuis la page, ce que
        # `page.keyboard.press` ne sait pas faire assez vite.
        menu = page.evaluate("""() => {
          const s = window.__gui.settings;
          const tape = (code) => dispatchEvent(new KeyboardEvent("keydown", { code }));
          tape("Escape");
          s.index = 0;
          for (let i = 0; i < 10; i++) tape("ArrowDown");
          return { ouvert: s.open, rafale: s.index };
        }""")
        rep.eq("le canal Pause ouvre le menu", menu["ouvert"], True)
        rep.eq("dix fleches en rafale n'avancent que d'une ligne",
               menu["rafale"], 1)
        # L'annonce ne part qu'a l'image suivante : le bloc des modes lit
        # l'ETAT, il ne rejoue pas l'appel.
        page.wait_for_timeout(150)
        rep.eq("et le jeu de commandes devient celui du menu",
               page.evaluate("() => window.__modes.mode"), "menu")
        rep.eq("avec l'annonce du build",
               page.evaluate("() => window.__modes.events.at(-1)"),
               "EnterMenuMode")
        page.wait_for_timeout(250)
        menu2 = page.evaluate("""() => {
          const s = window.__gui.settings;
          const tape = (code) => dispatchEvent(new KeyboardEvent("keydown", { code }));
          tape("ArrowDown");
          const apres = s.index;
          // L'autre sens a sa propre horloge : l'aller-retour est immediat.
          tape("ArrowUp");
          const retour = s.index;
          tape("Escape");
          return { apres, retour, ouvert: s.open };
        }""")
        rep.eq("passe le delai, la fleche repasse", menu2["apres"], 2)
        rep.eq("et l'autre sens ne l'attend pas", menu2["retour"], 1)
        rep.eq("le canal Pause referme le menu", menu2["ouvert"], False)
        page.wait_for_timeout(150)
        rep.eq("avec l'annonce de sortie",
               page.evaluate("() => window.__modes.events.at(-1)"),
               "ExitMenuMode")

        # Les touches du BUILD : `Move Z` (W/S, I/K). Dans l'alpha, S descend
        # d'une ligne ; le portage ne lisait que les fleches (docs/132). Et le
        # menu a ses sept lignes, sans la « Nouvelle partie » que le portage
        # y avait ajoutee faute de menu-titre.
        page.wait_for_timeout(250)
        menu3 = page.evaluate("""async () => {
          const s = window.__gui.settings;
          const tape = (code) => dispatchEvent(new KeyboardEvent("keydown", { code }));
          tape("Escape");
          s.index = 0;
          tape("KeyS");
          const bas = s.index;
          await new Promise((r) => setTimeout(r, 250));
          tape("KeyW");
          const haut = s.index;
          const lignes = s.options.length;
          tape("Escape");
          return { bas, haut, lignes, ouvert: s.open };
        }""")
        rep.eq("S descend d'une ligne, comme dans l'alpha", menu3["bas"], 1)
        rep.eq("W la remonte", menu3["haut"], 0)
        rep.eq("sept lignes au menu en partie", menu3["lignes"], 7)
        rep.eq("et le menu se referme", menu3["ouvert"], False)
        page.wait_for_timeout(150)

        # --- les deux tables de manette (docs/94-manette.md) ------------------
        rep.eq("les deux tables de manette s'accordent dans la page",
               page.evaluate("() => window.__padAccord"), [])

        # --- ON PARLE A QUI L'ON REGARDE (docs/132) ----------------------------
        #
        # `FirstPersonManipulator` vise a dix unites, `Observe` exige
        # `_interactRange` (2) du point touche. Trois essais pres du Rocket
        # Scientist, sur la droite qui le joint au point d'apparition : face a
        # lui a 2,2 m (on parle), dos tourne (non), face a lui a 4,5 m (non).
        essai = """async ([dist, face]) => {
          const it = window.__interactables.items.find((x) => x.name === "ConversationZone"
            && x.volume && Math.abs(x.world[2] + 8721) < 1 && Math.abs(x.world[0] - 4) < 1);
          const s = window.__interaction;
          if (!it || !s.repere || !s.viser) return null;
          if (window.__dialogue && window.__dialogue.active) window.__dialogue.active = null;
          const r = s.repere(it);
          const sp = s.repere({ world: [-1.38, -26.51, -8721.03], body: "TimberHearth_Body" });
          const d = [sp[0] - r[0], sp[1] - r[1], sp[2] - r[2]], n = Math.hypot(...d) || 1;
          const agg = window.__player.body;
          agg.transformNode.position.set(r[0] + d[0] / n * dist, r[1] + d[1] / n * dist,
                                         r[2] + d[2] / n * dist);
          agg.body.disablePreStep = false;
          agg.body.setLinearVelocity(BABYLON.Vector3.Zero());
          await new Promise((res) => setTimeout(res, 1200));
          const c = window.__player.pos, q = s.repere(it);
          s.viser(face ? q : [2 * c.x - q[0], 2 * c.y - q[1], 2 * c.z - q[2]]);
          await new Promise((res) => setTimeout(res, 600));
          return true;
        }"""
        parle = {}
        for cle, dist, face in (("face", 2.2, True), ("dos", 2.2, False), ("loin", 4.5, True)):
            if not page.evaluate(essai, [dist, face]):
                break
            page.keyboard.down("KeyE"); page.wait_for_timeout(250)
            page.keyboard.up("KeyE"); page.wait_for_timeout(600)
            parle[cle] = page.evaluate("""() => { const a = !!(window.__dialogue && window.__dialogue.active);
                if (a) window.__dialogue.active = null; return a; }""")
        if parle:
            rep.eq("a deux pas, face au Rocket Scientist, on lui parle", parle.get("face"), True)
            rep.eq("dos tourne, non", parle.get("dos"), False)
            rep.eq("a quatre metres et demi, non plus", parle.get("loin"), False)

        # --- ET ON S'ASSIED POUR DE VRAI (docs/97-assise-instantanee.md) -----
        #
        # EN DERNIER, et c'est la moitie du controle : embarquer perturbe le
        # vaisseau — la touche d'interaction est aussi celle du pilote
        # automatique (docs/61), l'assise pose un point d'accrochage, et les
        # annonces de piste gardent la trace du decollage. Place plus haut, ce
        # bloc faisait echouer trois controles qui n'avaient rien a voir : un
        # controle qui change l'etat du jeu se met a la fin, ou il ne peut plus
        # mentir a personne.
        # ET ON S'ASSIED PAR LE CHEMIN DE LA BOUCLE, PAS EN APPELANT LA LOI.
        #
        # Les trois controles ci-dessus appellent `attach()` a la main, avec un
        # tableau, et mesurent 1,8 s. La boucle, elle, passait l'avant du joueur
        # tel que Babylon le tient — un `Vector3` —, que le module indexe en
        # `v[0]` : longueur NaN, angle zero, duree zero. On s'asseyait D'UN COUP
        # a tous les points d'accrochage, et rien ne le disait : une duree nulle
        # est aussi celle d'un joueur deja aligne (docs/97).
        #
        # L'invariant porte donc sur ce QUI a servi au calcul — la seule chose
        # qui distingue les deux zeros — et il faut pour cela un embarquement
        # REEL : codes de lancement, joueur a portee, touche d'interaction.
        # Le joueur est un corps Havok : lui ecrire `pos` ne sert a rien, la
        # position est RELUE du noeud a chaque pas (`Player.stepPhysics`). On
        # le teleporte donc comme la boucle le fait elle-meme.
        approche = """() => {
          const s = window.__shipRef, p = window.__player;
          if (!s || !p || !p.body || !window.__pdata) return false;
          window.__pdata.knowsLaunchCodes = true;
          // La COMBINAISON d'abord : sans elle, la barriere de Coach renvoie le
          // joueur et ouvre son avertissement (docs/130) — dans l'alpha comme
          // ici, on ne va pas au vaisseau en civil.
          const l = window.__lots;
          if (l && !l.equipment.suit) {
            const combi = l.pickups.find((x) => x.suit);
            if (combi) l.equipment.pickUp(combi); else l.equipment.suit = true;
          }
          if (window.__dialogue && window.__dialogue.active) window.__dialogue.active = null;
          s.boarded = false;
          window.__assise.points.detach([0, 0, 0]);
          const agg = p.body;
          agg.transformNode.position.set(s.pos.x + 2, s.pos.y + 2, s.pos.z + 2);
          agg.body.disablePreStep = false;
          agg.body.setLinearVelocity(BABYLON.Vector3.Zero());
          agg.body.setAngularVelocity(BABYLON.Vector3.Zero());
          return true;
        }"""
        lecture = """() => {
          const pt = window.__assise.points.current;
          if (!pt) return null;
          const v = pt.initForward;
          if (!Array.isArray(v)) return { tableau: false };
          return { tableau: true,
                   fini: v.every((x) => Number.isFinite(x)),
                   norme: Math.round(Math.hypot(v[0], v[1], v[2]) * 1000) / 1000,
                   duree: Number.isFinite(pt.turnDuration) };
        }"""
        codesAvant = page.evaluate(
            "() => !!(window.__pdata && window.__pdata.knowsLaunchCodes)")
        avant = None
        # Une image peut durer une seconde en rendu logiciel : on retente.
        for _ in range(4):
            if not page.evaluate(approche):
                break
            page.keyboard.press("KeyE")
            page.wait_for_timeout(1200)
            avant = page.evaluate(lecture)
            if avant:
                break
        if avant is None:
            print("    diagnostic de l'assise :", page.evaluate("""() => {
              const s = window.__shipRef, p = window.__player;
              return { boarded: s && s.boarded,
                       distance: s && p ? Math.round(Math.hypot(p.pos.x - s.pos.x,
                         p.pos.y - s.pos.y, p.pos.z - s.pos.z) * 10) / 10 : null,
                       mort: !!(window.__death && window.__death.dead),
                       cause: window.__death && window.__death.cause,
                       mode: window.__modes && window.__modes.mode,
                       dialogue: !!(window.__dialogue && window.__dialogue.active),
                       reglages: !!document.querySelector('.ow-settings:not([hidden])') };
            }"""))
        rep.eq("la touche d'interaction assied pour de vrai",
               avant is not None, True)
        if avant:
            rep.eq("et le siege recoit un vrai vecteur, pas un Vector3",
                   avant["tableau"], True)
            if avant["tableau"]:
                rep.eq("dont les trois composantes sont finies",
                       avant["fini"], True)
                rep.eq("et qui est unitaire", avant["norme"], 1.0)
                rep.eq("la duree du demi-tour est donc un nombre",
                       avant["duree"], True)
        # ON REND CE QU'ON A PRIS, meme en fin de parcours : les codes de
        # lancement commandent la prevention de la supernova et l'armement de la
        # sphere de remise a zero, et la touche d'interaction est AUSSI celle du
        # pilote automatique (docs/61) — la meme frappe qui assied l'engage une
        # fois assis. Les annonces de piste, elles, ne se touchent pas : un
        # controle ne doit pas effacer ce qu'un autre a mesure.
        page.evaluate("""(codes) => {
          const s = window.__shipRef;
          s.boarded = false;
          window.__assise.points.detach([0, 0, 0]);
          window.__assise.points.drain();
          const siege = window.__assise.points.points.find(
            (p) => p.name === "FlightConsole");
          if (siege && siege.follow) siege.follow(null);
          const a = window.__autopilot;
          if (a && a.engaged) a.abort();
          window.__pdata.knowsLaunchCodes = codes;
        }""", codesAvant)
        page.wait_for_timeout(600)

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
