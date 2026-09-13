// Les effets d'image, rendus. `cameraeffects.js` dit QUOI, ce module dit avec
// quoi.
//
// Ce ne sont pas des transpositions des shaders d'Unity : ceux-ci sont dans le
// build (`sharedassets1.assets:2018`, `2021`, `2026`...), et les rejouer
// demanderait un traducteur de shaders Unity 4 vers GLSL que ce portage n'a
// pas. On refait l'EFFET, en le reglant sur les nombres du build.
//
// L'ordre compte, et il est mesure : Unity appelle `OnRenderImage` dans
// l'ordre ou les composants sont poses sur le GameObject, et sur `PlayerCamera`
// c'est Glow, Vignetting, Grayscale, Twirl, Tonemapping, Bloom. Le bloom passe
// donc EN DERNIER, apres le tourbillon — ce qui se voit quand on tombe dans le
// trou noir : l'image se visse, et le halo se visse avec elle.
//
// Le tonemapping n'est pas ici : le portage le tient deja dans
// `scene.imageProcessingConfiguration`, pilote par le reglage « luminosite »
// (main.js), qui reproduit le `TonemappingManager` du build — eteint par
// defaut, allume par l'option.

// @lit BloomAndLensFlares, NoiseEffect, NoiseAndGrain
// Le rendu de ces effets — refait, pas transpose (docs/47).

