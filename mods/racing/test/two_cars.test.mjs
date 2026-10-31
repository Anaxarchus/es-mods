// Two cars a team, F1 style: both cars on the grid, points to the teams' and
// the drivers' championships, champions in the lore, promotion by the teams'
// table, the #1 and #2 seats (hiring, releasing, swapping, rivals' poaching),
// the teammates' head-to-head, the office's tables, the bus's contract, and
// saves from before two cars (one pilot a team, mid-season).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, confirmLast, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

// To the eve of the season's end (the last round run; the next day ends it).
const toSeasonEnd = (mod, game, w) => { while (!(w().season_week() === w().ROUNDS - 1 && w().weekday() === 6)) days(mod, game, 1); };

test("a season of two cars: the teams' table adds both, the drivers' table each pilot's, and both champions are recorded", { skip }, () => {
	const { game, mod, w } = start(Racing);
	toSeasonEnd(mod, game, w);
	const W = w();
	for (let l = 0; l < 3; l++) {
		// Before the day's end-of-season work: the tables as they stand.
		const teams = W.table(l);
		for (const t of teams) {
			const p1 = W.seat(t, 0), p2 = W.seat(t, 5);
			assert.ok(p1.id && p2.id, "two pilots");
			assert.equal(t.races, W.ROUNDS);
			assert.equal(t.finishes.length, W.ROUNDS);
			assert.ok(t.finishes.every((f) => f >= 1 && f <= 10), "a team's race is a place among the teams");
		}
		const drivers = W.drivers_table(l);
		assert.ok(drivers.length >= 20, "every pilot who raced");
		const sum = drivers.reduce((s, p) => s + p.d_points, 0);
		assert.equal(sum, teams.reduce((s, t) => s + t.points, 0), "the drivers' points add up to the teams'");
		for (let k = 1; k < drivers.length; k++) assert.ok(drivers[k - 1].d_points >= drivers[k].d_points);
	}
	const champs = [0, 1, 2].map((l) => ({ team: W.table(l)[0], driver: W.drivers_table(l)[0] }));
	const before = champs.map((c) => ({ tt: c.team.titles, dt: c.driver.titles, crew: W.seat(c.team, 1).titles }));
	days(mod, game, 1);
	assert.equal(W.finals_season, W.season);
	for (let l = 0; l < 3; l++) {
		const { team, driver } = champs[l];
		assert.equal(W.finals[l][0], team.id, "the final table is the teams'");
		assert.equal(team.titles, before[l].tt + 1, "the teams' title is the team's");
		assert.equal(W.seat(team, 1).titles, before[l].crew + 1, "and its crew's");
		assert.equal(driver.titles, before[l].dt + 1, "the drivers' title is the pilot's");
		assert.ok(W.lore.lines(W, driver).some((x) => x.includes(`drivers' champion of the ${W.names.league_names[l]}`)), "kept in the lore");
		assert.ok(W.lore.lines(W, W.seat(team, 0)).some((x) => x.includes("teams' champion")), "the champion team's pilots keep the teams' title in their history");
		assert.ok(W.news.some((n) => n.includes("drivers' champion of season")));
	}
	// Promotion follows the teams' table (its top eligible teams).
	const up = W.movers(0, true);
	assert.deepEqual(up, W.finals[0].filter((id) => W.eligible(W.team(id), W.finals_season)).slice(0, up.length));
	while (W.season_week() !== W.WEEKS - 1 || W.weekday() < 1) days(mod, game, 1);
	for (const id of up) assert.ok(!W.team_by_id.has(id) || W.team(id).league === 1, "the teams' top two go up");
});

