// Tests for milestone M1 of Corporations: the save cadence, buyouts that can
// fail, military tenders, the losses economy, the map's layers, spaceport news
// and the earnings digest. Against the SDK's FakeGame over human space.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadMod, newGame, galaxy } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";
const HERE = dirname(fileURLToPath(import.meta.url));
const TENDER = 4, OPEN = 0, RUNNING = 1, DELIVERED = 2, FAILED = 3;

function start(options = {}) {
	const game = newGame(options);
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	return { game, mod, m: () => mod.market };
}
function days(mod, game, n) {
	for (let d = 0; d < n; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
	}
}
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
// Diplomacy's condition index for a system: its place in the sorted list, plus one.
const systemIndex = (game, name) => Object.keys(game.systems).sort().indexOf(name) + 1;

// ---- Quick win 1: saving ----

test("saving: not every day in flight, always on landing and after a trade", { skip }, () => {
	const { game, mod } = start();
	let saves = 0;
	const setData = game.set_data.bind(game);
	game.set_data = (k, v) => { if (k === "state") saves++; setData(k, v); };
	days(mod, game, 30);
	assert.ok(saves >= 2 && saves <= 5, `about every ten days in flight (${saves} saves in 30 days)`);
	const before = saves;
	land(mod, game, "Earth");
	assert.equal(saves, before + 1, "landing saves (the game writes the pilot only while landed)");
	assert.equal(game.data("state"), mod.market.encode(), "the saved state is the market as it is");
	// A trade saves at once.
	mod.on_planet_button(game);
	mod.on_panel_row(game, 0);
	mod.on_panel(game, game.panel.buttons.indexOf("Buy"));
	mod.on_number(game, game.numberAsks.at(-1).token, 10);
	assert.equal(saves, before + 2, "a trade saves");
	assert.equal(game.data("state"), mod.market.encode());
});

test("saving: a save, days in flight, then loading it, loses nothing", { skip }, () => {
	const { game, mod } = start();
	days(mod, game, 50);
	land(mod, game, "Earth");
	// The game writes the pilot at takeoff, while still landed: storage, conditions, stock.
	const snap = { storage: new Map(game.storage), conditions: new Map(game.conditions), stock: new Map(game.shipStock), day: game.day_ };
	takeOff(game);
	days(mod, game, 7);
	const timeline = mod.market.encode();
	assert.notEqual(game.data("state"), timeline, "not saved since takeoff");
	assert.notEqual(game.data("rev"), snap.storage.get("rev"), "but the first change bumped the revision");
	// Load the save taken at takeoff: the market is read again, and the same 7 days replay the same way.
	game.storage = new Map(snap.storage); game.conditions = new Map(snap.conditions); game.shipStock = new Map(snap.stock);
	game.day_ = snap.day; game.landed = true; game.planet_ = "Earth";
	mod.on_enter(game, "Sol");
	assert.equal(mod.market.day, snap.day, "the save's market, not the one in memory");
	takeOff(game);
	days(mod, game, 7);
	assert.equal(mod.market.encode(), timeline, "nothing was lost: the replayed days match");
});

test("saving: a mission's autosave in flight, days behind, replays to the same market", { skip }, () => {
	const { game, mod } = start();
	days(mod, game, 41);
	// (M2) A day that changed the game's data (a crisis) saves at once: go on to one that did not.
	const storedDay = () => Number(game.data("state").split("\n")[1].split("|")[2]);
	while (storedDay() === game.day_) days(mod, game, 1);
	// An autosave in flight 4 days after the last save: the state is 4 days old.
	const snap = { storage: new Map(game.storage), conditions: new Map(game.conditions), day: game.day_ };
	const stateDay = Number(snap.storage.get("state").split("\n")[1].split("|")[2]);
	assert.ok(stateDay < snap.day, "the stored market is behind the pilot's day");
	const atSnap = mod.market.encode();
	days(mod, game, 5);
	// Load the autosave: the market is read and the missing days are simulated again.
	game.storage = new Map(snap.storage); game.conditions = new Map(snap.conditions); game.day_ = snap.day;
	mod.on_day(game, game.day_);
	assert.equal(mod.market.encode(), atSnap, "the same market as before the autosave was loaded");
});

// ---- Quick win 2: buyouts ----

test("buyouts: the price gaps to the deal, about a third of bids fail and fall back", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 120);
	const saved = m().encode();
	let failed = 0, done = 0;
	for (let trial = 0; trial < 90; trial++) {
		const market = new (m().constructor)();
		market.decode(saved);
		market.rng.state = 1000 + trial * 7919;
		const t = market.companies.find((c) => !c.canon && c.listed() && c.status === 0 && c.suitor === 0);
		const buyer = market.companies.find((c) => c.listed() && c.status === 0 && c.id !== t.id && market.may_buy(c, t));
		buyer.cash += 1e10;
		const before = t.price;
		market.seek_buyer(t, market.day, 1.3);
		assert.ok(t.suitor > 0, "a bid");
		assert.ok(Math.abs(t.offer - before * 1.3) < 1e-6, "offering a 30% premium");
		assert.ok(t.price >= t.offer * market.DEAL_GAP - 1e-9, "the price gaps to 92% of the offer at once");
		assert.match(market.news.at(-1), /is building a stake in .* jumps to/);
		const gapped = t.price;
		market.complete_buyout(game, t, market.day + 7);
		if (t.status === 4) done++;
		else {
			failed++;
			assert.equal(t.suitor, 0);
			assert.ok(t.price < gapped * 0.95, "a failed bid knocks the price down");
			assert.ok(t.price <= before && t.price >= before * 0.8, `back to about where it stood (${(t.price / before).toFixed(2)})`);
			assert.match(market.news.at(-1), /drops its bid for .*: (its financing falls through|regulators object|.* board rejects it)/);
		}
	}
	console.log(`  buyouts: ${failed} of ${failed + done} bids failed`);
	assert.ok(failed >= 18 && failed <= 45, `about a third fail (${failed} of 90)`);
});

