// Buying a team (at its worth and the owners' premium, as it is), selling it
// back to AI owners, renaming (the player's and AI teams'), name histories,
// lifetimes and prestige, defunct teams and their archive, and reviving one
// in the player's reserved place in the B League.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, buy, office, press, pickRow, confirmLast, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

function midSeason(mod, game, w, n = 2) {
	while (!(w().season === n && w().round_now() >= 4 && !w().off_season())) days(mod, game, 1);
}
function toSeasonEnd(mod, game, w) {
	const s = w().season;
	while (w().finals_season !== s) days(mod, game, 1);
}
function reload(game) {
	const m = new Racing();
	m.on_load(game);
	m.on_pilot_loaded(game);
	return m;
}
// An AI team goes defunct now (as when its owners give up).
function defunct(W, t) {
	W.bankrupt(t, W.GAVE_UP);
	return W.archived(t.id);
}

test("buying a team: its worth and the owners' premium, and it comes as it is", { skip }, () => {
	for (const league of [0, 1, 2]) {
		const { game, mod, w } = start(Racing);
		midSeason(mod, game, w);
		const W = w();
		const t = W.for_sale(league)[0];
		const worth = W.sale_value(t, false), ask = W.asking_price(t);
		assert.ok(ask >= worth * (1 + W.MARKUP) - 1 && ask >= worth + W.MARKUP_MIN * W.franchise[league] - 1, `ask ${ask} on worth ${worth}`);
		const was = { id: t.id, name: t.name, cash: t.cash, seats: [...t.seats], points: t.points, history: t.history, life: [...t.life], deals: W.deals_of(t.id).map((d) => d.id + ":" + d.pay), levels: [...t.levels], names: t.names_log, budgets: [...t.budgets] };
		const pay = was.seats.filter((x) => x).map((x) => W.person(x).salary + ":" + W.person(x).contract_end);
		const before = game.condition("credits");
		const me = buy(mod, game, t.id);
		assert.equal(game.condition("credits"), before - ask);
		assert.equal(me.id, was.id);
		assert.ok(me.player && W.player_team === me.id);
		assert.equal(me.name, was.name, "its name");
		assert.equal(me.cash, was.cash, "its cash (and any debt)");
		assert.deepEqual([...me.seats], was.seats, "its staff");
		assert.deepEqual(me.seats.filter((x) => x).map((x) => W.person(x).salary + ":" + W.person(x).contract_end), pay, "on their contracts");
		assert.deepEqual(W.deals_of(me.id).map((d) => d.id + ":" + d.pay), was.deals, "its sponsors");
		assert.equal(me.points, was.points);
		assert.equal(me.history, was.history);
		assert.deepEqual([...me.life], was.life, "its lifetime");
		assert.deepEqual([...me.levels], was.levels, "its car");
		assert.deepEqual([...me.budgets], was.budgets, "its R&D budgets, until changed");
		assert.equal(me.names_log, was.names, "a purchase is no rename");
		assert.equal(me.org, 1, "run by the player: fully organised");
		assert.ok(!me.protect, "a bought team is no newcomer: not spared relegation");
		assert.equal(W.league_teams(league).length, 10);
		assert.equal(me.hq, "Earth");
		assert.match(game.panel.text, new RegExp(`You own ${me.name} in the ${["B", "A", "S"][league]} League`));
		assert.equal(W.size(0), 10, "the reserved place stays empty");
	}
});

