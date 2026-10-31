// Tests for The Shoal's run, against the SDK's FakeGame. The mod is tested
// through its build: this builds it, then imports the JavaScript the game
// would load. Run with `npm test` (skipped without the Dado toolchain).
//
// Since 0.5.0 (DESIGN.md section 22) a run is in the Deep: it starts on
// entering it through the Maw (arriving in the hub), continues through every
// deep system and landings at Breakers' Haven, and ends on coming back up to
// Breakers' Rest. Most tests fly in a Shallows system (tier 1), whose heat
// rate and wave fleets are the ones the design gave the old belt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FakeGame } from "es/fake-game";

const SDK = join(dirname(fileURLToPath(import.meta.url)), "../../..");
let Shoal;
try {
	execFileSync(process.env.DADOC || "dadoc", ["--version"], { stdio: "ignore" });
	execFileSync(process.execPath, [join(SDK, "tools/esmod.mjs"), "build", "mods/shoal"], { cwd: SDK, stdio: "ignore" });
	({ Shoal } = await import(join(SDK, "dist/The Shoal/scripts/shoal.js")));
} catch {
	// No Dado toolchain here: these tests are skipped.
}
const skip = !Shoal && "no Dado toolchain";

// Breakers' Rest (the entry system; true name from before 0.5.0) and its station.
const SHOAL = "~The Shoal";
const REST = SHOAL;
const SHOAL_NAME = "Breakers' Rest";
const OUTPOST = "Breaker's Rest";
const BHAVEN = "Breakers' Haven";
const GLASS = "outfit (cargo): Shoal Glass";
const CORES = "outfit (cargo): Warden Core";
const LATTICE = "outfit (cargo): Deep Lattice";
const STORED_GLASS = "outfit (storage): Shoal Glass";
const SEED = "shoal.wreck.seed.";
const KINDS = ["Shoal Warden Pickets", "Shoal Warden Hunters", "Shoal Warden Phalanx", "Shoal Undertow"];
const FLEETS = {
	"Shoal Wrecks": 1e6, "Shoal Glass Wrecks": 1e6, "Shoal Rich Wrecks": 2e6, "Shoal Deep Wreck": 3e6, "Shoal Abyss Wreck": 4e6,
	"Shoal Restless Wrecks": 1e6, "Shoal Rest Wrecks": 1e6, "Shoal Rest Restless": 1e6,
	"Shoal Warden Pickets": 4e6, "Shoal Warden Hunters": 8e6, "Shoal Warden Phalanx": 25e6, "Shoal Undertow": 60e6,
};
for (const kind of KINDS) for (const t of [2, 3, 4]) FLEETS[`${kind} ${t}`] = FLEETS[kind] * t;
const SLACK = 0, SPRING = 1, RIPTIDE = 2, CALM = 3;

// The Deep, as the mod's generated table (src/Deep.dados) has it.
const DEEP = Shoal ? new Shoal().deep : null;
const HUB = DEEP?.hub;
const ofTier = (t, k = 0) => {
	const all = [...DEEP.systems].filter((s) => DEEP.tier(s) === t).sort();
	return all[k];
};
const SHALLOW = Shoal ? ofTier(1) : "", SHALLOW2 = Shoal ? ofTier(1, 1) : "";
const DRIFT = Shoal ? ofTier(2) : "", FATHOMS = Shoal ? ofTier(3) : "", ABYSS = Shoal ? ofTier(4) : "";

// The first day from `from` whose week has this current.
function dayOf(current, from = 1100430) {
	const probe = new Shoal();
	for (let d = from; d < from + 7 * 400; d += 7) if (probe.currents.of(d) === current) return d;
	throw new Error(`no week with current ${current}`);
}

// A pilot in flight in Arneb, next to Breakers' Rest, on a day with this current.
function setup({ current = SPRING, conditions = {}, features, data, fleets = FLEETS, governments, system = "Arneb" } = {}) {
	const game = new FakeGame({
		system,
		day: dayOf(current),
		fleets,
		systems: {
			"Arneb": { government: "Pirate", links: [SHOAL], inhabited: false, defense: [] },
			[SHOAL]: { government: "Uninhabited", links: ["Arneb"], inhabited: true, defense: [] },
		},
		planets: { [OUTPOST]: { system: SHOAL, government: "Breakers", services: ["bank", "trading", "job board", "outfitter"] } },
		conditions: { "shoal: charted": 1, ...conditions },
		...(features ? { features } : {}),
		...(data ? { data } : {}),
		...(governments ? { governments } : {}),
	});
	const mod = new Shoal();
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
	mod.on_enter(game, system);
}
// Down through the Maw (a run starts in the hub), and on to a system of the Deep.
function dive(game, mod, system = SHALLOW) {
	jump(game, mod, REST);
	jump(game, mod, HUB);
	if (system !== HUB) jump(game, mod, system);
}
// Back up to Breakers' Rest.
function surface(game, mod) {
	jump(game, mod, HUB);
	jump(game, mod, REST);
}
// Landing takes away every ship in the system but the player's.
function land(game, mod, planet = BHAVEN) {
	game.landed = true;
	game.ships = game.ships.filter((s) => s.player);
	game.planet_ = planet;
	mod.on_enter(game, game.here());
}
function takeOff(game, mod) {
	game.landed = false;
	game.planet_ = "";
	mod.on_enter(game, game.here());
}
// Fly for some seconds of game time (60 steps each; the mod works once a second).
function fly(game, mod, seconds) {
	for (let s = 0; s < seconds; s++) {
		for (let k = 0; k < 60; k++) {
			game.step_ += 1;
			mod.on_step(game, game.step_);
		}
	}
}
// Fly until heat reaches `heat` (at most `limit` seconds); answers the seconds flown.
function flyTo(game, mod, heat, limit = 5000) {
	let s = 0;
	while (mod.run.heat + 1e-6 < heat && s < limit) {
		fly(game, mod, 1);
		s++;
	}
	return s;
}
// Guardian spawns (waves, endless waves, the Undertow), and what else fired
// with the waves, by tag: a system's own wrecks, residents and restless wrecks,
// and Breakers' Rest's, left out.
const isGuard = (s) => /^shoal\.(wave|endless|undertow)/.test(s.tag);
const isSeed = (s) => /^shoal\.(wreck\.seed|wreck\.rest|restless|resident|visit)\./.test(s.tag);
function spawnsBy(game) {
	const by = {};
	for (const s of game.spawned) if (!isSeed(s)) (by[s.tag] ??= []).push(s.fleet);
	return by;
}
function guards(game) {
	return game.spawned.filter(isGuard);
}
// Days pass (between runs).
function passDays(game, days) {
	game.day_ += days;
}
// Weeks pass, to a later week with this current (the Shoal has forgotten the last run).
function laterWeek(game, current = SPRING) {
	game.day_ = dayOf(current, game.day_ + 14);
}
// The fake game's spawn adds no ships; with this, guardian fleets that jump in
// put ships of their models in the system (as the game does from the next step).
const MODELS = {
	"Shoal Warden Pickets": ["Warden Picket", "Warden Picket"],
	"Shoal Warden Hunters": ["Warden Lancer"],
	"Shoal Warden Phalanx": ["Warden Bastion"],
	"Shoal Undertow": ["The Undertow", "Warden Picket"],
};
function live(game) {
	const spawn = game.spawn.bind(game);
	game.spawn = (fleet, government, tag, arrive) => {
		const n = spawn(fleet, government, tag, arrive);
		if (n && arrive) {
			const kind = fleet.replace(/ [234]$/, "");
			for (const model of MODELS[kind] ?? []) {
				game.ships.push({ name: model, model, player: false, hull: 1000, maxHull: 1000, shields: 0, maxShields: 0, energy: 0, fuel: 0, government: "Shoal Warden", strength: 1e6, tag });
			}
		}
		return n;
	};
	return game;
}
// Disable every ship with this tag (or only those of a model).
function sink(game, tag, model) {
	for (const s of game.ships) if (s.tag === tag && (!model || s.model === model)) s.hull = 0;
}

test("the Deep's table: a hub, forty systems in four depth tiers, and a fleet of every kind for each tier", { skip }, () => {
	assert.equal(DEEP.systems.length, 40);
	assert.equal(DEEP.depth(HUB), 0);
	assert.equal(DEEP.tier(HUB), 0);
	assert.equal(DEEP.is_deep(REST), false);
	assert.equal(DEEP.is_deep("Arneb"), false);
	for (const s of DEEP.systems) assert.ok(s > SHOAL, `${s} sorts after ${SHOAL} (Diplomacy's indices)`);
	const tiers = [0, 0, 0, 0, 0];
	for (const s of DEEP.systems) tiers[DEEP.tier(s)]++;
	assert.deepEqual(tiers, [1, 10, 12, 11, 6]);
	assert.equal(DEEP.fleet("Shoal Warden Pickets", 0), "Shoal Warden Pickets");
	assert.equal(DEEP.fleet("Shoal Warden Pickets", 1), "Shoal Warden Pickets");
	assert.equal(DEEP.fleet("Shoal Undertow", 4), "Shoal Undertow 4");
	for (const t of [1, 2, 3, 4]) for (const f of DEEP.seed_wrecks[t]) assert.ok(f in FLEETS, f);
});

test("the Maw starts a run, Breakers' Haven keeps it, and coming back up to Breakers' Rest ends it", { skip }, () => {
	const { game, mod } = setup();
	assert.equal(game.condition("shoal: in run"), 0);
	jump(game, mod, REST);
	assert.equal(game.condition("shoal: in run"), 0, "Breakers' Rest itself is outside the run");
	fly(game, mod, 30);
	assert.equal(mod.run.heat, 0, "and nothing heats up there");
	jump(game, mod, HUB);
	assert.equal(game.condition("shoal: in run"), 1, "through the Maw: a run");
	assert.equal(game.condition("shoal: depth"), 0);
	assert.equal(game.condition("shoal: current"), SPRING + 1);
	assert.match(game.messages.at(-1), /spring tide/i, "the current is announced");
	fly(game, mod, 30);
	assert.ok(Math.abs(mod.run.heat - 30 / 6 * 0.5) < 1e-6, "the hub heats at half the rate");
	land(game, mod, BHAVEN);
	assert.equal(game.condition("shoal: in run"), 1, "landing at Breakers' Haven continues it");
	fly(game, mod, 30);
	assert.equal(mod.run.seconds, 30, "nothing ticks while landed");
	takeOff(game, mod);
	assert.equal(game.condition("shoal: in run"), 1, "so does taking off");
	jump(game, mod, SHALLOW);
	assert.equal(game.condition("shoal: depth"), DEEP.depth(SHALLOW));
	assert.equal(game.condition("shoal: deepest depth"), DEEP.depth(SHALLOW));
	jump(game, mod, DRIFT);
	assert.equal(game.condition("shoal: in run"), 1, "the run lasts through every deep system");
	assert.equal(game.condition("shoal: deepest depth"), DEEP.depth(DRIFT));
	surface(game, mod);
	assert.equal(game.condition("shoal: in run"), 0);
	assert.equal(game.condition("shoal: runs"), 1);
	assert.equal(game.condition("shoal: heat"), 0);
	assert.equal(game.condition("shoal: depth"), 0);
	assert.equal(game.condition("shoal: deepest depth"), DEEP.depth(DRIFT), "a record");
	assert.equal(game.messages.at(-1), "You come back up out of the Shoal empty-handed. The Shoal below you is calm.");
	assert.equal(mod.run.active, false);
	// A second run counts again.
	dive(game, mod);
	surface(game, mod);
	assert.equal(game.condition("shoal: runs"), 2);
});

test("heat grows by a sixth a second, and faster with cargo, up to a cap", { skip }, () => {
	const empty = setup();
	dive(empty.game, empty.mod);
	fly(empty.game, empty.mod, 60);
	assert.ok(Math.abs(empty.mod.run.heat - 10) < 1e-6, `60 s empty is 10 heat, not ${empty.mod.run.heat}`);
	assert.equal(empty.game.condition("shoal: heat"), 10);

	const laden = setup();
	dive(laden.game, laden.mod);
	laden.game.set_condition(GLASS, 100);
	fly(laden.game, laden.mod, 60);
	// greed 100 -> +0.15 a second.
	assert.ok(Math.abs(laden.mod.run.heat - 60 * (1 / 6 + 0.15)) < 1e-6);

	const cores = setup();
	dive(cores.game, cores.mod);
	cores.game.set_condition(CORES, 10);
	cores.game.set_condition(LATTICE, 1);
	fly(cores.game, cores.mod, 60);
	// greed 80 + 40 = 120 -> +0.18 a second.
	assert.ok(Math.abs(cores.mod.run.heat - 60 * (1 / 6 + 0.18)) < 1e-6);

	const greedy = setup();
	dive(greedy.game, greedy.mod);
	greedy.game.set_condition(LATTICE, 100);
	fly(greedy.game, greedy.mod, 60);
	assert.ok(Math.abs(greedy.mod.run.heat - 60 * (1 / 6 + 0.5)) < 1e-6, "greed is capped at +0.5");

	// Only the hold counts: nothing in the Deep has storage, and storage at
	// Breakers' Rest is not carried.
	const stored = setup({ conditions: { [STORED_GLASS]: 200 } });
	dive(stored.game, stored.mod);
	fly(stored.game, stored.mod, 60);
	assert.ok(Math.abs(stored.mod.run.heat - 10) < 1e-6);
	assert.deepEqual([...stored.mod.run.entry], [0, 0, 0]);
});

