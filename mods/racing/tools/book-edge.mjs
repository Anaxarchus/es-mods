// The Paddock Book's edge: AI-only worlds for many seasons, with a blind
// bettor who backs every priced selection of every market: each league's
// race markets the day before every round, and its season markets at the
// season's start, after round 4 and at the last day they are open (after
// round 7). Settled by the book's own code. Prints the return on stakes by
// market and by odds, for level stakes (1 a bet) and for stakes that win the
// same (1 / odds a bet). Run: node tools/book-edge.mjs [seeds] [seasons] [first seed]
// MARKETS=race or season backs only those. OUT=<file> writes the totals
// as JSON (to add up runs). DUMP=<file> writes every
// offer's chance and outcome (for fitting). With BIO=1 a second bettor backs only teammates head to head whose
// scouts' potential is 15+ above their teammate's while the book makes them
// the outsider (reading the bios and the scouts: the skill edge).
import { loadMod, start } from "../test/world.mjs";

const Racing = await loadMod();
const seeds = Number(process.argv[2] ?? 4);
const seasons = Number(process.argv[3] ?? 6);
const first = Number(process.argv[4] ?? 0);
const names = ["race winner", "podium", "winning team", "head to head", "drivers' champion", "teams' champion", "promotion", "relegation"];
const buckets = [[1, 2], [2, 4], [4, 10], [10, 30], [30, 100], [100, 1e9]];
const acc = {};
const add = (key, b) => {
	const a = (acc[key] ??= { n: 0, staked: 0, back: 0, eq: 0, eqback: 0, won: 0, void: 0 });
	a.n++; a.staked += b.stake; a.back += b.payout; a.won += b.status === 1; a.void += b.status === 3;
	a.eq += 1 / b.odds; a.eqback += b.payout / b.stake / b.odds;
};
const bio = { n: 0, staked: 0, back: 0 };
const dump = process.env.DUMP ? [] : null;
let groups = 0;
for (let s = 0; s < seeds; s++) {
	const { game, mod, w } = start(Racing, { day: 1100430 + 977 * (s + first) });
	const W = w();
	const book = W.book;
	for (const k of ["PERSIST", "DRIFT", "NOISE", "W_PILOT", "SEASON_SIMS", "RACE_SIMS"]) if (process.env[k]) book[k] = Number(process.env[k]);
	const settle = book.settle.bind(book);
	book.settle = (world, b, status) => {
		settle(world, b, status);
		if (b.tag) { add(names[b.kind], b); const o = buckets.findIndex(([lo, hi]) => b.odds >= lo && b.odds < hi); add("odds " + buckets[o].join("-"), b); if (process.env.CROSS) add(names[b.kind] + " @" + buckets[o][0], b); add("all", b); if (b.kind <= 3) add("race markets", b); else add("season markets", b); }
		if (b.bio) { bio.n++; bio.staked += b.stake; bio.back += b.payout; }
		if (dump && b.dumped && status !== 3) dump.push([b.group, b.kind, b.chance, status === 1 ? 1 : 0, b.first ? 1 : 0]);
	};
	const back = (league, kinds, tag = true) => {
		book.cache_day = -1;
		for (const kind of kinds) {
			groups++;
			for (const o of book.offers(W, league, kind)) {
				// The bettor is no real customer: no limits, every price taken
				// (unpriced ones only into the dump, for fitting).
				if (!o.priced && !dump) continue;
				const x = new o.constructor();
				Object.assign(x, { id: W.next_bet++, kind: o.kind, league: o.league, season: o.season, round: o.round, sel: o.sel, sel2: o.sel2, stake: 1, odds: o.odds, day: W.day, label: o.label });
				W.bets.push(x);
				x.tag = tag && o.priced;
				x.dumped = tag;
				x.chance = o.chance;
				x.group = kind === 3 ? groups * 100 + Math.min(o.sel, o.sel2) % 100 : groups;
				x.first = kind === 3 && W.seat(W.team(W.person(o.sel).team), 0).id === o.sel;
			}
		}
	};
	const total = 84 * seasons;
	for (let d = 0; d < total; d++) {
		const sw = W.season_week(), wd = W.weekday();
		// Tomorrow's race: league (wd + 1) % 7 in race weeks (B's is weekday 0 of the next week).
		const tw = wd === 6 ? (sw + 1) % W.WEEKS : sw;
		const tl = (wd + 1) % 7;
		if (process.env.MARKETS !== "season" && tl <= 2 && tw < W.ROUNDS && W.day >= W.start_day - 1) {
			back(tl, [0, 1, 2, 3]);
			if (process.env.BIO) {
				for (const o of book.offers(W, tl, 3)) {
					const a = W.person(o.sel), m = W.person(o.sel2);
					if (o.priced && o.odds > 2.0 && W.bio.potential(W, a) >= W.bio.potential(W, m) + 15) {
						const x = new o.constructor();
						Object.assign(x, { id: W.next_bet++, kind: o.kind, league: o.league, season: o.season, round: o.round, sel: o.sel, sel2: o.sel2, stake: 1, odds: o.odds, day: W.day, label: o.label });
						W.bets.push(x); x.bio = true;
					}
				}
			}
		}
		// Season markets: the first day of the new season's book, after round 4, and the last day open.
		for (let l = 0; l < 3; l++) {
			const run = book.run(W, l);
			const when = (sw === W.WEEKS - 1 && wd === 3) || (W.week() < 0) || (sw === 4 && wd === l) || (sw === 7 && wd === l);
			if (process.env.MARKETS !== "race" && when && book.season_open(W, l)) back(l, [4, 5, 6, 7]);
		}
		game.day_ += 1;
		mod.on_day(game, game.day_);
		W.player_events = [];
	}
}
if (process.env.OUT) (await import("node:fs")).writeFileSync(process.env.OUT, JSON.stringify({ acc, bio }));
const pct = (x) => (x >= 0 ? "+" : "") + (100 * x).toFixed(1) + "%";
console.log(`${seeds} worlds x ${seasons} seasons`);
console.log("market".padEnd(20), "bets".padStart(7), "won".padStart(6), "void".padStart(5), "level stakes".padStart(13), "equal wins".padStart(11));
for (const [k, a] of Object.entries(acc)) console.log(k.padEnd(20), String(a.n).padStart(7), String(a.won).padStart(6), String(a.void).padStart(5), pct(a.back / a.staked - 1).padStart(13), pct(a.eqback / a.eq - 1).padStart(11));
if (dump) (await import("node:fs")).writeFileSync(process.env.DUMP, JSON.stringify(dump));
if (process.env.BIO) console.log("bio reader (head to head, outsiders with 15+ more potential):", bio.n, "bets", pct(bio.back / bio.staked - 1));
