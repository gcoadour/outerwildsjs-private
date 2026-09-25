// L'ecran-titre : la scene de `mainData`, le niveau 0 du jeu.
//
// Le portage entrait droit dans la partie. L'alpha, elle, ouvre sur une petite
// planete qui tourne sous les etoiles, un feu de camp, deux voyageurs qui
// jouent, et cinq lignes : New Expedition, Resume Expedition, Skip Intro,
// Settings, Exit Game (docs/131-ecran-titre.md).
//
// @lit TitleScreenMenu, RotateTransform
// @autrement DepthOfFieldScatter : `maxBlurSize` vaut 0 dans la scene, le flou ne s'applique donc jamais
//
// Tout ce qui se decide est ecrit ici sans Babylon ni DOM, et se verifie dans
// tests/09-jeu.mjs : le menu (`TitleMenu`), la composition des deux
// rotations (`repereDuTitre`), le placement des `GUIText` et de la
// `GUITexture` (`placeGuiText`, `placeGuiTexture`). La scene et le texte a
// l'ecran viennent ensuite (`TitleScreen`).

import { MENU } from "./settings.js";
import { flicker } from "./lights.js";

/**
 * `TitleScreenMenu.ToggleOption(0)`, option par option.
 *
 *     0  TriggerLoad(true,  false)   nouvelle sauvegarde, puis le niveau 1
 *     1  TriggerLoad(false, false)   la sauvegarde telle qu'elle est
 *     2  TriggerLoad(true,  true)    nouvelle sauvegarde, cinq savoirs accordes
 *     3  _settingsMenu.Open(this)
 *     4  Application.Quit()
 *
 * `ToggleOption` sort DES L'ENTREE si l'argument n'est pas nul : gauche,
 * droite et le clic droit ne font rien au menu-titre, a l'inverse des
 * reglages.
 */
export const TITLE_ACTIONS = [
  { load: true, newSave: true, skipIntro: false },
  { load: true, newSave: false, skipIntro: false },
  { load: true, newSave: true, skipIntro: true },
  { settings: true },
  { quit: true },
];

/**
 * `PlayerData.CreateNewPlayerSave(skipIntro)` : ce que « Skip Intro » accorde.
 * Cinq savoirs, puis `SavePlayer` — et SEULEMENT dans ce cas : une nouvelle
 * partie ordinaire ne sauve rien tant que la boucle ne le fait pas.
 */
export const SKIP_INTRO_FLAGS = ["knowsLaunchCodes", "knowsTelescope", "knowsProbes",
                                 "knowsShipProbes", "knowsTargeting"];

/** Le menu du titre, tel que `Menu` et `TitleScreenMenu` le tiennent. */
export class TitleMenu {
  /**
   * @param n          nombre d'options (`_menuOptions.Length`)
   * @param loopCount  `PlayerData.LoadLoopCount()`
   */
  constructor(n = 5, loopCount = 0) {
    // `Menu.Awake` : une liste de verrous, toute a faux.
    this.locked = new Array(n).fill(false);
    // `TitleScreenMenu.Start` : `if (LoadLoopCount() < 2) _optionLockList[1] = true`.
    // Il faut donc avoir VECU une boucle entiere — la premiere se compte des
    // qu'on joue — pour que « Resume Expedition » s'allume.
    if (loopCount < 2 && n > 1) this.locked[1] = true;
    this.index = 0;
    this.open = true;       // `Awake` : `Menu.Open(null)`
    this.loading = false;   // `TriggerLoad` a eu lieu
  }

  /**
   * `Menu.Update`, la navigation : le curseur saute les options verrouillees,
   * en anneau.
   */
  move(delta) {
    if (!this.open || this.loading || !delta) return;
    const n = this.locked.length;
    let i = this.index;
    do { i = (i + delta + n) % n; } while (this.locked[i] && i !== this.index);
    this.index = i;
  }

