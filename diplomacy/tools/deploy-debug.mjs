// Installs the "Diplomacy Debug" plugin (debug/: a plugin.txt and data, no
// code) into the game's plugins folder, beside Diplomacy. While it is enabled
// the mod runs in debug mode (see README.md, "Debug mode"). It is a data-only
// plugin, so `npm run deploy` (which builds mods with a src/) does not handle it.
//
//     npm run deploy -- mods/diplomacy                 (Diplomacy itself, first)
//     node mods/diplomacy/tools/deploy-debug.mjs       (into your user plugins folder)
//     node mods/diplomacy/tools/deploy-debug.mjs --to <plugins folder>
//     node mods/diplomacy/tools/deploy-debug.mjs --remove [--to <plugins folder>]
//
// To play normally again, turn it off in Preferences > Plugins (or --remove it)
// and restart the game.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const DEBUG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug");
const NAME = "Diplomacy Debug";

// The same folders as the SDK's `npm run deploy` (tools/esmod.mjs).
function userPlugins() {
	switch (process.platform) {
		case "darwin":
			return join(homedir(), "Library/Application Support/argosy/plugins");
		case "win32":
			return join(process.env.APPDATA || join(homedir(), "AppData/Roaming"), "argosy/plugins");
		default:
			return join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "argosy/plugins");
	}
}

const USAGE = "usage: node mods/diplomacy/tools/deploy-debug.mjs [--to <plugins folder>] [--remove]";
function usage(problem) {
	console.error(`error: ${problem}\n${USAGE}`);
	process.exit(1);
}
let to = null, remove = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--remove") remove = true;
	else if (args[i] === "--to") {
		to = args[++i];
		if (!to || to.startsWith("--")) usage("--to needs a folder: the game's plugins folder");
	} else usage(`unknown argument ${args[i]}`);
}
const dest = resolve(to ?? userPlugins());
const target = join(dest, NAME);
if (remove) {
	rmSync(target, { recursive: true, force: true });
	console.log(`removed ${target}`);
} else {
	if (!existsSync(join(dest, "Diplomacy"))) console.log(`note: ${join(dest, "Diplomacy")} is missing; ${NAME} needs it (npm run deploy -- mods/diplomacy)`);
	mkdirSync(dest, { recursive: true });
	rmSync(target, { recursive: true, force: true });
	cpSync(DEBUG, target, { recursive: true });
	console.log(`deployed ${NAME} to ${target}\nturn it off in Preferences > Plugins (then restart the game) to play normally`);
}
