// Le ciel : la voute, les nuages, le champ d'etoiles.
//
// Trois classes du build que rien ne lisait, et un premier plan qui ne
// ressemblait pas au jeu (docs/41-ciel.md). Elles sont toutes les trois sur
// Timber Hearth, et ce sont elles qui font la premiere image de la partie.
//
// `SkyBehavior` — la voute. Son `Update` tient en deux gestes :
//
//     _relativeBody.transform.LookAt(_sunBody.transform.position)
//     si le joueur est dans l'atmosphere :
//         _currentSkyAlpha = SkyAlphaCurve.Evaluate(distance / _skyRadius)
//
// La voute TOURNE donc pour faire face au soleil, et c'est de la que vient la
// difference entre le jour et la nuit : la texture `atmosphere_blue` est un
// degrade, et on en voit la face claire ou la face sombre selon l'heure. Le
// portage la posait immobile, et montrait donc un plein jour permanent — sur
// une scene que son propre affichage annonce comme nocturne.
//
// `_skyRadius` n'est pas serialise : c'est le 320 du constructeur.
//
// `CloudTextureController` — 24 nuages, un `_cloudTex` chacun, pose SUR le
// materiau partage a l'execution. Les 24 partagent `CloudMat`, dont la texture
// serialisee est `cloud_01` : sans ce composant, les 24 nuages portent le meme
// visage au lieu de dix.
//
// `DistantStarController` — le champ d'etoiles, un systeme de particules suivi
// par la camera.

import { round } from "./context.js";
import { decodeMesh } from "../unity/mesh.js";
import { TextureExporter } from "./materials.js";
import { envelope } from "./particles.js";
import { unpackColor32 } from "../unity/texture.js";

/** Rayon de ciel par defaut : le `_skyRadius` du constructeur de SkyBehavior. */
export const SKY_RADIUS = 320;

/** Echantillonne une AnimationCurve en `n` points reguliers, de 0 a 1. */
function sampleCurve(ac, n = 9) {
  const keys = (ac && (ac.m_Curve || ac.curve || ac)) || null;
  if (!Array.isArray(keys) || keys.length < 2) return null;
  const pts = keys
    .filter((k) => k && typeof k.time === "number" && typeof k.value === "number")
    .map((k) => [k.time, k.value])
    .sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = pts[0][0] + (i / (n - 1)) * (pts[pts.length - 1][0] - pts[0][0]);
    let v = pts[pts.length - 1][1];
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1];
      if (a[0] <= t && t <= b[0]) {
        v = a[1] + (b[1] - a[1]) * ((t - a[0]) / ((b[0] - a[0]) || 1));
        break;
      }
    }
    out.push(round(v, 4));
  }
  return out;
}

/**
 * Ou la texture de ciel pose son DISQUE sur la voute, mesure sur le maillage.
 *
 * `atmosphere_blue` est un disque bleu radial sur fond transparent : son centre
 * est l'uv (0,5 ; 0,5). La question « quelle direction le `LookAt` doit-il
 * viser » n'a donc pas besoin d'etre raisonnee — elle se lit sur les uv du
 * maillage, et c'est ce qu'on fait ici.
 *
 * docs/41-ciel.md avait tente de la deduire de deux captures d'ecran et
 * conclu : « la convention d'axes reste a etablir ». La mesure dit +Z, tout
 * simplement, et l'uv est une projection polaire centree dessus (+X tombe en
 * u = 0,109, -X en 0,891, +Y en v = 0,891, -Y en 0,109).
 *
 * On rend la direction dans les coordonnees de l'EXPORT, Z deja inverse comme
 * `gltf.js` le fait sur les positions : le moteur ne lit que du glTF, et une
 * direction exprimee dans un repere qu'il ne voit jamais ne lui servirait pas.
 */
