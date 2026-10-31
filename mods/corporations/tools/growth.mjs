// (M4) A growth report: runs the market for N days (default 3650) and prints,
// each year, the exchange's size, the largest companies with their value and
// technology, how many companies there are at each size, sector utilisation
// and lapsed contracts, and the year's breakthroughs, offerings, buybacks,
// splits, buyouts and bankruptcies.
//   node mods/corporations/tools/growth.mjs [days] [start=<day offset>] [war]
import { loadMod, newGame } from "../test/world.mjs";
const Corporations = await loadMod();
const startArg = process.argv.find((a) => a.startsWith("start="));
const war = process.argv.includes("war");
const conditions = war ? { credits: 5000000, "diplomacy: active": 1, "diplomacy: war a": 1, "diplomacy: war b": 2 } : { credits: 5000000 };
const game = newGame({ day: 1100000 + Number(startArg ? startArg.slice(6) : 0), conditions });
const mod = new Corporations();
mod.on_load(game); mod.on_enter(game, "Sol");
const days = Number(process.argv[2] || 3650);
const m = () => mod.market;
const SECTORS = ["Ships", "Outfits", "Engines", "Electr.", "Consumer", "Mining", "Freight", "Security"];
const B = (x) => (x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : (x / 1e3).toFixed(0) + "k");
let last = { br: 0, off: 0, bb: 0, sp: 0 };
let lapsed = Array(8).fill(0), issued = Array(8).fill(0);
const seen = new Set();
let bankrupt = 0, merged = 0;
const status = new Map();
let util = Array(8).fill(0), utilN = 0;
function snapshot(label) {
	const L = m().companies.filter((c) => c.listed());
	const total = L.reduce((s, c) => s + c.market_value(), 0);
	L.sort((a, b) => b.market_value() - a.market_value());
	const bands = { "<5M": 0, "5-50M": 0, "50-500M": 0, "0.5-2B": 0, ">2B": 0 };
	for (const c of L) {
		const v = c.market_value();
		bands[v < 5e6 ? "<5M" : v < 5e7 ? "5-50M" : v < 5e8 ? "50-500M" : v < 2e9 ? "0.5-2B" : ">2B"]++;
	}
	const r = mod.market.research, k = mod.market.capital;
	console.log(`== ${label}: ${L.length} listed, exchange ${B(total)}, index ${m().index.toFixed(0)}, cycle ${m().cycle}; bands ${JSON.stringify(bands)}`);
	console.log(`   breakthroughs ${r.breakthroughs - last.br}, offerings ${k.offerings - last.off}, buybacks ${k.buybacks - last.bb}, splits ${k.splits - last.sp}; bankrupt ${bankrupt}, merged ${merged} (so far)`);
	last = { br: r.breakthroughs, off: k.offerings, bb: k.buybacks, sp: k.splits };
	console.log("   util " + SECTORS.map((n, i) => `${n} ${(util[i] / Math.max(1, utilN) * 100).toFixed(0)}%`).join(", "));
	console.log("   lapsed " + SECTORS.map((n, i) => `${n} ${issued[i] ? (lapsed[i] / issued[i] * 100).toFixed(0) : "-"}%`).join(", "));
	util = Array(8).fill(0); utilN = 0; lapsed = Array(8).fill(0); issued = Array(8).fill(0);
	for (const c of L.slice(0, 10)) {
		const e = c.earnings.length ? c.earnings[c.earnings.length - 1] : 0;
		console.log(`   ${(c.name + (c.canon ? "*" : "")).padEnd(28)} ${SECTORS[c.sector].padEnd(8)} ${B(c.market_value()).padStart(8)} @${c.price.toFixed(2).padStart(7)} cap ${c.capacity.toFixed(2).padStart(6)} eff ${m().eff(c).toFixed(2).padStart(6)} tech ${c.tech.join("/")} rd ${c.rd}f${c.focus} earn ${B(e)} cash ${B(c.cash)} debt ${B(c.debt)} g ${(c.growth * 100).toFixed(0)}% ${["agg", "pru", "vis", "crk"][c.trait]}`);
	}
	const small = L.slice(-5);
	console.log("   smallest: " + small.map((c) => `${c.name} ${B(c.market_value())} tech ${c.tech.join("/")}`).join("; "));
}
for (let d = 1; d <= days; d++) {
	game.day_ += 1;
	mod.on_day(game, game.day_);
	for (const k of m().contracts) {
		if (k.kind > 1 || seen.has(k.id)) continue;
		if (k.status === 0) continue;
		seen.add(k.id);
		issued[k.sector]++;
		if (k.status === 4) lapsed[k.sector]++;
	}
	for (const c of m().companies) {
		const was = status.get(c.id);
		if (was !== c.status) {
			if (c.status === 3 && was !== undefined) bankrupt++;
			if (c.status === 4 && was !== undefined) merged++;
			status.set(c.id, c.status);
		}
	}
	const capS = Array(8).fill(0), loadS = Array(8).fill(0);
	for (const c of m().companies) if (c.listed()) { capS[c.sector] += m().eff(c); loadS[c.sector] += c.load; }
	for (let i = 0; i < 8; i++) util[i] += capS[i] ? loadS[i] / capS[i] : 0;
	utilN++;
	if (d === 1 || d % 365 === 0 || d === days) snapshot(d === 1 ? "day 1" : `year ${(d / 365).toFixed(1)}`);
}
console.log("state", (m().encode().length / 1024).toFixed(0), "KB");
