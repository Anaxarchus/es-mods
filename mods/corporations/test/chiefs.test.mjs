// Tests for 0.4 of Corporations, the chiefs' pool: a fixed pool of chief
// executives shared by every company (the player's too), hidden stats, career
// records, prices that follow them, hiring by experience and budget,
// retirement, poaching, board ousters, the Chiefs tab, and saves from before
// the pool. Against the SDK's FakeGame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, newGame } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";

function start(options = {}) {
	const game = newGame(options);
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	return { game, mod, m: () => mod.market };
}
function days(mod, game, n) { for (let d = 0; d < n; d++) { game.day_ += 1; mod.on_day(game, game.day_); } }
function land(mod, game, planet) {
	game.landed = true; game.planet_ = planet; game.here_ = game.planets[planet].system; game.jobs = new Map();
	mod.on_enter(game, game.here_);
}
function takeOff(game) { game.landed = false; game.planet_ = ""; }
const invented = (M) => M.companies.filter((c) => c.listed() && !c.canon && c.owner === 0 && c.chief !== 0);
const free = (M) => M.chiefs.filter((ch) => ch.company === 0);
// A record: n reports summing to n × mean.
function record(ch, n, mean, ousters = 0) { ch.n = n; ch.sum = n * mean; ch.ousters = ousters; }
// Found a company for the player at Earth (10M), through the exchange.
function found(mod, game) {
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Company"));
	mod.on_panel_row(game, mod.exchange.ship_items.indexOf("s:6"));
	mod.on_panel(game, game.panel.buttons.indexOf("Found (10M)"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	return mod.market.charter.mine(mod.market);
}
// Open the Chiefs tab with a chief chosen; press a button and confirm it.
function chiefsTab(mod, game, ch) {
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Chiefs"));
	if (ch) mod.on_panel_row(game, mod.exchange.chief_items.indexOf(ch.id));
}
function pressConfirm(mod, game, label) {
	const i = game.panel.buttons.indexOf(label);
	assert.ok(i >= 0, `a ${label} button (${game.panel.buttons.join(", ")})`);
	const n = game.confirms.length;
	mod.on_panel(game, i);
	assert.equal(game.confirms.length, n + 1, `${label} asks to confirm`);
	mod.on_confirm(game, game.confirms.at(-1).token);
}

// ---- The pool ----

test("chiefs: the pool keeps its size through hires, retirements, poachings, ousters and saves", { skip }, () => {
	const { game, mod, m } = start();
	const SIZE = m().execs.POOL_SIZE;
	assert.ok(SIZE >= m().MAX_LISTED + 8, "enough for every company the exchange can list, the player's, and spares");
	assert.equal(m().chiefs.length, SIZE);
	// Every listed company has a chief from the pool, and no chief runs two.
	const runs = new Map();
	for (const c of m().companies.filter((c) => c.listed())) {
		assert.ok(c.chief > 0, `${c.name} has a pool chief`);
		const ch = m().chief_by_id.get(c.chief);
		assert.equal(ch.company, c.id);
		assert.equal(c.ceo, ch.name);
		assert.ok(!runs.has(ch.id));
		runs.set(ch.id, c.id);
	}
	// Faster careers, more ousters and poachings: the size never moves.
	m().execs.POACH_CHANCE = 30; m().execs.POACH_MIN_N = 2;
	for (const ch of m().chiefs) ch.retires = m().day + 1 + (ch.id % 400);
	let retired = 0;
	for (let d = 0; d < 1500; d++) {
		days(mod, game, 1);
		assert.equal(m().chiefs.length, SIZE, `day ${d}`);
		if (d === 700) {
			const again = new (m().constructor)(); again.decode(m().encode());
			assert.equal(again.chiefs.length, SIZE);
			assert.equal(again.encode(), m().encode(), "the pool round-trips");
		}
	}
	retired = m().execs.retired;
	assert.ok(retired >= SIZE, `every first-generation chief retired (${retired})`);
	assert.equal(new Set(m().chiefs.map((ch) => ch.name)).size, SIZE, "names are unique");
	for (const c of m().companies.filter((c) => c.listed() && c.owner === 0)) assert.ok(c.chief > 0 && m().chief_by_id.get(c.chief).company === c.id);
});

test("chiefs: a career ends after about ten years; the chief retires for good and a new unknown replaces them", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	const M = m();
	// Careers are about ten years.
	for (const ch of M.chiefs) {
		const years = (ch.retires - ch.joined) / 365;
		assert.ok(years >= 9 && years <= 11.05, `${ch.name}: ${years.toFixed(1)} years`);
	}
	const c = invented(M)[0];
	const ch = M.chief_by_id.get(c.chief);
	ch.retires = M.day + 1;
	const ids = new Set(M.chiefs.map((x) => x.id));
	days(mod, game, 1);
	assert.ok(!M.chief_by_id.has(ch.id) && !M.chiefs.some((x) => x.id === ch.id), "gone from the pool for good");
	const fresh = M.chiefs.filter((x) => !ids.has(x.id));
	assert.equal(fresh.length, 1, "one new chief");
	assert.equal(fresh[0].n, 0, "with no record");
	assert.equal(fresh[0].ousters, 0);
	assert.ok(fresh[0].retires - fresh[0].joined >= 9 * 365, "at the start of a career");
	assert.ok(c.chief !== 0 && c.chief !== ch.id && M.chief_by_id.get(c.chief).company === c.id, "the company hires again");
	assert.ok(M.news.some((l) => l.includes(ch.name + ", retires after")));
});

test("chiefs: performance is tracked report by report, stint by stint, and kept across a career", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 40);
	const M = m();
	const c = invented(M)[0];
	const ch = M.chief_by_id.get(c.chief);
	const n0 = ch.n, sum0 = ch.sum;
	// The first report of a stint sets where the company stood; later ones score the change.
	M.execs.release(M, c, 6, M.day);
	M.execs.bind(M, c, ch, M.day, 50000);
	assert.equal(ch.base, ch.UNSET);
	M.execs.after_report(M, c, M.day);
	assert.equal(ch.cur_n, 0, "no score at the first report");
	assert.ok(Math.abs(ch.base - M.execs.standing(M, c)) < 1e-12);
	// Two better reports, one worse.
	const step = (delta) => { ch.base = M.execs.standing(M, c) - delta; M.execs.after_report(M, c, M.day); };
	M.execs.OUST_VOTE = 0; M.execs.POACH_CHANCE = 0;
	step(0.04); step(0.02); step(-0.01);
	assert.equal(ch.cur_n, 3);
	assert.ok(Math.abs(ch.cur_sum - 0.05) < 1e-9, `tenure ${ch.cur_sum}`);
	assert.equal(ch.n, n0 + 3);
	assert.ok(Math.abs(ch.sum - sum0 - 0.05) < 1e-9);
	// The stint ends: it is in the history with its record; the career totals stay.
	M.execs.release(M, c, M.execs.END_LET_GO, M.day + 3);
	const last = ch.stints.at(-1).split("~");
	assert.equal(last[0], c.name);
	assert.equal(Number(last[3]), 3);
	assert.ok(Math.abs(Number(last[4]) - 0.05) < 1e-4);
	assert.equal(Number(last[5]), M.execs.END_LET_GO);
	assert.equal(ch.n, n0 + 3, "the career's reports are kept");
	assert.equal(ch.cur_n, 0);
	M.execs.appoint(M, c, M.day, -1);
	// Saved and read back with everything.
	const again = new (M.constructor)(); again.decode(M.encode());
	const back = again.chief_by_id.get(ch.id);
	assert.deepEqual([back.n, back.sum, back.stints, back.ousters, back.stats], [ch.n, ch.sum, ch.stints, ch.ousters, ch.stats]);
	// The Chiefs tab shows the record and the history.
	land(mod, game, "Earth");
	chiefsTab(mod, game, ch);
	assert.match(game.panel.text, new RegExp(ch.name));
	assert.match(game.panel.text, /Record: [+-]\d+\.\d points a year .* over \d+ months/);
	assert.match(game.panel.text, new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ", .* to .*: \\+1\\.7 points over 3 months; let go by the owner"));
	assert.ok(game.panel.rows.length === M.execs.POOL_SIZE, "every chief in the table");
});