test("the teams for sale: every team of a league with its worth part by part and its price; the credits needed; one team at a time", { skip }, () => {
	const { game, mod, w } = start(Racing, { conditions: { credits: 100000 } });
	midSeason(mod, game, w);
	office(mod, game);
	press(mod, game, "Team");
	assert.deepEqual(game.panel.columns, ["Pos", "Team", "Prestige", "Age", "Titles", "Assets", "Standings", "Marketability", "Prestige value", "Asking"]);
	assert.equal(game.panel.rows.length, 10);
	const leader = w().table(0)[0];
	assert.ok(game.panel.rows.find((r) => r[1] === leader.name).includes("not for sale"), "the leader's owners do not sell");
	assert.match(w().not_for_sale(leader), /will not sell while it leads/);
	pickRow(mod, game, leader.name);
	assert.ok(!game.panel.buttons.includes("Buy"));
	const t = w().for_sale(0)[0];
	pickRow(mod, game, t.name);
	assert.match(game.panel.text, /Names: .*founded/);
	assert.match(game.panel.text, /Prestige \d+ \(/);
	assert.match(game.panel.text, new RegExp(`Its owners ask ${w().fmt.credits(w().asking_price(t))} credits`));
	press(mod, game, "Buy");
	assert.equal(game.confirms.length, 0);
	assert.match(game.panel.text, /You need [\d,]+ credits to buy/);
	game.conditions.set("credits", 50000000);
	press(mod, game, "Buy");
	assert.match(game.confirms.at(-1).text, /Buy .* It is worth .*premium/);
	confirmLast(mod, game);
	assert.ok(w().has_team());
	assert.ok(!game.panel.buttons.includes("Buy") && !game.panel.buttons.includes("Archive"), "no buying a second");
	assert.ok(w().buy(w().for_sale(0)[0].id, "Earth").id === 0);
});

test("buying and selling at once always loses money; the team races on under AI owners, often renamed", { skip }, () => {
	let renamed = 0;
	for (const league of [0, 1, 2]) for (const which of [0, 4]) {
		const { game, mod, w } = start(Racing, { day: 1100430 + 31 * league + which });
		midSeason(mod, game, w);
		const t = w().for_sale(league)[which];
		if (which === 4) { t.last_pos = 1; t.last_league = league; }   // last season's champions ask more
		const ask = w().asking_price(t);
		assert.ok(ask >= w().sale_value(t, false) * (1 + w().MARKUP + (which === 4 ? w().CHAMP_MARKUP : 0)) - 1);
		const before = game.condition("credits");
		const me = buy(mod, game, t.id);
		press(mod, game, "Finances");
		press(mod, game, "Sell the team");
		confirmLast(mod, game);
		assert.ok(!w().has_team());
		assert.ok(game.condition("credits") < before, `league ${league}: ${game.condition("credits")} < ${before}`);
		assert.ok(w().team_by_id.has(me.id) && !me.player, "it races on");
		assert.equal(w().league_teams(league).length, 10);
		if (me.name !== t.name || me.names_log.split(";").length > 1) {
			renamed++;
			assert.match(w().names_text(me), /new owners/);
		}
	}
	assert.ok(renamed >= 1, "new owners rename it more often than not");
});

test("a team in debt still has a price; a forced sale returns the team to AI owners", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 30);
	const t = w().for_sale(0)[0];
	t.cash = -0.6e6;
	assert.ok(w().sale_value(t, false) < 0);
	assert.equal(w().asking_price(t), w().ASK_FLOOR * w().franchise[0]);
	const me = buy(mod, game, t.id);
	assert.equal(me.cash, -0.6e6, "the debt comes with it");
	takeOff(game);
	for (let k = 0; k < 21 && w().has_team(); k++) { me.cash = Math.min(me.cash, -0.6e6); days(mod, game, 1); }
	assert.ok(!w().has_team(), "force-sold");
	assert.ok(w().team_by_id.has(me.id) && !me.player);
});

