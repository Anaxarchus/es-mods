// Tests for milestone M2 of Corporations: convoys (escort or intercept),
// builder standing, the player's orders (C7), commodity crises, sabotage and
// espionage jobs, the sector balance, and the API 10 bus and timing sections
// (guarded: an API 9 game sees none of it). Against the SDK's FakeGame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, newGame, galaxy } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";
const RESTOCK = 3, TENDER = 4, ORDER = 5, RUNNING = 1, DELIVERED = 2, FAILED = 3;

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
	game.jobs = new Map();
	mod.on_enter(game, game.here_);
}
function takeOff(game) {
	game.landed = false;
	game.planet_ = "";
}
const company = (m, name) => m.companies.find((c) => c.name === name);
const standing = (game, id) => game.condition("corporations: standing " + id);
// Each human system's data prices, as FakeGame's [now, data] pairs (API 10).
function prices() {
	const out = {};
	for (const [name, s] of Object.entries(galaxy.systems)) if (s.trade) {
		out[name] = {};
		for (const [c, p] of Object.entries(s.trade)) out[name][c] = [p, p];
	}
	return out;
}
// Run until a convoy is under way (restocks to pirate-adjacent yards leave
// as convoys); its conditions are set at once by the caller.
function convoy(mod, game, wanted = () => true) {
	for (let d = 0; d < 400; d++) {
		days(mod, game, 1);
		const k = mod.market.contracts.find((x) => x.convoy === 1 && x.status === RUNNING && wanted(x));
		if (k) return k;
	}
	throw new Error("no convoy in 400 days");
}
const key = (k) => "corporations: convoy " + k.id;

// ---- Convoys ----

test("convoys: a restock to a pirate-adjacent yard travels, rolls for losses, and arrives", { skip }, () => {
	const { game, mod, m } = start();
	const k = convoy(mod, game, (x) => x.kind === RESTOCK);
	const c = m().by_id.get(k.winner);
	const g = mod.galaxy;
	const to = m().convoys.destination(game, g, m(), k);
	const path = g.route(c.system, to);
	assert.ok(path.length > 0 && path.at(-1) === to, "a route from the builder's home to the shipyard");
	assert.ok(m().convoys.risky(game, g, m(), to), "bound for dangerous space");
	assert.equal(k.load, 0, "its yards are free while it travels");
	assert.ok(m().contracts.some((x) => x.parent === k.id && x.sector === 7), "a security escort contract is put out");
	assert.ok(m().contracts.some((x) => x.parent === k.id && x.sector === 6), "and a freight one");
	const shelf = m().shelf_at.get(k.client + "|" + k.model);
	const before = shelf.count, sold = m().npc_sold_at.get(k.client) ?? 0;
	// It saves and loads as it is.
	const again = new (m().constructor)();
	again.decode(m().encode());
	const copy = again.contracts.find((x) => x.id === k.id);
	assert.equal(copy.convoy, 1);
	assert.equal(copy.depart, k.depart);
	assert.equal(copy.load, 0);
	for (let d = 0; d <= path.length + 1 && k.status === RUNNING; d++) days(mod, game, 1);
	assert.ok(k.status === DELIVERED || k.status === FAILED, "it arrived or was lost on the way");
	// NPC captains may have bought from the shelf meanwhile.
	// (Another restock for the shelf may arrive too.)
	if (k.status === DELIVERED) assert.ok(shelf.count >= before + k.units - ((m().npc_sold_at.get(k.client) ?? 0) - sold), "the hulls reach the shelf on arrival");
});

test("convoys: an escort the player takes holds it; arriving safely delivers early and raises standing", { skip }, () => {
	const { game, mod, m } = start();
	const k = convoy(mod, game, (x) => x.kind === RESTOCK);
	game.set_condition(key(k), 1);
	const c = m().by_id.get(k.winner);
	const path = mod.galaxy.route(c.system, m().convoys.destination(game, mod.galaxy, m(), k));
	days(mod, game, path.length + 3);
	assert.equal(k.status, RUNNING, "it waits for the escort, with no loss rolls");
	const shelf = m().shelf_at.get(k.client + "|" + k.model);
	const count = shelf.count;
	game.set_condition(key(k) + " safe", 1);
	days(mod, game, 1);
	assert.equal(k.status, DELIVERED, "delivered at once");
	assert.equal(shelf.count, count + k.units);
	assert.equal(standing(game, c.id), 6, "standing with the builder +6");
	for (const suffix of ["", " safe", " lost", " failed"]) assert.equal(game.condition(key(k) + suffix), 0, "its conditions leave the save");
	assert.ok(m().news.some((l) => l.includes("early under an independent captain's escort")));
});

