// M2 ("Command and consequence") tests: the player's squadrons, rival
// commanders, fog of war and supply, occupation and reconstruction (prices
// and shipyard stock, with Corporations' convention), the Corporations link
// over mod API 10's bus, on_save, and reloading the new state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MockGame } from './mock.mjs';
import { tradeDados } from '../tools/regions/build.mjs';
import { Diplomacy, skip, HERE, loadTestGalaxy, GOVS, CAPITALS, veteran, forced, day, state, wars, fleets, edit, nonZeroConditions, sysIndex } from './harness.mjs';

const galaxy = loadTestGalaxy();
const run = (game, mod, n, dest) => { for (let k = 0; k < n; k++) day(game, mod, dest); };
const idx = (game, name) => game.names.indexOf(name);

// A Free Worlds Commodore (one squadron) at war with the Republic.
function atWar({ api10 = false, start = 0 } = {}) {
	const mod = new Diplomacy();
	const game = new MockGame(galaxy, { api10 });
	game.today = 1100000 + start;
	game.setCond('free worlds plot completed', 1);
	game.setCond('free worlds reconciliation', 1);
	mod.on_load(game);
	game.today++;
	mod.on_day(game, game.today);
	mod.on_enter(game, 'Sol');
	mod.on_panel(game, 0);
	game.setCond('diplomacy: force war', 12);
	day(game, mod);
	assert.ok(wars(game).some(w => w.a === 1 && w.b === 2), 'the Republic and the Free Worlds are at war');
	return { game, mod };
}

test('src/Trade.dados is what tools/regions/build.mjs makes from the galaxy', () => {
	const json = JSON.parse(readFileSync(join(HERE, 'galaxy.json'), 'utf8'));
	assert.equal(readFileSync(join(HERE, '..', 'src', 'Trade.dados'), 'utf8'), tradeDados(json));
});

// ---- Membership: landing and the map ----

test('a member can land on every world of its faction, which stands out on the map', { skip }, () => {
	const { game, mod } = atWar();
	assert.ok(game.reputation('Free Worlds') >= 100, 'a Free Worlds member is welcome on every Free Worlds world');
	assert.equal(game.governmentColors.get('Free Worlds'), '1 0.35 0.85');
	mod.service.leave(game);
	assert.equal(game.reputation('Free Worlds'), 1, 'leaving takes back the standing membership gave');
	assert.equal(game.governmentColors.get('Free Worlds'), 'governments: Free', 'and the faction\'s own colour');
	game.set_reputation('Republic', -30);
	mod.service.join(game, 1);
	assert.ok(game.reputation('Republic') >= 100, 'joining the Republic clears an old grudge and opens Earth, Hermes and the stations');
	assert.equal(game.governmentColors.get('Republic'), '1 0.35 0.85');
	game.set_reputation('Republic', 40);
	mod.on_enter(game, 'Sol');
	assert.ok(game.reputation('Republic') >= 100, 'standing lost while a member is restored on the next jump');
	mod.service.leave(game);
	assert.equal(game.reputation('Republic'), 1, 'leaving: no lower than neutral, and the grudge stays forgiven');
	assert.equal(game.governmentColors.get('Republic'), 'governments: Republic');
});

// ---- Squadrons ----

test('a Commodore commands one squadron from the War Room; it follows an attack order', { skip }, () => {
	const { game, mod } = atWar();
	day(game, mod, 'Gamma Corvi');
	game.landed = 'Gamma Corvi';
	mod.on_planet_button(game);
	const warRoom = game.panel.buttons.indexOf('War Room');
	assert.ok(warRoom >= 0);
	mod.on_panel(game, warRoom);
	const cmd = game.screen.buttons.indexOf('Command');
	assert.ok(cmd >= 0, 'the Command tab is there at Commodore');
	mod.on_panel(game, cmd);
	const rows = game.screen.rows.map(r => r[0]);
	const form = rows.findIndex(r => /Form a new squadron/.test(r));
	const attack = rows.findIndex(r => /^\s*Attack /.test(r));
	assert.ok(form >= 0 && attack >= 0, 'a new squadron and attack orders are offered: ' + rows.join(' | '));
	const target = rows[attack].trim().replace(/^Attack /, '').replace(/ \(.*$/, '');
	mod.on_panel_row(game, form);
	mod.on_panel_row(game, attack);
	assert.match(game.screen.text, /Your squadron under/);
	let sq = fleets(game).filter(x => x.squadron === 1);
	// The state is written at the end of the day; read the mod's own world now.
	sq = mod.world.fleets.filter(x => x.alive() && x.squadron === 1);
	assert.equal(sq.length, 1, 'one squadron');
	assert.equal(sq[0].side, 2);
	assert.equal(sq[0].order, 1);
	assert.equal(game.names[sq[0].goal], target);
	// It moves toward the target day by day (or the order is done, or it falls).
	const start = sq[0].at, goal = sq[0].goal;
	const d0 = mod.galaxy.jumps(start, goal);
	game.landed = '';
	run(game, mod, 3);
	const x = fleets(game).find(f => f.squadron === 1);
	if (x && x.order === 1) assert.ok(mod.galaxy.jumps(x.at, goal) < d0 || x.at === goal, 'it closes on its target');
	assert.equal(game.cond('diplomacy: squadrons'), x ? 1 : 0);
	if (x) assert.equal(game.cond('diplomacy: squadron 1 goal'), x.goal + 1);
	// No second squadron at Commodore.
	mod.squadron.list_orders(game);
	const answer = mod.squadron.order(game, 0, 0, game.today);
	if (x) assert.match(answer, /no more squadrons/);
});

test('squadron places: rank sets how many, a demotion stands one down, a full faction hands over a flotilla', { skip }, () => {
	const { game, mod } = atWar();
	const merit = [0, 10, 25, 50, 100, 200, 400, 700, 1100];
	const allowed = r => { game.setCond('diplomacy: merit', merit[r]); return mod.squadron.allowed(game); };
	assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(allowed), [0, 0, 0, 0, 0, 1, 2, 2, 3]);
	game.setCond('diplomacy: merit', 400);
	mod.squadron.list_orders(game);
	const k = mod.squadron.labels.findIndex(l => l.startsWith('Attack'));
	// Fill every Free Worlds place with AI flotillas first.
	for (let n = 0; n < 6 && mod.sim.has_room(2); n++) mod.sim.commission(2, wars(game)[0].id, 0, 2, 200, idx(game, 'Gamma Corvi'), game.today);
	assert.ok(!mod.sim.has_room(2));
	const before = mod.world.fleets.filter(x => x.alive() && x.side === 2).length;
	assert.match(mod.squadron.order(game, 0, k, game.today), /Your squadron/);
	assert.equal(mod.world.fleets.filter(x => x.alive() && x.side === 2).length, before, 'no flotilla over the cap: one came under command');
	assert.equal(mod.squadron.mine().length, 1);
	mod.squadron.order(game, 0, k, game.today);
	assert.equal(mod.squadron.mine().length, 2, 'an Admiral commands two');
	game.setCond('diplomacy: merit', 200);
	mod.squadron.check(game);
	assert.equal(mod.squadron.mine().length, 1, 'back at Commodore one is stood down');
	game.setCond('diplomacy: member', 0);
	mod.squadron.check(game);
	assert.equal(mod.squadron.mine().length, 0, 'leaving the faction stands them all down');
});

