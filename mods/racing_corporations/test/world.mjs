// The bridge between The Racing League and Corporations on a FakeBus: each
// mod on its own FakeGame (as each runs in the game), any of them left out.
import { mkdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FakeGame, FakeBus } from "es/fake-game";
import { loadMod as loadRacing, newGame as racingGame } from "../../racing/test/world.mjs";
import { loadMod as loadCorporations, newGame as corpGame } from "../../corporations/test/world.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SDK = join(HERE, "../../..");
export { FakeGame, FakeBus };
export const DAY = 1100430;

function withBuildLock(f) {
	const lock = join(SDK, "dist", ".racing-corporations-build.lock");
	mkdirSync(join(SDK, "dist"), { recursive: true });
	const wait = new Int32Array(new SharedArrayBuffer(4));
	for (let tries = 0; ; tries++) {
		try {
			mkdirSync(lock);
			break;
		} catch {
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

// The three mods' classes; null for all without the Dado toolchain (and
// RACING_ALLOW_SKIP set), as the racing tests do.
export async function loadAll() {
	const Racing = await loadRacing();
	if (!Racing) return null;
	const Corporations = await loadCorporations();
	withBuildLock(() => execFileSync(process.execPath, [join(SDK, "tools/esmod.mjs"), "build", "mods/racing_corporations"], { cwd: SDK, stdio: "pipe" }));
	const Bridge = (await import(join(SDK, "dist/Racing League and Corporations/scripts/racing_corporations.js"))).RacingCorporations;
	return { Racing, Corporations, Bridge };
}

// The mods asked for (racing, corporations, bridge: each true by default),
// loaded with a pilot in Sol, the bus drained. `day(n)` plays days on every
// game, draining the bus after each mod's day as the game does after hooks.
export function world(mods, { racing = true, corporations = true, bridge = true } = {}) {
	const bus = new FakeBus();
	const out = { bus, mods: [] };
	const add = (name, Cls, game) => {
		const mod = new Cls();
		bus.join(name, mod, game);
		out[name] = { mod, game };
		out.mods.push(out[name]);
	};
	if (corporations) add("corporations", mods.Corporations, corpGame({ api10: true, day: DAY }));
	if (racing) add("racing", mods.Racing, racingGame({ day: DAY }));
	if (bridge) add("racing corporations", mods.Bridge, racingGame({ day: DAY }));
	for (const { mod, game } of out.mods) mod.on_load(game);
	for (const { mod, game } of out.mods) if (mod.on_pilot_loaded) mod.on_pilot_loaded(game);
	for (const { mod, game } of out.mods) mod.on_enter(game, "Sol");
	bus.drain();
	out.bridge = out["racing corporations"];
	out.day = (n = 1) => {
		for (let d = 0; d < n; d++) {
			for (const { mod, game } of out.mods) {
				game.day_ += 1;
				if (mod.on_day) mod.on_day(game, game.day_);
				bus.drain();
			}
		}
	};
	return out;
}

// Land every game at Earth (the bridge's screen and Corporations' charter need a planet).
export function landAll(w) {
	for (const { mod, game } of w.mods) {
		game.landed = true;
		game.planet_ = "Earth";
		game.here_ = game.planets?.Earth?.system ?? "Sol";
		mod.on_enter(game, game.here_);
	}
	w.bus.drain();
}
export function takeOffAll(w) {
	for (const { game } of w.mods) { game.landed = false; game.planet_ = ""; game.panel = null; }
}