test("convoys: intercepted, the shelf stays empty, the builder pays, the restock is ordered again", { skip }, () => {
	const { game, mod, m } = start();
	const k = convoy(mod, game, (x) => x.kind === RESTOCK);
	const c = m().by_id.get(k.winner);
	const rival = m().convoys.rival(m(), c);
	const shelf = m().shelf_at.get(k.client + "|" + k.model);
	const count = shelf.count, cash = c.cash, reliability = c.reliability;
	game.set_condition(key(k), 2);
	days(mod, game, 2);
	assert.equal(k.status, RUNNING, "it waits while the player hunts it");
	game.set_condition(key(k) + " lost", 1);
	game.set_condition(key(k) + " failed", 1);
	days(mod, game, 1);
	assert.equal(k.status, FAILED, "the convoy is lost");
	assert.ok(shelf.count <= count, "no hulls reach the shelf");
	assert.match(c.cause, /after losing a convoy near/, "the builder records it");
	assert.ok(c.reliability < reliability, "and loses reliability");
	assert.equal(standing(game, c.id), -15, "the player loses standing with the builder");
	assert.equal(standing(game, rival.id), 5, "and gains some with the rival who paid");
	assert.ok(m().news.some((l) => l.includes("loses a convoy") && l.includes("to an independent captain")));
	assert.ok(m().contracts.some((x) => x.kind === RESTOCK && x.status === RUNNING && x.client === k.client && x.model === k.model && x.id !== k.id), "the shipyard orders again");
	for (const suffix of ["", " lost", " failed"]) assert.equal(game.condition(key(k) + suffix), 0);
});

test("convoys: a job that fails without the ships lost lets the convoy go on", { skip }, () => {
	const { game, mod, m } = start();
	const k = convoy(mod, game, (x) => x.kind === RESTOCK);
	game.set_condition(key(k), 1);
	days(mod, game, 1);
	game.set_condition(key(k) + " failed", 1);
	days(mod, game, 1);
	assert.equal(game.condition(key(k)), 0, "conditions cleared");
	assert.equal(standing(game, k.winner), -1, "leaving an escort costs a little standing");
	for (let d = 0; d < 40 && k.status === RUNNING; d++) days(mod, game, 1);
	assert.notEqual(k.status, RUNNING, "it went on and arrived (or was lost) by itself");
});

test("convoys: escort jobs on lawful boards ahead of it, intercept jobs on pirate boards nearby", { skip }, () => {
	const { game, mod, m } = start();
	const k = convoy(mod, game, (x) => x.kind === RESTOCK);
	const c = m().by_id.get(k.winner);
	const g = mod.galaxy;
	const to = m().convoys.destination(game, g, m(), k);
	const path = g.route(c.system, to);
	const at = m().day - k.depart;
	const ahead = path.slice(at, -1);
	let escort = null, intercept = null;
	for (const [planet, p] of Object.entries(galaxy.planets)) {
		if (escort && intercept) break;
		if (!p.services.includes("bank")) continue;
		const pirate = p.government === "Pirate" || game.systems[p.system]?.government === "Pirate" || g.neighbours(p.system).some((n) => game.systems[n]?.government === "Pirate");
		if (!escort && !pirate && ahead.includes(p.system)) {
			land(mod, game, planet);
			escort = game.jobs.get("escort " + k.id);
			takeOff(game);
		}
		if (!intercept && pirate) {
			land(mod, game, planet);
			intercept = game.jobs.get("intercept " + k.id);
			takeOff(game);
		}
	}
	assert.ok(escort, "an escort job ahead of the convoy");
	assert.match(escort, /npc accompany save/);
	assert.match(escort, /destination "[^"]+"/);
	assert.match(escort, new RegExp(`"corporations: convoy ${k.id}" = 1`));
	// "on kill": destroyed or captured (the game skips "on destroy" after a capture).
	assert.match(escort, /\ton kill\n\t\t"corporations: convoy \d+ lost" = 1/);
	assert.match(escort, /"corporations: convoy \d+ safe" = 1/);
	assert.ok(intercept, "an intercept job on a pirate board");
	assert.match(intercept, /npc kill/);
	assert.match(intercept, /system "[^"]+"/);
	assert.match(intercept, /\t"cargo settings"\n\t\tcommodities /, "the key quoted, as the game reads it");
	assert.match(intercept, /\t\tvariant\n\t\t\t"Freighter" 2/, "freighters, never the hulls themselves");
	assert.match(intercept, new RegExp(`"corporations: convoy ${k.id}" = 2`));
	assert.match(intercept, /on kill\n\t\tpayment \d+\n\t\t"corporations: convoy \d+ lost" = 1/);
	assert.equal(m().contracts.filter((x) => x.convoy === 1).length >= 1, true);
	assert.equal(game.spawned.length, 0, "no ship is spawned for a convoy");
});

test("convoys: no intercept against a builder the player holds shares in or stands well with", { skip }, () => {
	const { game, m } = start();
	const c = company(m(), "Southbound Shipyards");
	assert.equal(m().convoys.may_intercept(game, m(), c), true);
	game.set_condition("corporations: standing " + c.id, 40);
	assert.equal(m().convoys.may_intercept(game, m(), c), false, "standing 40 or more");
	game.set_condition("corporations: standing " + c.id, 0);
	m().holdings.set(c.id, 1000);
	assert.equal(m().convoys.may_intercept(game, m(), c), false, "shares held");
});

// ---- Standing ----

