// Tests for Corporations, against the SDK's FakeGame over human space. The
// long test runs the market for 5,000 days and checks what must always hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, newGame } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";
const DAYS = Number(process.env.CORP_DAYS || 5000);

const listed = (m) => m.market.companies.filter((c) => c.listed());

test(`the market runs ${DAYS} days and keeps its rules`, { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	const m = () => mod.market;
	const canon = m().companies.filter((c) => c.canon).map((c) => c.id);
	assert.equal(canon.length, 15, "15 canonical companies");
	assert.equal(listed(mod).length, 40, "40 companies at the start");

	const events = { bankrupt: 0, buys: 0, breakups: 0, listings: 0, rescues: 0, reviews: 0, distress: 0, cycles: 0, good: 0, bad: 0 };
	// Turns of fortune, and where each company's price stood in its range the day before.
	const GOOD = [/production breakthrough/, /lands an emergency order/, /award for safety/, /new chief executive/, /development grant/];
	const BAD = [/A fire shuts/, /accounting scandal/, /Workers strike/, /loses a lawsuit/, /recalls a faulty/];
	let goodPosition = 0, badPosition = 0;
	const positions = new Map();
	let seen = m().news.length;
	let minListed = 99, maxListed = 0, maxShare = 0, slowest = 0, overDays = new Map(), worstOver = 0;
	let totalTime = 0;
	// M1: military shelves never sit empty for long; canonical builders keep
	// their yards; spaceport news stays bounded; one earnings line a day.
	const zeroRun = new Map();
	let longestZero = 0, maxActive = 0, maxState = 0, saves = 0, earningsLines = 0, contradictions = 0;
	const founding = new Map(m().companies.filter((c) => c.canon).map((c) => [c.id, c.capacity]));
	const setData = game.set_data.bind(game);
	game.set_data = (k, v) => { if (k === "state") { saves++; maxState = Math.max(maxState, v.length); } setData(k, v); };
	const t0 = game.day_;
	for (let d = 1; d <= DAYS; d++) {
		game.day_ = t0 + d;
		for (const c of listed(mod)) positions.set(c.name, m().range_position(c));
		const start = performance.now();
		mod.on_day(game, game.day_);
		const took = performance.now() - start;
		totalTime += took;
		slowest = Math.max(slowest, took);
		// News since yesterday (the market keeps the last 40).
		const news = m().news;
		const fresh = news.slice(Math.max(0, news.length - (news.length - seen + 0)));
		for (const line of news.filter((l) => Number(l.split("|")[0]) === game.day_)) {
			const text = line.split("|")[1];
			if (text.includes("is bankrupt")) events.bankrupt++;
			if (/ buys .* for .* a share/.test(text)) events.buys++;
			if (text.startsWith("Regulators break up")) events.breakups++;
			if (text.startsWith("New listing")) events.listings++;
			if (text.includes(" rescues ")) events.rescues++;
			if (text.startsWith("Regulators open")) events.reviews++;
			if (text.includes("is in distress")) events.distress++;
			if (text.startsWith("The economy enters")) events.cycles++;
			const who = [...positions.keys()].find((n) => text.includes(n));
			if (GOOD.some((r) => r.test(text))) { events.good++; goodPosition += positions.get(who) ?? 0.5; }
			if (BAD.some((r) => r.test(text))) { events.bad++; badPosition += positions.get(who) ?? 0.5; }
		}
		seen = news.length;
		const today = news.filter((l) => Number(l.split("|")[0]) === game.day_);
		const digests = today.filter((l) => l.split("|")[1].startsWith("Earnings: "));
		assert.ok(digests.length <= 1, `day ${d}: one earnings line a day (${digests.length})`);
		earningsLines += digests.length;
		for (const l of today) if (/reports a (profit|loss).*shares (jump|fall)/.test(l)) contradictions++;
		for (const s of m().shelves) {
			if (!m().hulls.military(s.row)) continue;
			const key = s.planet + "|" + s.model;
			const run = s.count === 0 ? (zeroRun.get(key) || 0) + 1 : 0;
			zeroRun.set(key, run);
			longestZero = Math.max(longestZero, run);
		}
		maxActive = Math.max(maxActive, m().news_active.length);
		const now = listed(mod);
		minListed = Math.min(minListed, now.length);
		maxListed = Math.max(maxListed, now.length);
		for (const id of canon) assert.ok(m().by_id.get(id)?.listed(), `day ${d}: canonical company ${id} is listed`);
		for (const c of now) {
			assert.ok(Number.isFinite(c.price) && c.price > 0, `day ${d}: ${c.name} has a positive price (${c.price})`);
			assert.ok(Number.isFinite(c.cash) && Number.isFinite(c.capacity) && c.capacity >= 0, `day ${d}: ${c.name}'s books are numbers`);
		}
		// Antitrust: nobody stays over its review line for long: the larger of
		// 35% and twice an even split of its sector, or 15% of the exchange.
		const bySector = new Map(), peers = new Map();
		for (const c of now) {
			bySector.set(c.sector, (bySector.get(c.sector) || 0) + c.capacity);
			peers.set(c.sector, (peers.get(c.sector) || 0) + 1);
		}
		const worth = now.reduce((s, c) => s + c.price * c.shares, 0);
		for (const c of now) {
			const share = c.capacity / bySector.get(c.sector);
			maxShare = Math.max(maxShare, share);
			// Canonical companies: only their capacity share, over 50% (M1).
			const line = Math.max(c.canon ? 0.5 : 0.35, 2 / peers.get(c.sector));
			// (M4) Only a company that bought rivals answers for its capacity share.
			const over = (c.acquired.length > 0 && share > line) || (!c.canon && c.price * c.shares / worth > 0.15) ? (overDays.get(c.id) || 0) + 1 : 0;
			overDays.set(c.id, over);
			worstOver = Math.max(worstOver, over);
		}
	}
	const value = listed(mod).reduce((s, c) => s + c.price * c.shares, 0);
	const biggest = Math.max(...listed(mod).map((c) => c.price * c.shares));
	console.log(`  ${DAYS} days: listed ${minListed}..${maxListed}, events ${JSON.stringify(events)}`);
	console.log(`  largest sector share ${(maxShare * 100).toFixed(0)}% (longest over its review line: ${worstOver} days); largest company ${(100 * biggest / value).toFixed(1)}% of the market`);
	console.log(`  on_day in V8: ${(totalTime / DAYS).toFixed(2)} ms average, ${slowest.toFixed(1)} ms slowest; saved state ${(game.data("state").length / 1024).toFixed(0)} KB`);
	assert.ok(minListed >= 30 && maxListed <= 50, `30 to 50 companies listed (${minListed}..${maxListed})`);
	assert.ok(events.bankrupt >= 1 && events.buys >= 1, "bankruptcies and buyouts both happen");
	assert.ok(worstOver <= 60 + 7 + 30 + 7, `antitrust acts within its review time (${worstOver} days over)`);
	assert.ok(biggest / value <= 0.25, "no company is over 25% of the market");
	console.log(`  turns of fortune: ${events.good} good (average place in range ${(goodPosition / events.good).toFixed(2)}), ${events.bad} bad (${(badPosition / events.bad).toFixed(2)}); index ${m().index.toFixed(0)}`);
	assert.ok(events.good + events.bad > DAYS * 40 / 700 / 2, "turns of fortune happen");
	// M1 narrowed the luck bias (55% good at a 60-day low, 45% at the high):
	// good and bad turns come about equally often.
	const goodShare = events.good / (events.good + events.bad);
	assert.ok(goodShare > 0.35 && goodShare < 0.65, `good turns are about half (${goodShare.toFixed(2)})`);
	console.log(`  M1: longest a military shelf sat empty ${longestZero} days; saves ${saves} in ${DAYS} days; largest state ${(maxState / 1024).toFixed(0)} KB; news showing at most ${maxActive}; ${earningsLines} earnings lines`);
	assert.ok(longestZero <= 150, `a military shelf is never empty for long (${longestZero} days)`);
	assert.ok(saves <= DAYS / 4, `the market is not saved every day (${saves} saves)`);
	assert.ok(maxState <= 120 * 1024, `the saved state stays under 120 KB (${(maxState / 1024).toFixed(0)} KB)`);
	assert.ok(maxActive <= m().NEWS_ACTIVE, "spaceport news stays bounded");
	assert.equal(contradictions, 0, "no 'profit; shares fall' lines");
	for (const [id, cap] of founding) {
		const c = m().by_id.get(id);
		if (c.sector === 0) assert.ok(c.capacity >= 0.4 * cap, `${c.name} keeps its yards (${c.capacity.toFixed(1)} of ${cap})`);
	}
	assert.ok(m().index > 0 && m().index_history.length === 60, "the index runs, with 60 days kept");
});

