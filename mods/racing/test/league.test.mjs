// The leagues: the race simulation's determinism, saving and loading,
// races' results, promotion and relegation, and the office's tabs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, land, takeOff, press, office } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

test("the world: three leagues of ten teams, a staff pool, sponsors and a calendar", { skip }, () => {
	const { w } = start(Racing);
	for (let l = 0; l < 3; l++) assert.equal(w().league_teams(l).length, 10);
	assert.equal(w().people.length, 6 * w().staff.POOL, "twice the pilots: two a team");
	for (const t of w().teams) {
		assert.equal(t.seats.length, 6);
		for (let r = 0; r < 6; r++) assert.ok(t.seats[r] > 0, `${t.name} has a ${r}`);
		assert.equal(w().person(t.seats[5]).role, 0, "seat 5 is the #2 pilot's");
	}
	assert.equal(w().calendar.length, 3 * w().ROUNDS);
	for (let l = 0; l < 3; l++) assert.equal(new Set(w().calendar.slice(l * 10, l * 10 + 10)).size, 10, "no circuit twice in a season");
	assert.ok(w().people.some((p) => p.races > 0 && p.wins > 0), "track records from day one");
});

test("the simulation is deterministic, and a saved world plays on exactly as the one in memory", { skip }, () => {
	const a = start(Racing);
	const b = start(Racing);
	days(a.mod, a.game, 100);
	days(b.mod, b.game, 100);
	assert.equal(a.w().encode(), b.w().encode(), "same day, same world");
	// Save, load it into a fresh mod, and play both on.
	a.mod.on_save(a.game);
	const c = new Racing();
	c.on_load(a.game);
	c.on_pilot_loaded(a.game);
	assert.equal(c.world.encode(), a.w().encode(), "the save reads back as it was");
	for (let d = 0; d < 150; d++) {
		a.game.day_ += 1;
		a.mod.on_day(a.game, a.game.day_);
		c.on_day(a.game, a.game.day_);
	}
	assert.equal(c.world.encode(), a.w().encode(), "and plays on the same");
});

test("a race: every car classified, points and prize money by position", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 3);
	for (let l = 0; l < 3; l++) {
		const r = w().last[l];
		assert.equal(r.order.length, 20, "two cars a team");
		assert.equal(new Set(r.order).size, 10);
		for (const id of new Set(r.order)) assert.equal(r.order.filter((x) => x === id).length, 2);
		assert.equal(new Set(r.pilots).size, 20, "twenty pilots");
		r.order.forEach((id, k) => {
			const t = w().team(id);
			assert.equal(r.pilots[k], t.seats[r.cars[k] === 0 ? 0 : 5], "each car's pilot is the team's, in its seat");
		});
		const pool = w().RACE_POOL * w().scale[l];
		assert.ok(Math.abs(r.prizes.reduce((x, y) => x + y, 0) - pool) < 1, "the pool is paid out");
		const table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
		r.order.forEach((id, k) => assert.equal(r.points[k], r.status[k] === 0 && k < 10 ? table[k] : 0));
		// The teams' championship adds both cars; the drivers' is each pilot's own.
		for (const id of new Set(r.order)) {
			const ks = r.order.map((x, k) => (x === id ? k : -1)).filter((k) => k >= 0);
			assert.equal(w().team(id).points, ks.reduce((s, k) => s + r.points[k], 0));
			for (const k of ks) assert.equal(w().person(r.pilots[k]).d_points, r.points[k]);
			assert.equal(w().team(id).finishes[0], r.team_place(id), "the team's race is its best car's place among the teams");
			assert.ok(w().team(id).finishes[0] >= 1 && w().team(id).finishes[0] <= 10);
		}
		// Retired cars are classified behind every finisher.
		const firstOut = r.status.findIndex((s) => s !== 0);
		if (firstOut >= 0) assert.ok(r.status.slice(firstOut).every((s) => s !== 0));
		for (const id of r.order) assert.equal(w().team(id).races, 1);
	}
});

test("a long run: the leagues stay whole, teams fold and are replaced, nobody holds two seats", { skip }, () => {
	const { game, mod, w } = start(Racing);
	let folded = 0;
	const fold = w().bankrupt.bind(w());
	w().bankrupt = (t) => { folded++; fold(t); };
	days(mod, game, 84 * 8);
	for (let l = 0; l < 3; l++) assert.equal(w().league_teams(l).length, 10, `league ${l}`);
	const seated = new Map();
	for (const t of w().teams) for (let r = 0; r < 6; r++) {
		const id = t.seats[r];
		if (!id) continue;
		assert.ok(!seated.has(id), "one seat each");
		seated.set(id, t.id);
		assert.equal(w().person(id).team, t.id);
		assert.equal(w().person(id).role, r === 5 ? 0 : r);
	}
	assert.equal(w().people.length, 6 * w().staff.POOL, "the pool keeps its size");
	assert.equal(w().season, 9);
	assert.ok(folded >= 1, `some teams folded in eight seasons (${folded})`);
});