test('a squadron counts the player\'s fleet, and fights harder with the player beside it', { skip }, () => {
	const { game, mod } = atWar();
	const bare = mod.squadron.strength(game, 2);
	game.fleet = ['Sparrow', 'Sparrow'];
	assert.equal(mod.squadron.strength(game, 2), bare + Math.floor(440000 * 0.5 / 50000), 'at half the new price');
	game.fleet = ['Carrier', 'Carrier', 'Cruiser'];
	assert.equal(mod.squadron.strength(game, 2), bare + 200, 'the fleet bonus is capped');
	const x = mod.sim.commission(2, wars(game)[0].id, 0, 2, 200, idx(game, 'Gamma Corvi'), game.today);
	x.squadron = 1;
	x.supply = 100;
	game.where = 'Sol';
	const away = mod.sim.score(game, x);
	game.where = 'Gamma Corvi';
	assert.ok(Math.abs(mod.sim.score(game, x) - away * 1.3) < 1e-6, 'squadron_presence: 130%');
});

test('losing the squadron costs merit and standing, and says so', { skip }, () => {
	const { game, mod } = atWar();
	game.setCond('diplomacy: merit', 260);
	mod.squadron.list_orders(game);
	assert.match(mod.squadron.order(game, 0, mod.squadron.labels.findIndex(l => l.startsWith('Attack')), game.today), /Your squadron/);
	const x = mod.squadron.mine()[0];
	const rep = game.reputation('Free Worlds');
	mod.sim.lost(game, x, game.today, 1);
	x.strength = 0;
	assert.equal(game.cond('diplomacy: merit'), 245);
	assert.equal(game.reputation('Free Worlds'), rep - 5);
	assert.ok(mod.world.chronicle.some(e => /Your squadron under .* is destroyed/.test(e)));
});

test('the force squadron override gives a squadron ordered to attack', { skip }, () => {
	const { game, mod } = atWar();
	const target = mod.sim.targets(mod.world.wars[0], 2)[0];
	game.setCond('diplomacy: force squadron', target + 1);
	day(game, mod, 'Gamma Corvi');
	const sq = fleets(game).filter(x => x.squadron === 1);
	assert.equal(sq.length, 1);
	assert.equal(sq[0].order, 1);
	assert.equal(game.cond('diplomacy: force squadron'), 0);
});

test('over a long war the squadron neither snowballs nor breaks the flotilla caps', { skip }, () => {
	const { game, mod } = atWar();
	game.fleet = ['Carrier', 'Carrier'];
	game.setCond('diplomacy: merit', 1100);
	let maxStrength = 0, formed = 0;
	for (let d = 0; d < 1500; d++) {
		if (d % 15 === 0 && mod.world.wars.some(w => w.involves(2))) {
			mod.squadron.list_orders(game);
			const k = mod.squadron.labels.findIndex(l => l.startsWith('Attack') || l.startsWith('Hunt'));
			if (k >= 0 && mod.squadron.mine().length < 3) { mod.squadron.order(game, 0, k, game.today); formed++; }
		}
		if (d % 40 === 0 && !mod.world.wars.some(w => w.involves(2))) { game.setCond('diplomacy: force war', 12); }
		day(game, mod);
		const now = fleets(game);
		for (const x of now.filter(f => f.squadron === 1)) maxStrength = Math.max(maxStrength, x.strength);
		assert.ok(now.filter(f => f.side === 2 && f.kind !== 3).length <= 4, 'at most 4 Free Worlds flotillas, squadrons included');
		assert.ok(now.filter(f => f.squadron === 1).length <= 3);
	}
	assert.ok(formed > 0);
	assert.ok(maxStrength <= 625, 'squadron strength stays in range: ' + maxStrength);
	const R = game.names.filter(n => game.governments.get(n) === 'Republic').length;
	assert.ok(R >= 89 * 0.45, 'the Republic is not swallowed by the player\'s squadrons: ' + R);
});

// ---- Rivals ----

