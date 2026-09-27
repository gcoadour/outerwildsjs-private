#!/usr/bin/env node
// Le portage au poste de pilotage, pour le comparer a l'alpha assise
// (ALPHA_CABINE=1 scripts/alpha.sh, docs/132) : combinaison, poste, puis la
// vue d'atterrissage, une capture a chaque etape.
//
//   node scripts/pw-poste.mjs [prefixe] [largeur] [hauteur]
import { serveur, navigateur, demarrer, prechauffer } from "./pw-commun.mjs";

const [prefixe = "work/web-poste", L = "1280", H = "720"] = process.argv.slice(2);
const s = await serveur();
const ctx = await navigateur({ largeur: +L, hauteur: +H });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERREUR", e.message));
if (process.env.PW_JOURNAL) page.on("console", (m) => { const t = m.text(); if (new RegExp(process.env.PW_JOURNAL, "i").test(t)) console.log("  |", t.slice(0, 160)); });
await demarrer(page);
await prechauffer(page);
// Le placement dans une zone du vaisseau, celui de tools/15_verify.py : la
// zone ramenee du repos du vaisseau a sa pose vivante, puis posee au sol de
// la cabine par un rayon, le regard dans l'axe de la zone.
await page.evaluate(() => {
  const s = window.__shipRef, eq = window.__lots.equipment, agg = window.__player.body;
  eq.suit = true; eq.probe = true; eq.minimap = true;
  const rest = window.__shipRest, q = window.__shipRestRot, sc = BABYLON.EngineStore.LastCreatedScene;
  const rot = (q, v) => { const [x, y, zz, w] = q; const tx = 2 * (y * v[2] - zz * v[1]), ty = 2 * (zz * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - zz * ty), v[1] + w * ty + (zz * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]; };
  const z = window.__interactables.items.find((i) => i.kind === "zone" && i.name === "FlightConsole" && i.body === "Ship_Body");
  const inv = [-q[0], -q[1], -q[2], q[3]], a = s.axes;
  const cadre = (v) => [0, 1, 2].map((i) => v[0] * a.right[i] + v[1] * a.up[i] + v[2] * a.fwd[i]);
  const C = cadre(rot(inv, [z.world[0] - rest[0], z.world[1] - rest[1], z.world[2] - rest[2]])).map((v, i) => v + s.pos[["x", "y", "z"][i]]);
  const de = new BABYLON.Vector3(C[0] + a.up[0] * 0.5, C[1] + a.up[1] * 0.5, C[2] + a.up[2] * 0.5);
  const r = sc.getPhysicsEngine().raycast(de, de.add(new BABYLON.Vector3(...a.up).scale(-4)));
  const P = r.hasHit ? [0, 1, 2].map((i) => [r.hitPointWorld.x, r.hitPointWorld.y, r.hitPointWorld.z][i] + a.up[i] * 0.65) : C;
  agg.transformNode.position.set(P[0], P[1], P[2]); agg.body.disablePreStep = false;
  agg.body.setLinearVelocity(BABYLON.Vector3.Zero());
  const F = cadre(rot(inv, rot(z.rotation, [0, 0, 1])));
  const cam = sc.activeCamera, f = cam.getDirection(BABYLON.Axis.Z), U = cam.upVector.clone().normalize();
  const { yaw, pitch } = window.__regardCam();
  const cp = Math.cos(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw); const h = f.add(U.scale(Math.sin(pitch))).scale(1 / cp);
  const N = h.scale(cy).subtract(BABYLON.Vector3.Cross(U, h).scale(sy)); const E = BABYLON.Vector3.Cross(U, N);
  const Fv = new BABYLON.Vector3(...F); const Fh = Fv.subtract(U.scale(BABYLON.Vector3.Dot(Fv, U))).normalize();
  window.__look(Math.atan2(BABYLON.Vector3.Dot(Fh, E), BABYLON.Vector3.Dot(Fh, N)), 0);
});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${prefixe}-debout.png` });
// PW_ARRIERE=<degres> : debout devant le poste, le regard tourne de ce lacet
// — l'arriere de la cabine, ordinateur, reacteur et trappe (docs/132).
if (process.env.PW_ARRIERE) {
  // PW_RECUL=<unites> : reculer d'abord vers l'arriere du vaisseau.
  await page.evaluate((recul) => {
    const s = window.__shipRef, a = s.axes, agg = window.__player.body, p = agg.transformNode.position;
    p.set(p.x - a.fwd[0] * recul, p.y - a.fwd[1] * recul, p.z - a.fwd[2] * recul);
    agg.body.disablePreStep = false;
  }, +(process.env.PW_RECUL || 0));
  await page.waitForTimeout(1500);
  await page.evaluate((deg) => { const r = window.__regardCam(); window.__look(r.yaw + deg * Math.PI / 180, 0); },
                      +process.env.PW_ARRIERE);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${prefixe}-arriere.png` });
  if (process.env.PW_LUMIERES) console.log(JSON.stringify(await page.evaluate(() => {
    const L = window.__world.lighting, p = window.__player.pos;
    return [...L.live].map(([l, n]) => ({ nom: l.name, corps: l.body, i: n.intensity,
      d: n.position ? Math.round(Math.hypot(n.position.x - p.x, n.position.y - p.y, n.position.z - p.z) * 10) / 10 : null }));
  })));
  // Ce qui est sous quelques points de l'ecran : tous les maillages touches.
  console.log(JSON.stringify(await page.evaluate(() => {
    const sc = BABYLON.EngineStore.LastCreatedScene, out = {};
    for (const [x, y] of [[640, 120], [520, 300], [800, 450]]) {
      const r = sc.multiPick(x, y, (m) => m.isVisible && m.isEnabled()) || [];
      out[`${x},${y}`] = r.slice(0, 5).map((h) => ({ m: h.pickedMesh.name, mat: h.pickedMesh.material && h.pickedMesh.material.name,
        a: h.pickedMesh.material && +(h.pickedMesh.material.alpha ?? 1).toFixed(2), d: +h.distance.toFixed(2) }));
    }
    return out;
  }), null, 1));
  await ctx.close(); s.close(); process.exit(0);
}
for (let i = 0; i < 4 && !(await page.evaluate(() => window.__shipRef.boarded)); i++) {
  await page.keyboard.down("KeyE"); await page.waitForTimeout(400); await page.keyboard.up("KeyE");
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(4000);
await page.screenshot({ path: `${prefixe}-assis.png` });
await page.keyboard.down("KeyR"); await page.waitForTimeout(400); await page.keyboard.up("KeyR");
await page.waitForTimeout(6000);
await page.screenshot({ path: `${prefixe}-vue.png` });
console.log(await page.evaluate(() => [...document.querySelectorAll(".ow-prompt")]
  .map((d) => d.textContent.trim())));
// Retour a la vue du pilote, decollage (`Move Up`, Maj gauche), puis le
// regard vers le sol et le verrou (`Lock On`, clic gauche) : la comparaison
// en vol avec l'alpha (docs/132).
const vue = () => page.evaluate(() => ({ on: window.__atterrissage.on, tr: window.__atterrissage.transition,
  mode: window.__modes && window.__modes.mode }));
if (process.env.PW_ALLUMAGE) console.log("  vue avant R", JSON.stringify(await vue()));
await page.keyboard.down("KeyR"); await page.waitForTimeout(400); await page.keyboard.up("KeyR");
await page.waitForTimeout(3000);
if (process.env.PW_ALLUMAGE) console.log("  vue apres R", JSON.stringify(await vue()));
await page.keyboard.down("ShiftLeft");
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  if (process.env.PW_ALLUMAGE) console.log("  allumage", JSON.stringify(await page.evaluate(() => {
    const s = window.__shipRef;
    return { t: +(s.ignitionTime || 0).toFixed(2), en: !!s.igniting, pose: s.landed, pad: s.onPad,
             parque: s.parked, v: Math.round(Math.hypot(s.vel.x, s.vel.y, s.vel.z)), mode: window.__modes && window.__modes.mode };
  })));
}
console.log("  pendant la poussee", JSON.stringify(await page.evaluate(() => {
  const s = window.__shipRef;
  return { v: Math.round(Math.hypot(s.vel.x, s.vel.y, s.vel.z)), pose: s.landed, pos: Object.values(s.pos).map(Math.round),
           journal: (window.__journalVaisseau || []).slice(-4) };
})));
await page.waitForTimeout(3000);
await page.mouse.move(640, 360);
await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${prefixe}-vol.png` });
await page.keyboard.up("ShiftLeft");
console.log(await page.evaluate(() => ({
  invites: [...document.querySelectorAll(".ow-prompt")].map((d) => d.textContent.trim()),
  cible: window.__visee && window.__visee.current ? window.__visee.current.name : null,
  possible: window.__visee && window.__visee.possible ? window.__visee.possible.name : null,
  vaisseau: Math.round(Math.hypot(window.__shipRef.vel.x, window.__shipRef.vel.y, window.__shipRef.vel.z)),
  assis: window.__shipRef.boarded,
  ecart: (() => { const s = window.__shipRef, c = BABYLON.EngineStore.LastCreatedScene.activeCamera.position;
    return Math.round(Math.hypot(c.x - s.pos.x, c.y - s.pos.y, c.z - s.pos.z)); })(),
  mort: window.__death && window.__death.dead ? `${window.__death.label} (${window.__death.state.phase})` : false,
  sante: window.__lots && window.__lots.resources ? Math.round(window.__lots.resources.health) : null,
  regard: (() => { const s = window.__shipRef, a = s.axes, d = BABYLON.EngineStore.LastCreatedScene.activeCamera.getDirection(BABYLON.Axis.Z);
    return [a.right, a.up, a.fwd].map((v) => +(v[0] * d.x + v[1] * d.y + v[2] * d.z).toFixed(2)); })(),
  coque: (() => { const n = window.__shipRef.node; if (!n) return null; const m = n.getChildMeshes ? n.getChildMeshes() : [];
    return [m.length, m.filter((x) => x.isEnabled() && x.isVisible).length]; })(),
  pos: Object.values(window.__shipRef.pos).map(Math.round),
})));
await ctx.close();
s.close();