// ---- C6: military tenders ----

// Empty some Navy shelves at Geminus (which sells the most military hulls).
function emptyNavy(mod, game, planet, n) {
	land(mod, game, planet);
	const navy = mod.market.planet_shelves.get(planet).filter((s) => mod.market.hulls.military(s.row)).slice(0, n);
	for (const s of navy) game.set_ship_stock(planet, s.model, 0);
	takeOff(game);
	return navy;
}

test("tenders: short Navy shelves are put out to tender; several builders bid; the winner delivers to the shortest", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 20);
	const navy = emptyNavy(mod, game, "Geminus", 3);
	const model = navy[0].model;
	days(mod, game, 1);
	const k = m().contracts.find((x) => x.kind === TENDER && x.model === model && x.status === OPEN);
	assert.ok(k, "a tender for the empty model");
	assert.equal(k.client, "Republic", "issued by the planet's government");
	assert.ok(k.units >= navy[0].target, `for the shortfall (${k.units} hulls)`);
	assert.ok(m().tender_bidders(k).length >= 2, `more than one builder can bid (${m().tender_bidders(k).join(", ")})`);
	// The Contracts tab: tagged military, with the closing date and the bidders.
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Contracts"));
	const row = game.panel.rows.find((r) => r[0].startsWith("Republic tender: ") && r[0].includes(model.replace(/s$/, "")));
	assert.ok(row, "a row for the tender");
	assert.match(row[0], /\(military\)$/);
	assert.equal(row[1], "Military");
	assert.match(row[4], /^bids close (today|in \d+ days?) \(\d+ \w{3} \d+\); bidders: /);
	// The empty shelf's note says the tender is out.
	land(mod, game, "Geminus");
	assert.match(game.orderNotes.get("Geminus\u0000" + model), /put \d+ of these out to tender; bids close/);
	takeOff(game);
	// Award: price and delivery days weighed; a share-price event and a news line.
	const closes = k.closes;
	while (game.day_ < closes) days(mod, game, 1);
	assert.equal(k.status, RUNNING, "awarded");
	assert.ok(k.bidders >= 2, `${k.bidders} bids`);
	const winner = m().by_id.get(k.winner);
	assert.equal(winner.sector, 0, "to a shipbuilder");
	assert.ok(m().news.some((l) => l.includes(winner.name + " wins the Republic tender for")), "news of the award");
	assert.match(winner.cause, /after winning the Republic tender/);
	land(mod, game, "Geminus");
	if (navy[0].count === 0) assert.match(game.orderNotes.get("Geminus\u0000" + model), new RegExp(`On order from ${winner.name} under a Republic military tender; due (tomorrow|in about \\d+ days) \\(\\d+ \\w{3} \\d+\\)`));
	takeOff(game);
	// Delivery: the shelves of that model get the hulls, most short first.
	const shelves = m().military_shelves.filter((s) => s.model === model);
	while (k.status === RUNNING) days(mod, game, 1);
	if (k.status === FAILED) {
		// An invented builder can fail; the government tenders again at once.
		days(mod, game, 1);
		assert.ok(m().contracts.some((x) => x.kind === TENDER && x.model === model && x.status === OPEN && x.id !== k.id), "issued again");
		return;
	}
	assert.equal(k.status, DELIVERED);
	assert.ok(navy[0].count >= 1, "the empty shelf got hulls");
	for (const s of shelves) assert.ok(s.count <= s.target + 1, "no shelf is overfilled");
});

test("tenders: a bankrupt winner fails the tender, and it is issued again", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 20);
	const navy = emptyNavy(mod, game, "Geminus", 1);
	days(mod, game, 1);
	const k = m().contracts.find((x) => x.kind === TENDER && x.model === navy[0].model);
	while (k.status === OPEN) days(mod, game, 1);
	// Hand it to an invented builder, which then goes bankrupt.
	const w = m().companies.find((c) => c.listed() && c.sector === 0 && !c.canon);
	m().by_id.get(k.winner).load -= k.load;
	k.winner = w.id;
	w.load += k.load;
	const failedBefore = m().tenders_failed;
	m().bankrupt(game, w, m().day);
	assert.equal(k.status, FAILED, "the tender fails with its builder");
	assert.equal(m().tenders_failed, failedBefore + 1);
	assert.match(m().news.at(-2) + m().news.at(-1), /bankruptcy leaves the Republic without .* tender will be issued again/);
	days(mod, game, 1);
	assert.ok(m().contracts.some((x) => x.kind === TENDER && x.model === navy[0].model && x.status === OPEN), "the Republic tenders again");
});

