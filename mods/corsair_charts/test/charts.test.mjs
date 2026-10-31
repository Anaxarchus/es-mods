// Tests for Corsair Charts, against the SDK's FakeGame, through the build (as
// the game loads it). Run with `npm test` (skipped without the Dado toolchain).
//
// The fake game is given a small galaxy of its own (a ring of systems with
// chords, mostly human, one alien), the mod's items as outfits, and a mod API
// 11 feature list (nothing of API 12), and its conditions are computed from
// its cargo, storage and fleet as the game's outfit conditions are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FakeGame } from "es/fake-game";

const HERE = dirname(fileURLToPath(import.meta.url));
const SDK = join(HERE, "../../..");
const MOD = join(HERE, "..");
const BUILT = join(SDK, "dist/Corsair Charts/scripts/corsair_charts.js");
let Charts;
try {
	execFileSync(process.env.DADOC || "dadoc", ["--version"], { stdio: "ignore" });
	execFileSync(process.execPath, [join(SDK, "tools/esmod.mjs"), "build", "mods/corsair_charts"], { cwd: SDK, stdio: "ignore" });
	({ Charts } = await import(BUILT));
} catch {
	// No Dado toolchain here: these tests are skipped.
}
const skip = !Charts && "no Dado toolchain";
const T = Charts ? new Charts().tables : null;
const KIND = { CIPHER: 1, RIDDLE: 2, SCAN: 3, QUESTION: 4, LOCK: 5, COURIER: 6, FINALE: 7 };

// ---- A galaxy ----
const NAMES = ["Albireo", "Beid", "Castor", "Diphda", "Enif", "Fomalhaut", "Gienah", "Hadar", "Izar", "Jabbah", "Kochab", "Lesath",
	"Menkar", "Nunki", "Okul", "Pherkad", "Rasalas", "Sabik", "Tarf", "Unuk", "Vindemiatrix", "Wezen", "Yed", "Zaniah"];
const GOVS = ["Republic", "Syndicate", "Pirate", "Uninhabited", "Free Worlds", "Independent"];
function galaxy() {
	const systems = {}, planets = {};
	const n = NAMES.length;
	for (let i = 0; i < n; i++) {
		const gov = GOVS[i % GOVS.length];
		systems[NAMES[i]] = { government: gov, links: [], inhabited: gov !== "Uninhabited", defense: [] };
	}
	const link = (a, b) => {
		if (!systems[a].links.includes(b)) systems[a].links.push(b);
		if (!systems[b].links.includes(a)) systems[b].links.push(a);
	};
	for (let i = 0; i < n; i++) link(NAMES[i], NAMES[(i + 1) % n]);
	for (let i = 0; i < n; i += 3) link(NAMES[i], NAMES[(i + 7) % n]);
	// An alien system next to Okul: never a trail's target.
	systems["Hai-home"] = { government: "Hai", links: ["Okul"], inhabited: true, defense: [] };
	systems["Okul"].links.push("Hai-home");
	for (let i = 0; i < n; i++) {
		const s = NAMES[i];
		if (!systems[s].inhabited) continue;
		planets[`${s} Prime`] = { system: s, government: systems[s].government, services: ["bank", "trading", "job board", ...(i % 4 === 0 ? ["shipyard"] : [])] };
		if (i % 2 === 0) planets[`${s} Station`] = { system: s, government: systems[s].government, services: ["trading"] };
	}
	planets["Hai-home World"] = { system: "Hai-home", government: "Hai", services: ["trading"] };
	return { systems, planets };
}

// Mod API 11, without anything of 12.
const API11 = ["api_has", "cargo", "notify", "on_notification", "on_pilot_loaded", "on_save", "timing_section", "trade_price",
	"call:outfit_take", "call:outfit_give", "call:ship_distance", "call:ship_x", "call:ship_y", "call:ship_reactivate",
	"call:define", "call:define_outfit_variant", "call:define_ship_variant", "call:defined", "call:ship_replace_outfit"];

function outfitsTable() {
	const o = {};
	const item = (name, cost) => ({ category: "Special", mass: 0, cost, weapon: false, attributes: { installable: -1 } });
	for (const c of T.clues) o[c] = item(c, 1000);
	o[T.fragment] = item(T.fragment, 1000);
	o[T.manifest] = item(T.manifest, 1000);
	o[T.bond] = item(T.bond, T.bond_value);
	for (const x of T.exotics) o[x] = { category: "Systems", mass: 10, cost: 100000, weapon: false, attributes: {} };
	o["Cloaking Device"] = { category: "Unique", mass: 10, cost: 1200000, weapon: false, attributes: {} };
	o["NDR-114 Android"] = { category: "Unique", mass: 0, cost: 120000, weapon: false, attributes: {} };
	return o;
}
const MODELS = {
	"Sparrow": { display: "Sparrow", cost: 225000, category: "Interceptor", licenses: [] },
	"Cutthroat": { display: "Cutthroat", cost: 1100000, category: "Light Warship", licenses: [] },
	"Firebird": { display: "Firebird", cost: 3700000, category: "Medium Warship", licenses: [] },
	"Marauder Leviathan": { display: "Marauder Leviathan", cost: 10800000, category: "Heavy Warship", licenses: [] },
};

