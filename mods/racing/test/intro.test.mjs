// The intro mission line's handover (src/Intro.dados, data/racing intro.txt):
// the finale sets "racing: intro done" to 1, and the mod revives the
// Wexley-Thorne family's team in the reserved place with its four people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadMod, start, days, land, found, takeOff, SDK } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";
const NAMES = ["Wren Achterberg", "Lucius Varga", "Ambrose Kettle", "Dolores Mbeki"];

function finale(mod, game) {
	game.set_condition("racing: intro done", 1);
	land(mod, game, "Earth");
}
function reload(game) {
	const m = new Racing();
	m.on_load(game);
	m.on_pilot_loaded(game);
	return m;
}

test("the line's conditions: no team, the reserved place free; the missions are in the plugin", { skip }, () => {
	const { game, mod } = start(Racing);
	days(mod, game, 1);
	assert.equal(game.condition("racing: owns team"), 0);
	assert.equal(game.condition("racing: slot free"), 1);
	const data = join(SDK, "dist/The Racing League/data/racing intro.txt");
	assert.ok(existsSync(data));
	const text = readFileSync(data, "utf8");
	for (const n of ["The Pitch", "The Prodigy", "The Star", "The Crew Chief", "The Seat", "The Inheritance"]) assert.ok(text.includes(n), n);
	assert.match(text, /"credits" >= 1000000/);
	assert.match(text, /"racing: intro done" = 1/);
});

test("the finale: the family team revived in the reserved place, the player's, its four on cheap five-season contracts", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 7 * 3 + 2);
	const W = w();
	const people = W.people.length, season = W.season;
	finale(mod, game);
	assert.equal(game.condition("racing: intro done"), 2, "handed over");
	const me = W.mine();
	assert.equal(me.name, "Wexley-Thorne Racing");
	assert.equal(me.league, 0);
	assert.equal(W.revived_team, me.id, "in the reserved place");
	assert.equal(W.size(0), 11);
	assert.equal(me.hq, "Earth");
	assert.equal(me.since, W.first_full_season(0), "it counts its seasons from scratch");
	assert.equal(game.condition("racing: owns team"), 1);
	assert.equal(game.condition("racing: slot free"), 0);
	assert.equal(W.people.length, people + 4);
	const seats = [0, 5, 1, 3];
	NAMES.forEach((n, k) => {
		const p = W.person(me.seats[seats[k]]);
		assert.equal(p.name, n);
		assert.equal(p.team, me.id);
		assert.equal(p.contract_end, season + 4, "five seasons, this one included");
		assert.equal(p.signed, season);
		assert.ok(p.salary <= 2000 && p.salary < 0.6 * W.staff.ask(p), `${n}: ${p.salary} against an ask of ${W.staff.ask(p)}`);
		assert.equal(W.bio.text(W, p), W.intro_line.bios[k], "the bio written for them");
	});
	assert.equal(me.seats[2], 0, "research is the player's to hire");
	assert.equal(me.seats[4], 0, "and commercial");
	// The legacy: the old record, part of its prestige.
	assert.equal(me.life[5], 3, "three S League titles");
	assert.equal(me.born, season - 50);
	assert.equal(me.revival, W.REVIVE_SHARE);
	const part = W.prestige(me);
	me.revival = 1;
	W.stale();
	const full = W.prestige(me);
	me.revival = W.REVIVE_SHARE;
	W.stale();
	assert.ok(full > 55, `legendary in its day (${full})`);
	assert.ok(Math.abs(part - full * W.REVIVE_SHARE) < 1.5 && part > 30, `prestige ${part} of ${full}`);
	assert.ok(game.messages.some((m) => m.includes("Wexley-Thorne Racing is yours")));
	assert.ok(W.news.some((n) => n.includes("returns to the grid")));
	// Once: a second 1 changes nothing.
	const before = W.encode();
	finale(mod, game);
	assert.equal(game.condition("racing: intro done"), 2);
	assert.equal(W.encode(), before);
	// Saved: the bios and the state come back.
	mod.on_save(game);
	const m = reload(game);
	assert.equal(m.world.encode(), W.encode());
	assert.equal(m.world.intro, 2);
	assert.equal(m.world.bio.text(m.world, m.world.person(me.seats[1])), W.intro_line.bios[2]);
	// The talent is good for the B League, not more than that.
	const sk = NAMES.map((n) => W.people.find((p) => p.name === n).skill);
	assert.ok(sk.every((s) => s > 0.2 && s < 0.7));
});

test("graceful: a player who owns a team, or whose reserved place is taken, is paid the sponsorship back", { skip }, () => {
	{
		const { game, mod, w } = start(Racing);
		days(mod, game, 7);
		found(mod, game, 0);
		takeOff(game);
		const mine = w().mine().id, credits = game.condition("credits");
		finale(mod, game);
		assert.equal(game.condition("racing: intro done"), 3, "refunded");
		assert.equal(game.condition("credits"), credits + 400000);
		assert.equal(w().mine().id, mine, "the team is untouched");
		assert.ok(!w().teams.some((t) => t.name === "Wexley-Thorne Racing"));
		assert.ok(game.messages.some((m) => m.includes("you own a team already") && m.includes("returned in full")));
		finale(mod, game);
		assert.equal(game.condition("credits"), credits + 400000, "refunded once");
	}
	{
		const { game, mod, w } = start(Racing);
		days(mod, game, 7);
		const W = w();
		const a = W.add_legacy("Test Legacy Racing", -20, -2, [10, 1, 2, 0, 0, 0, 0, 0, 5, 0, 0]);
		W.revive(a.id, "Earth");
		W.sell(false);
		assert.equal(W.has_team(), false);
		assert.equal(W.reserved_free(), false);
		const credits = game.condition("credits");
		finale(mod, game);
		assert.equal(game.condition("racing: intro done"), 3);
		assert.equal(game.condition("credits"), credits + 400000);
		assert.equal(game.condition("racing: slot free"), 0);
		assert.ok(game.messages.some((m) => m.includes("reserved place in the B League is taken")));
	}
});

test("determinism: the handover plays out the same in two worlds", { skip }, () => {
	const a = start(Racing), b = start(Racing);
	for (const s of [a, b]) {
		days(s.mod, s.game, 30);
		finale(s.mod, s.game);
		takeOff(s.game);
		days(s.mod, s.game, 84);
	}
	assert.equal(a.mod.world.encode(), b.mod.world.encode());
	assert.equal(a.mod.world.mine().name, "Wexley-Thorne Racing");
});