test("depth: the deeper the system, the faster heat builds", { skip }, () => {
	const rates = [];
	for (const system of [HUB, SHALLOW, DRIFT, FATHOMS, ABYSS]) {
		const { game, mod } = setup();
		dive(game, mod, system);
		fly(game, mod, 60);
		rates.push(Math.round(mod.run.heat * 1000) / 1000);
	}
	assert.deepEqual(rates, [5, 10, 11.5, 13, 15]);
});

test("guardians the player disables or destroys add heat; wrecks do not", { skip }, () => {
	const { game, mod } = setup();
	dive(game, mod);
	game.kills.set("shoal.wave", 3);
	game.kills.set("shoal.wreck.", 5);
	fly(game, mod, 1);
	assert.ok(Math.abs(mod.run.heat - (1 / 6 + 6)) < 1e-6);
	fly(game, mod, 1);
	assert.ok(Math.abs(mod.run.heat - (2 / 6 + 6)) < 1e-6, "kills are counted once");
	game.kills.set("shoal.endless", 1);
	fly(game, mod, 1);
	assert.ok(Math.abs(mod.run.heat - (3 / 6 + 8)) < 1e-6);
	game.kills.set("shoal.resident", 1);
	fly(game, mod, 1);
	assert.ok(Math.abs(mod.run.heat - (4 / 6 + 10)) < 1e-6, "the wardens that keep a system count too");
});

test("each wave fires once, at its threshold, with the fleets the design gives", { skip }, () => {
	const { game, mod } = setup({ current: SPRING });
	dive(game, mod);
	// The first warning at 10 spawns nothing.
	assert.equal(flyTo(game, mod, 10), 60);
	assert.equal(guards(game).length, 0);
	const warnings = game.messages.length;
	assert.ok(warnings >= 2, "a first warning");
	// Pickets at 12 (72 s at a sixth a second).
	fly(game, mod, 11);
	assert.equal(guards(game).length, 0, "not before 12");
	fly(game, mod, 1);
	assert.deepEqual(guards(game), [{ fleet: "Shoal Warden Pickets", government: "", tag: "shoal.wave.12", arrive: true }]);
	flyTo(game, mod, 99.5);
	const by = spawnsBy(game);
	assert.deepEqual(by, {
		"shoal.wave.12": ["Shoal Warden Pickets"],
		"shoal.wave.25": ["Shoal Warden Hunters"],
		"shoal.wreck.25": ["Shoal Rich Wrecks"], // Spring Tide
		"shoal.wave.38": ["Shoal Warden Pickets", "Shoal Warden Pickets"],
		"shoal.wave.50": ["Shoal Warden Phalanx"],
		"shoal.wreck.50": ["Shoal Rich Wrecks"],
		"shoal.wave.62": ["Shoal Warden Hunters", "Shoal Warden Pickets"],
		"shoal.wave.72": ["Shoal Warden Phalanx"],
		"shoal.wreck.72": ["Shoal Deep Wreck"],
		"shoal.wave.84": ["Shoal Warden Hunters", "Shoal Warden Hunters"],
		"shoal.wave.92": ["Shoal Warden Phalanx", "Shoal Warden Hunters"],
	});
	for (const s of game.spawned) {
		assert.ok(s.tag.startsWith("shoal."));
		assert.equal(s.government, "");
		assert.equal(s.arrive, isGuard(s), "guardians jump in; wrecks are placed");
	}
	assert.equal(mod.run.deep, true);
	// Going on to another system and back fires no wave twice.
	const before = guards(game).length;
	jump(game, mod, SHALLOW2);
	jump(game, mod, SHALLOW);
	fly(game, mod, 2);
	assert.equal(guards(game).length, before, "(none afloat here: the fake game spawns no ships)");
	assert.deepEqual(Object.keys(spawnsBy(game)), Object.keys(by), "no wave fires twice");
	// Messages never show numbers.
	for (const m of game.messages) assert.doesNotMatch(m, /\d/, m);
});

test("depth: deeper systems send their tier's wardens; the hub sends only pickets, and never the Undertow", { skip }, () => {
	const drift = setup({ current: SPRING });
	dive(drift.game, drift.mod, DRIFT);
	flyTo(drift.game, drift.mod, 51);
	fly(drift.game, drift.mod, 1);
	const by = spawnsBy(drift.game);
	assert.deepEqual(by["shoal.wave.12"], ["Shoal Warden Pickets 2"]);
	assert.deepEqual(by["shoal.wave.25"], ["Shoal Warden Hunters 2"]);
	assert.deepEqual(by["shoal.wave.38"], ["Shoal Warden Pickets 2", "Shoal Warden Pickets 2"]);
	assert.deepEqual(by["shoal.wave.50"], ["Shoal Warden Phalanx 2"]);

	const abyss = setup({ current: RIPTIDE });
	dive(abyss.game, abyss.mod, ABYSS);
	flyTo(abyss.game, abyss.mod, 26);
	fly(abyss.game, abyss.mod, 1);
	assert.deepEqual(spawnsBy(abyss.game)["shoal.wave.25"], ["Shoal Warden Hunters 4", "Shoal Warden Pickets 4"], "Riptide's extra pickets are the tier's too");

	const hub = setup({ current: SPRING });
	dive(hub.game, hub.mod, HUB);
	flyTo(hub.game, hub.mod, 102);
	fly(hub.game, hub.mod, 60);
	const waves = Object.entries(spawnsBy(hub.game)).filter(([t]) => t.startsWith("shoal.wave."));
	assert.equal(waves.length, 8);
	for (const [tag, fleets] of waves) assert.deepEqual(fleets, ["Shoal Warden Pickets"], tag);
	assert.equal(hub.game.spawned.filter((s) => s.tag === "shoal.undertow" || s.tag.startsWith("shoal.endless")).length, 0, "no Undertow or endless waves in the hub");
	// Out of the hub, the Undertow wakes at once, as deep as the player is.
	jump(hub.game, hub.mod, FATHOMS);
	fly(hub.game, hub.mod, 1);
	assert.deepEqual(hub.game.spawned.filter((s) => s.tag === "shoal.undertow").map((s) => s.fleet), ["Shoal Undertow 3"]);
});

test("the Undertow wakes once at 100, its sinking is counted, and endless waves follow", { skip }, () => {
	const { game, mod } = setup({ current: SPRING });
	dive(game, mod);
	flyTo(game, mod, 100);
	fly(game, mod, 1);
	const boss = game.spawned.filter((s) => s.fleet === "Shoal Undertow");
	assert.deepEqual(boss, [{ fleet: "Shoal Undertow", government: "", tag: "shoal.undertow", arrive: true }]);
	assert.match(game.messages.join("\n"), /The Undertow wakes/);
	// It jumps in, with an escort, and is seen afloat.
	game.ships.push({ name: "Undertow", model: "The Undertow", player: false, hull: 9000, maxHull: 9000, shields: 0, maxShields: 0, energy: 0, fuel: 0, government: "Shoal Warden", strength: 120e6, tag: "shoal.undertow" });
	game.ships.push({ name: "Picket", model: "Warden Picket", player: false, hull: 900, maxHull: 900, shields: 0, maxShields: 0, energy: 0, fuel: 0, government: "Shoal Warden", strength: 3e6, tag: "shoal.undertow" });
	fly(game, mod, 2);
	assert.equal(game.condition("shoal: undertows"), 0);
	// The player sinks it (its escort still flies).
	game.ships.find((s) => s.model === "The Undertow").hull = 0;
	game.kills.set("shoal.undertow", 1);
	fly(game, mod, 1);
	assert.equal(game.condition("shoal: undertows"), 1);
	assert.match(game.messages.at(-1), /sinks/);
	fly(game, mod, 120);
	assert.equal(game.condition("shoal: undertows"), 1, "counted once");
	assert.equal(game.spawned.filter((s) => s.fleet === "Shoal Undertow").length, 1, "it wakes once per run");
	// Past 100, a wave every 40 s, Phalanx and Hunters by turns.
	const by = spawnsBy(game);
	assert.deepEqual(by["shoal.endless.1"], ["Shoal Warden Phalanx"]);
	assert.deepEqual(by["shoal.endless.2"], ["Shoal Warden Hunters"]);
	assert.deepEqual(by["shoal.endless.3"], ["Shoal Warden Phalanx"]);
	// A new run wakes it again, and its records last.
	surface(game, mod);
	assert.equal(game.condition("shoal: deepest heat") >= 100, true);
	dive(game, mod);
	flyTo(game, mod, 100);
	fly(game, mod, 1);
	assert.equal(game.spawned.filter((s) => s.fleet === "Shoal Undertow").length, 2);
});

test("an Undertow left behind at Breakers' Haven is not counted as sunk", { skip }, () => {
	const { game, mod } = setup();
	dive(game, mod);
	flyTo(game, mod, 100);
	fly(game, mod, 1);
	game.ships.push({ name: "Undertow", model: "The Undertow", player: false, hull: 9000, maxHull: 9000, shields: 0, maxShields: 0, energy: 0, fuel: 0, government: "Shoal Warden", strength: 120e6, tag: "shoal.undertow" });
	fly(game, mod, 1);
	jump(game, mod, HUB);
	land(game, mod);
	takeOff(game, mod);
	fly(game, mod, 5);
	assert.equal(game.condition("shoal: undertows"), 0);
});

test("Breakers' Haven: a landing keeps the run and its heat, sheds the wardens on the player's trail, and brings no wreck back", { skip }, () => {
	const { game, mod } = setup({ current: SPRING });
	live(game);
	dive(game, mod, HUB);
	fly(game, mod, 1);
	const hubWrecks = game.spawned.filter(isSeed).length;
	assert.ok(hubWrecks > 0, "the hub has a few wrecks of its own");
	jump(game, mod, SHALLOW);
	flyTo(game, mod, 26);
	fly(game, mod, 1);
	assert.deepEqual([...mod.run.guard_tags], ["shoal.wave.12", "shoal.wave.25"]);
	// The wardens follow the player back to the hub.
	jump(game, mod, HUB);
	fly(game, mod, 1);
	assert.equal(game.messages.at(-1), "They follow you down.");
	assert.deepEqual([...mod.run.guard_tags], ["shoal.wave.12", "shoal.wave.25"]);
	const heat = mod.run.heat;
	const mark = game.spawned.length;
	land(game, mod);
	assert.match(game.messages.at(-1), /lose your trail/);
	assert.deepEqual([...mod.run.guard_tags], []);
	assert.equal(mod.run.heat, heat, "the Haven pauses nothing and cuts nothing");
	assert.equal(game.condition("shoal: in run"), 1);
	takeOff(game, mod);
	fly(game, mod, 3);
	assert.deepEqual(game.spawned.slice(mark), [], "no wreck, restless hull or warden comes back after the takeoff");
});

test("currents are stable through a week, change across weeks, and change the run", { skip }, () => {
	const mod = new Shoal();
	const seen = new Set();
	for (let w = 157200; w < 157240; w++) {
		const c = mod.currents.of(w * 7);
		for (let d = 1; d < 7; d++) assert.equal(mod.currents.of(w * 7 + d), c, `week ${w}`);
		assert.ok(c >= 0 && c < 4);
		seen.add(c);
	}
	assert.equal(seen.size, 4, "all four currents come round");
	// on_day publishes it.
	const { game, mod: m } = setup({ current: RIPTIDE });
	m.on_day(game, game.day());
	assert.equal(game.condition("shoal: current"), RIPTIDE + 1);
	game.day_ = dayOf(CALM, game.day_);
	m.on_day(game, game.day_);
	assert.equal(game.condition("shoal: current"), CALM + 1);
});

test("Slack Water slows heat; Riptide adds pickets to each guardian wave", { skip }, () => {
	const slack = setup({ current: SLACK });
	dive(slack.game, slack.mod);
	fly(slack.game, slack.mod, 60);
	assert.ok(Math.abs(slack.mod.run.heat - 8) < 1e-6);

	const rip = setup({ current: RIPTIDE });
	dive(rip.game, rip.mod);
	flyTo(rip.game, rip.mod, 26);
	const by = spawnsBy(rip.game);
	assert.deepEqual(by["shoal.wave.12"], ["Shoal Warden Pickets", "Shoal Warden Pickets"]);
	assert.deepEqual(by["shoal.wave.25"], ["Shoal Warden Hunters", "Shoal Warden Pickets"]);
	assert.equal(by["shoal.wreck.25"], undefined, "no extra wrecks off Spring Tide");
});

