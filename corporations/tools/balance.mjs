// A balance report: runs the market for N days (default 5000) over human space
// and prints the largest companies and how many each sector lists, and, each
// year, the shipyards: a player who lands at a random human shipyard every
// few days and buys a hull or two (NPC demand comes in Task C3), the shelves
// that ran out, the shelf-days spent empty, and the restocks.
//   node mods/corporations/tools/balance.mjs [days] [days between landings]
import { loadMod, newGame, galaxy } from "../test/world.mjs";
const Corporations = await loadMod();
const game = newGame();
const mod = new Corporations();
mod.on_load(game); mod.on_enter(game, "Sol");
const days = Number(process.argv[2] || 5000);
const every = Number(process.argv[3] || 3);
// The player's own dice, apart from the market's.
let seed = 12345;
const roll = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
const yards = Object.keys(galaxy.planets).filter((p) => galaxy.planets[p].shipyard);
let minL = 99;
let year = { empty: 0, worstEmpty: 0, military: 0 };
const m = () => mod.market;
let last = { stockouts: 0, restocks: 0, delivered: 0, bought: 0 };
console.log("year  bought  ran-out  empty civil shelf-days (worst day)  empty military  restocks  hulls delivered  on order at year end  avg lead");
for (let d = 1; d <= days; d++) {
	game.day_ += 1;
	mod.on_day(game, game.day_);
	minL = Math.min(minL, m().companies.filter((c) => c.listed()).length);
	if (d % every === 0) {
		// Land, buy what is on the shelf, take off.
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
	let empty = 0;
	for (const s of m().shelves) {
		if (s.count < 0 || s.onorder < 0) throw new Error(`day ${d}: ${s.planet} ${s.model} went negative`);
		// Military shelves wait for tenders (Task C6), so they are counted apart.
		if (s.count === 0 && m().hulls.military(s.row)) year.military++;
		else if (s.count === 0) empty++;
	}
	year.empty += empty;
	year.worstEmpty = Math.max(year.worstEmpty, empty);
	if (d % 365 === 0 || d === days) {
		const k = m().contracts.filter((x) => x.kind === 3);
		const lead = k.length ? k.reduce((s, x) => s + x.days, 0) / k.length : 0;
		const onorder = m().shelves.reduce((s, x) => s + x.onorder, 0);
		console.log(`${String(Math.ceil(d / 365)).padStart(4)}  ${String(m().player_bought - last.bought).padStart(6)}  ${String(m().stockouts - last.stockouts).padStart(7)}  ${String(year.empty).padStart(22)} (${year.worstEmpty})  ${String(year.military).padStart(14)}  ${String(m().restocks_ordered - last.restocks).padStart(16)}  ${String(m().hulls_delivered - last.delivered).padStart(15)}  ${String(onorder).padStart(20)}  ${lead.toFixed(1)}`);
		last = { stockouts: m().stockouts, restocks: m().restocks_ordered, delivered: m().hulls_delivered, bought: m().player_bought };
		year = { empty: 0, worstEmpty: 0, military: 0 };
	}
}
const L = m().companies.filter((c) => c.listed());
const total = L.reduce((s, c) => s + c.price * c.shares, 0);
L.sort((a, b) => b.price * b.shares - a.price * a.shares);
console.log("min listed", minL, "listed", L.length, "cycle", m().cycle, "shelves", m().shelves.length, "state", (game.data("state").length / 1024).toFixed(0) + " KB");
for (const c of L.slice(0, 8)) console.log(c.name.padEnd(28), c.sector, "cap", c.capacity.toFixed(1), "price", c.price.toFixed(2), "shares", c.shares, "value%", (100*c.price*c.shares/total).toFixed(1), "earn", c.earnings.map(e=>Math.round(e/1000)+"k").join(","), "cash", Math.round(c.cash/1e6)+"M debt", Math.round(c.debt/1e6)+"M load", c.load.toFixed(1));
const per = {}; for (const c of L) per[c.sector] = (per[c.sector]||0)+1; console.log("per sector", JSON.stringify(per));