test("standing: kept in conditions, clamped, parts jobs raise it, shares add a bonus", { skip }, () => {
	const { game, mod, m } = start();
	const s = m().standing;
	const c = company(m(), "Lionheart Industries");
	assert.equal(c.id, 3, "canonical companies keep their ids (Names order)");
	s.add(game, c.id, 150);
	assert.equal(standing(game, c.id), 100, "clamped to 100");
	s.add(game, c.id, -250);
	assert.equal(standing(game, c.id), -100, "and to -100");
	game.set_condition("corporations: standing " + c.id, 0);
	m().holdings.set(c.id, Math.round(c.shares * m().MAX_HOLDING));
	assert.equal(s.effective(game, m(), c.id), 10, "holding the cap adds 10");
	assert.equal(standing(game, c.id), 0, "which is not stored");
	// A parts job delivered for a company raises standing with it.
	m().holdings.delete(c.id);
	days(mod, game, 30);
	const k = m().contracts.find((x) => x.status === RUNNING && x.kind < 3 && m().by_id.get(x.winner)?.listed());
	game.set_condition("corporations: hauling " + k.id, 1);
	game.set_condition("corporations: delivered " + k.id, 1);
	const was = standing(game, k.winner);
	days(mod, game, 1);
	assert.equal(standing(game, k.winner), was + 2);
});

// ---- Orders (C7) ----

function openOrders(mod, game, planet) {
	land(mod, game, planet);
	mod.on_planet_button(game);
	mod.on_panel(game, game.panel.buttons.indexOf("Orders"));
	return game.panel;
}
function chooseModel(mod, game, model) {
	const i = mod.exchange.order_items.indexOf("m:" + model);
	assert.ok(i >= 0, `${model} is listed`);
	mod.on_panel_row(game, i);
}

test("orders: only at a builder's home; only its civilian base hulls, never military", { skip }, () => {
	const { game, mod, m } = start();
	const panel = openOrders(mod, game, "Earth");
	assert.equal(panel.title, "Stock exchange: orders");
	const items = mod.exchange.order_items.filter((x) => x.startsWith("m:")).map((x) => x.slice(2));
	assert.ok(items.includes("Bounder") && items.includes("Splinter"), "Megaparsec's hulls");
	const H = m().hulls;
	for (const model of items) {
		const row = H.find(model);
		assert.equal(H.owners[row], "Megaparsec Incorporated");
		assert.equal(H.military(row), false, `${model} is civilian`);
		assert.ok(!model.includes("(") && !model.startsWith("Marauder"), "base hulls only");
	}
	const b = company(m(), "Megaparsec Incorporated");
	assert.match(m().orders.refusal(game, m(), b, "Cruiser", 1), /only for its own civilian designs/);
	assert.equal(m().orders.place(game, m(), b, "Cruiser", 1, m().day).id, 0, "a military hull is never ordered");
	// Not elsewhere: a bank planet that is no builder's home.
	takeOff(game);
	land(mod, game, "New Boston");
	mod.on_planet_button(game);
	assert.ok(!game.panel.buttons.includes("Orders"), "no Orders away from a builder's home");
	// Every builder home with civilian designs offers them.
	for (const home of ["Prime", "Zug", "Valhalla", "Wayfarer", "Foundry", "Luna"]) assert.ok(m().orders.builder_at(m(), home).id !== 0, `${home} takes orders`);
	assert.deepEqual(m().orders.models(m(), m().orders.builder_at(m(), "Geminus")).map((r) => m().hulls.models[r]), ["Enforcer"], "Gemini's legacy Enforcer, to order only");
});

test("orders: 20% deposit, a cancel refunds half, a ready order nets exactly the remainder through buy_ship", { skip }, () => {
	const { game, mod, m } = start();
	game.set_condition("credits", 50000000);
	openOrders(mod, game, "Earth");
	chooseModel(mod, game, "Bounder");
	assert.ok(game.panel.buttons.includes("Order"));
	mod.on_panel(game, game.panel.buttons.indexOf("Order"));
	const ask = game.numberAsks.at(-1);
	assert.equal(ask.most, 3, "1 to 3 hulls");
	mod.on_number(game, ask.token, 2);
	const confirm = game.confirms.at(-1);
	assert.match(confirm.text, /Order 2 Bounders from Megaparsec Incorporated for 3,144,000 credits/);
	const credits0 = game.condition("credits");
	mod.on_confirm(game, confirm.token);
	const price = 1572000, deposit = Math.round(price * 0.2);
	assert.equal(credits0 - game.condition("credits"), 2 * deposit, "the deposit, 20% a hull");
	const k = m().contracts.find((x) => x.kind === ORDER);
	assert.equal(k.units, 2);
	assert.equal(k.price, 2 * price);
	assert.equal(k.budget, 2 * deposit);
	assert.equal(game.data("state"), m().encode(), "saved at once");
	// It loads back as it is.
	const again = new (m().constructor)();
	again.decode(m().encode());
	assert.equal(again.encode(), m().encode());
	// Queued ahead of restocks: its lead counts only other orders.
	const b = company(m(), "Megaparsec Incorporated");
	assert.ok(k.days >= 3 && k.days <= 40, `lead ${k.days} days`);
	// Cancel: half the deposit back.
	const credits1 = game.condition("credits");
	mod.on_panel_row(game, mod.exchange.order_items.indexOf("o:" + k.id));
	mod.on_panel(game, game.panel.buttons.indexOf("Cancel order"));
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.condition("credits") - credits1, deposit, "half of 2 deposits");
	assert.ok(!m().contracts.some((x) => x.kind === ORDER), "the order is gone");
	// Order again, fly until it is ready, land: the dialog asks for the rest.
	chooseModel(mod, game, "Bounder");
	mod.on_panel(game, game.panel.buttons.indexOf("Order"));
	mod.on_number(game, game.numberAsks.at(-1).token, 2);
	mod.on_confirm(game, game.confirms.at(-1).token);
	const order = m().contracts.find((x) => x.kind === ORDER);
	takeOff(game);
	for (let d = 0; d < 60 && order.status === RUNNING; d++) days(mod, game, 1);
	assert.equal(order.status, DELIVERED, "ready");
	assert.ok(game.messages.some((t) => /Your order of 2 Bounders from Megaparsec Incorporated is ready on Earth/.test(t)));
	const confirms = game.confirms.length;
	land(mod, game, "Earth");
	assert.ok(game.messages.at(-1).includes("is ready here"), "told on landing");
	mod.on_planet_button(game);
	assert.equal(game.confirms.length, confirms + 1, "opening the exchange asks at once");
	const dialog = game.confirms.at(-1);
	assert.match(dialog.text, /Pay the remaining 2,515,200 credits/);
	const before = game.condition("credits");
	mod.on_confirm(game, dialog.token);
	assert.equal(game.purchases.length, 2, "two ships through buy_ship");
	assert.ok(game.purchases.every((p) => p.model === "Bounder" && p.planet === "Earth"));
	assert.equal(before - game.condition("credits"), 2 * (price - deposit), "the totals net to the remainder exactly");
	assert.ok(!m().contracts.some((x) => x.kind === ORDER), "delivered orders are gone");
	assert.ok(b.cash > 0);
});

