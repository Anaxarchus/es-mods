// Writes test/galaxy.json, the galaxy the tests run on, from the game's data
// files (see loadGalaxy in test/galaxy.mjs: systems, lanes, planets and their
// defense fleets, with the territory of the Free Worlds Veteran start,
// data/diplomacy fw veteran.txt). Run it again after the game's map or the
// start changes:
//
//     node mods/diplomacy/tools/make-galaxy.mjs <endless-sky>/data
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGalaxy, galaxyToJson } from "../test/galaxy.mjs";

const data = process.argv[2];
if (!data) throw new Error("usage: make-galaxy.mjs <game data folder>");
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "galaxy.json");
const galaxy = loadGalaxy(data);
writeFileSync(OUT, JSON.stringify(galaxyToJson(galaxy)) + "\n");
const fw = [...galaxy.systems.values()].filter(s => s.government === "Free Worlds").length;
console.log(`wrote ${OUT}: ${galaxy.systems.size} systems, ${galaxy.planets.size} planets; ${galaxy.events.length} events applied (the Free Worlds Veteran start); the Free Worlds hold ${fw} systems`);