function fleetsTable() {
	const f = {};
	for (const row of T.finale_fleets) for (const x of row) f[x] = 1e6;
	for (const x of [...T.courier_fleets, ...T.guard_fleets, ...T.rival_fleets]) if (x) f[x] = 1e6;
	return f;
}

function setup({ system = "Albireo", features = API11, day = 1100430, ships } = {}) {
	const { systems, planets } = galaxy();
	const game = new FakeGame({
		system, day, systems, planets, features,
		outfits: outfitsTable(), models: MODELS, fleets: fleetsTable(),
		ships: ships ?? [{ name: "Flagship", model: "Sparrow", player: true, hull: 400, maxHull: 400, shields: 300, maxShields: 300, energy: 1000, maxEnergy: 1000, fuel: 400, maxFuel: 400, government: "Escort", strength: 3e5, x: 0, y: 0 }],
		mod: "corsair charts",
	});
	// The game's outfit conditions, from what the fake game holds.
	const base = game.condition.bind(game);
	game.condition = (name) => {
		let m;
		if ((m = /^outfit \(cargo\): (.*)$/.exec(name))) return game.outfitCargo.get(m[1]) ?? 0;
		if ((m = /^outfit \(storage\): (.*)$/.exec(name))) return game.planet() ? (game.outfitStorage.get(game.planet())?.get(m[1]) ?? 0) : 0;
		if ((m = /^outfit \(all\): (.*)$/.exec(name))) {
			let n = game.outfitCargo.get(m[1]) ?? 0;
			for (const s of game.outfitStorage.values()) n += s.get(m[1]) ?? 0;
			for (const s of game.fleet) n += s.outfits[m[1]] ?? 0;
			return n;
		}
		if ((m = /^ship model \(all\): (.*)$/.exec(name))) return game.fleet.filter((s) => s.model === m[1]).length;
		return base(name);
	};
	const mod = new Charts();
	mod.on_load(game);
	mod.on_pilot_loaded(game);
	mod.on_enter(game, game.here());
	return { game, mod };
}

function jump(game, mod, system) {
	game.landed = false;
	game.planet_ = "";
	game.here_ = system;
	game.ships = game.ships.filter((s) => s.player);
	game.spawned = [];
	mod.on_enter(game, system);
}
function land(game, mod, planet) {
	game.here_ = game.planets[planet].system;
	game.landed = true;
	game.planet_ = planet;
	game.ships = game.ships.filter((s) => s.player);
	mod.on_enter(game, game.here());
}
function takeOff(game, mod) {
	game.landed = false;
	game.planet_ = "";
	mod.on_enter(game, game.here());
}
function fly(game, mod, seconds) {
	for (let s = 0; s < seconds * 60; s++) {
		game.step_ += 1;
		mod.on_step(game, game.step_);
	}
}
const cargo = (game, item) => game.outfitCargo.get(item) ?? 0;
// Press the open panel's button with this label.
function press(game, mod, label) {
	const i = game.panel.buttons.indexOf(label);
	assert.ok(i >= 0, `no button "${label}" in ${JSON.stringify(game.panel.buttons)}`);
	mod.on_panel(game, i);
}
// Shortest jumps, computed here from the fake galaxy.
function bfs(game, from) {
	const d = { [from]: 0 }, q = [from];
	while (q.length) {
		const s = q.shift();
		for (const t of game.systems[s].links) if (!(t in d)) { d[t] = d[s] + 1; q.push(t); }
	}
	return d;
}
// A trail made directly by the generator.
function make(game, mod, tier, seed, from = game.here(), found = []) {
	return mod.gen.make(game, tier, seed, from, found);
}
// Start a trail of this tier from a chart in the hold, landed on `planet`.
function startTrail(game, mod, tier, planet = "Albireo Prime") {
	game.outfitCargo.set(T.clues[tier], 1);
	land(game, mod, planet);
	assert.equal(game.panel?.title, "A pirate's chart");
	press(game, mod, "Investigate");
	assert.equal(mod.trail.active, true);
	return mod.trail;
}
// Walk the player to where the current step is answered, and answer it.
function solve(game, mod) {
	const s = mod.trail.current();
	const index = mod.trail.index;
	switch (Number(s.kind)) {
		case KIND.CIPHER:
			if (s.planet) land(game, mod, s.planet);
			else jump(game, mod, s.system);
			break;
		case KIND.RIDDLE:
			jump(game, mod, s.system);
			break;
		case KIND.SCAN:
			jump(game, mod, s.system);
			game.ships[0].x = s.x; game.ships[0].y = s.y;
			fly(game, mod, 1);
			break;
		case KIND.QUESTION:
			land(game, mod, s.planet);
			press(game, mod, "Answer the informant");
			mod.on_number(game, 1, Number(s.answer));
			break;
		case KIND.LOCK: {
			land(game, mod, s.planet);
			press(game, mod, "Work the lock");
			const path = lockPath(s);
			assert.ok(path, "the lock is solvable");
			for (const i of path) press(game, mod, `Turn dial ${i + 1}`);
			break;
		}
		case KIND.COURIER:
			jump(game, mod, s.system);
			assert.ok(game.spawned.some((x) => x.tag === "charts.courier"));
			game.outfitCargo.set(T.fragment, 1);
			fly(game, mod, 1);
			break;
		case KIND.FINALE:
			jump(game, mod, s.system);
			assert.ok(game.spawned.some((x) => x.tag === "charts.cache"));
			game.outfitCargo.set(T.manifest, 1);
			fly(game, mod, 1);
			break;
		default:
			assert.fail(`step of kind ${s.kind}`);
	}
	if (mod.trail.active) assert.equal(mod.trail.index, index + 1, `step ${index} (kind ${s.kind}) solved`);
	if (game.landed) takeOff(game, mod);
}
// The shortest sequence of dial turns from the lock's dials to its target (breadth-first), or null.
function lockPath(s) {
	const n = s.target.length;
	const eff = s.effect.map(Number), target = s.target.map(Number).join("");
	const start = s.dials.map(Number);
	const seen = new Map([[start.join(""), []]]);
	const q = [start];
	while (q.length) {
		const v = q.shift();
		const path = seen.get(v.join(""));
		if (v.join("") === target) return path;
		for (let i = 0; i < n; i++) {
			const w = v.map((d, j) => (d + eff[i * n + j]) % 10);
			const k = w.join("");
			if (!seen.has(k)) { seen.set(k, [...path, i]); q.push(w); }
		}
	}
	return null;
}

