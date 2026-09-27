// L'ecran de l'ordinateur de bord, dans la cabine.
//
// Le portage l'affichait en boite HTML au milieu de l'ecran, par-dessus une vue
// qui ne regardait meme pas l'ordinateur. Le build n'a pas de boite : il a un
// ECRAN, `ComputerScreen`, sur la paroi arriere de la cabine, et une
// `RenderTexture` de 1024 x 1024 (`ShipComputerScreen`) que deux cameras
// remplissent :
//
//   MovingCamera   orthographique, 4/3 force, profondeur 0, fond noir ; elle
//                  voit le calque 23 de `MapSpace` — les sept sprites de lieu,
//                  pleins si le lieu est explore, en contour sinon
//                  (`SectorData.Reveal` / `Hide`) — et se deplace de l'un a
//                  l'autre (`ShipComputerCamera`, consoles.js)
//   StaticCamera   orthographique, taille 5, profondeur 1, sans effacer ; elle
//                  voit `StaticElements` : les deux `TextMesh`, nom et fiche
//
// Les deux ne partagent que la texture : elles regardent deux endroits
// differents du vaisseau, vingt et trente-sept unites au-dessus de
// l'ordinateur, avec un plan lointain a 2 — ce qui les garde chacune chez
// elle. Et entre les deux passe le `MotionBlur` de la camera mobile : un flou
// d'ACCUMULATION, qui ne touche donc que les sprites.
//
//   MotionBlur.OnRenderImage
//     accumTexture cree a la premiere image : copie de l'image
//     blurAmount = Clamp(blurAmount, 0, 0.92)
//     _AccumOrig = 1 - blurAmount ; l'image se fond dans accumTexture
//     a cette opacite, et c'est accumTexture qui sort
//
// Soit, a chaque image, `sortie = image x 0,4 + precedente x 0,6`. Le portage
// refait les trois temps : les sprites dans leur texture, le fondu dans une
// paire de textures qui alternent, puis le texte de la camera fixe par-dessus,
// net — un changement de fiche est instantane, un deplacement laisse sa
// trainee.
//
// Eteint, l'ecran montre autre chose : `SplashScreen` (un aplat bleu) et le
// logo de `VenturesIcon` ; et si un lieu s'est decouvert entre-temps,
// `UpdateElements` — une icone qui clignote et « database updated » — a la
// place du logo.
//
// @lit SectorData
// `SectorData` : `Start` eteint le sprite, `OnEnterShipComputer` et
// `OnExitShipComputer` l'allument et l'eteignent avec l'ecran, `Reveal` et
// `Hide` choisissent son materiau ; `GetName`, `GetLocationName`,
// `GetDescription`, `GetOrthoSize` et `IsRevealed` sont les champs de
// `shipRecords` (consoles.js).
//
// @lit MotionBlur

/** `ShipComputerCamera.Awake` : `camera.aspect = 1.3333334`. */
export const ASPECT_ECRAN = 4 / 3;
// Un calque que la camera du joueur ne voit pas (son masque exclut 23, 24 et
// 30) et que la camera du HUD ne voit pas non plus : 23 est le SIEN — c'est
// celui des objets tenus (main.js). Les sprites de l'ecran y etaient, et
// l'une des deux cameras les aurait montres.
const CALQUE_CARTE = 1 << 24;
/** Pixels de la texture de texte par unite de la camera fixe (taille 5). */
const PX = 76.8;

/** `MotionBlur` : la part de l'image precedente, bornee comme le build. */
export function partFlou(blurAmount = 0.6) {
  return Math.max(0, Math.min(0.92, blurAmount));
}

/** Une image de l'accumulation, sur des valeurs : ce que fait le shader. */
export function accumule(image, precedente, blurAmount) {
  const k = partFlou(blurAmount);
  return precedente == null ? image : image * (1 - k) + precedente * k;
}

const FONDU = `precision highp float;
varying vec2 vUV;
uniform sampler2D image;
uniform sampler2D precedente;
uniform float part;
void main(void) {
  gl_FragColor = mix(texture2D(image, vUV), texture2D(precedente, vUV), part);
}`;

// Le texte de `StaticCamera` par-dessus, sans effacer : un « over » alpha.
const COMPOSE = `precision highp float;
varying vec2 vUV;
uniform sampler2D fond;
uniform sampler2D texte;
void main(void) {
  vec4 f = texture2D(fond, vUV);
  vec4 t = texture2D(texte, vUV);
  gl_FragColor = vec4(mix(f.rgb, t.rgb, t.a), 1.0);
}`;

