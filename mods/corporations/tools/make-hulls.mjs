// Builds src/Hulls.dados, the hull table, from the game's human ship data
// (data/human/ships.txt, kestrel.txt and marauders.txt, variants included):
// each model's owner (a canonical company, or military), its full new price,
// its category, and its hull class, which sets how many a shipyard stocks.
// Also writes test/models.json, the same models for FakeGame.
//
//   node mods/corporations/tools/make-hulls.mjs <endless-sky>/data
//
// Ownership, in order:
//   1. Military: the model needs a Navy or Militia license, or its description
//      names the Navy and no builder. Military hulls have no owner.
//   2. A pirate refit or variant belongs to the owner of the hull it was made
//      from (REFIT_OF, and `ship "Base" "Variant"`).
//   3. The builder its description names first (BUILDERS).
//   4. Otherwise the hand-assigned table HAND below (MILITARY_BY_HAND
//      overrides step 3). A model none of these
//      covers stops the build.
// Then every model any human planet's shipyard may sell must be in the table,
// or the build stops.
import { writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { HUMAN, readAll, readShipyards, planetModels } from "./es-data.mjs";

const root = process.argv[2];
if (!root) throw new Error("usage: make-hulls.mjs <game data folder>");
const HERE = dirname(fileURLToPath(import.meta.url));

// The files the table is read from.
const SHIP_FILES = ["ships.txt", "kestrel.txt", "marauders.txt"];
// Models in those files that are not real hulls.
const SKIP = new Set(["Unknown Ship Type"]);

// Builders as descriptions name them, and the canonical company (Names.dados)
// that owns their designs.
const BUILDERS = [
	[/\bLionheart/, "Lionheart Industries"],
	[/\bTarazed/, "Tarazed Corporation"],
	[/\bBetelgeuse/, "Betelgeuse Shipyards"],
	[/\bSouthbound/, "Southbound Shipyards"],
	[/\bMegaparsec/, "Megaparsec Incorporated"],
	[/\bSyndicated Shipyards/, "Syndicated Shipyards"],
	[/\bSyndicated Systems/, "Syndicated Systems"],
	[/\bTycho Crater/, "Tycho Crater Shipyards"],
	[/\bGemini/, "Gemini Shipyards"],
];
const NAVY = /\bnavy\b/i;
const MILITARY_LICENSE = (l) => /^Navy\b/.test(l) || l === "Militia";

// ---- Judgement calls (listed in HANDOFF.md) ----

// Pirate refits and aftermarket conversions: owned by the owner of the hull
// they were made from, who sells the base hulls and the parts.
const REFIT_OF = {
	"Bulwark": "Bastion",
	"Cutthroat": "Clipper",
	"Mammoth": "Behemoth",
	"Modified Argosy": "Argosy",
	"Nighthawk": "Blackbird",
	"Scrapper": "Shuttle",
	"Valkyrie": "Aerie",
};
// "Marauder X" is a refit of X.
const marauderBase = (m) => (m.startsWith("Marauder ") ? m.slice(9) : null);

// Models whose description names no builder.
const HAND = {
	"Arrow": ["Syndicated Shipyards", "a Syndicate executive transport, sold at Syndicate Advanced"],
	"Boxwing": ["Southbound Shipyards", "a fighter built around the Hauler's Type F pod, sold at Southbound Basics"],
	"Bulk Freighter": ["Syndicated Shipyards", "the Syndicate's freighter line"],
	"Container Transport": ["Syndicated Shipyards", "a Bulk Freighter configuration"],
	"Freighter": ["Syndicated Shipyards", "designed by the Syndicate"],
	"Star Barge": ["Syndicated Shipyards", "the Syndicate CT-50"],
	"Protector": ["Syndicated Shipyards", "Syndicate engineering, sold at Syndicate Advanced"],
	"Mining Drone": ["Syndicated Shipyards", "the Sunder's drone"],
	"Class C Freighter": ["Syndicated Shipyards", "a Syndicate Q-ship (not sold anywhere)"],
	"Flivver": ["Lionheart Industries", "sold at Lionheart Basics"],
	"Saber": ["Lionheart Industries", "a Deep caravan-era design; Lionheart is the Deep's builder"],
	"Hauler": ["Southbound Shipyards", "the Hauler family: Southbound builds its pods (Nest, Roost) and sells all three"],
	"Hauler II": ["Southbound Shipyards", "the Hauler family"],
	"Hauler III": ["Southbound Shipyards", "the Hauler family"],
	"Star Queen": ["Betelgeuse Shipyards", "sold at Betelgeuse Advanced"],
	"Hogshead": ["Tycho Crater Shipyards", "its builder went bankrupt; Tycho Crater, its only shipyard, holds the design"],
	"Enforcer": ["Gemini Shipyards", "a legacy design no longer sold; Gemini has no other hulls"],
};
// Military although a builder's name appears: the Monitor was commissioned by
// the Republic Navy (its description names Betelgeuse only as a government).
const MILITARY_BY_HAND = {
	"Monitor": "commissioned by the Republic Navy",
};

// Hull classes: the stock a shipyard keeps, and how long a restock takes to
// build (base days), by class.
const CLASSES = [
	["CIVIL", "transports and freighters", 4, 12],
	["LIGHT", "interceptors, fighters and drones", 3, 10],
	["WARSHIP", "light, medium and heavy warships", 2, 20],
	["CAPITAL", "anything costing 8 million or more", 1, 45],
];
const CAPITAL_COST = 8000000;
function hullClass(category, cost) {
	if (cost >= CAPITAL_COST) return 3;
	if (["Interceptor", "Fighter", "Drone"].includes(category)) return 1;
	if (/Warship/.test(category)) return 2;
	return 0;
}

// ---- Reading ----

const all = readAll(root);
const ships = new Map(); // model -> { base, file, category, hullCost, outfits, licenses, description }
const outfitCost = new Map();
for (const [file, ls] of all) {
	const human = file.includes(`${"/"}human${"/"}`) && SHIP_FILES.includes(basename(file));
	let cur = null, block = null, outfitList = null;
	for (const [indent, t] of ls) {
		if (indent === 0) {
			cur = null; block = null;
			if (t[0] === "outfit" && t[1]) { cur = { outfit: t[1] }; }
			if (t[0] === "ship" && t[1] && human) {
				const model = t[2] ?? t[1];
				if (SKIP.has(model)) continue;
				cur = { model, base: t[2] ? t[1] : null, file: basename(file), category: null, hullCost: null, outfits: null, licenses: [], description: [] };
				ships.set(model, cur);
			}
			continue;
		}
		if (!cur) continue;
		if (cur.outfit) {
			if (indent === 1 && (t[0] === "cost") && !outfitCost.has(cur.outfit)) outfitCost.set(cur.outfit, Number(t[1]));
			continue;
		}
		if (indent === 1) {
			block = t[0];
			if (t[0] === "description") cur.description.push(t[1]);
			if (t[0] === "outfits") { cur.outfits = new Map(); outfitList = cur.outfits; }
			continue;
		}
		if (block === "attributes" && indent === 2) {
			if (t[0] === "category") cur.category = t[1];
			if (t[0] === "cost") cur.hullCost = Number(t[1]);
		}
		if (block === "attributes" && indent === 3 && cur.inLicenses) cur.licenses.push(t[0]);
		if (block === "attributes" && indent === 2) cur.inLicenses = t[0] === "licenses";
		if (block === "outfits" && indent === 2) outfitList.set(t[0], (outfitList.get(t[0]) ?? 0) + Number(t[1] ?? 1));
	}
}
// Variants take what they don't say from their base.
for (const s of ships.values()) {
	const b = s.base && ships.get(s.base);
	if (!b) continue;
	s.category ??= b.category;
	s.hullCost ??= b.hullCost;
	s.outfits ??= b.outfits;
	if (!s.licenses.length) s.licenses = b.licenses;
	if (!s.description.length) s.description = b.description;
}

// ---- Owners ----

const owners = new Map(); // model -> [owner, how]
function own(model, seen = new Set()) {
	if (owners.has(model)) return owners.get(model);
	if (seen.has(model)) throw new Error(`refit loop at ${model}`);
	seen.add(model);
	const s = ships.get(model);
	if (!s) throw new Error(`no ship "${model}" in the human ship files`);
	const text = s.description.join(" ");
	let result;
	const named = BUILDERS.map(([re, id]) => [text.search(re), id]).filter(([at]) => at >= 0).sort((a, b) => a[0] - b[0]);
	if (s.licenses.some(MILITARY_LICENSE)) result = ["military", `license ${s.licenses.join(", ")}`];
	else if (MILITARY_BY_HAND[model]) result = ["military", `by hand: ${MILITARY_BY_HAND[model]}`];
	else if (s.base) result = [own(s.base, seen)[0], `variant of ${s.base}`];
	else if (REFIT_OF[model] || marauderBase(model)) {
		const base = REFIT_OF[model] ?? marauderBase(model);
		result = [own(base, seen)[0], `refit of ${base}`];
	} else if (named.length) result = [named[0][1], "named in its description"];
	else if (HAND[model]) result = [HAND[model][0], `by hand: ${HAND[model][1]}`];
	else if (NAVY.test(text)) result = ["military", "its description names the Navy"];
	else throw new Error(`no owner for "${model}": add it to HAND in make-hulls.mjs`);
	owners.set(model, result);
	return result;
}

// Read the canonical companies from Names.dados, so a typo here fails.
import { readFileSync } from "node:fs";
const namesSrc = readFileSync(join(HERE, "../src/Names.dados"), "utf8");
const canon = JSON.parse(namesSrc.match(/^\[\]string canon_names = (\[.*\])$/m)[1]);

const table = [];
for (const [model, s] of [...ships].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
	const [owner, how] = own(model);
	if (owner !== "military" && !canon.includes(owner)) throw new Error(`${model}: owner "${owner}" is not a canonical company in Names.dados`);
	let cost = s.hullCost ?? 0;
	for (const [o, n] of s.outfits ?? []) {
		if (!outfitCost.has(o)) throw new Error(`${model}: no cost for outfit "${o}"`);
		cost += outfitCost.get(o) * n;
	}
	if (!s.category) throw new Error(`${model}: no category`);
	table.push({ model, owner, how, cost, category: s.category, cls: hullClass(s.category, cost), licenses: s.licenses, file: s.file });
}

// Hand entries that no longer decide anything are stale: say so.
const stale = [...Object.keys(HAND), ...Object.keys(MILITARY_BY_HAND)].filter((m) => !owners.has(m) || !owners.get(m)[1].startsWith("by hand"));
if (stale.length) throw new Error(`hand-assigned models that the data no longer needs (or has no longer): ${stale.join(", ")}`);

// ---- The check: everything a human shipyard sells is in the table ----

const yards = readShipyards(all);
const humanSystems = new Set();
const planetSystem = new Map();
{
	let kind = null, name = null;
	for (const [, ls] of all) for (const [indent, t] of ls) {
		if (indent === 0) { kind = t[0]; name = t[1]; continue; }
		if (kind === "system" && indent === 1 && t[0] === "government" && HUMAN.has(t[1])) humanSystems.add(name);
		if (kind === "system" && t[0] === "object" && t[1]) planetSystem.set(t[1], name);
	}
}
const inTable = new Set(table.map((h) => h.model));
const missing = new Map();
let shipyardPlanets = 0, pairs = 0;
for (const planet of yards.planetYards.keys()) {
	if (!humanSystems.has(planetSystem.get(planet))) continue;
	const sold = planetModels(yards, planet);
	if (sold.length) shipyardPlanets++;
	pairs += sold.length;
	for (const m of sold) if (!inTable.has(m)) missing.set(m, planet);
}
if (missing.size) throw new Error(`sold at human shipyards but not in the hull table: ${[...missing].map(([m, p]) => `${m} (${p})`).join(", ")}`);

// ---- Writing ----

const q = (s) => JSON.stringify(s);
const out = [];
out.push("class Hulls");
out.push("");
out.push("// GENERATED by tools/make-hulls.mjs from the game's data/human ship files; do");
out.push("// not edit by hand. Run: node mods/corporations/tools/make-hulls.mjs <endless-sky>/data");
out.push("//");
out.push("// Every human ship model: who owns its design (a canonical company's name, or");
out.push("// \"military\"), its full new price (hull and outfits, as a shipyard charges),");
out.push("// its category, and its hull class, which sets the stock a shipyard keeps and");
out.push("// how long a restock takes. A model not in the table is left untracked:");
out.push("// unlimited, as without the mod.");
out.push("");
out.push(`string MILITARY = "military"`);
out.push("");
out.push("// Hull classes: " + CLASSES.map(([n, d], i) => `${i} ${n} (${d})`).join(", ") + ".");
CLASSES.forEach(([n], i) => out.push(`int ${n} = ${i}`));
out.push("// The stock a shipyard keeps of a hull, and the base days a restock takes, by class.");
out.push(`[]int targets = [${CLASSES.map((c) => c[2]).join(", ")}]`);
out.push(`[]int lead_days = [${CLASSES.map((c) => c[3]).join(", ")}]`);
out.push("");
out.push(`[]string models = [${table.map((h) => q(h.model)).join(", ")}]`);
out.push(`[]string owners = [${table.map((h) => q(h.owner)).join(", ")}]`);
out.push(`[]int costs = [${table.map((h) => h.cost).join(", ")}]`);
out.push(`[]string categories = [${table.map((h) => q(h.category)).join(", ")}]`);
out.push(`[]int classes = [${table.map((h) => h.cls).join(", ")}]`);
out.push("");
out.push("// Model -> its row; built on first use.");
out.push("{string: int} rows = {}");
out.push("");
out.push("// The row of a model, or -1 when the table does not know it.");
out.push("int find(string model):");
out.push("    if rows.len() == 0:");
out.push("        for i in 0..<models.len():");
out.push("            rows[models[i]] = i");
out.push("    return rows.get(model, -1)");
out.push("");
out.push("bool military(int row):");
out.push("    return owners[row] == MILITARY");
out.push("");
out.push("int target(int row):");
out.push("    return targets[classes[row]]");
out.push("");
writeFileSync(join(HERE, "../src/Hulls.dados"), out.join("\n"));

const models = {};
for (const h of table) models[h.model] = { cost: h.cost, category: h.category, licenses: h.licenses };
writeFileSync(join(HERE, "../test/models.json"), JSON.stringify(models));

// A summary for HANDOFF.md.
const by = new Map();
for (const h of table) by.set(h.owner, [...(by.get(h.owner) ?? []), h.model]);
console.log(`wrote src/Hulls.dados and test/models.json: ${table.length} models; ${shipyardPlanets} human shipyard planets sell ${pairs} (planet, model) pairs, all in the table`);
for (const [o, ms] of [...by].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${o}: ${ms.length}`);
if (process.argv.includes("--list")) {
	for (const h of table) console.log(`${h.model.padEnd(40)} ${h.owner.padEnd(24)} ${String(h.cost).padStart(9)} ${h.category.padEnd(16)} ${CLASSES[h.cls][0].padEnd(8)} ${h.how}`);
}
