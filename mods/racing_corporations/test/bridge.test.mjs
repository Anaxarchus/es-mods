// The bridge with the real Racing League and Corporations, each on its own
// FakeGame on one FakeBus: sponsors from the exchange, their payments and
// returns booked in the companies' earnings, the player's company offering
// deals, any of the three left out, and saves from before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAll, world, landAll, takeOffAll } from "./world.mjs";
import { found as foundTeam, buy as buyTeam, takeOff } from "../../racing/test/world.mjs";

const mods = await loadAll();
const skip = !mods && "no Dado toolchain";

// Every notification posted, by name.
function tap(w) {
	const seen = [];
	const post = w.bus.post.bind(w.bus);
	w.bus.post = (sender, name, payload) => { seen.push({ sender, name, payload }); return post(sender, name, payload); };
	return (name) => seen.filter((x) => x.name === name).map((x) => JSON.parse(x.payload));
}
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

test("all three: the exchange's companies are the sponsors, with budgets by the bridge's rule, and pay for their deals", { skip }, () => {
	const w = world(mods);
	const posts = tap(w);
	const R = w.racing.mod.world, M = w.corporations.mod.market, B = w.bridge.mod;
	const outside = R.sponsors.filter((s) => s.source === "corp");
	const listed = M.companies.filter((c) => c.listed());
	assert.equal(outside.length, Math.min(40, listed.length));
	for (const s of outside) {
		const c = listed.find((x) => x.name === s.name);
		assert.ok(c, s.name);
		const rule = Math.min(Math.max(B.BUDGET_SHARE * c.market_value(), B.BUDGET_MIN), B.BUDGET_MAX);
		assert.ok(Math.abs(s.budget - Math.min(rule, Math.max(0, B.CASH_SHARE * c.cash))) <= 1, `${s.name}'s budget`);
	}
	// The first season's deals were signed before the roster came (built-in
	// sponsors); a season on, the exchange's companies hold them.
	w.day(R.WEEKS * 7);
	// A week: racing's payments to companies reach their books as costs.
	const costs = new Map(listed.map((c) => [c.name, c.costs]));
	const cash = new Map(listed.map((c) => [c.name, c.cash]));
	w.day(7);
	const paid = posts("racing.sponsor_paid").flatMap((p) => p.payments);
	assert.ok(paid.length > 10);
	const books = posts("corporations.book").filter((b) => b.amount < 0);
	assert.ok(Math.abs(sum(books, (b) => -b.amount) - sum(paid, (p) => p.amount)) < 1, "every payment booked");
	const one = paid[0].sponsor;
	const c = listed.find((x) => x.name === one);
	const owed = sum(paid.filter((p) => p.sponsor === one), (p) => p.amount);
	// (Unless a report reset them meanwhile, the costs grew by at least what it paid.)
	if (c.costs >= costs.get(one)) assert.ok(c.costs - costs.get(one) >= owed - 1);
	assert.ok(R.deals.filter((d) => !d.offer).every((d) => R.sponsor(d.sponsor).source === "corp" || R.sponsor(d.sponsor).source === "own"));
});