test("chiefs: records over many years sort chiefs: real stats move the record, and the sim does the sorting", { skip }, () => {
	// The stats reach real levers: margins, costs, research, luck, crises.
	const { game, mod, m } = start();
	days(mod, game, 30);
	const M = m();
	const c = invented(M)[0];
	const ch = M.chief_by_id.get(c.chief);
	const x = M.execs;
	ch.stats = [0.5, 0.5, 0.5, 0.5, 0.5];
	const hi = [x.margin_of(M, c), x.cost_drift(M, c), x.rd_factor(M, c), x.luck_of(M, c), x.crisis_factor(M, c), x.recover_factor(M, c)];
	ch.stats = [-0.5, -0.5, -0.5, -0.5, -0.5];
	const lo = [x.margin_of(M, c), x.cost_drift(M, c), x.rd_factor(M, c), x.luck_of(M, c), x.crisis_factor(M, c), x.recover_factor(M, c)];
	assert.ok(hi[0] < lo[0], "drive bids lower");
	assert.ok(hi[1] < 0 && lo[1] > 0, "thrift brings costs down");
	assert.ok(hi[2] > 1 && lo[2] < 1, "vision makes research go further");
	assert.ok(hi[3] > lo[3], "nerve: better turns of fortune");
	assert.ok(hi[4] < 1 && lo[4] > 1, "nerve: cheaper crises");
	assert.ok(hi[5] > 1 && lo[5] < 1, "nerve: reliability back sooner");
	// Styles come from the stats; none is shown.
	assert.equal(x.style({ stat: (k) => [0.6, 0, 0, 0, 0][k] }), 0);
	assert.equal(x.style({ stat: (k) => [-0.6, 0, 0, 0, 0][k] }), 1);
	assert.equal(x.style({ stat: (k) => [0.1, 0, 0.7, 0, 0][k] }), 2);
	assert.equal(x.style({ stat: (k) => [0.1, 0, 0, 0, -0.8][k] }), 3);
	// Thrift at work: the same company, the same dice, a thrifty chief's efficiency drifts lower.
	const saved = M.encode();
	const run = (thrift) => {
		const N = new (M.constructor)(); N.decode(saved);
		const k = N.by_id.get(c.id); const h = N.chief_by_id.get(k.chief);
		h.stats = [0, thrift, 0, 0, 0];
		N.execs.OUST_VOTE = 0; N.execs.POACH_CHANCE = 0;
		for (let i = 0; i < 24; i++) N.report(game, k, N.day);
		return k.efficiency;
	};
	assert.ok(run(0.8) < run(-0.8) - 0.04, "thrift lowers costs over two years");
});