test("orders: a delivery the game refuses is undone; standing discounts and shortens, and spends standing", { skip }, () => {
	const { game, mod, m } = start();
	const b = company(m(), "Megaparsec Incorporated");
	game.set_condition("credits", 10000000);
	const plain = m().orders.unit_price(game, m(), b, "Splinter");
	const slow = m().orders.lead(game, m(), b, m().hulls.find("Splinter"), 1);
	game.set_condition("corporations: standing " + b.id, 80);
	const cut = m().orders.unit_price(game, m(), b, "Splinter");
	assert.equal(cut, Math.round(4347000 * 0.97), "3% off at standing 60 or more");
	assert.ok(plain === 4347000 && m().orders.lead(game, m(), b, m().hulls.find("Splinter"), 1) < slow, "and sooner");
	land(mod, game, "Earth");
	const k = m().orders.place(game, m(), b, "Splinter", 1, m().day);
	assert.ok(k.id > 0);
	assert.equal(standing(game, b.id), 65, "the discount spent 15 standing");
	k.status = DELIVERED;
	k.ends = m().day;
	// Too few credits for the rest: nothing changes.
	game.set_condition("credits", 1000);
	assert.equal(m().orders.deliver(game, m(), k), 0);
	assert.equal(game.condition("credits"), 1000, "the credit back was undone");
	assert.equal(game.purchases.length, 0);
	game.set_condition("credits", 5000000);
	assert.equal(m().orders.deliver(game, m(), k), 1);
	assert.equal(5000000 - game.condition("credits"), cut - Math.round(cut * 0.2), "the discounted remainder");
});

test("orders: the empty-shelf note at the builder's home mentions ordering", { skip }, () => {
	const { game, mod, m } = start();
	// Zug, Southbound's home, sells its hulls.
	land(mod, game, "Zug");
	const shelf = m().planet_shelves.get("Zug").find((s) => m().hulls.owners[s.row] === "Southbound Shipyards" && m().orders.orderable(m(), s.row));
	assert.ok(shelf, "Zug sells a Southbound hull");
	game.set_ship_stock("Zug", shelf.model, 0);
	takeOff(game);
	land(mod, game, "Zug");
	assert.match(game.orderNotes.get("Zug\u0000" + shelf.model), /Southbound Shipyards takes orders for it here/);
});

// ---- Commodity crises ----

function applyChanges(game, prices) {
	// What the engine does with a crisis's data change: each system's trade line sets its data price.
	for (const text of game.changes) {
		let sys = null;
		for (const line of text.split("\n")) {
			const s = /^system "([^"]+)"/.exec(line);
			if (s) sys = s[1];
			const t = /^\ttrade "([^"]+)" (\d+)/.exec(line);
			if (t) prices[sys + "|" + t[1]] = Number(t[2]);
		}
	}
	return prices;
}

