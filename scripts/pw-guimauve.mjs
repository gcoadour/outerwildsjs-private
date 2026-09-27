#!/usr/bin/env node
// Le feu de camp du portage, a comparer a l'alpha (docs/132) : au reveil,
// quelques pas vers le feu, E, puis le baton et la guimauve a 4, 12 et 22 s
// — les instants des captures de l'alpha native.
//
//   node scripts/pw-guimauve.mjs [prefixe] [marche_ms]
import { serveur, navigateur, demarrer, prechauffer } from "./pw-commun.mjs";

const [prefixe = "work/web-guimauve", marche = "1500"] = process.argv.slice(2);
const s = await serveur();
const ctx = await navigateur({ largeur: 1280, hauteur: 720 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERREUR", e.message));
page.on("console", (m) => { const t = m.text(); if (/annonce|baton|guimauve|Roast|grill|parler|dialogue/i.test(t)) console.log("  |", t.slice(0, 140)); });
await demarrer(page);
await prechauffer(page);
// Deux unites du feu, sur la ligne qui mene du joueur au point de
// `RoastPromptEvent` : marcher a deux images par seconde n'avance pas.
const place = await page.evaluate(() => {
  const agg = window.__player.body, p = agg.transformNode.position;
  if (!window.__versCadre) return null;
  // Le feu le PLUS PROCHE : il y en a huit, et le premier de la liste est
  // a soixante-dix unites du reveil.
  let inv = null, F = null, best = Infinity;
  for (const x of window.__casque.invitesGuimauve || []) {
    const q = window.__versCadre(x.position, x.body);
    const d = Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
    if (d < best) { best = d; inv = x; F = q; }
  }
  if (!inv) return null;
  const d = [p.x - F[0], p.y - F[1], p.z - F[2]], l = Math.hypot(...d) || 1;
  p.set(F[0] + d[0] / l * 2, F[1] + d[1] / l * 2 + 0.5, F[2] + d[2] / l * 2);
  agg.body.disablePreStep = false;
  agg.body.setLinearVelocity(BABYLON.Vector3.Zero());
  return { distance: inv.distance, avant: Math.round(l * 10) / 10 };
});
console.log("place", JSON.stringify(place));
// Le regard sur le feu, sous le reticule : l'invite est celle d'un
// `InteractVolume` (`RoastPromptEvent`), qu'on vise pour la voir.
await page.evaluate((p) => { const r = window.__regardCam(); window.__look(r.yaw, p); },
                    -(+(process.env.PW_TANGAGE || 40)) * Math.PI / 180);
const tenir = async (code, ms) => { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); };
await page.screenshot({ path: `${prefixe}-0.png` });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${prefixe}-1.png` });
console.log("invites", JSON.stringify(await page.evaluate(() =>
  [...document.querySelectorAll(".ow-prompt")].map((d) => d.textContent.trim()))));
await tenir("KeyE", 500);
console.log("volume", JSON.stringify(await page.evaluate(() => {
  const it = window.__interactables.items.filter((i) => /Roast/.test(i.prompt || ""));
  return it.slice(0, 2).map((i) => ({ kind: i.kind, nom: i.name, servi: i.interagi ?? null,
    visible: window.__interactables.inviteVisible ? window.__interactables.inviteVisible(i) : null }));
})));
for (let k = 0; k < 4; k++) {
  await page.waitForTimeout(1000);
  console.log("pullout", JSON.stringify(await page.evaluate(() => {
    const g = window.__mains.enMain.get("marshmallowstick").parNom.get("PullOut");
    return { play: g.isPlaying, n: g.animatables.length, frames: g.animatables.slice(0, 3).map((a) => +a.masterFrame.toFixed(1)),
             speed: g.speedRatio, loop: g.loopAnimation, weight: g.weight, t: +window.__loop.elapsed.toFixed(2) };
  })));
}
await page.waitForTimeout(3000);
console.log("baton", JSON.stringify(await page.evaluate(() => {
  const sc = BABYLON.EngineStore.LastCreatedScene;
  const r = sc.getTransformNodeByName("main_marshmallowstick");
  const ms = r ? r.getChildMeshes(false) : [];
  return { racine: !!r, actif: r && r.isEnabled(), visibles: ms.filter((m) => m.isEnabled() && m.isVisible).length, total: ms.length,
    anims: sc.animationGroups.filter((g) => g.isPlaying).map((g) => g.name).slice(0, 5),
    pos: r ? [r.position.x, r.position.y, r.position.z].map((v) => +v.toFixed(2)) : null,
    cam: { minZ: sc.activeCamera.minZ, masque: sc.activeCamera.layerMask >>> 0 },
    cameras: (sc.activeCameras || []).map((c) => c.name),
    etat: { out: window.__mains.baton.out, clip: window.__mains.baton.clip, flame: window.__mains.baton.flame },
    clips: window.__mains.enMain.get("marshmallowstick").groupes.map((g) => [g.name, g.isPlaying, g.isStarted, +g.from.toFixed(1), +g.to.toFixed(1), g.animatables[0] ? +g.animatables[0].masterFrame.toFixed(1) : null]),
    guimauve: (() => { const g = window.__consoles.marshmallow; return { gone: g.gone, toast: g.toast, held: g.held, eaten: g.eaten, aflame: g.aflame }; })(),
    maillages: ms.map((m) => { m.computeWorldMatrix(true); const c = sc.activeCamera;
      const p = m.getBoundingInfo().boundingSphere.centerWorld;
      const v = p.subtract(c.globalPosition || c.position);
      return { n: m.name, vis: m.isEnabled() && m.isVisible, masque: m.layerMask >>> 0,
               d: +v.length().toFixed(2), devant: +BABYLON.Vector3.Dot(v, c.getDirection(BABYLON.Axis.Z)).toFixed(2),
               r: +m.getBoundingInfo().boundingSphere.radiusWorld.toFixed(2) }; }) };
})));
for (const [i, t] of [[3, 4], [4, 12], [5, 22]]) {
  await page.waitForFunction((t0) => window.__loop.elapsed >= t0, await page.evaluate((d) => window.__loop.elapsed + d, t - (i === 3 ? 0 : i === 4 ? 4 : 12)), { timeout: 120000 }).catch(() => {});
  await page.screenshot({ path: `${prefixe}-${i}.png` });
}
await ctx.close();
s.close();