test("the player's own company's deal on a team they buy: arm's length before, a related party after, and cut to its worth", { skip }, () => {
	const { game, mod, w } = start(Racing);
	midSeason(mod, game, w);
	const W = w();
	const t = W.for_sale(1).find((x) => W.deals_of(x.id).length < 3);
	const fair = W.sponsoring.fair(W, t);
	mod.on_notification(game, "racing.sponsor_offer", JSON.stringify({ id: "x1", sponsor: "Own Holdings", sector: "Finance", team: t.name, weekly: Math.round(fair * 1.4) }), "test");
	const d = W.deals.find((x) => x.sponsor === "Own Holdings");
	assert.ok(d && !d.offer, "an AI team takes it");
	const net = t.sponsor_net, rel = t.sponsor_related;
	const all = () => W.deals_of(t.id).reduce((a, x) => a + x.pay, 0);
	let paid = all();
	W.sponsoring.pay(W, t);
	assert.ok(Math.abs(t.sponsor_net - net - paid) < 1 && t.sponsor_related === rel, "while the team is not the player's, at arm's length");
	buy(mod, game, t.id);
	assert.ok(d.pay <= d.worth + 100, `cut to its worth: ${d.pay} <= ${d.worth}`);
	assert.ok(game.messages.some((m) => /does not overpay your team/.test(m)));
	const net2 = t.sponsor_net;
	paid = all();
	W.sponsoring.pay(W, t);
	assert.ok(Math.abs(t.sponsor_net - net2 - (paid - d.pay)) < 1, "the others at arm's length");
	assert.equal(t.sponsor_related, rel + d.pay, "the owner's own company now a related party");
	// The bus heard at once that the team is the player's.
	assert.ok(game.posted.some((n) => n.name === "racing.sponsors_wanted" && JSON.parse(n.payload).teams.some((x) => x.name === t.name && x.player)));
});

test("a save from before buying: a founded team keeps everything; lifetimes are estimated, low", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 200);
	const me = found(mod, game, 0);
	me.name = "Your racing team";
	takeOff(game);
	days(mod, game, 30);
	mod.on_save(game);
	const lines = game.data("state").split("\n");
	const old = lines.filter((l) => !l.startsWith("x|")).map((l) => l.startsWith("t|") ? l.split("|").slice(0, -4).join("|") : l.startsWith("w|") ? l.split("|").slice(0, -1).join("|") : l).join("\n");
	const keep = { id: me.id, cash: me.cash, seats: [...me.seats], history: me.history, protect: me.protect };
	game.set_data("state", old);
	const m = reload(game);
	const W = m.world, t = W.mine();
	assert.equal(t.id, keep.id);
	assert.equal(t.name, "Your racing team");
	assert.equal(t.cash, keep.cash);
	assert.deepEqual([...t.seats], keep.seats);
	assert.equal(t.protect, keep.protect);
	assert.equal(W.revived_team, 0);
	assert.equal(W.archive.length, 0);
	for (const x of W.teams) {
		assert.ok(x.life_known);
		const seasons = x.history ? x.history.split(",").length : 0;
		assert.equal(x.life[8] + x.life[9] + x.life[10], seasons);
		assert.equal(x.life[0], seasons * 10 + x.races);
		assert.ok(x.life[1] <= x.wins + 0 && x.life[2] === x.podiums, "this season's wins and podiums only: low");
		assert.ok(x.born >= 1 && x.born <= W.season);
		assert.equal(x.names_log.split(";").length, 1);
		assert.ok(x.names_log.endsWith(":" + x.name));
	}
	days(m, game, 100);
	assert.ok(W.mine().life[0] > 0);
});