test("both cars race: one crew services both, the #2 waits on a double stack, team orders, and the head-to-head adds up", { skip }, () => {
	const { game, mod, w } = start(Racing);
	found(mod, game, 1);
	takeOff(game);
	const W = w();
	// The player's team with a stand-in engineer: its two cars called in on
	// the same lap stack (the story tells the player's stops).
	let stacked = 0;
	const state = W.rng.state;
	for (let n = 0; n < 60; n++) {
		const r = W.race.run(W, 1, n % W.ROUNDS, true);
		if (r.story.some((s) => s.includes("double stack"))) stacked++;
		assert.equal(r.order.length, 20);
	}
	W.rng.state = state;
	// The story names pilots with their teams.
	const r = W.race.run(W, 1, 0, true);
	const p = W.person(r.pilots[0]);
	assert.ok(r.story.some((s) => s.includes(`${p.name} (${W.team(r.order[0]).name})`)));
	assert.ok(stacked > 3 && stacked < 30, `double stacks in 60 races: ${stacked}`);
	// A good engineer keeps the cars a lap apart.
	const good = W.people.find((x) => x.role === 1 && x.team === 0);
	good.skill = 0.6;
	W.staff.player_hire(W, good);
	stacked = 0;
	for (let n = 0; n < 60; n++) if (W.race.run(W, 1, n % W.ROUNDS, true).story.some((s) => s.includes("double stack"))) stacked++;
	assert.equal(stacked, 0);
	// A season of head-to-head.
	toSeasonEnd(mod, game, w);
	for (const tm of W.teams) {
		const a = W.seat(tm, 0), b = W.seat(tm, 5);
		if (a.h_mate !== b.id || b.h_mate !== a.id) continue;
		assert.equal(a.h_n, b.h_n);
		assert.equal(a.h_quali + b.h_quali, a.h_n, "one of them ahead on the grid each race");
		assert.equal(a.h_race + b.h_race, a.h_n, "and at the flag");
	}
	days(mod, game, 1);
	const mates = W.people.filter((x) => x.notes.some((e) => [W.lore.MATE_RACE, W.lore.MATE_QUALI].includes(Number(e.split(":")[4]))));
	assert.ok(mates.length > 0, "someone out-raced their teammate all season");
	assert.ok(mates.some((x) => W.lore.lines(W, x).some((l) => /(out-raced|outqualified) (teammate .+|their teammate) (all season|\d+ times in \d+)/.test(l))));
	// The #1 more often ahead: team orders.
	let first = 0, n = 0;
	for (const tm of W.teams) { const a = W.seat(tm, 0); if (a.h_n > 0) { first += a.h_race / a.h_n; n++; } }
	assert.ok(first / n > 0.5, `the #1 ahead at the flag in ${(100 * first / n).toFixed(0)}% of races`);
});