test("in a Dead Calm the Undertow wakes at 85", { skip }, () => {
	const { game, mod } = setup({ current: CALM });
	dive(game, mod);
	flyTo(game, mod, 84.5);
	assert.equal(game.spawned.filter((s) => s.fleet === "Shoal Undertow").length, 0);
	flyTo(game, mod, 86);
	assert.equal(game.spawned.filter((s) => s.fleet === "Shoal Undertow").length, 1);
});

test("the state survives on_save, a new mod and on_pilot_loaded", { skip }, () => {
	const { game, mod } = setup();
	dive(game, mod);
	game.set_condition(GLASS, 5);
	fly(game, mod, 200);
	mod.on_save(game);
	const heat = mod.run.heat;
	const fired = [...mod.run.fired];

	const again = new Shoal();
	again.on_load(game);
	again.on_pilot_loaded(game);
	assert.equal(again.run.active, true);
	assert.ok(Math.abs(again.run.heat - heat) < 0.001);
	assert.deepEqual([...again.run.fired], fired);
	assert.deepEqual([...again.run.entry], [0, 0, 0]);
	assert.equal(again.run.seconds, 200);
	assert.equal(again.run.system, SHALLOW);
	assert.deepEqual([...again.run.seeded], [SHALLOW]);
	assert.equal(again.run.depth, DEEP.depth(SHALLOW));
	// It carries on: coming back up ends the run with the haul since entry.
	surface(game, again);
	assert.equal(game.condition("shoal: runs"), 1);
	assert.deepEqual([...again.run.hauls], [5, 0, 0]);
	again.on_save(game);

	// A third mod reads the records, and another pilot starts empty.
	const third = new Shoal();
	third.on_load(game);
	third.on_pilot_loaded(game);
	assert.equal(third.run.runs, 1);
	assert.equal(third.run.deepest_depth, DEEP.depth(SHALLOW));
	assert.equal(third.run.active, false);
	const other = new FakeGame({ system: "Sol" });
	third.on_pilot_loaded(other);
	assert.equal(third.run.runs, 0);
	assert.equal(other.condition("shoal: runs"), 0);
});

test("on an API 9 game (no on_save or on_pilot_loaded) the state is written as it changes and read lazily", { skip }, () => {
	const { game, mod } = setup({ features: [] });
	dive(game, mod);
	fly(game, mod, 30);
	assert.notEqual(game.data("state"), "");
	const later = new Shoal();
	later.on_load(game);
	later.on_enter(game, SHALLOW);
	assert.equal(later.run.active, true);
	assert.ok(Math.abs(later.run.heat - 5) < 0.001);
	// Another save loaded (its stored text changes) is read again.
	const other = setup({ features: [] });
	dive(other.game, other.mod);
	surface(other.game, other.mod);
	game.storage.set("state", other.game.data("state"));
	later.on_step(game, 60);
	assert.equal(later.run.active, false);
	assert.equal(later.run.runs, 1);
	assert.deepEqual(game.sections, [], "no API 10 calls");
});

test("a save loaded mid-run outside the Deep ends the run quietly", { skip }, () => {
	for (const where of ["Sol", REST]) {
		const { game, mod } = setup();
		dive(game, mod);
		game.set_condition(GLASS, 40);
		fly(game, mod, 100);
		mod.on_save(game);
		const saved = game.data("state");
		const elsewhere = new FakeGame({ system: where, data: { state: saved }, conditions: { [GLASS]: 40 }, fleets: FLEETS });
		const loaded = new Shoal();
		loaded.on_load(elsewhere);
		loaded.on_pilot_loaded(elsewhere);
		loaded.on_enter(elsewhere, where);
		assert.equal(loaded.run.active, false, where);
		assert.equal(loaded.run.runs, 0, "no run counted");
		assert.deepEqual([...loaded.run.hauls], [0, 0, 0], "no haul");
		assert.equal(elsewhere.messages.length, 0, "quietly");
		assert.equal(elsewhere.condition("shoal: in run"), 0);
	}
});

test("a run saved before 0.5.0, in Breakers' Rest itself, is dropped; the records and the remembered heat stay", { skip }, () => {
	const old = JSON.stringify({ v: 2, active: 1, heat: 42000, peak: 50000, fired: [10, 12, 25, 38], undertow: 0, jammed: 1, deep: 0,
		entry: [3, 0, 0], stored: [0, 0, 0], seconds: 300, after: 0, sunk: 0, guard_fleets: ["Shoal Warden Hunters"], guard_tags: ["shoal.wave.25"],
		wrecks_due: 1, recall: 1, greet: 0, restless: 2, restless_scheduled: 2, refill: 0, rolled: ["shoal.restless.1"], woken: [],
		runs: 7, deepest: 88, undertows: 1, hauls: [400, 20, 2], residual: 0, residual_day: 0 });
	const { game, mod } = setup({ system: REST, data: { state: old } });
	assert.equal(mod.run.active, false);
	assert.equal(game.condition("shoal: in run"), 0);
	assert.equal(mod.run.runs, 7);
	assert.equal(mod.run.deepest, 88);
	assert.equal(mod.run.undertows, 1);
	assert.deepEqual([...mod.run.hauls], [400, 20, 2]);
	assert.ok(Math.abs(mod.run.residual - 42) < 1e-9, "the old run's heat is what the Shoal remembers");
	assert.equal(mod.run.residual_day, game.day());
	assert.deepEqual([...mod.run.guard_tags], []);
	// Breakers' Rest's own wrecks are waiting (a full stock), and the next run starts warm.
	fly(game, mod, 1);
	assert.equal(game.spawned.filter((s) => s.fleet === "Shoal Rest Wrecks").length, 3);
	jump(game, mod, HUB);
	assert.ok(Math.abs(mod.run.heat - 42) < 1e-6);
});

test("nothing spawns while landed, or outside the Deep and Breakers' Rest", { skip }, () => {
	const { game, mod } = setup();
	// Outside: no run, nothing at all.
	fly(game, mod, 800);
	assert.equal(game.spawned.length, 0);
	assert.equal(mod.run.active, false);
	// Landed in the Deep (a save loaded at Breakers' Haven), even with heat past every wave.
	dive(game, mod, HUB);
	land(game, mod);
	mod.run.heat = 150;
	fly(game, mod, 100);
	assert.equal(game.spawned.length, 0);
	// Directly: spawn refuses outside the Deep during a run, in flight too.
	game.landed = false;
	game.planet_ = "";
	game.here_ = "Arneb";
	mod.spawn(game, "Shoal Warden Pickets", "shoal.wave.12", true);
	mod.guard(game, "Shoal Warden Pickets", "shoal.wave.12");
	fly(game, mod, 10);
	assert.equal(game.spawned.length, 0);
});

test("the run summary counts only what was gained", { skip }, () => {
	const { game, mod } = setup({ conditions: { [GLASS]: 10, [CORES]: 2, [LATTICE]: 1 } });
	dive(game, mod);
	assert.deepEqual([...mod.run.entry], [10, 2, 1]);
	game.set_condition(GLASS, 52);
	game.set_condition(CORES, 1); // lost one: not a negative haul
	game.set_condition(LATTICE, 1);
	fly(game, mod, 400);
	surface(game, mod);
	const summary = game.messages.at(-1);
	assert.match(summary, /^You come back up out of the Shoal with 42 Shoal Glass\. The Shoal below you is (calm|stirring|roused|furious|abyssal)\.$/);
	assert.deepEqual([...mod.run.hauls], [42, 0, 0]);
	// A run with cores and lattice names them.
	laterWeek(game);
	dive(game, mod);
	game.set_condition(GLASS, 60);
	game.set_condition(CORES, 4);
	game.set_condition(LATTICE, 2);
	surface(game, mod);
	assert.equal(game.messages.at(-1), "You come back up out of the Shoal with 8 Shoal Glass, 3 Warden Cores and 1 Deep Lattice. The Shoal below you is calm.");
	assert.deepEqual([...mod.run.hauls], [50, 3, 1]);
});

test("the map shows the Shoal's current and records once it is charted", { skip }, () => {
	const { game, mod } = setup();
	const detail = game.map.find((m) => m.detail === SHOAL);
	assert.ok(detail);
	assert.equal(detail.title, SHOAL_NAME);
	assert.match(detail.text, /Spring Tide/);
	assert.match(detail.text, /Runs: 0/);
	assert.match(detail.text, /Undertows sunk: 0/);
	dive(game, mod, DRIFT);
	const inRun = game.map.filter((m) => m.detail);
	assert.deepEqual(inRun.map((m) => m.detail).sort(), [SHOAL, HUB].sort(), "Breakers' Rest and the hub");
	assert.match(inRun[0].text, /You are in the Drift\./);
	surface(game, mod);
	const after = game.map.find((m) => m.detail === SHOAL).text;
	assert.match(after, /Runs: 1/);
	assert.match(after, /Deepest reach: the Drift/);
	assert.equal(game.map.filter((m) => m.detail === SHOAL).length, 1, "drawn once, after clearing");

	const hidden = setup({ conditions: { "shoal: charted": 0 } });
	assert.equal(hidden.game.map.length, 0);
});

test("a deep system's wrecks are placed once a run, on its first second in flight; its wardens on every arrival", { skip }, () => {
	const { game, mod } = setup();
	mod.roll = () => 0.0;
	dive(game, mod, HUB);
	assert.equal(game.spawned.length, 0, "not from the arrival hook: on the first step");
	fly(game, mod, 1);
	const seeds = () => game.spawned.filter((s) => s.tag.startsWith(SEED));
	assert.deepEqual(seeds().map((s) => s.fleet), DEEP.seed_wrecks[0].map((f) => f));
	assert.ok(seeds().every((s) => !s.arrive));
	jump(game, mod, SHALLOW);
	fly(game, mod, 1);
	assert.deepEqual(seeds().slice(1).map((s) => s.fleet), ["Shoal Wrecks", "Shoal Wrecks", "Shoal Glass Wrecks"]);
	assert.ok(seeds().slice(1).every((s) => s.tag === SEED + "2."), "tagged by the system's turn");
	const placed = seeds().length;
	// Coming back to a system this run places nothing new.
	jump(game, mod, SHALLOW2);
	fly(game, mod, 1);
	const two = seeds().length;
	assert.equal(two, placed + 3);
	jump(game, mod, SHALLOW);
	fly(game, mod, 30);
	assert.equal(seeds().length, two, "once a run");
	// Deeper: richer wrecks, a deep wreck by chance (the roll is fixed at 0 here), and residents.
	const before = game.spawned.length;
	jump(game, mod, FATHOMS);
	fly(game, mod, 1);
	const fathoms = game.spawned.slice(before);
	assert.deepEqual(fathoms.filter((s) => s.tag.startsWith(SEED)).map((s) => s.fleet), ["Shoal Glass Wrecks", "Shoal Rich Wrecks", "Shoal Rich Wrecks", "Shoal Deep Wreck"]);
	const residents = () => game.spawned.filter((s) => s.tag.startsWith("shoal.resident."));
	assert.deepEqual(residents().map((s) => s.fleet), ["Shoal Warden Pickets 3", "Shoal Warden Hunters 3"]);
	assert.ok(residents().every((s) => !s.arrive), "placed, already on watch");
	// The wardens keep it: back again, they are there again (the wrecks are not).
	jump(game, mod, ABYSS);
	fly(game, mod, 1);
	assert.deepEqual(game.spawned.filter((s) => s.tag.startsWith(SEED) && s.fleet === "Shoal Abyss Wreck").length, 1);
	jump(game, mod, FATHOMS);
	fly(game, mod, 1);
	assert.equal(residents().filter((s) => s.fleet.endsWith(" 3")).length, 4);
	// A new run places them again.
	surface(game, mod);
	laterWeek(game);
	const mark = game.spawned.length;
	dive(game, mod);
	fly(game, mod, 1);
	assert.equal(game.spawned.slice(mark).filter((s) => s.tag.startsWith(SEED)).length, 3);
	// With rolls that miss, no deep wreck and no resident that is left to chance.
	const lucky = setup();
	lucky.mod.roll = () => 0.99;
	dive(lucky.game, lucky.mod, FATHOMS);
	fly(lucky.game, lucky.mod, 1);
	assert.equal(lucky.game.spawned.filter((s) => s.fleet === "Shoal Deep Wreck").length, 0);
	assert.deepEqual(lucky.game.spawned.filter((s) => s.tag.startsWith("shoal.resident.")).map((s) => s.fleet), ["Shoal Warden Pickets 3"]);
});