// ---- Prices and hiring ----

test("chiefs: the price follows the record: proven chiefs cost more, unknowns little, ousters less", { skip }, () => {
	const { m } = start();
	const M = m();
	const x = M.execs;
	const [a, b, c, d] = free(M);
	record(a, 0, 0);
	record(b, 60, 0.03);
	record(c, 60, -0.03);
	record(d, 60, 0.03, 1);
	assert.equal(x.price(a), x.SALARY_BASE, "an unknown asks the base");
	assert.ok(x.price(b) > 2 * x.price(a), `a proven chief asks far more (${x.price(b)})`);
	assert.ok(x.price(c) < x.price(a) / 2, `a poor record far less (${x.price(c)})`);
	// The best records ask many times an unknown's price.
	record(c, 120, 0.1);
	assert.ok(x.price(c) > 10 * x.price(a), `a star (${x.price(c)})`);
	record(c, 60, -0.03);
	assert.ok(Math.abs(x.price(d) - x.price(b) * x.OUSTER_CUT) < 1, "an ouster cuts the price");
	// More of a good record, a higher price; the price is what a hire costs.
	record(c, 120, 0.03);
	assert.ok(x.price(c) > x.price(b));
	assert.ok(Math.abs(x.sign_fee(b) - x.price(b) * x.SIGN) < 1e-6);
});

