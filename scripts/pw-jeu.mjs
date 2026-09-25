#!/usr/bin/env node
// Capture le debut de partie du portage, image par image, pour le comparer a
// l'alpha (scripts/alpha.sh) : titre traverse par « New Expedition », puis une
// capture toutes les `pas` secondes APRES que la partie est prete.
//
//   node scripts/pw-jeu.mjs [prefixe] [largeur] [hauteur] [pas_s] [nombre]
import { serveur, navigateur, demarrer } from "./pw-commun.mjs";

const [prefixe = "work/web-jeu", L = "640", H = "360", pas = "5", nombre = "8"] =
  process.argv.slice(2);
const s = await serveur();
const ctx = await navigateur({ largeur: +L, hauteur: +H });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERREUR", e.message));
await demarrer(page);
const t0 = Date.now();
for (let i = 1; i <= +nombre; i++) {
  await page.waitForTimeout(Math.max(0, t0 + i * +pas * 1000 - Date.now()));
  const etat = await page.evaluate(() => ({
    t: window.__loop ? Math.round(window.__loop.elapsed * 10) / 10 : null,
    regard: window.__regardCam ? window.__regardCam() : null,
  }));
  await page.screenshot({ path: `${prefixe}${i}.png` });
  console.log(i, JSON.stringify(etat));
}
await ctx.close();
s.close();
