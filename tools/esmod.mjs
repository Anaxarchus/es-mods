#!/usr/bin/env node
// The mod SDK's command line. Run it through npm (see README.md):
//
//   npm run new -- <name> [--dado | --js | --ts | --plain]   start a mod in mods/<name>
//   npm run build [-- <mod dir>...]                build mods into dist/<Plugin Name>/
//   npm run check [-- <mod dir or .js file>...]    build, then test each against a fake game
//   npm run deploy [-- <mod dir>...] [--to <plugins dir>]
//                                                  build and copy into the game's plugins folder
//   npm run package [-- <mod dir>...]              build and zip dist/<Plugin Name>.zip to share
//   npm run install-loader [-- --to <modloaders dir>] [--lib <library>] [--loader <es-modloader>]
//                                                  copy the Dado loader into the game's modloaders folder
//
// With no mod directories, each command works on every mod in mods/.
//
// A mod directory holds a plugin's sources:
//
//   plugin.txt     the plugin's name and description, as the game reads them
//   data/ images/ sounds/ shaders/   copied as they are (all optional)
//   src/           the mod, built: DadoScript (.dados files, one class extending
//                  es.Mod) or JavaScript / TypeScript (src/index.js or
//                  src/index.ts, exporting one class that extends es.Mod)
//   scripts/       or the mod as the game runs it, nothing built: plain
//                  JavaScript files (<mod>.js, each exporting one class that
//                  extends the loader's global Mod and importing nothing),
//                  copied as they are
//
// and `build` turns it into the plugin the game loads, ready to drop into the
// game's plugins folder:
//
//   dist/<Plugin Name>/plugin.txt
//   dist/<Plugin Name>/data/...               (a stub if the mod has none: the game
//                                             only treats a folder with one as a plugin)
//   dist/<Plugin Name>/scripts/<mod id>.js    the mod, one self-contained file
//
// `check` also takes a single plain .js mod file, and runs it as it is.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, cpSync, mkdtempSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";

const SDK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(SDK, "dist");
const ASSET_DIRS = ["data", "images", "sounds", "shaders"];

class Failure extends Error {}
const fail = (msg) => {
	throw new Failure(msg);
};

// ---- Reading a mod directory ----

// `name "Shield Wall"` in plugin.txt; the plugin's folder is named after it.
function pluginName(dir) {
	const file = join(dir, "plugin.txt");
	if (!existsSync(file)) fail(`${rel(dir)} has no plugin.txt: a mod directory is a plugin's sources (see README.md)`);
	const m = /^name\s+(?:"([^"]+)"|`([^`]+)`|(\S+))\s*$/m.exec(readFileSync(file, "utf8"));
	if (!m) fail(`${rel(file)} has no \`name "..."\` line`);
	return m[1] ?? m[2] ?? m[3];
}

// The mod's file name in scripts/, which is also the name the game logs it under.
function modId(dir) {
	return basename(resolve(dir)).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "mod";
}

function rel(p) {
	const r = relative(process.cwd(), p);
	return r === "" ? "." : r.startsWith("..") ? p : r;
}

// The plain mods in a folder of scripts: every regular *.js file not starting
// with a dot, as the loader sees them.
function plainScripts(scripts) {
	return readdirSync(scripts)
		.filter((f) => f.endsWith(".js") && !f.startsWith(".") && statSync(join(scripts, f)).isFile())
		.sort();
}