test("crises (API 9): prices from the game's data rise around the home, and are restored exactly", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 3);
	const c = company(m(), "Megaparsec Incorporated");
	const n0 = game.changes.length;
	const price0 = c.price;
	m().crisis_desk.begin(game, mod.galaxy, m(), c, m().day);
	const x = m().crises.at(-1);
	assert.equal(game.changes.length, n0 + 1, "one data change for the whole crisis");
	const body = game.changes.at(-1);
	assert.match(body, /^system "Sol"\n\ttrade "Food" \d+/);
	const touched = new Set(x.changes.map((ch) => ch.split(",")[0]));
	assert.ok(touched.has("Sol") && [...touched].every((s) => s === "Sol" || galaxy.systems.Sol.links.includes(s)), "home and neighbours");
	for (const ch of x.changes) {
		const [sys, good, before, after] = ch.split(",");
		assert.ok(["Food", "Clothing", "Luxury Goods"].includes(good), "consumer goods");
		assert.equal(Number(before), galaxy.systems[sys].trade[good], "the price before is the data's (Trade)");
		assert.ok(Number(after) > Number(before) * 1.3);
	}
	assert.ok(c.price < price0, "its shares fall");
	assert.equal(m().sector_boost[4], 1, "the boost is set by the next day");
	days(mod, game, 1);
	assert.equal(m().sector_boost[4], m().crisis_desk.BOOST, "rivals' work pays more while it lasts");
	// Saved and loaded with the market.
	const again = new (m().constructor)();
	again.decode(m().encode());
	assert.equal(again.crises.at(-1).encode(), x.encode());
	for (let d = 0; d < 40 && m().crises.includes(x); d++) days(mod, game, 1);
	assert.ok(!m().crises.includes(x), "it ends");
	const now = applyChanges(game, {});
	for (const ch of x.changes) {
		const [sys, good, before] = ch.split(",");
		assert.equal(now[sys + "|" + good], Number(before), `${sys} ${good} back to exactly ${before}`);
	}
	// (Another crisis elsewhere may have come and gone meanwhile.)
	assert.equal(game.changes.slice(n0).filter((t) => t.startsWith('system "Sol"\n\ttrade "Food"')).length, 2, "two events in the pilot for the crisis");
});

test("crises (API 10): prices before come from trade_base_price; a raised price is never restored over; relief ends it", { skip }, () => {
	const p = prices();
	p.Sol.Food = [999, 777];
	const { game, mod, m } = start({ api10: true, prices: p });
	assert.equal(m().api_trade, true, "the API 10 path");
	// The engine moves the data price with each change.
	const change = game.change.bind(game);
	game.change = (text) => {
		const r = change(text);
		const now = applyChanges({ changes: [text] }, {});
		for (const [k, v] of Object.entries(now)) { const [s, c] = k.split("|"); if (game.prices[s]?.[c]) game.prices[s][c][1] = v; }
		return r;
	};
	days(mod, game, 3);
	const mega = company(m(), "Megaparsec Incorporated");
	m().crisis_desk.begin(game, mod.galaxy, m(), mega, m().day);
	const x = m().crises.at(-1);
	assert.ok(x.changes.some((ch) => ch.startsWith("Sol,Food,777,")), "Sol's Food read from trade_base_price (777)");
	assert.ok(game.trade_base_price("Sol", "Food") > 777);
	// Another consumer company at home in Sol would not touch Sol's Food again.
	const poseidon = company(m(), "Poseidon Industries");
	poseidon.system = "Sol";
	m().crisis_desk.begin(game, mod.galaxy, m(), poseidon, m().day);
	const y = m().crises.at(-1);
	assert.ok(!y.changes.some((ch) => ch.startsWith("Sol,Food,")), "a raised price is left alone");
	// The bus hears it after the day.
	days(mod, game, 1);
	assert.ok(game.posted.some((n) => n.name === "corporations.crisis"));
	const payload = JSON.parse(game.posted.find((n) => n.name === "corporations.crisis").payload);
	assert.equal(payload.company, "Megaparsec Incorporated");
	assert.deepEqual(payload.commodities, ["Food", "Clothing", "Luxury Goods"]);
	// Relief: the condition ends the first at once.
	game.set_condition("corporations: relief " + x.id, 1);
	const rel = mega.reliability;
	days(mod, game, 1);
	assert.ok(!m().crises.includes(x), "relief ends it early");
	assert.equal(game.trade_base_price("Sol", "Food"), 777, "restored exactly");
	assert.equal(game.condition("corporations: relief " + x.id), 0);
	assert.equal(standing(game, mega.id), 3, "relief earns standing");
	assert.ok(mega.reliability > rel - 1e-9);
	assert.ok(m().news.some((l) => l.includes("Relief cargo ends")));
});

test("crises: relief jobs are offered near a running crisis", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 3);
	const c = company(m(), "Megaparsec Incorporated");
	m().crisis_desk.begin(game, mod.galaxy, m(), c, m().day);
	const x = m().crises.at(-1);
	x.ends = m().day + 25;
	const near = Object.keys(galaxy.planets).find((p) => galaxy.systems.Sol.links.includes(galaxy.planets[p].system) && galaxy.planets[p].services.includes("bank"));
	land(mod, game, near);
	const job = game.jobs.get("relief " + x.id);
	assert.ok(job, "a relief job one jump away");
	assert.match(job, /cargo "(Food|Clothing|Luxury Goods)" \d+/);
	assert.match(job, /destination "Earth"/);
	assert.match(job, new RegExp(`"corporations: relief ${x.id}" = 1`));
});

// ---- Sabotage and espionage ----

