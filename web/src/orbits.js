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

// @autrement OWRigidbody : vingt-neuf methodes qui transmettent a un Rigidbody
// de PhysX, la ou ce portage a Havok et son propre integrateur. Les refaire une
// par une serait reecrire un moteur physique pour faire baisser un chiffre.
// @autrement InertiaTensorCalibrator : Havok calcule nativement les tenseurs d'inertie des corps rigides
// @lit OWRigidbody, InitialMotion, InitialVelocity, InertiaTensorCalibrator
// Les corps mobiles et leur mouvement de depart.

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

/** Rotation d'un vecteur par un quaternion [x, y, z, w]. */
function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + y * tz - z * ty,
          vy + w * ty + z * tx - x * tz,
          vz + w * tz + x * ty - y * tx];
}

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
      // `CalculateInitVelocity` commence par un terme qui n'a rien d'orbital :
      //
      //     v = _initLinearDirection.normalized * _initLinearSpeed;
      //     if (_primaryBody != null) v += ... orbite ...
      //
      // TROIS CORPS N'ONT QUE CELUI-LA, et ce sont les jumelles du sablier :
      // `Twin01_Body` a +31,65 en x, `Twin02_Body` et `SandFunnel_Body` ont
      // -31,65. Aucun primaire : elles tournent l'une autour de l'AUTRE.
      //
      // Le chiffre le dit. Elles sont a 500 unites, chacune a 250 du
      // barycentre, et le champ de sa voisine y vaut 4 : la vitesse d'une
      // orbite mutuelle circulaire est `sqrt(4 x 250)` = 31,62. Le build en
      // pose 31,65 (docs/120-jumelles.md).
      //
      // Le portage les rendait STATIQUES : le sablier ne coulait pas.
      // `_initLinearDirection` EST DANS LE REPERE DU CORPS, et rien ne le dit
      // — c'est la mesure qui le dit. Les jumelles portent (1,0,0) et
      // (-1,0,0) pour un ecart local le long de (-1,0,-1)/racine(2) : pris
      // tels quels, ces vecteurs sont RADIAUX et les jumelles se percutent.
      // Tournes par la rotation du corps (225 degres autour de Y), ils sont
      // exactement perpendiculaires a l'ecart — le produit scalaire tombe a
      // zero a la quinzieme decimale (docs/120-jumelles.md).
      const vLin = o && o.initLinearSpeed
        ? scale(norm(qrot(b.bodyRotation || b.rotation || [0, 0, 0, 1],
                          [o.initLinearDirection.x, o.initLinearDirection.y,
                           o.initLinearDirection.z])), o.initLinearSpeed)
        : null;
      const parent = b.parentBody && byBody.has(b.parentBody)
        && byBody.get(b.parentBody) !== b ? byBody.get(b.parentBody) : null;
      if (vLin && len(vLin) > 0 && parent) {
        // Le mouvement se lit dans le repere du PARENT, et l'acceleration
        // vient des FRERES — les corps qui partagent ce parent. Le Soleil est
        // commun aux deux jumelles : son attraction est portee par l'orbite du
        // barycentre, pas par leur ecart (docs/120-jumelles.md).
        const cp = parent.bodyPosition || parent.position;
        states.set(b, { kind: "libre", parent, pos: p0, p0,
                        local: sub(p0, cp), vel: vLin, speed: len(vLin) });
      } else states.set(b, { kind: "static", pos: p0, p0 });
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
  // Un parent de hierarchie compte autant qu'un primaire : la position d'une
  // jumelle est celle de son barycentre plus son ecart.
  const depth = (b, d = 0) => {
    const s = states.get(b);
    const p = s && (s.primary || s.parent);
    return (!p || d > 8) ? d : depth(p, d + 1);
  };
  const order = [...states.keys()].sort((a, b) => depth(a) - depth(b));
  return { states, byBody, order };
}

