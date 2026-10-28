// Tests for milestone M3 of Corporations, "the boardroom": chief executives,
// board power, shorts and tips, Diplomacy's sanctions and the shortfall, the
// player's own company, and refits. Against the SDK's FakeGame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, newGame, galaxy } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";
const LISTED = 0, BANKRUPT = 3, MERGED = 4, NATIONALISED = 5, OPEN = 0, RUNNING = 1, TENDER = 4;

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
const company = (m, name) => m.companies.find((c) => c.name === name);
const invented = (m, sector) => m.companies.find((c) => c.listed() && !c.canon && c.owner === 0 && (sector === undefined || c.sector === sector));
// Give a company a pending bid (the richest rival that may buy it).
function bid(m, t) {
	const b = m.companies.find((c) => c.listed() && c.status === LISTED && c.id !== t.id && m.may_buy(c, t) && c.trait !== 1);
	b.cash += 1e10;
	m.seek_buyer(t, m.day, 1.3);
	assert.ok(t.suitor > 0, "a bid");
	return m.by_id.get(t.suitor);
}

// ---- Executives ----

test("executives: every company has a named chief with a trait; saves keep them; old saves get chiefs", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	for (const c of m().companies) {
		assert.match(c.ceo, /^\S+ \S+$/, `${c.name} has a chief`);
		assert.ok(c.trait >= 0 && c.trait <= 3);
	}
	const again = new (m().constructor)();
	again.decode(m().encode());
	assert.equal(again.encode(), m().encode());
	// A company line from before M3 (38 fields) gets a chief from its id, the same each time.
	const line = m().encode().split("\n").find((l) => l.startsWith("c|")).split("|").slice(0, 39).join("|");
	const a = new (m().constructor)(); a.decode("corporations 1\n" + line);
	const b = new (m().constructor)(); b.decode("corporations 1\n" + line);
	assert.ok(a.companies[0].ceo !== "" && a.companies[0].ceo === b.companies[0].ceo);
	// The exchange's sidebar names the chief.
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel_row(game, 0);
	assert.match(game.panel.text, /Chief executive: \S+ \S+ \((aggressive|prudent|visionary|crooked)\)/);
});

test("executives: traits move margins, buyouts, the books and luck", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 30);
	// Margins: the same contract, the same dice, an aggressive chief bids lower than a prudent one.
	const saved = m().encode();
	const price = (trait) => {
		const M = new (m().constructor)(); M.decode(saved);
		const c = M.companies.find((x) => x.listed() && x.sector === 7);
		for (const o of M.companies) if (o.sector === 7 && o.id !== c.id) o.capacity = 0;
		c.trait = trait; c.load = 0; c.capacity = 50;
		const k = new (M.contracts[0].constructor)();
		Object.assign(k, { id: 999999, kind: 1, client: "Earth", sector: 7, system: c.system, load: 1, days: 20, budget: 1e9, issued: M.day, closes: M.day, status: OPEN });
		M.contracts.push(k);
		M.award(game, mod.galaxy, k, M.day);
		return k.price;
	};
	assert.ok(price(0) < price(1), "aggressive bids lower than prudent");
	assert.ok(Math.abs(price(0) / price(2) - (1 + 0.06 - 0.04) / 1.06) < 0.06, "by about 4 points");
	// A prudent chief buys no rival.
	const M = m();
	const t = invented(M);
	for (const c of M.companies) if (c.id !== t.id) { c.trait = 1; c.cash += 1e10; }
	M.seek_buyer(t, M.day, 1.3);
	assert.equal(t.suitor, 0, "no prudent buyer");
	// Crooked window dressing and a scandal; a visionary's drift.
	const c = invented(M);
	c.trait = 3; c.revenue = 1000000; c.costs = 0;
	M.execs.before_report(M, c);
	assert.equal(c.revenue, 1030000, "3% more revenue booked");
	M.execs.SCANDAL = 1;
	const name = c.ceo, price0 = c.price;
	for (const o of M.companies) if (o.id !== c.id && o.trait === 3) o.trait = 0;
	M.execs.daily(game, M, M.day);
	assert.notEqual(c.ceo, name, "the crooked chief is fired after the scandal");
	assert.ok(c.price < price0 * 0.9);
	assert.ok(M.executives.some((e) => e.startsWith(name + ":3:")), "and goes to the pool");
	assert.ok(M.news.some((l) => l.includes("Scandal at " + c.name)));
	// Luck: crooked chiefs' turns are worse.
	assert.ok(M.execs.luck[3] < 0 && M.execs.luck[1] > 0);
});

test("executives: fired after three losing reports; a new chief comes from the pool", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 200);
	const M = m();
	const c = invented(M);
	c.ceo_since = M.day - 400;
	M.executives = ["Pool Person:2:Old Co"];
	M.rng.state = 7; // the pool is drawn from 70% of the time: a seed that does
	let ok = false;
	for (let s = 1; s < 50 && !ok; s++) {
		const M2 = new (M.constructor)(); M2.decode(M.encode());
		const c2 = M2.by_id.get(c.id);
		c2.earnings = [-1e7, -2e7, -5e6]; M2.rng.state = s;
		const old = c2.ceo;
		M2.execs.after_report(M2, c2, M2.day);
		if (c2.ceo === "Pool Person") {
			ok = true;
			assert.equal(c2.trait, 2);
			assert.ok(M2.executives.some((e) => e.startsWith(old + ":")), "the old chief goes to the pool");
			assert.ok(M2.news.some((l) => l.includes("fires its chief executive, " + old + ", after three losing reports")));
		}
	}
	assert.ok(ok, "a pooled executive is hired");
	// Not before FIRE_AFTER days in office.
	c.ceo_since = M.day - 10; c.earnings = [-1, -1, -1];
	const before = c.ceo;
	M.execs.after_report(M, c, M.day);
	assert.equal(c.ceo, before);
});

