// Sponsors: the built-in ones, and outside sponsors over the notification bus
// (racing.sponsors, racing.sponsor_gone, racing.sponsor_offer; what they paid
// and how their deals did go out as racing.sponsor_paid and _result).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, confirmLast, takeOff, newGame, FakeBus } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

test("standalone: built-in sponsors, offers to the player, signing in the office, weekly pay and podium bonuses", { skip }, () => {
	const { game, mod, w } = start(Racing);
	assert.ok(w().sponsors.length >= 20);
	assert.ok(w().sponsors.every((s) => s.source === "own"));
	for (const t of w().teams) assert.ok(w().deals_of(t.id).length >= 1, `${t.name} has a sponsor`);
	const me = found(mod, game, 0);
	const offers = w().deals.filter((d) => d.team === me.id && d.offer);
	assert.ok(offers.length >= 1, "offers on founding");
	press(mod, game, "Sponsors");
	const row = game.panel.rows.findIndex((r) => r[6] === "offer");
	mod.on_panel_row(game, row);
	press(mod, game, "Sign");
	confirmLast(mod, game);
	const deal = w().deals.find((d) => d.team === me.id && !d.offer);
	assert.ok(deal, "signed");
	assert.ok(w().sponsor(deal.sponsor).source === "own");
	takeOff(game);
	const paid = deal.paid;
	days(mod, game, 14);
	assert.ok(deal.paid >= paid + 2 * deal.pay - 1, "paid weekly");
	// A podium pays the bonus.
	const cash = me.cash;
	w().sponsoring.podium(w(), me, true);
	assert.equal(me.cash, cash + 2 * deal.bonus);
});

test("a sponsor's clauses: a run of bad finishes, or a missed target, ends the deal", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	const d = w().deals.find((x) => x.team === me.id && x.offer);
	w().sponsoring.sign(w(), d);
	me.finishes = [10, 10, 10, 10];
	d.walk = 5;
	assert.ok(w().sponsoring.walks(me, d));
	while (w().weekday() !== 5) days(mod, game, 1);
	days(mod, game, 1);
	assert.ok(!w().deals.some((x) => x.id === d.id), "walked away");
	assert.ok(game.messages.some((m) => m.includes("ends its sponsorship")));
	// A target missed at the season's end costs the penalty.
	const e = w().sponsoring.make(w(), me, w().sponsor(w().sponsors[0].name), 0);
	e.offer = false;
	e.target = 1;
	w().deals.push(e);
	me.last_pos = 9;
	const cash = me.cash;
	w().sponsoring.season_end(w());
	assert.ok(Math.abs(cash - me.cash - e.penalty) < 1);
	assert.ok(!w().deals.some((x) => x.id === e.id));
});

// Outside sponsors over the bus, as any mod may send them ("racing.sponsors"):
// this mod knows no other by name (the Racing League and Corporations bridge
// is one sender; its tests run the real Corporations).
function roster(n = 40, budget = (k) => 30000 + 30000 * k) {
	const sponsors = [];
	for (let k = 0; k < n; k++) sponsors.push({ name: `Outside Co ${k}`, sector: "Mining", budget: budget(k), fortune: 0.1 });
	return JSON.stringify({ day: 1, sponsors });
}
// A game with the bus and no other mod on it: what racing posts is kept in
// game.posted, and the tests send it notifications themselves.
function busGame() {
	const rg = newGame();
	const racing = new Racing();
	racing.on_load(rg);
	racing.on_pilot_loaded(rg);
	racing.on_enter(rg, "Sol");
	return { rg, racing };
}

