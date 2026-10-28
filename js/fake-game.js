// A stand-in for the game's `Game`, for testing a mod outside the game. It
// keeps a small world in memory: a few ships, a few systems, the player's
// conditions, and what the mod drew or opened. Every method of the real `Game`
// is here with the same arguments (`npm run sync` checks this). `npm run check`
// drives each mod against it, and a mod's own tests can use it too:
//
//     import { FakeGame } from "es/fake-game";
//     const game = new FakeGame();
//     const mod = new MyMod();
//     mod.on_load(game);
//     for (let step = 1; step <= 600; step++) mod.on_step(game, step);
//     assert.equal(game.condition("my mod: ready"), 1);
//
// It checks arguments as the game does: an `int` must be a whole number, a
// `float` a number and a `string` a string, or the call throws, as the real
// game's does. What the game only refuses quietly (a ship index out of range,
// an unknown system) answers what the game answers: "", 0 or false.

const DEFAULT_SYSTEMS = {
	"Sol": { government: "Republic", links: ["Alpha Centauri", "Vega"], inhabited: true, defense: ["Small Republic"] },
	"Alpha Centauri": { government: "Republic", links: ["Sol", "Rigel"], inhabited: true, defense: ["Small Republic"] },
	"Vega": { government: "Republic", links: ["Sol", "Rigel"], inhabited: true, defense: [] },
	"Rigel": { government: "Free Worlds", links: ["Alpha Centauri", "Vega"], inhabited: true, defense: ["Small Free Worlds"], fleets: ["Small Free Worlds"] },
};

// Mod API 5: the player's fleet, by UUID, with installed and integrated outfits,
// and the outfits the fake game knows.
const DEFAULT_FLEET = [
	{ uuid: "00000000-0000-4000-8000-000000000001", name: "Flagship", model: "Sparrow", outfits: { "Energy Blaster": 2, "Hyperdrive": 1, "Heavy Rocket": 10, "Heavy Rocket Launcher": 1 } },
	{ uuid: "00000000-0000-4000-8000-000000000002", name: "Escort", model: "Shuttle", outfits: { "Cargo Expansion": 1 } },
];
const DEFAULT_OUTFITS = {
	"Energy Blaster": { category: "Guns", mass: 10, cost: 14000, weapon: true, attributes: { "outfit space": -10, "weapon capacity": -10, "gun ports": -1 } },
	"Heavy Rocket Launcher": { category: "Secondary Weapons", mass: 18, cost: 62000, weapon: true, attributes: { "outfit space": -18, "weapon capacity": -18, "gun ports": -1 } },
	"Heavy Rocket": { category: "Ammunition", mass: 1, cost: 3000, weapon: false, attributes: { "outfit space": -1 } },
	"Hyperdrive": { category: "Systems", mass: 20, cost: 50000, weapon: false, attributes: { "outfit space": -20, "hyperdrive": 1 } },
	"Cargo Expansion": { category: "Systems", mass: 5, cost: 20000, weapon: false, attributes: { "outfit space": -15, "cargo space": 15 } },
};

// Mod API 6: planets, by true name, with the services the player may use there.
const DEFAULT_PLANETS = {
	"Earth": { system: "Sol", government: "Republic", services: ["bank", "trading", "job board", "hire crew", "outfitter", "shipyard"], shipyard: ["Sparrow", "Shuttle", "Star Barge", "Cruiser"] },
	"Luna": { system: "Sol", government: "Republic", services: ["trading", "outfitter"] },
	"New Tibet": { system: "Alpha Centauri", government: "Republic", services: ["bank", "trading"] },
	"Vinci": { system: "Vega", government: "Republic", services: ["bank", "trading", "outfitter", "shipyard"], shipyard: ["Shuttle", "Clipper"] },
	"Kaus Station": { system: "Rigel", government: "Free Worlds", services: ["trading"] },
};

// Mod API 9: ship models by true name, and what the catalogue says of them.
const DEFAULT_MODELS = {
	"Sparrow": { display: "Sparrow", cost: 225000, category: "Interceptor", licenses: [] },
	"Shuttle": { display: "Shuttle", cost: 180000, category: "Transport", licenses: [] },
	"Star Barge": { display: "Star Barge", cost: 290000, category: "Light Freighter", licenses: [] },
	"Clipper": { display: "Clipper", cost: 900000, category: "Light Freighter", licenses: [] },
	"Cruiser": { display: "Cruiser", cost: 9900000, category: "Heavy Warship", licenses: ["Navy"] },
};