test("the saved market reads back as it was", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	for (let d = 1; d <= 203; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
	}
	// (M2) A day that changed the game's data (a crisis) saves at once: go on to one that did not.
	while (game.data("state") === mod.market.encode()) { game.day_ += 1; mod.on_day(game, game.day_); }
	assert.notEqual(game.data("state"), mod.market.encode(), "not saved every day");
	mod.save(game);
	const saved = game.data("state");
	const again = new Corporations();
	again.on_enter(game, "Sol");
	assert.equal(again.market.encode(), saved, "decode then encode gives the same text");
	// Both go on the same way: the generator's state is saved too.
	game.day_ += 1;
	const copy = newGame({ data: { state: saved, world: game.data("world") }, day: game.day_ });
	const twin = new Corporations();
	twin.on_enter(copy, "Sol");
	mod.on_day(game, game.day_);
	twin.on_day(copy, copy.day_);
	assert.equal(twin.market.encode(), mod.market.encode(), "a reloaded market plays out the same");
});

test("the exchange: its own screen, sorting, a company, buying and selling", { skip }, () => {
	const game = newGame({ landed: true, planet: "Earth" });
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	assert.equal(game.planetButtonLabel, "Exchange", "an exchange on a planet with a bank");
	// (M2) Earth is Megaparsec's home: its Orders tab is offered too.
	for (let d = 1; d <= 40; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
	}
	mod.on_planet_button(game);
	assert.ok(game.panel.full, "the exchange has a screen of its own");
	assert.equal(game.panel.title, "Stock exchange: market");
	assert.deepEqual(game.panel.columns, ["Company", "Sector", "Price", "30 days", "P/E", "Yield", "Value v", "You hold"]);
	assert.equal(game.panel.rows.length, listed(mod).length, "every listed company on one screen");
	assert.deepEqual(game.panel.buttons, ["Market", "Portfolio", "Contracts", "News", "Map", "Orders", "Company", "Chiefs", "Leave"]);
	assert.equal(game.panel.selected, -1);
	assert.equal(game.panel.charts?.[0]?.label, "Exchange index", "the sidebar charts the index");
	assert.equal(game.panel.charts[0].values.length, 40);

	// Sorting: by price, high to low; again, low to high; by name, A to Z.
	const prices = () => game.panel.rows.map((r) => Number(r[2].replaceAll(",", "")));
	mod.on_panel_header(game, 2);
	assert.equal(game.panel.columns[2], "Price v");
	assert.deepEqual(prices(), [...prices()].sort((x, y) => y - x), "sorted by price, high to low");
	mod.on_panel_header(game, 2);
	assert.equal(game.panel.columns[2], "Price ^");
	assert.deepEqual(prices(), [...prices()].sort((x, y) => x - y), "then low to high");
	mod.on_panel_header(game, 0);
	const namesNow = game.panel.rows.map((r) => r[0]);
	assert.deepEqual(namesNow, [...namesNow].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)), "by name, A to Z");

	// Choose a company: its details in the sidebar, the row marked, Buy offered.
	const top = game.panel.rows[3][0];
	mod.on_panel_row(game, 3);
	assert.equal(game.panel.selected, 3, "the chosen row is marked");
	assert.ok(game.panel.text.startsWith(top + "\n"), "the sidebar shows the company");
	assert.deepEqual(game.panel.buttons, ["Market", "Portfolio", "Contracts", "News", "Map", "Orders", "Company", "Chiefs", "Buy", "Short", "Leave"]);
	assert.equal(game.panel.charts[0].label, top + ", 60 days", "the sidebar charts the company's price");
	const credits = game.condition("credits");
	mod.on_panel(game, game.panel.buttons.indexOf("Buy"));
	const ask = game.numberAsks.at(-1);
	assert.ok(ask && ask.most > 1000, `the buy dialog offers up to ${ask?.most}`);
	const c = mod.market.companies.find((x) => x.name === top);
	const priceBefore = c.price;
	mod.on_number(game, ask.token, 1000);
	const impact = 2 * 1000 / c.shares;
	const cost = priceBefore * (1 + impact / 2) * 1000;
	assert.equal(game.condition("credits"), credits - Math.round(cost + Math.max(100, cost * 0.01)), "paid the price, moved by the order, and the fee");
	assert.ok(Math.abs(c.price - priceBefore * (1 + impact)) < 1e-9, "the order raised the price");
	assert.equal(mod.market.holdings.get(c.id), 1000);
	assert.match(game.panel.text, /^Bought 1,000 shares/);
	assert.ok(game.panel.buttons.includes("Sell"));
	assert.equal(game.panel.rows[game.panel.selected][0], top, "still chosen, and still in its place");
	assert.equal(game.panel.rows[game.panel.selected][7], "1,000", "the table shows the holding");
	// It is saved: a fresh mod reads the holding back.
	const again = new Corporations();
	again.on_enter(game, "Sol");
	assert.equal(again.market.holdings.get(c.id), 1000, "the holding is saved with the pilot");
	// The portfolio tab lists it; sell half.
	mod.on_panel(game, game.panel.buttons.indexOf("Portfolio"));
	assert.equal(game.panel.title, "Stock exchange: portfolio");
	assert.equal(game.panel.rows.length, 1);
	assert.equal(game.panel.selected, 0, "the chosen company stays chosen across tabs");
	mod.on_panel(game, game.panel.buttons.indexOf("Sell"));
	mod.on_number(game, game.numberAsks.at(-1).token, 500);
	assert.equal(mod.market.holdings.get(c.id), 500);
	assert.match(game.panel.text, /^Sold 500 shares/);
	// The cap: at most 20% of a company.
	mod.on_panel(game, game.panel.buttons.indexOf("Buy"));
	assert.ok(game.numberAsks.at(-1).most <= c.shares * mod.market.MAX_HOLDING - 500);
	// The other tabs.
	mod.on_panel(game, game.panel.buttons.indexOf("Contracts"));
	assert.equal(game.panel.title, "Stock exchange: contracts");
	assert.ok(game.panel.rows.length > 10, "open and recent contracts");
	mod.on_panel(game, game.panel.buttons.indexOf("News"));
	assert.equal(game.panel.title, "Stock exchange: news");
	assert.ok(game.panel.rows.length > 0);
	mod.on_panel(game, game.panel.buttons.indexOf("Leave"));
	assert.equal(game.panel, null);
});

