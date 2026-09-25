#!/usr/bin/env node
// La fin de boucle du portage, horodatee, a comparer a celle de l'alpha
// (`CHOIX=s scripts/alpha-reveil.sh 25 130 0.5 1075 work/alpha-fin`).
//
//   node scripts/pw-fin.mjs [prefixe] [t_boucle_s] [duree_s] [pas_s]
//
// Le titre est traverse par « Skip Intro », comme dans l'alpha : c'est la
// seule entree qui donne les codes de lancement, et sans eux `TimeLoop.Start`
// suspend la supernova. La boucle est ensuite AVANCEE a `t_boucle` plutot
// qu'attendue dix-huit minutes ; chaque image note l'instant de boucle, pas
// l'heure murale, parce que c'est lui que l'on compare.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serveur, navigateur, demarrer, prechauffer } from "./pw-commun.mjs";

const [prefixe = "work/web-fin/", tBoucle = "1060", duree = "130", pas = "0.5"] =
  process.argv.slice(2);
mkdirSync(dirname(prefixe + "x"), { recursive: true });
const s = await serveur();
const ctx = await navigateur({ largeur: 640, hauteur: 360 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("ERREUR", e.message));
// « Skip Intro » : la troisieme ligne (2), la verrouillee sautee.
await demarrer(page, { avant: 2 });
await prechauffer(page);
await page.evaluate((t) => { window.__loop.elapsed = t; }, +tBoucle);
const t0 = Date.now();
for (let i = 0; Date.now() - t0 < +duree * 1000; i++) {
  await page.waitForTimeout(Math.max(0, t0 + i * +pas * 1000 - Date.now()));
  const etat = await page.evaluate(() => {
    const l = window.__loop, d = window.__death, st = window.__supernova;
    return {
      t: Math.round(l.elapsed * 10) / 10,
      boucle: l.loopCount,
      prevenue: l.preventSupernova,
      soleil: st && st.stage && st.stage.state ? st.stage.state.phase || null : null,
      mort: !!(d && d.dead), phase: d && d.dead && d.state ? d.state.phase : null,
    };
  });
  const f = `${prefixe}${String(i).padStart(4, "0")}.png`;
  await page.screenshot({ path: f });
  console.log(i, JSON.stringify(etat));
}
await ctx.close();
s.close();

