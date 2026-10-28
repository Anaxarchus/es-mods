// A realistic galaxy for the mock game, read from the game's own data files:
// systems, governments, lanes and planets from "map systems.txt", planet
// defense fleets from "map planets.txt", and the territory of the Free Worlds
// Veteran start, so the map looks as it does after the campaign.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokens, nodes } from './datafile.mjs';
export { tokens, nodes };

export function loadGalaxy(dataDir, startFile) {
	const systems = new Map();   // name -> { government, links: [], planets: [] }
	let cur = null;
	for (const n of nodes(readFileSync(join(dataDir, 'map systems.txt'), 'utf8'))) {
		if (n.depth === 0) {
			cur = null;
			if (n.tokens[0] === 'system' && n.tokens.length > 1) {
				cur = { government: '', links: [], planets: [], fleets: [], trade: {} };
				systems.set(n.tokens[1], cur);
			}
			continue;
		}
		if (!cur) continue;
		const key = n.tokens[0];
		if (n.depth === 1 && key === 'government') cur.government = n.tokens[1];
		else if (n.depth === 1 && key === 'link') cur.links.push(n.tokens[1]);
		else if (n.depth === 1 && key === 'fleet' && n.tokens.length > 1) cur.fleets.push(n.tokens[1]);
		else if (n.depth === 1 && key === 'trade' && n.tokens.length > 2) cur.trade[n.tokens[1]] = parseInt(n.tokens[2], 10);
		else if (key === 'object' && n.tokens.length > 1) cur.planets.push(n.tokens[1]);
	}
	// Lanes are two-way.
	for (const [name, s] of systems) {
		s.links = s.links.filter(l => systems.has(l));
		for (const l of s.links) {
			const o = systems.get(l);
			if (!o.links.includes(name)) o.links.push(name);
		}
	}

	const planets = new Map();   // name -> { defense: [fleet...], inhabited }
	let p = null;
	for (const n of nodes(readFileSync(join(dataDir, 'map planets.txt'), 'utf8'))) {
		if (n.depth === 0) {
			p = null;
			if (n.tokens[0] === 'planet' && n.tokens.length > 1) {
				p = { defense: [], inhabited: false, uninhabited: false };
				planets.set(n.tokens[1], p);
			}
			continue;
		}
		if (!p) continue;
		const key = n.tokens[0];
		if (n.depth === 1 && key === 'spaceport') p.inhabited = true;
		if (n.depth === 1 && key === 'attributes' && n.tokens.includes('uninhabited')) p.uninhabited = true;
		// A defense fleet is listed once per copy, as the game's Planet does.
		if (n.depth === 2 && key === 'fleet' && n.tokens.length > 1) {
			const count = n.tokens.length > 2 ? parseInt(n.tokens[2], 10) : 1;
			for (let k = 0; k < count; k++) p.defense.push(n.tokens[1]);
		}
	}

	// The territory of the Free Worlds Veteran start (data/diplomacy fw
	// veteran.txt): the game's dated events up to its start date, then the
	// events its intro applies at once ("event <name> 0"), in order. That is
	// the galaxy a pilot who finished the campaign has: the Free Worlds hold 57
	// systems. The events it schedules for later are applied too, after those.
	// Government, lane and patrol-fleet changes are applied.
	const applied = applyVeteranEvents(dataDir, systems, startFile);
	return { systems, planets, events: applied };
}

// Every data file under the game's data folder, recursively.
function dataFiles(dir) {
	const out = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...dataFiles(p));
		else if (e.name.endsWith('.txt')) out.push(p);
	}
	return out.sort();
}

// The top-level nodes of a data file as trees: { tokens, children }.
export function tree(text) {
	const root = { tokens: [], children: [], depth: -1 };
	const stack = [root];
	for (const n of nodes(text)) {
		const node = { tokens: n.tokens, children: [], depth: n.depth };
		while (stack[stack.length - 1].depth >= n.depth) stack.pop();
		stack[stack.length - 1].children.push(node);
		stack.push(node);
	}
	return root.children;
}