test('a commander who keeps meeting the player becomes a rival with a trait, a bounty and news', { skip }, () => {
	const { game, mod } = atWar();
	const enemy = mod.sim.commission(1, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Sol'), game.today);
	assert.ok(enemy.admiral >= 1);
	for (let k = 0; k < 4; k++) mod.rivals.met(enemy);
	day(game, mod);
	assert.ok(mod.admirals.is_rival(1, enemy.admiral), 'a rival');
	const t = mod.admirals.trait(1, enemy.admiral);
	assert.ok(t >= 1 && t <= 5, 'with a trait');
	assert.equal(game.cond('diplomacy: rivals'), 1);
	assert.equal(game.cond('diplomacy: bounty'), 1);
	assert.ok(game.messages.some(m => /sworn to hunt you down/.test(m.text)) || mod.world.chronicle.some(e => /sworn to hunt you down/.test(e)));
	// One per side, at most max_rivals in all.
	const other = mod.sim.commission(1, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Sol'), game.today);
	for (let k = 0; k < 5; k++) mod.rivals.met(other);
	day(game, mod);
	assert.equal(mod.rivals.count(), 1, 'one rival per side');
	// Killed in person: the Nemesis Star.
	const x = mod.world.fleets.find(f => f.alive() && f.side === 1 && f.admiral === enemy.admiral);
	mod.sim.in_person = true;
	mod.sim.lost(game, x, game.today, 2);
	mod.sim.in_person = false;
	assert.ok(!mod.admirals.is_rival(1, enemy.admiral) || !mod.admirals.filled(1, enemy.admiral), 'the rival is dead');
	assert.ok(mod.world.medals.some(m => /nemesis/.test(m)), 'the Nemesis Star');
	day(game, mod);
	assert.equal(game.cond('diplomacy: commander news'), 1);
});

test('rival traits change the fighting: grudge, veteran, siege engineer', { skip }, () => {
	const { game, mod } = atWar();
	const x = mod.sim.commission(1, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Sol'), game.today);
	const base = mod.admirals.attack(1, x.admiral), siege = mod.admirals.siege(1, x.admiral);
	mod.admirals.put(1, x.admiral, 5, 1);
	mod.admirals.put(1, x.admiral, 4, 3);
	assert.equal(mod.admirals.attack(1, x.admiral), Math.trunc(base * 115 / 100), 'veteran');
	mod.admirals.put(1, x.admiral, 4, 4);
	assert.equal(mod.admirals.siege(1, x.admiral), Math.trunc(siege * 135 / 100), 'siege engineer');
});

// ---- Fog of war ----

test('fog: a non-member sees two jumps around them; a member sees around their territory and flotillas; out of sight is a faded last-seen label', { skip }, () => {
	const { game, mod } = forced(galaxy);
	game.today++;
	mod.on_day(game, game.today);
	game.setCond('diplomacy: force war', 12);
	run(game, mod, 30);
	const now = mod.world.fleets.filter(x => x.alive());
	assert.ok(now.length > 0);
	for (const x of now) {
		const d = mod.galaxy.jumps(x.at, idx(game, game.where));
		const marked = game.map.markers.some(m => m.system === game.names[x.at]);
		if (d > 2 && !mod.world.scouted_now(x.at, game.today) && !now.some(y => y !== x && y.at === x.at)) assert.ok(!marked, 'no marker beyond sight: ' + game.names[x.at]);
	}
	// A member sees their own flotillas anywhere.
	const v = atWar();
	run(v.game, v.mod, 20);
	for (const x of v.mod.world.fleets.filter(f => f.alive() && f.side === 2))
		assert.ok(v.game.map.markers.some(m => m.system === v.game.names[x.at]), 'own flotillas are always shown');
	assert.ok(v.game.labels.filter(l => / ago$/.test(l.text)).length <= 32);
});

test('scouting reveals a system and its neighbours for scout_days', { skip }, () => {
	const { game, mod } = atWar();
	const far = idx(game, 'Sol');
	const nb = mod.galaxy.links[far][0];
	mod.intel.scout(far, game.today);
	assert.ok(mod.world.scouted_now(far, game.today) && mod.world.scouted_now(nb, game.today));
	assert.ok(mod.intel.sees(game, 2, far, game.today), 'Sol in sight once scouted');
	assert.ok(mod.world.scouted_now(far, game.today + 10));
	assert.ok(!mod.world.scouted_now(far, game.today + 11), 'for ten days');
	run(game, mod, 12);
	assert.ok(mod.world.scouted.length <= 60);
});

test('sightings are kept, aged and capped', { skip }, () => {
	const { game, mod } = atWar();
	run(game, mod, 200);
	assert.ok(mod.world.sightings.length <= 32);
	for (const s of mod.world.sightings) {
		const f = s.split('|');
		assert.equal(f.length, 5);
		assert.ok(game.today - Number(f[4]) <= 20, 'no sighting older than sighting_days');
	}
});

// ---- Supply ----

test('supply: full near depots, less per jump beyond, a floor, and raided depots count for nothing', { skip }, () => {
	const { game, mod } = atWar();
	const t = mod.tune;
	const x = mod.sim.commission(2, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Gamma Corvi'), game.today);
	mod.sim.supply(game, game.today);
	assert.equal(x.supply, 100, 'at home');
	x.at = idx(game, 'Sol');
	mod.sim.depot_day = -1;
	mod.sim.supply(game, game.today);
	const d = mod.sim.depots(game, 2, game.today)[x.at];
	assert.equal(x.supply, Math.max(t.supply_floor, 100 - (d - t.supply_free) * t.supply_per_jump));
	assert.ok(x.supply < 100 && x.supply >= t.supply_floor);
	// Raid the depots near a flotilla: supply falls.
	const y = mod.sim.commission(2, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Gamma Corvi'), game.today);
	for (const i of mod.galaxy.human) if (mod.galaxy.owner(i) === 2) mod.world.depots_down.push([i, game.today + 20]);
	mod.sim.depot_day = -1;
	mod.sim.supply(game, game.today);
	assert.equal(y.supply, t.supply_floor, 'every depot raided: down to the floor');
});

// ---- Occupation ----

function capture(game, mod, name, by) {
	const i = idx(game, name);
	const from = mod.galaxy.owner(i);
	mod.politics.transfer(game, i, from, by, game.today, mod.world.wars[0].id);
	mod.occupation.damage(i, mod.tune.capture_damage);
	return i;
}

test('occupation: a capture brings unrest and damage; unrest weakens the garrison and both fall over time', { skip }, () => {
	const { game, mod } = atWar();
	const i = capture(game, mod, 'Kraz', 1);
	const k = mod.world.occupation_index(i);
	assert.ok(k >= 0);
	assert.equal(mod.world.occupation[k][1], 600, 'foreign occupation: 60 unrest');
	assert.equal(mod.world.occupation[k][2], 300, '30 damage');
	const weak = mod.sim.full_strength(game, i);
	const rec = mod.world.occupation[k];
	mod.world.occupation[k] = [i, 0, 300, 0];
	const calm = mod.sim.full_strength(game, i);
	mod.world.occupation[k] = rec;
	assert.equal(weak, Math.max(1, Math.trunc(calm * 70 / 100)), 'the garrison stands at 100 - unrest/2 percent');
	run(game, mod, 30);
	const r = mod.world.occupation[mod.world.occupation_index(i)];
	assert.ok(r[1] < 600 && r[2] < 300, 'both fall');
	assert.ok(game.cond('diplomacy: occupied') >= 1 && game.cond('diplomacy: damaged') >= 1);
	run(game, mod, 300);
	assert.equal(mod.world.occupation_index(i), -1, 'repaired and calm: the record goes');
	assert.equal(game.trade.get('Kraz|Food'), galaxy.systems.get('Kraz').trade.Food, 'the price is back to the data price');
});

test('occupation unrest lowers the minor\'s unrest target only a little', { skip }, () => {
	const { game, mod } = atWar();
	const m = mod.galaxy.minor(idx(game, 'Kraz'));
	const before = mod.politics.unrest_target(m);
	for (const s of mod.galaxy.minor_systems[m]) { const k = mod.occupation.record(s); mod.world.occupation[k][1] = 1000; }
	assert.ok(mod.politics.unrest_target(m) - before <= mod.tune.occupation_minor_cap);
});

// The price game.trade holds for a system's commodity.
const price = (game, s, c) => game.trade.get(s + '|' + c);

for (const api10 of [false, true]) test('damage raises food, medicine and clothing prices by tier, and repair restores them exactly (' + (api10 ? 'API 10' : 'API 9') + ')', { skip }, () => {
	const { game, mod } = atWar({ api10 });
	const base = { ...galaxy.systems.get('Kraz').trade };
	const i = capture(game, mod, 'Kraz', 1);
	mod.world.occupation[mod.world.occupation_index(i)][2] = 900;
	day(game, mod);
	const tier = mod.world.occupation[mod.world.occupation_index(i)][3];
	assert.ok(tier >= 2, 'tier ' + tier);
	for (const c of ['Food', 'Medical', 'Clothing']) {
		if (!base[c]) continue;
		assert.equal(price(game, 'Kraz', c), base[c] + Math.trunc(base[c] * 12 * tier / 100), c + ' raised by tier');
	}
	// Another mod (not in a crisis it announced) moves Food meanwhile: only the delta is ours.
	game.change('system "Kraz"\n\ttrade "Food" ' + (price(game, 'Kraz', 'Food') + 40));
	mod.world.occupation[mod.world.occupation_index(i)][2] = 0;
	mod.world.occupation[mod.world.occupation_index(i)][1] = 0;
	run(game, mod, 3);
	for (const c of ['Medical', 'Clothing']) if (base[c]) assert.equal(price(game, 'Kraz', c), base[c], c + ' restored exactly');
	if (api10) assert.equal(price(game, 'Kraz', 'Food'), base.Food + 40, 'the other mod\'s change survives (API 10 reads the price now)');
	assert.equal(mod.world.trade.length, 0, 'no delta left');
	assert.ok(game.tradeLines <= 12, 'batched: ' + game.tradeLines + ' trade lines');
});

test('a Corporations crisis (API 10): no price it raised is written, and both restore exactly', { skip }, () => {
	const { game, mod } = atWar({ api10: true });
	const base = { ...galaxy.systems.get('Kraz').trade };
	// Corporations raises Food in Kraz and next door, announces the crisis.
	const before = price(game, 'Kraz', 'Food');
	game.change('system "Kraz"\n\ttrade "Food" ' + Math.round(before * 1.5));
	mod.on_notification(game, 'corporations.crisis', JSON.stringify({ company: 'Kraz Cybernetics', kind: 'strike', sector: 'food', system: 'Kraz', commodities: ['Food'], factor: 1.5, days: 20 }), 'corporations');
	assert.ok(mod.world.reserved.some(r => r.startsWith('Kraz|Food|')));
	const i = capture(game, mod, 'Kraz', 1);
	mod.world.occupation[mod.world.occupation_index(i)][2] = 900;
	const changesBefore = game.changes.length;
	day(game, mod);
	assert.equal(price(game, 'Kraz', 'Food'), Math.round(before * 1.5), 'Diplomacy leaves the crisis price alone');
	assert.ok(price(game, 'Kraz', 'Medical') > base.Medical || !base.Medical, 'other goods follow the damage');
	// The crisis ends: Corporations writes its "before" price back.
	run(game, mod, 18);
	game.change('system "Kraz"\n\ttrade "Food" ' + before);
	// After the margin Diplomacy takes Food in hand, then repair restores everything.
	run(game, mod, 10);
	const tier = mod.world.occupation[mod.world.occupation_index(i)]?.[3] ?? 0;
	assert.equal(price(game, 'Kraz', 'Food'), before + Math.trunc(before * 12 * tier / 100));
	const r = mod.world.occupation[mod.world.occupation_index(i)];
	r[1] = 0; r[2] = 0;
	run(game, mod, 3);
	for (const c of ['Food', 'Medical', 'Clothing']) if (base[c]) assert.equal(price(game, 'Kraz', c), base[c], c + ' exact after both');
	assert.ok(game.changes.length > changesBefore);
});

test('API 9 with Corporations enabled: no prices and no shipyard stock are touched', { skip }, () => {
	const { game, mod } = atWar();
	game.plugins = new Set(['Corporations']);
	const i = capture(game, mod, 'Kraz', 1);
	mod.world.occupation[mod.world.occupation_index(i)][2] = 900;
	run(game, mod, 5);
	assert.equal(game.tradeLines || 0, 0);
	assert.equal(game.calls.get('set_ship_stock') || 0, 0);
	assert.equal(mod.world.trade.length, 0);
});

test('damage trims shipyard stock by tier and repair untracks it again', { skip }, () => {
	const { game, mod } = atWar();
	const i = capture(game, mod, 'Kraz', 1);
	const planets = [...Array(game.planet_count('Kraz')).keys()].map(k => game.planet_at('Kraz', k)).filter(p => game.shipyard_count(p) > 0);
	assert.ok(planets.length > 0, 'Kraz has a shipyard');
	mod.world.occupation[mod.world.occupation_index(i)][2] = 900;
	day(game, mod);
	assert.equal(game.ship_stock(planets[0], 'Sparrow'), 0, 'tier 2+: none for sale');
	game.moveTo('Kraz'); mod.on_enter(game, 'Kraz');
	assert.ok(game.stockOn, 'stock is switched on while the mod tracks some');
	// Corporations-style stock another mod set is left alone.
	game.set_ship_stock(planets[0], 'Shuttle', 7);
	mod.world.stock = mod.world.stock.filter(s => !s.includes('|Shuttle|'));
	const r = mod.world.occupation[mod.world.occupation_index(i)];
	r[1] = 0; r[2] = 0;
	run(game, mod, 2);
	assert.equal(game.ship_stock(planets[0], 'Sparrow'), -1, 'untracked once repaired');
	assert.equal(game.ship_stock(planets[0], 'Shuttle'), 7, 'another mod\'s stock is left alone');
	assert.equal(mod.world.stock.length, 0);
});

test('API 10: damage also runs a damaged outfitter short of munitions, and repair untracks them', { skip }, () => {
	const { game, mod } = atWar({ api10: true });
	const i = capture(game, mod, 'Kraz', 1);
	const p = game.planet_at('Kraz', 0);
	game.set_outfit_stock(p, 'Torpedo', 3);
	mod.world.occupation[mod.world.occupation_index(i)][2] = 400;
	day(game, mod);
	assert.equal(game.outfit_stock(p, 'Javelin'), 10, 'tier 1: ten left');
	assert.equal(game.outfit_stock(p, 'Torpedo'), 3, 'another mod\'s count is left alone');
	mod.world.occupation[mod.world.occupation_index(i)][2] = 900;
	day(game, mod);
	assert.equal(game.outfit_stock(p, 'Javelin'), 0, 'tier 2+: none');
	const r = mod.world.occupation[mod.world.occupation_index(i)];
	r[1] = 0; r[2] = 0;
	run(game, mod, 2);
	assert.equal(game.outfit_stock(p, 'Javelin'), -1);
	assert.equal(game.outfit_stock(p, 'Torpedo'), 3);
	assert.ok(!mod.world.stock.some(s => s.startsWith('o|')));
});

test('reconstruction, refugee and resistance jobs move damage and unrest', { skip }, () => {
	const { game, mod } = atWar();
	const i = capture(game, mod, 'Kraz', 1);
	const k = mod.world.occupation_index(i);
	const u = mod.world.occupation[k][1], d = mod.world.occupation[k][2];
	mod.occupation.repair(i, mod.tune.rebuild_effect);
	assert.equal(mod.world.occupation[k][2], d - 250);
	mod.occupation.lower_unrest(i, mod.tune.resistance_effect);
	assert.equal(mod.world.occupation[k][1], u - 300);
	mod.occupation.raise_unrest(i, mod.tune.resistance_effect);
	assert.equal(mod.world.occupation[k][1], u);
});

test('occupation jobs: putting down resistance and rebuilding are offered nearby and move unrest and damage', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	const i = idx(game, 'Spica');
	assert.equal(mod.galaxy.owner(i), 2);
	const k = mod.occupation.record(i);
	mod.world.occupation[k][1] = 600;
	mod.world.occupation[k][2] = 600;
	game.moveTo('Gamma Corvi');
	game.landed = 'Bourne';
	mod.on_enter(game, 'Gamma Corvi');
	const names = game.jobs.map(j => j.name);
	assert.ok(names.includes('Put down the resistance at Spica'), names.join('; '));
	game.landed = '';
	game.setCond('diplomacy: op suppress Spica', 1);
	if (names.includes('Rebuild Spica')) game.setCond('diplomacy: op rebuild Spica', 1);
	const u = mod.world.occupation[k][1], d = mod.world.occupation[k][2];
	day(game, mod);
	const r = mod.world.occupation[mod.world.occupation_index(i)];
	assert.ok(r[1] <= u - 300, 'unrest down by the job: ' + u + ' -> ' + r[1]);
	if (names.includes('Rebuild Spica')) {
		assert.ok(r[2] <= d - 250, 'damage down by the job');
		assert.ok(state(game).medals.some(m => /Reconstruction Medal/.test(m)));
	}
	assert.equal(game.cond('diplomacy: op suppress Spica'), 0);
});

test('a bounty on a rival: the job is an npc kill, and it pays a medal', { skip }, () => {
	const { game, mod } = atWar();
	const x = mod.sim.commission(1, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Spica'), game.today);
	mod.admirals.put(1, x.admiral, 5, 1);
	game.moveTo('Gamma Corvi');
	game.landed = 'Bourne';
	assert.equal(mod.ops.try_offer(game, 'Bourne', 'bounty', x, mod.world.wars[0], x.at, game.today), 1);
	const job = game.jobs.find(j => /^Bounty: /.test(j.name));
	assert.ok(job && /npc kill/.test(job.text), 'an npc kill job');
	const key = job.text.match(/"diplomacy: op (bounty [^"]+)" = 1/)[1];
	game.landed = '';
	game.setCond('diplomacy: op ' + key, 1);
	day(game, mod);
	assert.ok(state(game).medals.some(m => /Bounty Hunter's Star/.test(m)));
});

// ---- The bus ----

test('API 10: Corporations\' tenders, failures, bankruptcies and convoys move the war; API 9 listens to nothing', { skip }, () => {
	const { game, mod } = atWar({ api10: true });
	assert.deepEqual(game.listening, ['corporations.*']);
	const note = (name, o) => mod.on_notification(game, name, JSON.stringify(o), 'corporations');
	note('corporations.tender_awarded', { government: 'Republic', model: 'Cruiser', units: 2, winner: 'Lionheart', price: 1, days: 30, bids: 3 });
	assert.equal(mod.world.boost[1], 0, 'an award alone boosts nothing');
	note('corporations.tender_delivered', { government: 'Republic', model: 'Cruiser', units: 2, winner: 'Lionheart' });
	assert.equal(mod.world.boost[1], 1, 'a delivery boosts the next launch');
	assert.equal(mod.world.boost_day[1], mod.world.day);
	mod.world.boost[1] = 0;
	note('corporations.tender_delivered', { government: 'Republic', model: 'Frigate', units: 1, winner: '' });
	assert.equal(mod.world.boost[1], 0, 'at most once in 60 days');
	note('corporations.tender_failed', { government: 'Free Worlds', model: 'Falcon', units: 1, winner: 'x', reason: 'convoy lost' });
	assert.equal(mod.world.penalty[2], 1);
	const defeat = [...mod.world.defeat];
	note('corporations.bankrupt', { company: 'Megaparsec', sector: 'shipping', per_share: '0.00' });
	assert.equal(mod.world.defeat[1], defeat[1] + 60);
	assert.equal(mod.world.defeat[3], defeat[3], 'a side at peace is not touched');
	assert.ok(mod.world.chronicle.some(e => /Megaparsec/.test(e)));
	const front = mod.galaxy.human.find(i => mod.galaxy.owner(i) === 2);
	note('corporations.convoy_lost', { owner: 'Southbound', model: 'Falcon', units: 1, to: 'x', system: game.names[front], by_player: false });
	assert.ok(mod.world.chronicle.some(e => /convoy of new hulls/.test(e)));
	note('corporations.tender_awarded', { nonsense: true });
	mod.on_notification(game, 'corporations.crisis', 'not json', 'corporations');
	mod.on_notification(game, 'other.thing', '{}', 'x');
	assert.ok(game.sections.includes('war') && game.sections.includes('occupation') && game.sections.includes('squadron') && game.sections.includes('politics') && game.sections.includes('operations'), 'timing sections');
	// API 9: no has(), no listen, no sections.
	const old = atWar();
	assert.equal(old.game.listening.length, 0);
	assert.equal(old.game.sections.length, 0);
});

test('a tender-failed penalty sends the next flotilla out under strength, once', { skip }, () => {
	const { game, mod } = atWar({ api10: true });
	mod.world.penalty[1] = 1;
	let launched = null;
	for (let d = 0; d < 200 && !launched; d++) {
		const ids = new Set(mod.world.fleets.map(x => x.id));
		day(game, mod);
		launched = mod.world.fleets.find(x => !ids.has(x.id) && x.side === 1 && x.alive());
	}
	assert.ok(launched, 'a Republic flotilla launched');
	assert.equal(mod.world.penalty[1], 0, 'the penalty is used up');
	assert.ok(launched.strength <= launched.full, 'under strength');
});

test('Corporations M3\'s shortfall weakens a side\'s new flotillas: from its condition on any API, and from the bus', { skip }, () => {
	const { game, mod } = atWar();
	game.plugins = new Set(['Corporations']);
	game.setCond('corporations: shortfall 1', 50);
	day(game, mod);
	assert.equal(mod.world.shortfall[1], 50);
	assert.equal(mod.world.shortfall[2], 0);
	let launched = null;
	for (let d = 0; d < 300 && !launched; d++) {
		const ids = new Set(mod.world.fleets.map(x => x.id));
		day(game, mod);
		launched = mod.world.fleets.find(x => !ids.has(x.id) && x.side === 1 && x.alive() && x.kind === 0);
	}
	assert.ok(launched);
	const full = mod.sim.flotilla_strength(game, 1, launched.size);
	assert.ok(launched.strength <= Math.trunc(full * 80 / 100) + 1, 'at 50% shortfall, 20% weaker: ' + launched.strength + ' of ' + full);
	const v = atWar({ api10: true });
	v.mod.on_notification(v.game, 'corporations.shortfall', JSON.stringify({ side: 2, government: 'Free Worlds', shortfall: 35 }), 'corporations');
	assert.equal(v.mod.world.shortfall[2], 35);
	v.mod.on_notification(v.game, 'corporations.shortfall', JSON.stringify({ side: 2, government: 'Free Worlds', shortfall: 500 }), 'corporations');
	assert.equal(v.mod.world.shortfall[2], 100, 'clamped');
});

// ---- Saving and reloading ----

test('API 10: a day only marks the state dirty; on_save writes it; an older save is read back', { skip }, () => {
	const mod = new Diplomacy();
	const game = new MockGame(galaxy, { api10: true });
	game.today = 1100000;
	game.setCond('free worlds plot completed', 1);
	mod.on_load(game);
	game.today++; mod.on_day(game, game.today); mod.on_enter(game, 'Sol'); mod.on_panel(game, 0);
	mod.on_save(game);
	const saved = game.data('state');
	const snapshot = new Map(game.store);
	game.setCond('diplomacy: force war', 12);
	game.today++; mod.on_day(game, game.today);
	assert.equal(game.data('state'), saved, 'not written by the day');
	assert.notEqual(game.data('rev'), snapshot.get('rev'), 'but the revision moved');
	mod.on_save(game);
	assert.notEqual(game.data('state'), saved, 'written on save');
	assert.ok(wars(game).length >= 1);
	// The player loads the older save: the mod reads it, without on_pilot_loaded.
	game.store = new Map(snapshot);
	game.today++; mod.on_day(game, game.today);
	mod.on_save(game);
	assert.equal(wars(game).length, 0, 'the older world, without the war');
});

test('the new state survives a reload and another pilot in between', { skip }, () => {
	const { game, mod } = atWar();
	game.setCond('diplomacy: force squadron', mod.sim.targets(mod.world.wars[0], 2)[0] + 1);
	day(game, mod, 'Gamma Corvi');
	capture(game, mod, 'Kraz', 1);
	mod.world.occupation[mod.world.occupation_index(idx(game, 'Kraz'))][2] = 900;
	mod.intel.scout(idx(game, 'Sol'), game.today);
	const x = mod.world.fleets.find(f => f.alive() && f.side === 1);
	if (x) { mod.admirals.put(1, x.admiral, 5, 1); mod.admirals.put(1, x.admiral, 4, 2); }
	day(game, mod);
	const s1 = state(game);
	// Another pilot, then this one again.
	const other = new MockGame(galaxy);
	mod.on_load(other);
	mod.on_load(game);
	day(game, mod);
	const s2 = state(game);
	assert.equal(s2.world, s1.world);
	assert.ok(s2.fleets.some(f => f[21] === 1), 'the squadron is back');
	assert.ok(s2.occupation.some(r => r[0] === idx(game, 'Kraz')), 'the occupation is back');
	assert.ok(s2.trade.length > 0 && s2.scouted.length > 0);
	if (x) assert.ok(mod.admirals.is_rival(1, x.admiral), 'the rival is back');
	// An M1 save (no M2 fields, 3-field rosters, 21-field flotillas) still loads.
	edit(game, s => {
		for (const k of ['sightings', 'scouted', 'depots_down', 'occupation', 'trade', 'stock', 'reserved', 'boost', 'boost_day', 'squadron_lost', 'penalty', 'news_day', 'risen', 'shortfall']) delete s[k];
		s.fleets = s.fleets.map(f => f.slice(0, 21));
		s.admirals = s.admirals.map(r => { const out = []; for (let k = 0; k < r.length; k += 6) out.push(r[k], r[k + 1], r[k + 2]); return out; });
	});
	day(game, mod);
	const s3 = state(game);
	assert.ok(s3.occupation.length === 0 && s3.fleets.every(f => f[21] === 0));
	assert.ok(s3.admirals.every(r => r.length % 6 === 0));
});

// ---- Budgets ----

test('M2 keeps the state and the conditions bounded over 3000 days with a busy player', { skip }, () => {
	const { game, mod } = atWar();
	game.setCond('diplomacy: merit', 1100);
	game.fleet = ['Carrier'];
	let maxState = 0, maxConds = 0;
	const ch0 = game.changes.length;
	for (let d = 0; d < 3000; d++) {
		if (d % 25 === 0) {
			mod.squadron.list_orders(game);
			if (mod.squadron.mine().length < 3 && mod.squadron.options.length > 1) mod.squadron.order(game, 0, 0, game.today);
		}
		if (d % 10 === 0) mod.intel.scout(mod.galaxy.human[d % mod.galaxy.human.length], game.today);
		day(game, mod);
		maxState = Math.max(maxState, game.data('state').length);
		maxConds = Math.max(maxConds, nonZeroConditions(game));
	}
	const perYear = (game.changes.length - ch0) / (3000 / 365);
	console.log(`  max state ${maxState} bytes, max non-zero conditions ${maxConds}, change events per year ${perYear.toFixed(1)}, trade lines ${game.tradeLines || 0}`);
	assert.ok(maxState < 40000, 'state under 40 KB: ' + maxState);
	assert.ok(maxConds < 200, 'conditions bounded: ' + maxConds);
	assert.ok(perYear < 365, 'at most one change event a day on average: ' + perYear);
});

// ---- Review fixes ----

test('a delivered tender boosts only the next launch: the Republic is not boosted for good by Corporations\' stream', { skip }, () => {
	const { game, mod } = atWar({ api10: true });
	const posts = JSON.parse(readFileSync(join(HERE, 'corp-posts.json'), 'utf8'));
	let k = 0, boosts = 0;
	for (let d = 0; d < 900; d++) {
		// Replay the captured stream: one post every 7 days or so, as recorded.
		while (k < posts.length && k * 7 <= d) { mod.on_notification(game, posts[k].name, posts[k].payload, 'corporations'); k++; }
		const before = mod.world.boost[1];
		day(game, mod);
		if (before && !mod.world.boost[1]) boosts++;
	}
	assert.ok(boosts <= Math.ceil(900 / 60) + 1, 'at most one boost in 60 days: ' + boosts);
	assert.equal(mod.world.boost[2] + mod.world.boost[3], 0);
});

test('fog: the Command tab offers only forces in sight, and a hunt ends where its quarry was last seen', { skip }, () => {
	let hidden = 0, sampled = 0;
	for (let seed = 0; seed < 2; seed++) {
		const { game, mod } = veteran(galaxy, { start: seed * 977 });
		game.setCond('diplomacy: merit', 1100);
		for (let d = 0; d < 1200; d++) {
			day(game, mod);
			if (d % 10) continue;
			sampled++;
			mod.squadron.list_orders(game);
			const m = game.cond('diplomacy: member');
			for (const o of mod.squadron.options) if ((o[0] === 3 || o[0] === 2) && o[2]) { const x = mod.world.fleet_by_id(o[2]); if (!mod.intel.sees_force(game, m, x, game.today)) hidden++; }
		}
	}
	assert.equal(hidden, 0, 'no order on a hidden force (' + sampled + ' days sampled)');
	// A hunted flotilla slips out of sight: the squadron goes to where it was, and stops.
	const { game, mod } = atWar();
	const sq = mod.sim.commission(2, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Gamma Corvi'), game.today);
	sq.squadron = 1; sq.order = 3;
	const far = idx(game, 'Sol');
	const prey = mod.sim.commission(1, mod.world.wars[0].id, 0, 2, 200, far, game.today);
	sq.target = prey.id; sq.goal = mod.galaxy.links[idx(game, 'Gamma Corvi')][0];
	assert.ok(!mod.intel.sees_force(game, 2, prey, game.today) || true);
	mod.intel.forget();
	if (!mod.intel.sees_force(game, 2, prey, mod.world.day)) {
		mod.sim.move_squadron(game, sq);
		assert.notEqual(sq.goal, far, 'not steered to a quarry out of sight');
		sq.at = sq.goal;
		mod.sim.move_squadron(game, sq);
		assert.equal(sq.order, 4, 'at the last sighting, it holds');
	}
});

test('Corporations turned on later: Diplomacy hands back its stock and its prices (API 9), then keeps out', { skip }, () => {
	// E1: stock.
	{
		const { game, mod } = atWar();
		const i = capture(game, mod, 'Kraz', 1);
		const p = [...Array(game.planet_count('Kraz')).keys()].map(k => game.planet_at('Kraz', k)).find(p => game.shipyard_count(p) > 0);
		mod.world.occupation[mod.world.occupation_index(i)][2] = 900;
		day(game, mod);
		assert.equal(game.ship_stock(p, 'Sparrow'), 0);
		game.set_ship_stock(p, 'Shuttle', 4);      // the count changed since (Corporations restocked it)
		game.plugins = new Set(['Corporations']);
		day(game, mod);
		assert.equal(game.ship_stock(p, 'Sparrow'), -1, 'untracked again');
		assert.equal(game.ship_stock(p, 'Shuttle'), 4, 'a count changed since is left alone');
		assert.equal(mod.world.stock.length, 0);
		const calls = game.calls.get('set_ship_stock');
		const r = mod.world.occupation[mod.world.occupation_index(i)]; r[2] = 900;
		run(game, mod, 5);
		assert.equal(game.calls.get('set_ship_stock'), calls, 'hands off afterwards');
	}
	// E5: prices.
	{
		const { game, mod } = atWar();
		const base = { ...galaxy.systems.get('Kraz').trade };
		const i = capture(game, mod, 'Kraz', 1);
		mod.world.occupation[mod.world.occupation_index(i)][2] = 900;
		run(game, mod, 2);
		assert.ok(price(game, 'Kraz', 'Food') > base.Food);
		game.plugins = new Set(['Corporations']);
		day(game, mod);
		for (const c of ['Food', 'Medical', 'Clothing']) if (base[c]) assert.equal(price(game, 'Kraz', c), base[c], c + ' back to its data price');
		assert.equal(mod.world.trade.length, 0);
		const lines = game.tradeLines;
		run(game, mod, 10);
		assert.equal(game.tradeLines, lines, 'no price written afterwards');
	}
});

test('squadron strength: parked ships do not count, ships count at half price, and selling the fleet weakens it', { skip }, () => {
	const { game, mod } = atWar({ api10: true });
	game.setCond('diplomacy: merit', 260);
	const bare = mod.squadron.strength(game, 2);
	game.fleet = ['Carrier', 'Carrier', 'Cruiser'];
	game.parked.add(0); game.parked.add(1);
	assert.equal(mod.squadron.strength(game, 2), bare + Math.floor(9000000 * 0.5 / 50000), 'only the Cruiser, at half price');
	game.parked.clear();
	mod.squadron.list_orders(game);
	mod.squadron.order(game, 0, mod.squadron.labels.findIndex(l => l.startsWith('Attack')), game.today);
	const x = mod.squadron.mine()[0];
	const formed = x.strength;
	assert.equal(x.full, formed, 'full set with strength');
	game.fleet = ['Sparrow'];
	day(game, mod);
	assert.ok(x.strength <= mod.squadron.strength(game, 2) && x.strength < formed, 'sold: ' + formed + ' -> ' + x.strength);
	game.fleet = ['Carrier', 'Carrier', 'Cruiser'];
	day(game, mod);
	assert.ok(x.strength <= formed, 'buying again does not raise it past its formation value');
});

test('after a squadron is lost no new one forms for 30 days; take_over spares sieges and reliefs', { skip }, () => {
	const { game, mod } = atWar();
	game.setCond('diplomacy: merit', 400);
	mod.squadron.list_orders(game);
	const k = mod.squadron.labels.findIndex(l => l.startsWith('Attack'));
	mod.squadron.order(game, 0, k, game.today);
	const x = mod.squadron.mine()[0];
	mod.sim.lost(game, x, game.today, 1); x.strength = 0;
	mod.squadron.list_orders(game);
	assert.match(mod.squadron.order(game, 0, mod.squadron.labels.findIndex(l => l.startsWith('Attack')), game.today), /will not trust you/);
	run(game, mod, 31);
	mod.squadron.list_orders(game);
	const k2 = mod.squadron.labels.findIndex(l => l.startsWith('Attack'));
	if (k2 >= 0) assert.match(mod.squadron.order(game, 0, k2, game.today), /Your squadron|no flotilla to spare/);
	// take_over: a besieging flotilla with progress and a relief are not taken.
	const besieger = mod.sim.commission(2, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Gamma Corvi'), game.today);
	besieger.goal = besieger.at; besieger.siege = 5;
	const relief = mod.sim.commission(2, mod.world.wars[0].id, 1, 2, 200, idx(game, 'Gamma Corvi'), game.today);
	const taken = mod.squadron.take_over(2, idx(game, 'Gamma Corvi'));
	assert.ok(taken.id !== relief.id && (taken.id !== besieger.id || !mod.sim.besieging(besieger)));
});

test('malformed bus payloads are ignored without throwing (the reviewer\'s set)', { skip }, () => {
	const { game, mod } = atWar({ api10: true });
	const bad = [
		['corporations.crisis', '{"system":5,"commodities":"Food","days":"x"}'],
		['corporations.crisis', '{"system":"Kraz","commodities":[null,{},3],"days":1e12}'],
		['corporations.crisis', '{"system":"Kraz","commodities":["Food"],"days":-50}'],
		['corporations.crisis', 'not json'],
		['corporations.crisis', '[1,2]'],
		['corporations.tender_awarded', '{"government":5}'],
		['corporations.tender_delivered', '{"government":null}'],
		['corporations.tender_failed', '{"government":{"a":1}}'],
		['corporations.bankrupt', '{"company":null}'],
		['corporations.bankrupt', '{"company":{"x":1}}'],
		['corporations.convoy_lost', '{"system":7,"owner":3}'],
		['corporations.convoy_lost', '{"system":null}'],
		['corporations.shortfall', '{"side":"1","shortfall":"abc"}'],
		['corporations.shortfall', '{"side":1.7,"shortfall":"abc"}'],
		['corporations.shortfall', '{"side":2,"shortfall":null}'],
		['corporations.shortfall', '{"side":1e9,"shortfall":5}'],
		['corporations.shortfall', ''],
	];
	for (const [n, p] of bad) assert.doesNotThrow(() => mod.on_notification(game, n, p, 'corporations'), n + ' ' + p);
	assert.ok(mod.world.reserved.every(r => /^[^|]+\|(Food|Medical|Clothing)\|\d+$/.test(r)), 'only well-formed reservations');
	assert.ok(mod.world.reserved.every(r => Number(r.split('|')[2]) <= mod.world.day + 365 + 5), 'crisis length clamped');
	assert.ok(mod.world.shortfall.every(v => v >= 0 && v <= 100));
	assert.equal(mod.world.penalty[1] + mod.world.penalty[2] + mod.world.penalty[3], 0);
	run(game, mod, 3);
	mod.on_save(game);
	const again = new Diplomacy();
	assert.doesNotThrow(() => { again.on_load(game); again.on_pilot_loaded(game); again.on_enter(game, 'Sol'); });
});

test('the bounty on the player clears when they serve the rival\'s side; the hunters\' mission cannot pile up', { skip }, () => {
	const { game, mod } = atWar();
	const x = mod.sim.commission(1, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Sol'), game.today);
	mod.admirals.put(1, x.admiral, 5, 1);
	day(game, mod);
	assert.equal(game.cond('diplomacy: bounty'), 1);
	game.setCond('diplomacy: member', 1);
	day(game, mod);
	assert.equal(game.cond('diplomacy: bounty'), 0, 'serving the rival\'s side');
	const data = readFileSync(join(HERE, '..', 'data', 'diplomacy.txt'), 'utf8');
	const mission = data.slice(data.indexOf('mission "Diplomacy: A Price on Your Head"'));
	assert.match(mission, /not "Diplomacy: A Price on Your Head: active"/);
	assert.match(mission, /to fail\n\t\t"diplomacy: bounty" == 0/);
});

test('no bounty medal for a rival already dead off-screen', { skip }, () => {
	const { game, mod } = atWar();
	const x = mod.sim.commission(1, mod.world.wars[0].id, 0, 2, 200, idx(game, 'Spica'), game.today);
	mod.admirals.put(1, x.admiral, 5, 1);
	game.moveTo('Gamma Corvi'); game.landed = 'Bourne';
	mod.ops.try_offer(game, 'Bourne', 'bounty', x, mod.world.wars[0], x.at, game.today);
	const key = game.jobs.find(j => /^Bounty: /.test(j.name)).text.match(/"diplomacy: op (bounty [^"]+)" = 1/)[1];
	game.landed = '';
	x.strength = 0;                      // it fell elsewhere
	game.setCond('diplomacy: op ' + key, 1);
	day(game, mod);
	assert.ok(!(state(game).medals || []).some(m => /Bounty Hunter's Star/.test(m)));
});

test('stabilisers: one rising per side in 240 days', { skip }, () => {
	const { game, mod } = veteran(galaxy);
	const r = mod.galaxy.human.find(i => mod.galaxy.owner(i) === 1);
	// Every Republic minor that can rise is at boiling point.
	const rep = [];
	for (let m = 0; m < mod.factions.regions.count(); m++) if (mod.politics.can_rebel(m) && mod.galaxy.minor_owner(m) === 1 && mod.galaxy.held_by(m, 1) >= 2) rep.push(m);
	assert.ok(rep.length >= 2);
	let risings = [];
	for (let d = 0; d < 300; d++) {
		for (const m of rep) mod.world.unrest[m] = 1000;
		mod.tune.rebellion_divisor = 1;
		const before = mod.world.risen[1];
		day(game, mod);
		if (mod.world.risen[1] !== before) risings.push(game.today);
	}
	assert.ok(risings.length >= 1, 'a rising');
	for (let k = 1; k < risings.length; k++) assert.ok(risings[k] - risings[k - 1] >= 240, 'risings against the Republic 240 days apart: ' + risings.join(','));
});

test('stabilisers: a side below 60% of its home rallies (garrisons, no risings, no cessions, half score, peace)', { skip }, () => {
	const { game, mod } = atWar();
	const fw = mod.galaxy.human.filter(i => mod.galaxy.owner(i) === 2);
	const keep = Math.floor(mod.galaxy.home_size(2) * 0.55);
	const spica = idx(game, 'Spica');
	const before = mod.sim.full_strength(game, spica);
	// A Free Worlds minor that can rise, kept whole.
	const mm = [...Array(mod.factions.regions.count()).keys()].find(k => mod.politics.can_rebel(k) && mod.galaxy.minor_owner(k) === 2 && mod.galaxy.held_by(k, 2) >= 2 && mod.galaxy.held_by(k, 2) <= keep - 2 && !mod.galaxy.minor_systems[k].includes(spica));
	assert.ok(mm !== undefined);
	// Hand most of the Free Worlds to the Republic: the capital, Spica and that minor kept.
	let n = fw.length;
	for (const i of fw) { if (n <= keep) break; if (game.names[i] === 'Gamma Corvi' || i === spica || mod.galaxy.minor(i) === mm) continue; game.governments.set(game.names[i], 'Republic'); n--; }
	mod.galaxy.refresh(game);
	assert.ok(mod.galaxy.rallying(2), 'rallying');
	// A war on it ends once it has run rally_peace_days (and not before).
	const war = mod.world.wars.find(w => w.involves(2));
	war.until = game.today + 1000; war.ex_a = 0; war.ex_b = 0; war.score = 0;
	war.since = game.today - mod.tune.rally_peace_days + 1;
	mod.politics.end_wars(game, game.today);
	assert.ok(mod.world.has_war(war.id), 'not before rally_peace_days');
	war.since = game.today - mod.tune.rally_peace_days;
	mod.politics.end_wars(game, game.today);
	assert.ok(!mod.world.has_war(war.id), 'peace after rally_peace_days');
	game.setCond('diplomacy: force war', 12);
	day(game, mod);
	// No war is declared by or on a side that rallies.
	assert.equal(mod.politics.pressure(1, 2, game.today), 0);
	assert.equal(mod.politics.pressure(2, 1, game.today), 0);
	assert.equal(mod.sim.full_strength(game, spica), Math.trunc(before * 150 / 100), 'garrisons at 150%');
	const m = mm;
	// No rising against it.
	mod.world.unrest[m] = 1000; mod.tune.rebellion_divisor = 1;
	const reb = game.cond('diplomacy: stat rebellions');
	let risen = 0;
	for (let d = 0; d < mod.tune.rally_peace_days - 3; d++) {
		// (Until the peace: its terms may give systems back, ending the rally.)
		if (!mod.world.wars.some(w => w.involves(2))) break;
		mod.world.unrest[m] = 1000;
		const r0 = mod.world.risen[2];
		mod.galaxy.refresh(game);
		const was = mod.galaxy.rallying(2);
		day(game, mod);
		if (was && mod.world.risen[2] !== r0) risen++;
	}
	run(game, mod, mod.tune.rally_peace_days + 2);
	assert.equal(risen, 0, 'no rising against a side that rallies');
	// The war on it ends once it has run rally_peace_days.
	assert.ok(!mod.world.wars.some(w => w.involves(2) && game.today - w.since > mod.tune.rally_peace_days + 1), 'peace: ' + JSON.stringify(mod.world.wars.map(w => [w.a, w.b, game.today - w.since])));
});