// What kind of source a mod has: { kind: "dado", entry, cls }, { kind: "js", entry }
// or { kind: "plain", scripts } (a scripts/ folder of plain mods, not built).
function source(dir) {
	const src = join(dir, "src");
	const scripts = join(dir, "scripts");
	if (!existsSync(src) && existsSync(scripts)) {
		if (plainScripts(scripts).length === 0) fail(`${rel(scripts)} has no .js mods`);
		return { kind: "plain", scripts };
	}
	if (!existsSync(src)) fail(`${rel(dir)} has neither a src/ folder (a mod to build) nor a scripts/ folder (plain JavaScript mods)`);
	for (const name of ["index.ts", "index.js", "index.mjs"]) {
		if (existsSync(join(src, name))) return { kind: "js", entry: join(src, name) };
	}
	const dados = readdirSync(src).filter((f) => f.endsWith(".dados"));
	if (dados.length === 0) fail(`${rel(src)} has neither DadoScript (.dados) files nor an index.js or index.ts`);
	for (const f of dados) {
		const m = /^class\s+([A-Za-z_]\w*)\s+extends\s+es\.Mod\b/m.exec(readFileSync(join(src, f), "utf8"));
		if (m) return { kind: "dado", entry: join(src, f), cls: m[1] };
	}
	fail(`no .dados file in ${rel(src)} starts with \`class Name extends es.Mod\``);
}

// A plain mod given as one file, for `check`.
function plainFile(path) {
	if (!existsSync(path) || !statSync(path).isFile()) fail(`${rel(path)} is not a file`);
	lint(path);
	return { id: basename(path).slice(0, -3), file: path };
}

function modDirs(args) {
	if (args.length) return args.map((a) => resolve(a));
	const root = join(SDK, "mods");
	const dirs = existsSync(root)
		? readdirSync(root).map((d) => join(root, d)).filter((d) => statSync(d).isDirectory() && existsSync(join(d, "plugin.txt")))
		: [];
	if (dirs.length === 0) fail("there are no mods in mods/ yet: start one with `npm run new -- <name>`, or name a mod directory (e.g. `npm run build -- examples/hull_regen`)");
	return dirs;
}

// ---- Building ----

async function esbuild() {
	try {
		return await import("esbuild");
	} catch {
		fail("esbuild is not installed: run `npm install` in the SDK folder first");
	}
}

function dadoc() {
	const exe = process.env.DADOC || "dadoc";
	try {
		execFileSync(exe, ["--version"], { stdio: "ignore" });
	} catch {
		fail(`building a DadoScript mod needs the Dado toolchain's \`dadoc\` on your PATH (or set DADOC): install Dado from https://dadolang.com`);
	}
	return exe;
}

// Compile a DadoScript mod to a JavaScript library and answer its entry module.
function dadoLibrary(src, work) {
	const exe = dadoc();
	const sdk = join(SDK, "imports/sdk");
	try {
		execFileSync(exe, [`--import=sdk=${sdk}`, "--emit=js-package", "--package", "-o", work, src.entry], { stdio: ["ignore", "inherit", "inherit"] });
	} catch {
		fail(`dadoc could not compile ${rel(src.entry)} (its errors are above)`);
	}
	for (const pkg of readdirSync(work)) {
		if (pkg === "es") continue;
		const file = join(work, pkg, `${src.cls}.js`);
		if (existsSync(file)) return file;
	}
	fail(`dadoc wrote no module for class ${src.cls}`);
}

