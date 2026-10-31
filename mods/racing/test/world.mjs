// The Racing League against the SDK's FakeGame: builds the mod (under a lock,
// since `node --test` runs the test files at once and they share dist/), and
// helpers to land, take off, play days and drive the office.
import { mkdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FakeGame, FakeBus } from "es/fake-game";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SDK = join(HERE, "../../..");
export { FakeGame, FakeBus };

function withBuildLock(f) {
	const lock = join(SDK, "dist", ".racing-build.lock");
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

// The built mod's class. Without the Dado toolchain the tests fail loudly,
// unless RACING_ALLOW_SKIP is set (then they are skipped).
export async function loadMod() {
	try {
		execFileSync(process.env.DADOC || "dadoc", ["--version"], { stdio: "ignore" });
	} catch {
		if (process.env.RACING_ALLOW_SKIP) return null;
		throw new Error("The Racing League's tests need the Dado toolchain: put dadoc on PATH (or set DADOC), or set RACING_ALLOW_SKIP=1 to skip them");
	}
	withBuildLock(() => execFileSync(process.execPath, [join(SDK, "tools/esmod.mjs"), "build", "mods/racing"], { cwd: SDK, stdio: "pipe" }));
	return (await import(join(SDK, "dist/The Racing League/scripts/racing.js"))).Racing;
}

export function newGame(options = {}) {
	return new FakeGame({ day: 1100430, conditions: { credits: 500000000 }, ...options });
}

// A mod with a world, in flight in Sol.
export function start(Racing, options = {}) {
	const game = newGame(options);
	const mod = new Racing();
	mod.on_load(game);
	mod.on_pilot_loaded(game);
	mod.on_enter(game, "Sol");
	return { game, mod, w: () => mod.world };
}
export function days(mod, game, n) {
	for (let d = 0; d < n; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
	}
}
export function land(mod, game, planet = "Earth") {
	game.landed = true;
	game.planet_ = planet;
	game.here_ = game.planets[planet].system;
	mod.on_enter(game, game.here_);
}
export function takeOff(game) {
	game.landed = false;
	game.planet_ = "";
	game.panel = null;
}
export function press(mod, game, label) {
	const i = game.panel.buttons.indexOf(label);
	if (i < 0) throw new Error(`no "${label}" button (${game.panel.buttons.join(", ")})`);
	mod.on_panel(game, i);
}
export function pressStarting(mod, game, prefix) {
	const i = game.panel.buttons.findIndex((b) => b.startsWith(prefix));
	if (i < 0) throw new Error(`no "${prefix}..." button (${game.panel.buttons.join(", ")})`);
	mod.on_panel(game, i);
}
export function confirmLast(mod, game) {
	mod.on_confirm(game, game.confirms.at(-1).token);
}
// Open the office at Earth (answering any events first, by letting the chief).
export function office(mod, game) {
	if (game.planet_ !== "Earth") land(mod, game);
	mod.on_planet_button(game);
	while (game.panel && !game.panel.full) {
		const chief = game.panel.buttons.findIndex((b) => b.startsWith("Let "));
		if (chief >= 0) mod.on_panel(game, chief);
		else {
			const next = game.panel.buttons.indexOf("Next event");
			const off = game.panel.buttons.indexOf("Racing office");
			mod.on_panel(game, next >= 0 ? next : off >= 0 ? off : 0);
			if (off < 0 && next < 0) mod.on_planet_button(game);
		}
	}
}
// The tests written for founding (before teams were bought) start from a
// team as founding left it: buy the cheapest team of the league through the
// office, then clear it (blank): no staff, no sponsors, 40% of the league's
// franchise as its cash, no R&D budgets, nothing of this season to its name.
export function found(mod, game, league = 0) {
	buy(mod, game, mod.world.for_sale(league)[0].id);
	return blank(mod.world);
}
export function blank(w, cash = 0.4) {
	const me = w.mine();
	for (const s of [0, 1, 2, 3, 4, 5]) if (me.seats[s]) w.staff.release(w, w.person(me.seats[s]), false);
	w.deals = w.deals.filter((d) => d.team !== me.id);
	me.cash = cash * w.franchise[me.league];
	me.budgets = [0, 0, 0, 0, 0];
	me.protect = true;
	me.sponsor_net = 0; me.sponsor_related = 0; me.sponsor_history = "";
	w.sponsoring.offers(w, me, 2);
	w.stale();
	return me;
}
// Buy a team by id through the office (Team tab, its league, its row, Buy, OK).
export function buy(mod, game, id) {
	office(mod, game);
	press(mod, game, "Team");
	const t = mod.world.team(id);
	while (!game.panel.buttons.includes(`League: ${["B", "A", "S"][t.league]}`)) pressStarting(mod, game, "League: ");
	pickRow(mod, game, t.name);
	press(mod, game, "Buy");
	confirmLast(mod, game);
	return mod.world.mine();
}
// Choose the row of the office's table whose first cells include text.
export function pickRow(mod, game, text) {
	const i = game.panel.rows.findIndex((r) => r.includes(text));
	if (i < 0) throw new Error(`no row with "${text}"`);
	mod.on_panel_row(game, i);
}
