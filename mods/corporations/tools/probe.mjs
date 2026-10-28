// (M3) Also: selling short (random, at 60-day highs and lows, companies in
// trouble), trading on perfect tips (earnings one-offs, crises, arranged
// tenders: gross, and net of the expected insider-trading fine), and the
// board's "demand more" on a buyout with a 5% stake bought after the bid.
// Strategy probe (from the M1 survey): does a trader beat the market by
// buying on buyout announcements, buying companies at the bottom of their
// 60-day range, or (M2) at the top of it (momentum)? Prints each strategy's
// mean return against random buys.
//   node mods/corporations/tools/probe.mjs [days] [start-day offset]
import { loadMod, newGame } from "../test/world.mjs";
const C = await loadMod(); const game = newGame({ day: 1100000 + Number(process.argv[3] || 0) }); const mod = new C();
mod.on_load(game); mod.on_enter(game, "Sol");
const m = () => mod.market;
const days = Number(process.argv[2] || 4000);
const pending = new Map(); const arb = [];
const lows = [], rnd = [], highs = []; const openLow = [], openRnd = [], openHigh = [];
let idx0 = null; const idxYear = [];
let seed = 7; const r = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const vols = [];
let suitorsSeen = 0, completed = 0, dropped = 0;
let divYield = [];
// (M3) Shorts, tips and the board.
const openShorts = [], shortRes = { rnd: [], hi: [], lo: [], trouble: [] };
const tipOpen = [], tipRes = { earnings: [], crisis: [], tender: [] };
const seenPlan = new Set(), seenTender = new Set();
const demandRes = [];
const { newGame: ng } = await import("../test/world.mjs");
const shadow = ng();
const fineRate = (kind) => { const t = m().tips_desk; return t.CAUGHT / 100 * (kind === "crisis" ? t.FINE_CRISIS : t.FINE) * 2; };
const FEES = 0.02;
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
    if (pos > 0.95) openHigh.push({ id: c.id, p: c.price, d });
    if (r() < 0.02) openRnd.push({ id: c.id, p: c.price, d });
  }
  for (const [arr, out] of [[openLow, lows], [openRnd, rnd], [openHigh, highs]]) {
    for (let i = arr.length - 1; i >= 0; i--) if (d - arr[i].d >= 30) {
      const c = M.companies.find((x) => x.id === arr[i].id);
      out.push(c ? (c.price / arr[i].p - 1) : -1); arr.splice(i, 1);
    }
  }
  // Shorts (M3): opened every 5 days, closed after 30.
  if (d % 5 === 0) for (const c of M.companies) {
    if (!c.listed() || c.owner !== 0 || c.history.length < 60) continue;
    const pos = M.range_position(c);
    const kind = c.status !== 0 ? "trouble" : pos > 0.95 ? "hi" : pos < 0.05 ? "lo" : (r() < 0.02 ? "rnd" : null);
    if (kind) openShorts.push({ c, p: c.price, d, kind, hard: c.status !== 0 });
  }
  for (let i = openShorts.length - 1; i >= 0; i--) {
    const o = openShorts[i]; const c = o.c;
    const closed = c.status === 4 ? c.offer || c.price : c.price;
    if (d - o.d >= 30 || !c.listed()) {
      const borrow = (d - o.d) * M.shorts_desk.RATE * (o.hard ? M.shorts_desk.HARD : 1);
      shortRes[o.kind].push(1 - closed / o.p - FEES - borrow);
      openShorts.splice(i, 1);
    }
  }
  // Perfect tips: one-offs just decided, crises just planned, tenders' favourites (arranged, as a tip does).
  for (const c of M.companies) if (c.listed() && c.surprise !== 0 && c.surprise_at - M.day === M.tips_desk.SURPRISE_DAYS && !tipOpen.some((t) => t.c === c && t.kind === "earnings"))
    tipOpen.push({ kind: "earnings", c, dir: Math.sign(c.surprise), p: c.price, until: c.surprise_at + 1 });
  for (const p of M.crisis_plan) if (!seenPlan.has(p)) {
    seenPlan.add(p); const [day, id] = p.split("|").map(Number); const c = M.by_id.get(id);
    if (c) tipOpen.push({ kind: "crisis", c, dir: -1, p: c.price, until: day + 10 });
  }
  for (const k of M.contracts) if (k.kind === 4 && k.status === 0 && !seenTender.has(k.id) && k.closes - M.day >= 3) {
    seenTender.add(k.id); const f = M.favourite(k);
    if (f.id) { M.tender_fixed.set(k.id, f.id); tipOpen.push({ kind: "tender", c: f, dir: 1, p: f.price, until: k.closes + 1 }); }
  }
  for (let i = tipOpen.length - 1; i >= 0; i--) {
    const t = tipOpen[i];
    if (M.day >= t.until || !t.c.listed()) {
      const gross = t.dir * (t.c.price / t.p - 1) - FEES - (t.dir < 0 ? (M.day - (t.until - 11)) * M.shorts_desk.RATE : 0);
      tipRes[t.kind].push(gross);
      tipOpen.splice(i, 1);
    }
  }
  // The board: a 5% stake bought just after a bid, then "demand more".
  for (const c of M.companies) if (c.suitor > 0 && c.offer_day - M.day === 7 && c.owner === 0) {
    const M2 = new (M.constructor)(); M2.decode(M.encode());
    const t = M2.by_id.get(c.id); const n = Math.round(t.shares * 0.05);
    const cost = t.price * (1 + M2.impact(t, n) / 2) * n * 1.01;
    M2.holdings.set(t.id, n);
    M2.board.demand(shadow, M2, t, M.day);
    if (t.suitor > 0) M2.complete_buyout(shadow, t, M.day + 7);
    const value = t.status === 4 ? t.offer * n : t.price * (1 - M2.impact(t, n) / 2) * n * 0.99;
    demandRes.push(value / cost - 1);
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
console.log("buy-at-60d-low 30d ret", avg(lows).toFixed(4), "n", lows.length, " buy-at-60d-high 30d ret", avg(highs).toFixed(4), "n", highs.length, " random 30d ret", avg(rnd).toFixed(4), "n", rnd.length);
const sd = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };
console.log("risk: arb sd", sd(arb.map((x) => x.ret)).toFixed(3), "losing", (arb.filter((x) => x.ret < 0).length / (arb.length || 1)).toFixed(2), "| low sd", sd(lows).toFixed(3), "losing", (lows.filter((x) => x < 0).length / (lows.length || 1)).toFixed(2), "| random sd", sd(rnd).toFixed(3));
console.log("index by year", idxYear.map(x => x.toFixed(0)).join(" "));
console.log("mean |30d change|", avg(vols).toFixed(3), " mean div yield (payers)", avg(divYield).toFixed(3));
const fmt = (a) => `${(avg(a) * 100).toFixed(1)}% (n ${a.length}, losing ${(a.filter((x) => x < 0).length / (a.length || 1)).toFixed(2)})`;
console.log("shorts 30d: random", fmt(shortRes.rnd), "| at 60d high", fmt(shortRes.hi), "| at 60d low", fmt(shortRes.lo), "| in trouble (no borrow: not allowed)", fmt(shortRes.trouble));
for (const k of ["earnings", "crisis", "tender"]) console.log(`perfect tip (${k}): gross ${fmt(tipRes[k])}, net of the expected fine ${(avg(tipRes[k].map((x) => x - fineRate(k))) * 100).toFixed(1)}%`);
console.log("board: 5% after a bid, demand more:", fmt(demandRes));
if (process.argv.includes("news")) { const news = m().news.slice(-40).map(x=>x.split("|")[1]); console.log(news.join("\n")); }
