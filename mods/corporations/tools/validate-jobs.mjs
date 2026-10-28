// Validates every kind of job text Corporations writes (parts, convoy escort
// and intercept, relief cargo, covert plans and sabotage) with the real
// game's data parser. It runs the market against FakeGame, lands on every
// planet now and then (with standings that make covert jobs appear, and a
// crisis forced for relief jobs), collects the job bodies as offer_job
// receives them, writes them into a temporary plugin as the loader would
// wrap them (`mission "corporations: <name>"` / `job` / the body indented),
// runs the game with --parse-assets on a temporary config folder, and prints
// what its errors.txt says about the plugin. Exits 1 on any warning.
//   node mods/corporations/tools/validate-jobs.mjs [game binary] [game resources folder] [rounds]
// Defaults: $ES_BIN, /tmp/esbuild/endless-sky, ~/esroot/build/endless-sky; $ES_RESOURCES,
// ~/esroot, ../endless-sky, ~/mnt/endless-sky; 40 rounds.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadMod, newGame, galaxy, SDK } from "../test/world.mjs";

// The game and its resources: the arguments, the environment, or the usual
// places; a clear error naming every place tried when none is found.
const home = process.env.HOME || "";
const firstOf = (list, ok) => list.filter(Boolean).map((p) => resolve(p)).find(ok);
const binTried = [process.argv[2], process.env.ES_BIN, "/tmp/esbuild/endless-sky", join(home, "esroot/build/endless-sky"), join(SDK, "../endless-sky/build/endless-sky")];
const resTried = [process.argv[3], process.env.ES_RESOURCES, join(home, "esroot"), join(SDK, "../endless-sky"), join(home, "mnt/endless-sky")];
const bin = firstOf(binTried, existsSync);
const resources = firstOf(resTried, (p) => existsSync(join(p, "credits.txt")) && existsSync(join(p, "data")));
const rounds = Number(process.argv[4] || 40);
if (!bin) throw new Error(`no game binary found; tried: ${binTried.filter(Boolean).join(", ")} (pass it, or set ES_BIN)`);
if (!resources) throw new Error(`no game resources (credits.txt and data/) found; tried: ${resTried.filter(Boolean).join(", ")} (pass them, or set ES_RESOURCES)`);
console.log(`game ${bin}, resources ${resources}`);

const C = await loadMod();
const game = newGame();
const mod = new C();
mod.on_load(game);
mod.on_enter(game, "Sol");
const days = (n) => { for (let i = 0; i < n; i++) { game.day_++; mod.on_day(game, game.day_); } };
// (M3) Tips on every bank landing, one-offs often; a siege for blockade runs.
mod.market.tips_desk.CHANCE = 100;
mod.market.tips_desk.SURPRISE_CHANCE = 60;
const sysIndex = (name) => Object.keys(game.systems).sort().indexOf(name) + 1;
game.conditions.set("diplomacy: active", 1);
for (const [k, v] of Object.entries({ strength: 100, kind: 0, at: sysIndex("Alpha Centauri"), goal: sysIndex("Alpha Centauri") })) game.conditions.set("diplomacy: flotilla 2.1 " + k, v);
const jobs = new Map();
const kinds = {};
const planets = Object.keys(galaxy.planets);
for (let round = 0; round < rounds; round++) {
	days(5);
	// Poor standing with odd ids, good with even ones: covert jobs of both kinds.
	for (let id = 1; id <= 60; id++) game.set_condition("corporations: standing " + id, id % 2 ? -30 : 30);
	if (round % 10 === 0 && mod.market.crises.length === 0) {
		const c = mod.market.companies.find((x) => x.listed() && [0, 1, 3, 4, 5].includes(x.sector));
		mod.market.crisis_desk.begin(game, mod.galaxy, mod.market, c, mod.market.day);
	}
	for (const p of planets) {
		game.landed = true; game.planet_ = p; game.here_ = game.planets[p].system; game.jobs = new Map();
		mod.on_enter(game, game.here_);
		for (const [name, body] of game.jobs) {
			const kind = name.split(" ")[0] + (name.startsWith("covert") ? (body.includes("stopover") ? " plans" : " sabotage") : "");
			kinds[kind] = (kinds[kind] || 0) + 1;
			// A few of each kind are enough for the parser.
			if ((jobs.get(kind)?.length ?? 0) < 25) (jobs.get(kind) ?? jobs.set(kind, []).get(kind)).push([name, body]);
		}
		game.landed = false; game.planet_ = "";
	}
}
console.log("job texts seen:", JSON.stringify(kinds));
const config = mkdtempSync(join(tmpdir(), "corp-jobs-"));
const plugin = join(config, "plugins", "corporations-jobs");
mkdirSync(join(plugin, "data"), { recursive: true });
let text = "";
let serial = 0;
for (const list of jobs.values())
	// Each a mission of its own name (the same job can be offered on several landings).
	for (const [name, body] of list)
		text += `mission "corporations: ${name.replaceAll('"', "'")} #${++serial}"\n\tjob\n` + body.split("\n").map((l) => "\t" + l).join("\n") + "\n\n";
writeFileSync(join(plugin, "data", "jobs.txt"), text);
writeFileSync(join(plugin, "plugin.txt"), 'name "corporations-jobs"\n');
try {
	execFileSync(bin, ["--resources", resources, "--parse-assets", "--config", config], { stdio: "ignore", timeout: 170000 });
} catch {
	// The game exits non-zero when it finds errors anywhere; errors.txt says which.
}
const log = existsSync(join(config, "errors.txt")) ? readFileSync(join(config, "errors.txt"), "utf8") : "";
// Warnings come in blocks: a heading line, then "file <path>" and the lines.
const blocks = log.split(/\n(?=\S+ \S+ \| W \| (?!file |L\d))/).filter((b) => b.includes(plugin));
const missing = ["parts", "escort", "intercept", "relief", "covert plans", "covert sabotage", "tip", "blockade"].filter((k) => !kinds[k]);
console.log(`${[...jobs.values()].reduce((s, l) => s + l.length, 0)} job texts checked by ${bin}: ${blocks.length} warning(s) about them`);
for (const b of blocks) console.log(b.replaceAll(config, "<config>"));
if (missing.length) console.log("kinds not seen (raise the rounds):", missing.join(", "));
rmSync(config, { recursive: true, force: true });
process.exit(blocks.length || missing.length ? 1 : 0);