test("no exchange without a bank, and nothing while no pilot is loaded", { skip }, () => {
	// (M2: not Luna, Tycho Crater's home, which offers its Orders without a bank.)
	const game = newGame({ landed: true, planet: "Mars", planets: { Mars: { system: "Sol", government: "Republic", services: ["trading"] } } });
	const mod = new Corporations();
	mod.on_enter(game, "Sol");
	assert.equal(game.planetButtonLabel, "");
	const empty = newGame({ system: "" });
	const idle = new Corporations();
	idle.on_load(empty);
	idle.on_day(empty, 5);
	assert.equal(empty.data("state"), "", "no market before a pilot is loaded");
});

test("jobs: parts for running contracts, and what carrying them does", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	for (let d = 1; d <= 60; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
	}
	// Land on Earth: up to two jobs, each for a running contract within six jumps.
	game.landed = true;
	game.planet_ = "Earth";
	game.jobs.clear();
	mod.on_enter(game, "Sol");
	// (M4: tips about breakthroughs may be on the board too.)
	const parts = [...game.jobs].filter(([n]) => n.startsWith("parts "));
	assert.ok(parts.length >= 1 && parts.length <= 2, `one or two jobs (${parts.length})`);
	const [name, text] = parts[0];
	const id = Number(name.split(" ")[1]);
	const k = mod.market.contracts.find((x) => x.id === id);
	assert.equal(k.status, 1, "for a running contract");
	const company = mod.market.by_id.get(k.winner);
	for (const line of [`name "Parts for ${company.name}"`, "on accept", `\t"corporations: hauling ${id}" = 1`, "on complete", `\t"corporations: delivered ${id}" = 1`, "on fail"])
		assert.ok(text.split("\n").includes(line), `the job's text has: ${line}`);
	assert.match(text, /^destination "[^"]+"$/m);
	assert.match(text, /^cargo "[^"]+" \d+$/m);
	assert.match(text, /^deadline \d+$/m);
	// Taken and delivered: the company grows more reliable, once.
	const before = company.reliability;
	game.setCond = (n, v) => game.conditions.set(n, v);
	game.setCond(`corporations: hauling ${id}`, 1);
	game.setCond(`corporations: delivered ${id}`, 1);
	game.landed = false;
	game.day_ += 1;
	mod.on_day(game, game.day_);
	assert.ok(company.reliability > before, "a delivery raises reliability");
	assert.equal(game.condition(`corporations: delivered ${id}`), 0, "its conditions go back to 0, leaving the save");
	assert.equal(game.condition(`corporations: hauling ${id}`), 0);
	assert.ok(mod.market.jobs_done.has(id), "and the contract is remembered as settled");
	assert.equal(game.data("state"), mod.market.encode(), "a settled job saves the market that day");
	const again2 = company.reliability;
	game.day_ += 1;
	mod.on_day(game, game.day_);
	assert.ok(Math.abs(company.reliability - again2) < 0.05, "counted once");
	// A job already taken is not offered again.
	game.landed = true;
	game.jobs.clear();
	mod.on_enter(game, "Sol");
	assert.ok(![...game.jobs.keys()].includes(name), "a taken job is not offered again");
});