test("chiefs: boards hire mostly on experience and record, within budget; an ouster weighs heavily", { skip }, () => {
	const { m } = start();
	const M = m();
	const x = M.execs;
	x.NOISE = 0;
	const big = M.companies.find((c) => c.canon);
	const pool = free(M);
	for (const ch of pool) { record(ch, 0, 0); ch.retires = M.day + 3000; }
	const [veteran, rookie, ousted] = pool;
	record(veteran, 96, 0.004);
	assert.equal(x.pick(M, big).id, veteran.id, "the most experienced free chief");
	// An ouster: the same experience, a better record, still passed over.
	record(ousted, 120, 0.01, 1);
	assert.equal(x.pick(M, big).id, veteran.id, "never the one voted out, over a clean veteran");
	assert.ok(x.appeal(ousted) < x.appeal(veteran));
	record(ousted, 120, 0.01, 0);
	assert.equal(x.pick(M, big).id, ousted.id, "without the ouster, the longer record wins");
	record(ousted, 0, 0, 1);
	// A small company cannot afford the veteran: it takes what it can pay.
	record(veteran, 120, 0.05);
	const small = M.companies.find((c) => c.listed() && !c.canon && x.budget(M, c) < x.price(veteran));
	assert.ok(small, "a company too small for a proven chief");
	assert.ok(x.price(veteran) <= x.budget(M, big), "the established company can");
	const chosen = x.pick(M, small);
	assert.notEqual(chosen.id, veteran.id, "the veteran is beyond its budget");
	assert.ok(x.price(chosen) <= x.budget(M, small) || pool.every((ch) => ch.company !== 0 || x.price(ch) >= x.price(chosen)), "within budget, or the cheapest");
	assert.equal(x.pick(M, big).id, veteran.id);
	// Appointing pays the signing fee, and the salary is a daily cost.
	const cash = big.cash;
	x.release(M, big, x.END_REPLACED, M.day);
	x.appoint(M, big, M.day, -1);
	assert.equal(big.chief, veteran.id);
	assert.ok(Math.abs(cash - big.cash - x.price(veteran) * x.SIGN) < 1);
	assert.equal(x.salary_of(M, big), Math.round(x.price(veteran)));
});

// ---- Poaching ----

test("chiefs: an AI company poaches a strong chief it can afford; the company that lost them fills the seat", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 30);
	const M = m();
	const x = M.execs;
	const buyer = M.companies.find((c) => c.canon && c.chief);
	const from = invented(M).find((c) => c.id !== buyer.id);
	const star = M.chief_by_id.get(from.chief);
	const old = M.chief_by_id.get(buyer.chief);
	record(old, 24, -0.01);
	record(star, 60, 0.04);
	star.retires = M.day + 2000;
	for (const ch of M.chiefs) if (ch.company !== 0 && ch.id !== star.id) record(ch, Math.min(ch.n, 5), 0);
	buyer.cash += 1e9;
	const fromCash = from.cash;
	const salary = x.lure(star);
	x.ai_poach(M, buyer, M.day);
	assert.equal(buyer.chief, star.id, "the buyer has the star");
	assert.equal(star.company, buyer.id);
	assert.ok(Math.abs(star.salary - Math.round(salary)) <= 1, "at more than they asked");
	assert.ok(salary > x.price(star));
	assert.ok(from.chief !== 0 && from.chief !== star.id && M.chief_by_id.get(from.chief).company === from.id, "the seat is filled again");
	assert.ok(from.cash > fromCash, "paid to let them go");
	assert.equal(Number(star.stints.at(-1).split("~")[5]), x.END_POACHED, "the stint ends as poached");
	assert.equal(old.company, 0, "the buyer's old chief goes back to the pool");
	assert.ok(M.news.some((l) => l.includes(buyer.name + " hires away " + from.name + "'s chief executive, " + star.name)));
	// Not one voted out, not one with a short record.
	const other = invented(M).find((c) => c.id !== from.id && c.id !== buyer.id);
	const weak = M.chief_by_id.get(other.chief);
	record(weak, 60, 0.05, 1);
	record(star, 60, -0.05);
	assert.notEqual(x.poach_target(M, buyer).id, weak.id);
	record(weak, 6, 0.05, 0);
	assert.notEqual(x.poach_target(M, buyer).id, weak.id);
});

