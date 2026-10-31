// Tests of the faction model: the minors, rebellion (secession and
// defection), several wars at once, the war-likelihood rule, peace terms,
// territory over time, operations, the chronicle, the bounds on what is saved,
// and old saves. Each drives the built mod with the mock game (harness.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MockGame } from './mock.mjs';
import { Diplomacy, skip, HERE, loadTestGalaxy, GOVS, FLOT, CAPITALS, MINORS, sideOf, minorOf, veteran, forced, day, state, wars, fleets, holdings, give, edit, nonZeroConditions, minorIndex, sysIndex } from './harness.mjs';
import { check as checkRegions, dados } from '../tools/regions/build.mjs';

const galaxy = loadTestGalaxy();
const run = (game, mod, n) => { for (let k = 0; k < n; k++) day(game, mod, null); };
const rebelGov = k => MINORS[k].rebels;

test('the minors are valid, contiguous, cover human space, and keep the capitals in the cores', () => {
	const json = JSON.parse(readFileSync(join(HERE, 'galaxy.json'), 'utf8'));
	assert.deepEqual(checkRegions(json), []);
	assert.equal(readFileSync(join(HERE, '..', 'src', 'Regions.dados'), 'utf8'), dados(), 'src/Regions.dados is what tools/regions/build.mjs makes');
	for (const [major, capital] of Object.entries({ 'Republic': 'Sol', 'Free Worlds': 'Gamma Corvi', 'Syndicate': 'Markab' })) {
		const core = MINORS.filter(m => m.core && m.parent === major);
		assert.equal(core.length, 1, major + ' has one core');
		assert.ok(core[0].systems.includes(capital), major + '\'s core holds ' + capital);
	}
	const majors = ['Republic', 'Free Worlds', 'Syndicate'];
	for (const major of majors) {
		const others = MINORS.filter(m => !m.core && m.parent === major).length;
		assert.ok(others >= 2 && others <= 6, major + ' has the core and 2-6 other minors: ' + others);
	}
	// A broken table is caught.
	const bad = JSON.parse(JSON.stringify(json));
	bad.systems['Sol'].government = 'Syndicate';
	assert.ok(checkRegions(bad).some(p => /Sol/.test(p)), 'a capital that is not its major\'s is caught');
});

test('a core never rebels, and a forced rebellion of one does nothing', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	for (const k of MINORS.map((m, k) => m.core ? k : -1).filter(k => k >= 0)) {
		const before = new Map(game.governments);
		game.setCond('diplomacy: force rebellion', k + 1);
		day(game, mod);
		assert.ok(game.names.every(n => game.governments.get(n) === before.get(n) || !MINORS[k].systems.includes(n)), MINORS[k].name + ' did not rise');
		assert.equal(state(game).stats.rebellions || 0, 0);
	}
});

test('a separatist rebellion forms its own faction and government, at war with its old parent, until it is taken back', { skip }, () => {
	const k = minorIndex('Paradise Worlds');
	let recaptured = 0, dissolved = 0;
	for (let seed = 0; seed < 6; seed++) {
		const { game, mod } = veteran(galaxy, { start: seed * 311 });
		game.setCond('diplomacy: force rebellion', k + 1);
		game.setCond('diplomacy: force outcome', 1);
		day(game, mod);
		const held = holdings(game, k);
		const rebels = 5 + k;
		assert.ok(held[rebels] >= 10, 'the Paradise Worlds declare for the ' + rebelGov(k) + ': ' + JSON.stringify(held));
		assert.equal(game.governments.get('Pollux'), 'Paradise Secession', 'its systems fly the rebels\' government');
		const w = wars(game).find(w => w.kind === 2);
		assert.ok(w && w.a === rebels && w.b === 1 && w.goals[0] === k, 'a rebellion: the rebels against the Republic, over the Paradise Worlds');
		assert.equal(game.cond('diplomacy: minor Paradise Worlds rebel'), 1);
		assert.equal(game.cond('diplomacy: rebels'), 1);
		assert.equal(game.cond('diplomacy: stat separatists'), 1);
		assert.ok(state(game).chronicle.some(e => /rises against the Republic/.test(e)), 'the chronicle tells it');
		assert.ok(game.attitude('Paradise Secession', 'Republic Flotilla') === -1 && game.attitude('Republic', 'Paradise Secession') === -1, 'the rebels and the Republic (its navy and flotillas) are hostile');
		const start = held[rebels];
		for (let d = 0; d < 700 && (holdings(game, k)[rebels] || 0) >= start; d++) day(game, mod);
		if ((holdings(game, k)[rebels] || 0) < start) recaptured++;
		for (let d = 0; d < 1500 && (holdings(game, k)[rebels] || 0) > 0; d++) day(game, mod);
		if (!holdings(game, k)[rebels]) dissolved++;
		assert.ok(fleets(game).every(x => x.side !== rebels || holdings(game, k)[rebels]), 'a rebel faction with nothing left has no flotillas');
	}
	console.log(`  the Republic retook part of the Paradise Worlds in ${recaptured} of 6 runs, all of it in ${dissolved}`);
	assert.ok(recaptured >= 3, 'the old parent takes rebel systems back');
	assert.ok(dissolved >= 1, 'and sometimes the whole rebellion');
});

