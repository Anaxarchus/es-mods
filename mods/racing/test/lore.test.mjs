// The staff's lore (Lore): a history of notable performances (told as lines,
// capped), fame (rising with feats and titles, fading each season, raising
// the ask, bounded in a team's value), permanent traits earned by beating
// expectations (their rules, their small bounded effects), determinism and
// saving, and saves from before lore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

// A world just past its first B League race (that race's Result is kept, and
// its pace ranks with it), and a team of that league with every seat filled.
function raced() {
	const { game, mod, w } = start(Racing);
	while (w().last[0].order.length === 0) days(mod, game, 1);
	const W = w();
	const r = W.last[0];
	const t = W.team(r.order[0]);
	return { game, mod, W, r, t };
}
// The race's result rewritten for one car: team t's #1 car at place k (0
// first) with a pace rank, a grid slot, a status, a setup and a stop.
function as(r, t, { k = 0, rank = 1, grid = 1, status = 0, setup = 0, stop = 3, points = 25, circuit } = {}) {
	const i = r.order.indexOf(t.id);
	for (const a of [r.order, r.pilots, r.cars]) [a[i], a[k]] = [a[k], a[i]];
	r.pilots[k] = t.seats[0];
	r.cars[k] = 0;
	r.ranks[k] = rank; r.grid[k] = grid; r.status[k] = status; r.setup_obs[k] = setup; r.stop_obs[k] = stop; r.points[k] = points;
	if (circuit !== undefined) r.circuit = circuit;
	r.fastest_team = 0;
	return k;
}
const circuitOfKind = (W, kind) => W.names.circuit_kinds.indexOf(kind);

test("a notable performance goes into the history, told as a line with the season, round and circuit", { skip }, () => {
	const { W, r, t } = raced();
	const L = W.lore;
	const pilot = W.seat(t, 0);
	pilot.notes = []; pilot.wins = 5; pilot.races = 30; pilot.fame = 0;
	const state = W.rng.state;
	const k = as(r, t, { rank: 6, grid: 7 });
	L.race(W, t, r, [k]);
	assert.equal(W.rng.state, state, "lore draws nothing from the world's dice");
	assert.equal(pilot.notes.length, 1);
	const line = L.lines(W, pilot)[0];
	assert.match(line, new RegExp(`^Season ${r.season}, round ${r.round + 1}, the ${W.names.circuit_titles[r.circuit]} \\(B League\\): won in only the 6th-fastest car, from P7 with ${t.name}\\.$`));
	// A plain race (a finish where the car's pace put it) is not notable.
	as(r, t, { k: 4, rank: 5, grid: 5, points: 10 });
	L.race(W, t, r, [4]);
	assert.equal(pilot.notes.length, 1);
	// A crash from the front row is, the other way.
	as(r, t, { k: 9, rank: 1, grid: 1, status: 2, points: 0 });
	L.race(W, t, r, [9]);
	assert.match(L.lines(W, pilot)[0], /crashed out from P1 on the grid\.$/);
	// A first win, a debut and a charge through the field.
	const other = W.seat(W.team(r.order[1]), 0);
	other.notes = []; other.wins = 1; other.races = 1;
	L.race(W, W.team(r.order[1]), r, [1]);
	const rookie = W.seat(W.team(r.order[2]), 0);
	rookie.notes = []; rookie.wins = 0; rookie.races = 1;
	const t2 = W.team(r.order[2]);
	as(r, t2, { k: 3, rank: 4, grid: 4, points: 12 });
	L.race(W, t2, r, [3]);
	assert.match(L.lines(W, rookie)[0], /P4 and points on debut/);
	rookie.races = 20;
	as(r, t2, { k: 2, rank: 3, grid: 12, points: 15 });
	L.race(W, t2, r, [2]);
	assert.match(L.lines(W, rookie)[0], /came through from P12 to P3/);
	// The crew have theirs: a quick stop, a setup.
	const pit = W.seat(t, 3), eng = W.seat(t, 1);
	pit.notes = []; eng.notes = [];
	as(r, t, { k: 5, rank: 6, grid: 6, stop: 2.2, setup: 0.0095, points: 8 });
	L.race(W, t, r, [5]);
	assert.match(L.lines(W, pit)[0], /a 2\.2 s pit stop/);
	assert.match(L.lines(W, eng)[0], /a setup worth 1\.0% a lap/);
});