async function buildOne(dir) {
	const name = pluginName(dir);
	const id = modId(dir);
	const src = source(dir);
	const out = join(DIST, name);
	rmSync(out, { recursive: true, force: true });
	mkdirSync(join(out, "scripts"), { recursive: true });
	cpSync(join(dir, "plugin.txt"), join(out, "plugin.txt"));
	let assets = false;
	for (const d of ASSET_DIRS) {
		if (existsSync(join(dir, d))) {
			cpSync(join(dir, d), join(out, d), { recursive: true });
			assets = true;
		}
	}
	if (!assets) {
		mkdirSync(join(out, "data"));
		writeFileSync(join(out, "data", `${id}.txt`), `# ${name}: this plugin has no data of its own. The game only treats a folder\n# with a data, images, sounds or shaders folder as a plugin, so this keeps it one.\n`);
	}

	if (src.kind === "plain") {
		// Nothing to build: the mods are copied as they are, which is what an
		// author does by hand. Only *.js files go; editor files (es.d.ts) stay.
		const mods = plainScripts(src.scripts).map((f) => {
			const file = join(out, "scripts", f);
			cpSync(join(src.scripts, f), file);
			lint(file);
			return { id: f.slice(0, -3), file };
		});
		return { dir, name, id: mods[0].id, out, file: mods[0].file, mods, kind: "plain" };
	}

	const { build } = await esbuild();
	const work = mkdtempSync(join(tmpdir(), "esmod-"));
	try {
		const entry = src.kind === "dado" ? dadoLibrary(src, work) : src.entry;
		await build({
			entryPoints: [entry],
			bundle: true,
			format: "esm",
			platform: "neutral",
			target: "es2022",
			outfile: join(out, "scripts", `${id}.js`),
			logLevel: "warning",
			legalComments: "none",
			nodePaths: [join(SDK, "node_modules")],
			// esbuild names each source file in a comment, relative to this folder: the
			// SDK for JavaScript, the compiled library for DadoScript. Either way no
			// temporary path gets in, and the same mod builds the same file.
			absWorkingDir: src.kind === "dado" ? work : SDK,
		});
	} catch (e) {
		if (e instanceof Failure) throw e;
		fail(`could not bundle ${rel(dir)}: ${e.message}`);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
	const file = join(out, "scripts", `${id}.js`);
	lint(file);
	return { dir, name, id, out, file, mods: [{ id, file }], kind: src.kind };
}

// What the game's loader refuses, caught here: a mod is one module that imports
// nothing and exports exactly one class.
function lint(file) {
	const text = readFileSync(file, "utf8");
	const imp = /^\s*import\s*(?:[\w*{][^;]*from\s*)?["']([^"']+)["']/m.exec(text);
	if (imp) fail(`${rel(file)} imports "${imp[1]}": a mod must be self-contained, and the game refuses any import`);
	if (/\brequire\s*\(/.test(text)) fail(`${rel(file)} calls require(): the game has no CommonJS modules`);
}

// ---- Checking against the fake game ----

// Globals Node has and the game's script engine does not (the game has `print`, which writes to its standard output).
const MISSING_IN_GAME = ["console", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "structuredClone", "fetch", "process", "require", "Buffer", "TextEncoder", "TextDecoder", "URL", "Intl", "crypto", "window", "document"];

// `built` is one mod: { id, file }. Its report goes in built.report.
async function checkOne(built) {
	const { FakeGame } = await import(pathToFileURL(join(SDK, "js/fake-game.js")).href);
	const { MOD_API } = await import(pathToFileURL(join(SDK, "js/es.js")).href);
	// The globals the loader defines in every mod's engine (Mod, MOD_API, es), which
	// a plain mod extends. A bundled mod carries its own es.Mod and ignores them.
	await import(pathToFileURL(join(SDK, "stub/es.js")).href);
	const problems = [];
	let ns;
	try {
		ns = await import(pathToFileURL(built.file).href + "?t=" + Date.now());
	} catch (e) {
		return [`it did not load: ${e.message}`];
	}
	const classes = Object.keys(ns).filter((k) => !k.includes("$") && typeof ns[k] === "function");
	if (classes.length !== 1) {
		return [`the game loads a mod as one exported class, and this exports ${classes.length === 0 ? "none" : classes.join(", ")}`];
	}
	let mod;
	try {
		mod = new ns[classes[0]]();
	} catch (e) {
		return [`its constructor threw (the game constructs a mod with no arguments): ${e.message}`];
	}
	if (typeof mod.api_version !== "function") return ["it does not extend Mod (or es.Mod): it has no api_version()"];
	const v = Number(mod.api_version());
	if (!Number.isInteger(v) || v < 1 || v > MOD_API) problems.push(`api_version() is ${v}; this SDK speaks 1 ..= ${MOD_API}`);
	// Mod API 10: the loader refuses a mod whose min_api() is newer than it speaks.
	if (typeof mod.min_api === "function") {
		const need = Number(mod.min_api());
		if (!Number.isInteger(need) || need < 1 || need > MOD_API) problems.push(`min_api() is ${need}; this SDK speaks 1 ..= ${MOD_API}`);
	}

	// Run the hooks the way the game does, with the globals the game lacks taken away.
	const saved = {};
	for (const g of MISSING_IN_GAME) {
		saved[g] = Object.getOwnPropertyDescriptor(globalThis, g);
		try {
			Object.defineProperty(globalThis, g, { value: undefined, configurable: true, writable: true });
		} catch {}
	}
	const text = readFileSync(built.file, "utf8");
	const game = new FakeGame();
	const hook = (label, f) => {
		try {
			f();
		} catch (e) {
			const used = MISSING_IN_GAME.filter((g) => new RegExp(`\\b${g}\\s*[.(]`).test(text));
			const hint = used.length
				? ` (this mod uses ${used.join(", ")}, which the game does not have${used.includes("console") ? "; log with this.log(game, ...)" : ""})`
				: "";
			problems.push(`${label} threw: ${e.message}${hint}`);
			throw e;
		}
	};
	// Mod API 10: notifications queued for the mod are delivered after each hook, as the game does.
	const drain = () => { if (typeof mod.on_notification === "function") hook("on_notification", () => game.drain(mod)); };
	const save = (label) => { if (typeof mod.on_save === "function") hook(label, () => mod.on_save(game)); };
	try {
		hook("on_load", () => mod.on_load(game));
		// Mod API 10: the mods start with a pilot: on_pilot_loaded, before any other hook for it.
		if (typeof mod.on_pilot_loaded === "function") hook("on_pilot_loaded", () => mod.on_pilot_loaded(game));
		drain();
		if (typeof mod.on_day === "function") hook("on_day", () => mod.on_day(game, game.day()));
		if (typeof mod.on_enter === "function") hook("on_enter", () => mod.on_enter(game, game.here()));
		for (let step = 1; step <= 600; step++) {
			game.step_ = step;
			// Mod API 9: now and then a ship is destroyed, once by the player.
			if (step % 150 === 0) {
				game.stepLosses = [
					{ model: "Star Barge", government: "Merchant", byPlayer: false },
					{ model: "Clipper", government: "Pirate", byPlayer: step === 300 },
				];
			}
			hook(`on_step (step ${step})`, () => mod.on_step(game, step));
			game.stepLosses = [];
			// Mod API 10: now and then the game saves (an autosave), and another mod posts.
			if (step % 200 === 0) save(`on_save (step ${step})`);
			if (step % 250 === 0) game.receive("check.ping", JSON.stringify({ step }), "some other mod");
			drain();
		}
		game.day_ += 1;
		if (typeof mod.on_day === "function") hook("on_day (the next day)", () => mod.on_day(game, game.day()));
		game.landed = true;
		game.planet_ = game.planetsIn(game.here())[0] ?? "";
		// Landing saves the pilot and runs on_enter; then the planet button, its panel, a table row and a number dialog.
		save("on_save (landing)");
		if (typeof mod.on_enter === "function") hook("on_enter (landed)", () => mod.on_enter(game, game.here()));
		drain();
		if (game.planetButtonLabel && typeof mod.on_planet_button === "function") {
			hook("on_planet_button", () => mod.on_planet_button(game));
			if (game.panel?.rows?.length && typeof mod.on_panel_row === "function") hook("on_panel_row (row 0)", () => mod.on_panel_row(game, 0));
			if (game.panel?.full && game.panel?.columns?.length && typeof mod.on_panel_header === "function") hook("on_panel_header (column 0)", () => mod.on_panel_header(game, 0));
			const asked = game.numberAsks[0];
			if (asked && typeof mod.on_number === "function") hook("on_number", () => mod.on_number(game, asked.token, 1));
			if (game.panel && game.panel.buttons.length && typeof mod.on_panel === "function") hook("on_panel (button 0)", () => mod.on_panel(game, 0));
		}
		// Mod API 5: the outfitter's button, with the flagship and its first outfit selected.
		if (game.outfitterButtonLabel && typeof mod.can_outfitter === "function") {
			game.outfitterShips = [game.fleet_ship(0)];
			const outfit = Object.keys(game.fleet[0]?.outfits ?? {})[0] ?? "";
			let active = false;
			hook("can_outfitter", () => { active = mod.can_outfitter(game, outfit); });
			if (active && typeof mod.on_outfitter === "function") {
				hook("on_outfitter", () => mod.on_outfitter(game, outfit));
				const asked = game.confirms[0];
				if (asked && typeof mod.on_confirm === "function") hook("on_confirm", () => mod.on_confirm(game, asked.token));
			}
		}
	} catch {
		// reported above
	} finally {
		for (const g of MISSING_IN_GAME) {
			if (saved[g]) Object.defineProperty(globalThis, g, saved[g]);
			else delete globalThis[g];
		}
	}
	built.report = { name: typeof mod.name === "function" ? mod.name() : "?", logs: game.logs, messages: game.messages };
	return problems;
}

// ---- Deploying and packaging ----

// Copy a folder over another, file by file: folders are made as needed and
// files overwritten in place. (fs.cpSync also copies folders' modes and
// times, which some shared or mounted folders refuse halfway through.)
function copyTree(from, to) {
	mkdirSync(to, { recursive: true });
	for (const name of readdirSync(from)) {
		const f = join(from, name), t = join(to, name);
		if (statSync(f).isDirectory()) {
			if (existsSync(t) && !statSync(t).isDirectory()) rmSync(t, { force: true });
			copyTree(f, t);
		} else {
			if (existsSync(t) && statSync(t).isDirectory()) rmSync(t, { recursive: true, force: true });
			copyFileSync(f, t);
		}
	}
}

// Paths under `target` that `built` does not have (deepest first is not
// needed: a missing folder is removed whole).
function leftovers(built, target) {
	const out = [];
	for (const name of readdirSync(target)) {
		const t = join(target, name), b = join(built, name);
		if (!existsSync(b)) out.push(t);
		else if (statSync(t).isDirectory() && statSync(b).isDirectory()) out.push(...leftovers(b, t));
	}
	return out;
}

// ---- The loader ----

const LOADER_FILES = { darwin: "libesdado.dylib", win32: "esdado.dll" };
const loaderFile = (platform = process.platform) => LOADER_FILES[platform] ?? "libesdado.so";
const ALL_LOADER_FILES = ["libesdado.dylib", "libesdado.so", "esdado.dll"];

function loaderIn(folders) {
	for (const f of folders) for (const n of ALL_LOADER_FILES) if (existsSync(join(f, n))) return join(f, n);
	return null;
}

function userModloaders() {
	return join(userPlugins(), "..", "modloaders");
}

// Copy the Dado loader (es-modloader's built library) into a modloaders folder.
function installLoader(args, to) {
	const opt = (name) => {
		const at = args.indexOf(name);
		if (at < 0) return null;
		const v = args[at + 1];
		if (!v) fail(`${name} needs a value`);
		args.splice(at, 2);
		return v;
	};
	let lib = opt("--lib");
	const repo = resolve(opt("--loader") ?? process.env.ES_MODLOADER ?? join(SDK, "../es-modloader"));
	if (args.length) fail(`unknown argument ${args[0]}`);
	if (!lib) {
		const file = loaderFile();
		const builds = process.platform === "darwin" ? ["build", "build-mac"] : process.platform === "win32" ? ["build-win", "build"] : ["build"];
		lib = builds.map((b) => join(repo, b, file)).find((p) => existsSync(p)) ?? null;
		if (!lib) {
			const how = process.platform === "darwin"
				? "./build-mac.sh   (or: cmake -B build -G Ninja && cmake --build build)"
				: process.platform === "win32"
					? "cmake -B build-win -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=tools/zig-windows.cmake && cmake --build build-win"
					: "cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build";
			fail(`no built loader (${file}) in ${existsSync(repo) ? builds.map((b) => rel(join(repo, b))).join(" or ") : `${rel(repo)}, which does not exist`}.\n` +
				`  Get the loader's repository (es-modloader) next to this SDK, or name it with --loader <dir>, and build it there:\n` +
				`    ${how}\n` +
				`  (its README.md lists what the build needs: Dado, CMake, a C compiler). Or name a built library with --lib <file>.`);
		}
	}
	if (!existsSync(lib) || !statSync(lib).isFile()) fail(`${rel(lib)} is not a file`);
	const dest = resolve(to ?? userModloaders());
	mkdirSync(dest, { recursive: true });
	const target = join(dest, basename(lib));
	// Copy beside it and rename over it: a game that has the old library open
	// keeps its copy, and a failed copy leaves the old one whole.
	const tmp = join(dest, `.${basename(lib)}.${process.pid}.tmp`);
	try {
		copyFileSync(lib, tmp);
		renameSync(tmp, target);
	} catch (e) {
		rmSync(tmp, { force: true });
		fail(`could not install ${rel(lib)} in ${dest}: ${e.message}`);
	}
	console.log(`installed ${rel(lib)} as ${target}`);
	console.log("restart the game: its log then says `Mod loader \"Dado loader ...\" ... loaded.`");
}

// Argosy's config folder, SDL_GetPrefPath(nullptr, "argosy") (not Endless Sky's "endless-sky").
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

// A zip of a folder, its entries under the folder's own name. Deflated, no dependencies.
function zip(folder, outFile) {
	const crcTable = new Int32Array(256).map((_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c;
	});
	const crc32 = (buf) => {
		let c = -1;
		for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
		return (c ^ -1) >>> 0;
	};
	const files = [];
	const walk = (dir) => {
		for (const f of readdirSync(dir).sort()) {
			const p = join(dir, f);
			if (statSync(p).isDirectory()) walk(p);
			else files.push(p);
		}
	};
	walk(folder);
	const parts = [];
	const central = [];
	let offset = 0;
	for (const p of files) {
		const name = Buffer.from(join(basename(folder), relative(folder, p)).split("\\").join("/"));
		const data = readFileSync(p);
		const packed = deflateRawSync(data);
		const crc = crc32(data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(8, 8); // deflate
		local.writeUInt16LE(0x0021, 12); // 1980-01-01: zip has no "no date"
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(packed.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(name.length, 26);
		parts.push(local, name, packed);
		const cen = Buffer.alloc(46);
		cen.writeUInt32LE(0x02014b50, 0);
		cen.writeUInt16LE(20, 4);
		cen.writeUInt16LE(20, 6);
		cen.writeUInt16LE(0x0800, 8);
		cen.writeUInt16LE(8, 10);
		cen.writeUInt16LE(0x0021, 14);
		cen.writeUInt32LE(crc, 16);
		cen.writeUInt32LE(packed.length, 20);
		cen.writeUInt32LE(data.length, 24);
		cen.writeUInt16LE(name.length, 28);
		cen.writeUInt32LE(offset, 42);
		central.push(cen, name);
		offset += 30 + name.length + packed.length;
	}
	const cenBuf = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(cenBuf.length, 12);
	end.writeUInt32LE(offset, 16);
	writeFileSync(outFile, Buffer.concat([...parts, cenBuf, end]));
}

// ---- Scaffolding ----

function words(name) {
	return name.split(/[^A-Za-z0-9]+/).filter(Boolean);
}

function scaffold(args) {
	const lang = args.includes("--plain") ? "plain" : args.includes("--ts") ? "ts" : args.includes("--js") ? "js" : "dado";
	const name = args.filter((a) => !a.startsWith("--")).join(" ").trim();
	if (!name) fail("usage: npm run new -- <name> [--dado | --js | --ts | --plain]");
	const w = words(name);
	const id = w.join("_").toLowerCase();
	const cls = w.map((x) => x[0].toUpperCase() + x.slice(1)).join("");
	const title = w.map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");
	if (!/^[A-Za-z]/.test(cls)) fail("a mod's name must start with a letter");
	const dir = join(SDK, "mods", id);
	if (existsSync(dir)) fail(`${rel(dir)} already exists`);
	mkdirSync(join(dir, lang === "plain" ? "scripts" : "src"), { recursive: true });
	mkdirSync(join(dir, "data"));
	writeFileSync(join(dir, "plugin.txt"), `name "${title}"\nversion "0.1"\nauthors\n\t"You"\nabout "What ${title} does, shown in the game's plugin list."\n`);
	writeFileSync(join(dir, "data", `${id}.txt`), `# ${title}: data files (missions, events, ships...) go here. Missions and the mod\n# talk through the player's conditions, e.g. \`set "${id}: enabled"\`.\n`);
	const greet = `${title} loaded`;
	if (lang === "plain") {
		// Plain JavaScript, run as it is: the loader's global Mod, no import, no build.
		writeFileSync(join(dir, "scripts", `${id}.js`), `/// <reference path="../../../stub/es.d.ts" />
// ${title}: a plain JavaScript mod. The game runs this file as it is, from
// <plugins>/${title}/scripts/${id}.js. \`Mod\` is a global the loader defines.

export class ${cls} extends Mod {
	name() {
		return "${id}";
	}

	/** @param {Game} game */
	on_load(game) {
		this.log(game, "loaded");
	}

	/** @param {Game} game @param {string} system */
	on_enter(game, system) {
		if (system === "") return;
		game.message(\`${greet}: you are in \${game.system()}.\`);
	}

	/** @param {Game} game @param {number} step */
	on_step(game, step) {
		if (!this.every(step, 1)) return;
		// Once a second: look at the ships in the system.
		for (const i of this.player_ships(game)) {
			if (game.hull(i) < game.max_hull(i) * 0.25) {
				game.set_condition("${id}: low hull warnings", game.condition("${id}: low hull warnings") + 1);
			}
		}
	}
}
`);
	} else if (lang === "dado") {
		writeFileSync(join(dir, "src", `${id}.dados`), `class ${cls} extends es.Mod

import "imports:sdk/es"

string name():
    return "${id}"

void on_load(es.Game game):
    log(game, "loaded")

void on_enter(es.Game game, string system):
    game.message("${greet}: you are in " + game.system() + ".")

void on_step(es.Game game, int step):
    if !every(step, 1.0):
        return
    // Once a second: look at the ships in the system.
    for i in player_ships(game):
        float hull = game.hull(i)
        if hull < game.max_hull(i) * 0.25:
            game.set_condition("${id}: low hull warnings", game.condition("${id}: low hull warnings") + 1)
`);
	} else {
		const ts = lang === "ts";
		const g = ts ? "game: es.Game" : "game";
		writeFileSync(join(dir, "src", ts ? "index.ts" : "index.js"), `import * as es from "es";
${ts ? "" : "\n/** @typedef {import(\"es\").Game} Game */\n"}
export default class ${cls} extends es.Mod {
	name() {
		return "${id}";
	}
${ts ? "" : "\n\t/** @param {Game} game */"}
	on_load(${g}) {
		this.log(game, "loaded");
	}
${ts ? "" : "\n\t/** @param {Game} game @param {string} system */"}
	on_enter(${g}, system${ts ? ": string" : ""}) {
		game.message(\`${greet}: you are in \${game.system()}.\`);
	}
${ts ? "" : "\n\t/** @param {Game} game @param {number} step */"}
	on_step(${g}, step${ts ? ": number" : ""}) {
		if (!this.every(step, 1)) return;
		// Once a second: look at the ships in the system.
		for (const i of this.player_ships(game)) {
			if (game.hull(i) < game.max_hull(i) * 0.25) {
				game.set_condition("${id}: low hull warnings", game.condition("${id}: low hull warnings") + 1);
			}
		}
	}
}
`);
	}
	console.log(`started ${rel(dir)} (${lang === "dado" ? "DadoScript" : lang === "ts" ? "TypeScript" : lang === "plain" ? "plain JavaScript, no build" : "JavaScript"})\nnext: npm run check -- ${rel(dir)}`);
}

// ---- Commands ----

async function main() {
	const [cmd, ...rest] = process.argv.slice(2);
	const toAt = rest.indexOf("--to");
	let to = null;
	if (toAt >= 0) {
		to = rest[toAt + 1];
		if (!to) fail("--to needs a folder: the game's plugins folder");
		rest.splice(toAt, 2);
	}
	const unknown = rest.find((a) => a.startsWith("--") && cmd !== "new" && cmd !== "install-loader");
	if (unknown) fail(`unknown option ${unknown}`);
	switch (cmd) {
		case "new":
			return scaffold(rest);
		case "build": {
			for (const d of modDirs(rest)) {
				const b = await buildOne(d);
				const kind = b.kind === "dado" ? "DadoScript" : b.kind === "plain" ? "plain JavaScript, copied" : "JavaScript";
				console.log(`built ${rel(b.out)}/  (${b.mods.map((m) => `mod "${m.id}"`).join(", ")}, ${kind})`);
			}
			return;
		}
		case "check": {
			let failed = 0;
			for (const d of modDirs(rest)) {
				// A single .js file is a plain mod already: run it as it is.
				const mods = d.endsWith(".js") ? [plainFile(d)] : (await buildOne(d)).mods;
				for (const m of mods) {
					const problems = await checkOne(m);
					if (problems.length) {
						failed++;
						console.log(`FAIL ${m.id}\n  ${problems.join("\n  ")}`);
					} else {
						const r = m.report;
						console.log(`ok   ${m.id}: "${r.name}" ran its hooks for 600 steps against the fake game`);
						for (const l of r.logs.slice(0, 5)) console.log(`       log: ${l}`);
						for (const msg of r.messages.slice(0, 5)) console.log(`       message: ${msg}`);
					}
				}
			}
			if (failed) process.exitCode = 1;
			return;
		}
		case "deploy": {
			const dest = resolve(to ?? userPlugins());
			mkdirSync(dest, { recursive: true });
			for (const d of modDirs(rest)) {
				const b = await buildOne(d);
				const target = join(dest, b.name);
				// Copy over the installed plugin in place, then remove what the build no
				// longer has. Deleting first could leave an empty plugin if the delete
				// failed halfway (as on folders that forbid deleting).
				copyTree(b.out, target);
				for (const stale of leftovers(b.out, target)) {
					try {
						rmSync(stale, { recursive: true, force: true });
					} catch (e) {
						console.log(`warning: could not remove ${stale}, which the build no longer has (${e.code ?? e.message})`);
					}
				}
				console.log(`deployed ${b.name} to ${target}`);
			}
			const found = loaderIn([join(dest, "..", "modloaders"), userModloaders()]);
			if (!found) console.log(`note: no Dado loader is installed in ${join(dest, "..", "modloaders")} or ${userModloaders()}; the game loads the plugins' data but runs no mods until one is: run \`npm run install-loader\``);
			console.log("restart the game to load it (mods load when the game starts)");
			return;
		}
		case "install-loader":
			return installLoader(rest, to);
		case "package": {
			for (const d of modDirs(rest)) {
				const b = await buildOne(d);
				const file = join(DIST, `${b.name}.zip`);
				zip(b.out, file);
				console.log(`packaged ${rel(file)}: unzip it into the game's plugins folder`);
			}
			return;
		}
		default:
			console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
			process.exitCode = cmd ? 2 : 0;
	}
}

main().catch((e) => {
	console.error(e instanceof Failure ? `error: ${e.message}` : e.stack);
	process.exit(1);
});
