// Bios and scouts' potential (Bio): told the same way every time and across
// saves, hinting at the hidden stats (with noise, never perfectly), the peak
// people grow toward, the office showing both, and saves from before bios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, start, days, found, press, takeOff } from "./world.mjs";

const Racing = await loadMod();
const skip = !Racing && "no Dado toolchain";

function corr(xs, ys) {
	const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
	let sxy = 0, sxx = 0, syy = 0;
	for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
	return sxy / Math.sqrt(sxx * syy);
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Several worlds' pools (different start days), for the statistics.
function pools(n = 4) {
	const out = [];
	for (let k = 0; k < n; k++) {
		const { w } = start(Racing, { day: 1100430 + 977 * k });
		for (const p of w().people) out.push({ w: w(), p });
	}
	return out;
}

test("every person has a peak and a bio, told the same way each time and in a world made the same way", { skip }, () => {
	const a = start(Racing), b = start(Racing);
	const wa = a.w(), wb = b.w();
	for (let i = 0; i < wa.people.length; i++) {
		const p = wa.people[i], q = wb.people[i];
		assert.ok(p.peak > -1.0001 && p.peak <= 1 && p.peak >= p.skill0 - 1e-9, `${p.name} has a peak at or above the skill they joined with`);
		const text = wa.bio.text(wa, p);
		assert.ok(text.startsWith(p.name + " "), "a bio opens with the full name");
		assert.ok(!/\{[FPC]\}/.test(text), "every blank filled");
		assert.equal(wa.bio.text(wa, p), text, "told again, the same");
		assert.equal(wb.bio.text(wb, q), text, "the same world, the same bio");
		assert.equal(wb.bio.potential(wb, q), wa.bio.potential(wa, p));
	}
	// Variety: bios hardly ever repeat.
	const texts = new Set(wa.people.map((p) => wa.bio.text(wa, p)));
	assert.ok(texts.size >= wa.people.length * 0.98, `${texts.size} different bios of ${wa.people.length}`);
	// Telling a bio or a potential draws nothing from the world's dice.
	const state = wa.rng.state;
	for (const p of wa.people) { wa.bio.text(wa, p); wa.bio.potential(wa, p); }
	assert.equal(wa.rng.state, state);
});

test("bios and potential survive saving, and a bio does not change as the person does", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 30);
	const before = new Map(w().people.map((p) => [p.id, [w().bio.text(w(), p), p.peak, p.skill0]]));
	mod.on_save(game);
	const c = new Racing();
	c.on_load(game);
	c.on_pilot_loaded(game);
	const wc = c.world;
	for (const p of wc.people) {
		const [text, peak, skill0] = before.get(p.id);
		assert.equal(p.peak, peak);
		assert.equal(p.skill0, skill0);
		assert.equal(wc.bio.text(wc, p), text);
	}
	// A season's drift moves the skill, not the bio.
	const p = wc.people[0];
	const text = wc.bio.text(wc, p);
	p.skill = Math.max(-1, p.skill - 0.3);
	assert.equal(wc.bio.text(wc, p), text);
});

test("the scouts' potential follows the truth, with noise that narrows with a record", { skip }, () => {
	const all = pools();
	const est = all.map(({ w, p }) => w.bio.potential(w, p));
	const truth = all.map(({ w, p }) => w.bio.true_potential(p));
	const r = corr(est, truth);
	assert.ok(r > 0.65 && r < 0.97, `potential follows the truth, not exactly (r = ${r.toFixed(3)})`);
	for (const v of est) assert.ok(v >= 1 && v <= 99);
	const err = all.map(({ w, p }, i) => Math.abs(est[i] - truth[i]));
	assert.ok(err.some((e) => e > 15), "some scouts are well off");
	const rookies = all.map((x, i) => [x, err[i]]).filter(([x]) => x.p.races === 0).map(([, e]) => e);
	const veterans = all.map((x, i) => [x, err[i]]).filter(([x]) => x.p.races >= 60).map(([, e]) => e);
	assert.ok(rookies.length > 30 && veterans.length > 30);
	assert.ok(mean(rookies) > 1.3 * mean(veterans), `newcomers are harder to judge (${mean(rookies).toFixed(1)} against ${mean(veterans).toFixed(1)})`);
	// The same person's range narrows as the record grows.
	const { w, p } = all.find(({ p }) => p.races === 0);
	const wide = w.bio.high(w, p) - w.bio.low(w, p);
	p.races = 100;
	assert.ok(w.bio.high(w, p) - w.bio.low(w, p) < wide);
});

test("bios hint at the hidden stats: better people tend to better bios, and some bios mislead", { skip }, () => {
	const all = pools();
	const tiers = all.map(({ w, p }) => { w.bio.text(w, p); return [...w.bio.tiers]; });
	const skill0 = all.map(({ p }) => p.skill0);
	const path = tiers.map((t) => t[0]);
	const r = corr(path, skill0);
	assert.ok(r > 0.45 && r < 0.9, `the path into the job hints at skill (r = ${r.toFixed(3)})`);
	const rt = corr(tiers.map((t) => t[1]), all.map(({ p }) => p.trait));
	assert.ok(rt > 0.45 && rt < 0.9, `temper hints at the trait (r = ${rt.toFixed(3)})`);
	const ro = corr(tiers.map((t) => t[2]), all.map(({ p }) => p.peak - p.skill0));
	assert.ok(ro > 0.25 && ro < 0.9, `the outlook hints at room to grow (r = ${ro.toFixed(3)})`);
	const reps = tiers.map((t, i) => [t[3], skill0[i]]).filter(([t]) => t >= 0);
	const rr = corr(reps.map(([t]) => t), reps.map(([, s]) => s));
	assert.ok(rr > 0.2 && rr < r, `the paddock's word is a weaker hint (r = ${rr.toFixed(3)})`);
	// Noise: some of the best have poor bios, and some of the worst glowing ones.
	const sorted = all.map((x, i) => [skill0[i], path[i]]).sort((a, b) => a[0] - b[0]);
	const q = Math.floor(sorted.length / 4);
	const worst = sorted.slice(0, q), best = sorted.slice(-q);
	assert.ok(mean(best.map(([, t]) => t)) > mean(worst.map(([, t]) => t)) + 1.5);
	assert.ok(best.some(([, t]) => t <= 1), "a top performer with an unpromising bio");
	assert.ok(worst.some(([, t]) => t >= 3), "a poor one with a glowing bio");
});

