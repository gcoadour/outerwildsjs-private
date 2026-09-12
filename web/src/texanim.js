// Textures qui defilent, cote moteur.
//
// La loi du build tient en une ligne (docs/42-lumieres.md) :
//
//     offset += rate x mainTextureScale.y x dt,  puis on repli dans [0, 1]
//
// Deux precautions que Unity prend pour nous et que Babylon ne prend pas :
//
//   - `renderer.material` rend une COPIE par renderer. Vingt-sept maillages qui
//     partagent un materiau ont donc vingt-sept defilements independants. Ici il
//     faut cloner explicitement, sans quoi le premier scroller entraine tous les
//     autres ;
//   - l'offset de depart est tire au hasard dans `Awake`, pour que deux surfaces
//     voisines ne defilent pas en phase.

/** Avance un offset d'un pas de temps, et le replie dans [0, 1]. */
export function scrollOffset(offset, rate, scaleY, dt) {
  let o = offset + rate * (scaleY || 1) * dt;
  // Le build teste STRICTEMENT : au-dela de 1 on repart de 0, en deca de 0 on
  // repart de 1. Un rythme negatif remonte donc la texture.
  if (o > 1) o = 0;
  else if (o < 0) o = 1;
  return o;
}

/**
 * Les surfaces qui defilent d'un lot de geometrie.
 *
 * On les retrouve par NOM, et non par position. La position extraite est celle
 * de la scene au repos ; les corps ORBITENT, et un appariement geometrique
 * echoue donc des la premiere seconde — c'est exactement ce qui s'est passe au
 * premier essai, zero surface rattachee sur les quarante-quatre.
 *
 * L'appariement par nom est exact pour 23 des 27 noms, dont les instances
 * portent des parametres identiques. Les quatre autres — `middle`, `inner`,
 * `outer`, `pCylinder1` — ont deux variantes chacune pour six instances : un
 * rythme peut donc echoir a la mauvaise couche des anneaux de sable. La
 * difference se compte en centiemes d'unite par seconde, et l'alternative
 * serait d'apparier sur une position qui ne vaut plus rien.
 */
export class TextureScrollers {
  constructor(data = null) {
    this.data = (data && data.scrollers) || [];
    this.live = [];      // { mesh, channels, offsets }
  }

  get total() { return this.data.length; }
  get count() { return this.live.length; }

  /** Rattache les descriptions aux maillages d'un lot charge, par nom. */
  attach(meshes) {
    if (!this.data.length || !meshes || !meshes.length) return 0;
    const libres = new Map();
    for (const m of meshes) {
      if (this.live.some((x) => x.mesh === m)) continue;
      const l = libres.get(m.name) || [];
      l.push(m);
      libres.set(m.name, l);
    }
    let n = 0;
    for (const s of this.data) {
      const candidats = libres.get(s.name);
      if (!candidats || !candidats.length) continue;
      const cible = candidats.shift();
      // Le clone : sans lui, tous les maillages du meme materiau defileraient
      // ensemble, ce que Unity evite en instanciant par renderer.
      if (cible.material && typeof cible.material.clone === "function") {
        const c = cible.material.clone(`${cible.material.name}_scroll${this.live.length}`);
        if (c) cible.material = c;
      }
      const offsets = {};
      // `Awake` tire l'offset de depart au hasard : deux surfaces voisines ne
      // defilent pas en phase.
      for (const k of Object.keys(s.channels)) offsets[k] = Math.random();
      this.live.push({ mesh: cible, channels: s.channels, offsets });
      n += 1;
    }
    return n;
  }

  /** Avance tous les defilements d'un pas de temps. */
  update(dt) {
    for (const s of this.live) {
      const mat = s.mesh.material;
      if (!mat) continue;
      for (const [slot, c] of Object.entries(s.channels)) {
        const tex = slot === "normal" ? (mat.bumpTexture || null)
                                      : (mat.albedoTexture || mat.diffuseTexture || null);
        if (!tex) continue;
        const echelle = typeof tex.vScale === "number" ? tex.vScale : 1;
        s.offsets[slot] = scrollOffset(s.offsets[slot] ?? 0, c.rate, echelle, dt);
        tex.uOffset = c.direction[0] * s.offsets[slot];
        tex.vOffset = c.direction[1] * s.offsets[slot];
      }
    }
    return this.live.length;
  }
}

/** Charge `data/texanim.json`, ou une liste vide sans build. */
export async function loadTextureAnimators() {
  try {
    const res = await fetch("data/texanim.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn("data/texanim.json absent :", e.message);
    return { scrollers: [] };
  }
}
