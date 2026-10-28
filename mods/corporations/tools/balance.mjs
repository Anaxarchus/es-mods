// A balance report: runs the market for N days (default 5000) over human space
// and prints, each year, the shipyards: a player who lands at a random human
// shipyard every few days and buys a hull or two (unless "nobuy"), NPC hull
// sales (C3), the shelves that ran out, the shelf-days spent empty (civil and
// military apart), restocks, and military tenders (C6). At years 5, 10 and 14
// (and the end) it prints every shipbuilder's capacity and load; at the end,
// the largest companies and how many each sector lists.
//   node mods/corporations/tools/balance.mjs [days] [days between landings] [nobuy] [start=<day offset>]
// (start= moves the first day, which seeds the market: another world.)
import { loadMod, newGame, galaxy } from "../test/world.mjs";
const Corporations = await loadMod();
const startArg = process.argv.find((a) => a.startsWith("start="));
const game = newGame({ day: 1100000 + Number(startArg ? startArg.slice(6) : 0) });
const mod = new Corporations();
mod.on_load(game); mod.on_enter(game, "Sol");
const days = Number(process.argv[2] || 5000);
const every = Number(process.argv[3] || 3);
const buy = !process.argv.includes("nobuy");
// The player's own dice, apart from the market's.
let seed = 12345;
const roll = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
const yards = Object.keys(galaxy.planets).filter((p) => galaxy.planets[p].shipyard);
let minL = 99;
let year = { empty: 0, worstEmpty: 0, military: 0, stuck: 0 };
const m = () => mod.market;
const num = (x) => (typeof x === "number" ? x : 0);
let last = { stockouts: 0, restocks: 0, delivered: 0, bought: 0, npc: 0, tenders: 0, awarded: 0, tfailed: 0, hull: 0, earn: 0 };
// Days each military shelf has sat at 0 in a row: the longest is reported.
const zeroRun = new Map();
let maxState = 0;
let longestZero = 0;
// Sector balance (M2): each sector's share of the exchange's value, and its
// earnings each 30 days (the sum of its listed companies' latest reports),
// counting the months it was in profit.
const SECTORS = ["Ships", "Outfits", "Engines", "Electr.", "Consumer", "Mining", "Freight", "Security"];
const profitMonths = Array(8).fill(0), months = { n: 0 };
const yearEarn = Array(8).fill(0);
function sectorValues() {
	const v = Array(8).fill(0);
	for (const c of m().companies) if (c.listed()) v[c.sector] += c.price * c.shares;
	const t = v.reduce((a, b) => a + b, 0) || 1;
	return v.map((x) => x / t);
}
function sectorEarnings() {
	const e = Array(8).fill(0);
	for (const c of m().companies) if (c.listed() && c.earnings.length) e[c.sector] += c.earnings[c.earnings.length - 1];
	return e;
}
console.log(`buying player: ${buy ? "yes" : "no"}`);
console.log("year  bought  npc-sold  ran-out  empty civil (worst)  empty military  longest mil. 0  restocks  delivered  tenders/awarded/failed  on order  avg lead");
for (let d = 1; d <= days; d++) {
	game.day_ += 1;
	mod.on_day(game, game.day_);
	minL = Math.min(minL, m().companies.filter((c) => c.listed()).length);
	if (buy && d % every === 0) {
		const planet = yards[roll(yards.length)];
		game.landed = true; game.planet_ = planet; game.here_ = galaxy.planets[planet].system;
		mod.on_enter(game, game.here_);
		const sold = galaxy.planets[planet].shipyard;
		for (let n = 1 + roll(2); n > 0; n--) {
			const model = sold[roll(sold.length)];
			const have = game.ship_stock(planet, model);
			if (have > 0) game.set_ship_stock(planet, model, have - 1);
		}
		game.landed = false; game.planet_ = "";
	}
	if (d % 30 === 0) {
		const e = sectorEarnings();
		months.n++;
		for (let i = 0; i < 8; i++) { if (e[i] > 0) profitMonths[i]++; yearEarn[i] += e[i]; }
	}
	if (d % 50 === 0) maxState = Math.max(maxState, m().encode().length);
	let empty = 0;
	for (const s of m().shelves) {
		if (s.count < 0 || s.onorder < 0) throw new Error(`day ${d}: ${s.planet} ${s.model} went negative`);
		const key = s.planet + "|" + s.model;
		if (s.count === 0 && m().hulls.military(s.row)) {
			year.military++;
			const run = (zeroRun.get(key) || 0) + 1;
			zeroRun.set(key, run);
			longestZero = Math.max(longestZero, run);
		} else {
			zeroRun.set(key, 0);
			if (s.count === 0) empty++;
		}
	}
	year.empty += empty;
	year.worstEmpty = Math.max(year.worstEmpty, empty);
	const y = Math.ceil(d / 365);
	if (d % 365 === 0 || d === days) {
		const k = m().contracts.filter((x) => x.kind === 3);
		const lead = k.length ? k.reduce((s, x) => s + x.days, 0) / k.length : 0;
		const onorder = m().shelves.reduce((s, x) => s + x.onorder, 0);
		const now = { stockouts: m().stockouts, restocks: m().restocks_ordered, delivered: m().hulls_delivered, bought: m().player_bought, npc: num(m().npc_sold), tenders: num(m().tenders_issued), awarded: num(m().tenders_awarded), tfailed: num(m().tenders_failed), hull: num(m().hull_income_total), earn: num(m().earnings_total) };
		console.log(`${String(y).padStart(4)}  ${String(now.bought - last.bought).padStart(6)}  ${String(now.npc - last.npc).padStart(8)}  ${String(now.stockouts - last.stockouts).padStart(7)}  ${String(year.empty).padStart(11)} (${year.worstEmpty})  ${String(year.military).padStart(14)}  ${String(longestZero).padStart(14)}  ${String(now.restocks - last.restocks).padStart(8)}  ${String(now.delivered - last.delivered).padStart(9)}  ${(now.tenders - last.tenders) + "/" + (now.awarded - last.awarded) + "/" + (now.tfailed - last.tfailed)}`.padEnd(150).slice(0, 150).trimEnd() + `  ${String(onorder).padStart(8)}  ${lead.toFixed(1)}`);
		if (now.earn) console.log(`      earnings ${(now.earn - last.earn) / 1e6 | 0}M, of which hull income ${(now.hull - last.hull) / 1e6 | 0}M; index ${m().index.toFixed(0)}`);
		const sv = sectorValues();
		console.log("      sector value % " + SECTORS.map((n, i) => `${n} ${(sv[i] * 100).toFixed(0)}`).join(", "));
		console.log("      sector earnings M " + SECTORS.map((n, i) => `${n} ${(yearEarn[i] / 1e6).toFixed(1)}`).join(", "));
		yearEarn.fill(0);
		last = now;
		year = { empty: 0, worstEmpty: 0, military: 0 };
		longestZero = 0;
		if ([5, 10, 14].includes(y) || d === days) {
			const b = m().companies.filter((c) => c.listed() && c.sector === 0).sort((a, z) => z.capacity - a.capacity);
			console.log(`  shipbuilders at year ${y}: ` + b.map((c) => `${c.name}${c.canon ? "*" : ""} ${c.capacity.toFixed(1)}/${c.load.toFixed(1)}`).join(", "));
		}
	}
}
const L = m().companies.filter((c) => c.listed());
const total = L.reduce((s, c) => s + c.price * c.shares, 0);
L.sort((a, b) => b.price * b.shares - a.price * a.shares);
console.log("min listed", minL, "listed", L.length, "cycle", m().cycle, "shelves", m().shelves.length, "state", (m().encode().length / 1024).toFixed(0) + " KB, largest", (maxState / 1024).toFixed(0) + " KB");
for (const c of L.slice(0, 8)) console.log(c.name.padEnd(28), c.sector, "cap", c.capacity.toFixed(1), "price", c.price.toFixed(2), "shares", c.shares, "value%", (100*c.price*c.shares/total).toFixed(1), "earn", c.earnings.map(e=>Math.round(e/1000)+"k").join(","), "cash", Math.round(c.cash/1e6)+"M debt", Math.round(c.debt/1e6)+"M load", c.load.toFixed(1));
console.log("months in profit (of " + months.n + "): " + SECTORS.map((n, i) => `${n} ${profitMonths[i]}`).join(", "));
const sv = sectorValues();
console.log("final sector value % " + SECTORS.map((n, i) => `${n} ${(sv[i] * 100).toFixed(1)}`).join(", "));
if (m().convoys) console.log(`convoys ${m().convoys.formed} (${(m().convoys.formed / (days / 365)).toFixed(0)} a year), lost ${m().convoys.lost}; crises ${m().crisis_desk.started} (${(m().crisis_desk.started / (days / 365)).toFixed(1)} a year), price events ${m().crisis_desk.changes_made} (${(m().crisis_desk.changes_made / (days / 365)).toFixed(1)} a year)`);
const per = {}; for (const c of L) per[c.sector] = (per[c.sector]||0)+1; console.log("per sector", JSON.stringify(per));