test("renaming the team: the office's names, the rules, and everything keyed to the team keeps working", { skip }, () => {
	const { game, mod, w } = start(Racing);
	midSeason(mod, game, w);
	const me = buy(mod, game, w().for_sale(0)[0].id);
	const W = w();
	const old = me.name;
	// The rules.
	assert.match(W.name_problem("", me.id), /needs a name/);
	assert.match(W.name_problem("   ", me.id), /needs a name/);
	assert.match(W.name_problem("x".repeat(33), me.id), /at most 32/);
	const other = W.teams.find((x) => x.id !== me.id);
	assert.match(W.name_problem(other.name.toUpperCase(), me.id), /Another team/);
	assert.match(W.name_problem(old, me.id), /its name already/);
	assert.equal(W.clean_name("  Red|Line;Racing:\tTeam\n^~ "), "Red Line Racing Team");
	assert.equal(W.clean_name("Équipe Ünited 7 & Co."), "Équipe Ünited 7 & Co.");
	// A deal, a pilot's history with the old name, then the rename through the office.
	const deals = W.deals_of(me.id).map((d) => d.id);
	const pilot = W.seat(me, 0);
	W.lore.add(pilot, W.season, 1, 0, 3, W.lore.FIRST_WIN, 5, 0, me.id);
	office(mod, game);
	press(mod, game, "Team");
	press(mod, game, "Rename the team");
	assert.ok(game.panel.rows.length >= 10, "names to choose from");
	const choice = game.panel.rows[2][0];
	assert.equal(W.name_problem(choice, me.id), "");
	mod.on_panel_row(game, 2);
	press(mod, game, "Rename");
	assert.match(game.confirms.at(-1).text, new RegExp(`Rename ${old} to ${choice}`));
	confirmLast(mod, game);
	assert.equal(me.name, choice);
	assert.deepEqual(W.deals_of(me.id).map((d) => d.id), deals, "its sponsors");
	assert.ok(W.table(0).some((t) => t.name === choice && t.player), "the standings");
	assert.ok(game.posted.some((n) => n.name === "racing.team_renamed" && JSON.parse(n.payload).from === old && JSON.parse(n.payload).to === choice));
	assert.ok(game.posted.some((n) => n.name === "racing.sponsors_wanted" && JSON.parse(n.payload).teams.some((x) => x.name === choice && x.player)), "the bus's listing");
	assert.ok(W.news.some((n) => n.includes(`${old} is now ${choice}`)));
	assert.match(W.names_text(me), new RegExp(`${old} \\(season.*-> ${choice} \\(season ${W.season} on, renamed by its owner\\)`));
	assert.ok(W.lore.lines(W, pilot).some((l) => l.includes(`with ${old}`)), "history keeps the name it was won under");
	// A sponsor's direct offer under the old name still finds it.
	mod.on_notification(game, "racing.sponsor_offer", JSON.stringify({ id: "r1", sponsor: "Late Corp", team: old, weekly: 50000 }), "test");
	assert.ok(W.deals.some((d) => d.sponsor === "Late Corp" && d.team === me.id));
	// It is saved; a save and reload keeps it all.
	mod.on_save(game);
	const m = reload(game);
	assert.equal(m.world.mine().name, choice);
	assert.equal(m.world.mine().names_log, me.names_log);
	assert.ok(m.world.lore.lines(m.world, m.world.person(pilot.id)).some((l) => l.includes(`with ${old}`)));
	assert.equal(m.world.encode(), W.encode());
});

test("AI teams rename now and then: new title sponsors, rebrands; unique, recorded, and bets and deals survive", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const W = w();
	W.SPONSOR_RENAME = 100; W.REBRAND_LAST = 100;
	const bet = (() => {
		days(mod, game, 10);
		const o = W.book.offers(W, 0, 5).find((x) => x.priced);
		return W.book.place(W, o, 5000);
	})();
	const target = W.team(bet.sel);
	const deals = () => W.deals.filter((d) => d.team === target.id).map((d) => d.id);
	days(mod, game, 200);
	const renamed = W.teams.filter((t) => t.names_log.split(";").length > 1);
	assert.ok(renamed.length >= 3, `${renamed.length} renamed`);
	assert.ok(renamed.some((t) => /a new title sponsor/.test(W.names_text(t))));
	assert.ok(renamed.some((t) => /a rebrand/.test(W.names_text(t))));
	const lower = W.teams.map((t) => t.name.toLowerCase());
	assert.equal(new Set(lower).size, lower.length, "names stay unique");
	for (const t of W.teams) assert.ok(t.name.length <= 32 && W.clean_name(t.name) === t.name);
	assert.ok(W.news.some((n) => / is now .*\((a new title sponsor|a rebrand)\)/.test(n)));
	assert.ok(bet.status !== bet.VOID || !W.team_by_id.has(target.id), "a bet on a renamed team stands (by its id)");
	if (W.team_by_id.has(target.id)) assert.ok(deals().every((id) => W.deals.some((d) => d.id === id && d.team === target.id)));
});