// ---- Shipyard stock (Task C1, C2, C5) ----

import { galaxy, models } from "./world.mjs";

// Land the player on a planet: on_enter pushes that shipyard's counts.
function land(mod, game, planet) {
	game.landed = true;
	game.planet_ = planet;
	game.here_ = game.planets[planet].system;
	mod.on_enter(game, game.here_);
}
function takeOff(game) {
	game.landed = false;
	game.planet_ = "";
}
const shelf = (mod, planet, model) => mod.market.shelf_at.get(planet + "|" + model);
const restocks = (mod) => mod.market.contracts.filter((k) => k.kind === 3);

test("every model a human shipyard sells is in the hull table", { skip }, () => {
	const hulls = new Corporations().market.hulls;
	const sold = new Set();
	for (const p of Object.values(galaxy.planets)) for (const m of p.shipyard ?? []) sold.add(m);
	assert.ok(sold.size > 50, `the fixture lists shipyards (${sold.size} models)`);
	for (const m of sold) assert.ok(hulls.find(m) >= 0, `${m} is in the hull table`);
	for (const m of Object.keys(models)) assert.ok(hulls.find(m) >= 0, `${m} (models.json) is in the hull table`);
	// Owners: canonical companies, or military.
	const names = new Corporations().market.names.canon_names;
	for (let i = 0; i < hulls.models.length; i++)
		assert.ok(hulls.owners[i] === "military" || names.includes(hulls.owners[i]), `${hulls.models[i]}'s owner ${hulls.owners[i]}`);
	assert.equal(hulls.owners[hulls.find("Shuttle")], "Betelgeuse Shipyards");
	assert.equal(hulls.owners[hulls.find("Cruiser")], "military");
	assert.deepEqual([...hulls.targets], [4, 3, 2, 1]);
});

