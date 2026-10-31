// What a team sells for (Value): its assets, plus premiums for its standings
// (places and titles, recent seasons most) and its marketability (sponsor
// money net of penalties, recent seasons most; the owner's own company's
// money does not count), shown part by part in the office; saves from before
// sponsor histories.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, confirmLast, takeOff, newGame } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

// Into season n, halfway through its rounds.
function midSeason(mod, game, w, n) {
	while (!(w().season === n && w().round_now() >= 5 && !w().off_season())) days(mod, game, 1);
}
// A team with a track record: seasons 1..k as "position" in `league`, and
// what sponsors paid net each of them.
function record(t, league, positions, money) {
	t.history = positions.map((p, k) => `${k + 1}:${league}:${p}`).join(",");
	t.sponsor_history = positions.map((p, k) => `${k + 1}:${league}:${money}:0`).join(",");
}
const assetsOf = (W, t) => W.franchise[t.league] * W.SALE + t.cash;

test("a champion S League team sells for a large multiple of its assets; a struggling B League team for about its assets", { skip }, () => {
	const champ = (() => {
		const { game, mod, w } = start(Racing);
		midSeason(mod, game, w, 4);
		const me = found(mod, game, 2);
		me.protect = false;
		record(me, "S", [1, 1, 1], 36e6);
		me.sponsor_net = 18e6;
		me.points = 999;
		w().stale();
		assert.equal(w().position(me), 1);
		return { W: w(), me };
	})();
	const v = champ.W.sale_value(champ.me, false);
	const a = assetsOf(champ.W, champ.me);
	assert.ok(v > 3 * a, `champion: ${v} > 3 x ${a}`);
	assert.ok(champ.W.value.standings(champ.W, champ.me) > a, "the standings alone are worth more than the assets");
	assert.ok(champ.W.value.marketability(champ.W, champ.me) > 0.3 * a);

	const { game, mod, w } = start(Racing);
	midSeason(mod, game, w, 4);
	const me = found(mod, game, 0);
	me.protect = false;
	record(me, "B", [9, 10, 8], 120000);
	me.sponsor_net = 50000;
	me.points = -1;
	w().stale();
	assert.equal(w().position(me), 10);
	const vb = w().sale_value(me, false), ab = assetsOf(w(), me);
	assert.ok(vb <= ab * 1.03, `weak: ${vb} about ${ab}`);
	assert.ok(vb >= ab - w().value.MKT_FLOOR * w().franchise[0] - 1, "never more than a small discount below the assets");
	// A forced sale pays the assets only, at the fire-sale price.
	assert.equal(champ.W.sale_value(champ.me, true), champ.W.franchise[2] * champ.W.FIRE_SALE + champ.me.cash);
});

test("marketability follows the money sponsors paid, net of penalties, not how often targets were hit", { skip }, () => {
	const { game, mod, w } = start(Racing);
	midSeason(mod, game, w, 2);
	const W = w();
	const [x, y, z] = W.league_teams(1).slice(0, 3);
	for (const t of [x, y, z]) {
		t.sponsor_net = 0; t.sponsor_history = ""; t.history = ""; t.protect = false;
		W.deals = W.deals.filter((d) => d.team !== t.id);
	}
	const deal = (t, pay, target) => {
		const d = W.sponsoring.make(W, t, W.sponsors[0], 0);
		d.offer = false; d.pay = pay; d.bonus = 0; d.penalty = 4 * pay; d.target = target; d.until = 99;
		W.deals.push(d);
		return d;
	};
	deal(x, 10000, 10);        // cheap, and it hits
	deal(y, 400000, 1);        // generous, and it misses: the penalty is paid back
	deal(z, 400000, 10);       // the same, and it hits
	for (let k = 0; k < 12; k++) for (const t of [x, y, z]) W.sponsoring.pay(W, t);
	x.last_pos = 5; y.last_pos = 5; z.last_pos = 5;
	W.sponsoring.season_end(W);
	assert.equal(x.sponsor_net, 120000);
	assert.equal(y.sponsor_net, 12 * 400000 - 4 * 400000, "paid less the penalty");
	assert.equal(z.sponsor_net, 12 * 400000);
	const m = (t) => W.value.marketability(W, t);
	assert.ok(m(y) > m(x) + 1e6, `a missed target with more money (${m(y)}) beats a hit with little (${m(x)})`);
	// (Less the fame of each team's people, which is not sponsor money.)
	const f = (t) => W.value.fame(W, t);
	assert.ok(Math.abs(m(z) - f(z) - m(y) + f(y) - W.value.MKT_K * 4 * 400000) < 1, "the penalty paid back is what the miss costs");
});