// Energy and fuel are absolute amounts, as the game answers them; maxEnergy and
// maxFuel give the fractions (mod API 10).
const DEFAULT_SHIPS = [
	{ name: "Flagship", model: "Sparrow", player: true, hull: 300, maxHull: 400, shields: 200, maxShields: 300, energy: 1200, maxEnergy: 1200, fuel: 400, maxFuel: 400, government: "Escort", strength: 300000 },
	{ name: "Escort", model: "Shuttle", player: true, hull: 100, maxHull: 100, shields: 0, maxShields: 50, energy: 300, maxEnergy: 600, fuel: 300, maxFuel: 300, government: "Escort", strength: 180000 },
	{ name: "Bandit", model: "Clipper", player: false, hull: 500, maxHull: 600, shields: 300, maxShields: 400, energy: 1600, maxEnergy: 2000, fuel: 300, maxFuel: 500, government: "Pirate", strength: 900000 },
];

// Mod API 10: the standard commodities, and each system's prices: [now, as the data sets it].
const DEFAULT_COMMODITIES = ["Food", "Clothing", "Metal", "Plastic", "Equipment", "Medical", "Industrial", "Electronics", "Heavy Metals", "Luxury Goods"];
const DEFAULT_PRICES = {
	"Sol": { "Food": [255, 280], "Clothing": [320, 300], "Metal": [410, 390], "Electronics": [770, 800], "Luxury Goods": [1600, 1550] },
	"Alpha Centauri": { "Food": [300, 290], "Metal": [350, 360], "Medical": [610, 600] },
	"Vega": { "Food": [220, 240], "Equipment": [500, 480], "Heavy Metals": [890, 900] },
	"Rigel": { "Food": [310, 300], "Industrial": [600, 650], "Plastic": [420, 400] },
};
// Every feature the fake game offers (game.has); a test may pass its own list.
const DEFAULT_FEATURES = [
	"api_has", "cargo", "notify", "on_notification", "on_pilot_loaded", "on_save", "outfit_stock", "ship_fractions",
	"ship_parking", "timing_section", "trade_price",
	"call:api_features", "call:api_has", "call:cargo", "call:commodity_count", "call:commodity_name", "call:listen",
	"call:notify", "call:outfit_stock", "call:outfit_stock_on", "call:set_outfit_stock", "call:ship_energy_fraction",
	"call:ship_fuel_fraction", "call:ship_park", "call:ship_parked", "call:ship_remove", "call:timing_section",
	"call:trade_base_price", "call:trade_price", "call:unlisten",
];

// What the game answers for a ship index out of range.
const NO_SHIP = Object.freeze({ name: "", model: "", player: false, disabled: false, hull: 0, maxHull: 0, shields: 0, maxShields: 0, energy: 0, maxEnergy: 0, fuel: 0, maxFuel: 0, government: "", strength: 0, tag: "" });

// A notification name: 1 to 128 bytes of A-Z a-z 0-9 . _ : / -; a pattern may end in "*".
function noteName(name, pattern) {
	if (name.length > 128) return false;
	const body = pattern && name.endsWith("*") ? name.slice(0, -1) : name;
	if (!pattern && body === "") return false;
	return /^[A-Za-z0-9._:/-]*$/.test(body);
}
// Mod names in the game's order: by their UTF-8 bytes, which is the order of
// their code points (JavaScript's own < compares UTF-16 units).
function byBytes(a, b) {
	const x = [...a], y = [...b];
	for (let i = 0; i < Math.min(x.length, y.length); i++) {
		const d = x[i].codePointAt(0) - y[i].codePointAt(0);
		if (d) return d;
	}
	return x.length - y.length;
}
function listensFor(patterns, name) {
	for (const p of patterns) if (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : p === name) return true;
	return false;
}

