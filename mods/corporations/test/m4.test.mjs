// Tests for milestone M4 of Corporations, "growth and innovation": the
// scale (billions), demand anchored to an economy, technology and research,
// corporate finance (growth, offerings, buybacks, splits), the player's
// company at three sizes with injections, takeovers by it, the board's new
// powers, breakthrough tips, saving, and the migration of a market from
// before M4. Against the SDK's FakeGame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMod, newGame } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";
const HERE = dirname(fileURLToPath(import.meta.url));
const LISTED = 0, MERGED = 4;

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
const listed = (m) => m.companies.filter((c) => c.listed());

// ---- Scale ----

test("scale: established companies near a billion, newcomers at 1M, 10M or 100M; the exchange in the tens of billions", { skip }, () => {
	const { m } = start();
	const M = m();
	const canon = listed(M).filter((c) => c.canon);
	assert.equal(canon.length, 15);
	for (const c of canon) assert.ok(c.market_value() > 4e8 && c.market_value() < 3e9, `${c.name} ${c.market_value()}`);
	const others = listed(M).filter((c) => !c.canon).map((c) => c.market_value());
	assert.ok(others.some((v) => v < 5e6), "some about 1M");
	assert.ok(others.some((v) => v > 5e6 && v < 5e7), "some about 10M");
	assert.ok(others.some((v) => v > 5e7 && v < 5e8), "some about 100M");
	const total = listed(M).reduce((s, c) => s + c.market_value(), 0);
	assert.ok(total > 1e10 && total < 5e10, `exchange ${total}`);
	// Canonical companies have more shares, and every price is a sensible number.
	assert.ok(Math.min(...canon.map((c) => c.shares)) > Math.max(...listed(M).filter((c) => !c.canon && c.market_value() < 5e6).map((c) => c.shares)));
	for (const c of listed(M)) assert.ok(c.price > 1 && c.price < 200, `${c.name} at ${c.price}`);
	// Technology: established companies ahead of newcomers.
	const avg = (xs) => xs.reduce((s, c) => s + c.tech[0] + c.tech[1] + c.tech[2], 0) / xs.length;
	assert.ok(avg(canon) > avg(listed(M).filter((c) => !c.canon)) + 6);
});

// ---- The economy ----

test("demand: each sector's base demand is set at the start and grows with the economy; contracts fit the companies", { skip }, () => {
	const { game, mod, m } = start();
	const M = m();
	assert.equal(M.demand_base.length, 8);
	assert.ok(M.demand_base.every((x) => x > 0));
	assert.ok(Math.abs(M.economy(M.econ_day + 365) - (1 + M.ECON_GROWTH)) < 1e-9);
	days(mod, game, 60);
	// Small companies get small contracts: some under a hundredth of a unit, some over one.
	const loads = m().contracts.filter((k) => k.kind <= 1).map((k) => k.load);
	assert.ok(loads.some((l) => l < 0.01) && loads.some((l) => l > 1), `loads ${Math.min(...loads)}..${Math.max(...loads)}`);
	// Every company with yards has had work.
	const busy = listed(m()).filter((c) => m().contracts.some((k) => k.winner === c.id));
	assert.ok(busy.length >= listed(m()).length * 0.8, `${busy.length} of ${listed(m()).length} have won work`);
});

test("bids: a cheaper company both wins and earns more; work under 2% of a company's capacity is not bid for", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 10);
	const M = m();
	const c = listed(M).find((x) => x.sector === 5);
	const k = new (M.contracts[0].constructor)();
	Object.assign(k, { id: 999999, kind: 1, client: "Earth", sector: 5, system: c.system, load: 1, days: 20, budget: 1e12 });
	const est = (cf) => k.load * k.days * M.VARIABLE * cf;
	const lo = M.quote(k, c, est(0.7), 0.2), hi = M.quote(k, c, est(1.0), 0.2);
	assert.ok(lo < hi, "lower cost, lower bid");
	assert.ok(lo - est(0.7) > hi - est(1.0), "and a larger margin on it");
	// Too small: a big company does not bid.
	for (const o of M.companies) if (o.sector === 5 && o.id !== c.id) o.capacity = 0;
	c.capacity = 10; c.load = 0;
	Object.assign(k, { load: 0.05, status: 0 });
	M.contracts.push(k);
	M.award(game, mod.galaxy, k, M.day);
	assert.notEqual(k.winner, c.id, "work under 2% of its capacity");
});