// ---- The pieces ----

test("the generator: the same seed gives the same numbers, and weighted picks follow their weights", { skip }, () => {
	const a = new Charts().dice, b = new Charts().dice;
	a.seed(42); b.seed(42);
	const xs = Array.from({ length: 20 }, () => a.below(1000)), ys = Array.from({ length: 20 }, () => b.below(1000));
	assert.deepEqual(xs, ys);
	a.seed(43);
	assert.notDeepEqual(Array.from({ length: 20 }, () => a.below(1000)), xs);
	const counts = [0, 0, 0];
	a.seed(7);
	for (let i = 0; i < 6000; i++) counts[a.weighted([1, 0, 2])]++;
	assert.equal(counts[1], 0);
	assert.ok(counts[2] > counts[0] * 1.6 && counts[2] < counts[0] * 2.4, JSON.stringify(counts));
});

test("ciphers: a shift undoes, an anagram keeps each word's letters and scrambles them", { skip }, () => {
	const c = new Charts().gen.cipher;
	assert.equal(c.shift("New Boston", 3), "QHZ ERVWRQ");
	assert.equal(c.unshift(c.shift("Ka'het's 3rd", 11), 11), "KA'HET'S 3RD");
	const rng = new Charts().dice;
	rng.seed(5);
	for (const name of ["Albireo Prime", "Vindemiatrix", "New Tibet"]) {
		const a = c.anagram(name, rng);
		assert.ok(c.same_letters(a, name), a);
		assert.notEqual(a, name.toUpperCase());
		assert.equal(a.split(" ").length, name.split(" ").length);
	}
});

// ---- Generation ----

test("trails: the same seed, start and map give the same trail; another seed another", { skip }, () => {
	const { game, mod } = setup();
	for (const tier of [0, 1, 2, 3]) {
		const a = make(game, mod, tier, 1234 + tier).encode();
		const b = make(game, mod, tier, 1234 + tier).encode();
		assert.equal(a, b, `tier ${tier}`);
		assert.notEqual(make(game, mod, tier, 999 + tier).encode(), a);
		// And from a fresh mod and game.
		const other = setup();
		assert.equal(make(other.game, other.mod, tier, 1234 + tier).encode(), a);
	}
});

test("trails: 3-8 steps by tier, the finale last, every step reachable and in human space, no kind twice running", { skip }, () => {
	const { game, mod } = setup();
	const lo = [3, 4, 5, 6], hi = [4, 5, 7, 8];
	const kinds = [new Set(), new Set(), new Set(), new Set()];
	const reach = bfs(game, "Albireo");
	for (const tier of [0, 1, 2, 3]) {
		for (let seed = 1; seed <= 60; seed++) {
			const t = make(game, mod, tier, seed * 7919);
			const n = t.steps.length;
			assert.ok(n >= lo[tier] && n <= hi[tier], `tier ${tier}: ${n} steps`);
			assert.equal(Number(t.steps[n - 1].kind), KIND.FINALE);
			for (let k = 0; k < n; k++) {
				const s = t.steps[k];
				assert.ok(s.system in reach, s.system);
				assert.notEqual(s.system, "Hai-home");
				assert.ok(Number(s.kind) >= 1 && Number(s.kind) <= 7);
				if (k < n - 1) kinds[tier].add(Number(s.kind));
				if (k > 0 && k < n - 1) assert.notEqual(Number(s.kind), Number(t.steps[k - 1].kind), `seed ${seed}, step ${k}`);
				if (s.planet) assert.equal(game.planets[s.planet].system, s.system);
			}
			if (tier === 3) assert.ok(Number(t.ambush_at) >= 1 && Number(t.ambush_at) <= n - 2);
			if (tier < 2) assert.equal(Number(t.ambush_at), -1);
		}
	}
	// Easy trails have no locks or couriers; the higher tiers use all six kinds.
	assert.ok(!kinds[0].has(KIND.LOCK) && !kinds[0].has(KIND.COURIER));
	for (const k of [1, 2, 3, 4]) assert.ok(kinds[0].has(k), `easy uses kind ${k}`);
	for (const k of [1, 2, 3, 4, 5, 6]) assert.ok(kinds[3].has(k), `elite uses kind ${k}`);
});

