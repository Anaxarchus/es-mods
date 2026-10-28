// The Endless Sky mod SDK for JavaScript and TypeScript: the base class every
// mod extends. A mod imports it as
//
//     import * as es from "es";
//     export default class ShieldWall extends es.Mod { ... }
//
// and `npm run build` bundles this file into the mod, so the mod's one .js
// file imports nothing, which is what the game's loader requires. The `Game`
// a hook receives is the game's own; its methods are declared in es.d.ts.
//
// This mirrors imports/sdk/es/Mod.dados, the DadoScript base class, method for
// method. `npm run sync` checks that the two match.

// The mod API version this SDK targets. A loader runs a mod whose min_api() it
// speaks (before mod API 10, whose api_version() it speaks). Written by `npm run sync`.
export const MOD_API = 10;

export class Mod {
	// The mod API this mod was built against (the SDK's MOD_API): for information.
	// Do not override; to say which API the mod needs, override min_api.
	api_version() {
		return MOD_API;
	}

	// (Mod API 10.) The oldest mod API this mod runs on: a loader refuses the mod
	// only when this is newer than the API it speaks. The default, 1, runs it on
	// every loader that knows min_api; a mod that cannot do without a newer call
	// returns that call's API version. For a feature it can do without, check
	// game.has("<feature>") instead, so the mod still runs on an older game.
	min_api() {
		return 1;
	}

	// The mod's name, used by `log`. Override it.
	name() {
		return "unnamed mod";
	}

	// Called once, after the mod loads and before its first step.
	on_load(game) {}

	// Called every engine step (60 per second) while the player is flying and the game is not paused.
	on_step(game, step) {}

	// Called once for each new day (days since the epoch), before on_enter on a jump.
	on_day(game, day) {}

	// Called when the player arrives in a system (its true name), and once when the mod starts in flight.
	on_enter(game, system) {}

	// Called when the player clicks this mod's planet-screen button.
	on_planet_button(game) {}

	// Called when the player clicks a button on this mod's panel.
	on_panel(game, button) {}

	// (Mod API 5.) Whether this mod's outfitter button is enabled, for the
	// outfitter's selected outfit ("" for none) and ships (game.outfitter_ship).
	// Runs every frame the outfitter is drawn: keep it quick.
	can_outfitter(game, outfit) {
		return true;
	}

	// (Mod API 5.) Called when the player clicks this mod's outfitter button.
	on_outfitter(game, outfit) {}

	// (Mod API 5.) Called when the player clicks OK in a dialog this mod opened
	// with game.confirm, with the token it gave.
	on_confirm(game, token) {}

	// (Mod API 6.) Called when the player clicks a row of this mod's panel table.
	on_panel_row(game, row) {}

	// (Mod API 6.) Called when the player answers a game.ask_number dialog with OK.
	on_number(game, token, value) {}

	// (Mod API 7.) Called when the player clicks a column heading of this mod's
	// table on its full screen (game.screen_open).
	on_panel_header(game, column) {}

	// (Mod API 10.) Called just before the game writes the pilot to a file (taking
	// off, quitting while landed, opening the load panel, the autosave when the
	// player accepts a mission marked `autosave`, a conversation's start): what
	// the mod writes with game.set_data now goes into that file. Panels and
	// dialogs do not work here, and there is no ship snapshot, even in flight. It
	// may run twice for one save.
	on_save(game) {}

	// (Mod API 10.) Called once when the player makes or loads another pilot (and
	// when the mods start with one), after on_load and before any on_day, on_enter
	// or on_step for that pilot: reset what the mod keeps in memory.
	on_pilot_loaded(game) {}

	// (Mod API 10.) A notification another mod posted with game.notify, which this
	// mod listens for (game.listen); `sender` is the posting mod, as the game recorded it.
	on_notification(game, name, payload, sender) {}

	// Write a line to the game's log, prefixed with the mod's name.
	log(game, text) {
		game.log(this.name() + ": " + text);
	}

	// True once every `seconds` of game time, for spreading work out over steps.
	every(step, seconds) {
		const period = Math.trunc(seconds * 60);
		if (period < 1) return true;
		return step % period === 0;
	}

	// The indices of the player's ships in the current system that are not disabled.
	player_ships(game) {
		const out = [];
		for (let i = 0; i < game.ship_count(); i++) {
			if (game.is_player(i) && !game.is_disabled(i)) out.push(i);
		}
		return out;
	}
}
