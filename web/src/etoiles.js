// Le rendu du champ d'etoiles : mille sprites, a la taille que le build leur
// donne.
//
// `DistantStars` est un systeme de particules : `sphereShell` de 30 000 unites,
// taille tiree entre 200 et 400, texture `Default-Particle`, fusion additive.
// Le portage le rendait en nuage de points de TROIS PIXELS, pleins et carres,
// a toute resolution : cote a cote avec l'alpha (docs/132), un ciel de gros
// confettis bleutes la ou l'alpha pose une poussiere de points fins et doux.
//
// Une etoile de 300 unites a 30 000 sous-tend un centieme de radian ; a 360
// pixels de haut et 70 degres, c'est 2,6 pixels — et la `Default-Particle` est
// une tache qui s'eteint vers son bord, pas un carre. On dessine donc chaque
// etoile en sprite de point, a sa taille angulaire, en echantillonnant la
// texture du build (`gl_PointCoord`).
//
// La logique d'extinction (sky.js, `StarField`) ne change pas : l'objet rendu
// garde la forme d'un nuage de points de Babylon — `particles[i].color` et
// `setParticles()` —, que main.js manipule deja.

/** Taille tiree d'une etoile, comme `startSize` entre deux constantes. */
export function taillesEtoiles(count, [min, max], seed = 7) {
  const out = new Float32Array(count);
  let e = seed >>> 0 || 1;
  for (let i = 0; i < count; i++) {
    e ^= e << 13; e >>>= 0;
    e ^= e >>> 17;
    e ^= e << 5; e >>>= 0;
    out[i] = min + (max - min) * (e / 4294967296);
  }
  return out;
}

/**
 * Pixels par radian au centre de l'ecran, pour un champ VERTICAL `fov`.
 * Une etoile de taille `s` a la distance `r` y fait `s / r` fois autant.
 */
export function pixelsParRadian(hauteurPx, fov) {
  return (hauteurPx / 2) / Math.tan(fov / 2);
}

/**
 * En dessous de ce diametre, un sprite ne montre plus sa forme : il montre
 * son echantillonnage. Mesure sur l'alpha en 640 x 360, ou les etoiles
 * devraient faire 1,7 a 3,4 pixels : ce sont des points d'UN pixel, a 0,2-0,3
 * de gris. Un sprite de 2,6 pixels en point de Babylon, lui, s'etalait sur
 * quatre a neuf pixels a 0,05 chacun — le ciel se vidait.
 *
 * On garde donc l'ENERGIE et non la forme : un point d'un pixel qui vaut
 * l'aire du sprite fois la moyenne de sa texture.
 */
export const SEUIL_POINT = 4;

/**
 * Intensite d'une etoile rendue en point d'un pixel. Le shader la calcule
 * etoile par etoile (`vGain`) ; cette copie en est l'etalon, que les tests
 * eprouvent.
 */