// Every step of a kind, from many trails of every tier.
function stepsOf(kind, tiers = [0, 1, 2, 3]) {
	const { game, mod } = setup();
	const out = [];
	for (const tier of tiers) for (let seed = 1; seed <= 40; seed++) {
		const t = make(game, mod, tier, seed * 104729);
		for (const s of t.steps) if (Number(s.kind) === kind) out.push({ s, tier, game, mod });
	}
	return out;
}

test("cipher steps decode to their answer: a shift (easy), an anagram (medium), both (hard), keyed by a system's hyperlanes (elite)", { skip }, () => {
	const all = stepsOf(KIND.CIPHER);
	assert.ok(all.length > 20);
	for (const { s, tier, game, mod } of all) {
		const c = mod.gen.cipher;
		const name = s.planet ? game.planets[s.planet].display ?? s.planet : s.system;
		const code = s.text.split("in cipher: ")[1];
		let k = Number((/moved (\d+) places/.exec(s.hint) ?? [])[1]);
		const key = (/hyperlanes at (.*)\.$/.exec(s.hint) ?? [])[1];
		if (key) k = game.systems[key].links.length;
		if (tier === 0) assert.equal(c.unshift(code, k), name.toUpperCase());
		else if (tier === 1) assert.ok(c.same_letters(code, name));
		else assert.ok(c.same_letters(c.unshift(code, k), name), `${code} / ${name}`);
		if (tier === 3) assert.ok(key || k, "elite: keyed");
	}
});

test("riddle steps: the facts fit their system and no other within the radius", { skip }, () => {
	const all = stepsOf(KIND.RIDDLE);
	assert.ok(all.length > 20);
	for (const { s, game } of all) {
		const d = bfs(game, s.region);
		const usable = (x) => x !== "Hai-home";
		const landable = (x) => Object.values(game.planets).filter((p) => p.system === x).length;
		const holds = (fact, value, x) => {
			const sys = game.systems[x];
			switch (fact) {
				case 0: return sys.government === value;
				case 1: return String(sys.links.length) === value;
				case 2: return sys.links.includes(value);
				case 3: return (sys.inhabited ? "yes" : "no") === value;
				case 4: return x[0].toUpperCase() === value;
				case 5: return String(landable(x)) === value;
				case 6: return (Object.values(game.planets).some((p) => p.system === x && p.services.includes("shipyard")) ? "yes" : "no") === value;
				case 7: return String(x.replaceAll(" ", "").length) === value;
			}
			return false;
		};
		const facts = s.facts.map((f) => [Number(f.split("=")[0]), f.slice(f.indexOf("=") + 1)]);
		assert.ok(facts.length >= 2);
		const fits = Object.keys(d).filter((x) => d[x] <= Number(s.radius) && usable(x) && facts.every(([f, v]) => holds(f, v, x)));
		assert.deepEqual(fits, [s.system], s.text);
	}
});

test("question steps: the answer is the map's (shortest jumps, or a system's hyperlanes)", { skip }, () => {
	const all = stepsOf(KIND.QUESTION);
	assert.ok(all.length > 10);
	for (const { s, game } of all) {
		let m = /from (.*) to (.*)\?$/.exec(s.text);
		if (m) assert.equal(Number(s.answer), bfs(game, m[1])[m[2]], s.text);
		else {
			m = /out of (.*)\?$/.exec(s.text);
			assert.ok(m, s.text);
			assert.equal(Number(s.answer), game.systems[m[1]].links.length);
		}
	}
});

test("lock steps: always solvable from where they start, never already open; more dials and linked dials by tier", { skip }, () => {
	const all = stepsOf(KIND.LOCK, [1, 2, 3]);
	assert.ok(all.length > 10);
	for (const { s, tier } of all) {
		assert.equal(s.target.length, [3, 3, 4, 5][tier]);
		assert.notEqual(s.dials.join(""), s.target.join(""));
		assert.ok(lockPath(s), `tier ${tier}: ${s.text}`);
		// Linked: turning dial 0 moves another dial too.
		const n = s.target.length;
		assert.ok(s.effect.slice(0, n).filter((e) => Number(e) !== 0).length >= 2);
	}
});

test("scan steps: a spot within the tier's radius of the system's centre", { skip }, () => {
	for (const { s, tier } of stepsOf(KIND.SCAN)) {
		const r = Math.hypot(Number(s.x), Number(s.y));
		assert.ok(r >= 590 && r <= [2000, 2600, 3200, 4000][tier] + 1, String(r));
	}
});

// ---- Rewards ----

