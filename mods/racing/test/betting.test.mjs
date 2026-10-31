// The Paddock Book (Book, Bet): who may bet (no team owners; buying a team
// voids that league's bets), the board's prices (a margin on every market,
// the world's dice untouched, the same prices after a reload), settlement of
// every market (race winner, podium, winning team, head to head, both
// champions, promotion, relegation) and its voids, payouts credited, limits,
// the office's Bets tab, saving and saves from before, and the house's edge
// over a blind bettor in the long run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, pressStarting, confirmLast, takeOff, newGame } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";
const [WIN, PODIUM, TEAM, H2H, DRIVERS, TEAMS, UP, DOWN] = [0, 1, 2, 3, 4, 5, 6, 7];

// A world a few rounds into its first season.
function midSeason(rounds = 3) {
	const s = start(Racing);
	days(s.mod, s.game, 7 * rounds + 1);
	return s;
}
// A bet placed by hand on an offer (no limits: for settling every selection).
function backAll(W, offers, all = false) {
	const out = [];
	for (const o of offers) {
		if (!o.priced && !all) continue;
		const b = new o.constructor();
		Object.assign(b, { id: W.next_bet++, kind: o.kind, league: o.league, season: o.season, round: o.round, sel: o.sel, sel2: o.sel2, stake: 1000, odds: o.odds, day: W.day, label: o.label });
		W.bets.push(b);
		out.push(b);
	}
	return out;
}
// Play days until the league's next race has run.
function toRace(mod, game, W, league) {
	const round = W.book.race_round(W, league), season = W.season;
	while (!(W.last[league].season === season && W.last[league].round === round)) days(mod, game, 1);
	return W.last[league];
}

test("a team owner cannot bet; buying a team voids the bets on its league, refunded, and the others stand", { skip }, () => {
	const { game, mod, w } = midSeason();
	const W = w();
	assert.ok(W.book.can_bet(W));
	const b = W.book.offers(W, 0, WIN).find((o) => o.priced);
	const a = W.book.offers(W, 1, TEAMS).find((o) => o.priced);
	const before = game.condition("credits");
	const onB = W.book.place(W, b, 5000);
	const onA = W.book.place(W, a, 20000);
	assert.ok(onB.id && onA.id, W.book.why);
	game.set_condition("credits", before - 25000);
	const price = W.asking_price(W.for_sale(0)[0]);
	found(mod, game, 0);
	assert.ok(W.has_team());
	assert.equal(onB.status, onB.VOID, "the bet on the B League is void");
	assert.equal(onA.status, onA.OPEN, "the one on the A League stands");
	assert.equal(game.condition("credits"), before - 25000 - price + 5000, "the stake comes back (and the team is paid for)");
	assert.ok(game.messages.some((m) => /voids your bets on that league/.test(m) && /refunded/.test(m)));
	// An owner may not bet, and the office says so.
	assert.match(W.book.refuse(W, a, 20000), /owners/);
	press(mod, game, "Bets");
	assert.ok(!game.panel.buttons.includes("Place a bet"));
	mod.on_panel_row(game, 0);
	assert.ok(!game.panel.buttons.includes("Place a bet"));
	assert.match(game.panel.text, /forbids team owners/);
	// Sold, they may bet again.
	press(mod, game, "Finances");
	press(mod, game, "Sell the team");
	confirmLast(mod, game);
	assert.ok(!W.has_team() && W.book.can_bet(W));
});