// @mesure
export function gainPoint(diametrePx, moyenne) {
  return diametrePx * diametrePx * moyenne;
}

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
attribute float taille;
uniform mat4 worldViewProjection;
uniform float pxParUnite;
uniform float moyenne;
varying vec4 vCouleur;
varying float vGain;
void main(void) {
  gl_Position = worldViewProjection * vec4(position, 1.0);
  float s = taille * pxParUnite;
  if (s < ${SEUIL_POINT.toFixed(1)}) {
    gl_PointSize = 1.0;
    vGain = s * s * moyenne;
  } else {
    gl_PointSize = s;
    vGain = -1.0;
  }
  vCouleur = color;
}`;

const FRAGMENT = `
precision highp float;
uniform sampler2D tache;
varying vec4 vCouleur;
varying float vGain;
void main(void) {
  // Particles/Additive : 2 x teinte (0,5) x couleur x texture, en SrcAlpha One.
  if (vGain >= 0.0) {
    gl_FragColor = vec4(vCouleur.rgb * vGain * vCouleur.a, 1.0);
  } else {
    vec4 t = texture2D(tache, gl_PointCoord);
    gl_FragColor = vec4(vCouleur.rgb * t.rgb * t.a * vCouleur.a, 1.0);
  }
}`;

/** Moyenne de rgb x a sur les pixels d'une texture RGBA (octets). */
export function moyenneTache(pixels) {
  let s = 0;
  const n = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) s += (pixels[i] / 255) * (pixels[i + 3] / 255);
  return n ? s / n : 0;
}

/**
 * Construit le champ. `texture` est l'URL de la `Default-Particle` exportee ;
 * sans elle, une tache calculee la remplace (repli explicite).
 */
export function champEtoiles(BABYLON, scene, starField, texture = null) {
  const n = starField.count;
  const pos = starField.positions(1);
  const tailles = taillesEtoiles(n, starField.size);
  const [cr, cg, cb] = starField.color;
  const couleurs = new Float32Array(n * 4);
  const particles = [];
  for (let i = 0; i < n; i++) {
    particles.push({ color: new BABYLON.Color4(cr, cg, cb, 1) });
  }

  const mesh = new BABYLON.Mesh("etoiles", scene);
  const vd = new BABYLON.VertexData();
  vd.positions = pos;
  vd.indices = Array.from({ length: n }, (_, i) => i);
  vd.applyToMesh(mesh, true);
  mesh.setVerticesData("taille", tailles, false, 1);
  const ecrire = () => {
    for (let i = 0; i < n; i++) {
      const c = particles[i].color;
      couleurs[i * 4] = c.r; couleurs[i * 4 + 1] = c.g;
      couleurs[i * 4 + 2] = c.b; couleurs[i * 4 + 3] = c.a;
    }
    if (mesh.isVerticesDataPresent("color")) mesh.updateVerticesData("color", couleurs);
    else mesh.setVerticesData("color", couleurs, true, 4);
  };
  ecrire();

  const mat = new BABYLON.ShaderMaterial("etoiles", scene,
    { vertexSource: VERTEX, fragmentSource: FRAGMENT },
    { attributes: ["position", "color", "taille"],
      uniforms: ["worldViewProjection", "pxParUnite", "moyenne"], samplers: ["tache"] });
  let tex = texture ? new BABYLON.Texture(texture, scene) : null;
  if (!tex) {
    // Repli : une tache radiale, faute de la texture du build.
    const dt = new BABYLON.DynamicTexture("tache", 64, scene, false);
    const g = dt.getContext();
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    dt.update();
    tex = dt;
  }
  mat.setTexture("tache", tex);
  // La moyenne se MESURE sur la texture chargee ; en attendant, celle d'une
  // tache conique (un tiers de l'aire du disque, au carre pour rgb x a).
  let moyenne = 0.07;
  const mesurer = () => {
    try {
      const p = tex.readPixels && tex.readPixels();
      if (p && p.then) p.then((px) => { if (px) moyenne = moyenneTache(px); }).catch(() => {});
      else if (p) moyenne = moyenneTache(p);
    } catch (e) { /* on garde l'estimation */ }
  };
  if (tex.isReady && tex.isReady()) mesurer();
  else if (tex.onLoadObservable) tex.onLoadObservable.addOnce(mesurer);
  mat.pointsCloud = true;
  mat.fillMode = BABYLON.Material.PointFillMode;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.alphaMode = BABYLON.Engine.ALPHA_ONEONE;
  mat.needAlphaBlending = () => true;
  // Relu a chaque liaison : la resolution et le champ de vision changent (la
  // longue-vue resserre le champ, et les etoiles y grossissent comme dans le
  // jeu, ou elles ont une taille MONDE).
  mat.onBindObservable.add(() => {
    const cam = scene.activeCamera;
    const h = scene.getEngine().getRenderHeight();
    const k = cam ? pixelsParRadian(h, cam.fov) / starField.radius : 0;
    const fx = mat.getEffect();
    if (fx) { fx.setFloat("pxParUnite", k); fx.setFloat("moyenne", moyenne); }
  });
  mesh.material = mat;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.infiniteDistance = true;

  return { mesh, particles, setParticles: ecrire };
}

/**
 * La voute d'une scene : `RenderFX/Skybox`, six faces, couleur = texture x
 * _Tint x 2. Servie a l'ecran-titre et a la partie.
 *
 * @param skybox  `{ faces: { px, py, pz, nx, ny, nz }, tint }` de l'extracteur
 * @param dir     dossier des images (`data/titre/`, `data/sky/`)
 * @param taille  arete du cube : il doit tenir DANS le plan lointain, coins
 *                compris — a 1,5 fois la portee, ses coins sortaient du tronc
 *                de vue et le fond de la camera passait par le trou
 * @returns le maillage, ou null si la voute est incomplete
 */
export function creerVoute(B, scene, skybox, dir, taille) {
  if (!skybox || !skybox.faces || Object.keys(skybox.faces).length !== 6) return null;
  const f = skybox.faces;
  const cube = B.CubeTexture.CreateFromImages(
    ["px", "py", "pz", "nx", "ny", "nz"].map((k) => dir + f[k]), scene);
  const box = B.MeshBuilder.CreateBox("voute", { size: taille }, scene);
  const mat = new B.StandardMaterial("voute", scene);
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  mat.reflectionTexture = cube;
  mat.reflectionTexture.coordinatesMode = B.Texture.SKYBOX_MODE;
  mat.reflectionTexture.level = 1;
  mat.diffuseColor = new B.Color3(0, 0, 0);
  mat.specularColor = new B.Color3(0, 0, 0);
  mat.emissiveColor = new B.Color3(0, 0, 0);
  // Babylon multiplie le reflet par `reflectionColor` : c'est la teinte.
  const t = skybox.tint || [0.5, 0.5, 0.5];
  mat.reflectionColor = new B.Color3(...t.map((v) => Math.min(1, v * 2)));
  mat.fogEnabled = false;
  box.material = mat;
  box.infiniteDistance = true;
  box.isPickable = false;
  box.applyFog = false;
  return box;
}