test("reward rolls: prototypes only at hard and elite, exotics of the right tiers, the Cloaking Device and androids only high", { skip }, () => {
	const { game, mod } = setup();
	const seen = [new Set(), new Set(), new Set(), new Set()];
	const protos = [0, 0, 0, 0];
	for (const tier of [0, 1, 2, 3]) for (let seed = 1; seed <= 300; seed++) {
		const t = make(game, mod, tier, seed * 31337);
		assert.ok(T.finale_fleets[tier].includes(t.finale_fleet));
		if (t.proto) {
			protos[tier]++;
			assert.ok(T.prototypes.includes(t.proto));
		}
		assert.equal(t.box_items.length, t.box_counts.length);
		for (const item of t.box_items) seen[tier].add(item);
	}
	assert.equal(protos[0] + protos[1], 0);
	assert.ok(protos[2] > 0 && protos[3] > protos[2]);
	const tierOf = (x) => T.exotic_tier[T.exotics.indexOf(x)];
	for (const tier of [0, 1, 2, 3]) {
		for (const x of seen[tier]) if (T.exotics.includes(x)) assert.ok(tierOf(x) <= tier && tierOf(x) >= tier - 1, `${x} at tier ${tier}`);
		// Every exotic of the tier turns up.
		for (const x of T.exotics.filter((e) => tierOf(e) === tier)) assert.ok(seen[tier].has(x), `${x} rolls at tier ${tier}`);
	}
	assert.ok(seen[3].has("Cloaking Device") && seen[3].has("NDR-114 Android") && seen[2].has("NDR-114 Android"));
	assert.ok(!seen[0].has("Cloaking Device") && !seen[1].has("NDR-114 Android") && !seen[2].has("Cloaking Device"));
});

test("reward rolls: an exotic already in the collection log is passed over while the tier has others", { skip }, () => {
	const { game, mod } = setup();
	const easy = T.exotics.filter((e, i) => T.exotic_tier[i] === 0);
	const found = easy.slice(0, -1);
	for (let seed = 1; seed <= 100; seed++) {
		const t = make(game, mod, 0, seed, "Albireo", found);
		for (const x of t.box_items) if (T.exotics.includes(x)) assert.equal(x, easy[easy.length - 1]);
	}
});

// ---- Charts dropping ----

function kill(game, mod, model, { government = "Pirate", byPlayer = true } = {}) {
	game.stepLosses = [{ model, government, byPlayer }];
	game.step_ += 1;
	mod.on_step(game, game.step_);
	game.stepLosses = [];
}

test("charts drop from pirates the player destroys, at about the tier's rate; the biggest pirates rarely give the black chart", { skip }, () => {
	const { game, mod } = setup();
	const drops = (model, n) => {
		game.outfitCargo.clear();
		for (let i = 0; i < n; i++) kill(game, mod, model);
		return T.clues.map((c) => cargo(game, c));
	};
	const easy = drops("Sparrow", 4000);
	assert.ok(easy[0] > 120 && easy[0] < 280, String(easy));
	assert.equal(easy[1] + easy[2] + easy[3], 0);
	assert.ok(drops("Cutthroat", 2000)[1] > 80);
	assert.ok(drops("Firebird", 2000)[2] > 110);
	const big = drops("Marauder Leviathan", 6000);
	assert.ok(big[3] > 80 && big[3] < 300 && big[2] > big[3] * 2, String(big));
	assert.ok(game.messages.some((m) => m.includes("mysterious coordinates")));
});

test("no chart from non-pirates, from ships the player did not kill, or while landed", { skip }, () => {
	const { game, mod } = setup();
	for (let i = 0; i < 2000; i++) kill(game, mod, "Firebird", { government: "Merchant" });
	for (let i = 0; i < 2000; i++) kill(game, mod, "Firebird", { byPlayer: false });
	for (let i = 0; i < 2000; i++) kill(game, mod, "Firebird", { government: "Charts Corsair" });
	assert.equal(T.clues.reduce((n, c) => n + cargo(game, c), 0), 0);
});

test("a pirate the player disables nearby rolls once, and its destruction afterwards does not roll again", { skip }, () => {
	const { game, mod } = setup();
	let rolls = 0;
	const roll = mod.maybe_chart.bind(mod);
	mod.maybe_chart = (g, m) => { rolls++; roll(g, m); };
	const pirate = { name: "Rogue", model: "Firebird", player: false, hull: 500, maxHull: 600, shields: 0, maxShields: 100, energy: 0, maxEnergy: 0, fuel: 0, maxFuel: 0, government: "Pirate", strength: 3e6, x: 900, y: 0 };
	game.ships.push(pirate);
	fly(game, mod, 1);
	assert.equal(rolls, 0);
	pirate.disabled = true;
	fly(game, mod, 2);
	assert.equal(rolls, 1);
	kill(game, mod, "Firebird");
	assert.equal(rolls, 1);
	kill(game, mod, "Firebird");
	assert.equal(rolls, 2);
	// One disabled far away (another fight) is not the player's.
	const far = { ...pirate, name: "Far", disabled: false, x: 9000 };
	game.ships.push(far);
	fly(game, mod, 1);
	far.disabled = true;
	fly(game, mod, 1);
	assert.equal(rolls, 2);
});