export const VETERAN_START = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'diplomacy fw veteran.txt');

function applyVeteranEvents(dataDir, systems, startFile = VETERAN_START) {
	const events = new Map();
	for (const f of dataFiles(dataDir))
		for (const n of tree(readFileSync(f, 'utf8')))
			if (n.tokens[0] === 'event' && n.tokens.length > 1) events.set(n.tokens[1], n);
	const start = tree(readFileSync(startFile, 'utf8'));
	const s = start.find(n => n.tokens[0] === 'start');
	const conv = start.find(n => n.tokens[0] === 'conversation');
	const date = s.children.find(n => n.tokens[0] === 'date').tokens.slice(1).map(Number);
	const key = d => d[2] * 10000 + d[1] * 100 + d[0];
	const dated = [];
	for (const [name, n] of events) {
		const d = n.children.find(c => c.tokens[0] === 'date');
		if (d && key(d.tokens.slice(1).map(Number)) <= key(date)) dated.push([key(d.tokens.slice(1).map(Number)), name]);
	}
	dated.sort((x, y) => x[0] - y[0]);
	// Applied at once, then the ones the start schedules (the last Pug lane
	// restorations, the Navy leaving Algenib, Greenrock), in the order they fall:
	// the galaxy as it stands four months in, and for the rest of the game.
	const now = [], later = [];
	for (const a of conv.children) if (a.tokens[0] === 'action')
		for (const g of a.children) if (g.tokens[0] === 'event') {
			const at = Number(g.tokens[2] || 0);
			if (at === 0) now.push(g.tokens[1]); else later.push([at, g.tokens[1]]);
		}
	later.sort((x, y) => x[0] - y[0]);
	const order = dated.map(d => d[1]).concat(now, later.map(l => l[1]));
	const link = (a, b, on) => {
		const x = systems.get(a), y = systems.get(b);
		if (!x || !y) return;
		if (on) { if (!x.links.includes(b)) x.links.push(b); if (!y.links.includes(a)) y.links.push(a); }
		else { x.links = x.links.filter(l => l !== b); y.links = y.links.filter(l => l !== a); }
	};
	for (const name of order) {
		const e = events.get(name);
		if (!e) continue;
		for (const c of e.children) {
			const t = c.tokens;
			if ((t[0] === 'link' || t[0] === 'unlink') && t.length >= 3) { link(t[1], t[2], t[0] === 'link'); continue; }
			if (t[0] !== 'system' || !systems.has(t[1])) continue;
			const sys = systems.get(t[1]);
			let fleetsReset = false;
			for (const g of c.children) {
				const u = g.tokens;
				if (u[0] === 'government') sys.government = u[1];
				else if (u[0] === 'link') link(t[1], u[1], true);
				else if (u[0] === 'remove' && u[1] === 'link') link(t[1], u[2], false);
				else if (u[0] === 'fleet') { if (!fleetsReset) { sys.fleets = []; fleetsReset = true; } sys.fleets.push(u[1]); }
				else if (u[0] === 'add' && u[1] === 'fleet') sys.fleets.push(u[2]);
				else if (u[0] === 'trade' && u.length > 2) { sys.trade = sys.trade || {}; sys.trade[u[1]] = parseInt(u[2], 10); }
				else if (u[0] === 'remove' && u[1] === 'fleet') sys.fleets = u.length > 2 ? sys.fleets.filter(f => f !== u[2]) : [];
			}
		}
	}
	return order;

}

// The galaxy as plain JSON, and back. test/galaxy.json is a snapshot of
// loadGalaxy(<game>/data), made by tools/make-galaxy.mjs, so the simulation
// test runs without the game's repository.
export function galaxyToJson(galaxy) {
	return {
		systems: Object.fromEntries(galaxy.systems),
		planets: Object.fromEntries(galaxy.planets),
		events: galaxy.events,
	};
}

export function galaxyFromJson(json) {
	return {
		systems: new Map(Object.entries(json.systems)),
		planets: new Map(Object.entries(json.planets)),
		events: json.events,
	};
}
