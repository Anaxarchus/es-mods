// Simulation test for the Diplomacy mod: drives the built mod with a mock game
// (mock.mjs) over the real galaxy (the Free Worlds Veteran galaxy,
// test/galaxy.json) for thousands of days and checks its invariants. Like the
// other mods' tests it builds the mod with the SDK (harness.mjs) and is
// skipped when there is no Dado toolchain.
//
//   npm test                                          (from the SDK folder; 4000 days)
//   DIPLOMACY_DAYS=6000 node --test mods/diplomacy/test/sim.test.mjs
//
// The features (rebellion, defection, multiple wars, peace terms, the war
// likelihood rule, operations, migration...) have their own tests in
// factions.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockGame } from './mock.mjs';
import { Diplomacy, buildError, skip, loadTestGalaxy, GOVS, FLOT, CAPITALS, MINORS, sideOf, minorOf, state, wars, fleets, nonZeroConditions } from './harness.mjs';

const DAYS = parseInt(process.env.DIPLOMACY_DAYS || '4000', 10);
const SALARY = ['', 'salary: Republic commission', 'salary: Free Worlds', 'salary: Syndicate commission'];
const SALARIES = [200, 600, 1800, 3600, 6000, 8900, 12000];
const SIZES = ['', 'small', 'medium', 'large'];
const PIRATES = 4;

test('the mod builds', { skip: !Diplomacy && !buildError && 'no Dado toolchain' }, () => {
	if (buildError) assert.fail('mods/diplomacy did not build:\n' + (buildError.stderr?.toString() || '') + (buildError.stdout?.toString() || '') + buildError.message);
	assert.equal(typeof Diplomacy, 'function', 'the build exports class Diplomacy');
});

