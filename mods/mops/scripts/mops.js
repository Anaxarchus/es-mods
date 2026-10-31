/// <reference path="../../../stub/es.d.ts" />
// MOPS is a data-only plugin: everything it does is in data/ (missions, jobs and
// news), and the game runs it with or without the Dado loader. This file exists
// because the repository's tools (npm run build/check/deploy) expect a mod to
// have a src/ or scripts/ folder; with the loader it only logs that it loaded.

export class Mops extends Mod {
	name() {
		return "mops";
	}

	/** @param {Game} game */
	on_load(game) {
		this.log(game, "loaded (data only)");
	}
}