/**
 * La taille d'un `TextMesh`, en unites du monde, par pixel de police :
 * `pixelScale` (0,1) x `characterSize` x echelle du transform. Une taille de
 * police nulle prend celle de la police (30 pour Gill Sans MT).
 */
export function uniteTexte(t, echelle, taillePolice = 30) {
  const fs = t && t.fontSize ? t.fontSize : taillePolice;
  const u = 0.1 * ((t && t.characterSize) || 1) * echelle;
  return { em: fs * u, ligne: 34.79 * u * ((t && t.lineSpacing) || 1) };
}

export class EcranOrdinateur {
  /**
   * @param donnees { cameras: camera.json, textes: interface.json textes }
   */
  constructor(BABYLON, scene, donnees = {}) {
    this.B = BABYLON;
    this.scene = scene;
    this.cameras = (donnees.cameras && donnees.cameras.cameras) || [];
    this.textes = donnees.textes || [];
    this.pret = false;
    this.essais = 0;
    this.allume = null;
    this.etat = null;           // { x, y, taille } de la camera mobile
    this.dernierTexte = null;
  }

  /** Les noeuds de l'ordinateur, sous `ShipComputer`. Rend faux s'ils manquent. */
  attacher() {
    const B = this.B, sc = this.scene;
    const racine = sc.transformNodes.find((n) => n.name === "ShipComputer"
      && n.parent && n.parent.name === "Cabin");
    if (!racine) return false;
    const tous = racine.getDescendants(false);
    const un = (nom) => tous.find((n) => n.name === nom) || null;
    this.racine = racine;
    this.mapSpace = un("MapSpace");
    this.cameraNoeud = un("MovingCamera");
    this.ecran = un("ComputerScreen");
    this.splash = un("SplashScreen");
    this.logo = un("VenturesIcon");
    this.maj = un("UpdateElements");
    this.majIcone = un("UpdateIcon");
    this.majTexte = un("UpdateText");
    if (!this.mapSpace || !this.cameraNoeud || !this.ecran) return false;
    // Les sprites de lieu : sous chaque `*_Data`, celui que `SectorData`
    // commande (`_renderer`). Le `2DSolarSystem` voisin est inactif.
    this.lieux = new Map();
    for (const n of tous) {
      if (!/_Data$/.test(n.name)) continue;
      const m = n.getChildMeshes(false).find((x) => x.getTotalVertices() > 0);
      if (m) this.lieux.set(n.name, { noeud: n, sprite: m });
    }
    this.plein = sc.getMaterialByName("SolarSystem_Filled_Atlas");
    this.contour = sc.getMaterialByName("SolarSystem_Outline_Atlas");
    for (const { sprite } of this.lieux.values()) {
      sprite.layerMask = CALQUE_CARTE;
      sprite.setEnabled(true);
      sprite.isVisible = false;
      // Les sprites sont des decalques : ni l'eclairage de la cabine ni le
      // brouillard n'ont a les toucher. Leur shader est autoeclaire.
      for (const mat of [this.plein, this.contour]) {
        if (!mat) continue;
        mat.disableLighting = true;
        if (mat.diffuseTexture && !mat.emissiveTexture) mat.emissiveTexture = mat.diffuseTexture;
        if (mat.emissiveColor) mat.emissiveColor.set(1, 1, 1);
        mat.fogEnabled = false;
        mat.backFaceCulling = false;
      }
    }

    const donnees = this.cameras.find((c) => c.name === "MovingCamera") || {};
    this.etat = { x: 0, y: 0, taille: donnees.orthographicSize || 11.38 };
    // La position locale de la camera dans `MapSpace`, en coordonnees glTF :
    // seul son z reste, les x et y sont ceux de l'etat.
    this.zCamera = this.cameraNoeud.position ? this.cameraNoeud.position.z : 1;

    const cam = new B.FreeCamera("ShipComputerCamera", B.Vector3.Zero(), sc);
    cam.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
    cam.minZ = donnees.near || 0.1;
    cam.maxZ = donnees.far || 2;
    cam.layerMask = CALQUE_CARTE;
    this.cam = cam;
    const rtt = new B.RenderTargetTexture("ShipComputerScreen", 1024, sc, false);
    rtt.activeCamera = cam;
    // `ClearFlags` 2, fond (0, 0, 0, 0) : du noir.
    rtt.clearColor = new B.Color4(0, 0, 0, 1);
    rtt.renderList = [...[...this.lieux.values()].map((l) => l.sprite)];
    // Les coordonnees de texture de l'ecran sont celles d'Unity, dont les
    // textures de rendu ont l'origine en bas ; celles de Babylon l'ont en
    // haut. Sans retournement (`sortie.vScale`), la fiche s'affichait tete en
    // bas, le nom sous le bord de l'ecran.
    this.rtt = rtt;

    // Le texte de la camera fixe : sa propre texture, cadree comme elle
    // (4/3 sur une texture carree, comme la texture de rendu du build).
    const dt = new B.DynamicTexture("ShipComputerTexte", { width: 1024, height: 768 }, sc, false);
    dt.hasAlpha = true;
    this.texte = dt;

    // `MotionBlur` (0,6 sur `MovingCamera`), puis le texte.
    const flou = (donnees.effects && donnees.effects.MotionBlur || [])[0];
    this.part = partFlou(flou ? flou.amount : 0.6);
    const tex = (nom) => new B.RenderTargetTexture(nom, 1024, sc, false);
    this.accum = [tex("ShipComputerAccumA"), tex("ShipComputerAccumB")];
    this.sortie = tex("ShipComputerSortie");
    this.sortie.vScale = -1;
    this.courant = 0;
    this.premiere = true;
    const eng = sc.getEngine();
    this.effets = new B.EffectRenderer(eng);
    this.fondu = new B.EffectWrapper({ engine: eng, name: "MotionBlur", fragmentShader: FONDU,
                                       uniformNames: ["part"], samplerNames: ["image", "precedente"] });
    this.compose = new B.EffectWrapper({ engine: eng, name: "StaticCamera", fragmentShader: COMPOSE,
                                         samplerNames: ["fond", "texte"] });
    // Apres TOUTES les textures de rendu de l'image, avant la scene : le
    // fondu lie ses propres tampons, ce qu'il ne doit pas faire au milieu du
    // rendu des sprites.
    sc.onAfterRenderTargetsRenderObservable.add(() => { if (this.allume) this.composer(); });

    // L'ecran lui-meme : la texture composee a la place de `_MainTex`.
    const m = this.ecran.material;
    if (m) {
      for (const k of ["diffuseTexture", "albedoTexture", "emissiveTexture"]) {
        if (m[k] !== undefined) m[k] = this.sortie;
      }
    }
    // « database updated » : un `TextMesh` sous `UpdateElements`.
    if (this.majTexte) this.majPlan = this.planDeTexte(this.majTexte,
      this.textes.find((t) => t.name === "UpdateText"));
    if (this.majIcone) this.majIcone.setEnabled(true);
    this.pret = true;
    return true;
  }