test('a defection hands the minor to a bordering major and starts a war over it at once', { skip }, () => {
	const k = minorIndex('South Frontier');
	const { game, mod } = veteran(galaxy);
	run(game, mod, 2);
	const nWars = wars(game).length;
	game.setCond('diplomacy: force rebellion', k + 1);
	game.setCond('diplomacy: force outcome', 2);
	day(game, mod);
	const held = holdings(game, k);
	assert.ok(held[1] === MINORS[k].systems.length, 'the Southern Frontier goes over to the Republic, which already held Graffias: ' + JSON.stringify(held));
	const w = wars(game).find(w => w.kind === 3);
	assert.ok(w && w.a === 2 && w.b === 1 && w.goals.length === 1 && w.goals[0] === k, 'the Free Worlds declare war on the Republic with the minor as the goal');
	assert.ok(wars(game).length >= Math.min(nWars + 1, 4));
	assert.equal(game.cond('diplomacy: minor South Frontier owner'), 1);
	assert.equal(game.cond('diplomacy: stat defections'), 1);
	assert.ok(state(game).chronicle.some(e => /defects to the Republic/.test(e)));
	// Its garrisons fight for the new patron: its systems are the Republic's.
	assert.equal(game.governments.get('Antares'), 'Republic');
	// The Free Worlds win the defection war: what went over comes back, and as
	// they then hold 6 of its 7 systems, the Republic cedes Graffias too.
	edit(game, s => { const x = s.wars.find(x => x[0] === w.id); x[5] = game.today + 1; x[6] = 40; });
	day(game, mod); day(game, mod);
	assert.ok(!wars(game).some(x => x.id === w.id), 'the defection war is over');
	assert.equal(holdings(game, k)[2], MINORS[k].systems.length, 'the defected systems are back with the Free Worlds, and Graffias ceded: ' + JSON.stringify(holdings(game, k)));
	assert.ok(state(game).chronicle.some(e => /give back 6 systems; the Republic cede the Southern Frontier \(1 system\)/.test(e)), 'the terms say so');
});

test('with no major on its border a rising minor goes separatist', { skip }, () => {
	const k = minorIndex('Lower Core');
	const { game, mod } = veteran(galaxy);
	run(game, mod, 50);    // after "navy done with algenib" in the real game; here Gienah and Algenib are the pirates' already
	game.setCond('diplomacy: force rebellion', k + 1);
	game.setCond('diplomacy: force outcome', 2);
	day(game, mod);
	assert.ok((holdings(game, k)[5 + k] || 0) > 0, 'the Lower Core secedes: ' + JSON.stringify(holdings(game, k)));
	assert.equal(state(game).stats.defections || 0, 0);
});

test('both outcomes occur, and rebellions are rare', { skip }, () => {
	const k = minorIndex('South Frontier');
	let sep = 0, def = 0;
	for (let seed = 0; seed < 30; seed++) {
		const { game, mod } = veteran(galaxy, { start: seed * 97 });
		game.setCond('diplomacy: force rebellion', k + 1);
		day(game, mod);
		const st = state(game).stats;
		sep += st.separatists || 0;
		def += st.defections || 0;
	}
	console.log(`  the Southern Frontier rising, 30 runs: ${sep} separatist, ${def} defection`);
	assert.ok(sep > 0 && def > 0, 'both happen');
});

test('several wars run at once, up to the cap', { skip }, () => {
	const { game, mod } = forced(galaxy);
	game.setCond('diplomacy: force war', 12);
	day(game, mod);
	game.setCond('diplomacy: force war', 13);
	day(game, mod);
	const ws = wars(game);
	assert.ok(ws.some(w => w.a === 1 && w.b === 2) && ws.some(w => w.a === 1 && w.b === 3), 'the Republic fights the Free Worlds and the Syndicate at once');
	assert.equal(game.cond('diplomacy: at war 1') + game.cond('diplomacy: at war 2') + game.cond('diplomacy: at war 3'), 3);
	assert.equal(game.cond('diplomacy: wars'), ws.length);
	for (const [k, w] of ws.entries()) {
		assert.equal(game.cond('diplomacy: war ' + (k + 1) + ' a'), w.a);
		assert.equal(game.cond('diplomacy: war ' + (k + 1) + ' goal'), w.goals[0] + 1);
	}
	const w12 = ws.find(w => w.b === 2).id, w13 = ws.find(w => w.b === 3).id;
	const seen = new Set();
	for (let d = 0; d < 30; d++) { day(game, mod); for (const x of fleets(game)) if (x.side === 1) seen.add(x.war); }
	assert.ok(seen.has(w12) && seen.has(w13), 'the Republic sends flotillas into both wars');
});