test("the history is capped: the most notable kept, titles always, a few of each kind", { skip }, () => {
	const { W, t } = raced();
	const L = W.lore;
	const p = W.seat(t, 0);
	p.notes = [];
	for (let s = 1; s <= 6; s++) {
		for (let k = 0; k < 6; k++) L.add(p, s, k, 0, k, L.WIN, 3, 0, t.id);
		L.add(p, s, 6, 1, 6, L.UPSET, 4 + (s % 3), 2, t.id);
		L.add(p, s, 7, 0, 7, L.CRASH_FRONT, 1, 0, t.id);
		L.add(p, s, -1, s % 3, -1, L.TITLE, 0, 0, t.id);
	}
	const codes = p.notes.map((e) => Number(e.split(":")[4]));
	assert.equal(codes.filter((c) => c === L.TITLE).length, 6, "every title kept");
	assert.ok(codes.filter((c) => c !== L.TITLE).length <= L.HISTORY);
	for (const c of [L.WIN, L.UPSET, L.CRASH_FRONT]) assert.ok(codes.filter((x) => x === c).length <= L.SAME, "a few of each kind");
	// The least notable go first: plain B League wins before upsets in the A League.
	assert.equal(codes.filter((c) => c === L.UPSET).length, L.SAME);
	// Newest first when read, and every line told.
	const lines = L.lines(W, p);
	assert.equal(lines.length, p.notes.length);
	assert.match(lines[0], /^Season 6: champion of the /);
	assert.ok(lines.every((l) => l.startsWith("Season ") && l.endsWith(".")));
});

test("fame rises with notable results and titles, never past 100, fades each season, and raises the ask", { skip }, () => {
	const { W, r, t } = raced();
	const L = W.lore;
	const p = W.seat(t, 0);
	p.fame = 0; p.wins = 3; p.races = 40;
	assert.equal(L.fame_label(p), "a paddock unknown");
	W.staff.forget();
	const ask0 = W.staff.ask(p);
	const k = as(r, t, { rank: 7, grid: 9 });
	L.race(W, t, r, [k]);
	const once = p.fame;
	assert.ok(once >= 5.9 && once <= 6.1, `a win in the 7th-fastest car: ${once}`);
	// The S League counts double the B League.
	const q = W.seat(W.team(r.order[1]), 0);
	q.fame = 0;
	L.fame(W, q, 6, 2);
	assert.ok(Math.abs(q.fame - 2 * once) < 1e-9);
	L.driver_title(W, t, p, 0);
	assert.ok(p.fame > once + 10, "a drivers' title");
	for (let n = 0; n < 40; n++) L.driver_title(W, t, p, 2);
	assert.ok(p.fame <= 100 && p.fame > 95, `bounded: ${p.fame}`);
	assert.equal(L.fame_label(p), "a household name");
	assert.ok(W.staff.ask(p) > ask0 * (1 + W.staff.FAME_ASK * 0.95), "the famous ask more");
	assert.ok(W.staff.ask(p) <= ask0 * (1 + W.staff.FAME_ASK) + 100, "by at most FAME_ASK");
	// A season fades it by FAME_KEEP.
	const f = p.fame;
	L.new_season(W);
	assert.ok(Math.abs(p.fame - f * L.FAME_KEEP) < 1e-9);
	// Over a few seasons of a real world, fame goes to the ones who win, and a
	// few stand out.
	const { game, mod, w } = start(Racing);
	days(mod, game, 84 * 4);
	const pilots = w().people.filter((x) => x.role === 0);
	const famous = pilots.filter((x) => x.fame >= 15);
	assert.ok(famous.length >= 3 && famous.length < pilots.length / 2, `${famous.length} famous pilots`);
	assert.ok(famous.every((x) => x.wins > 0 || x.titles > 0 || x.podiums > 0));
	assert.ok(pilots.every((x) => x.fame >= 0 && x.fame <= 100));
});