test("promotion and relegation: the top two go up, the bottom two go down, a new franchise is spared", { skip }, () => {
	const { game, mod, w } = start(Racing);
	// To the end of season 1 (the day after its last round).
	while (!(w().season_week() === w().ROUNDS && w().weekday() === 0)) days(mod, game, 1);
	const fin = [0, 1, 2].map((l) => w().table(l).map((t) => t.id));
	assert.deepEqual(w().finals, fin, "the final tables");
	// Every team long enough in its league to go up (promotion.test.mjs has the rest).
	for (const t of w().teams) t.since = -5;
	// Spare the last in A as if it bought its place this season.
	const spared = w().team(fin[1][9]);
	spared.protect = true;
	while (w().season === 1) days(mod, game, 1);
	const league = (id) => (w().team_by_id.has(id) ? w().team(id).league : -1);
	for (const id of fin[0].slice(0, 2)) assert.equal(league(id), 1, "promoted from B");
	for (const id of fin[1].slice(0, 2)) assert.equal(league(id), 2, "promoted from A");
	assert.equal(league(spared.id), 1, "spared");
	for (const id of fin[1].slice(7, 9)) assert.ok([0, -1].includes(league(id)), "relegated from A in its place (or folded)");
	for (const id of fin[2].slice(8, 10)) assert.ok([1, -1].includes(league(id)), "relegated from S (or folded)");
	for (let l = 0; l < 3; l++) assert.equal(w().league_teams(l).length, 10);
	assert.equal(w().league_teams(0).every((t) => t.points === 0), true, "a new season");
});

test("the player's team climbs: a winning car is promoted, paid a grant, and its staff keep their seats", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	for (let r = 0; r < 5; r++) {
		const p = w().people.find((x) => x.role === r && x.team === 0);
		w().staff.player_hire(w(), p);
	}
	me.levels = [400, 400, 400, 400, 400];
	me.budgets = [0, 0, 0, 0, 0];
	const season = w().season;
	while (w().season === season) {
		days(mod, game, 1);
		me.levels = me.levels.map((x) => Math.max(x, 400));
	}
	assert.equal(me.league, 1, "promoted to A");
	assert.ok(me.history.endsWith(":B:1") || me.history.endsWith(":B:2"), me.history);
	assert.ok(game.messages.some((m) => m.includes("promoted to the A League") && m.includes("grant")));
	assert.equal(me.seats.filter((x) => x).length, 5);
});

test("the office: every tab opens, with and without a team, and the planet button is at banks only", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 10);
	land(mod, game, "Luna");
	assert.equal(game.planetButtonLabel, "", "no bank at Luna");
	land(mod, game, "Earth");
	assert.equal(game.planetButtonLabel, "Racing League");
	const tabs = ["Team", "Staff", "R&D", "Calendar", "Standings", "Finances", "Sponsors", "Last race", "News"];
	office(mod, game);
	for (const t of tabs) {
		press(mod, game, t);
		assert.ok(game.panel.full, t);
		assert.ok(game.panel.title.startsWith("Racing League"), t);
	}
	found(mod, game, 0);
	days(mod, game, 10);
	office(mod, game);
	for (const t of tabs) {
		press(mod, game, t);
		for (let k = 0; k < Math.min(3, game.panel.rows?.length ?? 0); k++) mod.on_panel_row(game, k);
	}
	press(mod, game, "Last race");
	press(mod, game, "Lap by lap");
	assert.ok(game.panel.rows.length > 2, "the story, lap by lap");
	assert.ok(game.panel.rows.some((r) => r[1].includes("wins the")));
	press(mod, game, "Standings");
	assert.ok(game.panel.rows.some((r) => r[1].includes("(you)")));
	press(mod, game, "Leave");
});

test("a damaged save starts a new world and keeps the old text aside", { skip }, () => {
	const { game, mod } = start(Racing);
	game.set_data("state", "w|1|garbage");
	const again = new Racing();
	again.on_load(game);
	again.on_pilot_loaded(game);
	assert.equal(again.world.teams.length, 30);
	assert.equal(game.data("state broken"), "w|1|garbage");
	game.set_data("state", "not a world at all");
	const third = new Racing();
	third.on_pilot_loaded(game);
	assert.equal(third.world.teams.length, 30);
	days(third, game, 5);
});
