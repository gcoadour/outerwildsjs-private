// Sources ShaderLab et leur classement.
// Portage de tools/12_shaders.py.
//
// Sur ce build Unity 4, presque tous les shaders gardent leur source ShaderLab
// lisible. Mais l'immense majorite sont des shaders Unity standard, embarques
// par le moteur : les reecrire n'aurait aucun sens, un materiau equivalent fait
// le travail. Seuls ceux ecrits par l'equipe meritent une reecriture.

// Familles de shaders livrees avec Unity 4.
const BUILTIN = new RegExp([
  "^(Diffuse|Bumped|Specular|Transparent|Unlit|VertexLit|Skybox|Decal)",
  "^(Particle|Particles)", "^(Alpha|AlphaTest|Illumin|Reflect|Self-Illumin)",
  "^(Normal-|Mobile/|Legacy|Nature/|FX/|Toon/|Sprites|UI/|Hidden/)",
  "^(Internal-|Camera-|Shadow-)", "WavingGrass", "^Blend$",
  "(DepthOfField|SunShafts|Tonemapper|NoiseAndGrain|GlowEffect|" +
  "ChromaticAberration|HollywoodFlares|BloomAndLensFlares)",
  "^(FirstPass|AddPass)$",
].join("|"), "i");

// Gros = beaucoup de variantes compilees. Simple indice, jamais un verdict :
// IzzySunShader, CrackShader et RimShader pesent tres lourd tout en etant
// manifestement ecrits par l'equipe. Le NOM prime donc sur la taille.
const SIZE_HINT = 120_000;

const countOf = (s, sub) => s.split(sub).length - 1;

export function extractShaders(ctx, emit) {
  const rows = [];
  const stats = {};
  const bump = (k) => { stats[k] = (stats[k] || 0) + 1; };

  for (const o of ctx.env.objects({ type: "Shader" })) {
    const d = ctx.readEngine(o);
    if (!d) { bump("illisible"); continue; }
    const src = typeof d.m_Script === "string" ? d.m_Script : "";
    const name = d.m_Name || `shader_${o.pathId}`;
    const kind = BUILTIN.test(name) ? "unity" : "jeu";
    const hasSource = src.length > 200
      && (src.includes("SubShader") || src.includes("Properties"));

    let file = null;
    if (hasSource) {
      const safe = name.replace(/[^\w.\- ]/g, "_").trim() || `shader_${o.pathId}`;
      file = `${safe}_${o.pathId}.shader`;
      emit(file, src);
      bump("sources ecrites");
    } else {
      bump("sans source");
    }

    rows.push({ name, bytes: src.length, kind, gros: src.length >= SIZE_HINT,
                subshaders: countOf(src, "SubShader"),
                passes: countOf(src, "Pass {") + countOf(src, "Pass{"),
                file });
    bump(kind);
  }

  rows.sort((a, b) => (a.kind !== "jeu") - (b.kind !== "jeu") || a.bytes - b.bytes);
  return { unity: ctx.env.get(ctx.sceneFile).unityVersion, shaders: rows, stats };
}