test("traits are earned by repeating a feat, by the right role only, at most three, and never twice", { skip }, () => {
	const { W, r, t } = raced();
	const L = W.lore;
	const p = W.seat(t, 0);
	p.traits = []; p.progress = []; p.notes = []; p.wins = 10;
	const sprint = circuitOfKind(W, 0);
	// Giant Killer: wins in a car no better than the 4th fastest.
	for (let n = 1; n <= L.trait_need[L.GIANT]; n++) {
		assert.equal(L.has(p, L.GIANT), false);
		const k = as(r, t, { rank: 4, grid: 3, circuit: sprint });
		L.race(W, t, r, [k]);
	}
	assert.ok(L.has(p, L.GIANT), "earned on the last feat it needs");
	assert.match(L.lines(W, p)[0], /earned the name 'Giant Killer'/);
	// A win in the fastest car is no feat.
	const before = p.progress[L.GIANT];
	as(r, t, { rank: 1, grid: 1 });
	L.race(W, t, r, [0]);
	assert.equal(p.progress[L.GIANT], before);
	// Wins from pole in a slower car: Iron Nerves (and Giant Killer again, which counts no more).
	for (let n = 0; n < L.trait_need[L.NERVES]; n++) { as(r, t, { rank: 5, grid: 1, circuit: sprint }); L.race(W, t, r, [0]); }
	assert.ok(L.has(p, L.NERVES));
	assert.equal(p.traits.filter((x) => x === L.GIANT).length, 1, "never twice");
	// Third: Hazard Master at hazard runs; then no fourth (Rock Dancer) however many feats.
	const hz = circuitOfKind(W, 2), rock = circuitOfKind(W, 1);
	for (let n = 0; n < L.trait_need[L.HAZARD]; n++) { as(r, t, { k: 2, rank: 9, grid: 8, points: 15, circuit: hz }); L.race(W, t, r, [2]); }
	assert.ok(L.has(p, L.HAZARD));
	for (let n = 0; n < 6; n++) { as(r, t, { k: 2, rank: 9, grid: 8, points: 15, circuit: rock }); L.race(W, t, r, [2]); }
	assert.equal(p.traits.length, L.MAX_TRAITS);
	assert.ok(!L.has(p, L.ROCKS), "at most three");
	assert.equal(L.tags(p), " [GK IN HM]");
	// The crew's own: a pit crew chief's quick stops, never a pilot's trait.
	const pit = W.seat(t, 3);
	pit.traits = []; pit.progress = [];
	for (let n = 0; n < L.trait_need[L.LIGHTNING]; n++) { as(r, t, { k: 6, rank: 7, grid: 7, stop: 2.5, points: 6 }); L.race(W, t, r, [6]); }
	assert.deepEqual([...pit.traits], [L.LIGHTNING]);
	// Steady Crew: clean stops running; a slow one starts the count again.
	pit.traits = []; pit.progress = [];
	for (let n = 0; n < L.trait_need[L.STEADY] - 1; n++) { as(r, t, { k: 6, stop: 2.9, points: 6 }); L.race(W, t, r, [6]); }
	as(r, t, { k: 6, stop: 9.5, points: 6 }); L.race(W, t, r, [6]);
	assert.equal(pit.progress[L.STEADY], 0);
	assert.ok(!L.has(pit, L.STEADY));
	for (const x of W.people) for (const k of x.traits) assert.equal(L.trait_role[k], x.role);
});

test("traits' effects are small and bounded, and a trait wins races", { skip }, () => {
	const { W } = raced();
	const L = W.lore;
	const p = W.people.find((x) => x.role === 0);
	p.traits = [L.GIANT, L.HAZARD, L.METRONOME];
	assert.ok(Math.abs(L.pace(p, 2) - 0.0035) < 1e-12, "at most 0.35% a lap, where it counts");
	assert.ok(Math.abs(L.pace(p, 0) - 0.001) < 1e-12);
	p.traits = [L.ROCKS];
	assert.equal(L.pace(p, 2), 0);
	// The best any pilot can have (two kinds of circuit can't both be quicker):
	// within PILOT_K x 0.25 of skill.
	assert.ok(L.GIANT_PACE + L.KIND_PACE <= W.race.PILOT_K * 0.25);
	assert.ok(L.YIELD <= 0.05 && L.STOP <= 0.2 && L.SETUP <= 0.001 && L.PASS <= 0.06 && L.DEFEND <= 0.06);
	// The same races run again and again from the same dice, once with a
	// team's pilot given three pace traits: the team finishes higher.
	const { w } = start(Racing);
	const R = w();
	const t = [...R.league_teams(1)].sort((a, b) => a.rating() - b.rating())[4];
	const pilot = R.seat(t, 0);
	const state = R.rng.state;
	const mean = (give) => {
		R.rng.state = state;
		pilot.traits = give ? [L.GIANT, L.HAZARD, L.ROCKS] : [];
		let sum = 0;
		for (let n = 0; n < 300; n++) sum += R.race.run(R, 1, n % R.ROUNDS, false).position_of(t.id);
		return sum / 300;
	};
	const plain = mean(false), gifted = mean(true);
	pilot.traits = [];
	assert.ok(gifted < plain - 0.1 && gifted > plain - 2.5, `a mean place of ${gifted} against ${plain}: better, by a little`);
});

test("a team's people's fame adds to its value, bounded by FAME_K of the franchise", { skip }, () => {
	const { W, t } = raced();
	for (const x of W.people) x.fame = 0;
	assert.equal(W.value.fame(W, t), 0);
	const m0 = W.value.marketability(W, t);
	for (let s = 0; s < 5; s++) W.seat(t, s).fame = 100;
	const F = 100 + 4 * 100 * W.value.FAME_CREW;
	const v = W.value.fame(W, t);
	assert.ok(Math.abs(v - W.value.FAME_K * W.franchise[t.league] * F / (F + W.value.FAME_HALF)) < 1e-6);
	assert.ok(v < W.value.FAME_K * W.franchise[t.league], "never FAME_K of the franchise");
	assert.ok(Math.abs(W.value.marketability(W, t) - Math.max(m0 + v, -W.value.MKT_FLOOR * W.franchise[t.league])) < 1e-6 || W.value.marketability(W, t) > m0);
	// A famous pilot draws richer sponsor deals (FAME_PAY at most).
	W.seat(t, 0).fame = 100;
	assert.ok(Math.abs(W.sponsoring.fame_pull(W, t) - (1 + W.sponsoring.FAME_PAY)) < 1e-12);
	W.seat(t, 0).fame = 0;
	assert.equal(W.sponsoring.fame_pull(W, t), 1);
});