test("guards still afloat follow the player through the Deep and come back after a loaded save; beaten ones do not", { skip }, () => {
	const { game: realGame, mod } = setup({ current: SPRING });
	const game = new Proxy(realGame, { get(t, k) {
		if (k === "spawned") return t.spawned.filter((s) => !isSeed(s));
		const v = t[k]; return typeof v === "function" ? v.bind(t) : v;
	}, set(t, k, v) { t[k] = v; return true; } });
	live(game);
	dive(game, mod);
	flyTo(game, mod, 26);
	fly(game, mod, 1);
	assert.deepEqual([...mod.run.guard_tags], ["shoal.wave.12", "shoal.wave.25"]);
	sink(game, "shoal.wave.12");
	fly(game, mod, 1);
	assert.deepEqual([...mod.run.guard_fleets], ["Shoal Warden Hunters"]);
	const before = game.spawned.length;
	jump(game, mod, SHALLOW2);
	assert.equal(game.spawned.length, before, "they come on the first second");
	fly(game, mod, 1);
	assert.deepEqual(game.spawned.slice(before).filter(isGuard), [{ fleet: "Shoal Warden Hunters", government: "", tag: "shoal.wave.25", arrive: true }], "only the live wave");
	assert.ok(game.messages.includes("They follow you down."));
	// Once beaten, they stay beaten.
	sink(game, "shoal.wave.25");
	fly(game, mod, 1);
	assert.deepEqual([...mod.run.guard_tags], []);
	const after = game.spawned.length;
	jump(game, mod, SHALLOW);
	fly(game, mod, 2);
	assert.equal(game.spawned.length, after);
	// A run's guards are kept in its save, and come back after loading it.
	fly(game, mod, 400);
	assert.ok(mod.run.guard_tags.length > 0);
	mod.on_save(game);
	const tags = [...mod.run.guard_tags];
	const loaded = new Shoal();
	loaded.on_load(game);
	loaded.on_pilot_loaded(game);
	game.ships = game.ships.filter((s) => s.player);
	loaded.on_enter(game, SHALLOW);
	const mark = game.spawned.length;
	fly(game, loaded, 1);
	assert.deepEqual(game.spawned.slice(mark).filter(isGuard).map((s) => s.tag), tags);
	assert.equal(game.messages.at(-1).startsWith("They were waiting for you.") || game.messages.includes("They were waiting for you."), true);
});

test("an Undertow that follows the player comes back, and counts only when beaten", { skip }, () => {
	const { game, mod } = setup({ current: SPRING });
	live(game);
	dive(game, mod);
	flyTo(game, mod, 100);
	fly(game, mod, 2);
	const undertows = () => game.spawned.filter((s) => s.fleet === "Shoal Undertow").length;
	assert.equal(undertows(), 1);
	jump(game, mod, SHALLOW2);
	fly(game, mod, 1);
	assert.equal(undertows(), 2, "it followed");
	assert.deepEqual(game.spawned.filter((s) => s.fleet === "Shoal Undertow").at(-1), { fleet: "Shoal Undertow", government: "", tag: "shoal.undertow", arrive: true });
	fly(game, mod, 3);
	assert.equal(game.condition("shoal: undertows"), 0);
	sink(game, "shoal.undertow", "The Undertow");
	fly(game, mod, 1);
	assert.equal(game.condition("shoal: undertows"), 1);
	assert.equal(mod.run.sunk, true);
	// Its escort still flies: after a jump the escort follows, not the Undertow.
	const mark = game.spawned.length;
	jump(game, mod, SHALLOW);
	fly(game, mod, 1);
	assert.deepEqual(game.spawned.slice(mark).filter((s) => s.tag === "shoal.undertow"), [{ fleet: "Shoal Warden Pickets", government: "", tag: "shoal.undertow", arrive: true }]);
	assert.equal(undertows(), 2);
	fly(game, mod, 10);
	assert.equal(game.condition("shoal: undertows"), 1, "counted once");
});

test("heat carries over between runs, less eight a day, and the Shoal remembers", { skip }, () => {
	const { game, mod } = setup({ current: SLACK });
	dive(game, mod);
	flyTo(game, mod, 42);
	const end = mod.run.heat;
	surface(game, mod);
	assert.ok(Math.abs(mod.run.residual - end) < 1e-9);
	assert.equal(mod.run.residual_day, game.day());
	// It is kept with the pilot.
	mod.on_save(game);
	const again = new Shoal();
	again.on_load(game);
	again.on_pilot_loaded(game);
	assert.ok(Math.abs(again.run.residual - end) < 0.001);
	assert.equal(again.run.residual_day, game.day());

	passDays(game, 2);
	const mark = game.spawned.length;
	jump(game, again, HUB);
	const startHeat = end - 16;
	assert.ok(startHeat > 25 && startHeat < 38);
	assert.ok(Math.abs(again.run.heat - startHeat) < 0.001);
	assert.equal(game.condition("shoal: heat"), Math.floor(startHeat + 1e-6));
	assert.deepEqual([...again.run.fired], [10, 12, 25], "thresholds already passed have fired");
	fly(game, again, 1);
	const greeted = game.spawned.slice(mark).filter(isGuard);
	assert.deepEqual(greeted, [{ fleet: "Shoal Warden Pickets", government: "", tag: "shoal.wave.25", arrive: true }], "the highest of them waits on arrival, as the hub sends it");
	assert.ok(game.messages.includes("The Shoal remembers you."));
	fly(game, again, 1);
	assert.equal(game.spawned.slice(mark).filter(isGuard).length, 1, "once");

	// After enough days it has forgotten.
	surface(game, again);
	passDays(game, 5);
	const quiet = game.spawned.length;
	jump(game, again, HUB);
	assert.equal(again.run.heat, 0);
	assert.deepEqual([...again.run.fired], []);
	fly(game, again, 2);
	assert.equal(game.spawned.slice(quiet).filter(isGuard).length, 0);
});

test("a run that starts past the Undertow's heat finds it waiting past the hub", { skip }, () => {
	const { game, mod } = setup({ current: SPRING });
	dive(game, mod);
	flyTo(game, mod, 101);
	surface(game, mod);
	const mark = game.spawned.length;
	jump(game, mod, HUB);
	assert.equal(mod.run.undertow, false, "it never waits in the hub");
	assert.equal(mod.run.fired.length, 9);
	fly(game, mod, 1);
	assert.deepEqual(game.spawned.slice(mark).filter(isGuard), [{ fleet: "Shoal Warden Pickets", government: "", tag: "shoal.wave.92", arrive: true }]);
	assert.ok(game.messages.includes("The Shoal remembers you."));
	jump(game, mod, SHALLOW);
	fly(game, mod, 1);
	assert.match(game.messages.join("\n"), /The Undertow wakes/);
	assert.equal(game.spawned.slice(mark).filter((s) => s.fleet === "Shoal Undertow").length, 1);
	fly(game, mod, 5);
	assert.equal(game.spawned.filter((s) => s.fleet === "Shoal Undertow").length, 2, "once per run");
});

test("loading an earlier save of the same pilot reads its state again, without on_pilot_loaded", { skip }, () => {
	const { game, mod } = setup();
	const before = new Map(game.storage);
	dive(game, mod, HUB);
	fly(game, mod, 120);
	land(game, mod);
	mod.on_save(game);
	const saved = new Map(game.storage);
	const heat = mod.run.heat;
	const fired = [...mod.run.fired];
	takeOff(game, mod);
	jump(game, mod, SHALLOW);
	flyTo(game, mod, 40);
	assert.notEqual(game.data("rev"), saved.get("rev"), "the first change after a save marks a new revision");
	assert.equal(game.data("state"), saved.get("state"), "(the state itself waits for on_save)");
	// The player loads the save made at Breakers' Haven.
	game.storage = new Map(saved);
	game.here_ = HUB;
	game.landed = true;
	game.planet_ = BHAVEN;
	game.ships = game.ships.filter((s) => s.player);
	mod.on_enter(game, HUB);
	assert.ok(Math.abs(mod.run.heat - heat) < 0.001, `heat ${mod.run.heat}, not ${heat}`);
	assert.deepEqual([...mod.run.fired], fired);
	assert.equal(game.condition("shoal: heat"), Math.floor(heat));
	// And a save from before the run, in Arneb: no run at all.
	takeOff(game, mod);
	flyTo(game, mod, 30);
	game.storage = new Map(before);
	game.here_ = "Arneb";
	game.landed = false;
	game.planet_ = "";
	mod.on_step(game, 120000);
	assert.equal(mod.run.active, false);
	assert.equal(mod.run.heat, 0);
	assert.equal(mod.run.runs, 0, "the dead run is not counted");
	assert.equal(game.condition("shoal: in run"), 0);
});

test("guardian kills left unread are drained at a run's start and end", { skip }, () => {
	const { game, mod } = setup();
	game.kills.set("shoal.wave", 4);
	game.kills.set("shoal.undertow", 1);
	dive(game, mod);
	fly(game, mod, 1);
	assert.ok(Math.abs(mod.run.heat - 1 / 6) < 1e-9, "kills from before the run add nothing");
	fly(game, mod, 10);
	game.kills.set("shoal.endless", 2);
	game.kills.set("shoal.wave", 3);
	surface(game, mod);
	assert.equal(game.kills.get("shoal.endless"), 0);
	assert.equal(game.kills.get("shoal.wave"), 0);
	laterWeek(game);
	dive(game, mod);
	fly(game, mod, 1);
	assert.ok(Math.abs(mod.run.heat - 1 / 6) < 1e-9);
});

test("the summary names each material gained, singular or plural, and the map shows heat and depth only in words", { skip }, () => {
	const { game, mod } = setup();
	dive(game, mod);
	assert.match(game.map.find((m) => m.detail === SHOAL).text, /The Shoal is calm\./);
	game.set_condition(GLASS, 12);
	game.set_condition(CORES, 1);
	game.set_condition(LATTICE, 2);
	surface(game, mod);
	assert.equal(game.messages.at(-1), "You come back up out of the Shoal with 12 Shoal Glass, 1 Warden Core and 2 Deep Lattice. The Shoal below you is calm.");
	laterWeek(game);
	dive(game, mod);
	game.set_condition(GLASS, 13);
	game.set_condition(LATTICE, 3);
	surface(game, mod);
	assert.equal(game.messages.at(-1), "You come back up out of the Shoal with 1 Shoal Glass and 1 Deep Lattice. The Shoal below you is calm.");
	laterWeek(game);
	dive(game, mod);
	game.set_condition(CORES, 3);
	surface(game, mod);
	assert.equal(game.messages.at(-1), "You come back up out of the Shoal with 2 Warden Cores. The Shoal below you is calm.");
	laterWeek(game);
	for (const c of [GLASS, CORES, LATTICE]) game.set_condition(c, 0);
	dive(game, mod, ABYSS);
	fly(game, mod, 150);
	surface(game, mod);
	assert.match(game.messages.at(-1), /^You come back up out of the Shoal empty-handed\. The Shoal below you is (stirring|roused|furious)\.$/);
	// The map: the deepest heat and reach as words, no number for them.
	const text = game.map.find((m) => m.detail === SHOAL).text;
	assert.match(text, /^Deepest: (stirring|roused|furious)$/m);
	assert.match(text, /^Deepest reach: the Abyss$/m);
	for (const line of text.split("\n")) if (!/^(Runs|Undertows sunk):/.test(line)) assert.doesNotMatch(line, /\d/, line);
	// Every message but the summaries is free of numbers.
	for (const m of game.messages) if (!m.startsWith("You come back up")) assert.doesNotMatch(m, /\d/, m);
});

test("Breakers' Rest outside a run: a few derelicts and many restless wrecks, refilled only while the player is away", { skip }, () => {
	const { game, mod } = setup();
	const rest = () => game.spawned.filter((s) => s.fleet === "Shoal Rest Wrecks");
	const restless = () => game.spawned.filter((s) => s.fleet === "Shoal Rest Restless");
	mod.roll = () => 0.99; // no picket visits
	jump(game, mod, REST);
	assert.equal(game.spawned.length, 0, "on the first second in flight");
	fly(game, mod, 1);
	assert.deepEqual(rest().map((s) => s.tag), ["shoal.wreck.rest.1.", "shoal.wreck.rest.2.", "shoal.wreck.rest.3."]);
	assert.deepEqual(restless().map((s) => s.tag), ["shoal.restless.1.", "shoal.restless.2.", "shoal.restless.3.", "shoal.restless.4."]);
	assert.ok(game.spawned.every((s) => !s.arrive && s.government === ""));
	// Landing and taking off, however often and however many days it takes, places nothing new.
	for (let k = 0; k < 5; k++) {
		land(game, mod, OUTPOST);
		passDays(game, 1);
		takeOff(game, mod);
		fly(game, mod, 2);
	}
	assert.equal(rest().length, 3);
	assert.equal(restless().length, 4);
	assert.equal(mod.run.active, false);
	assert.equal(mod.run.heat, 0);
	// A day away: a restless hull is back; derelicts take longer.
	jump(game, mod, "Arneb");
	passDays(game, 1);
	jump(game, mod, REST);
	fly(game, mod, 1);
	assert.equal(rest().length, 3);
	assert.equal(restless().length, 5);
	assert.equal(restless().at(-1).tag, "shoal.restless.1.", "tags start again on each arrival");
	// Six days away (a run in the Deep counts as away): two derelicts (0.4 a day), and the restless stock is full again.
	dive(game, mod, HUB);
	passDays(game, 6);
	surface(game, mod);
	fly(game, mod, 1);
	assert.equal(rest().length, 5);
	assert.equal(restless().length, 9);
	// Fractions wait for the next arrival.
	assert.ok(Math.abs(mod.run.rest_wrecks - 0.8) < 1e-6);
});

