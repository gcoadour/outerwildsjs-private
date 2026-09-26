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
// elle. Le portage n'a qu'une camera par texture ; le texte est donc pose
// DEVANT la camera mobile, a l'echelle de sa taille du moment, ce qui revient
// a le rendre par une camera fixe de taille 5.
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
// @autrement MotionBlur : le flou de la camera mobile (0,6) est un effet
// d'accumulation d'images ; il n'adoucit qu'un deplacement d'une demi-seconde,
// et le portage ne l'a pas.

/** `ShipComputerCamera.Awake` : `camera.aspect = 1.3333334`. */
export const ASPECT_ECRAN = 4 / 3;
const CALQUE_CARTE = 1 << 23;
/** Pixels de la texture de texte par unite de la camera fixe (taille 5). */
const PX = 76.8;

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
    // haut. Sans ce retournement, la fiche s'affichait tete en bas, le nom
    // sous le bord de l'ecran.
    rtt.vScale = -1;
    this.rtt = rtt;

    // Le texte de la camera fixe : un plan pendu a la camera mobile.
    const dt = new B.DynamicTexture("ShipComputerTexte", { width: 1024, height: 768 }, sc, true);
    dt.hasAlpha = true;
    const mt = new B.StandardMaterial("ShipComputerTexte", sc);
    mt.disableLighting = true;
    mt.emissiveTexture = dt;
    mt.opacityTexture = dt;
    mt.backFaceCulling = false;
    mt.fogEnabled = false;
    const plan = B.MeshBuilder.CreatePlane("ShipComputerTexte", { width: 1, height: 1 }, sc);
    plan.material = mt;
    plan.parent = cam;
    plan.position.set(0, 0, (cam.minZ + cam.maxZ) / 4);
    plan.layerMask = CALQUE_CARTE;
    plan.isPickable = false;
    plan.isVisible = false;
    rtt.renderList.push(plan);
    this.plan = plan;
    this.texte = dt;

    // L'ecran lui-meme : la texture de rendu a la place de `_MainTex`.
    const m = this.ecran.material;
    if (m) {
      for (const k of ["diffuseTexture", "albedoTexture", "emissiveTexture"]) {
        if (m[k] !== undefined) m[k] = rtt;
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
      this.plan.isVisible = ouvert;
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
    this.plan.scaling.set(2 * t * ASPECT_ECRAN, 2 * t, 1);
  }
}
