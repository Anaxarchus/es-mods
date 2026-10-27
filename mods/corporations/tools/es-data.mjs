// Reading the game's data files, for the generators (make-galaxy.mjs,
// make-hulls.mjs): every .txt file under a folder, as lines of tokens, and
// which planets' shipyards sell which ship models.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The governments of human space.
export const HUMAN = new Set(["Republic", "Free Worlds", "Syndicate", "Pirate", "Independent", "Militia"]);

export function files(dir) {
	return readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		return statSync(p).isDirectory() ? files(p) : p.endsWith(".txt") ? [p] : [];
	}).sort();
}

// Data-file lines as [indent, tokens].
export function lines(text) {
	const out = [];
	for (const raw of text.split("\n")) {
		if (!raw.trim() || raw.trim().startsWith("#")) continue;
		const indent = raw.match(/^\t*/)[0].length;
		const tokens = [];
		const re = /"([^"]*)"|`([^`]*)`|(\S+)/g;
		let m;
		while ((m = re.exec(raw.slice(indent)))) tokens.push(m[1] ?? m[2] ?? m[3]);
		out.push([indent, tokens]);
	}
	return out;
}

// Every data file under `root`, read once: [path, lines].
export function readAll(root) {
	return files(root).map((f) => [f, lines(readFileSync(f, "utf8"))]);
}

// Shipyards and who uses them, counting everything the data can ever add:
//   models: shipyard name -> Set of ship models (its definition, and events
//           that add to it);
//   planetYards: planet -> Set of shipyard names (the map, and events that
//           give the planet a shipyard).
// Removals are ignored, so this is everything a planet may ever sell.
export function readShipyards(all) {
	const models = new Map();
	const planetYards = new Map();
	const yard = (name) => (models.has(name) ? models.get(name) : models.set(name, new Set()).get(name));
	const give = (planet, name) => (planetYards.has(planet) ? planetYards.get(planet) : planetYards.set(planet, new Set()).get(planet)).add(name);
	for (const [, ls] of all) {
		// What the current top-level and indent-1 blocks are.
		let top = null, topName = null, sub = null, subName = null;
		for (const [indent, t] of ls) {
			if (indent === 0) {
				top = t[0]; topName = t[1]; sub = null; subName = null;
				if (top === "shipyard" && topName) yard(topName);
				continue;
			}
			if (top === "shipyard" && indent === 1 && t[0] !== "remove") yard(topName).add(t[0] === "add" ? t[1] : t[0]);
			if (top === "planet" && indent === 1 && t[0] === "shipyard" && t[1]) give(topName, t[1]);
			if (top === "event" && indent === 1) {
				sub = t[0]; subName = t[1];
				if (sub === "shipyard" && subName) yard(subName);
				continue;
			}
			if (top === "event" && sub === "shipyard" && indent === 2 && t[0] !== "remove" && t[0] !== "clear") yard(subName).add(t[0] === "add" ? t[1] : t[0]);
			if (top === "event" && sub === "planet" && indent === 2) {
				if (t[0] === "shipyard" && t[1]) give(subName, t[1]);
				if (t[0] === "add" && t[1] === "shipyard" && t[2]) give(subName, t[2]);
			}
		}
	}
	return { models, planetYards };
}

// The models a planet's shipyards may sell, sorted, or [].
export function planetModels(yards, planet) {
	const out = new Set();
	for (const y of yards.planetYards.get(planet) ?? []) for (const m of yards.models.get(y) ?? []) if (m) out.add(m);
	return [...out].sort();
}
