// (0.5) Corporations for other mods, by its own notifications only (it knows
// no other mod by name): "corporations.roster_wanted" is answered with
// "corporations.roster", and "corporations.book" books another mod's income
// or cost to a company. Against the SDK's FakeGame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, newGame } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";

function started() {
	const game = newGame({ api10: true });
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_pilot_loaded(game);
	mod.on_enter(game, "Sol");
	for (let d = 0; d < 40; d++) { game.day_ += 1; mod.on_day(game, game.day_); }
	game.posted = [];
	return { game, mod, m: () => mod.market };
}

test("corporations.roster_wanted is answered with the roster, the player's company marked", { skip }, () => {
	const { game, mod, m } = started();
	assert.ok(game.listening.has("corporations.roster_wanted") && game.listening.has("corporations.book"));
	assert.ok(!game.listening.has("racing.sponsors_wanted"), "no other mod's names");
	game.receive("corporations.roster_wanted", "{\"day\":1}", "anyone");
	game.drain(mod);
	const answers = game.posted.filter((p) => p.name === "corporations.roster");
	assert.equal(answers.length, 1);
	const roster = JSON.parse(answers[0].payload);
	assert.equal(roster.day, m().day);
	const listed = m().companies.filter((c) => c.listed());
	assert.equal(roster.companies.length, Math.min(40, listed.length));
	for (let k = 1; k < roster.companies.length; k++) assert.ok(roster.companies[k - 1].value >= roster.companies[k].value, "largest first");
	for (const c of roster.companies) {
		const real = listed.find((x) => x.name === c.name);
		assert.ok(real, c.name);
		assert.equal(c.id, real.id);
		assert.equal(c.value, Math.round(real.market_value()));
		assert.equal(typeof c.change, "number");
		assert.equal(c.player, false);
	}
	// The player's own company is always in it (however small), marked.
	game.landed = true;
	game.planet_ = "Earth";
	const mine = m().charter.found(game, m(), mod.galaxy, 6, m().day);
	assert.ok(mine.id);
	game.posted = [];
	game.receive("corporations.roster_wanted", "{}", "anyone");
	game.drain(mod);
	const r2 = JSON.parse(game.posted.find((p) => p.name === "corporations.roster").payload);
	const me = r2.companies.find((c) => c.player);
	assert.ok(me && me.name === mine.name && me.private === true);
});

test("corporations.book: income is revenue, a cost is a cost, both in cash; anything else changes nothing", { skip }, () => {
	const { game, mod, m } = started();
	const c = m().companies.find((x) => x.listed());
	const [cash, rev, costs] = [c.cash, c.revenue, c.costs];
	game.receive("corporations.book", JSON.stringify({ company: c.name, amount: 500000, note: "on its racing sponsorship" }), "anyone");
	game.receive("corporations.book", JSON.stringify({ company: c.name, amount: -200000 }), "anyone");
	game.drain(mod);
	assert.ok(Math.abs(c.cash - (cash + 300000)) < 1e-6);
	assert.ok(Math.abs(c.revenue - (rev + 500000)) < 1e-6);
	assert.ok(Math.abs(c.costs - (costs + 200000)) < 1e-6);
	// The report books it in earnings (revenue less costs), which fair value rests on.
	const before = m().companies.map((x) => [x.cash, x.revenue, x.costs].join());
	for (const bad of ["not json", "{}", JSON.stringify({ company: "No Such Co", amount: 5 }), JSON.stringify({ company: c.name, amount: "lots" }), JSON.stringify({ company: c.name, amount: 0 })])
		game.receive("corporations.book", bad, "anyone");
	game.drain(mod);
	assert.deepEqual(m().companies.map((x) => [x.cash, x.revenue, x.costs].join()), before);
	// A company gone from the listing books nothing.
	const gone = m().companies.find((x) => !x.listed());
	if (gone) {
		const was = gone.cash;
		game.receive("corporations.book", JSON.stringify({ company: gone.name, amount: 1e6 }), "anyone");
		game.drain(mod);
		assert.equal(gone.cash, was);
	}
});

test("on a game without the bus nothing is posted, and other notifications are not answered", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	mod.on_notification(game, "corporations.roster_wanted", "{}", "anyone");
	assert.equal(game.posted.length, 0);
	const g2 = newGame({ api10: true });
	const m2 = new Corporations();
	m2.on_load(g2);
	m2.on_enter(g2, "Sol");
	g2.posted = [];
	m2.on_notification(g2, "racing.sponsors_wanted", "{}", "racing");
	assert.equal(g2.posted.filter((p) => p.name === "corporations.roster" || p.name === "corporations.sponsors").length, 0);
});