// Mod API 10: the notification bus between mods, as the game runs it, for tests
// with more than one mod. Each mod has a FakeGame of its own, joined to one bus:
//
//     const bus = new FakeBus();
//     const a = new FakeGame(), b = new FakeGame();
//     bus.join("trader", modA, a);
//     bus.join("market", modB, b);
//     modA.on_load(a); modB.on_load(b);     // they listen
//     modA.on_step(a, 1);                   // it posts
//     bus.drain();                          // delivered, as after the step's hooks
//
// A FakeGame on no bus keeps what its mod posts in `posted`, and `receive()`
// queues a notification for its mod, delivered by `drain()`.
export class FakeBus {
	constructor() {
		this.members = new Map();
		this.queue = [];
		this.postsSinceDrain = new Map();
		// How many deliveries the last drain made, and every delivery, for tests.
		this.lastDeliveries = 0;
		this.delivered = [];
	}
	join(name, mod, game) {
		str("name", name);
		this.members.set(name, { mod, game });
		game.bus = this;
		game.busName = name;
	}
	post(sender, name, payload) {
		if (!noteName(name, false) || payload.length > 65536 || this.queue.length >= 1024) return false;
		const posts = this.postsSinceDrain.get(sender) ?? 0;
		if (posts >= 256) return false;
		this.postsSinceDrain.set(sender, posts + 1);
		this.queue.push({ name, payload, sender });
		return true;
	}
	// Deliver the queue as the game does: oldest first, to every member that
	// listens but the sender, in name order; what is posted meanwhile joins in,
	// for up to 4 rounds or 1024 deliveries, and the rest waits.
	drain() {
		let deliveries = 0;
		for (let round = 0; round < 4 && this.queue.length && deliveries < 1024; round++) {
			const batch = this.queue;
			this.queue = [];
			while (batch.length && deliveries < 1024) {
				const note = batch.shift();
				const receivers = [...this.members.keys()].sort(byBytes).filter((m) => m !== note.sender && listensFor(this.members.get(m).game.listening, note.name));
				for (const m of receivers) {
					deliveries++;
					this.delivered.push({ to: m, ...note });
					const { mod, game } = this.members.get(m);
					if (typeof mod.on_notification === "function") mod.on_notification(game, note.name, note.payload, note.sender);
				}
			}
			this.queue = batch.concat(this.queue);
		}
		this.postsSinceDrain.clear();
		this.lastDeliveries = deliveries;
		return deliveries;
	}
}

// The game refuses an argument of the wrong type the way these do, with the
// same words, and the hook that made the call is switched off for that mod.
function int(name, v) {
	if (typeof v === "bigint") return;
	if (typeof v !== "number" || !Number.isInteger(v)) {
		throw new TypeError(`parameter \`${name}\` takes an int, and was given ${typeof v === "number" ? `a float (${v})` : `a ${typeof v}`}`);
	}
}
function float(name, v) {
	if (typeof v !== "number" || Number.isNaN(v)) throw new TypeError(`parameter \`${name}\` takes a float, and was given a ${typeof v}`);
}
function str(name, v) {
	if (typeof v !== "string") throw new TypeError(`parameter \`${name}\` takes a string, and was given ${typeof v === "number" ? "a number" : `a ${typeof v}`}`);
}
function bool(name, v) {
	if (typeof v !== "boolean") throw new TypeError(`parameter \`${name}\` takes a bool, and was given a ${typeof v}`);
}