test("AI renames and defunct teams play out the same every time, and after a reload", { skip }, () => {
	const run = (reloadAt) => {
		const { game, mod, w } = start(Racing, { day: 1100430 + 5 });
		w().SPONSOR_RENAME = 50;
		let m = mod;
		for (let d = 0; d < 400; d++) {
			if (d === reloadAt) { m.on_save(game); m = reload(game); m.world.SPONSOR_RENAME = 50; }
			days(m, game, 1);
		}
		return m.world;
	};
	const a = run(-1), b = run(-1), c = run(170);
	assert.equal(a.encode(), b.encode());
	assert.equal(a.encode(), c.encode());
	assert.ok(a.teams.some((t) => t.names_log.split(";").length > 1));
});

test("lifetimes and prestige: age and trophies, lifetime and bounded, in the price, the sponsors and renewals", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 30);
	const W = w();
	const t = W.league_teams(1)[0];
	const at = (born, life) => { t.born = born; t.life = life; return W.prestige(t); };
	const z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
	assert.ok(at(1, z) === 0, "a new team with no record: no prestige");
	let last = -1;
	for (const age of [1, 5, 20, 60, 400]) { const p = at(1 - age, z); assert.ok(p > last && p <= W.AGE_PTS); last = p; }
	last = -1;
	for (const n of [0, 1, 3, 10, 100]) { const p = at(1, [10 * n, n, 3 * n, 0, 0, n, 0, 0, 0, 0, n]); assert.ok(p > last && p < 100); last = p; }
	const legend = at(-80, [900, 200, 500, 3, 4, 12, 8, 6, 5, 10, 60]);
	assert.ok(legend > 55 && legend <= 100 && W.prestige_label(legend) === "legendary", `${legend}`);
	assert.equal(W.prestige_label(0), "an upstart");
	assert.equal(W.prestige_label(20), "established");
	assert.equal(W.prestige_label(40), "storied");
	// In the price: PRESTIGE_K of the franchise at most.
	const v = W.value.prestige(W, t);
	assert.ok(Math.abs(v - W.value.PRESTIGE_K * W.franchise[1] * legend / 100) < 1);
	assert.ok(Math.abs(W.sale_value(t, false) - (W.value.assets(W, t, false) + Math.max(0, W.value.standings(W, t)) + W.value.marketability(W, t) + v)) < 1);
	assert.ok(W.asking_price(t) > W.sale_value(t, false), "and so in the asking price");
	// Sponsors: at most PRESTIGE_PAY more.
	const pull = W.sponsoring.prestige_pull(W, t);
	assert.ok(pull > 1 && pull <= 1 + W.sponsoring.PRESTIGE_PAY);
	const fair = W.sponsoring.fair(W, t);
	at(1, z);
	assert.ok(Math.abs(fair / W.sponsoring.fair(W, t) - pull) < 1e-9);
	// Renewals: a little less at a storied team, at most PRESTIGE_STAY.
	const p = W.seat(t, 1);
	const plain = W.staff.renewal(W, p, 2);
	at(-80, [900, 200, 500, 3, 4, 12, 8, 6, 5, 10, 60]);
	const storied = W.staff.renewal(W, p, 2);
	assert.ok(storied <= plain && storied >= plain * (1 - W.staff.PRESTIGE_STAY) - 200, `${storied} vs ${plain}`);
	// A rename keeps it all.
	const before = W.prestige(t);
	W.rename(t, "Keepsake Racing", W.REBRAND);
	assert.equal(W.prestige(t), before);
	// The first teams raced before the records: older in the higher leagues.
	const { w: w2 } = start(Racing);
	const age = (l) => w2().league_teams(l).reduce((a, x) => a + (w2().season - x.born), 0) / 10;
	assert.ok(age(2) > age(0), `${age(2)} > ${age(0)}`);
	assert.ok(w2().teams.every((x) => x.born <= 1));
});