  /** Un `TextMesh` fixe pose sur son noeud (ancre au centre). */
  planDeTexte(noeud, t) {
    if (!t) return null;
    const B = this.B;
    const { em } = uniteTexte(t, 1);
    const larg = 512, haut = 96;
    const dt = new B.DynamicTexture(`${t.name}Texte`, { width: larg, height: haut }, this.scene, true);
    dt.hasAlpha = true;
    const ctx = dt.getContext();
    ctx.clearRect(0, 0, larg, haut);
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.round(haut * 0.6)}px "OW Dialogue", "Gill Sans MT", "Gill Sans", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.text, larg / 2, haut / 2);
    dt.update();
    const mt = new B.StandardMaterial(`${t.name}Texte`, this.scene);
    mt.disableLighting = true;
    mt.emissiveTexture = dt;
    mt.opacityTexture = dt;
    mt.backFaceCulling = false;
    const h = em / 0.6;
    const plan = B.MeshBuilder.CreatePlane(`${t.name}Texte`, { width: h * larg / haut, height: h }, this.scene);
    plan.material = mt;
    plan.parent = noeud;
    plan.isPickable = false;
    return plan;
  }

  /** Les deux lignes de la camera fixe, redessinees quand elles changent. */
  ecrire(d) {
    const cle = `${d.name}\n${d.description}`;
    if (cle === this.dernierTexte) return;
    this.dernierTexte = cle;
    const ctx = this.texte.getContext();
    ctx.clearRect(0, 0, 1024, 768);
    ctx.fillStyle = "#fff";
    const police = (px) => `${px}px "OW Dialogue", "Gill Sans MT", "Gill Sans", sans-serif`;
    const nom = this.textes.find((t) => t.name === "NameText");
    const fiche = this.textes.find((t) => t.name === "DescriptionText");
    // `NameText` : (0, 3,65), ancre au milieu, echelle 0,1.
    const n = uniteTexte(nom || { characterSize: 1.92 }, 0.1);
    ctx.font = police(Math.round(n.em * PX));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Les espaces multiples comptent : « <   Timber Hearth   > ».
    ctx.fillText(d.name, 512, 384 - 3.6455 * PX);
    // `DescriptionText` : (-5,48, -3,03), ancre en haut a gauche.
    const f = uniteTexte(fiche || { characterSize: 1 }, 0.1);
    ctx.font = police(Math.round(f.em * PX));
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const lignes = String(d.description || "").split(/\r?\n/);
    lignes.forEach((l, i) => ctx.fillText(l, 512 - 5.4819 * PX, 384 + 3.0312 * PX + i * f.ligne * PX));
    this.texte.update();
  }

  /**
   * Une image. `computer` est le `ShipComputer` de consoles.js ; `suivre` est
   * `suivreEcran`, passe pour garder ce module sans logique a lui.
   */
  update(dt, computer, suivre) {
    if (!this.pret) {
      if (++this.essais % 30 === 0) this.attacher();
      if (!this.pret) return;
    }
    const ouvert = !!computer.open;
    if (this.allume !== ouvert) {
      this.allume = ouvert;
      // `EnterShipComputer` / `ExitComputerConsole` et `Start`.
      this.ecran.isVisible = ouvert;
      if (this.splash) this.splash.isVisible = !ouvert;
      for (const { sprite } of this.lieux.values()) sprite.isVisible = ouvert;
      const liste = this.scene.customRenderTargets;
      if (ouvert && !liste.includes(this.rtt)) liste.push(this.rtt);
      if (!ouvert && liste.includes(this.rtt)) liste.splice(liste.indexOf(this.rtt), 1);
    }
    // Le logo s'efface devant l'avis de mise a jour (`OnEnterSector`).
    if (this.logo) this.logo.isVisible = !ouvert && !computer.misAJour;
    if (this.maj) this.maj.setEnabled(!ouvert && computer.misAJour);
    if (!ouvert) return;

    // `Reveal` / `Hide` : le materiau plein ou le contour.
    for (const r of computer.records) {
      const l = this.lieux.get(r.node);
      if (!l) continue;
      const mat = computer.revealed(r) ? this.plein : this.contour;
      if (mat && l.sprite.material !== mat) l.sprite.material = mat;
    }
    // `SetTarget`, puis `ShipComputerCamera.Update`, dans le plan de la carte.
    const cible = computer.cibleEcran();
    const l = cible && this.lieux.get(cible.node);
    if (l) {
      const B = this.B;
      l.noeud.computeWorldMatrix(true);
      this.mapSpace.computeWorldMatrix(true);
      const inv = this.mapSpace.getWorldMatrix().clone().invert();
      const p = B.Vector3.TransformCoordinates(l.noeud.getAbsolutePosition(), inv);
      this.etat = suivre(this.etat, { x: p.x, y: p.y, taille: cible.taille }, dt);
    }
    this.poser();
    this.ecrire(computer.display());
  }

  /**
   * Apres les sprites : le fondu dans l'accumulation, puis le texte net.
   * Tant que les deux effets compilent, l'ecran garde son image d'avant.
   */
  composer() {
    if (!this.fondu.effect.isReady() || !this.compose.effect.isReady()) return;
    const prec = this.accum[this.courant], dest = this.accum[1 - this.courant];
    // `accumTexture` nait comme une copie de l'image : pas de fondu depuis
    // du noir a la premiere mise en route.
    const part = this.premiere ? 0 : this.part;
    this.fondu.onApplyObservable.addOnce(() => {
      this.fondu.effect.setTexture("image", this.rtt);
      this.fondu.effect.setTexture("precedente", prec);
      this.fondu.effect.setFloat("part", part);
    });
    this.effets.render(this.fondu, dest);
    this.compose.onApplyObservable.addOnce(() => {
      this.compose.effect.setTexture("fond", dest);
      this.compose.effect.setTexture("texte", this.texte);
    });
    this.effets.render(this.compose, this.sortie);
    this.courant = 1 - this.courant;
    this.premiere = false;
  }

  /** La camera mobile, rendue a sa place dans le vaisseau du moment. */
  poser() {
    const B = this.B, cam = this.cam, e = this.etat;
    this.mapSpace.computeWorldMatrix(true);
    const M = this.mapSpace.getWorldMatrix();
    const p = B.Vector3.TransformCoordinates(new B.Vector3(e.x, e.y, this.zCamera), M);
    // L'avant d'Unity est l'oppose du +Z du noeud glTF.
    const avant = this.mapSpace.getDirection(B.Axis.Z).scale(-1).normalize();
    cam.position.copyFrom(p);
    cam.upVector = this.mapSpace.getDirection(B.Axis.Y).normalize();
    cam.setTarget(p.add(avant));
    const t = e.taille;
    cam.orthoTop = t;
    cam.orthoBottom = -t;
    cam.orthoLeft = -t * ASPECT_ECRAN;
    cam.orthoRight = t * ASPECT_ECRAN;
  }
}
