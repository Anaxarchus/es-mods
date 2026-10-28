// on_day timing in QuickJS, the game's engine (V8, which the tests use, runs
// the mod about 3 to 5 times faster). Build first (npm run build --
// mods/corporations), then run it with a qjs built from Dado's QuickJS
// sources (~/.cache/dado-quickjs/tree/*; `gcc -O2 -D_GNU_SOURCE -o qjs qjs.c
// quickjs.c quickjs-libc.c libregexp.c libunicode.c dtoa.c gen/repl.c
// gen/standalone.c -lm -lpthread -ldl`):
//   qjs --std -m mods/corporations/tools/qjs-time.mjs <sdk folder> [days] [buy] [war] [api10]
// With "buy", a player lands at a random shipyard every 3 days and buys a hull.
import * as std from "qjs:std";
// With "api10", the game has every API 10 feature (the market is then saved
// only in on_save, which this loop never runs); by default an API 9 game.
// With "war", Diplomacy's Republic and Free Worlds are at war throughout
// (more tenders, convoys and losses).
const sdk = scriptArgs[1], days = Number(scriptArgs[2] || 5000), buy = scriptArgs.includes("buy"), api10 = scriptArgs.includes("api10"), war = scriptArgs.includes("war");
const { FakeGame } = await import(sdk + "/js/fake-game.js");
const { Corporations } = await import(sdk + "/dist/Corporations/scripts/corporations.js");
const read = (f) => JSON.parse(std.loadFile(sdk + "/mods/corporations/test/" + f));
const galaxy = read("galaxy.json");
const models = read("models.json");
const systems = {};
for (const [name, s] of Object.entries(galaxy.systems)) systems[name] = { government: s.government, links: s.links, inhabited: true, defense: [] };
const game = new FakeGame({ system: "Sol", day: 1100000, ships: [], systems, planets: galaxy.planets, models, conditions: war ? { credits: 5000000, "diplomacy: active": 1, "diplomacy: war a": 1, "diplomacy: war b": 2 } : { credits: 5000000 }, features: api10 ? undefined : [] });
const mod = new Corporations();
mod.on_load(game); mod.on_enter(game, "Sol");
const yards = Object.keys(galaxy.planets).filter((p) => galaxy.planets[p].shipyard);
let seed = 12345;
const roll = (n) => ((seed = (seed * 48271) % 2147483647), seed % n);
let total = 0, worst = 0, last = 0, largest = 0;
for (let d = 1; d <= days; d++) {
	game.day_ += 1;
	const t = performance.now();
	mod.on_day(game, game.day_);
	const took = performance.now() - t;
	total += took; if (took > worst) worst = took;
	if (d > days - 1000) last += took;
	if (d % 50 === 0) largest = Math.max(largest, game.data("state").length);
	if (buy && d % 3 === 0) {
		const planet = yards[roll(yards.length)];
		game.landed = true; game.planet_ = planet;
		mod.on_enter(game, galaxy.planets[planet].system);
		const sold = galaxy.planets[planet].shipyard, model = sold[roll(sold.length)];
		const have = game.ship_stock(planet, model);
		if (have > 0) game.set_ship_stock(planet, model, have - 1);
		game.landed = false; game.planet_ = "";
	}
}
print(`QuickJS on_day${buy ? " (a player buying)" : ""}${war ? " (at war)" : ""}: ${(total / days).toFixed(2)} ms average over ${days} days (last 1000: ${(last / Math.min(1000, days)).toFixed(2)}), ${worst.toFixed(1)} ms slowest; state ${(game.data("state").length / 1024).toFixed(0)} KB (largest ${(largest / 1024).toFixed(0)} KB)`);