test("lifetime records add up over seasons and survive a rename and a sale", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const t = w().league_teams(2)[0];
	const id = t.id;
	days(mod, game, 2 * 84 + 10);
	const W = w();
	if (W.team_by_id.has(id)) {
		const x = W.team(id);
		const seasons = x.history.split(",").length;
		assert.equal(x.life[8] + x.life[9] + x.life[10], seasons);
		assert.ok(x.life[0] >= 10 * seasons);
	}
	const champs = W.teams.filter((x) => x.life_titles() > 0);
	assert.ok(champs.length >= 3, "two seasons' champions");
	for (const c of champs) assert.equal(c.life_titles(), c.titles);
	const drivers = W.teams.reduce((a, x) => a + x.life[6], 0) + W.archive.reduce((a, x) => a + x.life[6], 0);
	assert.ok(drivers >= 5 && drivers <= 6, `${drivers} drivers' titles in two seasons (one may be a free pilot's)`);
	const me = buy(mod, game, W.for_sale(1)[0].id);
	const life = [...me.life];
	W.rename(me, "Long Haul Racing", W.RENAMED);
	press(mod, game, "Finances");
	press(mod, game, "Sell the team");
	confirmLast(mod, game);
	assert.deepEqual([...W.team(me.id).life], life);
});

test("defunct teams: archived with their record and names, replaced by a new team of age 0; the archive is capped, champions kept", { skip }, () => {
	const { game, mod, w } = start(Racing);
	midSeason(mod, game, w);
	const W = w();
	const t = W.league_teams(1)[3];
	const life = [...t.life], born = t.born, name = t.name;
	const a = defunct(W, t);
	assert.equal(a.id, t.id);
	assert.equal(a.name, name);
	assert.deepEqual([...a.life], life);
	assert.equal(a.born, born);
	assert.equal(a.died, W.season);
	assert.ok(!W.team_by_id.has(t.id));
	assert.equal(W.league_teams(1).length, 10);
	const n = W.league_teams(1).find((x) => !x.life.some((v) => v) && x.born === W.season);
	assert.ok(n, "a new team, age 0");
	assert.ok(W.news.some((x) => x.includes(`${name} is defunct after`) && x.includes(n.name)));
	assert.match(W.names_text(a), /defunct from season/);
	// The archive in the office.
	office(mod, game);
	press(mod, game, "Team");
	press(mod, game, "Archive");
	assert.equal(game.panel.rows[0][0], name);
	pickRow(mod, game, name);
	assert.match(game.panel.text, new RegExp(`${name}: defunct in season ${W.season}`));
	// The cap: champions stay.
	W.archive[0].life[5] = 1;
	for (let k = 0; k < 40; k++) defunct(W, W.league_teams(0)[k % 10]);
	assert.ok(W.archive.filter((x) => !x.life_titles()).length <= W.ARCHIVE, "the archive keeps the last of the rest");
	assert.ok(W.archive.some((x) => x.name === name), "a champion is kept");
	// Saved.
	mod.on_save(game);
	assert.equal(reload(game).world.encode(), W.encode());
});