test("tenders: with no builder able to bid, the government's yards build; shelves never stay empty", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	const navy = emptyNavy(mod, game, "Geminus", 2);
	for (const c of m().companies) if (c.sector === 0) c.capacity = 0;
	days(mod, game, 1);
	assert.ok(navy.every((s) => s.count === 0), "the purchases were read back");
	let built = null, said = false;
	for (let d = 0; d < 200 && navy.some((s) => s.count === 0); d++) {
		for (const c of m().companies) if (c.sector === 0) c.capacity = 0;
		days(mod, game, 1);
		built ??= m().contracts.find((x) => x.kind === TENDER && x.status === RUNNING && x.winner === 0);
		// (M2: more news a day, so the line is looked for as it comes.)
		said ||= m().news.some((l) => /No shipbuilder can take the Republic's tender/.test(l));
	}
	assert.ok(built, "the government's own yards took the tender");
	assert.ok(said);
	assert.ok(navy.every((s) => s.count >= 1), "the shelves were filled");
});

// ---- C3/C4: the losses economy ----

test("losses: raids and the war raise a region's index; NPC sales follow; the owner's sidebar says where", { skip }, () => {
	const quiet = start();
	const raided = start();
	const g = raided.game;
	const raid = (game) => {
		game.conditions.set("diplomacy: active", 1);
		game.conditions.set("diplomacy: flotilla 4.1 strength", 100);
		game.conditions.set("diplomacy: flotilla 4.1 kind", 2);
		game.conditions.set("diplomacy: flotilla 4.1 at", systemIndex(game, "Sol"));
	};
	raid(g);
	days(quiet.mod, quiet.game, 60);
	days(raided.mod, g, 60);
	const L = raided.m().losses, Q = quiet.m().losses;
	const r = L.region_of.get("Sol");
	assert.ok(r >= 0, "Sol is a shipyard region");
	assert.ok(Q.index(r) > 0.8 && Q.index(r) < 2.0, `a quiet Sol region is about 1 (${Q.index(r).toFixed(2)})`);
	assert.ok(L.index(r) > 2 * Q.index(r), `a raid raises it (${L.index(r).toFixed(2)})`);
	assert.equal(L.cause(r), "pirate raids");
	assert.ok(raided.m().news.some((l) => /Shipping losses spike near .* after pirate raids/.test(l)), "news of the spike");
	// NPC sales near Sol follow the index.
	// NPC sales at the shipyards of Sol's region follow the index (120 days to count enough).
	days(quiet.mod, quiet.game, 60);
	raid(g);
	days(raided.mod, g, 60);
	const near = Object.keys(galaxy.planets).filter((p) => galaxy.planets[p].shipyard && galaxy.planets[p].system === "Sol");
	const sold = (mm) => near.reduce((n, p) => n + (mm.npc_sold_at.get(p) ?? 0), 0);
	assert.ok(sold(raided.m()) > sold(quiet.m()), `more hulls sold near Sol (${sold(raided.m())} against ${sold(quiet.m())})`);
	// Betelgeuse owns the Shuttle that Luna and Earth sell: its sidebar names its regions.
	land(raided.mod, g, "Earth");
	raided.mod.on_planet_button(g);
	const bet = raided.m().companies.find((c) => c.name === "Southbound Shipyards");
	raided.mod.exchange.selected = bet.id;
	raided.mod.exchange.show(g, raided.m());
	assert.match(g.panel.text, /Hull demand is strongest near [A-Z][^(]+\(loss index \d+\.\d/);
	// The war: a front raises the regions along it.
	const war = start();
	war.game.conditions.set("diplomacy: active", 1);
	war.game.conditions.set("diplomacy: war a", 1);
	war.game.conditions.set("diplomacy: war b", 3);
	days(war.mod, war.game, 1);
	assert.ok(war.m().news.some((l) => /order more warships as war breaks out.*\|w,s$/.test(l)), "war news, tagged");
	assert.ok(war.m().urgent("Republic", war.game.day_), "the warring governments want warships urgently");
	days(war.mod, war.game, 59);
	const W = war.m().losses;
	const front = W.regions.map((_, i) => i).filter((i) => W.static_war[i] > 0);
	assert.ok(front.length > 0, "regions in the warring governments' space");
	assert.ok(front.some((i) => W.index(i) > Q.index(i) * 1.3), "the war raises their index");
});

test("losses: ships the player saw destroyed count, double if the player destroyed them, and are replaced nearby", { skip }, () => {
	const run = (byPlayer) => {
		const { game, mod, m } = start();
		days(mod, game, 3);
		game.here_ = "Sol";
		game.stepLosses = [{ model: "Shuttle", government: "Merchant", byPlayer }, { model: "Shuttle", government: "Merchant", byPlayer }];
		mod.on_step(game, 1);
		game.stepLosses = [];
		mod.on_step(game, 2);
		const near = ["Earth", "Luna"].map((p) => m().shelf_at.get(p + "|Shuttle")).filter(Boolean);
		const before = near.reduce((s, x) => s + x.count, 0);
		days(mod, game, 1);
		const after = near.reduce((s, x) => s + x.count + 0, 0);
		const r = m().losses.region_of.get("Sol");
		return { seen: m().losses.heat_seen[r], replaced: before - after, witnessed: m().losses.witnessed };
	};
	const npc = run(false), player = run(true);
	assert.equal(player.witnessed, 2, "each loss counted once");
	assert.ok(Math.abs(player.seen - 2 * npc.seen) < 1e-9, `losses the player caused count double (${player.seen} against ${npc.seen})`);
	assert.ok(player.replaced >= 2, `a Shuttle the player destroyed is replaced from a shelf nearby (${player.replaced})`);
});

// ---- C8: the map ----

test("map: canonical homes lit and labelled, layers toggled from the exchange and kept, at most 200 calls", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 200);
	const rings = game.map.filter((x) => x.ring);
	const prime = rings.find((x) => x.ring === "Betelgeuse");
	assert.ok(prime && prime.scale === 1.5, "Betelgeuse Shipyards' home system has a bright ring 1.5 times a marker's");
	assert.ok(game.map.some((x) => x.mapLabel === "Betelgeuse" && x.text === "Betelgeuse"), "and its short name");
	const invented = m().companies.find((c) => !c.canon && c.listed() && !m().companies.some((o) => o.canon && o.system === c.system));
	assert.ok(game.map.some((x) => x.marker === invented.system), "an invented company's home keeps the quiet ring");
	assert.ok(game.map.some((x) => x.detail && /Loss index \d+\.\d/.test(x.text)), "shipyard systems show their loss index");
	// Switch every layer on from the exchange's Map tab.
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Map"));
	assert.equal(game.panel.title, "Stock exchange: map layers");
	assert.equal(game.panel.rows.length, 4);
	for (let i = 0; i < 4; i++) mod.on_panel_row(game, i);
	assert.deepEqual(game.data("layers").split(",").sort(), ["holdings", "losses", "orders", "shortages"]);
	assert.ok(game.panel.rows.every((r) => r[1] === "on"));
	// Make every layer busy: empty shelves, restocks in flight, holdings.
	for (const p of Object.keys(galaxy.planets).filter((p) => galaxy.planets[p].shipyard)) {
		land(mod, game, p);
		for (const model of galaxy.planets[p].shipyard) game.set_ship_stock(p, model, 0);
	}
	takeOff(game);
	for (const c of m().companies.filter((c) => c.listed()).slice(0, 10)) m().holdings.set(c.id, 100);
	days(mod, game, 2);
	const calls = game.map.length + 1;
	console.log(`  map: ${calls} calls with every layer on (${mod.mapview.calls} counted)`);
	assert.ok(mod.mapview.calls <= 200 && calls <= 200, `at most 200 map calls (${calls})`);
	assert.ok(game.map.some((x) => x.line), "restock and tender lines");
	assert.ok(game.map.some((x) => x.ring && x.color[1] > 0.9), "holdings rings");
	// Off again: kept with the pilot.
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Map"));
	mod.on_panel_row(game, 1);
	assert.ok(!game.data("layers").split(",").includes("orders"));
	days(mod, game, 1);
	assert.ok(!game.map.some((x) => x.line), "no lines with the layer off");
});

