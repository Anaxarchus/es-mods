// Money: a team's weekly books, putting money in and taking it out, and the
// forced sale on deep debt (buying and selling: buying.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, office, press, pressStarting, confirmLast, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

// Days until the next money day (weekday 3), and that day.
function toMoneyDay(mod, game, w) {
	do days(mod, game, 1); while (w().weekday() !== 3);
}

test("the weekly books: salaries, running costs, R&D, sponsors and prize money", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	const pilot = w().people.find((p) => p.role === 0 && p.team === 0);
	w().staff.player_hire(w(), pilot);
	me.budgets = [10000, 10000, 0, 0, 0];
	toMoneyDay(mod, game, w);
	const cash = me.cash;
	const levels = [...me.levels];
	const sponsors = w().sponsoring.weekly(w(), me);
	toMoneyDay(mod, game, w);
	// One week: salary, running, then R&D the next day; prize money on race day.
	const r = w().last[0];
	const k = r.order.indexOf(me.id);
	const prize = k >= 0 && r.day > game.day_ - 7 ? r.prizes[k] : 0;
	const expected = cash - pilot.salary - w().RUNNING[0] * (w().off_season() ? 0.5 : 1) - 20000 + sponsors + prize;
	assert.ok(Math.abs(me.cash - expected) < 200000, `${me.cash} near ${expected}`);
	assert.ok(me.levels[0] > levels[0] && me.levels[1] > levels[1], "funded departments develop");
	assert.equal(me.levels[3], levels[3], "unfunded ones do not");
	assert.ok(w().ledger.length >= 2);
});

test("putting money in and taking it out, through the office", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	const credits = game.condition("credits");
	press(mod, game, "Finances");
	press(mod, game, "Put money in");
	const ask = game.numberAsks.at(-1);
	mod.on_number(game, ask.token, 250);
	assert.equal(me.cash, 650000);
	assert.equal(game.condition("credits"), credits - 250000);
	press(mod, game, "Take money out");
	mod.on_number(game, game.numberAsks.at(-1).token, 600);
	assert.equal(me.cash, 50000);
	assert.equal(game.condition("credits"), credits + 350000);
});

test("deep debt: past the overdraft limit two weeks running, the league forces a sale", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const me = found(mod, game, 0);
	takeOff(game);
	toMoneyDay(mod, game, w);
	me.cash = -0.3e6;
	toMoneyDay(mod, game, w);
	assert.ok(game.messages.some((m) => m.includes("overdrawn")), "a warning first");
	me.cash = -0.6e6;
	const credits = game.condition("credits");
	toMoneyDay(mod, game, w);
	assert.ok(w().has_team(), "one week past the limit: a last warning");
	me.cash = Math.min(me.cash, -0.6e6);
	toMoneyDay(mod, game, w);
	assert.ok(!w().has_team(), "sold");
	assert.ok(w().team_by_id.has(me.id) && !me.player, "the team races on under AI owners");
	assert.equal(w().league_teams(me.league).length, 10);
	assert.ok(game.messages.some((m) => m.includes("forced the sale")));
	// The sale did not cover the debt: the player paid the difference.
	assert.ok(game.condition("credits") < credits);
	assert.ok(game.condition("credits") >= 0, "credits never go below 0");
	// The player can start again.
	const again = found(mod, game, 0);
	assert.ok(again.id > 0);
});

test("on the same budget a winning team makes money and a losing one bleeds it, more so in the S League", { skip }, () => {
	const net = (league, levels) => {
		const { game, mod, w } = start(Racing);
		const me = found(mod, game, league);
		takeOff(game);
		for (let r = 0; r < 5; r++) w().staff.player_hire(w(), w().people.filter((p) => p.role === r && p.team === 0)[0]);
		const cash = me.cash;
		for (let d = 0; d < 84; d++) {
			me.levels = me.levels.map(() => levels);
			// A typical budget: 2% of the franchise a week across the departments.
			me.budgets = me.budgets.map(() => 0.004 * w().franchise[league]);
			for (const offer of w().deals.filter((x) => x.team === me.id && x.offer)) w().sponsoring.sign(w(), offer);
			for (const inc of [...w().incidents]) w().events.resolve(w(), inc, 2);
			days(mod, game, 1);
		}
		return me.cash - cash;
	};
	const sWin = net(2, 600), sLose = net(2, 5), bWin = net(0, 600), bLose = net(0, 5);
	assert.ok(sWin > 0 && bWin > 0, `winners profit (${sWin}, ${bWin})`);
	assert.ok(sLose < 0 && bLose < 0, `losers bleed (${sLose}, ${bLose})`);
	assert.ok(sWin > 5 * bWin && sLose < 10 * bLose, `S is lucrative and brutal (${sWin} vs ${bWin}, ${sLose} vs ${bLose})`);
});