function discDirection(ctx, gid) {
  for (const c of ctx.componentsOf(gid, ["MeshFilter"])) {
    const v = ctx.readEngine(c);
    const cible = v && v.m_Mesh && ctx.env.deref(v.m_Mesh, ctx.env.get(ctx.sceneFile));
    const raw = cible && ctx.readEngine(cible);
    if (!raw) continue;
    let d;
    try { d = decodeMesh(raw); } catch { continue; }
    if (!d.uv0 || !d.positions || !d.vertexCount) continue;
    // Moyenne des directions des sommets proches du centre, ponderee : un seul
    // sommet suffirait ici (il tombe pile sur 0,5 ; 0,5) mais ne le dirait pas
    // si le maillage changeait.
    let acc = [0, 0, 0], poidsTotal = 0;
    for (let i = 0; i < d.vertexCount; i++) {
      const du = d.uv0[i * 2] - 0.5, dv = d.uv0[i * 2 + 1] - 0.5;
      const poids = Math.max(0, 1 - Math.hypot(du, dv) * 8);
      if (!poids) continue;
      const p = [d.positions[i * 3], d.positions[i * 3 + 1], d.positions[i * 3 + 2]];
      const n = Math.hypot(p[0], p[1], p[2]) || 1;
      for (let k = 0; k < 3; k++) acc[k] += (p[k] / n) * poids;
      poidsTotal += poids;
    }
    if (!poidsTotal) continue;
    const n = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    // Z inverse : c'est ce que l'export fait des positions, et donc le repere
    // dans lequel le moteur verra ce maillage.
    return [round(acc[0] / n, 4), round(acc[1] / n, 4), round(-acc[2] / n, 4)];
  }
  return null;
}

/**
 * Les quelques nombres du systeme de particules qui font un champ d'etoiles :
 * combien, a quelle distance, de quelle taille, de quelle couleur.
 *
 * On ne passe pas par l'extracteur de particules : il rend un systeme complet,
 * dont le moteur ne garde que les quatorze plus proches — et un champ
 * d'etoiles n'est jamais « proche ». Le build lui donne son propre controleur ;
 * on lui donne ses propres nombres.
 */
function particleField(ctx, gid) {
  for (const c of ctx.componentsOf(gid, ["ParticleSystem"])) {
    const v = ctx.readEngine(c);
    if (!v) continue;
    const init = v.InitialModule || {};
    const shape = v.ShapeModule || {};
    // Taille et couleur se lisent comme partout ailleurs — `envelope` pour la
    // fourchette d'une MinMaxCurve, `unpackColor32` pour une couleur empaquetee
    // dans un entier. Les relire a la main ici donnait 400 au lieu de 200-400
    // et du blanc au lieu du bleu pale du build.
    const taille = init.startSize || {};
    const env = envelope(taille);
    const plat = typeof taille.scalar === "number" ? round(taille.scalar, 2) : 0;
    return {
      count: v.maxNumParticles ?? 1000,
      radius: round(shape.radius ?? 0, 2),
      size: env || [plat, plat],
      color: unpackColor32(init.startColor
        && (init.startColor.maxColor || init.startColor.minColor)).map((x) => round(x, 4)),
    };
  }
  return null;
}

/** La courbe d'alpha de la voute est imbriquee dans une structure nommee. */
function alphaCurveOf(fields) {
  const c = fields && fields.SkyAlphaCurve;
  if (!c) return null;
  return sampleCurve(c.alphaByPlayerPosition || c.m_Curve || c);
}

/**
 * @param ctx
 * @param emitImage  (nom, image) -> nom de fichier ecrit ; sans lui, les dix
 *                   textures de nuage restent nommees et non exportees, ce
 *                   qu'elles etaient jusqu'ici.
 */