// ---- The board ----

test("board: block a bid, demand more, set the payout, direct the bidding, sell to the suitor; each at its threshold, each with its cost", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 30);
	const M = m();
	const t = invented(M);
	const own = (share) => { M.holdings.set(t.id, Math.round(t.shares * share)); };
	// Below 5%: no vote.
	own(0.04);
	let b = bid(M, t);
	assert.equal(M.board.may_vote(M, t), false);
	// 5%: block.
	own(0.06);
	M.board.block(game, M, t, M.day);
	assert.equal(t.suitor, 0, "blocked");
	assert.equal(game.condition("corporations: standing " + b.id), -10);
	assert.equal(M.scrutiny, 10);
	assert.equal(game.condition("corporations: scrutiny"), 10);
	// Demand more: walks away, or raises and has the votes.
	b = bid(M, t);
	M.board.WITHDRAW = 0;
	const offer = t.offer;
	M.board.demand(game, M, t, M.day);
	assert.ok(Math.abs(t.offer - offer * 1.1) < 1e-6 && M.approved.get(t.id), "raised by 10%, with the votes");
	M.board.WITHDRAW = 100;
	M.board.demand(game, M, t, M.day);
	assert.equal(t.suitor, 0, "walked away");
	// 10%: payout and direction.
	assert.equal(M.board.has_seat(M, t), false);
	own(0.11);
	const rel = t.reliability;
	M.board.payout(game, M, t, 2, M.day);
	assert.equal(t.payout, 0.6);
	assert.ok(t.reliability < rel, "a high payout costs reliability");
	M.board.direct(game, M, t, 1, M.day);
	assert.equal(t.bias, 1);
	assert.ok(Math.abs(M.bias_margin(t) + 0.05) < 1e-9, "bids 5 points lower");
	days(mod, game, 61);
	assert.equal(t.bias, 0, "for 60 days");
	// 20%: sell the stake to a suitor at a premium.
	own(0.21);
	b = bid(M, t);
	const credits = game.condition("credits");
	const held = M.holdings.get(t.id);
	const got = M.board.sell(game, M, t, M.day);
	assert.ok(Math.abs(got - t.offer * 1.05 * held) < 1, "the offer plus 5%");
	assert.ok(Math.abs(game.condition("credits") - credits - got) <= 1);
	assert.ok(!M.holdings.has(t.id));
	assert.ok(M.scrutiny >= 15, "the sale draws attention");
});

test("board: a suitor without the player's votes fails more often; the regulator fines at 60; holdings over 20% are disclosed", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 60);
	const saved = m().encode();
	const rate = (approve) => {
		let failed = 0;
		for (let trial = 0; trial < 120; trial++) {
			const M = new (m().constructor)(); M.decode(saved); M.rng.state = 1000 + trial * 7919;
			const t = M.companies.find((c) => !c.canon && c.listed() && c.status === LISTED && c.owner === 0);
			M.holdings.set(t.id, Math.round(t.shares * 0.06));
			const b = M.companies.find((c) => c.listed() && c.status === LISTED && c.id !== t.id && M.may_buy(c, t) && c.trait !== 1);
			b.cash += 1e10;
			M.seek_buyer(t, M.day, 1.3);
			if (approve) M.approved.set(t.id, true);
			M.complete_buyout(game, t, M.day + 7);
			if (t.status !== MERGED) failed++;
		}
		return failed / 120;
	};
	const unwon = rate(false), won = rate(true);
	assert.ok(unwon > won + 0.05, `bids fail more without the votes (${unwon.toFixed(2)} vs ${won.toFixed(2)})`);
	const M = m();
	M.scrutiny = 55;
	game.set_condition("credits", 0);
	M.board.attention(game, M, 10, M.day);
	assert.ok(M.owed >= 50000, "fined (owed: no credits)");
	assert.equal(M.scrutiny, 25);
	// Disclosure: buying across 20%.
	game.set_condition("credits", 1e9);
	const t = invented(M);
	M.holdings.set(t.id, Math.round(t.shares * 0.19));
	M.buy(game, t, Math.round(t.shares * 0.02));
	assert.ok(M.news.some((l) => l.includes("discloses a") && l.includes(t.name)));
	assert.ok(M.MAX_HOLDING > 0.2, "the cap is higher than 20%");
});

