// (0.4) The chiefs' pool over a long run: ousters, poachings, retirements,
// scandals, distress and bankruptcies, salaries, and whether records sort good
// chiefs from bad (each hidden stat's correlation with the record, among
// chiefs with two years in office or more).
//   node mods/corporations/tools/chiefs.mjs [days] [start=<day offset>]
import { loadMod, newGame } from "../test/world.mjs";
const Corporations = await loadMod();
const startArg = process.argv.find((a) => a.startsWith("start="));
const game = newGame({ day: 1100000 + Number(startArg ? startArg.slice(6) : 0) });
const mod = new Corporations();
mod.on_load(game); mod.on_enter(game, "Sol");
const days = Number(process.argv[2] || 5000);
const m = () => mod.market;
const status = new Map();
const ev = { distress: 0, bankrupt: 0 };
let time = 0;
for (let d = 1; d <= days; d++) {
	game.day_ += 1;
	const t = performance.now();
	mod.on_day(game, game.day_);
	time += performance.now() - t;
	for (const c of m().companies) {
		const was = status.get(c.id);
		if (was !== undefined && was !== c.status) {
			if (c.status === 1) ev.distress++;
			if (c.status === 3) ev.bankrupt++;
		}
		status.set(c.id, c.status);
	}
	if (m().chiefs.length !== m().execs.POOL_SIZE) throw new Error(`pool size ${m().chiefs.length} on day ${d}`);
}
const x = m().execs;
console.log(`${days} days: ousted ${x.ousted}, poached ${x.poached}, retired ${x.retired}, scandals ${x.scandals}, hired ${x.hired}; distress ${ev.distress}, bankrupt ${ev.bankrupt}; on_day ${(time / days).toFixed(2)} ms (V8)`);
const chiefs = m().chiefs;
const prices = chiefs.map((c) => x.price(c)).sort((a, b) => a - b);
const q = (p) => prices[Math.floor(p * (prices.length - 1))];
console.log(`asking salaries: min ${q(0).toFixed(0)}, 25% ${q(0.25).toFixed(0)}, median ${q(0.5).toFixed(0)}, 75% ${q(0.75).toFixed(0)}, max ${q(1).toFixed(0)}`);
console.log(`ousters in the pool: ${chiefs.filter((c) => c.ousters > 0).length} chiefs; employed ${chiefs.filter((c) => c.company !== 0).length}`);
const seasoned = chiefs.filter((c) => c.n >= 24);
const corr = (xs, ys) => {
	const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
	let sxy = 0, sxx = 0, syy = 0;
	for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
	return sxy / Math.sqrt(sxx * syy || 1);
};
const rec = seasoned.map((c) => c.sum / c.n);
const names = ["drive", "thrift", "vision", "nerve", "integrity"];
console.log(`${seasoned.length} chiefs with 2+ years: record vs ` + names.map((s, k) => `${s} ${corr(seasoned.map((c) => c.stats[k]), rec).toFixed(2)}`).join(", "));
const employed = chiefs.filter((c) => c.company !== 0), idle = chiefs.filter((c) => c.company === 0);
const mean = (a, k) => (a.reduce((s, c) => s + c.stats[k], 0) / (a.length || 1)).toFixed(2);
console.log(`mean stats, employed vs free: ` + names.map((s, k) => `${s} ${mean(employed, k)}/${mean(idle, k)}`).join(", "));
