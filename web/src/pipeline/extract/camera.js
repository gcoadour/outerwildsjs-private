// Les cameras du build, et la pile d'effets d'image que chacune porte.
//
// C'est une couche de RENDU entiere que le portage n'avait jamais vue, et elle
// s'est cachee d'une facon qui merite d'etre ecrite : le recensement de
// docs/45 la comptait « lue », parce que `TwirlEffect`, `MotionBlur` et
// `Fisheye` apparaissent dans `web/src/` — dans une ligne de COMMENTAIRE de
// `shaders/index.js` qui les cite en exemple. Une classe dont quelqu'un a parle
// n'est pas une classe qu'on lit. `scripts/recensement.mjs` retire desormais
// les commentaires avant de compter, et six classes en sont ressorties.
//
// Ce que la scene declare, camera par camera :
//
//   PlayerCamera      Bloom(HDR, seuil 0,8) + Glow + Vignetting + Grayscale
//                     + Twirl + Tonemapping.  Les quatre du milieu sont
//                     ETEINTES au reveil (PlayerCameraEffectController.Awake)
//                     et ne servent qu'aux evenements : mort, trou noir,
//                     teleportation, immersion. Au repos, le joueur ne voit
//                     donc que le bloom.
//   FlashbackCamera   MotionBlur + Glow + SunShafts + Fisheye + Twirl
//   MapCamera         Bloom (simple, seuil 0,5) + Tonemapping
//   LandingCam        NoiseAndGrain + deux Tonemapping
//   SatelliteCamera   Grayscale + NoiseEffect (la vieille pellicule rayee)
//   MovingCamera      MotionBlur (l'ordinateur de bord)
//   LODCam_*          LODCameraSnapshot, les impostures de planete
//
// Les reglages du CONTROLEUR (duree du reveil, angle du tourbillon...) ne sont
// serialises nulle part : ils viennent du constructeur. On ne les invente donc
// pas ici, et un invariant garde leur ABSENCE de la scene — sans quoi une
// extraction qui cesserait de les lire passerait en silence.

import { round } from "./context.js";

const color = (c) => (c ? [round(c.r, 4), round(c.g, 4), round(c.b, 4), round(c.a ?? 1, 4)] : null);
const vec2 = (v) => (v ? [round(v.x, 4), round(v.y, 4)] : null);
const f = (v, n = 4) => (typeof v === "number" ? round(v, n) : null);

/**
 * Les classes d'effet qu'on sait lire, et ce qu'on retient de chacune.
 *
 * On ne recopie pas tous les champs : les huit pointeurs de shader d'un
 * `BloomAndLensFlares` designent des shaders d'Unity que ce portage ne rejoue
 * pas — il refait l'effet, il ne transpose pas le shader. Ce qui compte est le
 * REGLAGE, et c'est lui qu'on garde.
 */
const EFFETS = {
  BloomAndLensFlares: (x) => ({
    // tweakMode 0 = simple, 1 = avance ; screenBlendMode 0 = Screen, 1 = Add.
    tweakMode: x.tweakMode ?? 0,
    blend: x.screenBlendMode === 1 ? "add" : "screen",
    hdr: x.hdr ?? 0,
    intensity: f(x.bloomIntensity),
    threshold: f(x.bloomThreshhold),     // la faute de frappe est celle d'Unity
    iterations: x.bloomBlurIterations ?? 2,
    blurSpread: f(x.sepBlurSpread),
    blurWidth: f(x.blurWidth),
    // `lensflares` vaut FAUX sur les deux instances : le build a le composant
    // et n'allume pas ses halos. On le dit plutot que de porter du code mort.
    lensflares: !!x.lensflares,
    lensflareIntensity: f(x.lensflareIntensity),
    lensflareThreshold: f(x.lensflareThreshhold),
  }),
  GlowEffect: (x) => ({
    intensity: f(x.glowIntensity),
    iterations: x.blurIterations ?? 1,
    blurSpread: f(x.blurSpread),
    tint: color(x.glowTint),
  }),
  Vignetting: (x) => ({
    intensity: f(x.intensity),
    chromaticAberration: f(x.chromaticAberration),
    blur: f(x.blur),
    blurSpread: f(x.blurSpread),
  }),
  GrayscaleEffect: (x) => ({ amount: f(x.effectAmount), rampOffset: f(x.rampOffset) }),
  TwirlEffect: (x) => ({ radius: vec2(x.radius), angle: f(x.angle), center: vec2(x.center) }),
  MotionBlur: (x) => ({ amount: f(x.blurAmount), extra: !!x.extraBlur }),
  Fisheye: (x) => ({ strength: [f(x.strengthX), f(x.strengthY)] }),
  SunShafts: (x) => ({
    intensity: f(x.sunShaftIntensity),
    blurRadius: f(x.sunShaftBlurRadius),
    maxRadius: f(x.maxRadius),
    iterations: x.radialBlurIterations ?? 3,
    color: color(x.sunColor),
    blend: x.screenBlendMode === 1 ? "add" : "screen",
  }),
  NoiseAndGrain: (x) => ({
    strength: f(x.strength),
    black: f(x.blackIntensity),
    white: f(x.whiteIntensity),
    tiling: [f(x.redChannelTiling), f(x.greenChannelTiling), f(x.blueChannelTiling)],
    channels: [f(x.redChannelNoise), f(x.greenChannelNoise), f(x.blueChannelNoise)],
  }),
  NoiseEffect: (x) => ({
    monochrome: !!x.monochrome,
    grain: [f(x.grainIntensityMin), f(x.grainIntensityMax)],
    grainSize: f(x.grainSize),
    scratch: [f(x.scratchIntensityMin), f(x.scratchIntensityMax)],
  }),
  Tonemapping: (x) => ({
    // TonemappingMode : 1 = Photographic ; 3 = AdaptiveReinhard. Le manager les
    // eteint tous au demarrage (`_isTonemappingActive` faux), et c'est ce que
    // le reglage « Normal » du portage reproduit.
    type: x.type ?? 0,
    exposure: f(x.exposureAdjustment),
    middleGrey: f(x.middleGrey),
    white: f(x.white),
    adaptionSpeed: f(x.adaptionSpeed),
  }),
  LODCameraSnapshot: (x) => ({
    interval: f(x.snapshotInterval ?? x._snapshotInterval),
  }),
};