// ---- Technology ----

test("research: spending reaches a breakthrough; levels are kept; process cuts costs, scale adds work, quality reliability", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	const M = m(), R = M.research;
	const c = listed(M).find((x) => !x.canon && x.sector === 6);
	c.rd = 4; c.focus = 1; c.cash = 1e12;
	const level = c.tech[1], eff = M.eff(c), news = M.news.length, price = c.price;
	c.progress = R.cost(M, c, 1) * c.luck - 1;
	R.daily(game, M, M.day);
	assert.equal(c.tech[1], level + 1, "a level of scale");
	assert.ok(M.eff(c) > eff, "more work from the same yards");
	assert.ok(c.price > price, "its shares rise");
	assert.ok(M.news.slice(news).some((l) => l.includes("breakthrough in throughput")));
	// The effects, level by level, with diminishing returns.
	const p = { tech: [0, 0, 0], efficiency: 1 }, q = { tech: [8, 8, 8], efficiency: 1 }, r = { tech: [16, 16, 16], efficiency: 1 };
	assert.ok(R.cost_factor(q) < R.cost_factor(p) && R.cost_factor(r) < R.cost_factor(q));
	assert.ok(R.cost_factor(p) - R.cost_factor(q) > R.cost_factor(q) - R.cost_factor(r), "diminishing");
	assert.ok(R.scale_factor(q) > 1.2 && R.scale_factor(r) < 1.5);
	assert.ok(R.quality_base(r) > R.quality_base(p) + 0.2);
	// Spending is a cost: it lowers the month's earnings, and the market adds part back.
	const costs = c.costs;
	R.daily(game, M, M.day);
	assert.ok(c.costs > costs && c.rd_spent > 0);
	// Laggards catch up: a level under the frontier less two costs half.
	const front = R.frontier_of(M, c.sector, 0);
	c.tech[0] = front - 3;
	const cheap = R.cost(M, c, 0);
	c.tech[0] = front - 1;
	const dear = R.cost(M, c, 0);
	assert.ok(cheap < dear * R.CATCH_UP * 0.9, "catching up is cheaper");
	// In distress, the labs stop.
	c.status = 1;
	const p0 = c.progress;
	R.daily(game, M, M.day);
	assert.equal(c.progress, p0);
});

test("research: chiefs set budgets by trait and need; a change of focus loses the work under way", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	const M = m(), R = M.research;
	const c = listed(M).find((x) => !x.canon && x.sector === 4);
	c.cash = 1e10; c.status = LISTED; c.earnings = [1, 1, 1, 1];
	c.trait = 2;
	R.decide(M, c, 0.5, M.day);
	const visionary = c.rd;
	c.trait = 3;
	let crooked = 0;
	for (let i = 0; i < 20; i++) { R.decide(M, c, 0.5, M.day); crooked += c.rd; }
	assert.ok(visionary >= 3 && crooked / 20 < visionary, "a visionary spends more than a crooked chief");
	c.progress = 12345;
	R.set_focus(M, c, (c.focus + 1) % 3);
	assert.equal(c.progress, 0);
	// Busy companies lean to scale.
	let scale = 0;
	for (let i = 0; i < 30; i++) { c.focus = 0; c.progress = 0; R.decide(M, c, 0.95, M.day); scale += c.focus === 1 ? 1 : 0; }
	assert.ok(scale > 10, `scale chosen ${scale} of 30 when busy`);
});

// ---- Corporate finance ----