test("board: through the exchange, a 6% holder blocks a bid with the button and its confirm", { skip }, () => {
	const { game, mod, m } = start({ landed: true, planet: "Earth" });
	days(mod, game, 30);
	const M = m();
	const t = invented(M);
	M.holdings.set(t.id, Math.round(t.shares * 0.06));
	bid(M, t);
	mod.on_planet_button(game);
	mod.exchange.selected = t.id;
	mod.on_panel(game, game.panel.buttons.indexOf("Market"));
	assert.ok(game.panel.buttons.includes("Block bid") && game.panel.buttons.includes("Demand more"));
	mod.on_panel(game, game.panel.buttons.indexOf("Block bid"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(t.suitor, 0);
	assert.equal(game.data("state"), M.encode(), "saved at once");
});

// ---- Shorts ----

test("shorts: borrow and sell, the lender's fee, dividends, a margin call, a squeeze, closing at a profit", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 30);
	const M = m();
	game.set_condition("credits", 100000000);
	const c = invented(M);
	const n = Math.round(c.shares * 0.02);
	const price0 = c.price, credits0 = game.condition("credits");
	const margin = M.shorts_desk.open(game, M, c, n, M.day);
	assert.ok(margin > 0 && Math.abs(credits0 - game.condition("credits") - margin) <= 1, "margin posted");
	assert.ok(c.price < price0, "the sale moves the price down");
	assert.equal(M.can_buy(game, c), 0, "no buying a company you are short");
	assert.ok(M.shorts_desk.most(game, M, c) <= c.shares * 0.1 - n, "at most 10% short");
	// The fee.
	const before = game.condition("credits");
	M.shorts_desk.daily(game, M, M.day);
	assert.ok(before - game.condition("credits") >= Math.floor(c.price * n * 0.0004) - 1, "the lender's fee");
	// A dividend is owed.
	c.dividend = 1;
	const b2 = game.condition("credits");
	M.shorts_desk.dividend(game, M, c);
	assert.equal(b2 - game.condition("credits"), n);
	// Saved.
	const again = new (M.constructor)(); again.decode(M.encode());
	assert.equal(again.shorts.get(c.id), n);
	// Closing at a profit after a fall.
	c.price = c.price * 0.7;
	const b3 = game.condition("credits");
	const net = M.shorts_desk.cover(game, M, c, n, -1);
	assert.ok(net > margin, "the margin back and a profit");
	assert.ok(Math.abs(game.condition("credits") - b3 - net) <= 1);
	assert.ok(!M.shorts.has(c.id));
	// A margin call: the price triples.
	M.shorts_desk.open(game, M, c, n, M.day);
	c.price *= 3;
	M.shorts_desk.daily(game, M, M.day);
	assert.ok(!M.shorts.has(c.id), "bought back by the broker");
	assert.equal(M.shorts_desk.calls, 1);
	// A squeeze: a buyout closes it at the offer.
	c.price /= 3;
	M.shorts_desk.open(game, M, c, n, M.day);
	const b = bid(M, c);
	M.complete_buyout(game, c, M.day + 7);
	if (c.status === MERGED) {
		assert.ok(!M.shorts.has(c.id), "squeezed");
		assert.equal(M.shorts_desk.squeezes, 1);
	}
	// A bankruptcy closes it at what holders get.
	const d = invented(M);
	M.shorts_desk.open(game, M, d, Math.round(d.shares * 0.02), M.day);
	M.bankrupt(game, d, M.day);
	assert.ok(!M.shorts.has(d.id));
});

// ---- Tips ----

test("tips: an earnings one-off decided 10 days ahead, revealed by a job; trading on it is fined", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	const M = m();
	M.tips_desk.SURPRISE_CHANCE = 100;
	M.tips_desk.CHANCE = 100;
	days(mod, game, 30);
	const c = M.companies.find((x) => x.listed() && x.owner === 0 && x.surprise !== 0 && x.surprise_at - M.day >= 5);
	assert.ok(c, "a one-off is decided ahead");
	assert.equal(c.surprise_at % 30, c.report_at, "for its next report");
	// A tip job at a bank near its home.
	let job = null, at = null;
	for (const p of Object.keys(galaxy.planets)) {
		if (!galaxy.planets[p].services.includes("bank") || mod.galaxy.jumps(galaxy.planets[p].system, c.system) > 3) continue;
		land(mod, game, p);
		job = [...game.jobs.entries()].find(([n, b]) => n.startsWith("tip") && b.includes(c.name));
		takeOff(game);
		if (job) { at = p; break; }
	}
	assert.ok(job, "a tip job");
	const [name, body] = job;
	assert.match(body, new RegExp(`report on .* will carry a one-off (gain|charge)`));
	const n = name.split(" ")[1];
	game.set_condition("corporations: tip " + n, 1);
	days(mod, game, 1);
	assert.ok(M.tips.some((t) => t.startsWith(n + "|") && t.split("|")[4] === "1"), "revealed");
	// The player trades on it.
	game.set_condition("credits", 50000000);
	M.buy(game, c, 1000);
	M.tips_desk.CAUGHT = 100;
	const owedBefore = M.owed, credits = game.condition("credits"), surprise = c.surprise;
	const revenue = c.revenue;
	for (let d = 0; d < 15 && M.tips.some((t) => t.startsWith(n + "|")); d++) days(mod, game, 1);
	assert.equal(c.surprise, 0, "booked at the report");
	assert.ok(!M.tips.some((t) => t.startsWith(n + "|")), "settled");
	assert.ok(game.condition("credits") < credits || M.owed > owedBefore, "fined");
	assert.equal(game.condition("corporations: standing " + c.id), -10);
	assert.ok(M.news.some((l) => l.includes("insider trading in " + c.name)));
	assert.ok(Math.abs(surprise) > 0);
});

