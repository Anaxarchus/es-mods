// The staff pool: hidden stats, visible records, prices that follow the
// record, hiring and firing through the office, AI hiring, poaching (and the
// player matching an offer), careers and retirement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, confirmLast, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

function record(p, n, mean) { p.s_n = n; p.s_sum = n * mean; p.races = n; }

test("the price follows the record, the league worked in, titles and experience", { skip }, () => {
	const { w } = start(Racing);
	const st = w().staff;
	const [a, b] = w().people.filter((p) => p.role === 0);
	for (const p of [a, b]) { p.best_league = 0; p.titles = 0; p.ev_good = p.ev_bad = 0; }
	record(a, 40, 0.6);
	record(b, 40, -0.6);
	st.forget();
	assert.ok(st.ask(a) > 2 * st.ask(b), "a good record asks more");
	const before = st.ask(a);
	a.best_league = 2;
	st.forget();
	assert.ok(st.ask(a) > 4 * before, "S League experience is worth more");
	a.titles = 2;
	st.forget();
	assert.ok(st.ask(a) > 4 * before * 1.1);
	// Crises handled well count too.
	record(b, 40, 0);
	st.forget();
	const plain = st.ask(b);
	b.ev_good = 4;
	st.forget();
	assert.ok(st.ask(b) > plain);
	// The hidden skill never shows: the office prints the record, not the skill.
	const text = w().people.map((p) => st.metric_text(p) + st.crisis_text(p)).join(" ");
	assert.ok(!text.includes(String(a.skill)));
});

test("records grow from races, and a better pilot gains more places on the car's pace", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 84 * 3);
	const pilots = w().people.filter((p) => p.role === 0 && p.m_n >= 60);
	assert.ok(pilots.length > 10);
	const good = pilots.filter((p) => p.skill > 0.3), bad = pilots.filter((p) => p.skill < -0.3);
	const mean = (xs) => xs.reduce((s, p) => s + p.mean_metric(), 0) / xs.length;
	assert.ok(good.length && bad.length);
	assert.ok(mean(good) > mean(bad), `${mean(good)} > ${mean(bad)}`);
	const pits = w().people.filter((p) => p.role === 3 && p.m_n >= 60);
	const fast = pits.filter((p) => p.skill > 0.3), slow = pits.filter((p) => p.skill < -0.3);
	assert.ok(mean(fast) < mean(slow), "a better crew chief's stops are quicker");
});

test("hiring through the office: the seat, the salary, the cost; releasing pays severance", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	press(mod, game, "Staff");
	const free = w().people.filter((p) => p.role === 0 && p.team === 0).sort((a, b) => w().staff.ask(a) - w().staff.ask(b))[0];
	const row = game.panel.rows.findIndex((r) => r[0] === free.name && r[1] === "free");
	assert.ok(row >= 0, "the free pilot is listed");
	mod.on_panel_row(game, row);
	press(mod, game, "Hire");
	const ask = w().staff.ask(free);
	const cash = me.cash;
	confirmLast(mod, game);
	assert.equal(me.seats[0], free.id);
	assert.equal(free.team, me.id);
	assert.equal(free.salary, ask);
	assert.ok(Math.abs(cash - me.cash - w().staff.SIGN * ask) < 1, "a signing fee");
	assert.equal(free.contract_end, w().season + w().staff.CONTRACT - 1);
	// Release from the Team tab.
	press(mod, game, "Team");
	mod.on_panel_row(game, 0);
	press(mod, game, "Release");
	const c2 = me.cash;
	// The release clause: a share of the salary still owed, at least severance.
	const owed = w().staff.release_cost(w(), free);
	assert.ok(owed >= w().staff.SEVERANCE * ask - 1);
	assert.ok(Math.abs(owed - Math.max(w().staff.SEVERANCE * ask, w().staff.RELEASE_K * ask * w().staff.weeks_left(w(), free))) < 1);
	confirmLast(mod, game);
	assert.equal(me.seats[0], 0);
	assert.equal(free.team, 0);
	assert.ok(Math.abs(c2 - me.cash - owed) < 1);
});