test("covert jobs: only for poor standing with the target or good with the sponsor; caught means a fine and a scandal", { skip }, () => {
	const { game, mod, m } = start();
	days(mod, game, 5);
	land(mod, game, "Earth");
	assert.ok(![...game.jobs.keys()].some((k) => k.startsWith("covert")), "nothing at standing 0");
	takeOff(game);
	const t = company(m(), "Polymath Nanoinstruments");
	game.set_condition("corporations: standing " + t.id, -30);
	land(mod, game, "Earth");
	const name = [...game.jobs.keys()].find((k) => k.startsWith("covert"));
	assert.ok(name, "a covert job for a player the target distrusts");
	const body = game.jobs.get(name);
	const n = name.split(" ")[1];
	takeOff(game);
	const line = m().covert_jobs.find((l) => l.startsWith(n + "|"));
	const [, kind, target, sponsor] = line.split("|").map(Number);
	const tc = m().by_id.get(target);
	if (kind === 1) {
		assert.match(body, /stopover "[^"]+"/);
		assert.match(body, new RegExp(`stopover "${tc.home}"`));
	}
	// Caught: a fine, a scandal, standing lost.
	m().covert.CAUGHT = 100;
	m().covert.CAUGHT_SABOTAGE = 100;
	game.set_condition(`corporations: covert ${n}`, 1);
	game.set_condition(`corporations: covert ${n} done`, 1);
	const credits = game.condition("credits");
	const st = standing(game, target);
	days(mod, game, 1);
	assert.ok(game.condition("credits") < credits, "fined");
	assert.equal(standing(game, target), st - 8 - 25, "standing lost with the target");
	assert.ok(m().news.some((l) => l.includes("Scandal: an independent captain is caught")));
	assert.ok(tc.cause !== "", "the target records the cause");
	assert.equal(game.condition(`corporations: covert ${n} done`), 0);
	assert.ok(!m().covert_jobs.some((l) => l.startsWith(n + "|")), "settled");
});

test("covert jobs: sabotage cuts the target's reliability before a tender; not caught, no fine", { skip }, () => {
	const { game, mod, m } = start();
	const t = company(m(), "Betelgeuse Shipyards");
	const s = company(m(), "Tarazed Corporation");
	m().covert.CAUGHT_SABOTAGE = 0;
	const rel = t.reliability;
	const credits = game.condition("credits");
	m().covert.complete(game, m(), 2, t.id, s.id, 80000, m().day);
	assert.ok(Math.abs(t.reliability - (rel - 0.15)) < 1e-9, "reliability falls 0.15");
	assert.equal(t.cause, "after sabotage at its yards");
	assert.equal(game.condition("credits"), credits, "no fine when not caught");
	assert.equal(standing(game, t.id), -8, "the target trusts the player less anyway");
	// Lower reliability weighs against its bids and raises its failure chance (Market.award, deliver_tender).
	assert.ok(m().health(t) > 1 + 0.5 * (1 - rel) - 1e-9);
});

// ---- The bus, timing sections, and API 9 ----

test("API 10: the bus hears the market's events; timing sections name each subsystem", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	assert.equal(mod.min_api(), 9, "it runs on API 9 games");
	days(mod, game, 2);
	for (const s of ["market", "convoys", "losses", "crises"]) assert.ok(game.sections.includes(s), `a "${s}" section`);
	assert.equal(game.sections.at(-1), "", "and back to none at the end");
	// A tender: empty some Navy shelves at Geminus.
	land(mod, game, "Geminus");
	for (const s of m().planet_shelves.get("Geminus").filter((x) => m().hulls.military(x.row)).slice(0, 3)) game.set_ship_stock("Geminus", s.model, 0);
	takeOff(game);
	for (let d = 0; d < 60 && !game.posted.some((n) => n.name === "corporations.tender_awarded"); d++) days(mod, game, 1);
	const award = game.posted.find((n) => n.name === "corporations.tender_awarded");
	assert.ok(award, "corporations.tender_awarded posted");
	const p = JSON.parse(award.payload);
	assert.equal(p.government, "Republic");
	assert.ok(p.units >= 1 && p.winner && p.price > 0);
	for (let d = 0; d < 200 && !game.posted.some((n) => n.name === "corporations.tender_delivered" || n.name === "corporations.tender_failed"); d++) days(mod, game, 1);
	assert.ok(game.posted.some((n) => n.name === "corporations.tender_delivered" || n.name === "corporations.tender_failed"), "and its outcome");
	// A convoy lost, as the bus hears it.
	const k = convoy(mod, game);
	game.set_condition(key(k), 2);
	game.set_condition(key(k) + " lost", 1);
	days(mod, game, 1);
	const lost = game.posted.find((n) => n.name === "corporations.convoy_lost");
	assert.ok(lost);
	assert.equal(JSON.parse(lost.payload).by_player, true);
	for (const n of game.posted) assert.ok(n.name.startsWith("corporations."), n.name);
});

test("API 9: no bus, no sections, no trade_base_price; the same market otherwise", { skip }, () => {
	const { game, mod, m } = start();
	assert.equal(m().notify, false);
	assert.equal(m().api_trade, false);
	assert.equal(m().timing, false);
	game.sections = [];
	days(mod, game, 120);
	assert.equal(game.posted.length, 0, "nothing posted");
	assert.equal(game.sections.length, 0, "no timing sections");
	assert.equal(game.listening.size, 0, "not listening");
});

test("a bankruptcy is heard on the bus", { skip }, () => {
	const { game, mod, m } = start({ api10: true });
	days(mod, game, 2);
	const c = m().companies.find((x) => !x.canon && x.listed());
	m().bankrupt(game, c, m().day);
	days(mod, game, 1);
	const note = game.posted.find((n) => n.name === "corporations.bankrupt");
	assert.ok(note);
	assert.equal(JSON.parse(note.payload).company, c.name);
});

// ---- Sector balance ----