test(DAYS + ' simulated days keep the invariants', { skip }, () => {
	let failures = 0;
	const failed = new Map();
	function check(ok, what) {
		if (ok) return;
		failures++;
		const n = (failed.get(what) || 0) + 1;
		failed.set(what, n);
		if (n <= 3) console.error('FAIL (day ' + game.today + '): ' + what);
	}
	let seed = 12345;
	function rand(n) { seed = (seed * 48271) % 2147483647; return seed % n; }

	const galaxy = loadTestGalaxy();
	let game = new MockGame(galaxy);
	if (process.env.START_DAY) game.today = parseInt(process.env.START_DAY, 10);
	const mod = new Diplomacy();
	const major = g => { const k = GOVS.indexOf(g); return k >= 1 && k <= 3 ? k : 0; };
	const idx = new Map(game.names.map((n, i) => [n, i]));

	console.log('galaxy: ' + game.names.length + ' systems; ' + galaxy.events.length + ' events applied (the Free Worlds Veteran galaxy)');
	for (let f = 1; f <= 3; f++) console.log('  ' + GOVS[f] + ': ' + game.names.filter(n => game.governments.get(n) === GOVS[f]).length + ' systems');
	check(game.names.filter(n => game.governments.get(n) === 'Free Worlds').length === 57, 'the test galaxy is the Veteran start\'s: the Free Worlds hold 57 systems');

	function day(dest) {
		game.today++;
		if (dest && dest !== game.where) { game.moveTo(dest); mod.on_day(game, game.today); mod.on_enter(game, dest); }
		else { game.ships = []; mod.on_day(game, game.today); }
	}
	const hostileNow = (ws, f, g) => f !== g && (f === PIRATES || g === PIRATES || ws.some(w => (w.a === f && w.b === g) || (w.a === g && w.b === f)));
	const stats = { kills: 0, otherKills: 0, inPersonDays: 0, flotillaMax: 0, warDays: 0, fwWarDays: 0, multiWarDays: 0, measuredSieges: [], promotions: 0, captures: 0, treaty: 0, uprisings: 0 };

	function fly(steps = 240) {
		const ws = wars(game);
		for (let k = 0; k < steps; k++) {
			game.tick();
			mod.on_step(game, game.steps);
			if (game.steps % 60 !== 30) continue;
			const groups = new Map();
			for (const s of game.ships) if (s.alive && s.tag.startsWith('diplomacy:')) groups.set(s.tag, parseInt(s.tag.split(':')[1], 10));
			const member = game.cond('diplomacy: member');
			for (const [tag, f] of groups) {
				if (member !== 0 && hostileNow(ws, member, f) && rand(100) < 60 && game.playerKill(tag)) stats.kills++;
				for (const [, g] of groups) if (hostileNow(ws, f, g) && rand(100) < 40) { if (game.otherKill(tag)) stats.otherKills++; break; }
			}
		}
	}

	// ---------------------------------------------------------------- inactive
	mod.on_load(game);
	check(game.button === '', 'inactive: no planet button');
	for (let d = 0; d < 20; d++) { day(d % 2 ? 'Alpha Centauri' : 'Sol'); fly(60); }
	check(game.cond('diplomacy: active') === 0, 'inactive before the campaign ends');
	check(game.map.markers.length === 0 && game.messages.length === 0, 'inactive: nothing drawn or said');
	check(game.data('state') === '', 'inactive: nothing stored');

	// ---------------------------------------------------------------- the offer
	game.setCond('free worlds plot completed', 1);
	game.setCond('free worlds reconciliation', 1);
	day(null); fly(60);
	check(game.cond('diplomacy: active') === 0, 'the campaign alone does not turn Diplomacy on');
	mod.on_enter(game, 'Sol');
	check(game.panel && game.panel.title === 'A Council commission' && JSON.stringify(game.panel.buttons) === '["Accept the commission","Not now","Never"]', 'landing offers the Council commission');
	check(game.panel && /Alondo/.test(game.panel.text), 'framed as a Council commission from Alondo');
	check(game.button === 'Diplomacy', 'the planet button offers it too');
	mod.on_panel(game, 1);
	check(game.panel === null && game.cond('diplomacy: active') === 0, 'Not now closes the offer');
	mod.on_enter(game, 'Sol');
	check(game.panel === null, 'Not now: no offer on the next landing');
	mod.on_planet_button(game);
	check(game.panel && game.panel.title === 'A Council commission', 'the planet button reopens the offer');
	mod.on_panel(game, 0);
	check(game.cond('diplomacy: active') === 1, 'accepting turns it on');
	check(game.cond('diplomacy: member') === 2 && game.cond('diplomacy: rank') === 5, 'a campaign veteran serves the Free Worlds as a Commodore');
	check(game.cond('salary: Free Worlds') === 8900, 'at the campaign salary');
	check(game.cond('diplomacy: luna yard') === 1 && game.shipyards.get('Luna')?.includes('Navy Advanced'), 'Luna sells the Navy Advanced hulls');
	check(state(game) && state(game).v === 2, 'the state is stored as JSON (version 2)');
	check(game.panel && game.panel.title === 'The Republic' && game.panel.columns && game.panel.columns[0] === 'Minor', 'Sol\'s faction panel follows, with a table of minors');
	check(game.panel && game.panel.rows.some(r => r[0] === 'Earth (Republic core)'), 'the table shows the Republic\'s core as such');
	mod.on_panel(game, game.panel.buttons.length - 1);
	{
		const other = new MockGame(galaxy);
		other.setCond('free worlds plot completed', 1);
		mod.on_load(other);
		mod.on_enter(other, 'Sol');
		check(other.button === 'Diplomacy', 'another veteran pilot is offered it');
		mod.on_planet_button(other);
		mod.on_panel(other, 2);
		check(other.cond('diplomacy: declined') === 1 && other.cond('diplomacy: active') === 0, 'Never declines it');
		mod.on_enter(other, 'Sol');
		check(other.panel === null && other.button !== 'Diplomacy', 'and it is not offered again');
		mod.on_load(game);
	}
	day('Gamma Corvi'); fly(60);
	mod.on_planet_button(game);
	check(game.panel && game.panel.buttons[0] === 'Leave', 'the veteran can leave the Free Worlds');
	mod.on_panel(game, 0);
	mod.on_panel(game, game.panel.buttons.length - 1);
	check(game.cond('diplomacy: member') === 0 && game.cond('salary: Free Worlds') === 0, 'leaving ends membership and the salary');

	// ---------------------------------------------------------------- active
	let joinedDay = -1, leftDay = -1, otherPanelChecked = false, warRoomChecked = false;
	let maxConditions = 0, maxState = 0, lastRank = 0, lastStats = state(game).stats;
	const original = new Map(game.governments);

	for (let d = 1; d <= DAYS; d++) {
		const before = new Map(game.governments);
		const warsBefore = wars(game);
		const statsBefore = state(game).stats;
		let dest = null;
		const live = fleets(game);
		if (d % 6 === 0 && live.length > 0) {
			const sieging = live.filter(x => x.at === x.goal && x.target === 0 && x.kind === 0);
			const pick = sieging.length > 0 && d % 12 === 0 ? sieging[rand(sieging.length)] : live[rand(live.length)];
			dest = game.names[pick.at];
			stats.inPersonDays++;
		} else if (d % 6 === 3) {
			const owned = game.names.filter(n => major(game.governments.get(n)) !== 0);
			dest = owned[rand(owned.length)];
		}
		day(dest);
		fly();
		const ws = wars(game);
		const st = state(game);
		if (ws.length > 0) stats.warDays++;
		if (ws.length > 1) stats.multiWarDays++;
		if (ws.some(w => w.a === 2 || w.b === 2)) stats.fwWarDays++;

		// --- Every system that changed hands: a capture in a war over its minor, a treaty, or an uprising.
		const ended = warsBefore.filter(w => !ws.some(x => x.id === w.id));
		const uprising = (st.stats.rebellions || 0) + (st.stats.annexations || 0) > (statsBefore.rebellions || 0) + (statsBefore.annexations || 0);
		for (const n of game.names) {
			const was = before.get(n), now = game.governments.get(n);
			if (was === now) continue;
			const F = sideOf(now), E = sideOf(was);
			check(F !== 0 && E !== 0 && F !== PIRATES && E !== PIRATES, 'systems change hands only between factions and rebels: ' + n + ' ' + was + ' -> ' + now);
			check(!CAPITALS.includes(n), 'a capital never changes hands: ' + n);
			const k = minorOf.get(n);
			const inWar = warsBefore.find(w => ((w.a === F && w.b === E) || (w.a === E && w.b === F)) && w.goals.includes(k));
			const byTreaty = ended.some(w => (w.a === F && w.b === E) || (w.a === E && w.b === F));
			if (byTreaty) stats.treaty++; else if (inWar) stats.captures++; else if (uprising) stats.uprisings++;
			check(inWar || byTreaty || uprising, 'a system changes hands only in a war over its minor, by treaty, or in an uprising: ' + n + ' ' + was + ' -> ' + now);
			check(game.changes.some(c => c.day === game.today && c.text.includes('"' + n + '"') && c.text.includes('government')), 'a change goes through game.change: ' + n);
			if (k !== undefined && MINORS[k].core && sideOf(was) === GOVS.indexOf(MINORS[k].parent) && !inWar && !byTreaty) check(false, 'a core never rebels: ' + n);
		}
		for (let f = 1; f <= 3; f++) check(game.governments.get(CAPITALS[f]) === GOVS[f], 'capitals keep their owner');
		check(game.changes.filter(c => c.day === game.today).length <= 2, 'at most one batched change a day (two with a capture in person)');

		// --- Wars.
		check(ws.length <= 4, 'at most 4 wars at once');
		for (const w of ws) {
			check(w.goals.length >= 1 && w.goals.length <= 4, 'every war has one to four goals (a widened war more than two)');
			for (const g of w.goals) check(!(MINORS[g].parent === 'Pirate'), 'no war is over a pirate holding');
		}
		for (let f = 1; f <= 3; f++) {
			check(game.cond('diplomacy: at war ' + f) === (ws.some(w => w.a === f || w.b === f) ? 1 : 0), 'at war flags match the wars');
			for (let g = 1; g <= 3; g++) if (f !== g) check(game.attitude(FLOT[f], FLOT[g]) === (hostileNow(ws, f, g) ? -1 : 0), 'flotilla attitudes match the wars');
		}
		const a = game.cond('diplomacy: war a'), b = game.cond('diplomacy: war b');
		check(a === 0 ? !ws.some(w => w.a <= 3 && w.b <= 3) : ws.some(w => (w.a === a && w.b === b)), '"war a"/"war b" name a war between majors (Corporations reads them)');
		check(game.cond('diplomacy: wars') === ws.length, '"wars" counts them');

		// --- Flotillas.
		const now = fleets(game);
		stats.flotillaMax = Math.max(stats.flotillaMax, now.length);
		for (let f = 1; f <= 3; f++) check(now.filter(x => x.side === f && x.kind !== 3).length <= 4, 'at most 4 flotillas per major (besides those going home)');
		for (const x of now) {
			if (x.side > 4) check(now.filter(y => y.side === x.side && y.kind !== 3).length <= 2, 'at most 2 flotillas per rebel faction');
			if (x.kind === 0) {
				const w = ws.find(w => w.id === x.war);
				check(w && (w.a === x.side || w.b === x.side), 'a war flotilla fights in a war of its side');
			}
			check(x.admiral >= 1, 'every flotilla has a commander');
			check(x.strength > 0 && x.strength <= 625, 'flotilla strength in range: ' + x.strength);
			check(x.size >= 1 && x.size <= 3, 'flotilla size 1..3');
			check(x.at >= 0 && x.at < game.names.length && minorOf.has(game.names[x.at]), 'flotillas stay in human space');
			if (x.target !== 0) check(now.some(y => y.id === x.target && hostileNow(ws, x.side, y.side)), 'an interception target is a live enemy');
			if (x.side !== PIRATES) {
				const title = (x.side <= 3 ? GOVS[x.side] : MINORS[x.side - 5].rebels) + ' flotilla (' + SIZES[x.size] + ')';
				check(game.map.markers.some(m => m.system === game.names[x.at] && m.label === title), 'each flotilla has a marker: ' + title);
			}
		}
		for (const m of game.map.markers) check(idx.has(m.system) && m.label.length > 0 && m.label.length <= 40, 'markers name real systems, briefly');
		for (const r of game.rings) {
			const k = minorOf.get(r.system);
			check(ws.some(w => w.goals.includes(k)), 'rings mark war goals only: ' + r.system);
		}
		check(game.labels.length === MINORS.length, 'every minor has a label on the map');
		for (const r of fleets(game).filter(x => x.side === PIRATES)) {
			check(r.kind === 2 && r.stops.length >= 1 && r.stops.length <= 3, 'pirate raids have 1-3 stops');
			check(game.map.markers.some(m => m.system === game.names[r.at] && m.label.startsWith('Pirate raiders')), 'each raid has a marker');
		}

		// --- The planet button.
		const here = sideOf(game.governments.get(game.where));
		check(game.button === (here !== 0 && here !== PIRATES ? 'Faction' : ''), 'planet button matches the system');

		// --- Joining, the War Room, merit, rank, salary, leaving.
		const member = game.cond('diplomacy: member');
		if (joinedDay < 0 && ws.some(w => w.a <= 3 && w.b <= 3)) {
			const w = ws.find(w => w.a <= 3 && w.b <= 3);
			day(CAPITALS[w.a]); fly(60);
			mod.on_planet_button(game);
			check(game.panel && game.panel.title === 'The ' + GOVS[w.a], 'panel opens with the faction title');
			check(game.panel && JSON.stringify(game.panel.buttons) === '["Join","War Room","Service Record","Close"]', 'a non-member sees Join, War Room, Service Record and Close: ' + JSON.stringify(game.panel && game.panel.buttons));
			check(game.panel && game.panel.text.includes('Capital: ' + CAPITALS[w.a]), 'panel text names the capital');
			mod.on_panel(game, 0);
			check(game.cond('diplomacy: member') === w.a, 'Join makes the player a member');
			check(game.panel && game.panel.buttons[0] === 'Leave', 'a member sees Leave');
			mod.on_panel(game, game.panel.buttons.length - 1);
			check(game.panel === null, 'Close closes the panel');
			joinedDay = d;
		}
		if (!warRoomChecked && ws.length > 0 && st.history.length > 3) {
			mod.on_planet_button(game);
			const k = game.panel ? game.panel.buttons.indexOf('War Room') : -1;
			check(k >= 0, 'the panel has a War Room button');
			if (k >= 0) {
				mod.on_panel(game, k);
				check(game.screen && game.screen.title === 'War Room', 'the War Room is a full screen');
				check(game.screen && game.screen.charts.length === 3 && game.screen.charts[0].label === 'Republic', 'it charts each major\'s territory');
				check(game.screen && game.screen.rows.length === ws.length, 'a row per war');
				mod.on_panel_row(game, 0);
				check(game.screen && game.screen.selected === 0 && /Score/.test(game.screen.text), 'choosing a war shows its score and goals');
				for (const tab of ['Forces', 'Minors', 'Chronicle']) {
					const j = game.screen.buttons.indexOf(tab);
					check(j >= 0, 'the War Room has a ' + tab + ' tab');
					mod.on_panel(game, j);
				}
				check(game.screen && game.screen.rows.length === st.chronicle.length, 'the Chronicle tab lists the chronicle');
				mod.on_panel(game, game.screen.buttons.indexOf('Minors'));
				check(game.screen && game.screen.rows.length === MINORS.length && game.screen.charts[0].label === 'Rebels', 'the Minors tab lists every minor and charts the rebels');
				mod.on_panel(game, game.screen.buttons.indexOf('Close'));
				check(game.panel === null && game.screen === null, 'Close closes the War Room');
			}
			warRoomChecked = true;
		}
		if (member !== 0) {
			check(game.reputation(FLOT[member]) === 10.0, 'a member is an ally of its flotillas');
			for (let f = 1; f <= 3; f++) if (f !== member)
				check(game.reputation(FLOT[f]) === (hostileNow(ws, member, f) ? -10.0 : 1.0), 'reputation with other flotillas follows the wars');
			const rank = game.cond('diplomacy: rank');
			check(game.cond(SALARY[member]) === SALARIES[rank], 'salary follows the rank curve');
			if (rank > lastRank) stats.promotions++;
			lastRank = rank;
			if (d === joinedDay + 6) game.setCond('diplomacy: merit', game.cond('diplomacy: merit') + 30);
			if (!otherPanelChecked && d > joinedDay + 10) {
				const other = [1, 2, 3].find(f => f !== member);
				day(CAPITALS[other]); fly(60);
				mod.on_planet_button(game);
				check(game.panel && game.panel.buttons[0] === 'War Room', 'a member of another faction cannot join');
				check(game.panel && game.panel.text.includes('leave'), 'and is told to leave first');
				mod.on_panel(game, game.panel.buttons.length - 1);
				otherPanelChecked = true;
			}
			if (leftDay < 0 && d >= DAYS - 300) {
				day(CAPITALS[member]); fly(60);
				mod.on_planet_button(game);
				mod.on_panel(game, 0);
				check(game.cond('diplomacy: member') === 0, 'Leave ends membership');
				for (let f = 1; f <= 3; f++) check(game.cond(SALARY[f]) === 0 && game.reputation(FLOT[f]) === 1.0, 'leaving stops the salary and resets reputations');
				mod.on_panel(game, game.panel.buttons.length - 1);
				leftDay = d;
			}
		}
		maxConditions = Math.max(maxConditions, nonZeroConditions(game));
		maxState = Math.max(maxState, game.data('state').length);
		lastStats = st.stats;
	}

	// ---------------------------------------------------------------- other checks
	{
		const snap = new Map([...game.conditions].filter(([k]) => k.startsWith('diplomacy: ') && k !== 'diplomacy: last day'));
		mod.on_day(game, game.today - 10);
		check([...snap].every(([k, v]) => game.cond(k) === v), 'a day going backwards changes nothing');
		mod.on_day(game, game.today);
	}
	{
		const other = new MockGame(galaxy);
		mod.on_load(other);
		check(other.map.markers.length === 0 && other.button === '' && other.cond('diplomacy: active') === 0, 'another pilot starts clean');
		other.today++;
		mod.on_day(other, other.today);
		check(other.map.markers.length === 0 && other.data('state') === '', 'and stays clean');
		mod.on_load(game);
		check(game.labels.length === MINORS.length, 'reloading the first pilot reads its world again and redraws its map');
	}
	{
		game.setCond('diplomacy: force peace', 1);
		day(null);
		check(wars(game).length === 0, 'force peace ends every war');
		game.setCond('diplomacy: force war', 13);
		day(null);
		check(wars(game).some(w => w.a === 1 && w.b === 3), 'force war starts the named war');
	}

	// ---------------------------------------------------------------- summary
	const st = state(game).stats;
	const c = k => st[k] || 0;
	console.log('\n' + DAYS + ' days simulated');
	console.log('  wars: ' + c('wars') + ' (' + Object.entries(st).filter(([k]) => k.startsWith('wars ')).map(([k, v]) => k.slice(5) + ' ' + v).join(', ') + '), peaces: ' + c('peaces'));
	console.log('  days at war: ' + stats.warDays + ' (' + Math.round(100 * stats.warDays / DAYS) + '%), the Free Worlds at war ' + Math.round(100 * stats.fwWarDays / DAYS) + '%, two or more wars ' + Math.round(100 * stats.multiWarDays / DAYS) + '%');
	console.log('  flotillas launched: ' + c('launches') + ', most at once: ' + stats.flotillaMax + '; battles ' + c('battles') + ', interceptions ' + c('interceptions'));
	console.log('  sieges: ' + c('sieges') + ', captures: ' + c('captures') + ', average siege ' + (c('siege days') / Math.max(1, c('timed sieges'))).toFixed(1) + ' days; sieges broken ' + c('sieges broken') + '; patrol swaps ' + c('patrol swaps'));
	console.log('  changes of hands seen: ' + stats.captures + ' in war, ' + stats.treaty + ' by treaty, ' + stats.uprisings + ' in uprisings; systems moved by treaty (mod) ' + c('systems moved by treaty'));
	console.log('  rebellions: ' + c('rebellions') + ' (separatist ' + c('separatists') + ', defection ' + c('defections') + ', annexations ' + c('annexations') + ')');
	console.log('  in person: ' + stats.inPersonDays + ' visits, player kills ' + stats.kills + ', flotillas destroyed in person ' + c('destroyed in person'));
	console.log('  most non-zero conditions: ' + maxConditions + '; state up to ' + maxState + ' bytes; change() calls: ' + game.changes.length + '; messages: ' + game.messages.length);
	for (let f = 1; f <= 3; f++) console.log('  ' + GOVS[f] + ': ' + game.names.filter(n => original.get(n) === GOVS[f]).length + ' systems at activation, ' + game.names.filter(n => game.governments.get(n) === GOVS[f]).length + ' now');

	check(c('wars') >= 15, 'wars start');
	check(c('peaces') >= 10, 'and end in peace');
	check(stats.multiWarDays > 0, 'wars run side by side');
	check(c('captures') >= 10, 'captures happen');
	check(c('patrol swaps') > 0, 'captured systems get their new owner\'s patrols');
	check(c('raids') >= 50 && c('raids completed') >= 5 && c('raids destroyed') >= 5, 'raids set out, finish and are destroyed');
	check(c('reliefs') >= 5, 'majors send relief after raids');
	check(c('commanders killed') > 0, 'commanders die with their flotillas');
	check(c('timed sieges') === 0 || (c('siege days') / c('timed sieges') >= 2.5 && c('siege days') / c('timed sieges') <= 12), 'sieges take several days');
	check(stats.kills > 0 && c('kills') > 0, 'the player earns merit from kills');
	check(stats.promotions >= 1, 'rank rises with merit');
	check(maxConditions <= 200, 'the conditions stay bounded: ' + maxConditions);
	check(maxState <= 40000, 'the stored state stays bounded: ' + maxState);
	check(game.messages.length <= DAYS / 2, 'messages are batched (at most one every other day on average): ' + game.messages.length);
	check(joinedDay > 0 && leftDay > 0 && otherPanelChecked && warRoomChecked, 'join/leave and War Room scenarios ran');

	assert.equal(failures, 0, failures + ' check(s) failed:\n' + [...failed].map(([what, n]) => '  ' + n + 'x ' + what).join('\n'));
	console.log('\nall checks passed');
});