test("lore is deterministic and saved exactly: a loaded world plays on as the one in memory", { skip }, () => {
	const a = start(Racing), b = start(Racing);
	days(a.mod, a.game, 84 * 3 + 10);
	days(b.mod, b.game, 84 * 3 + 10);
	assert.equal(a.w().encode(), b.w().encode(), "the same world, the same lore");
	const withLore = a.w().people.filter((p) => p.notes.length && p.fame > 0);
	assert.ok(withLore.length > 20 && a.w().people.some((p) => p.traits.length > 0));
	a.mod.on_save(a.game);
	const c = new Racing();
	c.on_load(a.game);
	c.on_pilot_loaded(a.game);
	for (const p of a.w().people) {
		const q = c.world.person(p.id);
		assert.equal(q.fame, p.fame);
		assert.deepEqual([...q.traits], [...p.traits]);
		assert.deepEqual([...q.progress], [...p.progress]);
		assert.deepEqual([...q.notes], [...p.notes]);
		assert.equal(q.signed, p.signed);
		assert.equal(q.loyal, p.loyal);
		assert.equal(q.contract_end, p.contract_end);
	}
	// The loaded world (on a's game) and the one in memory (b) play on alike.
	days(c, a.game, 120);
	days(b.mod, b.game, 120);
	assert.equal(c.world.encode(), b.w().encode());
});

test("a save from before lore and contracts: no history, fame or traits, and a one-season contract at the salary", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 84 + 40);
	mod.on_save(game);
	const before = new Map(w().people.map((p) => [p.id, { team: p.team, salary: p.salary, peak: p.peak }]));
	// The format before: people's lines end with the peak and skill0.
	const old = game.data("state").split("\n").map((line) => line.startsWith("p|") ? line.split("|").slice(0, 32).join("|") : line).join("\n");
	const load = () => {
		game.set_data("state", old);
		const m = new Racing();
		m.on_load(game);
		m.on_pilot_loaded(game);
		return m;
	};
	const a = load(), b = load();
	const W = a.world;
	assert.ok(W.people.length > 200);
	for (const p of W.people) {
		const was = before.get(p.id);
		assert.equal(p.fame, 0);
		assert.equal(p.traits.length, 0);
		assert.equal(p.notes.length, 0);
		assert.equal(p.legacy, false, "migrated");
		assert.equal(p.peak, was.peak, "the bio's peak is kept");
		assert.equal(p.team, was.team);
		assert.equal(p.salary, was.salary, "at the salary it pays");
		if (p.team !== 0) {
			assert.equal(p.contract_end, W.season, "a one-season contract");
			assert.equal(p.signed, W.season);
		}
	}
	assert.equal(a.world.encode(), b.world.encode(), "the same save, the same world");
	assert.equal(W.encode().split("\n").find((l) => l.startsWith("p|")).split("|").length, 49, "saved in the new format");
	takeOff(game);
	days(a, game, 84);
	assert.ok(W.people.some((p) => p.notes.length > 0), "and it plays on, telling new stories");
});

test("the office shows fame, traits and the history, and tags in the tables", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	const L = w().lore;
	const p = w().people.find((x) => x.role === 0 && x.team === 0);
	w().staff.player_hire(w(), p);
	p.fame = 40;
	p.traits = [L.COMEBACK];
	L.add(p, 1, 2, 0, 3, L.CHARGE, 9, 2, me.id);
	L.add(p, 1, -1, 0, -1, L.TITLE, 0, 0, me.id);
	press(mod, game, "Team");
	mod.on_panel_row(game, 0);
	const text = game.panel.text;
	assert.ok(text.includes("Fame: a fan favourite (40 of 100)."));
	assert.ok(text.includes("Traits: Comeback King (+0.06 on every passing move)."));
	assert.ok(text.includes("Notable:\nSeason 1: champion of the B League with " + me.name + ".\nSeason 1, round 3, the " + w().names.circuit_titles[3] + " (B League): came through from P9 to P2."));
	assert.ok(game.panel.rows.some((r) => r[1] === p.name + " [CK]" && r[7] === "40"));
	press(mod, game, "Staff");
	assert.ok(game.panel.columns.includes("Fame"));
});