// ---- News ----

test("news: one earnings line a day saying beats or misses, causes, tags, and the filter", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 400);
	const lines = m().news.map((l) => l.split("|"));
	const earnings = lines.filter((f) => f[1].startsWith("Earnings: "));
	assert.ok(earnings.length > 0, "earnings digests");
	for (const f of earnings) {
		for (const part of f[1].slice(10).split("; ")) {
			if (/more reports? in line/.test(part)) continue;
			assert.match(part, /^.+ (beats|misses) \(an? [\d.,]+[kMB]? (profit|loss), against an? [\d.,]+[kMB]? (profit|loss)\)/, part);
		}
	}
	assert.ok(lines.every((f) => !/reports a (profit|loss)/.test(f[1])), "no old-style earnings lines");
	assert.ok(lines.some((f) => f.length > 2 && /c\d+/.test(f[2])), "lines are tagged with their companies");
	// The filter: the News heading steps through all, yours, shipyards, war.
	land(mod, game, "Earth");
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("News"));
	const all = game.panel.rows.length;
	assert.match(game.panel.columns[0], /^News: all/);
	mod.on_panel_header(game, 0);
	assert.match(game.panel.columns[0], /^News: yours/);
	assert.equal(game.panel.rows.length, 0, "nothing held, nothing shown");
	mod.on_panel_header(game, 0);
	assert.match(game.panel.columns[0], /^News: shipyards/);
	const yards = game.panel.rows.length;
	assert.ok(yards > 0 && yards < all, `shipyard news only (${yards} of ${all})`);
	mod.on_panel_header(game, 0);
	assert.match(game.panel.columns[0], /^News: war/);
	mod.on_panel_header(game, 0);
	assert.match(game.panel.columns[0], /^News: all/);
});

test("spaceport news: big events post items nearby, at most 8 at once, which hide themselves; changes are rare", { skip }, () => {
	const { game, mod, m } = start();
	const data = readFileSync(join(HERE, "../data/corporations.txt"), "utf8");
	const shown = new Set();
	let maxActive = 0;
	const setCond = game.set_condition.bind(game);
	game.set_condition = (n, v) => { if (n.startsWith("corporations: news ")) shown.add(n.slice(19)); setCond(n, v); };
	const DAYS = 1500;
	for (let d = 0; d < DAYS; d++) {
		days(mod, game, 1);
		maxActive = Math.max(maxActive, m().news_active.length);
		const live = [...game.conditions].filter(([n, v]) => n.startsWith("corporations: news ") && v >= game.day_);
		assert.ok(live.length <= m().NEWS_ACTIVE, `day ${d}: at most ${m().NEWS_ACTIVE} items show (${live.length})`);
		for (const [, v] of live) assert.ok(v <= game.day_ + m().NEWS_DAYS, "each for at most NEWS_DAYS");
	}
	const changes = game.changes.filter((c) => c.startsWith("news "));
	console.log(`  spaceport news: ${shown.size} kinds shown, ${changes.length} data changes in ${DAYS} days, at most ${maxActive} at once`);
	assert.ok(shown.size >= 3, "items were posted");
	for (const key of shown) assert.ok(data.includes(`news "corporations: ${key}"`), `the data defines ${key}`);
	assert.ok(changes.length <= DAYS / m().DYNAMIC_EVERY + 1, `data changes are rare (${changes.length})`);
	for (const c of changes) assert.match(c, /^news "corporations: slot [1-4]"\n\tremove location\n\tlocation\n\t\tnear "[^"]+" 2\n\tremove message\n\tmessage\n\t\tword\n\t\t\t"[^"`]+"$/);
	// Once their day passes they no longer show, whatever the market remembers.
	const later = game.day_ + m().NEWS_DAYS + 1;
	assert.ok([...game.conditions].filter(([n]) => n.startsWith("corporations: news ")).every(([, v]) => v < later), "every item has hidden itself by then");
});

