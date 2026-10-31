// Promotion's eligibility: a team goes up only in at least its third season
// in a row in its league, or at once after relegation (a rebound); as many go
// down from the league above as go up (none eligible: nobody goes down).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, office, press, pressStarting, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";
const [UP, DOWN] = [6, 7];

// To the day season s's tables are final (end_season has run).
function toSeasonEnd(mod, game, w) {
	const s = w().season;
	while (w().finals_season !== s) days(mod, game, 1);
}
// On to the next season's start, recording every move (World.move).
function toNewSeason(mod, game, w) {
	const W = w(), s = W.season, moves = [];
	const move = W.move.bind(W);
	W.move = (t, to, up) => { moves.push({ id: t.id, from: t.league, to, up }); move(t, to, up); };
	while (W.season === s) days(mod, game, 1);
	W.move = move;
	return moves;
}
// Every team eligible, then exactly `ids` of league `l` (the rest of it not).
function onlyEligible(W, l, ids) {
	for (const t of W.teams) { t.since = -5; t.rebound = false; }
	for (const t of W.league_teams(l)) t.since = ids.includes(t.id) ? -5 : W.season;
	W.book.cache_day = -1;
}

test("eligibility: the first teams by their age, a promoted team from its new league's first season, a relegated one at once", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	for (const t of W.teams) {
		assert.equal(t.since, t.born, "in its league since it was founded");
		assert.equal(W.eligible(t, 1), t.born <= 1 - W.PROMO_SEASONS + 1, `born ${t.born}`);
	}
	toSeasonEnd(mod, game, w);
	for (const t of W.teams) { t.since = -5; t.rebound = false; }
	const moves = toNewSeason(mod, game, w);
	assert.equal(W.season, 2);
	assert.ok(moves.filter((m) => m.up).length >= 2);
	for (const m of moves) {
		if (!W.team_by_id.has(m.id)) continue;
		const t = W.team(m.id);
		assert.equal(t.since, 2, "its first season in the new league");
		assert.equal(t.rebound, !m.up);
		if (m.up && m.to < 2) {
			assert.equal(W.eligible(t, 2), false);
			assert.equal(W.eligible(t, 3), false);
			assert.equal(W.eligible(t, 4), true, "its third season there");
			assert.equal(W.eligible_from(t), 4);
			assert.match(W.promotion_text(t), /1st season in a row .* from the end of season 4/);
		}
		if (!m.up) {
			assert.equal(W.eligible(t, 2), true, "a rebound: eligible at once");
			assert.match(W.promotion_text(t), /straight back up/);
		}
	}
	// A team founded now (a defunct team's successor) counts from the next
	// season once its league has raced this one.
	days(mod, game, 7 * 3);
	assert.equal(W.first_full_season(0), W.season + 1);
	const n = W.add_ai_team(0, false);
	assert.equal(n.since, W.season + 1);
	assert.equal(n.rebound, false);
});

test("the season's turn: ineligible teams are passed over, and as many go down as go up (2, 1, 0)", { skip }, () => {
	for (const elig of [2, 1, 0]) {
		const { game, mod, w } = start(Racing);
		const W = w();
		toSeasonEnd(mod, game, w);
		const fb = W.finals[0];
		// The champion is never eligible here; `elig` of the rest are.
		const pick = [fb[3], fb[6]].slice(0, elig);
		onlyEligible(W, 0, pick);
		const bottomA = W.finals[1].slice(-2);
		const moves = toNewSeason(mod, game, w);
		const upB = moves.filter((m) => m.from === 0 && m.up).map((m) => m.id);
		const downA = moves.filter((m) => m.from === 1 && !m.up).map((m) => m.id);
		const upA = moves.filter((m) => m.from === 1 && m.up), downS = moves.filter((m) => m.from === 2 && !m.up);
		assert.deepEqual(upB, pick.filter((id) => W.team_by_id.has(id)), `the eligible go up (${elig})`);
		assert.equal(downA.length, upB.length, "as many down from A as up from B");
		assert.equal(upA.length, 2, "the A League's own promotion is untouched");
		assert.equal(downS.length, upA.length);
		for (let l = 0; l < 3; l++) assert.equal(W.league_teams(l).length, 10, "every league keeps its size");
		const champ = W.team_by_id.has(fb[0]) ? W.team(fb[0]) : null;
		if (champ) assert.equal(champ.league, 0, "the B champions stay down");
		assert.ok(W.news.some((x) => x.includes("won the B League but is not yet eligible for promotion")), "told");
		if (elig === 0) {
			for (const id of bottomA) if (W.team_by_id.has(id)) assert.equal(W.team(id).league, 1, "spared: nobody comes up");
			assert.ok(W.news.some((x) => x.includes("No B League team was eligible for promotion, so")));
		}
		if (elig === 1) assert.ok(W.news.some((x) => x.includes("Only 1 B League team was eligible for promotion, so")));
	}
});