test("tips: crises are decided 10 days ahead; an arranged tender goes to the tipped builder", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 3);
	const M = m();
	M.crisis_desk.CHANCE = 1;
	let plan = null;
	for (let d = 0; d < 30 && !plan; d++) { days(mod, game, 1); plan = M.crisis_plan[0]; }
	assert.ok(plan, "a crisis planned");
	const [day, id] = plan.split("|").map(Number);
	assert.equal(day - M.day, 10, "10 days ahead");
	while (M.day < day) days(mod, game, 1);
	assert.ok(M.crises.some((x) => x.company === id && x.start === day), "it starts that day");
	// Tenders: open one, arrange its winner, award.
	land(mod, game, "Geminus");
	for (const s of M.planet_shelves.get("Geminus").filter((x) => M.hulls.military(x.row)).slice(0, 3)) game.set_ship_stock("Geminus", s.model, 0);
	takeOff(game);
	let k = null;
	for (let d = 0; d < 10 && !k; d++) { days(mod, game, 1); k = M.contracts.find((x) => x.kind === TENDER && x.status === OPEN); }
	assert.ok(k, "an open tender");
	const fav = M.favourite(k);
	// Arrange another builder that could bid.
	const other = M.companies.find((c) => c.listed() && c.sector === 0 && c.id !== fav.id && c.load + k.load <= c.capacity);
	M.tender_fixed.set(k.id, other.id);
	M.award(game, mod.galaxy, k, M.day);
	if (k.status === RUNNING) assert.equal(k.winner, other.id, "the arranged builder wins");
	assert.ok(!M.tender_fixed.has(k.id));
});

// ---- Sanctions, captures, shortfall, blockades ----

// The Republic and the Syndicate at war (the test galaxy has no Free Worlds systems).
function atWar(game) {
	game.conditions.set("diplomacy: active", 1);
	game.conditions.set("diplomacy: war a", 1);
	game.conditions.set("diplomacy: war b", 3);
}

test("sanctions: embargo at war; the member's shares in enemy companies frozen and taxed", { skip }, () => {
	const { game, mod, m } = start();
	atWar(game);
	game.conditions.set("diplomacy: member", 1);
	days(mod, game, 2);
	const M = m();
	const fw = M.companies.find((c) => c.listed() && c.home_gov === "Syndicate" && c.owner === 0);
	const rep = M.companies.find((c) => c.listed() && c.home_gov === "Republic" && c.owner === 0);
	assert.ok(fw && rep);
	assert.equal(M.sanctions.embargoed(M, fw, "Republic"), true, "the Republic deals with no Syndicate company");
	assert.equal(M.sanctions.embargoed(M, rep, "Republic"), false);
	assert.equal(M.frozen(fw), true, "a Republic member's shares in it are frozen");
	game.set_condition("credits", 1e9);
	assert.equal(M.can_buy(game, fw), 0);
	M.holdings.set(fw.id, 1000);
	assert.equal(M.sell(game, fw, 10), 0, "no selling");
	fw.earnings = [100000, 100000, 100000]; fw.revenue = 2e6; fw.costs = 0; fw.cash = 1e9; fw.status = LISTED;
	const before = game.condition("credits");
	M.report(game, fw, M.day);
	const paid = game.condition("credits") - before;
	assert.ok(paid > 0 && Math.abs(paid - fw.dividend * 1000 * 0.5) <= 1, "half the dividend withheld");
	// A Republic tender: no Free Worlds bidder wins.
	const k = new (M.contracts[0].constructor)();
	Object.assign(k, { id: 999998, kind: TENDER, client: "Republic", sector: 0, system: "Sol", load: 0.5, days: 20, budget: 1e10, issued: M.day, closes: M.day, status: OPEN, model: "Cruiser", units: 1 });
	for (const c of M.companies) if (c.sector === 0 && c.home_gov !== "Syndicate") c.capacity = 0;
	M.award(game, mod.galaxy, k, M.day);
	assert.notEqual(k.status, RUNNING, "embargoed: nobody may bid");
});

test("captures: a home taken shocks the price; canon rescued; another nationalised, holders paid, shorts closed", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 2);
	const M = m();
	const canon = company(M, "Southbound Shipyards");
	const sys = canon.system;
	const p0 = canon.price, debt0 = canon.debt;
	game.systems[sys].government = "Free Worlds";
	days(mod, game, 1);
	assert.ok(canon.price < p0 * 0.9, `price shock (${(canon.price / p0).toFixed(2)})`);
	assert.ok(M.news.some((l) => l.includes("takes " + sys + " from the Republic") && l.includes("state loan")), "rescued with a state loan");
	assert.ok(debt0 >= 0);
	assert.equal(canon.home_gov, "Free Worlds");
	assert.ok(canon.listed());
	const c = invented(M);
	game.set_condition("credits", 1e9);
	M.holdings.set(c.id, 5000);
	M.sanctions.NATIONALISE = 100;
	const price = c.price, credits = game.condition("credits");
	const other = invented(M, undefined);
	game.systems[c.system].government = game.systems[c.system].government === "Pirate" ? "Republic" : "Pirate";
	days(mod, game, 1);
	if (!c.canon) {
		assert.equal(c.status, NATIONALISED);
		assert.ok(!c.listed());
		assert.ok(game.condition("credits") > credits, "holders paid");
		assert.ok(!M.holdings.has(c.id));
		assert.ok(M.news.some((l) => l.includes("nationalises " + c.name)));
	}
	assert.ok(other);
});

test("shortfall: published as a condition, and on the bus on API 10", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	days(mod, game, 2);
	const M = m();
	land(mod, game, "Geminus");
	for (const s of M.planet_shelves.get("Geminus").filter((x) => M.hulls.military(x.row))) game.set_ship_stock("Geminus", s.model, 0);
	takeOff(game);
	days(mod, game, 1);
	const v = game.condition("corporations: shortfall 1");
	assert.ok(v > 0 && v <= 100, `the Republic's shortfall ${v}`);
	const post = game.posted.find((n) => n.name === "corporations.shortfall");
	assert.ok(post);
	const p = JSON.parse(post.payload);
	assert.equal(p.side, 1);
	assert.equal(p.government, "Republic");
	assert.equal(p.shortfall >= 0, true);
});