/**
 * Le champ des FRERES, dans le repere du parent.
 *
 * Seuls les corps qui partagent ce parent comptent. Le Soleil ne figure pas
 * dans cette somme, et c'est le point : il tire les deux jumelles ensemble, et
 * cette part-la est deja portee par l'orbite du barycentre. Ce qui reste est ce
 * qui les separe — l'attraction de l'une par l'autre.
 *
 * Le champ DOMINANT plutot que la somme, comme partout ailleurs dans ce jeu
 * ([`04`](../../docs/04-gravite.md)) : avec deux freres seulement, cela revient
 * au meme, et la regle reste celle du build si un troisieme apparaissait.
 */
function siblingField(orbits, self, parent, local) {
  let best = null, bestMag = 0;
  for (const [autre, st] of orbits.states) {
    if (autre === self || autre === parent) continue;
    // UN CORPS A PLUSIEURS ENTREES. Un puits de gravite et un secteur sont des
    // ENFANTS du corps, et chacun donne une ligne : sans ce filtre, une
    // jumelle s'attirerait elle-meme a distance nulle.
    if (autre.bodyName && autre.bodyName === self.bodyName) continue;
    if (st.parent !== parent) continue;
    if (!autre.gravity || !autre.gravity.surfaceAcceleration) continue;
    const d = sub(st.local, local);
    const r = len(d) || 1e-6;
    const mag = fieldStrength(autre, r);
    if (mag > bestMag) { bestMag = mag; best = scale(scale(d, 1 / r), mag); }
  }
  return best || [0, 0, 0];
}

/** Avance toutes les orbites de dt secondes. */
export function advance(orbits, dt) {
  for (const b of orbits.order) {
    const s = orbits.states.get(b);
    if (s.kind === "static") continue;

    if (s.kind === "libre") {
      // L'ecart au parent s'integre seul ; la position monde en decoule. Les
      // freres sont pris a leur ecart COURANT — la voisine bouge aussi.
      const acc = (l) => siblingField(orbits, b, s.parent, l);
      const a0 = acc(s.local);
      s.local = add(s.local, add(scale(s.vel, dt), scale(a0, 0.5 * dt * dt)));
      const a1 = acc(s.local);
      s.vel = add(s.vel, scale(add(a0, a1), 0.5 * dt));
      s.speed = len(s.vel);
      s.pos = add(orbits.states.get(s.parent).pos, s.local);
      continue;
    }

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

/**
 * Vitesse d'un corps dans le repere monde.
 *
 * C'est ce qui manquait au changement de referentiel (docs/36-audit.md §2.4) :
 * la boucle reportait les POSITIONS d'une ancre a l'autre et laissait les
 * vitesses telles quelles. On arrivait donc TOUJOURS a l'arret relatif de sa
 * cible, ce qui supprime une competence entiere — l'egalisation de vitesse
 * avec le referentiel d'arrivee est la quatrieme phase de l'`Autopilot`, et
 * dans le jeu la difficulte centrale du vol.
 *
 * Entre Timber Hearth et sa lune l'ecart vaut environ sqrt(mu) = sqrt(12 x 250)
 * ~ 55 u/s : c'est exactement la vitesse qu'il faut desormais annuler.
 *
 *   circulaire  v = omega x r, plus la vitesse du primaire
 *   integree    la vitesse portee par l'etat
 *   statique    nulle
 */
export function frameVelocity(orbits, body, depth = 0) {
  const s = orbits && orbits.states.get(body);
  if (!s || depth > 8) return [0, 0, 0];
  if (s.kind === "integrated") return s.vel.slice();
  if (s.kind !== "circular") return [0, 0, 0];
  const c = orbits.states.get(s.primary).pos;
  const r = sub(s.pos, c);
  // omega porte par la normale au plan de l'orbite : u x v est unitaire, les
  // deux vecteurs de base l'etant et etant orthogonaux.
  const n = norm(cross(s.u, s.v));
  const w = scale(n, s.omega);
  return add(cross(w, r), frameVelocity(orbits, s.primary, depth + 1));
}