test("shipyards: seeded at their targets, pushed on landing, switched on in on_enter", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	assert.equal(game.shipStockOn, true, "on_enter switches stock on");
	const m = mod.market;
	const pairs = Object.values(galaxy.planets).reduce((n, p) => n + (p.shipyard?.length ?? 0), 0);
	assert.equal(m.shelves.length, pairs, "a shelf for every (planet, model) a human shipyard sells");
	for (const s of m.shelves) assert.equal(s.count, s.target, `${s.planet} ${s.model} starts at its target`);
	assert.equal(shelf(mod, "Luna", "Shuttle")?.target, 4, "civil hulls: 4");
	assert.equal(game.shipStock.size, 0, "nothing pushed in flight");
	land(mod, game, "Luna");
	const luna = galaxy.planets.Luna.shipyard;
	for (const model of luna) assert.equal(game.ship_stock("Luna", model), shelf(mod, "Luna", model).count, `Luna's ${model} pushed`);
	assert.equal(game.shipStock.size, luna.length, "only the landed planet is pushed");
	assert.match(game.data("state"), /^y\|Luna$/m, "saved while landed: the planet pushed, to read back after a load");
	// Loading a pilot switches stock off; the next on_enter switches it on again.
	game.shipStockOn = false;
	mod.on_enter(game, game.here_);
	assert.equal(game.shipStockOn, true);
});