// ---- Following a trail ----

test("landing with a chart offers it; Investigate starts the trail and uses up the chart; Not now keeps it", { skip }, () => {
	const { game, mod } = setup();
	game.outfitCargo.set(T.clues[1], 2);
	land(game, mod, "Albireo Prime");
	assert.equal(game.panel.title, "A pirate's chart");
	press(game, mod, "Not now");
	assert.equal(mod.trail.active, false);
	assert.equal(cargo(game, T.clues[1]), 2);
	assert.equal(game.planetButtonLabel, "Corsair Charts");
	mod.on_planet_button(game);
	press(game, mod, `Follow the ${T.clues[1]}`);
	assert.equal(mod.trail.active, true);
	assert.equal(Number(mod.trail.tier), 1);
	assert.equal(cargo(game, T.clues[1]), 1);
	// One trail at a time: landing again with a chart left offers nothing.
	takeOff(game, mod);
	land(game, mod, "Albireo Prime");
	assert.ok(!game.panel || game.panel.title !== "A pirate's chart");
	assert.ok(game.map.some((m) => m.detail || m.marker || m.ring || m.label), JSON.stringify(game.map));
});

test("a whole trail of every tier, step by step to the strongbox: the rewards land in the hold and the log", { skip }, () => {
	for (const tier of [0, 1, 2, 3]) {
		const { game, mod } = setup({ day: 1100430 + tier * 17 });
		const t = startTrail(game, mod, tier);
		const box = t.box_items.map((x, i) => [x, Number(t.box_counts[i])]);
		takeOff(game, mod);
		let guard = 0;
		while (mod.trail.active && guard++ < 12) solve(game, mod);
		assert.equal(mod.trail.active, false, `tier ${tier} finished`);
		assert.equal(Number(mod.finished[tier]), 1);
		for (const [x, n] of box) assert.ok(cargo(game, x) >= n, `${x} x${n} given`);
		for (const [x] of box) if (T.exotics.includes(x)) assert.ok(mod.found.includes(x));
		assert.ok(game.messages.some((m) => m.includes("strongbox")));
		assert.equal(cargo(game, T.manifest), 0);
	}
});

test("the scanner: colder and warmer as the flagship moves, and the cache at the spot", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 0);
	takeOff(game, mod);
	// Make the current step a scan in Beid.
	const s = mod.gen.scan_at(game, mod.dice, 0, "Beid");
	mod.trail.steps[mod.trail.index] = s;
	jump(game, mod, "Beid");
	game.messages = [];
	game.ships[0].x = Number(s.x) + 4000; game.ships[0].y = Number(s.y);
	fly(game, mod, 1);
	game.ships[0].x = Number(s.x) + 600;
	fly(game, mod, 1);
	assert.ok(game.messages.some((m) => m.includes("Warmer")), JSON.stringify(game.messages));
	game.ships[0].x = Number(s.x) + 3000;
	fly(game, mod, 1);
	assert.ok(game.messages.some((m) => m.includes("Colder")));
	const before = cargo(game, T.bond), index = mod.trail.index;
	game.ships[0].x = Number(s.x) + 100;
	fly(game, mod, 1);
	assert.equal(mod.trail.index, index + 1);
	assert.equal(cargo(game, T.bond), before + Number(T.scan_bonds[0]));
});

test("the informant: three wrong answers bring a new question, the right one moves on", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 1);
	const s = mod.gen.question(game, mod.dice, 1, "Albireo");
	assert.equal(Number(s.kind), KIND.QUESTION);
	mod.trail.steps[mod.trail.index] = s;
	land(game, mod, s.planet);
	assert.ok(game.panel.buttons.includes("Answer the informant"));
	const wrong = Number(s.answer) + 1;
	const first = s.text;
	mod.on_number(game, 1, wrong);
	mod.on_number(game, 1, wrong);
	assert.equal(Number(mod.trail.current().tries), 2);
	mod.on_number(game, 1, wrong);
	assert.equal(Number(mod.trail.current().tries), 0);
	assert.ok(game.panel.text.includes("try this one"));
	const index = mod.trail.index;
	mod.on_number(game, 1, Number(mod.trail.current().answer));
	assert.equal(mod.trail.index, index + 1);
	assert.ok(first);
});

test("the lock: dials turn on the panel, Start over restores them, the combination opens it", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 2);
	const s = mod.gen.lock(game, mod.dice, 2, "Albireo");
	mod.trail.steps[mod.trail.index] = s;
	land(game, mod, s.planet);
	press(game, mod, "Work the lock");
	assert.equal(game.panel.buttons.filter((b) => b.startsWith("Turn dial")).length, 4);
	const start = s.dials.join("");
	press(game, mod, "Turn dial 1");
	assert.notEqual(mod.trail.current().dials.join(""), start);
	press(game, mod, "Start over");
	assert.equal(mod.trail.current().dials.join(""), start);
	const index = mod.trail.index;
	for (const i of lockPath(mod.trail.current())) press(game, mod, `Turn dial ${i + 1}`);
	assert.equal(mod.trail.index, index + 1);
	assert.ok(game.panel.text.includes("swings open"));
});