// Les composants qui NOMMENT la camera sans la regler : on les cite pour que
// la prochaine lecture sache qu'ils ont ete vus, et ne les cherche pas.
const ROLES = {
  PlayerCameraEffectController: "joueur",
  MapController: "carte",
  MapOpenGL: "orbites",
  Flashback: "flashback",
  ShipComputerCamera: "ordinateur de bord",
  HUDCameraScript: "hud",
  Telescope: "telescope",
  CustomAspectRatio: "proportions forcees",
};

export function extractCameras(ctx) {
  const cameras = [];
  const inconnus = new Map();

  for (const [gid, go] of ctx.gameObjects) {
    let cam = null;
    const effets = {};
    const roles = [];
    const autres = [];
    for (const c of ctx.componentsOf(gid)) {
      if (c.type === "Camera") { cam = c; continue; }
      if (c.type !== "MonoBehaviour") continue;
      const cls = ctx.scriptName(c);
      if (!cls) continue;
      if (EFFETS[cls]) {
        const champs = ctx.scriptFields(c);
        if (!champs) { inconnus.set(cls, (inconnus.get(cls) || 0) + 1); continue; }
        // LandingCam porte DEUX Tonemapping : on garde une liste, pas un champ.
        (effets[cls] ||= []).push(EFFETS[cls](ctx.plain(champs)));
      } else if (ROLES[cls]) roles.push(ROLES[cls]);
      else autres.push(cls);
    }
    if (!cam) continue;

    const v = ctx.readEngine(cam);
    cameras.push({
      name: go.m_Name,
      roles,
      // Une camera desactivee dans la scene ne rend rien : `m_Enabled` du
      // composant, pas celui du GameObject, qui vit ailleurs.
      enabled: v ? v.m_Enabled !== 0 : null,
      depth: v ? f(v.m_Depth, 2) : null,
      // Trois champs d'Unity 4 dont le nom porte des ESPACES : lus sous leur
      // nom C# (`m_FOV`, `m_near_clip_plane`), ils rendent null sans erreur.
      fov: v ? f(v["field of view"], 3) : null,
      near: v ? f(v["near clip plane"], 4) : null,
      far: v ? f(v["far clip plane"], 2) : null,
      orthographic: v ? !!v.orthographic : null,
      orthographicSize: v ? f(v["orthographic size"], 4) : null,
      hdr: v ? !!v.m_HDR : null,
      // ClearFlags : 1 = Skybox, 2 = SolidColor, 3 = Depth, 4 = Nothing.
      clearFlags: v ? (v.m_ClearFlags ?? null) : null,
      backgroundColor: v ? color(v.m_BackGroundColor) : null,
      cullingMask: v && v.m_CullingMask ? (v.m_CullingMask.m_Bits ?? null) : null,
      effects: effets,
      components: autres,
    });
  }

  cameras.sort((a, b) => a.name.localeCompare(b.name));
  const total = cameras.reduce((s, c) => s + Object.values(c.effects).reduce((n, l) => n + l.length, 0), 0);
  return {
    count: cameras.length,
    effectCount: total,
    unreadable: Object.fromEntries(inconnus),
    cameras,
  };
}
