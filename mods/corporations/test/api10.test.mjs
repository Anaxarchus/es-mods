// Corporations on a game with mod API 10's features on (FakeGame's default
// features, not the API 9 game the other tests use): on_save is the save path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadMod, newGame } from "./world.mjs";

const Corporations = await loadMod();
const skip = !Corporations && "no Dado toolchain";

test("with API 10's features, on_save writes the market and the cadence saves are off", { skip }, () => {
	const game = newGame({ api10: true });
	assert.equal(game.has("on_save"), true);
	const mod = new Corporations();
	mod.on_load(game);
	mod.on_pilot_loaded(game);
	mod.on_enter(game, "Sol");
	assert.equal(mod.has_on_save, true, "it takes the on_save path");
	assert.ok(game.listening.has("diplomacy.*"), "and listens on the bus");
	let saves = 0;
	const setData = game.set_data.bind(game);
	game.set_data = (k, v) => { if (k === "state") saves++; setData(k, v); };
	for (let d = 0; d < 40; d++) {
		game.day_ += 1;
		mod.on_day(game, game.day_);
	}
	assert.equal(saves, 0, "no saves on the old cadence");
	mod.on_save(game);
	assert.equal(saves, 1);
	const saved = game.data("state");
	assert.equal(saved, mod.market.encode(), "the saved state is the market");
	// What on_save wrote reads back as the same market in a fresh mod.
	const again = new Corporations();
	again.on_enter(game, "Sol");
	assert.equal(again.market.encode(), saved, "and loads back as it was");
});