test("the courier: placed on arrival (not in other systems), again after it is lost, and the fragment moves the trail on", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 2);
	takeOff(game, mod);
	const s = mod.gen.courier(game, mod.dice, 2, "Albireo");
	mod.trail.steps[mod.trail.index] = s;
	const elsewhere = NAMES.find((x) => x !== s.system && x !== "Albireo");
	jump(game, mod, elsewhere);
	assert.ok(!game.spawned.some((x) => x.tag === "charts.courier"));
	jump(game, mod, s.system);
	assert.deepEqual(game.spawned.filter((x) => x.tag === "charts.courier").map((x) => [x.fleet, x.arrive]), [[T.courier_fleets[2], false]]);
	jump(game, mod, elsewhere);
	jump(game, mod, s.system);
	assert.equal(game.spawned.filter((x) => x.tag === "charts.courier").length, 1);
	const index = mod.trail.index;
	game.outfitCargo.set(T.fragment, 1);
	fly(game, mod, 1);
	assert.equal(mod.trail.index, index + 1);
	assert.equal(cargo(game, T.fragment), 0);
});

test("the finale: the cache and (hard, elite) its guards are placed; after four placements without the manifest the trail is lost", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 3);
	takeOff(game, mod);
	mod.trail.index = mod.trail.steps.length - 1;
	const sys = mod.trail.current().system;
	const elsewhere = NAMES.find((x) => x !== sys);
	for (let k = 0; k < 4; k++) {
		jump(game, mod, sys);
		assert.deepEqual(game.spawned.map((x) => x.tag).sort(), ["charts.cache", "charts.guard"]);
		assert.equal(game.spawned.find((x) => x.tag === "charts.cache").fleet, mod.trail.finale_fleet);
		assert.equal(game.spawned.find((x) => x.tag === "charts.cache").arrive, false);
		jump(game, mod, elsewhere);
	}
	jump(game, mod, sys);
	assert.equal(mod.trail.active, false);
	assert.equal(Number(mod.abandoned), 1);
	assert.ok(game.messages.some((m) => m.includes("scattered debris")));
});

test("the rival: an elite trail's ambush jumps in once, at its step's system", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 3);
	takeOff(game, mod);
	const at = Number(mod.trail.ambush_at);
	mod.trail.index = at;
	const sys = mod.trail.current().system;
	const kind = Number(mod.trail.current().kind);
	jump(game, mod, sys);
	assert.deepEqual(game.spawned.filter((x) => x.tag === "charts.rival").map((x) => [x.fleet, x.arrive]), [[T.rival_fleets[3], true]]);
	if (mod.trail.index === at) {
		jump(game, mod, NAMES.find((x) => x !== sys));
		jump(game, mod, sys);
		assert.equal(game.spawned.filter((x) => x.tag === "charts.rival").length, 0);
	}
	assert.ok(kind);
});

// ---- Never soft-locked ----

test("abandoning a trail ends it and clears its fragments; a new chart can then be followed", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 0);
	game.outfitCargo.set(T.fragment, 1);
	press(game, mod, "Abandon the trail");
	assert.equal(game.confirms.at(-1).token, 1);
	mod.on_confirm(game, 1);
	assert.equal(mod.trail.active, false);
	assert.equal(Number(mod.abandoned), 1);
	assert.equal(cargo(game, T.fragment), 0);
	assert.deepEqual(game.map, []);
	startTrail(game, mod, 1);
});

test("a step that cannot be reached any more is generated again from where the player is", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 1);
	takeOff(game, mod);
	const s = mod.trail.current();
	// Cut every lane into its system.
	const target = s.system;
	for (const n of game.systems[target].links) game.systems[n].links = game.systems[n].links.filter((x) => x !== target);
	game.systems[target].links = [];
	mod.gen.galaxy.forget();
	jump(game, mod, "Beid");
	assert.notEqual(mod.trail.current().system, target);
	assert.ok(mod.trail.current().system in bfs(game, "Beid"));
	assert.ok(game.messages.some((m) => m.includes("gone cold")));
});

test("Seek another lead replaces the current step (the finale stays the finale)", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 2);
	const before = mod.trail.current().encode();
	press(game, mod, "Seek another lead");
	mod.on_confirm(game, 2);
	assert.notEqual(mod.trail.current().encode(), before);
	mod.trail.index = mod.trail.steps.length - 1;
	mod.on_confirm(game, 2);
	assert.equal(Number(mod.trail.current().kind), KIND.FINALE);
});

// ---- Saving ----

test("the state survives a save and a reload, and an older save of the same pilot is read again", { skip }, () => {
	const { game, mod } = setup();
	startTrail(game, mod, 2);
	solve(game, mod);
	mod.on_save(game);
	const saved = game.data("state");
	const again = new Charts();
	again.on_load(game);
	again.on_pilot_loaded(game);
	assert.equal(again.trail.encode(), mod.trail.encode());
	assert.equal(again.encode(), mod.encode());
	// Moving on, then loading the earlier save: the mod reads it.
	solve(game, mod);
	game.set_data("state", saved);
	mod.ensure(game);
	assert.equal(mod.encode(), again.encode());
	// A damaged state reads as nothing at all.
	game.set_data("state", "{not json");
	mod.on_enter(game, game.here());
	assert.equal(mod.trail.active, false);
});

