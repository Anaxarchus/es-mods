// on_day timing in QuickJS, the game's engine (V8, which the tests use, is
// several times faster). Build first (npm run build -- mods/racing), then run
// with a qjs built from Dado's QuickJS sources (see Corporations'
// tools/qjs-time.mjs for the build line):
//   qjs --std -m mods/racing/tools/qjs-time.mjs <sdk folder> [days] [league]
// The player buys the cheapest team for sale in the league (0 B, 1 A, 2 S; default 2) after the
// first season, and every day's on_day is timed; also encode/decode.
const sdk = scriptArgs[1], days = Number(scriptArgs[2] || 1000), league = Number(scriptArgs[3] ?? 2);
const { FakeGame } = await import(sdk + "/js/fake-game.js");
const { Racing } = await import(sdk + "/dist/The Racing League/scripts/racing.js");
const game = new FakeGame({ day: 1100000, conditions: { credits: 500000000 } });
const mod = new Racing();
mod.on_load(game); mod.on_pilot_loaded(game); mod.on_enter(game, "Sol");
let total = 0, worst = 0, worstDay = 0, n = 0;
const byDay = [0, 1, 2, 3, 4, 5, 6].map(() => ({ sum: 0, max: 0, n: 0 }));
for (let d = 1; d <= days; d++) {
	if (d === 85) mod.world.buy(mod.world.for_sale(league)[0].id, "Earth");
	game.day_ += 1;
	const t = performance.now();
	mod.on_day(game, game.day_);
	const took = performance.now() - t;
	total += took; n += 1;
	const wd = (game.day_ - mod.world.start_day) % 7; byDay[wd].sum += took; byDay[wd].n += 1; if (took > byDay[wd].max) byDay[wd].max = took;
	if (took > 3) print(`slow: day ${d} weekday ${wd} season week ${mod.world.season_week()} ${took.toFixed(2)} ms`);
	if (took > worst) { worst = took; worstDay = (game.day_ - mod.world.start_day) % 7; }
	for (const inc of [...mod.world.incidents]) mod.world.events.resolve(mod.world, inc, 2);
}
let t = performance.now();
const text = mod.world.encode();
const enc = performance.now() - t;
t = performance.now();
const again = new (mod.world.constructor)();
again.decode(text);
const dec = performance.now() - t;
print(byDay.map((b, k) => `weekday ${k}: mean ${(b.sum / b.n).toFixed(2)} max ${b.max.toFixed(2)}`).join("\n"));
print(`on_day: mean ${(total / n).toFixed(3)} ms, worst ${worst.toFixed(3)} ms (weekday ${worstDay}); state ${text.length} bytes, encode ${enc.toFixed(2)} ms, decode ${dec.toFixed(2)} ms`);