test('war is likelier between majors that split a minor than over whole ones (statistical)', { skip }, () => {
	// Scenario A: the Veteran galaxy, where the Republic and the Free Worlds
	// split three minors. Scenario B: the same with each of them whole (the
	// Free Worlds' parts given to the Republic, which then holds minors the Free
	// Worlds claim). Over 20 pilots each, with the scripted border crisis taken
	// out, count the days until the two first go to war.
	function wait(splitThem) {
		const days = [];
		for (let seed = 0; seed < 20; seed++) {
			const g = loadTestGalaxy();
			if (!splitThem) for (const short of ['Central Dirt Belt', 'East Dirt Belt', 'South Frontier'])
				for (const s of MINORS[minorIndex(short)].systems) if (g.systems.get(s).government === 'Free Worlds') g.systems.get(s).government = 'Republic';
			const { game, mod } = forced(g, { start: seed * 131 });
			run(game, mod, 1);
			edit(game, s => { s.first_war = 1; s.next_declare = 0; });
			let d = 0;
			for (; d < 1000; d++) {
				day(game, mod);
				if (wars(game).some(w => (w.a === 1 && w.b === 2) || (w.a === 2 && w.b === 1))) break;
			}
			days.push(d);
		}
		return days.sort((x, y) => x - y);
	}
	const split = wait(true), whole = wait(false);
	const median = v => v[v.length >> 1];
	console.log(`  days until the Republic and the Free Worlds go to war, 20 pilots: median ${median(split)} with split minors (${split.join(' ')}), ${median(whole)} with whole ones (${whole.join(' ')})`);
	assert.ok(median(split) * 2 < median(whole), 'split minors bring war much sooner');
});

test('peace terms cede the rest of a goal minor to a winner who holds most of it', { skip }, () => {
	const k = minorIndex('Central Dirt Belt');
	const { game, mod } = forced(galaxy);
	run(game, mod, 1);
	// The Free Worlds hold 9 of its 13 systems; the Republic 4.
	const rep = MINORS[k].systems.filter(s => game.governments.get(s) === 'Republic');
	for (const s of rep.slice(0, rep.length - 4)) game.governments.set(s, 'Free Worlds');
	day(game, mod);
	assert.equal(holdings(game, k)[1], 4);
	edit(game, s => {
		s.wars.push([50, 2, 1, 1, game.today - 30, game.today + 1, 40, 100, 400, 3, 0, 0, 0, 1, k]);
		s.next_war = 51;
		s.first_war = 1;
	});
	day(game, mod);
	day(game, mod);
	assert.ok(!wars(game).some(w => w.id === 50), 'the war is over');
	assert.equal(holdings(game, k)[2], MINORS[k].systems.length, 'the Republic cedes the Central Dirt Belt: ' + JSON.stringify(holdings(game, k)));
	assert.ok(state(game).chronicle.some(e => /Peace: The Free Worlds win.*cede the Central Dirt Belt \(4 systems\)/.test(e)), 'the chronicle gives the terms');
	assert.ok(state(game).truce[1][2] > game.today, 'a truce follows');
});

test('peace terms return core systems taken in that war (not on a draw), and leave the rest where it stands', { skip }, () => {
	function peace(score) {
		const { game, mod } = forced(galaxy);
		run(game, mod, 1);
		const ac = sysIndex(game, 'Alpha Centauri'), ar = sysIndex(game, 'Arcturus'), vega = sysIndex(game, 'Vega');
		game.governments.set('Alpha Centauri', 'Free Worlds');   // Earth's core, taken in this war
		game.governments.set('Arcturus', 'Free Worlds');         // a Central Dirt Belt system, taken in this war
		game.governments.set('Vega', 'Free Worlds');             // Earth's core, taken before it
		day(game, mod);
		edit(game, s => {
			s.wars.push([60, 2, 1, 1, game.today - 30, game.today + 1, score, 100, 100, 2, 0, 0, 0, 1, minorIndex('Central Dirt Belt')]);
			s.captures.push([ac, 1, 2, game.today - 20, 60, 1, game.today - 20], [ar, 1, 2, game.today - 20, 60, 1, game.today - 20], [vega, 1, 2, game.today - 200, 0, 1, game.today - 200]);
			s.next_war = 61; s.first_war = 1; s.next_declare = game.today + 1000;
		});
		day(game, mod); day(game, mod);
		assert.ok(!wars(game).some(w => w.id === 60));
		return ['Alpha Centauri', 'Arcturus', 'Vega'].map(s => game.governments.get(s));
	}
	assert.deepEqual(peace(20), ['Republic', 'Free Worlds', 'Free Worlds'], 'a Free Worlds win under 60: the core system taken in it goes back; the rest stays');
	assert.deepEqual(peace(70), ['Free Worlds', 'Free Worlds', 'Free Worlds'], 'an overwhelming win keeps it');
	assert.deepEqual(peace(5), ['Free Worlds', 'Free Worlds', 'Free Worlds'], 'a draw leaves everything where it stands');
});

