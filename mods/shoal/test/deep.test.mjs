// The Deep's data (DESIGN.md section 22), read straight from the plugin's
// data and the generated src/Deep.dados (tools/deep/gen.py writes both): the
// code's table matches the map, depth is jumps from the hub, the region is
// joined to the charted map only by the two wormholes, Breakers' Haven is the
// only place to land, and every Breakers' job sends the player to a deep
// system of its depth band. Needs no Dado toolchain: `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MOD = join(dirname(fileURLToPath(import.meta.url)), "..");
const REST = "~The Shoal", OUTPOST = "Breaker's Rest";

// A small reader of the game's data format: nodes of tokens with children.
function tokens(line) {
	const out = [];
	let i = 0;
	while (i < line.length) {
		const c = line[i];
		if (c === " " || c === "\t") { i++; continue; }
		if (c === "#") break;
		if (c === '"' || c === "`") {
			const j = line.indexOf(c, i + 1);
			out.push(line.slice(i + 1, j));
			i = j + 1;
		} else {
			let j = i;
			while (j < line.length && line[j] !== " " && line[j] !== "\t") j++;
			out.push(line.slice(i, j));
			i = j;
		}
	}
	return out;
}
function parse(text) {
	const roots = [], stack = [];
	for (const raw of text.split("\n")) {
		if (!raw.trim() || raw.trim().startsWith("#")) continue;
		const depth = raw.length - raw.replace(/^\t+/, "").length;
		const node = { t: tokens(raw), c: [] };
		if (!node.t.length) continue;
		while (stack.length && stack.at(-1).depth >= depth) stack.pop();
		(stack.length ? stack.at(-1).node.c : roots).push(node);
		stack.push({ depth, node });
	}
	return roots;
}
const DATA = join(MOD, "data");
const roots = readdirSync(DATA).filter((f) => f.endsWith(".txt")).flatMap((f) => parse(readFileSync(join(DATA, f), "utf8")).map((n) => ({ ...n, file: f })));
const of = (kind) => new Map(roots.filter((n) => n.t[0] === kind && n.t.length === 2).map((n) => [n.t[1], n]));
const systems = of("system"), planets = of("planet"), fleets = of("fleet"), wormholes = of("wormhole"), hazards = of("hazard");
const kids = (n, key) => n.c.filter((c) => c.t[0] === key);
const val = (n, key) => kids(n, key)[0]?.t[1];

// The code's table, from the generated DadoScript.
const deepSrc = readFileSync(join(MOD, "src", "Deep.dados"), "utf8");
const field = (name) => JSON.parse(deepSrc.match(new RegExp(`^\\S+ ${name} = (.*)$`, "m"))[1]);
const HUB = field("hub"), NAMES = field("names"), SYSTEMS = field("systems"), DEPTHS = field("depths"), TIER_OF_DEPTH = field("tier_of_depth");
const RESIDENTS = field("residents"), SEED_WRECKS = field("seed_wrecks"), SUFFIX = field("fleet_suffix");
const depthOf = new Map(SYSTEMS.map((s, k) => [s, DEPTHS[k]]));
const tierOf = (s) => TIER_OF_DEPTH[Math.min(depthOf.get(s), TIER_OF_DEPTH.length - 1)];

test("the code's table is the map: every deep system, its name and depth, and depth is jumps from the hub", () => {
	assert.equal(SYSTEMS.length, 40);
	const deep = [...systems.keys()].filter((s) => s.startsWith("~~"));
	assert.deepEqual([...deep].sort(), [...SYSTEMS].sort());
	for (const [k, s] of SYSTEMS.entries()) {
		const sys = systems.get(s);
		assert.equal(val(sys, "display name"), NAMES[k]);
		const attrs = kids(sys, "attributes").flatMap((a) => a.t.slice(1));
		assert.ok(attrs.includes(`shoal depth ${DEPTHS[k]}`), s);
		assert.ok(attrs.includes(`shoal tier ${tierOf(s)}`), s);
		assert.ok(s > REST, `${s} sorts after every stock system and ${REST}`);
		assert.equal(val(sys, "government"), "Uninhabited", "no human government: Corporations and Diplomacy leave it alone");
	}
	// Breadth-first from the hub over the lanes.
	const seen = new Map([[HUB, 0]]), queue = [HUB];
	while (queue.length) {
		const s = queue.shift();
		for (const l of kids(systems.get(s), "link")) {
			const o = l.t[1];
			assert.ok(depthOf.has(o), `${s} links to ${o}, outside the Deep`);
			assert.ok(kids(systems.get(o), "link").some((b) => b.t[1] === s), `${s} <-> ${o} both ways`);
			if (!seen.has(o)) { seen.set(o, seen.get(s) + 1); queue.push(o); }
		}
	}
	for (const s of SYSTEMS) assert.equal(seen.get(s), depthOf.get(s), s);
	// Four bands of depth below the hub.
	const tiers = [0, 0, 0, 0, 0];
	for (const s of SYSTEMS) tiers[tierOf(s)]++;
	assert.deepEqual(tiers, [1, 10, 12, 11, 6]);
});

