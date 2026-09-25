#!/usr/bin/env node
// Capture l'ecran-titre du portage, a comparer a celui de l'alpha.
//
//   node scripts/pw-titre.mjs [sortie.png] [largeur] [hauteur] [attente_ms] [t_titre]
//
// `t_titre` cale l'horloge des rotations du titre sur un instant donne, pour
// comparer a une capture de l'alpha prise au meme moment apres le chargement.
import { serveur, navigateur, PORT, ZIP_PATH } from "./pw-commun.mjs";

const [sortie = "work/web-titre.png", L = "1280", H = "720", attente = "20000", tTitre = ""] = process.argv.slice(2);
const s = await serveur();
const ctx = await navigateur({ largeur: +L, hauteur: +H });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERREUR", e.message));
page.on("console", (m) => { if (/titre|erreur|error/i.test(m.text())) console.log("[page]", m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => {
  const done = document.getElementById("gate-step-done");
  const drop = document.getElementById("gate-step-drop");
  return (done && !done.hidden) || (drop && !drop.hidden);
});
const extrait = await page.evaluate(async () => {
  const { vfs } = await import("./src/vfs.js");
  return vfs.exists("data/titre/titre.json");
});
if (!extrait) {
  await (await page.$("#gate-file")).setInputFiles(ZIP_PATH);
  await page.waitForSelector("#gate-summary table", { timeout: 600000 });
}
await page.click("#gate-play");
await page.waitForFunction(() => window.__titre || window.__ready, null, { timeout: 120000 });
await page.waitForTimeout(+attente);
if (tTitre !== "") {
  await page.evaluate((t) => { if (window.__titre) window.__titre.t0 = performance.now() / 1000 - t; }, +tTitre);
  // deux images : la premiere applique l'horloge, la seconde est capturee
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const etat = await page.evaluate(() => window.__titre && ({
  index: window.__titre.menu.index, locked: window.__titre.menu.locked,
  geometrie: !!window.__titre.geometrie,
}));
console.log(JSON.stringify(etat));
await page.screenshot({ path: sortie });
console.log("capture :", sortie);
await ctx.close();
s.close();