test("outside sponsors: a roster on the bus makes them the sponsors, with its budgets and fortunes", { skip }, () => {
	const { rg, racing } = busGame();
	assert.ok(rg.posted.some((p) => p.name === "racing.sponsors_wanted"), "racing asked");
	const asked = JSON.parse(rg.posted.find((p) => p.name === "racing.sponsors_wanted").payload);
	assert.equal(asked.teams.length, 30);
	for (const t of asked.teams) assert.ok(t.fair > 0 && t.free >= 0 && Array.isArray(t.deals));
	const w = racing.world;
	racing.on_notification(rg, "racing.sponsors", roster(), "bridge");
	assert.ok(w.sponsoring.corp_live(w));
	const outside = w.sponsors.filter((s) => s.source === "corp");
	assert.equal(outside.length, 40);
	assert.equal(w.sponsor("Outside Co 3").budget, 120000);
	assert.equal(w.sponsor("Outside Co 3").fortune, 0.1);
	const me = found(racing, rg, 0);
	takeOff(rg);
	// Every deal or offer the team had over the days (offers lapse in 14).
	const seen = new Map();
	for (let d = 0; d < 60; d++) {
		rg.day_ += 1;
		racing.on_day(rg, rg.day_);
		racing.on_notification(rg, "racing.sponsors", roster(), "bridge");
		for (const x of w.deals) if (x.team === me.id) seen.set(x.id, x);
	}
	const mine = [...seen.values()];
	assert.ok(mine.length >= 1);
	for (const d of mine) assert.ok(d.sponsor.startsWith("Outside Co"), `${d.sponsor} is an outside sponsor`);
	// What outside sponsors paid goes out on the bus, a day at a time.
	const paid = rg.posted.filter((p) => p.name === "racing.sponsor_paid").map((p) => JSON.parse(p.payload));
	assert.ok(paid.length > 0);
	for (const p of paid) for (const x of p.payments) assert.ok(x.sponsor.startsWith("Outside Co") && x.amount > 0);
});

test("an outside sponsor that is gone ends its deals", { skip }, () => {
	const { rg, racing } = busGame();
	const w = racing.world;
	racing.on_notification(rg, "racing.sponsors", roster(), "bridge");
	const me = found(racing, rg, 0);
	takeOff(rg);
	const offer = w.deals.find((d) => d.team === me.id && d.offer);
	w.sponsoring.sign(w, offer);
	racing.on_notification(rg, "racing.sponsor_gone", JSON.stringify({ sponsor: offer.sponsor }), "bridge");
	assert.ok(!w.deals.some((d) => d.sponsor === offer.sponsor), "the deal is gone");
	assert.equal(w.sponsor(offer.sponsor).active, false);
	racing.flush(rg);
	assert.ok(rg.messages.some((m) => m.includes("is gone")));
});

test("with nobody answering, the bus question goes unheard and built-in sponsors stay", { skip }, () => {
	const bus = new FakeBus();
	const rg = newGame();
	const racing = new Racing();
	bus.join("racing", racing, rg);
	racing.on_load(rg);
	racing.on_pilot_loaded(rg);
	bus.drain();
	assert.equal(bus.lastDeliveries, 0);
	assert.ok(!racing.world.sponsoring.corp_live(racing.world));
	assert.ok(racing.world.sponsoring.offering(racing.world).every((s) => s.source === "own"));
	// A roster that stops coming (its sender removed) falls back after STALE days.
	racing.world.sponsoring.roster(racing.world, JSON.stringify({ day: 1, sponsors: [{ name: "Test Corp", sector: "Mining", budget: 200000, fortune: 0.1 }] }));
	assert.ok(racing.world.sponsoring.corp_live(racing.world));
	assert.equal(racing.world.sponsor("Test Corp").budget, 200000);
	days(racing, rg, racing.world.sponsoring.STALE + 1);
	assert.ok(!racing.world.sponsoring.corp_live(racing.world));
	// Malformed payloads change nothing.
	racing.world.sponsoring.roster(racing.world, "not json");
	racing.world.sponsoring.bankrupt(racing.world, "{");
	racing.world.sponsoring.direct(racing.world, "{");
});