test("now and then a warden picket visits Breakers' Rest, once, a minute or two after the player arrives", { skip }, () => {
	const { game, mod } = setup();
	let r = 0.05;
	mod.roll = () => r;
	jump(game, mod, REST);
	r = 0.99;
	fly(game, mod, 59);
	const visits = () => game.spawned.filter((s) => s.tag.startsWith("shoal.visit."));
	assert.equal(visits().length, 0);
	fly(game, mod, 100);
	assert.deepEqual(visits(), [{ fleet: "Shoal Warden Pickets", government: "", tag: "shoal.visit.1.", arrive: true }]);
	assert.equal(game.messages.at(-1), "A pale shape slips out of the Maw and turns towards you.");
	fly(game, mod, 300);
	assert.equal(visits().length, 1, "once");
	// Kills there raise no heat and do not count later.
	game.kills.set("shoal.visit.", 2);
	fly(game, mod, 1);
	assert.equal(game.kills.get("shoal.visit."), 0);
	// Most arrivals bring none.
	jump(game, mod, "Arneb");
	jump(game, mod, REST);
	fly(game, mod, 400);
	assert.equal(visits().length, 1);
});

test("the job-board refinery is on only for games without outfit_take (mod API 11)", { skip }, () => {
	const all = [...new FakeGame({}).features];
	const api10 = all.filter((f) => f !== "call:outfit_take" && f !== "call:outfit_give");
	const { game } = setup({ features: api10 });
	assert.equal(game.condition("shoal: refinery jobs"), 1, "an API 10 game: the refinery jobs are offered");
	const newer = setup({ features: [...api10, "call:outfit_take", "call:outfit_give"] });
	assert.equal(newer.game.condition("shoal: refinery jobs"), 0, "an API 11 game: the refinery is a button");
});

// ---- v0.3: the Breakers' Yard and restless wrecks (mod API 11) ----

const HAVEN = "Haven", FARPOINT = "Farpoint";
const RSG = "Refined Shoal Glass", RWC = "Refined Warden Core", DL = "Deep Lattice";
const FLAG = "00000000-0000-4000-8000-000000000001", ESCORT = "00000000-0000-4000-8000-000000000002";
// Every API 11 call taken away: an API 10 game.
const API10 = [...new FakeGame({}).features].filter((f) => !/^call:(define|define_outfit_variant|define_ship_variant|defined|ship_replace_outfit|outfit_take|outfit_give|ship_distance|ship_x|ship_y|ship_reactivate)$/.test(f) && !["runtime_definitions", "outfit_transfer", "ship_reactivate"].includes(f));

// Outfits by attributes, as the game's data writes them (stock names the
// yard's Catalog lists, and made-up ones for classification).
const sys = (cost, attributes, category = "Systems") => ({ category, mass: 10, cost, weapon: false, attributes });
// Weapons carry their weapon block's stats (mod API 12: outfit_weapon_attribute);
// the stock ones as the yard's Catalog has them, for the fallback.
const gun = (cost, space, attributes = {}, weaponStats) => ({ category: "Guns", mass: 10, cost, weapon: true, attributes: { "outfit space": -space, "weapon capacity": -space, "gun ports": -1, ...attributes }, ...(weaponStats ? { weaponStats } : {}) });
const turret = (cost, space, weaponStats) => ({ category: "Turrets", mass: 10, cost, weapon: true, attributes: { "outfit space": -space, "weapon capacity": -space, "turret mounts": -1 }, ...(weaponStats ? { weaponStats } : {}) });
const HEAVY_LASER = { "velocity": 12, "lifetime": 50, "reload": 1, "firing energy": 1.33, "firing heat": 2.8, "hull damage": 2.4, "shield damage": 1.7 };
const ANTI_MISSILE = { "velocity": 0, "lifetime": 1, "reload": 30, "firing energy": 5, "firing heat": 3, "anti-missile": 5 };
const YARD_OUTFITS = {
	"D14-RN Shield Generator": sys(20000, { "outfit space": -15, "shield generation": 0.2, "shield energy": 0.2 }),
	"Heavy Laser": gun(25000, 41, {}, HEAVY_LASER),
	"Anti-Missile Turret": turret(20000, 20, ANTI_MISSILE),
	"nGVF-BB Fuel Cell": sys(47000, { "outfit space": -30, "energy generation": 1.9, "heat generation": 2.9 }, "Power"),
	"LP036a Battery Pack": sys(6000, { "outfit space": -10, "energy capacity": 4000 }, "Power"),
	"X1700 Ion Thruster": sys(12000, { "outfit space": -16, "thrust": 13.545, "thrusting energy": 0.6, "thrusting heat": 0.9 }, "Engines"),
	"X1200 Ion Steering": sys(9000, { "outfit space": -12, "turn": 307, "turning energy": 0.5 }, "Engines"),
	"Caldera Afterburner": sys(70000, { "outfit space": -15, "afterburner thrust": 11, "afterburner fuel": 1.5, "afterburner heat": 8 }, "Engines"),
	"Small Repair Module": sys(64000, { "outfit space": -6, "hull repair rate": 0.12, "hull energy": 0.3 }),
	"Hyperdrive": sys(50000, { "outfit space": -20, "hyperdrive": 1 }),
	// Made up: the kinds are read from attributes, never names.
	"Odd Box": sys(1000, { "shield generation": 1 }, "Power"),
	"Cold Brick": sys(1000, { "active cooling": 2, "cooling energy": 1 }),
	"Warm Brick": sys(1000, { "heat dissipation": 0.1 }),
	"Chill Brick": sys(1000, { "cooling": 3 }),
	"Hull Slab": sys(1000, { "hull": 300 }),
	"Generator Battery": sys(1000, { "energy capacity": 100, "energy generation": 1 }, "Power"),
	"Crew Saver": sys(1000, { "required crew": -1, "shield generation": 1 }),
	"Region Map": sys(1000, { "map": 10 }, "Special"),
	"Navy License": sys(1000, {}, "Licenses"),
	"Space Pod": sys(1000, { "outfit space": 10, "hull": 10 }),
	"Shoal Glass": sys(4000, { "installable": -1 }, "Special"),
	"Glass Lamprey": sys(4000, {}, "Ammunition"),
	"Mystery Gun": gun(1000, 10),
	"Borrowed Shield": sys(1000, { "shield generation": 2 }),
	// The Shoal's materials and two of its lines.
	[RSG]: sys(40000, { "installable": -1 }, "Special"),
	[RWC]: sys(180000, { "installable": -1 }, "Special"),
	"Warden Core": sys(60000, { "installable": -1 }, "Special"),
	[DL]: sys(400000, { "installable": -1 }, "Special"),
	"Tidecutter Mk I": gun(240000, 20),
	"Tidecutter Mk II": gun(1450000, 20),
	"Tidecutter Mk III": gun(5400000, 20),
	"Glassweave Shield Mk I": sys(240000, { "outfit space": -30, "shield generation": 1 }),
	"Glassweave Shield Mk II": sys(1450000, { "outfit space": -30, "shield generation": 1.3 }),
	"Glassweave Shield Mk III": sys(5400000, { "outfit space": -30, "shield generation": 1.8 }),
	"Driftnet Ramscoop Mk I": sys(240000, { "outfit space": -15, "ramscoop": 10 }),
	"Driftnet Ramscoop Mk II": sys(1450000, { "outfit space": -15, "ramscoop": 24 }),
	"Driftnet Ramscoop Mk III": sys(5400000, { "outfit space": -15, "ramscoop": 100 }),
};
const YARD_FLEET = [
	{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "D14-RN Shield Generator": 2, "Heavy Laser": 1, "Hyperdrive": 1 } },
	{ uuid: ESCORT, name: "Escort", model: "Shuttle", outfits: { "Anti-Missile Turret": 1 } },
];

// The conditions the game derives from the player's outfits: in cargo and in
// the landed planet's storage (from FakeGame's outfitCargo and outfitStorage),
// and installed on ships here, parked or not (every ship but one marked away).
function derive(game) {
	const base = game.condition.bind(game);
	game.condition = (name) => {
		let m;
		if ((m = /^outfit \(cargo\): (.*)$/.exec(name))) return base(name) + (game.outfitCargo.get(m[1]) ?? 0);
		if ((m = /^outfit \(storage\): (.*)$/.exec(name))) return base(name) + (game.planet_ ? (game.outfitStorage.get(game.planet_)?.get(m[1]) ?? 0) : 0);
		if ((m = /^outfit \((installed|parked)\): (.*)$/.exec(name)))
			return game.fleet.filter((s) => !s.away && !!s.parked === (m[1] === "parked")).reduce((n, s) => n + (s.outfits[m[2]] ?? 0), 0);
		return base(name);
	};
	return game;
}

// A pilot landed on a yard planet (Breaker's Rest by default, in the Shoal).
function yard({ planet = OUTPOST, features, welcomed = true, fleet = YARD_FLEET, cargo = {}, storage = {}, credits = 1000000, definitions } = {}) {
	const game = new FakeGame({
		system: planet === OUTPOST ? SHOAL : "Arneb",
		landed: true,
		planet,
		day: dayOf(SPRING),
		fleets: FLEETS,
		systems: {
			"Arneb": { government: "Pirate", links: [SHOAL], inhabited: true, defense: [] },
			[SHOAL]: { government: "Uninhabited", links: ["Arneb"], inhabited: true, defense: [] },
		},
		planets: {
			[OUTPOST]: { system: SHOAL, government: "Breakers", services: ["bank", "trading", "job board", "outfitter"] },
			[HAVEN]: { system: "Arneb", government: "Pirate", services: ["bank", "outfitter"] },
			[FARPOINT]: { system: "Arneb", government: "Republic", services: ["outfitter"] },
			"Rest Stop": { system: "Arneb", government: "Pirate", services: ["outfitter"] },
		},
		conditions: { "shoal: charted": 1, ...(welcomed ? { "shoal: welcomed": 1 } : {}), credits },
		fleet,
		outfits: YARD_OUTFITS,
		outfitCargo: cargo,
		outfitStorage: { [planet]: storage },
		...(features ? { features } : {}),
		...(definitions ? { definitions } : {}),
	});
	derive(game);
	const mod = new Shoal();
	mod.on_load(game);
	mod.on_pilot_loaded(game);
	mod.on_enter(game, game.here());
	return { game, mod };
}
const cargoOf = (game, o) => game.outfitCargo.get(o) ?? 0;
const storedOf = (game, o, planet = OUTPOST) => game.outfitStorage.get(planet)?.get(o) ?? 0;
const row = (game, k) => game.panel.rows[k];
const pressLabel = (game, mod, label) => {
	const k = game.panel.buttons.indexOf(label);
	assert.ok(k >= 0, `a "${label}" button among ${game.panel.buttons.join(", ")}`);
	mod.on_panel(game, k);
};

test("the yard's button is on Breaker's Rest, Haven and Farpoint once the player is welcomed", { skip }, () => {
	for (const planet of [OUTPOST, HAVEN, FARPOINT]) {
		assert.equal(yard({ planet }).game.planetButtonLabel, "Breakers' Yard", planet);
		assert.equal(yard({ planet, welcomed: false }).game.planetButtonLabel, "", `${planet}, before the welcome`);
	}
	const { game, mod } = yard({ planet: "Rest Stop" });
	assert.equal(game.planetButtonLabel, "");
	// Taking off takes it away; landing on a yard planet brings it back.
	game.landed = false;
	game.planet_ = "";
	mod.on_enter(game, game.here());
	assert.equal(game.planetButtonLabel, "");
	game.landed = true;
	game.planet_ = FARPOINT;
	mod.on_enter(game, game.here());
	assert.equal(game.planetButtonLabel, "Breakers' Yard");
});