test("standings and sponsor money from older seasons count for less (DECAY a season)", { skip }, () => {
	const { game, mod, w } = start(Racing);
	midSeason(mod, game, w, 5);
	const me = found(mod, game, 2);
	const W = w();
	assert.ok(me.protect, "bought this season: the season under way is not its own");
	const at = (s) => {
		me.history = `${s}:S:1`;
		me.sponsor_history = `${s}:S:${30e6}:0`;
		me.sponsor_net = 0;
		return { st: W.value.standings(W, me), mk: W.value.sponsor_record(W, me) };
	};
	const recent = at(4), old = at(2);
	assert.ok(Math.abs(old.st / recent.st - W.value.DECAY ** 2) < 1e-9, `${old.st} / ${recent.st}`);
	const base = W.value.MKT_BASE * W.scale[2];
	assert.ok(Math.abs((old.mk) / (recent.mk) - W.value.DECAY ** 2) < 1e-9);
	assert.ok(recent.mk > 0 && Math.abs(recent.mk - (30e6 - base) * W.value.weight(W.value.now(W, me), 4)) < 1);
	// Past SEASONS seasons it is forgotten.
	assert.equal(at(5 - W.value.SEASONS - 1).st, 0);
	// The history keeps the last SEASONS seasons.
	me.sponsor_history = "";
	for (let k = 0; k < 8; k++) W.value.close_season(W, me);
	assert.equal(me.sponsor_history.split(",").length, W.value.SEASONS);
	// The season's turn closes every team's sponsor money into its history.
	while (!w().off_season() || w().finals_season !== 5) days(mod, game, 1);
	// (Not a team new owners took over since: new owners, no record.)
	const kept = W.teams.filter((t) => t.history.split(",").some((e) => e.startsWith("5:")));
	assert.ok(kept.length >= 25);
	for (const t of kept) assert.ok(t.sponsor_history.split(",").some((e) => e.startsWith("5:")), `${t.name} closed season 5`);
	assert.ok(kept.filter((t) => t.history.split(",").some((e) => e.startsWith("4:"))).every((t) => t.sponsor_history.split(",").some((e) => e.startsWith("4:"))), "and the seasons before");
});

test("self-dealing: the owner's own company's sponsorship adds its cash and nothing else to the price", { skip }, () => {
	const game = newGame();
	const mod = new Racing();
	mod.on_load(game);
	mod.on_pilot_loaded(game);
	mod.on_enter(game, "Sol");
	const W = mod.world;
	const roster = { day: 1, sponsors: [{ name: "Outside Co", sector: "Mining", budget: 5e6, fortune: 0 }] };
	mod.on_notification(game, "racing.sponsors", JSON.stringify(roster), "bridge");
	const me = found(mod, game, 1);
	takeOff(game);
	W.deals = W.deals.filter((d) => d.team !== me.id);
	const fair = W.sponsoring.fair(W, me);
	mod.on_notification(game, "racing.sponsor_offer", JSON.stringify({ id: "1", sponsor: "Player Co", sector: "Freight", team: me.name, weekly: Math.round(fair) }), "bridge");
	const own = W.deals.find((d) => d.team === me.id && d.sponsor === "Player Co");
	assert.ok(own && W.sponsoring.sign(W, own));
	assert.equal(W.sponsor("Player Co").source, "direct");
	const v0 = W.sale_value(me, false), m0 = W.value.marketability(W, me), c0 = me.cash;
	for (let k = 0; k < 10; k++) W.sponsoring.pay(W, me);
	W.sponsoring.podium(W, me, true);
	assert.ok(me.sponsor_related > 10 * own.pay - 1, "booked as related");
	assert.equal(W.value.marketability(W, me), m0, "no marketability from one's own company");
	assert.ok(Math.abs(W.sale_value(me, false) - v0 - (me.cash - c0)) < 1, "the price rises by the cash moved in, no more");
	// The same money from an outside company does count.
	const out = W.sponsoring.make(W, me, W.sponsor("Outside Co"), 1);
	out.offer = false; out.pay = own.pay; out.bonus = own.bonus;
	W.deals.push(out);
	const m1 = W.value.marketability(W, me);
	for (let k = 0; k < 10; k++) W.sponsoring.pay(W, me);
	assert.ok(W.value.marketability(W, me) > m1 + W.value.MKT_K * 10 * out.pay - 1, "an outside sponsor's money does");
	// Closed into the history, the related money still counts for nothing.
	W.value.close_season(W, me);
	const e = me.sponsor_history.split(",").at(-1).split(":");
	assert.ok(Number(e[3]) > 20 * own.pay - 1 && Number(e[2]) > 10 * out.pay - 1);
});

