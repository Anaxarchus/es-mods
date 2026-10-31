// Daily events: the outcome matrix (aggressive and conservative against the
// hidden roll, rock-paper-scissors), the chief's roll and its place on their
// record, the queue and its dialogs on landing, and the chief handling an
// event the player leaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, land, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

function withTeam(league = 0) {
	const s = start(Racing);
	const me = found(s.mod, s.game, league);
	takeOff(s.game);
	for (let r = 0; r < 5; r++) s.w().staff.player_hire(s.w(), s.w().people.find((p) => p.role === r && p.team === 0));
	return { ...s, me };
}
const blunders = (ev) => [...Array(ev.count()).keys()].filter((t) => ev.is_blunder(t));
const windfalls = (ev) => [...Array(ev.count()).keys()].filter((t) => !ev.is_blunder(t));

test("the templates: a varied pool, every one well formed, every seat responsible for some", { skip }, () => {
	const { w } = withTeam();
	const ev = w().events;
	assert.ok(ev.count() >= 24);
	assert.ok(blunders(ev).length >= 12 && windfalls(ev).length >= 8);
	const roles = new Set();
	for (let t = 0; t < ev.count(); t++) {
		const f = ev.fields(t);
		assert.equal(f.length, 13, f[2]);
		roles.add(ev.role(t));
		for (const k of [5, 7, 8]) for (const one of f[k].split("+")) {
			const [kind, size, tiers] = one.split(":");
			assert.ok(["cash", "dev", "dev0", "dev1", "dev2", "dev3", "dev4", "form", "deal"].includes(kind), kind);
			assert.ok(Number.isFinite(Number(size)));
			assert.equal(tiers.split(",").length, 3);
		}
		assert.equal(ev.weights(t).length, 3);
	}
	assert.deepEqual([...roles].sort(), [0, 1, 2, 3, 4]);
});

test("the outcome matrix: aggressive and conservative play rock-paper-scissors against the hidden roll", { skip }, () => {
	const { w, me } = withTeam();
	const ev = w().events;
	// h:              0          1          2
	// aggressive      in between costs a lot wins big
	// conservative    wins big   in between costs a lot
	const WIN = 1, MID = -1, LOSE = -3;
	for (const t of blunders(ev)) {
		assert.deepEqual([0, 1, 2].map((h) => ev.tier(t, 0, h)), [MID, LOSE, WIN], ev.fields(t)[2]);
		assert.deepEqual([0, 1, 2].map((h) => ev.tier(t, 1, h)), [WIN, MID, LOSE], ev.fields(t)[2]);
	}
	// What resolve does matches the matrix: a cash blunder at each roll.
	const t = blunders(ev).find((x) => ev.fields(x)[5].startsWith("cash") && ev.fields(x)[7].startsWith("cash"));
	const size = Number(ev.fields(t)[5].split(":")[1]);
	for (const option of [0, 1]) for (const h of [0, 1, 2]) {
		const inc = ev.make(w(), t);
		inc.roll = h;
		w().incidents.push(inc);
		const cash = me.cash;
		const line = ev.resolve(w(), inc, option);
		assert.ok(Math.abs(me.cash - cash - size * ev.tier(t, option, h) * ev.SCALE[me.league]) < 1, `option ${option} roll ${h}`);
		assert.ok(line.length > 10);
		assert.ok(!w().incidents.includes(inc), "answered and gone");
	}
	// Windfalls give each answer its own shape: one a sure thing, the other a gamble.
	for (const x of windfalls(ev)) {
		const varies = (k) => ev.fields(x)[k].split("+").some((e) => new Set(e.split(":")[2].split(",")).size > 1);
		const a = ev.fields(x)[5], b = ev.fields(x)[7];
		assert.ok(varies(5) || varies(7), `${ev.fields(x)[2]}: one answer is a gamble`);
		assert.notDeepEqual(a, b, "the two answers differ");
	}
});