test("wars: several at once, between any governments; a new government's shipyards tender too", { skip }, () => {
	const { game, mod, m } = start();
	game.conditions.set("diplomacy: active", 1);
	// Diplomacy will publish several wars; war_pairs is where the market reads them.
	m().war_pairs = () => [["Republic", "Syndicate"], ["Free Worlds Rebels", "Syndicate"]];
	days(mod, game, 1);
	assert.deepEqual([...m().wars], ["Free Worlds Rebels/Syndicate", "Republic/Syndicate"]);
	assert.deepEqual([...m().enemies.get("Syndicate")].sort(), ["Free Worlds Rebels", "Republic"]);
	for (const g of ["Republic", "Syndicate", "Free Worlds Rebels"]) assert.ok(m().urgent(g, game.day_), `${g} is urgent`);
	assert.equal(m().news.filter((l) => l.includes("order more warships as war breaks out")).length, 2, "news for each war");
	// A rebel government takes Geminus: its own shelves are tendered for in its name.
	game.planets.Geminus.government = "Free Worlds Rebels";
	emptyNavy(mod, game, "Geminus", 1);
	days(mod, game, 2);
	assert.ok(m().contracts.some((k) => k.kind === TENDER && k.client === "Free Worlds Rebels"), "a tender from the new government");
	// One war ends: the next day knows.
	m().war_pairs = () => [["Republic", "Syndicate"]];
	days(mod, game, 1);
	assert.deepEqual([...m().wars], ["Republic/Syndicate"]);
});

test("shipyards change at run time: Luna gains the Navy shipyard, Geminus is cleared and rebuilt", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 3);
	const navy = ["Frigate", "Cruiser", "Carrier", "Auxiliary"];
	assert.ok(!navy.some((x) => m().shelf_at.has("Luna|" + x)), "Luna starts without them");
	// Diplomacy's event: the Navy Advanced shipyard opens on Luna; Geminus is cleared.
	game.planets.Luna.shipyard = [...game.planets.Luna.shipyard, ...navy];
	const geminus = game.planets.Geminus.shipyard;
	game.planets.Geminus.shipyard = [];
	// Within 30 days, without the player landing, the market sees both.
	days(mod, game, 30);
	for (const x of navy) {
		const s = m().shelf_at.get("Luna|" + x);
		assert.ok(s && m().hulls.military(s.row), `Luna stocks the ${x} as a military hull`);
	}
	assert.ok(!m().planet_shelves.has("Geminus"), "the cleared shipyard has no shelves");
	// Luna's are tendered for by the Republic like any Navy yard.
	land(mod, game, "Luna");
	game.set_ship_stock("Luna", "Cruiser", 0);
	takeOff(game);
	days(mod, game, 1);
	const k = m().contracts.find((x) => x.kind === TENDER && x.model === "Cruiser" && x.status === OPEN);
	assert.ok(k && k.client === "Republic" && k.system === "Sol", "a Republic tender for Luna's Cruiser");
	assert.ok(!m().contracts.some((x) => x.kind === TENDER && x.system === "Castor" && x.issued > game.day_ - 25), "none for cleared Geminus");
	// Rebuilt: landing there stocks it again.
	game.planets.Geminus.shipyard = geminus;
	land(mod, game, "Geminus");
	assert.ok(geminus.every((x) => m().shelf_at.has("Geminus|" + x)), "Geminus is stocked again");
	assert.equal(game.ship_stock("Geminus", "Cruiser"), m().shelf_at.get("Geminus|Cruiser").count);
});

test("a shipyard that opens during a session in human space is stocked from then on", { skip }, () => {
	const planets = JSON.parse(JSON.stringify(galaxy.planets));
	const shut = planets.Geminus.shipyard;
	planets.Geminus.shipyard = [];
	const { game, mod, m } = start({ planets });
	days(mod, game, 2);
	assert.ok(!m().planet_shelves.has("Geminus"));
	game.planets.Geminus.shipyard = shut;
	days(mod, game, 30);
	assert.ok(m().planet_shelves.has("Geminus"), "stocked by the monthly check");
	assert.ok(shut.every((x) => m().shelf_at.has("Geminus|" + x)));
});

// ---- Review fixes ----

test("saving: two save histories of one pilot never share a revision (rev.mjs)", { skip }, () => {
	const { game, mod } = start();
	const snap = () => ({ storage: new Map(game.storage), conditions: new Map(game.conditions), stock: new Map(game.shipStock) });
	const restore = (x) => { game.storage = new Map(x.storage); game.conditions = new Map(x.conditions); game.shipStock = new Map(x.stock); land(mod, game, "Earth"); };
	const buy = (row) => { mod.on_planet_button(game); mod.on_panel_row(game, row); mod.on_panel(game, game.panel.buttons.indexOf("Buy")); mod.on_number(game, game.numberAsks.at(-1).token, 100); };
	days(mod, game, 50);
	land(mod, game, "Earth");
	const S = snap();
	buy(0); buy(0); buy(0);
	const S1 = snap();
	restore(S);
	buy(1);
	assert.notEqual(game.data("rev"), S1.storage.get("rev"), "the other branch has its own revision");
	restore(S1);
	assert.equal(mod.market.encode(), S1.storage.get("state"), "loading S1 reads S1's market, not the one in memory");
	// A revision from another game session never matches either.
	const other = new Corporations();
	other.on_enter(game, game.here_);
	other.save(game);
	assert.notEqual(game.data("rev").split(".")[1], mod.loaded_rev.split(".")[1], "each session draws its own token");
});