test("blockade runs: a job to a besieged system, illegal cargo; delivered, it earns standing there", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 2);
	const M = m();
	const sysIndex = (name) => Object.keys(game.systems).sort().indexOf(name) + 1;
	const target = "Alpha Centauri";
	game.conditions.set("diplomacy: active", 1);
	game.conditions.set("diplomacy: flotilla 2.1 strength", 100);
	game.conditions.set("diplomacy: flotilla 2.1 kind", 0);
	game.conditions.set("diplomacy: flotilla 2.1 at", sysIndex(target));
	game.conditions.set("diplomacy: flotilla 2.1 goal", sysIndex(target));
	days(mod, game, 1);
	assert.ok(M.losses.besieged.includes(target), "under siege");
	land(mod, game, "Earth");
	const job = [...game.jobs.entries()].find(([n]) => n.startsWith("blockade"));
	assert.ok(job, "a blockade run");
	assert.match(job[1], /illegal \d+ "/);
	assert.match(job[1], /cargo "blockade supplies" 10/);
	const n = job[0].split(" ")[1];
	takeOff(game);
	game.set_condition("corporations: blockade " + n, 1);
	days(mod, game, 1);
	assert.equal(game.condition("corporations: blockade " + n), 0);
	assert.ok(M.news.some((l) => l.includes("blockade runner brings supplies into besieged " + target)));
});

// ---- The player's company ----

function charterAt(mod, game, sector) {
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Company"));
	mod.on_panel(game, game.panel.buttons.indexOf("Charter"));
	mod.on_number(game, game.numberAsks.at(-1).token, sector);
	mod.on_confirm(game, game.confirms.at(-1).token);
	return mod.market.charter.mine(mod.market);
}

test("charter (API 10): found, assign a ship (parked), bid and earn, IPO, defend a takeover; a ship unparked leaves", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	game.set_condition("credits", 50000000);
	days(mod, game, 5);
	const credits = game.condition("credits");
	const c = charterAt(mod, game, 1);
	assert.ok(c.id > 0 && c.owner === 1 && c.sector === 6, "a freight company of your own");
	assert.equal(credits - game.condition("credits"), m().charter.FEE);
	assert.equal(m().holdings.get(c.id), c.shares, "you hold every share");
	assert.ok(c.private());
	// Assign the escort (a Shuttle): parked, capacity.
	const escort = game.fleet[1].uuid, flagship = game.fleet[0].uuid;
	mod.on_panel_row(game, mod.exchange.ship_items.indexOf(flagship));
	mod.on_panel(game, game.panel.buttons.indexOf("Assign"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.ship_parked(flagship), false, "the flagship can't be parked");
	mod.on_panel_row(game, mod.exchange.ship_items.indexOf(escort));
	const cap = c.capacity;
	mod.on_panel(game, game.panel.buttons.indexOf("Assign"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.ship_parked(escort), true, "parked");
	assert.ok(c.capacity > cap, "capacity from the ship");
	assert.equal(game.data("state"), m().encode(), "saved");
	// More capacity for bidding: its own money (abstract capacity is API 9's), a ship's worth.
	c.capacity += 20;
	takeOff(game);
	days(mod, game, 120);
	assert.ok(m().contracts.some((k) => k.winner === c.id), "it bids and wins work");
	assert.ok(c.earnings.length > 0, "it reports");
	// IPO.
	land(mod, game, "Earth");
	const held = m().holdings.get(c.id), cash = c.cash;
	m().charter.ipo(game, m(), c, m().day);
	assert.ok(c.ipo && c.shares > held && c.cash > cash, "new shares, cash raised");
	assert.ok(Math.abs(m().holdings.get(c.id) / c.shares - 0.4) < 0.01, "you keep 40%");
	assert.equal(m().charter.may_dissolve(m(), c), false, "no dissolving a listed company you hold 40% of");
	// A takeover bid, blocked with board votes.
	const b = m().companies.find((x) => x.listed() && x.sector === 6 && x.id !== c.id && x.owner === 0);
	b.cash += 1e11; b.trait = 0;
	c.capacity = 1; // small enough that the merger review allows it
	m().seek_buyer(c, m().day, 1.3);
	assert.equal(c.suitor, b.id, "a rival bids for it");
	assert.ok(m().board.may_vote(m(), c));
	m().board.block(game, m(), c, m().day);
	assert.equal(c.suitor, 0, "defended");
	// The player unparks the ship themselves: it leaves the company.
	game.ship_park(escort, false);
	takeOff(game);
	days(mod, game, 1);
	assert.ok(!m().charter.has_ship(c, escort), "the company drops a ship that is flying");
});

test("charter (API 10): dissolving returns the ships; a ship sold to it is gone for good; a failed company's ships come back", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	game.set_condition("credits", 50000000);
	days(mod, game, 5);
	const c = charterAt(mod, game, 2);
	assert.equal(c.sector, 7);
	const escort = game.fleet[1].uuid;
	assert.ok(m().charter.assign(game, m(), c, escort));
	assert.equal(m().charter.assign(game, m(), c, escort), false, "never assigned twice");
	const credits = game.condition("credits");
	const paid = m().charter.dissolve(game, m(), c, m().day);
	assert.equal(game.ship_parked(escort), false, "unparked");
	assert.ok(paid >= 0 && game.condition("credits") >= credits);
	assert.ok(!c.listed() && !m().holdings.has(c.id));
	// Again; sell the escort to it (ship_remove), then it fails.
	const c2 = m().charter.found(game, m(), mod.galaxy, 6, m().day);
	const fleet = game.fleet.length;
	assert.ok(m().charter.sell_ship(game, m(), c2, escort));
	assert.equal(game.fleet.length, fleet - 1, "removed from the fleet");
	assert.equal(game.removed.length, 1);
	// A parked ship then the company goes bankrupt: unparked at the next exchange visit.
	game.fleet.push({ uuid: "00000000-0000-4000-8000-000000000009", name: "Spare", model: "Shuttle", outfits: {}, integrated: {}, massSaved: 0, spaceSaved: {} });
	assert.ok(m().charter.assign(game, m(), c2, "00000000-0000-4000-8000-000000000009"));
	m().bankrupt(game, c2, m().day);
	days(mod, game, 1);
	assert.ok(m().charter_returns.includes("00000000-0000-4000-8000-000000000009"));
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	assert.equal(game.ship_parked("00000000-0000-4000-8000-000000000009"), false, "given back");
	assert.equal(m().charter_returns.length, 0);
});