test("finance: growth is paid from cash and debt, then new shares; offerings dilute; buybacks; splits", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 30);
	const M = m(), K = M.capital;
	const c = listed(M).find((x) => !x.canon && x.sector === 7);
	// Growth from cash.
	c.cash = 1e10; c.status = LISTED; c.plan = 1;
	const cap = c.capacity;
	assert.ok(K.grow(game, M, c, 1e6, 0.9, true, M.day));
	assert.ok(Math.abs(c.capacity - cap * 1.03) < 1e-6, "steady: 3% a report");
	// An offering: more shares, money raised, the player diluted and told.
	M.holdings.set(c.id, Math.floor(c.shares * 0.1));
	c.last_offer = -1e6; c.capital_policy = 0;
	const shares = c.shares, cash = c.cash, events = M.player_events.length;
	const raised = K.offer(game, M, c, c.price * c.shares * 0.1, M.day, "to grow");
	assert.ok(raised > 0 && c.shares > shares && c.shares <= shares * 1.15 + 1 && c.cash === cash + raised);
	assert.ok(c.raised >= raised, "counted until spent");
	assert.ok(M.player_events.slice(events).some((e) => /new shares/.test(e)));
	assert.equal(K.may_offer(M, c, M.day), false, "not again so soon");
	// A board that forbids it.
	c.last_offer = -1e6; c.capital_policy = -1;
	assert.equal(K.may_offer(M, c, M.day), false);
	// Buyback: fewer shares, never below what the player holds.
	const s2 = c.shares;
	const n = K.buyback(game, M, c, 1e15, 0.03, M.day);
	assert.ok(n > 0 && c.shares === s2 - n && c.shares > M.holdings.get(c.id));
	// Split: ten for one, the player's holdings and price history with it.
	c.price = 900; c.history = [80000, 90000];
	const held = M.holdings.get(c.id);
	K.maybe_split(game, M, c, M.day);
	assert.ok(Math.abs(c.price - 90) < 1e-9 && M.holdings.get(c.id) === held * 10 && c.history[1] === 9000);
});

test("finance: fair value counts money raised and not spent; growth raises the multiple", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 60);
	const M = m();
	const c = listed(M).find((x) => !x.canon && x.sector === 2 && x.earnings.length);
	const f0 = M.fair(c);
	c.raised = 1e9; c.cash += 1e9;
	assert.ok(Math.abs(M.fair(c) - f0 - 1e9 / c.shares) < 1e-6 * f0 + 1e-6);
	c.raised = 0; c.cash -= 1e9;
	c.growth = 0.3;
	assert.ok(M.fair(c) > f0);
});

// ---- The player's company ----

function found(mod, game, sector, tier) {
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Company"));
	mod.on_panel_row(game, mod.exchange.ship_items.indexOf("s:" + sector));
	mod.on_panel(game, game.panel.buttons.indexOf("Found (" + ["1M", "10M", "100M"][tier] + ")"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	return mod.market.charter.mine(mod.market);
}
const topic = (mod, game, t) => mod.on_panel_row(game, mod.exchange.ship_items.indexOf("t:" + t));

test("your company: any sector, three sizes; money in at any time; research, plans and dividends from the Company tab", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 250000000 } });
	days(mod, game, 10);
	const credits = game.condition("credits");
	const c = found(mod, game, 3, 2);
	assert.ok(c.id > 0 && c.sector === 3 && c.owner === 1, "an electronics company of your own");
	assert.equal(credits - game.condition("credits"), 101000000, "100M and the fee");
	assert.ok(Math.abs(c.capacity - 75000000 / m().CAPITAL) < 1e-6 && Math.abs(c.cash - 25000000) < 1);
	assert.ok(c.market_value() > 5e7 && c.market_value() < 2e8, `worth about 100M (${c.market_value()})`);
	assert.ok(c.tech.every((x) => x >= 0) && c.tech.some((x) => x > 0), "engineers from rivals");
	// The topics and their buttons.
	topic(mod, game, "research");
	assert.ok(["Process", "Scale", "Quality", "Budget"].every((b) => game.panel.buttons.includes(b)));
	assert.match(game.panel.text, /Technology/);
	mod.on_panel(game, game.panel.buttons.indexOf("Budget"));
	mod.on_number(game, game.numberAsks.at(-1).token, 5);
	assert.equal(c.rd, 4);
	mod.on_panel(game, game.panel.buttons.indexOf("Quality"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(c.focus, 2);
	topic(mod, game, "growth");
	mod.on_panel(game, game.panel.buttons.indexOf("Plan"));
	mod.on_number(game, game.numberAsks.at(-1).token, 3);
	assert.equal(c.plan, 2);
	topic(mod, game, "finance");
	mod.on_panel(game, game.panel.buttons.indexOf("Dividend"));
	mod.on_number(game, game.numberAsks.at(-1).token, 3);
	assert.equal(c.payout, m().board.payouts[2]);
	assert.equal(game.data("state"), m().encode(), "saved");
	// It runs: work, reports to the player, research spent.
	takeOff(game);
	days(mod, game, 120);
	assert.ok(m().contracts.some((k) => k.winner === c.id), "it wins work");
	assert.ok(c.earnings.length >= 3);
	assert.ok(game.messages.some((x) => x.includes(c.name + " reports")), "monthly reports");
	// In trouble: a warning; money in saves it.
	c.cash = -5e6; c.debt = m().debt_limit(c) + 1e6;
	days(mod, game, 1);
	assert.equal(c.status, 1);
	assert.ok(game.messages.some((x) => x.includes("out of cash")));
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Company"));
	topic(mod, game, "finance");
	mod.on_panel(game, game.panel.buttons.indexOf("Put money in"));
	mod.on_number(game, game.numberAsks.at(-1).token, 120000);
	takeOff(game);
	days(mod, game, 1);
	assert.equal(c.status, LISTED, "saved");
});

