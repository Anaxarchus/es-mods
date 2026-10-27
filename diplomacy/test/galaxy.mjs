// A realistic galaxy for the mock game, read from the game's own data files:
// systems, governments, lanes and planets from "map systems.txt", planet
// defense fleets from "map planets.txt", and the Free Worlds territory from
// the campaign's events, so the map looks as it does after the campaign.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Tokenise one line of Endless Sky data: quoted, backticked or bare words.
export function tokens(line) {
	const out = [];
	let i = 0;
	while (i < line.length) {
		const c = line[i];
		if (c === ' ' || c === '\t') { i++; continue; }
		if (c === '#') break;
		if (c === '"' || c === '`') {
			const end = line.indexOf(c, i + 1);
			const stop = end < 0 ? line.length : end;
			out.push(line.slice(i + 1, stop));
			i = stop + 1;
			continue;
		}
		let j = i;
		while (j < line.length && line[j] !== ' ' && line[j] !== '\t') j++;
		out.push(line.slice(i, j));
		i = j;
	}
	return out;
}

// Lines as { depth, tokens }, skipping blank and comment lines.
export function nodes(text) {
	const out = [];
	for (const raw of text.split('\n')) {
		const t = tokens(raw);
		if (t.length === 0) continue;
		let depth = 0;
		while (depth < raw.length && raw[depth] === '\t') depth++;
		out.push({ depth, tokens: t });
	}
	return out;
}

export function loadGalaxy(dataDir) {
	const systems = new Map();   // name -> { government, links: [], planets: [] }
	let cur = null;
	for (const n of nodes(readFileSync(join(dataDir, 'map systems.txt'), 'utf8'))) {
		if (n.depth === 0) {
			cur = null;
			if (n.tokens[0] === 'system' && n.tokens.length > 1) {
				cur = { government: '', links: [], planets: [], fleets: [] };
				systems.set(n.tokens[1], cur);
			}
			continue;
		}
		if (!cur) continue;
		const key = n.tokens[0];
		if (n.depth === 1 && key === 'government') cur.government = n.tokens[1];
		else if (n.depth === 1 && key === 'link') cur.links.push(n.tokens[1]);
		else if (n.depth === 1 && key === 'fleet' && n.tokens.length > 1) cur.fleets.push(n.tokens[1]);
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

	// The campaign's territory: the Free Worlds' secession and expansions.
	const applied = [];
	const events = nodes(readFileSync(join(dataDir, 'human', 'campaign events.txt'), 'utf8'));
	for (const name of ['war begins', 'fw southern expansion', 'fw northern expansion']) {
		let inEvent = false;
		let sys = null;
		for (const n of events) {
			if (n.depth === 0) {
				inEvent = n.tokens[0] === 'event' && n.tokens[1] === name;
				sys = null;
				if (inEvent) applied.push(name);
				continue;
			}
			if (!inEvent) continue;
			if (n.depth === 1) sys = n.tokens[0] === 'system' ? n.tokens[1] : null;
			else if (n.depth === 2 && sys && n.tokens[0] === 'government' && systems.has(sys))
				systems.get(sys).government = n.tokens[1];
		}
	}
	return { systems, planets, events: applied };
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