test("sector balance: shipbuilding is at most about 45% of the exchange at year 14; every sector earns", { skip }, () => {
	const { game, mod, m } = start();
	const months = Array(8).fill(0);
	let n = 0;
	for (let d = 1; d <= 5000; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
		if (d % 30 === 0) {
			n++;
			const e = Array(8).fill(0);
			for (const c of m().companies) if (c.listed() && c.earnings.length) e[c.sector] += c.earnings.at(-1);
			e.forEach((x, i) => { if (x > 0) months[i]++; });
		}
	}
	const v = Array(8).fill(0);
	for (const c of m().companies) if (c.listed()) v[c.sector] += c.price * c.shares;
	const total = v.reduce((a, b) => a + b, 0);
	const shares = v.map((x) => x / total);
	console.log(`  sector value at day 5000: ${shares.map((x) => (x * 100).toFixed(0) + "%").join(" ")}; months in profit ${months.join(" ")} of ${n}; convoys ${m().convoys.formed} (${m().convoys.lost} lost); crises ${m().crisis_desk.started}`);
	assert.ok(shares[0] <= 0.47, `shipbuilding ${(shares[0] * 100).toFixed(0)}% of the exchange`);
	for (let i = 0; i < 8; i++) assert.ok(months[i] >= n / 4, `sector ${i} in profit in at least a quarter of months (${months[i]} of ${n})`);
	const crisesPerYear = m().crisis_desk.started / (5000 / 365);
	assert.ok(crisesPerYear >= 1 && crisesPerYear <= m().crisis_desk.YEARLY, `crises a year: ${crisesPerYear.toFixed(1)}`);
});

// ---- Review fixes ----

test("convoys: a held job keeps the convoy where it is; dropping it costs standing and the convoy goes on from there", { skip }, () => {
	const { game, mod, m } = start();
	const k = convoy(mod, game, (x) => x.kind === RESTOCK && m().day === x.depart);
	const c = m().by_id.get(k.winner);
	const path = m().convoys.path_of(game, mod.galaxy, m(), k, c);
	const rival = m().convoys.rival(m(), c);
	const at = m().day - k.depart;
	game.set_condition(key(k), 2);
	days(mod, game, path.length + 5);
	assert.equal(k.status, RUNNING);
	assert.equal(m().day - k.depart, at, "it waited: its place on the route did not move");
	game.set_condition(key(k) + " failed", 1);
	days(mod, game, 1);
	assert.equal(k.status, RUNNING, "dropping the job does not deliver it at once");
	assert.equal(standing(game, rival.id), -3, "the rival who paid for the intercept trusts the player less");
	for (let d = 0; d < path.length + 3 && k.status === RUNNING; d++) days(mod, game, 1);
	assert.notEqual(k.status, RUNNING, "it finishes the rest of its route");
});

test("convoys: an exact penalty on a loss; a hand-off keeps the route; a dropped convoy clears a held job", { skip }, () => {
	const { game, mod, m } = start();
	const k = convoy(mod, game, (x) => x.kind === RESTOCK);
	const c = m().by_id.get(k.winner);
	const path = m().convoys.path_of(game, mod.galaxy, m(), k, c);
	assert.equal(k.origin, c.system, "it remembers where it left from");
	// Handed to another company (a buyout moves running contracts): same route.
	const other = m().companies.find((x) => x.listed() && x.sector === 0 && x.system !== c.system);
	k.winner = other.id;
	assert.deepEqual(m().convoys.path_of(game, mod.galaxy, m(), k, other), path, "the same route from the same place");
	k.winner = c.id;
	// The penalty, exactly: 3% of the hulls' value.
	const value = m().hulls.costs[m().hulls.find(k.model)] * k.units;
	const cash = c.cash;
	m().convoys.lose(game, m(), k, c, path[0], false, m().day);
	assert.ok(Math.abs(cash - c.cash - value * m().convoys.PENALTY) < 1e-6, "the builder pays 3% of the hulls' value");
	// Another convoy dropped while the player holds a job on it.
	const j = convoy(mod, game, (x) => x.kind === RESTOCK && x.id !== k.id);
	game.set_condition(key(j), 1);
	m().drop_restock(j);
	game.set_condition(key(j) + " safe", 1);
	days(mod, game, 1);
	assert.equal(game.condition(key(j)), 0, "its job's conditions are cleared");
	assert.equal(game.condition(key(j) + " safe"), 0, "even one the job set after");
	const again = new (m().constructor)();
	again.decode(m().encode());
	assert.deepEqual([...again.convoy_orphans], [...m().convoy_orphans], "kept with the market for a while");
});