test("your company: listed, money in buys new shares; offerings and buybacks at your word", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 60000000 } });
	days(mod, game, 10);
	const c = found(mod, game, 6, 1);
	takeOff(game);
	days(mod, game, 125);
	assert.ok(m().charter.may_ipo(c));
	m().charter.ipo(game, m(), c, m().day);
	const held = m().holdings.get(c.id), shares = c.shares;
	assert.ok(m().capital.inject(game, m(), c, 5000000, m().day));
	assert.ok(m().holdings.get(c.id) > held && c.shares > shares, "new shares to you");
	const s2 = c.shares;
	assert.equal(m().capital.player_offer(game, m(), c, 0.1, m().day), 0, "not straight after the listing");
	days(mod, game, 61);
	assert.ok(m().capital.player_offer(game, m(), c, 0.1, m().day) > 0);
	assert.ok(c.shares > s2);
	assert.equal(m().capital.player_offer(game, m(), c, 0.1, m().day), 0, "not again so soon");
	days(mod, game, 61);
	c.cash = 1e9;
	const s3 = c.shares;
	assert.ok(m().capital.player_buyback(game, m(), c, 0.05, m().day) > 0 && c.shares < s3);
});

test("your company bids for a rival: the deal completes a week on, its holders paid; established companies are off limits", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 300000000 } });
	days(mod, game, 10);
	const mine = found(mod, game, 6, 2);
	const M = m();
	M.BID_FAIL = 0;
	// The regulator's line is not what this test is about.
	M.REVIEW_SHARE = 1.0; M.MERGER_MARGIN = 0;
	// (0.4) The smallest rival it may bid for (the regulator may block the very smallest).
	const t = listed(M).filter((x) => x.owner === 0 && !x.canon).sort((a, b) => (a.sector === 6 ? 0 : 1) - (b.sector === 6 ? 0 : 1) || a.market_value() - b.market_value()).find((x) => M.takeover_refusal(mine, x) === "");
	const canon = listed(M).find((x) => x.canon);
	assert.match(M.takeover_refusal(mine, canon), /will not allow/);
	assert.ok(t, "it can bid");
	M.buy(game, t, Math.floor(t.shares * 0.05));
	const held = M.holdings.get(t.id), cap = mine.capacity;
	mod.on_planet_button(game);
	mod.exchange.selected = t.id;
	mod.exchange.tab = 0;
	mod.on_panel(game, game.panel.buttons.indexOf("Market"));
	assert.ok(game.panel.buttons.includes("Take over"));
	mod.on_panel(game, game.panel.buttons.indexOf("Take over"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(t.suitor, mine.id);
	const credits = game.condition("credits");
	takeOff(game);
	days(mod, game, 8);
	assert.equal(t.status, MERGED, "bought");
	assert.ok(mine.capacity > cap, "its yards are yours");
	assert.ok(game.condition("credits") > credits + held * t.offer * 0.99, "your own shares in it paid at the offer");
});

// ---- The board ----

test("board: a seat directs research and forbids new shares; the chief does not undo it while the seat is held", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 1e9 } });
	days(mod, game, 10);
	const M = m();
	const c = listed(M).find((x) => !x.canon && x.sector === 1 && x.market_value() > 5e6);
	M.holdings.set(c.id, Math.ceil(c.shares * 0.11));
	M.board.research(game, M, c, 2, 4, M.day);
	assert.ok(c.focus === 2 && c.rd === 4 && c.board_rd === 1);
	M.research.after_report(M, c, 0.5, M.day);
	assert.ok(c.focus === 2 && c.rd === 4, "kept");
	M.board.capital(game, M, c, -1, M.day);
	c.last_offer = -1e6;
	assert.equal(M.capital.may_offer(M, c, M.day), false);
	M.holdings.set(c.id, 1);
	M.research.after_report(M, c, 0.5, M.day);
	assert.equal(c.board_rd, 0, "the seat lost: the chief decides again");
});