  /**
   * Le survol de la souris. `Menu.Update` pose `_optionIndex` sur l'option
   * touchee SANS regarder son verrou : on peut viser « Resume Expedition »
   * grisee, on ne peut pas la valider.
   */
  hover(i) {
    if (!this.open || this.loading) return;
    if (i >= 0 && i < this.locked.length) this.index = i;
  }

  /**
   * `interact`, `jump` ou le clic gauche : `ToggleOption(0)`.
   * @returns l'action choisie, ou null
   */
  validate() {
    if (!this.open || this.loading || this.locked[this.index]) return null;
    const a = TITLE_ACTIONS[this.index] || null;
    if (a && a.load) this.loading = true;
    return a;
  }

  /** `Menu.UpdateColor` : l'etat de chaque ligne. */
  state(i) {
    if (this.locked[i]) return "locked";
    return i === this.index ? "selected" : "normal";
  }
}

/**
 * `Menu.Update` au clavier : les memes quatre horloges que les reglages, en
 * temps reel, mais un seul geste compte ici — monter ou descendre.
 *
 * @returns -1, 0 ou +1
 */
export function titleStep(horloges, now, moveZ, cfg = MENU) {
  if (moveZ > cfg.moveThreshold) {
    if (now > horloges.haut + cfg.selectDelay) { horloges.haut = now; return -1; }
  } else if (moveZ < -cfg.moveThreshold) {
    if (now > horloges.bas + cfg.selectDelay) { horloges.bas = now; return 1; }
  }
  return 0;
}

/**
 * Les deux `RotateTransform`, composes dans le repere de la PLANETE.
 *
 * `Root` porte la camera et la lune et tourne a +1 degre par seconde ;
 * `PlanetPivot`, sous lui, tourne a -1 autour de son Y local, qui est le -Y du
 * monde. La planete tourne donc a +2 dans le monde, la camera a +1 — et ce
 * qu'on VOIT, c'est la planete qui tourne a +1 sous la camera.
 *
 * Le portage garde la planete immobile et fait tourner le reste a l'envers :
 * camera et lune a -1, voute a -2. Les poses relatives sont exactement celles
 * du build, et les particules et la lumiere du feu, qui sont posees sur la
 * planete, restent a leur place sans qu'on les deplace.
 *
 * Ne vaut que pour des axes PARALLELES passant par l'origine, ce que la scene
 * respecte (le pivot est sur l'axe Y) ; `parallel` le dit.
 *
 * @returns { axis, camera, sky, parallel } — vitesses en degres par seconde
 */
export function repereDuTitre(rotations = [], planete = "PlanetPivot") {
  const par = new Map(rotations.map((r) => [r.name, r]));
  const p = par.get(planete);
  const axis = [0, 1, 0];
  const le = (r) => r.worldAxis[0] * axis[0] + r.worldAxis[1] * axis[1] + r.worldAxis[2] * axis[2];
  let parallel = true;
  for (const r of rotations) if (Math.abs(Math.abs(le(r)) - 1) > 1e-4) parallel = false;
  // Vitesse monde d'un noeud : la sienne plus celles de ses ancetres.
  const monde = (r) => {
    if (!r) return 0;
    let w = le(r) * r.degreesPerSecond;
    for (const a of r.ancestors || []) {
      const ra = par.get(a);
      if (ra) w += le(ra) * ra.degreesPerSecond;
    }
    return w;
  };
  const wPlanete = monde(p);
  // La camera est sous `Root` (le seul ancetre tournant du pivot).
  const racine = p ? (p.ancestors || []).map((a) => par.get(a)).filter(Boolean) : [];
  const wCamera = racine.reduce((s, r) => s + le(r) * r.degreesPerSecond, 0);
  return { axis, camera: wCamera - wPlanete, sky: -wPlanete, parallel };
}

/**
 * Ou poser un `GUIText`, en pixels CSS depuis le coin HAUT gauche.
 *
 * Unity place le texte au point d'ecran (x * largeur, y * hauteur), compte
 * depuis le BAS, plus `m_PixelOffset`, et c'est l'ancre qui dit quel coin du
 * texte s'y pose. Le menu-titre est en `LowerLeft` : le bas gauche du texte.
 *
 * @returns { left, top, tx, ty } — tx, ty : translation CSS en % du texte
 */