test("covert jobs: offered, saved at once, accepted, reloaded, completed; a fine the player can't pay is owed and collected", { skip }, () => {
	const { game, mod, m } = start();
	for (let id = 1; id <= 30; id++) game.set_condition("corporations: standing " + id, -30);
	days(mod, game, 30);
	let job = null;
	for (const p of Object.keys(galaxy.planets)) {
		land(mod, game, p);
		job = [...game.jobs.keys()].find((n) => n.startsWith("covert"));
		if (job) break;
		takeOff(game);
	}
	assert.ok(job, "a covert job");
	const n = job.split(" ")[1];
	assert.ok(game.data("state").split("\n").some((l) => l.startsWith("v|" + n + "|")), "the offer is in the saved market at once");
	assert.equal(game.condition(`corporations: covert ${n} done`), 0);
	game.set_condition(`corporations: covert ${n}`, 1);
	// The game saves the pilot at takeoff, the player reloads it later.
	const snap = { storage: new Map(game.storage), conditions: new Map(game.conditions), day: game.day_ };
	takeOff(game);
	days(mod, game, 3);
	game.storage = new Map(snap.storage); game.conditions = new Map(snap.conditions); game.day_ = snap.day;
	const fresh = new Corporations();
	fresh.on_load(game);
	fresh.on_enter(game, "Sol");
	assert.ok(fresh.market.covert_jobs.some((l) => l.startsWith(n + "|")), "the job is known after the reload");
	fresh.market.covert.CAUGHT = 100;
	fresh.market.covert.CAUGHT_SABOTAGE = 100;
	game.set_condition(`corporations: covert ${n} done`, 1);
	game.set_condition("credits", 1000);
	game.day_ += 1;
	fresh.on_day(game, game.day_);
	assert.equal(game.condition("credits"), 0, "the fine takes what the player has");
	const owed = fresh.market.owed;
	assert.ok(owed > 1000, `and the rest is owed (${owed})`);
	fresh.on_planet_button(game);
	assert.match(game.panel.text, /You owe [\d,]+ credits in fines/, "shown at the exchange");
	// Earned money pays it: job pay (credits rising between days), then dividends and sales.
	game.set_condition("credits", 50000);
	game.day_ += 1;
	fresh.on_day(game, game.day_);
	assert.ok(fresh.market.owed <= owed - 50000 + 1 || fresh.market.owed === 0, "job pay goes to the fine");
	assert.ok(game.condition("credits") < 50000);
	const back = new (fresh.market.constructor)();
	back.decode(fresh.market.encode());
	assert.equal(back.owed, fresh.market.owed, "saved");
	// Money on average: pay now, a fine one time in four (plans) or about three (sabotage).
	const cv = new (fresh.market.covert.constructor)();
	assert.ok(Math.abs(1 - cv.CAUGHT / 100 * cv.FINE) < 0.05 && Math.abs(1 - cv.CAUGHT_SABOTAGE / 100 * cv.FINE_SABOTAGE) < 0.05, "about even in money");
});

test("API 9 for real: a game object with no API 10 names at all", { skip }, () => {
	const API10 = new Set(["has", "on_save", "notify", "listen", "unlisten", "trade_price", "trade_base_price", "timing_section", "commodity_count", "commodity_name", "cargo", "outfit_stock", "outfit_stock_on", "set_outfit_stock", "ship_park", "ship_parked", "ship_remove", "energy_fraction", "fuel_fraction"]);
	const raw = newGame({ features: [] });
	const touched = new Set();
	const game = new Proxy(raw, {
		has(t, p) { return API10.has(p) ? false : Reflect.has(t, p); },
		get(t, p) { if (API10.has(p)) { touched.add(p); return undefined; } const v = Reflect.get(t, p, t); return typeof v === "function" ? v.bind(t) : v; },
		set(t, p, v) { t[p] = v; return true; },
	});
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_enter(game, "Sol");
	const planets = Object.keys(galaxy.planets);
	for (let d = 1; d <= 800; d++) {
		raw.day_++;
		mod.on_day(game, raw.day_);
		if (d % 7 === 0) {
			const p = planets[d % planets.length];
			raw.landed = true; raw.planet_ = p; raw.here_ = galaxy.planets[p].system; raw.jobs = new Map();
			mod.on_enter(game, raw.here_);
			mod.on_planet_button(game);
			raw.landed = false; raw.planet_ = "";
		}
	}
	m: {
		const c = mod.market.companies.find((x) => x.listed() && x.sector === 4);
		mod.market.crisis_desk.begin(game, mod.galaxy, mod.market, c, mod.market.day);
		days(mod, raw, 40);
	}
	assert.equal(touched.size, 0, `no API 10 name touched (${[...touched].join(", ")})`);
	assert.ok(raw.changes.some((t) => t.includes("\ttrade ")), "crises still change prices, from the data table");
});

test("crises (API 10): the restore undoes only the crisis's own delta, keeping another mod's change", { skip }, () => {
	const { game, mod, m } = start({ api10: true, prices: prices() });
	const change = game.change.bind(game);
	game.change = (text) => {
		const r = change(text);
		const now = applyChanges({ changes: [text] }, {});
		for (const [k, v] of Object.entries(now)) { const [s, c] = k.split("|"); if (game.prices[s]?.[c]) game.prices[s][c][1] = v; }
		return r;
	};
	days(mod, game, 3);
	const mega = company(m(), "Megaparsec Incorporated");
	m().crisis_desk.begin(game, mod.galaxy, m(), mega, m().day);
	const x = m().crises.at(-1);
	const [, , before, after] = x.changes.find((ch) => ch.startsWith("Sol,Food,")).split(",").map((v, i) => (i < 2 ? v : Number(v)));
	// Another mod (Diplomacy's occupation damage) adds 100 to Sol's Food meanwhile.
	game.change('system "Sol"\n\ttrade "Food" ' + (after + 100));
	x.ends = m().day + 1;
	days(mod, game, 2);
	assert.ok(!m().crises.includes(x));
	assert.equal(game.trade_base_price("Sol", "Food"), before + 100, "its own delta undone, the other mod's 100 kept");
});