test('a capital is never taken, even in a war over its core', { skip }, () => {
	const { game, mod } = forced(galaxy);
	run(game, mod, 1);
	const sol = sysIndex(game, 'Sol');
	edit(game, s => {
		s.first_war = 1; s.next_declare = game.today + 1000;
		s.wars = [[80, 2, 1, 1, game.today - 10, game.today + 100, 0, 0, 0, 0, 0, 0, 0, 1, minorIndex('Earth')]];
		s.next_war = 81;
		s.fleets = [[700, 2, 80, 600, 3, 0, 0, 600, sol, sol, sysIndex(game, 'Spica'), 0, 6, game.today - 7, -1, -1, -1, 0, 0, 0, 0]];
		s.next_flotilla = 701;
		s.garrisons = [[sol, 1, game.today - 7, game.today - 1]];
	});
	run(game, mod, 5);
	assert.equal(game.governments.get('Sol'), 'Republic', 'Sol stays the Republic\'s');
	assert.ok(!game.changes.some(c => /system "Sol"\n\tgovernment/.test(c.text)), 'and no change hands it over');
});

test('losing core systems raises unrest in the major\'s other minors', { skip }, () => {
	function unrestAfter(captureCore) {
		const { game, mod } = forced(galaxy, { start: 5 });
		run(game, mod, 3);
		const earth = minorIndex('Earth');
		edit(game, s => {
			s.first_war = 1; s.next_declare = game.today + 1000;
			s.wars = [[70, 2, 1, 1, game.today - 5, game.today + 200, 0, 0, 0, 0, 0, 0, 0, 1, earth]];
			s.next_war = 71;
			if (captureCore) {
				const at = sysIndex(game, 'Alpha Centauri');
				s.fleets = [[900, 2, 70, 400, 3, 0, 0, 400, at, at, sysIndex(game, 'Spica'), 0, 5, game.today - 6, -1, -1, -1, 0, 0, 0, 0]];
				s.next_flotilla = 901;
				s.garrisons = [[at, 1, game.today - 6, game.today - 1]];
			}
		});
		day(game, mod);
		if (captureCore) assert.equal(game.governments.get('Alpha Centauri'), 'Free Worlds', 'the siege takes Alpha Centauri');
		run(game, mod, 15);
		const st = state(game);
		const repMinors = MINORS.map((m, k) => !m.core && m.parent === 'Republic' ? k : -1).filter(k => k >= 0);
		return repMinors.reduce((x, k) => x + st.unrest[k], 0) / repMinors.length;
	}
	const shocked = unrestAfter(true), calm = unrestAfter(false);
	console.log(`  the Republic's other minors after 15 days: unrest ${(shocked / 10).toFixed(1)} with a core system lost, ${(calm / 10).toFixed(1)} without`);
	assert.ok(shocked > calm + 30, 'a core loss shocks the rest of the realm');
});

test('territory changes over time without one side swallowing the rest (4000 days, 5 pilots)', { skip }, () => {
	const lines = [];
	for (let seed = 0; seed < 5; seed++) {
		const { game, mod } = veteran(galaxy, { start: seed * 977 });
		const start = new Map(game.governments);
		const count = g => game.names.filter(n => game.governments.get(n) === g).length;
		const first = [1, 2, 3].map(f => count(GOVS[f]));
		let low = [...first], high = [...first];
		for (let d = 0; d < 4000; d++) {
			day(game, mod);
			if (d % 50 === 0) [1, 2, 3].forEach((f, i) => { const c = count(GOVS[f]); low[i] = Math.min(low[i], c); high[i] = Math.max(high[i], c); });
		}
		const moved = game.names.filter(n => start.get(n) !== game.governments.get(n)).length;
		const end = [1, 2, 3].map(f => count(GOVS[f]));
		lines.push(`  pilot ${seed}: ${moved} systems held by someone else than at the start; Republic ${first[0]} -> ${end[0]} (${low[0]}..${high[0]}), Free Worlds ${first[1]} -> ${end[1]} (${low[1]}..${high[1]}), Syndicate ${first[2]} -> ${end[2]} (${low[2]}..${high[2]})`);
		assert.ok(moved >= 5, 'territory moves: ' + moved);
		for (let i = 0; i < 3; i++) {
			assert.ok(low[i] >= first[i] * 0.45, GOVS[i + 1] + ' never falls below 45% of its start: ' + low[i]);
			assert.ok(high[i] <= first[i] * 1.8, GOVS[i + 1] + ' never grows past 180% of its start: ' + high[i]);
		}
		for (let f = 1; f <= 3; f++) assert.equal(game.governments.get(CAPITALS[f]), GOVS[f]);
	}
	console.log(lines.join('\n'));
});