export class FakeGame {
	// options: { system, day, step, conditions, ships, systems, plugins, fleets, landed }
	constructor(options = {}) {
		this.here_ = options.system ?? "Sol";
		this.day_ = options.day ?? 1100430;
		this.step_ = options.step ?? 0;
		this.landed = options.landed ?? false;
		this.conditions = new Map(Object.entries(options.conditions ?? {}));
		this.ships = (options.ships ?? DEFAULT_SHIPS).map((s) => ({ tag: "", ...s }));
		// Each `new FakeGame()` gets its own copy of the default world.
		this.systems = JSON.parse(JSON.stringify(options.systems ?? DEFAULT_SYSTEMS));
		this.plugins = new Set(options.plugins ?? []);
		this.fleets = { "Small Republic": 600000, "Small Free Worlds": 500000, ...(options.fleets ?? {}) };
		this.reputations = new Map();
		this.attitudes = new Map();
		this.kills = new Map();
		// What the mod did, for tests to read.
		this.logs = [];
		this.messages = [];
		this.changes = [];
		this.spawned = [];
		this.map = [];
		this.planetButtonLabel = "";
		this.panel = null;
		// Mod API 5.
		this.fleet = JSON.parse(JSON.stringify(options.fleet ?? DEFAULT_FLEET)).map((s) => ({ integrated: {}, massSaved: 0, spaceSaved: {}, ...s }));
		this.outfits = { ...JSON.parse(JSON.stringify(DEFAULT_OUTFITS)), ...(options.outfits ?? {}) };
		// The outfitter's selected ships (UUIDs, the one in focus first): set it
		// before calling can_outfitter, on_outfitter or on_confirm.
		this.outfitterShips = [];
		this.outfitterButtonLabel = "";
		this.confirms = [];
		// Mod API 6. `planet_` is the planet the player is landed on ("" in flight).
		this.storage = new Map(Object.entries(options.data ?? {}));
		this.planets = JSON.parse(JSON.stringify(options.planets ?? DEFAULT_PLANETS));
		this.planet_ = options.planet ?? (this.landed ? (Object.keys(this.planets).find((p) => this.planets[p].system === this.here_) ?? "") : "");
		// Dialogs game.ask_number() opened; a test answers OK by calling on_number(game, token, value).
		this.numberAsks = [];
		// Mod API 8: jobs offered on this landing, by name (without the mod's prefix), and their text.
		this.jobs = new Map();
		// Mod API 9: ship models, shipyard stock ("<planet>\u0000<model>" -> count;
		// absent means untracked), order notes, ships bought with buy_ship, and the
		// ships destroyed in the coming step. losses() answers `stepLosses` in
		// flight; a test sets it before on_step and empties it after.
		this.models = { ...JSON.parse(JSON.stringify(DEFAULT_MODELS)), ...(options.models ?? {}) };
		this.shipStockOn = false;
		this.shipStock = new Map();
		this.orderNotes = new Map();
		this.purchases = [];
		this.stepLosses = [];
		// Used hulls the player sold to the landed planet's shipyard, by model, for ship_in_stock.
		this.usedHulls = new Map(Object.entries(options.usedHulls ?? {}));
		// Mod API 10: commodities and prices ([now, as the data sets it] by system
		// and commodity), what the player carries (`carried`, by commodity),
		// outfitter stock, ships removed with ship_remove, the features game.has
		// answers, the notification patterns the mod listens for, what it posted
		// (when on no FakeBus) and the notifications queued for it (`receive`), and
		// the timing sections it named.
		this.commodities = [...(options.commodities ?? DEFAULT_COMMODITIES)];
		this.prices = JSON.parse(JSON.stringify(options.prices ?? DEFAULT_PRICES));
		this.carried = new Map(Object.entries(options.cargo ?? { "Food": 10 }));
		this.outfitStockOn = false;
		this.outfitStock = new Map();
		this.removed = [];
		this.features = new Set(options.features ?? DEFAULT_FEATURES);
		this.listening = new Set();
		this.posted = [];
		this.incoming = [];
		this.sections = [];
		this.bus = null;
		this.busName = "";
	}

	fleetShip(uuid) {
		str("ship", uuid);
		return this.fleet.find((s) => s.uuid === uuid);
	}
	outfit(name) {
		str("outfit", name);
		return Object.hasOwn(this.outfits, name) ? this.outfits[name] : undefined;
	}

	// Ship i, or a blank one for an index out of range: the game answers "", 0 or
	// false for a ship that is not there, and ignores a change to one.
	ship(i) {
		int("i", i);
		return this.ships[i] ?? NO_SHIP;
	}
	sys(name) {
		return this.systems[name];
	}
	model(name) {
		str("model", name);
		return Object.hasOwn(this.models, name) ? this.models[name] : undefined;
	}
	stockKey(planet, model) {
		return this.planetOf(planet) && this.model(model) ? planet + "\u0000" + model : undefined;
	}
	loss(k) {
		int("k", k);
		return k >= 0 && k < this.losses() ? this.stepLosses[k] : undefined;
	}

	log(text) { str("text", text); this.logs.push(text); }
	message(text) { str("text", text); this.messages.push(text); }
	step() { return this.step_; }
	system() { return this.here_; }
	ship_count() { return this.landed ? 0 : this.ships.length; }
	flagship() { return this.ships.findIndex((s) => s.player); }
	ship_name(i) { return this.ship(i).name; }
	ship_model(i) { return this.ship(i).model; }
	is_player(i) { return this.ship(i).player; }
	is_disabled(i) { const s = this.ship(i); return s.disabled ?? s.hull <= 0; }
	hull(i) { return this.ship(i).hull; }
	max_hull(i) { return this.ship(i).maxHull; }
	shields(i) { return this.ship(i).shields; }
	max_shields(i) { return this.ship(i).maxShields; }
	energy(i) { return this.ship(i).energy; }
	fuel(i) { return this.ship(i).fuel; }
	set_hull(i, value) { float("value", value); const s = this.ship(i); if (s === NO_SHIP) return; s.hull = Math.min(Math.max(value, 0), s.maxHull); }
	set_shields(i, value) { float("value", value); const s = this.ship(i); if (s === NO_SHIP) return; s.shields = Math.min(Math.max(value, 0), s.maxShields); }
	condition(name) { str("name", name); return this.conditions.get(name) ?? 0; }
	set_condition(name, value) { str("name", name); int("value", value); this.conditions.set(name, value); }