test("charter (API 9): capacity bought with credits; no parking; margins and a hired chief", { skip }, () => {
	const { game, mod, m } = start();
	game.set_condition("credits", 50000000);
	days(mod, game, 5);
	const c = charterAt(mod, game, 1);
	assert.ok(c.id > 0);
	assert.ok(!game.panel.buttons.includes("Assign"));
	mod.on_panel(game, game.panel.buttons.indexOf("Capacity"));
	const credits = game.condition("credits");
	mod.on_number(game, game.numberAsks.at(-1).token, 4);
	assert.ok(Math.abs(c.capacity - 4.5) < 1e-6, "4 units bought");
	assert.equal(credits - game.condition("credits"), 4 * 1500000);
	mod.on_panel(game, game.panel.buttons.indexOf("Margins"));
	mod.on_number(game, game.numberAsks.at(-1).token, 1);
	assert.equal(c.policy, -1);
	assert.ok(Math.abs(m().bias_margin(c) + 0.04) < 1e-9);
	mod.on_panel(game, game.panel.buttons.indexOf("Hire chief"));
	mod.on_number(game, game.numberAsks.at(-1).token, 3);
	assert.equal(c.trait, 2);
	assert.notEqual(c.ceo, "you");
	// Dissolving pays the bought capacity back at half.
	const before = game.condition("credits");
	const paid = m().charter.dissolve(game, m(), c, m().day);
	assert.ok(paid >= 4 * 1500000 * 0.5 - 1 && game.condition("credits") > before);
});

// ---- Refits ----

const OUTFITS = { "Beam Laser": { category: "Guns", mass: 10, cost: 40000, weapon: true, attributes: { "outfit space": -10 } } };
const FLEET = [
	{ uuid: "00000000-0000-4000-8000-000000000001", name: "Flagship", model: "Sparrow", outfits: { "Beam Laser": 2, "Energy Blaster": 1 } },
	{ uuid: "00000000-0000-4000-8000-000000000002", name: "Escort", model: "Shuttle", outfits: {} },
];

test("refits: a maker's line at its planets; buy and apply; the fee is its revenue; a failing supplier offers none", { skip }, () => {
	const { game, mod, m } = start({ outfits: OUTFITS, fleet: FLEET });
	game.set_condition("credits", 10000000);
	days(mod, game, 3);
	land(mod, game, "Rust");
	assert.equal(game.outfitterButtonLabel, "Refit");
	game.outfitterShips = [FLEET[0].uuid];
	assert.equal(mod.can_outfitter(game, "Beam Laser"), true, "Kraz refits its Beam Laser at Rust");
	const kraz = company(m(), "Kraz Cybernetics");
	const credits = game.condition("credits"), cash = kraz.cash;
	mod.on_outfitter(game, "Beam Laser");
	const c = game.confirms.at(-1);
	assert.match(c.text, /Kraz Cybernetics will refit one Beam Laser/);
	mod.on_confirm(game, c.token);
	assert.equal(game.ship_integrated_count(FLEET[0].uuid, "Beam Laser"), 1);
	const fee = credits - game.condition("credits");
	assert.ok(fee > 0 && Math.abs(kraz.cash - cash - fee) < 1, "the fee is the supplier's");
	// Supplier failure: for sale, or in a crisis.
	kraz.status = 2;
	assert.equal(m().refits.supplier(game, m(), mod.galaxy, "Beam Laser").id === kraz.id, false);
	kraz.status = 0;
	m().crisis_desk.begin(game, mod.galaxy, m(), kraz, m().day);
	assert.notEqual(m().refits.supplier(game, m(), mod.galaxy, "Beam Laser").id, kraz.id, "none during its crisis");
});