test("the player's two seats: hire a #1 and a #2, replace the #2 (severance), swap them, and a rival's poach takes the weaker seat", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	const W = w();
	const st = W.staff;
	const free = () => W.people.filter((p) => p.role === 0 && p.team === 0).sort((a, b) => st.ask(a) - st.ask(b));
	// Through the office: Find a pilot from the #2 row hires into the #2 seat.
	press(mod, game, "Team");
	mod.on_panel_row(game, game.panel.rows.findIndex((r) => r[0] === "Pilot #2"));
	press(mod, game, "Find a pilot");
	const a = free()[0];
	mod.on_panel_row(game, game.panel.rows.findIndex((r) => r[0].startsWith(a.name)));
	assert.ok(game.panel.buttons.includes("Seat: #2"));
	assert.ok(game.panel.text.includes("To hire as your #2 pilot"));
	press(mod, game, "Hire");
	confirmLast(mod, game);
	assert.equal(me.seats[5], a.id);
	assert.equal(me.seats[0], 0);
	// Then the #1 (the Seat button picks it).
	press(mod, game, "Staff");
	const b = free()[0];
	mod.on_panel_row(game, game.panel.rows.findIndex((r) => r[0].startsWith(b.name)));
	assert.ok(game.panel.buttons.includes("Seat: #1"), "the empty seat first");
	press(mod, game, "Hire");
	confirmLast(mod, game);
	assert.equal(me.seats[0], b.id);
	// A third pilot into the #2 seat: the #2 is released, with severance.
	const c = free()[0];
	const sev = st.release_cost(W, a);
	assert.ok(Math.abs(st.player_cost_at(W, me, c, 2, 5) - (st.SIGN * st.player_salary_for(c, 2) + sev)) < 1);
	st.player_hire_at(W, c, 2, 5);
	assert.equal(me.seats[5], c.id);
	assert.equal(a.team, 0);
	assert.equal(me.seats[0], b.id, "the #1 untouched");
	// Swap on the Team tab.
	office(mod, game);
	press(mod, game, "Team");
	mod.on_panel_row(game, game.panel.rows.findIndex((r) => r[0] === "Pilot #1"));
	press(mod, game, "Swap #1 and #2");
	assert.equal(me.seats[0], c.id);
	assert.equal(me.seats[5], b.id);
	assert.ok(game.panel.rows.some((r) => r[0] === "Pilot #2" && r[1].startsWith(b.name)));
	// An AI team going after a pilot replaces its weaker one.
	const ai = W.league_teams(1).find((t) => !t.player);
	const p1 = W.seat(ai, 0), p2 = W.seat(ai, 5);
	p1.s_n = 40; p1.s_sum = 40 * 0.5; p2.s_n = 40; p2.s_sum = -40 * 0.3;
	st.forget();
	assert.equal(st.seat_for(W, ai, 0), 5, "the weaker pilot's seat");
	const star = W.people.find((x) => x.role === 0 && x.team === 0);
	st.hire(W, ai, star, st.ask(star), 2);
	assert.equal(ai.seats[5], star.id);
	assert.equal(ai.seats[0], p1.id);
	assert.equal(p2.team, 0);
	// Nobody holds two seats after a long run of poaching.
	takeOff(game);
	days(mod, game, 84 * 2);
	const seen = new Set();
	for (const t of W.teams) for (const id of t.seats) if (id) { assert.ok(!seen.has(id)); seen.add(id); assert.equal(W.person(id).team, t.id); }
});

test("sponsors and value read both pilots' fame, bounded; the bus's team listing is the teams' championship", { skip }, () => {
	const { w } = start(Racing);
	const W = w();
	const t = W.league_teams(2)[0];
	for (const p of W.people) p.fame = 0;
	W.seat(t, 0).fame = 60; W.seat(t, 5).fame = 40;
	assert.equal(W.pilot_fame(t), 80, "the better one's and half the other's");
	assert.ok(Math.abs(W.sponsoring.fame_pull(W, t) - (1 + W.sponsoring.FAME_PAY * 0.8)) < 1e-12);
	W.seat(t, 0).fame = 100; W.seat(t, 5).fame = 100;
	assert.equal(W.pilot_fame(t), 100, "at most a household name's");
	assert.ok(W.value.fame(W, t) < W.value.FAME_K * W.franchise[2]);
	// What the bridge reads: each team's place in the teams' table and its expected place, 1 .. 10.
	const wanted = JSON.parse(W.sponsoring.wanted(W));
	assert.equal(wanted.teams.length, 30);
	for (const x of wanted.teams) {
		const team = W.teams.find((y) => y.name === x.name);
		assert.equal(x.position, W.position(team));
		assert.ok(x.expected >= 1 && x.expected <= 10);
		assert.ok("fair" in x && "free" in x && "deals" in x && "league" in x && "player" in x);
	}
});

test("the office: both pilots on the Team tab, both championships on Standings, both cars on Last race", { skip }, () => {
	const { game, mod, w } = start(Racing);
	found(mod, game, 1);
	takeOff(game);
	days(mod, game, 21);
	office(mod, game);
	press(mod, game, "Team");
	assert.deepEqual(game.panel.rows.slice(0, 2).map((r) => r[0]), ["Pilot #1", "Pilot #2"]);
	press(mod, game, "Standings");
	assert.ok(game.panel.buttons.includes("Table: teams"));
	assert.equal(game.panel.rows.length, 10);
	press(mod, game, "Table: teams");
	assert.ok(game.panel.buttons.includes("Table: drivers"));
	assert.equal(game.panel.rows.length, w().drivers_table(1).length, "the drivers' table");
	assert.ok(game.panel.rows.length >= 18, "every pilot who has raced (stand-ins score for the team only)");
	assert.ok(game.panel.text.includes("drivers' championship"));
	press(mod, game, "Last race");
	assert.equal(game.panel.rows.length, 20);
	const me = w().mine();
	assert.equal(game.panel.rows.filter((r) => r[1].startsWith(me.name)).length, 2, "both of your cars");
	assert.ok(game.messages.some((m) => m.includes("teams' championship")));
});