test("letting the chief handle it rolls on their hidden skill, and the outcome goes on their record", { skip }, () => {
	const { w, me } = withTeam();
	const ev = w().events;
	const t = blunders(ev).find((x) => ev.role(x) === 3);
	const chief = w().person(me.seats[3]);
	const before = { n: chief.ev_n, good: chief.ev_good, bad: chief.ev_bad };
	const others = me.seats.filter((id, r) => r !== 3).map((id) => w().person(id).ev_n);
	for (let k = 0; k < 30; k++) {
		const inc = ev.make(w(), t);
		w().incidents.push(inc);
		ev.resolve(w(), inc, 2);
	}
	assert.equal(chief.ev_n, before.n + 30);
	assert.ok(chief.ev_good + chief.ev_bad > before.good + before.bad);
	assert.deepEqual(me.seats.filter((id, r) => r !== 3).map((id) => w().person(id).ev_n), others, "only the responsible seat's record");
	// Choosing an answer yourself leaves the record alone.
	const n = chief.ev_n;
	const inc = ev.make(w(), t);
	w().incidents.push(inc);
	ev.resolve(w(), inc, 0);
	assert.equal(chief.ev_n, n);
	// Skill decides the odds: a gifted chief does well far more often.
	const roll = (skill) => { const p = { skill }; let good = 0; for (let k = 0; k < 2000; k++) if (ev.chief_roll(w(), p) === 0) good++; return good / 2000; };
	assert.ok(roll(0.9) > roll(-0.9) + 0.3);
	// The record feeds the market: good crisis handling raises the ask.
	w().staff.forget();
	const ask = w().staff.ask(chief);
	chief.ev_good += 5;
	w().staff.forget();
	assert.ok(w().staff.ask(chief) > ask);
	// An empty seat's stand-in handles it with no record to show.
	me.seats[4] = 0;
	const t4 = blunders(ev).find((x) => ev.role(x) === 4);
	const i4 = ev.make(w(), t4);
	w().incidents.push(i4);
	assert.match(ev.label(w(), i4, 2), /stand-in/);
	ev.resolve(w(), i4, 2);
});

test("in flight: a short message, then the dialog on landing; queued events chain one after another", { skip }, () => {
	const { game, mod, w } = withTeam();
	const ev = w().events;
	ev.CHANCE = 100;
	days(mod, game, w().events.GRACE + 3);
	assert.equal(w().incidents.length, ev.QUEUE, "at most QUEUE wait");
	assert.ok(game.messages.filter((m) => m.includes("Land to respond")).length >= ev.QUEUE);
	ev.CHANCE = 0;
	// Landing opens the oldest as a dialog (a plain panel, not the screen).
	land(mod, game, "Luna");
	assert.ok(game.panel && !game.panel.full);
	assert.match(game.panel.title, /^(Trouble at the team|Good news for the team): .* \(2 more waiting\)$/);
	assert.equal(game.panel.buttons.length, 4);
	assert.match(game.panel.buttons[2], /^Let .* handle it$/);
	assert.equal(game.panel.buttons[3], "Later");
	mod.on_panel(game, 0);
	assert.match(game.panel.title, /^Outcome: /);
	assert.equal(game.panel.buttons[0], "Next event");
	mod.on_panel(game, 0);
	assert.match(game.panel.title, /1 more waiting/);
	mod.on_panel(game, 1);
	mod.on_panel(game, 0);
	mod.on_panel(game, 2);
	assert.equal(w().incidents.length, 0);
	assert.deepEqual(game.panel.buttons, ["Close"], "Luna has no bank: no office to go on to");
	mod.on_panel(game, 0);
	assert.equal(game.panel, null);
});

test("Later keeps it; the next click on the Racing button opens it first", { skip }, () => {
	const { game, mod, w } = withTeam();
	const ev = w().events;
	const inc = ev.make(w(), 0);
	w().incidents.push(inc);
	land(mod, game, "Earth");
	assert.ok(game.panel && !game.panel.full);
	mod.on_panel(game, 3);
	assert.equal(game.panel, null);
	assert.equal(w().incidents.length, 1);
	mod.on_planet_button(game);
	assert.ok(!game.panel.full, "the event before the office");
	mod.on_panel(game, 1);
	assert.deepEqual(game.panel.buttons, ["Racing office", "Close"]);
	mod.on_panel(game, 0);
	assert.ok(game.panel.full, "and on to the office");
});

test("left unanswered past the deadline, the chief handles it, on their record", { skip }, () => {
	const { game, mod, w, me } = withTeam();
	const ev = w().events;
	ev.CHANCE = 0;
	const t = blunders(ev).find((x) => ev.role(x) === 1);
	const inc = ev.make(w(), t);
	w().incidents.push(inc);
	const eng = w().person(me.seats[1]);
	const n = eng.ev_n;
	days(mod, game, ev.DAYS);
	assert.equal(w().incidents.length, 1, "not before the deadline");
	days(mod, game, 1);
	assert.equal(w().incidents.length, 0);
	assert.equal(eng.ev_n, n + 1);
	assert.ok(game.messages.some((m) => m.includes("no answer from you") && m.includes(eng.name)));
});

test("events are rare enough: about one every two weeks", { skip }, () => {
	const { game, mod, w } = withTeam();
	let made = 0;
	const make = w().events.make.bind(w().events);
	w().events.make = (...a) => { made++; return make(...a); };
	for (let d = 0; d < 280; d++) {
		days(mod, game, 1);
		for (const inc of [...w().incidents]) w().events.resolve(w(), inc, 2);
	}
	assert.ok(made >= 8 && made <= 32, `${made} events in 40 weeks`);
});