test('operations from the live war write their outcome back into the simulation', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	// Find a day when a Free Worlds system is besieged.
	let target = null;
	for (let d = 0; d < 2000 && !target; d++) {
		day(game, mod);
		const ws = wars(game);
		target = fleets(game).find(x => x.kind === 0 && x.at === x.goal && x.target === 0 && x.side !== 2 && game.governments.get(game.names[x.goal]) === 'Free Worlds' && ws.some(w => w.id === x.war));
	}
	assert.ok(target, 'a Free Worlds system comes under siege');
	const where = game.names[target.goal];
	const planet = galaxy.systems.get(where).planets.find(p => galaxy.planets.get(p)?.inhabited) || [...galaxy.planets.keys()].find(p => galaxy.planets.get(p).inhabited && galaxy.systems.get('Gamma Corvi').planets.includes(p));
	game.moveTo(where);
	game.landed = planet;
	mod.on_enter(game, where);
	const job = game.jobs.find(j => j.name === 'Relieve the siege of ' + where);
	assert.ok(job, 'landing nearby offers "Relieve the siege of ' + where + '": ' + game.jobs.map(j => j.name).join('; '));
	assert.match(job.text, new RegExp('"diplomacy: op relieve ' + where + '" = 1'));
	assert.match(job.text, /npc kill/);
	assert.match(job.text, /personality [^\n]*\btracked\b/, 'the target is tracked on the map');
	game.landed = '';
	const before = fleets(game).find(x => x.id === target.id).strength;
	game.setCond('diplomacy: op relieve ' + where, 1);
	day(game, mod);
	const after = fleets(game).find(x => x.id === target.id);
	assert.ok(!after || after.strength < before * 0.7, 'the besiegers are weakened: ' + before + ' -> ' + (after && after.strength));
	assert.equal(game.cond('diplomacy: op relieve ' + where), 0, 'the result is read and cleared');
	assert.equal(game.cond('diplomacy: medal relief'), 1, 'and a medal awarded');
	assert.ok(state(game).medals.some(m => /Relief Star/.test(m)));
	// The static jobs feed back too.
	const w = wars(game).find(w => w.a === 2 || w.b === 2);
	if (w) {
		game.setCond('diplomacy: intel', 3);
		day(game, mod);
		assert.equal(game.cond('diplomacy: intel'), 0, 'scouting intel is read');
		assert.equal(state(game).stats.intel, 3);
	}
	// The service record shows the medal.
	mod.on_planet_button(game);
	const k = game.panel.buttons.indexOf('Service Record');
	mod.on_panel(game, k);
	assert.ok(game.screen && game.screen.title === 'Service Record' && game.screen.rows.some(r => r[0] === 'Relief Star'));
});

test('the Veteran\'s first hour: two intro operations, then a border crisis near the player over a known minor', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	const st0 = state(game);
	assert.ok(st0.story[0] >= game.today + 9 && st0.story[0] <= game.today + 20, 'the crisis is set for days 10-20');
	game.landed = 'Earth';
	game.moveTo('Sol');
	mod.on_enter(game, 'Sol');
	const envoy = game.jobs.find(j => /Escort Alondo's envoy/.test(j.name));
	assert.ok(envoy, 'Alondo\'s envoy is offered: ' + game.jobs.map(j => j.name).join('; '));
	game.landed = '';
	game.setCond('diplomacy: op envoy', 1);
	day(game, mod);
	assert.equal(state(game).story[3], 1);
	game.landed = 'Earth';
	mod.on_enter(game, 'Sol');
	assert.ok(game.jobs.some(j => /Investigate the raid/.test(j.name)), 'then Freya\'s raid inquiry');
	game.landed = '';
	let crisis = null;
	for (let d = 0; d < 25 && !crisis; d++) { day(game, mod, d % 2 ? 'Alpha Centauri' : 'Sol'); crisis = wars(game).find(w => w.kind === 0); }
	assert.ok(crisis, 'a border crisis comes by day 20');
	assert.ok(crisis.a === 2 || crisis.b === 2, 'it involves the player\'s faction');
	assert.equal(crisis.id, 1, 'it is the first war');
	assert.equal(game.cond('diplomacy: crisis minor'), crisis.goals[0] + 1, 'its goal, a minor, is published');
	assert.ok(['Central Dirt Belt', 'East Dirt Belt', 'South Frontier'].includes(MINORS[crisis.goals[0]].short), 'over a minor the two share: ' + MINORS[crisis.goals[0]].short);
});

test('captures are announced only in the player\'s wars; the rest goes in the daily digest', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	let digests = 0, foreign = 0;
	for (let d = 0; d < 1500; d++) {
		const before = game.messages.length;
		day(game, mod);
		const today = game.messages.slice(before).map(m => m.text);
		if (today.some(t => t.startsWith('Elsewhere: '))) digests++;
		assert.ok(today.filter(t => t.startsWith('Elsewhere: ')).length <= 1, 'one digest a day at most');
		for (const t of today) if (/^Siege of .* falls to the (Republic|Syndicate)\.$/.test(t) && /Syndicate/.test(t)) foreign++;
	}
	const st = state(game);
	assert.ok(digests > 0, 'the digest carries events elsewhere');
	assert.equal(foreign, 0, 'a capture in a war without the Free Worlds is not messaged on its own');
});