test("shipyards: a purchase triggers a restock, which arrives; stock never goes negative", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	land(mod, game, "Luna");
	const s = shelf(mod, "Luna", "Shuttle");
	const owner = mod.market.owner_of(s.row);
	assert.equal(owner.name, "Betelgeuse Shipyards");
	// The player buys the whole shelf (the game lowers the count), then takes off.
	game.set_ship_stock("Luna", "Shuttle", 0);
	takeOff(game);
	const revenue = owner.revenue;
	game.day_ += 1;
	mod.on_day(game, game.day_);
	assert.equal(s.count, 0, "the purchase was read back");
	assert.equal(mod.market.player_bought, 4);
	const k = restocks(mod).find((x) => x.client === "Luna" && x.model === "Shuttle");
	assert.ok(k, "a restock was ordered");
	assert.equal(k.status, 1, "running at once, no bidding");
	assert.equal(k.winner, owner.id, "awarded to the hull's owner");
	assert.equal(k.units, 4);
	assert.equal(s.onorder, 4);
	assert.ok(k.days >= 12 && k.days < 60, `lead time ${k.days} days`);
	assert.ok(Math.abs(k.price - models.Shuttle.cost * 4 * mod.market.RESTOCK_MARGIN) < 1, "the owner earns RESTOCK_MARGIN of the price");
	// Landing on Luna again before it arrives: empty, with a note saying when.
	land(mod, game, "Luna");
	assert.equal(game.ship_stock("Luna", "Shuttle"), 0);
	assert.match(game.orderNotes.get("Luna\u0000Shuttle") ?? "", /Betelgeuse Shipyards; due in about \d+ days/);
	takeOff(game);
	// It arrives on time and only once; the owner is paid.
	for (let d = 0; d < k.days; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
		for (const x of mod.market.shelves) assert.ok(x.count >= 0 && x.onorder >= 0, `${x.planet} ${x.model}: no negative stock`);
	}
	assert.equal(k.status, 2, "delivered");
	assert.equal(s.count, 4);
	assert.equal(s.onorder, 0);
	assert.ok(owner.revenue - revenue >= k.price - 1, "the owner booked the restock's profit");
	assert.equal(restocks(mod).filter((x) => x.client === "Luna" && x.model === "Shuttle").length, 1, "one restock, not one a day");
	// Pushed again on landing; a hull sold back raises the count.
	land(mod, game, "Luna");
	assert.equal(game.ship_stock("Luna", "Shuttle"), 4);
	assert.equal(game.orderNotes.has("Luna\u0000Shuttle"), false, "the note is gone");
	game.set_ship_stock("Luna", "Shuttle", 5);
	takeOff(game);
	game.day_ += 1;
	mod.on_day(game, game.day_);
	assert.equal(s.count, 5);
	assert.equal(mod.market.player_sold, 1);
});

test("shipyards: military hulls are not restocked by an owner: their government tenders for them", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	const navy = mod.market.shelves.find((s) => mod.market.hulls.military(s.row));
	assert.ok(navy, "some shipyard sells a military hull");
	land(mod, game, navy.planet);
	game.set_ship_stock(navy.planet, navy.model, 0);
	takeOff(game);
	game.day_ += 1;
	mod.on_day(game, game.day_);
	assert.equal(navy.count, 0);
	assert.ok(!restocks(mod).some((k) => k.model === navy.model && k.client === navy.planet), "no restock for a military hull");
	assert.ok(mod.market.contracts.some((k) => k.kind === 4 && k.model === navy.model), "a tender instead");
	land(mod, game, navy.planet);
	assert.match(game.orderNotes.get(navy.planet + "\u0000" + navy.model) ?? "", /out to tender|military tender/);
});