test("a direct offer: an AI team takes it at its worth or near, turns it down below, or with no slot; the player's team gets it as an offer", { skip }, () => {
	const { rg, racing } = busGame();
	const w = racing.world;
	const me = found(racing, rg, 0);
	takeOff(rg);
	const ai = w.league_teams(1).find((t) => w.deals_of(t.id).length < 3);
	const answers = () => rg.posted.filter((p) => p.name === "racing.sponsor_answer").map((p) => JSON.parse(p.payload));
	const offer = (id, team, weekly) => racing.on_notification(rg, "racing.sponsor_offer", JSON.stringify({ id, sponsor: "Player Co", sector: "Freight", team: team.name, weekly }), "bridge");
	const worth = w.sponsoring.fair(w, ai);
	offer("1", ai, Math.round(worth * 0.5));
	let a = answers().at(-1);
	assert.equal(a.id, "1");
	assert.equal(a.accepted, false);
	assert.equal(a.reason, "too little");
	assert.ok(Math.abs(a.fair - worth) < 2);
	offer("2", ai, Math.round(worth));
	a = answers().at(-1);
	assert.equal(a.accepted, true);
	const d = w.deals.find((x) => x.team === ai.id && x.sponsor === "Player Co");
	assert.ok(d && !d.offer && Math.abs(d.worth - worth) <= 100 && a.target === d.target);
	assert.equal(w.sponsor("Player Co").source, "direct");
	assert.ok(!w.sponsoring.offering(w).some((s) => s.name === "Player Co"), "a direct sponsor never offers on its own");
	offer("3", ai, Math.round(worth * 2));
	assert.equal(answers().at(-1).reason, "already sponsored");
	// No slot.
	const full = w.league_teams(1).find((t) => t.id !== ai.id);
	while (w.deals_of(full.id).length < 3) { const x = w.sponsoring.make(w, full, w.sponsors[w.deals_of(full.id).length], 0); x.offer = false; w.deals.push(x); }
	offer("4", full, 1e9);
	assert.equal(answers().at(-1).reason, "no room");
	// The player's own team: an offer on the Sponsors tab, at any price.
	offer("5", me, 1000);
	a = answers().at(-1);
	assert.equal(a.offered, true);
	assert.ok(w.deals.some((x) => x.team === me.id && x.offer && x.sponsor === "Player Co" && x.pay === 1000));
	assert.equal(answers().length, 5);
});

test("an outside sponsor's season: what it paid, its worth, the target, hit or missed, the penalty paid back", { skip }, () => {
	const { rg, racing } = busGame();
	const w = racing.world;
	racing.on_notification(rg, "racing.sponsors", roster(), "bridge");
	const me = found(racing, rg, 0);
	takeOff(rg);
	const d = w.sponsoring.make(w, me, w.sponsor("Outside Co 5"), 0);
	d.offer = false;
	w.deals.push(d);
	w.sponsoring.pay(w, me);
	w.sponsoring.podium(w, me, true);
	assert.equal(d.season_paid, d.pay + 2 * d.bonus);
	assert.equal(d.season_worth, d.season_paid);
	// Paid more than it is worth (an event raised it): the excess is not exposure.
	d.pay = d.worth * 2;
	w.sponsoring.pay(w, me);
	assert.equal(d.season_worth, d.worth + 2 * d.worth * w.sponsoring.BONUS + d.worth);
	const paid = d.season_paid, basis = d.season_worth;
	d.target = 3;
	me.last_pos = 5;
	rg.posted = [];
	w.sponsoring.season_end(w);
	racing.flush(rg);
	const r = rg.posted.filter((p) => p.name === "racing.sponsor_result").map((p) => JSON.parse(p.payload)).find((x) => x.sponsor === "Outside Co 5");
	assert.ok(r);
	assert.deepEqual([r.hit, r.target, r.position, r.paid, r.basis, r.penalty, r.player, r.team], [false, 3, 5, Math.round(paid), Math.round(basis), Math.round(d.penalty), true, me.name]);
	assert.equal(d.season_paid, 0);
	// Built-in sponsors' deals post nothing.
	const own = w.sponsoring.make(w, me, w.sponsors.find((s) => s.source === "own"), 1);
	own.offer = false;
	w.deals.push(own);
	rg.posted = [];
	w.sponsoring.pay(w, me);
	w.sponsoring.flush_payments(w);
	racing.flush(rg);
	const p = rg.posted.filter((x) => x.name === "racing.sponsor_paid").flatMap((x) => JSON.parse(x.payload).payments);
	assert.ok(p.every((x) => x.sponsor !== own.sponsor));
});