// ---- Tips ----

test("tips: a breakthrough coming soon can be tipped, and trading on it is insider trading", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 10);
	const M = m(), T = M.tips_desk;
	const c = listed(M).find((x) => !x.canon && x.status === LISTED);
	c.rd = 3; c.cash = 1e12;
	c.progress = M.research.cost(M, c, c.focus) * c.luck - M.research.daily_cost(M, c) * 10;
	const due = T.breakthrough_due(M, c);
	assert.ok(due >= 9 && due <= 11, `due in ${due} days`);
	assert.match(T.breakthrough_text(M, c, M.day + due), /breakthrough in/);
});

// ---- Saving ----

test("saving: an M4 market round-trips; its header says version 2", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 90);
	const text = m().encode();
	assert.ok(text.startsWith("corporations 2"));
	const again = new (m().constructor)();
	again.decode(text);
	assert.equal(again.encode(), text);
	assert.equal(again.version, 2);
	assert.deepEqual(again.demand_base, m().demand_base);
});

test("migration: a market from before M4 becomes a new exchange; holdings and shorts paid out, ships back, orders kept", { skip }, () => {
	const v1 = JSON.parse(readFileSync(join(HERE, "v1-market.json"), "utf8"));
	const game = newGame({ day: v1.day, conditions: { credits: v1.credits } });
	const mod = new Corporations();
	mod.on_load(game);
	game.set_data("world", "old-world");
	game.set_data("rev", "1.x");
	game.set_data("state", v1.state);
	const credits = game.condition("credits");
	mod.on_day(game, v1.day);
	const M = mod.market;
	assert.equal(M.version, 2);
	assert.ok(game.data("state").startsWith("corporations 2"), "saved as a new market");
	assert.notEqual(game.data("world"), "old-world");
	let value = 0;
	for (const [id, n] of Object.entries(v1.holdings)) value += v1.prices[id] * n;
	const shortCost = Object.entries(v1.shorts).reduce((s, [id, n]) => s + v1.prices[id] * n, 0);
	const got = game.condition("credits") - credits;
	assert.ok(got > value * 0.8, `holdings bought out (${got} for ${value} of shares, ${shortCost} short)`);
	assert.equal(M.holdings.size, 0);
	assert.equal(M.shorts.size, 0);
	assert.ok(game.messages.some((x) => x.includes("reorganised")));
	const canon = listed(M).filter((c) => c.canon);
	assert.ok(canon.every((c) => c.market_value() > 4e8));
	assert.ok(M.shelves.length > 100, "shelves carried over");
	assert.ok(M.shelves.every((s) => s.onorder === 0), "their restocks ordered again");
	days(mod, game, 30);
	assert.ok(listed(mod.market).length >= 35);
});

// ---- Review: exploit guards (M4) ----

test("review: an IPO's money is counted, so buying the market out and dissolving makes nothing; no second offering at once", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 400000000 } });
	days(mod, game, 10);
	const start0 = game.condition("credits");
	const c = found(mod, game, 3, 1);
	takeOff(game);
	days(mod, game, 125);
	const M = m();
	const raised = M.charter.ipo(game, M, c, M.day);
	assert.ok(raised > 0 && c.raised >= raised, "the listing's money is raised money");
	assert.ok(M.fair(c) > c.cash / c.shares, "fair value covers the cash behind each share");
	assert.equal(M.capital.player_offer(game, M, c, 0.2, M.day), 0, "no offering straight after the listing");
	days(mod, game, 20);
	// Put enough in to hold 90% at fair value or more, dissolve: never a
	// profit on what the player put in since founding it.
	const held = M.holdings.get(c.id);
	const at = Math.max(c.price, M.fair(c));
	const want = Math.ceil((0.9 * c.shares - held) / 0.1) + 1;
	M.capital.inject(game, M, c, want * at * 1.01, M.day);
	assert.ok(M.charter.may_dissolve(M, c));
	M.charter.dissolve(game, M, c, M.day);
	assert.ok(game.condition("credits") <= start0, `no money from nothing (${game.condition("credits") - start0})`);
});