test("shipyards: counts and orders survive a save and load; old saves are seeded", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	land(mod, game, "Luna");
	game.set_ship_stock("Luna", "Shuttle", 1);
	game.set_ship_stock("Luna", "Sparrow", 0);
	takeOff(game);
	game.day_ += 1;
	mod.on_day(game, game.day_);
	// In flight the market is saved every few days (M1); save it now.
	mod.save(game);
	const saved = game.data("state");
	assert.match(saved, /^s\|Luna\|/m, "an s| record per shipyard planet");
	assert.doesNotMatch(saved, /^y\|/m, "the planet left is read back once, then forgotten");
	const again = new Corporations();
	again.on_enter(game, "Sol");
	assert.equal(again.market.encode(), saved, "decode then encode gives the same text");
	assert.equal(shelf(again, "Luna", "Shuttle").count, 1);
	assert.equal(shelf(again, "Luna", "Shuttle").onorder, 3);
	assert.equal(shelf(again, "Luna", "Sparrow").onorder, shelf(again, "Luna", "Sparrow").target);
	const k = restocks(again).find((x) => x.client === "Luna" && x.model === "Shuttle");
	assert.equal(k.units, 3, "the restock reads back with its model and units");
	// A save from before shipyard stock: no s| records; the shelves are seeded.
	const old = saved.split("\n").filter((l) => !l.startsWith("s|") && !l.startsWith("y|")).join("\n");
	const oldGame = newGame({ data: { state: old, world: game.data("world") }, day: game.day_ });
	const fresh = new Corporations();
	fresh.on_enter(oldGame, "Sol");
	assert.equal(fresh.market.shelves.length, mod.market.shelves.length, "seeded");
	assert.ok(fresh.market.shelves.every((s) => s.count === s.target));
});

test("the Contracts tab sums restocks per owner", { skip }, () => {
	const game = newGame({ landed: true, planet: "Luna" });
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	for (const model of galaxy.planets.Luna.shipyard) game.set_ship_stock("Luna", model, 0);
	takeOff(game);
	game.day_ += 1;
	mod.on_day(game, game.day_);
	const n = restocks(mod).length;
	assert.ok(n >= 3, `restocks ordered (${n})`);
	land(mod, game, "Luna");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Contracts"));
	const rows = game.panel.rows.filter((r) => r[0] === "Shipyard restocks");
	const owners = new Set(restocks(mod).map((k) => k.winner));
	assert.equal(rows.length, owners.size, "one row per owner, not one per restock");
	assert.ok(!game.panel.rows.some((r) => r[0].endsWith(" shipyard")), "no row for a single restock");
	mod.on_panel_row(game, game.panel.rows.findIndex((r) => r[0] === "Shipyard restocks"));
	assert.ok(owners.has(mod.exchange.selected), "the row chooses the owner");
	assert.match(game.panel.text, /Hull restocks: \d+ on order/);
});

test("reloading an earlier save of the same pilot reads its market again", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	for (let d = 1; d <= 30; d++) { game.day_ += 1; mod.on_day(game, game.day_); }
	// Saved while landed on Luna, its counts pushed.
	land(mod, game, "Luna");
	const snapshot = new Map(game.storage);
	const engine = new Map(game.shipStock);
	const day = game.day_;
	const saved = shelf(mod, "Luna", "Shuttle").count;
	assert.ok(snapshot.get("rev"), "every save bumps a revision kept with the pilot");
	// The timeline the player then throws away: a purchase, days, restocks.
	game.set_ship_stock("Luna", "Shuttle", 0);
	takeOff(game);
	for (let d = 1; d <= 40; d++) { game.day_ += 1; mod.on_day(game, game.day_); }
	assert.notEqual(mod.market.encode(), snapshot.get("state"));
	// Load the earlier save: the game restores its storage and its stock counts.
	game.storage = new Map(snapshot);
	game.shipStock = new Map(engine);
	game.day_ = day;
	game.landed = true; game.planet_ = "Luna";
	const sold = mod.market.player_sold;
	mod.on_enter(game, game.here_);
	assert.equal(mod.market.day, day, "the market is the save's, not the discarded one");
	assert.equal(mod.market.player_sold, 0, "no phantom sell-back from the old count");
	// (M2: NPC captains may have bought one before the save.)
	assert.equal(shelf(mod, "Luna", "Shuttle").count, saved, "the count as saved");
	const fresh = new Corporations();
	fresh.on_enter(game, game.here_);
	assert.equal(mod.market.encode(), fresh.market.encode(), "memory matches the save as a fresh mod reads it");
	assert.ok(sold >= 0);
});