test("a save from before outside sponsors' books: deals read with their pay as their worth, and play on", { skip }, () => {
	const { rg, racing } = busGame();
	const w = racing.world;
	racing.on_notification(rg, "racing.sponsors", roster(), "bridge");
	takeOff(rg);
	days(racing, rg, 20);
	racing.on_save(rg);
	const old = rg.data("state").split("\n").map((l) => l.startsWith("d|") ? l.split("|").slice(0, -3).join("|") : l).join("\n");
	rg.set_data("state", old);
	const again = new Racing();
	again.on_load(rg);
	again.on_pilot_loaded(rg);
	const w2 = again.world;
	assert.equal(w2.deals.length, w.deals.length);
	for (const d of w2.deals) assert.ok(d.worth === d.pay && d.season_paid === 0);
	days(again, rg, 100);
	assert.ok(w2.deals.length > 0);
});

test("a winning team at the top keeps getting offers, cut down to what sponsors can still afford", { skip }, () => {
	// Budgets as Corporations' companies had them under the old rule (0.04% of
	// their value a week: 30k to about 1.1M): a leading S League team's title
	// deal (864k) outgrew what any had left, and it got no offers at all.
	const budgets = (k) => (k < 15 ? 300000 + 55000 * k : 30000 + 5000 * k);
	const { rg, racing } = busGame();
	const w = racing.world;
	racing.on_notification(rg, "racing.sponsors", roster(40, budgets), "bridge");
	const me = found(racing, rg, 2);
	takeOff(rg);
	const seen = new Set();
	const bySeason = new Map();
	for (let d = 0; d < 4 * w.WEEKS * 7; d++) {
		// A car far ahead of the field: first in the table, the most appealing team there is.
		for (let k = 0; k < 5; k++) me.levels[k] = 400;
		rg.day_ += 1;
		racing.on_day(rg, rg.day_);
		if (d % 7 === 0) racing.on_notification(rg, "racing.sponsors", roster(40, budgets), "bridge");
		for (const x of w.deals) {
			if (x.team !== me.id || !x.offer || seen.has(x.id)) continue;
			seen.add(x.id);
			bySeason.set(w.season, (bySeason.get(w.season) ?? 0) + 1);
			const s = w.sponsor(x.sponsor);
			assert.equal(s.source, "corp");
			assert.ok(w.sponsoring.committed(w, s.name) <= s.budget + 1, `${s.name} offers no more than its budget`);
			assert.ok(Math.abs(x.bonus - x.pay * w.sponsoring.BONUS) < 1 && Math.abs(x.penalty - x.pay * w.sponsoring.PENALTY) < 1);
			assert.ok(x.worth >= x.pay, "a cut-down deal keeps what it is worth");
		}
	}
	assert.ok(w.sponsoring.corp_live(w));
	assert.equal(me.league, 2);
	// Before the fix: a few offers in the first season, then none ever again.
	const later = [2, 3, 4].map((season) => bySeason.get(season) ?? 0);
	assert.ok(later.every((n) => n >= 1) && later.reduce((a, b) => a + b) >= 5, `offers by season: ${JSON.stringify([...bySeason])}`);
});

test("AI teams take a deal only when the sponsor can pay it in full", { skip }, () => {
	const { w } = start(Racing);
	const t = w().league_teams(2).find((x) => w().deals_of(x.id).length < 2) ?? w().league_teams(2)[0];
	w().deals = w().deals.filter((d) => d.team !== t.id);
	for (const s of w().sponsors) s.budget = w().sponsoring.committed(w(), s.name) + 1000;
	const n = w().deals.length;
	w().sponsoring.offers(w(), t, 1);
	assert.equal(w().deals.length, n, "no sponsor can afford an S League deal");
});