test("a rebound: a team relegated last season goes straight back up, ahead of ineligible teams", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	toSeasonEnd(mod, game, w);
	for (const t of W.teams) { t.since = -5; t.rebound = false; }
	const moves = toNewSeason(mod, game, w);
	const down = moves.find((m) => m.from === 1 && !m.up && W.team_by_id.has(m.id));
	assert.ok(down, "someone came down from A");
	toSeasonEnd(mod, game, w);
	// Everyone else in B is new there; the rebound team finishes fifth.
	const t = W.team(down.id);
	assert.equal(t.rebound, true);
	onlyEligible(W, 0, []);
	t.rebound = true;
	W.finals[0] = W.finals[0].filter((id) => id !== t.id);
	W.finals[0].splice(4, 0, t.id);
	const again = toNewSeason(mod, game, w);
	assert.deepEqual(again.filter((m) => m.from === 0 && m.up).map((m) => m.id), [t.id]);
	assert.equal(again.filter((m) => m.from === 1 && !m.up).length, 1);
	assert.equal(t.league, 1);
	assert.equal(t.rebound, false, "back up: the flag is gone");
	assert.equal(t.since, W.season);
});

test("the reserved place: an eleven-team B League swaps as many as are eligible and keeps eleven; the revived team counts from scratch", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	days(mod, game, 7 * 3);
	const a = W.add_legacy("Test Legacy Racing", -30, -5, [200, 20, 60, 2, 0, 0, 1, 1, 20, 10, 0]);
	const me = W.revive(a.id, "Earth");
	assert.equal(me.since, 2, "revived mid-season: its first whole season is the next");
	assert.equal(me.rebound, false);
	assert.equal(W.size(0), 11);
	toSeasonEnd(mod, game, w);
	onlyEligible(W, 0, [W.finals[0].find((id) => id !== me.id)]);
	me.since = 2;
	const moves = toNewSeason(mod, game, w);
	assert.equal(moves.filter((m) => m.from === 0 && m.up).length, 1);
	assert.equal(moves.filter((m) => m.from === 1 && !m.up).length, 1);
	assert.equal(W.league_teams(0).length, 11);
	assert.equal(W.league_teams(1).length, 10);
	assert.equal(me.league, 0);
	assert.equal(W.eligible_from(me), 4);
});

test("the Standings: not yet eligible says when, the relegation zone counts the eligible challengers", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	days(mod, game, 7 * 3 + 1);
	onlyEligible(W, 0, []);
	const t = W.table(0)[0];
	t.since = W.season - 1;
	office(mod, game);
	press(mod, game, "Standings");
	const zones = () => game.panel.rows.map((r) => r.at(-1));
	assert.equal(zones()[0], "eligible in 1 season", zones().join(", "));
	assert.ok(zones().every((z) => z.startsWith("eligible in")));
	assert.ok(!zones().includes("promotion"));
	assert.match(game.panel.text, /This season no teams go up from the B League, so nobody comes down from the A League/);
	pressStarting(mod, game, "League: ");
	assert.ok(game.panel.buttons.includes("League: A"));
	assert.deepEqual(zones().slice(-2), ["safe (no challenger)", "safe (no challenger)"]);
	assert.deepEqual(zones().slice(0, 2), ["promotion", "promotion"]);
	assert.match(game.panel.text, /0 of the A League go down \(2 fewer/);
	takeOff(game);
	// One eligible: one goes down.
	onlyEligible(W, 0, [W.table(0)[5].id]);
	office(mod, game);
	press(mod, game, "Standings");
	while (!game.panel.buttons.includes("League: B")) pressStarting(mod, game, "League: ");
	assert.equal(zones()[5], "promotion");
	pressStarting(mod, game, "League: ");
	assert.deepEqual(zones().slice(-2), ["safe (no challenger)", "relegation"]);
});