// A save from before two cars, mid-season: teams' lines with five seats,
// people's lines without the drivers' fields, results without pilots; the
// #2 pilots of the save made free agents (they were not in it).
function oneCarSave(game) {
	const lines = game.data("state").split("\n");
	const second = new Set();
	for (const l of lines) if (l.startsWith("t|")) { const f = l.split("|"); const s = f[11].split(","); if (s[5] !== "0") second.add(s[5]); }
	return lines.map((l) => {
		const f = l.split("|");
		if (l.startsWith("t|")) { f[11] = f[11].split(",").slice(0, 5).join(","); return f.join("|"); }
		if (l.startsWith("p|")) {
			if (second.has(f[1])) { f[8] = "0"; f[9] = "0"; f[10] = "0"; }
			return f.slice(0, 38).join("|");
		}
		if (l.startsWith("r|")) return f.slice(0, 15).join("|");
		return l;
	}).join("\n");
}

test("a save from before two cars, mid-season: the pilot keeps the #1 seat and their points, AI teams fill the #2, the player is told", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	const st = w().staff;
	const pilot = w().people.find((p) => p.role === 0 && p.team === 0);
	st.player_hire(w(), pilot);
	days(mod, game, 7 * 4);
	mod.on_save(game);
	const old = oneCarSave(game);
	const points = new Map(w().teams.map((t) => [t.id, { points: t.points, wins: t.wins, races: t.races, p: t.seats[0] }]));
	const load = () => {
		game.set_data("state", old);
		const m = new Racing();
		m.on_load(game);
		m.on_pilot_loaded(game);
		return m;
	};
	const a = load(), b = load();
	const W = a.world;
	assert.equal(W.encode(), b.world.encode(), "the same save, the same migration");
	assert.ok(W.people.filter((p) => p.role === 0).length >= 2 * W.staff.POOL, "the pool has the pilots two cars need");
	for (const t of W.teams) {
		assert.equal(t.seats.length, 6);
		assert.equal(t.one_car, false);
		const was = points.get(t.id);
		assert.equal(t.points, was.points, "the season's points become the teams'");
		assert.equal(t.seats[0], was.p, "the pilot keeps the #1 seat");
		const p = W.seat(t, 0);
		if (p.id) {
			assert.equal(p.d_points, t.points, "and the team's points as their own");
			assert.equal(p.d_wins, t.wins);
			assert.equal(p.d_starts, t.races);
		}
		if (t.player) assert.equal(t.seats[5], 0, "the player's #2 seat waits for the player");
		else assert.ok(t.seats[5] !== 0, "AI teams hire a second pilot");
	}
	assert.equal(W.mine().id, me.id);
	// The old results read (no pilots: the office falls back to the #1).
	assert.equal(W.last[0].pilots.length, 0);
	days(a, game, 1);
	assert.ok(game.messages.some((m) => m.includes("now race two cars") && m.includes("#2 seat is empty")), "the player is told");
	// It plays on, and a save of it reads back and plays on as in memory.
	takeOff(game);
	days(a, game, 30);
	assert.ok(W.last[0].pilots.length === 20);
	a.on_save(game);
	const c = new Racing();
	c.on_load(game);
	c.on_pilot_loaded(game);
	assert.equal(c.world.encode(), W.encode());
	for (let d = 0; d < 60; d++) {
		game.day_ += 1;
		a.on_day(game, game.day_);
		c.on_day(game, game.day_);
	}
	assert.equal(c.world.encode(), W.encode(), "and plays on the same");
});
