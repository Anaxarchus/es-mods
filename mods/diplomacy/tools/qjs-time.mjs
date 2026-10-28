// on_day timing in QuickJS, the game's engine (V8, which the tests use, runs
// the mod several times faster). Build first (npm run build -- mods/diplomacy),
// then run it with a qjs built from Dado's QuickJS sources
// (~/.cache/dado-quickjs/tree/*; `gcc -O2 -D_GNU_SOURCE -o qjs qjs.c quickjs.c
// quickjs-libc.c libregexp.c libunicode.c dtoa.c gen/repl.c gen/standalone.c
// -lm -lpthread -ldl`):
//   qjs --std -m mods/diplomacy/tools/qjs-time.mjs <sdk folder> [days] [dist folder]
// A Free Worlds veteran accepts the commission and the days run with the test
// galaxy (test/galaxy.json) and the mock game (test/mock.mjs). The game stops a
// hook that runs over 250 ms (the loader's watchdog).
import * as std from "qjs:std";
const sdk = scriptArgs[1], days = Number(scriptArgs[2] || 4000);
const dist = scriptArgs[3] || sdk + "/dist/Diplomacy";
const { MockGame } = await import(sdk + "/mods/diplomacy/test/mock.mjs");
const { Diplomacy } = await import(dist + "/scripts/diplomacy.js");
const json = JSON.parse(std.loadFile(sdk + "/mods/diplomacy/test/galaxy.json"));
const galaxy = { systems: new Map(Object.entries(json.systems)), planets: new Map(Object.entries(json.planets)), events: json.events };
const game = new MockGame(galaxy);
game.today = 1100000;
game.setCond("free worlds plot completed", 1);
game.setCond("free worlds reconciliation", 1);
const mod = new Diplomacy();
mod.on_load(game);
game.today++;
mod.on_day(game, game.today);
mod.on_enter(game, "Sol");
mod.on_panel(game, 0);
const now = () => Date.now();
let total = 0, worst = 0, last = 0, worstDay = 0;
const sample = [];
for (let d = 1; d <= days; d++) {
	game.today++;
	const t = now();
	mod.on_day(game, game.today);
	const took = now() - t;
	total += took;
	if (took > worst) { worst = took; worstDay = d; }
	if (d > days - 1000) last += took;
}
// A landing too: the War Room and the job board.
game.landed = "Earth";
let t = now();
mod.on_enter(game, "Sol");
const enter = now() - t;
t = now();
mod.on_planet_button(game);
if (game.panel && game.panel.buttons.includes("War Room")) mod.on_panel(game, game.panel.buttons.indexOf("War Room"));
const room = now() - t;
const state = (game.data("state") || "").length;
print(`QuickJS on_day: ${(total / days).toFixed(2)} ms average over ${days} days (last 1000: ${(last / Math.min(1000, days)).toFixed(2)}), ${worst} ms slowest (day ${worstDay}); landing ${enter} ms, War Room ${room} ms; state ${state} bytes`);
