// Contracts (Staff): exclusive, 1 to 5 seasons, at a salary locked when
// signed; release clauses and buyouts that grow with what is left to run;
// AI teams buying out contracts (the player gets the money) and poaching
// people whose contracts are running out; renewals whose demands follow
// fame, form and potential, a little less for loyalty; the office's choices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, pressStarting, confirmLast, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

function record(p, n, mean) { p.s_n = n; p.s_sum = n * mean; p.races = n; }
// Past the next season's turn: contracts have run out and been renewed.
function toTurn(mod, game, w) {
	const s = w().season;
	while (!(w().season === s + 1 && w().season_week() === w().WEEKS - 1 && w().weekday() >= 2)) days(mod, game, 1);
}
const cheapestFree = (W, role) => W.people.filter((p) => p.role === role && p.team === 0).sort((a, b) => W.staff.ask(a) - W.staff.ask(b))[0];

test("hiring for five seasons through the office locks the salary while the ask grows", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	const st = w().staff;
	press(mod, game, "Staff");
	const p = cheapestFree(w(), 0);
	mod.on_panel_row(game, game.panel.rows.findIndex((r) => r[0] === p.name));
	for (let k = 0; k < 3; k++) pressStarting(mod, game, "Contract: ");
	assert.ok(game.panel.buttons.includes("Contract: 5 seasons"));
	assert.ok(game.panel.text.includes("To hire as your #1 pilot for 5 seasons: "));
	press(mod, game, "Hire");
	assert.match(game.confirms.at(-1).text, /locked to the end of season \d+ \(5 seasons\)/);
	const ask = st.ask(p), cash = me.cash;
	confirmLast(mod, game);
	assert.equal(p.team, me.id);
	assert.equal(p.contract_end, w().season + 4);
	assert.equal(p.signed, w().season);
	assert.ok(Math.abs(p.salary - ask * (1 + st.LENGTH_K * 3)) < 1e-6, "a little more a week for five seasons");
	assert.ok(Math.abs(cash - me.cash - st.SIGN * p.salary) < 1);
	// One season costs a little less than the usual two.
	assert.ok(st.player_salary_for(p, 1) < st.player_salary_for(p, 2) && st.player_salary_for(p, 2) === st.player_salary(p));
	// The person becomes a star; the salary stays where it was signed.
	const locked = p.salary;
	takeOff(game);
	record(p, 60, 2.0);
	st.forget();
	assert.ok(st.ask(p) > 5 * locked);
	// Two seasons' turns (rivals' offers for the star turned away unanswered).
	const s0 = w().season;
	while (!(w().season === s0 + 2 && w().season_week() === w().WEEKS - 1 && w().weekday() >= 2)) {
		days(mod, game, 1);
		p.offer_until = 0;
		p.offer_team = 0;
	}
	assert.equal(p.team, me.id);
	assert.equal(p.salary, locked, "locked");
	assert.equal(p.contract_end, p.signed + 4);
	assert.equal(p.loyal, 2, "two seasons served");
});

test("a contract left to run out renews for one season at the demand; renewing in the office signs for longer", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	const st = w().staff;
	const p = cheapestFree(w(), 1);
	st.player_hire_for(w(), p, 1);
	assert.equal(p.contract_end, w().season);
	assert.ok(st.can_renew(w(), p), "in its last season");
	takeOff(game);
	const was = p.salary;
	toTurn(mod, game, w);
	mod.flush(game);
	assert.equal(p.team, me.id);
	assert.equal(p.contract_end, w().season, "one season more");
	assert.ok(p.salary >= st.RENEW_FLOOR * was - 100);
	assert.ok(game.messages.some((m) => m.includes(p.name + "'s contract ran out; they stay one more season")));
	// Renewing from the Team tab: three seasons more, at the demand.
	office(mod, game);
	press(mod, game, "Team");
	mod.on_panel_row(game, game.panel.rows.findIndex((r) => r[0] === "Engineer"));
	assert.ok(game.panel.text.includes("The contract ends this season."));
	pressStarting(mod, game, "Contract: ");
	assert.ok(game.panel.buttons.includes("Contract: 3 seasons"));
	const demand = st.renewal(w(), p, 3);
	press(mod, game, "Renew");
	confirmLast(mod, game);
	assert.equal(p.contract_end, w().season + 3);
	assert.equal(p.salary, demand);
	assert.ok(!st.can_renew(w(), p));
	assert.ok(!game.panel.buttons.includes("Renew"));
});