test("the Deep is joined to the charted map only by the Maw (down) and the Upwell (up)", () => {
	for (const [name, sys] of systems) {
		if (depthOf.has(name)) continue;
		for (const l of kids(sys, "link")) assert.ok(!depthOf.has(l.t[1]), `${name} links into the Deep`);
	}
	assert.deepEqual(kids(wormholes.get("The Maw"), "link").map((l) => l.t.slice(1)), [[REST, HUB]]);
	assert.deepEqual(kids(wormholes.get("The Upwell"), "link").map((l) => l.t.slice(1)), [[HUB, REST]]);
	const objects = (s) => kids(systems.get(s), "object").map((o) => o.t[1]).filter(Boolean);
	assert.ok(objects(REST).includes("The Maw"));
	assert.ok(objects(HUB).includes("The Upwell"));
	// The Maw is at the centre of Breakers' Rest, with a black hole.
	const rest = systems.get(REST);
	const maw = kids(rest, "object").find((o) => o.t[1] === "The Maw");
	assert.equal(val(maw, "distance"), undefined, "at the centre");
	assert.ok(kids(rest, "object").some((o) => /black-hole|black hole/.test(val(o, "sprite") ?? "")));
	assert.equal(val(rest, "display name"), "Breakers' Rest");
	// No wormhole of the stock game reaches it either, and the region has its own map background.
	assert.ok(roots.some((n) => n.t[0] === "galaxy" && n.t[1] === "The Shoal"));
	// Far off the charted map.
	const [x, y] = kids(systems.get(HUB), "pos")[0].t.slice(1).map(Number);
	assert.ok(x < -2000 && y < -1000);
});

test("Breakers' Haven, in the hub, is the only place in the Deep to land: fuel, and nothing else", () => {
	const haven = planets.get("Breakers' Haven");
	assert.ok(haven);
	assert.ok(kids(systems.get(HUB), "object").some((o) => o.t[1] === "Breakers' Haven"));
	const port = kids(haven, "port")[0];
	assert.deepEqual(kids(port, "recharges").map((r) => r.t.slice(1)), [["fuel"]]);
	assert.equal(kids(port, "services").length, 0, "no trade, job board, bank or crew");
	for (const k of ["outfitter", "shipyard", "spaceport"]) assert.equal(kids(haven, k).length, 0, k);
	for (const s of SYSTEMS) {
		for (const o of kids(systems.get(s), "object")) {
			const p = o.t[1];
			if (!p || p === "Breakers' Haven" || p === "The Upwell") continue;
			const planet = planets.get(p);
			assert.ok(planet, p);
			assert.deepEqual(kids(planet, "to")[0]?.t, ["to", "land"], `${p} cannot be landed on`);
			assert.deepEqual(kids(kids(planet, "to")[0], "never").length, 1, p);
		}
	}
});

test("deeper systems have dimmer stars, weaker ramscoop yields and more hazards", () => {
	let last = null;
	for (let t = 0; t <= 4; t++) {
		const members = SYSTEMS.filter((s) => tierOf(s) === t);
		const scoop = Math.max(...members.map((s) => Number(val(kids(systems.get(s), "ramscoop")[0], "multiplier"))));
		const hz = Math.min(...members.map((s) => kids(systems.get(s), "hazard").length));
		for (const s of members) for (const h of kids(systems.get(s), "hazard")) assert.ok(hazards.has(h.t[1]), h.t[1]);
		if (last) assert.ok(hz >= last.hz, `tier ${t} hazards`);
		last = { scoop, hz };
	}
	assert.equal(kids(systems.get(HUB), "hazard").length, 0, "the hub is quiet");
	assert.ok(SYSTEMS.filter((s) => tierOf(s) === 4).every((s) => kids(systems.get(s), "hazard").length >= 3));
});

