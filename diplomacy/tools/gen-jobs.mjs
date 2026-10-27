// Writes data/diplomacy jobs.txt: the faction jobs a member is offered
// on its faction's job boards while it is at war. Run after changing it:
//
//     node mods/diplomacy/tools/gen-jobs.mjs     (from the SDK folder; any folder works)
//
// Every job exists once for each side of each war the mod can start (the Free
// Worlds and the Syndicate never fight), and is offered when the condition
// "diplomacy: member" is the player's faction and "diplomacy: enemy" (which the
// mod keeps) is the faction it is at war with. Kill targets fly under the
// enemy's flotilla government, which the mod makes hostile to members of its
// enemies. A kill pays on the spot, as the game's own bounty jobs do; scouting
// pays on returning. Each job adds merit through "diplomacy: merit".

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "diplomacy jobs.txt");
const TEST_OUT = join(ROOT, "test", "ingame", "plugin", "data", "diplomacy test jobs.txt");

// Indices match the mod's Factions: 1 Republic, 2 Free Worlds, 3 Syndicate.
const FACTIONS = {
	1: {
		government: "Republic",
		adjective: "Republic",
		name: "the Republic",
		service: "the Navy",
		officer: "A Navy intelligence officer",
		ships: { courier: "Flivver", scout: "Raven", medium: "Frigate", large: "Cruiser" },
		names: { small: "republic small", capital: "republic capital" },
		warfleet: "Large Republic",
	},
	2: {
		government: "Free Worlds",
		adjective: "Free Worlds",
		name: "the Free Worlds",
		service: "the Free Worlds militia",
		officer: "A Free Worlds militia captain",
		ships: { courier: "Sparrow", scout: "Hawk (Speedy)", medium: "Osprey (Missile)", large: "Falcon (Heavy)" },
		names: { small: "free worlds small", capital: "free worlds capital" },
		warfleet: "Large Free Worlds",
	},
	3: {
		government: "Syndicate",
		adjective: "Syndicate",
		name: "the Syndicate",
		service: "Syndicate security",
		officer: "A Syndicate security liaison",
		ships: { courier: "Flivver", scout: "Quicksilver", medium: "Manta", large: "Vanguard" },
		names: { small: "syndicate small", capital: "syndicate capital" },
		warfleet: "Large Syndicate",
	},
};

// The wars the mod can start, each seen from both sides: [member, enemy].
const SIDES = [
	[1, 2],
	[2, 1],
	[1, 3],
	[3, 1],
];

// The jobs. `rank` is the member's lowest rank to be offered it ("diplomacy:
// rank": 0 Recruit, 2 Lieutenant, 3 Commander); `chance` is the percent chance
// it is on a given job board; `jumps` how far away the target is.
const JOBS = [
	{
		id: "Courier",
		kind: "kill",
		name: "Intercept <npc>",
		ship: "courier",
		names: "small",
		personality: "timid staying marked target",
		jumps: [1, 3],
		days: 12,
		pay: 60000,
		merit: 3,
		rank: 0,
		chance: 60,
		describe: (e) => `The ${e.adjective} courier <npc> is carrying orders through a system near <system>. Destroy it by <day>. Payment is <payment> on the kill, and it counts toward your merit.`,
		done: (m, e) => `With the <npc> destroyed, its orders will never reach ${e.name}. ${cap(m.service)} transfers <payment> to your account.`,
	},
	{
		id: "Scout Ship",
		kind: "kill",
		name: "Destroy the scout <npc>",
		ship: "scout",
		names: "small",
		personality: "timid staying marked target",
		jumps: [1, 3],
		days: 12,
		pay: 70000,
		merit: 3,
		rank: 0,
		chance: 60,
		describe: (e) => `A fast ${e.adjective} scout, the <npc>, is mapping our defenses from a system near <system>. Destroy it by <day> before it reports back. Payment is <payment> on the kill, and it counts toward your merit.`,
		done: (m, e) => `The <npc> will not be reporting to ${e.name}. ${cap(m.service)} transfers <payment> to your account.`,
	},
	{
		id: "Scout System",
		kind: "scout",
		name: "Scout <waypoints>",
		jumps: [1, 3],
		pay: 40000,
		perJump: 400,
		merit: 4,
		rank: 0,
		chance: 60,
		describe: (e) => `Fly through <waypoints>, held by ${e.name}, and bring what you see back to <planet> by <date>. Payment is <payment>, and it counts toward your merit.`,
		done: (m, e) => `${m.officer} downloads your sensor logs from <waypoints> and pays you <payment>. "That's exactly what we needed on the ${e.adjective} positions."`,
	},
	{
		id: "Medium Warship",
		kind: "kill",
		name: "Destroy the <npc>",
		ship: "medium",
		names: "small",
		personality: "heroic staying marked target",
		jumps: [1, 4],
		days: 15,
		pay: 220000,
		merit: 6,
		rank: 1,
		chance: 45,
		describe: (e) => `The <npc>, a ${e.adjective} warship, is raiding from a system near <system>. Destroy it by <day>. Payment is <payment> on the kill, and it counts toward your merit.`,
		done: (m, e) => `The <npc> is destroyed. ${cap(m.service)} transfers <payment> to your account.`,
	},
	{
		id: "Large Warship",
		kind: "kill",
		name: "Destroy the <npc>",
		ship: "large",
		names: "capital",
		personality: "heroic staying marked target",
		jumps: [1, 4],
		days: 20,
		pay: 600000,
		merit: 12,
		rank: 2,
		chance: 35,
		describe: (e) => `The <npc>, a ${e.adjective} capital ship, is holding a system near <system>. Destroy it by <day>; it will not be alone for long. Payment is <payment> on the kill, and it counts toward your merit.`,
		done: (m, e) => `The <npc> is gone, and the ${e.adjective} line is weaker for it. ${cap(m.service)} transfers <payment> to your account.`,
	},
	{
		id: "Warfleet",
		kind: "fleet",
		name: "Break a warfleet near <system>",
		names: "capital",
		personality: "heroic staying marked target",
		jumps: [1, 4],
		days: 25,
		pay: 1800000,
		merit: 30,
		rank: 3,
		chance: 25,
		describe: (e) => `A ${e.adjective} warfleet, led by the <npc>, is massing in a system near <system>. Destroy every ship in it by <day>. Payment is <payment> when the last one falls, and it counts heavily toward your merit.`,
		done: (m, e) => `The last ship of the warfleet is destroyed. ${cap(m.service)} transfers <payment> to your account, and word of the battle spreads.`,
	},
];