test("renewal demands follow fame, potential and the record, and loyalty takes a little off", { skip }, () => {
	const { game, mod, w } = start(Racing);
	found(mod, game, 0);
	const st = w().staff;
	const p = w().people.find((x) => x.role === 0 && x.team === 0 && w().bio.potential(w(), x) >= 70);
	st.player_hire(w(), p);
	p.salary = 100;
	p.loyal = 0;
	const pot = w().bio.potential(w(), p);
	const r0 = st.renewal(w(), p, 2);
	const want = st.ask(p) * (1 + st.POT_K * (pot - 60) / 40);
	assert.ok(Math.abs(r0 - want) <= 50, `potential ${pot} raises the demand: ${r0} ~ ${want}`);
	p.loyal = 3;
	assert.ok(Math.abs(st.renewal(w(), p, 2) - r0 * (1 - 3 * st.LOYAL_K)) <= 100, "loyalty");
	p.loyal = 12;
	assert.ok(Math.abs(st.renewal(w(), p, 2) - r0 * (1 - st.LOYAL_MAX * st.LOYAL_K)) <= 100, "at most LOYAL_MAX seasons count");
	p.loyal = 0;
	p.fame = 80;
	st.forget();
	assert.ok(st.renewal(w(), p, 2) > r0 * 1.2, "fame");
	p.fame = 0;
	record(p, 40, 0.8);
	st.forget();
	assert.ok(st.renewal(w(), p, 2) > 2 * r0, "form");
	// Never much below what they are paid.
	p.salary = 1e6;
	assert.equal(st.renewal(w(), p, 2), st.RENEW_FLOOR * 1e6);
});

test("releasing costs the release clause, more the longer the contract has to run", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	const st = w().staff;
	const a = cheapestFree(w(), 2);
	st.player_hire_for(w(), a, 5);
	const long = st.release_cost(w(), a);
	assert.ok(Math.abs(long - st.RELEASE_K * a.salary * st.weeks_left(w(), a)) < 1e-6);
	assert.ok(st.weeks_left(w(), a) >= 4 * w().WEEKS);
	const cash = me.cash;
	st.player_fire(w(), a);
	assert.ok(Math.abs(cash - me.cash - long) < 1e-6);
	st.player_hire_for(w(), a, 1);
	assert.ok(st.release_cost(w(), a) < long / 3, "a one-season contract is cheap to end");
	assert.ok(st.release_cost(w(), a) >= st.SEVERANCE * a.salary - 1e-6, "never under the severance");
});

test("an AI team buys out a contract it can afford, the player gets the buyout, and a long contract of a rising star is dear", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	const st = w().staff;
	const pilot = cheapestFree(w(), 0);
	st.player_hire_for(w(), pilot, 5);
	record(pilot, 60, 1.5);
	pilot.best_league = 0;
	st.forget();
	const rival = w().league_teams(1)[0];
	rival.backing = 1e8;
	record(w().person(rival.seats[0]), 60, -1.5);
	st.forget();
	// The buyout: half the weeks left at the larger of salary and ask.
	const fee = st.buyout(w(), pilot);
	assert.ok(Math.abs(fee - st.BUYOUT_K * st.ask(pilot) * st.weeks_left(w(), pilot)) < 1e-6);
	assert.ok(fee > 100 * pilot.salary, "a cheap rookie's five seasons, now a star, are dear to break");
	// A rival that cannot afford it does not come.
	rival.cash = fee / 10;
	assert.equal(st.affords(w(), rival, pilot), false);
	for (let k = 0; k < 60; k++) st.poach(w(), rival);
	assert.equal(pilot.offer_until, 0, "no offer");
	// A rich one does; unmatched, the player gets the buyout.
	rival.cash = 3 * fee;
	for (let k = 0; k < 60 && !pilot.offer_until; k++) st.poach(w(), rival);
	assert.ok(pilot.offer_until > 0);
	mod.flush(game);
	assert.ok(game.messages.some((m) => m.includes("to buy out the contract")));
	pilot.offer_until = w().day;
	const paid = st.buyout(w(), pilot), cash = me.cash, rc = rival.cash;
	st.offers(w());
	assert.equal(pilot.team, rival.id);
	assert.ok(Math.abs(me.cash - cash - paid) < 1e-6, "the buyout is the player's");
	assert.ok(Math.abs(rc - rival.cash - paid) < 1e-6);
	assert.equal(pilot.loyal, 0);
	assert.equal(pilot.signed, w().season);
});

test("people whose contracts are running out are cheap to take; contracts and fees of AI teams follow the same rules", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const st = w().staff;
	// Into the off-season, in the last season of a contract.
	while (!w().off_season()) days(mod, game, 1);
	const p = w().people.find((x) => x.team !== 0 && x.contract_end === w().season);
	assert.ok(p, "someone in the last season of a contract");
	assert.ok(st.weeks_left(w(), p) <= 2);
	assert.ok(Math.abs(st.buyout(w(), p) - Math.max(st.BUYOUT_MIN * p.salary, st.BUYOUT_K * Math.max(p.salary, st.ask(p)) * st.weeks_left(w(), p))) < 1e-6);
	const q = w().people.find((x) => x.team !== 0 && x.contract_end >= w().season + 2);
	if (q) assert.ok(st.buyout(w(), q) / Math.max(q.salary, st.ask(q)) > st.buyout(w(), p) / Math.max(p.salary, st.ask(p)), "dearer with seasons to run");
	// Every hired person has a contract within 1..5 seasons from its signing.
	for (const x of w().people.filter((x) => x.team !== 0)) {
		assert.ok(x.contract_end >= w().season && x.contract_end - x.signed < st.MAX_YEARS, `${x.name}: signed ${x.signed}, to ${x.contract_end}`);
	}
	assert.equal(st.weeks_left(w(), w().people.find((x) => x.team === 0)), 0);
});