test("review: no money in while a rival bids; no board votes or sale on your own company's bid; your company sells no shares on its own", { skip }, () => {
	const { game, mod, m } = start({ conditions: { credits: 400000000 } });
	days(mod, game, 10);
	const mine = found(mod, game, 6, 2);
	const M = m();
	mine.suitor = 999;
	assert.equal(M.capital.inject(game, M, mine, 1000000, M.day), false, "refused during a bid");
	mine.suitor = 0;
	const t = listed(M).filter((x) => x.sector === 6 && x.owner === 0 && !x.canon).sort((a, b) => a.market_value() - b.market_value())[0];
	M.holdings.set(t.id, Math.ceil(t.shares * 0.25));
	t.suitor = mine.id;
	assert.equal(M.board.may_vote(M, t), false);
	assert.equal(M.board.may_sell(M, t), false);
	assert.equal(M.charter.may_dissolve(M, mine), false, "not while it bids");
	t.suitor = 0;
	mine.ipo = true; mine.last_offer = -1e6;
	assert.equal(M.capital.may_offer(M, mine, M.day), false, "only at your word");
	// A board's ban on new shares lapses with the seat.
	const r = listed(M).find((x) => !x.canon && x.owner === 0 && x.id !== t.id);
	M.holdings.set(r.id, Math.ceil(r.shares * 0.11));
	M.board.capital(game, M, r, -1, M.day);
	assert.equal(r.capital_policy, -1);
	M.holdings.delete(r.id);
	M.capital.after_report(game, M, r, 0.5, M.day);
	assert.equal(r.capital_policy, 0);
	// Research directed once a report at most.
	M.holdings.set(r.id, Math.ceil(r.shares * 0.11));
	M.board.research(game, M, r, 0, 2, M.day);
	M.board.research(game, M, r, 1, 3, M.day);
	assert.equal(r.focus, 0, "once a report");
});

// ---- Security fleets and sweeps against pirates ----

test("fleets: security companies own real warships matching what they paid for, restocked from shipyards' stock", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 2);
	const M = m(), F = M.fleets;
	const sec = listed(M).filter((c) => c.sector === 7);
	assert.ok(sec.length > 0 && sec.every((c) => c.fleet !== ""), "every security company has ships");
	for (const c of sec) {
		for (const [model] of Object.entries(Object.fromEntries(F.parse(c.fleet)))) {
			const r = M.hulls.find(model);
			assert.ok(r >= 0 && !M.hulls.military(r) && /Warship|Interceptor/.test(M.hulls.categories[r]), `${model} is a warship`);
		}
	}
	// Lose ships: the company buys hulls off a shelf, never the last one.
	const c = sec.sort((a, b) => b.capacity - a.capacity)[0];
	const before = F.count_of(c.fleet);
	c.fleet = "Aerie:1";
	const stock = M.shelves.reduce((s, x) => s + x.count, 0);
	for (let i = 0; i < 5; i++) F.reconcile(game, M, M.day);
	assert.ok(F.count_of(c.fleet) > 1, "it buys ships");
	assert.ok(M.shelves.reduce((s, x) => s + x.count, 0) < stock, "off the shelves");
	assert.ok(M.shelves.every((x) => x.count >= 0));
	assert.ok(before > 0);
});

