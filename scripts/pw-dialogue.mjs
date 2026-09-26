#!/usr/bin/env node
// La conversation avec le Rocket Scientist, image par image, a comparer a
// celle de l'alpha (docs/132, « Parler, cote a cote »). Le joueur est pose a
// 2,2 m face a lui, sur la droite qui le joint au point d'apparition.
//
//   node scripts/pw-dialogue.mjs [prefixe]
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serveur, navigateur, demarrer, prechauffer } from "./pw-commun.mjs";

const [prefixe = "work/web-dlg/", L = "640", H = "360"] = process.argv.slice(2);
mkdirSync(dirname(prefixe + "x"), { recursive: true });
const s = await serveur();
const ctx = await navigateur({ largeur: +L, hauteur: +H });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERREUR", e.message));
await demarrer(page);
await prechauffer(page);
await page.waitForTimeout(9000);   // le recentrage du reveil
const pose = await page.evaluate(async () => {
  const it = window.__interactables.items.find((x) => x.name === "ConversationZone"
    && x.volume && Math.abs(x.world[2] + 8721) < 1 && Math.abs(x.world[0] - 4) < 1);
  const si = window.__interaction;
  if (!it) return false;
  const r = si.repere(it);
  const sp = si.repere({ world: [-1.38, -26.51, -8721.03], body: "TimberHearth_Body" });
  const d = [sp[0] - r[0], sp[1] - r[1], sp[2] - r[2]], n = Math.hypot(...d) || 1;
  const agg = window.__player.body;
  agg.transformNode.position.set(r[0] + d[0] / n * 2.2, r[1] + d[1] / n * 2.2, r[2] + d[2] / n * 2.2);
  agg.body.disablePreStep = false;
  agg.body.setLinearVelocity(BABYLON.Vector3.Zero());
  await new Promise((res) => setTimeout(res, 1500));
  si.viser(si.repere(it));
  await new Promise((res) => setTimeout(res, 1500));
  return true;
});
console.log("pose", pose);
const cliche = async (nom) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${prefixe}${nom}.png` }); };
await cliche("0-invite");
console.log(await page.evaluate(() => {
  const it = window.__interactables.items.filter((x) => x.name === "ConversationZone").map((x) => x.prompt);
  const c = document.querySelector(".ow-prompts-center");
  return JSON.stringify({ prompts: it.slice(0, 4), centre: c ? c.outerHTML.slice(0, 300) : null,
    vise: window.__interaction.vise && { name: window.__interaction.vise.name, prompt: window.__interaction.vise.prompt } });
}));
for (let i = 1; i <= 5; i++) {
  await page.keyboard.down("KeyE"); await page.waitForTimeout(300); await page.keyboard.up("KeyE");
  await cliche(`${i}-e`);
  if (i === 2) console.log(await page.evaluate(() => JSON.stringify({ opts: document.querySelector(".dlg-opts").outerHTML.slice(0, 400), v: window.__dialogue.view && window.__dialogue.view.options })));
  if (i === 1) console.log(await page.evaluate(() => { const a = window.__dialogue.active; if (!a) return "rien";
    const c = a.convo; return JSON.stringify({ idx: c.index, name: c.name, pos: c.position, ctrl: c.controller && (c.controller.cls || c.controller.name || c.controller), tree: a.tree && (a.tree.id || a.tree.name), branch: a.branchId }); }));
}
await ctx.close();
s.close();