test("classification is by attributes: every kind, and every refusal", { skip }, () => {
	const { game, mod } = yard({ definitions: [{ kind: "outfit", name: "Borrowed Shield", mod: "another mod", base: "D14-RN Shield Generator", changes: "" }] });
	assert.equal(mod.yard.can_list, true, "mod API 12: the yard reads the game, not Catalog");
	const kinds = {
		"Heavy Laser": "gun", "Tidecutter Mk I": "", "Anti-Missile Turret": "turret", "D14-RN Shield Generator": "shield", "Odd Box": "shield",
		"nGVF-BB Fuel Cell": "reactor", "Generator Battery": "reactor", "LP036a Battery Pack": "battery",
		"Cold Brick": "cooling", "Warm Brick": "cooling", "Chill Brick": "cooling", "X1700 Ion Thruster": "thruster",
		"X1200 Ion Steering": "steering", "Caldera Afterburner": "afterburner", "Small Repair Module": "repair", "Hull Slab": "armor",
		// Refused.
		// Another mod's runtime outfit qualifies like any other (mod API 12).
		"Borrowed Shield": "shield",
		// Refused.
		"Crew Saver": "", "Heavy Rocket": "", "Region Map": "", "Navy License": "", "Cargo Expansion": "", "Space Pod": "",
		"Shoal Glass": "", "Mystery Gun": "", "Hyperdrive": "", "No Such Outfit": "",
	};
	for (const [outfit, kind] of Object.entries(kinds)) assert.equal(mod.yard.classify(game, outfit), kind, outfit);
	assert.match(mod.yard.refusal(game, "Crew Saver"), /crew/);
	assert.match(mod.yard.refusal(game, "Heavy Rocket"), /Ammunition/);
	assert.match(mod.yard.refusal(game, "Region Map"), /Special|map/);
	assert.match(mod.yard.refusal(game, "Navy License"), /Licenses/);
	assert.match(mod.yard.refusal(game, "Cargo Expansion"), /cargo space/);
	assert.match(mod.yard.refusal(game, "Space Pod"), /outfit space/);
	assert.equal(mod.yard.refusal(game, "Borrowed Shield"), "");
	assert.match(mod.yard.refusal(game, "Mystery Gun"), /kind/, "a weapon that deals no damage and stops no missiles");
	assert.equal(mod.yard.refusal(game, "Heavy Laser"), "");
});

test("a mark's variant is a pure function of the original outfit and the mark", { skip }, () => {
	const { game, mod } = yard();
	const y = mod.yard;
	const shield = 2;
	assert.equal(y.variant_name("D14-RN Shield Generator", 2), "D14-RN Shield Generator (Breakers Mk II)");
	assert.equal(y.changes(game, "D14-RN Shield Generator", shield, 1),
		"\"display name\" \"D14-RN Shield Generator Mk I\"\ncost 22000\n\"shield generation\" 0.22\n\"shield energy\" 0.208\n");
	assert.equal(y.changes(game, "D14-RN Shield Generator", shield, 2),
		"\"display name\" \"D14-RN Shield Generator Mk II\"\ncost 24400\n\"shield generation\" 0.244\n\"shield energy\" 0.216\n");
	assert.equal(y.changes(game, "D14-RN Shield Generator", shield, 3),
		"\"display name\" \"D14-RN Shield Generator Mk III\"\ncost 27000\n\"shield generation\" 0.27\n\"shield energy\" 0.224\n");
	// A weapon: its damage of every type (headline; disabled and minable damage
	// default to hull damage) and firing costs (drawback), as the game answers them.
	assert.equal(y.changes(game, "Heavy Laser", 0, 1),
		"\"display name\" \"Heavy Laser Mk I\"\ncost 27500\nweapon\n\t\"disabled damage\" 2.64\n\t\"firing energy\" 1.3832\n\t\"firing heat\" 2.912\n\t\"hull damage\" 2.64\n\t\"minable damage\" 2.64\n\t\"shield damage\" 1.87\n");
	assert.match(y.changes(game, "Anti-Missile Turret", 1, 3), /"anti-missile" 6\.75\n/);
	// Reactor: generation up, its heat a little; thruster: thrust, and its energy and heat.
	assert.match(y.changes(game, "nGVF-BB Fuel Cell", 3, 1), /"energy generation" 2\.09\n"heat generation" 3\.016\n/);
	assert.match(y.changes(game, "X1700 Ion Thruster", 6, 2), /"thrust" 16\.5249\n"thrusting energy" 0\.648\n"thrusting heat" 0\.972\n/);
	// Defining the same mark twice is the same text: a no-op that counts.
	assert.equal(y.define_mark(game, "D14-RN Shield Generator", shield, 2), true);
	assert.equal(y.define_mark(game, "D14-RN Shield Generator", shield, 2), true);
	const def = game.definitions.get("outfit\u0000D14-RN Shield Generator (Breakers Mk II)");
	assert.equal(def.base, "D14-RN Shield Generator", "every mark derives from the original");
	assert.equal(game.outfit_attribute("D14-RN Shield Generator (Breakers Mk II)", "shield generation"), 0.244);
	assert.equal(game.outfit_attribute("D14-RN Shield Generator (Breakers Mk II)", "mass"), 10, "the mass stays");
	assert.equal(game.outfit_name("D14-RN Shield Generator (Breakers Mk II)"), "D14-RN Shield Generator Mk II");
});

test("prices: refined materials by size, and a share of the original's cost", { skip }, () => {
	const { game, mod } = yard();
	const y = mod.yard;
	assert.equal(y.units(game, "D14-RN Shield Generator"), 1, "15 space");
	assert.equal(y.units(game, "Anti-Missile Turret"), 1, "20 space");
	assert.equal(y.units(game, "Heavy Laser"), 3, "41 space: a unit per 20, rounded up");
	assert.equal(y.units(game, "Odd Box"), 1, "no space: still one unit");
	assert.deepEqual([...y.materials(1, 3)], [6, 0, 0]);
	assert.deepEqual([...y.materials(2, 3)], [9, 3, 0]);
	assert.deepEqual([...y.materials(3, 3)], [12, 6, 1]);
	assert.equal(y.credits(game, "Heavy Laser", 1), 1250);
	assert.equal(y.credits(game, "Heavy Laser", 2), 2500);
	assert.equal(y.credits(game, "Heavy Laser", 3), 3750);
});

test("the refinery takes whole batches from hold and storage and leaves the rest raw", { skip }, () => {
	const { game, mod } = yard({ cargo: { "Shoal Glass": 25, "Warden Core": 7 }, storage: { "Shoal Glass": 10 } });
	mod.on_planet_button(game);
	assert.equal(game.panel.title, "Breakers' Yard");
	assert.deepEqual(game.panel.buttons, ["Refine glass", "Refine cores", "Cast lampreys", "Leave"]);
	assert.match(game.panel.text, /Shoal Glass: 35/);
	pressLabel(game, mod, "Refine glass");
	assert.equal(cargoOf(game, RSG), 3);
	assert.equal(cargoOf(game, "Shoal Glass") + storedOf(game, "Shoal Glass"), 5, "the 5 left over stay raw");
	assert.match(game.panel.text, /refine 30 Shoal Glass into 3 Refined Shoal Glass/);
	pressLabel(game, mod, "Refine cores");
	assert.equal(cargoOf(game, RWC), 2);
	assert.equal(cargoOf(game, "Warden Core"), 1);
	assert.match(game.panel.text, /refine 6 Warden Cores into 2 Refined Warden Cores/);
	// Not enough for a batch: nothing moves.
	pressLabel(game, mod, "Refine glass");
	assert.equal(cargoOf(game, RSG), 3);
	assert.match(game.panel.text, /needs at least 10 Shoal Glass; you have 5/);
	assert.match(game.panel.text, /Refined Shoal Glass: 3/);
	pressLabel(game, mod, "Leave");
	assert.equal(game.panel, null);
	// Only at Breaker's Rest.
	const haven = yard({ planet: HAVEN, cargo: { "Shoal Glass": 25 } });
	haven.mod.on_planet_button(haven.game);
	assert.deepEqual(haven.game.panel.buttons, ["Leave"]);
	assert.equal(haven.mod.yard.refine(haven.game, 0), 0);
	assert.equal(cargoOf(haven.game, "Shoal Glass"), 25);
});

test("the yard lists the upgradable outfits on the player's ships, and upgrades one per click", { skip }, () => {
	const { game, mod } = yard({ cargo: { [RSG]: 10, [RWC]: 2 }, credits: 100000 });
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.columns, ["Outfit", "Ship", "Mark", "Next", "Cost", "Change"]);
	assert.deepEqual(game.panel.rows, [
		["D14-RN Shield Generator x2", "Flagship", "-", "Mk I", "2 glass, 1,000 cr", "shield generation 0.2 -> 0.22"],
		["Heavy Laser", "Flagship", "-", "Mk I", "6 glass, 1,250 cr", "shield damage 1.7 -> 1.87"],
		["Anti-Missile Turret", "Escort", "-", "Mk I", "2 glass, 1,000 cr", "anti-missile 5 -> 5.5"],
	]);
	mod.on_panel_row(game, 0);
	assert.equal(game.confirms.at(-1).text, "Upgrade one D14-RN Shield Generator on Flagship to D14-RN Shield Generator Mk I? It costs 2 Refined Shoal Glass and 1,000 credits. (shield generation 0.2 -> 0.22)");
	mod.on_confirm(game, game.confirms.at(-1).token);
	const flag = game.fleet[0];
	assert.equal(flag.outfits["D14-RN Shield Generator"], 1);
	assert.equal(flag.outfits["D14-RN Shield Generator (Breakers Mk I)"], 1);
	assert.equal(cargoOf(game, RSG), 8);
	assert.equal(game.condition("credits"), 99000);
	assert.match(game.panel.text, /fit Flagship with the D14-RN Shield Generator Mk I/);
	assert.deepEqual(game.panel.rows.map((r) => r.slice(0, 4)), [
		["D14-RN Shield Generator", "Flagship", "-", "Mk I"],
		["D14-RN Shield Generator Mk I", "Flagship", "Mk I", "Mk II"],
		["Heavy Laser", "Flagship", "-", "Mk I"],
		["Anti-Missile Turret", "Escort", "-", "Mk I"],
	]);
	// Mk I to Mk II: cores too, and the variant is again of the original.
	assert.equal(row(game, 1)[4], "3 glass, 1 core, 2,000 cr");
	assert.equal(row(game, 1)[5], "shield generation 0.22 -> 0.244");
	mod.on_panel_row(game, 1);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(flag.outfits["D14-RN Shield Generator (Breakers Mk II)"], 1);
	assert.equal(flag.outfits["D14-RN Shield Generator (Breakers Mk I)"], undefined);
	assert.equal(game.definitions.get("outfit\u0000D14-RN Shield Generator (Breakers Mk II)").base, "D14-RN Shield Generator");
	assert.equal(cargoOf(game, RSG), 5);
	assert.equal(cargoOf(game, RWC), 1);
	assert.equal(game.condition("credits"), 97000);
	// Mk III needs Deep Lattice: no confirm, and the screen says what is missing.
	const confirms = game.confirms.length;
	const mk2 = game.panel.rows.findIndex((r) => r[0] === "D14-RN Shield Generator Mk II");
	mod.on_panel_row(game, mk2);
	assert.equal(game.confirms.length, confirms);
	assert.match(game.panel.text, /You need 2 Refined Warden Cores for that/);
	game.outfitCargo.set(RWC, 2);
	mod.on_panel_row(game, mk2);
	assert.match(game.panel.text, /You need 1 Deep Lattice/);
	game.outfitStorage.get(OUTPOST).set(DL, 1);
	mod.on_panel_row(game, mk2);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(flag.outfits["D14-RN Shield Generator (Breakers Mk III)"], 1);
	assert.equal(storedOf(game, DL), 0, "taken from storage");
	assert.equal(game.condition("credits"), 94000);
	const mk3 = game.panel.rows.findIndex((r) => r[0] === "D14-RN Shield Generator Mk III");
	assert.deepEqual(game.panel.rows[mk3].slice(2), ["Mk III", "max", "-", "fully upgraded"]);
	mod.on_panel_row(game, mk3);
	assert.match(game.panel.text, /as good as the Breakers can make it/);
});

test("an upgrade is checked before anything is taken, and a failed fitting gives everything back", { skip }, () => {
	const { game, mod } = yard({ cargo: { [RSG]: 2 }, credits: 999 });
	mod.on_planet_button(game);
	mod.on_panel_row(game, 0);
	assert.equal(game.confirms.length, 0);
	assert.match(game.panel.text, /You need 1,000 credits/);
	game.set_condition("credits", 5000);
	mod.on_panel_row(game, 0);
	// The ship is elsewhere (or full): nothing replaced, materials back, nothing paid.
	game.ship_replace_outfit = () => 0;
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(cargoOf(game, RSG), 2);
	assert.equal(game.condition("credits"), 5000);
	assert.equal(game.fleet[0].outfits["D14-RN Shield Generator"], 2);
	assert.match(game.panel.text, /could not fit .*Nothing was charged/);
	// Materials that cannot be taken after the check: nothing replaced, nothing charged.
	delete game.ship_replace_outfit;
	game.outfit_take = () => 0;
	mod.on_panel_row(game, 0);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.fleet[0].outfits["D14-RN Shield Generator"], 2);
	assert.equal(game.condition("credits"), 5000);
});

test("integrated outfits, and outfits of no upgradable kind, are not offered", { skip }, () => {
	const fleet = [{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "D14-RN Shield Generator": 2, "Hyperdrive": 1, "Cargo Expansion": 1 }, integrated: { "D14-RN Shield Generator": 1 } }];
	const { game, mod } = yard({ fleet });
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows.map((r) => r[0]), ["D14-RN Shield Generator"], "one of the two is integrated");
	game.fleet[0].integrated["D14-RN Shield Generator"] = 2;
	mod.on_planet_button(game);
	assert.equal(game.panel.rows, undefined);
	assert.match(game.panel.text, /Nothing installed on your ships here can be upgraded/);
});