export function placeGuiText(opt, largeur, hauteur) {
  const x = opt.position[0] * largeur + opt.pixelOffset[0];
  const yBas = opt.position[1] * hauteur + opt.pixelOffset[1];
  const a = opt.anchor || "UpperLeft";
  const tx = /Left$/.test(a) ? 0 : /Right$/.test(a) ? -100 : -50;
  const ty = /^Upper/.test(a) ? 0 : /^Lower/.test(a) ? -100 : -50;
  return { left: x, top: hauteur - yBas, tx, ty };
}

/**
 * Ou poser une `GUITexture` d'echelle nulle : son `m_PixelInset` est un
 * rectangle en pixels, dont (x, y) est le coin BAS gauche, compte depuis le
 * point d'ecran qu'est sa position.
 */
export function placeGuiTexture(g, largeur, hauteur) {
  const [ix, iy, w, h] = g.pixelInset;
  const left = g.position[0] * largeur + ix;
  const bas = g.position[1] * hauteur + iy;
  return { left, top: hauteur - bas - h, width: w, height: h };
}

/**
 * La teinte d'une GUITexture : `m_Color` a 0,5 est le neutre, le shader
 * multiplie donc par deux.
 */
export function guiTint(c) {
  return c.slice(0, 3).map((v) => Math.min(1, Math.max(0, v * 2)));
}

/**
 * L'attenuation d'une lumiere ponctuelle dans Unity 4, rendu direct.
 *
 * `_LightTextureB0` est une table de `1 / (1 + 25 x^2)`, x etant la distance
 * rapportee a la portee, et rien au-dela de la portee. Les shaders « legacy »
 * du build (Diffuse, Bumped Diffuse) multiplient ensuite par DEUX :
 * `Albedo * _LightColor0 * (NdotL * atten * 2)`. D'ou le feu de camp qui
 * dore toute la planete du titre, la ou une decroissance lineaire le laissait
 * brun sombre, et la lune qui l'eclaire moins qu'on ne croirait.
 */
// @mesure
export function attenuationUnity(distance, range) {
  if (!(range > 0)) return 0;
  const x2 = (distance * distance) / (range * range);
  return x2 < 1 ? 2 / (1 + 25 * x2) : 0;
}

/**
 * Remplace, dans les shaders PBR de Babylon, l'attenuation « standard » par
 * celle d'Unity 4. Seuls les materiaux qui renoncent a l'attenuation physique
 * (`usePhysicalLightFalloff = false`) la lisent : ceux de l'ecran-titre.
 */
export function patchAttenuationUnity(BABYLON) {
  const store = BABYLON && BABYLON.Effect && BABYLON.Effect.IncludesShadersStore;
  const k = "pbrDirectLightingFalloffFunctions";
  if (!store || typeof store[k] !== "string") return false;
  const avant = "{return max(0.,1.0-length(lightOffset)/range);}";
  const apres = "{float x2=dot(lightOffset,lightOffset)/(range*range);" +
                "return x2<1.0?2.0/(1.0+25.0*x2):0.0;}";
  if (!store[k].includes(avant)) return store[k].includes(apres);
  store[k] = store[k].replace(avant, apres);
  return true;
}