export function extractSky(ctx, emitImage = null) {
  // 256 pixels : c'est la taille des textures de particules, et un nuage est
  // une image floue etiree sur des dizaines d'unites. Plus grand ne se verrait
  // pas et pesrait sur le premier chargement.
  const textureExport = emitImage
    ? new TextureExporter(ctx, emitImage, { maxSide: 256, prefix: "cloud" })
    : null;
  let shell = null;
  const clouds = [];
  const stars = [];

  for (const { obj, cls } of ctx.behaviours(
    (c) => /skybehavior|cloudtexturecontroller|distantstarcontroller/i.test(c))) {
    const raw = ctx.scriptFields(obj);
    if (!raw) continue;
    const f = ctx.plain(raw);
    const gid = ctx.ownerId(obj);
    const name = ctx.name(gid);
    const position = ctx.worldPosition(gid);

    if (/skybehavior/i.test(cls)) {
      const vol = ctx.volumeOf(gid);
      shell = {
        name, position,
        // La direction que le `LookAt` doit amener sur le soleil, mesuree.
        discDirection: discDirection(ctx, gid),
        radius: vol && typeof vol.radius === "number" ? round(vol.radius, 3) : null,
        skyRadius: typeof f._skyRadius === "number" ? f._skyRadius : SKY_RADIUS,
        alphaCurve: alphaCurveOf(f),
        endColor: f._endMaterialColor
          ? [round(f._endMaterialColor.r ?? 0, 4), round(f._endMaterialColor.g ?? 0, 4),
             round(f._endMaterialColor.b ?? 0, 4), round(f._endMaterialColor.a ?? 0, 4)]
          : null,
      };
    } else if (/cloudtexture/i.test(cls)) {
      // `Awake` fait DEUX choses, et une seule marche :
      //
      //   renderer.material.mainTexture = _cloudTex;     <- appliquee
      //   Color c = renderer.material.color; c.a = _startAlpha;   <- perdue
      //
      // La seconde ecrit dans une COPIE de la structure et ne la range jamais :
      // `_startAlpha` ne quitte jamais le champ. On l'extrait quand meme, et on
      // dit qu'il ne sert pas — comme `_currentSkyAlpha` de la voute, comme les
      // modificateurs de degats du vaisseau.
      //
      // `Update` est vide : un nuage ne bouge pas.
      const ptr = raw._cloudTex;
      clouds.push({
        name, position,
        // Le PPtr de `_cloudTex` porte le nom de sa cible : c'est lui qui
        // distingue les dix visages des nuages.
        texture: (f._cloudTex && f._cloudTex.name) || null,
        image: textureExport ? (textureExport.export(ptr, ctx.sceneObj) || {}).file || null : null,
        alpha: typeof f._startAlpha === "number" ? f._startAlpha : 1,
      });
    } else {
      // Le champ d'etoiles, et ce qu'il devient a mesure que la boucle passe.
      //
      // `LateUpdate` MET EN PAUSE son systeme de particules des la premiere
      // image et ne le relance jamais : les mille etoiles ne bougent plus, et
      // leurs positions sont relevees une fois. Puis il colle le champ sur la
      // camera du joueur — c'est ce qui les rend infiniment lointaines.
      //
      // `Update` les eteint UNE A UNE : `_explodeToThisIndex` suit une courbe
      // de la fraction de boucle, chaque etoile franchie recoit une supernova
      // (`Prefabs/Particles/DistantSupernova`) a sa position et passe en
      // couleur (0, 0, 0, 0). Le ciel se VIDE pendant les vingt minutes, et
      // presque tout a la fin : la courbe donne 23,8 % a 69,5 % du temps.
      //
      // `_starsUpdateIntervalInSeconds` vaut zero : le controle est fait a
      // chaque image.
      const ps = particleField(ctx, gid);
      stars.push({
        name, position,
        interval: typeof f._starsUpdateIntervalInSeconds === "number"
          ? f._starsUpdateIntervalInSeconds : 0,
        explosionCurve: sampleCurve(
          (f.StarFieldExplosionCurve || {}).explosionsByTime
          || f.StarFieldExplosionCurve, 21),
        count: ps ? ps.count : null,
        radius: ps ? ps.radius : null,
        size: ps ? ps.size : null,
        color: ps ? ps.color : null,
      });
    }
  }

  const textures = [...new Set(clouds.map((c) => c.texture).filter(Boolean))].sort();
  return {
    shell, clouds, stars,
    stats: { voute: shell ? 1 : 0, nuages: clouds.length,
             "textures de nuage": textures.length,
             "images de nuage": textureExport ? textureExport.count : 0,
             "champs d'etoiles": stars.length },
    textures,
  };
}
