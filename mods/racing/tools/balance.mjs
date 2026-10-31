// Balance runs: the built mod against FakeGame for many seasons, with a bot
// that runs the player's team sensibly (hires the best staff it can afford,
// funds R&D from what comes in, signs sponsors, lets the chiefs handle events).
// The bot buys the cheapest team for sale in the league (an existing team,
// at its asking price: its staff, sponsors and cash come with it).
// Prints, per season: the bot's league and place, its cash, and the leagues'
// car levels and AI finances. Run: node tools/balance.mjs [seeds] [seasons] [league] [policy]
// (policy: good, poor, none, or long: good, but it signs promising newcomers
// for five seasons and renews the good and the promising for three).
// LORE_OFF=1 turns the lore's effects off (fame's price and pull, traits'
// edges, the contracts' clauses about as they were): an A/B of their balance.
import { loadMod, start, days, buy } from "../test/world.mjs";

const Racing = await loadMod();
const seeds = Number(process.argv[2] ?? 4);
const seasons = Number(process.argv[3] ?? 8);
const entry = Number(process.argv[4] ?? 0);
const policy = process.argv[5] ?? "good";

const good = policy === "good" || policy === "long";
let injected = 0;
let lock = { saved: 0, paid: 0, weeks: 0 };
let acc = { rd: 0, n: 0, sp: 0, ai: 0 };
function bot(w) {
	const me = w.mine();
	if (me.id === 0) return;
	const st = w.staff;
	const income = w.sponsoring.weekly(w, me) + w.RACE_POOL * w.scale[me.league] * (me.races > 0 ? Math.max(0.05, 0.22 - 0.02 * (w.position(me) - 1)) : 0.06);
	const SEATS = [0, 1, 2, 3, 4, 5];
	const roleOf = (s) => (s === 5 ? 0 : s);
	const sal = () => SEATS.reduce((s, r) => s + (me.seats[r] ? w.person(me.seats[r]).salary : 0), 0);
	// Too much on salaries: let the priciest go (the next pass hires cheaper).
	if (good && sal() > 0.45 * income) {
		const seats = SEATS.filter((r) => me.seats[r]).sort((a, b) => w.person(me.seats[b]).salary - w.person(me.seats[a]).salary);
		if (seats.length && me.cash > 0) st.player_fire(w, w.person(me.seats[seats[0]]));
	}
	for (const s of SEATS) {
		const r = roleOf(s);
		const p = me.seats[s] ? w.person(me.seats[s]) : null;
		if (p && p.offer_until) { if (st.rating(p) > 0.1 && me.cash > st.RETAIN * p.offer_salary * 2) st.player_match(w, p); }
		const pot = (x) => w.bio.potential(w, x);
		const hire = (x) => st.player_hire_at(w, x, policy === "long" && x.races < 30 && pot(x) >= 65 ? 5 : st.CONTRACT, s);
		const value = (x) => st.rating(x) + (policy === "long" && x.races < 30 ? Math.max(0, pot(x) - 60) / 100 : 0);
		if (me.seats[s] && policy === "long" && w.season_week() === w.ROUNDS - 1) {
			const cur = w.person(me.seats[s]);
			if (st.can_renew(w, cur) && (st.rating(cur) > 0 || pot(cur) >= 65)) st.player_renew(w, cur, 3);
		}
		if (me.seats[s] && good && w.season_week() === w.WEEKS - 1) {
			const cur = w.person(me.seats[s]);
			const better = w.people.filter((x) => x.role === r && x.team !== me.id && st.rating(x) > st.rating(cur) + 0.2 && st.player_salary(x) <= income * 0.15 && st.player_cost_at(w, me, x, st.CONTRACT, s) <= Math.max(0, me.cash) * 0.25).sort((a, b) => st.rating(b) - st.rating(a));
			if (better.length) hire(better[0]);
			continue;
		}
		if (me.seats[s]) continue;
		const budget = policy === "poor" ? income * 0.02 : income * 0.15;
		const cands = w.people.filter((x) => x.role === r && x.team !== me.id && (x.team === 0 || good) && st.player_salary(x) <= Math.max(budget, st.ROLE_BASE[r] * 0.5) && st.player_cost_at(w, me, x, st.CONTRACT, s) <= Math.max(0, me.cash) * 0.25);
		cands.sort((a, b) => value(b) - value(a));
		if (policy === "poor") cands.sort((a, b) => st.ask(a) - st.ask(b));
		if (cands.length) hire(cands[0]);
	}
	for (const d of w.deals.filter((d) => d.team === me.id && d.offer)) {
		const pos = me.races >= 3 ? w.position(me) : w.sponsoring.expected(w, me);
		if (w.deals_of(me.id).length < w.sponsoring.SLOTS && (!good || d.target >= pos)) w.sponsoring.sign(w, d);
	}
	if (good && me.cash < 0 && injected < 1000000) { const x = Math.min(200000, 1000000 - injected); me.cash += x; injected += x; }
	const reserve = 0.05 * w.franchise[me.league];
	let rd = policy === "poor" ? income * 0.1 : Math.max(0, 0.85 * (income + w.sponsoring.weekly(w, me)) - sal()) + Math.max(0, (me.cash - reserve) * 0.1);
	if (me.cash < 0) rd *= 0.3;
	const split = [0.26, 0.26, 0.18, 0.14, 0.16];
	for (let d = 0; d < 5; d++) me.budgets[d] = rd * split[d];
	acc.rd += rd; acc.n += 1; acc.sp += w.sponsoring.weekly(w, me);
	const ai = w.league_teams(me.league).filter((t) => !t.player);
	acc.ai += ai.reduce((a, t) => a + t.budgets.reduce((x, y) => x + y, 0), 0) / ai.length;
	for (const inc of [...w.incidents]) w.events.resolve(w, inc, 2);
	// What locked salaries saved against the asks of the day.
	for (const r of SEATS) if (me.seats[r]) { const p = w.person(me.seats[r]); lock.saved += st.ask(p) - p.salary; lock.paid += p.salary; }
	lock.weeks += 1;
}