test("chiefs: the player hires from the pool, poaches a sitting chief, and lets one go, from the Chiefs tab", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 1e9 } });
	days(mod, game, 30);
	const mine = found(mod, game);
	assert.equal(mine.ceo, "you");
	const M = m();
	const x = M.execs;
	// Hire a free chief.
	const pick = free(M).find((ch) => ch.retires > M.day + 100);
	chiefsTab(mod, game, pick);
	assert.match(game.panel.text, /Free, looking for a post/);
	let credits = game.condition("credits");
	pressConfirm(mod, game, "Hire");
	assert.equal(mine.chief, pick.id);
	assert.ok(Math.abs(credits - game.condition("credits") - x.sign_fee(pick)) <= 1);
	// Poach a sitting chief: the player pays the buyout and the signing fee; the
	// company that lost them hires again; the chief the player had goes back.
	const from = invented(M)[0];
	const target = M.chief_by_id.get(from.chief);
	record(target, 40, 0.02);
	chiefsTab(mod, game, target);
	assert.match(game.panel.text, /Hiring them away/);
	credits = game.condition("credits");
	const cost = x.poach_cost(target), fromCash = from.cash;
	pressConfirm(mod, game, "Poach");
	assert.equal(mine.chief, target.id, "poached");
	assert.ok(Math.abs(credits - game.condition("credits") - cost) <= 1, "the player paid the buyout and the fee");
	assert.ok(from.cash > fromCash, "the old company was paid");
	assert.ok(from.chief !== 0 && M.chief_by_id.get(from.chief).company === from.id, "its seat is filled");
	assert.equal(pick.company, 0, "the player's last chief is free again");
	assert.equal(Number(target.stints.at(-1).split("~")[5]), x.END_POACHED);
	// The salary is the company's cost.
	assert.equal(x.salary_of(M, mine), target.salary);
	// Let them go: the player runs it.
	chiefsTab(mod, game, target);
	pressConfirm(mod, game, "Let go");
	assert.equal(mine.ceo, "you");
	assert.equal(mine.chief, 0);
	assert.equal(target.company, 0);
	assert.equal(target.ousters, 0, "letting go is no ouster");
});

test("chiefs: an AI company can lure the player's chief: the player is told, and can match the offer or lose them", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 1e9 } });
	days(mod, game, 30);
	const mine = found(mod, game);
	const M = m();
	const x = M.execs;
	const ch = free(M).find((c) => c.retires > M.day + 1000);
	assert.ok(x.player_hire(game, M, mine, ch, M.day));
	record(ch, 60, 0.04);
	for (const o of M.chiefs) if (o.id !== ch.id) record(o, Math.min(o.n, 5), 0);
	const buyer = M.companies.find((c) => c.canon);
	buyer.cash += 1e9;
	const saved = M.encode();
	x.ai_poach(M, buyer, M.day);
	assert.equal(M.offer_chief, ch.id, "an offer, not a raid");
	assert.equal(mine.chief, ch.id, "the chief stays while the player decides");
	takeOff(game);
	days(mod, game, 1);
	assert.ok(game.messages.some((t) => t.includes(buyer.name + " offers " + ch.name)), "the player is told");
	// Matched: the salary rises to the offer; a retention bonus is paid.
	land(mod, game, "Earth");
	chiefsTab(mod, game, ch);
	assert.match(game.panel.text, /offers them/);
	const credits = game.condition("credits"), bonus = x.retention(M), offer = M.offer_salary;
	pressConfirm(mod, game, "Match offer");
	assert.equal(M.offer_chief, 0);
	assert.equal(ch.salary, offer);
	assert.ok(Math.abs(credits - game.condition("credits") - bonus) <= 1);
	takeOff(game);
	days(mod, game, x.OFFER_DAYS + 1);
	assert.equal(mine.chief, ch.id, "matched: the chief stays");
	// Not matched: after OFFER_DAYS the chief goes, and the player runs the company.
	const N = new (M.constructor)(); N.decode(saved);
	const n = N.charter.mine(N);
	N.execs.ai_poach(N, N.by_id.get(buyer.id), N.day);
	assert.equal(N.offer_chief, ch.id);
	for (let d = 0; d <= x.OFFER_DAYS; d++) N.execs.daily(game, N, N.day + 1 + d);
	assert.equal(N.by_id.get(buyer.id).chief, ch.id, "lured away");
	assert.equal(n.ceo, "you");
	assert.ok(N.player_events.some((t) => t.includes("has hired away " + ch.name)), "the player is told");
});

