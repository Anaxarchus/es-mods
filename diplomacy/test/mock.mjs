// A mock of the game the Dado loader hands a mod: every method of es.Game
// (imports/sdk/es/game.dado) over the galaxy from galaxy.mjs. Values crossing
// into the mod are plain JS numbers, strings and booleans, as the built
// mod's runtime expects (it keeps ints as JS numbers within 2^53).

import { tokens } from './galaxy.mjs';

// Real stats from the game (game.fleet_stat with the base data), so the
// simulation test sees the factions' real difference in ship quality.
export const REAL_STATS = {
 "Small Republic": {
  "ships": 1.64,
  "hull": 2312,
  "shields": 8024,
  "dps": 2585.6,
  "speed": 7.82,
  "cost": 5946760
 },
 "Large Republic": {
  "ships": 7.69,
  "hull": 11956.25,
  "shields": 29537.5,
  "dps": 7929.88,
  "speed": 13.44,
  "cost": 27289312.5
 },
 "Small Free Worlds": {
  "ships": 2.07,
  "hull": 824.14,
  "shields": 3989.66,
  "dps": 828.58,
  "speed": 18.16,
  "cost": 1789079.31
 },
 "Large Free Worlds": {
  "ships": 2.3,
  "hull": 4981.63,
  "shields": 12320.41,
  "dps": 2800.9,
  "speed": 9.38,
  "cost": 12428384.69
 },
 "Small Syndicate": {
  "ships": 2.45,
  "hull": 2336.36,
  "shields": 8490.91,
  "dps": 2411.91,
  "speed": 10.77,
  "cost": 5503854.55
 },
 "Large Syndicate": {
  "ships": 2.86,
  "hull": 5600,
  "shields": 13611.11,
  "dps": 3829.91,
  "speed": 8.62,
  "cost": 12330377.78
 },
 "Small Core Pirates": {
  "ships": 1.07,
  "hull": 625.58,
  "shields": 2219.77,
  "dps": 568.89,
  "speed": 16.13,
  "cost": 1170220.93
 },
 "Large Core Pirates": {
  "ships": 2.02,
  "hull": 3429.31,
  "shields": 9024.14,
  "dps": 2625.58,
  "speed": 8.75,
  "cost": 7748131.03
 },
 "Small Northern Pirates": {
  "ships": 1.22,
  "hull": 751.43,
  "shields": 3059.18,
  "dps": 728.34,
  "speed": 15.14,
  "cost": 2259048.98
 },
 "Large Northern Pirates": {
  "ships": 2.35,
  "hull": 4907.52,
  "shields": 12188.72,
  "dps": 3409.55,
  "speed": 11.44,
  "cost": 13437558.65
 },
 "Small Southern Pirates": {
  "ships": 1.42,
  "hull": 634.52,
  "shields": 2381.45,
  "dps": 563.27,
  "speed": 16.4,
  "cost": 1076645.16
 },
 "Large Southern Pirates": {
  "ships": 1.69,
  "hull": 2592,
  "shields": 6478.67,
  "dps": 1658.61,
  "speed": 10.05,
  "cost": 5355461.33
 }
};

// Plausible fleet values (credits) by fleet name.
export function fleetValue(name) {
	if (name in REAL_STATS) return REAL_STATS[name].cost;
	const table = {
		'Small Republic': 5e6, 'Large Republic': 22e6, 'Republic Logistics': 9e6,
		'Small Free Worlds': 4e6, 'Large Free Worlds': 18e6,
		'Small Syndicate': 5e6, 'Large Syndicate': 24e6,
		'Small Militia': 1.5e6, 'Large Militia': 4e6,
	};
	if (name in table) return table[name];
	if (name.startsWith('Large')) return 15e6;
	if (name.startsWith('Small')) return 3e6;
	return 3e6;
}

function shipsIn(fleet) {
	if (fleet.startsWith('Large')) return 4;
	if (fleet.startsWith('Small')) return 2;
	return 3;
}

export class MockGame {
	constructor(galaxy) {
		this.galaxy = galaxy;
		this.names = [...galaxy.systems.keys()].sort();
		this.governments = new Map();
		for (const [n, s] of galaxy.systems) this.governments.set(n, s.government);
		this.conditions = new Map();
		this.attitudes = new Map();      // "a|b" -> value
		this.reputations = new Map();
		this.today = 1100000;
		this.where = 'Sol';
		this.flying = true;
		this.steps = 0;
		this.ships = [];                 // { tag, government, fleet, strength, alive, player }
		this.pending = [];               // spawned this step: visible from the next
		this.kills = [];                 // tags of ships the player destroyed, in order
		this.killMarks = new Map();      // prefix -> index into kills already reported
		this.messages = [];
		this.logs = [];
		this.changes = [];               // { day, text, war: [a, b] }
		this.map = { markers: [], lines: [], details: [], clears: 0 };
		this.button = null;
		this.buttonCalls = 0;
		this.panel = null;
		this.calls = new Map();
		this.spawned = { flotilla: 0, garrison: 0 };
	}