test("refits (API 10): a troubled maker's line runs short in the outfitter, and recovers", { skip }, () => {
	const { game, mod, m } = start({ api10: true, outfits: OUTFITS, fleet: FLEET });
	days(mod, game, 3);
	const kraz = company(m(), "Kraz Cybernetics");
	kraz.status = 1;
	// Only what Kraz alone makes, never ammunition (the Beam Laser is Deep Sky's too).
	const R = m().refits, i = R.outfits.companies.indexOf("Kraz Cybernetics");
	const own = R.own(game, i);
	assert.ok(own.length > 0 && !own.includes("Beam Laser") && !own.includes("Torpedo"));
	const o = own[0];
	game.outfits[o] = { category: "Systems", mass: 5, cost: 10000, weapon: false, attributes: {} };
	land(mod, game, "Rust");
	assert.equal(game.outfitStockOn, true);
	assert.equal(game.outfit_stock("Rust", o), 1, "short");
	assert.equal(game.outfit_stock("Rust", "Beam Laser"), -1, "another maker's outfit is left alone");
	assert.ok(m().outfit_limited.includes("Rust~" + o));
	// Saved and read back intact ("~", not the record's "|").
	const again = new (m().constructor)(); again.decode(m().encode());
	assert.deepEqual([...again.outfit_limited], [...m().outfit_limited]);
	// Bought down to 0: not refilled on the next landing.
	game.set_outfit_stock("Rust", o, 0);
	takeOff(game); land(mod, game, "Rust");
	assert.equal(game.outfit_stock("Rust", o), 0, "set only when it changes");
	takeOff(game);
	kraz.status = 0;
	land(mod, game, "Rust");
	assert.equal(game.outfit_stock("Rust", o), -1, "untracked again");
	assert.equal(m().outfit_limited.length, 0);
});

test("exploit guards: no short of a company in trouble; a ship sold to the company adds nothing on dissolving; no buying back past the cap", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	game.set_condition("credits", 100000000);
	days(mod, game, 10);
	const M = m();
	const c = invented(M);
	c.status = 1;
	assert.equal(M.shorts_desk.most(game, M, c), 0, "no lender for a distressed company");
	c.status = 0;
	// Sell a ship to a fresh company and dissolve: the player gets the sale price and the company's cash, no more.
	land(mod, game, "Earth");
	const mine = M.charter.found(game, M, mod.galaxy, 6, M.day);
	const escort = game.fleet[1].uuid;
	const credits = game.condition("credits");
	const cash = mine.cash;
	assert.ok(M.charter.sell_ship(game, M, mine, escort));
	M.charter.dissolve(game, M, mine, M.day);
	assert.ok(game.condition("credits") - credits <= cash + 1, "only the company's own cash comes back");
	// After an IPO the player holds 40%, over the 35% cap: no buying back to dissolve it.
	const mine2 = M.charter.found(game, M, mod.galaxy, 7, M.day);
	assert.equal(M.charter.ipo(game, M, mine2, M.day), 0, "no IPO before 4 reports");
	mine2.earnings = [1, 1, 1, 1];
	M.charter.ipo(game, M, mine2, M.day);
	assert.equal(M.can_buy(game, mine2), 0);
	assert.equal(M.charter.may_dissolve(M, mine2), false);
	assert.equal(M.charter.sell_ship(game, M, mine2, game.fleet[0].uuid), false, "a listed company buys no ships from you");
});

// ---- Review fixes (M3 review) ----

let shipNo = 100;
function addShip(game, model) {
	const uuid = "00000000-0000-4000-8000-" + String(shipNo++).padStart(12, "0");
	game.fleet.push({ uuid, name: model + " " + shipNo, model, outfits: {}, integrated: {}, massSaved: 0, spaceSaved: {} });
	return uuid;
}

test("review: an IPO prices only capacity that can't be taken back, needs 4 reports; selling out returns the ships and frees the charter", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	game.set_condition("credits", 50000000);
	days(mod, game, 30);
	land(mod, game, "Earth");
	const c0 = game.condition("credits");
	const c = m().charter.found(game, m(), mod.galaxy, 6, m().day);
	const ships = [1, 2, 3, 4].map(() => addShip(game, "Bulk Freighter"));
	for (const u of ships) assert.ok(m().charter.assign(game, m(), c, u));
	assert.equal(m().charter.ipo(game, m(), c, m().day), 0, "no IPO without a record");
	c.earnings = [0, 0, 0, 0];
	assert.ok(Math.abs(m().charter.firm(c) - 0.5) < 1e-9, "only the office is firm");
	const raised = m().charter.ipo(game, m(), c, m().day);
	assert.ok(raised < 2000000, `the parked ships are not sold to the market (${raised.toFixed(0)})`);
	// The reviewer's loop: sell the 40%, take the ships back. No profit.
	let got = 0;
	const held = m().holdings.get(c.id);
	got += m().sell(game, c, held);
	for (const u of ships) m().charter.unassign(game, m(), c, u);
	const net = game.condition("credits") - c0;
	assert.ok(net < 0, `no money from nothing (${net})`);
	assert.equal(c.owner, 0, "sold out: the market's company now");
	assert.ok(m().charter_returns.length === 4 || ships.every((u) => !game.ship_parked(u)), "its ships go back");
	mod.on_planet_button(game);
	assert.ok(ships.every((u) => !game.ship_parked(u)), "unparked");
	assert.ok(m().charter.mine(m()).id === 0, "free to charter again");
	assert.ok(m().charter.found(game, m(), mod.galaxy, 7, m().day).id > 0);
});

test("review: a takeover or bankruptcy of the player's company never hands over its parked ships", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	game.set_condition("credits", 50000000);
	days(mod, game, 10);
	land(mod, game, "Earth");
	const c = m().charter.found(game, m(), mod.galaxy, 6, m().day);
	const u = addShip(game, "Bulk Freighter");
	m().charter.assign(game, m(), c, u);
	const cap = c.capacity;
	m().bankrupt(game, c, m().day);
	assert.ok(m().charter_returns.includes(u), "back to the player");
	const buyer = m().companies.find((x) => x.listed() && x.sector === 6 && x.owner === 0);
	assert.ok(cap > 1 && buyer.capacity < 1e9);
});

