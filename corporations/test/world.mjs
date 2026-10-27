// A FakeGame over human space as the game's data has it (test/galaxy.json,
// made by tools/make-galaxy.mjs, with each planet's shipyard list), the human
// ship models (test/models.json, made by tools/make-hulls.mjs), and the built
// mod.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FakeGame } from "es/fake-game";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SDK = join(HERE, "../../..");
export const galaxy = JSON.parse(readFileSync(join(HERE, "galaxy.json"), "utf8"));
export const models = JSON.parse(readFileSync(join(HERE, "models.json"), "utf8"));

export async function loadMod() {
	try {
		execFileSync(process.env.DADOC || "dadoc", ["--version"], { stdio: "ignore" });
		execFileSync(process.execPath, [join(SDK, "tools/esmod.mjs"), "build", "mods/corporations"], { cwd: SDK, stdio: "ignore" });
		return (await import(join(SDK, "dist/Corporations/scripts/corporations.js"))).Corporations;
	} catch {
		return null;
	}
}

export function newGame(options = {}) {
	const systems = {};
	for (const [name, s] of Object.entries(galaxy.systems))
		systems[name] = { government: s.government, links: s.links, inhabited: true, defense: [] };
	return new FakeGame({ system: "Sol", day: 1100000, ships: [], systems, planets: galaxy.planets, models, conditions: { credits: 5000000 }, ...options });
}
