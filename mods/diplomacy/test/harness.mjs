// Shared by the Diplomacy tests: builds the mod with the SDK (once per test
// process), loads the test galaxy, and drives a mock game day by day.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGalaxy, galaxyFromJson } from './galaxy.mjs';
import { MockGame } from './mock.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SDK = join(HERE, '../../..');

function hasDadoc() {
	try {
		execFileSync(process.env.DADOC || 'dadoc', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

// `node --test` runs the test files side by side, and each imports this: the
// first to take the lock builds, the others wait for it and use its build.
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function build() {
	const lock = join(SDK, 'dist', '.diplomacy-build.lock');
	mkdirSync(join(SDK, 'dist'), { recursive: true });
	for (let waited = 0; ; waited += 100) {
		try {
			mkdirSync(lock);
			break;
		} catch {
			if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 180000) { try { rmdirSync(lock); } catch {} continue; }
			if (waited > 180000) throw new Error('timed out waiting for another build of mods/diplomacy');
			sleep(100);
			if (!existsSync(lock)) return;    // the other process built it
		}
	}
	try {
		execFileSync(process.execPath, [join(SDK, 'tools/esmod.mjs'), 'build', 'mods/diplomacy'], { cwd: SDK, stdio: ['ignore', 'pipe', 'pipe'] });
	} finally {
		rmdirSync(lock);
	}
}

// Without dadoc the tests fail, loudly, unless DIPLOMACY_ALLOW_SKIP=1 says a
// quiet skip is wanted (a machine without the Dado toolchain).
const allowSkip = process.env.DIPLOMACY_ALLOW_SKIP === '1';
export let Diplomacy = null, buildError = null;
if (!hasDadoc() && !allowSkip) {
	buildError = new Error('dadoc was not found (put the Dado toolchain on PATH or set DADOC); set DIPLOMACY_ALLOW_SKIP=1 to skip the Diplomacy tests instead');
	console.error('mods/diplomacy tests: ' + buildError.message);
} else if (hasDadoc()) {
	try {
		build();
		({ Diplomacy } = await import(join(SDK, 'dist/Diplomacy/scripts/diplomacy.js')));
	} catch (e) {
		buildError = e;
	}
}
export const skip = buildError ? false : (!hasDadoc() ? 'no Dado toolchain (DIPLOMACY_ALLOW_SKIP=1)' : (!Diplomacy && 'the mod did not build (see "the mod builds")'));

export const loadTestGalaxy = () => process.env.ES_DATA
	? loadGalaxy(process.env.ES_DATA)
	: galaxyFromJson(JSON.parse(readFileSync(join(HERE, 'galaxy.json'), 'utf8')));

export const GOVS = ['', 'Republic', 'Free Worlds', 'Syndicate', 'Pirate'];
export const FLOT = ['', 'Republic Flotilla', 'Free Worlds Flotilla', 'Syndicate Flotilla'];
export const CAPITALS = ['', 'Sol', 'Gamma Corvi', 'Markab'];

// The minors as the mod has them (src/Regions.dados, generated from tools/regions/regions.mjs).
export const { MINORS } = await import('../tools/regions/regions.mjs');
export const REBELS = MINORS.map(m => m.rebels || '');
// Side of a government name: 1..3 majors, 4 pirates, 5 + k the rebels of minor k, 0 none.
export function sideOf(gov) {
	const k = GOVS.indexOf(gov);
	if (k > 0) return k;
	const r = REBELS.indexOf(gov);
	return r >= 0 && gov ? 5 + r : 0;
}
export const minorOf = new Map();
MINORS.forEach((m, k) => m.systems.forEach(s => minorOf.set(s, k)));

// A pilot who finished the campaign, with Diplomacy accepted (a Free Worlds
// Commodore), `start` days after the base day. Answers { game, mod }.
export function veteran(galaxy, { start = 0, reconciliation = true, mod = new Diplomacy() } = {}) {
	const game = new MockGame(galaxy);
	game.today = 1100000 + start;
	game.setCond('free worlds plot completed', 1);
	if (reconciliation) game.setCond('free worlds reconciliation', 1);
	mod.on_load(game);
	game.today++;
	mod.on_day(game, game.today);
	mod.on_enter(game, 'Sol');
	mod.on_panel(game, 0);
	return { game, mod };
}

// A pilot with the mod forced on and no membership.
export function forced(galaxy, { start = 0, mod = new Diplomacy() } = {}) {
	const game = new MockGame(galaxy);
	game.today = 1100000 + start;
	game.setCond('diplomacy: force active', 1);
	mod.on_load(game);
	return { game, mod };
}

// One day passes (taking off where it is, or jumping to `dest`).
export function day(game, mod, dest) {
	game.today++;
	if (dest && dest !== game.where) {
		game.moveTo(dest);
		mod.on_day(game, game.today);
		mod.on_enter(game, dest);
	} else {
		game.ships = [];
		mod.on_day(game, game.today);
	}
	// A mod API 10 game asks for the state when it saves (on_save): here, every day.
	if (game.has) mod.on_save(game);
}

export function state(game) {
	const t = game.data('state');
	return t ? JSON.parse(t) : null;
}

// The wars in the state, as objects.
export function wars(game) {
	const s = state(game);
	return s ? s.wars.map(w => ({ id: w[0], a: w[1], b: w[2], kind: w[3], since: w[4], until: w[5], score: w[6], exA: w[7], exB: w[8], goals: w.slice(14, 14 + w[13]) })) : [];
}

export function fleets(game) {
	const s = state(game);
	return s ? s.fleets.map(f => ({ id: f[0], side: f[1], war: f[2], strength: f[3], size: f[4], kind: f[5], admiral: f[6], full: f[7], at: f[8], goal: f[9], home: f[10], target: f[11], siege: f[12], stops: [f[14], f[15], f[16]].filter(x => x >= 0), leg: f[17], squadron: f[21] || 0, order: f[22] || 0 })) : [];
}

// Systems each side holds in minor k.
export function holdings(game, k) {
	const out = {};
	for (const s of MINORS[k].systems) { const side = sideOf(game.governments.get(s)); out[side] = (out[side] || 0) + 1; }
	return out;
}

export function nonZeroConditions(game) {
	let n = 0;
	for (const [k, v] of game.conditions) if (k.startsWith('diplomacy: ') && v !== 0) n++;
	return n;
}

// Hand every system of minor k to side `side` (a test's set-up; the mod reads it the next morning).
export function give(game, k, gov) {
	for (const s of MINORS[k].systems) if (!Object.values(CAPITALS).includes(s)) game.governments.set(s, gov);
}

export const minorIndex = short => MINORS.findIndex(m => m.short === short);

// Change the stored state (a test's set-up): the mod reads it again on its
// next hook, as it would an older save of the same pilot.
export function edit(game, fn) {
	const s = state(game);
	fn(s);
	s.rev = (s.rev || 0) + 1000;
	game.set_data('state', JSON.stringify(s));
	game.set_data('rev', String(s.rev));
}

export const sysIndex = (game, name) => game.names.indexOf(name);