test("no flipping: a team new to its league (a revived one), given every sponsor it is offered and sold weeks later earns no premium over its assets and prestige", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 2);
	const W = w();
	W.bankrupt(W.league_teams(1)[0], W.GAVE_UP);
	const me = W.revive(W.archive[0].id, "Earth");
	takeOff(game);
	for (let week = 0; week < 8; week++) {
		for (const d of w().deals.filter((x) => x.team === me.id && x.offer)) w().sponsoring.sign(w(), d);
		days(mod, game, 7);
	}
	assert.ok(W.deals_of(me.id).length >= 1, "it had sponsors");
	assert.ok(me.sponsor_net > 0);
	assert.equal(W.value.standings(W, me), 0, "the season it came in is not its own record");
	assert.ok(W.sale_value(me, false) <= W.value.assets(W, me, false) + W.value.prestige(W, me), "no premium");
});

test("the office shows the price part by part: on the Finances tab and when selling", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	press(mod, game, "Finances");
	const v = w().fmt.credits(w().sale_value(me, false));
	assert.match(game.panel.text, new RegExp(`would sell for ${v} credits now: assets [\\d,]+ \\(the franchise [\\d,]+, cash [\\d,]+\\), standings [\\d,]+ .*marketability -?[\\d,]+ `));
	press(mod, game, "Sell the team");
	const ask = game.confirms.at(-1).text;
	assert.match(ask, new RegExp(`A buyer pays ${v} credits for it: assets .*standings .*marketability .*the owner's own company's money does not count.*prestige [\\d,]+ \\((an upstart|established|storied|legendary)`));
});

test("a save from before sponsor histories: estimated from the deals still running, and saved in the new format", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	const d = w().deals.find((x) => x.team === me.id && x.offer);
	w().sponsoring.sign(w(), d);
	d.until = 9;
	d.target = 10;
	d.walk = 99;
	midSeason(mod, game, w, 2);
	assert.ok(d.season_paid > 0);
	d.paid = d.season_paid + 500000;   // what it paid in season 1
	mod.on_save(game);
	const lines = game.data("state").split("\n");
	const newLen = lines.find((l) => l.startsWith("t|")).split("|").length;
	const old = lines.map((line) => line.startsWith("t|") ? line.split("|").slice(0, -7).join("|") : line).join("\n");
	game.set_data("state", old);
	const m = new Racing();
	m.on_load(game);
	m.on_pilot_loaded(game);
	const W = m.world, t = W.mine();
	assert.equal(t.id, me.id);
	assert.ok(t.sponsor_known);
	const dd = W.deals.find((x) => x.id === d.id);
	assert.equal(t.sponsor_net, dd.season_paid, "this season: what its deals paid this season");
	assert.deepEqual(t.sponsor_history.split(":").map((x, k) => k === 1 ? x : Number(x)), [1, "B", 500000, 0], "the season before: what they paid before");
	// AI teams too, from their own deals.
	for (const x of W.teams) assert.ok(x.sponsor_known && x.sponsor_net >= 0);
	assert.ok(W.sale_value(t, false) > 0);
	assert.equal(W.encode().split("\n").find((l) => l.startsWith("t|")).split("|").length, newLen);
	// And on it goes: the season's turn closes season 2.
	days(m, game, 100);
	assert.ok(W.mine().sponsor_history.split(",").some((e) => e.startsWith("2:B:")));
});
