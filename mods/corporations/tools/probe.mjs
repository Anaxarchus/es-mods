// Strategy probe (from the M1 survey): does a trader beat the market by
// buying on buyout announcements, or buying companies at the bottom of their
// 60-day range? Prints each strategy's mean return against random buys.
//   node mods/corporations/tools/probe.mjs [days] [start-day offset]
import { loadMod, newGame } from "../test/world.mjs";
const C = await loadMod(); const game = newGame({ day: 1100000 + Number(process.argv[3] || 0) }); const mod = new C();
mod.on_load(game); mod.on_enter(game, "Sol");
const m = () => mod.market;
const days = Number(process.argv[2] || 4000);
const pending = new Map(); const arb = [];
const lows = [], rnd = []; const openLow = [], openRnd = [];
let idx0 = null; const idxYear = [];
let seed = 7; const r = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const vols = [];
let suitorsSeen = 0, completed = 0, dropped = 0;
let divYield = [];
for (let d = 1; d <= days; d++) {
  game.day_ += 1; mod.on_day(game, game.day_);
  const M = m();
  for (const c of M.companies) {
    if (c.suitor > 0 && !pending.has(c.id)) { pending.set(c.id, { buy: c.price, offer: c.offer, day: d }); suitorsSeen++; }
  }
  for (const [id, p] of [...pending]) {
    const c = M.by_id.get ? M.by_id.get(id) : M.by_id[id];
    if (!c) { pending.delete(id); continue; }
    if (c.status === 4) { arb.push({ ret: p.offer / p.buy - 1, days: d - p.day }); completed++; pending.delete(id); }
    else if (c.suitor === 0) { arb.push({ ret: c.price / p.buy - 1, days: d - p.day }); dropped++; pending.delete(id); }
  }
  if (d % 5 === 0) for (const c of M.companies) {
    if (!c.listed() || c.history.length < 60) continue;
    const pos = M.range_position(c);
    if (pos < 0.05) openLow.push({ id: c.id, p: c.price, d });
    if (r() < 0.02) openRnd.push({ id: c.id, p: c.price, d });
  }
  for (const [arr, out] of [[openLow, lows], [openRnd, rnd]]) {
    for (let i = arr.length - 1; i >= 0; i--) if (d - arr[i].d >= 30) {
      const c = M.companies.find((x) => x.id === arr[i].id);
      out.push(c ? (c.price / arr[i].p - 1) : -1); arr.splice(i, 1);
    }
  }
  if (d % 365 === 0) { idxYear.push(M.index); }
  if (d % 30 === 0) for (const c of M.companies) if (c.listed() && c.history.length > 31) {
    vols.push(Math.abs(c.history[c.history.length-1] / c.history[c.history.length-31] - 1));
    if (c.dividend > 0) divYield.push(c.dividend * 365 / 30 / c.price);
  }
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
console.log("suitors", suitorsSeen, "completed", completed, "dropped", dropped);
console.log("arb mean ret", avg(arb.map(x => x.ret)).toFixed(3), "mean days", avg(arb.map(x=>x.days)).toFixed(1), "worst", Math.min(...arb.map(x=>x.ret)).toFixed(3));
console.log("buy-at-60d-low 30d ret", avg(lows).toFixed(4), "n", lows.length, " random 30d ret", avg(rnd).toFixed(4), "n", rnd.length);
const sd = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
console.log("risk: arb sd", sd(arb.map((x) => x.ret)).toFixed(3), "losing", (arb.filter((x) => x.ret < 0).length / (arb.length || 1)).toFixed(2), "| low sd", sd(lows).toFixed(3), "losing", (lows.filter((x) => x < 0).length / (lows.length || 1)).toFixed(2), "| random sd", sd(rnd).toFixed(3));
console.log("index by year", idxYear.map(x => x.toFixed(0)).join(" "));
console.log("mean |30d change|", avg(vols).toFixed(3), " mean div yield (payers)", avg(divYield).toFixed(3));
if (process.argv.includes("news")) { const news = m().news.slice(-40).map(x=>x.split("|")[1]); console.log(news.join("\n")); }