test("newcomers grow toward their peak; veterans only drift", { skip }, () => {
	const { game, mod, w } = start(Racing);
	const st = w().staff, bio = w().bio;
	const p = w().people.find((x) => x.races === 0);
	p.skill = p.skill0 = 0;
	p.peak = 0.5;
	assert.ok(Math.abs(bio.growth(w(), p) - bio.DEVELOP * 0.5) < 1e-9);
	const v = w().people.find((x) => x.races >= 80);
	assert.equal(v.peak, v.skill0, "a long career has no room left");
	v.skill = v.skill0 - 0.2;
	assert.equal(bio.growth(w(), v), 0);
	// Over two seasons, those with room to grow gain on those without.
	const room = w().people.filter((x) => x.peak - x.skill0 > 0.2);
	const none = w().people.filter((x) => x.peak === x.skill0 && x !== v);
	assert.ok(room.length > 10 && none.length > 10);
	days(mod, game, 2 * w().WEEKS * 7 + 7);
	const gain = (xs) => mean(xs.filter((x) => w().person_by_id.has(x.id)).map((x) => x.skill - x.skill0));
	assert.ok(gain(room) > gain(none) + 0.08, `${gain(room)} against ${gain(none)}`);
	assert.ok(Math.abs(gain(none)) < 0.06, "veterans drift");
});

test("the office shows the potential on the Staff and Team tabs, and the bio beside the record", { skip }, () => {
	const { game, mod, w } = start(Racing);
	found(mod, game, 0);
	press(mod, game, "Staff");
	const col = game.panel.columns.indexOf("Potential");
	assert.ok(col > 0, "a Potential column");
	const p = w().people.find((x) => x.role === 0 && x.team === 0);
	const row = game.panel.rows.findIndex((r) => r[0] === p.name);
	assert.match(game.panel.rows[row][col], /^\d+-\d+$/);
	assert.equal(game.panel.rows[row][col], w().bio.range_text(w(), p));
	mod.on_panel_row(game, row);
	assert.ok(game.panel.text.includes(w().bio.text(w(), p)), "the bio is shown");
	assert.ok(game.panel.text.includes("Scouts' potential: " + w().bio.potential(w(), p) + " of 100"));
	for (const x of [p.skill, p.trait, p.peak]) assert.ok(!game.panel.text.includes(String(x)), "no hidden stat shown");
	// Hire them: the Team tab shows the range too.
	press(mod, game, "Hire");
	mod.on_confirm(game, game.confirms.at(-1).token);
	press(mod, game, "Team");
	const tc = game.panel.columns.indexOf("Potential");
	assert.ok(tc > 0);
	assert.equal(game.panel.rows[0][tc], w().bio.range_text(w(), p));
	assert.equal(game.panel.rows[1].length, game.panel.columns.length, "an empty seat's row still lines up");
});

test("a save from before bios: everyone gets a peak on loading, the same every time, and the world plays on", { skip }, () => {
	const { game, mod, w } = start(Racing);
	days(mod, game, 40);
	mod.on_save(game);
	// The old format: people's lines without the fields from bios on (the
	// first 29 after "p": peak and skill0, and lore and contracts, came later).
	const old = game.data("state").split("\n").map((line) => line.startsWith("p|") ? line.split("|").slice(0, 30).join("|") : line).join("\n");
	const load = () => {
		game.set_data("state", old);
		const m = new Racing();
		m.on_load(game);
		m.on_pilot_loaded(game);
		return m;
	};
	const a = load(), b = load();
	assert.ok(a.world.people.length > 200);
	for (let i = 0; i < a.world.people.length; i++) {
		const p = a.world.people[i], q = b.world.people[i];
		assert.ok(p.peak > -1.0001, "a peak");
		assert.equal(p.skill0, p.skill, "the bio is told from the skill they have now");
		assert.ok(p.peak >= p.skill);
		assert.equal(q.peak, p.peak, "the same save, the same peaks");
		assert.equal(b.world.bio.text(b.world, q), a.world.bio.text(a.world, p), "and the same bios");
		assert.equal(b.world.bio.potential(b.world, q), a.world.bio.potential(a.world, p));
	}
	// The ones with long careers have no room left; new ones some.
	assert.ok(a.world.people.filter((p) => p.races >= 60).every((p) => p.peak === p.skill));
	assert.ok(a.world.people.some((p) => p.races < 20 && p.peak > p.skill));
	// Saved again in the new format, and on it goes.
	assert.equal(a.world.encode().split("\n").find((l) => l.startsWith("p|")).split("|").length, 49);
	takeOff(game);
	const day = a.world.day;
	days(a, game, 100);
	assert.equal(a.world.day, day + 100);
	assert.ok(a.world.people.every((p) => p.peak > -1.0001), "rookies since then have peaks too");
});