test("the shelf-record cache always encodes what a fresh encode would", { skip }, () => {
	const game = newGame();
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	const yards = Object.keys(galaxy.planets).filter((p) => galaxy.planets[p].shipyard);
	let seed = 7;
	const roll = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
	for (let d = 1; d <= 400; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
		const cached = mod.market.encode();
		mod.market.shelf_text = new Map();
		assert.equal(cached, mod.market.encode(), `day ${d}: the cached shelf records are current`);
		if (d % 2 === 0) {
			const planet = yards[roll(yards.length)];
			land(mod, game, planet);
			const sold = galaxy.planets[planet].shipyard, model = sold[roll(sold.length)];
			const have = game.ship_stock(planet, model);
			if (have > 0) game.set_ship_stock(planet, model, have - 1);
			takeOff(game);
			// Half the time the purchase is read back by on_enter (as after a
			// load in flight), so the restock is ordered on a day with no count
			// change: only order_restock's own touch keeps its record current.
			if (roll(2) === 0) mod.on_enter(game, game.here_);
		}
	}
	assert.ok(mod.market.hulls_delivered > 20, `restocks delivered (${mod.market.hulls_delivered})`);
});

test("shipyards: only human shipyards are stocked; a delisted model loses its shelf", { skip }, () => {
	const planets = JSON.parse(JSON.stringify(galaxy.planets));
	// An alien shipyard selling a human hull, in a system outside human space.
	planets["Alien Dock"] = { system: "Nowhere", government: "Quarg", services: ["bank"], shipyard: ["Shuttle"] };
	const game = newGame({ planets });
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	land(mod, game, "Alien Dock");
	assert.equal(game.ship_stock("Alien Dock", "Shuttle"), -1, "untracked: unlimited");
	assert.ok(!mod.market.planet_shelves.has("Alien Dock"));
	takeOff(game);
	// Buy Luna's Shuttles; a restock is ordered; then an event delists the Shuttle.
	land(mod, game, "Luna");
	game.set_ship_stock("Luna", "Shuttle", 0);
	takeOff(game);
	game.day_ += 1;
	mod.on_day(game, game.day_);
	const k = restocks(mod).find((x) => x.client === "Luna" && x.model === "Shuttle");
	assert.equal(k.status, 1);
	game.planets.Luna.shipyard = game.planets.Luna.shipyard.filter((m) => m !== "Shuttle");
	land(mod, game, "Luna");
	assert.equal(shelf(mod, "Luna", "Shuttle"), undefined, "the shelf is gone");
	assert.equal(k.status, 4, "its restock is cancelled");
	assert.doesNotMatch(game.data("state"), /^s\|Luna\|(.*\|)?Shuttle,/m, "nor saved");
	// A negative count read from a save is clamped, never untracking the shelf.
	const state = game.data("state").replace(/^s\|Luna\|([^,|]+),\d+,/m, "s|Luna|$1,-3,");
	const g2 = newGame({ planets, data: { state, world: game.data("world") }, day: game.day_, landed: true, planet: "Luna" });
	const m2 = new Corporations();
	m2.on_enter(g2, "Sol");
	assert.ok(m2.market.planet_shelves.get("Luna").every((s) => s.count >= 0));
	assert.ok(galaxy.planets.Luna.shipyard.filter((m) => m !== "Shuttle").every((m) => g2.ship_stock("Luna", m) >= 0), "every shelf is tracked");
});