export async function loadTitre(fetcher = fetch) {
  try {
    const r = await fetcher("data/titre/titre.json", { cache: "no-store" });
    if (!r || !r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/**
 * La scene de l'ecran-titre, son texte, et le choix du joueur.
 *
 * Elle a sa PROPRE scene Babylon sur le moteur du jeu : le build charge le
 * niveau 1 en arriere-plan (`LoadLevelAsync`) pendant que le titre continue de
 * tourner, et c'est ce que `boot()` fait ici — il charge la partie pendant que
 * cette scene est rendue, puis l'efface.
 */
export class TitleScreen {
  /**
   * @param opts { cmds, loopCount, settings, settingsUI, onSettings }
   */
  constructor(BABYLON, engine, data, opts = {}) {
    this.B = BABYLON;
    this.engine = engine;
    this.data = data;
    this.cmds = opts.cmds || null;
    const n = (data.menu && data.menu.options.length) || 5;
    this.menu = new TitleMenu(n, opts.loopCount || 0);
    this.horloges = { haut: -Infinity, bas: -Infinity };
    this.keys = Object.create(null);
    this.souris = Object.create(null);
    this.mouseActive = false;
    this.derniereSouris = null;
    this.repere = repereDuTitre(data.rotations || []);
    this.t0 = performance.now() / 1000;
    this.fini = false;
    this.ecouteurs = [];
    this.choix = new Promise((r) => { this.resoudre = r; });
    this.scene = this.construireScene();
    this.construireInterface();
    this.brancherEntrees();
    this.rendu = () => {
      if (this.fini) return;
      try { this.scene.render(); } catch (e) { /* une image de perdue */ }
    };
  }

  construireScene() {
    const B = this.B, d = this.data;
    patchAttenuationUnity(B);
    const scene = new B.Scene(this.engine);
    const bg = (d.camera && d.camera.background) || [0, 0, 0];
    scene.clearColor = new B.Color4(bg[0], bg[1], bg[2], 1);
    // `RenderSettings.m_AmbientLight` est NOIR : seules la lune et le feu
    // eclairent la scene. Une ambiance par defaut l'aurait delavee.
    const amb = d.ambient || [0, 0, 0];
    scene.ambientColor = new B.Color3(amb[0], amb[1], amb[2]);

    const c = d.camera || { position: [0, 0, -10], rotation: [0, 0, 0, 1], fov: 60,
                            near: 0.3, far: 1000 };
    const cam = new B.FreeCamera("titre_camera", new B.Vector3(...c.position), scene);
    cam.rotationQuaternion = new B.Quaternion(...c.rotation);
    cam.fov = c.fov * Math.PI / 180;
    cam.minZ = c.near;
    cam.maxZ = c.far;
    cam.inputs.clear();
    this.camera = cam;
    this.camera0 = { p: c.position.slice(), q: c.rotation.slice() };

    // La voute : six faces, teinte x 2 (`RenderFX/Skybox`).
    if (d.skybox && d.skybox.faces && Object.keys(d.skybox.faces).length === 6) {
      const f = d.skybox.faces, dir = "data/titre/";
      try {
        const cube = B.CubeTexture.CreateFromImages(
          ["px", "py", "pz", "nx", "ny", "nz"].map((k) => dir + f[k]), scene);
        // Le cube doit tenir DANS le plan lointain, coins compris : a 1,5 fois
        // la portee, ses coins sortaient du tronc de vue et le fond bleu de
        // la camera passait par le trou, en triangle.
        const box = B.MeshBuilder.CreateBox("titre_voute", { size: c.far }, scene);
        const mat = new B.StandardMaterial("titre_voute", scene);
        mat.backFaceCulling = false;
        mat.disableLighting = true;
        mat.reflectionTexture = cube;
        mat.reflectionTexture.coordinatesMode = B.Texture.SKYBOX_MODE;
        const t = d.skybox.tint || [0.5, 0.5, 0.5];
        mat.reflectionTexture.level = 1;
        mat.diffuseColor = new B.Color3(0, 0, 0);
        mat.specularColor = new B.Color3(0, 0, 0);
        mat.emissiveColor = new B.Color3(0, 0, 0);
        // Babylon multiplie le reflet par `reflectionColor` : c'est la teinte.
        mat.reflectionColor = new B.Color3(...t.map((v) => Math.min(1, v * 2)));
        box.material = mat;
        box.infiniteDistance = true;
        box.rotationQuaternion = B.Quaternion.Identity();
        this.voute = box;
      } catch (e) {
        console.warn("titre : voute indisponible —", e.message);
      }
    }

    // Les deux lumieres de la scene, a la conversion du monde.
    this.lumieres = [];
    for (const l of (d.lighting && d.lighting.lights) || []) {
      if (l.type !== "point") continue;
      const node = new B.PointLight(`titre_${l.name}`, new B.Vector3(...l.position), scene);
      node.diffuse = new B.Color3(...l.color);
      node.specular = new B.Color3(0, 0, 0);
      node.intensity = l.intensity ?? 1;
      node.range = l.range || 10;
      this.lumieres.push({ l, node, p0: l.position.slice(),
                           flicker: (l.behaviours || []).find((b) => b.kind === "LightFlicker") || null,
                           etat: null });
    }
    return scene;
  }

  /** La geometrie : charge a part, parce que le menu doit repondre avant elle. */
  async chargerGeometrie(ParticleField, applyGameShaders = null) {
    const B = this.B, d = this.data;
    if (d.gltf && B.SceneLoader) {
      try {
        const res = await B.SceneLoader.ImportMeshAsync("", "data/titre/", d.gltf, this.scene);
        // Le conteneur qui annule le demi-tour du chargeur glTF : repere
        // Babylon = repere Unity, comme pour les corps du monde (geometry.js).
        const racine = new B.TransformNode("titre_racine", this.scene);
        racine.rotation.y = Math.PI;
        for (const m of res.meshes) if (!m.parent) m.parent = racine;
        // Les memes correspondances de shaders que le monde : sans elles le
        // feuillage des pins est un aplat opaque.
        if (applyGameShaders) applyGameShaders(B, this.scene, res.meshes);
        // L'ATTENUATION D'UNITY 4 N'EST PAS PHYSIQUE. Une lumiere ponctuelle y
        // decroit sur toute sa PORTEE, et la lune du titre porte a 170 unites.
        // Le materiau PBR de Babylon, lui, decroit en 1/d^2 : a 77 unites de
        // la lune, la planete recevait un six-millieme de sa lumiere et
        // restait noire. On passe ces materiaux a l'attenuation « standard »,
        // que `patchAttenuationUnity` a remplacee par celle d'Unity.
        for (const m of res.meshes) {
          const mat = m.material;
          if (mat && "usePhysicalLightFalloff" in mat) mat.usePhysicalLightFalloff = false;
        }
        // Le banjo joue (`Animation`, lecture automatique). La flute, elle, est
        // sous un `Animator` SANS controleur : le Voyageur ne bouge pas.
        for (const g of res.animationGroups || []) {
          g.stop();
          const marqueurs = /^[~!]*/.exec(g.name)[0];
          if (!marqueurs.includes("~")) g.play(!marqueurs.includes("!"));
        }
        // LES OMBRES. La camera du titre est en `DeferredLighting`
        // (`m_RenderingPath` 2) : c'est le seul chemin d'Unity 4 ou une lumiere
        // PONCTUELLE projette des ombres, et les deux de la scene en portent
        // de douces (`m_Shadows.m_Type` 2). Ce sont elles qui creusent la nuit
        // entre les pins et sous le vaisseau.
        if (B.ShadowGenerator) {
          for (const x of this.lumieres) {
            if (!(x.l.shadows > 0)) continue;
            try {
              const g = new B.ShadowGenerator(512, x.node);
              g.usePoissonSampling = true;
              g.bias = 0.0005;
              for (const m of res.meshes) {
                if (m.getTotalVertices && m.getTotalVertices() > 0) {
                  g.addShadowCaster(m, false);
                  m.receiveShadows = true;
                }
              }
              x.ombres = g;
            } catch (e) { /* sans ombres */ }
          }
        }
        this.geometrie = res;
      } catch (e) {
        console.warn("titre : geometrie indisponible —", e.message);
      }
    }
    if (ParticleField && (d.particles || []).length) {
      try {
        this.particules = new ParticleField(B, this.scene, d.particles, "data/titre/");
        for (let i = 0; i < d.particles.length; i++) {
          this.particules.spawn(i, d.particles[i], d.particles[i].position);
        }
      } catch (e) {
        console.warn("titre : particules indisponibles —", e.message);
      }
    }
  }

  /** La musique : `Main Title`, clip 2D, a 0,4, en boucle. */
  jouerMusique() {
    const B = this.B;
    const src = (this.data.audio || []).find((s) => s.name === "MainMenu");
    if (!src || !B.Sound) return;
    try {
      this.musique = new B.Sound("titre_musique", `data/titre/${src.file}`, this.scene,
        null, { loop: !!src.loop, autoplay: true, volume: src.volume ?? 1,
                spatialSound: false });
    } catch (e) { /* sans musique */ }
  }

  construireInterface() {
    const d = this.data;
    document.body.classList.add("titre");
    const el = document.createElement("div");
    el.className = "ow-titre";
    document.body.appendChild(el);
    this.el = el;
    if (d.logo && d.logo.texture) {
      const logo = document.createElement("div");
      logo.className = "ow-titre-logo";
      const [r, g, b] = guiTint(d.logo.color);
      logo.style.backgroundColor = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
      const url = `url("data/titre/${d.logo.texture}")`;
      logo.style.webkitMaskImage = url;
      logo.style.maskImage = url;
      el.appendChild(logo);
      this.logo = logo;
    }
    this.lignes = ((d.menu && d.menu.options) || []).map((o, i) => {
      const ligne = document.createElement("div");
      ligne.className = "ow-titre-option";
      ligne.textContent = o ? o.text : "";
      ligne.style.fontSize = `${(o && o.fontSize) || 40}px`;
      ligne.addEventListener("pointermove", () => {
        if (this.mouseActive) { this.menu.hover(i); this.peindre(); }
      });
      ligne.addEventListener("click", () => {
        this.menu.hover(i);
        this.agir(this.menu.validate());
      });
      el.appendChild(ligne);
      return ligne;
    });
    this.placer();
    this.peindre();
    const re = () => this.placer();
    addEventListener("resize", re);
    this.ecouteurs.push(["resize", re]);
  }

  placer() {
    const W = innerWidth, H = innerHeight;
    const d = this.data;
    if (this.logo) {
      const r = placeGuiTexture(d.logo, W, H);
      Object.assign(this.logo.style, { left: `${r.left}px`, top: `${r.top}px`,
                                       width: `${r.width}px`, height: `${r.height}px` });
    }
    this.lignes.forEach((ligne, i) => {
      const o = d.menu.options[i];
      if (!o) return;
      const r = placeGuiText(o, W, H);
      ligne.style.left = `${r.left}px`;
      ligne.style.top = `${r.top}px`;
      ligne.style.transform = `translate(${r.tx}%, ${r.ty}%)`;
    });
  }

  /** `Menu.UpdateColor`, et « Loading... » en vert une fois le choix fait. */
  peindre() {
    const col = (this.data.menu && this.data.menu.colors) || {};
    this.lignes.forEach((ligne, i) => {
      if (this.menu.loading && i === this.menu.index) {
        ligne.textContent = this.data.menu.loadingText || "Loading...";
        ligne.style.color = col.loading;
        return;
      }
      ligne.style.color = col[this.menu.state(i)];
    });
    // `Menu.Suspend(true)` : un menu ferme eteint ses GUIText. Le logo, lui,
    // n'appartient pas au menu et reste.
    for (const ligne of this.lignes) ligne.hidden = !this.menu.open;
  }

  brancherEntrees() {
    const on = (type, f) => { addEventListener(type, f); this.ecouteurs.push([type, f]); };
    on("keydown", (e) => {
      this.keys[e.code] = true;
      if (!this.menu.open || this.fini) return;
      const bouton = (nom) => {
        const c = this.cmds && this.cmds.get(nom);
        return c ? c.pos.codes.includes(e.code) : false;
      };
      // `interact.GetButtonDown` ou `jump.GetButtonDown`.
      if (!e.repeat && (bouton("Interact") || bouton("Jump"))) {
        this.agir(this.menu.validate());
      }
    });
    on("keyup", (e) => { this.keys[e.code] = false; });
    on("pointermove", (e) => {
      // `Distance(mousePosition, _lastMousePos) > 0.1f` : le curseur se
      // reveille des que la souris bouge.
      const p = [e.clientX, e.clientY];
      if (this.derniereSouris) {
        const dist = Math.hypot(p[0] - this.derniereSouris[0], p[1] - this.derniereSouris[1]);
        if (dist > MENU.mouseWake) this.mouseActive = true;
      }
      this.derniereSouris = p;
    });
  }

  /**
   * Ce qu'une validation declenche.
   *
   * `TriggerLoad` lance la coroutine `Load` (`LoadLevelAsync(1)`, activation
   * retenue) puis appelle aussitot `ActivateScene` : le niveau 1 s'active des
   * qu'il est charge. Ici, `resoudre` rend la main a `boot()`, qui charge la
   * partie pendant que ce titre continue de tourner, et l'efface quand elle
   * est prete. `UpdateOptionText`, elle, est VIDE au menu-titre (un seul
   * `ret`) : les cinq libelles ne changent jamais, hors « Loading... ».
   */
  agir(a) {
    if (!a) return;
    if (a.settings) {
      this.menu.open = false;          // `Menu.Open(parent)` suspend le parent
      this.peindre();
      if (this.onSettings) this.onSettings();
      return;
    }
    this.peindre();
    if (a.load) {
      // `_musicSource.FadeOut(0.5f)`.
      if (this.musique) {
        try { this.musique.setVolume(0, this.data.menu.musicFade ?? 0.5); } catch (e) { /* */ }
      }
    }
    this.resoudre(a);
  }

  /** Retour des reglages : `SettingsMenu.Close` rouvre le parent. */
  rouvrir() {
    this.menu.open = true;
    this.peindre();
  }

  /** Une image : les rotations, le vacillement, et la navigation au clavier. */
  avancer() {
    if (this.fini) return;
    const B = this.B;
    const t = performance.now() / 1000 - this.t0;
    const ax = this.repere.axis;
    // Camera et lune tournent autour de l'axe du monde, a l'envers de la
    // planete (voir `repereDuTitre`).
    const qc = B.Quaternion.RotationAxis(new B.Vector3(...ax), this.repere.camera * t * Math.PI / 180);
    const p0 = new B.Vector3(...this.camera0.p);
    const p = p0.applyRotationQuaternion(qc);
    this.camera.position.copyFrom(p);
    this.camera.rotationQuaternion = qc.multiply(new B.Quaternion(...this.camera0.q));
    for (const x of this.lumieres) {
      if (x.l.name === "MoonLight") {
        x.node.position.copyFrom(new B.Vector3(...x.p0).applyRotationQuaternion(qc));
      }
      // Le feu vacille (`LightFlicker`), comme ceux du village.
      if (x.flicker) {
        if (!x.etat) x.etat = { intensity: x.l.intensity ?? 1, target: x.l.intensity ?? 1 };
        x.node.intensity = Math.max(0, flicker(x.etat, x.l.intensity ?? 1, x.flicker.fields));
      }
    }
    if (this.voute) {
      this.voute.rotationQuaternion = B.Quaternion.RotationAxis(
        new B.Vector3(...ax), this.repere.sky * t * Math.PI / 180);
    }
    if (this.cmds && this.menu.open) {
      const dz = titleStep(this.horloges, t, this.cmds.axis("Move Z", { keys: this.keys }));
      if (dz) { this.menu.move(dz); this.peindre(); }
    }
  }

  /** Efface la scene et le texte : la partie prend l'ecran. */
  dispose() {
    this.fini = true;
    for (const [type, f] of this.ecouteurs) removeEventListener(type, f);
    try { if (this.musique) this.musique.dispose(); } catch (e) { /* */ }
    try { this.scene.dispose(); } catch (e) { /* */ }
    this.el.remove();
    document.body.classList.remove("titre");
  }
}