	count(name) { this.calls.set(name, (this.calls.get(name) || 0) + 1); }

	// ---- test helpers ----
	cond(name) { return this.conditions.get(name) || 0; }
	setCond(name, v) { this.conditions.set(name, v); }
	// Move the player to another system: the ships of the old one are gone.
	moveTo(system) { this.where = system; this.ships = []; this.pending = []; }
	// One engine step: ships spawned last step become visible.
	tick() { this.steps++; this.ships.push(...this.pending); this.pending = []; }
	// The player destroys one ship of a tag group.
	playerKill(tag) {
		const s = this.ships.find(x => x.alive && x.tag === tag);
		if (!s) return false;
		s.alive = false;
		this.kills.push(tag);
		return true;
	}
	// A ship is destroyed by someone else.
	otherKill(tag) {
		const s = this.ships.find(x => x.alive && x.tag === tag);
		if (!s) return false;
		s.alive = false;
		return true;
	}

	// ---- API 1 ----
	log(text) { this.logs.push(text); }
	message(text) { this.messages.push({ day: this.today, text }); }
	step() { return this.steps; }
	system() { return this.where; }
	ship_count() { return this.ships.length; }
	flagship() { return -1; }
	ship(i) { return Number.isInteger(i) && i >= 0 && i < this.ships.length ? this.ships[i] : null; }
	ship_name(i) { return this.ship(i) ? 'Ship ' + i : ''; }
	ship_model(i) { return this.ship(i) ? this.ship(i).fleet : ''; }
	is_player(i) { return this.ship(i) ? this.ship(i).player : false; }
	is_disabled(i) { return this.ship(i) ? !this.ship(i).alive : false; }
	hull(i) { return this.ship(i) ? 1000.0 : 0.0; }
	max_hull(i) { return this.ship(i) ? 1000.0 : 0.0; }
	shields(i) { return this.ship(i) ? 500.0 : 0.0; }
	max_shields(i) { return this.ship(i) ? 500.0 : 0.0; }
	energy(i) { return this.ship(i) ? 1.0 : 0.0; }
	fuel(i) { return this.ship(i) ? 1.0 : 0.0; }
	set_hull(i, v) {}
	set_shields(i, v) {}
	condition(name) { this.count('condition'); return this.cond(name); }
	set_condition(name, v) {
		if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error('condition ' + name + ' set to non-int ' + v);
		this.conditions.set(name, v);
	}

	// ---- API 2 ----
	day() { return this.today; }
	here() { return this.where; }
	system_count() { return this.names.length; }
	system_at(i) { return i >= 0 && i < this.names.length ? this.names[i] : ''; }
	system_government(s) { this.count('system_government'); return this.governments.get(s) || ''; }
	sys(s) { return this.galaxy.systems.get(s); }
	link_count(s) { return this.sys(s) ? this.sys(s).links.length : 0; }
	link(s, k) { const x = this.sys(s); return x && k >= 0 && k < x.links.length ? x.links[k] : ''; }
	inhabited(s) {
		const x = this.sys(s);
		if (!x) return false;
		return x.planets.some(p => { const q = this.galaxy.planets.get(p); return q && q.inhabited && !q.uninhabited; });
	}
	defenses(s) {
		const x = this.sys(s);
		if (!x) return [];
		const out = [];
		for (const p of x.planets) { const q = this.galaxy.planets.get(p); if (q) out.push(...q.defense); }
		return out;
	}
	defense_count(s) { return this.defenses(s).length; }
	defense_fleet(s, k) { const d = this.defenses(s); return k >= 0 && k < d.length ? d[k] : ''; }