test("the collection log counts exotics and prototype hulls the player has, and its panel hides the rest", { skip }, () => {
	const { game, mod } = setup();
	game.fleet[0].outfits[T.exotics[0]] = 1;
	game.fleet.push({ uuid: "p", name: "Prize", model: T.prototypes[0], outfits: {}, integrated: {}, massSaved: 0, spaceSaved: {} });
	game.outfitCargo.set(T.clues[0], 1);
	land(game, mod, "Albireo Prime");
	assert.ok(mod.found.includes(T.exotics[0]) && mod.found.includes(T.prototypes[0]));
	mod.on_planet_button(game);
	press(game, mod, "Collection log");
	assert.equal(game.panel.rows.length, T.exotics.length + T.prototypes.length);
	assert.equal(game.panel.rows[0][0], T.exotics[0]);
	assert.equal(game.panel.rows[1][0], "???");
});

// ---- The API ----

test("mod API 11 only: the build calls nothing of API 12, and the mod sleeps on a game without outfit transfer", { skip }, () => {
	const js = readFileSync(BUILT, "utf8");
	for (const call of ["ship_outfit_kinds", "ship_outfit_at", "outfit_weapon_attribute", "fleet_ship_planet", "fleet_ship_system"]) {
		assert.ok(!js.includes(`.${call}(`), `uses ${call}`);
	}
	assert.equal(new Charts().min_api(), 11);
	const { game, mod } = setup({ features: API11.filter((f) => f !== "call:outfit_give") });
	for (let i = 0; i < 3000; i++) kill(game, mod, "Firebird");
	assert.equal(T.clues.reduce((n, c) => n + cargo(game, c), 0), 0);
	game.outfitCargo.set(T.clues[0], 1);
	land(game, mod, "Albireo Prime");
	assert.equal(game.panel, null);
});

// ---- The data ----

function dataNodes() {
	const dir = join(MOD, "data");
	const roots = [];
	for (const f of readdirSync(dir)) {
		let cur = null, sub = null;
		for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
			if (!line.trim() || line.trim().startsWith("#")) continue;
			const depth = line.match(/^\t*/)[0].length;
			const toks = [...line.trim().matchAll(/"([^"]*)"|`([^`]*)`|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
			if (depth === 0) roots.push(cur = { toks, kids: [] });
			else if (depth === 1) cur.kids.push(sub = { toks, kids: [] });
			else sub.kids.push({ toks });
		}
	}
	return roots;
}

test("the data: every name the code uses is defined; prototypes are capturable and sold nowhere; other mod ships are uncapturable", { skip }, () => {
	const nodes = dataNodes();
	const of = (kind) => new Map(nodes.filter((n) => n.toks[0] === kind).map((n) => [n.toks[n.toks.length - 1], n]));
	const fleets = of("fleet"), outfits = of("outfit"), ships = of("ship");
	for (const row of T.finale_fleets) for (const f of row) assert.ok(fleets.has(f), f);
	for (const f of [...T.courier_fleets, ...T.guard_fleets, ...T.rival_fleets]) if (f) assert.ok(fleets.has(f), f);
	for (const x of [...T.clues, T.fragment, T.manifest, T.bond, ...T.exotics]) assert.ok(outfits.has(x), x);
	assert.equal(T.exotics.length, 14);
	assert.deepEqual([0, 1, 2, 3].map((t) => T.exotic_tier.filter((x) => Number(x) === t).length), [3, 4, 4, 3]);
	assert.ok(!nodes.some((n) => n.toks[0] === "shipyard" || n.toks[0] === "outfitter"), "nothing is sold");
	for (const p of T.prototypes) {
		const ship = ships.get(p);
		assert.ok(ship && ship.toks.length === 2, `${p} is a whole ship definition`);
		assert.ok(!ship.kids.some((k) => k.toks[0] === "uncapturable"));
		const cache = ships.get(`${p} (Charts Cache)`);
		assert.ok(cache && !cache.kids.some((k) => k.toks[0] === "uncapturable"), `${p}'s cache is capturable`);
	}
	for (const [name, ship] of ships) {
		if (T.prototypes.includes(name) || name.endsWith("(Charts Cache)") && T.prototypes.some((p) => name.startsWith(p))) continue;
		assert.ok(ship.kids.some((k) => k.toks[0] === "uncapturable"), `${name} is uncapturable`);
	}
	// Exactly one manifest aboard every cache; one fragment aboard every courier.
	for (const [name, ship] of ships) {
		const cargoNode = ship.kids.find((k) => k.toks[0] === "cargo");
		if (name.includes("(Charts Cache")) assert.ok(cargoNode && JSON.stringify(cargoNode).includes(T.manifest), name);
		if (name.includes("(Charts Courier)")) assert.ok(cargoNode && JSON.stringify(cargoNode).includes(T.fragment), name);
	}
});