// ---- Ousters ----

test("chiefs: a board votes out a chief whose company did badly in their tenure, more leniently early on", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 40);
	const M = m();
	const x = M.execs;
	x.OUST_VOTE = 100; x.POACH_CHANCE = 0;
	const c = invented(M)[0];
	const ch = M.chief_by_id.get(c.chief);
	// After a report scoring `score`, with `n` before it averaging `mean`.
	const trial = (n, mean) => {
		const N = new (M.constructor)(); N.decode(M.encode());
		N.execs.OUST_VOTE = 100; N.execs.POACH_CHANCE = 0;
		const k = N.by_id.get(c.id); const h = N.chief_by_id.get(ch.id);
		h.cur_n = n; h.cur_sum = n * mean;
		h.base = N.execs.standing(N, k) - mean;
		N.execs.after_report(N, k, N.day);
		return { ousted: k.chief !== h.id, N, k, h };
	};
	assert.equal(trial(2, -0.2).ousted, false, "too soon: a few bad months are forgiven");
	assert.equal(trial(8, -0.07).ousted, false, "short tenure: leniency");
	assert.equal(trial(48, -0.07).ousted, true, "the same results over four years: voted out");
	assert.equal(trial(48, 0.0).ousted, false, "average results: kept");
	const { N, k, h } = trial(10, -0.2);
	assert.equal(h.ousters, 1, "the ouster is on the record");
	assert.equal(Number(h.stints.at(-1).split("~")[5]), N.execs.END_OUSTED);
	assert.ok(k.chief !== 0 && N.chief_by_id.get(k.chief).company === k.id, "the board hires a new chief");
	assert.ok(N.news.some((l) => l.includes(k.name + "'s board votes out its chief executive, " + h.name)), "in the news");
	// The record persists: saved, read back, shown in the pool.
	const again = new (N.constructor)(); again.decode(N.encode());
	assert.equal(again.chief_by_id.get(h.id).ousters, 1);
	assert.equal(again.chief_by_id.get(h.id).stints.at(-1), h.stints.at(-1));
	mod.market = again; mod.loaded_rev = game.data("rev");
	land(mod, game, "Earth");
	mod.market = again;
	chiefsTab(mod, game, again.chief_by_id.get(h.id));
	assert.match(game.panel.text, /VOTED OUT by a board once/);
	assert.match(game.panel.text, /VOTED OUT BY THE BOARD\./);
	const row = mod.exchange.chief_items.indexOf(h.id);
	assert.match(game.panel.rows[row].join("\t"), /VOTED OUT/);
});

test("chiefs: an ouster lowers both the hiring preference and the price", { skip }, () => {
	const { m } = start();
	const M = m();
	const x = M.execs;
	x.NOISE = 0;
	const big = M.companies.find((c) => c.canon);
	for (const ch of free(M)) { record(ch, 0, 0); ch.retires = M.day + 3000; }
	const [a, b] = free(M);
	record(a, 60, 0.02);
	record(b, 60, 0.02);
	assert.equal(x.price(a), x.price(b));
	// b is voted out once (through the board, not by hand).
	const c = M.companies.find((k) => k.listed() && k.owner === 0 && k.chief && k.id !== big.id);
	x.release(M, c, x.END_REPLACED, M.day);
	x.bind(M, c, b, M.day, x.price(b));
	x.release(M, c, x.END_OUSTED, M.day);
	assert.equal(b.ousters, 1);
	assert.ok(x.price(b) < x.price(a), "cheaper");
	assert.ok(x.appeal(b) < x.appeal(a) - 0.5, "far less wanted");
	for (const ch of free(M)) if (ch.id !== a.id && ch.id !== b.id) { record(ch, 0, 0); ch.retires = M.day + 3000; }
	assert.equal(x.pick(M, big).id, a.id);
	// With a only, b still loses to an unknown.
	record(a, 0, 0);
	assert.notEqual(x.pick(M, big).id, b.id, "an unknown over the ousted chief");
});