test("every market's prices carry the house's margin, never touch the world's dice, and are the same after a reload", { skip }, () => {
	const { game, mod, w } = midSeason();
	const W = w();
	const state = W.rng.state;
	const kinds = (l) => [WIN, PODIUM, TEAM, H2H, DRIVERS, TEAMS].concat(l < 2 ? [UP] : []).concat(l > 0 ? [DOWN] : []);
	const prices = [];
	for (let l = 0; l < 3; l++) {
		for (const kind of kinds(l)) {
			const list = W.book.offers(W, l, kind);
			assert.ok(list.length > 0, `league ${l} market ${kind} is open`);
			for (const o of list) {
				assert.ok(o.odds <= W.book.MAX_ODDS && (!o.priced || o.odds >= W.book.MIN_ODDS));
				prices.push(`${l}:${kind}:${o.sel}:${o.sel2}:${o.odds}`);
			}
			// Each two-way head to head, and each whole market: implied chances sum past its slots.
			const groups = kind === H2H ? list.reduce((g, o, i) => (i % 2 ? g[g.length - 1].push(o) : g.push([o]), g), []) : [list];
			for (const g of groups) {
				const slots = W.book.SLOTS[kind];
				const implied = g.reduce((s, o) => s + 1 / o.odds, 0);
				const fair = g.reduce((s, o) => s + o.chance, 0);
				if (g.every((o) => o.priced)) assert.ok(implied > fair * 1.03, `market ${kind} has a margin: ${implied.toFixed(3)} over ${fair.toFixed(3)}`);
				assert.ok(Math.abs(fair - slots) < 0.15 * slots + 0.05 || kind >= DRIVERS, `market ${kind}'s chances add up to its slots (${fair.toFixed(3)})`);
				for (const o of g) if (o.priced) assert.ok(1 / o.odds > o.chance, "no price is longer than the book's own chance");
			}
		}
	}
	assert.equal(W.rng.state, state, "pricing draws nothing from the world's dice");
	// The world as saved, loaded again: the same board.
	mod.on_save(game);
	const m2 = new Racing();
	m2.on_load(game);
	m2.on_pilot_loaded(game);
	const W2 = m2.world;
	const again = [];
	for (let l = 0; l < 3; l++) for (const kind of kinds(l)) for (const o of W2.book.offers(W2, l, kind)) again.push(`${l}:${kind}:${o.sel}:${o.sel2}:${o.odds}`);
	assert.deepEqual(again, prices);
});

test("race markets settle: the winner, the podium, the winning team, teammates head to head", { skip }, () => {
	const { game, mod, w } = midSeason();
	const W = w();
	const league = 1;
	const bets = [WIN, PODIUM, TEAM, H2H].flatMap((k) => backAll(W, W.book.offers(W, league, k)));
	const r = toRace(mod, game, W, league);
	const k = (id) => r.pilots.indexOf(id);
	for (const b of bets) {
		assert.notEqual(b.status, b.OPEN, "settled with the race");
		let want;
		if (b.kind === WIN) want = k(b.sel) < 0 ? 3 : k(b.sel) === 0 ? 1 : 2;
		if (b.kind === PODIUM) want = k(b.sel) < 0 ? 3 : k(b.sel) < 3 && r.status[k(b.sel)] === 0 ? 1 : 2;
		if (b.kind === TEAM) want = r.order[0] === b.sel ? 1 : 2;
		if (b.kind === H2H) want = k(b.sel) < 0 || k(b.sel2) < 0 || (r.status[k(b.sel)] && r.status[k(b.sel2)]) ? 3 : k(b.sel) < k(b.sel2) ? 1 : 2;
		assert.equal(b.status, want, b.label);
		assert.equal(b.payout, want === 1 ? b.stake * b.odds : want === 3 ? b.stake : 0);
	}
	assert.equal(bets.filter((b) => b.kind === WIN && b.status === 1).length, bets.some((b) => b.kind === WIN && b.sel === r.pilots[0]) ? 1 : 0, "one winner");
	assert.ok(bets.filter((b) => b.kind === PODIUM && b.status === 1).length <= 3);
	assert.ok(bets.filter((b) => b.kind === H2H && b.status === 1).length <= 10, "one side of each head to head at most");
	assert.ok(game.messages.some((m) => /the Paddock Book settles the .*\(A League, round \d+\):/.test(m)));
});