test("the return: a met target pays back more than the season cost, a miss less; booked as the company's revenue", { skip }, () => {
	const w = world(mods);
	const posts = tap(w);
	const B = w.bridge.mod;
	assert.equal(B.return_of(1e6, true, 5, 5), 1e6 * B.RETURN_HIT);
	assert.equal(B.return_of(1e6, true, 5, 3), 1e6 * (B.RETURN_HIT + 2 * B.RETURN_PLACE));
	assert.equal(B.return_of(1e6, true, 9, 1), 1e6 * (B.RETURN_HIT + B.PLACES_MAX * B.RETURN_PLACE), "capped");
	assert.equal(B.return_of(1e6, false, 3, 8), 1e6 * B.RETURN_MISS);
	assert.ok(B.RETURN_HIT > 1 && B.RETURN_MISS < 1);
	w.day(2 * w.racing.mod.world.WEEKS * 7 + 2);
	const results = posts("racing.sponsor_result");
	assert.ok(results.length > 30, "every deal's season");
	const books = posts("corporations.book").filter((b) => b.amount > 0);
	for (const r of results.slice(0, 20)) {
		const want = B.return_of(r.basis, r.hit, r.target, r.position) + (r.hit ? 0 : r.penalty);
		if (want <= 0) continue;
		assert.ok(books.some((b) => b.company === r.sponsor && Math.abs(b.amount - want) < 1e-6), `${r.sponsor}: ${want}`);
	}
	const hit = results.filter((r) => r.hit), miss = results.filter((r) => !r.hit);
	assert.ok(hit.length && miss.length);
	for (const r of hit) assert.ok(B.return_of(r.basis, true, r.target, r.position) >= r.paid * 0.99, JSON.stringify(r));
	// (A deal signed late in a season, paying under about five weeks before it
	// misses, gets back more than it paid: the penalty is four weeks' pay.)
	for (const r of miss.filter((r) => r.paid * (1 - B.RETURN_MISS) > r.penalty)) assert.ok(B.return_of(r.basis, false, r.target, r.position) + r.penalty < r.paid);
	assert.ok(miss.filter((r) => r.paid * (1 - B.RETURN_MISS) > r.penalty).length > 5, "most misses ran long enough to lose");
	// Booked in the company's books, toward its report's earnings.
	const M = w.corporations.mod.market;
	const b = books[0];
	const c = M.companies.find((x) => x.name === b.company);
	const before = [c.cash, c.revenue];
	w.corporations.mod.on_notification(w.corporations.game, "corporations.book", JSON.stringify(b), "racing corporations");
	assert.ok(Math.abs(c.cash - before[0] - b.amount) < 1e-6 && Math.abs(c.revenue - before[1] - b.amount) < 1e-6);
});

test("over many seasons the exchange stays sound, sponsorship pays modestly on average, and teams in each league keep their money", { skip }, () => {
	const w = world(mods);
	const posts = tap(w);
	const R = w.racing.mod.world, M = w.corporations.mod.market;
	const value = () => sum(M.companies.filter((c) => c.listed()), (c) => c.market_value());
	const start = value();
	const bankrupt = M.companies.filter((c) => c.status === 3).length;
	const seasons = 6;
	for (let s = 0; s < seasons; s++) {
		w.day(R.WEEKS * 7);
		const v = value();
		assert.ok(v > 0.5 * start && v < 2 * start, `season ${s + 1}: the exchange is worth ${v} (from ${start})`);
		for (let l = 0; l < 3; l++) {
			const teams = R.league_teams(l).filter((t) => !t.player);
			const mean = sum(teams, (t) => t.cash) / teams.length;
			assert.ok(mean > -0.1 * R.franchise[l] && mean < 3 * R.franchise[l], `league ${l}: mean cash ${mean}`);
		}
	}
	const books = posts("corporations.book");
	const costs = -sum(books.filter((b) => b.amount < 0), (b) => b.amount), returns = sum(books.filter((b) => b.amount > 0), (b) => b.amount);
	assert.ok(returns / costs > 1.05 && returns / costs < 1.5, `returns ${returns} on costs ${costs}`);
	assert.ok(M.companies.filter((c) => c.status === 3).length - bankrupt <= 2, "no wave of bankruptcies");
	// Budgets now cover the leagues: teams are sponsored by the exchange, and
	// the cut-down offers (Sponsors) are a safety net, rarely used.
	const deals = R.deals.filter((d) => !d.offer && R.sponsor(d.sponsor).source === "corp");
	assert.ok(deals.length >= 50);
	assert.ok(deals.filter((d) => d.worth > d.pay + 1).length <= 0.1 * deals.length);
});

function withCompany(w) {
	landAll(w);
	const M = w.corporations.mod.market;
	const mine = M.charter.found(w.corporations.game, M, w.corporations.mod.galaxy, 6, M.day);
	assert.ok(mine.id, "a company of the player's own");
	landAll(w);
	return mine;
}