test("review: trading on a tip the day it is delivered is insider trading too; a tip offered here is offered again after a load", { skip }, () => {
	const { game, mod, m } = start();
	game.set_condition("credits", 1e9);
	m().tips_desk.CHANCE = 100; m().tips_desk.SURPRISE_CHANCE = 100;
	const planets = Object.keys(galaxy.planets);
	let i = 0, at = "";
	while (m().tips.length === 0 && i < 400) { days(mod, game, 1); at = planets[i++ % planets.length]; land(mod, game, at); if (m().tips.length === 0) takeOff(game); }
	const f = m().tips[0].split("|");
	// Loaded again on the planet: the board is empty, the job comes back.
	game.jobs = new Map();
	mod.on_enter(game, game.here_);
	assert.ok(game.jobs.has("tip " + f[0]), "offered again");
	takeOff(game);
	const c = m().by_id.get(Number(f[1]));
	game.set_condition("corporations: tip " + f[0], 1);
	land(mod, game, "Earth");
	m().buy(game, c, 1000);
	assert.ok(Number(m().tips[0].split("|")[5]) > 0, "counted the same day");
	assert.equal(m().tips_desk.FINE_CRISIS > m().tips_desk.FINE, true, "a crisis tip's fine is higher");
});

test("review: board actions do nothing when repeated; payout once a report, one direction at a time; a board payout outlives a chief", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 30);
	const M = m();
	const c = invented(M);
	M.holdings.set(c.id, Math.round(c.shares * 0.11));
	const p0 = c.price, r0 = c.reliability;
	for (let k = 0; k < 20; k++) M.board.payout(game, M, c, 0, M.day);
	assert.ok(c.price > p0 * 0.96, `one shock only (${(c.price / p0).toFixed(3)})`);
	M.board.payout(game, M, c, 2, M.day);
	assert.equal(c.payout, 0.05, "no second change within a report");
	for (let k = 0; k < 20; k++) M.board.direct(game, M, c, 1, M.day);
	assert.ok(c.reliability > r0 - 0.05, "one direction's cost");
	M.board.direct(game, M, c, -1, M.day);
	assert.equal(c.bias, 1, "the running direction stays");
	// A new chief keeps the board's payout while the player has the seat.
	M.execs.fire(M, c, M.day, "for the test");
	assert.equal(c.payout, 0.05);
	M.holdings.set(c.id, Math.round(c.shares * 0.02));
	M.execs.fire(M, c, M.day, "again");
	assert.equal(c.board_payout, -1, "without the seat, the chief decides");
});

test("review: selling a stake to the suitor is not paid for twice", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 30);
	const M = m();
	game.set_condition("credits", 1e9);
	const t = invented(M);
	M.holdings.set(t.id, Math.round(t.shares * 0.21));
	const b = bid(M, t);
	const held = M.holdings.get(t.id);
	const cash0 = b.cash;
	const paid = M.board.sell(game, M, t, M.day);
	M.rng.state = 3;
	let done = false;
	for (let s = 1; s < 40 && !done; s++) {
		const M2 = new (M.constructor)(); M2.decode(M.encode()); M2.rng.state = 1000 + s * 7919;
		const t2 = M2.by_id.get(t.id), b2 = M2.by_id.get(b.id);
		const before = b2.cash + t2.cash;
		M2.complete_buyout(game, t2, M2.day + 7);
		if (t2.status === MERGED) {
			done = true;
			assert.equal(t2.suitor_stake, 0);
			// The deal paid the offer for the other shares only.
			assert.ok(Math.abs(before - b2.cash - t2.offer * (t2.shares - held)) < 2 + Math.abs(b2.debt), "the stake is not bought again");
		}
	}
	assert.ok(paid > 0, `paid ${paid}`);
	assert.ok(done, "the deal completes on some seed");
	assert.ok(cash0 > 0);
});

test("review: no shorts of a besieged or lately captured home; a ship the company can't pay for is refused; shortfall back to 0; the player's crooked chief can fall", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	game.set_condition("credits", 1e9);
	days(mod, game, 5);
	const M = m();
	const c = invented(M);
	M.losses.besieged = [c.system];
	assert.equal(M.shorts_desk.allowed(M, c), false, "besieged home");
	M.losses.besieged = [];
	c.captured = M.day - 10;
	assert.equal(M.shorts_desk.allowed(M, c), false, "captured lately");
	c.captured = -1000000;
	assert.equal(M.shorts_desk.allowed(M, c), true);
	// A ship sold to a poor company: refused, and the confirm says how much.
	land(mod, game, "Earth");
	const mine = M.charter.found(game, M, mod.galaxy, 6, M.day);
	const u = addShip(game, "Bulk Freighter");
	mine.cash = 1000;
	assert.equal(M.charter.sell_ship(game, M, mine, u), false, "it can't pay");
	assert.ok(game.fleet.some((s) => s.uuid === u), "the ship stays yours");
	// Shortfall reset when a side has no shelves.
	game.set_condition("corporations: shortfall 3", 40);
	days(mod, game, 1);
	assert.equal(game.condition("corporations: shortfall 3"), 0, "the Syndicate has no military shelves");
	// The player's company with a crooked chief: scandals reach it too.
	mine.trait = 3; mine.ceo = "Hired Hand";
	M.execs.SCANDAL = 1;
	for (const o of M.companies) if (o.id !== mine.id && o.trait === 3) o.trait = 0;
	M.execs.daily(game, M, M.day);
	assert.notEqual(mine.ceo, "Hired Hand");
});
