// Orbites.
//
// Elles sont SIMULEES dans le jeu, pas scriptees : les objets *_Pivot ne
// portent qu'un DisposableContainer, aucune rotation. Chaque corps porte un
// InitialMotion qui lui donne au demarrage une vitesse, puis il suit le champ
// de son primaire.
//
// La vitesse initiale vaut sqrt(a(r) * r) perpendiculairement au rayon, le tout
// multiplie par _orbitImpulseScalar. Deux regimes en decoulent :
//
//   scalaire = 1     orbite circulaire exacte -> resolue analytiquement, donc
//                    sans aucune derive, quel que soit le temps ecoule ;
//   scalaire != 1    orbite elliptique -> integree numeriquement.
//
// Le seul corps du second cas est la comete, a -0.425 : retrograde (signe
// negatif) et sous-circulaire (module < 1), soit une ellipse tres excentrique.
// C'est exactement ce qu'on attend d'une comete.
//
// Consequence du falloff lineaire : a = mu/r donc v = sqrt(mu), constante. Le
// soleil etant lui en inverse du carre, ses satellites retrouvent le
// v = sqrt(mu/r) keplerien : leurs vitesses decroissent bien en 1/sqrt(r).

import { fieldStrength } from "./gravity.js";

const UP = [0, 1, 0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];

function rotateAbout(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross(k, v);
  const kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
          v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
          v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

export function buildOrbits(bodies) {
  const byBody = new Map();
  for (const b of bodies) if (b.bodyName) byBody.set(b.bodyName, b);

  const states = new Map();
  for (const b of bodies) {
    const o = b.orbit;
    const p0 = (b.bodyPosition || b.position).slice();
    if (!o || !o.primary || !byBody.has(o.primary) || byBody.get(o.primary) === b) {
      states.set(b, { kind: "static", pos: p0, p0 });
      continue;
    }
    const primary = byBody.get(o.primary);
    const c0 = primary.bodyPosition || primary.position;
    const rVec = sub(p0, c0);
    const r = len(rVec);
    if (r < 1e-6) { states.set(b, { kind: "static", pos: p0, p0 }); continue; }

    const k = o.impulseScalar ?? 1;
    const vCirc = Math.sqrt(Math.max(fieldStrength(primary, r) * r, 0));
    let vDir = cross(rVec, UP);
    if (len(vDir) < 1e-6) vDir = cross(rVec, [1, 0, 0]);
    vDir = norm(vDir);
    if (o.orbitAngle) vDir = rotateAbout(vDir, norm(rVec), o.orbitAngle * Math.PI / 180);

    if (Math.abs(Math.abs(k) - 1) < 1e-3) {
      // circulaire : exact, aucune derive possible
      states.set(b, {
        kind: "circular", primary, radius: r, omega: (vCirc / r) * Math.sign(k || 1),
        u: norm(rVec), v: vDir, phase: 0, pos: p0, p0, speed: vCirc,
      });
    } else {
      // elliptique : integration
      states.set(b, {
        kind: "integrated", primary, pos: p0, p0,
        vel: scale(vDir, vCirc * k), speed: Math.abs(vCirc * k), radius: r,
      });
    }
  }

  // profondeur : un primaire doit etre avance avant ses satellites
  const depth = (b, d = 0) => {
    const s = states.get(b);
    return (!s || !s.primary || d > 8) ? d : depth(s.primary, d + 1);
  };
  const order = [...states.keys()].sort((a, b) => depth(a) - depth(b));
  return { states, byBody, order };
}

/** Avance toutes les orbites de dt secondes. */
export function advance(orbits, dt) {
  for (const b of orbits.order) {
    const s = orbits.states.get(b);
    if (s.kind === "static") continue;
    const c = orbits.states.get(s.primary).pos;

    if (s.kind === "circular") {
      s.phase += s.omega * dt;
      const cs = Math.cos(s.phase), sn = Math.sin(s.phase);
      s.pos = add(c, add(scale(s.u, s.radius * cs), scale(s.v, s.radius * sn)));
    } else {
      // Verlet vitesse : l'acceleration vient du champ du primaire, le meme
      // modele que pour le joueur
      const acc = (p) => {
        const d = sub(c, p);
        const r = len(d) || 1e-6;
        return scale(scale(d, 1 / r), fieldStrength(s.primary, r));
      };
      const a0 = acc(s.pos);
      s.pos = add(s.pos, add(scale(s.vel, dt), scale(a0, 0.5 * dt * dt)));
      const a1 = acc(s.pos);
      s.vel = add(s.vel, scale(add(a0, a1), 0.5 * dt));
    }
  }
}

export function currentPosition(orbits, body) {
  const s = orbits.states.get(body);
  return s ? s.pos : (body.bodyPosition || body.position);
}

/** Periode orbitale en secondes (orbites circulaires uniquement). */
export function period(orbits, body) {
  const s = orbits.states.get(body);
  return (!s || s.kind !== "circular" || !s.omega)
    ? null : Math.abs((2 * Math.PI) / s.omega);
}
