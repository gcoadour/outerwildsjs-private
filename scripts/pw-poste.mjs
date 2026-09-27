#!/usr/bin/env node
// Le portage au poste de pilotage, pour le comparer a l'alpha assise
// (ALPHA_CABINE=1 scripts/alpha.sh, docs/132) : combinaison, poste, puis la
// vue d'atterrissage, une capture a chaque etape.
//
//   node scripts/pw-poste.mjs [prefixe] [largeur] [hauteur]
import { serveur, navigateur, demarrer } from "./pw-commun.mjs";

const [prefixe = "work/web-poste", L = "1280", H = "720"] = process.argv.slice(2);
const s = await serveur();
const ctx = await navigateur({ largeur: +L, hauteur: +H });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERREUR", e.message));
await demarrer(page);
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
await ctx.close();
s.close();