	day() { return this.day_; }
	here() { return this.here_; }
	system_count() { return Object.keys(this.systems).length; }
	system_at(i) { int("i", i); return Object.keys(this.systems).sort()[i] ?? ""; }
	system_government(system) { str("system", system); return this.sys(system)?.government ?? ""; }
	link_count(system) { str("system", system); return this.sys(system)?.links.length ?? 0; }
	link(system, k) { str("system", system); int("k", k); return this.sys(system)?.links[k] ?? ""; }
	inhabited(system) { str("system", system); return this.sys(system)?.inhabited ?? false; }
	defense_count(system) { str("system", system); return this.sys(system)?.defense.length ?? 0; }
	defense_fleet(system, k) { str("system", system); int("k", k); return this.sys(system)?.defense[k] ?? ""; }
	change(text) {
		str("text", text);
		this.changes.push(text);
		// Only system governments are modelled: `system "X"` then `government "Y"`.
		const m = /^system\s+"([^"]+)"\s*\n\s*government\s+"([^"]+)"/.exec(text);
		if (m && this.systems[m[1]]) this.systems[m[1]].government = m[2];
		return true;
	}
	attitude(government, toward) { str("government", government); str("toward", toward); return this.attitudes.get(government + "\u0000" + toward) ?? 0; }
	reputation(government) { str("government", government); return this.reputations.get(government) ?? 0; }
	set_reputation(government, value) { str("government", government); float("value", value); this.reputations.set(government, value); }
	plugin_enabled(name) { str("name", name); return this.plugins.has(name); }
	fleet_strength(fleet) { str("fleet", fleet); return this.fleets[fleet] ?? 0; }
	// Mod API 3. Stats scale with the fleet's strength: per 100,000 credits,
	// 100 hull, 60 shields and 8 damage per second; every fleet has speed 5.
	fleet_stat(fleet, stat) {
		str("fleet", fleet); str("stat", stat);
		const value = this.fleets[fleet];
		if (value === undefined) return 0;
		const k = value / 100000;
		switch (stat) {
			case "ships": return Math.max(1, Math.round(k / 3));
			case "hull": return 100 * k;
			case "shields": return 60 * k;
			case "dps": return 8 * k;
			case "speed": return 5;
			case "cost": return value;
			default: return 0;
		}
	}
	system_fleet_count(system) { str("system", system); return this.sys(system)?.fleets?.length ?? 0; }
	system_fleet(system, k) { str("system", system); int("k", k); return this.sys(system)?.fleets?.[k] ?? ""; }
	spawn(fleet, government, tag, arrive) {
		str("fleet", fleet); str("government", government); str("tag", tag); bool("arrive", arrive);
		if (this.landed || !(fleet in this.fleets)) return 0;
		this.spawned.push({ fleet, government, tag, arrive });
		return 1;
	}
	ship_tag(i) { return this.ship(i).tag; }
	ship_government(i) { return this.ship(i).government; }
	ship_strength(i) { return this.ship(i).strength; }
	tag_strength(tag) {
		str("tag", tag);
		return this.ships.filter((s) => s.tag === tag && s.hull > 0).reduce((sum, s) => sum + s.strength, 0);
	}
	player_kills(prefix) {
		str("prefix", prefix);
		const n = this.kills.get(prefix) ?? 0;
		this.kills.set(prefix, 0);
		return n;
	}
	map_clear() { this.map = []; }
	map_line(from, to, r, g, b) { str("from", from); str("to", to); float("r", r); float("g", g); float("b", b); this.map.push({ line: [from, to], color: [r, g, b] }); }
	map_marker(system, r, g, b, label) { str("system", system); float("r", r); float("g", g); float("b", b); str("label", label); this.map.push({ marker: system, color: [r, g, b], label }); }
	// Mod API 4: a section of the map's side panel for a system.
	map_detail(system, title, text, r, g, b) {
		str("system", system); str("title", title); str("text", text); float("r", r); float("g", g); float("b", b);
		this.map.push({ detail: system, title, text, color: [r, g, b] });
	}
	planet_button(label) { str("label", label); this.planetButtonLabel = label; }
	panel_open(title, text) { str("title", title); str("text", text); this.panel = { title, text, buttons: [] }; }
	panel_button(label) { str("label", label); if (this.panel) this.panel.buttons.push(label); }
	panel_close() { this.panel = null; }

	// Mod API 5: the outfitter, the fleet by UUID, outfits and integrating them.
	outfitter_button(label) { str("label", label); this.outfitterButtonLabel = label; }
	outfitter_ship_count() { return this.outfitterShips.length; }
	outfitter_ship(k) { int("k", k); return this.outfitterShips[k] ?? ""; }
	fleet_count() { return this.fleet.length; }
	fleet_ship(k) { int("k", k); return this.fleet[k]?.uuid ?? ""; }
	fleet_ship_name(ship) { return this.fleetShip(ship)?.name ?? ""; }
	fleet_ship_model(ship) { return this.fleetShip(ship)?.model ?? ""; }
	ship_outfit_count(ship, outfit) { str("outfit", outfit); return this.fleetShip(ship)?.outfits[outfit] ?? 0; }
	ship_integrated_count(ship, outfit) { str("outfit", outfit); return this.fleetShip(ship)?.integrated[outfit] ?? 0; }
	ship_integrate(ship, outfit, scale) {
		float("scale", scale);
		const s = this.fleetShip(ship);
		const o = this.outfit(outfit);
		if (!s || !o || !(scale >= 0 && scale <= 1)) return false;
		// Ammunition's count changes in flight, so it cannot be integrated.
		if (o.category === "Ammunition") return false;
		if ((s.outfits[outfit] ?? 0) <= (s.integrated[outfit] ?? 0)) return false;
		s.integrated[outfit] = (s.integrated[outfit] ?? 0) + 1;
		// It gets lighter, and gives back a share of the outfit space it takes up,
		// in whole tons and units as the game does. Capacities stay as they are.
		s.massSaved += Math.max(0, Math.round(o.mass * (1 - scale)));
		const used = o.attributes?.["outfit space"] ?? 0;
		if (used < 0) s.spaceSaved["outfit space"] = (s.spaceSaved["outfit space"] ?? 0) + Math.round(-used * (1 - scale));
		return true;
	}
	outfit_name(outfit) { const o = this.outfit(outfit); return o ? (o.display ?? outfit) : ""; }
	outfit_category(outfit) { return this.outfit(outfit)?.category ?? ""; }
	outfit_attribute(outfit, attribute) {
		str("attribute", attribute);
		const o = this.outfit(outfit);
		if (!o) return 0;
		if (attribute === "mass") return o.mass;
		if (attribute === "cost") return o.cost;
		return o.attributes?.[attribute] ?? 0;
	}
	outfit_is_weapon(outfit) { return this.outfit(outfit)?.weapon ?? false; }
	confirm(text, token) { str("text", text); int("token", token); this.confirms.push({ text, token }); }

	// Mod API 6: storage, planets, panel tables and the number dialog.
	data(key) { str("key", key); return this.storage.get(key) ?? ""; }
	set_data(key, text) {
		str("key", key); str("text", text);
		if (key === "") return;
		if (text === "") this.storage.delete(key);
		else this.storage.set(key, text);
	}
	planet() { return this.landed ? this.planet_ : ""; }
	planetOf(planet) { str("planet", planet); return Object.hasOwn(this.planets, planet) ? this.planets[planet] : undefined; }
	planet_name(planet) { const p = this.planetOf(planet); return p ? (p.display ?? planet) : ""; }
	planet_system(planet) { return this.planetOf(planet)?.system ?? ""; }
	planet_government(planet) { return this.planetOf(planet)?.government ?? ""; }
	planetsIn(system) { str("system", system); return Object.keys(this.planets).filter((p) => this.planets[p].system === system); }
	planet_count(system) { return this.planetsIn(system).length; }
	planet_at(system, k) { int("k", k); return this.planetsIn(system)[k] ?? ""; }
	planet_service(planet, service) { str("service", service); return this.planetOf(planet)?.services?.includes(service) ?? false; }
	panel_columns(headers) {
		str("headers", headers);
		if (this.panel) { this.panel.columns = headers.split("\t"); this.panel.rows = []; }
	}
	panel_row(cells) {
		str("cells", cells);
		if (this.panel?.columns) this.panel.rows.push(cells.split("\t"));
	}
	// Mod API 7: the panel on a full screen, and its chosen row.
	screen_open(title, text) { str("title", title); str("text", text); this.panel = { title, text, buttons: [], full: true, selected: -1 }; }
	panel_select(row) { int("row", row); if (this.panel) this.panel.selected = row; }
	// Mod API 8: charts on the screen, and jobs on the landed planet's job board.
	panel_chart(label, values) {
		str("label", label); str("values", values);
		if (this.panel && (this.panel.charts ??= []).length < 3) this.panel.charts.push({ label, values: values.split(",").filter((v) => v !== "").map(Number) });
	}
	offer_job(name, text) {
		str("name", name); str("text", text);
		const where = this.planet();
		if (!where || !this.planet_service(where, "job board") && !this.planetOf(where)?.services?.includes("bank") || name === "") return false;
		if (this.jobs.has(name)) return false;
		this.jobs.set(name, text);
		return true;
	}
	ask_number(text, token, most) {
		str("text", text); int("token", token); int("most", most);
		if (most >= 1) this.numberAsks.push({ text, token, most });
	}
	// Mod API 9: shipyard stock, shipyard listings, ship models, buying a ship,
	// the ships destroyed each step, and map labels.
	ship_stock_on(on) { bool("on", on); this.shipStockOn = on; }
	ship_stock(planet, model) {
		const key = this.stockKey(planet, model);
		return key !== undefined && this.shipStock.has(key) ? this.shipStock.get(key) : -1;
	}
	set_ship_stock(planet, model, count) {
		int("count", count);
		const key = this.stockKey(planet, model);
		if (key === undefined) return;
		if (count < 0) this.shipStock.delete(key);
		else this.shipStock.set(key, Math.min(count, 2147483647));
	}
	ship_order_note(planet, model, text) {
		str("text", text);
		const key = this.stockKey(planet, model);
		if (key === undefined) return;
		if (text === "") this.orderNotes.delete(key);
		else this.orderNotes.set(key, text);
	}
	shipyardOf(planet) { return [...(this.planetOf(planet)?.shipyard ?? [])].filter((m) => Object.hasOwn(this.models, m)).sort(); }
	shipyard_count(planet) { return this.shipyardOf(planet).length; }
	shipyard_model(planet, k) { int("k", k); return this.shipyardOf(planet)[k] ?? ""; }
	model_name(model) { const m = this.model(model); return m ? (m.display ?? model) : ""; }
	model_cost(model) { return this.model(model)?.cost ?? 0; }
	model_category(model) { return this.model(model)?.category ?? ""; }
	model_licenses(model) { return (this.model(model)?.licenses ?? []).join(","); }
	// The game allows this only in a hook the player started; FakeGame does not
	// know which hook runs. It charges model_cost to the "credits" condition and
	// adds the ship to the fleet; no shop (stock, used hulls) is touched.
	buy_ship(model, name) {
		str("name", name);
		const m = this.model(model);
		const where = this.planet();
		if (!m || !where) return false;
		if ((m.licenses ?? []).some((l) => !this.condition("license: " + l))) return false;
		const credits = this.condition("credits");
		if (credits < m.cost) return false;
		this.conditions.set("credits", credits - m.cost);
		const shipName = name || `${m.display ?? model} ${this.purchases.length + 1}`;
		this.purchases.push({ model, name: shipName, planet: where });
		const uuid = `00000000-0000-4000-9000-${String(this.purchases.length).padStart(12, "0")}`;
		this.fleet.push({ uuid, name: shipName, model: m.display ?? model, outfits: {}, integrated: {}, massSaved: 0, spaceSaved: {} });
		return true;
	}
	losses() { return this.landed ? 0 : this.stepLosses.length; }
	loss_model(k) { return this.loss(k)?.model ?? ""; }
	loss_government(k) { return this.loss(k)?.government ?? ""; }
	loss_by_player(k) { return this.loss(k)?.byPlayer ?? false; }
	map_label(system, text, r, g, b) {
		str("system", system); str("text", text); float("r", r); float("g", g); float("b", b);
		if (text !== "" && this.sys(system)) this.map.push({ mapLabel: system, text, color: [r, g, b] });
	}
	map_ring(system, scale, r, g, b) {
		str("system", system); float("scale", scale); float("r", r); float("g", g); float("b", b);
		if (this.sys(system)) this.map.push({ ring: system, scale: Number.isFinite(scale) ? Math.min(Math.max(scale, 0.5), 3) : 1, color: [r, g, b] });
	}
	ship_in_stock(model) { return this.model(model) && this.planet() ? (this.usedHulls.get(model) ?? 0) : 0; }

	// Mod API 10: trade, parking, outfitter stock, cargo, the notification bus,
	// features, timing sections and the fractions.
	priceOf(system, commodity) {
		str("system", system); str("commodity", commodity);
		if (!this.sys(system) || !this.commodities.includes(commodity)) return undefined;
		return this.prices[system]?.[commodity] ?? [0, 0];
	}
	trade_price(system, commodity) { return this.priceOf(system, commodity)?.[0] ?? -1; }
	trade_base_price(system, commodity) { return this.priceOf(system, commodity)?.[1] ?? -1; }
	commodity_count() { return this.commodities.length; }
	commodity_name(k) { int("k", k); return this.commodities[k] ?? ""; }
	// The game allows these only in a hook the player started while landed;
	// FakeGame checks the landing, not the hook. The flagship is the fleet's first ship.
	ship_park(ship, on) {
		bool("on", on);
		const s = this.fleetShip(ship);
		if (!s || !this.landed) return false;
		if (on && s === this.fleet[0]) return false;
		s.parked = on;
		return true;
	}
	ship_remove(ship) {
		const s = this.fleetShip(ship);
		if (!s || !this.landed) return false;
		if (s === this.fleet[0] && !this.fleet.some((o) => o !== s && !o.parked)) return false;
		this.fleet.splice(this.fleet.indexOf(s), 1);
		this.removed.push(s);
		return true;
	}
	ship_parked(ship) { return this.fleetShip(ship)?.parked ?? false; }
	outfit_stock_on(on) { bool("on", on); this.outfitStockOn = on; }
	// Maps and licenses are not tracked, as in the game.
	outfitKey(planet, outfit) {
		const o = this.outfit(outfit);
		const trackable = o && !o.attributes?.map && !outfit.endsWith(" License");
		return this.planetOf(planet) && trackable ? planet + "\u0000" + outfit : undefined;
	}
	outfit_stock(planet, outfit) {
		const key = this.outfitKey(planet, outfit);
		return key !== undefined && this.outfitStock.has(key) ? this.outfitStock.get(key) : -1;
	}
	set_outfit_stock(planet, outfit, count) {
		int("count", count);
		const key = this.outfitKey(planet, outfit);
		if (key === undefined) return;
		if (count < 0) this.outfitStock.delete(key);
		else this.outfitStock.set(key, Math.min(count, 2147483647));
	}
	cargo(commodity) { str("commodity", commodity); return this.carried.get(commodity) ?? 0; }
	notify(name, payload) {
		str("name", name); str("payload", payload);
		if (this.bus) return this.bus.post(this.busName, name, payload);
		if (!noteName(name, false) || payload.length > 65536) return false;
		this.posted.push({ name, payload });
		return true;
	}
	listen(pattern) { str("pattern", pattern); if (noteName(pattern, true)) this.listening.add(pattern); }
	unlisten(pattern) { str("pattern", pattern); this.listening.delete(pattern); }
	// Queue a notification for this game's mod, from `sender`; drain(mod) delivers it.
	receive(name, payload, sender) { this.incoming.push({ name, payload, sender }); }
	drain(mod) {
		const queued = this.incoming;
		this.incoming = [];
		for (const n of queued)
			if (listensFor(this.listening, n.name) && typeof mod.on_notification === "function") mod.on_notification(this, n.name, n.payload, n.sender);
	}
	has(feature) { str("feature", feature); return this.features.has(feature); }
	timing_section(name) { str("name", name); this.sections.push(name); }
	energy_fraction(i) { const s = this.ship(i); return s.maxEnergy ? s.energy / s.maxEnergy : 0; }
	fuel_fraction(i) { const s = this.ship(i); return s.maxFuel ? s.fuel / s.maxFuel : 0; }
}