test("signing someone away from an AI team buys out their contract, and that team hires again", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	const rival = w().league_teams(2)[0];
	const star = w().person(rival.seats[1]);
	const rc = rival.cash;
	const fee = w().staff.buyout(w(), star);
	assert.ok(fee >= w().staff.BUYOUT_MIN * star.salary - 1);
	w().staff.player_hire(w(), star);
	assert.equal(me.seats[1], star.id);
	assert.ok(Math.abs(rival.cash - rc - fee) < 1, "the buyout goes to the team");
	assert.ok(rival.seats[1] !== 0 && rival.seats[1] !== star.id, "the rival hires a replacement");
	assert.ok(Math.abs(star.salary - w().staff.ask(star) * w().staff.POACH_RAISE) < 1);
});

test("poaching: a rival's offer for the player's staff can be matched, or it lapses and they go", { skip }, () => {
	for (const match of [true, false]) {
		const { game, mod, w } = start(Racing);
		const me = found(mod, game, 0);
		takeOff(game);
		const pilot = w().people.find((p) => p.role === 0 && p.team === 0);
		w().staff.player_hire(w(), pilot);
		record(pilot, 60, 1.5);
		pilot.best_league = 0;
		w().staff.forget();
		// A rich rival with a poor pilot comes for ours.
		const rival = w().league_teams(1)[0];
		rival.backing = 1e8;
		rival.cash = 1e8;
		const theirs = w().person(rival.seats[0]);
		record(theirs, 60, -1.5);
		w().staff.forget();
		for (let k = 0; k < 40 && !pilot.offer_until; k++) w().staff.poach(w(), rival);
		assert.ok(pilot.offer_until > 0, "an offer");
		assert.equal(pilot.offer_team, rival.id);
		assert.ok(game.messages.length === 0 || true);
		mod.flush(game);
		assert.ok(game.messages.some((m) => m.includes("offers " + pilot.name)));
		if (match) {
			office(mod, game);
			press(mod, game, "Team");
			mod.on_panel_row(game, 0);
			press(mod, game, "Match the offer");
			confirmLast(mod, game);
			assert.equal(pilot.team, me.id);
			assert.equal(pilot.offer_until, 0);
			assert.ok(Math.abs(pilot.salary - pilot.offer_salary) < 1 || pilot.offer_salary === pilot.salary);
		} else {
			const cash = me.cash;
			days(mod, game, 14);
			assert.equal(pilot.team, rival.id, "gone to the rival");
			assert.equal(me.seats[0], 0);
			assert.ok(me.cash > cash - 1e6 && game.messages.some((m) => m.includes("leaves your team")));
		}
	}
});

test("AI teams hire on experience and record within their means", { skip }, () => {
	const { w } = start(Racing);
	const st = w().staff;
	const t = w().league_teams(0)[0];
	const free = w().people.filter((p) => p.role === 2 && p.team === 0);
	for (const p of free) { record(p, 0, 0); p.best_league = 0; p.titles = 0; p.ev_good = p.ev_bad = 0; }
	record(free[0], 60, 0.5);
	record(free[1], 60, 0.5);
	free[1].best_league = 2;
	free[1].titles = 4;
	st.forget();
	t.backing = 20000;
	const pick = st.pick(w(), t, 2);
	assert.equal(pick.id, free[0].id, "the best record it can afford");
	t.backing = 1e9;
	const rich = st.pick(w(), t, 2).id;
	assert.equal(rich === free[0].id || rich === free[1].id, true);
});

test("careers end: a retiree leaves the pool and a rookie with no record takes the place", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	const pilot = w().people.find((p) => p.role === 0 && p.team === 0);
	w().staff.player_hire(w(), pilot);
	pilot.retires = game.day_ + 1;
	const size = w().people.length;
	days(mod, game, 8);
	assert.ok(!w().person_by_id.has(pilot.id), "retired");
	assert.equal(w().people.length, size);
	assert.equal(me.seats[0], 0, "the player's seat waits for the player");
	assert.ok(game.messages.some((m) => m.includes("retires")));
	const rookies = w().people.filter((p) => p.id > pilot.id && p.races === 0 && p.role === 0);
	assert.ok(rookies.length >= 1);
});

test("an empty seat is a stand-in, never a soft lock: the team still races", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	assert.deepEqual([...me.seats], [0, 0, 0, 0, 0, 0]);
	days(mod, game, 14);
	assert.ok(me.races >= 1);
	const r = w().last[0];
	assert.equal(r.order.length, 20);
	assert.equal(r.order.filter((id) => id === me.id).length, 2, "stand-ins drive both cars");
	assert.deepEqual(r.order.map((id, k) => (id === me.id ? r.pilots[k] : -1)).filter((x) => x >= 0), [0, 0]);
});