test("the Paddock Book: promotion only on eligible teams, relegation priced on how many can come up", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	days(mod, game, 7 * 3 + 1);
	const chances = (l, k) => W.book.offers(W, l, k);
	// Two eligible in B, each its fair share; ineligible teams have no price.
	const two = [W.table(0)[0].id, W.table(0)[9].id];
	onlyEligible(W, 0, two);
	assert.deepEqual(chances(0, UP).map((b) => b.sel).sort(), [...two].sort());
	assert.equal(chances(1, DOWN).length, 10);
	// One eligible: a single place (a near certainty, unpriced); one goes down from A.
	onlyEligible(W, 0, [W.table(0)[4].id]);
	assert.deepEqual(chances(0, UP).map((b) => b.sel), [W.table(0)[4].id]);
	const d1 = chances(1, DOWN);
	const sum1 = d1.reduce((a, b) => a + b.chance, 0);
	onlyEligible(W, 0, [W.table(0)[4].id, W.table(0)[5].id]);
	const sum2 = chances(1, DOWN).reduce((a, b) => a + b.chance, 0);
	assert.ok(Math.abs(sum1 - 1) < 0.05 && Math.abs(sum2 - 2) < 0.05, `${sum1} ${sum2}`);
	// The priced odds keep the margin: the market's overround above one place.
	const priced = d1.filter((b) => b.priced);
	assert.ok(priced.length > 0 && priced.reduce((a, b) => a + 1 / b.odds, 0) > 1);
	// None eligible: no promotion market in B, no relegation market in A.
	onlyEligible(W, 0, []);
	assert.equal(chances(0, UP).length, 0);
	assert.equal(chances(1, DOWN).length, 0);
	assert.equal(chances(2, DOWN).length, 10, "S still relegates as many as A sends up");
});

test("a save from before eligibility: estimated from the team's history, the benefit of the doubt where it is not known", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	const est = (league, history, born = 1) => {
		const t = W.league_teams(league)[0];
		const was = [t.history, t.born, t.since, t.rebound];
		Object.assign(t, { history, born, stay_known: false });
		W.estimate_stay(t);
		const out = { since: t.since, rebound: t.rebound };
		[t.history, t.born, t.since, t.rebound] = was;
		return out;
	};
	W.season = 4;
	assert.deepEqual(est(1, "1:B:5,2:B:3,3:A:9"), { since: 3, rebound: false }, "promoted into A");
	assert.deepEqual(est(0, "1:A:10,2:B:4,3:B:3"), { since: 2, rebound: true }, "relegated into B");
	assert.deepEqual(est(1, "1:A:3,2:A:5,3:B:1"), { since: 4, rebound: false }, "promoted at this season's start");
	assert.deepEqual(est(0, "1:B:4,2:B:2,3:B:6"), { since: -2, rebound: false }, "a team of the first season: eligible");
	assert.deepEqual(est(0, "2:B:4,3:B:6", 2), { since: 2, rebound: false }, "founded in season 2");
	assert.deepEqual(est(0, "", 4), { since: 4, rebound: false }, "no history: since it was founded");
	assert.deepEqual(est(0, "", 1), { since: -2, rebound: false }, "no history, a first team: eligible");
	W.season = 1;
	// Through a real save: the team lines lose their last two fields.
	days(mod, game, 84 * 2 + 20);
	mod.on_save(game);
	const old = game.data("state").split("\n").map((l) => (l.startsWith("t|") ? l.split("|").slice(0, 39).join("|") : l)).join("\n");
	game.set_data("state", old);
	const m = new Racing();
	m.on_load(game);
	m.on_pilot_loaded(game);
	const V = m.world;
	for (const t of V.teams) {
		assert.equal(t.stay_known, true);
		const u = W.team(t.id);
		// (A team of the first season still in its league: eligible, the benefit of the doubt.)
		if (u.since >= 2 && !u.rebound) assert.equal(t.since, u.since, `${t.name} ${u.history}`);
		if (u.rebound) assert.equal(t.rebound, true, t.name);
	}
});

test("determinism: the rule plays out the same in two worlds and after a reload", { skip }, () => {
	const a = start(Racing), b = start(Racing);
	days(a.mod, a.game, 84 * 3 + 5);
	days(b.mod, b.game, 84 * 2 + 40);
	b.mod.on_save(b.game);
	const m = new Racing();
	m.on_load(b.game);
	m.on_pilot_loaded(b.game);
	days(m, b.game, 84 + 5 - 40);
	assert.equal(m.world.encode(), a.mod.world.encode());
	assert.ok(a.mod.world.teams.some((t) => t.since > 1), "teams have moved");
});