test('the chronicle, history, medals and operations stay capped; conditions and saved data stay bounded', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	let maxCond = 0, maxData = 0;
	for (let d = 0; d < 3000; d++) {
		day(game, mod);
		maxCond = Math.max(maxCond, nonZeroConditions(game));
		maxData = Math.max(maxData, game.data('state').length);
	}
	const st = state(game);
	assert.ok(st.chronicle.length <= 60 && st.chronicle.length >= 40, 'the chronicle keeps the newest 60: ' + st.chronicle.length);
	assert.ok(st.history.length <= 120, 'the history keeps 120 samples');
	assert.ok(st.ops.length <= 16 && st.medals.length <= 40);
	assert.ok(st.garrisons.length <= 24);
	const published = [...game.conditions.keys()].filter(k => k.startsWith('diplomacy: ')).length;
	console.log(`  after 3000 days: ${published} diplomacy conditions written (${maxCond} non-zero at most), state up to ${maxData} bytes`);
	assert.ok(published <= 320, 'the conditions written stay bounded: ' + published);
	assert.ok(maxData <= 40000, 'the saved state stays under 40 KB: ' + maxData);
	assert.ok(game.changes.length <= 3000, 'at most one world change a day: ' + game.changes.length);
});

test('an old save (version 1, all in conditions) is migrated: standing kept, the war state started afresh', { skip }, () => {
	const game = new MockGame(galaxy);
	const old = {
		'diplomacy: active': 1, 'diplomacy: activated': 1099000, 'diplomacy: last day': 1100000, 'diplomacy: rng': 12345,
		'diplomacy: member': 1, 'diplomacy: merit': 120, 'diplomacy: rank': 4, 'salary: Republic commission': 3600,
		'diplomacy: war a': 1, 'diplomacy: war b': 2, 'diplomacy: war since': 1099900, 'diplomacy: war until': 1100050,
		'diplomacy: at war 1': 1, 'diplomacy: at war 2': 1, 'diplomacy: next war': 0,
		'diplomacy: flotilla 1.1 strength': 120, 'diplomacy: flotilla 1.1 at': 5, 'diplomacy: flotilla 4.2 strength': 60,
		'diplomacy: garrison 3 system': 40, 'diplomacy: garrison 3 hp': 50, 'diplomacy: origin 77': 2,
		'diplomacy: admiral 2.3 name': 4, 'diplomacy: stat captures': 30, 'diplomacy: pirate attitudes': 1,
		'license: Navy': 1,
	};
	for (const [k, v] of Object.entries(old)) game.setCond(k, v);
	game.attitudes.set('Republic Flotilla|Free Worlds Flotilla', -1);
	game.today = 1100001;
	const mod = new Diplomacy();
	mod.on_load(game);
	mod.on_day(game, ++game.today);
	assert.equal(game.cond('diplomacy: active'), 1);
	assert.equal(game.cond('diplomacy: member'), 1);
	assert.equal(game.cond('diplomacy: merit'), 120);
	assert.equal(game.cond('license: Navy'), 1);
	assert.equal(game.cond('salary: Republic commission'), 6000, 'the salary follows the rank merit earns');
	for (const k of ['diplomacy: flotilla 1.1 strength', 'diplomacy: flotilla 4.2 strength', 'diplomacy: garrison 3 system', 'diplomacy: origin 77', 'diplomacy: admiral 2.3 name', 'diplomacy: war until', 'diplomacy: rng'])
		assert.equal(game.cond(k), 0, k + ' is cleared');
	assert.equal(game.attitude('Republic Flotilla', 'Free Worlds Flotilla'), 0, 'the old war\'s attitudes are reset');
	const st = state(game);
	assert.ok(st && st.v === 2 && st.stats.migrated === 1, 'a version 2 state is stored');
	assert.equal(game.cond('diplomacy: war a'), 0, 'no war carried over');
	assert.ok(st.story[0] > game.today, 'a border crisis is scheduled');
	// And the migrated world runs.
	run(game, mod, 60);
	assert.ok(state(game).stats.wars >= 1);
});

test('a reload of an earlier save of the same pilot reads that save again (revisions never repeat)', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	run(game, mod, 40);
	const snap = () => ({ store: new Map(game.store), conds: new Map(game.conditions), govs: new Map(game.governments), today: game.today });
	const restore = x => { game.store = new Map(x.store); game.conditions = new Map(x.conds); game.governments = new Map(x.govs); game.today = x.today; };
	const S = snap();
	run(game, mod, 5);
	const A = snap();
	restore(S);
	game.setCond('diplomacy: force rebellion', minorIndex('Paradise Worlds') + 1);
	game.setCond('diplomacy: force outcome', 1);
	run(game, mod, 5);
	assert.notEqual(game.data('rev'), A.store.get('rev'), 'two histories of one pilot never share a revision');
	restore(A);
	mod.on_day(game, game.today);
	assert.equal(JSON.parse(game.data('state')).wars.length, JSON.parse(A.store.get('state')).wars.length, 'the save loaded is the one read');
	assert.ok(!state(game).chronicle.some(e => /rises against/.test(e)), 'nothing of the other history is left');
	// Two Veteran pilots accepting on the same day have different worlds.
	const shared = new Diplomacy();
	const one = veteran(galaxy, { mod: shared }), two = veteran(galaxy, { mod: shared });
	assert.notEqual(one.game.data('world'), two.game.data('world'));
	run(one.game, shared, 3);
	two.game.setCond('diplomacy: force rebellion', minorIndex('Paradise Worlds') + 1);
	run(two.game, shared, 3);
	shared.on_day(one.game, one.game.today);
	assert.ok(!state(one.game).chronicle.some(e => /rises against/.test(e)), 'loading the first pilot again reads its own world');
	// Mod API 10: on_pilot_loaded makes it read the world whatever the revisions say.
	shared.on_pilot_loaded(one.game);
	assert.equal(shared.loaded_rev, '?');
});