test("every warden fleet the code can ask for exists, for every tier", () => {
	const kinds = ["Shoal Warden Pickets", "Shoal Warden Hunters", "Shoal Warden Phalanx", "Shoal Undertow"];
	for (const kind of kinds) for (const suffix of SUFFIX) assert.ok(fleets.has(kind + suffix), kind + suffix);
	for (const list of RESIDENTS) for (const f of list) assert.ok(fleets.has(f), f);
	for (const list of SEED_WRECKS) for (const f of list) assert.ok(fleets.has(f), f);
	for (const f of ["Shoal Rest Wrecks", "Shoal Rest Restless", "Shoal Abyss Wreck", "Shoal Deep Wreck", "Shoal Restless Wrecks"]) assert.ok(fleets.has(f), f);
	// Tier variants are uncapturable like their hulls (a ship key the engine does not copy to variants).
	for (const n of roots.filter((n) => n.t[0] === "ship" && n.t.length === 3 && /^(Warden \w+|The Undertow) [234]$/.test(n.t[2])))
		assert.ok(n.c.some((c) => c.t[0] === "uncapturable"), n.t[2]);
});

test("the Breakers' jobs send the player into the Deep, to systems of their depth band, for more pay deeper down", () => {
	const jobs = roots.filter((n) => n.t[0] === "mission" && n.file === "shoal deep jobs.txt");
	assert.ok(jobs.length >= 60);
	const kinds = { "Lead Freighter": [1, 2], "Lead Warship": [2, 3], "Lead Deep": [3, 4], "Ambush At The Wrecks": [1, 2], "Silence The Hunter": [2, 3], "Tow Escort": [1] };
	const pay = {};
	for (const job of jobs) {
		const [, kind, name] = job.t[1].match(/^Shoal: (.+): (.+)$/);
		assert.ok(kind in kinds, kind);
		assert.equal(val(job, "source"), OUTPOST);
		assert.equal(val(job, "destination"), OUTPOST);
		const offer = kids(job, "to").find((t) => t.t[1] === "offer");
		const gates = offer.c.map((c) => c.t.join(" "));
		assert.ok(gates.includes("shoal: welcomed == 1"), job.t[1]);
		assert.ok(gates.some((g) => g.startsWith("days since epoch >= shoal: ")), job.t[1]);
		const targets = new Set(kids(job, "npc").map((n) => val(n, "system")));
		assert.equal(targets.size, 1, `${job.t[1]}: every npc in one system`);
		const [target] = targets;
		assert.ok(depthOf.has(target), `${job.t[1]} targets ${target}, a deep system`);
		assert.equal(NAMES[SYSTEMS.indexOf(target)], name);
		assert.ok(kinds[kind].includes(tierOf(target)), `${job.t[1]}: tier ${tierOf(target)}`);
		const accept = kids(job, "on").find((o) => o.t[1] === "accept");
		assert.ok(accept.c.some((c) => c.t[0] === "mark" && c.t[1] === target), "the target is marked on the map");
		for (const n of kids(job, "npc")) {
			const f = val(n, "fleet");
			if (f) assert.ok(fleets.has(f), f);
		}
		const complete = kids(job, "on").find((o) => o.t[1] === "complete");
		(pay[kind] ??= []).push([depthOf.get(target), Number(val(complete, "payment"))]);
	}
	for (const [kind, list] of Object.entries(pay)) {
		assert.ok(list.length > 0, kind);
		for (const [d1, p1] of list) for (const [d2, p2] of list) if (d1 < d2) assert.ok(p1 < p2, `${kind}: deeper pays more`);
	}
	// The old single jobs in Breakers' Rest are gone.
	for (const old of ["Shoal: Lead Freighter", "Shoal: Lead Warship", "Shoal: Lead Deep", "Shoal: Ambush At The Wrecks", "Shoal: Silence The Hunter", "Shoal: Tow Escort"])
		assert.ok(!roots.some((n) => n.t[0] === "mission" && n.t[1] === old), old);
});