test("the Shoal's own lines go to their authored next mark, priced like stock gear of their size", { skip }, () => {
	const fleet = [{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "Tidecutter Mk I": 1, "Glassweave Shield Mk II": 1 } }];
	const { game, mod } = yard({ fleet, cargo: { [RSG]: 20, [RWC]: 5, [DL]: 1 }, credits: 2000000 });
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows, [
		["Glassweave Shield Mk II", "Flagship", "Mk II", "Mk III", "8 glass, 4 core, 1 lattice, 36,000 cr", "shield generation 1.3 -> 1.8"],
		["Tidecutter Mk I", "Flagship", "Mk I", "Mk II", "3 glass, 1 core, 24,000 cr", "as the Breakers build it"],
	]);
	mod.on_panel_row(game, 1);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.fleet[0].outfits["Tidecutter Mk II"], 1);
	assert.equal(game.fleet[0].outfits["Tidecutter Mk I"], undefined);
	assert.equal(game.definitions.size, 0, "no variant: the line's marks are authored");
	assert.equal(cargoOf(game, RSG), 17);
	assert.equal(cargoOf(game, RWC), 4);
	assert.equal(game.condition("credits"), 1976000);
	mod.on_panel_row(game, 0);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.fleet[0].outfits["Glassweave Shield Mk III"], 1);
	assert.equal(cargoOf(game, RSG), 9, "30 space: two units");
	assert.equal(cargoOf(game, RWC), 0);
	assert.equal(cargoOf(game, DL), 0);
	assert.equal(game.condition("credits"), 1940000);
});

test("on an API 10 game the yard explains the refinery jobs and offers no upgrades", { skip }, () => {
	const { game, mod } = yard({ features: API10, cargo: { "Shoal Glass": 30 } });
	assert.equal(game.condition("shoal: refinery jobs"), 1);
	assert.equal(game.planetButtonLabel, "Breakers' Yard");
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.buttons, ["Leave"]);
	assert.equal(game.panel.rows, undefined);
	assert.match(game.panel.text, /refining work on the job board/);
	assert.match(game.panel.text, /Upgrades need a newer game/);
	assert.equal(mod.yard.refine(game, 0), 0);
	assert.equal(cargoOf(game, "Shoal Glass"), 30);
});

// ---- Mod API 12: any installed outfit, read from the game ----

// The API 12 features taken away: an API 11 game, where the yard falls back to Catalog.
const API11 = [...new FakeGame({}).features].filter((f) => !/^call:(ship_outfit_kinds|ship_outfit_at|outfit_weapon_attribute|fleet_ship_planet|fleet_ship_system)$/.test(f) && f !== "ship_outfits");
// A plugin's outfits (no stock name, so not in Catalog), by attributes and weapon stats.
const PLUGIN_OUTFITS = {
	"Mirelight Shield Lattice": sys(30000, { "outfit space": -24, "shield generation": 0.5, "shield energy": 0.4 }),
	"Sleetgun": gun(40000, 18, {}, { "velocity": 10, "lifetime": 40, "reload": 20, "firing energy": 10, "firing heat": 20,
		"shield damage": 30, "hull damage": 20, "disabled damage": 10, "ion damage": 4, "relative shield damage": 0.01, "hit force": 50 }),
	"Cluster Popper": gun(30000, 10, {}, { "velocity": 10, "lifetime": 20, "reload": 60, "shield damage": 100 }),
};
function yard12(options = {}) {
	const made = yard({ ...options });
	Object.assign(made.game.outfits, PLUGIN_OUTFITS);
	return made;
}
// Another mod's runtime outfits, defined in this game by that mod.
function defineAs(game, mod, name, base, changes) {
	const own = game.modName;
	game.modName = mod;
	assert.equal(game.define_outfit_variant(name, base, changes), true, name);
	game.modName = own;
}

test("API 12: a plugin outfit the catalog does not know is listed and upgraded", { skip }, () => {
	const fleet = [{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "Mirelight Shield Lattice": 1, "Sleetgun": 2, "Hyperdrive": 1 } }];
	const { game, mod } = yard12({ fleet, cargo: { [RSG]: 10 }, credits: 100000 });
	assert.ok(!mod.yard.catalog.names.includes("Mirelight Shield Lattice") && !mod.yard.catalog.names.includes("Sleetgun"));
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows, [
		["Mirelight Shield Lattice", "Flagship", "-", "Mk I", "4 glass, 1,500 cr", "shield generation 0.5 -> 0.55"],
		["Sleetgun x2", "Flagship", "-", "Mk I", "2 glass, 2,000 cr", "shield damage 30 -> 33"],
	]);
	mod.on_panel_row(game, 0);
	mod.on_confirm(game, game.confirms.at(-1).token);
	const flag = game.fleet[0];
	assert.equal(flag.outfits["Mirelight Shield Lattice"], undefined);
	assert.equal(flag.outfits["Mirelight Shield Lattice (Breakers Mk I)"], 1);
	assert.equal(game.outfit_attribute("Mirelight Shield Lattice (Breakers Mk I)", "shield generation"), 0.55);
	assert.equal(game.outfit_attribute("Mirelight Shield Lattice (Breakers Mk I)", "shield energy"), 0.416);
	assert.equal(cargoOf(game, RSG), 6);
	assert.equal(game.condition("credits"), 98500);
	const sleet = game.panel.rows.findIndex((r) => r[0] === "Sleetgun x2");
	mod.on_panel_row(game, sleet);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(flag.outfits["Sleetgun"], 1);
	assert.equal(flag.outfits["Sleetgun (Breakers Mk I)"], 1);
	// The new mark is listed again from what is installed, and goes on to Mk II.
	assert.deepEqual(game.panel.rows.map((r) => r.slice(0, 4)), [
		["Mirelight Shield Lattice Mk I", "Flagship", "Mk I", "Mk II"],
		["Sleetgun", "Flagship", "-", "Mk I"],
		["Sleetgun Mk I", "Flagship", "Mk I", "Mk II"],
	]);
});

test("API 12: a weapon's damage of every type is scaled from outfit_weapon_attribute", { skip }, () => {
	const { game, mod } = yard12();
	const y = mod.yard;
	assert.equal(y.classify(game, "Sleetgun"), "gun");
	assert.equal(y.changes(game, "Sleetgun", 0, 3), [
		"\"display name\" \"Sleetgun Mk III\"", "cost 54000", "weapon",
		"\t\"disabled damage\" 13.5", "\t\"firing energy\" 11.2", "\t\"firing heat\" 22.4", "\t\"hull damage\" 27",
		"\t\"ion damage\" 5.4", "\t\"minable damage\" 27", "\t\"relative shield damage\" 0.0135", "\t\"shield damage\" 40.5", "",
	].join("\n"));
	assert.equal(y.define_mark(game, "Sleetgun", 0, 3), true);
	const mk3 = "Sleetgun (Breakers Mk III)";
	for (const [key, value] of [["shield damage", 40.5], ["hull damage", 27], ["disabled damage", 13.5], ["ion damage", 5.4], ["firing energy", 11.2], ["firing heat", 22.4]])
		assert.ok(Math.abs(game.outfit_weapon_attribute(mk3, key) - value) < 1e-9, key);
	// What is not damage, anti-missile or a firing cost stays.
	for (const key of ["reload", "velocity", "lifetime", "hit force", "range"])
		assert.equal(game.outfit_weapon_attribute(mk3, key), game.outfit_weapon_attribute("Sleetgun", key), key);
	// A weapon whose damage comes partly from submunitions (its range is longer
	// than its own flight) is refused: the game answers their damage with its own.
	const answer = game.outfit_weapon_attribute.bind(game);
	game.outfit_weapon_attribute = (o, k) => (o === "Cluster Popper" && k === "range" ? 900 : answer(o, k));
	assert.match(y.refusal(game, "Cluster Popper"), /submunitions/);
	game.outfit_weapon_attribute = (o, k) => (o === "Cluster Popper" && k === "range" ? 900 : o === "Cluster Popper" && k === "exclude submunition damage" ? 1 : answer(o, k));
	assert.equal(y.classify(game, "Cluster Popper"), "gun", "its damage is its own when it excludes the submunitions'");
});

test("API 12: another mod's runtime outfit is upgraded, with it as every mark's base", { skip }, () => {
	const fleet = [{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "Hyperdrive": 1 } }];
	const { game, mod } = yard12({ fleet, cargo: { [RSG]: 20, [RWC]: 5 }, credits: 100000 });
	defineAs(game, "forge", "Forged Shield", "D14-RN Shield Generator", "\"display name\" \"Forged Shield\"\n\"shield generation\" 0.6\ncost 30000\n");
	defineAs(game, "forge", "Forged Laser", "Heavy Laser", "\"display name\" \"Forged Laser\"\nweapon\n\t\"shield damage\" 3\n");
	game.fleet[0].outfits["Forged Shield"] = 1;
	game.fleet[0].outfits["Forged Laser"] = 1;
	assert.equal(game.defined("outfit", "Forged Shield"), 2);
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows, [
		["Forged Laser", "Flagship", "-", "Mk I", "6 glass, 1,250 cr", "shield damage 3 -> 3.3"],
		["Forged Shield", "Flagship", "-", "Mk I", "2 glass, 1,500 cr", "shield generation 0.6 -> 0.66"],
	]);
	for (const mark of ["I", "II"]) {
		const k = game.panel.rows.findIndex((r) => r[0].startsWith("Forged Shield"));
		mod.on_panel_row(game, k);
		mod.on_confirm(game, game.confirms.at(-1).token);
		const name = `Forged Shield (Breakers Mk ${mark})`;
		assert.equal(game.fleet[0].outfits[name], 1, name);
		assert.equal(game.definitions.get("outfit\u0000" + name).base, "Forged Shield", "the other mod's outfit is the base");
		assert.equal(game.definitions.get("outfit\u0000" + name).mod, game.modName);
	}
	assert.equal(game.outfit_attribute("Forged Shield (Breakers Mk II)", "shield generation"), 0.732);
	assert.equal(game.outfit_name("Forged Shield (Breakers Mk II)"), "Forged Shield Mk II");
	assert.equal(game.fleet[0].outfits["Forged Shield (Breakers Mk I)"], undefined);
	const laser = game.panel.rows.findIndex((r) => r[0] === "Forged Laser");
	mod.on_panel_row(game, laser);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.fleet[0].outfits["Forged Laser (Breakers Mk I)"], 1);
	assert.ok(Math.abs(game.outfit_weapon_attribute("Forged Laser (Breakers Mk I)", "shield damage") - 3.3) < 1e-9);
	// A yard mark this release does not make, or of an outfit the game no longer knows, is left alone.
	game.outfits["Forged Shield (Breakers Mk IV)"] = { ...game.outfits["Forged Shield"] };
	game.outfits["Gone Shield (Breakers Mk I)"] = { ...game.outfits["Forged Shield"] };
	game.fleet[0].outfits["Forged Shield (Breakers Mk IV)"] = 1;
	game.fleet[0].outfits["Gone Shield (Breakers Mk I)"] = 1;
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows.map((r) => r[0]), ["Forged Laser Mk I", "Forged Shield Mk II"]);
});

test("API 12: only ships on this planet are listed, landed with the player or parked here", { skip }, () => {
	const fleet = [
		{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "Sleetgun": 1 } },
		{ uuid: ESCORT, name: "Haven Hulk", model: "Shuttle", outfits: { "D14-RN Shield Generator": 1 }, parked: true, system: "Arneb", planet: HAVEN },
		{ uuid: "00000000-0000-4000-8000-000000000003", name: "Drifter", model: "Shuttle", outfits: { "LP036a Battery Pack": 1 }, system: SHOAL, planet: "" },
		{ uuid: "00000000-0000-4000-8000-000000000004", name: "Dock Queen", model: "Shuttle", outfits: { "X1700 Ion Thruster": 1 }, parked: true, system: SHOAL, planet: OUTPOST },
	];
	const { game, mod } = yard12({ fleet, cargo: { [RSG]: 10 } });
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows.map((r) => [r[0], r[1]]), [["Sleetgun", "Flagship"], ["X1700 Ion Thruster", "Dock Queen"]]);
	// At Haven, only the ship parked there.
	game.planet_ = HAVEN;
	game.here_ = "Arneb";
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows.map((r) => [r[0], r[1]]), [["Sleetgun", "Flagship"], ["D14-RN Shield Generator", "Haven Hulk"]]);
});