test("the player's company: the Sponsorship screen, an offer an AI team takes, one it turns down, the board's limits", { skip }, () => {
	const w = world(mods);
	const B = w.bridge.mod, bg = w.bridge.game, R = w.racing.mod.world, M = w.corporations.mod.market;
	// No company yet: no button.
	landAll(w);
	assert.equal(bg.planetButtonLabel ?? "", "");
	const mine = withCompany(w);
	assert.ok(!R.sponsoring.offering(R).some((s) => s.name === mine.name), "the player's company never sponsors on its own");
	B.on_planet_button(bg);
	assert.ok(bg.panel?.full, "the screen");
	assert.equal(bg.panel.rows.length, 30);
	const col = bg.panel.columns.indexOf("Worth a week");
	assert.ok(col > 0);
	// An AI team in the B League, with a slot.
	const row = bg.panel.rows.findIndex((r, i) => B.t_league[B.rows[i]] === "B" && B.t_free[B.rows[i]] > 0 && !B.t_player[B.rows[i]]);
	B.on_panel_row(bg, row);
	const i = B.chosen, team = B.t_name[i];
	const fair = B.t_fair[i];
	const most = B.limit(i);
	assert.ok(most > 0 && most <= fair * B.OVERPAY + 1);
	// Too much: the board refuses, nothing is sent.
	const offers = () => w.bus.delivered.filter((d) => d.name === "racing.sponsor_offer").length;
	B.on_number(bg, B.OFFER_ASK, Math.ceil((most + 2000) / 1000));
	assert.equal(offers(), 0);
	assert.ok(bg.panel.text.includes("board refuses"));
	// Too little for the team: it turns it down.
	B.on_number(bg, B.OFFER_ASK, 1);
	w.bus.drain();
	assert.ok(bg.messages.some((m) => m.includes(team + " turns down")), bg.messages.join("\n"));
	assert.ok(!R.deals.some((d) => d.sponsor === mine.name));
	// At its worth: it takes it.
	const k = Math.max(1, Math.round(Math.min(fair, most) / 1000));
	if (k * 1000 >= 0.9 * fair) {
		B.on_number(bg, B.OFFER_ASK, k);
		w.bus.drain();
		assert.ok(bg.messages.some((m) => m.includes(team + " accepts")), bg.messages.join("\n"));
		const d = R.deals.find((x) => x.sponsor === mine.name);
		assert.ok(d && !d.offer && d.pay === k * 1000);
		// The company pays for it, week by week, and books the season's return.
		takeOffAll(w);
		const posts = tap(w);
		w.day(R.WEEKS * 7 + 2);
		const paid = posts("racing.sponsor_paid").flatMap((p) => p.payments).filter((p) => p.sponsor === mine.name);
		assert.ok(paid.length >= 1);
		const r = posts("racing.sponsor_result").find((x) => x.sponsor === mine.name);
		if (r) assert.ok(bg.messages.some((m) => m.includes("Your company " + mine.name + "'s sponsorship of " + team)));
	}
});

test("the player's own team: the board pays no more than its standing is worth, and the offer waits on the Sponsors tab", { skip }, () => {
	const w = world(mods);
	const B = w.bridge.mod, bg = w.bridge.game, R = w.racing.mod.world;
	const me = foundTeam(w.racing.mod, w.racing.game, 0);
	takeOff(w.racing.game);
	// Racing tells the bridge of the new team on its sponsors day.
	w.day(7);
	const mine = withCompany(w);
	B.on_planet_button(bg);
	const i = B.t_name.indexOf(me.name);
	assert.ok(i >= 0 && B.t_player[i]);
	assert.ok(B.limit(i) <= B.t_fair[i] * B.SELF_PAY + 1, "no more than its worth");
	B.on_panel_row(bg, B.rows.indexOf(i));
	B.on_number(bg, B.OFFER_ASK, Math.ceil((B.t_fair[i] * 1.2 + 1000) / 1000));
	assert.ok(bg.panel.text.includes("board refuses"), "overpaying its owner's team is refused");
	const k = Math.max(1, Math.floor(B.limit(i) / 1000));
	B.on_number(bg, B.OFFER_ASK, k);
	w.bus.drain();
	const d = R.deals.find((x) => x.team === me.id && x.sponsor === mine.name);
	assert.ok(d && d.offer, "an offer for the player to sign");
	assert.ok(bg.messages.some((m) => m.includes("waits on the Racing League's Sponsors tab")));
	// Whatever it pays, exposure is measured by the team's worth.
	assert.ok(d.worth >= d.pay - 100);
});