test("saving: a dividend paid just before an in-flight autosave is not paid twice on replay (div.mjs)", { skip }, () => {
	const { game, mod } = start();
	days(mod, game, 40);
	for (const c of mod.market.companies) if (c.listed()) { mod.market.holdings.set(c.id, Math.floor(c.shares / 100)); mod.market.basis.set(c.id, 1); }
	land(mod, game, "Earth");
	takeOff(game);
	let paid = false;
	for (let i = 0; i < 200 && !paid; i++) {
		const before = game.condition("credits");
		days(mod, game, 1);
		paid = game.condition("credits") !== before;
	}
	assert.ok(paid, "a dividend was paid");
	days(mod, game, 1);
	const snap = { storage: new Map(game.storage), conditions: new Map(game.conditions), day: game.day_ };
	const credits = snap.conditions.get("credits");
	days(mod, game, 5);
	game.storage = new Map(snap.storage); game.conditions = new Map(snap.conditions); game.day_ = snap.day;
	mod.on_day(game, game.day_);
	assert.equal(game.condition("credits"), credits, "credits unchanged after the replay");
});

test("tenders: open and running tenders count against the gap; a bounded number a year", { skip }, () => {
	const { game, mod, m } = start();
	const yards = Object.keys(galaxy.planets).filter((p) => galaxy.planets[p].shipyard);
	let seed = 5;
	const roll = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
	for (let d = 1; d <= 730; d++) {
		days(mod, game, 1);
		// A player who buys Navy hulls often.
		if (d % 4 === 0) {
			const navy = m().military_shelves[roll(m().military_shelves.length)];
			land(mod, game, navy.planet);
			if (game.ship_stock(navy.planet, navy.model) > 0) game.set_ship_stock(navy.planet, navy.model, game.ship_stock(navy.planet, navy.model) - 1);
			takeOff(game);
		}
		// Never more hulls tendered for than the shortfall (with the urgent extra).
		const short = new Map(), pending = new Map();
		for (const s of m().military_shelves) {
			const gov = game.planet_government(s.planet), key = gov + "|" + s.model;
			short.set(key, (short.get(key) ?? 0) + Math.max(0, s.target + 1 - s.count));
		}
		for (const k of m().contracts) if (k.kind === TENDER && (k.status === OPEN || k.status === RUNNING)) pending.set(k.client + "|" + k.model, (pending.get(k.client + "|" + k.model) ?? 0) + k.units);
		for (const [key, n] of pending) {
			const open = m().contracts.filter((k) => k.kind === TENDER && k.status === OPEN && k.client + "|" + k.model === key).length;
			assert.ok(open <= 1, `day ${d}: one open tender for ${key} (${open})`);
			assert.ok(n <= (short.get(key) ?? 0) + m().TENDER_MAX, `day ${d}: ${key} has ${n} hulls on tender for a shortfall of ${short.get(key)}`);
		}
	}
	const perYear = m().tenders_issued / 2;
	console.log(`  tenders: ${perYear} a year with a player buying Navy hulls every 4 days`);
	assert.ok(perYear <= 80, `a bounded number of tenders a year (${perYear})`);
});

test("losses: a single witnessed loss raises the region's heat, which then falls back", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 2);
	const r = m().losses.region_of.get("Sol");
	game.here_ = "Sol";
	game.stepLosses = [{ model: "Sparrow", government: "Pirate", byPlayer: false }];
	mod.on_step(game, 1);
	game.stepLosses = [];
	days(mod, game, 1);
	const peak = m().losses.heat_seen[r];
	assert.ok(peak > 0, "the loss counts");
	days(mod, game, 60);
	assert.ok(m().losses.heat_seen[r] < peak * 0.2, `and fades (${m().losses.heat_seen[r].toFixed(2)} of ${peak.toFixed(2)})`);
	assert.equal(m().losses.seen.size, 0, "nothing left waiting");
});

test("spaceport news: an item showing is not posted again; its condition goes to 0 after its window", { skip }, () => {
	const { game, mod, m } = start();
	const sets = [];
	const setCond = game.set_condition.bind(game);
	game.set_condition = (n, v) => { if (n.startsWith("corporations: news ")) sets.push([game.day_, n, v]); setCond(n, v); };
	days(mod, game, 1500);
	const shows = sets.filter(([, , v]) => v > 0);
	assert.ok(shows.length > 3, "items were shown");
	for (const [day, n, v] of shows) {
		const again = shows.find(([d2, n2]) => n2 === n && d2 > day && d2 <= v);
		assert.ok(!again, `${n} posted again on day ${again?.[0]} while showing (until ${v})`);
	}
	// Every item that ran out was reset to 0.
	const ended = shows.filter(([, , v]) => v < game.day_ - 1);
	for (const [, n, v] of ended) assert.ok(sets.some(([d2, n2, v2]) => n2 === n && v2 === 0 && d2 > v), `${n} reset to 0`);
	assert.ok([...game.conditions].filter(([n, v]) => n.startsWith("corporations: news ") && v > 0).every(([, v]) => v >= game.day_ - 1), "no stale conditions left");
});