test("sweeps: offered where pirates prey; the strongest nearby company sends real ships; losses are real and quality reduces them", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	const M = m(), F = M.fleets;
	const c = listed(M).filter((x) => x.sector === 7).sort((a, b) => b.capacity - a.capacity)[0];
	for (const o of listed(M)) if (o.sector === 7 && o.id !== c.id) o.fleet = "";
	c.fleet = "Corvette:6;Aerie:4"; c.capacity = F.cap_of(M, c.fleet); c.status = LISTED;
	F.post(game, mod.galaxy, M, c.system, 20000000, "pirates", M.day);
	const k = M.contracts.at(-1);
	assert.equal(k.kind, F.OPERATION);
	M.award(game, mod.galaxy, k, M.day);
	assert.equal(k.winner, c.id, "it wins");
	assert.ok(k.model !== "" && F.count_of(c.fleet) < 10, "its flotilla leaves home");
	const cap = c.capacity, ships = F.count_of(c.fleet) + F.count_of(k.model);
	F.fight(game, mod.galaxy, M, k, M.day, 0);
	assert.ok(k.status === 2 || k.status === 3, "fought");
	const after = F.count_of(c.fleet);
	assert.ok(after <= ships, "survivors home");
	assert.ok(Math.abs((cap - c.capacity) - (F.cap_of(M, "Corvette:6;Aerie:4") - F.cap_of(M, c.fleet))) < 1e-6, "the capacity lost is the ships lost");
	// Quality: many fights, cheap hulls lose more of their number than sturdy ones.
	const rate = (fleet) => {
		let sent = 0, gone = 0;
		for (let i = 0; i < 300; i++) {
			const x = new (M.contracts[0].constructor)();
			Object.assign(x, { id: 900000 + i, kind: F.OPERATION, status: 1, winner: 0, system: c.system, units: 300, model: fleet });
			const n = F.count_of(fleet);
			F.fight(game, mod.galaxy, M, x, M.day, 0);
			sent += n; gone += n - F.count_of(x.model);
		}
		return gone / sent;
	};
	const cheap = rate("Scrapper:12"), sturdy = rate("Bastion:2");
	assert.ok(F.strength_of(M, "Scrapper:12") > 0 && F.strength_of(M, "Bastion:2") > 0);
	assert.ok(sturdy < cheap, `sturdy hulls lose fewer (${sturdy.toFixed(2)} against ${cheap.toFixed(2)})`);
});

test("sweeps: the player can fight beside the flotilla; it waits for them; only the ships that die there are lost", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	const M = m(), F = M.fleets;
	const c = listed(M).filter((x) => x.sector === 7).sort((a, b) => b.capacity - a.capacity)[0];
	for (const o of listed(M)) if (o.sector === 7 && o.id !== c.id) o.fleet = "";
	c.fleet = "Corvette:4"; c.capacity = F.cap_of(M, c.fleet);
	const target = "Sol";
	F.post(game, mod.galaxy, M, target, 10000000, "pirates", M.day);
	const k = M.contracts.at(-1);
	M.award(game, mod.galaxy, k, M.day);
	assert.equal(k.winner, c.id);
	land(mod, game, "Earth");
	const job = [...game.jobs].find(([n]) => n === "sweep " + k.id);
	assert.ok(job, "a job on the board nearby");
	const text = job[1];
	assert.match(text, /npc kill/);
	assert.match(text, /fleet "Small Core Pirates"/);
	assert.ok((text.match(/\tship "Corvette"/g) || []).length >= 1, "the company's real ships");
	assert.match(text, /"corporations: op \d+ lost 0" = 1/);
	// Taken: the sweep waits past its day.
	game.set_condition("corporations: op " + k.id, 1);
	takeOff(game);
	days(mod, game, k.days + 3);
	assert.equal(k.status, 1, "waiting for the player");
	// The pirates destroyed, one company ship lost there.
	const sent = F.count_of(k.model), home = F.count_of(c.fleet);
	game.set_condition("corporations: op " + k.id + " won", 1);
	game.set_condition("corporations: op " + k.id + " lost 0", 1);
	days(mod, game, 1);
	assert.equal(k.status, 2, "won");
	assert.equal(F.count_of(c.fleet), home + sent - 1, "exactly one ship lost");
	assert.equal(game.condition("corporations: op " + k.id), 0, "conditions cleared");
});

test("fleets: a warship handed to your security company joins its fleet; fleets and sweeps are saved", { skip }, () => {
	const { game, mod, m } = start({ api10: true, conditions: { credits: 50000000 } });
	days(mod, game, 5);
	const c = found(mod, game, 7, 1);
	game.fleet.push({ uuid: "00000000-0000-4000-8000-000000000077", name: "Guard", model: "Corvette", outfits: {}, integrated: {}, massSaved: 0, spaceSaved: {} });
	assert.ok(m().charter.contribute(game, m(), c, "00000000-0000-4000-8000-000000000077", m().day));
	assert.ok(m().fleets.parse(c.fleet).get("Corvette") >= 1, "a Corvette in its fleet");
	const M = m();
	M.fleets.post(game, mod.galaxy, M, "Sol", 10000000, "pirates", M.day);
	const text = M.encode();
	const again = new (M.constructor)();
	again.decode(text);
	assert.equal(again.encode(), text);
	assert.equal(again.by_id.get(c.id).fleet, c.fleet);
});