test("void bets: a pilot who does not start, teammates who both retire, a race never run, a team that folds", { skip }, () => {
	const { game, mod, w } = midSeason();
	const W = w();
	const league = 0;
	const win = W.book.offers(W, league, WIN).find((o) => o.priced);
	const h2h = W.book.offers(W, league, H2H).filter((o) => o.priced);
	const [nostart] = backAll(W, [win]);
	const pairs = h2h.filter((o) => o.sel !== nostart.sel && o.sel2 !== nostart.sel);
	const [pair] = backAll(W, [pairs[0]]);
	const [other] = backAll(W, [pairs.find((o) => o.sel !== pair.sel && o.sel2 !== pair.sel)]);
	// The race as run, rewritten: the backed pilot is not in it, and the second pair both retire.
	const book = W.book;
	const raceRun = book.race_run.bind(book);
	book.race_run = (world, r) => {
		if (r.league === league) {
			const i = r.pilots.indexOf(nostart.sel);
			if (i >= 0) r.pilots[i] = 0;
			for (const id of [other.sel, other.sel2]) if (r.pilots.indexOf(id) >= 0) r.status[r.pilots.indexOf(id)] = 1;
		}
		raceRun(world, r);
	};
	toRace(mod, game, W, league);
	book.race_run = raceRun;
	assert.equal(nostart.status, nostart.VOID, "a pilot who does not start");
	assert.equal(other.status, other.VOID, "both retired");
	assert.notEqual(pair.status, pair.OPEN);
	assert.ok([1, 2].includes(pair.status), "a head to head that ran is won or lost");
	// A bet on a round that never ran (a long gap): void at the next race.
	const [stale] = backAll(W, [W.book.offers(W, 2, WIN).find((o) => o.priced)]);
	stale.round -= 1;
	toRace(mod, game, W, 2);
	assert.equal(stale.status, stale.VOID);
	// A team that folds: its bets are void.
	const teamBet = backAll(W, [W.book.offers(W, 1, TEAMS).find((o) => o.priced)])[0];
	const credits = game.condition("credits");
	W.bankrupt(W.team(teamBet.sel));
	days(mod, game, 1);
	assert.equal(teamBet.status, teamBet.VOID);
	assert.equal(game.condition("credits"), credits + teamBet.stake, "refunded");
});