test("API 11 fallback: without ship_outfit_kinds the yard upgrades Catalog's stock outfits only", { skip }, () => {
	const fleet = [{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "Heavy Laser": 1, "Mirelight Shield Lattice": 1, "Borrowed Shield": 1, "D14-RN Shield Generator": 1 } }];
	const { game, mod } = yard12({ features: API11, fleet, cargo: { [RSG]: 10 }, credits: 100000,
		definitions: [{ kind: "outfit", name: "Borrowed Shield", mod: "another mod", base: "D14-RN Shield Generator", changes: "" }] });
	// Catalog's stats, not the game's: the game's would answer these differently.
	game.outfits["Heavy Laser"] = { ...game.outfits["Heavy Laser"], weaponStats: { "shield damage": 99 } };
	assert.equal(mod.yard.can_upgrade, true);
	assert.equal(mod.yard.can_list, false);
	assert.match(mod.yard.refusal(game, "Borrowed Shield"), /mod/);
	assert.equal(mod.yard.changes(game, "Heavy Laser", 0, 1),
		"\"display name\" \"Heavy Laser Mk I\"\ncost 27500\nweapon\n\t\"firing energy\" 1.3832\n\t\"firing heat\" 2.912\n\t\"hull damage\" 2.64\n\t\"shield damage\" 1.87\n");
	mod.on_planet_button(game);
	assert.deepEqual(game.panel.rows, [
		["D14-RN Shield Generator", "Flagship", "-", "Mk I", "2 glass, 1,000 cr", "shield generation 0.2 -> 0.22"],
		["Heavy Laser", "Flagship", "-", "Mk I", "6 glass, 1,250 cr", "shield damage 1.7 -> 1.87"],
	]);
	mod.on_panel_row(game, 1);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.fleet[0].outfits["Heavy Laser (Breakers Mk I)"], 1);
	assert.equal(game.definitions.get("outfit\u0000Heavy Laser (Breakers Mk I)").base, "Heavy Laser");
	assert.equal(cargoOf(game, RSG), 4);
	assert.equal(game.condition("credits"), 98750);
	assert.deepEqual(game.panel.rows.map((r) => r.slice(0, 4)), [
		["D14-RN Shield Generator", "Flagship", "-", "Mk I"],
		["Heavy Laser Mk I", "Flagship", "Mk I", "Mk II"],
	]);
});

// ---- Restless wrecks ----

const RESTLESS_FLEETS = FLEETS;
const GOVERNMENTS = ["Shoal Warden", "Shoal Drowned", "Breakers", "Pirate"];
const restlessSpawns = (game) => game.spawned.filter((s) => s.tag.startsWith("shoal.restless."));
// A disabled drowned hull of a restless spawn, at a distance from the flagship (at 0, 0).
function drowned(game, tag, x, name = "Drowned Falcon (Restless)") {
	game.ships.push({ name, model: "Drowned Falcon", player: false, hull: 0, maxHull: 4000, shields: 0, maxShields: 0, energy: 0, fuel: 0, government: "Shoal Drowned", strength: 1e6, tag, x, y: 0 });
	return game.ships.length - 1;
}

test("restless wrecks: placed with a deep system's wrecks, and one more at heat 25 and 50", { skip }, () => {
	const { game, mod } = setup({ fleets: RESTLESS_FLEETS, governments: GOVERNMENTS });
	dive(game, mod);
	fly(game, mod, 1);
	assert.deepEqual(restlessSpawns(game), [{ fleet: "Shoal Restless Wrecks", government: "", tag: "shoal.restless.1.", arrive: false }]);
	flyTo(game, mod, 25);
	fly(game, mod, 1);
	assert.deepEqual(restlessSpawns(game).map((s) => s.tag), ["shoal.restless.1.", "shoal.restless.2."]);
	flyTo(game, mod, 50);
	fly(game, mod, 2);
	assert.deepEqual(restlessSpawns(game).map((s) => s.tag), ["shoal.restless.1.", "shoal.restless.2.", "shoal.restless.3."]);
	assert.ok(restlessSpawns(game).every((s) => !s.arrive));
	// Deeper systems hold more of them; the tags start again in each system.
	jump(game, mod, ABYSS);
	fly(game, mod, 1);
	assert.deepEqual(restlessSpawns(game).slice(3).map((s) => s.tag), ["shoal.restless.1.", "shoal.restless.2.", "shoal.restless.3."]);
	// The heat-scheduled ones are not due again this run; a new run starts over.
	fly(game, mod, 30);
	assert.equal(restlessSpawns(game).length, 6);
	surface(game, mod);
	laterWeek(game);
	const mark = game.spawned.length;
	dive(game, mod);
	fly(game, mod, 1);
	assert.deepEqual(game.spawned.slice(mark).filter((s) => s.fleet === "Shoal Restless Wrecks").map((s) => s.tag), ["shoal.restless.1."]);
});

test("restless wrecks near the flagship are rolled for once per spawn, and wake together", { skip }, () => {
	const { game, mod } = setup({ fleets: RESTLESS_FLEETS, governments: GOVERNMENTS });
	dive(game, mod);
	fly(game, mod, 1);
	const far = drowned(game, "shoal.restless.1.", 900);
	const near = drowned(game, "shoal.restless.1.", 1600);
	const other = drowned(game, "shoal.wreck.seed.1.", 100, "Drowned Falcon (Rich)");
	let rolls = 0;
	mod.roll = () => { rolls++; return 0.9; };
	fly(game, mod, 2);
	assert.equal(rolls, 0, "nothing within 700 yet; an ordinary wreck is never rolled for");
	game.ships[far].x = 650;
	fly(game, mod, 1);
	assert.equal(rolls, 1);
	assert.deepEqual([...mod.run.rolled], ["shoal.restless.1."]);
	assert.ok(game.is_disabled(far), "a miss: it sleeps on");
	fly(game, mod, 5);
	assert.equal(rolls, 1, "rolled once only");
	// A second spawn, rolled for when it comes near, and hit.
	const a = drowned(game, "shoal.restless.2.", 300);
	const b = drowned(game, "shoal.restless.2.", 2500);
	mod.roll = () => { rolls++; return 0.5; };
	const before = mod.run.heat;
	fly(game, mod, 1);
	assert.equal(rolls, 2);
	for (const i of [a, b]) {
		assert.equal(game.is_disabled(i), false, "every ship of the spawn wakes");
		assert.equal(game.ships[i].government, "Shoal Warden");
		assert.deepEqual(game.ships[i].personality, ["heroic", "staying"]);
	}
	assert.ok(game.is_disabled(near) && game.is_disabled(other));
	assert.equal(game.messages.at(-1), "The drowned hull shudders. Its reactor lights.");
	assert.ok(Math.abs(mod.run.heat - (before + 3 + 1 / 6 * 1.0)) < 1e-6, "+3 heat");
	assert.deepEqual([...mod.run.woken], ["shoal.restless.2."]);
	// The roll and what woke outlast a save.
	const copy = new Shoal().run;
	copy.decode(mod.run.encode());
	assert.deepEqual([...copy.rolled], ["shoal.restless.1.", "shoal.restless.2."]);
	assert.deepEqual([...copy.woken], ["shoal.restless.2."]);
	assert.equal(copy.restless, mod.run.restless);
	// Another system's hulls are other ships: the rolls start again there.
	jump(game, mod, SHALLOW2);
	assert.deepEqual([...mod.run.rolled], []);
	assert.deepEqual([...mod.run.woken], []);
});

test("restless wrecks are likelier to wake above heat 50, and their kills count once awake", { skip }, () => {
	const { game, mod } = setup({ fleets: RESTLESS_FLEETS, governments: GOVERNMENTS });
	dive(game, mod);
	fly(game, mod, 1);
	drowned(game, "shoal.restless.1.", 100);
	mod.roll = () => 0.6;
	fly(game, mod, 1);
	assert.deepEqual([...mod.run.woken], [], "0.6 misses 55%");
	// A sleeping restless wreck shot to pieces adds nothing.
	let heat = mod.run.heat;
	game.kills.set("shoal.restless.1.", 1);
	fly(game, mod, 1);
	assert.ok(Math.abs(mod.run.heat - heat - 1 / 6) < 1e-6);
	flyTo(game, mod, 50.5);
	drowned(game, "shoal.restless.2.", 100);
	fly(game, mod, 1);
	assert.deepEqual([...mod.run.woken], ["shoal.restless.2."], "0.6 hits 70%");
	heat = mod.run.heat;
	game.kills.set("shoal.restless.2.", 2);
	fly(game, mod, 1);
	assert.ok(mod.run.heat - heat >= 4, "2 kills of woken wrecks: +4 heat");
});

test("without ship_reactivate or ship_distance no restless wrecks are spawned", { skip }, () => {
	for (const missing of ["call:ship_reactivate", "call:ship_distance"]) {
		const features = [...new FakeGame({}).features].filter((f) => f !== missing);
		const { game, mod } = setup({ fleets: RESTLESS_FLEETS, features });
		jump(game, mod, REST);
		fly(game, mod, 2);
		jump(game, mod, HUB);
		jump(game, mod, ABYSS);
		fly(game, mod, 200);
		assert.deepEqual(restlessSpawns(game), [], missing);
		assert.ok(game.spawned.some((s) => s.fleet === "Shoal Rest Wrecks"), "the derelicts are still there");
	}
	const { game, mod } = setup({ fleets: RESTLESS_FLEETS, features: API10 });
	dive(game, mod);
	fly(game, mod, 200);
	assert.deepEqual(restlessSpawns(game), []);
});

test("restless wrecks at Breakers' Rest wake as in the Deep, but add no heat and start no run", { skip }, () => {
	const { game, mod } = setup({ fleets: RESTLESS_FLEETS, governments: GOVERNMENTS });
	mod.roll = () => 0.99;
	jump(game, mod, REST);
	fly(game, mod, 1);
	assert.equal(restlessSpawns(game).length, 4);
	const i = drowned(game, "shoal.restless.3.", 200, "Drowned Osprey (Restless)");
	mod.roll = () => 0.5;
	fly(game, mod, 1);
	assert.equal(game.is_disabled(i), false);
	assert.equal(game.messages.at(-1), "The drowned hull shudders. Its reactor lights.");
	assert.equal(mod.run.active, false);
	assert.equal(mod.run.heat, 0);
	game.kills.set("shoal.restless.3.", 1);
	fly(game, mod, 1);
	assert.equal(mod.run.heat, 0);
	assert.equal(game.kills.get("shoal.restless.3."), 0, "read and dropped");
});

test("the Driftnet Ramscoop goes up its authored marks at the yard, though no stock kind is a ramscoop", { skip }, () => {
	const fleet = [{ uuid: FLAG, name: "Flagship", model: "Sparrow", outfits: { "Driftnet Ramscoop Mk I": 1 } }];
	const { game, mod } = yard({ fleet, cargo: { [RSG]: 20, [RWC]: 5, [DL]: 1 }, credits: 2000000 });
	mod.on_planet_button(game);
	assert.equal(game.panel.rows.length, 1);
	assert.deepEqual(game.panel.rows[0].slice(0, 4), ["Driftnet Ramscoop Mk I", "Flagship", "Mk I", "Mk II"]);
	mod.on_panel_row(game, 0);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.fleet[0].outfits["Driftnet Ramscoop Mk II"], 1);
	mod.on_planet_button(game);
	mod.on_panel_row(game, 0);
	mod.on_confirm(game, game.confirms.at(-1).token);
	assert.equal(game.fleet[0].outfits["Driftnet Ramscoop Mk III"], 1);
	assert.equal(game.definitions.size, 0, "authored marks: no variants");
});

test("the map's word for the Shoal follows the heat in flight", { skip }, () => {
	const { game, mod } = setup();
	dive(game, mod);
	fly(game, mod, 1);
	const word = () => game.map.filter((m) => m.detail === "~The Shoal").at(-1)?.text.match(/The Shoal is (\w+)/)?.[1];
	assert.equal(word(), "calm");
	flyTo(game, mod, 40);
	fly(game, mod, 1);
	assert.notEqual(word(), "calm", "redrawn without landing or jumping");
});

test("the refinery casts as many Glass Lampreys as asked, from the hold and storage, into the hold", { skip }, () => {
	const { game, mod } = yard({ cargo: { "Shoal Glass": 25 }, storage: { "Shoal Glass": 10 } });
	mod.on_planet_button(game);
	pressLabel(game, mod, "Cast lampreys");
	const ask = game.numberAsks.at(-1);
	assert.ok(ask, "it asks how many");
	assert.equal(ask.most, 35, "up to all the glass here");
	mod.on_number(game, ask.token, 30);
	assert.equal(cargoOf(game, "Glass Lamprey"), 30);
	assert.equal(cargoOf(game, "Shoal Glass") + storedOf(game, "Shoal Glass"), 5, "one glass each");
	assert.match(game.panel.text, /cast 30 Glass Lampreys from 30 Shoal Glass/);
	// Nothing to cast from: a note, no dialog.
	const none = yard({ cargo: {} });
	none.mod.on_planet_button(none.game);
	pressLabel(none.game, none.mod, "Cast lampreys");
	assert.equal(none.game.numberAsks.length, 0);
	assert.match(none.game.panel.text, /you have none here/);
});