const SHADERS = {
  // --- glow : un halo additif tire des zones claires ------------------------
  //
  // Le `GlowEffect` d'Unity extrait la luminance, la floute `blurIterations`
  // fois, et la rajoute teintee. Ici une seule passe a treize prelevements en
  // spirale : le nombre d'iterations ne change donc pas le NOMBRE de passes
  // mais le RAYON, ce qui donne le meme etalement pour un cout fixe — et le
  // build demande jusqu'a dix iterations pendant un eclair.
  owGlow: `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 texelSize;
    uniform vec3 tint;
    uniform float intensity;
    uniform float radius;
    void main(void) {
      vec3 src = texture2D(textureSampler, vUV).rgb;
      vec3 halo = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 13; i++) {
        float a = float(i) * 2.4;                 // l'angle d'or : pas de motif
        float r = sqrt(float(i) / 13.0) * radius;
        vec2 o = vec2(cos(a), sin(a)) * r * texelSize;
        vec3 c = texture2D(textureSampler, vUV + o).rgb;
        float w = 1.0 - float(i) / 16.0;
        halo += c * w;
        total += w;
      }
      halo /= total;
      gl_FragColor = vec4(src + halo * tint * intensity, 1.0);
    }`,

  // --- vignette : assombrissement, aberration chromatique, flou ------------
  //
  // Les trois champs du build montent ensemble pendant un fondu de mort, et ils
  // montent TRES haut : intensite jusqu'a 1 000, aberration jusqu'a 100, flou
  // jusqu'a 1 000. Ce sont des valeurs d'Unity, pas des fractions : on les
  // ramene ici sur ce que l'ecran peut porter, et la courbe garde sa forme.
  owVignette: `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 texelSize;
    uniform float intensity;
    uniform float chromatic;
    uniform float blur;
    void main(void) {
      vec2 d = vUV - vec2(0.5);
      float r = length(d) * 1.41421356;
      // L'aberration ecarte les canaux radialement, d'autant plus loin du centre.
      vec2 shift = d * (chromatic / 100.0) * r * 0.08;
      vec2 soft = texelSize * min(blur / 100.0, 12.0) * r;
      vec3 c;
      c.r = texture2D(textureSampler, vUV + shift + soft).r;
      c.g = texture2D(textureSampler, vUV + soft).g;
      c.b = texture2D(textureSampler, vUV - shift + soft).b;
      // intensite 0,375 (au repos) doit rester discrete ; 1 000 (a la mort)
      // doit tout fermer. La racine donne cette progression-la.
      float k = clamp(sqrt(intensity / 1000.0), 0.0, 1.0);
      float v = 1.0 - k * smoothstep(0.25, 1.0, r);
      gl_FragColor = vec4(c * clamp(v, 0.0, 1.0), 1.0);
    }`,

  // --- gris : le build pousse `effectAmount` jusqu'a 2, on borne a 1 -------
  owGrayscale: `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float amount;
    void main(void) {
      vec3 c = texture2D(textureSampler, vUV).rgb;
      float g = dot(c, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(mix(c, vec3(g), clamp(amount, 0.0, 1.0)), 1.0);
    }`,

  // --- tourbillon : l'image se visse autour de son centre -----------------
  //
  // `radius` vaut 1,5 sur la camera du joueur — soit plus que l'ecran entier :
  // le tourbillon prend tout, il ne fait pas un disque au milieu.
  owTwirl: `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 center;
    uniform vec2 radius;
    uniform float angle;
    void main(void) {
      vec2 d = vUV - center;
      float dist = length(d / radius);
      float a = angle * 0.017453292 * max(0.0, 1.0 - dist);
      float s = sin(a), c = cos(a);
      vec2 p = vec2(d.x * c - d.y * s, d.x * s + d.y * c) + center;
      gl_FragColor = texture2D(textureSampler, clamp(p, 0.0, 1.0));
    }`,

  // --- bloom : seuil, etalement, addition ---------------------------------
  //
  // `bloomThreshhold` vaut 0,8 sur la camera du joueur et 0,5 sur celle de la
  // carte — la faute de frappe du champ est celle d'Unity. `screenBlendMode`
  // vaut 1 (Add) sur les deux.
  owBloom: `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 texelSize;
    uniform float threshold;
    uniform float intensity;
    uniform float spread;
    uniform float screenBlend;
    void main(void) {
      vec3 src = texture2D(textureSampler, vUV).rgb;
      vec3 sum = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 16; i++) {
        float a = float(i) * 2.39996;
        float r = sqrt(float(i) / 16.0) * spread * 6.0;
        vec3 c = texture2D(textureSampler, vUV + vec2(cos(a), sin(a)) * r * texelSize).rgb;
        vec3 bright = max(c - vec3(threshold), vec3(0.0));
        float w = 1.0 - float(i) / 20.0;
        sum += bright * w;
        total += w;
      }
      sum = sum / total * intensity;
      // Add (screenBlend = 0) ou Screen (1) : le build demande Add partout.
      vec3 add = src + sum;
      vec3 scr = vec3(1.0) - (vec3(1.0) - src) * (vec3(1.0) - clamp(sum, 0.0, 1.0));
      gl_FragColor = vec4(mix(add, scr, screenBlend), 1.0);
    }`,

  // --- NoiseEffect : la vieille pellicule de la camera du satellite -------
  owFilm: `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float time;
    uniform float grain;
    uniform float grainSize;
    uniform float scratch;
    uniform float monochrome;
    float bruit(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(void) {
      vec3 c = texture2D(textureSampler, vUV).rgb;
      float g = bruit(floor(vUV * 512.0 / max(grainSize, 1.0)) + time) - 0.5;
      c += g * grain * 2.0;
      // Les rayures : quelques colonnes verticales, qui sautent a chaque image.
      float x = bruit(vec2(floor(time * 12.0), 3.0));
      if (abs(vUV.x - x) < 0.0015) c += scratch;
      float y = dot(c, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(mix(c, vec3(y), monochrome), 1.0);
    }`,

  // --- NoiseAndGrain : le grain de la camera d'atterrissage ---------------
  owGrain: `
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float time;
    uniform float strength;
    uniform vec3 tiling;
    float bruit(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(void) {
      vec3 c = texture2D(textureSampler, vUV).rgb;
      vec3 n = vec3(bruit(vUV * tiling.x + time),
                    bruit(vUV * tiling.y + time + 11.0),
                    bruit(vUV * tiling.z + time + 23.0)) - vec3(0.5);
      gl_FragColor = vec4(c + n * strength * 0.05, 1.0);
    }`,

};

