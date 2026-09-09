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
        pose = True
        try:
            page.wait_for_function("window.__player && window.__player.grounded",
                                   timeout=30000)
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

            # Saut : la touche « haut » saute au sol, elle pousse en l'air.
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
            rep.eq("trainee angulaire du build", rot["trainee"], 0.92)
            rep.eq("il porte son propre quaternion", rot["quat"], 4)

        # --- colliders par groupe de niveau de detail ---------------------------
        #
        # A8 requalifiee : ce ne sont pas les LODGroup mais les 21
        # `ChildColliderLOD` qui font tomber les colliders (§2.8).
        col = page.evaluate("() => window.__world.colliderLOD || null")
        if col:
            rep.at_least("groupes de colliders lus", col["groupes"], 0)
            rep.at_most("groupes eveilles", col["eveilles"], col["groupes"])

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
          // de course s'allume comme si Maj etait tenue
          send('.tc-zone-move', 'pointerdown', 200, 500, 1);
          send('.tc-zone-move', 'pointermove', 200, 400, 1);
          const avant = +t.axes.forward.toFixed(2);
          const course = t.axes.boost;
          send('.tc-zone-move', 'pointerup', 200, 400, 1);
          const relache = t.axes.forward, apresCourse = t.axes.boost;

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
        rep.eq("a fond devant : le cran de course prend", tactile["course"], True)
        rep.eq("manche relache : axe a zero", tactile["relache"], 0)
        rep.eq("manche relache : course finie", tactile["apresCourse"], False)
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
        rep.eq("la manette en vol", tactile["enVol"],
               ["Telescope", "Sonde", "Carte du systeme", "Ordinateur de bord",
                "Affichage", "Menu", "Monter", "Accelerer", "Lampe",
                "Interagir, parler"])
        rep.eq("un menu la remplace par la croix et les deux reponses",
               tactile["enMenu"],
               ["Haut", "Gauche", "Droite", "Bas", "Valider", "Retour"])
        rep.eq("boutons tactiles en tout", tactile["boutons"], 18)

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