test("a team the player buys, renamed: the bridge hears at once that it is the player's, holds its own-team limit, and follows the new name", { skip }, () => {
	const w = world(mods);
	const B = w.bridge.mod, bg = w.bridge.game, R = w.racing.mod.world;
	w.day(20);
	const mine = withCompany(w);
	const t = R.for_sale(0)[0];
	const me = buyTeam(w.racing.mod, w.racing.game, t.id);
	w.bus.drain();
	takeOff(w.racing.game);
	assert.equal(me.id, t.id);
	let i = B.t_name.indexOf(me.name);
	assert.ok(i >= 0 && B.t_player[i], "the listing says the bought team is the player's, without waiting a week");
	assert.ok(B.limit(i) <= B.t_fair[i] * B.SELF_PAY + 1);
	const old = me.name;
	assert.ok(R.rename(me, "Bridgewater Racing", R.RENAMED));
	w.racing.mod.flush(w.racing.game);
	w.bus.drain();
	assert.equal(B.t_name.indexOf(old), -1);
	i = B.t_name.indexOf("Bridgewater Racing");
	assert.ok(i >= 0 && B.t_player[i], "the new name, still the player's");
	B.on_planet_button(bg);
	B.on_panel_row(bg, B.rows.indexOf(i));
	B.on_number(bg, B.OFFER_ASK, Math.max(1, Math.floor(B.limit(i) / 1000)));
	w.bus.drain();
	assert.ok(R.deals.some((d) => d.team === me.id && d.sponsor === mine.name && d.offer), "an offer under the new name reaches the team");
	const posts = tap(w);
	const d = R.deals.find((x) => x.team === me.id && x.sponsor === mine.name);
	R.sponsoring.sign(R, d);
	w.day(R.WEEKS * 7);
	const r = posts("racing.sponsor_result").find((x) => x.sponsor === mine.name);
	if (r) assert.ok(r.player && r.team === me.name, "its results come as the player's team's");
});

test("any one of the three alone, and racing with Corporations but no bridge: no crash, and each degrades on its own", { skip }, () => {
	for (const only of ["racing", "corporations", "bridge"]) {
		const w = world(mods, { racing: only === "racing", corporations: only === "corporations", bridge: only === "bridge" });
		landAll(w);
		takeOffAll(w);
		w.day(30);
		if (only === "racing") assert.ok(w.racing.mod.world.sponsors.every((s) => s.source === "own"));
		if (only === "bridge") {
			assert.equal(w.bridge.mod.t_name.length, 0);
			w.bridge.mod.on_planet_button(w.bridge.game);
			assert.ok(!w.bridge.game.panel, "no screen without both");
		}
	}
	// Both, no bridge: neither knows the other; racing's sponsors are its own.
	const w = world(mods, { bridge: false });
	const posts = tap(w);
	w.day(30);
	assert.ok(w.racing.mod.world.sponsors.every((s) => s.source === "own"));
	assert.equal(posts("corporations.roster").length, 0, "nobody asks Corporations");
	assert.ok(posts("racing.sponsors_wanted").length >= 1);
});

test("a racing save from before (Corporations' sponsors under the old messages, deals without books) plays on with the bridge", { skip }, () => {
	const w = world(mods);
	w.day(20);
	const rg = w.racing.game;
	w.racing.mod.on_save(rg);
	const old = rg.data("state").split("\n").map((l) => l.startsWith("d|") ? l.split("|").slice(0, -3).join("|") : l).join("\n");
	rg.set_data("state", old);
	const again = new mods.Racing();
	w.bus.join("racing", again, rg);
	w.racing.mod = again;
	again.on_load(rg);
	again.on_pilot_loaded(rg);
	w.bus.drain();
	const posts = tap(w);
	const R = again.world;
	assert.ok(R.deals.every((d) => d.worth === d.pay));
	assert.ok(R.sponsors.some((s) => s.source === "corp"));
	w.day(R.WEEKS * 7);
	assert.ok(posts("corporations.book").length > 0, "the old deals' payments and results are booked");
});