let inscrits = false;
function inscrire(BABYLON) {
  if (inscrits) return;
  for (const [nom, src] of Object.entries(SHADERS)) {
    BABYLON.Effect.ShadersStore[`${nom}FragmentShader`] = src;
  }
  inscrits = true;
}

/**
 * Monte la pile d'effets d'une camera et rend de quoi la piloter.
 *
 * Chaque effet est cree ETEINT (`p.enabled = false` n'existe pas sur un
 * PostProcess : on le detache et on le rattache), parce que le build les pose
 * eteints et qu'un ecran gris en permanence serait pire que pas d'effet du tout.
 */
export class PostFX {
  constructor(BABYLON, camera, engine, reglages) {
    this.BABYLON = BABYLON;
    this.camera = camera;
    this.engine = engine;
    this.reglages = reglages;
    this.passes = {};
    this.actifs = new Set();
    if (!BABYLON || !camera) return;        // repli : la page reste ouvrable
    inscrire(BABYLON);

    const texel = () => {
      const w = engine ? engine.getRenderWidth() : 1280;
      const h = engine ? engine.getRenderHeight() : 720;
      return [1 / Math.max(1, w), 1 / Math.max(1, h)];
    };
    this._texel = texel;

    // L'ordre de creation est l'ordre d'application : celui des composants sur
    // le GameObject du build.
    this.passes.glow = this._passe("owGlow", ["tint", "intensity", "radius", "texelSize"]);
    this.passes.vignette = this._passe("owVignette", ["intensity", "chromatic", "blur", "texelSize"]);
    this.passes.grayscale = this._passe("owGrayscale", ["amount"]);
    this.passes.twirl = this._passe("owTwirl", ["center", "radius", "angle"]);
    this.passes.bloom = this._passe("owBloom", ["threshold", "intensity", "spread", "screenBlend", "texelSize"]);

    // Le bloom, lui, est allume en permanence : c'est le seul des six que le
    // build ne coupe pas au reveil, et donc le seul qu'on voit toujours.
    const b = (reglages && reglages.bloom) || {};
    this.allumer("bloom");
    this.passes.bloom.onApply = (e) => {
      e.setFloat("threshold", b.threshold ?? 0.8);
      e.setFloat("intensity", b.intensity ?? 1);
      e.setFloat("spread", b.blurSpread ?? 1.5);
      e.setFloat("screenBlend", b.blend === "screen" ? 1 : 0);
      e.setFloat2("texelSize", ...texel());
    };
  }

  _passe(nom, uniformes) {
    const p = new this.BABYLON.PostProcess(nom, nom, uniformes, null, 1.0,
      null, this.BABYLON.Texture.BILINEAR_SAMPLINGMODE, this.engine);
    return p;
  }

  allumer(nom) {
    const p = this.passes[nom];
    if (!p || this.actifs.has(nom)) return;
    this.camera.attachPostProcess(p, this._rang(nom));
    this.actifs.add(nom);
  }

  eteindre(nom) {
    const p = this.passes[nom];
    if (!p || !this.actifs.has(nom)) return;
    this.camera.detachPostProcess(p);
    this.actifs.delete(nom);
  }

  /**
   * Le rang d'un effet dans la chaine.
   *
   * `attachPostProcess` sans rang ajoute a la fin, ce qui ferait passer un
   * effet rallume APRES le bloom — et un fondu au noir suivi d'un bloom rend
   * un ecran gris, pas noir. On impose donc l'ordre du build.
   */
  _rang(nom) {
    const ordre = ["glow", "vignette", "grayscale", "twirl", "bloom"];
    let r = 0;
    for (const n of ordre) {
      if (n === nom) return r;
      if (this.actifs.has(n)) r += 1;
    }
    return r;
  }

