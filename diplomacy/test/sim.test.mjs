// Simulation test for the Diplomacy mod: drives the built mod with a mock game
// (mock.mjs) over the real galaxy for thousands of days and checks its
// invariants. Like the other mods' tests it builds the mod with the SDK
// (tools/esmod.mjs build) and imports dist/Diplomacy/scripts/diplomacy.js, and it
// is skipped when there is no Dado toolchain.
//
//   npm test                                          (from the SDK folder; 4000 days)
//   DIPLOMACY_DAYS=6000 node --test mods/diplomacy/test/sim.test.mjs
//   node mods/diplomacy/test/sim.test.mjs [days]
//
// The galaxy is test/galaxy.json, a snapshot of the game's data made by
// tools/make-galaxy.mjs. Set ES_DATA=<endless-sky>/data to read the game's data
// files directly instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGalaxy, galaxyFromJson } from './galaxy.mjs';
import { MockGame } from './mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SDK = join(HERE, '../../..');
const DAYS = parseInt(process.env.DIPLOMACY_DAYS || process.argv[2] || '4000', 10);

// Build the mod the way the game will load it. Skipped only when there is no
// Dado toolchain; a build that fails (a compile error) fails the test.
function hasDadoc() {
	try {
		execFileSync(process.env.DADOC || 'dadoc', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
let Diplomacy = null, buildError = null;
if (hasDadoc()) {
	try {
		execFileSync(process.execPath, [join(SDK, 'tools/esmod.mjs'), 'build', 'mods/diplomacy'], { cwd: SDK, stdio: ['ignore', 'pipe', 'pipe'] });
		({ Diplomacy } = await import(join(SDK, 'dist/Diplomacy/scripts/diplomacy.js')));
	} catch (e) {
		buildError = e;
	}
}
const skip = !hasDadoc() && 'no Dado toolchain';

test('the mod builds', { skip }, () => {
	if (buildError) assert.fail('mods/diplomacy did not build:\n' + (buildError.stderr?.toString() || '') + (buildError.stdout?.toString() || '') + buildError.message);
	assert.equal(typeof Diplomacy, 'function', 'the build exports class Diplomacy');
});
const loadTestGalaxy = () => process.env.ES_DATA
	? loadGalaxy(process.env.ES_DATA)
	: galaxyFromJson(JSON.parse(readFileSync(join(HERE, 'galaxy.json'), 'utf8')));

const GOVS = ['', 'Republic', 'Free Worlds', 'Syndicate'];
const ADJ = ['', 'Republic', 'Free Worlds', 'Syndicate'];
const FLOT = ['', 'Republic Flotilla', 'Free Worlds Flotilla', 'Syndicate Flotilla'];
const CAPITALS = ['', 'Sol', 'Gamma Corvi', 'Markab'];
const SALARY = ['', 'salary: Republic commission', 'salary: Free Worlds', 'salary: Syndicate commission'];
const SALARIES = [200, 600, 1800, 3600, 6000, 8900, 12000];
const SLOTS = 3;
const RAID_SLOTS = 4;
const SIZES = ['', 'small', 'medium', 'large'];
const PIRATES = 4;

test(DAYS + ' simulated days keep the invariants', { skip: skip || (!Diplomacy && 'the mod did not build (see "the mod builds")') }, () => {
	let failures = 0;
	const failed = new Map();
	function check(ok, what) {
		if (ok) return;
		failures++;
		const n = (failed.get(what) || 0) + 1;
		failed.set(what, n);
		if (n <= 3) console.error('FAIL (day ' + game.today + '): ' + what);
	}

	// A deterministic RNG for the test's own choices.
	let seed = 12345;
	function rand(n) { seed = (seed * 48271) % 2147483647; return seed % n; }

	const galaxy = loadTestGalaxy();
	let game = new MockGame(galaxy);
	// BALANCE_RUN: a different start day (and so different random draws), for balance comparisons.
	if (process.env.START_DAY) game.today = parseInt(process.env.START_DAY, 10);
	const mod = new Diplomacy();
	const faction = g => GOVS.indexOf(g) > 0 ? GOVS.indexOf(g) : 0;
	const idx = new Map(game.names.map((n, i) => [n, i]));

	console.log('galaxy: ' + game.names.length + ' systems, ' + galaxy.planets.size + ' planets; events applied: ' + galaxy.events.join(', '));
	for (let f = 1; f <= 3; f++)
		console.log('  ' + GOVS[f] + ': ' + game.names.filter(n => game.governments.get(n) === GOVS[f]).length + ' systems');

	// Jumps from a set of systems, by BFS over lanes.
	function bfs(sources) {
		const dist = new Map(sources.map(s => [s, 0]));
		const q = [...sources];
		for (let h = 0; h < q.length; h++) {
			for (const l of galaxy.systems.get(q[h]).links) {
				if (!dist.has(l)) { dist.set(l, dist.get(q[h]) + 1); q.push(l); }
			}
		}
		return dist;
	}

	// Live flotillas (sides 1..3) or raids (side 4).
	function flotillas(g = game, sides = [1, 2, 3]) {
		const out = [];
		for (const f of sides) {
			for (let s = 1; s <= (f === PIRATES ? RAID_SLOTS : SLOTS); s++) {
				const k = 'diplomacy: flotilla ' + f + '.' + s + ' ';
				const strength = g.cond(k + 'strength');
				if (strength === 0) continue;
				out.push({ f, s, strength, size: g.cond(k + 'size'), kind: g.cond(k + 'kind'), admiral: g.cond(k + 'admiral'),
					at: g.cond(k + 'at') - 1, goal: g.cond(k + 'goal') - 1, home: g.cond(k + 'home') - 1,
					target: g.cond(k + 'target'), siege: g.cond(k + 'siege'), leg: g.cond(k + 'leg'),
					stops: [1, 2, 3].map(j => g.cond(k + 'stop ' + j) - 1).filter(x => x >= 0) });
			}
		}
		return out;
	}
	const raids = (g = game) => flotillas(g, [PIRATES]);
	const war = () => [game.cond('diplomacy: war a'), game.cond('diplomacy: war b')];
	const hostile = (f, g) => {
		if (f === g) return false;
		if (f === PIRATES || g === PIRATES) return true;
		const [a, b] = war(); return a !== 0 && ((f === a && g === b) || (f === b && g === a));
	};

	// One day: the player jumps (on_day, on_enter) or takes off where it is (on_day only), then flies a while.
	function day(dest) {
		game.today++;
		if (dest && dest !== game.where) {
			game.moveTo(dest);
			mod.on_day(game, game.today);
			mod.on_enter(game, dest);
		} else {
			game.ships = [];            // landing and taking off clears the system
			mod.on_day(game, game.today);
		}
	}

	const stats = { raidsSeen: new Set(), reliefWar: 0, reliefPeace: 0, raidDaysWar: 0, raidDaysPeace: 0, pirateKills: 0, kills: 0, otherKills: 0, inPersonDays: 0, flotillaMax: 0, warDays: 0, measuredSieges: [], lastBesieger: [], recaptures: 0, promotions: 0 };

	// Fly 240 steps; every 60, simulate a little fighting among the tagged ships here.
	function fly(steps = 240) {
		for (let k = 0; k < steps; k++) {
			game.tick();
			mod.on_step(game, game.steps);
			if (game.steps % 60 !== 30) continue;
			const groups = new Map();
			for (const s of game.ships) if (s.alive && s.tag.startsWith('diplomacy:')) groups.set(s.tag, parseInt(s.tag.split(':')[1], 10));
			const member = game.cond('diplomacy: member');
			for (const [tag, f] of groups) {
				if (member !== 0 && hostile(member, f) && rand(100) < 60) {
					if (game.playerKill(tag)) { stats.kills++; if (f === PIRATES) stats.pirateKills++; }
				}
				for (const [, g] of groups) {
					if (hostile(f, g) && rand(100) < 40) { if (game.otherKill(tag)) stats.otherKills++; break; }
				}
			}
		}
	}

	// ---------------------------------------------------------------- inactive
	mod.on_load(game);
	check(game.button === '', 'inactive: no planet button');
	for (let d = 0; d < 20; d++) { day(d % 2 ? 'Alpha Centauri' : 'Sol'); fly(60); }
	check(game.cond('diplomacy: active') === 0, 'inactive before the campaign ends');
	check(game.map.markers.length === 0 && game.messages.length === 0, 'inactive: nothing drawn or said');
	check(game.button === '', 'inactive: still no button');

	// ---------------------------------------------------------------- the offer
	// Finishing the campaign does not turn Diplomacy on: landing offers it.
	game.setCond('free worlds plot completed', 1);
	day(null); fly(60);
	check(game.cond('diplomacy: active') === 0, 'the campaign alone does not turn Diplomacy on');
	mod.on_enter(game, 'Sol');
	check(game.panel && game.panel.title === 'Diplomacy' && JSON.stringify(game.panel.buttons) === '["Turn on Diplomacy","Not now","Never"]', 'landing offers Diplomacy');
	check(game.button === 'Diplomacy', 'the planet button offers it too');
	// Not now: closed, and not offered again on landing until the game restarts.
	mod.on_panel(game, 1);
	check(game.panel === null && game.cond('diplomacy: active') === 0, 'Not now closes the offer');
	mod.on_enter(game, 'Sol');
	check(game.panel === null, 'Not now: no offer on the next landing');
	// The planet button still offers it; accept.
	mod.on_planet_button(game);
	check(game.panel && game.panel.title === 'Diplomacy', 'the planet button reopens the offer');
	mod.on_panel(game, 0);
	check(game.cond('diplomacy: active') === 1, 'Turn on Diplomacy turns it on');
	check(game.cond('diplomacy: member') === 2 && game.cond('diplomacy: rank') === 5, 'a campaign veteran serves the Free Worlds as a Commodore');
	check(game.cond('salary: Free Worlds') === 8900, 'at the campaign salary, paid through the campaign\'s own condition: ' + game.cond('salary: Free Worlds'));
	check(game.panel && game.panel.title === 'The Republic', 'Sol\'s faction panel follows');
	mod.on_panel(game, game.panel.buttons.length - 1);
	// Never, on another pilot: off for good.
	{
		const other = new MockGame(galaxy);
		other.setCond('free worlds plot completed', 1);
		mod.on_load(other);
		mod.on_enter(other, 'Sol');
		check(other.button === 'Diplomacy', 'another veteran pilot is offered it (on the planet button, since Not now holds for this session)');
		mod.on_planet_button(other);
		check(other.panel && other.panel.title === 'Diplomacy', 'which opens the offer');
		mod.on_panel(other, 2);
		check(other.cond('diplomacy: declined') === 1 && other.cond('diplomacy: active') === 0, 'Never declines it');
		mod.on_enter(other, 'Sol');
		check(other.panel === null && other.button !== 'Diplomacy', 'and it is not offered again');
		mod.on_load(game);
	}
	// Leave the Free Worlds, so the rest of the test joins and leaves on its own terms.
	day('Gamma Corvi'); fly(60);
	mod.on_planet_button(game);
	check(game.panel && game.panel.buttons[0] === 'Leave', 'the veteran can leave the Free Worlds');
	mod.on_panel(game, 0);
	mod.on_panel(game, game.panel.buttons.length - 1);
	check(game.cond('diplomacy: member') === 0 && game.cond('salary: Free Worlds') === 0, 'leaving ends membership and the salary');

	// ---------------------------------------------------------------- active
	const original = new Map(game.governments);
	const origDist = [null];
	for (let f = 1; f <= 3; f++) origDist.push(bfs(game.names.filter(n => original.get(n) === GOVS[f])));

	let joinedDay = -1, leftDay = -1, meritBoostDay = -1, otherPanelChecked = false;
	let siegeRun = new Map();   // system -> consecutive days a hostile flotilla has besieged it
	let prevWar = [0, 0];
	let maxConditions = 0;
	let lastRank = 0;
	let shown = false;

	for (let d = 1; d <= DAYS; d++) {
		const before = new Map(game.governments);
		const changesBefore = game.changes.length;
		// When each damaged garrison's siege began, as of this morning.
		const siegeStart = new Map();
		for (let k = 1; k <= 12; k++) {
			const s = game.cond('diplomacy: garrison ' + k + ' system');
			if (s !== 0) siegeStart.set(game.names[s - 1], game.cond('diplomacy: garrison ' + k + ' start'));
		}
		const live = flotillas();
		// Where the player goes today.
		let dest = null;
		if (d % 6 === 0 && live.length > 0) {
			const sieging = live.filter(x => x.at === x.goal && x.target === 0);
			const pick = sieging.length > 0 && d % 12 === 0 ? sieging[rand(sieging.length)] : live[rand(live.length)];
			dest = game.names[pick.at];
			stats.inPersonDays++;
		} else if (d % 6 === 3) {
			const owned = game.names.filter(n => faction(game.governments.get(n)) !== 0);
			dest = owned[rand(owned.length)];
		}
		day(dest);
		fly();

		const [a, b] = war();
		if (a !== 0) stats.warDays++;

		// --- Captures: only between factions at war, never a capital, within 2 jumps of the original border.
		for (const n of game.names) {
			const was = before.get(n), now = game.governments.get(n);
			if (was === now) continue;
			const F = faction(now), E = faction(was);
			check(F !== 0 && E !== 0, 'captures only between the three factions: ' + n + ' ' + was + ' -> ' + now);
			check(!CAPITALS.includes(n), 'a capital never changes hands: ' + n);
			const rec = game.changes.slice(changesBefore).find(c => c.text.includes('"' + n + '"') && c.text.includes('government'));
			check(rec !== undefined, 'a capture goes through game.change: ' + n);
			if (rec) check((rec.war[0] === F && rec.war[1] === E) || (rec.war[0] === E && rec.war[1] === F),
				'only factions at war capture from each other: ' + n + ' war ' + rec.war + ' ' + E + '->' + F);
			const dd = origDist[F].get(n);
			check(dd !== undefined && dd <= 2, 'capture within 2 jumps of the original territory: ' + n + ' by ' + GOVS[F] + ' at ' + dd);
			if (original.get(n) === now) stats.recaptures++;
			// The siege, as the test saw it: from the day its garrison was first hit until today.
			stats.measuredSieges.push(siegeStart.has(n) ? game.today - siegeStart.get(n) + 1 : 1);
			stats.lastBesieger.push((siegeRun.get(n) || 0) + 1);
		}
		for (let f = 1; f <= 3; f++) check(game.governments.get(CAPITALS[f]) === GOVS[f], 'capitals keep their owner');

		// --- Flotillas.
		const now = flotillas();
		stats.flotillaMax = Math.max(stats.flotillaMax, now.length);
		const nextRun = new Map();
		for (let f = 1; f <= 3; f++) check(now.filter(x => x.f === f).length <= SLOTS, 'at most ' + SLOTS + ' flotillas per faction');
		const everyone = flotillas().concat(raids());
		for (const x of now) {
			if (x.kind === 0) check(a !== 0 && (x.f === a || x.f === b), 'war flotillas only for factions at war');
			check(x.admiral >= 1 && game.cond('diplomacy: admiral ' + x.f + '.' + x.admiral + ' name') > 0, 'every flotilla has a named commander');
			const p = game.cond('diplomacy: admiral ' + x.f + '.' + x.admiral + ' personality');
			check(p >= 1 && p <= 4, 'commanders have a personality');
			check(x.strength > 0 && x.strength <= 625, 'flotilla strength in range: ' + x.strength);
			check(x.size >= 1 && x.size <= 3, 'flotilla size 1..3');
			check(x.at >= 0 && x.at < game.names.length && x.goal >= 0 && x.goal < game.names.length, 'flotilla systems valid');
			if (x.kind === 0 && x.at === x.goal && x.target === 0 && hostile(x.f, faction(game.governments.get(game.names[x.goal])))) {
				const n = game.names[x.goal];
				nextRun.set(n, (siegeRun.get(n) || 0) + 1);
			}
			if (x.target !== 0) {
				const t = everyone.find(y => y.f * 10 + y.s === x.target);
				check(t !== undefined && hostile(x.f, t.f), 'an interception target is a live enemy flotilla or raid');
				if (x.kind === 1) check(t !== undefined && t.f === PIRATES, 'a relief flotilla hunts a raid');
			}
		}
		siegeRun = nextRun;

		// --- War state, attitudes and the conditions missions read.
		for (let f = 1; f <= 3; f++) {
			check(game.cond('diplomacy: at war ' + f) === ((a !== 0 && (f === a || f === b)) ? 1 : 0), 'at war flags match the war');
			for (let g = 1; g <= 3; g++) {
				if (f === g) continue;
				check(game.attitude(FLOT[f], FLOT[g]) === (hostile(f, g) ? -1 : 0), 'flotilla attitudes match the war');
			}
		}
		if (a !== 0 && prevWar[0] === 0) check(game.messages.some(m => m.day === game.today && m.text.startsWith('War!')), 'war is announced');
		prevWar = [a, b];

		// --- The map.
		if (a === 0) {
			check(now.every(x => x.kind !== 0), 'no war flotillas in peace');
			check(!game.map.markers.some(m => m.label.startsWith('Siege: ')), 'no sieges in peace');
		}
		// --- Raids.
		const rs = raids();
		check(rs.length <= RAID_SLOTS, 'at most ' + RAID_SLOTS + ' raids');
		for (const r of rs) {
			stats.raidsSeen.add(r.s + ':' + r.home + ':' + r.stops.join(','));
			check(r.kind === 2, 'pirate slots hold raids');
			check(game.governments.get(game.names[r.home]) === 'Pirate' || r.stops.length === 1, 'a raid sets out from a pirate system');
			check(r.stops.length >= 1 && r.stops.length <= 3, 'a raid has 1-3 stops');
			const home = bfs([game.names[r.home]]);
			for (const st of r.stops) {
				const d = home.get(game.names[st]);
				check(d !== undefined && d >= 1 && d <= 4, 'raid stops lie within 4 jumps of home');
			}
			check(game.map.markers.some(m => m.system === game.names[r.at] && m.label.startsWith('Pirate raiders')), 'each raid has a marker');
			if (a !== 0) stats.raidDaysWar++; else stats.raidDaysPeace++;
		}
		for (const x of now) if (x.kind === 1 && !stats.raidsSeen.has('relief ' + x.f + '.' + x.s + '@' + x.home)) {
			stats.raidsSeen.add('relief ' + x.f + '.' + x.s + '@' + x.home);
			if (a !== 0) stats.reliefWar++; else stats.reliefPeace++;
		}
		for (const x of now) {
			const title = ADJ[x.f] + ' flotilla (' + SIZES[x.size] + ')';
			check(game.map.markers.some(m => m.system === game.names[x.at] && m.label === title), 'each flotilla has a short marker at its system');
			// The details are in the side panel for its system: commander, personality, strength, task.
			const d = game.map.details.find(d => d.system === game.names[x.at] && d.title === title);
			check(d !== undefined, 'each flotilla has a side-panel section at its system');
			if (d) check(/^(Admiral|Commodore|Director) [A-Z][a-z]+, (bold|cautious|methodical|reckless)\n\d+ victor/.test(d.text)
				&& /\n(Objective|Besieging|Holding|Intercepting|Hunting|Fighting|Going home)/.test(d.text), 'the section names the commander, personality and task: ' + JSON.stringify(d.text));
		}
		for (const r of raids()) {
			const d = game.map.details.find(d => d.system === game.names[r.at] && d.title === 'Pirate raiders (' + SIZES[r.size] + ')');
			check(d !== undefined && /^Captain [A-Z]/.test(d.text) && /\n(Raiding|Bound for|Going home)/.test(d.text), 'each raid has a side-panel section: ' + JSON.stringify(d && d.text));
		}
		for (const d of game.map.details) check(idx.has(d.system) && d.title.length > 0, 'side-panel sections name real systems');
		for (const m of game.map.markers) check(m.label.length <= 32, 'map labels stay short: ' + m.label);
		for (const m of game.map.markers) check(idx.has(m.system) && m.label.length > 0, 'markers name real systems');
		for (const l of game.map.lines) check(idx.has(l.from) && idx.has(l.to) && l.from !== l.to, 'lines join real systems');
		for (const n of new Set(now.filter(x => x.kind === 0 && x.at === x.goal && x.target === 0).map(x => game.names[x.at])))
			if (now.some(x => x.kind === 0 && game.names[x.at] === n && x.at === x.goal && x.target === 0 && hostile(x.f, faction(game.governments.get(n)))))
				{
					const ok = game.map.markers.some(m => m.system === n && m.label.startsWith('Siege: '))
						&& game.map.details.some(d => d.system === n && d.title === 'Siege of ' + n && /Garrison \d+ of \d+/.test(d.text));
					if (!ok && process.env.DEBUG_SIEGE) console.error('no siege marker at ' + n + ': ' + JSON.stringify(now.filter(x => game.names[x.at] === n)) + ' markers ' + JSON.stringify(game.map.markers.filter(m => m.system === n)) + ' war ' + war());
					check(ok, 'a besieged system has a siege marker');
				}

		// --- Show once what the player sees: the overlay and a faction panel.
		if (!shown && now.length >= 4 && now.some(x => x.at === x.goal && x.target === 0) && now.some(x => x.target !== 0)) {
			shown = true;
			console.log('\nday ' + d + ': map overlay');
			for (const m of game.map.markers) console.log('  marker ' + m.system + ': ' + m.label);
			for (const s of game.map.details) console.log('  side panel ' + s.system + ': ' + s.title + ' | ' + s.text.replace(/\n/g, ' | '));
			for (const l of game.map.lines) console.log('  line ' + l.from + ' -> ' + l.to);
			const where = game.where;
			game.where = CAPITALS[a];
			mod.on_planet_button(game);
			console.log('panel "' + game.panel.title + '" [' + game.panel.buttons.join(', ') + ']\n  ' + game.panel.text.split('\n').join('\n  ') + '\n');
			mod.on_panel(game, game.panel.buttons.length - 1);
			game.where = where;
		}

		// --- The planet button.
		check(game.button === (faction(game.governments.get(game.where)) !== 0 ? 'Faction' : ''), 'planet button matches the system');

		// --- Joining, merit, rank, salary, leaving.
		const member = game.cond('diplomacy: member');
		if (joinedDay < 0 && a !== 0) {
			// Fly to the capital of a faction at war and join it through its panel.
			day(CAPITALS[a]); fly(60);
			mod.on_planet_button(game);
			check(game.panel && game.panel.title === 'The ' + GOVS[a].replace('Republic', 'Republic'), 'panel opens with the faction title: ' + (game.panel && game.panel.title));
			check(game.panel && JSON.stringify(game.panel.buttons) === '["Join","Close"]', 'a non-member sees Join and Close');
			check(game.panel && game.panel.text.includes('Capital: ' + CAPITALS[a]), 'panel text names the capital');
			mod.on_panel(game, 0);
			check(game.cond('diplomacy: member') === a, 'Join makes the player a member');
			check(game.panel && JSON.stringify(game.panel.buttons) === '["Leave","Close"]', 'a member sees Leave and Close');
			check(game.panel && game.panel.text.includes('Recruit'), 'panel shows the rank');
			mod.on_panel(game, 1);
			check(game.panel === null, 'Close closes the panel');
			joinedDay = d;
			console.log('day ' + d + ': joined ' + GOVS[a] + ' (at war with ' + GOVS[b] + ')');
		}
		if (member !== 0) {
			check(game.reputation(FLOT[member]) === 10.0, 'a member is an ally of its flotillas');
			for (let f = 1; f <= 3; f++) if (f !== member)
				check(game.reputation(FLOT[f]) === (hostile(member, f) ? -10.0 : 1.0), 'reputation with other flotillas follows the war');
			const rank = game.cond('diplomacy: rank');
			check(game.cond(SALARY[member]) === SALARIES[rank], 'salary follows the rank curve');
			for (let f = 1; f <= 3; f++) if (f !== member) check(game.cond(SALARY[f]) === 0, 'no salary from other factions');
			if (rank > lastRank) {
				check(game.messages.some(m => m.text.includes('promoted you to')), 'promotion is announced');
				stats.promotions++;
			}
			lastRank = rank;
			if (meritBoostDay < 0 && d > joinedDay + 5) {
				// Faction missions add to "diplomacy: merit" on completion.
				game.setCond('diplomacy: merit', game.cond('diplomacy: merit') + 30);
				meritBoostDay = d;
			}
			if (!otherPanelChecked && d > joinedDay + 10) {
				const other = [1, 2, 3].find(f => f !== member);
				day(CAPITALS[other]); fly(60);
				mod.on_planet_button(game);
				check(game.panel && JSON.stringify(game.panel.buttons) === '["Close"]', 'a member of another faction sees only Close');
				check(game.panel && game.panel.text.includes('leave'), 'and is told to leave first');
				mod.on_panel(game, 0);
				check(game.panel === null, 'Close closes it');
				otherPanelChecked = true;
			}
			if (leftDay < 0 && d >= DAYS - 300) {
				day(CAPITALS[member]); fly(60);
				mod.on_planet_button(game);
				console.log('day ' + d + ': leaving at rank ' + game.cond('diplomacy: rank') + ', merit ' + game.cond('diplomacy: merit'));
				mod.on_panel(game, 0);    // Leave
				check(game.cond('diplomacy: member') === 0, 'Leave ends membership');
				for (let f = 1; f <= 3; f++) {
					check(game.cond(SALARY[f]) === 0, 'leaving stops the salary');
					check(game.reputation(FLOT[f]) === 1.0, 'leaving resets reputations');
				}
				check(game.panel && JSON.stringify(game.panel.buttons) === '["Join","Close"]', 'after leaving the panel offers Join again');
				mod.on_panel(game, 1);
				leftDay = d;
			}
		}

		// --- State stays bounded.
		let n = 0;
		for (const [k, v] of game.conditions) if (k.startsWith('diplomacy: ') && v !== 0) n++;
		maxConditions = Math.max(maxConditions, n);
		for (let k = 1; k <= 12; k++) {
			const s = game.cond('diplomacy: garrison ' + k + ' system');
			if (s !== 0) check(s >= 1 && s <= game.names.length && game.cond('diplomacy: garrison ' + k + ' hp') >= 0, 'garrison slots sane');
		}
	}

	// ---------------------------------------------------------------- other checks
	// A day that goes backwards simulates nothing.
	{
		const snap = new Map([...game.conditions].filter(([k]) => k.startsWith('diplomacy: ') && k !== 'diplomacy: last day'));
		mod.on_day(game, game.today - 10);
		const same = [...snap].every(([k, v]) => game.cond(k) === v);
		check(same, 'a day going backwards changes nothing');
		game.setCond('diplomacy: last day', game.today);
	}
	// Another pilot (fresh conditions) sees nothing of this one's wars.
	{
		const other = new MockGame(galaxy);
		mod.on_load(other);
		check(other.map.markers.length === 0 && other.button === '' && other.cond('diplomacy: active') === 0, 'another pilot starts clean');
		other.today++;
		mod.on_day(other, other.today);
		check(other.map.markers.length === 0, 'and stays clean');
		mod.on_load(game);
		const [a] = war();
		check(a === 0 || game.map.markers.length > 0 || flotillas().length === 0, 'reloading the first pilot redraws its map');
	}
	// A forced war starts the next day, between the factions named.
	{
		game.setCond('diplomacy: force peace', 1);
		day(null);
		check(war()[0] === 0, 'force peace ends the war');
		game.setCond('diplomacy: force war', 13);
		day(null);
		check(war()[0] === 1 && war()[1] === 3, 'force war starts the named war');
	}

	// ---------------------------------------------------------------- summary
	const c = k => game.cond('diplomacy: stat ' + k);
	const avgSiege = c('timed sieges') ? c('siege days') / c('timed sieges') : 0;
	const ms = stats.measuredSieges;
	const avgMeasured = ms.length ? ms.reduce((x, y) => x + y, 0) / ms.length : 0;
	console.log('\n' + DAYS + ' days simulated');
	console.log('  wars: ' + c('wars') + ', truces: ' + c('truces') + ', days at war: ' + stats.warDays + ' (' + Math.round(100 * stats.warDays / DAYS) + '%)');
	console.log('  flotillas launched: ' + c('launches') + ', most at once: ' + stats.flotillaMax);
	console.log('  battles (flotilla-days of fighting): ' + c('battles') + ', interception orders: ' + c('intercepts ordered') + ', interceptions made: ' + c('interceptions'));
	console.log('  sieges begun: ' + c('sieges') + ', captures: ' + c('captures') + ' (Republic ' + c('captured by 1') + ', Free Worlds ' + c('captured by 2') + ', Syndicate ' + c('captured by 3') + '), recaptures of original territory: ' + stats.recaptures);
	console.log('  average siege: ' + avgSiege.toFixed(1) + ' days (mod), ' + avgMeasured.toFixed(1) + ' days (seen by the test); shortest ' + Math.min(...ms) + ', longest ' + Math.max(...ms) + '; the capturing flotilla itself sat ' + (stats.lastBesieger.reduce((x, y) => x + y, 0) / Math.max(1, stats.lastBesieger.length)).toFixed(1) + ' days on average');
	console.log('  in person: ' + stats.inPersonDays + ' visits, player kills ' + stats.kills + ', other kills ' + stats.otherKills + ', flotillas destroyed in person ' + c('destroyed in person') + '; fleets spawned: ' + game.spawned.flotilla + ' flotilla, ' + game.spawned.garrison + ' garrison');
	console.log('  player: promotions ' + stats.promotions + ', top rank ' + lastRank + ', merit kills ' + c('kills'));
	const pairs = {};
	for (const l of game.logs) { const m = /war between (.*) and (.*) until/.exec(l); if (m) { const k = [m[1], m[2]].sort().join(' vs '); pairs[k] = (pairs[k] || 0) + 1; } }
	console.log('  wars by pair: ' + Object.entries(pairs).map(([k, v]) => k + ' ' + v).join(', '));
	console.log('  most non-zero diplomacy conditions at once: ' + maxConditions + ', change() calls: ' + game.changes.length);
	for (let f = 1; f <= 3; f++) {
		const held = game.names.filter(n => game.governments.get(n) === GOVS[f]).length;
		const orig = game.names.filter(n => original.get(n) === GOVS[f]).length;
		console.log('  ' + GOVS[f] + ': ' + orig + ' systems at activation, ' + held + ' now');
	}

	console.log('  pirates: raids ' + c('raids') + ', completed ' + c('raids completed') + ', destroyed ' + c('raids destroyed') + ', plunder days ' + c('plunder days') + ', pirate battles ' + c('pirate battles') + ', relief flotillas ' + c('reliefs') + ' (' + stats.reliefPeace + ' seen launched in peace over ' + stats.raidDaysPeace + ' raid-days, ' + stats.reliefWar + ' at war over ' + stats.raidDaysWar + '), raiders killed by the player ' + stats.pirateKills);
	console.log('  commanders: killed ' + c('commanders killed') + ', retreats ' + c('retreats') + ', flotillas destroyed ' + c('flotillas destroyed'));
	for (let f = 1; f <= 4; f++) {
		const roster = [];
		for (let k = 1; k <= 5; k++) {
			const n = game.cond('diplomacy: admiral ' + f + '.' + k + ' name');
			if (n) roster.push(n + '/' + game.cond('diplomacy: admiral ' + f + '.' + k + ' personality') + '/' + game.cond('diplomacy: admiral ' + f + '.' + k + ' wins'));
		}
		console.log('  roster ' + f + ': ' + roster.join(' '));
		const names = roster.map(r => r.split('/')[0]);
		check(new Set(names).size === names.length, 'no two commanders of a side share a name');
	}

	check(c('raids') >= 50 && c('raids completed') >= 5 && c('raids destroyed') >= 5, 'raids set out, finish and are destroyed');
	check(c('plunder days') > 0, 'raids plunder');
	check(c('reliefs') >= 5 && c('pirate battles') >= 5, 'factions send relief, and it fights the raiders');
	const peaceRate = stats.reliefPeace / Math.max(1, stats.raidDaysPeace), warRate = stats.reliefWar / Math.max(1, stats.raidDaysWar);
	check(stats.raidDaysWar === 0 || warRate < peaceRate, 'relief is rarer at war: ' + warRate.toFixed(3) + ' vs ' + peaceRate.toFixed(3));
	check(c('commanders killed') > 0, 'commanders die with their flotillas');
	check(stats.pirateKills > 0 && c('pirate kills') > 0, 'members earn merit from raiders');
	check(c('wars') >= 5 && c('truces') >= 4, 'wars start and end');
	check(c('captures') >= 5, 'captures happen');
	check(c('interceptions') >= 3, 'interceptions happen');
	check(avgSiege >= 3 && avgSiege <= 10, 'sieges take several days: ' + avgSiege.toFixed(1));
	check(Math.min(...ms) >= 2, 'no siege is over in a day');
	check(stats.kills > 0 && c('kills') > 0, 'the player earns merit from kills');
	check(stats.promotions >= 2, 'rank rises with merit');
	check(game.spawned.garrison > 0, 'defenders spawn during a siege');
	check(c('destroyed in person') + stats.kills > 0, 'in-person fights feed back into the simulation');
	check(maxConditions < 450, 'state stays bounded');
	check(joinedDay > 0 && leftDay > 0 && otherPanelChecked, 'join/leave scenario ran');

	assert.equal(failures, 0, failures + ' check(s) failed:\n' + [...failed].map(([what, n]) => '  ' + n + 'x ' + what).join('\n'));
	console.log('\nall checks passed');
});