	// Parse an event body: `system "X"` / `government "Y"`, and
	// `government "A"` / `"attitude toward"` / `"B" value`.
	change(text) {
		this.count('change');
		const lines = text.split('\n').map(l => {
			let d = 0; while (d < l.length && l[d] === '\t') d++;
			return { depth: d, t: tokens(l) };
		}).filter(l => l.t.length > 0);
		let applied = false;
		let top = null, sub = null;
		for (const l of lines) {
			if (l.depth === 0 && l.t[0] === 'visit') {
				if (!this.governments.has(l.t[1])) throw new Error('change: visit of unknown system ' + l.t[1]);
				this.visited = this.visited || new Set();
				this.visited.add(l.t[1]);
				applied = true;
				top = null;
				continue;
			}
			if (l.depth === 0) { top = l.t; sub = null; continue; }
			if (!top) throw new Error('change: no top-level node in ' + JSON.stringify(text));
			if (top[0] === 'system' && l.depth === 1 && l.t[0] === 'government') {
				if (!this.governments.has(top[1])) throw new Error('change: unknown system ' + top[1]);
				this.governments.set(top[1], l.t[1]);
				applied = true;
			} else if (top[0] === 'government' && l.depth === 1 && l.t[0] === 'attitude toward') {
				sub = 'attitude';
			} else if (top[0] === 'government' && l.depth === 2 && sub === 'attitude') {
				const v = parseFloat(l.t[1]);
				if (Number.isNaN(v)) throw new Error('change: bad attitude ' + JSON.stringify(text));
				this.attitudes.set(top[1] + '|' + l.t[0], v);
				applied = true;
			} else {
				throw new Error('change: unexpected ' + JSON.stringify(text));
			}
		}
		this.changes.push({ day: this.today, text, war: [this.cond('diplomacy: war a'), this.cond('diplomacy: war b')] });
		return applied;
	}
	attitude(a, b) { return this.attitudes.get(a + '|' + b) || 0.0; }
	reputation(g) { return this.reputations.has(g) ? this.reputations.get(g) : 1.0; }
	set_reputation(g, v) {
		if (typeof v !== 'number') throw new Error('reputation not a number');
		this.reputations.set(g, v);
	}
	// Installed and enabled plugins; the test may add "Diplomacy Debug".
	plugin_enabled(n) { return !!(this.plugins && this.plugins.has(n)); }
	fleet_strength(f) { return fleetValue(f); }
	// ---- API 3 ----
	// Plausible stats from the fleet's value: hull and shields scale with it, the
	// Syndicate hits a little harder, the Free Worlds and pirates are faster.
	fleet_stat(f, stat) {
		this.count('fleet_stat');
		if (f in REAL_STATS) return REAL_STATS[f][stat] ?? 0;
		const v = fleetValue(f) / 1000;
		const dpsMult = f.includes('Syndicate') ? 1.25 : f.includes('Pirate') ? 0.9 : 1.0;
		const speed = f.includes('Free Worlds') ? 6 : f.includes('Pirate') ? 6.5 : f.includes('Syndicate') ? 4.5 : 5;
		switch (stat) {
			case 'ships': return shipsIn(f);
			case 'hull': return 0.6 * v;
			case 'shields': return 0.4 * v;
			case 'dps': return 0.05 * v * dpsMult;
			case 'speed': return speed;
			case 'cost': return fleetValue(f);
			default: return 0;
		}
	}
	system_fleet_count(s) { const x = this.sys(s); return x ? x.fleets.length : 0; }
	system_fleet(s, k) { const x = this.sys(s); return x && k >= 0 && k < x.fleets.length ? x.fleets[k] : ''; }
	spawn(fleet, government, tag, arrive) {
		this.count('spawn');
		if (!this.flying) return 0;
		this.spawned[tag.includes(':g') ? 'garrison' : 'flotilla']++;
		const n = shipsIn(fleet);
		const each = fleetValue(fleet) / n;
		for (let k = 0; k < n; k++)
			this.pending.push({ tag, government, fleet, strength: each, alive: true, player: false });
		return n;
	}
	ship_tag(i) { return this.ship(i) ? this.ship(i).tag : ''; }
	ship_government(i) { return this.ship(i) ? this.ship(i).government : ''; }
	ship_strength(i) { return this.ship(i) ? this.ship(i).strength : 0.0; }
	tag_strength(tag) {
		let sum = 0.0;
		for (const s of this.ships) if (s.alive && s.tag === tag) sum += s.strength;
		return sum;
	}
	player_kills(prefix) {
		const from = this.killMarks.get(prefix) || 0;
		let n = 0;
		for (let k = from; k < this.kills.length; k++) if (this.kills[k].startsWith(prefix)) n++;
		this.killMarks.set(prefix, this.kills.length);
		return n;
	}
	map_clear() { this.map = { markers: [], lines: [], details: [], clears: this.map.clears + 1 }; }
	map_line(from, to, r, g, b) { this.map.lines.push({ from, to, r, g, b }); }
	map_marker(system, r, g, b, label) { this.map.markers.push({ system, r, g, b, label }); }
	// ---- API 4 ----
	map_detail(system, title, text, r, g, b) { if (this.sys(system)) this.map.details.push({ system, title, text, r, g, b }); }
	planet_button(label) { this.button = label; this.buttonCalls++; }
	panel_open(title, text) { this.panel = { title, text, buttons: [] }; }
	panel_button(label) {
		if (!this.panel) throw new Error('panel_button without a panel');
		this.panel.buttons.push(label);
	}
	panel_close() { this.panel = null; }
}