test("spaceport news: a change saves the market that day; big events are told on landing nearby", { skip }, () => {
	const { game, mod, m } = start();
	let changed = false;
	for (let d = 0; d < 1500 && !changed; d++) {
		const n = game.changes.length;
		days(mod, game, 1);
		// (M3: crises change trade prices too; this looks for a news item's change.)
		changed = game.changes.slice(n).some((t) => t.startsWith('news "corporations: slot'));
	}
	assert.ok(changed, "a data change was made");
	assert.equal(game.data("state"), mod.market.encode(), "and the market was saved the same day");
	const key = m().news_active.at(-1).split("=")[0];
	const place = mod.press.places.get(key);
	const planet = Object.keys(galaxy.planets).find((p) => galaxy.planets[p].system === place && galaxy.planets[p].services?.includes("bank")) ?? Object.keys(galaxy.planets).find((p) => galaxy.planets[p].system === place);
	if (planet) {
		land(mod, game, planet);
		assert.ok(game.messages.some((x) => x.startsWith("Spaceport news: ")), "told on landing");
		const n = game.messages.length;
		takeOff(game); land(mod, game, planet);
		assert.equal(game.messages.filter((x) => x.startsWith("Spaceport news: ")).length, game.messages.slice(0, n).filter((x) => x.startsWith("Spaceport news: ")).length, "only once");
	}
});

test("tenders deliver only to the government's shipyards, never past their targets, and not to a model delisted", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 3);
	const model = "Gunboat";
	const shelves = m().military_shelves.filter((s) => s.model === model);
	assert.ok(shelves.length >= 3, "several shipyards sell it");
	// Empty them all; one changes hands; one delists the model.
	for (const s of shelves) m().set_count(s, 0);
	const [rebel, delisted] = shelves;
	game.planets[rebel.planet].government = "Free Worlds Rebels";
	game.planets[delisted.planet].shipyard = game.planets[delisted.planet].shipyard.filter((x) => x !== model);
	const k = { kind: TENDER, model, units: 20, client: "Republic" };
	const before = new Map(shelves.map((s) => [s, s.count]));
	m().stock_military(game, Object.assign(new (m().contracts[0].constructor)(), k));
	assert.equal(rebel.count, 0, "nothing to another government's shipyard");
	assert.ok(!m().shelf_at.has(delisted.planet + "|" + model), "the delisted model's shelf is gone");
	for (const s of shelves.slice(2)) assert.equal(s.count, s.target, `${s.planet} filled to its target, not past it`);
	assert.ok(before.size === shelves.length);
});

test("tenders: a military model's builder is remembered for royalties after its tender is pruned", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 10);
	emptyNavy(mod, game, "Geminus", 2);
	let k;
	for (let d = 0; d < 30 && !k; d++) { days(mod, game, 1); k = m().contracts.find((x) => x.kind === TENDER && x.status === RUNNING && x.winner > 0); }
	assert.ok(k, "a tender awarded");
	days(mod, game, k.days + 75);
	assert.ok(!m().contracts.includes(k), "the tender was pruned");
	assert.equal(m().last_builder(k.model).id, k.winner, "the builder is still known");
	mod.save(game);
	const again = new Corporations();
	again.on_enter(game, "Sol");
	assert.equal(again.market.last_builder(k.model).id, k.winner, "and saved");
});

test("wars: a count of wars and per-war pairs are read when present", { skip }, () => {
	const { game, mod, m } = start();
	game.conditions.set("diplomacy: active", 1);
	game.conditions.set("diplomacy: war a", 1);
	game.conditions.set("diplomacy: war b", 2);
	days(mod, game, 1);
	assert.deepEqual([...m().wars], ["Free Worlds/Republic"], "the single pair, without a count");
	game.conditions.set("diplomacy: wars", 2);
	game.conditions.set("diplomacy: war 1 a", 1); game.conditions.set("diplomacy: war 1 b", 3);
	game.conditions.set("diplomacy: war 2 a", 2); game.conditions.set("diplomacy: war 2 b", 3);
	days(mod, game, 1);
	assert.deepEqual([...m().wars], ["Free Worlds/Syndicate", "Republic/Syndicate"], "every war from the count");
	// Diplomacy's sides (its README): 9 is the Thule League's rebels; a side
	// that never rebels (13) names no government and is left out.
	game.conditions.set("diplomacy: war 2 b", 9);
	days(mod, game, 1);
	assert.deepEqual([...m().wars], ["Free Worlds/Thule League", "Republic/Syndicate"]);
	game.conditions.set("diplomacy: war 2 b", 13);
	days(mod, game, 1);
	assert.deepEqual([...m().wars], ["Republic/Syndicate"]);
	assert.equal(m().government_name(23), "");
	assert.equal(m().government_name(20), "Lower Core Syndics");
});