const summary = [];
for (let s = 0; s < seeds; s++) {
	injected = 0;
	const { game, mod, w } = start(Racing, { day: 1100430 + s * 977 });
	if (process.env.LORE_OFF) {
		const W = w();
		Object.assign(W.staff, { FAME_ASK: 0, POT_K: 0, LOYAL_K: 0, LENGTH_K: 0, RELEASE_K: 0, BUYOUT_K: 0, BUYOUT_MIN: 8 });
		W.sponsoring.FAME_PAY = 0;
		W.value.FAME_K = 0;
		for (const L of [W.lore, W.race.lore]) Object.assign(L, { GIANT_PACE: 0, PASS: 0, KIND_PACE: 0, KIND_RISK: 1, DEFEND: 0, STEADY_NOISE: 1, SETUP: 0, STOP: 0, BOTCH: 1, YIELD: 0 });
	}
	days(mod, game, 84);
	if (policy !== "none") {
		const t = w().for_sale(entry)[0];
		const price = w().asking_price(t);
		const cash = t.cash;
		buy(mod, game, t.id);
		// Working capital: the bot tops the team's cash up to 40% of the
		// franchise (what founding once gave a new team), from its own credits.
		const top = Math.max(0, 0.4 * w().franchise[entry] - t.cash);
		t.cash += top;
		console.log(`  bought ${t.name} for ${(price / 1e6).toFixed(2)}M (worth ${(w().sale_value(t, false) / 1e6).toFixed(2)}M, cash ${(cash / 1e6).toFixed(2)}M), put in ${(top / 1e6).toFixed(2)}M`);
	}
	game.landed = false; game.planet_ = ""; game.panel = null;
	const rows = [];
	let bankrupt = 0;
	for (let season = 0; season < seasons; season++) {
		for (let d = 0; d < 84; d++) {
			if ((game.day_ - w().start_day) % 7 === 2) bot(w());
			const before = w().news.length;
			days(mod, game, 1);
			bankrupt += w().news.slice(before).filter((n) => n.includes("bankrupt")).length;
		}
		const me = w().mine();
		const rdOf = (t) => t.budgets.reduce((a, b) => a + b, 0);
		const salOf = (t) => [0, 1, 2, 3, 4, 5].reduce((s, r) => s + (t.seats[r] ? w().person(t.seats[r]).salary : 0), 0);
		const spend = [0, 1, 2].map((l) => { const ts = w().league_teams(l).filter((t) => !t.player); return `${["B", "A", "S"][l]} rd ${(ts.reduce((a, t) => a + rdOf(t), 0) / ts.length / 1e3).toFixed(0)}k sal ${(ts.reduce((a, t) => a + salOf(t), 0) / ts.length / 1e3).toFixed(0)}k`; });
		if (process.env.DIAG && acc.n) console.log(`    season avg/wk: my rd ${(acc.rd / acc.n / 1e3).toFixed(0)}k sponsors ${(acc.sp / acc.n / 1e3).toFixed(0)}k; AI rd in my league ${(acc.ai / acc.n / 1e3).toFixed(0)}k`);
		acc = { rd: 0, n: 0, sp: 0, ai: 0 };
		if (process.env.DIAG) console.log(`    me rd ${(rdOf(me) / 1e3).toFixed(0)}k sal ${(salOf(me) / 1e3).toFixed(0)}k spons ${(w().sponsoring.weekly(w(), me) / 1e3).toFixed(0)}k | ${spend.join(" | ")}`);
		const lv = [0, 1, 2].map((l) => {
			const ts = w().league_teams(l).filter((t) => !t.player);
			const r = ts.map((t) => t.rating());
			return `${["B", "A", "S"][l]} ${Math.min(...r).toFixed(0)}-${Math.max(...r).toFixed(0)} cash ${(ts.reduce((a, t) => a + t.cash, 0) / ts.length / 1e6).toFixed(1)}M min ${(Math.min(...ts.map((t) => t.cash)) / 1e6).toFixed(1)}M`;
		});
		const hist = me.id ? me.history.split(",").at(-1) : "";
		rows.push(`  s${w().season} me ${me.id ? ["B", "A", "S"][me.league] + " " + hist + " car " + me.rating().toFixed(0) + " cash " + (me.cash / 1e6).toFixed(2) + "M" : "(none)"} | ${lv.join(" | ")} | bankrupt ${bankrupt}`);
	}
	summary.push(w().mine().history);
	const me = w().mine();
	if (me.id) {
		const staff = [0, 5, 1, 2, 3, 4].filter((r) => me.seats[r]).map((r) => w().person(me.seats[r]));
		console.log(`  staff: ${staff.map((p) => `${p.name} fame ${p.fame.toFixed(0)} traits ${p.traits.length} to s${p.contract_end}`).join("; ")}; value fame ${(w().value.fame(w(), me) / 1e3).toFixed(0)}k`);
	}
	console.log(`seed ${s}:\n${rows.join("\n")}`);
}
console.log(summary.join("\n"));
console.log("injected (last seed)", injected);
console.log(`salaries paid a week (mean) ${(lock.paid / Math.max(1, lock.weeks) / 1e3).toFixed(1)}k; locked salaries saved against the asks ${(lock.saved / Math.max(1, lock.weeks) / 1e3).toFixed(1)}k a week`);