test('operations: re-offers renew the track, and each outcome is applied once, to its own job', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	const ports = [...galaxy.systems.entries()].filter(([n, s]) => minorOf.has(n) && s.planets.some(p => galaxy.planets.get(p)?.inhabited)).map(([n]) => n);
	const land = dest => { game.landed = galaxy.systems.get(dest).planets.find(p => galaxy.planets.get(p)?.inhabited); mod.on_enter(game, dest); game.landed = ''; };
	let op = null, where = null;
	for (let d = 0; d < 1500 && !op; d++) {
		const dest = ports[(d * 7) % ports.length];
		day(game, mod, dest); land(dest);
		op = state(game).ops.find(o => o.startsWith('supply '));
		where = dest;
	}
	assert.ok(op, 'a supply operation is offered');
	const key = op.split('|')[0], target = key.slice(7);
	const job = game.jobs.find(j => j.name === 'Supply the garrison at ' + target);
	// The player keeps landing where it was offered for 40 days: each offer renews the track.
	let last = 0;
	for (let d = 0; d < 40; d++) {
		day(game, mod);
		game.jobs = [];
		land(where);
		if (game.jobs.some(j => j.name === job.name)) last = game.today;
	}
	const tracked = state(game).ops.find(o => o.startsWith(key + '|'));
	if (last > 0) {
		assert.ok(tracked && +tracked.split('|')[5] === last, 'the track runs from the last offer');
		// Accepted at the last offer, done 15 days later: applied once.
		game.setCond('diplomacy: ' + job.name + ': active', 1);
		run(game, mod, 15);
		const medals = game.cond('diplomacy: medal supply');
		game.setCond('diplomacy: ' + job.name + ': active', 0);
		game.setCond('diplomacy: op ' + key, 1);
		day(game, mod);
		assert.equal(game.cond('diplomacy: medal supply'), medals + 1, 'the outcome is applied');
		assert.equal(game.cond('diplomacy: op ' + key), 0);
		day(game, mod);
		assert.equal(game.cond('diplomacy: medal supply'), medals + 1, 'and only once');
	}
	// An outcome left from an earlier job is cleared when a new track starts, not applied to it.
	game.setCond('diplomacy: op ' + key, 1);
	edit(game, s => { s.ops = s.ops.filter(o => !o.startsWith(key + '|')); });
	const before = game.cond('diplomacy: medal supply');
	for (let d = 0; d < 300 && !state(game).ops.some(o => o.startsWith(key + '|')); d++) { day(game, mod, where); game.jobs = []; land(where); }
	if (state(game).ops.some(o => o.startsWith(key + '|'))) {
		assert.equal(game.cond('diplomacy: op ' + key), 0, 'the stale outcome is cleared');
		day(game, mod);
		assert.equal(game.cond('diplomacy: medal supply'), before, 'and not paid out');
	}
});

test('the pirates\' attitudes name only real governments', { skip }, () => {
	const { game } = veteran(galaxy);
	const body = game.changes.map(c => c.text).join('\n');
	assert.match(body, /government "Pirate"\n\t"attitude toward"/);
	assert.ok(!/\t\t"" /.test(body), 'no attitude toward a government named ""');
	for (const c of game.changes) assert.ok(!/government ""/.test(c.text), 'no government named ""');
});

test('never two wars between one pair: a second rising widens the war they fight', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	run(game, mod, 25);
	const k = minorIndex('Paradise Worlds');
	game.setCond('diplomacy: force rebellion', k + 1); game.setCond('diplomacy: force outcome', 1);
	day(game, mod);
	MINORS[k].systems.slice(0, 10).forEach(s => game.governments.set(s, 'Republic'));
	day(game, mod);
	edit(game, s => { s.rebelled[k] = 0; });
	game.setCond('diplomacy: force rebellion', k + 1); game.setCond('diplomacy: force outcome', 1);
	day(game, mod);
	const pair = wars(game).filter(w => (w.a === 5 + k && w.b === 1) || (w.a === 1 && w.b === 5 + k));
	assert.equal(pair.length, 1, 'one war between the rebels and the Republic');
	for (let f = 1; f <= 3; f++) for (let g = 1; g <= 3; g++) if (f !== g)
		assert.ok(wars(game).filter(w => (w.a === f && w.b === g) || (w.a === g && w.b === f)).length <= 1);
});