test("chiefs: the player's board: no ouster while they control their company; once others control it, it can", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 1e9 } });
	days(mod, game, 30);
	const mine = found(mod, game);
	const M = m();
	const x = M.execs;
	x.OUST_VOTE = 100; x.POACH_CHANCE = 0;
	const ch = free(M).find((c) => c.retires > M.day + 1000);
	x.player_hire(game, M, mine, ch, M.day);
	ch.cur_n = 30; ch.cur_sum = -0.2 * 30; ch.base = x.standing(M, mine) + 0.2;
	assert.equal(x.may_oust(M, mine), false, "private: the player is the board");
	x.after_report(M, mine, M.day);
	assert.equal(mine.chief, ch.id, "kept");
	// Listed, and the player holds under half: the outside board can oust.
	mine.ipo = true;
	M.holdings.set(mine.id, Math.floor(mine.shares * 0.4));
	assert.equal(x.may_oust(M, mine), true);
	x.after_report(M, mine, M.day);
	assert.notEqual(mine.chief, ch.id, "voted out");
	assert.ok(mine.chief !== 0, "the board appoints a successor");
	assert.ok(M.player_events.some((t) => t.includes("board of your company") && t.includes(ch.name)), "the player is told");
});

// ---- Saves ----

test("chiefs: a save from before the pool loads: its chiefs and idle executives join the pool, the same each time", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 60);
	const M = m();
	// Make the market a 0.3 save: no "i|"/"I|" lines, company lines without
	// the chief field, idle executives as "a|" lines.
	const old = M.encode().split("\n").filter((l) => !l.startsWith("i|") && !l.startsWith("I|")).map((l) => (l.startsWith("c|") ? l.split("|").slice(0, 68).join("|") : l));
	old.push("a|Pool Person:2:Old Co", "a|Shady Dealer:3:Other Co");
	const text = old.join("\n");
	const before = new Map(M.companies.filter((c) => c.listed()).map((c) => [c.id, { ceo: c.ceo, trait: c.trait, since: c.ceo_since }]));
	const A = new (M.constructor)(); A.decode(text);
	const B = new (M.constructor)(); B.decode(text);
	assert.equal(A.encode(), B.encode(), "the same pool each time");
	assert.equal(A.chiefs.length, A.execs.POOL_SIZE);
	assert.equal(A.executives.length, 0);
	for (const [id, was] of before) {
		const c = A.by_id.get(id);
		const ch = A.chief_by_id.get(c.chief);
		assert.ok(ch, `${c.name} keeps a chief`);
		assert.equal(ch.name, was.ceo, "the same chief");
		assert.equal(c.ceo_since, was.since, "in office since the same day");
		assert.equal(A.execs.style(ch), was.trait, "who runs it the same way");
		assert.ok(ch.retires > A.day, "not retiring at once");
	}
	const pool = A.chiefs.find((ch) => ch.name === "Pool Person");
	assert.ok(pool && pool.company === 0 && A.execs.style(pool) === 2, "an idle executive is free in the pool");
	assert.match(pool.stints[0], /^Old Co~/);
	assert.equal(A.execs.style(A.chiefs.find((ch) => ch.name === "Shady Dealer")), 3);
	assert.ok(A.must_save, "saved in the new form");
	// It plays on, and saves round-trip.
	mod.market = A;
	days(mod, game, 40);
	const C = new (A.constructor)(); C.decode(A.encode());
	assert.equal(C.encode(), A.encode());
	assert.ok(A.encode().startsWith("corporations 2"));
});
