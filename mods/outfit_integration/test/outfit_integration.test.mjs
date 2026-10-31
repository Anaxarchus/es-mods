// Tests for Outfit Integration, against the SDK's FakeGame. A DadoScript mod is
// tested through its build: this builds the mod, then imports the JavaScript the
// game would load. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FakeGame } from "es/fake-game";

const SDK = join(dirname(fileURLToPath(import.meta.url)), "../../..");
let OutfitIntegration;
try {
	execFileSync(process.env.DADOC || "dadoc", ["--version"], { stdio: "ignore" });
	execFileSync(process.execPath, [join(SDK, "tools/esmod.mjs"), "build", "mods/outfit_integration"], { cwd: SDK, stdio: "ignore" });
	({ OutfitIntegration } = await import(join(SDK, "dist/Outfit Integration/scripts/outfit_integration.js")));
} catch {
	// No Dado toolchain here: these tests are skipped.
}
const skip = !OutfitIntegration && "no Dado toolchain";

// A landed pilot in the outfitter with the flagship selected.
function setup(credits = 1000000) {
	const game = new FakeGame({ landed: true, conditions: { credits } });
	const mod = new OutfitIntegration();
	mod.on_load(game);
	mod.on_enter(game, game.here());
	game.outfitterShips = [game.fleet_ship(0)];
	return { game, mod, flagship: game.fleet[0] };
}

// Click Integrate with this outfit selected, and answer OK.
function integrate(game, mod, outfit) {
	game.confirms = [];
	mod.on_outfitter(game, outfit);
	const asked = game.confirms.at(-1);
	if (asked) mod.on_confirm(game, asked.token);
	return asked;
}

test("the outfitter gets an Integrate button", { skip }, () => {
	const { game } = setup();
	assert.equal(game.outfitterButtonLabel, "Integrate");
});

test("the button is on only for an installed outfit that is not all integrated", { skip }, () => {
	const { game, mod } = setup();
	assert.equal(mod.can_outfitter(game, ""), false, "no outfit selected");
	assert.equal(mod.can_outfitter(game, "Cargo Expansion"), false, "not installed on the ship in focus");
	assert.equal(mod.can_outfitter(game, "Heavy Rocket"), false, "ammunition");
	assert.equal(mod.can_outfitter(game, "Energy Blaster"), true);
	assert.equal(mod.can_outfitter(game, "Hyperdrive"), true);
	game.outfitterShips = [];
	assert.equal(mod.can_outfitter(game, "Energy Blaster"), false, "no ship selected");
});

test("integrating asks first, then charges a quarter of the cost and makes it 25% lighter and smaller", { skip }, () => {
	const { game, mod, flagship } = setup();
	mod.on_outfitter(game, "Energy Blaster");
	assert.equal(game.confirms.length, 1);
	const { text, token } = game.confirms[0];
	assert.match(text, /^Integrate one Energy Blaster into the Flagship\?/);
	assert.match(text, /25% lighter and take up 25% less space \(3 tons, 3 outfit space, 3 weapon capacity\)/);
	assert.match(text, /never be uninstalled, sold or plundered/);
	assert.match(text, /fee is 3,500 credits\./);
	// Nothing happens until the player says OK.
	assert.equal(flagship.integrated["Energy Blaster"] ?? 0, 0);
	assert.equal(game.condition("credits"), 1000000);

	mod.on_confirm(game, token);
	assert.equal(flagship.integrated["Energy Blaster"], 1);
	assert.equal(flagship.massSaved, 3);
	assert.deepEqual(flagship.spaceSaved, { "outfit space": 3, "weapon capacity": 3 }, "weapon capacity is saved too");
	assert.equal(game.condition("credits"), 1000000 - 3500);
	assert.equal(game.condition("outfit integration: integrated"), 1);
	assert.equal(game.condition("outfit integration: fees paid"), 3500);
});

test("weapons and systems integrate; once every copy is integrated the button is off", { skip }, () => {
	const { game, mod, flagship } = setup();
	integrate(game, mod, "Energy Blaster");
	assert.equal(mod.can_outfitter(game, "Energy Blaster"), true, "the second blaster is not integrated yet");
	integrate(game, mod, "Energy Blaster");
	assert.equal(flagship.integrated["Energy Blaster"], 2);
	assert.equal(mod.can_outfitter(game, "Energy Blaster"), false);
	// Clicking a disabled button does nothing.
	game.confirms = [];
	mod.on_outfitter(game, "Energy Blaster");
	assert.equal(game.confirms.length, 0);

	integrate(game, mod, "Hyperdrive");
	assert.equal(flagship.integrated["Hyperdrive"], 1);
	assert.equal(flagship.massSaved, 3 + 3 + 5);
	assert.equal(game.condition("credits"), 1000000 - 3500 - 3500 - 12500);
	assert.equal(game.condition("outfit integration: integrated"), 3);
});

test("the ship in focus is the one integrated", { skip }, () => {
	const { game, mod } = setup();
	game.outfitterShips = [game.fleet_ship(1), game.fleet_ship(0)];
	assert.equal(mod.can_outfitter(game, "Energy Blaster"), false);
	assert.equal(mod.can_outfitter(game, "Cargo Expansion"), true);
	const asked = integrate(game, mod, "Cargo Expansion");
	assert.match(asked.text, /into the Escort\?/);
	assert.equal(game.fleet[1].integrated["Cargo Expansion"], 1);
	assert.equal(game.fleet[0].integrated["Energy Blaster"] ?? 0, 0);
});

test("without the fee, the player is told, and nothing is integrated", { skip }, () => {
	const { game, mod, flagship } = setup(1000);
	const asked = integrate(game, mod, "Hyperdrive");
	assert.equal(asked.token, 0);
	assert.match(asked.text, /costs 12,500 credits, and you have 1,000 credits\./);
	assert.equal(flagship.integrated["Hyperdrive"] ?? 0, 0);
	assert.equal(game.condition("credits"), 1000);
});

test("cancelling leaves the ship as it was, and a later OK does not act on it", { skip }, () => {
	const { game, mod, flagship } = setup();
	mod.on_outfitter(game, "Hyperdrive");
	// The player cancels: no on_confirm. Then another outfit is asked about, and confirmed.
	game.confirms = [];
	integrate(game, mod, "Energy Blaster");
	assert.equal(flagship.integrated["Hyperdrive"] ?? 0, 0);
	assert.equal(flagship.integrated["Energy Blaster"], 1);
	// A stray second OK does nothing more.
	mod.on_confirm(game, 1);
	assert.equal(flagship.integrated["Energy Blaster"], 1);
	assert.equal(game.condition("outfit integration: integrated"), 1);
});
