// Lumieres de la scene, instanciees a la volee.
//
// Le portage n'en avait que deux, toutes deux inventees : une directionnelle
// pour le soleil et une hemispherique d'ambiance, pour tout un systeme solaire.
// Le build en pose de vraies — feu de camp, interieurs, balises de Dark
// Bramble — avec leur type, leur couleur, leur intensite, leur portee et leur
// angle de spot (voir web/src/pipeline/extract/lights.js).
//
// Elles sont cheres : une lumiere temps reel coute une passe par maillage
// eclaire. On garde donc un BUDGET, comme pour les particules et les sources
// audio, et on ne cree que les plus proches — celles dont le joueur est dans la
// portee. `sectors.js` sait deja qui est a portee ; ici la portee est celle de
// la lumiere elle-meme, ce qui est plus fin et vient du build.
//
// Ce qu'on n'instancie pas, et pourquoi :
//
//   - les DIRECTIONNELLES : elles eclairent tout, partout, sans position. Le
//     portage en a deja une, orientee sur l'etoile a chaque image, et en
//     ajouter une seconde reviendrait a poser un second soleil ;
//   - les AREA : Unity ne les calcule qu'en lightmap, jamais en temps reel ;
//   - celles dont le composant est desactive dans la scene : c'est un script
//     qui les allume, pas le chargement.

const BUDGET = 8;

export async function loadSceneLights() {
  try {
    const res = await fetch("data/lights.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("data/lights.json absent :", e.message);
    return { lights: [], render: null };
  }
}

/** Lumieres que le moteur sait poser : ponctuelles et spots, allumees. */
export function placedLights(data) {
  return ((data && data.lights) || []).filter(
    (l) => (l.type === "point" || l.type === "spot") && l.enabled && l.range > 0);
}

export class SceneLights {
  constructor(BABYLON, scene, lights, budget = BUDGET) {
    this.B = BABYLON;
    this.scene = scene;
    this.lights = lights;
    this.budget = budget;
    this.live = new Map();     // index -> lumiere Babylon
    this.ignored = 0;
  }

  get count() { return this.live.size; }

  /**
   * @param eye position de la camera dans le repere courant
   * @param frameOffset decalage monde -> repere (position du corps ancre)
   */
  update(eye, frameOffset) {
    const o = frameOffset || [0, 0, 0];
    const cand = [];
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const p = [l.position[0] - o[0], l.position[1] - o[1], l.position[2] - o[2]];
      const d = Math.hypot(p[0] - eye.x, p[1] - eye.y, p[2] - eye.z);
      // Hors de sa portee, une lumiere n'eclaire rien de ce qu'on voit : elle
      // ne merite pas une passe de rendu.
      if (d > l.range) continue;
      cand.push({ i, l, p, d });
    }
    // A budget egal, la plus proche l'emporte : c'est elle qui eclaire le sol
    // sous les pieds du joueur.
    cand.sort((a, b) => a.d - b.d);
    const keep = new Set(cand.slice(0, this.budget).map((c) => c.i));

    for (const i of [...this.live.keys()]) {
      if (!keep.has(i)) {
        const lit = this.live.get(i);
        if (lit) lit.dispose();
        this.live.delete(i);
      }
    }
    for (const c of cand.slice(0, this.budget)) {
      let lit = this.live.get(c.i);
      if (!lit) {
        lit = this._create(c.i, c.l);
        if (!lit) continue;
        this.live.set(c.i, lit);
      }
      lit.position.set(c.p[0], c.p[1], c.p[2]);
    }
  }

  _create(i, l) {
    const B = this.B;
    const name = `light_${i}_${l.name || l.type}`;
    let lit = null;
    try {
      if (l.type === "spot") {
        // L'angle d'Unity est l'angle TOTAL du cone, en degres ; Babylon
        // attend le meme angle en radians. `exponent` fixe la douceur du bord :
        // Unity n'en a pas d'equivalent serialise, 2 donne un bord franc.
        lit = new B.SpotLight(name,
          new B.Vector3(0, 0, 0),
          new B.Vector3(l.direction[0], l.direction[1], l.direction[2]),
          (l.spotAngle || 45) * Math.PI / 180, 2, this.scene);
      } else {
        lit = new B.PointLight(name, new B.Vector3(0, 0, 0), this.scene);
      }
    } catch (e) {
      // moteur sans ce type de lumiere : on s'en passe plutot que d'echouer
      this.ignored++;
      return null;
    }
    lit.range = l.range;
    lit.intensity = l.intensity;
    if (l.color) lit.diffuse = new B.Color3(l.color[0], l.color[1], l.color[2]);
    lit.specular = new B.Color3(0.1, 0.1, 0.1);
    return lit;
  }

  dispose() {
    for (const lit of this.live.values()) if (lit) lit.dispose();
    this.live.clear();
  }
}