  /** Reporte l'etat tenu par `CameraEffects` sur les passes. */
  appliquer(fx) {
    if (!this.BABYLON || !this.camera) return;
    const t = this._texel();

    if (fx.glow.enabled) {
      this.allumer("glow");
      this.passes.glow.onApply = (e) => {
        e.setFloat3("tint", ...fx.glow.tint.map((c) => Math.min(c, 8)));
        e.setFloat("intensity", Math.min(fx.glow.intensity, 8));
        e.setFloat("radius", (fx.glow.blurSpread || 0.5) * Math.max(1, fx.glow.iterations) * 4);
        e.setFloat2("texelSize", ...t);
      };
    } else this.eteindre("glow");

    if (fx.vignette.enabled) {
      this.allumer("vignette");
      this.passes.vignette.onApply = (e) => {
        e.setFloat("intensity", fx.vignette.intensity);
        e.setFloat("chromatic", fx.vignette.chromaticAberration);
        e.setFloat("blur", fx.vignette.blur);
        e.setFloat2("texelSize", ...t);
      };
    } else this.eteindre("vignette");

    if (fx.grayscale.enabled) {
      this.allumer("grayscale");
      this.passes.grayscale.onApply = (e) => e.setFloat("amount", fx.grayscale.amount);
    } else this.eteindre("grayscale");

    if (fx.twirl.enabled) {
      this.allumer("twirl");
      const tw = (this.reglages && this.reglages.twirl) || { radius: [1.5, 1.5], center: [0.5, 0.5] };
      this.passes.twirl.onApply = (e) => {
        e.setFloat2("center", tw.center[0], tw.center[1]);
        e.setFloat2("radius", tw.radius[0], tw.radius[1]);
        e.setFloat("angle", fx.twirl.angle);
      };
    } else this.eteindre("twirl");
  }

  dispose() {
    for (const p of Object.values(this.passes)) { try { p.dispose(this.camera); } catch { /* deja partie */ } }
    this.passes = {};
    this.actifs.clear();
  }
}

/**
 * Les effets des cameras SECONDAIRES, qui n'ont pas de controleur : ils sont
 * poses une fois et ne bougent plus.
 *
 *   sonde / atterrissage  NoiseAndGrain, force 4, tuilage 50
 *   satellite             NoiseEffect monochrome, grain 0,1 a 0,2, rayures
 *   ordinateur de bord    MotionBlur 0,6
 */
export function effetsSecondaires(BABYLON, camera, engine, quoi, reglages = {}) {
  if (!BABYLON || !camera) return null;
  inscrire(BABYLON);
  const depart = Date.now() / 1000;
  if (quoi === "film") {
    const r = reglages.noise || { grain: [0.1, 0.2], grainSize: 2, scratch: [0.05, 0.25], monochrome: true };
    const p = new BABYLON.PostProcess("owFilm", "owFilm",
      ["time", "grain", "grainSize", "scratch", "monochrome"], null, 1.0, camera,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine);
    p.onApply = (e) => {
      const u = Math.random();
      e.setFloat("time", Date.now() / 1000 - depart);
      e.setFloat("grain", r.grain[0] + (r.grain[1] - r.grain[0]) * u);
      e.setFloat("grainSize", r.grainSize);
      e.setFloat("scratch", r.scratch[0] + (r.scratch[1] - r.scratch[0]) * u);
      e.setFloat("monochrome", r.monochrome ? 1 : 0);
    };
    return p;
  }
  if (quoi === "grain") {
    const r = reglages.grain || { strength: 4, tiling: [50, 50, 50] };
    const p = new BABYLON.PostProcess("owGrain", "owGrain", ["time", "strength", "tiling"],
      null, 1.0, camera, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine);
    p.onApply = (e) => {
      e.setFloat("time", Date.now() / 1000 - depart);
      e.setFloat("strength", r.strength);
      e.setFloat3("tiling", ...r.tiling);
    };
    return p;
  }
  return null;
}