test("reviving a defunct team: the reserved place in the B League, its price, its prestige coming back", { skip }, () => {
	const { game, mod, w } = start(Racing);
	midSeason(mod, game, w);
	const W = w();
	assert.equal(W.size(0), 10, "the reserved place is empty");
	const old = W.league_teams(2)[0];
	old.life = [500, 40, 120, 1, 2, 3, 2, 3, 4, 6, 12];
	const a = defunct(W, old);
	const full = W.prestige_of(a, a.died);
	days(mod, game, 90);
	const price = W.revive_price(a);
	assert.ok(price > W.SALE * W.franchise[0] + W.REVIVE_CASH * W.franchise[0] + W.brand_price(a));
	const credits = game.condition("credits");
	office(mod, game);
	press(mod, game, "Team");
	press(mod, game, "Archive");
	pickRow(mod, game, a.name);
	assert.match(game.panel.text, /To revive it in the B League/);
	press(mod, game, "Revive");
	confirmLast(mod, game);
	const me = W.mine();
	assert.equal(me.id, a.id, "the same team, back");
	assert.equal(me.name, a.name);
	assert.equal(game.condition("credits"), credits - price);
	assert.equal(me.league, 0);
	assert.equal(W.size(0), 11, "an eleventh team in the B League");
	assert.equal(W.revived_team, me.id);
	assert.ok(!W.archived(a.id).id, "out of the archive");
	assert.deepEqual([...me.life], [...a.life]);
	assert.equal(me.revival, W.REVIVE_SHARE);
	assert.ok(Math.abs(W.prestige(me) - full * W.REVIVE_SHARE) < 3, "part of its prestige");
	assert.ok(me.seats.every((x) => x === 0), "stand-ins: the player hires");
	assert.equal(me.cash, W.REVIVE_CASH * W.franchise[0]);
	assert.ok(me.protect);
	assert.match(W.names_text(me), /defunct from season \d+ to \d+ -> .*revived\)/);
	assert.ok(W.news.some((n) => /After \d+ seasons? in the archive, .* returns to the grid/.test(n)));
	assert.equal(W.not_revivable(W.archive[0] ?? a), "You own a team: sell it first.");
	// Selling at once loses money.
	const sold = W.sale_value(me, false);
	assert.ok(sold < price, `${sold} < ${price}`);
	// It races, the book prices an eleven-team league, and its prestige recovers.
	takeOff(game);
	const r0 = me.races;
	days(mod, game, 30);
	assert.ok(me.races > r0, "it races from the next round");
	assert.equal(W.last[0].order.length, 22);
	assert.equal(W.table(0).length, 11);
	const p0 = me.revival;
	toSeasonEnd(mod, game, w);
	assert.ok(me.revival > p0);
	mod.on_save(game);
	assert.equal(reload(game).world.encode(), W.encode());
});

test("the eleventh team: a full season, promotion and relegation keep it in the B League; sold, the B League's last goes at the season's end and the place is free again", { skip }, () => {
	for (const lastIsMine of [false, true]) {
		const { game, mod, w } = start(Racing, { day: 1100430 + (lastIsMine ? 7 : 0) });
		days(mod, game, 70);
		const W = w();
		const a = defunct(W, W.league_teams(0)[2]);
		const b = defunct(W, W.league_teams(1)[2]);
		// Revived in the last week of the off-season, once the new season has begun.
		while (!(W.season_week() === W.WEEKS - 1 && W.weekday() === 3)) days(mod, game, 1);
		const me = W.revive(a.id, "Earth");
		assert.equal(me.id, a.id);
		assert.equal(W.book.offers(W, 0, 2).length, 11, "the book prices eleven teams");
		takeOff(game);
		toSeasonEnd(mod, game, w);
		assert.equal(me.races, W.ROUNDS, "a full season");
		assert.ok(W.finals[0].length === 11 && W.last[0].order.length === 22);
		days(mod, game, 14);
		assert.deepEqual([W.size(0), W.size(1), W.size(2)], [11, 10, 10], "promotion and relegation keep the eleventh in the B League");
		const inB = me.league === 0;
		W.sell(false);
		assert.ok(W.team_by_id.has(me.id) && !me.player, "sold, it races on");
		assert.equal(W.size(0), 11, "until the season's end");
		assert.match(W.not_revivable(W.archived(b.id)), /reserved place .* is taken/);
		if (lastIsMine && inB) me.points = -999;
		toSeasonEnd(mod, game, w);
		assert.equal(W.size(0), 10, "the B League is ten again");
		assert.ok(W.reserved_free() && W.revived_team === 0);
		const cut = W.archive.filter((x) => x.fate === W.CULLED);
		assert.equal(cut.length, 1);
		if (lastIsMine && inB) assert.equal(cut[0].id, me.id, "the revived team itself, last");
		assert.ok(W.news.some((n) => /folds as the league goes back to 10 teams/.test(n)));
		assert.equal(W.not_revivable(W.archived(b.id)), "", "the reserved place is free again");
		const again = W.revive(b.id, "Earth");
		assert.ok(again.id === b.id && W.size(0) === 11);
	}
});