test("season markets settle at the season's end: the drivers' and teams' champions, promotion and relegation", { skip }, () => {
	const { game, mod, w } = midSeason(5);
	const W = w();
	const season = W.season;
	const bets = [];
	// Every selection, priced or not (a near certainty has no price), to check them all.
	for (let l = 0; l < 3; l++) for (const k of [DRIVERS, TEAMS, UP, DOWN]) if ((k !== UP || l < 2) && (k !== DOWN || l > 0)) bets.push(...backAll(W, W.book.offers(W, l, k), true));
	assert.ok(bets.some((b) => b.kind === UP) && bets.some((b) => b.kind === DOWN));
	let champs = null;
	const end = W.end_season.bind(W);
	W.end_season = () => {
		// Promotion: the top eligible teams, as many as World.promotions says;
		// relegation: as many of the bottom not spared as go up from below.
		champs = [0, 1, 2].map((l) => {
			const up = W.promotions(l, season), down = l > 0 ? W.promotions(l - 1, season) : 0;
			const open = W.table(l).filter((t) => !t.protect).map((t) => t.id);
			return { team: W.table(l)[0].id, driver: W.drivers_table(l)[0].id, up: W.table(l).filter((t) => W.eligible(t, season)).slice(0, up).map((t) => t.id), down: down > 0 ? open.slice(-down) : [] };
		});
		end();
	};
	while (W.finals_season !== season) days(mod, game, 1);
	for (const b of bets) {
		const c = champs[b.league];
		let won;
		if (b.kind === DRIVERS) won = c.driver === b.sel;
		if (b.kind === TEAMS) won = c.team === b.sel;
		if (b.kind === UP) won = c.up.includes(b.sel);
		if (b.kind === DOWN) won = c.down.includes(b.sel);
		if (b.status === b.VOID) continue;
		assert.equal(b.status, won ? b.WON : b.LOST, b.label);
	}
	for (let l = 0; l < 3; l++) {
		assert.equal(bets.filter((b) => b.league === l && b.kind === DRIVERS && b.status === b.WON).length, 1, "one drivers' champion");
		assert.equal(bets.filter((b) => b.league === l && b.kind === TEAMS && b.status === b.WON).length, 1, "one teams' champion");
	}
	assert.equal(bets.filter((b) => b.kind === UP && b.status === b.WON).length, 4, "two up from B and from A");
	assert.equal(bets.filter((b) => b.kind === DOWN && b.status === b.WON).length, 4, "two down from A and from S");
	assert.ok(game.messages.some((m) => /settles the A League's season \d+:/.test(m)));
	// The book is shut between the season's end and the next one's start, then opens again.
	assert.equal(W.book.offers(W, 0, DRIVERS).length, 0);
	assert.equal(W.book.offers(W, 0, WIN).length, 0);
	while (W.season === season) days(mod, game, 1);
	assert.ok(W.book.offers(W, 0, DRIVERS).length > 0 && W.book.offers(W, 0, WIN).length > 0);
	assert.equal(W.book.offers(W, 0, WIN)[0].round, 0);
});

test("season markets close with two rounds to go; race markets move on to the next round once a race is run", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	assert.equal(W.book.race_round(W, 0), 0, "before the first race: round 1");
	assert.ok(W.book.season_open(W, 0));
	while (W.book.run(W, 0) < 8) days(mod, game, 1);
	assert.ok(!W.book.season_open(W, 0) && W.book.offers(W, 0, DRIVERS).length === 0);
	assert.ok(W.book.season_open(W, 2), "the S League has not run its 8th round yet");
	assert.equal(W.book.race_round(W, 0), 8);
	// On a race day, once the day is played, its race is no longer on the board.
	while (W.weekday() !== 0 || W.round_now() !== 8) days(mod, game, 1);
	assert.equal(W.last[0].round, 8);
	assert.equal(W.book.race_round(W, 0), 9);
});

test("the office: a non-owner bets from the Bets tab; the stake is taken, the bet is on the slip, a winner is paid", { skip }, () => {
	const { game, mod, w } = midSeason();
	const W = w();
	office(mod, game);
	press(mod, game, "Bets");
	assert.match(game.panel.text, /Paddock Book/);
	assert.deepEqual(game.panel.columns, ["Pilot", "Team", "Car", "Points", "Rating", "Odds"]);
	// The favourite.
	const list = W.book.offers(W, 0, WIN);
	const fav = list.reduce((a, o, i) => (o.odds < list[a].odds ? i : a), 0);
	mod.on_panel_row(game, fav);
	press(mod, game, "Place a bet");
	const ask = game.numberAsks.at(-1);
	assert.equal(ask.most, 25, "the B League's most is 25k");
	const credits = game.condition("credits");
	mod.on_number(game, ask.token, 10);
	assert.match(game.confirms.at(-1).text, /^Bet 10,000 credits on .* to win the .* at \d/);
	confirmLast(mod, game);
	assert.equal(game.condition("credits"), credits - 10000);
	const bet = W.bets.at(-1);
	assert.equal(bet.stake, 10000);
	assert.equal(bet.odds, list[fav].odds);
	press(mod, game, "Bet slip");
	assert.equal(game.panel.rows[0][1], bet.label);
	assert.equal(game.panel.rows[0][4], "open");
	// Too little, too much: refused.
	press(mod, game, "The board");
	mod.on_panel_row(game, fav);
	press(mod, game, "Place a bet");
	assert.match(W.book.refuse(W, list[fav], 30000), /most the book takes on that is 25,000/);
	assert.match(W.book.refuse(W, list[fav], 500), /least the book takes/);
	// Every market is on the board in turn, the slip too.
	for (const name of ["podium", "winning team", "head to head", "drivers' champion", "teams' champion", "promotion", "race winner"]) {
		pressStarting(mod, game, "Market:");
		assert.equal(game.panel.buttons.find((b) => b.startsWith("Market:")), "Market: " + name);
		// Promotion: only the eligible teams.
		assert.ok(game.panel.rows.length >= (name === "promotion" ? 1 : 10), name);
	}
	takeOff(game);
	const r = toRace(mod, game, W, 0);
	const won = r.pilots[0] === bet.sel;
	assert.equal(game.condition("credits"), credits - 10000 + (won ? Math.round(10000 * bet.odds) : 0));
	assert.ok(game.messages.some((m) => m.includes(bet.label) && (won ? m.includes("won") : m.includes("lost"))));
	assert.equal(W.bet_staked, 10000);
	assert.equal(W.bet_returned, won ? 10000 * bet.odds : 0);
});

test("limits: the league's least and most stake, the most a bet may win, ten open bets", { skip }, () => {
	const { w } = midSeason();
	const W = w();
	const B = W.book;
	const s = B.offers(W, 2, WIN).filter((o) => o.priced);
	const long = s.reduce((a, o) => (o.odds > a.odds ? o : a));
	assert.match(B.refuse(W, s[0], 1000), /least the book takes on the S League is 36,000/);
	assert.ok(B.max_stake(long) <= B.MAX_WIN[2] / (long.odds - 1) + 1);
	assert.match(B.refuse(W, long, B.MAX_STAKE[2]), /most the book takes/);
	for (let k = 0; k < B.MAX_OPEN; k++) assert.ok(B.place(W, s[k % s.length], 36000).id > 0, B.why);
	assert.match(B.refuse(W, s[0], 36000), /at most 10 open bets/);
	// A price that has moved is refused.
	const moved = Object.assign(new s[0].constructor(), { ...s[0], odds: s[0].odds + 1 });
	W.bets = [];
	assert.match(B.refuse(W, moved, 36000), /price has moved/);
});

test("saving: open and settled bets and the totals come back; a save from before the book has none and plays on the same", { skip }, () => {
	const { game, mod, w } = midSeason();
	const W = w();
	const placed = [WIN, H2H, DRIVERS].map((k) => W.book.place(W, W.book.offers(W, 1, k).find((o) => o.priced), 6000));
	assert.ok(placed.every((b) => b.id > 0));
	toRace(mod, game, W, 1);
	mod.on_save(game);
	const text = game.data("state");
	assert.equal(text.split("\n").filter((l) => l.startsWith("b|")).length, 3);
	const W2 = new W.constructor();
	assert.ok(W2.decode(text));
	assert.equal(W2.encode(), W.encode(), "read back exactly");
	assert.deepEqual(W2.bets.map((b) => [b.id, b.status, b.payout, b.label]), W.bets.map((b) => [b.id, b.status, b.payout, b.label]));
	// Reloaded, it plays on as the one in memory: the season's bets settle the same.
	const g2 = newGame({ day: game.day_, data: { state: text }, conditions: { credits: game.condition("credits") } });
	g2.here_ = game.here_;
	const m2 = new Racing();
	m2.on_load(g2);
	m2.on_pilot_loaded(g2);
	days(mod, game, 84);
	days(m2, g2, 84);
	assert.equal(m2.world.encode(), mod.world.encode());
	assert.ok(W.bets.every((b) => b.status !== b.OPEN), "the season's bets settled");
	assert.equal(g2.condition("credits"), game.condition("credits"), "and paid the same");
	// A save from before: a header of 16 fields and no b| lines.
	const old = text.split("\n").filter((l) => !l.startsWith("b|")).map((l, i) => (i === 0 ? l.split("|").slice(0, 16).join("|") : l)).join("\n");
	const W3 = new W.constructor();
	assert.ok(W3.decode(old));
	assert.equal(W3.bets.length, 0);
	assert.equal(W3.next_bet, 1);
	const W4 = new W.constructor();
	W4.decode(text.split("\n").filter((l) => !l.startsWith("b|")).join("\n"));
	W4.bets = []; W4.next_bet = 1; W4.bet_staked = 0; W4.bet_returned = 0;
	assert.equal(W3.encode(), W4.encode());
});

test("the house's edge: a blind bettor backing every price of every market loses over seasons, in every race market and in the season's", { skip }, () => {
	const totals = {};
	for (const seed of [0, 1]) {
		const { game, mod, w } = start(Racing, { day: 1100430 + 977 * (seed + 50) });
		const W = w();
		const settle = W.book.settle.bind(W.book);
		W.book.settle = (world, b, status) => {
			settle(world, b, status);
			if (!b.blind) return;
			const t = (totals[b.kind] ??= { staked: 0, back: 0, n: 0 });
			t.staked += 1 / b.odds; t.back += b.payout / b.odds; t.n++;
		};
		for (let d = 0; d < 84 * 3; d++) {
			const wd = W.weekday(), sw = W.season_week();
			const tl = (wd + 1) % 7, tw = wd === 6 ? (sw + 1) % W.WEEKS : sw;
			if (tl <= 2 && tw < W.ROUNDS) for (const k of [WIN, PODIUM, TEAM, H2H]) for (const b of backAll(W, W.book.offers(W, tl, k))) { b.stake = 1; b.blind = true; }
			for (let l = 0; l < 3; l++) if (sw === 4 && wd === l && W.book.season_open(W, l)) for (const k of [DRIVERS, TEAMS, UP, DOWN]) for (const b of backAll(W, W.book.offers(W, l, k))) { b.stake = 1; b.blind = true; }
			days(mod, game, 1);
		}
	}
	// Stakes that would each win the same (1 / odds), so longshots do not swamp it.
	// The race markets one by one; the season markets (fewer, noisier) together.
	let staked = 0, back = 0;
	const season = { staked: 0, back: 0, n: 0 };
	for (const [k, t] of Object.entries(totals)) {
		staked += t.staked; back += t.back;
		if (Number(k) <= H2H) assert.ok(t.back / t.staked < 0.98, `market ${k} loses for the blind bettor (${(100 * (t.back / t.staked - 1)).toFixed(1)}% on ${t.n} bets)`);
		else { season.staked += t.staked; season.back += t.back; season.n += t.n; }
	}
	assert.ok(season.back / season.staked < 0.98, `the season markets lose for the blind bettor (${(100 * (season.back / season.staked - 1)).toFixed(1)}% on ${season.n} bets)`);
	const edge = 1 - back / staked;
	assert.ok(edge > 0.04 && edge < 0.2, `the house keeps about its margin: ${(100 * edge).toFixed(1)}%`);
});

test("bets change nothing in the world: the same world with and without them plays out the same", { skip }, () => {
	const a = start(Racing), b = start(Racing);
	days(a.mod, a.game, 20);
	days(b.mod, b.game, 20);
	const W = a.w();
	for (const k of [WIN, PODIUM, TEAM, H2H, DRIVERS, TEAMS, UP]) {
		const o = W.book.offers(W, 0, k).find((x) => x.priced);
		assert.ok(W.book.place(W, o, 2000).id > 0, W.book.why);
	}
	days(a.mod, a.game, 200);
	days(b.mod, b.game, 200);
	const strip = (text) => text.split("\n").filter((l) => !l.startsWith("b|")).map((l, i) => (i === 0 ? l.split("|").slice(0, 16).join("|") : l)).join("\n");
	assert.ok(a.w().bets.length >= 7 && a.w().bets.every((x) => x.status !== x.OPEN));
	assert.equal(strip(a.w().encode()), strip(b.w().encode()));
});