function cap(s) {
	return s[0].toUpperCase() + s.slice(1);
}

function quote(text) {
	// Data-file tokens are quoted with "..." unless they contain a double quote.
	return text.includes('"') ? "`" + text + "`" : `"${text}"`;
}

function mission(mi, ei, job) {
	const m = FACTIONS[mi];
	const e = FACTIONS[ei];
	const lines = [];
	const add = (depth, text) => lines.push("\t".repeat(depth) + text);
	lines.push(`mission "Diplomacy: ${m.government} Job: ${job.id} vs ${e.government}"`);
	add(1, `name ${quote(job.name)}`);
	add(1, "job");
	add(1, "repeat");
	add(1, `description ${quote(job.describe(e))}`);
	if (job.kind === "scout") add(1, "deadline");
	else add(1, `deadline ${job.days}`);
	add(1, "to offer");
	add(2, `"diplomacy: member" == ${mi}`);
	add(2, `"diplomacy: enemy" == ${ei}`);
	if (job.rank > 0) add(2, `"diplomacy: rank" >= ${job.rank}`);
	add(2, `random < ${job.chance}`);
	add(1, "source");
	add(2, `government ${quote(m.government)}`);
	if (job.kind === "scout") {
		add(1, "waypoint");
		add(2, `distance ${job.jumps[0]} ${job.jumps[1]}`);
		add(2, `government ${quote(e.government)}`);
		add(1, "on complete");
		add(2, `payment ${job.pay} ${job.perJump}`);
		add(2, `"diplomacy: merit" += ${job.merit}`);
		add(2, `dialog ${quote(job.done(m, e))}`);
		return lines.join("\n");
	}
	add(1, "npc kill");
	add(2, `government ${quote(e.government + " Flotilla")}`);
	add(2, `personality ${job.personality}`);
	add(2, "system");
	add(3, `distance ${job.jumps[0]} ${job.jumps[1]}`);
	add(3, `government ${quote(e.government)}`);
	if (job.kind === "fleet") {
		add(2, `fleet ${quote(e.warfleet)}`);
	} else {
		add(2, "fleet");
		add(3, `names ${quote(e.names[job.names])}`);
		add(3, "variant");
		add(4, quote(e.ships[job.ship]));
	}
	add(2, "on kill");
	add(3, `payment ${job.pay}`);
	add(3, `"diplomacy: merit" += ${job.merit}`);
	add(3, `dialog ${quote(job.done(m, e))}`);
	add(3, "fail");
	return lines.join("\n");
}

const header = `# Generated by tools/gen-jobs.mjs; do not edit. Faction jobs for members of
# the Republic, the Free Worlds and the Syndicate while their faction is at war:
# intercept a courier, destroy a scout, scout enemy systems, destroy a medium
# warship, destroy a capital ship (Lieutenant and up), and break a warfleet
# (Commander and up). The mod keeps "diplomacy: member", "diplomacy: enemy" and
# "diplomacy: rank"; completing a job adds to "diplomacy: merit".
`;

const out = [header];
for (const [mi, ei] of SIDES) for (const job of JOBS) out.push(mission(mi, ei, job));
writeFileSync(OUT, out.join("\n\n") + "\n");
console.log(`wrote ${OUT}: ${SIDES.length * JOBS.length} jobs`);

// For the in-game test: the Republic's jobs against the Free Worlds, offered
// (and, having no conversation, accepted) on landing instead of on the job
// board, so a test can check that each one finds its target or its waypoints.
const tests = [`# Generated by tools/gen-jobs.mjs from the faction jobs; do not edit.\n# Each is "Diplomacy Test: Republic Job: <job> vs Free Worlds" offered on landing.\n`];
for (const job of JOBS) {
	const text = mission(1, 2, job)
		.replace(/^mission "Diplomacy: /, 'mission "Diplomacy Test: ')
		.replace("\tjob\n\trepeat\n", "\tlanding\n")
		.replace(/\t\trandom < \d+\n/, "");
	tests.push(text);
}
writeFileSync(TEST_OUT, tests.join("\n\n") + "\n");