test("Galaxy: a rebel-held system in human space keeps its shelves and lanes; it issues contracts", { skip }, () => {
	const systems = JSON.parse(JSON.stringify(galaxy.systems));
	const planets = JSON.parse(JSON.stringify(galaxy.planets));
	const host = "Castor";
	systems[host].government = "Castor Free State";
	for (const p of Object.values(planets)) if (p.system === host) p.government = "Castor Free State";
	const sys = {};
	for (const [name, s] of Object.entries(systems)) sys[name] = { government: s.government, links: s.links, inhabited: true, defense: [] };
	// An alien system next to human space stays out.
	sys["Alien Reach"] = { government: "Hai", links: ["Sol"], inhabited: true, defense: [] };
	const { game, mod, m } = start({ systems: sys, planets });
	days(mod, game, 60);
	const G = mod.galaxy;
	assert.ok(G.index.has(host), "the rebel system is human space");
	assert.ok(!G.index.has("Alien Reach"), "the alien one is not");
	assert.ok(m().planet_shelves.has("Geminus"), "its shipyard is stocked");
	assert.ok(m().losses.region_of.has(host), "and a losses region");
	assert.ok(m().client_govs.includes("Castor Free State"), "its government issues contracts");
});

test("map: one gold ring a system, a label per company", { skip }, () => {
	const { game, mod } = start();
	days(mod, game, 30);
	assert.equal(game.map.filter((x) => x.ring === "Sol").length, 1, "one ring for Sol");
	assert.ok(game.map.filter((x) => x.mapLabel === "Sol").length >= 2, "labels for Tycho Crater and Megaparsec");
});

test("Mod API 10, when the game has it: on_save saves the market, the cadence is off, and Diplomacy's bus is heard", { skip }, () => {
	const game = newGame();
	const heard = [];
	game.has = (f) => ["on_save", "notify", "on_notification"].includes(f);
	game.listen = (p) => heard.push(p);
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	assert.deepEqual(heard, ["diplomacy.*", "corporations.roster_wanted", "corporations.book"], "it listens for Diplomacy's events (and, 0.5, its own roster and booking requests)");
	let saves = 0;
	const setData = game.set_data.bind(game);
	game.set_data = (k, v) => { if (k === "state") saves++; setData(k, v); };
	days(mod, game, 40);
	assert.equal(saves, 0, "no cadence saves with on_save");
	mod.on_save(game);
	assert.equal(saves, 1);
	assert.equal(game.data("state"), mod.market.encode(), "on_save writes the market");
	mod.on_save(game);
	assert.equal(saves, 1, "and only when it changed");
	// The bus: a capture in a running war makes both governments urgent.
	game.conditions.set("diplomacy: active", 1);
	game.conditions.set("diplomacy: war a", 1);
	game.conditions.set("diplomacy: war b", 3);
	days(mod, game, 31);
	assert.ok(!mod.market.urgent_until.has("x"));
	mod.on_notification(game, "diplomacy.capture", "{}", "diplomacy");
	assert.ok(mod.market.news.at(-1).includes("after a system changes hands"), "a payload without fields counts for every war");
	assert.ok(mod.market.urgent_until.get("Syndicate") > game.day_);
	// Diplomacy's documented payloads (its README): the war named, losses placed.
	mod.on_notification(game, "diplomacy.war", '{"id":3,"a":2,"b":9,"a_government":"Free Worlds","b_government":"Thule League","kind":"rebellion","goals":["Thule"],"reason":"split","until":1100300}', "diplomacy");
	assert.match(mod.market.news.at(-1), /The Free Worlds and the Thule League order more warships as war breaks out/);
	assert.ok(mod.market.urgent_until.get("Thule League") > game.day_);
	const r = mod.market.losses.region_of.get("Sol");
	const heat = mod.market.losses.heat_war[r];
	const news = mod.market.news.length;
	mod.on_notification(game, "diplomacy.battle", '{"system":"Sol","a":1,"b":3,"loss_a":40,"loss_b":72}', "diplomacy");
	assert.equal(mod.market.news.length, news, "battles come daily: no news");
	days(mod, game, 1);
	assert.ok(mod.market.losses.heat_war[r] > heat + 10, "a battle's losses count where it was fought");
	mod.on_notification(game, "diplomacy.capture", '{"system":"Sol","by":3,"from":1,"war":3,"core":false}', "diplomacy");
	assert.match(mod.market.news.at(-1), /The Syndicate and the Republic order more warships after a system changes hands/);
	mod.on_notification(game, "diplomacy.battle", '{"system":"Sol","a":1,"b":"x","loss_a":"?"}', "diplomacy");
	mod.on_notification(game, "diplomacy.peace", '{"id":3,"a":1,"b":2,"winner":2,"moved":5,"score":-22}', "diplomacy");
	// With the bus, the statistics raise no events of their own.
	const before = mod.market.news.length;
	game.conditions.set("diplomacy: stat captures", 50);
	days(mod, game, 2);
	assert.ok(!mod.market.news.slice(before).some((l) => l.includes("changes hands")), "no second event from the statistics");
	// On an API 9 game (no `has`): the fallback.
	const old = start();
	assert.equal(old.mod.has_on_save, false);
});

test("Diplomacy's 23 sides: a rebel side's raid past side 16 counts; api_version and min_api are 9", { skip }, () => {
	const { game, mod, m } = start();
	assert.equal(mod.api_version(), 9, "loader 0.1.0 checks api_version");
	assert.equal(mod.min_api(), 9);
	days(mod, game, 2);
	const r = m().losses.region_of.get("Sol");
	const before = m().losses.heat_raid[r];
	game.conditions.set("diplomacy: active", 1);
	// The Lower Core Syndics (side 20) raid from their first slot (sides past 16).
	game.conditions.set("diplomacy: flotilla 20.1 strength", 60);
	game.conditions.set("diplomacy: flotilla 20.1 kind", 2);
	game.conditions.set("diplomacy: flotilla 20.1 at", systemIndex(game, "Sol"));
	days(mod, game, 1);
	assert.ok(m().losses.heat_raid[r] > before + 10, "the raid counts");
});