test('mod API 10: war, peace, capture, battle and rising events on the notification bus; none on an API 9 game', { skip }, () => {
	const g = new MockGame(galaxy, { api10: true });
	g.today = 1100000;
	g.setCond('free worlds plot completed', 1);
	const mod = new Diplomacy();
	mod.on_load(g); g.today++; mod.on_day(g, g.today); mod.on_enter(g, 'Sol'); mod.on_panel(g, 0);
	g.setCond('diplomacy: force rebellion', minorIndex('Paradise Worlds') + 1); g.setCond('diplomacy: force outcome', 1);
	for (let d = 0; d < 400; d++) day(g, mod);
	const names = new Set(g.notes.map(n => n.name));
	for (const n of ['diplomacy.war', 'diplomacy.peace', 'diplomacy.capture', 'diplomacy.battle', 'diplomacy.rising']) assert.ok(names.has(n), n + ' is posted');
	const war = JSON.parse(g.notes.find(n => n.name === 'diplomacy.war').payload);
	assert.ok(war.id >= 1 && war.a >= 1 && war.b >= 1 && Array.isArray(war.goals) && war.a_government && war.kind);
	const rising = JSON.parse(g.notes.find(n => n.name === 'diplomacy.rising').payload);
	assert.equal(rising.outcome, 'separatist'); assert.equal(rising.to_government, 'Paradise Secession');
	const cap = JSON.parse(g.notes.find(n => n.name === 'diplomacy.capture').payload);
	assert.ok(cap.system && cap.by && cap.from);
	const battle = JSON.parse(g.notes.find(n => n.name === 'diplomacy.battle').payload);
	assert.ok(battle.system && battle.a && battle.b && battle.loss_a >= 0);
	// An API 9 game (no has) gets none, and nothing fails.
	const { game, mod: m9 } = veteran(galaxy);
	run(game, m9, 50);
	assert.equal(game.notes.length, 0);
});

test('Corporations\' conditions: each side\'s flotillas in slots, and the destroyed count', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	let checked = 0;
	for (let d = 0; d < 600; d++) {
		day(game, mod);
		if (d % 20) continue;
		const fl = fleets(game);
		for (let s = 1; s <= 4 + MINORS.length; s++) {
			const mine = fl.filter(x => x.side === s);
			const slots = s > 4 ? 2 : 4;
			for (let k = 1; k <= slots; k++) {
				const pre = 'diplomacy: flotilla ' + s + '.' + k + ' ';
				if (k <= mine.length) {
					assert.equal(game.cond(pre + 'strength'), mine[k - 1].strength);
					assert.equal(game.cond(pre + 'kind'), mine[k - 1].kind);
					assert.equal(game.cond(pre + 'at'), mine[k - 1].at + 1);
					checked++;
				} else assert.equal(game.cond(pre + 'strength'), 0, pre + 'is empty');
			}
		}
		assert.equal(game.cond('diplomacy: stat flotillas destroyed'), state(game).stats['flotillas destroyed'] || 0);
	}
	assert.ok(checked > 20);
});

test('a system that turns pirate starts raids; patrols follow the flag and come back with it', { skip }, () => {
	const { game, mod } = forced(galaxy);
	run(game, mod, 2);
	game.governments.set('Persian', 'Pirate');
	day(game, mod);
	assert.ok(mod.galaxy.pirate_homes(game).includes(sysIndex(game, 'Persian')), 'Persian is a pirate home from the next day');
	// A Republic system with its own patrols, Logistics and Navy Surveillance, taken by the Free Worlds.
	const name = [...galaxy.systems.entries()].find(([n, s]) => s.government === 'Republic' && s.fleets.includes('Navy Surveillance') && s.fleets.includes('Republic Logistics') && n !== 'Sol')[0];
	const own = [...galaxy.systems.get(name).fleets];
	const i = sysIndex(game, name);
	game.governments.set(name, 'Free Worlds');
	day(game, mod);
	edit(game, s => { s.captures.push([i, 1, 2, game.today - 30, 0, 1, game.today - 30]); });
	day(game, mod);
	const f1 = game.fleetsOf(name);
	assert.ok(!f1.some(f => /Republic|Navy/.test(f)), 'the Republic\'s fleets are gone: ' + f1.join(', '));
	assert.ok(f1.includes('Small Free Worlds') && f1.includes('Large Free Worlds'));
	game.governments.set(name, 'Republic');
	// (A transfer back would record it so: taken from the Free Worlds, whose patrols it has.)
	edit(game, s => { s.captures = s.captures.filter(c => c[0] !== i); s.captures.push([i, 2, 1, game.today - 30, 0, 2, game.today - 30]); });
	day(game, mod);
	const f2 = game.fleetsOf(name);
	assert.ok(!f2.some(f => /Free Worlds/.test(f)), 'back with the Republic: no Free Worlds patrols');
	for (const f of own.filter(f => /Republic|Navy/.test(f))) assert.ok(f2.includes(f), f + ' is back');
});

test('the border crisis\'s condition goes back to 0 when it ends', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	let crisis = null;
	for (let d = 0; d < 25 && !crisis; d++) { day(game, mod); crisis = wars(game).find(w => w.kind === 0); }
	assert.ok(crisis && game.cond('diplomacy: crisis') > 0);
	for (let d = 0; d < 200 && wars(game).some(w => w.id === crisis.id); d++) day(game, mod);
	assert.equal(game.cond('diplomacy: crisis'), 0);
});

