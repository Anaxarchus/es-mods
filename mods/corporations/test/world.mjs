// A FakeGame over human space as the game's data has it (test/galaxy.json,
// made by tools/make-galaxy.mjs, with each planet's shipyard list), the human
// ship models (test/models.json, made by tools/make-hulls.mjs), and the built
// mod.
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FakeGame } from "es/fake-game";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SDK = join(HERE, "../../..");
export const galaxy = JSON.parse(readFileSync(join(HERE, "galaxy.json"), "utf8"));
export const models = JSON.parse(readFileSync(join(HERE, "models.json"), "utf8"));

// `node --test` runs the test files at once, and each builds the mod into the
// same dist/ folder: a lock folder makes them take turns.
function withBuildLock(f) {
	const lock = join(SDK, "dist", ".corporations-build.lock");
	mkdirSync(join(SDK, "dist"), { recursive: true });
	const wait = new Int32Array(new SharedArrayBuffer(4));
	for (let tries = 0; ; tries++) {
		try {
			mkdirSync(lock);
			break;
		} catch {
			// A lock older than two minutes was left by a test that died.
			if (tries > 1200 || Date.now() - statSync(lock).mtimeMs > 120000) {
				rmSync(lock, { recursive: true, force: true });
				continue;
			}
			Atomics.wait(wait, 0, 0, 100);
		}
	}
	try {
		return f();
	} finally {
		rmSync(lock, { recursive: true, force: true });
	}
}

export async function loadMod() {
	try {
		execFileSync(process.env.DADOC || "dadoc", ["--version"], { stdio: "ignore" });
		withBuildLock(() => execFileSync(process.execPath, [join(SDK, "tools/esmod.mjs"), "build", "mods/corporations"], { cwd: SDK, stdio: "ignore" }));
		return (await import(join(SDK, "dist/Corporations/scripts/corporations.js"))).Corporations;
	} catch {
		return null;
	}
}

// A game as an API 9 game answers game.has(): nothing (features: []), which is
// what Corporations' tests assume. Pass { api10: true } for a game with every
// API 10 feature the SDK's FakeGame models (or `features` for a list of your own).
export function newGame(options = {}) {
	const { api10 = false, ...rest } = options;
	const systems = {};
	for (const [name, s] of Object.entries(galaxy.systems))
		systems[name] = { government: s.government, links: s.links, inhabited: true, defense: [] };
	return new FakeGame({
		system: "Sol", day: 1100000, ships: [], systems, planets: galaxy.planets, models, conditions: { credits: 5000000 },
		features: api10 ? undefined : [], ...rest,
	});
}
